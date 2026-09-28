from datetime import date, datetime
import unittest
from unittest.mock import Mock
from fastapi import HTTPException
from test_crew_calendar_workflows import load_functions, Cursor


class LeaveBlockTests(unittest.TestCase):
    def setUp(self):
        self.settings = Mock()
        self.block = {"startDate": "2026-10-10", "endDate": "2026-10-15", "reason": "Critical operations"}
        self.settings.find.return_value = Cursor([self.block])
        self.ctx = load_functions("crew_legacy/api/leave_api.py", {
            "clean_id", "is_admin", "validate_block_dates", "ensure_leave_dates_open",
            "create_blocked_leave_period", "revoke_blocked_leave_period", "apply_leave_v2",
        }, {"date": date, "datetime": datetime, "system_settings_collection": self.settings})

    def test_both_boundaries_blocked(self):
        for value in ["2026-10-10", "2026-10-15"]:
            with self.assertRaises(HTTPException) as error:
                self.ctx["ensure_leave_dates_open"]([value])
            self.assertEqual(error.exception.status_code, 409)
            self.assertIn("Critical operations", error.exception.detail)

    def test_unselected_gap_does_not_block(self):
        self.ctx["ensure_leave_dates_open"](["2026-10-09", "2026-10-16"])
        self.assertTrue(self.settings.find.call_args.args[0]["active"])

    def test_invalid_dates_and_reversed_range(self):
        for start, end in [("2026-02-30", "2026-03-01"), ("2026-10-15", "2026-10-10"), (None, None)]:
            with self.assertRaises(HTTPException):
                self.ctx["validate_block_dates"](start, end)

    def test_admin_only_create_and_revoke(self):
        for function, value in [("create_blocked_leave_period", self.block), ("revoke_blocked_leave_period", "invalid")]:
            with self.assertRaises(HTTPException) as error:
                self.ctx[function](value, {"role": "employee", "employeeId": "another"})
            self.assertEqual(error.exception.status_code, 403)
        self.settings.insert_one.assert_not_called()
        self.settings.update_one.assert_not_called()

    def test_create_records_actor_and_inclusive_dates(self):
        self.ctx["create_blocked_leave_period"](self.block, {"role": "admin", "employeeId": "admin"})
        doc = self.settings.insert_one.call_args.args[0]
        self.assertEqual(doc["createdBy"], "admin")
        self.assertEqual(doc["endDate"], "2026-10-15")
        self.assertTrue(doc["active"])

    def test_batch_rejected_before_any_leave_or_duty_write_including_admin(self):
        self.ctx.update(employee_collection=Mock(find_one=Mock(return_value={"userId": "employee"})),
                        employee_daily_collection=Mock(), leave_request_collection=Mock())
        with self.assertRaises(HTTPException) as error:
            self.ctx["apply_leave_v2"]({"employeeId": "employee", "applications": [{"date": "2026-10-09"}, {"date": "2026-10-10"}], "reason": "Request"}, {"role": "admin"})
        self.assertEqual(error.exception.status_code, 409)
        self.assertEqual(self.ctx["employee_daily_collection"].mock_calls, [])
        self.assertEqual(self.ctx["leave_request_collection"].mock_calls, [])

    def test_revoke_keeps_audit_record(self):
        self.ctx["revoke_blocked_leave_period"]("0123456789abcdef01234567", {"role": "admin", "employeeId": "admin"})
        update = self.settings.update_one.call_args.args[1]["$set"]
        self.assertFalse(update["active"])
        self.assertEqual(update["revokedBy"], "admin")
        self.settings.delete_one.assert_not_called()

if __name__ == "__main__":
    unittest.main()
