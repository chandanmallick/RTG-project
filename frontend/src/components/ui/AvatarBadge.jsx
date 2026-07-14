import { Box, Typography } from "@mui/material";

/**
 * AvatarBadge — UI Kit Section 5 styled avatar circle with role label badge.
 *
 * @param {string} src    Avatar image URL
 * @param {string} name   User's name
 * @param {string} role   Role label (e.g. "SO", "PLANNING")
 * @param {number} size   Avatar size (default: 64)
 * @param {object} sx     Additional MUI sx overrides
 */
export default function AvatarBadge({ src, name, role, size = 64, sx = {} }) {
  return (
    <Box
      sx={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 1.5,
        ...sx,
      }}
    >
      <Box
        sx={{
          width: size,
          height: size,
          borderRadius: "50%",
          border: "2px solid var(--grid-blue)",
          padding: "2px",
          position: "relative",
        }}
      >
        <Box
          component="img"
          src={src}
          alt={name}
          sx={{
            width: "100%",
            height: "100%",
            borderRadius: "50%",
            objectFit: "cover",
            backgroundColor: "var(--bg-surface)",
          }}
        />
      </Box>
      <Typography
        sx={{
          fontSize: "var(--font-caption)",
          fontWeight: "var(--font-weight-bold)",
          color: "var(--text-secondary)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        {role}
      </Typography>
    </Box>
  );
}
