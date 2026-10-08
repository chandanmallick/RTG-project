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
            {"get_calendar_training", "serialize_nomination", "get_pending", "can_edit_nomination"}, {
                "employee_collection": Mock(find_one=Mock(return_value={"employeeId": "employee"})),
                "can_nominate_target": lambda user, employee: user.get("employeeId") in {"sic", "dic"},
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
        nomination_id, legacy_approved_id, off_id = ObjectId(), ObjectId(), ObjectId()
        training.find.side_effect = [Cursor([{
            "_id": nomination_id, "employeeId": "employee", "trainingName": "Training",
            "startDate": "2026-09-21", "endDate": "2026-09-22", "status": "Pending Approval",
        }, {
            "_id": legacy_approved_id, "employeeId": "employee", "trainingName": "Legacy approved training",
            "trainingDate": "2026-09-20", "status": "Approved", "replacementRequired": True,
        }]), Cursor([{
            "_id": off_id, "employeeId": "employee", "trainingName": "Other training",
            "startDate": "2026-09-21", "endDate": "2026-09-22", "status": "Pending Approval",
            "adjacentOff": {"before": True}, "approvalChain": [{"employeeId": "sic", "name": "SIC"}],
        }])]
        context = load_functions("routes/crew_routes.py", {"calendar_view", "employee_id"}, {
            "datetime": datetime, "timedelta": timedelta, "defaultdict": defaultdict,
            "rosters": rosters, "employee_daily": daily, "leave_requests": leaves,
            "holiday_master_collection": Mock(find=Mock(return_value=[{"date": "2026-09-21", "holidayName": "New holiday after publication"}])),
            "sports_application_collection": sports, "training_nomination_history_collection": training,
        })
        result = context["calendar_view"]("2026-09-20", "2026-09-21")
        duties = result[0]["employees"][0]["duties"]
        self.assertEqual(duties["2026-09-20"]["shift"], "Evening")
        self.assertEqual(duties["2026-09-20"]["trainingAdjacentOffRequestId"], str(off_id))
        self.assertEqual(duties["2026-09-21"]["shift"], "Morning")
        self.assertTrue(duties["2026-09-21"]["isHoliday"])
        self.assertEqual(duties["2026-09-21"]["holidayName"], "New holiday after publication")
        self.assertFalse(duties["2026-09-20"]["isHoliday"])
        self.assertEqual(duties["2026-09-21"]["trainingStatus"], "Pending Approval")
        self.assertEqual(duties["2026-09-21"]["trainingNominationId"], str(nomination_id))
        self.assertEqual(duties["2026-09-20"]["trainingStatus"], "Approved")
        self.assertEqual(duties["2026-09-20"]["trainingNominationId"], str(legacy_approved_id))
        self.assertTrue(duties["2026-09-20"]["replacementRequired"])
        query = training.find.call_args_list[0].args[0]
        self.assertEqual(query["status"]["$options"], "i")
        self.assertIn("Approved", query["status"]["$regex"])

    def test_event_calendar_combines_holidays_training_and_sports(self):
        holiday_id, training_id, sports_id = ObjectId(), ObjectId(), ObjectId()
        context = load_functions("routes/crew_routes.py", {"calendar_events"}, {
            "datetime": datetime,
            "holiday_master_collection": Mock(find=Mock(return_value=[{
                "_id": holiday_id, "date": "2026-09-21", "holidayName": "Holiday", "type": "National",
            }])),
            "training_master_collection": Mock(find=Mock(return_value=[{
                "_id": training_id, "startDate": "2026-09-20", "endDate": "2026-09-22",
                "trainingName": "System training", "location": "Kolkata",
            }])),
            "sports_event_collection": Mock(find=Mock(return_value=[{
                "_id": sports_id, "startDate": "2026-09-23", "endDate": "2026-09-24",
                "name": "Football", "venue": "Ground",
            }])),
        })
        result = context["calendar_events"]("2026-09-20", "2026-09-24")
        self.assertEqual([item["kind"] for item in result], ["training", "holiday", "sports"])
        self.assertEqual(result[1]["title"], "Holiday")


class ReplacementValidationTests(unittest.TestCase):
    def test_unknown_leave_replacement_preserves_existing_assignment(self):
        leave_id = ObjectId()
        leaves, employees, daily, release = Mock(), Mock(), Mock(), Mock()
        existing_leave = {
            "_id": leave_id, "employeeId": "absent", "date": "2026-09-20",
            "finalStatus": "Approved", "replacement": {"employeeId": "existing"},
        }
        leaves.find_one.side_effect = lambda query: existing_leave if "_id" in query else None
        employees.find_one.return_value = None
        daily.find_one.return_value = None
        context = load_functions("crew_legacy/api/replacement.py", {"assign_replacement"}, {
            "leave_request_collection": leaves, "employee_collection": employees,
            "employee_daily_collection": daily, "release_replacement_assignment": release,
            "require_replacement_authority": lambda *args: None,
            "ACTIVE_LEAVE_STATUSES": {"Applied", "Forwarded", "Forwarded by SIC", "Approved"},
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


class ActingSICCandidateTests(unittest.TestCase):
    def test_same_shift_staff_can_be_designated_without_replacement_or_existing_sic_role(self):
        leave_id = ObjectId()
        leave = {"_id": leave_id, "employeeId": "absent-sic", "date": "2026-10-10", "groupName": "A", "assignedDuty": "Morning"}
        people = [
            {"employeeId": "engineer", "assignedDuty": "M1"},
            {"employeeId": "qualified", "assignedDuty": "Morning"},
            {"employeeId": "other-shift", "assignedDuty": "Night"},
            {"employeeId": "off", "assignedDuty": "Off"},
            {"employeeId": "experienced", "assignedDuty": "Morning"},
        ]
        master = Mock()
        master.find_one.side_effect = lambda query: {"isIC": query["$or"][0]["userId"] in {"qualified", "other-shift", "off"}}
        daily = Mock(find=Mock(return_value=people), find_one=Mock(return_value={"assignedDuty": "Morning"}))
        ctx = load_functions("crew_legacy/api/replacement.py", {"get_sic_candidates"}, {
            "get_current_user": lambda: None, "check_replacement_access": Mock(), "require_replacement_authority": Mock(),
            "leave_request_collection": Mock(find_one=Mock(return_value=leave), find=Mock(return_value=[])), "employee_daily_collection": daily,
            "employee_collection": master, "ACTIVE_LEAVE_STATUSES": ["Applied", "Approved"],
            "historical_shift_roles": lambda: {"experienced": {"sic"}}, "active_shift_memberships": lambda: {},
            "normalized_duty": lambda value: str(value or "").upper(), "SHIFT_DUTIES": {"MORNING", "EVENING", "NIGHT"},
            "normalized_categories": lambda value: value, "category_matches": lambda *args: False,
        })
        candidates = ctx["get_sic_candidates"](str(leave_id), {"role": "admin"})
        self.assertEqual([item["employeeId"] for item in candidates], ["engineer", "qualified", "experienced"])
        fleet = ctx["get_sic_candidates"](str(leave_id), {"role": "admin"}, scope="fleet")
        self.assertEqual([item["employeeId"] for item in fleet], [item["employeeId"] for item in people])
        self.assertNotIn("groupName", daily.find.call_args.args[0])
        ctx["leave_request_collection"].find.return_value = [{"employeeId": "off"}, {"employeeId": "qualified"}]
        available = ctx["get_sic_candidates"](str(leave_id), {"role": "admin"}, scope="fleet")
        self.assertEqual([item["employeeId"] for item in available], ["engineer", "other-shift", "experienced"])
        with self.assertRaises(HTTPException):
            ctx["get_sic_candidates"](str(leave_id), {"role": "admin"}, scope="invalid")
        ctx["leave_request_collection"].find.return_value = []
        ctx["get_sic_candidates"](str(leave_id), {"role": "admin"})
        query = daily.find.call_args.args[0]
        self.assertEqual(query["groupName"], "A")
        self.assertEqual(query["date"], "2026-10-10")
        self.assertEqual(query["leaveStatus"]["$nin"], ["Applied", "Approved"])


class ActingSICCoverageTests(unittest.TestCase):
    def test_pending_queue_keeps_uncovered_and_junior_replacement_days(self):
        leaves = [{"_id": ObjectId(), "employeeId": "pranab", "name": "Pranab Debnath", "groupName": "Group-1", "date": "2026-10-18", "replacementRequired": False},
                  {"_id": ObjectId(), "employeeId": "pranab", "name": "Pranab Debnath", "groupName": "Group-1", "date": "2026-10-19", "replacement": {"employeeId": "junior"}}]
        ctx = load_functions("crew_legacy/api/replacement.py", {"pending_sic"}, {
            "get_current_user": lambda: None, "check_replacement_access": Mock(), "has_replacement_authority": lambda *args: True,
            "datetime": datetime, "timedelta": timedelta, "ACTIVE_LEAVE_STATUSES": {"Approved"},
            "leave_request_collection": Mock(find=Mock(return_value=leaves)),
            "employee_daily_collection": Mock(find_one=Mock(side_effect=lambda query: None if "isActingSIC" in query else {"assignedDuty": "Morning"})),
            "leave_requires_sic": lambda leave, daily: leave["employeeId"] == "pranab",
        })
        rows = ctx["pending_sic"]({"role": "admin"})
        self.assertEqual(len(rows), 2)
        self.assertFalse(rows[0]["replacementAssigned"])
        self.assertTrue(rows[1]["replacementAssigned"])
        self.assertTrue(all(row["isSIC"] for row in rows))

    def test_missing_daily_sic_flag_uses_active_roster(self):
        ctx = load_functions("crew_legacy/api/replacement.py", {"leave_requires_sic"}, {
            "group_shift_in_charge_ids": lambda *args: [],
            "roster_group_collection": Mock(find_one=Mock(return_value={"shiftInCharge": {"employeeId": "pranab"}})),
        })
        self.assertTrue(ctx["leave_requires_sic"]({"employeeId": "pranab", "date": "2026-10-18", "groupName": "Group-1"}, {}))


class ActingSICSaveTests(unittest.TestCase):
    def test_fleet_assignment_preserves_roster_and_records_target_group(self):
        leave_id = ObjectId()
        leave = {"_id": leave_id, "employeeId": "pranab", "name": "Pranab", "date": "2026-10-18", "groupName": "Group-1"}
        daily = Mock(find_one=Mock(return_value={"employeeId": "senior", "groupName": "Group-2", "assignedDuty": "Off"}))
        candidates = Mock(return_value=[{"employeeId": "senior"}])
        audit = Mock()
        ctx = load_functions("crew_legacy/api/replacement.py", {"assign_sic"}, {
            "leave_request_collection": Mock(find_one=Mock(return_value=leave)), "employee_daily_collection": daily,
            "employee_collection": Mock(find_one=Mock(return_value={"userId": "senior", "name": "Senior", "designation": "Engineer"})),
            "require_replacement_authority": Mock(), "get_sic_candidates": candidates,
            "ACTIVE_LEAVE_STATUSES": {"Approved"}, "datetime": datetime, "duty_switch_collection": audit,
        })
        result = ctx["assign_sic"](str(leave_id), {"sicEmployeeId": "senior", "scope": "fleet"}, {"employeeId": "50041"})
        self.assertEqual(result["actingSIC"]["groupName"], "Group-1")
        candidates.assert_called_once_with(str(leave_id), {"employeeId": "50041"}, scope="fleet")
        marker = daily.update_one.call_args.args[1]["$set"]
        self.assertEqual(marker["actingSICGroup"], "Group-1")
        self.assertNotIn("assignedDuty", marker)
        self.assertNotIn("groupName", marker)
        self.assertEqual(audit.insert_one.call_args.args[0]["updated"]["assignedDuty"], "Off")
        daily.reset_mock()
        with self.assertRaises(HTTPException):
            ctx["assign_sic"](str(leave_id), {"sicEmployeeId": "senior"}, {"employeeId": "50041"})
        daily.update_one.assert_not_called()
