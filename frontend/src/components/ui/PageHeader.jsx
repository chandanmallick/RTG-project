import { Box, Chip, Stack, Typography } from "@mui/material";

/**
 * PageHeader — Standardized page header from the UI Kit.
 *
 * @param {ReactNode}  icon        Lucide icon element (e.g. <CalendarCheck size={24} />)
 * @param {string}     title       Main heading text
 * @param {string}     subtitle    Secondary description
 * @param {ReactNode}  actions     Right-aligned action buttons / chips
 * @param {string}     iconBg      Background color for the icon box (default: UI Kit blue soft)
 * @param {string}     iconColor   Icon color (default: UI Kit blue)
 * @param {object}     sx          Additional MUI sx overrides
 */
export default function PageHeader({
  icon,
  title,
  subtitle,
  actions,
  iconBg = "var(--ui-blue-soft)",
  iconColor = "var(--grid-blue)",
  sx = {},
}) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 2.2,
        p: 2.8,
        backgroundColor: "var(--bg-card)",
        borderRadius: "var(--radius-xl)",
        border: "1px solid var(--border-color)",
        boxShadow: "0 4px 20px rgba(13, 87, 183, 0.03)",
        ...sx,
      }}
    >
      {/* Icon Box */}
      {icon && (
        <Box
          sx={{
            width: 48,
            height: 48,
            borderRadius: "var(--radius-lg)",
            backgroundColor: iconBg,
            color: iconColor,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            boxShadow: `0 4px 12px ${iconColor}26`,
          }}
        >
          {icon}
        </Box>
      )}

      {/* Title + Subtitle */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          sx={{
            fontSize: "var(--font-h2)",
            fontWeight: "var(--font-weight-bold)",
            color: "var(--deep-navy)",
            letterSpacing: "-0.03em",
            lineHeight: 1.2,
          }}
        >
          {title}
        </Typography>
        {subtitle && (
          <Typography
            sx={{
              fontSize: "var(--font-body2)",
              color: "var(--text-secondary)",
              fontWeight: "var(--font-weight-medium)",
              mt: 0.3,
            }}
          >
            {subtitle}
          </Typography>
        )}
      </Box>

      {/* Actions slot */}
      {actions && (
        <Stack direction="row" spacing={1} alignItems="center" flexShrink={0}>
          {actions}
        </Stack>
      )}
    </Box>
  );
}
