import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert, Autocomplete, Box, Button, Chip, CircularProgress, FormControlLabel, Grid,
  MenuItem, Paper, Stack, Switch, Table, TableBody, TableCell, TableHead, TableRow,
  TableSortLabel, TextField, Typography,
} from "@mui/material";
import { CalendarPlus, Download, FileSpreadsheet, RefreshCw, Upload } from "lucide-react";

import AppShell from "../components/layout/AppShell";
import GlassCard from "../components/ui/GlassCard";
import crewApi from "../services/crewApi";

const localDate = (value) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
const yesterday = () => {
  const value = new Date();
  value.setDate(value.getDate() - 1);
  return localDate(value);
};

export default function PastCompOffAdmin() {
  const fileRef = useRef(null);
  const [employees, setEmployees] = useState([]);
  const [groups, setGroups] = useState([]);
  const [history, setHistory] = useState([]);
  const [selected, setSelected] = useState([]);
  const [earnedDate, setEarnedDate] = useState("");
  const [reason, setReason] = useState("Duty performed on holiday while roster was not published");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [historyScope, setHistoryScope] = useState("manual");
  const [historySearch, setHistorySearch] = useState("");
  const [historyGroup, setHistoryGroup] = useState("all");
  const [historyStatus, setHistoryStatus] = useState("all");
  const [historyFrom, setHistoryFrom] = useState("");
  const [historyTo, setHistoryTo] = useState("");
  const [sortBy, setSortBy] = useState("earnedDate");
  const [sortDirection, setSortDirection] = useState("desc");

  const load = async (scope = historyScope) => {
    setLoading(true);
    try {
      const [people, groupData, credits] = await Promise.all([
        crewApi.employees(), crewApi.groups(), crewApi.manualCompOffs(scope),
      ]);
      setEmployees(people || []);
      setGroups(groupData || []);
      setHistory(credits || []);
    } catch (error) {
      setMessage({ severity: "error", text: error.response?.data?.detail || "Unable to load past C-OFF administration." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const employeeById = useMemo(() => new Map(employees.map((item) => [String(item.employeeId || item.userId || "").trim(), item])), [employees]);
  const shiftEmployees = useMemo(() => {
    const values = new Map();
    groups.filter((group) => group.isActive !== false).forEach((group) => {
      [group.shiftInCharge, ...(group.members || [])].filter(Boolean).forEach((person) => {
        const employeeId = String(person.employeeId || person.userId || person.id || "").trim();
        if (employeeId) values.set(employeeId, { ...(employeeById.get(employeeId) || person), employeeId, groupName: group.groupName });
      });
    });
    return [...values.values()].sort((a, b) => String(a.name || a.employeeId).localeCompare(String(b.name || b.employeeId)));
  }, [employeeById, groups]);

  const historyGroups = useMemo(() => [...new Set(history.map((item) => item.groupName).filter(Boolean))].sort(), [history]);
  const visibleHistory = useMemo(() => {
    const search = historySearch.trim().toLowerCase();
    const valueFor = (item, key) => {
      if (key === "employee") return `${item.employeeName || ""} ${item.employeeId || ""}`.toLowerCase();
      return String(item[key] || "").toLowerCase();
    };
    return history
      .filter((item) => !search || `${item.employeeName || ""} ${item.employeeId || ""} ${item.reason || ""}`.toLowerCase().includes(search))
      .filter((item) => historyGroup === "all" || item.groupName === historyGroup)
      .filter((item) => historyStatus === "all" || (item.status || "Available") === historyStatus)
      .filter((item) => !historyFrom || String(item.earnedDate || "") >= historyFrom)
      .filter((item) => !historyTo || String(item.earnedDate || "") <= historyTo)
      .sort((left, right) => {
        const first = valueFor(left, sortBy);
        const second = valueFor(right, sortBy);
        const result = first.localeCompare(second, undefined, { numeric: true, sensitivity: "base" });
        return sortDirection === "asc" ? result : -result;
      });
  }, [history, historyFrom, historyGroup, historySearch, historyStatus, historyTo, sortBy, sortDirection]);

  const changeSort = (field) => {
    if (sortBy === field) setSortDirection((current) => current === "asc" ? "desc" : "asc");
    else {
      setSortBy(field);
      setSortDirection("asc");
    }
  };

  const sortableHeading = (label, field) => (
    <TableSortLabel active={sortBy === field} direction={sortBy === field ? sortDirection : "asc"} onClick={() => changeSort(field)}>
      {label}
    </TableSortLabel>
  );

  const expiryDate = earnedDate ? `${Number(earnedDate.slice(0, 4)) + 1}-03-31` : "";

  const save = async () => {
    if (!selected.length || !earnedDate || !reason.trim()) {
      setMessage({ severity: "warning", text: "Select shift employee(s), a past earned date and the reason." });
      return;
    }
    setSaving(true);
    try {
      const result = await crewApi.addManualCompOff({ employeeIds: selected.map((item) => item.employeeId), earnedDate, reason: reason.trim() });
      setMessage({ severity: "success", text: result.message });
      setSelected([]);
      setHistory(await crewApi.manualCompOffs(historyScope));
    } catch (error) {
      setMessage({ severity: "error", text: error.response?.data?.detail || error.message || "C-OFF credit could not be added." });
    } finally {
      setSaving(false);
    }
  };

  const downloadTemplate = async () => {
    try {
      const response = await crewApi.manualCompOffTemplate();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(response.data);
      link.download = "Past_C-OFF_Import_Template.xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
    } catch (error) {
      setMessage({ severity: "error", text: error.response?.data?.detail || "Excel template could not be downloaded." });
    }
  };

  const importExcel = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    try {
      const result = await crewApi.importManualCompOff(file);
      setImportResult(result);
      setMessage({ severity: result.errors?.length ? "warning" : "success", text: result.message });
      setHistory(await crewApi.manualCompOffs(historyScope));
    } catch (error) {
      setMessage({ severity: "error", text: error.response?.data?.detail || error.message || "Excel import failed." });
    } finally {
      setImporting(false);
    }
  };

  return (
    <AppShell>
      <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems={{ md: "center" }} gap={2}>
        <Box>
          <Typography sx={{ fontSize: 12, fontWeight: 900, color: "#17876D", letterSpacing: ".12em", textTransform: "uppercase" }}>Admin Module</Typography>
          <Typography variant="h4" sx={{ fontWeight: 900, color: "#0F172A", letterSpacing: "-.035em", mt: .5 }}>Past C-OFF Administration</Typography>
          <Typography sx={{ color: "#64748B", mt: .5 }}>Credit old holiday duties to active shift-group employees. Only dates before today are accepted.</Typography>
        </Box>
        <Button onClick={load} disabled={loading} startIcon={<RefreshCw size={17} />} variant="outlined" sx={{ borderRadius: 3, textTransform: "none", fontWeight: 900 }}>Refresh</Button>
      </Stack>

      {message && <Alert severity={message.severity} onClose={() => setMessage(null)}>{message.text}</Alert>}
      {loading ? <Box sx={{ minHeight: 420, display: "grid", placeItems: "center" }}><CircularProgress sx={{ color: "#03624C" }} /></Box> : <>
        <GlassCard hover={false} padding={0} sx={{ overflow: "hidden" }}>
          <Box sx={{ p: 2.5, borderBottom: "1px solid #E2E8F0", background: "#FFFDF5" }}>
            <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems={{ md: "center" }} gap={1.5}>
              <Box><Stack direction="row" spacing={1} alignItems="center"><CalendarPlus size={20} color="#B45309" /><Typography sx={{ fontWeight: 900, fontSize: 18 }}>Single / common-date credit</Typography></Stack><Typography sx={{ color: "#64748B", fontSize: 13, mt: .5 }}>Use this when one or more employees earned C-OFF on the same past date.</Typography></Box>
              <Chip label="Administrator only" size="small" sx={{ color: "#92400E", background: "#FEF3C7", fontWeight: 900 }} />
            </Stack>
          </Box>
          <Box sx={{ p: 2.5 }}>
            <Grid container spacing={2} alignItems="flex-start">
              <Grid item xs={12} lg={5}><Autocomplete multiple disableCloseOnSelect options={shiftEmployees} value={selected} onChange={(_, value) => setSelected(value)} getOptionLabel={(option) => `${option.name || option.employeeId} (${option.employeeId}) · ${option.groupName}`} isOptionEqualToValue={(option, value) => option.employeeId === value.employeeId} renderInput={(params) => <TextField {...params} label="Shift employee(s)" placeholder="Select one or more persons" />} /><Button size="small" onClick={() => setSelected(shiftEmployees)} disabled={!shiftEmployees.length || selected.length === shiftEmployees.length} sx={{ mt: .5, textTransform: "none", fontWeight: 850 }}>Select all active shift employees</Button></Grid>
              <Grid item xs={12} sm={5} lg={2}><TextField fullWidth type="date" label="Earned date" value={earnedDate} onChange={(event) => setEarnedDate(event.target.value)} InputLabelProps={{ shrink: true }} inputProps={{ max: yesterday() }} helperText={expiryDate ? `Expires ${expiryDate}` : "Past date only"} /></Grid>
              <Grid item xs={12} sm={7} lg={3}><TextField fullWidth label="Reason / holiday" value={reason} onChange={(event) => setReason(event.target.value)} inputProps={{ maxLength: 300 }} helperText="Stored in the C-OFF audit record" /></Grid>
              <Grid item xs={12} lg={2}><Button fullWidth variant="contained" startIcon={<CalendarPlus size={17} />} onClick={save} disabled={saving || !selected.length || !earnedDate || !reason.trim()} sx={{ minHeight: 56, borderRadius: 2.5, textTransform: "none", fontWeight: 900, background: "#B45309", "&:hover": { background: "#92400E" } }}>{saving ? "Adding…" : `Add C-OFF (${selected.length})`}</Button></Grid>
            </Grid>
          </Box>
        </GlassCard>

        <GlassCard hover={false} padding={2.5}>
          <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems={{ md: "center" }} gap={2}>
            <Box><Stack direction="row" spacing={1} alignItems="center"><FileSpreadsheet size={20} color="#03624C" /><Typography sx={{ fontWeight: 900, fontSize: 18 }}>Excel bulk credit</Typography></Stack><Typography sx={{ color: "#64748B", fontSize: 13, mt: .5 }}>Columns: Employee No, Earned Date, Reason / Holiday. One employee-date credit per row.</Typography></Box>
            <Stack direction="row" spacing={1}><Button variant="outlined" startIcon={<Download size={16} />} onClick={downloadTemplate} sx={{ textTransform: "none", fontWeight: 900 }}>Download template</Button><input ref={fileRef} hidden type="file" accept=".xlsx,.xlsm" onChange={importExcel} /><Button variant="contained" startIcon={<Upload size={16} />} onClick={() => fileRef.current?.click()} disabled={importing} sx={{ textTransform: "none", fontWeight: 900, background: "#03624C" }}>{importing ? "Importing…" : "Upload Excel"}</Button></Stack>
          </Stack>
          {importResult && (importResult.skipped?.length > 0 || importResult.errors?.length > 0) && <Paper variant="outlined" sx={{ mt: 2, p: 1.5, borderRadius: 2, maxHeight: 220, overflow: "auto" }}><Typography sx={{ fontWeight: 900, mb: .75 }}>Rows requiring review</Typography>{[...(importResult.errors || []), ...(importResult.skipped || [])].map((item, index) => <Typography key={`${item.row}-${index}`} sx={{ fontSize: 12.5, color: "#9A3412" }}>Row {item.row}: {item.employeeId ? `${item.employeeId} — ` : ""}{item.reason}</Typography>)}</Paper>}
        </GlassCard>

        <GlassCard hover={false} padding={0} sx={{ overflow: "hidden" }}>
          <Box sx={{ px: 2.5, py: 2, borderBottom: "1px solid #E2E8F0" }}>
            <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems={{ md: "center" }} gap={1}>
              <Box><Typography sx={{ fontWeight: 900, fontSize: 18 }}>{historyScope === "all" ? "All C-OFF history" : "Manual credit history"}</Typography><Typography sx={{ color: "#64748B", fontSize: 12.5 }}>{historyScope === "all" ? "Every roster, replacement and administrator-generated C-OFF credit." : "Administrator-entered credits only."}</Typography></Box>
              <FormControlLabel
                control={<Switch checked={historyScope === "all"} color="success" onChange={async (event) => { const scope = event.target.checked ? "all" : "manual"; setHistoryScope(scope); setLoading(true); try { setHistory(await crewApi.manualCompOffs(scope)); } catch (error) { setMessage({ severity: "error", text: error.response?.data?.detail || "C-OFF history could not be loaded." }); } finally { setLoading(false); } }} />}
                label={<Typography sx={{ fontWeight: 900 }}>Show all generated C-OFF</Typography>}
              />
            </Stack>
            <Grid container spacing={1.25} mt={1}>
              <Grid item xs={12} md={4}><TextField fullWidth size="small" label="Employee / number / reason" value={historySearch} onChange={(event) => setHistorySearch(event.target.value)} /></Grid>
              <Grid item xs={6} md={2}><TextField select fullWidth size="small" label="Group" value={historyGroup} onChange={(event) => setHistoryGroup(event.target.value)}><MenuItem value="all">All groups</MenuItem>{historyGroups.map((group) => <MenuItem key={group} value={group}>{group}</MenuItem>)}</TextField></Grid>
              <Grid item xs={6} md={2}><TextField select fullWidth size="small" label="Status" value={historyStatus} onChange={(event) => setHistoryStatus(event.target.value)}><MenuItem value="all">All statuses</MenuItem>{["Available", "Reserved", "Used", "Expired"].map((status) => <MenuItem key={status} value={status}>{status}</MenuItem>)}</TextField></Grid>
              <Grid item xs={6} md={2}><TextField fullWidth size="small" type="date" label="Earned from" value={historyFrom} onChange={(event) => setHistoryFrom(event.target.value)} InputLabelProps={{ shrink: true }} /></Grid>
              <Grid item xs={6} md={2}><TextField fullWidth size="small" type="date" label="Earned to" value={historyTo} onChange={(event) => setHistoryTo(event.target.value)} InputLabelProps={{ shrink: true }} /></Grid>
            </Grid>
            <Typography sx={{ color: "#64748B", fontSize: 11.5, mt: 1 }}>{visibleHistory.length} of {history.length} credit(s) shown</Typography>
          </Box>
          <Box sx={{ overflowX: "auto", maxHeight: 520 }}>
            <Table size="small" stickyHeader>
              <TableHead><TableRow sx={{ background: "#F8FAFC" }}><TableCell sx={{ fontWeight: 900 }}>{sortableHeading("Employee", "employee")}</TableCell><TableCell sx={{ fontWeight: 900 }}>{sortableHeading("Group", "groupName")}</TableCell><TableCell sx={{ fontWeight: 900 }}>{sortableHeading("Earned date", "earnedDate")}</TableCell><TableCell sx={{ fontWeight: 900 }}>{sortableHeading("Expiry", "expiryDate")}</TableCell><TableCell sx={{ fontWeight: 900 }}>{sortableHeading("Status", "status")}</TableCell><TableCell sx={{ fontWeight: 900 }}>{sortableHeading("Source", "source")}</TableCell><TableCell sx={{ fontWeight: 900 }}>{sortableHeading("Reason", "reason")}</TableCell><TableCell sx={{ fontWeight: 900 }}>{sortableHeading("Entered by", "createdByName")}</TableCell></TableRow></TableHead>
              <TableBody>
                {visibleHistory.map((credit) => <TableRow key={credit.id} hover><TableCell><Typography sx={{ fontSize: 12.5, fontWeight: 900 }}>{credit.employeeName || credit.employeeId}</Typography><Typography sx={{ color: "#64748B", fontSize: 10.5 }}>{credit.employeeId}</Typography></TableCell><TableCell>{credit.groupName || "-"}</TableCell><TableCell>{credit.earnedDate || "-"}</TableCell><TableCell>{credit.expiryDate || "-"}</TableCell><TableCell><Chip size="small" label={credit.status || "Available"} color={credit.status === "Available" ? "success" : "default"} sx={{ fontWeight: 850 }} /></TableCell><TableCell><Chip size="small" variant="outlined" label={credit.source || "System"} /></TableCell><TableCell sx={{ minWidth: 240 }}>{credit.reason || "-"}</TableCell><TableCell>{credit.createdByName || (credit.source === "ManualAdmin" ? "Administrator" : "System")}</TableCell></TableRow>)}
                {!visibleHistory.length && <TableRow><TableCell colSpan={8} align="center" sx={{ py: 3, color: "#64748B" }}>No C-OFF credits match the selected filters.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </Box>
        </GlassCard>
      </>}
    </AppShell>
  );
}
