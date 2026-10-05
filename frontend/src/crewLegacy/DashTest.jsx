import { useCallback, useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { Alert, Box, Button, Chip, CircularProgress, Dialog, DialogContent, DialogTitle, IconButton, Paper, Stack, Tab, Tabs, TextField, Tooltip, Typography } from "@mui/material";
import { ArrowUpRight, ArrowLeftRight, CheckCheck, ChevronLeft, ChevronRight, ClipboardList, History, Plus, RefreshCw, Trophy, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import api from "./api";
import crewApi from "../services/crewApi";
import CrewCalendar from "../pages/crew/CrewCalendar";
import ReplacementManagement from "./ReplacementManagement";
import { useAuth } from "../auth/AuthContext";
import LeaveTracking from "../components/crew/LeaveTracking";
import { createDashDemo, demoEmployeeId, demoEvents } from "./dashDemoData";
import DashDemoWorkspace from "./DashDemoWorkspace";
import groupLeaveApplications from "../components/crew/groupLeaveApplications";
import TrainingCalendarReview from "../components/crew/TrainingCalendarReview";
import LeaveBlockedPeriods from "../components/crew/LeaveBlockedPeriods";

const palette = { holiday: "#E35464", training: "#8B5CF6", sports: "#16A677" };
const shifts = { M: { name: "Morning", color: "#108572", bg: "#E4F5EE" }, E: { name: "Evening", color: "#B47A19", bg: "#FFF4D9" }, N: { name: "Night", color: "#6660C6", bg: "#EFEDFC" }, O: { name: "Off", color: "#87919F", bg: "#F0F2F6" } };
const shortShift = (value) => {
  const text = String(value || "").toUpperCase();
  if (/^(M|MORNING)(\d)?$/.test(text)) return "M";
  if (/^(E|EVENING)(\d)?$/.test(text)) return "E";
  if (/^(N|NIGHT)(\d)?$/.test(text)) return "N";
  if (/^(O|OFF)(\d)?$/.test(text)) return "O";
  return text || "—";
};
const compactName = (name) => {
  const words = String(name || "").trim().split(/\s+/);
  return words.length > 1 ? `${words.slice(0, -1).map(word => word[0]).join(". ")}. ${words.at(-1)}` : words[0];
};
const isPending = (status) => /pending|applied|nominated|forwarded|requested/i.test(String(status || ""));
const destinations = { Leave: "/crew/leave?section=tracking", Training: "/crew/training?section=history", Sports: "/crew/sports?section=approval", Exchange: "/crew/replacement?section=duty&focus=history", Replacement: "/crew/replacement?section=board" };
const approvalOptions = [
  { title: "Leave approval", path: "/crew/leave?section=pending" },
  { title: "Training Assignment", path: "/crew/training?section=assign" },
  { title: "Training approval", path: "/crew/training?section=pending" },
  { title: "Sports approval", path: "/crew/sports?section=approval" },
  { title: "Replacement approval", path: "/crew/replacement?section=duty&focus=approvals" },
];
const card = { p: 2.3, borderRadius: "22px", border: "1px solid #E8EDF1", boxShadow: "0 5px 22px #19314B05", background: "#FFF", backgroundImage: "none", minWidth: 0 };

function Heading({ number, title, note, action }) {
  return <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}><Box sx={{ color: "#9AA4AF", fontSize: 10, fontWeight: 800 }}>{String(number).padStart(2, "0")}</Box><Box sx={{ flex: 1 }}><Typography sx={{ color: "#233442", fontSize: 16, fontWeight: 800 }}>{title}</Typography>{note && <Typography sx={{ fontSize: 10.5, color: "#8A95A1", mt: .3 }}>{note}</Typography>}</Box>{action}</Box>;
}

export default function DashTest({ demo = false }) {
  const routeNavigate = useNavigate();
  const [demoWorkspace, setDemoWorkspace] = useState("");
  const navigate = path => demo ? setDemoWorkspace(path) : routeNavigate(path);
  const { user } = useAuth();
  const today = dayjs().format("YYYY-MM-DD");
  const dates = useMemo(() => Array.from({ length: 9 }, (_, i) => dayjs(today).add(i - 1, "day").format("YYYY-MM-DD")), [today]);
  const [month, setMonth] = useState(dayjs().startOf("month"));
  const [groups, setGroups] = useState([]);
  const [events, setEvents] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [leaveStats, setLeaveStats] = useState([]);
  const [actions, setActions] = useState({});
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState([]);
  const [eventError, setEventError] = useState("");
  const [eventLoading, setEventLoading] = useState(false);
  const [popup, setPopup] = useState("");
  const [replacementTab, setReplacementTab] = useState("duty");
  const [kind, setKind] = useState("All");
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState("mine");
  const [refreshKey, setRefreshKey] = useState(0);
  const [mutation, setMutation] = useState(null);
  const [saving, setSaving] = useState(false);
  const [mutationError, setMutationError] = useState("");
  const [trainingReview, setTrainingReview] = useState("");

  const refresh = useCallback(() => setRefreshKey(value => value + 1), []);
  useEffect(() => {
    if (demo) {
      const sample = createDashDemo(today);
      setGroups(sample.groups); setActions(sample.actions); setLeaderboard(sample.leaderboard); setLeaveStats(sample.leaveStats); setRecords(sample.records); setLoading(false); setErrors([]);
      return;
    }
    let active = true;
    setLoading(true);
    const tasks = [
      ["Roster", () => crewApi.calendar(dates[0], dates.at(-1)), setGroups],
      ["Approval access", () => api.get("/operations/summary").then(r => r.data.actions), setActions],
      ["Leader board", () => api.get("/dashboard/top-replacements").then(r => r.data), setLeaderboard],
      ["Leave statistics", () => api.get("/dashboard/analytics/group-wise", { params: { year: dayjs(today).year(), month: dayjs(today).month() + 1 } }).then(r => r.data), setLeaveStats],
      ...[
        ["Leave", "/leave/list", { completedFrom: "2000-01-01" }],
        ["Training", "/training-assign/history"],
        ["Sports", "/sports/applications"],
        ["Exchange", "/replacement/duty-switch/exchange-requests", { status: "All" }],
        ["Replacement", "/replacement/history", { employeeId: user?.employeeId || localStorage.getItem("crewEmployeeId") }],
      ].map(([type, endpoint, params]) => [type, () => api.get(endpoint, { params }).then(r => (r.data || []).map(row => ({ ...row, kind: type }))), null]),
    ];
    Promise.allSettled(tasks.map(([, fetch]) => fetch())).then(results => {
      if (!active) return;
      const failures = [], rows = [];
      results.forEach((result, index) => {
        const [label, , setValue] = tasks[index];
        if (result.status === "fulfilled") {
          if (setValue) setValue(result.value || []); else rows.push(...result.value);
        } else {
          failures.push(label);
          if (setValue) setValue(label === "Approval access" ? {} : []);
        }
      });
      setRecords(rows.map(row => row.kind === "Replacement" ? { ...row, employeeId: user?.employeeId || localStorage.getItem("crewEmployeeId") } : row)); setErrors(failures); setLoading(false);
    });
    const timer = window.setInterval(refresh, 60000);
    window.addEventListener("crew-workflows-changed", refresh);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener("crew-workflows-changed", refresh); };
  }, [dates, today, refresh, refreshKey, user?.employeeId, demo]);

  useEffect(() => {
    if (demo) { setEvents(demoEvents(month)); setEventLoading(false); setEventError(""); return; }
    let active = true;
    setEventLoading(true); setEventError("");
    crewApi.calendarEvents(month.startOf("month").format("YYYY-MM-DD"), month.endOf("month").format("YYYY-MM-DD"))
      .then(data => { if (active) setEvents(data || []); })
      .catch(() => { if (active) { setEvents([]); setEventError("Events could not be loaded."); } })
      .finally(() => { if (active) setEventLoading(false); });
    return () => { active = false; };
  }, [month, refreshKey, demo]);

  const actor = demo ? demoEmployeeId : String(user?.employeeId || localStorage.getItem("crewEmployeeId") || localStorage.getItem("employeeId") || "");
  const owns = row => String(row.employeeId || row.requesterEmployeeId || row.requesterId || row.firstEmployee?.employeeId || row.firstEmployeeId || "") === actor || String(row.secondEmployee?.employeeId || "") === actor;
  const statusOf = row => row.finalStatus || row.status || "Recorded";
  const dateOf = row => row.startDate || row.date || row.sourceDate || "";
  const endOf = row => row.endDate || row.destinationDate || dateOf(row);
  const approvalKeys = ["leaveApproval", "trainingApproval", "sportsApproval", "exchangeApproval"];
  const approvalAccess = approvalKeys.slice(0, 3).some(key => actions[key]?.enabled) || actions.trainingAssignment?.enabled || actions.delegate?.enabled;
  const pendingApprovals = approvalKeys.reduce((sum, key) => sum + Number(actions[key]?.pending || 0), 0);
  const clubRecords = rows => [...groupLeaveApplications(rows.filter(row => row.kind === "Leave")).map(application => ({ ...application.anchor, ...application, kind: "Leave" })), ...rows.filter(row => row.kind !== "Leave")];
  const pendingMine = clubRecords(records.filter(row => owns(row) && isPending(statusOf(row)) && endOf(row) >= dayjs(today).subtract(2, "day").format("YYYY-MM-DD"))).length;
  const visibleRecords = clubRecords(records.filter(row => (kind === "All" || row.kind === kind) && (scope === "all" || owns(row)) && (popup !== "tracking" || endOf(row) >= dayjs(today).subtract(2, "day").format("YYYY-MM-DD")) && `${row.employeeName || row.name || ""} ${row.kind} ${row.trainingName || row.sportsName || row.eventName || row.leaveType || ""} ${dateOf(row)} ${statusOf(row)}`.toLowerCase().includes(search.toLowerCase()))).sort((a, b) => dateOf(b).localeCompare(dateOf(a)));
  const openRecords = type => { setKind("All"); setSearch(""); setScope("mine"); setPopup(type); };
  const requestMutation = (action, row, dates = []) => { setMutationError(""); setMutation({ action, row, dates }); };
  const performMutation = async () => {
    setSaving(true); setMutationError("");
    try {
      if (demo) {
        setRecords(rows => rows.map(row => row.kind === "Leave" && (mutation.action === "cancel-group" ? (mutation.row.leaveGroupId ? row.leaveGroupId === mutation.row.leaveGroupId : row.employeeId === mutation.row.employeeId) && mutation.dates.includes(row.date) : row.id === mutation.row.id) ? { ...row, finalStatus: mutation.action === "withdraw" ? "Withdrawn" : "Cancelled", canCancel: false } : row));
        setMutation(null); return;
      }
      if (mutation.action === "cancel-group") await api.put("/leave/cancel-group", { leaveId: mutation.row.id, leaveGroupId: mutation.row.leaveGroupId, dates: mutation.dates });
      else await api.put(`/leave/${mutation.action}/${mutation.row.id}`);
      setMutation(null); refresh(); window.dispatchEvent(new Event("crew-workflows-changed")); localStorage.setItem("crew-workflows-changed", String(Date.now()));
    } catch (failure) { setMutationError(failure.response?.data?.detail || failure.message || "The application could not be updated."); }
    finally { setSaving(false); }
  };
  const monthCells = Array.from({ length: 42 }, (_, index) => month.startOf("month").subtract((month.startOf("month").day() + 6) % 7, "day").add(index, "day"));
  const totalLeaves = leaveStats.reduce((sum, row) => sum + Number(row.count || 0), 0);
  const maxLeave = Math.max(...leaveStats.map(row => Number(row.count || 0)), 1);
  const maxReplacement = Math.max(...leaderboard.map(row => Number(row.value || 0)), 1);
  const quickActions = [
    { number: 1, title: "Apply", subtitle: "(Leave, training, sports & Exchange)", icon: Plus, color: "#087E78", bg: "#E6F5F1", click: () => setPopup("apply"), foot: "Start an application" },
    { number: 2, title: "Approval", subtitle: "(for Reporting officer only)", icon: CheckCheck, color: "#BA841B", bg: "#FFF5DC", click: () => approvalAccess ? setPopup("approval") : setPopup("restricted"), count: approvalAccess ? pendingApprovals : 0, foot: approvalAccess ? "Awaiting your decision" : "Access Restricted" },
    { number: 3, title: "Tracking", subtitle: "(for all application)", icon: ClipboardList, color: "#7760CD", bg: "#F0EBFC", click: () => openRecords("tracking"), count: pendingMine, foot: "Your pending applications" },
    { number: 4, title: "History", subtitle: "(for all application)", icon: History, color: "#B46D83", bg: "#FAEDF2", click: () => openRecords("history"), foot: "Records & cancellation" },
    { number: 5, title: "Replacement", subtitle: "Duty coverage & exchange", icon: ArrowLeftRight, color: "#4775AB", bg: "#EAF2FB", click: () => { setReplacementTab("duty"); setPopup("replacement"); }, foot: "Manage duty coverage" },
  ];

  return <Box sx={{ p: { xs: 1.5, md: 3 }, background: "#F5F7F9", minHeight: "100%", color: "#233442" }}>
    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 3, gap: 2 }}><Box><Stack direction="row" spacing={1} alignItems="center"><Typography sx={{ fontSize: 28, fontWeight: 850, letterSpacing: "-.8px" }}>Dash Test</Typography><Chip size="small" label="PREVIEW" sx={{ fontSize: 9, letterSpacing: 1, bgcolor: "#E5F3ED", color: "#18806B", height: 21 }} /></Stack><Typography sx={{ mt: .5, fontSize: 12, color: "#83909E" }}>Crew Management · Your people, plans and duties at a glance.</Typography></Box><Stack direction="row" alignItems="center" spacing={1}><Typography sx={{ display: { xs: "none", sm: "block" }, fontSize: 12, color: "#6F7D8C" }}>{dayjs(today).format("ddd, DD MMM YYYY")}</Typography><IconButton aria-label="Refresh dashboard" onClick={refresh} disabled={loading} sx={{ bgcolor: "#FFF", border: "1px solid #E4E9EE" }}><RefreshCw size={17} /></IconButton></Stack></Box>
    {demo && <Alert severity="info" sx={{ mb: 2 }}>Interactive sample preview · No login or database needed. All names, duties and counts are sample data.</Alert>}
    {errors.length > 0 && <Alert severity="warning" sx={{ mb: 2 }} action={<Button onClick={refresh}>Retry</Button>}>Could not load: {errors.join(", ")}. Other available sections remain usable.</Alert>}
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", xl: "minmax(0,1fr) 300px" }, gap: 2.2, alignItems: "start" }}>
      <Box sx={{ minWidth: 0 }}>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2,minmax(0,1fr))", md: "repeat(5,minmax(0,1fr))" }, gap: 1.4, mb: 2.2 }}>
          {quickActions.map(item => <Button key={item.number} onClick={item.click} sx={{ display: "flex", flexDirection: "column", alignItems: "stretch", textAlign: "left", textTransform: "none", p: 1.8, minHeight: 155, borderRadius: "20px", color: item.color, bgcolor: item.bg, border: `1px solid ${item.color}16`, transition: "transform .18s,box-shadow .18s", "&:hover": { bgcolor: item.bg, transform: "translateY(-3px)", boxShadow: `0 8px 20px ${item.color}15` } }}><Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1.5 }}><item.icon size={22} strokeWidth={1.7} /><Typography sx={{ fontSize: 10, opacity: .65 }}>{String(item.number).padStart(2, "0")}</Typography></Box><Typography sx={{ fontSize: 17, fontWeight: 850, color: "#263746" }}>{item.title}</Typography><Typography sx={{ fontSize: 9, lineHeight: 1.5, minHeight: 27, mt: .3, color: "#71808E" }}>{item.subtitle}</Typography><Box sx={{ display: "flex", alignItems: "center", gap: .5, mt: 1.2 }}><Typography sx={{ fontSize: 9, flex: 1 }}>{item.foot}</Typography>{item.count > 0 ? <Chip size="small" label={item.count} sx={{ bgcolor: "#FFF", color: item.color, fontWeight: 800, height: 22 }} /> : <ArrowUpRight size={13} />}</Box></Button>)}
        </Box>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "minmax(0,1.85fr) minmax(230px,1fr)" }, gap: 2.2, alignItems: "start" }}>
          <Paper sx={{ ...card, p: 0, overflow: "hidden" }}>
            <Box sx={{ px: 2.3, pt: 2.3 }}><Heading number={7} title="Roster Calendar" note="Yesterday through the next 7 days" action={<IconButton aria-label="Open full roster calendar" onClick={() => navigate("/crew/calendar")}><ArrowUpRight size={17} /></IconButton>} /></Box>
            <Box sx={{ overflow: "auto", maxHeight: 640 }}><Box component="table" data-crew-table-tools="off" sx={{ width: "100%", borderCollapse: "collapse", minWidth: 620, fontSize: 10, "& th,& td": { borderBottom: "1px solid #EFF2F5", p: .75, textAlign: "center" } }}>
              <thead><tr><Box component="th" sx={{ position: "sticky", top: 0, left: 0, zIndex: 3, bgcolor: "#FFF", width: 130, textAlign: "left !important", pl: "18px !important" }}>Personnel</Box>{dates.map(date => <Box component="th" key={date} sx={{ position: "sticky", top: 0, zIndex: 2, bgcolor: date === today ? "#EAF6F0" : "#FFF", color: date === today ? "#11806A" : "#788594", fontWeight: 600 }}><Typography sx={{ fontSize: 8.5 }}>{date === today ? "Today" : dayjs(date).format("ddd")}</Typography><Typography sx={{ fontSize: 12, fontWeight: 850 }}>{dayjs(date).format("DD")}</Typography></Box>)}</tr></thead>
              <tbody>{groups.map(group => <RosterGroup key={group.groupId || group.groupName} group={group} dates={dates} onOpen={() => navigate("/crew/calendar")} />)}</tbody>
            </Box></Box>
            {!groups.length && <Box sx={{ p: 5, textAlign: "center", color: "#83909E" }}>{loading ? <CircularProgress size={22} /> : "No roster available for this period."}</Box>}
            <Stack direction="row" spacing={1.2} sx={{ p: 1.7, borderTop: "1px solid #EDF1F4" }} flexWrap="wrap">{Object.entries(shifts).map(([key, tone]) => <Typography key={key} sx={{ fontSize: 9, color: tone.color }}>{key} · {tone.name}</Typography>)}<Typography sx={{ fontSize: 9, color: "#B7791D" }}>Amber · Pending</Typography></Stack>
          </Paper>
          <Stack spacing={2.2}>
            <Paper sx={card}><Heading number={8} title="Leader Board" note="Replacement duties · last 60 days" /><Stack spacing={1.6}>{leaderboard.slice(0, 5).map((row, index) => <Box key={`${row.name}-${index}`}><Stack direction="row" spacing={1} alignItems="center"><Box sx={{ width: 26, height: 26, borderRadius: "9px", bgcolor: index === 0 ? "#FFF2D4" : "#F2F5F8", color: index === 0 ? "#B88624" : "#8C97A4", display: "grid", placeItems: "center", fontSize: 11 }}>{index === 0 ? <Trophy size={14} /> : String(index + 1).padStart(2, "0")}</Box><Typography noWrap sx={{ flex: 1, fontSize: 11, fontWeight: 750 }}>{row.name}</Typography><Typography sx={{ fontSize: 14, fontWeight: 850 }}>{row.value}</Typography></Stack><Box sx={{ mt: .8, ml: 4.3, height: 5, bgcolor: "#F1F4F6", borderRadius: 9 }}><Box sx={{ height: "100%", width: `${Number(row.value || 0) / maxReplacement * 100}%`, bgcolor: index === 0 ? "#0D9685" : "#B0DCD1", borderRadius: 9 }} /></Box></Box>)}</Stack>{!leaderboard.length && <Empty loading={loading} text="No replacement duties recorded." />}</Paper>
            <Paper sx={card}><Heading number={9} title="Stat of leave" note={dayjs(today).format("MMMM YYYY · Group wise")} /><Stack direction="row" spacing={1} alignItems="baseline" sx={{ mb: 2 }}><Typography sx={{ fontSize: 30, fontWeight: 850, letterSpacing: -1 }}>{totalLeaves}</Typography><Typography sx={{ color: "#929DA9", fontSize: 10 }}>leave days</Typography></Stack><Box sx={{ display: "flex", gap: 1.2, height: 160, alignItems: "end", overflowX: "auto" }}>{leaveStats.map((row, index) => <Tooltip key={`${row.group}-${index}`} title={`${row.group}: ${row.count} leave days`}><Box sx={{ minWidth: 38, flex: 1, height: "100%", display: "flex", flexDirection: "column", justifyContent: "end", alignItems: "center" }}><Typography sx={{ fontSize: 10, color: "#6F7C8A", mb: .5 }}>{row.count}</Typography><Box sx={{ width: "75%", maxWidth: 42, height: `${Number(row.count || 0) / maxLeave * 115}px`, bgcolor: ["#8EBCB0", "#A69BDE", "#E4C681", "#93BED8"][index % 4], borderRadius: "7px 7px 2px 2px" }} /><Typography noWrap sx={{ fontSize: 8.5, maxWidth: 55, mt: 1 }}>{row.group || "Group"}</Typography></Box></Tooltip>)}</Box>{!leaveStats.length && <Empty loading={loading} text="No leave data this month." />}</Paper>
          </Stack>
        </Box>
      </Box>
      <Stack spacing={2.2}>
        <Paper sx={card}><Heading number={6} title="Event Calendar" action={<IconButton aria-label="Open event calendar" onClick={() => navigate("/crew/calendar?view=events")}><ArrowUpRight size={16} /></IconButton>} /><Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.4 }}><IconButton size="small" aria-label="Previous month" onClick={() => setMonth(value => value.subtract(1, "month"))}><ChevronLeft size={16} /></IconButton><Typography sx={{ fontSize: 12, fontWeight: 800 }}>{month.format("MMMM YYYY")}</Typography><IconButton size="small" aria-label="Next month" onClick={() => setMonth(value => value.add(1, "month"))}><ChevronRight size={16} /></IconButton></Stack>{eventError && <Alert severity="warning" sx={{ fontSize: 10 }}>{eventError}</Alert>}<Box sx={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: .5, opacity: eventLoading ? .5 : 1 }}>{["M", "T", "W", "T", "F", "S", "S"].map((day, index) => <Typography key={index} sx={{ textAlign: "center", fontSize: 9, color: "#A0A9B3", mb: .6 }}>{day}</Typography>)}{monthCells.map(date => {
          const key = date.format("YYYY-MM-DD"), dayEvents = events.filter(event => event.startDate <= key && (event.endDate || event.startDate) >= key), inMonth = date.month() === month.month();
          return <Tooltip key={key} title={dayEvents.length ? <Box>{dayEvents.map((event, index) => <Typography key={index} sx={{ fontSize: 11 }}>{event.title} · {event.kind}{event.detail ? ` · ${event.detail}` : ""}</Typography>)}</Box> : date.format("DD MMM YYYY")}><Button onClick={() => navigate("/crew/calendar?view=events")} aria-label={`${date.format("DD MMM YYYY")}${dayEvents.length ? `, ${dayEvents.map(event => event.title).join(", ")}` : ""}`} sx={{ minWidth: 0, height: 31, p: 0, borderRadius: "10px", flexDirection: "column", fontSize: 11, color: key === today ? "#FFF" : dayEvents.length ? palette[dayEvents[0].kind] : "#536170", bgcolor: key === today ? "#188F7B" : dayEvents.length ? `${palette[dayEvents[0].kind] || "#8B5CF6"}12` : "transparent", opacity: inMonth ? 1 : .28, "&:hover": { bgcolor: "#DDEFE8", color: "#233442" } }}>{date.date()}<Box sx={{ display: "flex", gap: "2px" }}>{[...new Set(dayEvents.map(event => event.kind))].map(type => <Box key={type} sx={{ width: 3, height: 3, borderRadius: "50%", bgcolor: palette[type] }} />)}</Box></Button></Tooltip>;
        })}</Box><Stack direction="row" spacing={1.4} sx={{ mt: 2 }}>{Object.entries(palette).map(([label, color]) => <Stack key={label} direction="row" alignItems="center" spacing={.5}><Box sx={{ width: 5, height: 5, bgcolor: color, borderRadius: "50%" }} /><Typography sx={{ fontSize: 8.5, color: "#87929F", textTransform: "capitalize" }}>{label}</Typography></Stack>)}</Stack>{actions.specialEventRoster?.enabled && <Button fullWidth size="small" onClick={() => demo ? setDemoWorkspace("special-event") : setPopup("special-event")} sx={{ mt: 1.5, textTransform: "none" }}>Special Event roster</Button>}</Paper>
        <Paper sx={card}><Heading number={10} title="Upcoming shift" note="From tomorrow · next 5 days" /><Box sx={{ maxHeight: 560, overflowY: "auto", pr: .5 }}>{Array.from({ length: 5 }, (_, i) => dayjs(today).add(i + 1, "day").format("YYYY-MM-DD")).map(date => <Box key={date} sx={{ mb: 2.2 }}><Typography sx={{ fontSize: 14, fontWeight: 800, color: "#536170", mb: 1.5 }}>{dayjs(date).format("ddd, DD MMM")}</Typography>{["M", "E", "N"].map(code => {
          const people = groups.flatMap(group => (group.employees || []).filter(person => shortShift(person.duties?.[date]?.shift) === code && !/approved/i.test(person.duties?.[date]?.leaveStatus || "")));
          return <Box key={code} sx={{ display: "flex", alignItems: "start", gap: 1.5, mb: 1.5, p: 1.3, bgcolor: shifts[code].bg, borderRadius: 3 }}><Box sx={{ width: 42, height: 48, flexShrink: 0, borderRadius: "10px", bgcolor: shifts[code].bg, color: shifts[code].color, display: "grid", placeItems: "center", fontWeight: 850, fontSize: 20 }}>{code}</Box><Box sx={{ borderLeft: `2px solid ${shifts[code].color}70`, pl: 1, minWidth: 0 }}><Typography sx={{ fontSize: 15, fontWeight: 800 }}>{shifts[code].name}<Box component="span" sx={{ ml: .6, color: "#9AA4AE", fontSize: 12, fontWeight: 650 }}>{people.length}</Box></Typography><Typography sx={{ fontSize: 13, lineHeight: 1.7, color: "#465663", mt: .3 }}>{people.map(person => `${person.IsSIC ? "SIC " : ""}${compactName(person.name || person.employeeId)}`).join(" · ") || (loading ? "Loading…" : "No personnel scheduled")}</Typography></Box></Box>;
        })}</Box>)}</Box></Paper>
      </Stack>
    </Box>
    <Dialog open={Boolean(mutation)} onClose={() => !saving && setMutation(null)}><DialogTitle>{mutation?.action === "withdraw" ? "Withdraw application?" : "Cancel leave?"}</DialogTitle><DialogContent><Typography sx={{ mb: 2 }}>{mutation?.row.name || mutation?.row.employeeName} · {mutation?.row.date}{mutation?.dates.length > 0 ? ` · ${mutation.dates.length} date(s): ${mutation.dates.join(", ")}` : ""}</Typography>{mutationError && <Alert severity="error" sx={{ mb: 2 }}>{mutationError}</Alert>}<Stack direction="row" spacing={1}><Button disabled={saving} onClick={() => setMutation(null)}>Keep application</Button><Button disabled={saving} color="warning" variant="contained" onClick={performMutation}>{saving ? "Saving…" : "Confirm"}</Button></Stack></DialogContent></Dialog>
    <Dialog open={demo && (Boolean(demoWorkspace) || popup === "apply")} onClose={() => { setDemoWorkspace(""); if (popup === "apply") setPopup(""); }} fullWidth maxWidth="md"><DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>{demoWorkspace ? demoWorkspace.includes("operations") ? "Approval preview" : demoWorkspace.includes("view=events") ? "Event calendar preview" : "Crew workspace preview" : popup === "apply" ? "New crew application" : "Replacement"}<IconButton aria-label="Close sample workspace" onClick={() => { setDemoWorkspace(""); if (popup === "apply") setPopup(""); }}><X size={18} /></IconButton></DialogTitle><DialogContent dividers>{demo && (demoWorkspace || popup === "apply") && <DashDemoWorkspace key={demoWorkspace || popup} workspace={demoWorkspace || popup} groups={groups} records={records} events={events} onSubmit={row => setRecords(rows => [{ ...row, id: `demo-${Date.now()}`, employeeId: demoEmployeeId, employeeName: "Anil Sharma", status: "Pending", ...(row.kind === "Leave" ? { finalStatus: "Applied", sicApprovalStatus: "Pending", isOwner: true, canCancel: true } : {}) }, ...rows])} />}</DialogContent></Dialog>
    <Dialog open={!demo && Boolean(trainingReview)} onClose={() => setTrainingReview("")} fullWidth maxWidth="md"><DialogTitle sx={{ display: "flex", justifyContent: "space-between" }}>Training details & management<IconButton aria-label="Close training review" onClick={() => setTrainingReview("")}><X size={18} /></IconButton></DialogTitle><DialogContent dividers>{!demo && trainingReview && <TrainingCalendarReview requestId={trainingReview} onChanged={refresh} onReplacement={() => navigate("/crew/calendar?filter=coverage")} />}</DialogContent></Dialog>
    <Dialog open={!demo && popup === "special-event" && Boolean(actions.specialEventRoster?.enabled)} onClose={() => setPopup("")} fullWidth maxWidth="xl"><DialogTitle sx={{ display: "flex", justifyContent: "space-between" }}>Special Event roster<IconButton aria-label="Close special event roster" onClick={() => setPopup("")}><X size={18} /></IconButton></DialogTitle><DialogContent>{!demo && popup === "special-event" && actions.specialEventRoster?.enabled && <LeaveBlockedPeriods isAdmin />}</DialogContent></Dialog>
    {!demo && popup === "apply" && <CrewCalendar applicationOnly onApplicationClose={() => { setPopup(""); refresh(); }} />}
    <Dialog open={popup === "replacement"} onClose={() => setPopup("")} fullWidth maxWidth="lg"><DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>Replacement<IconButton aria-label="Close replacement" onClick={() => setPopup("")}><X size={18} /></IconButton></DialogTitle><DialogContent dividers><Tabs aria-label="Replacement options" value={replacementTab} onChange={(_, value) => setReplacementTab(value)} variant="scrollable" scrollButtons="auto" sx={{ mb: 2 }}><Tab value="duty" label="Exchange" /><Tab value="leave" label="Replacement by other employees" /></Tabs>{popup === "replacement" && (demo ? <DashDemoWorkspace key={replacementTab} workspace={replacementTab === "duty" ? "apply-exchange" : "replacement"} groups={groups} records={records} events={events} onSubmit={row => setRecords(rows => [{ ...row, id: `demo-${Date.now()}`, employeeId: demoEmployeeId, employeeName: "Anil Sharma", status: "Pending" }, ...rows])} /> : <ReplacementManagement key={replacementTab} initialWorkflow={replacementTab} />)}</DialogContent></Dialog>
    <Dialog open={popup === "approval"} onClose={() => setPopup("")} fullWidth maxWidth="sm"><DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>Approval options<IconButton aria-label="Close approval options" onClick={() => setPopup("")}><X size={18} /></IconButton></DialogTitle><DialogContent dividers><Stack spacing={1.3}>{approvalOptions.map(option => <Button key={option.path} variant="outlined" endIcon={<ArrowUpRight size={18} />} onClick={() => { setPopup(""); navigate(option.path); }} sx={{ justifyContent: "space-between", textTransform: "none", fontSize: 15, p: 1.8 }}>{option.title}</Button>)}</Stack></DialogContent></Dialog>
    <Dialog open={popup === "restricted"} onClose={() => setPopup("")}><DialogTitle>Access Restricted</DialogTitle><DialogContent><Typography>Approval is available to reporting officers and employees with delegated approval power.</Typography><Button onClick={() => setPopup("")} sx={{ mt: 2 }}>Close</Button></DialogContent></Dialog>
    <Dialog open={["tracking", "history"].includes(popup)} onClose={() => setPopup("")} fullWidth maxWidth="lg"><DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}><Box>{popup === "tracking" ? "Application Tracking" : "Application History"}<Typography sx={{ fontSize: 11, color: "#83909E" }}>{popup === "tracking" ? "From D−2 through all future applications. Pending rows are amber." : "Leave, training, sports, exchange and replacement records."}</Typography></Box><IconButton aria-label="Close applications" onClick={() => setPopup("")}><X size={18} /></IconButton></DialogTitle><DialogContent dividers><Tabs value={kind} onChange={(_, value) => setKind(value)} variant="scrollable" scrollButtons="auto">{["All", ...Object.keys(destinations)].map(value => <Tab key={value} value={value} label={value} sx={{ textTransform: "none" }} />)}</Tabs><Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ my: 2 }}><TextField label="Search applications" size="small" value={search} onChange={event => setSearch(event.target.value)} sx={{ flex: 1 }} /><Button variant={scope === "mine" ? "contained" : "outlined"} onClick={() => setScope("mine")}>My applications</Button><Button variant={scope === "all" ? "contained" : "outlined"} onClick={() => setScope("all")}>Authorised records</Button></Stack>{errors.some(error => Object.keys(destinations).includes(error)) && <Alert severity="warning" sx={{ mb: 2 }}>Some application records could not be loaded. Use Refresh on the dashboard to retry.</Alert>}<Stack spacing={1}>{visibleRecords.map((row, index) => <Paper variant="outlined" key={`${row.kind}-${row.id || row._id || index}`} sx={{ p: 1.6, borderRadius: 2, bgcolor: isPending(statusOf(row)) ? "#FFF8E5" : "#FAFCFD", borderColor: isPending(statusOf(row)) ? "#EED28D" : "#E5EAF0" }}><Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ sm: "center" }}><Box sx={{ flex: 1 }}><Typography sx={{ fontSize: 13, fontWeight: 800 }}>{row.employeeName || row.name || row.employeeId || row.firstEmployee?.name || row.requesterName || "Application"} · {row.kind}</Typography><Typography sx={{ fontSize: 11, color: "#788493", mt: .4 }}>{row.leaveType || row.trainingName || row.sportsName || row.eventName || row.assignedDuty || "Duty application"} · {dateOf(row) || "Date unavailable"}{endOf(row) !== dateOf(row) ? ` → ${endOf(row)}` : ""}</Typography></Box><Chip size="small" label={statusOf(row)} color={isPending(statusOf(row)) ? "warning" : "default"} /><ApplicationActions row={row} saving={saving} onMutation={requestMutation} onTrainingReview={record => demo ? setDemoWorkspace(destinations.Training) : setTrainingReview(record.id)} /><Button size="small" onClick={() => navigate(destinations[row.kind])} endIcon={<ArrowUpRight size={13} />} sx={{ textTransform: "none" }}>{"Open workspace"}</Button></Stack></Paper>)}</Stack>{!visibleRecords.length && <Empty loading={loading} text="No applications match this view." />}</DialogContent></Dialog>
  </Box>;
}

function Empty({ loading, text }) { return <Box sx={{ py: 3, color: "#96A0AA", textAlign: "center", fontSize: 11 }}>{loading ? <CircularProgress size={20} /> : text}</Box>; }

function ApplicationActions({ row, saving, onMutation, onTrainingReview }) {
  if (row.kind === "Training") return <Button size="small" onClick={() => onTrainingReview(row)}>Review / Manage training</Button>;
  if (row.kind !== "Leave") return null;
  const anchor = row.anchor || row;
  const groupRows = row.rows || [row];
  const canWithdraw = anchor.isOwner && anchor.finalStatus === "Applied" && (anchor.approvalMode === "Organization" ? (anchor.approvalChain || [])[0]?.status === "Pending" : anchor.sicApprovalStatus === "Pending");
  const cancelGroup = ({ leave, dates }) => onMutation("cancel-group", leave, dates);
  return <Stack direction="row" spacing={.6} flexWrap="wrap"><LeaveTracking leave={anchor} groupRows={groupRows} busy={saving} onCancel={leave => onMutation("cancel", leave)} onCancelGroup={cancelGroup} />{row.canCancel && <Button disabled={saving} size="small" color="warning" onClick={() => groupRows.length > 1 ? cancelGroup({ leave: anchor, dates: groupRows.filter(leave => leave.canCancel).map(leave => leave.date) }) : onMutation("cancel", anchor)}>{groupRows.length > 1 ? "Cancel all" : "Cancel"}</Button>}{canWithdraw && <Button disabled={saving} size="small" color="warning" onClick={() => onMutation("withdraw", anchor)}>{groupRows.length > 1 ? "Withdraw first date" : "Withdraw"}</Button>}</Stack>;
}

function RosterGroup({ group, dates, onOpen }) {
  return <><tr><Box component="td" colSpan={10} sx={{ bgcolor: "#F5F8FA", textAlign: "left !important", pl: "18px !important", color: "#71818D", fontSize: 9, fontWeight: 850 }}>{group.groupName || "Group"}<Box component="span" sx={{ ml: 1, color: "#A4ADB7", fontWeight: 500 }}>{group.employees?.length || 0} personnel</Box></Box></tr>{(group.employees || []).map(person => <tr key={person.employeeId}><Box component="td" sx={{ position: "sticky", left: 0, zIndex: 1, bgcolor: "#FFF", textAlign: "left !important", pl: "18px !important", fontSize: 10, fontWeight: 700, whiteSpace: "nowrap" }}><Tooltip title={`${person.name || person.employeeId} · ${person.employeeId}`}><Button onClick={onOpen} sx={{ p: 0, minWidth: 0, color: "#465663", textTransform: "none", fontSize: "inherit" }}>{compactName(person.name || person.employeeId)}{person.IsSIC && <Box component="span" sx={{ ml: .6, fontSize: 7, color: "#148673" }}>SIC</Box>}</Button></Tooltip></Box>{dates.map(date => {
    const duty = person.duties?.[date] || {}, pending = isPending(duty.leaveStatus) || isPending(duty.trainingStatus) || isPending(duty.sportsStatus);
    const code = duty.leaveStatus && !/rejected|cancelled|withdrawn/i.test(duty.leaveStatus) ? "L" : duty.trainingName ? "T" : duty.sportsName ? "S" : shortShift(duty.shift);
    const tone = pending ? { color: "#B78119", bg: "#FFF1D2" } : shifts[code] || { color: code === "L" ? "#CF6A78" : code === "T" ? "#8B5CF6" : "#16A677", bg: code === "L" ? "#FDEEF0" : code === "T" ? "#F1EDFC" : "#EDF7F2" };
    return <td key={date}><Tooltip title={`${person.name || person.employeeId} · ${date} · ${duty.leaveType || duty.trainingName || duty.sportsName || duty.shift || "No duty"}${pending ? " · Pending" : ""}${duty.replacementEmployee?.name ? ` · Cover: ${duty.replacementEmployee.name}` : ""}`}><Button aria-label={`${person.name || person.employeeId}, ${date}, ${code}`} onClick={onOpen} sx={{ minWidth: 26, p: .35, height: 25, fontSize: 9, fontWeight: 800, color: tone.color, bgcolor: tone.bg, borderRadius: "7px" }}>{code}{duty.additionalDuties?.length ? "+" : ""}</Button></Tooltip></td>;
  })}</tr>)}</>;
}
