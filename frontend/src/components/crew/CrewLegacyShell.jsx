import { Alert, Box, Button, Stack, Typography } from "@mui/material";
import { UserCog } from "lucide-react";
import { useNavigate } from "react-router-dom";

import AppShell from "../layout/AppShell";

export default function CrewLegacyShell({ children }) {
  const navigate = useNavigate();
  const employeeId = localStorage.getItem("crewEmployeeId") || "";
  const employeeName = localStorage.getItem("crewEmployeeName") || employeeId;

  return (
    <AppShell>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
        <Box>
          <Typography sx={{ fontSize: 12, fontWeight: 900, color: "#17876D", letterSpacing: ".12em", textTransform: "uppercase" }}>Crew Management</Typography>
          <Typography sx={{ color: "#64748B", fontSize: 13 }}>Complete legacy workflow integrated with DHRUV.</Typography>
        </Box>
        <Button onClick={() => navigate("/crew/user-context")} startIcon={<UserCog size={17} />} variant="outlined" sx={{ borderRadius: 3, textTransform: "none", fontWeight: 900 }}>
          {employeeId ? `Acting as ${employeeName}` : "Select acting employee"}
        </Button>
      </Box>
      {!employeeId && <Alert severity="warning">Select an acting employee before using leave, replacement, profile or notification actions.</Alert>}
      <Box sx={{ "& > .MuiBox-root:first-of-type": { borderRadius: 4 }, minWidth: 0 }}>{children}</Box>
    </AppShell>
  );
}
