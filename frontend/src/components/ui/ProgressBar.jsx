import { Box, CircularProgress, LinearProgress, Typography } from "@mui/material";

/**
 * ProgressBar — UI Kit Section 8 progress indicator.
 *
 * @param {number}   value           Progress value 0–100
 * @param {'linear'|'circular'} variant  Display variant
 * @param {string}   color           Bar color (default: grid-green)
 * @param {string}   label           Optional label text
 * @param {boolean}  showPercentage  Show percentage number (default: true)
 * @param {number}   size            Circular variant diameter (default: 80)
 * @param {object}   sx              Additional MUI sx overrides
 */
export default function ProgressBar({
  value = 0,
  variant = "linear",
  color = "var(--grid-green)",
  label,
  showPercentage = true,
  size = 80,
  sx = {},
}) {
  const clampedValue = Math.min(100, Math.max(0, value));

  if (variant === "circular") {
    return (
      <Box
        sx={{
          display: "inline-flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 1,
          ...sx,
        }}
      >
        <Box sx={{ position: "relative", width: size, height: size }}>
          {/* Background ring */}
          <CircularProgress
            variant="determinate"
            value={100}
            size={size}
            thickness={4}
            sx={{
              color: "var(--border-color)",
              position: "absolute",
              top: 0,
              left: 0,
            }}
          />
          {/* Active ring */}
          <CircularProgress
            variant="determinate"
            value={clampedValue}
            size={size}
            thickness={4}
            sx={{
              color,
              position: "absolute",
              top: 0,
              left: 0,
              "& .MuiCircularProgress-circle": {
                strokeLinecap: "round",
              },
            }}
          />
          {/* Center text */}
          {showPercentage && (
            <Box
              sx={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Typography
                sx={{
                  fontSize: size * 0.22,
                  fontWeight: "var(--font-weight-bold)",
                  color: "var(--deep-navy)",
                }}
              >
                {Math.round(clampedValue)}%
              </Typography>
            </Box>
          )}
        </Box>
        {label && (
          <Typography
            sx={{
              fontSize: "var(--font-body2)",
              color: "var(--text-secondary)",
              fontWeight: "var(--font-weight-medium)",
            }}
          >
            {label}
          </Typography>
        )}
      </Box>
    );
  }

  // Linear variant
  return (
    <Box sx={{ width: "100%", ...sx }}>
      {(label || showPercentage) && (
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            mb: 0.8,
          }}
        >
          {label && (
            <Typography
              sx={{
                fontSize: "var(--font-body2)",
                color: "var(--text-secondary)",
                fontWeight: "var(--font-weight-medium)",
              }}
            >
              {label}
            </Typography>
          )}
          {showPercentage && (
            <Typography
              sx={{
                fontSize: "var(--font-body2)",
                fontWeight: "var(--font-weight-bold)",
                color: "var(--deep-navy)",
              }}
            >
              {Math.round(clampedValue)}%
            </Typography>
          )}
        </Box>
      )}
      <Box
        sx={{
          width: "100%",
          height: 8,
          borderRadius: "var(--radius-pill)",
          backgroundColor: "var(--border-color)",
          overflow: "hidden",
        }}
      >
        <Box
          sx={{
            width: `${clampedValue}%`,
            height: "100%",
            borderRadius: "var(--radius-pill)",
            backgroundColor: color,
            transition: "width 0.4s ease",
          }}
        />
      </Box>
    </Box>
  );
}
