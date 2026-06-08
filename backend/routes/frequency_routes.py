# frequency_routes.py
import json
import base64
import io
import os
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from datetime import datetime, timedelta, time
import requests
import pandas as pd
import numpy as np

# Non-interactive matplotlib backend
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.dates as mdates

from docx import Document
import docx.shared

from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image, PageBreak, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors

from fastapi import APIRouter, File, UploadFile, Query, Form, Body
from fastapi.responses import StreamingResponse
from services.db_handler import MongoService

router = APIRouter(
    prefix="/api/frequency",
    tags=["Frequency Report"]
)

# ──────────────────────────────────────────────────────────────
# SETTINGS & CONFIGURATION
# ──────────────────────────────────────────────────────────────

def get_rtg_schedule_url():
    db = MongoService()
    settings_coll = db.db.settings
    record = settings_coll.find_one({"key": "rtg_schedule_url"})
    if record:
        return record["value"]
    
    default_url = "https://rtgapi.grid-india.in/sendData/wbes-data/"
    settings_coll.update_one(
        {"key": "rtg_schedule_url"},
        {"$set": {"key": "rtg_schedule_url", "value": default_url}},
        upsert=True
    )
    return default_url

def get_rtg_scada_url():
    db = MongoService()
    settings_coll = db.db.settings
    record = settings_coll.find_one({"key": "rtg_scada_url"})
    if record:
        return record["value"]
    
    default_url = "https://rtgapi.grid-india.in/sendData/scada-data/"
    settings_coll.update_one(
        {"key": "rtg_scada_url"},
        {"$set": {"key": "rtg_scada_url", "value": default_url}},
        upsert=True
    )
    return default_url

@router.get("/settings")
async def get_settings():
    sch_url = get_rtg_schedule_url()
    scada_url = get_rtg_scada_url()
    return {
        "success": True,
        "rtg_schedule_url": sch_url,
        "rtg_scada_url": scada_url
    }

@router.put("/settings")
async def update_settings(payload: dict):
    sch_url = payload.get("rtg_schedule_url", "").strip()
    scada_url = payload.get("scada_url", "").strip()
    if not sch_url or not scada_url:
        return {"success": False, "error": "URLs cannot be empty"}
    
    db = MongoService()
    db.db.settings.update_one(
        {"key": "rtg_schedule_url"},
        {"$set": {"value": sch_url}},
        upsert=True
    )
    db.db.settings.update_one(
        {"key": "rtg_scada_url"},
        {"$set": {"value": scada_url}},
        upsert=True
    )
    return {"success": True, "message": "Settings updated successfully"}

@router.get("/check-rtg-status")
async def check_rtg_status(start_time: str, end_time: str):
    try:
        st = datetime.fromisoformat(start_time.replace("Z", ""))
        et = datetime.fromisoformat(end_time.replace("Z", ""))
        
        unique_dates = []
        curr = st.date()
        while curr <= et.date():
            unique_dates.append(curr.isoformat())
            curr += timedelta(days=1)
            
        db = MongoService()
        status_by_date = {}
        all_available = True
        
        for d in unique_dates:
            doc = db.rtg_dashboard_collection.find_one(
                {"snapshot_date": d},
                sort=[("snapshot_time", -1)]
            )
            if doc and doc.get("record_count", 0) > 0:
                records = doc.get("data", [])
                has_actuals = any(float(r.get("actual_gen") or r.get("actual_gen_derived") or 0) > 0 for r in records)
                if has_actuals:
                    status_by_date[d] = True
                else:
                    status_by_date[d] = False
                    all_available = False
            else:
                status_by_date[d] = False
                all_available = False
                
        return {
            "success": True,
            "all_available": all_available,
            "status_by_date": status_by_date,
            "message": "Actual data is reporting on RTG. Upload only Frequency Excel file." if all_available else "Actual data is NOT fully reporting on RTG. Both SCADA Actuals & Frequency data upload are required."
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

# ──────────────────────────────────────────────────────────────
# GET /api/frequency/plant-mapping
# ──────────────────────────────────────────────────────────────
@router.get("/plant-mapping")
async def get_plant_mapping():
    db = MongoService()
    data = list(db.map_collection.find({}, {"_id": 0}))
    return {"success": True, "data": data}

# ──────────────────────────────────────────────────────────────
# PUT /api/frequency/plant-mapping
# ──────────────────────────────────────────────────────────────
@router.put("/plant-mapping")
async def update_plant_mapping(payload: list):
    db = MongoService()
    updated = 0
    for row in payload:
        db.map_collection.update_one(
            {
                "plant_id": row.get("plant_id"),
                "STAGE_ID": row.get("STAGE_ID")
            },
            {"$set": {
                "wbes_name":       row.get("wbes_name", ""),
                "wbes_acronym":    row.get("wbes_acronym", ""),
                "scada_key":       row.get("scada_key", ""),
                "scada_header":    row.get("scada_header", ""),
                "outage_key":      row.get("outage_key", ""),
                "schedule_source": row.get("schedule_source", "RTG"),
                "dc_source":       row.get("dc_source", "RTG"),
                "rtg_plant_id":    row.get("rtg_plant_id", ""),
            }},
            upsert=False
        )
        updated += 1
    return {"success": True, "updated": updated}

# ──────────────────────────────────────────────────────────────
# DATA ACQUISITION & PROCESSING UTILS
# ──────────────────────────────────────────────────────────────

def get_legacy_session_no_verify():
    import ssl
    import urllib3
    class CustomHttpAdapterNoVerify(requests.adapters.HTTPAdapter):
        def __init__(self, ssl_context=None, **kwargs):
            self.ssl_context = ssl_context
            super().__init__(**kwargs)

        def init_poolmanager(self, connections, maxsize, block=False):
            self.poolmanager = urllib3.poolmanager.PoolManager(
                num_pools=connections,
                maxsize=maxsize,
                block=block,
                ssl_context=self.ssl_context
            )

    ctx = ssl.create_default_context(ssl.Purpose.SERVER_AUTH)
    ctx.options |= 0x4  # OP_LEGACY_SERVER_CONNECT
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    session = requests.session()
    session.mount('https://', CustomHttpAdapterNoVerify(ctx))
    return session

def fetch_wbes_schedule_raw(date_str: str, acronyms: list):
    """
    date_str is in DD-MM-YYYY format
    """
    db = MongoService()
    cfg = db.pipeline_config_collection.find_one({"config_type": "SCHEDULE"})
    if not cfg:
        cfg = {
            "schedule_url": "https://gateway.grid-india.in/POSOCO/reports/1.0/WebAccessAPI/GetUtilityExternalSharedData",
            "schedule_api_key": "6dc32d47-f46a-45c9-afaf-c6ce73c4ca71",
            "schedule_username": "erldc_internal_prod",
            "schedule_password": "ErldcPr0d@052024"
        }
    
    url = f"{cfg['schedule_url']}?apikey={cfg['schedule_api_key']}"
    data = {
        "Date": date_str,
        "SchdRevNo": -1,
        "UserName": cfg["schedule_username"],
        "UtilAcronymList": acronyms,
        "UtilRegionIdList": [1]
    }
    auth = (cfg["schedule_username"], cfg["schedule_password"])
    try:
        session = get_legacy_session_no_verify()
        res = session.post(url, json=data, auth=auth, timeout=30)
        if res.status_code == 200:
            return res.json().get("ResponseBody", {}).get("GroupWiseDataList", [])
    except Exception as e:
        print("Error fetching WBES schedule:", e)
    return []

def fetch_rtg_schedule_raw(date_str: str, plant_id: str):
    """
    date_str is in YYYY-MM-DD format
    """
    db = MongoService()
    rtg_cfg = db.pipeline_config_collection.find_one({"config_type": "RTG"})
    if not rtg_cfg:
        return {}
    
    from services.token_service import TokenService
    try:
        token = TokenService.get_token(
            rtg_cfg["rtg_token_url"],
            rtg_cfg["rtg_username"],
            rtg_cfg["rtg_password"]
        )
    except Exception as e:
        print("Error generating RTG token:", e)
        return {}
    
    base_url = get_rtg_schedule_url()
    if not base_url.endswith("/"):
        base_url += "/"
    
    url = f"{base_url}{date_str}/{plant_id}/"
    headers = {
        "Authorization": f"Token {token}",
        "Content-Type": "application/json"
    }
    try:
        session = get_legacy_session_no_verify()
        res = session.get(url, headers=headers, timeout=30)
        if res.status_code == 200:
            return res.json()
    except Exception as e:
        print(f"Error fetching RTG data for {plant_id} on {date_str}:", e)
    return {}

def fetch_rtg_scada_raw(date_str: str, plant_id: str):
    """
    date_str is in YYYY-MM-DD format
    """
    db = MongoService()
    rtg_cfg = db.pipeline_config_collection.find_one({"config_type": "RTG"})
    if not rtg_cfg:
        return {}
    
    from services.token_service import TokenService
    try:
        token = TokenService.get_token(
            rtg_cfg["rtg_token_url"],
            rtg_cfg["rtg_username"],
            rtg_cfg["rtg_password"]
        )
    except Exception as e:
        print("Error generating RTG token for SCADA:", e)
        return {}
    
    base_url = get_rtg_scada_url()
    if not base_url.endswith("/"):
        base_url += "/"
    
    url = f"{base_url}{date_str}/{plant_id}/"
    headers = {
        "Authorization": f"Token {token}",
        "Content-Type": "application/json"
    }
    try:
        session = get_legacy_session_no_verify()
        res = session.get(url, headers=headers, timeout=30)
        if res.status_code == 200:
            return res.json()
    except Exception as e:
        print(f"Error fetching RTG SCADA for {plant_id} on {date_str}:", e)
    return {}

def get_aligned_schedule_dc(entities: list, start_time: datetime, end_time: datetime):
    # 1. Identify all unique dates in the range
    unique_dates = []
    curr = start_time.date()
    while curr <= end_time.date():
        unique_dates.append(curr)
        curr += timedelta(days=1)
    
    # 2. Pre-fetch WBES data for unique dates
    wbes_acronyms = list(set([e.get("wbes_name") for e in entities if e.get("schedule_source") == "WBES" or e.get("dc_source") == "WBES" or e.get("is_state")]))
    wbes_acronyms = [a for a in wbes_acronyms if a]
    
    wbes_cache = {}
    for d in unique_dates:
        dmy = d.strftime('%d-%m-%Y')
        if wbes_acronyms:
            group_data = fetch_wbes_schedule_raw(dmy, wbes_acronyms)
            for fsData in group_data:
                acronym = fsData.get("Acronym")
                totalNetSchdAmount = fsData.get('NetScheduleSummary', {}).get('TotalNetSchdAmount', [0]*96)
                
                NormativeList = [0] * 96
                DCList = [0] * 96
                for declaration_entry in fsData.get('DeclarationList', []):
                    decl_data = declaration_entry.get('DeclarationData', {}) or {}
                    for dc_key in ['ThermalDCJsonData', 'GasDCJsonData', 'NuclearDCJsonData', 'HydroDCJsonData']:
                        dc_data = decl_data.get(dc_key)
                        if dc_data and isinstance(dc_data, dict):
                            norm = dc_data.get('OnbarNormativeAmount')
                            dc_val = dc_data.get('SellerInpOnbarAmount')
                            if norm and isinstance(norm, list):
                                NormativeList = [a + float(b or 0) for a, b in zip(NormativeList, norm)]
                            if dc_val and isinstance(dc_val, list):
                                DCList = [a + float(b or 0) for a, b in zip(DCList, dc_val)]
                wbes_cache[(dmy, acronym)] = {
                    "schedule": totalNetSchdAmount,
                    "dc": DCList
                }
    
    # 3. Pre-fetch RTG data for unique dates
    rtg_cache = {}
    for e in entities:
        if e.get("schedule_source") == "RTG" or e.get("dc_source") == "RTG":
            pid = e.get("rtg_plant_id") or e.get("plant_id")
            if pid:
                for d in unique_dates:
                    iso = d.isoformat()
                    rtg_data = fetch_rtg_schedule_raw(iso, pid)
                    if rtg_data:
                        rtg_cache[(iso, pid)] = {
                            "schedule": rtg_data.get("schedule", [0]*96),
                            "dc": rtg_data.get("dc", [0]*96)
                        }
    
    # 4. Generate 1-minute time series for each entity
    dt_index = pd.date_range(start=start_time, end=end_time, freq='1min')
    aligned_data = {}
    
    for e in entities:
        pid = e.get("plant_id")
        sched_src = e.get("schedule_source", "RTG")
        dc_src = e.get("dc_source", "RTG")
        wbes_name = e.get("wbes_name")
        rtg_pid = e.get("rtg_plant_id") or e.get("plant_id")
        is_frequency = e.get("is_frequency", False)
        
        sched_series = []
        dc_series = []
        
        for t in dt_index:
            if is_frequency:
                sched_series.append(50.0)
                dc_series.append(50.0)
                continue
            
            dmy = t.strftime('%d-%m-%Y')
            iso = t.date().isoformat()
            minute_of_day = t.hour * 60 + t.minute
            
            # --- Get Schedule ---
            sched_val = 0.0
            if sched_src == "WBES" and wbes_name:
                cache_data = wbes_cache.get((dmy, wbes_name), {})
                sch_list = cache_data.get("schedule", [0]*96)
                idx = min(minute_of_day // 15, len(sch_list) - 1)
                sched_val = float(sch_list[idx] or 0)
            elif sched_src == "RTG" and rtg_pid:
                cache_data = rtg_cache.get((iso, rtg_pid), {})
                sch_list = cache_data.get("schedule", [0]*96)
                block_size = 1440 // len(sch_list) if len(sch_list) > 0 else 15
                idx = min(minute_of_day // block_size, len(sch_list) - 1)
                sched_val = float(sch_list[idx] or 0)
            elif sched_src == "Manual":
                sched_val = float(e.get("schedule", 0) or 0)
            
            # --- Get DC ---
            dc_val = 0.0
            if dc_src == "WBES" and wbes_name:
                cache_data = wbes_cache.get((dmy, wbes_name), {})
                dc_list = cache_data.get("dc", [0]*96)
                idx = min(minute_of_day // 15, len(dc_list) - 1)
                dc_val = float(dc_list[idx] or 0)
            elif dc_src == "RTG" and rtg_pid:
                cache_data = rtg_cache.get((iso, rtg_pid), {})
                dc_list = cache_data.get("dc", [0]*96)
                block_size = 1440 // len(dc_list) if len(dc_list) > 0 else 15
                idx = min(minute_of_day // block_size, len(dc_list) - 1)
                dc_val = float(dc_list[idx] or 0)
            elif dc_src == "Manual":
                dc_val = float(e.get("dc", 0) or 0)
            
            sched_series.append(sched_val)
            dc_series.append(dc_val)
            
        aligned_data[pid] = {
            "schedule": sched_series,
            "dc": dc_series
        }
    
    return dt_index, aligned_data

def parse_scada_file(contents: bytes):
    wb = openpyxl.load_workbook(io.BytesIO(contents), data_only=True)
    sheet_name = "Sheet1" if "Sheet1" in wb.sheetnames else wb.sheetnames[0]
    ws = wb[sheet_name]
    
    rows = list(ws.iter_rows(values_only=True))
    if len(rows) < 3:
        raise ValueError("SCADA file must have at least 3 rows (header, keys, and values)")
    
    # Dynamically find the row containing date-time header (DATE & TIME) in column 0
    key_row_idx = None
    for idx, row in enumerate(rows):
        if row and row[0] is not None:
            cell_val = str(row[0]).strip().upper()
            if cell_val in ["DATE & TIME", "DATE AND TIME", "DATE &TIME", "DATE/TIME", "DATETIME", "TIME", "DATE_TIME"]:
                key_row_idx = idx
                break
                
    if key_row_idx is None:
        # Fallback to default index if not found
        key_row_idx = 2 if len(rows) > 2 else 1
        
    headers_idx = max(0, key_row_idx - 1)
    
    headers = [str(h).strip() if h is not None else "" for h in rows[headers_idx]]
    keys = [str(k).strip() if k is not None else "" for k in rows[key_row_idx]]
    
    dt_col_idx = 0
    freq_col_idx = 1
    
    data_list = []
    for row in rows[key_row_idx + 1:]:
        if row[dt_col_idx] is None:
            continue
        data_list.append(row)
        
    df_data = pd.DataFrame(data_list)
    
    def parse_dt(val):
        if isinstance(val, datetime):
            return val
        val_str = str(val).strip()
        # Test common formats
        for fmt_str in [
            "%d-%m-%Y %H:%M:%S", "%Y-%m-%d %H:%M:%S", 
            "%d-%m-%Y %H:%M", "%Y-%m-%d %H:%M",
            "%d/%m/%Y %H:%M:%S", "%d/%m/%Y %H:%M",
            "%Y/%m/%d %H:%M:%S", "%Y/%m/%d %H:%M",
            "%d-%b-%Y %H:%M", "%d-%b-%Y %H:%M:%S"
        ]:
            try:
                return datetime.strptime(val_str, fmt_str)
            except ValueError:
                pass
        try:
            return pd.to_datetime(val_str)
        except Exception as e:
            raise ValueError(f"Unknown datetime string format, unable to parse: {val_str}")
        
    df_data[dt_col_idx] = df_data[dt_col_idx].apply(parse_dt)
    df_data = df_data.sort_values(by=dt_col_idx).reset_index(drop=True)
    
    # Identify freq column by key or header
    for idx, (h, k) in enumerate(zip(headers, keys)):
        if k == "04245232" or h.upper() == "FREQUENCY":
            freq_col_idx = idx
            break
            
    return df_data, headers, keys, dt_col_idx, freq_col_idx

def match_scada_columns(entities: list, headers: list, keys: list):
    matched_cols = {}
    for e in entities:
        pid = e.get("plant_id")
        scada_key = str(e.get("scada_key") or "").strip()
        scada_hdr = str(e.get("scada_header") or "").strip().upper()
        is_freq = e.get("is_frequency", False)
        
        if is_freq:
            continue
            
        matched_idx = None
        if scada_key:
            for idx, k in enumerate(keys):
                if k == scada_key:
                    matched_idx = idx
                    break
        if matched_idx is None and scada_hdr:
            for idx, h in enumerate(headers):
                if h.strip().upper() == scada_hdr:
                    matched_idx = idx
                    break
                    
        if matched_idx is not None:
            matched_cols[pid] = matched_idx
    return matched_cols

# ──────────────────────────────────────────────────────────────
# PLOT GENERATION
# ──────────────────────────────────────────────────────────────

def generate_plot_base64(row_data: dict, start_time: datetime, end_time: datetime):
    timestamps_str = row_data["series_timestamps"]
    timestamps = [datetime.strptime(ts, '%Y-%m-%d %H:%M:%S') for ts in timestamps_str]
    deviations = row_data["series_deviation"]
    frequencies = row_data["series_frequency"]
    is_state = row_data["is_state"]
    pname = row_data["plant_name"]
    
    times = np.array(timestamps)
    devs = np.array(deviations)
    freqs = np.array(frequencies)
    
    fig, ax1 = plt.subplots(figsize=(10, 4.5), dpi=100)
    
    dev_color = 'green' if is_state else 'red'
    freq_color = 'purple' if is_state else 'blue'
    
    ax1.plot(times, devs, color=dev_color, linewidth=1.5, label='Deviation (MW)')
    ax1.set_xlabel('Date-Time', fontweight='bold', fontsize=9)
    ax1.set_ylabel('Deviation (MW)', color=dev_color, fontweight='bold', fontsize=9)
    ax1.tick_params(axis='y', labelcolor=dev_color, labelsize=8)
    ax1.tick_params(axis='x', labelsize=8)
    
    max_abs_dev = max(1.0, float(np.max(np.abs(devs))))
    ax1.set_ylim(-max_abs_dev * 1.1, max_abs_dev * 1.1)
    
    ax2 = ax1.twinx()
    ax2.plot(times, freqs, color=freq_color, linewidth=1.0, linestyle='--', label='Frequency (Hz)')
    ax2.set_ylabel('Frequency (Hz)', color=freq_color, fontweight='bold', fontsize=9)
    ax2.tick_params(axis='y', labelcolor=freq_color, labelsize=8)
    
    ax2.set_ylim(49.4, 50.6)
    
    ax1.axhline(0, color='gray', linestyle='-', linewidth=0.8)
    ax2.axhline(50.0, color='gray', linestyle=':', linewidth=0.8)
    
    ax1.grid(True, which='both', linestyle=':', color='lightgray')
    
    ax1.xaxis.set_major_formatter(mdates.DateFormatter('%d-%m-%y %H:%M'))
    fig.autofmt_xdate()
    
    # Low frequency operation shading (< 49.9 Hz)
    freq_low = freqs < 49.9
    if is_state:
        # Over Drawal (Gold): Freq < 49.9 & Dev > 0
        gold_fill = freq_low & (devs > 0)
        # Helping Grid (Cyan): Freq < 49.9 & Dev < 0
        cyan_fill = freq_low & (devs < 0)
        
        ax1.fill_between(times, 0, devs, where=gold_fill, color='gold', alpha=0.3, label='Over Drawal (Gold)')
        ax1.fill_between(times, 0, devs, where=cyan_fill, color='cyan', alpha=0.3, label='Helping Grid (Cyan)')
    else:
        # Under Injection (Orange): Freq < 49.9 & Dev < 0
        orange_fill = freq_low & (devs < 0)
        # Helping Grid (Green): Freq < 49.9 & Dev > 0
        green_fill = freq_low & (devs > 0)
        
        ax1.fill_between(times, 0, devs, where=orange_fill, color='darkorange', alpha=0.3, label='Under Injection (Orange)')
        ax1.fill_between(times, 0, devs, where=green_fill, color='green', alpha=0.3, label='Helping Grid (Green)')
        
    period_str = f"{start_time.strftime('%d-%m-%y %H:%M')} to {end_time.strftime('%d-%m-%y %H:%M')}"
    plt.title(f"{pname.strip()}: Frequency (Hz) vs Deviation (MW)\n[Low Frequency Operation Period: {period_str}]", 
              fontweight='bold', fontsize=10, pad=10)
              
    if is_state:
        ann_text = (
            f"+Ve Dev : Over Drawal (Gold)\n"
            f"% Duration (Freq<49.9 & Dev>0): {row_data['over_drawal_pct']:.2f}%\n\n"
            f"-Ve Dev : Under Drawal (Cyan)\n"
            f"% Duration (Freq<49.9 & Dev<0): {row_data['under_drawal_pct']:.2f}%\n\n"
            f"Max OD = {row_data['max_od']:.2f} MW\n"
            f"Time: {row_data['max_od_time']}\n"
            f"Freq = {row_data['max_od_freq']:.2f} Hz"
        )
    else:
        ann_text = (
            f"+Ve Dev : Helping Grid (Green)\n"
            f"% Duration (Freq<49.9 & Dev>0): {row_data['helping_grid_pct']:.2f}%\n\n"
            f"-Ve Dev : Under Injection (Orange)\n"
            f"% Duration (Freq<49.9 & Dev<0): {row_data['under_inj_pct']:.2f}%"
        )
        
    props = dict(boxstyle='round', facecolor='wheat', alpha=0.8)
    ax1.text(0.02, 0.95, ann_text, transform=ax1.transAxes, fontsize=7,
             verticalalignment='top', bbox=props, family='monospace')
             
    buf = io.BytesIO()
    plt.savefig(buf, format='png', bbox_inches='tight', dpi=130)
    plt.close(fig)
    buf.seek(0)
    return base64.b64encode(buf.read()).decode('utf-8')

# ──────────────────────────────────────────────────────────────
# REPORT PROCESSING ENDPOINT
# ──────────────────────────────────────────────────────────────

@router.post("/process-report")
async def process_report(
    start_time: str = Form(...),
    end_time: str = Form(...),
    entities: str = Form(...),
    file: UploadFile = File(...)
):
    try:
        st = datetime.fromisoformat(start_time.replace("Z", ""))
        et = datetime.fromisoformat(end_time.replace("Z", ""))
        entity_list = json.loads(entities)
        
        contents = await file.read()
        df_data, headers, keys, dt_col, freq_col = parse_scada_file(contents)
        
        df_filtered = df_data[(df_data[dt_col] >= st) & (df_data[dt_col] <= et)].reset_index(drop=True)
        if df_filtered.empty:
            return {"success": False, "error": "No SCADA data found in the selected datetime range"}
            
        scada_dts = df_filtered[dt_col].tolist()
        scada_freqs = [float(v or 0) for v in df_filtered[freq_col].tolist()]
        
        matched_cols = match_scada_columns(entity_list, headers, keys)
        dt_index, aligned_schedules_dc = get_aligned_schedule_dc(entity_list, st, et)
        
        timestamp_to_idx = {t: idx for idx, t in enumerate(dt_index)}
        processed_rows = []
        
        # Check RTG availability
        db = MongoService()
        unique_dates = []
        curr = st.date()
        while curr <= et.date():
            unique_dates.append(curr.isoformat())
            curr += timedelta(days=1)
            
        rtg_available = True
        for d in unique_dates:
            doc = db.rtg_dashboard_collection.find_one(
                {"snapshot_date": d},
                sort=[("snapshot_time", -1)]
            )
            if doc and doc.get("record_count", 0) > 0:
                records = doc.get("data", [])
                has_actuals = any(float(r.get("actual_gen") or r.get("actual_gen_derived") or 0) > 0 for r in records)
                if not has_actuals:
                    rtg_available = False
                    break
            else:
                rtg_available = False
                break

        # Pre-fetch RTG SCADA data if available
        rtg_scada_cache = {}
        if rtg_available:
            for e in entity_list:
                is_freq = e.get("is_frequency", False)
                if is_freq:
                    continue
                pid = e.get("rtg_plant_id") or e.get("plant_id")
                if pid:
                    for d in unique_dates:
                        scada_data = fetch_rtg_scada_raw(d, pid)
                        val_list = []
                        if isinstance(scada_data, dict):
                            for k in ["actual", "data", "scada", "values", "schedule"]:
                                if k in scada_data and isinstance(scada_data[k], list):
                                    val_list = scada_data[k]
                                    break
                        elif isinstance(scada_data, list):
                            val_list = scada_data
                            
                        parsed_vals = []
                        for item in val_list:
                            if isinstance(item, dict):
                                val = item.get("actual") or item.get("value") or item.get("actual_gen") or item.get("actual_gen_derived") or 0
                                parsed_vals.append(float(val or 0))
                            else:
                                parsed_vals.append(float(item or 0))
                                
                        if parsed_vals:
                            rtg_scada_cache[(d, pid)] = parsed_vals

        for e in entity_list:
            pid = e.get("plant_id")
            pname = e.get("plant_name") or e.get("STAGE_NAME") or ""
            is_state = e.get("is_state", False)
            is_freq = e.get("is_frequency", False)
            
            if is_freq:
                continue
                
            sched_src = e.get("sched_src") or e.get("schedule_source") or "RTG"
            dc_src = e.get("dc_src") or e.get("dc_source") or "RTG"
            wbes_name = e.get("wbes_name", "")
            rtg_pid = e.get("rtg_plant_id") or e.get("plant_id", "")
            
            sch_series = aligned_schedules_dc.get(pid, {}).get("schedule", [0]*len(dt_index))
            dc_series = aligned_schedules_dc.get(pid, {}).get("dc", [0]*len(dt_index))
            
            if rtg_available:
                actual_series = []
                for t in scada_dts:
                    d = t.date().isoformat()
                    minute_of_day = t.hour * 60 + t.minute
                    scada_list = rtg_scada_cache.get((d, rtg_pid)) or rtg_scada_cache.get((d, pid))
                    actual_val = 0.0
                    if scada_list:
                        block_size = 1440 // len(scada_list) if len(scada_list) > 0 else 5
                        idx = min(minute_of_day // block_size, len(scada_list) - 1)
                        actual_val = float(scada_list[idx] or 0)
                    actual_series.append(actual_val)
            else:
                c_idx = matched_cols.get(pid)
                if c_idx is not None:
                    actual_series = [float(v or 0) for v in df_filtered[c_idx].tolist()]
                else:
                    actual_series = [0.0] * len(scada_dts)
                
            entity_sch = []
            entity_dc = []
            entity_act = []
            entity_dev = []
            
            for idx, t in enumerate(scada_dts):
                cache_idx = timestamp_to_idx.get(t)
                if cache_idx is not None:
                    sch_val = sch_series[cache_idx]
                    dc_val = dc_series[cache_idx]
                else:
                    cache_idx = min(idx, len(sch_series) - 1)
                    sch_val = sch_series[cache_idx]
                    dc_val = dc_series[cache_idx]
                    
                act_val = actual_series[idx]
                entity_sch.append(sch_val)
                entity_dc.append(dc_val)
                entity_act.append(act_val)
                entity_dev.append(act_val - sch_val)
                
            total_count = len(scada_freqs)
            under_inj_count = 0
            helping_grid_count = 0
            over_drawal_count = 0
            under_drawal_count = 0
            
            max_od_val = -999999.0
            max_od_time = None
            max_od_freq = 50.0
            
            for idx, freq in enumerate(scada_freqs):
                dev_val = entity_dev[idx]
                if freq < 49.9:
                    if is_state:
                        if dev_val > 0:
                            over_drawal_count += 1
                        else:
                            under_drawal_count += 1
                    else:
                        if dev_val < 0:
                            under_inj_count += 1
                        else:
                            helping_grid_count += 1
                if is_state:
                    if dev_val > max_od_val:
                        max_od_val = dev_val
                        max_od_time = scada_dts[idx]
                        max_od_freq = freq
                        
            under_inj_pct = (under_inj_count / total_count * 100) if total_count > 0 else 0.0
            helping_grid_pct = (helping_grid_count / total_count * 100) if total_count > 0 else 0.0
            over_drawal_pct = (over_drawal_count / total_count * 100) if total_count > 0 else 0.0
            under_drawal_pct = (under_drawal_count / total_count * 100) if total_count > 0 else 0.0
            
            avg_sched = sum(entity_sch) / len(entity_sch) if len(entity_sch) > 0 else 0.0
            avg_dc = sum(entity_dc) / len(entity_dc) if len(entity_dc) > 0 else 0.0
            avg_act = sum(entity_act) / len(entity_act) if len(entity_act) > 0 else 0.0
            avg_dev = avg_act - avg_sched
            
            row_data = {
                "plant_id": pid,
                "plant_name": pname,
                "is_state": is_state,
                "capacity": e.get("stage_installed_capacity") or e.get("capacity") or 0.0,
                "schedule": avg_sched,
                "dc": avg_dc,
                "actual": avg_act,
                "deviation": avg_dev,
                "pct_dc": (avg_act / avg_dc * 100) if avg_dc > 0 else 0.0,
                "sched_src": sched_src,
                "dc_src": dc_src,
                "wbes_name": wbes_name,
                "rtg_plant_id": rtg_pid,
                "scada_key": e.get("scada_key"),
                "scada_header": e.get("scada_header"),
                "reason": e.get("reason", ""),
                
                "series_timestamps": [t.strftime('%Y-%m-%d %H:%M:%S') for t in scada_dts],
                "series_schedule": entity_sch,
                "series_dc": entity_dc,
                "series_actual": entity_act,
                "series_deviation": entity_dev,
                "series_frequency": scada_freqs,
            }
            
            if is_state:
                row_data.update({
                    "max_od": max_od_val if max_od_time is not None else 0.0,
                    "max_od_time": max_od_time.strftime('%d-%m-%y %H:%M') if max_od_time is not None else "",
                    "max_od_freq": max_od_freq if max_od_time is not None else 50.0,
                    "over_drawal_pct": over_drawal_pct,
                    "under_drawal_pct": under_drawal_pct
                })
            else:
                row_data.update({
                    "under_inj_pct": under_inj_pct,
                    "helping_grid_pct": helping_grid_pct
                })
            processed_rows.append(row_data)
            
        # Reshape rows to the frontend-expected schema: series nested, statistics nested
        for row in processed_rows:
            is_state = row.get("is_state", False)
            # Build nested series block
            row["series"] = {
                "timestamps": row.pop("series_timestamps", []),
                "frequency":  row.pop("series_frequency", []),
                "deviation":  row.pop("series_deviation", []),
                "schedule":   row.pop("series_schedule", []),
                "actual":     row.pop("series_actual", []),
                "dc":         row.pop("series_dc", []),
            }
            # Build nested statistics block
            if is_state:
                row["statistics"] = {
                    "max_od":               row.pop("max_od", 0.0),
                    "max_od_time":          row.pop("max_od_time", ""),
                    "freq_at_max_od":       row.pop("max_od_freq", 50.0),
                    "od_duration_pct":      row.pop("over_drawal_pct", 0.0),
                    "helping_duration_pct": row.pop("under_drawal_pct", 0.0),
                    "under_inj_pct":        None,
                    "helping_grid_pct":     None,
                }
            else:
                row["statistics"] = {
                    "max_od":               None,
                    "max_od_time":          None,
                    "freq_at_max_od":       None,
                    "od_duration_pct":      None,
                    "helping_duration_pct": None,
                    "under_inj_pct":        row.pop("under_inj_pct", 0.0),
                    "helping_grid_pct":     row.pop("helping_grid_pct", 0.0),
                }
            # Add entity type
            row["type"] = "state" if is_state else "generator"
            row["state"] = row.get("state") or (e.get("state_name") or "")
            row["fuel"]  = row.get("fuel")  or (e.get("fuel_type") or "")
            row["owner"] = row.get("owner") or (e.get("owner_name") or "")

        return {
            "success": True,
            "rows": processed_rows,
            "start_time": start_time,
            "end_time": end_time
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"success": False, "error": str(e)}


# ──────────────────────────────────────────────────────────────
# EXCEL / PDF / WORD DOWNLOADS
# ──────────────────────────────────────────────────────────────

@router.post("/download-excel")
async def download_excel(payload: dict):
    rows = payload.get("rows", [])
    wb = openpyxl.Workbook()

    HDR_FILL   = PatternFill("solid", fgColor="0F172A")
    HDR_FONT   = Font(color="FFFFFF", bold=True, size=10)
    TITLE_FONT = Font(bold=True, size=13, color="0F172A")
    center = Alignment(horizontal="center", vertical="center")
    thin = Border(
        left=Side(style="thin", color="CCCCCC"), right=Side(style="thin", color="CCCCCC"),
        top=Side(style="thin", color="CCCCCC"),  bottom=Side(style="thin", color="CCCCCC"),
    )

    # ── Sheet 1: Executive Summary ──────────────────────────────
    ws_exec = wb.active
    ws_exec.title = "Executive Summary"
    ws_exec.cell(row=1, column=1, value="Frequency Deviation Compliance Report").font = TITLE_FONT
    ws_exec.cell(row=2, column=1, value=payload.get("executive_summary", ""))
    ws_exec.cell(row=4, column=1, value=f"Period: {payload.get('start_time','')} to {payload.get('end_time','')}").font = Font(italic=True)

    # ── Sheet 2: State Summary ──────────────────────────────────
    ws_state = wb.create_sheet(title="State Summary")
    ws_state.cell(row=1, column=1, value="State Drawal Compliance Summary").font = TITLE_FONT
    ws_state.row_dimensions[1].height = 25
    ws_state.row_dimensions[3].height = 20
    state_headers = [
        "State Name", "Schedule Source", "DC (MW)", "Schedule (MW)", "Actual (MW)",
        "Deviation (MW)", "% DC", "Max OD (MW)", "Time of Max OD",
        "Freq at Max OD (Hz)", "OD Duration %", "Helping Grid %", "Reason"
    ]
    for ci, h in enumerate(state_headers, 1):
        c = ws_state.cell(row=3, column=ci, value=h)
        c.fill = HDR_FILL; c.font = HDR_FONT; c.alignment = center; c.border = thin
    state_row_idx = 4
    for r in rows:
        if r.get("is_state"):
            stats = r.get("statistics", {})
            ws_state.cell(state_row_idx, 1,  r.get("plant_name", "")).border = thin
            ws_state.cell(state_row_idx, 2,  r.get("sched_src", "")).border = thin
            ws_state.cell(state_row_idx, 3,  round(r.get("dc", 0) or 0, 2)).border = thin
            ws_state.cell(state_row_idx, 4,  round(r.get("schedule", 0) or 0, 2)).border = thin
            ws_state.cell(state_row_idx, 5,  round(r.get("actual", 0) or 0, 2)).border = thin
            ws_state.cell(state_row_idx, 6,  round(r.get("deviation", 0) or 0, 2)).border = thin
            ws_state.cell(state_row_idx, 7,  round(r.get("pct_dc", 0) or 0, 2)).border = thin
            ws_state.cell(state_row_idx, 8,  round(stats.get("max_od", 0) or 0, 2)).border = thin
            ws_state.cell(state_row_idx, 9,  stats.get("max_od_time", "")).border = thin
            ws_state.cell(state_row_idx, 10, round(stats.get("freq_at_max_od", 50) or 50, 3)).border = thin
            ws_state.cell(state_row_idx, 11, round(stats.get("od_duration_pct", 0) or 0, 2)).border = thin
            ws_state.cell(state_row_idx, 12, round(stats.get("helping_duration_pct", 0) or 0, 2)).border = thin
            ws_state.cell(state_row_idx, 13, r.get("reason", "")).border = thin
            state_row_idx += 1

    # ── Sheet 3: Generator Summary ──────────────────────────────
    ws_gen = wb.create_sheet(title="Generator Summary")
    ws_gen.cell(row=1, column=1, value="Generator Deviation Compliance Summary").font = TITLE_FONT
    ws_gen.row_dimensions[1].height = 25
    ws_gen.row_dimensions[3].height = 20
    gen_headers = [
        "Plant Name", "State", "Fuel", "Schedule Source", "DC (MW)", "Schedule (MW)",
        "Actual (MW)", "Deviation (MW)", "% DC",
        "Under Injection % (Freq<49.9)", "Helping Grid % (Freq<49.9)", "Reason"
    ]
    for ci, h in enumerate(gen_headers, 1):
        c = ws_gen.cell(row=3, column=ci, value=h)
        c.fill = HDR_FILL; c.font = HDR_FONT; c.alignment = center; c.border = thin
    gen_row_idx = 4
    for r in rows:
        if not r.get("is_state"):
            stats = r.get("statistics", {})
            ws_gen.cell(gen_row_idx, 1,  r.get("plant_name", "")).border = thin
            ws_gen.cell(gen_row_idx, 2,  r.get("state", "")).border = thin
            ws_gen.cell(gen_row_idx, 3,  r.get("fuel", "")).border = thin
            ws_gen.cell(gen_row_idx, 4,  r.get("sched_src", "")).border = thin
            ws_gen.cell(gen_row_idx, 5,  round(r.get("dc", 0) or 0, 2)).border = thin
            ws_gen.cell(gen_row_idx, 6,  round(r.get("schedule", 0) or 0, 2)).border = thin
            ws_gen.cell(gen_row_idx, 7,  round(r.get("actual", 0) or 0, 2)).border = thin
            ws_gen.cell(gen_row_idx, 8,  round(r.get("deviation", 0) or 0, 2)).border = thin
            ws_gen.cell(gen_row_idx, 9,  round(r.get("pct_dc", 0) or 0, 2)).border = thin
            ws_gen.cell(gen_row_idx, 10, round(stats.get("under_inj_pct", 0) or 0, 2)).border = thin
            ws_gen.cell(gen_row_idx, 11, round(stats.get("helping_grid_pct", 0) or 0, 2)).border = thin
            ws_gen.cell(gen_row_idx, 12, r.get("reason", "")).border = thin
            gen_row_idx += 1

    for ws in [ws_exec, ws_state, ws_gen]:
        for col in ws.columns:
            max_len = max((len(str(cell.value or "")) for cell in col), default=10)
            ws.column_dimensions[get_column_letter(col[0].column)].width = min(max_len + 4, 40)

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=deviation_compliance_report.xlsx"}
    )



@router.post("/download-pdf")
async def download_pdf(payload: dict):
    rows = payload.get("rows", [])
    
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, rightMargin=25, leftMargin=25, topMargin=25, bottomMargin=25)
    
    styles = getSampleStyleSheet()
    
    title_style = ParagraphStyle(
        'ReportTitle',
        parent=styles['Heading1'],
        fontSize=18,
        textColor=colors.HexColor('#022726'),
        spaceAfter=15,
        alignment=1
    )
    section_style = ParagraphStyle(
        'SectionHeading',
        parent=styles['Heading2'],
        fontSize=12,
        textColor=colors.HexColor('#03624C'),
        spaceBefore=10,
        spaceAfter=10
    )
    text_style = ParagraphStyle(
        'NormalText',
        parent=styles['Normal'],
        fontSize=9,
        spaceAfter=8
    )
    
    story = []
    
    story.append(Paragraph("POWER SYSTEM DEVIATION ANALYSIS REPORT", title_style))
    story.append(Paragraph(f"Generated on {datetime.now().strftime('%d-%m-%Y %H:%M')}", text_style))
    story.append(Spacer(1, 10))
    
    for idx, r in enumerate(rows):
        story.append(Paragraph(f"ENTITY: {r.get('plant_name')}", section_style))
        
        plot_b64 = r.get("plot_image")
        if plot_b64:
            plot_data = base64.b64decode(plot_b64)
            plot_buf = io.BytesIO(plot_data)
            img = Image(plot_buf, width=500, height=225)
            story.append(img)
            
        if r.get("is_state"):
            data = [
                ["Stat Name", "Value"],
                ["Max Over Drawal", f"{r.get('max_od'):.2f} MW"],
                ["Time of Max OD", r.get("max_od_time")],
                ["Frequency at Max OD", f"{r.get('max_od_freq'):.2f} Hz"],
                ["% Duration Over Drawal (Freq<49.9 & Dev>0)", f"{r.get('over_drawal_pct'):.2f}%"],
                ["% Duration Helping Grid (Freq<49.9 & Dev<0)", f"{r.get('under_drawal_pct'):.2f}%"]
            ]
        else:
            data = [
                ["Stat Name", "Value"],
                ["% Duration Helping Grid (Freq<49.9 & Dev>0)", f"{r.get('helping_grid_pct'):.2f}%"],
                ["% Duration Under Injection (Freq<49.9 & Dev<0)", f"{r.get('under_inj_pct'):.2f}%"]
            ]
            
        t = Table(data, colWidths=[280, 220])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#0F172A')),
            ('TEXTCOLOR', (0,0), (-1,0), colors.whitesmoke),
            ('ALIGN', (0,0), (-1,-1), 'LEFT'),
            ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
            ('FONTSIZE', (0,0), (-1,0), 8),
            ('BOTTOMPADDING', (0,0), (-1,0), 4),
            ('BACKGROUND', (0,1), (-1,-1), colors.HexColor('#F8FAFC')),
            ('GRID', (0,0), (-1,-1), 1, colors.HexColor('#CBD5E1')),
            ('FONTSIZE', (0,1), (-1,-1), 8),
        ]))
        story.append(Spacer(1, 8))
        story.append(t)
        
        if idx < len(rows) - 1:
            story.append(PageBreak())
            
    doc.build(story)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=deviation_compliance_report.pdf"}
    )

@router.post("/download-docx")
async def download_docx(payload: dict):
    intro_desc = payload.get("intro_desc", "")
    gen_desc = payload.get("gen_desc", "")
    state_desc = payload.get("state_desc", "")
    rows = payload.get("rows", [])
    
    doc = Document()
    
    title = doc.add_heading("Power System Deviation Analysis Report", level=0)
    title.style.font.color.rgb = docx.shared.RGBColor(2, 39, 38)
    
    doc.add_paragraph(f"Report Date Range: {payload.get('start_time', '')} to {payload.get('end_time', '')}")
    doc.add_paragraph(f"Generated at: {datetime.now().strftime('%d-%m-%Y %H:%M')}")
    
    if intro_desc:
        doc.add_heading("1. Executive Summary & General Notes", level=1)
        doc.add_paragraph(intro_desc)
        
    # Generator Section
    doc.add_heading("2. Generator Scheduling Compliance Details", level=1)
    if gen_desc:
        doc.add_paragraph(gen_desc)
        
    gen_rows = [r for r in rows if not r.get("is_state")]
    if gen_rows:
        table = doc.add_table(rows=1, cols=3)
        table.style = 'Light Shading Accent 1'
        hdr_cells = table.rows[0].cells
        hdr_cells[0].text = 'Generator Name'
        hdr_cells[1].text = '% Duration Under Inj (Freq<49.9 & Dev<0)'
        hdr_cells[2].text = '% Duration Helping Grid (Freq<49.9 & Dev>0)'
        
        for r in gen_rows:
            row_cells = table.add_row().cells
            row_cells[0].text = str(r.get("plant_name"))
            row_cells[1].text = f"{r.get('under_inj_pct'):.2f}%"
            row_cells[2].text = f"{r.get('helping_grid_pct'):.2f}%"
            
        doc.add_paragraph() # spacing
        for r in gen_rows:
            doc.add_heading(f"Generator: {r.get('plant_name')}", level=2)
            
            plot_b64 = r.get("plot_image")
            if plot_b64:
                plot_data = base64.b64decode(plot_b64)
                plot_buf = io.BytesIO(plot_data)
                doc.add_picture(plot_buf, width=docx.shared.Inches(5.8))
                
            doc.add_paragraph(f"Reason/Comments: {r.get('reason', 'None')}")
            
    # State Section
    doc.add_heading("3. State Drawal Compliance Details", level=1)
    if state_desc:
        doc.add_paragraph(state_desc)
        
    state_rows = [r for r in rows if r.get("is_state")]
    if state_rows:
        table = doc.add_table(rows=1, cols=6)
        table.style = 'Light Shading Accent 1'
        hdr_cells = table.rows[0].cells
        hdr_cells[0].text = 'State Name'
        hdr_cells[1].text = 'Max OD (MW)'
        hdr_cells[2].text = 'Time of Max OD'
        hdr_cells[3].text = 'Freq at Max OD'
        hdr_cells[4].text = '% Duration Over Drawal'
        hdr_cells[5].text = '% Duration Helping Grid'
        
        for r in state_rows:
            row_cells = table.add_row().cells
            row_cells[0].text = str(r.get("plant_name"))
            row_cells[1].text = f"{r.get('max_od'):.2f} MW"
            row_cells[2].text = str(r.get("max_od_time"))
            row_cells[3].text = f"{r.get('max_od_freq'):.2f} Hz"
            row_cells[4].text = f"{r.get('over_drawal_pct'):.2f}%"
            row_cells[5].text = f"{r.get('under_drawal_pct'):.2f}%"
            
        doc.add_paragraph() # spacing
        for r in state_rows:
            doc.add_heading(f"State Drawal: {r.get('plant_name')}", level=2)
            
            plot_b64 = r.get("plot_image")
            if plot_b64:
                plot_data = base64.b64decode(plot_b64)
                plot_buf = io.BytesIO(plot_data)
                doc.add_picture(plot_buf, width=docx.shared.Inches(5.8))
                
            doc.add_paragraph(f"Reason/Comments: {r.get('reason', 'None')}")
            
    buf = io.BytesIO()
    doc.save(buf)
    buf.seek(0)
    
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": "attachment; filename=deviation_compliance_report.docx"}
    )

# ──────────────────────────────────────────────────────────────
# BACKWARD COMPATIBILITY ENDPOINTS (KEEP EXISTING)
# ──────────────────────────────────────────────────────────────

@router.get("/report-data")
async def get_report_data(date: str = Query(..., description="YYYY-MM-DD")):
    db = MongoService()
    mapping = list(db.map_collection.find({}, {"_id": 0}))
    rtg_snap = db.rtg_dashboard_collection.find_one({}, sort=[("snapshot_time", -1)])
    rtg_by_id = {}
    if rtg_snap and "data" in rtg_snap:
        for p in rtg_snap["data"]:
            pid = p.get("plant_id", "")
            if pid:
                rtg_by_id[pid] = p

    psp_doc = db.psp_collection.find_one({"date": date}, {"_id": 0})
    wbes_schedule_by_acronym = {}
    wbes_dc_by_acronym = {}
    state_load_details = {}
    if psp_doc:
        net_schd = psp_doc.get("Net_schd_list", [])
        for item in net_schd:
            name = item.get("EnergyScheduleTypeName") or item.get("EnergyScheduleSubTypeName") or ""
            amounts = item.get("NetSchdAmount", [])
            total = sum(float(v or 0) for v in amounts)
            if name:
                wbes_schedule_by_acronym[name] = total

        stoa = psp_doc.get("pspSTOADetails1", [])
        for item in stoa:
            acronym = item.get("UNIT_NAME") or item.get("UTILITY_NAME") or ""
            dc_val = float(item.get("DC", 0) or 0)
            if acronym:
                wbes_dc_by_acronym[acronym.upper()] = dc_val

        load_list = psp_doc.get("pspstateloaddetailsER", [])
        for item in load_list:
            st_name = (item.get("STATE_NAME") or "").upper()
            if st_name:
                state_load_details[st_name] = {
                    "schedule": float(item.get("DRAWAL_SCHDULE", 0) or 0),
                    "dc": float(item.get("AVAILABILITY", 0) or 0)
                }
        if state_load_details:
            er_sched = sum(v["schedule"] for v in state_load_details.values())
            er_dc = sum(v["dc"] for v in state_load_details.values())
            state_load_details["ER"] = {"schedule": er_sched, "dc": er_dc}

    rows = []
    for m in mapping:
        plant_name     = m.get("plant_name") or m.get("STAGE_NAME") or ""
        state          = m.get("state_name", "")
        fuel           = m.get("fuel_type", "")
        owner          = m.get("owner_name", "")
        capacity       = float(m.get("stage_installed_capacity") or m.get("installed_capacity") or 0)
        sched_src      = m.get("schedule_source", "RTG")
        dc_src         = m.get("dc_source", "RTG")
        wbes_acronym   = (m.get("wbes_acronym") or "").upper()
        rtg_pid        = m.get("rtg_plant_id") or m.get("plant_id") or ""
        plant_id       = m.get("plant_id", "")
        stage_id       = m.get("STAGE_ID", "")
        scada_key      = m.get("scada_key", "")
        scada_header   = m.get("scada_header", "")
        is_state_row   = m.get("is_state", False)

        schedule = 0.0
        dc       = 0.0

        if is_state_row:
            if plant_id == "SYSTEM_FREQUENCY":
                schedule = 50.0
                dc       = 50.0
            else:
                if sched_src != "Manual":
                    st_lookup_key = plant_name.upper()
                    if "WEST BENGAL" in st_lookup_key:
                        st_lookup_key = "WEST BENGAL"
                    elif "EASTERN REGION" in st_lookup_key or "ER" in st_lookup_key:
                        st_lookup_key = "ER"
                    details = state_load_details.get(st_lookup_key, {"schedule": 0.0, "dc": 0.0})
                    schedule = details["schedule"]
                    dc = details["dc"]
        else:
            if sched_src == "RTG" or dc_src == "RTG":
                rtg = rtg_by_id.get(rtg_pid) or rtg_by_id.get(plant_id) or {}
                if sched_src == "RTG":
                    schedule = float(rtg.get("schedule", 0) or 0)
                if dc_src == "RTG":
                    dc = float(rtg.get("dc", 0) or 0)
            if sched_src == "WBES" and wbes_acronym:
                schedule = wbes_schedule_by_acronym.get(wbes_acronym, schedule)
            if dc_src == "WBES" and wbes_acronym:
                dc = wbes_dc_by_acronym.get(wbes_acronym, dc)

        rows.append({
            "plant_id":     plant_id,
            "stage_id":     stage_id,
            "plant_name":   plant_name,
            "state":        state,
            "fuel":         fuel,
            "owner":        owner,
            "capacity":     capacity,
            "schedule":     schedule,
            "dc":           dc,
            "actual":       None,
            "deviation":    None,
            "pct_dc":       None,
            "reason":       "",
            "scada_key":    scada_key,
            "scada_header": scada_header,
            "sched_src":    sched_src,
            "dc_src":       dc_src,
            "is_state":     is_state_row,
            "is_frequency": m.get("is_frequency", False)
        })

    return {
        "success":  True,
        "date":     date,
        "rows":     rows,
        "wbes_loaded": psp_doc is not None,
        "rtg_loaded":  len(rtg_by_id) > 0,
    }

@router.post("/upload-scada")
async def upload_scada(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        wb = openpyxl.load_workbook(io.BytesIO(contents), read_only=True, data_only=True)
        ws = wb.active

        rows = list(ws.iter_rows(values_only=True))
        if len(rows) < 2:
            return {"success": False, "error": "File has no data rows"}

        headers = [str(h).strip() if h is not None else "" for h in rows[0]]

        col_data = {h: [] for h in headers if h}
        for row in rows[1:]:
            for idx, h in enumerate(headers):
                if h and idx < len(row):
                    v = row[idx]
                    if v is not None:
                        try:
                            col_data[h].append(float(v))
                        except (ValueError, TypeError):
                            pass

        result = {}
        for h, vals in col_data.items():
            if vals:
                result[h] = {
                    "latest": vals[-1],
                    "average": round(sum(vals) / len(vals), 2),
                    "total": round(sum(vals), 2),
                    "count": len(vals),
                    "all": vals
                }

        raw_rows = []
        for row in rows[1:]:
            raw_rows.append({
                headers[i]: row[i]
                for i in range(len(headers))
                if headers[i]
            })

        return {
            "success":  True,
            "headers":  [h for h in headers if h],
            "columns":  result,
            "raw_rows": raw_rows[:96],
        }

    except Exception as e:
        return {"success": False, "error": str(e)}

@router.post("/export-excel")
async def export_excel(payload: dict):
    date  = payload.get("date", "")
    rows  = payload.get("rows", [])
    title = f"Frequency Report — {date}"

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Frequency Report"

    HDR_FILL = PatternFill("solid", fgColor="022726")
    HDR_FONT = Font(color="FFFFFF", bold=True, size=10)
    ALT_FILL = PatternFill("solid", fgColor="F0FDF4")
    TITLE_FONT = Font(bold=True, size=13, color="022726")
    center = Alignment(horizontal="center", vertical="center")
    thin = Border(
        left=Side(style="thin", color="CCCCCC"),
        right=Side(style="thin", color="CCCCCC"),
        top=Side(style="thin", color="CCCCCC"),
        bottom=Side(style="thin", color="CCCCCC"),
    )

    ws.merge_cells("A1:K1")
    ws["A1"] = title
    ws["A1"].font = TITLE_FONT
    ws["A1"].alignment = center
    ws.row_dimensions[1].height = 30

    curr_row = 3

    freq_row = next((r for r in rows if r.get("is_frequency")), None)
    if freq_row:
        ws.cell(row=curr_row, column=1, value="SYSTEM FREQUENCY").font = Font(bold=True, size=11, color="022726")
        ws.cell(row=curr_row, column=2, value="Target: 50.00 Hz")
        actual_val = freq_row.get("actual")
        if actual_val is not None:
            ws.cell(row=curr_row, column=3, value=f"Actual: {actual_val:.2f} Hz")
            dev_val = actual_val - 50.0
            ws.cell(row=curr_row, column=4, value=f"Deviation: {dev_val:+.2f} Hz").font = Font(
                bold=True, color="FF0000" if abs(dev_val) >= 0.05 else "166534"
            )
        else:
            ws.cell(row=curr_row, column=3, value="Actual: —")
            ws.cell(row=curr_row, column=4, value="Deviation: —")
        curr_row += 2

    states = [r for r in rows if r.get("is_state") and not r.get("is_frequency")]
    if states:
        ws.cell(row=curr_row, column=1, value="STATE COMPLIANCE DETAILS").font = Font(bold=True, size=11, color="022726")
        curr_row += 1
        
        STATE_HEADERS = [
            "State/Region Name", "Sch.Source", "DC Source", "DC (MU)", "Sched (MU)", "Actual (MU)", "Deviation (MU)", "% DC", "Reason"
        ]
        for ci, h in enumerate(STATE_HEADERS, start=1):
            cell = ws.cell(row=curr_row, column=ci, value=h)
            cell.fill = HDR_FILL
            cell.font = HDR_FONT
            cell.alignment = center
            cell.border = thin
        ws.row_dimensions[curr_row].height = 24
        curr_row += 1
        
        for ri, r in enumerate(states):
            actual = r.get("actual")
            schedule = r.get("schedule") or 0.0
            dc = r.get("dc") or 0.0
            deviation = (actual - schedule) if actual is not None else None
            pct_dc = (actual / dc * 100) if (actual is not None and dc) else None
            
            vals = [
                r.get("plant_name", ""),
                r.get("sched_src", ""),
                r.get("dc_src", ""),
                round(dc, 2),
                round(schedule, 2),
                round(actual, 2) if actual is not None else "",
                round(deviation, 2) if deviation is not None else "",
                f"{pct_dc:.1f}%" if pct_dc is not None else "",
                r.get("reason", "")
            ]
            
            fill = ALT_FILL if ri % 2 == 0 else PatternFill()
            for ci, val in enumerate(vals, start=1):
                cell = ws.cell(row=curr_row, column=ci, value=val)
                cell.alignment = Alignment(vertical="center", horizontal="right" if ci in [4,5,6,7,8] else ("center" if ci in [2,3] else "left"))
                cell.border = thin
                if fill.fgColor.rgb != "00000000":
                    cell.fill = fill
                if ci == 7 and isinstance(val, float):
                    cell.font = Font(color="FF0000" if val < 0 else "166534", bold=True)
            curr_row += 1
        curr_row += 2

    plants = [r for r in rows if not r.get("is_state")]
    if plants:
        ws.cell(row=curr_row, column=1, value="PLANT COMPLIANCE DETAILS").font = Font(bold=True, size=11, color="022726")
        curr_row += 1
        
        PLANT_HEADERS = [
            "Plant Name", "State", "Fuel", "Owner", "Capacity (MW)", "DC (MW)", "Sched (MW)", "Actual (MW)", "Deviation (MW)", "% DC", "Reason"
        ]
        for ci, h in enumerate(PLANT_HEADERS, start=1):
            cell = ws.cell(row=curr_row, column=ci, value=h)
            cell.fill = HDR_FILL
            cell.font = HDR_FONT
            cell.alignment = center
            cell.border = thin
        ws.row_dimensions[curr_row].height = 24
        curr_row += 1
        
        total_capacity = total_dc = total_sched = total_actual = total_dev = 0.0
        
        for ri, r in enumerate(plants):
            actual = r.get("actual")
            schedule = r.get("schedule") or 0.0
            dc = r.get("dc") or 0.0
            deviation = (actual - schedule) if actual is not None else None
            pct_dc = (actual / dc * 100) if (actual is not None and dc) else None
            
            vals = [
                r.get("plant_name", ""),
                r.get("state", ""),
                r.get("fuel", ""),
                r.get("owner", ""),
                r.get("capacity") or 0,
                round(dc, 2),
                round(schedule, 2),
                round(actual, 2) if actual is not None else "",
                round(deviation, 2) if deviation is not None else "",
                f"{pct_dc:.1f}%" if pct_dc is not None else "",
                r.get("reason", "")
            ]
            
            fill = ALT_FILL if ri % 2 == 0 else PatternFill()
            for ci, val in enumerate(vals, start=1):
                cell = ws.cell(row=curr_row, column=ci, value=val)
                cell.alignment = Alignment(vertical="center", horizontal="right" if ci in [5,6,7,8,9,10] else "left")
                cell.border = thin
                if fill.fgColor.rgb != "00000000":
                    cell.fill = fill
                if ci == 9 and isinstance(val, float):
                    cell.font = Font(color="FF0000" if val < 0 else "166534", bold=True)
            
            total_capacity += r.get("capacity") or 0
            total_dc += dc
            total_sched += schedule
            if actual is not None:
                total_actual += actual
                if deviation is not None:
                    total_dev += deviation
            curr_row += 1
            
        ws.cell(row=curr_row, column=1, value="TOTAL").font = Font(bold=True)
        for ci, val in enumerate([
            "", "", "", total_capacity, total_dc,
            total_sched, total_actual, total_dev, "", ""
        ], start=2):
            cell = ws.cell(row=curr_row, column=ci, value=round(val, 2) if isinstance(val, float) else val)
            cell.font = Font(bold=True)
            cell.fill = PatternFill("solid", fgColor="D1FAE5")
            cell.alignment = Alignment(horizontal="right")
            cell.border = thin

    for col in ws.columns:
        max_len = max(len(str(cell.value or '')) for cell in col)
        col_letter = get_column_letter(col[0].column)
        ws.column_dimensions[col_letter].width = max(max_len + 3, 11)

    ws.freeze_panes = "B3"

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)

    filename = f"frequency_report_{date}.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
