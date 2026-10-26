import unittest
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from io import BytesIO
import zipfile
import numpy as np
import pandas as pd

from services.od_frequency_report import STATE_COLUMNS
from services.state_heatmap_service import (
    extract_state_time_series,
    compute_state_heatmap_matrix,
    generate_all_state_heatmaps,
    block_time_label,
    format_month_label,
)


class TestStateHeatmapService(unittest.TestCase):
    def setUp(self):
        # Create a synthetic dataset spanning multiple days with 1-minute intervals
        # e.g., 2 full days = 2880 readings
        dates = pd.date_range("2026-09-01 00:00:00", periods=2880, freq="1min")
        n_rows = len(dates)

        data = {
            "DATE & TIME": dates,
            "FREQUENCY": np.full(n_rows, 50.0),
        }

        for state, (s_col, a_col) in STATE_COLUMNS.items():
            sch = np.full(n_rows, 100.0)
            act = np.full(n_rows, 100.0)
            if state == "West Bengal":
                # On day 1, block 76 (18:45-19:00 = minute 1125 to 1139): severe OD = 800 MW
                act[1125:1140] = 900.0  # actual - sch = 800 MW
                # On day 2, block 1 (00:00-00:15 = minute 1440 to 1454): moderate OD = 350 MW
                act[1440:1455] = 450.0  # actual - sch = 350 MW
            data[s_col] = sch
            data[a_col] = act

        self.df = pd.DataFrame(data)

    def test_block_time_label(self):
        self.assertEqual(block_time_label(1), "00:00–00:15")
        self.assertEqual(block_time_label(2), "00:15–00:30")
        self.assertEqual(block_time_label(5), "01:00–01:15")
        self.assertEqual(block_time_label(76), "18:45–19:00")
        self.assertEqual(block_time_label(96), "23:45–24:00")

    def test_extract_state_time_series(self):
        df, state_cols, month_label = extract_state_time_series(self.df)
        self.assertIn("West Bengal", state_cols)
        self.assertEqual(month_label, "Sep-26")
        self.assertIn("TIME_BLOCK", df.columns)
        self.assertIn("DAY", df.columns)
        self.assertEqual(df["TIME_BLOCK"].min(), 1)
        self.assertEqual(df["TIME_BLOCK"].max(), 96)

    def test_compute_state_heatmap_matrix(self):
        df, state_cols, _ = extract_state_time_series(self.df)
        sch_col, act_col = state_cols["West Bengal"]
        res = compute_state_heatmap_matrix(df, "West Bengal", sch_col, act_col, num_days=30)
        self.assertEqual(res["matrix"].shape, (30, 96))
        # Day 1, Block 76 (index 0, 75) should have OD = 800 MW
        self.assertAlmostEqual(res["matrix"][0, 75], 800.0, places=1)
        self.assertAlmostEqual(res["stats"]["max_od"], 800.0, places=1)
        self.assertEqual(res["stats"]["max_od_day"], 1)
        self.assertEqual(res["stats"]["max_od_block"], 76)
        self.assertEqual(res["stats"]["severe_blocks_count"], 1)

    def test_generate_all_state_heatmaps(self):
        res = generate_all_state_heatmaps(self.df, dpi=100)
        self.assertEqual(res["period"], "Sep-26")
        self.assertIn("West Bengal", res["plots_base64"])
        self.assertTrue(res["plots_base64"]["West Bengal"].startswith("data:image/png;base64,"))
        self.assertIn("West Bengal", res["plots_bytes"])
        self.assertIn("West Bengal", res["interactive_data"])
        self.assertTrue(len(res["zip_bytes"]) > 1000)
        self.assertTrue(len(res["excel_bytes"]) > 1000)

        # Check zip archive contents
        with zipfile.ZipFile(BytesIO(res["zip_bytes"])) as zf:
            namelist = zf.namelist()
            self.assertTrue(any("West_Bengal" in name for name in namelist))
            self.assertTrue(any(".xlsx" in name for name in namelist))


if __name__ == "__main__":
    unittest.main()
