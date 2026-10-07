"""Persist explicitly selected periods using the existing event document/writer."""
from collections import defaultdict
import numpy as np
from services import frequency_analysis_sessions as sessions
from services.frequency_threshold_analysis import iso,seconds


def save_periods(periods,user,db=None):
    from services.db_handler import MongoService
    from routes.frequency_routes import EVENT_COLLECTION,FrequencyEventPayload,persist_frequency_event
    from bson import BSON
    if not periods or len(periods)>100:raise ValueError('Select between 1 and 100 periods.')
    db=db or MongoService();prepared=[];output=[]
    # Validate access and every range before any writes.
    for period in periods:
        a,b=seconds(period['start_time']),seconds(period['end_time'])
        if b<=a:raise ValueError('Each period must end after its start.')
        if period['event_type'] not in {'low','high'}:raise ValueError('Choose Low or High frequency.')
        session=sessions.get_session(period['session_token'],user) if period.get('session_token') else None
        existing=db.db[EVENT_COLLECTION].find_one({'event_id':period['event_id']},{'_id':0}) if period.get('event_id') else None
        if not session and not existing:raise ValueError('Upload or fetch data before saving this period.')
        if existing and not session and not (seconds(existing['start_time'])<=a<b<=seconds(existing['end_time'])):raise ValueError('Saved event does not cover this period.')
        prepared.append((period,a,b,session,existing))
    for period,a,b,session,existing in prepared:
        try:
            if not existing:
                candidate=db.db[EVENT_COLLECTION].find_one({'start_time':iso(a),'end_time':iso(b),'event_type':period['event_type']},{'_id':0})
                if candidate and candidate.get('data_points'):existing=candidate;session=None
            if existing and not session:
                output.append({'id':period['id'],'event_id':existing['event_id'],'name':existing['name'],'status':'existing'});continue
            dataset=session['dataset'];times=dataset['times'];mask=(times>=a)&(times<b)
            frequency=dataset['frequency'][mask]
            if not np.any(np.isfinite(frequency)&(frequency>=45)):raise ValueError('No valid source frequency overlaps this period.')
            if not any(np.isfinite(e['deviation'][mask]).any() for e in dataset['entities'] if e['group'] in sessions.GROUPS):raise ValueError('No mapped actual/schedule deviation is available. Complete the upload or source fetch before saving.')
            analysis=sessions.analyse(period['session_token'],user,[(iso(a),iso(b))],db=db,event_type=period['event_type'])
            _,result=sessions.get_result(period['session_token'],analysis['result_token'],user)
            chronology,warnings=sessions.report_chronology(session,result)
            by_entity=defaultdict(list)
            for row in chronology:by_entity[row.get('entity_id')].append(row)
            timestamps=[iso(t) for t in times[mask]]
            single=len(timestamps)==1
            if single:timestamps.append(iso(b))
            def values(array):return [float(v) if np.isfinite(v) else None for v in array[mask]]+([None] if single else [])
            points=[]
            summaries={r['entity_id']:r for rows in result['overall_performance'].values() for r in rows}
            for entity in dataset['entities']:
                point={**entity['point']};mapped=by_entity[entity['entity_id']]
                point.update(plant_name=entity['display_name'],is_state=entity['group']=='State',summary={'statistics':summaries.get(entity['entity_id'],{})},
                    series={'timestamps':timestamps,'frequency':values(dataset['frequency']),
                        'actual':values(entity.get('actual',np.full(len(times),np.nan))),
                        'schedule':values(entity.get('schedule',np.full(len(times),np.nan))),
                        'deviation':values(entity['deviation'])},
                    crms_messages=[{'timestamp':r['timestamp'],'message_no':r.get('message_no'),'remarks':r.get('message_details'),'category':r.get('message_categories') or [r.get('message_type')],'issued_to':[entity['display_name']]} for r in mapped if r.get('record_kind')!='physical'],
                    transmission_line_events=[r['action'] for r in mapped if r.get('record_kind')=='physical'])
                points.append(point)
            payload=FrequencyEventPayload(name='Prepared event',start_time=iso(a),end_time=iso(b),event_type=period['event_type'],
                notes='\n'.join(dict.fromkeys([*result['warnings'],*warnings])),data_points=points)
            document=payload.model_dump() if hasattr(payload,'model_dump') else payload.dict()
            if len(BSON.encode(document))>15*1024*1024:raise ValueError('This event exceeds MongoDB document capacity. Select a shorter period.')
            saved=persist_frequency_event(payload,db=db,precise=True)
            if not saved['success']:raise ValueError(saved.get('error') or 'Event save failed.')
            output.append({'id':period['id'],'event_id':saved['event']['event_id'],'name':saved['event']['name'],'status':'saved','warnings':list(dict.fromkeys([*result['warnings'],*warnings]))})
        except Exception as exc:output.append({'id':period['id'],'error':str(exc)})
    return {'success':not any(p.get('error') for p in output),'periods':output}
