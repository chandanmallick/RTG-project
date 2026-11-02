with open('backend/crew_legacy/api/replacement.py', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Update canDeny in get_notifications
old_can_deny = '''        # Deny option to assigned employee AND Reporting / HOD officer (or Admin/Controller)
        n["canDeny"] = bool(
            (is_assignee or is_reporting_or_hod)
            and n.get("status") in {"Pending", "Accepted"}
            and (before_cutoff or is_reporting_or_hod)
            and not is_elapsed
        )'''

new_can_deny = '''        # Deny option: STRICTLY restricted to Reporting / HOD officer (or Admin) - Employee cannot deny
        n["canDeny"] = bool(
            is_reporting_or_hod
            and not is_assignee
            and n.get("status") in {"Pending", "Accepted"}
            and (before_cutoff or is_reporting_or_hod)
            and not is_elapsed
        )'''

# 2. Update canRevert in get_notifications: admin only
old_can_revert = '''        # Can revert assignment: Admin or Reporting Officer / HOD can revert for test
        n["canRevert"] = bool(
            (user_is_admin or is_reporting_or_hod)
            and n.get("leaveId")
            and not is_elapsed
        )'''

new_can_revert = '''        # Can revert assignment: Admin only for testing (reporting officer cannot reallocate/revert)
        n["canRevert"] = bool(
            user_is_admin
            and n.get("leaveId")
            and not is_elapsed
        )'''

# 3. Update deny_duty
old_deny_auth = '''    # USER REQUIREMENT: Deny option available to assigned employee AND Reporting/ HOD officer.
    is_assignee = str(notif.get("employeeId") or "").strip() == user_id
    if not is_assignee and not is_controller and not user_is_admin:
        raise HTTPException(403, "Deny option is restricted to assigned employee or Reporting / HOD officers only")

    if notif.get("status") not in {"Pending", "Accepted"}:
        raise HTTPException(409, f"Duty is already {notif.get('status')}")

    now = datetime.utcnow()
    cutoff = utc_naive(notif.get("cutoffTime"))
    if cutoff and now > cutoff:
        auto_accept_pending_duty_notifications()
        raise HTTPException(400, "Denial time expired after the 16:00 cutoff")

    reason = str(payload.get("reason") or "").strip()
    if not reason:
        raise HTTPException(400, "Denial reason is required")
    actor_role = "Employee" if is_assignee else ("Reporting/HOD Officer" if is_controller else "Admin")'''

new_deny_auth = '''    # USER REQUIREMENT: Employee should NOT have option to deny. Only His reporting officer/HOD/Admin can deny.
    is_assignee = str(notif.get("employeeId") or "").strip() == user_id
    if is_assignee and not user_is_admin:
        raise HTTPException(403, "Employees cannot deny replacement duties. Only the Reporting Officer or HOD can deny.")

    if not is_controller and not user_is_admin:
        raise HTTPException(403, "Deny option is restricted to Reporting / HOD officers only")

    if notif.get("status") not in {"Pending", "Accepted"}:
        raise HTTPException(409, f"Duty is already {notif.get('status')}")

    now = datetime.utcnow()
    cutoff = utc_naive(notif.get("cutoffTime"))
    if cutoff and now > cutoff:
        auto_accept_pending_duty_notifications()
        raise HTTPException(400, "Denial time expired after the 16:00 cutoff")

    reason = str(payload.get("reason") or "").strip()
    if not reason:
        raise HTTPException(400, "Denial reason is required")
    actor_role = "Reporting/HOD Officer" if is_controller else "Admin"'''

# 4. Update reallocate_denied_duty
old_realloc_auth = '''    if not (user.get("isAdmin") or user_role in ["admin", "dic", "dept_ic", "hod"] or actor_id == "50041" or bool(user.get("isDeptIC")) or bool(user.get("isLeaveAuthority"))):
        raise HTTPException(403, "Only administrator or DIC can re-allocate denied duty")'''

new_realloc_auth = '''    # USER REQUIREMENT: Reporting officer shouldn't have option to reallocate as of now. Only Administrator/DIC.
    if not (user.get("isAdmin") or user_role in ["admin", "dic", "dept_ic"] or actor_id in ["50041", "admin"] or bool(user.get("isDeptIC"))):
        raise HTTPException(403, "Only administrator or DIC can re-allocate denied duty")'''

code_norm = code.replace('\r\n', '\n')
errors = []

for name, target, repl in [
    ("can_deny", old_can_deny, new_can_deny),
    ("can_revert", old_can_revert, new_can_revert),
    ("deny_auth", old_deny_auth, new_deny_auth),
    ("realloc_auth", old_realloc_auth, new_realloc_auth),
]:
    target_norm = target.replace('\r\n', '\n')
    if target_norm in code_norm:
        code_norm = code_norm.replace(target_norm, repl)
        print(f"Replaced {name}")
    else:
        errors.append(name)
        print(f"FAILED {name}")

if not errors:
    if '\r\n' in code:
        code_norm = code_norm.replace('\n', '\r\n')
    with open('backend/crew_legacy/api/replacement.py', 'w', encoding='utf-8') as f:
        f.write(code_norm)
    print("ALL SUCCESS")
else:
    print("ERRORS:", errors)
