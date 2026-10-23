"""
OD vs Frequency plot module for integration into an existing reporting application.

Requirements:
    pip install pandas openpyxl matplotlib

Input workbook layout expected:
    Row 1: column headers
    Row 2: metadata/spurious row (ignored)
    Row 3 onward: data
    Required columns:
        DATE & TIME, FREQUENCY
        BIHAR SCHEDULE, BIHAR ACTUAL
        JHARKHAND SCHEDULE, JHARKHAND ACTUAL
        DVC ADJUSTED SCHEDULE, DVC ACTUAL
        ODISHA SCHEDULE, ODISHA ACTUAL
        WB SCHEDULE, WB ACTUAL
        SIKKIM SCHEDULE, SIKKIM ACTUAL

Positive deviation = Actual - Schedule > 0.
For DVC, positive deviation is described as under-injection; for other states,
it is described as overdrawal.

Returns a dictionary containing:
    - plots: paths to PNG files
    - plots_base64: data URI strings of PNG images for embedding in HTML reports
    - plots_bytes: raw PNG bytes for embedding in Word/PDF documents
    - statistics: path to generated OD_Frequency_Statistics.xlsx
    - statistics_bytes: raw XLSX bytes
    - state_stats: dictionary of statistics rows per state
    - period: resolved period label
"""

from io import BytesIO
from pathlib import Path
import base64
import re
import zipfile

import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")  # Suitable for servers/headless report generation.
import matplotlib.pyplot as plt
from matplotlib.ticker import MultipleLocator


STATE_COLUMNS = {
    "West Bengal": ("WB SCHEDULE", "WB ACTUAL"),
    "Bihar": ("BIHAR SCHEDULE", "BIHAR ACTUAL"),
    "DVC": ("DVC ADJUSTED SCHEDULE", "DVC ACTUAL"),
    "Jharkhand": ("JHARKHAND SCHEDULE", "JHARKHAND ACTUAL"),
    "Odisha": ("ODISHA SCHEDULE", "ODISHA ACTUAL"),
    "Sikkim": ("SIKKIM SCHEDULE", "SIKKIM ACTUAL"),
}

# Frequency bands as per requirement:
# Below 49.50 Hz: Red (#D7191C)
# 49.50 to below 49.70 Hz: Orange (#F07800)
# 49.70 to below 49.90 Hz: Purple (#7B2CBF)
# 49.90 Hz and above: Green (#159447)
FREQUENCY_BANDS = [
    (0.0, 49.5, "#D7191C", "<49.50 Hz"),
    (49.5, 49.7, "#F07800", "49.50–<49.70 Hz"),
    (49.7, 49.9, "#7B2CBF", "49.70–<49.90 Hz"),
    (49.9, np.inf, "#159447", "≥49.90 Hz"),
]
THRESHOLDS = (49.5, 49.7, 49.9)

VALID_FREQ_MIN = 45.0
VALID_FREQ_MAX = 51.0
AXIS_X_MIN = 49.3
AXIS_X_MAX = 50.5


def _safe_name(text):
    return re.sub(r"[^A-Za-z0-9_-]+", "_", str(text)).strip("_")


def load_od_frequency_dataframe(excel_source, sheet_name=None):
    """
    Robust reader for SCADA / WBES Excel workbooks.
    Row 1 contains column headers; Row 2 is metadata/spurious (ignored); Row 3+ is data.
    Automatically handles files with or without an initial title row (e.g. 'STATES').
    """
    if isinstance(excel_source, (bytes, bytearray)):
        excel_file = BytesIO(excel_source)
    elif isinstance(excel_source, BytesIO):
        excel_file = excel_source
    else:
        excel_file = Path(excel_source)

    # Determine sheet name if not explicitly specified
    xl = pd.ExcelFile(excel_file, engine="openpyxl")
    if sheet_name is None:
        if "Sheet1" in xl.sheet_names:
            sheet = "Sheet1"
        else:
            sheet = xl.sheet_names[0]
    else:
        sheet = sheet_name

    # Reset buffer position if BytesIO
    if isinstance(excel_file, BytesIO):
        excel_file.seek(0)

    # Inspect the first few rows to locate the row containing FREQUENCY
    sample_df = pd.read_excel(excel_file, sheet_name=sheet, header=None, nrows=10, engine="openpyxl")
    
    header_row_idx = 0
    found_freq = False
    for r_idx in range(min(10, len(sample_df))):
        row_vals = [str(v).strip().upper() for v in sample_df.iloc[r_idx].dropna().values]
        if any("FREQUENCY" in v for v in row_vals):
            header_row_idx = r_idx
            found_freq = True
            break

    if isinstance(excel_file, BytesIO):
        excel_file.seek(0)

    # Business rule: Ignore row immediately following the header (Row 2 in standard layout, containing meter codes/metadata)
    skip_row = header_row_idx + 1

    df = pd.read_excel(
        excel_file,
        sheet_name=sheet,
        header=header_row_idx,
        skiprows=[skip_row],
        engine="openpyxl",
    )
    df.columns = [str(c).strip().upper() for c in df.columns]

    # Resolve Date & Time column if needed
    dt_candidates = [c for c in df.columns if any(k in c for k in ("DATE", "TIME", "TIMESTAMP"))]
    if not dt_candidates and len(df.columns) > 0:
        first_col = df.columns[0]
        if "UNNAMED" in first_col:
            df.rename(columns={first_col: "DATE & TIME"}, inplace=True)
            dt_candidates = ["DATE & TIME"]

    # Handle DVC schedule column alias (DVC ADJUSTED SCHEDULE vs DVC SCHEDULE)
    if "DVC ADJUSTED SCHEDULE" not in df.columns and "DVC SCHEDULE" in df.columns:
        df.rename(columns={"DVC SCHEDULE": "DVC ADJUSTED SCHEDULE"}, inplace=True)

    # Validate required columns
    required = {"FREQUENCY"}
    for schedule_col, actual_col in STATE_COLUMNS.values():
        required.add(schedule_col.upper())
        required.add(actual_col.upper())
        
    missing = sorted(required - set(df.columns))
    if missing:
        raise ValueError(
            "Required columns are missing from the input workbook: "
            + ", ".join(missing)
        )

    # Filter to only required columns to exclude unrelated columns and spurious data
    cols_to_keep = []
    if dt_candidates and dt_candidates[0] in df.columns:
        cols_to_keep.append(dt_candidates[0])
    cols_to_keep.append("FREQUENCY")
    for schedule_col, actual_col in STATE_COLUMNS.values():
        cols_to_keep.append(schedule_col.upper())
        cols_to_keep.append(actual_col.upper())

    df = df[cols_to_keep].copy()
    return df


def format_period_label(min_ts, max_ts):
    """Format human-readable period label for any date/time span."""
    if min_ts is None or max_ts is None or pd.isna(min_ts) or pd.isna(max_ts):
        return "Uploaded Period"
    try:
        t1 = pd.to_datetime(min_ts)
        t2 = pd.to_datetime(max_ts)
        if pd.isna(t1) or pd.isna(t2):
            return "Uploaded Period"
        m1, m2 = t1.strftime("%B"), t2.strftime("%B")
        y1, y2 = t1.strftime("%Y"), t2.strftime("%Y")
        d1, d2 = t1.strftime("%d-%b-%Y"), t2.strftime("%d-%b-%Y")
        total_days = (t2 - t1).days

        if total_days == 0:
            return d1
        if m1 == m2 and y1 == y2:
            if total_days >= 26 and t1.day <= 2:
                return f"{m1} {y1}"
            return f"{d1} to {d2}"
        elif y1 == y2:
            if total_days >= 55 and t1.day <= 2:
                return f"{m1}–{m2} {y1}"
            return f"{d1} to {d2}"
        else:
            return f"{d1} to {d2}"
    except Exception:
        return "Uploaded Period"


def detect_period_from_dataframe(df):
    """Infer a human-readable period label from date/time columns for any uploaded dataset."""
    date_col = next((c for c in df.columns if any(k in c for k in ("DATE", "TIME", "TIMESTAMP"))), None)
    if date_col is not None:
        try:
            ts_series = pd.to_datetime(df[date_col], errors="coerce").dropna()
            if not ts_series.empty:
                return format_period_label(ts_series.min(), ts_series.max())
        except Exception:
            pass
    return "Uploaded Period"


def generate_od_frequency_plots(
    excel_path,
    output_dir=None,
    sheet_name=None,
    dpi=400,
    title_period=None,
):
    """
    Generate one positive-deviation frequency scatter plot per state with embedded statistics table.
    Works dynamically for any uploaded dataset period.

    Args:
        excel_path: Path, BytesIO, or bytes of the uploaded Excel workbook.
        output_dir: Optional folder where plot PNGs, statistics XLSX, and ZIP are written.
        sheet_name: Sheet name or index (defaults to 'Sheet1' or first sheet).
        dpi: Output resolution, defaults to 400.
        title_period: Optional period string displayed in plot titles (auto-detected if None).

    Returns:
        {
          "plots": {"West Bengal": "/path/to/plot.png", ...},
          "plots_base64": {"West Bengal": "data:image/png;base64,...", ...},
          "plots_bytes": {"West Bengal": b'...', ...},
          "statistics": "/path/to/OD_Frequency_Statistics.xlsx" (if output_dir provided),
          "statistics_bytes": b'...',
          "statistics_base64": "data:...",
          "zip_path": "/path/to/OD_Frequency_Plots.zip" (if output_dir provided),
          "zip_bytes": b'...',
          "state_stats": {"West Bengal": [...], ...},
          "statistics_rows": [...],
          "period": "..."
        }
    """
    if output_dir:
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)

    df = load_od_frequency_dataframe(excel_path, sheet_name=sheet_name)
    if not title_period:
        title_period = detect_period_from_dataframe(df)

    freq = pd.to_numeric(df["FREQUENCY"], errors="coerce")
    valid_freq = freq.notna() & (freq >= VALID_FREQ_MIN) & (freq <= VALID_FREQ_MAX)

    plot_paths = {}
    plot_base64 = {}
    plot_bytes = {}
    stats_rows = []
    state_stats = {}

    for state, (schedule_col, actual_col) in STATE_COLUMNS.items():
        schedule = pd.to_numeric(df[schedule_col.upper()], errors="coerce")
        actual = pd.to_numeric(df[actual_col.upper()], errors="coerce")
        deviation = actual - schedule

        # Valid records for statistics: valid frequency (45-51 Hz) and valid numeric deviation
        valid = valid_freq & deviation.notna()

        # Business rule: Plot strictly positive deviation records (Actual - Schedule > 0)
        positive = valid & (deviation > 0)
        x = freq[positive].to_numpy()
        y = deviation[positive].to_numpy()

        measure = "Under-injection" if state == "DVC" else "Overdrawal"
        fig = plt.figure(figsize=(16, 11), facecolor="white")
        ax = fig.add_axes([0.075, 0.315, 0.89, 0.60])

        for low, high, color, label in FREQUENCY_BANDS:
            band_mask = (x >= low) & (x < high)
            if np.any(band_mask):
                ax.scatter(
                    x[band_mask], y[band_mask], s=11, c=color,
                    edgecolors="none", alpha=0.72, label=label,
                    rasterized=True, zorder=2,
                )
            else:
                ax.scatter([], [], s=11, c=color, edgecolors="none", label=label)

        for threshold in THRESHOLDS:
            ax.axvline(
                threshold, color="#333333", linestyle="--",
                linewidth=1.5, zorder=1,
            )

        # Consistent x-axis range across all state plots
        ax.set_xlim(left=AXIS_X_MIN, right=AXIS_X_MAX)
        ax.xaxis.set_major_locator(MultipleLocator(0.1))
        ax.xaxis.set_major_formatter(plt.FormatStrFormatter('%.1f'))

        ax.set_title(
            f"{state} — {title_period}: Frequency vs {measure}",
            fontsize=19, fontweight="bold", pad=12,
        )
        ax.set_xlabel("Frequency (Hz)", fontsize=15, fontweight="bold", labelpad=7)
        ax.set_ylabel(f"{measure} (MW)", fontsize=15, fontweight="bold", labelpad=8)
        ax.tick_params(axis="both", labelsize=12)
        ax.grid(True, linestyle=":", linewidth=0.65, alpha=0.35)
        ax.set_axisbelow(True)
        ax.legend(
            title="Frequency band", fontsize=10.5, title_fontsize=10.5,
            loc="upper right", framealpha=0.96, markerscale=1.8,
        )

        table_rows = []
        state_threshold_list = []
        for threshold in THRESHOLDS:
            # Denominator: count all valid 1-min blocks below threshold (45-51 Hz), including zero/negative deviation
            below = valid & (freq < threshold)
            total = int(below.sum())

            # Numerator: count only strictly positive deviation blocks below threshold
            positive_below = below & (deviation > 0)
            positive_count = int(positive_below.sum())

            percentage = (100.0 * positive_count / total) if total > 0 else np.nan
            maximum = float(deviation[positive_below].max()) if positive_count > 0 else np.nan

            table_rows.append([
                f"<{threshold:.2f} Hz",
                f"{total:,}",
                f"{positive_count:,} ({percentage:.1f}%)" if total and pd.notna(percentage) else "0 (—)",
                f"{maximum:,.1f}" if pd.notna(maximum) else "—",
            ])
            stat_record = {
                "Period": title_period,
                "State": state,
                "Measure": measure,
                "Frequency threshold": f"<{threshold:.2f} Hz",
                "Total Duration (Minutes)": total,
                "Total valid 1-min blocks below threshold": total,
                "Positive deviation minutes": positive_count,
                "Positive deviation blocks": positive_count,
                "Positive deviation minutes (%)": percentage,
                "Positive deviation blocks (%)": percentage,
                "Maximum positive deviation (MW)": maximum,
                f"{measure} minutes": positive_count,
                f"{measure} blocks": positive_count,
                f"{measure} minutes (%)": percentage,
                f"{measure} blocks (%)": percentage,
                f"Maximum {measure} (MW)": maximum,
            }
            stats_rows.append(stat_record)
            state_threshold_list.append({
                "threshold": f"<{threshold:.2f} Hz",
                "total_minutes": total,
                "total_blocks": total,
                "positive_minutes": positive_count,
                "positive_blocks": positive_count,
                "percentage": percentage,
                "maximum_mw": maximum,
            })

        state_stats[state] = state_threshold_list

        table_ax = fig.add_axes([0.045, 0.055, 0.91, 0.205])
        table_ax.axis("off")
        table = table_ax.table(
            cellText=table_rows,
            colLabels=[
                "Frequency Threshold",
                "Total Duration (Minutes)",
                f"{measure} Time\n(Minutes and %)",
                f"Maximum {measure} (MW)",
            ],
            cellLoc="center", colLoc="center", bbox=[0, 0, 1, 1],
            colWidths=[0.20, 0.24, 0.28, 0.28],
        )
        table.auto_set_font_size(False)
        table.set_fontsize(13)
        table.scale(1, 2.0)
        for (row, col), cell in table.get_celld().items():
            cell.set_edgecolor("#17202A")
            cell.set_linewidth(1.15)
            if row == 0:
                cell.set_facecolor("#17365D")
                cell.get_text().set_color("white")
                cell.get_text().set_fontweight("bold")
                cell.get_text().set_fontsize(12.5)
            else:
                cell.set_facecolor("#EAF1F8" if row % 2 else "#D8E4F0")
                if col == 0:
                    cell.get_text().set_fontweight("bold")

        buf = BytesIO()
        fig.savefig(buf, format="png", dpi=dpi, facecolor="white")
        buf.seek(0)
        raw_png = buf.getvalue()
        plot_bytes[state] = raw_png
        plot_base64[state] = f"data:image/png;base64,{base64.b64encode(raw_png).decode('ascii')}"

        if output_dir:
            path = output_dir / f"{_safe_name(state)}_OD_Frequency.png"
            with open(path, "wb") as f_out:
                f_out.write(raw_png)
            plot_paths[state] = str(path)

        plt.close(fig)

    stats_df = pd.DataFrame(stats_rows)
    stats_buf = BytesIO()
    with pd.ExcelWriter(stats_buf, engine="openpyxl") as writer:
        stats_df.to_excel(writer, sheet_name="OD_Frequency_Stats", index=False)
    stats_buf.seek(0)
    statistics_bytes = stats_buf.getvalue()

    statistics_path = None
    if output_dir:
        statistics_path = str(output_dir / "OD_Frequency_Statistics.xlsx")
        with open(statistics_path, "wb") as f_out:
            f_out.write(statistics_bytes)

    statistics_base64 = f"data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,{base64.b64encode(statistics_bytes).decode('ascii')}"

    # Build consolidated ZIP archive containing all 6 PNG plots and the Excel statistics workbook
    zip_buf = BytesIO()
    with zipfile.ZipFile(zip_buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        for state, raw_png in plot_bytes.items():
            zf.writestr(f"{_safe_name(state)}_OD_Frequency.png", raw_png)
        zf.writestr("OD_Frequency_Statistics.xlsx", statistics_bytes)
    zip_buf.seek(0)
    zip_bytes = zip_buf.getvalue()

    zip_path = None
    if output_dir:
        zip_path = str(output_dir / "OD_Frequency_Plots.zip")
        with open(zip_path, "wb") as f_out:
            f_out.write(zip_bytes)

    return {
        "plots": plot_paths,
        "plots_base64": plot_base64,
        "plots_bytes": plot_bytes,
        "statistics": statistics_path,
        "statistics_bytes": statistics_bytes,
        "statistics_base64": statistics_base64,
        "zip_path": zip_path,
        "zip_bytes": zip_bytes,
        "state_stats": state_stats,
        "statistics_rows": stats_rows,
        "period": title_period,
    }



# Standalone runner:
if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Generate positive-deviation OD/UI frequency plots.")
    parser.add_argument("excel_path", help="Path to the combined Excel input file")
    parser.add_argument("--output-dir", default="od_frequency_plots")
    parser.add_argument("--sheet", default="0", help="Sheet name or index (default: first sheet)")
    parser.add_argument("--period", default=None)
    args = parser.parse_args()

    sheet = int(args.sheet) if str(args.sheet).isdigit() else args.sheet
    result = generate_od_frequency_plots(
        args.excel_path, args.output_dir, sheet_name=sheet, title_period=args.period
    )
    for state, path in result["plots"].items():
        print(f"{state}: {path}")
    print(f"Statistics workbook: {result['statistics']}")
