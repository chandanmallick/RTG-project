import unittest
from unittest.mock import MagicMock, patch

from routes import frequency_routes as routes


class ScheduleSourceTests(unittest.TestCase):
    def test_wbes_request_preserves_configured_case(self):
        db = MagicMock()
        db.map_collection.find.return_value = [{"wbes_name": "Teesta_V"}]
        db.pipeline_config_collection.find_one.return_value = {
            "wbes_url": "https://example.invalid/schedule", "wbes_api_key": "test",
            "wbes_username": "test", "wbes_password": "test",
        }
        session = MagicMock()
        session.post.return_value.status_code = 200
        session.post.return_value.json.return_value = {"ResponseBody": {"GroupWiseDataList": [{"Acronym": "Teesta_V", "NetScheduleSummary": {}}]}}
        diagnostics = []
        with patch.object(routes, "MongoService", return_value=db), patch.object(routes, "get_legacy_session_no_verify", return_value=session), patch.object(routes, "merge_event_raw_data") as merge, patch.object(routes, "log_api_hit"):
            result = routes.fetch_wbes_schedule_raw("05-10-2026", ["TEESTA_V"], diagnostics, force_refresh=True)
        self.assertEqual(session.post.call_args.kwargs["json"]["UtilAcronymList"], ["Teesta_V"])
        self.assertEqual(merge.call_args.kwargs["set_fields"]["sources.wbes.schedule"], [])
        self.assertTrue(diagnostics)
        self.assertEqual(result[0]["Acronym"], "Teesta_V")

    def test_missing_and_partial_schedule_are_not_padded_with_zero(self):
        for values in ([], [10, None]):
            self.assertEqual(routes.get_source_series({"sources": {"wbes": {"schedule": values}}}, "wbes", "schedule"), values)

    def test_component_payload_is_preserved(self):
        components = [{"EnergyScheduleTypeName": "ISGS", "NetSchdAmount": [100]}]
        self.assertEqual(routes.get_source_series({"sources": {"wbes": {"schedule_components": components}}}, "wbes", "schedule_components"), components)


if __name__ == "__main__":
    unittest.main()
