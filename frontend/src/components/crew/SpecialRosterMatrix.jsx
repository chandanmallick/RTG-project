import React, { useEffect, useMemo, useState } from "react";
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
  ListItemText,
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
  AlertCircle,
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  Award,
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
  Trash2,
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

// GROUP COLOR SCHEME CONFIGURATION - Specially tailored palettes to distinguish Group types clearly
export const GROUP_COLOR_CONFIG = {
  "Group-1": {
    label: "Group 1",
    tag: "G1",
    accent: "#059669",      // Emerald Green
    cardBg: "#F0FDF4",      // Soft Emerald tint
    borderColor: "#A7F3D0", // Emerald border
    badgeBg: "#DCFCE7",     // Chip background
    badgeText: "#14532D",   // Deep green text
    badgeBorder: "#4ADE80",
    dot: "#10B981",
  },
  "Group-2": {
    label: "Group 2",
    tag: "G2",
    accent: "#2563EB",      // Royal Blue
    cardBg: "#EFF6FF",      // Soft Blue tint
    borderColor: "#BFDBFE", // Blue border
    badgeBg: "#DBEAFE",     // Chip background
    badgeText: "#1E3A8A",   // Deep navy text
    badgeBorder: "#60A5FA",
    dot: "#3B82F6",
  },
  "Group-3": {
    label: "Group 3",
    tag: "G3",
    accent: "#D97706",      // Warm Amber / Golden Orange
    cardBg: "#FFFBEB",      // Soft Amber tint
    borderColor: "#FDE68A", // Amber border
    badgeBg: "#FEF3C7",     // Chip background
    badgeText: "#78350F",   // Deep amber text
    badgeBorder: "#FBBF24",
    dot: "#F59E0B",
  },
  "Group-4": {
    label: "Group 4",
    tag: "G4",
    accent: "#7C3AED",      // Rich Violet / Purple
    cardBg: "#FAF5FF",      // Soft Violet tint
    borderColor: "#DDD6FE", // Violet border
    badgeBg: "#F3E8FF",     // Chip background
    badgeText: "#581C87",   // Deep purple text
    badgeBorder: "#C084FC",
    dot: "#8B5CF6",
  },
  "Group-5": {
    label: "Group 5",
    tag: "G5",
    accent: "#E11D48",      // Crimson / Rose
    cardBg: "#FFF1F2",      // Soft Rose tint
    borderColor: "#FECDD3", // Rose border
    badgeBg: "#FFE4E6",     // Chip background
    badgeText: "#881337",   // Deep rose text
    badgeBorder: "#FB7185",
    dot: "#F43F5E",
  },
  "Group-6": {
    label: "Group 6",
    tag: "G6",
    accent: "#0891B2",      // Cyan / Teal
    cardBg: "#ECFEFF",      // Soft Teal tint
    borderColor: "#A5F3FC", // Cyan border
    badgeBg: "#CFFAFE",     // Chip background
    badgeText: "#164E63",   // Deep cyan text
    badgeBorder: "#22D3EE",
    dot: "#06B6D4",
  },
  "General": {
    label: "General / Other",
    tag: "GEN",
    accent: "#64748B",      // Cool Slate Gray
    cardBg: "#F8FAFC",      // Neutral slate tint
    borderColor: "#E2E8F0", // Slate border
    badgeBg: "#F1F5F9",     // Chip background
    badgeText: "#1E293B",   // Deep slate text
    badgeBorder: "#CBD5E1",
    dot: "#64748B",
  },
};

export function getGroupStyle(groupName) {
  if (!groupName) return GROUP_COLOR_CONFIG["General"];
  const clean = String(groupName).trim();
  if (GROUP_COLOR_CONFIG[clean]) return GROUP_COLOR_CONFIG[clean];

  const lower = clean.toLowerCase();
  if (lower.includes("1") || lower.endsWith(" a") || lower.endsWith("-a")) {
    return GROUP_COLOR_CONFIG["Group-1"];
  }
  if (lower.includes("2") || lower.endsWith(" b") || lower.endsWith("-b")) {
    return GROUP_COLOR_CONFIG["Group-2"];
  }
  if (lower.includes("3") || lower.endsWith(" c") || lower.endsWith("-c")) {
    return GROUP_COLOR_CONFIG["Group-3"];
  }
  if (lower.includes("4") || lower.endsWith(" d") || lower.endsWith("-d")) {
    return GROUP_COLOR_CONFIG["Group-4"];
  }
  if (lower.includes("5") || lower.endsWith(" e") || lower.endsWith("-e")) {
    return GROUP_COLOR_CONFIG["Group-5"];
  }
  if (lower.includes("6") || lower.endsWith(" f") || lower.endsWith("-f")) {
    return GROUP_COLOR_CONFIG["Group-6"];
  }

  // Deterministic fallback based on hash of string
  const paletteList = [
    GROUP_COLOR_CONFIG["Group-1"],
    GROUP_COLOR_CONFIG["Group-2"],
    GROUP_COLOR_CONFIG["Group-3"],
    GROUP_COLOR_CONFIG["Group-4"],
    GROUP_COLOR_CONFIG["Group-5"],
    GROUP_COLOR_CONFIG["Group-6"],
  ];
  let hash = 0;
  for (let i = 0; i < clean.length; i++) {
    hash = (hash << 5) - hash + clean.charCodeAt(i);
    hash |= 0;
  }
  const idx = Math.abs(hash) % paletteList.length;
  return {
    ...paletteList[idx],
    label: clean,
  };
}

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

  const [selectedGroupFilter, setSelectedGroupFilter] = useState("all");

  // Compute active groups present in matrix data for legend and filter
  const presentGroups = useMemo(() => {
    const map = {};
    if (!matrixData.grid) return [];
    Object.values(matrixData.grid).forEach((dayShifts) => {
      Object.values(dayShifts || {}).forEach((list) => {
        (list || []).forEach((person) => {
          const g = (person.groupName && String(person.groupName).trim()) || "General";
          map[g] = (map[g] || 0) + 1;
        });
      });
    });
    return Object.entries(map)
      .map(([name, count]) => ({
        name,
        count,
        style: getGroupStyle(name),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [matrixData.grid]);

  const [notice, setNotice] = useState(null);
  const [draggedItem, setDraggedItem] = useState(null);
  const [dragOverCell, setDragOverCell] = useState(null);

  // Quick Add Person Dialog state
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addSlot, setAddSlot] = useState({ date: "", shift: "Morning" });
  const [addEmployeeId, setAddEmployeeId] = useState("");
  const [addEmployeeName, setAddEmployeeName] = useState("");
  const [addReason, setAddReason] = useState("");
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [addSaving, setAddSaving] = useState(false);

  // Deploy Replacement Dialog state (Connects to existing replacement module & C-OFF database)
  const [deployModalOpen, setDeployModalOpen] = useState(false);
  const [deployCandidate, setDeployCandidate] = useState(null);
  const [deployLeave, setDeployLeave] = useState(null);
  const [deploySlot, setDeploySlot] = useState({ date: "", shift: "Morning" });
  const [deployMode, setDeployMode] = useState("double"); // Default double duty awards C-OFF credit
  const [deployHalfDuty, setDeployHalfDuty] = useState(false);
  const [deployReason, setDeployReason] = useState("");
  const [deploySaving, setDeploySaving] = useState(false);
  const [deployCandidateOptions, setDeployCandidateOptions] = useState([]);
  const [deployCandidateLoading, setDeployCandidateLoading] = useState(false);

  // Sequential Allocation from Created Pools & Multi-Department Dialog state
  const [sequentialDialogOpen, setSequentialDialogOpen] = useState(false);
  const [sourcePool, setSourcePool] = useState("all_pools");
  const [sourceDepartments, setSourceDepartments] = useState([]);
  const [allocationType, setAllocationType] = useState("both");
  const [surgePerShift, setSurgePerShift] = useState(1);
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

    // Dropping onto an employee who is on Leave -> Deploy as Replacement!
    if (targetPerson && targetPerson.onLeave) {
      const leaveRec =
        (matrixData.grid?.[targetDate]?.["Leave"] || []).find(
          (l) => l.employeeId === targetPerson.employeeId
        ) ||
        (matrixData.replacementRequirements || []).find(
          (r) => r.employeeId === targetPerson.employeeId && r.date === targetDate
        ) ||
        targetPerson;
      openDeployReplacementModal(payload, leaveRec, targetDate, targetPerson.assignedDuty || targetShift);
      return;
    }

    // Dropping directly into Leave row (empty space)
    if (targetShift === "Leave") {
      setNotice({
        severity: "info",
        text: "To deploy a replacement for an employee on leave, drop candidate directly onto the 'Replacement Place' slot in the shift or onto the employee on leave.",
      });
      return;
    }

    // Dropping onto another person on the same date = Mutual Shift Exchange!
    if (targetPerson && targetPerson.employeeId !== payload.employeeId) {
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

  // Open Deploy Replacement Modal
  const openDeployReplacementModal = async (candidate, leaveItem, dateStr, shiftKey) => {
    setDeployCandidate(candidate || null);
    setDeployLeave(leaveItem || null);
    setDeploySlot({ date: dateStr, shift: shiftKey });
    setDeployMode("double");
    setDeployHalfDuty(false);
    setDeployReason(
      candidate
        ? `Replacement deployed for ${leaveItem?.name || "leave"} (${shiftKey}) via Drag & Drop Special Roster`
        : `Replacement deployed for ${leaveItem?.name || "leave"} (${shiftKey})`
    );
    setDeployModalOpen(true);

    // Load available candidates for date
    setDeployCandidateLoading(true);
    try {
      const { data } = await api.get("/replacement/duty-switch/options", {
        params: { date: dateStr },
      });
      setDeployCandidateOptions(Array.isArray(data) ? data : []);
    } catch {
      setDeployCandidateOptions([]);
    } finally {
      setDeployCandidateLoading(false);
    }
  };

  // Submit Deploy Replacement to Existing Replacement Feature & Database
  const handleDeploySubmit = async () => {
    if (!deployCandidate || !deployCandidate.employeeId) {
      setNotice({ severity: "error", text: "Please select a replacement candidate." });
      return;
    }
    const leaveId = deployLeave?.leaveId || deployLeave?._id || deployLeave?.id;
    if (!leaveId) {
      setNotice({ severity: "error", text: "Leave request identifier not found." });
      return;
    }

    setDeploySaving(true);
    try {
      await api.put(`/replacement/assign/${leaveId}`, {
        replacementEmployeeId: deployCandidate.employeeId,
        mode: deployMode,
        halfDuty: deployHalfDuty,
        reason: deployReason || `Replacement duty for ${deployLeave.name} (${deploySlot.shift})`,
        autoApprove: true,
      });

      setNotice({
        severity: "success",
        text: `Successfully deployed ${deployCandidate.name || deployCandidate.employeeId} as replacement for ${deployLeave.name}! C-OFF record created in database & available in ledger.`,
      });
      setDeployModalOpen(false);
      await loadMatrix();
    } catch (err) {
      setNotice({
        severity: "error",
        text: err.response?.data?.detail || "Failed to deploy replacement.",
      });
    } finally {
      setDeploySaving(false);
    }
  };

  // Release / Remove an existing replacement assignment
  const handleReleaseReplacement = async (leaveId, empName) => {
    if (!window.confirm(`Release replacement assignment for ${empName}?`)) return;
    setLoading(true);
    try {
      await api.delete(`/replacement/assign/${leaveId}`);
      setNotice({
        severity: "success",
        text: `Replacement released for ${empName}. Slot is now open for replacement.`,
      });
      await loadMatrix();
    } catch (err) {
      setNotice({
        severity: "error",
        text: err.response?.data?.detail || "Failed to release replacement.",
      });
    } finally {
      setLoading(false);
    }
  };

  // Handle drop directly on a Replacement Place Slot
  const handleDropOnReplacement = (e, leaveReq, dateStr, shiftKey) => {
    let payload = draggedItem;
    if (!payload) {
      try {
        payload = JSON.parse(e.dataTransfer.getData("text/plain"));
      } catch {
        return;
      }
    }
    if (!payload || !payload.employeeId) return;
    openDeployReplacementModal(payload, leaveReq, dateStr, shiftKey);
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

  // Run Sequential Allocation from Created Pools & Multi-Department
  const handleRunSequentialAllocation = async () => {
    if (sourcePool === "departments" && (!sourceDepartments || sourceDepartments.length === 0)) {
      setNotice({
        severity: "error",
        text: "Please select at least one source department when using Department Manpower Pools.",
      });
      return;
    }
    setSeqRunning(true);
    setSeqResults(null);
    try {
      const { data } = await api.post("/special-events/sequential-allocate", {
        startDate,
        endDate,
        eventId: selectedEventId || undefined,
        sourcePool,
        sourceDepartments,
        targetShifts: seqTargetShifts,
        maxDutiesPerPerson: Number(maxDuties) || 2,
        previewOnly: Boolean(previewOnly),
        allocationType,
        surgePerShift: Number(surgePerShift) || 1,
      });
      setSeqResults(data);
      if (!previewOnly) {
        const poolLabel = data.sourcePool === "departments"
          ? (data.sourceDepartments?.length ? data.sourceDepartments.join(", ") : "Selected Departments")
          : data.sourcePool;
        setNotice({
          severity: "success",
          text: `Sequential allocation committed! ${data.allocatedCount} duties filled from ${poolLabel}.`,
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

  // Commit or Accept Special Duty Roster for the event
  const handleCommitEventRoster = async () => {
    if (!selectedEventId) {
      setNotice({ severity: "warning", text: "Please select an event from the dropdown to accept and commit its special roster." });
      return;
    }
    const isCurrentlyCommitted = Boolean(matrixData.event?.rosterCommitted);
    const actionLabel = isCurrentlyCommitted ? "reopen for draft edits" : "accept and commit";
    const confirmed = window.confirm(
      `Do you want to ${actionLabel} the special duty roster for "${matrixData.event?.title || "this event"}"?`
    );
    if (!confirmed) return;

    try {
      const { data } = await api.put(`/special-events/${selectedEventId}/commit-roster`, {
        commit: !isCurrentlyCommitted,
      });
      setNotice({ severity: "success", text: data.message });
      await loadMatrix();
      window.dispatchEvent(new Event("crew-special-events-changed"));
    } catch (err) {
      setNotice({ severity: "error", text: err.response?.data?.detail || "Could not update roster commit status." });
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
                if (sourceDepartments.length === 0 && matrixData.departments?.length) {
                  setSourceDepartments([...matrixData.departments]);
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
              Sequential Roster Pool
            </Button>

            {selectedEventId && matrixData.event && (
              <Button
                variant={matrixData.event.rosterCommitted ? "outlined" : "contained"}
                startIcon={
                  matrixData.event.rosterCommitted ? (
                    <CheckCircle2 size={16} color="#166534" />
                  ) : (
                    <Sparkles size={16} />
                  )
                }
                onClick={handleCommitEventRoster}
                sx={{
                  bgcolor: matrixData.event.rosterCommitted ? "#F0FDF4" : "#059669",
                  color: matrixData.event.rosterCommitted ? "#166534" : "#FFF",
                  borderColor: matrixData.event.rosterCommitted ? "#86EFAC" : undefined,
                  fontWeight: 900,
                  borderRadius: 2.5,
                  textTransform: "none",
                  boxShadow: matrixData.event.rosterCommitted
                    ? "none"
                    : "0 4px 14px rgba(5, 150, 105, 0.25)",
                  "&:hover": {
                    bgcolor: matrixData.event.rosterCommitted ? "#DCFCE7" : "#047857",
                  },
                }}
              >
                {matrixData.event.rosterCommitted
                  ? "✓ Special Roster Accepted"
                  : "Accept / Commit Roster"}
              </Button>
            )}

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

        {/* DISTINCT GROUP COLOR SCHEME & INTERACTIVE FILTER BAR */}
        <Box sx={{ mt: 2, pt: 1.8, borderTop: "1px solid #E2E8F0" }}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            alignItems={{ xs: "flex-start", sm: "center" }}
            justifyContent="space-between"
            spacing={1}
            flexWrap="wrap"
          >
            <Stack direction="row" alignItems="center" spacing={0.8} flexWrap="wrap">
              <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mr: 0.5 }}>
                <Users size={14} color="#6D28D9" />
                <Typography fontSize={11.5} fontWeight={900} color="#334155">
                  Group Distinction:
                </Typography>
              </Stack>

              <Chip
                size="small"
                label="All Groups"
                onClick={() => setSelectedGroupFilter("all")}
                sx={{
                  height: 23,
                  fontSize: "0.68rem",
                  fontWeight: 900,
                  cursor: "pointer",
                  bgcolor: selectedGroupFilter === "all" ? "#1E293B" : "#F1F5F9",
                  color: selectedGroupFilter === "all" ? "#FFFFFF" : "#475569",
                  border: selectedGroupFilter === "all" ? "1px solid #0F172A" : "1px solid #E2E8F0",
                  "&:hover": { bgcolor: selectedGroupFilter === "all" ? "#0F172A" : "#E2E8F0" },
                }}
              />

              {(presentGroups.length > 0
                ? presentGroups
                : Object.keys(GROUP_COLOR_CONFIG).map((k) => ({
                    name: k,
                    count: 0,
                    style: GROUP_COLOR_CONFIG[k],
                  }))
              ).map(({ name, count, style }) => {
                const isSelected = selectedGroupFilter === name;
                return (
                  <Tooltip key={name} title={`Click to highlight all ${name} personnel across dates`}>
                    <Chip
                      size="small"
                      icon={
                        <Box
                          sx={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            bgcolor: style.dot,
                            boxShadow: `0 0 0 2px ${style.borderColor}`,
                            ml: "6px !important",
                          }}
                        />
                      }
                      label={count > 0 ? `${name} (${count})` : name}
                      onClick={() => setSelectedGroupFilter(isSelected ? "all" : name)}
                      sx={{
                        height: 23,
                        fontSize: "0.68rem",
                        fontWeight: 900,
                        cursor: "pointer",
                        bgcolor: isSelected ? style.accent : style.badgeBg,
                        color: isSelected ? "#FFFFFF" : style.badgeText,
                        border: `1.5px solid ${isSelected ? style.accent : style.badgeBorder}`,
                        boxShadow: isSelected ? `0 2px 8px ${style.accent}45` : "none",
                        transform: isSelected ? "scale(1.05)" : "none",
                        transition: "all 0.15s ease",
                        "&:hover": {
                          bgcolor: isSelected ? style.accent : style.cardBg,
                          borderColor: style.accent,
                        },
                      }}
                    />
                  </Tooltip>
                );
              })}
            </Stack>

            {selectedGroupFilter !== "all" && (
              <Button
                size="small"
                onClick={() => setSelectedGroupFilter("all")}
                sx={{
                  fontSize: 11,
                  fontWeight: 850,
                  textTransform: "none",
                  color: "#6D28D9",
                  p: 0,
                  minWidth: "auto",
                }}
              >
                Clear Group Highlight
              </Button>
            )}
          </Stack>
        </Box>
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
                                const personGroup = (person.groupName && String(person.groupName).trim()) || "General";
                                const grp = getGroupStyle(personGroup);
                                const isGroupMatch = selectedGroupFilter === "all" || selectedGroupFilter === personGroup;
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
                                        : (grp.borderColor || "#CBD5E1"),
                                      borderLeft: `4.5px solid ${person.onLeave ? "#DC2626" : grp.accent}`,
                                      bgcolor: person.onLeave
                                        ? "#FEF2F2"
                                        : person.replacementDuty
                                        ? "#F0FDF4"
                                        : (grp.cardBg || "#FFFFFF"),
                                      cursor: person.onLeave ? "default" : "grab",
                                      opacity: isCurrentDrag ? 0.35 : (!isGroupMatch ? 0.22 : 1),
                                      transform: !isGroupMatch ? "none" : (selectedGroupFilter !== "all" ? "scale(1.02)" : "none"),
                                      boxShadow: !isGroupMatch
                                        ? "none"
                                        : selectedGroupFilter !== "all"
                                        ? `0 4px 14px ${grp.accent}35`
                                        : "0 2px 6px rgba(0,0,0,0.04)",
                                      transition: "all 0.18s ease",
                                      "&:hover": {
                                        transform: person.onLeave ? "none" : "translateY(-2px)",
                                        boxShadow: `0 6px 16px ${grp.accent}30`,
                                        borderColor: grp.accent,
                                      },
                                    }}
                                  >
                                    <Stack direction="row" alignItems="flex-start" spacing={0.6}>
                                      {!person.onLeave && (
                                        <GripVertical
                                          size={13}
                                          color={grp.accent}
                                          style={{ marginTop: 2, flexShrink: 0 }}
                                        />
                                      )}
                                      <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                                        {/* Name & Group Distinction Badge */}
                                        <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={0.5}>
                                          <Typography
                                            fontSize={11.5}
                                            fontWeight={850}
                                            color={person.onLeave ? "#991B1B" : "#0F172A"}
                                            sx={{ lineHeight: 1.25 }}
                                            noWrap
                                          >
                                            {person.name}
                                          </Typography>
                                          <Tooltip title={`Group: ${personGroup}`}>
                                            <Chip
                                              size="small"
                                              label={personGroup}
                                              sx={{
                                                height: 16,
                                                fontSize: "0.60rem",
                                                fontWeight: 900,
                                                bgcolor: grp.badgeBg,
                                                color: grp.badgeText,
                                                border: `1px solid ${grp.badgeBorder}`,
                                                borderRadius: "4px",
                                                flexShrink: 0,
                                                px: 0.1,
                                                "& .MuiChip-label": { px: 0.5 },
                                              }}
                                            />
                                          </Tooltip>
                                        </Stack>

                                        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.3 }} flexWrap="wrap">
                                          <Typography fontSize={10} color="#64748B" fontWeight={750}>
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

                                        {/* Direct Cover Action for Leave Card */}
                                        {person.onLeave && (
                                          <Box sx={{ mt: 0.8, pt: 0.6, borderTop: "1px dashed #FECACA" }}>
                                            {person.replacementAssigned ? (
                                              <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={0.5}>
                                                <Stack direction="row" alignItems="center" spacing={0.4} sx={{ minWidth: 0 }}>
                                                  <Award size={12} color="#16A34A" />
                                                  <Typography fontSize={10} color="#166534" fontWeight={850} noWrap>
                                                    Cover: {person.replacement?.name || "Assigned"}
                                                  </Typography>
                                                </Stack>
                                                <Tooltip title="Release replacement">
                                                  <IconButton
                                                    size="small"
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      handleReleaseReplacement(person.leaveId, person.name);
                                                    }}
                                                    sx={{ p: 0.2, color: "#991B1B", "&:hover": { bgcolor: "#FEE2E2" } }}
                                                  >
                                                    <Trash2 size={11} />
                                                  </IconButton>
                                                </Tooltip>
                                              </Stack>
                                            ) : (
                                              <Button
                                                size="small"
                                                startIcon={<UserCheck size={11} />}
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  openDeployReplacementModal(null, person, dateStr, person.assignedDuty || "Morning");
                                                }}
                                                sx={{
                                                  fontSize: "0.64rem",
                                                  py: 0.1,
                                                  px: 0.6,
                                                  minHeight: 0,
                                                  bgcolor: "#FEF3C7",
                                                  color: "#92400E",
                                                  border: "1px solid #FCD34D",
                                                  borderRadius: 1,
                                                  fontWeight: 850,
                                                  textTransform: "none",
                                                  width: "100%",
                                                  "&:hover": { bgcolor: "#FDE68A" },
                                                }}
                                              >
                                                + Drop or Assign Cover
                                              </Button>
                                            )}
                                          </Box>
                                        )}
                                      </Box>
                                    </Stack>
                                  </Paper>
                                );
                              })}

                              {/* Replacement Place & Covered Slots for Shift Cells */}
                              {shiftKey !== "Leave" && shiftKey !== "Off" && (() => {
                                const shiftLeaves = (matrixData.grid?.[dateStr]?.["Leave"] || []).filter((l) => {
                                  const d = (l.assignedDuty || "Morning").toLowerCase();
                                  const sk = shiftKey.toLowerCase();
                                  return d === sk || (sk === "morning" && !["evening", "night", "general"].includes(d));
                                });

                                return shiftLeaves.map((l) => {
                                  if (l.replacementAssigned) {
                                    return (
                                      <Paper
                                        key={`cov-${l.leaveId || l.employeeId}`}
                                        elevation={0}
                                        sx={{
                                          p: 0.8,
                                          borderRadius: 1.5,
                                          border: "1px solid #86EFAC",
                                          borderLeft: "3.5px solid #16A34A",
                                          bgcolor: "#F0FDF4",
                                        }}
                                      >
                                        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={0.5}>
                                          <Stack direction="row" alignItems="center" spacing={0.5} sx={{ minWidth: 0 }}>
                                            <Award size={13} color="#16A34A" />
                                            <Box sx={{ minWidth: 0 }}>
                                              <Typography fontSize={11} fontWeight={850} color="#166534" noWrap>
                                                Cover: {l.replacement?.name || "Assigned"}
                                              </Typography>
                                              <Typography fontSize={9} color="#15803D" fontWeight={700} noWrap>
                                                For {l.name} · C-OFF Credited
                                              </Typography>
                                            </Box>
                                          </Stack>
                                          <Tooltip title="Release Replacement">
                                            <IconButton
                                              size="small"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleReleaseReplacement(l.leaveId, l.name);
                                              }}
                                              sx={{
                                                p: 0.3,
                                                color: "#991B1B",
                                                bgcolor: "#FEE2E2",
                                                "&:hover": { bgcolor: "#FECACA" },
                                              }}
                                            >
                                              <Trash2 size={11} />
                                            </IconButton>
                                          </Tooltip>
                                        </Stack>
                                      </Paper>
                                    );
                                  }

                                  return (
                                    <Paper
                                      key={`slot-${l.leaveId || l.employeeId}`}
                                      elevation={0}
                                      onDragOver={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                      }}
                                      onDrop={(e) => {
                                        e.stopPropagation();
                                        handleDropOnReplacement(e, l, dateStr, shiftKey);
                                      }}
                                      onClick={() => openDeployReplacementModal(null, l, dateStr, shiftKey)}
                                      sx={{
                                        p: 0.9,
                                        borderRadius: 2,
                                        border: "2px dashed #F59E0B",
                                        bgcolor: "#FFFBEB",
                                        cursor: "pointer",
                                        transition: "all 0.18s ease",
                                        "&:hover": {
                                          bgcolor: "#FEF3C7",
                                          borderColor: "#D97706",
                                          transform: "translateY(-1px)",
                                          boxShadow: "0 3px 10px rgba(245, 158, 11, 0.25)",
                                        },
                                      }}
                                    >
                                      <Stack spacing={0.3}>
                                        <Stack direction="row" alignItems="center" justifyContent="space-between">
                                          <Stack direction="row" alignItems="center" spacing={0.5}>
                                            <AlertCircle size={13} color="#D97706" />
                                            <Typography fontSize={11} fontWeight={900} color="#92400E">
                                              Replacement Place
                                            </Typography>
                                          </Stack>
                                          <Chip
                                            size="small"
                                            label="DROP HERE"
                                            sx={{
                                              height: 16,
                                              fontSize: "0.58rem",
                                              fontWeight: 900,
                                              bgcolor: "#FDE68A",
                                              color: "#78350F",
                                            }}
                                          />
                                        </Stack>
                                        <Typography fontSize={10} color="#B45309" fontWeight={750} noWrap>
                                          Need cover for {l.name} ({l.leaveType || "Leave"})
                                        </Typography>
                                        <Stack direction="row" alignItems="center" spacing={0.4} sx={{ mt: 0.1 }}>
                                          <Award size={11} color="#B45309" />
                                          <Typography fontSize={9} color="#92400E" fontWeight={700}>
                                            Drop candidate → Awards C-OFF in DB
                                          </Typography>
                                        </Stack>
                                      </Stack>
                                    </Paper>
                                  );
                                });
                              })()}

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
              renderOption={(props, option) => {
                const optGroup = (option.groupName && String(option.groupName).trim()) || "General";
                const optGrp = getGroupStyle(optGroup);
                return (
                  <Box component="li" {...props} key={option.employeeId}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ width: "100%", py: 0.3 }}>
                      <Box>
                        <Typography fontSize={13} fontWeight={800} color="#0F172A">
                          {option.name || option.employeeId}
                        </Typography>
                        <Typography fontSize={11} color="#64748B">
                          ID: {option.employeeId} · Current: {option.assignedDuty || "Duty"}
                        </Typography>
                      </Box>
                      <Chip
                        size="small"
                        label={optGroup}
                        sx={{
                          height: 18,
                          fontSize: "0.64rem",
                          fontWeight: 900,
                          bgcolor: optGrp.badgeBg,
                          color: optGrp.badgeText,
                          border: `1px solid ${optGrp.badgeBorder}`,
                          borderRadius: "4px",
                        }}
                      />
                    </Stack>
                  </Box>
                );
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

      {/* SEQUENTIAL POOL & MULTI-DEPARTMENT ROSTER ALLOCATION MODAL */}
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
            <Wand2 size={22} color="#6D28D9" />
            <Box>
              <Typography fontWeight={900} fontSize={18} color="#1E1B4B">
                Sequential Manpower Roster from Other Department / Pool
              </Typography>
              <Typography variant="body2" color="#64748B">
                Round-robin sequential allocation from created roster pools with multi-department selection.
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

            {/* Pool, Department & Configuration Form */}
            <Paper elevation={0} sx={{ p: 2.5, borderRadius: 2.5, bgcolor: "#FFFFFF", border: "1px solid #E2E8F0" }}>
              <Grid container spacing={2.5}>
                {/* 1. Created Sequential Roster Pool Selector */}
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth size="small">
                    <InputLabel id="seq-source-pool-label">Created Sequential Pool Source</InputLabel>
                    <Select
                      labelId="seq-source-pool-label"
                      label="Created Sequential Pool Source"
                      value={sourcePool}
                      onChange={(e) => setSourcePool(e.target.value)}
                    >
                      {(matrixData.sequentialPools || [
                        { id: "all_pools", name: "All Created Sequential Pools (SIC & Shift Engineers)" },
                        { id: "sic", name: "SIC Pool (Shift-In-Charge Roster)" },
                        { id: "shift_engineer", name: "Shift Engineer Pool" },
                        { id: "departments", name: "Department Manpower Pools" },
                      ]).map((pool) => (
                        <MenuItem key={pool.id} value={pool.id}>
                          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ width: "100%" }}>
                            <Typography fontSize={13.5} fontWeight={700}>
                              {pool.name}
                            </Typography>
                            {pool.count > 0 && (
                              <Chip
                                size="small"
                                label={`${pool.count} members`}
                                sx={{ fontSize: 11, height: 20, bgcolor: "#EDE9FE", color: "#6D28D9", fontWeight: 800 }}
                              />
                            )}
                          </Stack>
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>

                {/* 2. Source Departments: ALWAYS MULTI-SELECT */}
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth size="small">
                    <InputLabel id="seq-source-depts-label">Source Departments (Multi-Select Always)</InputLabel>
                    <Select
                      labelId="seq-source-depts-label"
                      label="Source Departments (Multi-Select Always)"
                      multiple
                      value={sourceDepartments}
                      onChange={(e) => {
                        const v = e.target.value;
                        setSourceDepartments(typeof v === "string" ? v.split(",") : v);
                      }}
                      renderValue={(selected) => {
                        const totalAvailable = (matrixData.departments || []).length;
                        if (selected.length === 0) {
                          return <span style={{ color: "#94A3B8" }}>All Departments (No filter)</span>;
                        }
                        if (selected.length === totalAvailable && totalAvailable > 1) {
                          return `All Departments (${selected.length})`;
                        }
                        return selected.join(", ");
                      }}
                    >
                      {(matrixData.departments || []).map((dept) => (
                        <MenuItem key={dept} value={dept}>
                          <Checkbox checked={sourceDepartments.includes(dept)} size="small" />
                          <ListItemText primary={dept} primaryTypographyProps={{ fontSize: 13, fontWeight: 600 }} />
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  {/* Multi-Department Action Controls */}
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.8 }}>
                    <Button
                      size="small"
                      onClick={() => setSourceDepartments([...(matrixData.departments || [])])}
                      sx={{ fontSize: 11, p: "1px 6px", minWidth: 0, textTransform: "none", fontWeight: 700 }}
                    >
                      Select All
                    </Button>
                    <Typography color="#CBD5E1">|</Typography>
                    <Button
                      size="small"
                      onClick={() => setSourceDepartments([])}
                      sx={{ fontSize: 11, p: "1px 6px", minWidth: 0, textTransform: "none", fontWeight: 700, color: "#64748B" }}
                    >
                      Clear
                    </Button>
                    <Typography variant="caption" color="#94A3B8" sx={{ ml: "auto" }}>
                      {sourceDepartments.length} of {(matrixData.departments || []).length} depts selected
                    </Typography>
                  </Stack>
                </Grid>

                {/* Quick Department Toggle Chips */}
                {(matrixData.departments || []).length > 0 && (
                  <Grid item xs={12}>
                    <Box sx={{ p: 1.2, borderRadius: 2, bgcolor: "#F8FAFC", border: "1px dashed #CBD5E1" }}>
                      <Typography fontSize={11.5} fontWeight={750} color="#475569" sx={{ mb: 0.8 }}>
                        Quick Department Selector:
                      </Typography>
                      <Stack direction="row" spacing={0.8} flexWrap="wrap" useFlexGap>
                        {(matrixData.departments || []).map((dept) => {
                          const isSelected = sourceDepartments.includes(dept);
                          return (
                            <Chip
                              key={dept}
                              size="small"
                              label={dept}
                              clickable
                              onClick={() => {
                                setSourceDepartments((prev) =>
                                  isSelected ? prev.filter((d) => d !== dept) : [...prev, dept]
                                );
                              }}
                              sx={{
                                fontWeight: 750,
                                fontSize: 11.5,
                                bgcolor: isSelected ? "#EDE9FE" : "#FFFFFF",
                                color: isSelected ? "#6D28D9" : "#64748B",
                                border: isSelected ? "1.5px solid #A78BFA" : "1px solid #E2E8F0",
                                "&:hover": {
                                  bgcolor: isSelected ? "#DDD6FE" : "#F1F5F9",
                                },
                              }}
                            />
                          );
                        })}
                      </Stack>
                    </Box>
                  </Grid>
                )}

                {/* 3. Allocation Target */}
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth size="small">
                    <InputLabel id="seq-allocation-type-label">Allocation Target</InputLabel>
                    <Select
                      labelId="seq-allocation-type-label"
                      label="Allocation Target"
                      value={allocationType}
                      onChange={(e) => setAllocationType(e.target.value)}
                    >
                      <MenuItem value="both">
                        🔄 Auto-Fill (Leave Replacements + Surge Strength)
                      </MenuItem>
                      <MenuItem value="leave">
                        📋 Leave Replacements Only (Marked by SIC/DIC)
                      </MenuItem>
                      <MenuItem value="surge">
                        ⚡ Surge Manpower Only (Extra coverage per shift)
                      </MenuItem>
                    </Select>
                  </FormControl>
                </Grid>

                {/* 4. Surge per Shift */}
                <Grid item xs={12} sm={6}>
                  <TextField
                    type="number"
                    size="small"
                    label="Surge Strength per Shift"
                    fullWidth
                    value={surgePerShift}
                    onChange={(e) => setSurgePerShift(Math.max(1, Number(e.target.value) || 1))}
                    disabled={allocationType === "leave"}
                    helperText={
                      allocationType === "leave"
                        ? "Only applies when allocating surge coverage"
                        : "Number of additional staff assigned per shift"
                    }
                  />
                </Grid>

                {/* 5. Max Duties per Person */}
                <Grid item xs={12} sm={4}>
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

                {/* 6. Target Shifts */}
                <Grid item xs={12} sm={4}>
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

                {/* 7. Execution Mode */}
                <Grid item xs={12} sm={4}>
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
                  <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" spacing={1}>
                    <Box>
                      <Typography fontWeight={900} fontSize={14} color="#1E293B">
                        Allocation Results · {seqResults.allocatedCount} of {seqResults.totalRequirements} Allocated
                      </Typography>
                      <Typography variant="caption" color="#64748B">
                        Source Pool: <b>{seqResults.sourcePool || sourcePool}</b> | Departments:{" "}
                        <b>
                          {(seqResults.sourceDepartments || sourceDepartments).length > 0
                            ? (seqResults.sourceDepartments || sourceDepartments).join(", ")
                            : "All Departments"}
                        </b>
                      </Typography>
                    </Box>
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                      <Chip
                        size="small"
                        label={seqResults.previewOnly ? "Simulation Preview" : "Committed to Live Roster"}
                        sx={{
                          bgcolor: seqResults.previewOnly ? "#FEF3C7" : "#DCFCE7",
                          color: seqResults.previewOnly ? "#B45309" : "#166534",
                          fontWeight: 800,
                        }}
                      />
                      {seqResults.previewOnly && seqResults.allocatedCount > 0 && (
                        <Button
                          size="small"
                          variant="contained"
                          disabled={seqRunning}
                          onClick={async () => {
                            setPreviewOnly(false);
                            setSeqRunning(true);
                            try {
                              const { data } = await api.post("/special-events/sequential-allocate", {
                                startDate,
                                endDate,
                                eventId: selectedEventId || undefined,
                                sourcePool,
                                sourceDepartments,
                                targetShifts: seqTargetShifts,
                                maxDutiesPerPerson: Number(maxDuties) || 2,
                                previewOnly: false,
                                allocationType,
                                surgePerShift: Number(surgePerShift) || 1,
                              });
                              setSeqResults(data);
                              setNotice({
                                severity: "success",
                                text: `Sequential allocation committed! ${data.allocatedCount} duties confirmed.`,
                              });
                              await loadMatrix();
                            } catch (err) {
                              setNotice({
                                severity: "error",
                                text: err.response?.data?.detail || "Commit failed.",
                              });
                            } finally {
                              setSeqRunning(false);
                            }
                          }}
                          sx={{
                            bgcolor: "#059669 !important",
                            color: "#FFF",
                            fontWeight: 850,
                            fontSize: 11.5,
                            textTransform: "none",
                            borderRadius: 1.8,
                            py: 0.4,
                          }}
                        >
                          ⚡ Accept & Commit to Live Roster
                        </Button>
                      )}
                    </Stack>
                  </Stack>
                </Box>

                {seqResults.allocations?.length > 0 ? (
                  <Table size="small">
                    <TableHead sx={{ bgcolor: "#F1F5F9" }}>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 900 }}>Date</TableCell>
                        <TableCell sx={{ fontWeight: 900 }}>Shift</TableCell>
                        <TableCell sx={{ fontWeight: 900 }}>Slot Type</TableCell>
                        <TableCell sx={{ fontWeight: 900 }}>Target / Replaced</TableCell>
                        <TableCell sx={{ fontWeight: 900 }}>Allocated Person</TableCell>
                        <TableCell sx={{ fontWeight: 900 }}>Group</TableCell>
                        <TableCell sx={{ fontWeight: 900 }}>Status</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {seqResults.allocations.map((a, idx) => {
                        const allocGrp = (a.allocatedGroupName && String(a.allocatedGroupName).trim()) || "General";
                        const grp = getGroupStyle(allocGrp);

                        return (
                          <TableRow key={idx} hover>
                            <TableCell sx={{ fontWeight: 800 }}>{a.date}</TableCell>
                            <TableCell>
                              <Chip size="small" label={a.shift} sx={{ fontWeight: 800 }} />
                            </TableCell>
                            <TableCell>
                              <Chip
                                size="small"
                                variant="outlined"
                                label={a.slotType || "Replacement"}
                                sx={{
                                  fontWeight: 750,
                                  fontSize: 11,
                                  borderColor: a.slotType === "Surge Coverage" ? "#93C5FD" : "#FDE68A",
                                  color: a.slotType === "Surge Coverage" ? "#1D4ED8" : "#B45309",
                                }}
                              />
                            </TableCell>
                            <TableCell>{a.replacedEmployee}</TableCell>
                            <TableCell sx={{ fontWeight: 850, color: "#6D28D9" }}>
                              {a.allocatedEmployeeName} ({a.allocatedEmployeeId})
                              {a.allocatedDesignation && (
                                <Typography variant="caption" display="block" color="#64748B">
                                  {a.allocatedDesignation}
                                </Typography>
                              )}
                            </TableCell>
                            <TableCell>
                              <Chip
                                size="small"
                                label={allocGrp}
                                sx={{
                                  height: 19,
                                  fontSize: "0.68rem",
                                  fontWeight: 900,
                                  bgcolor: grp.badgeBg,
                                  color: grp.badgeText,
                                  border: `1px solid ${grp.badgeBorder}`,
                                  borderRadius: "4px",
                                }}
                              />
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
                        );
                      })}
                    </TableBody>
                  </Table>
                ) : (
                  <Box sx={{ p: 3, textAlign: "center", color: "#64748B" }}>
                    No slots were allocated. Check if replacement requirements exist or surge strength is enabled.
                  </Box>
                )}

                {seqResults.unallocatedSlots?.length > 0 && (
                  <Box sx={{ p: 1.5, bgcolor: "#FFFBEB", borderTop: "1px solid #FEF3C7" }}>
                    <Typography fontSize={12} color="#92400E" fontWeight={750}>
                      ⚠️ {seqResults.unallocatedSlots.length} slot(s) could not be allocated: candidate pool exhausted or staff already on duty.
                    </Typography>
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
            disabled={seqRunning || (sourcePool === "departments" && sourceDepartments.length === 0)}
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

      {/* DEPLOY REPLACEMENT & RECORD C-OFF DIALOG */}
      <Dialog
        open={deployModalOpen}
        onClose={() => !deploySaving && setDeployModalOpen(false)}
        fullWidth
        maxWidth="sm"
        slotProps={{
          paper: { sx: { borderRadius: "22px !important", p: 1, background: "#FAF9FF !important" } },
        }}
      >
        <DialogTitle sx={{ fontWeight: 900, pb: 1 }}>
          <Stack direction="row" alignItems="center" spacing={1.2}>
            <Box
              sx={{
                width: 38,
                height: 38,
                borderRadius: "10px",
                bgcolor: "#EDE9FE",
                color: "#6D28D9",
                display: "grid",
                placeItems: "center",
              }}
            >
              <Sparkles size={20} />
            </Box>
            <Box>
              <Typography fontWeight={900} fontSize={17} color="#1E1B4B">
                Deploy Replacement & Credit C-OFF
              </Typography>
              <Typography variant="body2" color="#64748B">
                Integrated with Replacement Module · Records C-OFF in database for employee to avail
              </Typography>
            </Box>
          </Stack>
        </DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {/* 1. Target Replaced Person / Leave Info */}
            <Paper
              variant="outlined"
              sx={{
                p: 1.8,
                borderRadius: 3,
                bgcolor: "#FFFBEB",
                borderColor: "#FDE68A",
              }}
            >
              <Stack spacing={1}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography fontSize={11} fontWeight={900} color="#B45309" sx={{ letterSpacing: 0.5 }}>
                    LEAVE DUTY TO BE REPLACED
                  </Typography>
                  <Chip
                    size="small"
                    label={deploySlot.shift}
                    sx={{ fontWeight: 900, bgcolor: "#FEF3C7", color: "#92400E" }}
                  />
                </Stack>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                  <Box>
                    <Typography fontSize={14.5} fontWeight={900} color="#0F172A">
                      {deployLeave?.name || "Leave Applicant"}
                    </Typography>
                    <Typography fontSize={12} color="#64748B" fontWeight={700}>
                      ID: {deployLeave?.employeeId} · {deployLeave?.designation || "Staff"}
                    </Typography>
                  </Box>
                  <Box sx={{ textAlign: "right" }}>
                    <Chip
                      size="small"
                      label={deployLeave?.leaveType || "Leave"}
                      sx={{ bgcolor: "#FEE2E2", color: "#991B1B", fontWeight: 800 }}
                    />
                    <Typography fontSize={11} color="#64748B" sx={{ mt: 0.4 }}>
                      Date: {deploySlot.date}
                    </Typography>
                  </Box>
                </Stack>
              </Stack>
            </Paper>

            {/* 2. Replacement Candidate Selector */}
            <Paper
              variant="outlined"
              sx={{
                p: 1.8,
                borderRadius: 3,
                bgcolor: "#FFFFFF",
                borderColor: "#E2E8F0",
              }}
            >
              <Stack spacing={1.5}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography fontSize={11} fontWeight={900} color="#475569" sx={{ letterSpacing: 0.5 }}>
                    REPLACEMENT CANDIDATE (DEPLOYED PERSON)
                  </Typography>
                  {deployCandidate && (
                    <Chip
                      size="small"
                      label="Dragged Candidate"
                      sx={{ fontWeight: 850, bgcolor: "#EDE9FE", color: "#6D28D9" }}
                    />
                  )}
                </Stack>

                {deployCandidate ? (
                  <Box sx={{ p: 1.2, bgcolor: "#F8FAFC", borderRadius: 2, border: "1px solid #E2E8F0" }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Box>
                        <Typography fontSize={14} fontWeight={900} color="#0F172A">
                          {deployCandidate.name || deployCandidate.employeeId}
                        </Typography>
                        <Typography fontSize={11.5} color="#64748B">
                          ID: {deployCandidate.employeeId} · Current: {deployCandidate.sourceDuty || "Off / Rest Pool"}
                        </Typography>
                      </Box>
                      <Button
                        size="small"
                        onClick={() => setDeployCandidate(null)}
                        sx={{ fontSize: 11, textTransform: "none", color: "#6D28D9", fontWeight: 800 }}
                      >
                        Change Candidate
                      </Button>
                    </Stack>
                  </Box>
                ) : (
                  <Autocomplete
                    options={deployCandidateOptions}
                    loading={deployCandidateLoading}
                    getOptionLabel={(opt) =>
                      typeof opt === "string"
                        ? opt
                        : `${opt.name || opt.employeeId} (${opt.employeeId}) · ${opt.assignedDuty || "Duty"}`
                    }
                    onChange={(e, val) => {
                      if (val) {
                        setDeployCandidate({
                          employeeId: val.employeeId,
                          name: val.name,
                          designation: val.designation,
                          sourceDuty: val.assignedDuty,
                          groupName: val.groupName,
                        });
                      }
                    }}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        size="small"
                        label="Select from Available Candidates on this Date"
                        placeholder="Search employee name or ID"
                      />
                    )}
                  />
                )}
              </Stack>
            </Paper>

            {/* 3. C-OFF Database Creation & Policy Guarantee */}
            <Paper
              variant="outlined"
              sx={{
                p: 1.8,
                borderRadius: 3,
                bgcolor: "#F0FDF4",
                borderColor: "#BBF7D0",
              }}
            >
              <Stack spacing={1}>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <CheckCircle2 size={16} color="#16A34A" />
                  <Typography fontSize={12} fontWeight={900} color="#15803D">
                    C-OFF DATABASE RECORD BUILDING
                  </Typography>
                </Stack>
                <Typography fontSize={11.5} color="#166534" sx={{ lineHeight: 1.5 }}>
                  Deploying this replacement creates an official credit in <strong>compensatory_off_collection</strong> with 1-year validity. The employee will immediately see this credit in their <strong>C-OFF Ledger</strong> and can avail it in Leave Management.
                </Typography>
                <FormControl size="small" sx={{ mt: 0.5 }}>
                  <InputLabel>Replacement Mode</InputLabel>
                  <Select
                    value={deployMode}
                    label="Replacement Mode"
                    onChange={(e) => setDeployMode(e.target.value)}
                    sx={{ bgcolor: "#FFFFFF", borderRadius: 2 }}
                  >
                    <MenuItem value="double" sx={{ fontWeight: 800 }}>
                      ⭐ Double Duty / Rest Day (Awards 1 C-OFF Credit in Database)
                    </MenuItem>
                    <MenuItem value="normal">
                      Normal Duty Coverage
                    </MenuItem>
                  </Select>
                </FormControl>
              </Stack>
            </Paper>

            {/* 4. Notes & Details */}
            <TextField
              size="small"
              label="Reason / Notes"
              fullWidth
              value={deployReason}
              onChange={(e) => setDeployReason(e.target.value)}
            />
          </Stack>
        </DialogContent>

        <DialogActions sx={{ p: 2, bgcolor: "#FFFFFF" }}>
          <Button disabled={deploySaving} onClick={() => setDeployModalOpen(false)} sx={{ fontWeight: 700 }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={deploySaving || !deployCandidate?.employeeId}
            onClick={handleDeploySubmit}
            sx={{
              bgcolor: "#059669 !important",
              color: "#FFF",
              fontWeight: 900,
              textTransform: "none",
              borderRadius: 2,
              px: 2.5,
              py: 0.8,
              boxShadow: "0 4px 14px rgba(5, 150, 105, 0.35)",
            }}
          >
            {deploySaving ? <CircularProgress size={18} color="inherit" /> : "Deploy Replacement & Create C-OFF"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
