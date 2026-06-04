from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel
from datetime import date, timedelta, datetime
from services.db_handler import MongoService
from services.psp_service import PSPService
from services.pipeline_config_service import PipelineConfigService
import traceback
import pandas as pd
import requests
import os

router = APIRouter(
    prefix="/api/psp",
    tags=["PSP"]
)

class DateRangeRequest(BaseModel):
    start_date: str  # YYYY-MM-DD
    end_date: str    # YYYY-MM-DD

class PSPConfigRequest(BaseModel):
    psp_username: str
    psp_password: str
    psp_login_url: str
    psp_data_url: str
    wbes_url: str = "https://gateway.grid-india.in/POSOCO/reports/1.0/WebAccessAPI/GetUtilityExternalSharedData"
    wbes_api_key: str = "6dc32d47-f46a-45c9-afaf-c6ce73c4ca71"
    wbes_username: str = "erldc_internal_prod"
    wbes_password: str = "ErldcPr0d@052024"

def update_sync_progress(total: int, completed: int, current_date: str, status: str, error_msg: str = None):
    try:
        db = MongoService()
        db.db["psp_sync_status"].update_one(
            {"_id": "current_run"},
            {"$set": {
                "total": total,
                "completed": completed,
                "current_date": current_date,
                "status": status,
                "error": error_msg,
                "timestamp": datetime.utcnow().isoformat()
            }},
            upsert=True
        )
    except Exception as e:
        print(f"Error updating progress in MongoDB: {str(e)}")

def run_psp_range_task(start_dt: date, end_dt: date):
    """Background task: login once, then fetch all dates in range."""
    print(f"[PSP] Started sync range: {start_dt} to {end_dt}")
    total_days = (end_dt - start_dt).days + 1
    update_sync_progress(total_days, 0, start_dt.strftime("%Y-%m-%d"), "RUNNING")

    completed = 0
    curr_dt = start_dt
    session = None
    try:
        session = PSPService._create_session()
    except Exception as e:
        print(f"[PSP] Login failed for range task: {e}")

    while curr_dt <= end_dt:
        update_sync_progress(total_days, completed, curr_dt.strftime("%Y-%m-%d"), "RUNNING")
        try:
            PSPService.fetch_and_save_date(curr_dt, session=session)
            try:
                check_and_update_highest_portfolio(curr_dt)
            except Exception as ex:
                print(f"Error updating highest for {curr_dt}: {ex}")
            completed += 1
        except Exception as e:
            print(f"[PSP] Failed for {curr_dt}: {e}")
            completed += 1
        curr_dt += timedelta(days=1)

    update_sync_progress(total_days, completed, "", "COMPLETED")
    print(f"[PSP] Sync range completed. {completed} days processed.")

@router.get("/status")
async def get_psp_status(start_date: str = None, end_date: str = None):
    db = MongoService()
    
    if start_date and end_date:
        try:
            start_dt = date.fromisoformat(start_date)
            end_dt = date.fromisoformat(end_date)
            if start_dt > end_dt:
                return {"success": False, "message": "Start date must be less than or equal to end date."}
            total_days = (end_dt - start_dt).days + 1
            dates = [start_dt + timedelta(days=i) for i in range(total_days)]
            # Reverse to show most recent first
            dates.reverse()
        except ValueError:
            return {"success": False, "message": "Invalid date format. Use YYYY-MM-DD."}
    else:
        # Generate dates for the last 30 days starting from yesterday
        yesterday = date.today() - timedelta(days=1)
        dates = [yesterday - timedelta(days=i) for i in range(30)]
        
    date_strings = [d.strftime("%Y-%m-%d") for d in dates]
    
    # Query database for existing documents in this range
    existing_docs = list(db.psp_collection.find(
        {"date": {"$in": date_strings}},
        {"date": 1, "fetched_at": 1, "_id": 0}
    ))
    
    # Map date to fetched timestamp
    status_map = {doc["date"]: doc.get("fetched_at") for doc in existing_docs}
    
    status_list = []
    for d in dates:
        d_str = d.strftime("%Y-%m-%d")
        fetched_at = status_map.get(d_str)
        status_list.append({
            "date": d_str,
            "status": "SUCCESS" if fetched_at else "MISSING",
            "fetched_at": fetched_at
        })
        
    return {
        "success": True,
        "data": status_list
    }

@router.get("/sync-progress")
async def get_sync_progress():
    try:
        db = MongoService()
        progress = db.db["psp_sync_status"].find_one({"_id": "current_run"})
        if not progress:
            return {"success": True, "status": "IDLE"}
        return {"success": True, **progress}
    except Exception as e:
        return {"success": False, "message": str(e)}

@router.post("/run-range")
async def run_psp_range(req: DateRangeRequest, background_tasks: BackgroundTasks):
    try:
        start_dt = date.fromisoformat(req.start_date)
        end_dt = date.fromisoformat(req.end_date)
    except ValueError:
        return {
            "success": False,
            "message": "Invalid date format. Please use YYYY-MM-DD."
        }
        
    if start_dt > end_dt:
        return {
            "success": False,
            "message": "Start date must be less than or equal to end date."
        }
    
    # Reset/trigger the background task
    background_tasks.add_task(run_psp_range_task, start_dt, end_dt)
    
    return {
        "success": True,
        "message": f"Sync task triggered in background from {req.start_date} to {req.end_date}."
    }

@router.post("/sync-date/{date_str}")
async def sync_single_date(date_str: str):
    try:
        dt = date.fromisoformat(date_str)
        res = PSPService.fetch_and_save_date(dt)
        try:
            check_and_update_highest_portfolio(dt)
        except Exception as ex:
            print(f"Error checking highest records for single date sync: {ex}")
        return res
    except ValueError:
        return {
            "success": False,
            "message": "Invalid date format. Please use YYYY-MM-DD."
        }
    except Exception as e:
        return {
            "success": False,
            "message": str(e)
        }

@router.get("/config")
async def get_psp_config():
    config_service = PipelineConfigService()
    config = config_service.get_config("PSP")
    if not config:
        config = {
            "config_type": "PSP",
            "psp_login_url": "https://report.erldc.in/POSOCO/Account/Login",
            "psp_data_url": "https://report.erldc.in/POSOCO/PSP/GetPSPData",
            "psp_username": "erldc",
            "psp_password": "erldc1",
            "wbes_url": "https://gateway.grid-india.in/POSOCO/reports/1.0/WebAccessAPI/GetUtilityExternalSharedData",
            "wbes_api_key": "6dc32d47-f46a-45c9-afaf-c6ce73c4ca71",
            "wbes_username": "erldc_internal_prod",
            "wbes_password": "ErldcPr0d@052024"
        }
    else:
        # Populate defaults for missing wbes keys if any
        if "wbes_url" not in config:
            config["wbes_url"] = "https://gateway.grid-india.in/POSOCO/reports/1.0/WebAccessAPI/GetUtilityExternalSharedData"
        if "wbes_api_key" not in config:
            config["wbes_api_key"] = "6dc32d47-f46a-45c9-afaf-c6ce73c4ca71"
        if "wbes_username" not in config:
            config["wbes_username"] = "erldc_internal_prod"
        if "wbes_password" not in config:
            config["wbes_password"] = "ErldcPr0d@052024"
    return {
        "success": True,
        "config": config
    }

@router.post("/config")
async def save_psp_config(req: PSPConfigRequest):
    try:
        db = MongoService()
        db.db["pipeline_config"].update_one(
            {"config_type": "PSP"},
            {"$set": {
                "psp_username": req.psp_username,
                "psp_password": req.psp_password,
                "psp_login_url": req.psp_login_url,
                "psp_data_url": req.psp_data_url,
                "wbes_url": req.wbes_url,
                "wbes_api_key": req.wbes_api_key,
                "wbes_username": req.wbes_username,
                "wbes_password": req.wbes_password
            }},
            upsert=True
        )
        return {
            "success": True,
            "message": "PSP configuration updated successfully."
        }
    except Exception as e:
        return {
            "success": False,
            "message": str(e)
        }

@router.get("/analytics")
async def get_psp_analytics():
    db = MongoService()
    docs = list(db.psp_collection.find({}, {"_id": 0}).sort("date", 1))
    
    if not docs:
        return {
            "success": True,
            "has_data": False,
            "latest_date": None,
            "state_data": [],
            "trend_data": []
        }
        
    latest_doc = docs[-1]
    latest_date = latest_doc.get("date")
    
    # 1. State-wise Requirement & Availability for the latest date
    state_data = []
    avail_demand_list = latest_doc.get("pspregionalavailibilitydemand", [])
    
    states_list = ['DVC', 'BIHAR', 'ORISSA', 'SIKKIM', 'JHARKHAND', 'WEST BENGAL']
    for item in avail_demand_list:
        state_name = item.get("StateName", "").upper()
        if state_name in states_list:
            req = item.get("RegionalRequirement") or item.get("Requirement") or 0.0
            avail = item.get("RegionalAvailability") or item.get("Availability") or item.get("RegionalAvailibility") or item.get("Availibility") or 0.0
            
            state_data.append({
                "name": state_name,
                "requirement": float(req),
                "availability": float(avail)
            })
            
    # 2. Daily trend of total Region Requirement & Availability (past 15 days)
    trend_data = []
    for doc in docs[-15:]:  # limit to last 15 days
        doc_date = doc.get("date", "")
        region_req = 0.0
        region_avail = 0.0
        
        avail_demand_list_doc = doc.get("pspregionalavailibilitydemand", [])
        
        region_item = next((x for x in avail_demand_list_doc if x.get("StateName", "").upper() == "REGION"), None)
        if region_item:
            region_req = region_item.get("RegionalRequirement") or region_item.get("Requirement") or 0.0
            region_avail = region_item.get("RegionalAvailability") or region_item.get("Availability") or region_item.get("RegionalAvailibility") or region_item.get("Availibility") or 0.0
        else:
            for item in avail_demand_list_doc:
                if item.get("StateName", "").upper() != "REGION":
                    req = item.get("RegionalRequirement") or item.get("Requirement") or 0.0
                    avail = item.get("RegionalAvailability") or item.get("Availability") or item.get("RegionalAvailibility") or item.get("Availibility") or 0.0
                    region_req += float(req)
                    region_avail += float(avail)
                    
        trend_data.append({
          "date": doc_date,
          "requirement": float(region_req),
          "availability": float(region_avail)
        })
        
    return {
        "success": True,
        "has_data": True,
        "latest_date": latest_date,
        "state_data": state_data,
        "trend_data": trend_data
    }

@router.get("/energy-consumption")
async def get_energy_consumption(date_str: str = None):
    """Get state-wise energy consumption from pspstateloaddetailsER for donut chart."""
    db = MongoService()
    
    if date_str:
        doc = db.psp_collection.find_one({"date": date_str}, {"_id": 0})
    else:
        # Get latest date that has actual state load data
        doc = db.psp_collection.find_one(
            {"pspstateloaddetailsER": {"$exists": True, "$ne": []}},
            {"_id": 0},
            sort=[("date", -1)]
        )
    
    if not doc:
        return {"success": True, "has_data": False, "states": [], "total": 0, "date": None}
    
    state_load_list = doc.get("pspstateloaddetailsER", [])
    
    states = []
    total_consumption = 0.0
    
    for item in state_load_list:
        state_name = item.get("STATE_NAME", "")
        consumption = float(item.get("CONSUMPTION", 0) or 0)
        total_consumption += consumption
        
        states.append({
            "name": state_name,
            "consumption": round(consumption, 2),
            "thermal": float(item.get("THERMAL", 0) or 0),
            "hydro": float(item.get("HYDRO", 0) or 0),
            "solar": float(item.get("SOLAR", 0) or 0),
            "renewable": float(item.get("RENEWABLE", 0) or 0),
        })
    
    # Sort by consumption descending
    states.sort(key=lambda x: x["consumption"], reverse=True)
    
    return {
        "success": True,
        "has_data": True,
        "date": doc.get("date"),
        "states": states,
        "total": round(total_consumption, 2)
    }

@router.get("/energy-breakdown")
async def get_energy_breakdown(date_str: str = None):
    """Get state-wise energy breakdown of the 11 components for the stacked bar chart."""
    db = MongoService()
    
    if date_str:
        doc = db.psp_collection.find_one({"date": date_str}, {"_id": 0})
    else:
        # Get latest date that has both keys
        doc = db.psp_collection.find_one(
            {"pspstateloaddetailsER": {"$exists": True, "$ne": []},
             "pspSTOADetails1": {"$exists": True, "$ne": []}},
            {"_id": 0},
            sort=[("date", -1)]
        )
        
    if not doc:
        return {"success": True, "has_data": False, "states": [], "er": {}, "date": None}
        
    load_list = doc.get("pspstateloaddetailsER", [])
    stoa_list = doc.get("pspSTOADetails1", [])
    
    # Map by state name
    load_map = {item.get("STATE_NAME", "").upper(): item for item in load_list if item.get("STATE_NAME")}
    stoa_map = {item.get("STATE_NAME", "").upper(): item for item in stoa_list if item.get("STATE_NAME")}
    
    # All unique state names that exist in both load and stoa lists
    all_states = sorted(list(set(load_map.keys()) & set(stoa_map.keys())))
    
    states_data = []
    er_fields = {
        "gna": 0.0, "tgna": 0.0, "rtm": 0.0, "dam": 0.0,
        "thermal": 0.0, "hydro": 0.0, "solar": 0.0, "wind": 0.0,
        "small_hydro": 0.0, "others": 0.0, "ui": 0.0, "consumption": 0.0
    }
    
    for state_name in all_states:
        ld = load_map[state_name]
        st = stoa_map[state_name]
        
        # Parse tags
        gna = float(st.get("DE_ISGS") or 0.0)
        tgna = float(st.get("DE_BILT") or 0.0)
        rtm = float(st.get("DE_RTM_IEX") or 0.0) + float(st.get("DE_RTM_PXI") or 0.0)
        dam = float(st.get("DE_GDAM_PXI") or 0.0) + float(st.get("DE_HPDAM_PXI") or 0.0) + float(st.get("DE_PX") or 0.0)
        
        thermal = float(ld.get("THERMAL") or 0.0)
        hydro = float(ld.get("HYDRO") or 0.0)
        solar = float(ld.get("SOLAR") or 0.0)
        wind = float(ld.get("WIND") or 0.0)
        small_hydro = float(ld.get("SMALL_HYDRO") or 0.0)
        others = float(ld.get("OTHERS") or 0.0)
        ui = float(ld.get("UI") or 0.0)
        
        consumption = float(ld.get("CONSUMPTION") or 0.0)
        
        state_breakdown = {
            "state": state_name,
            "gna": round(gna, 3),
            "tgna": round(tgna, 3),
            "rtm": round(rtm, 3),
            "dam": round(dam, 3),
            "thermal": round(thermal, 3),
            "hydro": round(hydro, 3),
            "solar": round(solar, 3),
            "wind": round(wind, 3),
            "small_hydro": round(small_hydro, 3),
            "others": round(others, 3),
            "ui": round(ui, 3),
            "consumption": round(consumption, 3)
        }
        states_data.append(state_breakdown)
        
        # Add to ER
        er_fields["gna"] += gna
        er_fields["tgna"] += tgna
        er_fields["rtm"] += rtm
        er_fields["dam"] += dam
        er_fields["thermal"] += thermal
        er_fields["hydro"] += hydro
        er_fields["solar"] += solar
        er_fields["wind"] += wind
        er_fields["small_hydro"] += small_hydro
        er_fields["others"] += others
        er_fields["ui"] += ui
        er_fields["consumption"] += consumption
        
    er_data = {
        "state": "ER",
        "gna": round(er_fields["gna"], 3),
        "tgna": round(er_fields["tgna"], 3),
        "rtm": round(er_fields["rtm"], 3),
        "dam": round(er_fields["dam"], 3),
        "thermal": round(er_fields["thermal"], 3),
        "hydro": round(er_fields["hydro"], 3),
        "solar": round(er_fields["solar"], 3),
        "wind": round(er_fields["wind"], 3),
        "small_hydro": round(er_fields["small_hydro"], 3),
        "others": round(er_fields["others"], 3),
        "ui": round(er_fields["ui"], 3),
        "consumption": round(er_fields["consumption"], 3)
    }
    
    return {
        "success": True,
        "has_data": True,
        "date": doc.get("date"),
        "states": states_data,
        "er": er_data
    }

def compute_state_portfolio(state: dict, target_date: date, query_time: str, max_demand: float, wbes_data: list, scada_df: pd.DataFrame = None):
    # Parse hour/minute
    try:
        hour = int(query_time.split(":")[0])
        minute = int(query_time.split(":")[1])
    except Exception:
        hour = 19
        minute = 0
        
    # SCADA Gen
    thermal = 0.0
    hydro = 0.0
    solar = 0.0
    biogas = 0.0  # formerly others
    nuclear = 0.0
    total_scada_gen = 0.0
    
    if scada_df is not None:
        row_idx = hour * 60 + minute + 1
        if row_idx < len(scada_df):
            cols = state["scada"]
            # 1. Thermal
            if cols.get("thermal") and cols["thermal"] in scada_df.columns:
                thermal = float(scada_df[cols["thermal"]][row_idx] or 0)
            
            # 2. Hydro
            if cols.get("hydro") and cols["hydro"] in scada_df.columns:
                hydro = float(scada_df[cols["hydro"]][row_idx] or 0)
            
            # 3. Solar (with fallback check for suffix Int Gen "Solar" or Int Gen Solar)
            solar_keys = []
            if cols.get("solar"):
                solar_keys.append(cols["solar"])
            highlight_name = state.get("highlight", state["name"])
            solar_keys.append(f'{highlight_name} Int Gen "Solar"')
            solar_keys.append(f'{highlight_name} Int Gen Solar')
            solar_keys.append(f'{state["name"]} SOLAR')
            solar_keys.append(f'{state["name"]} Int Gen Solar')
            solar_keys.append(f'{state["name"]} Int Gen "Solar"')
            
            for sk in solar_keys:
                if sk in scada_df.columns:
                    solar = float(scada_df[sk][row_idx] or 0)
                    break
            
            # 4. Others (Biogas)
            if cols.get("others") and cols["others"] in scada_df.columns:
                biogas = float(scada_df[cols["others"]][row_idx] or 0)
            
            # 5. Nuclear
            if cols.get("nuclear") and cols["nuclear"] in scada_df.columns:
                nuclear = float(scada_df[cols["nuclear"]][row_idx] or 0)
                
            # 6. Total SCADA Gen
            scada_gen_col = state.get("scada_gen")
            if scada_gen_col and scada_gen_col in scada_df.columns:
                total_scada_gen = float(scada_df[scada_gen_col][row_idx] or 0)
            else:
                total_scada_gen = thermal + hydro + solar + biogas + nuclear
    else:
        # Fallback using mock proportions
        mp = state["mock_p"]
        thermal = max_demand * mp["thermal"]
        hydro = max_demand * mp["hydro"]
        solar = max_demand * mp["solar"]
        biogas = 0.0
        nuclear = 0.0
        total_scada_gen = thermal + hydro + solar + biogas + nuclear
        
    # WBES Schedules
    isgs = 0.0
    gna = 0.0
    tgna = 0.0
    idam = 0.0
    rtm = 0.0
    
    wbes_name = state["wbes"]
    state_schedule = next((x for x in wbes_data if x.get("Acronym") == wbes_name), None)
    if state_schedule:
        net_schd_list = state_schedule.get("NetScheduleSummary", {}).get("NetSchdDataList", [])
        block_idx = hour * 4 + minute // 15
        
        # Helper to parse wbes list safely
        def get_wbes_val(filter_fn):
            for item in net_schd_list:
                if filter_fn(item):
                    amounts = item.get('NetSchdAmount', [])
                    if len(amounts) > block_idx:
                        return float(amounts[block_idx] or 0)
            return 0.0
            
        isgs = (
            get_wbes_val(lambda x: x.get('EnergyScheduleTypeName') == 'ISGS') +
            get_wbes_val(lambda x: x.get('EnergyScheduleTypeName') == 'URS')
        )
        gna = (
            get_wbes_val(lambda x: x.get('EnergyScheduleTypeName') == 'OA_GNA') +
            get_wbes_val(lambda x: x.get('EnergyScheduleSubTypeName') == 'OA_GNA')
        )
        tgna = (
            get_wbes_val(lambda x: x.get('EnergyScheduleTypeName') == 'OA_TGNA') +
            get_wbes_val(lambda x: x.get('EnergyScheduleSubTypeName') == 'OA_TGNA')
        )
        idam = (
            get_wbes_val(lambda x: x.get('EnergyScheduleTypeName') == 'OA_PX' and x.get('PXTransactionTypeName') == 'DAM') +
            get_wbes_val(lambda x: x.get('EnergyScheduleTypeName') == 'OA_PX' and x.get('PXTransactionTypeName') == 'GDAM') +
            get_wbes_val(lambda x: x.get('EnergyScheduleTypeName') == 'OA_PX' and x.get('PXTransactionTypeName') == 'HPDAM')
        )
        rtm = get_wbes_val(lambda x: x.get('EnergyScheduleTypeName') == 'OA_PX' and x.get('PXTransactionTypeName') == 'RTM')
    else:
        # Fallback using mock proportions
        mp = state["mock_p"]
        isgs = max_demand * mp["isgs"]
        px_fallback = max_demand * mp["px"]
        idam = px_fallback * 0.8
        rtm = px_fallback * 0.2
        gna = max_demand * 0.05
        tgna = max_demand * 0.02
        
    # DSM calculation (deviation)
    # Deviation = Demand - (Thermal + Hydro + Solar + Biogas + Nuclear + ISGS + GNA + TGNA + iDAM + RTM)
    dsm = max_demand - (thermal + hydro + solar + biogas + nuclear + isgs + gna + tgna + idam + rtm)
    
    return {
        "thermal": round(thermal, 1),
        "hydro": round(hydro, 1),
        "solar": round(solar, 1),
        "biogas": round(biogas, 1),
        "nuclear": round(nuclear, 1),
        "isgs": round(isgs, 1),
        "gna": round(gna, 1),
        "tgna": round(tgna, 1),
        "idam": round(idam, 1),
        "rtm": round(rtm, 1),
        "dsm": round(dsm, 1)
    }

def calculate_and_save_portfolio(target_date: date):
    db = MongoService()
    date_str_db = target_date.strftime("%Y-%m-%d")
    
    # 1. Load data sources (psp_data, psp_historical, WBES, SCADA)
    # psp_data
    psp_doc = db.psp_collection.find_one({"date": date_str_db})
    max_demand_list = psp_doc.get("pspstatedemandrequirement", []) if psp_doc else []
    
    # psp_historical
    hist_doc = db.db["psp_historical"].find_one({"date": date_str_db})
    
    # wbes
    config_service = PipelineConfigService()
    config = config_service.get_config("PSP") or {}
    wbes_url = config.get("wbes_url", "https://gateway.grid-india.in/POSOCO/reports/1.0/WebAccessAPI/GetUtilityExternalSharedData")
    wbes_api_key = config.get("wbes_api_key", "6dc32d47-f46a-45c9-afaf-c6ce73c4ca71")
    wbes_username = config.get("wbes_username", "erldc_internal_prod")
    wbes_password = config.get("wbes_password", "ErldcPr0d@052024")
    
    wbes_data = []
    try:
        url = f"{wbes_url}?apikey={wbes_api_key}"
        payload = {
            "Date": target_date.strftime("%d-%m-%Y"),
            "SchdRevNo": -1,
            "UserName": wbes_username,
            "UtilAcronymList": ['BIHAR_STATE', 'DVC_STATE', 'JHARKHAND_STATE', 'ODISHA_STATE', 'SIKKIM_STATE', 'WB_STATE'],
            "UtilRegionIdList": [1]
        }
        res = requests.post(url, json=payload, auth=(wbes_username, wbes_password), timeout=10)
        if res.status_code == 200:
            wbes_data = res.json().get('ResponseBody', {}).get('GroupWiseDataList', [])
    except Exception as e:
        print(f"Error fetching WBES data dynamically in save portfolio: {e}")
        
    # scada
    is_smb_online = False
    try:
        import socket
        socket.setdefaulttimeout(1.0)
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.connect(("10.3.95.200", 445))
        is_smb_online = True
    except Exception:
        pass
        
    scada_df = None
    if is_smb_online:
        scada_path = '//10.3.95.200/HTTP-Access/ScadaData/er_web/ER_THERMAL_GEN_{}.xlsx'.format(target_date.strftime("%d%m%Y"))
        if os.path.exists(scada_path):
            try:
                scada_df = pd.read_excel(scada_path, sheet_name="DATA", header=[1])
            except Exception as e:
                print(f"Error reading SCADA excel: {e}")
                
    STATES = [
        {"name": "BIHAR", "psp": "BIHAR", "historical_prefix": "BIHAR", "wbes": "BIHAR_STATE", 
         "scada": {"thermal": "BH_THERMAL", "hydro": "BIHAR HYDRO", "solar": "BIHAR SOLAR", "nuclear": None, "others": None}, 
         "scada_gen": "Bihar Total", "highlight": "Bihar",
         "mock_p": {"thermal": 0.42, "hydro": 0.05, "solar": 0.02, "isgs": 0.35, "px": 0.12}},
        {"name": "JHARKHAND", "psp": "JHARKHAND", "historical_prefix": "JHARKHAND", "wbes": "JHARKHAND_STATE", 
         "scada": {"thermal": "JH_THERMAL", "hydro": "JSEB_HYDRO", "solar": None, "nuclear": None, "others": "JESB CPP+OTHERS"}, 
         "scada_gen": "JSEB_TOTAL", "highlight": "Jharkhand",
         "mock_p": {"thermal": 0.38, "hydro": 0.12, "solar": 0.0, "isgs": 0.30, "px": 0.10}},
        {"name": "DVC", "psp": "DVC", "historical_prefix": "DVC", "wbes": "DVC_STATE", 
         "scada": {"thermal": "DVC_THERMAL", "hydro": "DVC _HYDRO", "solar": None, "nuclear": None, "others": "DVC CPP + OTHERS"}, 
         "scada_gen": "DVC _Total", "highlight": "DVC",
         "mock_p": {"thermal": 0.75, "hydro": 0.05, "solar": 0.0, "isgs": 0.10, "px": 0.05}},
        {"name": "ODISHA", "psp": "ORISSA", "historical_prefix": "ORISSA", "wbes": "ODISHA_STATE", 
         "scada": {"thermal": "ODISHA_THERMAL", "hydro": "Odisha Hydro", "solar": "GRIDCO SOLAR", "nuclear": None, "others": "odisha cpp (CPPGR)"}, 
         "scada_gen": "Odisha_Total", "highlight": "Odisha",
         "mock_p": {"thermal": 0.45, "hydro": 0.18, "solar": 0.03, "isgs": 0.22, "px": 0.08}},
        {"name": "WEST BENGAL", "psp": "WEST BENGAL", "historical_prefix": "WEST_BENGAL", "wbes": "WB_STATE", 
         "scada": {"thermal": "WEST_BENGAL", "hydro": "WB_Hydro", "solar": "WB_RE_GEN", "nuclear": None, "others": "wb cpp (CPPWB)"}, 
         "scada_gen": "WB_Total", "highlight": "W. Bengal",
         "mock_p": {"thermal": 0.58, "hydro": 0.08, "solar": 0.02, "isgs": 0.20, "px": 0.08}},
        {"name": "SIKKIM", "psp": "SIKKIM", "historical_prefix": "SIKKIM", "wbes": "SIKKIM_STATE", 
         "scada": {"thermal": None, "hydro": None, "solar": None, "nuclear": None, "others": None}, 
         "scada_gen": None, "highlight": "Sikkim",
         "mock_p": {"thermal": 0.0, "hydro": 0.0, "solar": 0.0, "isgs": 0.85, "px": 0.10}}
    ]
    
    # 2. Compute each state's peak portfolio
    states_data = {}
    sum_state_max_demand = 0.0
    
    for state in STATES:
        state_label = state["name"]
        psp_name = state["psp"]
        hist_prefix = state["historical_prefix"]
        
        max_demand = 0.0
        max_demand_time = "19:00"
        
        if hist_doc:
            max_demand = hist_doc.get(f"{hist_prefix}_MAX_DEMAND") or 0.0
            max_demand_time = hist_doc.get(f"{hist_prefix}_MAX_DEMAND_TIME") or "19:00"
            
        if not max_demand or max_demand == 0.0:
            match = next((x for x in max_demand_list if x.get("STATE_NAME") == psp_name), None)
            if match:
                max_demand = float(match.get("MAX_DEMAND") or 0.0)
                max_demand_time = match.get("MAX_DEMAND_TIME") or "19:00"
                
        if not max_demand or max_demand == 0.0:
            mock_scales = {
                "BIHAR": 6500.0, "JHARKHAND": 1500.0, "DVC": 3000.0,
                "ORISSA": 4800.0, "WEST BENGAL": 6800.0, "SIKKIM": 120.0
            }
            max_demand = mock_scales.get(psp_name, 1000.0)
            max_demand_time = "19:30"
            
        sum_state_max_demand += max_demand
        
        # Loadshed
        loadshed = 0.0
        match = next((x for x in max_demand_list if x.get("STATE_NAME") == psp_name), None)
        if match:
            loadshed = abs(float(match.get("MAX_DEMAND_SHORTAGE") or 0.0))
            
        portfolio = compute_state_portfolio(state, target_date, max_demand_time, max_demand, wbes_data, scada_df)
        
        states_data[state_label] = {
            "max_demand": round(max_demand, 1),
            "time": max_demand_time,
            "loadshed": round(loadshed, 1),
            "portfolio": portfolio
        }
        
    # 3. Compute ER Regional portfolio at regional peak time
    er_max_demand = 0.0
    er_max_demand_time = "19:00"
    if hist_doc:
        er_max_demand = hist_doc.get("ER_MAX_DEMAND") or 0.0
        er_max_demand_time = hist_doc.get("ER_MAX_DEMAND_TIME") or "19:00"
        
    if not er_max_demand or er_max_demand == 0.0:
        match = next((x for x in max_demand_list if x.get("STATE_NAME").upper() == "REGION"), None)
        if match:
            er_max_demand = float(match.get("MAX_DEMAND") or 0.0)
            er_max_demand_time = match.get("MAX_DEMAND_TIME") or "19:00"
            
    if not er_max_demand or er_max_demand == 0.0:
        er_max_demand = sum_state_max_demand if sum_state_max_demand > 0 else 20000.0
        er_max_demand_time = "19:30"
        
    scale_factor = er_max_demand / (sum_state_max_demand if sum_state_max_demand > 0 else er_max_demand)
    
    er_portfolio = {
        "thermal": 0.0, "hydro": 0.0, "solar": 0.0, "biogas": 0.0, "nuclear": 0.0,
        "isgs": 0.0, "gna": 0.0, "tgna": 0.0, "idam": 0.0, "rtm": 0.0, "dsm": 0.0
    }
    
    for state in STATES:
        state_demand_at_er = states_data[state["name"]]["max_demand"] * scale_factor
        p = compute_state_portfolio(state, target_date, er_max_demand_time, state_demand_at_er, wbes_data, scada_df)
        for k in er_portfolio:
            er_portfolio[k] += p[k]
            
    # Round all values in er_portfolio
    for k in er_portfolio:
        er_portfolio[k] = round(er_portfolio[k], 1)
        
    # Loadshed for ER
    er_loadshed = 0.0
    match = next((x for x in max_demand_list if x.get("STATE_NAME").upper() == "REGION"), None)
    if match:
        er_loadshed = abs(float(match.get("MAX_DEMAND_SHORTAGE") or 0.0))
        
    er_data = {
        "max_demand": round(er_max_demand, 1),
        "time": er_max_demand_time,
        "loadshed": round(er_loadshed, 1),
        "portfolio": er_portfolio
    }
    
    # Save to psp_portfolio_breakdown collection
    result_doc = {
        "_id": date_str_db,
        "date": date_str_db,
        "states": states_data,
        "ER": er_data,
        "updated_at": datetime.utcnow().isoformat()
    }
    
    db.db["psp_portfolio_breakdown"].update_one(
        {"_id": date_str_db},
        {"$set": result_doc},
        upsert=True
    )
    
    return result_doc

def check_and_update_highest_portfolio(target_date: date):
    db = MongoService()
    date_str = target_date.strftime("%Y-%m-%d")
    
    portfolio_doc = db.db["psp_portfolio_breakdown"].find_one({"_id": date_str})
    if not portfolio_doc:
        try:
            portfolio_doc = calculate_and_save_portfolio(target_date)
        except Exception as e:
            print(f"Error calculating portfolio for {date_str}: {e}")
            return
            
    STATES = [
        {"name": "BIHAR"},
        {"name": "JHARKHAND"},
        {"name": "DVC"},
        {"name": "ODISHA"},
        {"name": "WEST BENGAL"},
        {"name": "SIKKIM"},
        {"name": "ER"}
    ]
    
    for state in STATES:
        state_label = state["name"]
        
        if state_label == "ER":
            new_val = portfolio_doc.get("ER", {}).get("max_demand", 0.0)
            new_time = portfolio_doc.get("ER", {}).get("time", "19:00")
            portfolio = portfolio_doc.get("ER", {}).get("portfolio", {})
        else:
            new_val = portfolio_doc.get("states", {}).get(state_label, {}).get("max_demand", 0.0)
            new_time = portfolio_doc.get("states", {}).get(state_label, {}).get("time", "19:00")
            portfolio = portfolio_doc.get("states", {}).get(state_label, {}).get("portfolio", {})
            
        if new_val == 0.0:
            continue
            
        curr_record = db.db["psp_highest_records"].find_one({"_id": state_label})
        
        if not curr_record or new_val > curr_record.get("max_demand", 0.0):
            prev = None
            if curr_record:
                prev = {
                    "date": curr_record["date"],
                    "max_demand": curr_record["max_demand"],
                    "max_demand_time": curr_record["max_demand_time"],
                    "portfolio": curr_record["portfolio"]
                }
                
            new_record = {
                "_id": state_label,
                "state": state_label,
                "date": date_str,
                "max_demand": new_val,
                "max_demand_time": new_time,
                "portfolio": portfolio,
                "previous_highest": prev,
                "updated_at": datetime.utcnow().isoformat()
            }
            
            db.db["psp_highest_records"].update_one(
                {"_id": state_label},
                {"$set": new_record},
                upsert=True
            )
            print(f"Updated highest record for {state_label} to {new_val} MW met on {date_str}")

def initialize_highest_records():
    db = MongoService()
    hist_docs = list(db.db["psp_historical"].find().sort("date", 1))
    print(f"Initializing highest records. Found {len(hist_docs)} historical documents.")
    
    highest = {}
    STATES = [
        {"name": "BIHAR", "historical_prefix": "BIHAR"},
        {"name": "JHARKHAND", "historical_prefix": "JHARKHAND"},
        {"name": "DVC", "historical_prefix": "DVC"},
        {"name": "ODISHA", "historical_prefix": "ORISSA"},
        {"name": "WEST BENGAL", "historical_prefix": "WEST_BENGAL"},
        {"name": "SIKKIM", "historical_prefix": "SIKKIM"},
        {"name": "ER", "historical_prefix": "ER"}
    ]
    
    for doc in hist_docs:
        date_str = doc.get("date")
        if not date_str:
            continue
            
        try:
            target_date = date.fromisoformat(date_str)
        except ValueError:
            continue
            
        for state in STATES:
            state_label = state["name"]
            prefix = state["historical_prefix"]
            
            val = doc.get(f"{prefix}_MAX_DEMAND")
            if val is not None:
                val = float(val)
                time_str = doc.get(f"{prefix}_MAX_DEMAND_TIME") or "19:00"
                
                curr_highest = highest.get(state_label)
                if curr_highest is None or val > curr_highest["max_demand"]:
                    prev = None
                    if curr_highest:
                        prev = {
                            "date": curr_highest["date"],
                            "max_demand": curr_highest["max_demand"],
                            "max_demand_time": curr_highest["max_demand_time"],
                            "portfolio": curr_highest["portfolio"]
                        }
                        
                    breakdown_doc = db.db["psp_portfolio_breakdown"].find_one({"_id": date_str})
                    if not breakdown_doc:
                        try:
                            breakdown_doc = calculate_and_save_portfolio(target_date)
                        except Exception as e:
                            print(f"Error calculating portfolio for {date_str} during init: {e}")
                            continue
                            
                    if state_label == "ER":
                        portfolio = breakdown_doc.get("ER", {}).get("portfolio", {})
                    else:
                        portfolio = breakdown_doc.get("states", {}).get(state_label, {}).get("portfolio", {})
                        
                    highest[state_label] = {
                        "_id": state_label,
                        "state": state_label,
                        "date": date_str,
                        "max_demand": val,
                        "max_demand_time": time_str,
                        "portfolio": portfolio,
                        "previous_highest": prev,
                        "updated_at": datetime.utcnow().isoformat()
                    }
                    
    for state_label, record in highest.items():
        db.db["psp_highest_records"].update_one(
            {"_id": state_label},
            {"$set": record},
            upsert=True
        )
    print("Finished initializing highest records.")

@router.get("/portfolio-demand-breakdown")
async def get_portfolio_demand_breakdown(date_str: str = None):
    db = MongoService()
    
    if date_str:
        try:
            target_date = date.fromisoformat(date_str)
        except ValueError:
            return {"success": False, "message": "Invalid date format. Use YYYY-MM-DD."}
    else:
        latest_doc = db.psp_collection.find_one(
            {"pspstatedemandrequirement": {"$exists": True, "$ne": []}},
            sort=[("date", -1)]
        )
        if latest_doc:
            target_date = date.fromisoformat(latest_doc["date"])
        else:
            target_date = date.today() - timedelta(days=1)
            
    date_str_db = target_date.strftime("%Y-%m-%d")
    
    portfolio_doc = db.db["psp_portfolio_breakdown"].find_one({"_id": date_str_db})
    if not portfolio_doc:
        try:
            portfolio_doc = calculate_and_save_portfolio(target_date)
        except Exception as e:
            return {"success": False, "message": f"Failed to calculate portfolio: {str(e)}"}
            
    breakdown_data = []
    for state_name, val in portfolio_doc.get("states", {}).items():
        breakdown_data.append({
            "state": state_name,
            "max_demand": val.get("max_demand"),
            "time": val.get("time"),
            "loadshed": val.get("loadshed"),
            "internal_gen": {
                "thermal": val.get("portfolio", {}).get("thermal", 0.0),
                "hydro": val.get("portfolio", {}).get("hydro", 0.0),
                "solar": val.get("portfolio", {}).get("solar", 0.0),
                "biogas": val.get("portfolio", {}).get("biogas", 0.0),
                "nuclear": val.get("portfolio", {}).get("nuclear", 0.0)
            },
            "portfolio": {
                "isgs": val.get("portfolio", {}).get("isgs", 0.0),
                "gna": val.get("portfolio", {}).get("gna", 0.0),
                "tgna": val.get("portfolio", {}).get("tgna", 0.0),
                "idam": val.get("portfolio", {}).get("idam", 0.0),
                "rtm": val.get("portfolio", {}).get("rtm", 0.0),
                "dsm": val.get("portfolio", {}).get("dsm", 0.0)
            }
        })
        
    er_val = portfolio_doc.get("ER", {})
    er_breakdown = {
        "state": "ER",
        "max_demand": er_val.get("max_demand"),
        "time": er_val.get("time"),
        "loadshed": er_val.get("loadshed"),
        "internal_gen": {
            "thermal": er_val.get("portfolio", {}).get("thermal", 0.0),
            "hydro": er_val.get("portfolio", {}).get("hydro", 0.0),
            "solar": er_val.get("portfolio", {}).get("solar", 0.0),
            "biogas": er_val.get("portfolio", {}).get("biogas", 0.0),
            "nuclear": er_val.get("portfolio", {}).get("nuclear", 0.0)
        },
        "portfolio": {
            "isgs": er_val.get("portfolio", {}).get("isgs", 0.0),
            "gna": er_val.get("portfolio", {}).get("gna", 0.0),
            "tgna": er_val.get("portfolio", {}).get("tgna", 0.0),
            "idam": er_val.get("portfolio", {}).get("idam", 0.0),
            "rtm": er_val.get("portfolio", {}).get("rtm", 0.0),
            "dsm": er_val.get("portfolio", {}).get("dsm", 0.0)
        }
    }
    
    return {
        "success": True,
        "date": date_str_db,
        "data": breakdown_data,
        "er_data": er_breakdown
    }

@router.get("/highest-records")
async def get_highest_records():
    db = MongoService()
    count = db.db["psp_highest_records"].count_documents({})
    if count == 0:
        try:
            initialize_highest_records()
        except Exception as e:
            return {"success": False, "message": f"Failed to initialize highest records: {str(e)}"}
            
    records = list(db.db["psp_highest_records"].find({}, {"_id": 0}))
    return {
        "success": True,
        "data": records
    }

@router.get("/initialize-highest")
async def trigger_initialize_highest():
    try:
        initialize_highest_records()
        return {"success": True, "message": "Highest records initialized successfully."}
    except Exception as e:
        return {"success": False, "message": str(e)}

@router.get("/power-position")
async def get_power_position(date_str: str = None):
    db = MongoService()
    
    # 1. Determine target date
    if not date_str:
        latest_doc = db.psp_collection.find_one(
            {"pspstatedemandrequirement": {"$exists": True, "$ne": []}},
            sort=[("date", -1)]
        )
        if latest_doc:
            target_date_str = latest_doc["date"]
        else:
            target_date_str = (date.today() - timedelta(days=1)).strftime("%Y-%m-%d")
    else:
        target_date_str = date_str
        
    # Spreadsheet baseline peaks strictly before 2026-06-02
    BASELINE_PEAKS = {
        "BIHAR": {
            "max_demand": 8822.0, "max_demand_date": "2026-05-24", "max_demand_time": "22:01",
            "max_energy": 186.78, "max_energy_date": "2025-07-24"
        },
        "DVC": {
            "max_demand": 3674.0, "max_demand_date": "2024-06-14", "max_demand_time": "19:30",
            "max_energy": 81.22, "max_energy_date": "2022-04-22"
        },
        "JHARKHAND": {
            "max_demand": 2609.0, "max_demand_date": "2026-05-26", "max_demand_time": "20:00",
            "max_energy": 55.85, "max_energy_date": "2026-05-20"
        },
        "ODISHA": {
            "max_demand": 8482.0, "max_demand_date": "2026-05-22", "max_demand_time": "14:39",
            "max_energy": 162.51, "max_energy_date": "2026-05-22"
        },
        "SIKKIM": {
            "max_demand": 137.0, "max_demand_date": "2024-01-11", "max_demand_time": "18:59",
            "max_energy": 2.50, "max_energy_date": "2020-01-28"
        },
        "WEST BENGAL": {
            "max_demand": 13398.0, "max_demand_date": "2026-05-22", "max_demand_time": "23:26",
            "max_energy": 279.38, "max_energy_date": "2026-05-22"
        },
        "ER": {
            "max_demand": 34875.0, "max_demand_date": "2026-05-22", "max_demand_time": "23:23",
            "max_energy": 750.69, "max_energy_date": "2026-05-22"
        }
    }

    STATES = [
        {"name": "BIHAR", "hist_prefix": "BIHAR", "daily_demand_name": "BIHAR", "daily_energy_name": "BIHAR"},
        {"name": "DVC", "hist_prefix": "DVC", "daily_demand_name": "DVC", "daily_energy_name": "DVC"},
        {"name": "JHARKHAND", "hist_prefix": "JHARKHAND", "daily_demand_name": "JHARKHAND", "daily_energy_name": "JHARKHAND"},
        {"name": "ODISHA", "hist_prefix": "ORISSA", "daily_demand_name": "ORISSA", "daily_energy_name": "ODISHA"},
        {"name": "SIKKIM", "hist_prefix": "SIKKIM", "daily_demand_name": "SIKKIM", "daily_energy_name": "SIKKIM"},
        {"name": "WEST BENGAL", "hist_prefix": "WEST_BENGAL", "daily_demand_name": "WEST BENGAL", "daily_energy_name": "WEST BENGAL"},
        {"name": "ER", "hist_prefix": "ER", "daily_demand_name": "REGION", "daily_energy_name": "ER"}
    ]

    # helper to get daily data
    def get_daily_values_inline(doc_hist, doc_daily):
        if doc_hist:
            res = {}
            for s in STATES:
                name = s["name"]
                prefix = s["hist_prefix"]
                demand = doc_hist.get(f"{prefix}_MAX_DEMAND")
                demand_time = doc_hist.get(f"{prefix}_MAX_DEMAND_TIME") or "19:00"
                energy_key = f"{prefix}_ENERGY" if prefix != "ORISSA" else "ODISHA_ENERGY"
                energy = doc_hist.get(energy_key)
                
                res[name] = {
                    "demand": float(demand) if demand is not None else 0.0,
                    "demand_time": str(demand_time),
                    "energy": float(energy) if energy is not None else 0.0
                }
            return res
        elif doc_daily:
            demand_list = doc_daily.get("pspstatedemandrequirement", [])
            demand_map = {item.get("STATE_NAME"): item for item in demand_list if item.get("STATE_NAME")}
            
            load_list = doc_daily.get("pspstateloaddetailsER", [])
            load_map = {item.get("STATE_NAME"): item for item in load_list if item.get("STATE_NAME")}
            
            er_energy = sum(float(item.get("CONSUMPTION", 0) or 0) for item in load_list)
            
            res = {}
            for s in STATES:
                name = s["name"]
                daily_dem_name = s["daily_demand_name"]
                daily_en_name = s["daily_energy_name"]
                
                # Demand
                match_dem = demand_map.get(daily_dem_name)
                demand = float(match_dem.get("MAX_DEMAND") or 0.0) if match_dem else 0.0
                demand_time = match_dem.get("MAX_DEMAND_TIME") or "19:00" if match_dem else "19:00"
                
                # Energy
                if name == "ER":
                    energy = er_energy
                else:
                    match_en = load_map.get(daily_en_name)
                    energy = float(match_en.get("CONSUMPTION") or 0.0) if match_en else 0.0
                    
                res[name] = {
                    "demand": demand,
                    "demand_time": demand_time,
                    "energy": energy
                }
            return res
        return None

    # Get target date's data
    t_hist = db.db["psp_historical"].find_one({"date": target_date_str})
    t_daily = db.psp_collection.find_one({"date": target_date_str})
    
    target_data = get_daily_values_inline(t_hist, t_daily)
    if not target_data:
        return {"success": True, "has_data": False, "date": target_date_str, "rows": []}

    # Chronologically compute running peaks strictly before target_date_str
    import json
    running_peaks = json.loads(json.dumps(BASELINE_PEAKS)) # deep copy
    
    start_dt = date.fromisoformat("2026-06-02")
    try:
        target_dt = date.fromisoformat(target_date_str)
    except Exception:
        target_dt = start_dt

    if target_dt > start_dt:
        # Bulk query for intermediate dates
        hist_docs = list(db.db["psp_historical"].find({
            "date": {"$gte": "2026-06-02", "$lt": target_date_str}
        }))
        hist_map = {d["date"]: d for d in hist_docs if "date" in d}
        
        daily_docs = list(db.psp_collection.find({
            "date": {"$gte": "2026-06-02", "$lt": target_date_str}
        }))
        daily_map = {d["date"]: d for d in daily_docs if "date" in d}
        
        curr_dt = start_dt
        while curr_dt < target_dt:
            curr_str = curr_dt.strftime("%Y-%m-%d")
            curr_vals = get_daily_values_inline(hist_map.get(curr_str), daily_map.get(curr_str))
            if curr_vals:
                for s in STATES:
                    name = s["name"]
                    # Demand
                    if curr_vals[name]["demand"] > running_peaks[name]["max_demand"]:
                        running_peaks[name]["max_demand"] = curr_vals[name]["demand"]
                        running_peaks[name]["max_demand_date"] = curr_str
                        running_peaks[name]["max_demand_time"] = curr_vals[name]["demand_time"]
                    # Energy
                    if curr_vals[name]["energy"] > running_peaks[name]["max_energy"]:
                        running_peaks[name]["max_energy"] = curr_vals[name]["energy"]
                        running_peaks[name]["max_energy_date"] = curr_str
            curr_dt += timedelta(days=1)

    # Assemble rows
    rows = []
    for s in STATES:
        name = s["name"]
        t_val = target_data[name]
        p_val = running_peaks[name]
        
        demand_break = t_val["demand"] > p_val["max_demand"]
        energy_break = t_val["energy"] > p_val["max_energy"]
        
        demand_diff_mw = t_val["demand"] - p_val["max_demand"]
        demand_diff_pct = (demand_diff_mw / p_val["max_demand"] * 100) if p_val["max_demand"] > 0 else 0.0
        
        energy_diff_mu = t_val["energy"] - p_val["max_energy"]
        energy_diff_pct = (energy_diff_mu / p_val["max_energy"] * 100) if p_val["max_energy"] > 0 else 0.0
        
        rows.append({
            "constituent": name,
            "daily_demand": t_val["demand"],
            "daily_demand_time": t_val["demand_time"],
            "daily_energy": round(t_val["energy"], 2),
            
            "all_time_demand": p_val["max_demand"],
            "all_time_demand_date": p_val["max_demand_date"],
            "all_time_demand_time": p_val["max_demand_time"],
            
            "all_time_energy": round(p_val["max_energy"], 2),
            "all_time_energy_date": p_val["max_energy_date"],
            
            "demand_break": demand_break,
            "demand_diff_mw": round(demand_diff_mw, 1),
            "demand_diff_pct": round(demand_diff_pct, 2),
            
            "energy_break": energy_break,
            "energy_diff_mu": round(energy_diff_mu, 2),
            "energy_diff_pct": round(energy_diff_pct, 2)
        })
        
    return {
        "success": True,
        "has_data": True,
        "date": target_date_str,
        "rows": rows
    }

@router.get("/voltage-profile")
async def get_voltage_profile(date_str: str = None):
    """Get voltage profile for 400kV and 765kV substations for map visualization."""
    db = MongoService()

    if date_str:
        doc = db.psp_collection.find_one({"date": date_str})
    else:
        doc = db.psp_collection.find_one(
            {
                "pspVoltageProfile_400kv": {"$exists": True, "$not": {"$size": 0}}
            },
            sort=[("date", -1)]
        )

    if not doc:
        return {"success": True, "has_data": False, "date": None, "kv400": [], "kv765": []}

    def classify_station_400(station):
        min_v = float(station.get("min_voltage") or 0.0)
        max_v = float(station.get("max_voltage") or 0.0)
        if min_v == 0.0 and max_v == 0.0:
            return "offline"
        elif min_v < 380:
            return "low"
        elif max_v >= 420:
            return "high"
        else:
            return "normal"

    def classify_station_765(station):
        min_v = float(station.get("min_voltage") or 0.0)
        max_v = float(station.get("max_voltage") or 0.0)
        if min_v == 0.0 and max_v == 0.0:
            return "offline"
        elif min_v < 728:
            return "low"
        elif max_v >= 800:
            return "high"
        else:
            return "normal"

    kv400_raw = doc.get("pspVoltageProfile_400kv", [])
    kv765_raw = doc.get("pspVoltageProfile_765kv", [])

    kv400 = []
    for s in kv400_raw:
        kv400.append({
            "station_key": s.get("station_key"),
            "name": s.get("STATION_NAME", ""),
            "min_voltage": float(s.get("min_voltage") or 0.0),
            "max_voltage": float(s.get("max_voltage") or 0.0),
            "min_time": s.get("MIN_TIME", ""),
            "max_time": s.get("MAX_TIME", ""),
            "volt1": s.get("volt1", ""),
            "volt1_value": float(s.get("volt1_value") or 0.0),
            "volt2": s.get("volt2", ""),
            "volt2_value": float(s.get("volt2_value") or 0.0),
            "volt3": s.get("volt3", ""),
            "volt3_value": float(s.get("volt3_value") or 0.0),
            "volt4": s.get("volt4", ""),
            "volt4_value": float(s.get("volt4_value") or 0.0) if s.get("volt4_value") is not None else 0.0,
            "deviation_index": float(s.get("Voltage_Dev_Index") or 0.0),
            "status": classify_station_400(s),
            "level": "400kV"
        })

    kv765 = []
    for s in kv765_raw:
        kv765.append({
            "station_key": s.get("station_key"),
            "name": s.get("STATION_NAME", ""),
            "min_voltage": float(s.get("min_voltage") or 0.0),
            "max_voltage": float(s.get("max_voltage") or 0.0),
            "min_time": s.get("MIN_TIME", ""),
            "max_time": s.get("MAX_TIME", ""),
            "volt1": s.get("volt1", ""),
            "volt1_value": float(s.get("volt1_value") or 0.0),
            "volt2": s.get("volt2", ""),
            "volt2_value": float(s.get("volt2_value") or 0.0),
            "volt3": s.get("volt3", ""),
            "volt3_value": float(s.get("volt3_value") or 0.0),
            "volt4": s.get("volt4") if s.get("volt4") != "null" else None,
            "volt4_value": float(s.get("volt4_value") or 0.0) if s.get("volt4_value") is not None else None,
            "deviation_index": float(s.get("Voltage_Dev_Index") or 0.0),
            "status": classify_station_765(s),
            "level": "765kV"
        })

    return {
        "success": True,
        "has_data": True,
        "date": doc.get("date"),
        "kv400": kv400,
        "kv765": kv765
    }


