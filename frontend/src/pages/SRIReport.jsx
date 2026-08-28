import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { Download, FileSpreadsheet, Pencil, RefreshCw, RotateCcw, Save } from "lucide-react";
import { CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from "recharts";
import AppShell from "../components/layout/AppShell";
import { useAuth } from "../auth/AuthContext";
import API from "../services/api";

const STATES = ["BIHAR", "JHARKHAND", "DVC", "ODISHA", "WB", "SIKKIM"];
const STATE_LABELS = { BIHAR: "Bihar", JHARKHAND: "Jharkhand", DVC: "DVC", ODISHA: "Odisha", WB: "West Bengal", SIKKIM: "Sikkim" };
const yesterday = () => {
  const value = new Date();
  value.setDate(value.getDate() - 1);
  value.setMinutes(value.getMinutes() - value.getTimezoneOffset());
  return value.toISOString().slice(0, 10);
};
const numeric = (value, digits = 2) => value === null || value === undefined || value === "" ? "—" : Number(value).toLocaleString("en-IN", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const hoursText = (value) => {
  const minutes = Math.round(Number(value || 0) * 60);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
};
const hoursNumber = (value) => {
  const match = String(value || "").trim().match(/^(\d{1,3}):([0-5]\d)$/);
  return match ? Number(match[1]) + Number(match[2]) / 60 : null;
};
const messageOf = (error) => error?.response?.data?.detail || error?.message || "Unable to process the SRI report.";

function Metric({ label, value, detail, tone = "#0057B7" }) {
  return <Paper elevation={0} sx={{ p: 1.6, borderRadius: 3, border: "1px solid #D9E7F5", background: "#FFFFFF" }}>
    <Typography sx={{ fontSize: 11, color: "#64748B", fontWeight: 850 }}>{label}</Typography>
    <Typography sx={{ mt: .35, color: tone, fontSize: 23, fontWeight: 950 }}>{value}</Typography>
    <Typography sx={{ mt: .25, color: "#64748B", fontSize: 10.5 }}>{detail}</Typography>
  </Paper>;
}

function GridTable({ headers, rows, minWidth = 900 }) {
  return <Box sx={{ overflowX: "auto" }}><Box component="table" sx={{ width: "100%", minWidth, borderCollapse: "collapse", "& th,& td": { border: "1px solid #D7E1EC", p: 1, fontSize: 11.5, textAlign: "left" }, "& th": { color: "#17365D", background: "#EEF4FA", fontWeight: 950 } }}>
    <thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead>
    <tbody>{rows}</tbody>
  </Box></Box>;
}

function ReportPage({ kind, section, title, canWrite, editing, onChange }) {
  const intro = kind === "TTC"
    ? "In case of violation of TTC, regional entities in the importing/exporting control area shall restrict drawal or injection so that TTC is maintained within limit and SLDCs shall take appropriate action."
    : "In case of violation of ATC, regional entities in the importing/exporting control area shall restrict drawal or injection so that ATC is maintained within limit and SLDCs shall take appropriate action.";
  return <Paper elevation={0} sx={{ overflow: "hidden", borderRadius: 3, border: "1px solid #BBD4EA", background: "#FFFFFF" }}>
    <Box sx={{ p: 2, textAlign: "center", background: "linear-gradient(180deg,#EEF6FD,#FFFFFF)", borderBottom: "1px solid #BBD4EA" }}>
      <Typography sx={{ color: "#17365D", fontSize: 15, fontWeight: 950 }}>GRID CONTROLLER OF INDIA LIMITED</Typography>
      <Typography sx={{ color: "#334155", fontSize: 10.5, fontWeight: 750 }}>(A Government of India Enterprise)</Typography>
      <Typography sx={{ color: "#17365D", fontSize: 12, fontWeight: 900 }}>EASTERN REGIONAL LOAD DESPATCH CENTRE, KOLKATA</Typography>
      <Typography sx={{ mt: 1, color: "#0F172A", fontSize: 13, fontWeight: 950 }}>{title}</Typography>
      <Typography sx={{ mt: .35, color: "#0F172A", fontSize: 14, fontWeight: 950 }}>Reporting of {kind} Violation</Typography>
    </Box>
    <Box sx={{ overflowX: "auto" }}>
      <Box component="table" sx={{ width: "100%", minWidth: 940, borderCollapse: "collapse", "& th,& td": { border: "1px solid #BBD4EA", p: 1, textAlign: "center", fontSize: 12 }, "& th": { background: "#D9EAF7", color: "#17365D", fontWeight: 950 } }}>
        <thead><tr><th>Sl No.</th><th>Intra-Regional Corridor</th><th>Import / Export</th><th>{kind} Limit (MW)</th><th>Total Hours of {kind} Violation</th><th>Percentage Time of {kind} Violation</th><th>Intimation for Corrective Action</th></tr></thead>
        <tbody>{(section?.rows || []).map((row, index) => <tr key={row.state} style={{ background: Number(row.violation_hours) > 0 ? "#FFF5F5" : "#FFFFFF" }}>
          <td>{index + 1}</td><td style={{ fontWeight: 850 }}>{row.corridor}</td><td>{row.direction}</td><td>{numeric(row.limit_mw, 0)}</td>
          <td>{editing && canWrite ? <TextField size="small" type="number" value={row.violation_hours} onChange={(event) => onChange(kind, row.state, "violation_hours", event.target.value)} inputProps={{ min: 0, step: .01 }} sx={{ width: 105 }} /> : <><b>{numeric(row.violation_hours)}</b><Typography sx={{ fontSize: 9.5, color: "#64748B" }}>{hoursText(row.violation_hours)} HH:MM</Typography></>}</td>
          <td>{editing && canWrite ? <TextField size="small" type="number" value={row.violation_percent} onChange={(event) => onChange(kind, row.state, "violation_percent", event.target.value)} inputProps={{ min: 0, max: 100, step: .01 }} sx={{ width: 105 }} /> : <b>{numeric(row.violation_percent)}%</b>}</td>
          <td>{editing && canWrite ? <TextField size="small" value={row.intimation} onChange={(event) => onChange(kind, row.state, "intimation", event.target.value)} sx={{ minWidth: 175 }} /> : <Chip size="small" label={row.intimation || "NA"} sx={{ fontWeight: 850, background: Number(row.violation_hours) > 0 ? "#FEE2E2" : "#DCFCE7", color: Number(row.violation_hours) > 0 ? "#991B1B" : "#166534" }} />}</td>
        </tr>)}</tbody>
      </Box>
    </Box>
    <Box sx={{ p: 1.6, borderTop: "1px solid #BBD4EA", background: "#FBFDFF" }}>
      {editing && canWrite ? <TextField fullWidth multiline minRows={2} label="Corrective actions required" value={section?.corrective_action || ""} onChange={(event) => onChange(kind, null, "corrective_action", event.target.value)} /> : <Typography sx={{ color: "#9C0006", fontSize: 12, fontWeight: 900 }}>{section?.corrective_action}</Typography>}
      <Typography sx={{ mt: 1, color: "#475569", fontSize: 10.5, lineHeight: 1.55 }}>{intro}</Typography>
    </Box>
  </Paper>;
}

function TemplateReportPage({ kind, section, title, canWrite, editing, onChange }) {
  const hindiKind = kind === "TTC" ? "टीटीसी" : "एटीसी";
  const hindiNote = `${hindiKind} के उल्लंघन के मामले में, क्षेत्रीय संस्थाएं (आईएसजीएस, डिस्कोम आदि) जो आयात नियंत्रण क्षेत्र में अधिक ड्राइंग या कम इंजेक्शन और निर्यात नियंत्रण क्षेत्र कम ड्राइंग या अधिक इंजेक्शन कर रहे हैं, वो ड्रॉल या इंजेक्शन को सीमित करें ताकि ${hindiKind} को सीमा के भीतर बनाए रखा जाये और एसएलडीसी उचित कार्रवाई करे।`;
  const englishNote = `In case of violation of ${kind}, the regional entities (ISGSs, DISCOMs etc) who are over drawing or under injecting in the importing control area and under drawing or over injecting in the exporting control area, restrict their drawal or injection so that ${kind} can be maintained within the limit and SLDCs will take appropriate action.`;
  return <Paper elevation={0} sx={{ overflow: "hidden", borderRadius: 2, border: "1px solid #111827", background: "#FFFFFF" }}>
    <Box sx={{ p: 2, textAlign: "center", minHeight: 150, display: "grid", placeContent: "center" }}>
      <Typography sx={{ fontSize: 15, fontWeight: 950 }}>ग्रिड कंट्रोलर ऑफ इंडिया लिमिटेड</Typography>
      <Typography sx={{ fontSize: 11, fontWeight: 800 }}>(भारत सरकार का एक उद्यम)</Typography>
      <Typography sx={{ fontSize: 13, fontWeight: 900 }}>पूर्वी क्षेत्रीय भार प्रेषण केन्द्र</Typography>
      <Typography sx={{ mt: .7, fontSize: 15, fontWeight: 950 }}>GRID CONTROLLER OF INDIA LIMITED</Typography>
      <Typography sx={{ fontSize: 11, fontWeight: 800 }}>(A Government of India Enterprise)</Typography>
      <Typography sx={{ fontSize: 13, fontWeight: 900 }}>EASTERN REGIONAL LOAD DESPATCH CENTRE, KOLKATA</Typography>
    </Box>
    <Typography sx={{ border: "1px solid #111827", py: .55, textAlign: "center", fontSize: 12, fontWeight: 850 }}>{title}</Typography>
    <Typography sx={{ border: "1px solid #111827", py: .65, textAlign: "center", fontSize: 13, fontWeight: 950 }}>{hindiKind} उल्लंघन की रिपोर्टिंग/ Reporting of {kind} Violation</Typography>
    <Box sx={{ overflowX: "auto" }}>
      <Box component="table" sx={{ width: "100%", minWidth: 960, borderCollapse: "collapse", "& th,& td": { border: "1px solid #111827", p: .8, textAlign: "center", fontSize: 11 }, "& th": { fontWeight: 950, lineHeight: 1.35 } }}>
        <thead><tr>
          <th>क्र. सं /<br />Sl No.</th><th>अंतर-क्षेत्रीय कोरिडोर<br />/Intra-Regional Corridor</th><th>आयात /<br />Import</th>
          <th>कुल घंटे की संख्या जिसके दौरान {hindiKind} उल्लंघन हुया / Total No. of Hours during which {kind} violation observed<br />घंटे में / In Hrs</th>
          <th>प्रतिशत मे {hindiKind} उल्लंघन का समय / Percentage of time {kind} violation observed<br />% में / In %</th>
          <th>सुधारात्मक कार्रवाई के लिए ऊटिलिटीस को सुचनाये दी गयी या नहीं / Intimation to Utilities for Corrective action or not</th>
        </tr></thead>
        <tbody>{(section?.rows || []).map((row, index) => <tr key={row.state} style={{ background: Number(row.violation_hours) > 0 ? "#FFF1F2" : "#FFFFFF" }}>
          <td>{index + 1}</td><td style={{ fontWeight: 850 }}>{row.corridor}</td><td>{kind}</td>
          <td>{editing && canWrite ? <TextField size="small" value={row.violation_hours_text ?? hoursText(row.violation_hours)} onChange={(event) => onChange(kind, row.state, "violation_hours_text", event.target.value)} placeholder="HH:MM" helperText="HH:MM" inputProps={{ inputMode: "numeric" }} sx={{ width: 112 }} /> : <b>{hoursText(row.violation_hours)}</b>}</td>
          <td>{editing && canWrite ? <TextField size="small" type="number" value={row.violation_percent} onChange={(event) => onChange(kind, row.state, "violation_percent", event.target.value)} inputProps={{ min: 0, max: 100, step: .01 }} sx={{ width: 105 }} /> : `${numeric(row.violation_percent)}%`}</td>
          <td>{editing && canWrite ? <TextField size="small" value={row.intimation} onChange={(event) => onChange(kind, row.state, "intimation", event.target.value)} sx={{ minWidth: 175 }} /> : row.intimation || "NA"}</td>
        </tr>)}</tbody>
      </Box>
    </Box>
    <Box sx={{ p: 1, border: "1px solid #111827" }}>{editing && canWrite ? <TextField fullWidth multiline minRows={2} label="Corrective actions required" value={section?.corrective_action || ""} onChange={(event) => onChange(kind, null, "corrective_action", event.target.value)} /> : <Typography sx={{ fontSize: 11 }}>{section?.corrective_action}</Typography>}</Box>
    <Typography sx={{ p: 1, border: "1px solid #111827", fontSize: 10.5, lineHeight: 1.45 }}>{hindiNote}</Typography>
    <Typography sx={{ p: 1, border: "1px solid #111827", fontSize: 10.5, lineHeight: 1.45 }}>{englishNote}</Typography>
  </Paper>;
}

export default function SRIReport() {
  const { user } = useAuth();
  const canWrite = Boolean(user?.permissions?.sri_report?.write);
  const [reportDate, setReportDate] = useState(yesterday());
  const [report, setReport] = useState(null);
  const [view, setView] = useState("report");
  const [selectedState, setSelectedState] = useState("BIHAR");
  const [editing, setEditing] = useState(false);
  const [masterOpen, setMasterOpen] = useState(false);
  const [limits, setLimits] = useState(Object.fromEntries(STATES.map((state) => [state, { ttc: "", atc: "" }])));
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  const load = async () => {
    setLoading(true); setMessage(null);
    try {
      const result = await API.getSriReport(reportDate);
      setReport(result.report || null); setLimits(result.report?.limits || Object.fromEntries(STATES.map((state) => [state, { ttc: "", atc: "" }]))); setEditing(false); setDirty(false);
    } catch (error) {
      setReport(null); setMessage({ severity: "error", text: messageOf(error) });
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [reportDate]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (kind, state, field, value) => {
    setReport((current) => {
      const next = structuredClone(current);
      if (state) {
        const row = next.sections[kind].rows.find((item) => item.state === state);
        if (field === "violation_hours_text") {
          row.violation_hours_text = value;
          const parsed = hoursNumber(value);
          if (parsed !== null) row.violation_hours = parsed;
        } else row[field] = value;
      } else next.sections[kind][field] = value;
      return next;
    });
    setDirty(true);
  };

  const saveMaster = async () => {
    setLoading(true); setMessage(null);
    try {
      const result = await API.saveDsoMaster(limits);
      setLimits(result.limits || limits);
      const refreshed = await API.getSriReport(reportDate);
      setReport(refreshed.report || null); setMasterOpen(false); setEditing(false); setDirty(false);
      setMessage({ severity: "success", text: "TTC/ATC master saved. The DSO and SRI reports now use these same database values." });
    } catch (error) { setMessage({ severity: "error", text: messageOf(error) }); }
    finally { setLoading(false); }
  };

  const save = async () => {
    const invalidDuration = ["TTC", "ATC"].some((kind) => report.sections[kind].rows.some((row) => row.violation_hours_text !== undefined && hoursNumber(row.violation_hours_text) === null));
    if (invalidDuration) { setMessage({ severity: "error", text: "Enter every violation duration in HH:MM format, for example 00:04 or 24:00." }); return; }
    setLoading(true); setMessage(null);
    try {
      const result = await API.saveSriReport(reportDate, report.sections);
      setReport(result.report); setEditing(false); setDirty(false);
      setMessage({ severity: "success", text: "SRI report edits saved." });
    } catch (error) { setMessage({ severity: "error", text: messageOf(error) }); }
    finally { setLoading(false); }
  };

  const reset = async () => {
    if (!window.confirm("Remove saved edits and restore calculated SRI values?")) return;
    setLoading(true);
    try {
      const result = await API.resetSriReport(reportDate); setReport(result.report); setEditing(false); setDirty(false);
      setMessage({ severity: "success", text: "Calculated SRI values restored." });
    } catch (error) { setMessage({ severity: "error", text: messageOf(error) }); }
    finally { setLoading(false); }
  };

  const download = async (format) => {
    const invalidDuration = report && ["TTC", "ATC"].some((kind) => report.sections[kind].rows.some((row) => row.violation_hours_text !== undefined && hoursNumber(row.violation_hours_text) === null));
    if (invalidDuration) { setMessage({ severity: "error", text: "Correct the violation duration to HH:MM before downloading." }); return; }
    setLoading(true); setMessage(null);
    try {
      if (dirty && canWrite) await API.saveSriReport(reportDate, report.sections);
      const blob = await API.downloadSriReport(reportDate, format);
      const url = URL.createObjectURL(blob); const link = document.createElement("a");
      link.href = url; link.download = `SRI ${reportDate.split("-").reverse().join("")}.${format}`;
      document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
      if (dirty) { setDirty(false); setEditing(false); }
    } catch (error) { setMessage({ severity: "error", text: messageOf(error) }); }
    finally { setLoading(false); }
  };

  const chartData = useMemo(() => (report?.plots?.[selectedState] || []).map((item) => ({
    ...item,
    time: item.timestamp?.slice(11, 16),
    ttc_violation_actual: item.ttc_violation ? item.actual_mw : null,
    atc_violation_actual: item.atc_violation ? item.actual_mw : null,
  })), [report, selectedState]);
  const totalViolations = (kind) => (report?.sections?.[kind]?.rows || []).reduce((sum, row) => sum + Number(row.violation_hours || 0), 0);
  const violatingStates = (kind) => (report?.sections?.[kind]?.rows || []).filter((row) => Number(row.violation_hours) > 0).length;

  return <AppShell>
    <Box sx={{ p: 2.2, borderRadius: 3, color: "#FFFFFF", background: "linear-gradient(105deg,#08103A 0%,#0057B7 65%,#0F6FDB 100%)" }}>
      <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems={{ md: "center" }} gap={2}>
        <Box><Typography sx={{ fontSize: 22, fontWeight: 950 }}>System Reliability Report (SRI)</Typography><Typography sx={{ mt: .35, opacity: .9, fontSize: 12 }}>State actual drawal against database TTC and ATC limits · separate TTC and ATC report pages</Typography></Box>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Button startIcon={<RefreshCw size={15} />} onClick={load} disabled={loading} sx={{ color: "#FFFFFF", border: "1px solid rgba(255,255,255,.6)" }}>Refresh</Button>
          <Button startIcon={<Pencil size={15} />} onClick={() => setEditing(true)} disabled={!canWrite || !report || loading} sx={{ color: "#FFFFFF", border: "1px solid rgba(255,255,255,.6)" }}>Edit</Button>
          <Button startIcon={<Save size={15} />} onClick={save} disabled={!canWrite || !dirty || loading} variant="contained" sx={{ background: "#16A34A" }}>Save</Button>
        </Stack>
      </Stack>
    </Box>

    <Paper elevation={0} sx={{ p: 1.5, borderRadius: 3 }}>
      <Stack direction={{ xs: "column", md: "row" }} spacing={1.2} alignItems={{ md: "center" }}>
        <TextField size="small" type="date" label="Report date" value={reportDate} onChange={(event) => setReportDate(event.target.value)} InputLabelProps={{ shrink: true }} />
        <Button variant="contained" onClick={load} disabled={loading}>Generate report</Button>
        <Button startIcon={<Download size={15} />} variant="outlined" onClick={() => download("pdf")} disabled={!report || loading}>Download PDF</Button>
        <Button startIcon={<FileSpreadsheet size={15} />} variant="outlined" color="success" onClick={() => download("xlsx")} disabled={!report || loading}>Download Excel</Button>
        <Button variant="outlined" onClick={() => setMasterOpen((current) => !current)} disabled={!canWrite || loading}>TTC/ATC Master</Button>
        {report?.has_saved_edits && <Button startIcon={<RotateCcw size={15} />} color="warning" onClick={reset} disabled={!canWrite || loading}>Restore calculated</Button>}
        {loading && <CircularProgress size={22} />}
      </Stack>
      {report && <Typography sx={{ mt: 1, fontSize: 10.5, color: "#64748B", overflowWrap: "anywhere" }}>Source: {report.source_file} · {report.sample_count} samples · {report.sample_interval_minutes} minute interval · {report.has_saved_edits ? "saved edits applied" : "calculated values"}</Typography>}
    </Paper>

    {masterOpen && <Paper elevation={0} sx={{ p: 1.7, borderRadius: 3, border: "1px solid #BBD4EA" }}>
      <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" gap={1} sx={{ mb: 1.4 }}><Box><Typography sx={{ fontSize: 16, fontWeight: 950 }}>TTC / ATC Limit Master</Typography><Typography sx={{ fontSize: 10.5, color: "#64748B" }}>+ve value: Import · −ve value: Export. This is the same database master used by the DSO report.</Typography></Box><Stack direction="row" spacing={1}><Button onClick={() => setMasterOpen(false)}>Cancel</Button><Button variant="contained" startIcon={<Save size={15} />} onClick={saveMaster} disabled={loading}>Save master</Button></Stack></Stack>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2,1fr)", lg: "repeat(3,1fr)" }, gap: 1.2 }}>
        {STATES.map((state) => <Paper key={state} variant="outlined" sx={{ p: 1.3, borderRadius: 2 }}><Typography sx={{ mb: 1, fontWeight: 950, color: "#0057B7" }}>{STATE_LABELS[state]}</Typography><Stack direction="row" spacing={1}>{["ttc", "atc"].map((kind) => <TextField key={kind} size="small" type="number" label={`${kind.toUpperCase()} Limit (MW)`} value={limits[state]?.[kind] ?? ""} onChange={(event) => setLimits((current) => ({ ...current, [state]: { ...current[state], [kind]: event.target.value } }))} />)}</Stack></Paper>)}
      </Box>
    </Paper>}

    {message && <Alert severity={message.severity} onClose={() => setMessage(null)}>{message.text}</Alert>}
    {report && <>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2,1fr)", md: "repeat(4,1fr)" }, gap: 1.4 }}>
        <Metric label="TTC violation time" value={hoursText(totalViolations("TTC"))} detail={`${violatingStates("TTC")} state(s) with violation · HH:MM`} tone="#B42318" />
        <Metric label="ATC violation time" value={hoursText(totalViolations("ATC"))} detail={`${violatingStates("ATC")} state(s) with violation · HH:MM`} tone="#C2410C" />
        <Metric label="Daily samples" value={report.sample_count} detail={`${report.coverage_start?.slice(11)} to ${report.coverage_end?.slice(11)}`} />
        <Metric label="Limit source" value="Database" detail="DSO TTC/ATC master" tone="#166534" />
      </Box>

      <Paper elevation={0} sx={{ borderRadius: 3, overflow: "hidden" }}><Tabs value={view} onChange={(_, value) => setView(value)} variant="scrollable" scrollButtons="auto"><Tab value="plots" label="Trend" /><Tab value="violations" label="Violation report" /><Tab value="schedule" label="Capability schedule" /><Tab value="quality" label="Data quality" /><Tab value="report" label="Excel / PDF format" /></Tabs></Paper>

      {view === "report" && <Stack spacing={2}>
        {editing && <Alert severity="info">Edit violation hours, percentage, intimation and corrective-action text. PDF/Excel downloads automatically save pending edits.</Alert>}
        <TemplateReportPage kind="TTC" section={report.sections.TTC} title={report.title} canWrite={canWrite} editing={editing} onChange={update} />
        <TemplateReportPage kind="ATC" section={report.sections.ATC} title={report.title} canWrite={canWrite} editing={editing} onChange={update} />
      </Stack>}

      {view === "plots" && <Stack spacing={2}>
        <Paper elevation={0} sx={{ p: 1.5, borderRadius: 3 }}><TextField select size="small" label="State" value={selectedState} onChange={(event) => setSelectedState(event.target.value)} sx={{ minWidth: 220 }}>{STATES.map((state) => <MenuItem key={state} value={state}>{STATE_LABELS[state]}</MenuItem>)}</TextField></Paper>
        <Paper elevation={0} sx={{ p: 2, borderRadius: 3, border: "1px solid #D9E7F5" }}>
          <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" gap={1}><Box><Typography sx={{ fontSize: 16, fontWeight: 950 }}>{STATE_LABELS[selectedState]} actual drawal vs TTC and ATC</Typography><Typography sx={{ fontSize: 11, color: "#64748B" }}>Positive values indicate import; negative values indicate export. Violation samples are marked separately for TTC and ATC.</Typography></Box><Chip label={`${chartData.filter((item) => item.ttc_violation || item.atc_violation).length} violation sample(s)`} color={chartData.some((item) => item.ttc_violation || item.atc_violation) ? "error" : "success"} size="small" /></Stack>
          <Box sx={{ width: "100%", height: 430, mt: 2 }}><ResponsiveContainer><ComposedChart data={chartData} margin={{ left: 8, right: 18, top: 10, bottom: 8 }}><CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" /><XAxis dataKey="time" minTickGap={55} /><YAxis width={72} tickFormatter={(value) => Number(value).toLocaleString("en-IN")} /><Tooltip formatter={(value, name) => [numeric(value), name]} labelFormatter={(value) => `Time ${value}`} /><Legend /><Line type="monotone" dataKey="actual_mw" name="Actual drawal (MW)" stroke="#2563EB" strokeWidth={1.6} dot={false} isAnimationActive={false} /><Line type="stepAfter" dataKey="ttc_mw" name="TTC (MW)" stroke="#DC2626" strokeWidth={2} strokeDasharray="8 4" dot={false} isAnimationActive={false} /><Line type="stepAfter" dataKey="atc_mw" name="ATC (MW)" stroke="#F59E0B" strokeWidth={2} strokeDasharray="3 3" dot={false} isAnimationActive={false} /><Scatter dataKey="ttc_violation_actual" name="TTC violation" fill="#7F1D1D" /><Scatter dataKey="atc_violation_actual" name="ATC violation" fill="#EA580C" /></ComposedChart></ResponsiveContainer></Box>
        </Paper>
      </Stack>}

      {view === "violations" && <Stack spacing={2}>
        <Paper elevation={0} sx={{ p: 1.6, borderRadius: 3 }}><Typography sx={{ mb: 1.2, fontSize: 18, fontWeight: 950 }}>State-wise violation summary</Typography><GridTable headers={["State", "TTC Time (HH:MM)", "TTC Violation (%)", "Max TTC Exceedance (MW)", "ATC Time (HH:MM)", "ATC Violation (%)", "Max ATC Exceedance (MW)", "Limit Coverage (%)"]} rows={(report.violation_summary || []).map((row) => <tr key={row.state}><td><b>{row.state_label}</b></td><td>{hoursText(row.ttc_hours)}</td><td>{numeric(row.ttc_percent)}%</td><td>{numeric(row.max_ttc_exceedance_mw, 1)}</td><td>{hoursText(row.atc_hours)}</td><td>{numeric(row.atc_percent)}%</td><td>{numeric(row.max_atc_exceedance_mw, 1)}</td><td>{numeric(row.limit_coverage_percent)}%</td></tr>)} /></Paper>
        <Paper elevation={0} sx={{ p: 1.6, borderRadius: 3 }}><Typography sx={{ mb: 1.2, fontSize: 18, fontWeight: 950 }}>Continuous violation events</Typography>{(report.violation_events || []).length ? <GridTable headers={["State", "Limit", "Direction", "Start", "End", "Peak Drawl (MW)", "Applicable Limit (MW)", "Max Exceedance (MW)", "Max Exceedance (%)", "Duration (HH:MM)"]} rows={report.violation_events.map((row, index) => <tr key={`${row.state}-${row.limit}-${row.start}-${index}`}><td><b>{row.state_label}</b></td><td>{row.limit}</td><td>{row.direction}</td><td>{row.start?.replace("T", " ")}</td><td>{row.end?.replace("T", " ")}</td><td>{numeric(row.peak_drawl_mw, 1)}</td><td>{numeric(row.applicable_limit_mw, 1)}</td><td>{numeric(row.max_exceedance_mw, 1)}</td><td>{numeric(row.max_exceedance_percent)}%</td><td>{hoursText(row.duration_hours)}</td></tr>)} minWidth={1200} /> : <Alert severity="success">No continuous TTC or ATC violation event was found.</Alert>}</Paper>
      </Stack>}

      {view === "schedule" && <Paper elevation={0} sx={{ p: 1.6, borderRadius: 3 }}><Typography sx={{ mb: 1.2, fontSize: 18, fontWeight: 950 }}>TTC / ATC schedule from database</Typography><GridTable headers={["State", "Direction", "Date", "Time Period", "TTC (MW)", "ATC (MW)", "Source"]} rows={(report.capability_schedule || []).map((row) => <tr key={row.state}><td><b>{row.state_label}</b></td><td>{row.direction}</td><td>{row.date_range}</td><td>{row.time_period}</td><td>{numeric(row.ttc_mw, 0)}</td><td>{numeric(row.atc_mw, 0)}</td><td>{row.source}</td></tr>)} /></Paper>}

      {view === "quality" && <Paper elevation={0} sx={{ p: 1.6, borderRadius: 3 }}><Typography sx={{ mb: 1.2, fontSize: 18, fontWeight: 950 }}>State drawal data quality</Typography><GridTable headers={["State", "Monitored Samples", "Missing Samples", "Coverage (%)", "Interval (minutes)", "Coverage Start", "Coverage End"]} rows={(report.data_quality || []).map((row) => <tr key={row.state}><td><b>{row.state_label}</b></td><td>{row.monitored_samples}</td><td>{row.missing_samples}</td><td>{numeric(row.coverage_percent)}%</td><td>{report.sample_interval_minutes}</td><td>{report.coverage_start?.replace("T", " ")}</td><td>{report.coverage_end?.replace("T", " ")}</td></tr>)} /></Paper>}
    </>}
  </AppShell>;
}
