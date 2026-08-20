from pymongo import MongoClient
from crew_legacy.config import DATABASE_NAME, MONGO_URI

# For local MongoDB
# MONGO_URI = "mongodb://localhost:27017"

client = MongoClient(MONGO_URI)

db = client[DATABASE_NAME]

employee_collection = db["employees"]
designation_master_collection = db["designation_master"]
morning_presentation_config_collection = db["morning_presentation_config"]
morning_presentation_roster_collection = db["morning_presentation_roster"]
DutyLeave_collection= db["DutyLeaveTypes"]
roster_group_collection = db["roster_group_history"]
roster_master_collection = db["roster_master_collection"]
# roster_seed_collection =db["roster_seed_collection"]
roster_collection = db["roster_collection"]
cycle_config_collection  = db["roster_base_config"]
employee_daily_collection = db["employee_daily_collection"]
duty_leave_collection = db["DutyLeave_collection"]
dropdown_collection = db["dropdown_collection"]

holiday_master_collection = db["holiday_master_collection"]  ### Holiday db
training_master_collection = db["training_master_collection"]   ### Training db

leave_request_collection = db["leave_request_collection"]  ### Leave
system_settings_collection = db["system_setting"]
mail_notification_settings_collection = db["mail_notification_settings"]
login_otp_challenge_collection = db["login_otp_challenges"]

training_nomination_history_collection = db["training_nomination_history_collection"]
compensatory_off_collection = db["compensatory_off_collection"]


deleted_leave_collection = db["deleted_leave_collection"]
login_history_collection = db["login_history_collection"]
page_access_collection = db["page_access_control"]
organization_unit_collection = db["organization_unit_master"]
organization_shift_group_collection = db["organization_shift_group_mapping"]
duty_denial_collection = db["duty_denial_collection"]
duty_notification_collection = db["duty_notification_collection"]
duty_switch_collection = db["duty_switch_collection"]
duty_exchange_request_collection = db["duty_exchange_request_collection"]
crew_thread_collection = db["crew_threads"]
crew_thread_message_collection = db["crew_thread_messages"]
employee_shift_history = db["employee_shift_history"]
audit_trail_collection = db["portal_audit_trail"]

duty_notification_collection =db["duty_notification_collection"]
sequence_collection = db["sequence_collection"]
employee_duty_collection = db["employee_duty_collection"]

