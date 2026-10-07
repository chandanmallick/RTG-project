import { useRef, useState } from "react";
import { Alert, Button, Checkbox, FormControlLabel, Chip, CircularProgress, IconButton, Paper, Stack, TextField, Typography } from "@mui/material";
import { Plus, Trash2 } from "lucide-react";
import CalendarInput from "../../../components/ui/CalendarInput";
import API from "../../../services/api";
import FrequencyAnalysisResults from "./FrequencyAnalysisResults";
import { createSelectionId } from "./frequencyIntervals";

export default function LongPeriodAnalysis({ saveBlob, onHtmlReport, automatic = false, onSourceReady }) {
  const [eventType, setEventType] = useState("low");
  const [fetchFrom, setFetchFrom] = useState(["wbes", "rtg", "mis", "crms"]);
  const [source, setSource] = useState(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [slots, setSlots] = useState([{ id: createSelectionId(), start: "17:00", end: "19:00" }]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const uploadRequest = useRef(0);
  const fetch = async () => {
    setBusy(true);setError("");setResult(null);setStatus("Fetching selected sources using maintained mappings…");
    try {
      const response = await API.fetchFrequencySources({ start_date:startDate,end_date:endDate,sources:fetchFrom,session_token:source?.session_token });
      const previous=source?.session_token;setSource(response);onSourceReady?.(response);
      if(previous) API.releaseFrequencyAnalysis(previous).catch(()=>{});
      setStatus("Source fetch complete. Unavailable mappings/readings remain blank.");
    } catch(err){setError(err?.response?.data?.detail||err.message);setStatus("");}
    finally{setBusy(false);}
  };
  const upload = async file => {
    if (!file) return;
    const sequence = ++uploadRequest.current;
    setBusy(true); setError(""); setStatus("Uploading and parsing the base workbook once…"); setResult(null);
    try {
      const response = await API.uploadFrequencyAnalysis(file);
      if (sequence !== uploadRequest.current) return;
      const previous = source?.session_token;
      setSource(response); onSourceReady?.(response); setStartDate(response.start_time.slice(0, 10));
      const end = new Date(`${response.end_time}+05:30`); end.setTime(end.getTime() - 1000);
      setEndDate(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(end));
      if (previous) API.releaseFrequencyAnalysis(previous).catch(() => {});
      setStatus("Workbook ready. Date/slot changes reuse this temporary session.");
    } catch (err) { setError(err?.response?.data?.detail || err.message); setStatus(""); }
    finally { if (sequence === uploadRequest.current) setBusy(false); }
  };
  const analyse = async () => {
    setBusy(true); setError(""); setStatus("Calculating selected slots and matching CRMS messages…");
    try {
      const response = await API.runFrequencyAnalysis({ session_token: source.session_token, start_date: startDate, end_date: endDate, event_type:eventType, slots: slots.map(({ start, end }) => ({ start, end })) });
      setResult(response); setStatus("Consolidated analysis ready.");
    } catch (err) { setError(err?.response?.data?.detail || err.message); }
    finally { setBusy(false); }
  };
  const updateSlot = (id, patch) => { setSlots(current => current.map(slot => slot.id === id ? { ...slot, ...patch } : slot)); setResult(null); };
  return <>
    <Paper elevation={0} sx={{ p: 2, border: "1px solid #BFE2D9", borderRadius: 3, background: "linear-gradient(180deg,#EDF8F4,#FFFFFF 160px)" }}>
      <Typography sx={{ fontSize: 20, fontWeight: 900, color: "#0F2F4F" }}>{automatic ? "Automatic event preparation / blanket upload" : "Long-period frequency analysis"}</Typography>
      <TextField select size="small" label="Frequency category" value={eventType} onChange={event=>{setEventType(event.target.value);setResult(null);}} slotProps={{select:{native:true}}} sx={{minWidth:180,my:1}}><option value="low">Low (&lt;49.90 Hz)</option><option value="high">High (&gt;50.05 Hz)</option></TextField>
      {automatic && <><Typography sx={{fontSize:12}}>WBES: State/ISGS/IPP schedules. RTG: State IPP/State-generator schedules. MIS: mapped actuals. CRMS: messages and physical regulation.</Typography><Stack direction="row" flexWrap="wrap" useFlexGap>{["wbes","rtg","mis","crms"].map(name=><FormControlLabel key={name} label={name.toUpperCase()} control={<Checkbox checked={fetchFrom.includes(name)} disabled={busy} onChange={()=>setFetchFrom(current=>current.includes(name)?current.filter(value=>value!==name):[...current,name])}/>}/>)}</Stack><Stack direction="row" spacing={1}><CalendarInput value={startDate} onChange={value=>{setStartDate(value);setSource(null);onSourceReady?.(null);setResult(null);}} placeholder="Fetch start date" disabled={busy}/><CalendarInput value={endDate} onChange={value=>{setEndDate(value);setSource(null);onSourceReady?.(null);setResult(null);}} placeholder="Fetch end date" disabled={busy}/><Button disabled={busy||!startDate||!endDate||!fetchFrom.length} variant="contained" onClick={fetch}>Fetch selected sources</Button></Stack></>}
      <Typography sx={{ fontSize: 12, color: "#64748B", mb: 2 }}>{automatic ? "Upload a blanket workbook or fetch mapped sources. Select daily event periods, or use the Curve selection below." : "Upload one workbook for the base period. Actual, schedule and frequency come from that workbook; messages come from CRMS. Choose any number of daily slots."}</Typography>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        <Button component="label" variant="outlined" disabled={busy}>{source ? "Replace base workbook" : "Upload base workbook"}<input hidden type="file" accept=".xlsx,.xlsm" disabled={busy} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; upload(file); }} /></Button>
        {source && <><Typography sx={{ fontSize: 12 }}>{source.filename}</Typography><Chip size="small" label={`${source.row_count.toLocaleString()} readings · ${source.sampling_seconds}s sampling`} /><Chip size="small" label={`${(source.file_bytes / 1048576).toFixed(2)} MB · temporary session`} /></>}
        {busy && <CircularProgress size={22} />}
      </Stack>
      {!!status && <Typography sx={{ fontSize: 12, color: "#03624C", mt: 1 }}>{status}</Typography>}
      {source?.source_status && <Typography sx={{fontSize:12,mt:1,color:"#64748B"}}>{source.source_status.filter(row=>row.available).length} source/entity/day fetches available; {source.source_status.filter(row=>!row.available).length} unavailable or unmapped. Existing uploaded/fetched readings are retained when a fetch has no valid replacement.</Typography>}
      {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
      {source && <>
        <Stack direction="row" spacing={1} sx={{ mt: 2 }}><CalendarInput value={startDate} onChange={value => { setStartDate(value); setResult(null); }} placeholder="Analysis start date" disabled={busy} /><CalendarInput value={endDate} onChange={value => { setEndDate(value); setResult(null); }} placeholder="Analysis end date" disabled={busy} /></Stack>
        <Typography sx={{ fontSize: 13, fontWeight: 800, mt: 2, mb: 1 }}>Daily slots (IST)</Typography>
        {slots.map((slot, index) => <Stack key={slot.id} direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}><Typography sx={{ fontSize: 12, minWidth: 50 }}>Slot {index + 1}</Typography><TextField label="Start" type="time" size="small" value={slot.start} disabled={busy} onChange={event => updateSlot(slot.id, { start: event.target.value })} slotProps={{ inputLabel: { shrink: true } }} /><TextField label="End (HH:mm)" size="small" value={slot.end} disabled={busy} onChange={event => updateSlot(slot.id, { end: event.target.value })} sx={{ width: 150 }} helperText="24:00 = midnight" /><IconButton aria-label={`Remove slot ${index + 1}`} disabled={busy} onClick={() => { setSlots(current => current.filter(item => item.id !== slot.id)); setResult(null); }}><Trash2 size={17} /></IconButton></Stack>)}
        <Stack direction="row" spacing={1}><Button size="small" startIcon={<Plus size={16} />} disabled={busy} onClick={() => { setSlots(current => [...current, { id: createSelectionId(), start: "", end: "" }]); setResult(null); }}>Add daily slot</Button><Button variant="contained" disabled={busy || !startDate || !endDate || !slots.length || slots.some(slot => !slot.start || !slot.end)} onClick={analyse}>Consolidated Analysis</Button></Stack>
        <Typography sx={{ mt: 1, fontSize: 11, color: "#64748B" }}>Overlapping slots count once. Sessions expire after one hour of inactivity and are lost if the backend restarts.</Typography>
      </>}
    </Paper>
    <FrequencyAnalysisResults result={result} saveBlob={saveBlob} onHtmlReport={onHtmlReport} />
  </>;
}

