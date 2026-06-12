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

PSP_PEAK_BASELINES = {
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

PSP_PEAK_STATES = [
    {"name": "BIHAR", "hist_prefix": "BIHAR", "daily_demand_name": "BIHAR", "daily_energy_name": "BIHAR"},
    {"name": "DVC", "hist_prefix": "DVC", "daily_demand_name": "DVC", "daily_energy_name": "DVC"},
    {"name": "JHARKHAND", "hist_prefix": "JHARKHAND", "daily_demand_name": "JHARKHAND", "daily_energy_name": "JHARKHAND"},
    {"name": "ODISHA", "hist_prefix": "ORISSA", "daily_demand_name": "ORISSA", "daily_energy_name": "ODISHA"},
    {"name": "SIKKIM", "hist_prefix": "SIKKIM", "daily_demand_name": "SIKKIM", "daily_energy_name": "SIKKIM"},
    {"name": "WEST BENGAL", "hist_prefix": "WEST_BENGAL", "daily_demand_name": "WEST BENGAL", "daily_energy_name": "WEST BENGAL"},
    {"name": "ER", "hist_prefix": "ER", "daily_demand_name": "REGION", "daily_energy_name": "ER"}
]

PSP_PORTFOLIO_SOURCE_VERSION = "scada_cache_fallback_v5"

PSP_PORTFOLIO_STATE_CONFIGS = [
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

class PSPPortfolioMappingRow(BaseModel):
    name: str
    psp: str = ""
    wbes: str = ""
    scada_thermal: str = ""
    scada_hydro: str = ""
    scada_solar: str = ""
    scada_others: str = ""
    scada_nuclear: str = ""
    scada_gen: str = ""
    highlight: str = ""

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

@router.get("/portfolio-mapping")
async def get_psp_portfolio_mapping():
    try:
        db = MongoService()
        states = load_psp_portfolio_base_states(db)
        effective = build_psp_portfolio_states(db)
        candidate_map = {
            state["name"]: state.get("wbes_candidates", [])
            for state in effective
        }
        rows = []
        for state in states:
            row = serialize_psp_portfolio_mapping_state(state)
            row["wbes_candidates"] = candidate_map.get(row["name"], [])
            rows.append(row)
        return {"success": True, "data": rows}
    except Exception as e:
        return {"success": False, "message": str(e), "data": []}

@router.put("/portfolio-mapping")
async def save_psp_portfolio_mapping(rows: list[PSPPortfolioMappingRow]):
    try:
        db = MongoService()
        now_str = datetime.utcnow().isoformat()
        valid_names = {state["name"] for state in PSP_PORTFOLIO_STATE_CONFIGS}
        saved = 0

        for row in rows:
            if row.name not in valid_names:
                continue
            mapping = row.dict()
            db.db["psp_portfolio_mapping"].update_one(
                {"_id": row.name},
                {
                    "$set": {
                        "mapping": mapping,
                        "updated_at": now_str
                    }
                },
                upsert=True
            )
            saved += 1

        # Portfolio cache depends on these SCADA/WBES keys.
        db.db["psp_portfolio_breakdown"].delete_many({})
        return {
            "success": True,
            "message": f"Saved {saved} PSP portfolio mapping rows and cleared cached portfolio calculations."
        }
    except Exception as e:
        return {"success": False, "message": str(e)}

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

@router.get("/state-generation-sources")
async def get_state_generation_sources(date_str: str = None):
    """Get state-wise PSP generation source mix from pspstateloaddetailsER."""
    db = MongoService()

    projection = {"_id": 0, "date": 1, "pspstateloaddetailsER": 1}
    if date_str:
        doc = db.psp_collection.find_one({"date": date_str}, projection)
    else:
        doc = db.psp_collection.find_one(
            {"pspstateloaddetailsER": {"$exists": True, "$ne": []}},
            projection,
            sort=[("date", -1)]
        )

    if not doc:
        return {
            "success": True,
            "has_data": False,
            "date": None,
            "states": [],
            "composition": [],
            "totals": {},
        }

    def to_float(value):
        try:
            return float(value or 0.0)
        except (TypeError, ValueError):
            return 0.0

    source_fields = [
        ("thermal", "THERMAL", "Thermal"),
        ("hydro", "HYDRO", "Hydro"),
        ("wind", "WIND", "Wind"),
        ("solar", "SOLAR", "Solar"),
        ("small_hydro", "SMALL_HYDRO", "Small Hydro"),
        ("others", "OTHERS", "Others"),
    ]

    states = []
    totals = {
        "generation_total": 0.0,
        "drawing_schedule": 0.0,
        "ui": 0.0,
        "consumption": 0.0,
    }
    source_totals = {key: 0.0 for key, _, _ in source_fields}

    for item in doc.get("pspstateloaddetailsER", []) or []:
        state_name = str(item.get("STATE_NAME") or "").strip()
        if not state_name:
            continue

        row = {"state": state_name}
        generation_total = 0.0
        generation_abs_total = 0.0

        for key, raw_key, _ in source_fields:
            value = to_float(item.get(raw_key))
            row[key] = round(value, 3)
            source_totals[key] += value
            generation_total += value
            generation_abs_total += abs(value)

        row["generation_total"] = round(generation_total, 3)
        row["generation_abs_total"] = round(generation_abs_total, 3)
        row["drawing_schedule"] = round(to_float(item.get("DRAWAL_SCHDULE")), 3)
        row["ui"] = round(to_float(item.get("UI")), 3)
        row["consumption"] = round(to_float(item.get("CONSUMPTION")), 3)
        states.append(row)

        totals["generation_total"] += generation_total
        totals["drawing_schedule"] += row["drawing_schedule"]
        totals["ui"] += row["ui"]
        totals["consumption"] += row["consumption"]

    states.sort(key=lambda item: abs(item.get("generation_total", 0.0)), reverse=True)

    composition = []
    composition_denominator = sum(abs(value) for value in source_totals.values())
    for key, _, label in source_fields:
        value = source_totals[key]
        composition.append({
            "key": key,
            "name": label,
            "value": round(value, 3),
            "abs_value": round(abs(value), 3),
            "percent": round((abs(value) / composition_denominator * 100), 2) if composition_denominator > 0 else 0.0,
        })

    return {
        "success": True,
        "has_data": True,
        "date": doc.get("date"),
        "states": states,
        "composition": composition,
        "totals": {key: round(value, 3) for key, value in totals.items()},
    }



def psp_safe_float(value):
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    try:
        text = str(value).strip()
        if text in ["", "None", "null", "-"]:
            return None
        return float(text.replace("%", "").strip())
    except Exception:
        return None

def psp_block_index(query_time: str, series_len: int):
    if series_len <= 0:
        return 0
    try:
        hour, minute = [int(part) for part in str(query_time or "").split(":")[:2]]
    except Exception:
        hour, minute = 19, 0
    block_size = max(1, 1440 // series_len)
    minute_of_day = max(0, min(1439, hour * 60 + minute))
    return min(minute_of_day // block_size, series_len - 1)

def normalize_psp_identifier(value):
    if value in [None, ""]:
        return ""
    return " ".join(str(value).strip().upper().replace("_", " ").split())

def load_scada_cache_docs(db, target_date: date):
    try:
        return list(db.db["frequency_event_raw_data"].find(
            {
                "date": target_date.strftime("%Y-%m-%d"),
                "sources.scada_file.actual": {"$exists": True}
            },
            {
                "_id": 0,
                "plant_id": 1,
                "wbes_name": 1,
                "wbes_acronym": 1,
                "sources.scada_file.actual": 1,
            }
        ))
    except Exception as e:
        print(f"Error loading cached SCADA file data for PSP portfolio: {e}")
        return []

def cached_scada_value(scada_cache_docs: list, identifiers: list, query_time: str):
    candidates = {
        normalize_psp_identifier(identifier)
        for identifier in identifiers
        if normalize_psp_identifier(identifier)
    }
    if not candidates:
        return None

    for doc in scada_cache_docs or []:
        doc_identifiers = {
            normalize_psp_identifier(doc.get("plant_id")),
            normalize_psp_identifier(doc.get("wbes_name")),
            normalize_psp_identifier(doc.get("wbes_acronym")),
        }
        if not candidates.intersection(doc_identifiers):
            continue
        series = (((doc.get("sources") or {}).get("scada_file") or {}).get("actual"))
        if not series:
            continue
        idx = psp_block_index(query_time, len(series))
        value = psp_safe_float(series[idx] if idx < len(series) else None)
        if value is not None:
            return value
    return None

def scada_component_value(scada_df, scada_cache_docs: list, identifiers: list, row_idx: int, query_time: str):
    for identifier in identifiers:
        if scada_df is not None and identifier and identifier in scada_df.columns and row_idx < len(scada_df):
            value = psp_safe_float(scada_df[identifier][row_idx])
            if value is not None:
                return value, "SCADA_FILE"

    value = cached_scada_value(scada_cache_docs, identifiers, query_time)
    if value is not None:
        return value, "SCADA_FILE_CACHE"
    return None, ""

def compute_state_portfolio(state: dict, target_date: date, query_time: str, max_demand: float, wbes_data: list, scada_df: pd.DataFrame = None, scada_cache_docs: list = None):
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
    own_gen_source = "SCADA_FILE"
    scada_cache_docs = scada_cache_docs or []
    row_idx = hour * 60 + minute + 1
    scada_sources = set()
    
    if scada_df is not None or scada_cache_docs:
        if scada_df is None or row_idx < len(scada_df):
            cols = state["scada"]
            # 1. Thermal
            thermal_val, thermal_src = scada_component_value(scada_df, scada_cache_docs, [cols.get("thermal")], row_idx, query_time)
            if thermal_val is not None:
                thermal = thermal_val
                scada_sources.add(thermal_src)
            
            # 2. Hydro
            hydro_val, hydro_src = scada_component_value(scada_df, scada_cache_docs, [cols.get("hydro")], row_idx, query_time)
            if hydro_val is not None:
                hydro = hydro_val
                scada_sources.add(hydro_src)
            
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
            
            solar_val, solar_src = scada_component_value(scada_df, scada_cache_docs, solar_keys, row_idx, query_time)
            if solar_val is not None:
                solar = solar_val
                scada_sources.add(solar_src)
            
            # 4. Others (Biogas)
            biogas_val, biogas_src = scada_component_value(scada_df, scada_cache_docs, [cols.get("others")], row_idx, query_time)
            if biogas_val is not None:
                biogas = biogas_val
                scada_sources.add(biogas_src)
            
            # 5. Nuclear
            nuclear_val, nuclear_src = scada_component_value(scada_df, scada_cache_docs, [cols.get("nuclear")], row_idx, query_time)
            if nuclear_val is not None:
                nuclear = nuclear_val
                scada_sources.add(nuclear_src)
                
            # 6. Total SCADA Gen
            scada_gen_col = state.get("scada_gen")
            total_val, total_src = scada_component_value(
                scada_df,
                scada_cache_docs,
                [scada_gen_col, state.get("name"), state.get("psp"), state.get("highlight"), *state.get("wbes_candidates", [])],
                row_idx,
                query_time,
            )
            if total_val is not None:
                total_scada_gen = total_val
                own_gen_source = total_src
            else:
                total_scada_gen = thermal + hydro + solar + biogas + nuclear
                own_gen_source = "SCADA_COMPONENT_SUM_CACHE" if "SCADA_FILE_CACHE" in scada_sources else "SCADA_COMPONENT_SUM"
    else:
        # Fallback using mock proportions
        mp = state["mock_p"]
        thermal = max_demand * mp["thermal"]
        hydro = max_demand * mp["hydro"]
        solar = max_demand * mp["solar"]
        biogas = 0.0
        nuclear = 0.0
        total_scada_gen = thermal + hydro + solar + biogas + nuclear
        own_gen_source = "MOCK_FALLBACK_SCADA_UNAVAILABLE"
        
    # WBES Schedules
    isgs = 0.0
    gna = 0.0
    tgna = 0.0
    idam = 0.0
    rtm = 0.0
    
    wbes_candidates = state.get("wbes_candidates") or [state.get("wbes")]
    wbes_candidates = [str(x).strip().upper() for x in wbes_candidates if x]
    matched_wbes_acronym = ""
    state_schedule = next(
        (
            x for x in wbes_data
            if str(x.get("Acronym") or "").strip().upper() in wbes_candidates
        ),
        None
    )
    if state_schedule:
        matched_wbes_acronym = str(state_schedule.get("Acronym") or "")
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
        
    own_gen_for_dsm = total_scada_gen if total_scada_gen else (thermal + hydro + solar + biogas + nuclear)

    # DSM calculation (deviation)
    # Deviation = Demand - (Own SCADA Gen + ISGS + GNA + TGNA + iDAM + RTM)
    dsm = max_demand - (own_gen_for_dsm + isgs + gna + tgna + idam + rtm)
    
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
        "own_gen": round(own_gen_for_dsm, 1),
        "own_gen_source": own_gen_source,
        "wbes_acronym": matched_wbes_acronym,
        "wbes_source": "WBES_API" if state_schedule else "WBES_NOT_FOUND",
        "dsm": round(dsm, 1)
    }

def serialize_psp_portfolio_mapping_state(state):
    scada = state.get("scada", {}) or {}
    return {
        "name": state.get("name", ""),
        "psp": state.get("psp", ""),
        "wbes": state.get("wbes", ""),
        "scada_thermal": scada.get("thermal") or "",
        "scada_hydro": scada.get("hydro") or "",
        "scada_solar": scada.get("solar") or "",
        "scada_others": scada.get("others") or "",
        "scada_nuclear": scada.get("nuclear") or "",
        "scada_gen": state.get("scada_gen") or "",
        "highlight": state.get("highlight") or "",
    }

def load_psp_portfolio_base_states(db):
    overrides = {
        doc.get("_id"): doc
        for doc in db.db["psp_portfolio_mapping"].find({}, {"_id": 1, "mapping": 1})
        if doc.get("_id")
    }

    states = []
    for base in PSP_PORTFOLIO_STATE_CONFIGS:
        state = {
            **base,
            "scada": {**(base.get("scada") or {})},
            "mock_p": {**(base.get("mock_p") or {})},
        }
        override = (overrides.get(state["name"]) or {}).get("mapping") or {}
        if override:
            state["psp"] = override.get("psp") or state["psp"]
            state["wbes"] = override.get("wbes") or state["wbes"]
            state["scada"]["thermal"] = override.get("scada_thermal") or None
            state["scada"]["hydro"] = override.get("scada_hydro") or None
            state["scada"]["solar"] = override.get("scada_solar") or None
            state["scada"]["others"] = override.get("scada_others") or None
            state["scada"]["nuclear"] = override.get("scada_nuclear") or None
            state["scada_gen"] = override.get("scada_gen") or None
            state["highlight"] = override.get("highlight") or state.get("highlight")
        states.append(state)

    return states

def build_psp_portfolio_states(db):
    mapping_rows = list(db.db["frequency_mapping"].find(
        {
            "$or": [
                {"type": "State"},
                {"plant_id": {"$regex": "^STATE_", "$options": "i"}},
                {"rtg_plant_id": {"$regex": "^STATE_", "$options": "i"}},
            ]
        },
        {
            "_id": 0,
            "plant_id": 1,
            "plant_name": 1,
            "STAGE_NAME": 1,
            "rtg_plant_id": 1,
            "wbes_name": 1,
            "wbes_acronym": 1,
        }
    ))

    def norm(value):
        return str(value or "").strip().upper().replace("_", " ")

    states = []
    for base in load_psp_portfolio_base_states(db):
        state = {**base}
        candidates = {state["wbes"]}
        aliases = {
            norm(state["name"]),
            norm(state["psp"]),
            f"STATE {norm(state['name'])}",
            f"STATE {norm(state['psp'])}",
        }

        for row in mapping_rows:
            row_tokens = {
                norm(row.get("plant_id")),
                norm(row.get("rtg_plant_id")),
                norm(row.get("plant_name")),
                norm(row.get("STAGE_NAME")),
            }
            if aliases.intersection(row_tokens):
                for key in ("wbes_acronym", "wbes_name"):
                    value = str(row.get(key) or "").strip()
                    if value:
                        candidates.add(value)

        state["wbes_candidates"] = sorted(candidates)
        states.append(state)

    return states

def calculate_and_save_portfolio(target_date: date):
    db = MongoService()
    date_str_db = target_date.strftime("%Y-%m-%d")
    
    # 1. Load data sources (psp_data, psp_historical, WBES, SCADA)
    # psp_data
    psp_doc = db.psp_collection.find_one({"date": date_str_db})
    max_demand_list = psp_doc.get("pspstatedemandrequirement", []) if psp_doc else []
    
    # psp_historical
    hist_doc = db.db["psp_historical"].find_one({"date": date_str_db})
    
    STATES = build_psp_portfolio_states(db)

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
        util_acronyms = sorted({
            acronym
            for state in STATES
            for acronym in state.get("wbes_candidates", [])
            if acronym
        })
        payload = {
            "Date": target_date.strftime("%d-%m-%Y"),
            "SchdRevNo": -1,
            "UserName": wbes_username,
            "UtilAcronymList": util_acronyms,
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
                
    scada_cache_docs = load_scada_cache_docs(db, target_date) if scada_df is None else []
                
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
            
        portfolio = compute_state_portfolio(state, target_date, max_demand_time, max_demand, wbes_data, scada_df, scada_cache_docs)
        
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
        "isgs": 0.0, "gna": 0.0, "tgna": 0.0, "idam": 0.0, "rtm": 0.0,
        "own_gen": 0.0, "dsm": 0.0
    }
    
    for state in STATES:
        state_demand_at_er = states_data[state["name"]]["max_demand"] * scale_factor
        p = compute_state_portfolio(state, target_date, er_max_demand_time, state_demand_at_er, wbes_data, scada_df, scada_cache_docs)
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
        "source_version": PSP_PORTFOLIO_SOURCE_VERSION,
        "updated_at": datetime.utcnow().isoformat()
    }
    
    db.db["psp_portfolio_breakdown"].update_one(
        {"_id": date_str_db},
        {"$set": result_doc},
        upsert=True
    )
    
    return result_doc

def extract_psp_daily_values(doc_hist, doc_daily):
    if doc_hist:
        res = {}
        for state in PSP_PEAK_STATES:
            name = state["name"]
            prefix = state["hist_prefix"]
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

    if doc_daily:
        demand_list = doc_daily.get("pspstatedemandrequirement", [])
        demand_map = {item.get("STATE_NAME"): item for item in demand_list if item.get("STATE_NAME")}

        load_list = doc_daily.get("pspstateloaddetailsER", [])
        load_map = {item.get("STATE_NAME"): item for item in load_list if item.get("STATE_NAME")}
        er_energy = sum(float(item.get("CONSUMPTION", 0) or 0) for item in load_list)

        res = {}
        for state in PSP_PEAK_STATES:
            name = state["name"]
            match_dem = demand_map.get(state["daily_demand_name"])
            demand = float(match_dem.get("MAX_DEMAND") or 0.0) if match_dem else 0.0
            demand_time = match_dem.get("MAX_DEMAND_TIME") or "19:00" if match_dem else "19:00"

            if name == "ER":
                energy = er_energy
            else:
                match_en = load_map.get(state["daily_energy_name"])
                energy = float(match_en.get("CONSUMPTION") or 0.0) if match_en else 0.0

            res[name] = {
                "demand": demand,
                "demand_time": demand_time,
                "energy": energy
            }
        return res

    return None

def get_psp_daily_values(db, date_str: str):
    hist_doc = db.db["psp_historical"].find_one({"date": date_str})
    daily_doc = db.psp_collection.find_one({"date": date_str})
    return extract_psp_daily_values(hist_doc, daily_doc)

def portfolio_cache_is_stale(db, date_str: str, portfolio_doc: dict) -> bool:
    if portfolio_doc.get("source_version") != PSP_PORTFOLIO_SOURCE_VERSION:
        return True

    daily_values = get_psp_daily_values(db, date_str)
    if not daily_values:
        return False

    checks = []
    er_demand = portfolio_doc.get("ER", {}).get("max_demand")
    checks.append(("ER", er_demand, daily_values.get("ER", {}).get("demand")))

    state_docs = portfolio_doc.get("states", {})
    for state in PSP_PEAK_STATES:
        name = state["name"]
        if name == "ER":
            continue
        cached = state_docs.get(name, {}).get("max_demand")
        raw = daily_values.get(name, {}).get("demand")
        checks.append((name, cached, raw))

    for _, cached, raw in checks:
        if raw is None or raw == 0:
            continue
        if cached is None:
            return True
        if abs(float(cached) - float(raw)) > 1.0:
            return True

    return False

def get_valid_portfolio_doc(db, target_date: date):
    date_str = target_date.strftime("%Y-%m-%d")
    portfolio_doc = db.db["psp_portfolio_breakdown"].find_one({"_id": date_str})
    if not portfolio_doc or portfolio_cache_is_stale(db, date_str, portfolio_doc):
        portfolio_doc = calculate_and_save_portfolio(target_date)
    return portfolio_doc

def get_highest_portfolio_doc(db, peak_date: str):
    portfolio_doc = db.db["psp_portfolio_breakdown"].find_one({"_id": peak_date})
    if portfolio_doc and not portfolio_cache_is_stale(db, peak_date, portfolio_doc):
        return portfolio_doc

    # Current PSP daily records have source data available, so they can be rebuilt reliably.
    # Older spreadsheet baseline dates may not have daily PSP detail; keep the endpoint fast.
    if peak_date >= "2026-06-02":
        return calculate_and_save_portfolio(date.fromisoformat(peak_date))

    return portfolio_doc

def rebuild_highest_records_from_psp_daily():
    db = MongoService()

    import json
    highest = json.loads(json.dumps(PSP_PEAK_BASELINES))
    previous_records = {state: None for state in highest}

    daily_docs = db.psp_collection.find(
        {
            "date": {"$gte": "2026-06-02"},
            "pspstatedemandrequirement": {"$exists": True, "$ne": []}
        },
        {
            "date": 1,
            "pspstatedemandrequirement": 1,
            "pspstateloaddetailsER": 1
        }
    ).sort("date", 1)

    for daily_doc in daily_docs:
        curr_str = daily_doc.get("date")
        curr_vals = extract_psp_daily_values(None, daily_doc)
        if not curr_str or not curr_vals:
            continue

        for state in PSP_PEAK_STATES:
            name = state["name"]
            curr_demand = curr_vals.get(name, {}).get("demand", 0.0)
            if curr_demand > highest[name]["max_demand"]:
                previous_records[name] = {
                    "date": highest[name]["max_demand_date"],
                    "max_demand": highest[name]["max_demand"],
                    "max_demand_time": highest[name]["max_demand_time"],
                    "portfolio": {}
                }
                highest[name]["max_demand"] = curr_demand
                highest[name]["max_demand_date"] = curr_str
                highest[name]["max_demand_time"] = curr_vals[name]["demand_time"]

    records = []
    now_str = datetime.utcnow().isoformat()
    for state in PSP_PEAK_STATES:
        name = state["name"]
        peak = highest[name]
        peak_date = peak["max_demand_date"]
        portfolio = {}
        try:
            breakdown_doc = get_highest_portfolio_doc(db, peak_date)
            if breakdown_doc:
                if name == "ER":
                    portfolio = breakdown_doc.get("ER", {}).get("portfolio", {})
                else:
                    portfolio = breakdown_doc.get("states", {}).get(name, {}).get("portfolio", {})
        except Exception as e:
            print(f"Error loading portfolio for highest record {name} {peak_date}: {e}")

        previous = previous_records.get(name)
        if previous:
            try:
                prev_doc = get_highest_portfolio_doc(db, previous["date"])
                if prev_doc:
                    previous["portfolio"] = (
                        prev_doc.get("ER", {}).get("portfolio", {})
                        if name == "ER"
                        else prev_doc.get("states", {}).get(name, {}).get("portfolio", {})
                    )
            except Exception:
                previous["portfolio"] = {}

        record = {
            "_id": name,
            "state": name,
            "date": peak_date,
            "max_demand": peak["max_demand"],
            "max_demand_time": peak["max_demand_time"],
            "portfolio": portfolio,
            "previous_highest": previous,
            "updated_at": now_str,
            "source": "baseline_plus_psp_daily"
        }
        db.db["psp_highest_records"].update_one(
            {"_id": name},
            {"$set": record},
            upsert=True
        )
        record.pop("_id", None)
        records.append(record)

    return records

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
    
    try:
        portfolio_doc = get_valid_portfolio_doc(db, target_date)
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
                "own_gen": val.get("portfolio", {}).get("own_gen", 0.0),
                "own_gen_source": val.get("portfolio", {}).get("own_gen_source", ""),
                "wbes_acronym": val.get("portfolio", {}).get("wbes_acronym", ""),
                "wbes_source": val.get("portfolio", {}).get("wbes_source", ""),
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
            "own_gen": er_val.get("portfolio", {}).get("own_gen", 0.0),
            "own_gen_source": er_val.get("portfolio", {}).get("own_gen_source", ""),
            "wbes_acronym": er_val.get("portfolio", {}).get("wbes_acronym", ""),
            "wbes_source": er_val.get("portfolio", {}).get("wbes_source", ""),
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
    try:
        records = rebuild_highest_records_from_psp_daily()
    except Exception as e:
        return {"success": False, "message": f"Failed to rebuild highest records: {str(e)}"}
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
        
    # Spreadsheet baseline peaks strictly before 2026-06-02.
    BASELINE_PEAKS = PSP_PEAK_BASELINES
    STATES = PSP_PEAK_STATES

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

    er_substation_coords = {
        "ALIPURDUAR": {"lat": 26.49, "lng": 89.53, "state": "West Bengal"},
        "ANGUL": {"lat": 20.84, "lng": 85.10, "state": "Odisha"},
        "BANKA": {"lat": 24.88, "lng": 86.92, "state": "Bihar"},
        "BARIPADA": {"lat": 21.94, "lng": 86.72, "state": "Odisha"},
        "BEHRAMPORE": {"lat": 24.10, "lng": 88.25, "state": "West Bengal"},
        "BERHAMPORE": {"lat": 24.10, "lng": 88.25, "state": "West Bengal"},
        "BIHAR SHARIF": {"lat": 25.20, "lng": 85.52, "state": "Bihar"},
        "BODHGAYA": {"lat": 24.70, "lng": 84.99, "state": "Bihar"},
        "BOKARO": {"lat": 23.67, "lng": 86.15, "state": "Jharkhand"},
        "CHAIBASA": {"lat": 22.56, "lng": 85.80, "state": "Jharkhand"},
        "DARLIPALI": {"lat": 21.50, "lng": 83.40, "state": "Odisha"},
        "DURGAPUR": {"lat": 23.50, "lng": 87.30, "state": "West Bengal"},
        "FARAKKA": {"lat": 24.82, "lng": 87.92, "state": "West Bengal"},
        "GAYA": {"lat": 24.80, "lng": 85.00, "state": "Bihar"},
        "GODDA": {"lat": 24.83, "lng": 87.21, "state": "Jharkhand"},
        "GOKARNA": {"lat": 24.04, "lng": 88.18, "state": "West Bengal"},
        "JAMSHEDPUR": {"lat": 22.80, "lng": 86.20, "state": "Jharkhand"},
        "JEYPORE": {"lat": 18.90, "lng": 82.60, "state": "Odisha"},
        "JHARSUGUDA": {"lat": 21.90, "lng": 84.10, "state": "Odisha"},
        "KAHALGAON": {"lat": 25.25, "lng": 87.26, "state": "Bihar"},
        "KHARAGPUR": {"lat": 22.35, "lng": 87.32, "state": "West Bengal"},
        "KODERMA": {"lat": 24.50, "lng": 85.60, "state": "Jharkhand"},
        "MAITHON": {"lat": 23.78, "lng": 86.82, "state": "Jharkhand"},
        "MALDA": {"lat": 25.02, "lng": 88.14, "state": "West Bengal"},
        "MIDNAPORE": {"lat": 22.42, "lng": 87.32, "state": "West Bengal"},
        "MUZAFFARPUR": {"lat": 26.12, "lng": 85.40, "state": "Bihar"},
        "NEW PURNEA": {"lat": 25.78, "lng": 87.48, "state": "Bihar"},
        "PATNA": {"lat": 25.60, "lng": 85.10, "state": "Bihar"},
        "PURNIA": {"lat": 25.78, "lng": 87.48, "state": "Bihar"},
        "PURNEA": {"lat": 25.78, "lng": 87.48, "state": "Bihar"},
        "PURULIA": {"lat": 23.33, "lng": 86.36, "state": "West Bengal"},
        "RANCHI": {"lat": 23.40, "lng": 85.30, "state": "Jharkhand"},
        "RANGPO": {"lat": 27.18, "lng": 88.53, "state": "Sikkim"},
        "ROURKELA": {"lat": 22.22, "lng": 84.90, "state": "Odisha"},
        "SASARAM": {"lat": 24.95, "lng": 84.02, "state": "Bihar"},
        "STERLITE": {"lat": 21.90, "lng": 84.05, "state": "Odisha"},
        "TALCHER": {"lat": 20.95, "lng": 85.22, "state": "Odisha"},
        "TEESTA": {"lat": 26.75, "lng": 88.58, "state": "West Bengal"},
    }

    def clean_station_name(value: str):
        return (
            str(value or "")
            .upper()
            .replace("_", " ")
            .replace("-", " ")
            .replace("400KV", "")
            .replace("765KV", "")
            .replace("400 KV", "")
            .replace("765 KV", "")
            .strip()
        )

    def find_master_location(station_name: str):
        clean_name = clean_station_name(station_name)

        for collection_name in ("Substation_Master", "substation_master", "station_mapping"):
            if collection_name not in db.db.list_collection_names():
                continue

            doc_match = db.db[collection_name].find_one(
                {
                    "$or": [
                        {"name": {"$regex": clean_name, "$options": "i"}},
                        {"station_name": {"$regex": clean_name, "$options": "i"}},
                        {"STATION_NAME": {"$regex": clean_name, "$options": "i"}},
                    ]
                },
                {"_id": 0}
            )
            if not doc_match:
                continue

            lat = doc_match.get("lat") or doc_match.get("latitude")
            lng = doc_match.get("lng") or doc_match.get("lon") or doc_match.get("longitude")
            if lat is not None and lng is not None:
                return {
                    "lat": float(lat),
                    "lng": float(lng),
                    "state": doc_match.get("state") or doc_match.get("state_name") or "",
                    "location_source": collection_name,
                }

        for key, meta in er_substation_coords.items():
            if key in clean_name:
                return {**meta, "location_source": "ER_STATIC_MASTER"}

        return {"lat": None, "lng": None, "state": "", "location_source": "UNRESOLVED"}

    kv400 = []
    for s in kv400_raw:
        location = find_master_location(s.get("STATION_NAME", ""))
        kv400.append({
            "station_key": s.get("station_key"),
            "name": s.get("STATION_NAME", ""),
            **location,
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
        location = find_master_location(s.get("STATION_NAME", ""))
        kv765.append({
            "station_key": s.get("station_key"),
            "name": s.get("STATION_NAME", ""),
            **location,
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


@router.get("/power-exchange")
async def get_power_exchange(date_str: str = None):
    """Get ER inter-regional and transnational power exchange from PSP data."""
    db = MongoService()

    projection = {
        "_id": 0,
        "date": 1,
        "pspTransnationalExchangeState": 1,
        "pspinterregionalscheduleactual": 1,
    }

    if date_str:
        doc = db.psp_collection.find_one({"date": date_str}, projection)
    else:
        doc = db.psp_collection.find_one(
            {
                "$or": [
                    {"pspTransnationalExchangeState": {"$exists": True, "$ne": []}},
                    {"pspinterregionalscheduleactual": {"$exists": True, "$ne": []}},
                ]
            },
            projection,
            sort=[("date", -1)]
        )

    if not doc:
        return {
            "success": True,
            "has_data": False,
            "date": None,
            "interregional": [],
            "transnational": [],
            "totals": {
                "interregional_schedule": 0.0,
                "interregional_actual": 0.0,
                "transnational_schedule": 0.0,
                "transnational_actual": 0.0,
            },
        }

    def to_float(value):
        try:
            return float(value or 0.0)
        except (TypeError, ValueError):
            return 0.0

    region_labels = {
        "NR": "Northern Region",
        "WR": "Western Region",
        "SR": "Southern Region",
        "NER": "North Eastern Region",
    }

    interregional = []
    for row in doc.get("pspinterregionalscheduleactual", []) or []:
        to_region = str(row.get("TO_REGION_NAME") or "").upper()
        from_region = str(row.get("FROM_REGION_NAME") or "").upper()
        other_region = to_region if from_region == "ER" else from_region
        if other_region == "ER" or not other_region:
            continue

        interregional.append({
            "code": other_region,
            "name": region_labels.get(other_region, other_region),
            "from_region": from_region,
            "to_region": to_region,
            "schedule": round(to_float(row.get("TOTAL_IR_SCHEDULE")), 3),
            "actual": round(to_float(row.get("TOTAL_IR_ACTUAL")), 3),
            "net_ui": round(to_float(row.get("NET_IR_UI")), 3),
            "isgs_schedule": round(to_float(row.get("ISGS_SCHEDULE")), 3),
            "bilt_schedule": round(to_float(row.get("BILT_SCHEDULE")), 3),
            "px_schedule": round(to_float(row.get("PX_SCHEDULE")), 3),
        })

    country_labels = {
        "BANGLADESH": "Bangladesh",
        "BHUTAN": "Bhutan",
        "NEPAL": "Nepal",
    }

    transnational = []
    for row in doc.get("pspTransnationalExchangeState", []) or []:
        country = str(row.get("STATE_NAME") or "").upper()
        transnational.append({
            "code": country,
            "name": country_labels.get(country, country.title()),
            "schedule": round(to_float(row.get("Scheduled_EX")), 3),
            "actual": round(to_float(row.get("ACTUAL_EX")), 3),
            "day_peak": round(to_float(row.get("Day_Peak")), 3),
            "day_min": round(to_float(row.get("DAY_MIN")), 3),
            "day_avg": round(to_float(row.get("DAY_AVG")), 3),
        })

    return {
        "success": True,
        "has_data": True,
        "date": doc.get("date"),
        "interregional": interregional,
        "transnational": transnational,
        "totals": {
            "interregional_schedule": round(sum(item["schedule"] for item in interregional), 3),
            "interregional_actual": round(sum(item["actual"] for item in interregional), 3),
            "transnational_schedule": round(sum(item["schedule"] for item in transnational), 3),
            "transnational_actual": round(sum(item["actual"] for item in transnational), 3),
        },
    }


