import { useState } from "react";
import { Alert, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Stack, Typography } from "@mui/material";
import api from "../../crewLegacy/api";

// Use the server's live delete permission for every date, regardless of status.
export default function LeaveDelete({ rows = [], busy, demo, onUpdated, onDemoDelete }) {
  const eligible = rows.filter(row => row.canDeleteMaster === true);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  if (!eligible.length) return null;

  const remove = async () => {
    setSaving(true); setError("");
    const deleted = [];
    try {
      for (const id of selected) {
        if (!demo) await api.delete(`/leave/master/${id}`);
        deleted.push(id);
      }
      setOpen(false);
    } catch (failure) {
      setError(failure.response?.data?.detail || "Could not delete all selected dates. Successfully deleted dates have been removed; retry the remaining dates.");
      setSelected(current => current.filter(id => !deleted.includes(id)));
    } finally {
      if (deleted.length) {
        if (demo) onDemoDelete?.(deleted);
        else {
          window.dispatchEvent(new Event("crew-workflows-changed"));
          localStorage.setItem("crew-workflows-changed", String(Date.now()));
          onUpdated?.();
        }
      }
      setSaving(false);
    }
  };

  return <>
    <Button size="small" color="error" disabled={busy || saving} onClick={() => { setSelected(eligible.map(row => row.id)); setError(""); setOpen(true); }}>Delete leave</Button>
    <Dialog open={open} onClose={() => !saving && setOpen(false)} fullWidth maxWidth="sm" PaperProps={{ sx: { borderRadius: 4 } }}>
      <DialogTitle>Delete leave records</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={1.5}>
          <Typography fontWeight={800}>{rows[0]?.name || rows[0]?.employeeName} ({rows[0]?.employeeId})</Typography>
          <Alert severity="warning">Selected dates will be removed from active leave records and their duty effects cleared. A deletion audit is retained. This action cannot be undone.</Alert>
          {error && <Alert severity="error">{error}</Alert>}
          {eligible.map(row => <FormControlLabel key={row.id} control={<Checkbox disabled={saving} checked={selected.includes(row.id)} onChange={event => setSelected(current => event.target.checked ? [...current, row.id] : current.filter(id => id !== row.id))} />} label={`${row.date} · ${row.leaveType || "Leave"} · ${row.finalStatus}`} />)}
        </Stack>
      </DialogContent>
      <DialogActions><Button disabled={saving} onClick={() => setOpen(false)}>Keep leave</Button><Button color="error" variant="contained" disabled={saving || !selected.length} onClick={remove}>{saving ? "Deleting…" : `Delete ${selected.length} date(s)`}</Button></DialogActions>
    </Dialog>
  </>;
}
