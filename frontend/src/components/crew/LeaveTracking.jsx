import { useEffect, useMemo, useState } from "react";
import { Alert, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Stack, Typography } from "@mui/material";

import LeaveProgress from "./LeaveProgress";
import LeavePeriodEditor from "./LeavePeriodEditor";
import LeaveDelete from "./LeaveDelete";

const when = value => value ? new Date(value).toLocaleString() : "";
const activeStatuses = ["Applied", "Forwarded", "Forwarded by SIC", "Approved"];

export default function LeaveTracking({ leave, onCancel, onCancelGroup, busy, groupRows = [], demo = false, onUpdated, onDemoEdit, selectedDatesOnly = false, onReapply, onDemoDelete }) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [selectedDates, setSelectedDates] = useState([]);

  // Every row sharing this application (same leaveGroupId, or the sibling rows
  // the caller resolved for legacy records). Used to cancel the whole
  // application or individual dates.
  const applicationRows = useMemo(() => {
    const rows = (groupRows && groupRows.length ? groupRows : [leave]);
    return [...rows].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }, [groupRows, leave]);
  const activeRows = useMemo(
    () => applicationRows.filter(row => (selectedDatesOnly ? row.finalStatus === "Approved" : activeStatuses.includes(row.finalStatus)) && row.canCancel === true),
    [applicationRows, selectedDatesOnly],
  );
  const isMultiDay = applicationRows.length > 1;
  const hasGroupCancel = typeof onCancelGroup === "function";
  const showDateManagement = hasGroupCancel && (isMultiDay || selectedDatesOnly || applicationRows.some(row => row.finalStatus === "Approved"));

  useEffect(() => {
    if (!open) return;
    setSelectedDates([]);
  }, [open, activeRows]);

  const toggleDate = (date, checked) => setSelectedDates(current => (
    checked ? Array.from(new Set([...current, date])) : current.filter(value => value !== date)
  ));

  const cancelWhole = () => {
    if (!window.confirm(`Cancel all ${activeRows.length} day(s) of this leave application for ${leave.name}?`)) return;
    setOpen(false);
    (onCancelGroup || onCancel)({ leave, dates: activeRows.map(row => row.date), scope: "all" });
  };

  const cancelSelected = () => {
    if (!selectedDates.length) return;
    const wholeApplication = selectedDates.length === activeRows.length;
    const label = wholeApplication && !selectedDatesOnly
      ? `Cancel all ${activeRows.length} day(s) of this leave application?`
      : `Cancel ${selectedDates.length} selected date(s): ${selectedDates.join(", ")}?`;
    if (!window.confirm(label)) return;
    setOpen(false);
    (onCancelGroup || onCancel)({ leave, dates: selectedDates, scope: !selectedDatesOnly && wholeApplication ? "all" : "dates" });
  };

  return <>
    <LeaveDelete rows={applicationRows} busy={busy} demo={demo} onUpdated={onUpdated} onDemoDelete={onDemoDelete} />
    <Button size="small" onClick={() => { setExpanded(false); setOpen(true); }}>Track leave</Button>
    {showDateManagement && activeRows.length > 0 && <Button size="small" onClick={() => { setExpanded(true); setOpen(true); }}>{selectedDatesOnly ? "Cancel selected dates" : applicationRows.some(row => row.finalStatus === "Approved") ? "Approved leave dates" : "Manage dates"}</Button>}
    {!selectedDatesOnly && <LeavePeriodEditor leave={leave} groupRows={applicationRows} demo={demo} onUpdated={onUpdated} onDemoEdit={onDemoEdit} />}
    <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="md" slotProps={{ paper: { sx: { borderRadius: 5, overflow: "hidden", boxShadow: "0 24px 80px #32305730" } } }}>
      <DialogTitle sx={{ bgcolor: "#F0EDFF", p: 3, color: "#343055", fontWeight: 850 }}>Leave tracking<Typography variant="body2" color="text.secondary">{leave.name} ({leave.employeeId}) · {leave.date}</Typography></DialogTitle>
      <DialogContent dividers><Stack sx={{ gap: 2 }}>
        <Box><Chip label={leave.finalStatus || "Applied"} /><Typography sx={{ mt: 1 }}>{leave.leaveType || "Station leave"}</Typography>{leave.reason && <Typography color="text.secondary">{leave.reason}</Typography>}</Box>
        {!selectedDatesOnly && onReapply && leave.isOwner && applicationRows.some(row => row.finalStatus === "Approved") && <Alert severity="info">To change an approved period, cancel the dates you no longer need and apply for revised dates. The new dates require approval.</Alert>}
        {leave.createdOn && <Typography variant="body2">Submitted {when(leave.createdOn)}</Typography>}
        <Box sx={{ p: 2.5, bgcolor: "#F7F7FE", borderRadius: 4 }}><LeaveProgress leave={leave} /></Box>
        {leave.currentApproverNames?.length > 0 && !["Approved", "Cancelled", "Rejected", "Withdrawn"].includes(leave.finalStatus) && <Alert severity="info">Awaiting {leave.currentApproverNames.join(", ")}</Alert>}
        {(leave.rejectionHistory || []).map((item, i) => <Alert key={i} severity="warning">{item.comment || item.reason || "Rejected"} · {item.rejectedBy || item.employeeId} {when(item.rejectedOn || item.date)}</Alert>)}
        {leave.cancelledBy && <Alert severity="info">Cancelled by {leave.cancelledBy} ({leave.cancelledByRole}) · {when(leave.cancelledOn)}</Alert>}
        {leave.replacementEmployee?.name && <Typography variant="body2">Replacement: {leave.replacementEmployee.name}</Typography>}

        {showDateManagement && (
          <Box sx={{ border: "1px solid #BFDBFE", borderRadius: 2, background: "#F8FBFF", p: 1.2 }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
              <Box>
                <Typography sx={{ fontSize: 12, fontWeight: 900, color: "#0057B7" }}>Application dates ({applicationRows.length} day(s))</Typography>
                <Typography sx={{ fontSize: 11, color: "#64748B" }}>Keep your approved dates, or select only the dates you want to cancel.</Typography>
              </Box>
              {hasGroupCancel && <Button size="small" variant="outlined" onClick={() => setExpanded(value => !value)}>{expanded ? "Hide dates" : "Choose dates"}</Button>}
            </Stack>
            {expanded && hasGroupCancel && (
              <Stack sx={{ mt: 1, gap: .3 }}>
                {!selectedDatesOnly && <FormControlLabel
                  sx={{ m: 0 }}
                  control={<Checkbox size="small" checked={selectedDates.length === activeRows.length && activeRows.length > 0} indeterminate={selectedDates.length > 0 && selectedDates.length < activeRows.length} onChange={(event) => setSelectedDates(event.target.checked ? activeRows.map(row => row.date) : [])} />}
                  label={<Typography sx={{ fontSize: 13, fontWeight: 850 }}>Select all active dates</Typography>}
                />}
                {applicationRows.map(row => {
                  const cancellable = (selectedDatesOnly ? row.finalStatus === "Approved" : activeStatuses.includes(row.finalStatus)) && row.canCancel === true;
                  return <FormControlLabel
                    key={row.id || row.date}
                    sx={{ m: 0, opacity: cancellable ? 1 : .55 }}
                    control={<Checkbox size="small" disabled={!cancellable} checked={selectedDates.includes(row.date)} onChange={(event) => toggleDate(row.date, event.target.checked)} />}
                    label={<Typography sx={{ fontSize: 13, fontWeight: 700 }}>{row.date} · {row.finalStatus || "Applied"}{!cancellable ? " (locked)" : ""}</Typography>}
                  />;
                })}
              </Stack>
            )}
          </Box>
        )}
      </Stack></DialogContent>
      <DialogActions sx={{ p: 2.5, flexWrap: "wrap", gap: 1 }}>
        {!selectedDatesOnly && isMultiDay && hasGroupCancel && activeRows.length > 1 && <Button disabled={busy} color="warning" variant="contained" onClick={cancelWhole}>Cancel whole application</Button>}
        {showDateManagement && expanded && <Button disabled={busy || !selectedDates.length} color="warning" onClick={cancelSelected}>Cancel selected ({selectedDates.length})</Button>}
        {!showDateManagement && !isMultiDay && leave.canCancel && onCancel && <Button disabled={busy} color="warning" onClick={() => { setOpen(false); onCancel(leave); }}>Cancel leave</Button>}
        {!selectedDatesOnly && onReapply && leave.isOwner && applicationRows.some(row => row.finalStatus === "Approved") && <Button onClick={() => { setOpen(false); onReapply(); }}>Apply revised dates</Button>}
        <Button onClick={() => setOpen(false)}>Close</Button>
      </DialogActions>
    </Dialog>
  </>;
}
