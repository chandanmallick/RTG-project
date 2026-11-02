from datetime import date, datetime, timedelta
import html
import re

from services.db_handler import MongoService
from routes.psp_routes import (
    get_psp_report_checking,
    get_state_generation_sources,
    get_power_position,
    PSP_PEAK_BASELINES,
)
from crew_legacy.api.roster_api import get_calendar_view


def _format_num(val, decimals=2, fallback="-"):
    if val is None or val == "":
        return fallback
    try:
        n = float(val)
        return f"{n:,.{decimals}f}"
    except (ValueError, TypeError):
        return str(val)


def _diff_badge(today_val, comp_val, unit=""):
    """Render comparison difference in bracket with + or - and percentage."""
    if today_val is None or comp_val is None:
        return ""
    try:
        t = float(today_val)
        c = float(comp_val)
        diff = t - c
        pct = (diff / c * 100) if c > 0 else 0.0
        sign = "+" if diff > 0 else ""
        color = "#15803D" if diff >= 0 else "#DC2626"
        bg = "#DCFCE7" if diff >= 0 else "#FEE2E2"
        return f'<span style="display:inline-block; font-size:10.5px; font-weight:700; color:{color}; background:{bg}; padding:1px 5px; border-radius:4px; margin-left:4px;">({sign}{diff:.2f}{unit} • {sign}{pct:.1f}%)</span>'
    except (ValueError, TypeError):
        return ""


async def build_mobile_briefing_data(date_str: str = None) -> dict:
    """Consolidate Crew duties (Next 4 days) and all 4 PSP datasets for mobile HTML briefing."""
    db = MongoService()
    
    # 1. Determine operational date
    if not date_str:
        latest_doc = db.psp_collection.find_one(
            {"pspstateloaddetailsER": {"$exists": True, "$ne": []}},
            {"date": 1},
            sort=[("date", -1)]
        )
        target_date = latest_doc["date"] if latest_doc else date.today().strftime("%Y-%m-%d")
    else:
        target_date = date_str

    target_dt = datetime.strptime(target_date, "%Y-%m-%d")
    
    # Dates for next 4 days
    date_list = [(target_dt + timedelta(days=i)).strftime("%Y-%m-%d") for i in range(4)]
    
    # 2. Fetch Crew Duties for the Next 4 Days
    crew_days_data = []
    try:
        calendar_data = get_calendar_view(start_date=date_list[0], end_date=date_list[-1])
        
        for d in date_list:
            dt_obj = datetime.strptime(d, "%Y-%m-%d")
            day_label = dt_obj.strftime("%a, %d %b %Y")
            
            shifts_map = {
                "Morning": {"sic": [], "engineers": []},
                "Evening": {"sic": [], "engineers": []},
                "Night": {"sic": [], "engineers": []},
                "General": {"sic": [], "engineers": []},
            }
            leaves = []
            
            for group in calendar_data:
                group_name = group.get("groupName") or "Group"
                for emp in group.get("employees") or []:
                    duties = emp.get("duties") or {}
                    duty = duties.get(d) or {}
                    
                    shift_raw = str(duty.get("shift") or "").strip().capitalize()
                    is_sic = bool(emp.get("IsSIC") or duty.get("tempSIC"))
                    acting_sic = bool(duty.get("tempSIC") and not emp.get("IsSIC"))
                    
                    emp_name = emp.get("name") or "Unknown"
                    designation = emp.get("designation") or ""
                    
                    # Check if on leave
                    leave_type = duty.get("leaveType")
                    if leave_type and str(leave_type).upper() not in {"NONE", "NULL", "-"}:
                        leaves.append({
                            "name": emp_name,
                            "leave_type": str(leave_type).upper(),
                            "group": group_name,
                            "designation": designation,
                            "is_sic": is_sic,
                        })
                    
                    # Map into shift if working
                    if shift_raw in shifts_map:
                        person_info = {
                            "name": emp_name,
                            "designation": designation,
                            "group": group_name,
                            "is_sic": is_sic,
                            "acting_sic": acting_sic,
                            "replacement": bool(duty.get("replacementDuty")),
                        }
                        if is_sic:
                            shifts_map[shift_raw]["sic"].append(person_info)
                        else:
                            shifts_map[shift_raw]["engineers"].append(person_info)

            crew_days_data.append({
                "date": d,
                "day_label": day_label,
                "shifts": shifts_map,
                "leaves": leaves,
            })
    except Exception as e:
        print(f"Error gathering crew data for mobile briefing: {e}")

    # 3. Fetch PSP Report Checking (Energy & Demand Comparison Tables)
    psp_energy_rows = []
    psp_demand_rows = []
    try:
        report_check = await get_psp_report_checking(date_str=target_date, include_curve=False)
        tables = report_check.get("tables", [])
        for t in tables:
            if t.get("key") == "energy":
                psp_energy_rows = t.get("rows", [])
            elif t.get("key") in {"demand_check", "demand"}:
                psp_demand_rows = t.get("rows", [])
    except Exception as e:
        print(f"Error gathering PSP report checking data: {e}")

    # 4. Fetch State Generation Sources & Regional Energy Composition
    gen_sources_data = {"states": [], "composition": [], "totals": {}}
    try:
        gen_sources = await get_state_generation_sources(date_str=target_date)
        if gen_sources.get("success") and gen_sources.get("has_data"):
            gen_sources_data = {
                "states": gen_sources.get("states", []),
                "composition": gen_sources.get("composition", []),
                "totals": gen_sources.get("totals", {}),
            }
    except Exception as e:
        print(f"Error gathering state generation sources: {e}")

    # 5. Fetch State-Wise Demand & Energy Comparison vs All-Time Highest Records
    power_position_rows = []
    try:
        pos_data = await get_power_position(date_str=target_date)
        if pos_data.get("success"):
            power_position_rows = pos_data.get("rows", [])
    except Exception as e:
        print(f"Error gathering power position data: {e}")

    return {
        "date": target_date,
        "date_formatted": target_dt.strftime("%d %b %Y"),
        "day_of_week": target_dt.strftime("%A"),
        "crew_days": crew_days_data,
        "psp_energy_rows": psp_energy_rows,
        "psp_demand_rows": psp_demand_rows,
        "gen_sources": gen_sources_data,
        "power_position": power_position_rows,
    }


def generate_mobile_briefing_html(data: dict) -> str:
    """Generate clean, responsive, mobile-first HTML email document."""
    rep_date = data.get("date_formatted") or data.get("date") or ""
    day_name = data.get("day_of_week") or ""
    crew_days = data.get("crew_days") or []
    energy_rows = data.get("psp_energy_rows") or []
    demand_rows = data.get("psp_demand_rows") or []
    gen_sources = data.get("gen_sources") or {}
    power_pos = data.get("power_position") or []
    
    composition = gen_sources.get("composition") or []
    states_gen = gen_sources.get("states") or []
    totals_gen = gen_sources.get("totals") or {}

    SOURCE_COLORS = {
        "thermal": "#E28743",
        "hydro": "#2563EB",
        "wind": "#14B8A6",
        "solar": "#FBBF24",
        "small_hydro": "#60A5FA",
        "others": "#8B5CF6",
    }

    DAY_THEMES = [
        {"bg": "#F0FDF4", "border": "#86EFAC", "badge_bg": "#15803D", "text": "#14532D"},
        {"bg": "#FFF7ED", "border": "#FED7AA", "badge_bg": "#C2410C", "text": "#7C2D12"},
        {"bg": "#EFF6FF", "border": "#BFDBFE", "badge_bg": "#1D4ED8", "text": "#1E3A8A"},
        {"bg": "#FAF5FF", "border": "#E9D5FF", "badge_bg": "#7E22CE", "text": "#581C87"},
    ]

    html_parts = []

    # 1. Boilerplate & Mobile Responsive Meta
    html_parts.append(f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Daily Power System & Crew Briefing - {rep_date}</title>
  <style>
    body {{
      margin: 0;
      padding: 0;
      background-color: #F1F5F9;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #0F172A;
      -webkit-font-smoothing: antialiased;
    }}
    .mobile-container {{
      max-width: 460px;
      margin: 0 auto;
      background-color: #FFFFFF;
      min-height: 100vh;
      box-shadow: 0 4px 20px rgba(0,0,0,0.06);
    }}
    .card {{
      background: #FFFFFF;
      border: 1px solid #E2E8F0;
      border-radius: 16px;
      padding: 14px;
      margin-bottom: 12px;
      box-shadow: 0 2px 6px rgba(0,0,0,0.02);
    }}
    .pill-badge {{
      display: inline-block;
      padding: 2px 7px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 700;
    }}
    @media only screen and (max-width: 480px) {{
      .mobile-container {{
        width: 100% !important;
        box-shadow: none !important;
      }}
    }}
  </style>
</head>
<body>
<div class="mobile-container">

  <!-- HERO HEADER -->
  <div style="background: linear-gradient(135deg, #0A192F 0%, #004DA8 60%, #0077D4 100%); padding: 22px 18px 18px; color: #FFFFFF; border-radius: 0 0 24px 24px; box-shadow: 0 6px 16px rgba(0,77,168,0.25);">
    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom: 6px;">
      <div style="font-size: 11px; font-weight: 900; letter-spacing: 1.2px; color: #93C5FD; text-transform: uppercase;">
        ⚡ COMPASS • GRID-INDIA
      </div>
      <span style="background: rgba(255,255,255,0.18); font-size: 10.5px; font-weight: 700; padding: 2px 8px; border-radius: 999px; color: #FFFFFF;">
        Mobile Edition
      </span>
    </div>
    <div style="font-size: 20px; font-weight: 900; line-height: 1.2; margin-bottom: 4px;">
      Daily Power System & Crew Briefing
    </div>
    <div style="font-size: 12.5px; color: #E2E8F0; display:flex; align-items:center; gap: 6px;">
      <span>📅 <b>{day_name}, {rep_date}</b></span>
      <span>•</span>
      <span>Eastern Regional Grid</span>
    </div>
  </div>

  <div style="padding: 16px 14px;">
""")

    # ─────────────────────────────────────────────────────────────
    # PART 1: CREW MANAGEMENT - DUTY OF NEXT 4 DAYS (IMAGE 2 STYLE)
    # ─────────────────────────────────────────────────────────────
    html_parts.append("""
    <!-- SECTION 1: CREW ROSTER (NEXT 4 DAYS) -->
    <div style="margin-bottom: 20px;">
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom: 10px;">
        <div style="font-size: 15px; font-weight: 900; color: #0F172A; display:flex; align-items:center; gap: 6px;">
          <span>👥</span> Crew Duty Schedule (Next 4 Days)
        </div>
        <span style="font-size: 11px; font-weight: 700; color: #64748B;">M / E / N + Leaves</span>
      </div>
    """)

    for idx, day_info in enumerate(crew_days[:4]):
        theme = DAY_THEMES[idx % len(DAY_THEMES)]
        shifts = day_info.get("shifts") or {}
        leaves = day_info.get("leaves") or []
        
        html_parts.append(f"""
      <!-- Day Card: {day_info['day_label']} -->
      <div style="background:{theme['bg']}; border:1.5px solid {theme['border']}; border-radius: 16px; padding: 12px 14px; margin-bottom: 10px;">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom: 8px; border-bottom: 1px dashed {theme['border']}; padding-bottom: 6px;">
          <div style="font-size: 13.5px; font-weight: 900; color:{theme['text']};">
            📅 {day_info['day_label']}
          </div>
          <span style="background:{theme['badge_bg']}; color:#FFFFFF; font-size:10px; font-weight:800; padding:2px 8px; border-radius:999px;">
            {'Today' if idx == 0 else f'Day +{idx}'}
          </span>
        </div>

        <!-- Shift details -->
        <div style="display:flex; flex-direction:column; gap: 6px; font-size: 12px;">
        """)

        shift_configs = [
            ("Morning", "🌅", "06:00 - 14:00", "#0284C7"),
            ("Evening", "☀️", "14:00 - 22:00", "#D97706"),
            ("Night", "🌙", "22:00 - 06:00", "#4F46E5"),
        ]

        for s_name, s_icon, s_time, s_color in shift_configs:
            s_data = shifts.get(s_name) or {}
            sic_list = s_data.get("sic") or []
            eng_list = s_data.get("engineers") or []

            sic_label = ", ".join(
                [f"<b>{p['name']}</b> (Acting SIC)" if p.get("acting_sic") else f"<b>{p['name']}</b> (SIC)" for p in sic_list]
            ) or "<i>Vacant</i>"

            eng_label = ", ".join([p['name'] for p in eng_list]) or "-"

            html_parts.append(f"""
          <div style="background:#FFFFFF; border-radius:10px; padding:7px 9px; border:1px solid rgba(0,0,0,0.05);">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:3px;">
              <span style="font-weight:800; color:{s_color}; font-size:11.5px;">
                {s_icon} {s_name} <span style="font-weight:400; font-size:10px; color:#64748B;">({s_time})</span>
              </span>
              <span style="font-size:11px; color:#0F172A;">{sic_label}</span>
            </div>
            <div style="font-size:11px; color:#475569; padding-left: 2px;">
              Staff: {eng_label}
            </div>
          </div>
            """)

        # Personnel on Leave on this day
        if leaves:
            leave_chips = " ".join([
                f'<span style="display:inline-block; background:#FEE2E2; color:#B91C1C; border:1px solid #FCA5A5; font-size:10.5px; font-weight:700; padding:2px 7px; border-radius:6px; margin:2px 3px 2px 0;">🌴 {l["name"]} ({l["leave_type"]})</span>'
                for l in leaves
            ])
            html_parts.append(f"""
          <div style="margin-top: 4px; padding-top: 5px; border-top: 1px dotted {theme['border']};">
            <div style="font-size:10.5px; font-weight:800; color:#B91C1C; margin-bottom:2px;">
              ON LEAVE:
            </div>
            <div>{leave_chips}</div>
          </div>
            """)

        html_parts.append("""
        </div>
      </div>
        """)

    html_parts.append("</div>")

    # ─────────────────────────────────────────────────────────────
    # PART 2: PSP DATA PART
    # i. /psp-report-checking Demand & Energy Comparison Tiles (Image 1 Style)
    # ─────────────────────────────────────────────────────────────
    html_parts.append("""
    <!-- SECTION 2: PSP DEMAND & ENERGY COMPARISON TILES -->
    <div style="margin-bottom: 22px;">
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom: 10px;">
        <div style="font-size: 15px; font-weight: 900; color: #0F172A; display:flex; align-items:center; gap: 6px;">
          <span>⚡</span> Energy Consumption Comparison (MU)
        </div>
        <span style="font-size: 11px; font-weight: 700; color: #0057B7; background:#E0F2FE; padding:2px 7px; border-radius:999px;">
          Report Checking
        </span>
      </div>
      <div style="font-size: 11.5px; color:#64748B; margin-bottom: 10px;">
        Large primary figure shows <b>Operational Day ({rep_date})</b>, with brackets displaying change vs Yesterday, 7-Day Avg, and Last Year.
      </div>
    """)

    # Render Energy comparison tiles (Image 1 style)
    for row in energy_rows:
        state_name = row.get("state") or row.get("constituent") or "Constituent"
        op_day = row.get("operational_day")
        yesterday = row.get("yesterday")
        avg7 = row.get("average_last_7_days")
        last_year = row.get("same_day_last_year")

        is_er = (state_name.upper() == "ER")
        card_bg = "#F8FAFC" if not is_er else "#F0FDF4"
        border_color = "#CBD5E1" if not is_er else "#86EFAC"

        html_parts.append(f"""
      <!-- Tile for {state_name} -->
      <div style="background:{card_bg}; border:1.5px solid {border_color}; border-radius: 16px; padding: 13px 15px; margin-bottom: 10px; box-shadow:0 2px 6px rgba(0,0,0,0.02);">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom: 4px;">
          <div style="font-size: 14px; font-weight: 900; color:{'#15803D' if is_er else '#0F172A'};">
            {state_name}
          </div>
          <span style="font-size: 10px; font-weight: 800; color: #64748B; text-transform:uppercase;">
            Daily Energy
          </span>
        </div>

        <!-- Big Primary Number -->
        <div style="display:flex; align-items:baseline; gap: 6px; margin-bottom: 8px;">
          <span style="font-size: 26px; font-weight: 950; color:{'#15803D' if is_er else '#004DA8'}; letter-spacing:-0.5px;">
            {_format_num(op_day, 2)}
          </span>
          <span style="font-size: 13px; font-weight: 800; color: #64748B;">MU</span>
        </div>

        <!-- 3 Comparison Metric Chips -->
        <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; font-size: 11px;">
          <!-- Yesterday -->
          <div style="background:#FFFFFF; border:1px solid #E2E8F0; border-radius:10px; padding: 6px; text-align:center;">
            <div style="color:#64748B; font-size:9.5px; font-weight:700; text-transform:uppercase;">Yesterday</div>
            <div style="font-weight:900; font-size:12px; color:#0F172A; margin:1px 0;">{_format_num(yesterday, 1)}</div>
            {_diff_badge(op_day, yesterday)}
          </div>

          <!-- 7-Day Avg -->
          <div style="background:#FFFFFF; border:1px solid #E2E8F0; border-radius:10px; padding: 6px; text-align:center;">
            <div style="color:#64748B; font-size:9.5px; font-weight:700; text-transform:uppercase;">7-Day Avg</div>
            <div style="font-weight:900; font-size:12px; color:#0F172A; margin:1px 0;">{_format_num(avg7, 1)}</div>
            {_diff_badge(op_day, avg7)}
          </div>

          <!-- Last Year -->
          <div style="background:#FFFFFF; border:1px solid #E2E8F0; border-radius:10px; padding: 6px; text-align:center;">
            <div style="color:#64748B; font-size:9.5px; font-weight:700; text-transform:uppercase;">Last Year</div>
            <div style="font-weight:900; font-size:12px; color:#0F172A; margin:1px 0;">{_format_num(last_year, 1)}</div>
            {_diff_badge(op_day, last_year)}
          </div>
        </div>
      </div>
        """)

    html_parts.append("</div>")

    # ─────────────────────────────────────────────────────────────
    # PART 2: ii. ENERGY COMPOSITION - REGIONAL SOURCE CONTRIBUTION BY MAGNITUDE
    # ─────────────────────────────────────────────────────────────
    html_parts.append(f"""
    <!-- SECTION 3: REGIONAL ENERGY COMPOSITION -->
    <div style="margin-bottom: 22px;">
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom: 6px;">
        <div style="font-size: 15px; font-weight: 900; color: #0F172A; display:flex; align-items:center; gap: 6px;">
          <span>🌱</span> Regional Energy Composition
        </div>
        <span style="font-size: 11px; font-weight: 800; color:#15803D;">
          Total: {_format_num(totals_gen.get('generation_total'), 1)} MU
        </span>
      </div>
      <div style="font-size: 11.5px; color:#64748B; margin-bottom: 10px;">
        Regional source contribution sorted by magnitude on {rep_date}.
      </div>

      <!-- Visual Stacked Bar -->
      <div style="width:100%; height:20px; border-radius:10px; overflow:hidden; display:flex; background:#E2E8F0; margin-bottom:12px; box-shadow:inset 0 1px 3px rgba(0,0,0,0.1);">
    """)

    for item in composition:
        pct = float(item.get("percent") or 0.0)
        c_key = item.get("key") or "others"
        color = SOURCE_COLORS.get(c_key, "#64748B")
        if pct > 0:
            html_parts.append(f'<div style="width:{pct}%; background:{color}; height:100%;" title="{item.get("name")}: {pct:.1f}%"></div>')

    html_parts.append("""
      </div>

      <!-- Ranked magnitude source chips -->
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 8px;">
    """)

    for item in composition:
        s_name = item.get("name") or "Source"
        val = item.get("abs_value")
        pct = item.get("percent") or 0.0
        c_key = item.get("key") or "others"
        color = SOURCE_COLORS.get(c_key, "#64748B")

        html_parts.append(f"""
        <div style="background:#F8FAFC; border:1px solid #E2E8F0; border-radius:12px; padding: 8px 10px; display:flex; align-items:center; justify-content:space-between;">
          <div style="display:flex; align-items:center; gap: 6px;">
            <span style="width:10px; height:10px; border-radius:50%; background:{color}; display:inline-block; flex-shrink:0;"></span>
            <span style="font-size:12px; font-weight:800; color:#0F172A;">{s_name}</span>
          </div>
          <div style="text-align:right;">
            <div style="font-size:12px; font-weight:900; color:#004DA8;">{_format_num(val, 1)} <span style="font-size:9.5px; color:#64748B;">MU</span></div>
            <div style="font-size:10px; font-weight:700; color:#15803D;">{pct:.1f}%</div>
          </div>
        </div>
        """)

    html_parts.append("""
      </div>
    </div>
    """)

    # ─────────────────────────────────────────────────────────────
    # PART 2: iii. STATE WISE GENERATION SOURCE MIX, DRAWAL & UI
    # ─────────────────────────────────────────────────────────────
    html_parts.append(f"""
    <!-- SECTION 4: STATE-WISE GENERATION SOURCES -->
    <div style="margin-bottom: 22px;">
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom: 6px;">
        <div style="font-size: 15px; font-weight: 900; color: #0F172A; display:flex; align-items:center; gap: 6px;">
          <span>🏛️</span> State Wise Generation & Drawal
        </div>
        <span style="font-size: 11px; font-weight: 700; color: #64748B;">Source Mix • UI</span>
      </div>
      <div style="font-size: 11.5px; color:#64748B; margin-bottom: 10px;">
        State load details source mix, drawal schedule and UI for {rep_date}.
      </div>
    """)

    for s in states_gen:
        s_name = s.get("state") or "State"
        gen_tot = s.get("generation_total")
        sch = s.get("drawing_schedule")
        ui_val = s.get("ui")
        ui_num = float(ui_val or 0.0)
        ui_color = "#15803D" if ui_num >= 0 else "#DC2626"
        ui_bg = "#DCFCE7" if ui_num >= 0 else "#FEE2E2"

        # mini breakdown
        breakdown_items = []
        for sk in ["thermal", "hydro", "wind", "solar", "small_hydro", "others"]:
            v = float(s.get(sk) or 0.0)
            if v != 0:
                s_lbl = sk.replace("_", " ").title()
                breakdown_items.append(f'<span style="color:{SOURCE_COLORS.get(sk, "#64748B")}; font-weight:700;">{s_lbl}: {v:.1f}</span>')

        breakdown_str = " • ".join(breakdown_items) if breakdown_items else "No internal state gen"

        html_parts.append(f"""
      <div style="background:#FFFFFF; border:1px solid #CBD5E1; border-radius:14px; padding: 11px 13px; margin-bottom: 8px;">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom: 4px;">
          <span style="font-size:13.5px; font-weight:900; color:#0F172A;">{s_name}</span>
          <span style="font-size:13px; font-weight:900; color:#15803D;">Gen: {_format_num(gen_tot, 2)} MU</span>
        </div>

        <div style="font-size:11px; color:#475569; margin-bottom: 6px;">
          {breakdown_str}
        </div>

        <div style="display:flex; align-items:center; justify-content:space-between; padding-top: 6px; border-top: 1px dotted #E2E8F0; font-size:11.5px;">
          <span style="background:#F1F5F9; color:#334155; font-weight:700; padding:2px 8px; border-radius:6px;">
            Schedule: <b>{_format_num(sch, 2)} MU</b>
          </span>
          <span style="background:{ui_bg}; color:{ui_color}; font-weight:800; padding:2px 8px; border-radius:6px;">
            UI / Dev: <b>{_format_num(ui_val, 2)} MU</b>
          </span>
        </div>
      </div>
        """)

    html_parts.append("</div>")

    # ─────────────────────────────────────────────────────────────
    # PART 2: iv. PSP STATE-WISE DEMAND & ENERGY COMPARISON (HIGHEST RECORD)
    # ─────────────────────────────────────────────────────────────
    html_parts.append(f"""
    <!-- SECTION 5: YESTERDAY VS HIGHEST RECORD COMPARISON -->
    <div style="margin-bottom: 24px;">
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom: 6px;">
        <div style="font-size: 15px; font-weight: 900; color: #0F172A; display:flex; align-items:center; gap: 6px;">
          <span>📈</span> Yesterday vs All-Time Highest Record
        </div>
        <span style="font-size: 11px; font-weight: 700; color: #64748B;">Same-Line Plot</span>
      </div>
      <div style="font-size: 11.5px; color:#64748B; margin-bottom: 12px;">
        Progress fill shows Yesterday's figure vs 100% full bar representing the All-Time Record.
      </div>
    """)

    # Render Demand and Energy Comparison Bars
    for r in power_pos:
        c_name = r.get("constituent") or "Constituent"
        
        # Demand (MW)
        daily_d = float(r.get("daily_demand") or 0.0)
        high_d = float(r.get("all_time_demand") or 0.0)
        pct_d = min(100.0, (daily_d / high_d * 100)) if high_d > 0 else 0.0
        
        # Energy (MU)
        daily_e = float(r.get("daily_energy") or 0.0)
        high_e = float(r.get("all_time_energy") or 0.0)
        pct_e = min(100.0, (daily_e / high_e * 100)) if high_e > 0 else 0.0

        html_parts.append(f"""
      <div style="background:#FFFFFF; border:1px solid #CBD5E1; border-radius:14px; padding: 12px; margin-bottom: 10px;">
        <div style="font-size: 13.5px; font-weight: 900; color: #0F172A; margin-bottom: 8px;">
          {c_name}
        </div>

        <!-- Demand Bar -->
        <div style="margin-bottom: 8px;">
          <div style="display:flex; justify-content:space-between; font-size:11px; margin-bottom: 3px;">
            <span style="font-weight:700; color:#0369A1;">Peak Demand (MW)</span>
            <span style="font-weight:800; color:#0F172A;">
              {_format_num(daily_d, 0)} / {_format_num(high_d, 0)} MW <span style="color:#0284C7; font-weight:900;">({pct_d:.1f}%)</span>
            </span>
          </div>
          <div style="width:100%; height:12px; background:#E2E8F0; border-radius:6px; overflow:hidden;">
            <div style="width:{pct_d:.1f}%; height:100%; background:linear-gradient(90deg, #38BDF8 0%, #0284C7 100%); border-radius:6px;"></div>
          </div>
        </div>

        <!-- Energy Bar -->
        <div>
          <div style="display:flex; justify-content:space-between; font-size:11px; margin-bottom: 3px;">
            <span style="font-weight:700; color:#15803D;">Energy Met (MU)</span>
            <span style="font-weight:800; color:#0F172A;">
              {_format_num(daily_e, 2)} / {_format_num(high_e, 2)} MU <span style="color:#15803D; font-weight:900;">({pct_e:.1f}%)</span>
            </span>
          </div>
          <div style="width:100%; height:12px; background:#E2E8F0; border-radius:6px; overflow:hidden;">
            <div style="width:{pct_e:.1f}%; height:100%; background:linear-gradient(90deg, #4ADE80 0%, #16A34A 100%); border-radius:6px;"></div>
          </div>
        </div>
      </div>
        """)

    html_parts.append("""
    </div>

    <!-- FOOTER -->
    <div style="margin-top: 24px; padding: 14px 10px; border-top: 1px solid #E2E8F0; text-align:center; font-size: 11px; color: #94A3B8;">
      <div>COMPASS • Eastern Regional Load Despatch Centre (ERLDC)</div>
      <div style="margin-top: 3px;">This mobile briefing is automatically compiled from live operational data.</div>
      <div style="margin-top: 6px;">Manage recipients in <b>Admin &gt; Mail Settings</b>.</div>
    </div>

  </div> <!-- /padding -->
</div> <!-- /mobile-container -->
</body>
</html>
    """)

    return "".join(html_parts)
