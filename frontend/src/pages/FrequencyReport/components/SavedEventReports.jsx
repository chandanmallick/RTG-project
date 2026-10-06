import { useState } from "react";
import { Alert, Autocomplete, Button, Checkbox, Dialog, DialogContent, DialogTitle, FormControlLabel, IconButton, MenuItem, Paper, Stack, Tab, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tabs, TextField, Typography } from "@mui/material";
import { Download, X } from "lucide-react";
import API from "../../../services/api";
import ThresholdPerformanceTable from "./ThresholdPerformanceTable";

const GROUPS = ["State", "ISGS", "IPP"];
const value = number => number == null ? "—" : typeof number === "number" ? Number(number.toFixed(3)).toLocaleString("en-IN") : number;
const stamp = text => String(text || "").replace("T", " ");

export default function SavedEventReports({ availableEvents, busy, onOpenEvent, onViewHtml, saveBlob, onConsolidateAnalysis }) {
  const [selectedIds, setSelectedIds] = useState([]);
  const [analyses, setAnalyses] = useState([]);
  const [activeId, setActiveId] = useState("");
  const [group, setGroup] = useState("State");
  const [performanceDetail, setPerformanceDetail] = useState(false);
  const [performancePage, setPerformancePage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [consolidatedOpen, setConsolidatedOpen] = useState(false);
  const [sections, setSections] = useState({ include_threshold_performance: true, include_existing_sections: true, include_chronology: true, include_entity_performance: true, performance_groups: GROUPS });
  const selected = availableEvents.filter(event => selectedIds.includes(event.event_id));
  const active = analyses.find(event => event.event_id === activeId);
  const locked = busy || loading;

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await API.getSavedFrequencyAnalysis(selectedIds);
      if (!response.success) throw new Error(response.error || "Saved event analysis is unavailable.");
      setAnalyses(response.events);
      setActiveId(response.events[0]?.event_id || "");
    } catch (err) { setError(err?.response?.data?.detail || err.message); }
    finally { setLoading(false); }
  };

  const generate = async (format, consolidated = false, overrides = {}) => {
    setLoading(true);
    setError("");
    try {
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
  const performanceHeaders = ["Entity", "Period (IST)", "15-Min Average OD/UI", "% Time OD/UI", "Maximum OD/UI", "Lowest Frequency", "No. of Messages"];

  return <Paper elevation={0} sx={{ mb: 2, p: 2, border: "1px solid #BFE2D9", borderRadius: 3, background: "linear-gradient(180deg,#EDF8F4,#FFFFFF 130px)" }}>
    <Typography sx={{ fontSize: 19, fontWeight: 900, color: "#0F2F4F" }}>Saved frequency event reports</Typography>
    <Typography sx={{ color: "#64748B", fontSize: 12, mb: 1.5 }}>Select stored instances directly. Each event keeps its own report; consolidated reports contain chronology and entity performance only.</Typography>
    <Stack direction={{ xs: "column", md: "row" }} spacing={1} alignItems={{ md: "center" }}>
      <Autocomplete multiple options={availableEvents} value={selected} getOptionLabel={event => event.name || event.event_id} isOptionEqualToValue={(a, b) => a.event_id === b.event_id} onChange={(_, items) => { setSelectedIds(items.map(event => event.event_id)); setAnalyses([]); setActiveId(""); setError(""); }} disabled={locked} sx={{ flex: 1 }} renderInput={params => <TextField {...params} label="Stored event / instance" size="small" />} />
      <Button variant="contained" disabled={locked || !selectedIds.length} onClick={load}>{loading ? "Preparing…" : "Load saved analysis"}</Button>
      <Button variant="outlined" disabled={locked || selectedIds.length < 2} onClick={() => setConsolidatedOpen(true)}>Consolidated Report</Button>
    </Stack>
    {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
    {!!analyses.length && <>
      <Stack direction={{ xs: "column", md: "row" }} spacing={1} alignItems={{ md: "center" }} sx={{ mt: 2 }}>
        <TextField select label="Event report" value={activeId} onChange={event => setActiveId(event.target.value)} size="small" disabled={locked} sx={{ flex: 1 }}>{analyses.map(event => <MenuItem key={event.event_id} value={event.event_id}>{event.event_name}</MenuItem>)}</TextField>
        <Button size="small" variant="outlined" disabled={locked} onClick={async () => { setLoading(true); setError(""); try { await onOpenEvent(activeId); } catch (err) { setError(err?.response?.data?.detail || err.message); } finally { setLoading(false); } }}>Open existing report workspace</Button>
      </Stack>
      <Stack direction="row" flexWrap="wrap" useFlexGap spacing={1} sx={{ mt: 1 }}>
        {[["include_existing_sections", "Existing Report Sections"], ["include_chronology", "Chronology of Messages"], ["include_entity_performance", "Entity Performance"]].map(([key, label]) => <FormControlLabel key={key} control={<Checkbox checked={sections[key]} disabled={locked} onChange={event => setSections(current => ({ ...current, [key]: event.target.checked }))} size="small" />} label={<Typography sx={{ fontSize: 12 }}>{label}</Typography>} />)}
        {GROUPS.map(item => <FormControlLabel key={item} control={<Checkbox size="small" checked={sections.performance_groups.includes(item)} disabled={locked || !sections.include_entity_performance} onChange={() => toggleGroup(item)} />} label={<Typography sx={{ fontSize: 12 }}>{item}</Typography>} />)}
      </Stack>
      <Stack direction="row" spacing={1} sx={{ mb: 1 }}><Button size="small" disabled={locked} onClick={() => generate("docx")}>Generate Word</Button><Button size="small" disabled={locked} onClick={() => generate("pdf")}>Generate PDF</Button><Button size="small" disabled={locked} onClick={() => generate("html")}>View HTML</Button></Stack>
      {active && <>
        <Typography sx={{ color: "#475569", fontSize: 12 }}>{stamp(active.start_time)} to {stamp(active.end_time)} IST · Lowest Frequency: {value(active.lowest_frequency)} Hz</Typography>
        {active.warnings.map((warning, index) => <Alert key={index} severity="warning" sx={{ mt: 1 }}>{warning}</Alert>)}
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 2, mb: 1 }}><Typography sx={{ fontWeight: 850 }}>Chronology of Messages</Typography><Button size="small" startIcon={<Download size={15} />} disabled={locked} onClick={() => generate("xlsx", false, { include_existing_sections: false, include_chronology: true, include_entity_performance: false })}>Export Excel</Button></Stack>
        <TableContainer sx={{ maxHeight: 300 }}><Table size="small" stickyHeader><TableHead><TableRow>{chronologyHeaders.map(label => <TableCell key={label} sx={{ fontWeight: 850, bgcolor: "#F1F7F5" }}>{label}</TableCell>)}</TableRow></TableHead><TableBody>{active.chronology.map((row, index) => <TableRow key={`${row.entity_id}-${row.message_no}-${row.timestamp}-${index}`}><TableCell sx={{ whiteSpace: "nowrap" }}>{stamp(row.timestamp)}</TableCell><TableCell>{value(row.frequency_hz)}</TableCell><TableCell>{row.state}</TableCell><TableCell>{value(row.deviation_mw)}</TableCell><TableCell>{row.message_type}</TableCell><TableCell>{row.message_no}</TableCell><TableCell sx={{ minWidth: 200 }}>{row.message_details}</TableCell></TableRow>)}{!active.chronology.length && <TableRow><TableCell colSpan={7}>No message rows available for this period.</TableCell></TableRow>}</TableBody></Table></TableContainer>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 2 }}><Typography sx={{ fontWeight: 850 }}>Entity Performance</Typography><Button size="small" startIcon={<Download size={15} />} disabled={locked} onClick={() => generate("xlsx", false, { include_existing_sections: false, include_chronology: false, include_entity_performance: true, performance_groups: [group] })}>Export Excel</Button></Stack>
        <Tabs value={group} onChange={(_, next) => { setGroup(next); setPerformancePage(0); }}>{GROUPS.map(item => <Tab key={item} value={item} label={item} />)}</Tabs>
        <Typography sx={{ color: "#64748B", fontSize: 11, my: 1 }}>{active.calculation_note}</Typography>
        {active.threshold_analysis ? <><FormControlLabel control={<Checkbox size="small" checked={performanceDetail} onChange={event => { setPerformanceDetail(event.target.checked); setPerformancePage(0); }} />} label="15-minute blocks" /><ThresholdPerformanceTable rows={performanceDetail ? active.threshold_analysis.performance[group].slice(performancePage * 50, (performancePage + 1) * 50) : active.threshold_analysis.overall_performance[group]} />{performanceDetail && <Stack direction="row" spacing={1}><Button disabled={!performancePage} onClick={() => setPerformancePage(current => current - 1)}>Previous</Button><Typography sx={{ fontSize: 12, alignSelf: "center" }}>Page {performancePage + 1}</Typography><Button disabled={(performancePage + 1) * 50 >= active.threshold_analysis.performance[group].length} onClick={() => setPerformancePage(current => current + 1)}>Next</Button></Stack>}</> : <TableContainer sx={{ maxHeight: 400 }}><Table size="small" stickyHeader><TableHead><TableRow>{performanceHeaders.map(label => <TableCell key={label} sx={{ fontWeight: 850, bgcolor: "#F1F7F5" }}>{label}</TableCell>)}</TableRow></TableHead><TableBody>{active.performance[group].map((row, index) => <TableRow key={`${row.entity_id}-${row.period_start}-${index}`}><TableCell>{row.entity}</TableCell><TableCell sx={{ minWidth: 160 }}>{stamp(row.period_start)} – {stamp(row.period_end)}</TableCell>{[row.average_od_ui_mw, row.od_ui_time_pct, row.maximum_od_ui_mw, row.lowest_frequency, row.message_count].map((number, column) => <TableCell key={column}>{value(number)}</TableCell>)}</TableRow>)}{!active.performance[group].length && <TableRow><TableCell colSpan={7}>No {group} records available.</TableCell></TableRow>}</TableBody></Table></TableContainer>}
      </>}
    </>}
    <Dialog open={consolidatedOpen} onClose={() => !loading && setConsolidatedOpen(false)} maxWidth="sm" fullWidth><DialogTitle>Consolidated Frequency Event Analysis<IconButton onClick={() => setConsolidatedOpen(false)} disabled={loading} sx={{ float: "right" }}><X /></IconButton></DialogTitle><DialogContent>
      <Typography sx={{ fontSize: 12, color: "#64748B", mb: 1 }}>The selected instances remain identifiable in every section. Existing full event reports are excluded.</Typography>
      {selected.map(event => <Typography key={event.event_id} sx={{ fontSize: 12, mb: .5 }}>{event.name} · {stamp(event.start_time)} to {stamp(event.end_time)}</Typography>)}
      <Stack>{[["include_chronology", "Chronology of Messages"], ["include_entity_performance", "Entity Performance"]].map(([key, label]) => <FormControlLabel key={key} control={<Checkbox checked={sections[key]} disabled={locked} onChange={event => setSections(current => ({ ...current, [key]: event.target.checked }))} />} label={label} />)}</Stack>
      <Stack direction="row">{GROUPS.map(item => <FormControlLabel key={item} control={<Checkbox checked={sections.performance_groups.includes(item)} disabled={locked || !sections.include_entity_performance} onChange={() => toggleGroup(item)} />} label={item} />)}</Stack>
      {error && <Alert severity="error">{error}</Alert>}
      <Stack direction="row" spacing={1} sx={{ mt: 1 }}><Button disabled={locked} onClick={async () => { setLoading(true); setError(""); try { await onConsolidateAnalysis(selected.map(event => ({ event_id: event.event_id }))); setConsolidatedOpen(false); } catch (err) { setError(err?.response?.data?.detail || err.message); } finally { setLoading(false); } }}>Consolidated Analysis / HTML</Button><Button variant="contained" disabled={locked} onClick={() => generate("xlsx", true)}>Download Excel</Button><Button variant="outlined" disabled={locked} onClick={() => generate("docx", true)}>Download Word</Button></Stack>
    </DialogContent></Dialog>
  </Paper>;
}
