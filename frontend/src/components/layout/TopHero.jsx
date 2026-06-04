import { Box, Typography } from "@mui/material";

import GradientButton from "../ui/GradientButton";

import SyncRoundedIcon from "@mui/icons-material/SyncRounded";
import CloudDoneRoundedIcon from "@mui/icons-material/CloudDoneRounded";

export default function TopHero({
  onFetch,
  onCommit,
  loading,
}) {
  return (
    <Box
      sx={{
        position: "relative",

        overflow: "hidden",

        borderRadius: "34px",

        background:
          "linear-gradient(135deg,#03624C,#17876D)",

        color: "#fff",

        p: 4,

        mb: 3,

        minHeight: 120,

        display: "flex",

        alignItems: "center",

        justifyContent: "space-between",
      }}
    >
      {/* GLOW */}

      <Box
        sx={{
          position: "absolute",

          top: -80,
          right: -80,

          width: 260,
          height: 260,

          borderRadius: "50%",

          background:
            "rgba(255,255,255,0.10)",
        }}
      />

      {/* SECOND GLOW */}

      <Box
        sx={{
          position: "absolute",

          bottom: -120,
          left: -80,

          width: 220,
          height: 220,

          borderRadius: "50%",

          background:
            "rgba(255,255,255,0.06)",
        }}
      />

      {/* LEFT */}

      <Box
        sx={{
          position: "relative",
          zIndex: 2,
        }}
      >
        <Typography
          sx={{
            fontSize: 30,

            fontWeight: 800,

            letterSpacing: "-0.05em",

            lineHeight: 1.1,
          }}
        >
          RTG Data
          <br />
          Monitoring Portal
        </Typography>

        <Typography
          sx={{
            mt: 2,

            maxWidth: 520,

            fontSize: 15,

            opacity: 0.82,

            lineHeight: 1.8,
          }}
        >
          Premium enterprise-grade
          synchronization dashboard for
          monitoring unit-wise and
          station-wise RTG database
          updates.
        </Typography>
      </Box>

      {/* RIGHT */}

      <Box
        sx={{
          position: "relative",
          zIndex: 2,

          display: "flex",

          gap: 2,
        }}
      >
        <GradientButton
          startIcon={<SyncRoundedIcon />}
          onClick={onFetch}
          variant="glass"
        >
          {loading
            ? "Fetching..."
            : "Fetch Data"}
        </GradientButton>

        <GradientButton
          color="success"
          startIcon={
            <CloudDoneRoundedIcon />
          }
          onClick={onCommit}
        >
          Commit Changes
        </GradientButton>
      </Box>
    </Box>
  );
}