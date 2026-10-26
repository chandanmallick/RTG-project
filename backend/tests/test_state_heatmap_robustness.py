import asyncio
import io
import unittest
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import numpy as np
import pandas as pd
from openpyxl import Workbook
from datetime import datetime, timedelta

from services import frequency_analysis_sessions as sessions
from services.state_heatmap_service import generate_all_state_heatmaps, extract_state_time_series
from tests.test_frequency_threshold_analysis import workbook, DB, USER
from routes.frequency_analysis_routes import checked

class TestStateHeatmapRobustness(unittest.TestCase):
    def setUp(self):
        sessions._sessions.clear()

    def test_upload_session_with_partial_states_succeeds(self):
        """Uploaded SCADA workbook with only Bihar and Unit (missing WB, DVC, Sikkim, etc.)."""
        wb_bytes = workbook()
        session_info = sessions.upload_session(wb_bytes, "partial_states.xlsx", USER, db=DB)
        token = session_info["session_token"]

        # Call get_state_heatmaps
        res = sessions.get_state_heatmaps(token, USER, dpi=100)
        self.assertIsNotNone(res)
        self.assertIn("Bihar", res.get("states", []))
        self.assertIn("Bihar", res.get("plots_base64", {}))
        self.assertTrue(res["plots_base64"]["Bihar"].startswith("data:image/png;base64,"))
        self.assertIn("Bihar", res.get("interactive_data", {}))
        self.assertTrue(len(res.get("excel_bytes", b"")) > 500)
        self.assertTrue(len(res.get("zip_bytes", b"")) > 500)

    def test_checked_fetch_endpoint_returns_clean_response(self):
        """Simulate API route GET /frequency/analysis/state-heatmaps/{token}."""
        wb_bytes = workbook()
        session_info = sessions.upload_session(wb_bytes, "partial_states.xlsx", USER, db=DB)
        token = session_info["session_token"]

        def fetch():
            res = sessions.get_state_heatmaps(token, USER, dpi=100)
            if not res:
                return {
                    'success': True,
                    'period': 'Selected Period',
                    'states': [],
                    'plots_base64': {},
                    'state_stats': {},
                    'interactive_data': {},
                }
            return {
                'success': True,
                'period': res.get('period') or 'Selected Period',
                'states': res.get('states', []),
                'plots_base64': res.get('plots_base64', {}),
                'state_stats': res.get('state_stats', {}),
                'interactive_data': res.get('interactive_data', {}),
            }

        response = asyncio.run(checked(fetch))
        self.assertTrue(response["success"])
        self.assertIn("Bihar", response["states"])
        self.assertIn("Bihar", response["plots_base64"])

    def test_consolidated_session_with_deviation_only(self):
        """Session dataset where entities only have 'deviation' (e.g. consolidated events)."""
        stamps = pd.date_range("2026-09-01 00:00:00", periods=2880, freq="1min")
        times = stamps.to_numpy(dtype='datetime64[ns]').astype(np.int64).astype(float) / 1e9
        dataset = {
            "times": times,
            "frequency": np.full(2880, 50.0),
            "cadence": 60.0,
            "entities": [
                {
                    "entity_id": "state:0",
                    "display_name": "West Bengal",
                    "group": "State",
                    "deviation": np.full(2880, 50.0),
                    # actual and schedule are None in consolidated
                    "actual": None,
                    "schedule": None,
                }
            ],
            "warnings": [],
        }
        token = sessions._put(USER, dataset, {"start_time": "2026-09-01T00:00:00", "end_time": "2026-09-02T23:59:59"})["session_token"]

        res = sessions.get_state_heatmaps(token, USER, dpi=100)
        self.assertIn("West Bengal", res["states"])
        self.assertIn("West Bengal", res["plots_base64"])
        self.assertEqual(res["state_stats"]["West Bengal"]["max_od"], 50.0)

    def test_session_with_no_state_columns_returns_empty_safely(self):
        """Dataset with generator only, no State entities."""
        stamps = pd.date_range("2026-09-01 00:00:00", periods=100, freq="15min")
        times = stamps.to_numpy(dtype='datetime64[ns]').astype(np.int64).astype(float) / 1e9
        dataset = {
            "times": times,
            "frequency": np.full(100, 50.0),
            "cadence": 900.0,
            "entities": [
                {
                    "entity_id": "gen:1",
                    "display_name": "ISGS Unit",
                    "group": "ISGS",
                    "deviation": np.full(100, -20.0),
                }
            ],
            "warnings": [],
        }
        token = sessions._put(USER, dataset, {"start_time": "2026-09-01T00:00:00", "end_time": "2026-09-02T00:00:00"})["session_token"]

        res = sessions.get_state_heatmaps(token, USER, dpi=100)
        self.assertIsNotNone(res)
        self.assertEqual(res["states"], [])

    def test_raw_bytes_partial_workbook_direct_generation(self):
        """Direct call to generate_all_state_heatmaps(raw_bytes) for partial workbook."""
        wb_bytes = workbook()
        res = generate_all_state_heatmaps(wb_bytes, dpi=100)
        self.assertIn("Bihar", res["states"])
        self.assertIn("Bihar", res["plots_base64"])

if __name__ == "__main__":
    unittest.main()
