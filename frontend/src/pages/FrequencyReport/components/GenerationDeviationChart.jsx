import React, { forwardRef, useMemo, useState } from "react";
import ReactECharts from "echarts-for-react";

const numbers = (values = []) => values.map((value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
});

const axisExtent = (values) => {
  const peak = Math.max(10, ...values.filter((value) => value !== null).map((value) => Math.abs(value)));
  const step = peak < 100 ? 20 : peak < 1000 ? 100 : 500;
  return Math.ceil(peak / step) * step;
};

const GenerationDeviationChart = forwardRef(function GenerationDeviationChart({ row, height = 420, fontSize = 12 }, ref) {
  const [secondaryGeneration, setSecondaryGeneration] = useState([]);
  const option = useMemo(() => {
    const timestamps = row?.series?.timestamps || [];
    const deviation = numbers(row?.series?.deviation || []);
    const configuredCategories = Object.entries(row?.series?.generation_categories || {})
      .map(([label, values]) => [label, numbers(values)])
      .filter(([, values]) => values.some((value) => value !== null));
    const generationCategories = configuredCategories.length
      ? configuredCategories
      : [["Purulia PSP Net (G + P)", numbers(row?.series?.purulia_psp_net || [])]];
    const primaryGeneration = generationCategories.filter(([label]) => !secondaryGeneration.includes(label));
    const secondaryGenerationValues = generationCategories
      .filter(([label]) => secondaryGeneration.includes(label))
      .flatMap(([, values]) => values);
    const deviationExtent = axisExtent([...deviation, ...secondaryGenerationValues]);
    const generationExtent = axisExtent(primaryGeneration.flatMap(([, values]) => values));
    const baseFont = Math.max(10, Number(fontSize) || 12);
    const generationColors = ["#0284C7", "#F59E0B", "#7C3AED", "#DB2777", "#475569", "#0EA5E9", "#84CC16"];
    const frequency = numbers(row?.series?.frequency || []);
    const highFrequency = row?.event_type === "high";
    const inEvent = (value) => value !== null && (highFrequency ? value > 50.05 : value < 49.9);
    const positiveShade = deviation.map((value, index) => inEvent(frequency[index]) && value !== null && value > 0 ? value : 0);
    const negativeShade = deviation.map((value, index) => inEvent(frequency[index]) && value !== null && value < 0 ? value : 0);
    const positiveLabel = highFrequency ? "Helping Grid (+Ve deviation)" : "Over Drawal (Gold Shade)";
    const negativeLabel = highFrequency ? "Under Drawal (-Ve deviation)" : "Helping Grid (Cyan Shade)";

    return {
      animation: false,
      backgroundColor: "#FFFFFF",
      title: {
        text: `${row?.plant_name || row?.name || row?.state || "State"} Deviation vs State Generation`,
        subtext: "Configured Thermal, Hydro, Renewable, Others, Total and Purulia PSP Net generation",
        left: 10,
        top: 8,
        textStyle: { color: "#0F172A", fontSize: baseFont + 3, fontWeight: 900 },
        subtextStyle: { color: "#64748B", fontSize: Math.max(9, baseFont - 2), fontWeight: 700 },
      },
      legend: { top: 62, type: "scroll", textStyle: { color: "#334155", fontSize: baseFont, fontWeight: 800 } },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "cross" },
        valueFormatter: (value) => value == null ? "-" : `${Number(value).toFixed(1)} MW`,
      },
      toolbox: { right: 8, top: 8, feature: { saveAsImage: { title: "Download image", pixelRatio: 2 } } },
      grid: { left: 72, right: 82, top: 104, bottom: 76 },
      dataZoom: [{ type: "inside" }, { type: "slider", height: 20, bottom: 20 }],
      xAxis: {
        type: "category",
        boundaryGap: false,
        data: timestamps,
        axisLabel: {
          color: "#475569",
          fontSize: Math.max(9, baseFont - 2),
          interval: Math.max(Math.floor(timestamps.length / 8) - 1, 0),
          formatter: (value) => String(value || "").replace("T", " ").slice(5, 16),
        },
      },
      yAxis: [
        {
          type: "value", name: "Generation (MW)", min: -generationExtent, max: generationExtent,
          axisLabel: { color: "#0369A1", fontWeight: 700 }, nameTextStyle: { color: "#0369A1", fontWeight: 900 },
          splitLine: { lineStyle: { color: "#E2E8F0" } },
        },
        {
          type: "value", name: "Deviation / selected generation (MW)", min: -deviationExtent, max: deviationExtent, position: "right",
          axisLabel: { color: "#047857", fontWeight: 700 }, nameTextStyle: { color: "#047857", fontWeight: 900 },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: positiveLabel, type: "line", data: positiveShade, yAxisIndex: 1, symbol: "none",
          lineStyle: { width: 0 }, itemStyle: { color: "rgba(234,179,8,0.30)" },
          areaStyle: { color: "rgba(234,179,8,0.30)", origin: 0 }, emphasis: { disabled: true }, z: 1,
        },
        {
          name: negativeLabel, type: "line", data: negativeShade, yAxisIndex: 1, symbol: "none",
          lineStyle: { width: 0 }, itemStyle: { color: "rgba(6,182,212,0.30)" },
          areaStyle: { color: "rgba(6,182,212,0.30)", origin: 0 }, emphasis: { disabled: true }, z: 1,
        },
        {
          name: `${row?.plant_name || row?.name || row?.state || "State"} Deviation`, type: "line", data: deviation, yAxisIndex: 1, symbol: "none",
          lineStyle: { color: "#059669", width: 3 }, itemStyle: { color: "#059669" },
          markLine: { silent: true, symbol: "none", data: [{ yAxis: 0 }], lineStyle: { color: "#94A3B8", type: "dashed" }, label: { formatter: "0 MW" } },
        },
        ...generationCategories.map(([label, values], index) => ({
          name: label, type: "line", data: values, yAxisIndex: secondaryGeneration.includes(label) ? 1 : 0, symbol: "none", connectNulls: false,
          lineStyle: { color: generationColors[index % generationColors.length], width: label.includes("Total") ? 3.3 : 2.5 },
          itemStyle: { color: generationColors[index % generationColors.length] },
        })),
      ],
    };
  }, [fontSize, row, secondaryGeneration]);

  const generationLabels = Object.entries(row?.series?.generation_categories || {})
    .filter(([, values]) => numbers(values).some((value) => value !== null))
    .map(([label]) => label);

  return (
    <div>
      {generationLabels.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6, padding: "6px 10px 0", fontSize: 11, color: "#475569" }}>
          <strong style={{ color: "#0F172A" }}>Generation axis:</strong>
          {generationLabels.map((label) => {
            const secondary = secondaryGeneration.includes(label);
            return (
              <button
                key={label}
                type="button"
                onClick={() => setSecondaryGeneration((current) => secondary ? current.filter((item) => item !== label) : [...current, label])}
                title={`Move ${label} to the ${secondary ? "primary" : "secondary"} axis`}
                style={{ border: `1px solid ${secondary ? "#059669" : "#93C5FD"}`, borderRadius: 999, padding: "3px 8px", background: secondary ? "#ECFDF5" : "#EFF6FF", color: secondary ? "#047857" : "#1D4ED8", fontWeight: 800, cursor: "pointer" }}
              >
                {label} · {secondary ? "Secondary" : "Primary"}
              </button>
            );
          })}
          <span>Deviation always remains on Secondary.</span>
        </div>
      )}
      <ReactECharts ref={ref} option={option} notMerge lazyUpdate style={{ width: "100%", height }} />
    </div>
  );
});

export default GenerationDeviationChart;
