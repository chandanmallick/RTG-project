import { useEffect, useMemo, useRef, useState } from "react";
import dayjs from "dayjs";
import DatePicker from "react-multi-date-picker";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { CalendarDays, CheckCircle2, GripVertical, RefreshCw, Send, ShieldCheck, User } from "lucide-react";
import api from "./api";

const employeeIdOf = (employee) => String(employee?.employeeId || employee?.userId || "").trim();
const statusColor = (status) => ({
  Approved: "success",
  Forwarded: "info",
  Rejected: "error",
  Withdrawn: "default",
  Cancelled: "default",
  Applied: "warning",
  Pending: "warning",
}[status] || "default");

function StatusChip({ value }) {
  return <Chip size="small" label={value || "Pending"} color={statusColor(value)} variant="outlined" sx={{ fontWeight: 800 }} />;
}

function SectionTitle({ icon: Icon, title, subtitle, count }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1.2, mb: 1.5 }}>
      <Box sx={{ width: 34, height: 34, borderRadius: 2, display: "grid", placeItems: "center", color: "#0057B7", background: "#E8F1FB" }}><Icon size={18} /></Box>
      <Box sx={{ flex: 1 }}>
        <Typography sx={{ fontSize: 16, fontWeight: 900, color: "#0F172A" }}>{title}</Typography>
        {subtitle && <Typography sx={{ fontSize: 11.5, color: "#64748B", fontWeight: 650 }}>{subtitle}</Typography>}
      </Box>
      {count !== undefined && <Chip label={count} size="small" sx={{ fontWeight: 900, color: "#0057B7", background: "#E8F1FB" }} />}
    </Box>
  );
}

export default function LeaveManagement() {
  const [employees, setEmployees] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [dateRange, setDateRange] = useState([]);
  const [rows, setRows] = useState([]);
  const [compOffs, setCompOffs] = useState([]);
  const [reason, setReason] = useState("");
  const [role, setRole] = useState({});
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState(null);
  const dragFill = useRef(null);
  const [selectedWorkflowIds, setSelectedWorkflowIds] = useState([]);
  const [replacementChoices, setReplacementChoices] = useState({});
  const [completedFrom, setCompletedFrom] = useState(dayjs().subtract(1, "day").format("YYYY-MM-DD"));
  const [completedTo, setCompletedTo] = useState("");

  const loadLeaves = async () => {
    const { data } = await api.get("/leave/list", {
      params: { completedFrom: completedFrom || undefined, completedTo: completedTo || undefined },
    });
    setLeaves(data || []);
  };

  const loadPage = async () => {
    setLoading(true);
    try {
      const [employeeResult, typeResult, roleResult, leaveResult] = await Promise.all([
        api.get("/leave/employees"),
        api.get("/leave/leave-types"),
        api.get("/leave/my-role"),
        api.get("/leave/list", { params: { completedFrom, completedTo: completedTo || undefined } }),
      ]);
      const people = employeeResult.data || [];
      const currentId = roleResult.data?.employeeId;
      setEmployees(people);
      setLeaveTypes(typeResult.data || []);
      setRole(roleResult.data || {});
      setLeaves(leaveResult.data || []);
      setSelectedEmployee((current) => current || people.find((item) => employeeIdOf(item) === currentId) || people[0] || null);
    } catch (error) {
      setNotice({ severity: "error", text: error.response?.data?.detail || "Unable to load leave management." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadPage(); }, []);
  useEffect(() => {
    const stopDrag = () => { dragFill.current = null; };
    window.addEventListener("pointerup", stopDrag);
    return () => window.removeEventListener("pointerup", stopDrag);
  }, []);

  useEffect(() => {
    const targetId = employeeIdOf(selectedEmployee);
    if (!targetId) { setCompOffs([]); return; }
    api.get("/leave/comp-off/available", { params: { employeeId: targetId } })
      .then(({ data }) => setCompOffs(data || []))
      .catch(() => setCompOffs([]));
  }, [selectedEmployee]);

  const fetchDuty = async () => {
    if (!selectedEmployee || dateRange.length !== 2) {
      setNotice({ severity: "warning", text: "Select an employee and one continuous date range." });
      return;
    }
    const startDate = dayjs(dateRange[0].toDate()).format("YYYY-MM-DD");
    const endDate = dayjs(dateRange[1].toDate()).format("YYYY-MM-DD");
    setWorking(true);
    try {
      const { data } = await api.get("/leave/duty-detailed", { params: { employeeId: employeeIdOf(selectedEmployee), startDate, endDate } });
      setRows((data || []).map((row) => ({ ...row, selected: true, leaveType: "", compOffId: "" })));
      if (!data?.length) setNotice({ severity: "warning", text: "No published duty rows exist in this range." });
    } catch (error) {
      setNotice({ severity: "error", text: error.response?.data?.detail || "Duty could not be loaded." });
    } finally {
      setWorking(false);
    }
  };

  const updateRow = (index, patch) => setRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
  const setLeaveType = (index, leaveType) => updateRow(index, { leaveType, compOffId: leaveType === "C-OFF" ? rows[index]?.compOffId || "" : "", selected: true });

  const startFill = (event, index) => {
    const leaveType = rows[index]?.leaveType;
    if (!leaveType || leaveType === "C-OFF") return;
    event.preventDefault();
    dragFill.current = { leaveType };
    updateRow(index, { selected: true });
  };
  const continueFill = (index) => {
    if (!dragFill.current) return;
    updateRow(index, { leaveType: dragFill.current.leaveType, compOffId: "", selected: true });
  };

  const submit = async () => {
    const selectedRows = rows.filter((row) => row.selected);
    if (!selectedRows.length) return setNotice({ severity: "warning", text: "Select at least one duty row." });
    const missingType = selectedRows.find((row) => !row.leaveType);
    if (missingType) return setNotice({ severity: "warning", text: `Select a leave type for ${missingType.date}.` });
    const missingCompOff = selectedRows.find((row) => row.leaveType === "C-OFF" && !row.compOffId);
    if (missingCompOff) return setNotice({ severity: "warning", text: `Select a C-OFF credit for ${missingCompOff.date}.` });
    if (!reason.trim()) return setNotice({ severity: "warning", text: "Enter the reason for leave." });
    setWorking(true);
    try {
      const { data } = await api.post("/leave/apply", {
        employeeId: employeeIdOf(selectedEmployee),
        reason: reason.trim(),
        applications: selectedRows.map(({ date, leaveType, compOffId }) => ({ date, leaveType, compOffId: compOffId || null })),
      });
      setNotice({ severity: "success", text: data.message });
      setRows([]);
      setReason("");
      setDateRange([]);
      await loadLeaves();
    } catch (error) {
      setNotice({ severity: "error", text: error.response?.data?.detail || "Leave application failed." });
    } finally {
      setWorking(false);
    }
  };

  const act = async (endpoint, payload, successText) => {
    setWorking(true);
    try {
      const { data } = await api.put(endpoint, payload);
      setNotice({ severity: "success", text: data.message || successText });
      setSelectedWorkflowIds([]);
      await Promise.all([loadLeaves(), selectedEmployee ? api.get("/leave/comp-off/available", { params: { employeeId: employeeIdOf(selectedEmployee) } }).then(({ data: credits }) => setCompOffs(credits || [])) : Promise.resolve()]);
    } catch (error) {
      setNotice({ severity: "error", text: error.response?.data?.detail || "Action could not be completed." });
    } finally {
      setWorking(false);
    }
  };

  const cancelLeave = (leave) => {
    if (!window.confirm(`Cancel leave for ${leave.name} on ${dayjs(leave.date).format("DD MMM YYYY")}?`)) return;
    return act(`/leave/cancel/${leave.id}`, {}, "Leave cancelled.");
  };
  const deleteMaster = async (leave) => {
    if (!window.confirm(`Permanently delete this leave master record for ${leave.name} on ${dayjs(leave.date).format("DD MMM YYYY")}? This cannot be undone.`)) return;
    setWorking(true);
    try {
      const { data } = await api.delete(`/leave/master/${leave.id}`);
      setNotice({ severity: "success", text: data.message || "Leave master record deleted." });
      setSelectedWorkflowIds([]);
      await loadLeaves();
    } catch (error) {
      setNotice({ severity: "error", text: error.response?.data?.detail || "Leave master record could not be deleted." });
    } finally {
      setWorking(false);
    }
  };
  const replacementChoice = (leave, stage) => {
    const key = `${stage}:${leave.id}`;
    if (Object.prototype.hasOwnProperty.call(replacementChoices, key)) return replacementChoices[key];
    if (stage === "dic" && typeof leave.dicReplacementRequired === "boolean") return leave.dicReplacementRequired;
    return Boolean(leave.sicReplacementRequired);
  };
  const setReplacementChoice = (leave, stage, checked) => {
    setReplacementChoices((current) => ({ ...current, [`${stage}:${leave.id}`]: checked }));
  };
  const sicForward = (leave) => act(
    "/leave/sic-forward-bulk",
    { leaves: [{ id: leave.id, replacementRequired: replacementChoice(leave, "sic") }] },
    "Approved and forwarded to Leave Approving Authority.",
  );
  const sicReject = (leave) => act("/leave/sic-reject-bulk", { leaveIds: [leave.id] }, "Leave rejected by SIC.");
  const finalApprove = (leave) => act(
    "/leave/approve-bulk",
    { leaves: [{ id: leave.id, replacementRequired: replacementChoice(leave, "dic") }] },
    "Leave approved.",
  );
  const finalReject = (leave) => act("/leave/reject-bulk", { leaveIds: [leave.id] }, "Leave rejected.");

  const pending = useMemo(() => leaves.filter((leave) => !["Approved", "Rejected", "Withdrawn", "Cancelled"].includes(leave.finalStatus)), [leaves]);
  const completed = useMemo(() => leaves.filter((leave) => ["Approved", "Rejected", "Withdrawn", "Cancelled"].includes(leave.finalStatus)), [leaves]);
  const selectedWorkflowLeaves = useMemo(
    () => pending.filter((leave) => selectedWorkflowIds.includes(leave.id)),
    [pending, selectedWorkflowIds],
  );
  const selectedSicLeaves = useMemo(
    () => selectedWorkflowLeaves.filter((leave) => leave.canSICAct),
    [selectedWorkflowLeaves],
  );
  const selectedFinalLeaves = useMemo(
    () => selectedWorkflowLeaves.filter((leave) => leave.canFinalAct),
    [selectedWorkflowLeaves],
  );
  const usedCompOffIds = rows.map((row) => row.compOffId).filter(Boolean);

  const toggleWorkflowSelection = (leaveId, checked) => {
    setSelectedWorkflowIds((current) => (
      checked
        ? Array.from(new Set([...current, leaveId]))
        : current.filter((item) => item !== leaveId)
    ));
  };
  const toggleAllPendingSelection = (checked) => {
    if (!checked) {
      setSelectedWorkflowIds([]);
      return;
    }
    setSelectedWorkflowIds(pending.filter((leave) => leave.canSICAct || leave.canFinalAct).map((leave) => leave.id));
  };
  const sicForwardBulk = () => {
    if (!selectedSicLeaves.length) return setNotice({ severity: "warning", text: "Select one or more SIC-pending leaves first." });
    return act(
      "/leave/sic-forward-bulk",
      { leaves: selectedSicLeaves.map((leave) => ({ id: leave.id, replacementRequired: replacementChoice(leave, "sic") })) },
      "Approved and forwarded to Leave Approving Authority.",
    );
  };
  const sicRejectBulk = () => {
    if (!selectedSicLeaves.length) return setNotice({ severity: "warning", text: "Select one or more SIC-pending leaves first." });
    return act(
      "/leave/sic-reject-bulk",
      { leaveIds: selectedSicLeaves.map((leave) => leave.id) },
      "Leave rejected by SIC.",
    );
  };
  const finalApproveBulk = () => {
    if (!selectedFinalLeaves.length) return setNotice({ severity: "warning", text: "Select one or more forwarded leaves first." });
    return act(
      "/leave/approve-bulk",
      { leaves: selectedFinalLeaves.map((leave) => ({ id: leave.id, replacementRequired: replacementChoice(leave, "dic") })) },
      "Leave approved.",
    );
  };
  const finalRejectBulk = () => {
    if (!selectedFinalLeaves.length) return setNotice({ severity: "warning", text: "Select one or more forwarded leaves first." });
    return act(
      "/leave/reject-bulk",
      { leaveIds: selectedFinalLeaves.map((leave) => leave.id) },
      "Leave rejected.",
    );
  };
  const refreshCompleted = async () => {
    if (completedFrom && completedTo && completedTo < completedFrom) {
      return setNotice({ severity: "warning", text: "Completed Leave end date cannot be before the start date." });
    }
    setWorking(true);
    try {
      await loadLeaves();
    } catch (error) {
      setNotice({ severity: "error", text: error.response?.data?.detail || "Completed Leave could not be loaded." });
    } finally {
      setWorking(false);
    }
  };

  const workflowTable = (items, completedTable = false) => {
    const selectionEnabled = !completedTable;
    const selectableItems = items.filter((leave) => leave.canSICAct || leave.canFinalAct);
    const hasSicActions = items.some((leave) => leave.canSICAct);
    const hasFinalActions = items.some((leave) => leave.canFinalAct);
    const hasActionColumn = !completedTable || items.some((leave) => leave.canCancel || leave.canDeleteMaster);
    return (
      <Box sx={{ display: "grid", gap: 1.2 }}>
        {!completedTable && (
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1.5, flexWrap: "wrap" }}>
            <Typography sx={{ fontSize: 12.5, color: "#64748B", fontWeight: 700 }}>
              Select multiple rows to approve and forward, or to finalize them in one step.
            </Typography>
            {(hasSicActions || hasFinalActions) && (
              <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
                {hasSicActions && (
                  <>
                    <Button size="small" variant="contained" disabled={!selectedSicLeaves.length} startIcon={<Send size={14} />} onClick={sicForwardBulk}>
                      Approve & Forward Selected ({selectedSicLeaves.length})
                    </Button>
                    <Button size="small" color="error" variant="outlined" disabled={!selectedSicLeaves.length} onClick={sicRejectBulk}>
                      Reject Selected
                    </Button>
                  </>
                )}
                {hasFinalActions && (
                  <>
                    <Button size="small" color="success" variant="contained" disabled={!selectedFinalLeaves.length} startIcon={<CheckCircle2 size={14} />} onClick={finalApproveBulk}>
                      DIC Final Approve Selected ({selectedFinalLeaves.length})
                    </Button>
                    <Button size="small" color="error" variant="outlined" disabled={!selectedFinalLeaves.length} onClick={finalRejectBulk}>
                      Reject Selected
                    </Button>
                  </>
                )}
              </Stack>
            )}
          </Box>
        )}
        <TableContainer sx={{ maxHeight: completedTable ? 360 : 480, border: "1px solid #E2E8F0", borderRadius: 2 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                {selectionEnabled && (
                  <TableCell padding="checkbox">
                    <Checkbox
                      checked={selectableItems.length > 0 && selectableItems.every((leave) => selectedWorkflowIds.includes(leave.id))}
                      indeterminate={selectableItems.some((leave) => selectedWorkflowIds.includes(leave.id)) && !selectableItems.every((leave) => selectedWorkflowIds.includes(leave.id))}
                      onChange={(event) => toggleAllPendingSelection(event.target.checked)}
                    />
                  </TableCell>
                )}
                <TableCell>Employee</TableCell><TableCell>Date</TableCell><TableCell>Group</TableCell><TableCell>Duty Type</TableCell><TableCell>Leave</TableCell>
                <TableCell>SIC</TableCell><TableCell>Final Authority</TableCell><TableCell>Replacement</TableCell><TableCell>Final Status</TableCell>{hasActionColumn && <TableCell align="right">Action</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((leave) => (
                <TableRow key={leave.id} hover>
                  {selectionEnabled && (
                    <TableCell padding="checkbox">
                      <Checkbox disabled={!leave.canSICAct && !leave.canFinalAct} checked={selectedWorkflowIds.includes(leave.id)} onChange={(event) => toggleWorkflowSelection(leave.id, event.target.checked)} />
                    </TableCell>
                  )}
                  <TableCell><Typography sx={{ fontSize: 12.5, fontWeight: 850 }}>{leave.name}</Typography><Typography sx={{ fontSize: 10.5, color: "#64748B" }}>{leave.employeeId}</Typography></TableCell>
                  <TableCell sx={{ whiteSpace: "nowrap" }}>{dayjs(leave.date).format("DD MMM YYYY")}</TableCell>
                  <TableCell>{leave.groupName}</TableCell>
                  <TableCell sx={{ whiteSpace: "nowrap" }}>
                    <Typography sx={{ fontSize: 12, fontWeight: 800, color: "#0F172A" }}>{leave.dutyType || leave.assignedDuty || "-"}</Typography>
                    {leave.assignedDuty && leave.dutyType && leave.assignedDuty !== leave.dutyType && (
                      <Typography sx={{ fontSize: 10.5, color: "#64748B" }}>{leave.assignedDuty}</Typography>
                    )}
                  </TableCell>
                  <TableCell sx={{ fontWeight: 800 }}>{leave.leaveType}</TableCell>
                  <TableCell><StatusChip value={leave.sicApprovalStatus} /></TableCell><TableCell><StatusChip value={leave.deptApprovalStatus} /></TableCell>
                  <TableCell sx={{ minWidth: 190 }}>
                    {leave.canSICAct && <Stack direction="row" alignItems="center"><Checkbox size="small" checked={replacementChoice(leave, "sic")} onChange={(event) => setReplacementChoice(leave, "sic", event.target.checked)} /><Typography sx={{ fontSize: 11.5, fontWeight: 750 }}>Replacement required</Typography></Stack>}
                    {leave.canFinalAct && <Stack><Typography sx={{ fontSize: 10.5, color: "#64748B" }}>SIC decision: {leave.sicReplacementRequired ? "Required" : "Not required"}</Typography><Stack direction="row" alignItems="center"><Checkbox size="small" checked={replacementChoice(leave, "dic")} onChange={(event) => setReplacementChoice(leave, "dic", event.target.checked)} /><Typography sx={{ fontSize: 11.5, fontWeight: 750 }}>DIC final decision</Typography></Stack></Stack>}
                    {!leave.canSICAct && !leave.canFinalAct && (
                      completedTable ? (
                        <Stack spacing={0.2}>
                          <Typography sx={{ fontSize: 10.5, color: "#64748B" }}>SIC: {leave.sicReplacementRequired ? "Required" : "Not required"}</Typography>
                          <Typography sx={{ fontSize: 11, color: leave.replacementRequired ? "#B45309" : "#64748B", fontWeight: 800 }}>
                            DIC final: {leave.replacementRequired ? "Required" : "Not required"}
                          </Typography>
                        </Stack>
                      ) : (
                        <Typography sx={{ fontSize: 11, color: leave.replacementRequired ? "#B45309" : "#64748B", fontWeight: 700 }}>{leave.replacementRequired ? "Required" : "Not required"}</Typography>
                      )
                    )}
                  </TableCell>
                  <TableCell><StatusChip value={leave.finalStatus} /></TableCell>
                  {hasActionColumn && <TableCell align="right" sx={{ minWidth: 280 }}>
                    <Stack direction="row" spacing={0.7} justifyContent="flex-end">
                      {leave.canCancel && <Button size="small" color="warning" variant="outlined" onClick={() => cancelLeave(leave)}>Cancel leave</Button>}
                      {leave.canSICAct && <><Button size="small" variant="contained" startIcon={<Send size={14} />} onClick={() => sicForward(leave)}>Approve & Forward</Button><Button size="small" color="error" variant="outlined" onClick={() => sicReject(leave)}>Reject</Button></>}
                      {leave.canFinalAct && <><Button size="small" color="success" variant="contained" startIcon={<CheckCircle2 size={14} />} onClick={() => finalApprove(leave)}>Final approve</Button><Button size="small" color="error" variant="outlined" onClick={() => finalReject(leave)}>Reject</Button></>}
                      {leave.canDeleteMaster && <Button size="small" color="error" variant="contained" onClick={() => deleteMaster(leave)}>Delete master</Button>}
                      {!leave.canCancel && !leave.canDeleteMaster && !leave.isOwner && !leave.canSICAct && !leave.canFinalAct && <Typography sx={{ fontSize: 11, color: "#94A3B8" }}>Awaiting action</Typography>}
                    </Stack>
                  </TableCell>}
                </TableRow>
              ))}
              {!items.length && <TableRow><TableCell colSpan={completedTable ? (hasActionColumn ? 10 : 9) : 11} align="center" sx={{ py: 4, color: "#94A3B8" }}>No records</TableCell></TableRow>}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    );
  };

  if (loading) return <Box sx={{ minHeight: 420, display: "grid", placeItems: "center" }}><CircularProgress /></Box>;

  return (
    <Box className="ui-kit-page" sx={{ display: "grid", gap: 2.5 }}>
      <Paper sx={{ p: 3, color: "#fff", background: "linear-gradient(135deg,#08103A,#0057B7 70%,#0F6FDB)", border: 0 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}><CalendarDays size={28} /><Box><Typography sx={{ fontSize: 24, fontWeight: 950 }}>Leave Application & Approval</Typography><Typography sx={{ fontSize: 12.5, opacity: .82 }}>Employee → Shift-in-Charge → Leave Approving Authority</Typography></Box></Box>
      </Paper>

      {notice && <Alert severity={notice.severity} onClose={() => setNotice(null)}>{notice.text}</Alert>}

      <Paper sx={{ p: 2.5 }}>
        <SectionTitle icon={User} title="Apply Leave" subtitle={role.isSIC && !role.isAdmin ? `As SIC, you may apply for members of ${role.groupName}.` : "Select one continuous duty-date range."} />
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr auto" }, gap: 1.5, alignItems: "center" }}>
          <Autocomplete options={employees} value={selectedEmployee} disabled={employees.length === 1} onChange={(_, value) => { setSelectedEmployee(value); setRows([]); }} getOptionLabel={(item) => `${item.name || employeeIdOf(item)} — ${item.designation || "Employee"}`} isOptionEqualToValue={(a, b) => employeeIdOf(a) === employeeIdOf(b)} renderInput={(params) => <TextField {...params} label="Employee" helperText={employees.length === 1 ? "Only your own name is available" : "Current group members"} />} />
          <DatePicker range rangeHover value={dateRange} onChange={(value) => { setDateRange(value || []); setRows([]); }} format="DD MMM YYYY" numberOfMonths={2} showOtherDays render={(value, openCalendar) => <TextField fullWidth label="Continuous date range" value={value || ""} onClick={openCalendar} InputProps={{ readOnly: true }} />} />
          <Button variant="contained" onClick={fetchDuty} disabled={working} startIcon={<RefreshCw size={16} />} sx={{ minHeight: 48, px: 3 }}>Load duty</Button>
        </Box>
      </Paper>

      {!!rows.length && <Paper sx={{ p: 2.5 }}>
        <SectionTitle icon={CalendarDays} title="Leave Entry Grid" subtitle="Choose a leave type, then drag its blue handle across other rows to fill. C-OFF must be selected individually." count={rows.filter((row) => row.selected).length} />
        <TableContainer sx={{ border: "1px solid #CBD5E1", borderRadius: 2, maxHeight: 520 }}><Table size="small" stickyHeader>
          <TableHead><TableRow><TableCell padding="checkbox"><Checkbox checked={rows.every((row) => row.selected)} indeterminate={rows.some((row) => row.selected) && !rows.every((row) => row.selected)} onChange={(event) => setRows((current) => current.map((row) => ({ ...row, selected: event.target.checked })))} /></TableCell><TableCell>Date</TableCell><TableCell>Duty</TableCell><TableCell>Group</TableCell><TableCell>Others on Leave</TableCell><TableCell sx={{ minWidth: 260 }}>Leave Type / C-OFF Credit</TableCell><TableCell width={48}>Fill</TableCell></TableRow></TableHead>
          <TableBody>{rows.map((row, index) => <TableRow key={row.date} hover onPointerEnter={() => continueFill(index)} sx={{ background: row.selected ? "#F8FBFF" : "#fff" }}>
            <TableCell padding="checkbox"><Checkbox checked={row.selected} onChange={(event) => updateRow(index, { selected: event.target.checked })} /></TableCell>
            <TableCell sx={{ fontWeight: 850, whiteSpace: "nowrap" }}>{dayjs(row.date).format("ddd, DD MMM YYYY")}</TableCell><TableCell>{row.assignedDuty || "-"}</TableCell><TableCell>{row.groupName}</TableCell>
            <TableCell>{row.othersOnLeave?.length ? row.othersOnLeave.map((person) => <Chip key={person.employeeId} label={person.name} size="small" color="warning" variant="outlined" sx={{ mr: .5 }} />) : "-"}</TableCell>
            <TableCell><Stack spacing={.8}><FormControl size="small" fullWidth><InputLabel>Leave type</InputLabel><Select value={row.leaveType} label="Leave type" onChange={(event) => setLeaveType(index, event.target.value)}>{leaveTypes.map((type) => <MenuItem key={type.value} value={type.value}>{type.label}</MenuItem>)}</Select></FormControl>{row.leaveType === "C-OFF" && <FormControl size="small" fullWidth><InputLabel>C-OFF credit</InputLabel><Select value={row.compOffId} label="C-OFF credit" onChange={(event) => updateRow(index, { compOffId: event.target.value })}>{compOffs.filter((credit) => !usedCompOffIds.includes(credit.id) || credit.id === row.compOffId).map((credit) => <MenuItem key={credit.id} value={credit.id}>{dayjs(credit.earnedDate).format("DD MMM YYYY")} · expires {dayjs(credit.expiryDate).format("DD MMM YYYY")}</MenuItem>)}</Select></FormControl>}</Stack></TableCell>
            <TableCell><Box onPointerDown={(event) => startFill(event, index)} title={row.leaveType === "C-OFF" ? "C-OFF cannot be drag-filled" : "Drag to fill this leave type"} sx={{ width: 30, height: 30, borderRadius: 1.5, display: "grid", placeItems: "center", color: row.leaveType && row.leaveType !== "C-OFF" ? "#fff" : "#94A3B8", background: row.leaveType && row.leaveType !== "C-OFF" ? "#0057B7" : "#E2E8F0", cursor: row.leaveType && row.leaveType !== "C-OFF" ? "ns-resize" : "not-allowed", touchAction: "none" }}><GripVertical size={16} /></Box></TableCell>
          </TableRow>)}</TableBody>
        </Table></TableContainer>
        <TextField fullWidth multiline minRows={2} label="Reason" value={reason} onChange={(event) => setReason(event.target.value)} sx={{ mt: 2 }} />
        <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 1.5 }}><Button variant="contained" startIcon={<Send size={16} />} onClick={submit} disabled={working}>Submit to SIC</Button></Box>
      </Paper>}

      <Paper sx={{ p: 2.5 }}><SectionTitle icon={ShieldCheck} title="Pending Leave Workflow" subtitle="Actions appear only for the employee, assigned SIC, or configured Leave Approving Authority." count={pending.length} />{workflowTable(pending)}</Paper>
      <Paper sx={{ p: 2.5 }}>
        <SectionTitle icon={CheckCircle2} title="Completed Leave" subtitle="Approved, rejected, withdrawn, and cancelled applications. Default view starts from yesterday." count={completed.length} />
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.2} alignItems={{ sm: "center" }} sx={{ mb: 1.5 }}>
          <TextField size="small" type="date" label="From date" value={completedFrom} onChange={(event) => setCompletedFrom(event.target.value)} InputLabelProps={{ shrink: true }} />
          <TextField size="small" type="date" label="To date (optional)" value={completedTo} inputProps={{ min: completedFrom || undefined }} onChange={(event) => setCompletedTo(event.target.value)} InputLabelProps={{ shrink: true }} />
          <Button variant="outlined" startIcon={<RefreshCw size={15} />} onClick={refreshCompleted} disabled={working}>Load completed leave</Button>
          <Typography sx={{ fontSize: 11.5, color: "#64748B" }}>{completedTo ? "Showing selected date range" : "Showing from the start date onward"}</Typography>
        </Stack>
        {workflowTable(completed, true)}
      </Paper>
      {working && <Box sx={{ position: "fixed", inset: 0, zIndex: 1700, display: "grid", placeItems: "center", background: "rgba(8,16,58,.16)", pointerEvents: "none" }}><CircularProgress /></Box>}
    </Box>
  );
}
