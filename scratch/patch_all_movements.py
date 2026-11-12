# scratch/patch_all_movements.py

# 1. Patch leave_api.py - cancel_single_leave
with open('backend/crew_legacy/api/leave_api.py', 'r', encoding='utf-8') as f:
    content = f.read()

target_cancel = '    clear_leave_operational_effects(leave)\n    return actor_role'
hook_cancel = '''    clear_leave_operational_effects(leave)
    try:
        from crew_legacy.services.google_sheet_sync_service import sync_leave_or_replacement_update
        restored = employee_daily_collection.find_one({
            "employeeId": leave["employeeId"],
            "date": leave["date"]
        }) or {}
        sync_leave_or_replacement_update(
            date_str=leave["date"],
            employee_id=leave["employeeId"],
            duty_or_leave=restored.get("assignedDuty") or "OFF",
            is_leave=False,
            is_replacement=False,
            employee_name=leave.get("name"),
            note="Leave cancelled",
        )
    except Exception:
        pass
    return actor_role'''

if target_cancel in content:
    content = content.replace(target_cancel, hook_cancel, 1)
    with open('backend/crew_legacy/api/leave_api.py', 'w', encoding='utf-8') as f:
        f.write(content)
    print('Patched leave_api.py cancel_single_leave')
else:
    print('Failed matching target_cancel in leave_api.py')

# 2. Patch replacement.py
with open('backend/crew_legacy/api/replacement.py', 'r', encoding='utf-8') as f:
    r_content = f.read()

# 2a. delete_replacement_assignment
target_del = '    return {"message": "Replacement assignment deleted and original duty restored"}'
hook_del = '''    try:
        from crew_legacy.services.google_sheet_sync_service import sync_leave_or_replacement_update
        sync_leave_or_replacement_update(
            date_str=leave.get("date"),
            employee_id=replacement_id,
            duty_or_leave="",
            is_leave=False,
            is_replacement=True,
            employee_name=replacement.get("name") or replacement_daily.get("name"),
            note="Replacement cancelled",
        )
    except Exception:
        pass
    return {"message": "Replacement assignment deleted and original duty restored"}'''

# 2b. switch_employee_duty
target_switch = '        ref_id=str(inserted.inserted_id),\n        action="VIEW_CALENDAR",\n        type="DUTY",\n    )'
hook_switch = '''        ref_id=str(inserted.inserted_id),
        action="VIEW_CALENDAR",
        type="DUTY",
    )
    try:
        from crew_legacy.services.google_sheet_sync_service import sync_leave_or_replacement_update
        sync_leave_or_replacement_update(
            date_str=duty_date,
            employee_id=employee_id,
            duty_or_leave=assigned_duty,
            is_leave=False,
            is_replacement=False,
            employee_name=current.get("name") or employee.get("name"),
            note=reason,
        )
    except Exception:
        pass'''

# 2c. deploy_additional_manpower
target_manpower = '    return {\n        "message": f"Additional manpower {emp_name} deployed to {assigned_duty} on {duty_date}.",'
hook_manpower = '''    try:
        from crew_legacy.services.google_sheet_sync_service import sync_leave_or_replacement_update
        sync_leave_or_replacement_update(
            date_str=duty_date,
            employee_id=employee_id,
            duty_or_leave=assigned_duty,
            is_leave=False,
            is_replacement=True,
            employee_name=emp_name,
            note=f"Additional manpower: {reason}",
        )
    except Exception:
        pass

    return {
        "message": f"Additional manpower {emp_name} deployed to {assigned_duty} on {duty_date}.","""'''

# 2d. assign_vacancy_candidate
target_vac = '''    return {
        "message": f"Replacement assigned for {duty_date} {vacant_duty} {vacancy.get('groupName') or ''}".strip(),
        "assigned": True,'''

hook_vac = '''    try:
        from crew_legacy.services.google_sheet_sync_service import sync_leave_or_replacement_update
        sync_leave_or_replacement_update(
            date_str=duty_date,
            employee_id=replacement_id,
            duty_or_leave=vacant_duty,
            is_leave=False,
            is_replacement=True,
            employee_name=replacement_name,
            note=f"Vacancy cover for {vacant_name}",
        )
    except Exception:
        pass

    return {
        "message": f"Replacement assigned for {duty_date} {vacant_duty} {vacancy.get('groupName') or ''}".strip(),
        "assigned": True,'''

# 2e. exchange_employee_duties
target_exchange = '''    return {
        "message": f"Manpower exchanged between {first.get('name') or first_id} and {second.get('name') or second_id} for {duty_date}",'''

hook_exchange = '''    try:
        from crew_legacy.services.google_sheet_sync_service import sync_leave_or_replacement_update
        sync_leave_or_replacement_update(
            date_str=duty_date,
            employee_id=first_id,
            duty_or_leave=first_updated.get("assignedDuty") or "OFF",
            is_leave=False,
            is_replacement=False,
            employee_name=first.get("name"),
            note="Exchanged duty",
        )
        sync_leave_or_replacement_update(
            date_str=duty_date,
            employee_id=second_id,
            duty_or_leave=second_updated.get("assignedDuty") or "OFF",
            is_leave=False,
            is_replacement=False,
            employee_name=second.get("name"),
            note="Exchanged duty",
        )
    except Exception:
        pass

    return {
        "message": f"Manpower exchanged between {first.get('name') or first_id} and {second.get('name') or second_id} for {duty_date}","""'''

# Clean syntax:
hook_manpower = hook_manpower.replace('"""', '')
hook_exchange = hook_exchange.replace('"""', '')

for name, target, repl in [
    ('del', target_del, hook_del),
    ('switch', target_switch, hook_switch),
    ('manpower', target_manpower, hook_manpower),
    ('vac', target_vac, hook_vac),
    ('exchange', target_exchange, hook_exchange),
]:
    if target in r_content:
        r_content = r_content.replace(target, repl, 1)
        print(f'Patched replacement.py {name}')
    else:
        print(f'Failed matching replacement.py {name}')

with open('backend/crew_legacy/api/replacement.py', 'w', encoding='utf-8') as f:
    f.write(r_content)
