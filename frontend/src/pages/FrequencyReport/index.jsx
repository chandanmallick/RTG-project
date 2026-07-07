/**
 * FrequencyReport/index.jsx
 * Main entry point for the revamped Frequency Compliance Report Builder.
 */
import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import AppShell from "../../components/layout/AppShell";
import PlantMappingGrid from "../../components/PlantMappingGrid";
import DataSourceAuditPanel from "../../components/frequency/DataSourceAuditPanel";
import API from "../../services/api";
import { showModernPopup } from "../../components/ui/ModernPopup";

// Sub-components
import ReportHeader from "./components/ReportHeader";
import ExecutiveSummary from "./components/ExecutiveSummary";
import StateComplianceTable from "./components/StateComplianceTable";
import GeneratorComplianceTable from "./components/GeneratorComplianceTable";
import ExportBar from "./components/ExportBar";
import ComplianceChart from "./components/ComplianceChart";
import CapacityFrequencyChart from "./components/CapacityFrequencyChart";

import { Table2, Settings2, FileUp, AlertTriangle, Terminal, X, Save, RefreshCw, Search } from "lucide-react";
import toast, { Toaster } from "react-hot-toast";

const today = () => new Date().toISOString().slice(0, 10);
const HIGH_FREQ_DEFAULT_START = "2026-06-02T19:00";
const HIGH_FREQ_DEFAULT_END = "2026-06-03T03:00";

const TABS = [
  { id: "report", label: "Frequency Event Analysis", icon: Table2 },
  { id: "mapping", label: "Plant Mapping", icon: Settings2 },
];

const SOURCE_OPTIONS = ["RTG", "WBES", "SCADA", "Manual"];

const normalizeScadaKey = (value) => {
  if (value === null || value === undefined || value === "") return "";
  const text = String(value).trim().replace(/\.0$/, "");
  if (/^\d+$/.test(text) && !text.startsWith("0")) return `0${text}`;
  return text;
};

const formatPlantStageName = (row = {}) => {
  if (row.is_state) return String(row.plant_name || row.state || row.state_name || "").trim();
  const plantName = String(row.plant_name || row.STAGE_NAME || row.stage_name || "").trim();
  const stageName = String(row.stage_name || row.STAGE_NAME || "").trim();
  const stageId = String(row.stage_id || row.STAGE_ID || "").trim().replace(/\.0$/, "");
  const stageRaw = stageName || stageId;
  const stageText = stageRaw ? `St. ${stageRaw.replace(/^st\.?\s*/i, "")}` : "";
  if (!stageText) return plantName;
  if (!plantName) return stageText;
  const plantUpper = plantName.toUpperCase();
  const stageUpper = stageText.toUpperCase();
  const rawStageUpper = String(stageRaw).toUpperCase();
  if (plantUpper === stageUpper || plantUpper.includes(`(${stageUpper})`) || plantUpper.includes(`(${rawStageUpper})`) || plantUpper.includes(`STAGE ${rawStageUpper}`)) {
    return plantName;
  }
  return `${plantName} (${stageText})`;
};

const normalizeMappingRow = (row) => ({
  ...row,
  plant_id: row.plant_id !== null && row.plant_id !== undefined ? String(row.plant_id).trim().replace(/\.0$/, "") : "",
  STAGE_ID: row.STAGE_ID !== null && row.STAGE_ID !== undefined ? String(row.STAGE_ID).trim().replace(/\.0$/, "") : "",
  STAGE_NAME: row.STAGE_NAME !== null && row.STAGE_NAME !== undefined ? String(row.STAGE_NAME).trim() : "",
  rtg_plant_id: row.rtg_plant_id !== null && row.rtg_plant_id !== undefined ? String(row.rtg_plant_id).trim().replace(/\.0$/, "") : "",
  scada_key: normalizeScadaKey(row.scada_key),
  scada_schedule_key: normalizeScadaKey(row.scada_schedule_key),
  scada_dc_key: normalizeScadaKey(row.scada_dc_key),
});

const toNumberOrNull = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeSeries = (series = {}) => ({
  timestamps: Array.isArray(series.timestamps) ? series.timestamps : [],
  frequency: Array.isArray(series.frequency) ? series.frequency.map(toNumberOrNull) : [],
  actual: Array.isArray(series.actual) ? series.actual.map(toNumberOrNull) : [],
  schedule: Array.isArray(series.schedule) ? series.schedule.map(toNumberOrNull) : [],
  dc: Array.isArray(series.dc) ? series.dc.map(toNumberOrNull) : [],
  deviation: Array.isArray(series.deviation) ? series.deviation.map(toNumberOrNull) : [],
});

const normalizeReportRow = (row = {}) => {
  const statistics = row.statistics || {};
  const stageName = row.stage_name || row.STAGE_NAME || "";
  const stageId = row.stage_id || row.STAGE_ID || "";
  return {
    ...row,
    plant_name: formatPlantStageName({ ...row, stage_name: stageName, stage_id: stageId }),
    stage_id: stageId,
    stage_name: stageName,
    state: row.state || row.state_name || "",
    type: row.type || (row.is_state ? "state" : ""),
    actual: toNumberOrNull(row.actual),
    schedule: toNumberOrNull(row.schedule),
    dc: toNumberOrNull(row.dc),
    deviation: toNumberOrNull(row.deviation),
    pct_dc: toNumberOrNull(row.pct_dc),
    capacity: toNumberOrNull(row.capacity) ?? 0,
    statistics: {
      ...statistics,
      max_od: toNumberOrNull(statistics.max_od),
      max_ud: toNumberOrNull(statistics.max_ud),
      freq_at_max_od: toNumberOrNull(statistics.freq_at_max_od),
      freq_at_max_ud: toNumberOrNull(statistics.freq_at_max_ud),
      od_duration_pct: toNumberOrNull(statistics.od_duration_pct),
      helping_duration_pct: toNumberOrNull(statistics.helping_duration_pct),
      under_inj_pct: toNumberOrNull(statistics.under_inj_pct),
      helping_grid_pct: toNumberOrNull(statistics.helping_grid_pct),
    },
    series: normalizeSeries(row.series),
    event_type: row.event_type || "low",
    cap_on_bar: toNumberOrNull(row.cap_on_bar),
    cap_on_bar_55: toNumberOrNull(row.cap_on_bar_55),
    avg_capacity_on_bar_pct: toNumberOrNull(row.avg_capacity_on_bar_pct),
  };
};

const normalizeEvent = (event = {}) => ({
  ...event,
  event_id: String(event.event_id || event.id || event._id || ""),
});

const DEFAULT_CRMS_ALIASES = {
  BIHAR: ["BSPTCL"],
  ODISHA: ["GRIDCO"],
  JHARKHAND: ["JUSNL"],
  "WEST BENGAL": ["WBSETCL"],
  SIKKIM: ["SIKKIM"],
  DVC: ["DVC"],
};

const normalizeCrmsToken = (value) =>
  String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

const splitCrmsAliases = (value) =>
  String(value || "")
    .split(/[;,|/]+/)
    .map((part) => part.trim())
    .filter(Boolean);

const rowCrmsAliasTokens = (row = {}) => {
  const configured = splitCrmsAliases(row.crms_utility_name);
  const names = configured.length ? [...configured] : [];

  if (!configured.length && row.is_state) {
    const stateText = String(row.state || row.plant_name || "").toUpperCase();
    Object.entries(DEFAULT_CRMS_ALIASES).forEach(([stateName, aliases]) => {
      if (stateText === stateName || stateText.includes(stateName)) {
        names.push(...aliases);
      }
    });
  }

  return new Set(names.map(normalizeCrmsToken).filter(Boolean));
};

const mapCrmsMessagesToRows = (baseRows = [], messages = []) => {
  if (!messages.length) {
    return baseRows.map((row) => ({ ...row, crms_messages: [] }));
  }
  return baseRows.map((row) => {
    const aliasTokens = rowCrmsAliasTokens(row);
    const matched = messages.filter((message) => {
      const issuedTokens = (message.issued_to || []).map(normalizeCrmsToken).filter(Boolean);
      return issuedTokens.some((token) => aliasTokens.has(token));
    });
    return { ...row, crms_messages: matched };
  });
};

const generatorSectionLabel = (row = {}) => {
  const type = String(row.type || "").toUpperCase();
  const state = String(row.state || "").toUpperCase();
  if (type === "ISGS") return "ISGS";
  if (type === "IPP") return "IPP";
  if (type === "STATE" || type === "STATE_IPP") return `State Generator (${state || "STATE"})`;
  return "IPP";
};

const sectionRank = (label = "") => {
  if (label === "ISGS") return 1;
  if (label === "IPP") return 2;
  if (label.startsWith("State Generator")) return 3;
  return 4;
};

const finiteSeries = (values = []) => values.map(Number).filter(Number.isFinite);
const minSeries = (values = []) => {
  const nums = finiteSeries(values);
  return nums.length ? Math.min(...nums) : null;
};
const maxSeries = (values = []) => {
  const nums = finiteSeries(values);
  return nums.length ? Math.max(...nums) : null;
};
const minGenerationPct = (row = {}) => {
  const minGen = minSeries(row.series?.actual || []);
  const highFreqReference = Number(row.cap_on_bar || 0) * 0.94;
  return minGen !== null && highFreqReference > 0 ? (minGen / highFreqReference) * 100 : null;
};
const fleetMinGenerationPct = (rows = []) => {
  const maxLen = Math.max(0, ...rows.map((row) => row.series?.actual?.length || 0));
  let best = null;
  for (let idx = 0; idx < maxLen; idx += 1) {
    let actualSum = 0;
    let referenceSum = 0;
    rows.forEach((row) => {
      const actual = Number(row.series?.actual?.[idx]);
      const highFreqReference = Number(row.cap_on_bar || 0) * 0.94;
      if (Number.isFinite(actual) && highFreqReference > 0) {
        actualSum += actual;
        referenceSum += highFreqReference;
      }
    });
    if (referenceSum > 0) {
      const pctVal = (actualSum / referenceSum) * 100;
      best = best === null ? pctVal : Math.min(best, pctVal);
    }
  }
  return best;
};
const fmtPctText = (value) => Number.isFinite(Number(value)) ? `${Number(value).toFixed(1)}%` : "-";
const fmtMwText = (value) => Number.isFinite(Number(value)) ? `${Number(value).toFixed(0)} MW` : "-";

export default function FrequencyReport() {
  const [tab, setTab] = useState("report");
  const [eventType, setEventType] = useState("low");
  const [startTime, setStartTime] = useState(today() + "T00:00");
  const [endTime, setEndTime] = useState(today() + "T23:59");
  
  const [rows, setRows] = useState([]);
  const [mapData, setMapData] = useState([]);
  const [mapLoading, setMapLoading] = useState(false);
  const [crmsMessages, setCrmsMessages] = useState([]);
  const [crmsStatus, setCrmsStatus] = useState({ loading: false, error: "", fetched: false });

  // RTG Portal Status
  const [rtgStatusOk, setRtgStatusOk] = useState(false);
  const [rtgStatusMsg, setRtgStatusMsg] = useState("");
  const [rtgStatusLoading, setRtgStatusLoading] = useState(false);

  // Data Loading indicators
  const [wbesLoaded, setWbesLoaded] = useState(false);
  const [rtgLoaded, setRtgLoaded] = useState(false);
  const [scadaLoaded, setScadaLoaded] = useState(false);
  const [scadaFile, setScadaFile] = useState(null);

  const [dataLoading, setDataLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [syncLogs, setSyncLogs] = useState([]);
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [logsModalStatus, setLogsModalStatus] = useState("idle"); // "idle" | "running" | "success" | "error"
  const [logsRunMode, setLogsRunMode] = useState("report"); // "report" | "historical"
  const [logsErrorDetails, setLogsErrorDetails] = useState("");
  const [showUploadDetailsModal, setShowUploadDetailsModal] = useState(false);
  const [uploadDetailRows, setUploadDetailRows] = useState([]);

  // Handle ESC key to close modals
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setShowLogsModal(false);
        setShowUploadDetailsModal(false);
        setRawEditorOpen(false);
        setPendingExportType(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Export indicator states
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingDocx, setExportingDocx] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingHtml, setExportingHtml] = useState(false);

  // Accordion details / Comments
  const [introDesc, setIntroDesc] = useState(
    "This report provides a comprehensive analysis of power system frequency and deviation compliance. Deviations are calculated as Actual minus Scheduled values. Statistical calculations are restricted to Low Frequency Operation periods (< 49.9 Hz)."
  );
  const [genDesc, setGenDesc] = useState(
    "Generator Module: Under injection (orange shade) and grid helping (green shade) compliance durations computed during Low Frequency periods (< 49.9 Hz)."
  );
  const [stateDesc, setStateDesc] = useState(
    "State Module: Over drawal (gold shade) and grid helping (cyan shade) compliance durations, along with Maximum Over Drawal (Max OD) magnitude and timestamps during low frequency grid states."
  );
  const [stateObservation, setStateObservation] = useState("");
  const [generatorObservation, setGeneratorObservation] = useState("");

  const [showSchAct, setShowSchAct] = useState(false);
  const [expandedRowIds, setExpandedRowIds] = useState([]);
  const [selectedExportStateIds, setSelectedExportStateIds] = useState([]);
  const [selectedExportGeneratorIds, setSelectedExportGeneratorIds] = useState([]);
  const [exportGeneratorFilter, setExportGeneratorFilter] = useState("");
  const [exportFuelFilter, setExportFuelFilter] = useState("ALL_FUELS");
  const [exportIncludeDeviationPlot, setExportIncludeDeviationPlot] = useState(true);
  const [exportIncludeStateScheduleActualPlot, setExportIncludeStateScheduleActualPlot] = useState(false);
  const [exportIncludeGeneratorScheduleActualPlot, setExportIncludeGeneratorScheduleActualPlot] = useState(true);
  const [exportReportMode, setExportReportMode] = useState("with_annexure");
  const [pendingExportType, setPendingExportType] = useState(null);

  // Ref container to collect all ECharts instances for offscreen render/export
  const chartRefs = useRef({});
  const capacityChartRefs = useRef({});
  const fileInputRef = useRef(null);

  // Raw Data Editor states
  const [rawEditorOpen, setRawEditorOpen] = useState(false);
  const [rawEditorRow, setRawEditorRow] = useState(null);
  const [rawEditorDate, setRawEditorDate] = useState("");
  const [rawEditorWbesSchedule, setRawEditorWbesSchedule] = useState([]);
  const [rawEditorWbesDC, setRawEditorWbesDC] = useState([]);
  const [rawEditorRtgSchedule, setRawEditorRtgSchedule] = useState([]);
  const [rawEditorRtgDC, setRawEditorRtgDC] = useState([]);
  const [rawEditorActual, setRawEditorActual] = useState([]);
  const [rawEditorScadaFileActual, setRawEditorScadaFileActual] = useState([]);
  const [rawEditorScadaFileSchedule, setRawEditorScadaFileSchedule] = useState([]);
  const [rawEditorScadaFileDC, setRawEditorScadaFileDC] = useState([]);
  const [rawEditorLoading, setRawEditorLoading] = useState(false);
  const [rawEditorSaving, setRawEditorSaving] = useState(false);

  // Raw Editor Active cell state
  const [activeCell, setActiveCell] = useState(null); // { rowIdx, colKey }
  const rawInputRef = useRef(null);

  // Available dates states
  const [availableDates, setAvailableDates] = useState([]);
  const [availableEvents, setAvailableEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [eventNameDraft, setEventNameDraft] = useState("");
  const [useDatabase, setUseDatabase] = useState(false);
  const [selectedDbDate, setSelectedDbDate] = useState("");

  const eventDurationName = useCallback(() => {
    const clean = (value) => String(value || "")
      .replace("T", "_")
      .replace(/:/g, "-")
      .replace(/\s+/g, "_");
    return `${eventType === "high" ? "High" : "Low"}_Frequency_${clean(startTime)}_to_${clean(endTime)}`;
  }, [endTime, eventType, startTime]);

  const handleEventTypeChange = useCallback((nextType) => {
    setEventType(nextType);
    setRows((prev) => prev.map((row) => ({ ...row, event_type: nextType })));
    if (nextType === "high") {
      setStartTime(HIGH_FREQ_DEFAULT_START);
      setEndTime(HIGH_FREQ_DEFAULT_END);
      setIntroDesc("This report provides a comprehensive analysis of high frequency operation and power system deviation. Deviations are calculated as Actual minus Scheduled values. Statistical calculations are restricted to High Frequency Operation periods (> 50.05 Hz).");
      setGenDesc("Generator Module: Over injection and under injection duration are computed during High Frequency periods (> 50.05 Hz). Minimum Generation % Achieved is computed as minimum generation divided by 94% of capacity on bar.");
      setStateDesc("State Module: Over drawal and under drawal duration are computed during High Frequency periods (> 50.05 Hz), along with Maximum Under Drawal (Max UD) magnitude and timestamp.");
    } else {
      setIntroDesc("This report provides a comprehensive analysis of power system frequency and deviation compliance. Deviations are calculated as Actual minus Scheduled values. Statistical calculations are restricted to Low Frequency Operation periods (< 49.9 Hz).");
      setGenDesc("Generator Module: Under injection (orange shade) and grid helping (green shade) compliance durations computed during Low Frequency periods (< 49.9 Hz).");
      setStateDesc("State Module: Over drawal (gold shade) and grid helping (cyan shade) compliance durations, along with Maximum Over Drawal (Max OD) magnitude and timestamps during low frequency grid states.");
    }
  }, []);

  const loadAvailableDates = useCallback(async () => {
    try {
      const res = await API.getAvailableDates();
      if (res?.success) {
        setAvailableDates(res.dates || []);
        if (Array.isArray(res.events)) {
          setAvailableEvents(res.events.map(normalizeEvent).filter((event) => event.event_id));
        }
        if (res.dates && res.dates.length > 0) {
          setSelectedDbDate(res.dates[0]);
        }
      }
    } catch (e) {
      console.error(e);
    }

    try {
      const res = await API.getFrequencyEvents();
      if (res?.success) {
        setAvailableEvents((res.events || []).map(normalizeEvent).filter((event) => event.event_id));
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    loadAvailableDates();
  }, [loadAvailableDates]);

  const handleSelectEvent = useCallback((eventId) => {
    setSelectedEventId(eventId);
    const event = availableEvents.find((item) => item.event_id === eventId);
    if (!event) {
      setEventNameDraft("");
      return;
    }
    setUseDatabase(true);
    setStartTime(event.start_time);
    setEndTime(event.end_time);
    setEventType(event.event_type || "low");
    setEventNameDraft(event.name || "");
  }, [availableEvents]);

  const handleCreateEvent = useCallback(async (details = null) => {
    const eventDetails = Array.isArray(details) ? details : null;
    const name = eventNameDraft.trim() || eventDurationName();
    if (!startTime || !endTime || new Date(endTime) < new Date(startTime)) {
      toast.error("Please select a valid event range.");
      return;
    }

    const saveToast = toast.loading("Saving event...");
    try {
      const res = await API.createFrequencyEvent({
        name,
        event_type: eventType,
        start_time: startTime,
        end_time: endTime,
        report_notes: {
          executive_summary: introDesc,
          state_drawal_compliance: stateDesc,
          generator_scheduling_compliance: genDesc,
          state_observation: stateObservation,
          generator_observation: generatorObservation,
        },
        details: eventDetails,
        data_points: rows.map((row) => ({
          plant_id: row.plant_id,
          plant_name: row.plant_name,
          stage_id: row.stage_id || row.STAGE_ID || "",
          stage_name: row.stage_name || row.STAGE_NAME || "",
          type: row.type || (row.is_state ? "State" : "IPP"),
          reason: row.reason || "",
          chart_note: row.chart_note || "",
          actual_source: row.actual_source || "RTG",
          schedule_source: row.sched_src || row.schedule_source || "RTG",
          dc_source: row.dc_src || row.dc_source || "RTG",
          series: {
            timestamps: row.series?.timestamps || [],
            frequency: row.series?.frequency || [],
            actual: row.series?.actual || [],
            schedule: row.series?.schedule || [],
            dc: row.series?.dc || [],
            deviation: row.series?.deviation || [],
          },
          summary: {
            actual: row.actual,
            schedule: row.schedule,
            dc: row.dc,
            deviation: row.deviation,
            pct_dc: row.pct_dc,
            cap_on_bar: row.cap_on_bar,
            cap_on_bar_55: row.cap_on_bar_55,
            avg_capacity_on_bar_pct: row.avg_capacity_on_bar_pct,
            statistics: row.statistics || {},
          },
        })),
      });
      if (res?.success) {
        toast.success("Event saved", { id: saveToast });
        await loadAvailableDates();
        setSelectedEventId(res.event?.event_id || "");
      } else {
        toast.error(res?.error || "Could not save event", { id: saveToast });
      }
    } catch (e) {
      console.error(e);
      toast.error("Could not save event: " + e.message, { id: saveToast });
    }
  }, [endTime, eventDurationName, eventNameDraft, eventType, genDesc, introDesc, loadAvailableDates, rows, startTime, stateDesc]);

  const handleDeleteEvent = useCallback(async (eventId) => {
    if (!eventId) return;
    const confirmed = window.confirm("Delete this historical frequency event? This cannot be undone.");
    if (!confirmed) return;

    const deleteToast = toast.loading("Deleting event...");
    try {
      const res = await API.deleteFrequencyEvent(eventId);
      if (res?.success) {
        toast.success("Event deleted", { id: deleteToast });
        setSelectedEventId("");
        setEventNameDraft("");
        setUseDatabase(false);
        await loadAvailableDates();
      } else {
        toast.error(res?.error || "Could not delete event", { id: deleteToast });
      }
    } catch (e) {
      console.error(e);
      toast.error("Could not delete event: " + e.message, { id: deleteToast });
    }
  }, [loadAvailableDates]);

  useEffect(() => {
    if (activeCell && rawInputRef.current) {
      rawInputRef.current.focus();
      rawInputRef.current.select?.();
    }
  }, [activeCell]);

  const handleRawEditorKeyDown = (e, rowIdx, colKey) => {
    const colOrder = [
      "actual",
      "scada_file_actual",
      "rtg_schedule",
      "wbes_schedule",
      "scada_file_schedule",
      "rtg_dc",
      "wbes_dc",
      "scada_file_dc",
    ];
    const colIdx = colOrder.indexOf(colKey);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const nextIdx = Math.min(rowIdx + 1, 95);
      setActiveCell({ rowIdx: nextIdx, colKey });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prevIdx = Math.max(rowIdx - 1, 0);
      setActiveCell({ rowIdx: prevIdx, colKey });
    } else if (e.key === "ArrowLeft") {
      const caretAtStart = e.target.selectionStart === 0;
      if (caretAtStart) {
        e.preventDefault();
        const prevColIdx = colIdx - 1;
        if (prevColIdx >= 0) {
          setActiveCell({ rowIdx, colKey: colOrder[prevColIdx] });
        }
      }
    } else if (e.key === "ArrowRight") {
      const caretAtEnd = e.target.selectionStart === e.target.value.length;
      if (caretAtEnd) {
        e.preventDefault();
        const nextColIdx = colIdx + 1;
        if (nextColIdx < colOrder.length) {
          setActiveCell({ rowIdx, colKey: colOrder[nextColIdx] });
        }
      }
    } else if (e.key === "Tab") {
      e.preventDefault();
      if (e.shiftKey) {
        const prevColIdx = colIdx - 1;
        if (prevColIdx >= 0) {
          setActiveCell({ rowIdx, colKey: colOrder[prevColIdx] });
        } else {
          const prevRowIdx = rowIdx - 1;
          if (prevRowIdx >= 0) {
            setActiveCell({ rowIdx: prevRowIdx, colKey: colOrder[colOrder.length - 1] });
          }
        }
      } else {
        const nextColIdx = colIdx + 1;
        if (nextColIdx < colOrder.length) {
          setActiveCell({ rowIdx, colKey: colOrder[nextColIdx] });
        } else {
          const nextRowIdx = rowIdx + 1;
          if (nextRowIdx < 96) {
            setActiveCell({ rowIdx: nextRowIdx, colKey: colOrder[0] });
          }
        }
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      const nextRowIdx = rowIdx + 1;
      if (nextRowIdx < 96) {
        setActiveCell({ rowIdx: nextRowIdx, colKey });
      } else {
        setActiveCell(null);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setActiveCell(null);
    }
  };

  const handleResyncSource = async (source) => {
    setDataLoading(true);
    const loadingToast = toast.loading(`Resyncing ${source} data...`);
    try {
      const payload = {
        start_time: startTime,
        end_time: endTime,
        source: source,
        entities: rows.map(r => ({
          plant_id: r.plant_id,
          wbes_name: r.wbes_name,
          rtg_plant_id: r.rtg_plant_id
        }))
      };
      const res = await API.resyncSource(payload);
      if (res?.success) {
        toast.success(res.message || `Resynced ${source} data successfully!`, { id: loadingToast });
        await handleProcessReport();
      } else {
        toast.error(`Resync failed: ${res?.error || "Unknown error"}`, { id: loadingToast });
      }
    } catch (e) {
      console.error(e);
      toast.error(`Resync error: ${e.message}`, { id: loadingToast });
    } finally {
      setDataLoading(false);
    }
  };

  // Helper to get all dates in the selected range
  const getUniqueDatesInRange = useCallback(() => {
    if (!startTime || !endTime) return [];
    const dates = [];
    try {
      let curr = new Date(startTime.split("T")[0]);
      const end = new Date(endTime.split("T")[0]);
      while (curr <= end) {
        dates.push(curr.toISOString().split("T")[0]);
        curr.setDate(curr.getDate() + 1);
      }
    } catch (e) {
      console.error(e);
    }
    return dates;
  }, [startTime, endTime]);

  const loadRawEditorData = async (row, dateStr) => {
    setRawEditorLoading(true);
    try {
      const source = row.sched_src || row.schedule_source || "RTG";
      const wbesName = row.wbes_name || "";
      const pid = row.plant_id || "";
      const res = await API.getRawData(pid, dateStr, source, wbesName);
      if (res?.success) {
        setRawEditorWbesSchedule(res.wbes_schedule || Array(96).fill(0));
        setRawEditorWbesDC(res.wbes_dc || Array(96).fill(0));
        setRawEditorRtgSchedule(res.rtg_schedule || Array(96).fill(0));
        setRawEditorRtgDC(res.rtg_dc || Array(96).fill(0));
        setRawEditorActual(res.actual || Array(96).fill(0));
        setRawEditorScadaFileActual(res.scada_file_actual || Array(96).fill(0));
        setRawEditorScadaFileSchedule(res.scada_file_schedule || Array(96).fill(0));
        setRawEditorScadaFileDC(res.scada_file_dc || Array(96).fill(0));
      } else {
        toast.error("Failed to load raw database data: " + (res?.error || "Unknown error"));
      }
    } catch (e) {
      console.error(e);
      toast.error("Error loading raw data: " + e.message);
    } finally {
      setRawEditorLoading(false);
    }
  };

  const handleOpenRawDataEditor = async (row) => {
    setRawEditorRow(row);
    setRawEditorOpen(true);
    const uniqueDates = getUniqueDatesInRange();
    const defaultDate = uniqueDates[0] || today();
    setRawEditorDate(defaultDate);
    await loadRawEditorData(row, defaultDate);
  };

  const handleSaveRawData = async () => {
    if (!rawEditorRow) return;
    setRawEditorSaving(true);
    const saveToast = toast.loading("Saving custom raw data to database...");
    try {
      const source = rawEditorRow.sched_src || rawEditorRow.schedule_source || "RTG";
      const payload = {
        plant_id: rawEditorRow.plant_id,
        date: rawEditorDate,
        wbes_name: rawEditorRow.wbes_name || "",
        source: source,
        wbes_schedule: rawEditorWbesSchedule,
        wbes_dc: rawEditorWbesDC,
        rtg_schedule: rawEditorRtgSchedule,
        rtg_dc: rawEditorRtgDC,
        actual: rawEditorActual,
        scada_file_actual: rawEditorScadaFileActual,
        scada_file_schedule: rawEditorScadaFileSchedule,
        scada_file_dc: rawEditorScadaFileDC
      };
      const res = await API.saveRawData(payload);
      if (res?.success) {
        toast.success("Database raw data updated successfully!", { id: saveToast });
        setRawEditorOpen(false);
        await handleProcessReport();
      } else {
        toast.error("Save failed: " + (res?.error || "Unknown error"), { id: saveToast });
      }
    } catch (e) {
      console.error(e);
      toast.error("Error saving raw data: " + e.message, { id: saveToast });
    } finally {
      setRawEditorSaving(false);
    }
  };

  const updateRawEditorCell = (seriesKey, idx, value) => {
    const parsed = parseFloat(value);
    const nextValue = Number.isFinite(parsed) ? parsed : 0;
    const setters = {
      wbes_schedule: setRawEditorWbesSchedule,
      wbes_dc: setRawEditorWbesDC,
      rtg_schedule: setRawEditorRtgSchedule,
      rtg_dc: setRawEditorRtgDC,
      actual: setRawEditorActual,
      scada_file_actual: setRawEditorScadaFileActual,
      scada_file_schedule: setRawEditorScadaFileSchedule,
      scada_file_dc: setRawEditorScadaFileDC,
    };
    setters[seriesKey]?.((prev) => {
      const next = [...prev];
      next[idx] = nextValue;
      return next;
    });
  };

  const handleRawEditorPaste = (e, startRow, startCol) => {
    const text = e.clipboardData?.getData("text/plain");
    if (!text || (!text.includes("\t") && !text.includes("\n"))) return;
    e.preventDefault();

    const columns = [
      "actual",
      "scada_file_actual",
      "rtg_schedule",
      "wbes_schedule",
      "scada_file_schedule",
      "rtg_dc",
      "wbes_dc",
      "scada_file_dc",
    ];
    const pasteRows = text
      .trimEnd()
      .split(/\r?\n/)
      .map((line) => line.split("\t"));

    const updates = {
      wbes_schedule: [...rawEditorWbesSchedule],
      wbes_dc: [...rawEditorWbesDC],
      rtg_schedule: [...rawEditorRtgSchedule],
      rtg_dc: [...rawEditorRtgDC],
      actual: [...rawEditorActual],
      scada_file_actual: [...rawEditorScadaFileActual],
      scada_file_schedule: [...rawEditorScadaFileSchedule],
      scada_file_dc: [...rawEditorScadaFileDC],
    };

    pasteRows.forEach((row, rowOffset) => {
      const targetRow = startRow + rowOffset;
      if (targetRow >= 96) return;
      row.forEach((cell, colOffset) => {
        const targetCol = startCol + colOffset;
        const key = columns[targetCol];
        if (!key) return;
        const parsed = parseFloat(String(cell).replace(/,/g, ""));
        updates[key][targetRow] = Number.isFinite(parsed) ? parsed : 0;
      });
    });

    setRawEditorWbesSchedule(updates.wbes_schedule);
    setRawEditorWbesDC(updates.wbes_dc);
    setRawEditorRtgSchedule(updates.rtg_schedule);
    setRawEditorRtgDC(updates.rtg_dc);
    setRawEditorActual(updates.actual);
    setRawEditorScadaFileActual(updates.scada_file_actual);
    setRawEditorScadaFileSchedule(updates.scada_file_schedule);
    setRawEditorScadaFileDC(updates.scada_file_dc);
  };

  const copyRawSeries = (fromPrefix, toPrefix) => {
    if (fromPrefix === "wbes" && toPrefix === "rtg") {
      setRawEditorRtgSchedule([...rawEditorWbesSchedule]);
      setRawEditorRtgDC([...rawEditorWbesDC]);
    } else if (fromPrefix === "rtg" && toPrefix === "wbes") {
      setRawEditorWbesSchedule([...rawEditorRtgSchedule]);
      setRawEditorWbesDC([...rawEditorRtgDC]);
    }
  };

  const autoFillMissingRawValues = () => {
    const fillMissing = (primary, fallback) =>
      primary.map((value, idx) => {
        const parsed = parseFloat(value);
        if (Number.isFinite(parsed) && parsed !== 0) return parsed;
        const fallbackParsed = parseFloat(fallback[idx]);
        return Number.isFinite(fallbackParsed) ? fallbackParsed : 0;
      });

    setRawEditorWbesSchedule((prev) => fillMissing(prev, rawEditorRtgSchedule));
    setRawEditorWbesDC((prev) => fillMissing(prev, rawEditorRtgDC));
    setRawEditorRtgSchedule((prev) => fillMissing(prev, rawEditorWbesSchedule));
    setRawEditorRtgDC((prev) => fillMissing(prev, rawEditorWbesDC));
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
    e.target.value = ""; // Reset value so same file can be selected again
  };

  /* ── Load plant mapping ── */
  const loadMapping = useCallback(async () => {
    setMapLoading(true);
    try {
      const res = await API.getFrequencyPlantMapping();
      setMapData((res?.data || []).map(normalizeMappingRow));
    } catch (e) {
      console.error(e);
      toast.error("Failed to load plant mapping configuration");
    } finally {
      setMapLoading(false);
    }
  }, []);

  /* Sync report rows with mapData whenever mapping is loaded/updated */
  useEffect(() => {
    if (mapData.length > 0) {
      setRows((prev) => {
        if (prev.length === 0) {
          return mapData.map((m) => ({
            plant_id: m.plant_id,
            stage_id: m.STAGE_ID,
            stage_name: m.STAGE_NAME || "",
            plant_name: formatPlantStageName(m),
            state: m.state_name || "",
            state_name: m.state_name || "",
            fuel: m.fuel_type || "",
            owner: m.owner_name || "",
            capacity: m.stage_installed_capacity || m.installed_capacity || 0,
            schedule: 0.0,
            dc: 0.0,
            actual: null,
            deviation: null,
            pct_dc: null,
            sched_src: m.schedule_source || "RTG",
            dc_src: m.dc_source || "RTG",
            actual_source: m.actual_source || "RTG",
            type: m.type || (m.is_state ? "State" : "IPP"),
            wbes_name: m.wbes_name || "",
            crms_utility_name: m.crms_utility_name || "",
            rtg_plant_id: m.rtg_plant_id || "",
            scada_key: m.scada_key || "",
            scada_header: m.scada_header || "",
            scada_schedule_key: m.scada_schedule_key || "",
            scada_schedule_header: m.scada_schedule_header || "",
            scada_dc_key: m.scada_dc_key || "",
            scada_dc_header: m.scada_dc_header || "",
            is_state: m.is_state || false,
            is_frequency: m.is_frequency || false,
            reason: "",
            chart_note: "",
          }));
        } else {
          return prev.map((r) => {
            const m = mapData.find((item) => String(item.plant_id ?? "") === String(r.plant_id ?? "") && String(item.STAGE_ID ?? "") === String(r.stage_id ?? ""));
            if (!m) return r;
            return {
              ...r,
              sched_src: m.schedule_source || "RTG",
              dc_src: m.dc_source || "RTG",
              actual_source: m.actual_source || "RTG",
              type: m.type || (m.is_state ? "State" : "IPP"),
              stage_id: m.STAGE_ID || r.stage_id || "",
              stage_name: m.STAGE_NAME || r.stage_name || "",
              plant_name: formatPlantStageName({ ...r, plant_name: m.plant_name || r.plant_name, stage_name: m.STAGE_NAME || r.stage_name, stage_id: m.STAGE_ID || r.stage_id }),
              state: m.state_name || r.state || "",
              state_name: m.state_name || r.state_name || "",
              wbes_name: m.wbes_name || "",
              crms_utility_name: m.crms_utility_name || "",
              rtg_plant_id: m.rtg_plant_id || "",
              scada_key: m.scada_key || "",
              scada_header: m.scada_header || "",
              scada_schedule_key: m.scada_schedule_key || "",
              scada_schedule_header: m.scada_schedule_header || "",
              scada_dc_key: m.scada_dc_key || "",
              scada_dc_header: m.scada_dc_header || "",
            };
          });
        }
      });
    }
  }, [mapData]);

  useEffect(() => {
    loadMapping();
  }, [loadMapping]);

  /* ── Check RTG actual data status ── */
  useEffect(() => {
    let active = true;
    const checkStatus = async () => {
      setRtgStatusLoading(true);
      try {
        const res = await API.checkRtgStatus(startTime, endTime);
        if (active) {
          if (res?.success) {
            setRtgStatusOk(res.all_available);
            setRtgStatusMsg(res.message);
          } else {
            setRtgStatusOk(false);
            setRtgStatusMsg(res?.error ? `Error: ${res.error}` : "Error checking RTG status");
          }
        }
      } catch (err) {
        if (active) {
          setRtgStatusOk(false);
          setRtgStatusMsg("Failed to check RTG portal actuals status.");
        }
      } finally {
        if (active) setRtgStatusLoading(false);
      }
    };
    checkStatus();
    return () => {
      active = false;
    };
  }, [startTime, endTime]);

  /* ── Handle inline field changes ── */
  const updateRowField = (plantId, field, value) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.plant_id === plantId) {
          const updated = { ...r, [field]: value };
          if (field === "actual" || field === "schedule") {
            updated.deviation = (updated.actual ?? 0) - (updated.schedule ?? 0);
          }
          if (field === "actual" || field === "dc") {
            updated.pct_dc = updated.dc ? ((updated.actual ?? 0) / updated.dc) * 100 : 0.0;
          }
          return updated;
        }
        return r;
      })
    );
  };

  /* ── SCADA file selection ── */
  const buildUploadDetails = (reportRows) => {
    const metric = (values = []) => {
      const nums = (values || [])
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value));
      const nonZero = nums.filter((value) => value !== 0);
      const avg = nums.length ? nums.reduce((sum, value) => sum + value, 0) / nums.length : null;
      return {
        count: nums.length,
        nonZero: nonZero.length,
        avg,
        ok: nonZero.length > 0,
      };
    };

    return (reportRows || []).map((row) => ({
      plant_id: row.plant_id,
      plant_name: row.plant_name || row.STAGE_NAME || "",
      type: row.is_state ? "State" : "Generator",
      wbes_name: row.wbes_name || "",
      rtg_plant_id: row.rtg_plant_id || row.plant_id || "",
      scada_key: row.scada_key || "",
      scada_schedule_key: row.scada_schedule_key || "",
      scada_dc_key: row.scada_dc_key || "",
      actual_source: row.actual_source || "RTG",
      sched_src: row.sched_src || row.schedule_source || "RTG",
      dc_src: row.dc_src || row.dc_source || "RTG",
      update_actual: true,
      update_schedule: true,
      update_dc: true,
      actual_metric: metric(row.series?.actual),
      schedule_metric: metric(row.series?.schedule),
      dc_metric: metric(row.series?.dc),
      deviation_metric: metric(row.series?.deviation),
    }));
  };

  const ensureEventNameDraft = (fileObject) => {
    if (eventNameDraft.trim()) return;
    setEventNameDraft(eventDurationName());
  };

  const loadCrmsMessages = useCallback(async (rangeStart = startTime, rangeEnd = endTime) => {
    if (!rangeStart || !rangeEnd) return [];
    setCrmsStatus({ loading: true, error: "", fetched: false });
    try {
      const res = await API.getFrequencyCrmsMessages(rangeStart, rangeEnd);
      if (!res?.success) {
        const message = res?.error || "CRMS messages could not be loaded.";
        setCrmsMessages([]);
        setCrmsStatus({ loading: false, error: message, fetched: true });
        toast.error(message);
        return [];
      }
      const nextMessages = Array.isArray(res.messages) ? res.messages : [];
      setCrmsMessages(nextMessages);
      setCrmsStatus({ loading: false, error: "", fetched: true });
      return nextMessages;
    } catch (error) {
      const message = error?.message || "CRMS messages could not be loaded.";
      setCrmsMessages([]);
      setCrmsStatus({ loading: false, error: message, fetched: true });
      toast.error(message);
      return [];
    }
  }, [startTime, endTime]);

  const runSSEReport = async (fileId, fileObject, overrideRows = rows) => {
    const isHistoricalRun = fileId === "database" && !!selectedEventId;
    const selectedEvent = availableEvents.find((item) => item.event_id === selectedEventId);
    setDataLoading(true);
    setShowLogsModal(true);
    setLogsModalStatus("running");
    setLogsRunMode(isHistoricalRun ? "historical" : "report");
    setLogsErrorDetails("");
    setSyncLogs([
      "🚀 [SYSTEM] Initializing EventSource (SSE) pipeline...",
      "⏳ [SYSTEM] Selected Period: " + startTime + " to " + endTime,
      "⏳ [SYSTEM] Dispatching job parameters: file_id = " + fileId
    ]);

    if (isHistoricalRun) {
      setSyncLogs([
        "[MONGO] Preparing saved historical event load...",
        "[MONGO] Event: " + (selectedEvent?.name || selectedEventId),
        "[MONGO] Saved period: " + startTime + " to " + endTime,
        "[MONGO] No upload or remote data pull will run unless source data is missing."
      ]);
    }

    let jobRes;
    try {
      jobRes = await API.createFrequencyReportJob(fileId, startTime, endTime, overrideRows, fileId === "database" ? selectedEventId : "", eventType);
    } catch (err) {
      console.error("SSE job creation failed:", err);
      setSyncLogs((prev) => [...prev, "❌ [ERROR] Could not create backend report job."]);
      setLogsErrorDetails(err?.response?.data?.detail || err.message || "Backend job creation failed.");
      setLogsModalStatus("error");
      toast.dismiss();
      toast.error("Could not start report job.");
      setDataLoading(false);
      return;
    }

    if (!jobRes?.success || !jobRes?.job_id) {
      const errorMsg = jobRes?.error || "Backend did not return a report job id.";
      setSyncLogs((prev) => [...prev, `❌ [ERROR] ${errorMsg}`]);
      setLogsErrorDetails(errorMsg);
      setLogsModalStatus("error");
      toast.dismiss();
      toast.error("Could not start report job.");
      setDataLoading(false);
      return;
    }

    const sseUrl = API.getSSEUrl(jobRes.job_id);
    const eventSource = new EventSource(sseUrl);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.step) {
          setSyncLogs((prev) => [...prev, `⏳ [Step ${data.step}] ${data.message}`]);
        } else if (data.complete) {
          eventSource.close();
          const result = data.result;
          if (result.success) {
            const normalizedRows = (result.rows || []).map(normalizeReportRow);
            setRows(normalizedRows);
            if (result.report_notes) {
              setIntroDesc(result.report_notes.executive_summary || "");
              setStateDesc(result.report_notes.state_drawal_compliance || "");
              setGenDesc(result.report_notes.generator_scheduling_compliance || "");
              setStateObservation(result.report_notes.state_observation || result.report_notes.auto_state_observation || "");
              setGeneratorObservation(result.report_notes.generator_observation || result.report_notes.auto_generator_observation || "");
            }
            loadCrmsMessages(startTime, endTime);
            if (result.event_type) {
              setEventType(result.event_type);
            }
            setUploadDetailRows(buildUploadDetails(normalizedRows));
            setWbesLoaded(true);
            setRtgLoaded(true);
            setScadaLoaded(true);
            if (!result.from_saved_event) {
              setScadaFile(fileObject);
            }
            ensureEventNameDraft(fileObject);
            setShowLogsModal(false);
            setShowUploadDetailsModal(!result.from_saved_event || (result.missing_sources || []).length > 0);
            setSyncLogs((prev) => [
              ...prev,
              "✅ [SYSTEM] SSE Compliance report compilation successful!",
              ...(result.logs || [])
            ]);
            setLogsModalStatus("success");
            toast.dismiss();
            if (result.from_saved_event && (result.missing_sources || []).length > 0) {
              toast.error(`Loaded from Mongo. Missing source data for ${result.missing_sources.length} plant/source groups.`);
            } else {
              toast.success(result.from_saved_event ? "Historical event loaded from Mongo." : "Report compiled successfully!");
            }
            showModernPopup({
              type: result.missing_sources?.length ? "warning" : "success",
              title: result.from_saved_event ? "Historical Event Loaded" : "Report Compiled",
              subtitle: `${result.rows?.length || 0} Entities Loaded`,
              description: result.missing_sources?.length
                ? "Some saved source data is missing. Use the details table to decide what to fetch."
                : "Data loaded successfully.",
            });
            setDataLoading(false);
          } else {
            eventSource.close();
            const errorMsg = result.error || "Unknown error";
            setSyncLogs((prev) => [...prev, `❌ [ERROR] Report generation failed: ${errorMsg}`]);
            setLogsErrorDetails(result.traceback || "No traceback returned.");
            setLogsModalStatus("error");
            toast.dismiss();
            toast.error("Compilation failed: " + errorMsg);
            setDataLoading(false);
          }
        } else if (data.success === false) {
          eventSource.close();
          const errorMsg = data.error || "Unknown error";
          setSyncLogs((prev) => [...prev, `❌ [ERROR] Report execution failed: ${errorMsg}`]);
          setLogsErrorDetails(data.traceback || "No traceback returned.");
          setLogsModalStatus("error");
          toast.dismiss();
          toast.error("Execution failed: " + errorMsg);
          setDataLoading(false);
        }
      } catch (err) {
        console.error("SSE parse error:", err);
      }
    };

    eventSource.onerror = (err) => {
      console.error("SSE Connection error:", err);
      eventSource.close();
      setSyncLogs((prev) => [...prev, "❌ [CONNECTION ERROR] EventSource disconnected unexpectedly."]);
      setLogsModalStatus("error");
      toast.dismiss();
      toast.error("SSE connection failed.");
      setDataLoading(false);
    };
  };

  const handleFileSelect = async (file) => {
    setDataLoading(true);
    const loadingToast = toast.loading("Uploading SCADA file to workspace...");
    try {
      const uploadRes = await API.uploadTempFile(file);
      if (uploadRes?.success && uploadRes.file_id) {
        toast.success("File uploaded! Starting processing...", { id: loadingToast });
        await runSSEReport(uploadRes.file_id, file);
      } else {
        toast.error("File upload failed: " + (uploadRes?.error || "Unknown error"), { id: loadingToast });
        setDataLoading(false);
      }
    } catch (err) {
      console.error(err);
      toast.error("Error uploading SCADA file: " + err.message, { id: loadingToast });
      setDataLoading(false);
    }
  };

  const handleProcessReport = async () => {
    setStateObservation("");
    setGeneratorObservation("");
    if (useDatabase) {
      await runSSEReport("database", null);
      return;
    }
    if (!scadaFile) {
      toast.error("Please upload a frequency Excel file first.");
      return;
    }
    setDataLoading(true);
    const loadingToast = toast.loading("Preparing report recalculation...");
    try {
      const uploadRes = await API.uploadTempFile(scadaFile);
      if (uploadRes?.success && uploadRes.file_id) {
        toast.success("Re-sync initialized...", { id: loadingToast });
        await runSSEReport(uploadRes.file_id, scadaFile);
      } else {
        toast.error("Failed to upload active workspace file: " + (uploadRes?.error || "Unknown error"), { id: loadingToast });
        setDataLoading(false);
      }
    } catch (err) {
      console.error(err);
      toast.error("Error during report recalculation: " + err.message, { id: loadingToast });
      setDataLoading(false);
    }
  };

  const [showAuditPanel, setShowAuditPanel] = useState(false);
  const mappingFileInputRef = useRef(null);

  const saveBlobToFile = async (blob, filename) => {
    if (!(blob instanceof Blob)) {
      throw new Error("Backend did not return a downloadable file.");
    }
    if (blob.type?.includes("application/json")) {
      const text = await blob.text();
      try {
        const parsed = JSON.parse(text);
        throw new Error(parsed.error || parsed.message || text);
      } catch (jsonErr) {
        if (jsonErr.message && jsonErr.message !== text) throw jsonErr;
        throw new Error(text || "Backend returned an error response.");
      }
    }
    if (blob.size === 0) {
      throw new Error("Downloaded file is empty.");
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const updateUploadDetailRow = (plantId, field, value) => {
    setUploadDetailRows((prev) =>
      prev.map((item) => (item.plant_id === plantId ? { ...item, [field]: value } : item))
    );
  };

  const applyUploadSourceSetup = async () => {
    const detailByPlant = Object.fromEntries(uploadDetailRows.map((item) => [item.plant_id, item]));
    const nextRows = rows.map((row) => {
      const detail = detailByPlant[row.plant_id];
      if (!detail) return row;
      return {
        ...row,
        actual_source: detail.update_actual ? detail.actual_source : row.actual_source,
        sched_src: detail.update_schedule ? detail.sched_src : row.sched_src,
        schedule_source: detail.update_schedule ? detail.sched_src : row.schedule_source,
        dc_src: detail.update_dc ? detail.dc_src : row.dc_src,
        dc_source: detail.update_dc ? detail.dc_src : row.dc_source,
      };
    });
    setRows(nextRows);
    setShowUploadDetailsModal(false);

    const toastId = toast.loading("Applying source setup...");
    try {
      if (useDatabase) {
        toast.success("Source setup applied. Recalculating database event...", { id: toastId });
        await runSSEReport("database", null, nextRows);
        return;
      }
      if (!scadaFile) {
        toast.success("Source setup applied", { id: toastId });
        return;
      }
      const uploadRes = await API.uploadTempFile(scadaFile);
      if (uploadRes?.success && uploadRes.file_id) {
        toast.success("Source setup applied. Recalculating uploaded file...", { id: toastId });
        await runSSEReport(uploadRes.file_id, scadaFile, nextRows);
      } else {
        toast.error("Could not re-upload active file for recalculation.", { id: toastId });
      }
    } catch (e) {
      console.error(e);
      toast.error("Could not apply source setup: " + e.message, { id: toastId });
    }
  };

  const handleExportMapping = async () => {
    const loadingToast = toast.loading("Downloading mappings Excel...");
    try {
      const blob = await API.exportMapping();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `frequency_mapping_export.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Mappings Excel downloaded successfully", { id: loadingToast });
    } catch (e) {
      console.error(e);
      toast.error("Failed to export mapping: " + e.message, { id: loadingToast });
    }
  };

  const handleImportMappingClick = () => {
    mappingFileInputRef.current?.click();
  };

  const handleMappingFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const loadingToast = toast.loading("Importing mappings Excel...");
      try {
        const res = await API.importMapping(file);
        if (res?.success) {
          toast.success(res.message || "Mappings imported successfully", { id: loadingToast });
          await loadMapping();
        } else {
          const errs = res.errors || ["Unknown error during import"];
          toast.error("Import failed:\n" + errs.slice(0, 3).join("\n"), { id: loadingToast, duration: 6000 });
        }
      } catch (err) {
        console.error(err);
        toast.error("Import failed: " + err.message, { id: loadingToast });
      }
    }
    e.target.value = "";
  };

  /* ── Save mapping ── */
  const saveMapping = async (dirtyRows) => {
    setSaving(true);
    const saveToast = toast.loading("Saving configuration changes...");
    try {
      const res = await API.saveFrequencyPlantMapping(dirtyRows);
      if (!res?.success) {
        throw new Error(res?.error || "Mapping save failed");
      }
      toast.success(`Plant mapping updated (${res.matched ?? dirtyRows.length} matched)`, { id: saveToast });
      await loadMapping();
    } catch (e) {
      console.error(e);
      toast.error("Failed to save mapping changes", { id: saveToast });
    } finally {
      setSaving(false);
    }
  };

  /* ── Export handlers ── */
  const waitForHiddenCharts = () => new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve);
    });
  });

  const buildInteractiveChartsHtml = (selectedRows) => {
    const chartRows = selectedRows
      .filter((row) => row.series?.timestamps?.length > 0 && !row.is_frequency)
      .map((row) => ({
        plant_id: row.plant_id,
        plant_name: row.plant_name || row.entity || row.state || row.plant_id,
        is_state: !!row.is_state,
        type: row.type || (row.is_state ? "state" : "generator"),
        event_type: row.event_type || eventType,
        series: {
          timestamps: row.series?.timestamps || [],
          frequency: row.series?.frequency || [],
          deviation: row.series?.deviation || [],
          schedule: row.series?.schedule || [],
          actual: row.series?.actual || [],
          dc: row.series?.dc || [],
        },
        crms_messages: row.crms_messages || [],
      }));

    const payload = JSON.stringify({
      title: eventDurationName(),
      start_time: startTime,
      end_time: endTime,
      includeDeviation: exportIncludeDeviationPlot,
      includeStateScheduleActual: exportIncludeStateScheduleActualPlot,
      includeGeneratorScheduleActual: exportIncludeGeneratorScheduleActualPlot,
      rows: chartRows,
    }).replace(/<\/script/gi, "<\\/script");

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${eventDurationName()} - Annexure Charts</title>
  <script src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js"></script>
  <style>
    body { margin: 0; font-family: Inter, Arial, sans-serif; color: #0f172a; background: #f4f8fb; }
    header { position: sticky; top: 0; z-index: 5; background: #ffffff; border-bottom: 1px solid #d8e4ef; padding: 14px 20px; box-shadow: 0 8px 20px rgba(15, 23, 42, 0.05); }
    h1 { margin: 0 0 3px; font-size: 18px; font-weight: 900; }
    .meta { color: #64748b; font-size: 12px; font-weight: 700; }
    main { padding: 16px; display: grid; gap: 14px; }
    .card { background: #fff; border: 1px solid #d8e4ef; border-radius: 10px; padding: 12px; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.055); }
    .card-title { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; margin-bottom: 8px; }
    .card-title h2 { margin: 0; font-size: 14px; font-weight: 900; }
    .badge { border-radius: 999px; padding: 3px 8px; font-size: 11px; font-weight: 900; background: #eef2ff; color: #4338ca; }
    .chart { width: 100%; height: 520px; }
    .small { height: 380px; }
    .empty { padding: 28px; text-align: center; color: #64748b; font-weight: 800; background: #fff; border: 1px dashed #b9c9db; border-radius: 10px; }
    @media print { @page { size: A4 landscape; margin: 10mm; } header { position: static; } .card { break-inside: avoid; box-shadow: none; } }
  </style>
</head>
<body>
  <header>
    <h1>Annexure: Frequency Event Plots</h1>
    <div class="meta">${startTime} to ${endTime} | Hover chart lines and CRMS pins for details</div>
  </header>
  <main id="charts"></main>
  <script>
    const report = ${payload};
    const root = document.getElementById("charts");
    const clean = (arr) => (Array.isArray(arr) ? arr.map((v) => Number.isFinite(Number(v)) ? Number(v) : null) : []);
    const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]));
    const parseTs = (v) => {
      const d = new Date(String(v || "").replace(" ", "T"));
      return Number.isNaN(d.getTime()) ? null : d;
    };
    const fmtTime = (ts) => {
      const raw = String(ts || "").replace("T", " ");
      const parts = raw.split(" ");
      if (parts.length < 2) return raw;
      const date = parts[0].split("-");
      const time = parts[1].split(":");
      if (date.length < 3 || time.length < 2) return raw;
      return date[2] + "-" + date[1] + "-" + date[0].slice(-2) + " " + time[0] + ":" + time[1];
    };
    const categoryColors = {
      "alert": "#FACC15",
      "emergency": "#F97316",
      "extreme emergency": "#DC2626",
      "non-compliance": "#111827",
      "noncompliance": "#111827",
    };
    const categoryOrder = ["Alert", "Emergency", "Extreme Emergency", "Non-compliance"];
    const crmsCategory = (message) => {
      const raw = Array.isArray(message.category) ? message.category[0] : message.category;
      return String(raw || message.violation_type || "Message").trim();
    };
    const crmsLegendName = (message) => categoryOrder.find((item) => item.toLowerCase() === crmsCategory(message).toLowerCase()) || crmsCategory(message);
    const crmsColor = (message) => categoryColors[crmsCategory(message).toLowerCase()] || "#2563EB";
    const crmsIssueTime = (message) => {
      const raw = String(message.message_date || message.timestamp || "");
      const timePart = raw.includes(" ") ? raw.split(" ")[1] : raw.includes("T") ? raw.split("T")[1] : raw;
      const parts = String(timePart || "").split(":");
      return parts[0] && parts[1] ? parts[0] + ":" + parts[1] + " hrs" : raw;
    };
    const messageSymbol = "path://M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z";
    const nearestMarkerData = (row, devs, actuals) => {
      const timestamps = row.series.timestamps || [];
      const parsed = timestamps.map(parseTs);
      const first = parsed.find(Boolean);
      const last = [...parsed].reverse().find(Boolean);
      if (!first || !last) return [];
      return (row.crms_messages || []).map((msg, idx) => {
        const mt = parseTs(msg.timestamp || msg.message_date);
        if (!mt || mt < first || mt > last) return null;
        let nearest = -1;
        let diff = Infinity;
        parsed.forEach((ts, i) => {
          if (!ts) return;
          const d = Math.abs(ts.getTime() - mt.getTime());
          if (d < diff) { diff = d; nearest = i; }
        });
        if (nearest < 0) return null;
        const base = devs[nearest] ?? actuals[nearest] ?? 0;
        return { value: [timestamps[nearest], base + ((idx % 5) - 2) * 8], crms: msg };
      }).filter(Boolean);
    };
    const markerSeriesByCategory = (markers) => {
      const grouped = new Map();
      markers.forEach((marker) => {
        const name = crmsLegendName(marker.crms || {});
        if (!grouped.has(name)) grouped.set(name, []);
        grouped.get(name).push(marker);
      });
      return Array.from(grouped.entries()).sort(([a], [b]) => {
        const ai = categoryOrder.indexOf(a);
        const bi = categoryOrder.indexOf(b);
        return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi) || a.localeCompare(b);
      }).map(([name, data]) => ({
        name,
        type: "scatter",
        data,
        yAxisIndex: 0,
        symbol: messageSymbol,
        symbolSize: 30,
        itemStyle: { color: crmsColor({ category: name }), borderColor: "#fff", borderWidth: 2 },
        label: { show: false },
        tooltip: { trigger: "item", formatter: (p) => crmsHtml(p.data?.crms || {}) },
        z: 20,
      }));
    };
    const crmsHtml = (message) => {
      const category = crmsCategory(message);
      const color = crmsColor(message);
      let html = '<div style="font-size:12px;line-height:1.4;min-width:240px">';
      html += '<div style="font-weight:900;color:' + color + ';margin-bottom:4px">' + esc(category) + '</div>';
      html += '<div><span style="color:#64748B">Issue time:</span> ' + esc(crmsIssueTime(message)) + '</div>';
      if (message.message_no) html += '<div><span style="color:#64748B">Message no:</span> ' + esc(message.message_no) + '</div>';
      if (message.issued_by) html += '<div><span style="color:#64748B">Issued by:</span> ' + esc(message.issued_by) + '</div>';
      if (message.remarks) html += '<div style="margin-top:4px;color:#334155;font-weight:800">' + esc(message.remarks) + '</div>';
      html += '</div>';
      return html;
    };
    const eventMeta = (row) => {
      const high = row.event_type === "high";
      const type = row.is_state ? "state" : "generator";
      if (high && type === "state") {
        return {
          threshold: 50.05,
          isEvent: (f) => f > 50.05,
          isHelping: (d) => d > 0,
          helping: { color: "rgba(234,179,8,0.30)", label: "Helping Grid (Gold Shade)" },
          adverse: { color: "rgba(6,182,212,0.30)", label: "Under Drawal (Cyan Shade)" },
        };
      }
      if (high) {
        return {
          threshold: 50.05,
          isEvent: (f) => f > 50.05,
          isHelping: (d) => d < 0,
          helping: { color: "rgba(16,185,129,0.30)", label: "Helping Grid (Green Shade)" },
          adverse: { color: "rgba(249,115,22,0.32)", label: "Over Injection (Orange Shade)" },
        };
      }
      return {
        threshold: 49.9,
        isEvent: (f) => f < 49.9,
        isHelping: (d) => (type === "state" ? d < 0 : d > 0),
        helping: type === "state"
          ? { color: "rgba(6,182,212,0.30)", label: "Helping Grid (Cyan Shade)" }
          : { color: "rgba(16,185,129,0.30)", label: "Helping Grid (Green Shade)" },
        adverse: {
          color: type === "state" ? "rgba(234,179,8,0.30)" : "rgba(249,115,22,0.32)",
          label: type === "state" ? "Over Drawal (Gold Shade)" : "Under Injection (Orange Shade)",
        },
      };
    };
    const shadedDeviationData = (row, freq, dev) => {
      const meta = eventMeta(row);
      const helping = [];
      const adverse = [];
      dev.forEach((d, i) => {
        const f = freq[i];
        if (f === null || d === null || !meta.isEvent(f)) {
          helping.push(0);
          adverse.push(0);
          return;
        }
        if (meta.isHelping(d)) {
          helping.push(d);
          adverse.push(0);
        } else {
          helping.push(0);
          adverse.push(d);
        }
      });
      return { meta, helping, adverse };
    };
    const makeDeviationOption = (row) => {
      const timestamps = row.series.timestamps || [];
      const freq = clean(row.series.frequency);
      const dev = clean(row.series.deviation);
      const actual = clean(row.series.actual);
      const maxAbs = Math.max(50, ...dev.filter((v) => v !== null).map((v) => Math.abs(v)));
      const shaded = shadedDeviationData(row, freq, dev);
      const threshold = shaded.meta.threshold;
      const freqLineColor = row.is_state ? "#7C3AED" : "#1D4ED8";
      const markers = nearestMarkerData(row, dev, actual);
      const markerSeries = markerSeriesByCategory(markers);
      return {
        animation: false,
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "cross" },
          backgroundColor: "rgba(255,255,255,0.98)",
          borderColor: "#CBD5E1",
          borderWidth: 1,
          textStyle: { color: "#1E293B", fontSize: 12, fontWeight: 700 },
          formatter: (params) => {
            const list = Array.isArray(params) ? params : [params];
            const ts = list[0]?.axisValue || "";
            let html = '<div style="border-bottom:1px solid #CBD5E1;padding-bottom:5px;margin-bottom:6px;font-size:11px;color:#64748B">' + esc(fmtTime(ts)) + '</div>';
            list.forEach((p) => {
              if (p.data?.crms) {
                html += '<div style="margin-top:7px;padding-top:7px;border-top:1px solid #CBD5E1">' + crmsHtml(p.data.crms) + '</div>';
                return;
              }
              const val = Array.isArray(p.value) ? p.value[1] : p.value;
              if (val == null) return;
              html += '<div><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + p.color + ';margin-right:6px"></span>' + esc(p.seriesName) + ': <strong>' + Number(val).toFixed(p.seriesName.includes("Hz") ? 3 : 0) + '</strong></div>';
            });
            return html;
          },
        },
        title: {
          text: (row.plant_name || "Entity") + ": Frequency (Hz) vs Deviation (MW)",
          subtext: (row.event_type === "high" ? "High" : "Low") + " Frequency Operation: " + fmtTime(timestamps[0] || "") + " to " + fmtTime(timestamps[timestamps.length - 1] || ""),
          left: 8,
          top: 4,
          textStyle: { fontSize: 15, fontWeight: 900, color: "#0F172A" },
          subtextStyle: { fontSize: 11, fontWeight: 800, color: "#475569" },
        },
        legend: {
          top: 44,
          type: "scroll",
          textStyle: { fontWeight: 800 },
          data: [
            shaded.meta.helping.label,
            shaded.meta.adverse.label,
            "Deviation (MW)",
            "Frequency (Hz)",
            ...markerSeries.map((series) => ({ name: series.name, icon: messageSymbol })),
          ],
        },
        grid: { top: 94, left: 58, right: 62, bottom: 58 },
        dataZoom: [{ type: "inside" }, { type: "slider", height: 18, bottom: 18 }],
        xAxis: { type: "category", data: timestamps, boundaryGap: false, axisLabel: { fontWeight: 700, formatter: fmtTime } },
        yAxis: [
          { type: "value", name: "MW", min: -maxAbs, max: maxAbs, axisLabel: { fontWeight: 700 } },
          { type: "value", name: "Hz", min: 49.4, max: 50.6, position: "right", axisLabel: { fontWeight: 800, color: "#7C3AED" } },
        ],
        series: [
          { name: shaded.meta.helping.label, type: "line", data: shaded.helping, yAxisIndex: 0, symbol: "none", lineStyle: { width: 0 }, itemStyle: { color: shaded.meta.helping.color }, areaStyle: { color: shaded.meta.helping.color }, emphasis: { disabled: true }, z: 1 },
          { name: shaded.meta.adverse.label, type: "line", data: shaded.adverse, yAxisIndex: 0, symbol: "none", lineStyle: { width: 0 }, itemStyle: { color: shaded.meta.adverse.color }, areaStyle: { color: shaded.meta.adverse.color }, emphasis: { disabled: true }, z: 1 },
          { name: "Deviation (MW)", type: "line", data: dev, yAxisIndex: 0, symbol: "none", lineStyle: { width: 3.2, color: row.is_state ? "#059669" : "#DC2626" }, itemStyle: { color: row.is_state ? "#059669" : "#DC2626" } },
          { name: "Frequency (Hz)", type: "line", data: freq, yAxisIndex: 1, symbol: "none", lineStyle: { width: 2.8, color: freqLineColor }, itemStyle: { color: freqLineColor }, markLine: { silent: true, symbol: "none", data: [{ yAxis: threshold }], lineStyle: { color: "#EF4444", type: "dashed", width: 1.4 }, label: { formatter: threshold + " Hz", color: "#DC2626", fontWeight: 900 } } },
          ...markerSeries,
        ],
      };
    };
    const makeScheduleOption = (row) => {
      const timestamps = row.series.timestamps || [];
      return {
        animation: false,
        tooltip: { trigger: "axis", axisPointer: { type: "cross" } },
        legend: { top: 4, textStyle: { fontWeight: 800 } },
        grid: { top: 52, left: 58, right: 26, bottom: 58 },
        dataZoom: [{ type: "inside" }, { type: "slider", height: 18, bottom: 18 }],
        xAxis: { type: "category", data: timestamps, boundaryGap: false, axisLabel: { fontWeight: 700 } },
        yAxis: { type: "value", name: "MW", axisLabel: { fontWeight: 700 } },
        series: [
          { name: "Schedule (MW)", type: "line", data: clean(row.series.schedule), symbol: "none", lineStyle: { width: 2.8, color: "#4F46E5" }, itemStyle: { color: "#4F46E5" } },
          { name: "Actual (MW)", type: "line", data: clean(row.series.actual), symbol: "none", lineStyle: { width: 3, color: "#DB2777" }, itemStyle: { color: "#DB2777" } },
          { name: "DC (MW)", type: "line", data: clean(row.series.dc), symbol: "none", lineStyle: { width: 2.2, color: "#F59E0B" }, itemStyle: { color: "#F59E0B" } },
        ],
      };
    };
    const addCard = (row, kind, option) => {
      const card = document.createElement("section");
      card.className = "card";
      const annexureLabel = row.is_state ? "Annexure 1" : "Annexure 2";
      card.innerHTML = '<div class="card-title"><h2>' + annexureLabel + ': ' + esc(row.plant_name) + '</h2><span class="badge">' + esc(kind) + '</span></div><div class="chart ' + (kind.includes("Schedule") ? "small" : "") + '"></div>';
      root.appendChild(card);
      const chart = echarts.init(card.querySelector(".chart"));
      chart.setOption(option);
      window.addEventListener("resize", () => chart.resize());
    };
    if (!report.rows.length) {
      root.innerHTML = '<div class="empty">No selected chart rows available for this export.</div>';
    } else {
      report.rows.forEach((row) => {
        if (report.includeDeviation) addCard(row, "Annexure - Deviation / Frequency", makeDeviationOption(row));
        if (row.is_state && report.includeStateScheduleActual) addCard(row, "Annexure - State Schedule / Actual", makeScheduleOption(row));
        if (!row.is_state && report.includeGeneratorScheduleActual) addCard(row, "Annexure - Generator Schedule / Actual", makeScheduleOption(row));
      });
    }
  </script>
</body>
</html>`;
  };

  const handleExportHtml = async () => {
    setExportingHtml(true);
    const expToast = toast.loading("Preparing interactive HTML charts...");
    try {
      if (!exportRows.some((row) => !row.is_frequency)) {
        throw new Error("Select at least one state or generator for HTML export.");
      }
      if (!exportIncludeDeviationPlot && !exportIncludeStateScheduleActualPlot && !exportIncludeGeneratorScheduleActualPlot) {
        throw new Error("Select at least one chart type for HTML export.");
      }
      const html = buildInteractiveChartsHtml(exportRows);
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      await saveBlobToFile(blob, `${eventDurationName()}_annexure.html`);
      toast.success("HTML annexure downloaded", { id: expToast });
    } catch (e) {
      console.error(e);
      toast.error("Error preparing HTML charts: " + e.message, { id: expToast });
    } finally {
      setExportingHtml(false);
    }
  };

  const handleExportDocx = async () => {
    setExportingDocx(true);
    const expToast = toast.loading("Generating Word document...");
    try {
      if (!exportRows.some((row) => !row.is_frequency)) {
        throw new Error("Select at least one state or generator for export.");
      }
      const includeAnnexure = exportReportMode === "with_annexure";
      if (includeAnnexure) await waitForHiddenCharts();
      // Gather base64 images from chartRefs for all entities that have series data
      const updatedRows = exportRows.map((row) => {
        const ref = chartRefs.current[row.plant_id];
        const capRef = capacityChartRefs.current[row.plant_id];
        const includeScheduleActual = row.is_state ? exportIncludeStateScheduleActualPlot : exportIncludeGeneratorScheduleActualPlot;
        const plot_image = includeAnnexure && exportIncludeDeviationPlot && ref ? ref.getDataURL() : null;
        const capacity_plot_image = includeAnnexure && includeScheduleActual && capRef ? capRef.getDataURL() : null;
        // Strip out metadata prefix for python base64 decoding
        const stripped_image = plot_image ? plot_image.replace(/^data:image\/png;base64,/, "") : null;
        const stripped_capacity_image = capacity_plot_image ? capacity_plot_image.replace(/^data:image\/png;base64,/, "") : null;
        return {
          ...row,
          plot_image: stripped_image,
          capacity_plot_image: stripped_capacity_image,
        };
      });

      const payload = {
        intro_desc: introDesc,
        gen_desc: [genDesc, generatorObservation].filter(Boolean).join("\n\n"),
        state_desc: [stateDesc, stateObservation].filter(Boolean).join("\n\n"),
        event_type: eventType,
        report_mode: exportReportMode,
        include_annexure: includeAnnexure,
        rows: updatedRows,
        start_time: startTime,
        end_time: endTime,
      };

      const blob = await API.downloadFrequencyDocx(payload);
      await saveBlobToFile(blob, `${eventDurationName()}.docx`);
      toast.success("Word report downloaded", { id: expToast });
    } catch (e) {
      console.error(e);
      toast.error("Error downloading Word report: " + e.message, { id: expToast });
    } finally {
      setExportingDocx(false);
    }
  };

  const handleExportPdf = async () => {
    setExportingPdf(true);
    const expToast = toast.loading("Generating PDF document...");
    try {
      if (!exportRows.some((row) => !row.is_frequency)) {
        throw new Error("Select at least one state or generator for export.");
      }
      const includeAnnexure = exportReportMode === "with_annexure";
      if (includeAnnexure) await waitForHiddenCharts();
      // Gather base64 images from chartRefs
      const updatedRows = exportRows.map((row) => {
        const ref = chartRefs.current[row.plant_id];
        const capRef = capacityChartRefs.current[row.plant_id];
        const includeScheduleActual = row.is_state ? exportIncludeStateScheduleActualPlot : exportIncludeGeneratorScheduleActualPlot;
        const plot_image = includeAnnexure && exportIncludeDeviationPlot && ref ? ref.getDataURL() : null;
        const capacity_plot_image = includeAnnexure && includeScheduleActual && capRef ? capRef.getDataURL() : null;
        const stripped_image = plot_image ? plot_image.replace(/^data:image\/png;base64,/, "") : null;
        const stripped_capacity_image = capacity_plot_image ? capacity_plot_image.replace(/^data:image\/png;base64,/, "") : null;
        return {
          ...row,
          plot_image: stripped_image,
          capacity_plot_image: stripped_capacity_image,
        };
      });

      const blob = await API.downloadFrequencyPdf({
        rows: updatedRows,
        event_type: eventType,
        report_mode: exportReportMode,
        include_annexure: includeAnnexure,
        intro_desc: introDesc,
        gen_desc: [genDesc, generatorObservation].filter(Boolean).join("\n\n"),
        state_desc: [stateDesc, stateObservation].filter(Boolean).join("\n\n"),
        start_time: startTime,
        end_time: endTime,
      });
      await saveBlobToFile(blob, `${eventDurationName()}.pdf`);
      toast.success("PDF report downloaded", { id: expToast });
    } catch (e) {
      console.error(e);
      toast.error("Error downloading PDF report: " + e.message, { id: expToast });
    } finally {
      setExportingPdf(false);
    }
  };

  const handleExportExcel = async () => {
    setExportingExcel(true);
    const expToast = toast.loading("Generating Excel workbook...");
    try {
      if (!exportRows.some((row) => !row.is_frequency)) {
        throw new Error("Select at least one state or generator for export.");
      }
      const payload = {
        executive_summary: introDesc,
        start_time: startTime,
        end_time: endTime,
        event_type: eventType,
        rows: exportRows,
      };
      const blob = await API.downloadFrequencyExcel(payload);
      await saveBlobToFile(blob, `${eventDurationName()}.xlsx`);
      toast.success("Excel sheet downloaded", { id: expToast });
    } catch (e) {
      console.error(e);
      toast.error("Error downloading Excel summary: " + e.message, { id: expToast });
    } finally {
      setExportingExcel(false);
    }
  };

  const rowsWithCrmsMessages = useMemo(() => {
    return mapCrmsMessagesToRows(rows, crmsMessages);
  }, [rows, crmsMessages]);

  const crmsMappedCount = useMemo(() => {
    return rowsWithCrmsMessages.reduce((sum, row) => sum + (row.crms_messages?.length || 0), 0);
  }, [rowsWithCrmsMessages]);

  const stateRows = useMemo(() => {
    return rowsWithCrmsMessages.filter((r) => r.is_state && !r.is_frequency);
  }, [rowsWithCrmsMessages]);

  const generatorRows = useMemo(() => {
    return rowsWithCrmsMessages.filter((r) => !r.is_state && !r.is_frequency);
  }, [rowsWithCrmsMessages]);

  const autoObservations = useMemo(() => {
    const isHigh = eventType === "high";
    const groups = Array.from(new Set(generatorRows.map(generatorSectionLabel)))
      .sort((a, b) => sectionRank(a) - sectionRank(b) || a.localeCompare(b));
    const sectionStats = groups.map((label) => {
      const sectionRows = generatorRows.filter((row) => generatorSectionLabel(row) === label);
      const minPct = fleetMinGenerationPct(sectionRows);
      const majorUnderInjection = sectionRows
        .map((row) => ({ row, minDev: minSeries(row.series?.deviation || []) }))
        .filter((item) => item.minDev !== null)
        .sort((a, b) => a.minDev - b.minDev)[0];
      return {
        label,
        count: sectionRows.length,
        minPct,
        majorUnderInjection,
      };
    });

    const majorViolators = generatorRows
      .map((row) => ({ row, minPct: minGenerationPct(row) }))
      .filter((item) => item.minPct !== null)
      .sort((a, b) => a.minPct - b.minPct)
      .slice(0, 5);
    const majorOverInjection = generatorRows
      .map((row) => ({ row, maxDev: maxSeries(row.series?.deviation || []) }))
      .filter((item) => item.maxDev !== null)
      .sort((a, b) => b.maxDev - a.maxDev)
      .slice(0, 3);
    const majorUnderDrawal = stateRows
      .map((row) => ({ row, value: Number(row.statistics?.max_ud) }))
      .filter((item) => Number.isFinite(item.value))
      .sort((a, b) => a.value - b.value)
      .slice(0, 3);
    const majorOverDrawal = stateRows
      .map((row) => ({ row, value: Number(row.statistics?.max_od) }))
      .filter((item) => Number.isFinite(item.value))
      .sort((a, b) => b.value - a.value)
      .slice(0, 3);

    const generatorBullets = [];
    const stateBullets = [];
    if (isHigh) {
      sectionStats.forEach((section) => {
        if (section.minPct !== null) {
          generatorBullets.push(`${section.label}: fleet minimum generation achieved ${fmtPctText(section.minPct)} of 94% capacity on bar across ${section.count} unit(s).`);
        }
      });
      if (majorViolators.length) {
        generatorBullets.push(`Major generator MTDL violators: ${majorViolators.map((item) => `${item.row.plant_name} (${fmtPctText(item.minPct)})`).join(", ")}.`);
      }
      if (majorOverInjection.length) {
        generatorBullets.push(`Major over-injection by generator: ${majorOverInjection.map((item) => `${item.row.plant_name} (${fmtMwText(item.maxDev)})`).join(", ")}.`);
      }
      if (majorUnderDrawal.length) {
        stateBullets.push(`Major under-drawal by state: ${majorUnderDrawal.map((item) => `${item.row.plant_name} (${fmtMwText(item.value)})`).join(", ")}.`);
      }
    } else {
      sectionStats.forEach((section) => {
        if (section.majorUnderInjection) {
          generatorBullets.push(`Major under-injection in ${section.label}: ${section.majorUnderInjection.row.plant_name} (${fmtMwText(section.majorUnderInjection.minDev)}).`);
        }
      });
      if (majorOverDrawal.length) {
        stateBullets.push(`Major over-drawal by state: ${majorOverDrawal.map((item) => `${item.row.plant_name} (${fmtMwText(item.value)})`).join(", ")}.`);
      }
    }

    return {
      sectionStats,
      generatorBullets,
      stateBullets,
      generatorText: generatorBullets.join("\n"),
      stateText: stateBullets.join("\n"),
    };
  }, [eventType, generatorRows, stateRows]);

  useEffect(() => {
    setStateObservation((prev) => prev || autoObservations.stateText || "");
    setGeneratorObservation((prev) => prev || autoObservations.generatorText || "");
  }, [autoObservations.stateText, autoObservations.generatorText]);

  const exportStateOptions = useMemo(() => stateRows.map((row) => ({
    id: row.plant_id,
    label: row.plant_name || row.state || row.plant_id,
  })), [stateRows]);

  const exportGeneratorOptions = useMemo(() => generatorRows.map((row) => ({
    id: row.plant_id,
    label: row.plant_name || row.entity || row.plant_id,
    state: row.state || "ER",
    fuel: row.fuel || "-",
  })), [generatorRows]);

  const exportFuelOptions = useMemo(() => {
    const fuels = Array.from(new Set(exportGeneratorOptions.map((item) => item.fuel).filter(Boolean))).sort();
    return ["ALL_FUELS", ...fuels];
  }, [exportGeneratorOptions]);

  useEffect(() => {
    setSelectedExportStateIds((prev) => {
      const valid = new Set(exportStateOptions.map((item) => item.id));
      const kept = prev.filter((id) => valid.has(id));
      return kept.length ? kept : exportStateOptions.map((item) => item.id);
    });
  }, [exportStateOptions]);

  useEffect(() => {
    setSelectedExportGeneratorIds((prev) => {
      const valid = new Set(exportGeneratorOptions.map((item) => item.id));
      const kept = prev.filter((id) => valid.has(id));
      return kept.length ? kept : exportGeneratorOptions.map((item) => item.id);
    });
  }, [exportGeneratorOptions]);

  const filteredExportGeneratorOptions = useMemo(() => {
    const needle = exportGeneratorFilter.trim().toLowerCase();
    return exportGeneratorOptions.filter((item) =>
      (exportFuelFilter === "ALL_FUELS" || item.fuel === exportFuelFilter) &&
      (!needle || `${item.label} ${item.state} ${item.fuel}`.toLowerCase().includes(needle))
    );
  }, [exportFuelFilter, exportGeneratorFilter, exportGeneratorOptions]);

  const exportRows = useMemo(() => {
    const stateIds = new Set(selectedExportStateIds);
    const generatorIds = new Set(selectedExportGeneratorIds);
    return rowsWithCrmsMessages.filter((row) => {
      if (row.is_frequency) return true;
      if (row.is_state) return stateIds.has(row.plant_id);
      if (exportFuelFilter !== "ALL_FUELS" && (row.fuel || "-") !== exportFuelFilter) return false;
      return generatorIds.has(row.plant_id);
    });
  }, [rowsWithCrmsMessages, selectedExportStateIds, selectedExportGeneratorIds, exportFuelFilter]);

  const exportChartRows = useMemo(() => exportRows.filter((row) => (
    row.series?.timestamps?.length > 0 &&
    (
      exportIncludeDeviationPlot ||
      (row.is_state && exportIncludeStateScheduleActualPlot) ||
      (!row.is_state && exportIncludeGeneratorScheduleActualPlot)
    )
  )), [exportRows, exportIncludeDeviationPlot, exportIncludeStateScheduleActualPlot, exportIncludeGeneratorScheduleActualPlot]);

  const toggleExportState = (id) => {
    setSelectedExportStateIds((prev) => (
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    ));
  };

  const toggleExportGenerator = (id) => {
    setSelectedExportGeneratorIds((prev) => (
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    ));
  };

  const openExportSelection = (type) => {
    setPendingExportType(type);
  };

  const confirmPendingExport = async () => {
    const type = pendingExportType;
    setPendingExportType(null);
    if (type === "pdf") {
      await handleExportPdf();
      return;
    }
    if (type === "docx") {
      await handleExportDocx();
      return;
    }
    if (type === "excel") {
      await handleExportExcel();
      return;
    }
    if (type === "html") {
      await handleExportHtml();
    }
  };

  const toggleRowExpansion = (plantId) => {
    setExpandedRowIds((prev) => (
      prev.includes(plantId)
        ? prev.filter((id) => id !== plantId)
        : [...prev, plantId]
    ));
  };

  const expandRows = (rowList) => {
    setExpandedRowIds((prev) => Array.from(new Set([
      ...prev,
      ...rowList.map((row) => row.plant_id)
    ])));
  };

  const collapseRows = (rowList) => {
    const ids = new Set(rowList.map((row) => row.plant_id));
    setExpandedRowIds((prev) => prev.filter((id) => !ids.has(id)));
  };

  const renderAuditPanel = () => {
    if (!scadaLoaded || rows.length === 0) return null;
    return (
      <div 
        style={{
          background: "#FFFFFF",
          border: "1px solid #E2E8F0",
          borderRadius: "16px",
          marginBottom: "20px",
          overflow: "hidden",
          boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.02)",
        }}
      >
        <button
          onClick={() => setShowAuditPanel(!showAuditPanel)}
          style={{
            width: "100%",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "16px 20px",
            background: "#F8FAFC",
            border: "none",
            borderBottom: showAuditPanel ? "1px solid #E2E8F0" : "none",
            cursor: "pointer",
            textAlign: "left",
            outline: "none"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "1.1rem" }}>🔍</span>
            <div>
              <h3 style={{ margin: 0, fontSize: "0.86rem", fontWeight: 800, color: "#1E293B" }}>
                Data Source Audit Panel
              </h3>
              <p style={{ margin: 0, fontSize: "0.7rem", color: "#64748B" }}>
                Review resolved telemetry source components and cache status per plant.
              </p>
            </div>
          </div>
          <span style={{ fontSize: "0.8rem", color: "#64748B", fontWeight: 700 }}>
            {showAuditPanel ? "Collapse ▲" : "Expand ▼"}
          </span>
        </button>
        {showAuditPanel && (
          <div style={{ padding: "20px" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.76rem" }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #F1F5F9", textAlign: "left" }}>
                    <th style={{ padding: "10px 12px", color: "#475569", fontWeight: 700 }}>Plant Name</th>
                    <th style={{ padding: "10px 12px", color: "#475569", fontWeight: 700 }}>Type</th>
                    <th style={{ padding: "10px 12px", color: "#475569", fontWeight: 700 }}>Actual Source</th>
                    <th style={{ padding: "10px 12px", color: "#475569", fontWeight: 700 }}>Schedule Source</th>
                    <th style={{ padding: "10px 12px", color: "#475569", fontWeight: 700 }}>DC Source</th>
                    <th style={{ padding: "10px 12px", color: "#475569", fontWeight: 700 }}>Identifier / Acronym</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, idx) => (
                    <tr 
                      key={r.plant_id} 
                      style={{ 
                        borderBottom: "1px solid #F1F5F9", 
                        background: idx % 2 === 0 ? "#FFFFFF" : "#F8FAFC"
                      }}
                    >
                      <td style={{ padding: "10px 12px", fontWeight: 700, color: "#334155" }}>
                        {r.plant_name}
                      </td>
                      <td style={{ padding: "10px 12px", color: "#64748B" }}>
                        {r.type || (r.is_state ? "State" : "IPP")}
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <span 
                          style={{
                            padding: "3px 8px",
                            borderRadius: "12px",
                            fontWeight: 700,
                            fontSize: "0.68rem",
                            background: r.actual_source === "SCADA" ? "#EFF6FF" : "#F0FDF4",
                            color: r.actual_source === "SCADA" ? "#1D4ED8" : "#15803D"
                          }}
                        >
                          {r.actual_source || "RTG"}
                        </span>
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <span 
                          style={{
                            padding: "3px 8px",
                            borderRadius: "12px",
                            fontWeight: 700,
                            fontSize: "0.68rem",
                            background: r.sched_src === "WBES" ? "#F0F9FF" : r.sched_src === "Manual" ? "#FFF7ED" : "#F0FDF4",
                            color: r.sched_src === "WBES" ? "#0369A1" : r.sched_src === "Manual" ? "#C2410C" : "#15803D"
                          }}
                        >
                          {r.sched_src || "RTG"}
                        </span>
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <span 
                          style={{
                            padding: "3px 8px",
                            borderRadius: "12px",
                            fontWeight: 700,
                            fontSize: "0.68rem",
                            background: r.dc_src === "WBES" ? "#F0F9FF" : r.dc_src === "Manual" ? "#FFF7ED" : "#F0FDF4",
                            color: r.dc_src === "WBES" ? "#0369A1" : r.dc_src === "Manual" ? "#C2410C" : "#15803D"
                          }}
                        >
                          {r.dc_src || "RTG"}
                        </span>
                      </td>
                      <td style={{ padding: "10px 12px", color: "#475569", fontFamily: "monospace" }}>
                        {r.sched_src === "WBES" ? r.wbes_name : r.rtg_plant_id || r.plant_id}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  };

  const rawEditorColumns = [
    { key: "actual", label: "RTG Actual", color: "#0F172A", values: rawEditorActual },
    { key: "scada_file_actual", label: "SCADA File Actual", color: "#C2410C", values: rawEditorScadaFileActual },
    { key: "rtg_schedule", label: "RTG Schedule", color: "#15803D", values: rawEditorRtgSchedule },
    { key: "wbes_schedule", label: "WBES Schedule", color: "#0369A1", values: rawEditorWbesSchedule },
    { key: "scada_file_schedule", label: "SCADA File Schedule", color: "#F97316", values: rawEditorScadaFileSchedule },
    { key: "rtg_dc", label: "RTG DC", color: "#047857", values: rawEditorRtgDC },
    { key: "wbes_dc", label: "WBES DC", color: "#1D4ED8", values: rawEditorWbesDC },
    { key: "scada_file_dc", label: "SCADA File DC", color: "#EA580C", values: rawEditorScadaFileDC },
  ];

  return (
    <AppShell>
      <Toaster position="top-right" reverseOrder={false} />

      <ReportHeader
        startTime={startTime}
        setStartTime={setStartTime}
        endTime={endTime}
        setEndTime={setEndTime}
        eventType={eventType}
        onEventTypeChange={handleEventTypeChange}
        rtgStatusMsg={rtgStatusMsg}
        rtgStatusOk={rtgStatusOk}
        rtgStatusLoading={rtgStatusLoading}
        wbesLoaded={wbesLoaded}
        rtgLoaded={rtgLoaded}
        scadaLoaded={scadaLoaded}
        scadaFile={scadaFile}
        onFileSelect={handleFileSelect}
        onUploadClick={handleUploadClick}
        onProcessReport={handleProcessReport}
        dataLoading={dataLoading}
        showSchAct={showSchAct}
        setShowSchAct={setShowSchAct}
        syncLogs={syncLogs}
        onViewLogsClick={() => setShowLogsModal(true)}
        availableDates={availableDates}
        availableEvents={availableEvents}
        selectedEventId={selectedEventId}
        onSelectEvent={handleSelectEvent}
        onDeleteEvent={handleDeleteEvent}
        eventNameDraft={eventNameDraft}
        setEventNameDraft={setEventNameDraft}
        onCreateEvent={handleCreateEvent}
        selectedDbDate={selectedDbDate}
        setSelectedDbDate={setSelectedDbDate}
        useDatabase={useDatabase}
        setUseDatabase={setUseDatabase}
        onResyncSource={handleResyncSource}
      />

      {/* ── TABS SELECTOR ─────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          gap: "8px",
          marginBottom: "16px",
          padding: "6px",
          background: "linear-gradient(135deg, #EEF5FF 0%, #F8FBFF 100%)",
          border: "1px solid rgba(175, 196, 234, 0.82)",
          borderRadius: "15px 15px 11px 11px",
        }}
      >
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "9px 18px",
                border: active ? "1px solid #0F6FDB" : "1px solid transparent",
                borderRadius: "11px",
                background: active ? "linear-gradient(135deg, #147CFF 0%, #0F6FDB 100%)" : "rgba(255, 255, 255, 0.78)",
                fontWeight: active ? 800 : 600,
                fontSize: "0.84rem",
                color: active ? "#FFFFFF" : "#0B55B8",
                cursor: "pointer",
                transition: "all 0.15s ease",
                boxShadow: active ? "0 8px 18px rgba(15, 111, 219, 0.22)" : "none",
              }}
            >
              <Icon size={14} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ── REPORT TAB ────────────────────────────────────────── */}
      {tab === "report" && (
        <div>
          {scadaLoaded ? (
            <>
              <div
                style={{
                  background: "linear-gradient(180deg, #F8FBFF 0%, #FFFFFF 56px)",
                  border: "1px solid rgba(175, 196, 234, 0.72)",
                  borderRadius: "16px",
                  padding: "14px",
                  marginBottom: "14px",
                  boxShadow: "0 8px 22px rgba(15, 111, 219, 0.055)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", marginBottom: "10px" }}>
                  <div>
                    <h3 style={{ fontSize: "0.95rem", fontWeight: 900, color: "#0F172A", margin: 0 }}>
                      Export Selection
                    </h3>
                    <p style={{ fontSize: "0.74rem", color: "#64748B", margin: "2px 0 0" }}>
                      Choose states, generators and plot types before downloading the report.
                    </p>
                  </div>
                  <div style={{ fontSize: "0.74rem", fontWeight: 800, color: "#0B55B8", alignSelf: "center" }}>
                    {selectedExportStateIds.length}/{exportStateOptions.length} states | {selectedExportGeneratorIds.length}/{exportGeneratorOptions.length} generators
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "12px" }}>
                  <div className="rounded-3 border bg-white p-2">
                    <div className="d-flex align-items-center justify-content-between mb-2">
                      <span className="fw-bold text-dark" style={{ fontSize: "0.78rem" }}>States in report</span>
                      <div className="d-flex gap-1">
                        <button type="button" className="btn btn-sm theme-btn-outline py-0 px-2" onClick={() => setSelectedExportStateIds(exportStateOptions.map((item) => item.id))}>All</button>
                        <button type="button" className="btn btn-sm theme-btn-outline py-0 px-2" onClick={() => setSelectedExportStateIds([])}>None</button>
                      </div>
                    </div>
                    <div className="d-flex flex-wrap gap-1">
                      {exportStateOptions.map((item) => (
                        <label key={item.id} className="d-flex align-items-center gap-1 rounded-pill border bg-light px-2 py-1 mb-0" style={{ fontSize: "0.72rem", fontWeight: 800, cursor: "pointer" }}>
                          <input type="checkbox" checked={selectedExportStateIds.includes(item.id)} onChange={() => toggleExportState(item.id)} style={{ accentColor: "#0F6FDB" }} />
                          {item.label}
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-3 border bg-white p-2">
                    <div className="d-flex align-items-center justify-content-between gap-2 mb-2">
                      <span className="fw-bold text-dark" style={{ fontSize: "0.78rem" }}>Generators in report</span>
                      <div className="d-flex gap-1">
                        <button type="button" className="btn btn-sm theme-btn-outline py-0 px-2" onClick={() => setSelectedExportGeneratorIds(exportGeneratorOptions.map((item) => item.id))}>All</button>
                        <button type="button" className="btn btn-sm theme-btn-outline py-0 px-2" onClick={() => setSelectedExportGeneratorIds([])}>None</button>
                      </div>
                    </div>
                    <div className="position-relative mb-2">
                      <Search size={13} className="position-absolute text-secondary" style={{ left: 9, top: 9 }} />
                      <input
                        className="form-control theme-input py-1"
                        value={exportGeneratorFilter}
                        onChange={(event) => setExportGeneratorFilter(event.target.value)}
                        placeholder="Search generator, state or fuel"
                        style={{ paddingLeft: 30, fontSize: "0.74rem" }}
                      />
                    </div>
                    <div className="d-flex flex-column gap-1" style={{ maxHeight: 145, overflow: "auto" }}>
                      {filteredExportGeneratorOptions.map((item) => (
                        <label key={item.id} className="d-flex align-items-center gap-2 rounded-3 border bg-light px-2 py-1 mb-0" style={{ fontSize: "0.7rem", fontWeight: 800, cursor: "pointer" }}>
                          <input type="checkbox" checked={selectedExportGeneratorIds.includes(item.id)} onChange={() => toggleExportGenerator(item.id)} style={{ accentColor: "#0F6FDB" }} />
                          <span className="text-truncate" title={item.label}>{item.label}</span>
                          <span className="ms-auto text-secondary">{item.state}</span>
                          <span className="text-muted">{item.fuel}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-3 border bg-white p-2">
                    <div className="fw-bold text-dark mb-2" style={{ fontSize: "0.78rem" }}>Plots in report</div>
                    <label className="d-flex align-items-start gap-2 rounded-3 border bg-light px-2 py-2 mb-2" style={{ cursor: "pointer" }}>
                      <input type="checkbox" checked={exportIncludeDeviationPlot} onChange={(event) => setExportIncludeDeviationPlot(event.target.checked)} style={{ accentColor: "#0F6FDB", marginTop: 3 }} />
                      <span>
                        <span className="d-block fw-bold text-dark" style={{ fontSize: "0.75rem" }}>Deviation and frequency plot</span>
                        <span className="d-block text-secondary" style={{ fontSize: "0.68rem" }}>State and generator deviation chart.</span>
                      </span>
                    </label>
                    <label className="d-flex align-items-start gap-2 rounded-3 border bg-light px-2 py-2 mb-2" style={{ cursor: "pointer" }}>
                      <input type="checkbox" checked={exportIncludeStateScheduleActualPlot} onChange={(event) => setExportIncludeStateScheduleActualPlot(event.target.checked)} style={{ accentColor: "#0F6FDB", marginTop: 3 }} />
                      <span>
                        <span className="d-block fw-bold text-dark" style={{ fontSize: "0.75rem" }}>State schedule/actual plot</span>
                        <span className="d-block text-secondary" style={{ fontSize: "0.68rem" }}>State drawal, schedule and frequency chart.</span>
                      </span>
                    </label>
                    <label className="d-flex align-items-start gap-2 rounded-3 border bg-light px-2 py-2 mb-0" style={{ cursor: "pointer" }}>
                      <input type="checkbox" checked={exportIncludeGeneratorScheduleActualPlot} onChange={(event) => setExportIncludeGeneratorScheduleActualPlot(event.target.checked)} style={{ accentColor: "#0F6FDB", marginTop: 3 }} />
                      <span>
                        <span className="d-block fw-bold text-dark" style={{ fontSize: "0.75rem" }}>Generator schedule/actual plot</span>
                        <span className="d-block text-secondary" style={{ fontSize: "0.68rem" }}>Generation, schedule and capacity chart.</span>
                      </span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Export Button Panel */}
              <ExportBar
                onExportHtml={() => openExportSelection("html")}
                onExportPdf={() => openExportSelection("pdf")}
                onExportDocx={() => openExportSelection("docx")}
                onExportExcel={() => openExportSelection("excel")}
                exportingHtml={exportingHtml}
                exportingPdf={exportingPdf}
                exportingDocx={exportingDocx}
                exportingExcel={exportingExcel}
                disabled={dataLoading}
              />

              {rows.length > 0 && (
                <div
                  className="d-flex align-items-center justify-content-between gap-2 px-3 py-2 mb-3"
                  style={{
                    border: "1px solid #BFD3F8",
                    borderRadius: "10px",
                    background: "#F7FAFF",
                    color: "#0F172A",
                    fontSize: "0.75rem",
                    fontWeight: 800,
                  }}
                >
                  <span>
                    CRMS Frequency/Deviation messages:
                    <strong className="ms-1">{crmsMessages.length}</strong> fetched,
                    <strong className="ms-1">{crmsMappedCount}</strong> plotted on utility charts
                  </span>
                  <button type="button" className="btn btn-sm theme-btn-outline py-0 px-2" onClick={() => loadCrmsMessages(startTime, endTime)} disabled={crmsStatus.loading}>
                    {crmsStatus.loading ? "Loading..." : "Refresh CRMS"}
                  </button>
                  {crmsStatus.error && <span className="text-danger ms-auto">{crmsStatus.error}</span>}
                </div>
              )}

              {/* Data Source Audit Panel */}
              <DataSourceAuditPanel
                rows={rows}
                open={showAuditPanel}
                onToggle={() => setShowAuditPanel((prev) => !prev)}
                onEditRow={handleOpenRawDataEditor}
              />

              {/* 1. Executive Summary */}
              <ExecutiveSummary value={introDesc} onChange={setIntroDesc} />

              <div style={{ background: "linear-gradient(180deg, #F8FBFF 0%, #FFFFFF 56px)", padding: "16px", borderRadius: "14px", border: "1px solid rgba(175, 196, 234, 0.72)", boxShadow: "0 8px 22px rgba(15, 111, 219, 0.055)", marginBottom: "16px" }}>
                <div className="d-flex align-items-center justify-content-between gap-2 mb-2">
                  <label style={{ fontSize: "0.78rem", fontWeight: 800, color: "#1E293B", display: "block", margin: 0 }}>
                    State Drawal Compliance Notes & Observation
                  </label>
                  <div className="d-flex gap-2">
                    <button type="button" onClick={() => setStateObservation(autoObservations.stateText || "")} className="btn btn-sm theme-btn-outline py-1 px-2" disabled={!autoObservations.stateText}>
                      Regenerate
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCreateEvent()}
                      className="btn btn-sm theme-btn-outline d-inline-flex align-items-center gap-1 py-1 px-2"
                      disabled={!rows.length}
                      title="Save observations, chart notes and current event data"
                    >
                      <Save size={13} />
                      Save Notes
                    </button>
                  </div>
                </div>
                <textarea
                  value={stateDesc}
                  onChange={(e) => setStateDesc(e.target.value)}
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
                <textarea
                  value={stateObservation}
                  onChange={(e) => setStateObservation(e.target.value)}
                  rows={3}
                  style={{
                    width: "100%",
                    border: "1px solid #CBD5E1",
                    borderRadius: "8px",
                    padding: "8px 12px",
                    marginTop: "8px",
                    fontSize: "0.78rem",
                    color: "#334155",
                    outline: "none",
                    resize: "vertical",
                    fontFamily: "inherit",
                    background: "#FFFFFF",
                  }}
                  placeholder="Editable state observation for this report section..."
                />
              </div>

              {/* 2. States Table */}
              <StateComplianceTable
                rows={stateRows}
                expandedRowIds={expandedRowIds}
                onToggleExpand={toggleRowExpansion}
                onExpandAll={() => expandRows(stateRows)}
                onCollapseAll={() => collapseRows(stateRows)}
                onUpdateRowField={updateRowField}
                showSchAct={showSchAct}
                onEditRawData={handleOpenRawDataEditor}
              />

              <div style={{ background: "linear-gradient(180deg, #F8FBFF 0%, #FFFFFF 56px)", padding: "16px", borderRadius: "14px", border: "1px solid rgba(175, 196, 234, 0.72)", boxShadow: "0 8px 22px rgba(15, 111, 219, 0.055)", marginBottom: "16px" }}>
                <div className="d-flex align-items-center justify-content-between gap-2 mb-2">
                  <label style={{ fontSize: "0.78rem", fontWeight: 800, color: "#1E293B", display: "block", margin: 0 }}>
                    Generator Section Observations
                  </label>
                  <div className="d-flex gap-2">
                    <button type="button" onClick={() => setGeneratorObservation(autoObservations.generatorText || "")} className="btn btn-sm theme-btn-outline py-1 px-2" disabled={!autoObservations.generatorText}>
                      Regenerate
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCreateEvent()}
                      className="btn btn-sm theme-btn-outline d-inline-flex align-items-center gap-1 py-1 px-2"
                      disabled={!rows.length}
                    >
                      <Save size={13} />
                      Save Notes
                    </button>
                  </div>
                </div>
                {eventType === "high" && autoObservations.sectionStats.length > 0 && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 8, marginBottom: 10 }}>
                    {autoObservations.sectionStats.map((section) => (
                      <div key={section.label} style={{ border: "1px solid #D7E1EA", borderRadius: 10, padding: "9px 10px", background: "#FFFFFF" }}>
                        <div style={{ color: "#0B55B8", fontSize: "0.7rem", fontWeight: 900 }}>{section.label}</div>
                        <div style={{ color: "#0F172A", fontSize: "1rem", fontWeight: 950 }}>{fmtPctText(section.minPct)}</div>
                        <div style={{ color: "#64748B", fontSize: "0.64rem", fontWeight: 750 }}>Fleet minimum generation vs 94% cap on bar ({section.count} units)</div>
                      </div>
                    ))}
                  </div>
                )}
                <textarea
                  value={generatorObservation}
                  onChange={(e) => setGeneratorObservation(e.target.value)}
                  rows={4}
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
                    background: "#FFFFFF",
                  }}
                  placeholder="Editable generator observation for this report section..."
                />
              </div>

              {/* 3. Generators Table */}
              <GeneratorComplianceTable
                rows={generatorRows}
                expandedRowIds={expandedRowIds}
                onToggleExpand={toggleRowExpansion}
                onExpandAll={() => expandRows(generatorRows)}
                onCollapseAll={() => collapseRows(generatorRows)}
                onUpdateRowField={updateRowField}
                genDesc={genDesc}
                onUpdateGenDesc={setGenDesc}
                showSchAct={showSchAct}
                onEditRawData={handleOpenRawDataEditor}
              />
            </>
          ) : (
            <div
              onClick={handleUploadClick}
              style={{
                background: "#FFFFFF",
                borderRadius: "16px",
                border: "1px dashed #CBD5E1",
                padding: "80px 40px",
                textAlign: "center",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "16px",
                boxShadow: "0 4px 12px rgba(0,0,0,0.02)",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "#6366F1";
                e.currentTarget.style.background = "#F8FAFC";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "#CBD5E1";
                e.currentTarget.style.background = "#FFFFFF";
              }}
            >
              <div
                style={{
                  width: "60px",
                  height: "60px",
                  borderRadius: "50%",
                  background: "rgba(99, 102, 241, 0.08)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#6366F1",
                }}
              >
                <FileUp size={28} />
              </div>
              <div>
                <h3 style={{ fontSize: "1rem", fontWeight: 800, color: "#1E293B", margin: "0 0 6px 0" }}>
                  Upload SCADA Data to Build Report
                </h3>
                <p style={{ fontSize: "0.8rem", color: "#64748B", margin: 0, maxWidth: "400px" }}>
                  To view deviation plots and compute low frequency grid compliance statistics, upload your operational Excel document.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── CONFIG / MAPPING TAB ──────────────────────────────── */}
      {tab === "mapping" && (
        <div style={{ background: "#FFFFFF", borderRadius: "16px", padding: "16px", border: "1px solid #E2E8F0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <div>
              <h2 style={{ fontSize: "0.95rem", fontWeight: 800, color: "#0F172A", margin: 0 }}>
                Plant and Source Mapping Settings
              </h2>
              <p style={{ fontSize: "0.74rem", color: "#64748B", margin: "2px 0 0" }}>
                Define acronym keys, SCADA column headers, and schedule retrieval sources for each grid node.
              </p>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={handleExportMapping}
                style={{
                  background: "#F1F5F9",
                  border: "1px solid #CBD5E1",
                  borderRadius: "8px",
                  padding: "6px 16px",
                  color: "#475569",
                  fontSize: "0.78rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                📥 Export Mapping
              </button>
              <button
                onClick={handleImportMappingClick}
                style={{
                  background: "#03624C",
                  border: "none",
                  borderRadius: "8px",
                  padding: "6px 16px",
                  color: "#FFFFFF",
                  fontSize: "0.78rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                📤 Import Mapping
              </button>
              <input
                ref={mappingFileInputRef}
                type="file"
                accept=".xlsx,.xls"
                style={{ display: "none" }}
                onChange={handleMappingFileChange}
              />
            </div>
          </div>

          <PlantMappingGrid
            data={mapData}
            loading={mapLoading}
            onSave={saveMapping}
            maxHeight="60vh"
          />
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        style={{ display: "none" }}
        onChange={handleFileChange}
      />

      {/* ── HIDDEN CONTAINER FOR RENDERING ALL CHARTS TO DOM ── */}
      {pendingExportType && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.45)",
            backdropFilter: "blur(5px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 99999,
            padding: "20px",
          }}
          onClick={() => setPendingExportType(null)}
        >
          <div
            className="theme-glass-card"
            style={{ width: "min(1080px, 96vw)", maxHeight: "88vh", overflow: "auto", padding: "18px" }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="d-flex align-items-start justify-content-between gap-3 mb-3">
              <div>
                <h3 className="fw-bold text-dark mb-1" style={{ fontSize: "1rem" }}>
                  Select Report Content Before Download
                </h3>
                <p className="text-muted mb-0" style={{ fontSize: "0.76rem" }}>
                  Download format: <strong>{pendingExportType.toUpperCase()}</strong>. Choose states, generators and plots for this report.
                </p>
              </div>
              <button type="button" className="btn btn-sm theme-btn-outline" onClick={() => setPendingExportType(null)}>
                <X size={16} />
              </button>
            </div>

            <div className="d-flex align-items-center justify-content-between gap-2 flex-wrap rounded-3 border bg-light px-3 py-2 mb-3">
              <span className="fw-bold text-dark" style={{ fontSize: "0.78rem" }}>
                Selected: {selectedExportStateIds.length}/{exportStateOptions.length} states, {exportRows.filter((row) => !row.is_state && !row.is_frequency).length}/{exportGeneratorOptions.length} generators
              </span>
              <span className="text-secondary fw-bold" style={{ fontSize: "0.72rem" }}>
                {exportReportMode === "with_annexure" ? "Summary + annexure" : "Summary only"} | {exportIncludeDeviationPlot ? "Deviation plot" : "No deviation plot"} | {exportIncludeStateScheduleActualPlot ? "State schedule/actual" : "No state schedule"} | {exportIncludeGeneratorScheduleActualPlot ? "Generator schedule/actual" : "No generator schedule"}
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "12px" }}>
              <div className="rounded-3 border bg-white p-2">
                <div className="d-flex align-items-center justify-content-between mb-2">
                  <span className="fw-bold text-dark" style={{ fontSize: "0.8rem" }}>States</span>
                  <div className="d-flex gap-1">
                    <button type="button" className="btn btn-sm theme-btn-outline py-0 px-2" onClick={() => setSelectedExportStateIds(exportStateOptions.map((item) => item.id))}>All</button>
                    <button type="button" className="btn btn-sm theme-btn-outline py-0 px-2" onClick={() => setSelectedExportStateIds([])}>None</button>
                  </div>
                </div>
                <div className="d-flex flex-wrap gap-1">
                  {exportStateOptions.map((item) => (
                    <label key={`modal-state-${item.id}`} className="d-flex align-items-center gap-1 rounded-pill border bg-light px-2 py-1 mb-0" style={{ fontSize: "0.74rem", fontWeight: 800, cursor: "pointer" }}>
                      <input type="checkbox" checked={selectedExportStateIds.includes(item.id)} onChange={() => toggleExportState(item.id)} style={{ accentColor: "#0F6FDB" }} />
                      {item.label}
                    </label>
                  ))}
                </div>
              </div>

              <div className="rounded-3 border bg-white p-2">
                <div className="d-flex align-items-center justify-content-between gap-2 mb-2">
                  <span className="fw-bold text-dark" style={{ fontSize: "0.8rem" }}>Generators</span>
                  <div className="d-flex gap-1">
                    <button type="button" className="btn btn-sm theme-btn-outline py-0 px-2" onClick={() => setSelectedExportGeneratorIds(filteredExportGeneratorOptions.map((item) => item.id))}>All</button>
                    <button type="button" className="btn btn-sm theme-btn-outline py-0 px-2" onClick={() => setSelectedExportGeneratorIds([])}>None</button>
                  </div>
                </div>
                <div className="d-flex gap-2 mb-2">
                  <select
                    className="form-select theme-input py-1"
                    value={exportFuelFilter}
                    onChange={(event) => setExportFuelFilter(event.target.value)}
                    style={{ maxWidth: 150, fontSize: "0.74rem", fontWeight: 800 }}
                  >
                    {exportFuelOptions.map((fuel) => (
                      <option key={fuel} value={fuel}>{fuel === "ALL_FUELS" ? "All fuels" : fuel}</option>
                    ))}
                  </select>
                  <div className="position-relative flex-grow-1">
                    <Search size={13} className="position-absolute text-secondary" style={{ left: 9, top: 9 }} />
                    <input
                      className="form-control theme-input py-1"
                      value={exportGeneratorFilter}
                      onChange={(event) => setExportGeneratorFilter(event.target.value)}
                      placeholder="Search generator, state or fuel"
                      style={{ paddingLeft: 30, fontSize: "0.74rem" }}
                    />
                  </div>
                </div>
                <div className="d-flex flex-column gap-1" style={{ maxHeight: 240, overflow: "auto" }}>
                  {filteredExportGeneratorOptions.map((item) => (
                    <label key={`modal-generator-${item.id}`} className="d-flex align-items-center gap-2 rounded-3 border bg-light px-2 py-1 mb-0" style={{ fontSize: "0.72rem", fontWeight: 800, cursor: "pointer" }}>
                      <input type="checkbox" checked={selectedExportGeneratorIds.includes(item.id)} onChange={() => toggleExportGenerator(item.id)} style={{ accentColor: "#0F6FDB" }} />
                      <span className="text-truncate" title={item.label}>{item.label}</span>
                      <span className="ms-auto text-secondary">{item.state}</span>
                      <span className="text-muted">{item.fuel}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="rounded-3 border bg-white p-2">
                {(pendingExportType === "pdf" || pendingExportType === "docx") && (
                  <>
                    <div className="fw-bold text-dark mb-2" style={{ fontSize: "0.8rem" }}>Report layout</div>
                    <label className="d-flex align-items-center gap-2 rounded-3 border bg-light px-2 py-2 mb-2" style={{ cursor: "pointer" }}>
                      <input type="radio" checked={exportReportMode === "summary"} onChange={() => setExportReportMode("summary")} style={{ accentColor: "#0F6FDB" }} />
                      <span className="fw-bold text-dark" style={{ fontSize: "0.76rem" }}>Executive summary only</span>
                    </label>
                    <label className="d-flex align-items-center gap-2 rounded-3 border bg-light px-2 py-2 mb-3" style={{ cursor: "pointer" }}>
                      <input type="radio" checked={exportReportMode === "with_annexure"} onChange={() => setExportReportMode("with_annexure")} style={{ accentColor: "#0F6FDB" }} />
                      <span className="fw-bold text-dark" style={{ fontSize: "0.76rem" }}>Executive summary with annexure plots</span>
                    </label>
                  </>
                )}
                <div className="fw-bold text-dark mb-2" style={{ fontSize: "0.8rem" }}>Plots</div>
                <label className="d-flex align-items-start gap-2 rounded-3 border bg-light px-2 py-2 mb-2" style={{ cursor: "pointer" }}>
                  <input type="checkbox" checked={exportIncludeDeviationPlot} onChange={(event) => setExportIncludeDeviationPlot(event.target.checked)} style={{ accentColor: "#0F6FDB", marginTop: 3 }} />
                  <span>
                    <span className="d-block fw-bold text-dark" style={{ fontSize: "0.76rem" }}>Deviation and frequency plot</span>
                    <span className="d-block text-secondary" style={{ fontSize: "0.68rem" }}>State and generator deviation chart.</span>
                  </span>
                </label>
                <label className="d-flex align-items-start gap-2 rounded-3 border bg-light px-2 py-2 mb-0" style={{ cursor: "pointer" }}>
                  <input type="checkbox" checked={exportIncludeStateScheduleActualPlot} onChange={(event) => setExportIncludeStateScheduleActualPlot(event.target.checked)} style={{ accentColor: "#0F6FDB", marginTop: 3 }} />
                  <span>
                    <span className="d-block fw-bold text-dark" style={{ fontSize: "0.76rem" }}>State schedule/actual plot</span>
                    <span className="d-block text-secondary" style={{ fontSize: "0.68rem" }}>State drawal, schedule and frequency chart.</span>
                  </span>
                </label>
                <label className="d-flex align-items-start gap-2 rounded-3 border bg-light px-2 py-2 mt-2 mb-0" style={{ cursor: "pointer" }}>
                  <input type="checkbox" checked={exportIncludeGeneratorScheduleActualPlot} onChange={(event) => setExportIncludeGeneratorScheduleActualPlot(event.target.checked)} style={{ accentColor: "#0F6FDB", marginTop: 3 }} />
                  <span>
                    <span className="d-block fw-bold text-dark" style={{ fontSize: "0.76rem" }}>Generator schedule/actual plot</span>
                    <span className="d-block text-secondary" style={{ fontSize: "0.68rem" }}>Generation, schedule and capacity chart.</span>
                  </span>
                </label>
              </div>
            </div>

            <div className="d-flex justify-content-end gap-2 mt-3">
              <button type="button" className="btn theme-btn-outline" onClick={() => setPendingExportType(null)}>Cancel</button>
              <button type="button" className="btn theme-btn-primary" onClick={confirmPendingExport}>
                Download {pendingExportType.toUpperCase()}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* This ensures we can get base64 data URLs for any collapsed row chart on Word/PDF export */}
      <div
        style={{
          position: "absolute",
          top: "-9999px",
          left: "-9999px",
          width: "1500px",
          height: "640px",
          opacity: 0,
          pointerEvents: "none",
        }}
      >
        {(exportingDocx || exportingPdf) && exportChartRows.map((row) => (
          <div key={`hidden-chart-wrapper-${row.plant_id}`}>
            {exportIncludeDeviationPlot && row.series?.timestamps?.length > 0 && (
              <ComplianceChart
                ref={(el) => {
                  if (el) {
                    chartRefs.current[row.plant_id] = el;
                  } else {
                    delete chartRefs.current[row.plant_id];
                  }
                }}
                row={row}
                showSchAct={false}
                height={560}
              />
            )}
            {((row.is_state && exportIncludeStateScheduleActualPlot) || (!row.is_state && exportIncludeGeneratorScheduleActualPlot)) && row.series?.timestamps?.length > 0 && (
              <CapacityFrequencyChart
                ref={(el) => {
                  if (el) {
                    capacityChartRefs.current[row.plant_id] = el;
                  } else {
                    delete capacityChartRefs.current[row.plant_id];
                  }
                }}
                row={row}
                height={430}
              />
            )}
          </div>
        ))}
      </div>

      {/* ── DATA LOGS MODAL ────────────────────────────────────── */}
      {showUploadDetailsModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.42)",
            backdropFilter: "blur(5px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 99998,
            padding: "20px",
          }}
        >
          <div
            style={{
              width: "min(1240px, 96vw)",
              maxHeight: "88vh",
              background: "#FFFFFF",
              border: "1px solid #DDE7F0",
              borderRadius: "10px",
              boxShadow: "0 24px 60px rgba(15, 23, 42, 0.28)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "14px 18px",
                borderBottom: "1px solid #E2E8F0",
                background: "#F8FAFC",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "12px",
              }}
            >
              <div>
                <h3 style={{ margin: 0, color: "#0F172A", fontSize: "1rem", fontWeight: 850 }}>
                  Uploaded Event Details
                </h3>
                <p style={{ margin: "3px 0 0", color: "#64748B", fontSize: "0.74rem" }}>
                  {startTime} to {endTime} | {uploadDetailRows.length} configured rows
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowUploadDetailsModal(false)}
                title="Close"
                style={{
                  width: "32px",
                  height: "32px",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "1px solid #CBD5E1",
                  borderRadius: "8px",
                  background: "#FFFFFF",
                  color: "#334155",
                  cursor: "pointer",
                }}
              >
                <X size={16} />
              </button>
            </div>

            <div
              style={{
                padding: "12px 18px",
                borderBottom: "1px solid #E2E8F0",
                display: "grid",
                gridTemplateColumns: "minmax(260px, 1fr) auto auto",
                gap: "10px",
                alignItems: "center",
                background: "#FFFFFF",
              }}
            >
              <input
                value={eventNameDraft}
                onChange={(e) => setEventNameDraft(e.target.value)}
                placeholder="Enter one event name for this uploaded range"
                style={{
                  border: "1px solid #CBD5E1",
                  borderRadius: "8px",
                  padding: "9px 12px",
                  fontSize: "0.82rem",
                  outline: "none",
                  color: "#0F172A",
                }}
              />
              <button
                type="button"
                onClick={() => handleCreateEvent(uploadDetailRows)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "7px",
                  border: "none",
                  borderRadius: "8px",
                  padding: "9px 14px",
                  background: "#111827",
                  color: "#FFFFFF",
                  fontSize: "0.78rem",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                <Save size={14} />
                Save Event
              </button>
              <button
                type="button"
                onClick={applyUploadSourceSetup}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "7px",
                  border: "1px solid #99F6E4",
                  borderRadius: "8px",
                  padding: "9px 14px",
                  background: "#ECFDF5",
                  color: "#047857",
                  fontSize: "0.78rem",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                <RefreshCw size={14} />
                Apply & Recalculate
              </button>
            </div>

            <div style={{ overflow: "auto", flex: 1, background: "#FFFFFF" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", fontSize: "0.74rem" }}>
                <thead>
                  <tr style={{ background: "#EAF1F8", color: "#334155", textAlign: "left" }}>
                    {[
                      ["Plant / State", "16%"],
                      ["Status", "9%"],
                      ["Actual", "11%"],
                      ["Schedule", "11%"],
                      ["DC", "11%"],
                      ["Data Preview", "18%"],
                      ["SCADA Keys", "13%"],
                      ["Portal IDs", "11%"],
                    ].map(([label, width]) => (
                      <th
                        key={label}
                        style={{
                          width,
                          padding: "9px 10px",
                          border: "1px solid #D7E1EA",
                          fontWeight: 850,
                          position: "sticky",
                          top: 0,
                          background: "#EAF1F8",
                          zIndex: 2,
                        }}
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {uploadDetailRows.map((row, idx) => (
                    <tr key={row.plant_id} style={{ background: idx % 2 === 0 ? "#FFFFFF" : "#F8FAFC" }}>
                      <td style={{ padding: "8px 10px", border: "1px solid #E2E8F0", color: "#0F172A", fontWeight: 750 }}>
                        {row.plant_name}
                        <div style={{ marginTop: "2px", color: "#64748B", fontSize: "0.66rem", fontWeight: 600 }}>
                          {row.type}
                        </div>
                      </td>
                      <td style={{ padding: "8px 8px", border: "1px solid #E2E8F0", color: "#475569" }}>
                        {[
                          ["A", row.actual_metric?.ok],
                          ["S", row.schedule_metric?.ok],
                          ["D", row.dc_metric?.ok],
                        ].map(([label, ok]) => (
                          <span
                            key={label}
                            title={`${label} ${ok ? "available" : "missing"}`}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              width: "20px",
                              height: "20px",
                              marginRight: "4px",
                              borderRadius: "999px",
                              background: ok ? "#DCFCE7" : "#FEE2E2",
                              color: ok ? "#15803D" : "#B91C1C",
                              fontSize: "0.65rem",
                              fontWeight: 900,
                            }}
                          >
                            {label}
                          </span>
                        ))}
                      </td>
                      {[
                        ["actual_source", "update_actual", row.actual_metric],
                        ["sched_src", "update_schedule", row.schedule_metric],
                        ["dc_src", "update_dc", row.dc_metric],
                      ].map(([sourceField, updateField, metricInfo]) => (
                        <td key={sourceField} style={{ padding: "7px 8px", border: "1px solid #E2E8F0" }}>
                          <div style={{ display: "grid", gridTemplateColumns: "18px 1fr", gap: "6px", alignItems: "center" }}>
                            <input
                              type="checkbox"
                              checked={row[updateField]}
                              onChange={(e) => updateUploadDetailRow(row.plant_id, updateField, e.target.checked)}
                              title="Include this data point in update/recalculation"
                              style={{ accentColor: "#03624C" }}
                            />
                            <select
                              value={row[sourceField]}
                              disabled={!row[updateField]}
                              onChange={(e) => updateUploadDetailRow(row.plant_id, sourceField, e.target.value)}
                              style={{
                                width: "100%",
                                border: "1px solid #CBD5E1",
                                borderRadius: "6px",
                                padding: "5px 6px",
                                color: "#0F172A",
                                background: row[updateField] ? "#FFFFFF" : "#F1F5F9",
                                fontSize: "0.72rem",
                              }}
                            >
                              {SOURCE_OPTIONS.map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div style={{ marginTop: "4px", color: metricInfo?.ok ? "#15803D" : "#B91C1C", fontSize: "0.64rem", fontWeight: 800 }}>
                            {metricInfo?.nonZero || 0}/{metricInfo?.count || 0} pts
                          </div>
                        </td>
                      ))}
                      <td style={{ padding: "8px 10px", border: "1px solid #E2E8F0", color: "#334155", fontSize: "0.68rem", lineHeight: 1.45 }}>
                        <div>Actual avg: <strong>{row.actual_metric?.avg != null ? row.actual_metric.avg.toFixed(2) : "-"}</strong></div>
                        <div>Schedule avg: <strong>{row.schedule_metric?.avg != null ? row.schedule_metric.avg.toFixed(2) : "-"}</strong></div>
                        <div>DC avg: <strong>{row.dc_metric?.avg != null ? row.dc_metric.avg.toFixed(2) : "-"}</strong></div>
                      </td>
                      <td style={{ padding: "8px 10px", border: "1px solid #E2E8F0", color: "#475569", fontFamily: "monospace", fontSize: "0.68rem", wordBreak: "break-word" }}>
                        A: {row.scada_key || "-"} | S: {row.scada_schedule_key || "-"} | DC: {row.scada_dc_key || "-"}
                      </td>
                      <td style={{ padding: "8px 10px", border: "1px solid #E2E8F0", color: "#475569", fontFamily: "monospace", fontSize: "0.68rem", wordBreak: "break-word" }}>
                        RTG: {row.rtg_plant_id || "-"} | WBES: {row.wbes_name || "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {showLogsModal && (
        <div
          onClick={() => logsModalStatus !== "running" && setShowLogsModal(false)}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            background: "rgba(2, 39, 38, 0.45)",
            backdropFilter: "blur(12px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 99999,
            padding: "20px",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#091D1A",
              border: logsModalStatus === "error" ? "1px solid rgba(239, 68, 68, 0.4)" : "1px solid rgba(52, 211, 153, 0.25)",
              borderRadius: "20px",
              width: "100%",
              maxWidth: "800px",
              maxHeight: "85vh",
              display: "flex",
              flexDirection: "column",
              boxShadow: logsModalStatus === "error" 
                ? "0 25px 50px -12px rgba(220, 38, 38, 0.3), 0 0 40px rgba(220, 38, 38, 0.1)"
                : "0 25px 50px -12px rgba(2, 39, 38, 0.5), 0 0 40px rgba(16, 185, 129, 0.15)",
              overflow: "hidden",
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                background: logsModalStatus === "error" 
                  ? "linear-gradient(90deg, #1E0A0A, #3A0F0F)"
                  : "linear-gradient(90deg, #022726, #033D30)",
                padding: "16px 24px",
                borderBottom: logsModalStatus === "error" ? "1px solid rgba(239, 68, 68, 0.2)" : "1px solid rgba(52, 211, 153, 0.15)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div 
                    style={{ 
                      width: "8px", 
                      height: "8px", 
                      borderRadius: "50%", 
                      background: logsModalStatus === "error" ? "#EF4444" : "#34D399",
                      boxShadow: `0 0 8px ${logsModalStatus === "error" ? "#EF4444" : "#34D399"}`,
                      animation: logsModalStatus === "running" ? "pulse 1.2s infinite" : "none" 
                    }} 
                  />
                  <h3 style={{ margin: 0, color: "#FFFFFF", fontWeight: 700, fontSize: "1.05rem" }}>
                    {logsModalStatus === "running" && (logsRunMode === "historical" ? "Loading Historical Event from Mongo..." : "Report Generation in Progress...")}
                    {logsModalStatus === "success" && (logsRunMode === "historical" ? "Historical Event Loaded" : "Data Sync Report: Successful")}
                    {logsModalStatus === "error" && "Report Sync: Failed"}
                  </h3>
                </div>
                <p style={{ margin: "2px 0 0 0", color: logsModalStatus === "error" ? "#FECACA" : "#A7F3D0", fontSize: "0.74rem", opacity: 0.8 }}>
                  {logsModalStatus === "running" && (logsRunMode === "historical" ? "Reading saved merged event data directly from MongoDB..." : "Running pre-fetches and math models in backend thread pool...")}
                  {logsModalStatus === "success" && (logsRunMode === "historical" ? "Loaded saved rows and time series from MongoDB" : "Resolved and bound schedules, DCs, and actuals successfully")}
                  {logsModalStatus === "error" && "An exception occurred while executing backend tasks"}
                </p>
              </div>
              
              {logsModalStatus !== "running" && (
                <button
                  onClick={() => setShowLogsModal(false)}
                  style={{
                    background: "rgba(255,255,255,0.06)",
                    border: "none",
                    borderRadius: "8px",
                    padding: "6px 12px",
                    color: "#94A3B8",
                    fontSize: "0.78rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.15)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")}
                >
                  Close (ESC)
                </button>
              )}
            </div>

            {/* Modal Body / Terminal */}
            <div
              style={{
                padding: "20px 24px",
                flex: 1,
                overflowY: "auto",
                fontFamily: "'Courier New', Courier, monospace",
                fontSize: "0.76rem",
                color: logsModalStatus === "error" ? "#FECACA" : "#D1FAE5",
                lineHeight: "1.6",
                background: logsModalStatus === "error" ? "#0F0505" : "#051210",
              }}
            >
              {syncLogs.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px 0", color: "#64748B" }}>
                  No logs available.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {syncLogs.map((log, idx) => {
                    const isSystemInfo = log.startsWith("🚀") || log.startsWith("⏳") || log.startsWith("✅");
                    const isError = log.startsWith("❌");
                    const isFallback = log.includes("Fallback") || log.includes("Missing") || log.includes("Skipped") || log.includes("unavailable");
                    const color = isSystemInfo ? "#6EE7B7" : isError ? "#F87171" : isFallback ? "#FBBF24" : "#A7F3D0";
                    return (
                      <div
                        key={idx}
                        style={{
                          color,
                          background: isSystemInfo
                            ? "rgba(110, 231, 183, 0.04)"
                            : isError
                            ? "rgba(239, 68, 68, 0.04)"
                            : isFallback
                            ? "rgba(251, 191, 36, 0.03)"
                            : "transparent",
                          padding: "4px 8px",
                          borderRadius: "4px",
                          borderLeft: isSystemInfo
                            ? "2px solid #34D399"
                            : isError
                            ? "2px solid #EF4444"
                            : isFallback
                            ? "2px solid #F59E0B"
                            : "2px solid transparent",
                          display: "flex",
                          gap: "8px",
                        }}
                      >
                        <span style={{ color: logsModalStatus === "error" ? "#EF4444" : "#10B981", opacity: 0.5 }}>
                          {(idx + 1).toString().padStart(2, '0')}.
                        </span>
                        <span style={{ whiteSpace: "pre-wrap" }}>{log}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Error Traceback Display */}
            {logsModalStatus === "error" && logsErrorDetails && (
              <div
                style={{
                  margin: "12px 24px",
                  background: "#1E0A0A",
                  border: "1px solid rgba(239, 68, 68, 0.4)",
                  borderRadius: "10px",
                  padding: "16px",
                  maxHeight: "180px",
                  overflowY: "auto",
                  fontFamily: "'Courier New', Courier, monospace",
                  fontSize: "0.72rem",
                  color: "#FECACA",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                  <strong style={{ color: "#F87171" }}>Uvicorn Backend / Network Traceback:</strong>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(logsErrorDetails);
                      toast.success("Error details copied to clipboard!");
                    }}
                    style={{
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(239, 68, 68, 0.3)",
                      borderRadius: "4px",
                      padding: "2px 8px",
                      color: "#FECACA",
                      fontSize: "0.68rem",
                      cursor: "pointer",
                    }}
                  >
                    Copy details
                  </button>
                </div>
                <pre style={{ margin: 0, whiteSpace: "pre-wrap", overflowX: "auto" }}>{logsErrorDetails}</pre>
              </div>
            )}

            {/* Modal Footer */}
            <div
              style={{
                background: logsModalStatus === "error" ? "#1E0A0A" : "#091D1A",
                padding: "12px 24px",
                borderTop: logsModalStatus === "error" ? "1px solid rgba(239, 68, 68, 0.2)" : "1px solid rgba(52, 211, 153, 0.15)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div style={{ color: "#64748B", fontSize: "0.74rem" }}>
                {logsModalStatus === "running" && (logsRunMode === "historical" ? "Reading MongoDB event..." : "Querying remote APIs...")}
                {logsModalStatus === "success" && (
                  <>
                    Total Records Sync: <strong style={{ color: "#10B981" }}>{Math.max(0, syncLogs.length - 8)} entities</strong>
                  </>
                )}
                {logsModalStatus === "error" && <span style={{ color: "#EF4444" }}>Execution terminated with exceptions</span>}
              </div>
              <button
                onClick={() => setShowLogsModal(false)}
                disabled={logsModalStatus === "running"}
                style={{
                  background: logsModalStatus === "error"
                    ? "linear-gradient(135deg, #EF4444, #DC2626)"
                    : "linear-gradient(135deg, #10B981, #059669)",
                  border: "none",
                  borderRadius: "8px",
                  padding: "8px 24px",
                  color: "#FFFFFF",
                  fontSize: "0.8rem",
                  fontWeight: 700,
                  cursor: logsModalStatus === "running" ? "not-allowed" : "pointer",
                  boxShadow: logsModalStatus === "error"
                    ? "0 4px 12px rgba(239, 68, 68, 0.25)"
                    : "0 4px 12px rgba(16, 185, 129, 0.2)",
                  transition: "all 0.2s",
                  opacity: logsModalStatus === "running" ? 0.6 : 1,
                }}
              >
                {logsModalStatus === "running" ? (logsRunMode === "historical" ? "Loading..." : "Processing...") : "Done"}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── RAW DATABASE DATA EDITOR MODAL ───────────────────────── */}
      {rawEditorOpen && rawEditorRow && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(15, 23, 42, 0.4)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "20px",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "1240px",
              maxHeight: "90vh",
              background: "#F8FAFC",
              borderRadius: "16px",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
              border: "1px solid #E2E8F0",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            {/* Header */}
            <div
              style={{
                background: "#022726",
                padding: "18px 24px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                color: "#FFFFFF",
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800 }}>
                  ⚙️ Raw Data Editor
                </h3>
                <p style={{ margin: "4px 0 0 0", fontSize: "0.76rem", color: "#A7F3D0" }}>
                  Modify 15-minute raw database values for: <strong>{rawEditorRow.plant_name}</strong> ({rawEditorRow.sched_src || "RTG"} Source)
                </p>
              </div>
              <button
                onClick={() => setRawEditorOpen(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#FFFFFF",
                  fontSize: "1.2rem",
                  cursor: "pointer",
                  opacity: 0.8,
                }}
              >
                ✕
              </button>
            </div>

            {/* Date Select Toolbar */}
            <div
              style={{
                background: "#FFFFFF",
                padding: "12px 24px",
                borderBottom: "1px solid #E2E8F0",
                display: "flex",
                alignItems: "center",
                gap: "12px",
                flexWrap: "wrap",
              }}
            >
              <label style={{ fontSize: "0.75rem", fontWeight: 800, color: "#475569" }}>
                SELECT DATE TO EDIT:
              </label>
              <select
                value={rawEditorDate}
                onChange={(e) => {
                  setRawEditorDate(e.target.value);
                  loadRawEditorData(rawEditorRow, e.target.value);
                }}
                style={{
                  padding: "4px 10px",
                  fontSize: "0.75rem",
                  borderRadius: "6px",
                  border: "1px solid #CBD5E1",
                  background: "#F8FAFC",
                  color: "#1E293B",
                  fontWeight: 600,
                  outline: "none",
                }}
              >
                {getUniqueDatesInRange().map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              {rawEditorLoading && (
                <span style={{ fontSize: "0.7rem", color: "#64748B", fontStyle: "italic" }}>
                  ⏳ Loading raw data from MongoDB...
                </span>
              )}
              <div style={{ marginLeft: "auto", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {[
                  ["Copy WBES to RTG", () => copyRawSeries("wbes", "rtg"), "#EFF6FF", "#1D4ED8", "#BFDBFE"],
                  ["Copy RTG to WBES", () => copyRawSeries("rtg", "wbes"), "#F0FDF4", "#15803D", "#BBF7D0"],
                  ["Auto-Fill Missing", autoFillMissingRawValues, "#FFF7ED", "#C2410C", "#FED7AA"],
                ].map(([label, onClick, background, color, border]) => (
                  <button
                    key={label}
                    type="button"
                    onClick={onClick}
                    disabled={rawEditorLoading || rawEditorSaving}
                    style={{
                      border: `1px solid ${border}`,
                      background,
                      color,
                      borderRadius: "7px",
                      padding: "5px 10px",
                      fontSize: "0.72rem",
                      fontWeight: 800,
                      cursor: rawEditorLoading || rawEditorSaving ? "not-allowed" : "pointer",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Modal Body (Scrollable Table) */}
            <div
              style={{
                padding: "20px 24px",
                overflowY: "auto",
                flex: 1,
                background: "#FFFFFF",
              }}
            >
              {rawEditorLoading ? (
                <div style={{ padding: "60px 0", textAlign: "center", color: "#64748B", fontStyle: "italic", fontSize: "0.82rem" }}>
                  Loading time block series from database...
                </div>
              ) : (
                <div style={{ border: "1px solid #E2E8F0", borderRadius: "10px", overflow: "auto", maxHeight: "58vh" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
                    <thead>
                      <tr style={{ background: "#F1F5F9", borderBottom: "1px solid #E2E8F0" }}>
                        <th style={{ width: "8%", padding: "8px 10px", fontSize: "0.72rem", color: "#475569", fontWeight: 700, textAlign: "center", position: "sticky", top: 0, background: "#F1F5F9", zIndex: 2 }}>Block</th>
                        <th style={{ width: "14%", padding: "8px 10px", fontSize: "0.72rem", color: "#475569", fontWeight: 700, textAlign: "center", position: "sticky", top: 0, background: "#F1F5F9", zIndex: 2 }}>Time</th>
                        {rawEditorColumns.map((col) => (
                          <th key={col.key} style={{ width: "15.6%", padding: "8px 10px", fontSize: "0.72rem", color: col.color, fontWeight: 800, textAlign: "right", position: "sticky", top: 0, background: "#F1F5F9", zIndex: 2 }}>
                            {col.label} (MW)
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Array(96).fill(0).map((_, idx) => {
                        const hr = String(Math.floor(idx / 4)).padStart(2, "0");
                        const min = String((idx % 4) * 15).padStart(2, "0");
                        const nextHr = String(Math.floor((idx + 1) / 4)).padStart(2, "0");
                        const nextMin = String(((idx + 1) % 4) * 15).padStart(2, "0");
                        const timeStr = `${hr}:${min} - ${nextHr === "24" ? "00" : nextHr}:${nextMin === "60" ? "00" : nextMin}`;
                        
                        return (
                          <tr key={idx} style={{ borderBottom: "1px solid #F1F5F9", background: idx % 2 === 0 ? "#FFFFFF" : "#F8FAFC" }}>
                            <td style={{ padding: "6px 12px", fontSize: "0.74rem", color: "#64748B", textAlign: "center", fontWeight: 600 }}>
                              {idx + 1}
                            </td>
                            <td style={{ padding: "6px 12px", fontSize: "0.72rem", color: "#334155", textAlign: "center" }}>
                              {timeStr}
                            </td>
                            {rawEditorColumns.map((col, colIdx) => {
                              const isEditing = activeCell?.rowIdx === idx && activeCell?.colKey === col.key;
                              const val = col.values[idx] ?? 0;
                              return (
                                <td 
                                  key={col.key} 
                                  style={{ 
                                    padding: "4px 10px", 
                                    textAlign: "right",
                                    background: isEditing ? "#EFF6FF" : "transparent",
                                    borderLeft: isEditing ? "2px solid #3B82F6" : "none",
                                    cursor: "text"
                                  }}
                                  onClick={() => setActiveCell({ rowIdx: idx, colKey: col.key })}
                                >
                                  {isEditing ? (
                                    <input
                                      ref={rawInputRef}
                                      type="number"
                                      step="any"
                                      value={val}
                                      onChange={(e) => updateRawEditorCell(col.key, idx, e.target.value)}
                                      onKeyDown={(e) => handleRawEditorKeyDown(e, idx, col.key)}
                                      onPaste={(e) => handleRawEditorPaste(e, idx, colIdx)}
                                      onBlur={() => setActiveCell(null)}
                                      style={{
                                        width: "100%",
                                        minWidth: "86px",
                                        padding: "3px 8px",
                                        fontSize: "0.74rem",
                                        border: "none",
                                        background: "transparent",
                                        textAlign: "right",
                                        color: "#0F172A",
                                        outline: "none"
                                      }}
                                    />
                                  ) : (
                                    <span style={{ fontSize: "0.74rem", color: val ? "#0F172A" : "#94A3B8" }}>
                                      {val || "0"}
                                    </span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Footer */}
            <div
              style={{
                background: "#F1F5F9",
                padding: "12px 24px",
                borderTop: "1px solid #E2E8F0",
                display: "flex",
                justifyContent: "flex-end",
                alignItems: "center",
                gap: "12px",
              }}
            >
              <button
                onClick={() => setRawEditorOpen(false)}
                disabled={rawEditorSaving}
                style={{
                  background: "#FFFFFF",
                  border: "1px solid #CBD5E1",
                  borderRadius: "8px",
                  padding: "8px 20px",
                  color: "#475569",
                  fontSize: "0.8rem",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveRawData}
                disabled={rawEditorSaving || rawEditorLoading}
                style={{
                  background: "linear-gradient(135deg, #03624C, #17876D)",
                  border: "none",
                  borderRadius: "8px",
                  padding: "8px 24px",
                  color: "#FFFFFF",
                  fontSize: "0.8rem",
                  fontWeight: 700,
                  cursor: rawEditorSaving || rawEditorLoading ? "not-allowed" : "pointer",
                  boxShadow: "0 4px 12px rgba(3,98,76,0.2)",
                  opacity: rawEditorSaving || rawEditorLoading ? 0.7 : 1,
                }}
              >
                {rawEditorSaving ? "Saving..." : "Save & Recalculate"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
