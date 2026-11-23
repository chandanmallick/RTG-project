import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  Paper,
  Stack,
  Tab,
  Tabs,
  Typography,
  TextField,
  MenuItem,
  FormControl,
  InputLabel,
  Select,
} from "@mui/material";
import dayjs from "dayjs";
import {
  Calendar,
  CheckCircle2,
  Clock,
  GraduationCap,
  Info,
  Medal,
  Plane,
  RotateCcw,
  ShieldCheck,
  XCircle,
  UserCheck,
  Users,
} from "lucide-react";
import api from "../../crewLegacy/api";

const fmtDate = (d) => (d ? dayjs(d).format("DD MMM YYYY") : "—");
const fmtDay = (d) => (d ? dayjs(d).format("DD MMM YYYY (ddd)") : "—");

export default function TravelOffManager({ defaultScope = "all", onChanged }) {
  const [scope, setScope] = useState(defaultScope);
  const [trainingList, setTrainingList] = useState([]);
  const [sportsList, setSportsList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submittingId, setSubmittingId] = useState("");
  const [choices, setChoices] = useState({});
  const [notice, setNotice] = useState(null);
  const [trackingModal, setTrackingModal] = useState({
    open: false,
    item: null,
    type: "training",
  });

  const [repDialog, setRepDialog] = useState({
    open: false,
    item: null,
    req: null,
    type: "training",
    dates: [],
    requiredDates: [],
    replacementEmployeeId: "",
    mode: "normal",
    submitting: false,
    error: "",
  });

  const [employeesList, setEmployeesList] = useState([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);

  const fetchEmployees = async () => {
    if (employeesList.length > 0) return;
    setLoadingEmployees(true);
    try {
      const res = await api.get("/admin/employees");
      const list = (res.data || [])
        .filter((e) => e.isActive !== false)
        .map((e) => ({
          employeeId: e.userId || e.employeeId,
          name: e.name || e.employeeId,
          designation: e.designation || "",
          department: e.department || "",
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
      setEmployeesList(list);
    } catch {
      // fallback
    } finally {
      setLoadingEmployees(false);
    }
  };

  const openReplacementDialog = (item, req) => {
    fetchEmployees();
    const beforeDate = item.startDate
      ? dayjs(item.startDate).subtract(1, "day").format("YYYY-MM-DD")
      : null;
    const afterDate = item.endDate
      ? dayjs(item.endDate).add(1, "day").format("YYYY-MM-DD")
      : null;
    const targetDates = [
      req.adjacentOff?.before && beforeDate,
      req.adjacentOff?.after && afterDate,
    ].filter(Boolean);

    const initReqDates = req.replacementRequiredDates?.length
      ? req.replacementRequiredDates.filter((d) => targetDates.includes(d))
      : (req.replacementRequired ? targetDates : []);

    setRepDialog({
      open: true,
      item,
      req,
      type: item._type,
      dates: targetDates,
      requiredDates: initReqDates,
      replacementEmployeeId: req.replacementEmployee?.employeeId || "",
      mode: req.replacementMode || "normal",
      submitting: false,
      error: "",
    });
  };

  const saveReplacement = async () => {
    const { item, req, type, requiredDates, replacementEmployeeId, mode } = repDialog;
    if (!req) return;
    setRepDialog((prev) => ({ ...prev, submitting: true, error: "" }));
    try {
      const reqId = req.id || req._id;
      const isRepRequired = requiredDates.length > 0;
      const endpointSet =
        type === "sports"
          ? `/sports/applications/${reqId}/set-replacement-required`
          : `/training-assign/set-replacement-required/${reqId}`;

      await api.put(endpointSet, {
        replacementRequired: isRepRequired,
        replacementRequiredDates: requiredDates,
        replacementEmployeeId: isRepRequired ? replacementEmployeeId : "",
        mode,
      });

      if (isRepRequired && replacementEmployeeId) {
        const endpointAssign =
          type === "sports"
            ? `/sports/applications/${reqId}/assign-replacement`
            : `/training-assign/assign-replacement/${reqId}`;
        const method = type === "sports" ? api.put : api.post;
        await method(endpointAssign, {
          replacementEmployeeId,
          mode,
        });
      }

      setNotice({
        severity: "success",
        text: `Travel OFF replacement requirement updated successfully.`,
      });
      setRepDialog((prev) => ({ ...prev, open: false, submitting: false }));
      await loadData();
      window.dispatchEvent(new Event("crew-workflows-changed"));
      localStorage.setItem("crew-workflows-changed", String(Date.now()));
      onChanged?.();
    } catch (err) {
      setRepDialog((prev) => ({
        ...prev,
        submitting: false,
        error: err.response?.data?.detail || err.message || "Failed to save replacement settings.",
      }));
    }
  };

  const loadData = async () => {
    setLoading(true);
    setNotice(null);
    try {
      const [trRes, spRes] = await Promise.all([
        api.get("/training-assign/my-approved").catch(() => ({ data: [] })),
        api.get("/sports/my-approved").catch(() => ({ data: [] })),
      ]);
      setTrainingList(trRes.data || []);
      setSportsList(spRes.data || []);
    } catch (e) {
      setNotice({ severity: "error", text: "Could not load travel OFF programs." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleApply = async (item, type) => {
    const choice = choices[item.id] || { before: false, after: false };
    if (!choice.before && !choice.after) {
      setNotice({
        severity: "warning",
        text: "Please select at least one travel day (Day Before, Day After, or Both).",
      });
      return;
    }
    setSubmittingId(item.id);
    setNotice(null);
    try {
      const endpoint =
        type === "sports"
          ? `/sports/applications/${item.id}/request-adjacent-off`
          : `/training-assign/request-adjacent-off/${item.id}`;
      const { data } = await api.post(endpoint, choice);
      setNotice({
        severity: "success",
        text: data.message || "Travel OFF request submitted for approval.",
      });
      setChoices((curr) => ({
        ...curr,
        [item.id]: { before: false, after: false },
      }));
      await loadData();
      window.dispatchEvent(new Event("crew-workflows-changed"));
      localStorage.setItem("crew-workflows-changed", String(Date.now()));
      onChanged?.();
    } catch (err) {
      setNotice({
        severity: "error",
        text:
          err.response?.data?.detail ||
          err.message ||
          "Could not submit travel OFF request.",
      });
    } finally {
      setSubmittingId("");
    }
  };

  const combinedItems = useMemo(() => {
    const list = [];
    if (scope === "all" || scope === "training") {
      trainingList.forEach((tr) => {
        list.push({ ...tr, _type: "training" });
      });
    }
    if (scope === "all" || scope === "sports") {
      sportsList.forEach((sp) => {
        list.push({ ...sp, _type: "sports" });
      });
    }
    return list.sort((a, b) => (b.startDate || "").localeCompare(a.startDate || ""));
  }, [trainingList, sportsList, scope]);

  return (
    <Box sx={{ width: "100%" }}>
      {/* Informational Header */}
      <Paper
        elevation={0}
        sx={{
          p: 2,
          mb: 2,
          borderRadius: 2.5,
          border: "1px solid #C7D2FE",
          bgcolor: "#EEF2FF",
        }}
      >
        <Stack direction="row" spacing={1.5} alignItems="flex-start">
          <Box
            sx={{
              width: 38,
              height: 38,
              borderRadius: 2,
              bgcolor: "#4F46E5",
              color: "#FFF",
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
            }}
          >
            <Plane size={20} />
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography sx={{ fontSize: 14.5, fontWeight: 900, color: "#1E1B4B" }}>
              Travel / Journey OFF for Training &amp; Sports
            </Typography>
            <Typography sx={{ fontSize: 11.5, color: "#3730A3", mt: 0.3 }}>
              When participating in approved Training programs or Sports events, you can request
              roster OFF for the <strong>day before</strong> (journey to event) and the{" "}
              <strong>day after</strong> (return journey). These requests follow the reporting
              hierarchy for approval and <strong>do not consume your leave balance</strong>.
            </Typography>
          </Box>
          <Button
            size="small"
            variant="outlined"
            onClick={loadData}
            startIcon={<RotateCcw size={13} />}
            sx={{
              textTransform: "none",
              fontSize: 11,
              fontWeight: 800,
              borderRadius: 1.8,
              bgcolor: "#FFF",
            }}
          >
            Refresh
          </Button>
        </Stack>
      </Paper>

      {notice && (
        <Alert
          severity={notice.severity}
          onClose={() => setNotice(null)}
          sx={{ mb: 2, fontSize: 12 }}
        >
          {notice.text}
        </Alert>
      )}

      {/* Scope Filter Tabs */}
      <Box sx={{ mb: 2, borderBottom: 1, borderColor: "divider" }}>
        <Tabs
          value={scope}
          onChange={(_, val) => setScope(val)}
          sx={{
            minHeight: 36,
            "& .MuiTab-root": {
              minHeight: 36,
              py: 0.5,
              fontSize: 12,
              fontWeight: 850,
              textTransform: "none",
            },
          }}
        >
          <Tab
            value="all"
            label={`All Events (${trainingList.length + sportsList.length})`}
          />
          <Tab
            value="training"
            icon={<GraduationCap size={14} />}
            iconPosition="start"
            label={`Training (${trainingList.length})`}
          />
          <Tab
            value="sports"
            icon={<Medal size={14} />}
            iconPosition="start"
            label={`Sports (${sportsList.length})`}
          />
        </Tabs>
      </Box>

      {loading ? (
        <Box sx={{ py: 6, textAlign: "center" }}>
          <CircularProgress size={30} />
          <Typography sx={{ mt: 1, fontSize: 12, color: "#64748B" }}>
            Loading approved programs...
          </Typography>
        </Box>
      ) : combinedItems.length === 0 ? (
        <Paper
          variant="outlined"
          sx={{ p: 4, textAlign: "center", borderRadius: 3, bgcolor: "#F8FAFC" }}
        >
          <Typography sx={{ color: "#94A3B8", fontSize: 13, fontWeight: 700 }}>
            No approved training or sports events found for your employee profile.
          </Typography>
          <Typography sx={{ color: "#94A3B8", fontSize: 11, mt: 0.5 }}>
            Travel OFF can be requested once your training nomination or sports application is
            approved.
          </Typography>
        </Paper>
      ) : (
        <Stack spacing={1.5}>
          {combinedItems.map((item) => {
            const isSports = item._type === "sports";
            const req = item.adjacentOffRequest;
            const choice = choices[item.id] || { before: false, after: false };
            const isSubmitting = submittingId === item.id;

            const beforeDate = item.startDate
              ? dayjs(item.startDate).subtract(1, "day").format("YYYY-MM-DD")
              : null;
            const afterDate = item.endDate
              ? dayjs(item.endDate).add(1, "day").format("YYYY-MM-DD")
              : null;

            const canApply =
              !req || req.status === "Rejected" || req.status === "Cancelled";

            return (
              <Card
                key={`${item._type}-${item.id}`}
                variant="outlined"
                sx={{
                  borderRadius: 2.8,
                  borderColor: req?.status === "Approved" ? "#BBF7D0" : req ? "#FED7AA" : "#E2E8F0",
                  bgcolor: req?.status === "Approved" ? "#F0FDF4" : "#FFF",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
                }}
              >
                <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
                  <Stack
                    direction={{ xs: "column", md: "row" }}
                    justifyContent="space-between"
                    alignItems={{ md: "flex-start" }}
                    spacing={1.5}
                  >
                    {/* Event Info */}
                    <Box sx={{ flex: 1 }}>
                      <Stack direction="row" spacing={0.8} alignItems="center" sx={{ mb: 0.6 }}>
                        <Chip
                          size="small"
                          icon={
                            isSports ? (
                              <Medal size={12} color="#059669" />
                            ) : (
                              <GraduationCap size={12} color="#7C3AED" />
                            )
                          }
                          label={isSports ? "Sports Event" : "Training Program"}
                          sx={{
                            height: 22,
                            fontSize: 10.5,
                            fontWeight: 900,
                            bgcolor: isSports ? "#ECFDF5" : "#F5F3FF",
                            color: isSports ? "#047857" : "#6D28D9",
                          }}
                        />
                        <Typography sx={{ fontSize: 13.5, fontWeight: 900, color: "#0F172A" }}>
                          {item.eventName || item.trainingName}
                        </Typography>
                      </Stack>

                      <Typography sx={{ fontSize: 11, color: "#475569" }}>
                        Event Period: <strong>{fmtDate(item.startDate)}</strong> to{" "}
                        <strong>{fmtDate(item.endDate)}</strong>
                        {item.venue || item.trainingLocation ? (
                          <> · Venue: {item.venue || item.trainingLocation}</>
                        ) : null}
                      </Typography>

                      {/* Travel Date Badges */}
                      <Stack
                        direction="row"
                        spacing={1}
                        alignItems="center"
                        flexWrap="wrap"
                        sx={{ mt: 1 }}
                      >
                        <Box
                          sx={{
                            px: 1,
                            py: 0.4,
                            borderRadius: 1.5,
                            bgcolor: "#F1F5F9",
                            border: "1px solid #E2E8F0",
                            fontSize: 11,
                          }}
                        >
                          <Typography
                            component="span"
                            sx={{ fontSize: 10, color: "#64748B", fontWeight: 700 }}
                          >
                            Travel To (Day Before):{" "}
                          </Typography>
                          <strong>{fmtDay(beforeDate)}</strong>
                        </Box>
                        <Box
                          sx={{
                            px: 1,
                            py: 0.4,
                            borderRadius: 1.5,
                            bgcolor: "#F1F5F9",
                            border: "1px solid #E2E8F0",
                            fontSize: 11,
                          }}
                        >
                          <Typography
                            component="span"
                            sx={{ fontSize: 10, color: "#64748B", fontWeight: 700 }}
                          >
                            Travel Return (Day After):{" "}
                          </Typography>
                          <strong>{fmtDay(afterDate)}</strong>
                        </Box>
                      </Stack>
                    </Box>

                    {/* Status & Action Side */}
                    <Box sx={{ minWidth: { md: 280 }, textAlign: { md: "right" } }}>
                      {req ? (
                        <Stack spacing={0.8} alignItems={{ xs: "flex-start", md: "flex-end" }}>
                          <Stack direction="row" spacing={0.8} alignItems="center">
                            <Chip
                              size="small"
                              icon={
                                req.status === "Approved" ? (
                                  <CheckCircle2 size={13} color="#166534" />
                                ) : req.status === "Rejected" ? (
                                  <XCircle size={13} color="#991B1B" />
                                ) : (
                                  <Clock size={13} color="#9A3412" />
                                )
                              }
                              label={
                                req.status === "Approved"
                                  ? "Travel OFF Approved"
                                  : req.status === "Rejected"
                                  ? "Travel OFF Rejected"
                                  : "Approval Pending"
                              }
                              color={
                                req.status === "Approved"
                                  ? "success"
                                  : req.status === "Rejected"
                                  ? "error"
                                  : "warning"
                              }
                              sx={{ fontWeight: 850, fontSize: 11 }}
                            />
                            <Button
                              size="small"
                              variant="outlined"
                              onClick={() =>
                                setTrackingModal({
                                  open: true,
                                  item,
                                  type: item._type,
                                })
                              }
                              sx={{
                                textTransform: "none",
                                fontSize: 11,
                                fontWeight: 850,
                                borderRadius: 1.8,
                              }}
                            >
                              Track Approval
                            </Button>
                          </Stack>

                          <Typography sx={{ fontSize: 10.5, color: "#64748B" }}>
                            Requested:{" "}
                            <strong>
                              {[
                                req.adjacentOff?.before && "Day Before",
                                req.adjacentOff?.after && "Day After",
                              ]
                                .filter(Boolean)
                                .join(" & ")}
                            </strong>
                            {req.currentApproverName && req.status === "Pending Approval" ? (
                              <> · Awaiting {req.currentApproverName}</>
                            ) : null}
                          </Typography>

                          {/* Replacement Requirement & Coverage Badge + Action */}
                          <Stack direction="row" spacing={0.8} alignItems="center" flexWrap="wrap" sx={{ mt: 0.5 }}>
                            <Chip
                              size="small"
                              icon={<UserCheck size={12} />}
                              label={
                                req.replacementEmployee?.name
                                  ? `Cover: ${req.replacementEmployee.name}`
                                  : (req.replacementRequired || (req.replacementRequiredDates && req.replacementRequiredDates.length > 0))
                                  ? "Cover Required"
                                  : "No Cover Needed"
                              }
                              color={
                                req.replacementEmployee?.name
                                  ? "success"
                                  : (req.replacementRequired || (req.replacementRequiredDates && req.replacementRequiredDates.length > 0))
                                  ? "warning"
                                  : "default"
                              }
                              sx={{ height: 22, fontSize: 10.5, fontWeight: 800 }}
                            />
                            <Button
                              size="small"
                              variant="outlined"
                              color="secondary"
                              onClick={() => openReplacementDialog(item, req)}
                              startIcon={<RotateCcw size={11} />}
                              sx={{
                                height: 22,
                                fontSize: 10.5,
                                fontWeight: 850,
                                textTransform: "none",
                                borderRadius: 1.5,
                                px: 1,
                              }}
                            >
                              Review / Assign Replacement
                            </Button>
                          </Stack>
                        </Stack>
                      ) : (
                        <Chip
                          size="small"
                          label="Travel OFF Not Applied"
                          variant="outlined"
                          sx={{ fontSize: 10.5, color: "#64748B", fontWeight: 700 }}
                        />
                      )}
                    </Box>
                  </Stack>

                  {/* Apply Controls if not applied or rejected */}
                  {canApply && (
                    <Box
                      sx={{
                        mt: 1.5,
                        pt: 1.2,
                        borderTop: "1px dashed #E2E8F0",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        flexWrap: "wrap",
                        gap: 1,
                      }}
                    >
                      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                        <Typography sx={{ fontSize: 11.5, fontWeight: 800, color: "#334155" }}>
                          Apply Travel OFF:
                        </Typography>
                        <FormControlLabel
                          control={
                            <Checkbox
                              size="small"
                              checked={choice.before}
                              onChange={(e) =>
                                setChoices((c) => ({
                                  ...c,
                                  [item.id]: {
                                    before: e.target.checked,
                                    after: choice.after,
                                  },
                                }))
                              }
                            />
                          }
                          label={
                            <Typography sx={{ fontSize: 11.5 }}>
                              Day Before ({fmtDate(beforeDate)})
                            </Typography>
                          }
                        />
                        <FormControlLabel
                          control={
                            <Checkbox
                              size="small"
                              checked={choice.after}
                              onChange={(e) =>
                                setChoices((c) => ({
                                  ...c,
                                  [item.id]: {
                                    before: choice.before,
                                    after: e.target.checked,
                                  },
                                }))
                              }
                            />
                          }
                          label={
                            <Typography sx={{ fontSize: 11.5 }}>
                              Day After ({fmtDate(afterDate)})
                            </Typography>
                          }
                        />
                        <Button
                          size="small"
                          variant="text"
                          onClick={() =>
                            setChoices((c) => ({
                              ...c,
                              [item.id]: { before: true, after: true },
                            }))
                          }
                          sx={{
                            fontSize: 10.5,
                            textTransform: "none",
                            fontWeight: 800,
                            color: "#4F46E5",
                          }}
                        >
                          Select Both
                        </Button>
                      </Stack>

                      <Button
                        size="small"
                        variant="contained"
                        color="success"
                        disabled={isSubmitting || (!choice.before && !choice.after)}
                        onClick={() => handleApply(item, item._type)}
                        sx={{
                          textTransform: "none",
                          fontSize: 11,
                          fontWeight: 850,
                          borderRadius: 1.8,
                        }}
                      >
                        {isSubmitting ? "Submitting..." : "Submit for Approval"}
                      </Button>
                    </Box>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </Stack>
      )}

      {/* Tracking & Approval History Dialog */}
      <Dialog
        open={trackingModal.open}
        onClose={() => setTrackingModal({ open: false, item: null, type: "training" })}
        fullWidth
        maxWidth="sm"
        slotProps={{ paper: { sx: { borderRadius: 3, p: 1 } } }}
      >
        <DialogTitle sx={{ fontWeight: 950, fontSize: 16 }}>
          Travel OFF Approval Tracking
          {trackingModal.item && (
            <Typography sx={{ fontSize: 12, color: "#64748B", mt: 0.3 }}>
              {trackingModal.item.eventName || trackingModal.item.trainingName} ·{" "}
              {trackingModal.item.startDate} to {trackingModal.item.endDate}
            </Typography>
          )}
        </DialogTitle>
        <DialogContent dividers sx={{ py: 2 }}>
          {trackingModal.item?.adjacentOffRequest ? (
            <Stack spacing={2}>
              <Box sx={{ p: 1.5, bgcolor: "#F8FAFC", borderRadius: 2, border: "1px solid #E2E8F0" }}>
                <Typography sx={{ fontSize: 12, fontWeight: 800, color: "#0F172A", mb: 0.5 }}>
                  Requested Travel Days:
                </Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap">
                  {trackingModal.item.adjacentOffRequest.adjacentOff?.before && (
                    <Chip
                      size="small"
                      color="primary"
                      variant="outlined"
                      label={`Day Before: ${fmtDay(
                        dayjs(trackingModal.item.startDate).subtract(1, "day")
                      )}`}
                      sx={{ fontWeight: 800 }}
                    />
                  )}
                  {trackingModal.item.adjacentOffRequest.adjacentOff?.after && (
                    <Chip
                      size="small"
                      color="primary"
                      variant="outlined"
                      label={`Day After: ${fmtDay(
                        dayjs(trackingModal.item.endDate).add(1, "day")
                      )}`}
                      sx={{ fontWeight: 800 }}
                    />
                  )}
                </Stack>
              </Box>

              {/* Replacement Status in Tracking Modal */}
              <Box sx={{ p: 1.5, bgcolor: "#FFFBEB", borderRadius: 2, border: "1px solid #FDE68A" }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Box>
                    <Typography sx={{ fontSize: 12, fontWeight: 850, color: "#92400E" }}>
                      Replacement Requirement Option:
                    </Typography>
                    <Typography sx={{ fontSize: 11, color: "#B45309", mt: 0.2 }}>
                      {trackingModal.item.adjacentOffRequest.replacementEmployee?.name
                        ? `Cover assigned: ${trackingModal.item.adjacentOffRequest.replacementEmployee.name} (${trackingModal.item.adjacentOffRequest.replacementEmployee.employeeId})`
                        : (trackingModal.item.adjacentOffRequest.replacementRequired || (trackingModal.item.adjacentOffRequest.replacementRequiredDates && trackingModal.item.adjacentOffRequest.replacementRequiredDates.length > 0))
                        ? "Replacement Cover is REQUIRED for travel days"
                        : "No replacement cover needed for travel days"}
                    </Typography>
                  </Box>
                  <Button
                    size="small"
                    variant="outlined"
                    color="warning"
                    onClick={() => {
                      const curItem = trackingModal.item;
                      const curReq = trackingModal.item?.adjacentOffRequest;
                      setTrackingModal({ open: false, item: null, type: "training" });
                      openReplacementDialog(curItem, curReq);
                    }}
                    sx={{ textTransform: "none", fontSize: 11, fontWeight: 850, borderRadius: 1.8, bgcolor: "#FFF" }}
                  >
                    Change Option
                  </Button>
                </Stack>
              </Box>

              <Box>
                <Typography sx={{ fontSize: 12.5, fontWeight: 850, color: "#1E293B", mb: 1 }}>
                  Approval Workflow Hierarchy:
                </Typography>
                <Stack spacing={1}>
                  {(trackingModal.item.adjacentOffRequest.approvalChain || []).map(
                    (step, idx) => {
                      const isApproved = step.status === "Approved";
                      const isRejected = step.status === "Rejected";
                      const isCurrent =
                        trackingModal.item.adjacentOffRequest.status === "Pending Approval" &&
                        trackingModal.item.adjacentOffRequest.currentApproverId ===
                          step.employeeId;

                      return (
                        <Paper
                          key={idx}
                          variant="outlined"
                          sx={{
                            p: 1.2,
                            borderRadius: 2,
                            borderColor: isApproved
                              ? "#86EFAC"
                              : isCurrent
                              ? "#FDBA74"
                              : "#E2E8F0",
                            bgcolor: isApproved
                              ? "#F0FDF4"
                              : isCurrent
                              ? "#FFF7ED"
                              : "#FFF",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                          }}
                        >
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Box
                              sx={{
                                width: 22,
                                height: 22,
                                borderRadius: "50%",
                                display: "grid",
                                placeItems: "center",
                                fontSize: 10,
                                fontWeight: 900,
                                bgcolor: isApproved
                                  ? "#16A34A"
                                  : isCurrent
                                  ? "#EA580C"
                                  : "#94A3B8",
                                color: "#FFF",
                              }}
                            >
                              {idx + 1}
                            </Box>
                            <Box>
                              <Typography sx={{ fontSize: 12, fontWeight: 850 }}>
                                {step.name || step.employeeId}
                              </Typography>
                              <Typography sx={{ fontSize: 10.5, color: "#64748B" }}>
                                {step.level || "Approving Authority"}
                                {step.designation ? ` · ${step.designation}` : ""}
                              </Typography>
                            </Box>
                          </Stack>
                          <Box sx={{ textAlign: "right" }}>
                            <Chip
                              size="small"
                              label={
                                isApproved
                                  ? "Approved"
                                  : isRejected
                                  ? "Rejected"
                                  : isCurrent
                                  ? "Awaiting Action"
                                  : "Pending"
                              }
                              color={
                                isApproved
                                  ? "success"
                                  : isRejected
                                  ? "error"
                                  : isCurrent
                                  ? "warning"
                                  : "default"
                              }
                              sx={{ height: 20, fontSize: 10, fontWeight: 850 }}
                            />
                            {step.actedOn && (
                              <Typography sx={{ fontSize: 9.5, color: "#64748B", mt: 0.2 }}>
                                {dayjs(step.actedOn).format("DD/MM/YYYY, hh:mm A")}
                              </Typography>
                            )}
                          </Box>
                        </Paper>
                      );
                    }
                  )}
                  {!(trackingModal.item.adjacentOffRequest.approvalChain || []).length && (
                    <Typography sx={{ fontSize: 11.5, color: "#94A3B8", py: 1 }}>
                      No approval hierarchy recorded.
                    </Typography>
                  )}
                </Stack>
              </Box>
            </Stack>
          ) : (
            <Typography sx={{ py: 2, textAlign: "center", color: "#94A3B8" }}>
              No travel OFF request details found.
            </Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 2.5, pb: 2 }}>
          <Button
            onClick={() =>
              setTrackingModal({ open: false, item: null, type: "training" })
            }
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Review / Assign Replacement Dialog */}
      <Dialog
        open={repDialog.open}
        onClose={() => !repDialog.submitting && setRepDialog((prev) => ({ ...prev, open: false }))}
        fullWidth
        maxWidth="xs"
        slotProps={{ paper: { sx: { borderRadius: 3, p: 1 } } }}
      >
        <DialogTitle sx={{ fontWeight: 950, fontSize: 16 }}>
          Review / Assign Replacement
          {repDialog.item && (
            <Typography sx={{ fontSize: 11.5, color: "#64748B", mt: 0.3 }}>
              {repDialog.item.eventName || repDialog.item.trainingName} ({repDialog.type === "sports" ? "Sports Travel OFF" : "Training Travel OFF"})
            </Typography>
          )}
        </DialogTitle>
        <DialogContent dividers sx={{ py: 2 }}>
          {repDialog.error && (
            <Alert severity="error" sx={{ mb: 2, fontSize: 11.5 }}>
              {repDialog.error}
            </Alert>
          )}

          <Stack spacing={2}>
            {/* Step 1: Select dates needing replacement */}
            <Box>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.8 }}>
                <Typography sx={{ fontSize: 12, fontWeight: 850, color: "#1E293B" }}>
                  Select Travel Date(s) Requiring Replacement:
                </Typography>
                <Stack direction="row" spacing={0.8}>
                  <Button
                    size="small"
                    onClick={() =>
                      setRepDialog((prev) => ({
                        ...prev,
                        requiredDates: [...prev.dates],
                      }))
                    }
                    sx={{ fontSize: 10.5, p: 0, minWidth: 0, textTransform: "none", fontWeight: 800 }}
                  >
                    Select All
                  </Button>
                  <Typography sx={{ fontSize: 10.5, color: "#94A3B8" }}>|</Typography>
                  <Button
                    size="small"
                    onClick={() =>
                      setRepDialog((prev) => ({
                        ...prev,
                        requiredDates: [],
                      }))
                    }
                    sx={{ fontSize: 10.5, p: 0, minWidth: 0, textTransform: "none", fontWeight: 800 }}
                  >
                    Clear All
                  </Button>
                </Stack>
              </Stack>

              <Stack spacing={0.5} sx={{ border: "1px solid #E2E8F0", borderRadius: 2, p: 1, bgcolor: "#F8FAFC" }}>
                {repDialog.dates.map((dateStr) => {
                  const isChecked = repDialog.requiredDates.includes(dateStr);
                  const isBefore = dateStr === (repDialog.item?.startDate ? dayjs(repDialog.item.startDate).subtract(1, "day").format("YYYY-MM-DD") : null);
                  return (
                    <FormControlLabel
                      key={dateStr}
                      control={
                        <Checkbox
                          size="small"
                          checked={isChecked}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setRepDialog((prev) => ({
                              ...prev,
                              requiredDates: checked
                                ? [...prev.requiredDates, dateStr]
                                : prev.requiredDates.filter((d) => d !== dateStr),
                            }));
                          }}
                        />
                      }
                      label={
                        <Typography sx={{ fontSize: 12, fontWeight: isChecked ? 850 : 500, color: isChecked ? "#0F172A" : "#64748B" }}>
                          {fmtDay(dateStr)} ({isBefore ? "Day Before" : "Day After"}) · {isChecked ? "Cover Required" : "No Cover Needed"}
                        </Typography>
                      }
                    />
                  );
                })}
              </Stack>
            </Box>

            {/* Step 2: Assign Replacement Person (if any date requires replacement) */}
            {repDialog.requiredDates.length > 0 && (
              <Box>
                <Typography sx={{ fontSize: 12, fontWeight: 850, color: "#1E293B", mb: 0.8 }}>
                  Assign Replacement Employee:
                </Typography>
                <FormControl fullWidth size="small">
                  <InputLabel>Replacement Person</InputLabel>
                  <Select
                    value={repDialog.replacementEmployeeId}
                    label="Replacement Person"
                    onChange={(e) =>
                      setRepDialog((prev) => ({
                        ...prev,
                        replacementEmployeeId: e.target.value,
                      }))
                    }
                  >
                    <MenuItem value="">
                      <em>None (Mark Requirement Only)</em>
                    </MenuItem>
                    {employeesList.map((emp) => (
                      <MenuItem key={emp.employeeId} value={emp.employeeId}>
                        {emp.name} ({emp.employeeId}) {emp.designation ? `· ${emp.designation}` : ""}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Typography sx={{ fontSize: 10.5, color: "#64748B", mt: 0.5 }}>
                  Leave empty if sequential auto-allocation or later manual assignment will be used.
                </Typography>
              </Box>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 2.5, pb: 2 }}>
          <Button
            disabled={repDialog.submitting}
            onClick={() => setRepDialog((prev) => ({ ...prev, open: false }))}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            color="primary"
            disabled={repDialog.submitting}
            onClick={saveReplacement}
            sx={{ fontWeight: 850 }}
          >
            {repDialog.submitting ? "Saving..." : "Save Replacement"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

