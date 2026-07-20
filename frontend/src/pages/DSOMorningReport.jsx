import { useEffect, useRef, useState } from "react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { Download, FileSpreadsheet, Pencil, Trash2, Upload } from "lucide-react";
import AppShell from "../components/layout/AppShell";
import { useAuth } from "../auth/AuthContext";
import API from "../services/api";

const previousDay = () => {
  const value = new Date();
  value.setDate(value.getDate() - 1);
  value.setMinutes(value.getMinutes() - value.getTimezoneOffset());
  return value.toISOString().slice(0, 10);
};
const displayDate = (value) => (value ? value.split("-").reverse().join("-") : "—");
const show = (value, digits = 2) => (
  value === null || value === undefined || value === ""
    ? "—"
    : Number(value).toLocaleString("en-IN", { maximumFractionDigits: digits, minimumFractionDigits: digits })
);
const METRICS = [
  ["Max demand met", "max_demand", "max_demand_mw", "max_demand_time", "MW"],
  ["Min demand met", "min_demand", "min_demand_mw", "min_demand_time", "MW"],
  ["Max frequency", "max_frequency", "max_frequency_hz", "max_frequency_time", "Hz"],
  ["Min frequency", "min_frequency", "min_frequency_hz", "min_frequency_time", "Hz"],
];
const GENERATION = [
  ["All India Demand Max", "india_demand"],
  ["All India Demand Min", "india_demand_min"],
  ["Solar Generation Max", "solar"],
  ["Wind Generation Max", "wind"],
  ["Gas Generation Max", "gas"],
  ["Thermal Generation Max", "thermal"],
  ["Hydro Generation Max", "hydro"],
];
const EXCHANGES = ["BHUTAN", "NEPAL ISTS", "BANGLADESH", "NEPAL BIHAR"];

function Card({ title, children, sx = {} }) {
  return (
    <Paper elevation={0} sx={{ border: "1px solid #CFE0F6", borderRadius: 3, overflow: "hidden", bgcolor: "#fff", ...sx }}>
      {title && <Typography sx={{ px: 2, py: 1.2, bgcolor: "#EAF2FF", color: "#004DA8", fontWeight: 900 }}>{title}</Typography>}
      <Box sx={{ p: 2 }}>{children}</Box>
    </Paper>
  );
}

const tableSx = {
  width: "100%",
  borderCollapse: "collapse",
  tableLayout: "fixed",
  "& th": { bgcolor: "#EAF2FF", color: "#004DA8", fontSize: 13, fontWeight: 900, p: 1.3, border: "1px solid #C9D9EE", textAlign: "center" },
  "& td": { color: "#0F172A", fontSize: 14, p: 1.3, border: "1px solid #D7E4F6", textAlign: "center" },
  "& th, & td": { overflowWrap: "anywhere", wordBreak: "normal", whiteSpace: "normal", lineHeight: 1.35 },
  "& td:first-of-type": { textAlign: "left", fontWeight: 800 },
};

export default function DSOMorningReport() {
  const { user } = useAuth();
  const canWrite = Boolean(user?.permissions?.dso_morning_report?.write);
  const defaultSicName = [user?.name, user?.designation].filter(Boolean).join(", ");
  const reportRef = useRef(null);
  const [reportDate, setReportDate] = useState(previousDay());
  const [file, setFile] = useState(null);
  const [events, setEvents] = useState("");
  const [sicName, setSicName] = useState(defaultSicName);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [editOpen, setEditOpen] = useState(false);
  const [overwriteOpen, setOverwriteOpen] = useState(false);
  const [draft, setDraft] = useState(null);

  const load = async () => {
    try {
      const data = await API.getDsoReport("morning", reportDate);
      setReport(data.report || null);
      setEvents(data.report?.important_events || "");
      setSicName(data.report?.signoff_name || defaultSicName);
      setMessage({ type: "", text: "" });
    } catch (error) {
      setMessage({ type: "error", text: error.response?.data?.detail || error.message });
    }
  };
  useEffect(() => { load(); }, [reportDate]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!sicName && defaultSicName) setSicName(defaultSicName);
  }, [defaultSicName, sicName]);

  const executeProcess = async (overwrite = false) => {
    if (!file) {
      setMessage({ type: "warning", text: "Select the SCADA workbook first." });
      return;
    }
    setLoading(true);
    try {
      const data = await API.processDsoReport({
        reportType: "morning",
        reportDate,
        importantEvents: events,
        sicName,
        overwrite,
        file,
      });
      setReport(data.report);
      setOverwriteOpen(false);
      setMessage({ type: "success", text: "DSO Morning report processed and saved." });
    } catch (error) {
      setMessage({ type: "error", text: error.response?.data?.detail || error.message || "Processing failed." });
    } finally {
      setLoading(false);
    }
  };

  const process = () => {
    if (!file) {
      setMessage({ type: "warning", text: "Select the SCADA workbook first." });
      return;
    }
    if (report) {
      setOverwriteOpen(true);
      return;
    }
    executeProcess(false);
  };

  const deleteReport = async () => {
    if (!window.confirm(`Delete the saved DSO Morning report for ${displayDate(reportDate)}?`)) return;
    try {
      await API.deleteDsoReport("morning", reportDate);
      setReport(null);
      setFile(null);
      setMessage({ type: "success", text: "Saved Morning report deleted." });
    } catch (error) {
      setMessage({ type: "error", text: error.response?.data?.detail || error.message });
    }
  };

  const downloadImage = async () => {
    if (!reportRef.current) return;
    const canvas = await html2canvas(reportRef.current, { backgroundColor: "#F5F8FC", scale: 2, useCORS: true });
    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = `DSO_Morning_${reportDate}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadVisiblePdf = async () => {
    if (!reportRef.current) return;
    try {
      const canvas = await html2canvas(reportRef.current, { backgroundColor: "#F5F8FC", scale: 2, useCORS: true });
      const pdf = new jsPDF("landscape", "pt", "a4");
      const margin = 20;
      const pageWidth = pdf.internal.pageSize.getWidth() - margin * 2;
      const pageHeight = pdf.internal.pageSize.getHeight() - margin * 2;
      const sliceHeight = Math.max(1, Math.floor((canvas.width * pageHeight) / pageWidth));
      let offset = 0;
      let page = 0;
      while (offset < canvas.height) {
        const height = Math.min(sliceHeight, canvas.height - offset);
        const slice = document.createElement("canvas");
        slice.width = canvas.width;
        slice.height = height;
        slice.getContext("2d").drawImage(canvas, 0, offset, canvas.width, height, 0, 0, canvas.width, height);
        if (page > 0) pdf.addPage("a4", "landscape");
        const renderedHeight = (height * pageWidth) / canvas.width;
        pdf.addImage(slice.toDataURL("image/jpeg", .94), "JPEG", margin, margin, pageWidth, renderedHeight, undefined, "FAST");
        offset += height;
        page += 1;
      }
      pdf.save(`DSO_Morning_${reportDate}.pdf`);
    } catch (error) {
      setMessage({ type: "error", text: error.message || "Unable to generate the visible-page PDF." });
    }
  };

  const results = report?.morning_results || {};
  const night = results.night_shift || {};
  const psp = results.yesterday_psp || {};
  const yesterday = psp.demand_frequency || {};
  const frequency = psp.frequency_distribution || {};
  const generation = results.generation || {};
  const hvdc = results.hvdc || {};
  const exchanges = psp.international_exchange || {};

  const change = (path, value) => {
    setDraft((current) => {
      const next = structuredClone(current);
      let target = next;
      path.slice(0, -1).forEach((key) => {
        if (!target[key]) target[key] = {};
        target = target[key];
      });
      target[path[path.length - 1]] = value;
      return next;
    });
  };

  const openEditor = () => {
    setDraft({
      morning_results: structuredClone(results),
      important_events: report.important_events || "",
      signoff_regards: report.signoff_regards || "Regards",
      signoff_name: report.signoff_name || "Ashoke Kumar Basak, SIC ERLDC",
    });
    setEditOpen(true);
  };
  const save = async () => {
    try {
      const data = await API.saveDsoReport("morning", reportDate, draft);
      setReport(data.report);
      setEvents(data.report.important_events || "");
      setEditOpen(false);
      setMessage({ type: "success", text: "All morning report section changes were saved." });
    } catch (error) {
      setMessage({ type: "error", text: error.response?.data?.detail || error.message });
    }
  };

  return (
    <AppShell>
      <Box sx={{ width: "100%", minHeight: "calc(100vh - 76px)", bgcolor: "#F5F8FC", p: { xs: 1, md: 2 } }}>
        <Box className="dso-report-banner" sx={{ px: { xs: 2, md: 2.4 }, py: 1.7, mb: 2, borderRadius: 2.5, color: "#fff" }}>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 1.5 }}>
            <Box>
              <Box sx={{ display: "inline-flex", px: 1.2, py: .35, mb: .7, border: "1px solid rgba(255,255,255,.45)", borderRadius: 99, bgcolor: "rgba(255,255,255,.12)", fontSize: 10, fontWeight: 900, letterSpacing: .4 }}>↗ DSO MORNING REPORT</Box>
              <Typography sx={{ fontSize: { xs: 20, md: 23 }, lineHeight: 1.15, fontWeight: 900 }}>DSO Morning Report</Typography>
              <Typography sx={{ fontSize: 11, opacity: .9, mt: .35 }}>Yesterday PSP database with SCADA coverage through today 06:59 hrs.</Typography>
            </Box>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap justifyContent="flex-end" alignItems="center">
              <Box sx={{ textAlign: "right", mr: .5 }}>
                <Typography sx={{ fontSize: 9, fontWeight: 900, lineHeight: 1 }}>REPORT DATE</Typography>
                <Typography sx={{ fontSize: 12, fontWeight: 900 }}>{displayDate(reportDate)}</Typography>
              </Box>
              {report && <Button disabled={!canWrite} onClick={openEditor} startIcon={<Pencil size={16} />} variant="contained" sx={{ bgcolor: "#fff", color: "#0057B7", fontWeight: 900 }}>Edit Report</Button>}
              {report && <Button href={API.dsoReportExcelUrl("morning", reportDate)} startIcon={<Download size={16} />} variant="outlined" sx={{ color: "#fff", borderColor: "#fff", fontWeight: 900 }}>Download Excel</Button>}
              {report && <Button onClick={downloadVisiblePdf} startIcon={<Download size={16} />} variant="outlined" sx={{ color: "#fff", borderColor: "#fff", fontWeight: 900 }}>Download PDF</Button>}
              {report && <Button onClick={downloadImage} startIcon={<Download size={16} />} variant="outlined" sx={{ color: "#fff", borderColor: "#fff", fontWeight: 900 }}>Download Image</Button>}
              {report && <Button disabled={!canWrite} onClick={deleteReport} startIcon={<Trash2 size={16} />} variant="outlined" sx={{ color: "#fff", borderColor: "#FFD5D5", fontWeight: 900 }}>Delete</Button>}
            </Stack>
          </Box>
        </Box>

        {message.text && <Alert severity={message.type || "info"} sx={{ mb: 2 }}>{message.text}</Alert>}
        <Card sx={{ mb: 2 }}>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", xl: "210px minmax(300px,1fr) minmax(220px,.6fr) auto" }, gap: 1.5 }}>
            <TextField label="Yesterday / PSP report date" type="date" size="small" value={reportDate} onChange={(event) => setReportDate(event.target.value)} InputLabelProps={{ shrink: true }} />
            <Button disabled={!canWrite} component="label" variant="outlined" startIcon={<FileSpreadsheet size={17} />} sx={{ justifyContent: "flex-start", textTransform: "none", fontWeight: 800 }}>
              {file?.name || "Upload SCADA (yesterday 00:00 to today 06:59)"}
              <input hidden type="file" accept=".xlsx,.xlsm" onChange={(event) => setFile(event.target.files?.[0] || null)} />
            </Button>
            <TextField disabled={!canWrite} label="Name of SIC" size="small" value={sicName} onChange={(event) => setSicName(event.target.value)} helperText="Automatically populated from login" />
            <Button onClick={process} disabled={loading || !canWrite} variant="contained" startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <Upload size={16} />} sx={{ bgcolor: "#0068D9", fontWeight: 900 }}>
              {loading ? "Processing…" : "Process & Save"}
            </Button>
          </Box>
          <TextField disabled={!canWrite} label="Important Events (FTC / GD / GI / Load crash etc.)" fullWidth multiline minRows={2} sx={{ mt: 1.5 }} value={events} onChange={(event) => setEvents(event.target.value)} />
          {report?.input_summary && <Typography sx={{ mt: 1, color: "#64748B", fontSize: 11 }}>Row 3 skipped. Processed {report.input_summary.processed_rows} samples from {report.input_summary.first_timestamp} to {report.input_summary.last_timestamp}. Raw uploaded rows are not stored.</Typography>}
        </Card>

        {report && <Box ref={reportRef}>
          <Card sx={{ mb: 2 }}>
            <Typography sx={{ mb: 1.5, py: 1.1, px: 1.5, borderRadius: 2, color: "#fff", bgcolor: "#081F5C", textAlign: "center", fontSize: 17, fontWeight: 900 }}>
              Grid Report (00:00 hrs of {displayDate(reportDate)} to 07:00 hrs of {displayDate(results.today_date)})
            </Typography>
            <Box sx={{ overflowX: "auto" }}>
              <Box component="table" sx={{ ...tableSx, minWidth: { xs: 760, lg: 0 } }}>
                <thead><tr><th>Parameter</th><th>Night Shift Value</th><th>Time</th><th>During Yesterday (PSP)</th><th>Time</th><th>Unit</th></tr></thead>
                <tbody>{METRICS.map(([label, nKey, yKey, yTime, unit]) => <tr key={label}><td>{label}</td><td>{show(night[nKey]?.value, unit === "Hz" ? 3 : 0)}</td><td>{night[nKey]?.time || "—"}</td><td>{show(yesterday[yKey], unit === "Hz" ? 3 : 0)}</td><td>{yesterday[yTime] || "—"}</td><td>{unit}</td></tr>)}</tbody>
              </Box>
            </Box>
          </Card>

          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", xl: "1.15fr .85fr" }, gap: 2, mb: 2 }}>
            <Card title="Demand / Generation">
              <Box sx={{ overflowX: "auto" }}><Box component="table" sx={{ ...tableSx, minWidth: { xs: 650, xl: 0 } }}><thead><tr><th>Parameter</th><th>Today 00:00–06:59 (GW)</th><th>Time</th><th>Yesterday 00:00–23:59 (GW)</th><th>Time</th></tr></thead><tbody>
                {GENERATION.map(([label, key]) => <tr key={key}><td>{label}</td><td>{show((generation.today?.[key]?.value ?? 0) / 1000, 3)}</td><td>{generation.today?.[key]?.time || "—"}</td><td>{show((generation.yesterday?.[key]?.value ?? 0) / 1000, 3)}</td><td>{generation.yesterday?.[key]?.time || "—"}</td></tr>)}
              </tbody></Box></Box>
            </Card>
            <Card title="HVDC Details — latest value today">
              <Box sx={{ overflowX: "auto" }}><Box component="table" sx={{ ...tableSx, minWidth: { xs: 480, xl: 0 } }}><thead><tr><th>Link</th><th>MW</th><th>Time</th><th>Region</th></tr></thead><tbody>
                {Object.entries(hvdc).map(([key, item]) => <tr key={key}><td>{item.label}</td><td>{show(item.value_mw, 2)}</td><td>{item.time}</td><td>{item.region}</td></tr>)}
              </tbody></Box></Box>
            </Card>
          </Box>

          <Card title={`International Exchange During Yesterday ${displayDate(reportDate)} (Import +ve / Export -ve)`} sx={{ mb: 2 }}>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1.35fr .65fr" }, gap: 2 }}>
              <Box sx={{ overflowX: "auto" }}><Box component="table" sx={{ ...tableSx, minWidth: { xs: 520, lg: 0 } }}><thead><tr><th>Entity</th><th>Schedule (MU)</th><th>Actual (MU)</th></tr></thead><tbody>
                {EXCHANGES.map((name) => <tr key={name}><td>{name}</td><td>{show(exchanges[name]?.schedule_mu, 3)}</td><td>{show(exchanges[name]?.actual_mu, 3)}</td></tr>)}
              </tbody></Box></Box>
              <Box sx={{ overflowX: "auto" }}><Box component="table" sx={{ ...tableSx, minWidth: { xs: 300, lg: 0 } }}><thead><tr><th>Frequency band</th><th>% of time</th></tr></thead><tbody>
                <tr><td>&gt; 50.05 Hz</td><td>{show(frequency.above_50_05_pct, 2)}%</td></tr>
                <tr><td>Within band</td><td>{show(frequency.within_band_pct, 2)}%</td></tr>
                <tr><td>&lt; 49.9 Hz</td><td>{show(frequency.below_49_9_pct, 2)}%</td></tr>
              </tbody></Box></Box>
            </Box>
          </Card>
          <Card title="Important Events (FTC/GD/GI/Load crash etc.)">
            <Typography sx={{ minHeight: 55, whiteSpace: "pre-wrap", fontSize: 13 }}>{report.important_events || "NIL"}</Typography>
          </Card>
          <Box sx={{ px: 1, py: 2 }}>
            <Typography sx={{ fontSize: 14, fontWeight: 900 }}>{report.signoff_regards || "Regards"}</Typography>
            <Typography sx={{ fontSize: 14 }}>{report.signoff_name || "Ashoke Kumar Basak, SIC ERLDC"}</Typography>
          </Box>
        </Box>}
      </Box>

      <Dialog open={overwriteOpen} onClose={() => !loading && setOverwriteOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 900 }}>Overwrite saved Morning report?</DialogTitle>
        <DialogContent dividers>
          <Typography>A report is already saved for {displayDate(reportDate)}. The new workbook will replace the older processed report.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOverwriteOpen(false)} disabled={loading}>Cancel</Button>
          <Button onClick={() => executeProcess(true)} disabled={loading} variant="contained" color="warning">
            {loading ? "Overwriting…" : "Overwrite Report"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="lg" fullWidth>
        <DialogTitle sx={{ fontWeight: 900 }}>Edit All Morning Report Sections</DialogTitle>
        <DialogContent dividers>
          {draft && <Stack spacing={2}>
            <Typography sx={{ color: "#0057B7", fontWeight: 900 }}>Night shift and yesterday PSP values</Typography>
            {METRICS.map(([label, nKey, yKey, yTime]) => <Box key={label} sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1.5fr repeat(4,1fr)" }, gap: 1 }}><Typography sx={{ alignSelf: "center", fontWeight: 800 }}>{label}</Typography><TextField label="Night value" size="small" value={draft.morning_results.night_shift?.[nKey]?.value ?? ""} onChange={(e) => change(["morning_results", "night_shift", nKey, "value"], e.target.value)} /><TextField label="Night time" size="small" value={draft.morning_results.night_shift?.[nKey]?.time ?? ""} onChange={(e) => change(["morning_results", "night_shift", nKey, "time"], e.target.value)} /><TextField label="PSP value" size="small" value={draft.morning_results.yesterday_psp?.demand_frequency?.[yKey] ?? ""} onChange={(e) => change(["morning_results", "yesterday_psp", "demand_frequency", yKey], e.target.value)} /><TextField label="PSP time" size="small" value={draft.morning_results.yesterday_psp?.demand_frequency?.[yTime] ?? ""} onChange={(e) => change(["morning_results", "yesterday_psp", "demand_frequency", yTime], e.target.value)} /></Box>)}
            <Typography sx={{ color: "#0057B7", fontWeight: 900 }}>Frequency distribution</Typography>
            <Stack direction={{ xs: "column", md: "row" }} spacing={1}>{[["Above 50.05 %", "above_50_05_pct"], ["Within band %", "within_band_pct"], ["Below 49.9 %", "below_49_9_pct"]].map(([label, key]) => <TextField key={key} fullWidth label={label} size="small" value={draft.morning_results.yesterday_psp?.frequency_distribution?.[key] ?? ""} onChange={(e) => change(["morning_results", "yesterday_psp", "frequency_distribution", key], e.target.value)} />)}</Stack>
            <Typography sx={{ color: "#0057B7", fontWeight: 900 }}>Demand / generation</Typography>
            {GENERATION.map(([label, key]) => <Box key={key} sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1.5fr repeat(4,1fr)" }, gap: 1 }}><Typography sx={{ alignSelf: "center", fontWeight: 800 }}>{label}</Typography>{["today", "yesterday"].flatMap((period) => [<TextField key={`${period}-value`} label={`${period} value (MW)`} size="small" value={draft.morning_results.generation?.[period]?.[key]?.value ?? ""} onChange={(e) => change(["morning_results", "generation", period, key, "value"], e.target.value)} />, <TextField key={`${period}-time`} label={`${period} time`} size="small" value={draft.morning_results.generation?.[period]?.[key]?.time ?? ""} onChange={(e) => change(["morning_results", "generation", period, key, "time"], e.target.value)} />])}</Box>)}
            <Typography sx={{ color: "#0057B7", fontWeight: 900 }}>HVDC and international exchange</Typography>
            {Object.entries(draft.morning_results.hvdc || {}).map(([key, item]) => <Box key={key} sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "2fr repeat(3,1fr)" }, gap: 1 }}><TextField label="Link" size="small" value={item.label ?? ""} onChange={(e) => change(["morning_results", "hvdc", key, "label"], e.target.value)} /><TextField label="MW" size="small" value={item.value_mw ?? ""} onChange={(e) => change(["morning_results", "hvdc", key, "value_mw"], e.target.value)} /><TextField label="Time" size="small" value={item.time ?? ""} onChange={(e) => change(["morning_results", "hvdc", key, "time"], e.target.value)} /><TextField label="Region" size="small" value={item.region ?? ""} onChange={(e) => change(["morning_results", "hvdc", key, "region"], e.target.value)} /></Box>)}
            {EXCHANGES.map((name) => <Box key={name} sx={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr", gap: 1 }}><Typography sx={{ alignSelf: "center", fontWeight: 800 }}>{name}</Typography><TextField label="Schedule MU" size="small" value={draft.morning_results.yesterday_psp?.international_exchange?.[name]?.schedule_mu ?? ""} onChange={(e) => change(["morning_results", "yesterday_psp", "international_exchange", name, "schedule_mu"], e.target.value)} /><TextField label="Actual MU" size="small" value={draft.morning_results.yesterday_psp?.international_exchange?.[name]?.actual_mu ?? ""} onChange={(e) => change(["morning_results", "yesterday_psp", "international_exchange", name, "actual_mu"], e.target.value)} /></Box>)}
            <TextField label="Important Events" multiline minRows={3} value={draft.important_events} onChange={(e) => change(["important_events"], e.target.value)} />
            <Stack direction={{ xs: "column", md: "row" }} spacing={1}><TextField fullWidth label="Regards / closing text" value={draft.signoff_regards} onChange={(e) => change(["signoff_regards"], e.target.value)} /><TextField fullWidth label="Name of SIC and designation" value={draft.signoff_name} onChange={(e) => change(["signoff_name"], e.target.value)} /></Stack>
          </Stack>}
        </DialogContent>
        <DialogActions><Button onClick={() => setEditOpen(false)}>Cancel</Button><Button onClick={save} variant="contained" sx={{ bgcolor: "#0068D9", fontWeight: 900 }}>Save All Sections</Button></DialogActions>
      </Dialog>
    </AppShell>
  );
}
