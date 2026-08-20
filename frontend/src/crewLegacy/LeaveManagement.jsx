import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import dayjs from "dayjs";
import DatePicker from "react-multi-date-picker";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
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
import { CalendarDays, CheckCircle2, GraduationCap, GripVertical, RefreshCw, Send, ShieldCheck, User } from "lucide-react";
import api from "./api";
import DutyReassignmentPanel from "../components/crew/DutyReassignmentPanel";

const employeeIdOf = (employee) => String(employee?.employeeId || employee?.userId || "").trim();
const statusColor = (status) => ({
  Approved: "success",
  Forwarded: "info",
  Rejected: "error",
  Withdrawn: "default",
  Cancelled: "default",
  Applied: "warning",
  Pending: "warning",
}[status] || "default");

const compactDutyStyle = (duty = {}) => {
  const leave = String(duty.leaveStatus || "").toLowerCase();
  const shift = String(duty.shift || "").toUpperCase();
  if (leave && !["rejected", "cancelled", "canceled", "withdrawn"].includes(leave)) return { bg: "#FDE8EC", color: "#C62828", border: "#F3A8B3" };
  if (duty.trainingName || shift.includes("TRAINING") || shift.includes("TOUR")) return { bg: "#F0E7FA", color: "#6A1B9A", border: "#CDB4EA" };
  if (["MORNING", "M1", "M2"].includes(shift)) return { bg: "#E7F6E9", color: "#000", border: "#A9DDB2" };
  if (["EVENING", "E1", "E2"].includes(shift)) return { bg: "#FFF4CC", color: "#000", border: "#E8D184" };
  if (["NIGHT", "N1", "N2"].includes(shift)) return { bg: "#E4F2FF", color: "#000", border: "#A7CFEF" };
  if (["OFF", "O1", "O2"].includes(shift)) return { bg: "#ECEFF3", color: "#000", border: "#C9D0D9" };
  return { bg: "#F8FAFC", color: "#000", border: "#D6DEE8" };
};

function StatusChip({ value }) {
  return <Chip size="small" label={value === "Forwarded" ? "Approved & Forwarded" : value || "Pending"} color={statusColor(value)} variant="outlined" sx={{ fontWeight: 800 }} />;
}

function ReplacementFlag({ required, assigned, title }) {
  if (!required && !assigned) return null;
  const green = Boolean(assigned);
  return (
    <Tooltip title={title || (green ? "Replacement assigned" : "Replacement required and awaiting assignment")} arrow>
      <Box sx={{
        width: 22, height: 22, borderRadius: .9, display: "grid", placeItems: "center",
        color: "#FFFFFF", background: green ? "#15803D" : "#D97706", fontSize: 10, fontWeight: 950,
        boxShadow: green ? "0 0 0 3px #DCFCE7" : "0 0 0 3px #FEF3C7",
        animation: green ? "none" : "replacementPulse 1.05s ease-in-out infinite",
        "@keyframes replacementPulse": { "0%,100%": { opacity: 1, transform: "scale(1)" }, "50%": { opacity: .42, transform: "scale(.86)" } },
      }}>R</Box>
    </Tooltip>
  );
}

function SectionTitle({ icon: Icon, title, subtitle, count }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1.2, mb: 1.5 }}>
      <Box sx={{ width: 34, height: 34, borderRadius: 2, display: "grid", placeItems: "center", color: "#0057B7", background: "#E8F1FB" }}><Icon size={18} /></Box>
      <Box sx={{ flex: 1 }}>
        <Typography sx={{ fontSize: 16, fontWeight: 900, color: "#0F172A" }}>{title}</Typography>
        {subtitle && <Typography sx={{ fontSize: 11.5, color: "#64748B", fontWeight: 650 }}>{subtitle}</Typography>}
      </Box>
      {count !== undefined && <Chip label={count} size="small" sx={{ fontWeight: 900, color: "#0057B7", background: "#E8F1FB" }} />}
    </Box>
  );
}

export default function LeaveManagement() {
  const [employees, setEmployees] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [dateRange, setDateRange] = useState([]);
  const [rows, setRows] = useState([]);
  const [compOffs, setCompOffs] = useState([]);
  const [reason, setReason] = useState("");
  const [role, setRole] = useState({});
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState(null);
  const dragFill = useRef(null);
  const [selectedWorkflowIds, setSelectedWorkflowIds] = useState([]);
  const [replacementChoices, setReplacementChoices] = useState({});
  const [completedFrom, setCompletedFrom] = useState(dayjs().subtract(1, "day").format("YYYY-MM-DD"));
  const [completedTo, setCompletedTo] = useState("");
  const [workflowView, setWorkflowView] = useState(() => new URLSearchParams(window.location.search).get("view") === "calendar" ? "calendar" : "table");
  const [approvalRoster, setApprovalRoster] = useState([]);
  const [approvalDates, setApprovalDates] = useState([]);
  const [approvalFrom, setApprovalFrom] = useState(() => new URLSearchParams(window.location.search).get("from") || "");
  const [approvalTo, setApprovalTo] = useState(() => new URLSearchParams(window.location.search).get("to") || "");
  const [approvalCalendarLoading, setApprovalCalendarLoading] = useState(false);
  const [approvalCalendarError, setApprovalCalendarError] = useState("");
  const [approvalDepartment, setApprovalDepartment] = useState("");
  const [rejectDialog, setRejectDialog] = useState({ open: false, stage: "sic", leaves: [] });
  const [rejectComment, setRejectComment] = useState("");
  const [activeSection, setActiveSection] = useState(null);
  const [approvedTraining, setApprovedTraining] = useState([]);
  const [pendingTrainingApprovals, setPendingTrainingApprovals] = useState([]);
  const [selectedTrainingApprovalIds, setSelectedTrainingApprovalIds] = useState([]);
  const [trainingOffChoices, setTrainingOffChoices] = useState({});
  const [expandedTrainingApprovalId, setExpandedTrainingApprovalId] = useState("");

  const openSection = (section) => {
    setActiveSection(section);
    window.setTimeout(() => {
      document.getElementById(`leave-workspace-${section}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 180);
  };

  const loadLeaves = async () => {
    const { data } = await api.get("/leave/list", {
      params: { completedFrom: completedFrom || undefined, completedTo: completedTo || undefined },
    });
    setLeaves(data || []);
  };

  const loadPage = async () => {
    setLoading(true);
    try {
      const [employeeResult, typeResult, roleResult, leaveResult] = await Promise.all([
        api.get("/leave/employees"),
        api.get("/leave/leave-types"),
        api.get("/leave/my-role"),
        api.get("/leave/list", { params: { completedFrom, completedTo: completedTo || undefined } }),
      ]);
      const people = employeeResult.data || [];
      const currentId = roleResult.data?.employeeId;
      setEmployees(people);
      setLeaveTypes(typeResult.data || []);
      setRole(roleResult.data || {});
      setLeaves(leaveResult.data || []);
      setSelectedEmployee((current) => current || people.find((item) => employeeIdOf(item) === currentId) || people[0] || null);
    } catch (error) {
      setNotice({ severity: "error", text: error.response?.data?.detail || "Unable to load leave management." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadPage(); }, []);
  const loadApprovedTraining = async () => {
    try {
      const { data } = await api.get("/training-assign/my-approved");
      setApprovedTraining(data || []);
    } catch (error) {
      setApprovedTraining([]);
    }
  };
  const loadPendingTrainingApprovals = async () => {
    try {
      const { data } = await api.get("/training-assign/pending");
      const approvable = (data || []).filter((item) => item.canApprove);
      setPendingTrainingApprovals(approvable);
      setSelectedTrainingApprovalIds((current) => current.filter((id) => approvable.some((item) => item.id === id)));
    } catch (error) {
      setPendingTrainingApprovals([]);
    }
  };
  useEffect(() => {
    loadApprovedTraining();
    loadPendingTrainingApprovals();
  }, []);
  useEffect(() => {
    const stopDrag = () => { dragFill.current = null; };
    window.addEventListener("pointerup", stopDrag);
    return () => window.removeEventListener("pointerup", stopDrag);
  }, []);

  useEffect(() => {
    const targetId = employeeIdOf(selectedEmployee);
    if (!targetId) { setCompOffs([]); return; }
    api.get("/leave/comp-off/available", { params: { employeeId: targetId } })
      .then(({ data }) => setCompOffs(data || []))
      .catch(() => setCompOffs([]));
  }, [selectedEmployee]);

  const fetchDuty = async () => {
    if (!selectedEmployee || dateRange.length !== 2) {
      setNotice({ severity: "warning", text: "Select an employee and one continuous date range." });
      return;
    }
    const startDate = dayjs(dateRange[0].toDate()).format("YYYY-MM-DD");
    const endDate = dayjs(dateRange[1].toDate()).format("YYYY-MM-DD");
    setWorking(true);
    try {
      const { data } = await api.get("/leave/duty-detailed", { params: { employeeId: employeeIdOf(selectedEmployee), startDate, endDate } });
      setRows((data || []).map((row) => ({ ...row, selected: true, leaveType: "", compOffId: "" })));
      if (!data?.length) setNotice({ severity: "warning", text: "No roster or General duty rows exist in this range." });
    } catch (error) {
      setNotice({ severity: "error", text: error.response?.data?.detail || "Duty could not be loaded." });
    } finally {
      setWorking(false);
    }
  };

  const updateRow = (index, patch) => setRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
  const setLeaveType = (index, leaveType) => updateRow(index, { leaveType, compOffId: leaveType === "C-OFF" ? rows[index]?.compOffId || "" : "", selected: true });

  const startFill = (event, index) => {
    const leaveType = rows[index]?.leaveType;
    if (!leaveType || leaveType === "C-OFF") return;
    event.preventDefault();
    dragFill.current = { leaveType };
    updateRow(index, { selected: true });
  };
  const continueFill = (index) => {
    if (!dragFill.current) return;
    updateRow(index, { leaveType: dragFill.current.leaveType, compOffId: "", selected: true });
  };

  const submit = async () => {
    const selectedRows = rows.filter((row) => row.selected);
    if (!selectedRows.length) return setNotice({ severity: "warning", text: "Select at least one duty row." });
    const missingType = selectedRows.find((row) => !row.leaveType);
    if (missingType) return setNotice({ severity: "warning", text: `Select a leave type for ${missingType.date}.` });
    const missingCompOff = selectedRows.find((row) => row.leaveType === "C-OFF" && !row.compOffId);
    if (missingCompOff) return setNotice({ severity: "warning", text: `Select a C-OFF credit for ${missingCompOff.date}.` });
    if (!reason.trim()) return setNotice({ severity: "warning", text: "Enter the reason for leave." });
    setWorking(true);
    try {
      const { data } = await api.post("/leave/apply", {
        employeeId: employeeIdOf(selectedEmployee),
        reason: reason.trim(),
        applications: selectedRows.map(({ date, leaveType, compOffId }) => ({ date, leaveType, compOffId: compOffId || null })),
      });
      setNotice({ severity: "success", text: data.message });
      setRows([]);
      setReason("");
      setDateRange([]);
      await loadLeaves();
    } catch (error) {
      setNotice({ severity: "error", text: error.response?.data?.detail || "Leave application failed." });
    } finally {
      setWorking(false);
    }
  };

  const act = async (endpoint, payload, successText) => {
    setWorking(true);
    try {
      const { data } = await api.put(endpoint, payload);
      setNotice({ severity: "success", text: data.message || successText });
      setSelectedWorkflowIds([]);
      await Promise.all([loadLeaves(), selectedEmployee ? api.get("/leave/comp-off/available", { params: { employeeId: employeeIdOf(selectedEmployee) } }).then(({ data: credits }) => setCompOffs(credits || [])) : Promise.resolve()]);
    } catch (error) {
      setNotice({ severity: "error", text: error.response?.data?.detail || "Action could not be completed." });
    } finally {
      setWorking(false);
    }
  };

  const cancelLeave = (leave) => {
    if (!window.confirm(`Cancel leave for ${leave.name} on ${dayjs(leave.date).format("DD MMM YYYY")}?`)) return;
    return act(`/leave/cancel/${leave.id}`, {}, "Leave cancelled.");
  };
  const requestTrainingOff = async (training) => {
    const choice = trainingOffChoices[training.id] || { before: false, after: false };
    if (!choice.before && !choice.after) {
      setNotice({ severity: "warning", text: "Select the day before, the day after, or both." });
      return;
    }
    setWorking(true);
    try {
      const { data } = await api.post(`/training-assign/request-adjacent-off/${training.id}`, choice);
      setNotice({ severity: "success", text: data.message || "Training OFF request sent for approval." });
      setTrainingOffChoices((current) => ({ ...current, [training.id]: { before: false, after: false } }));
      await loadApprovedTraining();
    } catch (error) {
      setNotice({ severity: "error", text: error.response?.data?.detail || error.message || "Training OFF request could not be submitted." });
    } finally {
      setWorking(false);
    }
  };
  const approveTrainingFromLeave = async () => {
    if (!selectedTrainingApprovalIds.length) {
      setNotice({ severity: "warning", text: "Select at least one training nomination to approve." });
      return;
    }
    setWorking(true);
    try {
      const { data } = await api.post("/training-assign/approve", { ids: selectedTrainingApprovalIds });
      setNotice({ severity: "success", text: data.message || "Training nominations approved and forwarded." });
      setSelectedTrainingApprovalIds([]);
      await Promise.all([loadPendingTrainingApprovals(), loadApprovedTraining(), loadLeaves()]);
    } catch (error) {
      setNotice({ severity: "error", text: error.response?.data?.detail || error.message || "Training approval could not be completed." });
    } finally {
      setWorking(false);
    }
  };
  const deleteMaster = async (leave) => {
    if (!window.confirm(`Permanently delete this leave master record for ${leave.name} on ${dayjs(leave.date).format("DD MMM YYYY")}? This cannot be undone.`)) return;
    setWorking(true);
    try {
      const { data } = await api.delete(`/leave/master/${leave.id}`);
      setNotice({ severity: "success", text: data.message || "Leave master record deleted." });
      setSelectedWorkflowIds([]);
      await loadLeaves();
    } catch (error) {
      setNotice({ severity: "error", text: error.response?.data?.detail || "Leave master record could not be deleted." });
    } finally {
      setWorking(false);
    }
  };
  const replacementChoice = (leave, stage) => {
    const key = `${stage}:${leave.id}`;
    if (Object.prototype.hasOwnProperty.call(replacementChoices, key)) return replacementChoices[key];
    if (stage === "dic" && typeof leave.dicReplacementRequired === "boolean") return leave.dicReplacementRequired;
    return Boolean(leave.sicReplacementRequired);
  };
  const setReplacementChoice = (leave, stage, checked) => {
    setReplacementChoices((current) => ({ ...current, [`${stage}:${leave.id}`]: checked }));
  };
  const sicForward = (leave) => act(
    "/leave/sic-forward-bulk",
    { leaves: [{ id: leave.id, replacementRequired: replacementChoice(leave, "sic") }] },
    "Approved and forwarded to Leave Approving Authority.",
  );
  const openRejectDialog = (stage, targetLeaves) => {
    setRejectComment("");
    setRejectDialog({ open: true, stage, leaves: targetLeaves });
  };
  const confirmReject = async () => {
    const targetLeaves = rejectDialog.leaves || [];
    if (!targetLeaves.length) return;
    const isSicStage = rejectDialog.stage === "sic";
    setRejectDialog((current) => ({ ...current, open: false }));
    await act(
      isSicStage ? "/leave/sic-reject-bulk" : "/leave/reject-bulk",
      { leaveIds: targetLeaves.map((leave) => leave.id), comment: rejectComment.trim() },
      isSicStage ? "Leave rejected by SIC." : "Leave rejected by DIC.",
    );
  };
  const sicReject = (leave) => openRejectDialog("sic", [leave]);
  const finalApprove = (leave) => act(
    "/leave/approve-bulk",
    { leaves: [{ id: leave.id, replacementRequired: replacementChoice(leave, "dic") }] },
    "Leave approved.",
  );
  const finalReject = (leave) => openRejectDialog("dic", [leave]);

  const pending = useMemo(() => leaves.filter((leave) => !["Approved", "Rejected", "Withdrawn", "Cancelled"].includes(leave.finalStatus)), [leaves]);
  const completed = useMemo(() => leaves.filter((leave) => ["Approved", "Rejected", "Withdrawn", "Cancelled"].includes(leave.finalStatus)), [leaves]);
  const selectedWorkflowLeaves = useMemo(
    () => pending.filter((leave) => selectedWorkflowIds.includes(leave.id)),
    [pending, selectedWorkflowIds],
  );
  const selectedSicLeaves = useMemo(
    () => selectedWorkflowLeaves.filter((leave) => leave.canSICAct),
    [selectedWorkflowLeaves],
  );
  const selectedFinalLeaves = useMemo(
    () => selectedWorkflowLeaves.filter((leave) => leave.canFinalAct),
    [selectedWorkflowLeaves],
  );
  const calendarLeaves = pending;
  const calendarOverlayLeaves = leaves;
  const pendingCalendarRange = useMemo(() => {
    const dates = calendarLeaves.map((leave) => leave.date).filter(Boolean).sort();
    const fallback = dayjs().format("YYYY-MM-DD");
    return { start: dates[0] || fallback, end: dates[dates.length - 1] || dates[0] || fallback };
  }, [calendarLeaves]);
  const effectiveApprovalFrom = approvalFrom || pendingCalendarRange.start;
  const effectiveApprovalTo = approvalTo || pendingCalendarRange.end;
  const visibleCalendarLeaves = useMemo(() => calendarLeaves.filter((leave) => (
    (!effectiveApprovalFrom || leave.date >= effectiveApprovalFrom)
    && (!effectiveApprovalTo || leave.date <= effectiveApprovalTo)
    && (!approvalDepartment || (leave.departments || []).includes(approvalDepartment))
  )), [calendarLeaves, effectiveApprovalFrom, effectiveApprovalTo, approvalDepartment]);
  const visibleCalendarOverlayLeaves = useMemo(() => calendarOverlayLeaves.filter((leave) => (
    !approvalDepartment || (leave.departments || []).includes(approvalDepartment)
  )), [calendarOverlayLeaves, approvalDepartment]);
  const calendarDates = useMemo(
    () => Array.from(new Set(calendarLeaves.map((leave) => leave.date).filter(Boolean))).sort(),
    [calendarLeaves],
  );
  const calendarGroups = useMemo(
    () => Array.from(new Set(calendarLeaves.map((leave) => leave.groupName || "Unmapped"))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    [calendarLeaves],
  );

  useEffect(() => {
    if (workflowView !== "calendar") return;
    let cancelled = false;
    const loadApprovalRoster = async () => {
      setApprovalCalendarLoading(true);
      setApprovalCalendarError("");
      try {
        const start = effectiveApprovalFrom;
        const end = effectiveApprovalTo >= start ? effectiveApprovalTo : start;
        const chunks = [];
        let cursor = dayjs(start);
        const finalDate = dayjs(end);
        while (cursor.isBefore(finalDate) || cursor.isSame(finalDate, "day")) {
          const proposedEnd = cursor.add(44, "day");
          const chunkEnd = proposedEnd.isAfter(finalDate) ? finalDate : proposedEnd;
          chunks.push([cursor.format("YYYY-MM-DD"), chunkEnd.format("YYYY-MM-DD")]);
          cursor = chunkEnd.add(1, "day");
        }
        const responses = await Promise.all(chunks.map(([from, to]) => (
          api.get("/leave/approval-calendar", { params: { startDate: from, endDate: to } }).then(({ data }) => data || [])
        )));
        if (cancelled) return;

        const groupMap = new Map();
        responses.flat().forEach((group) => {
          if (!groupMap.has(group.groupName)) groupMap.set(group.groupName, { departments: new Set(), employees: new Map() });
          const groupEntry = groupMap.get(group.groupName);
          (group.departments || []).forEach((department) => groupEntry.departments.add(department));
          const employeeMap = groupEntry.employees;
          (group.employees || []).forEach((person) => {
            const key = String(person.employeeId || "");
            const current = employeeMap.get(key) || { ...person, duties: {} };
            current.duties = { ...(current.duties || {}), ...(person.duties || {}) };
            employeeMap.set(key, current);
          });
        });

        const groups = Array.from(groupMap.entries()).map(([groupName, groupEntry]) => ({
          groupName,
          departments: Array.from(groupEntry.departments).sort(),
          employees: Array.from(groupEntry.employees.values()).sort((a, b) => Number(Boolean(b.IsSIC)) - Number(Boolean(a.IsSIC))),
        })).sort((a, b) => a.groupName.localeCompare(b.groupName, undefined, { numeric: true }));

        const dates = [];
        let dateCursor = dayjs(start);
        while (dateCursor.isBefore(finalDate) || dateCursor.isSame(finalDate, "day")) {
          dates.push(dateCursor.format("YYYY-MM-DD"));
          dateCursor = dateCursor.add(1, "day");
        }
        setApprovalRoster(groups);
        setApprovalDates(dates);
      } catch (error) {
        if (!cancelled) {
          setApprovalRoster([]);
          setApprovalDates([]);
          setApprovalCalendarError(error.response?.data?.detail || "Leave calendar could not be loaded.");
        }
      } finally {
        if (!cancelled) setApprovalCalendarLoading(false);
      }
    };
    loadApprovalRoster();
    return () => { cancelled = true; };
  }, [workflowView, effectiveApprovalFrom, effectiveApprovalTo, role]);
  const approvalDepartments = useMemo(() => Array.from(new Set(
    approvalRoster.flatMap((group) => [
      ...(group.departments || []),
      ...(group.employees || []).flatMap((employee) => employee.departments || []),
    ]).filter(Boolean),
  )).sort(), [approvalRoster]);
  const visibleApprovalRoster = useMemo(() => {
    if (!approvalDepartment) return approvalRoster;
    return approvalRoster.map((group) => ({
      ...group,
      employees: (group.employees || []).filter((employee) => (employee.departments || []).includes(approvalDepartment)),
    })).filter((group) => group.employees.length);
  }, [approvalRoster, approvalDepartment]);
  const usedCompOffIds = rows.map((row) => row.compOffId).filter(Boolean);

  const toggleWorkflowSelection = (leaveId, checked) => {
    setSelectedWorkflowIds((current) => (
      checked
        ? Array.from(new Set([...current, leaveId]))
        : current.filter((item) => item !== leaveId)
    ));
  };
  const toggleAllPendingSelection = (checked) => {
    if (!checked) {
      setSelectedWorkflowIds([]);
      return;
    }
    setSelectedWorkflowIds(pending.filter((leave) => leave.canSICAct || leave.canFinalAct).map((leave) => leave.id));
  };
  const toggleCalendarDate = (date, checked) => {
    const ids = visibleCalendarLeaves.filter((leave) => leave.date === date).map((leave) => leave.id);
    setSelectedWorkflowIds((current) => checked
      ? Array.from(new Set([...current, ...ids]))
      : current.filter((id) => !ids.includes(id)));
  };
  const toggleAllCalendarSelection = (checked) => {
    const ids = visibleCalendarLeaves.map((leave) => leave.id);
    setSelectedWorkflowIds((current) => checked
      ? Array.from(new Set([...current, ...ids]))
      : current.filter((id) => !ids.includes(id)));
  };
  const calendarEmployeeLeaveIds = (employeeId) => visibleCalendarLeaves
    .filter((leave) => String(leave.employeeId) === String(employeeId))
    .map((leave) => leave.id);
  const toggleCalendarEmployee = (employeeId, checked) => {
    const ids = calendarEmployeeLeaveIds(employeeId);
    setSelectedWorkflowIds((current) => checked
      ? Array.from(new Set([...current, ...ids]))
      : current.filter((id) => !ids.includes(id)));
  };
  const sicForwardBulk = () => {
    if (!selectedSicLeaves.length) return setNotice({ severity: "warning", text: "Select one or more SIC-pending leaves first." });
    return act(
      "/leave/sic-forward-bulk",
      { leaves: selectedSicLeaves.map((leave) => ({ id: leave.id, replacementRequired: replacementChoice(leave, "sic") })) },
      "Approved and forwarded to Leave Approving Authority.",
    );
  };
  const sicRejectBulk = () => {
    if (!selectedSicLeaves.length) return setNotice({ severity: "warning", text: "Select one or more SIC-pending leaves first." });
    return openRejectDialog("sic", selectedSicLeaves);
  };
  const finalApproveBulk = () => {
    if (!selectedFinalLeaves.length) return setNotice({ severity: "warning", text: "Select one or more forwarded leaves first." });
    return act(
      "/leave/approve-bulk",
      { leaves: selectedFinalLeaves.map((leave) => ({ id: leave.id, replacementRequired: replacementChoice(leave, "dic") })) },
      "Leave approved.",
    );
  };
  const finalRejectBulk = () => {
    if (!selectedFinalLeaves.length) return setNotice({ severity: "warning", text: "Select one or more forwarded leaves first." });
    return openRejectDialog("dic", selectedFinalLeaves);
  };
  const refreshCompleted = async () => {
    if (completedFrom && completedTo && completedTo < completedFrom) {
      return setNotice({ severity: "warning", text: "Completed Leave end date cannot be before the start date." });
    }
    setWorking(true);
    try {
      await loadLeaves();
    } catch (error) {
      setNotice({ severity: "error", text: error.response?.data?.detail || "Completed Leave could not be loaded." });
    } finally {
      setWorking(false);
    }
  };

  const workflowCalendar = () => {
    const hasSicActions = calendarLeaves.some((leave) => leave.canSICAct);
    const hasFinalActions = calendarLeaves.some((leave) => leave.canFinalAct);
    return (
      <Box sx={{ display: "grid", gap: 1.2 }}>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1.5, flexWrap: "wrap" }}>
          <Typography sx={{ color: "#64748B", fontSize: 11.5, fontWeight: 700 }}>
            {role.isSIC && !role.isAdmin && !role.isDeptIC
              ? `${role.groupName || "Your shift"} only · tick leave-date boxes to approve.`
              : "All shift groups · tick leave-date boxes for bulk approval."}
          </Typography>
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            {hasSicActions && <>
              <Button size="small" variant="contained" disabled={!selectedSicLeaves.length} startIcon={<Send size={14} />} onClick={sicForwardBulk}>Approve & Forward ({selectedSicLeaves.length})</Button>
              <Button size="small" color="error" variant="outlined" disabled={!selectedSicLeaves.length} onClick={sicRejectBulk}>Reject ({selectedSicLeaves.length})</Button>
            </>}
            {hasFinalActions && <>
              <Button size="small" color="success" variant="contained" disabled={!selectedFinalLeaves.length} startIcon={<CheckCircle2 size={14} />} onClick={finalApproveBulk}>DIC Final Approve ({selectedFinalLeaves.length})</Button>
              <Button size="small" color="error" variant="outlined" disabled={!selectedFinalLeaves.length} onClick={finalRejectBulk}>Reject ({selectedFinalLeaves.length})</Button>
            </>}
          </Stack>
        </Box>

        <TableContainer sx={{ maxHeight: 430, border: "1px solid #CBD5E1", borderRadius: 2, background: "#FFFFFF" }}>
          <Table size="small" stickyHeader sx={{ minWidth: Math.max(760, 150 + calendarDates.length * 180), tableLayout: "fixed" }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 150, position: "sticky", left: 0, zIndex: 4, background: "#EAF2FF", color: "#0057B7", fontWeight: 950 }}>Shift group</TableCell>
                {calendarDates.map((date) => {
                  const ids = visibleCalendarLeaves.filter((leave) => leave.date === date).map((leave) => leave.id);
                  const selectedCount = ids.filter((id) => selectedWorkflowIds.includes(id)).length;
                  return (
                    <TableCell key={date} align="center" sx={{ width: 180, background: "#EAF2FF", color: "#0F172A", p: .65 }}>
                      <Stack direction="row" justifyContent="center" alignItems="center" spacing={.25}>
                        <Checkbox size="small" checked={ids.length > 0 && selectedCount === ids.length} indeterminate={selectedCount > 0 && selectedCount < ids.length} onChange={(event) => toggleCalendarDate(date, event.target.checked)} />
                        <Box><Typography sx={{ fontSize: 11.5, fontWeight: 950 }}>{dayjs(date).format("DD MMM")}</Typography><Typography sx={{ color: "#64748B", fontSize: 9.5, fontWeight: 750 }}>{dayjs(date).format("ddd")}</Typography></Box>
                      </Stack>
                    </TableCell>
                  );
                })}
              </TableRow>
            </TableHead>
            <TableBody>
              {calendarGroups.map((group) => (
                <TableRow key={group}>
                  <TableCell sx={{ position: "sticky", left: 0, zIndex: 2, background: "#F8FAFC", color: "#0F172A", fontWeight: 950, borderRight: "1px solid #CBD5E1" }}>{group}</TableCell>
                  {calendarDates.map((date) => {
                    const cellLeaves = calendarLeaves.filter((leave) => (leave.groupName || "Unmapped") === group && leave.date === date);
                    return (
                      <TableCell key={`${group}-${date}`} sx={{ p: .55, verticalAlign: "top", background: cellLeaves.length ? "#FFF8FA" : "#FFFFFF" }}>
                        <Stack spacing={.55}>
                          {cellLeaves.map((leave) => {
                            const selected = selectedWorkflowIds.includes(leave.id);
                            const stage = leave.canSICAct ? "SIC review" : "DIC final";
                            return (
                              <Box key={leave.id} sx={{ p: .65, borderRadius: 1.5, border: `1px solid ${selected ? "#0057B7" : "#FECDD3"}`, background: selected ? "#EAF2FF" : "#FFF1F2", transition: "all .18s ease" }}>
                                <Stack direction="row" alignItems="flex-start" spacing={.35}>
                                  <Checkbox size="small" checked={selected} onChange={(event) => toggleWorkflowSelection(leave.id, event.target.checked)} sx={{ p: .25 }} />
                                  <Box sx={{ minWidth: 0, flex: 1 }}>
                                    <Typography noWrap title={leave.name} sx={{ color: "#0F172A", fontSize: 10.5, fontWeight: 950 }}>{leave.name}</Typography>
                                    <Typography noWrap sx={{ color: "#64748B", fontSize: 9.2, fontWeight: 700 }}>{leave.dutyType || leave.assignedDuty || "-"} · {leave.leaveType} · {stage}</Typography>
                                  </Box>
                                </Stack>
                                <Stack direction="row" alignItems="center" spacing={.15} sx={{ pl: .3, mt: .15 }}>
                                  <Checkbox size="small" checked={replacementChoice(leave, leave.canSICAct ? "sic" : "dic")} onChange={(event) => setReplacementChoice(leave, leave.canSICAct ? "sic" : "dic", event.target.checked)} sx={{ p: .2 }} />
                                  <Typography sx={{ color: "#64748B", fontSize: 8.8, fontWeight: 800 }}>Replacement required</Typography>
                                </Stack>
                              </Box>
                            );
                          })}
                        </Stack>
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
              {!calendarLeaves.length && <TableRow><TableCell colSpan={Math.max(2, calendarDates.length + 1)} align="center" sx={{ py: 5, color: "#64748B", fontWeight: 750 }}>No leave is awaiting your approval.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    );
  };

  const rosterWorkflowCalendar = () => {
    const hasSicActions = visibleCalendarLeaves.some((leave) => leave.canSICAct);
    const hasFinalActions = visibleCalendarLeaves.some((leave) => leave.canFinalAct);
    const selectedVisibleCount = visibleCalendarLeaves.filter((leave) => selectedWorkflowIds.includes(leave.id)).length;
    const allVisibleSelected = visibleCalendarLeaves.length > 0 && selectedVisibleCount === visibleCalendarLeaves.length;
    const leaveByEmployeeDate = new Map(visibleCalendarOverlayLeaves.map((leave) => [`${leave.employeeId}:${leave.date}`, leave]));
    return (
      <Box sx={{ display: "grid", gap: 1.1 }}>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, flexWrap: "wrap" }}>
          <Stack direction="row" spacing={.7} useFlexGap flexWrap="wrap" alignItems="center">
            <TextField size="small" type="date" label="From" value={effectiveApprovalFrom} onChange={(event) => { const value = event.target.value; setApprovalFrom(value); if (effectiveApprovalTo < value) setApprovalTo(value); }} InputLabelProps={{ shrink: true }} inputProps={{ max: effectiveApprovalTo || undefined }} sx={{ width: 145 }} />
            <TextField size="small" type="date" label="To" value={effectiveApprovalTo} onChange={(event) => { const value = event.target.value; setApprovalTo(value); if (value < effectiveApprovalFrom) setApprovalFrom(value); }} InputLabelProps={{ shrink: true }} inputProps={{ min: effectiveApprovalFrom || undefined }} sx={{ width: 145 }} />
            <Button size="small" variant="text" onClick={() => { setApprovalFrom(""); setApprovalTo(""); }}>Pending dates</Button>
            {role.canViewAll && (
              <FormControl size="small" sx={{ minWidth: 190 }}>
                <InputLabel>Department</InputLabel>
                <Select value={approvalDepartment} label="Department" onChange={(event) => setApprovalDepartment(event.target.value)}>
                  <MenuItem value="">All departments</MenuItem>
                  {approvalDepartments.map((department) => <MenuItem key={department} value={department}>{department}</MenuItem>)}
                </Select>
              </FormControl>
            )}
            <FormControlLabel
              sx={{ ml: .25, mr: 0 }}
              control={<Checkbox size="small" checked={allVisibleSelected} indeterminate={selectedVisibleCount > 0 && !allVisibleSelected} disabled={!visibleCalendarLeaves.length} onChange={(event) => toggleAllCalendarSelection(event.target.checked)} />}
              label={<Typography sx={{ fontSize: 10.8, fontWeight: 900 }}>Select all leaves ({visibleCalendarLeaves.length})</Typography>}
            />
          </Stack>
          <Typography sx={{ color: "#64748B", fontSize: 10.8, fontWeight: 750, display: role.canViewAll ? "none" : "block" }}>
            {role.isSIC && !role.isAdmin && !role.isDeptIC ? `${role.groupName || "Your shift"} · complete crew view` : "All shift groups · complete crew view"}. Tick only highlighted leave cells.
          </Typography>
          <Stack direction="row" spacing={.7} useFlexGap flexWrap="wrap">
            {hasSicActions && <>
              <Button size="small" variant="contained" disabled={!selectedSicLeaves.length} startIcon={<Send size={13} />} onClick={sicForwardBulk}>Approve & Forward ({selectedSicLeaves.length})</Button>
              <Button size="small" color="error" variant="outlined" disabled={!selectedSicLeaves.length} onClick={sicRejectBulk}>Reject ({selectedSicLeaves.length})</Button>
            </>}
            {hasFinalActions && <>
              <Button size="small" color="success" variant="contained" disabled={!selectedFinalLeaves.length} startIcon={<CheckCircle2 size={13} />} onClick={finalApproveBulk}>DIC Final Approve ({selectedFinalLeaves.length})</Button>
              <Button size="small" color="error" variant="outlined" disabled={!selectedFinalLeaves.length} onClick={finalRejectBulk}>Reject ({selectedFinalLeaves.length})</Button>
            </>}
          </Stack>
        </Box>

        <Box sx={{ display: "flex", alignItems: "center", gap: 1.2, flexWrap: "wrap", px: 1, py: .65, borderRadius: 1.5, border: "1px solid #BFDBFE", background: "#F8FBFF" }}>
          <Stack direction="row" alignItems="center" spacing={.25}><Checkbox size="small" disabled sx={{ p: 0, "& .MuiSvgIcon-root": { fontSize: 15 } }} /><Typography sx={{ fontSize: 10, color: "#475569" }}>Tick a leave cell, date heading, or employee checkbox to select visible leave for approval/rejection.</Typography></Stack>
          <Stack direction="row" alignItems="center" spacing={.45}><Box sx={{ width: 17, height: 17, borderRadius: .7, display: "grid", placeItems: "center", color: "#FFF", background: "#D97706", fontSize: 8, fontWeight: 950 }}>R</Box><Typography sx={{ fontSize: 10, color: "#475569" }}>Amber R = replacement required; grey R = not required. DIC may change SIC's choice.</Typography></Stack>
          <Stack direction="row" alignItems="center" spacing={.4}><CheckCircle2 size={15} color="#15803D" strokeWidth={3} /><Typography sx={{ fontSize: 10, color: "#475569" }}>Green tick = leave finally approved.</Typography></Stack>
        </Box>

        {approvalCalendarError && <Alert severity="error">{approvalCalendarError}</Alert>}
        {approvalCalendarLoading ? (
          <Box sx={{ minHeight: 220, display: "grid", placeItems: "center" }}><CircularProgress size={28} /></Box>
        ) : (
          <TableContainer sx={{ maxHeight: "min(68vh, 700px)", border: "1px solid #CBD5E1", borderRadius: 2, background: "#FFFFFF" }}>
            <Table size="small" stickyHeader sx={{ minWidth: Math.max(900, 170 + approvalDates.length * 92), tableLayout: "fixed" }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 170, position: "sticky", left: 0, zIndex: 5, py: .4, background: "#EAF2FF", color: "#0057B7", fontSize: 10.5, fontWeight: 950 }}>Employee</TableCell>
                  {approvalDates.map((date) => {
                    const ids = visibleCalendarLeaves.filter((leave) => leave.date === date).map((leave) => leave.id);
                    const selectedCount = ids.filter((id) => selectedWorkflowIds.includes(id)).length;
                    return <TableCell key={date} align="center" sx={{ width: 92, p: .25, background: "#EAF2FF" }}><Stack direction="row" justifyContent="center" alignItems="center" spacing={0}><Checkbox size="small" disabled={!ids.length} checked={ids.length > 0 && selectedCount === ids.length} indeterminate={selectedCount > 0 && selectedCount < ids.length} onChange={(event) => toggleCalendarDate(date, event.target.checked)} sx={{ p: .2 }} /><Box><Typography sx={{ fontSize: 9.5, fontWeight: 950 }}>{dayjs(date).format("DD MMM")}</Typography><Typography sx={{ color: "#64748B", fontSize: 8 }}>{dayjs(date).format("ddd")}</Typography></Box></Stack></TableCell>;
                  })}
                </TableRow>
              </TableHead>
              <TableBody>
                {visibleApprovalRoster.map((group) => <Fragment key={group.groupName}>
                  <TableRow key={`${group.groupName}-heading`}><TableCell colSpan={approvalDates.length + 1} sx={{ position: "sticky", left: 0, zIndex: 2, py: .3, px: 1, background: "#EAF8F3", color: "#03624C", fontSize: 10.5, fontWeight: 950 }}>{group.groupName}</TableCell></TableRow>
                  {(group.employees || []).map((person) => (
                    <TableRow key={`${group.groupName}-${person.employeeId}`} sx={{ height: 31 }}>
                      <TableCell sx={{ position: "sticky", left: 0, zIndex: 2, py: .25, px: .7, background: person.IsSIC ? "#ECFDF5" : "#FFFFFF", borderRight: "1px solid #CBD5E1" }}>
                        <Stack direction="row" alignItems="center" spacing={.25}>
                          <Checkbox
                            size="small"
                            disabled={!calendarEmployeeLeaveIds(person.employeeId).length}
                            checked={calendarEmployeeLeaveIds(person.employeeId).length > 0 && calendarEmployeeLeaveIds(person.employeeId).every((id) => selectedWorkflowIds.includes(id))}
                            indeterminate={calendarEmployeeLeaveIds(person.employeeId).some((id) => selectedWorkflowIds.includes(id)) && !calendarEmployeeLeaveIds(person.employeeId).every((id) => selectedWorkflowIds.includes(id))}
                            onChange={(event) => toggleCalendarEmployee(person.employeeId, event.target.checked)}
                            inputProps={{ "aria-label": `Select all visible leave for ${person.name || person.employeeId}` }}
                            sx={{ p: 0, mr: .15, "& .MuiSvgIcon-root": { fontSize: 14 } }}
                          />
                          <Box sx={{ minWidth: 0 }}><Typography noWrap title={person.name} sx={{ fontSize: 9.7, fontWeight: 950 }}>{person.name || person.employeeId}</Typography><Typography noWrap sx={{ color: "#64748B", fontSize: 7.8 }}>{person.designation || "-"}</Typography></Box>{person.IsSIC && <Chip label="SIC" size="small" sx={{ height: 15, fontSize: 7.5, fontWeight: 950, background: "#D1FAE5", color: "#03624C" }} />}
                        </Stack>
                      </TableCell>
                      {approvalDates.map((date) => {
                        const duty = person.duties?.[date] || { shift: "-" };
                        const palette = compactDutyStyle(duty);
                        const leave = leaveByEmployeeDate.get(`${person.employeeId}:${date}`);
                        const actionable = Boolean(leave?.canSICAct || leave?.canFinalAct);
                        const selected = actionable && selectedWorkflowIds.includes(leave.id);
                        const sicForwarded = leave?.sicApprovalStatus === "Forwarded" || duty.leaveStatus === "Forwarded by SIC";
                        const finallyApproved = leave?.finalStatus === "Approved" || leave?.deptApprovalStatus === "Approved" || duty.leaveStatus === "Approved";
                        const decisions = leave?.replacementDecisionHistory || [];
                        const sicDecision = decisions.find((entry) => entry.stage === "SIC");
                        const dicDecision = decisions.find((entry) => entry.stage === "DIC");
                        const rejection = (leave?.rejectionHistory || []).slice(-1)[0];
                        const replacementStage = leave?.canSICAct ? "sic" : "dic";
                        const replacementChecked = actionable ? replacementChoice(leave, replacementStage) : false;
                        const timeline = leave ? (
                          <Box sx={{ p: .35 }}>
                            <Typography sx={{ fontSize: 11, fontWeight: 950 }}>{leave.name} · {leave.leaveType}</Typography>
                            <Typography sx={{ mt: .45, fontSize: 10 }}>Applied: {leave.createdOn ? dayjs(leave.createdOn).format("DD MMM YYYY, HH:mm") : "Time not recorded"}</Typography>
                            <Typography sx={{ fontSize: 10 }}>SIC: {sicForwarded ? "Approved & Forwarded" : leave.sicApprovalStatus || "Pending"}{sicDecision?.decidedOn ? ` · ${dayjs(sicDecision.decidedOn).format("DD MMM YYYY, HH:mm")}` : ""}</Typography>
                            <Typography sx={{ fontSize: 10 }}>DIC: {leave.deptApprovalStatus || "Pending"}{dicDecision?.decidedOn ? ` · ${dayjs(dicDecision.decidedOn).format("DD MMM YYYY, HH:mm")}` : ""}</Typography>
                            {rejection && <Typography sx={{ mt: .35, color: "#FCA5A5", fontSize: 10 }}>Rejected by {rejection.rejectedByRole || rejection.stage}: {rejection.comment || "No comment"}{rejection.rejectedOn ? ` · ${dayjs(rejection.rejectedOn).format("DD MMM YYYY, HH:mm")}` : ""}</Typography>}
                          </Box>
                        ) : "";
                        return (
                          <TableCell key={`${person.employeeId}-${date}`} align="center" sx={{ p: .2 }}>
                            <Tooltip title={timeline} arrow placement="top">
                              <Box sx={{ minHeight: 27, px: .18, py: .18, borderRadius: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: .05, background: selected ? "#DBEAFE" : palette.bg, color: palette.color, border: `1px solid ${actionable ? selected ? "#0057B7" : "#EF4444" : palette.border}` }}>
                                {actionable && <Checkbox size="small" checked={Boolean(selected)} onChange={(event) => toggleWorkflowSelection(leave.id, event.target.checked)} sx={{ p: 0, color: "#DC2626", "&.Mui-checked": { color: "#0057B7" }, "& .MuiSvgIcon-root": { fontSize: 14 } }} />}
                                <Box sx={{ minWidth: 0, flex: 1 }}><Typography sx={{ fontSize: 8.6, lineHeight: 1.05, fontWeight: 950 }}>{duty.shift || "-"}</Typography>{duty.leaveStatus && <Typography noWrap sx={{ maxWidth: 52, mx: "auto", fontSize: 6.5, lineHeight: 1.05, fontWeight: 900 }}>{duty.leaveType || "Leave"} · {sicForwarded ? "Approved & Forwarded" : duty.leaveStatus}</Typography>}</Box>
                                {finallyApproved && <Tooltip title="Leave finally approved" arrow><CheckCircle2 size={15} color="#15803D" strokeWidth={3} aria-label="Leave finally approved" /></Tooltip>}
                                {leave?.replacementAssigned ? <ReplacementFlag required assigned title={`Replacement assigned: ${leave.replacementEmployee?.name || leave.replacementEmployee?.employeeId || "Employee"}`} /> : actionable ? <Tooltip title={`Replacement required: ${replacementChecked ? "Yes" : "No"}`} arrow><Box component="button" type="button" aria-label="Toggle replacement required" aria-pressed={replacementChecked} onClick={(event) => { event.stopPropagation(); setReplacementChoice(leave, replacementStage, !replacementChecked); }} sx={{ width: 17, minWidth: 17, height: 17, p: 0, borderRadius: .7, border: `1px solid ${replacementChecked ? "#D97706" : "#94A3B8"}`, color: replacementChecked ? "#FFFFFF" : "#64748B", background: replacementChecked ? "#D97706" : "#FFFFFF", fontSize: 8, fontWeight: 950, cursor: "pointer", animation:replacementChecked ? "replacementPulse 1.05s ease-in-out infinite" : "none", "@keyframes replacementPulse": { "0%,100%":{opacity:1}, "50%":{opacity:.4} } }}>R</Box></Tooltip> : <ReplacementFlag required={leave?.replacementRequired} assigned={leave?.replacementAssigned} />}
                              </Box>
                            </Tooltip>
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </Fragment>)}
                {!visibleApprovalRoster.length && <TableRow><TableCell colSpan={Math.max(2, approvalDates.length + 1)} align="center" sx={{ py: 5, color: "#64748B" }}>No employee is available in this authorized scope and period.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>
    );
  };

  const workflowTable = (items, completedTable = false) => {
    const selectionEnabled = !completedTable;
    const selectableItems = items.filter((leave) => leave.canSICAct || leave.canFinalAct);
    const hasSicActions = items.some((leave) => leave.canSICAct);
    const hasFinalActions = items.some((leave) => leave.canFinalAct);
    const hasActionColumn = !completedTable || items.some((leave) => leave.canCancel || leave.canDeleteMaster || (leave.isSIC && leave.finalStatus === "Approved"));
    return (
      <Box sx={{ display: "grid", gap: 1.2 }}>
        {!completedTable && (
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1.5, flexWrap: "wrap" }}>
            <Typography sx={{ fontSize: 12.5, color: "#64748B", fontWeight: 700 }}>
              Select multiple rows to approve and forward, or to finalize them in one step.
            </Typography>
            <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
              {(hasSicActions || hasFinalActions) && (
                <>
                {hasSicActions && (
                  <>
                    <Button size="small" variant="contained" disabled={!selectedSicLeaves.length} startIcon={<Send size={14} />} onClick={sicForwardBulk}>
                      Approve & Forward Selected ({selectedSicLeaves.length})
                    </Button>
                    <Button size="small" color="error" variant="outlined" disabled={!selectedSicLeaves.length} onClick={sicRejectBulk}>
                      Reject Selected
                    </Button>
                  </>
                )}
                {hasFinalActions && (
                  <>
                    <Button size="small" color="success" variant="contained" disabled={!selectedFinalLeaves.length} startIcon={<CheckCircle2 size={14} />} onClick={finalApproveBulk}>
                      DIC Final Approve Selected ({selectedFinalLeaves.length})
                    </Button>
                    <Button size="small" color="error" variant="outlined" disabled={!selectedFinalLeaves.length} onClick={finalRejectBulk}>
                      Reject Selected
                    </Button>
                  </>
                )}
                </>
              )}
            </Stack>
          </Box>
        )}
        <TableContainer sx={{ maxHeight: completedTable ? 360 : 480, border: "1px solid #E2E8F0", borderRadius: 2 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                {selectionEnabled && (
                  <TableCell padding="checkbox">
                    <Checkbox
                      checked={selectableItems.length > 0 && selectableItems.every((leave) => selectedWorkflowIds.includes(leave.id))}
                      indeterminate={selectableItems.some((leave) => selectedWorkflowIds.includes(leave.id)) && !selectableItems.every((leave) => selectedWorkflowIds.includes(leave.id))}
                      onChange={(event) => toggleAllPendingSelection(event.target.checked)}
                    />
                  </TableCell>
                )}
                <TableCell>Employee</TableCell><TableCell>Date</TableCell><TableCell>Group</TableCell><TableCell>Duty Type</TableCell><TableCell>Other persons on leave</TableCell><TableCell>Leave</TableCell>
                <TableCell>SIC</TableCell><TableCell>Final Authority</TableCell><TableCell>Replacement</TableCell><TableCell>Final Status</TableCell>{hasActionColumn && <TableCell align="right">Action</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((leave) => (
                <TableRow key={leave.id} hover>
                  {selectionEnabled && (
                    <TableCell padding="checkbox">
                      <Checkbox disabled={!leave.canSICAct && !leave.canFinalAct} checked={selectedWorkflowIds.includes(leave.id)} onChange={(event) => toggleWorkflowSelection(leave.id, event.target.checked)} />
                    </TableCell>
                  )}
                  <TableCell><Typography sx={{ fontSize: 12.5, fontWeight: 850 }}>{leave.name}</Typography><Typography sx={{ fontSize: 10.5, color: "#64748B" }}>{leave.employeeId}</Typography></TableCell>
                  <TableCell sx={{ whiteSpace: "nowrap" }}>{dayjs(leave.date).format("DD MMM YYYY")}</TableCell>
                  <TableCell>{leave.groupName}</TableCell>
                  <TableCell sx={{ whiteSpace: "nowrap" }}>
                    <Typography sx={{ fontSize: 12, fontWeight: 800, color: "#0F172A" }}>{leave.dutyType || leave.assignedDuty || "-"}</Typography>
                    {leave.assignedDuty && leave.dutyType && leave.assignedDuty !== leave.dutyType && (
                      <Typography sx={{ fontSize: 10.5, color: "#64748B" }}>{leave.assignedDuty}</Typography>
                    )}
                  </TableCell>
                  <TableCell sx={{ minWidth: 170 }}>
                    {leave.othersOnLeave?.length ? (
                      <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
                        {leave.othersOnLeave.map((person) => (
                          <Chip
                            key={`${leave.id}-${person.employeeId}`}
                            label={`${person.name || person.employeeId}${person.employeeId ? ` (${person.employeeId})` : ""}`}
                            size="small"
                            sx={{ height: 23, color: "#B91C1C", background: "#FFF1F2", border: "1px solid #FECDD3", fontWeight: 800, fontSize: 10.5 }}
                          />
                        ))}
                      </Stack>
                    ) : <Typography sx={{ color: "#94A3B8", fontSize: 11 }}>None</Typography>}
                  </TableCell>
                  <TableCell sx={{ fontWeight: 800 }}>{leave.leaveType}</TableCell>
                  <TableCell><StatusChip value={leave.sicApprovalStatus} /></TableCell><TableCell><StatusChip value={leave.deptApprovalStatus} /></TableCell>
                  <TableCell sx={{ minWidth: 190 }}>
                    <Stack direction="row" spacing={.8} alignItems="center" sx={{ mb: .35 }}>
                      <ReplacementFlag required={leave.replacementRequired || leave.sicReplacementRequired || (leave.canSICAct && replacementChoice(leave, "sic")) || (leave.canFinalAct && replacementChoice(leave, "dic"))} assigned={leave.replacementAssigned} title={leave.replacementAssigned ? `Replacement assigned: ${leave.replacementEmployee?.name || leave.replacementEmployee?.employeeId || "Employee"}` : "Replacement required; assignment is pending"} />
                      {leave.replacementAssigned && <Typography sx={{fontSize:10.5,color:"#15803D",fontWeight:850}}>{leave.replacementEmployee?.name || leave.replacementEmployee?.employeeId}</Typography>}
                    </Stack>
                    {leave.canSICAct && <Stack direction="row" alignItems="center"><Checkbox size="small" checked={replacementChoice(leave, "sic")} onChange={(event) => setReplacementChoice(leave, "sic", event.target.checked)} /><Typography sx={{ fontSize: 11.5, fontWeight: 750 }}>Replacement required</Typography></Stack>}
                    {leave.canFinalAct && <Stack><Typography sx={{ fontSize: 10.5, color: "#64748B" }}>SIC decision: {leave.sicReplacementRequired ? "Required" : "Not required"}</Typography><Stack direction="row" alignItems="center"><Checkbox size="small" checked={replacementChoice(leave, "dic")} onChange={(event) => setReplacementChoice(leave, "dic", event.target.checked)} /><Typography sx={{ fontSize: 11.5, fontWeight: 750 }}>DIC final decision</Typography></Stack></Stack>}
                    {!leave.canSICAct && !leave.canFinalAct && (
                      completedTable ? (
                        <Stack spacing={0.2}>
                          <Typography sx={{ fontSize: 10.5, color: "#64748B" }}>SIC: {leave.sicReplacementRequired ? "Required" : "Not required"}</Typography>
                          <Typography sx={{ fontSize: 11, color: leave.replacementRequired ? "#B45309" : "#64748B", fontWeight: 800 }}>
                            DIC final: {leave.replacementRequired ? "Required" : "Not required"}
                          </Typography>
                        </Stack>
                      ) : (
                        <Typography sx={{ fontSize: 11, color: leave.replacementRequired ? "#B45309" : "#64748B", fontWeight: 700 }}>{leave.replacementRequired ? "Required" : "Not required"}</Typography>
                      )
                    )}
                  </TableCell>
                  <TableCell><StatusChip value={leave.finalStatus} /></TableCell>
                  {hasActionColumn && <TableCell align="right" sx={{ minWidth: 280 }}>
                    <Stack direction="row" spacing={0.7} justifyContent="flex-end">
                      {leave.canCancel && <Button size="small" color="warning" variant="outlined" onClick={() => cancelLeave(leave)}>Cancel leave</Button>}
                      {completedTable && leave.isSIC && leave.finalStatus === "Approved" && (
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<ShieldCheck size={14} />}
                          onClick={() => {
                            const params = new URLSearchParams({ action: "assign-sic", leaveId: String(leave.id), date: leave.date || "" });
                            window.location.assign(`/crew/replacement?${params.toString()}`);
                          }}
                        >
                          Assign acting SIC
                        </Button>
                      )}
                      {leave.canSICAct && <><Button size="small" variant="contained" startIcon={<Send size={14} />} onClick={() => sicForward(leave)}>Approve & Forward</Button><Button size="small" color="error" variant="outlined" onClick={() => sicReject(leave)}>Reject</Button></>}
                      {leave.canFinalAct && <><Button size="small" color="success" variant="contained" startIcon={<CheckCircle2 size={14} />} onClick={() => finalApprove(leave)}>Final approve</Button><Button size="small" color="error" variant="outlined" onClick={() => finalReject(leave)}>Reject</Button></>}
                      {leave.canDeleteMaster && <Button size="small" color="error" variant="contained" onClick={() => deleteMaster(leave)}>Delete master</Button>}
                      {!leave.canCancel && !leave.canDeleteMaster && !leave.isOwner && !leave.canSICAct && !leave.canFinalAct && <Typography sx={{ fontSize: 11, color: "#94A3B8" }}>Awaiting action</Typography>}
                    </Stack>
                  </TableCell>}
                </TableRow>
              ))}
              {!items.length && <TableRow><TableCell colSpan={completedTable ? (hasActionColumn ? 11 : 10) : 12} align="center" sx={{ py: 4, color: "#94A3B8" }}>No records</TableCell></TableRow>}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    );
  };

  if (loading) return <Box sx={{ minHeight: 420, display: "grid", placeItems: "center" }}><CircularProgress /></Box>;

  return (
    <Box className="ui-kit-page" sx={{ display: "grid", gap: 2.5 }}>
      <Box sx={{ p: 3, mb: 3, borderRadius: 3, background: "linear-gradient(105deg,#08103A 0%,#0057B7 65%,#0F6FDB 100%)", color: "white" }}>
        <Typography variant="h5" fontWeight="bold" sx={{ color: "#FFFFFF" }}>
          Leave Application &amp; Approval
        </Typography>
        <Typography variant="body2" sx={{ color: "rgba(255,255,255,.88)" }}>
          Employee → Shift-in-Charge → Leave Approving Authority
        </Typography>
      </Box>

      {notice && <Alert severity={notice.severity} onClose={() => setNotice(null)}>{notice.text}</Alert>}

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))", lg: "repeat(5, minmax(0, 1fr))" }, gap: 2 }}>
        {[
          { key: "apply", title: "Apply Leave", subtitle: "Select employee, dates and leave type", count: null, color: "#0057B7", tint: "#EAF2FF" },
          { key: "exchange", title: "Apply for Duty Exchange", subtitle: "Exchange duty through the approval workflow", count: null, color: "#0369A1", tint: "#F0F9FF" },
          { key: "training", title: "Training & Approval", subtitle: pendingTrainingApprovals.length ? `${pendingTrainingApprovals.length} nomination(s) awaiting your approval` : "Approved training and before/after OFF", count: pendingTrainingApprovals.length || approvedTraining.length, color: "#7C3AED", tint: "#F5F3FF" },
          { key: "pending", title: "Pending Leave Workflow", subtitle: "Review, approve, forward or reject", count: pending.length, color: "#17876D", tint: "#EAF8F3" },
          { key: "completed", title: "Completed Leave", subtitle: "Approved, rejected and cancelled records", count: completed.length, color: "#4338CA", tint: "#EEF2FF" },
        ].map((tile) => (
          <Paper key={tile.key} component="button" type="button" elevation={0} onClick={() => openSection(tile.key)} sx={{ width: "100%", minHeight: 118, p: 2.2, borderRadius: 3, textAlign: "left", cursor: "pointer", border: `1px solid ${activeSection === tile.key ? tile.color : "#D7E3F4"}`, background: activeSection === tile.key ? tile.tint : "#FFFFFF", boxShadow: activeSection === tile.key ? `0 12px 28px ${tile.color}22` : "0 5px 18px rgba(15,23,42,.06)", transition: "transform .22s ease, box-shadow .22s ease, border-color .22s ease, background .22s ease", "&:hover": { transform: "translateY(-3px)", borderColor: tile.color, boxShadow: `0 14px 30px ${tile.color}26` } }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 2 }}>
              <Box><Typography sx={{ color: "#0F172A", fontSize: 16, fontWeight: 950 }}>{tile.title}</Typography><Typography sx={{ mt: .65, color: "#64748B", fontSize: 11.5, fontWeight: 650 }}>{tile.subtitle}</Typography></Box>
              {tile.count !== null && <Box sx={{ minWidth: 42, height: 42, px: 1, borderRadius: 2.2, display: "grid", placeItems: "center", color: "#FFFFFF", background: tile.color, fontSize: 18, fontWeight: 950 }}>{tile.count}</Box>}
            </Box>
            <Typography sx={{ mt: 1.4, color: tile.color, fontSize: 11.5, fontWeight: 900 }}>{activeSection === tile.key ? "Workspace open" : "Click to open"}</Typography>
          </Paper>
        ))}
      </Box>

      <Collapse in={activeSection === "apply"} timeout={420} unmountOnExit>
      <Box id="leave-workspace-apply" sx={{ display: "grid", gap: 2.5, scrollMarginTop: 110 }}>
      <Paper sx={{ p: 2.5 }}>
        <SectionTitle icon={User} title="Apply Leave" subtitle={role.isSIC && !role.isAdmin ? `As SIC, you may apply for members of ${role.groupName}.` : "Select one continuous duty-date range."} />
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr auto" }, gap: 1.5, alignItems: "center" }}>
          <Autocomplete options={employees} value={selectedEmployee} disabled={employees.length === 1} onChange={(_, value) => { setSelectedEmployee(value); setRows([]); }} getOptionLabel={(item) => `${item.name || employeeIdOf(item)} — ${item.designation || "Employee"}`} isOptionEqualToValue={(a, b) => employeeIdOf(a) === employeeIdOf(b)} renderInput={(params) => <TextField {...params} label="Employee" helperText={employees.length === 1 ? "Only your own name is available" : "Current group members"} />} />
          <DatePicker range rangeHover minDate={role.isAdmin ? undefined : new Date()} value={dateRange} onChange={(value) => { setDateRange(value || []); setRows([]); }} format="DD MMM YYYY" numberOfMonths={2} showOtherDays render={(value, openCalendar) => <TextField fullWidth label="Continuous date range" value={value || ""} onClick={openCalendar} helperText={role.isAdmin ? "Administrators may enter earlier dates" : "Past dates are not allowed"} InputProps={{ readOnly: true }} />} />
          <Button variant="contained" onClick={fetchDuty} disabled={working} startIcon={<RefreshCw size={16} />} sx={{ minHeight: 48, px: 3 }}>Load duty</Button>
        </Box>
      </Paper>

      {!!rows.length && <Paper sx={{ p: 2.5 }}>
        <SectionTitle icon={CalendarDays} title="Leave Entry Grid" subtitle="Choose a leave type, then drag its blue handle across other rows to fill. C-OFF must be selected individually." count={rows.filter((row) => row.selected).length} />
        <TableContainer sx={{ border: "1px solid #CBD5E1", borderRadius: 2, maxHeight: 520 }}><Table size="small" stickyHeader>
          <TableHead><TableRow><TableCell padding="checkbox"><Checkbox checked={rows.every((row) => row.selected)} indeterminate={rows.some((row) => row.selected) && !rows.every((row) => row.selected)} onChange={(event) => setRows((current) => current.map((row) => ({ ...row, selected: event.target.checked })))} /></TableCell><TableCell>Date</TableCell><TableCell>Duty</TableCell><TableCell>Group</TableCell><TableCell>Others on Leave</TableCell><TableCell sx={{ minWidth: 260 }}>Leave Type / C-OFF Credit</TableCell><TableCell width={48}>Fill</TableCell></TableRow></TableHead>
          <TableBody>{rows.map((row, index) => <TableRow key={row.date} hover onPointerEnter={() => continueFill(index)} sx={{ background: row.selected ? "#F8FBFF" : "#fff" }}>
            <TableCell padding="checkbox"><Checkbox checked={row.selected} onChange={(event) => updateRow(index, { selected: event.target.checked })} /></TableCell>
            <TableCell sx={{ fontWeight: 850, whiteSpace: "nowrap" }}>{dayjs(row.date).format("ddd, DD MMM YYYY")}</TableCell><TableCell>{row.assignedDuty || "-"}</TableCell><TableCell>{row.groupName}</TableCell>
            <TableCell>{row.othersOnLeave?.length ? row.othersOnLeave.map((person) => <Chip key={person.employeeId} label={person.name} size="small" color="warning" variant="outlined" sx={{ mr: .5 }} />) : "-"}</TableCell>
            <TableCell><Stack spacing={.8}><FormControl size="small" fullWidth><InputLabel>Leave type</InputLabel><Select value={row.leaveType} label="Leave type" onChange={(event) => setLeaveType(index, event.target.value)}>{leaveTypes.map((type) => <MenuItem key={type.value} value={type.value}>{type.label}</MenuItem>)}</Select></FormControl>{row.leaveType === "C-OFF" && <FormControl size="small" fullWidth><InputLabel>C-OFF credit</InputLabel><Select value={row.compOffId} label="C-OFF credit" onChange={(event) => updateRow(index, { compOffId: event.target.value })}>{compOffs.filter((credit) => !usedCompOffIds.includes(credit.id) || credit.id === row.compOffId).map((credit) => <MenuItem key={credit.id} value={credit.id}>{dayjs(credit.earnedDate).format("DD MMM YYYY")} · expires {dayjs(credit.expiryDate).format("DD MMM YYYY")}</MenuItem>)}</Select></FormControl>}</Stack></TableCell>
            <TableCell><Box onPointerDown={(event) => startFill(event, index)} title={row.leaveType === "C-OFF" ? "C-OFF cannot be drag-filled" : "Drag to fill this leave type"} sx={{ width: 30, height: 30, borderRadius: 1.5, display: "grid", placeItems: "center", color: row.leaveType && row.leaveType !== "C-OFF" ? "#fff" : "#94A3B8", background: row.leaveType && row.leaveType !== "C-OFF" ? "#0057B7" : "#E2E8F0", cursor: row.leaveType && row.leaveType !== "C-OFF" ? "ns-resize" : "not-allowed", touchAction: "none" }}><GripVertical size={16} /></Box></TableCell>
          </TableRow>)}</TableBody>
        </Table></TableContainer>
        <TextField fullWidth multiline minRows={2} label="Reason" value={reason} onChange={(event) => setReason(event.target.value)} sx={{ mt: 2 }} />
        <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 1.5 }}><Button variant="contained" startIcon={<Send size={16} />} onClick={submit} disabled={working}>Submit to SIC</Button></Box>
      </Paper>}

      </Box>
      </Collapse>

      <Collapse in={activeSection === "exchange"} timeout={420} unmountOnExit>
      <Box id="leave-workspace-exchange" sx={{ scrollMarginTop: 110 }}>
        <DutyReassignmentPanel initialMode="exchange" onChanged={loadLeaves} />
      </Box>
      </Collapse>

      <Collapse in={activeSection === "training"} timeout={420} unmountOnExit>
      <Box id="leave-workspace-training" sx={{ scrollMarginTop: 110 }}>
      {!!pendingTrainingApprovals.length && <Paper sx={{ p: 2.5, mb: 2.5, borderColor: "#DDD6FE", background: "#FCFAFF" }}>
        <SectionTitle icon={ShieldCheck} title="Training Approval Inbox" subtitle="Training nominations assigned to you through the reporting hierarchy. Select one or more nominations to approve and forward." count={pendingTrainingApprovals.length} />
        <Alert severity="info" sx={{ mb: 1.5 }}>
          If a shift employee needs a replacement duty or an Acting SIC, use the full Training module to make that assignment before approval.
        </Alert>
        <TableContainer sx={{ border: "1px solid #DDD6FE", borderRadius: 2 }}>
          <Table size="small">
            <TableHead><TableRow sx={{ background: "#F5F3FF" }}>
              <TableCell padding="checkbox"><Checkbox checked={pendingTrainingApprovals.length > 0 && selectedTrainingApprovalIds.length === pendingTrainingApprovals.length} indeterminate={selectedTrainingApprovalIds.length > 0 && selectedTrainingApprovalIds.length < pendingTrainingApprovals.length} onChange={(event) => setSelectedTrainingApprovalIds(event.target.checked ? pendingTrainingApprovals.map((item) => item.id) : [])} /></TableCell>
              <TableCell sx={{ fontWeight: 900 }}>Employee / training days</TableCell>
              <TableCell sx={{ fontWeight: 900 }}>Training</TableCell>
              <TableCell sx={{ fontWeight: 900 }}>Period / location</TableCell>
              <TableCell sx={{ fontWeight: 900 }}>Your approval stage</TableCell>
              <TableCell sx={{ fontWeight: 900 }}>Shift cover</TableCell>
            </TableRow></TableHead>
            <TableBody>
              {pendingTrainingApprovals.map((training) => <Fragment key={training.id}>
              <TableRow hover>
                <TableCell padding="checkbox"><Checkbox checked={selectedTrainingApprovalIds.includes(training.id)} onChange={(event) => setSelectedTrainingApprovalIds((current) => event.target.checked ? [...current, training.id] : current.filter((id) => id !== training.id))} /></TableCell>
                <TableCell><Typography sx={{ fontWeight: 850 }}>{training.employeeName || training.employeeId}</Typography><Typography sx={{ fontSize: 11, color: "#64748B" }}>{training.employeeDesignation || training.employeeId}</Typography><Button size="small" variant="text" sx={{ mt: .2, px: 0, minWidth: 0, fontSize: 10, fontWeight: 900 }} onClick={() => setExpandedTrainingApprovalId((current) => current === training.id ? "" : training.id)}>{expandedTrainingApprovalId === training.id ? "Hide details" : `${training.financialYearTrainingDays || 0} / 7 training days`}</Button></TableCell>
                <TableCell sx={{ fontWeight: 800 }}>{training.trainingName}</TableCell>
                <TableCell><Typography sx={{ fontSize: 12, fontWeight: 750 }}>{dayjs(training.startDate).format("DD MMM YYYY")} to {dayjs(training.endDate).format("DD MMM YYYY")}</Typography><Typography sx={{ fontSize: 11, color: "#64748B" }}>{training.trainingLocation || "Location not specified"}</Typography></TableCell>
                <TableCell><Chip size="small" label={training.currentApproverLevel || "Reporting Officer"} color="warning" variant="outlined" sx={{ fontWeight: 800 }} /></TableCell>
                <TableCell>{training.isShiftEmployee ? <Stack spacing={.35} alignItems="flex-start"><Chip size="small" label={training.groupName || "Shift group"} variant="outlined" /><Typography sx={{ fontSize: 10.5, color: training.replacementRequired ? "#D97706" : "#64748B", fontWeight: 800 }}>{training.replacementRequired ? "Replacement required" : "No replacement marked"}{training.isGroupSIC ? " · SIC" : ""}</Typography></Stack> : <Typography sx={{ fontSize: 12, color: "#64748B" }}>Non-shift employee</Typography>}</TableCell>
              </TableRow>
              {expandedTrainingApprovalId === training.id && <TableRow><TableCell colSpan={6} sx={{ p: 1.2, bgcolor: "#FAFAFF" }}><Box sx={{ display: "grid", gap: .8 }}><Typography sx={{ fontSize: 11, fontWeight: 950, color: "#4C1D95" }}>Training record · {training.financialYear || "Current financial year"}</Typography><Stack direction="row" spacing={.6} useFlexGap flexWrap="wrap">{(training.financialYearTrainingHistory || []).map((item, index) => <Chip key={`${item.trainingName}-${index}`} size="small" label={`${item.trainingName}: ${dayjs(item.startDate).format("DD MMM")}–${dayjs(item.endDate).format("DD MMM")} · ${item.days} day(s)`} sx={{ bgcolor: "#F3E8FF", color: "#6B21A8", fontWeight: 800 }} />)}{!(training.financialYearTrainingHistory || []).length && <Typography sx={{ fontSize: 10.5, color: "#64748B" }}>No approved training in this financial year.</Typography>}</Stack><Typography sx={{ fontSize: 11, fontWeight: 950, color: "#334155" }}>Approval hierarchy</Typography><Stack direction="row" spacing={.6} useFlexGap flexWrap="wrap" alignItems="center">{(training.approvalChain || []).map((step, index) => <Fragment key={`${step.employeeId}-${index}`}><Chip size="small" label={`${step.level || "Approver"}: ${step.name || step.employeeId}`} sx={{ bgcolor: step.status === "Approved" ? "#DCFCE7" : "#FFEDD5", color: step.status === "Approved" ? "#166534" : "#C2410C", border: `1px solid ${step.status === "Approved" ? "#86EFAC" : "#FDBA74"}`, fontWeight: 850 }} />{index < (training.approvalChain || []).length - 1 && <Typography sx={{ color: "#94A3B8", fontWeight: 900 }}>→</Typography>}</Fragment>)}</Stack></Box></TableCell></TableRow>}
              </Fragment>)}
            </TableBody>
          </Table>
        </TableContainer>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1} justifyContent="flex-end" sx={{ mt: 1.5 }}>
          <Button variant="outlined" onClick={() => window.location.assign("/crew/training?section=pending")}>Open detailed training approval</Button>
          <Button color="success" variant="contained" startIcon={<CheckCircle2 size={16} />} onClick={approveTrainingFromLeave} disabled={working || !selectedTrainingApprovalIds.length}>Approve &amp; Forward selected ({selectedTrainingApprovalIds.length})</Button>
        </Stack>
      </Paper>}
      <Paper sx={{ p: 2.5 }}>
        <SectionTitle icon={GraduationCap} title="Approved Training & Adjacent OFF" subtitle="The before/after day is roster OFF, not a leave application. It follows the reporting approval workflow." count={approvedTraining.length} />
        <Alert severity="info" sx={{ mb: 1.5 }}>
          OFF can be requested only after training is finally approved. The approved OFF is written to the duty roster and does not consume a leave balance.
        </Alert>
        <TableContainer sx={{ border: "1px solid #CBD5E1", borderRadius: 2 }}>
          <Table size="small">
            <TableHead><TableRow sx={{ background: "#F5F3FF" }}>
              <TableCell sx={{ fontWeight: 900 }}>Training</TableCell>
              <TableCell sx={{ fontWeight: 900 }}>Dates</TableCell>
              <TableCell sx={{ fontWeight: 900 }}>Location</TableCell>
              <TableCell sx={{ fontWeight: 900 }}>OFF approval status</TableCell>
              <TableCell sx={{ fontWeight: 900, minWidth: 310 }}>Apply for OFF</TableCell>
            </TableRow></TableHead>
            <TableBody>
              {approvedTraining.map((training) => {
                const request = training.adjacentOffRequest;
                const choice = trainingOffChoices[training.id] || { before: false, after: false };
                const canApply = !request || request.status === "Rejected" || request.status === "Cancelled";
                return <TableRow key={training.id} hover>
                  <TableCell sx={{ fontWeight: 850 }}>{training.trainingName}</TableCell>
                  <TableCell sx={{ whiteSpace: "nowrap" }}>{dayjs(training.startDate).format("DD MMM YYYY")} to {dayjs(training.endDate).format("DD MMM YYYY")}</TableCell>
                  <TableCell>{training.trainingLocation || "Not specified"}</TableCell>
                  <TableCell>{request ? <Stack spacing={.5} alignItems="flex-start"><Chip size="small" color={request.status === "Approved" ? "success" : request.status === "Rejected" ? "error" : "warning"} label={request.status} /><Typography sx={{ fontSize: 10.5, fontWeight: 800 }}>OFF: {[request.adjacentOff?.before && "before", request.adjacentOff?.after && "after"].filter(Boolean).join(" & ")}</Typography></Stack> : <Typography sx={{ color: "#64748B", fontSize: 12 }}>Not applied</Typography>}</TableCell>
                  <TableCell>{canApply && <Stack direction="row" spacing={.7} useFlexGap flexWrap="wrap">
                    <Button size="small" variant={choice.before ? "contained" : "outlined"} onClick={() => setTrainingOffChoices((current) => ({ ...current, [training.id]: { before: !choice.before, after: choice.after } }))}>Before</Button>
                    <Button size="small" variant={choice.after ? "contained" : "outlined"} onClick={() => setTrainingOffChoices((current) => ({ ...current, [training.id]: { before: choice.before, after: !choice.after } }))}>After</Button>
                    <Button size="small" color="success" variant="contained" disabled={!choice.before && !choice.after} onClick={() => requestTrainingOff(training)}>Submit for approval</Button>
                  </Stack>}</TableCell>
                </TableRow>;
              })}
              {!approvedTraining.length && <TableRow><TableCell colSpan={5} align="center" sx={{ py: 4, color: "#94A3B8" }}>No approved training is available for your employee account.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </TableContainer>
        <Box sx={{ mt: 1.5, display: "flex", justifyContent: "flex-end" }}><Button variant="outlined" onClick={() => window.location.assign("/crew/training")}>Open full Training module</Button></Box>
      </Paper>
      </Box>
      </Collapse>

      <Collapse in={activeSection === "pending"} timeout={420} unmountOnExit>
      <Box id="leave-workspace-pending" sx={{ scrollMarginTop: 110 }}>
      <Paper sx={{ p: 2.5 }}>
        <SectionTitle icon={ShieldCheck} title="Pending Leave Workflow" subtitle="SIC sees their shift; reporting officers see mapped subordinates; DIC and administrators retain approval controls." count={pending.length} />
        {(role.isSIC || role.isDeptIC || role.isLeaveAuthority || role.isReportingOfficer || role.isAdmin) && (
          <Stack direction="row" spacing={1} sx={{ mb: 1.5 }}>
            <Button size="small" variant={workflowView === "table" ? "contained" : "outlined"} onClick={() => setWorkflowView("table")}>Table view</Button>
            <Button size="small" variant={workflowView === "calendar" ? "contained" : "outlined"} startIcon={<CalendarDays size={14} />} onClick={() => setWorkflowView("calendar")}>Leave calendar</Button>
          </Stack>
        )}
        {workflowView === "calendar" && (role.isSIC || role.isDeptIC || role.isLeaveAuthority || role.isReportingOfficer || role.isAdmin) ? rosterWorkflowCalendar() : workflowTable(pending)}
      </Paper>
      </Box>
      </Collapse>

      <Collapse in={activeSection === "completed"} timeout={420} unmountOnExit>
      <Box id="leave-workspace-completed" sx={{ scrollMarginTop: 110 }}>
      <Paper sx={{ p: 2.5 }}>
        <SectionTitle icon={CheckCircle2} title="Completed Leave" subtitle="Approved, rejected, withdrawn, and cancelled applications. Default view starts from yesterday." count={completed.length} />
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.2} alignItems={{ sm: "center" }} sx={{ mb: 1.5 }}>
          <TextField size="small" type="date" label="From date" value={completedFrom} onChange={(event) => setCompletedFrom(event.target.value)} InputLabelProps={{ shrink: true }} />
          <TextField size="small" type="date" label="To date (optional)" value={completedTo} inputProps={{ min: completedFrom || undefined }} onChange={(event) => setCompletedTo(event.target.value)} InputLabelProps={{ shrink: true }} />
          <Button variant="outlined" startIcon={<RefreshCw size={15} />} onClick={refreshCompleted} disabled={working}>Load completed leave</Button>
          <Typography sx={{ fontSize: 11.5, color: "#64748B" }}>{completedTo ? "Showing selected date range" : "Showing from the start date onward"}</Typography>
        </Stack>
        {workflowTable(completed, true)}
      </Paper>
      </Box>
      </Collapse>
      <Dialog open={rejectDialog.open} onClose={() => setRejectDialog((current) => ({ ...current, open: false }))} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 950 }}>{rejectDialog.stage === "sic" ? "Reject leave at SIC stage" : "Reject leave at DIC stage"}</DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 1.5, color: "#64748B", fontSize: 12 }}>
            {rejectDialog.leaves.length} leave record(s) selected. The comment will be recorded with the rejecting officer and timestamp.
          </Typography>
          <TextField autoFocus fullWidth multiline minRows={3} label="Rejection comment (optional)" value={rejectComment} onChange={(event) => setRejectComment(event.target.value)} inputProps={{ maxLength: 1000 }} />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setRejectDialog((current) => ({ ...current, open: false }))}>Cancel</Button>
          <Button color="error" variant="contained" onClick={confirmReject}>Reject leave</Button>
        </DialogActions>
      </Dialog>
      {working && <Box sx={{ position: "fixed", inset: 0, zIndex: 1700, display: "grid", placeItems: "center", background: "rgba(8,16,58,.16)", pointerEvents: "none" }}><CircularProgress /></Box>}
    </Box>
  );
}
