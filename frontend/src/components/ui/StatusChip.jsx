import { Box, Typography } from "@mui/material";

export default function StatusChip({ type, label }) {
  const config = {
    Operational: {
      color: "var(--status-operational)",
      bg: "rgba(0, 180, 97, 0.12)",
    },
    Warning: {
      color: "var(--status-warning)",
      bg: "rgba(254, 181, 32, 0.12)",
    },
    Critical: {
      color: "var(--status-critical)",
      bg: "rgba(220, 38, 38, 0.12)",
    },
    Maintenance: {
      color: "var(--status-maintenance)",
      bg: "rgba(13, 87, 183, 0.12)",
    },
    Info: {
      color: "var(--status-info)",
      bg: "rgba(129, 139, 188, 0.12)",
    },
    // Fallbacks for legacy states
    NEW: {
      color: "var(--status-operational)",
      bg: "rgba(0, 180, 97, 0.12)",
    },
    MODIFIED: {
      color: "var(--status-warning)",
      bg: "rgba(254, 181, 32, 0.12)",
    },
  };

  const cfg = config[type] || config.Info;
  const displayLabel = label || type;

  return (
    <Box
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0.8,
        px: 1.2,
        py: 0.4,
        borderRadius: "var(--radius-pill)",
        backgroundColor: cfg.bg,
      }}
    >
      <Box
        sx={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          backgroundColor: cfg.color,
        }}
      />
      <Typography
        sx={{
          fontSize: "var(--font-caption)",
          fontWeight: "var(--font-weight-bold)",
          color: cfg.color,
          textTransform: "uppercase",
          letterSpacing: "0.02em",
        }}
      >
        {displayLabel}
      </Typography>
    </Box>
  );
}