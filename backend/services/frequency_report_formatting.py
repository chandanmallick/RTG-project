"""Display formatting for frequency report values."""
from math import isfinite
from numbers import Real


FREQUENCY_KEYS = {
    "frequency_hz",
    "highest_frequency",
    "lowest_frequency",
    "maximum_frequency",
    "minimum_frequency",
}
OD_KEYS = {"average_od_ui_mw", "maximum_od_ui_mw", "deviation_mw"}


def format_report_value(value, key):
    if not isinstance(value, Real) or isinstance(value, bool):
        return value
    if not isfinite(value):
        return None
    if key in FREQUENCY_KEYS:
        return f"{value:.3f}"
    if key in OD_KEYS:
        return f"{value:.0f}"
    return value


def number_format_for_key(key):
    if key in FREQUENCY_KEYS:
        return "0.000"
    if key in OD_KEYS:
        return "0"
    return None


def monthly_display(value):
    """Monthly report presentation only: never mutate source values."""
    import re
    from datetime import datetime
    if not isinstance(value, str):
        return value
    def stamp(match):
        return datetime.fromisoformat(match.group(0).replace("T", " ")).strftime("%d-%b-%y %H:%M")
    value = re.sub(r"\b\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)?", stamp, value)
    value = re.sub(r"\b\d{4}-\d{2}\b", lambda m: datetime.strptime(m.group(), "%Y-%m").strftime("%b-%Y"), value)
    value = re.sub(r"(-?\d+)\.\d+(?= (?:min\b|minutes\b|calendar minutes))", lambda m: f"{float(m.group()):.0f}", value)
    return value


def is_regional_aggregate(entity):
    name = str(entity.get('display_name') or entity.get('entity') or '').strip().upper()
    return name in {'ER', 'EASTERN REGION', 'EASTERN REGION (ER)', 'ER (EASTERN REGION)'}
