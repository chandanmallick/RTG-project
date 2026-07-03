/**
 * ReportHeader.jsx
 * Simple event-first controls for the Frequency Compliance Report.
 */
import React from "react";
import { motion } from "framer-motion";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileUp,
  History,
  Loader2,
  Play,
  Plus,
  Terminal,
} from "lucide-react";

export default function ReportHeader({
  startTime,
  setStartTime,
  endTime,
  setEndTime,
  eventType = "low",
  onEventTypeChange = () => {},
  rtgStatusMsg,
  rtgStatusOk,
  rtgStatusLoading,
  wbesLoaded,
  rtgLoaded,
  scadaLoaded,
  scadaFile,
  onUploadClick,
  onProcessReport,
  dataLoading,
  onViewLogsClick,
  availableEvents = [],
  selectedEventId = "",
  onSelectEvent = () => {},
  useDatabase = false,
  setUseDatabase = () => {},
}) {
  const isHistorical = useDatabase;
  const isHigh = eventType === "high";
  const canProcess = (isHistorical ? !!selectedEventId : !!scadaFile) && !dataLoading;
  const savedEvents = availableEvents.filter((event) => event?.event_id);

  const switchMode = (historical) => {
    setUseDatabase(historical);
    if (!historical) onSelectEvent("");
  };

  const fieldStyle = {
    height: "36px",
    border: "1px solid #AFC4EA",
    borderRadius: "12px",
    background: "#FFFFFF",
    color: "#0F172A",
    fontSize: "0.78rem",
    outline: "none",
    padding: "0 10px",
    boxSizing: "border-box",
  };

  const iconFieldStyle = {
    height: "36px",
    border: "1px solid #AFC4EA",
    borderRadius: "12px",
    background: "#FFFFFF",
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    padding: "0 10px",
  };

  const modeButton = (active) => ({
    height: "34px",
    border: active ? "1px solid #0F6FDB" : "1px solid transparent",
    borderRadius: "11px",
    display: "inline-flex",
    alignItems: "center",
    gap: "7px",
    padding: "0 12px",
    background: active ? "linear-gradient(135deg, #147CFF 0%, #0F6FDB 100%)" : "rgba(255, 255, 255, 0.78)",
    color: active ? "#FFFFFF" : "#0B55B8",
    fontSize: "0.78rem",
    fontWeight: 850,
    cursor: "pointer",
  });

  const status = [
    ["WBES", wbesLoaded],
    ["RTG", rtgLoaded],
    [rtgStatusOk ? "Frequency" : "SCADA", scadaLoaded],
  ];

  return (
    <div style={{ marginBottom: "14px" }}>
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        style={{
          background: "linear-gradient(180deg, #F8FBFF 0%, #FFFFFF 56px)",
          border: "1px solid rgba(175, 196, 234, 0.72)",
          borderRadius: "16px",
          padding: "10px 12px",
          boxShadow: "0 12px 30px rgba(15, 111, 219, 0.07)",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto auto minmax(260px, auto) auto",
            alignItems: "center",
            gap: "10px",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ color: "#0F172A", fontSize: "1rem", fontWeight: 900, lineHeight: 1.1 }}>
              Frequency Event Analysis
            </div>
            <div style={{ color: "#64748B", fontSize: "0.68rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {isHigh ? "High Frequency Event" : "Low Frequency Event"} · {isHistorical ? "Historical event" : "New event"}
            </div>
          </div>

          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              background: "#F1F5F9",
              border: "1px solid #E2E8F0",
              borderRadius: "10px",
              padding: "3px",
            }}
          >
            <button type="button" onClick={() => onEventTypeChange("low")} style={modeButton(!isHigh)}>
              Low
            </button>
            <button type="button" onClick={() => onEventTypeChange("high")} style={modeButton(isHigh)}>
              High
            </button>
          </div>

          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              background: "#F1F5F9",
              border: "1px solid #E2E8F0",
              borderRadius: "10px",
              padding: "3px",
            }}
          >
            <button type="button" onClick={() => switchMode(false)} style={modeButton(!isHistorical)}>
              <Plus size={14} />
              New Event
            </button>
            <button type="button" onClick={() => switchMode(true)} style={modeButton(isHistorical)}>
              <History size={14} />
              Historical Event
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0, overflow: "hidden" }}>
            {isHistorical ? (
              <select
                value={selectedEventId}
                onChange={(e) => onSelectEvent(e.target.value)}
                style={{ ...fieldStyle, width: "min(420px, 100%)" }}
              >
                <option value="">{savedEvents.length ? "Select saved event" : "No saved events found"}</option>
                {savedEvents.map((event) => (
                  <option key={event.event_id} value={event.event_id}>
                    {event.name || "Low_Freq_duration"}
                  </option>
                ))}
              </select>
            ) : (
              <>
                <label style={iconFieldStyle}>
                  <CalendarDays size={15} style={{ color: "#03624C" }} />
                  <input
                    type="datetime-local"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    style={{ border: "none", outline: "none", color: "#0F172A", fontSize: "0.76rem" }}
                  />
                </label>
                <label style={iconFieldStyle}>
                  <Clock3 size={15} style={{ color: "#03624C" }} />
                  <input
                    type="datetime-local"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    style={{ border: "none", outline: "none", color: "#0F172A", fontSize: "0.76rem" }}
                  />
                </label>
                <button
                  type="button"
                  onClick={onUploadClick}
                  style={{
                    ...fieldStyle,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "7px",
                    cursor: "pointer",
                    fontWeight: 800,
                    color: "#03624C",
                    flex: "0 0 auto",
                  }}
                >
                  <FileUp size={15} />
                  {scadaFile ? "Change File" : "Upload Data"}
                </button>
              </>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px", justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={onProcessReport}
              disabled={!canProcess}
              style={{
                height: "36px",
                border: "none",
                borderRadius: "8px",
                background: canProcess ? "#10B981" : "#CBD5E1",
                color: canProcess ? "#022726" : "#64748B",
                display: "inline-flex",
                alignItems: "center",
                gap: "7px",
                padding: "0 14px",
                fontWeight: 900,
                fontSize: "0.78rem",
                cursor: canProcess ? "pointer" : "not-allowed",
              }}
            >
              {dataLoading ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
              {dataLoading ? (isHistorical ? "Loading" : "Processing") : (isHistorical ? "Load" : "Process")}
            </button>
            <button
              type="button"
              onClick={onViewLogsClick}
              title="View logs"
              style={{
                width: "36px",
                height: "36px",
                border: "1px solid #CBD5E1",
                borderRadius: "8px",
                background: "#FFFFFF",
                color: "#475569",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
              }}
            >
              <Terminal size={16} />
            </button>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "8px", flexWrap: "wrap" }}>
          {status.map(([label, ok]) => (
            <span
              key={label}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                color: ok ? "#15803D" : "#B91C1C",
                background: ok ? "#DCFCE7" : "#FEE2E2",
                borderRadius: "999px",
                padding: "3px 8px",
                fontSize: "0.66rem",
                fontWeight: 850,
              }}
            >
              {ok ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
              {label}
            </span>
          ))}
          {rtgStatusMsg && (
            <span style={{ color: rtgStatusOk ? "#065F46" : "#92400E", fontSize: "0.7rem", fontWeight: 700 }}>
              {rtgStatusLoading ? "Checking RTG..." : rtgStatusMsg}
            </span>
          )}
        </div>
      </motion.div>
    </div>
  );
}
