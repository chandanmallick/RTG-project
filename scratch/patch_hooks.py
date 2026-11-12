import os

# 1. Update replacement.py
with open('backend/crew_legacy/api/replacement.py', 'r', encoding='utf-8') as f:
    content = f.read()

target_acting = '    return {"message": "Acting SIC assigned successfully", "actingSIC": acting_sic}'
hook_acting = '''    try:
        from crew_legacy.services.google_sheet_sync_service import sync_leave_or_replacement_update
        sync_leave_or_replacement_update(
            date_str=duty_date,
            employee_id=acting_sic_id,
            duty_or_leave=shift_val or "Morning",
            is_leave=False,
            is_replacement=True,
            employee_name=acting_sic.get("name"),
            note=f"Acting SIC for {group_name or shift_val}",
        )
    except Exception:
        pass

    return {"message": "Acting SIC assigned successfully", "actingSIC": acting_sic}'''

target_rep = '    return {"message": "Replacement processed successfully"}'
hook_rep = '''    try:
        from crew_legacy.services.google_sheet_sync_service import sync_leave_or_replacement_update
        sync_leave_or_replacement_update(
            date_str=leave_date,
            employee_id=replacement_emp["userId"],
            duty_or_leave=assigned_duty,
            is_leave=False,
            is_replacement=True,
            employee_name=replacement_emp.get("name"),
            note=f"Replacement for {leave.get('name')}",
        )
    except Exception:
        pass

    return {"message": "Replacement processed successfully"}'''

if target_acting in content and target_rep in content:
    content = content.replace(target_acting, hook_acting, 1)
    content = content.replace(target_rep, hook_rep, 1)
    with open('backend/crew_legacy/api/replacement.py', 'w', encoding='utf-8') as f:
        f.write(content)
    print('Updated replacement.py successfully')
else:
    print('Failed matching replacement.py targets:', target_acting in content, target_rep in content)

# 2. Update leave_api.py
with open('backend/crew_legacy/api/leave_api.py', 'r', encoding='utf-8') as f:
    l_content = f.read()

target_leave = '        mark_comp_off_used(leave)'
hook_leave = '''        mark_comp_off_used(leave)
        try:
            from crew_legacy.services.google_sheet_sync_service import sync_leave_or_replacement_update
            sync_leave_or_replacement_update(
                date_str=leave["date"],
                employee_id=leave["employeeId"],
                duty_or_leave=leave.get("leaveType", "CL"),
                is_leave=True,
                is_replacement=False,
                employee_name=leave.get("name"),
                note=leave.get("reason", ""),
            )
        except Exception:
            pass'''

if target_leave in l_content:
    l_content = l_content.replace(target_leave, hook_leave, 1)
    with open('backend/crew_legacy/api/leave_api.py', 'w', encoding='utf-8') as f:
        f.write(l_content)
    print('Updated leave_api.py successfully')
else:
    print('Failed matching leave_api.py target')

# 3. Update special_events.py
with open('backend/crew_legacy/api/special_events.py', 'r', encoding='utf-8') as f:
    s_content = f.read()

target_seq = '    # Query denied replacement duties to display in side panel'
hook_seq = '''    if not preview_only:
        try:
            from crew_legacy.services.google_sheet_sync_service import push_to_google_sheet_async, get_sheet_tab_name
            dt = datetime.strptime(start_date, "%Y-%m-%d")
            sheet_name = get_sheet_tab_name(dt.year, dt.month)
            sheet_updates = []
            for a in allocations:
                sheet_updates.append({
                    "employeeId": a["allocatedEmployeeId"],
                    "employeeName": a["allocatedEmployeeName"],
                    "date": a["date"],
                    "duty": a["shift"],
                    "isLeave": False,
                    "isReplacement": True,
                    "note": f"Sequential {a['slotType']}",
                })
            push_to_google_sheet_async({
                "sheetName": sheet_name,
                "month": dt.month,
                "year": dt.year,
                "updates": sheet_updates,
            })
        except Exception:
            pass

    # Query denied replacement duties to display in side panel'''

if target_seq in s_content:
    s_content = s_content.replace(target_seq, hook_seq, 1)
    with open('backend/crew_legacy/api/special_events.py', 'w', encoding='utf-8') as f:
        f.write(s_content)
    print('Updated special_events.py successfully')
else:
    print('Failed matching special_events.py target')

