"""Source-derived monthly report model, independent of document rendering."""
import calendar
from datetime import date
import numpy as np
from services import frequency_analysis_sessions as sessions
from services.frequency_threshold_analysis import calculate, iso, merge_ranges, seconds, segments

LEVELS = ('49.50', '49.70', '49.90')
CATEGORIES = ('Non-Compliance', 'Extreme Emergency', 'Emergency', 'Alert', 'Warning', 'Deviation Emergency')


def samples(dataset, ranges):
    if not ranges:
        return np.array([], dtype=int), np.array([]), np.array([]), np.array([])
    try:
        index, left, right = segments(dataset, merge_ranges(ranges))
    except ValueError as exc:
        if 'No uploaded readings' not in str(exc):
            raise
        return np.array([], dtype=int), np.array([]), np.array([]), np.array([])
    frequency = dataset['frequency'][index].copy()
    frequency[frequency < 45] = np.nan
    return index, left, right, frequency


def frequency_statistics(dataset, ranges):
    _, left, right, frequency = samples(dataset, ranges)
    valid = np.isfinite(frequency)
    weights = right - left
    covered = float(weights[valid].sum() / 60)
    selected = sum(b-a for a,b in merge_ranges(ranges))/60
    minimum = int(np.nanargmin(frequency)) if valid.any() else None
    thresholds = {}
    for level in LEVELS:
        mask = valid & (frequency < float(level))
        minutes = float(weights[mask].sum()/60) if valid.any() else None
        thresholds[level] = {'minutes': minutes, 'percent': minutes/covered*100 if covered else None,
                             'days': len(set(np.floor(left[mask]/86400))) if valid.any() else None}
    normal = float(weights[valid & (frequency >= 49.90) & (frequency <= 50.05)].sum()/60)
    above = float(weights[valid & (frequency > 50.05)].sum()/60)
    return {'minimum': float(frequency[minimum]) if minimum is not None else None,
            'minimum_time': iso(left[minimum]) if minimum is not None else None,
            'covered_minutes': covered, 'calendar_minutes': selected,
            'covered_days': len(set(np.floor(left[valid]/86400))), 'thresholds': thresholds,
            'normal_percent': normal/covered*100 if covered else None,
            'above_percent': above/covered*100 if covered else None}


def performance_rows(dataset, ranges, entities, chronology, complete, period, slot=None):
    """Reuse the operational signed-MW and duration calculation conventions."""
    rows = []
    stats = None
    if ranges:
        try:
            stats = calculate({**dataset, 'entities': entities}, ranges, chronology, complete, include_blocks=False)
        except ValueError as exc:
            if 'No valid frequency' not in str(exc) and 'No uploaded readings' not in str(exc):
                raise
    for entity in entities:
        row = next((r for r in (stats or {}).get('overall_performance', {}).get(entity['group'], [])
                    if r['entity_id'] == entity['entity_id']), None)
        if row is None:
            row = {'entity_id': entity['entity_id'], 'entity': entity['display_name'], 'lowest_frequency': None,
                   'thresholds': {level: dict.fromkeys(('frequency_minutes', 'adverse_minutes', 'adverse_pct',
                    'average_od_ui_mw', 'maximum_od_ui_mw', 'message_count', 'unknown_deviation_minutes')) for level in LEVELS}}
        rows.append({**row, 'group': entity['group'], 'date': period, 'event': slot,
                     'minimum_timestamp': stats['summary']['minimum_timestamp'] if stats else None,
                     'selected_ranges': ranges})
        if entity.get('unavailable'):
            rows[-1]['thresholds']={level:{**v, **dict.fromkeys(('adverse_minutes','adverse_pct','average_od_ui_mw','maximum_od_ui_mw','message_count'))}
                                    for level,v in rows[-1]['thresholds'].items()}
    return rows


def message_summary(entities, chronology, complete):
    counts = {e['entity_id']: {c: set() for c in CATEGORIES} for e in entities}
    unknown = set()
    aliases = {'non compliance': 'Non-Compliance', 'extreme emergency': 'Extreme Emergency',
               'emergency': 'Emergency', 'alert': 'Alert', 'warning': 'Warning',
               'deviation emergency': 'Deviation Emergency'}
    for row in chronology:
        identity = row.get('entity_id')
        if row.get('record_kind') == 'physical' or identity not in counts:
            continue
        raw = row.get('message_categories') or [row.get('message_type') or '']
        if isinstance(raw, str): raw = [raw]
        for category in raw:
            category = aliases.get(str(category).lower().replace('-', ' ').replace('_', ' ').strip())
            if category:
                counts[identity][category].add((row['timestamp'], row.get('message_no'), row.get('message_details')))
            else:
                unknown.add(identity)
    rows = []
    for entity in entities:
        values = {c: len(v) if complete and not entity.get('unavailable') and entity['entity_id'] not in unknown else None
                  for c,v in counts[entity['entity_id']].items()}
        rows.append({'entity': entity['display_name'], 'group': entity['group'], **values,
                     'total': sum(values.values()) if all(v is not None for v in values.values()) else None})
    return rows, ['Unclassified message categories: category totals are unavailable for affected recipients.'] if unknown else []


def defence_records(dataset, start, end):
    """Only explicit structured operations qualify; CRMS outages are not inferred as ADMS/UFR."""
    output = {'adms': [], 'ufr': []}
    for kind in output:
        for source in dataset.get(kind+'_operations') or []:
            stamp = source.get('operation_time') or source.get('timestamp') or source.get('date')
            try:
                moment = seconds(stamp)
            except (ValueError, TypeError):
                continue
            if start <= moment < end:
                output[kind].append({**source, 'date': iso(moment)[:10], 'operation_time': iso(moment)})
        output[kind].sort(key=lambda r:r['operation_time'])
    return output


def adms_statistics(records):
    due=sum(r['condition_met'] for r in records) if records and all(isinstance(r.get('condition_met'),bool) for r in records) else None
    operated=sum(r['actually_operated'] for r in records) if records and all(isinstance(r.get('actually_operated'),bool) for r in records) else None
    effective=sum(r['actually_operated'] and r['condition_met'] for r in records) if due is not None and operated is not None else None
    return {'due':due,'operated':operated,'effectiveness':effective/due*100 if due and effective is not None else None}


def frequency_heatmap(dataset, days):
    """15-minute minimum severity with separate counts of continuous excursion starts by hour."""
    matrix = []; histogram = np.zeros(24, dtype=int)
    for day in days:
        _, left, right, freq = samples(dataset, day['ranges'])
        base = seconds(day['date']+'T00:00:00')
        cells = np.full(96, np.nan)
        for cell in range(96):
            values = freq[(left < base+(cell+1)*900) & (right > base+cell*900)]
            if np.isfinite(values).any(): cells[cell] = float(np.nanmin(values))
        matrix.append(cells)
    # Count starts once across midnight; splitting into display days must not add excursions.
    _,left,right,freq=samples(dataset,[(days[0]['ranges'][0][0],days[-1]['ranges'][0][1])])
    active=np.isfinite(freq)&(freq<49.90)
    for at in np.flatnonzero(active):
        if at==0 or not active[at-1] or abs(left[at]-right[at-1])>1e-6:
            histogram[int((left[at]%86400)//3600)]+=1
    return {'values': matrix, 'occurrences': histogram.tolist(), 'days': [d['date'] for d in days]}


def state_heatmaps(daily_rows, entities, days):
    names = [e['display_name'] for e in entities if e['group'] == 'State']
    output = {'entities': names, 'days': [d['date'] for d in days], 'maximum': [], 'duration': []}
    for name in names:
        rows = {r['date']:r['thresholds']['49.90'] for r in daily_rows if r['entity'] == name and r['group'] == 'State'}
        for target, metric in [('maximum','maximum_od_ui_mw'), ('duration','adverse_pct')]:
            output[target].append([rows.get(d['date'],{}).get(metric) for d in days])
    return output


def monthly_model(session, result, payload):
    source = session['dataset']
    frequency = source['frequency'].copy(); frequency[frequency < 45] = np.nan
    dataset = {**source, 'frequency': frequency}
    month = payload.reporting_month or result['summary']['analysis_start'][:7]
    year, month_number = map(int, month.split('-'))
    start = seconds(date(year, month_number, 1).isoformat())
    day_count = calendar.monthrange(year, month_number)[1]; end = start + day_count*86400
    full_ranges = [(iso(start), iso(end))]
    days = [{'date':iso(start+n*86400)[:10], 'ranges':[(iso(start+n*86400),iso(start+(n+1)*86400))]} for n in range(day_count)]
    events = []
    for event in sessions.period_windows(result, 'event'):
        ranges = [(iso(max(start,seconds(a))),iso(min(end,seconds(b)))) for a,b in event['ranges'] if seconds(a)<end and seconds(b)>start]
        if ranges: events.append({**event, 'ranges': ranges})
    chronology, warnings = sessions.report_chronology(session, result)
    chronology = [r for r in chronology if r.get('timestamp') and start <= seconds(r['timestamp']) < end]
    chronology = [{**r,'frequency_hz':None} if r.get('frequency_hz') is not None and r['frequency_hz']<45 else r for r in chronology]
    chronology.sort(key=lambda r:(r.get('timestamp') or '', r.get('state') or r.get('entity') or '', str(r.get('message_no') or '')))
    available_entities = [e for e in dataset['entities'] if e['group'] in payload.performance_groups]
    entities = list(available_entities) if payload.include_entity_performance else []
    if payload.include_entity_performance and 'State' in payload.performance_groups:
        for name in ('Bihar','DVC','Jharkhand','Odisha','West Bengal','Sikkim'):
            if not any(e.get('group')=='State' and (e.get('display_name') or '').casefold()==name.casefold() for e in entities):
                entities.append({'entity_id':'unavailable:'+name,'display_name':name,'group':'State',
                                 'deviation':np.full(len(frequency),np.nan),'point':{},'unavailable':True})
    summary = frequency_statistics(dataset, full_ranges)
    daily_frequency = [{**d, 'summary': frequency_statistics(dataset,d['ranges'])} for d in days]
    slots = sorted({1,2,*[w['event'] for w in events]})
    slot_rows = {}; daily_rows = []; event_rows = []
    complete = result['messages_complete'] and bool(events)
    for slot in slots:
        ranges = [r for w in events if w['event']==slot for r in w['ranges']]
        slot_rows[slot] = performance_rows(dataset,ranges,entities,chronology,complete,month,slot)
    for day in days:
        ranges = [r for w in events if w['date']==day['date'] for r in w['ranges']]
        daily_rows.extend(performance_rows(dataset,ranges,entities,chronology,complete,day['date']))
        for slot in slots:
            ranges = [r for w in events if w['date']==day['date'] and w['event']==slot for r in w['ranges']]
            event_rows.extend(performance_rows(dataset,ranges,entities,chronology,complete,day['date'],slot))
    messages, message_warnings = message_summary(entities if payload.include_entity_performance else available_entities,chronology,complete)
    defence = defence_records(dataset,start,end)
    _,left,right,freq = samples(dataset,full_ranges)
    valid = np.isfinite(freq); order = np.argsort(freq[valid]); weights=(right-left)[valid][order]
    duration = {'frequency':freq[valid][order], 'percent':np.cumsum(weights)/weights.sum()*100 if len(weights) else np.array([])}
    comparisons = []; largest = {}
    index,_,_,freq = samples(dataset,full_ranges); valid = np.isfinite(freq)
    for entity in entities:
        if entity['group']!='State': continue
        dev=entity['deviation'][index]
        at = int(np.nanargmin(freq)) if valid.any() else None
        mask=valid & (freq<49.90) & np.isfinite(dev)
        comparisons.append({'entity':entity['display_name'],'at_minimum':max(0,float(dev[at])) if at is not None and np.isfinite(dev[at]) else None,
                            'maximum':max(0,float(np.max(dev[mask]))) if mask.any() else None})
        for level in ('49.90','49.50'):
            active=valid & (freq<float(level)) & np.isfinite(dev) & (dev>0)
            if active.any():
                maximum=float(dev[active].max())
                if level not in largest or maximum>largest[level]['mw']:largest[level]={'entity':entity['display_name'],'mw':maximum}
    comparisons.sort(key=lambda r:r['maximum'] if r['maximum'] is not None else -1,reverse=True)
    validation = validate_month(summary,days,daily_frequency,messages,slot_rows)
    return {'month':month,'dataset':dataset,'ranges':full_ranges,'summary':summary,'days':days,'events':events,
            'daily_frequency':daily_frequency,'slot_rows':slot_rows,'event_rows':event_rows,'entities':entities,
            'messages':messages,'chronology':chronology,'defence':defence,'duration':duration,
            'frequency_heatmap':frequency_heatmap(dataset,days),'state_heatmaps':state_heatmaps(daily_rows,entities,days),
            'comparisons':comparisons,'largest':largest,'validation':validation,
            'warnings':list(dict.fromkeys([*result['warnings'],*warnings,*message_warnings]))}


def validate_month(summary, days, daily, messages, slots):
    checks = []
    def add(check, ok, details):checks.append({'check':check,'status':'Pass' if ok else 'Incomplete','details':details})
    add('Calendar days covered',summary['covered_days']==len(days),f"{summary['covered_days']} of {len(days)} days have valid readings")
    add('Complete monthly minutes',abs(summary['covered_minutes']-summary['calendar_minutes'])<1e-5,
        f"{summary['covered_minutes']:.1f} / {summary['calendar_minutes']:.1f} minutes")
    values=[summary['thresholds'][level]['minutes'] for level in LEVELS]
    hierarchy=all(v is not None for v in values) and values==sorted(values)
    add('Threshold hierarchy',hierarchy,'<49.50 <= <49.70 <= <49.90 Hz')
    percentages=[summary['normal_percent'],summary['above_percent'],summary['thresholds']['49.90']['percent']]
    add('Frequency percentages reconcile',all(v is not None for v in percentages) and abs(sum(v or 0 for v in percentages)-100)<.001,
        'Percentages use valid covered minutes; missing calendar time is reported separately')
    add('Message categories reconcile',all(r['total'] is not None and r['total']==sum(r[c] for c in CATEGORIES) for r in messages),
        'Total is the sum of six recipient/category counts; physical actions are separate')
    add('Independent reporting slots',all(r['event']==slot for slot,rows in slots.items() for r in rows),'Each slot calculated from its own selected ranges')
    return checks
