"""Calendar workflow regressions, isolated from live database and mail startup.

Run: python -m unittest discover -s backend/tests -p test_crew_calendar_workflows.py
"""
import ast
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path
import unittest
from unittest.mock import Mock

from bson import ObjectId
from fastapi import Depends, HTTPException, Query


ROOT = Path(__file__).resolve().parents[1]


def load_functions(path, names, context):
    # Importing these legacy modules creates database indexes. Load the actual
    # functions without module startup so tests cannot touch operational data.
    tree = ast.parse((ROOT / path).read_text(encoding="utf-8-sig"))
    nodes = [node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name in names]
    for node in nodes:
        node.decorator_list = []
    context.update(ObjectId=ObjectId, HTTPException=HTTPException, Query=Query,
                   Depends=Depends, get_authenticated_user=lambda: None)
    exec(compile(ast.Module(body=nodes, type_ignores=[]), str(path), "exec"), context)
    return context


class Cursor(list):
    def sort(self, *args):
        return self


class TrainingReviewTests(unittest.TestCase):
    def setUp(self):
        self.record = {
            "_id": ObjectId(), "employeeId": "employee", "employeeName": "Employee",
            "workflowKind": "Training", "status": "Pending Approval",
            "startDate": "2026-09-21", "endDate": "2026-09-22",
            "approvalChain": [
                {"employeeId": "sic", "name": "SIC", "status": "Pending"},
                {"employeeId": "dic", "name": "DIC", "status": "Pending"},
            ], "currentApprovalIndex": 0,
        }
        self.collection = Mock()
        self.collection.find_one.side_effect = lambda query: self.record if "_id" in query else None
        self.context = load_functions("crew_legacy/api/training_assignment.py",
            {"get_calendar_training", "serialize_nomination", "get_pending"}, {
                "clean_id": lambda value: str(value or "").strip(),
                "PENDING_STATUSES": {"Pending Approval", "Nominated"},
                "TRAINING_HR_POOL_ID": "TRAINING_HR_POOL",
                "training_nomination_history_collection": self.collection,
                "has_training_permission": lambda user, permission: permission in user.get("permissions", []),
                "is_training_hr": lambda user: "approve" in user.get("permissions", []),
                "shift_group_context": lambda emp: {},
                "training_financial_year_summary": lambda *args: {"days": 0, "history": []},
            })

    def review(self, actor, permissions=(), role="employee"):
        return self.context["get_calendar_training"](str(self.record["_id"]), {
            "employeeId": actor, "permissions": permissions, "role": role,
        })

    def test_only_current_stage_can_approve(self):
        self.assertTrue(self.review("sic")["canApprove"])
        self.assertFalse(self.review("dic")["canApprove"])
        self.assertFalse(self.review("employee")["canApprove"])

    def test_outsider_cannot_read_private_training_review(self):
        with self.assertRaises(HTTPException) as error:
            self.review("outsider")
        self.assertEqual(error.exception.status_code, 403)

    def test_view_permission_does_not_grant_approval_or_replacement(self):
        result = self.review("viewer", ["view"])
        self.assertFalse(result["canApprove"])
        self.assertFalse(result["canManageReplacement"])

    def test_approved_owner_can_request_off_but_cannot_assign_cover(self):
        self.record["status"] = "Approved"
        result = self.review("employee")
        self.assertTrue(result["canRequestAdjacentOff"])
        self.assertFalse(result["canManageReplacement"])
        self.assertTrue(self.review("manager", ["write"])["canManageReplacement"])

    def test_existing_off_request_cannot_be_submitted_twice(self):
        self.record["status"] = "Approved"
        linked = {**self.record, "_id": ObjectId(), "workflowKind": "Adjacent OFF", "status": "Pending Approval"}
        self.collection.find_one.side_effect = lambda query: self.record if "_id" in query else linked
        self.assertFalse(self.review("employee")["canRequestAdjacentOff"])

    def test_off_requests_never_offer_training_replacement(self):
        self.record.update(status="Approved", workflowKind="Adjacent OFF")
        result = self.review("manager", ["write"])
        self.assertFalse(result["canManageReplacement"])
        self.assertFalse(result["canRequestAdjacentOff"])

    def test_hr_pool_can_approve_without_individual_chain_entry(self):
        self.record["approvalChain"] = [{"employeeId": "TRAINING_HR_POOL", "name": "HR", "status": "Pending"}]
        self.assertTrue(self.review("hr", ["approve"])["canApprove"])
        self.assertFalse(self.review("viewer", ["view"])["canApprove"])

    def test_pending_inbox_retains_later_stage_visibility(self):
        self.collection.find.return_value = Cursor([self.record])
        result = self.context["get_pending"]({"employeeId": "dic", "role": "employee"})
        self.assertEqual(self.collection.find.call_args.args[0]["approvalChain.employeeId"], "dic")
        self.assertFalse(result[0]["canApprove"])


class CalendarOverlayTests(unittest.TestCase):
    def test_pending_training_and_off_keep_rostered_duties_and_references(self):
        employee = {"employeeId": "employee", "name": "Employee"}
        rosters = Mock()
        rosters.find.return_value = Cursor([{"groupDetails": [{"groupName": "Group-1", "members": [employee]}]}])
        daily = Mock()
        daily.find.side_effect = [
            [{**employee, "date": "2026-09-20", "assignedDuty": "Evening"},
             {**employee, "date": "2026-09-21", "assignedDuty": "Morning"}], []]
        leaves, sports, training = Mock(), Mock(), Mock()
        leaves.find.return_value = []
        sports.find.return_value = []
        nomination_id, off_id = ObjectId(), ObjectId()
        training.find.side_effect = [Cursor([{
            "_id": nomination_id, "employeeId": "employee", "trainingName": "Training",
            "startDate": "2026-09-21", "endDate": "2026-09-22", "status": "Pending Approval",
        }]), Cursor([{
            "_id": off_id, "employeeId": "employee", "trainingName": "Other training",
            "startDate": "2026-09-21", "endDate": "2026-09-22", "status": "Pending Approval",
            "adjacentOff": {"before": True}, "approvalChain": [{"employeeId": "sic", "name": "SIC"}],
        }])]
        context = load_functions("routes/crew_routes.py", {"calendar_view", "employee_id"}, {
            "datetime": datetime, "timedelta": timedelta, "defaultdict": defaultdict,
            "rosters": rosters, "employee_daily": daily, "leave_requests": leaves,
            "sports_application_collection": sports, "training_nomination_history_collection": training,
        })
        result = context["calendar_view"]("2026-09-20", "2026-09-21")
        duties = result[0]["employees"][0]["duties"]
        self.assertEqual(duties["2026-09-20"]["shift"], "Evening")
        self.assertEqual(duties["2026-09-20"]["trainingAdjacentOffRequestId"], str(off_id))
        self.assertEqual(duties["2026-09-21"]["shift"], "Morning")
        self.assertEqual(duties["2026-09-21"]["trainingStatus"], "Pending Approval")
        self.assertEqual(duties["2026-09-21"]["trainingNominationId"], str(nomination_id))
        query = training.find.call_args_list[0].args[0]
        self.assertNotIn("Rejected", query["status"]["$in"])


class ReplacementValidationTests(unittest.TestCase):
    def test_unknown_leave_replacement_preserves_existing_assignment(self):
        leave_id = ObjectId()
        leaves, employees, daily, release = Mock(), Mock(), Mock(), Mock()
        leaves.find_one.return_value = {
            "_id": leave_id, "employeeId": "absent", "date": "2026-09-20",
            "finalStatus": "Approved", "replacement": {"employeeId": "existing"},
        }
        employees.find_one.return_value = None
        daily.find_one.return_value = None
        context = load_functions("crew_legacy/api/replacement.py", {"assign_replacement"}, {
            "leave_request_collection": leaves, "employee_collection": employees,
            "employee_daily_collection": daily, "release_replacement_assignment": release,
            "require_replacement_authority": lambda *args: None,
        })
        with self.assertRaises(HTTPException) as error:
            context["assign_replacement"](str(leave_id), {"replacementEmployeeId": "missing"}, {"role": "admin"})
        self.assertEqual(error.exception.status_code, 404)
        release.assert_not_called()
        leaves.update_one.assert_not_called()

    def test_pending_leave_cannot_be_assigned_cover(self):
        leaves, release = Mock(), Mock()
        leaves.find_one.return_value = {"finalStatus": "Applied", "employeeId": "absent"}
        context = load_functions("crew_legacy/api/replacement.py", {"assign_replacement"}, {
            "leave_request_collection": leaves, "release_replacement_assignment": release,
            "require_replacement_authority": lambda *args: None,
        })
        with self.assertRaises(HTTPException) as error:
            context["assign_replacement"](str(ObjectId()), {"replacementEmployeeId": "candidate"}, {"role": "admin"})
        self.assertEqual(error.exception.status_code, 409)
        release.assert_not_called()

    def test_invalid_leave_mode_rejected_before_database_access(self):
        leaves = Mock()
        context = load_functions("crew_legacy/api/replacement.py", {"assign_replacement"}, {"leave_request_collection": leaves})
        with self.assertRaises(HTTPException) as error:
            context["assign_replacement"](str(ObjectId()), {"replacementEmployeeId": "candidate", "mode": "invalid"}, {})
        self.assertEqual(error.exception.status_code, 400)
        leaves.find_one.assert_not_called()

    def test_invalid_training_mode_preserves_existing_assignment(self):
        nomination_id = ObjectId()
        nominations, employees, release = Mock(), Mock(), Mock()
        nominations.find_one.return_value = {
            "_id": nomination_id, "employeeId": "trainee", "workflowKind": "Training",
            "status": "Approved", "replacementEmployee": {"employeeId": "existing"},
        }
        employees.find_one.return_value = {"userId": "new", "name": "New employee"}
        context = load_functions("crew_legacy/api/training_assignment.py", {"assign_training_replacement"}, {
            "training_nomination_history_collection": nominations, "employee_collection": employees,
            "release_training_replacement": release, "clean_id": lambda value: str(value or "").strip(),
        })
        with self.assertRaises(HTTPException) as error:
            context["assign_training_replacement"](str(nomination_id), {"replacementEmployeeId": "new", "mode": "invalid"}, {"role": "admin"})
        self.assertEqual(error.exception.status_code, 400)
        release.assert_not_called()
        nominations.update_one.assert_not_called()


if __name__ == "__main__":
    unittest.main()
