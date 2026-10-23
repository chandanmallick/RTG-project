import { useEffect, useMemo, useRef, useState } from "react";
import ReactECharts from "echarts-for-react";
import { Alert, Box, Button, Checkbox, CircularProgress, Dialog, DialogContent, DialogTitle, FormControlLabel, IconButton, MenuItem, Paper, Stack, Tab, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tabs, TextField, Typography } from "@mui/material";
import { Expand, X } from "lucide-react";
import API from "../../../services/api";
import ThresholdPerformanceTable, { LEVELS, frequencyValue, metricValue, overdrawalValue } from "./ThresholdPerformanceTable";
import FrequencyPeriodStatistics from "./FrequencyPeriodStatistics";
import FrequencyEventTables from "./FrequencyEventTables";
import FrequencyCurvesPanel from "./FrequencyCurvesPanel";
import StateOverdrawalPanel from "./StateOverdrawalPanel";
const GROUPS = ["State", "ISGS", "IPP"];
const reportMonth = month => /^\d{4}-\d{2}$/.test(month || "") ? `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(month.slice(5))-1]}-${month.slice(0,4)}` : "";
const stamp = text => String(text || "").replace("T", " ");

export default function FrequencyAnalysisResults({ result, saveBlob, onHtmlReport }) {
  const levels = result?.event_type === "high" ? ["50.05"] : LEVELS;
  const high = result?.event_type === "high";
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
  const [reportText, setReportText] = useState({ executive_summary: "", general_notes: "", state_observations: "", generator_observations: "", chronology_notes: "", adms_ufr_remarks: "" });
  const [editReportText, setEditReportText] = useState(false);
  const [reportingMonth, setReportingMonth] = useState(result?.summary?.analysis_start?.slice(0, 7) || "");
  useEffect(() => { setReportingMonth(result?.summary?.analysis_start?.slice(0, 7) || ""); }, [result?.result_token]);
  const chartCache = useRef(new Map());
  const tableCache = useRef(new Map());
  const session = result?.session_token, token = result?.result_token;
  const [odData, setOdData] = useState(null);
  const [loadingOd, setLoadingOd] = useState(false);
  const [odError, setOdError] = useState("");
  const [enlargedScatterState, setEnlargedScatterState] = useState(null);
  const [chronoStateFilter, setChronoStateFilter] = useState("ALL");
  useEffect(() => { setPage(0); setState(result?.states?.[0]?.entity_id || ""); setChart(null); setError(""); setOdData(null); chartCache.current.clear(); tableCache.current.clear(); }, [session, token]);
  useEffect(() => {
    if (group === "State Scatter" && !odData && session) {
      setLoadingOd(true); setOdError("");
      API.getOdFrequencyPlots(session)
        .then(data => setOdData(data))
        .catch(err => setOdError(err?.response?.data?.detail || err.message))
        .finally(() => setLoadingOd(false));
    }
  }, [group, session, odData]);
  useEffect(() => {
    if (!session || (!detail && !["Chronology", "Message Categories"].includes(group)) || group === "State Scatter" || group === "State Overdrawal Plots" || group === "Frequency Event Tables" || group === "Frequency Curves") return;
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
      tooltip: { trigger: "axis", formatter: params => { const index = params[0]?.dataIndex, point = points[index]; return point ? `${stamp(point.timestamp)} IST<br/>Frequency: ${frequencyValue(point.frequency)} Hz<br/>State ${high ? "UD" : "OD"}: ${overdrawalValue(high ? (point.deviation_mw == null ? null : Math.max(-point.deviation_mw,0)) : point.od_mw)} MW` : ""; } },
      xAxis: { type: "category", boundaryGap: false, data: points.map(point => stamp(point.timestamp)), axisLabel: { formatter: text => text.slice(5, 16) } },
      yAxis: [{ type: "value", name: high ? "State UD (MW)" : "State OD (MW)", min: 0, axisLabel: { formatter: value => overdrawalValue(value) } }, { type: "value", name: "Frequency (Hz)", scale: true, min: value => Math.min(49.45, value.min - .03), max: value => Math.max(50.08, value.max + .03), axisLabel: { formatter: value => frequencyValue(value) } }],
      dataZoom: [{ type: "inside" }, { type: "slider", bottom: 10, height: 23 }],
      series: [{ name: high ? "State UD" : "State OD", type: "line", showSymbol: false, connectNulls: false, data: points.map(point => high ? (point.deviation_mw == null ? null : Math.max(-point.deviation_mw,0)) : point.od_mw), lineStyle: { color: "#059669", width: 2 } },
        ...levels.map((level, index) => ({ name: `${high ? "UD at f >" : "OD at f <"}${level}`, type: "line", showSymbol: false, connectNulls: false, data: points.map(point => point.frequency == null || point.od_mw == null ? null : (high ? point.frequency > Number(level) : point.frequency < Number(level)) ? (high ? Math.max(-point.deviation_mw,0) : point.od_mw) : 0), lineStyle: { width: 0 }, areaStyle: { color: colors[index], opacity: .2 }, z: index + 1 })),
        { name: "Frequency Dip (<49.90 Hz)", type: "line", showSymbol: false, connectNulls: false, yAxisIndex: 1, data: points.map(point => (point.frequency != null && point.frequency < 49.9) ? point.frequency : 49.9), lineStyle: { width: 0 }, areaStyle: { color: "rgba(220, 38, 38, 0.28)", origin: 49.9 }, z: 1 },
        { name: "Frequency", type: "line", showSymbol: false, connectNulls: false, yAxisIndex: 1, data: points.map(point => point.frequency), lineStyle: { color: "#7C3AED", width: 1.8 }, markLine: { silent: true, symbol: "none", data: levels.map((level, index) => ({ yAxis: Number(level), name: `${level} Hz`, lineStyle: { color: colors[index], type: "dashed" }, label: { formatter: `${level} Hz` } })) } }],
    };
  }, [chart, high]);
  if (!result) return null;
  const summary = result.summary;
  const generate = async (format, downloadHtml = false) => {
    setExporting(true); setError("");
    try {
      const response = await API.exportFrequencyAnalysis({ session_token: session, result_token: token, format, layout: ["pdf", "docx"].includes(format) ? "monthly-template" : "compact", reporting_month: !high && ["pdf", "docx"].includes(format) ? reportingMonth || null : null, report_text: reportText, ...sections });
      if (format === "html" && downloadHtml) await saveBlob(new Blob([response.html_document],{type:"text/html;charset=utf-8"}),`Frequency_Analysis_${result.event_type || "low"}.html`);
      else if (format === "html") await onHtmlReport(response);
      else await saveBlob(response, ["pdf", "docx"].includes(format) ? `Frequency_Operation_Report_${!high && reportingMonth ? reportMonth(reportingMonth) : summary.analysis_start?.slice(0, 10)}.${format}` : `Consolidated_Frequency_Analysis.${format}`);
    } catch (err) {
      let detail = err?.response?.data?.detail || err.message;
      if (err?.response?.data instanceof Blob) { try { detail = JSON.parse(await err.response.data.text()).detail || detail; } catch {} }
      setError(detail);
    } finally { setExporting(false); }
  };
  return <Paper elevation={0} sx={{ p: 2, border: "1px solid #BFE2D9", borderRadius: 3, mt: 2 }}>
    <Typography sx={{ fontSize: 19, fontWeight: 900, color: "#0F2F4F" }}>{high ? "High" : "Low"} frequency performance</Typography>
    <Typography sx={{ fontSize: 12, color: "#64748B", mb: 1 }}>{stamp(summary.analysis_start)} to {stamp(summary.analysis_end)} IST · {(result.event_windows || result.ranges).length} selected event period(s)</Typography>
    <Stack direction="row" flexWrap="wrap" useFlexGap spacing={2} sx={{ my: 1 }}>{[["Selected duration", `${metricValue(summary.selected_minutes)} min`], ["Covered frequency", `${metricValue(summary.covered_frequency_minutes)} min`], ["Minimum frequency", `${frequencyValue(summary.minimum_frequency)} Hz`], ["Minimum at", stamp(summary.minimum_timestamp)], ["Average frequency", `${frequencyValue(summary.average_frequency)} Hz`], [high ? "High-frequency events" : "Low-frequency events", high ? summary.high_frequency_events : summary.low_frequency_events]].map(([label, value]) => <Box key={label} sx={{ p: 1, border: "1px solid #DCE9E5", bgcolor: "#F8FAFC", borderRadius: 1 }}><Typography sx={{ fontSize: 10, color: "#64748B" }}>{label}</Typography><Typography sx={{ fontSize: 13, fontWeight: 800 }}>{value}</Typography></Box>)}</Stack>
    <TableContainer><Table size="small"><TableHead><TableRow>{["Nested threshold", "Frequency minutes", "Occurrences", "Longest continuous (min)", "Lowest Hz"].map(label => <TableCell key={label} sx={{ fontWeight: 850 }}>{label}</TableCell>)}</TableRow></TableHead><TableBody>{levels.map(level => <TableRow key={level}><TableCell>{high ? ">" : "<"}{level} Hz</TableCell>{["frequency_minutes", "occurrences", "longest_minutes", "lowest_frequency"].map(key => <TableCell key={key}>{key === "lowest_frequency" ? frequencyValue(summary.thresholds[level][key]) : metricValue(summary.thresholds[level][key])}</TableCell>)}</TableRow>)}</TableBody></Table></TableContainer>
    {result.warnings.map((warning, index) => <Alert key={index} severity="warning" sx={{ mt: 1 }}>{warning}</Alert>)}
    {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
    <Typography sx={{ fontSize: 11, color: "#64748B", my: 1 }}>{result.calculation_note}</Typography>
    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>{[["include_chronology", "Chronology"], ["include_entity_performance", "Entity Performance"]].map(([key, label]) => <FormControlLabel key={key} control={<Checkbox size="small" checked={sections[key]} disabled={exporting} onChange={event => setSections(current => ({ ...current, [key]: event.target.checked }))} />} label={label} />)}{GROUPS.map(item => <FormControlLabel key={item} control={<Checkbox size="small" checked={sections.performance_groups.includes(item)} disabled={exporting || !sections.include_entity_performance} onChange={() => setSections(current => ({ ...current, performance_groups: current.performance_groups.includes(item) ? current.performance_groups.filter(group => group !== item) : [...current.performance_groups, item] }))} />} label={item} />)}</Stack>
    <Button size="small" disabled={exporting} onClick={() => setEditReportText(value => !value)}>{editReportText ? "Hide report text" : "Edit Word / PDF report text"}</Button>
    {!high && <TextField type="month" size="small" label="Word / PDF reporting month" value={reportingMonth} disabled={exporting} onChange={event => setReportingMonth(event.target.value)} InputLabelProps={{ shrink: true }} helperText="Uses prepared data for this calendar month and only the selected reporting slots." sx={{ my: 1, minWidth: 280 }} />}
    {editReportText && <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2, my: 2 }}>{[["executive_summary", "Executive summary"], ["general_notes", "General notes"], ["state_observations", "State performance observations"], ["generator_observations", "ISGS / IPP observations"], ["chronology_notes", "Actions and chronology notes"], ["adms_ufr_remarks", "ADMS / UFR remarks"]].map(([key, label]) => <TextField key={key} label={label} multiline minRows={3} value={reportText[key]} disabled={exporting} inputProps={{ maxLength: 6000 }} helperText="Included in Word and PDF. Leave blank to omit optional commentary." onChange={event => setReportText(current => ({ ...current, [key]: event.target.value }))} />)}</Box>}
    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>{["html", "pdf", "xlsx", "docx"].map(format => <Button key={format} size="small" variant="outlined" disabled={exporting} onClick={() => generate(format)}>{format === "html" ? "HTML Report" : format === "pdf" ? "Download PDF" : format === "xlsx" ? "Download Excel" : "Download Word"}</Button>)}<Button size="small" variant="outlined" disabled={exporting} onClick={()=>generate("html",true)}>Download HTML</Button>{exporting && <CircularProgress size={20} />}</Stack>
    <Stack direction="row" justifyContent="space-between" alignItems="center"><Tabs value={group} onChange={(_, value) => { setGroup(value); setPage(0); }}>{[...GROUPS, "Chronology", "Message Categories", "State Scatter", "State Overdrawal Plots", "Frequency Event Tables", "Frequency Curves"].map(item => <Tab key={item} value={item} label={item} />)}</Tabs>{GROUPS.includes(group) && <FormControlLabel control={<Checkbox checked={detail} onChange={event => { setDetail(event.target.checked); setPage(0); }} size="small" />} label="15-minute detail" />}</Stack>
    {group === "State Overdrawal Plots" && (
      <StateOverdrawalPanel result={result} sessionToken={session} saveBlob={saveBlob} />
    )}
    {group === "Frequency Event Tables" && (
      <FrequencyEventTables result={result} sessionToken={session} saveBlob={saveBlob} />
    )}
    {group === "Frequency Curves" && (
      <FrequencyCurvesPanel result={result} sessionToken={session} saveBlob={saveBlob} />
    )}
    {group === "State Scatter" && (
      loadingOd ? <Stack alignItems="center" sx={{ py: 4 }}><CircularProgress size={32} /><Typography sx={{ mt: 1, fontSize: 13, color: "#64748B" }}>Generating State Overdrawal vs Frequency scatter plots…</Typography></Stack> :
      odError ? <Alert severity="warning" sx={{ my: 2 }}>{odError}</Alert> :
      <Box sx={{ mt: 2 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
          <Box>
            <Typography sx={{ fontSize: 16, fontWeight: 900, color: "#17365D" }}>State-wise Overdrawal vs Frequency Analysis ({odData?.period || "Uploaded Period"})</Typography>
            <Typography sx={{ fontSize: 12, color: "#64748B" }}>Positive Actual - Schedule deviations (&gt;0 MW; Overdrawal for states, Under-injection for DVC) versus Frequency (Hz). Bands: &lt;49.50 Hz (Red), 49.50–&lt;49.70 Hz (Orange), 49.70–&lt;49.90 Hz (Purple), ≥49.90 Hz (Green).</Typography>
          </Box>
          <Stack direction="row" spacing={1}>
            <Button variant="contained" size="small" sx={{ bgcolor: "#059669", "&:hover": { bgcolor: "#047857" } }} onClick={async () => {
              try {
                const blob = await API.downloadOdFrequencyStatistics(session);
                await saveBlob(blob, "OD_Frequency_Statistics.xlsx");
              } catch (e) { setError(e.message); }
            }}>Download Statistics (Excel)</Button>
            <Button variant="outlined" size="small" onClick={async () => {
              try {
                const blob = await API.downloadOdFrequencyZip(session);
                await saveBlob(blob, "OD_Frequency_Plots.zip");
              } catch (e) { setError(e.message); }
            }}>Download All (ZIP)</Button>
          </Stack>
        </Stack>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 3 }}>
          {Object.entries(odData?.plots_base64 || {}).map(([stateName, imgUri]) => (
            <Paper key={stateName} variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                <Typography sx={{ fontSize: 14, fontWeight: 800, color: "#17365D" }}>{stateName}</Typography>
                <Stack direction="row" spacing={1}>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<Expand size={14} />}
                    onClick={() => setEnlargedScatterState({ name: stateName, img: imgUri, stats: odData?.state_stats?.[stateName] })}
                    sx={{ textTransform: "none", fontSize: 11.5 }}
                  >
                    Enlarge
                  </Button>
                  <Button size="small" variant="outlined" onClick={async () => {
                    try {
                      const blob = await API.downloadOdFrequencyPlot(session, stateName);
                      await saveBlob(blob, `${stateName}_OD_Frequency.png`);
                    } catch (e) { setError(e.message); }
                  }} sx={{ textTransform: "none", fontSize: 11.5 }}>
                    Download
                  </Button>
                </Stack>
              </Stack>
              <Box
                component="img"
                src={imgUri}
                alt={`${stateName} OD vs Frequency`}
                onClick={() => setEnlargedScatterState({ name: stateName, img: imgUri, stats: odData?.state_stats?.[stateName] })}
                sx={{ width: "100%", borderRadius: 1, border: "1px solid #E2E8F0", cursor: "zoom-in" }}
                title="Click to enlarge plot"
              />
              {!!odData?.state_stats?.[stateName]?.length && (
                <TableContainer sx={{ mt: 1 }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ bgcolor: "#17365D" }}>
                        {["Frequency Threshold", "Total 1-min Blocks", `${stateName === "DVC" ? "Under-injection" : "Overdrawal"} Blocks (No. & %)`, `Maximum ${stateName === "DVC" ? "Under-injection" : "Overdrawal"}`].map(h => (
                          <TableCell key={h} sx={{ color: "white", fontWeight: 800, fontSize: 11, py: 0.5 }}>{h}</TableCell>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {odData.state_stats[stateName].map((row, rIdx) => (
                        <TableRow key={rIdx} sx={{ bgcolor: rIdx % 2 ? "#F8FAFC" : "#FFFFFF" }}>
                          <TableCell sx={{ fontWeight: 800, fontSize: 11, py: 0.5 }}>{row.threshold}</TableCell>
                          <TableCell sx={{ fontSize: 11, py: 0.5 }}>{Number(row.total_blocks).toLocaleString()}</TableCell>
                          <TableCell sx={{ fontSize: 11, py: 0.5 }}>{Number(row.positive_blocks).toLocaleString()} ({row.percentage?.toFixed(1)}%)</TableCell>
                          <TableCell sx={{ fontWeight: 800, fontSize: 11, py: 0.5 }}>{row.maximum_mw?.toFixed(1)} MW</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </Paper>
          ))}
        </Box>
      </Box>
    )}
    {group === "Message Categories" && (loadingTable ? <CircularProgress size={22} /> : <TableContainer><Table size="small"><TableHead><TableRow>{["Recipient group", "Recipient", "Category", "Messages"].map(label => <TableCell key={label}>{label}</TableCell>)}</TableRow></TableHead><TableBody>{table.rows.map((row,index) => <TableRow key={index}>{[row.group,row.entity,row.category,row.message_count].map((value,column) => <TableCell key={column}>{metricValue(value)}</TableCell>)}</TableRow>)}{!table.rows.length && <TableRow><TableCell colSpan={4}>No mapped messages available.</TableCell></TableRow>}</TableBody></Table></TableContainer>)}
    {group !== "Message Categories" && group !== "State Scatter" && group !== "Frequency Event Tables" && group !== "Frequency Curves" && (loadingTable && (detail || group === "Chronology") ? <CircularProgress size={22} /> : group === "Chronology" ? (
      <Box>
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1.5, mt: 1 }}>
          <TextField
            select
            size="small"
            label="Filter State"
            value={chronoStateFilter}
            onChange={(e) => setChronoStateFilter(e.target.value)}
            sx={{ minWidth: 200 }}
          >
            <MenuItem value="ALL">All States / Entities</MenuItem>
            {(result?.states || []).map((s) => (
              <MenuItem key={s.entity_id} value={s.entity}>{s.entity}</MenuItem>
            ))}
          </TextField>
          {chronoStateFilter !== "ALL" && (
            <Button size="small" variant="outlined" onClick={() => setChronoStateFilter("ALL")}>
              Clear Filter
            </Button>
          )}
        </Stack>
        <TableContainer sx={{ maxHeight: 400 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                {["Time (IST)", "Entity", "Frequency", "OD/UI (MW)", "Type", "Message No.", "Details"].map(label => (
                  <TableCell key={label}>{label}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {table.rows
                .filter(row => chronoStateFilter === "ALL" || row.state === chronoStateFilter || row.entity === chronoStateFilter)
                .map((row, index) => (
                  <TableRow key={index}>
                    <TableCell>{stamp(row.timestamp)}</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>{row.state || row.entity}</TableCell>
                    <TableCell>{frequencyValue(row.frequency_hz)}</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>{overdrawalValue(row.deviation_mw)}</TableCell>
                    <TableCell>{row.message_type}</TableCell>
                    <TableCell>{row.message_no}</TableCell>
                    <TableCell>{row.message_details}</TableCell>
                  </TableRow>
                ))}
              {!table.rows.length && <TableRow><TableCell colSpan={7}>No chronology rows available.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    ) : <ThresholdPerformanceTable levels={levels} high={high} rows={detail ? table.rows : result.overall_performance[group]} />)}
    {(detail || ["Chronology", "Message Categories"].includes(group)) && group !== "Frequency Event Tables" && group !== "Frequency Curves" && <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}><Button disabled={!page || loadingTable} onClick={() => setPage(current => current - 1)}>Previous</Button><Typography sx={{ fontSize: 12 }}>{table.total ? page * 50 + 1 : 0}–{Math.min((page + 1) * 50, table.total)} of {table.total}</Typography><Button disabled={(page + 1) * 50 >= table.total || loadingTable} onClick={() => setPage(current => current + 1)}>Next</Button></Stack>}
    {GROUPS.includes(group) && <FrequencyPeriodStatistics key={`${session}:${token}:${group}`} result={result} group={group} />}
    {!!result.states.length && group !== "State Scatter" && group !== "Frequency Event Tables" && group !== "Frequency Curves" && <><Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 2 }}><TextField select size="small" label="State timeline" value={state} onChange={event => setState(event.target.value)} sx={{ minWidth: 220 }}>{result.states.map(item => <MenuItem key={item.entity_id} value={item.entity_id}>{item.entity}</MenuItem>)}</TextField><Button size="small" startIcon={<Expand size={16} />} disabled={!chart} onClick={() => setExpanded(true)}>Expand</Button></Stack>{loadingChart ? <CircularProgress size={22} sx={{ m: 2 }} /> : chart && <><ReactECharts option={option} notMerge style={{ height: 420 }} /><Typography sx={{ fontSize: 11, color: "#64748B" }}>{chart.note}</Typography></>}</>}

    {/* Enlarged State Scatter Plot Modal */}
    <Dialog
      maxWidth="lg"
      fullWidth
      open={Boolean(enlargedScatterState)}
      onClose={() => setEnlargedScatterState(null)}
    >
      <DialogTitle sx={{ bgcolor: "#17365D", color: "white", display: "flex", justifyContent: "space-between", alignItems: "center", py: 1.5 }}>
        <Typography sx={{ fontWeight: 800, fontSize: 15 }}>
          {enlargedScatterState?.name} — Overdrawal vs Frequency Analysis (High Resolution)
        </Typography>
        <IconButton sx={{ color: "white" }} size="small" onClick={() => setEnlargedScatterState(null)}>
          <X size={18} />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ p: 2.5, bgcolor: "#F8FAFC" }}>
        {enlargedScatterState && (
          <Stack spacing={2}>
            <Box sx={{ textAlign: "center", bgcolor: "white", p: 1.5, borderRadius: 2, border: "1px solid #CBD5E1" }}>
              <Box
                component="img"
                src={enlargedScatterState.img}
                alt={enlargedScatterState.name}
                sx={{ maxWidth: "100%", maxHeight: "72vh", objectFit: "contain", borderRadius: 1 }}
              />
            </Box>
            {!!enlargedScatterState.stats?.length && (
              <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 1.5 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: "#17365D" }}>
                      {["Frequency Threshold", "Total 1-min Blocks", "OD/UI Blocks (No. & %)", "Maximum OD/UI"].map(h => (
                        <TableCell key={h} sx={{ color: "white", fontWeight: 800, fontSize: 11.5, py: 0.8 }}>{h}</TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {enlargedScatterState.stats.map((row, rIdx) => (
                      <TableRow key={rIdx} sx={{ bgcolor: rIdx % 2 ? "#F8FAFC" : "#FFFFFF" }}>
                        <TableCell sx={{ fontWeight: 800, fontSize: 11.5, py: 0.6 }}>{row.threshold}</TableCell>
                        <TableCell sx={{ fontSize: 11.5, py: 0.6 }}>{Number(row.total_blocks).toLocaleString()}</TableCell>
                        <TableCell sx={{ fontSize: 11.5, py: 0.6 }}>{Number(row.positive_blocks).toLocaleString()} ({row.percentage?.toFixed(1)}%)</TableCell>
                        <TableCell sx={{ fontWeight: 800, fontSize: 11.5, py: 0.6 }}>{row.maximum_mw?.toFixed(1)} MW</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Stack>
        )}
      </DialogContent>
    </Dialog>

    <Dialog fullScreen open={expanded} onClose={() => setExpanded(false)}><DialogTitle>{chart?.entity} · State OD and frequency<IconButton sx={{ float: "right" }} onClick={() => setExpanded(false)}><X /></IconButton></DialogTitle><DialogContent><ReactECharts option={option} notMerge style={{ height: "calc(100vh - 110px)" }} /></DialogContent></Dialog>
  </Paper>;
}
