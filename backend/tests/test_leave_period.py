"""Period edits are exercised without connecting to the operational database."""
from copy import deepcopy
from datetime import datetime, timedelta
from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import Mock
import uuid
from bson import ObjectId
from fastapi import HTTPException
from test_crew_calendar_workflows import load_functions


def matches(record, query):
    for key, expected in query.items():
        if isinstance(expected, dict) and any(str(k).startswith("$") for k in expected):
            if "$in" in expected and record.get(key) not in expected["$in"]:
                return False
            if "$exists" in expected and (key in record) != expected["$exists"]:
                return False
        elif record.get(key) != expected:
            return False
    return True


class Collection:
    def __init__(self, records=()):
        self.records = deepcopy(list(records))
        self.fail_daily = False

    def find(self, query):
        return deepcopy([record for record in self.records if matches(record, query)])

    def find_one(self, query):
        return next(iter(self.find(query)), None)

    def update_one(self, query, update):
        if self.fail_daily:
            self.fail_daily = False
            raise RuntimeError("Simulated database write failure")
        for record in self.records:
            if matches(record, query):
                before = deepcopy(record)
                record.update(update.get("$set", {}))
                for key in update.get("$unset", {}):
                    record.pop(key, None)
                return SimpleNamespace(matched_count=1, modified_count=int(before != record))
        return SimpleNamespace(matched_count=0, modified_count=0)

    def update_many(self, query, update):
        for record in self.find(query):
            self.update_one({"_id": record["_id"]}, update)

    def insert_one(self, record):
        row_id = ObjectId()
        self.records.append(deepcopy({**record, "_id": row_id}))
        return SimpleNamespace(inserted_id=row_id)

    def replace_one(self, query, replacement):
        for index, record in enumerate(self.records):
            if matches(record, query):
                self.records[index] = deepcopy(replacement)
                return

    def delete_many(self, query):
        self.records = [record for record in self.records if not matches(record, query)]


class LeavePeriodTests(TestCase):
    def setUp(self):
        self.actor = {"employeeId": "employee"}
        self.original = {"_id": ObjectId(), "employeeId": "employee", "date": "2026-11-10", "leaveGroupId": "application",
                         "name": "Employee", "leaveType": "CL", "finalStatus": "Applied", "sicApprovalStatus": "Pending",
                         "deptApprovalStatus": "Pending", "reason": "Original", "replacementDecisionHistory": []}
        self.leaves = Collection([self.original])
        self.daily = Collection([{"_id": ObjectId(), "employeeId": "employee", "date": "2026-11-10",
                                  "leaveRequestId": str(self.original["_id"]), "leaveStatus": "Applied", "leaveType": "CL", "assignedDuty": "Morning"},
                                 {"_id": ObjectId(), "employeeId": "employee", "date": "2026-11-11", "assignedDuty": "Evening"}])
        self.credits = Collection()
        self.prepared = [{"date": "2026-11-11", "leaveType": "CL", "stationLeave": False, "stationLeaveOnly": False,
                          "compOffId": None, "groupName": "Group 1", "isShiftEmployee": True}]
        self.prepare = Mock(side_effect=lambda *args: ("employee", {"name": "Employee"}, "Revised", self.prepared))
        self.ctx = load_functions("crew_legacy/api/leave_api.py", {"clean_id", "leave_application_records", "leave_period_is_editable", "edit_leave_period", "update_reviewed_leave"}, {
            "datetime": datetime, "timedelta": timedelta, "uuid": uuid,
            "leave_request_collection": self.leaves, "employee_daily_collection": self.daily,
            "compensatory_off_collection": self.credits, "prepare_leave_applications": self.prepare,
            "employee_id_filter": lambda value: value, "daily_record": lambda emp, day: self.daily.find_one({"employeeId": emp, "date": day}),
            "organization_leave_approval_chain": lambda employee: ([], None),
        })

    def edit(self):
        return self.ctx["edit_leave_period"](str(self.original["_id"]), {"applications": [], "reason": "Revised"}, self.actor)

    def test_owner_only_and_does_not_validate_or_write_for_others(self):
        self.actor["employeeId"] = "other"
        with self.assertRaises(HTTPException) as error:
            self.edit()
        self.assertEqual(error.exception.status_code, 403)
        self.prepare.assert_not_called()
        self.assertEqual(self.leaves.records, [self.original])

    def test_any_approval_or_previous_decision_prevents_edit(self):
        for changes in [{"sicApprovalStatus": "Forwarded"}, {"finalStatus": "Approved"}, {"currentApprovalIndex": 1},
                        {"approvalChain": [{"status": "Approved"}]}, {"rejectionHistory": [{"comment": "Earlier rejection"}]},
                        {"replacementDecisionHistory": [{"stage": "SIC"}]}]:
            self.assertFalse(self.ctx["leave_period_is_editable"]({**self.original, **changes}))

    def test_reviewed_sibling_prevents_whole_application_edit(self):
        self.leaves.records.append({**self.original, "_id": ObjectId(), "date": "2026-11-11", "sicApprovalStatus": "Forwarded"})
        with self.assertRaises(HTTPException) as error:
            self.edit()
        self.assertEqual(error.exception.status_code, 409)
        self.prepare.assert_not_called()

    def test_validated_before_writes_and_scope_comes_from_server(self):
        self.prepare.side_effect = HTTPException(409, "Leave blocked")
        with self.assertRaises(HTTPException):
            self.edit()
        self.assertEqual(self.leaves.records, [self.original])
        self.assertEqual(self.prepare.call_args.args[0]["employeeId"], "employee")
        self.assertEqual(self.prepare.call_args.args[2], [self.original["_id"]])

    def test_move_period_preserves_history_and_restores_old_duty(self):
        result = self.edit()
        self.assertEqual(result["leaveGroupId"], "application")
        old = self.leaves.find_one({"_id": self.original["_id"]})
        self.assertEqual(old["finalStatus"], "Withdrawn")
        self.assertNotEqual(old["leaveGroupId"], "application")
        current = self.leaves.find_one({"date": "2026-11-11", "finalStatus": "Applied"})
        self.assertEqual(current["periodEditHistory"][0]["previousDates"], ["2026-11-10"])
        self.assertNotIn("editToken", current)
        self.assertNotIn("leaveStatus", self.daily.find_one({"date": "2026-11-10"}))
        self.assertEqual(self.daily.find_one({"date": "2026-11-11"})["leaveRequestId"], str(current["_id"]))

    def test_retained_date_keeps_original_record_id(self):
        self.prepared[0]["date"] = self.original["date"]
        self.edit()
        self.assertEqual(len(self.leaves.records), 1)
        self.assertEqual(self.leaves.records[0]["_id"], self.original["_id"])
        self.assertEqual(self.leaves.records[0]["reason"], "Revised")

    def test_failed_duty_write_rolls_back_original_records(self):
        before = deepcopy(self.daily.records)
        self.daily.fail_daily = True
        with self.assertRaises(RuntimeError):
            self.edit()
        self.assertEqual(self.leaves.records, [self.original])
        self.assertEqual(self.daily.records, before)

    def test_approval_after_read_prevents_edit_claim_without_overwriting_approval(self):
        def raced_prepare(*args):
            self.leaves.records[0]["sicApprovalStatus"] = "Forwarded"
            return "employee", {}, "Revised", self.prepared
        self.prepare.side_effect = raced_prepare
        with self.assertRaises(HTTPException) as error:
            self.edit()
        self.assertEqual(error.exception.status_code, 409)
        self.assertEqual(self.leaves.records[0]["sicApprovalStatus"], "Forwarded")

    def test_review_cannot_write_after_edit_claim(self):
        snapshot = deepcopy(self.original)
        self.leaves.records[0].update(finalStatus="Editing", editToken="locked")
        with self.assertRaises(HTTPException):
            self.ctx["update_reviewed_leave"](snapshot, {"$set": {"sicApprovalStatus": "Forwarded"}})
        self.assertEqual(self.leaves.records[0]["sicApprovalStatus"], "Pending")

    def test_removed_coff_reservation_is_released(self):
        credit_id = ObjectId()
        self.original["compOffId"] = str(credit_id)
        self.leaves.records[0]["compOffId"] = str(credit_id)
        self.credits.records.append({"_id": credit_id, "status": "Reserved", "linkedLeaveId": str(self.original["_id"]), "usedDate": self.original["date"]})
        self.edit()
        self.assertEqual(self.credits.records[0]["status"], "Available")
        self.assertNotIn("linkedLeaveId", self.credits.records[0])

    def test_failed_duty_write_restores_reassigned_coff_credit(self):
        credit_id = ObjectId()
        self.original["compOffId"] = str(credit_id)
        self.leaves.records[0]["compOffId"] = str(credit_id)
        credit = {"_id": credit_id, "status": "Reserved", "linkedLeaveId": str(self.original["_id"]), "usedDate": self.original["date"]}
        self.credits.records.append(deepcopy(credit))
        self.prepared[0].update(leaveType="C-OFF", compOffId=str(credit_id))
        self.daily.fail_daily = True
        with self.assertRaises(RuntimeError):
            self.edit()
        self.assertEqual(self.credits.records, [credit])
        self.assertEqual(self.leaves.records, [self.original])

    def test_legacy_contiguous_application_is_resolved_without_client_scope(self):
        self.leaves.records[0].pop("leaveGroupId")
        self.leaves.records.extend([
            {**self.leaves.records[0], "_id": ObjectId(), "date": "2026-11-11"},
            {**self.leaves.records[0], "_id": ObjectId(), "date": "2026-12-20"},
        ])
        records = self.ctx["leave_application_records"](self.leaves.records[0])
        self.assertEqual([record["date"] for record in records], ["2026-11-10", "2026-11-11"])

    def test_shared_validation_only_reuses_credits_owned_by_the_edited_application(self):
        credit_id = ObjectId()
        credit = {"_id": credit_id, "status": "Reserved", "linkedLeaveId": str(self.original["_id"]), "expiryDate": "2026-12-31"}
        requests = Mock(find_one=Mock(return_value=None))
        credits = Mock(find_one=Mock(return_value=credit))
        blocked = Mock()
        context = load_functions("crew_legacy/api/leave_api.py", {"clean_id", "prepare_leave_applications"}, {
            "datetime": datetime, "timedelta": timedelta, "employee_collection": Mock(find_one=Mock(return_value={"userId": "employee"})),
            "leave_request_collection": requests, "compensatory_off_collection": credits,
            "ensure_leave_dates_open": blocked, "is_admin": lambda user: True, "can_apply_for": lambda *args: True,
            "ensure_leave_roster_is_published": Mock(), "is_group_leave_rule_enabled": lambda: False,
            "daily_record": lambda *args: {"groupName": "Group 1", "assignedDuty": "Morning"},
            "shift_group_for_date": lambda *args: True, "map_duty_type": lambda value: value,
            "employee_id_filter": lambda value: value, "calculate_expiry_check": lambda *args: True,
        })
        payload = {"employeeId": "employee", "reason": "Revised", "applications": [{"date": "2026-11-11", "leaveType": "C-OFF", "compOffId": str(credit_id)}]}
        context["prepare_leave_applications"](payload, self.actor, [self.original["_id"]], {str(credit_id): str(self.original["_id"])})
        self.assertEqual(requests.find_one.call_args.args[0]["_id"]["$nin"], [self.original["_id"]])
        blocked.assert_called_once()
        with self.assertRaises(HTTPException):
            context["prepare_leave_applications"](payload, self.actor, [self.original["_id"]], {str(credit_id): "another-application"})
