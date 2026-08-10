import { useEffect, useMemo, useState } from "react";
import {
  Alert, Box, Button, Checkbox, Chip, CircularProgress, ListItemText, MenuItem, Paper, Stack,
  Tab, Table, TableBody, TableCell, TableHead, TableRow, Tabs, TextField, Typography,
} from "@mui/material";
import { Award, Briefcase, CalendarCheck2, RefreshCw, Repeat2 } from "lucide-react";

import AppShell from "../../components/layout/AppShell";
import api from "../../crewLegacy/api";

const today = () => new Date().toISOString().slice(0, 10);
const yearStart = () => `${new Date().getFullYear()}-01-01`;
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
  const [reportMode, setReportMode] = useState("detail");
  const [report, setReport] = useState({ summary: {}, rows: [], employees: [], canViewAll: false });
  const [matrix, setMatrix] = useState({ leaveCategories: [], rows: [] });
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
      const response = await api.get("/profile/activity-matrix", { params: { startDate, endDate } });
      setMatrix(response.data || { leaveCategories: [], rows: [] });
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Employee activity matrix could not be loaded.");
    } finally {
      setLoading(false);
    }
  };
  const rows = useMemo(() => (report.rows || []).filter((row) => kind === "All" || row.kind === kind), [report.rows, kind]);

  return <AppShell>
    <Paper className="dso-report-banner" elevation={0} sx={{ p: { xs: 2, md: 2.5 }, borderRadius: 3 }}>
      <Stack direction={{ xs: "column", md: "row" }} spacing={2} justifyContent="space-between" alignItems={{ md: "center" }}>
        <Box><Typography sx={{ fontWeight: 950, fontSize: 24 }}>Crew Activity Report</Typography><Typography sx={{ opacity: .9, fontSize: 13, fontWeight: 700 }}>Leave, training, C-OFF and replacement duty history.</Typography></Box>
        <Button variant="outlined" startIcon={<RefreshCw size={16} />} onClick={load} sx={{ color: "#fff", borderColor: "rgba(255,255,255,.72)", textTransform: "none", fontWeight: 900 }}>Refresh</Button>
      </Stack>
    </Paper>

    <Paper elevation={0} sx={{ borderRadius: 3, overflow: "hidden" }}>
      <Tabs value={reportMode} onChange={(_, value) => setReportMode(value)} sx={{ px: 1.25, borderBottom: "1px solid #E2E8F0" }}>
        <Tab value="detail" label="Detailed activity report" sx={{ textTransform: "none", fontWeight: 900 }} />
        <Tab value="matrix" label="Employee activity matrix" sx={{ textTransform: "none", fontWeight: 900 }} />
      </Tabs>
    </Paper>

    <Paper elevation={0} sx={{ p: 2, borderRadius: 3 }}>
      <Stack direction={{ xs: "column", lg: "row" }} spacing={1.25} alignItems={{ lg: "center" }}>
        {reportMode === "detail" && report.canViewAll && <TextField select size="small" label="Employees" value={employeeIds} onChange={(event) => {
          const values = typeof event.target.value === "string" ? event.target.value.split(",") : event.target.value;
          if (!employeeIds.includes("all") && values.includes("all")) setEmployeeIds(["all"]);
          else if (employeeIds.includes("all")) setEmployeeIds(values.filter((value) => value !== "all"));
          else setEmployeeIds(values);
        }} SelectProps={{ multiple: true, renderValue: (selected) => selected.includes("all") ? "All employees" : `${selected.length} employee(s) selected` }} sx={{ minWidth: 255 }}>
          <MenuItem value="all"><Checkbox size="small" checked={employeeIds.includes("all")} /><ListItemText primary="All employees" /></MenuItem>
          {(report.employees || []).map((employee) => <MenuItem key={employee.employeeId} value={employee.employeeId}><Checkbox size="small" checked={employeeIds.includes(employee.employeeId)} /><ListItemText primary={`${employee.name || employee.employeeId} · ${employee.employeeId}`} /></MenuItem>)}
        </TextField>}
        <TextField size="small" type="date" label="From" value={startDate} onChange={(event) => setStartDate(event.target.value)} InputLabelProps={{ shrink: true }} />
        <TextField size="small" type="date" label="To" value={endDate} onChange={(event) => setEndDate(event.target.value)} InputLabelProps={{ shrink: true }} />
        {reportMode === "detail" && <TextField select size="small" label="Show" value={kind} onChange={(event) => setKind(event.target.value)} sx={{ minWidth: 170 }}>
          {["All", "Leave", "Training", "C-OFF", "Replacement duty"].map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}
        </TextField>}
        <Button variant="contained" onClick={reportMode === "matrix" ? loadMatrix : load} sx={{ textTransform: "none", fontWeight: 900, background: "#0057B7" }}>Load report</Button>
      </Stack>
    </Paper>

    {error && <Alert severity="error">{error}</Alert>}
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2,minmax(0,1fr))", md: "repeat(4,minmax(0,1fr))" }, gap: 1.5 }}>
      <SummaryTile title="Leave" value={report.summary?.leave} detail={`${report.summary?.leaveApproved || 0} approved · ${report.summary?.leaveWeekend || 0} weekend · ${report.summary?.leaveHoliday || 0} holiday`} tone="leave" />
      <SummaryTile title="Training" value={report.summary?.training} detail={`${report.summary?.trainingDays || 0} approved day(s)`} tone="training" />
      <SummaryTile title="C-OFF" value={report.summary?.compOff} detail={`${report.summary?.compOffAvailable || 0} available · ${report.summary?.compOffUsedDays || 0} used · ${(report.summary?.compOffDates || []).slice(0, 2).map(displayDate).join(", ") || "no dates"}`} tone="coff" />
      <SummaryTile title="Replacement duty" value={report.summary?.replacement} detail="Duties performed for leave coverage" tone="replacement" />
    </Box>

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
    </Paper> : <Paper elevation={0} sx={{ overflow: "hidden", borderRadius: 3 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ px: 2, py: 1.4, borderBottom: "1px solid #E2E8F0" }}><Box><Typography sx={{ fontWeight: 950, color: "#0F172A" }}>Employee-wise leave and training days</Typography><Typography sx={{ fontSize: 11.5, color: "#64748B" }}>Approved records only. Leave categories are generated from the selected period.</Typography></Box><Chip label={`${matrix.rows?.length || 0} employee(s)`} size="small" sx={{ fontWeight: 850 }} /></Stack>
      {loading ? <Box sx={{ minHeight: 300, display: "grid", placeItems: "center" }}><CircularProgress /></Box> : <Box sx={{ overflow: "auto", maxHeight: "calc(100vh - 420px)" }}><Table stickyHeader size="small"><TableHead><TableRow>
        <TableCell sx={{ fontWeight: 900 }}>Employee</TableCell><TableCell align="right" sx={{ fontWeight: 900 }}>Training days</TableCell><TableCell align="right" sx={{ fontWeight: 900 }}>Total leave days</TableCell>{(matrix.leaveCategories || []).map((category) => <TableCell key={category} align="right" sx={{ fontWeight: 900 }}>{category}</TableCell>)}
      </TableRow></TableHead><TableBody>
        {!matrix.rows?.length && <TableRow><TableCell colSpan={(matrix.leaveCategories?.length || 0) + 3} align="center" sx={{ py: 7, color: "#64748B" }}>Load the matrix report for the selected period.</TableCell></TableRow>}
        {(matrix.rows || []).map((row) => <TableRow key={row.employeeId} hover><TableCell><Typography sx={{ fontWeight: 850 }}>{row.employeeName || row.employeeId}</Typography><Typography variant="caption">{row.designation || "—"} · {row.employeeId}</Typography></TableCell><TableCell align="right" sx={{ fontWeight: 850 }}>{row.trainingDays || 0}</TableCell><TableCell align="right" sx={{ fontWeight: 850 }}>{row.leaveTotal || 0}</TableCell>{(matrix.leaveCategories || []).map((category) => <TableCell key={category} align="right">{row.leaveByType?.[category] || 0}</TableCell>)}</TableRow>)}
      </TableBody></Table></Box>}
    </Paper>}
  </AppShell>;
}
