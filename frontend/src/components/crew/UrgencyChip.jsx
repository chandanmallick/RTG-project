import React from "react";
import dayjs from "dayjs";
import { Chip, Tooltip } from "@mui/material";

export function computeUrgencyTag(applicationDate, leaveDate) {
  if (!leaveDate) return "Urgent";
  const appDate = dayjs(applicationDate || undefined).startOf("day");
  const lvDate = dayjs(leaveDate).startOf("day");
  const diffDays = lvDate.diff(appDate, "day");
  if (diffDays > 7) return "Planned";
  if (diffDays >= 2) return "Urgent";
  return "Emergency";
}

const URGENCY_CONFIG = {
  Planned: {
    color: "#166534",
    bg: "#DCFCE7",
    border: "#86EFAC",
    tooltip: "Planned leave (applied > 7 days in advance)",
  },
  Urgent: {
    color: "#854D0E",
    bg: "#FEF9C3",
    border: "#FDE047",
    tooltip: "Urgent leave (applied 2–7 days in advance)",
  },
  Emergency: {
    color: "#991B1B",
    bg: "#FEE2E2",
    border: "#FCA5A5",
    tooltip: "Emergency leave (applied < 2 days in advance)",
  },
};

export default function UrgencyChip({ value, size = "small", sx = {} }) {
  if (!value) return null;
  const tag = String(value).trim();
  const config = URGENCY_CONFIG[tag] || {
    color: "#475569",
    bg: "#F1F5F9",
    border: "#CBD5E1",
    tooltip: `Urgency: ${tag}`,
  };

  return (
    <Tooltip title={config.tooltip} arrow>
      <Chip
        size={size}
        label={tag}
        sx={{
          fontWeight: 900,
          fontSize: size === "small" ? "0.72rem" : "0.78rem",
          height: size === "small" ? 22 : 26,
          color: config.color,
          backgroundColor: config.bg,
          border: `1px solid ${config.border}`,
          borderRadius: 1.5,
          letterSpacing: "0.02em",
          ...sx,
        }}
      />
    </Tooltip>
  );
}
