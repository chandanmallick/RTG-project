import { Button } from "@mui/material";
import { motion } from "framer-motion";

export default function GradientButton({
  children,
  startIcon,
  endIcon,
  onClick,
  color = "primary",
  variant = "gradient",
  disabled = false,
  fullWidth = false,
  size = "medium",
  sx = {},
}) {
  const gradients = {
    primary:
      "linear-gradient(135deg,#5AA55A 0%,#82C582 100%)",

    success:
      "linear-gradient(135deg,#0BA360 0%,#3CBA92 100%)",

    error:
      "linear-gradient(135deg,#DC2626 0%,#F87171 100%)",

    dark:
      "linear-gradient(135deg,#111827 0%,#374151 100%)",

    info:
      "linear-gradient(135deg,#2563EB 0%,#60A5FA 100%)",
  };

  const shadows = {
    primary:
      "0 12px 24px rgba(90, 165, 90, 0.25)",

    success:
      "0 12px 24px rgba(11,163,96,0.25)",

    error:
      "0 12px 24px rgba(220,38,38,0.22)",

    dark:
      "0 12px 24px rgba(17,24,39,0.20)",

    info:
      "0 12px 24px rgba(37,99,235,0.24)",
  };

  return (
    <motion.div
      whileHover={{
        y: -2,
      }}
      whileTap={{
        scale: 0.98,
      }}
      transition={{
        duration: 0.18,
      }}
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
        variant="contained"
        size={size}
        sx={{
          position: "relative",

          overflow: "hidden",

          borderRadius: "16px",

          textTransform: "none",

          fontWeight: 700,

          letterSpacing: ".02em",

          px: 3,

          py: 1.2,

          minHeight: 46,

          background:
            variant === "glass"
              ? "rgba(255,255,255,0.16)"
              : gradients[color],

          color:
            variant === "glass"
              ? "#fff"
              : "#fff",

          backdropFilter:
            variant === "glass"
              ? "blur(16px)"
              : "none",

          border:
            variant === "glass"
              ? "1px solid rgba(255,255,255,0.18)"
              : "none",

          boxShadow:
            variant === "glass"
              ? "0 10px 30px rgba(255,255,255,0.08)"
              : shadows[color],

          transition: ".25s ease",

          "&:hover": {
            background:
              variant === "glass"
                ? "rgba(255,255,255,0.22)"
                : gradients[color],

            boxShadow:
              variant === "glass"
                ? "0 18px 40px rgba(255,255,255,0.12)"
                : shadows[color],
          },

          "&:before": {
            content: '""',

            position: "absolute",

            top: 0,
            left: "-120%",

            width: "120%",
            height: "100%",

            background:
              "linear-gradient(90deg,transparent,rgba(255,255,255,0.22),transparent)",

            transition: ".6s",
          },

          "&:hover:before": {
            left: "120%",
          },

          ...sx,
        }}
      >
        {children}
      </Button>
    </motion.div>
  );
}