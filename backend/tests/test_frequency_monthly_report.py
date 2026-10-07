import asyncio
import io
import unittest
from unittest.mock import patch
from docx import Document
from test_frequency_threshold_analysis import fixture, USER, DB
from services import frequency_analysis_sessions as sessions
from services.frequency_monthly_report import build_blocks, performance_columns, performance_records
from services.frequency_monthly_data import monthly_model, frequency_statistics, message_summary, frequency_heatmap
from routes.frequency_analysis_routes import ResultPayload, export_result


class MonthlyReportTests(unittest.TestCase):
    def setUp(self):sessions._sessions.clear()

    def test_report_frequency_and_od_display_precision(self):
        row={'date':'2026-10-03','event':1,'selected_ranges':[('2026-10-03T17:00:00','2026-10-03T17:01:00')],
             'entity':'Bihar','lowest_frequency':49.876,'minimum_timestamp':'2026-10-03T17:00:00',
             'thresholds':{'49.90':{'frequency_minutes':1,'adverse_minutes':.5,'adverse_pct':50,
                                    'average_od_ui_mw':5.49,'maximum_od_ui_mw':12.51,'message_count':0}}}
        record=performance_records([row],False)[0]
        self.assertTrue(record['minimum'].startswith('49.876\n'))
        self.assertEqual(record['49.90_average'],'5')
        self.assertEqual(record['49.90_maximum'],'13')

    def result(self):
        token=sessions._put(USER,fixture(),{'filename':'Report test','crms_enabled':False})['session_token']
        return sessions.analyse(token,USER,[('2026-10-03T17:00:00','2026-10-03T17:01:00'),('2026-10-03T17:02:00','2026-10-03T17:03:00')],db=DB)

    def test_template_exports_text_scope_and_annexures(self):
        result=self.result()
        payload=ResultPayload(session_token=result['session_token'],result_token=result['result_token'],layout='monthly-template',include_chronology=False,report_text={'executive_summary':'Reviewed by operator <safe>','adms_ufr_remarks':'UFR remarks entered by operator'})
        session,stored=sessions.get_result(payload.session_token,payload.result_token,USER)
        blocks=build_blocks(session,stored,payload)
        self.assertFalse(any('Automatic validation' in str(b) for b in blocks if b[0]!='image'))
        self.assertTrue(any(b[0]=='image' and 'Slot 2' in b[1][0] for b in blocks))
        annexure=next(i for i,b in enumerate(blocks) if b==('heading','Annexure 1  Daily Frequency Plots'))
        self.assertFalse(any(b[0]=='table' and b[1][0].startswith('Daily') for b in blocks[:annexure]))
        self.assertEqual(sum(b[0]=='image' and 'Daily frequency curve' in b[1][0] for b in blocks),31)
        self.assertTrue(any(b[0]=='table' and b[1][0].startswith('Annexure 2.1') for b in blocks[annexure:]))
        self.assertTrue(any(b[0]=='table' and b[1][0].startswith('Annexure 2.1.2') for b in blocks[annexure:]))
        async def contents(response):
            return b''.join([chunk async for chunk in response.body_iterator])
        with patch('services.frequency_monthly_report.build_blocks',return_value=blocks):
            for fmt in ('docx','pdf'):
                payload.format=fmt;data=asyncio.run(contents(export_result(payload,USER)))
                if fmt=='docx':
                    document=Document(io.BytesIO(data));text='\n'.join(p.text for p in document.paragraphs)
                    self.assertIn('Reviewed by operator <safe>',text)
                    self.assertNotIn('UFR',text)
                    self.assertIn('Annexure 1',text);self.assertNotIn('6,791',text)
                    self.assertTrue(any(s.page_width>s.page_height for s in document.sections))
                    self.assertEqual(len(performance_columns(False)),15)
                    for table in document.tables:
                        header_width=sum(c.tcPr.tcW.w for c in table.rows[0]._tr.tc_lst)
                        body_width=sum(c.tcPr.tcW.w for c in table.rows[-1]._tr.tc_lst)
                        self.assertEqual(header_width,body_width)
                else:self.assertTrue(data.startswith(b'%PDF'))

    def test_owner_and_format_validation(self):
        result=self.result();payload=ResultPayload(session_token=result['session_token'],result_token=result['result_token'],layout='monthly-template',format='html')
        with self.assertRaises(ValueError):export_result(payload,USER)
        payload.format='pdf'
        with self.assertRaises(Exception) as caught:export_result(payload,{'employeeId':'other'})
        self.assertEqual(caught.exception.status_code,404)

    def test_exports_selected_month_without_source_coverage(self):
        result=self.result()
        payload=ResultPayload(session_token=result['session_token'],result_token=result['result_token'],
            layout='monthly-template',reporting_month='2026-09',include_chronology=True,
            include_entity_performance=True,performance_groups=['State','ISGS','IPP'])
        async def contents(response):
            return b''.join([chunk async for chunk in response.body_iterator])
        for fmt,signature in (('pdf',b'%PDF'),('docx',b'PK\x03\x04')):
            payload.format=fmt
            data=asyncio.run(contents(export_result(payload,USER)))
            self.assertTrue(data.startswith(signature))

    def test_month_selection_missing_days_and_independent_slots(self):
        result=self.result();payload=ResultPayload(session_token=result['session_token'],result_token=result['result_token'],reporting_month='2026-10')
        session,stored=sessions.get_result(payload.session_token,payload.result_token,USER)
        model=monthly_model(session,stored,payload)
        self.assertEqual(len(model['days']),31)
        self.assertEqual(model['summary']['covered_days'],1)
        self.assertNotEqual(model['slot_rows'][1][0]['thresholds'],model['slot_rows'][2][0]['thresholds'])
        self.assertEqual(model['slot_rows'][1][0]['selected_ranges'],[('2026-10-03T17:00:00','2026-10-03T17:01:00')])
        self.assertEqual(model['slot_rows'][2][0]['selected_ranges'],[('2026-10-03T17:02:00','2026-10-03T17:03:00')])
        payload.reporting_month='2028-02';empty=monthly_model(session,stored,payload)
        self.assertEqual(len(empty['days']),29)
        self.assertEqual(empty['summary']['covered_minutes'],0)
        self.assertIsNone(empty['summary']['minimum'])
        self.assertEqual(empty['slot_rows'],{})

    def test_invalid_reading_and_message_reconciliation(self):
        dataset=fixture();dataset['frequency']=dataset['frequency'].copy();dataset['frequency'][0]=40
        stats=frequency_statistics(dataset,[('2026-10-03T17:00:00','2026-10-03T17:03:00')])
        self.assertGreaterEqual(stats['minimum'],45)
        self.assertAlmostEqual(stats['normal_percent']+stats['above_percent']+stats['thresholds']['49.90']['percent'],100)
        entity=dataset['entities'][0]
        message={'entity_id':entity['entity_id'],'timestamp':'2026-10-03T17:00:00','message_no':'1','message_categories':['Alert','Warning']}
        rows,_=message_summary([entity],[message,message],True)
        self.assertEqual(rows[0]['total'],2)
        self.assertEqual(rows[0]['Alert'],1)
        self.assertEqual(rows[0]['Warning'],1)

    def test_heatmap_uses_daily_weighted_duration_not_maximum_event_percent(self):
        import numpy as np
        dataset=fixture();dataset['entities'][0]['deviation']=np.array([10,0,10,10,10],dtype=float)
        token=sessions._put(USER,dataset,{'filename':'weights','crms_enabled':False})['session_token']
        result=sessions.analyse(token,USER,[('2026-10-03T17:00:00','2026-10-03T17:01:00'),('2026-10-03T17:02:00','2026-10-03T17:03:00')],db=DB)
        payload=ResultPayload(session_token=token,result_token=result['result_token'])
        session,stored=sessions.get_result(token,result['result_token'],USER)
        model=monthly_model(session,stored,payload)
        self.assertAlmostEqual(model['state_heatmaps']['duration'][0][2],100*1/1.5,places=5)
        self.assertIsNone(model['state_heatmaps']['duration'][0][0])
        self.assertIsNone(model['state_heatmaps']['maximum'][1][2])

    def test_midnight_does_not_add_an_excursion(self):
        from services.frequency_threshold_analysis import timeline
        times,frequency,cadence=timeline(['2026-10-01T23:59:30','2026-10-02T00:00:00'],[49.8,49.8])
        dataset={'times':times,'frequency':frequency,'cadence':cadence}
        days=[{'date':'2026-10-01','ranges':[('2026-10-01T00:00:00','2026-10-02T00:00:00')]},
              {'date':'2026-10-02','ranges':[('2026-10-02T00:00:00','2026-10-03T00:00:00')]}]
        heat=frequency_heatmap(dataset,days)
        self.assertEqual(sum(heat['occurrences']),1)
        self.assertEqual(heat['occurrences'][23],1)

    def test_adms_operations_are_not_inferred_from_record_count(self):
        from services.frequency_monthly_data import adms_statistics
        records=[{'condition_met':True,'actually_operated':True},{'condition_met':True,'actually_operated':False}]
        self.assertEqual(adms_statistics(records),{'due':2,'operated':1,'effectiveness':50})
        self.assertIsNone(adms_statistics([{'condition_met':True}])['operated'])
        self.assertIsNone(adms_statistics([])['effectiveness'])


class MonthlyObservationTests(unittest.TestCase):
    def test_display_formats_do_not_modify_numeric_data(self):
        from services.frequency_report_formatting import monthly_display
        self.assertEqual(monthly_display('2026-09 | 2026-09-16T17:00:30 | 6681.00 min'), 'Sep-2026 | 16-Sep-26 17:00 | 6681 min')
        self.assertEqual(monthly_display(6681.25), 6681.25)
        row={'date':'2026-09','event':1,'selected_ranges':[], 'entity':'Bihar', 'lowest_frequency':49.876, 'minimum_timestamp':'2026-09-16T17:00:00',
             'thresholds':{'49.90':{'frequency_minutes':120,'adverse_minutes':30,'adverse_pct':25,'average_od_ui_mw':5.49,'maximum_od_ui_mw':12.51,'message_count':0}}}
        record=performance_records([row],False)[0]
        self.assertEqual(record['49.90_adverse'],'30 (25.00%)')
        self.assertEqual(row['thresholds']['49.90']['frequency_minutes'],120)
        self.assertIn('Sep-2026',record['period'])

    def test_only_selected_slots_and_no_regional_aggregate(self):
        original=fixture()
        import numpy as np
        original['entities'].append({**original['entities'][0], 'entity_id':'regional', 'display_name':'ER'})
        frequency=original['frequency'].copy()
        token=sessions._put(USER,original,{'filename':'Slots test','crms_enabled':False})['session_token']
        for count in (1,3):
            ranges=[(f'2026-10-03T17:0{i}:00', f'2026-10-03T17:0{i}:30') for i in range(count)]
            result=sessions.analyse(token,USER,ranges,db=DB)
            payload=ResultPayload(session_token=token,result_token=result['result_token'],reporting_month='2026-10')
            session,stored=sessions.get_result(token,result['result_token'],USER)
            model=monthly_model(session,stored,payload)
            self.assertEqual(len(model['slot_rows']),count)
            self.assertFalse(any(e['display_name']=='ER' for e in model['entities']))
            np.testing.assert_array_equal(original['frequency'],frequency)
