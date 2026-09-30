import { useEffect, useMemo, useState } from "react";
import { Alert, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Stack, Typography } from "@mui/material";

const when = value => value ? new Date(value).toLocaleString() : "";
const activeStatuses = ["Applied", "Forwarded", "Forwarded by SIC", "Approved"];

export default function LeaveTracking({ leave, onCancel, onCancelGroup, busy, groupRows = [] }) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [selectedDates, setSelectedDates] = useState([]);
  const chain = leave.approvalChain || [];

  // Every row sharing this application (same leaveGroupId, or the sibling rows
  // the caller resolved for legacy records). Used to cancel the whole
  // application or individual dates.
  const applicationRows = useMemo(() => {
    const rows = (groupRows && groupRows.length ? groupRows : [leave]);
    return [...rows].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }, [groupRows, leave]);
  const activeRows = useMemo(
    () => applicationRows.filter(row => activeStatuses.includes(row.finalStatus) && row.canCancel !== false),
    [applicationRows],
  );
  const isMultiDay = applicationRows.length > 1;
  const hasGroupCancel = typeof onCancelGroup === "function";

  useEffect(() => {
    if (!open) return;
    setSelectedDates(activeRows.map(row => row.date));
    setExpanded(false);
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
    const label = wholeApplication
      ? `Cancel all ${activeRows.length} day(s) of this leave application?`
      : `Cancel ${selectedDates.length} selected date(s): ${selectedDates.join(", ")}?`;
    if (!window.confirm(label)) return;
    setOpen(false);
    (onCancelGroup || onCancel)({ leave, dates: selectedDates, scope: wholeApplication ? "all" : "dates" });
  };

  return <>
    <Button size="small" onClick={() => setOpen(true)}>Track leave</Button>
    <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
      <DialogTitle>Leave tracking<Typography variant="body2" color="text.secondary">{leave.name} ({leave.employeeId}) · {leave.date}</Typography></DialogTitle>
      <DialogContent dividers><Stack sx={{ gap: 2 }}>
        <Box><Chip label={leave.finalStatus || "Applied"} /><Typography sx={{ mt: 1 }}>{leave.leaveType || "Station leave"}</Typography>{leave.reason && <Typography color="text.secondary">{leave.reason}</Typography>}</Box>
        {leave.createdOn && <Typography variant="body2">Submitted {when(leave.createdOn)}</Typography>}
        {chain.length ? chain.map((step, index) => <Box key={index} sx={{ borderLeft: "3px solid", borderColor: step.status === "Approved" ? "success.main" : "divider", pl: 2 }}>
          <Typography sx={{ fontWeight: 750 }}>{index + 1}. {step.name || step.names?.join(", ") || step.approverNames?.join(", ") || step.level || "Reporting authority"}</Typography>
          <Typography variant="body2">{step.level} · {step.status || "Pending"}</Typography>
          <Typography variant="caption" color="text.secondary">{when(step.approvedOn || step.actedOn || step.updatedOn)} {step.comment || step.reason || ""}</Typography>
        </Box>) : <><Typography>First approver: {leave.firstApproverNames?.join(", ") || "SIC"} · {leave.sicApprovalStatus || "Pending"}</Typography><Typography>Final approver: {leave.finalApproverNames?.join(", ") || "Reporting authority"} · {leave.deptApprovalStatus || "Pending"}</Typography></>}
        {leave.currentApproverNames?.length > 0 && !["Approved", "Cancelled", "Rejected", "Withdrawn"].includes(leave.finalStatus) && <Alert severity="info">Awaiting {leave.currentApproverNames.join(", ")}</Alert>}
        {(leave.rejectionHistory || []).map((item, i) => <Alert key={i} severity="warning">{item.comment || item.reason || "Rejected"} · {item.rejectedBy || item.employeeId} {when(item.rejectedOn || item.date)}</Alert>)}
        {leave.cancelledBy && <Alert severity="info">Cancelled by {leave.cancelledBy} ({leave.cancelledByRole}) · {when(leave.cancelledOn)}</Alert>}
        {leave.replacementEmployee?.name && <Typography variant="body2">Replacement: {leave.replacementEmployee.name}</Typography>}

        {isMultiDay && (
          <Box sx={{ border: "1px solid #BFDBFE", borderRadius: 2, background: "#F8FBFF", p: 1.2 }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
              <Box>
                <Typography sx={{ fontSize: 12, fontWeight: 900, color: "#0057B7" }}>Multi-day application ({applicationRows.length} day(s))</Typography>
                <Typography sx={{ fontSize: 11, color: "#64748B" }}>Cancel the whole application, or expand to cancel individual dates.</Typography>
              </Box>
              {hasGroupCancel && <Button size="small" variant="outlined" onClick={() => setExpanded(value => !value)}>{expanded ? "Hide dates" : "Choose dates"}</Button>}
            </Stack>
            {expanded && hasGroupCancel && (
              <Stack sx={{ mt: 1, gap: .3 }}>
                <FormControlLabel
                  sx={{ m: 0 }}
                  control={<Checkbox size="small" checked={selectedDates.length === activeRows.length && activeRows.length > 0} indeterminate={selectedDates.length > 0 && selectedDates.length < activeRows.length} onChange={(event) => setSelectedDates(event.target.checked ? activeRows.map(row => row.date) : [])} />}
                  label={<Typography sx={{ fontSize: 11.5, fontWeight: 850 }}>Select all active dates</Typography>}
                />
                {applicationRows.map(row => {
                  const cancellable = activeStatuses.includes(row.finalStatus) && row.canCancel !== false;
                  return <FormControlLabel
                    key={row.id || row.date}
                    sx={{ m: 0, opacity: cancellable ? 1 : .55 }}
                    control={<Checkbox size="small" disabled={!cancellable} checked={selectedDates.includes(row.date)} onChange={(event) => toggleDate(row.date, event.target.checked)} />}
                    label={<Typography sx={{ fontSize: 11.5, fontWeight: 700 }}>{row.date} · {row.finalStatus || "Applied"}{!cancellable ? " (locked)" : ""}</Typography>}
                  />;
                })}
              </Stack>
            )}
          </Box>
        )}
      </Stack></DialogContent>
      <DialogActions sx={{ flexWrap: "wrap", gap: .5 }}>
        {isMultiDay && hasGroupCancel && activeRows.length > 1 && <Button disabled={busy} color="warning" variant="contained" onClick={cancelWhole}>Cancel whole application</Button>}
        {isMultiDay && hasGroupCancel && expanded && <Button disabled={busy || !selectedDates.length} color="warning" onClick={cancelSelected}>Cancel selected ({selectedDates.length})</Button>}
        {!isMultiDay && leave.canCancel && onCancel && <Button disabled={busy} color="warning" onClick={() => { setOpen(false); onCancel(leave); }}>Cancel leave</Button>}
        <Button onClick={() => setOpen(false)}>Close</Button>
      </DialogActions>
    </Dialog>
  </>;
}
