import { useRef, useMemo, useImperativeHandle, forwardRef } from "react";
import ReactECharts from "echarts-for-react";
import { Download } from "lucide-react";

const COLORS = {
  state: {
    deviation: "#059669",
    frequency: "#7C3AED",
  },
  generator: {
    deviation: "#DC2626",
    frequency: "#1D4ED8",
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

function fmtPeriodTs(ts) {
  if (!ts) return "";
  try {
    const [date, time] = ts.split(" ");
    const [y, m, d] = date.split("-");
    const [hh, mm] = time.split(":");
    return `${d}-${m}-${String(y).slice(-2)} ${hh}:${mm}`;
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
    helping: type === "state"
      ? { color: "rgba(6,182,212,0.30)", label: "Helping Grid (Cyan Shade)" }
      : { color: "rgba(16,185,129,0.30)", label: "Helping Grid (Green Shade)" },
    adverse: {
      color: type === "state" ? "rgba(234,179,8,0.30)" : "rgba(249,115,22,0.32)",
      label: type === "state" ? "Over Drawal (Gold Shade)" : "Under Injection (Orange Shade)",
    },
  };
}

const toCleanNumbers = (values = []) =>
  values.map((v) => (v !== null && v !== undefined && !Number.isNaN(Number(v)) ? Number(v) : null));

const statValue = (row, key) => {
  const stats = row.statistics || {};
  return row[key] ?? stats[key] ?? null;
};

const fmtPct = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? `${parsed.toFixed(1)}%` : "0.0%";
};

const fmtMw = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? `${parsed.toFixed(0)} MW` : "-";
};

const fmtHz = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? `${parsed.toFixed(2)} Hz` : "-";
};

const parseTs = (value) => {
  if (!value) return null;
  const parsed = new Date(String(value).replace(" ", "T"));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const CRMS_CATEGORY_COLORS = {
  alert: "#FACC15",
  emergency: "#F97316",
  "extreme emergency": "#DC2626",
  "non-compliance": "#111827",
  noncompliance: "#111827",
};

const CRMS_CATEGORY_ORDER = ["Alert", "Emergency", "Extreme Emergency", "Non-compliance"];
const CRMS_MESSAGE_SYMBOL = "path://M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z";
const TRANSMISSION_TOWER_SYMBOL = "path://M11 1h2l1.4 5H18v2h-3l1 4H20v2h-3.4L19 23h-3l-.8-3H8.8L8 23H5l2.4-9H4v-2h4l1-4H6V6h3.6L11 1zm-.4 7-1 4h4.8l-1-4h-2.8zm-1.5 6-1 4h5.8l-1-4H9.1z";

const crmsCategory = (message = {}) => {
  const raw = Array.isArray(message.category) ? message.category[0] : message.category;
  return String(raw || message.violation_type || "Message").trim();
};

const crmsLegendName = (message = {}) => {
  const category = crmsCategory(message);
  const match = CRMS_CATEGORY_ORDER.find((item) => item.toLowerCase() === category.toLowerCase());
  return match || category || "CRMS Message";
};

const crmsCategoryColor = (message = {}) => {
  const key = crmsCategory(message).toLowerCase();
  return CRMS_CATEGORY_COLORS[key] || "#2563EB";
};

const crmsIssueTime = (message = {}) => {
  const raw = String(message.message_date || message.timestamp || "");
  const timePart = raw.includes(" ") ? raw.split(" ")[1] : raw.includes("T") ? raw.split("T")[1] : raw;
  const [hh = "", mm = ""] = String(timePart || "").split(":");
  return hh && mm ? `${hh}:${mm} hrs` : raw;
};

const crmsTooltipHtml = (message = {}) => {
  const category = crmsCategory(message);
  const color = crmsCategoryColor(message);
  let html = `<div style="font-size:11px;line-height:1.35;min-width:220px">`;
  html += `<div style="font-weight:900;color:${color};margin-bottom:4px">${escapeHtml(category)}</div>`;
  html += `<div><span style="color:#64748B">Issue time:</span> ${escapeHtml(crmsIssueTime(message))}</div>`;
  if (message.message_no) html += `<div><span style="color:#64748B">Message no:</span> ${escapeHtml(message.message_no)}</div>`;
  if (message.issued_to?.length) html += `<div><span style="color:#64748B">Issued to:</span> ${escapeHtml(message.issued_to.join(", "))}</div>`;
  if (message.issued_by) html += `<div><span style="color:#64748B">Issued by:</span> ${escapeHtml(message.issued_by)}</div>`;
  if (message.remarks) html += `<div style="margin-top:4px;color:#334155;font-weight:800">${escapeHtml(message.remarks)}</div>`;
  html += `</div>`;
  return html;
};

const transmissionTooltipHtml = (event = {}) => {
  let html = `<div style="font-size:11px;line-height:1.4;min-width:240px">`;
  html += `<div style="font-weight:900;color:#050505;margin-bottom:4px">Transmission Line — Physical Regulation</div>`;
  html += `<div style="font-weight:900;color:#0F172A">${escapeHtml(event.line_name || "Transmission line")}</div>`;
  html += `<div><span style="color:#64748B">Time:</span> ${escapeHtml(event.timestamp || event.outage_date_time || "-")}</div>`;
  if (event.owners?.length) html += `<div><span style="color:#64748B">Owner(s):</span> ${escapeHtml(event.owners.join(", "))}</div>`;
  if (event.agency_name) html += `<div><span style="color:#64748B">Agency:</span> ${escapeHtml(event.agency_name)}</div>`;
  if (event.reason) html += `<div style="margin-top:4px;color:#334155;font-weight:800">${escapeHtml(event.reason)}</div>`;
  html += `</div>`;
  return html;
};

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

const ComplianceChart = forwardRef(function ComplianceChart(
  { row, showSchAct = false, height = 480, compact = false, fontSize = 12, showDownloadButton = false, downloadFilename },
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

  const type = row.is_state ? "state" : "generator";
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

  const annotationText = useMemo(() => {
    if (!hasDeviation) return "";
    if (eventType === "high" && type === "state") {
      return [
        "+Ve Dev : Over Drawal (Gold Shade)",
        `% Duration (Freq>50.05 & Dev>0): ${fmtPct(statValue(row, "od_duration_pct"))}`,
        "-Ve Dev : Under Drawal (Cyan Shade)",
        `% Duration (Freq>50.05 & Dev<0): ${fmtPct(statValue(row, "helping_duration_pct"))}`,
        `Max UD = ${fmtMw(statValue(row, "max_ud"))}`,
        `(Time: ${statValue(row, "max_ud_time") || "-"} | Freq = ${fmtHz(statValue(row, "freq_at_max_ud"))})`,
      ].join("\n");
    }
    if (eventType === "high") {
      return [
        "+Ve Dev : Over Injection (Orange Shade)",
        `% Duration (Freq>50.05 & Dev>0): ${fmtPct(statValue(row, "helping_grid_pct"))}`,
        "-Ve Dev : Under Injection (Green Shade)",
        `% Duration (Freq>50.05 & Dev<0): ${fmtPct(statValue(row, "under_inj_pct"))}`,
      ].join("\n");
    }
    if (type === "state") {
      return [
        "+Ve Dev : Over Drawal (Gold Shade)",
        `% Duration (Freq<49.9 & Dev>0): ${fmtPct(statValue(row, "od_duration_pct"))}`,
        "-Ve Dev : Under Drawal (Cyan Shade)",
        `% Duration (Freq<49.9 & Dev<0): ${fmtPct(statValue(row, "helping_duration_pct"))}`,
        `Max OD = ${fmtMw(statValue(row, "max_od"))}`,
        `(Time: ${statValue(row, "max_od_time") || "-"} | Freq = ${fmtHz(statValue(row, "freq_at_max_od"))})`,
      ].join("\n");
    }
    return [
      "+Ve Dev : Over Injection (Green Shade)",
      `% Duration (Freq<49.9 & Dev>0): ${fmtPct(statValue(row, "helping_grid_pct"))}`,
      "-Ve Dev : Under Injection (Orange Shade)",
      `% Duration (Freq<49.9 & Dev<0): ${fmtPct(statValue(row, "under_inj_pct"))}`,
    ].join("\n");
  }, [hasDeviation, eventType, type, row]);

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

  const crmsMarkers = useMemo(() => {
    const messages = Array.isArray(row.crms_messages) ? row.crms_messages : [];
    if (!messages.length || !timestamps.length) return [];
    const parsedTimestamps = timestamps.map((ts) => parseTs(ts));
    const firstTs = parsedTimestamps.find(Boolean);
    const lastTs = [...parsedTimestamps].reverse().find(Boolean);
    if (!firstTs || !lastTs) return [];

    return messages
      .map((message, markerIndex) => {
        const msgTs = parseTs(message.timestamp || message.message_date);
        if (!msgTs || msgTs < firstTs || msgTs > lastTs) return null;
        let nearestIndex = -1;
        let nearestDiff = Number.POSITIVE_INFINITY;
        parsedTimestamps.forEach((ts, index) => {
          if (!ts) return;
          const diff = Math.abs(ts.getTime() - msgTs.getTime());
          if (diff < nearestDiff) {
            nearestDiff = diff;
            nearestIndex = index;
          }
        });
        if (nearestIndex < 0) return null;
        const baseValue = cleanDevs[nearestIndex] ?? cleanActuals[nearestIndex] ?? 0;
        const collisionOffset = ((markerIndex % 5) - 2) * Math.max(maxDevAbs * 0.025, 1);
        return {
          value: [timestamps[nearestIndex], baseValue + collisionOffset],
          crms: message,
        };
      })
      .filter(Boolean);
  }, [row.crms_messages, timestamps, cleanDevs, cleanActuals, maxDevAbs]);

  const crmsMarkersByCategory = useMemo(() => {
    const grouped = new Map();
    crmsMarkers.forEach((marker) => {
      const name = crmsLegendName(marker.crms);
      if (!grouped.has(name)) grouped.set(name, []);
      grouped.get(name).push(marker);
    });
    return Array.from(grouped.entries()).sort(([a], [b]) => {
      const ai = CRMS_CATEGORY_ORDER.indexOf(a);
      const bi = CRMS_CATEGORY_ORDER.indexOf(b);
      return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi) || a.localeCompare(b);
    });
  }, [crmsMarkers]);

  const transmissionMarkers = useMemo(() => {
    const events = Array.isArray(row.transmission_line_events) ? row.transmission_line_events : [];
    if (!hasDeviation || !events.length || !timestamps.length) return [];
    const parsedTimestamps = timestamps.map((ts) => parseTs(ts));
    const firstTs = parsedTimestamps.find(Boolean);
    const lastTs = [...parsedTimestamps].reverse().find(Boolean);
    if (!firstTs || !lastTs) return [];

    return events.map((event, markerIndex) => {
      const eventTs = parseTs(event.timestamp || event.outage_date_time);
      if (!eventTs || eventTs < firstTs || eventTs > lastTs) return null;
      let nearestIndex = -1;
      let nearestDiff = Number.POSITIVE_INFINITY;
      parsedTimestamps.forEach((ts, index) => {
        if (!ts) return;
        const diff = Math.abs(ts.getTime() - eventTs.getTime());
        if (diff < nearestDiff) {
          nearestDiff = diff;
          nearestIndex = index;
        }
      });
      if (nearestIndex < 0) return null;
      const baseValue = cleanDevs[nearestIndex] ?? 0;
      const collisionOffset = ((markerIndex % 4) - 1.5) * Math.max(maxDevAbs * 0.035, 1.5);
      return {
        value: [timestamps[nearestIndex], baseValue + collisionOffset],
        transmission: event,
      };
    }).filter(Boolean);
  }, [row.transmission_line_events, hasDeviation, timestamps, cleanDevs, maxDevAbs]);

  const option = useMemo(() => {
    const baseFont = Math.max(8, Number(fontSize) || 12);
    const titleFont = baseFont + (compact ? 2 : 3);
    const smallFont = Math.max(8, baseFont - 2);
    const titleTop = compact ? 8 : 10;
    const legendTop = titleTop + titleFont + (smallFont * 1.35) + 18;
    const legendHeight = baseFont + 18;
    const gridTop = legendTop + legendHeight + 18;
    const zoomHeight = compact ? Math.max(16, baseFont) : Math.max(20, baseFont + 2);
    const gridBottom = compact ? Math.max(72, baseFont * 3.8) : Math.max(92, baseFont * 4.4);
    const zoomBottom = compact ? 18 : 24;
    const periodText = timestamps.length
      ? `${fmtPeriodTs(timestamps[0])} to ${fmtPeriodTs(timestamps[timestamps.length - 1])}`
      : "";
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
            fontSize: smallFont,
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
          lineStyle: { color: palette.deviation, width: compact ? 3.2 : 3.6 },
          markLine: {
            silent: true,
            symbol: "none",
            lineStyle: { color: "#94A3B8", type: "dashed", width: 1.5 },
            label: { formatter: "0 MW", position: "end", color: "#475569", fontSize: smallFont, fontWeight: "bold" },
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
        lineStyle: { color: palette.frequency, width: compact ? 2.8 : 3.2 },
        markLine: {
          silent: true,
          symbol: "none",
          lineStyle: { color: eventType === "high" ? "#DC2626" : "#F97316", type: "dashed", width: 1.2 },
          label: { formatter: meta.thresholdText, position: "insideEndTop", color: eventType === "high" ? "#B91C1C" : "#C2410C", fontSize: smallFont, fontWeight: "bold" },
          data: [{ yAxis: meta.threshold }],
        },
        z: 3,
      },
      {
        name: "Frequency violation area",
        type: "line",
        xAxisIndex: 0,
        yAxisIndex: 1,
        data: cleanFreqs.map((value) => (value !== null && meta.isEvent(value) ? value : null)),
        symbol: "none",
        connectNulls: false,
        silent: true,
        lineStyle: { width: 0, opacity: 0 },
        itemStyle: { color: "rgba(239,68,68,0.18)" },
        areaStyle: { color: "rgba(239,68,68,0.18)", origin: meta.threshold },
        tooltip: { show: false },
        z: 2,
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
          lineStyle: { color: "#4F46E5", width: compact ? 2.4 : 2.8 },
          z: 2,
        }] : []),
        {
          name: "Actual (MW)",
          type: "line",
          xAxisIndex: 0,
          yAxisIndex: 0,
          data: cleanActuals,
          symbol: "none",
          itemStyle: { color: "#DB2777" },
          lineStyle: { color: "#DB2777", width: hasDeviation ? (compact ? 2.4 : 2.8) : (compact ? 3 : 3.4) },
          z: 2,
        },
      ] : []),
      ...crmsMarkersByCategory.map(([categoryName, markers]) => ({
        name: categoryName,
        type: "scatter",
        xAxisIndex: 0,
        yAxisIndex: 0,
        data: markers,
        symbol: CRMS_MESSAGE_SYMBOL,
        symbolSize: compact ? 24 : 28,
        itemStyle: {
          color: crmsCategoryColor({ category: categoryName }),
          borderColor: "#FFFFFF",
          borderWidth: 2.2,
          shadowColor: "rgba(15, 23, 42, 0.35)",
          shadowBlur: 8,
        },
        label: { show: false },
        emphasis: {
          scale: 1.45,
          itemStyle: { borderColor: "#FACC15", borderWidth: 3 },
        },
        tooltip: {
          trigger: "item",
          formatter: (params) => crmsTooltipHtml(params.data?.crms || {}),
        },
        z: 12,
      })),
      ...(hasDeviation && transmissionMarkers.length ? [{
        name: "Physical Regulation — Transmission Line",
        type: "scatter",
        xAxisIndex: 0,
        yAxisIndex: 0,
        data: transmissionMarkers,
        symbol: TRANSMISSION_TOWER_SYMBOL,
        symbolSize: compact ? 27 : 32,
        itemStyle: { color: "#050505", borderColor: "#FFFFFF", borderWidth: 1.8, shadowColor: "rgba(250,204,21,0.95)", shadowBlur: 16 },
        emphasis: { scale: 1.55, itemStyle: { color: "#000000", borderColor: "#FACC15", borderWidth: 3, shadowColor: "rgba(250,204,21,1)", shadowBlur: 22 } },
        tooltip: { trigger: "item", formatter: (params) => transmissionTooltipHtml(params.data?.transmission || {}) },
        z: 14,
      }] : []),
    ];

    const legendItems = [
      ...(hasDeviation ? [meta.helping.label, meta.adverse.label] : []),
      ...(hasDeviation ? ["Deviation (MW)"] : []),
      "Frequency (Hz)",
      `Event Threshold (${meta.thresholdText})`,
      ...(!hasDeviation || showSchAct ? [
        ...(cleanScheds.some((v) => v !== null) ? ["Schedule (MW)"] : []),
        "Actual (MW)"
      ] : []),
      ...crmsMarkersByCategory.map(([categoryName]) => ({ name: categoryName, icon: CRMS_MESSAGE_SYMBOL })),
      ...(hasDeviation && transmissionMarkers.length ? [{ name: "Physical Regulation — Transmission Line", icon: TRANSMISSION_TOWER_SYMBOL }] : [])
    ];

    return {
      backgroundColor: "#FFFFFF",
      textStyle: { fontFamily: "Inter, sans-serif", fontWeight: 700 },
      animation: false,
      tooltip: {
        trigger: "axis",
        backgroundColor: "rgba(255,255,255,0.98)",
        borderColor: "#CBD5E1",
        borderWidth: 1,
        padding: [10, 14],
        textStyle: { color: "#1E293B", fontSize: baseFont, fontWeight: 700 },
        formatter: (params) => {
          const ts = params[0]?.axisValue || "";
          const map = {};
          const crmsParams = [];
          const transmissionParams = [];
          params.forEach((p) => {
            if (p.data?.transmission) {
              transmissionParams.push(p.data.transmission);
              return;
            }
            if (p.data?.crms) {
              crmsParams.push(p.data.crms);
              return;
            }
            map[p.seriesName] = Array.isArray(p.value) ? p.value[1] : p.value;
          });
          const freq = map["Frequency (Hz)"];
          const dev = map["Deviation (MW)"];
          const inEvent = freq != null && meta.isEvent(freq);
          const badge = inEvent ? `<span style="background:${eventType === "high" ? "#DC2626" : "#F97316"};color:#fff;border-radius:3px;padding:1px 5px;font-size:${smallFont}px;font-weight:800;margin-left:6px">${meta.badge}</span>` : "";
          let html = `<div style="border-bottom:1px solid #CBD5E1;padding-bottom:5px;margin-bottom:6px;font-size:${smallFont}px;color:#64748B">${ts}${badge}</div>`;
          html += `<div style="display:flex;justify-content:space-between;gap:16px;margin-bottom:3px"><span style="color:#64748B">Frequency:</span><span style="font-weight:700;color:${palette.frequency}">${freq != null ? Number(freq).toFixed(3) : "-"} Hz</span></div>`;
          if (hasDeviation) {
            html += `<div style="display:flex;justify-content:space-between;gap:16px;margin-bottom:3px"><span style="color:#64748B">Deviation:</span><span style="font-weight:700;color:${dev >= 0 ? palette.deviation : "#EF4444"}">${dev != null ? (dev >= 0 ? "+" : "") + Number(dev).toFixed(0) : "-"} MW</span></div>`;
          }
          if (map["Schedule (MW)"] != null) html += `<div style="display:flex;justify-content:space-between;gap:16px;margin-bottom:3px"><span style="color:#64748B">Schedule:</span><span style="color:#6366F1;font-weight:600">${Number(map["Schedule (MW)"]).toFixed(0)} MW</span></div>`;
          if (map["Actual (MW)"] != null) html += `<div style="display:flex;justify-content:space-between;gap:16px"><span style="color:#64748B">Actual:</span><span style="color:#EC4899;font-weight:600">${Number(map["Actual (MW)"]).toFixed(0)} MW</span></div>`;
          if (hasDeviation && inEvent) {
            html += `<div style="margin-top:5px;padding-top:5px;border-top:1px solid #E2E8F0;font-size:${smallFont}px;color:#475569;font-weight:600">${meta.isHelping(dev) ? meta.helping.label : meta.adverse.label}</div>`;
          }
          if (crmsParams.length) {
            html += `<div style="margin-top:7px;padding-top:7px;border-top:1px solid #CBD5E1">`;
            crmsParams.forEach((message) => {
              html += crmsTooltipHtml(message);
            });
            html += `</div>`;
          }
          if (transmissionParams.length) {
            html += `<div style="margin-top:7px;padding-top:7px;border-top:1px solid #CBD5E1">`;
            transmissionParams.forEach((event) => { html += transmissionTooltipHtml(event); });
            html += `</div>`;
          }
          return html;
        },
      },
      legend: {
        show: true,
        type: "scroll",
        top: legendTop,
        left: 56,
        right: 48,
        textStyle: { color: "#1F2937", fontSize: baseFont, fontWeight: 800 },
        itemWidth: Math.max(compact ? 18 : 20, baseFont + 2),
        itemHeight: Math.max(compact ? 12 : 14, baseFont - 4),
        pageIconSize: Math.max(10, smallFont),
        pageTextStyle: { color: "#64748B", fontSize: smallFont },
        selectedMode: true,
        data: legendItems,
      },
      toolbox: {
        show: false,
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
      title: {
        text: `${row.plant_name || row.name || row.entity || row.state || "Entity"}: Frequency (Hz) vs Deviation (MW)`,
        subtext: `${eventType === "high" ? "High" : "Low"} Frequency Operation${periodText ? `: ${periodText}` : ""}`,
        left: 10,
        top: titleTop,
        textStyle: { color: "#0F172A", fontSize: titleFont, fontWeight: 900 },
        subtextStyle: { color: "#475569", fontSize: smallFont, fontWeight: 800, lineHeight: smallFont + 4 },
      },
      grid: [
        { top: gridTop, right: Math.max(72, baseFont * 4), bottom: gridBottom, left: Math.max(68, baseFont * 3.8), containLabel: false },
      ],
      graphic: annotationText ? [{
        type: "text",
        right: Math.max(78, baseFont * 4.5),
        top: gridTop + 22,
        z: 20,
        style: {
          text: annotationText,
          font: `${smallFont}px monospace`,
          lineHeight: smallFont + 5,
          fill: "#0F172A",
          backgroundColor: "rgba(255,255,255,0.92)",
          borderColor: "#CBD5E1",
          borderWidth: 1,
          borderRadius: 6,
          padding: [8, 10],
          shadowColor: "rgba(15,23,42,0.12)",
          shadowBlur: 10,
        },
      }] : [],
      dataZoom: [
        { type: "inside", xAxisIndex: 0, filterMode: "none" },
        {
          type: "slider",
          xAxisIndex: 0,
          height: zoomHeight,
          bottom: zoomBottom,
          textStyle: { color: "#64748B", fontSize: smallFont },
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
        { type: "category", gridIndex: 0, data: timestamps, boundaryGap: false, axisLabel: { formatter: fmtTick, color: "#334155", fontSize: smallFont, fontWeight: 700, rotate: 0, margin: compact ? 12 : 16, interval: Math.max(Math.floor(timestamps.length / 5) - 1, 0) }, axisLine: { lineStyle: { color: "#94A3B8", width: 1.4 } }, splitLine: { show: false } },
      ],
      yAxis: [
        { type: "value", gridIndex: 0, name: "MW", min: hasDeviation ? -maxDevAbs : 0, max: maxDevAbs, interval: hasDeviation ? maxDevAbs / 3 : maxDevAbs / 4, nameTextStyle: { color: "#0F172A", fontWeight: 900, fontSize: baseFont, padding: [0, 0, 6, 0] }, axisLabel: { color: "#334155", fontSize: smallFont, fontWeight: 700, formatter: (v) => v.toFixed(0), margin: 10 }, splitLine: { lineStyle: { color: "#D7E1EA", width: 1.1 } } },
        { type: "value", gridIndex: 0, name: "Hz", position: "right", min: 49.4, max: 50.6, interval: 0.2, nameTextStyle: { color: palette.frequency, fontWeight: 900, fontSize: baseFont, padding: [0, 0, 6, 0] }, axisLabel: { color: palette.frequency, fontSize: smallFont, fontWeight: 800, formatter: (v) => v.toFixed(2), margin: 10 }, axisLine: { show: true, lineStyle: { color: palette.frequency, width: 1.6 } }, splitLine: { show: false } },
      ],
      series: chartSeries,
    };
  }, [timestamps, cleanDevs, cleanFreqs, cleanScheds, cleanActuals, showSchAct, compact, fontSize, palette, meta, maxDevAbs, helpingData, adverseData, eventType, hasDeviation, row, crmsMarkersByCategory, transmissionMarkers, annotationText]);

  const handleDownload = (event) => {
    event?.stopPropagation();
    const inst = eRef.current?.getEchartsInstance();
    const url = inst?.getDataURL({ type: "png", pixelRatio: 2, backgroundColor: "#FFFFFF" });
    downloadUrl(url, `${safeFileName(downloadFilename || `${row.plant_name || row.name || row.entity || "frequency_deviation"}_frequency_deviation`)}.png`);
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
            right: 40,
            zIndex: 5,
            width: 30,
            height: 30,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            border: "1px solid #BFD3F8",
            borderRadius: 6,
            background: "#FFFFFF",
            color: "#03624C",
            cursor: "pointer",
            boxShadow: "0 4px 12px rgba(15,111,219,0.12)",
          }}
        >
          <Download size={15} />
        </button>
      )}
      <ReactECharts
        ref={eRef}
        option={option}
        style={{ height, width: "100%" }}
        opts={{ renderer: "canvas" }}
        notMerge
      />
    </div>
  );
});

export default ComplianceChart;
