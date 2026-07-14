import { useEffect, useState } from "react";
import { Alert, Autocomplete, Box, Button, Paper, Stack, TextField, Typography } from "@mui/material";
import { CheckCircle2, UserCog } from "lucide-react";
import { useNavigate } from "react-router-dom";

import AppShell from "../../components/layout/AppShell";
import GlassCard from "../../components/ui/GlassCard";
import crewApi from "../../services/crewApi";

export default function CrewUserContext() {
  const navigate = useNavigate();
  const [employees, setEmployees] = useState([]);
  const [selected, setSelected] = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    crewApi.employees().then((data) => {
      setEmployees(data);
      const current = localStorage.getItem("crewEmployeeId");
      setSelected(data.find((item) => item.employeeId === current) || null);
    });
  }, []);

  const apply = () => {
    if (!selected) return;
    localStorage.setItem("crewEmployeeId", selected.employeeId);
    localStorage.setItem("crewEmployeeName", selected.name || selected.employeeId);
    // Compatibility values consumed by the transferred screens. These are not
    // security credentials; the backend acting-user bridge marks the context.
    localStorage.setItem("employeeId", selected.employeeId);
    localStorage.setItem("name", selected.name || selected.employeeId);
    localStorage.setItem("role", "admin");
    localStorage.setItem("token", "dhruv-acting-user-context");
    setSaved(true);
  };

  return (
    <AppShell>
      <Box><Typography sx={{ fontSize: 12, fontWeight: 900, color: "#17876D", letterSpacing: ".12em", textTransform: "uppercase" }}>Crew Management</Typography><Typography variant="h4" sx={{ fontWeight: 900, color: "#0F172A", letterSpacing: "-.035em", mt: .5 }}>Acting Employee</Typography><Typography sx={{ color: "#64748B", mt: .5 }}>Temporary identity bridge for workflows that previously depended on Crew login.</Typography></Box>
      {saved && <Alert severity="success" icon={<CheckCircle2 size={20} />}>Acting employee updated. Leave, replacement, profile and notifications will use this employee.</Alert>}
      <GlassCard hover={false} padding={3} sx={{ maxWidth: 760 }}>
        <Stack spacing={2.5}>
          <Paper elevation={0} sx={{ width: 58, height: 58, borderRadius: 4, display: "grid", placeItems: "center", background: "#ECFDF5", color: "#03624C" }}><UserCog size={28} /></Paper>
          <Autocomplete options={employees} value={selected} onChange={(_, value) => { setSelected(value); setSaved(false); }} getOptionLabel={(item) => `${item.name || item.employeeId} · ${item.designation || item.employeeId}`} isOptionEqualToValue={(option, value) => option.employeeId === value?.employeeId} renderInput={(params) => <TextField {...params} label="Employee" placeholder="Search by name or designation" />} />
          <Alert severity="info">This selector is a compatibility mechanism, not authentication. When DHRUV login is implemented, its verified employee ID and role should replace this context.</Alert>
          <Stack direction="row" spacing={1.5}><Button onClick={apply} disabled={!selected} variant="contained" sx={{ background: "#03624C", borderRadius: 3, textTransform: "none", fontWeight: 900 }}>Use this employee</Button><Button onClick={() => navigate("/crew/dashboard")} sx={{ borderRadius: 3, textTransform: "none", fontWeight: 900 }}>Open Crew dashboard</Button></Stack>
        </Stack>
      </GlassCard>
    </AppShell>
  );
}
