import { Gauge, TrendingDown, TrendingUp } from "lucide-react";

const formatPercent = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "-";
  return `${parsed.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
};

const formatFreq = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "-";
  return parsed.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export default function PSPFrequencyCheckTiles({ data, onOpenTrend }) {
  if (!data) return null;

  const maxMin = data.max_min || {};
  const total = Number(data.total_band_percent);
  const totalOk = Number.isFinite(total) && Math.abs(total - 100) <= 0.05;

  const freqTiles = [
    {
      label: "Max Freq",
      value: formatFreq(maxMin.max_freq),
      meta: maxMin.max_time || "-",
      color: "#DC2626",
      icon: <TrendingUp size={16} />,
    },
    {
      label: "Min Freq",
      value: formatFreq(maxMin.min_freq),
      meta: maxMin.min_time || "-",
      color: "#2563EB",
      icon: <TrendingDown size={16} />,
    },
  ];

  return (
    <div className="theme-glass-card p-2 mb-3">
      <div className="d-flex align-items-center justify-content-between gap-2 flex-wrap mb-2">
        <div>
          <h2 className="h6 fw-bold mb-0 text-dark d-flex align-items-center gap-2">
            <Gauge size={16} className="text-success" />
            Frequency Check
          </h2>
          <p className="small text-muted mb-0" style={{ fontSize: "0.73rem" }}>
            FREQ4 below band, FREQ5 within band, FREQ7 above band. Sum should be 100%.
          </p>
        </div>
        <button type="button" className="btn btn-sm theme-btn-outline py-1" onClick={onOpenTrend} style={{ fontSize: "0.72rem" }}>
          Historical Max/Min Trend
        </button>
      </div>

      <div className="d-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "8px" }}>
        {(data.bands || []).map((band) => (
          <div
            className="rounded-3 border bg-white"
            key={band.key}
            style={{ borderLeft: `4px solid ${band.color}`, padding: "8px 10px" }}
            title={`${band.logic} | ${band.source_key}`}
          >
            <div className="d-flex justify-content-between align-items-center gap-2">
              <div className="min-w-0">
                <div className="fw-bold text-dark text-truncate" style={{ fontSize: "0.78rem" }}>{band.label}</div>
                <div className="text-secondary text-truncate" style={{ fontSize: "0.67rem" }}>{band.logic}</div>
              </div>
              <div className="fw-bold" style={{ color: band.color, fontSize: "1rem", whiteSpace: "nowrap" }}>
                {formatPercent(band.value)}
              </div>
            </div>
          </div>
        ))}

        <div className="rounded-3 border bg-light" style={{ padding: "8px 10px" }}>
          <div className="d-flex justify-content-between align-items-center">
            <div>
              <div className="small text-muted fw-bold" style={{ fontSize: "0.7rem" }}>Band Total</div>
              <div className="text-secondary" style={{ fontSize: "0.64rem" }}>FREQ4+5+7</div>
            </div>
            <div className={`fw-bold ${totalOk ? "text-success" : "text-danger"}`} style={{ fontSize: "1rem" }}>
              {formatPercent(data.total_band_percent)}
            </div>
          </div>
        </div>

        {freqTiles.map((tile) => (
          <div className="rounded-3 border bg-white" key={tile.label} style={{ padding: "8px 10px" }}>
            <div className="d-flex align-items-center justify-content-between gap-2">
              <div>
                <div className="small text-muted fw-bold" style={{ fontSize: "0.7rem" }}>{tile.label}</div>
                <div className="text-secondary" style={{ fontSize: "0.66rem" }}>{tile.meta}</div>
              </div>
              <div className="d-flex align-items-center gap-1">
                <span style={{ color: tile.color }}>{tile.icon}</span>
                <span className="fw-bold text-dark" style={{ fontSize: "1rem" }}>{tile.value}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
