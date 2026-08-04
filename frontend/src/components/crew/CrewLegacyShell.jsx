import { Box } from "@mui/material";

import AppShell from "../layout/AppShell";

export default function CrewLegacyShell({ children }) {
  return (
    <AppShell>
      <Box sx={{ "& > .MuiBox-root:first-of-type": { borderRadius: 4 }, minWidth: 0 }}>{children}</Box>
    </AppShell>
  );
}
