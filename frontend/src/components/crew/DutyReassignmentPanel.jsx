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
import { ArrowLeftRight, RefreshCw, UserCheck } from "lucide-react";
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

export default function DutyReassignmentPanel({ initialDate, onChanged, defaultExpanded = true }) {
  const [date, setDate] = useState(initialDate || dayjs().format("YYYY-MM-DD"));
  const [role, setRole] = useState({});
  const [mode, setMode] = useState("exchange");
  const [employees, setEmployees] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [history, setHistory] = useState([]);
  const [firstId, setFirstId] = useState("");
  const [secondId, setSecondId] = useState("");
  const [leaveId, setLeaveId] = useState("");
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
      const requests = [api.get("/replacement/duty-switch/options", { params: { date } })];
      if (manager) {
        requests.push(api.get("/replacement/pending"));
        requests.push(api.get("/replacement/duty-switch/history", {
          params: { startDate: dayjs(date).subtract(30, "day").format("YYYY-MM-DD"), endDate: date },
        }));
      }
      const [optionResult, leaveResult, historyResult] = await Promise.all(requests);
      setRole(nextRole);
      setEmployees(optionResult.data || []);
      setLeaves((leaveResult?.data || []).filter((item) => item.date === date));
      setHistory(historyResult?.data || []);
      setFirstId((current) => manager ? current : String(nextRole.employeeId || ""));
      setMode((current) => manager ? current : "exchange");
    } catch (error) {
      setNotice({ severity: "error", text: error.response?.data?.detail || "Duty reassignment data could not be loaded." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [date]);

  const first = employees.find((item) => item.employeeId === firstId);
  const second = employees.find((item) => item.employeeId === secondId);
  const selectedLeave = leaves.find((item) => item.id === leaveId);
  const exchangeEmployees = useMemo(
    () => employees.filter((item) => item.employeeId !== firstId && !item.onLeave),
    [employees, firstId],
  );

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
      } else {
        if (!firstId || !secondId) throw new Error("Select both employees for the exchange.");
        await api.put("/replacement/duty-switch/exchange", {
          date,
          firstEmployeeId: firstId,
          secondEmployeeId: secondId,
          reason: reason.trim(),
        });
        setNotice({ severity: "success", text: "Both employees’ duties and groups were exchanged." });
      }
      setSecondId("");
      setLeaveId("");
      setReason("");
      await load();
      onChanged?.();
    } catch (error) {
      setNotice({ severity: "error", text: error.response?.data?.detail || error.message || "The duty change could not be saved." });
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
              {canManage ? "Single leave replacement or two-person manpower exchange." : "Exchange your duty with another available employee."}
            </Typography>
          </Box>
          <Button size="small" onClick={load} disabled={loading} startIcon={<RefreshCw size={14} />} sx={{ color: "#FFFFFF", border: "1px solid rgba(255,255,255,.55)", fontWeight: 850 }}>Refresh</Button>
        </Stack>
      </Box>

      <Box sx={{ p: { xs: 2, md: 2.5 } }}>
        {notice && <Alert severity={notice.severity} onClose={() => setNotice(null)} sx={{ mb: 2 }}>{notice.text}</Alert>}

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
          </Stack>
        )}

        <Grid container spacing={2}>
          <Grid item xs={12} md={2.2}>
            <Field label="Duty date">
              <input type="date" value={date} onChange={(event) => { setDate(event.target.value); setFirstId(canManage ? "" : actorId); setSecondId(""); setLeaveId(""); }} style={{ width: "100%", height: 40, padding: "0 11px", border: "1px solid #CBD5E1", borderRadius: 8, color: "#0F172A", background: "#FFFFFF", fontWeight: 750, boxSizing: "border-box" }} />
            </Field>
          </Grid>

          <Grid item xs={12} md={mode === "single" ? 4.1 : 3.5}>
            <Field label={mode === "single" ? "Replacement employee" : "First employee"} helper={!canManage ? "Your logged-in employee account" : undefined}>
              <FormControl fullWidth size="small">
                <Select value={firstId} disabled={!canManage} displayEmpty onChange={(event) => { setFirstId(event.target.value); setSecondId(""); }}>
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
                    {leaves.map((leave) => (
                      <MenuItem key={leave.id} value={leave.id}>
                        {leave.name} ({leave.employeeId}) · {leave.assignedDuty || "Duty"} · {leave.groupName}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Field>
            </Grid>
          ) : (
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
          )}

          <Grid item xs={12} md={9.5}>
            <Field label={mode === "single" ? "Reason for leave replacement reassignment" : "Reason for manpower exchange"}>
              <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Enter the operational reason" style={{ width: "100%", height: 40, padding: "0 12px", border: "1px solid #CBD5E1", borderRadius: 8, color: "#0F172A", background: "#FFFFFF", fontWeight: 650, boxSizing: "border-box" }} />
            </Field>
          </Grid>
          <Grid item xs={12} md={2.5} sx={{ display: "flex", alignItems: "flex-end" }}>
            <Button fullWidth variant="contained" disabled={loading || !firstId || (mode === "single" ? !leaveId : !secondId)} onClick={save} sx={{ minHeight: 40, background: "#0057B7", fontWeight: 900 }}>
              {mode === "single" ? "Assign replacement" : "Exchange duties"}
            </Button>
          </Grid>
        </Grid>

        {(first || second || selectedLeave) && (
          <Box sx={{ mt: 2, p: 1.4, borderRadius: 2, border: "1px solid #BAE6FD", background: "#F0F9FF", color: "#0F172A" }}>
            {first && <Typography sx={{ fontSize: 12, fontWeight: 800 }}>First: {employeeLabel(first)}</Typography>}
            {second && <Typography sx={{ fontSize: 12, fontWeight: 800 }}>Exchange with: {employeeLabel(second)}</Typography>}
            {selectedLeave && <Typography sx={{ fontSize: 12, fontWeight: 800 }}>Leave duty: {selectedLeave.name} · {selectedLeave.assignedDuty || "-"} · {selectedLeave.groupName}</Typography>}
          </Box>
        )}

        {canManage && (
          <>
            <Typography sx={{ mt: 2.5, mb: 1, color: "#0F172A", fontWeight: 900 }}>Recent duty changes</Typography>
            <TableContainer sx={{ maxHeight: 260, border: "1px solid #E2E8F0", borderRadius: 2 }}>
              <Table size="small" stickyHeader>
                <TableHead><TableRow><TableCell>Date</TableCell><TableCell>Employee</TableCell><TableCell>Previous</TableCell><TableCell>Changed to</TableCell><TableCell>Reason</TableCell><TableCell>Changed by</TableCell></TableRow></TableHead>
                <TableBody>
                  {history.map((item) => <TableRow key={item._id} hover><TableCell>{dayjs(item.date).format("DD MMM YYYY")}</TableCell><TableCell><strong>{item.employeeName || item.employeeId}</strong><br /><Typography variant="caption">{item.employeeId}</Typography></TableCell><TableCell>{item.previous?.assignedDuty || "-"} · {item.previous?.groupName || "-"}</TableCell><TableCell>{item.updated?.assignedDuty || "-"} · {item.updated?.groupName || "-"}</TableCell><TableCell>{item.reason || "-"}</TableCell><TableCell>{item.changedByName || item.changedBy || "-"}</TableCell></TableRow>)}
                  {!history.length && <TableRow><TableCell colSpan={6} align="center">No duty changes recorded in this period.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </TableContainer>
          </>
        )}
      </Box>
    </Paper>
  );
}
