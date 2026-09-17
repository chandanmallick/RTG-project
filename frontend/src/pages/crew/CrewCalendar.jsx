import { useEffect, useMemo, useRef, useState, memo, useCallback } from "react";
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogContent, DialogTitle,
  IconButton, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, Tooltip, Typography,
} from "@mui/material";
import { ArrowLeftRight, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, RefreshCw, X } from "lucide-react";
import { useNavigate } from "react-router-dom";

import AppShell from "../../components/layout/AppShell";
import { useAuth } from "../../auth/AuthContext";
import GlassCard from "../../components/ui/GlassCard";
import DutyReassignmentPanel from "../../components/crew/DutyReassignmentPanel";
import crewApi from "../../services/crewApi";
import LeaveManagement from "../../crewLegacy/LeaveManagement";

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
const weekday = (dateStr) => new Intl.DateTimeFormat("en-IN", { weekday: "short" }).format(parseLocalDate(dateStr));
const compactShift = (value) => {
  const duty = String(value || "").trim().toUpperCase();
  if (["M", "M1", "M2", "MORNING"].includes(duty)) return "Morning";
  if (["E", "E1", "E2", "EVENING"].includes(duty)) return "Evening";
  if (["N", "N1", "N2", "NIGHT"].includes(duty)) return "Night";
  if (["O", "O1", "O2", "OFF"].includes(duty)) return "OFF";
  return duty || "-";
};
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
  const shift = String(duty?.shift || "").trim().toUpperCase();
  const activeLeave = leave && !["rejected", "cancelled", "canceled", "withdrawn"].includes(leave);

  if (leave === "approved") return { background: "#FEE2E2", color: "#B91C1C", border: "#F87171" };
  if (activeLeave) return { background: "#FFEDD5", color: "#C2410C", border: "#FB923C" };
  if (duty?.trainingName || shift.includes("TRAINING") || shift.includes("TOUR")) {
    return { background: "#F3E8FF", color: "#6B21A8", border: "#C4B5FD" };
  }

  if (["MORNING", "M1", "M2"].includes(shift)) return { background: "#DCFCE7", color: "#14532D", border: "#86EFAC" };
  if (["EVENING", "E1", "E2"].includes(shift)) return { background: "#FEF3C7", color: "#78350F", border: "#FCD34D" };
  if (["NIGHT", "N1", "N2"].includes(shift)) return { background: "#DBEAFE", color: "#1E3A8A", border: "#93C5FD" };
  if (["OFF", "O1", "O2"].includes(shift)) return { background: "#E5E7EB", color: "#111827", border: "#9CA3AF" };
  return { background: "#F8FAFC", color: "#000000", border: "#D6DEE8" };
};

const leaveLabel = (duty) => {
  if (duty?.stationLeaveOnly) return "Station Leave";
  const leaveType = duty?.leaveType || "Leave";
  return duty?.stationLeave ? `${leaveType} + Station Leave` : leaveType;
};

function PublicCalendarShell({ children }) {
  return <Box sx={{ height: "100dvh", p: 1, boxSizing: "border-box", background: "#F8FAFC", overflow: "hidden" }}>{children}</Box>;
}

const EmployeeRow = memo(({ person, groupName, active, dates, selectedColumn, onSelectRow, onSelectDuty, canManageReplacement, readOnly = false }) => {
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
        const leaveTip = duty.leaveStatus ? `${leaveLabel(duty)} · ${duty.leaveStatus}` : "";
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
            sx={{ position: "relative", minHeight: 42, width: "100%", boxSizing: "border-box", px: .5, py: .4, display: "grid", placeItems: "center", alignContent: "center", textAlign: "center", cursor: readOnly ? "default" : "pointer", borderRadius: 1.7, backgroundColor: palette.background, backgroundImage: isHoliday ? "linear-gradient(90deg,#A855F7 0 4px,transparent 4px)" : "none", color: palette.color, border: `1px solid ${isHoliday ? "#A855F7" : palette.border}`, boxShadow: "none", "& .MuiTypography-root": { color: "inherit", textAlign: "center" }, "&:hover": readOnly ? {} : { boxShadow: "0 0 0 2px rgba(0,87,183,.18)" } }}
          >
            {isHoliday && <Tooltip title={`${duty.holidayName || "Holiday"} · shift duty continues`} arrow><Box aria-label={duty.holidayName || "Holiday"} sx={{ position: "absolute", top: 2, right: 2, width: 14, height: 14, borderRadius: "50%", display: "grid", placeItems: "center", background: "#9333EA", color: "#FFF", fontSize: 7.5, fontWeight: 950, lineHeight: 1 }}>H</Box></Tooltip>}
            {hasLeave ? (
              <Tooltip title={`${duty.shift || "Duty"} · ${leaveTip}`} arrow>
                <Stack className="crew-calendar-duty-content" direction="row" spacing={.45} alignItems="center" justifyContent="center" sx={{ width: "100%", minWidth: 0, mx: "auto", cursor: "help", textAlign: "center" }}>
                  <Typography component="span" sx={{ fontSize: 10.5, fontWeight: 950, lineHeight: 1 }}>{compactShift(duty.shift)}</Typography>
                  <Typography component="span" sx={{ fontSize: 10.5, fontWeight: 950, lineHeight: 1 }}>{leaveLabel(duty)}</Typography>
                  {leaveApproved ? <CheckCircle2 size={13} color="#15803D" strokeWidth={3} aria-label="Approved leave" /> : <Box aria-label="Pending leave" sx={{ width: 10, height: 10, borderRadius: "50%", background: "#FB923C", border: "1px solid #C2410C" }} />}
                </Stack>
              </Tooltip>
            ) : <Stack className="crew-calendar-duty-content" direction="row" spacing={.45} alignItems="center" justifyContent="center" sx={{ width: "100%", minWidth: 0, textAlign: "center" }}><Typography sx={{ fontSize: 11.5, fontWeight: 900 }}>{compactShift(duty.shift)}</Typography>{additionalDuties.map((extra, index) => <Tooltip key={`${extra.shift}-${index}`} title={`Additional replacement duty: ${extra.shift}${extra.groupName ? ` · ${extra.groupName}` : ""}${extra.replacementFor?.name ? ` · for ${extra.replacementFor.name}` : ""}`} arrow><Stack direction="row" spacing={.3} alignItems="center" justifyContent="center"><Typography sx={{ fontSize: 10, fontWeight: 900 }}>+</Typography><Box sx={{ px: .5, py: .1, borderRadius: .7, color: "#1E3A8A", background: "#DBEAFE", border: "1px solid #93C5FD", fontSize: 9.5, fontWeight: 950, textAlign: "center" }}>{compactShift(extra.shift)}</Box></Stack></Tooltip>)}</Stack>}
            {duty.trainingName && <Tooltip title={`Training: ${duty.trainingName}`} arrow><Typography component="span" sx={{ width: "100%", fontSize: 9, fontWeight: 800, textAlign: "center" }}>{duty.trainingName}</Typography></Tooltip>}
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
  const [selectedDuty, setSelectedDuty] = useState(null);
  const [leaveApprovalPopup, setLeaveApprovalPopup] = useState(null);
  const [replacementPopup, setReplacementPopup] = useState(null);
  const [replacementCandidates, setReplacementCandidates] = useState([]);
  const [replacementLoading, setReplacementLoading] = useState(false);
  const [replacementError, setReplacementError] = useState("");
  const [assigningCandidate, setAssigningCandidate] = useState("");
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

  const activeGroups = data;
  const holidayByDate = useMemo(() => {
    const result = {};
    data.forEach((group) => (group.employees || []).forEach((person) => Object.entries(person.duties || {}).forEach(([date, duty]) => {
      if (duty?.isHoliday) result[date] = duty.holidayName || "Holiday";
    })));
    return result;
  }, [data]);
  const canManageReplacement = !publicView && Boolean(user?.role === "admin" || user?.permissions?.crew_replacement?.write || user?.permissions?.crew_leave?.write || user?.permissions?.crew_training?.write);
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
    navigate(`/crew/training?section=pending&date=${selectedDuty.date}&employeeId=${encodeURIComponent(selectedDuty.person.employeeId)}`);
  };

  const openReplacementCandidates = useCallback(async (selection) => {
    setSelectedRow(selection.person.employeeId);
    setSelectedColumn(selection.date);
    setSelectedDuty(null);
    setReplacementPopup({ ...selection, leave: null });
    setReplacementCandidates([]);
    setReplacementError("");
    setReplacementLoading(true);
    try {
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
      const candidates = await crewApi.replacementCandidates(leave.id, leave.isSIC ? "sic" : "shift_engineer");
      setReplacementPopup((current) => current ? { ...current, leave } : current);
      setReplacementCandidates(candidates || []);
    } catch (requestError) {
      setReplacementError(requestError.response?.data?.detail || "Replacement candidates could not be loaded.");
    } finally {
      setReplacementLoading(false);
    }
  }, []);

  const assignCandidate = async (candidate) => {
    if (!replacementPopup?.leave?.id) return;
    setAssigningCandidate(candidate.employeeId);
    setReplacementError("");
    try {
      await crewApi.assignReplacement(replacementPopup.leave.id, {
        replacementEmployeeId: candidate.employeeId,
        mode: "normal",
        halfDuty: false,
        reason: "Assigned from the duty calendar",
      });
      setReplacementPopup(null);
      await load();
    } catch (requestError) {
      setReplacementError(requestError.response?.data?.detail || "Replacement could not be assigned.");
    } finally {
      setAssigningCandidate("");
    }
  };

  const handleSelectRow = useCallback((employeeId) => {
    setSelectedRow(employeeId);
  }, []);

  const handleSelectDuty = useCallback((selection) => {
    setSelectedRow(selection.person.employeeId);
    setSelectedColumn(selection.date);
    if (canManageReplacement && selection.duty.replacementRequired && !selection.duty.replacementEmployee?.name) {
      openReplacementCandidates(selection);
      return;
    }
    setSelectedDuty(selection);
  }, [canManageReplacement, openReplacementCandidates]);

  const CalendarPageShell = publicView ? PublicCalendarShell : AppShell;
  return (
    <CalendarPageShell>
      <Box sx={{ height: publicView ? "calc(100dvh - 16px)" : { xs: "calc(100dvh - 112px)", md: "calc(100dvh - 140px)" }, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column", gap: 1.15 }}>
      <Box sx={{ px: { xs: 1.5, md: 2 }, py: 1.25, borderRadius: 3, background: "linear-gradient(105deg,#081F5C 0%,#075DB8 62%,#1678D4 100%)", color: "#FFF", display: "flex", alignItems: "center", gap: 1.2, flexWrap: { xs: "wrap", xl: "nowrap" } }}>
        <Box sx={{ minWidth: { md: 220 }, mr: { xl: "auto" } }}>
          <Typography sx={{ fontSize: 19, fontWeight: 950, lineHeight: 1.05 }}>Daily Duty Calendar</Typography>
          <Typography sx={{ mt: .25, fontSize: 10.5, color: "rgba(255,255,255,.82)" }}>Shift, leave, training and replacement</Typography>
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
        <Button size="small" startIcon={<ArrowLeftRight size={15} />} onClick={() => setExchangeOpen(true)} sx={{ minHeight: 32, color: "#0755A5", background: "#FFF", borderRadius: 2, textTransform: "none", fontWeight: 900, whiteSpace: "nowrap", "&:hover": { background: "#F1F5F9" } }}>Duty exchange / reassignment</Button></>}
      </Box>

      {error && <Alert severity="error">{error}</Alert>}
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
                {!data.length && <TableRow><TableCell colSpan={dates.length + 1} align="center" sx={{ py: 8, color: "#64748B", fontWeight: 700 }}>No calendar roster has been published yet.</TableCell></TableRow>}
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
                      canManageReplacement={canManageReplacement}
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
              {(selectedDuty.duty.leaveStatus || selectedDuty.duty.trainingName) && (
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  {selectedDuty.duty.leaveStatus && <Button size="small" variant="contained" onClick={openLeaveWorkflow} sx={{ textTransform: "none", fontWeight: 900, background: "#0057B7" }}>Open leave approval</Button>}
                  {selectedDuty.duty.trainingName && <Button size="small" variant="contained" onClick={openTrainingWorkflow} sx={{ textTransform: "none", fontWeight: 900, background: "#6A1B9A" }}>Open training approval</Button>}
                  {canManageReplacement && String(selectedDuty.duty.leaveStatus || "").toLowerCase() === "approved" && <Button size="small" variant="outlined" onClick={openReplacementWorkflow} sx={{ textTransform: "none", fontWeight: 900, borderColor: "#D97706", color: "#B45309", ...(selectedDuty.duty.replacementRequired && !selectedDuty.duty.replacementEmployee?.name ? { animation: "calendarReplacementPulse 1s ease-in-out infinite" } : {}) }}>Assign replacement</Button>}
                  {canManageReplacement && selectedDuty.duty.trainingName && <Button size="small" variant="outlined" onClick={openReplacementWorkflow} sx={{ textTransform: "none", fontWeight: 900, borderColor: "#D97706", color: "#B45309", ...(selectedDuty.duty.replacementRequired && !selectedDuty.duty.replacementEmployee?.name ? { animation: "calendarReplacementPulse 1s ease-in-out infinite" } : {}) }}>Assign replacement</Button>}
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
              {!selectedDuty.duty.leaveStatus && !selectedDuty.duty.replacementEmployee?.name && !selectedDuty.duty.replacementFor?.name && !selectedDuty.duty.isActingSIC && (
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
          {leaveApprovalPopup && <LeaveManagement
            key={`${leaveApprovalPopup.person.employeeId}-${leaveApprovalPopup.date}-${leaveApprovalPopup.duty.leaveRequestId || "leave"}`}
            embeddedApproval
            initialApprovalDate={leaveApprovalPopup.date}
            initialLeaveId={leaveApprovalPopup.duty.leaveRequestId || ""}
            onApprovalChanged={load}
          />}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(replacementPopup)} onClose={() => setReplacementPopup(null)} fullWidth maxWidth="md">
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: "#0F172A", fontWeight: 900 }}>
          Direct replacement assignment
          <IconButton onClick={() => setReplacementPopup(null)}><X size={19} /></IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ p: { xs: 1.5, md: 2.25 } }}>
          {replacementPopup && <Stack spacing={1.5}>
            <Alert severity="warning" sx={{ fontWeight: 700 }}>
              Replacement required for {replacementPopup.person.name || replacementPopup.person.employeeId} on {displayDate(replacementPopup.date)} · {replacementPopup.duty.shift || "Duty"} · {replacementPopup.groupName}
            </Alert>
            {replacementPopup.duty.replacementEmployee?.name && <Alert severity="info">
              Current assignment: <strong>{replacementPopup.duty.replacementEmployee.name}</strong>{replacementPopup.duty.replacementEmployee.employeeId ? ` (${replacementPopup.duty.replacementEmployee.employeeId})` : ""}. Selecting another candidate will change the assignment.
            </Alert>}
            {replacementError && <Alert severity="error" action={<Button size="small" onClick={() => navigate(`/crew/replacement?action=leave&date=${replacementPopup.date}&employeeId=${encodeURIComponent(replacementPopup.person.employeeId)}`)}>Open module</Button>}>{replacementError}</Alert>}
            {replacementLoading ? <Box sx={{ py: 5, display: "grid", placeItems: "center" }}><CircularProgress /></Box> : !replacementError && (
              <Box sx={{ overflowX: "auto", maxHeight: "58vh" }}>
                <Table size="small" stickyHeader>
                  <TableHead><TableRow>
                    <TableCell sx={{ fontWeight: 900 }}>Candidate</TableCell>
                    <TableCell sx={{ fontWeight: 900 }}>Current / next duty</TableCell>
                    <TableCell sx={{ fontWeight: 900 }}>Last matching duty</TableCell>
                    <TableCell sx={{ fontWeight: 900 }}>Source</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 900 }}>Action</TableCell>
                  </TableRow></TableHead>
                  <TableBody>
                    {!replacementCandidates.length && <TableRow><TableCell colSpan={5} align="center" sx={{ py: 4, color: "#64748B" }}>No eligible replacement candidate was found.</TableCell></TableRow>}
                    {replacementCandidates.map((candidate) => <TableRow key={candidate.employeeId} hover>
                      <TableCell><Typography sx={{ fontWeight: 900 }}>{candidate.name || candidate.employeeId}</Typography><Typography variant="caption">{candidate.designation || "—"} · {candidate.employeeId}</Typography></TableCell>
                      <TableCell>{candidate.assignedDuty || "—"}<Typography variant="caption" display="block">Next: {candidate.nextDayDuty || "—"}</Typography></TableCell>
                      <TableCell>{candidate.lastMatchingDutyDate || "Never recorded"}<Typography variant="caption" display="block">{candidate.daysSinceMatchingDuty == null ? "" : `${candidate.daysSinceMatchingDuty} day(s) ago`}</Typography></TableCell>
                      <TableCell>{candidate.organization?.displayName || candidate.eligibility || candidate.source || "—"}</TableCell>
                      <TableCell align="right"><Button size="small" variant="contained" disabled={Boolean(assigningCandidate)} onClick={() => assignCandidate(candidate)} sx={{ textTransform: "none", fontWeight: 850, background: "#15803D" }}>{assigningCandidate === candidate.employeeId ? "Assigning…" : "Assign"}</Button></TableCell>
                    </TableRow>)}
                  </TableBody>
                </Table>
              </Box>
            )}
          </Stack>}
        </DialogContent>
      </Dialog>

      <Dialog open={exchangeOpen} onClose={() => setExchangeOpen(false)} fullWidth maxWidth="lg">
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: "#0F172A", fontWeight: 900 }}>
          Duty exchange and reassignment
          <IconButton onClick={() => setExchangeOpen(false)}><X size={19} /></IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ p: { xs: 1.5, md: 2.5 }, background: "#F8FAFC" }}>
          <DutyReassignmentPanel
            initialDate={selectedColumn || today}
            onChanged={() => {
              load();
            }}
          />
        </DialogContent>
      </Dialog>
    </CalendarPageShell>
  );
}
