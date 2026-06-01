import { Box, Paper } from "@mui/material";

export default function GlassCard({
  children,
  sx = {},

  hover = true,

  glow = false,

  borderGlow = false,

  padding = 3,
}) {
  return (
    <Paper
      elevation={0}
      sx={{
        position: "relative",

        overflow: "hidden",

        borderRadius: "24px",

        background: "#FFFFFF",

        border: "1px solid #E2E8F0",

        boxShadow: "0 10px 30px rgba(0, 0, 0, 0.02), 0 1px 3px rgba(0, 0, 0, 0.01)",

        transition:
          "all .35s cubic-bezier(.17,.67,.38,.99)",

        p: padding,

        ...(hover && {
          "&:hover": {
            transform:
              "translateY(-4px)",

            boxShadow:
              "0 20px 40px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.02)",
          },
        }),

        ...sx,
      }}
    >
      {/* TOP LIGHT */}

      <Box
        sx={{
          position: "absolute",

          top: 0,
          left: 0,

          width: "100%",
          height: "50%",

          background:
            "linear-gradient(180deg, rgba(255,255,255,0.32), transparent)",

          pointerEvents: "none",
        }}
      />

      {/* PURPLE GLOW */}

      {glow && (
        <Box
          sx={{
            position: "absolute",

            top: -120,
            right: -100,

            width: 240,
            height: 240,

            borderRadius: "50%",

            background:
              "rgba(123,107,214,0.14)",

            filter: "blur(70px)",

            pointerEvents: "none",
          }}
        />
      )}

      {/* BLUE GLOW */}

      {glow && (
        <Box
          sx={{
            position: "absolute",

            bottom: -120,
            left: -80,

            width: 220,
            height: 220,

            borderRadius: "50%",

            background:
              "rgba(96,165,250,0.10)",

            filter: "blur(70px)",

            pointerEvents: "none",
          }}
        />
      )}

      {/* BORDER LIGHT */}

      {borderGlow && (
        <Box
          sx={{
            position: "absolute",

            inset: 0,

            borderRadius: "34px",

            padding: "1px",

            background:
              "linear-gradient(135deg, rgba(255,255,255,0.7), rgba(255,255,255,0.1))",

            WebkitMask:
              "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",

            WebkitMaskComposite:
              "xor",

            pointerEvents: "none",
          }}
        />
      )}

      {/* NOISE TEXTURE */}

      <Box
        sx={{
          position: "absolute",

          inset: 0,

          opacity: 0.025,

          backgroundImage:
            "radial-gradient(#000 0.6px, transparent 0.6px)",

          backgroundSize: "14px 14px",

          pointerEvents: "none",
        }}
      />

      {/* CONTENT */}

      <Box
        sx={{
          position: "relative",
          zIndex: 2,
        }}
      >
        {children}
      </Box>
    </Paper>
  );
}