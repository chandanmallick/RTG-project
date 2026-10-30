import { useCallback, useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { Alert, Avatar, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Paper, Stack, Tab, Tabs, TextField, MenuItem, Tooltip, Typography } from "@mui/material";
import { ArrowUpRight, ArrowLeftRight, CheckCheck, ChevronLeft, ChevronRight, ClipboardList, History, Plus, RefreshCw, Trophy, User, CalendarDays, Settings2, ShieldCheck, Presentation, Users, Sparkles, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import api from "./api";
import crewApi from "../services/crewApi";
import CrewCalendar from "../pages/crew/CrewCalendar";
import ReplacementManagement from "./ReplacementManagement";
import { useAuth } from "../auth/AuthContext";
import upcomingShiftPeople from "../components/crew/upcomingShiftPeople";
import LeaveProgress from "../components/crew/LeaveProgress";
import LeaveTracking from "../components/crew/LeaveTracking";
import { createDashDemo, demoEmployeeId, demoEvents } from "./dashDemoData";
import DashDemoWorkspace from "./DashDemoWorkspace";
import groupLeaveApplications from "../components/crew/groupLeaveApplications";
import TrainingCalendarReview from "../components/crew/TrainingCalendarReview";

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
const destinations = { Leave: "/crew/leave?section=tracking", Training: "/crew/reports?tab=training-history", Sports: "/crew/sports?section=approval", Exchange: "/crew/replacement?section=duty&focus=history", Replacement: "/crew/replacement?tab=duty" };
const approvalOptions = [
  { title: "Leave approval", path: "/crew/leave?section=pending", subtitle: "Process pending leave applications", key: "leaveApproval" },
  { title: "Approval for Exchange request by shift", path: "/crew/replacement?section=duty&focus=approvals", subtitle: "Review and approve pending mutual duty exchanges", key: "exchangeApproval" },
  { title: "Replacement approval", path: "/crew/replacement?tab=duty", subtitle: "Review pending duty replacement assignments", key: "leaveReplacement" },
  { title: "Training Assignment", path: "/crew/training?section=assign", subtitle: "Nominate & assign employee training", key: "trainingAssignment" },
  { title: "Training approval", path: "/crew/training?section=pending", subtitle: "Review training approvals", key: "trainingApproval" },
  { title: "Sports approval", path: "/crew/sports?section=approval", subtitle: "Review sports participation requests", key: "sportsApproval" },
];

const adminModuleOptions = [
  { title: "Duty Roster", note: "Prepare, publish and review shift rosters", path: "/crew/roster", key: "crew_roster", icon: CalendarDays, badge: "Master" },
  { title: "Organizational Master", note: "Department, section & reporting hierarchy", path: "/crew/organization-master", key: "crew_admin", icon: ShieldCheck, badge: "Hierarchy" },
  { title: "Morning Presentation", note: "Daily shift handover & presentation roster", path: "/crew/morning-presentation", key: "crew_presentation", icon: Presentation, badge: "Daily" },
  { title: "Personnel", note: "Personnel database & replacement pool designation", path: "/crew/employees", key: "crew_employees", icon: Users, badge: "Personnel" },
  { title: "Dropdown Master", note: "Lookup values & master configurations", path: "/crew/dropdowns", key: "dropdown_master", icon: Settings2, badge: "Master" },
  { title: "Group Setup", note: "Groups, duty cycles & roster configurations", path: "/crew/setup", key: "crew_setup", icon: Settings2, badge: "Config" },
  { title: "System Audit Trail", note: "Audit logs of duty changes & administrative actions", path: "/admin/audit-trail", key: "audit_trail", icon: History, badge: "Audit" },
];

const replacementOptions = [
  { title: "Duty Assignment (Additional Manpower & Switching)", path: "/crew/replacement?tab=duty", badge: "Duty Workspace", subtitle: "Deploy extra manpower, switch shifts, or cover urgent slots" },
  { title: "Replacement Roster & Duty Matrix", path: "/crew/replacement?tab=roster", badge: "Sequential Roster", subtitle: "Sequential D-5 replacement matrix & roster review" },
  { title: "Interactive Duty Matrix (Drag & Drop Special Roster)", path: "/crew/replacement?tab=matrix", badge: "Drag & Drop", subtitle: "Visual shift grid calendar with drag & drop duty rearrangement" },
  { title: "Special Event Rostering & Coverage Tower", path: "/crew/special-events", badge: "Event Roster", subtitle: "Special event staffing, leave blocking & additional manpower" },
  { title: "Leave Duty Replacement", path: "/crew/replacement?tab=leave", badge: "Leave Cover", subtitle: "Process and assign duty coverage for approved leave applications" },
  { title: "Replacement & Exchange Approval", path: "/crew/replacement?section=duty&focus=approvals", badge: "Approvals", subtitle: "Review and approve pending mutual duty exchanges" },
];
const destinationLabels = { Leave: "Leave tracking", Training: "Training history", Sports: "Sports approval", Exchange: "Exchange history", Replacement: "Duty assignment" };
const popupPaper = { borderRadius: "28px", background: "#FFFCFC", backgroundImage: "none", boxShadow: "0 24px 90px #7D43552A", border: "1px solid #FFF", "& .MuiDialogTitle-root": { px: 3, py: 2.5, background: "linear-gradient(120deg,#FFF1E8,#FCE7EE)", fontWeight: 850 }, "& .MuiDialogContent-root": { p: 3 }, "& .MuiButton-root": { borderRadius: "14px" } };
const card = { p: 1.8, borderRadius: "20px", border: "1px solid #E8EDF1", boxShadow: "0 5px 22px #19314B05", background: "#FFF", backgroundImage: "none", minWidth: 0 };

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
  const [historyFrom, setHistoryFrom] = useState("");
  const [historyTo, setHistoryTo] = useState("");
  const [kind, setKind] = useState("All");
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState("mine");
  const [recordStatus, setRecordStatus] = useState("All");
  const [refreshKey, setRefreshKey] = useState(0);
  const [mutation, setMutation] = useState(null);
  const [saving, setSaving] = useState(false);
  const [mutationError, setMutationError] = useState("");
  const [trainingReview, setTrainingReview] = useState("");

  // Duty Notifications & Approvals State
  const [dutyNotifs, setDutyNotifs] = useState([]);
  const [dutyNotifsLoading, setDutyNotifsLoading] = useState(false);
  const [dutyFullListOpen, setDutyFullListOpen] = useState(false);
  const [denyDialogOpen, setDenyDialogOpen] = useState(false);
  const [selectedNotifForDeny, setSelectedNotifForDeny] = useState(null);
  const [denyReason, setDenyReason] = useState("");
  const [denySubmitting, setDenySubmitting] = useState(false);
  const [actionFeedback, setActionFeedback] = useState(null);

  // Admin Modules Dialog & Denial Activation Process State
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [activationProcessMode, setActivationProcessMode] = useState("manual");
  const [reallocatingId, setReallocatingId] = useState("");

  const isDenialActive = useCallback((n) => {
    if (!n) return false;
    const isDenied = Boolean(n.isDenied || n.status === "Denied");
    if (!isDenied) return false;
    // If date has elapsed (prior to today), do not display denial on dashboard for blinking
    if (n.date && dayjs(n.date).isBefore(dayjs(today), "day")) {
      return false;
    }
    return true;
  }, [today]);

  const loadActivationProcessMode = useCallback(async () => {
    try {
      const { data } = await api.get("/replacement/denial-activation-process");
      if (data?.mode) setActivationProcessMode(data.mode);
    } catch {
      setActivationProcessMode("manual");
    }
  }, []);

  const handleToggleActivationProcess = async (newMode) => {
    try {
      await api.put("/replacement/denial-activation-process", { mode: newMode });
      setActivationProcessMode(newMode);
      setActionFeedback({
        severity: "success",
        text: `Activation process updated to ${newMode === "auto_sequential" ? "Auto Sequential (Cron)" : "Manual Sequential"}.`,
      });
    } catch (err) {
      setActionFeedback({ severity: "error", text: err.response?.data?.detail || "Failed to update activation mode." });
    }
  };

  const handleAutoReallocate = async (notifId) => {
    setReallocatingId(notifId);
    try {
      const res = await api.post(`/replacement/reallocate-denied/${notifId}`, { mode: "auto" });
      setActionFeedback({
        severity: "success",
        text: res.data?.detail || "Duty reallocated to next candidate in sequential roster pool!",
      });
      loadDutyNotifs();
      refresh();
    } catch (err) {
      setActionFeedback({
        severity: "error",
        text: err.response?.data?.detail || "Sequential reallocation failed.",
      });
    } finally {
      setReallocatingId("");
    }
  };

  const loadDutyNotifs = useCallback(async () => {
    try {
      setDutyNotifsLoading(true);
      const { data } = await api.get("/replacement/notifications");
      setDutyNotifs(Array.isArray(data) ? data : []);
    } catch {
      setDutyNotifs([]);
    } finally {
      setDutyNotifsLoading(false);
    }
  }, []);

  const handleAcceptDuty = async (notifId) => {
    try {
      await api.put(`/replacement/notifications/accept/${notifId}`);
      setActionFeedback({ severity: "success", text: "Replacement duty accepted successfully!" });
      loadDutyNotifs();
      refresh();
    } catch (err) {
      setActionFeedback({ severity: "error", text: err.response?.data?.detail || "Failed to accept duty." });
    }
  };

  const handleOpenDenyDialog = (notif) => {
    setSelectedNotifForDeny(notif);
    setDenyReason("");
    setDenyDialogOpen(true);
  };

  const handleConfirmDeny = async () => {
    if (!selectedNotifForDeny || !denyReason.trim()) return;
    setDenySubmitting(true);
    try {
      await api.put(`/replacement/notifications/deny/${selectedNotifForDeny._id}`, {
        reason: denyReason.trim(),
      });
      setActionFeedback({ severity: "info", text: "Replacement duty denied. Admin notified via mail." });
      setDenyDialogOpen(false);
      setSelectedNotifForDeny(null);
      loadDutyNotifs();
      refresh();
    } catch (err) {
      setActionFeedback({ severity: "error", text: err.response?.data?.detail || "Failed to deny duty." });
    } finally {
      setDenySubmitting(false);
    }
  };

  const handleRevertAssignment = async (notif) => {
    if (!notif?.leaveId) return;
    const confirmMsg = `Revert replacement assignment for ${notif.employeeName || notif.employeeId} on ${dayjs(notif.date).format("DD-MMM-YYYY")} (${notif.assignedDuty})?\n\nThis restores the slot to open/unassigned so you can test sequential or manual allocation again.`;
    if (!window.confirm(confirmMsg)) return;
    try {
      await api.delete(`/replacement/assign/${notif.leaveId}`, {
        data: { reason: "Reverted by reporting officer / admin for re-testing" }
      });
      setActionFeedback({
        severity: "success",
        text: `Replacement assignment for ${notif.employeeName || notif.employeeId} successfully reverted! Slot is now open for test.`,
      });
      loadDutyNotifs();
      refresh();
    } catch (err) {
      setActionFeedback({
        severity: "error",
        text: err.response?.data?.detail || "Failed to revert replacement assignment.",
      });
    }
  };

  const refresh = useCallback(() => {
    setRefreshKey(value => value + 1);
    loadDutyNotifs();
  }, [loadDutyNotifs]);

  useEffect(() => {
    loadDutyNotifs();
    loadActivationProcessMode();
  }, [loadDutyNotifs, loadActivationProcessMode]);

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
        ["Leave", "/leave/list", { completedFrom: dayjs(today).subtract(90, "day").format("YYYY-MM-DD") }],
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
  const approvalKeys = ["leaveApproval", "trainingApproval", "sportsApproval", "exchangeApproval", "specialEventRoster"];
  const isAdmin = String(user?.role || "").toLowerCase() === "admin" || user?.isAdmin === true || String(user?.employeeId || "") === "50041";
  const approvalAccess = isAdmin || approvalKeys.slice(0, 3).some(key => actions[key]?.enabled) || actions.specialEventRoster?.enabled || actions.trainingAssignment?.enabled || actions.delegate?.enabled;
  const pendingApprovals = approvalKeys.reduce((sum, key) => sum + Number(actions[key]?.pending || 0), 0);
  const clubRecords = rows => [...groupLeaveApplications(rows.filter(row => row.kind === "Leave")).map(application => ({ ...application.anchor, ...application, kind: "Leave" })), ...rows.filter(row => row.kind !== "Leave")];
  const pendingMine = clubRecords(records.filter(row => owns(row) && isPending(statusOf(row)) && endOf(row) >= dayjs(today).subtract(2, "day").format("YYYY-MM-DD"))).length;
  const visibleRecords = clubRecords(records.filter(row => (kind === "All" || row.kind === kind) && (recordStatus === "All" || (recordStatus === "Pending" ? isPending(statusOf(row)) : statusOf(row) === recordStatus)) && (scope === "all" || owns(row)) && (popup !== "tracking" || endOf(row) >= dayjs(today).subtract(2, "day").format("YYYY-MM-DD")) && `${row.employeeName || row.name || ""} ${row.kind} ${row.trainingName || row.sportsName || row.eventName || row.leaveType || ""} ${dateOf(row)} ${statusOf(row)}`.toLowerCase().includes(search.toLowerCase()))).filter(row => popup !== "history" || ((!historyFrom || endOf(row) >= historyFrom) && (!historyTo || dateOf(row) <= historyTo))).sort((a, b) => dateOf(b).localeCompare(dateOf(a)));
  const openRecords = type => { setKind("All"); setSearch(""); setScope("mine"); setRecordStatus("All"); setPopup(type); };
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
    { number: 2, title: "Approval", subtitle: "(for Reporting officer only)", icon: CheckCheck, color: "#BA841B", bg: "#FFF5DC", disabled: !approvalAccess && (loading || errors.includes("Approval access")), click: () => approvalAccess ? setPopup("approval") : !loading && setPopup("restricted"), count: approvalAccess ? pendingApprovals : 0, foot: approvalAccess ? "Awaiting your decision" : loading ? "Checking approval access..." : errors.includes("Approval access") ? "Approval access unavailable" : "Access Restricted" },
    { number: 3, title: "Tracking", subtitle: "(for all application)", icon: ClipboardList, color: "#7760CD", bg: "#F0EBFC", click: () => openRecords("tracking"), count: pendingMine, foot: "Your pending applications" },
    { number: 4, title: "History", subtitle: "(for all application)", icon: History, color: "#B46D83", bg: "#FAEDF2", click: () => openRecords("history"), foot: "Records & cancellation" },
    { number: 11, title: "Report", subtitle: "Employee & period analysis", icon: ClipboardList, color: "#426B8D", bg: "#EAF3F8", click: () => navigate("/crew/reports"), foot: "Open crew reports" },
    { number: 5, title: "Admin", subtitle: "(Master & System Settings)", icon: Settings2, color: "#3B4263", bg: "#ECEEF5", click: () => setAdminModalOpen(true), foot: "Admin modules & controls" },
  ];

  return <Box sx={{ p: { xs: 1.5, md: 3 }, background: "#F5F7F9", minHeight: "100%", color: "#233442" }}>
    {demo && <Alert severity="info" sx={{ mb: 2 }}>Interactive sample preview · No login or database needed. All names, duties and counts are sample data.</Alert>}
    {errors.length > 0 && <Alert severity="warning" sx={{ mb: 2 }} action={<Button onClick={refresh}>Retry</Button>}>Could not load: {errors.join(", ")}. Other available sections remain usable.</Alert>}
    {dutyNotifs.some(n => n.canAccept || n.canDeny) && (
      <Paper
        elevation={0}
        sx={{
          p: 1.5,
          mb: 2,
          borderRadius: 3,
          bgcolor: "#FFFBEB",
          border: "1px solid #FCD34D",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 2,
          flexWrap: "wrap",
          boxShadow: "0 4px 12px rgba(245, 158, 11, 0.12)",
        }}
      >
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <Box sx={{ width: 38, height: 38, borderRadius: "50%", bgcolor: "#FEF3C7", color: "#B45309", display: "grid", placeItems: "center", border: "1px solid #FCD34D" }}>
            <ArrowLeftRight size={20} />
          </Box>
          <Box>
            <Typography fontSize={13.5} fontWeight={900} color="#92400E">
              Duty Replacement Pending Your Review
            </Typography>
            <Typography fontSize={11.5} color="#78350F">
              {dutyNotifs.filter(n => n.canAccept || n.canDeny).map(n => `${n.employeeName} (${dayjs(n.date).format("DD-MMM")} · ${n.assignedDuty})`).join(", ")}
            </Typography>
          </Box>
        </Stack>
        <Stack direction="row" spacing={1}>
          <Button
            size="small"
            variant="contained"
            onClick={() => setDutyFullListOpen(true)}
            sx={{
              bgcolor: "#D97706",
              "&:hover": { bgcolor: "#B45309" },
              textTransform: "none",
              fontWeight: 900,
              fontSize: 12,
              borderRadius: 2,
              px: 1.8,
            }}
          >
            Review & Decide (Accept / Deny) ↗
          </Button>
        </Stack>
      </Paper>
    )}
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", xl: "minmax(0,1fr) 360px" }, gap: 2.2, alignItems: "start" }}>
      <Box sx={{ minWidth: 0 }}>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2,minmax(0,1fr))", md: "repeat(6,minmax(0,1fr))" }, gap: 1, mb: 1.8 }}>
          {quickActions.map(item => <Button key={item.number} onClick={item.click} disabled={item.disabled} sx={{ display: "flex", flexDirection: "column", alignItems: "stretch", textAlign: "left", textTransform: "none", p: 1.2, minHeight: 120, borderRadius: "20px", color: item.color, bgcolor: item.bg, border: `1px solid ${item.color}16`, transition: "transform .18s,box-shadow .18s", "&:hover": { bgcolor: item.bg, transform: "translateY(-3px)", boxShadow: `0 8px 20px ${item.color}15` } }}><Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}><item.icon size={19} strokeWidth={1.7} /><Typography sx={{ fontSize: 10, opacity: .65 }}>{String(item.number).padStart(2, "0")}</Typography></Box><Typography sx={{ fontSize: 15, fontWeight: 850, color: "#263746" }}>{item.title}</Typography><Typography sx={{ fontSize: 9, lineHeight: 1.5, minHeight: 27, mt: .3, color: "#71808E" }}>{item.subtitle}</Typography><Box sx={{ display: "flex", alignItems: "center", gap: .5, mt: 1.2 }}><Typography sx={{ fontSize: 9, flex: 1 }}>{item.foot}</Typography>{item.count > 0 || item.number === 2 && approvalAccess ? <Chip size="small" label={item.count} sx={{ bgcolor: "#FFF", color: item.color, fontWeight: 950, fontSize: item.number === 2 ? 20 : 13, height: item.number === 2 ? 34 : 24, minWidth: item.number === 2 ? 42 : 24 }} /> : <ArrowUpRight size={13} />}</Box></Button>)}
        </Box>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "minmax(0,1.65fr) minmax(280px,1fr)" }, gap: 2.2, alignItems: "start" }}>
          <Stack spacing={2.2}>
            <Paper sx={{ ...card, p: 0, overflow: "hidden" }}>
              <Box sx={{ px: 2.3, pt: 2.3 }}><Heading number={7} title="Roster Calendar" note="Yesterday through the next 7 days" action={<IconButton aria-label="Open full roster calendar" onClick={() => navigate("/crew/calendar")}><ArrowUpRight size={17} /></IconButton>} /></Box>
              <Box sx={{ overflow: "auto", maxHeight: 640 }}><Box component="table" data-crew-table-tools="off" sx={{ width: "100%", borderCollapse: "collapse", minWidth: 520, fontSize: 10, "& th,& td": { borderBottom: "1px solid #EFF2F5", p: .75, textAlign: "center" } }}>
                <thead><tr><Box component="th" sx={{ position: "sticky", top: 0, left: 0, zIndex: 3, bgcolor: "#FFF", width: 130, textAlign: "left !important", pl: "18px !important" }}>Personnel</Box>{dates.map(date => <Box component="th" key={date} sx={{ position: "sticky", top: 0, zIndex: 2, bgcolor: date === today ? "#EAF6F0" : "#FFF", color: date === today ? "#11806A" : "#788594", fontWeight: 600 }}><Typography sx={{ fontSize: 8.5 }}>{date === today ? "Today" : dayjs(date).format("ddd")}</Typography><Typography sx={{ fontSize: 12, fontWeight: 850 }}>{dayjs(date).format("DD")}</Typography></Box>)}</tr></thead>
                <tbody>{groups.map(group => <RosterGroup key={group.groupId || group.groupName} group={group} dates={dates} onOpen={() => navigate("/crew/calendar")} />)}</tbody>
              </Box></Box>
              {!groups.length && <Box sx={{ p: 5, textAlign: "center", color: "#83909E" }}>{loading ? <CircularProgress size={22} /> : "No roster available for this period."}</Box>}
              <Stack direction="row" spacing={1.2} sx={{ p: 1.7, borderTop: "1px solid #EDF1F4" }} flexWrap="wrap">{Object.entries(shifts).map(([key, tone]) => <Typography key={key} sx={{ fontSize: 9, color: tone.color }}>{key} · {tone.name}</Typography>)}<Typography sx={{ fontSize: 9, color: "#B7791D" }}>Amber · Pending</Typography></Stack>
            </Paper>

            {/* Duty Assignments & Approvals (Landscape, just below Roster Calendar - Image 2) */}
            <Paper
              onClick={() => setDutyFullListOpen(true)}
              sx={{
                ...card,
                p: 1.8,
                borderRadius: "20px",
                cursor: "pointer",
                transition: "all .18s ease",
                "&:hover": { transform: "translateY(-2px)", boxShadow: "0 8px 24px rgba(0,0,0,0.08)" },
                ...(dutyNotifs.some(isDenialActive) ? {
                  border: "2px solid #DC2626",
                  bgcolor: "#FEF2F2",
                  animation: "adminDenialBlink 1.4s ease-in-out infinite",
                  "@keyframes adminDenialBlink": {
                    "0%, 100%": {
                      opacity: 1,
                      borderColor: "#DC2626",
                      boxShadow: "0 0 16px rgba(220, 38, 38, 0.75)",
                      backgroundColor: "#FEF2F2",
                    },
                    "50%": {
                      opacity: 0.35,
                      borderColor: "#EF4444",
                      boxShadow: "0 0 4px rgba(220, 38, 38, 0.2)",
                      backgroundColor: "#FFF",
                    },
                  },
                  "@media (prefers-reduced-motion: reduce)": {
                    animation: "none",
                  },
                } : {
                  bgcolor: "#FFFFFF",
                }),
              }}
            >
              {dutyNotifs.some(isDenialActive) ? (
                // DENIAL DISPLAYED FULL (LANDSCAPE)
                <Box>
                  {dutyNotifs.filter(isDenialActive).map(n => (
                    <Box key={`denied-bar-${n._id}`}>
                      <Stack direction={{ xs: "column", sm: "row" }} alignItems={{ sm: "center" }} justifyContent="space-between" spacing={1} sx={{ mb: 1 }}>
                        <Stack direction="row" alignItems="center" spacing={1}>
                          <Chip
                            size="small"
                            label="⚠️ DUTY DENIED"
                            sx={{
                              height: 22,
                              fontSize: "0.7rem",
                              fontWeight: 950,
                              bgcolor: "#DC2626",
                              color: "#FFF",
                              letterSpacing: 0.5,
                            }}
                          />
                          <Typography fontSize={12} color="#991B1B" fontWeight={900}>
                            {dayjs(n.date).format("DD-MMM-YYYY")}
                          </Typography>
                        </Stack>
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={(e) => { e.stopPropagation(); setDutyFullListOpen(true); }}
                          sx={{
                            fontSize: 11,
                            fontWeight: 850,
                            textTransform: "none",
                            color: "#991B1B",
                            borderColor: "#FCA5A5",
                            bgcolor: "#FFF",
                            "&:hover": { bgcolor: "#FEE2E2" },
                          }}
                        >
                          View Full List (Pop-up) ↗
                        </Button>
                      </Stack>

                      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1.4fr 1fr 1.6fr" }, gap: 1.5, alignItems: "center", bgcolor: "rgba(255, 255, 255, 0.85)", p: 1.2, borderRadius: 2 }}>
                        <Box>
                          <Typography fontSize={13} fontWeight={900} color="#991B1B">
                            {n.assignedDuty} Shift — {n.employeeName}
                          </Typography>
                          <Typography fontSize={10.5} color="#7F1D1D" fontWeight={750}>
                            Emp ID: {n.employeeId}
                          </Typography>
                        </Box>
                        <Box>
                          <Typography fontSize={11} color="#7F1D1D">
                            <strong>Denied By:</strong> {n.deniedByRole || "Reporting/HOD Officer"}
                          </Typography>
                          <Typography fontSize={10} color="#991B1B">
                            ({n.deniedBy})
                          </Typography>
                        </Box>
                        <Box>
                          <Typography fontSize={11} color="#991B1B" sx={{ fontStyle: "italic", bgcolor: "#FEE2E2", p: 0.6, borderRadius: 1.5 }}>
                            <strong>Reason:</strong> {n.reason || "Unable to perform assigned duty"}
                          </Typography>
                        </Box>
                      </Box>

                      {/* Admin Allocation Options: Manual or Auto Sequential (Image 1) */}
                      <Stack direction={{ xs: "column", sm: "row" }} alignItems={{ sm: "center" }} justifyContent="space-between" spacing={1} sx={{ mt: 1.2, pt: 1, borderTop: "1px dashed #FECACA" }}>
                        <Stack direction="row" spacing={0.8} alignItems="center">
                          <Typography fontSize={11} fontWeight={850} color="#7F1D1D">
                            Activation Process:
                          </Typography>
                          <Chip
                            size="small"
                            label={activationProcessMode === "auto_sequential" ? "Auto Sequential (Cron Active)" : "Manual Sequential"}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleActivationProcess(activationProcessMode === "auto_sequential" ? "manual" : "auto_sequential");
                            }}
                            sx={{
                              height: 22,
                              fontSize: "0.68rem",
                              fontWeight: 900,
                              cursor: "pointer",
                              bgcolor: activationProcessMode === "auto_sequential" ? "#DCFCE7" : "#FEE2E2",
                              color: activationProcessMode === "auto_sequential" ? "#166534" : "#991B1B",
                              border: `1px solid ${activationProcessMode === "auto_sequential" ? "#86EFAC" : "#FCA5A5"}`,
                            }}
                          />
                        </Stack>

                        <Stack direction="row" spacing={1} alignItems="center">
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/crew/replacement?tab=duty&date=${n.date}&shift=${n.assignedDuty}`);
                            }}
                            sx={{
                              fontSize: 11,
                              fontWeight: 850,
                              textTransform: "none",
                              color: "#1E3A8A",
                              borderColor: "#93C5FD",
                              bgcolor: "#EFF6FF",
                              "&:hover": { bgcolor: "#DBEAFE" },
                            }}
                          >
                            Allocate Another Duty ↗
                          </Button>
                          <Button
                            size="small"
                            variant="contained"
                            disabled={reallocatingId === n._id}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAutoReallocate(n._id);
                            }}
                            sx={{
                              fontSize: 11,
                              fontWeight: 900,
                              textTransform: "none",
                              bgcolor: "#DC2626",
                              "&:hover": { bgcolor: "#B91C1C" },
                            }}
                          >
                            {reallocatingId === n._id ? "Allocating..." : "Auto Sequential Allocate ⚡"}
                          </Button>
                        </Stack>
                      </Stack>
                    </Box>
                  ))}
                </Box>
              ) : (
                // CLEAN LANDSCAPE BAR WHEN NO DENIALS
                <Stack direction={{ xs: "column", sm: "row" }} alignItems="center" justifyContent="space-between" spacing={1.5}>
                  <Stack direction="row" alignItems="center" spacing={1.2}>
                    <Box sx={{ width: 34, height: 34, borderRadius: "10px", bgcolor: "#EAF2FB", color: "#2563EB", display: "grid", placeItems: "center" }}>
                      <ArrowLeftRight size={18} />
                    </Box>
                    <Box>
                      <Typography fontSize={13} fontWeight={900} color="#1E293B">
                        Duty Assignments & Approvals
                      </Typography>
                      <Typography fontSize={10.5} color="#64748B">
                        Accept or deny replacement duties
                      </Typography>
                    </Box>
                  </Stack>

                  <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
                    <Chip
                      size="small"
                      label={`${dutyNotifs.filter(n => n.status === "Pending").length} Pending`}
                      sx={{
                        height: 22,
                        fontSize: "0.68rem",
                        fontWeight: 850,
                        bgcolor: dutyNotifs.some(n => n.status === "Pending") ? "#FEF3C7" : "#F1F5F9",
                        color: dutyNotifs.some(n => n.status === "Pending") ? "#92400E" : "#64748B",
                      }}
                    />
                    <Chip
                      size="small"
                      label={`${dutyNotifs.filter(n => n.status === "Accepted").length} Accepted`}
                      sx={{
                        height: 22,
                        fontSize: "0.68rem",
                        fontWeight: 850,
                        bgcolor: "#DCFCE7",
                        color: "#166534",
                      }}
                    />
                    {dutyNotifs.find(n => n.canAccept) && (
                      <Button
                        size="small"
                        variant="contained"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAcceptDuty(dutyNotifs.find(n => n.canAccept)._id);
                        }}
                        sx={{
                          py: 0.3,
                          px: 1.2,
                          fontSize: 10.5,
                          fontWeight: 900,
                          bgcolor: "#16A34A",
                          "&:hover": { bgcolor: "#15803D" },
                          textTransform: "none",
                        }}
                      >
                        Accept Duty
                      </Button>
                    )}
                    {dutyNotifs.find(n => n.canDeny) && (
                      <Button
                        size="small"
                        variant="outlined"
                        color="error"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenDenyDialog(dutyNotifs.find(n => n.canDeny));
                        }}
                        sx={{
                          py: 0.3,
                          px: 1.2,
                          fontSize: 10.5,
                          fontWeight: 900,
                          borderColor: "#DC2626",
                          color: "#DC2626",
                          "&:hover": { bgcolor: "#FEE2E2", borderColor: "#B91C1C" },
                          textTransform: "none",
                        }}
                      >
                        Deny Duty
                      </Button>
                    )}
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={(e) => { e.stopPropagation(); setDutyFullListOpen(true); }}
                      sx={{
                        py: 0.3,
                        px: 1.2,
                        fontSize: 11,
                        fontWeight: 850,
                        textTransform: "none",
                        borderColor: "#CBD5E1",
                        color: "#334155",
                        "&:hover": { bgcolor: "#F1F5F9" },
                      }}
                    >
                      View Full List ↗
                    </Button>
                  </Stack>
                </Stack>
              )}
            </Paper>
          </Stack>
          <Stack spacing={2.2}>
            <Paper sx={card}><Heading number={8} title="Leader Board" note="Replacement duties · last 60 days" /><Stack spacing={1.6}>{leaderboard.slice(0, 5).map((row, index) => <Box key={`${row.name}-${index}`}><Stack direction="row" spacing={1} alignItems="center"><Box sx={{ width: 26, height: 26, borderRadius: "9px", bgcolor: index === 0 ? "#FFF2D4" : "#F2F5F8", color: index === 0 ? "#B88624" : "#8C97A4", display: "grid", placeItems: "center", fontSize: 11 }}>{index === 0 ? <Trophy size={14} /> : String(index + 1).padStart(2, "0")}</Box><Typography noWrap sx={{ flex: 1, fontSize: 11, fontWeight: 750 }}>{row.name}</Typography><Typography sx={{ fontSize: 14, fontWeight: 850 }}>{row.value}</Typography></Stack><Box sx={{ mt: .8, ml: 4.3, height: 5, bgcolor: "#F1F4F6", borderRadius: 9 }}><Box sx={{ height: "100%", width: `${Number(row.value || 0) / maxReplacement * 100}%`, bgcolor: index === 0 ? "#0D9685" : "#B0DCD1", borderRadius: 9 }} /></Box></Box>)}</Stack>{!leaderboard.length && <Empty loading={loading} text="No replacement duties recorded." />}</Paper>
            <Paper sx={card}><Heading number={9} title="Stat of leave" note={dayjs(today).format("MMMM YYYY · Group wise")} /><Stack direction="row" spacing={1} alignItems="baseline" sx={{ mb: 2 }}><Typography sx={{ fontSize: 30, fontWeight: 850, letterSpacing: -1 }}>{totalLeaves}</Typography><Typography sx={{ color: "#929DA9", fontSize: 10 }}>leave days</Typography></Stack><Box sx={{ display: "flex", gap: 1.2, height: 160, alignItems: "end", overflowX: "auto" }}>{leaveStats.map((row, index) => <Tooltip key={`${row.group}-${index}`} title={`${row.group}: ${row.count} leave days`}><Box sx={{ minWidth: 38, flex: 1, height: "100%", display: "flex", flexDirection: "column", justifyContent: "end", alignItems: "center" }}><Typography sx={{ fontSize: 10, color: "#6F7C8A", mb: .5 }}>{row.count}</Typography><Box sx={{ width: "75%", maxWidth: 42, height: `${Number(row.count || 0) / maxLeave * 115}px`, bgcolor: ["#8EBCB0", "#A69BDE", "#E4C681", "#93BED8"][index % 4], borderRadius: "7px 7px 2px 2px" }} /><Typography noWrap sx={{ fontSize: 8.5, maxWidth: 55, mt: 1 }}>{row.group || "Group"}</Typography></Box></Tooltip>)}</Box>{!leaveStats.length && <Empty loading={loading} text="No leave data this month." />}</Paper>
          </Stack>
        </Box>
      </Box>
      <Stack spacing={2.2}>
        <Paper sx={card}><Heading number={6} title="Event Calendar" action={<IconButton aria-label="Open event calendar" onClick={() => navigate("/crew/calendar?view=events")}><ArrowUpRight size={16} /></IconButton>} /><Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.4 }}><IconButton size="small" aria-label="Previous month" onClick={() => setMonth(value => value.subtract(1, "month"))}><ChevronLeft size={16} /></IconButton><Typography sx={{ fontSize: 12, fontWeight: 800 }}>{month.format("MMMM YYYY")}</Typography><IconButton size="small" aria-label="Next month" onClick={() => setMonth(value => value.add(1, "month"))}><ChevronRight size={16} /></IconButton></Stack>{eventError && <Alert severity="warning" sx={{ fontSize: 10 }}>{eventError}</Alert>}<Box sx={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: .5, opacity: eventLoading ? .5 : 1 }}>{["M", "T", "W", "T", "F", "S", "S"].map((day, index) => <Typography key={index} sx={{ textAlign: "center", fontSize: 9, color: "#A0A9B3", mb: .6 }}>{day}</Typography>)}{monthCells.map(date => {
          const key = date.format("YYYY-MM-DD"), dayEvents = events.filter(event => event.startDate <= key && (event.endDate || event.startDate) >= key), inMonth = date.month() === month.month();
          return <Tooltip key={key} title={dayEvents.length ? <Box>{dayEvents.map((event, index) => <Typography key={index} sx={{ fontSize: 11 }}>{event.title} · {event.kind}{event.detail ? ` · ${event.detail}` : ""}</Typography>)}</Box> : date.format("DD-MMM-YYYY")}><Button onClick={() => navigate("/crew/calendar?view=events")} aria-label={`${date.format("DD-MMM-YYYY")}${dayEvents.length ? `, ${dayEvents.map(event => event.title).join(", ")}` : ""}`} sx={{ minWidth: 0, height: 31, p: 0, borderRadius: "10px", flexDirection: "column", fontSize: 11, color: key === today ? "#FFF" : dayEvents.length ? palette[dayEvents[0].kind] : "#536170", bgcolor: key === today ? "#188F7B" : dayEvents.length ? `${palette[dayEvents[0].kind] || "#8B5CF6"}12` : "transparent", opacity: inMonth ? 1 : .28, "&:hover": { bgcolor: "#DDEFE8", color: "#233442" } }}>{date.date()}<Box sx={{ display: "flex", gap: "2px" }}>{[...new Set(dayEvents.map(event => event.kind))].map(type => <Box key={type} sx={{ width: 3, height: 3, borderRadius: "50%", bgcolor: palette[type] }} />)}</Box></Button></Tooltip>;
        })}</Box><Stack direction="row" spacing={1.4} sx={{ mt: 2 }}>{Object.entries(palette).map(([label, color]) => <Stack key={label} direction="row" alignItems="center" spacing={.5}><Box sx={{ width: 5, height: 5, bgcolor: color, borderRadius: "50%" }} /><Typography sx={{ fontSize: 8.5, color: "#87929F", textTransform: "capitalize" }}>{label}</Typography></Stack>)}</Stack>{actions.specialEventRoster?.enabled && <Button fullWidth size="small" onClick={() => demo ? setDemoWorkspace("special-event") : navigate("/crew/special-events")} sx={{ mt: 1.5, textTransform: "none" }}>Special Event roster</Button>}</Paper>

        <Paper sx={card}><Heading number={10} title="Upcoming shift" note="From tomorrow · next 5 days" /><Box sx={{ maxHeight: 560, overflowY: "auto", pr: .5 }}>{Array.from({ length: 5 }, (_, i) => dayjs(today).add(i + 1, "day").format("YYYY-MM-DD")).map(date => <Box key={date} sx={{ mb: 2.2 }}><Typography sx={{ fontSize: 14, fontWeight: 800, color: "#536170", mb: 1.5 }}>{dayjs(date).format("ddd, DD MMM")}</Typography>{["M", "E", "N"].map(code => {
          const people = upcomingShiftPeople(groups, date, code, shortShift);
          const shiftLeaders = people.filter(person => person.IsSIC);
          const crewMembers = people.filter(person => !shiftLeaders.includes(person));
          const vacancies = groups.flatMap(group => (group.employees || []).filter(person => { const duty = person.duties?.[date] || {}; return shortShift(duty.originalShift || duty.shift) === code && duty.replacementRequired && !duty.replacementEmployee?.employeeId && !duty.replacementEmployee?.name; }));
          return <Box key={code} sx={{ display: "flex", alignItems: "start", gap: 1.5, mb: 1.5, p: 1.3, bgcolor: shifts[code].bg, borderRadius: 3 }}><Box sx={{ width: 42, height: 48, flexShrink: 0, borderRadius: "10px", bgcolor: shifts[code].bg, color: shifts[code].color, display: "grid", placeItems: "center", fontWeight: 850, fontSize: 20 }}>{code}</Box><Box sx={{ borderLeft: `2px solid ${shifts[code].color}70`, pl: 1, minWidth: 0 }}><Typography sx={{ fontSize: 15, fontWeight: 800 }}>{shiftLeaders.length ? shiftLeaders.map(person => person.name || person.employeeId).join(" / ") : loading ? "Loading..." : <Button onClick={() => demo ? setDemoWorkspace("/crew/setup") : navigate("/crew/setup")} sx={{ p: 0, minWidth: 0, fontSize: 15, fontWeight: 850, color: shifts[code].color, textTransform: "none" }}>Assign SIC</Button>}<Box component="span" sx={{ ml: .6, color: "#9AA4AE", fontSize: 12, fontWeight: 650 }}>{people.length}</Box></Typography>{vacancies.length > 0 && <Button aria-label={`Replacement required: ${vacancies.length}, ${date}, ${shifts[code].name}`} onClick={() => navigate("/crew/calendar?filter=coverage")} sx={{ display: "block", mt: .7, p: .6, fontSize: 12, fontWeight: 950, textTransform: "none", color: "#B42318", bgcolor: "#FFE4DE", animation: "replacementBlink 1.8s ease-in-out infinite", "@keyframes replacementBlink": { "0%,100%": { opacity: 1 }, "50%": { opacity: .45 } }, "@media (prefers-reduced-motion: reduce)": { animation: "none" } }}>Replacement required: {vacancies.length}<Typography sx={{ fontSize: 10 }}>{vacancies.map(person => compactName(person.name || person.employeeId)).join(", ")}</Typography></Button>}<Typography sx={{ fontSize: 13, lineHeight: 1.7, color: "#465663", mt: .3 }}>{crewMembers.length ? crewMembers.map((person, index) => <Box component="span" key={person.employeeId || person.name}>{index > 0 && " / "}<Tooltip title={person.isReplacement ? `Replacement for ${person.replacementFor?.name || person.replacementFor?.employeeId || "duty coverage"}` : person.name || person.employeeId}><Box component="span" sx={person.isReplacement ? { color: "#7252BD", fontWeight: 850 } : {}}>{compactName(person.name || person.employeeId)}{person.isReplacement && " (Replacement)"}</Box></Tooltip></Box>) : loading ? "Loading..." : people.length ? "SIC on duty" : "No personnel scheduled"}</Typography></Box></Box>;
        })}</Box>)}</Box></Paper>
      </Stack>
    </Box>
    <Dialog PaperProps={{ sx: popupPaper }} open={Boolean(mutation)} onClose={() => !saving && setMutation(null)}><DialogTitle>{mutation?.action === "withdraw" ? "Withdraw application?" : "Cancel leave?"}</DialogTitle><DialogContent><Typography sx={{ mb: 2 }}>{mutation?.row.name || mutation?.row.employeeName} · {mutation?.row.date}{mutation?.dates.length > 0 ? ` · ${mutation.dates.length} date(s): ${mutation.dates.join(", ")}` : ""}</Typography>{mutationError && <Alert severity="error" sx={{ mb: 2 }}>{mutationError}</Alert>}<Stack direction="row" spacing={1}><Button disabled={saving} onClick={() => setMutation(null)}>Keep application</Button><Button disabled={saving} color="warning" variant="contained" onClick={performMutation}>{saving ? "Saving…" : "Confirm"}</Button></Stack></DialogContent></Dialog>
    <Dialog PaperProps={{ sx: popupPaper }} open={demo && (Boolean(demoWorkspace) || popup === "apply")} onClose={() => { setDemoWorkspace(""); if (popup === "apply") setPopup(""); }} fullWidth maxWidth="md"><DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>{demoWorkspace ? demoWorkspace.includes("operations") ? "Approval preview" : demoWorkspace.includes("view=events") ? "Event calendar preview" : "Crew workspace preview" : popup === "apply" ? "New crew application" : "Replacement"}<IconButton aria-label="Close sample workspace" onClick={() => { setDemoWorkspace(""); if (popup === "apply") setPopup(""); }}><X size={18} /></IconButton></DialogTitle><DialogContent dividers>{demo && (demoWorkspace || popup === "apply") && <DashDemoWorkspace key={demoWorkspace || popup} workspace={demoWorkspace || popup} groups={groups} records={records} events={events} onSubmit={row => setRecords(rows => [{ ...row, id: `demo-${Date.now()}`, employeeId: demoEmployeeId, employeeName: "Anil Sharma", status: "Pending", ...(row.kind === "Leave" ? { finalStatus: "Applied", sicApprovalStatus: "Pending", isOwner: true, canCancel: true } : {}) }, ...rows])} />}</DialogContent></Dialog>
    <Dialog PaperProps={{ sx: popupPaper }} open={!demo && Boolean(trainingReview)} onClose={() => setTrainingReview("")} fullWidth maxWidth="md"><DialogTitle sx={{ display: "flex", justifyContent: "space-between" }}>Training details & management<IconButton aria-label="Close training review" onClick={() => setTrainingReview("")}><X size={18} /></IconButton></DialogTitle><DialogContent dividers>{!demo && trainingReview && <TrainingCalendarReview requestId={trainingReview} onChanged={refresh} onReplacement={() => navigate("/crew/calendar?filter=coverage")} />}</DialogContent></Dialog>
    {!demo && popup === "apply" && <CrewCalendar applicationOnly onApplicationClose={() => { setPopup(""); refresh(); }} />}
    <Dialog PaperProps={{ sx: popupPaper }} open={popup === "replacement"} onClose={() => setPopup("")} fullWidth maxWidth="lg"><DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>Replacement<IconButton aria-label="Close replacement" onClick={() => setPopup("")}><X size={18} /></IconButton></DialogTitle><DialogContent dividers><Tabs aria-label="Replacement options" value={replacementTab} onChange={(_, value) => setReplacementTab(value)} variant="scrollable" scrollButtons="auto" sx={{ mb: 2 }}><Tab value="roster" label="Sequential Roster & Matrix" /><Tab value="duty" label="Exchange" /><Tab value="leave" label="Replacement by other employees" /></Tabs>{popup === "replacement" && (demo ? <DashDemoWorkspace key={replacementTab} workspace={replacementTab === "duty" ? "apply-exchange" : "replacement"} groups={groups} records={records} events={events} onSubmit={row => setRecords(rows => [{ ...row, id: `demo-${Date.now()}`, employeeId: demoEmployeeId, employeeName: "Anil Sharma", status: "Pending" }, ...rows])} /> : <ReplacementManagement key={replacementTab} initialWorkflow={replacementTab} />)}</DialogContent></Dialog>
    <Dialog PaperProps={{ sx: popupPaper }} open={popup === "approval"} onClose={() => setPopup("")} fullWidth maxWidth="sm"><DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>Approval options<IconButton aria-label="Close approval options" onClick={() => setPopup("")}><X size={18} /></IconButton></DialogTitle><DialogContent dividers><Box sx={{ textAlign: "center", mb: 3 }}><Box sx={{ width: 78, height: 78, mx: "auto", mb: 1.8, borderRadius: "50%", bgcolor: "#FFF2A1", color: "#F63B78", border: "4px solid #FF5D89", display: "grid", placeItems: "center", boxShadow: "0 0 0 10px #FFF7D8" }}><CheckCheck size={40} /></Box><Typography sx={{ fontSize: 23, fontWeight: 850 }}>Ready for your review</Typography><Typography sx={{ color: "#7F7881", mt: .7 }}>Choose the approval or assignment you want to manage.</Typography></Box><Stack spacing={1.3}>
          {approvalOptions.map(option => {
            const count = Number(actions[option.key]?.pending || 0);
            return (
              <Button
                key={option.path}
                variant="outlined"
                endIcon={<ArrowUpRight size={18} />}
                onClick={() => {
                  setPopup("");
                  if (option.key === "leaveReplacement") {
                    setDutyFullListOpen(true);
                  } else {
                    navigate(option.path);
                  }
                }}
                sx={{
                  justifyContent: "space-between",
                  textTransform: "none",
                  fontSize: 15,
                  p: 1.8,
                  color: "#A82B58",
                  borderColor: count > 0 ? "#FF5D89" : "#F5C9D6",
                  bgcolor: count > 0 ? "#FFF0F4" : "#FFF4F7",
                  "&:hover": { bgcolor: "#FFE6EE", borderColor: "#F63B78" }
                }}
              >
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Typography sx={{ fontSize: 15, fontWeight: count > 0 ? 850 : 700 }}>
                    {option.title}
                  </Typography>
                  <Typography
                    component="span"
                    sx={{
                      fontSize: 14,
                      fontWeight: 900,
                      color: count > 0 ? "#DC2626" : "#64748B",
                    }}
                  >
                    ({count})
                  </Typography>
                </Box>
              </Button>
            );
          })}
        </Stack></DialogContent></Dialog>
    <Dialog PaperProps={{ sx: { ...popupPaper, "& .MuiDialogTitle-root": { px: 3, py: 2.5, background: "linear-gradient(120deg,#EBF5FB,#EFF6FF)", fontWeight: 850 } } }} open={popup === "replacement-options"} onClose={() => setPopup("")} fullWidth maxWidth="sm"><DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>Replacement & Rostering<IconButton aria-label="Close replacement options" onClick={() => setPopup("")}><X size={18} /></IconButton></DialogTitle><DialogContent dividers><Box sx={{ textAlign: "center", mb: 3 }}><Box sx={{ width: 78, height: 78, mx: "auto", mb: 1.8, borderRadius: "50%", bgcolor: "#E0F2FE", color: "#0284C7", border: "4px solid #38BDF8", display: "grid", placeItems: "center", boxShadow: "0 0 0 10px #F0F9FF" }}><ArrowLeftRight size={38} /></Box><Typography sx={{ fontSize: 23, fontWeight: 850, color: "#0F172A" }}>Replacement & Rostering</Typography><Typography sx={{ color: "#64748B", mt: .7 }}>Choose the duty replacement, exchange, or special event rostering module.</Typography></Box><Stack spacing={1.3}>{replacementOptions.map(option => <Button key={option.path} variant="outlined" endIcon={<ArrowUpRight size={18} />} onClick={() => { setPopup(""); navigate(option.path); }} sx={{ justifyContent: "space-between", textTransform: "none", textAlign: "left", p: 1.8, borderRadius: "16px !important", color: "#0369A1", borderColor: "#BAE6FD", bgcolor: "#F0F9FF", "&:hover": { bgcolor: "#E0F2FE", borderColor: "#0284C7" } }}><Box><Stack direction="row" alignItems="center" spacing={1}><Typography fontSize={14.5} fontWeight={850}>{option.title}</Typography>{option.badge && <Chip size="small" label={option.badge} sx={{ height: 20, fontSize: 10.5, fontWeight: 800, bgcolor: "#E0F2FE", color: "#0369A1" }} />}</Stack>{option.subtitle && <Typography fontSize={11.5} color="#64748B" sx={{ mt: .3 }}>{option.subtitle}</Typography>}</Box></Button>)}</Stack></DialogContent></Dialog>
    <Dialog PaperProps={{ sx: popupPaper }} open={popup === "restricted"} onClose={() => setPopup("")}><DialogTitle>Access Restricted</DialogTitle><DialogContent><Typography>Approval is available to reporting officers and employees with delegated approval power.</Typography><Button onClick={() => setPopup("")} sx={{ mt: 2 }}>Close</Button></DialogContent></Dialog>
    <Dialog PaperProps={{ sx: popupPaper }} open={["tracking", "history"].includes(popup)} onClose={() => setPopup("")} fullWidth maxWidth="lg"><DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}><Box>{popup === "tracking" ? "Application Tracking" : "Application History"}<Typography sx={{ fontSize: 11, color: "#83909E" }}>{popup === "tracking" ? "From D−2 through all future applications. Pending rows are amber." : "Leave, training, sports, exchange and replacement records."}</Typography></Box><IconButton aria-label="Close applications" onClick={() => setPopup("")}><X size={18} /></IconButton></DialogTitle><DialogContent dividers><Tabs value={kind} onChange={(_, value) => setKind(value)} variant="scrollable" scrollButtons="auto">{["All", ...Object.keys(destinations)].map(value => <Tab key={value} value={value} label={value} sx={{ textTransform: "none" }} />)}</Tabs><Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ my: 2 }}><TextField label="Search applications" size="small" value={search} onChange={event => setSearch(event.target.value)} sx={{ flex: 1 }} /><TextField select label="Application status" size="small" value={recordStatus} onChange={event => setRecordStatus(event.target.value)} sx={{ minWidth: 160 }}>{["All", "Pending", "Approved", "Cancelled", "Rejected", "Withdrawn"].map(value => <MenuItem key={value} value={value}>{value === "All" ? "All statuses" : value}</MenuItem>)}</TextField><Button variant={recordStatus === "Approved" && kind === "Leave" ? "contained" : "outlined"} onClick={() => { setKind("Leave"); setRecordStatus("Approved"); }}>Approved leave</Button><Button variant={scope === "mine" ? "contained" : "outlined"} onClick={() => setScope("mine")}>My applications</Button><Button variant={scope === "all" ? "contained" : "outlined"} onClick={() => setScope("all")}>Authorised records</Button></Stack>{popup === "history" && <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mb: 2, p: 2, bgcolor: "#FFF1F4", borderRadius: 3 }}><TextField label="History from" type="date" size="small" value={historyFrom} onChange={event => setHistoryFrom(event.target.value)} InputLabelProps={{ shrink: true }} /><TextField label="History to" type="date" size="small" value={historyTo} onChange={event => setHistoryTo(event.target.value)} InputLabelProps={{ shrink: true }} error={Boolean(historyFrom && historyTo && historyTo < historyFrom)} helperText={historyFrom && historyTo && historyTo < historyFrom ? "End date must follow start date" : ""} /><Button onClick={() => { setHistoryFrom(""); setHistoryTo(""); }}>All dates</Button><Typography sx={{ alignSelf: "center", fontSize: 12, color: "#786B74" }}>{visibleRecords.length} matching applications</Typography></Stack>}{errors.some(error => Object.keys(destinations).includes(error)) && <Alert severity="warning" sx={{ mb: 2 }}>Some application records could not be loaded. Use Refresh on the dashboard to retry.</Alert>}<Stack spacing={1}>{visibleRecords.map((row, index) => <Paper variant="outlined" key={`${row.kind}-${row.id || row._id || index}`} sx={{ p: 1.6, borderRadius: 2, background: isPending(statusOf(row)) ? "#FFF8E5" : "#FAFCFD", borderColor: isPending(statusOf(row)) ? "#EED28D" : "#E5EAF0" }}><Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ sm: "center" }}><Box sx={{ flex: 1 }}><Typography sx={{ fontSize: 13, fontWeight: 800 }}>{row.employeeName || row.name || row.employeeId || row.firstEmployee?.name || row.requesterName || "Application"} · {row.kind}</Typography><Typography sx={{ fontSize: 11, color: "#788493", mt: .4 }}>{row.leaveType || row.trainingName || row.sportsName || row.eventName || row.assignedDuty || "Duty application"} · {dateOf(row) || "Date unavailable"}{endOf(row) !== dateOf(row) ? ` → ${endOf(row)}` : ""}</Typography></Box><Chip size="small" label={statusOf(row)} color={isPending(statusOf(row)) ? "warning" : "default"} /><ApplicationActions row={row} saving={saving} selectedDatesOnly={popup === "tracking" && (recordStatus === "Approved" || row.finalStatus === "Approved")} allowReapply={popup === "history"} onReapply={record => demo ? setDemoWorkspace("apply") : navigate(`/crew/leave?${new URLSearchParams({ section: "apply", employeeId: record.employeeId, from: record.startDate || record.date, to: record.endDate || record.date, reviseLeaveId: (record.anchor || record).id })}`)} demo={demo} onUpdated={refresh} onDemoDelete={ids => setRecords(current => current.filter(item => !ids.includes(item.id)))} onDemoEdit={(leave, originals, applications, reason) => setRecords(current => [...current.filter(item => !originals.some(original => original.id === item.id)), ...applications.map((application, i) => ({ ...leave, ...application, reason, kind: "Leave", id: `demo-edit-${Date.now()}-${i}`, leaveGroupId: leave.leaveGroupId || `demo-group-${Date.now()}`, finalStatus: "Applied" }))])} onMutation={requestMutation} onTrainingReview={record => demo ? setDemoWorkspace(destinations.Training) : setTrainingReview(record.id)} /><Button size="small" onClick={() => navigate(destinations[row.kind])} endIcon={<ArrowUpRight size={13} />} sx={{ textTransform: "none" }}>{destinationLabels[row.kind]}</Button></Stack><Box sx={{ mt: 1.3, borderTop: "1px solid #E6E6EF", pt: .5 }}><LeaveProgress leave={row.kind === "Leave" ? row.anchor || row : { ...row, finalStatus: statusOf(row), approvalChain: [{ name: `${row.kind} review`, status: /^(approved|accepted|completed)$/i.test(statusOf(row)) ? "Approved" : "Pending" }] }} compact /></Box></Paper>)}</Stack>{!visibleRecords.length && <Empty loading={loading} text="No applications match this view." />}</DialogContent></Dialog>
    {/* Full Duty Assignments & Approvals Dialog (Pop-up from landscape section) */}
    <Dialog PaperProps={{ sx: popupPaper }} open={dutyFullListOpen} onClose={() => setDutyFullListOpen(false)} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Box>
          <Typography fontSize={17} fontWeight={900}>
            Duty Assignments & Approvals
          </Typography>
          <Typography fontSize={11} color="#64748B">
            Accept or deny replacement duties
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} alignItems="center">
          <IconButton size="small" onClick={loadDutyNotifs} disabled={dutyNotifsLoading}>
            <RefreshCw size={15} className={dutyNotifsLoading ? "animate-spin" : ""} />
          </IconButton>
          <IconButton aria-label="Close" onClick={() => setDutyFullListOpen(false)}>
            <X size={18} />
          </IconButton>
        </Stack>
      </DialogTitle>
      <DialogContent dividers>
        {actionFeedback && (
          <Alert severity={actionFeedback.severity} onClose={() => setActionFeedback(null)} sx={{ mb: 2, fontSize: 12 }}>
            {actionFeedback.text}
          </Alert>
        )}

        <Stack spacing={1.5}>
          {/* 1. Denied Duties - High Visibility with Actions (Image 1) */}
          {dutyNotifs.filter(isDenialActive).map(n => (
            <Box
              key={`pop-denied-${n._id}`}
              sx={{
                p: 1.5,
                borderRadius: 2,
                border: "2px solid #DC2626",
                bgcolor: "#FEF2F2",
                animation: "adminDenialBlink 1.4s ease-in-out infinite",
              }}
            >
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.6 }}>
                <Chip size="small" label="⚠️ DUTY DENIED" sx={{ height: 20, fontSize: "0.65rem", fontWeight: 950, bgcolor: "#DC2626", color: "#FFF" }} />
                <Typography fontSize={11} color="#991B1B" fontWeight={850}>
                  {dayjs(n.date).format("DD-MMM-YYYY")}
                </Typography>
              </Stack>
              <Typography fontSize={13} fontWeight={850} color="#991B1B">
                {n.assignedDuty} Shift — {n.employeeName} ({n.employeeId})
              </Typography>
              <Typography fontSize={11.5} color="#7F1D1D" sx={{ mt: 0.3 }}>
                <strong>Denied By:</strong> {n.deniedByRole || "Reporting/HOD Officer"} ({n.deniedBy})
              </Typography>
              {n.reason && (
                <Typography fontSize={11.5} color="#991B1B" sx={{ mt: 0.5, fontStyle: "italic", bgcolor: "rgba(254, 226, 226, 0.7)", p: 0.8, borderRadius: 1.5 }}>
                  <strong>Reason:</strong> {n.reason}
                </Typography>
              )}

              <Stack direction="row" spacing={1} sx={{ mt: 1.2, pt: 1, borderTop: "1px dashed #FECACA" }}>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => {
                    setDutyFullListOpen(false);
                    navigate(`/crew/replacement?tab=duty&date=${n.date}&shift=${n.assignedDuty}`);
                  }}
                  sx={{
                    fontSize: 11,
                    fontWeight: 850,
                    textTransform: "none",
                    color: "#1E3A8A",
                    borderColor: "#93C5FD",
                    bgcolor: "#EFF6FF",
                    "&:hover": { bgcolor: "#DBEAFE" },
                  }}
                >
                  Allocate Another Duty ↗
                </Button>
                <Button
                  size="small"
                  variant="contained"
                  disabled={reallocatingId === n._id}
                  onClick={() => handleAutoReallocate(n._id)}
                  sx={{
                    fontSize: 11,
                    fontWeight: 900,
                    textTransform: "none",
                    bgcolor: "#DC2626",
                    "&:hover": { bgcolor: "#B91C1C" },
                  }}
                >
                  {reallocatingId === n._id ? "Allocating..." : "Auto Sequential Allocate ⚡"}
                </Button>
              </Stack>
            </Box>
          ))}

          {/* 2. Pending and Accepted Duties */}
          {dutyNotifs.filter(n => n.status === "Pending" || n.status === "Accepted").map(n => (
            <Box
              key={`pop-duty-${n._id}`}
              sx={{
                p: 1.5,
                borderRadius: 2,
                border: "1px solid #E2E8F0",
                borderLeft: n.status === "Accepted" ? "4px solid #16A34A" : "4px solid #F59E0B",
                bgcolor: n.status === "Accepted" ? "#F0FDF4" : "#FFFBEB",
              }}
            >
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.5 }}>
                <Chip
                  size="small"
                  label={n.status === "Accepted" ? "Accepted" : "Pending Response"}
                  sx={{
                    height: 18,
                    fontSize: "0.62rem",
                    fontWeight: 850,
                    bgcolor: n.status === "Accepted" ? "#DCFCE7" : "#FEF3C7",
                    color: n.status === "Accepted" ? "#166534" : "#92400E",
                  }}
                />
                <Typography fontSize={11.5} fontWeight={800} color="#475569">
                  {dayjs(n.date).format("DD-MMM-YYYY")}
                </Typography>
              </Stack>
              <Typography fontSize={13} fontWeight={850} color="#1E293B">
                {n.assignedDuty} Shift · {n.employeeName} ({n.employeeId})
              </Typography>
              <Typography fontSize={11} color="#64748B">
                Role: {n.viewerRole} {n.leaveId ? `· Replacement for leave` : ""}
              </Typography>
              <Stack direction="row" spacing={1} sx={{ mt: 1.2 }}>
                {n.canAccept && (
                  <Button
                    size="small"
                    variant="contained"
                    onClick={() => handleAcceptDuty(n._id)}
                    sx={{
                      py: 0.4,
                      px: 1.4,
                      fontSize: 11,
                      fontWeight: 850,
                      bgcolor: "#16A34A",
                      "&:hover": { bgcolor: "#15803D" },
                      textTransform: "none",
                    }}
                  >
                    Accept Duty
                  </Button>
                )}
                {n.canDeny && (
                  <Button
                    size="small"
                    variant="outlined"
                    color="error"
                    onClick={() => handleOpenDenyDialog(n)}
                    sx={{
                      py: 0.4,
                      px: 1.4,
                      fontSize: 11,
                      fontWeight: 850,
                      textTransform: "none",
                      borderColor: "#DC2626",
                      color: "#DC2626",
                      "&:hover": { bgcolor: "#FEE2E2", borderColor: "#B91C1C" },
                    }}
                  >
                    Deny Duty (HOD)
                  </Button>
                )}
                {n.canRevert && (
                  <Button
                    size="small"
                    variant="outlined"
                    color="warning"
                    onClick={() => handleRevertAssignment(n)}
                    sx={{
                      py: 0.4,
                      px: 1.4,
                      fontSize: 11,
                      fontWeight: 850,
                      textTransform: "none",
                      borderColor: "#D97706",
                      color: "#B45309",
                      bgcolor: "#FFFBEB",
                      "&:hover": { bgcolor: "#FEF3C7", borderColor: "#B45309" },
                    }}
                  >
                    Revert Assignment (Test)
                  </Button>
                )}
              </Stack>
            </Box>
          ))}

          {dutyNotifs.length === 0 && (
            <Typography fontSize={12} color="#94A3B8" sx={{ py: 3, textAlign: "center" }}>
              No replacement duty assignments or approvals found.
            </Typography>
          )}
        </Stack>
      </DialogContent>
      <Box sx={{ display: "flex", justifyContent: "flex-end", p: 2 }}>
        <Button onClick={() => setDutyFullListOpen(false)}>Close</Button>
      </Box>
    </Dialog>

    {/* Deny Replacement Duty Dialog (Reporting/HOD Only) */}
    <Dialog PaperProps={{ sx: popupPaper }} open={denyDialogOpen} onClose={() => !denySubmitting && setDenyDialogOpen(false)} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontSize: 16, fontWeight: 850, color: "#DC2626" }}>
        Deny Replacement Duty (HOD Review)
      </DialogTitle>
      <DialogContent dividers>
        {selectedNotifForDeny && (
          <Stack spacing={1.5} sx={{ pt: 0.5 }}>
            <Typography fontSize={13} color="#334155">
              Denying <strong>{selectedNotifForDeny.assignedDuty}</strong> duty on{" "}
              <strong>{dayjs(selectedNotifForDeny.date).format("DD-MMM-YYYY")}</strong> for employee{" "}
              <strong>{selectedNotifForDeny.employeeName}</strong>.
            </Typography>
            <Typography fontSize={11} color="#64748B">
              This action will email the Admin and highlight this duty as DENIED with a blinking alert on the Dashboard.
            </Typography>
            <TextField
              label="Reason for Denial *"
              multiline
              rows={3}
              fullWidth
              size="small"
              value={denyReason}
              onChange={(e) => setDenyReason(e.target.value)}
              placeholder="Provide reason for inability to perform assigned duty..."
            />
          </Stack>
        )}
      </DialogContent>
      <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1, p: 2 }}>
        <Button disabled={denySubmitting} onClick={() => setDenyDialogOpen(false)}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color="error"
          disabled={denySubmitting || !denyReason.trim()}
          onClick={handleConfirmDeny}
          sx={{ fontWeight: 850 }}
        >
          {denySubmitting ? "Submitting..." : "Confirm Denial"}
        </Button>
      </Box>
    </Dialog>
    {/* Admin Modules Dialog (Image 5 & 6 Styled 3D Glossy Tiles) */}
    <Dialog
      open={adminModalOpen}
      onClose={() => setAdminModalOpen(false)}
      fullWidth
      maxWidth="md"
      slotProps={{
        paper: {
          sx: {
            borderRadius: "28px !important",
            background: "#FAF9FD !important",
            boxShadow: "0 30px 100px rgba(15, 23, 42, 0.25) !important",
            overflow: "hidden",
            border: "1px solid rgba(255, 255, 255, 0.8)",
          },
        },
      }}
    >
      <DialogTitle
        sx={{
          px: 3,
          py: 2.5,
          background: "linear-gradient(120deg, #0F172A 0%, #1E293B 55%, #334155 100%)",
          color: "#FFFFFF",
        }}
      >
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Stack direction="row" alignItems="center" spacing={1.5}>
            {/* Glossy 3D Orb Sparkle Header Avatar (Image 5 Style) */}
            <Box
              sx={{
                width: 44,
                height: 44,
                borderRadius: "50%",
                background: "radial-gradient(circle at 35% 25%, #64748B 0%, #1E293B 55%, #0F172A 100%)",
                boxShadow: "inset 0 1.5px 2px rgba(255,255,255,0.6), 0 8px 24px rgba(0,0,0,0.35)",
                display: "grid",
                placeItems: "center",
                color: "#FFFFFF",
                position: "relative",
              }}
            >
              <Sparkles size={20} color="#F8FAFC" />
            </Box>
            <Box>
              <Typography fontSize={18} fontWeight={900} color="#FFFFFF">
                System & Module Administration
              </Typography>
              <Typography fontSize={11} color="#94A3B8">
                Master rosters, organization structure, access security & system configurations
              </Typography>
            </Box>
          </Stack>

          <IconButton onClick={() => setAdminModalOpen(false)} sx={{ color: "#94A3B8", "&:hover": { color: "#FFF" } }}>
            <X size={20} />
          </IconButton>
        </Stack>
      </DialogTitle>

      <DialogContent sx={{ p: 3, bgcolor: "#F8FAFC" }}>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)" },
            gap: 1.8,
          }}
        >
          {adminModuleOptions.map((item, idx) => {
            const IconComp = item.icon;
            const isDarkOrb = idx % 2 === 0;

            return (
              <Button
                key={item.path}
                onClick={() => {
                  setAdminModalOpen(false);
                  navigate(item.path);
                }}
                sx={{
                  p: 2,
                  borderRadius: "20px",
                  bgcolor: "#FFFFFF",
                  border: "1px solid #E2E8F0",
                  boxShadow: "0 4px 18px rgba(15, 23, 42, 0.04)",
                  textTransform: "none",
                  textAlign: "left",
                  alignItems: "stretch",
                  display: "flex",
                  flexDirection: "column",
                  transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                  "&:hover": {
                    bgcolor: "#FFFFFF",
                    transform: "translateY(-3px)",
                    boxShadow: "0 12px 30px rgba(15, 23, 42, 0.09)",
                    borderColor: "#CBD5E1",
                  },
                }}
              >
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.2 }}>
                  {/* Glossy 3D Orb Icon (Image 5 & 6 Aesthetic) */}
                  <Box
                    sx={{
                      width: 42,
                      height: 42,
                      borderRadius: "50%",
                      background: isDarkOrb
                        ? "radial-gradient(circle at 35% 25%, #475569 0%, #1E293B 55%, #0F172A 100%)"
                        : "radial-gradient(circle at 35% 25%, #FFFFFF 0%, #F1F5F9 55%, #CBD5E1 100%)",
                      boxShadow: isDarkOrb
                        ? "inset 0 1.5px 2px rgba(255,255,255,0.45), 0 6px 16px rgba(15,23,42,0.22)"
                        : "inset 0 1.5px 2px rgba(255,255,255,0.95), 0 6px 16px rgba(0,0,0,0.08)",
                      display: "grid",
                      placeItems: "center",
                      color: isDarkOrb ? "#FFFFFF" : "#1E293B",
                      border: isDarkOrb ? "1px solid rgba(255,255,255,0.12)" : "1px solid rgba(255,255,255,0.8)",
                    }}
                  >
                    <IconComp size={18} strokeWidth={2.2} />
                  </Box>

                  <Stack direction="row" spacing={0.6} alignItems="center">
                    <Chip
                      size="small"
                      label={item.badge}
                      sx={{
                        height: 20,
                        fontSize: "0.68rem",
                        fontWeight: 900,
                        bgcolor: isDarkOrb ? "#EFF6FF" : "#F3E8FF",
                        color: isDarkOrb ? "#1E40AF" : "#6B21A8",
                        border: isDarkOrb ? "1px solid #BFDBFE" : "1px solid #E9D5FF",
                      }}
                    />
                    <ArrowUpRight size={14} color="#94A3B8" />
                  </Stack>
                </Stack>

                <Typography fontSize={14.5} fontWeight={900} color="#0F172A">
                  {item.title}
                </Typography>
                <Typography fontSize={11} color="#64748B" sx={{ mt: 0.3, lineHeight: 1.4 }}>
                  {item.note}
                </Typography>
              </Button>
            );
          })}
        </Box>
      </DialogContent>

      <DialogActions sx={{ p: 2, bgcolor: "#F1F5F9", borderTop: "1px solid #E2E8F0" }}>
        <Button onClick={() => setAdminModalOpen(false)} sx={{ fontWeight: 800 }}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  </Box>;
}

function Empty({ loading, text }) { return <Box sx={{ py: 3, color: "#96A0AA", textAlign: "center", fontSize: 11 }}>{loading ? <CircularProgress size={20} /> : text}</Box>; }

function ApplicationActions({ row, saving, onMutation, onTrainingReview, demo, onUpdated, onDemoEdit, selectedDatesOnly, allowReapply, onReapply, onDemoDelete }) {
  if (row.kind === "Training") return <Button size="small" onClick={() => onTrainingReview(row)}>Review / Manage training</Button>;
  if (row.kind !== "Leave") return null;
  const groupRows = row.rows || [row];
  const anchor = row.finalStatus === "Approved" || selectedDatesOnly ? groupRows.find(record => record.finalStatus === "Approved") || row.anchor || row : row.anchor || row;
  const canWithdraw = anchor.isOwner && anchor.finalStatus === "Applied" && (anchor.approvalMode === "Organization" ? (anchor.approvalChain || [])[0]?.status === "Pending" : anchor.sicApprovalStatus === "Pending");
  const cancelGroup = ({ leave, dates }) => onMutation("cancel-group", leave, dates);
  return <Stack direction="row" spacing={.6} flexWrap="wrap"><LeaveTracking leave={anchor} groupRows={groupRows} busy={saving} demo={demo} onUpdated={onUpdated} onDemoDelete={onDemoDelete} onDemoEdit={onDemoEdit} selectedDatesOnly={selectedDatesOnly} onReapply={allowReapply ? () => onReapply(row) : undefined} onCancel={leave => onMutation("cancel", leave)} onCancelGroup={cancelGroup} />{!selectedDatesOnly && row.canCancel && <Button disabled={saving} size="small" color="warning" onClick={() => groupRows.length > 1 ? cancelGroup({ leave: anchor, dates: groupRows.filter(leave => leave.canCancel).map(leave => leave.date) }) : onMutation("cancel", anchor)}>{groupRows.length > 1 ? "Cancel all" : "Cancel"}</Button>}{!selectedDatesOnly && canWithdraw && <Button disabled={saving} size="small" color="warning" onClick={() => onMutation("withdraw", anchor)}>{groupRows.length > 1 ? "Withdraw first date" : "Withdraw"}</Button>}{!selectedDatesOnly && row.isOwner && (allowReapply && groupRows.some(record => record.finalStatus === "Approved") || groupRows.every(record => ["Cancelled", "Canceled", "Withdrawn", "Rejected"].includes(record.finalStatus))) && <Button size="small" onClick={() => onReapply(row)}>{groupRows.some(record => record.finalStatus === "Approved") ? "Change dates" : "Reapply leave"}</Button>}</Stack>;
}

function RosterGroup({ group, dates, onOpen }) {
  return <><tr><Box component="td" colSpan={10} sx={{ bgcolor: "#F5F8FA", textAlign: "left !important", pl: "18px !important", color: "#71818D", fontSize: 9, fontWeight: 850 }}>{group.groupName || "Group"}<Box component="span" sx={{ ml: 1, color: "#A4ADB7", fontWeight: 500 }}>{group.employees?.length || 0} personnel</Box></Box></tr>{(group.employees || []).map(person => <tr key={person.employeeId}><Box component="td" sx={{ position: "sticky", left: 0, zIndex: 1, bgcolor: "#FFF", textAlign: "left !important", pl: "18px !important", fontSize: 10, fontWeight: 700, whiteSpace: "nowrap" }}><Tooltip title={`${person.name || person.employeeId} · ${person.employeeId}`}><Button onClick={onOpen} sx={{ p: 0, minWidth: 0, color: "#465663", textTransform: "none", fontSize: "inherit" }}>{compactName(person.name || person.employeeId)}{person.IsSIC && <Box component="span" sx={{ ml: .6, fontSize: 7, color: "#148673" }}>SIC</Box>}</Button></Tooltip></Box>{dates.map(date => {
    const duty = person.duties?.[date] || {}, pending = isPending(duty.leaveStatus) || isPending(duty.trainingStatus) || isPending(duty.sportsStatus);
    const code = duty.leaveStatus && !/rejected|cancelled|withdrawn/i.test(duty.leaveStatus) ? "L" : duty.trainingName ? "T" : duty.sportsName ? "S" : shortShift(duty.shift);
    const tone = pending ? { color: "#B78119", bg: "#FFF1D2" } : shifts[code] || { color: code === "L" ? "#CF6A78" : code === "T" ? "#8B5CF6" : "#16A677", bg: code === "L" ? "#FDEEF0" : code === "T" ? "#F1EDFC" : "#EDF7F2" };
    return <td key={date}><Tooltip title={`${person.name || person.employeeId} · ${date} · ${duty.leaveType || duty.trainingName || duty.sportsName || duty.shift || "No duty"}${pending ? " · Pending" : ""}${duty.replacementEmployee?.name ? ` · Cover: ${duty.replacementEmployee.name}` : ""}`}><Button aria-label={`${person.name || person.employeeId}, ${date}, ${code}`} onClick={onOpen} sx={{ minWidth: 26, p: .35, height: 25, fontSize: 9, fontWeight: 800, color: tone.color, bgcolor: tone.bg, borderRadius: "7px" }}>{code}{duty.additionalDuties?.length ? "+" : ""}</Button></Tooltip></td>;
  })}</tr>)}</>;
}
