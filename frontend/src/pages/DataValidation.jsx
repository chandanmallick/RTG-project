import { useMemo, useRef, useState } from "react";
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogContent, DialogTitle, Divider,
  FormControlLabel, IconButton, InputAdornment, Paper, Stack, Switch, Tab, Table, TableBody,
  TableCell, TableHead, TablePagination, TableRow, Tabs, TextField, Tooltip, Typography,
} from "@mui/material";
import {
  AlertTriangle, CalendarDays, CheckCircle2, Download, Edit3, Eye, FileSearch, Grid3X3, Mail, Search, Send, ShieldCheck,
  UploadCloud, X, Zap,
} from "lucide-react";

import AppShell from "../components/layout/AppShell";
import API from "../services/api";

const RULES = [
  ["Voltage level", "Detect 400 kV or 765 kV from each substation name."],
  ["Nominal tolerance", "Flag voltage outside ±15% of its detected nominal level."],
  ["Frozen samples", "Flag identical voltage continuing for more than 120 samples."],
  ["Daily statistics", "Maximum, minimum and average must not all be identical."],
  ["VDI", "Flag VDI above 10% using 380–420 kV and 728–800 kV bands."],
];

const number = (value, digits = 2) => value === null || value === undefined ? "—" : Number(value).toLocaleString("en-IN", { maximumFractionDigits: digits });
const localIsoDate = (value) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
const defaultReportDate = () => { const value = new Date(); value.setDate(value.getDate() - 1); return localIsoDate(value); };

function Metric({ label, value, detail, tone = "blue" }) {
  const tones = {
    blue: ["#EAF2FF", "#0057B7"], red: ["#FEF3F2", "#B42318"], green: ["#ECFDF3", "#067647"], amber: ["#FFFAEB", "#B54708"],
  };
  const [background, color] = tones[tone];
  return <Paper elevation={0} sx={{ p: 1.7, borderRadius: 3, border: `1px solid ${color}25`, background }}>
    <Typography sx={{ color: "#475467", fontSize: 11.5, fontWeight: 850 }}>{label}</Typography>
    <Typography sx={{ mt: .35, color, fontSize: 26, fontWeight: 950, lineHeight: 1.1 }}>{value}</Typography>
    <Typography sx={{ mt: .45, color: "#667085", fontSize: 10.5 }}>{detail}</Typography>
  </Paper>;
}

export default function DataValidation() {
  const inputRef = useRef(null);
  const mailBodyRef = useRef("");
  const [file, setFile] = useState(null);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState("summary");
  const [stationSearch, setStationSearch] = useState("");
  const [issuesOnly, setIssuesOnly] = useState(false);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(60);
  const [selectedStation, setSelectedStation] = useState(null);
  const [selectedIssue, setSelectedIssue] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [reportDate, setReportDate] = useState(defaultReportDate);
  const [mailPreview, setMailPreview] = useState(null);
  const [mailLoading, setMailLoading] = useState(false);
  const [mailEditing, setMailEditing] = useState(false);
  const [mailDraft, setMailDraft] = useState({ subject: "", html: "" });

  const visibleStations = useMemo(() => (report?.stations || []).filter((station) => {
    const text = `${station.name} ${station.scadaKey} ${station.voltageLevel || ""}`.toLowerCase();
    return (!stationSearch || text.includes(stationSearch.toLowerCase())) && (!issuesOnly || station.status !== "Healthy");
  }), [report, stationSearch, issuesOnly]);

  const selectedIssueRows = useMemo(() => {
    if (!report || !selectedIssue || selectedIssue.startIndex === null) return [];
    const indices = selectedIssue.sampleIndices?.length
      ? new Set(selectedIssue.sampleIndices)
      : new Set((selectedIssue.blocks || []).flatMap((block) => {
        if (block.startIndex === null || block.startIndex === undefined) return [];
        return Array.from({ length: block.endIndex - block.startIndex + 1 }, (_, offset) => block.startIndex + offset);
      }));
    return indices.size
      ? report.rows.filter((row) => indices.has(row.index))
      : report.rows.slice(selectedIssue.startIndex, selectedIssue.endIndex + 1);
  }, [report, selectedIssue]);

  const chooseFile = (chosen) => {
    if (!chosen) return;
    setFile(chosen);
    setReport(null);
    setError("");
  };

  const validate = async () => {
    if (!file) {
      setError("Select the ER_PSP_Voltage Excel or CSV dump first.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await API.validatePspVoltageDump(file);
      setReport(result);
      setView("summary");
      setPage(0);
    } catch (requestError) {
      setError(requestError.response?.data?.detail || requestError.message || "Voltage validation failed.");
    } finally {
      setLoading(false);
    }
  };

  const generateForDate = async () => {
    setLoading(true);
    setError("");
    setFile(null);
    setReport(null);
    try {
      const result = await API.generatePspVoltageReport(reportDate);
      setReport(result);
      setView("summary");
      setPage(0);
    } catch (requestError) {
      setError(requestError.response?.data?.detail || requestError.message || "The discrepancy report could not be generated.");
    } finally {
      setLoading(false);
    }
  };

  const previewMail = async () => {
    if (!report?.reportId) return;
    setMailLoading(true);
    setError("");
    try {
      const preview = await API.previewPspVoltageMail(report.reportId);
      setMailPreview(preview);
      setMailDraft({ subject: preview.subject || "", html: preview.html || "" });
      mailBodyRef.current = preview.html || "";
      setMailEditing(false);
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Mail preview could not be generated.");
    } finally {
      setMailLoading(false);
    }
  };

  const sendMail = async () => {
    if (!report?.reportId || !window.confirm("Send this issue-only PSP Voltage discrepancy report using the configured recipients?")) return;
    setMailLoading(true);
    setError("");
    try {
      const result = await API.sendPspVoltageMail(report.reportId, mailPreview ? { ...mailDraft, html: mailBodyRef.current || mailDraft.html } : {});
      setMailPreview(null);
      window.alert(result.message || "Discrepancy report sent.");
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Discrepancy mail could not be sent.");
    } finally {
      setMailLoading(false);
    }
  };

  const downloadExcel = async () => {
    if (!report?.reportId) return;
    try {
      const blob = await API.downloadPspVoltageValidation(report.reportId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${String(report.fileName || "PSP_Voltage").replace(/\.[^.]+$/, "")}_validation.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Marked Excel download failed.");
    }
  };

  const openStation = (station) => {
    setSelectedStation(station);
    setSelectedIssue(station.issues?.[0] || null);
  };

  const toggleMailEditing = () => {
    if (mailEditing) {
      setMailDraft((current) => ({ ...current, html: mailBodyRef.current || current.html }));
    }
    setMailEditing((value) => !value);
  };

  return <AppShell>
    <Box sx={{ p: { xs: 2, md: 2.3 }, borderRadius: 3, color: "#fff", background: "linear-gradient(105deg,#08103A 0%,#0057B7 62%,#1378DD 100%)", boxShadow: "0 12px 28px rgba(0,87,183,.18)" }}>
      <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems={{ md: "center" }} spacing={2}>
        <Box><Typography sx={{ fontSize: 11, fontWeight: 900, letterSpacing: .7, opacity: .8 }}>ANALYTICS · DATA VALIDATION</Typography><Typography sx={{ mt: .25, fontSize: 23, fontWeight: 950 }}>SCADA Data Validation</Typography><Typography sx={{ mt: .3, fontSize: 12, fontWeight: 650, opacity: .9 }}>Quality checks, issue blocks and sample-level evidence for operational data.</Typography></Box>
        {report && <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
          <Button variant="outlined" startIcon={<Eye size={16} />} disabled={mailLoading || !report.issueBlockCount} onClick={previewMail} sx={{ color: "#fff", borderColor: "rgba(255,255,255,.7)", textTransform: "none", fontWeight: 900 }}>Preview mail</Button>
          <Button variant="outlined" startIcon={<Send size={16} />} disabled={mailLoading || !report.issueBlockCount} onClick={sendMail} sx={{ color: "#fff", borderColor: "rgba(255,255,255,.7)", textTransform: "none", fontWeight: 900 }}>Send mail</Button>
          <Button variant="outlined" startIcon={<Download size={16} />} onClick={downloadExcel} sx={{ color: "#fff", borderColor: "rgba(255,255,255,.7)", textTransform: "none", fontWeight: 900 }}>Download marked Excel</Button>
        </Stack>}
      </Stack>
    </Box>

    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "245px minmax(0,1fr)" }, gap: 2 }}>
      <Paper elevation={0} sx={{ p: 1.2, borderRadius: 3, alignSelf: "start" }}>
        <Typography sx={{ px: 1.1, py: .7, color: "#667085", fontSize: 10.5, fontWeight: 900, letterSpacing: .6 }}>VALIDATORS</Typography>
        <Button fullWidth startIcon={<Zap size={17} />} sx={{ justifyContent: "flex-start", textAlign: "left", px: 1.3, py: 1.15, color: "#fff", background: "#0057B7", textTransform: "none", fontWeight: 900, borderRadius: 2.3, "&:hover": { background: "#004A9C" } }}>PSP Voltage dump</Button>
        <Typography sx={{ px: 1.2, mt: .8, color: "#667085", fontSize: 10.5 }}>PSP and Voltage Deviation Index (VDI)</Typography>
        <Divider sx={{ my: 1.3 }} />
        <Stack direction="row" spacing={1} alignItems="center" sx={{ px: 1.2, py: .7, color: "#98A2B3" }}><Grid3X3 size={16} /><Typography sx={{ fontSize: 11.5, fontWeight: 750 }}>More SCADA validators can be added here</Typography></Stack>
      </Paper>

      <Stack spacing={2} minWidth={0}>
        <Paper elevation={0} sx={{ p: 2, borderRadius: 3 }}>
          <Box sx={{ mb: 2, p: 1.5, borderRadius: 2.5, border: "1px solid #B9D5F7", background: "#F7FAFF" }}>
            <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} alignItems={{ md: "center" }}>
              <Box sx={{ width: 40, height: 40, borderRadius: 2, display: "grid", placeItems: "center", color: "#0057B7", background: "#E8F1FB" }}><CalendarDays size={20} /></Box>
              <Box sx={{ flex: 1 }}><Typography sx={{ fontWeight: 950, color: "#101828" }}>Generate from SCADA source</Typography><Typography sx={{ mt: .2, color: "#667085", fontSize: 11 }}>Select the operating date. COMPASS reads ER_PSP_Voltage_DDMMYYYY from the configured network folder.</Typography></Box>
              <TextField type="date" size="small" label="Report date" value={reportDate} onChange={(event) => setReportDate(event.target.value)} InputLabelProps={{ shrink: true }} sx={{ minWidth: 180 }} />
              <Button variant="contained" startIcon={loading ? <CircularProgress size={15} color="inherit" /> : <FileSearch size={16} />} disabled={loading || !reportDate} onClick={generateForDate} sx={{ background: "#0057B7", textTransform: "none", fontWeight: 900 }}>{loading ? "Generating…" : "Generate discrepancy report"}</Button>
            </Stack>
          </Box>
          <Divider sx={{ mb: 2 }}><Chip size="small" label="OR UPLOAD MANUALLY" /></Divider>
          <Stack direction={{ xs: "column", xl: "row" }} spacing={2}>
            <Box
              onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => { event.preventDefault(); setDragging(false); chooseFile(event.dataTransfer.files?.[0]); }}
              onClick={() => inputRef.current?.click()}
              sx={{ flex: "1 1 430px", minHeight: 145, p: 2, borderRadius: 3, border: `2px dashed ${dragging ? "#0057B7" : "#B8C9DC"}`, background: dragging ? "#EFF6FF" : "#F8FBFF", display: "grid", placeItems: "center", cursor: "pointer", textAlign: "center" }}
            >
              <input ref={inputRef} hidden type="file" accept=".xlsx,.xlsm,.xls,.xlsb,.csv" onChange={(event) => chooseFile(event.target.files?.[0])} />
              <Box><UploadCloud size={31} color="#0057B7" /><Typography sx={{ mt: .6, fontWeight: 950, color: "#101828" }}>{file?.name || "Drop ER_PSP_Voltage here"}</Typography><Typography sx={{ mt: .25, color: "#667085", fontSize: 11.5 }}>Excel/CSV · Row 1 station names · Row 2 SCADA keys · Row 3 onward samples</Typography></Box>
            </Box>
            <Stack sx={{ flex: "1 1 510px" }} spacing={1}>
              <Typography sx={{ fontWeight: 950, color: "#101828" }}>Validation rules</Typography>
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2,minmax(0,1fr))" }, gap: .8 }}>
                {RULES.map(([title, detail], index) => <Paper key={title} variant="outlined" sx={{ p: 1, borderColor: "#E4E7EC", background: "#FCFCFD" }}><Stack direction="row" spacing={.8}><Chip size="small" label={index + 1} sx={{ height: 20, minWidth: 20, fontWeight: 900, background: "#EAF2FF", color: "#0057B7" }} /><Box><Typography sx={{ fontSize: 11.5, fontWeight: 900 }}>{title}</Typography><Typography sx={{ mt: .1, fontSize: 10.2, color: "#667085" }}>{detail}</Typography></Box></Stack></Paper>)}
              </Box>
              <Button variant="contained" startIcon={loading ? <CircularProgress size={15} color="inherit" /> : <FileSearch size={16} />} onClick={validate} disabled={loading || !file} sx={{ alignSelf: "flex-start", mt: .5, px: 2.4, background: "#0057B7", textTransform: "none", fontWeight: 900 }}>{loading ? "Validating…" : "Validate voltage dump"}</Button>
            </Stack>
          </Stack>
        </Paper>

        {error && <Alert severity="error" onClose={() => setError("")}>{error}</Alert>}

        {!report && !loading && <Paper elevation={0} sx={{ minHeight: 250, borderRadius: 3, display: "grid", placeItems: "center", textAlign: "center", p: 3 }}><Box><ShieldCheck size={42} color="#98A2B3" /><Typography sx={{ mt: 1, fontWeight: 950, color: "#344054" }}>Upload a voltage dump to begin</Typography><Typography sx={{ mt: .4, color: "#667085", fontSize: 12 }}>The source file is analysed in memory and returned as a complete validation report.</Typography></Box></Paper>}

        {report && <>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2,minmax(0,1fr))", xl: "repeat(5,minmax(0,1fr))" }, gap: 1.2 }}>
            <Metric label="Substations" value={report.stationCount} detail={`${report.sampleCount} samples per station`} />
            <Metric label="Healthy" value={report.healthyStations} detail="No validation issue detected" tone="green" />
            <Metric label="Need attention" value={report.stationsWithIssues} detail="Click a station for evidence" tone="red" />
            <Metric label="Issue types" value={report.issueBlockCount} detail="Same issue instances are clubbed by substation" tone="amber" />
            <Metric label="Marked cells" value={report.flaggedCellCount} detail={`${report.sheetName} · ${report.fileName}`} tone="red" />
          </Box>

          <Paper elevation={0} sx={{ borderRadius: 3, overflow: "hidden" }}>
            <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems={{ md: "center" }} spacing={1} sx={{ px: 1.5, borderBottom: "1px solid #E4E7EC" }}>
              <Tabs value={view} onChange={(_, value) => { setView(value); setPage(0); }}><Tab value="summary" label="Station validation summary" sx={{ textTransform: "none", fontWeight: 900 }} /><Tab value="data" label="All marked data" sx={{ textTransform: "none", fontWeight: 900 }} /></Tabs>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ py: .8 }}><TextField size="small" placeholder="Search station/key…" value={stationSearch} onChange={(event) => setStationSearch(event.target.value)} InputProps={{ startAdornment: <InputAdornment position="start"><Search size={15} /></InputAdornment> }} sx={{ width: 210 }} /><FormControlLabel control={<Switch size="small" checked={issuesOnly} onChange={(event) => setIssuesOnly(event.target.checked)} />} label={<Typography sx={{ fontSize: 11.5, fontWeight: 800 }}>Issues only</Typography>} /></Stack>
            </Stack>

            {view === "summary" ? <Box sx={{ overflow: "auto", maxHeight: "calc(100vh - 390px)" }}><Table stickyHeader size="small"><TableHead><TableRow>
              {["Substation / SCADA key", "Level", "Status", "Valid", "Missing", "Minimum", "Maximum", "Average", "VDI", "Outside ±15% band", "No. of Flat Samples", "Marked", "Issues"].map((title) => <TableCell key={title} align={title === "Substation / SCADA key" || title === "Status" ? "left" : "right"} sx={{ fontWeight: 900, whiteSpace: "nowrap" }}>{title}</TableCell>)}
            </TableRow></TableHead><TableBody>
              {!visibleStations.length && <TableRow><TableCell colSpan={13} align="center" sx={{ py: 6, color: "#667085" }}>No substation matches the current filters.</TableCell></TableRow>}
              {visibleStations.map((station) => <TableRow key={station.id} hover onClick={() => openStation(station)} sx={{ cursor: "pointer", background: station.status === "Issue" ? "#FFF8F7" : "inherit" }}>
                <TableCell sx={{ minWidth: 245 }}><Typography sx={{ fontSize: 12.5, fontWeight: 900 }}>{station.name}</Typography><Typography sx={{ color: "#667085", fontSize: 10.5 }}>{station.scadaKey || "No SCADA key"}</Typography></TableCell>
                <TableCell align="right">{station.voltageLevel ? `${station.voltageLevel} kV` : <Chip size="small" label="Undetected" color="warning" />}</TableCell>
                <TableCell><Chip size="small" icon={station.status === "Healthy" ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />} label={station.status} sx={{ fontWeight: 850, background: station.status === "Healthy" ? "#DCFCE7" : station.status === "Issue" ? "#FEE2E2" : "#FEF3C7", color: station.status === "Healthy" ? "#067647" : station.status === "Issue" ? "#B42318" : "#B54708" }} /></TableCell>
                <TableCell align="right">{station.validSamples}</TableCell><TableCell align="right" sx={{ color: station.missingSamples ? "#B42318" : "inherit", fontWeight: station.missingSamples ? 900 : 400 }}>{station.missingSamples}</TableCell>
                <TableCell align="right" sx={{ color: station.minimum !== null && station.nominal_min !== undefined && (station.minimum < station.nominal_min || station.minimum > station.nominal_max) ? "#B42318" : "inherit", bgcolor: station.minimum !== null && station.nominal_min !== undefined && (station.minimum < station.nominal_min || station.minimum > station.nominal_max) ? "#FEE2E2" : "inherit", fontWeight: 900 }}>{number(station.minimum)}</TableCell>
                <TableCell align="right" sx={{ color: station.maximum !== null && station.nominal_min !== undefined && (station.maximum < station.nominal_min || station.maximum > station.nominal_max) ? "#B42318" : "inherit", bgcolor: station.maximum !== null && station.nominal_min !== undefined && (station.maximum < station.nominal_min || station.maximum > station.nominal_max) ? "#FEE2E2" : "inherit", fontWeight: 900 }}>{number(station.maximum)}</TableCell>
                <TableCell align="right" sx={{ color: station.average !== null && station.nominal_min !== undefined && (station.average < station.nominal_min || station.average > station.nominal_max) ? "#B42318" : "inherit", bgcolor: station.average !== null && station.nominal_min !== undefined && (station.average < station.nominal_min || station.average > station.nominal_max) ? "#FEE2E2" : "inherit", fontWeight: 900 }}>{number(station.average)}</TableCell>
                <TableCell align="right" sx={{ color: station.vdiPercent > 10 ? "#B42318" : "inherit", fontWeight: station.vdiPercent > 10 ? 900 : 400 }}>{station.vdiPercent === null ? "—" : `${number(station.vdiPercent)}%`}</TableCell>
                <TableCell align="right">{station.outsideNominalSamples}</TableCell><TableCell align="right">{station.flatRunSamples}</TableCell><TableCell align="right">{station.flaggedSamples}</TableCell><TableCell align="right"><Button size="small" variant={station.issueCount ? "contained" : "text"} color={station.issueCount ? "error" : "success"} sx={{ minWidth: 36, fontWeight: 900 }}>{station.issueCount}</Button></TableCell>
              </TableRow>)}
            </TableBody></Table></Box> : <>
              <Alert severity="info" sx={{ borderRadius: 0 }}>Red cells failed one or more checks. Hover a marked cell for its validation remark; download Excel to retain the same markings and comments.</Alert>
              <Box sx={{ overflow: "auto", maxHeight: "calc(100vh - 460px)" }}><Table stickyHeader size="small" sx={{ width: "max-content", minWidth: "100%" }}><TableHead><TableRow><TableCell sx={{ position: "sticky", left: 0, zIndex: 5, minWidth: 170, fontWeight: 900, background: "#EAF2FF !important" }}>Date &amp; time</TableCell>{visibleStations.map((station) => <TableCell key={station.id} align="center" sx={{ minWidth: 145, maxWidth: 180, fontWeight: 900, background: station.status === "Healthy" ? "#ECFDF3 !important" : "#FEF3F2 !important" }}><Tooltip title={`${station.name} · ${station.scadaKey || "No SCADA key"}`}><Box><Typography noWrap sx={{ maxWidth: 160, fontSize: 11, fontWeight: 900 }}>{station.name}</Typography><Typography sx={{ fontSize: 9.5, color: "#667085" }}>{station.voltageLevel ? `${station.voltageLevel} kV` : "Undetected"}</Typography></Box></Tooltip></TableCell>)}</TableRow></TableHead><TableBody>
                {(report.rows || []).slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map((row) => <TableRow key={row.index}><TableCell sx={{ position: "sticky", left: 0, zIndex: 2, background: "#fff", whiteSpace: "nowrap", fontWeight: 750 }}>{row.dateTime || `Sample ${row.index + 1}`}</TableCell>{visibleStations.map((station) => { const flags = row.flags?.[station.id] || []; return <Tooltip key={station.id} arrow title={flags.length ? <Box>{[...new Set(flags.map((flag) => flag.remark))].map((remark) => <Typography key={remark} sx={{ fontSize: 11 }}>{remark}</Typography>)}</Box> : "Valid sample"}><TableCell align="right" sx={{ fontFamily: "monospace", fontWeight: flags.length ? 900 : 500, color: flags.length ? "#B42318" : "#344054", background: flags.length ? "#FECACA" : "inherit", borderLeft: "1px solid #F2F4F7" }}>{row.values?.[station.id] ?? "—"}</TableCell></Tooltip>; })}</TableRow>)}
              </TableBody></Table></Box>
              <TablePagination component="div" count={(report.rows || []).length} page={page} onPageChange={(_, value) => setPage(value)} rowsPerPage={rowsPerPage} onRowsPerPageChange={(event) => { setRowsPerPage(Number(event.target.value)); setPage(0); }} rowsPerPageOptions={[30, 60, 120]} />
            </>}
          </Paper>
        </>}
      </Stack>
    </Box>

    <Dialog open={Boolean(mailPreview)} onClose={() => setMailPreview(null)} fullWidth maxWidth="xl">
      <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 2 }}>
        <Box sx={{ flex: 1 }}><Typography sx={{ fontSize: 18, fontWeight: 950 }}>Issue-only discrepancy mail preview</Typography><Typography sx={{ mt: .25, color: "#667085", fontSize: 11.5 }}>To: {mailPreview?.recipientCount || 0} · CC: {mailPreview?.ccRecipientCount || 0} · Marked validation Excel attached</Typography></Box>
        <Button size="small" variant={mailEditing ? "contained" : "outlined"} startIcon={<Edit3 size={15} />} onClick={toggleMailEditing} sx={{ textTransform: "none", fontWeight: 850 }}>{mailEditing ? "Finish editing" : "Edit preview"}</Button>
        <IconButton onClick={() => setMailPreview(null)}><X size={19} /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {mailPreview && (!mailPreview.mailEnabled || !mailPreview.templateEnabled || !mailPreview.recipientCount) && <Alert severity="warning" sx={{ mb: 2 }}>Complete and enable the PSP Voltage discrepancy configuration under Admin → Mail Settings before sending.</Alert>}
        {mailEditing ? <TextField fullWidth size="small" label="Mail subject" value={mailDraft.subject} onChange={(event) => setMailDraft((current) => ({ ...current, subject: event.target.value }))} sx={{ mb: 1.5 }} /> : <Typography sx={{ mb: 1.5, fontWeight: 900, color: "#0F172A" }}>Subject: {mailDraft.subject}</Typography>}
        {mailEditing && <Alert severity="info" sx={{ mb: 1 }}>Click inside the mail below to edit its text or table content. The Excel attachment is regenerated separately and is not changed.</Alert>}
        <Paper
          variant="outlined"
          contentEditable={mailEditing}
          suppressContentEditableWarning
          onInput={(event) => { mailBodyRef.current = event.currentTarget.innerHTML; }}
          sx={{ p: 2, overflow: "auto", background: "#fff", outline: mailEditing ? "2px solid #0057B7" : "none", cursor: mailEditing ? "text" : "default" }}
          dangerouslySetInnerHTML={{ __html: mailDraft.html }}
        />
        <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ mt: 2 }}><Button onClick={() => setMailPreview(null)}>Close</Button><Button variant="contained" startIcon={<Send size={16} />} disabled={mailLoading || !mailPreview?.mailEnabled || !mailPreview?.templateEnabled || !mailPreview?.recipientCount} onClick={sendMail} sx={{ background: "#0057B7", fontWeight: 900 }}>Send configured mail</Button></Stack>
      </DialogContent>
    </Dialog>

    <Dialog open={Boolean(selectedStation)} onClose={() => { setSelectedStation(null); setSelectedIssue(null); }} fullWidth maxWidth="lg">
      <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 2 }}><Box><Typography sx={{ fontSize: 18, fontWeight: 950 }}>Validation evidence · {selectedStation?.name}</Typography><Typography sx={{ mt: .2, color: "#667085", fontSize: 11.5 }}>{selectedStation?.voltageLevel ? `${selectedStation.voltageLevel} kV` : "Voltage level undetected"} · {selectedStation?.scadaKey || "No SCADA key"} · {selectedStation?.flaggedSamples || 0} marked sample(s)</Typography></Box><IconButton onClick={() => { setSelectedStation(null); setSelectedIssue(null); }}><X size={19} /></IconButton></DialogTitle>
      <DialogContent dividers>
        {selectedStation && <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "360px minmax(0,1fr)" }, gap: 2 }}>
          <Stack spacing={1}>
            <Typography sx={{ fontSize: 11, fontWeight: 900, color: "#667085", letterSpacing: .5 }}>ISSUE BLOCKS</Typography>
            {!selectedStation.issues?.length && <Alert severity="success">No validation issue was detected for this substation.</Alert>}
            {(selectedStation.issues || []).map((issue) => <Paper key={issue.id} variant="outlined" onClick={() => setSelectedIssue(issue)} sx={{ p: 1.25, cursor: "pointer", borderColor: selectedIssue?.id === issue.id ? "#B42318" : "#F4C7C3", background: selectedIssue?.id === issue.id ? "#FEF3F2" : "#FFFBFA" }}><Stack direction="row" spacing={1} alignItems="flex-start"><AlertTriangle size={17} color={issue.severity === "error" ? "#B42318" : "#B54708"} /><Box minWidth={0}><Typography sx={{ fontSize: 12.5, fontWeight: 900, color: "#7A271A" }}>{issue.title}</Typography><Typography sx={{ mt: .25, color: "#667085", fontSize: 10.5 }}>{issue.startTime ? `${issue.instanceCount || issue.blocks?.length || 1} instance(s) · ${issue.sampleCount} sample(s) · ${issue.startTime} to ${issue.endTime}` : "Station-level check"}</Typography><Typography sx={{ mt: .55, color: "#344054", fontSize: 10.8 }}>{issue.remark}</Typography></Box></Stack></Paper>)}
          </Stack>
          <Box minWidth={0}>
            {!selectedIssue ? <Paper variant="outlined" sx={{ minHeight: 260, display: "grid", placeItems: "center", color: "#667085" }}>Select an issue block to inspect its samples.</Paper> : <>
              <Paper elevation={0} sx={{ p: 1.4, mb: 1, border: "1px solid #FDA29B", background: "#FEF3F2" }}><Typography sx={{ fontWeight: 950, color: "#B42318" }}>{selectedIssue.title}</Typography><Typography sx={{ mt: .35, color: "#7A271A", fontSize: 11.5 }}>{selectedIssue.remark}</Typography></Paper>
              {selectedIssue.startIndex === null ? <Alert severity={selectedIssue.severity === "error" ? "error" : "warning"}>This is a station-level issue and does not belong to an individual sample block.</Alert> : <Box sx={{ overflow: "auto", maxHeight: 480 }}><Table stickyHeader size="small"><TableHead><TableRow><TableCell sx={{ fontWeight: 900 }}>Sample</TableCell><TableCell sx={{ fontWeight: 900 }}>Date &amp; time</TableCell><TableCell align="right" sx={{ fontWeight: 900 }}>Voltage (kV)</TableCell><TableCell sx={{ fontWeight: 900 }}>Remarks</TableCell></TableRow></TableHead><TableBody>{selectedIssueRows.map((row) => { const flags = (row.flags?.[selectedStation.id] || []).filter((flag) => flag.code === selectedIssue.code); return <TableRow key={row.index} sx={{ background: "#FEF3F2" }}><TableCell>{row.index + 1}</TableCell><TableCell sx={{ whiteSpace: "nowrap" }}>{row.dateTime || "—"}</TableCell><TableCell align="right" sx={{ color: "#B42318", fontWeight: 950 }}>{row.values?.[selectedStation.id] ?? "—"}</TableCell><TableCell sx={{ minWidth: 260 }}>{[...new Set(flags.map((flag) => flag.remark))].join(" · ") || selectedIssue.remark}</TableCell></TableRow>; })}</TableBody></Table></Box>}
            </>}
          </Box>
        </Box>}
      </DialogContent>
    </Dialog>
  </AppShell>;
}
