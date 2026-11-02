# Debug & Inspection Scripts

This directory contains utility and verification scripts used for diagnosing database records, roster rules, approval hierarchies, and notifications.

All scripts in this directory are safe, non-destructive read/diagnostic tools (unless explicitly marked otherwise).

---

## Script Inventory

| Script | Purpose | Usage |
|---|---|---|
| `check_sandeep_leave.py` | Inspects Sandeep Kumar Maurya (`00137`) in employee, leave, and daily collections to verify SIC and shift placement. | `python debug_scripts/check_sandeep_leave.py` |
| `check_atanu_reporting.py` | Resolves Atanu Mandal (`00203`) reporting officer (`50027`), intermediary (`50023`), and HOD (`20020`) hierarchy. | `python debug_scripts/check_atanu_reporting.py` |
| `test_ro_rules.py` | Verifies permission flags (`canAccept`, `canDeny`, `canRevert`) across employee, RO, HOD, and Admin roles. | `python debug_scripts/test_ro_rules.py` |
| `check_notifications.py` | Inspects recent duty notifications, controller IDs, decision histories, and statuses in MongoDB. | `python debug_scripts/check_notifications.py` |

---

## Execution Instructions

From the project root:
```bash
python debug_scripts/<script_name>.py
```
*Note: Ensure backend dependencies and MongoDB connectivity (`10.3.230.60` or local) are reachable before running.*
