from datetime import date, datetime
import unittest
from unittest.mock import Mock, patch
import types
from bson import ObjectId
from fastapi import HTTPException
from test_crew_calendar_workflows import load_functions, Cursor

class SpecialEventTests(unittest.TestCase):
    def setUp(self):
        self.units = Mock()
        self.units.find.return_value = Cursor([{"_id": "dept-a", "name": "Operations", "headEmployeeIds": ["hod-a"]}, {"_id": "dept-b", "name": "HR", "headEmployeeIds": ["hod-b"]}])
        self.settings = Mock()
        self.helpers = load_functions("crew_legacy/api/leave_api.py", {"is_admin", "clean_id", "validate_block_dates", "ensure_leave_dates_open"}, {"date": date, "datetime": datetime, "system_settings_collection": self.settings})
        self.ctx = load_functions("crew_legacy/api/special_events.py", {"event_access", "require_scope", "mark_event", "block_event", "event_document", "list_events"}, {**self.helpers, "organization_unit_collection": self.units, "system_settings_collection": self.settings, "employee_collection": Mock(), "department_ids": lambda employee: set(employee.get("departmentIds", []))})
        self.hod = {"employeeId": "hod-a", "role": "employee"}
        self.data = {"title": "Operational event", "startDate": "2026-10-20", "endDate": "2026-10-25", "submissionDeadline": "2026-10-18", "departmentIds": ["dept-a"]}

    def test_announcement_does_not_block_leave(self):
        self.ctx["mark_event"](self.data, self.hod)
        doc = self.settings.insert_one.call_args.args[0]
        self.assertFalse(doc["leaveBlocked"])
        self.assertEqual(doc["submissionDeadline"], "2026-10-18")
        self.settings.find.return_value = Cursor([doc])
        self.helpers["ensure_leave_dates_open"](["2026-10-20"], {"departmentIds": ["dept-a"]})

    def test_hod_cannot_target_other_department_or_all(self):
        for scope in [[], ["dept-b"], ["dept-a", "dept-b"]]:
            with self.assertRaises(HTTPException) as error:
                self.ctx["mark_event"]({**self.data, "departmentIds": scope}, self.hod)
            self.assertEqual(error.exception.status_code, 403)
        self.settings.insert_one.assert_not_called()

    def test_admin_can_target_all_or_selected_departments(self):
        for scope in [[], ["dept-b"]]:
            self.ctx["mark_event"]({**self.data, "departmentIds": scope}, {"role": "admin"})
        self.assertEqual(self.settings.insert_one.call_count, 2)

    def test_invalid_deadline_and_department_shape(self):
        for data in [{**self.data, "submissionDeadline": "2026-10-21"}, {**self.data, "departmentIds": "dept-a"}]:
            with self.assertRaises(HTTPException) as error:
                self.ctx["mark_event"](data, self.hod)
            self.assertEqual(error.exception.status_code, 400)

    def test_blocking_requires_same_scope_and_records_audit(self):
        item = {**self.data, "_id": ObjectId(), "type": "leave_block", "leaveBlocked": False}
        self.settings.find_one.return_value = item
        self.ctx["block_event"](str(item["_id"]), {"blocked": True}, self.hod)
        change = self.settings.update_one.call_args.args[1]
        self.assertTrue(change["$set"]["leaveBlocked"])
        self.assertEqual(change["$push"]["eventAudit"]["actor"], "hod-a")
        with self.assertRaises(HTTPException):
            self.ctx["block_event"](str(item["_id"]), {"blocked": True}, {"employeeId": "hod-b"})

    def test_scoped_block_enforced_only_for_target_department(self):
        self.settings.find.return_value = Cursor([{**self.data, "leaveBlocked": True}])
        helper = types.ModuleType("crew_legacy.api.special_events")
        helper.department_ids = lambda employee: set(employee.get("departmentIds", []))
        with patch.dict("sys.modules", {"crew_legacy.api.special_events": helper}):
            self.helpers["ensure_leave_dates_open"](["2026-10-20"], {"departmentIds": ["dept-b"]})
            with self.assertRaises(HTTPException) as error:
                self.helpers["ensure_leave_dates_open"](["2026-10-20"], {"departmentIds": ["dept-a"]})
            self.assertEqual(error.exception.status_code, 409)

    def test_employee_only_sees_own_department_events(self):
        self.settings.find.return_value = Cursor([{**self.data, "_id": ObjectId(), "departmentIds": ["dept-a"]}, {**self.data, "_id": ObjectId(), "departmentIds": ["dept-b"]}, {**self.data, "_id": ObjectId(), "departmentIds": []}])
        self.ctx["employee_collection"].find_one.return_value = {"departmentIds": ["dept-a"]}
        rows = self.ctx["list_events"]({"employeeId": "employee-a"})
        self.assertEqual(len(rows), 2)

if __name__ == "__main__": unittest.main()
