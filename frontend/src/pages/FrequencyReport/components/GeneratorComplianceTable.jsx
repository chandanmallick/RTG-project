/**
 * GeneratorComplianceTable.jsx
 * Unit-wise scheduling compliance details grouped by state.
 */
import React, { useState, useMemo } from "react";
import { ChevronDown, ChevronUp, Search, Zap } from "lucide-react";
import SectionAccordion from "../../../components/ui/SectionAccordion";
import ComplianceChart from "./ComplianceChart";
import CapacityFrequencyChart from "./CapacityFrequencyChart";
import StatisticsCard from "./StatisticsCard";

// Helper to format values
const fmt = (v, dec = 0) =>
  !Number.isFinite(Number(v)) ? "-" :
  v === null || v === undefined ? "—" : Number(v).toFixed(dec);

export default function GeneratorComplianceTable({
  rows,
  expandedRowIds,
  onToggleExpand,
  onExpandAll,
  onCollapseAll,
  onUpdateRowField,
  genDesc,
  onUpdateGenDesc,
  showSchAct,
  onEditRawData,
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [fuelFilter, setFuelFilter] = useState("ALL_FUELS");
  const [stateFilter, setStateFilter] = useState("ALL_STATES");

  // Derive filter options dynamically from rows
  const fuelOptions = useMemo(() => {
    const fuels = new Set();
    rows.forEach((r) => {
      if (r.fuel) fuels.add(r.fuel);
    });
    return ["ALL_FUELS", ...Array.from(fuels).sort()];
  }, [rows]);

  const stateOptions = useMemo(() => {
    const states = new Set();
    rows.forEach((r) => {
      if (r.state) states.add(r.state.toUpperCase());
    });
    return ["ALL_STATES", ...Array.from(states).sort()];
  }, [rows]);

  // Filter rows
  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      const matchesSearch =
        !searchQuery ||
        (r.plant_name && r.plant_name.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesFuel = fuelFilter === "ALL_FUELS" || r.fuel === fuelFilter;

      const matchesState =
        stateFilter === "ALL_STATES" ||
        (r.state && r.state.toUpperCase() === stateFilter);

      return matchesSearch && matchesFuel && matchesState;
    });
  }, [rows, searchQuery, fuelFilter, stateFilter]);

  const statesGroupList = ["BIHAR", "JHARKHAND", "ODISHA", "WEST BENGAL", "SIKKIM", "DVC", "ER"];

  return (
    <SectionAccordion
      title="Generator Compliance Details"
      subtitle="Unit-wise scheduling compliance details grouped by state (Click a generator to view plot)"
      count={filteredRows.length}
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
          {/* Search box */}
          <div style={{ position: "relative", width: "180px" }}>
            <span
              style={{
                position: "absolute",
                left: "8px",
                top: "50%",
                transform: "translateY(-50%)",
                display: "flex",
                alignItems: "center",
                color: "rgba(255,255,255,0.6)",
              }}
            >
              <Search size={13} />
            </span>
            <input
              type="text"
              placeholder="Search plant..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                background: "rgba(255, 255, 255, 0.15)",
                border: "1px solid rgba(255, 255, 255, 0.2)",
                borderRadius: "6px",
                padding: "4px 10px 4px 28px",
                fontSize: "0.75rem",
                color: "#FFFFFF",
                outline: "none",
              }}
            />
          </div>

          {/* Fuel Filter */}
          <select
            value={fuelFilter}
            onChange={(e) => setFuelFilter(e.target.value)}
            style={{
              border: "1px solid rgba(255, 255, 255, 0.2)",
              borderRadius: "6px",
              padding: "4px 8px",
              fontSize: "0.72rem",
              color: "#FFFFFF",
              background: "rgba(255, 255, 255, 0.15)",
              height: "28px",
              cursor: "pointer",
              outline: "none",
            }}
          >
            {fuelOptions.map((fuel) => (
              <option key={fuel} value={fuel} style={{ color: "#1E293B" }}>
                {fuel === "ALL_FUELS" ? "All Fuels" : fuel}
              </option>
            ))}
          </select>

          {/* State Filter */}
          <select
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value)}
            style={{
              border: "1px solid rgba(255, 255, 255, 0.2)",
              borderRadius: "6px",
              padding: "4px 8px",
              fontSize: "0.72rem",
              color: "#FFFFFF",
              background: "rgba(255, 255, 255, 0.15)",
              height: "28px",
              cursor: "pointer",
              outline: "none",
            }}
          >
            {stateOptions.map((st) => (
              <option key={st} value={st} style={{ color: "#1E293B" }}>
                {st === "ALL_STATES" ? "All States" : st}
              </option>
            ))}
          </select>
        </div>
      }
    >
      {filteredRows.length === 0 ? (
        <div
          style={{
            borderRadius: "12px",
            border: "1px solid #E2E8F0",
            background: "#FFFFFF",
            padding: "40px",
            textAlign: "center",
            color: "#94A3B8",
            fontStyle: "italic",
            fontSize: "0.82rem",
          }}
        >
          No generators match the selected filters or no data loaded.
        </div>
      ) : (
        statesGroupList.map((st) => {
          const statePlants = filteredRows.filter((p) => {
            const pState = (p.state || "").toUpperCase();
            if (st === "ER") {
              return (
                pState === "ER" ||
                pState === "BHUTAN" ||
                !["BIHAR", "JHARKHAND", "ODISHA", "WEST BENGAL", "SIKKIM", "DVC"].includes(pState)
              );
            }
            return pState === st;
          });

          if (statePlants.length === 0) return null;

          return (
            <div key={st} style={{ marginBottom: "20px" }}>
              <h4
                style={{
                  fontSize: "0.82rem",
                  fontWeight: 800,
                  color: "#03624C",
                  marginBottom: "8px",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  letterSpacing: "0.02em",
                }}
              >
                <span
                  style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#10B981" }}
                ></span>
                {st === "ER" ? "EASTERN REGION & OTHERS (ER)" : `${st} STATE COMPLIANCE`}
                <span style={{ fontSize: "0.7rem", color: "#64748B", fontWeight: 500 }}>
                  ({statePlants.length} plants)
                </span>
              </h4>

              <div
                style={{
                  overflowX: "auto",
                  borderRadius: "12px",
                  border: "1px solid #E2E8F0",
                  boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05)",
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
                    <col style={{ width: "90px" }} />
                    <col style={{ width: "80px" }} />
                    <col style={{ width: "100px" }} />
                    <col style={{ width: "100px" }} />
                    <col style={{ width: "90px" }} />
                    <col style={{ width: "90px" }} />
                    <col style={{ width: "90px" }} />
                    <col style={{ width: "90px" }} />
                    <col style={{ width: "90px" }} />
                    <col style={{ width: "80px" }} />
                    <col style={{ width: "200px" }} />
                  </colgroup>
                  <thead>
                    <tr style={{ background: "#022726", borderBottom: "2px solid #053b39" }}>
                      <th style={{ padding: "10px 8px", fontSize: "0.7rem", color: "#94A3B8", fontWeight: 700, textAlign: "left" }}>Plant Name</th>
                      <th style={{ padding: "10px 8px", fontSize: "0.7rem", color: "#94A3B8", fontWeight: 700, textAlign: "left" }}>State</th>
                      <th style={{ padding: "10px 8px", fontSize: "0.7rem", color: "#94A3B8", fontWeight: 700, textAlign: "left" }}>Fuel</th>
                      <th style={{ padding: "10px 8px", fontSize: "0.7rem", color: "#94A3B8", fontWeight: 700, textAlign: "center" }}>Sch.Source</th>
                      <th style={{ padding: "10px 8px", fontSize: "0.7rem", color: "#94A3B8", fontWeight: 700, textAlign: "center" }}>DC Source</th>
                      <th style={{ padding: "10px 8px", fontSize: "0.7rem", color: "#94A3B8", fontWeight: 700, textAlign: "right" }}>Cap (MW)</th>
                      <th style={{ padding: "10px 8px", fontSize: "0.7rem", color: "#94A3B8", fontWeight: 700, textAlign: "right" }}>DC (MW)</th>
                      <th style={{ padding: "10px 8px", fontSize: "0.7rem", color: "#94A3B8", fontWeight: 700, textAlign: "right" }}>Sched (MW)</th>
                      <th style={{ padding: "10px 8px", fontSize: "0.7rem", color: "#94A3B8", fontWeight: 700, textAlign: "right" }}>Actual (MW)</th>
                      <th style={{ padding: "10px 8px", fontSize: "0.7rem", color: "#94A3B8", fontWeight: 700, textAlign: "right" }}>Deviation</th>
                      <th style={{ padding: "10px 8px", fontSize: "0.7rem", color: "#94A3B8", fontWeight: 700, textAlign: "right" }}>% DC</th>
                      <th style={{ padding: "10px 8px", fontSize: "0.7rem", color: "#94A3B8", fontWeight: 700, textAlign: "left" }}>Reason / Comments</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statePlants.map((row, ri) => {
                      const hasActual = row.actual !== null && row.actual !== undefined;
                      const hasDeviation = row.deviation !== null && row.deviation !== undefined;
                      const devPos = hasDeviation && row.deviation >= 0;
                      const pctDC = hasActual && row.pct_dc !== null && row.pct_dc !== undefined;
                      const isExpanded = expandedRowIds.includes(row.plant_id);

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
                            <td style={{ padding: "8px 8px", fontSize: "0.74rem", fontWeight: 700, color: "#0F172A" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                {isExpanded ? (
                                  <ChevronUp size={13} className="text-secondary" />
                                ) : (
                                  <ChevronDown size={13} className="text-secondary" />
                                )}
                                {row.plant_name}
                              </div>
                            </td>
                            <td style={{ padding: "8px 8px", fontSize: "0.71rem", color: "#475569", fontWeight: "500" }}>
                              {row.state}
                            </td>
                            <td style={{ padding: "8px 8px" }}>
                              <span
                                style={{
                                  background: "rgba(245,158,11,0.12)",
                                  color: "#D97706",
                                  borderRadius: "5px",
                                  padding: "1px 5px",
                                  fontSize: "0.62rem",
                                  fontWeight: 800,
                                  textTransform: "uppercase",
                                }}
                              >
                                {row.fuel || "—"}
                              </span>
                            </td>
                            <td style={{ padding: "3px 8px", textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
                              <select
                                value={row.sched_src || "RTG"}
                                onChange={(e) => onUpdateRowField(row.plant_id, "sched_src", e.target.value)}
                                style={{
                                  fontSize: "0.7rem",
                                  border: "1px solid #CBD5E1",
                                  borderRadius: "4px",
                                  padding: "1px 4px",
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
                            <td style={{ padding: "3px 8px", textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
                              <select
                                value={row.dc_src || "RTG"}
                                onChange={(e) => onUpdateRowField(row.plant_id, "dc_src", e.target.value)}
                                style={{
                                  fontSize: "0.7rem",
                                  border: "1px solid #CBD5E1",
                                  borderRadius: "4px",
                                  padding: "1px 4px",
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
                            <td style={{ padding: "8px 8px", textAlign: "right", fontSize: "0.73rem", color: "#334155", fontWeight: 600 }}>
                              {fmt(row.capacity, 0)}
                            </td>
                            <td style={{ padding: "3px 8px", textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
                              {row.dc_src === "Manual" ? (
                                <input
                                  type="number"
                                  value={row.dc ?? 0}
                                  onChange={(e) =>
                                    onUpdateRowField(row.plant_id, "dc", parseFloat(e.target.value) || 0)
                                  }
                                  style={{
                                    width: "60px",
                                    fontSize: "0.7rem",
                                    border: "1px solid #CBD5E1",
                                    borderRadius: "4px",
                                    padding: "1px 4px",
                                    textAlign: "right",
                                  }}
                                />
                              ) : (
                                <span style={{ fontSize: "0.73rem", color: "#6366F1", fontWeight: 700 }}>
                                  {fmt(row.dc)}
                                </span>
                              )}
                            </td>
                            <td style={{ padding: "3px 8px", textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
                              {row.sched_src === "Manual" && row.schedule !== null ? (
                                <input
                                  type="number"
                                  value={row.schedule ?? 0}
                                  onChange={(e) =>
                                    onUpdateRowField(row.plant_id, "schedule", parseFloat(e.target.value) || 0)
                                  }
                                  style={{
                                    width: "60px",
                                    fontSize: "0.7rem",
                                    border: "1px solid #CBD5E1",
                                    borderRadius: "4px",
                                    padding: "1px 4px",
                                    textAlign: "right",
                                  }}
                                />
                              ) : (
                                <span style={{ fontSize: "0.73rem", color: row.schedule !== null ? "#3B82F6" : "#94A3B8", fontWeight: row.schedule !== null ? 700 : 400 }}>
                                  {fmt(row.schedule)}
                                </span>
                              )}
                            </td>
                            <td style={{ padding: "8px 8px", textAlign: "right", fontSize: "0.73rem", color: hasActual ? "#0F172A" : "#94A3B8", fontWeight: hasActual ? 700 : 400 }}>
                              {hasActual ? fmt(row.actual) : "—"}
                            </td>
                            <td style={{ padding: "8px 8px", textAlign: "right", fontSize: "0.73rem", fontWeight: 700, color: hasDeviation ? (devPos ? "#10B981" : "#EF4444") : "#94A3B8" }}>
                              {hasDeviation ? (devPos ? "+" : "") + fmt(row.deviation) : "—"}
                            </td>
                            <td style={{ padding: "8px 8px", textAlign: "right" }}>
                              {pctDC ? (
                                <span
                                  style={{
                                    background: row.pct_dc >= 90 ? "#D1FAE5" : row.pct_dc >= 75 ? "#FEF3C7" : "#FEE2E2",
                                    color: row.pct_dc >= 90 ? "#065F46" : row.pct_dc >= 75 ? "#92400E" : "#991B1B",
                                    borderRadius: "5px",
                                    padding: "1px 5px",
                                    fontSize: "0.64rem",
                                    fontWeight: 800,
                                  }}
                                >
                                  {fmt(row.pct_dc, 1)}%
                                </span>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td style={{ padding: "4px 8px" }} onClick={(e) => e.stopPropagation()}>
                              <input
                                value={row.reason || ""}
                                onChange={(e) => onUpdateRowField(row.plant_id, "reason", e.target.value)}
                                placeholder="Specify deviation reason..."
                                style={{
                                  border: "1px solid transparent",
                                  background: "transparent",
                                  outline: "none",
                                  fontSize: "0.72rem",
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
                              <td colSpan="12" style={{ padding: "8px 10px 12px", borderBottom: "1px solid #E2E8F0" }}>
                                <div style={{ display: "none", justifyContent: "flex-end", marginBottom: "12px" }}>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onEditRawData(row);
                                    }}
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: "6px",
                                      background: "#03624C",
                                      color: "#FFFFFF",
                                      border: "none",
                                      borderRadius: "6px",
                                      padding: "6px 14px",
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
                                      <>
                                        <ComplianceChart row={row} showSchAct={showSchAct} height={520} compact />
                                        <div style={{ marginTop: "6px", borderTop: "1px solid #E2E8F0", paddingTop: "6px" }}>
                                          <CapacityFrequencyChart row={row} height={330} compact />
                                        </div>
                                      </>
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
                                        background: "#03624C",
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
                                    {row.schedule !== null && row.deviation !== null && <StatisticsCard row={row} compact />}
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
            </div>
          );
        })
      )}

      <div style={{ background: "#F8FAFC", padding: "16px", borderRadius: "12px", border: "1px solid #E2E8F0", marginTop: "16px" }}>
        <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "#1E293B", display: "block", marginBottom: "6px" }}>
          Generator Compliance Notes
        </label>
        <textarea
          value={genDesc}
          onChange={(e) => onUpdateGenDesc(e.target.value)}
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
          placeholder="Add summaries or remarks for generator scheduling compliance..."
        />
      </div>
    </SectionAccordion>
  );
}
