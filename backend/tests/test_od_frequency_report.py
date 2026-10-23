import unittest
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from io import BytesIO
import zipfile
import numpy as np
import pandas as pd

from services.od_frequency_report import (
    STATE_COLUMNS,
    FREQUENCY_BANDS,
    THRESHOLDS,
    load_od_frequency_dataframe,
    generate_od_frequency_plots,
)


class TestOdFrequencyReport(unittest.TestCase):
    def setUp(self):
        # Create a synthetic DataFrame simulating SCADA Excel layout
        # Row 1: Header
        # Row 2: Metadata / meter codes
        # Row 3+: Data
        n_rows = 50
        dates = pd.date_range("2026-09-01 00:00:00", periods=n_rows, freq="1min")
        
        # Various frequency values:
        # Some normal (49.95 to 50.2)
        # Some spurious low (< 45.0, e.g. 42.0, 0.0)
        # Some spurious high (> 51.0, e.g. 7346.6)
        freqs = np.linspace(49.95, 50.2, n_rows)
        freqs[0] = 42.0    # Spurious low (< 45) -> MUST be excluded
        freqs[1] = 0.0     # Spurious zero (< 45) -> MUST be excluded
        freqs[2] = 7346.6  # Spurious high (> 51) -> MUST be excluded
        freqs[3] = 49.45   # Valid (< 49.50) -> Red
        freqs[4] = 49.65   # Valid (49.50 - 49.70) -> Orange
        freqs[5] = 49.85   # Valid (49.70 - 49.90) -> Purple
        freqs[6] = 50.05   # Valid (>= 49.90) -> Green

        data = {
            "DATE & TIME": dates,
            "FREQUENCY": freqs,
        }

        for state, (s_col, a_col) in STATE_COLUMNS.items():
            # Base schedule = 100 MW
            # Actual: mix of positive, zero, and negative deviations
            s_vals = np.full(n_rows, 100.0)
            a_vals = np.full(n_rows, 100.0)
            # Row 3 (freq 49.45): +50 MW
            a_vals[3] = 150.0
            # Row 4 (freq 49.65): -20 MW (negative deviation)
            a_vals[4] = 80.0
            # Row 5 (freq 49.85): 0 MW deviation
            a_vals[5] = 100.0
            # Row 6 (freq 50.05): +30 MW
            a_vals[6] = 130.0
            # Remaining rows: positive deviation
            for r in range(7, n_rows):
                a_vals[r] = 110.0 + r

            data[s_col] = s_vals
            data[a_col] = a_vals

        df_data = pd.DataFrame(data)

        # Build Excel workbook with Row 2 as metadata
        buf = BytesIO()
        with pd.ExcelWriter(buf, engine="openpyxl") as writer:
            # Write header
            df_header = pd.DataFrame([list(df_data.columns)])
            df_header.to_excel(writer, sheet_name="Sheet1", header=False, index=False)
            
            # Row 2: Metadata / meter codes
            meta_row = ["METER_CODE_" + str(i) for i in range(len(df_data.columns))]
            df_meta = pd.DataFrame([meta_row])
            df_meta.to_excel(writer, sheet_name="Sheet1", header=False, index=False, startrow=1)
            
            # Row 3+: Data rows
            df_data.to_excel(writer, sheet_name="Sheet1", header=False, index=False, startrow=2)

        buf.seek(0)
        self.excel_bytes = buf.getvalue()

    def test_load_od_frequency_dataframe(self):
        df = load_od_frequency_dataframe(self.excel_bytes)
        self.assertEqual(len(df), 50)
        self.assertIn("FREQUENCY", df.columns)
        for s_col, a_col in STATE_COLUMNS.values():
            self.assertIn(s_col, df.columns)
            self.assertIn(a_col, df.columns)
        # Ensure row 2 metadata (METER_CODE_...) is not in data
        self.assertFalse(any(str(v).startswith("METER_CODE") for v in df["FREQUENCY"]))

    def test_generate_od_frequency_plots(self):
        result = generate_od_frequency_plots(self.excel_bytes, dpi=100)
        
        # Check all 6 states present
        expected_states = ["West Bengal", "Bihar", "DVC", "Jharkhand", "Odisha", "Sikkim"]
        self.assertEqual(sorted(result["plots_bytes"].keys()), sorted(expected_states))
        self.assertIn("statistics_bytes", result)
        self.assertIn("state_stats", result)
        self.assertIn("zip_bytes", result)

        # Check ZIP contains 6 plots + statistics
        with zipfile.ZipFile(BytesIO(result["zip_bytes"])) as zf:
            namelist = zf.namelist()
            self.assertIn("OD_Frequency_Statistics.xlsx", namelist)
            for s in expected_states:
                safe_name = s.replace(" ", "_")
                self.assertTrue(any(safe_name in name and name.endswith(".png") for name in namelist))

        # Check statistics calculations
        # Denominator should exclude spurious rows (rows 0, 1, 2) where freq < 45 or > 51
        # Row 3 (49.45 Hz) is < 49.50 Hz. It has valid freq, positive dev.
        # Row 4 (49.65 Hz) is < 49.70 Hz. It has valid freq, but NEGATIVE dev (-20).
        # Row 4 MUST be counted in denominator below 49.70 Hz, but NOT in numerator!
        wb_stats = result["state_stats"]["West Bengal"]
        thresh_49_5 = next(r for r in wb_stats if r["threshold"] == "<49.50 Hz")
        self.assertEqual(thresh_49_5["total_blocks"], 1) # row 3 only (rows 0, 1 had <45 Hz so excluded!)
        self.assertEqual(thresh_49_5["positive_blocks"], 1) # row 3 was +50 MW
        self.assertAlmostEqual(thresh_49_5["maximum_mw"], 50.0, places=1)

        thresh_49_7 = next(r for r in wb_stats if r["threshold"] == "<49.70 Hz")
        # Row 3 (49.45) + Row 4 (49.65) = 2 total blocks
        self.assertEqual(thresh_49_7["total_blocks"], 2)
        # Only Row 3 had positive dev, Row 4 was -20 MW
        self.assertEqual(thresh_49_7["positive_blocks"], 1)
        self.assertAlmostEqual(thresh_49_7["percentage"], 50.0, places=1)

        # Check DVC measure labelling in stats_rows
        dvc_rows = [r for r in result["statistics_rows"] if r["State"] == "DVC"]
        self.assertTrue(len(dvc_rows) >= 3)
        for r in dvc_rows:
            self.assertEqual(r["Measure"], "Under-injection")
            self.assertIn("Under-injection blocks", r)
            self.assertIn("Maximum Under-injection (MW)", r)

        wb_rows = [r for r in result["statistics_rows"] if r["State"] == "West Bengal"]
        for r in wb_rows:
            self.assertEqual(r["Measure"], "Overdrawal")
            self.assertIn("Overdrawal blocks", r)
            self.assertIn("Maximum Overdrawal (MW)", r)

        # Verify Excel workbook content
        excel_df = pd.read_excel(BytesIO(result["statistics_bytes"]))
        self.assertIn("Total valid 1-min blocks below threshold", excel_df.columns)
        self.assertIn("Positive deviation blocks", excel_df.columns)

    def test_period_detection_any_period(self):
        from services.od_frequency_report import format_period_label, detect_period_from_dataframe

        # Single month
        self.assertEqual(format_period_label("2026-09-01", "2026-09-30"), "September 2026")
        # Multi-month
        self.assertEqual(format_period_label("2026-09-01", "2026-10-31"), "September–October 2026")
        # Arbitrary custom range
        self.assertEqual(format_period_label("2026-10-15", "2026-10-22"), "15-Oct-2026 to 22-Oct-2026")
        # Single day
        self.assertEqual(format_period_label("2026-09-05", "2026-09-05"), "05-Sep-2026")
        # Fallback for None / invalid
        self.assertEqual(format_period_label(None, None), "Uploaded Period")

        # From dataframe
        df = pd.DataFrame({
            "DATE & TIME": ["2026-11-01 00:00:00", "2026-11-30 23:59:00"],
            "FREQUENCY": [49.8, 49.9],
        })
        self.assertEqual(detect_period_from_dataframe(df), "November 2026")


if __name__ == "__main__":
    unittest.main()
