"""Small table-only reports, sharing calculations and existing export engines."""
import asyncio
import json
from collections import defaultdict
from html import escape
from fastapi.responses import StreamingResponse
from services import frequency_analysis_sessions as sessions
from services.frequency_event_reporting import supplements_excel,message_category_rows,MESSAGE_CATEGORY_COLUMNS,CHRONOLOGY_COLUMNS
from services.frequency_report_formatting import format_report_value


def number(value):
    return '-' if value is None else f'{value:.3f}'.rstrip('0').rstrip('.') if isinstance(value,(int,float)) else str(value)


def performance_table(rows,levels,high=False):
    columns=[('date','Date / Month'),('event','Event'),('entity','Entity'),('period','Period (IST)'),('highest_frequency','Max Hz') if high else ('lowest_frequency','Min Hz')]
    sign='>' if high else '<'
    for level in levels:
        columns.extend([(f'{level}_frequency',f'{sign}{level} Hz min (%)'),(f'{level}_adverse',f'{sign}{level} Adverse min (%)'),(f'{level}_mw',f'{sign}{level} Avg / Max MW')])
    columns.append(('message_count','Messages'));output=[]
    for row in rows:
        record={**row,'period':row['period_start'].replace('T',' ')+' - '+row['period_end'].replace('T',' ')}
        frequency_key = 'highest_frequency' if high else 'lowest_frequency'
        record[frequency_key] = format_report_value(row.get(frequency_key), frequency_key)
        for level in levels:
            values=row['thresholds'][level];minutes=values['frequency_minutes'];duration=row.get('selected_minutes')
            percent=minutes/duration*100 if duration else None
            record[f'{level}_frequency']=f'{number(minutes)} ({number(percent)}%)'
            record[f'{level}_adverse']=f"{number(values['adverse_minutes'])} ({number(values['adverse_pct'])}%)"
            record[f'{level}_mw']=f"{format_report_value(values['average_od_ui_mw'], 'average_od_ui_mw')} / {format_report_value(values['maximum_od_ui_mw'], 'maximum_od_ui_mw')}"
        output.append(record)
    return columns,output


def report_tables(session,result,payload):
    high=result.get('event_type')=='high';levels=list(result['summary']['thresholds']);sign='>' if high else '<'
    entities=[entity for entity in session['dataset']['entities'] if entity['group'] in payload.performance_groups]
    windows=sessions.period_windows(result,'event')
    rows,summaries=sessions.period_statistics(session,result,windows,entities)
    columns=[('date','Date'),('event','Event'),('minimum_frequency','Minimum Hz'),('maximum_frequency','Maximum Hz'),('minimum_timestamp','Minimum at (IST)'),('selected_minutes','Selected min'),('covered_frequency_minutes','Covered min')]
    for level in levels:columns.extend([(f'{level}_minutes',f'{sign}{level} Minutes'),(f'{level}_pct',f'{sign}{level} % selected')])
    frequency=[]
    for period in summaries:
        summary=period['summary'] or {};record={'date':period['date'],'event':period['event'],**{key:summary.get(key) for key,_ in columns}}
        record['minimum_frequency'] = format_report_value(record.get('minimum_frequency'), 'minimum_frequency')
        record['maximum_frequency'] = format_report_value(record.get('maximum_frequency'), 'maximum_frequency')
        record.update(date=period['date'],event=period['event'])
        for level in levels:
            values=summary.get('thresholds',{}).get(level,{})
            record.update({f'{level}_minutes':values.get('frequency_minutes'),f'{level}_pct':values.get('selected_time_pct')})
        frequency.append(record)
    overall=[{'threshold':sign+level,'minutes':values['frequency_minutes'],'percent':values['frequency_minutes']/result['summary']['selected_minutes']*100,
        'occurrences':values['occurrences'],'longest':values['longest_minutes'],
        'minimum_frequency':format_report_value(result['summary']['minimum_frequency'],'minimum_frequency'),
        'maximum_frequency':format_report_value(result['summary']['maximum_frequency'],'maximum_frequency')} for level,values in result['summary']['thresholds'].items()]
    tables=[('Overall Frequency Statistics',[('threshold','Threshold Hz'),('minutes','Minutes'),('percent','% selected'),('occurrences','Occurrences'),('longest','Longest min'),('minimum_frequency','Min Hz'),('maximum_frequency','Max Hz')],overall),('Event Frequency Statistics',columns,frequency)]
    monthly=defaultdict(list)
    for window in windows:monthly[window['date'][:7]].extend(window['ranges'])
    month_rows,_=sessions.period_statistics(session,result,[{'id':month,'date':month,'event':None,'ranges':ranges} for month,ranges in monthly.items()],entities)
    if payload.include_entity_performance:
        for group in payload.performance_groups:
            for title,source in [('Event Performance',rows),('Monthly Performance',month_rows),('Overall Performance',[{**r,'group':group,'selected_minutes':result['summary']['selected_minutes']} for r in result['overall_performance'][group]])]:
                table_columns,table_rows=performance_table([r for r in source if r['group']==group],levels,high)
                tables.append((group+' '+title,table_columns,table_rows))
    chronology=[];warnings=[]
    if payload.include_chronology:
        chronology,warnings=sessions.report_chronology(session,result)
        chronology=[{**row,'date':row['timestamp'][:10],'event':', '.join(str(period['event']) for period in windows if period['date']==row['timestamp'][:10] and any(a<=row['timestamp']<b for a,b in period['ranges'])),
            'message_type':' / '.join(row.get('message_categories') or [row['message_type']])} for row in chronology]
        tables.append(('Daily Event Chronology',[('date','Date'),('event','Event'),*CHRONOLOGY_COLUMNS],chronology))
        tables.append(('Category-wise Messages',MESSAGE_CATEGORY_COLUMNS,message_category_rows(chronology,result['messages_complete'])))
    return tables,warnings


def html_report(tables,title,warnings):
    data=json.dumps([{'title':name,'columns':columns,'rows':[{key:row.get(key) for key,_ in columns} for row in rows]} for name,columns,rows in tables],ensure_ascii=False).replace('<','\\u003c')
    return '<!doctype html><html><head><meta charset="utf-8"><title>'+escape(title)+'</title><style>body{font:13px Segoe UI,Arial;background:#f3f8f7;color:#102a43;margin:20px}header,main{background:white;padding:16px;border:1px solid #cbd5e1;border-radius:8px}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #cbd5e1;padding:7px;vertical-align:top}th{background:#203b63;color:white;position:sticky;top:0}.scroll{overflow:auto;max-height:70vh}button,select,input{padding:7px;margin:5px}h1{font-size:20px}.note{color:#64748b}[hidden]{display:none}</style></head><body><header><h1>'+escape(title)+'</h1><p class="note">IST | One entity/event per row. Frequency and adverse durations include minutes and percentages. Tables use original readings.</p>'+''.join('<p class="note">'+escape(w)+'</p>' for w in warnings)+'<select id="table"></select><input id="date" type="date" aria-label="Filter chronology date"><label id="compare-label"><input id="compare" type="checkbox">Daily events side by side</label><button id="download">Download table (CSV / Excel)</button><button id="save">Download HTML</button></header><main><div class="scroll"><table id="grid"></table></div><button id="previous">Previous</button><span id="count"></span><button id="next">Next</button></main><script>const tables='+data+''';
const select=document.getElementById('table'),day=document.getElementById('date');let page=0;
const esc=value=>String(value??'-').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
tables.forEach((table,index)=>{const option=document.createElement('option');option.value=index;option.textContent=table.title;select.appendChild(option)});
const selected=()=>{const table=tables[Number(select.value)||0];let rows=table.rows.filter(row=>!day.value||row.date===day.value);if(document.getElementById('compare').checked&&table.title.includes('Event Performance')){const events=[...new Set(rows.map(row=>row.event))].sort((a,b)=>a-b);const fields=table.columns.filter(([key])=>!['date','event','entity'].includes(key));const grouped=new Map();rows.forEach(row=>{const key=JSON.stringify([row.date,row.entity]);if(!grouped.has(key))grouped.set(key,{date:row.date,entity:row.entity});const target=grouped.get(key);fields.forEach(([field])=>target[row.event+'_'+field]=row[field])});return{...table,columns:[['date','Date'],['entity','Entity'],...events.flatMap(event=>fields.map(([key,label])=>[event+'_'+key,'Event '+event+' '+label]))],rows:[...grouped.values()]}}return{...table,rows}};
function render(){const table=selected();day.hidden=!table.title.includes('Chronology');document.getElementById('compare-label').hidden=!table.title.includes('Event Performance');document.getElementById('grid').innerHTML='<thead><tr>'+table.columns.map(([,label])=>'<th>'+esc(label)+'</th>').join('')+'</tr></thead><tbody>'+table.rows.slice(page*100,(page+1)*100).map(row=>'<tr>'+table.columns.map(([key])=>'<td>'+esc(row[key])+'</td>').join('')+'</tr>').join('')+'</tbody>';document.getElementById('count').textContent=table.rows.length+' rows | page '+(page+1);document.getElementById('previous').disabled=page===0;document.getElementById('next').disabled=(page+1)*100>=table.rows.length}
select.onchange=()=>{page=0;day.value='';document.getElementById('compare').checked=false;render()};document.getElementById('compare').onchange=()=>{page=0;render()};day.onchange=()=>{page=0;render()};document.getElementById('previous').onclick=()=>{page--;render()};document.getElementById('next').onclick=()=>{page++;render()};
function download(content,name,type){const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000)}
document.getElementById('download').onclick=()=>{const table=selected();const cell=value=>{let text=String(value??'');if(/^[=+@-]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"'};download('\\uFEFF'+[table.columns.map(([,label])=>cell(label)).join(','),...table.rows.map(row=>table.columns.map(([key])=>cell(row[key])).join(','))].join('\\r\\n'),table.title+'.csv','text/csv;charset=utf-8')};
document.getElementById('save').onclick=()=>download('<!doctype html>'+document.documentElement.outerHTML,'Frequency_Analysis.html','text/html;charset=utf-8');render();</script></body></html>'''


def export_compact(payload,user):
    session,result=sessions.get_result(payload.session_token,payload.result_token,user)
    if payload.format not in {'html','xlsx','pdf','docx'}:raise ValueError('Choose HTML, PDF, Excel or Word.')
    if any(g not in sessions.GROUPS for g in payload.performance_groups):raise ValueError('Invalid performance group.')
    tables,warnings=report_tables(session,result,payload)
    title=('High' if result.get('event_type')=='high' else 'Low')+' Frequency Analysis'
    event={'event_name':title,'start_time':result['summary']['analysis_start'],'end_time':result['summary']['analysis_end'],'lowest_frequency':result['summary']['minimum_frequency'],
        'period_reports':tables,'warnings':list(dict.fromkeys([*result['warnings'],*warnings])),'calculation_note':result['calculation_note']}
    event['state_reports']={e['display_name']:[(name,columns,[row for row in rows if row.get('entity',row.get('state'))==e['display_name']]) for name,columns,rows in tables if name.startswith('State ') or name=='Daily Event Chronology'] for e in session['dataset']['entities'] if e['group']=='State'}
    options={'supplemental_events':[event],'include_existing_sections':False,'include_entity_performance':False,'include_chronology':False,'include_analysis_summary':False,'report_title':title,'rows':[]}
    if payload.format=='html':return {'success':True,'html_document':html_report(tables,title,event['warnings'])}
    if payload.format=='xlsx':return StreamingResponse(supplements_excel([event],options),media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',headers={'Content-Disposition':'attachment; filename="frequency_analysis.xlsx"'})
    from routes.frequency_routes import download_pdf,download_docx
    return asyncio.run((download_pdf if payload.format=='pdf' else download_docx)(options))
