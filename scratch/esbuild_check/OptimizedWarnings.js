import React, { useState, useMemo } from "react";
import { Box, Typography, Button, Collapse, Chip, Stack } from "@mui/material";
import { AlertTriangle, ChevronDown, ChevronUp, Info, CheckCircle2 } from "lucide-react";
export default function OptimizedWarnings({ warnings = [], title = "Data Availability & Entity Notes" }) {
  const [expanded, setExpanded] = useState(false);
  const parsed = useMemo(() => {
    if (!warnings || !Array.isArray(warnings) || !warnings.length) {
      return { total: 0, scheduleStations: [], excludedGenerators: [], generalNotices: [] };
    }
    const uniqueRaw = Array.from(new Set(warnings.filter(Boolean)));
    const scheduleStations = [];
    const excludedGenerators = [];
    const generalNotices = [];
    uniqueRaw.forEach((w) => {
      const text = String(w).trim();
      const groupedScheduleMatch = text.match(/^(\d+)\s+generating station\(s\)\s+without separate schedule column[^:]*:\s*(.*)$/i);
      if (groupedScheduleMatch) {
        const stationList = groupedScheduleMatch[2].split(",").map((s) => s.trim()).filter(Boolean);
        scheduleStations.push(...stationList);
        return;
      }
      const singleScheduleMatch = text.match(/^(.*?):\s*no separate schedule column;\s*OD\/UI remains unavailable\.?$/i);
      if (singleScheduleMatch) {
        scheduleStations.push(singleScheduleMatch[1].trim());
        return;
      }
      const excludedMatch = text.match(/^(?:State-sector or unclassified generators excluded[^:]*):\s*(.*)$/i);
      if (excludedMatch) {
        const genList = excludedMatch[1].split(",").map((s) => s.trim()).filter(Boolean);
        excludedGenerators.push(...genList);
        return;
      }
      generalNotices.push(text);
    });
    const uniqStations = Array.from(new Set(scheduleStations));
    const uniqExcluded = Array.from(new Set(excludedGenerators));
    const totalCount = uniqStations.length + uniqExcluded.length + generalNotices.length;
    return {
      total: totalCount,
      scheduleStations: uniqStations,
      excludedGenerators: uniqExcluded,
      generalNotices
    };
  }, [warnings]);
  if (!parsed.total) return null;
  const summaryParts = [];
  if (parsed.scheduleStations.length > 0) {
    summaryParts.push(`${parsed.scheduleStations.length} station(s) lack separate schedule (OD/UI unavailable)`);
  }
  if (parsed.excludedGenerators.length > 0) {
    summaryParts.push(`${parsed.excludedGenerators.length} state-sector generator(s) excluded from ISGS/IPP drawal`);
  }
  if (parsed.generalNotices.length > 0) {
    summaryParts.push(`${parsed.generalNotices.length} system notice(s)`);
  }
  const summaryText = summaryParts.join(" \xB7 ");
  return /* @__PURE__ */ React.createElement(
    Box,
    {
      sx: {
        my: 1.5,
        borderRadius: "9px",
        border: "1px solid #FCD34D",
        background: "linear-gradient(135deg, #FEFCE8 0%, #FFFBEB 100%)",
        p: "7px 14px",
        boxShadow: "0 1px 3px rgba(217, 119, 6, 0.05)"
      }
    },
    /* @__PURE__ */ React.createElement(
      Box,
      {
        sx: {
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1.5,
          flexWrap: "wrap"
        }
      },
      /* @__PURE__ */ React.createElement(Box, { sx: { display: "flex", alignItems: "center", gap: 1, minWidth: 0, flex: "1 1 auto" } }, /* @__PURE__ */ React.createElement(AlertTriangle, { size: 15, color: "#D97706", style: { flexShrink: 0 } }), /* @__PURE__ */ React.createElement(Box, { sx: { minWidth: 0 } }, /* @__PURE__ */ React.createElement(Box, { sx: { display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement(Typography, { sx: { fontSize: 12.5, fontWeight: 800, color: "#92400E" } }, title), /* @__PURE__ */ React.createElement(
        Chip,
        {
          size: "small",
          label: `${parsed.total} Notice${parsed.total > 1 ? "s" : ""}`,
          sx: {
            height: 18,
            fontSize: 10,
            fontWeight: 800,
            bgcolor: "#FDE68A",
            color: "#78350F"
          }
        }
      )), /* @__PURE__ */ React.createElement(
        Typography,
        {
          sx: {
            fontSize: 11,
            color: "#B45309",
            mt: 0.1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            maxWidth: { xs: "260px", sm: "500px", md: "750px" }
          },
          title: summaryText
        },
        summaryText
      ))),
      /* @__PURE__ */ React.createElement(
        Button,
        {
          size: "small",
          onClick: () => setExpanded((v) => !v),
          endIcon: expanded ? /* @__PURE__ */ React.createElement(ChevronUp, { size: 13 }) : /* @__PURE__ */ React.createElement(ChevronDown, { size: 13 }),
          sx: {
            textTransform: "none",
            fontSize: 11,
            fontWeight: 800,
            color: "#92400E",
            bgcolor: "rgba(251, 191, 36, 0.22)",
            "&:hover": { bgcolor: "rgba(251, 191, 36, 0.38)" },
            px: 1.25,
            py: 0.25,
            minHeight: 24,
            borderRadius: "6px",
            border: "1px solid #FCD34D"
          }
        },
        expanded ? "Hide Details" : "View Details"
      )
    ),
    /* @__PURE__ */ React.createElement(Collapse, { in: expanded }, /* @__PURE__ */ React.createElement(Box, { sx: { mt: 1.25, pt: 1, borderTop: "1px solid #FDE68A" } }, parsed.scheduleStations.length > 0 && /* @__PURE__ */ React.createElement(Box, { sx: { mb: 1 } }, /* @__PURE__ */ React.createElement(
      Typography,
      {
        sx: {
          fontSize: 10.5,
          fontWeight: 800,
          color: "#78350F",
          textTransform: "uppercase",
          letterSpacing: 0.4,
          mb: 0.5
        }
      },
      "Generating Stations Without Separate Schedule (",
      parsed.scheduleStations.length,
      ")"
    ), /* @__PURE__ */ React.createElement(
      Box,
      {
        sx: {
          display: "flex",
          flexWrap: "wrap",
          gap: 0.5,
          maxHeight: 110,
          overflowY: "auto",
          p: 0.75,
          bgcolor: "rgba(255, 255, 255, 0.75)",
          borderRadius: "6px",
          border: "1px solid #FDE68A"
        }
      },
      parsed.scheduleStations.map((station) => /* @__PURE__ */ React.createElement(
        Chip,
        {
          key: station,
          size: "small",
          label: station,
          sx: {
            bgcolor: "#FFFFFF",
            color: "#92400E",
            border: "1px solid #FCD34D",
            fontSize: 10,
            fontWeight: 700,
            height: 20
          }
        }
      ))
    )), parsed.excludedGenerators.length > 0 && /* @__PURE__ */ React.createElement(Box, { sx: { mb: 1 } }, /* @__PURE__ */ React.createElement(
      Typography,
      {
        sx: {
          fontSize: 10.5,
          fontWeight: 800,
          color: "#78350F",
          textTransform: "uppercase",
          letterSpacing: 0.4,
          mb: 0.5
        }
      },
      "State-Sector / Unclassified Units Excluded from State Drawal (",
      parsed.excludedGenerators.length,
      ")"
    ), /* @__PURE__ */ React.createElement(
      Box,
      {
        sx: {
          display: "flex",
          flexWrap: "wrap",
          gap: 0.5,
          maxHeight: 80,
          overflowY: "auto",
          p: 0.75,
          bgcolor: "rgba(255, 255, 255, 0.75)",
          borderRadius: "6px",
          border: "1px solid #FDE68A"
        }
      },
      parsed.excludedGenerators.map((gen) => /* @__PURE__ */ React.createElement(
        Chip,
        {
          key: gen,
          size: "small",
          label: gen,
          sx: {
            bgcolor: "#FFFFFF",
            color: "#92400E",
            border: "1px solid #FCD34D",
            fontSize: 10,
            fontWeight: 700,
            height: 20
          }
        }
      ))
    )), parsed.generalNotices.length > 0 && /* @__PURE__ */ React.createElement(Box, { sx: { display: "flex", flexDirection: "column", gap: 0.4, mt: 0.5 } }, parsed.generalNotices.map((notice, idx) => /* @__PURE__ */ React.createElement(Typography, { key: idx, sx: { fontSize: 11, color: "#92400E", lineHeight: 1.4 } }, "\u2022 ", notice)))))
  );
}
