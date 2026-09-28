import { useEffect, useState } from "react";
import dayjs from "dayjs";
import { Alert, Autocomplete, Box, Button, Stack, TextField, Typography } from "@mui/material";
import api from "../../crewLegacy/api";

export default function NominationEditor({ record, proposedStartDate, onChanged }) {
  const [mode, setMode] = useState(proposedStartDate ? "edit" : "");
  const [people, setPeople] = useState([]);
  const [employeeId, setEmployeeId] = useState(record.employeeId);
  const [start, setStart] = useState(proposedStartDate || record.startDate);
  const [end, setEnd] = useState(proposedStartDate ? dayjs(proposedStartDate).add(dayjs(record.endDate).diff(dayjs(record.startDate), "day"), "day").format("YYYY-MM-DD") : record.endDate);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  useEffect(() => {
    let active = true;
    if (mode === "edit") api.get(`/training-assign/nomination/${record.id}/candidates`).then(({ data }) => { if (active) setPeople(data); }).catch(() => { if (active) setNotice({ severity: "error", text: "Employee choices could not be loaded. Close and reopen to retry." }); });
    return () => { active = false; };
  }, [mode, record.id]);
  if (!record.canEdit) return null;
  const selected = people.find(person => person.employeeId === employeeId) || { employeeId, name: record.employeeName };
  const save = async () => {
    setBusy(true); setNotice(null);
    try {
      const { data } = await api.put(`/training-assign/nomination/${record.id}`, { action: mode === "remove" ? "cancel" : "edit", revision: record.revision, employeeId, startDate: start, endDate: end, reason: reason.trim() });
      setMode(""); setReason(""); setNotice({ severity: "success", text: data.message });
      window.dispatchEvent(new Event("crew-workflows-changed"));
      localStorage.setItem("crew-workflows-changed", String(Date.now()));
      await onChanged?.();
    } catch (error) { setNotice({ severity: "error", text: error.response?.data?.detail || error.message || "Change could not be saved." }); }
    finally { setBusy(false); }
  };
  return <Box sx={{ p: 2, border: "1px solid #CBD5E1", borderRadius: 2, bgcolor: "#F8FAFC" }}>
    <Typography sx={{ fontWeight: 800, mb: 1 }}>Manage nomination</Typography>
    {notice && <Alert severity={notice.severity} sx={{ mb: 1 }}>{notice.text}</Alert>}
    {!mode ? <Stack direction="row" sx={{ gap: 1 }}><Button variant="outlined" onClick={() => setMode("edit")}>Change employee / dates</Button><Button color="error" onClick={() => setMode("remove")}>Remove nomination</Button></Stack> : <Stack sx={{ gap: 2 }}>
      <Alert severity={mode === "remove" ? "warning" : "info"}>{mode === "remove" ? "Remove this nomination and restore its previous duties? Its history will be retained." : "Changes restart approval. Previous training duties, replacement cover and linked OFF requests will be cleared. These dates apply to this nomination only."}</Alert>
      {mode === "edit" && <>
        <Autocomplete options={people} value={selected} getOptionLabel={person => `${person.name || person.employeeId} (${person.employeeId})`} isOptionEqualToValue={(a, b) => a.employeeId === b.employeeId} disableClearable disabled={busy} onChange={(_, person) => setEmployeeId(person.employeeId)} renderInput={params => <TextField {...params} label="Nominated employee" size="small" />} />
        <Stack direction={{ xs: "column", sm: "row" }} sx={{ gap: 2 }}><TextField fullWidth size="small" type="date" label="Start date" value={start || ""} disabled={busy} onChange={e => setStart(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} /><TextField fullWidth size="small" type="date" label="End date" value={end || ""} disabled={busy} onChange={e => setEnd(e.target.value)} slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: start } }} /></Stack>
      </>}
      <TextField label="Reason for change" value={reason} onChange={e => setReason(e.target.value)} disabled={busy} fullWidth multiline minRows={2} slotProps={{ htmlInput: { maxLength: 1000 } }} />
      <Stack direction="row" sx={{ gap: 1 }}><Button variant="contained" color={mode === "remove" ? "error" : "primary"} disabled={busy || !reason.trim() || (mode === "edit" && (!start || !end || end < start))} onClick={save}>{busy ? "Saving..." : mode === "remove" ? "Confirm removal" : "Save changes"}</Button><Button disabled={busy} onClick={() => setMode("")}>Back</Button></Stack>
    </Stack>}
  </Box>;
}
