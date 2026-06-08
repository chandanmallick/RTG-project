/**
 * ReportHeader.jsx
 * Header for the Frequency Compliance Report with date pickers, upload buttons, and recalculation triggers.
 */
import React, { useRef } from "react";
import { Zap, RefreshCw, AlertCircle, CheckCircle2, FileUp, Loader2 } from "lucide-react";

export default function ReportHeader({
  startTime,
  setStartTime,
  endTime,
  setEndTime,
  rtgStatusMsg,
  rtgStatusOk,
  rtgStatusLoading,
  wbesLoaded,
  rtgLoaded,
  scadaLoaded,
  scadaFile,
  onFileSelect,
  onUploadClick,
  onProcessReport,
  dataLoading,
  showSchAct,
  setShowSchAct,
}) {
  // Recalculate button activation state
  const canProcess = !!scadaFile && !dataLoading;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginBottom: "20px" }}>
      {/* ── HERO BANNER ─────────────────────────────────────────── */}
      <div
        style={{
          background: "linear-gradient(135deg, #022726 0%, #03624C 55%, #17876D 100%)",
          borderRadius: "16px",
          padding: "20px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "16px",
          boxShadow: "0 10px 30px -5px rgba(2,39,38,0.3)",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <Zap size={24} style={{ color: "#34D399" }} />
            <h1 style={{ color: "#FFFFFF", fontWeight: 800, fontSize: "1.4rem", margin: 0, letterSpacing: "-0.02em" }}>
              Generation Frequency & Deviation Report
            </h1>
          </div>
          <p style={{ color: "rgba(255,255,255,0.7)", fontSize: "0.8rem", margin: "4px 0 0" }}>
            Compare SCADA Actuals with WBES and RTG Schedules
          </p>
        </div>

        {/* Date and Time pickers */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
            <label style={{ fontSize: "0.62rem", color: "rgba(255,255,255,0.75)", fontWeight: 800, letterSpacing: "0.05em" }}>
              START DATETIME
            </label>
            <input
              type="datetime-local"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              style={{
                background: "rgba(255,255,255,0.12)",
                border: "1px solid rgba(255,255,255,0.25)",
                borderRadius: "8px",
                padding: "6px 10px",
                color: "#FFFFFF",
                fontSize: "0.8rem",
                outline: "none",
              }}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
            <label style={{ fontSize: "0.62rem", color: "rgba(255,255,255,0.75)", fontWeight: 800, letterSpacing: "0.05em" }}>
              END DATETIME
            </label>
            <input
              type="datetime-local"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              style={{
                background: "rgba(255,255,255,0.12)",
                border: "1px solid rgba(255,255,255,0.25)",
                borderRadius: "8px",
                padding: "6px 10px",
                color: "#FFFFFF",
                fontSize: "0.8rem",
                outline: "none",
              }}
            />
          </div>
          <button
            onClick={onProcessReport}
            disabled={!canProcess}
            title={!scadaFile ? "Upload a SCADA/Frequency Excel file to enable" : "Fetch all data & recalculate compliance"}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              background: canProcess ? "linear-gradient(135deg, #34D399, #10B981)" : "#475569",
              border: "none",
              borderRadius: "8px",
              padding: "8px 18px",
              fontWeight: 700,
              fontSize: "0.82rem",
              color: canProcess ? "#022726" : "#94A3B8",
              cursor: canProcess ? "pointer" : "not-allowed",
              marginTop: "14px",
              transition: "all 0.2s",
              boxShadow: canProcess ? "0 4px 12px rgba(52,211,153,0.25)" : "none",
            }}
          >
            {dataLoading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <RefreshCw size={14} />
            )}
            {dataLoading ? "Processing..." : "Apply & Recalculate"}
          </button>
        </div>
      </div>

      {/* ── RTG STATUS BANNER ─────────────────────────────── */}
      {rtgStatusMsg && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            background: rtgStatusOk ? "rgba(16,185,129,0.06)" : "rgba(245,158,11,0.06)",
            border: `1px solid ${rtgStatusOk ? "rgba(16,185,129,0.2)" : "rgba(245,158,11,0.2)"}`,
            borderRadius: "12px",
            padding: "12px 18px",
            fontSize: "0.8rem",
            color: rtgStatusOk ? "#065F46" : "#92400E",
            boxShadow: "0 2px 6px rgba(0,0,0,0.02)",
          }}
        >
          {rtgStatusLoading ? (
            <Loader2 size={16} className="animate-spin text-secondary" style={{ flexShrink: 0 }} />
          ) : (
            <AlertCircle size={16} style={{ color: rtgStatusOk ? "#10B981" : "#F59E0B", flexShrink: 0 }} />
          )}
          <div>
            <strong style={{ fontWeight: 800 }}>RTG Portal SCADA Availability:</strong> {rtgStatusMsg}
          </div>
        </div>
      )}

      {/* ── STATUS STRIP ─────────────────────────────────── */}
      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
        {[
          { label: "WBES Data", ok: wbesLoaded, src: "WBES / POSOCO" },
          { label: "RTG Data", ok: rtgLoaded, src: "RTG Portal" },
          {
            label: rtgStatusOk ? "Frequency Data" : "SCADA Data",
            ok: scadaLoaded,
            src: scadaFile
              ? scadaFile.name
              : rtgStatusOk
              ? "Upload Frequency-only Excel"
              : "Upload full SCADA Excel",
            action: onUploadClick,
          },
        ].map((s, i) => (
          <div
            key={i}
            onClick={s.action}
            style={{
              flex: 1,
              minWidth: "180px",
              background: s.ok ? "rgba(16,185,129,0.06)" : "rgba(100,116,139,0.05)",
              border: `1px solid ${s.ok ? "rgba(16,185,129,0.25)" : "rgba(100,116,139,0.15)"}`,
              borderRadius: "12px",
              padding: "12px 16px",
              display: "flex",
              alignItems: "center",
              gap: "10px",
              cursor: s.action ? "pointer" : "default",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => {
              if (s.action) e.currentTarget.style.borderColor = "#10B981";
            }}
            onMouseLeave={(e) => {
              if (s.action)
                e.currentTarget.style.borderColor = s.ok ? "rgba(16,185,129,0.25)" : "rgba(100,116,139,0.15)";
            }}
          >
            {s.ok ? (
              <CheckCircle2 size={18} style={{ color: "#10B981", flexShrink: 0 }} />
            ) : (
              <AlertCircle size={18} style={{ color: "#94A3B8", flexShrink: 0 }} />
            )}
            <div style={{ flex: 1, overflow: "hidden" }}>
              <div style={{ fontWeight: 700, fontSize: "0.78rem", color: s.ok ? "#065F46" : "#334155" }}>
                {s.label}
              </div>
              <div
                style={{
                  fontSize: "0.68rem",
                  color: "#64748B",
                  textOverflow: "ellipsis",
                  overflow: "hidden",
                  whiteSpace: "nowrap",
                  maxWidth: "240px",
                }}
              >
                {s.ok ? `Loaded (${s.src})` : "Not loaded"}
              </div>
            </div>
          </div>
        ))}

        <button
          onClick={onUploadClick}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            background: "#FFFFFF",
            border: "2px dashed #CBD5E1",
            borderRadius: "12px",
            padding: "12px 20px",
            fontWeight: 700,
            fontSize: "0.78rem",
            color: "#475569",
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "#6366F1";
            e.currentTarget.style.color = "#6366F1";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "#CBD5E1";
            e.currentTarget.style.color = "#475569";
          }}
        >
          <FileUp size={15} />
          {scadaFile
            ? "Change file"
            : rtgStatusOk
            ? "Upload Frequency-only Excel"
            : "Upload Full SCADA Excel"}
        </button>

        {/* Global toggler for showing Schedule & Actual */}
        {scadaLoaded && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              background: "#FFFFFF",
              border: "1px solid #E2E8F0",
              borderRadius: "12px",
              padding: "8px 16px",
              boxShadow: "0 2px 4px rgba(0,0,0,0.02)",
            }}
          >
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                cursor: "pointer",
                userSelect: "none",
                fontSize: "0.78rem",
                color: "#475569",
                fontWeight: "600",
              }}
            >
              <input
                type="checkbox"
                checked={showSchAct}
                onChange={(e) => setShowSchAct(e.target.checked)}
                style={{ cursor: "pointer", accentColor: "#10B981", width: "14px", height: "14px" }}
              />
              Show Schedule &amp; Actual on Charts
            </label>
          </div>
        )}
      </div>
    </div>
  );
}
