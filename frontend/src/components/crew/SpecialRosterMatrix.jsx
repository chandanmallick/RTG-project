import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Autocomplete,
  Badge,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  Grid,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  Briefcase,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  GripVertical,
  HelpCircle,
  Plus,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  Sparkles,
  Sun,
  Sunrise,
  Sunset,
  Moon,
  Coffee,
  Umbrella,
  UserCheck,
  UserPlus,
  Users,
  Wand2,
} from "lucide-react";
import dayjs from "dayjs";
import api from "../../crewLegacy/api";

const SHIFT_CONFIG = {
  Morning: {
    label: "Morning Shift",
    time: "06:00 – 14:00",
    color: "#D97706",
    bg: "#FEF3C7",
    border: "#FDE68A",
    icon: Sunrise,
  },
  Evening: {
    label: "Evening Shift",
    time: "14:00 – 22:00",
    color: "#7C3AED",
    bg: "#EDE9FE",
    border: "#DDD6FE",
    icon: Sunset,
  },
  Night: {
    label: "Night Shift",
    time: "22:00 – 06:00",
    color: "#2563EB",
    bg: "#DBEAFE",
    border: "#BFDBFE",
    icon: Moon,
  },
  General: {
    label: "General / Other",
    time: "09:30 – 17:30",
    color: "#475569",
    bg: "#F1F5F9",
    border: "#E2E8F0",
    icon: Briefcase,
  },
  Off: {
    label: "Available / Rest Pool",
    time: "Off Duty / Rest",
    color: "#059669",
    bg: "#D1FAE5",
    border: "#A7F3D0",
    icon: Coffee,
  },
  Leave: {
    label: "Employees on Leave",
    time: "On Leave",
    color: "#DC2626",
    bg: "#FEE2E2",
    border: "#FECACA",
    icon: Umbrella,
  },
};

export default function SpecialRosterMatrix({
  eventId = null,
  initialStartDate = null,
  initialEndDate = null,
  onEventChange,
}) {
  const [events, setEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState(eventId || "");
  const [startDate, setStartDate] = useState(
    initialStartDate || dayjs().format("YYYY-MM-DD")
  );
  const [endDate, setEndDate] = useState(
    initialEndDate || dayjs().add(6, "day").format("YYYY-MM-DD")
  );

  const [loading, setLoading] = useState(false);
  const [matrixData, setMatrixData] = useState({
    dates: [],
    dayNames: {},
    grid: {},
    replacementRequirements: [],
    departments: [],
  });

  const [notice, setNotice] = useState(null);
  const [draggedItem, setDraggedItem] = useState(null);
  const [dragOverCell, setDragOverCell] = useState(null);

  // Quick Add Person Dialog state
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addSlot, setAddSlot] = useState({ date: "", shift: "Morning" });
  const [addEmployeeId, setAddEmployeeId] = useState("");
  const [addEmployeeName, setAddEmployeeName] = useState("");
  const [addReason, setAddReason] = useState("");
  const [candidateOptions, setCandidateOptions] = useState([]);
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [addSaving, setAddSaving] = useState(false);

  // Sequential Allocation from Other Department Dialog state
  const [sequentialDialogOpen, setSequentialDialogOpen] = useState(false);
  const [sourceDept, setSourceDept] = useState("");
  const [seqTargetShifts, setSeqTargetShifts] = useState(["Morning", "Evening", "Night"]);
  const [maxDuties, setMaxDuties] = useState(2);
  const [previewOnly, setPreviewOnly] = useState(true);
  const [seqRunning, setSeqRunning] = useState(false);
  const [seqResults, setSeqResults] = useState(null);

  // Load events list
  useEffect(() => {
    api
      .get("/special-events")
      .then((res) => {
        const list = Array.isArray(res.data) ? res.data : [];
        setEvents(list);
        if (eventId && !selectedEventId) {
          setSelectedEventId(eventId);
        }
      })
      .catch(() => {});
  }, [eventId]);

  // Load Matrix Data
  const loadMatrix = async (overrideStart, overrideEnd, overrideEventId) => {
    setLoading(true);
    setNotice(null);
    const s = overrideStart || startDate;
    const e = overrideEnd || endDate;
    const evId = overrideEventId !== undefined ? overrideEventId : selectedEventId;

    try {
      const { data } = await api.get("/special-events/matrix", {
        params: {
          startDate: s,
          endDate: e,
          eventId: evId || undefined,
        },
      });
      setMatrixData(data || { dates: [], dayNames: {}, grid: {}, replacementRequirements: [], departments: [] });
      if (data?.event) {
        if (!overrideStart && data.event.startDate) setStartDate(data.event.startDate);
        if (!overrideEnd && data.event.endDate) setEndDate(data.event.endDate);
      }
    } catch (err) {
      setNotice({
        severity: "error",
        text: err.response?.data?.detail || "Could not load duty matrix.",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMatrix();
  }, [selectedEventId]);

  // When event selection changes
  const handleEventSelect = (newEvId) => {
    setSelectedEventId(newEvId);
    onEventChange?.(newEvId);
    const found = events.find((ev) => ev.id === newEvId);
    if (found) {
      setStartDate(found.startDate);
      setEndDate(found.endDate);
      loadMatrix(found.startDate, found.endDate, newEvId);
    } else {
      loadMatrix(startDate, endDate, newEvId);
    }
  };

  // Date Shifts Navigation (Prev / Next 7 days)
  const shiftDates = (days) => {
    const nextStart = dayjs(startDate).add(days, "day").format("YYYY-MM-DD");
    const nextEnd = dayjs(endDate).add(days, "day").format("YYYY-MM-DD");
    setStartDate(nextStart);
    setEndDate(nextEnd);
    loadMatrix(nextStart, nextEnd, selectedEventId);
  };

  // Drag and Drop Handlers
  const handleDragStart = (e, person, sourceDuty, date) => {
    const dragPayload = {
      employeeId: person.employeeId,
      name: person.name,
      designation: person.designation,
      sourceDuty,
      date,
      groupName: person.groupName || "",
    };
    setDraggedItem(dragPayload);
    e.dataTransfer.setData("text/plain", JSON.stringify(dragPayload));
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e, date, targetShift) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (
      !dragOverCell ||
      dragOverCell.date !== date ||
      dragOverCell.shift !== targetShift
    ) {
      setDragOverCell({ date, shift: targetShift });
    }
  };

  const handleDragLeave = () => {
    setDragOverCell(null);
  };

  const handleDrop = async (e, targetDate, targetShift, targetPerson = null) => {
    e.preventDefault();
    setDragOverCell(null);

    let payload = draggedItem;
    if (!payload) {
      try {
        payload = JSON.parse(e.dataTransfer.getData("text/plain"));
      } catch {
        return;
      }
    }
    if (!payload || !payload.employeeId) return;

    // Cross-date check: currently duty-switch is same-day shift rearrangement
    if (payload.date !== targetDate) {
      setNotice({
        severity: "warning",
        text: `Rearrangement is within the same date. Moving between dates requires Cross-Date Exchange in Duty Assignment.`,
      });
      return;
    }

    // Same shift check
    if (payload.sourceDuty === targetShift && !targetPerson) {
      return;
    }

    // Dropping on leave is invalid (leave requires replacement assignment)
    if (targetShift === "Leave") {
      setNotice({
        severity: "warning",
        text: "Cannot move employee into Leave. Leaves must be approved through Leave Management.",
      });
      return;
    }

    // Dropping onto another person on the same date = Mutual Shift Exchange!
    if (targetPerson && targetPerson.employeeId !== payload.employeeId) {
      if (targetPerson.onLeave) {
        setNotice({
          severity: "warning",
          text: "Cannot swap with an employee who is on leave. Use replacement assignment.",
        });
        return;
      }

      setLoading(true);
      try {
        await api.put("/replacement/duty-switch/exchange", {
          date: targetDate,
          firstEmployeeId: payload.employeeId,
          secondEmployeeId: targetPerson.employeeId,
          reason: `Mutual shift swap via Drag & Drop Matrix (${payload.sourceDuty} ⇄ ${targetShift})`,
        });
        setNotice({
          severity: "success",
          text: `Successfully exchanged duties between ${payload.name} (${payload.sourceDuty}) and ${targetPerson.name} (${targetShift})!`,
        });
        await loadMatrix();
      } catch (err) {
        setNotice({
          severity: "error",
          text: err.response?.data?.detail || "Could not execute duty exchange.",
        });
      } finally {
        setLoading(false);
        setDraggedItem(null);
      }
      return;
    }

    // Regular Drag & Drop between shifts on the same day
    setLoading(true);
    try {
      await api.put("/replacement/duty-switch", {
        date: targetDate,
        employeeId: payload.employeeId,
        assignedDuty: targetShift,
        reason: `Drag & drop matrix rearrangement from ${payload.sourceDuty} to ${targetShift}`,
      });
      setNotice({
        severity: "success",
        text: `Moved ${payload.name} to ${targetShift} on ${targetDate}. Reflected in exchange module!`,
      });
      await loadMatrix();
    } catch (err) {
      setNotice({
        severity: "error",
        text: err.response?.data?.detail || "Could not rearrange duty shift.",
      });
    } finally {
      setLoading(false);
      setDraggedItem(null);
    }
  };

  // Open Quick Add Dialog
  const openAddPersonDialog = async (date, shift) => {
    setAddSlot({ date, shift });
    setAddEmployeeId("");
    setAddEmployeeName("");
    setAddReason(`Special roster assignment: ${shift}`);
    setAddDialogOpen(true);
    setCandidateLoading(true);
    try {
      const { data } = await api.get("/replacement/duty-switch/options", {
        params: { date },
      });
      setCandidateOptions(Array.isArray(data) ? data : []);
    } catch {
      setCandidateOptions([]);
    } finally {
      setCandidateLoading(false);
    }
  };

  // Submit Quick Add Person
  const handleAddPersonSubmit = async () => {
    if (!addEmployeeId) return;
    setAddSaving(true);
    try {
      await api.put("/replacement/duty-switch/additional-manpower", {
        date: addSlot.date,
        employeeId: addEmployeeId,
        assignedDuty: addSlot.shift,
        reason: addReason || `Added to ${addSlot.shift} via matrix view`,
        eventId: selectedEventId || undefined,
        mode: "double",
      });
      setNotice({
        severity: "success",
        text: `Successfully added ${addEmployeeName || addEmployeeId} to ${addSlot.shift} on ${addSlot.date}!`,
      });
      setAddDialogOpen(false);
      await loadMatrix();
    } catch (err) {
      setNotice({
        severity: "error",
        text: err.response?.data?.detail || "Failed to add person to shift.",
      });
    } finally {
      setAddSaving(false);
    }
  };

  // Run Sequential Allocation from Other Department
  const handleRunSequentialAllocation = async () => {
    if (!sourceDept) {
      setNotice({ severity: "error", text: "Please select a source department." });
      return;
    }
    setSeqRunning(true);
    setSeqResults(null);
    try {
      const { data } = await api.post("/special-events/sequential-allocate", {
        startDate,
        endDate,
        eventId: selectedEventId || undefined,
        sourceDepartment: sourceDept,
        targetShifts: seqTargetShifts,
        maxDutiesPerPerson: Number(maxDuties) || 2,
        previewOnly: Boolean(previewOnly),
      });
      setSeqResults(data);
      if (!previewOnly) {
        setNotice({
          severity: "success",
          text: `Sequential allocation committed! ${data.allocatedCount} duty replacement slots filled from ${sourceDept}.`,
        });
        await loadMatrix();
      }
    } catch (err) {
      setNotice({
        severity: "error",
        text: err.response?.data?.detail || "Sequential allocation failed.",
      });
    } finally {
      setSeqRunning(false);
    }
  };

  // Uncovered requirements count
  const uncoveredCount = useMemo(() => {
    return (matrixData.replacementRequirements || []).filter(
      (r) => r.status === "Uncovered"
    ).length;
  }, [matrixData]);

  return (
    <Box sx={{ width: "100%" }}>
      {/* TOP CONTROL BAR & PERIOD SELECTOR */}
      <Paper
        elevation={0}
        sx={{
          p: 2,
          mb: 2.5,
          borderRadius: 3.5,
          background: "#FFFFFF",
          border: "1px solid #E2E8F0",
          boxShadow: "0 6px 22px rgba(15, 23, 42, 0.05)",
        }}
      >
        <Stack
          direction={{ xs: "column", md: "row" }}
          justifyContent="space-between"
          alignItems={{ md: "center" }}
          spacing={2}
          flexWrap="wrap"
        >
          {/* Left: Event Selection or Date Navigator */}
          <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
            <FormControl size="small" sx={{ minWidth: 230 }}>
              <InputLabel id="special-matrix-event-select">Special Event Target</InputLabel>
              <Select
                labelId="special-matrix-event-select"
                label="Special Event Target"
                value={selectedEventId}
                onChange={(e) => handleEventSelect(e.target.value)}
              >
                <MenuItem value="">
                  <em>Custom Date Period (No Event Lock)</em>
                </MenuItem>
                {events.map((ev) => (
                  <MenuItem key={ev.id} value={ev.id}>
                    {ev.title} ({ev.startDate} to {ev.endDate})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Stack direction="row" spacing={0.6} alignItems="center">
              <IconButton size="small" onClick={() => shiftDates(-7)} sx={{ border: "1px solid #CBD5E1" }}>
                <ChevronLeft size={16} />
              </IconButton>
              <TextField
                type="date"
                size="small"
                label="From"
                InputLabelProps={{ shrink: true }}
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  loadMatrix(e.target.value, endDate);
                }}
                sx={{ width: 145 }}
              />
              <Typography color="#94A3B8">—</Typography>
              <TextField
                type="date"
                size="small"
                label="Through"
                InputLabelProps={{ shrink: true }}
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  loadMatrix(startDate, e.target.value);
                }}
                sx={{ width: 145 }}
              />
              <IconButton size="small" onClick={() => shiftDates(7)} sx={{ border: "1px solid #CBD5E1" }}>
                <ChevronRight size={16} />
              </IconButton>
            </Stack>

            <Button
              size="small"
              variant="outlined"
              onClick={() => {
                const today = dayjs().format("YYYY-MM-DD");
                const nextWeek = dayjs().add(6, "day").format("YYYY-MM-DD");
                setStartDate(today);
                setEndDate(nextWeek);
                loadMatrix(today, nextWeek);
              }}
              sx={{ textTransform: "none", fontWeight: 800, borderRadius: 2 }}
            >
              Today
            </Button>
          </Stack>

          {/* Right: Actions (Sequential Allocate, Refresh, Guide) */}
          <Stack direction="row" spacing={1.2} alignItems="center" flexWrap="wrap">
            <Button
              variant="contained"
              startIcon={<Wand2 size={16} />}
              onClick={() => {
                setSequentialDialogOpen(true);
                setSeqResults(null);
                if (!sourceDept && matrixData.departments?.length) {
                  setSourceDept(matrixData.departments[0]);
                }
              }}
              sx={{
                bgcolor: "#6D28D9",
                color: "#FFF",
                fontWeight: 900,
                borderRadius: 2.5,
                textTransform: "none",
                boxShadow: "0 4px 14px rgba(109, 40, 217, 0.25)",
                "&:hover": { bgcolor: "#5B21B6" },
              }}
            >
              Sequential Dept Roster
            </Button>

            <Button
              variant="outlined"
              startIcon={<RefreshCw size={14} className={loading ? "spin" : ""} />}
              onClick={() => loadMatrix()}
              sx={{
                borderColor: "#CBD5E1",
                color: "#334155",
                fontWeight: 800,
                borderRadius: 2.5,
                textTransform: "none",
              }}
            >
              Refresh
            </Button>

            <Tooltip title="Drag any employee card to rearrange shifts on that day. Drop onto another employee to swap. Click '+ Add Person' to fill vacancies.">
              <IconButton size="small" sx={{ bgcolor: "#F1F5F9" }}>
                <HelpCircle size={18} color="#64748B" />
              </IconButton>
            </Tooltip>
          </Stack>
        </Stack>

        {/* Global Notifications */}
        {notice && (
          <Alert severity={notice.severity} sx={{ mt: 2 }} onClose={() => setNotice(null)}>
            {notice.text}
          </Alert>
        )}

        {/* Status Chips Ribbon */}
        <Stack direction="row" spacing={1} sx={{ mt: 1.8 }} flexWrap="wrap" alignItems="center">
          <Chip
            size="small"
            icon={<Calendar size={13} />}
            label={`${matrixData.dates.length} Days in View`}
            sx={{ bgcolor: "#F8FAFC", fontWeight: 800 }}
          />
          {uncoveredCount > 0 ? (
            <Chip
              size="small"
              icon={<ShieldAlert size={13} />}
              label={`${uncoveredCount} Leave Cover(s) Required`}
              sx={{ bgcolor: "#FEE2E2", color: "#991B1B", fontWeight: 900 }}
            />
          ) : (
            <Chip
              size="small"
              icon={<CheckCircle2 size={13} />}
              label="All Required Replacements Covered"
              sx={{ bgcolor: "#DCFCE7", color: "#166534", fontWeight: 800 }}
            />
          )}
          <Typography fontSize={11.5} color="#64748B" sx={{ ml: 1 }}>
            💡 <strong>Drag & Drop Ready:</strong> Grab any employee card to reassign shift or drop onto another employee to swap.
          </Typography>
        </Stack>
      </Paper>

      {/* INTERACTIVE DUTY TYPE VS DAYS MATRIX */}
      <Paper
        elevation={0}
        sx={{
          borderRadius: 3.5,
          border: "1.5px solid #CBD5E1",
          bgcolor: "#FFFFFF",
          overflow: "hidden",
          boxShadow: "0 8px 30px rgba(15, 23, 42, 0.06)",
        }}
      >
        <TableContainer sx={{ maxHeight: "calc(100vh - 270px)", overflowX: "auto" }}>
          <Table stickyHeader size="small" sx={{ minWidth: Math.max(900, (matrixData.dates || []).length * 190) }}>
            <TableHead>
              <TableRow>
                {/* Fixed Y-Axis Header: Duty Type */}
                <TableCell
                  sx={{
                    width: 170,
                    minWidth: 170,
                    bgcolor: "#0F172A",
                    color: "#FFFFFF",
                    fontWeight: 900,
                    fontSize: 13,
                    position: "sticky",
                    left: 0,
                    zIndex: 10,
                  }}
                >
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <Briefcase size={16} />
                    <span>Duty Shift / Days</span>
                  </Stack>
                </TableCell>

                {/* X-Axis Columns: Days */}
                {(matrixData.dates || []).map((dateStr) => {
                  const dayName = matrixData.dayNames?.[dateStr] || "";
                  const isWeekend = dayName === "Sun" || dayName === "Sat";
                  const isToday = dateStr === dayjs().format("YYYY-MM-DD");

                  return (
                    <TableCell
                      key={dateStr}
                      align="center"
                      sx={{
                        width: 190,
                        minWidth: 190,
                        bgcolor: isToday ? "#EDE9FE" : isWeekend ? "#F8FAFC" : "#FFFFFF",
                        borderLeft: "1px solid #E2E8F0",
                        py: 1,
                      }}
                    >
                      <Stack spacing={0.3} alignItems="center">
                        <Stack direction="row" spacing={0.6} alignItems="center">
                          <Typography fontSize={13} fontWeight={900} color={isToday ? "#6D28D9" : "#0F172A"}>
                            {dayjs(dateStr).format("DD MMM")}
                          </Typography>
                          {isToday && (
                            <Chip
                              size="small"
                              label="Today"
                              sx={{ height: 16, fontSize: "0.65rem", bgcolor: "#6D28D9", color: "#FFF", fontWeight: 800 }}
                            />
                          )}
                        </Stack>
                        <Typography
                          fontSize={11}
                          fontWeight={850}
                          color={isWeekend ? "#EA580C" : isToday ? "#7C3AED" : "#64748B"}
                        >
                          {dayName} · {dateStr}
                        </Typography>
                      </Stack>
                    </TableCell>
                  );
                })}
              </TableRow>
            </TableHead>

            <TableBody>
              {loading && !matrixData.dates.length ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 8 }}>
                    <CircularProgress size={32} />
                    <Typography sx={{ mt: 1.5, color: "#64748B", fontWeight: 700 }}>
                      Loading Duty Matrix...
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                ["Morning", "Evening", "Night", "General", "Off", "Leave"].map((shiftKey) => {
                  const conf = SHIFT_CONFIG[shiftKey] || SHIFT_CONFIG.General;
                  const IconComponent = conf.icon;

                  return (
                    <TableRow key={shiftKey} hover sx={{ "&:last-child td, &:last-child th": { borderBottom: 0 } }}>
                      {/* Y-Axis Shift Label Column (Sticky Left) */}
                      <TableCell
                        sx={{
                          position: "sticky",
                          left: 0,
                          zIndex: 5,
                          bgcolor: conf.bg,
                          borderRight: `2px solid ${conf.border}`,
                          borderBottom: "1px solid #CBD5E1",
                          p: 1.5,
                          verticalAlign: "top",
                        }}
                      >
                        <Stack spacing={0.5}>
                          <Stack direction="row" alignItems="center" spacing={1}>
                            <IconComponent size={17} color={conf.color} />
                            <Typography fontWeight={900} fontSize={13} color={conf.color}>
                              {conf.label}
                            </Typography>
                          </Stack>
                          <Typography fontSize={10} color="#64748B" fontWeight={700}>
                            {conf.time}
                          </Typography>
                        </Stack>
                      </TableCell>

                      {/* Day Cells for this Shift */}
                      {(matrixData.dates || []).map((dateStr) => {
                        const shiftList = matrixData.grid?.[dateStr]?.[shiftKey] || [];
                        const isDragTarget =
                          dragOverCell &&
                          dragOverCell.date === dateStr &&
                          dragOverCell.shift === shiftKey;

                        return (
                          <TableCell
                            key={dateStr}
                            onDragOver={(e) => handleDragOver(e, dateStr, shiftKey)}
                            onDragLeave={handleDragLeave}
                            onDrop={(e) => handleDrop(e, dateStr, shiftKey)}
                            sx={{
                              verticalAlign: "top",
                              borderLeft: "1px solid #E2E8F0",
                              borderBottom: "1px solid #CBD5E1",
                              p: 1,
                              bgcolor: isDragTarget ? "#EDE9FE" : "transparent",
                              outline: isDragTarget ? "2px dashed #7C3AED" : "none",
                              transition: "background-color 0.15s, outline 0.15s",
                            }}
                          >
                            <Stack spacing={0.8} sx={{ minHeight: 65 }}>
                              {/* Roster Block Cards */}
                              {shiftList.map((person) => {
                                const isCurrentDrag =
                                  draggedItem &&
                                  draggedItem.employeeId === person.employeeId &&
                                  draggedItem.date === dateStr;

                                return (
                                  <Paper
                                    key={person.employeeId}
                                    draggable={!person.onLeave}
                                    onDragStart={(e) =>
                                      handleDragStart(e, person, shiftKey, dateStr)
                                    }
                                    onDragOver={(e) => {
                                      // Allow dropping directly onto this card to swap duties
                                      e.preventDefault();
                                      e.stopPropagation();
                                    }}
                                    onDrop={(e) => {
                                      e.stopPropagation();
                                      handleDrop(e, dateStr, shiftKey, person);
                                    }}
                                    elevation={0}
                                    sx={{
                                      p: 0.9,
                                      borderRadius: 2,
                                      border: "1px solid",
                                      borderColor: person.onLeave
                                        ? "#FCA5A5"
                                        : person.replacementDuty
                                        ? "#86EFAC"
                                        : "#CBD5E1",
                                      bgcolor: person.onLeave
                                        ? "#FEF2F2"
                                        : person.replacementDuty
                                        ? "#F0FDF4"
                                        : "#FFFFFF",
                                      cursor: person.onLeave ? "default" : "grab",
                                      opacity: isCurrentDrag ? 0.4 : 1,
                                      boxShadow: "0 2px 6px rgba(0,0,0,0.04)",
                                      transition: "transform 0.15s, box-shadow 0.15s",
                                      "&:hover": {
                                        transform: person.onLeave ? "none" : "translateY(-2px)",
                                        boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                                        borderColor: "#94A3B8",
                                      },
                                    }}
                                  >
                                    <Stack direction="row" alignItems="flex-start" spacing={0.6}>
                                      {!person.onLeave && (
                                        <GripVertical
                                          size={13}
                                          color="#94A3B8"
                                          style={{ marginTop: 2, flexShrink: 0 }}
                                        />
                                      )}
                                      <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                                        <Typography
                                          fontSize={11.5}
                                          fontWeight={850}
                                          color={person.onLeave ? "#991B1B" : "#0F172A"}
                                          sx={{ lineHeight: 1.25 }}
                                          noWrap
                                        >
                                          {person.name}
                                        </Typography>

                                        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.3 }} flexWrap="wrap">
                                          <Typography fontSize={10} color="#64748B">
                                            {person.employeeId}
                                          </Typography>
                                          {person.designation && (
                                            <Typography fontSize={9.5} color="#94A3B8" noWrap>
                                              · {person.designation}
                                            </Typography>
                                          )}
                                        </Stack>

                                        {/* Status & Coverage Badges */}
                                        <Stack direction="row" spacing={0.4} sx={{ mt: 0.4 }} flexWrap="wrap">
                                          {person.replacementDuty && (
                                            <Chip
                                              size="small"
                                              label="Cover"
                                              sx={{
                                                height: 15,
                                                fontSize: "0.62rem",
                                                fontWeight: 900,
                                                bgcolor: "#DCFCE7",
                                                color: "#166534",
                                              }}
                                            />
                                          )}
                                          {person.additionalManpower && (
                                            <Chip
                                              size="small"
                                              label="Surge"
                                              sx={{
                                                height: 15,
                                                fontSize: "0.62rem",
                                                fontWeight: 900,
                                                bgcolor: "#EDE9FE",
                                                color: "#6D28D9",
                                              }}
                                            />
                                          )}
                                          {person.isSIC && (
                                            <Chip
                                              size="small"
                                              label="SIC"
                                              sx={{
                                                height: 15,
                                                fontSize: "0.62rem",
                                                fontWeight: 900,
                                                bgcolor: "#DBEAFE",
                                                color: "#1E40AF",
                                              }}
                                            />
                                          )}
                                          {person.onLeave && (
                                            <Chip
                                              size="small"
                                              label={person.leaveType || "Leave"}
                                              sx={{
                                                height: 15,
                                                fontSize: "0.62rem",
                                                fontWeight: 900,
                                                bgcolor: "#FEE2E2",
                                                color: "#991B1B",
                                              }}
                                            />
                                          )}
                                          {person.replacementRequired && !person.replacementAssigned && (
                                            <Chip
                                              size="small"
                                              label="Needs Cover"
                                              sx={{
                                                height: 15,
                                                fontSize: "0.62rem",
                                                fontWeight: 900,
                                                bgcolor: "#FEF3C7",
                                                color: "#B45309",
                                              }}
                                            />
                                          )}
                                        </Stack>
                                      </Box>
                                    </Stack>
                                  </Paper>
                                );
                              })}

                              {/* Empty slot cue */}
                              {shiftList.length === 0 && (
                                <Box
                                  sx={{
                                    py: 1.2,
                                    textAlign: "center",
                                    color: "#CBD5E1",
                                    fontSize: 11,
                                    border: "1px dashed #E2E8F0",
                                    borderRadius: 1.5,
                                  }}
                                >
                                  Vacant Slot
                                </Box>
                              )}

                              {/* + Add Person Button (Available for regular shifts) */}
                              {shiftKey !== "Leave" && (
                                <Button
                                  size="small"
                                  startIcon={<Plus size={11} />}
                                  onClick={() => openAddPersonDialog(dateStr, shiftKey)}
                                  sx={{
                                    fontSize: "0.68rem",
                                    py: 0.2,
                                    px: 0.8,
                                    minHeight: 0,
                                    border: "1px dashed #CBD5E1",
                                    borderRadius: 1.5,
                                    color: "#64748B",
                                    textTransform: "none",
                                    fontWeight: 800,
                                    "&:hover": {
                                      bgcolor: "#F8FAFC",
                                      borderColor: "#94A3B8",
                                      color: "#0F172A",
                                    },
                                  }}
                                >
                                  + Add Person
                                </Button>
                              )}
                            </Stack>
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* QUICK ADD PERSON TO SHIFT DIALOG */}
      <Dialog
        open={addDialogOpen}
        onClose={() => !addSaving && setAddDialogOpen(false)}
        fullWidth
        maxWidth="xs"
        slotProps={{
          paper: { sx: { borderRadius: "20px !important", p: 1, background: "#FAF9FF !important" } },
        }}
      >
        <DialogTitle sx={{ fontWeight: 900 }}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <UserPlus size={18} color="#6D28D9" />
            <Typography fontWeight={900} fontSize={17} color="#1E1B4B">
              Add Person to {addSlot.shift}
            </Typography>
          </Stack>
          <Typography variant="body2" color="#64748B">
            Date: {addSlot.date} ({dayjs(addSlot.date).format("dddd")})
          </Typography>
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Autocomplete
              options={candidateOptions}
              loading={candidateLoading}
              getOptionLabel={(option) => {
                if (typeof option === "string") return option;
                return `${option.name || option.employeeId} (${option.employeeId}) · ${option.assignedDuty || "Duty"}`;
              }}
              value={
                candidateOptions.find((c) => String(c.employeeId) === String(addEmployeeId)) ||
                (addEmployeeId ? { employeeId: addEmployeeId, name: addEmployeeName } : null)
              }
              onChange={(e, val) => {
                if (val) {
                  setAddEmployeeId(val.employeeId);
                  setAddEmployeeName(val.name);
                } else {
                  setAddEmployeeId("");
                  setAddEmployeeName("");
                }
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Select Candidate"
                  placeholder="Search crew members"
                  helperText="Available personnel on this date"
                />
              )}
            />

            <TextField
              label="Assignment Reason"
              size="small"
              value={addReason}
              onChange={(e) => setAddReason(e.target.value)}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button disabled={addSaving} onClick={() => setAddDialogOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={addSaving || !addEmployeeId}
            onClick={handleAddPersonSubmit}
            sx={{ bgcolor: "#6D28D9 !important", fontWeight: 850, textTransform: "none" }}
          >
            {addSaving ? "Adding..." : "Add to Shift"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* SEQUENTIAL DEPARTMENT ROSTER ALLOCATION MODAL */}
      <Dialog
        open={sequentialDialogOpen}
        onClose={() => !seqRunning && setSequentialDialogOpen(false)}
        fullWidth
        maxWidth="md"
        slotProps={{
          paper: { sx: { borderRadius: "22px !important", background: "#FAF9FF !important" } },
        }}
      >
        <DialogTitle sx={{ fontWeight: 900, bgcolor: "#FFFFFF", borderBottom: "1px solid #E2E8F0" }}>
          <Stack direction="row" alignItems="center" spacing={1.2}>
            <Wand2 size={20} color="#6D28D9" />
            <Box>
              <Typography fontWeight={900} fontSize={18} color="#1E1B4B">
                Sequential Manpower Roster from Other Department
              </Typography>
              <Typography variant="body2" color="#64748B">
                Round-robin sequential allocation to fill duties requiring replacement (marked by SIC/DIC).
              </Typography>
            </Box>
          </Stack>
        </DialogTitle>

        <DialogContent dividers sx={{ p: 2.5 }}>
          <Stack spacing={2.5}>
            {/* Uncovered Slots Overview */}
            <Alert severity={uncoveredCount > 0 ? "warning" : "info"}>
              {uncoveredCount > 0
                ? `Found ${uncoveredCount} duty replacement slots requiring cover between ${startDate} and ${endDate}.`
                : `No pending leave replacement slots marked by SIC/DIC. You can still allocate surge strength.`}
            </Alert>

            {/* Department & Configuration Form */}
            <Paper elevation={0} sx={{ p: 2, borderRadius: 2.5, bgcolor: "#FFFFFF", border: "1px solid #E2E8F0" }}>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth size="small">
                    <InputLabel id="seq-source-dept-label">Source Department</InputLabel>
                    <Select
                      labelId="seq-source-dept-label"
                      label="Source Department"
                      value={sourceDept}
                      onChange={(e) => setSourceDept(e.target.value)}
                    >
                      {(matrixData.departments || []).map((dept) => (
                        <MenuItem key={dept} value={dept}>
                          {dept}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>

                <Grid item xs={12} sm={6}>
                  <TextField
                    type="number"
                    size="small"
                    label="Max Duties per Person"
                    fullWidth
                    value={maxDuties}
                    onChange={(e) => setMaxDuties(e.target.value)}
                    helperText="Prevents overloading any single individual"
                  />
                </Grid>

                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth size="small">
                    <InputLabel id="seq-target-shifts-label">Target Shifts</InputLabel>
                    <Select
                      labelId="seq-target-shifts-label"
                      multiple
                      label="Target Shifts"
                      value={seqTargetShifts}
                      onChange={(e) => {
                        const v = e.target.value;
                        setSeqTargetShifts(typeof v === "string" ? v.split(",") : v);
                      }}
                      renderValue={(selected) => selected.join(", ")}
                    >
                      <MenuItem value="Morning">Morning Shift</MenuItem>
                      <MenuItem value="Evening">Evening Shift</MenuItem>
                      <MenuItem value="Night">Night Shift</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>

                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth size="small">
                    <InputLabel id="seq-mode-label">Execution Mode</InputLabel>
                    <Select
                      labelId="seq-mode-label"
                      label="Execution Mode"
                      value={previewOnly ? "preview" : "live"}
                      onChange={(e) => setPreviewOnly(e.target.value === "preview")}
                    >
                      <MenuItem value="preview">🔍 Simulation Only (Preview first)</MenuItem>
                      <MenuItem value="live">⚡ Live Allocation (Commit to roster & exchange module)</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
              </Grid>
            </Paper>

            {/* Results Display */}
            {seqResults && (
              <Box sx={{ border: "1.5px solid #E2E8F0", borderRadius: 2.5, bgcolor: "#FFFFFF", overflow: "hidden" }}>
                <Box sx={{ p: 1.5, bgcolor: "#F8FAFC", borderBottom: "1px solid #E2E8F0" }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography fontWeight={900} fontSize={13.5} color="#1E293B">
                      Allocation Results · {seqResults.allocatedCount} of {seqResults.totalRequirements} Allocated
                    </Typography>
                    <Chip
                      size="small"
                      label={seqResults.previewOnly ? "Preview Mode" : "Committed to Live Roster"}
                      sx={{
                        bgcolor: seqResults.previewOnly ? "#FEF3C7" : "#DCFCE7",
                        color: seqResults.previewOnly ? "#B45309" : "#166534",
                        fontWeight: 800,
                      }}
                    />
                  </Stack>
                </Box>

                {seqResults.allocations?.length > 0 ? (
                  <Table size="small">
                    <TableHead sx={{ bgcolor: "#F1F5F9" }}>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 900 }}>Date</TableCell>
                        <TableCell sx={{ fontWeight: 900 }}>Shift</TableCell>
                        <TableCell sx={{ fontWeight: 900 }}>Replaced Person</TableCell>
                        <TableCell sx={{ fontWeight: 900 }}>Allocated Person (From {seqResults.sourceDepartment})</TableCell>
                        <TableCell sx={{ fontWeight: 900 }}>Status</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {seqResults.allocations.map((a, idx) => (
                        <TableRow key={idx} hover>
                          <TableCell sx={{ fontWeight: 800 }}>{a.date}</TableCell>
                          <TableCell>
                            <Chip size="small" label={a.shift} sx={{ fontWeight: 800 }} />
                          </TableCell>
                          <TableCell>{a.replacedEmployee}</TableCell>
                          <TableCell sx={{ fontWeight: 850, color: "#6D28D9" }}>
                            {a.allocatedEmployeeName} ({a.allocatedEmployeeId})
                          </TableCell>
                          <TableCell>
                            <Chip
                              size="small"
                              label={a.status}
                              sx={{
                                bgcolor: a.status === "Allocated" ? "#DCFCE7" : "#FEF3C7",
                                color: a.status === "Allocated" ? "#166534" : "#B45309",
                                fontWeight: 800,
                              }}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <Box sx={{ p: 3, textAlign: "center", color: "#64748B" }}>
                    No slots were allocated. Check if replacement requirements exist in this period.
                  </Box>
                )}
              </Box>
            )}
          </Stack>
        </DialogContent>

        <DialogActions sx={{ p: 2, bgcolor: "#FFFFFF" }}>
          <Button disabled={seqRunning} onClick={() => setSequentialDialogOpen(false)}>
            Close
          </Button>
          <Button
            variant="contained"
            disabled={seqRunning || !sourceDept}
            onClick={handleRunSequentialAllocation}
            sx={{
              bgcolor: previewOnly ? "#2563EB !important" : "#6D28D9 !important",
              fontWeight: 850,
              textTransform: "none",
            }}
          >
            {seqRunning
              ? "Running Algorithm..."
              : previewOnly
              ? "Simulate Allocation"
              : "Commit Live Allocation"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
