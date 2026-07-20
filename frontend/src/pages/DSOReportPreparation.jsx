import { useEffect, useMemo, useRef, useState } from "react";
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
import {
  CalendarDays,
  Download,
  FileSpreadsheet,
  Pencil,
  Save,
  Settings2,
  Trash2,
  Upload,
} from "lucide-react";
import AppShell from "../components/layout/AppShell";
import { useAuth } from "../auth/AuthContext";
import API from "../services/api";

const STATES = ["BIHAR", "JHARKHAND", "DVC", "ODISHA", "WB", "SIKKIM"];
const today = () => {
  const value = new Date();
  value.setMinutes(value.getMinutes() - value.getTimezoneOffset());
  return value.toISOString().slice(0, 10);
};
const number = (value, digits = 2) => (
  value === null || value === undefined || value === ""
    ? "—"
    : Number(value).toLocaleString("en-IN", { minimumFractionDigits: digits, maximumFractionDigits: digits })
);

function Card({ children, sx = {} }) {
  return (
    <Paper elevation={0} sx={{ border: "1px solid #CFE0F6", borderRadius: 3, p: 2.2, background: "#fff", ...sx }}>
      {children}
    </Paper>
  );
}

export default function DSOReportPreparation({ reportType = "evening" }) {
  const { user } = useAuth();
  const canWrite = Boolean(user?.permissions?.dso_evening_report?.write);
  const isEvening = reportType === "evening";
  const defaultSicName = [user?.name, user?.designation].filter(Boolean).join(", ");
  const reportRef = useRef(null);
  const [reportDate, setReportDate] = useState(today());
  const [file, setFile] = useState(null);
  const [events, setEvents] = useState("");
  const [sicName, setSicName] = useState(defaultSicName);
  const [limits, setLimits] = useState(Object.fromEntries(STATES.map((state) => [state, { ttc: "", atc: "" }])));
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [masterOpen, setMasterOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editDraft, setEditDraft] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [overwriteOpen, setOverwriteOpen] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });

  const load = async () => {
    setMessage({ type: "", text: "" });
    try {
      const [masterData, reportData] = await Promise.all([
        API.getDsoMaster(),
        API.getDsoReport(reportType, reportDate),
      ]);
      if (masterData?.limits) setLimits(masterData.limits);
      setReport(reportData?.report || null);
      setEvents(reportData?.report?.important_events || "");
      setSicName(reportData?.report?.signoff_name || defaultSicName);
    } catch (error) {
      setMessage({ type: "error", text: error.response?.data?.detail || error.message || "Unable to load DSO report data." });
    }
  };

  useEffect(() => { load(); }, [reportDate, reportType]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!sicName && defaultSicName) setSicName(defaultSicName);
  }, [defaultSicName, sicName]);

  const saveMaster = async () => {
    try {
      const data = await API.saveDsoMaster(limits);
      setLimits(data.limits);
      setMasterOpen(false);
      setMessage({ type: "success", text: "TTC/ATC master limits saved." });
    } catch (error) {
      setMessage({ type: "error", text: error.response?.data?.detail || error.message });
    }
  };

  const executeProcess = async (overwrite = false) => {
    if (!file) {
      setMessage({ type: "warning", text: "Select the SCADA PC Template workbook first." });
      return;
    }
    setLoading(true);
    setMessage({ type: "", text: "" });
    try {
      const data = await API.processDsoReport({ reportType, reportDate, importantEvents: events, sicName, overwrite, file });
      setReport(data.report);
      setOverwriteOpen(false);
      setMessage({ type: "success", text: `DSO ${isEvening ? "Evening" : "Morning"} report processed and saved.` });
    } catch (error) {
      setMessage({ type: "error", text: error.response?.data?.detail || error.message || "Report processing failed." });
    } finally {
      setLoading(false);
    }
  };

  const process = () => {
    if (!file) {
      setMessage({ type: "warning", text: "Select the SCADA PC Template workbook first." });
      return;
    }
    if (report) {
      setOverwriteOpen(true);
      return;
    }
    executeProcess(false);
  };

  const deleteReport = async () => {
    if (!window.confirm(`Delete the saved DSO ${isEvening ? "Evening" : "Morning"} report for ${reportDate}?`)) return;
    try {
      await API.deleteDsoReport(reportType, reportDate);
      setReport(null);
      setFile(null);
      setMessage({ type: "success", text: "Saved report deleted." });
    } catch (error) {
      setMessage({ type: "error", text: error.response?.data?.detail || error.message });
    }
  };

  const downloadImage = async () => {
    if (!reportRef.current) return;
    const canvas = await html2canvas(reportRef.current, { backgroundColor: "#F5F8FC", scale: 2, useCORS: true });
    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = `DSO_${isEvening ? "Evening" : "Morning"}_${reportDate}.png`;
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
      pdf.save(`DSO_${isEvening ? "Evening" : "Morning"}_${reportDate}.pdf`);
    } catch (error) {
      setMessage({ type: "error", text: error.message || "Unable to generate the visible-page PDF." });
    }
  };

  const metrics = report?.results?.demand_frequency || {};
  const frequency = report?.results?.frequency_distribution || {};
  const stateRows = useMemo(() => report?.results?.states || {}, [report]);
  const thermal = report?.thermal_availability || {};
  const odItems = STATES
    .map((state) => ({ state, value: stateRows[state]?.od_at_min_frequency_mw }))
    .filter((item) => Number(item.value) > 0);
  const udItems = STATES
    .map((state) => ({ state, value: stateRows[state]?.ud_at_max_frequency_mw }))
    .filter((item) => Number(item.value) > 0);
  const tableSx = {
    width: "100%",
    borderCollapse: "collapse",
    tableLayout: "fixed",
    "& th": { bgcolor: "#EAF2FF", color: "#004DA8", fontSize: 13, fontWeight: 900, p: 1.3, border: "1px solid #C9D9EE", textAlign: "center" },
    "& td": { color: "#0F172A", fontSize: 14, p: 1.3, border: "1px solid #D7E4F6", textAlign: "center", verticalAlign: "middle" },
    "& th, & td": { overflowWrap: "anywhere", wordBreak: "normal", whiteSpace: "normal", lineHeight: 1.35 },
  };

  const defaultMajorOdText = `Freq. touched ${number(metrics.min_frequency_hz, 3)} Hz at ${metrics.min_frequency_time || "—"} Hrs, OD by states in ER: ${odItems.length ? odItems.map((item) => `${item.state} (${number(item.value, 0)} MW)`).join(", ") : "NIL"}`;
  const defaultMajorUdText = `Freq. touched ${number(metrics.max_frequency_hz, 3)} Hz at ${metrics.max_frequency_time || "—"} Hrs, UD by states in ER: ${udItems.length ? udItems.map((item) => `${item.state} (${number(item.value, 0)} MW)`).join(", ") : "NIL"}`;

  const openReportEditor = () => {
    const revivedDetails = thermal.revived_details || (thermal.units?.revived || [])
      .map((item) => `${item.unit} (${number(item.capacity_mw, 0)} MW)`)
      .join("\n");
    const outageDetails = thermal.outage_details || (thermal.units?.outage || [])
      .map((item) => `${item.unit} (${number(item.capacity_mw, 0)} MW)${item.reason ? ` [${item.reason}]` : ""}`)
      .join("\n");
    setEditDraft({
      demand_frequency: { ...metrics },
      frequency_distribution: { ...frequency },
      thermal_availability: {
        revived_capacity_mw: thermal.revived_capacity_mw ?? "",
        outage_capacity_mw: thermal.outage_capacity_mw ?? "",
        net_capacity_change_mw: thermal.net_capacity_change_mw ?? "",
        revived_details: revivedDetails,
        outage_details: outageDetails,
      },
      states: Object.fromEntries(STATES.map((state) => [state, { ...(stateRows[state] || {}) }])),
      major_od_text: report.major_od_text || defaultMajorOdText,
      major_ud_text: report.major_ud_text || defaultMajorUdText,
      important_events: report.important_events || "",
      signoff_regards: report.signoff_regards || "Regards",
      signoff_name: report.signoff_name || "Ashoke Kumar Basak, SIC ERLDC",
    });
    setEditOpen(true);
  };

  const saveReportEdit = async () => {
    setSavingEdit(true);
    try {
      const data = await API.saveDsoReport(reportType, reportDate, editDraft);
      setReport(data.report);
      setEvents(data.report?.important_events || "");
      setEditOpen(false);
      setMessage({ type: "success", text: "All report section changes were saved." });
    } catch (error) {
      setMessage({ type: "error", text: error.response?.data?.detail || error.message || "Unable to save report changes." });
    } finally {
      setSavingEdit(false);
    }
  };

  const setDraftSection = (section, key, value) => {
    setEditDraft((current) => ({ ...current, [section]: { ...current[section], [key]: value } }));
  };

  const setDraftState = (state, key, value) => {
    setEditDraft((current) => ({
      ...current,
      states: { ...current.states, [state]: { ...current.states[state], [key]: value } },
    }));
  };

  return (
    <AppShell>
      <Box sx={{ width: "100%", px: { xs: 1.5, md: 2.5 }, py: 2, background: "#F5F8FC", minHeight: "calc(100vh - 76px)" }}>
        <Box className="dso-report-banner" sx={{ px: { xs: 2, md: 2.4 }, py: 1.7, borderRadius: 2.5, color: "#fff", mb: 2 }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
            <Box>
              <Box sx={{ display: "inline-flex", px: 1.2, py: .35, mb: .7, border: "1px solid rgba(255,255,255,.45)", borderRadius: 99, bgcolor: "rgba(255,255,255,.12)", fontSize: 10, fontWeight: 900, letterSpacing: .4 }}>↗ DSO EVENING REPORT</Box>
              <Typography sx={{ fontSize: { xs: 20, md: 23 }, lineHeight: 1.15, fontWeight: 900 }}>DSO Evening Report</Typography>
              <Typography sx={{ fontSize: 11, opacity: 0.9, mt: 0.35 }}>Important ER Grid information from 00:00 hrs through 17:00 hrs.</Typography>
            </Box>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap justifyContent="flex-end" alignItems="center">
              <Box sx={{ textAlign: "right", mr: .5 }}>
                <Typography sx={{ fontSize: 9, fontWeight: 900, lineHeight: 1 }}>REPORT DATE</Typography>
                <Typography sx={{ fontSize: 12, fontWeight: 900 }}>{reportDate.split("-").reverse().join("-")}</Typography>
              </Box>
              <Button disabled={!canWrite} onClick={() => setMasterOpen(true)} startIcon={<Settings2 size={16} />} variant="contained" sx={{ bgcolor: "#fff", color: "#0057B7", fontWeight: 900, "&:hover": { bgcolor: "#EAF3FF" } }}>TTC/ATC Master</Button>
              {report && <Button disabled={!canWrite} onClick={openReportEditor} startIcon={<Pencil size={16} />} variant="contained" sx={{ bgcolor: "#fff", color: "#0057B7", fontWeight: 900, "&:hover": { bgcolor: "#EAF3FF" } }}>Edit Report</Button>}
              {report && <Button href={API.dsoReportExcelUrl(reportType, reportDate)} startIcon={<Download size={16} />} variant="outlined" sx={{ borderColor: "#fff", color: "#fff", fontWeight: 900 }}>Download Excel</Button>}
              {report && <Button onClick={downloadVisiblePdf} startIcon={<Download size={16} />} variant="outlined" sx={{ borderColor: "#fff", color: "#fff", fontWeight: 900 }}>Download PDF</Button>}
              {report && <Button onClick={downloadImage} startIcon={<Download size={16} />} variant="outlined" sx={{ borderColor: "#fff", color: "#fff", fontWeight: 900 }}>Download Image</Button>}
              {report && <Button disabled={!canWrite} onClick={deleteReport} startIcon={<Trash2 size={16} />} variant="outlined" sx={{ borderColor: "#FFD5D5", color: "#fff", fontWeight: 900 }}>Delete</Button>}
            </Stack>
          </Box>
        </Box>

        {message.text && <Alert severity={message.type || "info"} sx={{ mb: 2, borderRadius: 2.5 }}>{message.text}</Alert>}

        <Card sx={{ mb: 2 }}>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", xl: "190px minmax(280px,1fr) minmax(220px,.6fr) auto" }, gap: 1.5, alignItems: "center" }}>
            <TextField label="Report date" type="date" value={reportDate} onChange={(event) => setReportDate(event.target.value)} size="small" InputLabelProps={{ shrink: true }} />
            <Button disabled={!canWrite} component="label" variant="outlined" startIcon={<FileSpreadsheet size={18} />} sx={{ height: 40, justifyContent: "flex-start", textTransform: "none", fontWeight: 800, overflow: "hidden" }}>
              {file?.name || `Upload SCADA PC Template (${isEvening ? "00:00 to 16:59 hrs" : "report window"})`}
              <input hidden type="file" accept=".xlsx,.xlsm" onChange={(event) => setFile(event.target.files?.[0] || null)} />
            </Button>
            <TextField disabled={!canWrite} label="Name of SIC" value={sicName} onChange={(event) => setSicName(event.target.value)} size="small" helperText="Automatically populated from login" />
            <Button onClick={process} disabled={loading || !canWrite} variant="contained" startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <Upload size={17} />} sx={{ height: 40, bgcolor: "#0068D9", fontWeight: 900, px: 3 }}>
              {loading ? "Processing…" : "Process & Save"}
            </Button>
          </Box>
          <TextField disabled={!canWrite} label="Important Events (FTC / GD / GI / Load crash etc.)" value={events} onChange={(event) => setEvents(event.target.value)} multiline minRows={2} fullWidth sx={{ mt: 1.5 }} />
          {report?.input_summary && (
            <Typography sx={{ mt: 1, fontSize: 11, color: "#64748B" }}>
              Processed {report.input_summary.processed_rows} rows from “{report.input_summary.sheet}”, {report.input_summary.first_time}–{report.input_summary.last_time}. Uploaded source rows are not stored.
            </Typography>
          )}
        </Card>

        {!report ? (
          <Card><Box sx={{ py: 6, textAlign: "center" }}><CalendarDays size={34} color="#7A96B8" /><Typography sx={{ mt: 1, fontWeight: 900 }}>No processed report for this date</Typography><Typography sx={{ color: "#64748B", fontSize: 12 }}>Upload the SCADA workbook to prepare and save the report.</Typography></Box></Card>
        ) : (
          <Box ref={reportRef}>
            <Card sx={{ mb: 2 }}>
              <Typography sx={{ mb: 1.5, py: 1.1, px: 1.5, borderRadius: 2, color: "#fff", bgcolor: "#081F5C", textAlign: "center", fontSize: 17, fontWeight: 900 }}>
                Important information update for ER Grid (since 00:00 hrs to 17:00 hrs) for {reportDate.split("-").reverse().join("-")}
              </Typography>
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1.35fr .75fr" }, gap: 2 }}>
                <Box sx={{ overflowX: "auto" }}>
                  <Box component="table" sx={{ ...tableSx, minWidth: { xs: 480, lg: 0 } }}>
                    <thead><tr><th></th><th>MW/Hz</th><th>Time (Hrs)</th></tr></thead>
                    <tbody>
                      <tr><td style={{ textAlign: "left", fontWeight: 900 }}>Max demand met</td><td>{number(metrics.max_demand_mw, 0)}</td><td>{metrics.max_demand_time}</td></tr>
                      <tr><td style={{ textAlign: "left", fontWeight: 900 }}>Min demand met</td><td>{number(metrics.min_demand_mw, 0)}</td><td>{metrics.min_demand_time}</td></tr>
                      <tr><td style={{ textAlign: "left", fontWeight: 900 }}>Max freq.</td><td>{number(metrics.max_frequency_hz, 3)}</td><td>{metrics.max_frequency_time}</td></tr>
                      <tr><td style={{ textAlign: "left", fontWeight: 900 }}>Min freq.</td><td>{number(metrics.min_frequency_hz, 3)}</td><td>{metrics.min_frequency_time}</td></tr>
                    </tbody>
                  </Box>
                </Box>
                <Box sx={{ overflowX: "auto" }}>
                  <Box component="table" sx={{ ...tableSx, minWidth: { xs: 280, lg: 0 } }}>
                    <thead><tr><th>Frequency</th><th>% of time</th></tr></thead>
                    <tbody>
                      <tr><td><b>&gt;50.05</b></td><td>{number(frequency.above_50_05_pct, 2)}</td></tr>
                      <tr><td><b>within band</b></td><td>{number(frequency.within_band_pct, 2)}</td></tr>
                      <tr><td><b>&lt;49.9</b></td><td>{number(frequency.below_49_9_pct, 2)}</td></tr>
                    </tbody>
                  </Box>
                </Box>
              </Box>
            </Card>

            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", xl: ".9fr 1.1fr" }, gap: 2, mb: 2 }}>
              <Card sx={{ p: 0, overflow: "hidden" }}>
                <Typography sx={{ px: 1.7, py: 1.2, color: "#006845", bgcolor: "#E9F8F0", fontWeight: 900, textDecoration: "underline" }}>
                  Thermal generation availability change from 00:00 hrs to 17:00 hrs
                </Typography>
                <Box sx={{ overflowX: "auto", p: 1.5 }}>
                  <Box component="table" sx={{ ...tableSx, minWidth: { xs: 560, xl: 0 } }}>
                    <thead><tr><th>Revived capacity (MW)</th><th>Outage capacity (MW)</th><th>Net Capacity addition (+)/ reduction (-) (MW)</th></tr></thead>
                    <tbody>
                      <tr><td><b>{number(thermal.revived_capacity_mw, 0)}</b></td><td><b>{number(thermal.outage_capacity_mw, 0)}</b></td><td><b>{number(thermal.net_capacity_change_mw, 0)}</b></td></tr>
                      <tr>
                        <td style={{ whiteSpace: "pre-wrap" }}>{thermal.revived_details || ((thermal.units?.revived || []).length ? thermal.units.revived.map((item) => <Box key={`${item.unit}-${item.capacity_mw}`} sx={{ mb: .7 }}>{item.unit} ({number(item.capacity_mw, 0)} MW)</Box>) : "NIL")}</td>
                        <td style={{ whiteSpace: "pre-wrap" }}>{thermal.outage_details || ((thermal.units?.outage || []).length ? thermal.units.outage.map((item) => <Box key={`${item.unit}-${item.capacity_mw}`} sx={{ mb: .7 }}>{item.unit} ({number(item.capacity_mw, 0)} MW){item.reason ? ` [${item.reason}]` : ""}</Box>) : "NIL")}</td>
                        <td></td>
                      </tr>
                    </tbody>
                  </Box>
                </Box>
              </Card>

              <Card sx={{ p: 0, overflow: "hidden" }}>
                <Typography sx={{ px: 1.7, py: 1.2, color: "#081F5C", bgcolor: "#EAF2FF", textAlign: "center", fontWeight: 900 }}>
                  TTC/ATC Limit (+ve Import, -ve Export)
                </Typography>
                <Box sx={{ overflowX: "auto", p: 1.5 }}>
                  <Box component="table" sx={{ ...tableSx, minWidth: { xs: 720, xl: 0 } }}>
                    <thead><tr><th>STATE</th>{STATES.map((state) => <th key={state}>{state}</th>)}</tr></thead>
                    <tbody>
                      {[
                        ["TTC LIMIT", (row) => row.ttc_limit_mw === null || row.ttc_limit_mw === undefined ? "—" : `${number(row.ttc_limit_mw, 0)} (0-24 Hrs.)`],
                        ["ATC LIMIT", (row) => row.atc_limit_mw === null || row.atc_limit_mw === undefined ? "—" : `${number(row.atc_limit_mw, 0)} (0-24 Hrs.)`],
                        ["MAX SCHEDULE", (row) => row.max_schedule_mw === null || row.max_schedule_mw === undefined ? "—" : <>{number(row.max_schedule_mw, 0)}<br /><small>({row.max_schedule_time})</small></>],
                        ["MAX ACTUAL", (row) => row.max_actual_mw === null || row.max_actual_mw === undefined ? "—" : <>{number(row.max_actual_mw, 0)}<br /><small>({row.max_actual_time})</small></>],
                        ["VIOLATION", (row) => row.atc_violation_mw === null || row.atc_violation_mw === undefined ? "NIL" : `${number(row.atc_violation_mw, 0)} MW`],
                      ].map(([label, render]) => <tr key={label}><td style={{ fontWeight: 900 }}>{label}</td>{STATES.map((state) => <td key={state}>{render(stateRows[state] || {})}</td>)}</tr>)}
                    </tbody>
                  </Box>
                </Box>
              </Card>
            </Box>

            <Card sx={{ p: 0, mb: 2, overflow: "hidden" }}>
              <Typography sx={{ px: 1.7, py: 1.1, color: "#006845", bgcolor: "#E9F8F0", fontWeight: 900, textDecoration: "underline" }}>Major OD/UD by states/generators:</Typography>
              <Box sx={{ p: 1.7, fontSize: 13, lineHeight: 1.8 }}>
                <div>{report.major_od_text || defaultMajorOdText}</div>
                <div>{report.major_ud_text || defaultMajorUdText}</div>
              </Box>
            </Card>

            <Card sx={{ p: 0, mb: 2, overflow: "hidden" }}>
              <Typography sx={{ px: 1.7, py: 1.1, color: "#006845", bgcolor: "#E9F8F0", fontWeight: 900, textDecoration: "underline" }}>Important Events (FTC/GD/GI/Load crash etc.):</Typography>
              <Typography sx={{ p: 1.7, minHeight: 70, whiteSpace: "pre-wrap", fontSize: 13 }}>{report.important_events || "NIL"}</Typography>
            </Card>

            <Box sx={{ px: 1, pb: 1 }}>
              <Typography sx={{ fontSize: 12, fontWeight: 900 }}>{report.signoff_regards || "Regards"}</Typography>
              <Typography sx={{ fontSize: 13 }}>{report.signoff_name || "Ashoke Kumar Basak, SIC ERLDC"}</Typography>
            </Box>
          </Box>
        )}
      </Box>

      <Dialog open={overwriteOpen} onClose={() => !loading && setOverwriteOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 900 }}>Overwrite saved report?</DialogTitle>
        <DialogContent dividers>
          <Typography>A report is already saved for {reportDate.split("-").reverse().join("-")}. The new workbook will replace the older processed report.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOverwriteOpen(false)} disabled={loading}>Cancel</Button>
          <Button onClick={() => executeProcess(true)} disabled={loading} variant="contained" color="warning">
            {loading ? "Overwriting…" : "Overwrite Report"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={masterOpen} onClose={() => setMasterOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontWeight: 900 }}>TTC / ATC Limit Master (+ve Import, -ve Export)</DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2,1fr)" }, gap: 1.5, pt: 0.5 }}>
            {STATES.map((state) => (
              <Card key={state} sx={{ p: 1.5 }}>
                <Typography sx={{ fontWeight: 900, color: "#0057B7", mb: 1 }}>{state}</Typography>
                <Stack direction="row" spacing={1}>
                  {["ttc", "atc"].map((kind) => <TextField key={kind} label={`${kind.toUpperCase()} Limit (MW)`} type="number" size="small" value={limits[state]?.[kind] ?? ""} onChange={(event) => setLimits((current) => ({ ...current, [state]: { ...current[state], [kind]: event.target.value } }))} />)}
                </Stack>
              </Card>
            ))}
          </Box>
        </DialogContent>
        <DialogActions><Button onClick={() => setMasterOpen(false)}>Cancel</Button><Button onClick={saveMaster} variant="contained" startIcon={<Save size={16} />}>Save Master</Button></DialogActions>
      </Dialog>

      <Dialog open={editOpen} onClose={() => !savingEdit && setEditOpen(false)} maxWidth="xl" fullWidth>
        <DialogTitle sx={{ fontWeight: 900, color: "#081F5C" }}>
          Edit DSO Report — {reportDate.split("-").reverse().join("-")}
        </DialogTitle>
        <DialogContent dividers sx={{ bgcolor: "#F5F8FC" }}>
          {editDraft && (
            <Stack spacing={2}>
              <Card>
                <Typography sx={{ mb: 1.5, fontWeight: 900, color: "#0057B7" }}>1. Demand and Frequency Summary</Typography>
                <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(4,1fr)" }, gap: 1.3 }}>
                  {[
                    ["Maximum demand (MW)", "max_demand_mw", "number"],
                    ["Maximum demand time", "max_demand_time", "time"],
                    ["Minimum demand (MW)", "min_demand_mw", "number"],
                    ["Minimum demand time", "min_demand_time", "time"],
                    ["Maximum frequency (Hz)", "max_frequency_hz", "number"],
                    ["Maximum frequency time", "max_frequency_time", "time"],
                    ["Minimum frequency (Hz)", "min_frequency_hz", "number"],
                    ["Minimum frequency time", "min_frequency_time", "time"],
                  ].map(([label, key, type]) => (
                    <TextField
                      key={key}
                      label={label}
                      type={type}
                      size="small"
                      value={editDraft.demand_frequency?.[key] ?? ""}
                      onChange={(event) => setDraftSection("demand_frequency", key, event.target.value)}
                      InputLabelProps={{ shrink: true }}
                      inputProps={type === "number" ? { step: "any" } : undefined}
                    />
                  ))}
                </Box>
                <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3,1fr)" }, gap: 1.3, mt: 1.3 }}>
                  {[
                    ["Frequency > 50.05 (% of time)", "above_50_05_pct"],
                    ["Frequency within band (% of time)", "within_band_pct"],
                    ["Frequency < 49.9 (% of time)", "below_49_9_pct"],
                  ].map(([label, key]) => (
                    <TextField key={key} label={label} type="number" size="small" value={editDraft.frequency_distribution?.[key] ?? ""} onChange={(event) => setDraftSection("frequency_distribution", key, event.target.value)} inputProps={{ step: "any" }} />
                  ))}
                </Box>
              </Card>

              <Card>
                <Typography sx={{ mb: 1.5, fontWeight: 900, color: "#0057B7" }}>2. Thermal Generation Availability</Typography>
                <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3,1fr)" }, gap: 1.3 }}>
                  {[
                    ["Revived capacity (MW)", "revived_capacity_mw"],
                    ["Outage capacity (MW)", "outage_capacity_mw"],
                    ["Net capacity change (MW)", "net_capacity_change_mw"],
                  ].map(([label, key]) => (
                    <TextField key={key} label={label} type="number" size="small" value={editDraft.thermal_availability?.[key] ?? ""} onChange={(event) => setDraftSection("thermal_availability", key, event.target.value)} inputProps={{ step: "any" }} />
                  ))}
                </Box>
                <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 1.3, mt: 1.3 }}>
                  <TextField label="Revived unit details" multiline minRows={4} value={editDraft.thermal_availability?.revived_details || ""} onChange={(event) => setDraftSection("thermal_availability", "revived_details", event.target.value)} />
                  <TextField label="Outage unit details and reasons" multiline minRows={4} value={editDraft.thermal_availability?.outage_details || ""} onChange={(event) => setDraftSection("thermal_availability", "outage_details", event.target.value)} />
                </Box>
              </Card>

              <Card>
                <Typography sx={{ mb: 1.5, fontWeight: 900, color: "#0057B7" }}>3. State TTC/ATC, Schedule, Actual and OD/UD</Typography>
                <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" }, gap: 1.5 }}>
                  {STATES.map((state) => (
                    <Box key={state} sx={{ p: 1.5, border: "1px solid #CFE0F6", borderRadius: 2.5, bgcolor: "#FAFCFF" }}>
                      <Typography sx={{ mb: 1.2, fontWeight: 900, color: "#006845" }}>{state}</Typography>
                      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1 }}>
                        {[
                          ["TTC limit (MW)", "ttc_limit_mw", "number"],
                          ["ATC limit (MW)", "atc_limit_mw", "number"],
                          ["Maximum schedule (MW)", "max_schedule_mw", "number"],
                          ["Maximum schedule time", "max_schedule_time", "time"],
                          ["Maximum actual (MW)", "max_actual_mw", "number"],
                          ["Maximum actual time", "max_actual_time", "time"],
                          ["ATC violation (MW)", "atc_violation_mw", "number"],
                          ["OD at minimum frequency (MW)", "od_at_min_frequency_mw", "number"],
                          ["UD at maximum frequency (MW)", "ud_at_max_frequency_mw", "number"],
                        ].map(([label, key, type]) => (
                          <TextField
                            key={key}
                            label={label}
                            type={type}
                            size="small"
                            value={editDraft.states?.[state]?.[key] ?? ""}
                            onChange={(event) => setDraftState(state, key, event.target.value)}
                            InputLabelProps={{ shrink: true }}
                            inputProps={type === "number" ? { step: "any" } : undefined}
                          />
                        ))}
                      </Box>
                    </Box>
                  ))}
                </Box>
              </Card>

              <Card>
                <Typography sx={{ mb: 1.5, fontWeight: 900, color: "#0057B7" }}>4. Major OD/UD</Typography>
                <Stack spacing={1.3}>
                  <TextField label="OD statement" multiline minRows={2} value={editDraft.major_od_text || ""} onChange={(event) => setEditDraft((current) => ({ ...current, major_od_text: event.target.value }))} />
                  <TextField label="UD statement" multiline minRows={2} value={editDraft.major_ud_text || ""} onChange={(event) => setEditDraft((current) => ({ ...current, major_ud_text: event.target.value }))} />
                </Stack>
              </Card>

              <Card>
                <Typography sx={{ mb: 1.5, fontWeight: 900, color: "#0057B7" }}>5. Important Events and Sign-off</Typography>
                <TextField label="Important Events (FTC/GD/GI/Load crash etc.)" multiline minRows={3} fullWidth value={editDraft.important_events || ""} onChange={(event) => setEditDraft((current) => ({ ...current, important_events: event.target.value }))} />
                <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 2fr" }, gap: 1.3, mt: 1.3 }}>
                  <TextField label="Regards / closing text" value={editDraft.signoff_regards || ""} onChange={(event) => setEditDraft((current) => ({ ...current, signoff_regards: event.target.value }))} />
                  <TextField label="Name of SIC and designation" value={editDraft.signoff_name || ""} onChange={(event) => setEditDraft((current) => ({ ...current, signoff_name: event.target.value }))} />
                </Box>
              </Card>
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 1.5 }}>
          <Button onClick={() => setEditOpen(false)} disabled={savingEdit}>Cancel</Button>
          <Button onClick={saveReportEdit} disabled={savingEdit} variant="contained" startIcon={savingEdit ? <CircularProgress size={16} color="inherit" /> : <Save size={16} />}>
            {savingEdit ? "Saving…" : "Save All Sections"}
          </Button>
        </DialogActions>
      </Dialog>
    </AppShell>
  );
}
