import { useEffect, useMemo, useRef, useState, memo, useCallback } from "react";
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControl, InputLabel, IconButton, MenuItem, Paper, Select, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Tooltip, Typography,
} from "@mui/material";
import { ArrowLeftRight, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, GraduationCap, Medal, MousePointer2, RefreshCw, Umbrella, X } from "lucide-react";
import { useNavigate } from "react-router-dom";

import AppShell from "../../components/layout/AppShell";
import { useAuth } from "../../auth/AuthContext";
import GlassCard from "../../components/ui/GlassCard";
import DutyReassignmentPanel from "../../components/crew/DutyReassignmentPanel";
import TrainingCalendarReview from "../../components/crew/TrainingCalendarReview";
import crewApi from "../../services/crewApi";
import LeaveManagement from "../../crewLegacy/LeaveManagement";
import TrainingHolidayMaster from "../../crewLegacy/TrainingHolidayMaster";
import SportsManagement from "./SportsManagement";

const iso = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};
const addDays = (dateStr, amount) => {
  if (!dateStr || typeof dateStr !== "string" || !dateStr.includes("-")) {
    return iso(new Date());
  }
  const parts = dateStr.split("-").map(Number);
  if (parts.some(isNaN) || parts.length < 3) {
    return iso(new Date());
  }
  const next = new Date(parts[0], parts[1] - 1, parts[2]);
  next.setDate(next.getDate() + amount);
  return iso(next);
};
const parseLocalDate = (dateStr) => {
  if (!dateStr || typeof dateStr !== "string" || !dateStr.includes("-")) {
    return new Date();
  }
  const parts = dateStr.split("-").map(Number);
  if (parts.some(isNaN) || parts.length < 3) {
    return new Date();
  }
  return new Date(parts[0], parts[1] - 1, parts[2]);
};
const displayDate = (dateStr) => new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short" }).format(parseLocalDate(dateStr));
const displayFullDate = (dateStr) => new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(parseLocalDate(dateStr));
const weekday = (dateStr) => new Intl.DateTimeFormat("en-IN", { weekday: "short" }).format(parseLocalDate(dateStr));
const compactShift = (value) => {
  const duty = String(value || "").trim().toUpperCase();
  if (["M", "M1", "M2", "MORNING"].includes(duty)) return "Morning";
  if (["E", "E1", "E2", "EVENING"].includes(duty)) return "Evening";
  if (["N", "N1", "N2", "NIGHT"].includes(duty)) return "Night";
  if (["O", "O1", "O2", "OFF"].includes(duty)) return "OFF";
  return duty || "-";
};
const replacementSourceLabel = (source) => ({
  replacement: "Replacement tagged",
  shift: "Same shift",
  otherShift: "Other shift",
  organization: "Organization",
}[source] || "Eligible");
const replacementLabelSx = {
  alignSelf: "center",
  justifyContent: "center",
  width: "100%",
  mt: .15,
  px: .5,
  py: .1,
  borderRadius: 1,
  border: "1px solid #93C5FD",
  background: "#DBEAFE",
  color: "#1D4ED8",
  fontSize: 9,
  fontWeight: 950,
  lineHeight: 1.2,
  display: "flex",
  alignItems: "center",
  textAlign: "center",
  gap: .4,
};

const shiftStyle = (duty) => {
  const leave = String(duty?.leaveStatus || "").trim().toLowerCase();
  const adjacentOff = String(duty?.trainingAdjacentOffStatus || "").trim().toLowerCase();
  const shift = String(duty?.shift || "").trim().toUpperCase();
  const activeLeave = leave && !["rejected", "cancelled", "canceled", "withdrawn"].includes(leave);

  if (adjacentOff && adjacentOff !== "approved") return { background: "#FFF7ED", color: "#9A3412", border: "#FB923C" };
  if (leave === "approved") return { background: "#FEE2E2", color: "#B91C1C", border: "#F87171" };
  if (activeLeave) return { background: "#FFEDD5", color: "#C2410C", border: "#FB923C" };
  if (duty?.trainingName || shift.includes("TRAINING") || shift.includes("TOUR")) {
    return { background: "#F3E8FF", color: "#6B21A8", border: "#C4B5FD" };
  }
  if (duty?.sportsName || shift.includes("SPORTS")) {
    return { background: "#D1FAE5", color: "#065F46", border: "#6EE7B7" };
  }

  if (["MORNING", "M1", "M2"].includes(shift)) return { background: "#DCFCE7", color: "#14532D", border: "#86EFAC" };
  if (["EVENING", "E1", "E2"].includes(shift)) return { background: "#FEF3C7", color: "#78350F", border: "#FCD34D" };
  if (["NIGHT", "N1", "N2"].includes(shift)) return { background: "#DBEAFE", color: "#1E3A8A", border: "#93C5FD" };
  if (["OFF", "O1", "O2"].includes(shift)) return { background: "#E5E7EB", color: "#111827", border: "#9CA3AF" };
  return { background: "#F8FAFC", color: "#000000", border: "#D6DEE8" };
};

const isPendingDuty = (duty) => Boolean(
  (duty.leaveStatus && !["approved", "rejected", "cancelled", "canceled", "withdrawn"].includes(String(duty.leaveStatus).toLowerCase()))
  || ["Pending Approval", "Nominated"].includes(duty.trainingStatus)
  || ["Pending Approval", "Nominated"].includes(duty.trainingAdjacentOffStatus)
);

const leaveLabel = (duty) => {
  if (duty?.stationLeaveOnly) return "Station Leave";
  const leaveType = duty?.leaveType || "Leave";
  return duty?.stationLeave ? `${leaveType} + Station Leave` : leaveType;
};

function PublicCalendarShell({ children }) {
  return <Box sx={{ height: "100dvh", p: 1, boxSizing: "border-box", background: "#F8FAFC", overflow: "hidden" }}>{children}</Box>;
}

const EmployeeRow = memo(({ person, groupName, active, dates, selectedColumn, onSelectRow, onSelectDuty, applicationMode = false, applicationKeys = new Set(), readOnly = false }) => {
  return (
    <TableRow hover={!readOnly} onClick={() => !readOnly && onSelectRow(person.employeeId)} sx={{ cursor: readOnly ? "default" : "pointer", background: active ? "#F0FDFA" : person.IsSIC ? "#F8FFFC" : "#FFF" }}>
      <TableCell sx={{ position: "sticky", left: 0, zIndex: 2, minWidth: 210, py: .65, background: active ? "#D1FAE5" : person.IsSIC ? "#ECFDF5" : "#FFF", borderRight: "1px solid #E2E8F0" }}>
        <Stack direction="row" spacing={.7} alignItems="center"><Box><Typography sx={{ fontSize: 12.5, fontWeight: 900, color: "#0F172A" }}>{person.name || person.employeeId}</Typography><Typography sx={{ fontSize: 10.5, color: "#64748B" }}>{person.designation || "—"}</Typography></Box>{person.IsSIC && <Chip label="SIC" size="small" sx={{ height: 18, fontSize: 9, fontWeight: 900, background: "#D1FAE5", color: "#03624C" }} />}</Stack>
      </TableCell>
      {dates.map((date) => {
        const duty = person.duties?.[date] || { shift: "-" };
        const palette = shiftStyle(duty);
        const columnActive = selectedColumn === date;
        const replacementPending = Boolean(duty.replacementRequired && !duty.replacementEmployee?.name);
        const leaveApproved = String(duty.leaveStatus || "").toLowerCase() === "approved";
        const hasLeave = Boolean(duty.leaveStatus);
        const isHoliday = Boolean(duty.isHoliday);
        const additionalDuties = duty.additionalDuties || [];
        const primaryDutyLabel = duty.vacatedDuty
          ? `Vacant (${compactShift(duty.vacatedDuty)})`
          : compactShift(duty.shift);
        const leaveTip = duty.leaveStatus ? `${leaveLabel(duty)} · ${duty.leaveStatus}` : "";
        const applicationSelected = applicationKeys.has(`${person.employeeId}:${date}`);
        return <TableCell key={date} align="center" sx={{ p: .4, background: active ? "#F0FDFA" : columnActive ? "#F0FDF4" : "#FFF" }}>
          <Box
            role={readOnly ? undefined : "button"}
            tabIndex={readOnly ? undefined : 0}
            aria-label={`${person.name || person.employeeId}, ${date}, ${duty.shift || "no duty"}`}
            onClick={(event) => {
              if (!readOnly) {
                event.stopPropagation();
                onSelectDuty({ person, groupName, date, duty });
              }
            }}
            onKeyDown={(event) => {
              if (!readOnly && (event.key === "Enter" || event.key === " ")) {
                event.preventDefault();
                event.stopPropagation();
                onSelectDuty({ person, groupName, date, duty });
              }
            }}
            className="crew-calendar-duty-cell"
            sx={{ position: "relative", minHeight: 42, width: "100%", boxSizing: "border-box", px: .5, py: .4, display: "grid", placeItems: "center", alignContent: "center", textAlign: "center", cursor: readOnly ? "default" : "pointer", borderRadius: 1.7, backgroundColor: palette.background, backgroundImage: isHoliday ? "linear-gradient(90deg,#A855F7 0 4px,transparent 4px)" : "none", color: palette.color, border: `1px solid ${applicationSelected ? "#0057B7" : isHoliday ? "#A855F7" : palette.border}`, boxShadow: applicationSelected ? "0 0 0 3px rgba(0,87,183,.24)" : "none", "& .MuiTypography-root": { color: "inherit", textAlign: "center" }, "&:hover": readOnly ? {} : { boxShadow: "0 0 0 2px rgba(0,87,183,.18)" } }}
          >
            {applicationMode && <Box sx={{ position: "absolute", top: 2, left: 2, width: 14, height: 14, borderRadius: "50%", display: "grid", placeItems: "center", color: "#FFF", background: applicationSelected ? "#0057B7" : "rgba(100,116,139,.55)", fontSize: 9, fontWeight: 950 }}>{applicationSelected ? "✓" : "+"}</Box>}
            {isHoliday && <Tooltip title={`${duty.holidayName || "Holiday"} · shift duty continues`} arrow><Box aria-label={duty.holidayName || "Holiday"} sx={{ position: "absolute", top: 2, right: 2, width: 14, height: 14, borderRadius: "50%", display: "grid", placeItems: "center", background: "#9333EA", color: "#FFF", fontSize: 7.5, fontWeight: 950, lineHeight: 1 }}>H</Box></Tooltip>}
            {hasLeave ? (
              <Tooltip title={`${duty.shift || "Duty"} · ${leaveTip}`} arrow>
                <Stack className="crew-calendar-duty-content" direction="row" spacing={.45} alignItems="center" justifyContent="center" sx={{ width: "100%", minWidth: 0, mx: "auto", cursor: "help", textAlign: "center" }}>
                  <Typography component="span" sx={{ fontSize: 10.5, fontWeight: 950, lineHeight: 1 }}>{compactShift(duty.shift)}</Typography>
                  <Typography component="span" sx={{ fontSize: 10.5, fontWeight: 950, lineHeight: 1 }}>{leaveLabel(duty)}</Typography>
                  {leaveApproved ? <CheckCircle2 size={13} color="#15803D" strokeWidth={3} aria-label="Approved leave" /> : <Box aria-label="Pending leave" sx={{ width: 10, height: 10, borderRadius: "50%", background: "#FB923C", border: "1px solid #C2410C" }} />}
                </Stack>
              </Tooltip>
            ) : <Stack className="crew-calendar-duty-content" direction="row" spacing={.45} alignItems="center" justifyContent="center" sx={{ width: "100%", minWidth: 0, textAlign: "center" }}><Typography sx={{ fontSize: 11.5, fontWeight: 900 }}>{primaryDutyLabel}</Typography>{additionalDuties.map((extra, index) => <Tooltip key={`${extra.shift}-${index}`} title={`Additional replacement duty: ${extra.shift}${extra.groupName ? ` · ${extra.groupName}` : ""}${extra.replacementFor?.name ? ` · for ${extra.replacementFor.name}` : ""}`} arrow><Typography sx={{ fontSize: 10.5, fontWeight: 950, color: "#1E3A8A" }}>{`(Add. ${compactShift(extra.shift)})`}</Typography></Tooltip>)}</Stack>}
            {duty.trainingName && <Tooltip title={`Training: ${duty.trainingName}`} arrow><Typography component="span" sx={{ width: "100%", fontSize: 9, fontWeight: 800, textAlign: "center" }}>{duty.trainingName}</Typography></Tooltip>}
            {["Pending Approval", "Nominated"].includes(duty.trainingStatus) && <Typography sx={{ fontSize: 9, fontWeight: 900 }}>Training · Pending approval</Typography>}
            {duty.trainingAdjacentOffStatus && <Tooltip title={`${duty.trainingAdjacentOffPosition || "Training adjacent OFF"} · ${duty.trainingAdjacentOffStatus}${duty.trainingAdjacentOffCurrentApproverName ? ` · awaiting ${duty.trainingAdjacentOffCurrentApproverName}` : ""}`} arrow><Typography component="span" sx={{ width: "100%", fontSize: 9, fontWeight: 950, textAlign: "center", color: duty.trainingAdjacentOffStatus === "Approved" ? "#15803D" : "#C2410C" }}>{`OFF request · ${duty.trainingAdjacentOffStatus}`}</Typography></Tooltip>}
            {duty.sportsName && <Tooltip title={`Sports: ${duty.sportsName}`} arrow><Typography component="span" sx={{ width: "100%", fontSize: 9, fontWeight: 800, textAlign: "center" }}>{duty.sportsName}</Typography></Tooltip>}
            {replacementPending && <Tooltip title="Replacement required; assignment pending" arrow><Box sx={{ mt: .15, width: 17, height: 17, borderRadius: .7, display: "grid", placeItems: "center", alignSelf: "center", background: "#F59E0B", color: "#FFFFFF", fontSize: 9, fontWeight: 950, animation: "calendarReplacementPulse .9s ease-in-out infinite", "@keyframes calendarReplacementPulse": { "50%": { opacity: .3, transform: "scale(.84)" } } }}>R</Box></Tooltip>}
            {duty.replacementEmployee?.name && <Tooltip title={`Replacement assigned: ${duty.replacementEmployee.name}${duty.replacementEmployee.employeeId ? ` (${duty.replacementEmployee.employeeId})` : ""}`} arrow><Box sx={replacementLabelSx}><Box sx={{ width: 15, height: 15, borderRadius: .6, display: "grid", placeItems: "center", background: "#2563EB", color: "#FFF", fontSize: 8.5, flex: "0 0 auto" }}>R</Box><Box>{duty.replacementEmployee.name}</Box></Box></Tooltip>}
            {duty.replacementFor?.name && <Tooltip title={`Replacement duty for ${duty.replacementFor.name}${duty.replacementFor.employeeId ? ` (${duty.replacementFor.employeeId})` : ""}`} arrow><Box sx={replacementLabelSx}><Box sx={{ width: 15, height: 15, borderRadius: .6, display: "grid", placeItems: "center", background: "#2563EB", color: "#FFF", fontSize: 8.5, flex: "0 0 auto" }}>R</Box><Box>{duty.replacementFor.name}</Box></Box></Tooltip>}
            {duty.isActingSIC && <Typography sx={{ fontSize: 9.5, fontWeight: 900, color: "#6A1B9A" }}>Acting SIC · {duty.actingSICGroup || groupName}</Typography>}
          </Box>
        </TableCell>;
      })}
    </TableRow>
  );
});

export default function CrewCalendar({ publicView = false }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const today = iso(new Date());
  const [startDate, setStartDate] = useState(publicView ? today : addDays(today, -2));
  const [endDate, setEndDate] = useState(publicView ? addDays(today, 7) : addDays(today, 10));
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedRow, setSelectedRow] = useState("");
  const [selectedColumn, setSelectedColumn] = useState("");
  const [exchangeOpen, setExchangeOpen] = useState(false);
  const [reassignmentContext, setReassignmentContext] = useState({ mode: "exchange", date: "", employeeId: "" });
  const [selectedDuty, setSelectedDuty] = useState(null);
  const [leaveApprovalPopup, setLeaveApprovalPopup] = useState(null);
  const [trainingApprovalPopup, setTrainingApprovalPopup] = useState(null);
  const [replacementPopup, setReplacementPopup] = useState(null);
  const [replacementCandidates, setReplacementCandidates] = useState([]);
  const [replacementLoading, setReplacementLoading] = useState(false);
  const [replacementError, setReplacementError] = useState("");
  const [assigningCandidate, setAssigningCandidate] = useState("");
  const [replacementCandidateFilter, setReplacementCandidateFilter] = useState("shift_engineer");
  const [candidateHistory, setCandidateHistory] = useState({ open: false, employee: null, rows: [], loading: false, error: "" });
  const [applicationMode, setApplicationMode] = useState(false);
  const [applicationSelections, setApplicationSelections] = useState([]);
  const [applicationNotice, setApplicationNotice] = useState("");
  const [applicationDialogOpen, setApplicationDialogOpen] = useState(false);
  const [applicationActivity, setApplicationActivity] = useState("leave");
  const [applicationFrom, setApplicationFrom] = useState(today);
  const [applicationTo, setApplicationTo] = useState(today);
  const [applicationEmployee, setApplicationEmployee] = useState(null);
  const [calendarFilter, setCalendarFilter] = useState(() => {
    const filter = new URLSearchParams(window.location.search).get("filter");
    return ["pending", "coverage"].includes(filter) ? filter : "all";
  });
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [candidateSearch, setCandidateSearch] = useState("");
  const [calendarNotice, setCalendarNotice] = useState("");
  const [crewRole, setCrewRole] = useState({});
  const loadIdRef = useRef(0);

  const dates = useMemo(() => {
    const output = [];
    if (!startDate || !endDate || startDate > endDate) return output;
    
    let current = startDate;
    let limit = 0;
    while (current <= endDate && limit < 60) {
      output.push(current);
      current = addDays(current, 1);
      limit++;
    }
    return output;
  }, [startDate, endDate]);

  const load = async () => {
    const loadId = loadIdRef.current + 1;
    loadIdRef.current = loadId;
    setLoading(true);
    setError("");
    try {
      const response = await crewApi.calendar(startDate, endDate);
      if (loadId !== loadIdRef.current) return;
      
      const sortedResponse = response.map(group => ({
        ...group,
        employees: [...group.employees].sort((a, b) => {
          if (a.IsSIC && !b.IsSIC) return -1;
          if (!a.IsSIC && b.IsSIC) return 1;
          return 0;
        })
      }));
      
      setData(sortedResponse);
      setLeaveApprovalPopup((current) => {
        if (!current) return null;
        const person = sortedResponse.flatMap((group) => group.employees).find((item) => item.employeeId === current.person.employeeId);
        return person?.duties?.[current.date] ? { ...current, person, duty: { ...person.duties[current.date], leaveRequestId: current.duty.leaveRequestId } } : current;
      });
    } catch (requestError) {
      if (loadId !== loadIdRef.current) return;
      setData([]);
      setError(requestError.response?.data?.detail || "Unable to load the duty calendar.");
    } finally {
      if (loadId === loadIdRef.current) setLoading(false);
    }
  };

  useEffect(() => { load(); }, [startDate, endDate]);
  useEffect(() => {
    if (!publicView) crewApi.myRole().then(setCrewRole).catch(() => setCrewRole({}));
  }, [publicView, user?.employeeId]);

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, []);

  const move = (days) => {
    setStartDate((value) => addDays(value, days));
    setEndDate((value) => addDays(value, days));
  };

  const activeGroups = useMemo(() => data.map((group) => ({
    ...group,
    employees: group.employees.filter((person) => {
      const matchesName = `${person.name} ${person.employeeId} ${group.groupName}`.toLowerCase().includes(employeeSearch.trim().toLowerCase());
      const duties = Object.values(person.duties || {});
      return matchesName && (calendarFilter === "all" || (calendarFilter === "pending" ? duties.some(isPendingDuty) : duties.some((duty) => duty.replacementRequired && !duty.replacementEmployee?.employeeId)));
    }),
  })).filter((group) => group.employees.length), [data, employeeSearch, calendarFilter]);
  const visibleCandidates = replacementCandidates.filter((candidate) => `${candidate.name} ${candidate.employeeId} ${candidate.groupName || ""}`.toLowerCase().includes(candidateSearch.trim().toLowerCase()));
  const holidayByDate = useMemo(() => {
    const result = {};
    data.forEach((group) => (group.employees || []).forEach((person) => Object.entries(person.duties || {}).forEach(([date, duty]) => {
      if (duty?.isHoliday) result[date] = duty.holidayName || "Holiday";
    })));
    return result;
  }, [data]);
  const canManageReplacement = !publicView && Boolean(crewRole.isAdmin || crewRole.isSIC || crewRole.isDeptIC || crewRole.isLeaveAuthority || user?.role === "admin" || user?.permissions?.crew_replacement?.write || user?.permissions?.crew_leave?.write || user?.permissions?.crew_training?.write || user?.permissions?.crew_training?.approve);
  const openLeaveWorkflow = () => {
    if (!selectedDuty) return;
    setLeaveApprovalPopup(selectedDuty);
    setSelectedDuty(null);
  };
  const openReplacementWorkflow = () => {
    if (!selectedDuty) return;
    openReplacementCandidates(selectedDuty);
  };
  const openTrainingWorkflow = () => {
    if (!selectedDuty) return;
    if (selectedDuty.duty.trainingAdjacentOffRequestId || selectedDuty.duty.trainingNominationId) {
      setTrainingApprovalPopup(selectedDuty);
      setSelectedDuty(null);
      return;
    }
    navigate(`/crew/training?section=pending&date=${selectedDuty.date}&employeeId=${encodeURIComponent(selectedDuty.person.employeeId)}`);
  };

  const openReplacementCandidates = useCallback(async (selection) => {
    setSelectedRow(selection.person.employeeId);
    setSelectedColumn(selection.date);
    setSelectedDuty(null);
    setReplacementPopup({ ...selection, source: null });
    setReplacementCandidates([]);
    setCandidateSearch("");
    setReplacementError("");
    setReplacementLoading(true);
    try {
      const trainingNominationId = String(selection.duty.trainingNominationId || "").trim();
      if (selection.duty.trainingName) {
        if (!trainingNominationId) {
          setReplacementError("This approved training entry is missing its nomination reference. Refresh the calendar or open Training Management to review it.");
          return;
        }
        const response = await crewApi.trainingReplacementCandidates(trainingNominationId);
        const candidates = (response?.candidates || []).map((candidate, index) => ({
          ...candidate,
          serialNo: index + 1,
          assignedDuty: candidate.dutySummary,
          source: candidate.source,
          eligibility: candidate.hasConflict ? "Leave/training conflict recorded" : "Available for the training period",
          requiredDuty: selection.duty.trainingOriginalDuty || "Training coverage",
        }));
        setReplacementCandidateFilter("all");
        setReplacementPopup((current) => current ? {
          ...current,
          source: { kind: "training", id: trainingNominationId },
        } : current);
        setReplacementCandidates(candidates);
        return;
      }
      const sportsApplicationId = String(selection.duty.sportsApplicationId || "").trim();
      if (selection.duty.sportsName) {
        if (!sportsApplicationId) {
          setReplacementError("This approved sports entry is missing its application reference. Refresh the calendar or open Sports Management to review it.");
          return;
        }
        const response = await crewApi.sportsReplacementCandidates(sportsApplicationId);
        const candidates = (response?.candidates || []).map((candidate, index) => ({
          ...candidate,
          serialNo: index + 1,
          assignedDuty: candidate.dutySummary,
          eligibility: candidate.hasConflict ? "Leave/training/sports conflict recorded" : "Available for the sports period",
          requiredDuty: selection.duty.sportsOriginalDuty || "Sports coverage",
        }));
        setReplacementCandidateFilter("all");
        setReplacementPopup((current) => current ? {
          ...current,
          source: { kind: "sports", id: sportsApplicationId },
        } : current);
        setReplacementCandidates(candidates);
        return;
      }
      const leaveRequestId = String(selection.duty.leaveRequestId || "").trim();
      let leave = leaveRequestId ? {
        id: leaveRequestId,
        date: selection.date,
        employeeId: selection.person.employeeId,
        name: selection.person.name,
        groupName: selection.groupName,
        assignedDuty: selection.duty.shift,
        isSIC: Boolean(selection.person.IsSIC),
      } : null;
      if (!leave) {
        const pending = await crewApi.pendingReplacements();
        leave = pending.find((item) => (
          item.date === selection.date
          && String(item.employeeId || "") === String(selection.person.employeeId || "")
        ));
      }
      if (!leave) {
        setReplacementError("This replacement request is not available in your current approval scope. Open Replacement Management to review it.");
        return;
      }
      const defaultFilter = leave.isSIC ? "sic" : "shift_engineer";
      setReplacementCandidateFilter(defaultFilter);
      const candidates = await crewApi.replacementCandidates(leave.id, defaultFilter);
      setReplacementPopup((current) => current ? { ...current, source: { kind: "leave", id: leave.id }, leave } : current);
      setReplacementCandidates(candidates || []);
    } catch (requestError) {
      setReplacementError(requestError.response?.data?.detail || "Replacement candidates could not be loaded.");
    } finally {
      setReplacementLoading(false);
    }
  }, []);

  const changeReplacementCandidateFilter = async (value) => {
    setReplacementCandidateFilter(value);
    if (replacementPopup?.source?.kind === "training") return;
    if (!replacementPopup?.leave?.id) return;
    setReplacementLoading(true);
    setReplacementError("");
    try {
      const candidates = await crewApi.replacementCandidates(replacementPopup.leave.id, value);
      setReplacementCandidates(candidates || []);
    } catch (requestError) {
      setReplacementError(requestError.response?.data?.detail || "Replacement candidates could not be loaded.");
    } finally {
      setReplacementLoading(false);
    }
  };

  const openCandidateHistory = async (candidate) => {
    setCandidateHistory({ open: true, employee: candidate, rows: [], loading: true, error: "" });
    try {
      const rows = await crewApi.replacementHistory(candidate.employeeId);
      setCandidateHistory((current) => ({ ...current, rows: rows || [], loading: false }));
    } catch (requestError) {
      setCandidateHistory((current) => ({ ...current, loading: false, error: requestError.response?.data?.detail || "Replacement-duty history could not be loaded." }));
    }
  };

  const assignCandidate = async (candidate) => {
    if (!replacementPopup?.source?.id) return;
    setAssigningCandidate(candidate.employeeId);
    setReplacementError("");
    try {
      const payload = {
        replacementEmployeeId: candidate.employeeId,
        mode: "normal",
        halfDuty: false,
        reason: "Assigned from the duty calendar",
      };
      if (replacementPopup.source.kind === "training") {
        await crewApi.assignTrainingReplacement(replacementPopup.source.id, payload);
      } else if (replacementPopup.source.kind === "sports") {
        await crewApi.assignSportsReplacement(replacementPopup.source.id, payload);
      } else {
        await crewApi.assignReplacement(replacementPopup.source.id, payload);
      }
      setReplacementPopup(null);
      setCalendarNotice(`Replacement assigned to ${candidate.name || candidate.employeeId}.`);
      await load();
    } catch (requestError) {
      setReplacementError(requestError.response?.data?.detail || "Replacement could not be assigned.");
    } finally {
      setAssigningCandidate("");
    }
  };

  const openExchangeFromReplacement = () => {
    if (!replacementPopup) return;
    setReassignmentContext({
      mode: "exchange",
      date: replacementPopup.date,
      employeeId: "",
    });
    setReplacementPopup(null);
    setExchangeOpen(true);
  };

  const handleSelectRow = useCallback((employeeId) => {
    setSelectedRow(employeeId);
  }, []);

  const handleSelectDuty = useCallback((selection) => {
    if (applicationMode) {
      setApplicationNotice("");
      setApplicationSelections((current) => {
        const key = `${selection.person.employeeId}:${selection.date}`;
        if (current.some((item) => `${item.person.employeeId}:${item.date}` === key)) {
          return current.filter((item) => `${item.person.employeeId}:${item.date}` !== key);
        }
        if (current.some((item) => item.person.employeeId !== selection.person.employeeId)) {
          setApplicationNotice("One application can contain dates for one employee. Selection restarted for the newly selected employee.");
          return [selection];
        }
        return [...current, selection].sort((a, b) => a.date.localeCompare(b.date));
      });
      return;
    }
    setSelectedRow(selection.person.employeeId);
    setSelectedColumn(selection.date);
    if (selection.duty.trainingAdjacentOffRequestId) {
      setTrainingApprovalPopup(selection);
      return;
    }
    if (selection.duty.leaveStatus && String(selection.duty.leaveStatus).toLowerCase() !== "approved") {
      setLeaveApprovalPopup(selection);
      return;
    }
    if (["Pending Approval", "Nominated"].includes(selection.duty.trainingStatus)) {
      setTrainingApprovalPopup(selection);
      return;
    }
    if (canManageReplacement && selection.duty.replacementRequired && !selection.duty.replacementEmployee?.name) {
      openReplacementCandidates(selection);
      return;
    }
    if (selection.duty.trainingNominationId) {
      setTrainingApprovalPopup(selection);
      return;
    }
    if (selection.duty.leaveStatus) {
      setLeaveApprovalPopup(selection);
      return;
    }
    if (!selection.duty.sportsName && !selection.duty.replacementFor && !selection.duty.vacatedDuty && !selection.duty.isActingSIC) {
      setApplicationSelections([selection]);
      setApplicationEmployee(selection.person);
      setApplicationFrom(selection.date);
      setApplicationTo(selection.date);
      setApplicationActivity("leave");
      setApplicationDialogOpen(true);
      return;
    }
    setSelectedDuty(selection);
  }, [applicationMode, canManageReplacement, openReplacementCandidates]);

  const applicationKeys = useMemo(() => new Set(applicationSelections.map((item) => `${item.person.employeeId}:${item.date}`)), [applicationSelections]);
  const selectedApplicationDates = applicationSelections.map((item) => item.date);
  const selectedApplicationEmployee = applicationSelections[0]?.person;
  const popupApplicationEmployee = selectedApplicationEmployee || applicationEmployee;
  const typedApplicationDates = useMemo(() => {
    const output = [];
    if (!applicationFrom || !applicationTo || applicationFrom > applicationTo) return output;
    let current = applicationFrom;
    let guard = 0;
    while (current <= applicationTo && guard < 60) {
      output.push(current);
      current = addDays(current, 1);
      guard += 1;
    }
    return output;
  }, [applicationFrom, applicationTo]);
  const effectiveApplicationDates = selectedApplicationDates.length ? selectedApplicationDates : typedApplicationDates;
  const openCalendarApplication = () => {
    const firstDate = selectedApplicationDates[0] || selectedColumn || today;
    const lastDate = selectedApplicationDates[selectedApplicationDates.length - 1] || firstDate;
    setApplicationEmployee(selectedApplicationEmployee || null);
    setApplicationFrom(firstDate);
    setApplicationTo(lastDate);
    setApplicationDialogOpen(true);
  };
  const dismissCalendarApplication = () => {
    setApplicationDialogOpen(false);
    setApplicationMode(false);
    setApplicationSelections([]);
    setApplicationEmployee(null);
    setApplicationNotice("");
  };
  const closeCalendarApplication = () => {
    dismissCalendarApplication();
    setCalendarNotice("Request saved. The calendar has been refreshed.");
    load();
  };

  const CalendarPageShell = publicView ? PublicCalendarShell : AppShell;
  return (
    <CalendarPageShell viewportLocked={!publicView}>
      <Box sx={{ height: publicView ? "calc(100dvh - 16px)" : "100%", minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column", gap: 1.15 }}>
      <Box sx={{ px: { xs: 1.5, md: 2 }, py: 1.25, borderRadius: 3, background: "linear-gradient(105deg,#081F5C 0%,#075DB8 62%,#1678D4 100%)", color: "#FFF", display: "flex", alignItems: "center", gap: 1.2, flexWrap: { xs: "wrap", xl: "nowrap" } }}>
        <Box sx={{ minWidth: { md: 220 }, mr: { xl: "auto" } }}>
          <Typography sx={{ fontSize: 19, fontWeight: 950, lineHeight: 1.05 }}>Daily Duty Calendar</Typography>
          <Typography sx={{ mt: .25, fontSize: 10.5, color: "rgba(255,255,255,.82)" }}>Click a duty to apply, review approval or assign cover</Typography>
        </Box>
        {!publicView && <><Stack direction="row" spacing={.35} alignItems="center">
          <Tooltip title="Previous 7 days"><IconButton size="small" onClick={() => move(-7)} sx={{ color: "#FFF", border: "1px solid rgba(255,255,255,.35)" }}><ChevronLeft size={17} /></IconButton></Tooltip>
          <Button onClick={() => { setStartDate(addDays(today, -7)); setEndDate(addDays(today, 7)); }} startIcon={<CalendarDays size={15} />} size="small" sx={{ minHeight: 32, color: "#073B75", background: "#FFF", borderRadius: 2, textTransform: "none", fontWeight: 900, "&:hover": { background: "#F1F5F9" } }}>Today</Button>
          <Tooltip title="Next 7 days"><IconButton size="small" onClick={() => move(7)} sx={{ color: "#FFF", border: "1px solid rgba(255,255,255,.35)" }}><ChevronRight size={17} /></IconButton></Tooltip>
        </Stack>
        <Stack direction="row" spacing={.55} alignItems="center">
          <input aria-label="Start date" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} style={{ width: 126, border: "1px solid rgba(255,255,255,.55)", borderRadius: 8, padding: "6px 8px", fontSize: 11, fontWeight: 750 }} />
          <Typography sx={{ color: "rgba(255,255,255,.8)", fontSize: 11 }}>to</Typography>
          <input aria-label="End date" type="date" min={startDate} value={endDate} onChange={(event) => setEndDate(event.target.value)} style={{ width: 126, border: "1px solid rgba(255,255,255,.55)", borderRadius: 8, padding: "6px 8px", fontSize: 11, fontWeight: 750 }} />
        </Stack>
        <Button size="small" startIcon={<RefreshCw size={15} />} onClick={load} sx={{ minHeight: 32, color: "#FFF", border: "1px solid rgba(255,255,255,.55)", borderRadius: 2, textTransform: "none", fontWeight: 850 }}>Refresh</Button>
        <Button size="small" startIcon={<MousePointer2 size={15} />} onClick={openCalendarApplication} sx={{ minHeight: 32, color: applicationMode ? "#073B75" : "#FFF", background: applicationMode ? "#FFF" : "transparent", border: "1px solid rgba(255,255,255,.65)", borderRadius: 2, textTransform: "none", fontWeight: 900 }}>{applicationMode ? `Continue application${applicationSelections.length ? ` (${applicationSelections.length})` : ""}` : "Apply from calendar"}</Button>
        {applicationMode && <Tooltip title="Cancel application selection"><IconButton size="small" onClick={() => { setApplicationMode(false); setApplicationSelections([]); setApplicationNotice(""); }} sx={{ color: "#FFF", border: "1px solid rgba(255,255,255,.55)" }}><X size={16} /></IconButton></Tooltip>}
        <Button size="small" startIcon={<ArrowLeftRight size={15} />} onClick={() => { setReassignmentContext({ mode: "exchange", date: selectedColumn || today, employeeId: "" }); setExchangeOpen(true); }} sx={{ minHeight: 32, color: "#0755A5", background: "#FFF", borderRadius: 2, textTransform: "none", fontWeight: 900, whiteSpace: "nowrap", "&:hover": { background: "#F1F5F9" } }}>Duty exchange / reassignment</Button></>}
      </Box>

      {error && <Alert severity="error">{error}</Alert>}
      {calendarNotice && <Alert severity="success" onClose={() => setCalendarNotice("")}>{calendarNotice}</Alert>}
      {applicationNotice && <Alert severity="info" sx={{ py: 0 }}>{applicationNotice}</Alert>}
      {!publicView && <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        <TextField size="small" label="Find employee or group" value={employeeSearch} onChange={(event) => setEmployeeSearch(event.target.value)} sx={{ minWidth: 220 }} />
        {[["all", "All duties"], ["pending", "Pending approval"], ["coverage", "Replacement needed"]].map(([value, label]) => <Button key={value} variant={calendarFilter === value ? "contained" : "outlined"} onClick={() => setCalendarFilter(value)} sx={{ textTransform: "none" }}>{label}</Button>)}
        <Button onClick={() => { setApplicationActivity("training"); openCalendarApplication(); }} startIcon={<GraduationCap size={16} />}>Apply training</Button>
        <Button onClick={() => { setApplicationMode(true); setApplicationSelections([]); setApplicationNotice("Select dates for one employee, then click Continue application."); }}>Select several dates</Button>
      </Stack>}
      <Box sx={{ px: 1, py: .45, display: "flex", alignItems: "center", gap: 1.05, flexWrap: "wrap", border: "1px solid #CBD5E1", borderRadius: 2, background: "#FFFFFF" }}>
        {[
          ["Morning", "#DCFCE7", "#86EFAC"],
          ["Evening", "#FEF3C7", "#FCD34D"],
          ["Night", "#DBEAFE", "#93C5FD"],
          ["OFF", "#E5E7EB", "#9CA3AF"],
        ].map(([label, background, border]) => <Stack key={label} direction="row" spacing={.45} alignItems="center"><Box sx={{ width: 18, height: 14, borderRadius: .7, background, border: `1px solid ${border}` }} /><Typography sx={{ color: "#475569", fontSize: 10, fontWeight: 800 }}>{label}</Typography></Stack>)}
        <Stack direction="row" spacing={.4} alignItems="center"><Box sx={{ width: 24, height: 18, borderRadius: .7, display: "grid", placeItems: "center", background: "#FFEDD5", border: "1px solid #FB923C" }}><Box sx={{ width: 9, height: 9, borderRadius: "50%", background: "#FB923C", border: "1px solid #C2410C" }} /></Box><Typography sx={{ color: "#475569", fontSize: 10, fontWeight: 800 }}>Pending leave</Typography></Stack>
        <Stack direction="row" spacing={.4} alignItems="center"><Box sx={{ width: 24, height: 18, borderRadius: .7, display: "grid", placeItems: "center", background: "#FEE2E2", border: "1px solid #F87171" }}><CheckCircle2 size={12} color="#15803D" strokeWidth={3} /></Box><Typography sx={{ color: "#475569", fontSize: 10, fontWeight: 800 }}>Approved leave</Typography></Stack>
        <Stack direction="row" spacing={.4} alignItems="center"><Box sx={{ width: 18, height: 18, borderRadius: .7, display: "grid", placeItems: "center", background: "#F59E0B", color: "#FFF", fontSize: 9, fontWeight: 950, animation: "calendarReplacementPulse 1s ease-in-out infinite", "@keyframes calendarReplacementPulse": { "50%": { opacity: .35, transform: "scale(.86)" } } }}>R</Box><Typography sx={{ color: "#475569", fontSize: 10, fontWeight: 800 }}>Replacement required</Typography></Stack>
        <Stack direction="row" spacing={.4} alignItems="center"><Box sx={{ width: 18, height: 18, borderRadius: .7, display: "grid", placeItems: "center", background: "#2563EB", color: "#FFF", fontSize: 9, fontWeight: 950 }}>R</Box><Typography sx={{ color: "#475569", fontSize: 10, fontWeight: 800 }}>Replacement assigned</Typography></Stack>
        <Stack direction="row" spacing={.4} alignItems="center"><Box sx={{ width: 18, height: 18, borderRadius: "50%", display: "grid", placeItems: "center", background: "#9333EA", color: "#FFF", fontSize: 9, fontWeight: 950 }}>H</Box><Typography sx={{ color: "#475569", fontSize: 10, fontWeight: 800 }}>Holiday (shift duty continues)</Typography></Stack>
      </Box>
      <GlassCard hover={false} padding={0} sx={{ overflow: "hidden", flex: 1, minHeight: 0, display: "flex", flexDirection: "column", "& > .MuiBox-root:last-child": { flex: 1, minHeight: 0, display: "flex", flexDirection: "column" } }}>
        {loading ? (
          <Box sx={{ minHeight: 360, display: "grid", placeItems: "center" }}><CircularProgress sx={{ color: "#03624C" }} /></Box>
        ) : (
          <Box sx={{ position: "relative", flex: 1, minHeight: 0, overflow: "auto", overscrollBehavior: "contain" }}>
            <Table stickyHeader size="small" sx={{ borderCollapse: "separate", borderSpacing: 0 }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ position: "sticky !important", top: 0, left: 0, zIndex: 8, minWidth: 210, py: .7, background: "#F8FAFC", fontWeight: 900, color: "#334155", borderRight: "1px solid #E2E8F0" }}>Name / designation</TableCell>
                  {dates.map((date) => { const holidayName = holidayByDate[date]; return <TableCell key={date} title={holidayName || undefined} align="center" onClick={() => setSelectedColumn(date)} sx={{ position: "sticky !important", top: 0, zIndex: 7, minWidth: 96, py: .55, cursor: "pointer", fontWeight: 900, color: holidayName ? "#6B21A8" : date === today ? "#03624C" : "#334155", background: holidayName ? "#F3E8FF" : selectedColumn === date ? "#D1FAE5" : date === today ? "#ECFDF5" : "#F8FAFC", borderBottom: holidayName ? "3px solid #A855F7" : date === today ? "3px solid #00A86B" : undefined }}><Box>{displayDate(date)}</Box><Typography variant="caption" sx={{ fontWeight: 800, color: holidayName ? "#7E22CE" : "#94A3B8" }}>{weekday(date)}{holidayName ? " · Holiday" : ""}</Typography></TableCell>; })}
                </TableRow>
              </TableHead>
              <TableBody>
                {!activeGroups.length && <TableRow><TableCell colSpan={dates.length + 1} align="center" sx={{ py: 8, color: "#64748B", fontWeight: 700 }}>{data.length ? "No duties match this filter. Choose All duties or clear the search." : "No calendar roster has been published yet."}</TableCell></TableRow>}
                {activeGroups.map((group) => [
                  <TableRow key={`${group.groupName}-header`}><TableCell colSpan={dates.length + 1} sx={{ py: .65, background: "linear-gradient(90deg,#E8F5F1,#F8FAFC)", color: "#03624C", fontWeight: 900, letterSpacing: ".03em" }}>{group.groupName}</TableCell></TableRow>,
                  ...group.employees.map((person) => (
                    <EmployeeRow
                      key={`${group.groupName}-${person.employeeId}`}
                      person={person}
                      groupName={group.groupName}
                      active={selectedRow === person.employeeId}
                      dates={dates}
                      selectedColumn={selectedColumn}
                      onSelectRow={handleSelectRow}
                      onSelectDuty={handleSelectDuty}
                      applicationMode={applicationMode}
                      applicationKeys={applicationKeys}
                      readOnly={publicView}
                    />
                  ))
                ])}
              </TableBody>
            </Table>
          </Box>
        )}
      </GlassCard>
      </Box>

      <Dialog open={applicationDialogOpen} onClose={dismissCalendarApplication} fullWidth maxWidth="xl" PaperProps={{ sx: { maxHeight: "92dvh", borderRadius: 3 } }}>
        <DialogTitle sx={{ px: { xs: 1.5, md: 2.5 }, py: 1.4, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, borderBottom: "1px solid #E2E8F0" }}>
          <Box><Typography sx={{ color: "#0F172A", fontSize: 19, fontWeight: 950 }}>New crew application</Typography><Typography sx={{ mt: .15, color: "#64748B", fontSize: 10.8 }}>Complete the selected activity without leaving the duty calendar.</Typography></Box>
          <IconButton onClick={dismissCalendarApplication}><X size={19} /></IconButton>
        </DialogTitle>
        <DialogContent sx={{ p: { xs: 1.2, md: 2 }, background: "#F8FAFC" }}>
          <Box sx={{ mb: 1.5, p: .7, display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, minmax(0, 1fr))" }, gap: .7, border: "1px solid #D9E4F0", borderRadius: 2.5, background: "#FFF" }}>
            {[
              ["leave", "Leave / Station Leave", Umbrella, "#0057B7"],
              ["training", "Training", GraduationCap, "#6D28D9"],
              ["sports", "Sports", Medal, "#047857"],
              ["exchange", "Duty Exchange", ArrowLeftRight, "#B45309"],
            ].map(([key, label, Icon, color]) => <Button key={key} startIcon={<Icon size={16} />} onClick={() => setApplicationActivity(key)} sx={{ minHeight: 42, color: applicationActivity === key ? "#FFF" : color, background: applicationActivity === key ? color : `${color}0D`, border: `1px solid ${applicationActivity === key ? color : `${color}35`}`, textTransform: "none", fontWeight: 900, "&:hover": { background: applicationActivity === key ? color : `${color}18` } }}>{label}</Button>)}
          </Box>
          {popupApplicationEmployee && selectedApplicationDates.length > 0 && <Alert severity="info" sx={{ mb: 1.2, py: .25 }}>{popupApplicationEmployee.name || popupApplicationEmployee.employeeId} · {selectedApplicationDates.length} selected date(s): {displayFullDate(selectedApplicationDates[0])}{selectedApplicationDates.length > 1 ? ` to ${displayFullDate(selectedApplicationDates[selectedApplicationDates.length - 1])}` : ""}</Alert>}
          {applicationActivity !== "training" && <Paper variant="outlined" sx={{ mb: 1.3, p: 1.25, borderColor: "#C9D9EA", borderRadius: 2.2, background: "#FFF" }}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ sm: "center" }}>
              <Box sx={{ minWidth: 190, mr: { sm: "auto" } }}><Typography sx={{ color: "#0F172A", fontSize: 12.5, fontWeight: 900 }}>Application dates</Typography><Typography sx={{ color: "#64748B", fontSize: 10.3 }}>{selectedApplicationDates.length ? "Dates selected from the duty calendar. Editing below switches to a continuous popup range." : "Enter a continuous date range in this popup."}</Typography></Box>
              <TextField size="small" type="date" label="From" value={applicationFrom} onChange={(event) => { setApplicationSelections([]); setApplicationFrom(event.target.value); if (!applicationTo || event.target.value > applicationTo) setApplicationTo(event.target.value); }} InputLabelProps={{ shrink: true }} sx={{ minWidth: 155 }} />
              <TextField size="small" type="date" label="To" value={applicationTo} inputProps={{ min: applicationFrom }} onChange={(event) => { setApplicationSelections([]); setApplicationTo(event.target.value); }} InputLabelProps={{ shrink: true }} sx={{ minWidth: 155 }} />
            </Stack>
          </Paper>}
          {applicationActivity === "leave" && <LeaveManagement key={`leave-${popupApplicationEmployee?.employeeId || "self"}-${effectiveApplicationDates.join("-")}`} embeddedApplication initialEmployeeId={popupApplicationEmployee?.employeeId || ""} initialApplicationDates={effectiveApplicationDates} onApplicationChanged={closeCalendarApplication} />}
          {applicationActivity === "training" && <TrainingHolidayMaster key={`training-${popupApplicationEmployee?.employeeId || "self"}`} embeddedRequest initialEmployeeId={popupApplicationEmployee?.employeeId || ""} initialEmployeeName={popupApplicationEmployee?.name || ""} onRequestSubmitted={closeCalendarApplication} />}
          {applicationActivity === "sports" && <SportsManagement key={`sports-${effectiveApplicationDates.join("-")}`} embedded initialDates={effectiveApplicationDates} onSubmitted={closeCalendarApplication} />}
          {applicationActivity === "exchange" && <DutyReassignmentPanel key={`exchange-${popupApplicationEmployee?.employeeId || "employee"}-${effectiveApplicationDates[0] || selectedColumn || today}`} initialMode="exchange" initialDate={effectiveApplicationDates[0] || selectedColumn || today} initialEmployeeId={popupApplicationEmployee?.employeeId || ""} onChanged={closeCalendarApplication} />}
        </DialogContent>
        <DialogActions sx={{ px: 2, py: 1, borderTop: "1px solid #E2E8F0", justifyContent: "space-between" }}>
          <Stack direction="row" spacing={.7}>
            <Button onClick={() => { setApplicationDialogOpen(false); setApplicationMode(true); setApplicationNotice("Select one or more duty cells for one employee, then click Continue application."); }} startIcon={<MousePointer2 size={14} />} sx={{ textTransform: "none", fontWeight: 850 }}>Pick dates on calendar</Button>
            {!!applicationSelections.length && <Button color="inherit" onClick={() => setApplicationSelections([])} sx={{ textTransform: "none", fontWeight: 800 }}>Clear dates</Button>}
          </Stack>
          <Button onClick={dismissCalendarApplication} sx={{ textTransform: "none", fontWeight: 850 }}>Close</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(selectedDuty)} onClose={() => setSelectedDuty(null)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: "#0F172A", fontWeight: 900 }}>
          Duty details
          <IconButton onClick={() => setSelectedDuty(null)}><X size={19} /></IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ p: 2.5 }}>
          {selectedDuty && (
            <Stack spacing={1.5}>
              <Box>
                <Typography sx={{ fontSize: 18, fontWeight: 900, color: "#0F172A" }}>{selectedDuty.person.name || selectedDuty.person.employeeId}</Typography>
                <Typography sx={{ color: "#64748B", fontWeight: 700 }}>{selectedDuty.person.designation || "—"} · {selectedDuty.person.employeeId}</Typography>
              </Box>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Chip label={displayDate(selectedDuty.date)} sx={{ fontWeight: 800 }} />
                <Chip label={selectedDuty.groupName} sx={{ fontWeight: 800 }} />
                <Chip label={selectedDuty.duty.shift || "No duty"} sx={{ fontWeight: 900, color: "#0057B7", background: "#E8F1FF" }} />
                {selectedDuty.duty.isHoliday && <Chip label={`Holiday · ${selectedDuty.duty.holidayName || "Holiday"}`} sx={{ fontWeight: 900, color: "#6B21A8", background: "#F3E8FF", border: "1px solid #A855F7" }} />}
              </Stack>
              {selectedDuty.duty.leaveStatus && (
                <Alert severity="info">
                  {leaveLabel(selectedDuty.duty)} · {selectedDuty.duty.leaveStatus}
                </Alert>
              )}
              {selectedDuty.duty.trainingAdjacentOffStatus && (
                <Alert severity={selectedDuty.duty.trainingAdjacentOffStatus === "Approved" ? "success" : "warning"}>
                  {selectedDuty.duty.trainingAdjacentOffPosition || "Adjacent OFF"} request for {selectedDuty.duty.trainingAdjacentOffName || "training"} · {selectedDuty.duty.trainingAdjacentOffStatus}
                  {selectedDuty.duty.trainingAdjacentOffCurrentApproverName ? ` · awaiting ${selectedDuty.duty.trainingAdjacentOffCurrentApproverName} (${selectedDuty.duty.trainingAdjacentOffCurrentApproverLevel || "approver"})` : ""}
                </Alert>
              )}
              {selectedDuty.duty.vacatedDuty && (
                <Alert severity="warning" action={canManageReplacement && !selectedDuty.duty.replacementEmployee?.name ? <Button color="warning" size="small" onClick={() => { setReassignmentContext({ mode: "vacancy", date: selectedDuty.date, employeeId: selectedDuty.person.employeeId }); setSelectedDuty(null); setExchangeOpen(true); }} sx={{ fontWeight: 900, whiteSpace: "nowrap" }}>Fill vacancy</Button> : undefined}>
                  Vacant {selectedDuty.duty.vacatedDuty} duty{selectedDuty.duty.vacancyReason ? ` · ${selectedDuty.duty.vacancyReason}` : ""}
                </Alert>
              )}
              {(selectedDuty.duty.leaveStatus || selectedDuty.duty.trainingName || selectedDuty.duty.trainingAdjacentOffStatus || selectedDuty.duty.sportsName) && (
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  {selectedDuty.duty.leaveStatus && <Button size="small" variant="contained" onClick={openLeaveWorkflow} sx={{ textTransform: "none", fontWeight: 900, background: "#0057B7" }}>Open leave approval</Button>}
                  {(selectedDuty.duty.trainingName || selectedDuty.duty.trainingAdjacentOffStatus) && <Button size="small" variant="contained" onClick={openTrainingWorkflow} sx={{ textTransform: "none", fontWeight: 900, background: "#6A1B9A" }}>{selectedDuty.duty.trainingAdjacentOffStatus ? "Review OFF approval" : "Open training approval"}</Button>}
                  {selectedDuty.duty.sportsName && <Button size="small" variant="contained" onClick={() => navigate("/crew/sports?section=approval")} sx={{ textTransform: "none", fontWeight: 900, background: "#047857" }}>Open sports approval</Button>}
                  {canManageReplacement && String(selectedDuty.duty.leaveStatus || "").toLowerCase() === "approved" && <Button size="small" variant="outlined" onClick={openReplacementWorkflow} sx={{ textTransform: "none", fontWeight: 900, borderColor: "#D97706", color: "#B45309", ...(selectedDuty.duty.replacementRequired && !selectedDuty.duty.replacementEmployee?.name ? { animation: "calendarReplacementPulse 1s ease-in-out infinite" } : {}) }}>Assign replacement</Button>}
                  {canManageReplacement && selectedDuty.duty.trainingName && <Button size="small" variant="outlined" onClick={openReplacementWorkflow} sx={{ textTransform: "none", fontWeight: 900, borderColor: "#D97706", color: "#B45309", ...(selectedDuty.duty.replacementRequired && !selectedDuty.duty.replacementEmployee?.name ? { animation: "calendarReplacementPulse 1s ease-in-out infinite" } : {}) }}>Assign replacement</Button>}
                  {canManageReplacement && selectedDuty.duty.sportsName && <Button size="small" variant="outlined" onClick={openReplacementWorkflow} sx={{ textTransform: "none", fontWeight: 900, borderColor: "#D97706", color: "#B45309", ...(selectedDuty.duty.replacementRequired && !selectedDuty.duty.replacementEmployee?.name ? { animation: "calendarReplacementPulse 1s ease-in-out infinite" } : {}) }}>Assign replacement</Button>}
                </Stack>
              )}
              {selectedDuty.duty.replacementEmployee?.name && (
                <Paper variant="outlined" sx={{ p: 1.5, borderColor: "#86D3A5", background: "#F0FDF4" }}>
                  <Typography sx={{ fontSize: 11, fontWeight: 900, color: "#64748B", textTransform: "uppercase" }}>Replacement duty assigned to</Typography>
                  <Typography sx={{ mt: .4, fontSize: 16, fontWeight: 900, color: "#15803D" }}>
                    {selectedDuty.duty.replacementEmployee.name}
                    {selectedDuty.duty.replacementEmployee.employeeId ? ` (${selectedDuty.duty.replacementEmployee.employeeId})` : ""}
                  </Typography>
                </Paper>
              )}
              {selectedDuty.duty.replacementFor?.name && (
                <Paper variant="outlined" sx={{ p: 1.5, borderColor: "#86D3A5", background: "#F0FDF4" }}>
                  <Typography sx={{ fontSize: 11, fontWeight: 900, color: "#64748B", textTransform: "uppercase" }}>Replacement duty for</Typography>
                  <Typography sx={{ mt: .4, fontSize: 16, fontWeight: 900, color: "#15803D" }}>
                    {selectedDuty.duty.replacementFor.name}
                    {selectedDuty.duty.replacementFor.employeeId ? ` (${selectedDuty.duty.replacementFor.employeeId})` : ""}
                  </Typography>
                </Paper>
              )}
              {selectedDuty.duty.isActingSIC && (
                <Paper variant="outlined" sx={{ p: 1.5, borderColor: "#C4B5FD", background: "#F5F3FF" }}>
                  <Typography sx={{ fontSize: 11, fontWeight: 900, color: "#64748B", textTransform: "uppercase" }}>Acting Shift In-Charge</Typography>
                  <Typography sx={{ mt: .4, fontSize: 15, fontWeight: 900, color: "#6A1B9A" }}>
                    {selectedDuty.duty.actingSICGroup || selectedDuty.groupName}
                    {selectedDuty.duty.actingSICFor?.name ? ` in place of ${selectedDuty.duty.actingSICFor.name}` : ""}
                  </Typography>
                </Paper>
              )}
              {!selectedDuty.duty.leaveStatus && !selectedDuty.duty.trainingAdjacentOffStatus && !selectedDuty.duty.replacementEmployee?.name && !selectedDuty.duty.replacementFor?.name && !selectedDuty.duty.isActingSIC && (
                <Typography sx={{ color: "#64748B" }}>This is a regular roster duty.</Typography>
              )}
            </Stack>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(leaveApprovalPopup)} onClose={() => setLeaveApprovalPopup(null)} fullWidth maxWidth="xl">
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: "#0F172A", fontWeight: 900 }}>
          Leave calendar approval
          <IconButton onClick={() => setLeaveApprovalPopup(null)}><X size={19} /></IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ p: { xs: 1, md: 2 }, background: "#F8FAFC", minHeight: 480, position: "relative" }}>
          {leaveApprovalPopup && canManageReplacement && String(leaveApprovalPopup.duty.leaveStatus).toLowerCase() === "approved" && <Button variant="contained" sx={{ mb: 2 }} onClick={() => { const selection = leaveApprovalPopup; setLeaveApprovalPopup(null); openReplacementCandidates(selection); }}>{leaveApprovalPopup.duty.replacementEmployee?.employeeId ? "Change replacement" : "Assign replacement"}</Button>}
          {leaveApprovalPopup && <LeaveManagement
            key={`${leaveApprovalPopup.person.employeeId}-${leaveApprovalPopup.date}-${leaveApprovalPopup.duty.leaveRequestId || "leave"}`}
            embeddedApproval
            initialApprovalDate={leaveApprovalPopup.date}
            initialLeaveId={leaveApprovalPopup.duty.leaveRequestId || ""}
            initialEmployeeId={leaveApprovalPopup.person.employeeId}
            onApprovalChanged={load}
          />}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(trainingApprovalPopup)} onClose={() => setTrainingApprovalPopup(null)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: "#0F172A", fontWeight: 900 }}>
          Training and OFF request
          <IconButton onClick={() => setTrainingApprovalPopup(null)}><X size={19} /></IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ p: { xs: 1, md: 2 }, background: "#F8FAFC", minHeight: 420 }}>
          {trainingApprovalPopup && <TrainingCalendarReview
            key={trainingApprovalPopup.duty.trainingAdjacentOffRequestId || trainingApprovalPopup.duty.trainingNominationId}
            requestId={trainingApprovalPopup.duty.trainingAdjacentOffRequestId || trainingApprovalPopup.duty.trainingNominationId}
            onChanged={load}
            onReplacement={() => { const selection = trainingApprovalPopup; setTrainingApprovalPopup(null); openReplacementCandidates(selection); }}
          />}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(replacementPopup)} onClose={() => setReplacementPopup(null)} fullWidth maxWidth="lg">
        <DialogTitle sx={{ background: "linear-gradient(90deg,#4a148c,#7b1fa2)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          Assign replacement
          <IconButton onClick={() => setReplacementPopup(null)} sx={{ color: "#fff" }}><X size={19} /></IconButton>
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          {replacementPopup && <Stack spacing={1.5}>
            <Alert severity="warning" sx={{ fontWeight: 700 }}>
              Coverage for {replacementPopup.person.name || replacementPopup.person.employeeId} on {displayFullDate(replacementPopup.date)} · {replacementPopup.duty.shift || "Duty"} · {replacementPopup.groupName}
              {!replacementPopup.duty.replacementRequired && " · optional administrator assignment"}
            </Alert>
            {replacementPopup.duty.replacementEmployee?.name && <Alert severity="info">Current assignment: <strong>{replacementPopup.duty.replacementEmployee.name}</strong>{replacementPopup.duty.replacementEmployee.employeeId ? ` (${replacementPopup.duty.replacementEmployee.employeeId})` : ""}. Selecting another candidate will change the assignment.</Alert>}
            <Paper variant="outlined" sx={{ p: 1.2, borderColor: "#C4B5FD", background: "#FAF5FF" }}>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ sm: "center" }}>
                <Box sx={{ flex: 1 }}>
                  <Typography sx={{ fontWeight: 900, color: "#4C1D95" }}>Choose how the duty will be covered</Typography>
                  <Typography variant="caption" color="text.secondary">Normal replacement moves the employee to this duty. Use duty exchange to swap duties through the approval workflow.</Typography>
                </Box>
                <Button variant="outlined" startIcon={<ArrowLeftRight size={16} />} onClick={openExchangeFromReplacement} sx={{ textTransform: "none", fontWeight: 900, whiteSpace: "nowrap" }}>Replacement by exchange</Button>
              </Stack>
            </Paper>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: { xs: "stretch", md: "center" }, flexDirection: { xs: "column", md: "row" }, gap: 2 }}>
              <Typography variant="body2" color="text.secondary">Choose an available employee. Click their name to review previous replacement duties.</Typography>
              {!(["training", "sports"].includes(replacementPopup.source?.kind)) && <FormControl size="small" sx={{ minWidth: 240 }}><InputLabel>Candidate filter</InputLabel><Select value={replacementCandidateFilter} label="Candidate filter" onChange={(event) => changeReplacementCandidateFilter(event.target.value)}><MenuItem value="all">All employee</MenuItem><MenuItem value="sic">Only SIC</MenuItem><MenuItem value="shift_engineer">Only Shift Engineer</MenuItem></Select></FormControl>}
            </Box>
            <Typography variant="subtitle2">Candidate selection order · required duty: {replacementCandidates[0]?.requiredDuty || replacementPopup.duty.shift || "-"}</Typography>
            {replacementError && <Alert severity="error" action={<Button size="small" onClick={() => navigate(`/crew/replacement?action=leave&date=${replacementPopup.date}&employeeId=${encodeURIComponent(replacementPopup.person.employeeId)}`)}>Open module</Button>}>{replacementError}</Alert>}
            <TextField size="small" label="Find replacement by name, ID or group" value={candidateSearch} onChange={(event) => setCandidateSearch(event.target.value)} />
            {replacementLoading ? <Box sx={{ py: 5, display: "grid", placeItems: "center" }}><CircularProgress /></Box> : !replacementError && <TableContainer sx={{ border: "1px solid #CBD5E1", borderRadius: 2, maxHeight: "55vh" }}><Table size="small" stickyHeader sx={{ minWidth: 560 }}>
              <TableHead><TableRow><TableCell>Employee</TableCell><TableCell>Current duty</TableCell><TableCell>Last matching duty</TableCell><TableCell align="right">Action</TableCell></TableRow></TableHead>
              <TableBody>
                {!visibleCandidates.length && <TableRow><TableCell colSpan={4} align="center" sx={{ py: 4 }}>No candidates match. Try another name or candidate filter.</TableCell></TableRow>}
                {visibleCandidates.map((candidate) => <TableRow key={candidate.employeeId} hover>
                  <TableCell><Button onClick={() => openCandidateHistory(candidate)} sx={{ p: 0, textTransform: "none", fontWeight: 900 }}>{candidate.name || candidate.employeeId}</Button><Typography variant="caption" display="block">{candidate.employeeId} ? {candidate.groupName || replacementSourceLabel(candidate.source)}</Typography><Typography variant="caption" color="text.secondary">Click name for history</Typography></TableCell>
                  <TableCell>{candidate.assignedDuty || "No duty"}<Typography variant="caption" display="block">Next day: {candidate.nextDayDuty || "Not recorded"}</Typography>{candidate.hasConflict && <Typography variant="caption" color="error">Unavailable for this period</Typography>}</TableCell>
                  <TableCell>{candidate.lastMatchingDutyDate ? displayFullDate(candidate.lastMatchingDutyDate) : "Not recorded"}</TableCell>
                  <TableCell align="right"><Button variant="contained" size="small" disabled={Boolean(assigningCandidate) || candidate.hasConflict} onClick={() => assignCandidate(candidate)}>{assigningCandidate === candidate.employeeId ? "Saving?" : "Assign replacement"}</Button></TableCell>
                </TableRow>)}
              </TableBody>
            </Table></TableContainer>}
          </Stack>}
        </DialogContent>
        <DialogActions><Button onClick={() => setReplacementPopup(null)}>Close</Button></DialogActions>
      </Dialog>

      <Dialog open={candidateHistory.open} onClose={() => setCandidateHistory((current) => ({ ...current, open: false }))} fullWidth maxWidth="md">
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontWeight: 900 }}>Replacement duty history · {candidateHistory.employee?.name || "Employee"}<IconButton onClick={() => setCandidateHistory((current) => ({ ...current, open: false }))}><X size={19} /></IconButton></DialogTitle>
        <DialogContent dividers>{candidateHistory.loading ? <Box sx={{ py: 5, display: "grid", placeItems: "center" }}><CircularProgress /></Box> : candidateHistory.error ? <Alert severity="error">{candidateHistory.error}</Alert> : <TableContainer sx={{ border: "1px solid #CBD5E1", borderRadius: 2, maxHeight: "58vh" }}><Table size="small" stickyHeader><TableHead><TableRow><TableCell sx={{ fontWeight: 900 }}>Date</TableCell><TableCell sx={{ fontWeight: 900 }}>Duty</TableCell><TableCell sx={{ fontWeight: 900 }}>Group</TableCell><TableCell sx={{ fontWeight: 900 }}>Replaced employee</TableCell><TableCell sx={{ fontWeight: 900 }}>Leave</TableCell></TableRow></TableHead><TableBody>{!candidateHistory.rows.length && <TableRow><TableCell colSpan={5} align="center" sx={{ py: 4, color: "#64748B" }}>No replacement duty recorded.</TableCell></TableRow>}{candidateHistory.rows.map((item, index) => <TableRow key={`${item.date}-${index}`}><TableCell>{item.date ? displayFullDate(item.date) : "-"}</TableCell><TableCell sx={{ fontWeight: 800 }}>{item.assignedDuty || "-"}</TableCell><TableCell>{item.groupName || "-"}</TableCell><TableCell>{item.replacedEmployee || "-"}</TableCell><TableCell>{item.leaveType || "-"}</TableCell></TableRow>)}</TableBody></Table></TableContainer>}</DialogContent>
        <DialogActions><Button onClick={() => setCandidateHistory((current) => ({ ...current, open: false }))}>Close</Button></DialogActions>
      </Dialog>

      <Dialog open={exchangeOpen} onClose={() => setExchangeOpen(false)} fullWidth maxWidth="lg">
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: "#0F172A", fontWeight: 900 }}>
          Duty exchange and reassignment
          <IconButton onClick={() => setExchangeOpen(false)}><X size={19} /></IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ p: { xs: 1.5, md: 2.5 }, background: "#F8FAFC" }}>
          <DutyReassignmentPanel
            key={`${reassignmentContext.mode}-${reassignmentContext.date}-${reassignmentContext.employeeId}`}
            initialDate={reassignmentContext.date || selectedColumn || today}
            initialMode={reassignmentContext.mode || "exchange"}
            initialEmployeeId={reassignmentContext.employeeId || ""}
            onChanged={() => {
              load();
            }}
          />
        </DialogContent>
      </Dialog>
    </CalendarPageShell>
  );
}
