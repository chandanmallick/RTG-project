/**
 * StatisticsCard.jsx
 * Dark-themed compliance statistics card for states and generators.
 */
import React from "react";
import { Clock, Zap, AlertTriangle, ShieldCheck, ChevronRight } from "lucide-react";

export default function StatisticsCard({ row }) {
  const isState = row.type === "state" || row.is_state;
  const stats = row.statistics || {};

  const cardStyle = {
    background: "linear-gradient(135deg, #0F172A 0%, #1E293B 100%)",
    border: "1px solid rgba(100, 116, 139, 0.2)",
    borderRadius: "14px",
    padding: "16px",
    color: "#F1F5F9",
    boxShadow: "0 10px 30px -5px rgba(0,0,0,0.3)",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between"
  };

  const sectionTitleStyle = {
    fontSize: "0.72rem",
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    color: "#94A3B8",
    borderBottom: "1px solid rgba(100, 116, 139, 0.2)",
    paddingBottom: "6px",
    marginBottom: "12px",
    display: "flex",
    alignItems: "center",
    gap: "6px"
  };

  const metricBoxStyle = {
    background: "rgba(15, 23, 42, 0.5)",
    border: "1px solid rgba(100, 116, 139, 0.1)",
    borderRadius: "10px",
    padding: "10px 12px",
    marginBottom: "10px"
  };

  const metricLabelStyle = {
    fontSize: "0.68rem",
    color: "#94A3B8",
    fontWeight: "500",
    marginBottom: "2px"
  };

  const metricValueStyle = (color) => ({
    fontSize: "1.1rem",
    fontWeight: "800",
    color: color || "#F8FAFC",
    display: "flex",
    alignItems: "baseline",
    gap: "4px"
  });

  const subTextStyle = {
    fontSize: "0.65rem",
    color: "#64748B",
    marginTop: "2px",
    fontWeight: "500"
  };

  if (isState) {
    const maxOd = stats.max_od ?? 0;
    const maxOdTime = stats.max_od_time ?? "—";
    const freqAtMax = stats.freq_at_max_od ?? 50.0;
    const odDur = stats.od_duration_pct ?? 0;
    const helpDur = stats.helping_duration_pct ?? 0;

    return (
      <div style={cardStyle}>
        <div>
          <div style={sectionTitleStyle}>
            <Zap size={13} className="text-warning" />
            Compliance Indicators (State)
          </div>

          <div style={metricBoxStyle}>
            <div style={metricLabelStyle}>Peak Over Drawal (OD)</div>
            <div style={metricValueStyle("#F59E0B")}>
              {maxOd > 0 ? `+${maxOd.toFixed(1)}` : maxOd.toFixed(1)} <span style={{ fontSize: "0.7rem", fontWeight: "600" }}>MW</span>
            </div>
            {maxOd > 0 && (
              <div style={subTextStyle}>
                At {maxOdTime} | Freq: {freqAtMax.toFixed(3)} Hz
              </div>
            )}
          </div>

          <div className="row g-2">
            <div className="col-6">
              <div style={{ ...metricBoxStyle, marginBottom: 0 }}>
                <div style={metricLabelStyle}>OD Duration</div>
                <div style={metricValueStyle(odDur > 10 ? "#EF4444" : "#F59E0B")}>
                  {odDur.toFixed(2)}<span style={{ fontSize: "0.7rem", fontWeight: "600" }}>%</span>
                </div>
                <div style={subTextStyle}>Freq &lt; 49.9 &amp; Dev &gt; 0</div>
              </div>
            </div>
            <div className="col-6">
              <div style={{ ...metricBoxStyle, marginBottom: 0 }}>
                <div style={metricLabelStyle}>Helping Grid</div>
                <div style={metricValueStyle("#10B981")}>
                  {helpDur.toFixed(2)}<span style={{ fontSize: "0.7rem", fontWeight: "600" }}>%</span>
                </div>
                <div style={subTextStyle}>Freq &lt; 49.9 &amp; Dev &lt; 0</div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ fontSize: "0.68rem", color: "#64748B", marginTop: "12px", borderTop: "1px solid rgba(100, 116, 139, 0.1)", paddingTop: "8px" }}>
          Target: Drawal should be limited to Schedule during low frequency events.
        </div>
      </div>
    );
  }

  // Generator statistics
  const underInj = stats.under_inj_pct ?? 0;
  const helpingGrid = stats.helping_grid_pct ?? 0;

  return (
    <div style={cardStyle}>
      <div>
        <div style={sectionTitleStyle}>
          <ShieldCheck size={13} className="text-success" />
          Compliance Indicators (Gen)
        </div>

        <div style={metricBoxStyle}>
          <div style={metricLabelStyle}>Under Injection Duration</div>
          <div style={metricValueStyle(underInj > 5 ? "#EF4444" : "#F97316")}>
            {underInj.toFixed(2)}<span style={{ fontSize: "0.7rem", fontWeight: "600" }}>%</span>
          </div>
          <div style={subTextStyle}>Freq &lt; 49.9 Hz &amp; Dev &lt; 0 MW</div>
        </div>

        <div style={metricBoxStyle}>
          <div style={metricLabelStyle}>Helping Grid Duration</div>
          <div style={metricValueStyle("#10B981")}>
            {helpingGrid.toFixed(2)}<span style={{ fontSize: "0.7rem", fontWeight: "600" }}>%</span>
          </div>
          <div style={subTextStyle}>Freq &lt; 49.9 Hz &amp; Dev &gt; 0 MW</div>
        </div>
      </div>

      <div style={{ fontSize: "0.68rem", color: "#64748B", marginTop: "12px", borderTop: "1px solid rgba(100, 116, 139, 0.1)", paddingTop: "8px" }}>
        Target: Generator should support grid by avoiding under-injection when frequency is low.
      </div>
    </div>
  );
}
