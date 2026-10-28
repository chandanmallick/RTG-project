import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Autocomplete,
  Badge,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  Grid,
  IconButton,
  InputLabel,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  ArrowLeftRight,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  FileSpreadsheet,
  Plus,
  RefreshCw,
  Shield,
  ShieldAlert,
  Sparkles,
  UserCheck,
  UserPlus,
  Users,
  LayoutGrid,
} from "lucide-react";
import api from "../../crewLegacy/api";
import LeaveBlockedPeriods from "./LeaveBlockedPeriods";

const blankForm = {
  title: "",
  reason: "",
  startDate: "",
  endDate: "",
  submissionDeadline: "",
  departmentIds: [],
};

const blankDeploy = {
  date: "",
  shift: "Morning",
  employeeId: "",
  employeeName: "",
  reason: "",
};

export default function SpecialEventRoster({ onOpenMatrix } = {}) {
  const [access, setAccess] = useState(null);
  const [events, setEvents] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blankForm);
  const [error, setError] = useState("");
  const [successNotice, setSuccessNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [decision, setDecision] = useState(null);

  // Staffing dialog states
  const [staffing, setStaffing] = useState(null);
  const [staffingEvent, setStaffingEvent] = useState(null);
  const [additionalDepartment, setAdditionalDepartment] = useState("");
  const [staffingBusy, setStaffingBusy] = useState(false);

  // Deployments state (Audit of extra manpower and switches for event)
  const [deployments, setDeployments] = useState([]);
  const [deploymentsLoading, setDeploymentsLoading] = useState(false);

  // Quick Manpower Deploy Dialog states
  const [deployOpen, setDeployOpen] = useState(false);
  const [deployTargetEvent, setDeployTargetEvent] = useState(null);
  const [deployForm, setDeployForm] = useState(blankDeploy);
  const [deployCandidates, setDeployCandidates] = useState([]);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [deploySubmitting, setDeploySubmitting] = useState(false);
  const [deployError, setDeployError] = useState("");

  const load = async () => {
    try {
      const [a, e] = await Promise.all([
        api.get("/special-events/access"),
        api.get("/special-events"),
      ]);
      setAccess(a.data);
      setEvents(Array.isArray(e.data) ? e.data : []);
    } catch (e) {
      setError(e.response?.data?.detail || "Could not load special events");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      if (decision) {
        await api.put(`/special-events/${decision.id}/blocking`, {
          blocked: !decision.leaveBlocked,
        });
        setSuccessNotice(
          decision.leaveBlocked
            ? "Leave applications reopened for this event."
            : "Leave applications successfully blocked for this event."
        );
      } else {
        const rawDeptIds = form.departmentIds;
        const deptIds = Array.isArray(rawDeptIds)
          ? rawDeptIds
          : typeof rawDeptIds === "string" && rawDeptIds.trim()
          ? rawDeptIds.split(",").map((s) => s.trim()).filter(Boolean)
          : [];
        await api.post("/special-events", { ...form, departmentIds: deptIds });
        setSuccessNotice("Special event announced successfully.");
      }
      setOpen(false);
      setDecision(null);
      setForm(blankForm);
      await load();
      window.dispatchEvent(new Event("crew-special-events-changed"));
    } catch (e) {
      setError(e.response?.data?.detail || "Could not save event");
    } finally {
      setBusy(false);
    }
  };

  const fetchDeployments = async (eventId) => {
    if (!eventId) return;
    setDeploymentsLoading(true);
    try {
      const { data } = await api.get(`/special-events/${eventId}/deployments`);
      setDeployments(Array.isArray(data) ? data : []);
    } catch {
      setDeployments([]);
    } finally {
      setDeploymentsLoading(false);
    }
  };

  const viewStaffing = async (event, dept = "") => {
    setStaffingBusy(true);
    setError("");
    setStaffingEvent(event);
    setAdditionalDepartment(dept);
    try {
      const { data } = await api.get(`/special-events/${event.id}/staffing`, {
        params: { additionalDepartment: dept },
      });
      setStaffing(data);
      await fetchDeployments(event.id);
    } catch (e) {
      try {
        const { data } = await api.get(
          `/leave/blocked-periods/${event.id}/staffing`,
          { params: { additionalDepartment: dept } }
        );
        setStaffing(data);
        await fetchDeployments(event.id);
      } catch (err) {
        setError(
          e.response?.data?.detail ||
            err.response?.data?.detail ||
            "Could not load event staffing view"
        );
      }
    } finally {
      setStaffingBusy(false);
    }
  };

  const downloadStaffingExcel = async () => {
    const target = staffing || staffingEvent;
    if (!target) return;
    try {
      let res;
      try {
        res = await api.get(`/special-events/${target.id}/staffing.xlsx`, {
          params: { additionalDepartment },
          responseType: "blob",
        });
      } catch {
        res = await api.get(`/leave/blocked-periods/${target.id}/staffing.xlsx`, {
          params: { additionalDepartment },
          responseType: "blob",
        });
      }
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `special_event_staffing_${target.startDate || target.id}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e.response?.data?.detail || "Could not export staffing spreadsheet");
    }
  };

  // Quick Manpower Deployment logic
  const loadCandidatesForDate = async (dateStr) => {
    if (!dateStr) return;
    setCandidatesLoading(true);
    try {
      const { data } = await api.get("/replacement/duty-switch/options", {
        params: { date: dateStr },
      });
      setDeployCandidates(Array.isArray(data) ? data : []);
    } catch {
      setDeployCandidates([]);
    } finally {
      setCandidatesLoading(false);
    }
  };

  const openDeployModal = (event, prefillDate = "", prefillEmp = null) => {
    const targetEvent = event || staffingEvent;
    if (!targetEvent) return;
    setDeployTargetEvent(targetEvent);
    const chosenDate =
      prefillDate ||
      (targetEvent.startDate && targetEvent.startDate <= targetEvent.endDate
        ? targetEvent.startDate
        : "");
    setDeployForm({
      date: chosenDate,
      shift: "Morning",
      employeeId: prefillEmp?.employeeId || "",
      employeeName: prefillEmp?.name || "",
      reason: `Special event coverage: ${targetEvent.title || "Special Event"}`,
    });
    setDeployError("");
    setDeployOpen(true);
    if (chosenDate) {
      loadCandidatesForDate(chosenDate);
    }
  };

  const handleDeployDateChange = (newDate) => {
    setDeployForm((prev) => ({ ...prev, date: newDate }));
    if (newDate) {
      loadCandidatesForDate(newDate);
    }
  };

  const handleDeploySubmit = async () => {
    if (!deployForm.date) {
      setDeployError("Please select a valid date within the event.");
      return;
    }
    if (!deployForm.employeeId) {
      setDeployError("Please select an employee to deploy.");
      return;
    }
    if (!deployForm.shift) {
      setDeployError("Please choose a duty shift (Morning / Evening / Night).");
      return;
    }

    setDeploySubmitting(true);
    setDeployError("");
    const eventId = deployTargetEvent?.id || staffingEvent?.id;

    try {
      let res;
      try {
        res = await api.post(`/special-events/${eventId}/deploy`, {
          employeeId: deployForm.employeeId,
          date: deployForm.date,
          assignedDuty: deployForm.shift,
          reason: deployForm.reason,
          mode: "double",
        });
      } catch (err) {
        // Fallback to replacement direct additional manpower API
        res = await api.put("/replacement/duty-switch/additional-manpower", {
          employeeId: deployForm.employeeId,
          date: deployForm.date,
          assignedDuty: deployForm.shift,
          reason: deployForm.reason,
          eventId: eventId,
          mode: "double",
        });
      }

      setSuccessNotice(
        res.data?.message ||
          `Successfully deployed ${deployForm.employeeName || deployForm.employeeId} to ${deployForm.shift} on ${deployForm.date}!`
      );
      setDeployOpen(false);

      // Refresh staffing matrix and deployment logs in place!
      if (staffingEvent) {
        await viewStaffing(staffingEvent, additionalDepartment);
      }
    } catch (err) {
      setDeployError(
        err.response?.data?.detail || "Failed to deploy additional manpower"
      );
    } finally {
      setDeploySubmitting(false);
    }
  };

  // Staffing summary metrics
  const staffingMetrics = useMemo(() => {
    if (!staffing) return null;
    let scheduled = 0;
    let leaves = 0;
    let replacements = 0;
    for (const shift of ["Morning", "Evening", "Night"]) {
      for (const d of staffing.dates || []) {
        scheduled += (staffing.shifts?.[shift]?.[d] || []).length;
        leaves += (staffing.leaveShifts?.[shift]?.[d] || []).length;
        replacements += (staffing.replacementShifts?.[shift]?.[d] || []).length;
      }
    }
    return {
      scheduled,
      leaves,
      replacements,
      days: (staffing.dates || []).length,
      deployedCount: deployments.length,
    };
  }, [staffing, deployments]);

  return (
    <Box sx={{ width: "100%" }}>
      {/* Top Card: Plan & Control Hub */}
      <Paper
        sx={{
          p: { xs: 2, md: 2.75 },
          mb: 3,
          borderRadius: "20px !important",
          background: "linear-gradient(135deg, #FFFFFF 0%, #FAF8FF 100%) !important",
          boxShadow: "0 10px 30px rgba(109, 40, 217, 0.08)",
          border: "1px solid #E9D5FF",
        }}
      >
        <Stack
          direction={{ xs: "column", sm: "row" }}
          justifyContent="space-between"
          alignItems={{ sm: "center" }}
          spacing={2}
        >
          <Box>
            <Stack direction="row" alignItems="center" spacing={1.2}>
              <Box
                sx={{
                  p: 1,
                  borderRadius: 2,
                  bgcolor: "#EDE9FE",
                  color: "#6D28D9",
                  display: "flex",
                }}
              >
                <Sparkles size={22} />
              </Box>
              <Box>
                <Typography fontWeight={900} fontSize={20} color="#1E1B4B">
                  Special Event Coverage & Surge Rostering
                </Typography>
                <Typography variant="body2" color="#64748B" sx={{ mt: 0.2 }}>
                  Coordinate peak coverage, lock leave periods, deploy additional
                  manpower, and manage duty exchanges in real-time.
                </Typography>
              </Box>
            </Stack>
          </Box>

          <Stack direction="row" spacing={1.2} flexWrap="wrap">
            <Button
              variant="outlined"
              startIcon={<RefreshCw size={15} />}
              onClick={load}
              sx={{
                borderRadius: "12px",
                borderColor: "#C4B5FD",
                color: "#6D28D9",
                textTransform: "none",
                fontWeight: 800,
                "&:hover": { borderColor: "#8B5CF6", bgcolor: "#F5F3FF" },
              }}
            >
              Refresh
            </Button>
            {access?.canManage && (
              <Button
                variant="contained"
                startIcon={<Plus size={16} />}
                sx={{
                  borderRadius: "12px !important",
                  bgcolor: "#6D28D9 !important",
                  textTransform: "none",
                  fontWeight: 850,
                  boxShadow: "0 4px 14px rgba(109, 40, 217, 0.35)",
                  "&:hover": { bgcolor: "#5B21B6 !important" },
                }}
                onClick={() => {
                  setForm({
                    ...blankForm,
                    departmentIds: access.allowAll
                      ? []
                      : access.departments.map((d) => d.id),
                  });
                  setOpen(true);
                }}
              >
                Announce Special Event
              </Button>
            )}
          </Stack>
        </Stack>

        {/* Global Notifications */}
        {error && (
          <Alert severity="error" sx={{ mt: 2 }} onClose={() => setError("")}>
            {error}
          </Alert>
        )}
        {successNotice && (
          <Alert
            severity="success"
            sx={{ mt: 2 }}
            onClose={() => setSuccessNotice("")}
          >
            {successNotice}
          </Alert>
        )}

        {/* Event Cards Grid */}
        <Grid container spacing={2.2} sx={{ mt: 1 }}>
          {events.length === 0 ? (
            <Grid item xs={12}>
              <Box
                sx={{
                  py: 6,
                  textAlign: "center",
                  bgcolor: "#F8FAFC",
                  borderRadius: 3,
                  border: "1.5px dashed #CBD5E1",
                }}
              >
                <Calendar
                  size={36}
                  style={{ color: "#94A3B8", margin: "0 auto 12px" }}
                />
                <Typography fontWeight={800} color="#475569">
                  No active or upcoming special events
                </Typography>
                <Typography variant="body2" color="#64748B" sx={{ mt: 0.5 }}>
                  Use &apos;Announce Special Event&apos; to schedule surge staffing
                  for maintenance, festivals, or grid operations.
                </Typography>
              </Box>
            </Grid>
          ) : (
            events.map((event) => {
              const today = new Date().toISOString().slice(0, 10);
              const isActive =
                event.startDate <= today && today <= event.endDate;
              const isUpcoming = event.startDate > today;

              return (
                <Grid item xs={12} md={6} lg={4} key={event.id}>
                  <Card
                    elevation={0}
                    sx={{
                      height: "100%",
                      display: "flex",
                      flexDirection: "column",
                      borderRadius: 3.5,
                      border: "1.5px solid",
                      borderColor: isActive
                        ? "#C4B5FD"
                        : event.leaveBlocked
                        ? "#FDE68A"
                        : "#E2E8F0",
                      background: isActive
                        ? "linear-gradient(180deg, #FAF5FF 0%, #FFFFFF 100%)"
                        : "#FFFFFF",
                      boxShadow: isActive
                        ? "0 10px 25px rgba(109, 40, 217, 0.08)"
                        : "0 4px 16px rgba(15, 23, 42, 0.04)",
                      transition: "transform 0.2s, box-shadow 0.2s",
                      "&:hover": {
                        transform: "translateY(-3px)",
                        boxShadow: "0 12px 28px rgba(109, 40, 217, 0.12)",
                      },
                    }}
                  >
                    <CardContent sx={{ p: 2.2, flexGrow: 1 }}>
                      {/* Status Badges */}
                      <Stack
                        direction="row"
                        justifyContent="space-between"
                        alignItems="flex-start"
                        spacing={1}
                        sx={{ mb: 1.5 }}
                      >
                        <Stack direction="row" spacing={0.8} flexWrap="wrap">
                          {isActive && (
                            <Chip
                              size="small"
                              label="Active Now"
                              sx={{
                                bgcolor: "#DCFCE7",
                                color: "#15803D",
                                fontWeight: 900,
                                fontSize: "0.75rem",
                              }}
                            />
                          )}
                          {isUpcoming && (
                            <Chip
                              size="small"
                              label="Upcoming"
                              sx={{
                                bgcolor: "#DBEAFE",
                                color: "#1D4ED8",
                                fontWeight: 800,
                                fontSize: "0.75rem",
                              }}
                            />
                          )}
                          <Chip
                            size="small"
                            icon={
                              event.leaveBlocked ? (
                                <ShieldAlert size={13} />
                              ) : (
                                <Shield size={13} />
                              )
                            }
                            label={
                              event.leaveBlocked ? "Leave Blocked" : "Leave Open"
                            }
                            sx={{
                              bgcolor: event.leaveBlocked ? "#FEF3C7" : "#F1F5F9",
                              color: event.leaveBlocked ? "#B45309" : "#475569",
                              fontWeight: 800,
                              fontSize: "0.75rem",
                            }}
                          />
                        </Stack>

                        <Tooltip title="One-click Excel Roster Export">
                          <IconButton
                            size="small"
                            onClick={async () => {
                              try {
                                const res = await api.get(
                                  `/special-events/${event.id}/staffing.xlsx`,
                                  { responseType: "blob" }
                                );
                                const url = URL.createObjectURL(res.data);
                                const a = document.createElement("a");
                                a.href = url;
                                a.download = `special_event_${event.title}_${event.startDate}.xlsx`;
                                a.click();
                                URL.revokeObjectURL(url);
                              } catch {
                                setError("Could not export staffing spreadsheet");
                              }
                            }}
                            sx={{ color: "#059669", bgcolor: "#ECFDF5" }}
                          >
                            <FileSpreadsheet size={16} />
                          </IconButton>
                        </Tooltip>
                      </Stack>

                      {/* Title & Dates */}
                      <Typography
                        fontWeight={900}
                        fontSize={17}
                        color="#0F172A"
                        sx={{ lineHeight: 1.3, mb: 0.8 }}
                      >
                        {event.title}
                      </Typography>

                      <Stack spacing={0.6} sx={{ mb: 1.8 }}>
                        <Stack direction="row" alignItems="center" spacing={0.8}>
                          <Clock size={14} color="#64748B" />
                          <Typography
                            fontSize={12.5}
                            fontWeight={750}
                            color="#334155"
                          >
                            {event.startDate} to {event.endDate}
                          </Typography>
                        </Stack>
                        <Stack direction="row" alignItems="center" spacing={0.8}>
                          <Users size={14} color="#64748B" />
                          <Typography fontSize={12} color="#64748B">
                            {event.departmentNames?.join(", ") ||
                              "All departments"}
                          </Typography>
                        </Stack>
                        {event.submissionDeadline && (
                          <Typography
                            fontSize={11.5}
                            color="#94A3B8"
                            sx={{ fontStyle: "italic" }}
                          >
                            Submission deadline: {event.submissionDeadline}
                          </Typography>
                        )}
                        {event.reason && (
                          <Typography
                            fontSize={12}
                            color="#475569"
                            sx={{
                              mt: 0.5,
                              p: 1,
                              bgcolor: "#F8FAFC",
                              borderRadius: 1.5,
                            }}
                          >
                            {event.reason}
                          </Typography>
                        )}
                      </Stack>

                      <Divider sx={{ my: 1.5 }} />

                      {/* Action Buttons Hub */}
                      <Stack spacing={1}>
                        <Button
                          variant="contained"
                          fullWidth
                          size="small"
                          startIcon={<LayoutGrid size={15} />}
                          onClick={() => {
                            if (onOpenMatrix) onOpenMatrix(event.id);
                            else window.location.assign(`/crew/special-events?view=matrix&eventId=${event.id}`);
                          }}
                          sx={{
                            bgcolor: "#6D28D9",
                            color: "#FFF",
                            fontWeight: 900,
                            borderRadius: 2,
                            textTransform: "none",
                            py: 0.85,
                            boxShadow: "0 4px 12px rgba(109, 40, 217, 0.25)",
                            "&:hover": { bgcolor: "#5B21B6" },
                          }}
                        >
                          ⚡ Duty Matrix & Drag-Drop
                        </Button>

                        <Button
                          variant="outlined"
                          fullWidth
                          size="small"
                          startIcon={<Users size={15} />}
                          onClick={() => viewStaffing(event, "")}
                          sx={{
                            borderColor: "#C4B5FD",
                            color: "#6D28D9",
                            fontWeight: 800,
                            borderRadius: 2,
                            textTransform: "none",
                            py: 0.7,
                            "&:hover": { bgcolor: "#FAF5FF" },
                          }}
                        >
                          Staffing & Coverage Tower
                        </Button>

                        <Stack direction="row" spacing={1}>
                          <Button
                            variant="outlined"
                            fullWidth
                            size="small"
                            startIcon={<UserPlus size={14} />}
                            onClick={() => openDeployModal(event)}
                            sx={{
                              borderColor: "#C4B5FD",
                              color: "#6D28D9",
                              fontWeight: 800,
                              borderRadius: 2,
                              textTransform: "none",
                              fontSize: "0.78rem",
                              "&:hover": {
                                bgcolor: "#FAF5FF",
                                borderColor: "#8B5CF6",
                              },
                            }}
                          >
                            Deploy Manpower
                          </Button>

                          <Button
                            variant="outlined"
                            fullWidth
                            size="small"
                            startIcon={<ArrowLeftRight size={14} />}
                            onClick={() =>
                              window.location.assign(
                                `/crew/replacement?tab=duty&date=${event.startDate}`
                              )
                            }
                            sx={{
                              borderColor: "#93C5FD",
                              color: "#1D4ED8",
                              fontWeight: 800,
                              borderRadius: 2,
                              textTransform: "none",
                              fontSize: "0.78rem",
                              "&:hover": {
                                bgcolor: "#EFF6FF",
                                borderColor: "#3B82F6",
                              },
                            }}
                          >
                            Duty Exchange
                          </Button>
                        </Stack>

                        {event.canManage && (
                          <Button
                            size="small"
                            variant="text"
                            onClick={() => setDecision(event)}
                            sx={{
                              color: event.leaveBlocked ? "#D97706" : "#64748B",
                              fontWeight: 800,
                              textTransform: "none",
                              fontSize: "0.75rem",
                              mt: 0.2,
                            }}
                          >
                            {event.leaveBlocked
                              ? "Reopen leave applications"
                              : "Block leave applications for event"}
                          </Button>
                        )}
                      </Stack>
                    </CardContent>
                  </Card>
                </Grid>
              );
            })
          )}
        </Grid>
      </Paper>

      {/* CREATE / ANNOUNCE / BLOCK EVENT DIALOG */}
      <Dialog
        open={open || Boolean(decision)}
        onClose={() => !busy && (setOpen(false), setDecision(null))}
        fullWidth
        maxWidth="sm"
        slotProps={{
          paper: {
            sx: {
              borderRadius: "24px !important",
              p: 1,
              background: "#FAF9FF !important",
            },
          },
        }}
      >
        <DialogTitle sx={{ fontWeight: 900 }}>
          {decision
            ? decision.leaveBlocked
              ? "Reopen leave applications?"
              : "Block leave applications for this event?"
            : "Announce Special Event"}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            {decision ? (
              <Alert severity="warning">
                {decision.title}: {decision.startDate} to {decision.endDate}.{" "}
                {decision.departmentNames?.join(", ") || "All departments"}.
                Existing applications are unchanged.
              </Alert>
            ) : (
              <>
                <Alert severity="info">
                  Announcing informs crew members and sets up the event coverage
                  window. You can optionally toggle Leave Blocking below.
                </Alert>
                <TextField
                  label="Event Name / Purpose"
                  placeholder="e.g. Annual Overhaul, Festival Surge, Grid Drill"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
                <Stack direction="row" spacing={1.5}>
                  {["startDate", "endDate"].map((key) => (
                    <TextField
                      key={key}
                      fullWidth
                      type="date"
                      label={
                        key === "startDate" ? "Event Starts" : "Event Ends"
                      }
                      InputLabelProps={{ shrink: true }}
                      value={form[key]}
                      onChange={(e) =>
                        setForm({ ...form, [key]: e.target.value })
                      }
                    />
                  ))}
                </Stack>
                <TextField
                  type="date"
                  label="Last date for leave submission (optional)"
                  InputLabelProps={{ shrink: true }}
                  value={form.submissionDeadline}
                  onChange={(e) =>
                    setForm({ ...form, submissionDeadline: e.target.value })
                  }
                />
                <FormControl fullWidth size="small">
                  <InputLabel id="special-event-depts-label" shrink>
                    Applicable Departments
                  </InputLabel>
                  <Select
                    labelId="special-event-depts-label"
                    multiple
                    displayEmpty
                    label="Applicable Departments"
                    value={
                      Array.isArray(form.departmentIds)
                        ? form.departmentIds
                        : []
                    }
                    onChange={(e) => {
                      const val = e.target.value;
                      const arr =
                        typeof val === "string"
                          ? val
                            ? val.split(",")
                            : []
                          : Array.isArray(val)
                          ? val
                          : [val].filter(Boolean);
                      setForm((prev) => ({ ...prev, departmentIds: arr }));
                    }}
                    renderValue={(selected) => {
                      const arr = Array.isArray(selected) ? selected : [];
                      if (!arr.length) return "All departments";
                      return (
                        access?.departments
                          ?.filter((d) => arr.includes(d.id))
                          .map((d) => d.name)
                          .join(", ") || "All departments"
                      );
                    }}
                  >
                    {access?.departments?.map((d) => {
                      const isSelected = (
                        Array.isArray(form.departmentIds)
                          ? form.departmentIds
                          : []
                      ).includes(d.id);
                      return (
                        <MenuItem key={d.id} value={d.id}>
                          <Checkbox
                            checked={isSelected}
                            size="small"
                            sx={{ mr: 1, p: 0 }}
                          />
                          <ListItemText primary={d.name} />
                        </MenuItem>
                      );
                    })}
                  </Select>
                </FormControl>
                {access?.allowAll && (
                  <Button
                    size="small"
                    onClick={() => setForm({ ...form, departmentIds: [] })}
                  >
                    Select all departments
                  </Button>
                )}
                <TextField
                  label="Operational Brief / Announcement note"
                  multiline
                  minRows={2}
                  value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                />
              </>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button
            disabled={busy}
            onClick={() => {
              setOpen(false);
              setDecision(null);
            }}
          >
            Cancel
          </Button>
          <Button
            disabled={
              busy ||
              (!decision &&
                (!form.title.trim() ||
                  !form.startDate ||
                  !form.endDate ||
                  form.endDate < form.startDate ||
                  (!access?.allowAll &&
                    !(
                      Array.isArray(form.departmentIds) &&
                      form.departmentIds.length
                    ))))
            }
            variant="contained"
            sx={{
              bgcolor: "#6D28D9 !important",
              textTransform: "none",
              fontWeight: 850,
            }}
            onClick={save}
          >
            {busy ? "Saving..." : decision ? "Confirm" : "Announce Event"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* STAFFING & COVERAGE CONTROL TOWER DIALOG */}
      <Dialog
        open={Boolean(staffing)}
        onClose={() => !staffingBusy && setStaffing(null)}
        fullWidth
        maxWidth="xl"
        slotProps={{
          paper: {
            sx: {
              borderRadius: "20px !important",
              background: "#FAF9FF !important",
            },
          },
        }}
      >
        <DialogTitle
          sx={{
            fontWeight: 900,
            bgcolor: "#FFFFFF",
            borderBottom: "1px solid #E2E8F0",
            py: 2,
          }}
        >
          <Stack
            direction={{ xs: "column", md: "row" }}
            justifyContent="space-between"
            alignItems={{ md: "center" }}
            spacing={1.5}
          >
            <Box>
              <Typography fontWeight={900} fontSize={19} color="#1E1B4B">
                Coverage Tower: {staffingEvent?.title || "Special Event"}
              </Typography>
              <Typography variant="body2" color="#64748B">
                {staffing?.startDate} to {staffing?.endDate} ·{" "}
                {staffingEvent?.departmentNames?.join(", ") || "All departments"}
              </Typography>
            </Box>

            {/* Metrics Chips */}
            {staffingMetrics && (
              <Stack direction="row" spacing={1} flexWrap="wrap">
                <Chip
                  size="small"
                  icon={<Calendar size={13} />}
                  label={`${staffingMetrics.days} Days`}
                  sx={{ bgcolor: "#F1F5F9", fontWeight: 800 }}
                />
                <Chip
                  size="small"
                  icon={<Users size={13} />}
                  label={`${staffingMetrics.scheduled} Scheduled`}
                  sx={{
                    bgcolor: "#DBEAFE",
                    color: "#1E40AF",
                    fontWeight: 800,
                  }}
                />
                <Chip
                  size="small"
                  icon={<ShieldAlert size={13} />}
                  label={`${staffingMetrics.leaves} on Leave`}
                  sx={{
                    bgcolor: "#FEE2E2",
                    color: "#991B1B",
                    fontWeight: 800,
                  }}
                />
                <Chip
                  size="small"
                  icon={<CheckCircle2 size={13} />}
                  label={`${staffingMetrics.replacements} Covers`}
                  sx={{
                    bgcolor: "#DCFCE7",
                    color: "#166534",
                    fontWeight: 800,
                  }}
                />
                <Chip
                  size="small"
                  icon={<UserPlus size={13} />}
                  label={`${staffingMetrics.deployedCount} Extra Deployed`}
                  sx={{
                    bgcolor: "#F3E8FF",
                    color: "#6B21A8",
                    fontWeight: 900,
                  }}
                />
              </Stack>
            )}
          </Stack>
        </DialogTitle>

        <DialogContent dividers sx={{ p: { xs: 1.5, md: 2.5 } }}>
          {staffing && (
            <Stack spacing={2.5}>
              {staffing.reason && (
                <Alert severity="warning">{staffing.reason}</Alert>
              )}

              {/* Action Ribbon */}
              <Paper
                elevation={0}
                sx={{
                  p: 1.5,
                  borderRadius: 2.5,
                  bgcolor: "#FFFFFF",
                  border: "1px solid #E2E8F0",
                }}
              >
                <Stack
                  direction={{ xs: "column", md: "row" }}
                  spacing={1.2}
                  alignItems={{ md: "center" }}
                  justifyContent="space-between"
                  flexWrap="wrap"
                >
                  <Stack
                    direction="row"
                    spacing={1}
                    alignItems="center"
                    flexWrap="wrap"
                  >
                    <TextField
                      select
                      size="small"
                      label="Inspect additional department strength"
                      value={additionalDepartment}
                      onChange={(e) =>
                        viewStaffing(
                          staffingEvent || { id: staffing.id },
                          e.target.value
                        )
                      }
                      sx={{ minWidth: 260 }}
                    >
                      <MenuItem value="">Do not show additional dept</MenuItem>
                      {(staffing.departments || []).map((dept) => (
                        <MenuItem key={dept} value={dept}>
                          {dept}
                        </MenuItem>
                      ))}
                    </TextField>

                    <Button
                      variant="contained"
                      startIcon={<UserPlus size={15} />}
                      onClick={() => openDeployModal(staffingEvent)}
                      sx={{
                        bgcolor: "#6D28D9",
                        fontWeight: 850,
                        textTransform: "none",
                        borderRadius: 2,
                        "&:hover": { bgcolor: "#5B21B6" },
                      }}
                    >
                      Deploy Extra Manpower
                    </Button>

                    <Button
                      variant="outlined"
                      startIcon={<ArrowLeftRight size={15} />}
                      onClick={() =>
                        window.location.assign(
                          `/crew/replacement?tab=duty&date=${staffing.startDate}`
                        )
                      }
                      sx={{
                        borderColor: "#93C5FD",
                        color: "#1D4ED8",
                        fontWeight: 800,
                        textTransform: "none",
                        borderRadius: 2,
                      }}
                    >
                      Duty Assignment & Exchange
                    </Button>

                    <Button
                      variant="contained"
                      startIcon={<LayoutGrid size={15} />}
                      onClick={() => {
                        const targetId = staffingEvent?.id || staffing?.id;
                        if (onOpenMatrix) {
                          setStaffing(null);
                          onOpenMatrix(targetId);
                        } else {
                          window.location.assign(`/crew/special-events?view=matrix&eventId=${targetId}`);
                        }
                      }}
                      sx={{
                        bgcolor: "#7C3AED",
                        color: "#FFF",
                        fontWeight: 850,
                        textTransform: "none",
                        borderRadius: 2,
                        "&:hover": { bgcolor: "#6D28D9" },
                      }}
                    >
                      Drag & Drop Matrix View
                    </Button>
                  </Stack>

                  <Button
                    variant="outlined"
                    startIcon={<Download size={15} />}
                    onClick={downloadStaffingExcel}
                    sx={{
                      borderColor: "#10B981",
                      color: "#047857",
                      fontWeight: 800,
                      textTransform: "none",
                      borderRadius: 2,
                    }}
                  >
                    Export Matrix (Excel)
                  </Button>
                </Stack>
              </Paper>

              {/* TABLE 1: MAIN DUTY STRENGTH */}
              <Box
                sx={{
                  overflow: "auto",
                  border: "1px solid #CBD5E1",
                  borderRadius: 2,
                  bgcolor: "#FFFFFF",
                }}
              >
                <Box
                  sx={{
                    px: 1.5,
                    py: 1,
                    bgcolor: "#DDEBF7",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Typography fontSize={13} fontWeight={950} color="#0F3A66">
                    1. Main duty strength · Scheduled rostered personnel (Leaves
                    excluded)
                  </Typography>
                  <Typography fontSize={11} color="#64748B">
                    Tip: Click &quot;+ Extra&quot; in any date header to deploy surge
                    staffing directly to that day.
                  </Typography>
                </Box>
                <Table
                  size="small"
                  sx={{ minWidth: Math.max(760, staffing.dates.length * 155) }}
                >
                  <TableHead>
                    <TableRow>
                      <TableCell
                        sx={{
                          fontWeight: 900,
                          position: "sticky",
                          left: 0,
                          zIndex: 2,
                          bgcolor: "#FFF",
                          minWidth: 100,
                        }}
                      >
                        Shift / Date
                      </TableCell>
                      {staffing.dates.map((d) => (
                        <TableCell
                          key={d}
                          align="center"
                          sx={{ bgcolor: "#FEF08A", fontWeight: 900, p: 0.8 }}
                        >
                          <Typography fontSize={12} fontWeight={900}>
                            {d}
                          </Typography>
                          <Typography
                            fontSize={11}
                            fontWeight={850}
                            color="#C2410C"
                          >
                            {staffing.dayNames[d]}
                          </Typography>
                          <Button
                            size="small"
                            variant="outlined"
                            startIcon={<Plus size={11} />}
                            onClick={() => openDeployModal(staffingEvent, d)}
                            sx={{
                              fontSize: "0.68rem",
                              py: 0.1,
                              px: 0.8,
                              mt: 0.4,
                              minHeight: 0,
                              borderRadius: 1.2,
                              borderColor: "#CA8A04",
                              color: "#854D0E",
                              textTransform: "none",
                              fontWeight: 800,
                              bgcolor: "#FEF9C3",
                              "&:hover": { bgcolor: "#FEF08A" },
                            }}
                          >
                            + Extra
                          </Button>
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {["Morning", "Evening", "Night"].map((shift) => (
                      <TableRow key={shift}>
                        <TableCell
                          sx={{
                            fontWeight: 900,
                            position: "sticky",
                            left: 0,
                            bgcolor: "#FFF",
                            zIndex: 1,
                          }}
                        >
                          {shift}
                        </TableCell>
                        {staffing.dates.map((d) => {
                          const list = staffing.shifts?.[shift]?.[d] || [];
                          return (
                            <TableCell
                              key={d}
                              sx={{
                                verticalAlign: "top",
                                borderLeft: "1px dashed #E2E8F0",
                              }}
                            >
                              {list.length ? (
                                <Stack spacing={0.6}>
                                  {list.map((p) => (
                                    <Box
                                      key={p.employeeId}
                                      sx={{
                                        p: 0.4,
                                        borderRadius: 1,
                                        bgcolor: p.replacement
                                          ? "#DCFCE7"
                                          : "transparent",
                                      }}
                                    >
                                      <Typography
                                        sx={{
                                          fontSize: 11,
                                          fontWeight: 700,
                                          color: "#0F172A",
                                        }}
                                      >
                                        {p.name}
                                      </Typography>
                                      {p.replacement && (
                                        <Chip
                                          label="Replacement"
                                          size="small"
                                          sx={{
                                            height: 16,
                                            fontSize: "0.65rem",
                                            fontWeight: 800,
                                            bgcolor: "#BBF7D0",
                                            color: "#166534",
                                          }}
                                        />
                                      )}
                                    </Box>
                                  ))}
                                </Stack>
                              ) : (
                                <Typography
                                  sx={{
                                    textAlign: "center",
                                    color: "#94A3B8",
                                    fontSize: 11,
                                  }}
                                >
                                  NR
                                </Typography>
                              )}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>

              {/* TABLE 2: AVAILABLE ADDITIONAL MANPOWER (WHEN DEPT IS SELECTED) */}
              {additionalDepartment && staffing.additionalStrength && (
                <Box
                  sx={{
                    overflow: "auto",
                    border: "1.5px solid #C4B5FD",
                    borderRadius: 2,
                    bgcolor: "#FFFFFF",
                  }}
                >
                  <Typography
                    sx={{
                      px: 1.5,
                      py: 1,
                      bgcolor: "#F3E8FF",
                      fontSize: 13,
                      fontWeight: 950,
                      color: "#581C87",
                    }}
                  >
                    2. Available manpower from {additionalDepartment} · One-click
                    deployment available
                  </Typography>
                  <Table
                    size="small"
                    sx={{ minWidth: Math.max(760, staffing.dates.length * 155) }}
                  >
                    <TableBody>
                      <TableRow>
                        <TableCell
                          sx={{
                            minWidth: 100,
                            fontWeight: 900,
                            position: "sticky",
                            left: 0,
                            bgcolor: "#FFF",
                            zIndex: 1,
                          }}
                        >
                          Available Personnel
                        </TableCell>
                        {staffing.dates.map((d) => {
                          const list = staffing.additionalStrength[d] || [];
                          return (
                            <TableCell
                              key={d}
                              sx={{
                                minWidth: 145,
                                verticalAlign: "top",
                                borderLeft: "1px dashed #DDD6FE",
                              }}
                            >
                              {list.length ? (
                                <Stack spacing={0.7}>
                                  {list.map((person) => (
                                    <Paper
                                      key={person.employeeId}
                                      variant="outlined"
                                      sx={{
                                        p: 0.6,
                                        borderRadius: 1.5,
                                        borderColor: "#E9D5FF",
                                        bgcolor: "#FAF5FF",
                                      }}
                                    >
                                      <Typography
                                        sx={{
                                          fontSize: 11,
                                          fontWeight: 750,
                                          color: "#1E1B4B",
                                        }}
                                      >
                                        {person.name}
                                      </Typography>
                                      <Typography
                                        sx={{
                                          fontSize: 9.5,
                                          color: "#6D28D9",
                                        }}
                                      >
                                        {person.assignedDuty ||
                                          person.duty ||
                                          "Available"}
                                      </Typography>
                                      <Button
                                        size="small"
                                        variant="contained"
                                        onClick={() =>
                                          openDeployModal(
                                            staffingEvent,
                                            d,
                                            person
                                          )
                                        }
                                        sx={{
                                          fontSize: "0.65rem",
                                          py: 0.1,
                                          px: 0.8,
                                          mt: 0.4,
                                          minHeight: 0,
                                          borderRadius: 1,
                                          bgcolor: "#7C3AED",
                                          color: "#FFF",
                                          textTransform: "none",
                                          fontWeight: 800,
                                          "&:hover": { bgcolor: "#6D28D9" },
                                        }}
                                      >
                                        Deploy
                                      </Button>
                                    </Paper>
                                  ))}
                                </Stack>
                              ) : (
                                <Typography
                                  sx={{
                                    color: "#94A3B8",
                                    fontSize: 11,
                                    textAlign: "center",
                                  }}
                                >
                                  —
                                </Typography>
                              )}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    </TableBody>
                  </Table>
                </Box>
              )}

              {/* TABLE 3: EMPLOYEES ON LEAVE */}
              <Box
                sx={{
                  overflow: "auto",
                  border: "1px solid #CBD5E1",
                  borderRadius: 2,
                  bgcolor: "#FFFFFF",
                }}
              >
                <Typography
                  sx={{
                    px: 1.5,
                    py: 1,
                    bgcolor: "#FCE4D6",
                    fontSize: 13,
                    fontWeight: 950,
                    color: "#7C2D12",
                  }}
                >
                  3. Employees on leave · Shift-wise (Click to assign cover in
                  Replacement Module)
                </Typography>
                <Table
                  size="small"
                  sx={{ minWidth: Math.max(760, staffing.dates.length * 155) }}
                >
                  <TableBody>
                    {["Morning", "Evening", "Night"].map((shift) => (
                      <TableRow key={shift}>
                        <TableCell
                          sx={{
                            fontWeight: 900,
                            minWidth: 100,
                            position: "sticky",
                            left: 0,
                            bgcolor: "#FFF",
                            zIndex: 1,
                          }}
                        >
                          {shift}
                        </TableCell>
                        {staffing.dates.map((d) => {
                          const list = staffing.leaveShifts?.[shift]?.[d] || [];
                          return (
                            <TableCell
                              key={d}
                              sx={{
                                verticalAlign: "top",
                                borderLeft: "1px dashed #FED7AA",
                              }}
                            >
                              {list.length ? (
                                <Stack spacing={0.6}>
                                  {list.map((p) => (
                                    <Box key={p.employeeId}>
                                      <Typography
                                        sx={{
                                          fontSize: 11,
                                          fontWeight: 700,
                                          color: "#991B1B",
                                        }}
                                      >
                                        {p.name}
                                      </Typography>
                                      <Button
                                        size="small"
                                        onClick={() =>
                                          window.location.assign(
                                            `/crew/replacement?action=leave&date=${d}&employeeId=${encodeURIComponent(
                                              p.employeeId
                                            )}`
                                          )
                                        }
                                        sx={{
                                          fontSize: "0.65rem",
                                          py: 0,
                                          px: 0.6,
                                          minHeight: 0,
                                          color: "#0284C7",
                                          textTransform: "none",
                                          fontWeight: 800,
                                        }}
                                      >
                                        Assign Cover →
                                      </Button>
                                    </Box>
                                  ))}
                                </Stack>
                              ) : (
                                <Typography
                                  sx={{
                                    textAlign: "center",
                                    color: "#CBD5E1",
                                    fontSize: 11,
                                  }}
                                >
                                  —
                                </Typography>
                              )}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>

              {/* TABLE 4: REPLACEMENT EMPLOYEES */}
              <Box
                sx={{
                  overflow: "auto",
                  border: "1px solid #CBD5E1",
                  borderRadius: 2,
                  bgcolor: "#FFFFFF",
                }}
              >
                <Typography
                  sx={{
                    px: 1.5,
                    py: 1,
                    bgcolor: "#E2F0D9",
                    fontSize: 13,
                    fontWeight: 950,
                    color: "#14532D",
                  }}
                >
                  4. Replacement employees · Shift-wise coverage assigned
                </Typography>
                <Table
                  size="small"
                  sx={{ minWidth: Math.max(760, staffing.dates.length * 155) }}
                >
                  <TableBody>
                    {["Morning", "Evening", "Night"].map((shift) => (
                      <TableRow key={shift}>
                        <TableCell
                          sx={{
                            fontWeight: 900,
                            minWidth: 100,
                            position: "sticky",
                            left: 0,
                            bgcolor: "#FFF",
                            zIndex: 1,
                          }}
                        >
                          {shift}
                        </TableCell>
                        {staffing.dates.map((d) => {
                          const list =
                            staffing.replacementShifts?.[shift]?.[d] || [];
                          return (
                            <TableCell
                              key={d}
                              sx={{
                                verticalAlign: "top",
                                borderLeft: "1px dashed #BBF7D0",
                              }}
                            >
                              {list.length ? (
                                <Stack spacing={0.4}>
                                  {list.map((p) => (
                                    <Typography
                                      key={p.employeeId}
                                      sx={{
                                        fontSize: 11,
                                        fontWeight: 700,
                                        color: "#166534",
                                      }}
                                    >
                                      ✓ {p.name}
                                    </Typography>
                                  ))}
                                </Stack>
                              ) : (
                                <Typography
                                  sx={{
                                    textAlign: "center",
                                    color: "#CBD5E1",
                                    fontSize: 11,
                                  }}
                                >
                                  —
                                </Typography>
                              )}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>

              {/* TABLE 5: LIVE EVENT MANPOWER DEPLOYMENTS & SWAPS LEDGER */}
              <Box
                sx={{
                  border: "1.5px solid #E2E8F0",
                  borderRadius: 2.5,
                  bgcolor: "#FFFFFF",
                  overflow: "hidden",
                }}
              >
                <Box
                  sx={{
                    px: 2,
                    py: 1.2,
                    bgcolor: "#F8FAFC",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    borderBottom: "1px solid #E2E8F0",
                  }}
                >
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <UserCheck size={18} color="#6D28D9" />
                    <Typography fontSize={13.5} fontWeight={950} color="#1E293B">
                      5. Active Event Surge Deployments & Duty Switches (
                      {deployments.length})
                    </Typography>
                  </Stack>
                  <Button
                    size="small"
                    startIcon={<RefreshCw size={13} />}
                    onClick={() =>
                      staffingEvent && fetchDeployments(staffingEvent.id)
                    }
                    sx={{ textTransform: "none", fontWeight: 800 }}
                  >
                    Refresh Ledger
                  </Button>
                </Box>

                {deploymentsLoading ? (
                  <Box sx={{ p: 3, textAlign: "center", color: "#64748B" }}>
                    Loading deployments ledger...
                  </Box>
                ) : deployments.length === 0 ? (
                  <Box sx={{ p: 3, textAlign: "center", color: "#64748B" }}>
                    No additional manpower deployed specifically for this event
                    yet. Click &quot;Deploy Extra Manpower&quot; above to allocate surge
                    staff.
                  </Box>
                ) : (
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ bgcolor: "#F1F5F9" }}>
                        <TableCell sx={{ fontWeight: 900 }}>Date</TableCell>
                        <TableCell sx={{ fontWeight: 900 }}>
                          Employee Name & ID
                        </TableCell>
                        <TableCell sx={{ fontWeight: 900 }}>
                          Designation
                        </TableCell>
                        <TableCell sx={{ fontWeight: 900 }}>
                          Assigned Shift
                        </TableCell>
                        <TableCell sx={{ fontWeight: 900 }}>Reason</TableCell>
                        <TableCell sx={{ fontWeight: 900 }}>
                          Deployed By
                        </TableCell>
                        <TableCell sx={{ fontWeight: 900 }}>Status</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {deployments.map((d) => (
                        <TableRow key={d.id} hover>
                          <TableCell sx={{ fontWeight: 850 }}>
                            {d.date}
                          </TableCell>
                          <TableCell>
                            <Typography fontSize={12} fontWeight={800}>
                              {d.employeeName || d.employeeId}
                            </Typography>
                            <Typography fontSize={10} color="#64748B">
                              ID: {d.employeeId}
                            </Typography>
                          </TableCell>
                          <TableCell fontSize={11}>
                            {d.designation || "Staff"}
                          </TableCell>
                          <TableCell>
                            <Chip
                              size="small"
                              label={d.assignedDuty || "Duty"}
                              sx={{
                                bgcolor: "#EDE9FE",
                                color: "#6D28D9",
                                fontWeight: 800,
                              }}
                            />
                          </TableCell>
                          <TableCell fontSize={11}>{d.reason}</TableCell>
                          <TableCell fontSize={11} color="#64748B">
                            {d.changedBy || "DIC"}
                          </TableCell>
                          <TableCell>
                            {d.compOffAwarded ? (
                              <Chip
                                size="small"
                                label="C-OFF Awarded"
                                sx={{
                                  bgcolor: "#FEF3C7",
                                  color: "#B45309",
                                  fontWeight: 800,
                                }}
                              />
                            ) : (
                              <Chip
                                size="small"
                                label="Active Surge"
                                sx={{
                                  bgcolor: "#DCFCE7",
                                  color: "#15803D",
                                  fontWeight: 800,
                                }}
                              />
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </Box>
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2, bgcolor: "#FFFFFF" }}>
          <Button
            variant="outlined"
            onClick={() => setStaffing(null)}
            sx={{ textTransform: "none", fontWeight: 800 }}
          >
            Close Tower
          </Button>
        </DialogActions>
      </Dialog>

      {/* QUICK DEPLOY ADDITIONAL MANPOWER DIALOG */}
      <Dialog
        open={deployOpen}
        onClose={() => !deploySubmitting && setDeployOpen(false)}
        fullWidth
        maxWidth="sm"
        slotProps={{
          paper: {
            sx: {
              borderRadius: "20px !important",
              p: 1,
              background: "#FAF9FF !important",
            },
          },
        }}
      >
        <DialogTitle sx={{ fontWeight: 900 }}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <UserPlus size={20} color="#6D28D9" />
            <Typography fontWeight={900} fontSize={18} color="#1E1B4B">
              Deploy Additional Manpower
            </Typography>
          </Stack>
          <Typography variant="body2" color="#64748B">
            Target Event: {deployTargetEvent?.title || staffingEvent?.title}
          </Typography>
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {deployError && <Alert severity="error">{deployError}</Alert>}

            <Alert severity="info" sx={{ fontSize: "0.85rem" }}>
              Deploying additional manpower assigns the employee directly to this
              special event shift without requiring an active leave request. If
              the employee is currently scheduled on an OFF day, compensatory off
              (C-OFF) is automatically credited.
            </Alert>

            {/* Date Selection */}
            <TextField
              type="date"
              label="Deployment Date"
              fullWidth
              InputLabelProps={{ shrink: true }}
              value={deployForm.date}
              onChange={(e) => handleDeployDateChange(e.target.value)}
              helperText={
                deployTargetEvent?.startDate
                  ? `Event Range: ${deployTargetEvent.startDate} to ${deployTargetEvent.endDate}`
                  : ""
              }
            />

            {/* Shift Duty */}
            <FormControl fullWidth size="small">
              <InputLabel id="deploy-shift-label">Deployment Shift</InputLabel>
              <Select
                labelId="deploy-shift-label"
                label="Deployment Shift"
                value={deployForm.shift}
                onChange={(e) =>
                  setDeployForm({ ...deployForm, shift: e.target.value })
                }
              >
                <MenuItem value="Morning">Morning Shift</MenuItem>
                <MenuItem value="Evening">Evening Shift</MenuItem>
                <MenuItem value="Night">Night Shift</MenuItem>
                <MenuItem value="General">General / Surge Duty</MenuItem>
              </Select>
            </FormControl>

            {/* Employee Autocomplete / Selector */}
            <Autocomplete
              options={deployCandidates}
              loading={candidatesLoading}
              getOptionLabel={(option) => {
                if (typeof option === "string") return option;
                return `${option.name || option.employeeId} (${option.employeeId}) · ${option.assignedDuty || "Duty"}${option.onLeave ? " [ON LEAVE]" : ""}`;
              }}
              value={
                deployCandidates.find(
                  (c) => String(c.employeeId) === String(deployForm.employeeId)
                ) ||
                (deployForm.employeeId
                  ? {
                      employeeId: deployForm.employeeId,
                      name: deployForm.employeeName || deployForm.employeeId,
                    }
                  : null)
              }
              onChange={(e, val) => {
                if (val) {
                  setDeployForm({
                    ...deployForm,
                    employeeId: val.employeeId,
                    employeeName: val.name,
                  });
                } else {
                  setDeployForm({
                    ...deployForm,
                    employeeId: "",
                    employeeName: "",
                  });
                }
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Select Employee"
                  placeholder="Search by name or employee ID"
                  helperText={
                    candidatesLoading
                      ? "Loading candidate roster for selected date..."
                      : "Shows crew members available or rostered on this date."
                  }
                />
              )}
            />

            {/* Manual Employee ID fallback if needed */}
            {!deployCandidates.length && !candidatesLoading && (
              <TextField
                label="Or enter Employee ID directly"
                size="small"
                value={deployForm.employeeId}
                onChange={(e) =>
                  setDeployForm({ ...deployForm, employeeId: e.target.value })
                }
              />
            )}

            {/* Operational Reason */}
            <TextField
              label="Operational Purpose / Reason"
              multiline
              minRows={2}
              value={deployForm.reason}
              onChange={(e) =>
                setDeployForm({ ...deployForm, reason: e.target.value })
              }
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button
            disabled={deploySubmitting}
            onClick={() => setDeployOpen(false)}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={
              deploySubmitting ||
              !deployForm.employeeId ||
              !deployForm.date ||
              !deployForm.shift
            }
            onClick={handleDeploySubmit}
            sx={{
              bgcolor: "#6D28D9 !important",
              textTransform: "none",
              fontWeight: 850,
              "&:hover": { bgcolor: "#5B21B6 !important" },
            }}
          >
            {deploySubmitting ? "Deploying..." : "Confirm & Deploy Manpower"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Legacy Leave Block Administration (for System Admins) */}
      {access?.allowAll && (
        <Box sx={{ mt: 3 }}>
          <LeaveBlockedPeriods isAdmin allowCreate={false} />
        </Box>
      )}
    </Box>
  );
}
