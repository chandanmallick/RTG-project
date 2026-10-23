"""
Frequency Analysis Curves Service
Publication-quality frequency analysis curves for ERLDC / GRID-INDIA reports:
1. Daily Minimum Frequency + Low-Frequency Duration (combined 2-panel chart)
2. Frequency Duration Curve / Cumulative Distribution with period comparisons
3. Average Daily Frequency Profile (24-hour diurnal mean + middle 80% range [10th-90th percentile])
"""

import base64
import io
import re
import zipfile
from io import BytesIO
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Union

import matplotlib
matplotlib.use("Agg")
import matplotlib.dates as mdates
import matplotlib.pyplot as plt
from matplotlib.ticker import FormatStrFormatter, MultipleLocator
import numpy as np
import pandas as pd


# Valid frequency filtering range (Hz)
VALID_FREQ_MIN = 45.0
VALID_FREQ_MAX = 51.0

# Reference thresholds
TH_IEGC_UPPER = 50.05
TH_NOMINAL = 50.00
TH_IEGC_LOWER = 49.90
TH_BAND_MID = 49.85
TH_BAND_LOW = 49.70
TH_UFR_STAGE1 = 49.50
TH_UFR_STAGE2 = 49.40

# Colors for Frequency Duration bands
COLOR_BELOW_49_50 = "#D7191C"   # Red (<49.50 Hz)
COLOR_49_50_49_70 = "#F07800"   # Orange (49.50–<49.70 Hz)
COLOR_49_70_49_85 = "#7B2CBF"   # Purple (49.70–<49.85 Hz)
COLOR_49_85_49_90 = "#2563EB"   # Blue (49.85–<49.90 Hz)

# Styling palette
COLOR_PRIMARY_BLUE = "#1E3A8A"
COLOR_LINE_DARK = "#334155"
COLOR_UFR_RED = "#DC2626"
COLOR_IEGC_GREEN = "#059669"
COLOR_SHADED_BAND = "#E0F2FE"
COLOR_PERCENTILE_FILL = "#93C5FD"


def _safe_name(text: str) -> str:
    return re.sub(r"[^A-Za-z0-9_-]+", "_", str(text)).strip("_")


def prepare_frequency_series(
    source: Union[pd.DataFrame, dict, bytes, bytearray, BytesIO, Path, str],
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> pd.DataFrame:
    """
    Standardize raw input into a clean 1-minute frequency dataframe.
    Columns returned: ['DATETIME', 'DATE', 'TIME', 'MINUTE_OF_DAY', 'FREQUENCY'].
    Spurious readings (<45.0 Hz or >51.0 Hz), blanks, and NaNs are filtered out.
    """
    df_raw = None

    if isinstance(source, pd.DataFrame):
        df_raw = source.copy()
    elif isinstance(source, dict):
        times = source.get("times") or source.get("timestamp") or []
        freqs = source.get("frequency") or source.get("freq") or []
        if len(times) and len(freqs):
            # Check if times are numeric epoch seconds
            if isinstance(times[0], (int, float, np.integer, np.floating)):
                dt_series = pd.to_datetime(times, unit="s")
            else:
                dt_series = pd.to_datetime(times)
            df_raw = pd.DataFrame({"DATETIME": dt_series, "FREQUENCY": freqs})
    elif isinstance(source, (bytes, bytearray, BytesIO, Path, str)):
        from services.od_frequency_report import load_od_frequency_dataframe
        df_raw = load_od_frequency_dataframe(source)

    if df_raw is None or df_raw.empty:
        raise ValueError("No frequency data available from the provided source.")

    # Locate datetime column
    dt_candidates = [c for c in df_raw.columns if any(k in str(c).upper() for k in ("DATE", "TIME", "TIMESTAMP"))]
    if not dt_candidates:
        dt_col = df_raw.columns[0]
    else:
        dt_col = dt_candidates[0]

    # Locate frequency column
    freq_candidates = [c for c in df_raw.columns if "FREQ" in str(c).upper()]
    if not freq_candidates:
        raise ValueError("Workbook or dataset does not contain a 'FREQUENCY' column.")
    freq_col = freq_candidates[0]

    dt = pd.to_datetime(df_raw[dt_col], errors="coerce")
    freq = pd.to_numeric(df_raw[freq_col], errors="coerce")

    # Filter out invalid timestamps and frequencies outside valid range [45.0, 51.0] Hz
    valid = dt.notna() & freq.notna() & (freq >= VALID_FREQ_MIN) & (freq <= VALID_FREQ_MAX)
    df_clean = pd.DataFrame({
        "DATETIME": dt[valid],
        "FREQUENCY": freq[valid],
    }).sort_values("DATETIME").reset_index(drop=True)

    # Optional date range filtering
    if start_date:
        start_ts = pd.to_datetime(start_date)
        df_clean = df_clean[df_clean["DATETIME"] >= start_ts]
    if end_date:
        # If end_date is just YYYY-MM-DD, include the entire day up to 23:59:59
        end_ts = pd.to_datetime(end_date)
        if len(str(end_date).strip()) == 10:
            end_ts = end_ts + pd.Timedelta(days=1) - pd.Timedelta(seconds=1)
        df_clean = df_clean[df_clean["DATETIME"] <= end_ts]

    if df_clean.empty:
        raise ValueError("No valid frequency records found in the specified date range.")

    df_clean["DATE"] = df_clean["DATETIME"].dt.strftime("%Y-%m-%d")
    df_clean["TIME"] = df_clean["DATETIME"].dt.strftime("%H:%M")
    df_clean["MINUTE_OF_DAY"] = df_clean["DATETIME"].dt.hour * 60 + df_clean["DATETIME"].dt.minute
    return df_clean


def detect_period_label(df: pd.DataFrame) -> str:
    """Format human-friendly date period label."""
    if df.empty or "DATETIME" not in df:
        return "Frequency Analysis"
    min_dt = df["DATETIME"].min()
    max_dt = df["DATETIME"].max()
    if min_dt.month == max_dt.month and min_dt.year == max_dt.year:
        return min_dt.strftime("%B %Y")
    return f"{min_dt.strftime('%d %b %Y')} – {max_dt.strftime('%d %b %Y')}"


# ==============================================================================
# GRAPH 1: Daily Minimum Frequency + Low-Frequency Duration
# ==============================================================================

def compute_daily_min_and_duration(
    df: pd.DataFrame,
    ufr_reported_dates: Optional[Union[set, list]] = None,
) -> Dict:
    """
    Compute daily minimum frequency and stacked frequency duration band percentages.
    Bands:
      - Below 49.50 Hz
      - 49.50 to below 49.70 Hz
      - 49.70 to below 49.85 Hz
      - 49.85 to below 49.90 Hz
    """
    if ufr_reported_dates is None:
        ufr_reported_dates = set()
    else:
        ufr_reported_dates = set(str(d)[:10] for d in ufr_reported_dates)

    daily_rows = []
    month_transitions = []
    prev_month = None

    dates = sorted(df["DATE"].unique())

    for idx, d_str in enumerate(dates):
        sub = df[df["DATE"] == d_str]
        total_blocks = len(sub)
        if total_blocks == 0:
            continue

        f = sub["FREQUENCY"].to_numpy()
        min_f = float(np.min(f))
        min_idx = np.argmin(f)
        min_time = sub["TIME"].iloc[min_idx]

        # Stacked duration band counts
        cnt_below_49_50 = int(np.sum(f < TH_UFR_STAGE1))
        cnt_49_50_49_70 = int(np.sum((f >= TH_UFR_STAGE1) & (f < TH_BAND_LOW)))
        cnt_49_70_49_85 = int(np.sum((f >= TH_BAND_LOW) & (f < TH_BAND_MID)))
        cnt_49_85_49_90 = int(np.sum((f >= TH_BAND_MID) & (f < TH_IEGC_LOWER)))
        cnt_total_below_49_90 = int(np.sum(f < TH_IEGC_LOWER))

        pct_below_49_50 = (cnt_below_49_50 / total_blocks) * 100.0
        pct_49_50_49_70 = (cnt_49_50_49_70 / total_blocks) * 100.0
        pct_49_70_49_85 = (cnt_49_70_49_85 / total_blocks) * 100.0
        pct_49_85_49_90 = (cnt_49_85_49_90 / total_blocks) * 100.0
        pct_total_below_49_90 = (cnt_total_below_49_90 / total_blocks) * 100.0

        # Check UFR operation / reporting event
        is_ufr_reported = (d_str in ufr_reported_dates) or (min_f < TH_UFR_STAGE1)

        # Track month transition for vertical line separator
        dt_val = sub["DATETIME"].iloc[0]
        curr_month = (dt_val.year, dt_val.month)
        if prev_month is not None and curr_month != prev_month:
            month_transitions.append({
                "index": idx - 0.5,
                "date": d_str,
                "prev_month_label": pd.to_datetime(f"{prev_month[0]}-{prev_month[1]:02d}-01").strftime("%b %Y"),
                "curr_month_label": dt_val.strftime("%b %Y"),
            })
        prev_month = curr_month

        # Notable day flag for data label above bar (e.g. > 1% below 49.90 or any excursion < 49.70)
        is_notable = (pct_total_below_49_90 >= 0.75) or (cnt_below_49_50 > 0) or (cnt_49_50_49_70 > 0)

        daily_rows.append({
            "date": d_str,
            "display_date": pd.to_datetime(d_str).strftime("%d-%b"),
            "total_blocks": total_blocks,
            "minimum_frequency": round(min_f, 3),
            "minimum_time": min_time,
            "ufr_reported": is_ufr_reported,
            "pct_below_49_50": round(pct_below_49_50, 2),
            "pct_49_50_49_70": round(pct_49_50_49_70, 2),
            "pct_49_70_49_85": round(pct_49_70_49_85, 2),
            "pct_49_85_49_90": round(pct_49_85_49_90, 2),
            "pct_total_below_49_90": round(pct_total_below_49_90, 2),
            "is_notable": is_notable,
        })

    return {
        "daily_rows": daily_rows,
        "month_transitions": month_transitions,
        "total_days": len(daily_rows),
        "period": detect_period_label(df),
    }


def generate_daily_min_duration_plot(
    df: pd.DataFrame,
    ufr_reported_dates: Optional[Union[set, list]] = None,
    title_period: Optional[str] = None,
    dpi: int = 400,
) -> Tuple[bytes, str, Dict]:
    """
    Render 2-panel chart:
      Upper panel: Daily minimum frequency with IEGC and UFR threshold lines + UFR markers
      Lower panel: Frequency duration stacked bars with month separators and notable labels
    """
    stats = compute_daily_min_and_duration(df, ufr_reported_dates=ufr_reported_dates)
    rows = stats["daily_rows"]
    if not rows:
        raise ValueError("Cannot plot: no daily records.")

    if not title_period:
        title_period = stats["period"]

    dates = [r["date"] for r in rows]
    display_dates = [r["display_date"] for r in rows]
    min_freqs = [r["minimum_frequency"] for r in rows]
    ufr_flags = [r["ufr_reported"] for r in rows]

    x_indices = np.arange(len(dates))

    # Dynamic figure dimensions based on number of days
    fig_width = max(11.0, len(dates) * 0.28)
    fig, (ax_upper, ax_lower) = plt.subplots(
        nrows=2, ncols=1, figsize=(fig_width, 8.2),
        sharex=True, gridspec_kw={"height_ratios": [1.15, 1.0], "hspace": 0.08}
    )

    # ---------------- UPPER PANEL: Daily Minimum Frequency ----------------
    ax_upper.plot(
        x_indices, min_freqs, color=COLOR_PRIMARY_BLUE,
        linewidth=1.8, marker="o", markersize=4.5,
        markerfacecolor="#3B82F6", markeredgecolor=COLOR_PRIMARY_BLUE,
        label="Daily minimum frequency", zorder=3,
    )

    # Highlight days with reported UFR operation or stage breach
    ufr_x = [x_indices[i] for i, f in enumerate(ufr_flags) if f]
    ufr_y = [min_freqs[i] for i, f in enumerate(ufr_flags) if f]
    if ufr_x:
        ax_upper.scatter(
            ufr_x, ufr_y, color=COLOR_UFR_RED, marker="v", s=85,
            edgecolors="#7F1D1D", linewidth=1.2,
            label="UFR operation reported / stage breached", zorder=5,
        )
        for ux, uy in zip(ufr_x, ufr_y):
            ax_upper.annotate(
                f"{uy:.3f} Hz", (ux, uy),
                xytext=(0, 9), textcoords="offset points",
                ha="center", fontsize=8, fontweight="bold", color=COLOR_UFR_RED,
            )

    # Reference lines for IEGC and UFR stages
    ax_upper.axhline(TH_IEGC_LOWER, color=COLOR_LINE_DARK, linestyle="--", linewidth=1.2, label="49.90 Hz – IEGC lower band", zorder=2)
    ax_upper.axhline(TH_UFR_STAGE1, color=COLOR_UFR_RED, linestyle="--", linewidth=1.2, label="49.50 Hz – UFR stage", zorder=2)
    ax_upper.axhline(TH_UFR_STAGE2, color="#7F1D1D", linestyle=":", linewidth=1.2, label="49.40 Hz – UFR stage", zorder=2)

    # Upper axis styling
    y_min = min(49.35, float(np.min(min_freqs)) - 0.08)
    ax_upper.set_ylim(bottom=y_min, top=50.05)
    ax_upper.yaxis.set_major_formatter(FormatStrFormatter("%.2f"))
    ax_upper.set_ylabel("Frequency (Hz)", fontsize=11.5, fontweight="bold")
    ax_upper.set_title(f"Daily Minimum Frequency and Low-Frequency Duration ({title_period})", fontsize=14, fontweight="bold", pad=10)
    ax_upper.grid(True, linestyle=":", alpha=0.45, zorder=0)
    ax_upper.legend(loc="lower left", fontsize=8.5, framealpha=0.92, ncol=2)

    # ---------------- LOWER PANEL: Stacked Frequency Duration Bars ----------------
    bar_width = 0.65
    b_49_50 = np.array([r["pct_below_49_50"] for r in rows])
    b_50_70 = np.array([r["pct_49_50_49_70"] for r in rows])
    b_70_85 = np.array([r["pct_49_70_49_85"] for r in rows])
    b_85_90 = np.array([r["pct_49_85_49_90"] for r in rows])
    b_total = np.array([r["pct_total_below_49_90"] for r in rows])

    # Bottom stacking accumulators
    p1 = ax_lower.bar(x_indices, b_49_50, width=bar_width, color=COLOR_BELOW_49_50, label="Below 49.50 Hz", zorder=3)
    p2 = ax_lower.bar(x_indices, b_50_70, width=bar_width, bottom=b_49_50, color=COLOR_49_50_49_70, label="49.50–49.70 Hz", zorder=3)
    p3 = ax_lower.bar(x_indices, b_70_85, width=bar_width, bottom=b_49_50 + b_50_70, color=COLOR_49_70_49_85, label="49.70–49.85 Hz", zorder=3)
    p4 = ax_lower.bar(x_indices, b_85_90, width=bar_width, bottom=b_49_50 + b_50_70 + b_70_85, color=COLOR_49_85_49_90, label="49.85–49.90 Hz", zorder=3)

    # Annotations above notable bars
    max_pct = float(np.max(b_total)) if len(b_total) else 0.0
    for i, r in enumerate(rows):
        tot = r["pct_total_below_49_90"]
        if r["is_notable"] and tot > 0:
            ax_lower.annotate(
                f"{tot:.1f}%", (x_indices[i], tot),
                xytext=(0, 3.5), textcoords="offset points",
                ha="center", fontsize=7.5, fontweight="bold", color="#1F2937",
            )

    # Month vertical separators across both panels
    for trans in stats["month_transitions"]:
        m_idx = trans["index"]
        ax_upper.axvline(m_idx, color="#64748B", linestyle="-.", linewidth=1.2, zorder=4)
        ax_lower.axvline(m_idx, color="#64748B", linestyle="-.", linewidth=1.2, zorder=4)
        # Label separator month transition
        ax_upper.text(
            m_idx + 0.15, 50.02, trans["curr_month_label"],
            fontsize=8.5, fontweight="bold", color="#475569", va="top"
        )

    # Lower axis styling
    ax_lower.set_ylim(bottom=0, top=max(2.5, max_pct * 1.25))
    ax_lower.set_ylabel("Share of Day (% <49.90 Hz)", fontsize=11, fontweight="bold")
    ax_lower.set_xlabel("Date", fontsize=11.5, fontweight="bold", labelpad=8)
    ax_lower.grid(True, linestyle=":", alpha=0.45, zorder=0)
    ax_lower.legend(loc="upper right", fontsize=8.5, framealpha=0.92, ncol=4)

    # X-axis ticks
    step = 1 if len(dates) <= 25 else (2 if len(dates) <= 45 else 3)
    tick_pos = x_indices[::step]
    tick_labels = [display_dates[i] for i in tick_pos]
    ax_lower.set_xticks(tick_pos)
    ax_lower.set_xticklabels(tick_labels, rotation=45, ha="right", fontsize=9)
    ax_lower.set_xlim(-0.7, len(dates) - 0.3)

    fig.subplots_adjust(hspace=0.08, left=0.07, right=0.98, top=0.94, bottom=0.12)

    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=dpi, bbox_inches="tight")
    plt.close(fig)
    buf.seek(0)
    img_bytes = buf.getvalue()
    img_b64 = f"data:image/png;base64,{base64.b64encode(img_bytes).decode('ascii')}"

    return img_bytes, img_b64, stats


# ==============================================================================
# GRAPH 2: Frequency Duration Curve / Cumulative Distribution
# ==============================================================================

def compute_frequency_duration_curve(
    df: pd.DataFrame,
    comparison_dfs: Optional[Dict[str, pd.DataFrame]] = None,
) -> Dict:
    """
    Calculate empirical cumulative distribution curve P(Frequency <= f).
    Also calculates exact shares below key reference thresholds:
      49.50 Hz, 49.70 Hz, 49.90 Hz, 50.00 Hz, 50.05 Hz.
    """
    def _compute_single_curve(data_df: pd.DataFrame, label: str) -> Dict:
        f = data_df["FREQUENCY"].dropna().to_numpy()
        n = len(f)
        if n == 0:
            return {}
        f_sorted = np.sort(f)
        cum_pct = (np.arange(1, n + 1) / n) * 100.0

        # Exact threshold calculations
        thresholds = [49.50, 49.70, 49.90, 50.00, 50.05]
        threshold_stats = {}
        for th in thresholds:
            cnt = int(np.sum(f < th))
            pct = (cnt / n) * 100.0
            threshold_stats[f"{th:.2f}"] = {
                "threshold_hz": th,
                "count": cnt,
                "percentage": round(pct, 2),
                "label": f"{pct:.2f}% below {th:.2f} Hz" if th < 50.0 else f"{pct:.1f}% below {th:.2f} Hz",
            }

        # Downsample curve points evenly across 49.0–50.6 Hz range for clean rendering
        grid_f = np.linspace(max(49.1, float(f_sorted[0])), min(50.6, float(f_sorted[-1])), 350)
        # Search sorted
        idx = np.searchsorted(f_sorted, grid_f, side="right")
        grid_pct = (idx / n) * 100.0

        curve_points = [
            {"frequency": round(float(gf), 3), "percentage": round(float(gp), 2)}
            for gf, gp in zip(grid_f, grid_pct)
        ]

        return {
            "label": label,
            "total_points": n,
            "thresholds": threshold_stats,
            "curve_points": curve_points,
            "min_freq": round(float(f_sorted[0]), 3),
            "max_freq": round(float(f_sorted[-1]), 3),
        }

    primary_label = detect_period_label(df)
    primary_curve = _compute_single_curve(df, primary_label)

    comparison_curves = []
    if comparison_dfs:
        for comp_name, comp_df in comparison_dfs.items():
            if comp_df is not None and not comp_df.empty:
                c_data = _compute_single_curve(comp_df, comp_name)
                if c_data:
                    comparison_curves.append(c_data)

    return {
        "primary": primary_curve,
        "comparisons": comparison_curves,
        "period": primary_label,
    }


def generate_frequency_duration_plot(
    df: pd.DataFrame,
    comparison_dfs: Optional[Dict[str, pd.DataFrame]] = None,
    title_period: Optional[str] = None,
    dpi: int = 400,
) -> Tuple[bytes, str, Dict]:
    """
    Render Frequency Duration / Cumulative Distribution Curve with IEGC band highlight,
    reference threshold lines, dynamic annotations, and multi-period comparisons.
    """
    stats = compute_frequency_duration_curve(df, comparison_dfs=comparison_dfs)
    primary = stats["primary"]
    if not primary:
        raise ValueError("Cannot plot duration curve: no valid data.")

    if not title_period:
        title_period = stats["period"]

    fig, ax = plt.subplots(figsize=(10.5, 6.4))

    # Highlight IEGC Normal Operating Band (49.90–50.05 Hz)
    ax.axvspan(
        TH_IEGC_LOWER, TH_IEGC_UPPER,
        color=COLOR_SHADED_BAND, alpha=0.7,
        label="IEGC normal band (49.90–50.05 Hz)", zorder=0,
    )

    # Reference vertical lines at key frequencies
    ref_points = [49.50, 49.70, 49.90, 50.00, 50.05]
    for rf in ref_points:
        ls = "--" if rf in (49.90, 50.05) else (":" if rf in (49.50, 49.70) else "-.")
        color = COLOR_LINE_DARK if rf in (49.90, 50.00) else (COLOR_UFR_RED if rf <= 49.70 else COLOR_IEGC_GREEN)
        ax.axvline(rf, color=color, linestyle=ls, linewidth=1.1, alpha=0.75, zorder=1)

    # Plot Comparison Curves first (if any)
    comp_colors = ["#059669", "#DC2626", "#D97706", "#7C3AED"]
    comp_styles = ["--", "-.", ":", "--"]

    for idx, comp in enumerate(stats.get("comparisons", [])):
        pts = comp["curve_points"]
        cx = [p["frequency"] for p in pts]
        cy = [p["percentage"] for p in pts]
        col = comp_colors[idx % len(comp_colors)]
        sty = comp_styles[idx % len(comp_styles)]
        ax.plot(cx, cy, color=col, linestyle=sty, linewidth=2.0, label=f"Comparison: {comp['label']}", zorder=2)

    # Plot Primary Curve (Bold solid)
    pts = primary["curve_points"]
    px = [p["frequency"] for p in pts]
    py = [p["percentage"] for p in pts]
    ax.plot(px, py, color=COLOR_PRIMARY_BLUE, linewidth=2.4, label=f"{primary['label']}", zorder=3)

    # Mark exact threshold points on primary curve
    th_stats = primary["thresholds"]
    for rf in [49.50, 49.70, 49.90, 50.00, 50.05]:
        key = f"{rf:.2f}"
        if key in th_stats:
            val_pct = th_stats[key]["percentage"]
            ax.scatter([rf], [val_pct], color=COLOR_PRIMARY_BLUE, s=40, zorder=5, edgecolors="#FFFFFF", linewidth=1.0)

    # Dynamic annotation card in top-left
    annot_lines = ["Key Threshold Shares (Current Period):"]
    for rf in [49.50, 49.70, 49.90, 50.00, 50.05]:
        key = f"{rf:.2f}"
        if key in th_stats:
            annot_lines.append(f"• {th_stats[key]['label']}")

    annot_text = "\n".join(annot_lines)
    ax.text(
        0.03, 0.95, annot_text, transform=ax.transAxes,
        fontsize=9, verticalalignment="top",
        bbox=dict(boxstyle="round,pad=0.6", facecolor="#F8FAFC", edgecolor="#CBD5E1", alpha=0.95),
        zorder=6,
    )

    # Axis styling
    ax.set_xlim(49.3, 50.35)
    ax.set_ylim(-1, 101)
    ax.xaxis.set_major_locator(MultipleLocator(0.1))
    ax.xaxis.set_major_formatter(FormatStrFormatter("%.2f"))
    ax.yaxis.set_major_locator(MultipleLocator(10))
    ax.yaxis.set_major_formatter(FormatStrFormatter("%d%%"))

    ax.set_title(f"Frequency Duration Curve — Cumulative Distribution ({title_period})", fontsize=13.5, fontweight="bold", pad=12)
    ax.set_xlabel("Frequency (Hz)", fontsize=11.5, fontweight="bold", labelpad=8)
    ax.set_ylabel("Share of Time Below Frequency (%)", fontsize=11.5, fontweight="bold", labelpad=8)
    ax.grid(True, linestyle=":", alpha=0.5, zorder=0)
    ax.legend(loc="lower right", fontsize=9, framealpha=0.94)

    plt.tight_layout()

    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=dpi, bbox_inches="tight")
    plt.close(fig)
    buf.seek(0)
    img_bytes = buf.getvalue()
    img_b64 = f"data:image/png;base64,{base64.b64encode(img_bytes).decode('ascii')}"

    return img_bytes, img_b64, stats


# ==============================================================================
# GRAPH 3: Average Daily Frequency Profile (24-Hour Diurnal)
# ==============================================================================

def compute_daily_frequency_profile(df: pd.DataFrame) -> Dict:
    """
    Calculate 24-hour diurnal profile minute-by-minute across all selected days:
      - Average frequency at every minute
      - 10th percentile
      - 90th percentile (Middle 80% range)
      - Minimum and maximum observations
      - Dynamically detected morning and evening dips
      - 10th percentile severe minimum annotation
    """
    # Group by minute of day (0 to 1439)
    minutes = np.arange(1440)
    mean_profile = np.full(1440, np.nan)
    p10_profile = np.full(1440, np.nan)
    p90_profile = np.full(1440, np.nan)
    min_profile = np.full(1440, np.nan)
    max_profile = np.full(1440, np.nan)

    grouped = df.groupby("MINUTE_OF_DAY")["FREQUENCY"]
    for m, vals in grouped:
        v = vals.to_numpy()
        if len(v) > 0:
            mean_profile[m] = float(np.mean(v))
            p10_profile[m] = float(np.percentile(v, 10))
            p90_profile[m] = float(np.percentile(v, 90))
            min_profile[m] = float(np.min(v))
            max_profile[m] = float(np.max(v))

    # Interpolate any minute gaps if necessary
    def _fill_series(arr):
        s = pd.Series(arr)
        if s.isna().any():
            s = s.interpolate().bfill().ffill()
        return s.to_numpy()

    mean_profile = _fill_series(mean_profile)
    p10_profile = _fill_series(p10_profile)
    p90_profile = _fill_series(p90_profile)
    min_profile = _fill_series(min_profile)
    max_profile = _fill_series(max_profile)

    # Dynamic identification of low-frequency troughs:
    # 1. Morning trough window (typically 05:00–08:30 = minutes 300 to 510)
    m_morn_range = (300, min(510, 1440))
    idx_morn = m_morn_range[0] + int(np.argmin(mean_profile[m_morn_range[0]:m_morn_range[1]]))
    val_morn = float(mean_profile[idx_morn])
    time_morn = f"{idx_morn // 60:02d}:{idx_morn % 60:02d}"

    # 2. Evening trough window (typically 17:30–21:30 = minutes 1050 to 1290)
    m_eve_range = (1050, min(1290, 1440))
    idx_eve = m_eve_range[0] + int(np.argmin(mean_profile[m_eve_range[0]:m_eve_range[1]]))
    val_eve = float(mean_profile[idx_eve])
    time_eve = f"{idx_eve // 60:02d}:{idx_eve % 60:02d}"

    # 3. Overall lowest average minute
    idx_global = int(np.argmin(mean_profile))
    val_global = float(mean_profile[idx_global])
    time_global = f"{idx_global // 60:02d}:{idx_global % 60:02d}"

    # 4. Severe minimum: lowest 10th percentile point
    idx_p10_min = int(np.argmin(p10_profile))
    val_p10_min = float(p10_profile[idx_p10_min])
    time_p10_min = f"{idx_p10_min // 60:02d}:{idx_p10_min % 60:02d}"
    p10_annotation = f"1 day in 10 below {val_p10_min:.3f} Hz at {time_p10_min}"

    # Downsample minute series to 15-minute or 5-minute points for JSON payload
    profile_points = []
    for m in range(0, 1440, 5):
        profile_points.append({
            "minute": m,
            "time": f"{m // 60:02d}:{m % 60:02d}",
            "mean": round(float(mean_profile[m]), 3),
            "p10": round(float(p10_profile[m]), 3),
            "p90": round(float(p90_profile[m]), 3),
            "min": round(float(min_profile[m]), 3),
            "max": round(float(max_profile[m]), 3),
        })

    return {
        "period": detect_period_label(df),
        "total_days_analyzed": len(df["DATE"].unique()),
        "morning_dip": {
            "minute": idx_morn,
            "time": time_morn,
            "average_frequency": round(val_morn, 3),
            "label": f"Average {val_morn:.3f} Hz at {time_morn}",
        },
        "evening_dip": {
            "minute": idx_eve,
            "time": time_eve,
            "average_frequency": round(val_eve, 3),
            "label": f"Average {val_eve:.3f} Hz at {time_eve}",
        },
        "global_minimum": {
            "minute": idx_global,
            "time": time_global,
            "average_frequency": round(val_global, 3),
            "label": f"Global lowest average: {val_global:.3f} Hz at {time_global}",
        },
        "severe_minimum_p10": {
            "minute": idx_p10_min,
            "time": time_p10_min,
            "frequency": round(val_p10_min, 3),
            "label": p10_annotation,
        },
        "profile_points": profile_points,
    }


def generate_daily_profile_plot(
    df: pd.DataFrame,
    title_period: Optional[str] = None,
    dpi: int = 400,
) -> Tuple[bytes, str, Dict]:
    """
    Render 24-Hour Diurnal Frequency Profile:
      - Average frequency curve
      - Shaded middle 80% range (10th to 90th percentile)
      - Reference horizontal lines (50.05, 49.90, 49.50 Hz)
      - Dynamic annotations at morning and evening dips + 10th percentile severe minimum
    """
    stats = compute_daily_frequency_profile(df)
    if not title_period:
        title_period = stats["period"]

    # Reconstruct minute arrays for plotting
    pts = stats["profile_points"]
    minutes = np.array([p["minute"] for p in pts])
    means = np.array([p["mean"] for p in pts])
    p10s = np.array([p["p10"] for p in pts])
    p90s = np.array([p["p90"] for p in pts])

    fig, ax = plt.subplots(figsize=(11.0, 6.2))

    # Shaded middle 80% range (10th to 90th percentile)
    ax.fill_between(
        minutes, p10s, p90s,
        color=COLOR_PERCENTILE_FILL, alpha=0.45,
        label="Middle 80% of days (10th–90th percentile)", zorder=1,
    )

    # Average frequency curve
    ax.plot(
        minutes, means,
        color=COLOR_PRIMARY_BLUE, linewidth=2.2,
        label="Average frequency", zorder=3,
    )

    # Horizontal reference lines
    ax.axhline(TH_IEGC_UPPER, color=COLOR_IEGC_GREEN, linestyle="--", linewidth=1.1, label="50.05 Hz – IEGC upper band", zorder=2)
    ax.axhline(TH_IEGC_LOWER, color=COLOR_LINE_DARK, linestyle="--", linewidth=1.1, label="49.90 Hz – IEGC lower band", zorder=2)
    ax.axhline(TH_UFR_STAGE1, color=COLOR_UFR_RED, linestyle="--", linewidth=1.1, label="49.50 Hz – UFR stage", zorder=2)

    # Dynamic annotations for Morning dip and Evening dip
    morn = stats["morning_dip"]
    eve = stats["evening_dip"]
    p10_min = stats["severe_minimum_p10"]

    # Morning dip arrow annotation
    ax.annotate(
        morn["label"],
        xy=(morn["minute"], morn["average_frequency"]),
        xytext=(morn["minute"] - 50, morn["average_frequency"] - 0.08),
        arrowprops=dict(arrowstyle="->", color=COLOR_PRIMARY_BLUE, lw=1.2),
        fontsize=8.5, fontweight="bold", color=COLOR_PRIMARY_BLUE,
        bbox=dict(boxstyle="round,pad=0.35", facecolor="#EFF6FF", edgecolor="#93C5FD", alpha=0.9),
        zorder=6,
    )

    # Evening dip arrow annotation
    ax.annotate(
        eve["label"],
        xy=(eve["minute"], eve["average_frequency"]),
        xytext=(eve["minute"] - 130, eve["average_frequency"] - 0.08),
        arrowprops=dict(arrowstyle="->", color=COLOR_PRIMARY_BLUE, lw=1.2),
        fontsize=8.5, fontweight="bold", color=COLOR_PRIMARY_BLUE,
        bbox=dict(boxstyle="round,pad=0.35", facecolor="#EFF6FF", edgecolor="#93C5FD", alpha=0.9),
        zorder=6,
    )

    # 10th percentile severe minimum annotation card
    ax.text(
        0.03, 0.06,
        f"Statistical Observation:\n• {p10_min['label']}\n• Days analyzed: {stats['total_days_analyzed']}",
        transform=ax.transAxes, fontsize=8.5,
        bbox=dict(boxstyle="round,pad=0.5", facecolor="#F8FAFC", edgecolor="#CBD5E1", alpha=0.95),
        zorder=6,
    )

    # X-axis formatting: 00:00 to 24:00 with 2-hour ticks
    tick_minutes = np.arange(0, 1441, 120)
    tick_labels = [f"{m // 60:02d}:00" if m < 1440 else "24:00" for m in tick_minutes]
    ax.set_xticks(tick_minutes)
    ax.set_xticklabels(tick_labels, fontsize=9.5)
    ax.set_xlim(0, 1440)

    # Y-axis scaling
    y_min = min(49.40, float(np.min(p10s)) - 0.05)
    y_max = max(50.15, float(np.max(p90s)) + 0.05)
    ax.set_ylim(y_min, y_max)
    ax.yaxis.set_major_formatter(FormatStrFormatter("%.2f"))

    ax.set_title(f"Average Daily Frequency Profile (24-Hour Diurnal) — {title_period}", fontsize=13.5, fontweight="bold", pad=12)
    ax.set_xlabel("Time of Day (Hours IST)", fontsize=11.5, fontweight="bold", labelpad=8)
    ax.set_ylabel("Frequency (Hz)", fontsize=11.5, fontweight="bold", labelpad=8)
    ax.grid(True, linestyle=":", alpha=0.5, zorder=0)
    ax.legend(loc="upper right", fontsize=8.5, framealpha=0.94)

    plt.tight_layout()

    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=dpi, bbox_inches="tight")
    plt.close(fig)
    buf.seek(0)
    img_bytes = buf.getvalue()
    img_b64 = f"data:image/png;base64,{base64.b64encode(img_bytes).decode('ascii')}"

    return img_bytes, img_b64, stats


# ==============================================================================
# CONSOLIDATED GENERATION FUNCTION
# ==============================================================================

def generate_all_frequency_curves(
    source: Union[pd.DataFrame, dict, bytes, bytearray, BytesIO, Path, str],
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    comparison_periods: Optional[List[Dict[str, str]]] = None,
    ufr_reported_dates: Optional[Union[set, list]] = None,
    output_dir: Optional[Union[Path, str]] = None,
    dpi: int = 400,
) -> Dict:
    """
    Generate all 3 publication frequency analysis graphs and data:
      1. Daily Minimum Frequency + Low-Frequency Duration
      2. Frequency Duration Curve (Cumulative Distribution) with period comparisons
      3. Average Daily Frequency Profile (24-hour diurnal profile)
    """
    df = prepare_frequency_series(source, start_date=start_date, end_date=end_date)
    title_period = detect_period_label(df)

    # Process comparison periods for Graph 2 if provided
    comp_dfs = {}
    if comparison_periods:
        for comp in comparison_periods:
            c_label = comp.get("label") or f"{comp.get('start_date')} – {comp.get('end_date')}"
            try:
                c_df = prepare_frequency_series(
                    source,
                    start_date=comp.get("start_date"),
                    end_date=comp.get("end_date"),
                )
                if not c_df.empty:
                    comp_dfs[c_label] = c_df
            except Exception as e:
                print(f"Warning: could not prepare comparison period {c_label}: {e}")

    # Generate Graph 1
    g1_bytes, g1_b64, g1_stats = generate_daily_min_duration_plot(
        df, ufr_reported_dates=ufr_reported_dates, title_period=title_period, dpi=dpi
    )

    # Generate Graph 2
    g2_bytes, g2_b64, g2_stats = generate_frequency_duration_plot(
        df, comparison_dfs=comp_dfs, title_period=title_period, dpi=dpi
    )

    # Generate Graph 3
    g3_bytes, g3_b64, g3_stats = generate_daily_profile_plot(
        df, title_period=title_period, dpi=dpi
    )

    plots_bytes = {
        "daily_min_duration": g1_bytes,
        "duration_curve": g2_bytes,
        "daily_profile": g3_bytes,
    }

    plots_b64 = {
        "daily_min_duration": g1_b64,
        "duration_curve": g2_b64,
        "daily_profile": g3_b64,
    }

    # Save to output_dir if specified
    saved_paths = {}
    if output_dir:
        out_path = Path(output_dir)
        out_path.mkdir(parents=True, exist_ok=True)
        for key, pbytes in plots_bytes.items():
            p_file = out_path / f"{key}.png"
            with open(p_file, "wb") as f_out:
                f_out.write(pbytes)
            saved_paths[key] = str(p_file)

    # Create ZIP archive of all 3 publication plots
    zip_buf = BytesIO()
    with zipfile.ZipFile(zip_buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("Daily_Minimum_and_Duration.png", g1_bytes)
        zf.writestr("Frequency_Duration_Curve.png", g2_bytes)
        zf.writestr("Average_Daily_Frequency_Profile.png", g3_bytes)
    zip_buf.seek(0)
    zip_bytes = zip_buf.getvalue()

    zip_path = None
    if output_dir:
        zip_path = str(Path(output_dir) / "Frequency_Analysis_Curves.zip")
        with open(zip_path, "wb") as f_out:
            f_out.write(zip_bytes)

    return {
        "success": True,
        "period": title_period,
        "plots_base64": plots_b64,
        "plots_bytes": plots_bytes,
        "plots_paths": saved_paths,
        "zip_bytes": zip_bytes,
        "zip_path": zip_path,
        "statistics": {
            "daily_min_duration": g1_stats,
            "duration_curve": g2_stats,
            "daily_profile": g3_stats,
        },
    }
