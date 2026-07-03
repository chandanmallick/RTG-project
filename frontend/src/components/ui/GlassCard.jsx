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

        borderRadius: "16px",

        background:
          "linear-gradient(180deg, #F8FBFF 0%, #FFFFFF 56px)",

        border: "1px solid rgba(175, 196, 234, 0.72)",

        boxShadow: "0 12px 30px rgba(15, 111, 219, 0.07)",

        transition:
          "all .35s cubic-bezier(.17,.67,.38,.99)",

        p: padding,

        ...(hover && {
          "&:hover": {
            transform:
              "translateY(-4px)",

            boxShadow:
              "0 16px 36px rgba(15, 111, 219, 0.11)",
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

      {/* GREEN GLOW */}

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
              "rgba(0, 223, 129, 0.12)",

            filter: "blur(70px)",

            pointerEvents: "none",
          }}
        />
      )}

      {/* MINT GLOW */}

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
              "rgba(44, 194, 149, 0.08)",

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

            borderRadius: "18px",

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
