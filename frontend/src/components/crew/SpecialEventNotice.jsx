import { useEffect, useState } from "react";
import { Box, Typography } from "@mui/material";
import api from "../../crewLegacy/api";

export default function SpecialEventNotice() {
  const [events, setEvents] = useState([]);
  useEffect(() => {
    let active = true;
    const load = () => api.get("/special-events").then(({ data }) => { if (active) setEvents(Array.isArray(data) ? data : []); }).catch(() => {});
    load(); const timer = setInterval(load, 60000);
    window.addEventListener("crew-special-events-changed", load);
    window.addEventListener("focus", load);
    return () => { active = false; clearInterval(timer); window.removeEventListener("crew-special-events-changed", load); window.removeEventListener("focus", load); };
  }, []);
  const today = new Date().toLocaleDateString("en-CA");
  const upcoming = events.filter(event => event.endDate >= today);
  if (!upcoming.length) return null;
  const message = upcoming.map(event => `${event.title}: ${event.startDate} to ${event.endDate} | ${event.departmentNames?.join(", ") || "All departments"}${event.submissionDeadline ? ` | Last application submission: ${event.submissionDeadline}` : ""} | ${event.leaveBlocked ? "No leave application in this period" : "Event announced; leave applications remain open"}`).join("     ?     ");
  return <Box role="status" aria-label="Special event announcements" sx={{ flexShrink: 0, overflow: "hidden", bgcolor: "#FFF1D4", color: "#824B0F", borderRadius: 2, py: 1, "@keyframes eventNotice": { from: { transform: "translateX(100%)" }, to: { transform: "translateX(-100%)" } }, "&:hover .event-notice": { animationPlayState: "paused" }, "@media (prefers-reduced-motion: reduce)": { overflowX: "auto", "& .event-notice": { animation: "none" } }, "@media print": { display: "none" } }}><Typography className="event-notice" sx={{ display: "inline-block", whiteSpace: "nowrap", fontSize: 13, fontWeight: 750, animation: "eventNotice 18s linear infinite" }}>{message}</Typography></Box>;
}
