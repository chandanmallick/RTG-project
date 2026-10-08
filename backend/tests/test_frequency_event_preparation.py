import unittest
from types import SimpleNamespace
from unittest.mock import patch
from test_frequency_threshold_analysis import fixture,DB,USER
from services import frequency_analysis_sessions as sessions
from services.frequency_event_preparation import save_periods
from services.frequency_threshold_analysis import dataset_from_event
from services import curve_frequency_service as curve


class Collection:
    def __init__(self):self.records=[];self.writes=0
    def find_one(self,query,*args):return next((r for r in self.records if all(r.get(k)==v for k,v in query.items())),None)
    def update_one(self,query,update,upsert=False):
        record=self.find_one(query)
        if record is None:record={**query,**update.get('$setOnInsert',{})};self.records.append(record)
        record.update(update['$set']);self.writes+=1


class PreparationTests(unittest.TestCase):
    def setUp(self):
        sessions._sessions.clear();self.collection=Collection()
        self.db=SimpleNamespace(db={'frequency_events':self.collection},map_collection=DB.map_collection)
        self.token=sessions._put(USER,fixture(),{'filename':'Blanket','crms_enabled':False})['session_token']
    def period(self,id='one',start='17:00:30',end='17:01:30'):
        return {'id':id,'session_token':self.token,'start_time':'2026-10-03T'+start,'end_time':'2026-10-03T'+end,'event_type':'low'}
    def test_multi_event_round_trip_precise_bounds_and_retry_identity(self):
        periods=[self.period(),self.period('two','17:02:00','17:03:00')]
        response=save_periods(periods,USER,self.db);self.assertTrue(response['success'])
        self.assertEqual(len(self.collection.records),2)
        first=self.collection.records[0];self.assertTrue(first['start_time'].endswith('17:00:30'))
        self.assertEqual(first['duration_minutes'],1)
        restored=dataset_from_event(self.db,first)
        self.assertEqual(restored['entities'][0]['deviation'].tolist(),[-5.,20.])
        self.assertTrue(first['data_points'][0]['series']['actual']==[None,None])
        again=save_periods(periods,USER,self.db)
        self.assertEqual([p['event_id'] for p in response['periods']],[p['event_id'] for p in again['periods']])
        self.assertEqual(len(self.collection.records),2)
    def test_refetched_session_updates_existing_period_without_duplicate(self):
        first=save_periods([self.period()],USER,self.db)
        session=sessions.get_session(self.token,USER)
        session['dataset']['entities'][0]['deviation'][1]=99
        again=save_periods([self.period()],USER,self.db)
        self.assertEqual(first['periods'][0]['event_id'],again['periods'][0]['event_id'])
        self.assertEqual(len(self.collection.records),1)
        self.assertEqual(self.collection.records[0]['data_points'][0]['series']['deviation'][0],99)

    def test_foreign_session_fails_before_any_write(self):
        foreign=sessions._put({'employeeId':'someone'},fixture(),{})['session_token']
        bad={**self.period('two'),'session_token':foreign}
        with self.assertRaises(Exception) as caught:save_periods([self.period(),bad],USER,self.db)
        self.assertEqual(caught.exception.status_code,404);self.assertEqual(self.collection.writes,0)
    def test_single_sample_period_can_be_reopened_without_counting_end_marker(self):
        response=save_periods([self.period(start='17:00:00',end='17:00:30')],USER,self.db)
        self.assertTrue(response['success'])
        restored=dataset_from_event(self.db,self.collection.records[0])
        self.assertEqual(restored['cadence'],30)
        self.assertEqual(restored['frequency'][0],49.8)
    def test_existing_reuse_does_not_overwrite_and_failed_period_is_reported(self):
        response=save_periods([self.period()],USER,self.db);writes=self.collection.writes
        existing={**self.period(),'session_token':None,'event_id':response['periods'][0]['event_id']}
        self.assertTrue(save_periods([existing],USER,self.db)['success']);self.assertEqual(self.collection.writes,writes)
        failed=save_periods([self.period('outside','19:00:00','19:02:00')],USER,self.db)
        self.assertFalse(failed['success']);self.assertIn('error',failed['periods'][0])
    def test_curve_overview_and_fetch_reuse_reader_until_explicit_refresh(self):
        curve._series_cache.clear()
        with patch('routes.psp_routes.get_psp_config_with_curve_defaults',return_value={'curve_file_dir':'test'}),patch('routes.psp_routes.read_curve_file_series',return_value=({'frequency':[{'timestamp':'2026-10-03T00:00:00','frequency':49.8}]},{'available':True})) as reader:
            curve.load_curve_frequency_range('2026-10-03','2026-10-03');curve.load_curve_frequency_range('2026-10-03','2026-10-03');reader.assert_called_once()
            curve.load_curve_frequency_range('2026-10-03','2026-10-03',refresh=True);self.assertEqual(reader.call_count,2)
        curve._series_cache.clear()
