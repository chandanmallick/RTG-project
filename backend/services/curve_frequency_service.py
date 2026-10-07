"""Frequency-only extraction through the existing PSP Curve reader."""
import math
from collections import OrderedDict
from threading import RLock
from time import monotonic
import json
from datetime import date, datetime, time, timedelta

from openpyxl.utils.datetime import from_excel


def curve_timestamp(value, day, sample_index):
    """Interpret Curve column C, deriving empty cells from its 30-second grid."""
    expected = datetime.combine(day, time()) + timedelta(seconds=sample_index * 30)
    if value is None or value == "":
        return expected, True
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        value = from_excel(value)
    if isinstance(value, str):
        text = value.strip()
        try:
            value = datetime.fromisoformat(text)
        except ValueError:
            try:
                value = time.fromisoformat(text)
            except ValueError as exc:
                raise ValueError(f"Invalid timestamp in 30SEC!C{sample_index + 8}.") from exc
    if isinstance(value, datetime):
        stamp = value.replace(tzinfo=None)
    elif isinstance(value, time):
        stamp = datetime.combine(day, value.replace(tzinfo=None))
    elif isinstance(value, date):
        stamp = datetime.combine(value, time())
    else:
        raise ValueError(f"Invalid timestamp in 30SEC!C{sample_index + 8}.")
    # Excel fractional-day arithmetic can introduce microsecond roundoff.
    stamp = stamp.replace(microsecond=0)
    if stamp != expected:
        raise ValueError(f"30SEC!C{sample_index + 8} does not match the Curve date's 30-second timeline.")
    return stamp, False


def extract_curve_frequency_rows(rows, date_str):
    """Consume ONLY C8:D2887 pairs, keeping missing readings as null gaps."""
    day = date.fromisoformat(date_str)
    rows = list(rows)
    if len(rows) != 2880:
        raise ValueError("30SEC must contain all 2880 rows in C8:D2887.")
    points, missing, derived = [], 0, 0
    for index, (time_value, frequency_value) in enumerate(rows):
        stamp, was_derived = curve_timestamp(time_value, day, index)
        derived += int(was_derived)
        try:
            frequency = float(frequency_value) if not isinstance(frequency_value, bool) else None
        except (TypeError, ValueError):
            frequency = None
        if frequency is None or not math.isfinite(frequency) or frequency < 45:
            frequency = None
            missing += 1
        points.append({"timestamp": stamp.isoformat(timespec="seconds"), "frequency": frequency})
    if missing == len(points):
        raise ValueError("30SEC!D8:D2887 contains no valid frequency readings.")
    return points, {"missing_readings": missing, "derived_timestamps": derived}


_series_cache=OrderedDict()
_series_lock=RLock()


def load_curve_frequency_range(start_date, end_date, refresh=False):
    # Lazy import avoids a router/service import cycle. File naming, location,
    # timeout, workbook readers and fallback are owned by the PSP integration.
    from routes.psp_routes import get_psp_config_with_curve_defaults, read_curve_file_series

    try:
        start, end = date.fromisoformat(start_date), date.fromisoformat(end_date)
    except ValueError as exc:
        raise ValueError("Dates must be YYYY-MM-DD.") from exc
    if end < start:
        raise ValueError("End date must be on or after start date.")
    if (end - start).days >= 31:
        raise ValueError("Select up to 31 days per overview.")
    config = get_psp_config_with_curve_defaults()
    key=(start_date,end_date,json.dumps(config,sort_keys=True,default=str))
    with _series_lock:
        cached=_series_cache.get(key)
        if cached and not refresh and monotonic()-cached[0]<3600:return cached[1]
    points, sources, diagnostics = [], [], []
    current = start
    while current <= end:
        day = current.isoformat()
        series, meta = read_curve_file_series(day, [], config, frequency_only=True)
        if meta.get("available"):
            points.extend(series.get("frequency") or [])
            sources.append({"date": day, "file": meta.get("file"), "missing_readings": meta.get("missing_readings", 0), "derived_timestamps": meta.get("derived_timestamps", 0)})
        else:
            diagnostics.append({"date": day, "message": meta.get("message") or "Curve frequency is unavailable."})
        current += timedelta(days=1)
    response = {
        "success": bool(points), "start_date": start_date, "end_date": end_date,
        "timezone": "Asia/Kolkata", "sample_seconds": 30,
        "sheet": "30SEC", "frequency_range": "D8:D2887", "timestamp_range": "C8:C2887",
        "points": points, "sources": sources, "diagnostics": diagnostics,
    }
    if points:
        with _series_lock:
            _series_cache[key]=(monotonic(),response)
            _series_cache.move_to_end(key)
            while len(_series_cache)>2:_series_cache.popitem(last=False)
    return response
