import { useEffect, useMemo, useState } from "react";
import { Alert, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Tooltip, Typography } from "@mui/material";
import dayjs from "dayjs";
import { RotateCcw } from "lucide-react";
import api from "../../crewLegacy/api";

import LeaveProgress from "./LeaveProgress";
import LeavePeriodEditor from "./LeavePeriodEditor";
import LeaveDelete from "./LeaveDelete";
import UrgencyChip from "./UrgencyChip";

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

  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [reviewDates, setReviewDates] = useState([]);
  const [reviewRequired, setReviewRequired] = useState(false);
  const [reviewComment, setReviewComment] = useState("");
  const [savingReview, setSavingReview] = useState(false);
  const [reviewNotice, setReviewNotice] = useState(null);

  const replacementHistoryRows = useMemo(() => {
    const raw = [];
    const rows = applicationRows && applicationRows.length ? applicationRows : [leave];

    for (const r of rows) {
      const leaveDate = r.date || leave?.date;
      const history = r.replacementDecisionHistory || [];
      if (history.length > 0) {
        for (const d of history) {
          raw.push({
            leaveDate,
            leaveId: r.id || r._id,
            stage: d.stage || "Approver",
            required: Boolean(d.required),
            decidedBy: d.decidedByName || d.decidedBy || "Approving Officer",
            decidedById: d.decidedBy || "",
            decidedOn: d.decidedOn,
            comment: d.comment || d.reason || "",
            changedFromSIC: Boolean(d.changedFromSIC),
            isReview: Boolean(d.review || d.isReview),
          });
        }
      } else {
        if (r.sicApprovalStatus === "Forwarded" && r.sicReplacementRequired !== undefined && r.sicReplacementRequired !== null) {
          raw.push({
            leaveDate,
            leaveId: r.id || r._id,
            stage: "SIC",
            required: Boolean(r.sicReplacementRequired),
            decidedBy: r.sicApprovedByName || r.sicApprovedBy || "SIC",
            decidedById: r.sicApprovedBy || "",
            decidedOn: r.sicApprovedOn || r.updatedOn,
            comment: "",
            changedFromSIC: false,
          });
        }
        if (r.deptApprovalStatus === "Approved" && (r.replacementRequired !== undefined || r.dicReplacementRequired !== undefined)) {
          raw.push({
            leaveDate,
            leaveId: r.id || r._id,
            stage: "DIC",
            required: Boolean(r.dicReplacementRequired !== undefined ? r.dicReplacementRequired : r.replacementRequired),
            decidedBy: r.deptApprovedByName || r.approvedBy || "DIC",
            decidedById: r.approvedBy || "",
            decidedOn: r.deptApprovedOn || r.updatedOn,
            comment: "",
            changedFromSIC: false,
          });
        }
      }
    }

    // Group items that belong to the same decision action
    const groups = [];
    for (const item of raw) {
      let matched = false;
      for (const g of groups) {
        if (
          g.stage === item.stage &&
          g.required === item.required &&
          g.decidedById === item.decidedById &&
          g.comment === item.comment
        ) {
          g.dates.push(item.leaveDate);
          if (item.decidedOn && (!g.decidedOn || item.decidedOn > g.decidedOn)) {
            g.decidedOn = item.decidedOn;
          }
          matched = true;
          break;
        }
      }
      if (!matched) {
        groups.push({
          stage: item.stage,
          required: item.required,
          decidedBy: item.decidedBy,
          decidedById: item.decidedById,
          decidedOn: item.decidedOn,
          comment: item.comment,
          changedFromSIC: item.changedFromSIC,
          isReview: item.isReview,
          dates: [item.leaveDate],
        });
      }
    }

    return groups.map((g) => {
      const datesSorted = [...new Set(g.dates)].filter(Boolean).sort();
      let dateLabel = "-";
      if (datesSorted.length === 1) {
        dateLabel = dayjs(datesSorted[0]).format("DD MMM YYYY");
      } else if (datesSorted.length > 1) {
        const first = datesSorted[0];
        const last = datesSorted[datesSorted.length - 1];
        dateLabel = `${dayjs(first).format("DD MMM")} → ${dayjs(last).format("DD MMM YYYY")} (${datesSorted.length} days)`;
      }
      return { ...g, dateLabel, datesList: datesSorted };
    });
  }, [applicationRows, leave]);

  const isReplacementRequired = Boolean(leave.replacementRequired || leave.dicReplacementRequired || leave.sicReplacementRequired || replacementHistoryRows.some(d => d.required));
  const hasReplacementAssigned = Boolean(leave.replacementAssigned || leave.replacementEmployee?.name);

  const handleSaveReview = async () => {
    if (!reviewDates.length) {
      setReviewNotice({ severity: "warning", text: "Please select at least one date." });
      return;
    }
    setSavingReview(true);
    setReviewNotice(null);
    try {
      const selectedLeaveIds = applicationRows
        .filter(r => reviewDates.includes(r.date))
        .map(r => r.id || r._id)
        .filter(Boolean);

      const payload = {
        leaveIds: selectedLeaveIds,
        dates: reviewDates,
        leaveGroupId: leave.leaveGroupId,
        employeeId: leave.employeeId,
        replacementRequired: reviewRequired,
        comment: reviewComment.trim(),
      };

      await api.put("/leave/review-replacement-requirement", payload);
      for (const r of applicationRows) {
        if (reviewDates.includes(r.date)) {
          r.replacementRequired = reviewRequired;
          r.dicReplacementRequired = reviewRequired;
          r.replacementDecisionHistory = [
            ...(r.replacementDecisionHistory || []),
            {
              stage: "Review",
              required: reviewRequired,
              decidedByName: "Reviewer",
              decidedBy: "Reviewer",
              decidedOn: new Date().toISOString(),
              comment: reviewComment.trim(),
              isReview: true,
            }
          ];
        }
      }
      leave.replacementRequired = reviewRequired;
      leave.dicReplacementRequired = reviewRequired;

      setSavingReview(false);
      setReviewDialogOpen(false);
      if (onUpdated) onUpdated();
      window.dispatchEvent(new Event("crew-workflows-changed"));
    } catch (err) {
      setSavingReview(false);
      const msg = err.response?.data?.detail || err.message || "Failed to update replacement requirement.";
      setReviewNotice({ severity: "error", text: msg });
    }
  };

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
        <Box>
          <Stack direction="row" spacing={1} alignItems="center">
            <Chip label={leave.finalStatus || "Applied"} />
            <UrgencyChip value={leave.urgencyTag} />
          </Stack>
          <Typography sx={{ mt: 1 }}>{leave.leaveType || "Station leave"}</Typography>
          {leave.reason && <Typography color="text.secondary">{leave.reason}</Typography>}
        </Box>
        {!selectedDatesOnly && onReapply && leave.isOwner && applicationRows.some(row => row.finalStatus === "Approved") && <Alert severity="info">To change an approved period, cancel the dates you no longer need and apply for revised dates. The new dates require approval.</Alert>}
        {leave.createdOn && <Typography variant="body2">Submitted {when(leave.createdOn)}</Typography>}
        <Box sx={{ p: 2.5, bgcolor: "#F7F7FE", borderRadius: 4 }}><LeaveProgress leave={leave} /></Box>
        {leave.currentApproverNames?.length > 0 && !["Approved", "Cancelled", "Rejected", "Withdrawn"].includes(leave.finalStatus) && <Alert severity="info">Awaiting {leave.currentApproverNames.join(", ")}</Alert>}
        {(leave.rejectionHistory || []).map((item, i) => <Alert key={i} severity="warning">{item.comment || item.reason || "Rejected"} · {item.rejectedBy || item.employeeId} {when(item.rejectedOn || item.date)}</Alert>)}
        {leave.cancelledBy && <Alert severity="info">Cancelled by {leave.cancelledBy} ({leave.cancelledByRole}) · {when(leave.cancelledOn)}</Alert>}
        {/* Replacement Requirement & Approval Decision Audit */}
        <Paper variant="outlined" sx={{ p: 1.8, borderRadius: 3, border: "1px solid #D9E2EC", bgcolor: "#F8FAFC" }}>
          <Stack spacing={1.2}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} flexWrap="wrap">
              <Stack direction="row" alignItems="center" spacing={1}>
                <Box sx={{ width: 26, height: 26, borderRadius: 1.5, display: "grid", placeItems: "center", color: isReplacementRequired ? "#B45309" : "#475569", bgcolor: isReplacementRequired ? "#FEF3C7" : "#E2E8F0", fontWeight: 950, fontSize: 12 }}>
                  R
                </Box>
                <Box>
                  <Typography sx={{ fontSize: 13, fontWeight: 900, color: "#0F172A" }}>
                    Replacement Requirement Option
                  </Typography>
                  <Typography sx={{ fontSize: 10.5, color: "#64748B" }}>
                    Decisions marked during approval and subsequent reviews
                  </Typography>
                </Box>
              </Stack>
              <Stack direction="row" spacing={0.8} alignItems="center" flexWrap="wrap">
                <Button
                  size="small"
                  variant="outlined"
                  color="primary"
                  startIcon={<RotateCcw size={13} />}
                  onClick={() => {
                    setReviewDates(applicationRows.map(r => r.date));
                    setReviewRequired(isReplacementRequired);
                    setReviewComment("");
                    setReviewNotice(null);
                    setReviewDialogOpen(true);
                  }}
                  sx={{ height: 26, fontSize: 11, fontWeight: 800, textTransform: "none", borderRadius: 1.8 }}
                >
                  Review / Change Option
                </Button>
                <Chip
                  size="small"
                  label={hasReplacementAssigned ? "Replacement Assigned" : isReplacementRequired ? "Replacement Required" : ["Approved", "Forwarded", "Forwarded by SIC"].includes(leave.finalStatus) ? "No Replacement Required" : "Pending Review"}
                  color={hasReplacementAssigned ? "success" : isReplacementRequired ? "warning" : "default"}
                  sx={{ fontWeight: 850 }}
                />
              </Stack>
            </Stack>

            {/* Compact Tabular Format for Replacement Decisions */}
            <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 220, borderRadius: 2, border: "1px solid #E2E8F0" }}>
              <Table size="small" stickyHeader sx={{ "& .MuiTableCell-root": { py: 0.6, px: 1, fontSize: 11.5 } }}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 850, bgcolor: "#F8FAFC", color: "#334155" }}>Leave Date(s)</TableCell>
                    <TableCell sx={{ fontWeight: 850, bgcolor: "#F8FAFC", color: "#334155" }}>Stage</TableCell>
                    <TableCell sx={{ fontWeight: 850, bgcolor: "#F8FAFC", color: "#334155" }}>Option</TableCell>
                    <TableCell sx={{ fontWeight: 850, bgcolor: "#F8FAFC", color: "#334155" }}>Decided By</TableCell>
                    <TableCell sx={{ fontWeight: 850, bgcolor: "#F8FAFC", color: "#334155" }}>Action Time</TableCell>
                    <TableCell sx={{ fontWeight: 850, bgcolor: "#F8FAFC", color: "#334155" }}>Remarks</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {replacementHistoryRows.map((row, idx) => (
                    <TableRow key={idx} hover sx={{ bgcolor: row.required ? "#FFFDF7" : "inherit" }}>
                      <TableCell sx={{ fontWeight: 800, whiteSpace: "nowrap", color: "#0F172A" }}>
                        {row.dateLabel}
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={row.stage}
                          sx={{ height: 20, fontSize: 10, fontWeight: 900, bgcolor: row.stage === "Review" ? "#E0E7FF" : "#E2E8F0", color: row.stage === "Review" ? "#3730A3" : "#1E293B" }}
                        />
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={row.required ? "Required" : "Not Required"}
                          color={row.required ? "warning" : "default"}
                          sx={{ height: 20, fontSize: 10, fontWeight: 850 }}
                        />
                      </TableCell>
                      <TableCell sx={{ whiteSpace: "nowrap" }}>
                        <Typography sx={{ fontSize: 11.5, fontWeight: 700, color: "#1E293B" }}>
                          {row.decidedBy}
                        </Typography>
                        {row.decidedById && row.decidedById !== row.decidedBy && (
                          <Typography sx={{ fontSize: 10, color: "#64748B" }}>
                            ID: {row.decidedById}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell sx={{ fontSize: 10.5, color: "#64748B", whiteSpace: "nowrap" }}>
                        {row.decidedOn ? dayjs(row.decidedOn).format("DD/MM/YYYY, hh:mm A") : "—"}
                      </TableCell>
                      <TableCell sx={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        <Tooltip title={row.comment || ""}>
                          <span>{row.comment || "—"}</span>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!replacementHistoryRows.length && (
                    <TableRow>
                      <TableCell colSpan={6} align="center" sx={{ py: 2, color: "#94A3B8" }}>
                        No replacement decisions recorded yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>

            {hasReplacementAssigned && (
              <Alert severity="success" sx={{ py: 0.3, px: 1.2, borderRadius: 2, fontSize: 12 }}>
                Replacement assigned to: <strong>{leave.replacementEmployee?.name || "Assigned"}</strong> {leave.replacementEmployee?.employeeId ? `(${leave.replacementEmployee.employeeId})` : ""}
              </Alert>
            )}
          </Stack>
        </Paper>

        {/* Review Replacement Requirement Dialog */}
        <Dialog
          open={reviewDialogOpen}
          onClose={() => !savingReview && setReviewDialogOpen(false)}
          fullWidth
          maxWidth="xs"
          slotProps={{ paper: { sx: { borderRadius: 3, p: 1 } } }}
        >
          <DialogTitle sx={{ fontWeight: 900, fontSize: 16, pb: 1 }}>
            Review Replacement Requirement
            <Typography sx={{ fontSize: 11.5, color: "#64748B", mt: 0.2 }}>
              {leave.name} ({leave.employeeId})
            </Typography>
          </DialogTitle>
          <DialogContent dividers sx={{ display: "grid", gap: 1.8, py: 2 }}>
            {reviewNotice && <Alert severity={reviewNotice.severity}>{reviewNotice.text}</Alert>}

            {/* Date selection */}
            <Box>
              <Typography sx={{ fontSize: 11.5, fontWeight: 850, color: "#334155", mb: 0.6 }}>
                Select Leave Date(s) to Review:
              </Typography>
              <Stack sx={{ maxHeight: 130, overflowY: "auto", border: "1px solid #E2E8F0", borderRadius: 1.5, p: 0.8, bgcolor: "#F8FAFC" }}>
                {applicationRows.length > 1 && (
                  <FormControlLabel
                    sx={{ m: 0 }}
                    control={
                      <Checkbox
                        size="small"
                        checked={reviewDates.length === applicationRows.length}
                        indeterminate={reviewDates.length > 0 && reviewDates.length < applicationRows.length}
                        onChange={(e) => setReviewDates(e.target.checked ? applicationRows.map(r => r.date) : [])}
                      />
                    }
                    label={<Typography sx={{ fontSize: 11.5, fontWeight: 800 }}>Select All Dates</Typography>}
                  />
                )}
                {applicationRows.map((r) => {
                  const isDateSelected = reviewDates.includes(r.date);
                  return (
                    <FormControlLabel
                      key={r.date}
                      sx={{ m: 0 }}
                      control={
                        <Checkbox
                          size="small"
                          checked={isDateSelected}
                          onChange={(e) =>
                            setReviewDates(curr =>
                              e.target.checked ? [...curr, r.date] : curr.filter(d => d !== r.date)
                            )
                          }
                        />
                      }
                      label={
                        <Typography sx={{ fontSize: 11.5 }}>
                          {dayjs(r.date).format("DD MMM YYYY")} · {r.replacementRequired ? "Cover Required" : "Cover Not Required"}
                        </Typography>
                      }
                    />
                  );
                })}
              </Stack>
            </Box>

            {/* Decision Selection */}
            <Box>
              <Typography sx={{ fontSize: 11.5, fontWeight: 850, color: "#334155", mb: 0.8 }}>
                Replacement Requirement Option:
              </Typography>
              <Stack direction="row" spacing={1}>
                <Button
                  fullWidth
                  size="small"
                  variant={reviewRequired ? "contained" : "outlined"}
                  color={reviewRequired ? "warning" : "inherit"}
                  onClick={() => setReviewRequired(true)}
                  sx={{ fontWeight: 850, fontSize: 11.5, textTransform: "none", py: 1 }}
                >
                  Replacement Required
                </Button>
                <Button
                  fullWidth
                  size="small"
                  variant={!reviewRequired ? "contained" : "outlined"}
                  onClick={() => setReviewRequired(false)}
                  sx={{
                    fontWeight: 850,
                    fontSize: 11.5,
                    textTransform: "none",
                    py: 1,
                    bgcolor: !reviewRequired ? "#334155" : "inherit",
                    color: !reviewRequired ? "#FFF" : "inherit",
                    "&:hover": { bgcolor: !reviewRequired ? "#1E293B" : undefined }
                  }}
                >
                  No Replacement
                </Button>
              </Stack>
            </Box>

            {/* Remarks */}
            <TextField
              fullWidth
              multiline
              minRows={2}
              size="small"
              label="Review Remarks / Reason"
              placeholder="e.g. Cover required due to shift shortage, or not required after review..."
              value={reviewComment}
              onChange={(e) => setReviewComment(e.target.value)}
              inputProps={{ maxLength: 1000 }}
            />
          </DialogContent>
          <DialogActions sx={{ px: 2, pb: 1.5 }}>
            <Button disabled={savingReview} onClick={() => setReviewDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="contained"
              color="primary"
              disabled={savingReview || !reviewDates.length}
              onClick={handleSaveReview}
              sx={{ fontWeight: 850 }}
            >
              {savingReview ? "Saving..." : "Save Review"}
            </Button>
          </DialogActions>
        </Dialog>

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
