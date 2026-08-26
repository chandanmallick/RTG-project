import { useEffect, useMemo, useRef, useState, memo, useCallback } from "react";
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogContent, DialogTitle,
  IconButton, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography,
} from "@mui/material";
import { ArrowLeftRight, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, RefreshCw, Users, X } from "lucide-react";
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
const replacementLabelSx = {
  alignSelf: "center",
  mt: .25,
  px: .65,
  py: .2,
  borderRadius: 1,
  border: "1px solid #93C5FD",
  background: "#DBEAFE",
  color: "#1D4ED8",
  fontSize: 9.5,
  fontWeight: 950,
  lineHeight: 1.2,
  display: "flex",
  alignItems: "center",
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

const EmployeeRow = memo(({ person, groupName, active, dates, selectedColumn, onSelectRow, onSelectDuty, canManageReplacement }) => {
  return (
    <TableRow hover onClick={() => onSelectRow(person.employeeId)} sx={{ cursor: "pointer", background: active ? "#F0FDFA" : person.IsSIC ? "#F8FFFC" : "#FFF" }}>
      <TableCell sx={{ position: "sticky", left: 0, zIndex: 2, minWidth: 235, background: active ? "#D1FAE5" : person.IsSIC ? "#ECFDF5" : "#FFF", borderRight: "1px solid #E2E8F0" }}>
        <Stack direction="row" spacing={1} alignItems="center"><Box><Typography sx={{ fontSize: 13.5, fontWeight: 900, color: "#0F172A" }}>{person.name || person.employeeId}</Typography><Typography sx={{ fontSize: 11.5, color: "#64748B" }}>{person.designation || "—"}</Typography></Box>{person.IsSIC && <Chip label="SIC" size="small" sx={{ height: 21, fontSize: 10, fontWeight: 900, background: "#D1FAE5", color: "#03624C" }} />}</Stack>
      </TableCell>
      {dates.map((date) => {
        const duty = person.duties?.[date] || { shift: "-" };
        const palette = shiftStyle(duty);
        const columnActive = selectedColumn === date;
        const replacementPending = Boolean(duty.replacementRequired && !duty.replacementEmployee?.name);
        const leaveApproved = String(duty.leaveStatus || "").toLowerCase() === "approved";
        return <TableCell key={date} align="center" sx={{ p: .7, background: active ? "#F0FDFA" : columnActive ? "#F0FDF4" : "#FFF" }}>
          <Box
            role="button"
            tabIndex={0}
            aria-label={`${person.name || person.employeeId}, ${date}, ${duty.shift || "no duty"}`}
            onClick={(event) => {
              event.stopPropagation();
              onSelectDuty({ person, groupName, date, duty });
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                event.stopPropagation();
                onSelectDuty({ person, groupName, date, duty });
              }
            }}
            className="crew-calendar-duty-cell"
            sx={{ minHeight: 50, px: .7, py: .65, display: "flex", flexDirection: "column", justifyContent: "center", cursor: "pointer", borderRadius: 2, backgroundColor: palette.background, backgroundImage: "none", color: palette.color, border: `1px solid ${palette.border}`, boxShadow: "none", "& .MuiTypography-root": { color: "inherit" }, "&:hover": { boxShadow: "0 0 0 2px rgba(0,87,183,.18)" } }}
          >
            <Typography sx={{ fontSize: 12.5, fontWeight: 900 }}>{duty.shift || "-"}</Typography>
            {duty.leaveStatus && <Typography sx={{ fontSize: 9.5, fontWeight: 800, lineHeight: 1.2 }}>{duty.leaveType || "Leave"} · {duty.leaveStatus}</Typography>}
            {duty.trainingName && <Typography sx={{ fontSize: 9.5, fontWeight: 800 }}>{duty.trainingName}</Typography>}
            {leaveApproved && <CheckCircle2 size={13} color="#15803D" strokeWidth={3} aria-label="Leave finally approved" style={{ alignSelf: "center" }} />}
            {replacementPending && <Box sx={{ mt: .25, px: .6, py: .15, borderRadius: 1, background: "#F59E0B", color: "#FFFFFF", fontSize: 9.5, fontWeight: 950, animation: "calendarReplacementPulse 1s ease-in-out infinite", "@keyframes calendarReplacementPulse": { "50%": { opacity: .35, transform: "scale(.92)" } } }}>R · Replacement required</Box>}
            {duty.replacementEmployee?.name && <Box sx={replacementLabelSx}><Box sx={{ width: 15, height: 15, borderRadius: .6, display: "grid", placeItems: "center", background: "#2563EB", color: "#FFF", fontSize: 8, flex: "0 0 auto" }}>R</Box><Box>Replacement: {duty.replacementEmployee.name}</Box></Box>}
            {duty.replacementFor?.name && <Box sx={replacementLabelSx}><Box sx={{ width: 15, height: 15, borderRadius: .6, display: "grid", placeItems: "center", background: "#2563EB", color: "#FFF", fontSize: 8, flex: "0 0 auto" }}>R</Box><Box>For: {duty.replacementFor.name}</Box></Box>}
            {duty.isActingSIC && <Typography sx={{ fontSize: 9.5, fontWeight: 900, color: "#6A1B9A" }}>Acting SIC · {duty.actingSICGroup || groupName}</Typography>}
          </Box>
        </TableCell>;
      })}
    </TableRow>
  );
});

export default function CrewCalendar() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const today = iso(new Date());
  const [startDate, setStartDate] = useState(addDays(today, -2));
  const [endDate, setEndDate] = useState(addDays(today, 10));
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

  const move = (days) => {
    setStartDate((value) => addDays(value, days));
    setEndDate((value) => addDays(value, days));
  };

  const totalCrew = data.reduce((count, group) => count + group.employees.length, 0);
  const activeGroups = data;
  const activeCrewCount = activeGroups.reduce((count, group) => count + group.employees.length, 0);
  const canManageReplacement = Boolean(user?.role === "admin" || user?.permissions?.crew_replacement?.write || user?.permissions?.crew_leave?.write || user?.permissions?.crew_training?.write);
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

  return (
    <AppShell>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: { xs: "flex-start", md: "center" }, gap: 2, flexWrap: "wrap" }}>
        <Box>
          <Typography sx={{ fontSize: 12, fontWeight: 900, color: "#17876D", letterSpacing: ".12em", textTransform: "uppercase" }}>Crew Management</Typography>
          <Typography variant="h4" sx={{ fontWeight: 900, color: "#0F172A", letterSpacing: "-.035em", mt: .5 }}>Daily Duty Calendar</Typography>
          <Typography sx={{ color: "#64748B", mt: .5 }}>Group-wise shift, leave, training and replacement visibility.</Typography>
        </Box>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <Chip icon={<Users size={16} />} label={`${totalCrew} crew`} sx={{ fontWeight: 800, background: "#ECFDF5", color: "#03624C" }} />
          {!!activeCrewCount && <Chip label={`${activeCrewCount} visible`} sx={{ fontWeight: 800, background: "#EEF2FF", color: "#3730A3" }} />}
          <Button variant="outlined" startIcon={<RefreshCw size={16} />} onClick={load} sx={{ borderRadius: 3, textTransform: "none", fontWeight: 800 }}>Refresh</Button>
          <Button variant="contained" startIcon={<ArrowLeftRight size={16} />} onClick={() => setExchangeOpen(true)} sx={{ borderRadius: 3, textTransform: "none", fontWeight: 850, background: "#0057B7" }}>Duty exchange / reassignment</Button>
        </Stack>
      </Box>

      <GlassCard hover={false} padding={2}>
        <Stack direction={{ xs: "column", md: "row" }} spacing={1.25} alignItems={{ md: "center" }} justifyContent="space-between">
          <Stack direction="row" spacing={1}>
            <Button onClick={() => move(-7)} startIcon={<ChevronLeft size={17} />} sx={{ borderRadius: 3, textTransform: "none", fontWeight: 800 }}>Previous 7 days</Button>
            <Button onClick={() => { setStartDate(addDays(today, -7)); setEndDate(addDays(today, 7)); }} startIcon={<CalendarDays size={17} />} variant="contained" sx={{ borderRadius: 3, textTransform: "none", fontWeight: 800, background: "#03624C" }}>Today</Button>
            <Button onClick={() => move(7)} endIcon={<ChevronRight size={17} />} sx={{ borderRadius: 3, textTransform: "none", fontWeight: 800 }}>Next 7 days</Button>
          </Stack>
          <Stack direction="row" spacing={1} alignItems="center">
            <input aria-label="Start date" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} style={{ border: "1px solid #CBD5E1", borderRadius: 10, padding: "9px 12px", fontWeight: 700 }} />
            <Typography color="#94A3B8">to</Typography>
            <input aria-label="End date" type="date" min={startDate} value={endDate} onChange={(event) => setEndDate(event.target.value)} style={{ border: "1px solid #CBD5E1", borderRadius: 10, padding: "9px 12px", fontWeight: 700 }} />
          </Stack>
        </Stack>
      </GlassCard>

      {error && <Alert severity="error">{error}</Alert>}
      <Box sx={{ px: 1.2, py: .8, display: "flex", alignItems: "center", gap: 1.3, flexWrap: "wrap", border: "1px solid #CBD5E1", borderRadius: 2, background: "#FFFFFF" }}>
        {[
          ["Morning", "#DCFCE7", "#86EFAC"],
          ["Evening", "#FEF3C7", "#FCD34D"],
          ["Night", "#DBEAFE", "#93C5FD"],
          ["OFF", "#E5E7EB", "#9CA3AF"],
          ["Pending leave", "#FFEDD5", "#FB923C"],
        ].map(([label, background, border]) => <Stack key={label} direction="row" spacing={.45} alignItems="center"><Box sx={{ width: 18, height: 14, borderRadius: .7, background, border: `1px solid ${border}` }} /><Typography sx={{ color: "#475569", fontSize: 10, fontWeight: 800 }}>{label}</Typography></Stack>)}
        <Stack direction="row" spacing={.4} alignItems="center"><Box sx={{ width: 24, height: 18, borderRadius: .7, display: "grid", placeItems: "center", background: "#FEE2E2", border: "1px solid #F87171" }}><CheckCircle2 size={12} color="#15803D" strokeWidth={3} /></Box><Typography sx={{ color: "#475569", fontSize: 10, fontWeight: 800 }}>Approved leave</Typography></Stack>
        <Stack direction="row" spacing={.4} alignItems="center"><Box sx={{ width: 18, height: 18, borderRadius: .7, display: "grid", placeItems: "center", background: "#F59E0B", color: "#FFF", fontSize: 9, fontWeight: 950, animation: "calendarReplacementPulse 1s ease-in-out infinite", "@keyframes calendarReplacementPulse": { "50%": { opacity: .35, transform: "scale(.86)" } } }}>R</Box><Typography sx={{ color: "#475569", fontSize: 10, fontWeight: 800 }}>Replacement required</Typography></Stack>
        <Stack direction="row" spacing={.4} alignItems="center"><Box sx={{ width: 18, height: 18, borderRadius: .7, display: "grid", placeItems: "center", background: "#2563EB", color: "#FFF", fontSize: 9, fontWeight: 950 }}>R</Box><Typography sx={{ color: "#475569", fontSize: 10, fontWeight: 800 }}>Replacement assigned</Typography></Stack>
      </Box>
      <GlassCard hover={false} padding={0} sx={{ overflow: "hidden" }}>
        {loading ? (
          <Box sx={{ minHeight: 360, display: "grid", placeItems: "center" }}><CircularProgress sx={{ color: "#03624C" }} /></Box>
        ) : (
          <Box sx={{ position: "relative", overflow: "auto", maxHeight: "calc(100vh - 265px)", overscrollBehavior: "contain" }}>
            <Table stickyHeader size="small" sx={{ borderCollapse: "separate", borderSpacing: 0 }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ position: "sticky !important", top: 0, left: 0, zIndex: 8, minWidth: 235, background: "#F8FAFC", fontWeight: 900, color: "#334155", borderRight: "1px solid #E2E8F0" }}>Name / designation</TableCell>
                  {dates.map((date) => <TableCell key={date} align="center" onClick={() => setSelectedColumn(date)} sx={{ position: "sticky !important", top: 0, zIndex: 7, minWidth: 108, cursor: "pointer", fontWeight: 900, color: date === today ? "#03624C" : "#334155", background: selectedColumn === date ? "#D1FAE5" : date === today ? "#ECFDF5" : "#F8FAFC", borderBottom: date === today ? "3px solid #00A86B" : undefined }}><Box>{displayDate(date)}</Box><Typography variant="caption" sx={{ fontWeight: 800, color: "#94A3B8" }}>{weekday(date)}</Typography></TableCell>)}
                </TableRow>
              </TableHead>
              <TableBody>
                {!data.length && <TableRow><TableCell colSpan={dates.length + 1} align="center" sx={{ py: 8, color: "#64748B", fontWeight: 700 }}>No calendar roster has been published yet.</TableCell></TableRow>}
                {activeGroups.map((group) => [
                  <TableRow key={`${group.groupName}-header`}><TableCell colSpan={dates.length + 1} sx={{ py: 1.2, background: "linear-gradient(90deg,#E8F5F1,#F8FAFC)", color: "#03624C", fontWeight: 900, letterSpacing: ".03em" }}>{group.groupName}</TableCell></TableRow>,
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
                    />
                  ))
                ])}
              </TableBody>
            </Table>
          </Box>
        )}
      </GlassCard>

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
              </Stack>
              {selectedDuty.duty.leaveStatus && (
                <Alert severity="info">
                  {selectedDuty.duty.leaveType || "Leave"} · {selectedDuty.duty.leaveStatus}
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
    </AppShell>
  );
}
