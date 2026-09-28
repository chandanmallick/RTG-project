"""Mutation regressions without connecting to the operational database."""
from datetime import datetime, timedelta
from typing import Optional
import unittest
from unittest.mock import Mock

from bson import ObjectId
from fastapi import HTTPException
from test_crew_calendar_workflows import load_functions


class NominationChanges(unittest.TestCase):
    def setUp(self):
        self.record = {"_id": ObjectId(), "employeeId": "100", "employeeName": "Alice",
                       "status": "Approved", "startDate": "2026-10-01", "endDate": "2026-10-02",
                       "workflowKind": "Training", "trainingName": "Safety", "updatedOn": datetime(2026, 9, 1)}
        self.records = Mock()
        self.records.find_one.side_effect = lambda query: self.record if isinstance(query.get("_id"), ObjectId) else None
        self.records.find.return_value = []
        self.records.update_one.return_value = Mock(modified_count=1)
        self.daily = Mock()
        self.daily.find.return_value = []
        self.daily.find_one.return_value = None
        self.leave = Mock(find_one=Mock(return_value=None))
        self.employees = Mock(find_one=Mock(return_value={"employeeId": "100", "name": "Alice", "designation": "Engineer"}))
        self.ctx = load_functions("crew_legacy/api/training_assignment.py", {
            "can_edit_nomination", "change_nomination", "release_nomination_effects", "validate_nomination_change", "date_range",
        }, {"datetime": datetime, "timedelta": timedelta, "PENDING_STATUSES": {"Pending Approval", "Nominated"},
            "clean_id": lambda value: str(value or ""), "is_training_hr": lambda user: user.get("hr", False),
            "can_nominate_target": lambda user, employee: user.get("role") == "admin" or user.get("employeeId") == employee["employeeId"],
            "employee_collection": self.employees, "training_nomination_history_collection": self.records,
            "employee_daily_collection": self.daily, "leave_request_collection": self.leave,
            "employee_snapshot": lambda employee: employee, "shift_group_context": lambda _: {},
            "approval_chain": lambda _: [{"employeeId": "manager", "status": "Pending"}],
            "hr_final_step": lambda: {"employeeId": "HR", "status": "Pending"}})

    def change(self, **overrides):
        return self.ctx["change_nomination"](str(self.record["_id"]), {
            "revision": 0, "reason": "Programme rescheduled", "startDate": "2026-10-04", "endDate": "2026-10-05", **overrides,
        }, {"employeeId": "admin", "role": "admin"})

    def test_owner_cannot_modify_approved_but_can_modify_pending(self):
        owner = {"employeeId": "100"}
        self.assertFalse(self.ctx["can_edit_nomination"](owner, self.record))
        self.record["status"] = "Pending Approval"
        self.assertTrue(self.ctx["can_edit_nomination"](owner, self.record))
        self.assertFalse(self.ctx["can_edit_nomination"]({"employeeId": "stranger"}, self.record))

    def test_leave_conflict_rejected_before_any_mutation(self):
        self.leave.find_one.return_value = {"finalStatus": "Approved"}
        with self.assertRaises(HTTPException) as error:
            self.change()
        self.assertEqual(error.exception.status_code, 409)
        self.records.update_one.assert_not_called()
        self.daily.update_one.assert_not_called()

    def test_stale_revision_rejected_without_calendar_changes(self):
        with self.assertRaises(HTTPException) as error:
            self.change(revision=8)
        self.assertEqual(error.exception.status_code, 409)
        self.daily.update_many.assert_not_called()

    def test_change_restarts_approval_and_marks_new_dates(self):
        self.change()
        update = self.records.update_one.call_args.args[1]
        self.assertEqual(update["$set"]["status"], "Pending Approval")
        self.assertEqual(update["$set"]["startDate"], "2026-10-04")
        self.assertEqual(update["$inc"]["revision"], 1)
        self.assertEqual(update["$push"]["changeHistory"]["previousStartDate"], "2026-10-01")
        self.assertEqual(self.daily.update_one.call_count, 2)

    def test_remove_keeps_audit_and_cancels_linked_off(self):
        child = {"_id": ObjectId(), "workflowKind": "Adjacent OFF", "status": "Approved"}
        self.records.find.return_value = [child]
        self.change(action="cancel")
        self.assertEqual(self.records.update_one.call_args.args[1]["$set"]["status"], "Cancelled")
        self.records.delete_one.assert_not_called()
        child_update = self.records.update_one.call_args_list[1].args
        self.assertEqual(child_update[0]["_id"], child["_id"])
        self.assertEqual(child_update[1]["$set"]["status"], "Cancelled")

    def test_cleanup_restores_prior_duty_without_deleting_rows(self):
        daily_id = ObjectId()
        self.daily.find.side_effect = [[{"_id": daily_id, "trainingOriginalAssignment": {
            "assignedDuty": "Morning", "actualStatus": "Present", "groupName": "A"}}], [], []]
        self.ctx["release_nomination_effects"](self.record)
        query, update = self.daily.update_one.call_args.args
        self.assertEqual(query["trainingFinal.nominationId"], str(self.record["_id"]))
        self.assertEqual(update["$set"]["assignedDuty"], "Morning")
        self.assertEqual(update["$set"]["actualStatus"], "Present")
        self.daily.delete_one.assert_not_called()

    def test_interrupted_cleanup_is_marked_retryable(self):
        self.daily.update_many.side_effect = RuntimeError("Connection interrupted")
        with self.assertRaises(HTTPException) as error:
            self.change(action="cancel")
        self.assertEqual(error.exception.status_code, 503)
        self.assertTrue(self.records.update_one.call_args.args[1]["$set"]["mutationFailed"])

    def test_concurrent_claim_rejected(self):
        self.records.update_one.return_value.modified_count = 0
        with self.assertRaises(HTTPException) as error:
            self.change(action="cancel")
        self.assertEqual(error.exception.status_code, 409)
        self.daily.update_many.assert_not_called()


class OtherEmployeeLeaveTests(unittest.TestCase):
    def test_hierarchy_can_cancel_but_unrelated_employee_cannot(self):
        context = load_functions("crew_legacy/api/leave_api.py", {"cancellation_role"}, {
            "Optional": Optional, "clean_id": lambda value: str(value or ""),
            "is_admin": lambda user: user.get("role") == "admin",
            "is_organization_leave": lambda leave: True,
            "organization_step_actor": lambda user, step: (user["employeeId"] == step["employeeId"], ""),
            "leave_authority_ids": lambda _: [], "sic_record_for": lambda *args: None,
        })
        leave = {"employeeId": "owner", "approvalChain": [{"employeeId": "manager"}]}
        self.assertEqual(context["cancellation_role"]({"employeeId": "manager"}, leave), "Reporting Authority")
        self.assertEqual(context["cancellation_role"]({"employeeId": "owner"}, leave), "Employee")
        self.assertIsNone(context["cancellation_role"]({"employeeId": "stranger"}, leave))


if __name__ == "__main__":
    unittest.main()
