import { ShieldCheck, Zap } from "lucide-react";

const num = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const pct = (value) => `${num(value).toFixed(1)}%`;
const mw = (value) => `${num(value).toFixed(0)} MW`;

export default function StatisticsCard({ row, compact = false }) {
  const isState = row.type === "state" || row.is_state;
  const isHigh = row.event_type === "high";
  const stats = row.statistics || {};
  const freqText = isHigh ? "Freq > 50.05" : "Freq < 49.9";
  const actualSeries = Array.isArray(row.series?.actual) ? row.series.actual.map(Number).filter(Number.isFinite) : [];
  const minActual = actualSeries.length ? Math.min(...actualSeries) : null;
  const highFreqReference = num(row.cap_on_bar, 0) * 0.94;
  const minGenerationPct = isHigh && minActual !== null && highFreqReference > 0 ? (minActual / highFreqReference) * 100 : null;

  const cardStyle = {
    background: "linear-gradient(135deg, #0F172A 0%, #1E293B 100%)",
    border: "1px solid rgba(100, 116, 139, 0.2)",
    borderRadius: compact ? "10px" : "12px",
    padding: compact ? "10px" : "12px",
    color: "#F1F5F9",
    boxShadow: compact ? "0 6px 16px -10px rgba(0,0,0,0.38)" : "0 8px 22px -8px rgba(0,0,0,0.35)",
    height: "auto",
  };
  const sectionTitleStyle = {
    fontSize: compact ? "0.62rem" : "0.68rem",
    fontWeight: 800,
    textTransform: "uppercase",
    color: "#94A3B8",
    borderBottom: "1px solid rgba(100, 116, 139, 0.2)",
    paddingBottom: compact ? "4px" : "5px",
    marginBottom: compact ? "6px" : "8px",
    display: "flex",
    alignItems: "center",
    gap: "6px",
  };
  const metricBoxStyle = {
    background: "rgba(15, 23, 42, 0.5)",
    border: "1px solid rgba(100, 116, 139, 0.1)",
    borderRadius: compact ? "8px" : "9px",
    padding: compact ? "7px 8px" : "8px 10px",
    marginBottom: compact ? "6px" : "8px",
  };
  const labelStyle = { fontSize: compact ? "0.61rem" : "0.68rem", color: "#94A3B8", fontWeight: 600, marginBottom: "2px" };
  const valueStyle = (color) => ({ fontSize: compact ? "0.92rem" : "1rem", fontWeight: 900, color, lineHeight: 1.12 });
  const subStyle = { fontSize: compact ? "0.58rem" : "0.65rem", color: "#64748B", marginTop: "2px", fontWeight: 600 };

  if (isState) {
    const maxValue = isHigh ? stats.max_ud : stats.max_od;
    const maxTime = isHigh ? stats.max_ud_time : stats.max_od_time;
    const maxFreq = isHigh ? stats.freq_at_max_ud : stats.freq_at_max_od;
    return (
      <div style={cardStyle}>
        <div style={sectionTitleStyle}>
          <Zap size={compact ? 12 : 13} />
          Compliance Indicators (State)
        </div>
        <div style={metricBoxStyle}>
          <div style={labelStyle}>{isHigh ? "Max Under Drawal (UD)" : "Peak Over Drawal (OD)"}</div>
          <div style={valueStyle(isHigh ? "#06B6D4" : "#F59E0B")}>{mw(maxValue)}</div>
          <div style={subStyle}>At {maxTime || "-"} | Freq: {num(maxFreq, 50).toFixed(3)} Hz</div>
        </div>
        <div className="row g-2">
          <div className="col-6">
            <div style={{ ...metricBoxStyle, marginBottom: 0 }}>
              <div style={labelStyle}>{isHigh ? "Over Drawal" : "Dev > 0"}</div>
              <div style={valueStyle(isHigh ? "#EAB308" : "#F59E0B")}>{pct(stats.od_duration_pct)}</div>
              <div style={subStyle}>{freqText} &amp; Dev &gt; 0</div>
            </div>
          </div>
          <div className="col-6">
            <div style={{ ...metricBoxStyle, marginBottom: 0 }}>
              <div style={labelStyle}>{isHigh ? "Under Drawal" : "Under Drawal"}</div>
              <div style={valueStyle(isHigh ? "#06B6D4" : "#10B981")}>{pct(stats.helping_duration_pct)}</div>
              <div style={subStyle}>{freqText} &amp; Dev &lt; 0</div>
            </div>
          </div>
        </div>
        <div style={{ ...subStyle, borderTop: "1px solid rgba(100, 116, 139, 0.1)", paddingTop: 7, marginTop: 8 }}>
          {isHigh ? "Target: reduce drawal during high frequency operation." : "Target: limit drawal to schedule during low frequency operation."}
        </div>
      </div>
    );
  }

  return (
    <div style={cardStyle}>
      <div style={sectionTitleStyle}>
        <ShieldCheck size={compact ? 12 : 13} />
        Compliance Indicators (Generator)
      </div>
      <div style={metricBoxStyle}>
        <div style={labelStyle}>{isHigh ? "Under Injection" : "Under Injection"}</div>
        <div style={valueStyle("#10B981")}>{pct(stats.under_inj_pct)}</div>
        <div style={subStyle}>{freqText} &amp; Dev &lt; 0</div>
      </div>
      <div style={metricBoxStyle}>
        <div style={labelStyle}>{isHigh ? "Over Injection" : "Helping Grid"}</div>
        <div style={valueStyle(isHigh ? "#F97316" : "#10B981")}>{pct(stats.helping_grid_pct)}</div>
        <div style={subStyle}>{freqText} &amp; Dev &gt; 0</div>
      </div>
      {!isHigh && (
        <div style={metricBoxStyle}>
          <div style={labelStyle}>Capacity on Bar</div>
          <div style={valueStyle("#FBBF24")}>{mw(row.cap_on_bar)}</div>
          <div style={subStyle}>Actual average: {pct(row.avg_capacity_on_bar_pct)}</div>
        </div>
      )}
      {isHigh && (
        <div style={metricBoxStyle}>
          <div style={labelStyle}>Minimum Generation % Achieved</div>
          <div style={valueStyle(minGenerationPct !== null && minGenerationPct < 100 ? "#F97316" : "#10B981")}>
            {minGenerationPct !== null ? pct(minGenerationPct) : "-"}
          </div>
          <div style={subStyle}>Min generation / (94% x capacity on bar)</div>
        </div>
      )}
    </div>
  );
}
