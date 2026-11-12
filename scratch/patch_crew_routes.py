with open('backend/routes/crew_routes.py', 'r', encoding='utf-8') as f:
    content = f.read()

target_save = '    return {"message": "Roster saved as final" if is_final else "Draft roster saved", "rosterId": str(result_id)}'
hook_save = '''    try:
        from crew_legacy.services.google_sheet_sync_service import sync_roster_draft_or_final_to_sheet
        sync_roster_draft_or_final_to_sheet(str(result_id))
    except Exception:
        pass

    return {"message": "Roster saved as final" if is_final else "Draft roster saved", "rosterId": str(result_id)}'''

target_push = '    return {"message": f"{roster_type.title()} roster published to the duty calendar"}'
hook_push = '''    try:
        from crew_legacy.services.google_sheet_sync_service import sync_roster_draft_or_final_to_sheet
        sync_roster_draft_or_final_to_sheet(str(object_id))
    except Exception:
        pass

    return {"message": f"{roster_type.title()} roster published to the duty calendar"}'''

if target_save in content and target_push in content:
    content = content.replace(target_save, hook_save, 1)
    content = content.replace(target_push, hook_push, 1)
    with open('backend/routes/crew_routes.py', 'w', encoding='utf-8') as f:
        f.write(content)
    print('Updated crew_routes.py successfully')
else:
    print('Match failed in crew_routes.py:', target_save in content, target_push in content)

