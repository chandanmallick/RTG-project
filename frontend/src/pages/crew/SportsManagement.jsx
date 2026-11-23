import { useEffect, useMemo, useState } from "react";
import { Alert, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Paper, Stack, TextField, Typography } from "@mui/material";
import { useAuth } from "../../auth/AuthContext";
import { Medal, Plane, Plus, Send } from "lucide-react";
import TravelOffManager from "../../components/crew/TravelOffManager";
import { useSearchParams } from "react-router-dom";

import AppShell from "../../components/layout/AppShell";
import api from "../../crewLegacy/api";
import WorkflowHeader from "../../components/crew/WorkflowHeader";

const emptyEvent = { name: "", venue: "", startDate: "", endDate: "", description: "" };
const fmt = (value) => value ? new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T00:00:00`)) : "—";

export default function SportsManagement({ embedded = false, initialDates = [], onSubmitted } = {}) {
  const [params, setParams] = useSearchParams();
  const calendarDates = useMemo(() => initialDates.length ? [...initialDates].sort() : (params.get("dates") || "").split(",").filter(Boolean).sort(), [initialDates, params]);
  const section = embedded ? "apply" : (params.get("section") || "apply");
  const [events, setEvents] = useState([]);
  const [applications, setApplications] = useState([]);
  const [eventForm, setEventForm] = useState(emptyEvent);
  const [eventOpen, setEventOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState("");
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState(null);
  const [working, setWorking] = useState(false);
  const { user } = useAuth();
  const isAdmin = String(user?.role || "").toLowerCase() === "admin" || user?.isAdmin === true || String(user?.employeeId || "") === "50041" || Boolean(user?.permissions?.crew_sports?.write) || Boolean(user?.permissions?.crew_sports?.approve);
  const [replacementDialog, setReplacementDialog] = useState({
    open: false,
    isApproval: false,
    application: null,
    required: false,
    dates: [],
    selectedDates: [],
    employeeId: "",
    candidates: [],
    loadingCandidates: false,
    comment: "",
  });

  const getAppDates = (application) => {
    if (application.dates && application.dates.length) return application.dates;
    if (application.selectedDates && application.selectedDates.length) return application.selectedDates;
    const list = [];
    if (application.startDate && application.endDate) {
      let cur = new Date(application.startDate);
      const stop = new Date(application.endDate);
      while (cur <= stop) {
        list.push(cur.toISOString().slice(0, 10));
        cur.setDate(cur.getDate() + 1);
      }
    } else if (application.startDate) {
      list.push(application.startDate);
    }
    return list;
  };

  const openReplacementDialog = async (application, isApproval = false) => {
    const allDates = getAppDates(application);
    const initialSelected = application.replacementRequiredDates?.length
      ? application.replacementRequiredDates
      : (application.replacementRequired ? allDates : allDates);

    setReplacementDialog({
      open: true,
      isApproval,
      application,
      required: isApproval ? false : Boolean(application.replacementRequired),
      dates: allDates,
      selectedDates: initialSelected,
      employeeId: application.replacementEmployee?.employeeId || "",
      candidates: [],
      loadingCandidates: true,
      comment: "",
    });
    try {
      const { data } = await api.get(`/sports/applications/${application.id}/replacement-candidates`);
      setReplacementDialog((curr) => ({
        ...curr,
        candidates: data.candidates || [],
        loadingCandidates: false,
      }));
    } catch (err) {
      setReplacementDialog((curr) => ({ ...curr, loadingCandidates: false }));
    }
  };

  const saveSportsReplacement = async () => {
    if (!replacementDialog.application) return;
    setWorking(true);
    try {
      const repDates = replacementDialog.required ? replacementDialog.selectedDates : [];
      if (replacementDialog.isApproval) {
        const { data } = await api.post(`/sports/applications/${replacementDialog.application.id}/approve`, {
          replacementRequiredDates: repDates,
          replacementRequired: repDates.length > 0,
          replacementEmployeeId: replacementDialog.required ? replacementDialog.employeeId : "",
          comment: replacementDialog.comment,
        });
        setNotice({ severity: "success", text: data.message });
      } else {
        const { data } = await api.put(`/sports/applications/${replacementDialog.application.id}/set-replacement-required`, {
          replacementRequiredDates: repDates,
          replacementRequired: repDates.length > 0,
          replacementEmployeeId: replacementDialog.required ? replacementDialog.employeeId : "",
          comment: replacementDialog.comment,
        });
        setNotice({ severity: "success", text: data.message });
      }
      setReplacementDialog((curr) => ({ ...curr, open: false }));
      await load();
    } catch (err) {
      setNotice({ severity: "error", text: err.response?.data?.detail || "Could not save sports replacement option." });
    } finally {
      setWorking(false);
    }
  };
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
      title={{ events: "Sports event master", apply: "Apply for sports", approval: "Sports approval inbox", travel: "Sports Travel OFF (Before & After)" }[section] || "Sports workflow"}
      subtitle={{ events: "Create the event once; employees can then apply against it.", apply: "Submit an application through your configured reporting hierarchy.", approval: "Review sports applications currently visible in your approval scope.", travel: "Apply for travel days before / after approved sports vacation and track approval history." }[section]}
      accent={{ events: "#6D28D9", apply: "#0057B7", approval: "#047857", travel: "#4F46E5" }[section]}
      count={section === "approval" ? actionable.length : undefined}
      onRefresh={load}
    >
      <Stack direction="row" spacing={0.8}>
        <Button size="small" variant={section === "apply" ? "contained" : "outlined"} onClick={() => setParams({ section: "apply" })} sx={{ textTransform: "none", fontWeight: 800 }}>Apply</Button>
        <Button size="small" variant={section === "approval" ? "contained" : "outlined"} onClick={() => setParams({ section: "approval" })} sx={{ textTransform: "none", fontWeight: 800 }}>Approval Inbox</Button>
        <Button size="small" variant={section === "travel" ? "contained" : "outlined"} startIcon={<Plane size={14} />} onClick={() => setParams({ section: "travel" })} sx={{ textTransform: "none", fontWeight: 850 }}>Travel OFF</Button>
        <Button size="small" variant={section === "events" ? "contained" : "outlined"} onClick={() => setParams({ section: "events" })} sx={{ textTransform: "none", fontWeight: 800 }}>Events Master</Button>
      </Stack>
    </WorkflowHeader>}
    {notice && <Alert severity={notice.severity} onClose={() => setNotice(null)} sx={{ mt: 1 }}>{notice.text}</Alert>}

    <Box sx={{ mt: 1.2, p: 2, border: "1px solid #DCE5EF", borderRadius: 3, background: "#FFF" }}>
      {section === "travel" && <TravelOffManager defaultScope="sports" />}
      {section === "events" && <><Stack direction="row" justifyContent="space-between" alignItems="center"><Box><Typography sx={{ fontSize: 17, fontWeight: 950 }}>Sports event master</Typography><Typography sx={{ fontSize: 11, color: "#64748B" }}>Published events become available in employee applications.</Typography></Box><Button variant="contained" startIcon={<Plus size={16} />} onClick={() => { setEventForm(emptyEvent); setEventOpen(true); }} sx={{ textTransform: "none", fontWeight: 900 }}>New event</Button></Stack><Stack spacing={.8} sx={{ mt: 1.5 }}>{events.map((item) => <Box key={item.id} sx={{ p: 1.2, border: "1px solid #E2E8F0", borderRadius: 2, display: "flex", alignItems: "center", gap: 1.2 }}><Box sx={{ width: 36, height: 36, borderRadius: 2, display: "grid", placeItems: "center", color: "#6D28D9", background: "#F5F3FF" }}><Medal size={18} /></Box><Box sx={{ flex: 1 }}><Typography sx={{ fontSize: 13, fontWeight: 900 }}>{item.name}</Typography><Typography sx={{ fontSize: 10.5, color: "#64748B" }}>{fmt(item.startDate)} – {fmt(item.endDate)} · {item.venue || "Venue not specified"}</Typography></Box><Button size="small" onClick={() => { setEventForm(item); setEventOpen(true); }} sx={{ textTransform: "none", fontWeight: 850 }}>Edit</Button></Box>)}{!events.length && <Typography sx={{ py: 4, textAlign: "center", color: "#94A3B8" }}>No sports events have been created.</Typography>}</Stack></>}
      {section === "apply" && <Box sx={{ maxWidth: 760 }}><Typography sx={{ fontSize: 17, fontWeight: 950 }}>New sports application</Typography><Typography sx={{ mt: .25, mb: 1.5, fontSize: 11, color: "#64748B" }}>The request follows your same configured reporting hierarchy used for leave.</Typography>{calendarDates.length > 0 && <Alert severity="info" sx={{ mb: 1.2 }}>{calendarDates.length} calendar date(s) selected · {fmt(calendarDates[0])} to {fmt(calendarDates[calendarDates.length - 1])}. Select an event covering these dates.</Alert>}<Stack spacing={1.2}><TextField select label="Sports event" value={selectedEvent} onChange={(event) => setSelectedEvent(event.target.value)}>{events.filter((item) => item.status !== "Inactive" && (!calendarDates.length || (item.startDate <= calendarDates[0] && item.endDate >= calendarDates[calendarDates.length - 1]))).map((item) => <MenuItem key={item.id} value={item.id}>{item.name} · {fmt(item.startDate)} to {fmt(item.endDate)}</MenuItem>)}</TextField><TextField label="Purpose / remarks" multiline minRows={3} value={reason} onChange={(event) => setReason(event.target.value)} /><Button variant="contained" startIcon={<Send size={16} />} disabled={!selectedEvent || working} onClick={apply} sx={{ alignSelf: "flex-start", textTransform: "none", fontWeight: 900 }}>Submit application</Button></Stack></Box>}
      {section === "approval" && <><Typography sx={{ fontSize: 17, fontWeight: 950 }}>Sports assignment & approval</Typography><Typography sx={{ mb: 1.5, fontSize: 11, color: "#64748B" }}>Only your current-stage actions are enabled. Delegated leave authority is also honoured.</Typography><Stack spacing={.8}>{applications.map((item) => <Box key={item.id} sx={{ p: 1.3, display: "grid", gridTemplateColumns: { xs: "1fr", md: "1.2fr 1.1fr 1.2fr auto" }, alignItems: "center", gap: 1, border: "1px solid #E2E8F0", borderRadius: 2, background: item.canAct ? "#F0FDF4" : "#FFF" }}>
  <Box>
    <Typography sx={{ fontSize: 13, fontWeight: 950 }}>{item.employeeName || item.employeeId}</Typography>
    <Typography sx={{ fontSize: 10.5, color: "#64748B" }}>{item.designation || item.employeeId}</Typography>
  </Box>
  <Box>
    <Typography sx={{ fontSize: 12.5, fontWeight: 850 }}>{item.eventName}</Typography>
    <Typography sx={{ fontSize: 10.5, color: "#64748B" }}>{fmt(item.startDate)} – {fmt(item.endDate)}</Typography>
  </Box>
  <Box>
    <Stack direction="row" spacing={0.6} alignItems="center" flexWrap="wrap">
      <Chip size="small" label={item.status} color={item.status === "Approved" ? "success" : item.status === "Rejected" ? "error" : "warning"} sx={{ height: 21, fontSize: 10.5, fontWeight: 800 }} />
      {item.replacementEmployee?.name ? (
        <Chip size="small" color="success" label={`Cover: ${item.replacementEmployee.name}`} sx={{ height: 21, fontSize: 10, fontWeight: 800 }} />
      ) : item.replacementRequired ? (
        <Chip size="small" color="warning" label="Replacement Required" sx={{ height: 21, fontSize: 10, fontWeight: 800 }} />
      ) : (
        <Chip size="small" variant="outlined" label="No Replacement" sx={{ height: 21, fontSize: 10, color: "#64748B" }} />
      )}
    </Stack>
    <Typography sx={{ mt: 0.35, fontSize: 10, color: "#64748B" }}>
      {item.currentApproverName ? `Awaiting ${item.currentApproverName}` : "Workflow complete"}
    </Typography>
  </Box>
  <Stack direction="row" spacing={0.6} alignItems="center">
    {isAdmin && (
      <Button
        size="small"
        variant="outlined"
        color="primary"
        onClick={() => openReplacementDialog(item)}
        sx={{ textTransform: "none", fontWeight: 850, fontSize: 11, borderRadius: 1.8 }}
      >
        Replacement Option
      </Button>
    )}
    {item.canAct && (
      <>
        <Button size="small" color="success" variant="contained" disabled={working} onClick={() => openReplacementDialog(item, true)} sx={{ textTransform: "none", fontWeight: 850, fontSize: 11 }}>Approve</Button>
        <Button size="small" color="error" variant="outlined" disabled={working} onClick={() => decide(item.id, "reject")} sx={{ textTransform: "none", fontWeight: 850, fontSize: 11 }}>Reject</Button>
      </>
    )}
  </Stack>
</Box>)}{!applications.length && <Typography sx={{ py: 4, textAlign: "center", color: "#94A3B8" }}>No sports applications are visible in your scope.</Typography>}</Stack></>}
    </Box>
    <Dialog open={eventOpen} onClose={() => setEventOpen(false)} fullWidth maxWidth="sm"><DialogTitle sx={{ fontWeight: 950 }}>{eventForm.id ? "Edit sports event" : "New sports event"}</DialogTitle><DialogContent dividers><Stack spacing={1.2} sx={{ pt: .5 }}><TextField label="Event name" value={eventForm.name} onChange={(e) => setEventForm((v) => ({ ...v, name: e.target.value }))} /><Stack direction={{ xs: "column", sm: "row" }} spacing={1}><TextField fullWidth type="date" label="From" InputLabelProps={{ shrink: true }} value={eventForm.startDate} onChange={(e) => setEventForm((v) => ({ ...v, startDate: e.target.value }))} /><TextField fullWidth type="date" label="To" InputLabelProps={{ shrink: true }} value={eventForm.endDate} onChange={(e) => setEventForm((v) => ({ ...v, endDate: e.target.value }))} /></Stack><TextField label="Venue" value={eventForm.venue} onChange={(e) => setEventForm((v) => ({ ...v, venue: e.target.value }))} /><TextField label="Description" multiline minRows={2} value={eventForm.description} onChange={(e) => setEventForm((v) => ({ ...v, description: e.target.value }))} /></Stack></DialogContent><DialogActions><Button onClick={() => setEventOpen(false)}>Cancel</Button><Button variant="contained" disabled={working} onClick={saveEvent}>Save event</Button></DialogActions></Dialog>

    {/* Admin {replacementDialog.isApproval ? "Approve Sports Application" : "Review Sports Replacement Requirement"} Dialog */}
    <Dialog
      open={replacementDialog.open}
      onClose={() => !working && setReplacementDialog((c) => ({ ...c, open: false }))}
      fullWidth
      maxWidth="sm"
      slotProps={{ paper: { sx: { borderRadius: 3 } } }}
    >
      <DialogTitle sx={{ fontWeight: 950, fontSize: 16 }}>
        Sports Replacement Requirement
        {replacementDialog.application && (
          <Typography sx={{ fontSize: 12, color: "#64748B", mt: 0.3 }}>
            {replacementDialog.application.employeeName} · {replacementDialog.application.eventName} ({fmt(replacementDialog.application.startDate)} to {fmt(replacementDialog.application.endDate)})
          </Typography>
        )}
      </DialogTitle>
      <DialogContent dividers sx={{ display: "grid", gap: 2, py: 2 }}>
        <Box>
          <Typography sx={{ fontSize: 12, fontWeight: 850, color: "#334155", mb: 0.8 }}>
            Coverage Requirement:
          </Typography>
          <Stack direction="row" spacing={1}>
            <Button
              fullWidth
              size="small"
              variant={replacementDialog.required ? "contained" : "outlined"}
              color={replacementDialog.required ? "warning" : "inherit"}
              onClick={() => setReplacementDialog((c) => ({ ...c, required: true }))}
              sx={{ fontWeight: 850, fontSize: 11.5, textTransform: "none", py: 1 }}
            >
              Replacement Required
            </Button>
            <Button
              fullWidth
              size="small"
              variant={!replacementDialog.required ? "contained" : "outlined"}
              onClick={() => setReplacementDialog((c) => ({ ...c, required: false, employeeId: "" }))}
              sx={{
                fontWeight: 850,
                fontSize: 11.5,
                textTransform: "none",
                py: 1,
                bgcolor: !replacementDialog.required ? "#334155" : "inherit",
                color: !replacementDialog.required ? "#FFF" : "inherit",
                "&:hover": { bgcolor: !replacementDialog.required ? "#1E293B" : undefined },
              }}
            >
              No Replacement
            </Button>
          </Stack>
        </Box>

        {replacementDialog.required && (
          <>
            <Box sx={{ p: 1.5, bgcolor: "#F8FAFC", borderRadius: 2, border: "1px solid #E2E8F0" }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                <Typography sx={{ fontSize: 12, fontWeight: 850, color: "#1E293B" }}>
                  Select Dates Requiring Replacement:
                </Typography>
                <Stack direction="row" spacing={1}>
                  <Button
                    size="small"
                    onClick={() => setReplacementDialog((c) => ({ ...c, selectedDates: [...c.dates] }))}
                    sx={{ fontSize: 11, p: 0, textTransform: "none", minWidth: 0, fontWeight: 750 }}
                  >
                    Select All
                  </Button>
                  <Typography sx={{ fontSize: 11, color: "#94A3B8" }}>|</Typography>
                  <Button
                    size="small"
                    onClick={() => setReplacementDialog((c) => ({ ...c, selectedDates: [] }))}
                    sx={{ fontSize: 11, p: 0, textTransform: "none", minWidth: 0, fontWeight: 750 }}
                  >
                    Clear All
                  </Button>
                </Stack>
              </Stack>
              <Stack spacing={0.6}>
                {replacementDialog.dates.map((d) => {
                  const isChecked = replacementDialog.selectedDates.includes(d);
                  return (
                    <FormControlLabel
                      key={d}
                      control={
                        <Checkbox
                          size="small"
                          checked={isChecked}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setReplacementDialog((c) => ({
                              ...c,
                              selectedDates: checked
                                ? [...c.selectedDates, d]
                                : c.selectedDates.filter((x) => x !== d),
                            }));
                          }}
                        />
                      }
                      label={
                        <Typography sx={{ fontSize: 12, fontWeight: isChecked ? 800 : 500, color: isChecked ? "#0F172A" : "#64748B" }}>
                          {fmt(d)} {isChecked ? "· Replacement Required" : "· No Cover Needed"}
                        </Typography>
                      }
                    />
                  );
                })}
              </Stack>
              {replacementDialog.selectedDates.length === 0 && (
                <Alert severity="info" sx={{ mt: 1, py: 0.2, fontSize: 11 }}>
                  No dates selected. If saved, no replacement will be requested.
                </Alert>
              )}
            </Box>

            <Box>
              <Typography sx={{ fontSize: 12, fontWeight: 850, color: "#334155", mb: 0.8 }}>
                Replacement Candidate (Optional - can be assigned later):
              </Typography>
              <TextField
                select
                fullWidth
                size="small"
                label="Select Cover Employee"
                value={replacementDialog.employeeId}
                disabled={replacementDialog.loadingCandidates}
                onChange={(e) => setReplacementDialog((c) => ({ ...c, employeeId: e.target.value }))}
              >
                <MenuItem value="">-- Leave unassigned for now --</MenuItem>
                {replacementDialog.candidates.map((cand) => (
                  <MenuItem key={cand.employeeId} value={cand.employeeId} disabled={cand.hasConflict}>
                    {cand.name} ({cand.employeeId}) · {cand.dutySummary}{cand.hasConflict ? " · Conflict" : ""}
                  </MenuItem>
                ))}
              </TextField>
              {replacementDialog.loadingCandidates && (
                <Typography sx={{ fontSize: 11, color: "#94A3B8", mt: 0.4 }}>
                  Loading candidates from roster...
                </Typography>
              )}
            </Box>
          </>
        )}

        <TextField
          fullWidth
          multiline
          minRows={2}
          size="small"
          label="Remarks / Comments"
          placeholder="e.g. Approved with replacement requirement..."
          value={replacementDialog.comment}
          onChange={(e) => setReplacementDialog((c) => ({ ...c, comment: e.target.value }))}
          inputProps={{ maxLength: 1000 }}
        />
      </DialogContent>
      <DialogActions sx={{ px: 2.5, pb: 2 }}>
        <Button disabled={working} onClick={() => setReplacementDialog((c) => ({ ...c, open: false }))}>
          Cancel
        </Button>
        <Button
          variant="contained"
          disabled={working}
          onClick={saveSportsReplacement}
          sx={{ fontWeight: 850 }}
        >
          {working ? "Saving..." : replacementDialog.isApproval ? "Confirm & Approve" : "Save Option"}
        </Button>
      </DialogActions>
    </Dialog>
  </Box>;
  return embedded ? content : <AppShell>{content}</AppShell>;
}
