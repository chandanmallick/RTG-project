import { useEffect, useMemo, useRef, useState, memo, useCallback } from "react";
import {
  Alert, Box, Button, Chip, CircularProgress, Paper, Stack, Table, TableBody,
  TableCell, TableHead, TableRow, Typography,
} from "@mui/material";
import { CalendarDays, ChevronLeft, ChevronRight, RefreshCw, Users } from "lucide-react";

import AppShell from "../../components/layout/AppShell";
import GlassCard from "../../components/ui/GlassCard";
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

const shiftStyle = (duty) => {
  const leave = duty?.leaveStatus;
  if (leave === "Approved") return { background: "#FCE7F3", color: "#9D174D", border: "#F9A8D4" };
  if (leave === "Forwarded by SIC") return { background: "#FFEDD5", color: "#9A3412", border: "#FDBA74" };
  if (leave === "Applied" || leave === "Pending") return { background: "#FEF9C3", color: "#854D0E", border: "#FDE047" };
  if (duty?.trainingName) return { background: "#EDE9FE", color: "#5B21B6", border: "#C4B5FD" };
  return ({
    Morning: { background: "#E0F2FE", color: "#075985", border: "#7DD3FC" },
    Evening: { background: "#FFF7ED", color: "#9A3412", border: "#FDBA74" },
    Night: { background: "#ECFDF5", color: "#065F46", border: "#6EE7B7" },
    OFF: { background: "#FEE2E2", color: "#991B1B", border: "#FCA5A5" },
  })[duty?.shift] || { background: "#F8FAFC", color: "#64748B", border: "#E2E8F0" };
};

const EmployeeRow = memo(({ person, groupName, active, dates, selectedColumn, onSelectRow }) => {
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
          <Paper elevation={0} sx={{ minHeight: 50, px: .7, py: .65, borderRadius: 2.2, background: palette.background, color: palette.color, border: `1px solid ${palette.border}`, display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <Typography sx={{ fontSize: 12.5, fontWeight: 900 }}>{duty.shift || "-"}</Typography>
            {duty.leaveStatus && <Typography sx={{ fontSize: 9.5, fontWeight: 800, lineHeight: 1.2 }}>{duty.leaveType || "Leave"} · {duty.leaveStatus}</Typography>}
            {duty.trainingName && <Typography sx={{ fontSize: 9.5, fontWeight: 800 }}>{duty.trainingName}</Typography>}
            {duty.replacementEmployee?.name && <Typography sx={{ fontSize: 9.5, fontWeight: 800 }}>By {duty.replacementEmployee.name}</Typography>}
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
          <Box sx={{ overflow: "auto", maxHeight: "calc(100vh - 265px)" }}>
            <Table stickyHeader size="small" sx={{ borderCollapse: "separate", borderSpacing: 0 }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ position: "sticky", left: 0, zIndex: 6, minWidth: 235, background: "#F8FAFC", fontWeight: 900, color: "#334155", borderRight: "1px solid #E2E8F0" }}>Name / designation</TableCell>
                  {dates.map((date) => <TableCell key={date} align="center" onClick={() => setSelectedColumn(date)} sx={{ minWidth: 108, cursor: "pointer", fontWeight: 900, color: date === today ? "#03624C" : "#334155", background: selectedColumn === date ? "#D1FAE5" : date === today ? "#ECFDF5" : "#F8FAFC", borderBottom: date === today ? "3px solid #00A86B" : undefined }}><Box>{displayDate(date)}</Box><Typography variant="caption" sx={{ fontWeight: 800, color: "#94A3B8" }}>{weekday(date)}</Typography></TableCell>)}
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
                    />
                  ))
                ])}
              </TableBody>
            </Table>
          </Box>
        )}
      </GlassCard>
    </AppShell>
  );
}
