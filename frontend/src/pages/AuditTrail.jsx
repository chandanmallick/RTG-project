import { useEffect, useMemo, useState } from "react";
import { Alert, Box, Button, Chip, MenuItem, Paper, Stack, TextField, Typography } from "@mui/material";
import { ClipboardList, RefreshCw } from "lucide-react";
import axios from "axios";
import AppShell from "../components/layout/AppShell";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";
const headers = () => ({ Authorization: `Bearer ${localStorage.getItem("portalToken") || ""}` });
const formatTime = (value) => value ? new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "-";

export default function AuditTrail() {
  const [data, setData] = useState({ items: [], sections: [], actors: [] });
  const [filters, setFilters] = useState({ section: "", actorId: "", startDate: "", endDate: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState("");

  const load = async () => {
    setLoading(true); setError("");
    try {
      const { data: response } = await axios.get(`${BASE_URL}/crew/audit-trail`, { headers: headers(), params: filters });
      setData(response || { items: [], sections: [], actors: [] });
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Audit trail could not be loaded.");
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  const hasItems = useMemo(() => data.items?.length > 0, [data.items]);

  return <AppShell><Box className="ui-kit-page" sx={{ display: "grid", gap: 2 }}>
    <Box sx={{ px: 3, py: 2.4, borderRadius: 3, color: "#fff", background: "linear-gradient(105deg,#081D52,#0675D8)" }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" gap={2}>
        <Box><Typography sx={{ fontSize: 24, fontWeight: 950 }}>Portal Audit Trail</Typography><Typography sx={{ fontSize: 12, opacity: .9 }}>User-wise approvals and successful data changes across portal sections.</Typography></Box>
        <ClipboardList size={30} />
      </Stack>
    </Box>
    <Paper sx={{ p: 1.5 }}><Stack direction={{ xs: "column", md: "row" }} spacing={1} alignItems={{ md: "center" }}>
      <TextField select size="small" label="Section" value={filters.section} onChange={(e) => setFilters((old) => ({ ...old, section: e.target.value }))} sx={{ minWidth: 190 }}><MenuItem value="">All sections</MenuItem>{(data.sections || []).map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}</TextField>
      <TextField select size="small" label="User" value={filters.actorId} onChange={(e) => setFilters((old) => ({ ...old, actorId: e.target.value }))} sx={{ minWidth: 210 }}><MenuItem value="">All users</MenuItem>{(data.actors || []).map((item) => <MenuItem key={item.employeeId} value={item.employeeId}>{item.name} · {item.employeeId}</MenuItem>)}</TextField>
      <TextField size="small" type="date" label="From" value={filters.startDate} onChange={(e) => setFilters((old) => ({ ...old, startDate: e.target.value }))} InputLabelProps={{ shrink: true }} />
      <TextField size="small" type="date" label="To" value={filters.endDate} onChange={(e) => setFilters((old) => ({ ...old, endDate: e.target.value }))} InputLabelProps={{ shrink: true }} />
      <Button variant="contained" startIcon={<RefreshCw size={15} />} onClick={load} disabled={loading}>{loading ? "Loading…" : "Load audit trail"}</Button>
    </Stack></Paper>
    {error && <Alert severity="error">{error}</Alert>}
    <Paper sx={{ overflow: "hidden" }}><Box sx={{ p: 1.5, borderBottom: "1px solid #E2E8F0" }}><Typography sx={{ fontWeight: 950 }}>{data.items?.length || 0} audit events</Typography></Box>
      <Box sx={{ overflow: "auto", maxHeight: "68vh" }}><table className="table theme-table mb-0"><thead><tr><th>Time</th><th>Section</th><th>User</th><th>Action</th><th>Details</th></tr></thead><tbody>
        {(data.items || []).map((item) => <tr key={item.id}><td style={{ whiteSpace: "nowrap" }}>{formatTime(item.createdOn)}</td><td><Chip size="small" label={item.section} sx={{ fontWeight: 800 }} /></td><td><strong>{item.actorName}</strong><div style={{ color: "#64748B", fontSize: 11 }}>{item.actorId}</div></td><td>{item.action}</td><td><Button size="small" variant="text" onClick={() => setExpanded(expanded === item.id ? "" : item.id)}>{expanded === item.id ? "Hide" : "View"}</Button>{expanded === item.id && <pre style={{ margin: "8px 0 0", maxWidth: 460, whiteSpace: "pre-wrap", fontSize: 11, color: "#334155" }}>{JSON.stringify({ changes: item.changes, query: item.query }, null, 2)}</pre>}</td></tr>)}
        {!hasItems && <tr><td colSpan="5" style={{ textAlign: "center", padding: 40, color: "#64748B" }}>No audit events match the selected filters.</td></tr>}
      </tbody></table></Box>
    </Paper>
  </Box></AppShell>;
}
