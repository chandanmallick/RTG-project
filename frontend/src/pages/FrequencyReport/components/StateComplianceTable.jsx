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
const fmt = (v, dec = 1) =>
  v === null || v === undefined ? "—" : Number(v).toFixed(dec);

export default function StateComplianceTable({
  rows,
  expandedRowId,
  onToggleExpand,
  onUpdateRowField,
  stateDesc,
  onUpdateStateDesc,
  showSchAct,
}) {
  if (rows.length === 0) return null;

  return (
    <SectionAccordion
      title="State Drawal Compliance Details"
      subtitle="State drawal schedules and compliance statistics (Click a state to view plot)"
      count={rows.length}
    >
      <div
        style={{
          overflowX: "auto",
          borderRadius: "12px",
          border: "1px solid #E2E8F0",
          boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05)",
          marginBottom: "16px",
          background: "#FFFFFF",
        }}
      >
        <table
          style={{
            borderCollapse: "collapse",
            width: "100%",
            tableLayout: "fixed",
            minWidth: "1200px",
          }}
        >
          <colgroup>
            <col style={{ width: "180px" }} />
            <col style={{ width: "110px" }} />
            <col style={{ width: "110px" }} />
            <col style={{ width: "110px" }} />
            <col style={{ width: "110px" }} />
            <col style={{ width: "110px" }} />
            <col style={{ width: "120px" }} />
            <col style={{ width: "90px" }} />
            <col style={{ width: "130px" }} />
            <col style={{ width: "150px" }} />
            <col style={{ width: "200px" }} />
          </colgroup>
          <thead>
            <tr style={{ background: "#0F172A", borderBottom: "2px solid #1E293B" }}>
              <th style={{ padding: "12px 10px", fontSize: "0.72rem", color: "#94A3B8", fontWeight: 700, textAlign: "left" }}>State Name</th>
              <th style={{ padding: "12px 10px", fontSize: "0.72rem", color: "#94A3B8", fontWeight: 700, textAlign: "center" }}>Sch.Source</th>
              <th style={{ padding: "12px 10px", fontSize: "0.72rem", color: "#94A3B8", fontWeight: 700, textAlign: "center" }}>DC Source</th>
              <th style={{ padding: "12px 10px", fontSize: "0.72rem", color: "#94A3B8", fontWeight: 700, textAlign: "right" }}>DC (MW)</th>
              <th style={{ padding: "12px 10px", fontSize: "0.72rem", color: "#94A3B8", fontWeight: 700, textAlign: "right" }}>Sched (MW)</th>
              <th style={{ padding: "12px 10px", fontSize: "0.72rem", color: "#94A3B8", fontWeight: 700, textAlign: "right" }}>Actual (MW)</th>
              <th style={{ padding: "12px 10px", fontSize: "0.72rem", color: "#94A3B8", fontWeight: 700, textAlign: "right" }}>Deviation (MW)</th>
              <th style={{ padding: "12px 10px", fontSize: "0.72rem", color: "#94A3B8", fontWeight: 700, textAlign: "right" }}>% DC</th>
              <th style={{ padding: "12px 10px", fontSize: "0.72rem", color: "#94A3B8", fontWeight: 700, textAlign: "center" }}>Max OD (MW)</th>
              <th style={{ padding: "12px 10px", fontSize: "0.72rem", color: "#94A3B8", fontWeight: 700, textAlign: "center" }}>OD Time / Freq</th>
              <th style={{ padding: "12px 10px", fontSize: "0.72rem", color: "#94A3B8", fontWeight: 700, textAlign: "left" }}>Reason / Comments</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => {
              const hasActual = row.actual !== null && row.actual !== undefined;
              const devPos = hasActual && row.deviation >= 0;
              const pctDC = hasActual && row.pct_dc !== null && row.pct_dc !== undefined;
              const isExpanded = expandedRowId === row.plant_id;
              const stats = row.statistics || {};

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
                    <td style={{ padding: "6px 10px", textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
                      <select
                        value={row.dc_src || "RTG"}
                        onChange={(e) => onUpdateRowField(row.plant_id, "dc_src", e.target.value)}
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
                      {row.dc_src === "Manual" ? (
                        <input
                          type="number"
                          value={row.dc ?? 0}
                          onChange={(e) =>
                            onUpdateRowField(row.plant_id, "dc", parseFloat(e.target.value) || 0)
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
                        <span style={{ fontSize: "0.75rem", color: "#6366F1", fontWeight: 700 }}>
                          {fmt(row.dc)}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "6px 10px", textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
                      {row.sched_src === "Manual" ? (
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
                        <span style={{ fontSize: "0.75rem", color: "#3B82F6", fontWeight: 700 }}>
                          {fmt(row.schedule)}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "10px 10px", textAlign: "right", fontSize: "0.75rem", color: hasActual ? "#0F172A" : "#94A3B8", fontWeight: hasActual ? 700 : 400 }}>
                      {hasActual ? fmt(row.actual) : "—"}
                    </td>
                    <td style={{ padding: "10px 10px", textAlign: "right", fontSize: "0.75rem", fontWeight: 700, color: hasActual ? (devPos ? "#10B981" : "#EF4444") : "#94A3B8" }}>
                      {hasActual ? (devPos ? "+" : "") + fmt(row.deviation) : "—"}
                    </td>
                    <td style={{ padding: "10px 10px", textAlign: "right" }}>
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
                    </td>
                    <td style={{ padding: "10px 10px", fontSize: "0.74rem", fontWeight: 700, color: "#B91C1C", textAlign: "center" }}>
                      {stats.max_od !== undefined && stats.max_od !== null ? fmt(stats.max_od) : "—"}
                    </td>
                    <td style={{ padding: "10px 10px", fontSize: "0.68rem", color: "#475569", textAlign: "center", fontWeight: "500" }}>
                      {stats.max_od_time ? `${stats.max_od_time} | ${fmt(stats.freq_at_max_od, 2)}Hz` : "—"}
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
                      <td colSpan="11" style={{ padding: "16px", borderBottom: "1px solid #E2E8F0" }}>
                        <div style={{ display: "flex", gap: "24px", flexWrap: "wrap", alignItems: "stretch" }}>
                          <div style={{ flex: "1 1 700px", maxWidth: "100%" }}>
                            {row.series?.timestamps?.length > 0 ? (
                              <ComplianceChart row={row} showSchAct={showSchAct} />
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
                          <div style={{ flex: "1 1 300px" }}>
                            <StatisticsCard row={row} />
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ background: "#F8FAFC", padding: "16px", borderRadius: "12px", border: "1px solid #E2E8F0" }}>
        <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "#1E293B", display: "block", marginBottom: "6px" }}>
          State Drawal Compliance Notes
        </label>
        <textarea
          value={stateDesc}
          onChange={(e) => onUpdateStateDesc(e.target.value)}
          rows={3}
          style={{
            width: "100%",
            border: "1px solid #CBD5E1",
            borderRadius: "8px",
            padding: "8px 12px",
            fontSize: "0.78rem",
            color: "#334155",
            outline: "none",
            resize: "vertical",
            fontFamily: "inherit",
          }}
          placeholder="Add summaries or remarks for state drawal compliance..."
        />
      </div>
    </SectionAccordion>
  );
}
