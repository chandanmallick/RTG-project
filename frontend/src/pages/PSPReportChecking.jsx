import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, AlertTriangle, Calendar, CheckCircle2, FileSpreadsheet, RefreshCw, TrendingUp, X } from "lucide-react";
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

import AppShell from "../components/layout/AppShell";
import CalendarInput from "../components/ui/CalendarInput";
import API from "../services/api";

const todayIso = () => new Date().toISOString().slice(0, 10);
const addDays = (dateStr, days) => {
  const dt = new Date(`${dateStr}T00:00:00`);
  dt.setDate(dt.getDate() + days);
  return dt.toISOString().slice(0, 10);
};

const formatDate = (dateStr) => {
  if (!dateStr) return "-";
  const dt = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return dateStr;
  return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

const formatValue = (value, unit) => {
  if (value === null || value === undefined || value === "") return "-";
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "-";
  const decimals = unit === "MU" ? 3 : 0;
  return parsed.toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};

const diffTone = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || Math.abs(parsed) < 0.001) return { color: "#475569", background: "#F1F5F9" };
  return parsed > 0
    ? { color: "#B45309", background: "#FEF3C7" }
    : { color: "#047857", background: "#D1FAE5" };
};

const demandGroups = [
  {
    key: "max_demand",
    label: "Max Demand",
    color: "#E0F2FE",
    border: "#0284C7",
    columns: [
      ["time", "Time"],
      ["operational", "PSP"],
      ["average_last_7_days", "Avg 7D"],
      ["same_day_last_week", "Last Week"],
      ["same_day_last_year", "Last Year"],
      ["hourly_status", "Hr"],
      ["curve", "Curve"],
      ["diff", "Diff"],
    ],
  },
  {
    key: "peak_demand",
    label: "Peak Demand",
    color: "#FEF3C7",
    border: "#D97706",
    columns: [
      ["operational", "PSP"],
      ["average_last_7_days", "Avg 7D"],
      ["same_day_last_week", "Last Week"],
      ["same_day_last_year", "Last Year"],
      ["curve", "Curve"],
      ["diff", "Diff"],
    ],
  },
  {
    key: "off_peak_demand",
    label: "Off Peak",
    color: "#ECFDF5",
    border: "#059669",
    columns: [
      ["operational", "PSP"],
      ["average_last_7_days", "Avg 7D"],
      ["same_day_last_week", "Last Week"],
      ["same_day_last_year", "Last Year"],
      ["curve", "Curve"],
      ["diff", "Diff"],
    ],
  },
  {
    key: "min_demand",
    label: "Min Demand",
    color: "#F3E8FF",
    border: "#7C3AED",
    columns: [
      ["hourly_api", "Hourly"],
      ["curve", "Curve"],
    ],
  },
];

export default function PSPReportChecking() {
  const [dateStr, setDateStr] = useState(addDays(todayIso(), -1));
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [sourceRefreshLoading, setSourceRefreshLoading] = useState(false);
  const [activeTable, setActiveTable] = useState("energy");
  const [shortageTrendOpen, setShortageTrendOpen] = useState(false);
  const [shortageTrendLoading, setShortageTrendLoading] = useState(false);
  const [shortageTrendError, setShortageTrendError] = useState("");
  const [shortageTrend, setShortageTrend] = useState(null);
  const [trendStartDate, setTrendStartDate] = useState(addDays(todayIso(), -14));
  const [trendEndDate, setTrendEndDate] = useState(addDays(todayIso(), -1));
  const [trendState, setTrendState] = useState("ER");
  const [summaryModal, setSummaryModal] = useState(null);
  const detailSectionRef = useRef(null);

  const loadReport = async (nextDate = dateStr, includeCurve = false) => {
    try {
      setLoading(true);
      setError("");
      const res = await API.getPspReportChecking(nextDate, includeCurve);
      if (!res.success) throw new Error(res.message || "Unable to load report checking data");
      setData(res);
      if (res.tables?.length && !res.tables.some((table) => table.key === activeTable)) {
        setActiveTable(res.tables[0].key);
      }
    } catch (err) {
      console.error("Error loading PSP report checking:", err);
      setError(err.message || "Unable to load PSP report checking data.");
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReport(dateStr);
  }, []);

  const refreshSourcesAndLoad = async () => {
    try {
      setSourceRefreshLoading(true);
      setError("");
      const res = await API.refreshPspSources(dateStr);
      if (!res.success) {
        const failedKeys = Object.keys(res.failed || {});
        throw new Error(
          failedKeys.length
            ? `Source refresh completed with failures: ${failedKeys.join(", ")}`
            : res.message || "Source refresh failed."
        );
      }
      await loadReport(res.date || dateStr);
    } catch (err) {
      console.error("Error refreshing PSP sources:", err);
      setError(err.message || "Unable to refresh PSP source data.");
      await loadReport(dateStr);
    } finally {
      setSourceRefreshLoading(false);
    }
  };

  const loadShortageTrend = async (
    start = trendStartDate,
    end = trendEndDate,
    state = trendState
  ) => {
    try {
      setShortageTrendLoading(true);
      setShortageTrendError("");
      const res = await API.getPspShortageTrend(start, end, state);
      if (!res.success) throw new Error(res.message || "Unable to load shortage trend");
      setShortageTrend(res);
    } catch (err) {
      console.error("Error loading shortage trend:", err);
      setShortageTrendError(err.message || "Unable to load shortage trend.");
    } finally {
      setShortageTrendLoading(false);
    }
  };

  const openShortageTrend = () => {
    setShortageTrendOpen(true);
    loadShortageTrend();
  };

  const tables = data?.tables || [];
  const table = useMemo(
    () => tables.find((item) => item.key === activeTable) || tables[0],
    [activeTable, tables]
  );
  const showCurveColumns = table?.include_curve_columns !== false;
  const isShortageTable = table?.table_type === "shortage";
  const isDemandTable = table?.table_type === "demand";
  const isTransnationalTable = table?.table_type === "transnational";
  const checkSummary = useMemo(() => {
    if (!data) return null;

    const groups = [];
    const addGroup = (key, label, count, detail, severity = "danger", options = {}) => {
      groups.push({ key, label, count, detail, severity, ...options });
    };

    const frequencyTotal = Number(data.frequency_check?.total_band_percent);
    const frequencyOk = Number.isFinite(frequencyTotal) && Math.abs(frequencyTotal - 100) <= 0.05;
    addGroup(
      "frequency_sum",
      "Frequency Sum Check",
      frequencyOk ? 0 : 1,
      Number.isFinite(frequencyTotal)
        ? `FREQ4 + FREQ5 + FREQ7 = ${frequencyTotal.toFixed(2)}%`
        : "Frequency band data not available",
      frequencyOk ? "success" : "danger",
      {
        columns: ["Check", "Value", "Status"],
        rows: [{
          Check: "FREQ4 + FREQ5 + FREQ7",
          Value: Number.isFinite(frequencyTotal) ? `${frequencyTotal.toFixed(2)}%` : "-",
          Status: frequencyOk ? "OK" : "Check",
        }],
      }
    );

    const demandTable = (data.tables || []).find((item) => item.table_type === "demand");
    const demandRows = demandTable?.rows || [];
    const hourlyMismatch = demandRows.filter((row) => row.max_demand_hourly_status === false);
    addGroup(
      "hourly_demand",
      "Hourly Demand Match",
      hourlyMismatch.length,
      hourlyMismatch.length
        ? hourlyMismatch.map((row) => row.state).slice(0, 4).join(", ")
        : "All hourly boundary values match within tolerance",
      hourlyMismatch.length ? "danger" : "success",
      {
        tableKey: demandTable?.key,
        columns: ["State", "PSP MW", "Hourly MW", "Reason"],
        rows: hourlyMismatch.map((row) => ({
          State: row.state,
          "PSP MW": formatValue(row.max_demand_operational, "MW"),
          "Hourly MW": formatValue(row.max_demand_hourly_api, "MW"),
          Reason: row.max_demand_hourly_reason || "-",
        })),
      }
    );

    const transnationalTable = (data.tables || []).find((item) => item.table_type === "transnational");
    const transnationalRows = transnationalTable?.rows || [];
    const transnationalFailures = transnationalRows.filter((row) => row.status && row.status !== "OK");
    addGroup(
      "transnational",
      "Transnational Logic",
      transnationalFailures.length,
      transnationalFailures.length
        ? transnationalFailures.map((row) => row.name).slice(0, 4).join(", ")
        : "Day order and schedule checks passed",
      transnationalFailures.length ? "danger" : "success",
      {
        tableKey: transnationalTable?.key,
        columns: ["Name", "Status", "Day Order", "Schedule", "Remarks"],
        rows: transnationalFailures.map((row) => ({
          Name: row.name,
          Status: row.status || "-",
          "Day Order": row.day_order_ok === false ? "Check" : "OK",
          Schedule: row.schedule_actual_ok === false ? "Check" : "OK",
          Remarks: row.remarks || "-",
        })),
      }
    );

    const shortageTable = (data.tables || []).find((item) => item.table_type === "shortage");
    const shortageRows = shortageTable?.rows || [];
    const shortagePositive = shortageRows.filter((row) =>
      ["day_shortage", "max_demand_shortage", "peak_shortage", "off_peak_shortage"].some((key) => Number(row[key]) > 0)
    );
    addGroup(
      "shortage_sign",
      "Shortage Sign",
      shortagePositive.length,
      shortagePositive.length
        ? shortagePositive.map((row) => row.state).slice(0, 4).join(", ")
        : "All shortage values are negative or zero",
      shortagePositive.length ? "danger" : "success",
      {
        tableKey: shortageTable?.key,
        columns: ["State", "Day MU", "Max MW", "Peak MW", "Off Peak MW"],
        rows: shortagePositive.map((row) => ({
          State: row.state,
          "Day MU": formatValue(row.day_shortage, "MU"),
          "Max MW": formatValue(row.max_demand_shortage, "MW"),
          "Peak MW": formatValue(row.peak_shortage, "MW"),
          "Off Peak MW": formatValue(row.off_peak_shortage, "MW"),
        })),
      }
    );

    const curveVarianceRows = [];
    (data.tables || []).forEach((item) => {
      if (item.table_type === "demand") {
        (item.rows || []).forEach((row) => {
          [
            ["max_demand_diff", "Max Demand"],
            ["peak_demand_diff", "Peak Demand"],
            ["off_peak_demand_diff", "Off Peak"],
          ].forEach(([key, label]) => {
            const value = Number(row[key]);
            if (Number.isFinite(value) && Math.abs(value) > 1) {
              curveVarianceRows.push({
                Table: item.title,
                Item: row.state,
                Field: label,
                Difference: formatValue(value, "MW"),
                Unit: "MW",
              });
            }
          });
        });
        return;
      }
      if (item.include_curve_columns === false) return;
      (item.rows || []).forEach((row) => {
        const value = Number(row.difference_operational_vs_curve);
        const tolerance = item.unit === "MU" ? 0.01 : 1;
        if (Number.isFinite(value) && Math.abs(value) > tolerance) {
          curveVarianceRows.push({
            Table: item.title,
            Item: row.state || row.name || "-",
            Field: "Operational - Curve",
            Difference: formatValue(value, item.unit),
            Unit: item.unit || "-",
          });
        }
      });
    });
    addGroup(
      "curve_variance",
      "Curve Variance",
      curveVarianceRows.length,
      data.curve?.available
        ? "Operational and curve-file figures outside tolerance"
        : "Curve file not loaded for variance check",
      curveVarianceRows.length ? "warning" : "success",
      {
        tableKey: demandTable?.key,
        columns: ["Table", "Item", "Field", "Difference", "Unit"],
        rows: curveVarianceRows,
      }
    );

    const violationCount = groups
      .filter((group) => group.severity !== "success")
      .reduce((sum, group) => sum + group.count, 0);

    return { groups, violationCount };
  }, [data]);

  const openSummaryDetails = (group) => {
    setSummaryModal(group);
    if (group.tableKey) setActiveTable(group.tableKey);
  };

  const showSummaryInTable = () => {
    if (summaryModal?.tableKey) setActiveTable(summaryModal.tableKey);
    setSummaryModal(null);
    setTimeout(() => {
      detailSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  };

  return (
    <AppShell>
      <div className="container-fluid theme-page-container" style={{ padding: "24px" }}>
        <div
          className="theme-glass-card position-relative overflow-hidden border-0 text-white mb-3"
          style={{
            background: "linear-gradient(135deg, #022726 0%, #03624C 55%, #17876D 100%)",
            borderRadius: "18px",
            padding: "18px 22px",
          }}
        >
          <div className="d-flex align-items-center justify-content-between gap-3 flex-wrap position-relative">
            <div>
              <div
                className="badge rounded-pill fw-bold text-dark mb-2"
                style={{ backgroundColor: "#00DF81", fontSize: "0.68rem", letterSpacing: "0.05em" }}
              >
                <Activity size={11} className="me-1 align-text-bottom" />
                PSP REPORT CHECK
              </div>
              <h1 className="fw-bold mb-1" style={{ fontSize: "1.42rem" }}>
                PSP Report Checking
              </h1>
              <p className="mb-0" style={{ color: "#D1FAE5", fontSize: "0.8rem" }}>
                Operational PSP values compared with recent history and 30-second curve file calculations.
              </p>
            </div>
            <div className="d-flex align-items-end gap-2 flex-wrap">
              <div>
                <label className="form-label small fw-bold mb-1" style={{ color: "#D1FAE5" }}>Operational Date</label>
                <CalendarInput className="form-control theme-input" value={dateStr} onChange={setDateStr} style={{ minWidth: "160px" }} />
              </div>
              <button
                className="btn theme-btn-action d-flex align-items-center gap-2"
                onClick={() => loadReport(dateStr)}
                disabled={loading || sourceRefreshLoading}
              >
                <RefreshCw size={14} className={loading ? "animate-spin-custom" : ""} />
                <span>Load Check</span>
              </button>
              <button
                className="btn theme-btn-outline d-flex align-items-center gap-2"
                onClick={refreshSourcesAndLoad}
                disabled={loading || sourceRefreshLoading}
                style={{ backgroundColor: "rgba(255,255,255,0.92)" }}
              >
                <FileSpreadsheet size={14} className={sourceRefreshLoading ? "animate-spin-custom" : ""} />
                <span>Fetch Sources & Recalculate</span>
              </button>
            </div>
          </div>
        </div>

        <div className="theme-glass-card p-3 mb-3">
          <div className="d-flex align-items-start justify-content-between gap-3 flex-wrap mb-3">
            <div>
              <h2 className="h6 fw-bold mb-1 text-dark d-flex align-items-center gap-2">
                {checkSummary?.violationCount ? (
                  <AlertTriangle size={17} className="text-danger" />
                ) : (
                  <CheckCircle2 size={17} className="text-success" />
                )}
                <span>Summary of Violated Figures / Logic</span>
              </h2>
              <p className="small text-muted mb-0" style={{ fontSize: "0.73rem" }}>
                Front summary for PSP report-check exceptions. Detailed tables are available below.
              </p>
            </div>
            <div
              className={`rounded-3 px-3 py-2 fw-bold ${checkSummary?.violationCount ? "text-danger" : "text-success"}`}
              style={{
                backgroundColor: checkSummary?.violationCount ? "#FEE2E2" : "#DCFCE7",
                minWidth: "130px",
                textAlign: "center",
              }}
            >
              <span className="d-block" style={{ fontSize: "1.35rem", lineHeight: 1 }}>
                {checkSummary?.violationCount ?? "-"}
              </span>
              <span className="d-block" style={{ fontSize: "0.68rem" }}>
                Open Items
              </span>
            </div>
          </div>

          <div className="d-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "10px" }}>
            {(checkSummary?.groups || []).map((group) => {
              const tone = group.severity === "success"
                ? { bg: "#F0FDF4", border: "#22C55E", text: "#15803D" }
                : group.severity === "warning"
                  ? { bg: "#FFFBEB", border: "#F59E0B", text: "#B45309" }
                  : { bg: "#FEF2F2", border: "#EF4444", text: "#B91C1C" };
              return (
                <div
                  key={group.key}
                  className="rounded-3 border bg-white p-2"
                  role="button"
                  tabIndex={0}
                  onClick={() => openSummaryDetails(group)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openSummaryDetails(group);
                    }
                  }}
                  style={{
                    borderLeft: `4px solid ${tone.border}`,
                    cursor: "pointer",
                    transition: "transform 0.16s ease, box-shadow 0.16s ease",
                  }}
                  title="Open detail"
                >
                  <div className="d-flex align-items-center justify-content-between gap-2">
                    <span className="fw-bold text-dark" style={{ fontSize: "0.78rem" }}>{group.label}</span>
                    <span
                      className="fw-bold rounded-pill px-2 py-1"
                      style={{ backgroundColor: tone.bg, color: tone.text, fontSize: "0.72rem" }}
                    >
                      {group.count}
                    </span>
                  </div>
                  <div className="text-secondary mt-1 text-truncate" title={group.detail} style={{ fontSize: "0.69rem" }}>
                    {group.detail}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="row g-3 mb-3">
          <div className="col-12 col-lg-8">
            <div className="theme-glass-card p-3 h-100">
              <div className="d-flex align-items-center gap-2 mb-1">
                <Calendar size={16} className="text-success" />
                <h2 className="h6 fw-bold mb-0 text-dark">Comparison Basis</h2>
              </div>
              <div className="row g-2 mt-1">
                {[
                  ["Operational Day", formatDate(data?.date || dateStr)],
                  ["Average Window", "Previous 7 available days"],
                  ["Same Day Last Week", formatDate(addDays(data?.date || dateStr, -7))],
                  ["Same Day Last Year", formatDate(`${Number((data?.date || dateStr).slice(0, 4)) - 1}${(data?.date || dateStr).slice(4)}`)],
                ].map(([label, value]) => (
                  <div key={label} className="col-6 col-xl-3">
                    <div className="p-2 rounded-3 bg-light border border-light-subtle h-100">
                      <span className="d-block text-muted small fw-bold">{label}</span>
                      <span className="d-block text-dark fw-bold" style={{ fontSize: "0.84rem" }}>{value}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="col-12 col-lg-4">
            <div className="theme-glass-card p-3 h-100">
              <div className="d-flex align-items-center gap-2 mb-2">
                <FileSpreadsheet size={16} className={data?.curve?.available ? "text-success" : "text-warning"} />
                <h2 className="h6 fw-bold mb-0 text-dark">Curve File Source</h2>
              </div>
              {data?.curve?.available ? (
                <div className="d-flex align-items-start gap-2">
                  <CheckCircle2 size={16} className="text-success mt-1" />
                  <div>
                    <div className="fw-bold text-dark" style={{ fontSize: "0.82rem" }}>{data.curve.file}</div>
                    <div className="text-secondary" style={{ fontSize: "0.72rem", wordBreak: "break-all" }}>
                      {data.curve.path}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="d-flex align-items-start gap-2">
                  <AlertTriangle size={16} className="text-warning mt-1" />
                  <div className="text-secondary fw-semibold" style={{ fontSize: "0.76rem" }}>
                    {data?.curve?.message || error || "Use Fetch Sources & Recalculate to cache Excel-derived curve values in Mongo."}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="theme-glass-card p-3" ref={detailSectionRef}>
          <div className="d-flex align-items-center justify-content-between gap-2 flex-wrap mb-3">
            <div>
              <h2 className="h6 fw-bold mb-0 text-dark">Report Checking Tables</h2>
              <p className="small text-muted mb-0" style={{ fontSize: "0.73rem" }}>
                {table?.source_key || "Curve energy is calculated as sum of 30-second MW samples divided by 120000."}
              </p>
            </div>
            <div className="d-flex gap-2 flex-wrap">
              <button
                type="button"
                className="btn btn-sm theme-btn-outline d-flex align-items-center gap-1"
                onClick={openShortageTrend}
                style={{ fontSize: "0.72rem", padding: "5px 10px" }}
              >
                <TrendingUp size={13} />
                <span>Shortage Trend</span>
              </button>
              {tables.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={`btn btn-sm ${item.key === table?.key ? "theme-btn-primary" : "theme-btn-outline"}`}
                  onClick={() => setActiveTable(item.key)}
                  style={{ fontSize: "0.72rem", padding: "5px 10px" }}
                >
                  {item.title}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="d-flex align-items-center justify-content-center py-5">
              <div className="spinner-border text-success spinner-border-sm me-2" role="status"></div>
              <span className="small fw-bold text-secondary">Loading PSP checking data...</span>
            </div>
          ) : error ? (
            <div className="alert alert-warning mb-0">{error}</div>
          ) : !table ? (
            <div className="text-center text-muted fw-semibold py-5">No report checking data loaded.</div>
          ) : (
            <div className="table-responsive" style={{ maxHeight: "62vh", overflow: "auto" }}>
              <table className="table table-hover align-middle theme-table mb-0" style={{ minWidth: isShortageTable ? "820px" : isDemandTable ? "1900px" : isTransnationalTable ? "1280px" : "1080px" }}>
                <thead style={{ position: "sticky", top: 0, zIndex: 2 }}>
                  {isDemandTable ? (
                    <>
                      <tr>
                        <th style={{ width: "150px", background: "#F8FAFC" }}>Constituent</th>
                        {demandGroups.map((group) => (
                          <th
                            key={group.key}
                            className="text-center"
                            colSpan={group.columns.length}
                            style={{ background: group.color, borderTop: `3px solid ${group.border}` }}
                          >
                            {group.label}
                          </th>
                        ))}
                      </tr>
                      <tr>
                        <th></th>
                        {demandGroups.flatMap((group) =>
                          group.columns.map(([, label]) => (
                            <th key={`${group.key}-${label}`} className="text-end" style={{ background: group.color }}>
                              {label}
                            </th>
                          ))
                        )}
                      </tr>
                    </>
                  ) : isTransnationalTable ? (
                    <tr>
                      <th>Type</th>
                      <th>Name</th>
                      <th className="text-end">Day Peak</th>
                      <th className="text-end">Day Avg</th>
                      <th className="text-end">Day Min</th>
                      <th className="text-end">Scheduled EX</th>
                      <th className="text-end">Actual EX</th>
                      <th className="text-end">Diff %</th>
                      <th>Day Order</th>
                      <th>Schedule</th>
                      <th>Status</th>
                      <th>Remarks</th>
                    </tr>
                  ) : isShortageTable ? (
                    <tr>
                      {(table.columns || []).map((column) => (
                        <th key={column.key} className={column.key === "state" ? "" : "text-end"} title={column.source || ""}>
                          {column.label}
                        </th>
                      ))}
                    </tr>
                  ) : (
                    <tr>
                      <th style={{ width: "170px" }}>Constituent</th>
                      <th className="text-end">Operational Day</th>
                      <th className="text-end">Avg Last 7 Days</th>
                      <th className="text-end">Same Day Last Week</th>
                      <th className="text-end">Same Day Last Year</th>
                      {showCurveColumns && <th className="text-end">Curve File</th>}
                      {showCurveColumns && <th className="text-end">Operational - Curve</th>}
                    </tr>
                  )}
                </thead>
                <tbody>
                  {table.rows.map((row) => {
                    const tone = diffTone(row.difference_operational_vs_curve);
                    if (isDemandTable) {
                      return (
                        <tr key={row.state}>
                          <td className="fw-bold text-dark">{row.state}</td>
                          {demandGroups.flatMap((group) =>
                            group.columns.map(([suffix]) => {
                              if (suffix === "hourly_status") {
                                const status = row.max_demand_hourly_status;
                                const reason = row.max_demand_hourly_reason || "";
                                const hourlyValue = row.max_demand_hourly_api;
                                const cls = status === true
                                  ? "text-success"
                                  : status === false
                                    ? "text-danger"
                                    : "text-secondary";
                                return (
                                  <td key={`${group.key}-${suffix}`} className="text-end">
                                    <span
                                      className={`fw-bold ${cls}`}
                                      style={{ fontSize: "0.72rem", cursor: "help" }}
                                      title={reason}
                                    >
                                      {formatValue(hourlyValue, "MW")}
                                    </span>
                                  </td>
                                );
                              }
                              const value = row[`${group.key}_${suffix}`];
                              if (suffix === "time") {
                                return (
                                  <td key={`${group.key}-${suffix}`} className="text-end text-secondary fw-semibold">
                                    {value || "-"}
                                  </td>
                                );
                              }
                              if (suffix === "hourly_diff") {
                                const tone = diffTone(value);
                                return (
                                  <td key={`${group.key}-${suffix}`} className="text-end">
                                    <span
                                      className="fw-bold rounded-pill px-2 py-1"
                                      style={{ color: tone.color, backgroundColor: tone.background, fontSize: "0.72rem" }}
                                    >
                                      {formatValue(value, "MW")}
                                    </span>
                                  </td>
                                );
                              }
                              if (suffix === "diff") {
                                const tone = diffTone(value);
                                return (
                                  <td key={`${group.key}-${suffix}`} className="text-end">
                                    <span
                                      className="fw-bold rounded-pill px-2 py-1"
                                      style={{ color: tone.color, backgroundColor: tone.background, fontSize: "0.72rem" }}
                                    >
                                      {formatValue(value, "MW")}
                                    </span>
                                  </td>
                                );
                              }
                              return (
                                <td
                                  key={`${group.key}-${suffix}`}
                                  className={suffix === "operational" ? "text-end fw-bold" : "text-end"}
                                  style={suffix === "curve" ? { color: "#03624C", fontWeight: 700 } : undefined}
                                >
                                  {formatValue(value, "MW")}
                                </td>
                              );
                            })
                          )}
                        </tr>
                      );
                    }
                    if (isTransnationalTable) {
                      const dayOk = row.day_order_ok;
                      const schOk = row.schedule_actual_ok;
                      const statusOk = row.status === "OK";
                      const badge = (value) => {
                        if (value === null || value === undefined) return { text: "N/A", cls: "bg-secondary-subtle text-secondary" };
                        return value ? { text: "OK", cls: "bg-success-subtle text-success" } : { text: "CHECK", cls: "bg-warning-subtle text-warning" };
                      };
                      const dayBadge = badge(dayOk);
                      const schBadge = badge(schOk);
                      return (
                        <tr key={`${row.type}-${row.name}`}>
                          <td className="fw-bold text-secondary">{row.type}</td>
                          <td className="fw-bold text-dark">{row.name}</td>
                          <td className="text-end">{formatValue(row.day_peak, "MW")}</td>
                          <td className="text-end">{formatValue(row.day_avg, "MW")}</td>
                          <td className="text-end">{formatValue(row.day_min, "MW")}</td>
                          <td className="text-end">{formatValue(row.scheduled_ex, "MU")}</td>
                          <td className="text-end">{formatValue(row.actual_ex, "MU")}</td>
                          <td className="text-end">{formatValue(row.schedule_actual_diff_percent, "MW")}</td>
                          <td><span className={`fw-bold rounded-pill px-2 py-1 ${dayBadge.cls}`} style={{ fontSize: "0.72rem" }}>{dayBadge.text}</span></td>
                          <td><span className={`fw-bold rounded-pill px-2 py-1 ${schBadge.cls}`} style={{ fontSize: "0.72rem" }}>{schBadge.text}</span></td>
                          <td>
                            <span className={`fw-bold rounded-pill px-2 py-1 ${statusOk ? "bg-success-subtle text-success" : "bg-danger-subtle text-danger"}`} style={{ fontSize: "0.72rem" }}>
                              {row.status}
                            </span>
                          </td>
                          <td className="text-secondary" style={{ fontSize: "0.74rem", minWidth: "260px" }}>{row.remarks}</td>
                        </tr>
                      );
                    }
                    if (isShortageTable) {
                      return (
                        <tr key={row.state}>
                          <td className="fw-bold text-dark">{row.state}</td>
                          <td className="text-end fw-bold">{formatValue(row.day_shortage, "MU")}</td>
                          <td className="text-end fw-bold">{formatValue(row.max_demand_shortage, "MW")}</td>
                          <td className="text-end fw-bold">{formatValue(row.peak_shortage, "MW")}</td>
                          <td className="text-end fw-bold">{formatValue(row.off_peak_shortage, "MW")}</td>
                        </tr>
                      );
                    }
                    return (
                      <tr key={row.state}>
                        <td className="fw-bold text-dark">{row.state}</td>
                        <td className="text-end fw-bold">{formatValue(row.operational_day, table.unit)}</td>
                        <td className="text-end">{formatValue(row.average_last_7_days, table.unit)}</td>
                        <td className="text-end">{formatValue(row.same_day_last_week, table.unit)}</td>
                        <td className="text-end">{formatValue(row.same_day_last_year, table.unit)}</td>
                        {showCurveColumns && (
                          <td className="text-end fw-bold" style={{ color: "#03624C" }}>
                            {formatValue(row.curve_file, table.unit)}
                          </td>
                        )}
                        {showCurveColumns && (
                          <td className="text-end">
                            <span
                              className="fw-bold rounded-pill px-2 py-1"
                              style={{ color: tone.color, backgroundColor: tone.background, fontSize: "0.74rem" }}
                            >
                              {formatValue(row.difference_operational_vs_curve, table.unit)}
                            </span>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {summaryModal && (
          <div
            className="modal fade show d-block"
            style={{ backgroundColor: "rgba(15, 23, 42, 0.45)", backdropFilter: "blur(4px)" }}
            onClick={() => setSummaryModal(null)}
          >
            <div className="modal-dialog modal-lg modal-dialog-centered" onClick={(event) => event.stopPropagation()}>
              <div className="modal-content theme-glass-card border-0 p-3" style={{ borderRadius: "18px" }}>
                <div className="modal-header border-0 pb-2 d-flex justify-content-between align-items-start">
                  <div>
                    <h5 className="modal-title fw-bold text-dark d-flex align-items-center gap-2">
                      <AlertTriangle
                        size={18}
                        className={summaryModal.severity === "success" ? "text-success" : summaryModal.severity === "warning" ? "text-warning" : "text-danger"}
                      />
                      <span>{summaryModal.label}</span>
                    </h5>
                    <p className="small text-muted mb-0">{summaryModal.detail}</p>
                  </div>
                  <button type="button" className="btn btn-sm theme-btn-outline" onClick={() => setSummaryModal(null)}>
                    <X size={16} />
                  </button>
                </div>

                <div className="modal-body pt-2">
                  <div className="d-flex align-items-center justify-content-between gap-2 flex-wrap mb-2">
                    <span className="fw-bold text-secondary" style={{ fontSize: "0.78rem" }}>
                      {summaryModal.count} item{summaryModal.count === 1 ? "" : "s"}
                    </span>
                    {summaryModal.tableKey && (
                      <button type="button" className="btn btn-sm theme-btn-primary" onClick={showSummaryInTable}>
                        Show in table
                      </button>
                    )}
                  </div>

                  {(summaryModal.rows || []).length ? (
                    <div className="table-responsive rounded-3 border bg-white" style={{ maxHeight: "55vh", overflow: "auto" }}>
                      <table className="table table-hover align-middle theme-table mb-0">
                        <thead style={{ position: "sticky", top: 0, zIndex: 1 }}>
                          <tr>
                            {(summaryModal.columns || []).map((column) => (
                              <th key={column}>{column}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {summaryModal.rows.map((row, index) => (
                            <tr key={`${summaryModal.key}-${index}`}>
                              {(summaryModal.columns || []).map((column) => (
                                <td key={column} className={column === "Difference" || column.includes("MW") || column.includes("MU") ? "text-end" : ""}>
                                  {row[column] ?? "-"}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="rounded-3 border bg-light p-3 text-center text-muted fw-semibold">
                      No open detail rows for this check.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {shortageTrendOpen && (
          <div
            className="modal fade show d-block"
            style={{ backgroundColor: "rgba(15, 23, 42, 0.45)", backdropFilter: "blur(4px)" }}
            onClick={() => setShortageTrendOpen(false)}
          >
            <div className="modal-dialog modal-xl modal-dialog-centered" onClick={(event) => event.stopPropagation()}>
              <div className="modal-content theme-glass-card border-0 p-3" style={{ borderRadius: "18px" }}>
                <div className="modal-header border-0 pb-2 d-flex justify-content-between align-items-start">
                  <div>
                    <h5 className="modal-title fw-bold text-dark d-flex align-items-center gap-2">
                      <TrendingUp size={18} className="text-success" />
                      <span>Shortage Historical Trend</span>
                    </h5>
                    <p className="small text-muted mb-0">
                      Values are normalized as negative from PSP shortage keys.
                    </p>
                  </div>
                  <button type="button" className="btn btn-sm theme-btn-outline" onClick={() => setShortageTrendOpen(false)}>
                    <X size={16} />
                  </button>
                </div>

                <div className="modal-body pt-2">
                  <div className="d-flex align-items-end gap-2 flex-wrap mb-3">
                    <div style={{ minWidth: "240px" }}>
                      <label className="form-label small fw-bold text-secondary mb-1">Date Range</label>
                      <CalendarInput
                        mode="range"
                        className="form-control theme-input"
                        value={trendStartDate}
                        endValue={trendEndDate}
                        onRangeChange={(start, end) => {
                          setTrendStartDate(start);
                          setTrendEndDate(end);
                        }}
                      />
                    </div>
                    <div>
                      <label className="form-label small fw-bold text-secondary mb-1">Constituent</label>
                      <select
                        className="form-select theme-input"
                        value={trendState}
                        onChange={(event) => setTrendState(event.target.value)}
                        style={{ minWidth: "170px" }}
                      >
                        {(shortageTrend?.states || ["ER", "BIHAR", "DVC", "JHARKHAND", "ODISHA", "SIKKIM", "WEST BENGAL"]).map((state) => (
                          <option key={state} value={state}>{state}</option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      className="btn theme-btn-primary d-flex align-items-center gap-2"
                      onClick={() => loadShortageTrend(trendStartDate, trendEndDate, trendState)}
                      disabled={shortageTrendLoading}
                    >
                      <RefreshCw size={14} className={shortageTrendLoading ? "animate-spin-custom" : ""} />
                      <span>Load Trend</span>
                    </button>
                  </div>

                  <div className="rounded-3 border bg-white p-2" style={{ height: "420px" }}>
                    {shortageTrendLoading ? (
                      <div className="d-flex align-items-center justify-content-center h-100">
                        <div className="spinner-border text-success spinner-border-sm me-2" role="status"></div>
                        <span className="small fw-bold text-secondary">Loading shortage trend...</span>
                      </div>
                    ) : shortageTrendError ? (
                      <div className="alert alert-warning mb-0">{shortageTrendError}</div>
                    ) : !shortageTrend?.data?.length ? (
                      <div className="d-flex align-items-center justify-content-center h-100 text-muted fw-semibold">
                        No shortage trend data found for selected range.
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={shortageTrend.data} margin={{ top: 12, right: 20, left: 0, bottom: 8 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                          <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} />
                          <Tooltip
                            labelFormatter={formatDate}
                            formatter={(value, name) => [formatValue(value, name.includes("MU") ? "MU" : "MW"), name]}
                          />
                          <Legend />
                          {(shortageTrend.series || []).map((series) => (
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
        )}

      </div>
    </AppShell>
  );
}
