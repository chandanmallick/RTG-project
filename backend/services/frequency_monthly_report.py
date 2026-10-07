"""Monthly operation report: shared data model for matching Word/PDF exports."""
from io import BytesIO
from pathlib import Path
from threading import RLock
from xml.sax.saxutils import escape
import numpy as np
from fastapi.responses import StreamingResponse
from services import frequency_analysis_sessions as sessions
from services.frequency_compact_reports import number, report_tables
from services.frequency_threshold_analysis import calculate, iso, merge_ranges, seconds, segments

TEMPLATE = Path(__file__).resolve().parent.parent / 'report_templates' / 'frequency_monthly.docx'
_plot_lock = RLock()


def plot_image(kind, title, x, y, high=False, secondary=None,annotations=None):
    # Object-oriented Agg renderer avoids shared pyplot state during concurrent exports.
    from matplotlib.figure import Figure
    from matplotlib.backends.backend_agg import FigureCanvasAgg
    with _plot_lock:
        fig=Figure(figsize=(9.6,3.1),dpi=150,layout='constrained');FigureCanvasAgg(fig)
        ax=fig.subplots()
        if kind=='heat':
            masked=np.ma.masked_invalid(np.asarray(y,dtype=float))
            maximum=100 if 'percent' in title else 60 if 'minutes' in title else max(1,float(masked.max()) if masked.count() else 1)
            image=ax.imshow(masked,aspect='auto',cmap='YlOrRd',interpolation='nearest',vmin=0,vmax=maximum)
            ax.set_xticks(range(len(x)),x,rotation=45,ha='right',fontsize=7)
            ax.set_yticks(range(len(secondary)),secondary,fontsize=8)
            fig.colorbar(image,ax=ax,shrink=.85)
        elif kind=='bar':
            ax.barh(x,y,color='#e89527',label='Deviation at lowest frequency' if not high else 'Deviation at highest frequency')
            if secondary is not None:
                ax.hlines(x,y,secondary,color='#202734',linewidth=1)
                ax.scatter(secondary,x,color='#202734',s=12,label='Maximum adverse deviation')
            ax.set_xlabel('MW');ax.set_xlim(left=0);ax.tick_params(axis='y',labelsize=8);ax.legend(fontsize=7)
        elif kind=='duration':
            ax.plot(x,y,color='#244366',linewidth=1.5);ax.axvspan(49.9,50.05,color='#dbe8f4',alpha=.6)
            ax.set_xlabel('Frequency Hz');ax.set_ylabel('Share of covered time below frequency (%)');ax.tick_params(axis='x',labelsize=8)
        else:
            import matplotlib.dates as mdates
            import pandas as pd
            dates=pd.to_datetime(x);values=np.asarray(y,dtype=float)
            ax.plot(dates,values,color='#244366',linewidth=.7)
            if kind=='frequency':
                condition=(values>50.05) if high else (values<49.9)
                ax.fill_between(dates,values,50.,where=condition & np.isfinite(values),color='#d34d41',alpha=.25)
                for level in (49.50,49.70,49.90,50.,50.05):ax.axhline(level,color='#b3bdc8',linewidth=.6,linestyle='--')
                ax.set_ylabel('Hz')
            else:ax.set_ylabel('MW')
            ax.xaxis.set_major_formatter(mdates.DateFormatter('%d %b\n%H:%M'))
            if secondary is not None:
                twin=ax.twinx();twin.plot(dates,secondary,color='#7958a1',linewidth=.7);twin.set_ylabel('Hz')
            shown=set()
            for stamp,label in annotations or []:
                ax.axvline(pd.Timestamp(stamp),color='#19856d' if label=='Physical regulation' else '#c77617',linewidth=.7,linestyle=':',label=label if label not in shown else None);shown.add(label)
            if shown:ax.legend(fontsize=7,loc='upper left')
        ax.spines[['top','right']].set_visible(False);ax.grid(axis='y',alpha=.16)
        output=BytesIO();fig.savefig(output,format='png');output.seek(0);return output.getvalue()


def series(dataset,ranges,entity=None):
    index,left,right=segments(dataset,merge_ranges(ranges))
    frequency=dataset['frequency'][index].copy();frequency[frequency<45]=np.nan
    values=frequency if entity is None else entity['deviation'][index].copy()
    values[~np.isfinite(frequency)]=np.nan
    # Explicit nulls prevent lines crossing source gaps or selected-event boundaries.
    x=[];y=[];f=[];previous=None
    for at in range(len(index)):
        if previous is not None and left[at]-previous>1e-6:x.append(iso(left[at]));y.append(np.nan);f.append(np.nan)
        x.append(iso(left[at]));y.append(values[at]);f.append(frequency[at]);previous=right[at]
    # Charts use extrema-preserving envelopes; statistics always use original arrays.
    if len(x)>4000:
        keep=set()
        for bucket in np.array_split(np.arange(len(x)),800):
            keep.update((int(bucket[0]),int(bucket[-1])))
            for data in (y,f):
                valid=bucket[np.isfinite(np.asarray(data)[bucket])]
                if len(valid):keep.update((int(valid[np.argmin(np.asarray(data)[valid])]),int(valid[np.argmax(np.asarray(data)[valid])])) )
                missing=bucket[~np.isfinite(np.asarray(data)[bucket])]
                if len(missing):keep.add(int(missing[0]))
        order=sorted(keep);x=[x[i] for i in order];y=[y[i] for i in order];f=[f[i] for i in order]
    return x,y,f


def build_blocks(session,result,payload):
    high=result.get('event_type')=='high';label='HIGH' if high else 'LOW';dataset=session['dataset']
    tables,warnings=report_tables(session,result,payload)
    events=sessions.period_windows(result,'event')
    entities=[e for e in dataset['entities'] if e['group'] in payload.performance_groups]
    event_rows,_=sessions.period_statistics(session,result,events,entities)
    # Full-day scope is independent of selected daily slots and does not fetch new files.
    first=result['summary']['analysis_start'][:10];last=iso(seconds(result['summary']['analysis_end'])-.001)[:10]
    full_ranges=[(first+'T00:00:00',iso(seconds(last+'T00:00:00')+86400))]
    full=calculate({**dataset,'entities':[]},full_ranges,[],False,include_blocks=False,event_type=result.get('event_type','low'))['summary']
    blocks=[]
    def heading(text):blocks.append(('heading',text))
    def text(value):
        if value:blocks.append(('text',value))
    def table(title,cols,rows,wide=False):blocks.append(('table',(title,cols,rows,wide and bool(rows))))
    def chart(kind,title,x,y,secondary=None,annotations=None):
        if len(x):blocks.append(('image',(title,plot_image(kind,title,x,y,high,secondary,annotations))))
    notes=payload.report_text
    blocks.append(('title',f'{label} FREQUENCY OPERATION REPORT'))
    text(f'{first} to {last} | Indian Standard Time | {len(events)} daily event periods')
    heading('1  Executive Summary and General Notes')
    text(notes.executive_summary)
    text(f"Lowest observed frequency was {number(full['minimum_frequency'])} Hz at {full['minimum_timestamp'].replace('T',' ')} IST. Valid full-period frequency coverage is {number(full['covered_frequency_minutes'])} of {number(full['selected_minutes'])} minutes. Selected-event coverage is {number(result['summary']['covered_frequency_minutes'])} of {number(result['summary']['selected_minutes'])} minutes.")
    text(notes.general_notes)
    count=len({(r.get('timestamp'),r.get('message_no')) for r in result['chronology'] if r.get('message_no')}) if result['messages_complete'] else None
    text('Messages issued in the selected reporting windows: '+number(count)+'. Recipient-wise category counts are presented in the actions section.')
    for warning in dict.fromkeys([*result['warnings'],*warnings]):text('Coverage note: '+warning)
    heading('2  Frequency Analysis')
    text('Entire 24-hour reporting period, using available cached frequency readings. Missing and invalid readings are excluded; percentages use the full calendar reporting duration.')
    indicators=[{'indicator':'Lowest frequency','value':f"{number(full['minimum_frequency'])} Hz at {full['minimum_timestamp']}"},{'indicator':'Highest frequency','value':number(full['maximum_frequency'])+' Hz'},{'indicator':'Average frequency','value':number(full['average_frequency'])+' Hz'},{'indicator':'Valid frequency coverage','value':number(full['covered_frequency_minutes'])+' minutes'}]
    for level,v in full['thresholds'].items():indicators.append({'indicator':('Above ' if high else 'Below ')+level+' Hz','value':f"{number(v['frequency_minutes'])} minutes ({number(v['frequency_minutes']/full['selected_minutes']*100)}%); {v['occurrences']} occurrences; longest {number(v['longest_minutes'])} minutes"})
    table('Full-period frequency indicators',[('indicator','Indicator'),('value','Reporting period')],indicators)
    x,y,_=series(dataset,full_ranges);chart('frequency','Frequency plot for the reporting period',x,y)
    idx,left,right=segments(dataset,merge_ranges(full_ranges));freq=dataset['frequency'][idx];valid=np.isfinite(freq)&(freq>=45)
    order=np.argsort(freq[valid]);sorted_frequency=freq[valid][order];weights=(right-left)[valid][order];cumulative=np.cumsum(weights)/weights.sum()*100
    for label,condition in [('Within 49.90 to 50.05 Hz',(freq>=49.9)&(freq<=50.05)),('Above 50.05 Hz',freq>50.05)]:
        minutes=(right-left)[valid&condition].sum()/60
        indicators.append({'indicator':label,'value':f"{number(minutes)} minutes ({number(minutes/full['selected_minutes']*100)}% of the calendar period)"})
    keep=np.unique(np.linspace(0,len(order)-1,min(1000,len(order)),dtype=int))
    chart('duration','Frequency duration analysis',sorted_frequency[keep],cumulative[keep])
    # Include every calendar day, even days with no selected event.
    daily_full=[];day=seconds(first+'T00:00:00');stop=seconds(full_ranges[0][1])
    while day<stop:daily_full.append({'id':iso(day)[:10],'date':iso(day)[:10],'event':None,'ranges':[(iso(day),iso(day+86400))]});day+=86400
    _,daily=sessions.period_statistics(session,result,daily_full,[])
    day_rows=[]
    for d in daily:
        s=d['summary'] or {};r={'date':d['date'],'minimum':s.get('minimum_frequency'),'at':s.get('minimum_timestamp'),'coverage':s.get('covered_frequency_minutes')}
        for level in full['thresholds']:
            v=s.get('thresholds',{}).get(level,{});r[level]=f"{number(v.get('frequency_minutes'))} min ({number(v.get('day_time_pct'))}%)"
        day_rows.append(r)
    table('Day-wise frequency statistics',[('date','Date'),('minimum','Minimum Hz'),('at','At IST'),('coverage','Covered min'),*[(k,k+' Hz min (%)') for k in full['thresholds']]],day_rows)
    heat=[]
    for d in daily_full:
        try:idx,left,right=segments(dataset,merge_ranges(d['ranges']))
        except ValueError:heat.append([np.nan]*24);continue
        freq=dataset['frequency'][idx];valid=np.isfinite(freq)&(freq>=45);hour=((left-seconds(d['date']+'T00:00:00'))//3600).astype(int)
        violation=(freq>50.05) if high else (freq<49.9)
        heat.append([float((right-left)[valid&(hour==h)&violation].sum()/60) if np.any(valid&(hour==h)) else np.nan for h in range(24)])
    chart('heat','Hourly frequency violation minutes heat map',list(range(24)),heat,[d['date'] for d in daily_full])
    if payload.include_entity_performance:
        generators_started=False
        for group in payload.performance_groups:
            if group=='State':heading('3  State Performance Details')
            else:
                if not generators_started:heading('4  Generator Performance Details');generators_started=True
                heading(group+' Performance')
            text(notes.state_observations if group=='State' else notes.generator_observations)
            text('Selected daily events only. State-sector IPPs and State generators are excluded. Generator tables list entities with observed adverse injection; signed MW values follow the analysis calculation conventions.')
            selected=[e for e in entities if e['group']==group]
            adverse=[];at_extreme=[];names=[]
            level='50.05' if high else '49.90'
            for e in selected:
                row=next((r for r in result['overall_performance'][group] if r['entity_id']==e['entity_id']),None)
                if not row:continue
                v=row['thresholds'][level]
                if group!='State' and not v['adverse_minutes']:continue
                idx,left,right=segments(dataset,merge_ranges([(r['start_time'],r['end_time']) for r in result['ranges']]))
                freq=dataset['frequency'][idx];valid=np.isfinite(freq)&(freq>=45);pos=np.flatnonzero(valid)
                extreme=pos[np.argmax(freq[valid]) if high else np.argmin(freq[valid])];dev=e['deviation'][idx[extreme]]
                sign=1 if (group=='State')!=high else -1
                names.append(e['display_name']);adverse.append(abs(v['maximum_od_ui_mw']) if v['maximum_od_ui_mw'] is not None else np.nan);at_extreme.append(max(sign*dev,0) if np.isfinite(dev) else np.nan)
            for offset in range(0,len(names),12):chart('bar',group+' adverse deviation summary',names[offset:offset+12],at_extreme[offset:offset+12],adverse[offset:offset+12])
            for name,cols,rows in tables:
                if name==group+' Monthly Performance':
                    table(name,performance_columns(high),performance_records([r for r in rows if group=='State' or any(r['thresholds'][k]['adverse_minutes'] for k in r['thresholds'])],high),True)
            slots=sorted({w['event'] for w in events})
            for slot in slots:
                slot_ranges=[r for w in events if w['event']==slot for r in w['ranges']]
                source,_=sessions.period_statistics(session,result,[{'id':f'slot:{slot}','date':first+' to '+last,'event':slot,'ranges':slot_ranges}],selected)
                source=[r for r in source if group=='State' or any(v['adverse_minutes'] for v in r['thresholds'].values())]
                table(f'{group} reporting window Event {slot} for the reporting period',performance_columns(high),performance_records(source,high),True)
            group_rows=[r for r in event_rows if r['group']==group]
            dates=sorted({r['date'] for r in group_rows});names=[e['display_name'] for e in selected]
            for metric,title in [('maximum_od_ui_mw','Maximum adverse MW'),('adverse_pct','Maximum event adverse duration percent')]:
                values=[]
                for name in names:
                    values.append([max([abs(r['thresholds'][level][metric]) for r in group_rows if r['entity']==name and r['date']==d and r['thresholds'][level][metric] is not None],default=np.nan) for d in dates])
                for offset in range(0,len(names),12):chart('heat',group+' '+title,dates,values[offset:offset+12],names[offset:offset+12])
    heading('5  Action and Chronology of Events')
    text(notes.chronology_notes)
    for name,cols,rows in tables:
        if name=='Category-wise Messages':table('Messages issued by recipient and category',cols,rows)
    text('Detailed chronology, including physical regulation, is listed per daily event in Annexure 4.')
    heading('6  ADMS and UFR Actions')
    text(notes.adms_ufr_remarks or 'ADMS and UFR operation data are not available from the current integrated sources.')
    heading('Annexure 1  Daily Frequency Curves')
    for d in daily_full:
        try:x,y,_=series(dataset,d['ranges'])
        except ValueError:text(d['date']+' — no frequency readings available.');continue
        chart('frequency',d['date']+' frequency curve',x,y)
    for w in events:
        x,y,_=series(dataset,w['ranges']);chart('frequency',f"{w['date']} Event {w['event']} frequency curve",x,y)
    if payload.include_entity_performance:
        heading('Annexure 2  Daily Event Performance')
        for group in payload.performance_groups:
            source=[r for r in event_rows if r['group']==group and (group=='State' or any(v['adverse_minutes'] for v in r['thresholds'].values()))]
            table(group+' daily event statistics',performance_columns(high),performance_records(source,high),True)
        heading('Annexure 3  State Deviation and Frequency')
        for e in entities:
            if e['group']=='State':
                for w in events:
                    chronology=next((t[2] for t in tables if t[0]=='Daily Event Chronology'),[])
                    annotations=[(r['timestamp'],'Physical regulation' if r.get('message_type')=='Physical Regulation' else 'CRMS message') for r in chronology if (r.get('entity_id')==e['entity_id'] or r.get('state')==e['display_name']) and any(a<=r['timestamp']<b for a,b in w['ranges'])]
                    x,y,f=series(dataset,w['ranges'],e);chart('deviation',f"{e['display_name']} | {w['date']} Event {w['event']}",x,y,f,annotations)
    if payload.include_chronology:
        heading('Annexure 4  Daily Event Chronology')
        chronology=next((t for t in tables if t[0]=='Daily Event Chronology'),None)
        if chronology:
            _,cols,rows=chronology
            for w in events:
                selected=[r for r in rows if r['date']==w['date'] and any(a<=r['timestamp']<b for a,b in w['ranges'])]
                table(f"{w['date']} Event {w['event']} | {w['ranges'][0][0][11:16]}–{w['ranges'][0][1][11:16]} IST",cols,selected,True)
    heading('Calculation Notes');text(result['calculation_note'])
    return blocks


def performance_columns(high):
    cols=[('period','Date / Event / IST'),('entity','Entity'),('minimum','Frequency Hz / At IST')]
    for level in (['50.05'] if high else ['49.50','49.70','49.90']):
        cols.extend([(level+'_adverse',level+' Hz\nFrequency min / Adverse min (%)'),(level+'_average',level+' Hz\nAvg MW'),(level+'_maximum',level+' Hz\nMax MW'),(level+'_messages',level+' Hz\nMessages')])
    return cols


def performance_records(rows,high):
    output=[]
    for row in rows:
        intervals=list(dict.fromkeys(a[11:16]+'–'+b[11:16] for a,b in row['selected_ranges']))
        r={'period':row['date']+(f" / Event {row['event']}" if row['event'] else ' / Monthly')+'\n'+'; '.join(intervals),'entity':row['entity'],'minimum':f"{number(row.get('highest_frequency') if high else row['lowest_frequency'])}\n"+(row.get('minimum_timestamp','') if not high else '')}
        for level,v in row['thresholds'].items():
            r.update({level+'_adverse':f"{number(v['frequency_minutes'])} / {number(v['adverse_minutes'])} ({number(v['adverse_pct'])}%)",level+'_average':number(v['average_od_ui_mw']),level+'_maximum':number(v['maximum_od_ui_mw']),level+'_messages':number(v['message_count'])})
        output.append(r)
    return output


def grouped_header(cols):
    return len(cols)>3 and cols[0][0]=='period' and cols[3][0].endswith('_adverse')


def render_word(blocks):
    from docx import Document
    from docx.shared import Inches,Pt,RGBColor
    from docx.enum.section import WD_SECTION_START,WD_ORIENT
    from docx.oxml import OxmlElement
    from docx.oxml.ns import qn
    doc=Document(TEMPLATE)
    body=doc._element.body
    for child in list(body):
        if child.tag!=qn('w:sectPr'):body.remove(child)
    # Source chart pictures are examples, never retain their unused binary payloads.
    for rid,rel in list(doc.part.rels.items()):
        if rel.reltype.endswith('/image'):doc.part.drop_rel(rid)
    for name in ('Normal','Title','Heading 1','Heading 2'):
        style=doc.styles[name];style.font.name='Calibri';style.font.color.rgb=RGBColor(0,0,0)
    doc.styles['Normal'].font.size=Pt(10);doc.styles['Normal'].paragraph_format.space_after=Pt(6)
    doc.styles['Title'].font.size=Pt(21);doc.styles['Heading 1'].font.size=Pt(14)
    footer=doc.sections[0].footer.paragraphs[0]
    footer.text='Frequency Operation Report | IST | Page '
    page_field=OxmlElement('w:fldSimple');page_field.set(qn('w:instr'),'PAGE');footer._p.append(page_field)
    for run in footer.runs:run.font.size=Pt(8);run.font.color.rgb=RGBColor.from_string('64748B')
    landscape=False
    def orientation(wide):
        nonlocal landscape
        if wide==landscape:return
        s=doc.add_section(WD_SECTION_START.NEW_PAGE);s.orientation=WD_ORIENT.LANDSCAPE if wide else WD_ORIENT.PORTRAIT
        s.page_width=Inches(11.693 if wide else 8.268);s.page_height=Inches(8.268 if wide else 11.693)
        s.left_margin=s.right_margin=Inches(.55);landscape=wide
    for position,(kind,value) in enumerate(blocks):
        if kind=='table':
            title,cols,rows,wide=value;orientation(wide);doc.add_heading(title,2)
            if not rows:doc.add_paragraph('No records available for this section.');continue
            grouped=grouped_header(cols)
            table=doc.add_table(rows=2 if grouped else 1,cols=len(cols));table.style='Table Grid'
            table.autofit=False
            available=(doc.sections[-1].page_width-doc.sections[-1].left_margin-doc.sections[-1].right_margin)/914400
            weights=[2 if key in ('entity','period','message_details','value','timestamp','minimum') else 1 for key,_ in cols]
            for column,weight in zip(table.columns,weights):column.width=Inches(available*weight/sum(weights))
            for row in table.rows:
                for cell,weight in zip(row.cells,weights):cell.width=Inches(available*weight/sum(weights))
            borders=OxmlElement('w:tblBorders')
            for edge in ('top','left','bottom','right','insideH','insideV'):
                border=OxmlElement('w:'+edge)
                for key,val in [('val','single'),('sz','4'),('color','D9D9D9')]:border.set(qn('w:'+key),val)
                borders.append(border)
            table._tbl.tblPr.append(borders)
            if grouped:
                for at in range(3):table.cell(0,at).merge(table.cell(1,at)).text=cols[at][1]
                for at in range(3,len(cols),4):
                    table.cell(0,at).merge(table.cell(0,at+3)).text=('>' if cols[at][0].startswith('50.') else '<')+cols[at][0].split('_')[0]+' Hz'
                    for offset,label in enumerate(['Frequency min / Adverse min (%)','Average MW','Maximum MW','Violation messages']):table.cell(1,at+offset).text=label
            else:
                for c,(_,label) in zip(table.rows[0].cells,cols):c.text=label
            for header_row in list(table.rows)[:2 if grouped else 1]:
                repeat=OxmlElement('w:tblHeader');header_row._tr.get_or_add_trPr().append(repeat)
            for row in rows:
                for c,(key,_) in zip(table.add_row().cells,cols):c.text=number(row.get(key))
            for i,row in enumerate(table.rows):
                for cell in row.cells:
                    is_header=i<(2 if grouped else 1)
                    shade=OxmlElement('w:shd');shade.set(qn('w:fill'),'203B63' if is_header else ('EFF3F7' if i%2==0 else 'FFFFFF'));cell._tc.get_or_add_tcPr().append(shade)
                    for p in cell.paragraphs:
                        p.paragraph_format.space_after=Pt(3)
                        for run in p.runs:run.font.size=Pt(7 if len(cols)>10 else 9);run.font.bold=is_header;run.font.color.rgb=RGBColor.from_string('FFFFFF' if is_header else '000000')
        else:
            next_block=blocks[position+1] if position+1<len(blocks) else None
            orientation(bool(kind=='heading' and next_block and next_block[0]=='table' and next_block[1][3]))
            if kind=='title':doc.add_paragraph(value,'Title')
            elif kind=='heading':doc.add_heading(value,1)
            elif kind=='text':
                p=doc.add_paragraph(value)
                if next_block and next_block[0]=='image':p.paragraph_format.keep_with_next=True
            elif kind=='image':
                title,data=value;p=doc.add_paragraph(title);p.paragraph_format.keep_with_next=True
                doc.add_picture(BytesIO(data),width=Inches(6.75))
    doc.core_properties.title=blocks[0][1];doc.core_properties.author=''
    output=BytesIO();doc.save(output);output.seek(0);return output


def render_pdf(blocks):
    from reportlab.platypus import BaseDocTemplate,PageTemplate,Frame,Paragraph,Spacer,Image,LongTable,TableStyle,NextPageTemplate,PageBreak,KeepTogether
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4,landscape
    output=BytesIO();styles=getSampleStyleSheet();styles['Title'].fontSize=21;styles['Title'].textColor=colors.black
    styles['BodyText'].fontSize=10;styles['BodyText'].leading=14
    styles['Heading1'].fontSize=14;styles['Heading1'].textColor=colors.black
    styles['Heading1'].keepWithNext=styles['Heading2'].keepWithNext=True
    from reportlab.lib.styles import ParagraphStyle
    cell=ParagraphStyle('cell',fontName='Helvetica',fontSize=7,leading=9)
    header=ParagraphStyle('header',parent=cell,textColor=colors.white,fontName='Helvetica-Bold')
    def para(text,style):return Paragraph(escape(str(text)).replace('\n','<br/>'),style)
    def footer(canvas,doc):
        canvas.setFont('Helvetica',8);canvas.setFillColor(colors.HexColor('#64748b'));canvas.drawString(40,25,'Frequency Operation Report | IST');canvas.drawRightString(canvas._pagesize[0]-40,25,str(doc.page))
    doc=BaseDocTemplate(output,pagesize=A4,leftMargin=40,rightMargin=40,topMargin=40,bottomMargin=42)
    for name,size in [('portrait',A4),('landscape',landscape(A4))]:doc.addPageTemplates(PageTemplate(id=name,frames=[Frame(40,42,size[0]-80,size[1]-82,id=name)],pagesize=size,onPage=footer))
    story=[];wide=False
    for position,(kind,value) in enumerate(blocks):
        desired=value[3] if kind=='table' else False
        if kind=='heading' and position+1<len(blocks) and blocks[position+1][0]=='table':desired=blocks[position+1][1][3]
        if desired!=wide:story.extend([NextPageTemplate('landscape' if desired else 'portrait'),PageBreak()]);wide=desired
        width=(landscape(A4) if wide else A4)[0]-80
        if kind in ('title','heading','text'):
            paragraph=para(value,styles[{'title':'Title','heading':'Heading1','text':'BodyText'}[kind]])
            spacing=Spacer(1,8)
            if kind in ('title','heading') or position+1<len(blocks) and blocks[position+1][0]=='image':paragraph.keepWithNext=spacing.keepWithNext=True
            story.extend([paragraph,spacing])
        elif kind=='image':
            title,data=value;story.extend([KeepTogether([para(title,styles['Heading2']),Image(BytesIO(data),width=width,height=width*3.1/9.6)]),Spacer(1,10)])
        elif kind=='table':
            title,cols,rows,_=value;story.append(para(title,styles['Heading2']))
            if not rows:story.append(para('No records available for this section.',styles['BodyText']));continue
            grouped=grouped_header(cols);spans=[]
            if grouped:
                first=[para(label,header) if at<3 else '' for at,(_,label) in enumerate(cols)]
                second=['']*3
                for at in range(3,len(cols),4):
                    first[at]=para(('>' if cols[at][0].startswith('50.') else '<')+cols[at][0].split('_')[0]+' Hz',header)
                    spans.append(('SPAN',(at,0),(at+3,0)))
                    second.extend(para(label,header) for label in ['Frequency min / Adverse min (%)','Average MW','Maximum MW','Violation messages'])
                spans.extend(('SPAN',(at,0),(at,1)) for at in range(3));data=[first,second]
            else:data=[[para(label,header) for _,label in cols]]
            data.extend([[para(number(row.get(key)),cell) for key,_ in cols] for row in rows])
            weights=[2 if key in ('entity','period','message_details','value','timestamp','minimum') else 1 for key,_ in cols]
            count=2 if grouped else 1
            t=LongTable(data,colWidths=[width*w/sum(weights) for w in weights],repeatRows=count,splitByRow=1,splitInRow=1)
            t.setStyle(TableStyle([*spans,('BACKGROUND',(0,0),(-1,count-1),colors.HexColor('#203B63')),('ROWBACKGROUNDS',(0,count),(-1,-1),[colors.white,colors.HexColor('#eff3f7')]),('GRID',(0,0),(-1,-1),.35,colors.HexColor('#d9d9d9')),('VALIGN',(0,0),(-1,-1),'MIDDLE'),('LEFTPADDING',(0,0),(-1,-1),5),('RIGHTPADDING',(0,0),(-1,-1),5),('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5)]));story.extend([t,Spacer(1,12)])
    doc.build(story);output.seek(0);return output


def export_monthly(payload,user):
    if any(g not in sessions.GROUPS for g in payload.performance_groups):raise ValueError('Invalid performance group.')
    session,result=sessions.get_result(payload.session_token,payload.result_token,user)
    blocks=build_blocks(session,result,payload)
    output=render_word(blocks) if payload.format=='docx' else render_pdf(blocks)
    media='application/vnd.openxmlformats-officedocument.wordprocessingml.document' if payload.format=='docx' else 'application/pdf'
    return StreamingResponse(output,media_type=media,headers={'Content-Disposition':f'attachment; filename="frequency_operation_report.{payload.format}"'})
