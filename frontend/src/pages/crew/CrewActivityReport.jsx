import { useEffect, useMemo, useState } from "react";
import {
  Alert, Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogContent, DialogTitle,
  IconButton, ListItemText, MenuItem, Paper, Stack, Tab, Table, TableBody, TableCell, TableHead,
  TableRow, Tabs, TextField, Typography,
} from "@mui/material";
import { Award, Briefcase, CalendarCheck2, RefreshCw, Repeat2, X } from "lucide-react";

import AppShell from "../../components/layout/AppShell";
import api from "../../crewLegacy/api";

const today = () => new Date().toISOString().slice(0, 10);
const yearStart = () => `${new Date().getFullYear()}-01-01`;
const currentMonth = () => today().slice(0, 7);
const monthBounds = (value) => {
  const [year, month] = String(value || "").split("-").map(Number);
  if (!year || !month) return { startDate: yearStart(), endDate: today() };
  const lastDay = new Date(year, month, 0).getDate();
  return { startDate: `${value}-01`, endDate: `${value}-${String(lastDay).padStart(2, "0")}` };
};
const displayDate = (value) => {
  if (!value) return "—";
  const parsed = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

const TILE = {
  leave: { tint: "#FDE8EC", color: "#C62828", icon: CalendarCheck2 },
  training: { tint: "#F0E7FA", color: "#6A1B9A", icon: Briefcase },
  coff: { tint: "#FFF4CC", color: "#9A6700", icon: Award },
  replacement: { tint: "#DCFCE7", color: "#15803D", icon: Repeat2 },
};

function SummaryTile({ title, value, detail, tone }) {
  const item = TILE[tone];
  const Icon = item.icon;
  return <Paper elevation={0} sx={{ p: 2, minWidth: 0, borderRadius: 3, background: item.tint, border: `1px solid ${item.color}33`, boxShadow: "none" }}>
    <Stack direction="row" justifyContent="space-between" alignItems="flex-start"><Typography sx={{ fontWeight: 900, color: "#0F172A" }}>{title}</Typography><Icon size={19} color={item.color} /></Stack>
    <Typography sx={{ mt: 1, color: item.color, fontSize: 28, fontWeight: 950, lineHeight: 1 }}>{value || 0}</Typography>
    <Typography sx={{ mt: .6, fontSize: 11.5, color: "#475569", fontWeight: 750 }}>{detail}</Typography>
  </Paper>;
}

export default function CrewActivityReport() {
  const currentEmployeeId = localStorage.getItem("crewEmployeeId") || localStorage.getItem("employeeId") || "";
  const [employeeIds, setEmployeeIds] = useState(currentEmployeeId ? [currentEmployeeId] : []);
  const [startDate, setStartDate] = useState(yearStart());
  const [endDate, setEndDate] = useState(today());
  const [kind, setKind] = useState("All");
  const [matrixKind, setMatrixKind] = useState("All");
  const [matrixPeriod, setMatrixPeriod] = useState("Date range");
  const [matrixMonth, setMatrixMonth] = useState(currentMonth());
  const [matrixDepartment, setMatrixDepartment] = useState("All");
  const [matrixSubDepartment, setMatrixSubDepartment] = useState("All");
  const [matrixActivitySubtype, setMatrixActivitySubtype] = useState("All");
  const [matrixGroup, setMatrixGroup] = useState("All");
  const [matrixEmployee, setMatrixEmployee] = useState("All");
  const [crmsShift, setCrmsShift] = useState("All");
  const [crmsStatus, setCrmsStatus] = useState("All");
  const [crmsDesk, setCrmsDesk] = useState("All");
  const [crmsSearch, setCrmsSearch] = useState("");
  const [crmsEmployeeDetails, setCrmsEmployeeDetails] = useState(null);
  const [crmsShiftDetails, setCrmsShiftDetails] = useState(null);
  const [crmsOnly, setCrmsOnly] = useState(false);
  const [trainingDetails, setTrainingDetails] = useState(null);
  const [reportMode, setReportMode] = useState("detail");
  const [report, setReport] = useState({ summary: {}, rows: [], employees: [], canViewAll: false });
  const [matrix, setMatrix] = useState({ dutyCategories: [], shiftDutyCategories: [], leaveCategories: [], otherCategories: [], departments: [], subDepartments: [], departmentSubDepartments: {}, subDepartmentGroups: {}, groupNames: [], rows: [] });
  const [crms, setCrms] = useState({ summary: {}, rows: [], details: [], rosterEntries: [], statuses: [], deskRoles: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await api.get("/profile/activity-report", { params: { employeeIds: employeeIds.join(","), startDate, endDate } });
      setReport(response.data || { summary: {}, rows: [] });
      if (!employeeIds.length && response.data?.employeeId) setEmployeeIds([response.data.employeeId]);
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Crew activity report could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);
  const loadMatrix = async () => {
    setLoading(true);
    setError("");
    try {
      const period = matrixPeriod === "Month" ? monthBounds(matrixMonth) : { startDate, endDate };
      const response = await api.get("/profile/activity-matrix", { params: period });
      setMatrix(response.data || { dutyCategories: [], shiftDutyCategories: [], leaveCategories: [], otherCategories: [], departments: [], subDepartments: [], departmentSubDepartments: {}, subDepartmentGroups: {}, groupNames: [], rows: [] });
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Employee activity matrix could not be loaded.");
    } finally {
      setLoading(false);
    }
  };
  const loadCrms = async (refresh = false) => {
    setLoading(true);
    setError("");
    try {
      const period = matrixPeriod === "Month" ? monthBounds(matrixMonth) : { startDate, endDate };
      const response = await api.get("/profile/crms-duty-reconciliation", { params: { ...period, refresh } });
      setCrms(response.data || { summary: {}, rows: [], details: [], rosterEntries: [], statuses: [], deskRoles: [] });
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "CRMS duty reconciliation could not be loaded.");
    } finally {
      setLoading(false);
    }
  };
  const clearCrmsReport = () => {
    setCrms({ summary: {}, rows: [], details: [], rosterEntries: [], statuses: [], deskRoles: [] });
    setCrmsEmployeeDetails(null);
    setCrmsShiftDetails(null);
  };
  const rows = useMemo(() => (report.rows || []).filter((row) => kind === "All" || row.kind === kind), [report.rows, kind]);
  const matrixActivitySubtypeOptions = useMemo(() => {
    if (matrixKind === "Shift duty") return [...(matrix.shiftDutyCategories || ["Morning", "Evening", "Night", "OFF"]), "Replacement duty"];
    if (matrixKind === "Leave") return matrix.leaveCategories || [];
    if (matrixKind === "Other") return matrix.otherCategories || ["Training", "C-OFF"];
    return [];
  }, [matrixKind, matrix.shiftDutyCategories, matrix.leaveCategories, matrix.otherCategories]);
  const matrixSubDepartmentOptions = useMemo(() => (
    matrixDepartment === "All"
      ? (matrix.subDepartments || [])
      : (matrix.departmentSubDepartments?.[matrixDepartment] || [])
  ), [matrixDepartment, matrix.subDepartments, matrix.departmentSubDepartments]);
  const availableMatrixGroups = useMemo(() => (
    matrixSubDepartment === "All" ? [] : (matrix.subDepartmentGroups?.[matrixSubDepartment] || [])
  ), [matrixSubDepartment, matrix.subDepartmentGroups]);
  const showMatrixGroup = availableMatrixGroups.length > 0;
  const matchesMatrixOrganization = (row) => (
    (matrixDepartment === "All" || (row.departments || []).includes(matrixDepartment))
    && (matrixSubDepartment === "All" || (row.subDepartments || []).includes(matrixSubDepartment))
    && (matrixGroup === "All" || (row.periodGroupNames || []).includes(matrixGroup))
  );
  const matrixEmployeeOptions = useMemo(() => (matrix.rows || []).filter(matchesMatrixOrganization), [matrix.rows, matrixDepartment, matrixSubDepartment, matrixGroup]);
  const matrixRows = useMemo(() => (matrix.rows || []).filter((row) => {
    const matchesActivity = matrixKind === "All"
      || (matrixKind === "Shift duty" && (
        matrixActivitySubtype === "All"
          ? row.shiftDutyDays > 0 || row.replacementDutyDays > 0
          : matrixActivitySubtype === "Replacement duty"
            ? row.replacementDutyDays > 0
            : (row.dutyCounts?.[matrixActivitySubtype] || 0) > 0
      ))
      || (matrixKind === "Leave" && (matrixActivitySubtype === "All" ? row.leaveTotal > 0 : (row.leaveByType?.[matrixActivitySubtype] || 0) > 0))
      || (matrixKind === "Other" && (
        matrixActivitySubtype === "All"
          ? row.trainingDays > 0 || row.compOffDays > 0
          : matrixActivitySubtype === "Training" ? row.trainingDays > 0 : row.compOffDays > 0
      ));
    return matchesActivity
      && matchesMatrixOrganization(row)
      && (matrixEmployee === "All" || row.employeeId === matrixEmployee);
  }), [matrix.rows, matrixKind, matrixActivitySubtype, matrixDepartment, matrixSubDepartment, matrixGroup, matrixEmployee]);
  const visibleDutyCategories = matrixKind === "Shift duty" && matrixActivitySubtype !== "All" && matrixActivitySubtype !== "Replacement duty"
    ? [matrixActivitySubtype]
    : (matrix.shiftDutyCategories || []);
  const visibleLeaveCategories = matrixKind === "Leave" && matrixActivitySubtype !== "All"
    ? [matrixActivitySubtype]
    : (matrix.leaveCategories || []);
  const showDuties = matrixKind === "All" || matrixKind === "Shift duty";
  const showReplacement = matrixKind === "All" || (matrixKind === "Shift duty" && ["All", "Replacement duty"].includes(matrixActivitySubtype));
  const showTraining = matrixKind === "All" || (matrixKind === "Other" && ["All", "Training"].includes(matrixActivitySubtype));
  const showCompOff = matrixKind === "All" || (matrixKind === "Other" && ["All", "C-OFF"].includes(matrixActivitySubtype));
  const showLeave = matrixKind === "All" || matrixKind === "Leave";
  const matrixColumnCount = 1
    + (showDuties ? 1 + visibleDutyCategories.length : 0)
    + (showReplacement ? 1 : 0)
    + (showTraining ? 1 : 0)
    + (showCompOff ? 1 : 0)
    + (showLeave ? 1 + visibleLeaveCategories.length : 0);
  const matrixTotals = useMemo(() => matrixRows.reduce((totals, row) => {
    totals.assignedDutyDays += row.shiftDutyDays || 0;
    totals.replacementDutyDays += row.replacementDutyDays || 0;
    totals.trainingDays += row.trainingDays || 0;
    totals.compOffDays += row.compOffDays || 0;
    totals.leaveTotal += row.leaveTotal || 0;
    (matrix.dutyCategories || []).forEach((category) => { totals.dutyCounts[category] = (totals.dutyCounts[category] || 0) + (row.dutyCounts?.[category] || 0); });
    (matrix.leaveCategories || []).forEach((category) => { totals.leaveByType[category] = (totals.leaveByType[category] || 0) + (row.leaveByType?.[category] || 0); });
    return totals;
  }, { assignedDutyDays: 0, replacementDutyDays: 0, trainingDays: 0, compOffDays: 0, leaveTotal: 0, dutyCounts: {}, leaveByType: {} }), [matrixRows, matrix.dutyCategories, matrix.leaveCategories]);
  const crmsRows = useMemo(() => (crms.rows || []).filter((row) => {
    const text = `${row.employeeName || ""} ${row.employeeId || ""}`.toLowerCase();
    return (!crmsSearch || text.includes(crmsSearch.toLowerCase()))
      && (crmsShift === "All" || (row[crmsShift] || 0) > 0)
      && (crmsStatus === "All" || (crms.details || []).some((item) => (item.employeeId || item.crmsName) === (row.employeeId || row.employeeName) && item.status === crmsStatus))
      && (crmsDesk === "All" || (row.deskCounts?.[crmsDesk] || 0) > 0);
  }), [crms.rows, crms.details, crmsSearch, crmsShift, crmsStatus, crmsDesk]);
  const crmsDetailRows = useMemo(() => (crms.details || []).filter((item) => (
    (crmsShift === "All" || item.shift === crmsShift)
    && (crmsStatus === "All" || item.status === crmsStatus)
    && (crmsDesk === "All" || item.desk === crmsDesk)
    && (!crmsSearch || `${item.employeeName || ""} ${item.employeeId || ""} ${item.crmsName || ""}`.toLowerCase().includes(crmsSearch.toLowerCase()))
  )), [crms.details, crmsSearch, crmsShift, crmsStatus, crmsDesk]);
  const shiftDetailEmployeeMatches = (item, selected) => Boolean(selected) && (
    (selected.employeeId && item.employeeId === selected.employeeId)
    || (!selected.employeeId && item.crmsName === selected.employeeName)
  );
  const selectedCrmsShiftRows = useMemo(() => (crms.details || []).filter((item) => (
    shiftDetailEmployeeMatches(item, crmsShiftDetails)
    && item.shift === crmsShiftDetails?.shift
    && item.status !== "Rostered but absent"
  )), [crms.details, crmsShiftDetails]);
  const selectedRosterShiftRows = useMemo(() => (crms.rosterEntries || []).filter((item) => (
    crmsShiftDetails?.employeeId
    && item.employeeId === crmsShiftDetails.employeeId
    && item.shift === crmsShiftDetails.shift
  )), [crms.rosterEntries, crmsShiftDetails]);
  const selectedCrmsRowsByDate = useMemo(() => selectedCrmsShiftRows.reduce((result, item) => {
    const key = String(item.date || "");
    result[key] = [...(result[key] || []), item];
    return result;
  }, {}), [selectedCrmsShiftRows]);
  const pairedShiftRows = useMemo(() => {
    const usedCrmsIds = new Set();
    const paired = selectedRosterShiftRows.map((roster) => {
      const crmsRows = selectedCrmsRowsByDate[String(roster.date || "")] || [];
      crmsRows.forEach((item) => usedCrmsIds.add(item.id));
      const mismatch = !crmsRows.length || crmsRows.some((item) => !["Matched", "Replacement match", "Reassigned match"].includes(item.status));
      return { id: roster.id, date: roster.date, roster, crmsRows, mismatch };
    });
    selectedCrmsShiftRows.filter((item) => !usedCrmsIds.has(item.id)).forEach((item) => {
      paired.push({ id: item.id, date: item.date, roster: null, crmsRows: [item], mismatch: true });
    });
    return paired.sort((first, second) => String(first.date || "").localeCompare(String(second.date || "")) || String(first.id).localeCompare(String(second.id)));
  }, [selectedCrmsShiftRows, selectedRosterShiftRows, selectedCrmsRowsByDate]);
  const rosterShiftResult = (roster) => {
    const actualRows = selectedCrmsRowsByDate[String(roster.date || "")] || [];
    if (!actualRows.length) return { label: "Not in CRMS", mismatch: true };
    if (actualRows.some((item) => !["Matched", "Replacement match", "Reassigned match"].includes(item.status))) {
      return { label: "Mismatch", mismatch: true };
    }
    return { label: "Matched", mismatch: false };
  };

  return <AppShell>
    <Box sx={{ p: { xs: 1.75, md: 2.1 }, borderRadius: 3, color: "#fff", bgcolor: "#0057B7", backgroundImage: "linear-gradient(105deg,#08103A 0%,#0057B7 62%,#1378DD 100%) !important", boxShadow: "0 12px 28px rgba(0,87,183,.18)" }}>
      <Stack direction={{ xs: "column", md: "row" }} spacing={2} justifyContent="space-between" alignItems={{ md: "center" }}>
        <Box><Typography sx={{ fontWeight: 950, fontSize: 22 }}>Crew Activity Report</Typography><Typography sx={{ opacity: .9, fontSize: 12, fontWeight: 700 }}>Detailed history and consolidated duty, replacement, training and leave reporting.</Typography></Box>
        <Button variant="outlined" startIcon={<RefreshCw size={16} />} onClick={reportMode === "matrix" ? loadMatrix : reportMode === "crms" ? () => loadCrms(true) : load} sx={{ color: "#fff", borderColor: "rgba(255,255,255,.72)", textTransform: "none", fontWeight: 900 }}>{reportMode === "crms" && !(crms.rows || []).length ? "Load report" : "Refresh"}</Button>
      </Stack>
    </Box>

    <Paper elevation={0} sx={{ borderRadius: 3, overflow: "hidden" }}>
      <Tabs value={reportMode} onChange={(_, value) => {
        setReportMode(value);
        if (value === "matrix" && !(matrix.rows || []).length) loadMatrix();
      }} sx={{ px: 1.25, borderBottom: "1px solid #E2E8F0" }}>
        <Tab value="detail" label="Detailed activity report" sx={{ textTransform: "none", fontWeight: 900 }} />
        <Tab value="matrix" label="Consolidated activity matrix" sx={{ textTransform: "none", fontWeight: 900 }} />
        <Tab value="crms" label="CRMS duty reconciliation" sx={{ textTransform: "none", fontWeight: 900 }} />
      </Tabs>
    </Paper>

    <Paper elevation={0} sx={{ p: 2, borderRadius: 3 }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ overflowX: "auto", flexWrap: "nowrap", pb: .25, "& .MuiTextField-root": { flex: "0 0 auto" } }}>
        {reportMode === "detail" && report.canViewAll && <TextField select size="small" label="Employees" value={employeeIds} onChange={(event) => {
          const values = typeof event.target.value === "string" ? event.target.value.split(",") : event.target.value;
          if (!employeeIds.includes("all") && values.includes("all")) setEmployeeIds(["all"]);
          else if (employeeIds.includes("all")) setEmployeeIds(values.filter((value) => value !== "all"));
          else setEmployeeIds(values);
        }} SelectProps={{ multiple: true, renderValue: (selected) => selected.includes("all") ? "All employees" : `${selected.length} employee(s) selected` }} sx={{ minWidth: 255 }}>
          <MenuItem value="all"><Checkbox size="small" checked={employeeIds.includes("all")} /><ListItemText primary="All employees" /></MenuItem>
          {(report.employees || []).map((employee) => <MenuItem key={employee.employeeId} value={employee.employeeId}><Checkbox size="small" checked={employeeIds.includes(employee.employeeId)} /><ListItemText primary={`${employee.name || employee.employeeId} · ${employee.employeeId}`} /></MenuItem>)}
        </TextField>}
        {reportMode !== "detail" && <TextField select size="small" label="Period" value={matrixPeriod} onChange={(event) => { setMatrixPeriod(event.target.value); if (reportMode === "crms") clearCrmsReport(); }} sx={{ width: 115 }}>
          {["Date range", "Month"].map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}
        </TextField>}
        {reportMode !== "detail" && matrixPeriod === "Month" ? <TextField size="small" type="month" label="Month" value={matrixMonth} onChange={(event) => { setMatrixMonth(event.target.value); if (reportMode === "crms") clearCrmsReport(); }} InputLabelProps={{ shrink: true }} sx={{ width: 155 }} /> : <>
          <TextField size="small" type="date" label="From" value={startDate} onChange={(event) => { setStartDate(event.target.value); if (reportMode === "crms") clearCrmsReport(); }} InputLabelProps={{ shrink: true }} />
          <TextField size="small" type="date" label="To" value={endDate} onChange={(event) => { setEndDate(event.target.value); if (reportMode === "crms") clearCrmsReport(); }} InputLabelProps={{ shrink: true }} />
        </>}
        {reportMode === "detail" ? <TextField select size="small" label="Activity type" value={kind} onChange={(event) => setKind(event.target.value)} sx={{ minWidth: 170 }}>
          {["All", "Leave", "Training", "C-OFF", "Replacement duty"].map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}
        </TextField> : reportMode === "matrix" ? <TextField select size="small" label="Activity category" value={matrixKind} onChange={(event) => { setMatrixKind(event.target.value); setMatrixActivitySubtype("All"); setMatrixEmployee("All"); }} sx={{ minWidth: 165 }}>
          {["All", "Shift duty", "Leave", "Other"].map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}
        </TextField> : null}
        {reportMode === "matrix" && <TextField select size="small" label="Department" value={matrixDepartment} onChange={(event) => { setMatrixDepartment(event.target.value); setMatrixSubDepartment("All"); setMatrixGroup("All"); setMatrixEmployee("All"); }} sx={{ width: 180 }}>
          <MenuItem value="All">All departments</MenuItem>
          {(matrix.departments || []).map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}
        </TextField>}
        {reportMode === "matrix" && <TextField select size="small" label="Sub-department" value={matrixSubDepartment} onChange={(event) => { setMatrixSubDepartment(event.target.value); setMatrixGroup("All"); setMatrixEmployee("All"); }} sx={{ width: 190 }}>
          <MenuItem value="All">All sub-departments</MenuItem>
          {matrixSubDepartmentOptions.map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}
        </TextField>}
        {reportMode === "matrix" && <TextField select size="small" label="Activity subtype" value={matrixActivitySubtype} onChange={(event) => { setMatrixActivitySubtype(event.target.value); setMatrixEmployee("All"); }} sx={{ width: 180 }} disabled={matrixKind === "All"}>
          <MenuItem value="All">All</MenuItem>
          {matrixActivitySubtypeOptions.map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}
        </TextField>}
        {reportMode === "matrix" && showMatrixGroup && <TextField select size="small" label="Shift group" value={matrixGroup} onChange={(event) => { setMatrixGroup(event.target.value); setMatrixEmployee("All"); }} sx={{ width: 155 }}>
          <MenuItem value="All">All shift groups</MenuItem>
          {availableMatrixGroups.map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}
        </TextField>}
        {reportMode === "matrix" && <TextField select size="small" label="Employee" value={matrixEmployee} onChange={(event) => setMatrixEmployee(event.target.value)} sx={{ width: 190 }}>
          <MenuItem value="All">All employees</MenuItem>
          {matrixEmployeeOptions.map((row) => <MenuItem key={row.employeeId} value={row.employeeId}>{row.employeeName || row.employeeId} · {row.employeeId}</MenuItem>)}
        </TextField>}
        {reportMode === "crms" && <TextField size="small" label="Employee search" value={crmsSearch} onChange={(event) => setCrmsSearch(event.target.value)} sx={{ width: 190 }} />}
        {reportMode === "crms" && <TextField select size="small" label="Actual shift" value={crmsShift} onChange={(event) => setCrmsShift(event.target.value)} sx={{ width: 135 }}><MenuItem value="All">All shifts</MenuItem>{["Morning", "Evening", "Night"].map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}</TextField>}
        {reportMode === "crms" && <TextField select size="small" label="Reconciliation" value={crmsStatus} onChange={(event) => setCrmsStatus(event.target.value)} sx={{ width: 180 }}><MenuItem value="All">All results</MenuItem>{(crms.statuses || []).map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}</TextField>}
        {reportMode === "crms" && <TextField select size="small" label="CRMS desk" value={crmsDesk} onChange={(event) => setCrmsDesk(event.target.value)} sx={{ width: 210 }}><MenuItem value="All">All desks</MenuItem>{(crms.deskRoles || []).map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}</TextField>}
        <Button variant="contained" onClick={reportMode === "matrix" ? loadMatrix : reportMode === "crms" ? () => loadCrms(false) : load} sx={{ flex: "0 0 auto", textTransform: "none", fontWeight: 900, background: "#0057B7", whiteSpace: "nowrap" }}>Load report</Button>
      </Stack>
    </Paper>

    {error && <Alert severity="error">{error}</Alert>}
    {reportMode === "detail" && <><Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2,minmax(0,1fr))", md: "repeat(4,minmax(0,1fr))" }, gap: 1.5 }}>
      <SummaryTile title="Leave" value={report.summary?.leave} detail={`${report.summary?.leaveApproved || 0} approved · ${report.summary?.leaveWeekend || 0} weekend · ${report.summary?.leaveHoliday || 0} holiday`} tone="leave" />
      <SummaryTile title="Training" value={report.summary?.training} detail={`${report.summary?.trainingDays || 0} approved day(s)`} tone="training" />
      <SummaryTile title="C-OFF" value={report.summary?.compOff} detail={`${report.summary?.compOffAvailable || 0} available · ${report.summary?.compOffUsedDays || 0} used · ${(report.summary?.compOffDates || []).slice(0, 2).map(displayDate).join(", ") || "no dates"}`} tone="coff" />
      <SummaryTile title="Replacement duty" value={report.summary?.replacement} detail="Duties performed for leave coverage" tone="replacement" />
    </Box>
    <Paper elevation={0} sx={{ px: 1.5, py: 0.9, borderRadius: 2.5, border: "1px solid #F2CDD4", background: "#FFF9FA" }}>
      <Typography sx={{ fontSize: 11.5, fontWeight: 850, color: "#7F1D1D" }}>
        Leave split: {report.summary?.leaveWorkingDay || 0} weekday · {report.summary?.leaveWeekend || 0} weekend · {report.summary?.leaveHoliday || 0} holiday · {report.summary?.leaveAppliedWithin24Hours || 0} applied within 24 hours · {report.summary?.leaveAppliedPrior24Hours || 0} applied more than 24 hours earlier
      </Typography>
    </Paper></>}

    {reportMode === "detail" ? <Paper elevation={0} sx={{ overflow: "hidden", borderRadius: 3 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ px: 2, py: 1.4, borderBottom: "1px solid #E2E8F0" }}><Typography sx={{ fontWeight: 950, color: "#0F172A" }}>Activity details</Typography><Chip label={`${rows.length} record(s)`} size="small" sx={{ fontWeight: 850 }} /></Stack>
      {loading ? <Box sx={{ minHeight: 300, display: "grid", placeItems: "center" }}><CircularProgress /></Box> : <Box sx={{ overflow: "auto", maxHeight: "calc(100vh - 420px)" }}>
        <Table stickyHeader size="small"><TableHead><TableRow>
          <TableCell sx={{ fontWeight: 900 }}>Date</TableCell><TableCell sx={{ fontWeight: 900 }}>Applied on</TableCell><TableCell sx={{ fontWeight: 900 }}>Day</TableCell><TableCell sx={{ fontWeight: 900 }}>Type</TableCell><TableCell sx={{ fontWeight: 900 }}>Employee</TableCell><TableCell sx={{ fontWeight: 900 }}>Particular</TableCell><TableCell sx={{ fontWeight: 900 }}>Status</TableCell><TableCell sx={{ fontWeight: 900 }}>Details</TableCell>
        </TableRow></TableHead><TableBody>
          {!rows.length && <TableRow><TableCell colSpan={8} align="center" sx={{ py: 7, color: "#64748B" }}>No activity found for the selected period.</TableCell></TableRow>}
          {rows.map((row) => <TableRow key={`${row.kind}-${row.id}`} hover>
            <TableCell sx={{ whiteSpace: "nowrap", fontWeight: 750 }}>{displayDate(row.date)}{row.endDate && row.endDate !== row.date && <Typography variant="caption" display="block">to {displayDate(row.endDate)}</Typography>}</TableCell>
            <TableCell sx={{ whiteSpace: "nowrap" }}>{row.appliedOn ? new Date(row.appliedOn).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}</TableCell>
            <TableCell>{row.dayLabel ? <Chip size="small" label={row.dayLabel} sx={{ fontWeight: 800, ...(row.isHoliday ? { background: "#FDE8EC", color: "#C62828" } : row.isWeekend ? { background: "#FFF4CC", color: "#9A6700" } : { background: "#F1F5F9", color: "#475569" }) }} /> : "—"}</TableCell>
            <TableCell><Chip size="small" label={row.kind} sx={{ fontWeight: 850, ...(row.kind === "Leave" ? { background: "#FDE8EC", color: "#C62828" } : row.kind === "Training" ? { background: "#F0E7FA", color: "#6A1B9A" } : row.kind === "C-OFF" ? { background: "#FFF4CC", color: "#9A6700" } : { background: "#DCFCE7", color: "#15803D" }) }} /></TableCell>
            <TableCell><Stack spacing={.1}><Typography sx={{ fontSize: 13, fontWeight: 750 }}>{row.employeeName || row.employeeId || "—"}</Typography>{row.employeeId && <Typography variant="caption">{row.employeeId}</Typography>}</Stack></TableCell>
            <TableCell sx={{ fontWeight: 800 }}>{row.title || "—"}</TableCell>
            <TableCell><Chip size="small" label={row.status || "—"} variant="outlined" /></TableCell>
            <TableCell>{row.detail || "—"}{row.groupName && <Typography variant="caption" display="block">{row.groupName}</Typography>}</TableCell>
          </TableRow>)}
        </TableBody></Table>
      </Box>}
    </Paper> : reportMode === "matrix" ? <Paper elevation={0} sx={{ overflow: "hidden", borderRadius: 3 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ px: 2, py: 1.4, borderBottom: "1px solid #E2E8F0" }}><Box><Typography sx={{ fontWeight: 950, color: "#0F172A" }}>Consolidated crew duty and activity matrix</Typography><Typography sx={{ fontSize: 11.5, color: "#64748B" }}>Final roster/assigned duties, replacement duties, approved training and approved leave; approved leave, training and training-linked OFF dates are excluded from duty totals · {displayDate(matrix.startDate)} to {displayDate(matrix.endDate)}</Typography></Box><Chip label={`${matrixRows.length} employee(s)`} size="small" sx={{ fontWeight: 850 }} /></Stack>
      {loading ? <Box sx={{ minHeight: 300, display: "grid", placeItems: "center" }}><CircularProgress /></Box> : <Box sx={{ overflow: "auto", maxHeight: "calc(100vh - 365px)" }}><Table stickyHeader size="small" sx={{ minWidth: 900 }}><TableHead><TableRow>
        <TableCell sx={{ fontWeight: 900, minWidth: 230 }}>Employee</TableCell>
        {showDuties && <><TableCell align="right" sx={{ fontWeight: 900 }}>Shift duty total</TableCell>{visibleDutyCategories.map((category) => <TableCell key={category} align="right" sx={{ fontWeight: 900 }}>{category}</TableCell>)}</>}
        {showReplacement && <TableCell align="right" sx={{ fontWeight: 900 }}>Replacement duties</TableCell>}
        {showTraining && <TableCell align="right" sx={{ fontWeight: 900 }}>Training days (of 7)</TableCell>}
        {showCompOff && <TableCell align="right" sx={{ fontWeight: 900 }}>C-OFF</TableCell>}
        {showLeave && <><TableCell align="right" sx={{ fontWeight: 900 }}>Total leave days</TableCell>{visibleLeaveCategories.map((category) => <TableCell key={category} align="right" sx={{ fontWeight: 900 }}>{category}</TableCell>)}</>}
      </TableRow></TableHead><TableBody>
        {!matrixRows.length && <TableRow><TableCell colSpan={matrixColumnCount} align="center" sx={{ py: 7, color: "#64748B" }}>No {matrixKind === "All" ? "employee activity" : matrixKind.toLowerCase()} found for the selected filters.</TableCell></TableRow>}
        {matrixRows.map((row) => <TableRow key={row.employeeId} hover>
          <TableCell><Typography sx={{ fontWeight: 850 }}>{row.employeeName || row.employeeId}</Typography><Typography variant="caption" display="block">{row.designation || "—"} · {row.employeeId}</Typography><Typography variant="caption" sx={{ color: "#64748B" }}>{(row.departments || []).join(", ") || "No department"}{(row.subDepartments || []).length ? ` / ${row.subDepartments.join(", ")}` : ""}{(row.periodGroupNames || []).length ? ` · ${row.periodGroupNames.join(", ")}` : ""}</Typography></TableCell>
          {showDuties && <><TableCell align="right" sx={{ fontWeight: 850 }}>{row.shiftDutyDays || 0}</TableCell>{visibleDutyCategories.map((category) => <TableCell key={category} align="right">{row.dutyCounts?.[category] || 0}</TableCell>)}</>}
          {showReplacement && <TableCell align="right" sx={{ fontWeight: 850, color: row.replacementDutyDays ? "#15803D" : "inherit" }}>{row.replacementDutyDays || 0}</TableCell>}
          {showTraining && <TableCell align="right"><Button size="small" variant="outlined" disabled={!(row.trainings || []).length} onClick={() => setTrainingDetails(row)} sx={{ minWidth: 72, textTransform: "none", fontWeight: 900, color: "#6A1B9A", borderColor: "#CDB4EA" }}>{row.trainingDays || 0} / {row.trainingTargetDays || matrix.trainingTargetDays || 7}</Button></TableCell>}
          {showCompOff && <TableCell align="right" sx={{ fontWeight: 850, color: row.compOffDays ? "#9A6700" : "inherit" }}>{row.compOffDays || 0}</TableCell>}
          {showLeave && <><TableCell align="right" sx={{ fontWeight: 850 }}>{row.leaveTotal || 0}</TableCell>{visibleLeaveCategories.map((category) => <TableCell key={category} align="right">{row.leaveByType?.[category] || 0}</TableCell>)}</>}
        </TableRow>)}
        {!!matrixRows.length && <TableRow sx={{ "& td": { position: "sticky", bottom: 0, background: "#E8F5F1", fontWeight: 950, borderTop: "2px solid #9FD8C8" } }}>
          <TableCell>Total ({matrixRows.length})</TableCell>
          {showDuties && <><TableCell align="right">{matrixTotals.assignedDutyDays}</TableCell>{visibleDutyCategories.map((category) => <TableCell key={category} align="right">{matrixTotals.dutyCounts[category] || 0}</TableCell>)}</>}
          {showReplacement && <TableCell align="right">{matrixTotals.replacementDutyDays}</TableCell>}
          {showTraining && <TableCell align="right">{matrixTotals.trainingDays}</TableCell>}
          {showCompOff && <TableCell align="right">{matrixTotals.compOffDays}</TableCell>}
          {showLeave && <><TableCell align="right">{matrixTotals.leaveTotal}</TableCell>{visibleLeaveCategories.map((category) => <TableCell key={category} align="right">{matrixTotals.leaveByType[category] || 0}</TableCell>)}</>}
        </TableRow>}
      </TableBody></Table></Box>}
    </Paper> : <Stack spacing={1.5}>
      {crms.sourceWarning && <Alert severity="warning">Live CRMS refresh was unavailable; showing cached CRMS records. {crms.sourceWarning}</Alert>}
      {!loading && !(crms.rows || []).length && !crms.logCount && !crms.sourceWarning && <Alert severity="info">Choose the period, then click <strong>Load report</strong>. CRMS data is not fetched automatically when this tab opens.</Alert>}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2,minmax(0,1fr))", md: "repeat(5,minmax(0,1fr))" }, gap: 1.25 }}>
        {[
          ["CRMS logs", crms.logCount || 0, crms.source || "No source"],
          ["Actual desk duties", crms.summary?.actualAssignments || 0, "Five control-room desks + additional staff"],
          ["Roster matched", `${crms.summary?.matchPercent || 0}%`, `${crms.summary?.matched || 0} actual assignments aligned`],
          ["Exceptions", crms.summary?.exceptions || 0, "Mismatch, missing roster or absent"],
          ["Unmapped names", crms.summary?.unmapped || 0, "Needs employee alias review"],
        ].map(([label, value, detail]) => <Paper key={label} elevation={0} sx={{ p: 1.5, borderRadius: 3, border: "1px solid #D9E7F5", background: label === "Exceptions" || label === "Unmapped names" ? "#FFF8ED" : "#F7FBFF" }}><Typography sx={{ fontSize: 11.5, color: "#475569", fontWeight: 850 }}>{label}</Typography><Typography sx={{ mt: .4, fontSize: 25, lineHeight: 1.1, fontWeight: 950, color: "#0B4F8A" }}>{value}</Typography><Typography sx={{ mt: .5, fontSize: 10.5, color: "#64748B" }}>{detail}</Typography></Paper>)}
      </Box>
      <Paper elevation={0} sx={{ overflow: "hidden", borderRadius: 3 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ px: 2, py: 1.35, borderBottom: "1px solid #E2E8F0" }}><Box><Typography sx={{ fontWeight: 950 }}>Actual CRMS duties by employee</Typography><Typography sx={{ fontSize: 11.5, color: "#64748B" }}>Click an employee to inspect every CRMS desk posting against the final assigned roster.</Typography></Box><Chip size="small" label={`${crmsRows.length} employee(s)`} sx={{ fontWeight: 850 }} /></Stack>
        {loading ? <Box sx={{ minHeight: 260, display: "grid", placeItems: "center" }}><CircularProgress /></Box> : <Box sx={{ overflow: "auto" }}><Table size="small"><TableHead><TableRow><TableCell sx={{ fontWeight: 900 }}>Employee</TableCell><TableCell align="right" sx={{ fontWeight: 900 }}>Actual total</TableCell><TableCell align="right" sx={{ fontWeight: 900 }}>Morning</TableCell><TableCell align="right" sx={{ fontWeight: 900 }}>Evening</TableCell><TableCell align="right" sx={{ fontWeight: 900 }}>Night</TableCell><TableCell align="right" sx={{ fontWeight: 900 }}>Roster matched</TableCell><TableCell align="right" sx={{ fontWeight: 900 }}>Replacement</TableCell><TableCell align="right" sx={{ fontWeight: 900 }}>Exceptions</TableCell><TableCell align="right" sx={{ fontWeight: 900 }}>Rostered absent</TableCell></TableRow></TableHead><TableBody>
          {!crmsRows.length && <TableRow><TableCell colSpan={9} align="center" sx={{ py: 6, color: "#64748B" }}>No CRMS duty data found for the selected filters.</TableCell></TableRow>}
          {crmsRows.map((row) => <TableRow key={row.employeeId || row.employeeName} hover onClick={() => setCrmsEmployeeDetails(row)} sx={{ cursor: "pointer" }}><TableCell><Typography sx={{ fontWeight: 850 }}>{row.employeeName}</Typography><Typography variant="caption">{row.employeeId || "CRMS name not mapped"}</Typography></TableCell><TableCell align="right" sx={{ fontWeight: 900 }}>{row.actualDuties || 0}</TableCell>{["Morning", "Evening", "Night"].map((shift) => <TableCell key={shift} align="right"><Button size="small" onClick={(event) => { event.stopPropagation(); setCrmsOnly(false); setCrmsShiftDetails({ ...row, shift }); }} sx={{ minWidth: 34, px: .5, fontWeight: 900, textTransform: "none", color: "#0057B7" }}>{row[shift] || 0}</Button></TableCell>)}<TableCell align="right" sx={{ color: "#15803D", fontWeight: 850 }}>{row.matched || 0}</TableCell><TableCell align="right">{row.replacementDuties || 0}</TableCell><TableCell align="right" sx={{ color: row.exceptions ? "#C2410C" : "inherit", fontWeight: 850 }}>{row.exceptions || 0}</TableCell><TableCell align="right">{row.rosteredButAbsent || 0}</TableCell></TableRow>)}
        </TableBody></Table></Box>}
      </Paper>
      <Paper elevation={0} sx={{ overflow: "hidden", borderRadius: 3 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ px: 2, py: 1.35, borderBottom: "1px solid #E2E8F0" }}><Box><Typography sx={{ fontWeight: 950 }}>Reconciliation evidence</Typography><Typography sx={{ fontSize: 11.5, color: "#64748B" }}>CRMS name and desk are preserved beside the final Crew assignment for audit.</Typography></Box><Chip size="small" label={`${crmsDetailRows.length} row(s)`} sx={{ fontWeight: 850 }} /></Stack>
        <Box sx={{ overflow: "auto", maxHeight: 430 }}><Table stickyHeader size="small"><TableHead><TableRow><TableCell sx={{ fontWeight: 900 }}>Date / shift</TableCell><TableCell sx={{ fontWeight: 900 }}>CRMS employee</TableCell><TableCell sx={{ fontWeight: 900 }}>Desk</TableCell><TableCell sx={{ fontWeight: 900 }}>Roster / assigned</TableCell><TableCell sx={{ fontWeight: 900 }}>Result</TableCell></TableRow></TableHead><TableBody>
          {!crmsDetailRows.length && <TableRow><TableCell colSpan={5} align="center" sx={{ py: 5, color: "#64748B" }}>No reconciliation evidence matches the filters.</TableCell></TableRow>}
          {crmsDetailRows.map((item) => { const good = ["Matched", "Replacement match", "Reassigned match"].includes(item.status); return <TableRow key={item.id} hover><TableCell sx={{ whiteSpace: "nowrap" }}><Typography sx={{ fontSize: 12.5, fontWeight: 850 }}>{displayDate(item.date)} · {item.shift}</Typography><Typography variant="caption">{item.logKey}</Typography></TableCell><TableCell><Typography sx={{ fontSize: 12.5, fontWeight: 800 }}>{item.crmsName || item.employeeName}</Typography><Typography variant="caption">{item.employeeId ? `${item.employeeName || "Mapped"} · ${item.employeeId}` : `Unmapped · confidence ${Math.round((item.matchConfidence || 0) * 100)}%`}</Typography></TableCell><TableCell>{item.desk}</TableCell><TableCell><Typography sx={{ fontSize: 12.5, fontWeight: 850 }}>{item.assignedDuty}</Typography><Typography variant="caption">{item.groupName || "No group"}{item.replacementFor ? ` · for ${item.replacementFor}` : ""}</Typography></TableCell><TableCell><Chip size="small" label={item.status} sx={{ fontWeight: 850, background: good ? "#DCFCE7" : "#FFF1DD", color: good ? "#15803D" : "#C2410C" }} /></TableCell></TableRow>; })}
        </TableBody></Table></Box>
      </Paper>
    </Stack>}

    <Dialog open={Boolean(trainingDetails)} onClose={() => setTrainingDetails(null)} fullWidth maxWidth="sm">
      <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontWeight: 950 }}>
        Training details
        <IconButton onClick={() => setTrainingDetails(null)}><X size={19} /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {trainingDetails && <Stack spacing={1.25}>
          <Box>
            <Typography sx={{ fontWeight: 950, fontSize: 17 }}>{trainingDetails.employeeName || trainingDetails.employeeId}</Typography>
            <Typography sx={{ color: "#64748B", fontSize: 12 }}>{trainingDetails.employeeId} · {trainingDetails.trainingDays || 0} of {trainingDetails.trainingTargetDays || matrix.trainingTargetDays || 7} training days</Typography>
          </Box>
          {(trainingDetails.trainings || []).map((training) => <Paper key={training.id} variant="outlined" sx={{ p: 1.4, borderColor: "#D8C4EE", background: "#FCF9FF" }}>
            <Stack direction="row" justifyContent="space-between" spacing={1}>
              <Box><Typography sx={{ color: "#4A148C", fontWeight: 900 }}>{training.name}</Typography><Typography sx={{ mt: .3, color: "#64748B", fontSize: 11.5 }}>{displayDate(training.startDate)}{training.endDate && training.endDate !== training.startDate ? ` to ${displayDate(training.endDate)}` : ""}{training.location ? ` · ${training.location}` : ""}</Typography></Box>
              <Chip size="small" label={`${training.days || 0} day(s)`} sx={{ fontWeight: 850, background: "#F0E7FA", color: "#6A1B9A" }} />
            </Stack>
          </Paper>)}
        </Stack>}
      </DialogContent>
    </Dialog>
    <Dialog open={Boolean(crmsEmployeeDetails)} onClose={() => setCrmsEmployeeDetails(null)} fullWidth maxWidth="md">
      <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontWeight: 950 }}>
        CRMS duty evidence · {crmsEmployeeDetails?.employeeName || "Employee"}
        <IconButton onClick={() => setCrmsEmployeeDetails(null)}><X size={19} /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={1}>
          {(crms.details || []).filter((item) => crmsEmployeeDetails && (
            (crmsEmployeeDetails.employeeId && item.employeeId === crmsEmployeeDetails.employeeId)
            || (!crmsEmployeeDetails.employeeId && item.crmsName === crmsEmployeeDetails.employeeName)
          )).map((item) => <Paper key={item.id} variant="outlined" sx={{ p: 1.25, borderColor: "#D9E7F5" }}><Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={1}><Box><Typography sx={{ fontWeight: 900 }}>{displayDate(item.date)} · {item.shift} · {item.desk}</Typography><Typography sx={{ mt: .25, fontSize: 11.5, color: "#64748B" }}>CRMS: {item.crmsName || "Not listed"} · Assigned: {item.assignedDuty}{item.groupName ? ` · ${item.groupName}` : ""}</Typography></Box><Chip size="small" label={item.status} sx={{ alignSelf: "flex-start", fontWeight: 850 }} /></Stack></Paper>)}
        </Stack>
      </DialogContent>
    </Dialog>
    <Dialog open={Boolean(crmsShiftDetails)} onClose={() => setCrmsShiftDetails(null)} fullWidth maxWidth="lg">
      <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontWeight: 950 }}>
        {crmsShiftDetails?.shift || "Shift"} duties · {crmsShiftDetails?.employeeName || "Employee"}
        <IconButton onClick={() => setCrmsShiftDetails(null)}><X size={19} /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={1.5}>
          <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "center" }} gap={1}>
            <Typography sx={{ fontSize: 12, color: "#64748B" }}>CRMS desk postings are checked against the final Crew roster for the selected shift. Red rows require review.</Typography>
            <Button size="small" variant={crmsOnly ? "contained" : "outlined"} onClick={() => setCrmsOnly((current) => !current)} sx={{ textTransform: "none", fontWeight: 850, whiteSpace: "nowrap" }}>
              {crmsOnly ? "Show CRMS & roster" : "CRMS data only"}
            </Button>
          </Stack>
          <Box sx={{ display: "none" }}>
            <Paper variant="outlined" sx={{ overflow: "hidden", borderColor: "#B9D5F7" }}>
              <Stack direction="row" justifyContent="space-between" sx={{ px: 1.5, py: 1, bgcolor: "#F3F8FE", borderBottom: "1px solid #D9E7F5" }}><Typography sx={{ fontWeight: 950 }}>CRMS duties</Typography><Chip size="small" label={`${selectedCrmsShiftRows.length} posting(s)`} /></Stack>
              <Box sx={{ maxHeight: 440, overflow: "auto" }}><Table stickyHeader size="small"><TableHead><TableRow><TableCell sx={{ fontWeight: 900 }}>Date</TableCell><TableCell sx={{ fontWeight: 900 }}>CRMS desk / name</TableCell><TableCell sx={{ fontWeight: 900 }}>Result</TableCell></TableRow></TableHead><TableBody>
                {!selectedCrmsShiftRows.length && <TableRow><TableCell colSpan={3} align="center" sx={{ py: 5, color: "#64748B" }}>No CRMS {crmsShiftDetails?.shift} posting found.</TableCell></TableRow>}
                {selectedCrmsShiftRows.map((item) => { const matched = ["Matched", "Replacement match", "Reassigned match"].includes(item.status); return <TableRow key={item.id} sx={matched ? undefined : { bgcolor: "#FEF2F2", "& td": { borderColor: "#FECACA" } }}><TableCell sx={{ whiteSpace: "nowrap", fontWeight: 800 }}>{displayDate(item.date)}</TableCell><TableCell><Typography sx={{ fontSize: 12.5, fontWeight: 850 }}>{item.desk}</Typography><Typography variant="caption">{item.crmsName || "Not listed"}</Typography></TableCell><TableCell><Chip size="small" label={item.status} sx={{ fontWeight: 850, bgcolor: matched ? "#DCFCE7" : "#FEE2E2", color: matched ? "#15803D" : "#B91C1C" }} /></TableCell></TableRow>; })}
              </TableBody></Table></Box>
            </Paper>
            {!crmsOnly && <Paper variant="outlined" sx={{ overflow: "hidden", borderColor: "#BDE6D4" }}>
              <Stack direction="row" justifyContent="space-between" sx={{ px: 1.5, py: 1, bgcolor: "#F3FCF7", borderBottom: "1px solid #CFE9D9" }}><Typography sx={{ fontWeight: 950 }}>Final roster duties</Typography><Chip size="small" label={`${selectedRosterShiftRows.length} duty day(s)`} /></Stack>
              <Box sx={{ maxHeight: 440, overflow: "auto" }}><Table stickyHeader size="small"><TableHead><TableRow><TableCell sx={{ fontWeight: 900 }}>Date</TableCell><TableCell sx={{ fontWeight: 900 }}>Roster assignment</TableCell><TableCell sx={{ fontWeight: 900 }}>CRMS check</TableCell></TableRow></TableHead><TableBody>
                {!selectedRosterShiftRows.length && <TableRow><TableCell colSpan={3} align="center" sx={{ py: 5, color: "#64748B" }}>No final {crmsShiftDetails?.shift} roster duty found.</TableCell></TableRow>}
                {selectedRosterShiftRows.map((item) => { const result = rosterShiftResult(item); return <TableRow key={item.id} sx={result.mismatch ? { bgcolor: "#FEF2F2", "& td": { borderColor: "#FECACA" } } : undefined}><TableCell sx={{ whiteSpace: "nowrap", fontWeight: 800 }}>{displayDate(item.date)}</TableCell><TableCell><Typography sx={{ fontSize: 12.5, fontWeight: 850 }}>{item.shift}</Typography><Typography variant="caption">{item.groupName || "No group"}{item.replacementDuty ? " · Replacement" : ""}</Typography></TableCell><TableCell><Chip size="small" label={result.label} sx={{ fontWeight: 850, bgcolor: result.mismatch ? "#FEE2E2" : "#DCFCE7", color: result.mismatch ? "#B91C1C" : "#15803D" }} /></TableCell></TableRow>; })}
              </TableBody></Table></Box>
            </Paper>}
          </Box>
          <Paper variant="outlined" sx={{ overflow: "hidden", borderColor: "#B9D5F7" }}>
            <Stack direction="row" justifyContent="space-between" sx={{ px: 1.5, py: 1, bgcolor: "#F3F8FE", borderBottom: "1px solid #D9E7F5" }}><Typography sx={{ fontWeight: 950 }}>CRMS and final roster duty comparison</Typography><Chip size="small" label={`${crmsOnly ? selectedCrmsShiftRows.length : pairedShiftRows.length} row(s)`} /></Stack>
            <Box sx={{ maxHeight: 500, overflow: "auto" }}><Table stickyHeader size="small"><TableHead><TableRow><TableCell sx={{ fontWeight: 900 }}>Date</TableCell><TableCell sx={{ fontWeight: 900 }}>CRMS desk / name</TableCell><TableCell sx={{ fontWeight: 900 }}>CRMS result</TableCell>{!crmsOnly && <><TableCell sx={{ fontWeight: 900 }}>Final roster assignment</TableCell><TableCell sx={{ fontWeight: 900 }}>Roster check</TableCell></>}</TableRow></TableHead><TableBody>
              {!(crmsOnly ? pairedShiftRows.filter((item) => item.crmsRows.length) : pairedShiftRows).length && <TableRow><TableCell colSpan={crmsOnly ? 3 : 5} align="center" sx={{ py: 5, color: "#64748B" }}>No {crmsOnly ? "CRMS posting" : "duty comparison"} found for {crmsShiftDetails?.shift}.</TableCell></TableRow>}
              {(crmsOnly ? pairedShiftRows.filter((item) => item.crmsRows.length) : pairedShiftRows).map((item) => { const crmsMismatched = !item.crmsRows.length || item.crmsRows.some((entry) => !["Matched", "Replacement match", "Reassigned match"].includes(entry.status)); const crmsLabel = !item.crmsRows.length ? "Not in CRMS" : crmsMismatched ? "Mismatch" : "Matched"; const rosterLabel = !item.roster ? "No roster record" : !item.crmsRows.length ? "Not in CRMS" : crmsMismatched ? "Mismatch" : "Matched"; return <TableRow key={item.id} sx={item.mismatch ? { bgcolor: "#FEF2F2", "& td": { borderColor: "#FECACA" } } : undefined}><TableCell sx={{ whiteSpace: "nowrap", fontWeight: 800 }}>{displayDate(item.date)}</TableCell><TableCell>{item.crmsRows.length ? item.crmsRows.map((entry) => <Box key={entry.id} sx={{ mb: .45 }}><Typography sx={{ fontSize: 12.5, fontWeight: 850 }}>{entry.desk}</Typography><Typography variant="caption">{entry.crmsName || "Not listed"}</Typography></Box>) : <Typography variant="caption" sx={{ color: "#B91C1C", fontWeight: 800 }}>No CRMS posting</Typography>}</TableCell><TableCell><Chip size="small" label={crmsLabel} sx={{ fontWeight: 850, bgcolor: crmsMismatched ? "#FEE2E2" : "#DCFCE7", color: crmsMismatched ? "#B91C1C" : "#15803D" }} /></TableCell>{!crmsOnly && <><TableCell>{item.roster ? <><Typography sx={{ fontSize: 12.5, fontWeight: 850 }}>{item.roster.shift}</Typography><Typography variant="caption">{item.roster.groupName || "No group"}{item.roster.assignmentType ? ` · ${item.roster.assignmentType}` : ""}</Typography></> : <Typography variant="caption" sx={{ color: "#B91C1C", fontWeight: 800 }}>No final roster duty</Typography>}</TableCell><TableCell><Chip size="small" label={rosterLabel} sx={{ fontWeight: 850, bgcolor: item.mismatch ? "#FEE2E2" : "#DCFCE7", color: item.mismatch ? "#B91C1C" : "#15803D" }} /></TableCell></>}</TableRow>; })}
            </TableBody></Table></Box>
          </Paper>
        </Stack>
      </DialogContent>
    </Dialog>
  </AppShell>;
}
