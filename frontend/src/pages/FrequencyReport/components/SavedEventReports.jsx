import { useEffect, useRef, useState } from "react";
import { Alert, Autocomplete, Button, Checkbox, Dialog, DialogContent, DialogTitle, FormControlLabel, IconButton, MenuItem, Paper, Stack, Tab, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tabs, TextField, Typography } from "@mui/material";
import { Download, X } from "lucide-react";
import API from "../../../services/api";
import ThresholdPerformanceTable, { frequencyValue, overdrawalValue } from "./ThresholdPerformanceTable";

const GROUPS = ["State", "ISGS", "IPP"];
const value = number => number == null ? "—" : typeof number === "number" ? Number(number.toFixed(3)).toLocaleString("en-IN") : number;
const stamp = text => String(text || "").replace("T", " ");

export default function SavedEventReports({ availableEvents, busy, onOpenEvent, onViewHtml, saveBlob, onConsolidateAnalysis, onOperationReport, onLoadGraphs, onRenderGraphs }) {
  const [eventType,setEventType]=useState('low');
  const [selectedIds, setSelectedIds] = useState([]);
  const [analyses, setAnalyses] = useState([]);
  const [activeId, setActiveId] = useState("");
  const [group, setGroup] = useState("State");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [operationSections, setOperationSections] = useState(['summary', 'states', 'generators', 'actions', 'defence', 'annexure_states', 'annexure_generators']);
  const [operationNotes, setOperationNotes] = useState({});
  const [graphSources, setGraphSources] = useState({});
  const [reportSelections, setReportSelections] = useState({});
  const [graphsLoading, setGraphsLoading] = useState(false);
  const previewFrame = useRef(null);
  const graphKinds = ['System Frequency', 'Annexure - Deviation / Frequency', 'Annexure - State Schedule / Actual', 'Annexure - Generator Schedule / Actual', 'Generation comparison'];
  const graphSource = graphSources[activeId];
  const reportSelection = reportSelections[activeId];
  useEffect(() => {
    if (!activeId || graphSources[activeId]) return;
    let cancelled = false; setGraphsLoading(true);
    onLoadGraphs(activeId).then(source => {
      if (cancelled) return;
      setGraphSources(current => ({ ...current, [activeId]: source }));
      setReportSelections(current => ({ ...current, [activeId]: current[activeId]?.revision === source.chart_revision ? current[activeId] : { revision: source.chart_revision, entities: source.rows.filter(row => row.entity_id).map(row => row.entity_id), kinds: graphKinds } }));
    }).catch(() => { if (!cancelled) setError('Event graphs could not be loaded. Please retry loading the saved analysis.'); })
      .finally(() => { if (!cancelled) setGraphsLoading(false); });
    return () => { cancelled = true; };
  }, [activeId, graphSources]);
  useEffect(() => {
    if (graphSource && reportSelection && previewFrame.current) onRenderGraphs(previewFrame.current, graphSource, reportSelection);
  }, [graphSource, reportSelection]);
  const [consolidatedOpen, setConsolidatedOpen] = useState(false);
  const [sections, setSections] = useState({ include_threshold_performance: true, include_existing_sections: true, include_chronology: true, include_entity_performance: true, performance_groups: GROUPS });
  const selected = availableEvents.filter(event => selectedIds.includes(event.event_id));
  const active = analyses.find(event => event.event_id === activeId);
  const locked = busy || loading || graphsLoading;
  const stats = active?.threshold_analysis?.summary;
  const defaultSummary = active ? `On ${active.start_time.slice(0, 10)}, a low-frequency event occurred from ${active.start_time.slice(11)} to ${active.end_time.slice(11)} IST. Frequency was below 49.9 Hz for ${stats?.thresholds?.['49.90']?.frequency_minutes ?? 'Data not available'} minutes. Minimum frequency was ${stats?.minimum_frequency ?? 'Data not available'} Hz at ${stats?.minimum_timestamp ?? 'Data not available'}.` : '';
  const operationExport = async (format, all = false) => {
    setLoading(true); setError('');
    try {
      for (const id of all ? selectedIds : [activeId]) {
        await onOperationReport({ event_ids: [id], format, operation_report: true, operation_sections: operationSections,
          operation_entity_ids: reportSelections[id]?.entities ?? null, operation_chart_kinds: reportSelections[id]?.kinds ?? null,
          executive_summary: operationNotes[id]?.summary ?? '', action_summary: operationNotes[id]?.actions ?? '' });
      }
    } catch (err) { setError('The operation report could not be generated. Please retry or check event data.'); }
    finally { setLoading(false); }
  };

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      if(eventType==='high'){await onConsolidateAnalysis(selected.map(event=>({event_id:event.event_id})),eventType);return;}
      const response = await API.getSavedFrequencyAnalysis(selectedIds);
      if (!response.success) throw new Error(response.error || "Saved event analysis is unavailable.");
      setAnalyses(response.events);
      setActiveId(response.events[0]?.event_id || "");
      setGraphSources({});
    } catch (err) { setError(err?.response?.data?.detail || err.message); }
    finally { setLoading(false); }
  };

  const generate = async (format, consolidated = false, overrides = {}) => {
    if (eventType === 'low' && !consolidated && ['html', 'docx', 'pdf'].includes(format)) return operationExport(format);
    setLoading(true);
    setError("");
    try {
      if(eventType==='high'){
        const result=await onConsolidateAnalysis(selected.map(event=>({event_id:event.event_id})),eventType);
        if(format==='html')return;
        const response=await API.exportFrequencyAnalysis({session_token:result.session_token,result_token:result.result_token,format,layout:'compact',include_chronology:sections.include_chronology,include_entity_performance:sections.include_entity_performance,performance_groups:sections.performance_groups});
        await saveBlob(response,`High_Frequency_Analysis.${format}`);return;
      }
      const options = { ...sections, ...overrides, event_ids: consolidated ? selectedIds : [activeId], consolidated, format };
      if (consolidated) options.include_existing_sections = false;
      if (format === "html") {
        await onViewHtml(activeId, options);
      } else {
        const blob = await API.exportSavedFrequencyReport(options);
        const name = consolidated ? "Consolidated Frequency Event Analysis" : active?.event_name || "Frequency Event Analysis";
        await saveBlob(blob, `${name.replace(/[<>:"/\\|?*]/g, "_")}.${format}`);
      }
    } catch (err) {
      let detail = err?.response?.data?.detail || err.message;
      if (err?.response?.data instanceof Blob) {
        try { detail = JSON.parse(await err.response.data.text()).detail || detail; } catch { /* Keep the original error. */ }
      }
      setError(detail);
    } finally { setLoading(false); }
  };

  const toggleGroup = next => setSections(current => ({ ...current, performance_groups: current.performance_groups.includes(next) ? current.performance_groups.filter(item => item !== next) : [...current.performance_groups, next] }));
  const chronologyHeaders = ["Time (IST)", "Frequency", "State / Entity", "OD/UI (MW)", "Message Type", "Message No.", "Message / Details"];

  return <Paper elevation={0} sx={{ mb: 2, p: 2, border: "1px solid #BFE2D9", borderRadius: 3, background: "linear-gradient(180deg,#EDF8F4,#FFFFFF 130px)" }}>
    <Typography sx={{ fontSize: 19, fontWeight: 900, color: "#0F2F4F" }}>Saved frequency event reports</Typography>
    <Typography sx={{ color: "#64748B", fontSize: 12, mb: 1.5 }}>Select stored instances directly. Each event keeps its own report; consolidated reports contain chronology and entity performance only.</Typography>
    <Stack direction={{ xs: "column", md: "row" }} spacing={1} alignItems={{ md: "center" }}>
      <TextField select size="small" label="Frequency category" value={eventType} disabled={locked} onChange={event=>{setEventType(event.target.value);setSelectedIds([]);setAnalyses([]);setActiveId('');}}><MenuItem value="low">Low frequency</MenuItem><MenuItem value="high">High frequency</MenuItem></TextField>
      <Autocomplete multiple options={availableEvents.filter(event=>(event.event_type || (/^high/i.test(event.name || "") ? "high" : "low"))===eventType)} value={selected} getOptionLabel={event => event.name || event.event_id} isOptionEqualToValue={(a, b) => a.event_id === b.event_id} onChange={(_, items) => { setSelectedIds(items.map(event => event.event_id)); setAnalyses([]); setActiveId(""); setError(""); }} disabled={locked} sx={{ flex: 1 }} renderInput={params => <TextField {...params} label="Stored event / instance" size="small" />} />
      <Button variant="contained" disabled={locked || !selectedIds.length} onClick={load}>{loading ? "Preparing…" : "Load saved analysis"}</Button>
      <Button variant="outlined" disabled={locked || selectedIds.length < 2} onClick={() => setConsolidatedOpen(true)}>Consolidated Report</Button>
    </Stack>
    {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
    {!!analyses.length && <>
      <Stack direction={{ xs: "column", md: "row" }} spacing={1} alignItems={{ md: "center" }} sx={{ mt: 2 }}>
        <TextField select label="Event report" value={activeId} onChange={event => setActiveId(event.target.value)} size="small" disabled={locked} sx={{ flex: 1 }}>{analyses.map(event => <MenuItem key={event.event_id} value={event.event_id}>{event.event_name}</MenuItem>)}</TextField>
        <Button size="small" variant="outlined" disabled={locked} onClick={async () => { setLoading(true); setError(""); try { await onOpenEvent(activeId); } catch (err) { setError(err?.response?.data?.detail || err.message); } finally { setLoading(false); } }}>Open existing report workspace</Button>
      </Stack>
      {active && <>
        <Typography sx={{ fontWeight: 850, color: '#17365D', mt: 2 }}>Daily event report — entire selected period</Typography>
        <Typography sx={{ fontSize: 12, color: '#475569', mt: 1 }}>Select the entities and curves to include in the report. The preview uses the existing HTML analysis curves.</Typography>
        {graphsLoading && <Typography sx={{ my: 1 }}>Loading event graphs…</Typography>}
        {graphSource && reportSelection && <>
          <Stack direction="row" flexWrap="wrap">
            <Button size="small" disabled={locked} onClick={() => setReportSelections(current => ({ ...current, [activeId]: { ...current[activeId], entities: graphSource.rows.filter(row => row.entity_id).map(row => row.entity_id) } }))}>Select all entities</Button>
            <Button size="small" disabled={locked} onClick={() => setReportSelections(current => ({ ...current, [activeId]: { ...current[activeId], entities: [] } }))}>Clear entities</Button>
          </Stack>
          {['State', 'ISGS', 'IPP', 'State Gen', 'Other Generator'].map(category => <Stack key={category} direction="row" flexWrap="wrap" alignItems="center">
            <Typography sx={{ fontSize: 12, fontWeight: 850, minWidth: 75 }}>{category}</Typography>
            {graphSource.rows.filter(row => row.entity_id && row.type === category).map(row => <FormControlLabel key={row.entity_id} control={<Checkbox size="small" disabled={locked} checked={reportSelection.entities.includes(row.entity_id)} onChange={() => setReportSelections(current => ({ ...current, [activeId]: { ...current[activeId], entities: current[activeId].entities.includes(row.entity_id) ? current[activeId].entities.filter(id => id !== row.entity_id) : [...current[activeId].entities, row.entity_id] } }))} />} label={<Typography sx={{ fontSize: 12 }}>{row.plant_name}</Typography>} />)}
          </Stack>)}
          <Stack direction="row" flexWrap="wrap">{graphKinds.map((kind, index) => <FormControlLabel key={kind} control={<Checkbox size="small" disabled={locked} checked={reportSelection.kinds.includes(kind)} onChange={() => setReportSelections(current => ({ ...current, [activeId]: { ...current[activeId], kinds: current[activeId].kinds.includes(kind) ? current[activeId].kinds.filter(item => item !== kind) : [...current[activeId].kinds, kind] } }))} />} label={['System frequency', 'Frequency vs deviation', 'State drawal vs schedule', 'Generator actual vs schedule / capacity', 'State generation comparison'][index]} />)}</Stack>
          <iframe ref={previewFrame} title="Saved event interactive frequency analysis" style={{ width: '100%', height: 750, border: '1px solid #CBD5E1', borderRadius: 6 }} />
        </>}
        <Stack direction="row" flexWrap="wrap">
          {[["summary", "1 Executive Summary"], ["states", "2 State Performance"], ["generators", "3 Generator Performance"], ["actions", "4 Action & Chronology"], ["defence", "5 ADMS & UFR"], ["annexure_states", "Annexure 1 States"], ["annexure_generators", "Annexure 2 Generators"]].map(([key, label]) => <FormControlLabel key={key} control={<Checkbox size="small" checked={operationSections.includes(key)} disabled={locked} onChange={() => setOperationSections(current => current.includes(key) ? current.filter(item => item !== key) : [...current, key])} />} label={label} />)}
        </Stack>
        <TextField fullWidth multiline minRows={3} label="Executive summary and general notes" value={operationNotes[activeId]?.summary ?? defaultSummary} disabled={locked} onChange={event => setOperationNotes(current => ({ ...current, [activeId]: { ...current[activeId], summary: event.target.value } }))} sx={{ my: 1 }} />
        <TextField fullWidth multiline minRows={2} label="Action summary" value={operationNotes[activeId]?.actions ?? ''} disabled={locked} onChange={event => setOperationNotes(current => ({ ...current, [activeId]: { ...current[activeId], actions: event.target.value } }))} sx={{ my: 1 }} />
        <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
          <Button disabled={locked || !operationSections.length} onClick={() => operationExport('html')}>Preview daily report</Button>
          <Button disabled={locked || !operationSections.length} onClick={() => operationExport('docx')}>Download daily Word</Button>
          <Button disabled={locked || !operationSections.length} onClick={() => operationExport('pdf')}>Download daily PDF</Button>
          {selectedIds.length > 1 && <Button disabled={locked || !operationSections.length} onClick={() => operationExport('docx', true)}>Word for each selected event</Button>}
          {selectedIds.length > 1 && <Button disabled={locked || !operationSections.length} onClick={() => operationExport('pdf', true)}>PDF for each selected event</Button>}
        </Stack>
        <Typography sx={{ color: "#475569", fontSize: 12 }}>{stamp(active.start_time)} to {stamp(active.end_time)} IST · Lowest Frequency: {frequencyValue(active.lowest_frequency)} Hz</Typography>
        {active.warnings.map((warning, index) => <Alert key={index} severity="warning" sx={{ mt: 1 }}>{warning}</Alert>)}
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 2, mb: 1 }}><Typography sx={{ fontWeight: 850 }}>Chronology of Messages</Typography><Button size="small" startIcon={<Download size={15} />} disabled={locked} onClick={() => generate("xlsx", false, { include_existing_sections: false, include_chronology: true, include_entity_performance: false })}>Export Excel</Button></Stack>
        <TableContainer sx={{ maxHeight: 300 }}><Table size="small" stickyHeader><TableHead><TableRow>{chronologyHeaders.map(label => <TableCell key={label} sx={{ fontWeight: 850, bgcolor: "#F1F7F5" }}>{label}</TableCell>)}</TableRow></TableHead><TableBody>{active.chronology.map((row, index) => <TableRow key={`${row.entity_id}-${row.message_no}-${row.timestamp}-${index}`}><TableCell sx={{ whiteSpace: "nowrap" }}>{stamp(row.timestamp)}</TableCell><TableCell>{frequencyValue(row.frequency_hz)}</TableCell><TableCell>{row.state}</TableCell><TableCell>{overdrawalValue(row.deviation_mw)}</TableCell><TableCell>{row.message_type}</TableCell><TableCell>{row.message_no}</TableCell><TableCell sx={{ minWidth: 200 }}>{row.message_details}</TableCell></TableRow>)}{!active.chronology.length && <TableRow><TableCell colSpan={7}>No message rows available for this period.</TableCell></TableRow>}</TableBody></Table></TableContainer>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 2 }}><Typography sx={{ fontWeight: 850 }}>Entity Performance</Typography><Button size="small" startIcon={<Download size={15} />} disabled={locked} onClick={() => generate("xlsx", false, { include_existing_sections: false, include_chronology: false, include_entity_performance: true, performance_groups: [group] })}>Export Excel</Button></Stack>
        <Tabs value={group} onChange={(_, next) => { setGroup(next);  }}>{GROUPS.map(item => <Tab key={item} value={item} label={item} />)}</Tabs>
        <Typography sx={{ color: "#64748B", fontSize: 11, my: 1 }}>{active.calculation_note}</Typography>
        {active.threshold_analysis ? <ThresholdPerformanceTable report summary={active.threshold_analysis.summary} rows={active.threshold_analysis.overall_performance[group].filter(row => !reportSelection || reportSelection.entities.includes(row.entity_id))} /> : <Typography>Performance data not available.</Typography>}
      </>}
    </>}
    <Dialog open={consolidatedOpen} onClose={() => !loading && setConsolidatedOpen(false)} maxWidth="sm" fullWidth><DialogTitle>Consolidated Frequency Event Analysis<IconButton onClick={() => setConsolidatedOpen(false)} disabled={loading} sx={{ float: "right" }}><X /></IconButton></DialogTitle><DialogContent>
      <Typography sx={{ fontSize: 12, color: "#64748B", mb: 1 }}>The selected instances remain identifiable in every section. Existing full event reports are excluded.</Typography>
      {selected.map(event => <Typography key={event.event_id} sx={{ fontSize: 12, mb: .5 }}>{event.name} · {stamp(event.start_time)} to {stamp(event.end_time)}</Typography>)}
      <Stack>{[["include_chronology", "Chronology of Messages"], ["include_entity_performance", "Entity Performance"]].map(([key, label]) => <FormControlLabel key={key} control={<Checkbox checked={sections[key]} disabled={locked} onChange={event => setSections(current => ({ ...current, [key]: event.target.checked }))} />} label={label} />)}</Stack>
      <Stack direction="row">{GROUPS.map(item => <FormControlLabel key={item} control={<Checkbox checked={sections.performance_groups.includes(item)} disabled={locked || !sections.include_entity_performance} onChange={() => toggleGroup(item)} />} label={item} />)}</Stack>
      {error && <Alert severity="error">{error}</Alert>}
      <Stack direction="row" spacing={1} sx={{ mt: 1 }}><Button disabled={locked} onClick={async () => { setLoading(true); setError(""); try { await onConsolidateAnalysis(selected.map(event => ({ event_id: event.event_id })),eventType); setConsolidatedOpen(false); } catch (err) { setError(err?.response?.data?.detail || err.message); } finally { setLoading(false); } }}>Consolidated Analysis / HTML</Button><Button variant="contained" disabled={locked} onClick={() => generate("xlsx", true)}>Download Excel</Button><Button variant="outlined" disabled={locked} onClick={() => generate("docx", true)}>Download Word</Button></Stack>
    </DialogContent></Dialog>
  </Paper>;
}
