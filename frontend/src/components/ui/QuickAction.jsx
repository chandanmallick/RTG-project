import { Box, ButtonBase, Typography } from "@mui/material";

/**
 * QuickAction — UI Kit Section 13 icon-based action button.
 *
 * @param {ReactNode} icon    Lucide icon element
 * @param {string}    label   Action label text
 * @param {function}  onClick Click handler
 * @param {object}    sx      Additional MUI sx overrides
 */
export default function QuickAction({
  icon,
  label,
  onClick,
  sx = {},
}) {
  return (
    <ButtonBase
      onClick={onClick}
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 1,
        p: 2,
        borderRadius: "var(--radius-lg)",
        border: "1px solid var(--border-color)",
        backgroundColor: "var(--bg-card)",
        transition: "all 0.2s ease",
        minWidth: 90,
        "&:hover": {
          borderColor: "var(--grid-blue)",
          backgroundColor: "rgba(13, 87, 183, 0.03)",
          transform: "translateY(-2px)",
          boxShadow: "0 6px 16px rgba(13, 87, 183, 0.08)",
        },
        "&:focus-visible": {
          outline: "none",
          boxShadow: "0 0 0 3px rgba(13, 87, 183, 0.15)",
        },
        ...sx,
      }}
    >
      <Box
        sx={{
          width: 44,
          height: 44,
          borderRadius: "var(--radius-lg)",
          backgroundColor: "var(--bg-surface)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--grid-blue)",
          "& svg": { width: 22, height: 22 },
        }}
      >
        {icon}
      </Box>
      <Typography
        sx={{
          fontSize: "var(--font-body2)",
          fontWeight: "var(--font-weight-semibold)",
          color: "var(--text-primary)",
          lineHeight: 1.2,
          textAlign: "center",
        }}
      >
        {label}
      </Typography>
    </ButtonBase>
  );
}
