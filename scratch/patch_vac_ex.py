with open('backend/crew_legacy/api/replacement.py', 'r', encoding='utf-8') as f:
    content = f.read()

target_vac = '''    return {
        "message": "Vacant duty assigned successfully", "switchId": switch_id,'''

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
        "message": "Vacant duty assigned successfully", "switchId": switch_id,'''

target_ex = '''    return {
        "message": "Manpower exchanged successfully",'''

hook_ex = '''    try:
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
        "message": "Manpower exchanged successfully",'''

if target_vac in content and target_ex in content:
    content = content.replace(target_vac, hook_vac, 1)
    content = content.replace(target_ex, hook_ex, 1)
    with open('backend/crew_legacy/api/replacement.py', 'w', encoding='utf-8') as f:
        f.write(content)
    print('Patched vacancy and exchange in replacement.py successfully')
else:
    print('Failed matching vac or ex')

