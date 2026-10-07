"""Thin authenticated API for temporary long-period and consolidated analyses."""
import zipfile
from openpyxl.utils.exceptions import InvalidFileException
from typing import List, Optional
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool
from crew_legacy.admin_logic.auth_utils import get_authenticated_user
from services import frequency_analysis_sessions as sessions

router=APIRouter(prefix='/analysis',tags=['Frequency analysis sessions'])


class Slot(BaseModel):
    start:str
    end:str


class RunPayload(BaseModel):
    session_token:str
    start_date:str
    end_date:str
    slots:List[Slot]
    event_type:str='low'


class Period(BaseModel):
    id:str
    start_time:str
    end_time:str


class CheckPeriodsPayload(BaseModel):
    periods:List[Period]


@router.post('/check-periods')
async def check_periods(payload:CheckPeriodsPayload,user=Depends(get_authenticated_user)):
    from services.db_handler import MongoService
    from services.frequency_event_reporting import check_frequency_periods
    return await checked(check_frequency_periods,MongoService(),[data(period) for period in payload.periods])


class Source(BaseModel):
    session_token:Optional[str]=None
    event_id:Optional[str]=None
    start_time:Optional[str]=None
    end_time:Optional[str]=None
    name:Optional[str]=None


class ConsolidatePayload(BaseModel):
    sources:List[Source]
    event_type:str='low'


class FetchSourcesPayload(BaseModel):
    start_date:str
    end_date:str
    sources:List[str]
    session_token:Optional[str]=None


class PreparedPeriod(Period):
    event_type:str='low'
    session_token:Optional[str]=None
    event_id:Optional[str]=None


class SavePeriodsPayload(BaseModel):
    periods:List[PreparedPeriod]


@router.post('/save-periods')
async def save_periods(payload:SavePeriodsPayload,user=Depends(get_authenticated_user)):
    from services.frequency_event_preparation import save_periods as persist
    return await checked(persist,[data(p) for p in payload.periods],user)


@router.post('/fetch-sources')
async def fetch_sources(payload:FetchSourcesPayload,user=Depends(get_authenticated_user)):
    from services.frequency_auto_sources import fetch_sources
    return await checked(fetch_sources,payload,user)


class ReportText(BaseModel):
    executive_summary:str=Field(default='',max_length=6000)
    general_notes:str=Field(default='',max_length=6000)
    state_observations:str=Field(default='',max_length=6000)
    generator_observations:str=Field(default='',max_length=6000)
    chronology_notes:str=Field(default='',max_length=6000)
    adms_ufr_remarks:str=Field(default='',max_length=6000)


class ResultPayload(BaseModel):
    session_token:str
    result_token:str
    group:str='State'
    offset:int=0
    limit:int=50
    entity_id:Optional[str]=None
    format:str='xlsx'
    include_chronology:bool=True
    include_entity_performance:bool=True
    performance_groups:List[str]=Field(default_factory=lambda:['State','ISGS','IPP'])
    period_view:str=''
    entity_offset:int=0
    entity_limit:int=10
    layout:str='legacy'
    reporting_month:Optional[str]=Field(default=None,pattern=r'^\d{4}-(0[1-9]|1[0-2])$')
    report_text:ReportText=Field(default_factory=ReportText)


def data(model):
    return model.model_dump() if hasattr(model,'model_dump') else model.dict()


def _window_bounds(w):
    if isinstance(w, (list, tuple)): return w[0], w[1]
    if isinstance(w, dict): return w.get('start_time') or w.get('start'), w.get('end_time') or w.get('end')
    return getattr(w, 'start_time', getattr(w, 'start', '')), getattr(w, 'end_time', getattr(w, 'end', ''))


async def checked(function,*args,**kwargs):
    try:return await run_in_threadpool(function,*args,**kwargs)
    except HTTPException:raise
    except (ValueError,KeyError,TypeError,zipfile.BadZipFile,InvalidFileException) as exc:raise HTTPException(400,str(exc)) from exc
    except Exception as exc:
        import traceback
        traceback.print_exc()
        raise HTTPException(500,f"Frequency analysis operation failed: {exc}") from exc


@router.post('/upload')
async def upload(file:UploadFile=File(...),user=Depends(get_authenticated_user)):
    contents=bytearray()
    try:
        while chunk:=await file.read(1024*1024):
            contents.extend(chunk)
            if len(contents)>sessions.MAX_UPLOAD:raise HTTPException(413,'Maximum upload size is 128 MB.')
        return await checked(sessions.upload_session,bytes(contents),file.filename or 'input.xlsx',user)
    finally:await file.close()


class TempPayload(BaseModel):
    file_id:str


@router.post('/from-temp')
async def from_temp(payload:TempPayload,user=Depends(get_authenticated_user)):
    return await checked(sessions.session_from_temp,payload.file_id,user)


@router.delete('/session/{token}')
async def release(token:str,user=Depends(get_authenticated_user)):
    return await checked(sessions.release_session,token,user)


@router.post('/run')
async def run(payload:RunPayload,user=Depends(get_authenticated_user)):
    def analyse():
        ranges=sessions.daily_ranges(payload.start_date,payload.end_date,[data(slot) for slot in payload.slots],preserve_events=True)
        return sessions.analyse(payload.session_token,user,ranges,event_type=payload.event_type)
    return await checked(analyse)


@router.post('/consolidate')
async def consolidate(payload:ConsolidatePayload,user=Depends(get_authenticated_user)):
    return await checked(sessions.consolidate_sources,[data(source) for source in payload.sources],user,event_type=payload.event_type)


@router.post('/table')
async def table(payload:ResultPayload,user=Depends(get_authenticated_user)):
    if payload.period_view:
        return await checked(sessions.result_period_table,payload.session_token,payload.result_token,user,payload.group,payload.period_view,
            payload.offset,payload.limit,payload.entity_offset,payload.entity_limit)
    return await checked(sessions.result_page,payload.session_token,payload.result_token,user,payload.group,payload.offset,payload.limit)


@router.post('/chart')
async def chart(payload:ResultPayload,user=Depends(get_authenticated_user)):
    return await checked(sessions.result_chart,payload.session_token,payload.result_token,user,payload.entity_id)


def export_result(payload,user):
    if payload.layout=='monthly-template':
        if payload.format not in {'docx','pdf'}:raise ValueError('Monthly template supports Word and PDF.')
        from services.frequency_monthly_report import export_monthly
        return export_monthly(payload,user)
    if payload.layout=='compact' or payload.format=='html' and payload.layout!='legacy':
        from services.frequency_compact_reports import export_compact
        return export_compact(payload,user)
    from services.frequency_event_reporting import supplements_excel,supplements_html,threshold_columns,threshold_rows,message_category_rows,MESSAGE_CATEGORY_COLUMNS,CHRONOLOGY_COLUMNS
    session,result=sessions.get_result(payload.session_token,payload.result_token,user)
    if result.get('event_type')=='high':
        from services.frequency_compact_reports import export_compact
        return export_compact(payload,user)
    if payload.format not in {'xlsx','docx','html','pdf'}:raise ValueError('Choose HTML, PDF, Excel or Word.')
    if any(group not in sessions.GROUPS for group in payload.performance_groups):raise ValueError('Invalid performance group.')
    if payload.include_entity_performance and not payload.performance_groups:raise ValueError('Select at least one performance group.')
    event_windows = result.get('event_windows', result['ranges'])
    event={'event_name':session['metadata'].get('filename') or 'Consolidated Frequency Analysis','start_time':result['summary']['analysis_start'],'end_time':result['summary']['analysis_end'],
        'lowest_frequency':result['summary']['minimum_frequency'],'threshold_analysis':result,'chronology':result['chronology'],'performance':{},'warnings':result['warnings'],'calculation_note':result['calculation_note'],'selection_note':f"Selected windows: {len(event_windows)}. Slot patterns (IST): "+', '.join(dict.fromkeys(str(_window_bounds(r)[0])[11:]+' - '+str(_window_bounds(r)[1])[11:]+(' (next date)' if str(_window_bounds(r)[0])[:10]!=str(_window_bounds(r)[1])[:10] else '') for r in event_windows))}
    options={**data(payload),'supplemental_events':[event],'include_existing_sections':False,'include_threshold_performance':True,'include_analysis_summary':True,
        'compact_html':True,'report_title':'Consolidated Frequency Analysis','start_time':event['start_time'],'end_time':event['end_time'],'rows':[]}
    chronology,physical_warnings=sessions.report_chronology(session,result) if payload.include_chronology else (result['chronology'],[])
    chronology_columns=[('event','Event'),*CHRONOLOGY_COLUMNS]
    event['chronology_columns']=chronology_columns
    event['chronology']=[{**row,'event':', '.join(str(index) for index,window in enumerate(event_windows,1) if _window_bounds(window)[0]<=row['timestamp']<_window_bounds(window)[1]),
        'timestamp':row['timestamp'].replace('T',' '),'message_type':' / '.join(row.get('message_categories') or [row['message_type']])} for row in chronology]
    event['warnings']=[*event['warnings'],*physical_warnings]
    categories=message_category_rows(chronology,result['messages_complete'])
    # Reuse the same cached-series calculations as the daily/event UI. Exports
    # retain all selected periods rather than just the visible page.
    entities=[entity for entity in session['dataset']['entities'] if payload.include_entity_performance and entity['group'] in payload.performance_groups]
    period_reports=[]
    state_reports={entity['display_name']:[] for entity in session['dataset']['entities'] if entity['group']=='State'}
    summary_columns=[('date','Date'),('event','Event'),('minimum_frequency','Minimum Hz'),('minimum_timestamp','At (IST)'),('covered_frequency_minutes','Covered min'),
        ('pct49.90','<49.90 (% selected)'),('pct49.70','<49.70 (% selected)'),('pct49.50','<49.50 (% selected)'),('longest','Longest <49.90 (IST)'),('block_pct','15-min mean <49.90 (%)')]
    for view in ('day','event'):
        rows,summaries=sessions.period_statistics(session,result,sessions.period_windows(result,view),entities)
        frequency_rows=[]
        for period in summaries:
            summary=period['summary']
            record={'date':period['date'],'event':period['event']}
            if summary:
                record.update({key:summary[key] for key in ('minimum_frequency','minimum_timestamp','covered_frequency_minutes')})
                record.update({f'pct{level}':values['selected_time_pct'] for level,values in summary['thresholds'].items()})
                low=summary['thresholds']['49.90']
                record.update(longest=(f"{low['longest_start']} - {low['longest_end']} ({low['longest_minutes']} min)" if low['longest_start'] else None),block_pct=low['block_mean_below_pct'])
            frequency_rows.append(record)
        period_reports.append((f'{view.title()} Frequency Statistics',summary_columns,frequency_rows))
        for state in state_reports:
            state_rows=[row for row in rows if row['group']=='State' and row['entity']==state]
            if payload.include_entity_performance and 'State' in payload.performance_groups:
                state_reports[state].append((f'{view.title()} Statistics',threshold_columns(),threshold_rows([{**row,'entity':row['entity']+f" | {row['date']}"+(f" Event {row['event']}" if row['event'] else '')} for row in state_rows])))
        for group in payload.performance_groups if payload.include_entity_performance else []:
            group_rows=[{**row,'entity':row['entity']+f" | {row['date']}"+(f" Event {row['event']}" if row['event'] else '')} for row in rows if row['group']==group]
            period_reports.append((f'{group} {view.title()} Statistics',threshold_columns(),threshold_rows(group_rows)))
    if payload.include_chronology:
        period_reports.append(('Category-wise Messages',MESSAGE_CATEGORY_COLUMNS,categories))
        for state in state_reports:
            state_reports[state].extend([('Category-wise Messages',MESSAGE_CATEGORY_COLUMNS,[row for row in categories if row['group']=='State' and row['entity']==state]),
                ('Chronology including Physical Regulation',chronology_columns,[row for row in event['chronology'] if row['entity_group']=='State' and row['state']==state])])
    event['period_reports']=period_reports
    event['state_reports']=state_reports
    if payload.format=='xlsx':
        return StreamingResponse(supplements_excel([event],options),media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',headers={'Content-Disposition':'attachment; filename="consolidated_frequency_analysis.xlsx"'})
    if payload.format=='docx':
        from routes.frequency_routes import download_docx
        import asyncio
        return asyncio.run(download_docx(options))
    states=[e for e in session['dataset']['entities'] if e['group']=='State']
    events=[]
    for entity in states:
      for index,window in enumerate(event_windows,1):
        start,end=_window_bounds(window)
        chart=sessions.chart_points(session['dataset'],[(start,end)],entity['entity_id'],limit=1200)
        points=chart['points']
        messages=[row for row in chronology if row['entity_id']==entity['entity_id'] and start<=row['timestamp']<end]
        events.append({'event_id':entity['entity_id']+f':{index}','event_index':index,'event_name':f'Event {index} | {start[:10]} | {start[11:]} - {end[11:]}','event_type':'low','state':entity['display_name'],'start_time':start,'end_time':end,
            'series':{'timestamps':[point['timestamp'] for point in points],'frequency':[point['frequency'] for point in points],'deviation':[point['deviation_mw'] for point in points]},
            'transmission_line_events':[row['action'] for row in messages if row.get('record_kind')=='physical'],
            'crms_messages':[{'timestamp':row['timestamp'],'message_no':row['message_no'],'remarks':row['message_details'],'category':row.get('message_categories') or [row['message_type']]} for row in messages if row.get('record_kind')!='physical']})
    if payload.format=='pdf':
        from routes.frequency_routes import download_pdf,generate_plot_base64
        from datetime import datetime
        import asyncio
        options['event_charts']=[]
        for chart_event in events:
            series=chart_event['series']
            if not series['timestamps']:continue
            image=generate_plot_base64({'series_timestamps':[stamp.replace('T',' ') for stamp in series['timestamps']],
                'series_deviation':[float('nan') if value is None else value for value in series['deviation']],
                'series_frequency':[float('nan') if value is None else value for value in series['frequency']],
                'analysis_chart':True,'is_state':True,'plant_name':chart_event['state'],'crms_messages':chart_event['crms_messages'],'transmission_line_events':chart_event['transmission_line_events']},
                datetime.fromisoformat(chart_event['start_time']),datetime.fromisoformat(chart_event['end_time']))
            options['event_charts'].append({'title':chart_event['state']+' | '+chart_event['event_name'],'image':image})
        return asyncio.run(download_pdf(options))
    return {'success':True,'supplemental_html':supplements_html([event],options),'stacked_response':{'analysis':True,'title':event['event_name'],'state':states[0]['display_name'] if states else 'Frequency Analysis','states':[e['display_name'] for e in states],'events':events}}


@router.post('/export')
async def export(payload:ResultPayload,user=Depends(get_authenticated_user)):
    return await checked(export_result,payload,user)
