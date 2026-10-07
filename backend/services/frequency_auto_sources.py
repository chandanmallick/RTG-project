"""Operator-selected source retrieval through the existing Frequency integrations."""
import asyncio
from datetime import datetime
import numpy as np
import pandas as pd
from services import frequency_analysis_sessions as sessions
from services.frequency_threshold_analysis import timeline,seconds,iso


def apply_readings(entity,key,indexes,values):
    values=np.asarray(values,dtype=float);valid=np.isfinite(values)
    entity[key][indexes[valid]]=values[valid]
    return bool(valid.any())


def fetch_sources(payload,user,db=None):
    from services.db_handler import MongoService
    from services.curve_frequency_service import load_curve_frequency_range
    from services.frequency_event_reporting import event_entities
    from routes.frequency_routes import (get_schedule_data_actual,fetch_wbes_schedule_raw,fetch_rtg_schedule_raw,
        get_wbes_identifier,normalize_wbes_identifier,fetch_crms_frequency_messages)
    sources=set(payload.sources)
    if not sources or sources-{'wbes','rtg','mis','crms'}:raise ValueError('Select WBES, RTG, MIS or CRMS.')
    db=db or MongoService();warnings=[];status=[]
    if payload.session_token:
        original=sessions.get_session(payload.session_token,user)
        dataset={**original['dataset'],'entities':[{**e} for e in original['dataset']['entities']]}
        metadata={**original['metadata']}
    else:
        curve=load_curve_frequency_range(payload.start_date,payload.end_date)
        if not curve['success']:raise ValueError('Curve frequency is unavailable for the selected dates.')
        times,freq,cadence=timeline([p['timestamp'] for p in curve['points']],[p['frequency'] for p in curve['points']])
        mappings=list(db.map_collection.find({}, {'_id':0}))
        points=[{**m,'stage_id':m.get('STAGE_ID') or ''} for m in mappings if not m.get('is_frequency') and str(m.get('plant_id'))!='SYSTEM_FREQUENCY']
        entities=event_entities(db,{'data_points':points})
        for entity in entities:
            entity.update(actual=np.full(len(times),np.nan),schedule=np.full(len(times),np.nan),deviation=np.full(len(times),np.nan))
        dataset={'times':times,'frequency':freq,'cadence':cadence,'entities':entities,'warnings':[]}
        metadata={'filename':'Automatic Frequency Event Analysis','row_count':len(times),'sampling_seconds':cadence,'file_bytes':0,
            'start_time':iso(times[0]),'end_time':iso(times[-1]+cadence),'mode':'automatic'}
        warnings.extend(item['message'] for item in curve.get('diagnostics',[]))
    times=dataset['times'];days=[iso(day*86400)[:10] for day in np.unique(np.floor(times/86400))];entities=dataset['entities']
    if len(days)>31:raise ValueError('Fetch at most 31 days per automatic source session.')
    for entity in entities:
        for key in ('actual','schedule'):
            entity[key]=np.array(entity.get(key,np.full(len(times),np.nan)),copy=True)
    for day in days:
        midnight=seconds(day+'T00:00:00');indexes=np.arange(np.searchsorted(times,midnight),np.searchsorted(times,midnight+86400));minutes=(times[indexes]-midnight)/60
        wbes=[e for e in entities if e['group'] in sessions.GROUPS]
        if 'wbes' in sources:
            names=sorted({get_wbes_identifier(e['mapping']) for e in wbes if get_wbes_identifier(e['mapping'])})
            try:raw=fetch_wbes_schedule_raw(datetime.fromisoformat(day).strftime('%d-%m-%Y'),names,force_refresh=True) if names else []
            except Exception:raw=[]
            schedules={normalize_wbes_identifier(r.get('Acronym')):(r.get('NetScheduleSummary') or {}).get('TotalNetSchdAmount') or [] for r in raw or [] if isinstance(r,dict)}
            for entity in wbes:
                name=get_wbes_identifier(entity['mapping']);values=schedules.get(normalize_wbes_identifier(name),[])
                available=apply_readings(entity,'schedule',indexes,[pd.to_numeric(values[int(m//15)],errors='coerce') if int(m//15)<len(values) else np.nan for m in minutes])
                status.append({'date':day,'entity':entity['display_name'],'source':'WBES','available':available})
        if 'rtg' in sources:
            cache={}
            for entity in entities:
                utility=str(entity['mapping'].get('utility_type') or entity['mapping'].get('type') or '').upper().replace(' ','_')
                if entity['group']=='State' or utility not in {'STATE','STATE_IPP','STATE_GENERATOR','STATE_SECTOR'}:continue
                pid=entity['mapping'].get('rtg_plant_id') or entity['point'].get('plant_id')
                if pid not in cache:
                    try:cache[pid]=fetch_rtg_schedule_raw(day,pid,force_refresh=True)
                    except Exception:cache[pid]={}
                values=(cache[pid] or {}).get('schedule') or []
                available=apply_readings(entity,'schedule',indexes,[pd.to_numeric(values[int(m//15)],errors='coerce') if int(m//15)<len(values) else np.nan for m in minutes])
                status.append({'date':day,'entity':entity['display_name'],'source':'RTG','available':available})
        if 'mis' in sources:
            for kind in ('state','generator'):
                selected=[e for e in entities if (e['group']=='State')==(kind=='state')]
                names=sorted({str(e['mapping'].get('mis_name') or '').strip() for e in selected}-{''})
                try:rows=asyncio.run(get_schedule_data_actual(day,day,','.join(names),1,kind))['rows'] if names else []
                except Exception:rows=[]
                lookup={seconds(row['timestamp']):row for row in rows}
                for entity in selected:
                    name=str(entity['mapping'].get('mis_name') or '').strip()
                    available=apply_readings(entity,'actual',indexes,[pd.to_numeric(lookup.get(np.floor(times[i]/60)*60,{}).get(name),errors='coerce') for i in indexes])
                    status.append({'date':day,'entity':entity['display_name'],'source':'MIS','available':bool(name and available)})
    for entity in entities:entity['deviation']=entity['actual']-entity['schedule']
    missing=[]
    for source in ('WBES','RTG','MIS'):
        failed=[row for row in status if row['source']==source and not row['available']]
        if failed:
            examples=', '.join(f"{row['date']} {row['entity']}" for row in failed[:5])
            missing.append(f"{source}: {len(failed)} source/entity/day fetches unavailable or unmapped ({examples}). Existing readings retained where available; full coverage is in source status.")
    dataset['warnings']=list(dict.fromkeys([*dataset.get('warnings',[]),*warnings,*missing]))
    metadata.update(source_status=status,warnings=dataset['warnings'],entity_counts={g:sum(e['group']==g for e in entities) for g in sessions.GROUPS})
    metadata['crms_enabled']='crms' in sources or metadata.get('crms_enabled',False)
    response=sessions._put(user,dataset,metadata)
    if 'crms' in sources:
        session=sessions.get_session(response['session_token'],user)
        try:
            messages,skipped=asyncio.run(fetch_crms_frequency_messages(datetime.fromisoformat(metadata['start_time']),datetime.fromisoformat(metadata['end_time'])))
            session['messages']={'start':times[0],'end':seconds(metadata['end_time']),'messages':messages,'skipped':skipped}
        except Exception:dataset['warnings'].append('CRMS is unavailable; retry its fetch before processing.')
    return response
