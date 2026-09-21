"""Operations access and personal pending counts without live DB or mail."""
from datetime import datetime
import unittest
from unittest.mock import Mock

from test_crew_calendar_workflows import load_functions


class OperationsTests(unittest.TestCase):
    def setUp(self):
        self.pages = {name: {"view": True, "write": True} for name in
                      ("crew_calendar", "crew_leave", "crew_training", "crew_replacement")}
        self.leaves = Mock()
        self.leaves.find.return_value = []
        self.training = Mock()
        self.training.find.return_value = []
        self.training.count_documents.return_value = 0
        self.sports = Mock()
        self.sports.count_documents.return_value = 0
        self.exchanges = Mock()
        self.exchanges.find.return_value = []
        self.context = load_functions("crew_legacy/api/operations_api.py",
            {"operation_actions", "operations_summary"}, {
                "datetime": datetime,
                "page_access_collection": Mock(find_one=Mock(return_value={"pages": self.pages})),
                "get_my_role": lambda **kw: {},
                "get_training_nomination_access": lambda **kw: {"canAssign": False},
                "is_training_hr": lambda user: False,
                "can_manage_events": lambda user: False,
                "leave_request_collection": self.leaves,
                "training_nomination_history_collection": self.training,
                "sports_application_collection": self.sports,
                "duty_exchange_request_collection": self.exchanges,
                "is_organization_leave": lambda leave: leave.get("organization", False),
                "can_sic_act": lambda user, leave: leave.get("sic", False),
                "can_authority_act": lambda user, leave: leave.get("dic", False),
                "sports_applications": lambda **kw: [],
                "exchange_request_summary": lambda item, actor: item,
                "has_replacement_authority": lambda user, leave: leave.get("authority", False),
                "TRAINING_HR_POOL_ID": "HR_POOL",
            })

    def actions(self, pages=None, role=None, counts=None, **kwargs):
        return self.context["operation_actions"](
            self.pages if pages is None else pages, role or {}, {}, counts or {}, **kwargs)

    def summary(self):
        return self.context["operations_summary"](user={"employeeId": "actor", "role": "employee"})

    def test_no_access_disables_all_actions_even_for_admin(self):
        self.assertTrue(all(not item["enabled"] for item in self.actions({}, {"isAdmin": True}).values()))

    def test_view_does_not_grant_event_creation_or_requests(self):
        pages = {key: {"view": True, "write": False} for key in self.pages}
        actions = self.actions(pages)
        for key in ("trainingEvents", "sportsEvents", "holidays", "applyLeave", "requestTraining", "applySports", "requestExchange"):
            self.assertFalse(actions[key]["enabled"], key)
        self.assertTrue(actions["myTraining"]["enabled"])

    def test_write_does_not_grant_manager_or_approval_authority(self):
        actions = self.actions()
        for key in ("trainingEvents", "sportsEvents", "leaveApproval", "trainingApproval", "sportsApproval", "delegate", "exchangeApproval"):
            self.assertFalse(actions[key]["enabled"], key)

    def test_current_workflow_rights_enable_only_workflow_routes(self):
        actions = self.actions({}, counts={"trainingApproval": 2, "exchangeApproval": 1, "leaveApproval": 3})
        self.assertEqual(actions["trainingApproval"], {"enabled": True, "pending": 2})
        self.assertEqual(actions["exchangeApproval"], {"enabled": True, "pending": 1})
        self.assertEqual(actions["leaveApproval"], {"enabled": False, "pending": 0})
        self.assertFalse(actions["trainingEvents"]["enabled"])
        self.assertFalse(actions["requestExchange"]["enabled"])

    def test_approval_stage_counts_and_no_double_counting(self):
        self.leaves.find.side_effect = [
            [{"sicApprovalStatus": "Pending", "deptApprovalStatus": "Pending", "dic": True},
             {"sicApprovalStatus": "Forwarded", "deptApprovalStatus": "Pending", "dic": True},
             {"organization": True, "deptApprovalStatus": "Pending", "sic": True, "dic": True}], []]
        self.training.find.return_value = [
            {"approvalChain": [{"employeeId": "actor"}, {"employeeId": "other"}], "currentApprovalIndex": 0},
            {"approvalChain": [{"employeeId": "other"}, {"employeeId": "actor"}], "currentApprovalIndex": 0}]
        self.exchanges.find.return_value = [{"canAct": False}, {"canAct": True}]
        self.context["sports_applications"] = lambda **kw: [{"canAct": True}, {"canAct": False}]
        summary = self.summary()
        self.assertEqual(summary["actions"]["leaveApproval"]["pending"], 2)
        self.assertEqual(summary["actions"]["trainingApproval"]["pending"], 1)
        self.assertEqual(summary["actions"]["sportsApproval"]["pending"], 1)
        self.assertEqual(summary["actions"]["exchangeApproval"]["pending"], 1)
        self.assertEqual(summary["actions"]["requestExchange"]["pending"], 0)
        self.assertEqual(summary["totalPending"], 5)

    def test_hr_pool_and_adjacent_off_are_actionable(self):
        self.context["is_training_hr"] = lambda user: True
        self.training.find.return_value = [
            {"approvalChain": [{"employeeId": "HR_POOL"}]},
            {"workflowKind": "Adjacent OFF", "approvalChain": [{"employeeId": "actor"}]}]
        self.assertEqual(self.summary()["actions"]["trainingApproval"]["pending"], 2)

    def test_coverage_only_counts_required_unassigned_current_work(self):
        self.leaves.find.side_effect = [[], [{"authority": True}, {"authority": False}]]
        self.training.count_documents.return_value = 2
        summary = self.summary()
        self.assertEqual(summary["actions"]["leaveReplacement"]["pending"], 1)
        self.assertEqual(summary["actions"]["calendarCoverage"]["pending"], 2)
        leave_query = self.leaves.find.call_args_list[1].args[0]
        self.assertTrue(leave_query["replacementRequired"])
        self.assertEqual(leave_query["replacement.employeeId"], {"$in": [None, ""]})
        self.assertIn("$gte", leave_query["date"])
        training_query = self.training.count_documents.call_args.args[0]
        self.assertEqual(training_query["workflowKind"], {"$ne": "Adjacent OFF"})
        self.assertTrue(training_query["replacementRequired"])
        self.sports.count_documents.assert_not_called()


if __name__ == "__main__":
    unittest.main()
