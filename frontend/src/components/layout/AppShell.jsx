import { Box } from "@mui/material";
import TopNavbar from "./TopNavbar";

export default function AppShell({ children }) {
  return (
    <Box
      className="ui-kit-app"
      sx={{
        minHeight: "100vh",
        boxSizing: "border-box",
        backgroundColor: "var(--bg-surface)",
        p: { xs: 1.25, md: 2.5 },
        position: "relative",
        display: "flex",
        flexDirection: "column",
        gap: 2.5,
      }}
    >
      {/* Top Navigation Menu Bar */}
      <TopNavbar />

      {/* Main Content Area */}
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: 2.5,
          width: "100%",
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
