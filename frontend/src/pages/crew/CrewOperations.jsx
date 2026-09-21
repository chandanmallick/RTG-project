import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Box, Button, Chip, CircularProgress, Stack, Tooltip, Typography } from "@mui/material";
import { ArrowLeftRight, CalendarDays, CheckCircle2, ChevronRight, ClipboardList, GraduationCap, LockKeyhole, Medal, RefreshCw, Settings2, Umbrella, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import AppShell from "../../components/layout/AppShell";
import { useAuth } from "../../auth/AuthContext";
import api from "../../crewLegacy/api";

const stages = [
  {
    eyebrow: "01 · Prepare", title: "Event entry", description: "Create programmes and events for applications.", color: "#6D28D9", tint: "#F5F3FF",
    items: [
      { key: "trainingEvents", title: "Training programmes", note: "Create, edit and publish", icon: GraduationCap, to: "/crew/training?section=training" },
      { key: "holidays", title: "Holiday calendar", note: "Maintain holidays and roster markings", icon: CalendarDays, to: "/crew/training?section=holiday" },
      { key: "sportsEvents", title: "Sports events", note: "Create events for nominations", icon: Medal, to: "/crew/sports?section=events" },
    ],
  },
  {
    eyebrow: "02 · Request", title: "Applications", description: "Submit a request or review your approved training.", color: "#0057B7", tint: "#EFF6FF",
    items: [
      { key: "applyLeave", title: "Apply leave", note: "Leave and station leave", icon: Umbrella, to: "/crew/leave?section=apply" },
      { key: "requestTraining", title: "Request training", note: "Reporting hierarchy, then HR", icon: GraduationCap, to: "/crew/training?section=request" },
      { key: "applySports", title: "Apply for sports", note: "Select an available event", icon: Medal, to: "/crew/sports?section=apply" },
      { key: "requestExchange", title: "Request duty exchange", note: "Exchange employee, SICs and final DIC", icon: ArrowLeftRight, to: "/crew/replacement?section=duty&mode=exchange" },
      { key: "myTraining", title: "My approved training", note: "Training and adjacent OFF requests", icon: CheckCircle2, to: "/crew/training?section=mytraining" },
    ],
  },
  {
    eyebrow: "03 · Decide", title: "Assignment & approval", description: "Badges count requests awaiting your decision now.", color: "#047857", tint: "#ECFDF5",
    items: [
      { key: "leaveApproval", title: "Leave approvals", note: "Pending leave duty dates in your scope", icon: CheckCircle2, to: "/crew/leave?section=pending" },
      { key: "trainingAssignment", title: "Training assignment", note: "Nominate an eligible employee", icon: Users, to: "/crew/training?section=assign" },
      { key: "trainingApproval", title: "Training / OFF approvals", note: "Training and adjacent OFF requests", icon: GraduationCap, to: "/crew/training?section=pending" },
      { key: "sportsApproval", title: "Sports approvals", note: "Requests at your approval stage", icon: Medal, to: "/crew/sports?section=approval" },
      { key: "delegate", title: "Delegate approval", note: "Temporary authority during absence", icon: Settings2, to: "/crew/leave?section=delegation" },
    ],
  },
  {
    eyebrow: "04 · Arrange cover", title: "Replacement & exchange", description: "Assign cover and decide pending duty exchanges.", color: "#9A3412", tint: "#FFF7ED", replacement: true,
    items: [
      { key: "leaveReplacement", title: "Leave replacement", note: "Required cover and optional assignments", icon: Users, to: "/crew/replacement?section=leave" },
      { key: "calendarCoverage", title: "Training & sports cover", note: "Review and assign cover from the calendar", icon: CalendarDays, to: "/crew/calendar?filter=coverage" },
      { key: "exchangeApproval", title: "Exchange approvals", note: "Pending acceptance, SIC or DIC decisions", icon: ArrowLeftRight, to: "/crew/replacement?section=duty&focus=approvals" },
    ],
  },
];

function Stage({ stage, actions, onOpen, checking }) {
  const total = stage.items.reduce((count, item) => count + (actions[item.key]?.pending || 0), 0);
  return <Box sx={{ minWidth: 0, p: { xs: 1.5, md: 2 }, border: stage.replacement ? "2px solid #F59E0B" : "1px solid #D9E6F2", borderTop: "5px solid " + stage.color, borderRadius: 3, background: stage.replacement ? "linear-gradient(160deg,#FFEDD5,#FFFBF5)" : "#FFF", boxShadow: "0 8px 28px rgba(15,23,42,.055)" }}>
    <Stack direction="row" justifyContent="space-between" spacing={1}>
      <Box><Typography sx={{ fontSize: 10.5, color: stage.color, fontWeight: 900, textTransform: "uppercase" }}>{stage.eyebrow}</Typography><Typography sx={{ mt: .4, fontSize: 19, color: "#0F172A", fontWeight: 900 }}>{stage.title}</Typography></Box>
      <Box sx={{ width: 34, height: 34, borderRadius: 2, display: "grid", placeItems: "center", color: stage.color, background: stage.tint, flexShrink: 0 }}>{stage.replacement ? <Users size={20} /> : <ClipboardList size={18} />}</Box>
    </Stack>
    <Typography sx={{ mt: .6, minHeight: 36, fontSize: 11.5, color: "#64748B" }}>{stage.description}</Typography>
    {total > 0 && <Chip size="small" color="warning" label={total + " awaiting your action"} sx={{ mt: .8, fontWeight: 900 }} />}
    <Stack spacing={1} sx={{ mt: 1.5 }}>
      {stage.items.map((item) => {
        const access = actions[item.key];
        const enabled = Boolean(access?.enabled);
        return <Tooltip key={item.key} title={enabled ? "" : checking ? "Checking your access…" : "Access has not been granted for this action."}>
          <span><Button fullWidth disabled={!enabled} onClick={() => enabled && onOpen(item.to)} aria-label={item.title + (access?.pending ? ", " + access.pending + " pending" : "")} sx={{ px: 1.1, py: 1, minHeight: 64, justifyContent: "flex-start", textAlign: "left", textTransform: "none", border: access?.pending ? "2px solid " + stage.color : "1px solid #CBD5E1", borderRadius: 2, color: "#0F172A", background: "#FFF", "&:hover": { borderColor: stage.color, background: stage.tint }, "&.Mui-disabled": { opacity: .48, filter: "grayscale(1)", color: "#64748B", background: "#F1F5F9", borderColor: "#CBD5E1" } }}>
            <Box sx={{ mr: 1, color: stage.color, flexShrink: 0 }}><item.icon size={18} /></Box>
            <Box sx={{ minWidth: 0, flex: 1 }}><Typography sx={{ fontSize: 12.5, fontWeight: 900 }}>{item.title}</Typography><Typography sx={{ mt: .2, fontSize: 10.3, color: "#64748B" }}>{enabled ? item.note : checking ? "Checking access…" : "Access not granted"}</Typography></Box>
            {enabled ? access.pending > 0 ? <Chip component="span" size="small" color="warning" label={access.pending} sx={{ ml: .5, fontWeight: 900 }} /> : <ChevronRight size={16} color="#94A3B8" /> : <LockKeyhole size={15} />}
          </Button></span>
        </Tooltip>;
      })}
    </Stack>
  </Box>;
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
      setSummary(null);
      setError(failure.response?.data?.detail || "Access and pending counts could not be loaded. Refresh to try again.");
    } finally { if (request === requestRef.current) setLoading(false); }
  }, []);
  useEffect(() => {
    setSummary(null);
    refresh();
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
          <Box><Typography sx={{ fontSize: 10.5, fontWeight: 900, textTransform: "uppercase", color: "#BFE0FF" }}>Crew management</Typography><Typography sx={{ mt: .3, fontSize: { xs: 22, md: 27 }, fontWeight: 900 }}>Application, Approval &amp; Replacement</Typography><Typography sx={{ mt: .55, fontSize: 12 }}>{user?.name || "Crew team"} · available actions follow your assigned rights.</Typography></Box>
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            <Button disabled={!actions.calendar?.enabled} startIcon={<CalendarDays size={16} />} onClick={() => navigate("/crew/calendar")} sx={{ background: "#FFF", color: "#073B75", fontWeight: 900, "&:hover": { background: "#EFF6FF" }, "&.Mui-disabled": { background: "#E2E8F0", opacity: .45 } }}>Open calendar</Button>
            <Button disabled={loading} startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <RefreshCw size={16} />} onClick={refresh} sx={{ color: "#FFF", border: "1px solid #FFFFFF99", "&.Mui-disabled": { color: "#FFFFFF99" } }}>Refresh</Button>
          </Stack>
        </Stack>
        <Box role="status" aria-live="polite" sx={{ mt: 1.5 }}>
          {summary ? <Chip label={summary.totalPending ? summary.totalPending + " pending · awaiting your action" : "No pending action for you"} sx={{ background: summary.totalPending ? "#FEF3C7" : "#D1FAE5", color: summary.totalPending ? "#92400E" : "#065F46", fontWeight: 900 }} /> : <Typography variant="body2">{loading ? "Checking permissions and pending requests…" : "Pending counts unavailable"}</Typography>}
        </Box>
      </Box>
      {error && <Alert severity="error" sx={{ mt: 1.5 }}>{error}</Alert>}
      <Box sx={{ mt: 1.5, display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2,minmax(0,1fr))", xl: "repeat(4,minmax(0,1fr))" }, gap: 1.3 }}>
        {stages.map((stage) => <Stage key={stage.title} stage={stage} actions={actions} onOpen={navigate} checking={loading && !summary} />)}
      </Box>
      <Typography sx={{ mt: 1.2, fontSize: 11, color: "#64748B" }}>Locked options are disabled. Counts refresh every minute and when you return to this window. Leave counts are duty dates; training, sports and exchange counts are requests.</Typography>
    </Box>
  </AppShell>;
}
