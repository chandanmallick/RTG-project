import React, { useState } from "react";
import { Box, Button, Paper, Stack } from "@mui/material";
import { ArrowLeftRight, Users, Sparkles, LayoutGrid, CalendarRange } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import WorkflowHeader from "../../components/crew/WorkflowHeader";
import SpecialEventRoster from "../../components/crew/SpecialEventRoster";
import SpecialRosterMatrix from "../../components/crew/SpecialRosterMatrix";

export default function SpecialEventsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(params.get("view") || "matrix");
  const [focusedEventId, setFocusedEventId] = useState(params.get("eventId") || null);

  const switchTab = (tabId, evId = null) => {
    setActiveTab(tabId);
    if (evId) setFocusedEventId(evId);
    setParams({ view: tabId, ...(evId ? { eventId: evId } : {}) });
  };

  return (
    <Box sx={{ p: { xs: 1.5, md: 3 }, minHeight: "calc(100dvh - 100px)", background: "#F8FAFC" }}>
      {/* Workflow Header */}
      <Box sx={{ mb: 2.5 }}>
        <WorkflowHeader
          eyebrow="Special Operations & Rostering"
          title="Special Event Rostering & Coverage Tower"
          subtitle="Duty Type vs Days Matrix · Drag & Drop shift rearrangement · Cross-department sequential allocation"
          accent="#6D28D9"
        >
          <Stack direction="row" spacing={1} flexWrap="wrap">
            <Button
              onClick={() => navigate("/crew/replacement?tab=duty")}
              startIcon={<ArrowLeftRight size={14} />}
              size="small"
              sx={{
                bgcolor: "#EDE9FE",
                color: "#6D28D9",
                border: "1px solid #DDD6FE",
                textTransform: "none",
                fontWeight: 850,
                "&:hover": { bgcolor: "#DDD6FE" },
              }}
            >
              Duty Assignment & Extra Manpower
            </Button>
            <Button
              onClick={() => navigate("/crew/replacement?tab=roster")}
              startIcon={<Sparkles size={14} />}
              size="small"
              sx={{
                bgcolor: "#F0FDF4",
                color: "#15803D",
                border: "1px solid #BBF7D0",
                textTransform: "none",
                fontWeight: 850,
                "&:hover": { bgcolor: "#DCFCE7" },
              }}
            >
              Replacement Roster Matrix
            </Button>
            <Button
              onClick={() => navigate("/crew/operations")}
              startIcon={<Users size={14} />}
              size="small"
              sx={{
                bgcolor: "#F1F5F9",
                color: "#334155",
                border: "1px solid #CBD5E1",
                textTransform: "none",
                fontWeight: 850,
                "&:hover": { bgcolor: "#E2E8F0" },
              }}
            >
              Approvals & Inbox
            </Button>
          </Stack>
        </WorkflowHeader>
      </Box>

      {/* View Switcher Navigation Bar */}
      <Paper
        elevation={0}
        sx={{
          mb: 2.5,
          p: 0.8,
          borderRadius: 3,
          border: "1px solid #D8E4F0",
          bgcolor: "#FFFFFF",
          boxShadow: "0 4px 16px rgba(15, 23, 42, 0.04)",
        }}
      >
        <Stack direction="row" spacing={1}>
          <Button
            onClick={() => switchTab("matrix")}
            startIcon={<LayoutGrid size={16} />}
            sx={{
              px: 2.2,
              py: 0.9,
              borderRadius: 2.2,
              textTransform: "none",
              fontWeight: activeTab === "matrix" ? 900 : 750,
              fontSize: "0.9rem",
              bgcolor: activeTab === "matrix" ? "#6D28D9" : "transparent",
              color: activeTab === "matrix" ? "#FFFFFF" : "#475569",
              boxShadow: activeTab === "matrix" ? "0 4px 14px rgba(109, 40, 217, 0.3)" : "none",
              "&:hover": {
                bgcolor: activeTab === "matrix" ? "#5B21B6" : "#F1F5F9",
                color: activeTab === "matrix" ? "#FFFFFF" : "#0F172A",
              },
            }}
          >
            Interactive Duty Matrix (Drag & Drop)
          </Button>

          <Button
            onClick={() => switchTab("events")}
            startIcon={<CalendarRange size={16} />}
            sx={{
              px: 2.2,
              py: 0.9,
              borderRadius: 2.2,
              textTransform: "none",
              fontWeight: activeTab === "events" ? 900 : 750,
              fontSize: "0.9rem",
              bgcolor: activeTab === "events" ? "#6D28D9" : "transparent",
              color: activeTab === "events" ? "#FFFFFF" : "#475569",
              boxShadow: activeTab === "events" ? "0 4px 14px rgba(109, 40, 217, 0.3)" : "none",
              "&:hover": {
                bgcolor: activeTab === "events" ? "#5B21B6" : "#F1F5F9",
                color: activeTab === "events" ? "#FFFFFF" : "#0F172A",
              },
            }}
          >
            Special Event Cards & Leave Blocking
          </Button>
        </Stack>
      </Paper>

      {/* Active Tab View */}
      {activeTab === "matrix" ? (
        <SpecialRosterMatrix
          eventId={focusedEventId}
          onEventChange={(id) => setFocusedEventId(id)}
        />
      ) : (
        <SpecialEventRoster
          onOpenMatrix={(evId) => switchTab("matrix", evId)}
        />
      )}
    </Box>
  );
}
