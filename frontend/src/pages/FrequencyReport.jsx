/**
 * FrequencyReport.jsx
 * Generation Frequency / Scheduling Compliance Report
 *
 * Data sources:
 *  1. SCADA — Excel upload, one column per plant
 *  2. WBES  — Schedule + DC from POSOCO / WBES portal (via MongoDB)
 *  3. RTG   — Schedule + DC for State & IPG plants
 *
 * The mapping table drives which source each plant uses.
 */

import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import AppShell from "../components/layout/AppShell";
import PlantMappingGrid from "../components/PlantMappingGrid";
import API from "../services/api";
import {
  FileUp, RefreshCw, Download, Printer, BarChart3,
  CheckCircle2, AlertCircle, Clock, ChevronDown, ChevronUp,
  Search, Settings2, Table2, Zap, Save, FileText
} from "lucide-react";
import SectionAccordion from "../components/ui/SectionAccordion";
import PremiumInput from "../components/ui/PremiumInput";
import { Box } from "@mui/material";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine
} from "recharts";

/* ── helpers ─────────────────────────────────────────────── */
const fmt = (v, dec = 1) =>
  v === null || v === undefined ? "—" : Number(v).toFixed(dec);

const today = () => new Date().toISOString().slice(0, 10);


/* ── Interactive Recharts Frequency Compliance Chart ─── */
function FrequencyComplianceChart({ row }) {
  const [showSchAct, setShowSchAct] = useState(false);

  const devColor   = row.is_state ? "#00DF81" : "#EF4444";
  const freqColor  = "#A855F7";
  const schedColor = "#6366F1";
  const actColor   = "#EC4899";

  const chartData = useMemo(() => {
    if (!row.series_timestamps) return [];
    return row.series_timestamps.map((ts, idx) => {
      const deviation  = row.series_deviation?.[idx]  ?? 0;
      const frequency  = row.series_frequency?.[idx]  ?? 50.0;
      const schedule   = row.series_schedule?.[idx]   ?? 0;
      const actual     = row.series_actual?.[idx]     ?? 0;
      const dc         = row.series_dc?.[idx]         ?? 0;

      const isLowFreq = frequency < 49.9;
      let overDrawalShading  = null;
      let underDrawalShading = null;
      let underInjShading    = null;
      let helpingGridShading = null;

      if (isLowFreq) {
        if (row.is_state) {
          if (deviation > 0) overDrawalShading  = deviation;
          else               underDrawalShading = deviation;
        } else {
          if (deviation < 0) underInjShading    = deviation;
          else               helpingGridShading  = deviation;
        }
      }
      return {
        timestamp: ts, deviation, frequency, schedule, actual, dc,
        overDrawalShading, underDrawalShading, underInjShading, helpingGridShading,
      };
    });
  }, [row]);

  const maxVal = useMemo(() => {
    const vals = [];
    if (row.series_deviation) vals.push(...row.series_deviation.map(Math.abs));
    if (showSchAct) {
      if (row.series_schedule) vals.push(...row.series_schedule.map(Math.abs));
      if (row.series_actual)   vals.push(...row.series_actual.map(Math.abs));
    }
    const peak = Math.max(...vals, 1.0);
    let rounded = peak;
    if (peak < 10)       rounded = Math.ceil(peak / 3)   * 3;
    else if (peak < 100) rounded = Math.ceil(peak / 15)  * 15;
    else                 rounded = Math.ceil(peak / 150) * 150;
    return Math.max(rounded, 3);
  }, [row, showSchAct]);

  const formatXAxis = (tickItem) => {
    if (!tickItem) return "";
    try {
      const parts = tickItem.split(" ");
      const d = parts[0].split("-");
      const t = parts[1].split(":");
      return `${d[2]}/${d[1]} ${t[0]}:${t[1]}`;
    } catch { return tickItem; }
  };

  // Inline tooltip — defined as function component within render
  const renderTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    const isLowFreq = d.frequency < 49.9;
    return (
      <div style={{
        background: "rgba(15,23,42,0.96)",
        border: "1px solid rgba(100,116,139,0.4)",
        borderRadius: 10, padding: "10px 14px",
        fontSize: "0.76rem", minWidth: 190,
        boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
      }}>
        <div style={{ fontWeight: 700, color: "#CBD5E1", borderBottom: "1px solid rgba(100,116,139,0.3)", paddingBottom: 5, marginBottom: 7, fontSize: "0.72rem" }}>
          {d.timestamp}
          {isLowFreq && <span style={{ marginLeft: 6, background: "#EF4444", color: "#fff", borderRadius: 3, padding: "1px 5px", fontSize: "0.6rem", fontWeight: 800 }}>LOW FREQ</span>}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <span style={{ color: "#94A3B8" }}>Frequency:</span>
            <span style={{ fontWeight: 700, color: freqColor }}>{d.frequency?.toFixed(3)} Hz</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <span style={{ color: "#94A3B8" }}>Deviation:</span>
            <span style={{ fontWeight: 700, color: d.deviation >= 0 ? "#10B981" : "#EF4444" }}>
              {d.deviation >= 0 ? "+" : ""}{d.deviation?.toFixed(1)} MW
            </span>
          </div>
          {showSchAct && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <span style={{ color: "#94A3B8" }}>Schedule:</span>
                <span style={{ fontWeight: 600, color: schedColor }}>{d.schedule?.toFixed(1)} MW</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <span style={{ color: "#94A3B8" }}>Actual:</span>
                <span style={{ fontWeight: 600, color: actColor }}>{d.actual?.toFixed(1)} MW</span>
              </div>
            </>
          )}
          {isLowFreq && (
            <div style={{ marginTop: 4, paddingTop: 4, borderTop: "1px solid rgba(100,116,139,0.3)", fontSize: "0.68rem", color: "#94A3B8" }}>
              {row.is_state
                ? d.deviation > 0 ? "🟡 Over Drawal during low freq" : "🔵 Helping grid during low freq"
                : d.deviation < 0 ? "🟠 Under Injection during low freq" : "🟢 Helping grid during low freq"}
            </div>
          )}
        </div>
      </div>
    );
  };

  const legendItems = [
    { color: devColor, dash: false, label: "Deviation (MW)" },
    { color: freqColor, dash: true, label: "Frequency (Hz)" },
    ...(showSchAct
      ? [{ color: schedColor, dash: false, label: "Schedule (MW)" }, { color: actColor, dash: false, label: "Actual (MW)" }]
      : []),
    ...(row.is_state
      ? [{ bg: "rgba(234,179,8,0.3)", label: "Over Drawal" }, { bg: "rgba(6,182,212,0.3)", label: "Helping Grid" }]
      : [{ bg: "rgba(249,115,22,0.3)", label: "Under Injection" }, { bg: "rgba(16,185,129,0.3)", label: "Helping Grid" }]),
  ];

  return (
    <div style={{
      background: "linear-gradient(135deg, #0F172A 0%, #1E293B 100%)",
      padding: 18, borderRadius: 14,
      border: "1px solid rgba(100,116,139,0.2)", width: "100%",
      boxShadow: "0 20px 40px -10px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)"
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: "0.88rem", color: "#F1F5F9", letterSpacing: "-0.01em" }}>
            {row.plant_name}
          </div>
          <div style={{ fontSize: "0.68rem", color: "#64748B", marginTop: 2 }}>
            Frequency Compliance Trend — Low Freq Events highlighted
          </div>
        </div>
        <label style={{
          display: "flex", alignItems: "center", gap: 7, cursor: "pointer", userSelect: "none",
          background: showSchAct ? "rgba(52,211,153,0.12)" : "rgba(100,116,139,0.1)",
          border: `1px solid ${showSchAct ? "rgba(52,211,153,0.3)" : "rgba(100,116,139,0.2)"}`,
          borderRadius: 20, padding: "5px 12px", transition: "all 0.2s",
          fontSize: "0.73rem", color: showSchAct ? "#34D399" : "#94A3B8", fontWeight: 600,
        }}>
          <input
            type="checkbox" checked={showSchAct}
            onChange={(e) => setShowSchAct(e.target.checked)}
            style={{ cursor: "pointer", accentColor: "#34D399", width: 13, height: 13 }}
          />
          Show Schedule &amp; Actual
        </label>
      </div>

      {/* Chart */}
      <div style={{ width: "100%", height: 300 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: -8, bottom: 5 }}>
            <defs>
              <linearGradient id={`devGrad-${row.plant_id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor={devColor} stopOpacity={0.18} />
                <stop offset="100%" stopColor={devColor} stopOpacity={0.0}  />
              </linearGradient>
            </defs>

            <CartesianGrid stroke="rgba(100,116,139,0.12)" strokeDasharray="3 3" />
            <XAxis
              dataKey="timestamp" tickFormatter={formatXAxis}
              stroke="#475569" tick={{ fill: "#64748B", fontSize: 10 }}
              dy={5} interval="preserveStartEnd"
            />
            <YAxis
              yAxisId="left" domain={[-maxVal, maxVal]} tickCount={7}
              stroke="#475569" tick={{ fill: "#64748B", fontSize: 10 }}
              label={{ value: "MW", angle: -90, position: "insideLeft", fill: "#475569", fontSize: 9, dx: 10 }}
            />
            <YAxis
              yAxisId="right" orientation="right" domain={[49.4, 50.6]} tickCount={7}
              stroke="#475569" tick={{ fill: "#94A3B8", fontSize: 10 }}
              tickFormatter={(v) => v.toFixed(2)}
              label={{ value: "Hz", angle: 90, position: "insideRight", fill: "#475569", fontSize: 9, dx: -10 }}
            />

            <Tooltip content={<ChartTooltip />} cursor={{ stroke: "rgba(255,255,255,0.08)", strokeWidth: 1 }} />

            <ReferenceLine y={0}    yAxisId="left"  stroke="#475569" strokeWidth={1.5} />
            <ReferenceLine y={50.0} yAxisId="right" stroke="#7C3AED" strokeDasharray="4 4" strokeWidth={1} strokeOpacity={0.6} />

            {/* Low-frequency compliance shading areas */}
            {row.is_state ? (
              <>
                <Area yAxisId="left" type="monotone" dataKey="overDrawalShading"  stroke="none" fill="#EAB308" fillOpacity={0.3} baseValue={0} legendType="none" isAnimationActive={false} />
                <Area yAxisId="left" type="monotone" dataKey="underDrawalShading" stroke="none" fill="#06B6D4" fillOpacity={0.3} baseValue={0} legendType="none" isAnimationActive={false} />
              </>
            ) : (
              <>
                <Area yAxisId="left" type="monotone" dataKey="underInjShading"    stroke="none" fill="#F97316" fillOpacity={0.3} baseValue={0} legendType="none" isAnimationActive={false} />
                <Area yAxisId="left" type="monotone" dataKey="helpingGridShading" stroke="none" fill="#10B981" fillOpacity={0.3} baseValue={0} legendType="none" isAnimationActive={false} />
              </>
            )}

            {/* Deviation line with gradient fill */}
            <Area
              yAxisId="left" type="monotone" dataKey="deviation"
              stroke={devColor} strokeWidth={2}
              fill={`url(#devGrad-${row.plant_id})`}
              dot={false} activeDot={{ r: 4, fill: devColor, strokeWidth: 0 }}
              legendType="none" isAnimationActive={false}
            />

            {/* Frequency line */}
            <Line
              yAxisId="right" type="monotone" dataKey="frequency"
              stroke={freqColor} strokeWidth={1.5} strokeDasharray="5 3"
              dot={false} activeDot={{ r: 3, fill: freqColor, strokeWidth: 0 }}
              legendType="none" isAnimationActive={false}
            />

            {/* On-demand: Schedule & Actual */}
            {showSchAct && (
              <>
                <Line yAxisId="left" type="monotone" dataKey="schedule" stroke={schedColor} strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} legendType="none" isAnimationActive={false} />
                <Line yAxisId="left" type="monotone" dataKey="actual"   stroke={actColor}   strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} legendType="none" isAnimationActive={false} />
              </>
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", justifyContent: "center", flexWrap: "wrap", gap: "8px 16px", marginTop: 10 }}>
        {legendItems.map((item, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            {item.bg ? (
              <div style={{ width: 14, height: 10, borderRadius: 2, background: item.bg }} />
            ) : item.dash ? (
              <svg width="18" height="6"><line x1="0" y1="3" x2="18" y2="3" stroke={item.color} strokeWidth="2" strokeDasharray="5 3" /></svg>
            ) : (
              <div style={{ width: 18, height: 2.5, borderRadius: 2, background: item.color }} />
            )}
            <span style={{ color: "#64748B", fontSize: "0.7rem", fontWeight: 500 }}>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}



/* ── Tabs ────────────────────────────────────────────────── */
const TABS = [
  { id: "report",  label: "Frequency Report", icon: Table2  },
  { id: "mapping", label: "Plant Mapping",    icon: Settings2},
];

export default function FrequencyReport() {
  const [tab, setTab]           = useState("report");
  const [startTime, setStartTime] = useState(today() + "T00:00");
  const [endTime, setEndTime]     = useState(today() + "T23:59");
  const [rows, setRows]         = useState([]);
  const [mapData, setMapData]   = useState([]);
  const [mapLoading, setMapLoading] = useState(false);

  /* RTG actual data status check state */
  const [rtgStatusOk, setRtgStatusOk] = useState(false);
  const [rtgStatusMsg, setRtgStatusMsg] = useState("");
  const [rtgStatusLoading, setRtgStatusLoading] = useState(false);

  /* User descriptions */
  const [introDesc, setIntroDesc] = useState(
    "This report provides a comprehensive analysis of power system frequency and deviation compliance. Deviations are calculated as Actual minus Scheduled values. Statistical calculations are restricted to Low Frequency Operation periods (< 49.9 Hz)."
  );
  const [genDesc, setGenDesc] = useState(
    "Generator Module: Under injection (orange shade) and grid helping (green shade) compliance durations computed during Low Frequency periods (< 49.9 Hz)."
  );
  const [stateDesc, setStateDesc] = useState(
    "State Module: Over drawal (gold shade) and grid helping (cyan shade) compliance durations, along with Maximum Over Drawal (Max OD) magnitude and timestamps during low frequency grid states."
  );

  /* source load status */
  const [wbesLoaded, setWbesLoaded] = useState(false);
  const [rtgLoaded, setRtgLoaded]   = useState(false);
  const [scadaLoaded, setScadaLoaded] = useState(false);
  const [scadaFile, setScadaFile]   = useState(null);

  const [dataLoading, setDataLoading] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [search, setSearch]     = useState("");
  const [stationSearch, setStationSearch] = useState("");
  const [stateSearch, setStateSearch] = useState("");
  const [fuelFilter, setFuelFilter] = useState("ALL");
  const [stateFilter, setStateFilter] = useState("ALL");
  
  const [expandedRowId, setExpandedRowId] = useState(null);

  const fileRef = useRef(null);

  /* ── Load plant mapping ── */
  const loadMapping = useCallback(async () => {
    setMapLoading(true);
    try {
      const res = await API.getFrequencyPlantMapping();
      setMapData(res?.data || []);
      // If report rows are empty, populate them from mapping
      setRows((prev) => {
        if (prev.length > 0) return prev;
        return (res?.data || []).map((m) => ({
          plant_id: m.plant_id,
          stage_id: m.STAGE_ID,
          plant_name: m.plant_name || m.STAGE_NAME || "",
          state: m.state_name || "",
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
          wbes_name: m.wbes_name || "",
          rtg_plant_id: m.rtg_plant_id || "",
          scada_key: m.scada_key || "",
          scada_header: m.scada_header || "",
          is_state: m.is_state || false,
          is_frequency: m.is_frequency || false,
          reason: ""
        }));
      });
    } catch (e) { console.error(e); }
    finally { setMapLoading(false); }
  }, [rows.length]);

  useEffect(() => { loadMapping(); }, []);

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
    return () => { active = false; };
  }, [startTime, endTime]);

  /* ── Arrow Key Navigation inside report table ── */
  const handleTableKeyDown = useCallback((e, colName) => {
    if (["ArrowUp", "ArrowDown"].includes(e.key)) {
      e.preventDefault();
      const table = e.target.closest("table");
      if (!table) return;
      const elements = Array.from(table.querySelectorAll(`[data-col="${colName}"]`));
      const currentIdx = elements.indexOf(e.target);
      if (currentIdx !== -1) {
        let nextIdx = currentIdx;
        if (e.key === "ArrowDown") {
          nextIdx = Math.min(currentIdx + 1, elements.length - 1);
        } else if (e.key === "ArrowUp") {
          nextIdx = Math.max(currentIdx - 1, 0);
        }
        elements[nextIdx]?.focus();
        elements[nextIdx]?.select?.();
      }
    }
  }, []);

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
            updated.pct_dc = updated.dc ? (updated.actual ?? 0) / updated.dc * 100 : 0.0;
          }
          return updated;
        }
        return r;
      })
    );
  };

  /* ── SCADA file selection ── */
  const handleScadaChange = async (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setScadaFile(file);
      setScadaLoaded(true);
      setDataLoading(true);
      try {
        const res = await API.processFrequencyReport(startTime, endTime, rows, file);
        if (res?.success) {
          setRows(res.rows || []);
          setWbesLoaded(true);
          setRtgLoaded(true);
        } else {
          alert("Processing failed: " + (res?.error || "Unknown error"));
        }
      } catch (err) {
        console.error(err);
        alert("Error processing SCADA file: " + err.message);
      } finally {
        setDataLoading(false);
      }
    }
  };

  /* ── Process Report Data on Backend ── */
  const handleProcessReport = useCallback(async () => {
    if (!scadaFile) {
      alert("Please upload a frequency Excel file first.");
      return;
    }
    setDataLoading(true);
    try {
      const res = await API.processFrequencyReport(startTime, endTime, rows, scadaFile);
      if (res?.success) {
        setRows(res.rows || []);
        setWbesLoaded(true);
        setRtgLoaded(true);
        setScadaLoaded(true);
      } else {
        alert("Processing failed: " + (res?.error || "Unknown error"));
      }
    } catch (e) {
      console.error(e);
      alert("Error processing: " + e.message);
    } finally {
      setDataLoading(false);
    }
  }, [startTime, endTime, rows, scadaFile]);

  /* Whether the process button should be enabled */
  const canProcess = !!scadaFile && !dataLoading;

  /* ── Download Reports ── */
  const handleDownloadDocx = async () => {
    try {
      const payload = {
        intro_desc: introDesc,
        gen_desc: genDesc,
        state_desc: stateDesc,
        rows,
        start_time: startTime,
        end_time: endTime
      };
      const blob = await API.downloadFrequencyDocx(payload);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `deviation_compliance_report_${startTime.replace(/:/g, "-")}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert("Error downloading Word report: " + e.message);
    }
  };

  const handleDownloadPdf = async () => {
    try {
      const blob = await API.downloadFrequencyPdf({ rows });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `deviation_compliance_report_${startTime.replace(/:/g, "-")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert("Error downloading PDF report: " + e.message);
    }
  };

  const handleDownloadExcel = async () => {
    try {
      const blob = await API.downloadFrequencyExcel({ rows });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `deviation_summary_report_${startTime.replace(/:/g, "-")}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert("Error downloading Excel summary: " + e.message);
    }
  };

  /* ── Save mapping ── */
  const saveMapping = useCallback(async (dirtyRows) => {
    setSaving(true);
    try {
      await API.saveFrequencyPlantMapping(dirtyRows);
      await loadMapping();
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  }, [loadMapping]);

  /* ── Derived lists ── */
  const fuels  = useMemo(() => ["ALL", ...new Set(rows.filter(r => !r.is_state).map((r) => r.fuel).filter(Boolean))], [rows]);
  const states = useMemo(() => ["ALL", ...new Set(rows.filter(r => !r.is_state).map((r) => r.state).filter(Boolean))], [rows]);

  const visible = useMemo(() => {
    let r = rows.filter(x => !x.is_state);
    if (search) {
      const q = search.toLowerCase();
      r = r.filter((x) =>
        (x.plant_name || "").toLowerCase().includes(q) ||
        (x.state || "").toLowerCase().includes(q)
      );
    }
    if (fuelFilter !== "ALL") r = r.filter((x) => x.fuel === fuelFilter);
    if (stateFilter !== "ALL") r = r.filter((x) => x.state === stateFilter);
    return r;
  }, [rows, search, fuelFilter, stateFilter]);

  /* ── Totals ── */
  const totals = useMemo(() => {
    let dc = 0, sched = 0, actual = 0, dev = 0, cap = 0, cnt = 0;
    visible.forEach((r) => {
      cap   += r.capacity || 0;
      dc    += r.dc || 0;
      sched += r.schedule || 0;
      if (r.actual !== null && r.actual !== undefined) {
        actual += r.actual;
        dev    += (r.actual - (r.schedule || 0));
        cnt++;
      }
    });
    return { cap, dc, sched, actual, dev, cnt };
  }, [visible]);

  const stateRows = useMemo(() => {
    return rows.filter(r => r.is_state && !r.is_frequency);
  }, [rows]);

  const toggleRowExpansion = (plantId) => {
    setExpandedRowId((prev) => (prev === plantId ? null : plantId));
  };

  return (
    <AppShell>
      {/* ── HERO ─────────────────────────────────────────── */}
      <div style={{
        background: "linear-gradient(135deg, #022726 0%, #03624C 55%, #17876D 100%)",
        borderRadius: "16px", padding: "18px 24px", marginBottom: "20px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexWrap: "wrap", gap: "14px",
        boxShadow: "0 8px 32px rgba(2,39,38,0.25)",
      }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <Zap size={22} style={{ color: "#34D399" }} />
            <h1 style={{ color: "#fff", fontWeight: 800, fontSize: "1.35rem",
              margin: 0, letterSpacing: "-0.02em" }}>
              Generation Frequency & Deviation Report
            </h1>
          </div>
          <p style={{ color: "rgba(255,255,255,0.65)", fontSize: "0.8rem",
            margin: "4px 0 0" }}>
            Compare SCADA Actuals with WBES and RTG Schedules
          </p>
        </div>

        {/* Datetime range picker */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            <label style={{ fontSize: "0.65rem", color: "rgba(255,255,255,0.7)", fontWeight: 700 }}>START DATETIME</label>
            <input
              type="datetime-local" value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              style={{
                background: "rgba(255,255,255,0.12)",
                border: "1px solid rgba(255,255,255,0.25)",
                borderRadius: "8px", padding: "6px 10px",
                color: "#fff", fontSize: "0.8rem", outline: "none",
              }}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            <label style={{ fontSize: "0.65rem", color: "rgba(255,255,255,0.7)", fontWeight: 700 }}>END DATETIME</label>
            <input
              type="datetime-local" value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              style={{
                background: "rgba(255,255,255,0.12)",
                border: "1px solid rgba(255,255,255,0.25)",
                borderRadius: "8px", padding: "6px 10px",
                color: "#fff", fontSize: "0.8rem", outline: "none",
              }}
            />
          </div>
          <button
            onClick={handleProcessReport}
            disabled={!canProcess}
            title={!scadaFile ? "Upload a frequency Excel file to enable" : "Fetch all data & recalculate compliance"}
            style={{
              display: "flex", alignItems: "center", gap: "6px",
              background: canProcess ? "linear-gradient(135deg, #34D399, #10B981)" : "#475569",
              border: "none", borderRadius: "8px",
              padding: "8px 18px", fontWeight: 700, fontSize: "0.82rem",
              color: canProcess ? "#022726" : "#94A3B8",
              cursor: canProcess ? "pointer" : "not-allowed",
              marginTop: "14px",
              transition: "all 0.2s",
              boxShadow: canProcess ? "0 2px 8px rgba(52,211,153,0.3)" : "none"
            }}
          >
            <RefreshCw size={14} style={{
              animation: dataLoading ? "spin 1s linear infinite" : "none"
            }} />
            {dataLoading ? "Processing…" : "Apply & Recalculate"}
          </button>
        </div>
      </div>

      {/* ── RTG STATUS BANNER ─────────────────────────────── */}
      {rtgStatusMsg && (
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          background: rtgStatusOk ? "rgba(16,185,129,0.06)" : "rgba(245,158,11,0.06)",
          border: `1px solid ${rtgStatusOk ? "rgba(16,185,129,0.2)" : "rgba(245,158,11,0.2)"}`,
          borderRadius: "12px",
          padding: "12px 18px",
          marginBottom: "16px",
          fontSize: "0.8rem",
          color: rtgStatusOk ? "#065F46" : "#92400E",
          boxShadow: "0 2px 6px rgba(0,0,0,0.02)",
        }}>
          <AlertCircle size={16} style={{ color: rtgStatusOk ? "#10B981" : "#F59E0B", flexShrink: 0 }} />
          <div>
            <strong style={{ fontWeight: 800 }}>RTG Portal SCADA Availability:</strong> {rtgStatusMsg}
          </div>
        </div>
      )}

      {/* ── STATUS STRIP ─────────────────────────────────── */}
      <div style={{
        display: "flex", gap: "10px", marginBottom: "18px", flexWrap: "wrap"
      }}>
        {[
          { label: "WBES Data",   ok: wbesLoaded, src: "WBES / POSOCO" },
          { label: "RTG Data",    ok: rtgLoaded,  src: "RTG Portal" },
          { 
            label: rtgStatusOk ? "Frequency Data" : "SCADA Data",
            ok: scadaLoaded,
            src: scadaFile ? scadaFile.name : (rtgStatusOk ? "Upload Frequency-only Excel" : "Upload full SCADA Excel"),
            action: () => fileRef.current?.click()
          },
        ].map((s, i) => (
          <div
            key={i}
            onClick={s.action}
            style={{
              flex: 1, minWidth: "180px",
              background: s.ok ? "rgba(16,185,129,0.08)" : "rgba(100,116,139,0.08)",
              border: `1px solid ${s.ok ? "rgba(16,185,129,0.3)" : "rgba(100,116,139,0.2)"}`,
              borderRadius: "12px", padding: "12px 16px",
              display: "flex", alignItems: "center", gap: "10px",
              cursor: s.action ? "pointer" : "default",
              transition: "all 0.2s",
            }}
          >
            {s.ok
              ? <CheckCircle2 size={18} style={{ color: "#10B981", flexShrink: 0 }} />
              : <AlertCircle size={18} style={{ color: "#94A3B8", flexShrink: 0 }} />
            }
            <div>
              <div style={{ fontWeight: 700, fontSize: "0.78rem",
                color: s.ok ? "#065F46" : "#334155" }}>
                {s.label}
              </div>
              <div style={{ fontSize: "0.68rem", color: "#64748B", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap", maxWidth: "200px" }}>
                {s.ok ? `Loaded (${s.src})` : "Not loaded"}
              </div>
            </div>
          </div>
        ))}

        <input
          ref={fileRef} type="file" accept=".xlsx,.xls"
          style={{ display: "none" }}
          onChange={handleScadaChange}
        />

        <button
          onClick={() => fileRef.current?.click()}
          style={{
            display: "flex", alignItems: "center", gap: "6px",
            background: "#F8FAFC", border: "2px dashed #CBD5E1",
            borderRadius: "12px", padding: "12px 20px",
            fontWeight: 700, fontSize: "0.78rem", color: "#64748B",
            cursor: "pointer", transition: "all 0.2s",
          }}
        >
          <FileUp size={15} />
          {scadaFile ? "Change file" : (rtgStatusOk ? "Upload Frequency-only Excel" : "Upload Full SCADA Excel")}
        </button>
      </div>

      {/* ── TABS ─────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: "4px", marginBottom: "16px",
        borderBottom: "2px solid #E5E7EB" }}>
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              display: "flex", alignItems: "center", gap: "6px",
              padding: "8px 18px", border: "none",
              borderBottom: active ? "2px solid #022726" : "2px solid transparent",
              marginBottom: "-2px",
              background: "none",
              fontWeight: active ? 700 : 500,
              fontSize: "0.82rem",
              color: active ? "#022726" : "#64748B",
              cursor: "pointer", transition: "all 0.15s",
            }}>
              <Icon size={14} />
              {t.label}
            </button>
          );
        })}

        <div style={{ marginLeft: "auto", display: "flex", gap: "8px",
          alignItems: "center", paddingBottom: "4px" }}>
          <button
            onClick={handleDownloadExcel}
            disabled={rows.length === 0}
            style={{
              display: "flex", alignItems: "center", gap: "5px",
              background: rows.length > 0 ? "#0f766e" : "#F1F5F9",
              border: "none", borderRadius: "8px",
              padding: "6px 14px", fontSize: "0.75rem",
              color: rows.length > 0 ? "#fff" : "#94A3B8",
              cursor: rows.length > 0 ? "pointer" : "not-allowed",
              fontWeight: 700,
            }}
          >
            <Download size={12} /> Excel Summary
          </button>
          <button
            onClick={handleDownloadDocx}
            disabled={rows.length === 0}
            style={{
              display: "flex", alignItems: "center", gap: "5px",
              background: rows.length > 0 ? "#1e3a8a" : "#F1F5F9",
              border: "none", borderRadius: "8px",
              padding: "6px 14px", fontSize: "0.75rem",
              color: rows.length > 0 ? "#fff" : "#94A3B8",
              cursor: rows.length > 0 ? "pointer" : "not-allowed",
              fontWeight: 700,
            }}
          >
            <FileText size={12} /> Word Report
          </button>
          <button
            onClick={handleDownloadPdf}
            disabled={rows.length === 0}
            style={{
              display: "flex", alignItems: "center", gap: "5px",
              background: rows.length > 0 ? "#b91c1c" : "#F1F5F9",
              border: "none", borderRadius: "8px",
              padding: "6px 14px", fontSize: "0.75rem",
              color: rows.length > 0 ? "#fff" : "#94A3B8",
              cursor: rows.length > 0 ? "pointer" : "not-allowed",
              fontWeight: 700,
            }}
          >
            <Download size={12} /> PDF Report
          </button>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════
         TAB: FREQUENCY REPORT TABLE
      ════════════════════════════════════════════════════ */}
      {tab === "report" && (
        <>
          {/* Executive Summary Input Area */}
          <div style={{
            background: "#fff", border: "1px solid #E5E7EB", borderRadius: "12px",
            padding: "16px", marginBottom: "18px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)"
          }}>
            <h3 style={{ fontSize: "0.85rem", fontWeight: 700, color: "#0F172A", marginBottom: "6px" }}>
              Report Executive Summary & General Notes
            </h3>
            <textarea
              value={introDesc}
              onChange={(e) => setIntroDesc(e.target.value)}
              rows={2}
              style={{
                width: "100%", border: "1px solid #E2E8F0", borderRadius: "8px",
                padding: "8px 12px", fontSize: "0.78rem", color: "#334155",
                outline: "none", resize: "vertical", fontFamily: "inherit"
              }}
              placeholder="Enter summary notes which will be embedded at the start of the Word document..."
            />
          </div>

          {/* ── State compliance section ── */}
          {stateRows.length > 0 && (
            <SectionAccordion
              title="State Drawal Compliance Details"
              subtitle="State drawal schedules and compliance statistics (Click a state to view plot)"
              count={stateRows.length}
            >
              <div style={{
                overflowX: "auto", borderRadius: "12px",
                border: "1px solid #E5E7EB",
                boxShadow: "0 2px 10px rgba(0,0,0,0.07)",
                marginBottom: "12px"
              }}>
                <table style={{ borderCollapse: "collapse", width: "100%", tableLayout: "fixed", minWidth: "1100px" }}>
                  <colgroup>
                    <col style={{ width: "160px" }} />
                    <col style={{ width: "100px" }} />
                    <col style={{ width: "100px" }} />
                    <col style={{ width: "100px" }} />
                    <col style={{ width: "100px" }} />
                    <col style={{ width: "100px" }} />
                    <col style={{ width: "110px" }} />
                    <col style={{ width: "80px" }} />
                    <col style={{ width: "140px" }} />
                    <col style={{ width: "100px" }} />
                    <col style={{ width: "200px" }} />
                  </colgroup>
                  <thead>
                    <tr style={{ background: "#0F172A" }}>
                      <th style={{ padding: "10px 8px", fontSize: "0.7rem", color: "#94A3B8", fontWeight: 700, textAlign: "left" }}>State Name</th>
                      <th style={{ padding: "10px 8px", fontSize: "0.7rem", color: "#94A3B8", fontWeight: 700, textAlign: "center" }}>Sch.Source</th>
                      <th style={{ padding: "10px 8px", fontSize: "0.7rem", color: "#94A3B8", fontWeight: 700, textAlign: "center" }}>DC Source</th>
                      <th style={{ padding: "10px 8px", fontSize: "0.7rem", color: "#94A3B8", fontWeight: 700, textAlign: "right" }}>DC (MW)</th>
                      <th style={{ padding: "10px 8px", fontSize: "0.7rem", color: "#94A3B8", fontWeight: 700, textAlign: "right" }}>Sched (MW)</th>
                      <th style={{ padding: "10px 8px", fontSize: "0.7rem", color: "#94A3B8", fontWeight: 700, textAlign: "right" }}>Actual (MW)</th>
                      <th style={{ padding: "10px 8px", fontSize: "0.7rem", color: "#94A3B8", fontWeight: 700, textAlign: "right" }}>Deviation (MW)</th>
                      <th style={{ padding: "10px 8px", fontSize: "0.7rem", color: "#94A3B8", fontWeight: 700, textAlign: "right" }}>% DC</th>
                      <th style={{ padding: "10px 8px", fontSize: "0.7rem", color: "#94A3B8", fontWeight: 700, textAlign: "center" }}>Max OD (MW)</th>
                      <th style={{ padding: "10px 8px", fontSize: "0.7rem", color: "#94A3B8", fontWeight: 700, textAlign: "center" }}>OD Time / Freq</th>
                      <th style={{ padding: "10px 8px", fontSize: "0.7rem", color: "#94A3B8", fontWeight: 700, textAlign: "left" }}>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stateRows.map((row, ri) => {
                      const hasActual = row.actual !== null && row.actual !== undefined;
                      const devPos = hasActual && row.deviation >= 0;
                      const pctDC = hasActual && row.pct_dc !== null;
                      const isExpanded = expandedRowId === row.plant_id;
                      
                      return (
                        <>
                          <tr key={row.plant_id} style={{
                            background: ri % 2 === 0 ? "#fff" : "#F9FAFB",
                            transition: "background 0.1s",
                            cursor: "pointer"
                          }}
                          onClick={() => toggleRowExpansion(row.plant_id)}
                          onMouseEnter={(e) => e.currentTarget.style.background = "#EFF6FF"}
                          onMouseLeave={(e) => e.currentTarget.style.background = ri % 2 === 0 ? "#fff" : "#F9FAFB"}
                          >
                            <td style={{ padding: "8px 8px", fontSize: "0.75rem", fontWeight: 700, color: "#0F172A" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                {row.plant_name}
                              </div>
                            </td>
                            <td style={{ padding: "4px 8px", textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
                              <select
                                data-col="sched_src"
                                value={row.sched_src || "WBES"}
                                onChange={(e) => updateRowField(row.plant_id, "sched_src", e.target.value)}
                                onKeyDown={(e) => handleTableKeyDown(e, "sched_src")}
                                style={{ fontSize: "0.72rem", border: "1px solid #CBD5E1", borderRadius: "4px", padding: "2px 4px", background: "#fff" }}
                              >
                                <option value="RTG">RTG</option>
                                <option value="WBES">WBES</option>
                                <option value="Manual">Manual</option>
                              </select>
                            </td>
                            <td style={{ padding: "4px 8px", textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
                              <select
                                data-col="dc_src"
                                value={row.dc_src || "RTG"}
                                onChange={(e) => updateRowField(row.plant_id, "dc_src", e.target.value)}
                                onKeyDown={(e) => handleTableKeyDown(e, "dc_src")}
                                style={{ fontSize: "0.72rem", border: "1px solid #CBD5E1", borderRadius: "4px", padding: "2px 4px", background: "#fff" }}
                              >
                                <option value="RTG">RTG</option>
                                <option value="WBES">WBES</option>
                                <option value="Manual">Manual</option>
                              </select>
                            </td>
                            <td style={{ padding: "4px 8px", textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
                              {row.dc_src === "Manual" ? (
                                <input
                                  data-col="dc"
                                  type="number"
                                  value={row.dc ?? 0}
                                  onChange={(e) => updateRowField(row.plant_id, "dc", parseFloat(e.target.value) || 0)}
                                  onKeyDown={(e) => handleTableKeyDown(e, "dc")}
                                  style={{ width: "70px", fontSize: "0.72rem", border: "1px solid #CBD5E1", borderRadius: "4px", padding: "2px 4px", textAlign: "right" }}
                                />
                              ) : (
                                <span style={{ fontSize: "0.75rem", color: "#6366F1", fontWeight: 600 }}>{fmt(row.dc)}</span>
                              )}
                            </td>
                            <td style={{ padding: "4px 8px", textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
                              {row.sched_src === "Manual" ? (
                                <input
                                  data-col="schedule"
                                  type="number"
                                  value={row.schedule ?? 0}
                                  onChange={(e) => updateRowField(row.plant_id, "schedule", parseFloat(e.target.value) || 0)}
                                  onKeyDown={(e) => handleTableKeyDown(e, "schedule")}
                                  style={{ width: "70px", fontSize: "0.72rem", border: "1px solid #CBD5E1", borderRadius: "4px", padding: "2px 4px", textAlign: "right" }}
                                />
                              ) : (
                                <span style={{ fontSize: "0.75rem", color: "#3B82F6", fontWeight: 600 }}>{fmt(row.schedule)}</span>
                              )}
                            </td>
                            <td style={{ padding: "8px 8px", textAlign: "right", fontSize: "0.75rem", color: hasActual ? "#0F172A" : "#CBD5E1", fontWeight: hasActual ? 700 : 400 }}>
                              {hasActual ? fmt(row.actual) : "—"}
                            </td>
                            <td style={{ padding: "8px 8px", textAlign: "right", fontSize: "0.75rem", fontWeight: 700, color: hasActual ? (devPos ? "#10B981" : "#EF4444") : "#CBD5E1" }}>
                              {hasActual ? (devPos ? "+" : "") + fmt(row.deviation) : "—"}
                            </td>
                            <td style={{ padding: "8px 8px", textAlign: "right" }}>
                              {pctDC ? (
                                <span style={{
                                  background: row.pct_dc >= 90 ? "#D1FAE5" : row.pct_dc >= 75 ? "#FEF3C7" : "#FEE2E2",
                                  color: row.pct_dc >= 90 ? "#065F46" : row.pct_dc >= 75 ? "#92400E" : "#991B1B",
                                  borderRadius: "5px", padding: "2px 6px", fontSize: "0.7rem", fontWeight: 700,
                                }}>
                                  {fmt(row.pct_dc, 1)}%
                                </span>
                              ) : "—"}
                            </td>
                            <td style={{ padding: "8px 8px", fontSize: "0.72rem", fontWeight: 700, color: "#92400E", textAlign: "center" }}>
                              {row.max_od !== undefined ? fmt(row.max_od) : "—"}
                            </td>
                            <td style={{ padding: "8px 8px", fontSize: "0.68rem", color: "#64748B", textAlign: "center" }}>
                              {row.max_od_time ? `${row.max_od_time} | ${fmt(row.max_od_freq, 2)}Hz` : "—"}
                            </td>
                            <td style={{ padding: "4px 8px" }} onClick={(e) => e.stopPropagation()}>
                              <input
                                data-col="reason"
                                value={row.reason || ""}
                                onChange={(e) => updateRowField(row.plant_id, "reason", e.target.value)}
                                onKeyDown={(e) => handleTableKeyDown(e, "reason")}
                                placeholder="Add reason…"
                                style={{ border: "none", background: "transparent", outline: "none", fontSize: "0.72rem", color: "#64748B", width: "100%", fontFamily: "inherit" }}
                              />
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr style={{ background: "#F8FAFC" }}>
                              <td colSpan="11" style={{ padding: "16px", borderBottom: "1px solid #E2E8F0" }}>
                                <div style={{ display: "flex", gap: "24px", flexWrap: "wrap", alignItems: "flex-start" }}>
                                  {row.series_timestamps && row.series_timestamps.length > 0 ? (
                                    <div style={{ flex: "1 1 650px", maxWidth: "100%" }}>
                                      <FrequencyComplianceChart row={row} />
                                    </div>
                                  ) : (
                                    <div style={{ flex: "0 0 600px", height: "250px", background: "#E2E8F0", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748B", fontStyle: "italic", fontSize: "0.8rem" }}>
                                      No time series data available. Click "Apply & Recalculate" with SCADA file.
                                    </div>
                                  )}
                                  <div style={{ flex: "1", minWidth: "250px", background: "#fff", padding: "16px", borderRadius: "8px", border: "1px solid #E2E8F0" }}>
                                    <h4 style={{ fontSize: "0.82rem", fontWeight: 700, color: "#03624C", marginBottom: "8px", textTransform: "uppercase" }}>Compliance Summary</h4>
                                    <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "0.78rem" }}>
                                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                                        <span style={{ color: "#64748B" }}>Over Drawal % Duration (Freq &lt; 49.9Hz):</span>
                                        <span style={{ fontWeight: 700, color: "gold", background: "rgba(218,165,32,0.1)", padding: "1px 6px", borderRadius: "4px" }}>{fmt(row.over_drawal_pct, 2)}%</span>
                                      </div>
                                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                                        <span style={{ color: "#64748B" }}>Helping Grid % Duration (Freq &lt; 49.9Hz):</span>
                                        <span style={{ fontWeight: 700, color: "cyan", background: "rgba(0,255,255,0.1)", padding: "1px 6px", borderRadius: "4px" }}>{fmt(row.under_drawal_pct, 2)}%</span>
                                      </div>
                                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                                        <span style={{ color: "#64748B" }}>Maximum Over Drawal:</span>
                                        <span style={{ fontWeight: 700, color: "#b91c1c" }}>{fmt(row.max_od)} MW</span>
                                      </div>
                                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                                        <span style={{ color: "#64748B" }}>Time of Max OD:</span>
                                        <span style={{ fontWeight: 600 }}>{row.max_od_time || "—"}</span>
                                      </div>
                                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                                        <span style={{ color: "#64748B" }}>Frequency at Max OD:</span>
                                        <span style={{ fontWeight: 600 }}>{row.max_od_freq ? `${fmt(row.max_od_freq, 2)} Hz` : "—"}</span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* State description block */}
              <div style={{ background: "#F8FAFC", padding: "12px", borderRadius: "8px", border: "1px solid #E2E8F0" }}>
                <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "#334155", display: "block", marginBottom: "4px" }}>
                  State Module Comments / Descriptions
                </label>
                <textarea
                  value={stateDesc}
                  onChange={(e) => setStateDesc(e.target.value)}
                  rows={2}
                  style={{
                    width: "100%", border: "1px solid #CBD5E1", borderRadius: "6px",
                    padding: "6px 10px", fontSize: "0.75rem", color: "#334155",
                    outline: "none", resize: "vertical", fontFamily: "inherit"
                  }}
                />
              </div>
            </SectionAccordion>
          )}

          {/* ── Generator compliance section ── */}
          <SectionAccordion
            title="Generator Compliance Details"
            subtitle="Unit-wise scheduling compliance details grouped by state (Click a generator to view plot)"
            count={visible.length}
            actions={
              <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                <Box sx={{ width: 200 }}>
                  <PremiumInput
                    placeholder="Search plant..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    sx={{
                      "& .MuiOutlinedInput-root": {
                        background: "rgba(255,255,255,0.14)",
                        color: "#fff",
                        "& fieldset": { borderColor: "rgba(255,255,255,0.18)" },
                      },
                      "& input": { color: "#fff", padding: "6px 10px" },
                      "& input::placeholder": { color: "rgba(255,255,255,0.65)", fontSize: "0.75rem" },
                    }}
                    InputProps={{
                      startAdornment: <Search size={12} style={{ marginRight: 4, color: "rgba(255,255,255,0.65)" }} />,
                    }}
                  />
                </Box>
                <select 
                  value={fuelFilter} 
                  onChange={(e) => setFuelFilter(e.target.value)}
                  style={{
                    border: "1px solid rgba(255,255,255,0.18)",
                    borderRadius: "6px", padding: "4px 8px", fontSize: "0.72rem",
                    color: "#fff", background: "rgba(255,255,255,0.14)", height: 32
                  }}
                >
                  {fuels.map((f) => <option key={f} value={f} style={{ color: "#374151" }}>{f}</option>)}
                </select>
                <select 
                  value={stateFilter} 
                  onChange={(e) => setStateFilter(e.target.value)}
                  style={{
                    border: "1px solid rgba(255,255,255,0.18)",
                    borderRadius: "6px", padding: "4px 8px", fontSize: "0.72rem",
                    color: "#fff", background: "rgba(255,255,255,0.14)", height: 32
                  }}
                >
                  {states.map((s) => <option key={s} value={s} style={{ color: "#374151" }}>{s}</option>)}
                </select>
              </Box>
            }
          >
            {visible.length === 0 ? (
              <div style={{
                borderRadius: "12px", border: "1px solid #E5E7EB",
                background: "#fff", padding: "40px", textAlign: "center",
                color: "#94A3B8", fontStyle: "italic", fontSize: "0.85rem"
              }}>
                {dataLoading ? "Processing data…" : 'Upload SCADA excel and click "Apply & Recalculate"'}
              </div>
            ) : (
              ["BIHAR", "JHARKHAND", "ODISHA", "WEST BENGAL", "SIKKIM", "DVC", "ER"].map((st) => {
                const statePlants = visible.filter((p) => {
                  const pState = (p.state || "").toUpperCase();
                  if (st === "ER") {
                    return pState === "ER" || pState === "BHUTAN" || !["BIHAR", "JHARKHAND", "ODISHA", "WEST BENGAL", "SIKKIM", "DVC"].includes(pState);
                  }
                  return pState === st;
                });

                if (statePlants.length === 0) return null;

                return (
                  <div key={st} style={{ marginBottom: "24px" }}>
                    <h4 style={{
                      fontSize: "0.82rem", fontWeight: 800,
                      color: "#03624C", marginBottom: "8px",
                      display: "flex", alignItems: "center", gap: "8px",
                      letterSpacing: "0.03em",
                    }}>
                      <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#10B981" }}></span>
                      {st === "ER" ? "EASTERN REGION & OTHERS (ER)" : `${st} STATE COMPLIANCE`}
                      <span style={{ fontSize: "0.7rem", color: "#64748B", fontWeight: 500 }}>
                        ({statePlants.length} plants)
                      </span>
                    </h4>
                    
                    <div style={{
                      overflowX: "auto", borderRadius: "12px",
                      border: "1px solid #E5E7EB",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
                      background: "#fff",
                    }}>
                      <table style={{ borderCollapse: "collapse", width: "100%", tableLayout: "fixed", minWidth: "1150px" }}>
                        <colgroup>
                          <col style={{ width: "160px" }} />
                          <col style={{ width: "80px" }} />
                          <col style={{ width: "80px" }} />
                          <col style={{ width: "80px" }} />
                          <col style={{ width: "100px" }} />
                          <col style={{ width: "100px" }} />
                          <col style={{ width: "90px" }} />
                          <col style={{ width: "90px" }} />
                          <col style={{ width: "90px" }} />
                          <col style={{ width: "90px" }} />
                          <col style={{ width: "80px" }} />
                          <col />
                        </colgroup>
                        <thead>
                          <tr style={{ background: "#022726" }}>
                            <th style={{ padding: "8px", fontSize: "0.68rem", color: "#94A3B8", fontWeight: 700, textAlign: "left" }}>Plant Name</th>
                            <th style={{ padding: "8px", fontSize: "0.68rem", color: "#94A3B8", fontWeight: 700, textAlign: "left" }}>State</th>
                            <th style={{ padding: "8px", fontSize: "0.68rem", color: "#94A3B8", fontWeight: 700, textAlign: "left" }}>Fuel</th>
                            <th style={{ padding: "8px", fontSize: "0.68rem", color: "#94A3B8", fontWeight: 700, textAlign: "center" }}>Sch.Source</th>
                            <th style={{ padding: "8px", fontSize: "0.68rem", color: "#94A3B8", fontWeight: 700, textAlign: "center" }}>DC Source</th>
                            <th style={{ padding: "8px", fontSize: "0.68rem", color: "#94A3B8", fontWeight: 700, textAlign: "right" }}>Cap (MW)</th>
                            <th style={{ padding: "8px", fontSize: "0.68rem", color: "#94A3B8", fontWeight: 700, textAlign: "right" }}>DC (MW)</th>
                            <th style={{ padding: "8px", fontSize: "0.68rem", color: "#94A3B8", fontWeight: 700, textAlign: "right" }}>Sched (MW)</th>
                            <th style={{ padding: "8px", fontSize: "0.68rem", color: "#94A3B8", fontWeight: 700, textAlign: "right" }}>Actual (MW)</th>
                            <th style={{ padding: "8px", fontSize: "0.68rem", color: "#94A3B8", fontWeight: 700, textAlign: "right" }}>Deviation</th>
                            <th style={{ padding: "8px", fontSize: "0.68rem", color: "#94A3B8", fontWeight: 700, textAlign: "right" }}>% DC</th>
                            <th style={{ padding: "8px", fontSize: "0.68rem", color: "#94A3B8", fontWeight: 700, textAlign: "left" }}>Reason</th>
                          </tr>
                        </thead>
                        <tbody>
                          {statePlants.map((row, ri) => {
                            const hasActual = row.actual !== null && row.actual !== undefined;
                            const devPos = hasActual && row.deviation >= 0;
                            const pctDC = hasActual && row.pct_dc !== null;
                            const isExpanded = expandedRowId === row.plant_id;

                            return (
                              <>
                                <tr key={`${row.plant_id}_${row.stage_id}`}
                                  style={{
                                    background: ri % 2 === 0 ? "#fff" : "#F9FAFB",
                                    transition: "background 0.1s",
                                    cursor: "pointer"
                                  }}
                                  onClick={() => toggleRowExpansion(row.plant_id)}
                                  onMouseEnter={(e) => e.currentTarget.style.background = "#EFF6FF"}
                                  onMouseLeave={(e) => e.currentTarget.style.background = ri % 2 === 0 ? "#fff" : "#F9FAFB"}
                                >
                                  <td style={{ padding: "6px 8px", fontSize: "0.73rem", fontWeight: 600, color: "#0F172A" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                      {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                      {row.plant_name}
                                    </div>
                                  </td>
                                  <td style={{ padding: "6px 8px", fontSize: "0.71rem", color: "#374151" }}>{row.state}</td>
                                  <td style={{ padding: "6px 8px" }}>
                                    <span style={{
                                      background: "rgba(245,158,11,0.15)", color: "#D97706",
                                      borderRadius: "5px", padding: "1px 5px", fontSize: "0.62rem", fontWeight: 700,
                                    }}>{row.fuel || "—"}</span>
                                  </td>
                                  <td style={{ padding: "3px 8px", textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
                                    <select
                                      data-col="sched_src"
                                      value={row.sched_src || "RTG"}
                                      onChange={(e) => updateRowField(row.plant_id, "sched_src", e.target.value)}
                                      onKeyDown={(e) => handleTableKeyDown(e, "sched_src")}
                                      style={{ fontSize: "0.72rem", border: "1px solid #CBD5E1", borderRadius: "4px", padding: "1px 3px", background: "#fff" }}
                                    >
                                      <option value="RTG">RTG</option>
                                      <option value="WBES">WBES</option>
                                      <option value="Manual">Manual</option>
                                    </select>
                                  </td>
                                  <td style={{ padding: "3px 8px", textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
                                    <select
                                      data-col="dc_src"
                                      value={row.dc_src || "RTG"}
                                      onChange={(e) => updateRowField(row.plant_id, "dc_src", e.target.value)}
                                      onKeyDown={(e) => handleTableKeyDown(e, "dc_src")}
                                      style={{ fontSize: "0.72rem", border: "1px solid #CBD5E1", borderRadius: "4px", padding: "1px 3px", background: "#fff" }}
                                    >
                                      <option value="RTG">RTG</option>
                                      <option value="WBES">WBES</option>
                                      <option value="Manual">Manual</option>
                                    </select>
                                  </td>
                                  <td style={{ padding: "6px 8px", textAlign: "right", fontSize: "0.73rem", color: "#374151", fontWeight: 600 }}>
                                    {fmt(row.capacity, 0)}
                                  </td>
                                  <td style={{ padding: "3px 8px", textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
                                    {row.dc_src === "Manual" ? (
                                      <input
                                        data-col="dc"
                                        type="number"
                                        value={row.dc ?? 0}
                                        onChange={(e) => updateRowField(row.plant_id, "dc", parseFloat(e.target.value) || 0)}
                                        onKeyDown={(e) => handleTableKeyDown(e, "dc")}
                                        style={{ width: "65px", fontSize: "0.72rem", border: "1px solid #CBD5E1", borderRadius: "4px", padding: "1px 3px", textAlign: "right" }}
                                      />
                                    ) : (
                                      <span style={{ fontSize: "0.73rem", color: "#6366F1", fontWeight: 600 }}>{fmt(row.dc)}</span>
                                    )}
                                  </td>
                                  <td style={{ padding: "3px 8px", textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
                                    {row.sched_src === "Manual" ? (
                                      <input
                                        data-col="schedule"
                                        type="number"
                                        value={row.schedule ?? 0}
                                        onChange={(e) => updateRowField(row.plant_id, "schedule", parseFloat(e.target.value) || 0)}
                                        onKeyDown={(e) => handleTableKeyDown(e, "schedule")}
                                        style={{ width: "65px", fontSize: "0.72rem", border: "1px solid #CBD5E1", borderRadius: "4px", padding: "1px 3px", textAlign: "right" }}
                                      />
                                    ) : (
                                      <span style={{ fontSize: "0.73rem", color: "#3B82F6", fontWeight: 600 }}>{fmt(row.schedule)}</span>
                                    )}
                                  </td>
                                  <td style={{ padding: "6px 8px", textAlign: "right", fontSize: "0.73rem", color: hasActual ? "#0F172A" : "#CBD5E1", fontWeight: hasActual ? 700 : 400 }}>
                                    {hasActual ? fmt(row.actual) : "—"}
                                  </td>
                                  <td style={{ padding: "6px 8px", textAlign: "right", fontSize: "0.73rem", fontWeight: 700, color: hasActual ? (devPos ? "#10B981" : "#EF4444") : "#CBD5E1" }}>
                                    {hasActual ? (devPos ? "+" : "") + fmt(row.deviation) : "—"}
                                  </td>
                                  <td style={{ padding: "6px 8px", textAlign: "right" }}>
                                    {pctDC ? (
                                      <span style={{
                                        background: row.pct_dc >= 90 ? "#D1FAE5" : row.pct_dc >= 75 ? "#FEF3C7" : "#FEE2E2",
                                        color: row.pct_dc >= 90 ? "#065F46" : row.pct_dc >= 75 ? "#92400E" : "#991B1B",
                                        borderRadius: "5px", padding: "1px 5px", fontSize: "0.65rem", fontWeight: 700,
                                      }}>{fmt(row.pct_dc, 1)}%</span>
                                    ) : "—"}
                                  </td>
                                  <td style={{ padding: "2px 8px", borderBottom: "1px solid #F1F5F9" }} onClick={(e) => e.stopPropagation()}>
                                    <input
                                      data-col="reason"
                                      value={row.reason || ""}
                                      onChange={(e) => updateRowField(row.plant_id, "reason", e.target.value)}
                                      onKeyDown={(e) => handleTableKeyDown(e, "reason")}
                                      placeholder="Add reason…"
                                      style={{ border: "none", background: "transparent", outline: "none", fontSize: "0.7rem", color: "#64748B", width: "100%", fontFamily: "inherit" }}
                                    />
                                  </td>
                                </tr>
                                {isExpanded && (
                                  <tr style={{ background: "#F8FAFC" }}>
                                    <td colSpan="12" style={{ padding: "16px", borderBottom: "1px solid #E2E8F0" }}>
                                      <div style={{ display: "flex", gap: "24px", flexWrap: "wrap", alignItems: "flex-start" }}>
                                        {row.series_timestamps && row.series_timestamps.length > 0 ? (
                                          <div style={{ flex: "1 1 650px", maxWidth: "100%" }}>
                                            <FrequencyComplianceChart row={row} />
                                          </div>
                                        ) : (
                                          <div style={{ flex: "0 0 600px", height: "250px", background: "#E2E8F0", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748B", fontStyle: "italic", fontSize: "0.8rem" }}>
                                            No time series data available. Click "Apply & Recalculate" with SCADA file.
                                          </div>
                                        )}
                                        <div style={{ flex: "1", minWidth: "250px", background: "#fff", padding: "16px", borderRadius: "8px", border: "1px solid #E2E8F0" }}>
                                          <h4 style={{ fontSize: "0.82rem", fontWeight: 700, color: "#03624C", marginBottom: "8px", textTransform: "uppercase" }}>Generator Stats</h4>
                                          <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "0.78rem" }}>
                                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                                              <span style={{ color: "#64748B" }}>Under Injection % Duration (Freq &lt; 49.9Hz):</span>
                                              <span style={{ fontWeight: 700, color: "darkorange", background: "rgba(255,140,0,0.1)", padding: "1px 6px", borderRadius: "4px" }}>{fmt(row.under_inj_pct, 2)}%</span>
                                            </div>
                                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                                              <span style={{ color: "#64748B" }}>Helping Grid % Duration (Freq &lt; 49.9Hz):</span>
                                              <span style={{ fontWeight: 700, color: "green", background: "rgba(0,128,0,0.1)", padding: "1px 6px", borderRadius: "4px" }}>{fmt(row.helping_grid_pct, 2)}%</span>
                                            </div>
                                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                                              <span style={{ color: "#64748B" }}>Capacity:</span>
                                              <span style={{ fontWeight: 600 }}>{fmt(row.capacity, 0)} MW</span>
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })
            )}

            {/* Generator description block */}
            <div style={{ background: "#F8FAFC", padding: "12px", borderRadius: "8px", border: "1px solid #E2E8F0", marginTop: "12px" }}>
              <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "#334155", display: "block", marginBottom: "4px" }}>
                Generator Module Comments / Descriptions
              </label>
              <textarea
                value={genDesc}
                onChange={(e) => setGenDesc(e.target.value)}
                rows={2}
                style={{
                  width: "100%", border: "1px solid #CBD5E1", borderRadius: "6px",
                  padding: "6px 10px", fontSize: "0.75rem", color: "#334155",
                  outline: "none", resize: "vertical", fontFamily: "inherit"
                }}
              />
            </div>
          </SectionAccordion>
        </>
      )}

      {/* ════════════════════════════════════════════════════
         TAB: PLANT MAPPING
      ════════════════════════════════════════════════════ */}
      {tab === "mapping" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <div style={{
            background: "#FFF7ED",
            border: "1px solid #FED7AA",
            borderRadius: "10px", padding: "10px 16px",
            marginBottom: "6px", fontSize: "0.78rem", color: "#92400E",
            display: "flex", alignItems: "center", gap: "8px",
          }}>
            <Settings2 size={14} />
            Configure SCADA keys, RTG plant IDs, and schedules. Press Ctrl+V in editable cells to paste from Excel.
          </div>

          <SectionAccordion
            title="Plant Mapping Grid"
            subtitle="Configure SCADA/WBES mapping for generating plants"
            count={mapData.filter(r => !r.is_state).length}
            actions={
              <Box sx={{ width: 260 }}>
                <PremiumInput
                  placeholder="Search stations..."
                  value={stationSearch}
                  onChange={(e) => setStationSearch(e.target.value)}
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      background: "rgba(255,255,255,0.14)",
                      color: "#fff",
                    },
                    "& input": { color: "#fff", padding: "6px 10px" },
                  }}
                  InputProps={{
                    startAdornment: <Search size={12} style={{ marginRight: 4, color: "rgba(255,255,255,0.65)" }} />,
                  }}
                />
              </Box>
            }
          >
            <Box sx={{ p: 0.5 }}>
              <PlantMappingGrid
                data={mapData.filter(r => !r.is_state)}
                loading={mapLoading || saving}
                onSave={saveMapping}
                maxHeight="40vh"
                searchText={stationSearch}
              />
            </Box>
          </SectionAccordion>

          <SectionAccordion
            title="State & System Mapping Grid"
            subtitle="Configure state drawl and system frequency mapping"
            count={mapData.filter(r => r.is_state).length}
            actions={
              <Box sx={{ width: 260 }}>
                <PremiumInput
                  placeholder="Search states..."
                  value={stateSearch}
                  onChange={(e) => setStateSearch(e.target.value)}
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      background: "rgba(255,255,255,0.14)",
                      color: "#fff",
                    },
                    "& input": { color: "#fff", padding: "6px 10px" },
                  }}
                  InputProps={{
                    startAdornment: <Search size={12} style={{ marginRight: 4, color: "rgba(255,255,255,0.65)" }} />,
                  }}
                />
              </Box>
            }
          >
            <Box sx={{ p: 0.5 }}>
              <PlantMappingGrid
                data={mapData.filter(r => r.is_state)}
                loading={mapLoading || saving}
                onSave={saveMapping}
                maxHeight="30vh"
                searchText={stateSearch}
              />
            </Box>
          </SectionAccordion>
        </div>
      )}

      {/* Spacing spacer for easy scrolling to the bottom */}
      <div style={{ height: 80, flexShrink: 0 }} />

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @media print {
          .theme-glass-card { box-shadow: none !important; }
          button, input[type=datetime-local], textarea { display: none !important; }
        }
      `}</style>
    </AppShell>
  );
}
