import { useEffect, useMemo, useRef, useState } from "react";
import dayjs from "dayjs";
import {
  Alert,
  Autocomplete,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  InputAdornment,
  Paper,
  Radio,
  RadioGroup,
  FormControlLabel,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  CalendarClock,
  ChevronDown,
  Clock3,
  Download,
  ExternalLink,
  File,
  FileImage,
  FilePlus2,
  Link2,
  MessageSquare,
  Paperclip,
  Plus,
  PencilLine,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Users,
} from "lucide-react";

import { useAuth } from "../../auth/AuthContext";
import api from "../../crewLegacy/api";

const initials = (name) => String(name || "U").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
const formatBytes = (value) => {
  const size = Number(value || 0);
  if (size < 1024) return `${size} B`;
  if (size < 1024 ** 2) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 ** 2).toFixed(1)} MB`;
};
const errorText = (error, fallback) => error?.response?.data?.detail || error?.message || fallback;
const officeProtocol = (link) => {
  const extension = String(link?.extension || link?.name?.split(".").pop() || "").toLowerCase();
  if (["doc", "docx"].includes(extension)) return "ms-word";
  if (["xls", "xlsx"].includes(extension)) return "ms-excel";
  if (["ppt", "pptx"].includes(extension)) return "ms-powerpoint";
  return "";
};

export default function CrewThreads() {
  const { user } = useAuth();
  const canWrite = user?.permissions?.crew_threads?.write !== false;

  const [threads, setThreads] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [messages, setMessages] = useState([]);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [postHeading, setPostHeading] = useState("");
  const [postAt, setPostAt] = useState(dayjs().format("YYYY-MM-DDTHH:mm"));
  const [postComposerOpen, setPostComposerOpen] = useState(false);
  const [files, setFiles] = useState([]);
  const [sharePointLinks, setSharePointLinks] = useState([]);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareName, setShareName] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const [options, setOptions] = useState({ employees: [], units: [], groups: [] });
  const [audienceMode, setAudienceMode] = useState("everyone");
  const [audienceEmployees, setAudienceEmployees] = useState([]);
  const [audienceUnits, setAudienceUnits] = useState([]);
  const [audienceGroups, setAudienceGroups] = useState([]);
  const [meetingAt, setMeetingAt] = useState(dayjs().add(15, "minute").format("YYYY-MM-DDTHH:mm"));
  const [draftFiles, setDraftFiles] = useState([]);
  const [expandedThreadId, setExpandedThreadId] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState(null);
  const [newOpen, setNewOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editMeetingAt, setEditMeetingAt] = useState("");
  const [savingMeeting, setSavingMeeting] = useState(false);
  const [editPost, setEditPost] = useState(null);
  const [editPostHeading, setEditPostHeading] = useState("");
  const [editPostText, setEditPostText] = useState("");
  const [editPostAt, setEditPostAt] = useState("");
  const [savingPost, setSavingPost] = useState(false);

  const fileRef = useRef(null);
  const draftFileRef = useRef(null);
  const messageEndRef = useRef(null);

  const selectedThread = useMemo(() => threads.find((item) => item.id === selectedId), [threads, selectedId]);
  const threadMoment = (thread) => dayjs(thread?.meetingAt || thread?.updatedAt || thread?.createdAt);

  const loadThreads = async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    try {
      const result = await api.get("/threads", { params: { search } });
      const next = result.data || [];
      setThreads(next);
      setSelectedId((current) => current && next.some((item) => item.id === current) ? current : next[0]?.id || "");
    } catch (error) {
      setNotice({ severity: "error", text: errorText(error, "Crew threads could not be loaded.") });
    } finally {
      if (!quiet) setLoading(false);
    }
  };

  const loadOptions = async () => {
    try {
      const result = await api.get("/threads/options");
      setOptions(result.data || { employees: [], units: [], groups: [] });
    } catch (error) {
      setNotice({ severity: "error", text: errorText(error, "Thread access options could not be loaded.") });
    }
  };

  const loadMessages = async (threadId = selectedId, { quiet = false } = {}) => {
    if (!threadId) {
      setMessages([]);
      return;
    }
    try {
      const result = await api.get(`/threads/${threadId}/messages`);
      setMessages(result.data || []);
      // Reading a thread updates its per-user marker on the server. Refresh the
      // board quietly so the unread badge disappears without affecting timeline order.
      if (!quiet) loadThreads({ quiet: true });
      if (!quiet) window.setTimeout(() => messageEndRef.current?.scrollIntoView({ block: "end" }), 30);
    } catch (error) {
      if (!quiet) setNotice({ severity: "error", text: errorText(error, "Messages could not be loaded.") });
    }
  };

  useEffect(() => { loadThreads(); loadOptions(); }, []);
  useEffect(() => { loadMessages(selectedId); }, [selectedId]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      loadThreads({ quiet: true });
      if (selectedId) loadMessages(selectedId, { quiet: true });
    }, 15000);
    return () => window.clearInterval(timer);
  }, [selectedId, search]);

  const createThread = async () => {
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const result = await api.post("/threads", {
        title: newTitle.trim(),
        description: newDescription.trim(),
        meetingAt: meetingAt ? new Date(meetingAt).toISOString() : null,
        audience: audienceMode === "everyone"
          ? { scope: "everyone" }
          : {
            scope: "restricted",
            employeeIds: audienceEmployees.map((item) => item.id),
            unitIds: audienceUnits.map((item) => item.id),
            groupNames: audienceGroups.map((item) => item.name),
          },
      });

      if (newDescription.trim() || draftFiles.length) {
        const form = new FormData();
        form.append("heading", newTitle.trim());
        form.append("text", newDescription.trim());
        form.append("meeting_at", meetingAt ? new Date(meetingAt).toISOString() : "");
        form.append("sharepoint_links", "[]");
        draftFiles.forEach((item) => form.append("files", item));
        await api.post(`/threads/${result.data.id}/messages`, form, { headers: { "Content-Type": "multipart/form-data" } });
      }

      setNewOpen(false);
      setNewTitle("");
      setNewDescription("");
      setMeetingAt(dayjs().add(15, "minute").format("YYYY-MM-DDTHH:mm"));
      setDraftFiles([]);
      setAudienceMode("everyone");
      setAudienceEmployees([]);
      setAudienceUnits([]);
      setAudienceGroups([]);
      if (draftFileRef.current) draftFileRef.current.value = "";
      await loadThreads({ quiet: true });
      setSelectedId(result.data.id);
    } catch (error) {
      setNotice({ severity: "error", text: errorText(error, "Thread could not be created.") });
    } finally {
      setCreating(false);
    }
  };

  const postMessage = async () => {
    if (!selectedId || !postHeading.trim() || (!message.trim() && !files.length && !sharePointLinks.length)) return;
    setSending(true);
    try {
      const form = new FormData();
      form.append("heading", postHeading.trim());
      form.append("text", message.trim());
      form.append("meeting_at", postAt ? new Date(postAt).toISOString() : "");
      form.append("sharepoint_links", JSON.stringify(sharePointLinks));
      files.forEach((item) => form.append("files", item));
      await api.post(`/threads/${selectedId}/messages`, form, { headers: { "Content-Type": "multipart/form-data" } });
      setMessage("");
      setPostHeading("");
      setPostAt(dayjs().format("YYYY-MM-DDTHH:mm"));
      setPostComposerOpen(false);
      setFiles([]);
      setSharePointLinks([]);
      if (fileRef.current) fileRef.current.value = "";
      await Promise.all([loadMessages(selectedId), loadThreads({ quiet: true })]);
    } catch (error) {
      setNotice({ severity: "error", text: errorText(error, "Message could not be posted.") });
    } finally {
      setSending(false);
    }
  };

  const addSharePointLink = () => {
    const url = shareUrl.trim();
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase();
      if (parsed.protocol !== "https:" || !(host === "sharepoint.com" || host.endsWith(".sharepoint.com"))) throw new Error();
    } catch {
      setNotice({ severity: "error", text: "Enter a secure SharePoint URL." });
      return;
    }
    setSharePointLinks((current) => [...current, { name: shareName.trim() || "SharePoint attachment", url }].slice(0, 10));
    setShareName("");
    setShareUrl("");
    setShareOpen(false);
  };

  const openSharePointLink = (link, inBrowser = false) => {
    const protocol = officeProtocol(link);
    if (!inBrowser && protocol) {
      window.location.href = `${protocol}:ofe|u|${link.url}`;
      return;
    }
    window.open(link.url, "_blank", "noopener,noreferrer");
  };

  const audienceLabel = (thread) => {
    const audience = thread?.audience || {};
    if (audience.scope !== "restricted") return "Everyone";
    const values = [
      ...(audience.employees || []).map((item) => item.name),
      ...(audience.units || []).map((item) => item.name),
      ...(audience.groups || []).map((item) => item.name),
    ];
    return values.slice(0, 2).join(", ") + (values.length > 2 ? ` +${values.length - 2}` : "");
  };

  const openMeetingEditor = () => {
    if (!selectedThread) return;
    const value = dayjs(selectedThread.meetingAt || selectedThread.updatedAt || selectedThread.createdAt);
    setEditMeetingAt(value.isValid() ? value.format("YYYY-MM-DDTHH:mm") : "");
    setEditOpen(true);
  };

  const saveMeetingEditor = async () => {
    if (!selectedThread) return;
    setSavingMeeting(true);
    try {
      await api.patch(`/threads/${selectedThread.id}`, {
        meetingAt: editMeetingAt ? new Date(editMeetingAt).toISOString() : null,
      });
      setEditOpen(false);
      await loadThreads({ quiet: true });
    } catch (error) {
      setNotice({ severity: "error", text: errorText(error, "Meeting date could not be updated.") });
    } finally {
      setSavingMeeting(false);
    }
  };

  const openPostEditor = (item) => {
    setEditPost(item);
    setEditPostHeading(item.heading || item.text?.split(/\r?\n/).find(Boolean)?.slice(0, 180) || "Post");
    setEditPostText(item.text || "");
    const value = dayjs(item.meetingAt || item.createdAt);
    setEditPostAt(value.isValid() ? value.format("YYYY-MM-DDTHH:mm") : "");
  };

  const savePostEditor = async () => {
    if (!editPost) return;
    setSavingPost(true);
    try {
      await api.patch(`/threads/messages/${editPost.id}`, {
        heading: editPostHeading,
        text: editPostText,
        meetingAt: editPostAt ? new Date(editPostAt).toISOString() : null,
      });
      setEditPost(null);
      if (selectedId) await loadMessages(selectedId);
      await loadThreads({ quiet: true });
    } catch (error) {
      setNotice({ severity: "error", text: errorText(error, "Post could not be updated.") });
    } finally {
      setSavingPost(false);
    }
  };

  const downloadAttachment = async (attachment) => {
    try {
      const result = await api.get(attachment.downloadUrl.replace("/api/crew", ""), { responseType: "blob" });
      const url = URL.createObjectURL(result.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = attachment.name || "attachment";
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setNotice({ severity: "error", text: errorText(error, "Attachment could not be downloaded.") });
    }
  };

  return (
    <Box sx={{ p: { xs: 1.5, md: 2.5 }, minHeight: "calc(100vh - 92px)", background: "#F4F7FB" }}>
      <Box sx={{ mb: 1.25, px: { xs: 1.75, md: 2.25 }, py: 1.15, color: "#fff", borderRadius: 3, background: "linear-gradient(105deg,#08103A 0%,#0057B7 62%,#1378DD 100%)" }}>
        <Stack direction={{ xs: "column", md: "row" }} alignItems={{ md: "center" }} justifyContent="space-between" gap={1.5}>
          <Box>
            <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 0.35 }}>
              <Chip size="small" icon={<CalendarClock size={12} />} label="Crew notices" sx={{ color: "#E8F2FF", bgcolor: "rgba(255,255,255,.14)", fontWeight: 900 }} />
            </Stack>
            <Typography sx={{ fontSize: 20, fontWeight: 950 }}>Crew Notices</Typography>
            <Typography sx={{ mt: 0.1, fontSize: 11.5, opacity: 0.9 }}>Publish dated notices, meeting notes and documents with audience control.</Typography>
          </Box>
          <Stack direction="row" spacing={0.75} alignItems="center">
            <Button onClick={() => { loadThreads(); if (selectedId) loadMessages(selectedId); }} startIcon={<RefreshCw size={14} />} sx={{ minHeight: 30, px: 1, py: 0.25, color: "#fff", border: "1px solid rgba(255,255,255,.55)", fontSize: 10.5, fontWeight: 850 }}>Refresh</Button>
            {canWrite && <Button variant="contained" onClick={() => setNewOpen(true)} startIcon={<Plus size={15} />} sx={{ minHeight: 30, px: 1.05, py: 0.25, bgcolor: "#fff", color: "#0057B7", fontSize: 10.5, fontWeight: 900, "&:hover": { bgcolor: "#EAF2FF" } }}>New notice</Button>}
          </Stack>
        </Stack>
      </Box>

      {notice && <Alert severity={notice.severity} onClose={() => setNotice(null)} sx={{ mb: 1.5 }}>{notice.text}</Alert>}

      <Paper elevation={0} sx={{ height: "calc(100vh - 230px)", minHeight: 580, display: "grid", gridTemplateColumns: { xs: "1fr", md: "390px minmax(0,1fr)" }, overflow: "hidden", border: "1px solid #D7E3F4", borderRadius: 3 }}>
        <Box sx={{ display: { xs: selectedId ? "none" : "flex", md: "flex" }, flexDirection: "column", minHeight: 0, borderRight: { md: "1px solid #D7E3F4" }, background: "linear-gradient(180deg,#FBFDFF 0%,#F7FAFE 100%)" }}>
          <Box sx={{ p: 1.5, pb: 1.1 }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} sx={{ mb: 1 }}>
              <Typography sx={{ fontSize: 13, fontWeight: 900, color: "#31577D", letterSpacing: ".02em", textTransform: "uppercase" }}>Notice board</Typography>
              <Chip size="small" label={`${threads.length} posts`} sx={{ height: 22, fontWeight: 850, bgcolor: "#EAF2FF", color: "#0057B7" }} />
            </Stack>
            <TextField fullWidth size="small" value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => event.key === "Enter" && loadThreads()} placeholder="Search notices" InputProps={{ startAdornment: <InputAdornment position="start"><Search size={16} /></InputAdornment> }} />
          </Box>
          <Divider />
          <Box sx={{ flex: 1, overflowY: "auto", p: 1.25 }}>
            <Box sx={{ pr: 0.5 }}>
              {threads.map((thread) => {
                const moment = threadMoment(thread);
                const preview = thread.lastMessage?.text || thread.description || "No message yet.";
                const isOpen = expandedThreadId === thread.id;
                const audienceText = thread.audience?.scope === "restricted" ? audienceLabel(thread) : "Everyone with access";
                return (
                  <Box key={thread.id} sx={{ pb: 1.35 }}>
                    <Paper
                      elevation={0}
                      onClick={() => setSelectedId(thread.id)}
                      sx={{
                        cursor: "pointer",
                        borderRadius: 4,
                        border: thread.id === selectedId ? "1px solid #5FA8FF" : "1px solid #D9E6F5",
                        background: thread.id === selectedId ? "linear-gradient(180deg,#FFFFFF 0%,#EEF6FF 100%)" : "#fff",
                        boxShadow: thread.id === selectedId ? "0 12px 35px rgba(0,87,183,.12)" : "0 10px 30px rgba(15,23,42,.04)",
                        overflow: "hidden",
                      }}
                    >
                      <Box sx={{ p: 1.35 }}>
                        <Stack direction="row" alignItems="flex-start" justifyContent="space-between" gap={1}>
                          <Box sx={{ minWidth: 0, flex: 1 }}>
                            <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 0.6, flexWrap: "wrap" }}>
                              <Chip size="small" icon={<Clock3 size={11} />} label={moment.format("DD MMM, HH:mm")} sx={{ height: 22, fontWeight: 900, bgcolor: "#EAF2FF", color: "#0057B7" }} />
                              <Chip size="small" label={thread.audience?.scope === "restricted" ? "Restricted" : "Open"} sx={{ height: 22, fontWeight: 900, bgcolor: thread.audience?.scope === "restricted" ? "#FFF4E5" : "#E8FAF1", color: thread.audience?.scope === "restricted" ? "#B45309" : "#047857" }} />
                              <Chip size="small" label={`${thread.messageCount || 0} notes`} sx={{ height: 22, fontWeight: 900, bgcolor: "#F4F7FB", color: "#475569" }} />
                              {thread.unreadCount > 0 && <Chip size="small" label={`${thread.unreadCount} new`} sx={{ height: 22, fontWeight: 900, bgcolor: "#FFE4E6", color: "#BE123C" }} />}
                            </Stack>
                            <Typography sx={{ fontSize: 15.5, fontWeight: 950, color: "#0F172A", lineHeight: 1.2 }}>{thread.title}</Typography>
                            <Typography sx={{ mt: 0.55, color: "#64748B", fontSize: 11.5, lineHeight: 1.45, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{preview}</Typography>
                          </Box>
                          <IconButton size="small" onClick={(event) => { event.stopPropagation(); setExpandedThreadId((current) => current === thread.id ? "" : thread.id); }} sx={{ color: "#0057B7", mt: -0.2 }}>
                            <ChevronDown size={17} style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.18s ease" }} />
                          </IconButton>
                        </Stack>
                        <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} sx={{ mt: 1.1 }}>
                          <Typography sx={{ fontSize: 10.5, fontWeight: 800, color: "#94A3B8" }}>By {thread.createdBy?.name || thread.createdBy?.employeeId || "Crew member"} · {audienceText}</Typography>
                          <Typography sx={{ fontSize: 10.5, fontWeight: 800, color: "#94A3B8" }}>{moment.format("ddd")}</Typography>
                        </Stack>
                      </Box>
                      <Collapse in={isOpen} timeout="auto" unmountOnExit>
                        <Box sx={{ px: 1.35, pb: 1.35, pt: 0, borderTop: "1px dashed #D9E6F5", background: "#FCFEFF" }}>
                          <Typography sx={{ fontSize: 12.2, color: "#334155", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
                            {thread.description || "No extra note provided."}
                          </Typography>
                          <Stack direction="row" gap={0.75} sx={{ mt: 1, flexWrap: "wrap" }}>
                            <Chip size="small" label={`Posted: ${moment.format("DD MMM YYYY, HH:mm")}`} sx={{ height: 22, fontWeight: 850, bgcolor: "#EFF6FF", color: "#1D4ED8" }} />
                            <Chip size="small" label={thread.meetingAt ? "Dated notice" : "Published notice"} sx={{ height: 22, fontWeight: 850, bgcolor: "#F8FAFC", color: "#475569" }} />
                          </Stack>
                        </Box>
                      </Collapse>
                    </Paper>
                  </Box>
                );
              })}
            </Box>
            {!threads.length && <Box sx={{ p: 3, textAlign: "center", color: "#64748B" }}>{loading ? <CircularProgress size={24} /> : "No notices found."}</Box>}
          </Box>
        </Box>
        <Box sx={{ display: { xs: selectedId ? "flex" : "none", md: "flex" }, flexDirection: "column", minWidth: 0, minHeight: 0, background: "#fff" }}>
          {selectedThread ? <>
            <Box sx={{ px: 2, py: 1.35, borderBottom: "1px solid #D7E3F4", background: "#fff" }}>
              <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography noWrap sx={{ color: "#0F172A", fontSize: 18, fontWeight: 950, letterSpacing: "-.02em" }}>{selectedThread.title}</Typography>
                  <Stack direction="row" alignItems="center" gap={0.75} sx={{ mt: 0.35, flexWrap: "wrap" }}>
                    <Chip size="small" icon={selectedThread.audience?.scope === "restricted" ? <ShieldCheck size={12} /> : <Users size={12} />} label={audienceLabel(selectedThread)} sx={{ height: 20, maxWidth: 260, fontSize: 9.5 }} />
                    <Chip size="small" icon={<CalendarClock size={12} />} label={threadMoment(selectedThread).format("DD MMM YYYY, HH:mm")} sx={{ height: 20, fontSize: 9.5, bgcolor: "#EAF2FF", color: "#0057B7", fontWeight: 850 }} />
                    <Button onClick={openMeetingEditor} startIcon={<PencilLine size={13} />} sx={{ height: 24, minWidth: 0, px: 1, fontSize: 10.5, fontWeight: 900, textTransform: "none", color: "#0057B7", border: "1px solid #CFE0F5", bgcolor: "#F8FBFF" }}>
                      Edit time
                    </Button>
                  </Stack>
                </Box>
                <Button onClick={() => setSelectedId("")} sx={{ display: { md: "none" }, minWidth: 0 }}>Back</Button>
              </Stack>
              <Box sx={{ mt: 1.15, px: 1.15, py: 0.85, borderRadius: 2.5, border: "1px solid #DCE8F7", background: "linear-gradient(180deg,#F8FBFF 0%,#FFFFFF 100%)" }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} sx={{ mb: 0.75 }}>
                  <Typography sx={{ fontSize: 11.5, fontWeight: 950, color: "#31577D", textTransform: "uppercase", letterSpacing: ".04em" }}>Thread timeline</Typography>
                  <Chip size="small" label={`${selectedThread.messageCount || 0} posts`} sx={{ height: 20, fontSize: 9.5, bgcolor: "#F8FAFC", color: "#475569", fontWeight: 850 }} />
                </Stack>
                <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
                  <Chip size="small" label={`Created ${dayjs(selectedThread.createdAt).format("DD MMM YYYY, HH:mm")}`} sx={{ height: 22, fontWeight: 850, bgcolor: "#F8FAFC", color: "#334155" }} />
                  <Chip size="small" label={`Updated ${dayjs(selectedThread.updatedAt).format("DD MMM YYYY, HH:mm")}`} sx={{ height: 22, fontWeight: 850, bgcolor: "#F8FAFC", color: "#334155" }} />
                </Stack>
              </Box>
            </Box>
            <Box sx={{ flex: 1, overflowY: "auto", p: { xs: 1.4, md: 2 }, position: "relative", background: "linear-gradient(#F8FAFD,#FFFFFF)", "&:before": { content: '\"\"', display: { xs: "none", sm: "block" }, position: "absolute", zIndex: 0, top: 26, bottom: 66, left: "50%", borderLeft: "2px solid #C9DDF2" } }}>
              {messages.map((item, index) => {
                const own = String(item.createdBy?.employeeId || "") === String(user?.employeeId || user?.userId || "");
                const title = item.heading || (item.text ? item.text.split(/\r?\n/).find(Boolean)?.slice(0, 90) || "Post" : (item.attachments?.length ? "Attachment post" : "Post"));
                const postMoment = dayjs(item.meetingAt || item.createdAt);
                const isRight = index % 2 === 0;
                return (
                  <Box key={item.id} sx={{ display: "grid", gridTemplateColumns: { xs: "58px minmax(0,1fr)", sm: "minmax(0,1fr) 42px minmax(0,1fr)" }, columnGap: 1.25, position: "relative", zIndex: 1, pb: 2.2 }}>
                    <Box sx={{ gridColumn: { xs: 1, sm: isRight ? 1 : 3 }, textAlign: { xs: "right", sm: isRight ? "right" : "left" }, pt: 0.5, pr: { xs: 0.25, sm: isRight ? 0.5 : 0 }, pl: { sm: isRight ? 0 : 0.5 } }}>
                      <Typography sx={{ color: "#172033", fontSize: { xs: 13, sm: 18 }, lineHeight: 1, fontWeight: 950 }}>{postMoment.format("DD")}</Typography>
                      <Typography sx={{ color: "#64748B", fontSize: 10.5, fontWeight: 900, textTransform: "uppercase" }}>{postMoment.format("MMM")}</Typography>
                      <Typography sx={{ display: { xs: "none", sm: "block" }, color: "#94A3B8", fontSize: 9.5 }}>{postMoment.format("HH:mm")}</Typography>
                    </Box>
                    <Box sx={{ gridColumn: { sm: 2 }, display: { xs: "none", sm: "block" }, position: "relative" }}>
                      <Box sx={{ position: "absolute", top: 8, left: "50%", transform: "translateX(-50%)", width: 16, height: 16, borderRadius: "50%", bgcolor: own ? "#0057B7" : "#00A39A", border: "3px solid #F3F8FF", boxShadow: "0 0 0 2px #78B7F5" }} />
                    </Box>
                    <Box sx={{ gridColumn: { xs: 2, sm: isRight ? 3 : 1 }, gridRow: 1, minWidth: 0 }}>
                        <Stack direction={isRight ? "row" : "row-reverse"} alignItems="center" gap={0.75} sx={{ mb: 0.5, flexWrap: "wrap" }}>
                          <Chip size="small" label={title} sx={{ height: 21, maxWidth: 220, bgcolor: own ? "#DDEBFF" : "#E7F8F5", color: own ? "#0057B7" : "#087A72", fontWeight: 900 }} />
                          {item.isUnread && <Chip size="small" label="New" sx={{ height: 21, bgcolor: "#FFE4E6", color: "#BE123C", fontWeight: 950 }} />}
                          <Typography sx={{ color: "#64748B", fontSize: 10.5, fontWeight: 800 }}>{postMoment.format("DD MMM YYYY, HH:mm")}</Typography>
                           <Typography sx={{ color: "#94A3B8", fontSize: 10.5 }}>·</Typography>
                          <Typography sx={{ color: "#64748B", fontSize: 10.5, fontWeight: 800 }}>{item.createdBy?.name || item.createdBy?.employeeId}</Typography>
                          <Avatar sx={{ width: 25, height: 25, ml: isRight ? "auto" : 0, mr: isRight ? 0 : "auto", bgcolor: own ? "#0057B7" : "#DCE8F5", color: own ? "#fff" : "#31577D", fontSize: 9, fontWeight: 900 }}>{initials(item.createdBy?.name)}</Avatar>
                          {canWrite && <IconButton size="small" onClick={() => openPostEditor(item)} sx={{ width: 25, height: 25, color: "#0057B7", border: "1px solid #CFE0F5" }}><PencilLine size={13} /></IconButton>}
                        </Stack>
                        <Box sx={{ px: 1.2, py: 0.95, border: "1px solid", borderColor: own ? "#B8D3F3" : "#BFD9F8", borderRadius: 2.5, background: own ? "#EAF3FF" : "#F3F8FF", boxShadow: "0 4px 14px rgba(15,23,42,.045)" }}>
                          <Typography sx={{ mb: 0.35, fontSize: 11.5, fontWeight: 900, color: "#334155" }}>{title}</Typography>
                          {item.text && <Typography sx={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", color: "#172033", fontSize: 13, lineHeight: 1.42 }}>{item.text}</Typography>}
                          {(item.attachments || []).length > 0 && (
                            <Stack direction="row" gap={0.75} sx={{ mt: 0.75, flexWrap: "wrap" }}>
                              {(item.attachments || []).map((attachment) => (
                                <Button
                                  key={attachment.id}
                                  onClick={() => downloadAttachment(attachment)}
                                  startIcon={attachment.isImage ? <FileImage size={16} /> : <File size={16} />}
                                  endIcon={<Download size={14} />}
                                  sx={{ minHeight: 30, px: 1, justifyContent: "flex-start", textTransform: "none", color: "#0057B7", bgcolor: "#F5F9FF", border: "1px solid #D6E6FA", overflow: "hidden" }}
                                >
                                  <Typography noWrap sx={{ fontSize: 10.5, fontWeight: 850 }}>{attachment.name}</Typography>
                                </Button>
                              ))}
                            </Stack>
                          )}
                          {(item.sharePointLinks || []).length > 0 && (
                            <Stack direction="row" gap={0.75} sx={{ mt: 0.75, flexWrap: "wrap" }}>
                              {(item.sharePointLinks || []).map((link) => (
                                <Chip
                                  key={link.id}
                                  size="small"
                                  icon={<Link2 size={12} />}
                                  label={link.name}
                                  onClick={() => openSharePointLink(link)}
                                  sx={{ height: 22, bgcolor: "#F2FBF8", color: "#087A5B", fontWeight: 850, cursor: "pointer" }}
                                />
                              ))}
                            </Stack>
                          )}
                        </Box>
                      </Box>
                    </Box>
                );
              })}
              {!messages.length && <Box sx={{ py: 8, textAlign: "center", color: "#64748B" }}><Users size={38} /><Typography sx={{ mt: 1, fontWeight: 850 }}>Start this crew discussion</Typography></Box>}
              <div ref={messageEndRef} />
            </Box>
            <Box sx={{ p: 1.5, borderTop: "1px solid #D7E3F4", background: "#fff" }}>
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: postComposerOpen ? 1.1 : 0 }}>
                <Typography sx={{ fontSize: 12, fontWeight: 900, color: "#31577D" }}>Add timeline post</Typography>
                <Button onClick={() => setPostComposerOpen((value) => !value)} disabled={!canWrite || sending} startIcon={<Plus size={15} />} sx={{ minHeight: 28, py: 0, textTransform: "none", fontSize: 11, fontWeight: 900 }}>
                  {postComposerOpen ? "Close" : "Add new post"}
                </Button>
              </Stack>
              <Collapse in={postComposerOpen}>
                <Stack direction={{ xs: "column", md: "row" }} gap={1} sx={{ mb: 1 }}>
                  <TextField size="small" fullWidth disabled={!canWrite || sending} label="Post heading" value={postHeading} onChange={(event) => setPostHeading(event.target.value)} inputProps={{ maxLength: 180 }} />
                  <TextField size="small" type="datetime-local" disabled={!canWrite || sending} label="Meeting / post time" value={postAt} onChange={(event) => setPostAt(event.target.value)} InputLabelProps={{ shrink: true }} sx={{ minWidth: { md: 230 } }} />
                </Stack>
              </Collapse>
              {(files.length > 0 || sharePointLinks.length > 0) && (
                <Stack direction="row" gap={0.75} flexWrap="wrap" sx={{ mb: 1 }}>
                  {files.map((item, index) => <Chip key={`${item.name}-${index}`} size="small" icon={<FilePlus2 size={13} />} label={`${item.name} (${formatBytes(item.size)})`} onDelete={() => setFiles((current) => current.filter((_, position) => position !== index))} />)}
                  {sharePointLinks.map((item, index) => <Chip key={`${item.url}-${index}`} size="small" color="success" variant="outlined" icon={<Link2 size={13} />} label={item.name} onDelete={() => setSharePointLinks((current) => current.filter((_, position) => position !== index))} />)}
                </Stack>
              )}
              <Stack direction="row" alignItems="flex-end" gap={1}>
                <Tooltip title="Attach text, PDF, Word, Excel, PowerPoint or image files"><span><IconButton disabled={!canWrite || sending} onClick={() => fileRef.current?.click()} sx={{ border: "1px solid #C7D7EA" }}><Paperclip size={19} /></IconButton></span></Tooltip>
                <Tooltip title="Attach a SharePoint link"><span><IconButton disabled={!canWrite || sending || sharePointLinks.length >= 10} onClick={() => setShareOpen(true)} sx={{ border: "1px solid #B9DCCD", color: "#087A5B" }}><Link2 size={19} /></IconButton></span></Tooltip>
                <input ref={fileRef} hidden multiple type="file" accept=".txt,.csv,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.gif,.webp,.bmp" onChange={(event) => setFiles(Array.from(event.target.files || []).slice(0, 10))} />
                <TextField fullWidth multiline minRows={postComposerOpen ? 3 : 1} maxRows={6} disabled={!canWrite || sending} value={message} onChange={(event) => setMessage(event.target.value)} placeholder={canWrite ? (postComposerOpen ? "Post description / detailed note" : "Click Add new post to enter heading, time and description") : "This page is read-only for your account"} />
                <Button variant="contained" disabled={!canWrite || sending || !postComposerOpen || !postHeading.trim() || (!message.trim() && !files.length && !sharePointLinks.length)} onClick={postMessage} startIcon={sending ? <CircularProgress size={15} color="inherit" /> : <Send size={17} />} sx={{ minHeight: 44, px: 2.25, bgcolor: "#0057B7", fontWeight: 900 }}>Publish</Button>
              </Stack>
            </Box>
          </> : <Box sx={{ flex: 1, display: "grid", placeItems: "center", color: "#64748B" }}><Box sx={{ textAlign: "center" }}><MessageSquare size={48} /><Typography sx={{ mt: 1, fontWeight: 900 }}>Select or create a crew notice</Typography></Box></Box>}
        </Box>
      </Paper>


      <Dialog open={editOpen} onClose={() => !savingMeeting && setEditOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ fontWeight: 950 }}>Edit meeting date & time</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              type="datetime-local"
              label="Meeting date & time"
              value={editMeetingAt}
              onChange={(event) => setEditMeetingAt(event.target.value)}
              InputLabelProps={{ shrink: true }}
              helperText="Updates the thread timeline timestamp."
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={savingMeeting} onClick={() => setEditOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={savingMeeting || !editMeetingAt} onClick={saveMeetingEditor}>{savingMeeting ? "Saving..." : "Save"}</Button>
        </DialogActions>
      </Dialog>
      <Dialog open={Boolean(editPost)} onClose={() => !savingPost && setEditPost(null)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 950 }}>Edit timeline post</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              autoFocus
              label="Post heading"
              value={editPostHeading}
              onChange={(event) => setEditPostHeading(event.target.value)}
              inputProps={{ maxLength: 180 }}
              helperText="Shown as the separate heading of this timeline card."
            />
            <TextField
              type="datetime-local"
              label="Meeting / post date & time"
              value={editPostAt}
              onChange={(event) => setEditPostAt(event.target.value)}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              multiline
              minRows={5}
              label="Post text"
              value={editPostText}
              onChange={(event) => setEditPostText(event.target.value)}
              inputProps={{ maxLength: 10000 }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={savingPost} onClick={() => setEditPost(null)}>Cancel</Button>
          <Button variant="contained" disabled={savingPost || !editPostHeading.trim()} onClick={savePostEditor}>{savingPost ? "Saving..." : "Save post"}</Button>
        </DialogActions>
      </Dialog>
      <Dialog open={newOpen} onClose={() => !creating && setNewOpen(false)} fullWidth maxWidth="md">
        <DialogTitle sx={{ fontWeight: 950 }}>Create crew notice</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField autoFocus label="Notice title" value={newTitle} onChange={(event) => setNewTitle(event.target.value)} inputProps={{ maxLength: 160 }} />
            <TextField
              type="datetime-local"
              label="Meeting date & time"
              value={meetingAt}
              onChange={(event) => setMeetingAt(event.target.value)}
              InputLabelProps={{ shrink: true }}
              helperText="This timestamp drives the timeline order."
            />
            <TextField
              multiline
              minRows={4}
              label="Expandable note / agenda"
              value={newDescription}
              onChange={(event) => setNewDescription(event.target.value)}
              inputProps={{ maxLength: 1000 }}
              helperText="Use this for the full note, agenda or instructions. It appears expanded in the timeline card."
            />
            <Box>
              <Typography sx={{ mb: 0.5, fontSize: 12, fontWeight: 900 }}>Add documents for this notice</Typography>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: "wrap" }}>
                <Button variant="outlined" startIcon={<Paperclip size={16} />} onClick={() => draftFileRef.current?.click()} sx={{ textTransform: "none", fontWeight: 900 }}>Upload file(s)</Button>
                <Button variant="text" onClick={() => setDraftFiles([])} disabled={!draftFiles.length} sx={{ textTransform: "none", fontWeight: 900 }}>Clear files</Button>
                <input
                  ref={draftFileRef}
                  hidden
                  multiple
                  type="file"
                  accept=".txt,.csv,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.gif,.webp,.bmp"
                  onChange={(event) => setDraftFiles(Array.from(event.target.files || []).slice(0, 10))}
                />
              </Stack>
              {draftFiles.length > 0 && (
                <Stack direction="row" gap={0.75} flexWrap="wrap" sx={{ mt: 1 }}>
                  {draftFiles.map((item, index) => (
                    <Chip
                      key={`${item.name}-${index}`}
                      size="small"
                      icon={<FilePlus2 size={13} />}
                      label={`${item.name} (${formatBytes(item.size)})`}
                      onDelete={() => setDraftFiles((current) => current.filter((_, position) => position !== index))}
                    />
                  ))}
                </Stack>
              )}
            </Box>
            <Box>
              <Typography sx={{ mb: 0.5, fontSize: 12, fontWeight: 900 }}>Who can access this notice?</Typography>
              <RadioGroup row value={audienceMode} onChange={(event) => setAudienceMode(event.target.value)}>
                <FormControlLabel value="everyone" control={<Radio size="small" />} label="Everyone with access" />
                <FormControlLabel value="restricted" control={<Radio size="small" />} label="Selected audience" />
              </RadioGroup>
            </Box>
            {audienceMode === "restricted" && (
              <Stack spacing={1.25}>
                <Autocomplete multiple options={options.employees} value={audienceEmployees} onChange={(_, value) => setAudienceEmployees(value)} isOptionEqualToValue={(option, value) => option.id === value.id} getOptionLabel={(option) => `${option.name}${option.designation ? ` — ${option.designation}` : ""}`} renderInput={(params) => <TextField {...params} label="Employees" placeholder="Search employee" />} />
                <Autocomplete multiple options={options.units} value={audienceUnits} onChange={(_, value) => setAudienceUnits(value)} isOptionEqualToValue={(option, value) => option.id === value.id} getOptionLabel={(option) => `${option.name} (${option.type})`} renderInput={(params) => <TextField {...params} label="Department / Vertical / Section / Function" placeholder="Search organization unit" />} />
                <Autocomplete multiple options={options.groups} value={audienceGroups} onChange={(_, value) => setAudienceGroups(value)} isOptionEqualToValue={(option, value) => option.name === value.name} getOptionLabel={(option) => option.name} renderInput={(params) => <TextField {...params} label="Shift groups" placeholder="Search shift group" />} />
              </Stack>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={creating} onClick={() => setNewOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={creating || newTitle.trim().length < 3} onClick={createThread}>{creating ? "Creating..." : "Publish notice"}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={shareOpen} onClose={() => setShareOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1, fontWeight: 950 }}><Link2 size={20} /> Attach from SharePoint</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Alert severity="info">Paste the SharePoint sharing link. Word, Excel and PowerPoint links can open directly in their desktop apps.</Alert>
            <TextField label="Document name" value={shareName} onChange={(event) => setShareName(event.target.value)} helperText="Include .docx, .xlsx or .pptx when the sharing URL does not show the extension." />
            <TextField autoFocus label="SharePoint link" value={shareUrl} onChange={(event) => setShareUrl(event.target.value)} placeholder="https://...sharepoint.com/..." />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShareOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={!shareUrl.trim()} onClick={addSharePointLink}>Attach link</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
