import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import {
  Alert,
  Box,
  Button,
  Chip,
  FormControl,
  Grid,
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
  Typography,
} from "@mui/material";
import { ArrowLeftRight, CalendarRange, RefreshCw, Scale, UserCheck } from "lucide-react";
import api from "../../crewLegacy/api";

const Field = ({ label, children, helper }) => (
  <Box sx={{ minWidth: 0 }}>
    <Typography sx={{ mb: .65, color: "#334155", fontSize: 12, lineHeight: 1.25, fontWeight: 850 }}>{label}</Typography>
    {children}
    {helper && <Typography sx={{ mt: .45, color: "#64748B", fontSize: 10.5 }}>{helper}</Typography>}
  </Box>
);

const employeeLabel = (item) => (
  `${item?.name || item?.employeeId || "-"} (${item?.employeeId || "-"}) · ${item?.assignedDuty || "No duty"} · ${item?.groupName || "No group"}`
);

const SHIFT_OPTIONS = ["Morning", "Evening", "Night", "M1", "M2", "E1", "E2", "N1", "N2"];

export default function DutyReassignmentPanel({
  initialDate,
  initialMode = "exchange",
  initialLeave = null,
  initialRequestId = "",
  onChanged,
  defaultExpanded = true,
}) {
  const [date, setDate] = useState(initialDate || dayjs().format("YYYY-MM-DD"));
  const [role, setRole] = useState({});
  const [mode, setMode] = useState(initialMode);
  const [employees, setEmployees] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [history, setHistory] = useState([]);
  const [exchangeRequests, setExchangeRequests] = useState([]);
  const [firstId, setFirstId] = useState("");
  const [secondId, setSecondId] = useState("");
  const [destinationDate, setDestinationDate] = useState(dayjs(initialDate || undefined).add(1, "day").format("YYYY-MM-DD"));
  const [destinationDuty, setDestinationDuty] = useState("");
  const [destinationEmployees, setDestinationEmployees] = useState([]);
  const [dutyDebits, setDutyDebits] = useState([]);
  const [balanceAction, setBalanceAction] = useState("defer");
  const [debitId, setDebitId] = useState("");
  const [leaveId, setLeaveId] = useState(initialLeave?.id || "");
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(false);

  const canManage = Boolean(role.isAdmin || role.isDeptIC || role.isLeaveAuthority);
  const actorId = String(role.employeeId || "");

  const load = async () => {
    setLoading(true);
    try {
      const roleResult = await api.get("/leave/my-role");
      const nextRole = roleResult.data || {};
      const manager = Boolean(nextRole.isAdmin || nextRole.isDeptIC || nextRole.isLeaveAuthority);
      const requests = [
        api.get("/replacement/duty-switch/options", { params: { date } }),
        api.get("/replacement/duty-switch/exchange-requests", { params: { status: "Pending" } }),
      ];
      if (manager) {
        requests.push(api.get("/replacement/pending"));
        requests.push(api.get("/replacement/duty-switch/history", {
          params: {
            startDate: dayjs(date).subtract(30, "day").format("YYYY-MM-DD"),
            endDate: dayjs(date).add(90, "day").format("YYYY-MM-DD"),
          },
        }));
        requests.push(api.get("/replacement/duty-switch/debits", { params: { authorityDate: date } }));
      }
      const [optionResult, exchangeResult, leaveResult, historyResult, debitResult] = await Promise.all(requests);
      setRole(nextRole);
      setEmployees(optionResult.data || []);
      setExchangeRequests(exchangeResult.data || []);
      const fetchedLeaves = leaveResult?.data || [];
      setLeaves(
        initialLeave && !fetchedLeaves.some((item) => item.id === initialLeave.id)
          ? [...fetchedLeaves, initialLeave]
          : fetchedLeaves
      );
      setHistory(historyResult?.data || []);
      setDutyDebits(debitResult?.data || []);
      setFirstId((current) => manager ? current : String(nextRole.employeeId || ""));
      setMode((current) => manager ? current : "exchange");
    } catch (error) {
      setNotice({ severity: "error", text: error.response?.data?.detail || "Duty reassignment data could not be loaded." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [date]);

  useEffect(() => {
    if (!initialRequestId || !exchangeRequests.some((item) => String(item.id) === String(initialRequestId))) return;
    window.setTimeout(() => document.getElementById(`duty-exchange-request-${initialRequestId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 180);
  }, [exchangeRequests, initialRequestId]);

  useEffect(() => {
    if (!canManage || mode !== "cross_date" || !destinationDate) {
      setDestinationEmployees([]);
      return;
    }
    api.get("/replacement/duty-switch/options", { params: { date: destinationDate } })
      .then((result) => setDestinationEmployees(result.data || []))
      .catch((error) => {
        setDestinationEmployees([]);
        setNotice({ severity: "error", text: error.response?.data?.detail || "Destination-date duties could not be loaded." });
      });
  }, [canManage, mode, destinationDate]);

  const first = employees.find((item) => item.employeeId === firstId);
  const second = employees.find((item) => item.employeeId === secondId);
  const destinationAssignment = destinationEmployees.find((item) => item.employeeId === firstId);
  const selectedLeave = leaves.find((item) => item.id === leaveId);
  const leavesForSourceDate = leaves.filter((item) => item.date === date);
  const exchangeEmployees = useMemo(
    () => employees.filter((item) => item.employeeId !== firstId && !item.onLeave),
    [employees, firstId],
  );
  const employeeDebits = useMemo(
    () => dutyDebits.filter((item) => String(item.employeeId) === String(firstId)),
    [dutyDebits, firstId],
  );
  const selectedDebit = employeeDebits.find((item) => item.id === debitId);

  const save = async () => {
    if (!reason.trim()) {
      setNotice({ severity: "warning", text: "Enter the reason before saving." });
      return;
    }
    setLoading(true);
    try {
      if (mode === "single") {
        if (!canManage || !firstId || !leaveId) throw new Error("Select the replacement employee and pending leave.");
        await api.put(`/replacement/assign/${leaveId}`, {
          replacementEmployeeId: firstId,
          mode: "normal",
          halfDuty: false,
          reason: reason.trim(),
        });
        setNotice({ severity: "success", text: "Single leave replacement assigned and recorded." });
      } else if (mode === "exchange") {
        if (!firstId || !secondId) throw new Error("Select both employees for the exchange.");
        const result = await api.put("/replacement/duty-switch/exchange", {
          date,
          firstEmployeeId: firstId,
          secondEmployeeId: secondId,
          reason: reason.trim(),
        });
        setNotice({
          severity: "success",
          text: result.data?.pendingApproval
            ? "Duty exchange requested. It now requires the other employee, both SICs, and final DIC approval."
            : "Both employees’ duties and groups were exchanged.",
        });
      } else if (mode === "balance") {
        if (!canManage || !firstId) throw new Error("Select an employee.");
        if (balanceAction === "defer") {
          const result = await api.put("/replacement/duty-switch/defer", {
            employeeId: firstId,
            date,
            reason: reason.trim(),
          });
          setNotice({ severity: "success", text: result.data?.message || "Duty changed to OFF and debit recorded." });
        } else {
          if (!debitId || !destinationDuty) throw new Error("Select an outstanding debit and settlement shift.");
          const result = await api.put(`/replacement/duty-switch/debits/${debitId}/settle`, {
            destinationDate: date,
            assignedDuty: destinationDuty,
            reason: reason.trim(),
          });
          setNotice({ severity: "success", text: result.data?.message || "Outstanding duty debit settled." });
        }
      } else {
        if (!canManage || !firstId || !destinationDate) throw new Error("Select an employee and destination date.");
        if (!destinationAssignment) throw new Error("The employee has no roster duty on the destination date.");
        const result = await api.put("/replacement/duty-switch/cross-date", {
          employeeId: firstId,
          sourceDate: date,
          destinationDate,
          destinationDuty: destinationDuty || first?.assignedDuty,
          leaveId: leaveId || undefined,
          reason: reason.trim(),
        });
        setNotice({
          severity: "success",
          text: [
            result.data?.singleAssignment ? "Single duty assigned and recorded." : "Duty moved across dates and recorded.",
            result.data?.linkedLeave ? `Replacement linked for ${result.data.linkedLeave.name || result.data.linkedLeave.employeeId}.` : "",
            result.data?.compOffAwarded ? "A C-OFF credit was added for duty on the OFF day." : "",
          ].filter(Boolean).join(" "),
        });
      }
      setSecondId("");
      setLeaveId("");
      setDebitId("");
      setReason("");
      await load();
      if (mode === "cross_date" && destinationDate) {
        const refreshedDestination = await api.get("/replacement/duty-switch/options", { params: { date: destinationDate } });
        setDestinationEmployees(refreshedDestination.data || []);
      }
      onChanged?.();
    } catch (error) {
      setNotice({ severity: "error", text: error.response?.data?.detail || error.message || "The duty change could not be saved." });
    } finally {
      setLoading(false);
    }
  };

  const decideExchange = async (request, decision) => {
    let comment = "";
    if (decision === "reject") {
      comment = window.prompt("Enter the rejection comment:", "") ?? "";
      if (!comment.trim()) return;
    }
    setLoading(true);
    try {
      const result = await api.put(`/replacement/duty-switch/exchange-requests/${request.id}/decision`, {
        decision,
        comment: comment.trim(),
      });
      setNotice({ severity: "success", text: result.data?.message || "Duty-exchange decision recorded." });
      await load();
      onChanged?.();
    } catch (error) {
      setNotice({ severity: "error", text: error.response?.data?.detail || "Duty-exchange decision could not be recorded." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Paper elevation={0} sx={{ overflow: "hidden", borderRadius: 3, border: "1px solid #BFDBFE", background: "#FFFFFF", mb: 2.5, backgroundImage: "none !important" }}>
      <Box sx={{ px: { xs: 2, md: 3 }, py: 2, color: "#FFFFFF", background: "linear-gradient(105deg,#08103A 0%,#0057B7 65%,#0F6FDB 100%)" }}>
        <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "center" }} gap={1}>
          <Box>
            <Typography sx={{ fontSize: 19, fontWeight: 950 }}>Duty Switching & Reassignment</Typography>
            <Typography sx={{ mt: .25, fontSize: 11.5, opacity: .9 }}>
              {canManage ? "Leave replacement, manpower exchange, or move one employee’s duty between dates." : "Exchange your duty with another available employee."}
            </Typography>
          </Box>
          <Button size="small" onClick={load} disabled={loading} startIcon={<RefreshCw size={14} />} sx={{ color: "#FFFFFF", border: "1px solid rgba(255,255,255,.55)", fontWeight: 850 }}>Refresh</Button>
        </Stack>
      </Box>

      <Box sx={{ p: { xs: 2, md: 2.5 } }}>
        {notice && <Alert severity={notice.severity} onClose={() => setNotice(null)} sx={{ mb: 2 }}>{notice.text}</Alert>}
        {initialLeave && mode === "exchange" && (
          <Alert severity="info" sx={{ mb: 2 }}>
            SIC leave coverage for <strong>{initialLeave.name}</strong> on <strong>{dayjs(initialLeave.date).format("DD MMM YYYY")}</strong>.
            Exchange manpower into <strong>{initialLeave.groupName}</strong>; acting-SIC selection will open after the exchange is saved.
          </Alert>
        )}

        {canManage && (
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ mb: 2 }}>
            <Button
              variant={mode === "single" ? "contained" : "outlined"}
              startIcon={<UserCheck size={16} />}
              onClick={() => { setMode("single"); setSecondId(""); }}
              sx={{ fontWeight: 850 }}
            >
              Single reassignment for leave replacement
            </Button>
            <Button
              variant={mode === "exchange" ? "contained" : "outlined"}
              startIcon={<ArrowLeftRight size={16} />}
              onClick={() => { setMode("exchange"); setLeaveId(""); }}
              sx={{ fontWeight: 850 }}
            >
              Exchange of manpower for shift
            </Button>
            <Button
              variant={mode === "cross_date" ? "contained" : "outlined"}
              startIcon={<CalendarRange size={16} />}
              onClick={() => { setMode("cross_date"); setLeaveId(""); setSecondId(""); }}
              sx={{ fontWeight: 850 }}
            >
              Move duty to another shift/date
            </Button>
            <Button
              variant={mode === "balance" ? "contained" : "outlined"}
              startIcon={<Scale size={16} />}
              onClick={() => { setMode("balance"); setLeaveId(""); setSecondId(""); setDebitId(""); }}
              sx={{ fontWeight: 850 }}
            >
              Deferred duty credit/debit
            </Button>
          </Stack>
        )}

        <Grid container spacing={2}>
          <Grid item xs={12} md={2.2}>
            <Field label={mode === "cross_date" ? "Source duty date" : mode === "balance" ? (balanceAction === "defer" ? "Duty date to give OFF" : "Settlement duty date") : "Duty date"}>
              <input type="date" value={date} onChange={(event) => { setDate(event.target.value); setDestinationDate(dayjs(event.target.value).add(1, "day").format("YYYY-MM-DD")); setFirstId(canManage ? "" : actorId); setSecondId(""); setLeaveId(""); }} style={{ width: "100%", height: 40, padding: "0 11px", border: "1px solid #CBD5E1", borderRadius: 8, color: "#0F172A", background: "#FFFFFF", fontWeight: 750, boxSizing: "border-box" }} />
            </Field>
          </Grid>

          <Grid item xs={12} md={mode === "single" ? 4.1 : mode === "cross_date" || mode === "balance" ? 4.6 : 3.5}>
            <Field label={mode === "single" ? "Replacement employee" : mode === "cross_date" ? "Employee whose duty will move" : mode === "balance" ? "Employee duty balance" : "First employee"} helper={!canManage ? "Your logged-in employee account" : undefined}>
              <FormControl fullWidth size="small">
                <Select value={firstId} disabled={!canManage} displayEmpty onChange={(event) => {
                  const employee = employees.find((item) => item.employeeId === event.target.value);
                  setFirstId(event.target.value);
                  setDestinationDuty(employee?.assignedDuty || "");
                  setSecondId("");
                  setDebitId("");
                }}>
                  <MenuItem value="" disabled>Select employee</MenuItem>
                  {employees.filter((item) => !item.onLeave).map((item) => <MenuItem key={item.employeeId} value={item.employeeId}>{employeeLabel(item)}</MenuItem>)}
                </Select>
              </FormControl>
            </Field>
          </Grid>

          {mode === "single" ? (
            <Grid item xs={12} md={5.7}>
              <Field label="Pending leave replacement duty">
                <FormControl fullWidth size="small">
                  <Select value={leaveId} displayEmpty onChange={(event) => setLeaveId(event.target.value)}>
                    <MenuItem value="" disabled>Select approved leave requiring replacement</MenuItem>
                    {leavesForSourceDate.map((leave) => (
                      <MenuItem key={leave.id} value={leave.id}>
                        {leave.name} ({leave.employeeId}) · {leave.assignedDuty || "Duty"} · {leave.groupName}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Field>
            </Grid>
          ) : mode === "exchange" ? (
            <Grid item xs={12} md={6.3}>
              <Field label="Employee to exchange with">
                <FormControl fullWidth size="small">
                  <Select value={secondId} displayEmpty onChange={(event) => setSecondId(event.target.value)}>
                    <MenuItem value="" disabled>Select employee; current duty and group are shown</MenuItem>
                    {exchangeEmployees.map((item) => <MenuItem key={item.employeeId} value={item.employeeId}>{employeeLabel(item)}</MenuItem>)}
                  </Select>
                </FormControl>
              </Field>
            </Grid>
          ) : mode === "balance" ? (
            <Grid item xs={12} md={5.2}>
              <Field label="Balance transaction" helper={balanceAction === "defer" ? "The selected working duty becomes OFF and duty balance increases by 1." : "Assign duty on this OFF date and reduce the selected outstanding balance by 1; no C-OFF is created."}>
                <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
                  <FormControl fullWidth size="small">
                    <Select value={balanceAction} onChange={(event) => { setBalanceAction(event.target.value); setDebitId(""); setDestinationDuty(""); }}>
                      <MenuItem value="defer">Give OFF now (+1 duty debit)</MenuItem>
                      <MenuItem value="settle">Assign later duty (-1 duty debit)</MenuItem>
                    </Select>
                  </FormControl>
                  {balanceAction === "settle" && (
                    <>
                      <FormControl fullWidth size="small">
                        <Select value={debitId} displayEmpty onChange={(event) => {
                          const next = employeeDebits.find((item) => item.id === event.target.value);
                          setDebitId(event.target.value);
                          setDestinationDuty(next?.owedDuty || "");
                        }}>
                          <MenuItem value="" disabled>Select outstanding debit</MenuItem>
                          {employeeDebits.map((item) => <MenuItem key={item.id} value={item.id}>{dayjs(item.sourceDate).format("DD MMM YYYY")} · {item.owedDuty} · {item.reason}</MenuItem>)}
                        </Select>
                      </FormControl>
                      <FormControl sx={{ minWidth: 135 }} size="small">
                        <Select value={destinationDuty} displayEmpty onChange={(event) => setDestinationDuty(event.target.value)}>
                          <MenuItem value="" disabled>Shift</MenuItem>
                          {SHIFT_OPTIONS.map((duty) => <MenuItem key={duty} value={duty}>{duty}</MenuItem>)}
                        </Select>
                      </FormControl>
                    </>
                  )}
                </Stack>
              </Field>
            </Grid>
          ) : (
            <Grid item xs={12} md={3}>
              <Field label="Destination duty date" helper={destinationDate === date ? "Same date: only the selected duty will be assigned; no second duty is moved." : "Different dates: the two date assignments will be swapped; duty is not duplicated."}>
                <input type="date" value={destinationDate} onChange={(event) => { setDestinationDate(event.target.value); setLeaveId(""); }} style={{ width: "100%", height: 40, padding: "0 11px", border: "1px solid #CBD5E1", borderRadius: 8, color: "#0F172A", background: "#FFFFFF", fontWeight: 750, boxSizing: "border-box" }} />
              </Field>
            </Grid>
          )}

          {mode === "cross_date" && (
            <Grid item xs={12} md={2.2}>
              <Field label="Destination shift">
                <FormControl fullWidth size="small">
                  <Select value={destinationDuty} displayEmpty onChange={(event) => setDestinationDuty(event.target.value)}>
                    <MenuItem value="" disabled>Select shift</MenuItem>
                    {SHIFT_OPTIONS.map((duty) => <MenuItem key={duty} value={duty}>{duty}</MenuItem>)}
                  </Select>
                </FormControl>
              </Field>
            </Grid>
          )}

          {mode === "cross_date" && (
            <Grid item xs={12}>
              <Field
                label="Link to a leave vacancy (optional)"
                helper="If selected, this employee will also be recorded as the replacement for that person’s leave."
              >
                <FormControl fullWidth size="small">
                  <Select
                    value={leaveId}
                    displayEmpty
                    onChange={(event) => {
                      const nextLeaveId = event.target.value;
                      const leave = leaves.find((item) => item.id === nextLeaveId);
                      setLeaveId(nextLeaveId);
                      if (leave?.date) {
                        setDestinationDate(leave.date);
                        setDestinationDuty(leave.assignedDuty || destinationDuty);
                      }
                    }}
                  >
                    <MenuItem value="">Do not link this move to a leave</MenuItem>
                    {leaves.map((leave) => (
                      <MenuItem key={leave.id} value={leave.id}>
                        {dayjs(leave.date).format("DD MMM YYYY")} · {leave.name} ({leave.employeeId}) · {leave.assignedDuty || "Duty"} · {leave.groupName || "No group"}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Field>
            </Grid>
          )}

          <Grid item xs={12} md={9.5}>
            <Field label={mode === "single" ? "Reason for leave replacement reassignment" : mode === "cross_date" ? "Reason for moving duty across dates" : mode === "balance" ? (balanceAction === "defer" ? "Reason for giving OFF / deferring duty" : "Reason for settling deferred duty") : "Reason for manpower exchange"}>
              <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Enter the operational reason" style={{ width: "100%", height: 40, padding: "0 12px", border: "1px solid #CBD5E1", borderRadius: 8, color: "#0F172A", background: "#FFFFFF", fontWeight: 650, boxSizing: "border-box" }} />
            </Field>
          </Grid>
          <Grid item xs={12} md={2.5} sx={{ display: "flex", alignItems: "flex-end" }}>
            <Button fullWidth variant="contained" disabled={loading || !firstId || (mode === "single" ? !leaveId : mode === "exchange" ? !secondId : mode === "balance" ? (balanceAction === "settle" && (!debitId || !destinationDuty)) : !destinationAssignment || !destinationDuty)} onClick={save} sx={{ minHeight: 40, background: "#0057B7", fontWeight: 900 }}>
              {mode === "single" ? "Assign replacement" : mode === "cross_date" ? (destinationDate === date ? "Assign duty" : "Move duty") : mode === "balance" ? (balanceAction === "defer" ? "Give OFF + debit" : "Assign + settle") : "Exchange duties"}
            </Button>
          </Grid>
        </Grid>

        {(first || second || selectedLeave || destinationAssignment) && (
          <Box sx={{ mt: 2, p: 1.4, borderRadius: 2, border: "1px solid #BAE6FD", background: "#F0F9FF", color: "#0F172A" }}>
            {first && <Typography sx={{ fontSize: 12, fontWeight: 800 }}>First: {employeeLabel(first)}</Typography>}
            {second && <Typography sx={{ fontSize: 12, fontWeight: 800 }}>Exchange with: {employeeLabel(second)}</Typography>}
            {selectedLeave && <Typography sx={{ fontSize: 12, fontWeight: 800 }}>Leave duty: {selectedLeave.name} · {selectedLeave.assignedDuty || "-"} · {selectedLeave.groupName}</Typography>}
            {mode === "balance" && first && (
              <>
                <Typography sx={{ mt: .4, fontSize: 12, fontWeight: 800 }}>
                  Outstanding duty balance: {employeeDebits.length}
                </Typography>
                {balanceAction === "defer" ? (
                  <Chip sx={{ mt: 1, background: "#FEF3C7", color: "#92400E", fontWeight: 900 }} size="small" label={`${first.assignedDuty || "Duty"} will become OFF; outstanding balance +1`} />
                ) : selectedDebit ? (
                  <Chip sx={{ mt: 1, background: "#DCFCE7", color: "#166534", fontWeight: 900 }} size="small" label={`${selectedDebit.owedDuty} debit from ${dayjs(selectedDebit.sourceDate).format("DD MMM YYYY")} will be settled; no C-OFF`} />
                ) : (
                  <Chip sx={{ mt: 1, background: "#E2E8F0", color: "#475569", fontWeight: 900 }} size="small" label={employeeDebits.length ? "Select a debit to settle" : "No outstanding debit for this employee"} />
                )}
              </>
            )}
            {mode === "cross_date" && destinationAssignment && (
              <>
                <Typography sx={{ mt: .4, fontSize: 12, fontWeight: 800 }}>
                  {destinationDate === date ? "Single assignment" : "Destination"}: {dayjs(destinationDate).format("DD MMM YYYY")} · currently {destinationAssignment.assignedDuty || "No duty"} · will become {destinationDuty || first?.assignedDuty || "-"} · {destinationAssignment.groupName || "No group"}
                </Typography>
                {["OFF", "O1", "O2"].includes(String(destinationAssignment.assignedDuty || "").toUpperCase()) && first && (
                  ["OFF", "O1", "O2"].includes(String(first.assignedDuty || "").toUpperCase()) ? (
                    <Chip sx={{ mt: 1, background: "#DCFCE7", color: "#166534", fontWeight: 900 }} size="small" label={destinationDate === date ? "C-OFF will be registered for this additional OFF-day duty" : "C-OFF will be registered: source and destination are both OFF"} />
                  ) : (
                    <Chip sx={{ mt: 1, background: "#FEF3C7", color: "#92400E", fontWeight: 900 }} size="small" label="No C-OFF: an existing working duty is being shifted to this OFF day" />
                  )
                )}
              </>
            )}
          </Box>
        )}

        {canManage && mode === "balance" && (
          <>
            <Typography sx={{ mt: 2.5, mb: 1, color: "#0F172A", fontWeight: 900 }}>Outstanding deferred duties ({dutyDebits.length})</Typography>
            <TableContainer sx={{ maxHeight: 240, border: "1px solid #F1D38A", borderRadius: 2 }}>
              <Table size="small" stickyHeader>
                <TableHead><TableRow><TableCell>Employee</TableCell><TableCell>Original date</TableCell><TableCell>Duty owed</TableCell><TableCell>Group</TableCell><TableCell>Reason</TableCell></TableRow></TableHead>
                <TableBody>
                  {dutyDebits.map((item) => <TableRow key={item.id} hover selected={item.id === debitId}>
                    <TableCell><strong>{item.employeeName || item.employeeId}</strong><br /><Typography variant="caption">{item.employeeId}</Typography></TableCell>
                    <TableCell>{dayjs(item.sourceDate).format("DD MMM YYYY")}</TableCell>
                    <TableCell><Chip size="small" color="warning" variant="outlined" label={item.owedDuty || "Duty"} sx={{ fontWeight: 850 }} /></TableCell>
                    <TableCell>{item.groupName || "-"}</TableCell>
                    <TableCell>{item.reason || "-"}</TableCell>
                  </TableRow>)}
                  {!dutyDebits.length && <TableRow><TableCell colSpan={5} align="center">No outstanding duty debit.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </TableContainer>
          </>
        )}

        {exchangeRequests.length > 0 && (
          <>
            <Typography sx={{ mt: 2.5, mb: 1, color: "#0F172A", fontWeight: 900 }}>Duty exchange approvals</Typography>
            <TableContainer sx={{ maxHeight: 300, border: "1px solid #BFDBFE", borderRadius: 2 }}>
              <Table size="small" stickyHeader>
                <TableHead><TableRow>
                  <TableCell>Date</TableCell><TableCell>Requested exchange</TableCell><TableCell>Current stage</TableCell><TableCell>Approval progress</TableCell><TableCell align="right">Action</TableCell>
                </TableRow></TableHead>
                <TableBody>
                  {exchangeRequests.map((request) => {
                    const firstPerson = request.firstEmployee || {};
                    const secondPerson = request.secondEmployee || {};
                    const sicDone = (request.sicApprovals || []).filter((item) => item.status === "Approved").length;
                    const sicTotal = (request.sicApprovals || []).length;
                    return (
                      <TableRow id={`duty-exchange-request-${request.id}`} key={request.id} hover sx={String(request.id) === String(initialRequestId) ? { background: "#FFF7D6", outline: "2px solid #F59E0B", outlineOffset: -2 } : undefined}>
                        <TableCell>{dayjs(request.date).format("DD MMM YYYY")}</TableCell>
                        <TableCell>
                          <strong>{firstPerson.name || firstPerson.employeeId}</strong> ({firstPerson.assignedDuty || "-"}, {firstPerson.groupName || "-"})
                          <br /><Typography variant="caption">with {secondPerson.name || secondPerson.employeeId} ({secondPerson.assignedDuty || "-"}, {secondPerson.groupName || "-"})</Typography>
                          <br /><Typography variant="caption" color="text.secondary">{request.reason}</Typography>
                        </TableCell>
                        <TableCell><Chip size="small" color={request.stage === "dic" ? "warning" : "info"} label={request.stage === "other_employee" ? "Other employee" : request.stage === "sic" ? "SIC approval" : "Final DIC"} /></TableCell>
                        <TableCell>
                          <Typography variant="caption" display="block">Other employee: {request.stage === "other_employee" ? "Pending" : "Approved"}</Typography>
                          <Typography variant="caption" display="block">SIC: {sicDone}/{sicTotal}</Typography>
                          <Typography variant="caption" display="block">DIC: {request.stage === "dic" ? "Pending" : "Not reached"}</Typography>
                        </TableCell>
                        <TableCell align="right">
                          {request.canAct ? (
                            <Box sx={{ display: "flex", justifyContent: "flex-end", gap: .75 }}>
                              <Button size="small" color="success" variant="contained" onClick={() => decideExchange(request, "approve")}>Approve</Button>
                              <Button size="small" color="error" variant="outlined" onClick={() => decideExchange(request, "reject")}>Reject</Button>
                            </Box>
                          ) : <Typography variant="caption" color="text.secondary">Awaiting concerned approver</Typography>}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </>
        )}

        {canManage && (
          <>
            <Typography sx={{ mt: 2.5, mb: 1, color: "#0F172A", fontWeight: 900 }}>Recent duty changes</Typography>
            <TableContainer sx={{ maxHeight: 320, minHeight: history.length ? 120 : 72, border: "1px solid #E2E8F0", borderRadius: 2 }}>
              <Table size="small" stickyHeader>
                <TableHead><TableRow><TableCell>Date</TableCell><TableCell>Event</TableCell><TableCell>Employee</TableCell><TableCell>Previous</TableCell><TableCell>Changed to</TableCell><TableCell>Reason</TableCell><TableCell>Changed by</TableCell></TableRow></TableHead>
                <TableBody>
                  {history.map((item) => {
                    const isSIC = Boolean(item.updated?.isActingSIC) || String(item.source || "").toLowerCase().includes("sic");
                    const isReplacement = Boolean(item.updated?.replacementDuty) || String(item.source || "").toLowerCase().includes("replacement");
                    const isDutyDebit = Boolean(item.dutyDebitCreated);
                    const isDutySettlement = Boolean(item.dutyDebitSettled);
                    return (
                      <TableRow key={item._id} hover>
                        <TableCell>{dayjs(item.date).format("DD MMM YYYY")}</TableCell>
                        <TableCell><Chip size="small" variant="outlined" color={isDutyDebit ? "warning" : isDutySettlement ? "success" : isSIC ? "warning" : isReplacement ? "info" : "default"} label={isDutyDebit ? "Duty debit +1" : isDutySettlement ? "Duty debit -1" : isSIC ? "Acting SIC" : isReplacement ? "Replacement duty" : "Duty change"} sx={{ fontWeight: 850 }} /></TableCell>
                        <TableCell><strong>{item.employeeName || item.employeeId}</strong><br /><Typography variant="caption">{item.employeeId}</Typography></TableCell>
                        <TableCell>{item.previous?.assignedDuty || "-"} · {item.previous?.groupName || "-"}</TableCell>
                        <TableCell>{item.updated?.assignedDuty || "-"} · {item.updated?.groupName || "-"}{isSIC && <><br /><Typography variant="caption" fontWeight={850} color="warning.main">Acting SIC allocated</Typography></>}{isReplacement && <><br /><Typography variant="caption" fontWeight={850} color="info.main">Replacement allocated{item.replacedEmployeeName ? ` for ${item.replacedEmployeeName}` : ""}</Typography></>}{item.compOffAwarded && <><br /><Chip size="small" label="C-OFF awarded" sx={{ mt: .5, height: 20, background: "#DCFCE7", color: "#166534", fontWeight: 850 }} /></>}</TableCell>
                        <TableCell>{item.reason || "-"}</TableCell>
                        <TableCell>{item.changedByName || item.changedBy || "-"}</TableCell>
                      </TableRow>
                    );
                  })}
                  {!history.length && <TableRow><TableCell colSpan={7} align="center">No duty changes recorded in this period.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </TableContainer>
          </>
        )}
      </Box>
    </Paper>
  );
}
