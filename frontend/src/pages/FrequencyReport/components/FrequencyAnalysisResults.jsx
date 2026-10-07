import { useEffect, useMemo, useRef, useState } from "react";
import ReactECharts from "echarts-for-react";
import { Alert, Box, Button, Checkbox, CircularProgress, Dialog, DialogContent, DialogTitle, FormControlLabel, IconButton, MenuItem, Paper, Stack, Tab, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tabs, TextField, Typography } from "@mui/material";
import { Expand, X } from "lucide-react";
import API from "../../../services/api";
import ThresholdPerformanceTable, { LEVELS, metricValue } from "./ThresholdPerformanceTable";
import FrequencyPeriodStatistics from "./FrequencyPeriodStatistics";
const GROUPS = ["State", "ISGS", "IPP"];
const stamp = text => String(text || "").replace("T", " ");

export default function FrequencyAnalysisResults({ result, saveBlob, onHtmlReport }) {
  const [group, setGroup] = useState("State");
  const [detail, setDetail] = useState(false);
  const [page, setPage] = useState(0);
  const [table, setTable] = useState({ rows: [], total: 0 });
  const [state, setState] = useState("");
  const [chart, setChart] = useState(null);
  const [loadingTable, setLoadingTable] = useState(false);
  const [loadingChart, setLoadingChart] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState("");
  const [sections, setSections] = useState({ include_chronology: true, include_entity_performance: true, performance_groups: GROUPS });
  const chartCache = useRef(new Map());
  const tableCache = useRef(new Map());
  const session = result?.session_token, token = result?.result_token;
  useEffect(() => { setPage(0); setState(result?.states?.[0]?.entity_id || ""); setChart(null); setError(""); chartCache.current.clear(); tableCache.current.clear(); }, [session, token]);
  useEffect(() => {
    if (!session || (!detail && !["Chronology", "Message Categories"].includes(group))) return;
    let active = true; const key = `${token}:${group}:${page}`;
    setLoadingTable(true); setTable({ rows: [], total: 0 });
    const request = tableCache.current.get(key) ? Promise.resolve(tableCache.current.get(key)) : API.getFrequencyAnalysisTable({ session_token: session, result_token: token, group, offset: page * 50, limit: 50 });
    request.then(response => { if (active) { tableCache.current.set(key, response); if (tableCache.current.size > 30) tableCache.current.delete(tableCache.current.keys().next().value); setTable(response); } }).catch(err => active && setError(err?.response?.data?.detail || err.message)).finally(() => active && setLoadingTable(false));
    return () => { active = false; };
  }, [session, token, group, detail, page]);
  useEffect(() => {
    if (!session || !state) return;
    let active = true; const key = `${token}:${state}`;
    setLoadingChart(true); setChart(null);
    const request = chartCache.current.get(key) ? Promise.resolve(chartCache.current.get(key)) : API.getFrequencyAnalysisChart({ session_token: session, result_token: token, entity_id: state });
    request.then(response => { if (active) { chartCache.current.set(key, response); setChart(response); } }).catch(err => active && setError(err?.response?.data?.detail || err.message)).finally(() => active && setLoadingChart(false));
    return () => { active = false; };
  }, [session, token, state]);
  const option = useMemo(() => {
    const points = chart?.points || [];
    const colors = ["#F59E0B", "#EA580C", "#DC2626"];
    return { animation: false, legend: { top: 0, type: "scroll" }, grid: { top: 55, left: 65, right: 70, bottom: 65 },
      tooltip: { trigger: "axis", formatter: params => { const index = params[0]?.dataIndex, point = points[index]; return point ? `${stamp(point.timestamp)} IST<br/>Frequency: ${metricValue(point.frequency)} Hz<br/>State OD: ${metricValue(point.od_mw)} MW` : ""; } },
      xAxis: { type: "category", boundaryGap: false, data: points.map(point => stamp(point.timestamp)), axisLabel: { formatter: text => text.slice(5, 16) } },
      yAxis: [{ type: "value", name: "State OD (MW)", min: 0 }, { type: "value", name: "Frequency (Hz)", scale: true, min: value => Math.min(49.45, value.min - .03), max: value => Math.max(50.08, value.max + .03) }],
      dataZoom: [{ type: "inside" }, { type: "slider", bottom: 10, height: 23 }],
      series: [{ name: "State OD", type: "line", showSymbol: false, connectNulls: false, data: points.map(point => point.od_mw), lineStyle: { color: "#059669", width: 2 } },
        ...LEVELS.map((level, index) => ({ name: `OD at f <${level}`, type: "line", showSymbol: false, connectNulls: false, data: points.map(point => point.frequency == null || point.od_mw == null ? null : point.frequency < Number(level) ? point.od_mw : 0), lineStyle: { width: 0 }, areaStyle: { color: colors[index], opacity: .2 }, z: index + 1 })),
        { name: "Frequency", type: "line", showSymbol: false, connectNulls: false, yAxisIndex: 1, data: points.map(point => point.frequency), lineStyle: { color: "#7C3AED", width: 1.8 }, markLine: { silent: true, symbol: "none", data: LEVELS.map((level, index) => ({ yAxis: Number(level), name: `${level} Hz`, lineStyle: { color: colors[index], type: "dashed" }, label: { formatter: `${level} Hz` } })) } }],
    };
  }, [chart]);
  if (!result) return null;
  const summary = result.summary;
  const generate = async format => {
    setExporting(true); setError("");
    try {
      const response = await API.exportFrequencyAnalysis({ session_token: session, result_token: token, format, ...sections });
      if (format === "html") await onHtmlReport(response);
      else await saveBlob(response, `Consolidated_Frequency_Analysis.${format}`);
    } catch (err) {
      let detail = err?.response?.data?.detail || err.message;
      if (err?.response?.data instanceof Blob) { try { detail = JSON.parse(await err.response.data.text()).detail || detail; } catch {} }
      setError(detail);
    } finally { setExporting(false); }
  };
  return <Paper elevation={0} sx={{ p: 2, border: "1px solid #BFE2D9", borderRadius: 3, mt: 2 }}>
    <Typography sx={{ fontSize: 19, fontWeight: 900, color: "#0F2F4F" }}>Consolidated frequency performance</Typography>
    <Typography sx={{ fontSize: 12, color: "#64748B", mb: 1 }}>{stamp(summary.analysis_start)} to {stamp(summary.analysis_end)} IST · {(result.event_windows || result.ranges).length} selected event period(s)</Typography>
    <Stack direction="row" flexWrap="wrap" useFlexGap spacing={2} sx={{ my: 1 }}>{[["Selected duration", `${metricValue(summary.selected_minutes)} min`], ["Covered frequency", `${metricValue(summary.covered_frequency_minutes)} min`], ["Minimum frequency", `${metricValue(summary.minimum_frequency)} Hz`], ["Minimum at", stamp(summary.minimum_timestamp)], ["Average frequency", `${metricValue(summary.average_frequency)} Hz`], ["Low-frequency events", summary.low_frequency_events]].map(([label, value]) => <Box key={label} sx={{ p: 1, border: "1px solid #DCE9E5", bgcolor: "#F8FAFC", borderRadius: 1 }}><Typography sx={{ fontSize: 10, color: "#64748B" }}>{label}</Typography><Typography sx={{ fontSize: 13, fontWeight: 800 }}>{value}</Typography></Box>)}</Stack>
    <TableContainer><Table size="small"><TableHead><TableRow>{["Nested threshold", "Frequency minutes", "Occurrences", "Longest continuous (min)", "Lowest Hz"].map(label => <TableCell key={label} sx={{ fontWeight: 850 }}>{label}</TableCell>)}</TableRow></TableHead><TableBody>{LEVELS.map(level => <TableRow key={level}><TableCell>&lt;{level} Hz</TableCell>{["frequency_minutes", "occurrences", "longest_minutes", "lowest_frequency"].map(key => <TableCell key={key}>{metricValue(summary.thresholds[level][key])}</TableCell>)}</TableRow>)}</TableBody></Table></TableContainer>
    {result.warnings.map((warning, index) => <Alert key={index} severity="warning" sx={{ mt: 1 }}>{warning}</Alert>)}
    {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
    <Typography sx={{ fontSize: 11, color: "#64748B", my: 1 }}>{result.calculation_note}</Typography>
    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>{[["include_chronology", "Chronology"], ["include_entity_performance", "Entity Performance"]].map(([key, label]) => <FormControlLabel key={key} control={<Checkbox size="small" checked={sections[key]} disabled={exporting} onChange={event => setSections(current => ({ ...current, [key]: event.target.checked }))} />} label={label} />)}{GROUPS.map(item => <FormControlLabel key={item} control={<Checkbox size="small" checked={sections.performance_groups.includes(item)} disabled={exporting || !sections.include_entity_performance} onChange={() => setSections(current => ({ ...current, performance_groups: current.performance_groups.includes(item) ? current.performance_groups.filter(group => group !== item) : [...current.performance_groups, item] }))} />} label={item} />)}</Stack>
    <Stack direction="row" spacing={1} sx={{ mb: 2 }}>{["html", "pdf", "xlsx", "docx"].map(format => <Button key={format} size="small" variant="outlined" disabled={exporting} onClick={() => generate(format)}>{format === "html" ? "HTML Report" : format === "pdf" ? "Download PDF" : format === "xlsx" ? "Download Excel" : "Download Word"}</Button>)}{exporting && <CircularProgress size={20} />}</Stack>
    <Stack direction="row" justifyContent="space-between" alignItems="center"><Tabs value={group} onChange={(_, value) => { setGroup(value); setPage(0); }}>{[...GROUPS, "Chronology", "Message Categories"].map(item => <Tab key={item} value={item} label={item} />)}</Tabs>{GROUPS.includes(group) && <FormControlLabel control={<Checkbox checked={detail} onChange={event => { setDetail(event.target.checked); setPage(0); }} size="small" />} label="15-minute detail" />}</Stack>
    {group === "Message Categories" && (loadingTable ? <CircularProgress size={22} /> : <TableContainer><Table size="small"><TableHead><TableRow>{["Recipient group", "Recipient", "Category", "Messages"].map(label => <TableCell key={label}>{label}</TableCell>)}</TableRow></TableHead><TableBody>{table.rows.map((row,index) => <TableRow key={index}>{[row.group,row.entity,row.category,row.message_count].map((value,column) => <TableCell key={column}>{metricValue(value)}</TableCell>)}</TableRow>)}{!table.rows.length && <TableRow><TableCell colSpan={4}>No mapped messages available.</TableCell></TableRow>}</TableBody></Table></TableContainer>)}
    {group !== "Message Categories" && (loadingTable && (detail || group === "Chronology") ? <CircularProgress size={22} /> : group === "Chronology" ? <TableContainer sx={{ maxHeight: 400 }}><Table size="small" stickyHeader><TableHead><TableRow>{["Time (IST)", "Entity", "Frequency", "OD/UI (MW)", "Type", "Message No.", "Details"].map(label => <TableCell key={label}>{label}</TableCell>)}</TableRow></TableHead><TableBody>{table.rows.map((row, index) => <TableRow key={index}>{[stamp(row.timestamp), row.state, row.frequency_hz, row.deviation_mw, row.message_type, row.message_no, row.message_details].map((value, column) => <TableCell key={column}>{metricValue(value)}</TableCell>)}</TableRow>)}{!table.rows.length && <TableRow><TableCell colSpan={7}>No chronology rows available.</TableCell></TableRow>}</TableBody></Table></TableContainer> : <ThresholdPerformanceTable rows={detail ? table.rows : result.overall_performance[group]} />)}
    {(detail || ["Chronology", "Message Categories"].includes(group)) && <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}><Button disabled={!page || loadingTable} onClick={() => setPage(current => current - 1)}>Previous</Button><Typography sx={{ fontSize: 12 }}>{table.total ? page * 50 + 1 : 0}–{Math.min((page + 1) * 50, table.total)} of {table.total}</Typography><Button disabled={(page + 1) * 50 >= table.total || loadingTable} onClick={() => setPage(current => current + 1)}>Next</Button></Stack>}
    {GROUPS.includes(group) && <FrequencyPeriodStatistics key={`${session}:${token}:${group}`} result={result} group={group} />}
    {!!result.states.length && <><Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 2 }}><TextField select size="small" label="State timeline" value={state} onChange={event => setState(event.target.value)} sx={{ minWidth: 220 }}>{result.states.map(item => <MenuItem key={item.entity_id} value={item.entity_id}>{item.entity}</MenuItem>)}</TextField><Button size="small" startIcon={<Expand size={16} />} disabled={!chart} onClick={() => setExpanded(true)}>Expand</Button></Stack>{loadingChart ? <CircularProgress size={22} sx={{ m: 2 }} /> : chart && <><ReactECharts option={option} notMerge style={{ height: 420 }} /><Typography sx={{ fontSize: 11, color: "#64748B" }}>{chart.note}</Typography></>}</>}
    <Dialog fullScreen open={expanded} onClose={() => setExpanded(false)}><DialogTitle>{chart?.entity} · State OD and frequency<IconButton sx={{ float: "right" }} onClick={() => setExpanded(false)}><X /></IconButton></DialogTitle><DialogContent><ReactECharts option={option} notMerge style={{ height: "calc(100vh - 110px)" }} /></DialogContent></Dialog>
  </Paper>;
}
