import React from "react";
import dayjs from "dayjs";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { AlertCircle, AlertTriangle, Clock, Send, X } from "lucide-react";
import UrgencyChip, { computeUrgencyTag } from "./UrgencyChip";

export default function UrgencyPromptDialog({
  open,
  onClose,
  onConfirm,
  rows = [],
  reason = "",
  employeeName = "",
  submitting = false,
}) {
  if (!open || !rows.length) return null;

  const today = dayjs().startOf("day");
  const categorizedRows = rows.map((row) => {
    const lvDate = dayjs(row.date).startOf("day");
    const diffDays = lvDate.diff(today, "day");
    const tag = computeUrgencyTag(today, row.date);
    return {
      ...row,
      diffDays,
      tag,
    };
  });

  const hasEmergency = categorizedRows.some((r) => r.tag === "Emergency");
  const hasUrgent = categorizedRows.some((r) => r.tag === "Urgent");

  const primaryTag = hasEmergency ? "Emergency" : "Urgent";
  const accentColor = hasEmergency ? "#DC2626" : "#D97706";
  const bgHeader = hasEmergency ? "#FEF2F2" : "#FFFBEB";
  const borderHeader = hasEmergency ? "#FECACA" : "#FDE68A";

  const noticeText = (diffDays) => {
    if (diffDays < 0) return `${Math.abs(diffDays)} day(s) back-dated`;
    if (diffDays === 0) return "Same day (0 days notice)";
    if (diffDays === 1) return "1 day in advance";
    return `${diffDays} days in advance`;
  };

  return (
    <Dialog
      open={open}
      onClose={!submitting ? onClose : undefined}
      fullWidth
      maxWidth="sm"
      PaperProps={{
        sx: {
          borderRadius: 3.5,
          overflow: "hidden",
          border: `1.5px solid ${borderHeader}`,
          boxShadow: "0 20px 60px rgba(15, 23, 42, 0.18)",
        },
      }}
    >
      <DialogTitle
        sx={{
          background: bgHeader,
          borderBottom: `1px solid ${borderHeader}`,
          px: 3,
          py: 2,
          display: "flex",
          alignItems: "center",
          gap: 1.5,
        }}
      >
        <Box
          sx={{
            width: 38,
            height: 38,
            borderRadius: 2,
            display: "grid",
            placeItems: "center",
            background: hasEmergency ? "#FEE2E2" : "#FEF3C7",
            color: accentColor,
            flexShrink: 0,
          }}
        >
          {hasEmergency ? <AlertCircle size={22} /> : <AlertTriangle size={22} />}
        </Box>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography sx={{ fontWeight: 950, fontSize: 16.5, color: "#0F172A" }}>
            {hasEmergency ? "Emergency Leave Notice" : "Urgent Leave Notice"}
          </Typography>
          <Typography sx={{ fontSize: 11, color: "#64748B", fontWeight: 700 }}>
            {employeeName ? `For ${employeeName} · ` : ""}
            Advance notice verification required before submission
          </Typography>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ p: 3, display: "grid", gap: 2 }}>
        {hasEmergency ? (
          <Alert
            severity="error"
            icon={<AlertCircle size={20} />}
            sx={{
              borderRadius: 2,
              fontWeight: 750,
              fontSize: 12,
              border: "1px solid #FCA5A5",
              background: "#FFF1F2",
            }}
          >
            <strong>Emergency Leave (&lt; 2 days notice):</strong> You are requesting leave on very short notice.
            Emergency leaves bypass normal planning cycles and notify the Shift-in-Charge / Reporting Officer immediately.
          </Alert>
        ) : (
          <Alert
            severity="warning"
            icon={<Clock size={20} />}
            sx={{
              borderRadius: 2,
              fontWeight: 750,
              fontSize: 12,
              border: "1px solid #FDE047",
              background: "#FEFCE8",
            }}
          >
            <strong>Urgent Leave (2–7 days notice):</strong> You are requesting leave between 2 and 7 days ahead.
            This application will be flagged as <strong>Urgent</strong> on the approval queue for expedited action.
          </Alert>
        )}

        <Box>
          <Typography sx={{ fontSize: 11.5, fontWeight: 900, color: "#334155", mb: 0.8 }}>
            Selected Date(s) &amp; Urgency Classification:
          </Typography>
          <TableContainer
            sx={{
              border: "1px solid #E2E8F0",
              borderRadius: 2,
              maxHeight: 220,
              overflow: "auto",
            }}
          >
            <Table size="small">
              <TableHead sx={{ background: "#F8FAFC" }}>
                <TableRow>
                  <TableCell sx={{ fontWeight: 900, fontSize: 11 }}>Date</TableCell>
                  <TableCell sx={{ fontWeight: 900, fontSize: 11 }}>Leave Type</TableCell>
                  <TableCell sx={{ fontWeight: 900, fontSize: 11 }}>Advance Notice</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 900, fontSize: 11 }}>Tag</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {categorizedRows.map((row) => (
                  <TableRow
                    key={row.date}
                    sx={{
                      background:
                        row.tag === "Emergency"
                          ? "#FFF5F5"
                          : row.tag === "Urgent"
                          ? "#FFFDF5"
                          : "#FFFFFF",
                    }}
                  >
                    <TableCell sx={{ fontWeight: 850, fontSize: 12 }}>
                      {dayjs(row.date).format("ddd, DD MMM YYYY")}
                    </TableCell>
                    <TableCell sx={{ fontSize: 11.5, fontWeight: 750 }}>
                      {row.stationLeaveOnlyAllowed
                        ? "Station Leave"
                        : `${row.leaveType || "-"}${row.stationLeave ? " + Station Leave" : ""}`}
                    </TableCell>
                    <TableCell sx={{ fontSize: 11, color: "#64748B", fontWeight: 700 }}>
                      {noticeText(row.diffDays)}
                    </TableCell>
                    <TableCell align="right">
                      <UrgencyChip value={row.tag} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>

        {reason && (
          <Box
            sx={{
              p: 1.4,
              borderRadius: 2,
              background: "#F8FAFC",
              border: "1px solid #E2E8F0",
            }}
          >
            <Typography sx={{ fontSize: 10.5, fontWeight: 900, color: "#64748B", textTransform: "uppercase" }}>
              Reason for Leave:
            </Typography>
            <Typography sx={{ fontSize: 12, fontWeight: 700, color: "#1E293B", mt: 0.3 }}>
              {reason}
            </Typography>
          </Box>
        )}

        <Typography sx={{ fontSize: 11, color: "#64748B", fontStyle: "italic", textAlign: "center" }}>
          Please confirm you want to proceed with this {primaryTag.toLowerCase()} leave request.
        </Typography>
      </DialogContent>

      <Divider />

      <DialogActions sx={{ p: 2.2, gap: 1, justifyContent: "space-between" }}>
        <Button
          onClick={onClose}
          disabled={submitting}
          variant="outlined"
          color="inherit"
          startIcon={<X size={15} />}
          sx={{ textTransform: "none", fontWeight: 800, borderRadius: 2 }}
        >
          Review &amp; Edit Dates
        </Button>
        <Button
          onClick={onConfirm}
          disabled={submitting}
          variant="contained"
          startIcon={<Send size={15} />}
          sx={{
            textTransform: "none",
            fontWeight: 900,
            borderRadius: 2,
            px: 2.5,
            background: hasEmergency ? "#DC2626" : "#D97706",
            "&:hover": {
              background: hasEmergency ? "#B91C1C" : "#B45309",
            },
          }}
        >
          {submitting ? "Submitting..." : `Yes, Submit ${primaryTag} Leave`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
