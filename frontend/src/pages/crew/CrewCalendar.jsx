import { useEffect, useMemo, useRef, useState, memo, useCallback } from "react";
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogContent, DialogTitle,
  IconButton, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography,
} from "@mui/material";
import { ArrowLeftRight, CalendarDays, ChevronLeft, ChevronRight, RefreshCw, Users, X } from "lucide-react";

import AppShell from "../../components/layout/AppShell";
import GlassCard from "../../components/ui/GlassCard";
import DutyReassignmentPanel from "../../components/crew/DutyReassignmentPanel";
import crewApi from "../../services/crewApi";

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
  border: "1px solid #86D3A5",
  background: "#DCFCE7",
  color: "#15803D",
  fontSize: 9.5,
  fontWeight: 950,
  lineHeight: 1.2,
};

const shiftStyle = (duty) => {
  const leave = String(duty?.leaveStatus || "").trim().toLowerCase();
  const shift = String(duty?.shift || "").trim().toUpperCase();
  const activeLeave = leave && !["rejected", "cancelled", "canceled", "withdrawn"].includes(leave);

  if (activeLeave) return { background: "#FDE8EC", color: "#C62828", border: "#F3A8B3" };
  if (duty?.trainingName || shift.includes("TRAINING") || shift.includes("TOUR")) {
    return { background: "#F0E7FA", color: "#6A1B9A", border: "#CDB4EA" };
  }

  if (["MORNING", "M1", "M2"].includes(shift)) return { background: "#E7F6E9", color: "#000000", border: "#A9DDB2" };
  if (["EVENING", "E1", "E2"].includes(shift)) return { background: "#FFF4CC", color: "#000000", border: "#E8D184" };
  if (["NIGHT", "N1", "N2"].includes(shift)) return { background: "#E4F2FF", color: "#000000", border: "#A7CFEF" };
  if (["OFF", "O1", "O2"].includes(shift)) return { background: "#ECEFF3", color: "#000000", border: "#C9D0D9" };
  return { background: "#F8FAFC", color: "#000000", border: "#D6DEE8" };
};

const EmployeeRow = memo(({ person, groupName, active, dates, selectedColumn, onSelectRow, onSelectDuty }) => {
  return (
    <TableRow hover onClick={() => onSelectRow(person.employeeId)} sx={{ cursor: "pointer", background: active ? "#F0FDFA" : person.IsSIC ? "#F8FFFC" : "#FFF" }}>
      <TableCell sx={{ position: "sticky", left: 0, zIndex: 2, minWidth: 235, background: active ? "#D1FAE5" : person.IsSIC ? "#ECFDF5" : "#FFF", borderRight: "1px solid #E2E8F0" }}>
        <Stack direction="row" spacing={1} alignItems="center"><Box><Typography sx={{ fontSize: 13.5, fontWeight: 900, color: "#0F172A" }}>{person.name || person.employeeId}</Typography><Typography sx={{ fontSize: 11.5, color: "#64748B" }}>{person.designation || "—"}</Typography></Box>{person.IsSIC && <Chip label="SIC" size="small" sx={{ height: 21, fontSize: 10, fontWeight: 900, background: "#D1FAE5", color: "#03624C" }} />}</Stack>
      </TableCell>
      {dates.map((date) => {
        const duty = person.duties?.[date] || { shift: "-" };
        const palette = shiftStyle(duty);
        const columnActive = selectedColumn === date;
        return <TableCell key={date} align="center" sx={{ p: .7, background: active ? "#F0FDFA" : columnActive ? "#F0FDF4" : "#FFF" }}>
          <Paper
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
            elevation={0}
            className="crew-calendar-duty-cell"
            style={{
              "--crew-duty-background": palette.background,
              "--crew-duty-color": palette.color,
              "--crew-duty-border": palette.border,
            }}
            sx={{ minHeight: 50, px: .7, py: .65, display: "flex", flexDirection: "column", justifyContent: "center", cursor: "pointer", "&:hover": { boxShadow: "0 0 0 2px rgba(0,87,183,.18)" } }}
          >
            <Typography sx={{ fontSize: 12.5, fontWeight: 900 }}>{duty.shift || "-"}</Typography>
            {duty.leaveStatus && <Typography sx={{ fontSize: 9.5, fontWeight: 800, lineHeight: 1.2 }}>{duty.leaveType || "Leave"} · {duty.leaveStatus}</Typography>}
            {duty.trainingName && <Typography sx={{ fontSize: 9.5, fontWeight: 800 }}>{duty.trainingName}</Typography>}
            {duty.replacementEmployee?.name && <Typography sx={replacementLabelSx}>Replacement: {duty.replacementEmployee.name}</Typography>}
            {duty.replacementFor?.name && <Typography sx={replacementLabelSx}>Replacement for: {duty.replacementFor.name}</Typography>}
            {duty.isActingSIC && <Typography sx={{ fontSize: 9.5, fontWeight: 900, color: "#6A1B9A" }}>Acting SIC · {duty.actingSICGroup || groupName}</Typography>}
          </Paper>
        </TableCell>;
      })}
    </TableRow>
  );
});

export default function CrewCalendar() {
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

  const handleSelectRow = useCallback((employeeId) => {
    setSelectedRow(employeeId);
  }, []);

  const handleSelectDuty = useCallback((selection) => {
    setSelectedRow(selection.person.employeeId);
    setSelectedColumn(selection.date);
    setSelectedDuty(selection);
  }, []);

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
