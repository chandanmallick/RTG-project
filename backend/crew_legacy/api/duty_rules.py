"""Shared rules for deciding which roster records count as duty."""


def normalized_duty(value) -> str:
    duty = str(value or "").strip().upper()
    aliases = {
        "M": "Morning", "M1": "Morning", "M2": "Morning", "MORNING": "Morning",
        "E": "Evening", "E1": "Evening", "E2": "Evening", "EVENING": "Evening",
        "N": "Night", "N1": "Night", "N2": "Night", "NIGHT": "Night",
        "O": "OFF", "O1": "OFF", "O2": "OFF", "OFF": "OFF",
    }
    return aliases.get(duty, str(value or "").strip())


def is_training_or_linked_leave(record: dict) -> bool:
    """Training and an approved adjacent OFF are activities, never duty days."""
    assigned = str(record.get("assignedDuty") or "").strip().upper()
    actual = str(record.get("actualStatus") or "").strip().upper()
    return bool(
        record.get("trainingName")
        or record.get("trainingFinal")
        or record.get("trainingAdjacentOff")
        or "TRAINING" in assigned
        or "TOUR" in assigned
        or actual == "TRAINING"
    )


def is_excluded_duty_record(record: dict, approved_leave: bool = False) -> bool:
    leave_status = str(record.get("leaveStatus") or "").strip().lower()
    return approved_leave or leave_status == "approved" or is_training_or_linked_leave(record)


def duty_category(record: dict) -> str | None:
    if is_excluded_duty_record(record):
        return None
    duty = normalized_duty(record.get("assignedDuty"))
    if not duty or duty.upper() in {"-", "NIL", "NONE"}:
        return None
    if duty in {"Morning", "Evening", "Night", "OFF"}:
        return duty
    return "Other"
