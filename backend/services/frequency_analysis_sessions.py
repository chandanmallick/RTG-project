"""Owner-scoped expiring Frequency Analysis sessions. No Mongo writes or source fetches."""
import asyncio
import io
import json
import re
import secrets
import time
import zipfile
from collections import OrderedDict
from datetime import date, datetime, time as clock_time, timedelta
from pathlib import Path
from threading import RLock
import numpy as np
import pandas as pd
from fastapi import HTTPException
from services.frequency_threshold_analysis import timeline, seconds, iso, merge_ranges, calculate, chart_points, dataset_from_event, GROUPS

TTL=3600
MAX_UPLOAD=128*1024*1024
MAX_MEMORY=512*1024*1024
MAX_SESSIONS=128
_sessions=OrderedDict()
_lock=RLock()


def owner(user):
    value=str(user.get('employeeId') or user.get('userId') or '')
    if not value:raise HTTPException(401,'Authentication required.')
    return value


def memory(dataset):
    return dataset['times'].nbytes+dataset['frequency'].nbytes+sum(entity['deviation'].nbytes for entity in dataset['entities'])+(dataset.get('support_seconds').nbytes if dataset.get('support_seconds') is not None else 0)


def _purge():
    now=time.monotonic()
    for token,session in list(_sessions.items()):
        if now-session['accessed']>TTL:_sessions.pop(token,None)


def _put(user, dataset, metadata):
    size=memory(dataset)
    if size>MAX_MEMORY:raise HTTPException(413,'Parsed data exceeds the temporary-session memory limit. Use a shorter base period.')
    with _lock:
        _purge()
        while _sessions and (len(_sessions)>=MAX_SESSIONS or sum(s['bytes']+s.get('result_bytes',0) for s in _sessions.values())+size>MAX_MEMORY):
            _sessions.popitem(last=False)
        token=secrets.token_urlsafe(32)
        _sessions[token]={'owner':owner(user),'dataset':dataset,'metadata':metadata,'accessed':time.monotonic(),'bytes':size,'results':OrderedDict(),'result_bytes':0,'messages':None,'lock':RLock()}
    return {**metadata,'session_token':token,'expires_after_seconds':TTL,'storage':'temporary process memory; raw MongoDB persistence disabled'}


def get_session(token,user):
    with _lock:
        _purge();session=_sessions.get(token)
        if not session or session['owner']!=owner(user):raise HTTPException(404,'Analysis session expired or unavailable. Upload/select the source again.')
        session['accessed']=time.monotonic();_sessions.move_to_end(token)
        return session


def release_session(token,user):
    get_session(token,user)
    with _lock:_sessions.pop(token,None)
    return {'success':True}


def upload_session(contents,name,user,db=None):
    from routes.frequency_routes import parse_scada_file, match_scada_columns
    from services.frequency_event_reporting import event_entities
    from services.db_handler import MongoService
    if not contents or len(contents)>MAX_UPLOAD:raise HTTPException(413,'Choose a non-empty Excel file up to 128 MB.')
    if Path(name).suffix.lower() not in {'.xlsx','.xlsm'}:raise ValueError('Use the existing .xlsx/.xlsm event workbook format.')
    with zipfile.ZipFile(io.BytesIO(contents)) as archive:
        if sum(info.file_size for info in archive.infolist())>MAX_MEMORY:
            raise HTTPException(413,'The expanded workbook exceeds 512 MB.')
    # Existing reader, used in read-only mode for the larger input.
    frame,headers,keys,dt_col,freq_col=parse_scada_file(contents,read_only=True)
    if frame.empty:raise ValueError('The workbook contains no readings.')
    times,freq,cadence=timeline(frame[dt_col].tolist(),frame[freq_col].tolist())
    db=db or MongoService()
    mappings=list(db.map_collection.find({}, {'_id':0}))
    points=[];deviations=[];warnings=[]
    for mapping in mappings:
        if mapping.get('is_frequency') or str(mapping.get('plant_id'))=='SYSTEM_FREQUENCY':continue
        columns=match_scada_columns([mapping],headers,keys).get(mapping.get('plant_id'),{})
        actual_col,schedule_col=columns.get('actual'),columns.get('schedule')
        if actual_col is None:continue
        def numeric(col):
            return pd.to_numeric(frame[col],errors='coerce').to_numpy(dtype=float) if col is not None else np.full(len(frame),np.nan)
        if schedule_col==actual_col:schedule_col=None
        deviation=numeric(actual_col)-numeric(schedule_col)
        if schedule_col is None:warnings.append(f"{mapping.get('plant_name') or mapping.get('plant_id')}: no separate schedule column; OD/UI remains unavailable.")
        points.append({**mapping,'stage_id':mapping.get('STAGE_ID') or '', 'stage_name':mapping.get('STAGE_NAME') or '', 'type':'State' if mapping.get('is_state') else (mapping.get('type') if str(mapping.get('type')).upper() in {'ISGS','IPP'} else 'Generator'),'plant_name':mapping.get('plant_name') or mapping.get('STAGE_NAME') or str(mapping.get('plant_id'))})
        deviations.append(deviation)
    entities=event_entities(db,{'data_points':points})
    for entity,deviation in zip(entities,deviations):entity['deviation']=deviation
    if not any(entity['group'] in GROUPS for entity in entities):raise ValueError('No State/ISGS/IPP actual columns match the existing plant mapping.')
    if any(entity['group'] is None for entity in entities):warnings.append('State-sector generator rows retain their existing classification and are outside State drawal / ISGS / IPP.')
    dataset={'times':times,'frequency':freq,'cadence':cadence,'entities':entities,'warnings':warnings}
    metadata={'success':True,'filename':Path(name).name,'row_count':len(frame),'file_bytes':len(contents),'parsed_array_bytes':memory(dataset),'sampling_seconds':cadence,
        'start_time':iso(times[0]),'end_time':iso(times[-1]+cadence),'entity_counts':{group:sum(entity['group']==group for entity in entities) for group in GROUPS},'warnings':warnings}
    return _put(user,dataset,metadata)


def session_from_temp(file_id,user):
    # Generated legacy UUIDs only; never resolve a client path.
    if not re.fullmatch(r'[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}',file_id):raise ValueError('Invalid temporary file ID.')
    path=Path('temp_uploads')/f'{file_id}.xlsx'
    if not path.is_file():raise HTTPException(404,'Temporary event file is unavailable.')
    if path.stat().st_size>MAX_UPLOAD:raise HTTPException(413,'The event workbook exceeds 128 MB.')
    return upload_session(path.read_bytes(),path.name,user)


def daily_ranges(start_date,end_date,slots):
    first,last=date.fromisoformat(start_date),date.fromisoformat(end_date)
    if last<first or (last-first).days>=366:raise ValueError('Select a date range of at most 366 days.')
    if not slots:raise ValueError('Add at least one daily time slot.')
    result=[]
    for offset in range((last-first).days+1):
        day=first+timedelta(days=offset)
        for slot in slots:
            start=clock_time.fromisoformat(slot['start']);midnight=slot['end'] in {'24:00','24:00:00'};end=clock_time() if midnight else clock_time.fromisoformat(slot['end'])
            if start>=end and not midnight:raise ValueError('Daily slot end must follow its start. Split an overnight slot at midnight.')
            result.append((datetime.combine(day,start).isoformat(),datetime.combine(day+timedelta(days=1) if midnight else day,end).isoformat()))
    if len(result)>10000:raise ValueError('Select at most 10,000 daily periods per session.')
    return [(iso(a),iso(b)) for a,b in merge_ranges(result)]


def _messages_and_timeline(session,ranges,db):
    from routes.frequency_routes import fetch_crms_frequency_messages, _build_frequency_message_timeline, FrequencyMessageTimelinePayload, FrequencyMessageRange
    from services.frequency_event_reporting import timeline_aliases
    dataset=session['dataset'];start,end=seconds(ranges[0][0]),seconds(ranges[-1][1])
    cached=session['messages']
    complete=True;warnings=[]
    if cached and cached['start']<=start and cached['end']>=end:
        messages=cached['messages'];skipped=cached['skipped']
    else:
        try:
            messages,skipped=asyncio.run(fetch_crms_frequency_messages(pd.Timestamp(iso(start)).to_pydatetime(),pd.Timestamp(iso(end)).to_pydatetime()))
            session['messages']={'start':start,'end':end,'messages':messages,'skipped':skipped}
        except Exception:
            messages,skipped=[],0;complete=False;warnings=['CRMS is unavailable; chronology coverage and message counts are unavailable.']
    event={'start_time':iso(start),'end_time':iso(end),'data_points':[]}
    aliases=timeline_aliases(db,event,entities=dataset['entities'])
    times=dataset['times']
    def values(entity,stamp):
        moment=seconds(stamp);at=np.searchsorted(times,moment,side='right')-1
        support=dataset['support_seconds'][at] if dataset.get('support_seconds') is not None and 0<=at<len(times) else dataset['cadence']
        if at<0 or at>=len(times) or moment-times[at]>=support:return None,None
        freq=dataset['frequency'][at];dev=entity['deviation'][at]
        return (float(freq) if np.isfinite(freq) else None,float(dev) if np.isfinite(dev) else None)
    payload=FrequencyMessageTimelinePayload(ranges=[FrequencyMessageRange(start_time=iso(start),end_time=iso(end))])
    response=asyncio.run(_build_frequency_message_timeline(payload,event_context=event,aliases_override=aliases,value_lookup=values,messages_override=(messages,skipped),db=db,data_source_label="Uploaded workbook"))
    selected=merge_ranges(ranges)
    # Half-open slots prevent double counting adjacent slots/messages at endpoints.
    response['rows']=[row for row in response['rows'] if any(a<=seconds(row['timestamp'])<b for a,b in selected)]
    response['messages_complete']=complete;response['warnings']=warnings
    return response


def analyse(token,user,ranges,db=None):
    from services.db_handler import MongoService
    session=get_session(token,user)
    selected=[(iso(a),iso(b)) for a,b in merge_ranges(ranges)]
    key=json.dumps(selected)
    with session['lock']:
        if key in session['results']:
            result=session['results'][key]
        else:
            db=db or MongoService()
            from services.frequency_threshold_analysis import segments
            _,starts,_=segments(session['dataset'],merge_ranges(selected))
            estimate=len(np.unique(np.floor(starts/900)))*sum(e['group'] in GROUPS for e in session['dataset']['entities'])*2300
            if estimate+session['bytes']>MAX_MEMORY:raise HTTPException(413,'This selection exceeds the temporary analysis memory limit. Reduce the range or selected daily slots.')
            chronology=_messages_and_timeline(session,selected,db)
            result=calculate(session['dataset'],selected,chronology['rows'],chronology['messages_complete'])
            result.update({'chronology':chronology['rows'],'messages_complete':chronology['messages_complete'],
                'warnings':session['dataset']['warnings']+chronology['warnings'],'ranges':[{'start_time':a,'end_time':b} for a,b in selected],'result_token':secrets.token_urlsafe(24)})
            if result['summary']['uncovered_minutes']>0:result['warnings'].append(f"{result['summary']['uncovered_minutes']:.3f} selected minutes have no valid uploaded frequency coverage.")
            if any(row['thresholds'][level]['unknown_deviation_minutes']>0 for rows in result['overall_performance'].values() for row in rows for level in row['thresholds']):result['warnings'].append('Some entities lack actual/schedule coverage under a threshold. Their adverse percentages remain unavailable.')
            session['results'][key]=result
            def result_size(value):return sum(len(rows) for rows in value['performance'].values())*2300+len(value['chronology'])*1200+sum(len(rows) for rows in value['overall_performance'].values())*2300
            while len(session['results'])>3 or (len(session['results'])>1 and sum(result_size(value) for value in session['results'].values())+session['bytes']>MAX_MEMORY):session['results'].popitem(last=False)
            session['result_bytes']=sum(result_size(value) for value in session['results'].values())
            with _lock:
                while len(_sessions)>1 and sum(s['bytes']+s.get('result_bytes',0) for s in _sessions.values())>MAX_MEMORY:
                    old=next((key for key in _sessions if key!=token),None)
                    if old is None:break
                    _sessions.pop(old,None)
        return compact(token,session,result)


def compact(token,session,result):
    return {'success':True,'session_token':token,'result_token':result['result_token'],'summary':result['summary'],'overall_performance':result['overall_performance'],
        'chronology_count':len(result['chronology']),'messages_complete':result['messages_complete'],'warnings':result['warnings'],'ranges':result['ranges'],
        'calculation_note':result['calculation_note'],'states':[{'entity_id':e['entity_id'],'entity':e['display_name']} for e in session['dataset']['entities'] if e['group']=='State'],
        'source':session['metadata']}


def get_result(token,result_token,user):
    session=get_session(token,user)
    with session['lock']:
        result=next((r for r in session['results'].values() if r['result_token']==result_token),None)
        if not result:raise HTTPException(404,'This result expired; run the selected analysis again.')
    return session,result


def result_page(token,result_token,user,group='State',offset=0,limit=50):
    _,result=get_result(token,result_token,user)
    if group=='Chronology':rows=result['chronology']
    elif group in GROUPS:rows=result['performance'][group]
    else:raise ValueError('Select State, ISGS, IPP or Chronology.')
    if offset<0 or not 1<=limit<=200:raise ValueError('Use a non-negative offset and a page size of 1 to 200.')
    return {'success':True,'rows':rows[offset:offset+limit],'total':len(rows),'offset':offset,'limit':limit}


def result_chart(token,result_token,user,entity_id):
    session,result=get_result(token,result_token,user)
    return chart_points(session['dataset'],[(r['start_time'],r['end_time']) for r in result['ranges']],entity_id)


def consolidate_sources(sources,user,db=None):
    from services.db_handler import MongoService
    from routes.frequency_routes import EVENT_COLLECTION
    from services.frequency_event_reporting import checked_event_period
    db=db or MongoService();datasets=[];ranges=[];names=[]
    if not 1<=len(sources)<=100:raise ValueError('Select between 1 and 100 event sources.')
    for source in sources:
        if source.get('session_token'):
            session=get_session(source['session_token'],user);dataset=session['dataset'];name=source.get('name') or session['metadata'].get('filename')
            bounds=(iso(dataset['times'][0]),iso(dataset['times'][-1]+dataset['cadence']))
        elif source.get('event_id'):
            event=db.db[EVENT_COLLECTION].find_one({'event_id':source['event_id']},{'_id':0})
            if not event:raise ValueError('A selected saved event is unavailable.')
            first,last,metadata_source=checked_event_period(event)
            if metadata_source=='legacy_name':event={**event,'start_time':first.isoformat(),'end_time':last.isoformat()}
            dataset=dataset_from_event(db,event);name=event.get('name') or source['event_id'];bounds=(first.isoformat(),last.isoformat())
        else:raise ValueError('Each source requires a saved event ID or temporary session token.')
        start=source.get('start_time') or bounds[0];end=source.get('end_time') or bounds[1]
        if seconds(start)<seconds(bounds[0]) or seconds(end)>seconds(bounds[1]):raise ValueError('Selected event period is outside its source coverage.')
        mask=(dataset['times']>=seconds(start))&(dataset['times']<seconds(end))
        if not mask.any():raise ValueError('A selected event contains no readings.')
        datasets.append({**dataset,'times':dataset['times'][mask],'frequency':dataset['frequency'][mask],
            'entities':[{**entity,'deviation':entity['deviation'][mask]} for entity in dataset['entities']]})
        ranges.append((start,end));names.append(name)
    times=np.unique(np.concatenate([d['times'] for d in datasets]));freq=np.full(len(times),np.nan);assigned=np.zeros(len(times),bool);support=np.zeros(len(times))
    by_entity={};overlap=False
    for dataset in datasets:
        locations=np.searchsorted(times,dataset['times']);new=~assigned[locations]
        overlap |= bool((~new).any());freq[locations[new]]=dataset['frequency'][new];support[locations[new]]=dataset['cadence'];assigned[locations]=True
        for entity in dataset['entities']:
            point=entity['point'];identity=f"{point.get('plant_id')}:{point.get('stage_id') or point.get('STAGE_ID') or ''}"
            if identity not in by_entity:by_entity[identity]={**entity,'entity_id':identity,'deviation':np.full(len(times),np.nan)}
            # First selected source owns overlapping timestamps.
            by_entity[identity]['deviation'][locations[new]]=entity['deviation'][new]
    source_warnings=list(dict.fromkeys(warning for source in datasets for warning in source.get('warnings',[])))
    dataset={'times':times,'frequency':freq,'cadence':min(d['cadence'] for d in datasets),'support_seconds':support,'entities':list(by_entity.values()),'warnings':source_warnings}
    if overlap:dataset['warnings'].append('Overlapping event timestamps are counted once; the first selected source takes precedence.')
    metadata={'success':True,'filename':'Consolidated Event Analysis','events':names,'row_count':len(times),'parsed_array_bytes':memory(dataset),'sampling_seconds':dataset['cadence'],'start_time':min(a for a,b in ranges),'end_time':max(b for a,b in ranges)}
    token=_put(user,dataset,metadata)['session_token']
    return analyse(token,user,ranges,db=db)
