import { useImperativeHandle, useMemo, useRef, forwardRef } from "react";
import ReactECharts from "echarts-for-react";
import { Download } from "lucide-react";

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

const downloadUrl = (url, filename) => {
  if (!url) return;
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
};

const safeFileName = (value) =>
  String(value || "chart").replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "") || "chart";

const CapacityFrequencyChart = forwardRef(function CapacityFrequencyChart(
  { row, height = 360, compact = false, fontSize = 12, showDownloadButton = false, downloadFilename },
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

  const timestamps = row.series?.timestamps || [];
  const actuals = useMemo(() => clean(row.series?.actual || []), [row.series?.actual]);
  const schedules = useMemo(() => clean(row.series?.schedule || []), [row.series?.schedule]);
  const isState = row.type === "state" || row.is_state;
  const capOnBar = Number(row.cap_on_bar || 0);
  const hasSchedule = schedules.some((v) => v !== null && Number.isFinite(Number(v)));
  const isLowFrequency = (row.event_type || "low") !== "high";
  const highFreqReference = capOnBar * 0.94;
  const modeLabel = isLowFrequency ? "Low Frequency" : "High Frequency";
  const minActual = useMemo(() => {
    const nums = actuals.filter((v) => v !== null && Number.isFinite(Number(v)));
    return nums.length ? Math.min(...nums) : null;
  }, [actuals]);
  const minGenerationPct = !isLowFrequency && minActual !== null && highFreqReference > 0 ? (minActual / highFreqReference) * 100 : null;
  const hasMinGenerationNote = !isState && !isLowFrequency && minActual !== null;
  const minGenerationSubtext = hasMinGenerationNote
    ? `Min Gen: ${minActual.toFixed(0)} MW | 94% Cap on Bar: ${highFreqReference ? highFreqReference.toFixed(0) : "-"} MW | Min Gen %: ${minGenerationPct !== null ? minGenerationPct.toFixed(1) : "-"}%`
    : "";
  const maxMw = Math.max(
    ...actuals.filter((v) => v !== null),
    ...schedules.filter((v) => v !== null),
    !isLowFrequency ? 0 : capOnBar,
    hasMinGenerationNote ? highFreqReference : 0,
    1
  );
  const yMax = maxMw < 1000 ? Math.ceil(maxMw / 100) * 100 : Math.ceil(maxMw / 500) * 500;

  const option = useMemo(() => {
    const baseFont = Math.max(8, Number(fontSize) || 12);
    const titleFont = baseFont + (compact ? 2 : 3);
    const smallFont = Math.max(8, baseFont - 2);
    const titleTop = compact ? 8 : 10;
    const legendTop = titleTop + titleFont + (hasMinGenerationNote ? (smallFont * 1.35 + 18) : 16);
    const legendHeight = baseFont + 18;
    const gridTop = legendTop + legendHeight + 18;
    const gridBottom = compact ? Math.max(70, baseFont * 3.6) : Math.max(90, baseFont * 4.2);
    const zoomHeight = compact ? Math.max(16, baseFont) : Math.max(20, baseFont + 2);
    const series = [
      {
        name: isState ? "Actual Drawal (MW)" : "Actual Generation (MW)",
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
      ...(!isState && isLowFrequency ? [{
        name: "Capacity on Bar (MW)",
        type: "line",
        data: timestamps.map(() => capOnBar || null),
        symbol: "none",
        itemStyle: { color: "#0F172A" },
        lineStyle: { color: "#0F172A", width: compact ? 2.3 : 2.6, type: "dotted" },
        yAxisIndex: 0,
        z: 2,
      }] : []),
    ];

    return ({
    backgroundColor: "#FFFFFF",
    textStyle: { fontFamily: "Inter, sans-serif", fontWeight: 700 },
    animation: false,
    title: {
      text: `${row.plant_name}: ${modeLabel} ${isState ? "Drawal vs Schedule" : isLowFrequency ? "Generation vs Capacity on Bar" : "Generation vs Schedule"}`,
      subtext: minGenerationSubtext,
      left: 10,
      top: titleTop,
      textStyle: { fontSize: titleFont, fontWeight: 900, color: "#0F172A" },
      subtextStyle: { fontSize: smallFont, fontWeight: 800, color: "#B45309", lineHeight: smallFont + 5 },
    },
    tooltip: {
      trigger: "axis",
      backgroundColor: "rgba(255,255,255,0.98)",
      borderColor: "#CBD5E1",
      borderWidth: 1,
      textStyle: { color: "#0F172A", fontSize: baseFont, fontWeight: 700 },
    },
    legend: {
      type: "scroll",
      top: legendTop,
      left: 12,
      right: 12,
      textStyle: { color: "#1F2937", fontSize: baseFont, fontWeight: 800 },
      icon: "roundRect",
      itemWidth: Math.max(compact ? 18 : 20, baseFont + 2),
      itemHeight: Math.max(8, baseFont - 6),
      pageIconSize: Math.max(10, smallFont),
      pageTextStyle: { color: "#64748B", fontSize: smallFont },
      data: series.map((item) => item.name),
    },
    grid: { top: gridTop, right: Math.max(34, baseFont * 2.1), bottom: gridBottom, left: Math.max(68, baseFont * 3.8) },
    dataZoom: [
      { type: "inside", filterMode: "none" },
      { type: "slider", height: zoomHeight, bottom: compact ? 18 : 24, textStyle: { color: "#64748B", fontSize: smallFont }, fillerColor: "rgba(37,99,235,0.08)", borderColor: "#CBD5E1" },
    ],
    xAxis: {
      type: "category",
      data: timestamps,
      boundaryGap: false,
      axisLabel: { formatter: fmtTick, color: "#334155", fontSize: smallFont, fontWeight: 700, rotate: 0, margin: compact ? 12 : 16, interval: Math.max(Math.floor(timestamps.length / 8) - 1, 0) },
      axisLine: { lineStyle: { color: "#94A3B8", width: 1.4 } },
    },
    yAxis: {
      type: "value",
      name: "MW",
      min: 0,
      max: yMax,
      nameTextStyle: { color: "#0F172A", fontWeight: 900, fontSize: baseFont, padding: [0, 0, 6, 0] },
      axisLabel: { color: "#334155", fontSize: smallFont, fontWeight: 700, formatter: (v) => v.toFixed(0), margin: 10 },
      splitLine: { lineStyle: { color: "#D7E1EA", width: 1.1 } },
    },
    series,
  });
  }, [actuals, capOnBar, hasMinGenerationNote, hasSchedule, isLowFrequency, compact, minGenerationSubtext, modeLabel, row.plant_name, schedules, timestamps, yMax, isState, fontSize]);

  const handleDownload = (event) => {
    event?.stopPropagation();
    const inst = eRef.current?.getEchartsInstance();
    const url = inst?.getDataURL({ type: "png", pixelRatio: 2, backgroundColor: "#FFFFFF" });
    downloadUrl(url, `${safeFileName(downloadFilename || `${row.plant_name || row.name || "schedule_actual"}_schedule_actual`)}.png`);
  };

  return (
    <div style={{ position: "relative" }}>
      {showDownloadButton && (
        <button
          type="button"
          onClick={handleDownload}
          title="Download chart"
          style={{
            position: "absolute",
            top: 6,
            right: 8,
            zIndex: 5,
            width: 30,
            height: 30,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            border: "1px solid #BFD3F8",
            borderRadius: 6,
            background: "#FFFFFF",
            color: "#0B55B8",
            cursor: "pointer",
            boxShadow: "0 4px 12px rgba(15,111,219,0.12)",
          }}
        >
          <Download size={15} />
        </button>
      )}
      <ReactECharts ref={eRef} option={option} style={{ height, width: "100%" }} opts={{ renderer: "canvas" }} notMerge />
    </div>
  );
});

export default CapacityFrequencyChart;
