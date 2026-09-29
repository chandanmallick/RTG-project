import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Box, Button, Chip, CircularProgress, Stack, Tooltip, Typography } from "@mui/material";
import { ArrowLeftRight, CalendarDays, CheckCircle2, ChevronRight, ClipboardList, GraduationCap, LockKeyhole, Medal, RefreshCw, Settings2, Umbrella, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import AppShell from "../../components/layout/AppShell";
import { useAuth } from "../../auth/AuthContext";
import api from "../../crewLegacy/api";

const stages = [
  { id: "prepare", eyebrow: "01 · Prepare", title: "Master / event", color: "#6D28D9", tint: "#F5F3FF" },
  { id: "request", eyebrow: "02 · Request", title: "Application", color: "#0057B7", tint: "#EFF6FF" },
  { id: "decide", eyebrow: "03 · Decide", title: "Assignment / approval", color: "#047857", tint: "#ECFDF5" },
  { id: "cover", eyebrow: "04 · Arrange", title: "Replacement / cover", color: "#9A3412", tint: "#FFF7ED" },
];

const categories = [
  { id: "leave", title: "Leave", icon: Umbrella, color: "#0369A1", tint: "#F0F9FF", actions: {
    prepare: [{ key: "holidays", title: "Holiday calendar", note: "Maintain holidays and roster markings", icon: CalendarDays, to: "/crew/training?section=holiday" }],
    request: [{ key: "applyLeave", title: "Apply leave", note: "Leave and station leave", icon: Umbrella, to: "/crew/leave?section=apply" }],
    decide: [{ key: "leaveApproval", title: "Leave approvals", note: "Requests awaiting your decision", icon: CheckCircle2, to: "/crew/leave?section=pending" }, { key: "delegate", title: "Delegate approval", note: "Temporary reporting authority", icon: Settings2, to: "/crew/leave?section=delegation" }],
    cover: [{ key: "leaveReplacement", title: "Leave replacement", note: "Required and optional cover", icon: Users, to: "/crew/replacement?section=leave" }],
  }, reports: [{ stage: "request", key: "leaveTracking", title: "Leave tracking", note: "Search status, history and cancellation", icon: ClipboardList, to: "/crew/leave?section=tracking" }] },
  { id: "training", title: "Training", icon: GraduationCap, color: "#6D28D9", tint: "#F5F3FF", actions: {
    prepare: [{ key: "trainingEvents", title: "Training programmes", note: "Create, edit and publish", icon: GraduationCap, to: "/crew/training?section=training" }],
    request: [{ key: "requestTraining", title: "Request training", note: "Reporting hierarchy, then HR", icon: GraduationCap, to: "/crew/training?section=request" }],
    decide: [{ key: "trainingAssignment", title: "Training assignment", note: "Nominate eligible employees", icon: Users, to: "/crew/training?section=assign" }, { key: "trainingApproval", title: "Training / OFF approvals", note: "Current approval stage", icon: CheckCircle2, to: "/crew/training?section=pending" }],
    cover: [{ key: "calendarCoverage", title: "Training cover", note: "Review and assign from calendar", icon: CalendarDays, to: "/crew/calendar?filter=coverage" }],
  }, reports: [{ stage: "request", key: "myTraining", title: "My training", note: "Approved training and adjacent OFF", icon: CheckCircle2, to: "/crew/training?section=mytraining" }, { stage: "decide", key: "trainingHistory", title: "History & nomination matrix", note: "Attendance, search and nomination changes", icon: ClipboardList, to: "/crew/training?section=history" }] },
  { id: "sports", title: "Sports", icon: Medal, color: "#B45309", tint: "#FFF7ED", actions: {
    prepare: [{ key: "sportsEvents", title: "Sports events", note: "Create and publish events", icon: Medal, to: "/crew/sports?section=events" }],
    request: [{ key: "applySports", title: "Apply for sports", note: "Select an available event", icon: Medal, to: "/crew/sports?section=apply" }],
    decide: [{ key: "sportsApproval", title: "Sports approvals", note: "Requests at your approval stage", icon: CheckCircle2, to: "/crew/sports?section=approval" }],
    cover: [{ key: "calendarCoverage", title: "Sports cover", note: "Review and assign from calendar", icon: CalendarDays, to: "/crew/calendar?filter=coverage" }],
  }, reports: [{ stage: "request", key: "sportsTracking", title: "Sports tracking", note: "Applications, status and history", icon: ClipboardList, to: "/crew/sports?section=approval" }] },
  { id: "exchange", title: "Duty exchange", icon: ArrowLeftRight, color: "#0F766E", tint: "#F0FDFA", actions: {
    prepare: [],
    request: [{ key: "requestExchange", title: "Request duty exchange", note: "Select employee and affected duties", icon: ArrowLeftRight, to: "/crew/replacement?section=duty&mode=exchange" }],
    decide: [{ key: "exchangeApproval", title: "Exchange approvals", note: "Employee, SIC and DIC decisions", icon: CheckCircle2, to: "/crew/replacement?section=duty&focus=approvals" }],
    cover: [],
  }, reports: [{ stage: "request", key: "exchangeTracking", title: "Exchange tracking", note: "Request history and current stage", icon: ClipboardList, to: "/crew/replacement?section=duty&focus=history" }] },
];

const fallbackAccess = (item, actions) => actions[item.key]
  || (item.key === "trainingHistory" ? actions.trainingAssignment : undefined)
  || (item.key === "leaveTracking" ? actions.applyLeave : undefined)
  || (item.key === "sportsTracking" ? actions.applySports : undefined)
  || (item.key === "exchangeTracking" ? actions.requestExchange : undefined);

function ActionCard({ item, stage, actions, onOpen, checking, compact = false }) {
  const access = fallbackAccess(item, actions);
  const enabled = Boolean(access?.enabled);
  return <Tooltip title={enabled ? "" : checking ? "Checking your access…" : "Access has not been granted for this action."}>
    <span><Button fullWidth disabled={!enabled} onClick={() => enabled && onOpen(item.to)} aria-label={item.title + (access?.pending ? `, ${access.pending} pending` : "")} sx={{ px: 1, py: compact ? .7 : .9, minHeight: compact ? 48 : 57, justifyContent: "flex-start", textAlign: "left", textTransform: "none", border: access?.pending ? `2px solid ${stage.color}` : "1px solid #CBD5E1", borderRadius: 2, color: "#0F172A", background: compact ? stage.tint : "#FFF", "&:hover": { borderColor: stage.color, background: stage.tint }, "&.Mui-disabled": { opacity: .45, filter: "grayscale(1)", color: "#64748B", background: "#F1F5F9" } }}>
      <Box sx={{ mr: .8, color: stage.color, flexShrink: 0 }}><item.icon size={compact ? 15 : 17} /></Box>
      <Box sx={{ minWidth: 0, flex: 1 }}><Typography sx={{ fontSize: compact ? 11 : 12, fontWeight: 900 }}>{item.title}</Typography><Typography sx={{ mt: .1, fontSize: 9.5, color: "#64748B" }}>{enabled ? item.note : checking ? "Checking access…" : "Access not granted"}</Typography></Box>
      {enabled ? access.pending > 0 ? <Chip component="span" size="small" color="warning" label={access.pending} sx={{ ml: .4, fontWeight: 900 }} /> : <ChevronRight size={15} color="#94A3B8" /> : <LockKeyhole size={14} />}
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
      <Box sx={{ mt: 1.5, overflowX: "auto", pb: .5 }}>
        <Box sx={{ minWidth: 1120, display: "grid", gridTemplateColumns: "150px repeat(4,minmax(210px,1fr))", border: "1px solid #D9E6F2", borderRadius: 3, overflow: "hidden", background: "#FFF", boxShadow: "0 8px 28px rgba(15,23,42,.055)" }}>
          <Box sx={{ p: 1.4, bgcolor: "#0F172A", color: "#FFF", display: "flex", alignItems: "center" }}><Typography sx={{ fontSize: 11, fontWeight: 900 }}>CATEGORY ↓ / STAGE →</Typography></Box>
          {stages.map((stage) => <Box key={stage.id} sx={{ p: 1.4, borderLeft: "1px solid #D9E6F2", borderTop: `5px solid ${stage.color}`, bgcolor: stage.tint }}><Typography sx={{ fontSize: 9.5, color: stage.color, fontWeight: 900, textTransform: "uppercase" }}>{stage.eyebrow}</Typography><Typography sx={{ mt: .2, fontSize: 14, color: "#0F172A", fontWeight: 900 }}>{stage.title}</Typography></Box>)}
          {categories.map((category) => {
            const reportByStage = Object.fromEntries(stages.map((stage) => [stage.id, category.reports.filter((item) => item.stage === stage.id)]));
            return <Box key={category.id} sx={{ display: "contents" }}>
              <Box sx={{ p: 1.35, borderTop: "1px solid #D9E6F2", bgcolor: category.tint }}><Box sx={{ width: 36, height: 36, borderRadius: 2, display: "grid", placeItems: "center", color: category.color, bgcolor: "#FFF", border: `1px solid ${category.color}33` }}><category.icon size={19} /></Box><Typography sx={{ mt: .7, fontSize: 14, fontWeight: 950, color: category.color }}>{category.title}</Typography><Typography sx={{ fontSize: 9.5, color: "#64748B" }}>Workflow actions</Typography></Box>
              {stages.map((stage) => <Stack key={`${category.id}-${stage.id}`} spacing={.7} sx={{ minWidth: 0, p: 1, borderLeft: "1px solid #E2E8F0", borderTop: "1px solid #D9E6F2", bgcolor: stage.id === "cover" ? "#FFFCF7" : "#FFF" }}>{(category.actions[stage.id] || []).map((item) => <ActionCard key={`${category.id}-${item.key}`} item={item} stage={stage} actions={actions} onOpen={navigate} checking={loading && !summary} />)}{!(category.actions[stage.id] || []).length && <Typography sx={{ py: 2, textAlign: "center", color: "#CBD5E1", fontSize: 11 }}>—</Typography>}</Stack>)}
              <Box sx={{ p: 1.1, pl: 1.35, borderTop: "1px dashed #CBD5E1", bgcolor: "#F8FAFC" }}><Typography sx={{ fontSize: 10.5, fontWeight: 900, color: "#475569" }}>Reports &amp;<br />tracking</Typography></Box>
              {stages.map((stage) => <Stack key={`${category.id}-${stage.id}-reports`} spacing={.6} sx={{ minWidth: 0, p: .8, borderLeft: "1px solid #E2E8F0", borderTop: "1px dashed #CBD5E1", bgcolor: "#F8FAFC" }}>{reportByStage[stage.id].map((item) => <ActionCard compact key={`${category.id}-${item.key}-report`} item={item} stage={stage} actions={actions} onOpen={navigate} checking={loading && !summary} />)}{!reportByStage[stage.id].length && <Typography sx={{ py: 1, textAlign: "center", color: "#CBD5E1", fontSize: 10 }}>—</Typography>}</Stack>)}
            </Box>;
          })}
        </Box>
      </Box>
      <Typography sx={{ mt: 1.2, fontSize: 11, color: "#64748B" }}>Locked options are disabled. Counts refresh every minute and when you return to this window. Leave counts are duty dates; training, sports and exchange counts are requests.</Typography>
    </Box>
  </AppShell>;
}
