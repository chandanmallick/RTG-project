import { Button } from "@mui/material";
import { motion } from "framer-motion";

export default function GradientButton({
  children,
  startIcon,
  endIcon,
  onClick,
  color = "primary",
  variant = "gradient", // 'gradient', 'glass', 'primary', 'secondary', 'tertiary'
  disabled = false,
  fullWidth = false,
  size = "medium", // 'small', 'medium', 'large', 'pill'
  sx = {},
}) {
  const gradients = {
    primary: "var(--gradient-primary)",
    success: "var(--gradient-green)",
    error: "linear-gradient(135deg,#DC2626 0%,#F87171 100%)",
    dark: "linear-gradient(135deg,#111827 0%,#374151 100%)",
    info: "linear-gradient(135deg,#4F8CFF 0%,#0B55B8 100%)",
  };

  const shadows = {
    primary: "0 12px 24px rgba(13, 87, 183, 0.25)",
    success: "0 12px 24px rgba(0, 180, 97, 0.25)",
    error: "0 12px 24px rgba(220,38,38,0.22)",
    dark: "0 12px 24px rgba(17,24,39,0.20)",
    info: "0 12px 24px rgba(13, 87, 183, 0.2)",
  };

  // Base styles based on variant
  let bg = gradients[color];
  let textColor = "#fff";
  let border = "none";
  let shadow = shadows[color];
  let hoverBg = gradients[color];

  if (variant === "glass") {
    bg = "rgba(255,255,255,0.16)";
    border = "1px solid rgba(255,255,255,0.18)";
    shadow = "0 10px 30px rgba(255,255,255,0.08)";
    hoverBg = "rgba(255,255,255,0.22)";
  } else if (variant === "primary") {
    bg = "var(--deep-navy)";
    shadow = "0 4px 14px rgba(11, 48, 42, 0.2)";
    hoverBg = "var(--grid-blue)";
  } else if (variant === "secondary") {
    bg = "transparent";
    textColor = "var(--grid-blue)";
    border = "1.5px solid var(--border-color)";
    shadow = "none";
    hoverBg = "rgba(13, 87, 183, 0.05)";
  } else if (variant === "tertiary") {
    bg = "transparent";
    textColor = "var(--grid-blue)";
    shadow = "none";
    hoverBg = "transparent";
  }

  // Handle pill size
  const isPill = size === "pill";
  const muiSize = isPill ? "small" : size;

  return (
    <motion.div
      whileHover={{ y: variant === "tertiary" ? 0 : -2 }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.18 }}
      style={{
        display: fullWidth ? "block" : "inline-block",
        width: fullWidth ? "100%" : "auto",
      }}
    >
      <Button
        fullWidth={fullWidth}
        disabled={disabled}
        startIcon={startIcon}
        endIcon={endIcon}
        onClick={onClick}
        variant={variant === "secondary" ? "outlined" : variant === "tertiary" ? "text" : "contained"}
        size={muiSize}
        disableElevation
        sx={{
          position: "relative",
          overflow: "hidden",
          borderRadius: isPill ? "var(--radius-pill)" : "var(--radius-lg)",
          textTransform: "none",
          fontWeight: "var(--font-weight-bold)",
          letterSpacing: ".02em",
          px: isPill ? 2.5 : 3,
          py: isPill ? 0.6 : 1.2,
          minHeight: isPill ? 32 : 46,
          background: bg,
          color: textColor,
          backdropFilter: variant === "glass" ? "blur(16px)" : "none",
          border: border,
          boxShadow: shadow,
          transition: ".25s ease",

          "&:hover": {
            background: hoverBg,
            boxShadow: variant === "secondary" || variant === "tertiary" ? "none" : shadow,
            borderColor: variant === "secondary" ? "var(--grid-blue)" : undefined,
            ...(variant === "tertiary" && { textDecoration: "underline" }),
          },

          ...(variant === "gradient" && {
            "&:before": {
              content: '""',
              position: "absolute",
              top: 0,
              left: "-120%",
              width: "120%",
              height: "100%",
              background: "linear-gradient(90deg,transparent,rgba(255,255,255,0.22),transparent)",
              transition: ".6s",
            },
            "&:hover:before": {
              left: "120%",
            },
          }),

          "&.Mui-disabled": {
            background: "var(--bg-surface)",
            color: "var(--text-muted)",
            borderColor: "var(--border-color)",
            boxShadow: "none",
          },

          ...sx,
        }}
      >
        {children}
      </Button>
    </motion.div>
  );
}
