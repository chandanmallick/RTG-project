import { useEffect, useState } from "react";
import { Alert, Box, Button, Checkbox, Chip, CircularProgress, FormControlLabel, MenuItem, Stack, TextField, Typography } from "@mui/material";
import api from "../../crewLegacy/api";

export default function TrainingCalendarReview({ requestId, onChanged, onReplacement }) {
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [coverage, setCoverage] = useState({ replacementRequired: false, replacementEmployeeId: "", assignActingSIC: false, actingSICEmployeeId: "" });
  const [off, setOff] = useState({ before: false, after: false });
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  const load = async () => {
    const { data } = await api.get(`/training-assign/nomination/${requestId}`);
    setRecord(data);
    setCoverage({ replacementRequired: Boolean(data.replacementRequired), replacementEmployeeId: data.replacementEmployee?.employeeId || "", assignActingSIC: Boolean(data.actingSICEmployee?.employeeId), actingSICEmployeeId: data.actingSICEmployee?.employeeId || "" });
    return data;
  };
  useEffect(() => {
    load().catch((error) => setNotice({ severity: "error", text: error.response?.data?.detail || "Training details could not be loaded." })).finally(() => setLoading(false));
  }, [requestId]);

  const loadCandidates = async () => {
    if (candidates.length || candidateLoading) return;
    setCandidateLoading(true);
    try {
      const { data } = await api.get(`/training-assign/replacement-candidates/${requestId}`);
      setCandidates(data.candidates || []);
    } catch (error) {
      setNotice({ severity: "error", text: error.response?.data?.detail || "Replacement candidates could not be loaded." });
    } finally { setCandidateLoading(false); }
  };

  const act = async (action) => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      if (action === "off") {
        await api.post(`/training-assign/request-adjacent-off/${requestId}`, off);
      } else {
        await api.post(`/training-assign/${action}`, {
          ids: [requestId], reason: reason.trim() || "Not approved",
          replacementDecisions: [{ id: requestId, ...coverage, actingSICEmployeeId: coverage.assignActingSIC ? coverage.actingSICEmployeeId : "" }],
        });
      }
      setRejecting(false);
      const updated = await load();
      setNotice({ severity: "success", text: action === "off" ? "OFF request submitted for approval." : action === "reject" ? "Request rejected." : updated.status === "Approved" ? "Final approval complete. Calendar updated." : `Approved and forwarded to ${updated.currentApproverName || "the next approver"}.` });
      onChanged?.();
    } catch (error) {
      setNotice({ severity: "error", text: error.response?.data?.detail || error.message || "The request could not be saved. Refresh to check its current status." });
    } finally { setBusy(false); }
  };

  if (loading) return <Box sx={{ p: 5, textAlign: "center" }}><CircularProgress /></Box>;
  const adjacent = record?.workflowKind === "Adjacent OFF";
  const selector = (field, label) => <TextField select fullWidth size="small" label={label} value={coverage[field]} disabled={busy || candidateLoading} onChange={(event) => setCoverage((current) => ({ ...current, [field]: event.target.value }))} SelectProps={{ onOpen: loadCandidates }}>
    <MenuItem value="">Select employee</MenuItem>
    {coverage[field] && !candidates.some((candidate) => candidate.employeeId === coverage[field]) && <MenuItem value={coverage[field]}>{record.replacementEmployee?.employeeId === coverage[field] ? record.replacementEmployee.name : record.actingSICEmployee?.name || coverage[field]}</MenuItem>}
    {candidates.map((candidate) => <MenuItem key={candidate.employeeId} value={candidate.employeeId} disabled={candidate.hasConflict}>{candidate.name} ({candidate.employeeId}) · {candidate.dutySummary}{candidate.hasConflict ? " · Unavailable" : ""}</MenuItem>)}
  </TextField>;

  return <Stack spacing={2}>
    {notice && <Alert severity={notice.severity}>{notice.text}</Alert>}
    {record && <>
      <Box><Typography variant="h6" fontWeight={900}>{record.employeeName || record.employeeId}</Typography><Typography>{record.trainingName}</Typography><Typography color="text.secondary">{record.startDate} to {record.endDate} · {record.trainingLocation || "Location not specified"}</Typography></Box>
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap><Chip label={record.status} color={record.status === "Approved" ? "success" : "default"} /><Chip label={adjacent ? "OFF request" : "Training"} /></Stack>
      {adjacent && <Alert severity="info">Requested OFF: {[record.adjacentOff?.before && "day before training", record.adjacentOff?.after && "day after training"].filter(Boolean).join(" and ")}</Alert>}
      <Stack spacing={.5}>{(record.approvalChain || []).map((step, index) => <Typography key={`${step.employeeId}-${index}`} variant="body2" color={step.status === "Approved" ? "success.main" : "text.secondary"}>{index + 1}. {step.name} · {step.level} · {step.status}{record.currentApproverId === step.employeeId && record.status === "Pending Approval" ? " (current stage)" : ""}</Typography>)}</Stack>
      {!record.canApprove && ["Pending Approval", "Nominated"].includes(record.status) && <Alert severity="info">Awaiting {record.currentApproverName || "the assigned approver"}. Approval is available to the officer responsible for this stage.</Alert>}
      {record.replacementEmployee?.name && <Typography>Replacement: <strong>{record.replacementEmployee.name}</strong></Typography>}
      {record.actingSICEmployee?.name && <Typography>Acting SIC: <strong>{record.actingSICEmployee.name}</strong></Typography>}
      {record.canApprove && !adjacent && record.isShiftEmployee && <Stack spacing={1}>
        <FormControlLabel label="Replacement required" control={<Checkbox disabled={busy} checked={coverage.replacementRequired} onChange={(event) => { setCoverage((current) => ({ ...current, replacementRequired: event.target.checked })); if (event.target.checked) loadCandidates(); }} />} />
        {coverage.replacementRequired && selector("replacementEmployeeId", "Replacement employee")}
        {record.isGroupSIC && <FormControlLabel label="Assign Acting SIC" control={<Checkbox disabled={busy} checked={coverage.assignActingSIC} onChange={(event) => { setCoverage((current) => ({ ...current, assignActingSIC: event.target.checked })); if (event.target.checked) loadCandidates(); }} />} />}
        {coverage.assignActingSIC && selector("actingSICEmployeeId", "Acting SIC")}
        {candidateLoading && <Typography variant="body2">Loading candidates…</Typography>}
      </Stack>}
      {record.canApprove && <>
        {rejecting && <TextField fullWidth label="Reason for rejection" multiline minRows={2} value={reason} onChange={(event) => setReason(event.target.value)} disabled={busy} />}
        <Stack direction="row" spacing={1}>
          <Button variant="contained" disabled={busy || (coverage.replacementRequired && !coverage.replacementEmployeeId) || (coverage.assignActingSIC && !coverage.actingSICEmployeeId)} onClick={() => act("approve")}>{busy ? "Saving…" : "Approve"}</Button>
          <Button color="error" variant="outlined" disabled={busy} onClick={() => rejecting ? act("reject") : setRejecting(true)}>{rejecting ? "Confirm rejection" : "Reject"}</Button>
          {rejecting && <Button disabled={busy} onClick={() => setRejecting(false)}>Cancel</Button>}
        </Stack>
      </>}
      {record.canManageReplacement && onReplacement && <Button variant="outlined" onClick={onReplacement}>{record.replacementEmployee?.employeeId ? "Change replacement" : "Assign replacement"}</Button>}
      {record.adjacentOffRequest && <Alert severity="info">OFF request: {record.adjacentOffRequest.status}{record.adjacentOffRequest.currentApproverName ? ` · awaiting ${record.adjacentOffRequest.currentApproverName}` : ""}</Alert>}
      {record.canRequestAdjacentOff && <Box>
        <Typography fontWeight={800}>Request OFF beside this training</Typography>
        <Stack direction="row"><FormControlLabel label="Day before" control={<Checkbox disabled={busy} checked={off.before} onChange={(event) => setOff((current) => ({ ...current, before: event.target.checked }))} />} /><FormControlLabel label="Day after" control={<Checkbox disabled={busy} checked={off.after} onChange={(event) => setOff((current) => ({ ...current, after: event.target.checked }))} />} /></Stack>
        <Button variant="outlined" disabled={busy || (!off.before && !off.after)} onClick={() => act("off")}>Request OFF</Button>
      </Box>}
    </>}
  </Stack>;
}
