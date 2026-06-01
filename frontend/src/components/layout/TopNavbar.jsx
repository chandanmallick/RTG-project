import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Box,
  Typography,
  Button,
  Menu,
  MenuItem,
  InputBase,
  IconButton,
  Avatar,
  Badge
} from "@mui/material";

import KeyboardArrowDownRoundedIcon from "@mui/icons-material/KeyboardArrowDownRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import MailOutlineRoundedIcon from "@mui/icons-material/MailOutlineRounded";
import NotificationsNoneRoundedIcon from "@mui/icons-material/NotificationsNoneRounded";

export default function TopNavbar() {
  const location = useLocation();
  const navigate = useNavigate();

  // Menu states for the RTG dropdown
  const [anchorEl, setAnchorEl] = useState(null);
  const open = Boolean(anchorEl);

  const handleOpenMenu = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleCloseMenu = () => {
    setAnchorEl(null);
  };

  const handleNavigate = (path) => {
    navigate(path);
    handleCloseMenu();
  };

  // Determine if RTG tab is active
  const isRTGActive =
    location.pathname === "/rtg-dashboard" ||
    location.pathname === "/database-sync";

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: "transparent",
        px: 1,
        py: 1,
        position: "relative",
        zIndex: 100,
        gap: 2,
      }}
    >
      {/* LEFT BRAND SECTION */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
        {/* Sage green logo icon */}
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: "14px",
            background: "#5AA55A",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 4px 12px rgba(90, 165, 90, 0.3)",
          }}
        >
          {/* Custom vector leaf/energy node logo */}
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M11 2a4 4 0 0 0-4 4v5h4V2Z" />
            <path d="M13 22a4 4 0 0 0 4-4v-5h-4v9Z" />
            <path d="M2 13a4 4 0 0 0 4 4h5v-4H2Z" />
            <path d="M22 11a4 4 0 0 0-4-4h-5v4h9Z" />
          </svg>
        </Box>
        <Typography
          sx={{
            fontSize: 20,
            fontWeight: 850,
            color: "#0F172A",
            letterSpacing: "-0.03em",
          }}
        >
          RTG Portal
        </Typography>
      </Box>

      {/* MIDDLE NAVIGATION PILLS */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        {/* RTG Dropdown pill */}
        <Button
          onClick={handleOpenMenu}
          endIcon={
            <KeyboardArrowDownRoundedIcon
              sx={{
                color: isRTGActive ? "#FFF" : "#475569",
                transition: "transform 0.2s",
                transform: open ? "rotate(180deg)" : "none",
              }}
            />
          }
          sx={{
            borderRadius: "999px",
            textTransform: "none",
            fontSize: 14,
            fontWeight: 700,
            px: 2.5,
            py: 1,
            minHeight: 40,
            backgroundColor: isRTGActive ? "#5AA55A" : "transparent",
            color: isRTGActive ? "#FFFFFF" : "#475569",
            "&:hover": {
              backgroundColor: isRTGActive ? "#499249" : "#F3F4F6",
            },
          }}
        >
          RTG
        </Button>

        <Menu
          anchorEl={anchorEl}
          open={open}
          onClose={handleCloseMenu}
          disableScrollLock
          PaperProps={{
            sx: {
              mt: 1,
              borderRadius: "16px",
              boxShadow: "0 10px 40px rgba(15, 23, 42, 0.08)",
              border: "1px solid #E2E8F0",
              minWidth: 180,
              p: 0.5,
            },
          }}
        >
          <MenuItem
            onClick={() => handleNavigate("/rtg-dashboard")}
            sx={{
              borderRadius: "10px",
              py: 1,
              fontSize: 13.5,
              fontWeight: 700,
              color: location.pathname === "/rtg-dashboard" ? "#0F4B2D" : "#334155",
              backgroundColor:
                location.pathname === "/rtg-dashboard" ? "#E1F5FF" : "transparent",
              "&:hover": {
                backgroundColor:
                  location.pathname === "/rtg-dashboard" ? "#D2ECFA" : "#F8FAFC",
              },
            }}
          >
            RTG Dashboard
          </MenuItem>
          <MenuItem
            onClick={() => handleNavigate("/database-sync")}
            sx={{
              borderRadius: "10px",
              py: 1,
              fontSize: 13.5,
              fontWeight: 700,
              color: location.pathname === "/database-sync" ? "#0F4B2D" : "#334155",
              backgroundColor:
                location.pathname === "/database-sync" ? "#E1F5FF" : "transparent",
              "&:hover": {
                backgroundColor:
                  location.pathname === "/database-sync" ? "#D2ECFA" : "#F8FAFC",
              },
            }}
          >
            Database Sync
          </MenuItem>
        </Menu>

        {/* Mock Placeholder Tabs */}
        {["Calendar", "Analytics", "Settings"].map((tab) => (
          <Button
            key={tab}
            disabled
            sx={{
              borderRadius: "999px",
              textTransform: "none",
              fontSize: 14,
              fontWeight: 700,
              px: 2.5,
              py: 1,
              color: "#94A3B8 !important", // disabled slate-300 color
              backgroundColor: "transparent",
            }}
          >
            {tab}
          </Button>
        ))}
      </Box>

      {/* RIGHT UTILITIES SECTION */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
        {/* Search bar */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            backgroundColor: "#FFFFFF",
            borderRadius: "14px",
            px: 1.5,
            py: 0.6,
            width: 220,
            border: "1px solid #E5E7EB",
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.02)",
            transition: "all 0.2s",
            "&:focus-within": {
              borderColor: "#CBD5E1",
              boxShadow: "0 4px 16px rgba(0, 0, 0, 0.04)",
            },
          }}
        >
          <SearchRoundedIcon sx={{ color: "#94A3B8", fontSize: 18, mr: 1 }} />
          <InputBase
            placeholder="Search..."
            sx={{
              fontSize: 13,
              fontWeight: 600,
              width: "100%",
              "& input::placeholder": {
                color: "#94A3B8",
                opacity: 1,
              },
            }}
          />
        </Box>

        {/* Icons */}
        <IconButton sx={{ color: "#64748B", p: 1 }}>
          <Badge color="error" variant="dot" invisible>
            <MailOutlineRoundedIcon sx={{ fontSize: 20 }} />
          </Badge>
        </IconButton>

        <IconButton sx={{ color: "#64748B", p: 1 }}>
          <Badge color="error" variant="dot">
            <NotificationsNoneRoundedIcon sx={{ fontSize: 20 }} />
          </Badge>
        </IconButton>

        {/* User profile avatar */}
        <Avatar
          sx={{
            width: 38,
            height: 38,
            border: "2px solid #E2E8F0",
            cursor: "pointer",
          }}
          src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80"
        />
      </Box>
    </Box>
  );
}
