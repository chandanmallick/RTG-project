import { useImperativeHandle, useMemo, useRef, forwardRef } from "react";
import ReactECharts from "echarts-for-react";

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

const clean = (values = []) =>
  values.map((v) => (v !== null && v !== undefined && !Number.isNaN(Number(v)) ? Number(v) : null));

const CapacityFrequencyChart = forwardRef(function CapacityFrequencyChart({ row, height = 360, compact = false }, ref) {
  const eRef = useRef(null);
  useImperativeHandle(ref, () => ({
    getDataURL: (opts = {}) => {
      const inst = eRef.current?.getEchartsInstance();
      if (!inst) return null;
      return inst.getDataURL({ type: "png", pixelRatio: 2, backgroundColor: "#FFFFFF", ...opts });
    },
  }));

  const timestamps = row.series?.timestamps || [];
  const actuals = useMemo(() => clean(row.series?.actual || []), [row.series?.actual]);
  const schedules = useMemo(() => clean(row.series?.schedule || []), [row.series?.schedule]);
  const freqs = useMemo(() => clean(row.series?.frequency || []), [row.series?.frequency]);
  const capOnBar = Number(row.cap_on_bar || 0);
  const cap55 = Number(row.cap_on_bar_55 || (capOnBar ? capOnBar * 0.55 : 0));
  const hasSchedule = schedules.some((v) => v !== null && Number.isFinite(Number(v)));
  const isLowFrequency = (row.event_type || "low") !== "high";
  const modeLabel = isLowFrequency ? "Low Frequency" : "High Frequency";
  const threshold = isLowFrequency ? 49.9 : 50.05;
  const thresholdText = isLowFrequency ? "49.90 Hz" : "50.05 Hz";
  const maxMw = Math.max(
    ...actuals.filter((v) => v !== null),
    ...schedules.filter((v) => v !== null),
    capOnBar,
    cap55,
    1
  );
  const yMax = maxMw < 1000 ? Math.ceil(maxMw / 100) * 100 : Math.ceil(maxMw / 500) * 500;

  const option = useMemo(() => {
    const series = [
      {
        name: "Actual Generation (MW)",
        type: "line",
        data: actuals,
        symbol: "none",
        itemStyle: { color: "#047857" },
        lineStyle: { color: "#047857", width: compact ? 3.2 : 3.6 },
        areaStyle: { color: "rgba(4,120,87,0.14)" },
        yAxisIndex: 0,
        z: 4,
      },
      ...(hasSchedule ? [{
        name: "Schedule (MW)",
        type: "line",
        data: schedules,
        symbol: "none",
        itemStyle: { color: "#4F46E5" },
        lineStyle: { color: "#4F46E5", width: compact ? 2.8 : 3.2, type: "dashed" },
        yAxisIndex: 0,
        z: 3,
      }] : []),
      {
        name: "Capacity on Bar (MW)",
        type: "line",
        data: timestamps.map(() => capOnBar || null),
        symbol: "none",
        itemStyle: { color: "#0F172A" },
        lineStyle: { color: "#0F172A", width: compact ? 2.3 : 2.6, type: "dotted" },
        yAxisIndex: 0,
        z: 2,
      },
      {
        name: "55% Cap On Bar",
        type: "line",
        data: timestamps.map(() => cap55 || null),
        symbol: "none",
        itemStyle: { color: "#F97316" },
        lineStyle: { color: "#F97316", width: isLowFrequency ? 2.8 : 3.2, type: "dashed" },
        yAxisIndex: 0,
        markLine: {
          silent: true,
          symbol: "none",
          lineStyle: { color: "#F59E0B", width: isLowFrequency ? 1.6 : 2.2, type: "dashed" },
          label: {
            formatter: "55% of Cap on Bar",
            color: "#B45309",
            fontWeight: 800,
            backgroundColor: "rgba(255,247,237,0.92)",
            padding: [2, 5],
          },
          data: cap55 ? [{ yAxis: cap55 }] : [],
        },
        z: 2,
      },
      {
        name: "Frequency (Hz)",
        type: "line",
        data: freqs,
        symbol: "none",
        itemStyle: { color: "#1D4ED8" },
        lineStyle: { color: "#1D4ED8", width: compact ? 2.6 : 3 },
        yAxisIndex: 1,
        z: 5,
      },
      {
        name: `Event Threshold (${thresholdText})`,
        type: "line",
        data: timestamps.map(() => threshold),
        symbol: "none",
        silent: true,
        itemStyle: { color: isLowFrequency ? "#F97316" : "#DC2626" },
        lineStyle: { color: isLowFrequency ? "#F97316" : "#DC2626", width: 1.2, type: "dashed" },
        yAxisIndex: 1,
        tooltip: { show: false },
        z: 4,
      },
    ];

    return ({
    backgroundColor: "#FFFFFF",
    textStyle: { fontFamily: "Inter, sans-serif", fontWeight: 700 },
    animation: false,
    title: {
      text: `${row.plant_name}: ${modeLabel} Generation vs Capacity on Bar`,
      left: 10,
      top: compact ? 2 : 6,
      textStyle: { fontSize: compact ? 13 : 15, fontWeight: 900, color: "#0F172A" },
    },
    tooltip: {
      trigger: "axis",
      backgroundColor: "rgba(255,255,255,0.98)",
      borderColor: "#CBD5E1",
      borderWidth: 1,
      textStyle: { color: "#0F172A", fontSize: 13, fontWeight: 700 },
    },
    legend: {
      type: "scroll",
      top: compact ? 24 : 30,
      left: 12,
      right: 12,
      textStyle: { color: "#1F2937", fontSize: compact ? 11 : 12, fontWeight: 800 },
      icon: "roundRect",
      itemWidth: compact ? 18 : 20,
      itemHeight: 8,
      pageIconSize: 10,
      pageTextStyle: { color: "#64748B", fontSize: 10 },
      data: series.map((item) => item.name),
    },
    grid: { top: compact ? 70 : 84, right: 60, bottom: compact ? 50 : 72, left: 64 },
    dataZoom: [
      { type: "inside", filterMode: "none" },
      { type: "slider", height: compact ? 13 : 16, bottom: compact ? 12 : 24, textStyle: { color: "#64748B", fontSize: 9 }, fillerColor: "rgba(37,99,235,0.08)", borderColor: "#CBD5E1" },
    ],
    xAxis: {
      type: "category",
      data: timestamps,
      boundaryGap: false,
      axisLabel: { formatter: fmtTick, color: "#334155", fontSize: compact ? 10 : 11, fontWeight: 700, rotate: 0, interval: Math.max(Math.floor(timestamps.length / 9) - 1, 0) },
      axisLine: { lineStyle: { color: "#94A3B8", width: 1.4 } },
    },
    yAxis: [
      {
        type: "value",
        name: "MW",
        min: 0,
        max: yMax,
        nameTextStyle: { color: "#0F172A", fontWeight: 900, fontSize: compact ? 11 : 12 },
        axisLabel: { color: "#334155", fontSize: compact ? 10 : 11, fontWeight: 700, formatter: (v) => v.toFixed(0) },
        splitLine: { lineStyle: { color: "#D7E1EA", width: 1.1 } },
      },
      {
        type: "value",
        name: "Hz",
        min: 49.4,
        max: 50.6,
        interval: 0.4,
        nameTextStyle: { color: "#1D4ED8", fontWeight: 900, fontSize: compact ? 11 : 12 },
        axisLabel: { color: "#1D4ED8", fontSize: compact ? 10 : 11, fontWeight: 800, formatter: (v) => v.toFixed(2) },
        axisLine: { show: true, lineStyle: { color: "#1D4ED8", width: 1.6 } },
        splitLine: { show: false },
      },
    ],
    series,
  });
  }, [actuals, cap55, capOnBar, freqs, hasSchedule, isLowFrequency, compact, modeLabel, row.plant_name, schedules, threshold, thresholdText, timestamps, yMax]);

  return <ReactECharts ref={eRef} option={option} style={{ height, width: "100%" }} opts={{ renderer: "canvas" }} notMerge />;
});

export default CapacityFrequencyChart;
