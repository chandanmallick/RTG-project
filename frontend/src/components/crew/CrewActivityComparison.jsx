import { useMemo } from "react";
import { Box, Chip, Paper, Stack, Typography } from "@mui/material";
const kinds = [["Leave", "#E11D48"], ["Training", "#7C3AED"], ["C-OFF", "#D97706"], ["Replacement duty", "#059669"]];
export default function CrewActivityComparison({ rows }) {
  const people = useMemo(() => {
    const map = new Map();
    rows.forEach(row => {
      const id = row.employeeId || row.employeeName;
      if (!map.has(id)) map.set(id, { id, name: row.employeeName || id, counts: {}, total: 0 });
      const person = map.get(id); person.total++; person.counts[row.kind] = (person.counts[row.kind] || 0) + 1;
    });
    return [...map.values()].sort((a,b) => b.total - a.total || a.name.localeCompare(b.name));
  }, [rows]);
  if (!people.length) return <Box sx={{ p: 6, textAlign: "center", color: "text.secondary" }}>No activity matches your filters.</Box>;
  return <Box sx={{ p: 2 }}><Stack direction="row"   sx={{ ...({ mb: 2 }), gap: 2, flexWrap: "wrap" }}>{kinds.map(([kind,color]) => <Stack sx={{ gap: .6, alignItems: "center" }} key={kind} direction="row"  ><Box sx={{ width: 8, height: 8, borderRadius: 2, bgcolor: color }} /><Typography variant="caption">{kind}</Typography></Stack>)}</Stack><Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2,1fr)", xl: "repeat(3,1fr)" }, gap: 1.5, maxHeight: "55vh", overflow: "auto" }}>{people.map(p => <Paper variant="outlined" key={p.id} sx={{ p: 2, borderRadius: 3 }}><Stack sx={{ justifyContent: "space-between", gap: 1 }} direction="row"  ><Box><Typography sx={{ fontWeight: 850 }} >{p.name}</Typography><Typography variant="caption" color="text.secondary">{p.id}</Typography></Box><Chip size="small" label={`${p.total} records`} /></Stack><Box aria-label={`Activity distribution for ${p.name}`} sx={{ mt: 2, mb: 1.5, display: "flex", height: 7, borderRadius: 4, overflow: "hidden", bgcolor: "#F1F5F9" }}>{kinds.map(([kind,color]) => <Box key={kind} sx={{ width: `${100*(p.counts[kind] || 0)/p.total}%`, bgcolor: color }} />)}</Box><Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>{kinds.map(([kind,color]) => <Stack sx={{ justifyContent: "space-between" }} key={kind} direction="row" ><Typography sx={{ fontSize: 11 }}  color="text.secondary">{kind}</Typography><Typography sx={{ fontSize: 13, fontWeight: 850 }}   color={color}>{p.counts[kind] || 0}</Typography></Stack>)}</Box></Paper>)}</Box><Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1.5 }}>Counts show matching activity records, including their current approval status; they are not a count of approved days.</Typography></Box>;
}
