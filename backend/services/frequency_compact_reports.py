"""Structured multi-section report engine, sharing calculations and export engines."""
import asyncio
import json
import base64
from collections import defaultdict
from html import escape
from fastapi.responses import StreamingResponse
from services import frequency_analysis_sessions as sessions
from services.frequency_event_reporting import supplements_excel, message_category_rows, MESSAGE_CATEGORY_COLUMNS, CHRONOLOGY_COLUMNS
from services.frequency_report_formatting import format_report_value


def number(value):
    return '-' if value is None else f'{value:.3f}'.rstrip('0').rstrip('.') if isinstance(value, (int, float)) else str(value)


def performance_table(rows, levels, high=False):
    columns = [('date', 'Date / Month'), ('event', 'Event'), ('entity', 'Entity'), ('period', 'Period (IST)'), ('highest_frequency', 'Max Hz') if high else ('lowest_frequency', 'Min Hz')]
    sign = '>' if high else '<'
    for level in levels:
        columns.extend([(f'{level}_frequency', f'{sign}{level} Hz min (%)'), (f'{level}_adverse', f'{sign}{level} Adverse min (%)'), (f'{level}_mw', f'{sign}{level} Avg / Max MW')])
    columns.append(('message_count', 'Messages'))
    output = []
    for row in rows:
        record = {**row, 'period': row['period_start'].replace('T', ' ') + ' - ' + row['period_end'].replace('T', ' ')}
        frequency_key = 'highest_frequency' if high else 'lowest_frequency'
        record[frequency_key] = format_report_value(row.get(frequency_key), frequency_key)
        for level in levels:
            values = row['thresholds'][level]
            minutes = values['frequency_minutes']
            duration = row.get('selected_minutes')
            percent = minutes / duration * 100 if duration else None
            record[f'{level}_frequency'] = f'{number(minutes)} ({number(percent)}%)'
            record[f'{level}_adverse'] = f"{number(values['adverse_minutes'])} ({number(values['adverse_pct'])}%)"
            record[f'{level}_mw'] = f"{format_report_value(values['average_od_ui_mw'], 'average_od_ui_mw')} / {format_report_value(values['maximum_od_ui_mw'], 'maximum_od_ui_mw')}"
        output.append(record)
    return columns, output


def report_tables(session, result, payload):
    high = result.get('event_type') == 'high'
    levels = list(result['summary']['thresholds'])
    sign = '>' if high else '<'
    entities = [entity for entity in session['dataset']['entities'] if entity['group'] in payload.performance_groups]
    windows = sessions.period_windows(result, 'event')
    rows, summaries = sessions.period_statistics(session, result, windows, entities)
    columns = [('date', 'Date'), ('event', 'Event'), ('minimum_frequency', 'Minimum Hz'), ('maximum_frequency', 'Maximum Hz'), ('minimum_timestamp', 'Minimum at (IST)'), ('selected_minutes', 'Selected min'), ('covered_frequency_minutes', 'Covered min')]
    for level in levels:
        columns.extend([(f'{level}_minutes', f'{sign}{level} Minutes'), (f'{level}_pct', f'{sign}{level} % selected')])
    frequency = []
    for period in summaries:
        summary = period['summary'] or {}
        record = {'date': period['date'], 'event': period['event'], **{key: summary.get(key) for key, _ in columns}}
        record['minimum_frequency'] = format_report_value(record.get('minimum_frequency'), 'minimum_frequency')
        record['maximum_frequency'] = format_report_value(record.get('maximum_frequency'), 'maximum_frequency')
        record.update(date=period['date'], event=period['event'])
        for level in levels:
            values = summary.get('thresholds', {}).get(level, {})
            record.update({f'{level}_minutes': values.get('frequency_minutes'), f'{level}_pct': values.get('selected_time_pct')})
        frequency.append(record)
    overall = [{
        'threshold': sign + level,
        'minutes': values['frequency_minutes'],
        'percent': values['frequency_minutes'] / result['summary']['selected_minutes'] * 100 if result['summary'].get('selected_minutes') else 0,
        'occurrences': values['occurrences'],
        'longest': values['longest_minutes'],
        'minimum_frequency': format_report_value(result['summary']['minimum_frequency'], 'minimum_frequency'),
        'maximum_frequency': format_report_value(result['summary']['maximum_frequency'], 'maximum_frequency')
    } for level, values in result['summary']['thresholds'].items()]
    tables = [
        ('Overall Frequency Statistics', [('threshold', 'Threshold Hz'), ('minutes', 'Minutes'), ('percent', '% selected'), ('occurrences', 'Occurrences'), ('longest', 'Longest min'), ('minimum_frequency', 'Min Hz'), ('maximum_frequency', 'Max Hz')], overall),
        ('Event Frequency Statistics', columns, frequency)
    ]
    monthly = defaultdict(list)
    for window in windows:
        monthly[window['date'][:7]].extend(window['ranges'])
    month_rows, _ = sessions.period_statistics(session, result, [{'id': month, 'date': month, 'event': None, 'ranges': ranges} for month, ranges in monthly.items()], entities)
    if payload.include_entity_performance:
        for group in payload.performance_groups:
            for title, source in [('Event Performance', rows), ('Monthly Performance', month_rows), ('Overall Performance', [{**r, 'group': group, 'selected_minutes': result['summary']['selected_minutes']} for r in result['overall_performance'][group]])]:
                table_columns, table_rows = performance_table([r for r in source if r['group'] == group], levels, high)
                tables.append((group + ' ' + title, table_columns, table_rows))
    chronology = []
    warnings = []
    if payload.include_chronology:
        chronology, warnings = sessions.report_chronology(session, result)
        chronology = [{
            **row,
            'date': row['timestamp'][:10],
            'event': ', '.join(str(period['event']) for period in windows if period['date'] == row['timestamp'][:10] and any(a <= row['timestamp'] < b for a, b in period['ranges'])),
            'message_type': ' / '.join(row.get('message_categories') or [row['message_type']])
        } for row in chronology]
        tables.append(('Daily Event Chronology', [('date', 'Date'), ('event', 'Event'), *CHRONOLOGY_COLUMNS], chronology))
        tables.append(('Category-wise Messages', MESSAGE_CATEGORY_COLUMNS, message_category_rows(chronology, result['messages_complete'])))
    return tables, warnings


def build_event_charts_data(session, result):
    """Build detailed event curves for Section 3: State Overdrawal plots for each event."""
    from routes.frequency_analysis_routes import _window_bounds
    states = [e for e in session['dataset']['entities'] if e['group'] == 'State']
    event_windows = result.get('event_windows', result['ranges'])
    chronology, _ = sessions.report_chronology(session, result)
    events = []
    for entity in states:
        for index, window in enumerate(event_windows, 1):
            start, end = _window_bounds(window)
            chart = sessions.chart_points(session['dataset'], [(start, end)], entity['entity_id'], limit=1200)
            points = chart.get('points', [])
            messages = [row for row in chronology if row.get('entity_id') == entity['entity_id'] and start <= row['timestamp'] < end]
            trans_events = []
            crms_msgs = []
            for r in messages:
                if r.get('record_kind') == 'physical':
                    act = r.get('action') or {}
                    trans_events.append({
                        'timestamp': r.get('timestamp') or act.get('timestamp') or act.get('outage_date_time') or '',
                        'outage_date_time': act.get('outage_date_time') or r.get('timestamp') or '',
                        'line_name': act.get('line_name') or r.get('message_details', ''),
                        'reason': act.get('reason', ''),
                        'owners': act.get('owners') or ([act.get('owner')] if act.get('owner') else []),
                        'agency_name': act.get('agency_name', ''),
                        'remarks': act.get('remarks') or r.get('message_details', '')
                    })
                else:
                    crms_msgs.append({
                        'timestamp': r.get('timestamp') or '',
                        'message_date': r.get('timestamp') or '',
                        'message_no': r.get('message_no', ''),
                        'remarks': r.get('message_details', ''),
                        'category': r.get('message_categories') or [r.get('message_type', 'CRMS Message')],
                        'violation_type': r.get('message_type', 'CRMS Message'),
                        'issued_to': [entity['display_name']],
                        'issued_by': r.get('issued_by', 'ERLDC')
                    })
            events.append({
                'event_id': f"{entity['entity_id']}:{index}",
                'event_index': index,
                'event_name': f"Event {index} | {start[:10]} | {start[11:16]} - {end[11:16]}",
                'event_type': result.get('event_type', 'low'),
                'state': entity['display_name'],
                'start_time': start,
                'end_time': end,
                'series': {
                    'timestamps': [p['timestamp'] for p in points],
                    'frequency': [p['frequency'] for p in points],
                    'deviation': [p['deviation_mw'] for p in points],
                    'schedule': [p.get('schedule') for p in points],
                    'actual': [p.get('actual') for p in points],
                },
                'transmission_line_events': trans_events,
                'crms_messages': crms_msgs
            })
    return events


def build_continuous_drawal_data(session, result=None):
    """
    Build continuous end-to-end frequency vs deviation vs schedule/actual data for Section 3.
    Extracts 1-minute resolution data across the full timeline for constituent States:
      - West Bengal, Bihar, DVC, Jharkhand, Odisha, Sikkim
      - Automatically detects low-frequency dip events (below 49.90 Hz / 49.50 Hz)
      - Matches CRMS violation notices and Physical Regulation actions
    """
    dataset = session.get('dataset', {})
    times = dataset.get('times', [])
    if times is None or len(times) == 0:
        return {}

    from services.frequency_threshold_analysis import iso
    import numpy as np

    timestamps = [iso(t)[:16].replace('T', ' ') for t in times]
    freq_arr = dataset.get('frequency', [])
    freq_clean = [round(float(f), 3) if np.isfinite(f) else None for f in freq_arr]

    low_freq_intervals = []
    in_low = False
    start_ts = ""
    for ts, f in zip(timestamps, freq_clean):
        if f is not None and f <= 49.90:
            if not in_low:
                in_low = True
                start_ts = ts
        else:
            if in_low:
                in_low = False
                low_freq_intervals.append([{"xAxis": start_ts}, {"xAxis": ts}])
    if in_low:
        low_freq_intervals.append([{"xAxis": start_ts}, {"xAxis": timestamps[-1]}])

    detected_events = []
    in_dip = False
    dip_start_idx = 0
    for idx, (ts, f) in enumerate(zip(timestamps, freq_clean)):
        if f is not None and f < 49.90:
            if not in_dip:
                in_dip = True
                dip_start_idx = idx
        else:
            if in_dip:
                in_dip = False
                duration = idx - dip_start_idx
                sub_f = [val for val in freq_clean[dip_start_idx:idx] if val is not None]
                if sub_f:
                    min_val = min(sub_f)
                    min_at = dip_start_idx + sub_f.index(min_val)
                    if duration >= 4 or min_val < 49.75:
                        detected_events.append({
                            "start_time": timestamps[dip_start_idx],
                            "end_time": timestamps[idx - 1],
                            "start_idx": dip_start_idx,
                            "end_idx": idx - 1,
                            "duration_min": duration,
                            "min_freq": round(min_val, 3),
                            "min_time": timestamps[min_at][11:16],
                            "date": timestamps[dip_start_idx][:10],
                            "label": f"{timestamps[dip_start_idx][5:10]} {timestamps[dip_start_idx][11:16]}–{timestamps[idx - 1][11:16]} (Min {min_val:.3f} Hz)"
                        })
    if in_dip:
        duration = len(timestamps) - dip_start_idx
        sub_f = [val for val in freq_clean[dip_start_idx:] if val is not None]
        if sub_f and (duration >= 4 or min(sub_f) < 49.75):
            min_val = min(sub_f)
            detected_events.append({
                "start_time": timestamps[dip_start_idx],
                "end_time": timestamps[-1],
                "start_idx": dip_start_idx,
                "end_idx": len(timestamps) - 1,
                "duration_min": duration,
                "min_freq": round(min_val, 3),
                "min_time": timestamps[dip_start_idx + sub_f.index(min_val)][11:16],
                "date": timestamps[dip_start_idx][:10],
                "label": f"{timestamps[dip_start_idx][5:10]} {timestamps[dip_start_idx][11:16]}–{timestamps[-1][11:16]} (Min {min_val:.3f} Hz)"
            })

    chronology = []
    if result:
        try:
            chronology, _ = sessions.report_chronology(session, result)
        except Exception:
            chronology = result.get('chronology', [])

    states_data = {}
    for entity in dataset.get('entities', []):
        if entity.get('group') != 'State':
            continue
        state_name = entity.get('display_name', '')
        ent_id = entity.get('entity_id', '')

        sch = entity.get('schedule', [])
        act = entity.get('actual', [])
        dev = entity.get('deviation', [])

        sch_clean = [round(float(s), 1) if np.isfinite(s) else None for s in sch]
        act_clean = [round(float(a), 1) if np.isfinite(a) else None for a in act]
        dev_clean = [round(float(d), 1) if np.isfinite(d) else None for d in dev]

        crms_list = []
        trans_list = []
        for r in chronology:
            if r.get('entity_id') == ent_id or r.get('state') == state_name or r.get('entity') == state_name:
                r_ts = str(r.get('timestamp') or '').replace('T', ' ')[:16]
                if r.get('record_kind') == 'physical':
                    act_item = r.get('action') or {}
                    trans_list.append({
                        "timestamp": r_ts,
                        "outage_date_time": act_item.get('outage_date_time') or r_ts,
                        "line_name": act_item.get('line_name') or r.get('message_details', ''),
                        "reason": act_item.get('reason') or '',
                        "owners": act_item.get('owners') or ([act_item.get('owner')] if act_item.get('owner') else []),
                        "agency_name": act_item.get('agency_name') or '',
                        "remarks": act_item.get('remarks') or r.get('message_details', '')
                    })
                else:
                    crms_list.append({
                        "timestamp": r_ts,
                        "message_date": r_ts,
                        "message_no": r.get('message_no', ''),
                        "remarks": r.get('message_details', ''),
                        "category": r.get('message_categories') or [r.get('message_type', 'CRMS Message')],
                        "violation_type": r.get('message_type', 'CRMS Message'),
                        "issued_to": [state_name],
                        "issued_by": r.get('issued_by', 'ERLDC')
                    })

        states_data[state_name] = {
            "schedule": sch_clean,
            "actual": act_clean,
            "deviation": dev_clean,
            "crms_messages": crms_list,
            "transmission_line_events": trans_list,
        }

    unique_dates = sorted(list(set(ts[:10] for ts in timestamps)))

    return {
        "timestamps": timestamps,
        "frequency": freq_clean,
        "low_freq_intervals": low_freq_intervals,
        "detected_events": detected_events,
        "unique_dates": unique_dates,
        "states": states_data,
        "total_points": len(timestamps),
        "start_date": timestamps[0][:10] if timestamps else "",
        "end_date": timestamps[-1][:10] if timestamps else "",
    }


def html_report(tables, title, warnings, session=None, result=None, event_charts_data=None, od_frequency=None, event_tables=None, continuous_drawal_data=None):
    """
    Restructured 5-section HTML report following user requirements:
    1. Frequency profile analysis (Dynamic Frequency Event Tables: Table-2A, Table-2B, Table-2C)
    2. State Scatter (State-wise Overdrawal vs Frequency Analysis plots and statistics tables)
    3. State Overdrawal plots for each event (interactive curves with CRMS markers & continuous 3-panel viewer)
    4. Event Chronology & Number of message issue (Category-wise message breakdown + event chronology)
    5. Rest same (Performance and overall statistics tables)
    """
    tables_json = json.dumps([{'title': name, 'columns': columns, 'rows': [{key: row.get(key) for key, _ in columns} for row in rows]} for name, columns, rows in tables], ensure_ascii=False).replace('<', '\\u003c')
    
    # Event charts data for Section 3
    event_charts_json = json.dumps(event_charts_data or [], ensure_ascii=False).replace('<', '\\u003c')

    # Continuous drawal data for Section 3
    if continuous_drawal_data is None and session:
        try:
            continuous_drawal_data = build_continuous_drawal_data(session, result)
        except Exception as exc:
            print(f"Notice: continuous drawal generation note: {exc}")
            continuous_drawal_data = {}
    continuous_drawal_json = json.dumps(continuous_drawal_data or {}, ensure_ascii=False).replace('<', '\\u003c')
    
    # OD frequency data for Section 2
    summary_info = (result or {}).get('summary') or {}
    fallback_period = 'Uploaded Period'
    if summary_info.get('analysis_start') and summary_info.get('analysis_end'):
        from services.od_frequency_report import format_period_label
        fallback_period = format_period_label(summary_info['analysis_start'], summary_info['analysis_end'])
    period = (od_frequency or {}).get('period') or fallback_period
    plots_base64 = (od_frequency or {}).get('plots_base64') or {}
    state_stats = (od_frequency or {}).get('state_stats') or {}
    stats_base64 = (od_frequency or {}).get('statistics_base64') or ''
    od_frequency_json = json.dumps({
        'period': period,
        'plots': plots_base64,
        'stats': state_stats,
        'statistics_base64': stats_base64
    }, ensure_ascii=False).replace('<', '\\u003c')

    # Category messages table for Section 4
    category_table = next((t for t in tables if t[0] == 'Category-wise Messages'), None)
    category_rows = category_table[2] if category_table else []
    
    summary = (result or {}).get('summary') or {}
    start_time = summary.get('analysis_start', '')
    end_time = summary.get('analysis_end', '')

    # Prepare Section 1: Dynamic Frequency Event Analysis Tables
    event_tables_list = (event_tables or {}).get('tables', [])
    excel_base64 = (event_tables or {}).get('excel_base64', '')
    if event_tables_list:
        event_cards = []
        for tbl in event_tables_list:
            rows_html = []
            for r_idx, row in enumerate(tbl.get('rows', [])):
                const_cells = []
                for c in tbl['constituents']:
                    c_data = row.get('constituents_data', {}).get(c, {})
                    max_od = c_data.get('max_od', '–')
                    avg_dev = c_data.get('avg_dev', '–')
                    od_color = '#B91C1C' if str(max_od) != '–' else '#64748B'
                    const_cells.append(f'<td style="text-align: right; padding: 6px 8px; border: 1px solid #E2E8F0; font-weight: bold; color: {od_color};">{max_od}</td>')
                    const_cells.append(f'<td style="text-align: right; padding: 6px 8px; border: 1px solid #E2E8F0;">{avg_dev}</td>')
                
                rows_html.append(f'''
                <tr style="background: {'#F8FAFC' if r_idx % 2 == 1 else '#FFFFFF'};">
                  <td style="text-align: center; font-weight: 700; padding: 6px 8px; border: 1px solid #E2E8F0;">{row.get("sr_no")}</td>
                  <td style="text-align: center; padding: 6px 8px; border: 1px solid #E2E8F0; white-space: nowrap;">{escape(str(row.get("date", "-")))}</td>
                  <td style="text-align: center; padding: 6px 8px; border: 1px solid #E2E8F0; font-family: monospace;">{escape(str(row.get("window_hrs", "-")))}</td>
                  <td style="text-align: right; font-weight: 700; padding: 6px 8px; border: 1px solid #E2E8F0;">{row.get("duration_min")}</td>
                  <td style="text-align: right; font-weight: 800; color: #DC2626; padding: 6px 8px; border: 1px solid #E2E8F0;">{row.get("lowest_freq", 0.0):.3f}</td>
                  <td style="text-align: center; padding: 6px 8px; border: 1px solid #E2E8F0; font-family: monospace;">{escape(str(row.get("lowest_at_time", "-")))}</td>
                  {''.join(const_cells)}
                </tr>''')
            
            if not rows_html:
                col_span = 6 + 2 * len(tbl['constituents'])
                rows_html.append(f'<tr><td colspan="{col_span}" style="text-align: center; padding: 16px; color: var(--muted);">No continuous frequency dips below {tbl["threshold_display"]} Hz recorded in the selected period.</td></tr>')
                
            const_head_top = ''.join(f'<th colspan="2" style="padding: 8px 10px; border: 1px solid #336199; text-align: center;">{escape(c)}</th>' for c in tbl['constituents'])
            const_head_sub = ''.join('<th style="padding: 5px 8px; border: 1px solid #3d72b0; text-align: right; width: 65px;">Max OD</th><th style="padding: 5px 8px; border: 1px solid #3d72b0; text-align: right; width: 65px;">Avg Dev</th>' for _ in tbl['constituents'])
            
            event_cards.append(f'''
            <details class="event-table-card" id="details-{tbl["table_id"]}" data-thresh="{tbl["threshold"]}" style="margin-bottom: 24px; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; background: white; box-shadow: 0 2px 6px rgba(0,0,0,0.03);" open>
              <summary style="background: #17365D; color: white; padding: 12px 18px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; cursor: pointer; user-select: none;">
                <div style="font-weight: 800; font-size: 13px; line-height: 1.4; display: flex; align-items: center; gap: 8px;">
                  <span class="collapsible-icon" style="font-size: 11px;">▼</span>
                  <span>{escape(tbl["title"])}</span>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span class="badge" style="background: rgba(255,255,255,0.2); color: white; font-size: 11px; padding: 3px 8px; border-radius: 4px;">{tbl["total_events"]} Events ({tbl["total_minutes"]} min)</span>
                  <span style="font-size: 11px; opacity: 0.85;">(Click to collapse/expand)</span>
                </div>
              </summary>
              <div style="overflow-x: auto; max-height: 560px;">
                <table class="styled-table" style="width: 100%; border-collapse: collapse; font-size: 12px; margin: 0;">
                  <thead>
                    <tr style="background: #204B7D; color: white;">
                      <th rowspan="2" style="padding: 8px 10px; border: 1px solid #336199; text-align: center; width: 50px;">Sr. No</th>
                      <th rowspan="2" style="padding: 8px 10px; border: 1px solid #336199; text-align: center; width: 75px;">Date</th>
                      <th rowspan="2" style="padding: 8px 10px; border: 1px solid #336199; text-align: center; width: 100px;">Window (Hrs)</th>
                      <th rowspan="2" style="padding: 8px 10px; border: 1px solid #336199; text-align: center; width: 85px;">{escape(tbl["threshold_col_name"])}</th>
                      <th rowspan="2" style="padding: 8px 10px; border: 1px solid #336199; text-align: center; width: 85px;">Lowest (Hz)</th>
                      <th rowspan="2" style="padding: 8px 10px; border: 1px solid #336199; text-align: center; width: 75px;">At (Hrs)</th>
                      {const_head_top}
                    </tr>
                    <tr style="background: #2B5E99; color: white; font-size: 11px;">
                      {const_head_sub}
                    </tr>
                  </thead>
                  <tbody>
                    {''.join(rows_html)}
                  </tbody>
                </table>
              </div>
            </details>''')
        event_toolbar = '''
        <div class="filter-bar" style="margin-bottom: 16px;">
          <span style="font-size: 12px; font-weight: 700; color: var(--primary);">View Options:</span>
          <button class="action-btn" onclick="toggleAllEventTables(true)">Expand All</button>
          <button class="action-btn" onclick="toggleAllEventTables(false)">Collapse All</button>
          <span style="margin-left: 14px; font-size: 12px; font-weight: 700; color: var(--primary);">Threshold Filter:</span>
          <button class="action-btn" onclick="filterEventTableThreshold('ALL')">All Tables</button>
          <button class="action-btn" onclick="filterEventTableThreshold('49.5')">&lt;49.50 Hz</button>
          <button class="action-btn" onclick="filterEventTableThreshold('49.7')">&lt;49.70 Hz</button>
          <button class="action-btn" onclick="filterEventTableThreshold('49.9')">&lt;49.90 Hz</button>
        </div>'''
        event_section_content = event_toolbar + ''.join(event_cards)
    else:
        event_section_content = '''
        <div class="placeholder-card">
          <h4>Frequency Profile Analysis</h4>
          <p>No 1-minute frequency event data recorded for the selected period.</p>
        </div>'''

    event_dl_btn = f'<div><button class="action-btn success" id="btn-download-event-tables" onclick="downloadEventTablesExcel()">📥 Download Event Tables (.xlsx)</button></div>' if excel_base64 else ''

    return f'''<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{escape(title)} — Consolidated Frequency Analysis</title>
  <script src="https://cdn.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.min.js"></script>
  <style>
    :root {{
      --primary: #17365D;
      --primary-light: #2563EB;
      --bg: #F8FAFC;
      --card-bg: #FFFFFF;
      --border: #CBD5E1;
      --text: #0F172A;
      --muted: #64748B;
      --success: #059669;
      --danger: #DC2626;
      --warning: #D97706;
      --accent: #7C3AED;
    }}
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
      font-size: 13px;
    }}
    header.top-bar {{
      position: sticky;
      top: 0;
      z-index: 100;
      background: #17365D;
      color: white;
      padding: 12px 24px;
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      box-shadow: 0 4px 12px rgba(15, 23, 42, 0.15);
    }}
    header.top-bar h1 {{
      font-size: 18px;
      font-weight: 800;
      letter-spacing: -0.01em;
    }}
    header.top-bar .meta {{
      font-size: 11px;
      color: #93C5FD;
      margin-top: 2px;
    }}
    .nav-links {{
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-top: 6px;
    }}
    .nav-btn {{
      background: rgba(255, 255, 255, 0.12);
      color: white;
      border: 1px solid rgba(255, 255, 255, 0.25);
      border-radius: 6px;
      padding: 5px 11px;
      font-size: 11px;
      font-weight: 700;
      cursor: pointer;
      text-decoration: none;
      transition: background 0.15s;
    }}
    .nav-btn:hover {{
      background: rgba(255, 255, 255, 0.25);
    }}
    .nav-btn.primary {{
      background: #059669;
      border-color: #047857;
    }}
    .nav-btn.primary:hover {{
      background: #047857;
    }}
    main {{
      max-width: 1700px;
      margin: 20px auto;
      padding: 0 20px;
    }}
    .report-section {{
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 24px;
      margin-bottom: 28px;
      box-shadow: 0 2px 8px rgba(15, 23, 42, 0.04);
    }}
    .section-header {{
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #E2E8F0;
      padding-bottom: 12px;
      margin-bottom: 18px;
      flex-wrap: wrap;
      gap: 10px;
    }}
    .section-title {{
      font-size: 17px;
      font-weight: 850;
      color: var(--primary);
      display: flex;
      align-items: center;
      gap: 10px;
    }}
    .section-title .badge {{
      font-size: 11px;
      padding: 3px 8px;
      border-radius: 999px;
      background: #EFF6FF;
      color: #1D4ED8;
      font-weight: 700;
      border: 1px solid #BFDBFE;
    }}
    .placeholder-card {{
      background: linear-gradient(135deg, #F8FAFC 0%, #EFF6FF 100%);
      border: 1.5px dashed #93C5FD;
      border-radius: 8px;
      padding: 30px;
      text-align: center;
      color: #1E3A8A;
    }}
    .placeholder-card h4 {{
      font-size: 15px;
      font-weight: 800;
      margin-bottom: 6px;
    }}
    .placeholder-card p {{
      font-size: 12px;
      color: var(--muted);
      max-width: 600px;
      margin: 0 auto;
    }}
    /* State Scatter Grid */
    .scatter-grid {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(480px, 1fr));
      gap: 22px;
      margin-top: 16px;
    }}
    .scatter-card {{
      background: #FFFFFF;
      border: 1px solid #CBD5E1;
      border-radius: 10px;
      overflow: hidden;
      box-shadow: 0 3px 10px rgba(0,0,0,0.03);
      display: flex;
      flex-direction: column;
    }}
    .scatter-card-header {{
      background: #17365D;
      color: white;
      padding: 10px 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }}
    .scatter-card-header h4 {{
      font-size: 14px;
      font-weight: 800;
    }}
    .scatter-card-header .measure-tag {{
      font-size: 10px;
      background: rgba(255,255,255,0.2);
      padding: 2px 7px;
      border-radius: 4px;
      font-weight: 700;
    }}
    .scatter-img-wrap {{
      background: #FFFFFF;
      padding: 8px;
      border-bottom: 1px solid #E2E8F0;
      text-align: center;
    }}
    .scatter-img-wrap img {{
      max-width: 100%;
      height: auto;
      border-radius: 4px;
      display: block;
      margin: 0 auto;
    }}
    .scatter-table-wrap {{
      padding: 12px 16px;
    }}
    .styled-table {{
      width: 100%;
      border-collapse: collapse;
      font-size: 11.5px;
    }}
    .styled-table th {{
      background: #17365D;
      color: white;
      font-weight: 700;
      padding: 7px 9px;
      text-align: center;
      border: 1px solid #0F233D;
    }}
    .styled-table td {{
      padding: 6px 9px;
      text-align: center;
      border: 1px solid #CBD5E1;
    }}
    .styled-table tr:nth-child(even) td {{
      background: #F8FAFC;
    }}
    .styled-table tr:nth-child(odd) td {{
      background: #FFFFFF;
    }}
    .styled-table td.strong {{
      font-weight: 800;
    }}
    /* Section 3 Event cards */
    .event-card {{
      background: #FFFFFF;
      border: 1px solid #CBD5E1;
      border-radius: 10px;
      margin-bottom: 18px;
      overflow: hidden;
      box-shadow: 0 2px 8px rgba(15,23,42,0.03);
    }}
    .event-card summary {{
      padding: 12px 18px;
      background: #F1F5F9;
      cursor: pointer;
      font-weight: 800;
      font-size: 13px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #E2E8F0;
    }}
    .event-card-body {{
      padding: 16px;
    }}
    .event-chart {{
      height: 480px;
      width: 100%;
    }}
    .event-results {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
      margin-bottom: 14px;
    }}
    .result-tile {{
      background: #F8FAFC;
      border: 1px solid #E2E8F0;
      border-radius: 8px;
      padding: 10px 14px;
    }}
    .result-tile b {{
      display: block;
      color: var(--muted);
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }}
    .result-tile strong {{
      font-size: 16px;
      color: var(--text);
    }}
    .result-tile small {{
      display: block;
      font-size: 11px;
      color: var(--muted);
      margin-top: 2px;
    }}
    .filter-bar {{
      display: flex;
      gap: 10px;
      align-items: center;
      flex-wrap: wrap;
      margin-bottom: 14px;
      padding: 10px 14px;
      background: #F8FAFC;
      border: 1px solid #E2E8F0;
      border-radius: 8px;
    }}
    .filter-bar select, .filter-bar input, .filter-bar button {{
      padding: 6px 10px;
      font-size: 12px;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: white;
      color: var(--text);
    }}
    .filter-bar button {{
      cursor: pointer;
      font-weight: 700;
      background: #17365D;
      color: white;
      border-color: #17365D;
    }}
    .filter-bar button:hover {{
      background: #204B7D;
    }}
    .action-btn {{
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      font-size: 12px;
      font-weight: 700;
      border-radius: 6px;
      border: 1px solid var(--border);
      background: white;
      color: var(--text);
      cursor: pointer;
      text-decoration: none;
    }}
    .action-btn.success {{
      background: #059669;
      color: white;
      border-color: #047857;
    }}
    .action-btn.success:hover {{
      background: #047857;
    }}
    .action-btn.primary {{
      background: #17365D;
      color: white;
      border-color: #0F233D;
    }}
    .action-btn.primary:hover {{
      background: #204B7D;
    }}
    /* Continuous 3-Panel Visualizer Styles */
    .continuous-card {{
      background: #FFFFFF;
      border: 1px solid #CBD5E1;
      border-radius: 10px;
      overflow: hidden;
      box-shadow: 0 4px 14px rgba(15,23,42,0.05);
      margin-top: 14px;
      margin-bottom: 24px;
    }}
    .continuous-card-header {{
      background: #F8FAFC;
      border-bottom: 1px solid #E2E8F0;
      padding: 12px 18px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 10px;
    }}
    .compact-select {{
      padding: 5px 10px;
      border: 1px solid #CBD5E1;
      border-radius: 6px;
      font-size: 11.5px;
      background: #FFFFFF;
      color: #0F172A;
      font-weight: 700;
      cursor: pointer;
    }}
    .event-selection-bar {{
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 18px;
      background: #F1F5F9;
      border-bottom: 1px solid #E2E8F0;
      overflow-x: auto;
    }}
    .event-chips-wrapper {{
      display: flex;
      gap: 6px;
      overflow-x: auto;
      padding: 2px 0;
      scrollbar-width: thin;
    }}
    .event-chip-btn {{
      white-space: nowrap;
      padding: 3px 9px;
      border: 1px solid #CBD5E1;
      border-radius: 999px;
      background: #FFFFFF;
      color: #0F172A;
      font-size: 11px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.15s ease;
    }}
    .event-chip-btn:hover {{
      background: #17365D;
      color: #FFFFFF;
      border-color: #17365D;
    }}
    .event-chip-btn.active {{
      background: #DC2626;
      color: #FFFFFF;
      border-color: #DC2626;
    }}
    .continuous-footnote {{
      padding: 10px 18px;
      background: #F8FAFC;
      border-top: 1px solid #E2E8F0;
      display: flex;
      align-items: center;
      gap: 18px;
      font-size: 11.5px;
      color: #334155;
      flex-wrap: wrap;
    }}
    .scroll-table {{
      overflow: auto;
      max-height: 65vh;
      border: 1px solid var(--border);
      border-radius: 6px;
    }}
    .tag {{
      display: inline-block;
      padding: 2px 7px;
      border-radius: 999px;
      font-size: 10px;
      font-weight: 800;
      margin-right: 4px;
    }}
    .tag.alert {{ background: #FEF3C7; color: #92400E; }}
    .tag.emergency {{ background: #FFEDD5; color: #9A3412; }}
    .tag.extreme {{ background: #FEE2E2; color: #991B1B; }}
    .tag.non-compliance {{ background: #F1F5F9; color: #0F172A; }}
    .modal-overlay {{
      position: fixed;
      top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(15, 23, 42, 0.75);
      backdrop-filter: blur(4px);
      z-index: 9999;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }}
    .modal-content {{
      background: #FFFFFF;
      border-radius: 12px;
      max-width: 95vw;
      max-height: 95vh;
      display: flex;
      flex-direction: column;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2);
      overflow: hidden;
    }}
    .modal-header {{
      background: #17365D;
      color: white;
      padding: 12px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }}
    .modal-header h3 {{
      font-size: 15px;
      font-weight: 800;
      margin: 0;
    }}
    details summary::-webkit-details-marker {{
      display: none;
    }}
    details summary {{
      list-style: none;
    }}
    details[open] summary .collapsible-icon {{
      transform: rotate(0deg);
    }}
    details:not([open]) summary .collapsible-icon {{
      transform: rotate(-90deg);
    }}
    .collapsible-icon {{
      display: inline-block;
      transition: transform 0.2s ease;
    }}
    @media (max-width: 768px) {{
      .scatter-grid {{ grid-template-columns: 1fr; }}
      .event-chart {{ height: 380px; }}
    }}
    @media print {{
      header.top-bar {{ position: static; }}
      .nav-links, .filter-bar, button {{ display: none !important; }}
      .report-section {{ box-shadow: none; border: 1px solid #999; page-break-after: always; }}
    }}
  </style>
</head>
<body>
  <header class="top-bar">
    <div>
      <h1>{escape(title)} — Consolidated Frequency Report</h1>
      <div class="meta">Analysis Period: {escape(start_time.replace('T', ' '))} to {escape(end_time.replace('T', ' '))} IST · SCADA 1-min & CRMS Integration</div>
    </div>
    <div class="nav-links">
      <a class="nav-btn" href="#section-profile">1. Frequency Profile</a>
      <a class="nav-btn" href="#section-scatter">2. State Scatter</a>
      <a class="nav-btn" href="#section-events">3. Event Overdrawal Plots</a>
      <a class="nav-btn" href="#section-chronology">4. Chronology & Messages</a>
      <a class="nav-btn" href="#section-performance">5. Performance Tables</a>
      <button class="nav-btn primary" id="btn-print" onclick="window.print()">Print / PDF</button>
      <button class="nav-btn primary" id="btn-save-html" onclick="downloadSelf()">Download HTML</button>
    </div>
  </header>

  <main>
    <!-- SECTION 1: Frequency profile analysis -->
    <section class="report-section" id="section-profile">
      <div class="section-header">
        <div>
          <h2 class="section-title">
            1. Frequency Profile Analysis — Frequency Event Analysis Tables
            <span class="badge">ERLDC Standard Format</span>
          </h2>
          <p style="font-size: 11.5px; color: var(--muted); margin-top: 4px;">
            Dynamic frequency event identification for continuous dips below selected operational thresholds (&lt;49.50 Hz, &lt;49.70 Hz, &lt;49.90 Hz) with constituent Maximum Overdrawal (Max OD &gt; 0 MW) and Average Deviation (Avg Dev, signed MW).
          </p>
        </div>
        {event_dl_btn}
      </div>
      {event_section_content}
    </section>

    <!-- SECTION 2: State Scatter -->
    <section class="report-section" id="section-scatter">
      <div class="section-header">
        <div>
          <h2 class="section-title">
            2. State-wise Overdrawal vs Frequency Analysis
            <span class="badge">{escape(period)}</span>
          </h2>
          <p style="font-size: 11.5px; color: var(--muted); margin-top: 4px;">
            Scatter analysis of positive Actual - Schedule deviations (&gt;0 MW; Overdrawal for states, Under-injection for DVC) versus Frequency (Hz).
            Frequency bands: &lt;49.50 Hz (<span style="color:#D7191C;font-weight:bold">Red</span>), 49.50–&lt;49.70 Hz (<span style="color:#F07800;font-weight:bold">Orange</span>), 49.70–&lt;49.90 Hz (<span style="color:#7B2CBF;font-weight:bold">Purple</span>), ≥49.90 Hz (<span style="color:#159447;font-weight:bold">Green</span>). Dashed vertical lines mark cumulative thresholds at 49.50, 49.70, and 49.90 Hz.
          </p>
        </div>
        <div>
          <button class="action-btn success" id="btn-download-stats" onclick="downloadStatsExcel()">
            📥 Download Consolidated Statistics (.xlsx)
          </button>
        </div>
      </div>

      <div class="scatter-grid" id="scatter-container">
        <!-- Rendered dynamically by script for each of the 6 states -->
      </div>
    </section>

    <!-- SECTION 3: State Overdrawal plots for each event -->
    <section class="report-section" id="section-events">
      <div class="section-header">
        <div>
          <h2 class="section-title">
            3. State Overdrawal Plots for Each Event
            <span class="badge">Continuous &amp; Event Analysis</span>
          </h2>
          <p style="font-size: 11.5px; color: var(--muted); margin-top: 4px;">
            Continuous end-to-end Drawal (Schedule vs Actual), Deviation with CRMS violation messages and Physical Regulatory actions, and Frequency curve. 2-day default window, scrollable and exportable.
          </p>
        </div>
      </div>

      <!-- Continuous 3-Panel Visualizer Card -->
      <div class="continuous-card" id="continuous-drawal-container">
        <div class="continuous-card-header">
          <div>
            <h3 id="continuous-chart-title" style="margin: 0; font-size: 15px; font-weight: 800; color: #17365D;">
              West Bengal: schedule, actual drawal and over drawal vs frequency
            </h3>
            <span style="font-size: 11px; color: #64748B;">
              Continuous 1-minute SCADA data &bull; 2-day scrollable window by default &bull; Shaded zones: f ≤ 49.90 Hz
            </span>
          </div>
          <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
            <label style="font-size: 11px; font-weight: 800; color: #17365D;">State:</label>
            <select id="continuous-state-select" onchange="onContinuousStateChange()" class="compact-select">
              <!-- Populated by JS -->
            </select>
            <label style="font-size: 11px; font-weight: 800; color: #17365D; margin-left: 6px;">Jump to Date:</label>
            <select id="continuous-date-select" onchange="onContinuousDateChange()" class="compact-select">
              <!-- Populated with unique dates -->
            </select>
            <button class="action-btn" onclick="resetContinuousZoom()" title="Reset to initial 2-day view">
              ↺ 2-Day View
            </button>
            <button class="action-btn primary" onclick="downloadContinuousVisibleWindow()" title="Download visible window as high-res PNG">
              📸 Download Visible Window (PNG)
            </button>
          </div>
        </div>

        <!-- Frequency Overview & Event Selection Chips Bar -->
        <div class="event-selection-bar" id="continuous-event-selection-bar">
          <span style="font-size: 11px; font-weight: 800; color: #17365D; white-space: nowrap; display: flex; align-items: center; gap: 4px;">
            ⚡ Frequency overview &amp; event selection:
          </span>
          <div class="event-chips-wrapper" id="continuous-event-chips">
            <!-- Chips populated dynamically by JS -->
          </div>
        </div>

        <!-- ECharts 3-Panel Container -->
        <div id="continuous-drawal-chart" style="width: 100%; height: 640px; background: #FFFFFF;"></div>

        <!-- Dynamic Statistical Footnote -->
        <div class="continuous-footnote" id="continuous-chart-footnote">
          <span><strong style="color: #DC2626;">Shaded</strong> = f ≤ 49.90 Hz.</span>
          <span><strong>Over drawing at f ≤ 49.90 Hz:</strong> <span id="stat-od-min" style="font-weight: 800; color: #0F172A;">—</span> of <span id="stat-low-min" style="font-weight: 800; color: #0F172A;">—</span> min;</span>
          <span><strong>max over drawal at f ≤ 49.90 Hz:</strong> <span id="stat-max-od" style="font-weight: 800; color: #DC2626;">—</span> MW</span>
          <span id="stat-visible-range" style="margin-left: auto; color: #64748B; font-size: 11px;"></span>
        </div>
      </div>

      <!-- Collapsible Detailed Event Cards -->
      <div style="margin-top: 24px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
        <div>
          <h3 style="font-size: 14px; font-weight: 800; color: var(--primary); margin: 0;">
            3.2 Discrete Event Detail Plots &amp; Regulatory Breakup
          </h3>
          <p style="font-size: 11px; color: var(--muted); margin: 2px 0 0 0;">
            Includes plotted CRMS violation messages and Physical Regulatory transmission line operations.
          </p>
        </div>
        <div class="filter-bar" style="margin-bottom: 0; padding: 4px 10px;">
          <label for="event-state-filter" style="font-size: 11px; font-weight: 700;">Filter State:</label>
          <select id="event-state-filter" onchange="filterEventCharts()" class="compact-select">
            <option value="ALL">All States</option>
          </select>
          <label for="event-slot-filter" style="font-size: 11px; font-weight: 700; margin-left: 8px;">Filter Event:</label>
          <select id="event-slot-filter" onchange="filterEventCharts()" class="compact-select">
            <option value="ALL">All Events</option>
          </select>
          <span id="event-filter-count" style="margin-left: 8px; font-size: 11px; color: var(--muted); font-weight: 700;"></span>
        </div>
      </div>

      <div id="event-cards-container">
        <!-- Event cards rendered dynamically with CRMS and Physical Regulation markers -->
      </div>
    </section>

    <!-- SECTION 4: Event Chronology & Number of message issue -->
    <section class="report-section" id="section-chronology">
      <div class="section-header">
        <div>
          <h2 class="section-title">
            4. Event Chronology & Message Summary
            <span class="badge">CRMS & Physical Regulation</span>
          </h2>
          <p style="font-size: 11.5px; color: var(--muted); margin-top: 4px;">
            Summary of CRMS violation messages issued across recipient groups and chronology of regulatory actions.
          </p>
        </div>
      </div>

      <h3 style="font-size: 14px; font-weight: 800; color: var(--primary); margin-bottom: 10px;">4.1 Category-wise Messages Issued</h3>
      <div style="overflow-x: auto; margin-bottom: 24px;">
        <table class="styled-table" id="table-category-summary">
          <thead>
            <tr>
              <th>Recipient Group</th>
              <th>Recipient</th>
              <th>Category</th>
              <th>Messages Issued</th>
            </tr>
          </thead>
          <tbody>
            {''.join(f'<tr><td>{escape(str(r.get("group", "-")))}</td><td class="strong">{escape(str(r.get("entity", "-")))}</td><td>{escape(str(r.get("category", "-")))}</td><td class="strong">{escape(str(r.get("message_count", "0")))}</td></tr>' for r in category_rows) if category_rows else '<tr><td colspan="4">No mapped message records available.</td></tr>'}
          </tbody>
        </table>
      </div>

      <h3 style="font-size: 14px; font-weight: 800; color: var(--primary); margin-bottom: 10px;">4.2 Daily Event Chronology</h3>
      <div class="filter-bar">
        <label for="chronology-state"><strong>Filter State:</strong></label>
        <select id="chronology-state" onchange="renderChronologyTable()">
          <option value="ALL">All States / Entities</option>
        </select>
        <label for="chronology-date" style="margin-left: 12px;"><strong>Filter Date:</strong></label>
        <input type="date" id="chronology-date" onchange="renderChronologyTable()">
        <label for="chronology-search" style="margin-left: 12px;"><strong>Search:</strong></label>
        <input type="text" id="chronology-search" placeholder="Filter entity, details..." oninput="renderChronologyTable()">
        <button onclick="document.getElementById('chronology-state').value='ALL';document.getElementById('chronology-date').value='';document.getElementById('chronology-search').value='';renderChronologyTable()">Clear</button>
        <span id="chronology-count" style="margin-left: auto; font-size: 11.5px; color: var(--muted); font-weight: 700;"></span>
      </div>

      <div class="scroll-table">
        <table class="styled-table" id="table-chronology">
          <thead>
            <tr>
              <th>Date</th>
              <th>Event</th>
              <th>Timestamp (IST)</th>
              <th>Entity</th>
              <th>Frequency (Hz)</th>
              <th>OD/UI (MW)</th>
              <th>Type</th>
              <th>Message No.</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody id="chronology-body">
            <!-- Dynamically populated -->
          </tbody>
        </table>
      </div>
      <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px;">
        <button class="action-btn" id="chrono-prev" onclick="changeChronoPage(-1)">Previous</button>
        <span id="chrono-page-indicator" style="font-size: 11.5px; color: var(--muted); font-weight: 700;">Page 1</span>
        <button class="action-btn" id="chrono-next" onclick="changeChronoPage(1)">Next</button>
      </div>
    </section>

    <!-- SECTION 5: Performance and Overall Statistics (Rest same) -->
    <section class="report-section" id="section-performance">
      <div class="section-header">
        <div>
          <h2 class="section-title">
            5. Performance & Overall Statistics
            <span class="badge">Tables & Indicators</span>
          </h2>
          <p style="font-size: 11.5px; color: var(--muted); margin-top: 4px;">
            Comprehensive statistical and performance indicators across thresholds, entities, and selected periods.
          </p>
        </div>
        <div style="display: flex; gap: 8px;">
          <button class="action-btn" onclick="downloadCurrentTableCsv()">📥 Download Table (CSV)</button>
        </div>
      </div>

      <div class="filter-bar">
        <label for="perf-table-select"><strong>Select Table:</strong></label>
        <select id="perf-table-select" onchange="renderPerfTable()">
          <!-- Populated from tables -->
        </select>
        <span id="perf-table-count" style="margin-left: auto; font-size: 11.5px; color: var(--muted); font-weight: 700;"></span>
      </div>

      <div class="scroll-table">
        <table class="styled-table" id="table-perf">
          <thead id="perf-table-head"></thead>
          <tbody id="perf-table-body"></tbody>
        </table>
      </div>
      <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px;">
        <button class="action-btn" id="perf-prev" onclick="changePerfPage(-1)">Previous</button>
        <span id="perf-page-indicator" style="font-size: 11.5px; color: var(--muted); font-weight: 700;">Page 1</span>
        <button class="action-btn" id="perf-next" onclick="changePerfPage(1)">Next</button>
      </div>
    </section>

    <!-- Modal for Enlarged State Scatter Plot -->
    <div id="modal-enlarge-scatter" class="modal-overlay" style="display:none;" onclick="closeScatterModal()">
      <div class="modal-content" onclick="event.stopPropagation()">
        <div class="modal-header">
          <h3 id="modal-scatter-title">Enlarged State Plot</h3>
          <button class="action-btn" onclick="closeScatterModal()" style="color: #0F172A; padding: 3px 10px;">✕ Close</button>
        </div>
        <div style="text-align: center; padding: 16px; overflow: auto; background: #FFFFFF; max-height: calc(95vh - 60px);">
          <img id="modal-scatter-img" src="" style="max-width: 100%; max-height: 82vh; object-fit: contain; border-radius: 6px; box-shadow: 0 4px 14px rgba(0,0,0,0.12);" />
        </div>
      </div>
    </div>
  </main>

  <script>
    const TABLES = {tables_json};
    const EVENT_CHARTS = {event_charts_json};
    const OD_DATA = {od_frequency_json};
    const CONTINUOUS_DATA = {continuous_drawal_json};

    const esc = (v) => String(v ?? '-').replace(/[&<>"']/g, c => ({{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}}[c]));
    const num = (v, digits=1) => v == null || !Number.isFinite(Number(v)) ? '—' : Number(v).toFixed(digits);

    // ==========================================
    // SECTION 1: COLLAPSIBLE EVENT TABLES HANDLERS
    // ==========================================
    function toggleAllEventTables(open) {{
      document.querySelectorAll('.event-table-card').forEach(d => {{
        d.open = open;
      }});
    }}

    function filterEventTableThreshold(thresh) {{
      document.querySelectorAll('.event-table-card').forEach(d => {{
        const t = d.getAttribute('data-thresh');
        if (thresh === 'ALL' || t === thresh) {{
          d.style.display = '';
        }} else {{
          d.style.display = 'none';
        }}
      }});
    }}

    // ==========================================
    // SECTION 2: RENDER STATE SCATTER PLOTS & STATS
    // ==========================================
    function openScatterModal(state) {{
      const imgUri = OD_DATA.plots && OD_DATA.plots[state];
      if (!imgUri) return;
      document.getElementById('modal-scatter-title').textContent = `${{state}} — Overdrawal vs Frequency Analysis (High Resolution)`;
      document.getElementById('modal-scatter-img').src = imgUri;
      document.getElementById('modal-enlarge-scatter').style.display = 'flex';
    }}

    function closeScatterModal() {{
      document.getElementById('modal-enlarge-scatter').style.display = 'none';
    }}
    function initScatterSection() {{
      const container = document.getElementById('scatter-container');
      const states = Object.keys(OD_DATA.plots || {{}});
      if (!states.length) {{
        container.innerHTML = '<div style="grid-column: 1/-1; padding: 24px; text-align: center; color: var(--muted);">No State Overdrawal vs Frequency plots generated. Ensure the uploaded workbook contains FREQUENCY and State schedule/actual columns.</div>';
        return;
      }}
      states.forEach(state => {{
        const isDVC = state === 'DVC';
        const measure = isDVC ? 'Under-injection' : 'Overdrawal';
        const imgUri = OD_DATA.plots[state];
        const statsList = (OD_DATA.stats && OD_DATA.stats[state]) || [];
        
        let tableRowsHtml = '';
        if (statsList.length) {{
          statsList.forEach(row => {{
            tableRowsHtml += `<tr>
              <td class="strong">${{esc(row.threshold)}}</td>
              <td>${{Number(row.total_blocks).toLocaleString()}}</td>
              <td>${{Number(row.positive_blocks).toLocaleString()}} (${{num(row.percentage, 1)}}%)</td>
              <td class="strong">${{num(row.maximum_mw, 1)}} MW</td>
            </tr>`;
          }});
        }} else {{
          tableRowsHtml = '<tr><td colspan="4">Statistics table embedded directly in image below.</td></tr>';
        }}

        const card = document.createElement('div');
        card.className = 'scatter-card';
        card.innerHTML = `
          <div class="scatter-card-header">
            <h4>${{esc(state)}}</h4>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="measure-tag">${{measure}}</span>
              <button class="action-btn" style="padding: 2px 8px; font-size: 11px; color: #17365D;" onclick="openScatterModal('${{esc(state)}}')">🔍 Enlarge</button>
            </div>
          </div>
          <div class="scatter-img-wrap" style="cursor: zoom-in;" onclick="openScatterModal('${{esc(state)}}')" title="Click to enlarge plot">
            <img src="${{imgUri}}" alt="${{esc(state)}} OD vs Frequency" loading="lazy" />
          </div>
          <div class="scatter-table-wrap">
            <h5 style="font-size: 11px; color: var(--muted); margin-bottom: 6px; text-transform: uppercase;">Cumulative Threshold Statistics</h5>
            <table class="styled-table">
              <thead>
                <tr>
                  <th>Frequency Threshold</th>
                  <th>Total 1-min Blocks</th>
                  <th>OD/UI Blocks (No. & %)</th>
                  <th>Maximum OD/UI</th>
                </tr>
              </thead>
              <tbody>
                ${{tableRowsHtml}}
              </tbody>
            </table>
            <div style="margin-top: 10px; display: flex; justify-content: flex-end; gap: 8px;">
              <button class="action-btn" onclick="openScatterModal('${{esc(state)}}')">
                🔍 Enlarge Plot
              </button>
              <a class="action-btn" href="${{imgUri}}" download="${{state.replace(/[^A-Za-z0-9_-]+/g, '_')}}_OD_Frequency.png">
                💾 Download Plot PNG
              </a>
            </div>
          </div>
        `;
        container.appendChild(card);
      }});
    }}

    function downloadStatsExcel() {{
      if (OD_DATA.statistics_base64) {{
        const a = document.createElement('a');
        a.href = OD_DATA.statistics_base64;
        a.download = 'OD_Frequency_Statistics.xlsx';
        a.click();
      }} else {{
        alert('Statistics spreadsheet not available in this session.');
      }}
    }}

    // ==========================================
    // SECTION 3: CONTINUOUS DRAWAL & EVENT OVERDRAWAL PLOTS
    // ==========================================
    const crmsColors = {{
      'alert': '#FACC15',
      'emergency': '#F97316',
      'extreme emergency': '#DC2626',
      'non-compliance': '#111827',
      'noncompliance': '#111827'
    }};
    const crmsOrder = ['Alert', 'Emergency', 'Extreme Emergency', 'Non-compliance'];
    const crmsCategory = (m) => {{
      const raw = Array.isArray(m.category) ? m.category[0] : m.category;
      return String(raw || m.violation_type || 'CRMS Message').trim();
    }};
    const crmsColor = (m) => crmsColors[crmsCategory(m).toLowerCase()] || '#2563EB';
    const crmsSymbol = 'path://M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z';
    const towerSymbol = 'path://M11 1h2l1.4 5H18v2h-3l1 4H20v2h-3.4L19 23h-3l-.8-3H8.8L8 23H5l2.4-9H4v-2h4l1-4H6V6h3.6L11 1zm-.4 7-1 4h4.8l-1-4h-2.8zm-1.5 6-1 4h5.8l-1-4H9.1z';

    function crmsTooltip(m) {{
      let html = `<div style="min-width:240px;font-size:12px;line-height:1.45"><div style="font-weight:900;color:${{crmsColor(m)}};margin-bottom:5px">CRMS Violation: ${{esc(crmsCategory(m))}}</div>`;
      const issued = m.timestamp || m.message_date || '';
      if (issued) html += `<div><span style="color:#64748B">Issue time:</span> <strong>${{esc(issued)}}</strong></div>`;
      if (m.message_no) html += `<div><span style="color:#64748B">Message no:</span> <strong>${{esc(m.message_no)}}</strong></div>`;
      if (Array.isArray(m.issued_to) && m.issued_to.length) html += `<div><span style="color:#64748B">Issued to:</span> <strong>${{esc(m.issued_to.join(', '))}}</strong></div>`;
      if (m.issued_by) html += `<div><span style="color:#64748B">Issued by:</span> ${{esc(m.issued_by)}}</div>`;
      if (m.remarks) html += `<div style="margin-top:5px;font-weight:700;color:#334155">${{esc(m.remarks)}}</div>`;
      return html + '</div>';
    }}

    function transmissionTooltip(ev) {{
      let html = `<div style="min-width:260px;font-size:12px;line-height:1.45"><div style="font-weight:900;color:#0F172A;margin-bottom:5px">⚡ Physical Regulation — Transmission Line</div>`;
      html += `<div style="font-weight:900;color:#1E293B">${{esc(ev.line_name || 'Transmission line')}}</div>`;
      html += `<div><span style="color:#64748B">Time:</span> <strong>${{esc(ev.timestamp || ev.outage_date_time || '-')}}</strong></div>`;
      if (Array.isArray(ev.owners) && ev.owners.length) html += `<div><span style="color:#64748B">Owner(s):</span> <strong>${{esc(ev.owners.join(', '))}}</strong></div>`;
      if (ev.agency_name) html += `<div><span style="color:#64748B">Agency:</span> ${{esc(ev.agency_name)}}</div>`;
      if (ev.reason || ev.remarks) html += `<div style="margin-top:5px;font-weight:700;color:#334155">${{esc(ev.reason || ev.remarks)}}</div>`;
      return html + '</div>';
    }}

    let continuousChart = null;
    let currentContinuousState = 'West Bengal';

    function initContinuousDrawalSection() {{
      const stateSelect = document.getElementById('continuous-state-select');
      const dateSelect = document.getElementById('continuous-date-select');
      const chipsContainer = document.getElementById('continuous-event-chips');
      if (!stateSelect || !CONTINUOUS_DATA.states) return;

      const availableStates = Object.keys(CONTINUOUS_DATA.states || {{}});
      if (!availableStates.length) {{
        document.getElementById('continuous-drawal-container').innerHTML = 
          '<div style="padding: 30px; text-align: center; color: var(--muted); font-size: 13px;">No continuous time-series data available in this session.</div>';
        return;
      }}

      stateSelect.innerHTML = '';
      availableStates.forEach(st => {{
        const opt = document.createElement('option');
        opt.value = st;
        opt.textContent = st;
        if (st.toLowerCase().includes('west bengal')) opt.selected = true;
        stateSelect.appendChild(opt);
      }});
      currentContinuousState = stateSelect.value || availableStates[0];

      dateSelect.innerHTML = '<option value="">Select Date...</option>';
      (CONTINUOUS_DATA.unique_dates || []).forEach(dt => {{
        const opt = document.createElement('option');
        opt.value = dt;
        opt.textContent = dt;
        dateSelect.appendChild(opt);
      }});

      chipsContainer.innerHTML = '';
      const detected = CONTINUOUS_DATA.detected_events || [];
      if (!detected.length) {{
        chipsContainer.innerHTML = '<span style="font-size: 11px; color: #64748B; font-style: italic;">No critical frequency dips (<49.75 Hz or ≥4 min <49.90 Hz) detected.</span>';
      }} else {{
        detected.forEach((ev, evIdx) => {{
          const chip = document.createElement('button');
          chip.type = 'button';
          chip.className = 'event-chip-btn';
          chip.textContent = ev.label || `Dip #${{evIdx + 1}}: ${{ev.start_time.slice(5, 16)}} (Min ${{ev.min_freq}} Hz)`;
          chip.title = `Jump to low-frequency dip from ${{ev.start_time}} to ${{ev.end_time}} (Min: ${{ev.min_freq}} Hz at ${{ev.min_time}})`;
          chip.onclick = () => zoomToEvent(ev, chip);
          chipsContainer.appendChild(chip);
        }});
      }}

      renderContinuousDrawalChart();
    }}

    function onContinuousStateChange() {{
      const stateSelect = document.getElementById('continuous-state-select');
      currentContinuousState = stateSelect.value;
      renderContinuousDrawalChart();
    }}

    function onContinuousDateChange() {{
      const dateSelect = document.getElementById('continuous-date-select');
      const val = dateSelect.value;
      if (!val || !continuousChart) return;
      const timestamps = CONTINUOUS_DATA.timestamps || [];
      const idx = timestamps.findIndex(t => t.startsWith(val));
      if (idx >= 0) {{
        const pointsIn2Days = Math.min(2880, timestamps.length - idx);
        continuousChart.dispatchAction({{
          type: 'dataZoom',
          startValue: idx,
          endValue: idx + pointsIn2Days - 1
        }});
      }}
    }}

    function zoomToEvent(ev, clickedChip) {{
      if (!continuousChart) return;
      document.querySelectorAll('.event-chip-btn').forEach(b => b.classList.remove('active'));
      if (clickedChip) clickedChip.classList.add('active');

      const timestamps = CONTINUOUS_DATA.timestamps || [];
      const total = timestamps.length;
      const sIdx = Math.max(0, (ev.start_idx != null ? ev.start_idx : timestamps.indexOf(ev.start_time)) - 120);
      const eIdx = Math.min(total - 1, (ev.end_idx != null ? ev.end_idx : timestamps.indexOf(ev.end_time)) + 120);
      continuousChart.dispatchAction({{
        type: 'dataZoom',
        startValue: sIdx,
        endValue: eIdx
      }});
    }}

    function resetContinuousZoom() {{
      if (!continuousChart) return;
      document.querySelectorAll('.event-chip-btn').forEach(b => b.classList.remove('active'));
      const timestamps = CONTINUOUS_DATA.timestamps || [];
      const twoDays = Math.min(2880, timestamps.length);
      continuousChart.dispatchAction({{
        type: 'dataZoom',
        startValue: 0,
        endValue: twoDays - 1
      }});
    }}

    function downloadContinuousVisibleWindow() {{
      if (!continuousChart) return;
      const opt = continuousChart.getOption();
      const dz = opt.dataZoom && opt.dataZoom[0];
      const timestamps = CONTINUOUS_DATA.timestamps || [];
      let startTs = (timestamps[0] || '').slice(0, 10);
      if (dz && dz.startValue != null && timestamps[dz.startValue]) {{
        startTs = timestamps[dz.startValue].slice(0, 10);
      }}
      const dataUrl = continuousChart.getDataURL({{
        pixelRatio: 3,
        backgroundColor: '#FFFFFF',
        excludeComponents: ['dataZoom']
      }});
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `${{currentContinuousState.replace(/[^A-Za-z0-9_-]+/g, '_')}}_Drawal_vs_Frequency_${{startTs}}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }}

    function renderContinuousDrawalChart() {{
      const chartEl = document.getElementById('continuous-drawal-chart');
      if (!chartEl) return;
      if (continuousChart) {{
        continuousChart.dispose();
      }}
      continuousChart = echarts.init(chartEl);

      const stateName = currentContinuousState;
      const stData = (CONTINUOUS_DATA.states && CONTINUOUS_DATA.states[stateName]) || {{}};
      const timestamps = CONTINUOUS_DATA.timestamps || [];
      const schedule = stData.schedule || [];
      const actual = stData.actual || [];
      const deviation = stData.deviation || [];
      const frequency = CONTINUOUS_DATA.frequency || [];
      const lowFreqIntervals = CONTINUOUS_DATA.low_freq_intervals || [];

      document.getElementById('continuous-chart-title').textContent = 
        `${{stateName}}: schedule, actual drawal and over drawal vs frequency`;

      const overDrawal = deviation.map(v => (v != null && v > 0) ? v : 0);
      const underDrawal = deviation.map(v => (v != null && v < 0) ? v : 0);

      const crmsPoints = [];
      const crmsMessages = stData.crms_messages || [];
      crmsMessages.forEach((m, mIdx) => {{
        const mTs = (m.timestamp || m.message_date || '').slice(0, 16);
        const idx = timestamps.indexOf(mTs);
        if (idx >= 0) {{
          const yVal = (deviation[idx] ?? 0) + ((mIdx % 5) - 2) * 20;
          crmsPoints.push({{
            value: [mTs, yVal],
            crms: m,
            itemStyle: {{ color: crmsColor(m), borderColor: '#FFFFFF', borderWidth: 1.5 }}
          }});
        }}
      }});

      const transPoints = [];
      const transmissionEvents = stData.transmission_line_events || [];
      transmissionEvents.forEach((ev, eIdx) => {{
        const evTs = (ev.timestamp || ev.outage_date_time || '').slice(0, 16);
        const idx = timestamps.indexOf(evTs);
        if (idx >= 0) {{
          const yVal = (deviation[idx] ?? 0) + ((eIdx % 4) - 1.5) * 25;
          transPoints.push({{
            value: [evTs, yVal],
            transmission: ev
          }});
        }}
      }});

      const markAreaData = lowFreqIntervals.map(i => [
        {{ xAxis: i[0].xAxis, itemStyle: {{ color: 'rgba(254, 226, 226, 0.45)' }} }},
        {{ xAxis: i[1].xAxis }}
      ]);

      const totalPoints = timestamps.length;
      const twoDaysPoints = Math.min(2880, totalPoints);
      const defaultEndPct = totalPoints > 0 ? (twoDaysPoints / totalPoints) * 100 : 100;

      const option = {{
        animation: false,
        title: {{
          text: `${{stateName}}: schedule, actual drawal and over drawal vs frequency`,
          left: 75,
          top: 6,
          textStyle: {{ fontSize: 15, fontWeight: 900, color: '#0F172A' }}
        }},
        tooltip: {{
          trigger: 'axis',
          axisPointer: {{
            type: 'cross',
            link: [{{ xAxisIndex: 'all' }}],
            label: {{ backgroundColor: '#17365D' }}
          }},
          formatter: function(params) {{
            const list = Array.isArray(params) ? params : [params];
            if (!list.length) return '';
            const t = list[0].axisValue || '';

            const crmsItem = list.find(item => item.data && item.data.crms);
            const transItem = list.find(item => item.data && item.data.transmission);

            let html = `<div style="font-size: 11.5px; line-height: 1.45; min-width: 220px;">`;
            html += `<div style="font-weight: 800; color: #17365D; border-bottom: 1px solid #E2E8F0; padding-bottom: 4px; margin-bottom: 5px;">${{esc(t)}} IST</div>`;

            if (crmsItem) {{
              html += crmsTooltip(crmsItem.data.crms);
              html += `<div style="border-top: 1px dashed #E2E8F0; margin-top: 6px; padding-top: 4px;"></div>`;
            }}
            if (transItem) {{
              html += transmissionTooltip(transItem.data.transmission);
              html += `<div style="border-top: 1px dashed #E2E8F0; margin-top: 6px; padding-top: 4px;"></div>`;
            }}

            list.forEach(p => {{
              if (['Over drawal', 'Under drawal', 'CRMS Violation Messages', 'Physical Regulation (Line)', 'markArea'].includes(p.seriesName)) return;
              const val = Array.isArray(p.value) ? p.value[1] : p.value;
              if (val != null) {{
                const formatted = p.seriesName.includes('Frequency') ? Number(val).toFixed(3) + ' Hz' : Number(val).toFixed(1) + ' MW';
                html += `<div style="display:flex; justify-content:space-between; gap:12px;">
                  <span>${{p.marker}} <strong>${{esc(p.seriesName)}}:</strong></span>
                  <span style="font-weight: 800;">${{formatted}}</span>
                </div>`;
              }}
            }});
            html += `</div>`;
            return html;
          }}
        }},
        legend: [
          {{
            top: 28,
            left: 75,
            data: ['Schedule (MW)', 'Actual drawal (MW)'],
            textStyle: {{ fontSize: 11, fontWeight: 700, color: '#334155' }}
          }},
          {{
            top: '35.5%',
            left: 75,
            data: ['Over drawal', 'Under drawal'],
            textStyle: {{ fontSize: 11, fontWeight: 700, color: '#334155' }}
          }}
        ],
        axisPointer: {{
          link: [{{ xAxisIndex: 'all' }}]
        }},
        grid: [
          {{ left: 75, right: 35, top: 52, height: '24%' }},
          {{ left: 75, right: 35, top: '38%', height: '24%' }},
          {{ left: 75, right: 35, top: '69%', height: '17%' }}
        ],
        xAxis: [
          {{
            type: 'category',
            gridIndex: 0,
            boundaryGap: false,
            data: timestamps,
            axisLabel: {{ show: false }},
            axisTick: {{ show: false }},
            axisLine: {{ lineStyle: {{ color: '#94A3B8' }} }}
          }},
          {{
            type: 'category',
            gridIndex: 1,
            boundaryGap: false,
            data: timestamps,
            axisLabel: {{ show: false }},
            axisTick: {{ show: false }},
            axisLine: {{ lineStyle: {{ color: '#94A3B8' }} }}
          }},
          {{
            type: 'category',
            gridIndex: 2,
            boundaryGap: false,
            data: timestamps,
            axisLabel: {{
              show: true,
              fontSize: 10,
              formatter: (t) => t.slice(11, 16)
            }},
            axisTick: {{ show: true }},
            axisLine: {{ lineStyle: {{ color: '#94A3B8' }} }}
          }}
        ],
        yAxis: [
          {{
            type: 'value',
            gridIndex: 0,
            name: 'Drawal (MW)',
            nameTextStyle: {{ fontWeight: 800, color: '#0F172A', fontSize: 11 }},
            axisLabel: {{ fontSize: 10 }},
            splitLine: {{ lineStyle: {{ color: '#E2E8F0', type: 'dashed' }} }}
          }},
          {{
            type: 'value',
            gridIndex: 1,
            name: 'Deviation (MW)',
            nameTextStyle: {{ fontWeight: 800, color: '#0F172A', fontSize: 11 }},
            axisLabel: {{ fontSize: 10 }},
            splitLine: {{ lineStyle: {{ color: '#E2E8F0', type: 'dashed' }} }}
          }},
          {{
            type: 'value',
            gridIndex: 2,
            name: 'Frequency (Hz)',
            nameTextStyle: {{ fontWeight: 800, color: '#0F172A', fontSize: 11 }},
            scale: true,
            min: 49.40,
            max: 50.35,
            axisLabel: {{ fontSize: 10, formatter: v => v.toFixed(2) }},
            splitLine: {{ lineStyle: {{ color: '#E2E8F0', type: 'dashed' }} }}
          }}
        ],
        dataZoom: [
          {{
            type: 'inside',
            xAxisIndex: [0, 1, 2],
            start: 0,
            end: defaultEndPct
          }},
          {{
            type: 'slider',
            xAxisIndex: [0, 1, 2],
            bottom: 8,
            height: 20,
            start: 0,
            end: defaultEndPct
          }}
        ],
        series: [
          {{
            name: 'Schedule (MW)',
            type: 'line',
            xAxisIndex: 0,
            yAxisIndex: 0,
            data: schedule,
            step: 'end',
            showSymbol: false,
            lineStyle: {{ width: 2, color: '#0F172A' }},
            itemStyle: {{ color: '#0F172A' }},
            markArea: {{
              silent: true,
              data: markAreaData
            }}
          }},
          {{
            name: 'Actual drawal (MW)',
            type: 'line',
            xAxisIndex: 0,
            yAxisIndex: 0,
            data: actual,
            showSymbol: false,
            lineStyle: {{ width: 2, color: '#DC2626' }},
            itemStyle: {{ color: '#DC2626' }}
          }},
          {{
            name: 'Over drawal',
            type: 'line',
            xAxisIndex: 1,
            yAxisIndex: 1,
            data: overDrawal,
            showSymbol: false,
            lineStyle: {{ width: 0 }},
            itemStyle: {{ color: '#EF4444' }},
            areaStyle: {{ color: 'rgba(239, 68, 68, 0.45)', origin: 0 }},
            markArea: {{
              silent: true,
              data: markAreaData
            }}
          }},
          {{
            name: 'Under drawal',
            type: 'line',
            xAxisIndex: 1,
            yAxisIndex: 1,
            data: underDrawal,
            showSymbol: false,
            lineStyle: {{ width: 0 }},
            itemStyle: {{ color: '#3B82F6' }},
            areaStyle: {{ color: 'rgba(59, 130, 246, 0.38)', origin: 0 }}
          }},
          {{
            name: 'Deviation (MW)',
            type: 'line',
            xAxisIndex: 1,
            yAxisIndex: 1,
            data: deviation,
            showSymbol: false,
            lineStyle: {{ width: 1.4, color: '#334155' }},
            itemStyle: {{ color: '#334155' }},
            markLine: {{
              silent: true,
              symbol: 'none',
              data: [{{ yAxis: 0 }}],
              lineStyle: {{ color: '#0F172A', width: 1.5 }}
            }}
          }},
          {{
            name: 'CRMS Violation Messages',
            type: 'scatter',
            xAxisIndex: 1,
            yAxisIndex: 1,
            data: crmsPoints,
            symbol: crmsSymbol,
            symbolSize: 22,
            itemStyle: {{
              borderColor: '#FFFFFF',
              borderWidth: 1.5,
              shadowColor: 'rgba(0,0,0,0.3)',
              shadowBlur: 6
            }},
            emphasis: {{ scale: 1.4 }},
            z: 15
          }},
          {{
            name: 'Physical Regulation (Line)',
            type: 'scatter',
            xAxisIndex: 1,
            yAxisIndex: 1,
            data: transPoints,
            symbol: towerSymbol,
            symbolSize: 24,
            itemStyle: {{
              color: '#0F172A',
              borderColor: '#FACC15',
              borderWidth: 1.5,
              shadowColor: 'rgba(250,204,21,0.8)',
              shadowBlur: 8
            }},
            emphasis: {{ scale: 1.45 }},
            z: 16
          }},
          {{
            name: 'Frequency (Hz)',
            type: 'line',
            xAxisIndex: 2,
            yAxisIndex: 2,
            data: frequency,
            showSymbol: false,
            lineStyle: {{ width: 1.8, color: '#2563EB' }},
            itemStyle: {{ color: '#2563EB' }},
            markLine: {{
              silent: true,
              symbol: 'none',
              data: [
                {{ yAxis: 50.05, lineStyle: {{ color: '#64748B', type: 'dotted', width: 1 }}, label: {{ formatter: '50.05', position: 'insideStartTop' }} }},
                {{ yAxis: 49.90, lineStyle: {{ color: '#0F172A', type: 'dashed', width: 1.5 }}, label: {{ formatter: '49.90', position: 'insideStartTop' }} }},
                {{ yAxis: 49.50, lineStyle: {{ color: '#DC2626', type: 'dashed', width: 1.5 }}, label: {{ formatter: '49.50', position: 'insideStartTop' }} }}
              ]
            }},
            markArea: {{
              silent: true,
              data: markAreaData
            }}
          }}
        ]
      }};

      continuousChart.setOption(option);
      updateContinuousFootnote();

      continuousChart.on('datazoom', function() {{
        updateContinuousFootnote();
      }});
    }}

    function updateContinuousFootnote() {{
      if (!continuousChart) return;
      const opt = continuousChart.getOption();
      const dz = opt.dataZoom && opt.dataZoom[0];
      const timestamps = CONTINUOUS_DATA.timestamps || [];
      const total = timestamps.length;
      if (!total) return;

      let sIdx = 0;
      let eIdx = total - 1;
      if (dz) {{
        if (dz.startValue != null && dz.endValue != null) {{
          sIdx = Math.max(0, Math.min(dz.startValue, total - 1));
          eIdx = Math.max(sIdx, Math.min(dz.endValue, total - 1));
        }} else if (dz.start != null && dz.end != null) {{
          sIdx = Math.max(0, Math.min(Math.floor((dz.start / 100) * total), total - 1));
          eIdx = Math.max(sIdx, Math.min(Math.ceil((dz.end / 100) * total), total - 1));
        }}
      }}

      const stateName = currentContinuousState;
      const stData = (CONTINUOUS_DATA.states && CONTINUOUS_DATA.states[stateName]) || {{}};
      const dev = stData.deviation || [];
      const freq = CONTINUOUS_DATA.frequency || [];

      let lowCount = 0;
      let odCount = 0;
      let maxOd = 0;

      for (let i = sIdx; i <= eIdx; i++) {{
        const f = freq[i];
        const d = dev[i];
        if (f != null && f <= 49.90) {{
          lowCount++;
          if (d != null && d > 0) {{
            odCount++;
            if (d > maxOd) maxOd = d;
          }}
        }}
      }}

      document.getElementById('stat-od-min').textContent = odCount.toLocaleString();
      document.getElementById('stat-low-min').textContent = lowCount.toLocaleString();
      document.getElementById('stat-max-od').textContent = maxOd > 0 ? Math.round(maxOd).toLocaleString() : '0';
      document.getElementById('stat-visible-range').textContent = 
        `Visible Window: ${{timestamps[sIdx] || ''}} to ${{timestamps[eIdx] || ''}} (${{eIdx - sIdx + 1}} min)`;
    }}

    // ==========================================
    // SECTION 3.2: RENDER DISCRETE EVENT CHARTS
    // ==========================================
    let eventChartInstances = [];

    function initEventCharts() {{
      const stateSelect = document.getElementById('event-state-filter');
      const slotSelect = document.getElementById('event-slot-filter');
      const states = [...new Set(EVENT_CHARTS.map(e => e.state))].sort();
      const slots = [...new Set(EVENT_CHARTS.map(e => e.event_index))].sort((a,b) => a-b);

      states.forEach(s => {{
        const opt = document.createElement('option');
        opt.value = s;
        opt.textContent = s;
        stateSelect.appendChild(opt);
      }});

      slots.forEach(s => {{
        const ev = EVENT_CHARTS.find(e => e.event_index === s);
        let label = 'Event ' + s;
        if (ev && ev.start_time) {{
          const dt = ev.start_time.slice(0, 10);
          const t1 = ev.start_time.slice(11, 16);
          const t2 = ev.end_time ? ev.end_time.slice(11, 16) : '';
          label = `Event ${{s}} (${{dt}} ${{t1}}${{t2 ? '–' + t2 : ''}})`;
        }}
        const opt = document.createElement('option');
        opt.value = s;
        opt.textContent = label;
        slotSelect.appendChild(opt);
      }});

      renderEventCards();
    }}

    function renderEventCards() {{
      const container = document.getElementById('event-cards-container');
      const stateFilter = document.getElementById('event-state-filter').value;
      const slotFilter = document.getElementById('event-slot-filter').value;

      eventChartInstances.forEach(c => c.dispose());
      eventChartInstances = [];
      container.innerHTML = '';

      const filtered = EVENT_CHARTS.filter(e => {{
        if (stateFilter !== 'ALL' && e.state !== stateFilter) return false;
        if (slotFilter !== 'ALL' && String(e.event_index) !== slotFilter) return false;
        return true;
      }});

      document.getElementById('event-filter-count').textContent = `Showing ${{filtered.length}} of ${{EVENT_CHARTS.length}} event curves`;

      if (!filtered.length) {{
        container.innerHTML = '<div style="padding: 24px; text-align: center; color: var(--muted);">No matching event curves for the selected filter.</div>';
        return;
      }}

      filtered.forEach((event, idx) => {{
        const card = document.createElement('details');
        card.className = 'event-card';
        card.open = true;

        const timestamps = event.series.timestamps || [];
        const deviation = event.series.deviation || [];
        const frequency = event.series.frequency || [];

        let maxOd = -Infinity;
        let maxOdIdx = -1;
        let lowestFreq = Infinity;
        let lowestFreqIdx = -1;

        deviation.forEach((val, i) => {{
          if (val != null && val > maxOd) {{ maxOd = val; maxOdIdx = i; }}
        }});
        frequency.forEach((val, i) => {{
          if (val != null && val < lowestFreq) {{ lowestFreq = val; lowestFreqIdx = i; }}
        }});

        const odAtLowestFreq = lowestFreqIdx >= 0 ? deviation[lowestFreqIdx] : null;
        const crmsCount = (event.crms_messages || []).length;
        const regCount = (event.transmission_line_events || []).length;

        card.innerHTML = `
          <summary>
            <span>${{esc(event.state)}} — ${{esc(event.event_name)}}</span>
            <span style="font-size: 11px; color: var(--muted);">${{esc(event.start_time)}} to ${{esc(event.end_time)}}</span>
          </summary>
          <div class="event-card-body">
            <div class="event-results">
              <div class="result-tile">
                <b>Maximum OD</b>
                <strong>${{maxOdIdx >= 0 ? num(maxOd, 0) + ' MW' : '—'}}</strong>
                <small>${{maxOdIdx >= 0 ? timestamps[maxOdIdx].slice(11, 19) : '-'}}</small>
              </div>
              <div class="result-tile">
                <b>OD at Lowest Frequency</b>
                <strong>${{odAtLowestFreq != null ? num(odAtLowestFreq, 0) + ' MW' : '—'}}</strong>
                <small>${{lowestFreqIdx >= 0 ? num(lowestFreq, 3) + ' Hz' : '-'}}</small>
              </div>
              <div class="result-tile">
                <b>CRMS Messages</b>
                <strong>${{crmsCount}}</strong>
                <small>Violation notices issued</small>
              </div>
              <div class="result-tile">
                <b>Physical Regulations</b>
                <strong>${{regCount}}</strong>
                <small>Transmission lines</small>
              </div>
            </div>
            <div class="event-chart" id="echart-${{idx}}"></div>
          </div>
        `;
        container.appendChild(card);

        // Initialize ECharts for this card
        setTimeout(() => {{
          const el = document.getElementById(`echart-${{idx}}`);
          if (!el) return;
          const chart = echarts.init(el);
          eventChartInstances.push(chart);

          const maxDev = Math.max(100, ...deviation.filter(v => v != null).map(v => Math.abs(v)));
          const extent = Math.ceil(maxDev / 100) * 100;

          const positiveShade = deviation.map((v, i) => frequency[i] < 49.9 && v != null && v > 0 ? v : 0);
          const negativeShade = deviation.map((v, i) => frequency[i] < 49.9 && v != null && v < 0 ? v : 0);
          const freqDipArea = frequency.map(f => (f != null && f < 49.9) ? f : 49.9);

          const crmsSeriesList = [];
          const crmsGroups = new Map();
          (event.crms_messages || []).forEach((m, mIdx) => {{
            const mTs = (m.timestamp || m.message_date || '').slice(11, 16);
            const nearestIdx = timestamps.map(t => t.slice(11, 16)).indexOf(mTs);
            const cat = crmsCategory(m);
            if (!crmsGroups.has(cat)) crmsGroups.set(cat, []);
            const yVal = nearestIdx >= 0 ? (deviation[nearestIdx] ?? 0) + ((mIdx % 5) - 2) * Math.max(extent * 0.03, 10) : 0;
            crmsGroups.get(cat).push({{
              value: [mTs, yVal],
              crms: m
            }});
          }});

          Array.from(crmsGroups.entries()).forEach(([cat, points]) => {{
            crmsSeriesList.push({{
              name: `CRMS: ${{cat}}`,
              type: 'scatter',
              yAxisIndex: 0,
              data: points,
              symbol: crmsSymbol,
              symbolSize: 22,
              itemStyle: {{
                color: crmsColor({{ category: cat }}),
                borderColor: '#FFFFFF',
                borderWidth: 1.5,
                shadowColor: 'rgba(0,0,0,0.3)',
                shadowBlur: 6
              }},
              emphasis: {{ scale: 1.4 }},
              tooltip: {{
                trigger: 'item',
                formatter: params => crmsTooltip(params.data && params.data.crms || {{}})
              }},
              z: 20
            }});
          }});

          const transMarkers = [];
          (event.transmission_line_events || []).forEach((pe, eIdx) => {{
            const peTs = (pe.timestamp || pe.outage_date_time || '').slice(11, 16);
            const nearestIdx = timestamps.map(t => t.slice(11, 16)).indexOf(peTs);
            const yVal = nearestIdx >= 0 ? (deviation[nearestIdx] ?? 0) + ((eIdx % 4) - 1.5) * Math.max(extent * 0.035, 12) : 0;
            transMarkers.push({{
              value: [peTs, yVal],
              transmission: pe
            }});
          }});

          const transSeries = transMarkers.length ? [{{
            name: 'Physical Regulation (Line)',
            type: 'scatter',
            yAxisIndex: 0,
            data: transMarkers,
            symbol: towerSymbol,
            symbolSize: 24,
            itemStyle: {{
              color: '#0F172A',
              borderColor: '#FACC15',
              borderWidth: 1.5,
              shadowColor: 'rgba(250,204,21,0.8)',
              shadowBlur: 8
            }},
            emphasis: {{ scale: 1.45 }},
            tooltip: {{
              trigger: 'item',
              formatter: params => transmissionTooltip(params.data && params.data.transmission || {{}})
            }},
            z: 22
          }}] : [];

          chart.setOption({{
            animation: false,
            tooltip: {{
              trigger: 'axis',
              axisPointer: {{ type: 'cross' }},
              formatter: params => {{
                const list = Array.isArray(params) ? params : [params];
                const msgParam = list.find(item => item.data && item.data.crms);
                if (msgParam) return crmsTooltip(msgParam.data.crms);
                const transParam = list.find(item => item.data && item.data.transmission);
                if (transParam) return transmissionTooltip(transParam.data.transmission);
                let html = `<div style="font-size:12px;font-weight:800;margin-bottom:5px;color:#17365D;">${{esc(list[0] && list[0].axisValue || '')}}</div>`;
                list.forEach(item => {{
                  if (item.value == null || item.seriesName.includes('Overdrawal') || item.seriesName.includes('Helping Grid') || item.seriesName.includes('CRMS:') || item.seriesName.includes('Physical Regulation')) return;
                  const value = Array.isArray(item.value) ? item.value[1] : item.value;
                  html += `<div>${{item.marker}} ${{esc(item.seriesName)}}: <strong>${{Number(value).toFixed(item.seriesName.includes('Frequency') ? 3 : 1)}}</strong></div>`;
                }});
                return html;
              }}
            }},
            legend: {{ top: 4, textStyle: {{ fontSize: 11, fontWeight: 700 }} }},
            grid: {{ top: 45, left: 65, right: 65, bottom: 55 }},
            dataZoom: [{{ type: 'inside' }}, {{ type: 'slider', height: 20, bottom: 10 }}],
            xAxis: {{
              type: 'category',
              boundaryGap: false,
              data: timestamps.map(t => t.slice(11, 16)),
              axisLabel: {{ fontSize: 10 }}
            }},
            yAxis: [
              {{
                type: 'value',
                name: 'Deviation (MW)',
                min: -extent,
                max: extent,
                axisLabel: {{ fontSize: 10 }}
              }},
              {{
                type: 'value',
                name: 'Frequency (Hz)',
                min: 49.4,
                max: 50.6,
                position: 'right',
                axisLabel: {{ fontSize: 10, color: '#7C3AED' }},
                nameTextStyle: {{ color: '#7C3AED' }}
              }}
            ],
            series: [
              {{
                name: 'Overdrawal (f < 49.9 Hz)',
                type: 'line',
                data: positiveShade,
                yAxisIndex: 0,
                symbol: 'none',
                lineStyle: {{ width: 0 }},
                areaStyle: {{ color: 'rgba(234,179,8,0.35)', origin: 0 }}
              }},
              {{
                name: 'Helping Grid (f < 49.9 Hz)',
                type: 'line',
                data: negativeShade,
                yAxisIndex: 0,
                symbol: 'none',
                lineStyle: {{ width: 0 }},
                areaStyle: {{ color: 'rgba(6,182,212,0.30)', origin: 0 }}
              }},
              {{
                name: `${{event.state}} Deviation`,
                type: 'line',
                data: deviation,
                yAxisIndex: 0,
                symbol: 'none',
                lineStyle: {{ width: 2.5, color: '#059669' }}
              }},
              {{
                name: 'Frequency Dip (<49.90 Hz)',
                type: 'line',
                data: freqDipArea,
                yAxisIndex: 1,
                symbol: 'none',
                lineStyle: {{ width: 0 }},
                areaStyle: {{
                  color: 'rgba(220, 38, 38, 0.28)',
                  origin: 49.9
                }},
                z: 1
              }},
              {{
                name: 'Frequency (Hz)',
                type: 'line',
                data: frequency,
                yAxisIndex: 1,
                symbol: 'none',
                lineStyle: {{ width: 2, color: '#7C3AED' }},
                markLine: {{
                  silent: true,
                  symbol: 'none',
                  data: [
                    {{ yAxis: 49.9, lineStyle: {{ color: '#DC2626', type: 'dashed' }}, label: {{ formatter: '49.90 Hz' }} }},
                    {{ yAxis: 49.7, lineStyle: {{ color: '#EA580C', type: 'dashed' }}, label: {{ formatter: '49.70 Hz' }} }},
                    {{ yAxis: 49.5, lineStyle: {{ color: '#991B1B', type: 'dashed' }}, label: {{ formatter: '49.50 Hz' }} }}
                  ]
                }}
              }},
              ...crmsSeriesList,
              ...transSeries
            ]
          }});
        }}, 50);
      }});
    }}

    function filterEventCharts() {{
      renderEventCards();
    }}

    // ==========================================
    // SECTION 4: RENDER EVENT CHRONOLOGY TABLE
    // ==========================================
    let chronoPage = 0;
    const CHRONO_PAGE_SIZE = 50;

    function getChronologyData() {{
      const chronoTable = TABLES.find(t => t.title === 'Daily Event Chronology');
      return chronoTable ? chronoTable.rows : [];
    }}

    function renderChronologyTable() {{
      const allRows = getChronologyData();
      const stateSelect = document.getElementById('chronology-state');
      if (stateSelect && stateSelect.options.length <= 1) {{
        const states = [...new Set(allRows.map(r => r.state || r.entity).filter(Boolean))].sort();
        states.forEach(st => {{
          const opt = document.createElement('option');
          opt.value = st;
          opt.textContent = st;
          stateSelect.appendChild(opt);
        }});
      }}
      const stateVal = stateSelect ? stateSelect.value : 'ALL';
      const dateVal = document.getElementById('chronology-date').value;
      const searchVal = document.getElementById('chronology-search').value.toLowerCase();

      const filtered = allRows.filter(r => {{
        if (stateVal && stateVal !== 'ALL' && (r.state || r.entity) !== stateVal) return false;
        if (dateVal && r.date !== dateVal) return false;
        if (searchVal) {{
          const text = [r.state, r.entity, r.message_details, r.message_no, r.message_type].join(' ').toLowerCase();
          if (!text.includes(searchVal)) return false;
        }}
        return true;
      }});

      document.getElementById('chronology-count').textContent = `${{filtered.length}} matching rows`;
      const totalPages = Math.ceil(filtered.length / CHRONO_PAGE_SIZE) || 1;
      if (chronoPage >= totalPages) chronoPage = 0;
      document.getElementById('chrono-page-indicator').textContent = `Page ${{chronoPage + 1}} of ${{totalPages}}`;

      const slice = filtered.slice(chronoPage * CHRONO_PAGE_SIZE, (chronoPage + 1) * CHRONO_PAGE_SIZE);
      const tbody = document.getElementById('chronology-body');

      if (!slice.length) {{
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:16px;">No chronology records matching filters.</td></tr>';
        return;
      }}

      tbody.innerHTML = slice.map(r => `
        <tr>
          <td>${{esc(r.date)}}</td>
          <td>${{esc(r.event)}}</td>
          <td>${{esc(r.timestamp)}}</td>
          <td class="strong">${{esc(r.state || r.entity)}}</td>
          <td>${{num(r.frequency_hz, 3)}}</td>
          <td class="strong">${{num(r.deviation_mw, 0)}}</td>
          <td><span class="tag alert">${{esc(r.message_type)}}</span></td>
          <td>${{esc(r.message_no)}}</td>
          <td style="text-align:left;max-width:320px;">${{esc(r.message_details)}}</td>
        </tr>
      `).join('');
    }}

    function changeChronoPage(delta) {{
      const allRows = getChronologyData();
      const totalPages = Math.ceil(allRows.length / CHRONO_PAGE_SIZE) || 1;
      chronoPage = Math.max(0, Math.min(totalPages - 1, chronoPage + delta));
      renderChronologyTable();
    }}

    // ==========================================
    // SECTION 5: RENDER PERFORMANCE & OTHER TABLES
    // ==========================================
    let perfPage = 0;
    const PERF_PAGE_SIZE = 100;

    function initPerfSection() {{
      const select = document.getElementById('perf-table-select');
      select.innerHTML = '';
      TABLES.forEach((t, i) => {{
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = t.title;
        select.appendChild(opt);
      }});
      renderPerfTable();
    }}

    function renderPerfTable() {{
      const select = document.getElementById('perf-table-select');
      const table = TABLES[Number(select.value) || 0];
      if (!table) return;

      const totalRows = table.rows.length;
      document.getElementById('perf-table-count').textContent = `${{totalRows}} total rows`;
      const totalPages = Math.ceil(totalRows / PERF_PAGE_SIZE) || 1;
      if (perfPage >= totalPages) perfPage = 0;
      document.getElementById('perf-page-indicator').textContent = `Page ${{perfPage + 1}} of ${{totalPages}}`;

      const thead = document.getElementById('perf-table-head');
      const tbody = document.getElementById('perf-table-body');

      thead.innerHTML = '<tr>' + table.columns.map(([, label]) => `<th>${{esc(label)}}</th>`).join('') + '</tr>';

      const slice = table.rows.slice(perfPage * PERF_PAGE_SIZE, (perfPage + 1) * PERF_PAGE_SIZE);
      if (!slice.length) {{
        tbody.innerHTML = `<tr><td colspan="${{table.columns.length}}" style="text-align:center;padding:16px;">No data available.</td></tr>`;
        return;
      }}

      tbody.innerHTML = slice.map(row => `
        <tr>
          ${{table.columns.map(([key]) => `<td>${{esc(row[key])}}</td>`).join('')}}
        </tr>
      `).join('');
    }}

    function changePerfPage(delta) {{
      const select = document.getElementById('perf-table-select');
      const table = TABLES[Number(select.value) || 0];
      if (!table) return;
      const totalPages = Math.ceil(table.rows.length / PERF_PAGE_SIZE) || 1;
      perfPage = Math.max(0, Math.min(totalPages - 1, perfPage + delta));
      renderPerfTable();
    }}

    function downloadCurrentTableCsv() {{
      const select = document.getElementById('perf-table-select');
      const table = TABLES[Number(select.value) || 0];
      if (!table) return;

      const cell = v => {{
        let text = String(v ?? '');
        if (/^[=+@-]/.test(text)) text = "'" + text;
        return '"' + text.replace(/"/g, '""') + '"';
      }};

      const csv = '\\uFEFF' + [
        table.columns.map(([, l]) => cell(l)).join(','),
        ...table.rows.map(r => table.columns.map(([k]) => cell(r[k])).join(','))
      ].join('\\r\\n');

      const blob = new Blob([csv], {{ type: 'text/csv;charset=utf-8' }});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = table.title.replace(/[^A-Za-z0-9_-]+/g, '_') + '.csv';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    }}

    function downloadSelf() {{
      const blob = new Blob(['<!doctype html>' + document.documentElement.outerHTML], {{ type: 'text/html;charset=utf-8' }});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Consolidated_Frequency_Analysis.html';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    }}

    window.__EVENT_TABLES_EXCEL_B64__ = "{excel_base64}";
    function downloadEventTablesExcel() {{
      const b64 = window.__EVENT_TABLES_EXCEL_B64__;
      if (!b64) {{
        alert("Event tables Excel is not available for this session.");
        return;
      }}
      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {{
        bytes[i] = binary.charCodeAt(i);
      }}
      const blob = new Blob([bytes], {{ type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }});
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Frequency_Event_Analysis_Tables.xlsx";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    }}

    window.addEventListener('resize', () => {{
      if (continuousChart) continuousChart.resize();
      eventChartInstances.forEach(c => c.resize());
    }});

    // Initialize all sections
    initScatterSection();
    initContinuousDrawalSection();
    initEventCharts();
    renderChronologyTable();
    initPerfSection();
  </script>
</body>
</html>'''


def export_compact(payload, user):
    session, result = sessions.get_result(payload.session_token, payload.result_token, user)
    if payload.format not in {'html', 'xlsx', 'pdf', 'docx'}:
        raise ValueError('Choose HTML, PDF, Excel or Word.')
    if any(g not in sessions.GROUPS for g in payload.performance_groups):
        raise ValueError('Invalid performance group.')

    tables, warnings = report_tables(session, result, payload)
    title = ('High' if result.get('event_type') == 'high' else 'Low') + ' Frequency Analysis'

    # Retrieve or generate OD vs Frequency scatter plots
    od_frequency = session.get('od_frequency')
    if not od_frequency and session.get('raw_bytes'):
        from services.od_frequency_report import generate_od_frequency_plots, format_period_label
        try:
            summary = (result or {}).get('summary') or {}
            title_period = None
            if summary.get('analysis_start') and summary.get('analysis_end'):
                title_period = format_period_label(summary['analysis_start'], summary['analysis_end'])
            od_frequency = generate_od_frequency_plots(session['raw_bytes'], dpi=300, title_period=title_period)
            session['od_frequency'] = od_frequency
        except Exception as exc:
            warnings.append(f"State Overdrawal plots: {exc}")

    event = {
        'event_name': title,
        'start_time': result['summary']['analysis_start'],
        'end_time': result['summary']['analysis_end'],
        'lowest_frequency': result['summary']['minimum_frequency'],
        'period_reports': tables,
        'warnings': list(dict.fromkeys([*result['warnings'], *warnings])),
        'calculation_note': result['calculation_note']
    }
    event['state_reports'] = {
        e['display_name']: [(name, columns, [row for row in rows if row.get('entity', row.get('state')) == e['display_name']]) for name, columns, rows in tables if name.startswith('State ') or name == 'Daily Event Chronology']
        for e in session['dataset']['entities'] if e['group'] == 'State'
    }
    options = {
        'supplemental_events': [event],
        'include_existing_sections': False,
        'include_entity_performance': False,
        'include_chronology': False,
        'include_analysis_summary': False,
        'report_title': title,
        'rows': []
    }

    if payload.format == 'html':
        event_charts_data = build_event_charts_data(session, result)
        event_tables_data = None
        try:
            from services.frequency_event_tables import generate_frequency_event_tables, generate_event_tables_excel
            raw_source = session.get('raw_bytes')
            if not raw_source:
                dataset = session.get('dataset', {})
                import pandas as pd
                df = pd.DataFrame({
                    'DATETIME_PARSED': pd.to_datetime(dataset.get('times', []), unit='s'),
                    'FREQUENCY': dataset.get('frequency', [])
                })
                for ent in dataset.get('entities', []):
                    name = ent.get('display_name', '')
                    if 'actual' in ent: df[f"{name.upper()} ACTUAL"] = ent['actual']
                    if 'schedule' in ent: df[f"{name.upper()} SCHEDULE"] = ent['schedule']
                raw_source = df
            
            start_date = (result.get('summary') or {}).get('analysis_start')
            end_date = (result.get('summary') or {}).get('analysis_end')
            
            event_tables_data = generate_frequency_event_tables(
                source=raw_source,
                start_date=start_date,
                end_date=end_date,
                thresholds=[49.5, 49.7, 49.9],
                constituents=["Bihar", "Jharkhand", "Odisha", "West Bengal", "DVC"]
            )
            excel_raw = generate_event_tables_excel(event_tables_data)
            event_tables_data['excel_base64'] = base64.b64encode(excel_raw).decode('ascii')
        except Exception as exc:
            print(f"Compact HTML event tables generation note: {exc}")

        html_doc = html_report(
            tables,
            title,
            event['warnings'],
            session=session,
            result=result,
            event_charts_data=event_charts_data,
            od_frequency=od_frequency,
            event_tables=event_tables_data
        )
        return {'success': True, 'html_document': html_doc}

    if payload.format == 'xlsx':
        return StreamingResponse(
            supplements_excel([event], options),
            media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            headers={'Content-Disposition': 'attachment; filename="frequency_analysis.xlsx"'}
        )

    from routes.frequency_routes import download_pdf, download_docx
    return asyncio.run((download_pdf if payload.format == 'pdf' else download_docx)(options))
