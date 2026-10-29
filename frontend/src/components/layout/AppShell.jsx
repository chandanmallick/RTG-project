import { useLocation } from "react-router-dom";
import SpecialEventNotice from "../crew/SpecialEventNotice";
import { Box } from "@mui/material";
import TopNavbar from "./TopNavbar";
import CrewTableTools from "../crew/CrewTableTools";

export default function AppShell({ children, viewportLocked = false }) {
  const { pathname } = useLocation();
  return (
    <Box
      className="ui-kit-app"
      sx={{
        minHeight: viewportLocked ? 0 : "100vh",
        height: viewportLocked ? "100%" : undefined,
        maxHeight: viewportLocked ? "100%" : undefined,
        flex: viewportLocked ? 1 : undefined,
        overflow: viewportLocked ? "hidden" : undefined,
        boxSizing: "border-box",
        backgroundColor: "var(--bg-surface)",
        p: viewportLocked ? { xs: 1, md: 1.25 } : { xs: 1.25, md: 2.5 },
        position: "relative",
        display: "flex",
        flexDirection: "column",
        gap: viewportLocked ? 1.2 : 2.5,
      }}
    >
      <Box className="no-print crew-roster-screen-only" sx={{ "@media print": { display: "none !important" } }}>
        <CrewTableTools />
      </Box>
      {/* Top Navigation Menu Bar */}
      <Box
        className="no-print crew-roster-screen-only"
        sx={{
          flexShrink: 0,
          "@media print": { display: "none !important" },
        }}
      >
        <TopNavbar />
      </Box>
      {pathname.startsWith("/crew/") && (
        <Box
          className="no-print crew-roster-screen-only"
          sx={{
            flexShrink: 0,
            "@media print": { display: "none !important" },
          }}
        >
          <SpecialEventNotice />
        </Box>
      )}

      {/* Main Content Area */}
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: viewportLocked ? 1.2 : 2.5,
          width: "100%",
          flex: viewportLocked ? 1 : undefined,
          minHeight: viewportLocked ? 0 : undefined,
          height: viewportLocked ? "100%" : undefined,
          overflow: viewportLocked ? "hidden" : undefined,
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
