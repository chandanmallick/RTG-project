with open('backend/crew_legacy/api/roster_api.py', 'r', encoding='utf-8') as f:
    content = f.read()

target1 = '''    return {
        "message": "Roster saved",
        "rosterId": str(roster_id)
    }'''

replacement1 = '''    try:
        from crew_legacy.services.google_sheet_sync_service import sync_roster_draft_or_final_to_sheet
        sync_roster_draft_or_final_to_sheet(str(roster_id))
    except Exception:
        pass

    return {
        "message": "Roster saved",
        "rosterId": str(roster_id)
    }'''

target2 = '''    roster_master_collection.update_one(
        {"_id": object_id},
        {"$set": {"calendarPushed": True}}
    )

    return {'''

replacement2 = '''    roster_master_collection.update_one(
        {"_id": object_id},
        {"$set": {"calendarPushed": True}}
    )

    try:
        from crew_legacy.services.google_sheet_sync_service import sync_roster_draft_or_final_to_sheet
        sync_roster_draft_or_final_to_sheet(str(object_id))
    except Exception:
        pass

    return {'''

if target1 in content and target2 in content:
    content = content.replace(target1, replacement1, 1)
    content = content.replace(target2, replacement2, 1)
    with open('backend/crew_legacy/api/roster_api.py', 'w', encoding='utf-8') as f:
        f.write(content)
    print('Updated roster_api.py successfully')
else:
    print('Match failed:', target1 in content, target2 in content)

