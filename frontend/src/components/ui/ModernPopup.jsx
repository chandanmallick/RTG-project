import toast from "react-hot-toast";

import {
  Box,
  Typography,
  IconButton,
} from "@mui/material";

import { motion } from "framer-motion";

import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import ErrorRoundedIcon from "@mui/icons-material/ErrorRounded";
import InfoRoundedIcon from "@mui/icons-material/InfoRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";

const popupStyles = {
  success: {
    icon: <CheckRoundedIcon />,

    gradient:
      "linear-gradient(135deg,#34D399,#10B981)",

    glow: "rgba(16,185,129,0.22)",

    shadow:
      "0 35px 80px rgba(16,185,129,0.22)",

    bgSoft:
      "linear-gradient(180deg,#ECFDF5,#FFFFFF)",
  },

  error: {
    icon: <ErrorRoundedIcon />,

    gradient:
      "linear-gradient(135deg,#F87171,#EF4444)",

    glow: "rgba(239,68,68,0.22)",

    shadow:
      "0 35px 80px rgba(239,68,68,0.18)",

    bgSoft:
      "linear-gradient(180deg,#FEF2F2,#FFFFFF)",
  },

  info: {
    icon: <InfoRoundedIcon />,

    gradient:
      "linear-gradient(135deg,#00DF81,#03624C)",

    glow: "rgba(0,223,129,0.22)",

    shadow:
      "0 35px 80px rgba(3,98,76,0.22)",

    bgSoft:
      "linear-gradient(180deg,#F1F7F6,#FFFFFF)",
  },

  warning: {
    icon: <WarningAmberRoundedIcon />,

    gradient:
      "linear-gradient(135deg,#FBBF24,#F97316)",

    glow: "rgba(249,115,22,0.22)",

    shadow:
      "0 35px 80px rgba(249,115,22,0.18)",

    bgSoft:
      "linear-gradient(180deg,#FFF7ED,#FFFFFF)",
  },
};

export const showModernPopup = ({
  type = "success",
  title = "",
  subtitle = "",
  description = "",
}) => {
  const config = popupStyles[type] || popupStyles.info;

  toast.custom(
    (t) => (
      <motion.div
        initial={{
          opacity: 0,
          y: 40,
          scale: 0.88,
        }}
        animate={{
          opacity: 1,
          y: 0,
          scale: 1,
        }}
        exit={{
          opacity: 0,
          y: 20,
          scale: 0.92,
        }}
        transition={{
          duration: 0.32,
        }}
      >
        <Box
          sx={{
            width: 420,

            position: "relative",

            overflow: "visible",

            borderRadius: "38px",

            background: config.bgSoft,

            backdropFilter: "blur(28px)",

            border:
              "1px solid rgba(255,255,255,0.82)",

            boxShadow: config.shadow,

            pt: 9,
            pb: 4,
            px: 4,

            textAlign: "center",
          }}
        >
          {/* BACK CARD */}

          <Box
            sx={{
              position: "absolute",

              bottom: -18,
              left: "8%",

              width: "84%",
              height: 32,

              borderRadius: "24px",

              background: config.gradient,

              opacity: 0.22,

              filter: "blur(14px)",

              zIndex: -1,
            }}
          />

          {/* TOP GLOW */}

          <Box
            sx={{
              position: "absolute",

              top: -80,
              left: "50%",

              transform:
                "translateX(-50%)",

              width: 220,
              height: 220,

              borderRadius: "50%",

              background: config.glow,

              filter: "blur(70px)",

              zIndex: 0,
            }}
          />

          {/* CLOSE */}

          <IconButton
            onClick={() => toast.dismiss(t.id)}
            sx={{
              position: "absolute",

              top: 16,
              right: 16,

              width: 34,
              height: 34,

              background:
                "rgba(255,255,255,0.75)",

              backdropFilter: "blur(10px)",

              "&:hover": {
                background:
                  "rgba(255,255,255,0.95)",
              },
            }}
          >
            <CloseRoundedIcon
              sx={{
                fontSize: 18,
              }}
            />
          </IconButton>

          {/* FLOATING ICON */}

          <Box
            sx={{
              position: "absolute",

              top: -58,
              left: "50%",

              transform:
                "translateX(-50%)",

              width: 118,
              height: 118,

              borderRadius: "50%",

              background:
                "rgba(255,255,255,0.75)",

              backdropFilter: "blur(22px)",

              border:
                "1px solid rgba(255,255,255,0.85)",

              boxShadow:
                "0 20px 50px rgba(0,0,0,0.12)",

              display: "flex",

              alignItems: "center",

              justifyContent: "center",
            }}
          >
            {/* INNER */}

            <Box
              sx={{
                width: 86,
                height: 86,

                borderRadius: "50%",

                background: config.gradient,

                display: "flex",

                alignItems: "center",

                justifyContent: "center",

                color: "#fff",

                boxShadow:
                  "0 18px 40px rgba(0,0,0,0.14)",

                "& svg": {
                  fontSize: 48,
                },
              }}
            >
              {config.icon}
            </Box>
          </Box>

          {/* SMALL DECOR */}

          <Box
            sx={{
              position: "absolute",

              top: 90,
              left: 28,

              width: 8,
              height: 8,

              borderRadius: "50%",

              background: config.gradient,
            }}
          />

          <Box
            sx={{
              position: "absolute",

              top: 120,
              right: 36,

              width: 10,
              height: 10,

              borderRadius: "50%",

              background: config.gradient,
            }}
          />

          {/* TITLE */}

          <Typography
            sx={{
              mt: 1,

              fontSize: 16,

              fontWeight: 600,

              color: "#6B7280",

              letterSpacing: ".02em",
            }}
          >
            {title}
          </Typography>

          {/* SUBTITLE */}

          <Typography
            sx={{
              mt: 1.5,

              fontSize: 34,

              lineHeight: 1.15,

              fontWeight: 800,

              color: "#111827",

              letterSpacing: "-0.05em",
            }}
          >
            {subtitle}
          </Typography>

          {/* DESCRIPTION */}

          <Typography
            sx={{
              mt: 2,
              fontSize: 13,
              lineHeight: 1.6,
              color: "#6B7280",
              maxWidth: 340,
              mx: "auto",
              whiteSpace: "pre-line",
              maxHeight: "150px",
              overflowY: "auto",
            }}
          >
            {description || (type === "success"
              ? "RTG synchronization process completed successfully."
              : type === "error"
              ? "An error occurred during the sync process."
              : "No action required.")}
          </Typography>

          {/* ACTION */}

          <Box
            sx={{
              mt: 4,

              display: "flex",

              justifyContent: "center",
            }}
          >
            <Box
              onClick={() =>
                toast.dismiss(t.id)
              }
              sx={{
                px: 4,
                py: 1.5,

                borderRadius: "18px",

                background: config.gradient,

                color: "#fff",

                fontWeight: 700,

                cursor: "pointer",

                boxShadow:
                  "0 14px 30px rgba(0,0,0,0.14)",

                transition: ".22s ease",

                "&:hover": {
                  transform:
                    "translateY(-2px)",
                },
              }}
            >
              Continue
            </Box>
          </Box>
        </Box>
      </motion.div>
    ),

    {
      duration: 3200,

      position: "top-center",
    }
  );
};
