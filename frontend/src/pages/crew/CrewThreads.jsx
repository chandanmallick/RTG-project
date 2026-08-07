import { useEffect, useMemo, useRef, useState } from "react";
import dayjs from "dayjs";
import {
  Alert, Autocomplete, Avatar, Box, Button, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, IconButton, InputAdornment, List,
  ListItemButton, Paper, Radio, RadioGroup, FormControlLabel, Stack, TextField, Tooltip, Typography,
} from "@mui/material";
import {
  Building2, Download, ExternalLink, File, FileImage, FilePlus2, Link2,
  MessageSquare, Paperclip, Plus, RefreshCw, Search, Send, ShieldCheck, Users,
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
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState(null);
  const [newOpen, setNewOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const fileRef = useRef(null);
  const messageEndRef = useRef(null);
  const selectedThread = useMemo(() => threads.find((item) => item.id === selectedId), [threads, selectedId]);

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
        audience: audienceMode === "everyone" ? { scope: "everyone" } : {
          scope: "restricted",
          employeeIds: audienceEmployees.map((item) => item.id),
          unitIds: audienceUnits.map((item) => item.id),
          groupNames: audienceGroups.map((item) => item.name),
        },
      });
      setNewOpen(false);
      setNewTitle("");
      setNewDescription("");
      setAudienceMode("everyone");
      setAudienceEmployees([]);
      setAudienceUnits([]);
      setAudienceGroups([]);
      await loadThreads({ quiet: true });
      setSelectedId(result.data.id);
    } catch (error) {
      setNotice({ severity: "error", text: errorText(error, "Thread could not be created.") });
    } finally {
      setCreating(false);
    }
  };

  const postMessage = async () => {
    if (!selectedId || (!message.trim() && !files.length)) return;
    setSending(true);
    try {
      const form = new FormData();
      form.append("text", message.trim());
      form.append("sharepoint_links", JSON.stringify(sharePointLinks));
      files.forEach((item) => form.append("files", item));
      await api.post(`/threads/${selectedId}/messages`, form, { headers: { "Content-Type": "multipart/form-data" } });
      setMessage("");
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
      <Box sx={{ mb: 2, px: { xs: 2, md: 3 }, py: 2.2, color: "#fff", borderRadius: 4, background: "linear-gradient(105deg,#08103A 0%,#0057B7 62%,#1378DD 100%)" }}>
        <Stack direction={{ xs: "column", md: "row" }} alignItems={{ md: "center" }} justifyContent="space-between" gap={1.5}>
          <Box>
            <Typography sx={{ fontSize: 25, fontWeight: 950 }}>Crew Threads</Typography>
            <Typography sx={{ mt: .25, fontSize: 12.5, opacity: .9 }}>Discuss operations and share documents with the crew team.</Typography>
          </Box>
          <Stack direction="row" spacing={1}>
            <Button onClick={() => { loadThreads(); if (selectedId) loadMessages(selectedId); }} startIcon={<RefreshCw size={16} />} sx={{ color: "#fff", border: "1px solid rgba(255,255,255,.55)", fontWeight: 850 }}>Refresh</Button>
            {canWrite && <Button variant="contained" onClick={() => setNewOpen(true)} startIcon={<Plus size={17} />} sx={{ bgcolor: "#fff", color: "#0057B7", fontWeight: 900, "&:hover": { bgcolor: "#EAF2FF" } }}>New thread</Button>}
          </Stack>
        </Stack>
      </Box>

      {notice && <Alert severity={notice.severity} onClose={() => setNotice(null)} sx={{ mb: 1.5 }}>{notice.text}</Alert>}

      <Paper elevation={0} sx={{ height: "calc(100vh - 230px)", minHeight: 580, display: "grid", gridTemplateColumns: { xs: "1fr", md: "330px minmax(0,1fr)" }, overflow: "hidden", border: "1px solid #D7E3F4", borderRadius: 3 }}>
        <Box sx={{ display: { xs: selectedId ? "none" : "flex", md: "flex" }, flexDirection: "column", minHeight: 0, borderRight: { md: "1px solid #D7E3F4" }, background: "#FBFDFF" }}>
          <Box sx={{ p: 1.5 }}>
            <TextField fullWidth size="small" value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => event.key === "Enter" && loadThreads()} placeholder="Search threads" InputProps={{ startAdornment: <InputAdornment position="start"><Search size={16} /></InputAdornment> }} />
          </Box>
          <Divider />
          <List disablePadding sx={{ flex: 1, overflowY: "auto" }}>
            {threads.map((thread) => (
              <ListItemButton key={thread.id} selected={thread.id === selectedId} onClick={() => setSelectedId(thread.id)} sx={{ alignItems: "flex-start", gap: 1.25, px: 1.5, py: 1.25, borderBottom: "1px solid #EDF2F7", "&.Mui-selected": { bgcolor: "#EAF2FF", boxShadow: "inset 3px 0 #0057B7" } }}>
                <Avatar sx={{ width: 36, height: 36, bgcolor: thread.id === selectedId ? "#0057B7" : "#E3ECF7", color: thread.id === selectedId ? "#fff" : "#31577D" }}><MessageSquare size={17} /></Avatar>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography noWrap sx={{ color: "#0F172A", fontSize: 13.5, fontWeight: 900 }}>{thread.title}</Typography>
                  <Typography noWrap sx={{ mt: .25, color: "#64748B", fontSize: 11 }}>{thread.lastMessage?.text || thread.description || "No messages yet"}</Typography>
                  <Stack direction="row" alignItems="center" justifyContent="space-between" gap={.5} sx={{ mt: .6 }}><Typography noWrap sx={{ color: "#94A3B8", fontSize: 9.5 }}>{thread.audience?.scope === "restricted" ? `Restricted · ${audienceLabel(thread)}` : (thread.updatedAt ? dayjs(thread.updatedAt).format("DD MMM, HH:mm") : "")}</Typography><Chip size="small" label={thread.messageCount || 0} sx={{ height: 18, fontSize: 9, fontWeight: 850 }} /></Stack>
                </Box>
              </ListItemButton>
            ))}
            {!threads.length && <Box sx={{ p: 3, textAlign: "center", color: "#64748B" }}>{loading ? <CircularProgress size={24} /> : "No threads found."}</Box>}
          </List>
        </Box>

        <Box sx={{ display: { xs: selectedId ? "flex" : "none", md: "flex" }, flexDirection: "column", minWidth: 0, minHeight: 0, background: "#fff" }}>
          {selectedThread ? <>
            <Box sx={{ px: 2, py: 1.35, borderBottom: "1px solid #D7E3F4", background: "#fff" }}>
              <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
                <Box sx={{ minWidth: 0 }}><Typography noWrap sx={{ color: "#0F172A", fontSize: 17, fontWeight: 950 }}>{selectedThread.title}</Typography><Stack direction="row" alignItems="center" gap={.75}><Typography noWrap sx={{ color: "#64748B", fontSize: 11.5 }}>{selectedThread.description || `Started by ${selectedThread.createdBy?.name || "Crew member"}`}</Typography><Chip size="small" icon={selectedThread.audience?.scope === "restricted" ? <ShieldCheck size={12} /> : <Users size={12} />} label={audienceLabel(selectedThread)} sx={{ height: 20, maxWidth: 260, fontSize: 9.5 }} /></Stack></Box>
                <Button onClick={() => setSelectedId("")} sx={{ display: { md: "none" }, minWidth: 0 }}>Back</Button>
              </Stack>
            </Box>
            <Box sx={{ flex: 1, overflowY: "auto", p: { xs: 1.5, md: 2.25 }, background: "linear-gradient(#F8FAFD,#FFFFFF)" }}>
              {messages.map((item) => {
                const own = String(item.createdBy?.employeeId || "") === String(user?.employeeId || user?.userId || "");
                return <Box key={item.id} sx={{ display: "flex", justifyContent: own ? "flex-end" : "flex-start", mb: 1.5 }}>
                  <Box sx={{ display: "flex", flexDirection: own ? "row-reverse" : "row", alignItems: "flex-start", gap: 1, maxWidth: { xs: "95%", md: "78%" } }}>
                    <Avatar sx={{ width: 32, height: 32, bgcolor: own ? "#0057B7" : "#DCE8F5", color: own ? "#fff" : "#31577D", fontSize: 11, fontWeight: 900 }}>{initials(item.createdBy?.name)}</Avatar>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ mb: .35, textAlign: own ? "right" : "left", color: "#64748B", fontSize: 10.5 }}><strong>{item.createdBy?.name || item.createdBy?.employeeId}</strong> · {dayjs(item.createdAt).format("DD MMM YYYY, HH:mm")}</Typography>
                      <Box sx={{ px: 1.4, py: 1, border: "1px solid", borderColor: own ? "#B8D3F3" : "#DDE5EF", borderRadius: own ? "14px 4px 14px 14px" : "4px 14px 14px 14px", background: own ? "#EAF3FF" : "#fff", boxShadow: "0 3px 12px rgba(15,23,42,.04)" }}>
                        {item.text && <Typography sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", color: "#172033", fontSize: 13.5, lineHeight: 1.5 }}>{item.text}</Typography>}
                        {(item.attachments || []).map((attachment) => <Button key={attachment.id} fullWidth onClick={() => downloadAttachment(attachment)} startIcon={attachment.isImage ? <FileImage size={17} /> : <File size={17} />} endIcon={<Download size={15} />} sx={{ mt: item.text ? 1 : .25, justifyContent: "flex-start", textTransform: "none", color: "#0057B7", bgcolor: "#F5F9FF", border: "1px solid #D6E6FA", overflow: "hidden" }}><Box sx={{ minWidth: 0, flex: 1, textAlign: "left" }}><Typography noWrap sx={{ fontSize: 11.5, fontWeight: 850 }}>{attachment.name}</Typography><Typography sx={{ color: "#64748B", fontSize: 9.5 }}>{formatBytes(attachment.size)}</Typography></Box></Button>)}
                        {(item.sharePointLinks || []).map((link) => <Box key={link.id} sx={{ mt: item.text || item.attachments?.length ? 1 : .25, p: 1, display: "flex", alignItems: "center", gap: 1, bgcolor: "#F2FBF8", border: "1px solid #BDE5D8", borderRadius: 1.5 }}><Avatar variant="rounded" sx={{ width: 31, height: 31, bgcolor: "#087A5B" }}><Link2 size={16} /></Avatar><Box sx={{ minWidth: 0, flex: 1 }}><Typography noWrap sx={{ color: "#12372D", fontSize: 11.5, fontWeight: 900 }}>{link.name}</Typography><Typography sx={{ color: "#558074", fontSize: 9.5 }}>SharePoint</Typography></Box><Button size="small" onClick={() => openSharePointLink(link)} endIcon={<ExternalLink size={14} />} sx={{ minWidth: "max-content", color: "#087A5B", fontSize: 10, fontWeight: 900 }}>{officeProtocol(link) ? "Open in app" : "Open"}</Button>{officeProtocol(link) && <Tooltip title="Open in browser"><IconButton size="small" onClick={() => openSharePointLink(link, true)}><ExternalLink size={15} /></IconButton></Tooltip>}</Box>)}
                      </Box>
                    </Box>
                  </Box>
                </Box>;
              })}
              {!messages.length && <Box sx={{ py: 9, textAlign: "center", color: "#64748B" }}><Users size={38} /><Typography sx={{ mt: 1, fontWeight: 850 }}>Start this crew discussion</Typography></Box>}
              <div ref={messageEndRef} />
            </Box>
            <Box sx={{ p: 1.5, borderTop: "1px solid #D7E3F4", background: "#fff" }}>
              {(files.length > 0 || sharePointLinks.length > 0) && <Stack direction="row" gap={.75} flexWrap="wrap" sx={{ mb: 1 }}>{files.map((item, index) => <Chip key={`${item.name}-${index}`} size="small" icon={<FilePlus2 size={13} />} label={`${item.name} (${formatBytes(item.size)})`} onDelete={() => setFiles((current) => current.filter((_, position) => position !== index))} />)}{sharePointLinks.map((item, index) => <Chip key={`${item.url}-${index}`} size="small" color="success" variant="outlined" icon={<Link2 size={13} />} label={item.name} onDelete={() => setSharePointLinks((current) => current.filter((_, position) => position !== index))} />)}</Stack>}
              <Stack direction="row" alignItems="flex-end" gap={1}>
                <Tooltip title="Attach text, PDF, Word, Excel, PowerPoint or image files"><span><IconButton disabled={!canWrite || sending} onClick={() => fileRef.current?.click()} sx={{ border: "1px solid #C7D7EA" }}><Paperclip size={19} /></IconButton></span></Tooltip>
                <Tooltip title="Attach a SharePoint link"><span><IconButton disabled={!canWrite || sending || sharePointLinks.length >= 10} onClick={() => setShareOpen(true)} sx={{ border: "1px solid #B9DCCD", color: "#087A5B" }}><Link2 size={19} /></IconButton></span></Tooltip>
                <input ref={fileRef} hidden multiple type="file" accept=".txt,.csv,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.gif,.webp,.bmp" onChange={(event) => setFiles(Array.from(event.target.files || []).slice(0, 10))} />
                <TextField fullWidth multiline maxRows={5} disabled={!canWrite || sending} value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); postMessage(); } }} placeholder={canWrite ? "Write a message… (Shift+Enter for a new line)" : "This page is read-only for your account"} />
                <Button variant="contained" disabled={!canWrite || sending || (!message.trim() && !files.length && !sharePointLinks.length)} onClick={postMessage} startIcon={sending ? <CircularProgress size={15} color="inherit" /> : <Send size={17} />} sx={{ minHeight: 44, px: 2.25, bgcolor: "#0057B7", fontWeight: 900 }}>Send</Button>
              </Stack>
            </Box>
          </> : <Box sx={{ flex: 1, display: "grid", placeItems: "center", color: "#64748B" }}><Box sx={{ textAlign: "center" }}><MessageSquare size={48} /><Typography sx={{ mt: 1, fontWeight: 900 }}>Select or create a crew thread</Typography></Box></Box>}
        </Box>
      </Paper>

      <Dialog open={newOpen} onClose={() => !creating && setNewOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 950 }}>Create crew thread</DialogTitle>
        <DialogContent><Stack spacing={2} sx={{ pt: 1 }}><TextField autoFocus label="Thread title" value={newTitle} onChange={(event) => setNewTitle(event.target.value)} inputProps={{ maxLength: 160 }} /><TextField multiline minRows={3} label="Description (optional)" value={newDescription} onChange={(event) => setNewDescription(event.target.value)} inputProps={{ maxLength: 1000 }} /><Box><Typography sx={{ mb: .5, fontSize: 12, fontWeight: 900 }}>Who can access this thread?</Typography><RadioGroup row value={audienceMode} onChange={(event) => setAudienceMode(event.target.value)}><FormControlLabel value="everyone" control={<Radio size="small" />} label="Everyone with Crew Threads access" /><FormControlLabel value="restricted" control={<Radio size="small" />} label="Selected audience" /></RadioGroup></Box>{audienceMode === "restricted" && <Stack spacing={1.25}><Autocomplete multiple options={options.employees} value={audienceEmployees} onChange={(_, value) => setAudienceEmployees(value)} isOptionEqualToValue={(option, value) => option.id === value.id} getOptionLabel={(option) => `${option.name}${option.designation ? ` — ${option.designation}` : ""}`} renderInput={(params) => <TextField {...params} label="Employees" placeholder="Search employee" />} /><Autocomplete multiple options={options.units} value={audienceUnits} onChange={(_, value) => setAudienceUnits(value)} isOptionEqualToValue={(option, value) => option.id === value.id} getOptionLabel={(option) => `${option.name} (${option.type})`} renderInput={(params) => <TextField {...params} label="Department / Vertical / Section / Function" placeholder="Search organization unit" />} /><Autocomplete multiple options={options.groups} value={audienceGroups} onChange={(_, value) => setAudienceGroups(value)} isOptionEqualToValue={(option, value) => option.name === value.name} getOptionLabel={(option) => option.name} renderInput={(params) => <TextField {...params} label="Shift groups" placeholder="Search shift group" />} /></Stack>}</Stack></DialogContent>
        <DialogActions><Button disabled={creating} onClick={() => setNewOpen(false)}>Cancel</Button><Button variant="contained" disabled={creating || newTitle.trim().length < 3} onClick={createThread}>{creating ? "Creating…" : "Create thread"}</Button></DialogActions>
      </Dialog>

      <Dialog open={shareOpen} onClose={() => setShareOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1, fontWeight: 950 }}><Link2 size={20} /> Attach from SharePoint</DialogTitle>
        <DialogContent><Stack spacing={2} sx={{ pt: 1 }}><Alert severity="info">Paste the SharePoint sharing link. Word, Excel and PowerPoint links can open directly in their desktop apps.</Alert><TextField label="Document name" value={shareName} onChange={(event) => setShareName(event.target.value)} helperText="Include .docx, .xlsx or .pptx when the sharing URL does not show the extension." /><TextField autoFocus label="SharePoint link" value={shareUrl} onChange={(event) => setShareUrl(event.target.value)} placeholder="https://...sharepoint.com/..." /></Stack></DialogContent>
        <DialogActions><Button onClick={() => setShareOpen(false)}>Cancel</Button><Button variant="contained" disabled={!shareUrl.trim()} onClick={addSharePointLink}>Attach link</Button></DialogActions>
      </Dialog>
    </Box>
  );
}
