"""Reusable monthly tables and charts assembled in the prescribed report order."""
from io import BytesIO
import numpy as np
from services.frequency_monthly_data import CATEGORIES, LEVELS, monthly_model, adms_statistics
from services.frequency_threshold_analysis import iso, seconds


def value(number, digits=2):
    if number is None or isinstance(number,(float,np.floating)) and not np.isfinite(number):return '—'
    if isinstance(number,(int,float,np.number)):return f'{number:.{digits}f}'
    return str(number).replace('T',' ')


def table(title,columns,rows,wide=False):
    # Retain column headings even when there are no source records.
    return ('table',(title,columns,rows or [{columns[0][0]:'No data available'}],wide))


def figure(title, draw, size=(9.6,3.5)):
    from matplotlib.figure import Figure
    from matplotlib.backends.backend_agg import FigureCanvasAgg
    from services.frequency_monthly_report import _plot_lock
    with _plot_lock:
        fig=Figure(figsize=size,dpi=150,layout='constrained');FigureCanvasAgg(fig)
        draw(fig)
        fig.suptitle(title,fontsize=10,color='#203B63')
        out=BytesIO();fig.savefig(out,format='png');return ('image',(title,out.getvalue()))


def empty(ax):
    ax.text(.5,.5,'No data available',ha='center',va='center',transform=ax.transAxes,color='#64748B')


def frequency_plot(model,ranges,title,entity=None,chronology=()):
    from services.frequency_monthly_report import series
    import pandas as pd
    import matplotlib.dates as mdates
    def draw(fig):
        ax=fig.subplots()
        try:x,y,f=series(model['dataset'],ranges,entity)
        except ValueError:x,y,f=[],[],[]
        if len(x):
            dates=pd.to_datetime(x);y=np.asarray(y,dtype=float)
            ax.plot(dates,y,color='#244366',lw=.8,label='State OD (signed)' if entity else 'Frequency')
            if entity:
                twin=ax.twinx();twin.plot(dates,f,color='#7958a1',lw=.65,label='Frequency');twin.set_ylabel('Frequency (Hz)');twin.legend(loc='upper right',fontsize=7)
                if not np.isfinite(y).any():ax.text(.5,.5,'No OD data available',ha='center',transform=ax.transAxes,color='#64748B',bbox={'facecolor':'white','alpha':.85,'edgecolor':'none'})
            else:
                ax.fill_between(dates,y,50,where=np.isfinite(y)&(y<49.9),color='#d34d41',alpha=.3,label='<49.90 Hz')
                for level in (49.50,49.70,49.90):ax.axhline(level,color='#94a3b8',ls='--',lw=.6)
            for action in model['defence']['ufr']:
                if any(seconds(a)<=seconds(action['operation_time'])<seconds(b) for a,b in ranges):
                    ax.axvline(pd.Timestamp(action['operation_time']),color='#7c3aed',lw=1,label='UFR operation')
            labels=set()
            for row in chronology:
                label='Physical regulation' if row.get('record_kind')=='physical' else 'Violation message'
                ax.axvline(pd.Timestamp(row['timestamp']),color='#19856d' if label=='Physical regulation' else '#c77617',ls=':',lw=.8,label=label if label not in labels else None);labels.add(label)
        else:
            empty(ax)
            if entity is None:ax.set_ylim(49.4,50.2)
        ax.set_xlim(pd.Timestamp(ranges[0][0]),pd.Timestamp(ranges[-1][1]));ax.xaxis.set_major_formatter(mdates.DateFormatter('%d %b\n%H:%M'))
        ax.set_xlabel('Time (IST)');ax.set_ylabel('OD (MW)' if entity else 'Frequency (Hz)');ax.grid(alpha=.15)
        if len(x):ax.legend(loc='upper left',fontsize=7)
    return figure(title,draw)


def duration_curve(model):
    def draw(fig):
        ax=fig.subplots();x=model['duration']['frequency'];y=model['duration']['percent']
        if len(x):ax.step(x,y,where='post',color='#2878c8',lw=1.5,label='Covered time below frequency')
        else:empty(ax)
        ax.axvspan(49.9,50.05,color='#dbe8f4',label='IEGC normal band')
        for i,level in enumerate((49.50,49.70,49.90,50.,50.05)):
            ax.axvline(level,color='#94a3b8',ls='--',lw=.5)
            at=np.searchsorted(x,level,side='left')-1
            pct=float(y[at]) if at>=0 else 0 if len(x) else None
            ax.annotate(f'{level:.2f} Hz\n{value(pct)}%',(level,4+i*17),fontsize=7,ha='center')
        ax.set_xlim(min(49.4,float(x.min())) if len(x) else 49.4,max(50.2,float(x.max())) if len(x) else 50.2)
        ax.set_ylim(0,100);ax.set_xlabel('Frequency (Hz)');ax.set_ylabel('Covered monthly time below frequency (%)');ax.grid(alpha=.15);ax.legend(fontsize=7)
    return figure(f"Frequency duration curve | {model['month']}",draw)


def time_of_day_heatmap(model):
    from matplotlib.colors import ListedColormap, BoundaryNorm
    from matplotlib.patches import Patch
    def draw(fig):
        upper,ax=fig.subplots(2,1,gridspec_kw={'height_ratios':[1,5]})
        data=model['frequency_heatmap'];raw=np.asarray(data['values'])
        bands=np.where(raw<49.5,4,np.where(raw<49.7,3,np.where(raw<49.85,2,np.where(raw<49.9,1,0)))).astype(float)
        bands[~np.isfinite(raw)]=np.nan
        colors=['#eff3f7','#fff0a8','#f7b267','#e5704b','#a51c30'];cmap=ListedColormap(colors).with_extremes(bad='#d5d9de')
        ax.imshow(np.ma.masked_invalid(bands),aspect='auto',cmap=cmap,norm=BoundaryNorm(np.arange(-.5,5.5),5),extent=(0,24,len(raw),0),interpolation='nearest')
        ax.set_yticks(np.arange(len(raw))+.5,[d[-2:] for d in data['days']],fontsize=7)
        ax.set_xticks(range(0,25,2));ax.set_xlabel('Time of day (IST, hours)');ax.set_ylabel('Day of month')
        for row in model['defence']['ufr']:
            if row['date'] in data['days']:
                hour=(seconds(row['operation_time'])-seconds(row['date']+'T00:00:00'))/3600
                ax.scatter(hour,data['days'].index(row['date'])+.5,marker='*',s=35,color='#5b21b6')
        handles=[Patch(color=c,label=l) for c,l in zip(colors,['>=49.90','49.85–49.90','49.70–49.85','49.50–49.70','<49.50'])]
        handles.append(Patch(color='#d5d9de',label='No data'))
        from matplotlib.lines import Line2D
        handles.append(Line2D([],[],marker='*',ls='',color='#5b21b6',label='UFR'))
        ax.legend(handles=handles,loc='upper center',bbox_to_anchor=(.5,-.13),ncol=4,fontsize=7,title='Severity (Hz)')
        upper.bar(np.arange(24)+.5,data['occurrences'],width=.85,color='#203B63',label='Excursion starts <49.90 Hz')
        upper.set_xlim(0,24);upper.set_ylabel('Occurrences');upper.legend(fontsize=7)
    return figure(f"Time-of-day frequency severity and excursion occurrence | {model['month']}",draw,(9.6,6.8))


def state_comparison(model):
    def draw(fig):
        ax=fig.subplots();rows=model['comparisons'];names=[r['entity'] for r in rows]
        if rows:
            positions=np.arange(len(names))
            bars=ax.barh(positions,[r['at_minimum'] if r['at_minimum'] is not None else np.nan for r in rows],color='#e89527',label='OD at monthly lowest frequency')
            ax.scatter([r['maximum'] if r['maximum'] is not None else np.nan for r in rows],positions,color='#202734',marker='D',s=20,label='Maximum OD below 49.90 Hz')
            ax.set_yticks(positions,names);ax.set_ylim(-.6,len(names)-.4)
            ax.set_xlim(0,max([r[k] or 0 for r in rows for k in ('at_minimum','maximum')]+[1])*1.35)
            for bar,row in zip(bars,rows):
                ax.text(max(row['at_minimum'] or 0,row['maximum'] or 0),bar.get_y()+bar.get_height()/2,'  '+value(row['at_minimum'])+' / '+value(row['maximum']),fontsize=7,va='center')
            ax.invert_yaxis();ax.margins(x=.25);ax.legend(fontsize=7)
        else:empty(ax)
        ax.set_xlabel('Over-drawal (MW), labels: lowest-frequency instant / maximum');ax.set_ylabel('State');ax.grid(axis='x',alpha=.15)
    return figure(f"State over-drawal comparison | {model['month']}",draw,(9.6,max(3.5,len(model['comparisons'])*.32)))


def state_heatmap(model,metric):
    title='State maximum OD (MW)' if metric=='maximum' else 'State OD duration below 49.90 Hz (%)'
    def draw(fig):
        ax=fig.subplots();data=model['state_heatmaps'];names=data['entities']
        if names:
            values=np.asarray(data[metric],dtype=float);cmap=__import__('matplotlib').colormaps['YlOrRd'].with_extremes(bad='#d5d9de')
            picture=ax.imshow(np.ma.masked_invalid(values),aspect='auto',cmap=cmap,vmin=0,vmax=100 if metric=='duration' else None)
            ax.set_yticks(range(len(names)),names,fontsize=8);ax.set_xticks(range(len(data['days'])),[d[-2:] for d in data['days']],fontsize=7)
            for i in range(len(names)):
                for j in range(len(data['days'])):ax.text(j,i,value(values[i,j],0),ha='center',va='center',fontsize=5)
            fig.colorbar(picture,ax=ax,label='MW' if metric=='maximum' else '% of threshold minutes')
        else:empty(ax)
        ax.set_xlabel('Day of month');ax.set_ylabel('State')
    return figure(f"{title} | {model['month']} | selected reporting slots",draw)


def monthly_frequency_table(model):
    s=model['summary'];rows=[{'indicator':'Lowest frequency with date/time','value':value(s['minimum'],3)+' Hz | '+value(s['minimum_time'])+' IST'}]
    for level in reversed(LEVELS):
        v=s['thresholds'][level];rows.append({'indicator':f'Time below {level} Hz','value':f"{value(v['minutes'])} min | {value(v['percent'])}% | {value(v['days'],0)} affected days"})
    rows.extend([{'indicator':'Time within IEGC band 49.90–50.05 Hz','value':value(s['normal_percent'])+'%'},
                 {'indicator':'Time above 50.05 Hz','value':value(s['above_percent'])+'%'},
                 {'indicator':'Valid frequency coverage','value':f"{value(s['covered_minutes'])} / {value(s['calendar_minutes'])} calendar minutes"},
                 {'indicator':'UFR Stage-I operation dates/times','value':'; '.join(r['operation_time'] for r in model['defence']['ufr'] if str(r.get('stage','')).lower() in ('1','i','stage i','stage-i')) or '—'}])
    for level in ('49.90','49.50'):
        largest=model['largest'].get(level);rows.append({'indicator':f'Largest over-drawal below {level} Hz','value':f"{largest['entity']} | {value(largest['mw'])} MW" if largest else '—'})
    adms=adms_statistics(model['defence']['adms'])
    rows.append({'indicator':'ADMS conditions met / actual operations','value':f"{value(adms['due'],0)} / {value(adms['operated'],0)}" if model['defence']['adms'] else '—'})
    return table(f"Monthly frequency summary | {model['month']}",[('indicator','Indicator'),('value',model['month']+' | IST')],rows)


def executive_summary_table(model):
    rows=[{'indicator':c,'value':sum(r[c] for r in model['messages']) if model['messages'] and all(r[c] is not None for r in model['messages']) else None} for c in CATEGORIES]
    return table(f"Messages issued | {model['month']} | recipient/category counts",[('indicator','Violation category'),('value','Messages')],rows)


def validation_table(model):
    return table(f"Automatic validation | {model['month']}",[('check','Check'),('status','Result'),('details','Coverage / calculation detail')],model['validation'])


def daily_frequency_table(model):
    rows=[{'date':d['date'],'minimum':value(d['summary']['minimum'],3),'time':value(d['summary']['minimum_time']),**{level:f"{value(d['summary']['thresholds'][level]['minutes'])} min ({value(d['summary']['thresholds'][level]['percent'])}%)" if d['summary']['thresholds'][level]['minutes'] is not None else '—' for level in LEVELS}} for d in model['daily_frequency']]
    return table(f"Daily frequency statistics | {model['month']}",[('date','Date'),('minimum','Minimum Hz'),('time','At IST'),*[(l,'<'+l+' Hz min (%)') for l in LEVELS]],rows)


def performance_table(model,group,slot,daily=False):
    from services.frequency_monthly_report import performance_columns, performance_records
    groups=['ISGS','IPP'] if group=='Generators' else [group]
    source=model['event_rows'] if daily else model['slot_rows'][slot]
    rows=[r for r in source if r['group'] in groups and r['event']==slot and (group=='State' or any((v['adverse_minutes'] or 0)>0 for v in r['thresholds'].values()))]
    cols=performance_columns(False)
    if group=='Generators':
        cols[1]=('entity','Generator (Agency)')
        entities={e['entity_id']:e for e in model['entities']}
        rows=[{**r,'entity':r['entity']+'\nAgency: '+value(next((entities[r['entity_id']].get('point',{}).get(k) for k in ('agency_name','owner_name','company_name') if entities[r['entity_id']].get('point',{}).get(k)),None))} for r in rows]
    return table(f"{'Daily' if daily else 'Monthly'} {group} performance | Slot {slot} | {model['month']} | min, %, MW, Hz",cols,performance_records(rows,False),True)


def violation_message_table(model,group):
    groups=['State'] if group=='States' else ['ISGS','IPP']
    rows=[r for r in model['messages'] if r['group'] in groups]
    cols=[('entity','Entity'),('total','Total messages'),*[(c,('Deviation: ' if c in ('Warning','Deviation Emergency') else 'Frequency: ')+c.replace('Deviation ','')) for c in CATEGORIES]]
    return table(f"{group} violation messages | {model['month']} | selected slots",cols,rows,True)


def defence_table(model,kind):
    cols=[('date','Date'),('state','State'),('location','Location / Stage'),('operation_time','Operation time IST'),('restoration_time','Restoration time IST'),('quantum_mw','Quantum MW')]
    cols+= [('condition_met','Condition met'),('actually_operated','Actually operated / curtailed')] if kind=='adms' else [('frequency_hz','Frequency Hz')]
    cols.append(('remarks','Remarks'))
    rows=[{**r,'location':' / '.join(str(v) for v in (r.get('location'),r.get('stage')) if v) or None,
           **{k:'Yes' if r.get(k) is True else 'No' if r.get(k) is False else None for k in ('condition_met','actually_operated')}} for r in model['defence'][kind]]
    return table(f"{kind.upper()} operations | {model['month']}",cols,rows,True)


def chronology_table(model,window):
    rows=[]
    for row in model['chronology']:
        if not any(seconds(a)<=seconds(row['timestamp'])<seconds(b) for a,b in window['ranges']):continue
        action=row.get('action') or {}
        rows.append({**row,'date':row['timestamp'][:10],'time':row['timestamp'][11:],
                     'physical':'Yes' if row.get('record_kind')=='physical' else None,
                     'element':action.get('line_name'),'restoration':action.get('restoration_time') or action.get('restoration_date_time')})
    cols=[('date','Date'),('time','Time IST'),('frequency_hz','Hz'),('state','Entity'),('deviation_mw','OD/UI MW'),('message_type','Category'),('message_no','Reference'),('message_details','Message / remarks'),('physical','Physical action'),('element','Element / action details'),('restoration','Restoration IST')]
    return table(f"{window['date']} | Slot {window['event']} | {window['ranges'][0][0][11:]}–{window['ranges'][-1][1][11:]} IST",cols,rows,True)


def build_low_blocks(session,result,payload):
    model=monthly_model(session,result,payload);month=model['month'];notes=payload.report_text
    blocks=[('title','LOW FREQUENCY OPERATION REPORT'),('text',month+' | Indian Standard Time')]
    def heading(title):blocks.append(('heading',title))
    def text(content):
        if content:blocks.append(('text',content))
    heading('1  Executive Summary');text(notes.executive_summary)
    s=model['summary'];text(f"Lowest frequency: {value(s['minimum'],3)} Hz at {value(s['minimum_time'])} IST.")
    blocks.append(executive_summary_table(model))
    text('Major over-drawal: '+('; '.join(f"{r['entity']} {value(r['maximum'])} MW" for r in [r for r in model['comparisons'] if r['maximum'] is not None and r['maximum']>0][:3]) or '—'))
    text('ADMS operations: '+value(adms_statistics(model['defence']['adms'])['operated'],0)+' | UFR operations: '+(str(len(model['defence']['ufr'])) if model['defence']['ufr'] else '—'))
    blocks.append(frequency_plot(model,model['ranges'],f'Monthly frequency preview | {month}'));text(notes.general_notes)
    heading('2  Frequency Analysis');blocks.append(monthly_frequency_table(model))
    text('Frequency statistics use all available calendar-month readings. Percentages use covered valid minutes; missing calendar minutes are explicit below. Performance and message tables use selected reporting slots. Readings below 45 Hz are invalid.')
    blocks.append(validation_table(model))
    for warning in model['warnings']:text('Coverage note: '+warning)
    heading('3  Frequency Duration Curve');blocks.append(duration_curve(model))
    heading('4  Time-of-Day Frequency Heatmap');blocks.append(time_of_day_heatmap(model))
    heading('5  State Performance');text(notes.state_observations)
    blocks.append(state_comparison(model))
    for slot in model['slot_rows']:blocks.append(performance_table(model,'State',slot))
    heading('6  State Heatmaps');blocks.append(state_heatmap(model,'maximum'));blocks.append(state_heatmap(model,'duration'))
    heading('7  Generator Performance');text(notes.generator_observations)
    text('ISGS and IPP generators with observed under-injection only. State-sector generators and State IPPs are excluded. MW remains signed Actual minus Schedule; generator UI is negative.')
    for slot in model['slot_rows']:blocks.append(performance_table(model,'Generators',slot))
    heading('8  Action and Message Summary');text(notes.chronology_notes)
    blocks.append(violation_message_table(model,'States'));blocks.append(violation_message_table(model,'Generators'))
    text('Daily slot chronology and physical regulatory actions are in Annexure 4. Total messages equals the sum of the six recipient/category columns; a multi-category message contributes to each assigned category.')
    heading('9  Defence Mechanism');text(notes.adms_ufr_remarks)
    blocks.append(defence_table(model,'adms'))
    adms=adms_statistics(model['defence']['adms'])
    text(f"ADMS stages due: {value(adms['due'],0)} | Actual operations: {value(adms['operated'],0)} | Effectiveness: {value(adms['effectiveness'])}%")
    blocks.append(defence_table(model,'ufr'))
    heading('Annexure 1  Daily Frequency Plots')
    blocks.append(daily_frequency_table(model))
    for day in model['days']:blocks.append(frequency_plot(model,day['ranges'],day['date']+' | Daily frequency curve | 00:00–24:00 IST'))
    heading('Annexure 2  Daily State Performance')
    for slot in model['slot_rows']:
        block=performance_table(model,'State',slot,True)
        title,cols,rows,wide=block[1]
        blocks.append(table(f"Annexure 2.{1 if slot==1 else 2} | {title}",cols,rows,wide))
    heading('Annexure 2.3  State OD and Message Plots')
    for entity in model['entities']:
        if entity['group']=='State':
            for window in model['events']:
                rows=[r for r in model['chronology'] if r.get('entity_id')==entity['entity_id'] and any(seconds(a)<=seconds(r['timestamp'])<seconds(b) for a,b in window['ranges'])]
                blocks.append(frequency_plot(model,window['ranges'],f"{entity['display_name']} | {window['date']} | Slot {window['event']}",entity,rows))
    if not model['events'] or not any(e['group']=='State' for e in model['entities']):text('No data available')
    heading('Annexure 4  Event Chronology')
    if payload.include_chronology:
        for window in model['events']:blocks.append(chronology_table(model,window))
        if not model['events']:text('No data available')
    else:text('Chronology excluded by report selection.')
    heading('Calculation Notes');text(result['calculation_note'])
    return blocks
