import { Paper, Typography, Box, Chip } from "@mui/material";
import { motion } from "framer-motion";

export default function StatCard({
  title,
  value,
  unit,
  subtitle,
  icon,
  color = "var(--grid-blue)",
  trend,
  trendLabel = "vs yesterday",
  isLive = false,
}) {
  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={{ duration: 0.2 }}
    >
      <Paper
        sx={{
          position: "relative",
          overflow: "hidden",
          borderRadius: "var(--radius-xl)",
          p: 3,
          backgroundColor: "var(--bg-card)",
          border: "1px solid var(--border-color)",
          boxShadow: "0 4px 20px rgba(13, 87, 183, 0.03)",
          minHeight: 160,
        }}
      >
        {/* TOP BAR */}
        <Box
          sx={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: 4,
            background: color,
          }}
        />

        {/* TOP ROW: Title & Badge */}
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
          <Typography
            sx={{
              color: "var(--text-secondary)",
              fontSize: "var(--font-body1)",
              fontWeight: "var(--font-weight-semibold)",
            }}
          >
            {title}
          </Typography>
          {isLive && (
            <Chip
              label="Live"
              size="small"
              sx={{
                height: 20,
                fontSize: 10,
                fontWeight: "var(--font-weight-bold)",
                color: "var(--grid-green)",
                backgroundColor: "rgba(0, 180, 97, 0.12)",
              }}
            />
          )}
        </Box>

        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          {/* LEFT: Value & Trend */}
          <Box>
            <Box sx={{ display: "flex", alignItems: "baseline", gap: 0.5 }}>
              <Typography
                sx={{
                  fontSize: "32px",
                  fontWeight: 800,
                  lineHeight: 1,
                  letterSpacing: "-0.04em",
                  color: "var(--deep-navy)",
                }}
              >
                {value}
              </Typography>
              {unit && (
                <Typography
                  sx={{
                    fontSize: "var(--font-body2)",
                    fontWeight: "var(--font-weight-bold)",
                    color: "var(--text-secondary)",
                  }}
                >
                  {unit}
                </Typography>
              )}
            </Box>

            {(subtitle || trend !== undefined) && (
              <Box sx={{ mt: 1.5, display: "flex", alignItems: "center", gap: 1 }}>
                {trend !== undefined && (
                  <Typography
                    sx={{
                      fontSize: "var(--font-body2)",
                      fontWeight: "var(--font-weight-bold)",
                      color: trend > 0 ? "var(--grid-green)" : "var(--status-critical)",
                    }}
                  >
                    {trend > 0 ? "+" : ""}{trend}%
                  </Typography>
                )}
                <Typography
                  sx={{
                    fontSize: "var(--font-body2)",
                    color: "var(--text-secondary)",
                  }}
                >
                  {subtitle || trendLabel}
                </Typography>
              </Box>
            )}
          </Box>

          {/* RIGHT: Icon/Chart slot */}
          {icon && (
            <Box
              sx={{
                color: color,
                display: "flex",
                "& svg": { width: 48, height: 48, opacity: 0.8 },
              }}
            >
              {icon}
            </Box>
          )}
        </Box>
      </Paper>
    </motion.div>
  );
}
