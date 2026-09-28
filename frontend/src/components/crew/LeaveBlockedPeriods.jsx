import { useEffect, useState } from "react";
import { Alert, Box, Button, Chip, Collapse, Dialog, DialogActions, DialogContent, DialogTitle, Paper, Stack, TextField, Typography } from "@mui/material";
import { CalendarRange, Plus, ShieldCheck } from "lucide-react";
import api from "../../crewLegacy/api";

export default function LeaveBlockedPeriods({ isAdmin = false }) {
  const [periods, setPeriods] = useState([]);
  const [open, setOpen] = useState(false);
  const [revoke, setRevoke] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ startDate: "", endDate: "", reason: "" });
  const load = async () => {
    try { setPeriods((await api.get("/leave/blocked-periods")).data || []); }
    catch (e) { setError(e.response?.data?.detail || "Unable to load blocked leave periods."); }
  };
  useEffect(() => { load(); }, []);
  const save = async () => {
    setBusy(true); setError("");
    try {
      if (revoke) await api.delete(`/leave/blocked-periods/${revoke.id}`);
      else await api.post("/leave/blocked-periods", form);
      setOpen(false); setRevoke(null); setForm({ startDate: "", endDate: "", reason: "" }); await load();
    } catch (e) { setError(e.response?.data?.detail || "Unable to update this leave period."); }
    finally { setBusy(false); }
  };
  const localNow = new Date();
  const localToday = `${localNow.getFullYear()}-${String(localNow.getMonth()+1).padStart(2,"0")}-${String(localNow.getDate()).padStart(2,"0")}`;
  const current = isAdmin ? periods : periods.filter(p => p.endDate >= localToday);
  if (!isAdmin && !current.length && !error) return null;
  return <Paper elevation={0} sx={{ p: 2, borderRadius: 3, border: "1px solid #E2E8F0", background: "#FAFCFF" }}>
    <Stack sx={{ gap: 1.5, alignItems: { sm: "center" }, justifyContent: "space-between" }} direction={{ xs: "column", sm: "row" }}   >
      <Stack sx={{ gap: 1.5, alignItems: "center" }} direction="row"  ><Box sx={{ p: 1, display: "flex", borderRadius: 2, bgcolor: "#EEF2FF", color: "#4338CA" }}><ShieldCheck size={22} /></Box><Box><Typography sx={{ fontWeight: 850 }} >Leave availability</Typography><Typography variant="body2" color="text.secondary">{current.length ? `${current.length} blocked period(s) · applies to everyone` : "Leave applications are open"}</Typography></Box></Stack>
      {isAdmin && <Button startIcon={<Plus size={16} />} variant="outlined" onClick={() => { setError(""); setOpen(true); }}>Block a period</Button>}
    </Stack>
    {error && <Alert severity="error" sx={{ mt: 1.5 }}>{error}</Alert>}
    <Collapse in={current.length > 0}><Stack  sx={{ ...({ mt: 1.5, maxHeight: 220, overflow: "auto" }), gap: 1 }}>{current.map(p => <Stack key={p.id} direction={{ xs: "column", sm: "row" }}   sx={{ ...({ p: 1.5, border: "1px solid #FED7AA", borderRadius: 2, bgcolor: "#FFF7ED" }), gap: 1.5, alignItems: { sm: "center" } }}>
      <CalendarRange size={19} color="#B45309" /><Box sx={{ flex: 1 }}><Typography sx={{ fontWeight: 800, fontSize: 13 }}  >{p.startDate} — {p.endDate} <Chip size="small" label="Blocked" sx={{ ml: 1, height: 21, bgcolor: "#FFEDD5", color: "#9A3412" }} /></Typography><Typography sx={{ fontSize: 12 }}  color="text.secondary">{p.reason}</Typography></Box>
      {isAdmin && <Button size="small" onClick={() => { setError(""); setRevoke(p); }}>Reopen period</Button>}
    </Stack>)}</Stack></Collapse>
    <Dialog open={open || Boolean(revoke)} onClose={() => { if (!busy) { setOpen(false); setRevoke(null); } }} fullWidth maxWidth="sm">
      <DialogTitle>{revoke ? "Reopen leave applications?" : "Block leave for a period"}</DialogTitle>
      <DialogContent><Stack  sx={{ ...({ pt: 1 }), gap: 2 }}>
        <Alert severity="info">All employees, including administrators, are covered. Existing leave requests remain unchanged. Dates are inclusive.</Alert>
        {error && <Alert severity="error">{error}</Alert>}
        {revoke ? <Typography>{revoke.startDate} — {revoke.endDate}<br />{revoke.reason}</Typography> : <>
          <Stack sx={{ gap: 2 }} direction={{ xs: "column", sm: "row" }} >{["startDate", "endDate"].map(key => <TextField slotProps={{ inputLabel: { shrink: true } }} key={key} fullWidth type="date" label={key === "startDate" ? "From" : "Through"}  value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} />)}</Stack>
          <TextField slotProps={{ htmlInput: { maxLength: 500 } }} label="Reason visible to employees" multiline minRows={2}  value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} />
        </>}
      </Stack></DialogContent>
      <DialogActions sx={{ p: 2 }}><Button disabled={busy} onClick={() => { setOpen(false); setRevoke(null); }}>Cancel</Button><Button variant="contained" disabled={busy || (!revoke && (!form.startDate || !form.endDate || form.endDate < form.startDate || !form.reason.trim()))} onClick={save}>{busy ? "Saving…" : revoke ? "Reopen period" : "Block leave"}</Button></DialogActions>
    </Dialog>
  </Paper>;
}
