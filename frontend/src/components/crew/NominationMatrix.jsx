import { useMemo, useState } from "react";
import { Alert, Box, Button, Chip, Dialog, DialogContent, DialogTitle, IconButton, LinearProgress, MenuItem, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography } from "@mui/material";
import { X } from "lucide-react";

const tone = (items) => {
  const groups = new Set(items.map(i => i.status === "Approved" ? "Approved" : ["Rejected", "Cancelled", "Withdrawn"].includes(i.status) ? "Closed" : "Pending"));
  if (groups.size > 1) return { bg: "#E0E7FF", color: "#4338CA", label: "Mixed" };
  if (groups.has("Approved")) return { bg: "#DCFCE7", color: "#166534", label: "Approved" };
  if (groups.has("Pending")) return { bg: "#FEF3C7", color: "#92400E", label: "Pending" };
  return { bg: "#F1F5F9", color: "#64748B", label: "Closed" };
};
export default function NominationMatrix({ matrix, search = "", onManage, showTarget = false }) {
  const [programmeSearch, setProgrammeSearch] = useState("");
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [sort, setSort] = useState("name");
  const [selection, setSelection] = useState(null);
  const people = useMemo(() => {
    const pageQuery = search.trim().toLowerCase();
    const nameQuery = employeeSearch.trim().toLowerCase();
    return matrix.employees.filter(e => {
      const allFields = `${e.employeeName} ${e.employeeId} ${e.designation} ${e.groupName}`.toLowerCase();
      const employeeName = String(e.employeeName || "").toLowerCase();
      return allFields.includes(pageQuery) && employeeName.includes(nameQuery);
    }).sort((a, b) => sort === "days" ? b.approvedDays - a.approvedDays : sort === "pending" ? b.pending - a.pending : a.employeeName.localeCompare(b.employeeName));
  }, [matrix, search, employeeSearch, sort]);
  const programmes = matrix.programmes.filter(p => p.toLowerCase().includes(programmeSearch.toLowerCase()));
  const totals = people.reduce((a, e) => ({ nominations: a.nominations + e.total, approved: a.approved + e.approved, pending: a.pending + e.pending, days: a.days + e.approvedDays }), { nominations: 0, approved: 0, pending: 0, days: 0 });
  return <Box>
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2,1fr)", md: "repeat(5,1fr)" }, gap: 1, mb: 2 }}>
      {[["People", people.length, "#0F172A"], ["Nominations", totals.nominations, "#4338CA"], ["Approved", totals.approved, "#166534"], ["Awaiting decision", totals.pending, "#B45309"], ["Approved days", totals.days, "#0369A1"]].map(([label, value, color]) => <Box key={label} sx={{ p: 1.5, borderRadius: 2, border: "1px solid #E2E8F0", background: "#FFFFFF" }}><Typography sx={{ fontSize: 11, fontWeight: 700 }}   color="text.secondary">{label}</Typography><Typography sx={{ fontSize: 27, fontWeight: 850 }}   color={color}>{value}</Typography></Box>)}
    </Box>
    {!!matrix.zeroNominationUpcomingNames.length && <Alert severity="warning" sx={{ mb: 1.5, py: 0 }}><strong>{matrix.zeroNominationUpcomingNames.length} upcoming programme(s) without nominations.</strong> {matrix.zeroNominationUpcomingNames.slice(0, 3).join(" · ")}</Alert>}
    <Stack direction={{ xs: "column", sm: "row" }}   sx={{ ...({ mb: 1.5 }), gap: 1.5, justifyContent: "space-between" }}>
      <Stack sx={{ gap: 1, flexWrap: "wrap", alignItems: "center" }} direction="row"   >{[["Approved", "#DCFCE7"], ["Pending", "#FEF3C7"], ["Closed", "#F1F5F9"], ["Mixed", "#E0E7FF"]].map(([label, bg]) => <Chip key={label} size="small" label={label} sx={{ bgcolor: bg, fontWeight: 700 }} />)}<Typography variant="caption" color="text.secondary">Select a cell for all nomination details</Typography></Stack>
      <Stack sx={{ gap: 1, flexWrap: "wrap" }} direction="row" ><TextField size="small" label="Search employee name" value={employeeSearch} onChange={e => setEmployeeSearch(e.target.value)} /><TextField size="small" label="Find programme" value={programmeSearch} onChange={e => setProgrammeSearch(e.target.value)} /><TextField select size="small" label="Sort people" value={sort} onChange={e => setSort(e.target.value)} sx={{ minWidth: 165 }}><MenuItem value="name">Name A–Z</MenuItem><MenuItem value="days">Most training days</MenuItem><MenuItem value="pending">Most pending</MenuItem></TextField></Stack>
    </Stack>
    <Box sx={{ border: "1px solid #E2E8F0", borderRadius: 2, overflow: "auto", maxHeight: "calc(100vh - 410px)", minHeight: 260 }}>
      <Table stickyHeader size="small" aria-label="Training nomination matrix" sx={{ "& td, & th": { borderRight: "1px solid #F1F5F9" }, "& th": { background: "#F8FAFC" } }}>
        <TableHead><TableRow><TableCell sx={{ minWidth: 235, position: "sticky", left: 0, zIndex: 4, fontWeight: 850 }}>Employee / training progress</TableCell>{programmes.map(p => <TableCell key={p} align="center" sx={{ minWidth: 130, maxWidth: 180 }}><Tooltip title={`${p}${matrix.programmeDetails[p]?.startDate ? ` · ${matrix.programmeDetails[p].startDate}` : ""}`}><Typography sx={{ fontSize: 11, fontWeight: 800, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", color: matrix.zeroNominationUpcomingNames.includes(p) ? "#B45309" : "#334155" }}>{p}</Typography></Tooltip></TableCell>)}<TableCell align="right" sx={{ fontWeight: 850 }}>Total</TableCell></TableRow></TableHead>
        <TableBody>{people.map(e => <TableRow key={e.employeeId} hover><TableCell sx={{ position: "sticky", left: 0, zIndex: 2, background: "white" }}><Stack sx={{ justifyContent: "space-between", gap: 1 }} direction="row"  ><Box><Typography sx={{ fontWeight: 800, fontSize: 12 }}  >{e.employeeName}</Typography><Typography sx={{ fontSize: 10 }}  color="text.secondary">{e.employeeId} · {e.groupName}</Typography></Box>{showTarget ? <Tooltip title="Approved training days against the 7-day target"><Typography sx={{ fontWeight: 800, fontSize: 11 }} color={e.approvedDays >= 7 ? "#15803D" : "#64748B"}>{e.approvedDays}/7d</Typography></Tooltip> : <Tooltip title="Approved training days across all financial years"><Typography sx={{ fontWeight: 800, fontSize: 11 }} color="#64748B">{e.approvedDays}d</Typography></Tooltip>}</Stack>{showTarget && <LinearProgress aria-label={`${e.employeeName}: ${e.approvedDays} of 7 training days`} variant="determinate" value={Math.min(100, e.approvedDays / 7 * 100)} sx={{ mt: .8, height: 3, borderRadius: 3, bgcolor: "#EEF2FF", "& .MuiLinearProgress-bar": { bgcolor: e.approvedDays >= 7 ? "#16A34A" : "#6366F1" } }} />}</TableCell>
          {programmes.map(p => { const items = e.cells[p] || []; const t = tone(items); return <TableCell key={p} align="center" sx={{ p: .6 }}>{items.length ? <Button fullWidth size="small" aria-label={`${e.employeeName}, ${p}: ${items.length} nominations. Open details`} onClick={() => setSelection({ employee: e, programme: p, items })} sx={{ bgcolor: t.bg, color: t.color, minWidth: 60, borderRadius: 1.5, textTransform: "none", fontSize: 11, fontWeight: 800, "&:hover": { bgcolor: t.bg, outline: `1px solid ${t.color}` } }}>{items.length} · {t.label}</Button> : <Typography color="#CBD5E1" aria-label="No nomination">—</Typography>}</TableCell>; })}<TableCell align="right" sx={{ fontWeight: 850 }}>{e.total}</TableCell></TableRow>)}
          {!people.length && <TableRow><TableCell colSpan={programmes.length + 2} align="center" sx={{ py: 7 }}><Typography sx={{ fontWeight: 750 }} >No matching nominations</Typography><Typography variant="body2" color="text.secondary">Try another employee, year or status.</Typography></TableCell></TableRow>}
        </TableBody>
      </Table>
    </Box>
    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>{people.length} people · {programmes.length} programmes · Summary and day totals cover all programmes for the matching employees.</Typography>
    <Dialog open={Boolean(selection)} onClose={() => setSelection(null)} fullWidth maxWidth="sm"><DialogTitle><Stack sx={{ justifyContent: "space-between", alignItems: "center" }} direction="row"  ><Typography sx={{ fontWeight: 850 }} >{selection?.employee.employeeName}</Typography><IconButton aria-label="Close nomination details" onClick={() => setSelection(null)}><X size={20} /></IconButton></Stack><Typography variant="body2" color="text.secondary">{selection?.programme}</Typography></DialogTitle><DialogContent><Stack sx={{ gap: 1.5 }} >{selection?.items.map((item, i) => <Box key={item.id || i} sx={{ p: 2, borderRadius: 2, border: "1px solid #E2E8F0" }}><Chip size="small" label={item.status || "Unknown"} sx={{ bgcolor: tone([item]).bg }} /><Typography sx={{ ...({ mt: 1 }), fontSize: 13 }} >{item.startDate || item.trainingDate || item.financialYear || "Historical nomination"}{item.endDate ? ` — ${item.endDate}` : ""}</Typography><Typography sx={{ fontSize: 12 }}  color="text.secondary">{item.trainingDays ? `${item.trainingDays} days · ` : ""}{item.approvalProgress || "No further approval details"}</Typography>{onManage && item.id && !item.historicalImport && <Button size="small" onClick={() => { setSelection(null); onManage(item); }}>Open / manage nomination</Button>}</Box>)}</Stack></DialogContent></Dialog>
  </Box>;
}
