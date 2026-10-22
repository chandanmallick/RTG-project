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
                    'deviation': [p['deviation_mw'] for p in points]
                },
                'transmission_line_events': [r['action'] for r in messages if r.get('record_kind') == 'physical'],
                'crms_messages': [{
                    'timestamp': r['timestamp'],
                    'message_no': r.get('message_no', ''),
                    'remarks': r.get('message_details', ''),
                    'category': r.get('message_categories') or [r.get('message_type', 'CRMS Message')]
                } for r in messages if r.get('record_kind') != 'physical']
            })
    return events


def html_report(tables, title, warnings, session=None, result=None, event_charts_data=None, od_frequency=None, event_tables=None):
    """
    Restructured 5-section HTML report following user requirements:
    1. Frequency profile analysis (Dynamic Frequency Event Tables: Table-2A, Table-2B, Table-2C)
    2. State Scatter (State-wise Overdrawal vs Frequency Analysis plots and statistics tables)
    3. State Overdrawal plots for each events (interactive curves with CRMS markers)
    4. Event Chronology & Number of message issue (Category-wise message breakdown + event chronology)
    5. Rest same (Performance and overall statistics tables)
    """
    tables_json = json.dumps([{'title': name, 'columns': columns, 'rows': [{key: row.get(key) for key, _ in columns} for row in rows]} for name, columns, rows in tables], ensure_ascii=False).replace('<', '\\u003c')
    
    # Event charts data for Section 3
    event_charts_json = json.dumps(event_charts_data or [], ensure_ascii=False).replace('<', '\\u003c')
    
    # OD frequency data for Section 2
    period = (od_frequency or {}).get('period') or 'September–October 2026'
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
            <div class="event-table-card" style="margin-bottom: 28px; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; background: white; box-shadow: 0 2px 6px rgba(0,0,0,0.03);">
              <div style="background: #17365D; color: white; padding: 12px 18px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                <div style="font-weight: 800; font-size: 13px; line-height: 1.4;">{escape(tbl["title"])}</div>
                <div>
                  <span class="badge" style="background: rgba(255,255,255,0.2); color: white; font-size: 11px; padding: 3px 8px; border-radius: 4px;">{tbl["total_events"]} Events ({tbl["total_minutes"]} min)</span>
                </div>
              </div>
              <div style="overflow-x: auto;">
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
            </div>''')
        event_section_content = ''.join(event_cards)
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

    <!-- SECTION 3: State Overdrawal plots for each events -->
    <section class="report-section" id="section-events">
      <div class="section-header">
        <div>
          <h2 class="section-title">
            3. State Overdrawal Plots for Each Event
            <span class="badge">Interactive Curves</span>
          </h2>
          <p style="font-size: 11.5px; color: var(--muted); margin-top: 4px;">
            Dual-axis interactive event curves showing Frequency (Hz) vs State Deviation/Overdrawal (MW) with CRMS violation messages and transmission line physical regulations.
          </p>
        </div>
      </div>

      <div class="filter-bar">
        <label for="event-state-filter"><strong>Filter State:</strong></label>
        <select id="event-state-filter" onchange="filterEventCharts()">
          <option value="ALL">All States</option>
        </select>
        <label for="event-slot-filter" style="margin-left: 12px;"><strong>Filter Event:</strong></label>
        <select id="event-slot-filter" onchange="filterEventCharts()">
          <option value="ALL">All Events</option>
        </select>
        <span id="event-filter-count" style="margin-left: auto; font-size: 11.5px; color: var(--muted); font-weight: 700;"></span>
      </div>

      <div id="event-cards-container">
        <!-- Event cards rendered dynamically -->
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
        <label for="chronology-date"><strong>Filter Date:</strong></label>
        <input type="date" id="chronology-date" onchange="renderChronologyTable()">
        <label for="chronology-search" style="margin-left: 12px;"><strong>Search:</strong></label>
        <input type="text" id="chronology-search" placeholder="Filter entity, details..." oninput="renderChronologyTable()">
        <button onclick="document.getElementById('chronology-date').value='';document.getElementById('chronology-search').value='';renderChronologyTable()">Clear</button>
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
  </main>

  <script>
    const TABLES = {tables_json};
    const EVENT_CHARTS = {event_charts_json};
    const OD_DATA = {od_frequency_json};

    const esc = (v) => String(v ?? '-').replace(/[&<>"']/g, c => ({{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}}[c]));
    const num = (v, digits=1) => v == null || !Number.isFinite(Number(v)) ? '—' : Number(v).toFixed(digits);

    // ==========================================
    // SECTION 2: RENDER STATE SCATTER PLOTS & STATS
    // ==========================================
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
            <span class="measure-tag">${{measure}}</span>
          </div>
          <div class="scatter-img-wrap">
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
            <div style="margin-top: 10px; display: flex; justify-content: flex-end;">
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
    // SECTION 3: RENDER EVENT DUAL-AXIS CHARTS
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
        const opt = document.createElement('option');
        opt.value = s;
        opt.textContent = 'Event ' + s;
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

          chart.setOption({{
            animation: false,
            tooltip: {{ trigger: 'axis', axisPointer: {{ type: 'cross' }} }},
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
              }}
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
      const dateVal = document.getElementById('chronology-date').value;
      const searchVal = document.getElementById('chronology-search').value.toLowerCase();

      const filtered = allRows.filter(r => {{
        if (dateVal && r.date !== dateVal) return false;
        if (searchVal) {{
          const text = [r.state, r.message_details, r.message_no, r.message_type].join(' ').toLowerCase();
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
      eventChartInstances.forEach(c => c.resize());
    }});

    // Initialize all sections
    initScatterSection();
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
        from services.od_frequency_report import generate_od_frequency_plots
        try:
            od_frequency = generate_od_frequency_plots(session['raw_bytes'], dpi=300)
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
