import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  Alert,
  Badge,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Popover,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { Bell, Check, Clock3, RefreshCw, User2, X } from "lucide-react";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

const authConfig = () => {
  const token = localStorage.getItem("portalToken");
  const employeeId = localStorage.getItem("crewEmployeeId") || localStorage.getItem("employeeId");
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (employeeId) headers["X-Crew-Employee-ID"] = employeeId;
  return { headers };
};

const displayStatus = (status) => status === "Denied" ? "Declined" : (status || "Pending");
const statusPalette = (status) => ({
  Pending: { background: "#FFF4CC", color: "#8A4B00", border: "#E8D184" },
  Accepted: { background: "#E7F6E9", color: "#166534", border: "#A9DDB2" },
  Denied: { background: "#FDE8EC", color: "#C62828", border: "#F3A8B3" },
  Declined: { background: "#FDE8EC", color: "#C62828", border: "#F3A8B3" },
  Superseded: { background: "#ECEFF3", color: "#475569", border: "#C9D0D9" },
})[status] || { background: "#EEF2F7", color: "#475569", border: "#D7E0EA" };

const formatDate = (value, options) => {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-IN", options).format(parsed);
};

const dutyDate = (value) => {
  if (!value) return "—";
  const [year, month, day] = String(value).split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(year, month - 1, day));
};

function useDutyNotifications(pollMilliseconds = 60000) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const [replacementResponse, generalResponse] = await Promise.all([
        axios.get(`${BASE_URL}/crew/replacement/notifications`, authConfig()),
        axios.get(`${BASE_URL}/crew/notifications/`, authConfig()),
      ]);
      const replacements = (replacementResponse.data || []).filter((item) => item.leaveId && item.assignedDuty);
      const general = (generalResponse.data || []).map((item) => ({ ...item, notificationKind: item.notificationKind || "general" }));
      setNotifications([...replacements, ...general]);
      setError("");
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Unable to load duty notifications.");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(() => refresh(true), pollMilliseconds);
    return () => window.clearInterval(timer);
  }, [pollMilliseconds, refresh]);

  return { notifications, loading, error, refresh };
}

function DutyNotificationItems({ notifications, loading, error, refresh, limit = 5, dense = false }) {
  const [selected, setSelected] = useState(null);
  const [reason, setReason] = useState("");
  const [workingId, setWorkingId] = useState("");
  const [actionError, setActionError] = useState("");

  const ordered = useMemo(() => [...notifications].sort((left, right) => {
    const leftAction = left.canAccept || left.canDeny ? 1 : 0;
    const rightAction = right.canAccept || right.canDeny ? 1 : 0;
    if (leftAction !== rightAction) return rightAction - leftAction;
    if (Boolean(left.unread) !== Boolean(right.unread)) return left.unread ? -1 : 1;
    return new Date(right.createdAt || 0) - new Date(left.createdAt || 0);
  }).slice(0, limit), [limit, notifications]);

  const accept = async (notification) => {
    setWorkingId(notification._id);
    setActionError("");
    try {
      await axios.put(`${BASE_URL}/crew/replacement/notifications/accept/${notification._id}`, {}, authConfig());
      await refresh(true);
    } catch (requestError) {
      setActionError(requestError.response?.data?.detail || "Duty could not be accepted.");
    } finally {
      setWorkingId("");
    }
  };

  const markRead = async (notification, navigatePath = "") => {
    setWorkingId(notification._id);
    setActionError("");
    try {
      await axios.put(`${BASE_URL}/crew/notifications/read/${notification._id}`, {}, authConfig());
      await refresh(true);
      if (navigatePath) window.location.assign(navigatePath);
    } catch (requestError) {
      setActionError(requestError.response?.data?.detail || "Notification could not be marked as read.");
    } finally {
      setWorkingId("");
    }
  };

  const decline = async () => {
    if (!selected || !reason.trim()) return;
    setWorkingId(selected._id);
    setActionError("");
    try {
      await axios.put(
        `${BASE_URL}/crew/replacement/notifications/deny/${selected._id}`,
        { reason: reason.trim() },
        authConfig(),
      );
      setSelected(null);
      setReason("");
      await refresh(true);
    } catch (requestError) {
      setActionError(requestError.response?.data?.detail || "Duty could not be declined.");
    } finally {
      setWorkingId("");
    }
  };

  if (loading) return <Box sx={{ py: 4, display: "grid", placeItems: "center" }}><CircularProgress size={25} /></Box>;
  if (error) return <Alert severity="error" action={<IconButton size="small" onClick={() => refresh()}><RefreshCw size={15} /></IconButton>}>{error}</Alert>;
  if (!ordered.length) return <Box sx={{ py: 3, textAlign: "center", color: "#64748B", fontSize: 12, fontWeight: 700 }}>No notification.</Box>;

  return (
    <>
      {actionError && <Alert severity="error" sx={{ mb: 1 }}>{actionError}</Alert>}
      <Box sx={{ display: "grid", gap: dense ? 0.8 : 1.1 }}>
        {ordered.map((notification) => {
          if (notification.notificationKind !== "replacement") {
            return (
              <Box key={notification._id} sx={{ p: dense ? 1.1 : 1.4, borderRadius: 2.5, border: notification.unread ? "1px solid #F3A8B3" : "1px solid #D7E4F6", borderLeft: notification.unread ? "4px solid #DC2626" : "1px solid #D7E4F6", background: notification.unread ? "#FFF7F8" : "#FFFFFF" }}>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ color: "#08103A", fontSize: dense ? 13.5 : 14, lineHeight: 1.3, fontWeight: 900 }}>{notification.title || "Leave notification"}</Typography>
                    <Typography sx={{ color: "#334155", fontSize: dense ? 11.8 : 12.2, lineHeight: 1.55, mt: .55, whiteSpace: "pre-line" }}>{notification.message || "A leave record was updated."}</Typography>
                    <Typography sx={{ color: "#64748B", fontSize: 10.8, fontWeight: 650, mt: .7 }}>{formatDate(notification.createdAt, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</Typography>
                  </Box>
                  <Chip label={String(notification.type || "GENERAL").toUpperCase()} size="small" color={notification.type === "LEAVE" ? "error" : "default"} sx={{ height: 22, fontSize: 9.5, fontWeight: 900 }} />
                </Stack>
                <Stack direction="row" spacing={.8} sx={{ mt: 1 }}>
                  {notification.action === "VIEW_LEAVE" && <Button size="small" variant="outlined" onClick={() => markRead(notification, "/crew/leave")} disabled={workingId === notification._id} sx={{ fontWeight: 900, fontSize: 11.5 }}>View leave</Button>}
                  {notification.action === "VIEW_CALENDAR" && <Button size="small" variant="outlined" onClick={() => markRead(notification, "/crew/calendar")} disabled={workingId === notification._id} sx={{ fontWeight: 900, fontSize: 11.5 }}>View calendar</Button>}
                  {notification.unread && <Button size="small" onClick={() => markRead(notification)} disabled={workingId === notification._id} sx={{ fontWeight: 850, fontSize: 11.5 }}>Mark read</Button>}
                </Stack>
              </Box>
            );
          }
          const palette = statusPalette(notification.status);
          return (
            <Box key={notification._id} sx={{ p: dense ? 1.1 : 1.4, borderRadius: 2.5, border: "1px solid #D7E4F6", background: "#FFFFFF" }}>
              <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ color: "#08103A", fontSize: dense ? 13.5 : 14, lineHeight: 1.3, fontWeight: 900 }}>
                    {notification.assignedDuty || "Replacement duty"} · {dutyDate(notification.date)}
                  </Typography>
                  <Typography sx={{ color: "#475569", fontSize: 11.5, mt: 0.35 }}>
                    {notification.groupName || "—"} · {notification.assignmentMode || "normal"}
                  </Typography>
                </Box>
                <Chip label={displayStatus(notification.status)} size="small" sx={{ height: 22, fontSize: 10, fontWeight: 900, ...palette, border: `1px solid ${palette.border}` }} />
              </Stack>

              {notification.viewerRole === "Controlling Officer" && (
                <Typography sx={{ mt: 0.7, color: "#334155", fontSize: 11.8, display: "flex", gap: 0.6, alignItems: "center" }}>
                  <User2 size={12} /> Assigned to {notification.employeeName || notification.employeeId}
                </Typography>
              )}
              {notification.cutoffTime && notification.status === "Pending" && (
                <Typography sx={{ mt: 0.65, color: "#475569", fontSize: 11.5, display: "flex", gap: 0.6, alignItems: "center" }}>
                  <Clock3 size={12} /> Auto-accept cutoff: {formatDate(notification.cutoffTime, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                </Typography>
              )}
              {notification.reason && <Typography sx={{ mt: 0.6, color: "#C62828", fontSize: 10.5, fontWeight: 700 }}>Reason: {notification.reason}</Typography>}

              {(notification.canAccept || notification.canDeny || notification.unread) && (
                <Stack direction="row" spacing={0.8} sx={{ mt: 1 }}>
                  {notification.canAccept && (
                    <Button size="small" variant="contained" startIcon={<Check size={13} />} disabled={workingId === notification._id} onClick={() => accept(notification)} sx={{ bgcolor: "#008645", fontWeight: 900, fontSize: 10.5 }}>
                      Accept
                    </Button>
                  )}
                  {notification.canDeny && (
                    <Button size="small" variant="outlined" color="error" startIcon={<X size={13} />} disabled={workingId === notification._id} onClick={() => { setSelected(notification); setReason(""); }} sx={{ fontWeight: 900, fontSize: 10.5 }}>
                      Decline
                    </Button>
                  )}
                  {notification.unread && (
                    <Button size="small" onClick={() => markRead(notification)} disabled={workingId === notification._id} sx={{ fontWeight: 800, fontSize: 10.5 }}>Mark read</Button>
                  )}
                </Stack>
              )}
            </Box>
          );
        })}
      </Box>

      <Dialog open={Boolean(selected)} onClose={() => setSelected(null)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ fontWeight: 900 }}>Decline replacement duty</DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 1.5, color: "#475569", fontSize: 12 }}>
            {selected?.assignedDuty || "Duty"} on {dutyDate(selected?.date)}. The decision and reason will be recorded.
          </Typography>
          <TextField autoFocus fullWidth multiline minRows={3} label="Reason for declining" value={reason} onChange={(event) => setReason(event.target.value)} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelected(null)}>Cancel</Button>
          <Button color="error" variant="contained" disabled={!reason.trim() || workingId === selected?._id} onClick={decline}>Confirm decline</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

export function DutyNotificationBell() {
  const { notifications, loading, error, refresh } = useDutyNotifications();
  const [anchor, setAnchor] = useState(null);
  const actionable = notifications.filter((item) => item.canAccept || item.canDeny).length;
  const unread = notifications.filter((item) => item.unread).length;
  const alertCount = Math.max(unread, actionable);
  const hasAlert = alertCount > 0;

  return (
    <>
      <IconButton
        aria-label="Duty notifications"
        onClick={(event) => setAnchor(event.currentTarget)}
        sx={{ color: hasAlert ? "#DC2626" : "#64748B", p: 1.1, backgroundColor: hasAlert ? "#FFF1F2" : "#F8FAFC", border: hasAlert ? "1px solid #F3A8B3" : "1px solid #E2E8F0", borderRadius: "12px", "&:hover": { color: hasAlert ? "#B91C1C" : "#03624C", backgroundColor: hasAlert ? "#FFE4E6" : "#F1F7F6" } }}
      >
        <Badge color="error" badgeContent={alertCount} max={99} invisible={!hasAlert}><Bell size={18} /></Badge>
      </IconButton>
      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{ paper: { sx: { mt: 1, width: "min(430px, calc(100vw - 24px))", maxHeight: "76vh", p: 1.5, borderRadius: 3 } } }}
      >
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.2 }}>
          <Box>
            <Typography sx={{ color: "#08103A", fontSize: 15, fontWeight: 950 }}>Notifications</Typography>
            <Typography sx={{ color: "#64748B", fontSize: 10.5 }}>{unread} unread · {actionable} action{actionable === 1 ? "" : "s"} pending</Typography>
          </Box>
          <IconButton size="small" onClick={() => refresh()}><RefreshCw size={15} /></IconButton>
        </Stack>
        <DutyNotificationItems notifications={notifications} loading={loading} error={error} refresh={refresh} limit={8} dense />
      </Popover>
    </>
  );
}

export function DutyNotificationBoard({ limit = 2 }) {
  const state = useDutyNotifications();
  const ordered = useMemo(() => [...state.notifications].sort((left, right) => {
    if (Boolean(left.unread) !== Boolean(right.unread)) return left.unread ? -1 : 1;
    return new Date(right.createdAt || 0) - new Date(left.createdAt || 0);
  }), [state.notifications]);
  const visible = ordered.slice(0, Math.min(limit, 2));
  const remaining = Math.max(0, ordered.length - visible.length);

  const destination = (notification) => {
    if (notification.notificationKind === "replacement") return "/crew/replacement";
    if (notification.action === "VIEW_CALENDAR") return "/crew/calendar";
    return "/crew/leave";
  };

  return (
    <Box sx={{ mt: 1, pt: .75, width: "100%", minWidth: 0, maxWidth: "100%", overflow: "hidden", borderTop: "1px solid #E2E8F0" }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: .55 }}>
        <Box>
          <Typography sx={{ color: "#08103A", fontSize: 12.5, fontWeight: 950 }}>Crew Notifications</Typography>
        </Box>
        <IconButton size="small" onClick={() => state.refresh()} sx={{ p: .35 }}><RefreshCw size={13} /></IconButton>
      </Stack>

      {state.loading && <Box sx={{ py: 1, display: "grid", placeItems: "center" }}><CircularProgress size={18} /></Box>}
      {!state.loading && state.error && <Alert severity="error" sx={{ py: 0, fontSize: 11 }}>{state.error}</Alert>}
      {!state.loading && !state.error && (
        <Stack spacing={.4} sx={{ minWidth: 0, maxWidth: "100%" }}>
          {visible.map((notification) => {
            const isLeave = notification.notificationKind !== "replacement";
            const summary = isLeave
              ? `${notification.title || "Leave update"} · ${String(notification.message || "").replace(/\s+/g, " ").trim()}`
              : `${notification.assignedDuty || "Replacement duty"} · ${dutyDate(notification.date)} · ${displayStatus(notification.status)}`;
            return (
              <Box
                key={notification._id}
                role="link"
                tabIndex={0}
                onClick={() => window.location.assign(destination(notification))}
                onKeyDown={(event) => { if (event.key === "Enter") window.location.assign(destination(notification)); }}
                sx={{
                  width: "100%",
                  minWidth: 0,
                  height: 28,
                  px: .8,
                  display: "flex",
                  alignItems: "center",
                  gap: .7,
                  borderRadius: 1.5,
                  border: notification.unread ? "1px solid #FECDD3" : "1px solid #E2E8F0",
                  borderLeft: notification.unread ? "3px solid #DC2626" : "3px solid #CBD5E1",
                  background: notification.unread ? "#FFF7F8" : "#FFFFFF",
                  cursor: "pointer",
                  "&:hover": { background: "#F8FAFC", borderColor: "#93C5FD" },
                }}
              >
                <Typography title={summary} sx={{ minWidth: 0, width: 0, flex: "1 1 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#334155", fontSize: 10.2, fontWeight: notification.unread ? 800 : 650 }}>
                  {summary}
                </Typography>
                <Chip label={isLeave ? "LEAVE" : displayStatus(notification.status)} size="small" sx={{ flexShrink: 0, height: 19, color: isLeave ? "#B91C1C" : "#0057B7", background: isLeave ? "#FEE2E2" : "#E8F1FB", fontSize: 8.5, fontWeight: 900 }} />
              </Box>
            );
          })}
          {!visible.length && <Typography sx={{ py: .8, color: "#64748B", fontSize: 10.8 }}>No notification.</Typography>}
          {remaining > 0 && (
            <Button
              size="small"
              onClick={() => window.location.assign("/crew/leave")}
              sx={{ alignSelf: "flex-start", minHeight: 20, p: 0, textTransform: "none", color: "#0057B7", fontSize: 10, fontWeight: 900 }}
            >
              +{remaining} more — open Leave module
            </Button>
          )}
        </Stack>
      )}
    </Box>
  );
}
