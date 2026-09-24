import os

from pymongo import MongoClient
from gridfs import GridFS

from crew_legacy.config import DATABASE_NAME, MONGO_URI
from config.database_policy import internal_database_uri


LOCAL_MONGO_URI = internal_database_uri(os.getenv("CREW_LOCAL_MONGO_URI", MONGO_URI))
LOCAL_DATABASE_NAME = os.getenv("CREW_LOCAL_MONGO_DB_NAME", DATABASE_NAME)

local_client = MongoClient(LOCAL_MONGO_URI, serverSelectionTimeoutMS=5000)
local_db = local_client[LOCAL_DATABASE_NAME]
operational_db = local_db
db = operational_db
client = local_client


def local_collection(name: str):
    return local_db[name]


def operational_collection(name: str):
    return operational_db[name]


# Local-authoritative authentication, access, and employee-master data.
employee_collection = local_collection("employees")
designation_master_collection = local_collection("designation_master")
dropdown_collection = local_collection("dropdown_collection")
organization_unit_collection = local_collection("organization_unit_master")
organization_shift_group_collection = local_collection("organization_shift_group_mapping")
system_settings_collection = local_collection("system_setting")
mail_notification_settings_collection = local_collection("mail_notification_settings")
login_otp_challenge_collection = local_collection("login_otp_challenges")
login_history_collection = local_collection("login_history_collection")
page_access_collection = local_collection("page_access_control")
sequence_collection = local_collection("sequence_collection")

# Operational Crew data is stored on the internal database.
morning_presentation_config_collection = operational_collection("morning_presentation_config")
morning_presentation_roster_collection = operational_collection("morning_presentation_roster")
DutyLeave_collection = operational_collection("DutyLeaveTypes")
roster_group_collection = operational_collection("roster_group_history")
roster_master_collection = operational_collection("roster_master_collection")
roster_collection = operational_collection("roster_collection")
cycle_config_collection = operational_collection("roster_base_config")
employee_daily_collection = operational_collection("employee_daily_collection")
duty_leave_collection = operational_collection("DutyLeave_collection")
holiday_master_collection = operational_collection("holiday_master_collection")
training_master_collection = operational_collection("training_master_collection")
sports_event_collection = operational_collection("sports_event_collection")
sports_application_collection = operational_collection("sports_application_collection")
leave_request_collection = operational_collection("leave_request_collection")
leave_approval_delegation_collection = operational_collection("leave_approval_delegation")
training_nomination_history_collection = operational_collection("training_nomination_history_collection")
compensatory_off_collection = operational_collection("compensatory_off_collection")
deleted_leave_collection = operational_collection("deleted_leave_collection")
duty_denial_collection = operational_collection("duty_denial_collection")
duty_notification_collection = operational_collection("duty_notification_collection")
duty_switch_collection = operational_collection("duty_switch_collection")
duty_balance_ledger_collection = operational_collection("duty_balance_ledger")
duty_exchange_request_collection = operational_collection("duty_exchange_request_collection")
crew_thread_collection = operational_collection("crew_threads")
crew_thread_message_collection = operational_collection("crew_thread_messages")
employee_shift_history = operational_collection("employee_shift_history")
audit_trail_collection = operational_collection("portal_audit_trail")
employee_duty_collection = operational_collection("employee_duty_collection")
crew_thread_file_store = GridFS(operational_db, collection="crew_thread_files")
