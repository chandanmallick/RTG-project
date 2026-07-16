/**
 * StateComplianceTable.jsx
 * Interactive table for state compliance with accordion rows.
 */
import React from "react";
import { ChevronDown, ChevronUp, Zap } from "lucide-react";
import SectionAccordion from "../../../components/ui/SectionAccordion";
import ComplianceChart from "./ComplianceChart";
import StatisticsCard from "./StatisticsCard";

// Helper to format values
const fmt = (v, dec = 0) =>
  !Number.isFinite(Number(v)) ? "-" :
  v === null || v === undefined ? "—" : Number(v).toFixed(dec);

export default function StateComplianceTable({
  rows,
  expandedRowIds,
  onToggleExpand,
  onExpandAll,
  onCollapseAll,
  onUpdateRowField,
  showSchAct,
  onEditRawData,
  chartFontSize = 12,
}) {
  if (rows.length === 0) return null;
  const totalMsgCount = rows.reduce((sum, row) => {
    const count = Number.isFinite(Number(row.crms_message_count))
      ? Number(row.crms_message_count)
      : (Array.isArray(row.crms_messages) ? row.crms_messages.length : 0);
    return sum + count;
  }, 0);

  return (
    <SectionAccordion
      title="State Drawal Compliance Details"
      subtitle="State drawal schedules and compliance statistics (Click a state to view plot)"
      count={rows.length}
      actions={
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <button
            type="button"
            onClick={onExpandAll}
            style={{
              border: "1px solid rgba(255,255,255,0.25)",
              borderRadius: "6px",
              padding: "4px 9px",
              background: "rgba(255,255,255,0.14)",
              color: "#FFFFFF",
              fontSize: "0.72rem",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Open all
          </button>
          <button
            type="button"
            onClick={onCollapseAll}
            style={{
              border: "1px solid rgba(255,255,255,0.25)",
              borderRadius: "6px",
              padding: "4px 9px",
              background: "rgba(255,255,255,0.08)",
              color: "#FFFFFF",
              fontSize: "0.72rem",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Close all
          </button>
        </div>
      }
    >
      <div
        style={{
          overflowX: "auto",
          borderRadius: "14px",
          border: "1px solid rgba(184, 228, 211, 0.72)",
          boxShadow: "0 8px 22px rgba(3, 98, 76, 0.055)",
          marginBottom: "16px",
          background: "linear-gradient(180deg, #E8F5F1 0%, #FFFFFF 56px)",
        }}
      >
        <table
          style={{
            borderCollapse: "collapse",
            width: "100%",
            tableLayout: "fixed",
            minWidth: "980px",
          }}
        >
          <colgroup>
            <col style={{ width: "180px" }} />
            <col style={{ width: "110px" }} />
            <col style={{ width: "110px" }} />
            <col style={{ width: "110px" }} />
            <col style={{ width: "120px" }} />
            <col style={{ width: "130px" }} />
            <col style={{ width: "150px" }} />
            <col style={{ width: "90px" }} />
            <col style={{ width: "200px" }} />
          </colgroup>
          <thead>
            <tr style={{ background: "#0F172A", borderBottom: "2px solid #1E293B" }}>
              <th style={{ padding: "12px 10px", fontSize: "0.72rem", color: "#94A3B8", fontWeight: 700, textAlign: "left" }}>State Name</th>
              <th style={{ padding: "12px 10px", fontSize: "0.72rem", color: "#94A3B8", fontWeight: 700, textAlign: "center" }}>Sch.Source</th>
              <th style={{ padding: "12px 10px", fontSize: "0.72rem", color: "#94A3B8", fontWeight: 700, textAlign: "right" }}>Sched (MW)</th>
              <th style={{ padding: "12px 10px", fontSize: "0.72rem", color: "#94A3B8", fontWeight: 700, textAlign: "right" }}>Actual (MW)</th>
              <th style={{ padding: "12px 10px", fontSize: "0.72rem", color: "#94A3B8", fontWeight: 700, textAlign: "right" }}>Deviation (MW)</th>
              <th style={{ padding: "12px 10px", fontSize: "0.72rem", color: "#94A3B8", fontWeight: 700, textAlign: "center" }}>Max OD/UD (MW)</th>
              <th style={{ padding: "12px 10px", fontSize: "0.72rem", color: "#94A3B8", fontWeight: 700, textAlign: "center" }}>Max Time / Freq</th>
              <th style={{ padding: "12px 10px", fontSize: "0.72rem", color: "#94A3B8", fontWeight: 700, textAlign: "center" }}>Msg Count</th>
              <th style={{ padding: "12px 10px", fontSize: "0.72rem", color: "#94A3B8", fontWeight: 700, textAlign: "left" }}>Reason / Comments</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => {
              const hasActual = row.actual !== null && row.actual !== undefined;
              const hasDeviation = row.deviation !== null && row.deviation !== undefined;
              const devPos = hasDeviation && row.deviation >= 0;
              const isExpanded = expandedRowIds.includes(row.plant_id);
              const stats = row.statistics || {};
              const isHigh = row.event_type === "high";
              const maxStateDev = isHigh ? stats.max_ud : stats.max_od;
              const maxStateTime = isHigh ? stats.max_ud_time : stats.max_od_time;
              const maxStateFreq = isHigh ? stats.freq_at_max_ud : stats.freq_at_max_od;
              const msgCount = Number.isFinite(Number(row.crms_message_count))
                ? Number(row.crms_message_count)
                : (Array.isArray(row.crms_messages) ? row.crms_messages.length : 0);

              return (
                <React.Fragment key={row.plant_id}>
                  <tr
                    style={{
                      background: ri % 2 === 0 ? "#FFFFFF" : "#F8FAFC",
                      transition: "background 0.15s ease",
                      cursor: "pointer",
                      borderBottom: "1px solid #E2E8F0",
                    }}
                    onClick={() => onToggleExpand(row.plant_id)}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "rgba(52, 211, 153, 0.05)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = ri % 2 === 0 ? "#FFFFFF" : "#F8FAFC";
                    }}
                  >
                    <td style={{ padding: "10px 10px", fontSize: "0.76rem", fontWeight: 700, color: "#0F172A" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        {isExpanded ? (
                          <ChevronUp size={14} className="text-secondary" />
                        ) : (
                          <ChevronDown size={14} className="text-secondary" />
                        )}
                        {row.plant_name}
                      </div>
                    </td>
                    <td style={{ padding: "6px 10px", textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
                      <select
                        value={row.sched_src || "RTG"}
                        onChange={(e) => onUpdateRowField(row.plant_id, "sched_src", e.target.value)}
                        style={{
                          fontSize: "0.72rem",
                          border: "1px solid #CBD5E1",
                          borderRadius: "6px",
                          padding: "2px 6px",
                          background: "#FFFFFF",
                          color: "#1E293B",
                          fontWeight: "600",
                        }}
                      >
                        <option value="RTG">RTG</option>
                        <option value="WBES">WBES</option>
                        <option value="Manual">Manual</option>
                      </select>
                    </td>
                    <td style={{ padding: "6px 10px", textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
                      {row.sched_src === "Manual" && row.schedule !== null ? (
                        <input
                          type="number"
                          value={row.schedule ?? 0}
                          onChange={(e) =>
                            onUpdateRowField(row.plant_id, "schedule", parseFloat(e.target.value) || 0)
                          }
                          style={{
                            width: "75px",
                            fontSize: "0.72rem",
                            border: "1px solid #CBD5E1",
                            borderRadius: "6px",
                            padding: "2px 6px",
                            textAlign: "right",
                          }}
                        />
                      ) : (
                        <span style={{ fontSize: "0.75rem", color: row.schedule !== null ? "#3B82F6" : "#94A3B8", fontWeight: row.schedule !== null ? 700 : 400 }}>
                          {fmt(row.schedule)}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "10px 10px", textAlign: "right", fontSize: "0.75rem", color: hasActual ? "#0F172A" : "#94A3B8", fontWeight: hasActual ? 700 : 400 }}>
                      {hasActual ? fmt(row.actual) : "—"}
                    </td>
                    <td style={{ padding: "10px 10px", textAlign: "right", fontSize: "0.75rem", fontWeight: 700, color: hasDeviation ? (devPos ? "#10B981" : "#EF4444") : "#94A3B8" }}>
                      {hasDeviation ? (devPos ? "+" : "") + fmt(row.deviation) : "—"}
                    </td>
                    {false && <td style={{ padding: "10px 10px", textAlign: "right" }}>
                      {pctDC ? (
                        <span
                          style={{
                            background: row.pct_dc >= 90 ? "#D1FAE5" : row.pct_dc >= 75 ? "#FEF3C7" : "#FEE2E2",
                            color: row.pct_dc >= 90 ? "#065F46" : row.pct_dc >= 75 ? "#92400E" : "#991B1B",
                            borderRadius: "6px",
                            padding: "2px 8px",
                            fontSize: "0.7rem",
                            fontWeight: 800,
                          }}
                        >
                          {fmt(row.pct_dc, 1)}%
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>}
                    <td style={{ padding: "10px 10px", fontSize: "0.74rem", fontWeight: 700, color: "#B91C1C", textAlign: "center" }}>
                      {maxStateDev !== undefined && maxStateDev !== null ? fmt(maxStateDev) : "—"}
                    </td>
                    <td style={{ padding: "10px 10px", fontSize: "0.68rem", color: "#475569", textAlign: "center", fontWeight: "500" }}>
                      {maxStateTime ? `${maxStateTime} | ${fmt(maxStateFreq, 3)} Hz` : "—"}
                    </td>
                    <td style={{ padding: "10px 10px", fontSize: "0.74rem", color: msgCount > 0 ? "#03624C" : "#94A3B8", textAlign: "center", fontWeight: 800 }}>
                      {msgCount}
                    </td>
                    <td style={{ padding: "6px 10px" }} onClick={(e) => e.stopPropagation()}>
                      <input
                        value={row.reason || ""}
                        onChange={(e) => onUpdateRowField(row.plant_id, "reason", e.target.value)}
                        placeholder="Specify deviation reason..."
                        style={{
                          border: "1px solid transparent",
                          background: "transparent",
                          outline: "none",
                          fontSize: "0.74rem",
                          color: "#475569",
                          width: "100%",
                          borderRadius: "4px",
                          padding: "2px 4px",
                        }}
                        onFocus={(e) => {
                          e.target.style.border = "1px solid #CBD5E1";
                          e.target.style.background = "#FFFFFF";
                        }}
                        onBlur={(e) => {
                          e.target.style.border = "1px solid transparent";
                          e.target.style.background = "transparent";
                        }}
                      />
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr style={{ background: "#F8FAFC" }}>
                      <td colSpan="9" style={{ padding: "8px 10px 12px", borderBottom: "1px solid #E2E8F0" }}>
                        <div style={{ display: "none", justifyContent: "flex-end", marginBottom: "8px" }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onEditRawData(row);
                            }}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "6px",
                            background: "linear-gradient(135deg, #022726 0%, #03624C 100%)",
                              color: "#FFFFFF",
                              border: "none",
                              borderRadius: "6px",
                              padding: "5px 12px",
                              fontSize: "0.74rem",
                              fontWeight: 700,
                              cursor: "pointer",
                              boxShadow: "0 2px 4px rgba(3,98,76,0.2)",
                              transition: "all 0.15s ease",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = "#024c3b";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = "#03624C";
                            }}
                          >
                            ⚙️ Edit Raw Database Data
                          </button>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 224px", gap: "10px", alignItems: "stretch" }}>
                          <div style={{ minWidth: 0, background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: "10px", padding: "4px 6px 0", boxShadow: "0 8px 20px -18px rgba(15,23,42,0.45)" }}>
                            {row.series?.timestamps?.length > 0 ? (
                              <ComplianceChart
                                row={row}
                                showSchAct={showSchAct}
                                height={640}
                                compact
                                fontSize={chartFontSize}
                                showDownloadButton
                                downloadFilename={`${row.plant_name || row.name || "state"}_frequency_deviation`}
                              />
                            ) : (
                              <div
                                style={{
                                  height: "300px",
                                  background: "#E2E8F0",
                                  borderRadius: "14px",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  color: "#64748B",
                                  fontStyle: "italic",
                                  fontSize: "0.8rem",
                                }}
                              >
                                No time series data available. Please verify the SCADA file upload.
                              </div>
                            )}
                          </div>
                          <div style={{ width: "224px", display: "flex", flexDirection: "column", gap: "8px" }}>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onEditRawData(row);
                              }}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: "5px",
                                background: "linear-gradient(135deg, #022726 0%, #03624C 100%)",
                                color: "#FFFFFF",
                                border: "none",
                                borderRadius: "7px",
                                padding: "6px 9px",
                                fontSize: "0.68rem",
                                fontWeight: 800,
                                cursor: "pointer",
                                boxShadow: "0 2px 4px rgba(3,98,76,0.16)",
                                transition: "all 0.15s ease",
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = "#024c3b";
                              }}
                              onMouseLeave={(e) => {
                                  e.currentTarget.style.background = "#03624C";
                              }}
                            >
                              Edit Raw Data
                            </button>
                            {row.schedule !== null && row.deviation !== null && (
                              <StatisticsCard row={row} compact />
                            )}
                            <div onClick={(e) => e.stopPropagation()}>
                              <label style={{ display: "block", marginBottom: 4, fontSize: "0.68rem", fontWeight: 900, color: "#334155" }}>
                                Chart note
                              </label>
                              <textarea
                                value={row.chart_note || ""}
                                onChange={(e) => onUpdateRowField(row.plant_id, "chart_note", e.target.value)}
                                placeholder="Add chart-specific note for PDF/Word..."
                                rows={5}
                                style={{
                                  width: "100%",
                                  minHeight: 96,
                                  resize: "vertical",
                                  border: "1px solid #BFD3F8",
                                  borderRadius: 8,
                                  padding: "7px 8px",
                                  fontSize: "0.7rem",
                                  fontFamily: "inherit",
                                  color: "#1E293B",
                                  background: "#FFFFFF",
                                  outline: "none",
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
            <tr style={{ background: "#EFF6FF", borderTop: "2px solid #BFDBFE" }}>
              <td colSpan="7" style={{ padding: "10px", textAlign: "right", fontSize: "0.74rem", fontWeight: 900, color: "#0F172A" }}>
                Total CRMS Messages
              </td>
              <td style={{ padding: "10px", textAlign: "center", fontSize: "0.76rem", fontWeight: 900, color: totalMsgCount > 0 ? "#03624C" : "#94A3B8" }}>
                {totalMsgCount}
              </td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>

    </SectionAccordion>
  );
}
