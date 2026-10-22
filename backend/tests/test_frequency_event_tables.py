import unittest
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pandas as pd
import numpy as np
from datetime import datetime, timedelta

from services.frequency_event_tables import (
    identify_frequency_events,
    extract_event_rows,
    generate_frequency_event_tables,
    generate_event_tables_excel,
)


class TestFrequencyEventTables(unittest.TestCase):
    def setUp(self):
        # Generate 1-minute synthetic dataset for testing
        base_time = datetime(2026, 9, 1, 19, 0, 0)
        times = [base_time + timedelta(minutes=i) for i in range(30)]
        
        # 19:15 to 19:19 dip below 49.50 (5 minutes duration)
        # 19:25 to 19:27 dip below 49.70 (3 minutes duration)
        freqs = [49.95] * 30
        for i in range(15, 20):  # 19:15 to 19:19
            freqs[i] = 49.433 if i == 18 else 49.48
        for i in range(25, 28):  # 19:25 to 19:27
            freqs[i] = 49.65
            
        data = {
            "DATE & TIME": times,
            "FREQUENCY": freqs,
            "BIHAR SCHEDULE": [100.0] * 30,
            "BIHAR ACTUAL": [100.0] * 30,   # zero deviation
            "JHARKHAND SCHEDULE": [50.0] * 30,
            "JHARKHAND ACTUAL": [73.0] * 30, # +23 OD
            "ODISHA SCHEDULE": [100.0] * 30,
            "ODISHA ACTUAL": [165.0 if i == 18 else 85.0 for i in range(30)], # 165 - 100 = +65 Max OD, rest -15
            "WB SCHEDULE": [200.0] * 30,
            "WB ACTUAL": [150.0] * 30,     # -50 underdrawal (no positive OD)
            "DVC ADJUSTED SCHEDULE": [100.0] * 30,
            "DVC ACTUAL": [133.0 if i == 18 else 111.0 for i in range(30)], # +33 Max OD, +11 avg
        }
        self.df = pd.DataFrame(data)

    def test_identify_frequency_events(self):
        timestamps = self.df["DATE & TIME"].to_numpy()
        frequencies = self.df["FREQUENCY"].to_numpy()
        
        # Threshold < 49.50 Hz
        events_49_5 = identify_frequency_events(timestamps, frequencies, 49.5)
        self.assertEqual(len(events_49_5), 1)
        self.assertEqual(len(events_49_5[0]), 5)
        
        # Threshold < 49.70 Hz (should catch both 19:15-19:19 and 19:25-19:27)
        events_49_7 = identify_frequency_events(timestamps, frequencies, 49.7)
        self.assertEqual(len(events_49_7), 2)
        self.assertEqual(len(events_49_7[0]), 5)
        self.assertEqual(len(events_49_7[1]), 3)

    def test_extract_event_rows_and_constituent_deviations(self):
        timestamps = self.df["DATE & TIME"].to_numpy()
        frequencies = self.df["FREQUENCY"].to_numpy()
        events = identify_frequency_events(timestamps, frequencies, 49.5)
        
        constituents = ["Bihar", "Jharkhand", "Odisha", "West Bengal", "DVC"]
        rows = extract_event_rows(self.df, events, 49.5, constituents)
        
        self.assertEqual(len(rows), 1)
        r0 = rows[0]
        self.assertEqual(r0["sr_no"], 1)
        self.assertEqual(r0["date"], "01-Sep")
        self.assertEqual(r0["window_hrs"], "19:15–19:19")
        self.assertEqual(r0["duration_min"], 5)
        self.assertAlmostEqual(r0["lowest_freq"], 49.433, places=3)
        self.assertEqual(r0["lowest_at_time"], "19:18")
        
        cdata = r0["constituents_data"]
        # Bihar: Actual 100 - Sched 100 = 0 (no positive deviation > 0, so Max OD is "–")
        self.assertEqual(cdata["Bihar"]["max_od"], "–")
        self.assertEqual(cdata["Bihar"]["avg_dev"], 0)
        
        # Jharkhand: Actual 73 - Sched 50 = +23
        self.assertEqual(cdata["Jharkhand"]["max_od"], 23)
        self.assertEqual(cdata["Jharkhand"]["avg_dev"], 23)
        
        # Odisha: Max actual 165 - 100 = +65; others 85 - 100 = -15
        self.assertEqual(cdata["Odisha"]["max_od"], 65)
        # Avg Dev over 5 minutes: ( -15 * 4 + 65 ) / 5 = (-60 + 65) / 5 = +1
        self.assertEqual(cdata["Odisha"]["avg_dev"], 1)
        
        # West Bengal: Actual 150 - Sched 200 = -50 (no positive deviation > 0)
        self.assertEqual(cdata["West Bengal"]["max_od"], "–")
        self.assertEqual(cdata["West Bengal"]["avg_dev"], -50)
        
        # DVC: Max actual 133 - 100 = 33; others 111 - 100 = 11
        self.assertEqual(cdata["DVC"]["max_od"], 33)
        # Avg dev: ( 11 * 4 + 33 ) / 5 = (44 + 33)/5 = 77/5 = 15.4 -> 15
        self.assertEqual(cdata["DVC"]["avg_dev"], 15)

    def test_generate_frequency_event_tables_multi_threshold(self):
        res = generate_frequency_event_tables(
            source=self.df,
            start_date="2026-09-01",
            end_date="2026-09-01",
            thresholds=[49.5, 49.7],
            constituents=["Bihar", "Jharkhand", "Odisha", "West Bengal", "DVC"]
        )
        self.assertTrue(res["success"])
        self.assertEqual(len(res["tables"]), 2)
        
        # Table-2A (<49.50 Hz)
        t2a = res["tables"][0]
        self.assertEqual(t2a["table_id"], "Table-2A")
        self.assertIn("49.50 Hz", t2a["title"])
        self.assertEqual(t2a["total_events"], 1)
        
        # Table-2B (<49.70 Hz)
        t2b = res["tables"][1]
        self.assertEqual(t2b["table_id"], "Table-2B")
        self.assertIn("49.70 Hz", t2b["title"])
        self.assertEqual(t2b["total_events"], 2)

    def test_excel_export_bytes(self):
        res = generate_frequency_event_tables(
            source=self.df,
            thresholds=[49.5, 49.7],
            constituents=["Bihar", "Jharkhand", "Odisha", "West Bengal", "DVC"]
        )
        excel_bytes = generate_event_tables_excel(res)
        self.assertIsInstance(excel_bytes, bytes)
        self.assertGreater(len(excel_bytes), 1000)


if __name__ == "__main__":
    unittest.main()
