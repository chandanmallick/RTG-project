import { Box, Typography } from "@mui/material";
import { CheckCircle2, Info, AlertTriangle, XCircle, ArrowRight } from "lucide-react";

const CONFIG = {
  success: {
    color: "#00B461",
    bg: "rgba(0, 180, 97, 0.12)",
    icon: <CheckCircle2 size={20} />,
  },
  info: {
    color: "#0D57B7",
    bg: "rgba(13, 87, 183, 0.12)",
    icon: <Info size={20} />,
  },
  warning: {
    color: "#FEB520",
    bg: "rgba(254, 181, 32, 0.12)",
    icon: <AlertTriangle size={20} />,
  },
  error: {
    color: "#DC2626",
    bg: "rgba(220, 38, 38, 0.12)",
    icon: <XCircle size={20} />,
  },
};

/**
 * NotificationCard — UI Kit Section 9 notification list item.
 *
 * @param {'success'|'info'|'warning'|'error'} type Notification type
 * @param {string} title       Main heading text
 * @param {string} description Secondary description
 * @param {string} timestamp   Time indicator (e.g., "2 min ago")
 * @param {object} sx          Additional MUI sx overrides
 */
export default function NotificationCard({
  type = "info",
  title,
  description,
  timestamp,
  sx = {},
}) {
  const cfg = CONFIG[type] || CONFIG.info;

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "flex-start",
        gap: 2,
        p: 2.5,
        backgroundColor: "var(--bg-card)",
        borderRadius: "var(--radius-lg)",
        border: "1px solid var(--border-color)",
        transition: "all 0.2s ease",
        cursor: "pointer",
        "&:hover": {
          borderColor: "var(--grid-blue)",
          boxShadow: "0 4px 16px rgba(13, 87, 183, 0.06)",
        },
        ...sx,
      }}
    >
      <Box
        sx={{
          width: 40,
          height: 40,
          borderRadius: "var(--radius-md)",
          backgroundColor: cfg.bg,
          color: cfg.color,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {cfg.icon}
      </Box>

      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          sx={{
            fontSize: "var(--font-body1)",
            fontWeight: "var(--font-weight-bold)",
            color: "var(--deep-navy)",
            mb: 0.5,
          }}
        >
          {title}
        </Typography>
        <Typography
          sx={{
            fontSize: "var(--font-body2)",
            color: "var(--text-secondary)",
            lineHeight: 1.4,
          }}
        >
          {description}
        </Typography>
      </Box>

      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: 1,
          flexShrink: 0,
        }}
      >
        <Typography
          sx={{
            fontSize: "var(--font-caption)",
            color: "var(--text-muted)",
            fontWeight: "var(--font-weight-medium)",
          }}
        >
          {timestamp}
        </Typography>
        <Box sx={{ color: "var(--grid-blue)", display: "flex", alignItems: "center" }}>
          <ArrowRight size={16} />
        </Box>
      </Box>
    </Box>
  );
}
