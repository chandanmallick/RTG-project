import { Alert, Box, IconButton, Typography } from "@mui/material";
import { CheckCircle2, Info, AlertTriangle, XCircle, X } from "lucide-react";

const CONFIG = {
  success: {
    bg: "#ECFDF5",
    border: "#A7F3D0",
    color: "#065F46",
    icon: <CheckCircle2 size={18} />,
    defaultTitle: "Success",
  },
  info: {
    bg: "#EFF6FF",
    border: "#BFDBFE",
    color: "#1E40AF",
    icon: <Info size={18} />,
    defaultTitle: "Information",
  },
  warning: {
    bg: "#FFFBEB",
    border: "#FDE68A",
    color: "#92400E",
    icon: <AlertTriangle size={18} />,
    defaultTitle: "Warning",
  },
  error: {
    bg: "#FEF2F2",
    border: "#FECACA",
    color: "#991B1B",
    icon: <XCircle size={18} />,
    defaultTitle: "Error",
  },
};

/**
 * AlertBanner — UI Kit Section 12 notification/alert component.
 *
 * @param {'success'|'info'|'warning'|'error'} type     Alert severity
 * @param {string}   title     Optional title text
 * @param {string}   message   Alert message body
 * @param {function} onClose   Dismiss handler
 * @param {object}   sx        Additional MUI sx overrides
 */
export default function AlertBanner({
  type = "info",
  title,
  message,
  onClose,
  sx = {},
}) {
  const cfg = CONFIG[type] || CONFIG.info;

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "flex-start",
        gap: 1.5,
        p: 2,
        backgroundColor: cfg.bg,
        border: `1px solid ${cfg.border}`,
        borderRadius: "var(--radius-lg)",
        color: cfg.color,
        ...sx,
      }}
    >
      {/* Icon */}
      <Box sx={{ flexShrink: 0, mt: 0.2, color: cfg.color }}>{cfg.icon}</Box>

      {/* Content */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        {(title || cfg.defaultTitle) && (
          <Typography
            sx={{
              fontSize: "var(--font-body1)",
              fontWeight: "var(--font-weight-bold)",
              color: cfg.color,
              lineHeight: 1.3,
            }}
          >
            {title || cfg.defaultTitle}
          </Typography>
        )}
        {message && (
          <Typography
            sx={{
              fontSize: "var(--font-body2)",
              fontWeight: "var(--font-weight-regular)",
              color: cfg.color,
              mt: title ? 0.3 : 0,
              opacity: 0.85,
              lineHeight: 1.4,
            }}
          >
            {message}
          </Typography>
        )}
      </Box>

      {/* Close */}
      {onClose && (
        <IconButton
          size="small"
          onClick={onClose}
          sx={{ color: cfg.color, opacity: 0.6, "&:hover": { opacity: 1 } }}
        >
          <X size={16} />
        </IconButton>
      )}
    </Box>
  );
}
