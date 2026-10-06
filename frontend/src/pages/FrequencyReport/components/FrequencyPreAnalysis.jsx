import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactECharts from "echarts-for-react";
import { Alert, Box, Button, Chip, CircularProgress, Dialog, DialogContent, DialogTitle, IconButton, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from "@mui/material";
import { Expand, MousePointer2, Plus, Trash2, X } from "lucide-react";
import CalendarInput from "../../../components/ui/CalendarInput";
import GradientButton from "../../../components/ui/GradientButton";
import API from "../../../services/api";
import { HIGH_HZ, LOW_HZ, storedEventForPeriod, istMillis, nearestPoint, summarizeInterval } from "./frequencyIntervals";

const istToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const displayTime = (stamp) => stamp.replace("T", " ");
const axisTime = (millis) => new Date(millis).toLocaleString("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const duration = (seconds) => `${Math.floor(seconds / 60)}m ${seconds % 60}s`;

export default function FrequencyPreAnalysis({ busy, onAnalyze, onViewResult, storedEvents = [] }) {
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
  const clickStart = useRef(null);
  const points = data?.points || [];
  const locked = busy || runningId !== null;

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
    clickStart.current = null;
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

  useEffect(() => {
    setEvents(current => current.map(event => {
      const stored = storedEventForPeriod(storedEvents, event.start_time, event.end_time);
      return { ...event, stored_event_id: stored?.event_id, stored_event_name: stored?.name };
    }));
  }, [storedEvents]);

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
    clickStart.current = null;
    [chartRef, expandedChartRef].forEach(ref => ref.current?.getEchartsInstance().dispatchAction({ type: "takeGlobalCursor", key: "brush", brushOption: { brushType: active ? "lineX" : false, brushMode: "single" } }));
  };

  const setRangeFromMillis = (from, to) => {
    clickStart.current = null;
    const first = nearestPoint(points, Math.min(from, to));
    const last = nearestPoint(points, Math.max(from, to));
    if (first && last) setCandidate({ start_time: first.timestamp, end_time: last.timestamp });
    setError("");
  };

  const chartEvents = {
    brushEnd: (params) => {
      const range = params.areas?.[0]?.coordRange;
      if (!finalized && !locked && Array.isArray(range)) setRangeFromMillis(Number(range[0]), Number(range[1]));
    },
    click: (params) => {
      if (!selecting || finalized || locked || params.seriesIndex !== 0) return;
      const stamp = Number(params.data?.[0]);
      if (!Number.isFinite(stamp)) return;
      if (clickStart.current === null) {
        clickStart.current = stamp;
        const point = nearestPoint(points, stamp);
        setCandidate({ start_time: point.timestamp, end_time: "" });
      } else {
        setRangeFromMillis(clickStart.current, stamp);
        clickStart.current = null;
      }
    },
  };

  const option = useMemo(() => {
    let lower = 49.85, upper = 50.10;
    const chartData = [];
    let previous = null;
    points.forEach(point => {
      const stamp = istMillis(point.timestamp);
      if (previous !== null && stamp - previous > 30000) chartData.push([previous + 30000, null]);
      chartData.push([stamp, point.frequency]);
      previous = stamp;
      if (point.frequency !== null) {
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
      brush: { xAxisIndex: 0, brushType: selecting ? "lineX" : false, brushMode: "single", transformable: true, throttleType: "debounce", throttleDelay: 100, brushStyle: { color: "rgba(37,99,235,.15)", borderColor: "#2563EB", borderWidth: 1 }, inBrush: { opacity: 1 }, outOfBrush: { opacity: 1 } },
      visualMap: { show: false, type: "piecewise", dimension: 1, seriesIndex: 0, pieces: [{ lt: LOW_HZ, color: "#DC2626" }, { gte: LOW_HZ, lte: HIGH_HZ, color: "#059669" }, { gt: HIGH_HZ, color: "#D97706" }] },
      series: [
        { name: "Frequency", type: "line", data: chartData, showSymbol: false, connectNulls: false, sampling: "minmax", lineStyle: { width: 1.8 },
          markLine: { silent: true, symbol: "none", lineStyle: { type: "dashed", width: 1.5 }, label: { position: "insideEndTop", formatter: "{b}" }, data: [{ name: "49.90 Hz", yAxis: LOW_HZ, lineStyle: { color: "#DC2626" } }, { name: "50.05 Hz", yAxis: HIGH_HZ, lineStyle: { color: "#D97706" } }] },
          markArea: { silent: true, data: [[{ name: "LOW", yAxis: lower, itemStyle: { color: "rgba(220,38,38,.08)" }, label: { color: "#B91C1C" } }, { yAxis: LOW_HZ }], [{ name: "NORMAL", yAxis: LOW_HZ, itemStyle: { color: "rgba(5,150,105,.07)" }, label: { color: "#047857" } }, { yAxis: HIGH_HZ }], [{ name: "HIGH", yAxis: HIGH_HZ, itemStyle: { color: "rgba(217,119,6,.10)" }, label: { color: "#B45309" } }, { yAxis: upper }]] } },
        { name: "Selected events", type: "line", data: [], markArea: { silent: true, label: { position: "insideBottom", color: "#1D4ED8" }, itemStyle: { color: "rgba(37,99,235,.08)", borderColor: "#2563EB", borderWidth: 1 }, data: events.map((event, index) => [{ name: `Event ${index + 1}`, xAxis: istMillis(event.start_time) }, { xAxis: istMillis(event.end_time) }]) } },
      ],
    };
  }, [points, events, selecting]);

  const saveInterval = () => {
    try {
      const summary = summarizeInterval(points, candidate.start_time, candidate.end_time);
      if (events.some(event => event.id !== editingId && event.start_time === summary.start_time && event.end_time === summary.end_time)) throw new Error("This interval is already selected.");
      const stored = storedEventForPeriod(storedEvents, summary.start_time, summary.end_time);
      const entry = { stored_event_id: stored?.event_id, stored_event_name: stored?.name, ...summary, id: editingId || crypto.randomUUID(), event_type: summary.min_frequency < LOW_HZ ? "low" : "high", file: null, file_id: null, result: null, status: "Selected" };
      setEvents(current => editingId ? current.map(event => event.id === editingId ? entry : event) : [...current, entry]);
      setEditingId(null);
      clickStart.current = null;
      setCandidate({ start_time: "", end_time: "" });
      setError("");
      [chartRef, expandedChartRef].forEach(ref => ref.current?.getEchartsInstance().dispatchAction({ type: "brush", areas: [] }));
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
      updateEvent(event.id, { file, file_id: response.file_id, result: null, status: "Ready" });
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

  const renderChart = (modal = false) => <ReactECharts ref={modal ? expandedChartRef : chartRef} option={option} onEvents={chartEvents} onChartReady={chart => chart.dispatchAction({ type: "takeGlobalCursor", key: "brush", brushOption: { brushType: selecting ? "lineX" : false } })} style={{ width: "100%", height: modal ? "calc(100vh - 260px)" : 360 }} notMerge />;
  const selectionControls = <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
    <Button size="small" variant={selecting ? "contained" : "outlined"} startIcon={<MousePointer2 size={15} />} disabled={finalized || locked} onClick={() => toggleSelection(!selecting)}>{selecting ? "Switch to zoom / pan" : "Select interval"}</Button>
    <TextField label="Start (IST)" type="datetime-local" size="small" value={candidate.start_time} onChange={event => setCandidate(current => ({ ...current, start_time: event.target.value.length === 16 ? `${event.target.value}:00` : event.target.value }))} slotProps={{ inputLabel: { shrink: true }, htmlInput: { step: 30 } }} disabled={finalized || locked} />
    <TextField label="End (IST)" type="datetime-local" size="small" value={candidate.end_time} onChange={event => setCandidate(current => ({ ...current, end_time: event.target.value.length === 16 ? `${event.target.value}:00` : event.target.value }))} slotProps={{ inputLabel: { shrink: true }, htmlInput: { step: 30 } }} disabled={finalized || locked} />
    <Button size="small" variant="contained" startIcon={<Plus size={15} />} onClick={saveInterval} disabled={finalized || locked || !candidate.start_time || !candidate.end_time}>{editingId ? "Save interval" : "Add interval"}</Button>
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
      <Typography sx={{ mb: 1, fontSize: 12, color: "#64748B" }}>{selecting ? "Drag across the chart, or click two points, to choose a 30-second interval. Add each interval to the event list." : "Scroll to zoom; drag to pan or use the navigator. Switch to Select interval to choose events."}</Typography>
      {selectionControls}
      {!!events.length && <>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 2, mb: 1 }} flexWrap="wrap" gap={1}>
          <Typography sx={{ fontWeight: 850, color: "#0F2F4F" }}>{events.length} selected event{events.length === 1 ? "" : "s"}</Typography>
          <Stack direction="row" spacing={1}><Button size="small" disabled={locked} onClick={() => { setEvents([]); setFinalized(false); setEditingId(null); setCandidate({ start_time: "", end_time: "" }); clickStart.current = null; [chartRef, expandedChartRef].forEach(ref => ref.current?.getEchartsInstance().dispatchAction({ type: "brush", areas: [] })); }}>Clear all</Button><Button size="small" variant="outlined" disabled={locked || Boolean(editingId)} onClick={() => { setFinalized(!finalized); toggleSelection(false); }}>{finalized ? "Edit periods" : "Finalize periods"}</Button></Stack>
        </Stack>
        <TableContainer><Table size="small"><TableHead><TableRow>{["Event", "Start (IST)", "End (IST)", "Min Hz", "Max Hz", "Duration", "Action"].map(label => <TableCell key={label} sx={{ bgcolor: "#F1F7F5", fontWeight: 850, whiteSpace: "nowrap" }}>{label}</TableCell>)}</TableRow></TableHead><TableBody>
          {events.map((event, index) => <TableRow key={event.id}><TableCell>Event {index + 1}{event.missing_readings > 0 && <Typography sx={{ fontSize: 10, color: "#B45309" }}>{event.missing_readings} missing samples</Typography>}</TableCell><TableCell sx={{ whiteSpace: "nowrap" }}>{displayTime(event.start_time)}</TableCell><TableCell sx={{ whiteSpace: "nowrap" }}>{displayTime(event.end_time)}</TableCell><TableCell>{event.min_frequency.toFixed(3)}</TableCell><TableCell>{event.max_frequency.toFixed(3)}</TableCell><TableCell sx={{ whiteSpace: "nowrap" }}>{duration(event.duration_seconds)}</TableCell><TableCell><Button size="small" disabled={finalized || locked} onClick={() => { setEditingId(event.id); setCandidate({ start_time: event.start_time, end_time: event.end_time }); }}>Edit</Button><IconButton size="small" aria-label={`Remove Event ${index + 1}`} disabled={finalized || locked} onClick={() => { setEvents(current => current.filter(item => item.id !== event.id)); if (editingId === event.id) { setEditingId(null); setCandidate({ start_time: "", end_time: "" }); } }}><Trash2 size={15} /></IconButton></TableCell></TableRow>)}
        </TableBody></Table></TableContainer>
      </>}
      {finalized && <Box sx={{ mt: 2, borderTop: "1px solid #DCE9E5", pt: 1.5 }}>
        <Typography sx={{ fontWeight: 850, color: "#0F2F4F", mb: 1 }}>Event files & analysis</Typography>
        <Typography sx={{ color: "#64748B", fontSize: 12, mb: 1 }}>Attach one SCADA workbook to each event. Analyze events in turn; each result stays mapped to its event for reopening in the report workspace.</Typography>
        {events.map((event, index) => <Stack key={event.id} direction={{ xs: "column", md: "row" }} spacing={1} alignItems={{ md: "center" }} sx={{ py: 1, borderBottom: "1px solid #EDF2F7" }}>
          <Typography sx={{ minWidth: 200, fontSize: 12, fontWeight: 800 }}>Event {index + 1} · {event.start_time.slice(11)}–{event.end_time.slice(11)}</Typography>
          <TextField select size="small" label="Analysis type" value={event.event_type} onChange={e => updateEvent(event.id, { event_type: e.target.value, result: null, status: event.file_id ? "Ready" : "Selected" })} slotProps={{ select: { native: true } }} disabled={locked} sx={{ minWidth: 135 }}><option value="low">Low frequency</option><option value="high">High frequency</option></TextField>
          {!event.stored_event_id && <Button component="label" size="small" variant="outlined" disabled={locked}>{event.file ? "Replace file" : "Upload file"}<input hidden type="file" accept=".xlsx,.xlsm" disabled={locked} onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; upload(event, file); }} /></Button>}
          <Typography sx={{ flex: 1, fontSize: 12, overflowWrap: "anywhere" }}>{event.stored_event_name || event.file?.name || "No file attached"}</Typography>
          <Chip size="small" label={event.status} color={event.status === "Complete" ? "success" : "default"} />
          <Button size="small" variant="contained" disabled={locked || (!event.file_id && !event.stored_event_id)} onClick={() => analyze(event)}>{event.stored_event_id ? "Analyze stored data" : "Analyze"}</Button>
          {event.result && <Button size="small" disabled={locked} onClick={() => onViewResult(event)}>View result</Button>}
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
