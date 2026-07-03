import { RefreshCw, X } from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const formatDate = (dateStr) => {
  if (!dateStr) return "-";
  const dt = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return dateStr;
  return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

const formatFreq = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "-";
  return parsed.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export default function PSPFrequencyTrendModal({
  open,
  onClose,
  data,
  loading,
  error,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onLoad,
}) {
  if (!open) return null;

  return (
    <div
      className="modal fade show d-block"
      style={{ backgroundColor: "rgba(15, 23, 42, 0.45)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div className="modal-dialog modal-xl modal-dialog-centered" onClick={(event) => event.stopPropagation()}>
        <div className="modal-content theme-glass-card border-0 p-3" style={{ borderRadius: "18px" }}>
          <div className="modal-header border-0 pb-2 d-flex justify-content-between align-items-start">
            <div>
              <h5 className="modal-title fw-bold text-dark mb-0">Frequency Max/Min Historical Trend</h5>
              <p className="small text-muted mb-0">Source: pspFrequencyProfileMaxMin.MAX_FREQ / MIN_FREQ.</p>
            </div>
            <button type="button" className="btn btn-sm theme-btn-outline" onClick={onClose}>
              <X size={16} />
            </button>
          </div>

          <div className="modal-body pt-2">
            <div className="d-flex align-items-end gap-2 flex-wrap mb-3">
              <div>
                <label className="form-label small fw-bold text-secondary mb-1">Start Date</label>
                <input type="date" className="form-control theme-input" value={startDate} onChange={(event) => onStartDateChange(event.target.value)} />
              </div>
              <div>
                <label className="form-label small fw-bold text-secondary mb-1">End Date</label>
                <input type="date" className="form-control theme-input" value={endDate} onChange={(event) => onEndDateChange(event.target.value)} />
              </div>
              <button type="button" className="btn theme-btn-primary d-flex align-items-center gap-2" onClick={onLoad} disabled={loading}>
                <RefreshCw size={14} className={loading ? "animate-spin-custom" : ""} />
                <span>Load Trend</span>
              </button>
            </div>

            <div className="rounded-3 border bg-white p-2" style={{ height: "420px" }}>
              {loading ? (
                <div className="d-flex align-items-center justify-content-center h-100">
                  <div className="spinner-border text-success spinner-border-sm me-2" role="status"></div>
                  <span className="small fw-bold text-secondary">Loading frequency trend...</span>
                </div>
              ) : error ? (
                <div className="alert alert-warning mb-0">{error}</div>
              ) : !data?.data?.length ? (
                <div className="d-flex align-items-center justify-content-center h-100 text-muted fw-semibold">
                  No frequency trend data found for selected range.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.data} margin={{ top: 12, right: 20, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 11 }} />
                    <YAxis domain={["dataMin - 0.05", "dataMax + 0.05"]} tick={{ fontSize: 11 }} />
                    <Tooltip labelFormatter={formatDate} formatter={(value, name) => [formatFreq(value), name]} />
                    <Legend />
                    {(data.series || []).map((series) => (
                      <Line
                        key={series.key}
                        type="monotone"
                        dataKey={series.key}
                        name={series.label}
                        stroke={series.color}
                        strokeWidth={2.2}
                        dot={{ r: 2 }}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
