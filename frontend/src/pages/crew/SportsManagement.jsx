import { useEffect, useMemo, useState } from "react";
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { Medal, Plus, Send } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import AppShell from "../../components/layout/AppShell";
import api from "../../crewLegacy/api";
import WorkflowHeader from "../../components/crew/WorkflowHeader";

const emptyEvent = { name: "", venue: "", startDate: "", endDate: "", description: "" };
const fmt = (value) => value ? new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T00:00:00`)) : "—";

export default function SportsManagement({ embedded = false, initialDates = [], onSubmitted } = {}) {
  const [params] = useSearchParams();
  const calendarDates = useMemo(() => initialDates.length ? [...initialDates].sort() : (params.get("dates") || "").split(",").filter(Boolean).sort(), [initialDates, params]);
  const [section] = useState(embedded ? "apply" : params.get("section") || "apply");
  const [events, setEvents] = useState([]);
  const [applications, setApplications] = useState([]);
  const [eventForm, setEventForm] = useState(emptyEvent);
  const [eventOpen, setEventOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState("");
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState(null);
  const [working, setWorking] = useState(false);
  const pending = useMemo(() => applications.filter((item) => item.status === "Pending Approval"), [applications]);
  const actionable = useMemo(() => pending.filter((item) => item.canAct), [pending]);

  const load = async () => {
    try {
      const [eventResult, applicationResult] = await Promise.all([api.get("/sports/events", { params: { includePast: true } }), api.get("/sports/applications")]);
      setEvents(eventResult.data || []); setApplications(applicationResult.data || []);
    } catch (error) { setNotice({ severity: "error", text: error.response?.data?.detail || "Sports workflow could not be loaded." }); }
  };
  useEffect(() => { load(); }, []);

  const saveEvent = async () => {
    setWorking(true);
    try { const { data } = await api.post("/sports/events", eventForm); setNotice({ severity: "success", text: data.message }); setEventOpen(false); setEventForm(emptyEvent); await load(); }
    catch (error) { setNotice({ severity: "error", text: error.response?.data?.detail || "Sports event could not be saved." }); }
    finally { setWorking(false); }
  };
  const apply = async () => {
    setWorking(true);
    try { const { data } = await api.post("/sports/apply", { eventId: selectedEvent, reason, dates: calendarDates }); setNotice({ severity: "success", text: data.message }); setReason(""); await load(); onSubmitted?.(data); }
    catch (error) { setNotice({ severity: "error", text: error.response?.data?.detail || "Sports application could not be submitted." }); }
    finally { setWorking(false); }
  };
  const decide = async (id, action) => {
    setWorking(true);
    try { const { data } = await api.post(`/sports/applications/${id}/${action}`); setNotice({ severity: "success", text: data.message }); await load(); }
    catch (error) { setNotice({ severity: "error", text: error.response?.data?.detail || "The decision could not be saved." }); }
    finally { setWorking(false); }
  };

  const content = <Box sx={{ p: embedded ? 0 : { xs: 1.2, md: 2 }, minHeight: embedded ? 0 : "calc(100dvh - 110px)", background: embedded ? "transparent" : "#F8FAFC" }}>
    {!embedded && <WorkflowHeader
      title={{ events: "Sports event master", apply: "Apply for sports", approval: "Sports approval inbox" }[section] || "Sports workflow"}
      subtitle={{ events: "Create the event once; employees can then apply against it.", apply: "Submit an application through your configured reporting hierarchy.", approval: "Review sports applications currently visible in your approval scope." }[section]}
      accent={{ events: "#6D28D9", apply: "#0057B7", approval: "#047857" }[section]}
      count={section === "approval" ? actionable.length : undefined}
      onRefresh={load}
    />}
    {notice && <Alert severity={notice.severity} onClose={() => setNotice(null)} sx={{ mt: 1 }}>{notice.text}</Alert>}

    <Box sx={{ mt: 1.2, p: 2, border: "1px solid #DCE5EF", borderRadius: 3, background: "#FFF" }}>
      {section === "events" && <><Stack direction="row" justifyContent="space-between" alignItems="center"><Box><Typography sx={{ fontSize: 17, fontWeight: 950 }}>Sports event master</Typography><Typography sx={{ fontSize: 11, color: "#64748B" }}>Published events become available in employee applications.</Typography></Box><Button variant="contained" startIcon={<Plus size={16} />} onClick={() => { setEventForm(emptyEvent); setEventOpen(true); }} sx={{ textTransform: "none", fontWeight: 900 }}>New event</Button></Stack><Stack spacing={.8} sx={{ mt: 1.5 }}>{events.map((item) => <Box key={item.id} sx={{ p: 1.2, border: "1px solid #E2E8F0", borderRadius: 2, display: "flex", alignItems: "center", gap: 1.2 }}><Box sx={{ width: 36, height: 36, borderRadius: 2, display: "grid", placeItems: "center", color: "#6D28D9", background: "#F5F3FF" }}><Medal size={18} /></Box><Box sx={{ flex: 1 }}><Typography sx={{ fontSize: 13, fontWeight: 900 }}>{item.name}</Typography><Typography sx={{ fontSize: 10.5, color: "#64748B" }}>{fmt(item.startDate)} – {fmt(item.endDate)} · {item.venue || "Venue not specified"}</Typography></Box><Button size="small" onClick={() => { setEventForm(item); setEventOpen(true); }} sx={{ textTransform: "none", fontWeight: 850 }}>Edit</Button></Box>)}{!events.length && <Typography sx={{ py: 4, textAlign: "center", color: "#94A3B8" }}>No sports events have been created.</Typography>}</Stack></>}
      {section === "apply" && <Box sx={{ maxWidth: 760 }}><Typography sx={{ fontSize: 17, fontWeight: 950 }}>New sports application</Typography><Typography sx={{ mt: .25, mb: 1.5, fontSize: 11, color: "#64748B" }}>The request follows your same configured reporting hierarchy used for leave.</Typography>{calendarDates.length > 0 && <Alert severity="info" sx={{ mb: 1.2 }}>{calendarDates.length} calendar date(s) selected · {fmt(calendarDates[0])} to {fmt(calendarDates[calendarDates.length - 1])}. Select an event covering these dates.</Alert>}<Stack spacing={1.2}><TextField select label="Sports event" value={selectedEvent} onChange={(event) => setSelectedEvent(event.target.value)}>{events.filter((item) => item.status !== "Inactive" && (!calendarDates.length || (item.startDate <= calendarDates[0] && item.endDate >= calendarDates[calendarDates.length - 1]))).map((item) => <MenuItem key={item.id} value={item.id}>{item.name} · {fmt(item.startDate)} to {fmt(item.endDate)}</MenuItem>)}</TextField><TextField label="Purpose / remarks" multiline minRows={3} value={reason} onChange={(event) => setReason(event.target.value)} /><Button variant="contained" startIcon={<Send size={16} />} disabled={!selectedEvent || working} onClick={apply} sx={{ alignSelf: "flex-start", textTransform: "none", fontWeight: 900 }}>Submit application</Button></Stack></Box>}
      {section === "approval" && <><Typography sx={{ fontSize: 17, fontWeight: 950 }}>Sports assignment & approval</Typography><Typography sx={{ mb: 1.5, fontSize: 11, color: "#64748B" }}>Only your current-stage actions are enabled. Delegated leave authority is also honoured.</Typography><Stack spacing={.8}>{applications.map((item) => <Box key={item.id} sx={{ p: 1.25, display: "grid", gridTemplateColumns: { xs: "1fr", md: "1.2fr 1fr 1fr auto" }, alignItems: "center", gap: 1, border: "1px solid #E2E8F0", borderRadius: 2, background: item.canAct ? "#F0FDF4" : "#FFF" }}><Box><Typography sx={{ fontSize: 12.8, fontWeight: 950 }}>{item.employeeName || item.employeeId}</Typography><Typography sx={{ fontSize: 10.3, color: "#64748B" }}>{item.designation || item.employeeId}</Typography></Box><Box><Typography sx={{ fontSize: 12, fontWeight: 850 }}>{item.eventName}</Typography><Typography sx={{ fontSize: 10.3, color: "#64748B" }}>{fmt(item.startDate)} – {fmt(item.endDate)}</Typography></Box><Box><Chip size="small" label={item.status} color={item.status === "Approved" ? "success" : item.status === "Rejected" ? "error" : "warning"} /><Typography sx={{ mt: .35, fontSize: 9.8, color: "#64748B" }}>{item.currentApproverName ? `Awaiting ${item.currentApproverName}` : "Workflow complete"}</Typography></Box><Stack direction="row" spacing={.5}>{item.canAct && <><Button size="small" color="success" variant="contained" disabled={working} onClick={() => decide(item.id, "approve")} sx={{ textTransform: "none", fontWeight: 850 }}>Approve</Button><Button size="small" color="error" variant="outlined" disabled={working} onClick={() => decide(item.id, "reject")} sx={{ textTransform: "none", fontWeight: 850 }}>Reject</Button></>}</Stack></Box>)}{!applications.length && <Typography sx={{ py: 4, textAlign: "center", color: "#94A3B8" }}>No sports applications are visible in your scope.</Typography>}</Stack></>}
    </Box>
    <Dialog open={eventOpen} onClose={() => setEventOpen(false)} fullWidth maxWidth="sm"><DialogTitle sx={{ fontWeight: 950 }}>{eventForm.id ? "Edit sports event" : "New sports event"}</DialogTitle><DialogContent dividers><Stack spacing={1.2} sx={{ pt: .5 }}><TextField label="Event name" value={eventForm.name} onChange={(e) => setEventForm((v) => ({ ...v, name: e.target.value }))} /><Stack direction={{ xs: "column", sm: "row" }} spacing={1}><TextField fullWidth type="date" label="From" InputLabelProps={{ shrink: true }} value={eventForm.startDate} onChange={(e) => setEventForm((v) => ({ ...v, startDate: e.target.value }))} /><TextField fullWidth type="date" label="To" InputLabelProps={{ shrink: true }} value={eventForm.endDate} onChange={(e) => setEventForm((v) => ({ ...v, endDate: e.target.value }))} /></Stack><TextField label="Venue" value={eventForm.venue} onChange={(e) => setEventForm((v) => ({ ...v, venue: e.target.value }))} /><TextField label="Description" multiline minRows={2} value={eventForm.description} onChange={(e) => setEventForm((v) => ({ ...v, description: e.target.value }))} /></Stack></DialogContent><DialogActions><Button onClick={() => setEventOpen(false)}>Cancel</Button><Button variant="contained" disabled={working} onClick={saveEvent}>Save event</Button></DialogActions></Dialog>
  </Box>;
  return embedded ? content : <AppShell>{content}</AppShell>;
}
