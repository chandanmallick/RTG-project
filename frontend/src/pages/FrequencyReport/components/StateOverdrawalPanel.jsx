import { useState, useEffect, useRef, useMemo } from "react";
import ReactECharts from "echarts-for-react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  Download,
  RotateCcw,
  Calendar,
  Zap,
  ChevronDown,
  ChevronRight,
  Filter,
  Check,
  Plus,
  Trash2,
  ListFilter,
  Sliders,
  Clock,
  Sparkles,
} from "lucide-react";
import API from "../../../services/api";

const CRMS_COLORS = {
  alert: "#FACC15",
  emergency: "#F97316",
  "extreme emergency": "#DC2626",
  "non-compliance": "#111827",
  noncompliance: "#111827",
  "message-a": "#2563EB",
  "message-b": "#D97706",
  "message-c": "#EA580C",
  "message-d": "#DC2626",
};

const CRMS_ORDER = ["Alert", "Emergency", "Extreme Emergency", "Non-compliance"];
const crmsCategory = (m) => {
  const raw = Array.isArray(m.category) ? m.category[0] : m.category;
  return String(raw || m.violation_type || "CRMS Message").trim();
};
const crmsColor = (m) => CRMS_COLORS[crmsCategory(m).toLowerCase()] || "#2563EB";
const CRMS_SYMBOL =
  "path://M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z";
const TOWER_SYMBOL =
  "path://M11 1h2l1.4 5H18v2h-3l1 4H20v2h-3.4L19 23h-3l-.8-3H8.8L8 23H5l2.4-9H4v-2h4l1-4H6V6h3.6L11 1zm-.4 7-1 4h4.8l-1-4h-2.8zm-1.5 6-1 4h5.8l-1-4H9.1z";

function formatCrmsTooltip(m) {
  let html = `<div style="min-width:240px;font-size:12px;line-height:1.45"><div style="font-weight:900;color:${crmsColor(
    m
  )};margin-bottom:5px">CRMS Violation: ${crmsCategory(m)}</div>`;
  const issued = m.timestamp || m.message_date || "";
  if (issued) html += `<div><span style="color:#64748B">Issue time:</span> <strong>${issued}</strong></div>`;
  if (m.message_no) html += `<div><span style="color:#64748B">Message no:</span> <strong>${m.message_no}</strong></div>`;
  if (Array.isArray(m.issued_to) && m.issued_to.length)
    html += `<div><span style="color:#64748B">Issued to:</span> <strong>${m.issued_to.join(", ")}</strong></div>`;
  if (m.issued_by) html += `<div><span style="color:#64748B">Issued by:</span> ${m.issued_by}</div>`;
  if (m.remarks) html += `<div style="margin-top:5px;font-weight:700;color:#334155">${m.remarks}</div>`;
  return html + "</div>";
}

function formatTransmissionTooltip(ev) {
  let html = `<div style="min-width:260px;font-size:12px;line-height:1.45"><div style="font-weight:900;color:#0F172A;margin-bottom:5px">⚡ Physical Regulation — Transmission Line</div>`;
  html += `<div style="font-weight:900;color:#1E293B">${ev.line_name || "Transmission line"}</div>`;
  html += `<div><span style="color:#64748B">Time:</span> <strong>${ev.timestamp || ev.outage_date_time || "-"}</strong></div>`;
  if (Array.isArray(ev.owners) && ev.owners.length)
    html += `<div><span style="color:#64748B">Owner(s):</span> <strong>${ev.owners.join(", ")}</strong></div>`;
  if (ev.agency_name) html += `<div><span style="color:#64748B">Agency:</span> ${ev.agency_name}</div>`;
  if (ev.reason || ev.remarks)
    html += `<div style="margin-top:5px;font-weight:700;color:#334155">${ev.reason || ev.remarks}</div>`;
  return html + "</div>";
}

/**
 * Detect all frequency dips below 49.90 Hz and qualify using user criteria:
 * F < 49.90 Hz for > 15 min OR F < 49.50 Hz for > 5 min.
 */
function detectAllFrequencyDips(timestamps, frequency) {
  if (!timestamps || !frequency || !timestamps.length) return [];
  const dips = [];
  let inDip = false;
  let startIdx = 0;
  const n = Math.min(timestamps.length, frequency.length);

  for (let i = 0; i < n; i++) {
    const f = frequency[i];
    if (f != null && f < 49.9) {
      if (!inDip) {
        inDip = true;
        startIdx = i;
      }
    } else {
      if (inDip) {
        inDip = false;
        const duration = i - startIdx;
        let minVal = 50.0;
        let minIdx = startIdx;
        let c495 = 0;
        for (let k = startIdx; k < i; k++) {
          const val = frequency[k];
          if (val != null) {
            if (val < minVal) {
              minVal = val;
              minIdx = k;
            }
            if (val < 49.5) {
              c495++;
            }
          }
        }
        const isAuto = duration > 15 || c495 > 5;
        let reason = "";
        if (duration > 15 && c495 > 5) {
          reason = `F < 49.9 for ${duration}m & F < 49.5 for ${c495}m`;
        } else if (duration > 15) {
          reason = `F < 49.9 for ${duration}m (>15 min)`;
        } else if (c495 > 5) {
          reason = `F < 49.5 for ${c495}m (>5 min)`;
        } else {
          reason = `Dip < 49.90 (${duration}m)`;
        }

        dips.push({
          id: `dip-${startIdx}-${i - 1}`,
          start_idx: startIdx,
          end_idx: i - 1,
          start_time: timestamps[startIdx],
          end_time: timestamps[i - 1],
          date: timestamps[startIdx].slice(0, 10),
          time_window: `${timestamps[startIdx].slice(11, 16)} – ${timestamps[i - 1].slice(11, 16)}`,
          duration_min: duration,
          min_freq: Number(minVal.toFixed(3)),
          min_time: timestamps[minIdx]?.slice(11, 16) || "",
          c495_min: c495,
          auto_qualified: isAuto,
          qualification_reason: reason,
          label: `Dip #${dips.length + 1} (${timestamps[startIdx].slice(5, 10)} ${timestamps[startIdx].slice(
            11,
            16
          )}–${timestamps[i - 1].slice(11, 16)} | Min ${minVal.toFixed(3)} Hz)`,
        });
      }
    }
  }

  if (inDip) {
    const i = n;
    const duration = i - startIdx;
    let minVal = 50.0;
    let minIdx = startIdx;
    let c495 = 0;
    for (let k = startIdx; k < i; k++) {
      const val = frequency[k];
      if (val != null) {
        if (val < minVal) {
          minVal = val;
          minIdx = k;
        }
        if (val < 49.5) {
          c495++;
        }
      }
    }
    const isAuto = duration > 15 || c495 > 5;
    let reason = "";
    if (duration > 15 && c495 > 5) {
      reason = `F < 49.9 for ${duration}m & F < 49.5 for ${c495}m`;
    } else if (duration > 15) {
      reason = `F < 49.9 for ${duration}m (>15 min)`;
    } else if (c495 > 5) {
      reason = `F < 49.5 for ${c495}m (>5 min)`;
    } else {
      reason = `Dip < 49.90 (${duration}m)`;
    }

    dips.push({
      id: `dip-${startIdx}-${i - 1}`,
      start_idx: startIdx,
      end_idx: i - 1,
      start_time: timestamps[startIdx],
      end_time: timestamps[i - 1],
      date: timestamps[startIdx].slice(0, 10),
      time_window: `${timestamps[startIdx].slice(11, 16)} – ${timestamps[i - 1].slice(11, 16)}`,
      duration_min: duration,
      min_freq: Number(minVal.toFixed(3)),
      min_time: timestamps[minIdx]?.slice(11, 16) || "",
      c495_min: c495,
      auto_qualified: isAuto,
      qualification_reason: reason,
      label: `Dip #${dips.length + 1} (${timestamps[startIdx].slice(5, 10)} ${timestamps[startIdx].slice(
        11,
        16
      )}–${timestamps[i - 1].slice(11, 16)} | Min ${minVal.toFixed(3)} Hz)`,
    });
  }

  return dips;
}

/**
 * Generate discrete dual-axis event curves for each constituent state given specific event windows.
 */
function buildEventChartsFromSlots(slots, continuousData) {
  if (!continuousData || !slots || !slots.length) return [];
  const timestamps = continuousData.timestamps || [];
  const totalPoints = timestamps.length;
  if (!totalPoints) return [];
  const states = Object.keys(continuousData.states || {});
  const charts = [];

  slots.forEach((slot, slotIdx) => {
    const eventIndex = slotIdx + 1;
    let sIdx = -1;
    let eIdx = -1;

    if (slot.start_idx != null && slot.end_idx != null) {
      sIdx = slot.start_idx;
      eIdx = slot.end_idx;
    } else {
      const sTarget = (slot.start_time || "").slice(0, 16);
      const eTarget = (slot.end_time || "").slice(0, 16);
      sIdx = timestamps.findIndex((t) => t.startsWith(sTarget) || sTarget.startsWith(t));
      eIdx = timestamps.findIndex((t) => t.startsWith(eTarget) || eTarget.startsWith(t));
      if (sIdx < 0 && slot.date && slot.start_time) {
        const combinedStart = `${slot.date} ${slot.start_time.slice(0, 5)}`;
        sIdx = timestamps.findIndex((t) => t.startsWith(combinedStart));
      }
      if (eIdx < 0 && slot.date && slot.end_time) {
        const combinedEnd = `${slot.date} ${slot.end_time.slice(0, 5)}`;
        eIdx = timestamps.findIndex((t) => t.startsWith(combinedEnd));
      }
    }

    if (sIdx < 0) sIdx = 0;
    if (eIdx < 0 || eIdx < sIdx) eIdx = Math.min(sIdx + 60, totalPoints - 1);

    // Provide 15 min padding before and after so context is clear
    const padStart = Math.max(0, sIdx - 15);
    const padEnd = Math.min(totalPoints - 1, eIdx + 15);

    const sliceTs = timestamps.slice(padStart, padEnd + 1);
    const sliceFreq = (continuousData.frequency || []).slice(padStart, padEnd + 1);

    const startTimeStr = timestamps[sIdx] || slot.start_time || "";
    const endTimeStr = timestamps[eIdx] || slot.end_time || "";
    const eventName =
      slot.label ||
      `Event ${eventIndex} | ${startTimeStr.slice(0, 10)} | ${startTimeStr.slice(11, 16)} - ${endTimeStr.slice(
        11,
        16
      )}`;

    states.forEach((stateName) => {
      const stData = continuousData.states[stateName] || {};
      const sliceDev = (stData.deviation || []).slice(padStart, padEnd + 1);
      const sliceSch = (stData.schedule || []).slice(padStart, padEnd + 1);
      const sliceAct = (stData.actual || []).slice(padStart, padEnd + 1);

      const padStartTs = timestamps[padStart];
      const padEndTs = timestamps[padEnd];

      const relevantCrms = (stData.crms_messages || []).filter((m) => {
        const mTs = (m.timestamp || m.message_date || "").slice(0, 16);
        return mTs >= padStartTs && mTs <= padEndTs;
      });

      const relevantTrans = (stData.transmission_line_events || []).filter((ev) => {
        const evTs = (ev.timestamp || ev.outage_date_time || "").slice(0, 16);
        return evTs >= padStartTs && evTs <= padEndTs;
      });

      charts.push({
        event_id: `${stateName}:${eventIndex}`,
        event_index: eventIndex,
        event_name: eventName,
        event_type: "low",
        state: stateName,
        start_time: startTimeStr,
        end_time: endTimeStr,
        series: {
          timestamps: sliceTs,
          frequency: sliceFreq,
          deviation: sliceDev,
          schedule: sliceSch,
          actual: sliceAct,
        },
        transmission_line_events: relevantTrans,
        crms_messages: relevantCrms,
      });
    });
  });

  return charts;
}

export default function StateOverdrawalPanel({ result, sessionToken, saveBlob }) {
  const session = sessionToken || result?.session_token;
  const token = result?.result_token;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [eventCharts, setEventCharts] = useState([]);

  // Slotting Modes: "auto" | "select" | "manual"
  const [slotMode, setSlotMode] = useState("auto");
  const [candidateDips, setCandidateDips] = useState([]);
  const [selectedDipIds, setSelectedDipIds] = useState(new Set());
  const [manualSlots, setManualSlots] = useState([]);
  const [activeSlots, setActiveSlots] = useState([]);

  // Modals
  const [selectModalOpen, setSelectModalOpen] = useState(false);
  const [manualModalOpen, setManualModalOpen] = useState(false);

  // Manual Form States
  const [manualDate, setManualDate] = useState("");
  const [manualStartTime, setManualStartTime] = useState("17:00");
  const [manualEndTime, setManualEndTime] = useState("18:00");
  const [manualLabel, setManualLabel] = useState("");
  const [manualError, setManualError] = useState("");

  // Dips modal search
  const [dipsSearchTerm, setDipsSearchTerm] = useState("");

  const [selectedState, setSelectedState] = useState("West Bengal");
  const [selectedDate, setSelectedDate] = useState("");
  const [activeChip, setActiveChip] = useState(null);

  // Footnote stats
  const [visibleStats, setVisibleStats] = useState({
    odMinutes: 0,
    lowMinutes: 0,
    maxOd: 0,
    rangeText: "",
  });

  // Discrete Event Filter
  const [discreteStateFilter, setDiscreteStateFilter] = useState("ALL");
  const [discreteEventFilter, setDiscreteEventFilter] = useState("ALL");
  const [openCards, setOpenCards] = useState({});

  const echartsRef = useRef(null);

  useEffect(() => {
    if (!session) return;
    let active = true;
    setLoading(true);
    setError("");

    API.getContinuousDrawal({ session_token: session, result_token: token })
      .then((res) => {
        if (!active) return;
        if (res.success && res.continuous_data) {
          setData(res.continuous_data);

          // Detect candidate dips
          const dips =
            res.continuous_data.candidate_dips ||
            detectAllFrequencyDips(res.continuous_data.timestamps, res.continuous_data.frequency);
          setCandidateDips(dips);

          // Auto-qualified dips (F < 49.9 for >15m or < 49.5 for >5m)
          const autoDips = dips.filter((d) => d.auto_qualified);
          const initialSlots = autoDips.length ? autoDips : dips.length ? dips.slice(0, 3) : [];
          setActiveSlots(initialSlots);
          setSelectedDipIds(new Set(autoDips.map((d) => d.id)));
          setSlotMode("auto");

          if (initialSlots.length > 0) {
            setEventCharts(buildEventChartsFromSlots(initialSlots, res.continuous_data));
          } else if (res.event_charts?.length) {
            setEventCharts(res.event_charts);
          }

          const states = Object.keys(res.continuous_data.states || {});
          if (states.length) {
            const hasWb = states.find((s) => s.toLowerCase().includes("west bengal"));
            setSelectedState(hasWb || states[0]);
          }
          if (res.continuous_data.unique_dates?.length) {
            setManualDate(res.continuous_data.unique_dates[0]);
          }
        } else {
          setError("Failed to retrieve continuous drawal data.");
        }
      })
      .catch((err) => {
        if (!active) return;
        setError(err?.response?.data?.detail || err.message || "Error loading continuous drawal data");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [session, token]);

  const timestamps = data?.timestamps || [];
  const totalPoints = timestamps.length;
  const statesList = useMemo(() => Object.keys(data?.states || {}), [data]);
  const uniqueDates = data?.unique_dates || [];
  const detectedEvents = data?.detected_events || [];

  // Update footnote calculations
  const calculateFootnote = (sIdx, eIdx) => {
    if (!data || !data.states) return;
    const stData = data.states[selectedState] || {};
    const dev = stData.deviation || [];
    const freq = data.frequency || [];
    const total = timestamps.length;
    if (!total) return;

    const safeStart = Math.max(0, Math.min(sIdx, total - 1));
    const safeEnd = Math.max(safeStart, Math.min(eIdx, total - 1));

    let lowCount = 0;
    let odCount = 0;
    let maxOd = 0;

    for (let i = safeStart; i <= safeEnd; i++) {
      const f = freq[i];
      const d = dev[i];
      if (f != null && f <= 49.9) {
        lowCount++;
        if (d != null && d > 0) {
          odCount++;
          if (d > maxOd) maxOd = d;
        }
      }
    }

    setVisibleStats({
      odMinutes: odCount,
      lowMinutes: lowCount,
      maxOd: Math.round(maxOd),
      rangeText: `Visible Window: ${timestamps[safeStart] || ""} to ${timestamps[safeEnd] || ""} (${
        safeEnd - safeStart + 1
      } min)`,
    });
  };

  // Build the 3-panel continuous chart options
  const continuousChartOption = useMemo(() => {
    if (!data || !timestamps.length) return null;
    const stData = data.states?.[selectedState] || {};
    const schedule = stData.schedule || [];
    const actual = stData.actual || [];
    const deviation = stData.deviation || [];
    const frequency = data.frequency || [];
    const lowFreqIntervals = data.low_freq_intervals || [];

    const overDrawal = deviation.map((v) => (v != null && v > 0 ? v : 0));
    const underDrawal = deviation.map((v) => (v != null && v < 0 ? v : 0));

    // CRMS Violation Scatter
    const crmsPoints = [];
    (stData.crms_messages || []).forEach((m, mIdx) => {
      const mTs = (m.timestamp || m.message_date || "").slice(0, 16);
      const idx = timestamps.indexOf(mTs);
      if (idx >= 0) {
        const yVal = (deviation[idx] ?? 0) + ((mIdx % 5) - 2) * 25;
        crmsPoints.push({
          value: [mTs, yVal],
          crms: m,
          itemStyle: { color: crmsColor(m), borderColor: "#FFFFFF", borderWidth: 1.5 },
        });
      }
    });

    // Physical Regulatory Scatter
    const transPoints = [];
    (stData.transmission_line_events || []).forEach((ev, eIdx) => {
      const evTs = (ev.timestamp || ev.outage_date_time || "").slice(0, 16);
      const idx = timestamps.indexOf(evTs);
      if (idx >= 0) {
        const yVal = (deviation[idx] ?? 0) + ((eIdx % 4) - 1.5) * 30;
        transPoints.push({
          value: [evTs, yVal],
          transmission: ev,
        });
      }
    });

    // MarkAreas for f <= 49.90 Hz across all 3 panels
    const markAreaData = lowFreqIntervals.map((i) => [
      { xAxis: i[0].xAxis, itemStyle: { color: "rgba(254, 226, 226, 0.45)" } },
      { xAxis: i[1].xAxis },
    ]);

    // Default window: 2 days (2880 minutes)
    const twoDaysPoints = Math.min(2880, totalPoints);
    const defaultEndPct = totalPoints > 0 ? (twoDaysPoints / totalPoints) * 100 : 100;

    return {
      animation: false,
      title: {
        text: `${selectedState}: schedule, actual drawal and over drawal vs frequency`,
        left: 75,
        top: 6,
        textStyle: { fontSize: 15, fontWeight: 900, color: "#0F172A" },
      },
      tooltip: {
        trigger: "axis",
        axisPointer: {
          type: "cross",
          link: [{ xAxisIndex: "all" }],
          label: { backgroundColor: "#17365D" },
        },
        formatter: (params) => {
          const list = Array.isArray(params) ? params : [params];
          if (!list.length) return "";
          const t = list[0].axisValue || "";

          const crmsItem = list.find((item) => item.data && item.data.crms);
          const transItem = list.find((item) => item.data && item.data.transmission);

          let html = `<div style="font-size: 11.5px; line-height: 1.45; min-width: 220px;">`;
          html += `<div style="font-weight: 800; color: #17365D; border-bottom: 1px solid #E2E8F0; padding-bottom: 4px; margin-bottom: 5px;">${t} IST</div>`;

          if (crmsItem) {
            html += formatCrmsTooltip(crmsItem.data.crms);
            html += `<div style="border-top: 1px dashed #E2E8F0; margin-top: 6px; padding-top: 4px;"></div>`;
          }
          if (transItem) {
            html += formatTransmissionTooltip(transItem.data.transmission);
            html += `<div style="border-top: 1px dashed #E2E8F0; margin-top: 6px; padding-top: 4px;"></div>`;
          }

          list.forEach((p) => {
            if (
              [
                "Over drawal",
                "Under drawal",
                "CRMS Violation Messages",
                "Physical Regulation (Line)",
                "markArea",
              ].includes(p.seriesName)
            )
              return;
            const val = Array.isArray(p.value) ? p.value[1] : p.value;
            if (val != null) {
              const formatted = p.seriesName.includes("Frequency")
                ? Number(val).toFixed(3) + " Hz"
                : Number(val).toFixed(1) + " MW";
              html += `<div style="display:flex; justify-content:space-between; gap:12px;">
                <span>${p.marker} <strong>${p.seriesName}:</strong></span>
                <span style="font-weight: 800;">${formatted}</span>
              </div>`;
            }
          });
          html += `</div>`;
          return html;
        },
      },
      legend: [
        {
          top: 28,
          left: 75,
          data: ["Schedule (MW)", "Actual drawal (MW)"],
          textStyle: { fontSize: 11, fontWeight: 700, color: "#334155" },
        },
        {
          top: "35.5%",
          left: 75,
          data: ["Over drawal (Adverse)", "Under drawal (Helping Grid)"],
          textStyle: { fontSize: 11, fontWeight: 700, color: "#334155" },
        },
      ],
      grid: [
        { left: 75, right: 35, top: 52, height: "24%" },
        { left: 75, right: 35, top: "38%", height: "24%" },
        { left: 75, right: 35, top: "69%", height: "17%" },
      ],
      xAxis: [
        {
          type: "category",
          gridIndex: 0,
          boundaryGap: false,
          data: timestamps,
          axisLabel: { show: false },
          axisTick: { show: false },
          axisLine: { lineStyle: { color: "#94A3B8" } },
        },
        {
          type: "category",
          gridIndex: 1,
          boundaryGap: false,
          data: timestamps,
          axisLabel: { show: false },
          axisTick: { show: false },
          axisLine: { lineStyle: { color: "#94A3B8" } },
        },
        {
          type: "category",
          gridIndex: 2,
          boundaryGap: false,
          data: timestamps,
          axisLabel: {
            show: true,
            fontSize: 10,
            formatter: (t) => t.slice(11, 16),
          },
          axisTick: { show: true },
          axisLine: { lineStyle: { color: "#94A3B8" } },
        },
      ],
      yAxis: [
        {
          type: "value",
          gridIndex: 0,
          name: "Drawal (MW)",
          nameTextStyle: { fontWeight: 800, color: "#0F172A", fontSize: 11 },
          axisLabel: { fontSize: 10 },
          splitLine: { lineStyle: { color: "#E2E8F0", type: "dashed" } },
        },
        {
          type: "value",
          gridIndex: 1,
          name: "Deviation (MW)",
          nameTextStyle: { fontWeight: 800, color: "#0F172A", fontSize: 11 },
          axisLabel: { fontSize: 10 },
          splitLine: { lineStyle: { color: "#E2E8F0", type: "dashed" } },
        },
        {
          type: "value",
          gridIndex: 2,
          name: "Frequency (Hz)",
          nameTextStyle: { fontWeight: 800, color: "#7C3AED", fontSize: 11 },
          scale: true,
          min: 49.4,
          max: 50.35,
          axisLabel: { fontSize: 10, color: "#7C3AED", formatter: (v) => v.toFixed(2) },
          splitLine: { lineStyle: { color: "#E2E8F0", type: "dashed" } },
        },
      ],
      dataZoom: [
        {
          type: "inside",
          xAxisIndex: [0, 1, 2],
          start: 0,
          end: defaultEndPct,
        },
        {
          type: "slider",
          xAxisIndex: [0, 1, 2],
          bottom: 8,
          height: 20,
          start: 0,
          end: defaultEndPct,
        },
      ],
      series: [
        // PANEL 1: Drawal (MW)
        {
          name: "Schedule (MW)",
          type: "line",
          xAxisIndex: 0,
          yAxisIndex: 0,
          data: schedule,
          step: "end",
          showSymbol: false,
          lineStyle: { width: 2.2, color: "#4F46E5" },
          itemStyle: { color: "#4F46E5" },
          markArea: { silent: true, data: markAreaData },
        },
        {
          name: "Actual drawal (MW)",
          type: "line",
          xAxisIndex: 0,
          yAxisIndex: 0,
          data: actual,
          showSymbol: false,
          lineStyle: { width: 2.2, color: "#059669" },
          itemStyle: { color: "#059669" },
        },

        // PANEL 2: Deviation (MW)
        {
          name: "Over drawal (Adverse)",
          type: "line",
          xAxisIndex: 1,
          yAxisIndex: 1,
          data: overDrawal,
          showSymbol: false,
          lineStyle: { width: 0 },
          itemStyle: { color: "#D97706" },
          areaStyle: { color: "rgba(234, 179, 8, 0.38)", origin: 0 },
          markArea: { silent: true, data: markAreaData },
        },
        {
          name: "Under drawal (Helping Grid)",
          type: "line",
          xAxisIndex: 1,
          yAxisIndex: 1,
          data: underDrawal,
          showSymbol: false,
          lineStyle: { width: 0 },
          itemStyle: { color: "#0284C7" },
          areaStyle: { color: "rgba(6, 182, 212, 0.35)", origin: 0 },
        },
        {
          name: "Deviation (MW)",
          type: "line",
          xAxisIndex: 1,
          yAxisIndex: 1,
          data: deviation,
          showSymbol: false,
          lineStyle: { width: 1.6, color: "#059669" },
          itemStyle: { color: "#059669" },
          markLine: {
            silent: true,
            symbol: "none",
            data: [{ yAxis: 0 }],
            lineStyle: { color: "#17365D", width: 1.5 },
          },
        },
        {
          name: "CRMS Violation Messages",
          type: "scatter",
          xAxisIndex: 1,
          yAxisIndex: 1,
          data: crmsPoints,
          symbol: CRMS_SYMBOL,
          symbolSize: 22,
          itemStyle: {
            borderColor: "#FFFFFF",
            borderWidth: 1.5,
            shadowColor: "rgba(0,0,0,0.3)",
            shadowBlur: 6,
          },
          emphasis: { scale: 1.4 },
          z: 15,
        },
        {
          name: "Physical Regulation (Line)",
          type: "scatter",
          xAxisIndex: 1,
          yAxisIndex: 1,
          data: transPoints,
          symbol: TOWER_SYMBOL,
          symbolSize: 24,
          itemStyle: {
            color: "#0F172A",
            borderColor: "#FACC15",
            borderWidth: 1.5,
            shadowColor: "rgba(250,204,21,0.8)",
            shadowBlur: 8,
          },
          emphasis: { scale: 1.45 },
          z: 16,
        },

        // PANEL 3: Frequency (Hz)
        {
          name: "Frequency (Hz)",
          type: "line",
          xAxisIndex: 2,
          yAxisIndex: 2,
          data: frequency,
          showSymbol: false,
          lineStyle: { width: 1.8, color: "#7C3AED" },
          itemStyle: { color: "#7C3AED" },
          markLine: {
            silent: true,
            symbol: "none",
            data: [
              {
                yAxis: 50.05,
                lineStyle: { color: "#D97706", type: "dotted", width: 1 },
                label: { formatter: "50.05", position: "insideStartTop" },
              },
              {
                yAxis: 49.9,
                lineStyle: { color: "#DC2626", type: "dashed", width: 1.5 },
                label: { formatter: "49.90", position: "insideStartTop" },
              },
              {
                yAxis: 49.5,
                lineStyle: { color: "#991B1B", type: "dashed", width: 1.5 },
                label: { formatter: "49.50", position: "insideStartTop" },
              },
            ],
          },
          markArea: { silent: true, data: markAreaData },
        },
      ],
    };
  }, [data, selectedState, timestamps, totalPoints]);

  // Initial calculation of footnote
  useEffect(() => {
    if (totalPoints > 0) {
      calculateFootnote(0, Math.min(2880, totalPoints) - 1);
    }
  }, [selectedState, data, totalPoints]);

  const handleDataZoom = (evt) => {
    const inst = echartsRef.current?.getEchartsInstance();
    if (!inst) return;
    const opt = inst.getOption();
    const dz = opt.dataZoom?.[0];
    if (!dz) return;
    let sIdx = 0;
    let eIdx = totalPoints - 1;
    if (dz.startValue != null && dz.endValue != null) {
      sIdx = dz.startValue;
      eIdx = dz.endValue;
    } else if (dz.start != null && dz.end != null) {
      sIdx = Math.floor((dz.start / 100) * totalPoints);
      eIdx = Math.ceil((dz.end / 100) * totalPoints);
    }
    calculateFootnote(sIdx, eIdx);
  };

  const handleDateJump = (dt) => {
    setSelectedDate(dt);
    if (!dt) return;
    const idx = timestamps.findIndex((t) => t.startsWith(dt));
    if (idx >= 0 && echartsRef.current) {
      const inst = echartsRef.current.getEchartsInstance();
      const pointsIn2Days = Math.min(2880, totalPoints - idx);
      inst.dispatchAction({
        type: "dataZoom",
        startValue: idx,
        endValue: idx + pointsIn2Days - 1,
      });
      calculateFootnote(idx, idx + pointsIn2Days - 1);
    }
  };

  const handleEventChipClick = (ev, idx) => {
    setActiveChip(idx);
    const sIdx = Math.max(0, (ev.start_idx != null ? ev.start_idx : timestamps.indexOf(ev.start_time)) - 120);
    const eIdx = Math.min(
      totalPoints - 1,
      (ev.end_idx != null ? ev.end_idx : timestamps.indexOf(ev.end_time)) + 120
    );
    if (echartsRef.current) {
      const inst = echartsRef.current.getEchartsInstance();
      inst.dispatchAction({
        type: "dataZoom",
        startValue: sIdx,
        endValue: eIdx,
      });
      calculateFootnote(sIdx, eIdx);
    }
  };

  const handleResetZoom = () => {
    setActiveChip(null);
    setSelectedDate("");
    if (echartsRef.current) {
      const inst = echartsRef.current.getEchartsInstance();
      const twoDays = Math.min(2880, totalPoints);
      inst.dispatchAction({
        type: "dataZoom",
        startValue: 0,
        endValue: twoDays - 1,
      });
      calculateFootnote(0, twoDays - 1);
    }
  };

  const handleDownloadVisibleWindow = () => {
    if (!echartsRef.current) return;
    const inst = echartsRef.current.getEchartsInstance();
    const dataUrl = inst.getDataURL({
      pixelRatio: 3,
      backgroundColor: "#FFFFFF",
      excludeComponents: ["dataZoom"],
    });

    const opt = inst.getOption();
    const dz = opt.dataZoom?.[0];
    let startTs = (timestamps[0] || "").slice(0, 10);
    if (dz?.startValue != null && timestamps[dz.startValue]) {
      startTs = timestamps[dz.startValue].slice(0, 10);
    }

    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${selectedState.replace(/[^A-Za-z0-9_-]+/g, "_")}_Drawal_vs_Frequency_${startTs}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Slotting Action Handlers
  const handleSetAutoMode = () => {
    setSlotMode("auto");
    const autoDips = candidateDips.filter((d) => d.auto_qualified);
    const chosen = autoDips.length ? autoDips : candidateDips.slice(0, 3);
    setActiveSlots(chosen);
    setSelectedDipIds(new Set(autoDips.map((d) => d.id)));
    if (data) {
      setEventCharts(buildEventChartsFromSlots(chosen, data));
    }
  };

  const handleOpenSelectModal = () => {
    setSelectModalOpen(true);
  };

  const handleToggleDipSelect = (id) => {
    setSelectedDipIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAllAuto = () => {
    const autoIds = candidateDips.filter((d) => d.auto_qualified).map((d) => d.id);
    setSelectedDipIds(new Set(autoIds));
  };

  const handleSelectAllDips = () => {
    setSelectedDipIds(new Set(candidateDips.map((d) => d.id)));
  };

  const handleClearDipSelections = () => {
    setSelectedDipIds(new Set());
  };

  const handleApplyDipsSelection = () => {
    const chosen = candidateDips.filter((d) => selectedDipIds.has(d.id));
    if (!chosen.length) {
      alert("Please select at least one frequency dip.");
      return;
    }
    setSlotMode("select");
    setActiveSlots(chosen);
    if (data) {
      setEventCharts(buildEventChartsFromSlots(chosen, data));
    }
    setSelectModalOpen(false);
  };

  const handleOpenManualModal = () => {
    if (!manualDate && uniqueDates.length) {
      setManualDate(uniqueDates[0]);
    }
    setManualError("");
    setManualModalOpen(true);
  };

  const handleAddManualSlot = () => {
    setManualError("");
    if (!manualDate) {
      setManualError("Please select a date.");
      return;
    }
    if (!manualStartTime || !manualEndTime) {
      setManualError("Please enter both start and end time.");
      return;
    }
    if (manualStartTime >= manualEndTime) {
      setManualError("Start time must be before end time.");
      return;
    }
    const newSlot = {
      id: `manual-${Date.now()}-${manualSlots.length + 1}`,
      date: manualDate,
      start_time: `${manualDate} ${manualStartTime}`,
      end_time: `${manualDate} ${manualEndTime}`,
      label:
        manualLabel.trim() ||
        `Manual Event #${manualSlots.length + 1} (${manualDate.slice(5)} ${manualStartTime}–${manualEndTime})`,
    };
    setManualSlots((prev) => [...prev, newSlot]);
    setManualLabel("");
  };

  const handleDeleteManualSlot = (id) => {
    setManualSlots((prev) => prev.filter((s) => s.id !== id));
  };

  const handleApplyManualSlots = () => {
    if (!manualSlots.length) {
      setManualError("Please add at least one manual slot before applying.");
      return;
    }
    setSlotMode("manual");
    setActiveSlots(manualSlots);
    if (data) {
      setEventCharts(buildEventChartsFromSlots(manualSlots, data));
    }
    setManualModalOpen(false);
  };

  // Filter discrete event charts
  const filteredEventCharts = useMemo(() => {
    return eventCharts.filter((e) => {
      if (discreteStateFilter !== "ALL" && e.state !== discreteStateFilter) return false;
      if (discreteEventFilter !== "ALL" && String(e.event_index) !== discreteEventFilter) return false;
      return true;
    });
  }, [eventCharts, discreteStateFilter, discreteEventFilter]);

  const discreteSlots = useMemo(() => {
    return [...new Set(eventCharts.map((e) => e.event_index))].sort((a, b) => a - b);
  }, [eventCharts]);

  if (loading) {
    return (
      <Paper variant="outlined" sx={{ p: 5, textAlign: "center", borderRadius: 2, mt: 2 }}>
        <CircularProgress size={32} />
        <Typography sx={{ mt: 1.5, fontSize: 13, color: "#64748B", fontWeight: 700 }}>
          Generating continuous 3-panel drawal vs frequency curves & event mappings…
        </Typography>
      </Paper>
    );
  }

  if (error) {
    return (
      <Alert severity="warning" sx={{ mt: 2 }}>
        {error}
      </Alert>
    );
  }

  return (
    <Box sx={{ mt: 2 }}>
      {/* 3.1 Continuous End-to-End Multi-Panel Card */}
      <Paper
        variant="outlined"
        sx={{
          borderRadius: 2.5,
          overflow: "hidden",
          border: "1px solid #CBD5E1",
          boxShadow: "0 4px 14px rgba(15,23,42,0.04)",
          mb: 4,
        }}
      >
        {/* Header Bar */}
        <Box
          sx={{
            p: 2,
            bgcolor: "#F8FAFC",
            borderBottom: "1px solid #E2E8F0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 2,
          }}
        >
          <Box>
            <Typography sx={{ fontSize: 16, fontWeight: 900, color: "#17365D" }}>
              {selectedState}: schedule, actual drawal and over drawal vs frequency
            </Typography>
            <Typography sx={{ fontSize: 11.5, color: "#64748B" }}>
              Continuous 1-minute SCADA data · 2-day scrollable window by default · Shaded zones: f ≤ 49.90 Hz
            </Typography>
          </Box>

          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <TextField
              select
              size="small"
              label="State"
              value={selectedState}
              onChange={(e) => setSelectedState(e.target.value)}
              sx={{ minWidth: 140, bgcolor: "white" }}
            >
              {statesList.map((st) => (
                <MenuItem key={st} value={st}>
                  {st}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              select
              size="small"
              label="Jump to Date"
              value={selectedDate}
              onChange={(e) => handleDateJump(e.target.value)}
              sx={{ minWidth: 150, bgcolor: "white" }}
            >
              <MenuItem value="">Select Date...</MenuItem>
              {uniqueDates.map((dt) => (
                <MenuItem key={dt} value={dt}>
                  {dt}
                </MenuItem>
              ))}
            </TextField>

            <Button
              size="small"
              variant="outlined"
              startIcon={<RotateCcw size={14} />}
              onClick={handleResetZoom}
              sx={{ textTransform: "none", fontWeight: 700 }}
            >
              2-Day View
            </Button>

            <Button
              size="small"
              variant="contained"
              startIcon={<Download size={14} />}
              onClick={handleDownloadVisibleWindow}
              sx={{
                bgcolor: "#17365D",
                "&:hover": { bgcolor: "#0F233D" },
                textTransform: "none",
                fontWeight: 700,
              }}
            >
              Download Visible Window (PNG)
            </Button>
          </Stack>
        </Box>

        {/* Frequency Overview & Event Selection Chips Bar */}
        <Box
          sx={{
            px: 2,
            py: 1,
            bgcolor: "#F1F5F9",
            borderBottom: "1px solid #E2E8F0",
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            overflowX: "auto",
          }}
        >
          <Typography
            sx={{
              fontSize: 11.5,
              fontWeight: 800,
              color: "#17365D",
              whiteSpace: "nowrap",
              display: "flex",
              alignItems: "center",
              gap: 0.5,
            }}
          >
            <Zap size={14} color="#EA580C" /> Frequency overview &amp; event selection:
          </Typography>
          <Stack direction="row" spacing={1} sx={{ overflowX: "auto", py: 0.5 }}>
            {detectedEvents.length === 0 ? (
              <Typography sx={{ fontSize: 11, color: "#64748B", fontStyle: "italic" }}>
                No critical frequency dips (&lt;49.75 Hz or ≥4 min &lt;49.90 Hz) detected.
              </Typography>
            ) : (
              detectedEvents.map((ev, idx) => (
                <Chip
                  key={idx}
                  label={ev.label || `Dip #${idx + 1}: ${ev.start_time.slice(5, 16)} (Min ${ev.min_freq} Hz)`}
                  size="small"
                  clickable
                  color={activeChip === idx ? "error" : "default"}
                  variant={activeChip === idx ? "filled" : "outlined"}
                  onClick={() => handleEventChipClick(ev, idx)}
                  sx={{
                    fontWeight: 700,
                    fontSize: 11,
                    bgcolor: activeChip === idx ? "#DC2626" : "white",
                    borderColor: activeChip === idx ? "#DC2626" : "#CBD5E1",
                    "&:hover": { bgcolor: activeChip === idx ? "#B91C1C" : "#E2E8F0" },
                  }}
                />
              ))
            )}
          </Stack>
        </Box>

        {/* ECharts 3-Panel Visualizer */}
        {continuousChartOption && (
          <Box sx={{ p: 1, bgcolor: "#FFFFFF" }}>
            <ReactECharts
              ref={echartsRef}
              option={continuousChartOption}
              style={{ width: "100%", height: "640px" }}
              onEvents={{ datazoom: handleDataZoom }}
            />
          </Box>
        )}

        {/* Statistical Footnote Bar */}
        <Box
          sx={{
            p: 1.5,
            bgcolor: "#F8FAFC",
            borderTop: "1px solid #E2E8F0",
            display: "flex",
            alignItems: "center",
            gap: 2,
            fontSize: 11.5,
            color: "#334155",
            flexWrap: "wrap",
          }}
        >
          <Typography component="span" sx={{ fontSize: 11.5 }}>
            <strong style={{ color: "#DC2626" }}>Shaded</strong> = f ≤ 49.90 Hz.
          </Typography>
          <Typography component="span" sx={{ fontSize: 11.5 }}>
            <strong>Over drawing at f ≤ 49.90 Hz:</strong>{" "}
            <strong style={{ color: "#0F172A" }}>{visibleStats.odMinutes.toLocaleString()}</strong> of{" "}
            <strong style={{ color: "#0F172A" }}>{visibleStats.lowMinutes.toLocaleString()}</strong> min;
          </Typography>
          <Typography component="span" sx={{ fontSize: 11.5 }}>
            <strong>max over drawal at f ≤ 49.90 Hz:</strong>{" "}
            <strong style={{ color: "#DC2626" }}>{visibleStats.maxOd.toLocaleString()}</strong> MW
          </Typography>
          <Typography component="span" sx={{ ml: "auto", fontSize: 11, color: "#64748B", fontWeight: 700 }}>
            {visibleStats.rangeText}
          </Typography>
        </Box>
      </Paper>

      {/* 3.2 Discrete Event Detail Plots */}
      <Box sx={{ mb: 2 }}>
        {/* Title and Controls Header */}
        <Box sx={{ mb: 2 }}>
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="center"
            flexWrap="wrap"
            useFlexGap
            spacing={2}
            sx={{ mb: 1.5 }}
          >
            <Box>
              <Typography sx={{ fontSize: 16, fontWeight: 900, color: "#17365D" }}>
                3.2 Discrete Event Detail Plots &amp; Regulatory Breakup
              </Typography>
              <Typography sx={{ fontSize: 11.5, color: "#64748B" }}>
                Interactive dual-axis event curves with plotted CRMS violation messages and Physical Regulatory transmission line operations.
              </Typography>
            </Box>

            {/* Filter controls */}
            <Stack direction="row" spacing={1} alignItems="center">
              <TextField
                select
                size="small"
                label="Filter State"
                value={discreteStateFilter}
                onChange={(e) => setDiscreteStateFilter(e.target.value)}
                sx={{ minWidth: 150, bgcolor: "white" }}
              >
                <MenuItem value="ALL">All States</MenuItem>
                {statesList.map((st) => (
                  <MenuItem key={st} value={st}>
                    {st}
                  </MenuItem>
                ))}
              </TextField>

              <TextField
                select
                size="small"
                label="Filter Event"
                value={discreteEventFilter}
                onChange={(e) => setDiscreteEventFilter(e.target.value)}
                sx={{ minWidth: 140, bgcolor: "white" }}
              >
                <MenuItem value="ALL">All Events</MenuItem>
                {discreteSlots.map((s) => (
                  <MenuItem key={s} value={String(s)}>
                    Event {s}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>
          </Stack>

          {/* Event Selection & Slotting Modes Toolbar */}
          <Paper
            variant="outlined"
            sx={{
              p: 1.5,
              bgcolor: "#F8FAFC",
              borderRadius: 2,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 1.5,
              border: "1px solid #CBD5E1",
            }}
          >
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <Typography sx={{ fontSize: 12, fontWeight: 800, color: "#1E293B", mr: 0.5 }}>
                Event Slotting:
              </Typography>

              {/* 1. Auto Detect Button */}
              <Tooltip title="Auto detects frequency events: F < 49.90 Hz for > 15 min OR F < 49.50 Hz for > 5 min" arrow>
                <Button
                  size="small"
                  variant={slotMode === "auto" ? "contained" : "outlined"}
                  onClick={handleSetAutoMode}
                  startIcon={<Sparkles size={14} />}
                  sx={{
                    textTransform: "none",
                    fontWeight: 700,
                    fontSize: 12,
                    bgcolor: slotMode === "auto" ? "#059669" : "white",
                    borderColor: slotMode === "auto" ? "#047857" : "#CBD5E1",
                    color: slotMode === "auto" ? "white" : "#059669",
                    "&:hover": {
                      bgcolor: slotMode === "auto" ? "#047857" : "#ECFDF5",
                      borderColor: "#059669",
                    },
                  }}
                >
                  ⚡ Auto Detect ({candidateDips.filter((d) => d.auto_qualified).length})
                </Button>
              </Tooltip>

              {/* 2. Select from Frequency Dips Button */}
              <Tooltip title="View all detected frequency dips and check the events you want to plot" arrow>
                <Button
                  size="small"
                  variant={slotMode === "select" ? "contained" : "outlined"}
                  onClick={handleOpenSelectModal}
                  startIcon={<ListFilter size={14} />}
                  sx={{
                    textTransform: "none",
                    fontWeight: 700,
                    fontSize: 12,
                    bgcolor: slotMode === "select" ? "#2563EB" : "white",
                    borderColor: slotMode === "select" ? "#1D4ED8" : "#CBD5E1",
                    color: slotMode === "select" ? "white" : "#2563EB",
                    "&:hover": {
                      bgcolor: slotMode === "select" ? "#1D4ED8" : "#EFF6FF",
                      borderColor: "#2563EB",
                    },
                  }}
                >
                  📋 Select from Frequency Dips ({candidateDips.length})
                </Button>
              </Tooltip>

              {/* 3. Slot Manually Button */}
              <Tooltip title="Specify custom time slots (Date, Start Time, End Time, Label)" arrow>
                <Button
                  size="small"
                  variant={slotMode === "manual" ? "contained" : "outlined"}
                  onClick={handleOpenManualModal}
                  startIcon={<Plus size={14} />}
                  sx={{
                    textTransform: "none",
                    fontWeight: 700,
                    fontSize: 12,
                    bgcolor: slotMode === "manual" ? "#7C3AED" : "white",
                    borderColor: slotMode === "manual" ? "#6D28D9" : "#CBD5E1",
                    color: slotMode === "manual" ? "white" : "#7C3AED",
                    "&:hover": {
                      bgcolor: slotMode === "manual" ? "#6D28D9" : "#F5F3FF",
                      borderColor: "#7C3AED",
                    },
                  }}
                >
                  ➕ Slot Manually {manualSlots.length > 0 && `(${manualSlots.length})`}
                </Button>
              </Tooltip>
            </Stack>

            {/* Current Active Mode Status Pill */}
            <Chip
              size="small"
              label={
                slotMode === "auto"
                  ? `⚡ Auto Detect: ${activeSlots.length} Qualified (F<49.9 >15m or <49.5 >5m)`
                  : slotMode === "select"
                  ? `📋 Selected: ${activeSlots.length} of ${candidateDips.length} Dips`
                  : `➕ Manual Slots: ${activeSlots.length} Configured`
              }
              sx={{
                fontWeight: 800,
                fontSize: 11,
                bgcolor:
                  slotMode === "auto"
                    ? "#ECFDF5"
                    : slotMode === "select"
                    ? "#EFF6FF"
                    : "#F5F3FF",
                color:
                  slotMode === "auto"
                    ? "#065F46"
                    : slotMode === "select"
                    ? "#1E40AF"
                    : "#5B21B6",
                border: "1px solid",
                borderColor:
                  slotMode === "auto"
                    ? "#A7F3D0"
                    : slotMode === "select"
                    ? "#BFDBFE"
                    : "#DDD6FE",
              }}
            />
          </Paper>
        </Box>

        {filteredEventCharts.length === 0 ? (
          <Paper variant="outlined" sx={{ p: 4, textAlign: "center", borderRadius: 2 }}>
            <Typography sx={{ color: "#64748B", fontSize: 13 }}>
              No discrete event curves matching the selected filter.
            </Typography>
          </Paper>
        ) : (
          <Stack spacing={2}>
            {filteredEventCharts.map((event, idx) => {
              const isOpen = openCards[event.event_id] !== false;
              const timestamps = event.series?.timestamps || [];
              const deviation = event.series?.deviation || [];
              const frequency = event.series?.frequency || [];

              let maxOd = -Infinity;
              let maxOdIdx = -1;
              let lowestFreq = Infinity;
              let lowestFreqIdx = -1;

              deviation.forEach((val, i) => {
                if (val != null && val > maxOd) {
                  maxOd = val;
                  maxOdIdx = i;
                }
              });
              frequency.forEach((val, i) => {
                if (val != null && val < lowestFreq) {
                  lowestFreq = val;
                  lowestFreqIdx = i;
                }
              });

              const odAtLowestFreq = lowestFreqIdx >= 0 ? deviation[lowestFreqIdx] : null;
              const crmsCount = (event.crms_messages || []).length;
              const regCount = (event.transmission_line_events || []).length;

              const maxDev = Math.max(100, ...deviation.filter((v) => v != null).map((v) => Math.abs(v)));
              const extent = Math.ceil(maxDev / 100) * 100;

              const positiveShade = deviation.map((v, i) => (frequency[i] < 49.9 && v != null && v > 0 ? v : 0));
              const negativeShade = deviation.map((v, i) => (frequency[i] < 49.9 && v != null && v < 0 ? v : 0));
              const freqDipArea = frequency.map((f) => (f != null && f < 49.9 ? f : 49.9));

              const crmsSeriesList = [];
              const crmsGroups = new Map();
              (event.crms_messages || []).forEach((m, mIdx) => {
                const mTs = (m.timestamp || m.message_date || "").slice(11, 16);
                const nearestIdx = timestamps.map((t) => t.slice(11, 16)).indexOf(mTs);
                const cat = crmsCategory(m);
                if (!crmsGroups.has(cat)) crmsGroups.set(cat, []);
                const yVal =
                  nearestIdx >= 0
                    ? (deviation[nearestIdx] ?? 0) + ((mIdx % 5) - 2) * Math.max(extent * 0.03, 10)
                    : 0;
                crmsGroups.get(cat).push({
                  value: [mTs, yVal],
                  crms: m,
                });
              });

              Array.from(crmsGroups.entries()).forEach(([cat, points]) => {
                crmsSeriesList.push({
                  name: `CRMS: ${cat}`,
                  type: "scatter",
                  yAxisIndex: 0,
                  data: points,
                  symbol: CRMS_SYMBOL,
                  symbolSize: 22,
                  itemStyle: {
                    color: crmsColor({ category: cat }),
                    borderColor: "#FFFFFF",
                    borderWidth: 1.5,
                    shadowColor: "rgba(0,0,0,0.3)",
                    shadowBlur: 6,
                  },
                  emphasis: { scale: 1.4 },
                  z: 20,
                });
              });

              const transMarkers = [];
              (event.transmission_line_events || []).forEach((pe, eIdx) => {
                const peTs = (pe.timestamp || pe.outage_date_time || "").slice(11, 16);
                const nearestIdx = timestamps.map((t) => t.slice(11, 16)).indexOf(peTs);
                const yVal =
                  nearestIdx >= 0
                    ? (deviation[nearestIdx] ?? 0) + ((eIdx % 4) - 1.5) * Math.max(extent * 0.035, 12)
                    : 0;
                transMarkers.push({
                  value: [peTs, yVal],
                  transmission: pe,
                });
              });

              const transSeries = transMarkers.length
                ? [
                    {
                      name: "Physical Regulation (Line)",
                      type: "scatter",
                      yAxisIndex: 0,
                      data: transMarkers,
                      symbol: TOWER_SYMBOL,
                      symbolSize: 24,
                      itemStyle: {
                        color: "#0F172A",
                        borderColor: "#FACC15",
                        borderWidth: 1.5,
                        shadowColor: "rgba(250,204,21,0.8)",
                        shadowBlur: 8,
                      },
                      emphasis: { scale: 1.45 },
                      z: 22,
                    },
                  ]
                : [];

              const cardChartOption = {
                animation: false,
                tooltip: {
                  trigger: "axis",
                  axisPointer: { type: "cross" },
                  formatter: (params) => {
                    const list = Array.isArray(params) ? params : [params];
                    const msgParam = list.find((item) => item.data && item.data.crms);
                    if (msgParam) return formatCrmsTooltip(msgParam.data.crms);
                    const transParam = list.find((item) => item.data && item.data.transmission);
                    if (transParam) return formatTransmissionTooltip(transParam.data.transmission);
                    let html = `<div style="font-size:12px;font-weight:800;margin-bottom:5px;color:#17365D;">${
                      list[0]?.axisValue || ""
                    }</div>`;
                    list.forEach((item) => {
                      if (
                        item.value == null ||
                        item.seriesName.includes("Overdrawal") ||
                        item.seriesName.includes("Helping Grid") ||
                        item.seriesName.includes("CRMS:") ||
                        item.seriesName.includes("Physical Regulation")
                      )
                        return;
                      const value = Array.isArray(item.value) ? item.value[1] : item.value;
                      html += `<div>${item.marker} ${item.seriesName}: <strong>${Number(value).toFixed(
                        item.seriesName.includes("Frequency") ? 3 : 1
                      )}</strong></div>`;
                    });
                    return html;
                  },
                },
                legend: { top: 4, textStyle: { fontSize: 11, fontWeight: 700 } },
                grid: { top: 45, left: 65, right: 65, bottom: 55 },
                dataZoom: [{ type: "inside" }, { type: "slider", height: 20, bottom: 10 }],
                xAxis: {
                  type: "category",
                  boundaryGap: false,
                  data: timestamps.map((t) => t.slice(11, 16)),
                  axisLabel: { fontSize: 10 },
                },
                yAxis: [
                  {
                    type: "value",
                    name: "Deviation (MW)",
                    min: -extent,
                    max: extent,
                    axisLabel: { fontSize: 10 },
                  },
                  {
                    type: "value",
                    name: "Frequency (Hz)",
                    min: 49.4,
                    max: 50.6,
                    position: "right",
                    axisLabel: { fontSize: 10, color: "#7C3AED" },
                    nameTextStyle: { color: "#7C3AED" },
                  },
                ],
                series: [
                  {
                    name: "Overdrawal (f < 49.9 Hz)",
                    type: "line",
                    data: positiveShade,
                    yAxisIndex: 0,
                    symbol: "none",
                    lineStyle: { width: 0 },
                    areaStyle: { color: "rgba(234,179,8,0.35)", origin: 0 },
                  },
                  {
                    name: "Helping Grid (f < 49.9 Hz)",
                    type: "line",
                    data: negativeShade,
                    yAxisIndex: 0,
                    symbol: "none",
                    lineStyle: { width: 0 },
                    areaStyle: { color: "rgba(6,182,212,0.30)", origin: 0 },
                  },
                  {
                    name: `${event.state} Deviation`,
                    type: "line",
                    data: deviation,
                    yAxisIndex: 0,
                    symbol: "none",
                    lineStyle: { width: 2.5, color: "#059669" },
                  },
                  {
                    name: "Frequency Dip (<49.90 Hz)",
                    type: "line",
                    data: freqDipArea,
                    yAxisIndex: 1,
                    symbol: "none",
                    lineStyle: { width: 0 },
                    areaStyle: { color: "rgba(220, 38, 38, 0.28)", origin: 49.9 },
                    z: 1,
                  },
                  {
                    name: "Frequency (Hz)",
                    type: "line",
                    data: frequency,
                    yAxisIndex: 1,
                    symbol: "none",
                    lineStyle: { width: 2, color: "#7C3AED" },
                    markLine: {
                      silent: true,
                      symbol: "none",
                      data: [
                        { yAxis: 49.9, lineStyle: { color: "#DC2626", type: "dashed" }, label: { formatter: "49.90 Hz" } },
                        { yAxis: 49.7, lineStyle: { color: "#EA580C", type: "dashed" }, label: { formatter: "49.70 Hz" } },
                        { yAxis: 49.5, lineStyle: { color: "#991B1B", type: "dashed" }, label: { formatter: "49.50 Hz" } },
                      ],
                    },
                  },
                  ...crmsSeriesList,
                  ...transSeries,
                ],
              };

              return (
                <Paper key={event.event_id || idx} variant="outlined" sx={{ borderRadius: 2, overflow: "hidden" }}>
                  <Box
                    onClick={() =>
                      setOpenCards((prev) => ({
                        ...prev,
                        [event.event_id]: !isOpen,
                      }))
                    }
                    sx={{
                      p: 1.5,
                      bgcolor: "#F8FAFC",
                      cursor: "pointer",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      borderBottom: isOpen ? "1px solid #E2E8F0" : "none",
                    }}
                  >
                    <Stack direction="row" spacing={1} alignItems="center">
                      <IconButton size="small">
                        {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                      </IconButton>
                      <Typography sx={{ fontSize: 13.5, fontWeight: 800, color: "#17365D" }}>
                        {event.state} — {event.event_name}
                      </Typography>
                    </Stack>
                    <Typography sx={{ fontSize: 11, color: "#64748B", fontWeight: 700 }}>
                      {event.start_time} to {event.end_time}
                    </Typography>
                  </Box>

                  <Collapse in={isOpen}>
                    <Box sx={{ p: 2 }}>
                      <Box
                        sx={{
                          display: "grid",
                          gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" },
                          gap: 1.5,
                          mb: 2,
                        }}
                      >
                        <Paper variant="outlined" sx={{ p: 1.2, bgcolor: "#F8FAFC", borderRadius: 1.5 }}>
                          <Typography sx={{ fontSize: 10, color: "#64748B", textTransform: "uppercase", fontWeight: 700 }}>
                            Maximum OD
                          </Typography>
                          <Typography sx={{ fontSize: 16, fontWeight: 900, color: "#0F172A" }}>
                            {maxOdIdx >= 0 ? `${maxOd.toFixed(0)} MW` : "—"}
                          </Typography>
                          <Typography sx={{ fontSize: 10.5, color: "#64748B" }}>
                            {maxOdIdx >= 0 ? timestamps[maxOdIdx]?.slice(11, 19) : "-"}
                          </Typography>
                        </Paper>

                        <Paper variant="outlined" sx={{ p: 1.2, bgcolor: "#F8FAFC", borderRadius: 1.5 }}>
                          <Typography sx={{ fontSize: 10, color: "#64748B", textTransform: "uppercase", fontWeight: 700 }}>
                            OD at Lowest Frequency
                          </Typography>
                          <Typography sx={{ fontSize: 16, fontWeight: 900, color: "#0F172A" }}>
                            {odAtLowestFreq != null ? `${odAtLowestFreq.toFixed(0)} MW` : "—"}
                          </Typography>
                          <Typography sx={{ fontSize: 10.5, color: "#64748B" }}>
                            {lowestFreqIdx >= 0 ? `${lowestFreq.toFixed(3)} Hz` : "-"}
                          </Typography>
                        </Paper>

                        <Paper variant="outlined" sx={{ p: 1.2, bgcolor: "#F8FAFC", borderRadius: 1.5 }}>
                          <Typography sx={{ fontSize: 10, color: "#64748B", textTransform: "uppercase", fontWeight: 700 }}>
                            CRMS Messages
                          </Typography>
                          <Typography sx={{ fontSize: 16, fontWeight: 900, color: "#0F172A" }}>
                            {crmsCount}
                          </Typography>
                          <Typography sx={{ fontSize: 10.5, color: "#64748B" }}>Violation notices mapped</Typography>
                        </Paper>

                        <Paper variant="outlined" sx={{ p: 1.2, bgcolor: "#F8FAFC", borderRadius: 1.5 }}>
                          <Typography sx={{ fontSize: 10, color: "#64748B", textTransform: "uppercase", fontWeight: 700 }}>
                            Physical Regulations
                          </Typography>
                          <Typography sx={{ fontSize: 16, fontWeight: 900, color: "#0F172A" }}>
                            {regCount}
                          </Typography>
                          <Typography sx={{ fontSize: 10.5, color: "#64748B" }}>Transmission line actions</Typography>
                        </Paper>
                      </Box>

                      <ReactECharts option={cardChartOption} style={{ width: "100%", height: "460px" }} />
                    </Box>
                  </Collapse>
                </Paper>
              );
            })}
          </Stack>
        )}
      </Box>

      {/* DIALOG 1: Select Frequency Events from Uploaded Dataset */}
      <Dialog
        open={selectModalOpen}
        onClose={() => setSelectModalOpen(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { borderRadius: 2.5 } }}
      >
        <DialogTitle sx={{ pb: 1, bgcolor: "#F8FAFC", borderBottom: "1px solid #E2E8F0" }}>
          <Typography sx={{ fontSize: 17, fontWeight: 900, color: "#17365D", display: "flex", alignItems: "center", gap: 1 }}>
            <ListFilter size={20} color="#2563EB" /> Select Frequency Events from Uploaded SCADA Data
          </Typography>
          <Typography sx={{ fontSize: 12, color: "#64748B", mt: 0.5 }}>
            Check the frequency events you want to generate in Section 3.2. Auto-detection rule marks dips with F &lt; 49.90 Hz for &gt; 15 min OR F &lt; 49.50 Hz for &gt; 5 min.
          </Typography>
        </DialogTitle>

        <DialogContent sx={{ p: 2 }}>
          {/* Quick Action Toolbar */}
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 1.5,
              my: 1.5,
              p: 1.2,
              bgcolor: "#F1F5F9",
              borderRadius: 1.5,
            }}
          >
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <Button
                size="small"
                variant="contained"
                onClick={handleSelectAllAuto}
                startIcon={<Sparkles size={14} />}
                sx={{
                  bgcolor: "#059669",
                  "&:hover": { bgcolor: "#047857" },
                  textTransform: "none",
                  fontWeight: 700,
                  fontSize: 11.5,
                }}
              >
                Select Auto-Qualified ({candidateDips.filter((d) => d.auto_qualified).length})
              </Button>

              <Button
                size="small"
                variant="outlined"
                onClick={handleSelectAllDips}
                sx={{ textTransform: "none", fontWeight: 700, fontSize: 11.5 }}
              >
                Select All ({candidateDips.length})
              </Button>

              <Button
                size="small"
                variant="outlined"
                color="inherit"
                onClick={handleClearDipSelections}
                sx={{ textTransform: "none", fontWeight: 700, fontSize: 11.5 }}
              >
                Clear All
              </Button>
            </Stack>

            <Chip
              size="small"
              label={`${selectedDipIds.size} of ${candidateDips.length} events selected`}
              color={selectedDipIds.size > 0 ? "primary" : "default"}
              sx={{ fontWeight: 800, fontSize: 11 }}
            />
          </Box>

          {/* Dips Table */}
          <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 420, borderRadius: 1.5 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox" sx={{ bgcolor: "#F8FAFC", fontWeight: 800 }}></TableCell>
                  <TableCell sx={{ bgcolor: "#F8FAFC", fontWeight: 800, fontSize: 11.5 }}>#</TableCell>
                  <TableCell sx={{ bgcolor: "#F8FAFC", fontWeight: 800, fontSize: 11.5 }}>Date</TableCell>
                  <TableCell sx={{ bgcolor: "#F8FAFC", fontWeight: 800, fontSize: 11.5 }}>Time Window (IST)</TableCell>
                  <TableCell sx={{ bgcolor: "#F8FAFC", fontWeight: 800, fontSize: 11.5 }}>Duration</TableCell>
                  <TableCell sx={{ bgcolor: "#F8FAFC", fontWeight: 800, fontSize: 11.5 }}>Lowest Freq</TableCell>
                  <TableCell sx={{ bgcolor: "#F8FAFC", fontWeight: 800, fontSize: 11.5 }}>Time &lt; 49.50 Hz</TableCell>
                  <TableCell sx={{ bgcolor: "#F8FAFC", fontWeight: 800, fontSize: 11.5 }}>Qualification Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {candidateDips.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 4, color: "#64748B" }}>
                      No frequency dips below 49.90 Hz detected in the current dataset.
                    </TableCell>
                  </TableRow>
                ) : (
                  candidateDips.map((dip, idx) => {
                    const isSelected = selectedDipIds.has(dip.id);
                    return (
                      <TableRow
                        key={dip.id}
                        hover
                        onClick={() => handleToggleDipSelect(dip.id)}
                        sx={{
                          cursor: "pointer",
                          bgcolor: isSelected
                            ? "rgba(37, 99, 235, 0.05)"
                            : dip.auto_qualified
                            ? "rgba(5, 150, 105, 0.03)"
                            : "inherit",
                        }}
                      >
                        <TableCell padding="checkbox">
                          <Checkbox
                            checked={isSelected}
                            size="small"
                            onChange={() => handleToggleDipSelect(dip.id)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </TableCell>
                        <TableCell sx={{ fontSize: 11.5, fontWeight: 700 }}>{idx + 1}</TableCell>
                        <TableCell sx={{ fontSize: 11.5, fontWeight: 700 }}>{dip.date}</TableCell>
                        <TableCell sx={{ fontSize: 11.5, fontWeight: 800, color: "#17365D" }}>
                          {dip.time_window}
                        </TableCell>
                        <TableCell sx={{ fontSize: 11.5, fontWeight: 700 }}>{dip.duration_min} min</TableCell>
                        <TableCell sx={{ fontSize: 11.5 }}>
                          <span
                            style={{
                              fontWeight: 900,
                              color: dip.min_freq < 49.5 ? "#DC2626" : dip.min_freq < 49.7 ? "#EA580C" : "#7C3AED",
                            }}
                          >
                            {dip.min_freq.toFixed(3)} Hz
                          </span>
                        </TableCell>
                        <TableCell sx={{ fontSize: 11.5, fontWeight: 700, color: dip.c495_min > 0 ? "#DC2626" : "#64748B" }}>
                          {dip.c495_min > 0 ? `${dip.c495_min} min` : "—"}
                        </TableCell>
                        <TableCell sx={{ fontSize: 11 }}>
                          {dip.auto_qualified ? (
                            <Chip
                              size="small"
                              label={dip.qualification_reason || "✓ Auto-Qualified"}
                              sx={{
                                bgcolor: "#ECFDF5",
                                color: "#065F46",
                                fontWeight: 800,
                                fontSize: 10.5,
                                border: "1px solid #A7F3D0",
                              }}
                            />
                          ) : (
                            <Chip
                              size="small"
                              label={`Dip < 49.90 (${dip.duration_min}m)`}
                              sx={{
                                bgcolor: "#F1F5F9",
                                color: "#475569",
                                fontWeight: 600,
                                fontSize: 10.5,
                                border: "1px solid #CBD5E1",
                              }}
                            />
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>

        <DialogActions sx={{ p: 2, bgcolor: "#F8FAFC", borderTop: "1px solid #E2E8F0" }}>
          <Button onClick={() => setSelectModalOpen(false)} sx={{ textTransform: "none", fontWeight: 700 }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleApplyDipsSelection}
            disabled={selectedDipIds.size === 0}
            sx={{
              bgcolor: "#2563EB",
              "&:hover": { bgcolor: "#1D4ED8" },
              textTransform: "none",
              fontWeight: 800,
              px: 2.5,
            }}
          >
            Apply Selection ({selectedDipIds.size} Events)
          </Button>
        </DialogActions>
      </Dialog>

      {/* DIALOG 2: Manual Event Slotting */}
      <Dialog
        open={manualModalOpen}
        onClose={() => setManualModalOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 2.5 } }}
      >
        <DialogTitle sx={{ pb: 1, bgcolor: "#F8FAFC", borderBottom: "1px solid #E2E8F0" }}>
          <Typography sx={{ fontSize: 17, fontWeight: 900, color: "#17365D", display: "flex", alignItems: "center", gap: 1 }}>
            <Plus size={20} color="#7C3AED" /> Manual Event Slotting
          </Typography>
          <Typography sx={{ fontSize: 12, color: "#64748B", mt: 0.5 }}>
            Specify custom event time slots to plot state overdrawal vs frequency curves, mapped CRMS messages, and transmission line regulatory actions.
          </Typography>
        </DialogTitle>

        <DialogContent sx={{ p: 2 }}>
          {manualError && (
            <Alert severity="error" sx={{ mb: 2, fontSize: 12 }}>
              {manualError}
            </Alert>
          )}

          {/* Form to add a slot */}
          <Paper variant="outlined" sx={{ p: 2, bgcolor: "#FAF5FF", borderRadius: 2, border: "1px solid #E9D5FF", mb: 2 }}>
            <Typography sx={{ fontSize: 12.5, fontWeight: 800, color: "#5B21B6", mb: 1.5 }}>
              Add New Custom Slot
            </Typography>

            <Stack spacing={1.5}>
              <Stack direction="row" spacing={1.5} alignItems="center">
                <TextField
                  select
                  size="small"
                  label="Date"
                  value={manualDate}
                  onChange={(e) => setManualDate(e.target.value)}
                  sx={{ flex: 1, bgcolor: "white" }}
                >
                  {uniqueDates.map((d) => (
                    <MenuItem key={d} value={d}>
                      {d}
                    </MenuItem>
                  ))}
                </TextField>

                <TextField
                  size="small"
                  label="Start Time"
                  type="time"
                  value={manualStartTime}
                  onChange={(e) => setManualStartTime(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  inputProps={{ step: 60 }}
                  sx={{ width: 130, bgcolor: "white" }}
                />

                <TextField
                  size="small"
                  label="End Time"
                  type="time"
                  value={manualEndTime}
                  onChange={(e) => setManualEndTime(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  inputProps={{ step: 60 }}
                  sx={{ width: 130, bgcolor: "white" }}
                />
              </Stack>

              <Stack direction="row" spacing={1.5} alignItems="center">
                <TextField
                  size="small"
                  label="Event Label / Description (Optional)"
                  placeholder="e.g. Evening Peak Overdrawal or Line Trip"
                  value={manualLabel}
                  onChange={(e) => setManualLabel(e.target.value)}
                  sx={{ flex: 1, bgcolor: "white" }}
                />

                <Button
                  variant="contained"
                  onClick={handleAddManualSlot}
                  startIcon={<Plus size={15} />}
                  sx={{
                    bgcolor: "#7C3AED",
                    "&:hover": { bgcolor: "#6D28D9" },
                    textTransform: "none",
                    fontWeight: 800,
                    whiteSpace: "nowrap",
                  }}
                >
                  Add Slot
                </Button>
              </Stack>
            </Stack>
          </Paper>

          {/* Configured Slots List */}
          <Typography sx={{ fontSize: 13, fontWeight: 800, color: "#17365D", mb: 1 }}>
            Configured Manual Slots ({manualSlots.length})
          </Typography>

          {manualSlots.length === 0 ? (
            <Paper variant="outlined" sx={{ p: 3, textAlign: "center", borderRadius: 1.5, color: "#64748B" }}>
              <Typography sx={{ fontSize: 12 }}>
                No manual slots added yet. Fill out the date and times above and click <strong>&quot;Add Slot&quot;</strong>.
              </Typography>
            </Paper>
          ) : (
            <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 220, borderRadius: 1.5 }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: "#F8FAFC" }}>
                    <TableCell sx={{ fontWeight: 800, fontSize: 11 }}>#</TableCell>
                    <TableCell sx={{ fontWeight: 800, fontSize: 11 }}>Date</TableCell>
                    <TableCell sx={{ fontWeight: 800, fontSize: 11 }}>Time Window</TableCell>
                    <TableCell sx={{ fontWeight: 800, fontSize: 11 }}>Label</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 800, fontSize: 11 }}>Action</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {manualSlots.map((s, idx) => (
                    <TableRow key={s.id}>
                      <TableCell sx={{ fontSize: 11.5, fontWeight: 700 }}>{idx + 1}</TableCell>
                      <TableCell sx={{ fontSize: 11.5, fontWeight: 700 }}>{s.date}</TableCell>
                      <TableCell sx={{ fontSize: 11.5, fontWeight: 800, color: "#17365D" }}>
                        {s.start_time.slice(11, 16)} – {s.end_time.slice(11, 16)}
                      </TableCell>
                      <TableCell sx={{ fontSize: 11.5 }}>{s.label}</TableCell>
                      <TableCell align="right">
                        <IconButton size="small" color="error" onClick={() => handleDeleteManualSlot(s.id)}>
                          <Trash2 size={15} />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>

        <DialogActions sx={{ p: 2, bgcolor: "#F8FAFC", borderTop: "1px solid #E2E8F0" }}>
          <Button onClick={() => setManualModalOpen(false)} sx={{ textTransform: "none", fontWeight: 700 }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleApplyManualSlots}
            disabled={manualSlots.length === 0}
            sx={{
              bgcolor: "#7C3AED",
              "&:hover": { bgcolor: "#6D28D9" },
              textTransform: "none",
              fontWeight: 800,
              px: 2.5,
            }}
          >
            Apply Manual Slots ({manualSlots.length} Slots)
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

