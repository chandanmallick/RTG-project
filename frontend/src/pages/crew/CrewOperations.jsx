import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Box, Button, Chip, CircularProgress, Stack, Tooltip, Typography } from "@mui/material";
import { ArrowLeftRight, BarChart3, CalendarDays, CheckCircle2, ChevronRight, ClipboardList, GraduationCap, LockKeyhole, Medal, RefreshCw, Settings2, Umbrella, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import AppShell from "../../components/layout/AppShell";
import { useAuth } from "../../auth/AuthContext";
import api from "../../crewLegacy/api";

const stages = [
  { id: "prepare", eyebrow: "01 · Prepare", title: "Master / event", color: "#6D28D9", tint: "#F5F3FF" },
  { id: "request", eyebrow: "02 · Request", title: "Application", color: "#0057B7", tint: "#EFF6FF" },
  { id: "decide", eyebrow: "03 · Decide", title: "Assignment / approval", color: "#047857", tint: "#ECFDF5" },
  { id: "cover", eyebrow: "04 · Arrange", title: "Replacement / cover", color: "#9A3412", tint: "#FFF7ED" },
  { id: "track", eyebrow: "05 · Follow", title: "Tracking", color: "#0369A1", tint: "#F0F9FF" },
  { id: "report", eyebrow: "06 · Review", title: "Report", color: "#4338CA", tint: "#EEF2FF" },
];

const categories = [
  { id: "leave", title: "Leave", subtitle: "Holiday to final reporting", icon: Umbrella, color: "#0369A1", tint: "#F0F9FF", actions: {
    prepare: [{ key: "holidays", title: "Holiday calendar", note: "Create and maintain holidays", icon: CalendarDays, to: "/crew/training?section=holiday" }],
    request: [{ key: "applyLeave", title: "Apply leave", note: "Leave and station leave", icon: Umbrella, to: "/crew/leave?section=apply" }],
    decide: [{ key: "leaveApproval", title: "Approve leave", note: "Requests awaiting decision", icon: CheckCircle2, to: "/crew/leave?section=pending" }, { key: "delegate", title: "Delegate approval", note: "Temporary approval power", icon: Settings2, to: "/crew/leave?section=delegation" }],
    cover: [{ key: "leaveReplacement", title: "Replacement", note: "Assign leave duty cover", icon: Users, to: "/crew/replacement?section=leave" }],
    track: [{ key: "leaveTracking", title: "Track leave", note: "Status, cancellation and history", icon: ClipboardList, to: "/crew/leave?section=tracking" }],
    report: [{ key: "categoryReport", title: "Leave report", note: "Employee and period analysis", icon: BarChart3, to: "/crew/reports?kind=Leave" }],
  } },
  { id: "training", title: "Training", subtitle: "Programme to final reporting", icon: GraduationCap, color: "#6D28D9", tint: "#F5F3FF", actions: {
    prepare: [{ key: "trainingEvents", title: "Training programme", note: "Create, edit and publish", icon: GraduationCap, to: "/crew/training?section=training" }],
    request: [{ key: "requestTraining", title: "Request training", note: "Submit through reporting hierarchy", icon: GraduationCap, to: "/crew/training?section=request" }, { key: "myTraining", title: "Training OFF request", note: "Adjacent OFF for approved training", icon: CalendarDays, to: "/crew/training?section=mytraining" }],
    decide: [{ key: "trainingAssignment", title: "Training assignment", note: "Nominate eligible employees", icon: Users, to: "/crew/training?section=assign" }, { key: "trainingApproval", title: "Training & OFF approval", note: "Current approval stage", icon: CheckCircle2, to: "/crew/training?section=pending" }],
    cover: [{ key: "calendarCoverage", title: "Replacement", note: "Assign cover from duty calendar", icon: Users, to: "/crew/calendar?filter=coverage" }],
    track: [{ key: "trainingHistory", title: "Track training", note: "History and nomination matrix", icon: ClipboardList, to: "/crew/training?section=history" }],
    report: [{ key: "categoryReport", title: "Training report", note: "Attendance and employee analysis", icon: BarChart3, to: "/crew/reports?kind=Training" }],
  } },
  { id: "sports", title: "Sports", subtitle: "Event to final reporting", icon: Medal, color: "#B45309", tint: "#FFF7ED", actions: {
    prepare: [{ key: "sportsEvents", title: "Sports programme", note: "Create and publish events", icon: Medal, to: "/crew/sports?section=events" }],
    request: [{ key: "applySports", title: "Apply sports", note: "Apply and request related OFF", icon: Medal, to: "/crew/sports?section=apply" }],
    decide: [{ key: "sportsApproval", title: "Sports & OFF approval", note: "Requests at your approval stage", icon: CheckCircle2, to: "/crew/sports?section=approval" }],
    cover: [{ key: "calendarCoverage", title: "Replacement", note: "Assign cover from duty calendar", icon: Users, to: "/crew/calendar?filter=coverage" }],
    track: [{ key: "sportsTracking", title: "Track sports", note: "Application status and history", icon: ClipboardList, to: "/crew/sports?section=approval" }],
    report: [{ key: "categoryReport", title: "Sports report", note: "Employee and event analysis", icon: BarChart3, to: "/crew/reports?kind=Sports" }],
  } },
  { id: "exchange", title: "Duty exchange", subtitle: "One continuous exchange workflow", icon: ArrowLeftRight, color: "#0F766E", tint: "#F0FDFA", actions: {
    prepare: [],
    request: [{ key: "requestExchange", title: "Request exchange", note: "Select employee and duties", icon: ArrowLeftRight, to: "/crew/replacement?section=duty&mode=exchange" }],
    decide: [{ key: "exchangeApproval", title: "Approve exchange", note: "Employee, SIC and DIC decisions", icon: CheckCircle2, to: "/crew/replacement?section=duty&focus=approvals" }],
    cover: [{ key: "leaveReplacement", title: "All replacements", note: "Single replacement workspace", icon: Users, to: "/crew/replacement" }],
    track: [{ key: "exchangeTracking", title: "Track exchange", note: "History and current stage", icon: ClipboardList, to: "/crew/replacement?section=duty&focus=history" }],
    report: [{ key: "categoryReport", title: "Duty report", note: "Replacement duty analysis", icon: BarChart3, to: "/crew/reports?kind=Replacement%20duty" }],
  } },
];

const fallbackAccess = (item, actions) => actions[item.key]
  || (item.key === "trainingHistory" ? actions.trainingAssignment : undefined)
  || (item.key === "categoryReport" ? { enabled: true, pending: 0 } : undefined);

function ActionCard({ item, stage, actions, onOpen, checking }) {
  const access = fallbackAccess(item, actions);
  const enabled = Boolean(access?.enabled);
  return <Tooltip title={enabled ? "" : checking ? "Checking your access…" : "Access has not been granted for this action."}>
    <span><Button fullWidth disabled={!enabled} onClick={() => enabled && onOpen(item.to)} aria-label={item.title + (access?.pending ? `, ${access.pending} pending` : "")} sx={{ px: .9, py: .75, minHeight: 54, justifyContent: "flex-start", textAlign: "left", textTransform: "none", border: access?.pending ? `2px solid ${stage.color}` : "1px solid #CBD5E1", borderRadius: 2, color: "#0F172A", background: "rgba(255,255,255,.94)", "&:hover": { borderColor: stage.color, background: stage.tint }, "&.Mui-disabled": { opacity: .44, filter: "grayscale(1)", color: "#64748B", background: "#F1F5F9" } }}>
      <Box sx={{ mr: .75, color: stage.color, flexShrink: 0 }}><item.icon size={16} /></Box>
      <Box sx={{ minWidth: 0, flex: 1 }}><Typography sx={{ fontSize: 11.2, fontWeight: 950, lineHeight: 1.2 }}>{item.title}</Typography><Typography sx={{ mt: .15, fontSize: 9.1, lineHeight: 1.25, color: "#64748B" }}>{enabled ? item.note : checking ? "Checking access…" : "Access not granted"}</Typography></Box>
      {enabled ? access.pending > 0 ? <Chip component="span" size="small" color="warning" label={access.pending} sx={{ ml: .35, height: 21, fontWeight: 900 }} /> : <ChevronRight size={14} color="#94A3B8" /> : <LockKeyhole size={14} />}
    </Button></span>
  </Tooltip>;
}

export default function CrewOperations() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const requestRef = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++requestRef.current;
    setLoading(true);
    try {
      const { data } = await api.get("/operations/summary");
      if (request !== requestRef.current) return;
      setSummary(data); setError("");
    } catch (failure) {
      if (request !== requestRef.current) return;
      setSummary(null); setError(failure.response?.data?.detail || "Access and pending counts could not be loaded. Refresh to try again.");
    } finally { if (request === requestRef.current) setLoading(false); }
  }, []);
  useEffect(() => {
    setSummary(null); refresh();
    const update = () => { if (!document.hidden) refresh(); };
    const timer = window.setInterval(update, 60000);
    window.addEventListener("focus", update);
    return () => { requestRef.current += 1; window.clearInterval(timer); window.removeEventListener("focus", update); };
  }, [refresh, user?.employeeId]);
  const actions = summary?.actions || {};
  return <AppShell>
    <Box sx={{ height: { md: "calc(100dvh - 116px)" }, overflow: { md: "auto" }, p: { xs: 1.2, md: 2 }, background: "#F8FAFC" }}>
      <Box sx={{ p: { xs: 1.7, md: 2.2 }, borderRadius: 3, color: "#FFF", background: "linear-gradient(108deg,#071E58,#075CB6 62%,#1780DF)" }}>
        <Stack direction={{ xs: "column", md: "row" }} alignItems={{ md: "center" }} justifyContent="space-between" spacing={1.4}>
          <Box><Typography sx={{ fontSize: 10.5, fontWeight: 900, textTransform: "uppercase", color: "#BFE0FF" }}>Crew management</Typography><Typography sx={{ mt: .3, fontSize: { xs: 22, md: 27 }, fontWeight: 900 }}>Application, Approval &amp; Replacement</Typography><Typography sx={{ mt: .55, fontSize: 12 }}>{user?.name || "Crew team"} · each row follows the process from event to report.</Typography></Box>
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            <Button disabled={!actions.calendar?.enabled} startIcon={<CalendarDays size={16} />} onClick={() => navigate("/crew/calendar?view=duty")} sx={{ background: "#FFF", color: "#073B75", fontWeight: 900, "&:hover": { background: "#EFF6FF" }, "&.Mui-disabled": { background: "#E2E8F0", opacity: .45 } }}>Duty calendar</Button>
            <Button disabled={!actions.calendar?.enabled} startIcon={<Medal size={16} />} onClick={() => navigate("/crew/calendar?view=events")} sx={{ background: "#E0F2FE", color: "#0755A5", fontWeight: 900, "&:hover": { background: "#BAE6FD" }, "&.Mui-disabled": { opacity: .45 } }}>Event calendar</Button>
            <Button disabled={loading} startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <RefreshCw size={16} />} onClick={refresh} sx={{ color: "#FFF", border: "1px solid #FFFFFF99", "&.Mui-disabled": { color: "#FFFFFF99" } }}>Refresh</Button>
          </Stack>
        </Stack>
        <Box role="status" aria-live="polite" sx={{ mt: 1.5 }}>{summary ? <Chip label={summary.totalPending ? summary.totalPending + " pending · awaiting your action" : "No pending action for you"} sx={{ background: summary.totalPending ? "#FEF3C7" : "#D1FAE5", color: summary.totalPending ? "#92400E" : "#065F46", fontWeight: 900 }} /> : <Typography variant="body2">{loading ? "Checking permissions and pending requests…" : "Pending counts unavailable"}</Typography>}</Box>
      </Box>
      {error && <Alert severity="error" sx={{ mt: 1.5 }}>{error}</Alert>}
      <Box sx={{ mt: 1.5, overflowX: "auto", pb: .5 }}>
        <Box sx={{ minWidth: 1500, display: "grid", gridTemplateColumns: "145px repeat(6,minmax(190px,1fr))", border: "1px solid #D9E6F2", borderRadius: 3, overflow: "hidden", background: "#FFF", boxShadow: "0 8px 28px rgba(15,23,42,.055)" }}>
          <Box sx={{ p: 1.25, bgcolor: "#0F172A", color: "#FFF", display: "flex", alignItems: "center" }}><Typography sx={{ fontSize: 10.5, fontWeight: 900 }}>CATEGORY ↓ / PROCESS →</Typography></Box>
          {stages.map((stage) => <Box key={stage.id} sx={{ p: 1.2, borderLeft: "1px solid #D9E6F2", borderTop: `5px solid ${stage.color}`, bgcolor: stage.tint }}><Typography sx={{ fontSize: 9, color: stage.color, fontWeight: 900, textTransform: "uppercase" }}>{stage.eyebrow}</Typography><Typography sx={{ mt: .2, fontSize: 13.2, color: "#0F172A", fontWeight: 900 }}>{stage.title}</Typography></Box>)}
          {categories.map((category) => <Box key={category.id} sx={{ display: "contents" }}>
            <Box sx={{ p: 1.2, borderTop: `4px solid ${category.color}`, bgcolor: category.tint }}><Box sx={{ width: 34, height: 34, borderRadius: 2, display: "grid", placeItems: "center", color: category.color, bgcolor: "#FFF", border: `1px solid ${category.color}33` }}><category.icon size={18} /></Box><Typography sx={{ mt: .65, fontSize: 13.5, fontWeight: 950, color: category.color }}>{category.title}</Typography><Typography sx={{ fontSize: 9.2, color: "#64748B", lineHeight: 1.25 }}>{category.subtitle}</Typography></Box>
            {stages.map((stage) => <Stack key={`${category.id}-${stage.id}`} spacing={.65} sx={{ minWidth: 0, p: .85, borderLeft: "1px solid #D9E6F2", borderTop: `4px solid ${category.color}`, bgcolor: category.tint }}>{(category.actions[stage.id] || []).map((item) => <ActionCard key={`${category.id}-${item.key}-${item.title}`} item={item} stage={stage} actions={actions} onOpen={navigate} checking={loading && !summary} />)}{!(category.actions[stage.id] || []).length && <Typography sx={{ py: 2, textAlign: "center", color: `${category.color}55`, fontSize: 11 }}>—</Typography>}</Stack>)}
          </Box>)}
        </Box>
      </Box>
      <Typography sx={{ mt: 1.2, fontSize: 11, color: "#64748B" }}>Read every coloured row from left to right. Replacement is kept in one process column; tracking and reports are the final two steps.</Typography>
    </Box>
  </AppShell>;
}
