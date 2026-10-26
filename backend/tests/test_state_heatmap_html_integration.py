import unittest
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from io import BytesIO
import numpy as np
import pandas as pd

from services.od_frequency_report import STATE_COLUMNS
from services.frequency_compact_reports import export_compact, html_report
from services.state_heatmap_service import generate_all_state_heatmaps
from types import SimpleNamespace


class TestStateHeatmapHtmlIntegration(unittest.TestCase):
    def setUp(self):
        # Create synthetic 1-min data for 2 days (2880 rows)
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
                # Day 1, Block 76 (18:45-19:00 = row 1125:1140): +750 MW OD
                act[1125:1140] = 850.0
            data[s_col] = sch
            data[a_col] = act
        self.df = pd.DataFrame(data)

    def test_html_report_contains_state_heatmap_subsection(self):
        heatmaps_data = generate_all_state_heatmaps(self.df, dpi=100)
        tables = [("Overall Frequency Statistics", [("threshold", "Threshold Hz")], [])]
        html_doc = html_report(
            tables=tables,
            title="Consolidated Frequency Analysis",
            warnings=[],
            state_heatmaps=heatmaps_data,
        )

        self.assertIn('id="section-heatmap"', html_doc)
        self.assertIn("3.2 State Performance by Heatmap", html_doc)
        self.assertIn('href="#section-heatmap"', html_doc)
        self.assertIn("heatmap-state-select", html_doc)
        self.assertIn("heatmap-pub-img", html_doc)
        self.assertIn("heatmap-echarts", html_doc)
        self.assertIn("HEATMAP_DATA", html_doc)
        self.assertIn("initHeatmapSection()", html_doc)
        self.assertIn("West Bengal", html_doc)


if __name__ == "__main__":
    unittest.main()
