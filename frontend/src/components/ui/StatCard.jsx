import { Paper, Typography, Box } from "@mui/material";
import { motion } from "framer-motion";

export default function StatCard({
  title,
  value,
  subtitle,
  icon,
  color = "#03624C",
  trend,
}) {
  return (
    <motion.div
      whileHover={{
        y: -4,
      }}
      transition={{
        duration: 0.2,
      }}
    >
      <Paper
        sx={{
          position: "relative",

          overflow: "hidden",

          borderRadius: "28px",

          p: 3,

          background: "rgba(255,255,255,0.82)",

          backdropFilter: "blur(22px)",

          border:
            "1px solid rgba(255,255,255,0.8)",

          boxShadow:
            "0 18px 40px rgba(15,23,42,0.06)",

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
            height: 5,

            background: color,
          }}
        />

        {/* GLOW */}

        <Box
          sx={{
            position: "absolute",

            top: -60,
            right: -40,

            width: 140,
            height: 140,

            borderRadius: "50%",

            background: `${color}22`,

            filter: "blur(40px)",
          }}
        />

        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          {/* LEFT */}

          <Box>
            <Typography
              sx={{
                color: "#6B7280",
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              {title}
            </Typography>

            <Typography
              sx={{
                mt: 1,

                fontSize: 36,

                fontWeight: 800,

                lineHeight: 1,

                letterSpacing: "-0.04em",

                color: "#111827",
              }}
            >
              {value}
            </Typography>

            {subtitle && (
              <Typography
                sx={{
                  mt: 1.5,

                  fontSize: 13,

                  color: "#9CA3AF",
                }}
              >
                {subtitle}
              </Typography>
            )}
          </Box>

          {/* ICON */}

          <Box
            sx={{
              width: 56,
              height: 56,

              borderRadius: "18px",

              background: `${color}18`,

              display: "flex",
              alignItems: "center",
              justifyContent: "center",

              color,
            }}
          >
            {icon}
          </Box>
        </Box>

        {/* TREND */}

        {trend && (
          <Box
            sx={{
              mt: 3,

              display: "inline-flex",

              alignItems: "center",

              px: 1.5,
              py: 0.6,

              borderRadius: "999px",

              background:
                trend > 0
                  ? "rgba(34,197,94,0.12)"
                  : "rgba(239,68,68,0.12)",

              color:
                trend > 0
                  ? "#16A34A"
                  : "#DC2626",

              fontSize: 12,

              fontWeight: 700,
            }}
          >
            {trend > 0 ? "+" : ""}
            {trend}%
          </Box>
        )}
      </Paper>
    </motion.div>
  );
}