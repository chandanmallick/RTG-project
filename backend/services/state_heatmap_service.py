"""
State Performance Heatmap Service
Generates 15-minute time block OD/UI heatmaps for constituent states (ERLDC / GRID-INDIA):
- X-axis: 15-minute time block of the day (1 to 96; 15-minute intervals)
- Y-axis: Day of the Month (1 to 28/29/30/31)
- Color intensity: Positive Deviation (OD/UI in MW; Overdrawal for States, Under-injection for DVC)
- Severe overdrawals (>= 500 MW) annotated with value badges
- Matches publication-grade specifications
"""

import base64
from io import BytesIO
from pathlib import Path
import re
from typing import Dict, List, Optional, Tuple, Union
import zipfile

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

from services.od_frequency_report import STATE_COLUMNS, load_od_frequency_dataframe


def _safe_name(text: str) -> str:
    return re.sub(r"[^A-Za-z0-9_-]+", "_", str(text)).strip("_")


def block_time_label(block: int) -> str:
    """Convert 1-based 15-minute block number (1-96) to IST time range label (e.g. '00:00–00:15')."""
    start_min = (block - 1) * 15
    end_min = block * 15
    sh, sm = divmod(start_min, 60)
    eh, em = divmod(end_min, 60)
    return f"{sh:02d}:{sm:02d}–{eh:02d}:{em:02d}"


def format_month_label(dates_series: pd.Series) -> str:
    """Format month-year label such as 'Sep-26' or 'Sep-26 to Oct-26'."""
    clean = dates_series.dropna()
    if clean.empty:
        return "Month"
    min_d, max_d = clean.min(), clean.max()
    m1, y1 = min_d.strftime("%b"), min_d.strftime("%y")
    m2, y2 = max_d.strftime("%b"), max_d.strftime("%y")
    if m1 == m2 and y1 == y2:
        return f"{m1}-{y1}"
    return f"{m1}-{y1} to {m2}-{y2}"


def extract_state_time_series(
    source: Union[pd.DataFrame, dict, bytes, bytearray, BytesIO, Path, str],
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> Tuple[pd.DataFrame, Dict[str, Tuple[Optional[str], Optional[str], Optional[str]]], str]:
    """
    Extract a unified dataframe with datetime, time block (1-96), day of month,
    and actual/schedule/deviation columns for each constituent state.
    Returns: (df, state_cols_resolved, month_label)
    where state_cols_resolved maps state_name -> (sch_col, act_col, dev_col).
    """
    df = None
    state_cols_resolved = {}

    # Handle session dict wrapper if full session is passed
    if isinstance(source, dict) and "dataset" in source and isinstance(source["dataset"], dict):
        source = source["dataset"]

    if isinstance(source, dict) and "entities" in source and "times" in source:
        # Pre-parsed session dataset
        times = source["times"]
        # times are already local wall-clock seconds from timeline()/timestamp_array()
        dt_index = pd.to_datetime(np.asarray(times), unit="s", utc=False)
        n_times = len(dt_index)
        df_data = {"DATETIME": dt_index}

        for entity in source.get("entities", []):
            if entity.get("group") == "State":
                name = entity.get("display_name")
                if not name:
                    continue
                act = entity.get("actual")
                sch = entity.get("schedule")
                dev = entity.get("deviation")

                act_col = f"{name.upper()}_ACTUAL"
                sch_col = f"{name.upper()}_SCHEDULE"
                dev_col = f"{name.upper()}_DEVIATION"

                has_act_sch = (
                    act is not None
                    and sch is not None
                    and len(act) == n_times
                    and len(sch) == n_times
                )
                has_dev = dev is not None and len(dev) == n_times

                if has_act_sch:
                    df_data[act_col] = np.asarray(act, dtype=float)
                    df_data[sch_col] = np.asarray(sch, dtype=float)
                    if has_dev:
                        df_data[dev_col] = np.asarray(dev, dtype=float)
                    else:
                        df_data[dev_col] = np.asarray(act, dtype=float) - np.asarray(sch, dtype=float)
                    state_cols_resolved[name] = (sch_col, act_col)
                elif has_dev:
                    df_data[dev_col] = np.asarray(dev, dtype=float)
                    df_data[act_col] = np.full(n_times, np.nan)
                    df_data[sch_col] = np.full(n_times, np.nan)
                    state_cols_resolved[name] = (None, None, dev_col)

        df = pd.DataFrame(df_data)

    elif isinstance(source, pd.DataFrame):
        df = source.copy()
        dt_cand = next((c for c in df.columns if any(k in str(c).upper() for k in ("DATETIME", "DATE", "TIME", "TIMESTAMP"))), None)
        if dt_cand:
            df["DATETIME"] = pd.to_datetime(df[dt_cand], errors="coerce", format="mixed")
        else:
            raise ValueError("No datetime column identified in dataframe.")

    else:
        # Excel bytes, path, or BytesIO
        df = None
        try:
            df = load_od_frequency_dataframe(source)
            dt_cand = next((c for c in df.columns if any(k in str(c).upper() for k in ("DATETIME", "DATE", "TIME", "TIMESTAMP"))), None)
            if dt_cand:
                df["DATETIME"] = pd.to_datetime(df[dt_cand], errors="coerce", format="mixed")
        except Exception:
            # Fall back to flexible Excel read without hard 12-column requirement
            pass

        if df is None:
            if isinstance(source, (bytes, bytearray)):
                excel_file = BytesIO(source)
            elif isinstance(source, BytesIO):
                excel_file = source
            else:
                excel_file = Path(source)

            xl = pd.ExcelFile(excel_file, engine="openpyxl")
            sheet = "Sheet1" if "Sheet1" in xl.sheet_names else xl.sheet_names[0]
            sample = pd.read_excel(xl, sheet_name=sheet, header=None, nrows=10, engine="openpyxl")

            header_row_idx = 0
            for r_idx in range(min(10, len(sample))):
                row_vals = [str(v).strip().upper() for v in sample.iloc[r_idx].dropna().values]
                if any(any(k in v for k in ("DATE", "TIME", "FREQUENCY")) for v in row_vals):
                    header_row_idx = r_idx
                    break

            df = pd.read_excel(xl, sheet_name=sheet, header=header_row_idx, engine="openpyxl")
            if len(df) > 1 and df.iloc[0].isna().sum() > len(df.columns) * 0.4:
                df = df.iloc[1:].reset_index(drop=True)
            df.columns = [str(c).strip().upper() for c in df.columns]

            dt_cand = next((c for c in df.columns if any(k in str(c).upper() for k in ("DATETIME", "DATE", "TIME", "TIMESTAMP"))), None)
            if not dt_cand and len(df.columns) > 0 and "UNNAMED" in str(df.columns[0]).upper():
                df.rename(columns={df.columns[0]: "DATETIME"}, inplace=True)
                dt_cand = "DATETIME"

            if dt_cand:
                df["DATETIME"] = pd.to_datetime(df[dt_cand], errors="coerce", format="mixed")
            else:
                raise ValueError("No datetime column found in Excel workbook.")

    # Resolve state columns if not already resolved from dataset
    if not state_cols_resolved and df is not None:
        upper_cols = {str(c).upper(): c for c in df.columns}

        # Try predefined STATE_COLUMNS first
        for state, (sch_name, act_name) in STATE_COLUMNS.items():
            s_cand = upper_cols.get(sch_name.upper()) or upper_cols.get(f"{state.upper()} SCHEDULE")
            a_cand = upper_cols.get(act_name.upper()) or upper_cols.get(f"{state.upper()} ACTUAL")
            if s_cand and a_cand:
                state_cols_resolved[state] = (s_cand, a_cand)

        # Flexible alias matching for any remaining constituent state
        STATE_ALIASES = {
            "West Bengal": ["WB", "WEST BENGAL", "WEST_BENGAL"],
            "Bihar": ["BIHAR"],
            "DVC": ["DVC", "DVC ADJUSTED", "DVC_ADJUSTED"],
            "Jharkhand": ["JHARKHAND"],
            "Odisha": ["ODISHA", "ORISSA"],
            "Sikkim": ["SIKKIM"],
        }
        for state, aliases in STATE_ALIASES.items():
            if state in state_cols_resolved:
                continue
            s_cand, a_cand, d_cand = None, None, None
            for alias in aliases:
                for col_u, orig_c in upper_cols.items():
                    if alias in col_u:
                        if any(k in col_u for k in ("SCHEDULE", "SCH")):
                            s_cand = orig_c
                        elif any(k in col_u for k in ("ACTUAL", "ACT", "DRAWAL")):
                            a_cand = orig_c
                        elif any(k in col_u for k in ("DEVIATION", "DEV", "OD/UI")):
                            d_cand = orig_c
            if s_cand and a_cand:
                state_cols_resolved[state] = (s_cand, a_cand)
            elif d_cand:
                state_cols_resolved[state] = (None, None, d_cand)

    # Filter by date range if provided
    if df is not None and "DATETIME" in df.columns:
        df = df[df["DATETIME"].notna()].sort_values("DATETIME").copy()
        if start_date:
            t_start = pd.to_datetime(start_date)
            df = df[df["DATETIME"] >= t_start]
        if end_date:
            t_end = pd.to_datetime(end_date)
            if len(str(end_date)) <= 10:
                t_end = t_end + pd.Timedelta(days=1) - pd.Timedelta(seconds=1)
            df = df[df["DATETIME"] <= t_end]

    if df is None or df.empty:
        raise ValueError("No valid data rows found in the selected period.")

    # Calculate 15-minute time block (1 to 96) and Day of Month
    df["TIME_BLOCK"] = (df["DATETIME"].dt.hour * 4) + (df["DATETIME"].dt.minute // 15) + 1
    df["DAY"] = df["DATETIME"].dt.day
    df["DATE"] = df["DATETIME"].dt.date

    month_label = format_month_label(df["DATETIME"])
    return df, state_cols_resolved, month_label


def compute_state_heatmap_matrix(
    df: pd.DataFrame,
    state: str,
    sch_col: Optional[str] = None,
    act_col: Optional[str] = None,
    dev_col: Optional[str] = None,
    num_days: Optional[int] = None,
) -> Dict:
    """
    Compute 15-minute time block average OD/Deviation matrix for a state.
    Shape: (num_days, 96) where index 0 is Day 1, index num_days-1 is Day N.
    """
    days_present = sorted(df["DAY"].dropna().unique())
    if num_days is None:
        num_days = int(max(days_present)) if days_present else 30
        num_days = max(num_days, 28)

    schedule = pd.to_numeric(df[sch_col], errors="coerce") if sch_col and sch_col in df.columns else pd.Series(np.nan, index=df.index)
    actual = pd.to_numeric(df[act_col], errors="coerce") if act_col and act_col in df.columns else pd.Series(np.nan, index=df.index)

    if dev_col and dev_col in df.columns:
        deviation = pd.to_numeric(df[dev_col], errors="coerce")
    else:
        deviation = actual - schedule

    df_state = pd.DataFrame({
        "DAY": df["DAY"],
        "TIME_BLOCK": df["TIME_BLOCK"],
        "SCHEDULE": schedule,
        "ACTUAL": actual,
        "DEVIATION": deviation,
    })

    # Group by (DAY, TIME_BLOCK) and calculate 15-min averages
    grouped = df_state.groupby(["DAY", "TIME_BLOCK"]).agg({
        "DEVIATION": "mean",
        "SCHEDULE": "mean",
        "ACTUAL": "mean",
    }).reset_index()

    # Pre-allocate matrices (num_days x 96)
    matrix = np.zeros((num_days, 96), dtype=float)
    sch_matrix = np.zeros((num_days, 96), dtype=float)
    act_matrix = np.zeros((num_days, 96), dtype=float)
    raw_dev_matrix = np.zeros((num_days, 96), dtype=float)

    max_od = 0.0
    max_od_day = 1
    max_od_block = 1
    od_blocks_count = 0
    severe_blocks_count = 0
    positive_sum = 0.0

    for _, row in grouped.iterrows():
        try:
            d = int(row["DAY"])
            b = int(row["TIME_BLOCK"])
        except (ValueError, TypeError):
            continue

        if 1 <= d <= num_days and 1 <= b <= 96:
            avg_dev = float(row["DEVIATION"]) if pd.notna(row["DEVIATION"]) else 0.0
            avg_sch = float(row["SCHEDULE"]) if pd.notna(row["SCHEDULE"]) else 0.0
            avg_act = float(row["ACTUAL"]) if pd.notna(row["ACTUAL"]) else 0.0

            raw_dev_matrix[d - 1, b - 1] = avg_dev
            sch_matrix[d - 1, b - 1] = avg_sch
            act_matrix[d - 1, b - 1] = avg_act

            # Overdrawal / Positive deviation (MW)
            pos_dev = max(0.0, avg_dev)
            matrix[d - 1, b - 1] = pos_dev

            if pos_dev > 0.0:
                od_blocks_count += 1
                positive_sum += pos_dev
                if pos_dev > max_od:
                    max_od = pos_dev
                    max_od_day = d
                    max_od_block = b
                if pos_dev >= 500.0:
                    severe_blocks_count += 1

    total_cells = num_days * 96
    avg_od = positive_sum / od_blocks_count if od_blocks_count > 0 else 0.0

    stats = {
        "max_od": round(max_od, 1),
        "max_od_day": max_od_day,
        "max_od_block": max_od_block,
        "max_od_time": block_time_label(max_od_block),
        "avg_od": round(avg_od, 1),
        "od_blocks_count": od_blocks_count,
        "severe_blocks_count": severe_blocks_count,
        "total_blocks": total_cells,
        "od_percentage": round(od_blocks_count / total_cells * 100, 1),
    }

    return {
        "state": state,
        "num_days": num_days,
        "days": list(range(1, num_days + 1)),
        "blocks": list(range(1, 97)),
        "matrix": matrix,
        "raw_deviation_matrix": raw_dev_matrix,
        "schedule_matrix": sch_matrix,
        "actual_matrix": act_matrix,
        "stats": stats,
    }


def render_heatmap_figure(
    matrix_info: Dict,
    month_label: str,
    dpi: int = 250,
    annotation_threshold: Optional[float] = None,
) -> Tuple[plt.Figure, bytes]:
    """
    Render a high-resolution, publication-grade matplotlib heatmap exactly matching
    the attached ERLDC / GRID-INDIA chart specification:
    - X-axis: 1-96 15-minute time blocks (ticks at 1, 5, 9, ..., 93)
    - Y-axis: Day of the Month (1 to N, bottom to top)
    - Colormap: YlOrRd
    - High OD cells (>= 500 MW) annotated with bold white text on black badge
    - Thin white grid lines between all cells
    - Colorbar labeled 'Positive Deviation (OD/UI) (MW)'
    """
    state = matrix_info["state"]
    num_days = matrix_info["num_days"]
    matrix = matrix_info["matrix"]
    max_od = matrix_info["stats"]["max_od"]

    if annotation_threshold is None:
        if max_od >= 500.0:
            annotation_threshold = 500.0
        elif max_od >= 250.0:
            annotation_threshold = 250.0
        elif max_od > 50.0:
            annotation_threshold = max(50.0, float(np.nanpercentile(matrix[matrix > 0], 95)))
        else:
            annotation_threshold = 999999.0  # None annotated if tiny

    fig, ax = plt.subplots(figsize=(16.5, 7.6), dpi=dpi, facecolor="white")

    # Set vmin=0, vmax at least 100
    vmax = max(100.0, float(np.nanmax(matrix)) if np.any(np.isfinite(matrix)) else 100.0)

    # Use YlOrRd colormap
    cmap = plt.cm.YlOrRd

    # imshow with origin='lower' puts Day 1 at the bottom and Day N at the top
    # extent: [x_min, x_max, y_min, y_max] -> [0.5, 96.5, 0.5, num_days + 0.5]
    im = ax.imshow(
        matrix,
        aspect="auto",
        cmap=cmap,
        origin="lower",
        vmin=0.0,
        vmax=vmax,
        extent=[0.5, 96.5, 0.5, num_days + 0.5],
        interpolation="nearest",
    )

    # Annotate significant peaks with white text inside black rounded box
    for d_idx in range(num_days):
        day_val = d_idx + 1
        for b_idx in range(96):
            block_val = b_idx + 1
            val = matrix[d_idx, b_idx]
            if val >= annotation_threshold:
                ax.text(
                    block_val,
                    day_val,
                    f"{int(round(val))}",
                    color="white",
                    fontsize=5.2,
                    fontweight="bold",
                    ha="center",
                    va="center",
                    bbox=dict(
                        boxstyle="round,pad=0.18",
                        facecolor="black",
                        edgecolor="none",
                        alpha=0.85,
                    ),
                )

    # Axes limits
    ax.set_xlim(0.5, 96.5)
    ax.set_ylim(0.5, num_days + 0.5)

    # X-axis ticks (1, 5, 9, 13, ..., 93) - 4-block hourly interval
    x_ticks = [1, 5, 9, 13, 17, 21, 25, 29, 33, 37, 41, 45, 49, 53, 57, 61, 65, 69, 73, 77, 81, 85, 89, 93]
    ax.set_xticks(x_ticks)
    ax.set_xticklabels([str(t) for t in x_ticks], fontsize=8.5)
    ax.set_xlabel("Time Block (1-96; 15-minute blocks)", fontsize=10.5, fontweight="bold", labelpad=8)

    # Y-axis ticks (1, 2, 3, ..., num_days)
    y_ticks = list(range(1, num_days + 1))
    ax.set_yticks(y_ticks)
    ax.set_yticklabels([str(d) for d in y_ticks], fontsize=8)
    ax.set_ylabel("Day of the Month", fontsize=10.5, fontweight="bold", labelpad=8)

    # Thin white grid lines between every 15-minute block and every day
    ax.set_xticks(np.arange(0.5, 97.5, 1), minor=True)
    ax.set_yticks(np.arange(0.5, num_days + 1.5, 1), minor=True)
    ax.grid(which="minor", color="white", linestyle="-", linewidth=0.55)
    ax.tick_params(which="minor", size=0)
    ax.tick_params(which="major", length=3.5, width=0.8, color="#475569")

    # Spines
    for spine in ax.spines.values():
        spine.set_color("#CBD5E1")
        spine.set_linewidth(0.8)

    # Title
    ax.set_title(
        f"{state} — {month_label}: OD/UI Heatmap (15-minute Time Blocks)",
        fontsize=13.5,
        fontweight="bold",
        pad=14,
        color="#0F172A",
    )

    # Colorbar
    cbar = fig.colorbar(im, ax=ax, fraction=0.019, pad=0.015, shrink=0.92)
    cbar.set_label("Positive Deviation (OD/UI) (MW)", fontsize=9.5, fontweight="bold", labelpad=8, color="#0F172A")
    cbar.ax.tick_params(labelsize=8)
    cbar.outline.set_edgecolor("#94A3B8")
    cbar.outline.set_linewidth(0.6)

    fig.tight_layout()

    buf = BytesIO()
    try:
        fig.savefig(buf, format="png", dpi=dpi, bbox_inches="tight", facecolor="white")
    finally:
        plt.close(fig)
    return fig, buf.getvalue()


def generate_heatmap_excel(
    state_results: Dict[str, Dict],
    month_label: str,
) -> bytes:
    """Generate multi-tab Excel workbook containing 96-block matrix per state and consolidated summary."""
    wb = Workbook()
    ws_summary = wb.active
    ws_summary.title = "Heatmap Summary"

    # Header styling
    font_bold = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    font_title = Font(name="Calibri", size=13, bold=True, color="1E3A8A")
    fill_header = PatternFill(start_color="17365D", end_color="17365D", fill_type="solid")
    fill_alt = PatternFill(start_color="F1F5F9", end_color="F1F5F9", fill_type="solid")
    align_center = Alignment(horizontal="center", vertical="center")
    align_right = Alignment(horizontal="right", vertical="center")

    ws_summary.append([f"Constituent States 15-Minute OD/UI Heatmap Summary — {month_label}"])
    ws_summary.cell(1, 1).font = font_title
    ws_summary.append([])

    headers = [
        "State",
        "Max OD (MW)",
        "Peak Day",
        "Peak Time Block",
        "Peak Time Range (IST)",
        "Avg Positive OD (MW)",
        "Blocks with OD > 0",
        "Severe Blocks (>= 500 MW)",
        "OD Frequency (%)",
    ]
    ws_summary.append(headers)
    for col_idx in range(1, len(headers) + 1):
        cell = ws_summary.cell(3, col_idx)
        cell.font = font_bold
        cell.fill = fill_header
        cell.alignment = align_center

    row_num = 4
    for state, res in state_results.items():
        s = res["stats"]
        ws_summary.append([
            state,
            s["max_od"],
            s["max_od_day"],
            s["max_od_block"],
            s["max_od_time"],
            s["avg_od"],
            s["od_blocks_count"],
            s["severe_blocks_count"],
            s["od_percentage"],
        ])
        if row_num % 2 == 1:
            for col_idx in range(1, len(headers) + 1):
                ws_summary.cell(row_num, col_idx).fill = fill_alt
        row_num += 1

    if not state_results:
        ws_summary.append(["No State Performance Heatmap data available for the selected period."])
        ws_summary.cell(4, 1).font = Font(name="Calibri", size=10, italic=True)

    # Auto-adjust summary column widths safely
    for col in ws_summary.columns:
        max_len = max(len(str(cell.value or "")) for cell in col)
        col_ref = col[0].column
        col_letter = get_column_letter(col_ref) if isinstance(col_ref, int) else str(col_ref)
        ws_summary.column_dimensions[col_letter].width = max(max_len + 3, 12)

    # Detailed matrix sheet for each state
    for state, res in state_results.items():
        safe_title = _safe_name(state)[:28] or "State"
        ws = wb.create_sheet(title=safe_title)
        ws.append([f"{state} — 15-Minute Block Average Positive Deviation (OD/UI in MW) — {month_label}"])
        ws.cell(1, 1).font = font_title
        ws.append([])

        block_headers = ["Day of Month"] + [f"B{b} ({block_time_label(b)})" for b in range(1, 97)]
        ws.append(block_headers)
        ws.cell(3, 1).font = font_bold
        ws.cell(3, 1).fill = fill_header
        for b_idx in range(1, 97):
            cell = ws.cell(3, b_idx + 1)
            cell.font = Font(name="Calibri", size=9, bold=True, color="FFFFFF")
            cell.fill = PatternFill(start_color="2563EB", end_color="2563EB", fill_type="solid")
            cell.alignment = align_center

        matrix = res["matrix"]
        num_days = res["num_days"]
        for d_idx in range(num_days):
            day_num = d_idx + 1
            row_vals = [day_num] + [round(float(matrix[d_idx, b_idx]), 1) for b_idx in range(96)]
            ws.append(row_vals)
            cur_row = 4 + d_idx
            ws.cell(cur_row, 1).alignment = align_center
            ws.cell(cur_row, 1).font = Font(name="Calibri", bold=True)
            for b_idx in range(96):
                val = matrix[d_idx, b_idx]
                cell = ws.cell(cur_row, b_idx + 2)
                cell.alignment = align_right
                if val >= 500.0:
                    cell.fill = PatternFill(start_color="FCA5A5", end_color="FCA5A5", fill_type="solid")
                    cell.font = Font(bold=True, color="991B1B")
                elif val > 0.0:
                    cell.fill = PatternFill(start_color="FEF3C7", end_color="FEF3C7", fill_type="solid")

        ws.column_dimensions["A"].width = 14
        for b_idx in range(1, 97):
            col_letter = get_column_letter(b_idx + 1)
            ws.column_dimensions[col_letter].width = 11

    out = BytesIO()
    wb.save(out)
    return out.getvalue()


def generate_all_state_heatmaps(
    source: Union[pd.DataFrame, dict, bytes, bytearray, BytesIO, Path, str],
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    dpi: int = 250,
) -> Dict:
    """
    Generate complete state performance heatmaps for all constituent states.

    Returns:
        {
            "period": "Sep-26",
            "states": ["West Bengal", "Bihar", "DVC", "Jharkhand", "Odisha", "Sikkim"],
            "plots": {"West Bengal": "/path/to/...", ...},
            "plots_base64": {"West Bengal": "data:image/png;base64,...", ...},
            "plots_bytes": {"West Bengal": b'...', ...},
            "zip_bytes": b'...',
            "excel_bytes": b'...',
            "state_stats": {"West Bengal": {...}, ...},
            "interactive_data": {"West Bengal": {...}, ...},
        }
    """
    empty_result = {
        "period": "Selected Period",
        "states": [],
        "plots_base64": {},
        "plots_bytes": {},
        "zip_bytes": b"",
        "excel_bytes": b"",
        "state_stats": {},
        "interactive_data": {},
    }

    try:
        df, state_cols, month_label = extract_state_time_series(source, start_date, end_date)
    except Exception as exc:
        print(f"Warning: extract_state_time_series failed: {exc}")
        return empty_result

    if not state_cols or df.empty:
        empty_result["period"] = month_label or "Selected Period"
        return empty_result

    days_unique = df["DAY"].dropna().unique()
    num_days = int(max(days_unique)) if len(days_unique) > 0 else 30
    num_days = max(num_days, 28)

    plots_base64 = {}
    plots_bytes = {}
    state_results = {}
    interactive_data = {}
    state_stats = {}

    for state, col_info in state_cols.items():
        sch_col, act_col, *rest = col_info
        dev_col = rest[0] if rest else None

        try:
            matrix_res = compute_state_heatmap_matrix(
                df, state, sch_col=sch_col, act_col=act_col, dev_col=dev_col, num_days=num_days
            )
            state_results[state] = matrix_res
            state_stats[state] = matrix_res["stats"]

            # Render high-res publication chart
            _, img_bytes = render_heatmap_figure(matrix_res, month_label, dpi=dpi)
            plots_bytes[state] = img_bytes
            b64_str = f"data:image/png;base64,{base64.b64encode(img_bytes).decode('ascii')}"
            plots_base64[state] = b64_str

            # Format serializable interactive matrix for frontend ECharts
            interactive_data[state] = {
                "days": matrix_res["days"],
                "blocks": matrix_res["blocks"],
                "matrix": matrix_res["matrix"].tolist(),
                "raw_deviation_matrix": matrix_res["raw_deviation_matrix"].tolist(),
                "schedule_matrix": matrix_res["schedule_matrix"].tolist(),
                "actual_matrix": matrix_res["actual_matrix"].tolist(),
                "stats": matrix_res["stats"],
            }
        except Exception as state_err:
            print(f"Warning: Failed to render heatmap for state '{state}': {state_err}")
            continue

    excel_bytes = generate_heatmap_excel(state_results, month_label)

    # Generate ZIP package
    zip_buf = BytesIO()
    with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for state, raw in plots_bytes.items():
            zf.writestr(f"{_safe_name(state)}_OD_UI_Heatmap_{_safe_name(month_label)}.png", raw)
        zf.writestr(f"State_OD_UI_Heatmap_Data_{_safe_name(month_label)}.xlsx", excel_bytes)
    zip_bytes = zip_buf.getvalue()

    return {
        "period": month_label,
        "states": list(state_results.keys()),
        "plots_base64": plots_base64,
        "plots_bytes": plots_bytes,
        "zip_bytes": zip_bytes,
        "excel_bytes": excel_bytes,
        "state_stats": state_stats,
        "interactive_data": interactive_data,
    }
