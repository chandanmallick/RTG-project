import io
import unittest
import zipfile
from datetime import datetime, timedelta
import numpy as np
import pandas as pd

from services.frequency_curves_service import (
    prepare_frequency_series,
    compute_daily_min_and_duration,
    generate_daily_min_duration_plot,
    compute_frequency_duration_curve,
    generate_frequency_duration_plot,
    compute_daily_frequency_profile,
    generate_daily_profile_plot,
    generate_all_frequency_curves,
)


class FrequencyCurvesServiceTests(unittest.TestCase):
    def setUp(self):
        # Create a synthetic 3-day dataset with 1-minute frequency readings (4320 points)
        # Crossing from Sep 30 to Oct 02 to test month transitions
        base_dt = datetime(2026, 9, 30, 0, 0, 0)
        times = [base_dt + timedelta(minutes=i) for i in range(1440 * 3)]

        freqs = []
        for i, dt in enumerate(times):
            m = dt.hour * 60 + dt.minute
            # Diurnal sinusoidal variation: dip in morning (06:00, m=360) and evening (19:00, m=1140)
            val = 49.95 - 0.15 * np.cos(2 * np.pi * (m - 360) / 1440) - 0.10 * np.sin(4 * np.pi * m / 1440)
            # Add some intentional dips
            if dt.day == 30 and 360 <= m <= 380:
                val = 49.48  # Below 49.50 Hz
            elif dt.day == 1 and 1140 <= m <= 1160:
                val = 49.65  # 49.50 - 49.70 Hz
            freqs.append(round(float(val), 3))

        # Add some spurious outliers to test filtering
        freqs[5] = 42.1  # Outlier below 45 Hz
        freqs[10] = 53.4  # Outlier above 51 Hz
        freqs[15] = None  # None / NaN

        self.df_test = pd.DataFrame({
            "DATE & TIME": times,
            "FREQUENCY": freqs,
        })

    def test_prepare_frequency_series(self):
        # Check that outliers (<45, >51, NaN) are dropped
        clean_df = prepare_frequency_series(self.df_test)
        self.assertNotIn(42.1, clean_df["FREQUENCY"].values)
        self.assertNotIn(53.4, clean_df["FREQUENCY"].values)
        self.assertTrue((clean_df["FREQUENCY"] >= 45.0).all())
        self.assertTrue((clean_df["FREQUENCY"] <= 51.0).all())
        self.assertEqual(len(clean_df["DATE"].unique()), 3)

        # Check date filtering
        filtered_df = prepare_frequency_series(self.df_test, start_date="2026-10-01", end_date="2026-10-01")
        self.assertEqual(list(filtered_df["DATE"].unique()), ["2026-10-01"])

    def test_graph1_daily_min_and_duration(self):
        clean_df = prepare_frequency_series(self.df_test)
        stats = compute_daily_min_and_duration(clean_df)

        rows = stats["daily_rows"]
        self.assertEqual(len(rows), 3)

        # Day 1 (Sep 30) had dip to 49.48 Hz
        d1 = rows[0]
        self.assertEqual(d1["date"], "2026-09-30")
        self.assertAlmostEqual(d1["minimum_frequency"], 49.48, places=2)
        self.assertTrue(d1["ufr_reported"])  # < 49.50 Hz triggers UFR
        self.assertGreater(d1["pct_below_49_50"], 0)

        # Month transition from Sep 30 to Oct 01
        self.assertGreaterEqual(len(stats["month_transitions"]), 1)
        self.assertEqual(stats["month_transitions"][0]["date"], "2026-10-01")

        # Test plot generation
        png_bytes, b64, pstats = generate_daily_min_duration_plot(clean_df, dpi=100)
        self.assertTrue(png_bytes.startswith(b"\x89PNG"))
        self.assertTrue(b64.startswith("data:image/png;base64,"))

    def test_graph2_duration_curve_and_comparisons(self):
        clean_df = prepare_frequency_series(self.df_test)
        # Comparison period: Oct only
        comp_df = clean_df[clean_df["DATE"] >= "2026-10-01"]

        stats = compute_frequency_duration_curve(clean_df, comparison_dfs={"October 2026": comp_df})
        self.assertIn("primary", stats)
        self.assertIn("comparisons", stats)
        self.assertEqual(len(stats["comparisons"]), 1)

        primary = stats["primary"]
        th = primary["thresholds"]
        for key in ["49.50", "49.70", "49.90", "50.00", "50.05"]:
            self.assertIn(key, th)
            self.assertIn("percentage", th[key])

        # Test plot generation
        png_bytes, b64, pstats = generate_frequency_duration_plot(clean_df, comparison_dfs={"October 2026": comp_df}, dpi=100)
        self.assertTrue(png_bytes.startswith(b"\x89PNG"))
        self.assertTrue(b64.startswith("data:image/png;base64,"))

    def test_graph3_daily_profile(self):
        clean_df = prepare_frequency_series(self.df_test)
        stats = compute_daily_frequency_profile(clean_df)

        self.assertIn("morning_dip", stats)
        self.assertIn("evening_dip", stats)
        self.assertIn("severe_minimum_p10", stats)

        morn = stats["morning_dip"]
        self.assertIn("average_frequency", morn)
        self.assertIn("time", morn)

        p10 = stats["severe_minimum_p10"]
        self.assertIn("1 day in 10 below", p10["label"])

        # Test plot generation
        png_bytes, b64, pstats = generate_daily_profile_plot(clean_df, dpi=100)
        self.assertTrue(png_bytes.startswith(b"\x89PNG"))
        self.assertTrue(b64.startswith("data:image/png;base64,"))

    def test_generate_all_frequency_curves(self):
        result = generate_all_frequency_curves(self.df_test, dpi=100)
        self.assertTrue(result["success"])
        self.assertIn("daily_min_duration", result["plots_bytes"])
        self.assertIn("duration_curve", result["plots_bytes"])
        self.assertIn("daily_profile", result["plots_bytes"])
        self.assertIn("zip_bytes", result)

        # Verify ZIP contains all 3 plots
        with zipfile.ZipFile(io.BytesIO(result["zip_bytes"])) as zf:
            names = zf.namelist()
            self.assertIn("Daily_Minimum_and_Duration.png", names)
            self.assertIn("Frequency_Duration_Curve.png", names)
            self.assertIn("Average_Daily_Frequency_Profile.png", names)


if __name__ == "__main__":
    unittest.main()
