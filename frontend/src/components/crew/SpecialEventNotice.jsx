import { useEffect, useState } from "react";
import { Box, Typography, Chip, Stack } from "@mui/material";
import dayjs from "dayjs";
import api from "../../crewLegacy/api";

const formatEventDate = (d) => {
  if (!d) return "";
  const parsed = dayjs(d);
  return parsed.isValid() ? parsed.format("DD-MMM-YYYY") : d;
};

export default function SpecialEventNotice() {
  const [events, setEvents] = useState([]);

  useEffect(() => {
    let active = true;
    const load = () =>
      api
        .get("/special-events")
        .then(({ data }) => {
          if (active) setEvents(Array.isArray(data) ? data : []);
        })
        .catch(() => {});

    load();
    const timer = setInterval(load, 60000);
    window.addEventListener("crew-special-events-changed", load);
    window.addEventListener("focus", load);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("crew-special-events-changed", load);
      window.removeEventListener("focus", load);
    };
  }, []);

  const today = new Date().toLocaleDateString("en-CA");
  const upcoming = events.filter((event) => event.endDate >= today);
  if (!upcoming.length) return null;

  const message = upcoming
    .map(
      (event) =>
        `${event.title}: ${formatEventDate(event.startDate)} to ${formatEventDate(event.endDate)} | ${
          event.departmentNames?.join(", ") || "All departments"
        }${
          event.submissionDeadline
            ? ` | Last application submission: ${formatEventDate(event.submissionDeadline)}`
            : ""
        } | ${
          event.leaveBlocked
            ? "No leave application in this period"
            : "Event announced; leave applications remain open"
        }`
    )
    .join("     ★     ");

  return (
    <Box
      role="status"
      aria-label="Special event announcements"
      sx={{
        display: "flex",
        alignItems: "center",
        flexShrink: 0,
        overflow: "hidden",
        bgcolor: "#FEF2F2",
        color: "#991B1B",
        borderRadius: 2,
        py: 0.8,
        px: 1.5,
        border: "1.5px solid #EF4444",
        boxShadow: "0 0 14px rgba(239, 68, 68, 0.45), inset 0 0 8px rgba(239, 68, 68, 0.12)",
        animation: "redGlow 2.5s ease-in-out infinite",
        "@keyframes redGlow": {
          "0%, 100%": {
            boxShadow: "0 0 12px rgba(239, 68, 68, 0.45), inset 0 0 8px rgba(239, 68, 68, 0.12)",
            borderColor: "#EF4444",
          },
          "50%": {
            boxShadow: "0 0 24px rgba(239, 68, 68, 0.8), inset 0 0 14px rgba(239, 68, 68, 0.22)",
            borderColor: "#DC2626",
          },
        },
        "@keyframes eventNoticeSlow": {
          from: { transform: "translateX(100%)" },
          to: { transform: "translateX(-100%)" },
        },
        "&:hover .event-notice": { animationPlayState: "paused" },
        "@media (prefers-reduced-motion: reduce)": {
          overflowX: "auto",
          "& .event-notice": { animation: "none" },
        },
        "@media print": { display: "none" },
      }}
    >
      <Chip
        label="EVENT NOTICE"
        size="small"
        sx={{
          mr: 1.5,
          height: 22,
          fontSize: "0.68rem",
          fontWeight: 900,
          bgcolor: "#DC2626",
          color: "#FFFFFF",
          letterSpacing: 0.5,
          flexShrink: 0,
          boxShadow: "0 0 8px rgba(220, 38, 38, 0.6)",
        }}
      />
      <Box sx={{ flex: 1, overflow: "hidden", whiteSpace: "nowrap" }}>
        <Typography
          className="event-notice"
          sx={{
            display: "inline-block",
            whiteSpace: "nowrap",
            fontSize: 13,
            fontWeight: 800,
            letterSpacing: 0.2,
            animation: "eventNoticeSlow 55s linear infinite",
          }}
        >
          {message}
        </Typography>
      </Box>
    </Box>
  );
}
