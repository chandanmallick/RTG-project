import { Box, Typography } from "@mui/material";

/**
 * PillButton — UI Kit Section 6 "Pill Buttons / Tags".
 * Small rounded tag-like buttons for filtering (National Grid, State Grid, etc.).
 *
 * @param {string}   label    Button label text
 * @param {boolean}  active   Whether the pill is selected
 * @param {function} onClick  Click handler
 * @param {string}   color    Active background color (default: grid-blue)
 * @param {object}   sx       Additional MUI sx overrides
 */
export default function PillButton({
  label,
  active = false,
  onClick,
  color = "var(--grid-blue)",
  sx = {},
}) {
  return (
    <Box
      component="button"
      onClick={onClick}
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0.5,
        px: 2,
        py: 0.7,
        borderRadius: "var(--radius-pill)",
        border: active ? `1.5px solid ${color}` : "1.5px solid var(--border-color)",
        backgroundColor: active ? color : "var(--bg-card)",
        color: active ? "#FFFFFF" : "var(--steel-gray)",
        fontSize: "var(--font-body2)",
        fontWeight: "var(--font-weight-semibold)",
        fontFamily: "inherit",
        cursor: "pointer",
        transition: "all 0.2s ease",
        outline: "none",
        "&:hover": {
          borderColor: color,
          backgroundColor: active ? color : `${color}0D`,
          color: active ? "#FFFFFF" : color,
        },
        "&:focus-visible": {
          boxShadow: `0 0 0 3px ${color}22`,
        },
        ...sx,
      }}
    >
      {label}
    </Box>
  );
}
