import { useEffect, useMemo, useState } from "react";
import {
  Alert, Autocomplete, Box, Button, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, FormControl, InputLabel, MenuItem, Paper, Select,
  Grid, Stack, Switch, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from "@mui/material";
import { CalendarPlus, Edit3, Plus, RefreshCw, Save, Settings2, Users } from "lucide-react";

import { useAuth } from "../../auth/AuthContext";
import AppShell from "../../components/layout/AppShell";
import GlassCard from "../../components/ui/GlassCard";
import crewApi from "../../services/crewApi";

const DUTIES = ["E1", "E2", "M1", "M2", "N1", "N2", "O1", "O2"];
const blankGroup = { groupName: "", startDate: "", endDate: "", shiftInCharge: null, members: [], isActive: true };

export default function CrewSetup() {
  const { user } = useAuth();
  const isAdmin = String(user?.role || "").toLowerCase() === "admin" || String(user?.employeeId || "") === "50041";
  const [employees, setEmployees] = useState([]);
  const [groups, setGroups] = useState([]);
  const [baseDate, setBaseDate] = useState("");
  const [cycleGroups, setCycleGroups] = useState([]);
  const [groupDialog, setGroupDialog] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [form, setForm] = useState(blankGroup);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [manualCompOffs, setManualCompOffs] = useState([]);
  const [manualEmployees, setManualEmployees] = useState([]);
  const [manualEarnedDate, setManualEarnedDate] = useState("");
  const [manualReason, setManualReason] = useState("Duty performed on holiday while roster was not published");
  const [manualSaving, setManualSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [people, groupData, cycle, manualCredits] = await Promise.all([
        crewApi.employees(),
        crewApi.groups(),
        crewApi.cycle(),
        isAdmin ? crewApi.manualCompOffs() : Promise.resolve([]),
      ]);
      setEmployees(people); setGroups(groupData); setBaseDate(cycle.baseDate || "");
      setManualCompOffs(manualCredits || []);
      const starts = new Map((cycle.groups || []).map((item) => [item.groupName, item.startDuty]));
      setCycleGroups(groupData.filter((item) => item.isActive).map((item) => ({ groupName: item.groupName, startDuty: starts.get(item.groupName) || "" })));
    } catch (error) { setMessage({ severity: "error", text: error.response?.data?.detail || "Unable to load crew configuration." }); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const employeeById = useMemo(() => new Map(employees.map((item) => [item.employeeId, item])), [employees]);
  const shiftEmployees = useMemo(() => {
    const people = new Map();
    groups.filter((group) => group.isActive !== false).forEach((group) => {
      [group.shiftInCharge, ...(group.members || [])].filter(Boolean).forEach((person) => {
        const employeeId = String(person.employeeId || person.userId || person.id || "").trim();
        if (!employeeId) return;
        people.set(employeeId, {
          ...(employeeById.get(employeeId) || person),
          employeeId,
          groupName: group.groupName,
        });
      });
    });
    return Array.from(people.values()).sort((a, b) => String(a.name || a.employeeId).localeCompare(String(b.name || b.employeeId)));
  }, [groups, employeeById]);
  const openNew = () => { setEditingId(""); setForm(blankGroup); setGroupDialog(true); };
  const openEdit = (group) => {
    setEditingId(group.id);
    setForm({
      ...group,
      shiftInCharge: employeeById.get(group.shiftInCharge?.employeeId) || group.shiftInCharge || null,
      members: (group.members || []).map((member) => employeeById.get(member.employeeId) || member),
    });
    setGroupDialog(true);
  };

  const saveGroup = async () => {
    setSaving(true);
    try {
      if (editingId) await crewApi.updateGroup(editingId, form); else await crewApi.createGroup(form);
      setGroupDialog(false); setMessage({ severity: "success", text: editingId ? "Group updated." : "Group created." }); await load();
    } catch (error) { setMessage({ severity: "error", text: error.response?.data?.detail || "Unable to save group." }); }
    finally { setSaving(false); }
  };

  const toggle = async (group) => {
    try { await crewApi.toggleGroup(group.id); setMessage({ severity: "success", text: `${group.groupName} ${group.isActive ? "deactivated" : "activated"}.` }); await load(); }
    catch (error) { setMessage({ severity: "error", text: error.response?.data?.detail || "Unable to update group status." }); }
  };

  const saveCycle = async () => {
    setSaving(true);
    try { const result = await crewApi.saveCycle({ baseDate, groups: cycleGroups }); setMessage({ severity: "success", text: result.message }); }
    catch (error) { setMessage({ severity: "error", text: error.response?.data?.detail || "Unable to save roster cycle." }); }
    finally { setSaving(false); }
  };

  const saveManualCompOff = async () => {
    if (!manualEmployees.length || !manualEarnedDate || !manualReason.trim()) {
      setMessage({ severity: "warning", text: "Select shift employee(s), earned holiday date and reason." });
      return;
    }
    setManualSaving(true);
    try {
      const result = await crewApi.addManualCompOff({
        employeeIds: manualEmployees.map((employee) => employee.employeeId),
        earnedDate: manualEarnedDate,
        reason: manualReason.trim(),
      });
      setMessage({ severity: "success", text: result.message || "Manual C-OFF credit added." });
      setManualEmployees([]);
      setManualCompOffs(await crewApi.manualCompOffs());
    } catch (error) {
      setMessage({ severity: "error", text: error.response?.data?.detail || error.message || "Manual C-OFF credit could not be added." });
    } finally {
      setManualSaving(false);
    }
  };
  const manualExpiryDate = manualEarnedDate
    ? `${Number(manualEarnedDate.slice(0, 4)) + 1}-03-31`
    : "";

  return (
    <AppShell>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: { xs: "flex-start", md: "center" }, gap: 2, flexWrap: "wrap" }}><Box><Typography sx={{ fontSize: 12, fontWeight: 900, color: "#17876D", letterSpacing: ".12em", textTransform: "uppercase" }}>Crew Management</Typography><Typography variant="h4" sx={{ fontWeight: 900, color: "#0F172A", letterSpacing: "-.035em", mt: .5 }}>Roster Setup</Typography><Typography sx={{ color: "#64748B", mt: .5 }}>Maintain shift groups and their repeating cycle anchor.</Typography></Box><Button onClick={load} disabled={loading} startIcon={<RefreshCw size={17} />} variant="outlined" sx={{ borderRadius: 3, textTransform: "none", fontWeight: 900 }}>Refresh</Button></Box>
      {message && <Alert severity={message.severity} onClose={() => setMessage(null)}>{message.text}</Alert>}
      {loading ? <Box sx={{ minHeight: 420, display: "grid", placeItems: "center" }}><CircularProgress sx={{ color: "#03624C" }} /></Box> : <>
        <GlassCard hover={false} padding={0} sx={{ overflow: "hidden" }}>
          <Box sx={{ p: 2.5, display: "flex", alignItems: "center", justifyContent: "space-between" }}><Box><Stack direction="row" spacing={1} alignItems="center"><Users size={20} color="#03624C" /><Typography sx={{ fontWeight: 900, color: "#0F172A", fontSize: 18 }}>Roster groups</Typography></Stack><Typography sx={{ color: "#64748B", fontSize: 13, mt: .5 }}>A snapshot of active groups is stored with every roster.</Typography></Box><Button onClick={openNew} startIcon={<Plus size={17} />} variant="contained" sx={{ borderRadius: 3, textTransform: "none", fontWeight: 900, background: "#03624C" }}>Add group</Button></Box>
          <Table><TableHead><TableRow sx={{ background: "#F8FAFC" }}><TableCell sx={{ fontWeight: 900 }}>Group</TableCell><TableCell sx={{ fontWeight: 900 }}>Shift In-Charge</TableCell><TableCell sx={{ fontWeight: 900 }}>Members</TableCell><TableCell sx={{ fontWeight: 900 }}>Effective period</TableCell><TableCell align="center" sx={{ fontWeight: 900 }}>Active</TableCell><TableCell align="right" sx={{ fontWeight: 900 }}>Action</TableCell></TableRow></TableHead><TableBody>{groups.map((group) => <TableRow key={group.id} hover><TableCell><Typography sx={{ fontWeight: 900 }}>{group.groupName}</Typography></TableCell><TableCell><Typography sx={{ fontWeight: 800, fontSize: 13 }}>{group.shiftInCharge?.name || "Not assigned"}</Typography><Typography sx={{ color: "#64748B", fontSize: 11.5 }}>{group.shiftInCharge?.designation}</Typography></TableCell><TableCell><Chip size="small" label={`${group.members?.length || 0} members`} sx={{ fontWeight: 800 }} /></TableCell><TableCell sx={{ fontSize: 13 }}>{group.startDate || "—"} → {group.endDate || "Open"}</TableCell><TableCell align="center"><Switch checked={group.isActive} onChange={() => toggle(group)} color="success" /></TableCell><TableCell align="right"><Button onClick={() => openEdit(group)} startIcon={<Edit3 size={15} />} sx={{ textTransform: "none", fontWeight: 900 }}>Edit</Button></TableCell></TableRow>)}</TableBody></Table>
        </GlassCard>

        <GlassCard hover={false} padding={2.5}>
          <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems={{ md: "center" }} gap={2}><Box><Stack direction="row" spacing={1} alignItems="center"><Settings2 size={20} color="#03624C" /><Typography sx={{ fontWeight: 900, color: "#0F172A", fontSize: 18 }}>Eight-day duty cycle</Typography></Stack><Typography sx={{ color: "#64748B", fontSize: 13, mt: .5 }}>Sequence: E1 → E2 → M1 → M2 → N1 → N2 → O1 → O2.</Typography></Box><Stack direction="row" spacing={1.5} alignItems="center"><TextField label="Base date" type="date" value={baseDate} onChange={(event) => setBaseDate(event.target.value)} InputLabelProps={{ shrink: true }} size="small" /><Button onClick={saveCycle} disabled={saving || !baseDate || cycleGroups.some((item) => !item.startDuty)} startIcon={<Save size={17} />} variant="contained" sx={{ borderRadius: 3, textTransform: "none", fontWeight: 900, background: "#0F6FDB" }}>Save cycle</Button></Stack></Stack>
          <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} mt={2.5}>{cycleGroups.map((item, index) => <Paper key={item.groupName} variant="outlined" sx={{ p: 1.5, borderRadius: 3, flex: 1 }}><Typography sx={{ fontWeight: 900, mb: 1 }}>{item.groupName}</Typography><FormControl fullWidth size="small"><InputLabel>Duty on base date</InputLabel><Select label="Duty on base date" value={item.startDuty} onChange={(event) => setCycleGroups((current) => current.map((group, groupIndex) => groupIndex === index ? { ...group, startDuty: event.target.value } : group))}>{DUTIES.map((duty) => <MenuItem key={duty} value={duty}>{duty}</MenuItem>)}</Select></FormControl></Paper>)}</Stack>
        </GlassCard>

        {false && <GlassCard hover={false} padding={0} sx={{ overflow: "hidden" }}>
          <Box sx={{ p: 2.5, borderBottom: "1px solid #E2E8F0", background: "#FFFDF5" }}>
            <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems={{ md: "center" }} gap={1.5}>
              <Box>
                <Stack direction="row" spacing={1} alignItems="center"><CalendarPlus size={20} color="#B45309" /><Typography sx={{ fontWeight: 900, color: "#0F172A", fontSize: 18 }}>Manual C-OFF credit</Typography></Stack>
                <Typography sx={{ color: "#64748B", fontSize: 13, mt: .5 }}>Backfill an earned C-OFF for active shift-group staff when an old holiday roster was not published.</Typography>
              </Box>
              <Chip label="Administrator only" size="small" sx={{ color: "#92400E", background: "#FEF3C7", fontWeight: 900 }} />
            </Stack>
          </Box>
          <Box sx={{ p: 2.5 }}>
            <Grid container spacing={2} alignItems="flex-start">
              <Grid item xs={12} lg={5}>
                <Autocomplete
                  multiple
                  disableCloseOnSelect
                  options={shiftEmployees}
                  value={manualEmployees}
                  onChange={(_, value) => setManualEmployees(value)}
                  getOptionLabel={(option) => `${option.name || option.employeeId} (${option.employeeId}) · ${option.groupName}`}
                  isOptionEqualToValue={(option, value) => option.employeeId === value.employeeId}
                  renderInput={(params) => <TextField {...params} label="Shift employee(s)" placeholder="Select one or more persons" />}
                />
                <Button size="small" onClick={() => setManualEmployees(shiftEmployees)} disabled={!shiftEmployees.length || manualEmployees.length === shiftEmployees.length} sx={{ mt: .5, textTransform: "none", fontWeight: 850 }}>Select all active shift employees</Button>
              </Grid>
              <Grid item xs={12} sm={5} lg={2}>
                <TextField fullWidth type="date" label="Earned holiday date" value={manualEarnedDate} onChange={(event) => setManualEarnedDate(event.target.value)} InputLabelProps={{ shrink: true }} inputProps={{ max: new Date().toISOString().slice(0, 10) }} helperText={manualExpiryDate ? `Expires ${manualExpiryDate}` : "Select past holiday"} />
              </Grid>
              <Grid item xs={12} sm={7} lg={3}>
                <TextField fullWidth label="Reason / holiday" value={manualReason} onChange={(event) => setManualReason(event.target.value)} inputProps={{ maxLength: 300 }} helperText="Stored in the C-OFF audit record" />
              </Grid>
              <Grid item xs={12} lg={2}>
                <Button fullWidth variant="contained" startIcon={<CalendarPlus size={17} />} onClick={saveManualCompOff} disabled={manualSaving || !manualEmployees.length || !manualEarnedDate || !manualReason.trim()} sx={{ minHeight: 56, borderRadius: 2.5, textTransform: "none", fontWeight: 900, background: "#B45309", "&:hover": { background: "#92400E" } }}>{manualSaving ? "Adding…" : `Add C-OFF (${manualEmployees.length})`}</Button>
              </Grid>
            </Grid>
          </Box>

          <Box sx={{ overflowX: "auto", borderTop: "1px solid #E2E8F0" }}>
            <Table size="small">
              <TableHead><TableRow sx={{ background: "#F8FAFC" }}><TableCell sx={{ fontWeight: 900 }}>Employee</TableCell><TableCell sx={{ fontWeight: 900 }}>Group</TableCell><TableCell sx={{ fontWeight: 900 }}>Earned date</TableCell><TableCell sx={{ fontWeight: 900 }}>Expiry</TableCell><TableCell sx={{ fontWeight: 900 }}>Status</TableCell><TableCell sx={{ fontWeight: 900 }}>Reason</TableCell><TableCell sx={{ fontWeight: 900 }}>Entered by</TableCell></TableRow></TableHead>
              <TableBody>
                {manualCompOffs.slice(0, 100).map((credit) => <TableRow key={credit.id} hover><TableCell><Typography sx={{ fontSize: 12.5, fontWeight: 900 }}>{credit.employeeName || credit.employeeId}</Typography><Typography sx={{ color: "#64748B", fontSize: 10.5 }}>{credit.employeeId}</Typography></TableCell><TableCell>{credit.groupName || "-"}</TableCell><TableCell>{credit.earnedDate || "-"}</TableCell><TableCell>{credit.expiryDate || "-"}</TableCell><TableCell><Chip size="small" label={credit.status || "Available"} color={credit.status === "Used" ? "default" : "success"} sx={{ fontWeight: 850 }} /></TableCell><TableCell sx={{ minWidth: 240 }}>{credit.reason || "-"}</TableCell><TableCell>{credit.createdByName || "-"}</TableCell></TableRow>)}
                {!manualCompOffs.length && <TableRow><TableCell colSpan={7} align="center" sx={{ py: 3, color: "#64748B" }}>No manual C-OFF credits have been entered.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </Box>
        </GlassCard>}
      </>}

      <Dialog open={groupDialog} onClose={() => setGroupDialog(false)} fullWidth maxWidth="md"><DialogTitle sx={{ fontWeight: 900 }}>{editingId ? "Edit roster group" : "Create roster group"}</DialogTitle><DialogContent dividers><Stack spacing={2} mt={.5}><Stack direction={{ xs: "column", md: "row" }} spacing={2}><TextField label="Group name" value={form.groupName} onChange={(event) => setForm((current) => ({ ...current, groupName: event.target.value }))} fullWidth required /><TextField label="Effective from" type="date" value={form.startDate || ""} onChange={(event) => setForm((current) => ({ ...current, startDate: event.target.value }))} InputLabelProps={{ shrink: true }} fullWidth /><TextField label="Effective until" type="date" value={form.endDate || ""} onChange={(event) => setForm((current) => ({ ...current, endDate: event.target.value }))} InputLabelProps={{ shrink: true }} fullWidth /></Stack><Autocomplete options={employees} value={form.shiftInCharge} getOptionLabel={(option) => `${option?.name || option?.employeeId || ""}${option?.designation ? ` · ${option.designation}` : ""}`} isOptionEqualToValue={(option, value) => option.employeeId === value?.employeeId} onChange={(_, value) => setForm((current) => ({ ...current, shiftInCharge: value }))} renderInput={(params) => <TextField {...params} label="Shift In-Charge" required />} /><Autocomplete multiple options={employees.filter((item) => item.employeeId !== form.shiftInCharge?.employeeId)} value={form.members} getOptionLabel={(option) => `${option?.name || option?.employeeId || ""}${option?.designation ? ` · ${option.designation}` : ""}`} isOptionEqualToValue={(option, value) => option.employeeId === value?.employeeId} onChange={(_, value) => setForm((current) => ({ ...current, members: value }))} renderInput={(params) => <TextField {...params} label="Group members" placeholder="Select employees" />} /><Stack direction="row" alignItems="center"><Switch checked={form.isActive} onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))} color="success" /><Typography sx={{ fontWeight: 800 }}>Active group</Typography></Stack></Stack></DialogContent><DialogActions><Button onClick={() => setGroupDialog(false)}>Cancel</Button><Button onClick={saveGroup} disabled={saving || !form.groupName || !form.shiftInCharge} variant="contained" sx={{ background: "#03624C", fontWeight: 900 }}>{saving ? "Saving…" : "Save group"}</Button></DialogActions></Dialog>
    </AppShell>
  );
}
