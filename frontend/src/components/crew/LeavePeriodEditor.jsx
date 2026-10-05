import { useState } from "react";
import dayjs from "dayjs";
import { Alert, Box, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { CalendarRange } from "lucide-react";
import api from "../../crewLegacy/api";

export const canEditLeavePeriod = (leave, rows) => Boolean(leave.isOwner) && rows.every(row => row.finalStatus === "Applied"
  && [undefined, null, "Pending", "Not Applicable"].includes(row.sicApprovalStatus)
  && [undefined, null, "Pending", "Not Applicable"].includes(row.deptApprovalStatus)
  && !row.currentApprovalIndex && !row.editToken
  && (row.approvalChain || []).every(step => step.status === "Pending" && !step.actedOn && !step.actedBy)
  && !["rejectionHistory", "replacementDecisionHistory", "sicApprovedOn", "approvedOn"].some(key => Array.isArray(row[key]) ? row[key].length : row[key]));

export default function LeavePeriodEditor({ leave, groupRows, demo = false, onUpdated, onDemoEdit }) {
  const [open, setOpen] = useState(false), [from, setFrom] = useState(""), [to, setTo] = useState("");
  const [reason, setReason] = useState(""), [rows, setRows] = useState([]), [types, setTypes] = useState([]), [credits, setCredits] = useState([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const originals = groupRows?.length ? groupRows : [leave];
  if (!canEditLeavePeriod(leave, originals)) return null;
  const start = () => {
    const dates = originals.map(row => row.date).sort();
    setFrom(dates[0]); setTo(dates.at(-1)); setReason(leave.reason || ""); setRows([]); setError(""); setOpen(true);
  };
  const preview = async () => {
    setError(""); setRows([]);
    if (!from || !to || to < from || dayjs(to).diff(dayjs(from), "day") > 92) { setError("Choose a valid period of at most 93 dates."); return; }
    setBusy(true);
    try {
      let duties, choices, available;
      if (demo) {
        duties = Array.from({ length: dayjs(to).diff(dayjs(from), "day") + 1 }, (_, i) => ({ date: dayjs(from).add(i, "day").format("YYYY-MM-DD"), assignedDuty: "Sample duty" }));
        choices = ["CL", "HPL", "EL"].map(value => ({ value, label: value })); available = [];
      } else {
        const results = await Promise.all([api.get("/leave/duty-detailed", { params: { employeeId: leave.employeeId, startDate: from, endDate: to } }), api.get("/leave/leave-types"), api.get("/leave/comp-off/available", { params: { employeeId: leave.employeeId } })]);
        [duties, choices, available] = results.map(result => result.data);
      }
      if (!duties?.length || duties.length !== dayjs(to).diff(dayjs(from), "day") + 1) throw new Error("A published duty roster is required for every date in this period.");
      setTypes(choices || []); setCredits(available || []);
      const defaultType = originals.find(row => !row.stationLeaveOnly)?.leaveType || choices?.[0]?.value || "";
      setRows((duties || []).map(duty => {
        const previous = originals.find(row => row.date === duty.date);
        return { ...duty, leaveType: duty.stationLeaveOnlyAllowed ? "" : previous?.leaveType || (defaultType === "C-OFF" ? "" : defaultType),
          stationLeave: duty.stationLeaveOnlyAllowed || Boolean(previous?.stationLeave), compOffId: previous?.compOffId || "" };
      }));
    } catch (failure) { setError(failure.response?.data?.detail || failure.message); }
    finally { setBusy(false); }
  };
  const update = (index, values) => setRows(current => current.map((row, i) => i === index ? { ...row, ...values } : row));
  const save = async () => {
    setBusy(true); setError("");
    const applications = rows.map(({ date, leaveType, stationLeave, compOffId }) => ({ date, leaveType, stationLeave, compOffId: leaveType === "C-OFF" ? compOffId : null }));
    try {
      if (!reason.trim() || rows.some(row => !row.stationLeaveOnlyAllowed && !row.leaveType)) throw new Error("Provide a reason and a leave type for every working date.");
      if (demo) onDemoEdit?.(leave, originals, applications, reason.trim());
      else {
        await api.put(`/leave/period/${leave.id}`, { applications, reason: reason.trim() });
        window.dispatchEvent(new Event("crew-workflows-changed")); localStorage.setItem("crew-workflows-changed", String(Date.now()));
        onUpdated?.();
      }
      setOpen(false);
    } catch (failure) { setError(failure.response?.data?.detail || failure.message); }
    finally { setBusy(false); }
  };
  return <><Button size="small" startIcon={<CalendarRange size={14} />} onClick={start}>Edit leave period</Button>
    <Dialog open={open} onClose={() => !busy && setOpen(false)} fullWidth maxWidth="md" slotProps={{ paper: { sx: { borderRadius: 5 } } }}>
      <DialogTitle sx={{ bgcolor: "#F0EDFF", p: 3 }}>Edit leave period<Typography variant="body2" color="text.secondary">{leave.name} · Approval has not started</Typography></DialogTitle>
      <DialogContent sx={{ pt: "24px !important" }}><Stack spacing={2}>
        <Alert severity="info">Review the new dates before saving. Approved or already reviewed applications cannot be edited.</Alert>
        {error && <Alert severity="error">{error}</Alert>}
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}><TextField label="Start date" type="date" value={from} onChange={e => { setFrom(e.target.value); setRows([]); }} slotProps={{ inputLabel: { shrink: true } }} /><TextField label="End date" type="date" value={to} onChange={e => { setTo(e.target.value); setRows([]); }} slotProps={{ inputLabel: { shrink: true } }} /><Button variant="outlined" disabled={busy} onClick={preview}>Review dates</Button></Stack>
        <TextField label="Reason" value={reason} onChange={e => setReason(e.target.value)} multiline minRows={2} />
        {busy && <CircularProgress size={22} />}
        {rows.map((row, index) => <Box key={row.date} sx={{ p: 1.5, bgcolor: "#F7F8FC", borderRadius: 3 }}><Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "center" }}><Box sx={{ minWidth: 125 }}><Typography fontWeight={800}>{dayjs(row.date).format("DD MMM YYYY")}</Typography><Typography variant="caption" color="text.secondary">{row.assignedDuty} · {row.groupName}</Typography></Box>
          {row.stationLeaveOnlyAllowed ? <Typography sx={{ flex: 1, color: "#80728C" }}>Station leave only · Non-working day</Typography> : <TextField select size="small" label="Leave type" value={row.leaveType} sx={{ minWidth: 140 }} onChange={e => update(index, { leaveType: e.target.value, compOffId: "" })}>{types.map(type => <MenuItem key={type.value} value={type.value}>{type.label}</MenuItem>)}</TextField>}
          {row.leaveType === "C-OFF" && <TextField select size="small" label="C-OFF credit" value={row.compOffId} sx={{ minWidth: 180 }} onChange={e => update(index, { compOffId: e.target.value })}>{[...credits, ...originals.filter(item => item.compOffId).map(item => ({ id: item.compOffId, earnedDate: "Existing reservation" }))].filter((credit, i, all) => all.findIndex(item => item.id === credit.id) === i).map(credit => <MenuItem key={credit.id} value={credit.id}>{credit.earnedDate}{credit.expiryDate ? ` · expires ${credit.expiryDate}` : ""}</MenuItem>)}</TextField>}
          <FormControlLabel label="Station leave" control={<Checkbox checked={row.stationLeave} disabled={row.stationLeaveOnlyAllowed} onChange={e => update(index, { stationLeave: e.target.checked })} />} />
        </Stack></Box>)}
      </Stack></DialogContent><DialogActions sx={{ p: 3 }}><Button disabled={busy} onClick={() => setOpen(false)}>Close</Button><Button variant="contained" disabled={busy || !rows.length} onClick={save} sx={{ bgcolor: "#6355DB", borderRadius: 3 }}>Save revised period</Button></DialogActions>
    </Dialog></>;
}
