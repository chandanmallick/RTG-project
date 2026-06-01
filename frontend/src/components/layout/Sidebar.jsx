import { useState } from "react";

import {
  Box,
  Typography,
  IconButton,
  Avatar,
} from "@mui/material";

import {
  NavLink,
  useLocation,
} from "react-router-dom";

import MenuRoundedIcon from "@mui/icons-material/MenuRounded";

import DashboardRoundedIcon from "@mui/icons-material/DashboardRounded";

import StorageRoundedIcon from "@mui/icons-material/StorageRounded";

import InsightsRoundedIcon from "@mui/icons-material/InsightsRounded";

import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded";

import HubRoundedIcon from "@mui/icons-material/HubRounded";

import SyncRoundedIcon from "@mui/icons-material/SyncRounded";

const menus = [

  {
    label: "Dashboard",
    path: "/dashboard",
    icon: <DashboardRoundedIcon />,
  },

  {
    label: "Database Sync",
    path: "/database-sync",
    icon: <StorageRoundedIcon />,
  },

  {
    label: "Pipeline Monitor",
    path: "/pipeline-monitor",
    icon: <HubRoundedIcon />,
  },

  {
    label: "RTG Dashboard",
    path: "/rtg-dashboard",
    icon: <InsightsRoundedIcon />
  },

  {
    label: "Live Sync",
    path: "/live-sync",
    icon: <SyncRoundedIcon />,
  },

  {
    label: "Analytics",
    path: "/analytics",
    icon: <InsightsRoundedIcon />,
  },

  {
    label: "Settings",
    path: "/settings",
    icon: <SettingsRoundedIcon />,
  },
];

export default function Sidebar() {

  const [open, setOpen] = useState(true);

  const location = useLocation();

  return (

    <Box
      sx={{

        width: open ? 288 : 96,

        transition:
          "all .38s cubic-bezier(.4,0,.2,1)",

        background:
          "linear-gradient(180deg,#433878 0%,#524493 45%,#6A5CD8 100%)",

        borderRadius: "36px",

        position: "relative",

        overflow: "hidden",

        color: "#fff",

        p: 2.2,

        display: "flex",

        flexDirection: "column",

        minHeight: "calc(100vh - 32px)",

        border:
          "1px solid rgba(255,255,255,0.08)",

        boxShadow: `
          0 30px 80px rgba(76,60,140,0.35),
          inset 0 1px 0 rgba(255,255,255,0.08)
        `,
      }}
    >

      {/* TOP LIGHT */}

      <Box
        sx={{

          position: "absolute",

          top: -120,
          right: -100,

          width: 280,
          height: 280,

          borderRadius: "50%",

          background:
            "radial-gradient(circle,rgba(255,255,255,0.14),transparent 70%)",

          filter: "blur(10px)",
        }}
      />

      {/* BOTTOM LIGHT */}

      <Box
        sx={{

          position: "absolute",

          bottom: -120,
          left: -80,

          width: 240,
          height: 240,

          borderRadius: "50%",

          background:
            "radial-gradient(circle,rgba(255,255,255,0.10),transparent 70%)",

          filter: "blur(16px)",
        }}
      />

      {/* HEADER */}

      <Box
        sx={{

          display: "flex",

          alignItems: "center",

          justifyContent:
            open
              ? "space-between"
              : "center",

          position: "relative",

          zIndex: 2,
        }}
      >

        {open && (

          <Box>

            <Typography
              sx={{

                fontSize: 26,

                fontWeight: 800,

                letterSpacing: "-0.06em",

                lineHeight: 1,
              }}
            >
              RTG Portal
            </Typography>

            <Typography
              sx={{

                fontSize: 12,

                mt: 0.8,

                opacity: 0.72,

                letterSpacing: "0.08em",

                textTransform: "uppercase",
              }}
            >
              Enterprise Console
            </Typography>

          </Box>
        )}

        <IconButton
          onClick={() => setOpen(!open)}
          sx={{

            width: 42,
            height: 42,

            color: "#fff",

            background:
              "rgba(255,255,255,0.10)",

            backdropFilter: "blur(20px)",

            border:
              "1px solid rgba(255,255,255,0.08)",

            "&:hover": {

              background:
                "rgba(255,255,255,0.18)",
            },
          }}
        >
          <MenuRoundedIcon />
        </IconButton>

      </Box>

      {/* USER CARD */}

      <Box
        sx={{

          mt: 5,

          p: 2,

          borderRadius: "26px",

          background:
            "rgba(255,255,255,0.08)",

          backdropFilter: "blur(18px)",

          border:
            "1px solid rgba(255,255,255,0.08)",

          display: "flex",

          alignItems: "center",

          gap: 2,

          position: "relative",

          overflow: "hidden",
        }}
      >

        <Box
          sx={{

            position: "absolute",

            inset: 0,

            background:
              "linear-gradient(135deg,rgba(255,255,255,0.06),transparent)",

            pointerEvents: "none",
          }}
        />

        <Avatar
          sx={{

            width: 54,
            height: 54,

            background:
              "linear-gradient(135deg,#fff,#e9e7ff)",

            color: "#5B4B8A",

            fontWeight: 800,

            fontSize: 22,
          }}
        >
          R
        </Avatar>

        {open && (

          <Box>

            <Typography
              sx={{

                fontWeight: 700,

                fontSize: 15,
              }}
            >
              RTG Admin
            </Typography>

            <Typography
              sx={{

                fontSize: 12,

                opacity: 0.72,

                mt: 0.3,
              }}
            >
              Power System Monitoring
            </Typography>

          </Box>
        )}

      </Box>

      {/* MENUS */}

      <Box
        sx={{
          mt: 5,
          flex: 1,
        }}
      >

        {menus.map((item, index) => {

          const active =
            location.pathname === item.path;

          return (

            <NavLink
              key={index}
              to={item.path}
              style={{
                textDecoration: "none",
              }}
            >

              <Box
                sx={{

                  position: "relative",

                  display: "flex",

                  alignItems: "center",

                  gap: 2,

                  px: 1.6,

                  py: 1.4,

                  mb: 1.1,

                  borderRadius: "22px",

                  transition:
                    "all .24s ease",

                  overflow: "hidden",

                  background: active
                    ? "rgba(255,255,255,0.14)"
                    : "transparent",

                  border: active
                    ? "1px solid rgba(255,255,255,0.10)"
                    : "1px solid transparent",

                  backdropFilter:
                    active
                      ? "blur(16px)"
                      : "none",

                  "&:hover": {

                    background:
                      "rgba(255,255,255,0.10)",

                    transform:
                      "translateX(6px)",
                  },
                }}
              >

                {/* ACTIVE RAIL */}

                {active && (

                  <Box
                    sx={{

                      position: "absolute",

                      left: 0,
                      top: 10,
                      bottom: 10,

                      width: 4,

                      borderRadius: "999px",

                      background:
                        "linear-gradient(180deg,#fff,#D9D5FF)",

                      boxShadow:
                        "0 0 18px rgba(255,255,255,0.9)",
                    }}
                  />
                )}

                {/* ICON */}

                <Box
                  sx={{

                    minWidth: 42,
                    width: 42,
                    height: 42,

                    borderRadius: "14px",

                    display: "flex",

                    alignItems: "center",

                    justifyContent: "center",

                    background: active

                      ? "rgba(255,255,255,0.18)"

                      : "rgba(255,255,255,0.08)",

                    border:
                      "1px solid rgba(255,255,255,0.08)",

                    backdropFilter: "blur(14px)",
                  }}
                >
                  {item.icon}
                </Box>

                {/* LABEL */}

                {open && (

                  <Typography
                    sx={{

                      fontWeight:
                        active ? 700 : 600,

                      fontSize: 15,

                      color: "#fff",
                    }}
                  >
                    {item.label}
                  </Typography>
                )}

              </Box>

            </NavLink>
          );
        })}
      </Box>

      {/* FOOTER */}

      {open && (

        <Box
          sx={{

            p: 2.2,

            borderRadius: "26px",

            background:
              "rgba(255,255,255,0.08)",

            backdropFilter: "blur(20px)",

            border:
              "1px solid rgba(255,255,255,0.08)",

            position: "relative",

            overflow: "hidden",
          }}
        >

          <Box
            sx={{

              position: "absolute",

              inset: 0,

              background:
                "linear-gradient(135deg,rgba(255,255,255,0.06),transparent)",

              pointerEvents: "none",
            }}
          />

          <Typography
            sx={{

              fontWeight: 700,

              fontSize: 14,
            }}
          >
            RTG Monitoring Suite
          </Typography>

          <Typography
            sx={{

              fontSize: 12,

              opacity: 0.72,

              mt: 0.7,

              lineHeight: 1.6,
            }}
          >
            Grid monitoring platform with
            enterprise data orchestration
            and live operational analytics.
          </Typography>

        </Box>
      )}

    </Box>
  );
}