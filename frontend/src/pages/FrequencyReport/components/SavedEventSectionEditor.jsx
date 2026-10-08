import { useEffect, useRef, useState } from 'react';
import { Alert, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from '@mui/material';
import ThresholdPerformanceTable, { frequencyValue, overdrawalValue } from './ThresholdPerformanceTable';

const stamp = value => String(value || '').replace('T', ' ');
const display = value => value == null ? 'Data not available' : value;
const header = { bgcolor: '#17365D', color: '#FFFFFF !important', '& *': { color: '#FFFFFF !important' }, fontWeight: 850 };

function DataTable({ headers, rows }) {
  return <TableContainer sx={{ maxHeight: 350, border: '1px solid #CBD5E1', my: 1 }}><Table size="small">
    <TableHead><TableRow>{headers.map(label => <TableCell key={label} sx={header}>{label}</TableCell>)}</TableRow></TableHead>
    <TableBody>{rows.map((row, index) => <TableRow key={index}>{row.map((value, column) => <TableCell key={column} sx={{ verticalAlign: 'top' }}>{display(value)}</TableCell>)}</TableRow>)}{!rows.length && <TableRow><TableCell colSpan={headers.length}>Data not available</TableCell></TableRow>}</TableBody>
  </Table></TableContainer>;
}

function EventGraphs({ source, entities, kinds, onRenderGraphs, title }) {
  const frame = useRef(null);
  const [error, setError] = useState('');
  const selectionKey = JSON.stringify([entities, kinds]);
  useEffect(() => {
    if (!source || !frame.current) return;
    setError('');
    // Let the iframe's initial about:blank navigation finish before writing it.
    const timer = setTimeout(() => {
      try { onRenderGraphs(frame.current, source, { entities, kinds }); }
      catch { setError('These event curves could not be displayed. Reload the saved analysis to retry.'); }
    }, 0);
    return () => clearTimeout(timer);
  }, [source, selectionKey]);
  if (!source) return <Typography sx={{ my: 1 }}>Loading event curves…</Typography>;
  if (!kinds.length) return <Typography sx={{ my: 1 }}>No curves selected for this section.</Typography>;
  return <>{error && <Alert severity="error">{error}</Alert>}<iframe ref={frame} title={title} style={{ width: '100%', height: title.startsWith('System') ? 580 : 750, border: '1px solid #CBD5E1', borderRadius: 6 }} /></>;
}

export default function SavedEventSectionEditor({ event, source, selection, sections, notes, defaultSummary, locked, onRenderGraphs, onNoteChange }) {
  const summary = event.threshold_analysis?.summary || {};
  const performance = event.threshold_analysis?.overall_performance || {};
  const entities = selection?.entities || [];
  const kinds = selection?.kinds || [];
  const selectedRows = group => (performance[group] || []).filter(row => !selection || entities.includes(row.entity_id));
  const messages = event.report_chronology || event.chronology || [];
  const defence = messages.filter(row => (Array.isArray(row.message_categories) ? row.message_categories : [row.message_type]).some(category => ['ADMS', 'UFR', 'ADMS/UFR'].includes(String(category).toUpperCase().replaceAll(' ', ''))));
  const messageCategories = ['Alert', 'Emergency', 'Extreme Emergency', 'Non-Compliance', 'Warning'];
  const counts = messageCategories.map(category => event.messages_complete ? new Set(messages.filter(row => row.record_kind !== 'physical' && (row.message_categories || [row.message_type]).includes(category)).map(row => JSON.stringify([row.timestamp, row.message_no, row.message_details]))).size : null);
  const editor = (key, label, initial = '') => <TextField fullWidth multiline minRows={3} label={label} value={notes[key] ?? initial} disabled={locked} onChange={change => onNoteChange(key, change.target.value)} sx={{ my: 2 }} />;
  const section = (key, title, content) => sections.includes(key) && <Paper key={key} variant="outlined" sx={{ p: 2, my: 2, borderColor: '#CBD5E1' }}><Typography component="h2" sx={{ fontSize: 18, color: '#17365D', fontWeight: 850, mb: 1 }}>{title}</Typography>{content}</Paper>;
  const stateEntities = (source?.rows || []).filter(row => row.is_state && entities.includes(row.entity_id)).map(row => row.entity_id);
  const generatorEntities = (source?.rows || []).filter(row => !row.is_state && entities.includes(row.entity_id)).map(row => row.entity_id);
  return <>
    <Typography component="h1" sx={{ color: '#17365D', fontSize: 21, fontWeight: 850, mt: 2 }}>{source?.context?.title || event.event_name}</Typography>
    <Typography sx={{ color: '#475569', my: 1 }}>{stamp(event.start_time)} to {stamp(event.end_time)} IST</Typography>
    {(event.warnings || []).map((warning, index) => <Alert severity="warning" key={index} sx={{ my: 1 }}>{warning}</Alert>)}
    {section('summary', '1 Executive Summary & General Notes', <>
      <DataTable headers={['Reporting Period (IST)', 'Duration below 49.9 Hz (Min)', 'Minimum Frequency (Hz)', 'Minimum Frequency at (IST)']} rows={[[`${stamp(event.start_time)} to ${stamp(event.end_time)}`, summary.thresholds?.['49.90']?.frequency_minutes, frequencyValue(summary.minimum_frequency), stamp(summary.minimum_timestamp)]]} />
      <DataTable headers={messageCategories} rows={[counts]} />
      {editor('summary', 'Executive summary and general notes', defaultSummary)}
      <EventGraphs source={source} entities={[]} kinds={kinds.filter(kind => kind === 'System Frequency')} onRenderGraphs={onRenderGraphs} title="System frequency for the selected event" />
    </>)}
    {section('states', '2 State Performance Details', <>
      <ThresholdPerformanceTable report summary={summary} rows={selectedRows('State')} />
      {editor('states', 'State performance observations')}
    </>)}
    {section('generators', '3 Central Sector Generator Performance', <>
      <ThresholdPerformanceTable report summary={summary} rows={['ISGS', 'IPP'].flatMap(group => selectedRows(group).filter(row => Object.values(row.thresholds || {}).some(metrics => metrics.adverse_minutes > 0)).map(row => ({ ...row, entity: `${row.entity} (${group})` })))} />
      {editor('generators', 'Generator performance observations')}
    </>)}
    {section('actions', '4 Action & Chronology of Events', <>
      <DataTable headers={['Time (IST)', 'Frequency (Hz)', 'State / Entity', 'OD/UI (MW)', 'Message Type / Action', 'Message No.', 'Details']} rows={messages.map(row => [stamp(row.timestamp), frequencyValue(row.frequency_hz), row.state, overdrawalValue(row.deviation_mw), row.message_type, row.message_no, row.message_details])} />
      {editor('actions', 'Action summary and chronology observations')}
    </>)}
    {section('defence', '5 Action of Defence Mechanism (ADMS & UFR)', <>
      <DataTable headers={['Time (IST)', 'Mechanism', 'Entity', 'CRMS Record']} rows={defence.map(row => [stamp(row.timestamp), (row.message_categories || [row.message_type]).join(' / '), row.state, row.message_details])} />
      {editor('defence', 'ADMS and UFR observations')}
    </>)}
    {section('annexure_states', 'Annexure 1 State-wise Low Frequency Analysis', <>
      {editor('annexure_states', 'State annexure notes')}
      <EventGraphs source={source} entities={stateEntities} kinds={kinds.filter(kind => ['Annexure - Deviation / Frequency', 'Annexure - State Schedule / Actual', 'Generation comparison'].includes(kind))} onRenderGraphs={onRenderGraphs} title="Selected state annexure curves and OD statistics" />
    </>)}
    {section('annexure_generators', 'Annexure 2 Generator-wise Low Frequency Analysis', <>
      {editor('annexure_generators', 'Generator annexure notes')}
      <EventGraphs source={source} entities={generatorEntities} kinds={kinds.filter(kind => ['Annexure - Deviation / Frequency', 'Annexure - Generator Schedule / Actual'].includes(kind))} onRenderGraphs={onRenderGraphs} title="Selected ISGS IPP and State Gen annexure curves and UI statistics" />
    </>)}
  </>;
}
