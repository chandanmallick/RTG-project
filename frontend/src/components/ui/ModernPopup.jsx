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
      "linear-gradient(135deg,#08103A,#0057B7)",

    glow: "rgba(0,87,183,0.2)",

    shadow:
      "0 35px 80px rgba(0,87,183,0.2)",

    bgSoft:
      "linear-gradient(180deg,#EAF1FB,#FFFFFF)",
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

const compactPopupText = (value, fallback) => {
  const text = String(value || fallback || "").trim();
  if (!text) return "";

  // Raw transport errors can be very long and are not useful to portal users.
  if (/HTTPSConnectionPool|ConnectTimeout|ReadTimeout|timed out|Max retries exceeded/i.test(text)) {
    return "The source server did not respond in time. Please try again later.";
  }
  if (/Network Error|Failed to fetch/i.test(text)) {
    return "Unable to reach the source service. Please check the connection and try again.";
  }
  return text.length > 180 ? `${text.slice(0, 177).trim()}…` : text;
};

export const showModernPopup = ({
  type = "success",
  title = "",
  subtitle = "",
  description = "",
}) => {
  const config = popupStyles[type] || popupStyles.info;
  const compactSubtitle = compactPopupText(subtitle, title);
  const compactDescription = compactPopupText(
    description,
    type === "success"
      ? "Operation completed successfully."
      : type === "error"
      ? "The request could not be completed."
      : "No action required."
  );

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
            width: "min(360px, calc(100vw - 32px))",

            position: "relative",

            overflow: "visible",

            borderRadius: "14px",

            background: config.bgSoft,

            backdropFilter: "blur(28px)",

            border:
              "1px solid rgba(184, 204, 227, 0.72)",

            boxShadow: config.shadow,

            pt: 5.5,
            pb: 2.5,
            px: 2.5,

            textAlign: "center",
          }}
        >
          {/* BACK CARD */}

          <Box
            sx={{
              position: "absolute",

              bottom: -12,
              left: "8%",

              width: "84%",
              height: 22,

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

              top: -48,
              left: "50%",

              transform:
                "translateX(-50%)",

              width: 150,
              height: 150,

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

              top: 10,
              right: 10,

              width: 28,
              height: 28,

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
                fontSize: 16,
              }}
            />
          </IconButton>

          {/* FLOATING ICON */}

          <Box
            sx={{
              position: "absolute",

              top: -36,
              left: "50%",

              transform:
                "translateX(-50%)",

              width: 74,
              height: 74,

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
                width: 56,
                height: 56,

                borderRadius: "50%",

                background: config.gradient,

                display: "flex",

                alignItems: "center",

                justifyContent: "center",

                color: "#fff",

                boxShadow:
                  "0 18px 40px rgba(0,0,0,0.14)",

                "& svg": {
                  fontSize: 31,
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

              top: 55,
              left: 18,

              width: 6,
              height: 6,

              borderRadius: "50%",

              background: config.gradient,
            }}
          />

          <Box
            sx={{
              position: "absolute",

              top: 76,
              right: 22,

              width: 7,
              height: 7,

              borderRadius: "50%",

              background: config.gradient,
            }}
          />

          {/* TITLE */}

          <Typography
            sx={{
              mt: 0.5,

              fontSize: 13,

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
              mt: 0.75,

              fontSize: 17,

              lineHeight: 1.35,

              fontWeight: 700,

              color: "#111827",

              letterSpacing: "-0.01em",
              overflowWrap: "anywhere",
            }}
          >
            {compactSubtitle}
          </Typography>

          {/* DESCRIPTION */}

          <Typography
            sx={{
              mt: 1,
              fontSize: 12,
              lineHeight: 1.45,
              color: "#6B7280",
              maxWidth: 300,
              mx: "auto",
              whiteSpace: "pre-line",
              maxHeight: "72px",
              overflowY: "auto",
              overflowWrap: "anywhere",
            }}
          >
            {compactDescription}
          </Typography>

          {/* ACTION */}

          <Box
            sx={{
              mt: 2,

              display: "flex",

              justifyContent: "center",
            }}
          >
            <Box
              onClick={() =>
                toast.dismiss(t.id)
              }
              sx={{
                px: 2.5,
                py: 0.85,

                borderRadius: "10px",

                background: config.gradient,

                color: "#fff",

                fontWeight: 700,
                fontSize: 12,

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
