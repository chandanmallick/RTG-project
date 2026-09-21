import { Box } from "@mui/material";
import TopNavbar from "./TopNavbar";
import CrewTableTools from "../crew/CrewTableTools";

export default function AppShell({ children, viewportLocked = false }) {
  return (
    <Box
      className="ui-kit-app"
      sx={{
        minHeight: viewportLocked ? 0 : "100vh",
        height: viewportLocked ? "100dvh" : undefined,
        overflow: viewportLocked ? "hidden" : undefined,
        boxSizing: "border-box",
        backgroundColor: "var(--bg-surface)",
        p: { xs: 1.25, md: 2.5 },
        position: "relative",
        display: "flex",
        flexDirection: "column",
        gap: 2.5,
      }}
    >
      <CrewTableTools />
      {/* Top Navigation Menu Bar */}
      <TopNavbar />

      {/* Main Content Area */}
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: 2.5,
          width: "100%",
          flex: viewportLocked ? 1 : undefined,
          minHeight: viewportLocked ? 0 : undefined,
          overflow: viewportLocked ? "hidden" : undefined,
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
