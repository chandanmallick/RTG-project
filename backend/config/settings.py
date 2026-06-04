# =========================================
# MONGO CONFIG
# =========================================

MONGO_URI = "mongodb://10.3.230.60:27017/"

DB_NAME = "rtg_db"

# =========================================
# COLLECTIONS
# =========================================

UNIT_COLLECTION = "units_data"

MAP_COLLECTION = "station_mapping"

PIPELINE_CONFIG_COLLECTION = "pipeline_config"

PIPELINE_LOG_COLLECTION = "pipeline_logs"

RTG_DASHBOARD_COLLECTION = "rtg_dashboard_snapshot"

PSP_COLLECTION = "psp_data"

BASE_URL = "https://mdp.erldc.in/outageapi"

STATIONS_API = f"{BASE_URL}/API/GeneratingStation/AllGeneratingStations/1"
UNITS_API = f"{BASE_URL}/API/GeneratingStation/GetAllGeneratingUnits/0"
STAGES_API = f"{BASE_URL}/API/GeneratingStation/GeneratingStagesByStation/{{}}"

GEN_LIST_API = f"{BASE_URL}/API/GeneratingStation/GetGeneratingStationsForList/1"
ELEM_LIST_API = f"{BASE_URL}/API/Entity_Entity_Reln/AllEntity_Entity_Reln/1"
OWNER_LIST_API = f"{BASE_URL}/API/SubStation/AllOwner/1"

# Mapping logic
CLASS_MAP = {1: 'State_IPP', 2: 'State', 3: 'ISGS', 5: 'Regional_IPP', 6: 'State'}
RENAME_MAP = {
    "Station_Type_Name": "fuel_type", 
    "Installed_Capacity": "installed_capacity", 
    "Location": "state_name", 
    "CLASSIFICATION_ID": "utility_type", 
    "Owner_Name": "owner_name"
}