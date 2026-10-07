import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Box, Button, CircularProgress, MenuItem, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from "@mui/material";
import API from "../../../services/api";
import { LEVELS, frequencyValue, metricValue, overdrawalValue } from "./ThresholdPerformanceTable";

const time = value => value ? value.slice(11, 19) : "—";
const head = { bgcolor: "#203B63", color: "white", fontWeight: 800, whiteSpace: "nowrap" };
const dateCell = { position: "sticky", left: 0, width: 120, minWidth: 120, bgcolor: "white", zIndex: 2, whiteSpace: "nowrap" };
const entityCell = { position: "sticky", left: 120, minWidth: 180, bgcolor: "white", zIndex: 2, borderRight: "1px solid #CBD5E1" };
const baseMetrics = ["Period (IST)", "Min Hz", "At", "Duration (min)", "Freq min", "OD/UI min", "OD/UI %", "Avg OD/UI MW", "Max OD/UI MW", "Messages"];
const baseValues = (row, level) => row ? [row.selected_ranges?.map(([start, end]) => `${time(start)}–${time(end)}`).join(" / ") || `${time(row.period_start)}–${time(row.period_end)}`, frequencyValue(row.lowest_frequency), time(row.minimum_timestamp), row.selected_minutes,
  ...["frequency_minutes", "adverse_minutes", "adverse_pct"].map(key => row.thresholds[level][key]), overdrawalValue(row.thresholds[level].average_od_ui_mw), overdrawalValue(row.thresholds[level].maximum_od_ui_mw), row.thresholds[level].message_count] : Array(baseMetrics.length).fill(null);

export default function FrequencyPeriodStatistics({ result, group }) {
  const levels = result.event_type === "high" ? ["50.05"] : LEVELS;
  const [view, setView] = useState("compare");
  const [layout, setLayout] = useState("all");
  const [level, setLevel] = useState("all");
  const [dayPage, setDayPage] = useState(0);
  const [entityPage, setEntityPage] = useState(0);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const cache = useRef(new Map());
  const basis = view === "monthly" ? "monthly" : view === "day" ? "day" : "event";
  const sign=result.event_type === "high" ? ">" : "<";
  const metrics=level === "all" ? ["Period (IST)","Min Hz","At","Duration (min)",...levels.flatMap(item=>[`${sign}${item} Freq min (%)`,`${sign}${item} Adverse min (%)`,`${sign}${item} Avg / Max MW`]),"Messages"] : baseMetrics;
  const values=(row,selectedLevel)=>selectedLevel !== "all" ? baseValues(row,selectedLevel) : row ? [row.selected_ranges?.map(([start,end])=>`${time(start)}?${time(end)}`).join(" / "),frequencyValue(row.lowest_frequency),time(row.minimum_timestamp),row.selected_minutes,...levels.flatMap(item=>{const value=row.thresholds[item];return [`${metricValue(value.frequency_minutes)} (${metricValue(row.selected_minutes ? value.frequency_minutes / row.selected_minutes *100 : null)}%)`,`${metricValue(value.adverse_minutes)} (${metricValue(value.adverse_pct)}%)`,`${overdrawalValue(value.average_od_ui_mw)} / ${overdrawalValue(value.maximum_od_ui_mw)}`]}),row.message_count] : Array(metrics.length).fill(null);
  useEffect(() => { setDayPage(0); setEntityPage(0); setData(null); cache.current.clear(); }, [result.result_token, group]);
  useEffect(() => {
    let active = true;
    const key = `${result.result_token}:${group}:${basis}:${dayPage}:${entityPage}`;
    setLoading(true); setError(""); setData(null);
    const request = cache.current.has(key) ? Promise.resolve(cache.current.get(key)) : API.getFrequencyAnalysisTable({ session_token: result.session_token, result_token: result.result_token,
      group, period_view: basis, offset: dayPage * 7, limit: 7, entity_offset: entityPage * 10, entity_limit: 10 });
    request.then(response => { if (active) { cache.current.set(key, response); if (cache.current.size > 12) cache.current.delete(cache.current.keys().next().value); setData(response); } })
      .catch(err => active && setError(err?.response?.data?.detail || err.message)).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [result.session_token, result.result_token, group, basis, dayPage, entityPage]);
  const lookup = useMemo(() => new Map((data?.rows || []).map(row => [`${row.entity_id}:${row.period_id}`, row])), [data]);
  const periodsByDay = useMemo(() => (data?.periods || []).reduce((days, period) => { (days[period.date] ||= []).push(period); return days; }, {}), [data]);
  const maxEvents = Math.max(1, ...Object.values(periodsByDay).map(periods => periods.length));
  const renderTable = entities => <TableContainer sx={{ maxHeight: 480, border: "1px solid #CBD5E1", borderRadius: 1, mb: 2 }}><Table size="small" stickyHeader>
    <TableHead><TableRow><TableCell rowSpan={2} sx={{ ...dateCell, ...head, zIndex: 5 }}>Date</TableCell>{layout === "all" && <TableCell rowSpan={2} sx={{ ...entityCell, ...head, zIndex: 5 }}>Entity</TableCell>}
      {Array.from({ length: view === "compare" ? maxEvents : 1 }, (_, index) => <TableCell key={index} colSpan={metrics.length} align="center" sx={head}>{view === "compare" ? `Event ${index + 1}` : view === "day" ? "Daily total" : view === "monthly" ? "Monthly total" : "Event"} · f &lt;{level} Hz</TableCell>)}</TableRow>
      <TableRow>{Array.from({ length: view === "compare" ? maxEvents : 1 }, (_, index) => metrics.map(label => <TableCell key={`${index}:${label}`} sx={{ ...head, top: 38 }}>{label}</TableCell>))}</TableRow></TableHead>
    <TableBody>{data.days.flatMap(day => {
      const periods = periodsByDay[day] || [];
      const windows = view === "compare" ? [periods] : periods.map(period => [period]);
      return windows.flatMap((window, index) => entities.map(entity => <TableRow key={`${day}:${index}:${entity.entity_id}`} sx={{ "&:nth-of-type(even)": { bgcolor: "#F1F5F9" } }}>
        <TableCell sx={dateCell}>{day}{view === "event" && <Typography sx={{ fontSize: 10 }}>Event {window[0]?.event}</Typography>}</TableCell>
        {layout === "all" && <TableCell sx={entityCell}>{entity.entity}</TableCell>}
        {Array.from({ length: view === "compare" ? maxEvents : 1 }, (_, at) => values(lookup.get(`${entity.entity_id}:${window[at]?.id}`), level).map((value, column) => <TableCell key={`${at}:${column}`} sx={{ whiteSpace: "nowrap", borderLeft: column === 0 ? "2px solid #CBD5E1" : undefined }}>{metricValue(value)}</TableCell>))}
      </TableRow>));
    })}{!entities.length && <TableRow><TableCell colSpan={2 + metrics.length * maxEvents}>No classified {group} entities in this dataset.</TableCell></TableRow>}</TableBody>
  </Table></TableContainer>;
  return <Box sx={{ mt: 2 }}>
    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
      <TextField select size="small" label="Statistics" value={view} onChange={event => { setView(event.target.value); setDayPage(0); }}><MenuItem value="compare">Daily events side by side</MenuItem><MenuItem value="day">Day-wise totals</MenuItem><MenuItem value="event">Event-wise rows</MenuItem><MenuItem value="monthly">Monthly totals</MenuItem></TextField>
      <TextField select size="small" label="Tables" value={layout} onChange={event => setLayout(event.target.value)}><MenuItem value="all">All {group} together</MenuItem><MenuItem value="separate">Separate table per {group === "State" ? "State" : "plant / stage"}</MenuItem></TextField>
      <TextField select size="small" label="Threshold" value={level} onChange={event => setLevel(event.target.value)}><MenuItem value="all">All thresholds in same row</MenuItem>{levels.map(item => <MenuItem key={item} value={item}>Frequency {result.event_type === "high" ? ">" : "<"}{item} Hz</MenuItem>)}</TextField>
    </Stack>
    {error && <Alert severity="error">{error}</Alert>}
    {loading ? <CircularProgress size={22} /> : data && <>
      <Typography sx={{ color: "#64748B", fontSize: 11, mb: 1 }}>{data.note} Average MW is the signed duration-weighted average within the selected threshold.</Typography>
      {view === "day" && <><Typography sx={{ fontWeight: 850, mb: 1 }}>Day-wise frequency statistics — selected periods</Typography><TableContainer sx={{ mb: 2 }}><Table size="small"><TableHead><TableRow>{["Date", "Minimum Hz", "At (IST)", "Covered min", ...levels.map(item => `${sign}${item} min (% selected)`), `Longest ${sign}${levels[0]} spell (IST)`, `15-min mean ${sign}${levels[0]} (%)`].map(label => <TableCell key={label} sx={head}>{label}</TableCell>)}</TableRow></TableHead><TableBody>{data.periods.map(period => <TableRow key={period.id}><TableCell>{period.date}</TableCell><TableCell>{frequencyValue(period.summary?.minimum_frequency)}</TableCell><TableCell>{time(period.summary?.minimum_timestamp)}</TableCell><TableCell>{metricValue(period.summary?.covered_frequency_minutes)}</TableCell>{levels.map(item => <TableCell key={item}>{`${metricValue(period.summary?.thresholds[item].frequency_minutes)} (${metricValue(period.summary?.thresholds[item].selected_time_pct)}%)`}</TableCell>)}<TableCell>{period.summary?.thresholds[levels[0]].longest_start ? `${time(period.summary.thresholds[levels[0]].longest_start)}–${time(period.summary.thresholds[levels[0]].longest_end)} (${metricValue(period.summary.thresholds[levels[0]].longest_minutes)} min)` : "—"}</TableCell><TableCell>{metricValue(period.summary?.thresholds[levels[0]].block_mean_below_pct)}</TableCell></TableRow>)}</TableBody></Table></TableContainer></>}
      {layout === "separate" ? data.entities.map(entity => <Box key={entity.entity_id}><Typography sx={{ fontWeight: 850, mb: 1 }}>{entity.entity}</Typography>{renderTable([entity])}</Box>) : renderTable(data.entities)}
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap><Button disabled={!dayPage} onClick={() => setDayPage(page => page - 1)}>Previous days</Button><Typography sx={{ fontSize: 12 }}>{data.days[0] || "—"} to {data.days.at(-1) || "—"} · {data.total_days} days</Typography><Button disabled={(dayPage + 1) * 7 >= data.total_days} onClick={() => setDayPage(page => page + 1)}>Next days</Button><Button disabled={!entityPage} onClick={() => setEntityPage(page => page - 1)}>Previous entities</Button><Typography sx={{ fontSize: 12 }}>{data.entities.length ? entityPage * 10 + 1 : 0}–{Math.min((entityPage + 1) * 10, data.total_entities)} of {data.total_entities} entities</Typography><Button disabled={(entityPage + 1) * 10 >= data.total_entities} onClick={() => setEntityPage(page => page + 1)}>Next entities</Button></Stack>
    </>}
  </Box>;
}
