import { useState } from "react";
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from "@mui/material";

const when = value => value ? new Date(value).toLocaleString() : "";
export default function LeaveTracking({ leave, onCancel, busy }) {
  const [open, setOpen] = useState(false);
  const chain = leave.approvalChain || [];
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
      </Stack></DialogContent>
      <DialogActions>{leave.canCancel && onCancel && <Button disabled={busy} color="warning" onClick={() => { setOpen(false); onCancel(leave); }}>Cancel leave</Button>}<Button onClick={() => setOpen(false)}>Close</Button></DialogActions>
    </Dialog>
  </>;
}
