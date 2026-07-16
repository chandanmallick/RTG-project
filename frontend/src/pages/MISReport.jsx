import { useEffect, useMemo, useRef, useState } from "react";
import html2canvas from "html2canvas";
import {
  CartesianGrid,
  ComposedChart,
  ReferenceLine,
  Scatter,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BarChart3, ChevronDown, Download, FileSpreadsheet, Plus, RefreshCw, Trash2 } from "lucide-react";

import AppShell from "../components/layout/AppShell";
import CalendarInput from "../components/ui/CalendarInput";
import API from "../services/api";
import { CHART_COLORS, CHART_GRID_PROPS, CHART_TOOLTIP_PROPS } from "../theme/chartTheme";

const todayIso = () => new Date().toISOString().slice(0, 10);
const addDays = (dateStr, days) => {
  const dt = new Date(`${dateStr}T00:00:00`);
  dt.setDate(dt.getDate() + days);
  return dt.toISOString().slice(0, 10);
};

const STATE_OPTIONS = ["ER", "BIHAR", "DVC", "JHARKHAND", "ODISHA", "SIKKIM", "WEST BENGAL"];
const CURVE_TYPES = [
  ["daily", "Daily"],
  ["monthly_average", "Monthly average"],
  ["weekday_weekend_average", "Weekday/Weekend average"],
  ["custom_dates", "Custom selected dates"],
];
const COLORS = CHART_COLORS;

const makeId = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `range-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
};

const defaultRange = () => ({
  id: makeId(),
  label: "Range 1",
  start_date: addDays(todayIso(), -7),
  end_date: addDays(todayIso(), -1),
  curve_type: "daily",
  selected_dates_text: "",
});

const defaultSnapshotCompareRange = (index = 1) => ({
  id: makeId(),
  label: `Compare ${index}`,
  start_date: addDays(todayIso(), -14 - ((index - 1) * 7)),
  end_date: addDays(todayIso(), -8 - ((index - 1) * 7)),
});

const defaultOutageCompareRange = (index = 1) => ({
  id: makeId(),
  start_date: addDays(todayIso(), -14 - ((index - 1) * 7)),
  end_date: addDays(todayIso(), -8 - ((index - 1) * 7)),
});

const OUTAGE_CATEGORIES = [
  ["State_Planned", "State Planned"],
  ["State_Forced", "State Forced"],
  ["Central_Planned", "Central Planned"],
  ["Central_Forced", "Central Forced"],
];

const parseCustomDates = (text) => String(text || "")
  .split(/[\n,; ]+/)
  .map((item) => item.trim())
  .filter(Boolean);

const toPayloadRange = (range) => ({
  label: range.label,
  start_date: range.start_date,
  end_date: range.end_date,
  curve_type: range.curve_type,
  selected_dates: range.curve_type === "custom_dates" ? parseCustomDates(range.selected_dates_text) : [],
});

const formatMw = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return "-";
  return num.toLocaleString("en-IN", { maximumFractionDigits: 2 });
};

const formatRangeLabel = (range) => {
  if (!range) return "";
  return `${range.start_date} to ${range.end_date}`;
};

const defaultVoltageDateTime = (daysBack, timeText) => `${addDays(todayIso(), daysBack)}T${timeText}`;
const formatApiDateTime = (value) => String(value || "").replace("T", " ");
const VOLTAGE_MASTER_STORAGE_KEY = "mis_voltage_master_points_v1";
const VOLTAGE_REACTOR_MAP_STORAGE_KEY = "mis_voltage_reactor_station_map_v1";

const getVoltageLevel = (stationName) => {
  const match = String(stationName || "").match(/(\d+(?:\.\d+)?)\s*kV/i);
  const level = match ? Number(match[1]) : NaN;
  return Number.isFinite(level) && level > 0 ? level : null;
};

const readVoltageMasterStore = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(VOLTAGE_MASTER_STORAGE_KEY) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const readVoltageReactorMapStore = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(VOLTAGE_REACTOR_MAP_STORAGE_KEY) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const inferReactorStationName = (stationName) => String(stationName || "")
  .replace(/^\s*\d+(?:\.\d+)?\s*kV\s*/i, "")
  .trim();

const parseChartDateTime = (value) => {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2})/);
  if (match) return new Date(`${match[3]}-${match[2]}-${match[1]}T${match[4]}:${match[5]}:00`).getTime();
  const normalized = text.replace(" ", "T");
  const parsed = new Date(normalized).getTime();
  return Number.isFinite(parsed) ? parsed : NaN;
};

const escapeHtml = (value) => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;");

export default function MISReport() {
  const [snapshotStartDate, setSnapshotStartDate] = useState(addDays(todayIso(), -7));
  const [snapshotEndDate, setSnapshotEndDate] = useState(addDays(todayIso(), -1));
  const [snapshotCompareRanges, setSnapshotCompareRanges] = useState([]);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [snapshotError, setSnapshotError] = useState("");
  const [snapshotResult, setSnapshotResult] = useState(null);
  const [showSnapshotDetails, setShowSnapshotDetails] = useState(false);
  const [outageStartDate, setOutageStartDate] = useState(addDays(todayIso(), -7));
  const [outageEndDate, setOutageEndDate] = useState(addDays(todayIso(), -1));
  const [outageCompareRanges, setOutageCompareRanges] = useState([]);
  const [outageLoading, setOutageLoading] = useState(false);
  const [outageError, setOutageError] = useState("");
  const [outageResult, setOutageResult] = useState(null);
  const [outageModalOpen, setOutageModalOpen] = useState(false);
  const [activeOutageCategory, setActiveOutageCategory] = useState("State_Planned");
  const [showDiurnalDetails, setShowDiurnalDetails] = useState(false);
  const [selectedStates, setSelectedStates] = useState(["ER"]);
  const [ranges, setRanges] = useState([defaultRange()]);
  const [blockMinutes, setBlockMinutes] = useState(15);
  const [chartMode, setChartMode] = useState("combined");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState("");
  const [lastApiStatus, setLastApiStatus] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [voltageMasterPoint, setVoltageMasterPoint] = useState("Master Point 1");
  const [voltageStartDateTime, setVoltageStartDateTime] = useState(defaultVoltageDateTime(-1, "00:00"));
  const [voltageEndDateTime, setVoltageEndDateTime] = useState(defaultVoltageDateTime(-1, "23:59"));
  const [voltageInterval, setVoltageInterval] = useState(5);
  const [voltageBus, setVoltageBus] = useState("voltageBus1");
  const [voltageDisplayMode, setVoltageDisplayMode] = useState("average_pu");
  const [voltageMasterStore, setVoltageMasterStore] = useState(readVoltageMasterStore);
  const [voltageReactorMap, setVoltageReactorMap] = useState(readVoltageReactorMapStore);
  const [voltageStations, setVoltageStations] = useState([]);
  const [selectedVoltageStations, setSelectedVoltageStations] = useState([]);
  const [voltageStationFilter, setVoltageStationFilter] = useState("");
  const [voltageNamesLoading, setVoltageNamesLoading] = useState(false);
  const [voltageLoading, setVoltageLoading] = useState(false);
  const [voltageError, setVoltageError] = useState("");
  const [voltageResult, setVoltageResult] = useState(null);
  const [reactorLoading, setReactorLoading] = useState(false);
  const [reactorError, setReactorError] = useState("");
  const [reactorResult, setReactorResult] = useState(null);
  const [reactorHover, setReactorHover] = useState(null);
  const chartsRef = useRef(null);

  const visibleSeries = result?.series || [];
  const pivotRows = useMemo(() => {
    const rows = result?.chart_rows || [];
    return rows.map((row) => {
      const item = { time: row.time };
      visibleSeries.forEach((series) => {
        item[series.key] = row[series.key];
      });
      return item;
    });
  }, [result, visibleSeries]);
  const seriesGroups = useMemo(() => {
    if (chartMode === "combined") {
      return [{ key: "combined", label: "Combined Comparison", series: visibleSeries }];
    }
    const groups = {};
    visibleSeries.forEach((series) => {
      const key = series.range_label || "Range";
      groups[key] = groups[key] || { key, label: key, series: [] };
      groups[key].series.push(series);
    });
    return Object.values(groups);
  }, [chartMode, visibleSeries]);
  const sourceWarnings = useMemo(
    () => (result?.source_meta || []).filter((item) => !item.available),
    [result]
  );
  const filteredVoltageStations = useMemo(() => {
    const needle = voltageStationFilter.trim().toUpperCase();
    const source = needle
      ? voltageStations.filter((station) => station.toUpperCase().includes(needle))
      : voltageStations;
    return source.slice(0, 80);
  }, [voltageStationFilter, voltageStations]);
  const voltageMasterNames = useMemo(() => Object.keys(voltageMasterStore).sort(), [voltageMasterStore]);
  const voltageChart = useMemo(() => {
    const rawRows = voltageResult?.chart_rows || [];
    const rows = rawRows.map((row) => ({
      ...row,
      timestamp: parseChartDateTime(row.time),
    }));
    const rawSeries = voltageResult?.series || [];
    const series = rawSeries.filter((item) => rows.some((row) => {
      const value = Number(row[item.key]);
      return Number.isFinite(value) && value > 0;
    }));
    if (!rows.length || !series.length || voltageDisplayMode === "individual") {
      return { rows, series, unit: "kV" };
    }
    const key = voltageDisplayMode === "average_pu" ? "avg_pu" : "avg_kv";
    const label = voltageDisplayMode === "average_pu"
      ? `${voltageResult?.master_point || "Selection"} Avg PU`
      : `${voltageResult?.master_point || "Selection"} Avg kV`;
    const averageRows = rows.map((row) => {
      const values = series
        .map((item) => {
          const rawValue = Number(row[item.key]);
          if (!Number.isFinite(rawValue)) return null;
          if (voltageDisplayMode === "average_pu") {
            const level = getVoltageLevel(item.station_name || item.label);
            return level ? rawValue / level : null;
          }
          return rawValue;
        })
        .filter((value) => Number.isFinite(value));
      const avg = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
      return {
        time: row.time,
        timestamp: row.timestamp,
        [key]: avg === null ? null : Number(avg.toFixed(voltageDisplayMode === "average_pu" ? 4 : 3)),
      };
    });
    return {
      rows: averageRows,
      series: [{ key, label }],
      unit: voltageDisplayMode === "average_pu" ? "PU" : "kV",
    };
  }, [voltageDisplayMode, voltageResult]);
  const voltageDomain = useMemo(() => {
    const values = voltageChart?.rows?.flatMap((row) => (voltageChart.series || []).map((series) => Number(row[series.key]))) || [];
    const valid = values.filter((value) => Number.isFinite(value));
    if (!valid.length) return ["auto", "auto"];
    const min = Math.min(...valid);
    const max = Math.max(...valid);
    const domainMin = voltageChart.unit === "PU" ? Math.min(min, 0.97) : min;
    const domainMax = voltageChart.unit === "PU" ? Math.max(max, 1.03) : max;
    const pad = voltageChart.unit === "PU" ? 0.01 : Math.max(1, (domainMax - domainMin) * 0.15);
    return [Number((domainMin - pad).toFixed(4)), Number((domainMax + pad).toFixed(4))];
  }, [voltageChart]);
  const voltagePuLimitDots = useMemo(() => {
    if (voltageChart.unit !== "PU") return { high: [], low: [] };
    const dots = { high: [], low: [] };
    (voltageChart.rows || []).forEach((row) => {
      (voltageChart.series || []).forEach((series) => {
        const value = Number(row[series.key]);
        if (!Number.isFinite(value)) return;
        const dot = {
          timestamp: row.timestamp,
          time: row.time,
          value,
          series_label: series.label,
        };
        if (value > 1.03) dots.high.push(dot);
        if (value < 0.97) dots.low.push(dot);
      });
    });
    return dots;
  }, [voltageChart]);
  const validVoltageSeries = useMemo(() => {
    const rawRows = voltageResult?.chart_rows || [];
    return (voltageResult?.series || []).filter((series) => rawRows.some((row) => {
      const value = Number(row[series.key]);
      return Number.isFinite(value) && value > 0;
    }));
  }, [voltageResult]);
  const mappedReactorStations = useMemo(() => selectedVoltageStations
    .map((station) => (voltageReactorMap[station] ?? inferReactorStationName(station)).trim())
    .filter(Boolean), [selectedVoltageStations, voltageReactorMap]);
  const voltageEventDots = useMemo(() => {
    const rows = voltageChart.rows || [];
    const series = voltageChart.series || [];
    const events = reactorResult?.events || [];
    if (!rows.length || !series.length || !events.length) return { open: [], close: [] };
    const timedRows = rows
      .map((row) => ({ row, ts: Number(row.timestamp) }))
      .filter((item) => Number.isFinite(item.ts));
    const dots = { open: [], close: [] };
    events.forEach((event) => {
      const eventTs = parseChartDateTime(event.time);
      if (!Number.isFinite(eventTs) || !timedRows.length) return;
      const nearest = timedRows.reduce((best, item) => (
        Math.abs(item.ts - eventTs) < Math.abs(best.ts - eventTs) ? item : best
      ), timedRows[0]);
      const mappedVoltageStation = selectedVoltageStations.find((station) => {
        const mapped = (voltageReactorMap[station] ?? inferReactorStationName(station)).trim().toUpperCase();
        return mapped && mapped === String(event.station || "").trim().toUpperCase();
      });
      const preferredSeries = voltageDisplayMode === "individual" && mappedVoltageStation
        ? (voltageResult?.series || []).find((item) => item.station_name === mappedVoltageStation || item.label === mappedVoltageStation)
        : series[0];
      const seriesKey = preferredSeries?.key || series[0]?.key;
      const yValue = Number(nearest.row[seriesKey]);
      if (!Number.isFinite(yValue)) return;
      const dot = {
        time: event.time,
        timestamp: eventTs,
        value: yValue,
        event_type: event.event_type,
        station: event.station,
        element_name: event.element_name,
        event_time: event.time,
      };
      if (event.event_type === "Open") dots.open.push(dot);
      if (event.event_type === "Close") dots.close.push(dot);
    });
    return dots;
  }, [reactorResult, selectedVoltageStations, voltageChart, voltageDisplayMode, voltageReactorMap, voltageResult]);
  const voltageEventDotsFlat = useMemo(() => ([
    ...voltageEventDots.open,
    ...voltageEventDots.close,
  ]), [voltageEventDots]);
  const baseSnapshot = snapshotResult?.ranges?.[0];
  const erSnapshot = baseSnapshot?.rows?.find((row) => row.state === "ER");
  const snapshotRanges = snapshotResult?.ranges || [];
  const outageRanges = outageResult?.ranges || [];
  const snapshotStates = ["ER", "BIHAR", "DVC", "JHARKHAND", "ODISHA", "SIKKIM", "WEST BENGAL"];
  const snapshotMetricColumns = [
    ["max_demand_met", "Max MW", "MW", (row) => [row?.max_demand_date, row?.max_demand_time].filter(Boolean).join(" ")],
    ["average_energy_consumption", "Avg MU", "MU/day"],
    ["total_consumption", "Total MU", "MU"],
    ["daily_maximum_consumption", "Max MU", "MU", (row) => row?.daily_maximum_consumption_date],
  ];

  useEffect(() => {
    if (!loading) return undefined;
    const steps = [
      "Calling /api/psp/mis/diurnal-curve",
      "Reading curve files from source folder",
      "Aligning time blocks",
      "Calculating average curves",
      "Formatting chart and table",
    ];
    let tick = 0;
    setProgress(8);
    setProgressText(steps[0]);
    const timer = setInterval(() => {
      tick += 1;
      setProgress((prev) => Math.min(prev + 7, 92));
      setProgressText(steps[Math.min(Math.floor(tick / 3), steps.length - 1)]);
    }, 700);
    return () => clearInterval(timer);
  }, [loading]);

  useEffect(() => {
    try {
      localStorage.setItem(VOLTAGE_MASTER_STORAGE_KEY, JSON.stringify(voltageMasterStore));
    } catch {
      // Browser storage can be unavailable in private sessions.
    }
  }, [voltageMasterStore]);

  useEffect(() => {
    try {
      localStorage.setItem(VOLTAGE_REACTOR_MAP_STORAGE_KEY, JSON.stringify(voltageReactorMap));
    } catch {
      // Browser storage can be unavailable in private sessions.
    }
  }, [voltageReactorMap]);

  const updateRange = (id, patch) => {
    setRanges((prev) => prev.map((range) => (range.id === id ? { ...range, ...patch } : range)));
  };

  const updateSnapshotCompareRange = (id, patch) => {
    setSnapshotCompareRanges((prev) => prev.map((range) => (range.id === id ? { ...range, ...patch } : range)));
  };

  const updateOutageCompareRange = (id, patch) => {
    setOutageCompareRanges((prev) => prev.map((range) => (range.id === id ? { ...range, ...patch } : range)));
  };

  const runReport = async () => {
    try {
      setLoading(true);
      setProgress(8);
      setProgressText("Calling /api/psp/mis/diurnal-curve");
      setLastApiStatus("Request started");
      setError("");
      const payload = {
        states: selectedStates,
        block_minutes: Number(blockMinutes) || 15,
        date_ranges: ranges.map(toPayloadRange),
      };
      const res = await API.getMisDiurnalCurve(payload);
      if (!res.success) throw new Error(res.message || "Unable to generate MIS diurnal curve.");
      setResult(res);
      setProgress(100);
      setProgressText("Report ready");
      setLastApiStatus(`Completed | ${res.date_count || 0} date(s), ${res.series?.length || 0} curve(s)`);
    } catch (err) {
      console.error("MIS diurnal report failed:", err);
      setError(err.message || "Unable to generate MIS diurnal curve.");
      setProgress(100);
      setProgressText("Failed");
      setLastApiStatus("API failed. Check backend log/network tab.");
    } finally {
      setLoading(false);
    }
  };

  const runSnapshotOutput = async () => {
    try {
      setSnapshotLoading(true);
      setSnapshotError("");
      const payload = {
        ranges: [
          { label: formatRangeLabel({ start_date: snapshotStartDate, end_date: snapshotEndDate }), start_date: snapshotStartDate, end_date: snapshotEndDate },
          ...snapshotCompareRanges.map((range) => ({
            label: formatRangeLabel(range),
            start_date: range.start_date,
            end_date: range.end_date,
          })),
        ],
      };
      const res = await API.getMisPspSnapshotOutput(payload);
      if (!res.success) throw new Error(res.message || "Unable to generate PSP snapshot output.");
      setSnapshotResult(res);
      setShowSnapshotDetails(true);
    } catch (err) {
      console.error("PSP snapshot output failed:", err);
      setSnapshotError(err.message || "Unable to generate PSP snapshot output.");
    } finally {
      setSnapshotLoading(false);
    }
  };

  const runOutageCategoryRange = async () => {
    try {
      setOutageLoading(true);
      setOutageError("");
      const payload = {
        ranges: [
          { label: formatRangeLabel({ start_date: outageStartDate, end_date: outageEndDate }), start_date: outageStartDate, end_date: outageEndDate },
          ...outageCompareRanges.map((range) => ({
            label: formatRangeLabel(range),
            start_date: range.start_date,
            end_date: range.end_date,
          })),
        ],
      };
      const res = await API.getOutageCategoryRange(payload);
      if (!res.success) throw new Error(res.message || "Unable to fetch outage category data.");
      setOutageResult(res);
      setOutageModalOpen(true);
    } catch (err) {
      console.error("Outage category range failed:", err);
      setOutageError(err.message || "Unable to fetch outage category data.");
    } finally {
      setOutageLoading(false);
    }
  };

  const loadVoltageStations = async () => {
    try {
      setVoltageNamesLoading(true);
      setVoltageError("");
      const res = await API.getMisVoltageNames(
        formatApiDateTime(voltageStartDateTime),
        formatApiDateTime(voltageEndDateTime)
      );
      if (!res.success) throw new Error(res.message || "Unable to fetch substation list.");
      setVoltageStations(res.stations || []);
      setSelectedVoltageStations((prev) => prev.filter((station) => (res.stations || []).includes(station)));
    } catch (err) {
      console.error("Voltage station fetch failed:", err);
      setVoltageError(err.message || "Unable to fetch substation list.");
    } finally {
      setVoltageNamesLoading(false);
    }
  };

  const toggleVoltageStation = (station) => {
    setSelectedVoltageStations((prev) => prev.includes(station)
      ? prev.filter((item) => item !== station)
      : [...prev, station]);
  };

  const updateVoltageReactorMap = (station, value) => {
    setVoltageReactorMap((prev) => ({
      ...prev,
      [station]: value,
    }));
  };

  const loadVoltageMasterSelection = (name) => {
    const stations = voltageMasterStore[name] || [];
    setVoltageMasterPoint(name);
    setSelectedVoltageStations(stations);
  };

  const saveVoltageMasterSelection = () => {
    const name = voltageMasterPoint.trim();
    if (!name) {
      setVoltageError("Enter a master point/city name before saving.");
      return;
    }
    setVoltageMasterStore((prev) => ({
      ...prev,
      [name]: selectedVoltageStations,
    }));
    setVoltageError("");
  };

  const deleteVoltageMasterSelection = () => {
    const name = voltageMasterPoint.trim();
    if (!name || !voltageMasterStore[name]) return;
    setVoltageMasterStore((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  };

  const runVoltageProfile = async () => {
    try {
      setVoltageLoading(true);
      setReactorLoading(true);
      setVoltageError("");
      setReactorError("");
      const payload = {
        master_point: voltageMasterPoint,
        start_date: formatApiDateTime(voltageStartDateTime),
        end_date: formatApiDateTime(voltageEndDateTime),
        station_names: selectedVoltageStations,
        time: Number(voltageInterval) || 5,
        voltage_bus: voltageBus,
      };
      const res = await API.getMisVoltageProfile(payload);
      if (!res.success) throw new Error(res.message || "Unable to fetch voltage profile.");
      setVoltageResult(res);
      if (mappedReactorStations.length) {
        const reactorRes = await API.getMisReactorSwitching({
          start_date: formatApiDateTime(voltageStartDateTime),
          end_date: formatApiDateTime(voltageEndDateTime),
          stations: mappedReactorStations,
        });
        if (!reactorRes.success) throw new Error(reactorRes.message || "Unable to fetch reactor switching.");
        setReactorResult(reactorRes);
      } else {
        setReactorResult(null);
      }
    } catch (err) {
      console.error("Voltage profile fetch failed:", err);
      setVoltageError(err.message || "Unable to fetch voltage profile.");
    } finally {
      setVoltageLoading(false);
      setReactorLoading(false);
    }
  };

  const downloadChartPng = async () => {
    if (!chartsRef.current) return;
    const canvas = await html2canvas(chartsRef.current, { backgroundColor: "#ffffff", scale: 2 });
    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = "MIS_Diurnal_Curve.png";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadCsv = () => {
    const rows = pivotRows;
    const csvRows = [
      ["Time Block", ...visibleSeries.map((series) => series.label)],
      ...rows.map((row) => [
        row.time,
        ...visibleSeries.map((series) => row[series.key] ?? ""),
      ]),
    ];
    const csv = csvRows
      .map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "MIS_Diurnal_Curve_Data.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const downloadSnapshotCsv = () => {
    const states = ["ER", "BIHAR", "DVC", "JHARKHAND", "ODISHA", "SIKKIM", "WEST BENGAL"];
    const rangeHeaders = snapshotRanges.flatMap((range) => [
      `${range.label} - Maximum Demand Met (MW)`,
      `${range.label} - Maximum Demand Met Date`,
      `${range.label} - Maximum Demand Met Time`,
      `${range.label} - Average Energy Consumption (MU/day)`,
      `${range.label} - Total Consumption (MU)`,
      `${range.label} - Daily Maximum Consumption (MU)`,
      `${range.label} - Daily Maximum Consumption Date`,
    ]);
    const headers = ["State", ...rangeHeaders];
    const csvRows = [
      headers,
      ...states.map((state) => [
        state,
        ...snapshotRanges.flatMap((range) => {
          const stateRow = range.rows?.find((row) => row.state === state);
          return [
            stateRow?.max_demand_met ?? "",
            stateRow?.max_demand_date ?? "",
            stateRow?.max_demand_time ?? "",
            stateRow?.average_energy_consumption ?? "",
            stateRow?.total_consumption ?? "",
            stateRow?.daily_maximum_consumption ?? "",
            stateRow?.daily_maximum_consumption_date ?? "",
          ];
        }),
      ]),
    ];
    const csv = csvRows
      .map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "MIS_PSP_Snapshot_Output.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const downloadSnapshotExcel = () => {
    const states = ["ER", "BIHAR", "DVC", "JHARKHAND", "ODISHA", "SIKKIM", "WEST BENGAL"];
    const rangeHeaders = snapshotRanges.flatMap((range) => [
      `${range.label} - Maximum Demand Met (MW)`,
      `${range.label} - Maximum Demand Met Date`,
      `${range.label} - Maximum Demand Met Time`,
      `${range.label} - Average Energy Consumption (MU/day)`,
      `${range.label} - Total Consumption (MU)`,
      `${range.label} - Daily Maximum Consumption (MU)`,
      `${range.label} - Daily Maximum Consumption Date`,
    ]);
    const rows = [
      ["State", ...rangeHeaders],
      ...states.map((state) => [
        state,
        ...snapshotRanges.flatMap((range) => {
          const stateRow = range.rows?.find((row) => row.state === state);
          return [
            stateRow?.max_demand_met ?? "",
            stateRow?.max_demand_date ?? "",
            stateRow?.max_demand_time ?? "",
            stateRow?.average_energy_consumption ?? "",
            stateRow?.total_consumption ?? "",
            stateRow?.daily_maximum_consumption ?? "",
            stateRow?.daily_maximum_consumption_date ?? "",
          ];
        }),
      ]),
    ];
    const html = `
      <html>
        <head><meta charset="utf-8" /></head>
        <body>
          <table border="1">
            ${rows.map((row, rowIndex) => `
              <tr>
                ${row.map((cell) => rowIndex === 0
                  ? `<th>${String(cell ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</th>`
                  : `<td>${String(cell ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</td>`
                ).join("")}
              </tr>
            `).join("")}
          </table>
        </body>
      </html>
    `;
    const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "MIS_PSP_Snapshot_Output.xls";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const downloadOutageExcel = () => {
    const summaryRows = [
      ["Category", ...outageRanges.flatMap((range) => [`${range.label} Count`, `${range.label} MW`])],
      ...OUTAGE_CATEGORIES.map(([key, label]) => [
        label,
        ...outageRanges.flatMap((range) => {
          const summary = range.summary?.[key] || {};
          return [summary.count || 0, summary.mw || 0];
        }),
      ]),
    ];

    const detailHeaders = [
      "Range",
      "Category",
      "Date",
      "Element",
      "Type",
      "Utility Type",
      "State",
      "MW",
      "Station",
      "Outage Date",
      "Outage Time",
      "Revival Date",
      "Revival Time",
      "Expected Revival Date",
      "Expected Revival Time",
      "Reason",
      "Mapped",
    ];
    const detailRows = [
      detailHeaders,
      ...outageRanges.flatMap((range) => OUTAGE_CATEGORIES.flatMap(([key, label]) => {
        const rows = range.categories?.[key] || [];
        return rows.map((row) => [
          range.label,
          label,
          row.date || "",
          row.element_name || "",
          row.type || "",
          row.utility_type || "",
          row.state_name || "",
          row.installed_capacity ?? "",
          row.generating_station || "",
          row.outage_date || "",
          row.outage_time || "",
          row.revival_date || "",
          row.revival_time || "",
          row.expected_revival_date || "",
          row.expected_revival_time || "",
          row.reason || "",
          row.mapped ? "Yes" : "No",
        ]);
      })),
    ];

    const unmappedRows = [
      ["Range", "Date", "Element", "Type", "MW", "Reason"],
      ...outageRanges.flatMap((range) => (range.unmapped || []).map((row) => [
        range.label,
        row.date || "",
        row.element_name || "",
        row.type || "",
        row.installed_capacity ?? "",
        row.reason || "",
      ])),
    ];

    const tableHtml = (title, rows) => `
      <h3>${escapeHtml(title)}</h3>
      <table border="1">
        ${rows.map((row, rowIndex) => `
          <tr>
            ${row.map((cell) => rowIndex === 0
              ? `<th>${escapeHtml(cell)}</th>`
              : `<td>${escapeHtml(cell)}</td>`
            ).join("")}
          </tr>
        `).join("")}
      </table>
      <br/>
    `;

    const html = `
      <html>
        <head><meta charset="utf-8" /></head>
        <body>
          ${tableHtml("Outage Category Summary", summaryRows)}
          ${tableHtml("Outage Category Details", detailRows)}
          ${tableHtml("Unmapped Rows", unmappedRows)}
        </body>
      </html>
    `;
    const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "MIS_Generator_Outage_Category_Output.xls";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const renderChart = (seriesList, title) => (
    <div className="rounded-3 border bg-white p-2 mb-3" style={{ height: 340 }}>
      <div className="px-2 pb-1 fw-bold text-dark" style={{ fontSize: "0.82rem" }}>{title}</div>
      <ResponsiveContainer width="100%" height="94%">
        <LineChart data={result.chart_rows} margin={{ top: 12, right: 24, left: 0, bottom: 10 }}>
          <CartesianGrid {...CHART_GRID_PROPS} />
          <XAxis dataKey="time" tick={{ fontSize: 10 }} minTickGap={18} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={formatMw} />
          <Tooltip {...CHART_TOOLTIP_PROPS} formatter={(value, name) => [`${formatMw(value)} MW`, name]} labelFormatter={(label) => `Time: ${label}`} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {seriesList.map((series, index) => (
            <Line
              key={series.key}
              type="monotone"
              dataKey={series.key}
              name={series.label}
              stroke={COLORS[index % COLORS.length]}
              strokeWidth={2.1}
              dot={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );

  const renderReactorMarker = ({ cx, cy, payload }) => {
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;
    const isOpen = payload?.event_type === "Open";
    const fill = isOpen ? "#E11D48" : "#A855F7";
    const stroke = isOpen ? "#7F1D1D" : "#4C1D95";
    const title = [
      `Reactor ${payload?.event_type || ""}`,
      payload?.station,
      payload?.event_time || payload?.time,
      payload?.element_name,
    ].filter(Boolean).join("\n");
    return (
      <g
        style={{ cursor: "pointer" }}
        onMouseEnter={() => setReactorHover({ ...payload, cx, cy })}
        onMouseMove={() => setReactorHover({ ...payload, cx, cy })}
        onMouseLeave={() => setReactorHover(null)}
      >
        <title>{title}</title>
        <circle cx={cx} cy={cy} r={17} fill="transparent" />
        <circle cx={cx} cy={cy} r={9} fill={fill} stroke="#FFFFFF" strokeWidth={3} />
        <circle cx={cx} cy={cy} r={12} fill="none" stroke={stroke} strokeWidth={2} opacity={0.9} />
        <circle cx={cx} cy={cy} r={4} fill="#FFFFFF" opacity={0.95} />
      </g>
    );
  };

  const renderVoltageChart = () => (
    <div className="rounded-3 border bg-white p-2 position-relative" style={{ height: 360 }}>
      <div className="px-2 pb-1 fw-bold text-dark" style={{ fontSize: "0.82rem" }}>
        {voltageResult?.master_point || "Master Point"} Voltage Profile
      </div>
      {reactorHover && (
        <div
          className="position-absolute rounded-3 border bg-white px-2 py-2 shadow-lg"
          style={{
            left: Math.min(Math.max(Number(reactorHover.cx) + 18, 8), 760),
            top: Math.max(Number(reactorHover.cy) + 34, 30),
            zIndex: 10,
            maxWidth: 360,
            fontSize: "0.72rem",
            pointerEvents: "none",
            borderColor: reactorHover.event_type === "Open" ? "#FDA4AF" : "#C084FC",
          }}
        >
          <div className="fw-bold" style={{ color: reactorHover.event_type === "Open" ? "#BE123C" : "#7E22CE" }}>
            Reactor {reactorHover.event_type}
          </div>
          <div className="text-dark fw-bold">{reactorHover.station || "-"}</div>
          <div className="text-secondary">{reactorHover.event_time || reactorHover.time || "-"}</div>
          <div className="text-secondary" style={{ whiteSpace: "normal" }}>{reactorHover.element_name || "-"}</div>
        </div>
      )}
      <ResponsiveContainer width="100%" height="94%">
        <ComposedChart data={voltageChart.rows} margin={{ top: 12, right: 24, left: 0, bottom: 10 }}>
          <CartesianGrid {...CHART_GRID_PROPS} />
          <XAxis
            dataKey="timestamp"
            type="number"
            domain={["dataMin", "dataMax"]}
            tick={{ fontSize: 10 }}
            minTickGap={18}
            tickFormatter={(value) => new Date(value).toLocaleString("en-IN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
          />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={formatMw} domain={voltageDomain} allowDataOverflow />
          {voltageChart.unit === "PU" && (
            <>
              <ReferenceLine y={1.03} stroke="#F97316" strokeDasharray="4 4" label={{ value: "1.03 PU", fontSize: 10, fill: "#C2410C" }} />
              <ReferenceLine y={0.97} stroke="#7C3AED" strokeDasharray="4 4" label={{ value: "0.97 PU", fontSize: 10, fill: "#6D28D9" }} />
            </>
          )}
          <Tooltip
            formatter={(value, name) => [`${formatMw(value)} ${voltageChart.unit}`, name]}
            labelFormatter={(label) => `Time: ${new Date(label).toLocaleString("en-IN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`}
            content={({ active, payload, label }) => {
              if (reactorHover) return null;
              if (!active || !payload?.length) return null;
              const labelTs = Number(label);
              const reactorItems = payload.filter((item) => item?.payload?.event_type);
              const reactorPayloads = reactorItems.length
                ? reactorItems.map((item) => item.payload)
                : voltageEventDotsFlat.filter((item) => Number.isFinite(labelTs) && Math.abs(Number(item.timestamp) - labelTs) <= 60000);
              return (
                <div className="rounded-3 border bg-white px-2 py-1 shadow-sm" style={{ fontSize: "0.72rem" }}>
                  <div className="fw-bold text-dark">Time: {new Date(label).toLocaleString("en-IN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</div>
                  {reactorPayloads.length > 0 && (
                    <div className="mt-1">
                      {reactorPayloads.map((item, index) => {
                        const isOpen = item.event_type === "Open";
                        return (
                          <div
                            key={`${item.event_type}-${item.element_name}-${index}`}
                            className="rounded-3 px-2 py-1 mb-1"
                            style={{
                              backgroundColor: isOpen ? "#FFF1F2" : "#ECFDF5",
                              border: `1px solid ${isOpen ? "#FDA4AF" : "#86EFAC"}`,
                            }}
                          >
                            <div className="fw-bold" style={{ color: isOpen ? "#BE123C" : "#047857" }}>
                              Reactor {item.event_type}
                            </div>
                            <div className="text-dark fw-bold">{item.station || "-"}</div>
                            <div className="text-secondary">{item.event_time || item.time || "-"}</div>
                            <div className="text-secondary" style={{ maxWidth: 360, whiteSpace: "normal" }}>{item.element_name || "-"}</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {payload.filter((item) => !item?.payload?.event_type).slice(0, 6).map((item) => (
                    <div key={`${item.name}-${item.value}`} style={{ color: item.color }}>
                      {item.name}: {formatMw(item.value)} {voltageChart.unit}
                    </div>
                  ))}
                  {payload.filter((item) => item?.payload?.limit_type).map((item, index) => (
                    <div key={`${item.name}-${index}`} className="text-muted border-top mt-1 pt-1">
                      <span className="fw-bold text-dark">{item.payload.limit_type}</span>
                      <div>{item.payload.series_label}: {formatMw(item.payload.value)} PU</div>
                    </div>
                  ))}
                </div>
              );
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {voltageChart.series.map((series, index) => (
            <Line
              key={series.key}
              type="monotone"
              dataKey={series.key}
              name={series.label}
              stroke={COLORS[index % COLORS.length]}
              strokeWidth={2}
              dot={false}
              connectNulls
            />
          ))}
          {voltageChart.unit === "PU" && (
            <>
              <Scatter name="PU > 1.03" data={voltagePuLimitDots.high.map((item) => ({ ...item, limit_type: "High PU" }))} dataKey="value" fill="#F97316" shape="circle" />
              <Scatter name="PU < 0.97" data={voltagePuLimitDots.low.map((item) => ({ ...item, limit_type: "Low PU" }))} dataKey="value" fill="#7C3AED" shape="circle" />
            </>
          )}
          <Scatter name="Reactor Open" data={voltageEventDots.open} dataKey="value" fill="#E11D48" shape={renderReactorMarker} />
          <Scatter name="Reactor Close" data={voltageEventDots.close} dataKey="value" fill="#A855F7" shape={renderReactorMarker} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );

  return (
    <AppShell>
      <div className="container-fluid theme-page-container ui-kit-page" style={{ padding: 24 }}>
        <div
          className="theme-glass-card border-0 text-white mb-3"
          style={{
            background: "linear-gradient(135deg, #022726 0%, #03624C 55%, #17876D 100%)",
            borderRadius: 14,
            padding: "12px 18px",
          }}
        >
          <div className="d-flex align-items-center justify-content-between gap-3 flex-wrap">
            <div>
              <div className="badge rounded-pill fw-bold text-dark mb-2" style={{ backgroundColor: "#00DF81", fontSize: "0.68rem", letterSpacing: "0.05em" }}>
                GENERIC MIS REPORT
              </div>
              <h1 className="fw-bold mb-1" style={{ fontSize: "1.18rem" }}>MIS Report Workspace</h1>
              <p className="mb-0" style={{ color: "#D1FAE5", fontSize: "0.82rem" }}>
                Compact PSP snapshot outputs and curve-file based diurnal demand comparison.
              </p>
            </div>
          </div>
        </div>

        <div className="theme-glass-card p-2 mb-3">
          <div className="d-flex align-items-center justify-content-between gap-2 flex-wrap mb-1">
            <div>
              <h2 className="h6 fw-bold text-dark mb-0 d-flex align-items-center gap-2">
                <BarChart3 size={15} className="text-success" />
                PSP Snapshot Data Output
              </h2>
              <p className="small text-muted mb-0" style={{ fontSize: "0.7rem" }}>
                Mongo source: pspstatedemandrequirement.MAX_DEMAND and pspstateloaddetailsER.CONSUMPTION
              </p>
            </div>
            <div className="d-flex gap-2">
              <button className="btn btn-sm theme-btn-outline d-flex align-items-center gap-1" onClick={downloadSnapshotCsv} disabled={!baseSnapshot?.rows?.length}>
                <FileSpreadsheet size={13} />
                CSV
              </button>
              <button className="btn btn-sm theme-btn-outline d-flex align-items-center gap-1" onClick={downloadSnapshotExcel} disabled={!baseSnapshot?.rows?.length}>
                <FileSpreadsheet size={13} />
                Excel
              </button>
              <button className="btn btn-sm theme-btn-primary d-flex align-items-center gap-1" onClick={runSnapshotOutput} disabled={snapshotLoading}>
                <RefreshCw size={13} className={snapshotLoading ? "animate-spin-custom" : ""} />
                Generate
              </button>
            </div>
          </div>

          <div className="row g-2 align-items-end">
            <div className="col-12 col-lg-4">
              <label className="form-label small fw-bold text-secondary mb-1">Date Range</label>
              <CalendarInput mode="range" className="form-control theme-input py-1" value={snapshotStartDate} endValue={snapshotEndDate} onRangeChange={(start, end) => { setSnapshotStartDate(start); setSnapshotEndDate(end); }} />
            </div>
            <div className="col-12 col-lg-2">
              <button
                type="button"
                className="btn btn-sm theme-btn-outline w-100 d-flex align-items-center justify-content-center gap-1"
                onClick={() => setSnapshotCompareRanges((prev) => [...prev, defaultSnapshotCompareRange(prev.length + 1)])}
              >
                <Plus size={13} />
                Add compare
              </button>
            </div>
            <div className="col-12 col-lg">
              <button
                type="button"
                className="btn btn-sm theme-btn-outline w-100 d-flex align-items-center justify-content-center gap-1"
                onClick={() => setShowSnapshotDetails((prev) => !prev)}
                disabled={!baseSnapshot?.rows?.length}
              >
                <ChevronDown size={13} style={{ transform: showSnapshotDetails ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 160ms ease" }} />
                Details
              </button>
            </div>
          </div>

          {snapshotCompareRanges.length > 0 && (
            <div className="d-flex flex-column gap-2 mt-2">
              {snapshotCompareRanges.map((range, index) => (
                <div key={range.id} className="row g-2 align-items-end rounded-3 border bg-light mx-0 p-2">
                  <div className="col-12 col-lg-2">
                    <div className="fw-bold text-secondary" style={{ fontSize: "0.72rem" }}>Compare {index + 1}</div>
                    <div className="text-muted" style={{ fontSize: "0.68rem" }}>{formatRangeLabel(range)}</div>
                  </div>
                  <div className="col-12 col-lg-4">
                    <label className="form-label small fw-bold text-secondary mb-1">Range</label>
                    <CalendarInput mode="range" className="form-control theme-input" value={range.start_date} endValue={range.end_date} onRangeChange={(start, end) => updateSnapshotCompareRange(range.id, { start_date: start, end_date: end })} />
                  </div>
                  <div className="col-12 col-lg-auto">
                    <button
                      type="button"
                      className="btn btn-sm btn-light border d-flex align-items-center gap-1"
                      onClick={() => setSnapshotCompareRanges((prev) => prev.filter((item) => item.id !== range.id))}
                    >
                      <Trash2 size={13} />
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {snapshotLoading && (
            <div className="progress mt-2" style={{ height: 7 }}>
              <div className="progress-bar progress-bar-striped progress-bar-animated bg-success" style={{ width: "72%" }} />
            </div>
          )}
          {snapshotError && <div className="alert alert-warning py-2 mt-2 mb-0 small">{snapshotError}</div>}

          {snapshotRanges.length > 0 && (
            <div className="rounded-3 border bg-light px-2 py-1 mt-2">
              <div className="fw-bold text-secondary mb-1" style={{ fontSize: "0.68rem" }}>Fetched Mongo snapshot data</div>
              <div className="d-flex flex-wrap gap-2">
                {snapshotRanges.map((range) => (
                  <div key={range.label} className="rounded-3 bg-white border px-2 py-1" style={{ fontSize: "0.7rem" }}>
                    <span className="fw-bold text-dark">{range.label}</span>
                    <span className="text-muted ms-2">fetched {range.date_count}/{range.expected_date_count}</span>
                    {range.missing_dates?.length > 0 && (
                      <span className="text-danger fw-bold ms-2">
                        missing: {range.missing_dates.slice(0, 4).join(", ")}{range.missing_dates.length > 4 ? "..." : ""}
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <div className="text-muted mt-1" style={{ fontSize: "0.68rem" }}>
                Maximum demand: pspstatedemandrequirement.MAX_DEMAND | Energy: pspstateloaddetailsER.CONSUMPTION | ER energy: sum of state consumption rows
              </div>
            </div>
          )}

          <div className="row g-2 mt-2">
            {[
              ["Maximum Demand Met", erSnapshot?.max_demand_met, "MW"],
              ["Average Energy Consumption", erSnapshot?.average_energy_consumption, "MU/day"],
              ["Total Consumption", erSnapshot?.total_consumption, "MU"],
              ["Daily Maximum Consumption", erSnapshot?.daily_maximum_consumption, "MU"],
            ].map(([label, value, unit]) => {
              return (
                <div key={label} className="col-6 col-xl-3">
                  <div className="rounded-3 border bg-white px-2 py-1 h-100">
                    <div className="text-muted fw-bold text-uppercase" style={{ fontSize: "0.58rem" }}>{label}</div>
                    <div className="fw-black text-dark" style={{ fontSize: "0.92rem" }}>
                      {formatMw(value)} <span className="text-muted" style={{ fontSize: "0.68rem" }}>{unit}</span>
                    </div>
                    {snapshotRanges.length > 1 && (
                      <div className="text-muted fw-bold" style={{ fontSize: "0.7rem" }}>
                        {snapshotRanges.length - 1} compare range{snapshotRanges.length > 2 ? "s" : ""}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {showSnapshotDetails && baseSnapshot?.rows?.length && (
            <div className="table-responsive mt-2" style={{ maxHeight: "34vh", overflow: "auto" }}>
              <table className="table table-sm table-hover align-middle mb-0" style={{ fontSize: "0.74rem" }}>
                <thead style={{ position: "sticky", top: 0, zIndex: 1 }}>
                  <tr>
                    <th rowSpan="2" className="text-start bg-white" style={{ minWidth: 105 }}>State</th>
                    {snapshotRanges.map((range) => (
                      <th key={range.label} colSpan={snapshotMetricColumns.length} className="text-center bg-white">
                        {range.label}
                      </th>
                    ))}
                  </tr>
                  <tr>
                    {snapshotRanges.flatMap((range) =>
                      snapshotMetricColumns.map(([, label]) => (
                        <th key={`${range.label}-${label}`} className="text-end bg-white" style={{ minWidth: 96 }}>
                          {label}
                        </th>
                      ))
                    )}
                  </tr>
                </thead>
                <tbody>
                  {snapshotStates.map((state) => (
                    <tr key={`snapshot-matrix-${state}`}>
                      <td className="fw-bold text-start">{state}</td>
                      {snapshotRanges.flatMap((range) => {
                        const row = range.rows?.find((item) => item.state === state);
                        return snapshotMetricColumns.map(([key, , unit, subTextFn]) => {
                          const subText = typeof subTextFn === "function" ? subTextFn(row) : "";
                          return (
                            <td key={`${range.label}-${state}-${key}`} className="text-end font-monospace">
                              <span className="fw-bold">{formatMw(row?.[key])}</span>
                              <span className="text-muted ms-1" style={{ fontSize: "0.62rem" }}>{unit}</span>
                              {subText && <span className="d-block text-muted" style={{ fontSize: "0.58rem", lineHeight: 1.05 }}>{subText}</span>}
                            </td>
                          );
                        });
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {false && showSnapshotDetails && baseSnapshot?.rows?.length && (
            <div className="table-responsive mt-3" style={{ maxHeight: "36vh", overflow: "auto" }}>
              <table className="table table-sm table-hover align-middle mb-0">
                <thead style={{ position: "sticky", top: 0, zIndex: 1 }}>
                  {snapshotResult?.comparison_rows?.length ? (
                    <tr>
                      <th>State</th>
                      <th className="text-end">Base Max Demand</th>
                      <th className="text-end">Compare Max Demand</th>
                      <th className="text-end">Δ Demand</th>
                      <th className="text-end">Base Avg MU</th>
                      <th className="text-end">Compare Avg MU</th>
                      <th className="text-end">Δ Avg MU</th>
                      <th className="text-end">Base Total MU</th>
                      <th className="text-end">Compare Total MU</th>
                      <th className="text-end">Δ Total MU</th>
                      <th className="text-end">Base Daily Max MU</th>
                      <th className="text-end">Compare Daily Max MU</th>
                      <th className="text-end">Δ Daily Max MU</th>
                    </tr>
                  ) : (
                    <tr>
                      <th>State</th>
                      <th className="text-end">Maximum Demand Met</th>
                      <th>Date / Time</th>
                      <th className="text-end">Average Energy Consumption</th>
                      <th className="text-end">Total Consumption</th>
                      <th className="text-end">Daily Maximum Consumption</th>
                      <th>Daily Max Date</th>
                    </tr>
                  )}
                </thead>
                <tbody>
                  {snapshotResult?.comparison_rows?.length ? snapshotResult.comparison_rows.map((row) => (
                    <tr key={row.state}>
                      <td className="fw-bold">{row.state}</td>
                      <td className="text-end font-monospace">{formatMw(row.base_max_demand_met)}</td>
                      <td className="text-end font-monospace">{formatMw(row.compare_max_demand_met)}</td>
                      <td className="text-end font-monospace">{formatMw(row.delta_max_demand_met)}</td>
                      <td className="text-end font-monospace">{formatMw(row.base_average_energy_consumption)}</td>
                      <td className="text-end font-monospace">{formatMw(row.compare_average_energy_consumption)}</td>
                      <td className="text-end font-monospace">{formatMw(row.delta_average_energy_consumption)}</td>
                      <td className="text-end font-monospace">{formatMw(row.base_total_consumption)}</td>
                      <td className="text-end font-monospace">{formatMw(row.compare_total_consumption)}</td>
                      <td className="text-end font-monospace">{formatMw(row.delta_total_consumption)}</td>
                      <td className="text-end font-monospace">{formatMw(row.base_daily_maximum_consumption)}</td>
                      <td className="text-end font-monospace">{formatMw(row.compare_daily_maximum_consumption)}</td>
                      <td className="text-end font-monospace">{formatMw(row.delta_daily_maximum_consumption)}</td>
                    </tr>
                  )) : baseSnapshot.rows.map((row) => (
                    <tr key={row.state}>
                      <td className="fw-bold">{row.state}</td>
                      <td className="text-end font-monospace">{formatMw(row.max_demand_met)}</td>
                      <td>{row.max_demand_date || "-"} {row.max_demand_time || ""}</td>
                      <td className="text-end font-monospace">{formatMw(row.average_energy_consumption)}</td>
                      <td className="text-end font-monospace">{formatMw(row.total_consumption)}</td>
                      <td className="text-end font-monospace">{formatMw(row.daily_maximum_consumption)}</td>
                      <td>{row.daily_maximum_consumption_date || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="theme-glass-card p-3 mb-3">
          <div className="d-flex align-items-center justify-content-between gap-2 flex-wrap mb-2">
            <div>
              <h2 className="h6 fw-bold text-dark mb-0 d-flex align-items-center gap-2">
                <BarChart3 size={15} className="text-danger" />
                Generator Outage Category Output
              </h2>
              <p className="small text-muted mb-0">
                Portal outage data mapped with unit_data.Unit_Name. Includes units with capacity greater than 500 MW.
              </p>
            </div>
            <div className="d-flex gap-2">
              <button className="btn btn-sm theme-btn-outline d-flex align-items-center gap-1" onClick={downloadOutageExcel} disabled={!outageResult?.ranges?.length}>
                <FileSpreadsheet size={13} />
                Excel
              </button>
              <button className="btn btn-sm theme-btn-outline" onClick={() => setOutageModalOpen(true)} disabled={!outageResult?.ranges?.length}>
                Details
              </button>
              <button className="btn btn-sm theme-btn-primary d-flex align-items-center gap-1" onClick={runOutageCategoryRange} disabled={outageLoading}>
                <RefreshCw size={13} className={outageLoading ? "animate-spin-custom" : ""} />
                Fetch
              </button>
            </div>
          </div>

          <div className="row g-2 align-items-end">
            <div className="col-12 col-lg-4">
              <label className="form-label small fw-bold text-secondary mb-1">Date Range</label>
              <CalendarInput mode="range" className="form-control theme-input" value={outageStartDate} endValue={outageEndDate} onRangeChange={(start, end) => { setOutageStartDate(start); setOutageEndDate(end); }} />
            </div>
            <div className="col-12 col-lg-2">
              <button
                type="button"
                className="btn btn-sm theme-btn-outline w-100 d-flex align-items-center justify-content-center gap-1"
                onClick={() => setOutageCompareRanges((prev) => [...prev, defaultOutageCompareRange(prev.length + 1)])}
              >
                <Plus size={13} />
                Add compare
              </button>
            </div>
            <div className="col-12 col-lg">
              <div className="rounded-3 border bg-light px-2 py-2 text-muted fw-bold" style={{ fontSize: "0.72rem" }}>
                Categories: State_Planned, State_Forced, Central_Planned, Central_Forced
              </div>
            </div>
          </div>

          {outageCompareRanges.length > 0 && (
            <div className="d-flex flex-column gap-2 mt-2">
              {outageCompareRanges.map((range, index) => (
                <div key={range.id} className="row g-2 align-items-end rounded-3 border bg-light mx-0 p-2">
                  <div className="col-12 col-lg-2">
                    <div className="fw-bold text-secondary" style={{ fontSize: "0.72rem" }}>Compare {index + 1}</div>
                    <div className="text-muted" style={{ fontSize: "0.68rem" }}>{formatRangeLabel(range)}</div>
                  </div>
                  <div className="col-12 col-lg-4">
                    <label className="form-label small fw-bold text-secondary mb-1">Range</label>
                    <CalendarInput mode="range" className="form-control theme-input" value={range.start_date} endValue={range.end_date} onRangeChange={(start, end) => updateOutageCompareRange(range.id, { start_date: start, end_date: end })} />
                  </div>
                  <div className="col-12 col-lg-auto">
                    <button type="button" className="btn btn-sm btn-light border d-flex align-items-center gap-1" onClick={() => setOutageCompareRanges((prev) => prev.filter((item) => item.id !== range.id))}>
                      <Trash2 size={13} />
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {outageLoading && (
            <div className="progress mt-2" style={{ height: 7 }}>
              <div className="progress-bar progress-bar-striped progress-bar-animated bg-danger" style={{ width: "72%" }} />
            </div>
          )}
          {outageError && <div className="alert alert-warning py-2 mt-2 mb-0 small">{outageError}</div>}

          {outageRanges.length > 0 && (
            <>
              <div className="row g-2 mt-2">
                {OUTAGE_CATEGORIES.map(([key, label]) => {
                  const primary = outageRanges[0]?.summary?.[key] || {};
                  const showRangeBreakdown = outageRanges.length > 1;
                  return (
                    <div key={key} className="col-6 col-xl-3">
                      <button
                        type="button"
                        className="rounded-3 border bg-white px-3 py-2 h-100 w-100 text-start"
                        onClick={() => {
                          setActiveOutageCategory(key);
                          setOutageModalOpen(true);
                        }}
                      >
                        <div className="text-muted fw-bold text-uppercase" style={{ fontSize: "0.64rem" }}>{label}</div>
                        {showRangeBreakdown ? (
                          <div className="mt-1 d-flex flex-column gap-1">
                            <div className="d-grid text-muted fw-bold text-uppercase" style={{ gridTemplateColumns: "1fr 42px 72px", gap: 6, fontSize: "0.58rem" }}>
                              <span>Range</span>
                              <span className="text-end">No</span>
                              <span className="text-end">MW</span>
                            </div>
                            {outageRanges.map((range) => {
                              const summary = range.summary?.[key] || {};
                              return (
                                <div
                                  key={`${key}-${range.label}`}
                                  className="d-grid align-items-center border-top pt-1"
                                  style={{ gridTemplateColumns: "1fr 42px 72px", gap: 6, fontSize: "0.66rem" }}
                                >
                                  <span className="text-dark fw-bold text-truncate" title={range.label}>{range.label}</span>
                                  <span className="text-end text-muted fw-bold">{summary.count || 0}</span>
                                  <span className="text-end text-dark fw-bold font-monospace">{formatMw(summary.mw)}</span>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <>
                            <div className="fw-black text-dark" style={{ fontSize: "1.05rem" }}>{formatMw(primary.mw)} MW</div>
                            <div className="text-muted fw-bold" style={{ fontSize: "0.7rem" }}>{primary.count || 0} unit rows</div>
                          </>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
              <div className="rounded-3 border bg-light px-3 py-2 mt-2">
                <div className="fw-bold text-secondary mb-1" style={{ fontSize: "0.72rem" }}>Fetched outage source data</div>
                <div className="d-flex flex-wrap gap-2">
                  {outageRanges.map((range) => (
                    <div key={range.label} className="rounded-3 bg-white border px-2 py-1" style={{ fontSize: "0.7rem" }}>
                      <span className="fw-bold text-dark">{range.label}</span>
                      <span className="text-muted ms-2">fetched {range.fetched_dates?.length || 0}/{range.expected_dates?.length || 0}</span>
                      {range.missing_dates?.length > 0 && (
                        <span className="text-danger fw-bold ms-2">missing: {range.missing_dates.slice(0, 4).join(", ")}{range.missing_dates.length > 4 ? "..." : ""}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="row g-3 mb-3">
          <div className="col-12 col-xl-4">
            <div className="theme-glass-card p-2 h-100">
              <h2 className="h6 fw-bold text-dark mb-2 d-flex align-items-center gap-2" style={{ fontSize: "0.92rem" }}>
                <BarChart3 size={15} className="text-primary" />
                Master Point Voltage Profile
              </h2>
              <div className="row g-1 mb-2">
                <div className="col-6">
                  <label className="form-label fw-bold text-secondary mb-1" style={{ fontSize: "0.66rem" }}>Saved</label>
                  <select
                    className="form-select theme-input py-1"
                    value={voltageMasterStore[voltageMasterPoint] ? voltageMasterPoint : ""}
                    onChange={(event) => {
                      if (event.target.value) loadVoltageMasterSelection(event.target.value);
                    }}
                    style={{ fontSize: "0.72rem" }}
                  >
                    <option value="">New / unsaved master point</option>
                    {voltageMasterNames.map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                </div>
                <div className="col-6">
                  <label className="form-label fw-bold text-secondary mb-1" style={{ fontSize: "0.66rem" }}>Master Point / City</label>
                  <input className="form-control theme-input py-1" value={voltageMasterPoint} onChange={(event) => setVoltageMasterPoint(event.target.value)} style={{ fontSize: "0.72rem" }} />
                </div>
                <div className="col-6">
                  <label className="form-label fw-bold text-secondary mb-1" style={{ fontSize: "0.66rem" }}>From</label>
                  <CalendarInput includeTime className="form-control theme-input py-1" value={voltageStartDateTime} onChange={setVoltageStartDateTime} style={{ fontSize: "0.72rem" }} />
                </div>
                <div className="col-6">
                  <label className="form-label fw-bold text-secondary mb-1" style={{ fontSize: "0.66rem" }}>To</label>
                  <CalendarInput includeTime className="form-control theme-input py-1" value={voltageEndDateTime} onChange={setVoltageEndDateTime} style={{ fontSize: "0.72rem" }} />
                </div>
                <div className="col-4">
                  <label className="form-label fw-bold text-secondary mb-1" style={{ fontSize: "0.66rem" }}>Interval</label>
                  <select className="form-select theme-input py-1" value={voltageInterval} onChange={(event) => setVoltageInterval(event.target.value)} style={{ fontSize: "0.72rem" }}>
                    <option value={5}>5 minutes</option>
                    <option value={10}>10 minutes</option>
                    <option value={15}>15 minutes</option>
                  </select>
                </div>
                <div className="col-4">
                  <label className="form-label fw-bold text-secondary mb-1" style={{ fontSize: "0.66rem" }}>Bus</label>
                  <select className="form-select theme-input py-1" value={voltageBus} onChange={(event) => setVoltageBus(event.target.value)} style={{ fontSize: "0.72rem" }}>
                    <option value="voltageBus1">Voltage Bus 1</option>
                    <option value="voltageBus2">Voltage Bus 2</option>
                  </select>
                </div>
                <div className="col-4">
                  <label className="form-label fw-bold text-secondary mb-1" style={{ fontSize: "0.66rem" }}>Output</label>
                  <select className="form-select theme-input py-1" value={voltageDisplayMode} onChange={(event) => setVoltageDisplayMode(event.target.value)} style={{ fontSize: "0.72rem" }}>
                    <option value="average_pu">Average PU</option>
                    <option value="average_kv">Average kV</option>
                    <option value="individual">Individual kV</option>
                  </select>
                </div>
              </div>

              <div className="d-flex gap-1 mb-2">
                <button type="button" className="btn btn-sm theme-btn-outline flex-fill d-flex align-items-center justify-content-center gap-1 py-1" onClick={loadVoltageStations} disabled={voltageNamesLoading} style={{ fontSize: "0.72rem" }}>
                  <RefreshCw size={13} className={voltageNamesLoading ? "animate-spin-custom" : ""} />
                  Load
                </button>
                <button type="button" className="btn btn-sm theme-btn-outline py-1" onClick={saveVoltageMasterSelection} style={{ fontSize: "0.72rem" }}>
                  Save
                </button>
                <button type="button" className="btn btn-sm btn-light border py-1" onClick={deleteVoltageMasterSelection} disabled={!voltageMasterStore[voltageMasterPoint]} style={{ fontSize: "0.72rem" }}>
                  Delete
                </button>
                <button type="button" className="btn btn-sm theme-btn-outline py-1" onClick={() => setSelectedVoltageStations([])} disabled={!selectedVoltageStations.length} style={{ fontSize: "0.72rem" }}>
                  Clear
                </button>
              </div>

              <input
                className="form-control theme-input py-1 mb-1"
                placeholder="Search substation"
                value={voltageStationFilter}
                onChange={(event) => setVoltageStationFilter(event.target.value)}
                style={{ fontSize: "0.72rem" }}
              />

              <div className="rounded-3 border bg-white px-2 py-1" style={{ maxHeight: 170, overflow: "auto" }}>
                {filteredVoltageStations.map((station) => {
                  const checked = selectedVoltageStations.includes(station);
                  return (
                    <label key={station} className="d-flex align-items-center gap-2 py-0 mb-0" style={{ cursor: "pointer", fontSize: "0.68rem", fontWeight: 700, minHeight: 22 }}>
                      <input type="checkbox" checked={checked} onChange={() => toggleVoltageStation(station)} style={{ accentColor: "#03624C" }} />
                      <span className="text-truncate" title={station}>{station}</span>
                      <span className="ms-auto text-muted font-monospace" style={{ fontSize: "0.64rem" }}>{getVoltageLevel(station) || "-"} kV</span>
                    </label>
                  );
                })}
                {!filteredVoltageStations.length && (
                  <div className="text-center text-muted fw-semibold py-4" style={{ fontSize: "0.76rem" }}>
                    No substations loaded.
                  </div>
                )}
              </div>

              {selectedVoltageStations.length > 0 && (
                <div className="rounded-3 border bg-light px-2 py-1 mt-2">
                  <div className="fw-bold text-secondary mb-1" style={{ fontSize: "0.68rem" }}>Voltage to CRMS Reactor Mapping</div>
                  <div className="d-flex flex-column gap-1" style={{ maxHeight: 145, overflow: "auto" }}>
                    {selectedVoltageStations.map((station) => (
                      <div key={`reactor-map-${station}`} className="row g-1 align-items-center">
                        <div className="col-5 text-muted fw-bold text-truncate" title={station} style={{ fontSize: "0.64rem" }}>{station}</div>
                        <div className="col-7">
                        <input
                          className="form-control theme-input py-1"
                          value={voltageReactorMap[station] ?? inferReactorStationName(station)}
                          onChange={(event) => updateVoltageReactorMap(station, event.target.value)}
                          placeholder="CRMS substation after AT"
                          style={{ fontSize: "0.68rem" }}
                        />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="d-flex align-items-center justify-content-between gap-2 mt-2">
                <div className="text-muted fw-bold" style={{ fontSize: "0.7rem" }}>
                  {selectedVoltageStations.length} selected of {voltageStations.length}
                </div>
                <button
                  type="button"
                  className="btn btn-sm theme-btn-primary d-flex align-items-center gap-1 py-1"
                  onClick={runVoltageProfile}
                  disabled={voltageLoading || !selectedVoltageStations.length}
                  style={{ fontSize: "0.72rem" }}
                >
                  <RefreshCw size={13} className={voltageLoading ? "animate-spin-custom" : ""} />
                  Plot
                </button>
              </div>
              {voltageError && <div className="alert alert-warning py-2 mt-2 mb-0 small">{voltageError}</div>}
              {reactorError && <div className="alert alert-warning py-2 mt-2 mb-0 small">{reactorError}</div>}
            </div>
          </div>

          <div className="col-12 col-xl-8">
            <div className="theme-glass-card p-3 h-100">
              <div className="d-flex align-items-center justify-content-between gap-2 flex-wrap mb-2">
                <div>
                  <h2 className="h6 fw-bold text-dark mb-0">Voltage Profile With Reactor Switching</h2>
                  <p className="small text-muted mb-0">
                    <span className="fw-bold" style={{ color: "#E11D48" }}>Bold red: reactor open</span>
                    <span className="mx-1">|</span>
                    <span className="fw-bold" style={{ color: "#A855F7" }}>Bold purple: reactor close</span>
                    <span className="mx-1">|</span>
                    source interval: {voltageResult?.time || voltageInterval} minutes
                  </p>
                </div>
                <div className="text-muted fw-bold" style={{ fontSize: "0.72rem" }}>
                  {validVoltageSeries.length || 0} plotted | {(reactorResult?.events || []).length} switching dots | high {voltagePuLimitDots.high.length} / low {voltagePuLimitDots.low.length} | {voltageChart.unit}
                </div>
              </div>

              {voltageLoading || reactorLoading ? (
                <div className="rounded-3 border bg-white p-2" style={{ height: 360 }}>
                  <div className="d-flex align-items-center justify-content-center h-100">
                    <div className="spinner-border text-success spinner-border-sm me-2" role="status"></div>
                    <span className="small fw-bold text-secondary">Fetching voltage and reactor switching...</span>
                  </div>
                </div>
              ) : voltageResult?.chart_rows?.length ? (
                <>
                  {renderVoltageChart()}
                  <div className="table-responsive mt-2" style={{ maxHeight: 190, overflow: "auto" }}>
                    <table className="table table-sm table-hover align-middle mb-0" style={{ fontSize: "0.72rem" }}>
                      <thead style={{ position: "sticky", top: 0, zIndex: 1 }}>
                        <tr>
                          <th>Substation</th>
                          <th className="text-end">Level</th>
                          <th>Bus</th>
                          <th className="text-end">Avg kV</th>
                          <th className="text-end">Avg PU</th>
                          <th className="text-end">Max kV</th>
                          <th>Max Time</th>
                          <th className="text-end">Min kV</th>
                          <th>Min Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {validVoltageSeries.map((series) => (
                          <tr key={series.key}>
                            <td className="fw-bold">{series.station_name || series.label}</td>
                            <td className="text-end font-monospace">{getVoltageLevel(series.station_name || series.label) || "-"}</td>
                            <td>{series.voltage_bus === "voltageBus2" ? "Bus 2" : "Bus 1"}</td>
                            <td className="text-end font-monospace">{formatMw(series.avg)}</td>
                            <td className="text-end font-monospace">{formatMw(getVoltageLevel(series.station_name || series.label) ? Number(series.avg) / getVoltageLevel(series.station_name || series.label) : null)}</td>
                            <td className="text-end font-monospace">{formatMw(series.max?.value)}</td>
                            <td>{series.max?.time || "-"}</td>
                            <td className="text-end font-monospace">{formatMw(series.min?.value)}</td>
                            <td>{series.min?.time || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <div className="rounded-3 border bg-white p-2" style={{ height: 360 }}>
                  <div className="d-flex align-items-center justify-content-center h-100 text-muted fw-semibold text-center px-3">
                    Load substations, assign a master point, and plot voltage data.
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="row g-3 mb-3">
          <div className="col-12 col-xl-4">
            <div className="theme-glass-card p-3 h-100">
              <h2 className="h6 fw-bold text-dark mb-3">Diurnal Curve Inputs</h2>

              <label className="form-label small fw-bold text-secondary">State(s)</label>
              <div className="d-flex flex-wrap gap-2 mb-3">
                {STATE_OPTIONS.map((state) => {
                  const checked = selectedStates.includes(state);
                  return (
                    <label key={state} className="d-flex align-items-center gap-2 px-2 py-1 rounded-pill border bg-light mb-0" style={{ cursor: "pointer", fontSize: "0.76rem", fontWeight: 800 }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setSelectedStates((prev) => checked
                            ? prev.length > 1 ? prev.filter((item) => item !== state) : prev
                            : [...prev, state]);
                        }}
                        style={{ accentColor: "#03624C" }}
                      />
                      {state}
                    </label>
                  );
                })}
              </div>

              <label className="form-label small fw-bold text-secondary">Time Block</label>
              <select className="form-select theme-input mb-3" value={blockMinutes} onChange={(event) => setBlockMinutes(event.target.value)}>
                <option value={5}>5 minutes</option>
                <option value={15}>15 minutes</option>
                <option value={30}>30 minutes</option>
                <option value={60}>Hourly</option>
              </select>

              <label className="form-label small fw-bold text-secondary">Chart Layout</label>
              <div className="d-flex gap-2 mb-3">
                {[
                  ["combined", "One combined chart"],
                  ["separate", "Separate chart per range"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={`btn btn-sm ${chartMode === value ? "theme-btn-primary" : "theme-btn-outline"} flex-fill`}
                    onClick={() => setChartMode(value)}
                    style={{ fontSize: "0.72rem" }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="d-flex align-items-center justify-content-between mb-2">
                <label className="form-label small fw-bold text-secondary mb-0">Date Range Groups</label>
                <button
                  type="button"
                  className="btn btn-sm theme-btn-outline d-flex align-items-center gap-1"
                  onClick={() => setRanges((prev) => [...prev, { ...defaultRange(), label: `Range ${prev.length + 1}` }])}
                >
                  <Plus size={13} />
                  Add
                </button>
              </div>

              <div className="d-flex flex-column gap-2">
                {ranges.map((range, index) => (
                  <div key={range.id} className="rounded-3 border bg-white p-2">
                    <div className="d-flex align-items-center justify-content-between gap-2 mb-2">
                      <input className="form-control theme-input" value={range.label} onChange={(event) => updateRange(range.id, { label: event.target.value })} />
                      <button
                        type="button"
                        className="btn btn-sm btn-light"
                        onClick={() => setRanges((prev) => prev.length > 1 ? prev.filter((item) => item.id !== range.id) : prev)}
                        title="Remove range"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div className="row g-2">
                      <div className="col-12">
                        <CalendarInput mode="range" className="form-control theme-input" value={range.start_date} endValue={range.end_date} onRangeChange={(start, end) => updateRange(range.id, { start_date: start, end_date: end })} />
                      </div>
                      <div className="col-12">
                        <select className="form-select theme-input" value={range.curve_type} onChange={(event) => updateRange(range.id, { curve_type: event.target.value })}>
                          {CURVE_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                      </div>
                      {range.curve_type === "custom_dates" && (
                        <div className="col-12">
                          <textarea
                            className="form-control theme-input"
                            rows={2}
                            placeholder="YYYY-MM-DD, YYYY-MM-DD"
                            value={range.selected_dates_text}
                            onChange={(event) => updateRange(range.id, { selected_dates_text: event.target.value })}
                          />
                        </div>
                      )}
                    </div>
                    <div className="text-muted mt-1" style={{ fontSize: "0.68rem" }}>
                      Curve group {index + 1}
                    </div>
                  </div>
                ))}
              </div>

              <button
                type="button"
                className="btn theme-btn-action w-100 d-flex align-items-center justify-content-center gap-2 mt-3"
                onClick={runReport}
                disabled={loading}
              >
                <RefreshCw size={14} className={loading ? "animate-spin-custom" : ""} />
                Generate
              </button>
            </div>
          </div>

          <div className="col-12 col-xl-8">
            <div className="theme-glass-card p-3 h-100">
              <div className="d-flex align-items-center justify-content-between gap-2 flex-wrap mb-2">
                <div>
                  <h2 className="h6 fw-bold text-dark mb-0">Diurnal Curve Chart</h2>
                  <p className="small text-muted mb-0">
                    X-axis: time of day | Y-axis: MW demand | API: /api/psp/mis/diurnal-curve
                  </p>
                </div>
                <div className="d-flex gap-2">
                  <button className="btn btn-sm theme-btn-outline d-flex align-items-center gap-1" onClick={downloadChartPng} disabled={!result?.chart_rows?.length}>
                    <Download size={13} />
                    PNG
                  </button>
                  <button className="btn btn-sm theme-btn-outline d-flex align-items-center gap-1" onClick={downloadCsv} disabled={!result?.table_rows?.length}>
                    <FileSpreadsheet size={13} />
                    CSV
                  </button>
                </div>
              </div>

              {loading && (
                <div className="mb-2">
                  <div className="d-flex align-items-center justify-content-between mb-1">
                    <span className="small fw-bold text-secondary">{progressText || "Working..."}</span>
                    <span className="small fw-bold text-success">{progress}%</span>
                  </div>
                  <div className="progress" style={{ height: 8 }}>
                    <div
                      className="progress-bar progress-bar-striped progress-bar-animated bg-success"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}
              {lastApiStatus && (
                <div className="small text-muted mb-2">{lastApiStatus}</div>
              )}

              <div ref={chartsRef}>
                {loading ? (
                  <div className="rounded-3 border bg-white p-2" style={{ height: 470 }}>
                    <div className="d-flex align-items-center justify-content-center h-100">
                      <div className="spinner-border text-success spinner-border-sm me-2" role="status"></div>
                      <span className="small fw-bold text-secondary">Generating diurnal curves...</span>
                    </div>
                  </div>
                ) : error ? (
                  <div className="rounded-3 border bg-white p-2" style={{ minHeight: 120 }}>
                    <div className="alert alert-warning">{error}</div>
                  </div>
                ) : !result?.chart_rows?.length ? (
                  <div className="rounded-3 border bg-white p-2" style={{ height: 340 }}>
                    <div className="d-flex align-items-center justify-content-center h-100 text-muted fw-semibold text-center px-3">
                      Select states/date ranges and generate the report.
                    </div>
                  </div>
                ) : (
                  seriesGroups.map((group) => renderChart(group.series, group.label))
                )}
              </div>

              {sourceWarnings.length > 0 && (
                <div className="alert alert-warning py-2 mt-2 mb-0" style={{ fontSize: "0.76rem" }}>
                  {sourceWarnings.length} curve file(s) unavailable. First: {sourceWarnings[0].date} - {sourceWarnings[0].message || "not available"}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="theme-glass-card p-3">
          <div className="d-flex align-items-center justify-content-between mb-2">
            <h2 className="h6 fw-bold text-dark mb-0">Plotted Data Table</h2>
            <button
              type="button"
              className="btn btn-sm theme-btn-outline d-flex align-items-center gap-1"
              onClick={() => setShowDiurnalDetails((prev) => !prev)}
              disabled={!pivotRows.length}
            >
              <ChevronDown size={13} style={{ transform: showDiurnalDetails ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 160ms ease" }} />
              {pivotRows.length || 0} time blocks
            </button>
          </div>
          {showDiurnalDetails && (
          <div className="table-responsive" style={{ maxHeight: "42vh", overflow: "auto" }}>
            <table className="table table-sm table-hover align-middle mb-0">
              <thead style={{ position: "sticky", top: 0, zIndex: 1 }}>
                <tr>
                  <th>Time Block</th>
                  {visibleSeries.map((series) => (
                    <th key={series.key} className="text-end">{series.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pivotRows.map((row) => (
                  <tr key={row.time}>
                    <td>{row.time}</td>
                    {visibleSeries.map((series) => (
                      <td key={series.key} className="text-end font-monospace">
                        {formatMw(row[series.key])}
                      </td>
                    ))}
                  </tr>
                ))}
                {!pivotRows.length && (
                  <tr>
                    <td colSpan={Math.max(1, visibleSeries.length + 1)} className="text-center text-muted fw-semibold py-4">No plotted data yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          )}
        </div>
      </div>

      {outageModalOpen && outageResult?.ranges?.length && (
        <div
          className="modal fade show d-block"
          style={{ backgroundColor: "rgba(15, 23, 42, 0.45)", backdropFilter: "blur(4px)" }}
          onClick={() => setOutageModalOpen(false)}
        >
          <div className="modal-dialog modal-xl modal-dialog-centered" onClick={(event) => event.stopPropagation()}>
            <div className="modal-content theme-glass-card border-0 p-3" style={{ borderRadius: "18px" }}>
              <div className="modal-header border-0 pb-2 d-flex justify-content-between align-items-start">
                <div>
                  <h5 className="modal-title fw-bold text-dark mb-0">Generator Outage Category Details</h5>
                  <p className="small text-muted mb-0">
                    ELEMENT_NAME matched with unit_data.Unit_Name. Categories use utility_type and outage TYPE.
                  </p>
                </div>
                <div className="d-flex align-items-center gap-2">
                  <button className="btn btn-sm theme-btn-outline d-flex align-items-center gap-1" onClick={downloadOutageExcel}>
                    <FileSpreadsheet size={13} />
                    Excel
                  </button>
                  <button className="btn-close" onClick={() => setOutageModalOpen(false)} />
                </div>
              </div>
              <div className="modal-body pt-2">
                <div className="d-flex flex-wrap gap-2 mb-3">
                  {OUTAGE_CATEGORIES.map(([key, label]) => {
                    const totalMw = outageRanges.reduce((sum, range) => sum + Number(range.summary?.[key]?.mw || 0), 0);
                    return (
                      <button
                        key={key}
                        type="button"
                        className={`btn btn-sm ${activeOutageCategory === key ? "theme-btn-primary" : "theme-btn-outline"}`}
                        onClick={() => setActiveOutageCategory(key)}
                      >
                        {label} ({formatMw(totalMw)} MW)
                      </button>
                    );
                  })}
                </div>

                <div className="row g-2 mb-3">
                  {outageRanges.map((range) => {
                    const summary = range.summary?.[activeOutageCategory] || {};
                    return (
                      <div key={range.label} className="col-12 col-md-4">
                        <div className="rounded-3 border bg-light px-3 py-2">
                          <div className="fw-bold text-dark" style={{ fontSize: "0.8rem" }}>{range.label}</div>
                          <div className="text-muted" style={{ fontSize: "0.7rem" }}>
                            {summary.count || 0} rows | {formatMw(summary.mw)} MW | fetched {range.fetched_dates?.length || 0}/{range.expected_dates?.length || 0}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {outageRanges.map((range) => {
                  const rows = range.categories?.[activeOutageCategory] || [];
                  return (
                    <div key={`${range.label}-${activeOutageCategory}`} className="mb-3">
                      <div className="d-flex align-items-center justify-content-between mb-1">
                        <h6 className="fw-bold text-dark mb-0">{range.label}</h6>
                        <span className="small text-muted">{rows.length} rows</span>
                      </div>
                      <div className="table-responsive border rounded-3" style={{ maxHeight: "38vh", overflow: "auto" }}>
                        <table className="table table-sm table-hover align-middle mb-0">
                          <thead style={{ position: "sticky", top: 0, zIndex: 1 }}>
                            <tr>
                              <th>Date</th>
                              <th>Element</th>
                              <th>Type</th>
                              <th>Utility Type</th>
                              <th>State</th>
                              <th className="text-end">MW</th>
                              <th>Station</th>
                              <th>Outage</th>
                              <th>Restoration</th>
                              <th>Reason</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((row, index) => (
                              <tr key={`${range.label}-${row.date}-${row.element_name}-${index}`}>
                                <td>{row.date}</td>
                                <td className="fw-bold">{row.element_name || "-"}</td>
                                <td>{row.type || "-"}</td>
                                <td>{row.utility_type || "-"}</td>
                                <td>{row.state_name || "-"}</td>
                                <td className="text-end font-monospace">{formatMw(row.installed_capacity)}</td>
                                <td>{row.generating_station || "-"}</td>
                                <td>{[row.outage_date, row.outage_time].filter(Boolean).join(" ") || "-"}</td>
                                <td>{[row.expected_revival_date || row.revival_date, row.expected_revival_time || row.revival_time].filter(Boolean).join(" ") || "-"}</td>
                                <td>{row.reason || "-"}</td>
                              </tr>
                            ))}
                            {!rows.length && (
                              <tr>
                                <td colSpan={10} className="text-center text-muted fw-semibold py-4">No rows in this category for this range.</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
