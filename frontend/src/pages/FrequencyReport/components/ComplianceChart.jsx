import { useRef, useMemo, useImperativeHandle, forwardRef } from "react";
import ReactECharts from "echarts-for-react";

const COLORS = {
  state: {
    deviation: "#10B981",
    frequency: "#8B5CF6",
  },
  generator: {
    deviation: "#EF4444",
    frequency: "#2563EB",
  },
};

function fmtTick(ts) {
  if (!ts) return "";
  try {
    const [, time] = ts.split(" ");
    const [hh, mm] = time.split(":");
    return `${hh}:${mm}`;
  } catch {
    return ts;
  }
}

function fmtDate(ts) {
  if (!ts) return "";
  try {
    const [date] = ts.split(" ");
    const [y, m, d] = date.split("-");
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${d}-${months[Number(m) - 1]}-${y}`;
  } catch {
    return ts;
  }
}

function eventMeta(eventType, type) {
  const high = eventType === "high";
  if (high && type === "state") {
    return {
      threshold: 50.05,
      thresholdText: "50.05 Hz",
      badge: "HIGH FREQ",
      isEvent: (f) => f > 50.05,
      isHelping: (d) => d > 0,
      helping: { color: "rgba(234,179,8,0.30)", label: "Helping Grid (Gold Shade)" },
      adverse: { color: "rgba(6,182,212,0.30)", label: "Under Drawal (Cyan Shade)" },
    };
  }
  if (high) {
    return {
      threshold: 50.05,
      thresholdText: "50.05 Hz",
      badge: "HIGH FREQ",
      isEvent: (f) => f > 50.05,
      isHelping: (d) => d < 0,
      helping: { color: "rgba(16,185,129,0.30)", label: "Helping Grid (Green Shade)" },
      adverse: { color: "rgba(249,115,22,0.32)", label: "Over Injection (Orange Shade)" },
    };
  }
  return {
    threshold: 49.9,
    thresholdText: "49.90 Hz",
    badge: "LOW FREQ",
    isEvent: (f) => f < 49.9,
    isHelping: (d) => (type === "state" ? d < 0 : d > 0),
    helping: { color: "rgba(16,185,129,0.30)", label: "Helping Grid (Green Shade)" },
    adverse: {
      color: "rgba(249,115,22,0.32)",
      label: type === "state" ? "Over Drawal (Orange Shade)" : "Under Injection (Orange Shade)",
    },
  };
}

const toCleanNumbers = (values = []) =>
  values.map((v) => (v !== null && v !== undefined && !Number.isNaN(Number(v)) ? Number(v) : null));

const ComplianceChart = forwardRef(function ComplianceChart(
  { row, showSchAct = false, height = 480, compact = false },
  ref
) {
  const eRef = useRef(null);

  useImperativeHandle(ref, () => ({
    getDataURL: (opts = {}) => {
      const inst = eRef.current?.getEchartsInstance();
      if (!inst) return null;
      return inst.getDataURL({ type: "png", pixelRatio: 2, backgroundColor: "#FFFFFF", ...opts });
    },
  }));

  const type = row.type || (row.is_state ? "state" : "generator");
  const eventType = row.event_type || "low";
  const palette = COLORS[type] || COLORS.state;
  const meta = eventMeta(eventType, type);

  const series = row.series || {};
  const timestamps = series.timestamps || [];
  const cleanFreqs = useMemo(() => toCleanNumbers(series.frequency || []), [series.frequency]);
  const cleanDevs = useMemo(() => toCleanNumbers(series.deviation || []), [series.deviation]);
  const cleanScheds = useMemo(() => toCleanNumbers(series.schedule || []), [series.schedule]);
  const cleanActuals = useMemo(() => toCleanNumbers(series.actual || []), [series.actual]);

  const hasDeviation = useMemo(
    () => cleanDevs.length > 0 && cleanDevs.some((v) => v !== null),
    [cleanDevs]
  );

  const { helpingData, adverseData } = useMemo(() => {
    const helping = [];
    const adverse = [];
    if (!hasDeviation) return { helpingData: helping, adverseData: adverse };

    timestamps.forEach((_, i) => {
      const f = cleanFreqs[i];
      const d = cleanDevs[i];
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

    return { helpingData: helping, adverseData: adverse };
  }, [timestamps, cleanFreqs, cleanDevs, meta, hasDeviation]);

  const maxDevAbs = useMemo(() => {
    const values = hasDeviation
      ? cleanDevs.filter((v) => v !== null).map(Math.abs)
      : cleanActuals.filter((v) => v !== null).map(Math.abs);
    if (showSchAct) values.push(...cleanScheds.filter((v) => v !== null).map(Math.abs));
    const peak = Math.max(...values, 1);
    if (peak < 10) return Math.ceil(peak / 3) * 3;
    if (peak < 100) return Math.ceil(peak / 20) * 20;
    if (peak < 1000) return Math.ceil(peak / 100) * 100;
    return Math.ceil(peak / 500) * 500;
  }, [cleanDevs, cleanScheds, cleanActuals, showSchAct, hasDeviation]);

  const option = useMemo(() => {
    const dateMarkers = [];
    let lastDate = "";
    timestamps.forEach((ts, index) => {
      const datePart = String(ts || "").split(" ")[0];
      if (datePart && datePart !== lastDate) {
        dateMarkers.push({
          xAxis: ts,
          label: {
            show: true,
            formatter: fmtDate(ts),
            position: "insideEndTop",
            color: "#334155",
            fontSize: 10,
            fontWeight: 800,
            backgroundColor: "rgba(255,255,255,0.84)",
            padding: [2, 4],
          },
          lineStyle: { color: "#CBD5E1", type: "dashed", width: 1 },
        });
        lastDate = datePart;
      }
    });

    const chartSeries = [
      ...(hasDeviation ? [
        {
          name: meta.helping.label,
          type: "line",
          xAxisIndex: 0,
          yAxisIndex: 0,
          data: helpingData,
          symbol: "none",
          itemStyle: { color: meta.helping.color },
          lineStyle: { width: 0 },
          areaStyle: { color: meta.helping.color },
          emphasis: { disabled: true },
          z: 1,
        },
        {
          name: meta.adverse.label,
          type: "line",
          xAxisIndex: 0,
          yAxisIndex: 0,
          data: adverseData,
          symbol: "none",
          itemStyle: { color: meta.adverse.color },
          lineStyle: { width: 0 },
          areaStyle: { color: meta.adverse.color },
          emphasis: { disabled: true },
          z: 1,
        },
        {
          name: "Deviation (MW)",
          type: "line",
          xAxisIndex: 0,
          yAxisIndex: 0,
          data: cleanDevs,
          symbol: "none",
          itemStyle: { color: palette.deviation },
          lineStyle: { color: palette.deviation, width: 2.4 },
          markLine: {
            silent: true,
            symbol: "none",
            lineStyle: { color: "#94A3B8", type: "dashed", width: 1.5 },
            label: { formatter: "0 MW", position: "end", color: "#475569", fontSize: 9, fontWeight: "bold" },
            data: [{ yAxis: 0 }, ...dateMarkers],
          },
          z: 4,
        },
      ] : []),
      {
        name: "Frequency (Hz)",
        type: "line",
        xAxisIndex: 0,
        yAxisIndex: 1,
        data: cleanFreqs,
        symbol: "none",
        itemStyle: { color: palette.frequency },
        lineStyle: { color: palette.frequency, width: 2 },
        markLine: {
          silent: true,
          symbol: "none",
          lineStyle: { color: eventType === "high" ? "#DC2626" : "#F97316", type: "dashed", width: 1.2 },
          label: { formatter: meta.thresholdText, position: "insideEndTop", color: eventType === "high" ? "#B91C1C" : "#C2410C", fontSize: 9, fontWeight: "bold" },
          data: [{ yAxis: meta.threshold }],
        },
        z: 3,
      },
      {
        name: `Event Threshold (${meta.thresholdText})`,
        type: "line",
        xAxisIndex: 0,
        yAxisIndex: 1,
        data: timestamps.map(() => meta.threshold),
        symbol: "none",
        silent: true,
        itemStyle: { color: eventType === "high" ? "#DC2626" : "#F97316" },
        lineStyle: { color: eventType === "high" ? "#DC2626" : "#F97316", type: "dashed", width: 1.2 },
        tooltip: { show: false },
        z: 2,
      },
      ...(!hasDeviation || showSchAct ? [
        ...(cleanScheds.some((v) => v !== null) ? [{
          name: "Schedule (MW)",
          type: "line",
          xAxisIndex: 0,
          yAxisIndex: 0,
          data: cleanScheds,
          symbol: "none",
          itemStyle: { color: "#6366F1" },
          lineStyle: { color: "#6366F1", width: 1.5 },
          z: 2,
        }] : []),
        {
          name: "Actual (MW)",
          type: "line",
          xAxisIndex: 0,
          yAxisIndex: 0,
          data: cleanActuals,
          symbol: "none",
          itemStyle: { color: "#EC4899" },
          lineStyle: { color: "#EC4899", width: hasDeviation ? 1.5 : 2 },
          z: 2,
        },
      ] : []),
    ];

    const legendItems = [
      ...(hasDeviation ? [meta.helping.label, meta.adverse.label] : []),
      ...(hasDeviation ? ["Deviation (MW)"] : []),
      "Frequency (Hz)",
      `Event Threshold (${meta.thresholdText})`,
      ...(!hasDeviation || showSchAct ? [
        ...(cleanScheds.some((v) => v !== null) ? ["Schedule (MW)"] : []),
        "Actual (MW)"
      ] : [])
    ];

    return {
      backgroundColor: "#FFFFFF",
      animation: false,
      tooltip: {
        trigger: "axis",
        backgroundColor: "rgba(255,255,255,0.98)",
        borderColor: "#CBD5E1",
        borderWidth: 1,
        padding: [10, 14],
        textStyle: { color: "#1E293B", fontSize: 12 },
        formatter: (params) => {
          const ts = params[0]?.axisValue || "";
          const map = {};
          params.forEach((p) => { map[p.seriesName] = p.value; });
          const freq = map["Frequency (Hz)"];
          const dev = map["Deviation (MW)"];
          const inEvent = freq != null && meta.isEvent(freq);
          const badge = inEvent ? `<span style="background:${eventType === "high" ? "#DC2626" : "#F97316"};color:#fff;border-radius:3px;padding:1px 5px;font-size:10px;font-weight:800;margin-left:6px">${meta.badge}</span>` : "";
          let html = `<div style="border-bottom:1px solid #CBD5E1;padding-bottom:5px;margin-bottom:6px;font-size:11px;color:#64748B">${ts}${badge}</div>`;
          html += `<div style="display:flex;justify-content:space-between;gap:16px;margin-bottom:3px"><span style="color:#64748B">Frequency:</span><span style="font-weight:700;color:${palette.frequency}">${freq != null ? Number(freq).toFixed(3) : "-"} Hz</span></div>`;
          if (hasDeviation) {
            html += `<div style="display:flex;justify-content:space-between;gap:16px;margin-bottom:3px"><span style="color:#64748B">Deviation:</span><span style="font-weight:700;color:${dev >= 0 ? palette.deviation : "#EF4444"}">${dev != null ? (dev >= 0 ? "+" : "") + Number(dev).toFixed(0) : "-"} MW</span></div>`;
          }
          if (map["Schedule (MW)"] != null) html += `<div style="display:flex;justify-content:space-between;gap:16px;margin-bottom:3px"><span style="color:#64748B">Schedule:</span><span style="color:#6366F1;font-weight:600">${Number(map["Schedule (MW)"]).toFixed(0)} MW</span></div>`;
          if (map["Actual (MW)"] != null) html += `<div style="display:flex;justify-content:space-between;gap:16px"><span style="color:#64748B">Actual:</span><span style="color:#EC4899;font-weight:600">${Number(map["Actual (MW)"]).toFixed(0)} MW</span></div>`;
          if (hasDeviation && inEvent) {
            html += `<div style="margin-top:5px;padding-top:5px;border-top:1px solid #E2E8F0;font-size:10px;color:#475569;font-weight:600">${meta.isHelping(dev) ? meta.helping.label : meta.adverse.label}</div>`;
          }
          return html;
        },
      },
      legend: {
        show: true,
        type: "scroll",
        top: compact ? 4 : 6,
        left: 56,
        right: 48,
        textStyle: { color: "#475569", fontSize: compact ? 10 : 11, fontWeight: "600" },
        icon: "roundRect",
        itemWidth: compact ? 18 : 20,
        itemHeight: 8,
        pageIconSize: 10,
        pageTextStyle: { color: "#64748B", fontSize: 10 },
        selectedMode: true,
        data: legendItems,
      },
      toolbox: {
        show: true,
        top: 0,
        right: 6,
        itemSize: 15,
        feature: {
          saveAsImage: {
            title: "Download image",
            name: `${row.name || row.entity || row.state || "frequency_compliance"}_trend`,
            pixelRatio: 2,
            backgroundColor: "#FFFFFF",
          },
        },
      },
      grid: [
        { top: compact ? 42 : 48, right: 58, bottom: compact ? 52 : 74, left: 56, containLabel: false },
      ],
      dataZoom: [
        { type: "inside", xAxisIndex: 0, filterMode: "none" },
        {
          type: "slider",
          xAxisIndex: 0,
          height: compact ? 14 : 18,
          bottom: compact ? 14 : 20,
          textStyle: { color: "#64748B", fontSize: 9 },
          fillerColor: "rgba(3,98,76,0.08)",
          borderColor: "#CBD5E1",
          handleStyle: { color: "#03624C" },
          dataBackground: {
            lineStyle: { color: "#94A3B8" },
            areaStyle: { color: "rgba(148,163,184,0.18)" },
          },
        },
      ],
      xAxis: [
        { type: "category", gridIndex: 0, data: timestamps, boundaryGap: false, axisLabel: { formatter: fmtTick, color: "#64748B", fontSize: compact ? 9 : 10, rotate: 0, margin: compact ? 8 : 12, interval: Math.max(Math.floor(timestamps.length / 9) - 1, 0) }, axisLine: { lineStyle: { color: "#CBD5E1" } }, splitLine: { show: false } },
      ],
      yAxis: [
        { type: "value", gridIndex: 0, name: "MW", min: hasDeviation ? -maxDevAbs : 0, max: maxDevAbs, interval: hasDeviation ? maxDevAbs / 3 : maxDevAbs / 4, axisLabel: { color: "#475569", fontSize: compact ? 9 : 10, formatter: (v) => v.toFixed(0) }, splitLine: { lineStyle: { color: "#E2E8F0" } } },
        { type: "value", gridIndex: 0, name: "Hz", position: "right", min: 49.4, max: 50.6, interval: 0.2, axisLabel: { color: palette.frequency, fontSize: compact ? 9 : 10, formatter: (v) => v.toFixed(2) }, axisLine: { show: true, lineStyle: { color: palette.frequency } }, splitLine: { show: false } },
      ],
      series: chartSeries,
    };
  }, [timestamps, cleanDevs, cleanFreqs, cleanScheds, cleanActuals, showSchAct, compact, palette, meta, maxDevAbs, helpingData, adverseData, eventType, hasDeviation, row]);

  return (
    <ReactECharts
      ref={eRef}
      option={option}
      style={{ height, width: "100%" }}
      opts={{ renderer: "canvas" }}
      notMerge
    />
  );
});

export default ComplianceChart;
