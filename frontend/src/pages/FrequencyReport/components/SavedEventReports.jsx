import { useEffect, useState } from "react";
import { Alert, Autocomplete, Button, Checkbox, Dialog, DialogContent, DialogTitle, FormControlLabel, IconButton, MenuItem, Paper, Stack, TextField, Typography } from "@mui/material";
import { X } from "lucide-react";
import API from "../../../services/api";
import SavedEventSectionEditor from "./SavedEventSectionEditor";

const GROUPS = ["State", "ISGS", "IPP"];
const stamp = text => String(text || "").replace("T", " ");

export default function SavedEventReports({ availableEvents, busy, onOpenEvent, onViewHtml, saveBlob, onConsolidateAnalysis, onOperationReport, onLoadGraphs, onRenderGraphs }) {
  const [eventType,setEventType]=useState('low');
  const [selectedIds, setSelectedIds] = useState([]);
  const [analyses, setAnalyses] = useState([]);
  const [activeId, setActiveId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [operationSections, setOperationSections] = useState(['summary', 'states', 'generators', 'actions', 'defence', 'annexure_states', 'annexure_generators']);
  const [operationNotes, setOperationNotes] = useState({});
  const [graphSources, setGraphSources] = useState({});
  const [reportSelections, setReportSelections] = useState({});
  const [graphsLoading, setGraphsLoading] = useState(false);
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
          executive_summary: operationNotes[id]?.summary ?? '', action_summary: operationNotes[id]?.actions ?? '', operation_section_notes: operationNotes[id] || {} });
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
          {['State', 'ISGS', 'IPP', 'State Gen', 'Other Generator'].filter(category => graphSource.rows.some(row => row.entity_id && row.type === category)).map(category => <Stack key={category} direction="row" flexWrap="wrap" alignItems="center">
            <Typography sx={{ fontSize: 12, fontWeight: 850, minWidth: 75 }}>{category}</Typography>
            {graphSource.rows.filter(row => row.entity_id && row.type === category).map(row => <FormControlLabel key={row.entity_id} control={<Checkbox size="small" disabled={locked} checked={reportSelection.entities.includes(row.entity_id)} onChange={() => setReportSelections(current => ({ ...current, [activeId]: { ...current[activeId], entities: current[activeId].entities.includes(row.entity_id) ? current[activeId].entities.filter(id => id !== row.entity_id) : [...current[activeId].entities, row.entity_id] } }))} />} label={<Typography sx={{ fontSize: 12 }}>{row.plant_name}</Typography>} />)}
          </Stack>)}
          <Stack direction="row" flexWrap="wrap">{graphKinds.map((kind, index) => <FormControlLabel key={kind} control={<Checkbox size="small" disabled={locked} checked={reportSelection.kinds.includes(kind)} onChange={() => setReportSelections(current => ({ ...current, [activeId]: { ...current[activeId], kinds: current[activeId].kinds.includes(kind) ? current[activeId].kinds.filter(item => item !== kind) : [...current[activeId].kinds, kind] } }))} />} label={['System frequency', 'Frequency vs deviation', 'State drawal vs schedule', 'Generator actual vs schedule / capacity', 'State generation comparison'][index]} />)}</Stack>
        </>}
        <Stack direction="row" flexWrap="wrap">
          {[["summary", "1 Executive Summary"], ["states", "2 State Performance"], ["generators", "3 Generator Performance"], ["actions", "4 Action & Chronology"], ["defence", "5 ADMS & UFR"], ["annexure_states", "Annexure 1 States"], ["annexure_generators", "Annexure 2 Generators"]].map(([key, label]) => <FormControlLabel key={key} control={<Checkbox size="small" checked={operationSections.includes(key)} disabled={locked} onChange={() => setOperationSections(current => current.includes(key) ? current.filter(item => item !== key) : [...current, key])} />} label={label} />)}
        </Stack>
        <SavedEventSectionEditor event={active} source={graphSource} selection={reportSelection} sections={operationSections} notes={operationNotes[activeId] || {}} defaultSummary={defaultSummary} locked={locked} onRenderGraphs={onRenderGraphs} onNoteChange={(key, text) => setOperationNotes(current => ({ ...current, [activeId]: { ...current[activeId], [key]: text } }))} />
        <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
          <Button disabled={locked || !operationSections.length} onClick={() => operationExport('html')}>Preview daily report</Button>
          <Button disabled={locked || !operationSections.length} onClick={() => operationExport('docx')}>Download daily Word</Button>
          <Button disabled={locked || !operationSections.length} onClick={() => operationExport('pdf')}>Download daily PDF</Button>
          {selectedIds.length > 1 && <Button disabled={locked || !operationSections.length} onClick={() => operationExport('docx', true)}>Word for each selected event</Button>}
          {selectedIds.length > 1 && <Button disabled={locked || !operationSections.length} onClick={() => operationExport('pdf', true)}>PDF for each selected event</Button>}
        </Stack>
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
