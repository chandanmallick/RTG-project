import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Box, Button, Chip, CircularProgress, Dialog, DialogContent, DialogTitle, Stack, Tooltip, Typography } from "@mui/material";
import { ArrowLeftRight, ArrowRight, BarChart3, CalendarDays, CheckCircle2, ChevronRight, ClipboardList, GraduationCap, LockKeyhole, Medal, RefreshCw, Settings2, Umbrella, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import AppShell from "../../components/layout/AppShell";
import { useAuth } from "../../auth/AuthContext";
import api from "../../crewLegacy/api";
import LeaveManagement from "../../crewLegacy/LeaveManagement";
import TrainingHolidayMaster from "../../crewLegacy/TrainingHolidayMaster";
import SportsManagement from "./SportsManagement";

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
    <span><Button fullWidth disabled={!enabled} onClick={() => enabled && onOpen(item)} aria-label={item.title + (access?.pending ? `, ${access.pending} pending` : "")} sx={{ px: .85, py: .55, minHeight: 46, justifyContent: "flex-start", textAlign: "left", textTransform: "none", border: access?.pending ? `1.5px solid ${stage.color}` : "1px solid #DCE5EE", borderRadius: 2.5, color: "#0F172A", background: "rgba(255,255,255,.82)", boxShadow: "0 1px 2px rgba(15,23,42,.025)", "&:hover": { borderColor: stage.color, background: "#FFF", boxShadow: "0 4px 12px rgba(15,23,42,.07)", transform: "translateY(-1px)" }, "&.Mui-disabled": { opacity: .4, filter: "grayscale(1)", color: "#64748B", background: "#F8FAFC" } }}>
      <Box sx={{ mr: .75, color: stage.color, flexShrink: 0 }}><item.icon size={16} /></Box>
      <Box sx={{ minWidth: 0, flex: 1 }}><Typography sx={{ fontSize: 10.8, fontWeight: 950, lineHeight: 1.2 }}>{item.title}</Typography><Typography noWrap sx={{ mt: .1, fontSize: 8.5, lineHeight: 1.2, color: "#64748B" }}>{enabled ? item.note : checking ? "Checking access…" : "Access not granted"}</Typography></Box>
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
  const [applicationPopup, setApplicationPopup] = useState("");
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
  const openAction = (item) => {
    const popupByKey = { applyLeave: "leave", requestTraining: "training", applySports: "sports" };
    if (popupByKey[item.key]) setApplicationPopup(popupByKey[item.key]);
    else navigate(item.to);
  };
  const closeApplicationPopup = () => { setApplicationPopup(""); refresh(); };
  const actions = summary?.actions || {};
  return <AppShell>
    <Box sx={{ height: { md: "calc(100dvh - 116px)" }, overflow: { md: "auto" }, p: { xs: 1.2, md: 2 }, background: "#F8FAFC" }}>
      <Box sx={{ p: { xs: 1.5, md: 1.8 }, borderRadius: 3, color: "#FFF", background: "linear-gradient(108deg,#071E58,#075CB6 62%,#1780DF)" }}>
        <Stack direction={{ xs: "column", md: "row" }} alignItems={{ md: "center" }} justifyContent="space-between" spacing={1.4}>
          <Box><Typography sx={{ fontSize: 9.5, fontWeight: 900, textTransform: "uppercase", color: "#BFE0FF" }}>Crew management</Typography><Typography sx={{ mt: .15, fontSize: { xs: 20, md: 24 }, fontWeight: 900 }}>Application, Approval &amp; Replacement</Typography><Typography sx={{ mt: .3, fontSize: 10.5, opacity: .9 }}>{user?.name || "Crew team"} · follow each row from left to right.</Typography></Box>
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            <Button disabled={!actions.calendar?.enabled} startIcon={<CalendarDays size={16} />} onClick={() => navigate("/crew/calendar?view=duty")} sx={{ background: "#FFF", color: "#073B75", fontWeight: 900, "&:hover": { background: "#EFF6FF" }, "&.Mui-disabled": { background: "#E2E8F0", opacity: .45 } }}>Duty calendar</Button>
            <Button disabled={!actions.calendar?.enabled} startIcon={<Medal size={16} />} onClick={() => navigate("/crew/calendar?view=events")} sx={{ background: "#E0F2FE", color: "#0755A5", fontWeight: 900, "&:hover": { background: "#BAE6FD" }, "&.Mui-disabled": { opacity: .45 } }}>Event calendar</Button>
            <Button disabled={loading} startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <RefreshCw size={16} />} onClick={refresh} sx={{ color: "#FFF", border: "1px solid #FFFFFF99", "&.Mui-disabled": { color: "#FFFFFF99" } }}>Refresh</Button>
          </Stack>
        </Stack>
        <Box role="status" aria-live="polite" sx={{ mt: 1 }}>{summary ? <Chip size="small" label={summary.totalPending ? summary.totalPending + " pending · awaiting your action" : "No pending action for you"} sx={{ background: summary.totalPending ? "#FEF3C7" : "#D1FAE5", color: summary.totalPending ? "#92400E" : "#065F46", fontWeight: 900 }} /> : <Typography variant="body2">{loading ? "Checking permissions and pending requests…" : "Pending counts unavailable"}</Typography>}</Box>
      </Box>
      {error && <Alert severity="error" sx={{ mt: 1.5 }}>{error}</Alert>}
      <Box sx={{ mt: 1.5, overflowX: "auto", pb: .5 }}>
        <Box sx={{ minWidth: 1280, display: "grid", gridTemplateColumns: "140px repeat(6,minmax(170px,1fr))", border: "1px solid #D9E6F2", borderRadius: 3, overflow: "hidden", background: "#FFF", boxShadow: "0 6px 20px rgba(15,23,42,.045)" }}>
          <Box sx={{ p: 1.25, bgcolor: "#0F172A", color: "#FFF", display: "flex", alignItems: "center" }}><Typography sx={{ fontSize: 10.5, fontWeight: 900 }}>CATEGORY ↓ / PROCESS →</Typography></Box>
          {stages.map((stage, index) => <Box key={stage.id} sx={{ position: "relative", p: 1.05, borderLeft: "1px solid #E2E8F0", borderTop: `4px solid ${stage.color}`, bgcolor: stage.tint }}><Typography sx={{ fontSize: 8.5, color: stage.color, fontWeight: 900, textTransform: "uppercase" }}>{stage.eyebrow}</Typography><Typography sx={{ mt: .1, fontSize: 12.2, color: "#0F172A", fontWeight: 900 }}>{stage.title}</Typography>{index < stages.length - 1 && <Box sx={{ position: "absolute", zIndex: 3, right: -11, top: "50%", mt: -.2, width: 21, height: 21, display: "grid", placeItems: "center", borderRadius: "50%", color: stage.color, bgcolor: "#FFF", border: "1px solid #D9E6F2" }}><ArrowRight size={12} /></Box>}</Box>)}
          {categories.map((category) => <Box key={category.id} sx={{ display: "contents" }}>
            <Box sx={{ p: 1.05, borderTop: "1px solid #D9E6F2", borderLeft: `4px solid ${category.color}`, bgcolor: category.tint }}><Box sx={{ display: "flex", alignItems: "center", gap: .7 }}><Box sx={{ width: 30, height: 30, borderRadius: "50%", display: "grid", placeItems: "center", color: category.color, bgcolor: "#FFF" }}><category.icon size={16} /></Box><Box><Typography sx={{ fontSize: 12.5, fontWeight: 950, color: category.color }}>{category.title}</Typography><Typography sx={{ fontSize: 8.4, color: "#64748B", lineHeight: 1.2 }}>{category.subtitle}</Typography></Box></Box></Box>
            {stages.map((stage) => <Stack key={`${category.id}-${stage.id}`} spacing={.55} sx={{ minWidth: 0, p: .7, borderLeft: "1px solid #E7EDF3", borderTop: "1px solid #D9E6F2", bgcolor: `${category.color}0D` }}>{(category.actions[stage.id] || []).map((item) => <ActionCard key={`${category.id}-${item.key}-${item.title}`} item={item} stage={stage} actions={actions} onOpen={openAction} checking={loading && !summary} />)}{!(category.actions[stage.id] || []).length && <Typography sx={{ py: 1.6, textAlign: "center", color: `${category.color}45`, fontSize: 10 }}>—</Typography>}</Stack>)}
          </Box>)}
        </Box>
      </Box>
      <Typography sx={{ mt: 1.2, fontSize: 11, color: "#64748B" }}>Read every coloured row from left to right. Replacement is kept in one process column; tracking and reports are the final two steps.</Typography>
      <Dialog open={Boolean(applicationPopup)} onClose={() => setApplicationPopup("")} fullWidth maxWidth="xl" PaperProps={{ sx: { maxHeight: "92dvh", borderRadius: 3 } }}>
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #E2E8F0" }}>
          <Box><Typography sx={{ fontSize: 18, fontWeight: 950 }}>New {applicationPopup || "crew"} application</Typography><Typography sx={{ fontSize: 10.5, color: "#64748B" }}>Complete the application without leaving Operations.</Typography></Box>
          <Button onClick={() => setApplicationPopup("")} sx={{ textTransform: "none", fontWeight: 850 }}>Close</Button>
        </DialogTitle>
        <DialogContent sx={{ p: { xs: 1.2, md: 2 }, background: "#F8FAFC" }}>
          {applicationPopup === "leave" && <LeaveManagement embeddedApplication onApplicationChanged={closeApplicationPopup} />}
          {applicationPopup === "training" && <TrainingHolidayMaster embeddedRequest onRequestSubmitted={closeApplicationPopup} />}
          {applicationPopup === "sports" && <SportsManagement embedded onSubmitted={closeApplicationPopup} />}
        </DialogContent>
      </Dialog>
    </Box>
  </AppShell>;
}
