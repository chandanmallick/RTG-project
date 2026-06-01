import { Box } from "@mui/material";
import TopNavbar from "./TopNavbar";

export default function AppShell({ children }) {
  return (
    <Box
      sx={{
        height: "100vh",
        boxSizing: "border-box",
        background: "#F4F6F8",
        overflow: "hidden",
        p: 2.5,
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
          flex: 1,
          overflow: "auto",
          display: "flex",
          flexDirection: "column",
          "&::-webkit-scrollbar": {
            width: 8,
            height: 8,
          },
          "&::-webkit-scrollbar-thumb": {
            background: "#CBD5E1",
            borderRadius: 999,
          },
        }}
      >
        {children}
      </Box>
    </Box>
  );
}