import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactECharts from "echarts-for-react";
import { Alert, Box, Button, Chip, CircularProgress, Dialog, DialogContent, DialogTitle, IconButton, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from "@mui/material";
import { Expand, MousePointer2, Plus, Trash2, X } from "lucide-react";
import CalendarInput from "../../../components/ui/CalendarInput";
import GradientButton from "../../../components/ui/GradientButton";
import API from "../../../services/api";
import { HIGH_HZ, LOW_HZ, createSelectionId, validCurveFrequency, istMillis, nearestPoint, summarizeInterval } from "./frequencyIntervals";

const istToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const displayTime = (stamp) => stamp.replace("T", " ");
const axisTime = (millis) => new Date(millis).toLocaleString("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const duration = (seconds) => `${Math.floor(seconds / 60)}m ${seconds % 60}s`;

export default function FrequencyPreAnalysis({ busy, onAnalyze, onViewResult, onConsolidate, automaticSource }) {
  const [frequencyKind,setFrequencyKind]=useState('low');
  const [startDate, setStartDate] = useState(istToday);
  const [endDate, setEndDate] = useState(istToday);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [events, setEvents] = useState([]);
  const [candidate, setCandidate] = useState({ start_time: "", end_time: "" });
  const [editingId, setEditingId] = useState(null);
  const [finalized, setFinalized] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [runningId, setRunningId] = useState(null);
  const cache = useRef(new Map());
  const request = useRef(null);
  const chartRef = useRef(null);
  const expandedChartRef = useRef(null);
  const drag = useRef(null);
  const interaction = useRef(null);
  const points = data?.points || [];
  const locked = busy || runningId !== null;
  const visibleEvents=events.filter(event=>event.event_type===frequencyKind);

  const load = useCallback(async (from, to, refresh = false) => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError("");
    setData(null);
    setEvents([]);
    setFinalized(false);
    setCandidate({ start_time: "", end_time: "" });
    setEditingId(null);
    drag.current?.cancel();
    try {
      if (!from || !to || to < from) throw new Error("Select a valid date range.");
      const key = `${from}:${to}`;
      const response = (!refresh && cache.current.get(key)) || await API.getCurveFrequencySeries(from, to, controller.signal);
      if (controller.signal.aborted) return;
      if (!response.success) throw new Error(response.diagnostics?.map(item => `${item.date}: ${item.message}`).join("; ") || "Curve frequency is unavailable.");
      if (cache.current.size >= 5) cache.current.delete(cache.current.keys().next().value);
      cache.current.set(key, response);
      setData(response);
    } catch (err) {
      if (!controller.signal.aborted) setError(err?.response?.data?.detail || err.message || "Unable to load Curve frequency.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const day = istToday();
    load(day, day);
    return () => request.current?.abort();
  }, [load]);

  const periodsKey = JSON.stringify(events.map(({ id, start_time, end_time }) => ({ id, start_time, end_time })));
  useEffect(() => {
    const periods = JSON.parse(periodsKey);
    if (!periods.length) return;
    const controller = new AbortController();
    setEvents(current => current.map(event => ({ ...event, db_status: "checking", stored_event_id: null, stored_event_name: null })));
    const timer = setTimeout(async () => {
      try {
        const response = await API.checkFrequencyPeriods(periods, controller.signal);
        if (!response.success) throw new Error(response.error || "Unable to verify saved data.");
        if (!controller.signal.aborted) setEvents(current => current.map(event => {
          const match = response.periods.find(item => item.id === event.id);
          return match ? { ...event, db_status: match.status, db_match: match, stored_event_id: match.event_id, stored_event_name: match.event_name } : { ...event, db_status: "error" };
        }));
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err?.response?.data?.detail || err.message);
          setEvents(current => current.map(event => ({ ...event, db_status: "error" })));
        }
      }
    }, 150);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [periodsKey]);

  useEffect(() => () => drag.current?.cancel(), []);

  const changeDates = (from, to) => {
    setStartDate(from);
    setEndDate(to);
    if (from) load(from, to || from);
    else {
      request.current?.abort();
      setLoading(false);
      setData(null);
      setEvents([]);
      setFinalized(false);
      setEditingId(null);
      setCandidate({ start_time: "", end_time: "" });
    }
  };

  const toggleSelection = (active) => {
    setSelecting(active);
    drag.current?.cancel();
  };

  const setRangeFromMillis = (from, to) => {
    const first = nearestPoint(points, Math.min(from, to));
    const last = nearestPoint(points, Math.max(from, to));
    if (first && last) saveInterval({ start_time: first.timestamp, end_time: last.timestamp });
  };

  // ZRender receives blank-grid mouse events too; series click/brush events do not.
  const bindSelection = (chart) => {
    const zr = chart.getZr();
    const coordinate = event => [event.offsetX, event.offsetY];
    const finish = event => {
      const active = drag.current;
      if (!active || active.chart !== chart) return;
      const bounds = chart.getDom()?.getBoundingClientRect();
      const releaseX = event?.event ? event.offsetX : bounds && Number.isFinite(event?.clientX) ? event.clientX - bounds.left : null;
      if (Number.isFinite(releaseX)) {
        const grid = chart.getModel().getComponent("grid").coordinateSystem.getRect();
        active.lastX = Math.max(grid.x, Math.min(grid.x + grid.width, releaseX));
        active.end = Number(chart.convertFromPixel({ xAxisIndex: 0 }, active.lastX));
      }
      active.cancel();
      if (Math.abs(active.lastX - active.startX) >= 3) interaction.current.setRange(active.start, active.end);
    };
    zr.on("mousedown", event => {
      const current = interaction.current;
      if (!current.selecting || current.locked || current.finalized || (event.event?.button != null && event.event.button !== 0) || !chart.containPixel({ gridIndex: 0 }, coordinate(event))) return;
      drag.current?.cancel();
      const start = Number(chart.convertFromPixel({ xAxisIndex: 0 }, event.offsetX));
      if (!Number.isFinite(start)) return;
      const cancel = () => {
        window.removeEventListener("mouseup", finish);
        if (!chart.isDisposed()) chart.setOption({ graphic: [{ id: "period-drag", $action: "remove" }] });
        drag.current = null;
      };
      drag.current = { chart, start, end: start, startX: event.offsetX, lastX: event.offsetX, cancel };
      window.addEventListener("mouseup", finish);
    });
    zr.on("mousemove", event => {
      const active = drag.current;
      if (!active || active.chart !== chart) return;
      const grid = chart.getModel().getComponent("grid").coordinateSystem.getRect();
      const x = Math.max(grid.x, Math.min(grid.x + grid.width, event.offsetX));
      active.lastX = x;
      active.end = Number(chart.convertFromPixel({ xAxisIndex: 0 }, x));
      chart.setOption({ graphic: [{ id: "period-drag", type: "rect", silent: true, z: 100,
        shape: { x: Math.min(active.startX, x), y: grid.y, width: Math.abs(x - active.startX), height: grid.height },
        style: { fill: "rgba(37,99,235,.16)", stroke: "#2563EB", lineWidth: 1 } }] });
    });
    zr.on("mouseup", finish);
  };
  interaction.current = { selecting, locked, finalized, setRange: setRangeFromMillis };

  const option = useMemo(() => {
    let lower = 49.45, upper = 50.10;
    const chartData = [];
    let previous = null;
    points.forEach(point => {
      const stamp = istMillis(point.timestamp);
      if (previous !== null && stamp - previous > 30000) chartData.push([previous + 30000, null]);
      chartData.push([stamp, validCurveFrequency(point.frequency) ? point.frequency : null]);
      previous = stamp;
      if (validCurveFrequency(point.frequency)) {
        lower = Math.min(lower, point.frequency - .02);
        upper = Math.max(upper, point.frequency + .02);
      }
    });
    return {
      animation: false,
      grid: { left: 65, right: 28, top: 32, bottom: 75 },
      tooltip: { trigger: "axis", confine: true, formatter: (items) => {
        const item = items.find(entry => entry.seriesIndex === 0);
        if (!item) return "";
        return `${new Date(item.value[0]).toLocaleString("en-GB", { timeZone: "Asia/Kolkata" })} IST<br/>Frequency: <b>${item.value[1] == null ? "Unavailable" : `${Number(item.value[1]).toFixed(3)} Hz`}</b>`;
      } },
      xAxis: { type: "time", axisLabel: { formatter: axisTime, color: "#64748B" } },
      yAxis: { type: "value", name: "Frequency (Hz)", min: Number(lower.toFixed(3)), max: Number(upper.toFixed(3)), axisLabel: { formatter: value => Number(value).toFixed(2), color: "#64748B" }, splitLine: { lineStyle: { color: "#E2E8F0" } } },
      dataZoom: [{ type: "inside", filterMode: "none", moveOnMouseMove: !selecting }, { type: "slider", bottom: 12, height: 25, filterMode: "none" }],
      visualMap: { show: false, type: "piecewise", dimension: 1, seriesIndex: 0, pieces: [{ lt: LOW_HZ, color: "#DC2626" }, { gte: LOW_HZ, lte: HIGH_HZ, color: "#059669" }, { gt: HIGH_HZ, color: "#D97706" }] },
      series: [
        { name: "Frequency", type: "line", data: chartData, showSymbol: false, connectNulls: false, sampling: "minmax", lineStyle: { width: 1.8 }, areaStyle: { origin: 50, opacity: .14 },
          markLine: { silent: true, symbol: "none", lineStyle: { type: "dashed", width: 1.5 }, label: { position: "insideEndTop", formatter: "{b}" }, data: [{ name: "49.50 Hz", yAxis: 49.50, lineStyle: { color: "#991B1B" } }, { name: "49.70 Hz", yAxis: 49.70, lineStyle: { color: "#EA580C" } }, { name: "49.90 Hz", yAxis: LOW_HZ, lineStyle: { color: "#DC2626" } }, { name: "50.00 Hz", yAxis: 50, lineStyle: { color: "#64748B" } }, { name: "50.05 Hz", yAxis: HIGH_HZ, lineStyle: { color: "#D97706" } }] } },
        { name: "Selected events", type: "line", data: [], markArea: { silent: true, label: { position: "insideBottom", color: "#1D4ED8" }, itemStyle: { color: "rgba(37,99,235,.08)", borderColor: "#2563EB", borderWidth: 1 }, data: events.map((event, index) => [{ name: `${event.event_type.toUpperCase()} Event ${index + 1}`, xAxis: istMillis(event.start_time) }, { xAxis: istMillis(event.end_time) }]) } },
      ],
    };
  }, [points, events, selecting]);

  const saveInterval = (range = candidate) => {
    try {
      const summary = summarizeInterval(points, range.start_time, range.end_time);
      if (events.some(event => event.id !== editingId && event.event_type === frequencyKind && event.start_time === summary.start_time && event.end_time === summary.end_time)) throw new Error("This interval is already selected.");
      const entry = { ...summary, id: editingId || createSelectionId(), db_status: "checking", event_type: frequencyKind, file: null, file_id: null, result: null, status: "Selected" };
      setEvents(current => editingId ? current.map(event => event.id === editingId ? entry : event) : [...current, entry]);
      setEditingId(null);
      setCandidate({ start_time: "", end_time: "" });
      setError("");
    } catch (err) { setError(err.message); }
  };

  const updateEvent = (id, changes) => setEvents(current => current.map(event => event.id === id ? { ...event, ...changes } : event));

  const upload = async (event, file) => {
    if (!file) return;
    setRunningId(event.id);
    updateEvent(event.id, { status: "Uploading", error: "" });
    try {
      const response = await API.uploadTempFile(file);
      if (!response.success || !response.file_id) throw new Error(response.error || "File upload failed.");
      let analysisToken = null, analysisError = "";
      try { analysisToken = (await API.createFrequencyAnalysisSession(response.file_id)).session_token; } catch (err) { analysisError = err?.response?.data?.detail || err.message; }
      updateEvent(event.id, { file, file_id: response.file_id, analysis_token: analysisToken, analysis_error: analysisError, result: null, status: "Ready" });
    } catch (err) { updateEvent(event.id, { status: event.file_id ? "Ready" : "Upload failed", error: err.message }); }
    finally { setRunningId(null); }
  };

  const analyze = async (event) => {
    setRunningId(event.id);
    updateEvent(event.id, { status: "Analyzing", error: "" });
    try {
      const result = await onAnalyze(event);
      updateEvent(event.id, { status: "Complete", result });
    } catch (err) { updateEvent(event.id, { status: "Analysis failed", error: err.message }); }
    finally { setRunningId(null); }
  };

  const verified = event => ["existing", "partial", "new"].includes(event.db_status);
  const sourcesFor = event => event.stored_event_id || event.analysis_token || automaticSource?.session_token
    ? [{ event_id: event.stored_event_id || null, session_token: event.stored_event_id ? null : event.analysis_token || automaticSource?.session_token || null, start_time: event.start_time, end_time: event.end_time }]
    : (event.db_match?.matches || []).map(match => ({ event_id: match.event_id, start_time: match.coverage_start, end_time: match.coverage_end }));
  const consolidated = async selected => {
    setRunningId("consolidated"); setError("");
    try { if(new Set(selected.map(event=>event.event_type)).size>1)throw new Error('Process Low and High selections separately.');await onConsolidate(selected.flatMap(sourcesFor),selected[0]?.event_type || frequencyKind); }
    catch (err) { setError(err?.response?.data?.detail || err.message); }
    finally { setRunningId(null); }
  };
  const process = async event => {
    if (!verified(event)) return;
    if (!event.stored_event_id && !event.file_id && automaticSource?.session_token) return consolidated([event]);
    if (event.db_status === "existing" && !event.stored_event_id) return consolidated([event]);
    if (event.stored_event_id || event.file_id) return analyze(event);
    setFinalized(true); toggleSelection(false);
  };
  const processSelected = async () => {
    const selected=events.filter(event=>event.event_type===frequencyKind);
    if(automaticSource?.session_token && selected.length && selected.every(verified))return consolidated(selected);
    if (selected.some(event => !verified(event))) return;
    const ready = selected.filter(event => event.db_status === "existing" || event.file_id);
    if (ready.length === selected.length && selected.every(event => event.db_status === "existing" || event.analysis_token)) return consolidated(selected);
    setFinalized(true); toggleSelection(false);
    // The existing pipeline processes each ready event, with no duplicate parser.
    for (const event of ready) await process(event);
  };
  const statusLabel = event => ({ existing: "✓ Data Available", partial: "Partially Available", new: "Data Not Available", checking: "Checking DB…", error: "DB check failed" }[event.db_status] || "Checking DB…");
  const processLabel = event => event.db_status === "existing" ? "Process Existing Data" : event.db_status === "partial" ? "Process / Complete Data" : "Process / Upload Data";
  const renderChart = (modal = false) => <ReactECharts ref={modal ? expandedChartRef : chartRef} option={option} onChartReady={bindSelection} style={{ width: "100%", height: modal ? "calc(100vh - 260px)" : 360 }} />;
  const selectionControls = <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
    <TextField select size="small" label="Select frequency category" value={frequencyKind} onChange={event=>setFrequencyKind(event.target.value)} slotProps={{select:{native:true}}} disabled={locked}><option value="low">Low frequency</option><option value="high">High frequency</option></TextField>
    <Button size="small" variant={!selecting ? "contained" : "outlined"} disabled={locked} onClick={() => toggleSelection(false)}>Zoom/Pan</Button>
    <Button size="small" variant={selecting ? "contained" : "outlined"} startIcon={<MousePointer2 size={15} />} disabled={finalized || locked} onClick={() => toggleSelection(true)}>Select Period</Button>
    <TextField label="Start (IST)" type="datetime-local" size="small" value={candidate.start_time} onChange={event => setCandidate(current => ({ ...current, start_time: event.target.value.length === 16 ? `${event.target.value}:00` : event.target.value }))} slotProps={{ inputLabel: { shrink: true }, htmlInput: { step: 30 } }} disabled={finalized || locked} />
    <TextField label="End (IST)" type="datetime-local" size="small" value={candidate.end_time} onChange={event => setCandidate(current => ({ ...current, end_time: event.target.value.length === 16 ? `${event.target.value}:00` : event.target.value }))} slotProps={{ inputLabel: { shrink: true }, htmlInput: { step: 30 } }} disabled={finalized || locked} />
    <Button size="small" variant="contained" startIcon={<Plus size={15} />} onClick={() => saveInterval()} disabled={finalized || locked || !candidate.start_time || !candidate.end_time}>{editingId ? "Save interval" : "Add interval"}</Button>
    {editingId && <Button size="small" onClick={() => { setEditingId(null); setCandidate({ start_time: "", end_time: "" }); }}>Cancel edit</Button>}
  </Stack>;

  return <Paper elevation={0} sx={{ mb: 2, p: { xs: 1.5, md: 2 }, border: "1px solid #BFE2D9", borderRadius: 3, background: "linear-gradient(180deg,#EDF8F4 0%,#FFFFFF 120px)", boxShadow: "0 12px 30px rgba(3,98,76,.06)" }}>
    <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems={{ md: "center" }} spacing={1.5}>
      <Box><Typography sx={{ fontSize: 19, fontWeight: 900, color: "#0F2F4F" }}>Frequency overview & event selection</Typography><Typography sx={{ color: "#64748B", fontSize: 12 }}>Select dates to review Curve frequency and reuse stored event datasets. All times are IST.</Typography></Box>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        <CalendarInput mode="range" value={startDate} endValue={endDate} onChange={value => changeDates(value, value)} onRangeChange={(from, to) => changeDates(from, to)} disabled={locked} />
        <GradientButton size="small" disabled={loading || locked} onClick={() => load(startDate, endDate || startDate, true)}>{loading ? "Loading…" : data ? "Refresh Curve" : "Load Curve"}</GradientButton>
      </Stack>
    </Stack>
    {error && <Alert severity="error" sx={{ mt: 1.5 }}>{error}</Alert>}
    {loading && <Stack direction="row" spacing={1} alignItems="center" sx={{ py: 5, justifyContent: "center" }}><CircularProgress size={22} /><Typography>Reading 30SEC frequency…</Typography></Stack>}
    {!data && !loading && !error && <Box sx={{ py: 5, textAlign: "center", color: "#64748B" }}>Choose a date or date range, then load the Curve frequency overview.</Box>}
    {data && <>
      {(data.diagnostics || []).map(item => <Alert severity="warning" key={item.date} sx={{ mt: 1 }}>{item.date}: {item.message}</Alert>)}
      {data.sources.some(source => source.missing_readings || source.derived_timestamps) && <Alert severity="info" sx={{ mt: 1 }}>Missing readings appear as gaps. Empty timestamp cells use the Curve date's 30-second timeline.</Alert>}
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1.5 }} flexWrap="wrap" useFlexGap>
        <Chip size="small" label="LOW < 49.90 Hz" sx={{ color: "#B91C1C", bgcolor: "#FEE2E2" }} /><Chip size="small" label="NORMAL 49.90–50.05 Hz" sx={{ color: "#047857", bgcolor: "#D1FAE5" }} /><Chip size="small" label="HIGH > 50.05 Hz" sx={{ color: "#B45309", bgcolor: "#FEF3C7" }} />
        <Typography sx={{ flex: 1, fontSize: 11, color: "#64748B" }}>{data.start_date} to {data.end_date} · {points.length.toLocaleString()} samples · 30SEC D8:D2887</Typography><Button size="small" startIcon={<Expand size={15} />} onClick={() => setExpanded(true)}>Expand</Button>
      </Stack>
      {renderChart()}
      <Typography sx={{ mb: 1, fontSize: 12, color: "#64748B" }}>{selecting ? "Drag across the chart and release to add a period. DB availability is checked after release." : "Scroll to zoom; drag to pan or use the navigator. Choose Select Period to add events."}</Typography>
      {selectionControls}
      {!!events.length && <>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 2, mb: 1 }} flexWrap="wrap" gap={1}>
          <Typography sx={{ fontWeight: 850, color: "#0F2F4F" }}>{events.length} selected event{events.length === 1 ? "" : "s"}</Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap><Button size="small" variant="contained" disabled={locked || !visibleEvents.length || visibleEvents.some(event => !verified(event))} onClick={processSelected}>Process Selected Events</Button><Button size="small" disabled={locked || !visibleEvents.length || visibleEvents.some(event => !verified(event) || (event.db_status !== "existing" && !event.analysis_token && !automaticSource?.session_token))} onClick={() => consolidated(events.filter(event=>event.event_type===frequencyKind))}>Consolidated Report</Button><Button size="small" disabled={locked} onClick={() => { setEvents([]); setFinalized(false); setEditingId(null); setCandidate({ start_time: "", end_time: "" }); drag.current?.cancel(); }}>Clear all</Button><Button size="small" variant="outlined" disabled={locked || Boolean(editingId) || events.some(event => !verified(event))} onClick={() => { setFinalized(!finalized); toggleSelection(false); }}>{finalized ? "Edit periods" : "Finalize periods"}</Button></Stack>
        </Stack>
        <TableContainer><Table size="small"><TableHead><TableRow>{["Event", "Start (IST)", "End (IST)", "Duration", "Min Hz", "DB Status", "Action"].map(label => <TableCell key={label} sx={{ bgcolor: "#F1F7F5", fontWeight: 850, whiteSpace: "nowrap" }}>{label}</TableCell>)}</TableRow></TableHead><TableBody>
          {visibleEvents.map((event, index) => <TableRow key={event.id}><TableCell>Event {index + 1}{event.missing_readings > 0 && <Typography sx={{ fontSize: 10, color: "#B45309" }}>{event.missing_readings} invalid/missing samples</Typography>}</TableCell><TableCell sx={{ whiteSpace: "nowrap" }}>{displayTime(event.start_time)}</TableCell><TableCell sx={{ whiteSpace: "nowrap" }}>{displayTime(event.end_time)}</TableCell><TableCell sx={{ whiteSpace: "nowrap" }}>{duration(event.duration_seconds)}</TableCell><TableCell>{event.min_frequency.toFixed(3)}</TableCell><TableCell><Typography sx={{ fontSize: 12, color: event.db_status === "existing" ? "success.main" : "text.secondary" }}>{statusLabel(event)}</Typography>{event.db_match?.matches.map(match => <Typography key={match.event_id} sx={{ fontSize: 10 }}>{match.name || match.event_id}: {displayTime(match.coverage_start)} – {displayTime(match.coverage_end)}</Typography>)}</TableCell><TableCell><Button size="small" disabled={locked || !verified(event)} onClick={() => process(event)}>{processLabel(event)}</Button><Button size="small" disabled={finalized || locked} onClick={() => { setEditingId(event.id); setCandidate({ start_time: event.start_time, end_time: event.end_time }); }}>Edit</Button><IconButton size="small" aria-label={`Remove Event ${index + 1}`} disabled={finalized || locked} onClick={() => { setEvents(current => current.filter(item => item.id !== event.id)); if (editingId === event.id) { setEditingId(null); setCandidate({ start_time: "", end_time: "" }); } }}><Trash2 size={15} /></IconButton></TableCell></TableRow>)}
        </TableBody></Table></TableContainer>
      </>}
      {finalized && <Box sx={{ mt: 2, borderTop: "1px solid #DCE9E5", pt: 1.5 }}>
        <Typography sx={{ fontWeight: 850, color: "#0F2F4F", mb: 1 }}>Event files & analysis</Typography>
        <Typography sx={{ color: "#64748B", fontSize: 12, mb: 1 }}>Attach one SCADA workbook to each event. Analyze events in turn; each result stays mapped to its event for reopening in the report workspace.</Typography>
        {visibleEvents.map((event, index) => <Stack key={event.id} direction={{ xs: "column", md: "row" }} spacing={1} alignItems={{ md: "center" }} sx={{ py: 1, borderBottom: "1px solid #EDF2F7" }}>
          <Typography sx={{ minWidth: 200, fontSize: 12, fontWeight: 800 }}>Event {index + 1} · {event.start_time.slice(11)}–{event.end_time.slice(11)}</Typography>
          <TextField select size="small" label="Analysis type" value={event.event_type} onChange={e => updateEvent(event.id, { event_type: e.target.value, result: null, status: event.file_id ? "Ready" : "Selected" })} slotProps={{ select: { native: true } }} disabled={locked} sx={{ minWidth: 135 }}><option value="low">Low frequency</option><option value="high">High frequency</option></TextField>
          {verified(event) && event.db_status !== "existing" && <Button component="label" size="small" variant="outlined" disabled={locked}>{event.file ? "Replace file" : "Upload file"}<input hidden type="file" accept=".xlsx,.xlsm" disabled={locked} onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; upload(event, file); }} /></Button>}
          <Typography sx={{ flex: 1, fontSize: 12, overflowWrap: "anywhere" }}>{event.stored_event_name || event.file?.name || "No file attached"}</Typography>
          <Chip size="small" label={event.status} color={event.status === "Complete" ? "success" : "default"} />
          <Button size="small" variant="contained" disabled={locked || !verified(event) || (!event.file_id && !automaticSource?.session_token && event.db_status !== "existing")} onClick={() => process(event)}>{automaticSource?.session_token && event.db_status !== 'existing' ? 'Process fetched / blanket data' : processLabel(event)}</Button>
          <Button size="small" variant="outlined" disabled={locked || !verified(event) || (event.db_status !== "existing" && !event.analysis_token && !automaticSource?.session_token)} onClick={() => consolidated([event])}>Threshold Analysis</Button>
          {event.db_status === "partial" && <Box sx={{ maxWidth: 320 }}><Typography sx={{ fontSize: 11 }}>Missing: {event.db_match.missing.map(range => `${displayTime(range.start_time)} – ${displayTime(range.end_time)}`).join("; ")}. Gap-only completion is unavailable in the current upload flow; use a workbook covering this period.</Typography><Button size="small" disabled={locked} onClick={() => consolidated([{ ...event, analysis_token: null }])}>Process Available Data</Button></Box>}
          {event.result && <Button size="small" disabled={locked} onClick={() => onViewResult(event)}>View result</Button>}
          {event.analysis_error && <Typography color="warning.main" sx={{ fontSize: 11 }}>Consolidation unavailable: {event.analysis_error}</Typography>}
          {event.error && <Typography color="error" sx={{ fontSize: 12 }}>{event.error}</Typography>}
        </Stack>)}
      </Box>}
      <Dialog fullScreen open={expanded} onClose={() => setExpanded(false)}>
        <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><Box>Frequency overview<Typography sx={{ color: "#64748B", fontSize: 12 }}>{data.start_date} to {data.end_date} · IST · LOW &lt; 49.90 Hz · HIGH &gt; 50.05 Hz</Typography></Box><IconButton aria-label="Close expanded chart" onClick={() => setExpanded(false)}><X /></IconButton></DialogTitle>
        <DialogContent>{renderChart(true)}{selectionControls}{error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}<Typography sx={{ mt: 1, color: "#64748B", fontSize: 12 }}>{events.length} intervals selected. Close the chart to review the list and attach event files.</Typography></DialogContent>
      </Dialog>
    </>}
  </Paper>;
}
