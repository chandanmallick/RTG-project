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

    def test_matrix_endpoint_returns_grid(self):
        from crew_legacy.api.special_events import get_special_roster_matrix
        with patch("crew_legacy.api.special_events.employee_daily_collection") as mock_daily, \
             patch("crew_legacy.api.special_events.leave_request_collection") as mock_leave, \
             patch("crew_legacy.api.special_events.organization_unit_collection") as mock_unit, \
             patch("crew_legacy.api.special_events.employee_collection") as mock_emp:
            mock_daily.find.return_value = [
                {"date": "2026-10-20", "employeeId": "emp-1", "name": "Alice", "assignedDuty": "Morning"}
            ]
            mock_leave.find.return_value = []
            mock_unit.find.return_value = [{"unitType": "department", "name": "Operations"}]
            mock_emp.find.return_value = []
            res = get_special_roster_matrix(startDate="2026-10-20", endDate="2026-10-21", user={"role": "admin"})
            self.assertIn("grid", res)
            self.assertIn("2026-10-20", res["grid"])
            self.assertEqual(len(res["grid"]["2026-10-20"]["Morning"]), 1)
            self.assertEqual(res["grid"]["2026-10-20"]["Morning"][0]["name"], "Alice")

    def test_matrix_endpoint_returns_sequential_pools(self):
        from crew_legacy.api.special_events import get_special_roster_matrix
        with patch("crew_legacy.api.special_events.employee_daily_collection") as mock_daily, \
             patch("crew_legacy.api.special_events.leave_request_collection") as mock_leave, \
             patch("crew_legacy.api.special_events.organization_unit_collection") as mock_unit, \
             patch("crew_legacy.api.special_events.employee_collection") as mock_emp, \
             patch("crew_legacy.services.replacement_roster_service.get_replacement_roster_config") as mock_cfg:
            mock_daily.find.return_value = []
            mock_leave.find.return_value = []
            mock_unit.find.return_value = [{"unitType": "department", "name": "Market Operation"}, {"unitType": "department", "name": "RTG"}]
            mock_emp.find.return_value = []
            mock_cfg.return_value = {
                "sicPool": [{"employeeId": "sic-1", "name": "SIC One", "isActive": True}],
                "shiftEngineerPool": [{"employeeId": "se-1", "name": "SE One", "isActive": True}],
            }
            res = get_special_roster_matrix(startDate="2026-10-20", endDate="2026-10-20", user={"role": "admin"})
            self.assertIn("sequentialPools", res)
            pool_ids = [p["id"] for p in res["sequentialPools"]]
            self.assertIn("all_pools", pool_ids)
            self.assertIn("sic", pool_ids)
            self.assertIn("shift_engineer", pool_ids)
            self.assertIn("departments", pool_ids)

    def test_sequential_allocate_requires_dates(self):
        from crew_legacy.api.special_events import sequential_allocate_department_manpower
        with self.assertRaises(HTTPException) as ctx:
            sequential_allocate_department_manpower({}, user={"role": "admin"})
        self.assertEqual(ctx.exception.status_code, 400)

    def test_sequential_allocate_with_pool_and_multidepartments(self):
        from crew_legacy.api.special_events import sequential_allocate_department_manpower
        with patch("crew_legacy.services.replacement_roster_service.get_replacement_roster_config") as mock_cfg, \
             patch("crew_legacy.api.special_events.system_settings_collection") as mock_settings, \
             patch("crew_legacy.api.special_events.leave_request_collection") as mock_leaves, \
             patch("crew_legacy.api.special_events.employee_daily_collection") as mock_daily, \
             patch("crew_legacy.api.special_events.employee_collection") as mock_emp:
            mock_cfg.return_value = {
                "sicPool": [{"employeeId": "sic-1", "name": "SIC One", "designation": "Manager", "department": "Market Operation", "isActive": True}],
                "shiftEngineerPool": [{"employeeId": "se-1", "name": "SE One", "designation": "Engineer", "department": "RTG", "isActive": True}],
            }
            mock_settings.find_one.return_value = None
            mock_emp.find.return_value = [
                {"employeeId": "sic-1", "department": "Market Operation"},
                {"employeeId": "se-1", "department": "RTG"},
            ]
            mock_leaves.find.return_value.sort.return_value = [
                {
                    "_id": "leave-1",
                    "employeeId": "leave-emp-1",
                    "employeeName": "SIC on Leave",
                    "date": "2026-10-20",
                    "assignedDuty": "Morning",
                    "isSIC": True,
                },
                {
                    "_id": "leave-2",
                    "employeeId": "leave-emp-2",
                    "employeeName": "Engineer on Leave",
                    "date": "2026-10-20",
                    "assignedDuty": "Morning",
                    "isSIC": False,
                },
            ]
            mock_leaves.find_one.return_value = None
            mock_daily.find_one.return_value = None

            res = sequential_allocate_department_manpower({
                "startDate": "2026-10-20",
                "endDate": "2026-10-20",
                "sourcePool": "all_pools",
                "sourceDepartments": ["Market Operation", "RTG"],
                "targetShifts": ["Morning"],
                "previewOnly": True,
            }, user={"role": "admin", "employeeId": "admin-1"})

            self.assertTrue(res["success"])
            self.assertTrue(res["previewOnly"])
            self.assertEqual(res["allocatedCount"], 2)
            # SIC replacement is done by SIC pool automatically
            self.assertEqual(res["allocations"][0]["allocatedEmployeeId"], "sic-1")
            self.assertEqual(res["allocations"][0]["sourcePool"], "SIC Pool")
            # Rest by shift engineer pool
            self.assertEqual(res["allocations"][1]["allocatedEmployeeId"], "se-1")
            self.assertEqual(res["allocations"][1]["sourcePool"], "Shift Engineer Pool")

    def test_commit_special_duty_roster(self):
        from crew_legacy.api.special_events import commit_special_duty_roster
        with patch("crew_legacy.api.special_events.system_settings_collection") as mock_settings:
            mock_settings.find_one.return_value = {
                "_id": ObjectId("6ae19e852645c499e3283107"),
                "title": "Diwali 2026",
                "departmentIds": [],
            }
            res = commit_special_duty_roster("6ae19e852645c499e3283107", {"commit": True}, user={"role": "admin", "employeeId": "50041"})
            self.assertTrue(res["success"])
            self.assertTrue(res["rosterCommitted"])
            self.assertIn("committed and accepted successfully", res["message"])

    def test_get_blocked_period_staffing_loads_without_name_error(self):
        from crew_legacy.api.leave_api import blocked_period_staffing
        with patch("crew_legacy.api.leave_api.employee_daily_collection") as mock_daily, \
             patch("crew_legacy.api.leave_api.employee_collection") as mock_emp, \
             patch("crew_legacy.api.leave_api.organization_unit_collection") as mock_units:
            mock_daily.find.return_value = []
            mock_emp.find.return_value = []
            mock_units.find.return_value = [{"unitType": "department", "name": "System Operation", "isActive": True}]
            block = {
                "_id": ObjectId("6ae19e852645c499e3283107"),
                "startDate": "2026-11-07",
                "endDate": "2026-11-10",
                "reason": "Diwali",
            }
            res = blocked_period_staffing(block, "")
            self.assertEqual(res["startDate"], "2026-11-07")
            self.assertIn("System Operation", res["departments"])


if __name__ == "__main__": unittest.main()



