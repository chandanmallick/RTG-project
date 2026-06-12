import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { Info, Layers3 } from "lucide-react";

const SOURCES = [
  { key: "thermal", label: "Thermal", color: "#E28743" },
  { key: "hydro", label: "Hydro", color: "#2563EB" },
  { key: "wind", label: "Wind", color: "#14B8A6" },
  { key: "solar", label: "Solar", color: "#FBBF24" },
  { key: "small_hydro", label: "Small Hydro", color: "#60A5FA" },
  { key: "others", label: "Others", color: "#8B5CF6" },
];

const fmt = (value, digits = 2) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return "-";
  return num.toLocaleString("en-IN", { maximumFractionDigits: digits, minimumFractionDigits: 0 });
};

export default function PSPStateGenerationSources({ data, loading }) {
  const states = data?.states || [];
  const composition = (data?.composition || []).filter((item) => item.abs_value > 0);
  const totals = data?.totals || {};
  const maxGeneration = Math.max(...states.map((item) => Number(item.generation_abs_total || 0)), 1);

  if (loading) {
    return (
      <div className="theme-glass-card p-4 h-100 d-flex align-items-center justify-content-center" style={{ minHeight: 360 }}>
        <div className="spinner-border text-success spinner-border-sm" role="status" />
        <span className="text-secondary small ms-2">Loading generation source mix...</span>
      </div>
    );
  }

  if (!data?.has_data || states.length === 0) {
    return (
      <div className="theme-glass-card p-4 h-100 d-flex align-items-center justify-content-center" style={{ minHeight: 360 }}>
        <div className="text-center text-muted">
          <Info size={28} className="mb-2 opacity-50" />
          <div className="fw-bold">No state generation source data available.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="theme-glass-card p-4 h-100">
      <div className="d-flex align-items-start justify-content-between gap-3 mb-3">
        <div>
          <h3 className="h6 fw-bold mb-0 text-dark d-flex align-items-center gap-2">
            <Layers3 size={16} className="text-success" />
            <span>State Wise Generation Source</span>
          </h3>
          <p className="small text-muted mb-0" style={{ fontSize: "0.72rem" }}>
            PSP state load details source mix, drawal schedule and UI for {data.date}
          </p>
        </div>
        <div className="text-end small">
          <div className="text-muted fw-semibold">Generation Total</div>
          <div className="fw-bold text-success">{fmt(totals.generation_total)} MU</div>
        </div>
      </div>

      <div className="row g-3 align-items-stretch">
        <div className="col-12 col-xl-8">
          <div className="d-flex flex-column gap-2">
            {states.map((state) => {
              const totalWidth = Math.max((Number(state.generation_abs_total || 0) / maxGeneration) * 100, state.generation_abs_total ? 5 : 0);
              return (
                <div key={state.state} className="rounded-3 border bg-white p-2">
                  <div className="d-flex align-items-center gap-3">
                    <div className="fw-bold text-dark text-end" style={{ width: 110, fontSize: "0.72rem", lineHeight: 1.1 }}>
                      {state.state}
                    </div>
                    <div className="flex-grow-1">
                      <div className="d-flex align-items-center gap-2">
                        <div className="position-relative flex-grow-1 rounded-pill overflow-hidden" style={{ height: 22, background: "#EEF2F7" }}>
                          <div className="d-flex h-100" style={{ width: `${totalWidth}%`, minWidth: state.generation_abs_total ? 28 : 0 }}>
                            {SOURCES.map((source) => {
                              const value = Number(state[source.key] || 0);
                              const width = state.generation_abs_total > 0 ? (Math.abs(value) / state.generation_abs_total) * 100 : 0;
                              if (!width) return null;
                              return (
                                <div
                                  key={source.key}
                                  title={`${source.label}: ${fmt(value)} MU`}
                                  style={{
                                    width: `${width}%`,
                                    background: value < 0 ? "#DC2626" : source.color,
                                    minWidth: width > 0 ? 4 : 0,
                                  }}
                                />
                              );
                            })}
                          </div>
                        </div>
                        <div className="text-end" style={{ width: 86 }}>
                          <div className="fw-bold text-success" style={{ fontSize: "0.75rem" }}>{fmt(state.generation_total)} MU</div>
                        </div>
                      </div>
                      <div className="d-flex flex-wrap gap-2 mt-1 ps-1">
                        {SOURCES.filter((source) => Number(state[source.key] || 0) !== 0).map((source) => {
                          const value = Number(state[source.key] || 0);
                          return (
                            <span
                              key={source.key}
                              className="small fw-semibold"
                              style={{
                                color: value < 0 ? "#DC2626" : source.color,
                                fontSize: "0.65rem",
                              }}
                            >
                              {source.label}: {fmt(value)}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                    <div className="d-none d-xxl-flex flex-column gap-1" style={{ width: 136 }}>
                      <span className="badge bg-light text-dark border text-start">Sch {fmt(state.drawing_schedule)}</span>
                      <span className="badge bg-light border text-start" style={{ color: Number(state.ui) >= 0 ? "#047857" : "#DC2626" }}>
                        UI {fmt(state.ui)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="d-flex flex-wrap gap-2 mt-2">
            {SOURCES.map((source) => (
              <span key={source.key} className="small fw-semibold d-inline-flex align-items-center gap-1 text-muted">
                <span className="rounded-circle d-inline-block" style={{ width: 8, height: 8, background: source.color }} />
                {source.label}
              </span>
            ))}
          </div>
        </div>

        <div className="col-12 col-xl-4">
          <div className="h-100 rounded-3 border bg-white p-3">
            <div className="fw-bold text-dark mb-1">Energy Composition</div>
            <div className="small text-muted mb-2">Regional source contribution by magnitude</div>
            <div style={{ width: "100%", height: 168 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip
                    formatter={(value, name, item) => [`${fmt(item?.payload?.value)} MU (${fmt(item?.payload?.percent, 1)}%)`, name]}
                  />
                  <Pie
                    data={composition.map((item) => ({
                      name: item.name,
                      value: item.abs_value,
                      percent: item.percent,
                      key: item.key,
                    }))}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={44}
                    outerRadius={68}
                    paddingAngle={2}
                  >
                    {composition.map((item) => (
                      <Cell key={item.key} fill={SOURCES.find((source) => source.key === item.key)?.color || "#64748B"} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2" style={{ maxHeight: 124, overflowY: "auto" }}>
              {composition.map((item) => {
                const source = SOURCES.find((entry) => entry.key === item.key);
                return (
                  <div key={item.key} className="d-flex justify-content-between align-items-center py-1 border-bottom border-light-subtle">
                    <span className="small text-muted d-flex align-items-center gap-2">
                      <span className="rounded-circle d-inline-block" style={{ width: 8, height: 8, background: source?.color || "#64748B" }} />
                      {item.name}
                    </span>
                    <span className="small fw-bold text-dark">{fmt(item.value)} MU</span>
                  </div>
                );
              })}
            </div>
            <div className="row g-2 mt-2">
              <div className="col-6">
                <div className="rounded-3 bg-light border p-2">
                  <div className="text-muted fw-semibold" style={{ fontSize: "0.62rem" }}>DRAWAL SCH</div>
                  <div className="fw-bold text-dark">{fmt(totals.drawing_schedule)}</div>
                </div>
              </div>
              <div className="col-6">
                <div className="rounded-3 bg-light border p-2">
                  <div className="text-muted fw-semibold" style={{ fontSize: "0.62rem" }}>UI</div>
                  <div className="fw-bold" style={{ color: Number(totals.ui) >= 0 ? "#047857" : "#DC2626" }}>
                    {fmt(totals.ui)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
