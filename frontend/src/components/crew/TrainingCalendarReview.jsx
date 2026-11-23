import { useEffect, useState } from "react";
import { Alert, Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Stack, TextField, Typography } from "@mui/material";
import NominationEditor from "./NominationEditor";
import api from "../../crewLegacy/api";

const isOffDuty = (duty) => {
  const norm = String(duty || "").trim().toUpperCase();
  return ["OFF", "REST", "WO", "W-OFF", "W_OFF", "WEEKLY OFF", "WEEKLY_OFF", "C-OFF", "COMP-OFF", "NONE", ""].includes(norm);
};

export default function TrainingCalendarReview({ requestId, onChanged, onReplacement, proposedStartDate }) {
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
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [reviewDates, setReviewDates] = useState([]);

  const load = async () => {
    const { data } = await api.get(`/training-assign/nomination/${requestId}`);
    setRecord(data);
    const allDates = data.dates && data.dates.length ? data.dates : [data.startDate || data.trainingDate].filter(Boolean);
    const nonOffDates = allDates.filter((d) => !isOffDuty(data.dateDuties?.[d]));
    const initialRepDates = (data.replacementRequiredDates && data.replacementRequiredDates.length
      ? data.replacementRequiredDates
      : (data.replacementRequired ? nonOffDates : nonOffDates)).filter((d) => !isOffDuty(data.dateDuties?.[d]));
    setCoverage({
      replacementRequired: Boolean(data.replacementRequired) && initialRepDates.length > 0,
      replacementRequiredDates: initialRepDates,
      replacementEmployeeId: data.replacementEmployee?.employeeId || "",
      assignActingSIC: Boolean(data.actingSICEmployee?.employeeId),
      actingSICEmployeeId: data.actingSICEmployee?.employeeId || "",
    });
    setReviewDates(initialRepDates);
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
        const repDates = coverage.replacementRequired ? (coverage.replacementRequiredDates || []) : [];
        await api.post(`/training-assign/${action}`, {
          ids: [requestId], reason: reason.trim() || "Not approved",
          replacementDecisions: [{
            id: requestId,
            ...coverage,
            replacementRequired: repDates.length > 0 || Boolean(coverage.replacementRequired),
            replacementRequiredDates: repDates,
            actingSICEmployeeId: coverage.assignActingSIC ? coverage.actingSICEmployeeId : "",
          }],
        });
      }
      setRejecting(false);
      const updated = await load();
      setNotice({ severity: "success", text: action === "off" ? "OFF request submitted for approval." : action === "reject" ? "Request rejected." : updated.status === "Approved" ? "Final approval complete. Calendar updated." : `Approved and forwarded to ${updated.currentApproverName || "the next approver"}.` });
      window.dispatchEvent(new Event("crew-workflows-changed"));
      localStorage.setItem("crew-workflows-changed", String(Date.now()));
      onChanged?.();
    } catch (error) {
      setNotice({ severity: "error", text: error.response?.data?.detail || error.message || "The request could not be saved. Refresh to check its current status." });
    } finally { setBusy(false); }
  };

  if (loading) return <Box sx={{ p: 5, textAlign: "center" }}><CircularProgress /></Box>;
  const adjacent = record?.workflowKind === "Adjacent OFF";
  const selector = (field, label) => <TextField select fullWidth size="small" label={label} value={coverage[field]} disabled={busy || candidateLoading} onChange={(event) => setCoverage((current) => ({ ...current, [field]: event.target.value }))} slotProps={{ select: { onOpen: loadCandidates } }}>
    <MenuItem value="">Select employee</MenuItem>
    {coverage[field] && !candidates.some((candidate) => candidate.employeeId === coverage[field]) && <MenuItem value={coverage[field]}>{record.replacementEmployee?.employeeId === coverage[field] ? record.replacementEmployee.name : record.actingSICEmployee?.name || coverage[field]}</MenuItem>}
    {candidates.map((candidate) => <MenuItem key={candidate.employeeId} value={candidate.employeeId} disabled={candidate.hasConflict}>{candidate.name} ({candidate.employeeId}) · {candidate.dutySummary}{candidate.hasConflict ? " · Unavailable" : ""}</MenuItem>)}
  </TextField>;

  return <Stack spacing={2}>
    {notice && <Alert severity={notice.severity}>{notice.text}</Alert>}
    {record && <>
      <Box><Typography sx={{ fontWeight: 900 }} variant="h6" >{record.employeeName || record.employeeId}</Typography><Typography>{record.trainingName}</Typography><Typography color="text.secondary">{record.startDate} to {record.endDate} · {record.trainingLocation || "Location not specified"}</Typography></Box>
      <Stack sx={{ flexWrap: "wrap" }} direction="row" spacing={1}  useFlexGap><Chip label={record.status} color={record.status === "Approved" ? "success" : "default"} /><Chip label={adjacent ? "OFF request" : "Training"} /></Stack>
      {adjacent && <Alert severity="info">Requested OFF: {[record.adjacentOff?.before && "day before training", record.adjacentOff?.after && "day after training"].filter(Boolean).join(" and ")}</Alert>}
      <Stack spacing={.5}>{(record.approvalChain || []).map((step, index) => <Typography key={`${step.employeeId}-${index}`} variant="body2" color={step.status === "Approved" ? "success.main" : "text.secondary"}>{index + 1}. {step.name} · {step.level} · {step.status}{record.currentApproverId === step.employeeId && record.status === "Pending Approval" ? " (current stage)" : ""}</Typography>)}</Stack>
      {!record.canApprove && ["Pending Approval", "Nominated"].includes(record.status) && <Alert severity="info">Awaiting {record.currentApproverName || "the assigned approver"}. Approval is available to the officer responsible for this stage.</Alert>}
      {record.replacementEmployee?.name && <Typography>Replacement: <strong>{record.replacementEmployee.name}</strong></Typography>}
      {record.actingSICEmployee?.name && <Typography>Acting SIC: <strong>{record.actingSICEmployee.name}</strong></Typography>}
      {record.canApprove && record.isShiftEmployee && <Stack spacing={1}>
        <FormControlLabel label="Replacement required" control={<Checkbox disabled={busy} checked={coverage.replacementRequired} onChange={(event) => { setCoverage((current) => ({ ...current, replacementRequired: event.target.checked })); if (event.target.checked) loadCandidates(); }} />} />
        {coverage.replacementRequired && (
          <Box sx={{ p: 1.2, bgcolor: "#F8FAFC", borderRadius: 2, border: "1px solid #E2E8F0" }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.8 }}>
              <Typography sx={{ fontSize: 11.5, fontWeight: 800, color: "#1E293B" }}>
                Select Dates Requiring Replacement:
              </Typography>
              <Stack direction="row" spacing={1}>
                <Button
                  size="small"
                  onClick={() => setCoverage((c) => ({ ...c, replacementRequiredDates: [...(record.dates || [record.startDate])] }))}
                  sx={{ fontSize: 11, p: 0, textTransform: "none", minWidth: 0, fontWeight: 750 }}
                >
                  Select All
                </Button>
                <Typography sx={{ fontSize: 11, color: "#94A3B8" }}>|</Typography>
                <Button
                  size="small"
                  onClick={() => setCoverage((c) => ({ ...c, replacementRequiredDates: [] }))}
                  sx={{ fontSize: 11, p: 0, textTransform: "none", minWidth: 0, fontWeight: 750 }}
                >
                  Clear All
                </Button>
              </Stack>
            </Stack>
            <Stack spacing={0.4}>
              {(record.dates || [record.startDate]).map((d) => {
                const isChecked = (coverage.replacementRequiredDates || []).includes(d);
                return (
                  <FormControlLabel
                    key={d}
                    control={
                      <Checkbox
                        size="small"
                        checked={isChecked}
                        onChange={(e) => {
                          const chk = e.target.checked;
                          setCoverage((curr) => ({
                            ...curr,
                            replacementRequiredDates: chk
                              ? [...(curr.replacementRequiredDates || []), d]
                              : (curr.replacementRequiredDates || []).filter((x) => x !== d),
                          }));
                        }}
                      />
                    }
                    label={<Typography sx={{ fontSize: 11.5, color: isChecked ? "#0F172A" : "#64748B", fontWeight: isChecked ? 800 : 500 }}>{d} {isChecked ? "· Replacement Required" : "· No Cover Needed"}</Typography>}
                  />
                );
              })}
            </Stack>
          </Box>
        )}
        {coverage.replacementRequired && selector("replacementEmployeeId", "Replacement employee (Optional)")}
        {record.isGroupSIC && <FormControlLabel label="Assign Acting SIC" control={<Checkbox disabled={busy} checked={coverage.assignActingSIC} onChange={(event) => { setCoverage((current) => ({ ...current, assignActingSIC: event.target.checked })); if (event.target.checked) loadCandidates(); }} />} />}
        {coverage.assignActingSIC && selector("actingSICEmployeeId", "Acting SIC")}
        {candidateLoading && <Typography variant="body2">Loading candidates…</Typography>}
      </Stack>}
      {record.canApprove && <>
        {rejecting && <TextField fullWidth label="Reason for rejection" multiline minRows={2} value={reason} onChange={(event) => setReason(event.target.value)} disabled={busy} />}
        <Stack direction="row" spacing={1}>
          <Button variant="contained" disabled={busy || (coverage.assignActingSIC && !coverage.actingSICEmployeeId)} onClick={() => act("approve")}>{busy ? "Saving…" : "Approve"}</Button>
          <Button color="error" variant="outlined" disabled={busy} onClick={() => rejecting ? act("reject") : setRejecting(true)}>{rejecting ? "Confirm rejection" : "Reject"}</Button>
          {rejecting && <Button disabled={busy} onClick={() => setRejecting(false)}>Cancel</Button>}
        </Stack>
      </>}
      <NominationEditor key={`${record.id}-${record.revision}`} record={record} proposedStartDate={proposedStartDate} onChanged={async () => { await load(); onChanged?.(); }} />
      {(record.changeHistory || []).map((entry, index) => <Typography key={index} variant="caption" color="text.secondary">{entry.action} by {entry.by} on {new Date(entry.on).toLocaleString()}: {entry.reason}</Typography>)}
      {record.canManageReplacement && onReplacement && <Button variant="outlined" onClick={onReplacement}>{record.replacementEmployee?.employeeId ? "Change replacement" : "Assign replacement"}</Button>}
      {record.canManageReplacement && (
        <Box sx={{ mt: 1, p: 1.5, borderRadius: 2, bgcolor: "#F8FAFC", border: "1px dashed #CBD5E1" }}>
          <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "center" }} spacing={1}>
            <Box>
              <Typography sx={{ fontSize: 13, fontWeight: 900, color: "#1E293B" }}>
                Training Replacement Requirement
              </Typography>
              <Typography sx={{ fontSize: 11, color: "#64748B" }}>
                {record.replacementEmployee?.name
                  ? `Cover assigned: ${record.replacementEmployee.name} (${record.replacementEmployee.employeeId})`
                  : record.replacementRequired
                  ? "Marked as Replacement Required"
                  : "No replacement required for this training"}
              </Typography>
            </Box>
            <Stack direction="row" spacing={0.8} alignItems="center">
              <Chip
                size="small"
                label={record.replacementEmployee?.name ? `Cover: ${record.replacementEmployee.name}` : record.replacementRequired ? "Replacement Required" : "No Replacement"}
                color={record.replacementEmployee?.name ? "success" : record.replacementRequired ? "warning" : "default"}
                sx={{ fontWeight: 800 }}
              />
              <Button
                size="small"
                variant="outlined"
                disabled={busy}
                onClick={() => {
                  const allDates = record.dates || [record.startDate];
                  setReviewDates(record.replacementRequiredDates?.length ? record.replacementRequiredDates : (record.replacementRequired ? allDates : []));
                  setReviewDialogOpen(true);
                }}
                sx={{ textTransform: "none", fontWeight: 800, fontSize: 11 }}
              >
                Review / Change Dates
              </Button>
            </Stack>
          </Stack>
        </Box>
      )}
      {record.adjacentOffRequest && <Alert severity="info">OFF request: {record.adjacentOffRequest.status}{record.adjacentOffRequest.currentApproverName ? ` · awaiting ${record.adjacentOffRequest.currentApproverName}` : ""}</Alert>}
      {record.canRequestAdjacentOff && <Box>
        <Typography sx={{ fontWeight: 800 }} >Request OFF beside this training</Typography>
        <Stack direction="row"><FormControlLabel label="Day before" control={<Checkbox disabled={busy} checked={off.before} onChange={(event) => setOff((current) => ({ ...current, before: event.target.checked }))} />} /><FormControlLabel label="Day after" control={<Checkbox disabled={busy} checked={off.after} onChange={(event) => setOff((current) => ({ ...current, after: event.target.checked }))} />} /></Stack>
        <Button variant="outlined" disabled={busy || (!off.before && !off.after)} onClick={() => act("off")}>Request OFF</Button>
      </Box>}

      {/* Date-wise Replacement Requirement Dialog for Training */}
      <Dialog
        open={reviewDialogOpen}
        onClose={() => !busy && setReviewDialogOpen(false)}
        fullWidth
        maxWidth="xs"
        slotProps={{ paper: { sx: { borderRadius: 3 } } }}
      >
        <DialogTitle sx={{ fontWeight: 900, fontSize: 15 }}>
          Training Replacement Dates
          <Typography sx={{ fontSize: 11.5, color: "#64748B", mt: 0.3 }}>
            {record.employeeName} · {record.trainingName} ({record.startDate} to {record.endDate})
          </Typography>
        </DialogTitle>
        <DialogContent dividers sx={{ py: 1.5 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 800, color: "#1E293B" }}>
              Select Dates Requiring Replacement Cover:
            </Typography>
            <Stack direction="row" spacing={1}>
              <Button
                size="small"
                onClick={() => setReviewDates((record.dates || [record.startDate]).filter((d) => !isOffDuty(record.dateDuties?.[d])))}
                sx={{ fontSize: 11, p: 0, textTransform: "none", minWidth: 0, fontWeight: 750 }}
              >
                Select All Working
              </Button>
              <Typography sx={{ fontSize: 11, color: "#94A3B8" }}>|</Typography>
              <Button
                size="small"
                onClick={() => setReviewDates([])}
                sx={{ fontSize: 11, p: 0, textTransform: "none", minWidth: 0, fontWeight: 750 }}
              >
                Clear All
              </Button>
            </Stack>
          </Stack>
          <Stack spacing={0.6}>
            {(record.dates || [record.startDate]).map((d) => {
              const duty = record.dateDuties?.[d] || "";
              const isOff = isOffDuty(duty);
              const isChecked = !isOff && reviewDates.includes(d);
              return (
                <FormControlLabel
                  key={d}
                  control={
                    <Checkbox
                      size="small"
                      disabled={isOff}
                      checked={isChecked}
                      onChange={(e) => {
                        if (isOff) return;
                        const chk = e.target.checked;
                        setReviewDates((curr) => (chk ? [...curr, d] : curr.filter((x) => x !== d)));
                      }}
                    />
                  }
                  label={
                    isOff ? (
                      <Typography sx={{ fontSize: 12, fontWeight: 500, color: "#94A3B8", fontStyle: "italic" }}>
                        {d} · {duty || "OFF"} (Rest day · No replacement required)
                      </Typography>
                    ) : (
                      <Typography sx={{ fontSize: 12, fontWeight: isChecked ? 800 : 500, color: isChecked ? "#0F172A" : "#64748B" }}>
                        {d} {duty ? `· ${duty} Shift` : ""} {isChecked ? "· Replacement Required" : "· Cover Not Needed"}
                      </Typography>
                    )
                  }
                />
              );
            })}
          </Stack>
          {reviewDates.length === 0 && (
            <Alert severity="info" sx={{ mt: 1.5, py: 0.2, fontSize: 11 }}>
              No dates selected. If saved, replacement will not be required for this training.
            </Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 2.5, pb: 2 }}>
          <Button disabled={busy} onClick={() => setReviewDialogOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api.put(`/training-assign/set-replacement-required/${requestId}`, {
                  replacementRequiredDates: reviewDates,
                  replacementRequired: reviewDates.length > 0,
                });
                await load();
                setNotice({
                  severity: "success",
                  text: `Updated replacement requirement: ${reviewDates.length} date(s) marked for cover.`,
                });
                setReviewDialogOpen(false);
                onChanged?.();
              } catch (e) {
                setNotice({
                  severity: "error",
                  text: e.response?.data?.detail || "Could not update training replacement requirement.",
                });
              } finally {
                setBusy(false);
              }
            }}
            sx={{ fontWeight: 800 }}
          >
            {busy ? "Saving..." : "Save Dates"}
          </Button>
        </DialogActions>
      </Dialog>
    </>}
  </Stack>;
}
