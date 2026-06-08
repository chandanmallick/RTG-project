/**
 * ComplianceChart.jsx
 * Apache ECharts dual-axis chart:
 *   Left axis  : Deviation (MW)
 *   Right axis : Frequency (Hz)
 * markArea shading for LF compliance events.
 */
import { useRef, useMemo, useCallback, forwardRef, useImperativeHandle } from "react";
import ReactECharts from "echarts-for-react";

/* ── Color palette ─────────────────────────────────────── */
const COLORS = {
  state: {
    deviation: "#00DF81",
    frequency: "#A855F7",
    overDrawal:  { color: "rgba(234,179,8,0.28)",   label: "Over Drawal (OD)" },
    helpingGrid: { color: "rgba(6,182,212,0.22)",   label: "Helping Grid" },
  },
  generator: {
    deviation: "#EF4444",
    frequency: "#3B82F6",
    underInj:    { color: "rgba(249,115,22,0.28)",  label: "Under Injection" },
    helpingGrid: { color: "rgba(16,185,129,0.22)",  label: "Helping Grid" },
  },
};

/* ── Build markArea data from series ────────────────────── */
function buildMarkAreas(timestamps, freqs, devs, type) {
  if (!timestamps?.length) return { primary: [], secondary: [] };

  const primary   = [];  // gold / orange
  const secondary = [];  // cyan / green
  let primaryStart = null;
  let secStart = null;

  for (let i = 0; i < timestamps.length; i++) {
    const isLF    = freqs[i] < 49.9;
    const dev     = devs[i];
    const isPrimary   = isLF && (type === "state" ? dev > 0 : dev < 0);
    const isSecondary = isLF && (type === "state" ? dev < 0 : dev > 0);

    if (isPrimary) {
      if (primaryStart === null) primaryStart = i;
    } else {
      if (primaryStart !== null) {
        primary.push([{ xAxis: timestamps[primaryStart] }, { xAxis: timestamps[i - 1] }]);
        primaryStart = null;
      }
    }
    if (isSecondary) {
      if (secStart === null) secStart = i;
    } else {
      if (secStart !== null) {
        secondary.push([{ xAxis: timestamps[secStart] }, { xAxis: timestamps[i - 1] }]);
        secStart = null;
      }
    }
  }
  if (primaryStart !== null)
    primary.push([{ xAxis: timestamps[primaryStart] }, { xAxis: timestamps[timestamps.length - 1] }]);
  if (secStart !== null)
    secondary.push([{ xAxis: timestamps[secStart] }, { xAxis: timestamps[timestamps.length - 1] }]);

  return { primary, secondary };
}

/* ── Format x-axis tick ─────────────────────────────────── */
function fmtTick(ts) {
  if (!ts) return "";
  try {
    // Input: "2026-06-02 21:30:00"  →  "02/06 21:30"
    const [date, time] = ts.split(" ");
    const [y, m, d] = date.split("-");
    const [hh, mm] = time.split(":");
    return `${d}/${m} ${hh}:${mm}`;
  } catch { return ts; }
}

/* ──────────────────────────────────────────────────────────
   ComplianceChart — forwardRef so parent can call getDataURL
   ────────────────────────────────────────────────────────── */
const ComplianceChart = forwardRef(function ComplianceChart(
  { row, showSchAct = false, height = 300 },
  ref
) {
  const eRef = useRef(null);

  /* Expose getDataURL to parent for Word export */
  useImperativeHandle(ref, () => ({
    getDataURL: (opts = {}) => {
      const inst = eRef.current?.getEchartsInstance();
      if (!inst) return null;
      return inst.getDataURL({ type: "png", pixelRatio: 2, backgroundColor: "#0F172A", ...opts });
    },
  }));

  const type    = row.type || (row.is_state ? "state" : "generator");
  const palette = COLORS[type] || COLORS.state;

  const series  = row.series || {};
  const timestamps = series.timestamps || [];
  const freqs   = series.frequency  || [];
  const devs    = series.deviation  || [];
  const scheds  = series.schedule   || [];
  const actuals = series.actual     || [];

  /* ── markArea zones ─────────────────────────────────────── */
  const { primary, secondary } = useMemo(
    () => buildMarkAreas(timestamps, freqs, devs, type),
    [timestamps, freqs, devs, type]
  );

  /* ── Auto Y-axis range ──────────────────────────────────── */
  const maxDevAbs = useMemo(() => {
    const vals = [...devs.map(Math.abs)];
    if (showSchAct) {
      vals.push(...scheds.map(Math.abs), ...actuals.map(Math.abs));
    }
    const peak = Math.max(...vals, 1);
    if (peak < 10)       return Math.ceil(peak / 3)   * 3;
    if (peak < 100)      return Math.ceil(peak / 20)  * 20;
    if (peak < 1000)     return Math.ceil(peak / 100) * 100;
    return Math.ceil(peak / 500) * 500;
  }, [devs, scheds, actuals, showSchAct]);

  /* ── Color helpers ──────────────────────────────────────── */
  const colorPrimary   = type === "state" ? palette.overDrawal   : palette.underInj;
  const colorSecondary = type === "state" ? palette.helpingGrid  : palette.helpingGrid;

  /* ── ECharts option ─────────────────────────────────────── */
  const option = useMemo(() => ({
    backgroundColor: "#0F172A",
    animation: false,
    tooltip: {
      trigger: "axis",
      backgroundColor: "rgba(15,23,42,0.97)",
      borderColor: "rgba(100,116,139,0.35)",
      borderWidth: 1,
      padding: [10, 14],
      textStyle: { color: "#E2E8F0", fontSize: 12 },
      formatter: (params) => {
        const ts = params[0]?.axisValue || "";
        const map = {};
        params.forEach((p) => { map[p.seriesName] = p.value; });
        const freq  = map["Frequency (Hz)"];
        const dev   = map["Deviation (MW)"];
        const isLF  = freq != null && freq < 49.9;
        const badge = isLF ? `<span style="background:#EF4444;color:#fff;border-radius:3px;padding:1px 5px;font-size:10px;font-weight:800;margin-left:6px">LOW FREQ</span>` : "";
        let html = `<div style="border-bottom:1px solid rgba(100,116,139,0.3);padding-bottom:5px;margin-bottom:6px;font-size:11px;color:#94A3B8">${ts}${badge}</div>`;
        html += `<div style="display:flex;justify-content:space-between;gap:16px;margin-bottom:3px"><span style="color:#94A3B8">Frequency:</span><span style="font-weight:700;color:${palette.frequency}">${freq != null ? freq.toFixed(3) : "—"} Hz</span></div>`;
        html += `<div style="display:flex;justify-content:space-between;gap:16px;margin-bottom:3px"><span style="color:#94A3B8">Deviation:</span><span style="font-weight:700;color:${dev >= 0 ? palette.deviation : "#EF4444"}">${dev != null ? (dev >= 0 ? "+" : "") + dev.toFixed(1) : "—"} MW</span></div>`;
        if (map["Schedule (MW)"] != null)
          html += `<div style="display:flex;justify-content:space-between;gap:16px;margin-bottom:3px"><span style="color:#94A3B8">Schedule:</span><span style="color:#6366F1">${map["Schedule (MW)"].toFixed(1)} MW</span></div>`;
        if (map["Actual (MW)"] != null)
          html += `<div style="display:flex;justify-content:space-between;gap:16px"><span style="color:#94A3B8">Actual:</span><span style="color:#EC4899">${map["Actual (MW)"].toFixed(1)} MW</span></div>`;
        if (isLF) {
          const label = type === "state"
            ? (dev > 0 ? "🟡 Over Drawal" : "🔵 Helping Grid")
            : (dev < 0 ? "🟠 Under Injection" : "🟢 Helping Grid");
          html += `<div style="margin-top:5px;padding-top:5px;border-top:1px solid rgba(100,116,139,0.3);font-size:10px;color:#94A3B8">${label} during low freq</div>`;
        }
        return html;
      },
    },
    legend: {
      show: true,
      bottom: 4,
      textStyle: { color: "#64748B", fontSize: 11 },
      icon: "roundRect",
      itemWidth: 16,
      itemHeight: 4,
    },
    grid: { top: 12, right: 56, bottom: 48, left: 60, containLabel: false },
    dataZoom: [
      { type: "inside", xAxisIndex: 0, filterMode: "none" },
      { type: "slider", xAxisIndex: 0, height: 18, bottom: 28, textStyle: { color: "#64748B", fontSize: 9 }, fillerColor: "rgba(52,211,153,0.1)", borderColor: "#334155", handleStyle: { color: "#34D399" } },
    ],
    xAxis: {
      type: "category",
      data: timestamps,
      boundaryGap: false,
      axisLabel: {
        formatter: fmtTick,
        color: "#64748B",
        fontSize: 10,
        rotate: 25,
        interval: Math.max(Math.floor(timestamps.length / 12) - 1, 0),
      },
      axisLine: { lineStyle: { color: "#334155" } },
      splitLine: { show: false },
    },
    yAxis: [
      {
        // Left: Deviation (MW)
        type: "value",
        name: "MW",
        nameTextStyle: { color: "#475569", fontSize: 10, padding: [0, 0, 0, -8] },
        min: -maxDevAbs,
        max:  maxDevAbs,
        interval: maxDevAbs / 3,
        axisLabel: { color: "#64748B", fontSize: 10 },
        axisLine: { lineStyle: { color: "#334155" } },
        splitLine: { lineStyle: { color: "rgba(100,116,139,0.1)", type: "dashed" } },
        // Zero line
        markLine: undefined,
      },
      {
        // Right: Frequency (Hz)
        type: "value",
        name: "Hz",
        nameTextStyle: { color: "#475569", fontSize: 10, padding: [0, -8, 0, 0] },
        min: 49.0,
        max: 51.0,
        interval: 0.25,
        axisLabel: { color: "#94A3B8", fontSize: 10, formatter: (v) => v.toFixed(2) },
        axisLine: { lineStyle: { color: "#334155" } },
        splitLine: { show: false },
      },
    ],
    series: [
      // ── markArea shading (attached to deviation series for correct y-axis) ──
      {
        name: colorPrimary.label,
        type: "line",
        yAxisIndex: 0,
        data: [],
        markArea: {
          silent: true,
          itemStyle: { color: colorPrimary.color },
          data: primary.map(([s, e]) => [s, e]),
        },
        legendHoverLink: false,
        symbol: "none",
        lineStyle: { width: 0 },
      },
      {
        name: colorSecondary.label,
        type: "line",
        yAxisIndex: 0,
        data: [],
        markArea: {
          silent: true,
          itemStyle: { color: colorSecondary.color },
          data: secondary.map(([s, e]) => [s, e]),
        },
        legendHoverLink: false,
        symbol: "none",
        lineStyle: { width: 0 },
      },

      // ── Deviation line ───────────────────────────────────────
      {
        name: "Deviation (MW)",
        type: "line",
        yAxisIndex: 0,
        data: devs,
        symbol: "none",
        lineStyle: { color: palette.deviation, width: 2 },
        areaStyle: { color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: palette.deviation + "40" }, { offset: 1, color: palette.deviation + "00" }] } },
        markLine: {
          silent: true,
          symbol: "none",
          lineStyle: { color: "#475569", type: "dashed", width: 1.5 },
          label: { formatter: "0 MW", position: "end", color: "#475569", fontSize: 9 },
          data: [{ yAxis: 0 }],
        },
        emphasis: { disabled: true },
        z: 4,
      },

      // ── Frequency line ───────────────────────────────────────
      {
        name: "Frequency (Hz)",
        type: "line",
        yAxisIndex: 1,
        data: freqs,
        symbol: "none",
        lineStyle: { color: palette.frequency, width: 1.5, type: "dashed" },
        markLine: {
          silent: true,
          symbol: "none",
          lineStyle: { color: "#7C3AED", type: "solid", width: 1, opacity: 0.5 },
          label: { formatter: "50 Hz", position: "end", color: "#7C3AED", fontSize: 9 },
          data: [{ yAxis: 50.0 }],
        },
        emphasis: { disabled: true },
        z: 3,
      },

      // ── Schedule (on-demand) ─────────────────────────────────
      ...(showSchAct ? [
        {
          name: "Schedule (MW)",
          type: "line",
          yAxisIndex: 0,
          data: scheds,
          symbol: "none",
          lineStyle: { color: "#6366F1", width: 1.5 },
          emphasis: { disabled: true },
          z: 2,
        },
        {
          name: "Actual (MW)",
          type: "line",
          yAxisIndex: 0,
          data: actuals,
          symbol: "none",
          lineStyle: { color: "#EC4899", width: 1.5 },
          emphasis: { disabled: true },
          z: 2,
        },
      ] : []),
    ],
  }), [timestamps, devs, freqs, scheds, actuals, showSchAct, palette, maxDevAbs, primary, secondary, type]);

  return (
    <ReactECharts
      ref={eRef}
      option={option}
      style={{ height, width: "100%" }}
      opts={{ renderer: "canvas" }}
      notMerge={true}
    />
  );
});

export default ComplianceChart;
