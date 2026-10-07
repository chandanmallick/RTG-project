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
