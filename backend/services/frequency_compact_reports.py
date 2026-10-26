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


def build_event_charts_data(session, result=None, custom_event_windows=None):
    """
    Build detailed event curves for Section 3.2 / 4.2: State Overdrawal plots for each event.
    Supports:
      1. custom_event_windows: list of dicts/tuples specifying custom date/time windows
      2. result['event_windows']: explicit granular slots if provided
      3. Auto-detection rule:
         f < 49.90 Hz for > 15 min OR f < 49.50 Hz for > 5 min
         (with fallback to top deepest/longest dips if none qualify)
    """
    from routes.frequency_analysis_routes import _window_bounds
    dataset = session.get('dataset', {})
    states = [e for e in dataset.get('entities', []) if e.get('group') == 'State']
    if not states:
        return []

    times = dataset.get('times', [])
    freq_arr = dataset.get('frequency', [])
    import numpy as np
    from services.frequency_threshold_analysis import iso
    timestamps = [iso(t)[:16].replace('T', ' ') for t in times] if times is not None else []
    freq_clean = [round(float(f), 3) if np.isfinite(f) else None for f in freq_arr] if freq_arr is not None else []

    chronology = []
    if result:
        try:
            chronology, _ = sessions.report_chronology(session, result)
        except Exception:
            chronology = result.get('chronology', [])

    windows_to_process = []
    if custom_event_windows:
        for index, cw in enumerate(custom_event_windows, 1):
            s = str(cw.get('start_time') or cw.get('start') or '')
            e = str(cw.get('end_time') or cw.get('end') or '')
            lbl = cw.get('label') or cw.get('name') or f"Event {index} | {s[:10]} | {s[11:16]} - {e[11:16]}"
            if s and e:
                windows_to_process.append((s, e, lbl))
    elif result and result.get('event_windows'):
        ew = result.get('event_windows', [])
        is_all_full_day = True
        for w in ew:
            s, e = _window_bounds(w)
            if not (str(s)[11:19] == '00:00:00' and str(e)[11:19] in ('23:59:59', '00:00:00')):
                is_all_full_day = False
                break
        if not is_all_full_day:
            for index, w in enumerate(ew, 1):
                s, e = _window_bounds(w)
                windows_to_process.append((s, e, f"Event {index} | {str(s)[:10]} | {str(s)[11:16]} - {str(e)[11:16]}"))

    if not windows_to_process and timestamps and freq_clean:
        # User criteria: Auto selection of event if F < 49.9 for more than 15 min or < 49.5 for more than 5 min
        detected_dips = []
        in_dip = False
        start_idx = 0
        for idx, (ts, f) in enumerate(zip(timestamps, freq_clean)):
            if f is not None and f < 49.90:
                if not in_dip:
                    in_dip = True
                    start_idx = idx
            else:
                if in_dip:
                    in_dip = False
                    dur = idx - start_idx
                    sub_f = [v for v in freq_clean[start_idx:idx] if v is not None]
                    min_val = min(sub_f) if sub_f else 50.0
                    c495 = sum(1 for v in sub_f if v < 49.50)
                    is_auto = (dur > 15) or (c495 > 5)
                    detected_dips.append({
                        'start_idx': start_idx,
                        'end_idx': idx - 1,
                        'start_time': timestamps[start_idx],
                        'end_time': timestamps[idx - 1],
                        'duration_min': dur,
                        'min_freq': round(min_val, 3),
                        'c495_min': c495,
                        'auto_qualified': is_auto,
                    })
        if in_dip:
            dur = len(timestamps) - start_idx
            sub_f = [v for v in freq_clean[start_idx:] if v is not None]
            min_val = min(sub_f) if sub_f else 50.0
            c495 = sum(1 for v in sub_f if v < 49.50)
            is_auto = (dur > 15) or (c495 > 5)
            detected_dips.append({
                'start_idx': start_idx,
                'end_idx': len(timestamps) - 1,
                'start_time': timestamps[start_idx],
                'end_time': timestamps[-1],
                'duration_min': dur,
                'min_freq': round(min_val, 3),
                'c495_min': c495,
                'auto_qualified': is_auto,
            })

        qualified = [d for d in detected_dips if d['auto_qualified']]
        if not qualified:
            qualified = sorted(detected_dips, key=lambda d: (d['min_freq'], -d['duration_min']))[:3]

        for index, q in enumerate(qualified, 1):
            s_ts = q['start_time']
            e_ts = q['end_time']
            lbl = f"Event {index} | {s_ts[:10]} | {s_ts[11:16]} - {e_ts[11:16]} (Min {q['min_freq']:.3f} Hz)"
            windows_to_process.append((s_ts, e_ts, lbl))

    events = []
    for entity in states:
        for index, (start, end, label) in enumerate(windows_to_process, 1):
            points = []
            try:
                chart = sessions.chart_points(session['dataset'], [(start, end)], entity['entity_id'], limit=1200)
                points = chart.get('points', [])
            except Exception:
                pass
            if not points and timestamps:
                s_i = next((i for i, t in enumerate(timestamps) if t >= start[:16]), 0)
                e_i = next((i for i, t in enumerate(timestamps) if t > end[:16]), len(timestamps))
                s_pad = max(0, s_i - 15)
                e_pad = min(len(timestamps), e_i + 15)
                sch = entity.get('schedule', [])
                act = entity.get('actual', [])
                dev = entity.get('deviation', [])
                points = [{
                    'timestamp': timestamps[i],
                    'frequency': freq_clean[i] if i < len(freq_clean) else None,
                    'deviation_mw': round(float(dev[i]), 1) if i < len(dev) and np.isfinite(dev[i]) else None,
                    'schedule': round(float(sch[i]), 1) if i < len(sch) and np.isfinite(sch[i]) else None,
                    'actual': round(float(act[i]), 1) if i < len(act) and np.isfinite(act[i]) else None,
                } for i in range(s_pad, e_pad)]

            messages = [
                row for row in chronology
                if (row.get('entity_id') == entity.get('entity_id') or row.get('state') == entity.get('display_name'))
                and (start[:16] <= str(row.get('timestamp') or '').replace('T', ' ')[:16] <= end[:16])
            ]
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
                'event_name': label,
                'event_type': (result.get('event_type') if result else 'low') or 'low',
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

    # Detect ALL low-frequency dips and classify against Auto Selection rule:
    # Rule: F < 49.9 for > 15 min OR < 49.5 for > 5 min
    all_dips = []
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
                    c495 = sum(1 for val in sub_f if val < 49.50)
                    is_auto = (duration > 15) or (c495 > 5)
                    if duration > 15 and c495 > 5:
                        reason = f"F < 49.9 for {duration}m & F < 49.5 for {c495}m"
                    elif duration > 15:
                        reason = f"F < 49.9 for {duration}m (>15 min)"
                    elif c495 > 5:
                        reason = f"F < 49.5 for {c495}m (>5 min)"
                    else:
                        reason = f"Dip < 49.90 ({duration}m)"

                    all_dips.append({
                        "id": f"dip-{dip_start_idx}-{idx - 1}",
                        "start_time": timestamps[dip_start_idx],
                        "end_time": timestamps[idx - 1],
                        "time_window": f"{timestamps[dip_start_idx][11:16]} – {timestamps[idx - 1][11:16]}",
                        "start_idx": dip_start_idx,
                        "end_idx": idx - 1,
                        "duration_min": duration,
                        "min_freq": round(min_val, 3),
                        "min_time": timestamps[min_at][11:16],
                        "date": timestamps[dip_start_idx][:10],
                        "c495_min": c495,
                        "auto_qualified": is_auto,
                        "qualification_reason": reason,
                        "label": f"{timestamps[dip_start_idx][5:10]} {timestamps[dip_start_idx][11:16]}–{timestamps[idx - 1][11:16]} (Min {min_val:.3f} Hz)"
                    })
    if in_dip:
        duration = len(timestamps) - dip_start_idx
        sub_f = [val for val in freq_clean[dip_start_idx:] if val is not None]
        if sub_f:
            min_val = min(sub_f)
            min_at = dip_start_idx + sub_f.index(min_val)
            c495 = sum(1 for val in sub_f if val < 49.50)
            is_auto = (duration > 15) or (c495 > 5)
            if duration > 15 and c495 > 5:
                reason = f"F < 49.9 for {duration}m & F < 49.5 for {c495}m"
            elif duration > 15:
                reason = f"F < 49.9 for {duration}m (>15 min)"
            elif c495 > 5:
                reason = f"F < 49.5 for {c495}m (>5 min)"
            else:
                reason = f"Dip < 49.90 ({duration}m)"

            all_dips.append({
                "id": f"dip-{dip_start_idx}-{len(timestamps) - 1}",
                "start_time": timestamps[dip_start_idx],
                "end_time": timestamps[-1],
                "time_window": f"{timestamps[dip_start_idx][11:16]} – {timestamps[-1][11:16]}",
                "start_idx": dip_start_idx,
                "end_idx": len(timestamps) - 1,
                "duration_min": duration,
                "min_freq": round(min_val, 3),
                "min_time": timestamps[min_at][11:16],
                "date": timestamps[dip_start_idx][:10],
                "c495_min": c495,
                "auto_qualified": is_auto,
                "qualification_reason": reason,
                "label": f"{timestamps[dip_start_idx][5:10]} {timestamps[dip_start_idx][11:16]}–{timestamps[-1][11:16]} (Min {min_val:.3f} Hz)"
            })

    auto_dips = [d for d in all_dips if d['auto_qualified']]
    detected_events = auto_dips if auto_dips else (all_dips[:4] if all_dips else [])

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
        "candidate_dips": all_dips,
        "auto_qualified_count": len(auto_dips),
        "unique_dates": unique_dates,
        "states": states_data,
        "total_points": len(timestamps),
        "start_date": timestamps[0][:10] if timestamps else "",
        "end_date": timestamps[-1][:10] if timestamps else "",
    }


def html_report(tables, title, warnings, session=None, result=None, event_charts_data=None, od_frequency=None, event_tables=None, continuous_drawal_data=None, frequency_curves=None, state_heatmaps=None):
    """
    Restructured multi-section HTML report following user requirements:
    1. Frequency profile analysis (Dynamic Frequency Event Tables: Table-2A, Table-2B, Table-2C)
    2. Frequency Analysis Curves (Daily Min + Duration, FDC, Diurnal Profile)
    3. State Scatter (State-wise Overdrawal vs Frequency Analysis plots with embedded tables)
    3.2 State Performance by Heatmap (15-minute time block OD/UI heatmaps across day of month)
    4. State Overdrawal plots for each event (continuous 3-panel viewer with inbuilt color scheme & event cards)
    5. Event Chronology & Number of message issue (Category-wise message breakdown + event chronology)
    6. Performance and overall statistics tables
    """
    tables_json = json.dumps([{'title': name, 'columns': columns, 'rows': [{key: row.get(key) for key, _ in columns} for row in rows]} for name, columns, rows in tables], ensure_ascii=False).replace('<', '\\u003c')
    
    # Event charts data for Section 4
    event_charts_json = json.dumps(event_charts_data or [], ensure_ascii=False).replace('<', '\\u003c')

    # Continuous drawal data for Section 4
    if continuous_drawal_data is None and session:
        try:
            continuous_drawal_data = build_continuous_drawal_data(session, result)
        except Exception as exc:
            print(f"Notice: continuous drawal generation note: {exc}")
            continuous_drawal_data = {}
    continuous_drawal_json = json.dumps(continuous_drawal_data or {}, ensure_ascii=False).replace('<', '\\u003c')
    
    # OD frequency data for Section 3
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

    # State Heatmaps data for Subsection 3.2
    if state_heatmaps is None and session:
        state_heatmaps = session.get('state_heatmaps')
    heatmap_period = (state_heatmaps or {}).get('period') or period
    heatmap_plots = (state_heatmaps or {}).get('plots_base64') or {}
    heatmap_stats = (state_heatmaps or {}).get('state_stats') or {}
    heatmap_interactive = (state_heatmaps or {}).get('interactive_data') or {}
    heatmap_zip = (state_heatmaps or {}).get('zip_bytes')
    heatmap_zip_b64 = base64.b64encode(heatmap_zip).decode('ascii') if heatmap_zip else ''
    heatmap_excel = (state_heatmaps or {}).get('excel_bytes')
    heatmap_excel_b64 = base64.b64encode(heatmap_excel).decode('ascii') if heatmap_excel else ''
    state_heatmaps_json = json.dumps({
        'period': heatmap_period,
        'plots': heatmap_plots,
        'stats': heatmap_stats,
        'interactive': heatmap_interactive,
        'zip_base64': heatmap_zip_b64,
        'excel_base64': heatmap_excel_b64,
        'states': list(heatmap_plots.keys()),
    }, ensure_ascii=False).replace('<', '\\u003c')

    # Frequency analysis curves data for Section 2
    freq_curves_plots = (frequency_curves or {}).get('plots_base64') or {}
    freq_curves_period = (frequency_curves or {}).get('period') or period
    freq_curves_stats = (frequency_curves or {}).get('statistics') or {}
    freq_curves_zip = (frequency_curves or {}).get('zip_bytes')
    freq_curves_zip_b64 = base64.b64encode(freq_curves_zip).decode('ascii') if freq_curves_zip else ''
    frequency_curves_json = json.dumps({
        'period': freq_curves_period,
        'plots': freq_curves_plots,
        'stats': freq_curves_stats,
        'zip_base64': freq_curves_zip_b64
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

    # Deduplicate and format compact warning banner
    clean_warnings = list(dict.fromkeys(warnings or []))
    warning_banner_html = ''
    if clean_warnings:
        sched_plants = []
        other_w = []
        for w in clean_warnings:
            w_str = str(w).strip()
            if 'without separate schedule column' in w_str:
                parts = w_str.split(':')
                if len(parts) > 1:
                    sched_plants.extend([p.strip() for p in parts[1].split(',') if p.strip()])
                else:
                    sched_plants.append(w_str)
            elif 'no separate schedule column' in w_str:
                parts = w_str.split(':')
                sched_plants.append(parts[0].strip())
            else:
                other_w.append(w_str)

        sched_plants = list(dict.fromkeys(sched_plants))
        summary_desc = f"{len(sched_plants)} stations without separate schedule" if sched_plants else f"{len(clean_warnings)} data notes"
        list_items = []
        if sched_plants:
            chips_html = ''.join(f'<span style="display:inline-block; margin:2px 4px 2px 0; padding:2px 7px; background:#FFFFFF; border:1px solid #FCD34D; border-radius:4px; font-size:10.5px; font-weight:700; color:#92400E;">{escape(p)}</span>' for p in sched_plants)
            list_items.append(f'<div style="margin-bottom:6px; font-size:11px;"><strong>Generating stations without separate schedule column (OD/UI unavailable, {len(sched_plants)}):</strong><div style="margin-top:4px;">{chips_html}</div></div>')
        for ow in other_w:
            list_items.append(f'<div style="margin-top:3px; font-size:11px; color:#92400E;">&bull; {escape(ow)}</div>')

        warning_banner_html = f'''
    <details class="compact-warning-banner" style="margin-bottom: 14px; border: 1px solid #FCD34D; background: linear-gradient(135deg, #FEFCE8 0%, #FFFBEB 100%); border-radius: 8px; padding: 7px 14px; font-size: 11px; color: #92400E; box-shadow: 0 1px 3px rgba(217, 119, 6, 0.05);">
      <summary style="cursor: pointer; font-weight: 750; display: flex; align-items: center; justify-content: space-between; user-select: none;">
        <span style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 13px;">⚠️</span>
          <span>Data Availability &amp; Entity Notes ({len(clean_warnings)} notice(s))</span>
          <span style="font-size: 10.5px; color: #B45309; font-weight: normal; margin-left: 6px;">&bull; {summary_desc}</span>
        </span>
        <span style="font-size: 10.5px; padding: 2px 8px; background: rgba(251, 191, 36, 0.25); border: 1px solid #FCD34D; border-radius: 4px; font-weight: 750;">View Details ▾</span>
      </summary>
      <div style="margin-top: 8px; padding-top: 6px; border-top: 1px solid #FDE68A; max-height: 120px; overflow-y: auto;">
        {''.join(list_items)}
      </div>
    </details>'''

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
      font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.45;
      font-size: 12px;
    }}
    header.top-bar {{
      position: sticky;
      top: 0;
      z-index: 100;
      background: linear-gradient(135deg, #0F172A 0%, #17365D 55%, #1E3A8A 100%);
      color: white;
      padding: 8px 24px;
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      box-shadow: 0 2px 10px rgba(15, 23, 42, 0.15);
      border-bottom: 1px solid rgba(255, 255, 255, 0.12);
    }}
    header.top-bar h1 {{
      font-size: 16px;
      font-weight: 850;
      letter-spacing: -0.015em;
    }}
    header.top-bar .meta {{
      font-size: 10.5px;
      color: #93C5FD;
      margin-top: 1px;
    }}
    .nav-links {{
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      margin-top: 3px;
      align-items: center;
    }}
    .nav-btn {{
      background: rgba(255, 255, 255, 0.12);
      color: white;
      border: 1px solid rgba(255, 255, 255, 0.22);
      border-radius: 5px;
      padding: 4px 9px;
      font-size: 10.5px;
      font-weight: 700;
      cursor: pointer;
      text-decoration: none;
      transition: background 0.15s, border-color 0.15s;
    }}
    .nav-btn:hover {{
      background: rgba(255, 255, 255, 0.25);
      border-color: rgba(255, 255, 255, 0.4);
    }}
    .nav-btn.primary {{
      background: #059669;
      border-color: #047857;
    }}
    .nav-btn.primary:hover {{
      background: #047857;
    }}
    main {{
      max-width: 1720px;
      margin: 14px auto;
      padding: 0 16px;
    }}
    .report-section {{
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 9px;
      padding: 16px 20px;
      margin-bottom: 16px;
      box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
    }}
    .section-header {{
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #E2E8F0;
      padding-bottom: 8px;
      margin-bottom: 14px;
      flex-wrap: wrap;
      gap: 8px;
    }}
    .section-title {{
      font-size: 15px;
      font-weight: 850;
      color: var(--primary);
      display: flex;
      align-items: center;
      gap: 8px;
    }}
    .section-title .badge {{
      font-size: 10.5px;
      padding: 2px 7px;
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
      padding: 24px;
      text-align: center;
      color: #1E3A8A;
    }}
    .placeholder-card h4 {{
      font-size: 14px;
      font-weight: 800;
      margin-bottom: 4px;
    }}
    .placeholder-card p {{
      font-size: 11.5px;
      color: var(--muted);
      max-width: 600px;
      margin: 0 auto;
    }}
    /* State Scatter Grid */
    .scatter-grid {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(460px, 1fr));
      gap: 16px;
      margin-top: 12px;
    }}
    .scatter-card {{
      background: #FFFFFF;
      border: 1px solid #CBD5E1;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 1px 4px rgba(0,0,0,0.03);
      display: flex;
      flex-direction: column;
    }}
    .scatter-card-header {{
      background: #17365D;
      color: white;
      padding: 7px 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }}
    .scatter-card-header h4 {{
      font-size: 13px;
      font-weight: 800;
    }}
    .scatter-card-header .measure-tag {{
      font-size: 10px;
      background: rgba(255,255,255,0.2);
      padding: 2px 6px;
      border-radius: 4px;
      font-weight: 700;
    }}
    .scatter-img-wrap {{
      background: #FFFFFF;
      padding: 6px;
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
    .styled-table {{
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
    }}
    .styled-table th {{
      background: #17365D;
      color: white;
      font-weight: 700;
      padding: 5px 8px;
      text-align: center;
      border: 1px solid #0F233D;
      font-size: 11px;
    }}
    .styled-table td {{
      padding: 4px 8px;
      text-align: center;
      border: 1px solid #E2E8F0;
      font-size: 11px;
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
    /* Section 4 Event cards */
    .event-card {{
      background: #FFFFFF;
      border: 1px solid #CBD5E1;
      border-radius: 8px;
      margin-bottom: 12px;
      overflow: hidden;
      box-shadow: 0 1px 4px rgba(15,23,42,0.03);
    }}
    .event-card summary {{
      padding: 8px 14px;
      background: #F1F5F9;
      cursor: pointer;
      font-weight: 800;
      font-size: 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #E2E8F0;
    }}
    .event-card-body {{
      padding: 12px;
    }}
    .event-chart {{
      height: 420px;
      width: 100%;
    }}
    .event-results {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
      gap: 8px;
      margin-bottom: 10px;
    }}
    .result-tile {{
      background: #F8FAFC;
      border: 1px solid #E2E8F0;
      border-radius: 6px;
      padding: 6px 10px;
    }}
    .result-tile b {{
      display: block;
      color: var(--muted);
      font-size: 9.5px;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }}
    .result-tile strong {{
      font-size: 14px;
      color: var(--text);
    }}
    .result-tile small {{
      display: block;
      font-size: 10px;
      color: var(--muted);
      margin-top: 1px;
    }}
    .filter-bar {{
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
      margin-bottom: 10px;
      padding: 8px 12px;
      background: #F8FAFC;
      border: 1px solid #E2E8F0;
      border-radius: 6px;
    }}
    .filter-bar select, .filter-bar input, .filter-bar button {{
      padding: 4px 8px;
      font-size: 11px;
      border: 1px solid var(--border);
      border-radius: 5px;
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
      gap: 5px;
      padding: 4px 10px;
      font-size: 11px;
      font-weight: 700;
      border-radius: 5px;
      border: 1px solid var(--border);
      background: white;
      color: var(--text);
      cursor: pointer;
      text-decoration: none;
      transition: all 0.15s ease;
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
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 8px rgba(15,23,42,0.04);
      margin-top: 10px;
      margin-bottom: 16px;
    }}
    .continuous-card-header {{
      background: #F8FAFC;
      border-bottom: 1px solid #E2E8F0;
      padding: 8px 14px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
    }}
    .compact-select {{
      padding: 4px 8px;
      border: 1px solid #CBD5E1;
      border-radius: 5px;
      font-size: 11px;
      background: #FFFFFF;
      color: #0F172A;
      font-weight: 700;
      cursor: pointer;
    }}
    .event-selection-bar {{
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 6px 14px;
      background: #F1F5F9;
      border-bottom: 1px solid #E2E8F0;
      overflow-x: auto;
    }}
    .event-chips-wrapper {{
      display: flex;
      gap: 5px;
      overflow-x: auto;
      padding: 2px 0;
      scrollbar-width: thin;
    }}
    .event-chip-btn {{
      white-space: nowrap;
      padding: 2px 8px;
      border: 1px solid #CBD5E1;
      border-radius: 999px;
      background: #FFFFFF;
      color: #0F172A;
      font-size: 10.5px;
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
      padding: 6px 14px;
      background: #F8FAFC;
      border-top: 1px solid #E2E8F0;
      display: flex;
      align-items: center;
      gap: 14px;
      font-size: 11px;
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
    /* Collapsible Sections */
    .report-section-collapsible summary.section-summary-header {{
      cursor: pointer;
      user-select: none;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
      border-bottom: 2px solid #E2E8F0;
      padding-bottom: 12px;
      margin-bottom: 18px;
    }}
    .report-section-collapsible summary.section-summary-header::-webkit-details-marker {{
      display: none;
    }}
    .report-section-collapsible summary.section-summary-header {{
      list-style: none;
    }}
    .report-section-collapsible[open] > summary.section-summary-header .collapsible-icon {{
      transform: rotate(0deg);
    }}
    .report-section-collapsible:not([open]) > summary.section-summary-header .collapsible-icon {{
      transform: rotate(-90deg);
    }}
    .report-section-collapsible:not([open]) > summary.section-summary-header {{
      border-bottom: none;
      margin-bottom: 0;
      padding-bottom: 0;
    }}
    .section-summary-left {{
      display: flex;
      align-items: flex-start;
      gap: 12px;
      flex: 1;
      min-width: 260px;
    }}
    .section-desc {{
      font-size: 11.5px;
      color: var(--muted);
      margin-top: 4px;
    }}
    .section-actions {{
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
    }}

    /* Frequency Curves Grid */
    .curves-grid {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(480px, 1fr));
      gap: 22px;
      margin-top: 14px;
    }}
    .curve-card {{
      background: #FFFFFF;
      border: 1px solid #CBD5E1;
      border-radius: 10px;
      overflow: hidden;
      box-shadow: 0 3px 10px rgba(0,0,0,0.03);
      display: flex;
      flex-direction: column;
    }}
    .curve-card-header {{
      background: #17365D;
      color: white;
      padding: 10px 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }}
    .curve-card-header h4 {{
      font-size: 13.5px;
      font-weight: 800;
    }}
    .curve-img-wrap {{
      background: #FFFFFF;
      padding: 8px;
      text-align: center;
      cursor: zoom-in;
    }}
    .curve-img-wrap img {{
      max-width: 100%;
      height: auto;
      border-radius: 4px;
      display: block;
      margin: 0 auto;
    }}
    .curve-card-footer {{
      padding: 10px 16px;
      background: #F8FAFC;
      border-top: 1px solid #E2E8F0;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
    }}
    .scatter-card-footer {{
      padding: 10px 16px;
      background: #F8FAFC;
      border-top: 1px solid #E2E8F0;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
    }}

    @media (max-width: 768px) {{
      .scatter-grid, .curves-grid {{ grid-template-columns: 1fr; }}
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
      <a class="nav-btn" href="#section-curves">2. Frequency Curves</a>
      <a class="nav-btn" href="#section-scatter">3. State Scatter</a>
      <a class="nav-btn" href="#section-heatmap">3.2 State Heatmaps</a>
      <a class="nav-btn" href="#section-events">4. Event Overdrawal Plots</a>
      <a class="nav-btn" href="#section-chronology">5. Chronology & Messages</a>
      <a class="nav-btn" href="#section-performance">6. Performance Tables</a>
      <button class="nav-btn" onclick="toggleAllSections(true)">▼ Expand All</button>
      <button class="nav-btn" onclick="toggleAllSections(false)">▶ Collapse All</button>
      <button class="nav-btn primary" id="btn-print" onclick="window.print()">Print / PDF</button>
      <button class="nav-btn primary" id="btn-save-html" onclick="downloadSelf()">Download HTML</button>
    </div>
  </header>

  <main>
    {warning_banner_html}
    <!-- SECTION 1: Frequency profile analysis -->
    <details class="report-section report-section-collapsible" open id="section-profile">
      <summary class="section-summary-header">
        <div class="section-summary-left">
          <span class="collapsible-icon">▼</span>
          <div>
            <h2 class="section-title">
              1. Frequency Profile Analysis — Frequency Event Analysis Tables
              <span class="badge">ERLDC Standard Format</span>
            </h2>
            <p class="section-desc">
              Dynamic frequency event identification for continuous dips below selected operational thresholds (&lt;49.50 Hz, &lt;49.70 Hz, &lt;49.90 Hz) with constituent Maximum Overdrawal (Max OD &gt; 0 MW) and Average Deviation (Avg Dev, signed MW).
            </p>
          </div>
        </div>
        <div class="section-actions" onclick="event.stopPropagation()">
          {event_dl_btn}
        </div>
      </summary>
      <div class="section-content-body">
        {event_section_content}
      </div>
    </details>

    <!-- SECTION 2: Frequency Analysis Curves (Publication Quality) -->
    <details class="report-section report-section-collapsible" open id="section-curves">
      <summary class="section-summary-header">
        <div class="section-summary-left">
          <span class="collapsible-icon">▼</span>
          <div>
            <h2 class="section-title">
              2. Frequency Analysis Curves
              <span class="badge">{escape(freq_curves_period)}</span>
            </h2>
            <p class="section-desc">
              Publication-quality frequency analysis graphs based on continuous 1-minute SCADA measurements: Daily Minimum &amp; Low-Frequency Duration, Frequency Duration Curve (FDC), and Average Daily 24-Hour Diurnal Profile with middle 80% range (10th–90th percentile).
            </p>
          </div>
        </div>
        <div class="section-actions" onclick="event.stopPropagation()">
          <button class="action-btn success" id="btn-download-curves-zip" onclick="downloadFrequencyCurvesZip()">
            📥 Download All Curves (.zip)
          </button>
        </div>
      </summary>
      <div class="section-content-body">
        <div class="curves-grid" id="curves-container">
          <!-- Rendered dynamically by script for the 3 curves -->
        </div>
      </div>
    </details>

    <!-- SECTION 3: State Scatter -->
    <details class="report-section report-section-collapsible" open id="section-scatter">
      <summary class="section-summary-header">
        <div class="section-summary-left">
          <span class="collapsible-icon">▼</span>
          <div>
            <h2 class="section-title">
              3. State-wise Overdrawal vs Frequency Analysis
              <span class="badge">{escape(period)}</span>
            </h2>
            <p class="section-desc">
              Scatter analysis of positive Actual - Schedule deviations (&gt;0 MW; Overdrawal for states, Under-injection for DVC) versus Frequency (Hz).
              Frequency bands: &lt;49.50 Hz (<span style="color:#D7191C;font-weight:bold">Red</span>), 49.50–&lt;49.70 Hz (<span style="color:#F07800;font-weight:bold">Orange</span>), 49.70–&lt;49.90 Hz (<span style="color:#7B2CBF;font-weight:bold">Purple</span>), ≥49.90 Hz (<span style="color:#159447;font-weight:bold">Green</span>). Dashed vertical lines mark cumulative thresholds at 49.50, 49.70, and 49.90 Hz. Full statistics table embedded directly in each plot.
            </p>
          </div>
        </div>
        <div class="section-actions" onclick="event.stopPropagation()">
          <button class="action-btn success" id="btn-download-stats" onclick="downloadStatsExcel()">
            📥 Download Consolidated Statistics (.xlsx)
          </button>
        </div>
      </summary>
      <div class="section-content-body">
        <div class="scatter-grid" id="scatter-container">
          <!-- Rendered dynamically by script for each of the 6 states -->
        </div>
      </div>
    </details>

    <!-- SUBSECTION 3.2: State Performance by Heatmap (15-minute Time Blocks) -->
    <details class="report-section report-section-collapsible" open id="section-heatmap">
      <summary class="section-summary-header">
        <div class="section-summary-left">
          <span class="collapsible-icon">▼</span>
          <div>
            <h2 class="section-title">
              3.2 State Performance by Heatmap
              <span class="badge">{escape(heatmap_period)}</span>
            </h2>
            <p class="section-desc">
              15-minute time block average Overdrawal (OD/UI in MW) across each day of the month for constituent states (West Bengal, Bihar, DVC, Jharkhand, Odisha, Sikkim).
              <strong>X-axis:</strong> 1-96 Time Blocks (15-min intervals). <strong>Y-axis:</strong> Day of the Month. Severe overdrawal spikes (&ge;500 MW) annotated with value badges.
            </p>
          </div>
        </div>
        <div class="section-actions" onclick="event.stopPropagation()">
          <button class="action-btn" id="btn-download-heatmap-png" onclick="downloadCurrentHeatmapPng()">
            📥 Download PNG
          </button>
          <button class="action-btn" id="btn-download-heatmap-zip" onclick="downloadHeatmapZip()">
            📦 Download All States (ZIP)
          </button>
          <button class="action-btn success" id="btn-download-heatmap-excel" onclick="downloadHeatmapExcel()">
            📊 Download Data (.xlsx)
          </button>
        </div>
      </summary>
      <div class="section-content-body">
        <div class="filter-bar" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:12px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <label for="heatmap-state-select"><strong>Select State:</strong></label>
            <select id="heatmap-state-select" onchange="onHeatmapStateChange()" class="compact-select" style="min-width:160px; font-weight:700; padding:4px 8px; border-radius:5px; border:1px solid #CBD5E1;">
              <!-- Populated by JS -->
            </select>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-weight:700; font-size:11.5px; color:var(--muted);">View Mode:</span>
            <button class="action-btn active" id="btn-heatmap-view-pub" onclick="setHeatmapViewMode('publication')">Publication Chart</button>
            <button class="action-btn" id="btn-heatmap-view-echarts" onclick="setHeatmapViewMode('interactive')">Interactive ECharts</button>
            <button class="action-btn" id="btn-heatmap-view-grid" onclick="setHeatmapViewMode('grid')">All States Grid</button>
            <button class="action-btn" onclick="openHeatmapModal()" style="margin-left:6px;">🔍 Enlarge</button>
          </div>
        </div>

        <!-- KPI Summary Cards for selected state -->
        <div id="heatmap-kpi-container" style="display:flex; flex-wrap:wrap; gap:10px; margin-bottom:14px;">
          <!-- Rendered by JS -->
        </div>

        <!-- Publication Chart container -->
        <div id="heatmap-pub-container" style="background:#FFFFFF; border:1px solid #CBD5E1; border-radius:8px; padding:12px; text-align:center; cursor:zoom-in;" onclick="openHeatmapModal()" title="Click to enlarge">
          <img id="heatmap-pub-img" src="" style="width:100%; max-height:720px; object-fit:contain; border-radius:4px;" alt="State OD/UI Heatmap" />
        </div>

        <!-- Interactive ECharts container -->
        <div id="heatmap-interactive-container" style="display:none; background:#FFFFFF; border:1px solid #CBD5E1; border-radius:8px; padding:12px;">
          <div id="heatmap-echarts" style="width:100%; height:600px;"></div>
        </div>

        <!-- All States Grid container -->
        <div id="heatmap-grid-container" style="display:none;" class="scatter-grid">
          <!-- Rendered by JS -->
        </div>
      </div>
    </details>

    <!-- SECTION 4: State Overdrawal plots for each event -->
    <details class="report-section report-section-collapsible" open id="section-events">
      <summary class="section-summary-header">
        <div class="section-summary-left">
          <span class="collapsible-icon">▼</span>
          <div>
            <h2 class="section-title">
              4. State Overdrawal Plots for Each Event
              <span class="badge">Continuous &amp; Event Analysis</span>
            </h2>
            <p class="section-desc">
              Continuous end-to-end Drawal (Schedule vs Actual), Deviation with CRMS violation messages and Physical Regulatory actions, and Frequency curve. Inbuilt system color scheme &bull; 2-day default window, scrollable and exportable.
            </p>
          </div>
        </div>
      </summary>
      <div class="section-content-body">
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
          <div id="continuous-drawal-chart" style="width: 100%; height: 560px; background: #FFFFFF;"></div>

          <!-- Dynamic Statistical Footnote -->
          <div class="continuous-footnote" id="continuous-chart-footnote">
            <span><strong style="color: #DC2626;">Shaded</strong> = f ≤ 49.90 Hz.</span>
            <span><strong>Over drawing at f ≤ 49.90 Hz:</strong> <span id="stat-od-min" style="font-weight: 800; color: #0F172A;">—</span> of <span id="stat-low-min" style="font-weight: 800; color: #0F172A;">—</span> min;</span>
            <span><strong>max over drawal at f ≤ 49.90 Hz:</strong> <span id="stat-max-od" style="font-weight: 800; color: #DC2626;">—</span> MW</span>
            <span id="stat-visible-range" style="margin-left: auto; color: #64748B; font-size: 11px;"></span>
          </div>
        </div>

        <!-- Event Slotting Controls Bar for Standalone HTML -->
        <div style="margin-top: 14px; background: #F8FAFC; border: 1px solid #CBD5E1; border-radius: 8px; padding: 8px 12px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <span style="font-size: 12px; font-weight: 800; color: #1E293B;">Event Slotting:</span>
            <button class="action-btn" id="btn-html-slot-auto" onclick="selectAutoModeHtml()" style="background: #059669; color: white; border-color: #047857; font-weight: 700; cursor: pointer;">
              ⚡ Auto Detect
            </button>
            <button class="action-btn" id="btn-html-slot-select" onclick="openSelectDipsModalHtml()" style="font-weight: 700; cursor: pointer;">
              📋 Select from Frequency Dips
            </button>
            <button class="action-btn" id="btn-html-slot-manual" onclick="openManualSlotsModalHtml()" style="font-weight: 700; cursor: pointer;">
              ➕ Slot Manually
            </button>
          </div>
          <div id="html-slotting-mode-badge" style="font-size: 11px; font-weight: 800; padding: 4px 10px; border-radius: 999px; background: #ECFDF5; color: #065F46; border: 1px solid #A7F3D0;">
            ⚡ Auto Detect Active (F &lt; 49.9 &gt; 15m or &lt; 49.5 &gt; 5m)
          </div>
        </div>

        <!-- Collapsible Detailed Event Cards -->
        <div style="margin-top: 14px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
          <div>
            <h3 style="font-size: 14px; font-weight: 800; color: var(--primary); margin: 0;">
              4.2 Discrete Event Detail Plots &amp; Regulatory Breakup
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
      </div>
    </details>

    <!-- SECTION 5: Event Chronology & Number of message issue -->
    <details class="report-section report-section-collapsible" open id="section-chronology">
      <summary class="section-summary-header">
        <div class="section-summary-left">
          <span class="collapsible-icon">▼</span>
          <div>
            <h2 class="section-title">
              5. Event Chronology &amp; Message Summary
              <span class="badge">CRMS &amp; Physical Regulation</span>
            </h2>
            <p class="section-desc">
              Summary of CRMS violation messages issued across recipient groups and chronology of regulatory actions.
            </p>
          </div>
        </div>
      </summary>
      <div class="section-content-body">
        <h3 style="font-size: 14px; font-weight: 800; color: var(--primary); margin-bottom: 10px;">5.1 Category-wise Messages Issued</h3>
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

        <h3 style="font-size: 14px; font-weight: 800; color: var(--primary); margin-bottom: 10px;">5.2 Daily Event Chronology</h3>
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
      </div>
    </details>

    <!-- SECTION 6: Performance and Overall Statistics -->
    <details class="report-section report-section-collapsible" open id="section-performance">
      <summary class="section-summary-header">
        <div class="section-summary-left">
          <span class="collapsible-icon">▼</span>
          <div>
            <h2 class="section-title">
              6. Performance &amp; Overall Statistics
              <span class="badge">Tables &amp; Indicators</span>
            </h2>
            <p class="section-desc">
              Comprehensive statistical and performance indicators across thresholds, entities, and selected periods.
            </p>
          </div>
        </div>
        <div class="section-actions" onclick="event.stopPropagation()">
          <button class="action-btn" onclick="downloadCurrentTableCsv()">📥 Download Table (CSV)</button>
        </div>
      </summary>
      <div class="section-content-body">
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
      </div>
    </details>

    <!-- Modal for Enlarged State Scatter Plot or Frequency Curve -->
    <div id="modal-enlarge-scatter" class="modal-overlay" style="display:none;" onclick="closeScatterModal()">
      <div class="modal-content" onclick="event.stopPropagation()">
        <div class="modal-header">
          <h3 id="modal-scatter-title">Enlarged View</h3>
          <button class="action-btn" onclick="closeScatterModal()" style="color: #0F172A; padding: 3px 10px;">✕ Close</button>
        </div>
        <div style="text-align: center; padding: 16px; overflow: auto; background: #FFFFFF; max-height: calc(95vh - 60px);">
          <img id="modal-scatter-img" src="" style="max-width: 100%; max-height: 82vh; object-fit: contain; border-radius: 6px; box-shadow: 0 4px 14px rgba(0,0,0,0.12);" />
        </div>
      </div>
    </div>

    <!-- Modal for Selecting Frequency Dips in HTML Report -->
    <div id="modal-select-dips" class="modal-overlay" style="display:none;" onclick="closeSelectDipsModalHtml()">
      <div class="modal-content" onclick="event.stopPropagation()" style="max-width: 920px; width: 95%;">
        <div class="modal-header">
          <h3>📋 Select Frequency Events from Uploaded SCADA Data</h3>
          <button class="action-btn" onclick="closeSelectDipsModalHtml()" style="color: #0F172A; padding: 3px 10px;">✕ Close</button>
        </div>
        <div style="padding: 16px; overflow-y: auto; max-height: calc(85vh - 110px);">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; background: #F1F5F9; padding: 8px 12px; border-radius: 6px;">
            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
              <button class="action-btn" onclick="selectAllAutoDipsHtml()" style="background: #059669; color: white; border-color: #047857; font-weight: 700;">Select Auto-Qualified</button>
              <button class="action-btn" onclick="selectAllDipsHtml()">Select All</button>
              <button class="action-btn" onclick="clearAllDipsHtml()">Clear All</button>
            </div>
            <span id="html-dips-selected-count" style="font-weight: 800; font-size: 11.5px; color: #1E293B;"></span>
          </div>
          <div style="overflow-x: auto; max-height: 380px;">
            <table class="styled-table" id="html-table-candidate-dips">
              <thead>
                <tr>
                  <th style="width: 40px;">Select</th>
                  <th>#</th>
                  <th>Date</th>
                  <th>Time Window</th>
                  <th>Duration</th>
                  <th>Lowest Frequency</th>
                  <th>Time &lt; 49.50 Hz</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody id="html-tbody-candidate-dips"></tbody>
            </table>
          </div>
        </div>
        <div style="padding: 12px 16px; background: #F8FAFC; border-top: 1px solid #E2E8F0; display: flex; justify-content: flex-end; gap: 10px;">
          <button class="action-btn" onclick="closeSelectDipsModalHtml()">Cancel</button>
          <button class="action-btn primary" onclick="applyDipsSelectionHtml()">Apply Selection</button>
        </div>
      </div>
    </div>

    <!-- Modal for Manual Slotting in HTML Report -->
    <div id="modal-manual-slots" class="modal-overlay" style="display:none;" onclick="closeManualSlotsModalHtml()">
      <div class="modal-content" onclick="event.stopPropagation()" style="max-width: 650px; width: 95%;">
        <div class="modal-header">
          <h3>➕ Manual Event Slotting</h3>
          <button class="action-btn" onclick="closeManualSlotsModalHtml()" style="color: #0F172A; padding: 3px 10px;">✕ Close</button>
        </div>
        <div style="padding: 16px; overflow-y: auto; max-height: calc(85vh - 110px);">
          <div style="background: #FAF5FF; border: 1px solid #E9D5FF; border-radius: 8px; padding: 14px; margin-bottom: 16px;">
            <div style="font-weight: 800; font-size: 12.5px; color: #5B21B6; margin-bottom: 10px;">Add New Custom Event Slot</div>
            <div style="display: flex; gap: 10px; margin-bottom: 10px; flex-wrap: wrap;">
              <div style="flex: 1; min-width: 140px;">
                <label style="font-size: 11px; font-weight: 700; display: block; margin-bottom: 3px;">Date:</label>
                <select id="html-manual-date" class="compact-select" style="width: 100%;"></select>
              </div>
              <div>
                <label style="font-size: 11px; font-weight: 700; display: block; margin-bottom: 3px;">Start Time:</label>
                <input type="time" id="html-manual-start" value="17:00" step="60" style="padding: 4px 8px; border: 1px solid #CBD5E1; border-radius: 4px; font-size: 12px;" />
              </div>
              <div>
                <label style="font-size: 11px; font-weight: 700; display: block; margin-bottom: 3px;">End Time:</label>
                <input type="time" id="html-manual-end" value="18:00" step="60" style="padding: 4px 8px; border: 1px solid #CBD5E1; border-radius: 4px; font-size: 12px;" />
              </div>
            </div>
            <div style="display: flex; gap: 10px; align-items: flex-end;">
              <div style="flex: 1;">
                <label style="font-size: 11px; font-weight: 700; display: block; margin-bottom: 3px;">Label / Description:</label>
                <input type="text" id="html-manual-label" placeholder="e.g. Evening Peak Overdrawal" style="width: 100%; padding: 5px 8px; border: 1px solid #CBD5E1; border-radius: 4px; font-size: 12px;" />
              </div>
              <button class="action-btn" onclick="addManualSlotHtml()" style="background: #7C3AED; color: white; border-color: #6D28D9; font-weight: 700; white-space: nowrap;">+ Add Slot</button>
            </div>
            <div id="html-manual-error" style="color: #DC2626; font-size: 11.5px; margin-top: 6px; display: none;"></div>
          </div>
          <div style="font-weight: 800; font-size: 12.5px; color: #17365D; margin-bottom: 8px;">Configured Manual Slots:</div>
          <div style="overflow-x: auto; max-height: 200px;">
            <table class="styled-table" id="html-table-manual-slots">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Date</th>
                  <th>Time Window</th>
                  <th>Label</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody id="html-tbody-manual-slots">
                <tr><td colspan="5" style="text-align: center; color: var(--muted);">No manual slots added yet.</td></tr>
              </tbody>
            </table>
          </div>
        </div>
        <div style="padding: 12px 16px; background: #F8FAFC; border-top: 1px solid #E2E8F0; display: flex; justify-content: flex-end; gap: 10px;">
          <button class="action-btn" onclick="closeManualSlotsModalHtml()">Cancel</button>
          <button class="action-btn primary" onclick="applyManualSlotsHtml()">Apply Manual Slots</button>
        </div>
      </div>
    </div>
  </main>

  <script>
    const TABLES = {tables_json};
    let EVENT_CHARTS = {event_charts_json};
    const OD_DATA = {od_frequency_json};
    const HEATMAP_DATA = {state_heatmaps_json};
    const CONTINUOUS_DATA = {continuous_drawal_json};
    const FREQ_CURVES_DATA = {frequency_curves_json};

    const esc = (v) => String(v ?? '-').replace(/[&<>"']/g, c => ({{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}}[c]));
    const num = (v, digits=1) => v == null || !Number.isFinite(Number(v)) ? '—' : Number(v).toFixed(digits);

    // ==========================================
    // GLOBAL SECTION CONTROLS
    // ==========================================
    function toggleAllSections(open) {{
      document.querySelectorAll('.report-section-collapsible').forEach(s => {{
        s.open = open;
      }});
    }}

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
    // SECTION 2: FREQUENCY ANALYSIS CURVES (PUBLICATION QUALITY)
    // ==========================================
    const CURVE_TITLES = {{
      'daily_min_duration': 'Graph 1: Daily Minimum Frequency & Low-Frequency Duration',
      'duration_curve': 'Graph 2: Frequency Duration Curve (FDC)',
      'daily_profile': 'Graph 3: Average Daily 24-Hour Diurnal Profile'
    }};

    function openCurveModal(key) {{
      const imgUri = FREQ_CURVES_DATA.plots && FREQ_CURVES_DATA.plots[key];
      if (!imgUri) return;
      const title = CURVE_TITLES[key] || 'Frequency Analysis Curve';
      document.getElementById('modal-scatter-title').textContent = `${{title}} (High Resolution)`;
      document.getElementById('modal-scatter-img').src = imgUri;
      document.getElementById('modal-enlarge-scatter').style.display = 'flex';
    }}

    function initCurvesSection() {{
      const container = document.getElementById('curves-container');
      if (!container) return;
      const plots = FREQ_CURVES_DATA.plots || {{}};
      const keys = ['daily_min_duration', 'duration_curve', 'daily_profile'];
      const availableKeys = keys.filter(k => plots[k]);
      
      if (!availableKeys.length) {{
        container.innerHTML = '<div style="grid-column: 1/-1; padding: 24px; text-align: center; color: var(--muted);">No frequency analysis curves generated. Ensure 1-minute frequency data is available.</div>';
        return;
      }}

      availableKeys.forEach(key => {{
        const title = CURVE_TITLES[key] || key;
        const imgUri = plots[key];
        const card = document.createElement('div');
        card.className = 'curve-card';
        card.innerHTML = `
          <div class="curve-card-header">
            <h4>${{esc(title)}}</h4>
            <button class="action-btn" style="padding: 2px 8px; font-size: 11px; color: #17365D;" onclick="openCurveModal('${{key}}')">🔍 Enlarge</button>
          </div>
          <div class="curve-img-wrap" onclick="openCurveModal('${{key}}')" title="Click to enlarge graph">
            <img src="${{imgUri}}" alt="${{esc(title)}}" loading="lazy" />
          </div>
          <div class="curve-card-footer">
            <span style="font-size: 11px; color: var(--muted); font-weight: 600;">High-resolution publication curve</span>
            <div style="display: flex; gap: 8px;">
              <button class="action-btn" onclick="openCurveModal('${{key}}')">🔍 Enlarge</button>
              <a class="action-btn" href="${{imgUri}}" download="${{key}}.png">💾 Download PNG</a>
            </div>
          </div>
        `;
        container.appendChild(card);
      }});
    }}

    function downloadFrequencyCurvesZip() {{
      const b64 = FREQ_CURVES_DATA.zip_base64;
      if (!b64) {{
        alert("Frequency curves ZIP is not available for this session.");
        return;
      }}
      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {{
        bytes[i] = binary.charCodeAt(i);
      }}
      const blob = new Blob([bytes], {{ type: "application/zip" }});
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Frequency_Analysis_Curves.zip";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    }}

    // ==========================================
    // SECTION 3: RENDER STATE SCATTER PLOTS & STATS
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
          <div class="scatter-card-footer">
            <span style="font-size: 11px; color: var(--muted); font-weight: 600;">Full threshold statistics embedded in plot above</span>
            <div style="display: flex; gap: 8px;">
              <button class="action-btn" onclick="openScatterModal('${{esc(state)}}')">
                🔍 Enlarge Plot
              </button>
              <a class="action-btn" href="${{imgUri}}" download="${{state.replace(/[^A-Za-z0-9_-]+/g, '_')}}_OD_Frequency.png">
                💾 Download PNG
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
    // SUBSECTION 3.2: STATE PERFORMANCE BY HEATMAP (15-MINUTE TIME BLOCKS)
    // ==========================================
    let heatmapChartInstance = null;
    let currentHeatmapMode = 'publication';

    function blockTimeLabelJs(block) {{
      const startMin = (block - 1) * 15;
      const endMin = block * 15;
      const sh = String(Math.floor(startMin / 60)).padStart(2, '0');
      const sm = String(startMin % 60).padStart(2, '0');
      const eh = String(Math.floor(endMin / 60)).padStart(2, '0');
      const em = String(endMin % 60).padStart(2, '0');
      return `${{sh}}:${{sm}}–${{eh}}:${{em}}`;
    }}

    function initHeatmapSection() {{
      const select = document.getElementById('heatmap-state-select');
      const gridContainer = document.getElementById('heatmap-grid-container');
      const states = HEATMAP_DATA.states || Object.keys(HEATMAP_DATA.plots || {{}});

      if (!states.length) {{
        const pubContainer = document.getElementById('heatmap-pub-container');
        if (pubContainer) {{
          pubContainer.innerHTML =
            '<div style="padding: 24px; text-align: center; color: var(--muted);">No State OD/UI Heatmap data available. Ensure the uploaded workbook contains State schedule and actual columns.</div>';
        }}
        return;
      }}

      if (select) {{
        select.innerHTML = '';
        states.forEach((st, idx) => {{
          const opt = document.createElement('option');
          opt.value = st;
          opt.textContent = st;
          if (idx === 0) opt.selected = true;
          select.appendChild(opt);
        }});
      }}

      // Build Grid view
      if (gridContainer) {{
        gridContainer.innerHTML = '';
        states.forEach(st => {{
          const imgUri = HEATMAP_DATA.plots[st];
          const card = document.createElement('div');
          card.className = 'scatter-card';
          card.innerHTML = `
            <div class="scatter-card-header">
              <h4>${{esc(st)}}</h4>
              <div style="display: flex; align-items: center; gap: 8px;">
                <span class="measure-tag">OD/UI Heatmap</span>
                <button class="action-btn" style="padding: 2px 8px; font-size: 11px; color: #17365D;" onclick="openHeatmapModal('${{esc(st)}}')">🔍 Enlarge</button>
              </div>
            </div>
            <div class="scatter-img-wrap" style="cursor: zoom-in;" onclick="openHeatmapModal('${{esc(st)}}')" title="Click to enlarge">
              <img src="${{imgUri}}" alt="${{esc(st)}} Heatmap" loading="lazy" />
            </div>
            <div class="scatter-card-footer">
              <span style="font-size: 11px; color: var(--muted); font-weight: 600;">15-minute time block averages</span>
              <div style="display: flex; gap: 8px;">
                <button class="action-btn" onclick="openHeatmapModal('${{esc(st)}}')">🔍 Enlarge</button>
                <a class="action-btn" href="${{imgUri}}" download="${{st.replace(/[^A-Za-z0-9_-]+/g, '_')}}_OD_UI_Heatmap.png">💾 Save PNG</a>
              </div>
            </div>
          `;
          gridContainer.appendChild(card);
        }});
      }}

      onHeatmapStateChange();
    }}

    function onHeatmapStateChange() {{
      const select = document.getElementById('heatmap-state-select');
      const state = select ? select.value : '';
      if (!state) return;

      const imgUri = HEATMAP_DATA.plots && HEATMAP_DATA.plots[state];
      const imgEl = document.getElementById('heatmap-pub-img');
      if (imgEl && imgUri) {{
        imgEl.src = imgUri;
      }}

      // Render KPI cards
      const stats = HEATMAP_DATA.stats && HEATMAP_DATA.stats[state];
      const kpiContainer = document.getElementById('heatmap-kpi-container');
      if (kpiContainer && stats) {{
        kpiContainer.innerHTML = `
          <div style="flex: 1 1 200px; padding: 12px 14px; background: #FFFFFF; border: 1px solid #CBD5E1; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.03);">
            <div style="font-size: 10.5px; font-weight: 800; color: #64748B; text-transform: uppercase;">Peak 15-min OD/UI</div>
            <div style="font-size: 18px; font-weight: 900; color: #DC2626; margin-top: 2px;">${{stats.max_od.toLocaleString()}} MW</div>
            <div style="font-size: 10.5px; color: #64748B; margin-top: 2px;">Day ${{stats.max_od_day}}, Block ${{stats.max_od_block}} (${{stats.max_od_time}} IST)</div>
          </div>
          <div style="flex: 1 1 200px; padding: 12px 14px; background: #FFFFFF; border: 1px solid #CBD5E1; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.03);">
            <div style="font-size: 10.5px; font-weight: 800; color: #64748B; text-transform: uppercase;">Avg Positive OD</div>
            <div style="font-size: 18px; font-weight: 900; color: #D97706; margin-top: 2px;">${{stats.avg_od.toLocaleString()}} MW</div>
            <div style="font-size: 10.5px; color: #64748B; margin-top: 2px;">Mean overdrawal during adverse blocks</div>
          </div>
          <div style="flex: 1 1 200px; padding: 12px 14px; background: #FFFFFF; border: 1px solid #CBD5E1; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.03);">
            <div style="font-size: 10.5px; font-weight: 800; color: #64748B; text-transform: uppercase;">Overdrawal Blocks</div>
            <div style="font-size: 18px; font-weight: 900; color: #17365D; margin-top: 2px;">${{stats.od_blocks_count.toLocaleString()}} / ${{stats.total_blocks.toLocaleString()}}</div>
            <div style="font-size: 10.5px; color: #64748B; margin-top: 2px;">${{stats.od_percentage}}% of total 15-min intervals</div>
          </div>
          <div style="flex: 1 1 200px; padding: 12px 14px; background: #FFFFFF; border: 1px solid #CBD5E1; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.03);">
            <div style="font-size: 10.5px; font-weight: 800; color: #64748B; text-transform: uppercase;">Severe Blocks (&ge;500 MW)</div>
            <div style="font-size: 18px; font-weight: 900; color: ${{stats.severe_blocks_count > 0 ? '#DC2626' : '#059669'}}; margin-top: 2px;">${{stats.severe_blocks_count.toLocaleString()}} blocks</div>
            <div style="font-size: 10.5px; color: #64748B; margin-top: 2px;">Annotated with bold badges</div>
          </div>
        `;
      }}

      if (currentHeatmapMode === 'interactive') {{
        renderInteractiveHeatmap();
      }}
    }}

    function setHeatmapViewMode(mode) {{
      currentHeatmapMode = mode;
      const btnPub = document.getElementById('btn-heatmap-view-pub');
      const btnEch = document.getElementById('btn-heatmap-view-echarts');
      const btnGrid = document.getElementById('btn-heatmap-view-grid');
      if (btnPub) btnPub.classList.toggle('active', mode === 'publication');
      if (btnEch) btnEch.classList.toggle('active', mode === 'interactive');
      if (btnGrid) btnGrid.classList.toggle('active', mode === 'grid');

      const pubCont = document.getElementById('heatmap-pub-container');
      const echCont = document.getElementById('heatmap-interactive-container');
      const gridCont = document.getElementById('heatmap-grid-container');
      if (pubCont) pubCont.style.display = mode === 'publication' ? 'block' : 'none';
      if (echCont) echCont.style.display = mode === 'interactive' ? 'block' : 'none';
      if (gridCont) gridCont.style.display = mode === 'grid' ? 'grid' : 'none';

      if (mode === 'interactive') {{
        renderInteractiveHeatmap();
      }}
    }}

    function renderInteractiveHeatmap() {{
      const select = document.getElementById('heatmap-state-select');
      const state = select ? select.value : '';
      const chartEl = document.getElementById('heatmap-echarts');
      if (!chartEl || !state) return;

      if (!heatmapChartInstance) {{
        heatmapChartInstance = echarts.init(chartEl);
      }}

      const activeData = HEATMAP_DATA.interactive && HEATMAP_DATA.interactive[state];
      if (!activeData) return;

      const {{ days, blocks, matrix, schedule_matrix, actual_matrix, raw_deviation_matrix }} = activeData;
      const seriesData = [];
      let maxVal = 100;
      for (let dIdx = 0; dIdx < days.length; dIdx++) {{
        for (let bIdx = 0; bIdx < blocks.length; bIdx++) {{
          const val = matrix[dIdx]?.[bIdx] ?? 0;
          const sch = schedule_matrix?.[dIdx]?.[bIdx] ?? 0;
          const act = actual_matrix?.[dIdx]?.[bIdx] ?? 0;
          const rawDev = raw_deviation_matrix?.[dIdx]?.[bIdx] ?? 0;
          if (val > maxVal) maxVal = val;
          seriesData.push([bIdx, dIdx, Math.round(val), Math.round(sch), Math.round(act), Math.round(rawDev)]);
        }}
      }}

      const xTicks = [0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 64, 68, 72, 76, 80, 84, 88, 92];

      const opt = {{
        tooltip: {{
          position: 'top',
          formatter: function(params) {{
            const [bIdx, dIdx, val, sch, act, rawDev] = params.data;
            const day = days[dIdx];
            const block = blocks[bIdx];
            const timeRange = blockTimeLabelJs(block);
            return `<div style="font-family: sans-serif; font-size: 12px; line-height: 1.5;">
              <div style="font-weight: 800; color: #17365D; border-bottom: 1px solid #CBD5E1; padding-bottom: 3px; margin-bottom: 4px;">
                ${{esc(state)}} — Day ${{day}}, Block ${{block}} (${{timeRange}} IST)
              </div>
              <div>Positive Deviation (OD/UI): <strong style="color: ${{val >= 500 ? '#DC2626' : val > 0 ? '#D97706' : '#10B981'}};">${{val.toLocaleString()}} MW</strong></div>
              <div>Average Actual: <strong>${{act.toLocaleString()}} MW</strong></div>
              <div>Average Schedule: <strong>${{sch.toLocaleString()}} MW</strong></div>
              <div>Net Deviation: <strong>${{rawDev > 0 ? `+${{rawDev.toLocaleString()}}` : rawDev.toLocaleString()}} MW</strong></div>
            </div>`;
          }}
        }},
        grid: {{
          top: 45,
          left: 60,
          right: 80,
          bottom: 60
        }},
        xAxis: {{
          type: 'category',
          data: blocks.map(b => String(b)),
          name: 'Time Block (1-96; 15-minute blocks)',
          nameLocation: 'middle',
          nameGap: 36,
          nameTextStyle: {{ fontWeight: 'bold', fontSize: 11, color: '#1E293B' }},
          splitArea: {{ show: false }},
          splitLine: {{ show: true, lineStyle: {{ color: '#FFFFFF', width: 0.5 }} }},
          axisLabel: {{
            interval: (index) => xTicks.includes(index),
            formatter: (v) => v,
            fontSize: 10
          }}
        }},
        yAxis: {{
          type: 'category',
          data: days.map(d => String(d)),
          name: 'Day of the Month',
          nameLocation: 'middle',
          nameGap: 42,
          nameTextStyle: {{ fontWeight: 'bold', fontSize: 11, color: '#1E293B' }},
          splitArea: {{ show: false }},
          splitLine: {{ show: true, lineStyle: {{ color: '#FFFFFF', width: 0.5 }} }},
          axisLabel: {{ fontSize: 10 }}
        }},
        visualMap: {{
          min: 0,
          max: Math.ceil(maxVal / 100) * 100,
          calculable: true,
          orient: 'vertical',
          right: 5,
          top: 'middle',
          itemHeight: 180,
          inRange: {{
            color: ['#FFFFD4', '#FED976', '#FEB24C', '#FD8D3C', '#F03B20', '#BD0026', '#800026']
          }},
          text: ['High MW', '0 MW'],
          textStyle: {{ fontSize: 10, fontWeight: 'bold' }}
        }},
        series: [{{
          name: 'OD/UI (MW)',
          type: 'heatmap',
          data: seriesData,
          label: {{
            show: true,
            formatter: (params) => {{
              const val = params.data[2];
              return val >= 500 ? String(val) : '';
            }},
            fontSize: 8.5,
            fontWeight: 'bold',
            color: '#FFFFFF',
            backgroundColor: 'rgba(0,0,0,0.85)',
            padding: [2, 3],
            borderRadius: 3
          }},
          itemStyle: {{
            borderColor: '#FFFFFF',
            borderWidth: 0.5
          }},
          emphasis: {{
            itemStyle: {{
              shadowBlur: 10,
              shadowColor: 'rgba(0, 0, 0, 0.5)',
              borderColor: '#1E3A8A',
              borderWidth: 1.5
            }}
          }}
        }}]
      }};

      heatmapChartInstance.setOption(opt);
      heatmapChartInstance.resize();
    }}

    function downloadCurrentHeatmapPng() {{
      const select = document.getElementById('heatmap-state-select');
      const state = select ? select.value : '';
      if (!state) return;
      const imgUri = HEATMAP_DATA.plots && HEATMAP_DATA.plots[state];
      if (!imgUri) return;
      const a = document.createElement('a');
      a.href = imgUri;
      a.download = `${{state.replace(/[^A-Za-z0-9_-]+/g, '_')}}_OD_UI_Heatmap.png`;
      a.click();
    }}

    function downloadHeatmapZip() {{
      if (HEATMAP_DATA.zip_base64) {{
        const a = document.createElement('a');
        a.href = 'data:application/zip;base64,' + HEATMAP_DATA.zip_base64;
        a.download = `State_OD_UI_Heatmaps_${{HEATMAP_DATA.period || 'month'}}.zip`;
        a.click();
      }} else {{
        alert('Heatmap ZIP package not available in this session.');
      }}
    }}

    function downloadHeatmapExcel() {{
      if (HEATMAP_DATA.excel_base64) {{
        const a = document.createElement('a');
        a.href = 'data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,' + HEATMAP_DATA.excel_base64;
        a.download = `State_OD_UI_Heatmap_Data_${{HEATMAP_DATA.period || 'month'}}.xlsx`;
        a.click();
      }} else {{
        alert('Heatmap spreadsheet not available in this session.');
      }}
    }}

    function openHeatmapModal(st) {{
      const select = document.getElementById('heatmap-state-select');
      const state = st || (select ? select.value : '');
      const imgUri = HEATMAP_DATA.plots && HEATMAP_DATA.plots[state];
      if (!imgUri) return;
      document.getElementById('modal-scatter-title').textContent = `${{state}} — ${{HEATMAP_DATA.period}}: OD/UI Heatmap (15-minute Time Blocks)`;
      document.getElementById('modal-scatter-img').src = imgUri;
      document.getElementById('modal-enlarge-scatter').style.display = 'flex';
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
            data: [
              {{ name: 'Schedule (MW)', itemStyle: {{ color: '#4F46E5' }} }},
              {{ name: 'Actual drawal (MW)', itemStyle: {{ color: '#059669' }} }}
            ],
            textStyle: {{ fontSize: 11, fontWeight: 700, color: '#334155' }}
          }},
          {{
            top: '35.5%',
            left: 75,
            data: [
              {{ name: 'Over drawal', itemStyle: {{ color: '#D97706' }} }},
              {{ name: 'Under drawal', itemStyle: {{ color: '#0284C7' }} }}
            ],
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
            nameTextStyle: {{ fontWeight: 800, color: '#7C3AED', fontSize: 11 }},
            scale: true,
            min: 49.40,
            max: 50.35,
            axisLabel: {{ fontSize: 10, color: '#7C3AED', formatter: v => v.toFixed(2) }},
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
            lineStyle: {{ width: 2.2, color: '#4F46E5' }},
            itemStyle: {{ color: '#4F46E5' }},
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
            lineStyle: {{ width: 2.2, color: '#059669' }},
            itemStyle: {{ color: '#059669' }}
          }},
          {{
            name: 'Over drawal',
            type: 'line',
            xAxisIndex: 1,
            yAxisIndex: 1,
            data: overDrawal,
            showSymbol: false,
            lineStyle: {{ width: 0 }},
            itemStyle: {{ color: '#D97706' }},
            areaStyle: {{ color: 'rgba(234, 179, 8, 0.38)', origin: 0 }},
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
            itemStyle: {{ color: '#0284C7' }},
            areaStyle: {{ color: 'rgba(6, 182, 212, 0.35)', origin: 0 }}
          }},
          {{
            name: 'Deviation (MW)',
            type: 'line',
            xAxisIndex: 1,
            yAxisIndex: 1,
            data: deviation,
            showSymbol: false,
            lineStyle: {{ width: 1.6, color: '#059669' }},
            itemStyle: {{ color: '#059669' }},
            markLine: {{
              silent: true,
              symbol: 'none',
              data: [{{ yAxis: 0 }}],
              lineStyle: {{ color: '#17365D', width: 1.5 }}
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
            lineStyle: {{ width: 1.8, color: '#7C3AED' }},
            itemStyle: {{ color: '#7C3AED' }},
            markLine: {{
              silent: true,
              symbol: 'none',
              data: [
                {{ yAxis: 50.05, lineStyle: {{ color: '#D97706', type: 'dotted', width: 1.2 }}, label: {{ formatter: '50.05 Hz', position: 'insideStartTop' }} }},
                {{ yAxis: 50.00, lineStyle: {{ color: '#94A3B8', type: 'dotted', width: 1 }}, label: {{ formatter: '50.00 Hz', position: 'insideStartTop' }} }},
                {{ yAxis: 49.90, lineStyle: {{ color: '#DC2626', type: 'dashed', width: 1.5 }}, label: {{ formatter: '49.90 Hz', position: 'insideStartTop' }} }},
                {{ yAxis: 49.50, lineStyle: {{ color: '#991B1B', type: 'dashed', width: 1.5 }}, label: {{ formatter: '49.50 Hz', position: 'insideStartTop' }} }}
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
    // SECTION 4.2: DISCRETE EVENT CHARTS & SLOTTING
    // ==========================================
    let eventChartInstances = [];
    let htmlCandidateDips = (CONTINUOUS_DATA && CONTINUOUS_DATA.candidate_dips) || [];
    let htmlSelectedDipIds = new Set(htmlCandidateDips.filter(d => d.auto_qualified).map(d => d.id));
    let htmlManualSlots = [];
    let htmlSlotMode = 'auto';

    function updateSlottingModeBadgeHtml(modeText) {{
      const b = document.getElementById('html-slotting-mode-badge');
      if (b) b.textContent = modeText;
    }}

    function buildEventChartsFromSlotsHtml(slots) {{
      if (!CONTINUOUS_DATA || !CONTINUOUS_DATA.timestamps || !slots || !slots.length) return [];
      const timestamps = CONTINUOUS_DATA.timestamps;
      const total = timestamps.length;
      const states = Object.keys(CONTINUOUS_DATA.states || {{}});
      const charts = [];

      slots.forEach((slot, slotIdx) => {{
        const eventIndex = slotIdx + 1;
        let sIdx = slot.start_idx != null ? slot.start_idx : timestamps.indexOf(slot.start_time);
        let eIdx = slot.end_idx != null ? slot.end_idx : timestamps.indexOf(slot.end_time);

        if (sIdx < 0 && slot.date && slot.start_time) {{
          const combinedStart = `${{slot.date}} ${{slot.start_time.slice(0, 5)}}`;
          sIdx = timestamps.findIndex(t => t.startsWith(combinedStart));
        }}
        if (eIdx < 0 && slot.date && slot.end_time) {{
          const combinedEnd = `${{slot.date}} ${{slot.end_time.slice(0, 5)}}`;
          eIdx = timestamps.findIndex(t => t.startsWith(combinedEnd));
        }}

        if (sIdx < 0) sIdx = 0;
        if (eIdx < 0 || eIdx < sIdx) eIdx = Math.min(sIdx + 60, total - 1);

        const padStart = Math.max(0, sIdx - 15);
        const padEnd = Math.min(total - 1, eIdx + 15);

        const sliceTs = timestamps.slice(padStart, padEnd + 1);
        const sliceFreq = (CONTINUOUS_DATA.frequency || []).slice(padStart, padEnd + 1);

        const startTimeStr = timestamps[sIdx] || slot.start_time || "";
        const endTimeStr = timestamps[eIdx] || slot.end_time || "";
        const label = slot.label || `Event ${{eventIndex}} | ${{startTimeStr.slice(0, 10)}} | ${{startTimeStr.slice(11, 16)}} - ${{endTimeStr.slice(11, 16)}}`;

        states.forEach(stName => {{
          const stData = (CONTINUOUS_DATA.states && CONTINUOUS_DATA.states[stName]) || {{}};
          const sliceDev = (stData.deviation || []).slice(padStart, padEnd + 1);
          const sliceSch = (stData.schedule || []).slice(padStart, padEnd + 1);
          const sliceAct = (stData.actual || []).slice(padStart, padEnd + 1);

          const padStartTs = timestamps[padStart];
          const padEndTs = timestamps[padEnd];

          const relCrms = (stData.crms_messages || []).filter(m => {{
            const mTs = (m.timestamp || m.message_date || "").slice(0, 16);
            return mTs >= padStartTs && mTs <= padEndTs;
          }});

          const relTrans = (stData.transmission_line_events || []).filter(ev => {{
            const evTs = (ev.timestamp || ev.outage_date_time || "").slice(0, 16);
            return evTs >= padStartTs && evTs <= padEndTs;
          }});

          charts.push({{
            event_id: `${{stName}}:${{eventIndex}}`,
            event_index: eventIndex,
            event_name: label,
            event_type: "low",
            state: stName,
            start_time: startTimeStr,
            end_time: endTimeStr,
            series: {{
              timestamps: sliceTs,
              frequency: sliceFreq,
              deviation: sliceDev,
              schedule: sliceSch,
              actual: sliceAct,
            }},
            transmission_line_events: relTrans,
            crms_messages: relCrms,
          }});
        }});
      }});

      return charts;
    }}

    function rebindEventFilters() {{
      const stateSelect = document.getElementById('event-state-filter');
      const slotSelect = document.getElementById('event-slot-filter');
      const curState = stateSelect.value;
      const curSlot = slotSelect.value;

      stateSelect.innerHTML = '<option value="ALL">All States</option>';
      slotSelect.innerHTML = '<option value="ALL">All Events</option>';

      const states = [...new Set(EVENT_CHARTS.map(e => e.state))].sort();
      const slots = [...new Set(EVENT_CHARTS.map(e => e.event_index))].sort((a,b) => a-b);

      states.forEach(s => {{
        const opt = document.createElement('option');
        opt.value = s;
        opt.textContent = s;
        if (s === curState) opt.selected = true;
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
        if (String(s) === curSlot) opt.selected = true;
        slotSelect.appendChild(opt);
      }});
    }}

    function selectAutoModeHtml() {{
      htmlSlotMode = 'auto';
      const autoDips = htmlCandidateDips.filter(d => d.auto_qualified);
      const chosen = autoDips.length ? autoDips : htmlCandidateDips.slice(0, 3);
      if (chosen.length) {{
        EVENT_CHARTS = buildEventChartsFromSlotsHtml(chosen);
        rebindEventFilters();
        renderEventCards();
      }}
      updateSlottingModeBadgeHtml(`⚡ Auto Detect Active (${{chosen.length}} Events: F < 49.9 > 15m or < 49.5 > 5m)`);
      document.getElementById('btn-html-slot-auto').style.background = '#059669';
      document.getElementById('btn-html-slot-auto').style.color = '#FFFFFF';
      document.getElementById('btn-html-slot-select').style.background = '';
      document.getElementById('btn-html-slot-select').style.color = '';
      document.getElementById('btn-html-slot-manual').style.background = '';
      document.getElementById('btn-html-slot-manual').style.color = '';
    }}

    function openSelectDipsModalHtml() {{
      const tbody = document.getElementById('html-tbody-candidate-dips');
      tbody.innerHTML = '';
      if (!htmlCandidateDips.length) {{
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--muted); padding: 20px;">No detected frequency dips in dataset.</td></tr>';
      }} else {{
        htmlCandidateDips.forEach((dip, idx) => {{
          const isChecked = htmlSelectedDipIds.has(dip.id);
          const tr = document.createElement('tr');
          tr.style.cursor = 'pointer';
          tr.onclick = (e) => {{
            if (e.target.tagName !== 'INPUT') {{
              const cb = tr.querySelector('input[type="checkbox"]');
              if (cb) {{ cb.checked = !cb.checked; toggleDipHtml(dip.id, cb.checked); }}
            }}
          }};
          tr.innerHTML = `
            <td style="text-align: center;"><input type="checkbox" ${{isChecked ? 'checked' : ''}} onchange="toggleDipHtml('${{dip.id}}', this.checked)"></td>
            <td style="font-weight: 700;">${{idx + 1}}</td>
            <td>${{esc(dip.date)}}</td>
            <td style="font-weight: 800; color: #17365D;">${{esc(dip.time_window || (dip.start_time.slice(11,16) + ' – ' + dip.end_time.slice(11,16)))}}</td>
            <td>${{dip.duration_min}} min</td>
            <td style="font-weight: 800; color: ${{dip.min_freq < 49.5 ? '#DC2626' : (dip.min_freq < 49.7 ? '#EA580C' : '#7C3AED')}};">${{num(dip.min_freq, 3)}} Hz</td>
            <td style="color: ${{dip.c495_min > 0 ? '#DC2626' : 'var(--muted)'}}; font-weight: 700;">${{dip.c495_min > 0 ? dip.c495_min + ' min' : '—'}}</td>
            <td>${{dip.auto_qualified ? '<span style=\"background:#ECFDF5; color:#065F46; border:1px solid #A7F3D0; padding:2px 8px; border-radius:4px; font-weight:800; font-size:10px;\">✓ Auto-Qualified</span>' : '<span style=\"background:#F1F5F9; color:#475569; border:1px solid #CBD5E1; padding:2px 8px; border-radius:4px; font-size:10px;\">Dip &lt; 49.90</span>'}}</td>
          `;
          tbody.appendChild(tr);
        }});
      }}
      updateDipsSelectedCountHtml();
      document.getElementById('modal-select-dips').style.display = 'flex';
    }}

    function closeSelectDipsModalHtml() {{
      document.getElementById('modal-select-dips').style.display = 'none';
    }}

    function toggleDipHtml(id, isChecked) {{
      if (isChecked) htmlSelectedDipIds.add(id);
      else htmlSelectedDipIds.delete(id);
      updateDipsSelectedCountHtml();
    }}

    function updateDipsSelectedCountHtml() {{
      document.getElementById('html-dips-selected-count').textContent = `${{htmlSelectedDipIds.size}} of ${{htmlCandidateDips.length}} selected`;
    }}

    function selectAllAutoDipsHtml() {{
      htmlSelectedDipIds = new Set(htmlCandidateDips.filter(d => d.auto_qualified).map(d => d.id));
      document.querySelectorAll('#html-tbody-candidate-dips input[type="checkbox"]').forEach((cb, idx) => {{
        cb.checked = htmlCandidateDips[idx] && htmlCandidateDips[idx].auto_qualified;
      }});
      updateDipsSelectedCountHtml();
    }}

    function selectAllDipsHtml() {{
      htmlSelectedDipIds = new Set(htmlCandidateDips.map(d => d.id));
      document.querySelectorAll('#html-tbody-candidate-dips input[type="checkbox"]').forEach(cb => cb.checked = true);
      updateDipsSelectedCountHtml();
    }}

    function clearAllDipsHtml() {{
      htmlSelectedDipIds.clear();
      document.querySelectorAll('#html-tbody-candidate-dips input[type="checkbox"]').forEach(cb => cb.checked = false);
      updateDipsSelectedCountHtml();
    }}

    function applyDipsSelectionHtml() {{
      const chosen = htmlCandidateDips.filter(d => htmlSelectedDipIds.has(d.id));
      if (!chosen.length) {{
        alert('Please select at least one frequency event dip.');
        return;
      }}
      htmlSlotMode = 'select';
      EVENT_CHARTS = buildEventChartsFromSlotsHtml(chosen);
      rebindEventFilters();
      renderEventCards();
      updateSlottingModeBadgeHtml(`📋 Custom Selection: ${{chosen.length}} Dips Plotted`);
      document.getElementById('btn-html-slot-select').style.background = '#2563EB';
      document.getElementById('btn-html-slot-select').style.color = '#FFFFFF';
      document.getElementById('btn-html-slot-auto').style.background = '';
      document.getElementById('btn-html-slot-auto').style.color = '';
      document.getElementById('btn-html-slot-manual').style.background = '';
      document.getElementById('btn-html-slot-manual').style.color = '';
      closeSelectDipsModalHtml();
    }}

    function openManualSlotsModalHtml() {{
      const dateSelect = document.getElementById('html-manual-date');
      dateSelect.innerHTML = '';
      const dates = (CONTINUOUS_DATA && CONTINUOUS_DATA.unique_dates) || [];
      dates.forEach(d => {{
        const opt = document.createElement('option');
        opt.value = d;
        opt.textContent = d;
        dateSelect.appendChild(opt);
      }});
      document.getElementById('html-manual-error').style.display = 'none';
      renderManualSlotsTableHtml();
      document.getElementById('modal-manual-slots').style.display = 'flex';
    }}

    function closeManualSlotsModalHtml() {{
      document.getElementById('modal-manual-slots').style.display = 'none';
    }}

    function addManualSlotHtml() {{
      const dt = document.getElementById('html-manual-date').value;
      const s = document.getElementById('html-manual-start').value;
      const e = document.getElementById('html-manual-end').value;
      const lbl = document.getElementById('html-manual-label').value.trim();
      const errEl = document.getElementById('html-manual-error');
      errEl.style.display = 'none';

      if (!dt) {{ errEl.textContent = 'Please select a date.'; errEl.style.display = 'block'; return; }}
      if (!s || !e) {{ errEl.textContent = 'Please enter start and end time.'; errEl.style.display = 'block'; return; }}
      if (s >= e) {{ errEl.textContent = 'Start time must be before end time.'; errEl.style.display = 'block'; return; }}

      htmlManualSlots.push({{
        id: 'man-' + Date.now() + '-' + (htmlManualSlots.length + 1),
        date: dt,
        start_time: `${{dt}} ${{s}}`,
        end_time: `${{dt}} ${{e}}`,
        label: lbl || `Manual Event #${{htmlManualSlots.length + 1}} (${{dt.slice(5)}} ${{s}}–${{e}})`
      }});
      document.getElementById('html-manual-label').value = '';
      renderManualSlotsTableHtml();
    }}

    function deleteManualSlotHtml(idx) {{
      htmlManualSlots.splice(idx, 1);
      renderManualSlotsTableHtml();
    }}

    function renderManualSlotsTableHtml() {{
      const tbody = document.getElementById('html-tbody-manual-slots');
      tbody.innerHTML = '';
      if (!htmlManualSlots.length) {{
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--muted); padding: 12px;">No manual slots added yet.</td></tr>';
      }} else {{
        htmlManualSlots.forEach((slot, idx) => {{
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td style="font-weight:700;">${{idx + 1}}</td>
            <td>${{esc(slot.date)}}</td>
            <td style="font-weight:800; color:#17365D;">${{esc(slot.start_time.slice(11,16))}} – ${{esc(slot.end_time.slice(11,16))}}</td>
            <td>${{esc(slot.label)}}</td>
            <td><button class="action-btn" onclick="deleteManualSlotHtml(${{idx}})" style="color:#DC2626; border-color:#FCA5A5; padding:2px 6px;">✕</button></td>
          `;
          tbody.appendChild(tr);
        }});
      }}
    }}

    function applyManualSlotsHtml() {{
      if (!htmlManualSlots.length) {{
        const errEl = document.getElementById('html-manual-error');
        errEl.textContent = 'Please add at least one manual slot before applying.';
        errEl.style.display = 'block';
        return;
      }}
      htmlSlotMode = 'manual';
      EVENT_CHARTS = buildEventChartsFromSlotsHtml(htmlManualSlots);
      rebindEventFilters();
      renderEventCards();
      updateSlottingModeBadgeHtml(`➕ Manual Slots: ${{htmlManualSlots.length}} Plotted`);
      document.getElementById('btn-html-slot-manual').style.background = '#7C3AED';
      document.getElementById('btn-html-slot-manual').style.color = '#FFFFFF';
      document.getElementById('btn-html-slot-auto').style.background = '';
      document.getElementById('btn-html-slot-auto').style.color = '';
      document.getElementById('btn-html-slot-select').style.background = '';
      document.getElementById('btn-html-slot-select').style.color = '';
      closeManualSlotsModalHtml();
    }}

    function initEventCharts() {{
      rebindEventFilters();
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
      if (heatmapChartInstance) heatmapChartInstance.resize();
      eventChartInstances.forEach(c => c.resize());
    }});

    // Initialize all sections
    initCurvesSection();
    initScatterSection();
    initHeatmapSection();
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

        # Retrieve or generate publication Frequency Analysis Curves
        frequency_curves_data = session.get('frequency_curves')
        if not frequency_curves_data and raw_source is not None:
            try:
                from services.frequency_curves_service import generate_all_frequency_curves
                frequency_curves_data = generate_all_frequency_curves(
                    source=raw_source,
                    start_date=start_date,
                    end_date=end_date,
                    dpi=300
                )
                session['frequency_curves'] = frequency_curves_data
            except Exception as exc:
                print(f"Compact HTML frequency curves generation note: {exc}")

        # Retrieve or generate State Performance Heatmaps (15-minute time blocks)
        state_heatmaps_data = session.get('state_heatmaps')
        if not state_heatmaps_data:
            try:
                from services.state_heatmap_service import generate_all_state_heatmaps
                src = session.get('dataset') or raw_source
                if src is not None:
                    state_heatmaps_data = generate_all_state_heatmaps(
                        source=src,
                        start_date=start_date,
                        end_date=end_date,
                        dpi=250
                    )
                    session['state_heatmaps'] = state_heatmaps_data
            except Exception as exc:
                print(f"Compact HTML state heatmaps generation note: {exc}")

        html_doc = html_report(
            tables,
            title,
            event['warnings'],
            session=session,
            result=result,
            event_charts_data=event_charts_data,
            od_frequency=od_frequency,
            event_tables=event_tables_data,
            frequency_curves=frequency_curves_data,
            state_heatmaps=state_heatmaps_data,
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
