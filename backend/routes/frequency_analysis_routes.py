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


def data(model):
    return model.model_dump() if hasattr(model,'model_dump') else model.dict()


async def checked(function,*args,**kwargs):
    try:return await run_in_threadpool(function,*args,**kwargs)
    except (ValueError,KeyError,TypeError,zipfile.BadZipFile,InvalidFileException) as exc:raise HTTPException(400,str(exc)) from exc


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
        ranges=sessions.daily_ranges(payload.start_date,payload.end_date,[data(slot) for slot in payload.slots])
        return sessions.analyse(payload.session_token,user,ranges)
    return await checked(analyse)


@router.post('/consolidate')
async def consolidate(payload:ConsolidatePayload,user=Depends(get_authenticated_user)):
    return await checked(sessions.consolidate_sources,[data(source) for source in payload.sources],user)


@router.post('/table')
async def table(payload:ResultPayload,user=Depends(get_authenticated_user)):
    return await checked(sessions.result_page,payload.session_token,payload.result_token,user,payload.group,payload.offset,payload.limit)


@router.post('/chart')
async def chart(payload:ResultPayload,user=Depends(get_authenticated_user)):
    return await checked(sessions.result_chart,payload.session_token,payload.result_token,user,payload.entity_id)


def export_result(payload,user):
    from services.frequency_event_reporting import supplements_excel,supplements_html
    session,result=sessions.get_result(payload.session_token,payload.result_token,user)
    if payload.format not in {'xlsx','docx','html'}:raise ValueError('Choose HTML, Excel or Word.')
    if any(group not in sessions.GROUPS for group in payload.performance_groups):raise ValueError('Invalid performance group.')
    if payload.include_entity_performance and not payload.performance_groups:raise ValueError('Select at least one performance group.')
    event={'event_name':session['metadata'].get('filename') or 'Consolidated Frequency Analysis','start_time':result['summary']['analysis_start'],'end_time':result['summary']['analysis_end'],
        'lowest_frequency':result['summary']['minimum_frequency'],'threshold_analysis':result,'chronology':result['chronology'],'performance':{},'warnings':result['warnings'],'calculation_note':result['calculation_note'],'selection_note':f"Selected windows: {len(result['ranges'])}. Slot patterns (IST): "+', '.join(dict.fromkeys(r['start_time'][11:]+' - '+r['end_time'][11:]+(' (next date)' if r['start_time'][:10]!=r['end_time'][:10] else '') for r in result['ranges']))}
    options={**data(payload),'supplemental_events':[event],'include_existing_sections':False,'include_threshold_performance':True,'include_analysis_summary':True,
        'report_title':'Consolidated Frequency Analysis','start_time':event['start_time'],'end_time':event['end_time'],'rows':[]}
    if payload.format=='xlsx':
        return StreamingResponse(supplements_excel([event],options),media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',headers={'Content-Disposition':'attachment; filename="consolidated_frequency_analysis.xlsx"'})
    if payload.format=='docx':
        from routes.frequency_routes import download_docx
        import asyncio
        return asyncio.run(download_docx(options))
    ranges=[(row['start_time'],row['end_time']) for row in result['ranges']]
    states=[e for e in session['dataset']['entities'] if e['group']=='State']
    events=[]
    for entity in states:
        chart=sessions.chart_points(session['dataset'],ranges,entity['entity_id'],limit=max(500,6000//max(1,len(states))))
        points=chart['points']
        events.append({'event_id':entity['entity_id'],'event_name':event['event_name'],'event_type':'low','state':entity['display_name'],'start_time':event['start_time'],'end_time':event['end_time'],
            'series':{'timestamps':[point['timestamp'] for point in points],'frequency':[point['frequency'] for point in points],'deviation':[point['od_mw'] for point in points]},
            'crms_messages':[{'timestamp':row['timestamp'],'message_no':row['message_no'],'remarks':row['message_details'],'category':[row['message_type']]} for row in result['chronology'] if row['entity_id']==entity['entity_id']]})
    return {'success':True,'supplemental_html':supplements_html([event],options),'stacked_response':{'analysis':True,'title':event['event_name'],'state':states[0]['display_name'] if states else 'Frequency Analysis','states':[e['display_name'] for e in states],'events':events}}


@router.post('/export')
async def export(payload:ResultPayload,user=Depends(get_authenticated_user)):
    return await checked(export_result,payload,user)
