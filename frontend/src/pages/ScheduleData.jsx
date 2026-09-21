import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  ListItemText,
  MenuItem,
  OutlinedInput,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import {
  Download,
  FileSpreadsheet,
  History,
  Maximize2,
  RefreshCw,
  Save,
  Send,
  Table2,
  X,
} from "lucide-react";
import ReactECharts from "echarts-for-react";
import { useLocation, useNavigate } from "react-router-dom";
import AppShell from "../components/layout/AppShell";
import RTGHistoricalDownload from "../components/rtg/RTGHistoricalDownload";
import API from "../services/api";
import { useAuth } from "../auth/AuthContext";

const isoYesterday = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
};
const tableSx = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: 620,
  "& th": {
    position: "sticky",
    top: 0,
    zIndex: 1,
    bgcolor: "#EAF2FF",
    color: "#003B82",
    p: 1,
    border: "1px solid #C9D9EE",
    textAlign: "left",
    fontSize: 12,
  },
  "& td": {
    p: 1,
    border: "1px solid #D7E4F6",
    color: "#0F172A",
    fontSize: 12,
    whiteSpace: "nowrap",
  },
};
const roundOne = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(1) : "";
};

function ScheduleDataHeader({ activeView, onViewChange }) {
  return (
    <>
      <Box
        sx={{
          mb: 1.5,
          p: 2.5,
          borderRadius: 3,
          color: "#fff",
          background:
            "linear-gradient(105deg,#07194F 0%,#0754B8 62%,#1186D4 100%)",
        }}
      >
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Box>
            <Typography sx={{ fontSize: 23, fontWeight: 900 }}>
              Schedule Data
            </Typography>
            <Typography sx={{ fontSize: 12, opacity: 0.9 }}>
              Schedule, actual, deviation and historical RTG data exports.
            </Typography>
          </Box>
          {activeView === "rtg" ? <History size={30} /> : <Table2 size={30} />}
        </Stack>
      </Box>
      <Paper
        component="nav"
        aria-label="Schedule data modules"
        elevation={0}
        sx={{
          mb: 2,
          p: 0.75,
          display: "flex",
          gap: 0.75,
          width: "fit-content",
          maxWidth: "100%",
          border: "1px solid #C9D9EE",
          borderRadius: 2.5,
        }}
      >
        <Button
          size="small"
          variant={activeView === "schedule" ? "contained" : "text"}
          startIcon={<Table2 size={16} />}
          onClick={() => onViewChange("schedule")}
          sx={{ fontWeight: 900, whiteSpace: "nowrap" }}
        >
          Schedule &amp; Actual
        </Button>
        <Button
          size="small"
          variant={activeView === "rtg" ? "contained" : "text"}
          startIcon={<History size={16} />}
          onClick={() => onViewChange("rtg")}
          sx={{ fontWeight: 900, whiteSpace: "nowrap" }}
        >
          RTG Data
        </Button>
      </Paper>
    </>
  );
}

export default function ScheduleData() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const activeView =
    new URLSearchParams(location.search).get("view") === "rtg"
      ? "rtg"
      : "schedule";
  const changeView = (view) => {
    navigate(view === "rtg" ? "?view=rtg" : "", { replace: true });
  };
  const isAdmin =
    String(user?.role || "").toLowerCase() === "admin" ||
    String(user?.employeeId || "") === "50041";
  const [startDate, setStartDate] = useState(isoYesterday());
  const [endDate, setEndDate] = useState(isoYesterday());
  const [selectedGenerators, setSelectedGenerators] = useState([]);
  const [kind, setKind] = useState("generator");
  const [frequency, setFrequency] = useState(15);
  const [metrics, setMetrics] = useState([
    "schedule",
    "actual",
    "deviation",
    "dc",
    "normative_dc",
  ]);
  const [generators, setGenerators] = useState([]);
  const [result, setResult] = useState(null);
  const [actual, setActual] = useState(null);
  const [loading, setLoading] = useState(false);
  const [actualLoading, setActualLoading] = useState(false);
  const [error, setError] = useState("");
  const [raw, setRaw] = useState(null);
  const [rawLoading, setRawLoading] = useState(false);
  const [chartOpen, setChartOpen] = useState(false);
  const [chartScope, setChartScope] = useState("combined");
  const [secondaryAxisMetric, setSecondaryAxisMetric] = useState("deviation");
  const [misMappingOpen, setMisMappingOpen] = useState(false);
  const [misMappingRows, setMisMappingRows] = useState([]);
  const [misMappingLoading, setMisMappingLoading] = useState(false);
  const [misMappingSaving, setMisMappingSaving] = useState(false);
  const [excelDownloading, setExcelDownloading] = useState(false);
  const [chartMailSending, setChartMailSending] = useState(false);
  const [chartMailMessage, setChartMailMessage] = useState("");
  useEffect(() => {
    API.getScheduleDataGenerators()
      .then((data) => setGenerators(data.data || []))
      .catch((err) => setError(err.message));
  }, []);

  const openMisMapping = async () => {
    setMisMappingOpen(true);
    setMisMappingLoading(true);
    try {
      const response = await API.getFrequencyPlantMapping();
      const rows = (response?.data || [])
        .filter((row) => !row.is_frequency)
        .filter((row) => {
          if (kind === "state") return row.is_state;
          if (kind === "generator") return !row.is_state;
          return true;
        })
        .sort((a, b) => {
          const missingOrder = Number(Boolean(a.mis_name)) - Number(Boolean(b.mis_name));
          return missingOrder || String(a.plant_name || "").localeCompare(String(b.plant_name || ""));
        });
      setMisMappingRows(rows);
    } catch (err) {
      setError(err.response?.data?.detail || err.message || "Unable to load MIS mapping.");
    } finally {
      setMisMappingLoading(false);
    }
  };

  const saveMisMapping = async () => {
    setMisMappingSaving(true);
    try {
      const response = await API.saveFrequencyPlantMapping({ rows: misMappingRows });
      if (!response?.success) throw new Error(response?.error || "MIS mapping could not be saved.");
      const choices = await API.getScheduleDataGenerators();
      setGenerators(choices?.data || []);
      setError("");
      setMisMappingOpen(false);
    } catch (err) {
      setError(err.response?.data?.detail || err.message || "MIS mapping could not be saved.");
    } finally {
      setMisMappingSaving(false);
    }
  };
  const visibleGenerators = useMemo(
    () => generators.filter((item) => kind === "all" || item.kind === kind),
    [generators, kind],
  );
  const visibleGeneratorIds = useMemo(
    () => visibleGenerators.map((item) => String(item.id)),
    [visibleGenerators],
  );
  const selectedIdSet = useMemo(
    () => new Set(selectedGenerators.map(String)),
    [selectedGenerators],
  );
  const columns = useMemo(() => result?.generators || [], [result]);
  const selectedItems = useMemo(
    () =>
      generators.filter((item) =>
        selectedGenerators.length
          ? selectedIdSet.has(String(item.id))
          : visibleGeneratorIds.includes(String(item.id)),
      ),
    [generators, selectedGenerators.length, selectedIdSet, visibleGeneratorIds],
  );
  const chartItems = useMemo(
    () =>
      chartScope === "combined"
        ? selectedItems
        : selectedItems.filter(
            (item) => String(item.id) === String(chartScope),
          ),
    [selectedItems, chartScope],
  );
  const chartScopeLabel =
    chartScope === "combined"
      ? `${selectedItems.length} selected ${kind === "state" ? "states" : "generators"}`
      : chartItems[0]?.mis_name || chartItems[0]?.label || "Selected generator";
  useEffect(() => {
    if (
      chartScope !== "combined" &&
      !selectedItems.some((item) => String(item.id) === String(chartScope))
    ) {
      setChartScope("combined");
    }
  }, [selectedItems, chartScope]);
  const loadData = async () => {
    if (!selectedItems.length) {
      setError("Select at least one mapped MIS name.");
      return;
    }
    const unmapped = selectedItems.filter((item) => !item.mis_name);
    if (unmapped.length) {
      setError(
        `MIS Name is not mapped for: ${unmapped.map((item) => item.label).join(", ")}. Add it in Frequency Report mapping first.`,
      );
      return;
    }
    setLoading(true);
    setActualLoading(true);
    setError("");
    try {
      const scheduleData = await API.getScheduleData({
        start_date: startDate,
        end_date: endDate,
        generators: selectedItems.map((item) => item.id).join(","),
        kind,
        frequency,
      });
      const actualData = await API.getScheduleDataActual({
        start_date: startDate,
        end_date: endDate,
        station_names: selectedItems.map((item) => item.mis_name).join(","),
        frequency: 1,
        kind,
      });
      setResult(scheduleData);
      setActual(actualData);
    } catch (err) {
      setError(
        err.response?.data?.detail ||
          err.message ||
          "Unable to load schedule and actual data.",
      );
    } finally {
      setLoading(false);
      setActualLoading(false);
    }
  };
  const inspectRaw = async () => {
    const id = selectedItems[0]?.id;
    if (!id) {
      setError("Select a generator before inspecting the WBES response.");
      return;
    }
    setRawLoading(true);
    setRaw(null);
    try {
      setRaw(await API.getScheduleDataRaw({ date: startDate, generator: id }));
    } catch (err) {
      setError(
        err.response?.data?.detail ||
          err.message ||
          "Unable to inspect the WBES response.",
      );
    } finally {
      setRawLoading(false);
    }
  };
  const comparisonRows = useMemo(() => {
    if (!result?.rows?.length || !actual?.rows?.length) return [];
    const selected = selectedItems;
    const actualByTime = Object.fromEntries(
      actual.rows.map((row) => [row.timestamp, row]),
    );
    return result.rows.map((row) => {
      const ar = actualByTime[row.timestamp] || {};
      const next = { timestamp: row.timestamp };
      selected.forEach((item) => {
        const key = item.mis_name || item.label;
        const schedule = Number(row[item.id]);
        const signed = item.kind === "generator" ? -schedule : schedule;
        const value = ar[key] == null ? null : Number(ar[key]);
        const dc = Number(row[`${item.id}_dc`]);
        const normativeDc = Number(row[`${item.id}_normative_dc`]);
        next[`${item.id}_schedule`] = Number.isFinite(signed) ? signed : null;
        next[`${item.id}_actual`] = Number.isFinite(value) ? value : null;
        next[`${item.id}_deviation`] = value == null ? null : value - signed;
        next[`${item.id}_dc`] = Number.isFinite(dc) ? dc : null;
        next[`${item.id}_normative_dc`] = Number.isFinite(normativeDc)
          ? normativeDc
          : null;
      });
      return next;
    });
  }, [result, actual, selectedItems]);
  const exportMatrix = () => {
    const rows = comparisonRows.length ? comparisonRows : result.rows;
    const headers = [
      "Date time",
      ...columns.flatMap((item) =>
        metrics.map(
          (metric) => `${item.mis_name || item.label} ${metricLabels[metric]}`,
        ),
      ),
    ];
    const dataRows = rows.map((row) => [
        row.timestamp,
        ...columns.flatMap((item) =>
          metrics.map((metric) => {
            const key = comparisonRows.length
              ? `${item.id}_${metric}`
              : metric === "schedule"
                ? item.id
                : null;
            const value = key ? row[key] : null;
            return value == null ? "" : roundOne(value);
          }),
        ),
      ]);
    return { headers, dataRows };
  };
  const download = () => {
    if (!result?.rows?.length) return;
    const { headers, dataRows } = exportMatrix();
    const csv = [headers, ...dataRows]
      .map((row) =>
        row
          .map((value) => `"${String(value).replaceAll('"', '""')}"`)
          .join(","),
      )
      .join("\r\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    link.download = `Schedule_Actual_Deviation_${startDate}_${endDate}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };
  const downloadExcel = async () => {
    if (!result?.rows?.length) return;
    setExcelDownloading(true);
    setError("");
    try {
      const { headers, dataRows } = exportMatrix();
      const blob = await API.exportScheduleDataExcel({
        headers,
        rows: dataRows,
        start_date: startDate,
        end_date: endDate,
      });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `Schedule_Actual_Deviation_${startDate}_${endDate}.xlsx`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (err) {
      setError(err.response?.data?.detail || err.message || "Unable to download Excel data.");
    } finally {
      setExcelDownloading(false);
    }
  };
  const allZero =
    Boolean(result?.rows?.length) &&
    columns.length > 0 &&
    result.rows.every((row) =>
      columns.every(
        (item) => row[item.id] == null || Number(row[item.id]) === 0,
      ),
    );
  const comparisonSource = comparisonRows.length
    ? comparisonRows
    : result?.rows || [];
  const metricLabels = {
    schedule: "Schedule",
    actual: "Actual",
    deviation: "Deviation",
    dc: "DC (On-bar)",
    normative_dc: "Normative DC",
  };
  const toggleMetric = (metric) =>
    setMetrics((current) =>
      current.includes(metric)
        ? current.length === 1
          ? current
          : current.filter((item) => item !== metric)
        : [...current, metric],
    );
  const chartOptions = useMemo(
    () =>
      chartItems.map((chartItem) => {
    const scopedChartItems = [chartItem];
    const timestamps = comparisonRows.map((row) => row.timestamp);
    const scheduleColors = ["#2563EB", "#1D4ED8", "#0EA5E9", "#4F46E5"];
    const actualColors = ["#059669", "#0F766E", "#16A34A", "#0891B2"];
    const deviationColors = ["#EA580C", "#DC2626", "#D97706", "#DB2777"];
    const dcColors = ["#7C3AED", "#9333EA", "#A21CAF", "#C026D3"];
    const normativeDcColors = ["#64748B", "#475569", "#334155", "#0F172A"];
    const secondaryAxisColor =
      secondaryAxisMetric === "schedule"
        ? scheduleColors[0]
        : secondaryAxisMetric === "actual"
          ? actualColors[0]
          : secondaryAxisMetric === "deviation"
            ? deviationColors[0]
            : secondaryAxisMetric === "dc"
              ? dcColors[0]
              : normativeDcColors[0];
    const boundaries = timestamps.reduce((items, timestamp, index) => {
      const date = String(timestamp).slice(0, 10);
      const previousDate = index
        ? String(timestamps[index - 1]).slice(0, 10)
        : "";
      if (index === 0 || date !== previousDate) {
        const [year, month, day] = date.split("-");
        items.push({
          xAxis: timestamp,
          lineStyle: { color: "#CBD5E1", width: 1.2, type: "dashed" },
          label: {
            show: true,
            formatter: `${day}-${month}-${year}`,
            rotate: 90,
            position: "insideEndTop",
            color: "#334155",
            fontSize: 11,
            fontWeight: 800,
            distance: 8,
          },
        });
      }
      return items;
    }, []);
    const chartSeries = scopedChartItems.flatMap((item, itemIndex) =>
      metrics.map((metric) => {
        const color =
          metric === "schedule"
            ? scheduleColors[itemIndex % scheduleColors.length]
            : metric === "actual"
              ? actualColors[itemIndex % actualColors.length]
              : metric === "deviation"
                ? deviationColors[itemIndex % deviationColors.length]
                : metric === "dc"
                  ? dcColors[itemIndex % dcColors.length]
                  : normativeDcColors[itemIndex % normativeDcColors.length];
        return {
          name: `${item.mis_name || item.label} ${metricLabels[metric]}`,
          type: "line",
          yAxisIndex:
            secondaryAxisMetric !== "none" && metric === secondaryAxisMetric
              ? 1
              : 0,
          data: comparisonRows.map((row) => {
            const value = row[`${item.id}_${metric}`];
            return value == null ? null : Number(roundOne(value));
          }),
          symbol: "none",
          smooth: 0.18,
          connectNulls: false,
          lineStyle: {
            width: metric === "deviation" ? 2.5 : 2.2,
            type: metric === "normative_dc" ? "dashed" : "solid",
            color,
          },
          itemStyle: { color },
          areaStyle:
            metric === "deviation"
              ? { color, opacity: 0.16, origin: "auto" }
              : undefined,
          emphasis: { focus: "series", lineStyle: { width: 3.2 } },
        };
      }),
    );
    if (chartSeries.length) {
      const secondarySeriesIndex = chartSeries.findIndex(
        (series) => series.yAxisIndex === 1,
      );
      const markLineSeriesIndex =
        secondarySeriesIndex >= 0 ? secondarySeriesIndex : 0;
      chartSeries[markLineSeriesIndex].markLine = {
        silent: true,
        symbol: "none",
        animation: false,
        data: [
          {
            yAxis: 0,
            lineStyle: { color: "#64748B", width: 1.2, type: "dashed" },
            label: {
              show: true,
              formatter: "0 MW",
              color: "#475569",
              fontSize: 10,
            },
          },
          ...boundaries,
        ],
      };
    }
    return {
      id: String(chartItem.id),
      title: chartItem.mis_name || chartItem.label || String(chartItem.id),
      option: {
      animationDuration: 550,
      grid: {
        top: 78,
        right: secondaryAxisMetric === "none" ? 30 : 78,
        bottom: 78,
        left: 68,
      },
      legend: {
        type: "scroll",
        top: 4,
        left: 8,
        right: 8,
        textStyle: { color: "#1E293B", fontSize: 11, fontWeight: 700 },
      },
      tooltip: {
        trigger: "axis",
        confine: true,
        backgroundColor: "rgba(255,255,255,.97)",
        borderColor: "#CBD5E1",
        borderWidth: 1,
        textStyle: { color: "#0F172A", fontSize: 12 },
        axisPointer: {
          type: "cross",
          lineStyle: { color: "#64748B", type: "dashed" },
        },
        valueFormatter: (value) =>
          value == null ? "—" : `${Number(value).toFixed(1)} MW`,
      },
      toolbox: {
        show: true,
        top: 32,
        right: 8,
        feature: {
          dataZoom: {
            yAxisIndex: "none",
            title: { zoom: "Zoom", back: "Reset zoom" },
          },
          restore: { title: "Reset" },
          saveAsImage: {
            title: "Download image",
            name: `Schedule_Actual_Deviation_${startDate}_${endDate}`,
            pixelRatio: 2,
            backgroundColor: "#FFFFFF",
          },
        },
      },
      dataZoom: [
        {
          type: "inside",
          xAxisIndex: 0,
          filterMode: "none",
          zoomOnMouseWheel: true,
          moveOnMouseMove: true,
        },
        {
          type: "slider",
          xAxisIndex: 0,
          height: 24,
          bottom: 18,
          filterMode: "none",
          textStyle: { color: "#64748B", fontSize: 10 },
          fillerColor: "rgba(37,99,235,.10)",
          borderColor: "#CBD5E1",
          handleStyle: { color: "#2563EB", borderColor: "#1D4ED8" },
          dataBackground: {
            lineStyle: { color: "#94A3B8" },
            areaStyle: { color: "rgba(148,163,184,.20)" },
          },
        },
      ],
      xAxis: {
        type: "category",
        data: timestamps,
        boundaryGap: false,
        axisLine: { lineStyle: { color: "#94A3B8" } },
        axisTick: { show: false },
        axisLabel: {
          color: "#334155",
          fontSize: 11,
          fontWeight: 700,
          formatter: (value) => String(value || "").slice(11, 16),
          hideOverlap: true,
        },
      },
      yAxis: [
        {
          type: "value",
          name: "Primary · MW",
          position: "left",
          nameTextStyle: { color: "#0F172A", fontWeight: 900, fontSize: 12 },
          axisLabel: {
            color: "#334155",
            fontSize: 11,
            fontWeight: 700,
            formatter: (value) => Number(value).toFixed(1),
          },
          splitLine: { lineStyle: { color: "#D7E1EA", width: 1 } },
        },
        ...(secondaryAxisMetric === "none"
          ? []
          : [
              {
                type: "value",
                name: `${metricLabels[secondaryAxisMetric]} · MW`,
                position: "right",
                alignTicks: true,
                nameTextStyle: {
                  color: secondaryAxisColor,
                  fontWeight: 900,
                  fontSize: 12,
                },
                axisLine: {
                  show: true,
                  lineStyle: { color: secondaryAxisColor, width: 1.5 },
                },
                axisTick: {
                  show: true,
                  lineStyle: { color: secondaryAxisColor },
                },
                axisLabel: {
                  color: secondaryAxisColor,
                  fontSize: 11,
                  fontWeight: 800,
                  formatter: (value) => Number(value).toFixed(1),
                },
                splitLine: { show: false },
              },
            ]),
      ],
      series: chartSeries,
      },
    };
      }),
    [
      comparisonRows,
      chartItems,
      metrics,
      secondaryAxisMetric,
      startDate,
      endDate,
    ],
  );
  const renderCharts = (height = 360) => (
    <Stack spacing={1.5} sx={{ width: "100%", minWidth: 0, pb: 0.5 }}>
      {chartOptions.map((chart, index) => (
        <Paper
          key={chart.id}
          variant="outlined"
          sx={{
            overflow: "hidden",
            borderRadius: 2.5,
            borderColor: "#D8E4EF",
            bgcolor: "#FFFFFF",
            boxShadow: "0 5px 18px rgba(15,42,67,.045)",
          }}
        >
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            sx={{ px: 1.5, pt: 1.15 }}
          >
            <Typography sx={{ color: "#0F2F4F", fontSize: 13, fontWeight: 950 }}>
              {index + 1}. {chart.title}
            </Typography>
            <Typography sx={{ color: "#64748B", fontSize: 10.5, fontWeight: 750 }}>
              {startDate} to {endDate}
            </Typography>
          </Stack>
          <ReactECharts
            option={chart.option}
            style={{ width: "100%", height }}
            opts={{ renderer: "canvas" }}
            notMerge
            lazyUpdate
          />
        </Paper>
      ))}
    </Stack>
  );
  const buildChartHtml = () => {
    const chartModels = chartItems.map((item) => ({
      id: String(item.id),
      title: item.mis_name || item.label || String(item.id),
      series: metrics.map((metric) => ({
        label: metricLabels[metric],
        key: `${item.id}_${metric}`,
        borderColor:
          metric === "schedule"
            ? "#2563EB"
            : metric === "actual"
              ? "#059669"
              : metric === "deviation"
                ? "#EA580C"
                : metric === "dc"
                  ? "#7C3AED"
                  : "#64748B",
        backgroundColor:
          metric === "deviation" ? "rgba(249,115,22,.20)" : "transparent",
        borderDash: metric === "normative_dc" ? [7, 5] : [],
        fill: metric === "deviation",
        yAxisID:
          secondaryAxisMetric !== "none" && metric === secondaryAxisMetric
            ? "y1"
            : "y",
      })),
    }));
    const data = JSON.stringify(comparisonRows).replaceAll("<", "\\u003c");
    const charts = JSON.stringify(chartModels).replaceAll("<", "\\u003c");
    const secondary = JSON.stringify(secondaryAxisMetric);
    const secondaryLabel = JSON.stringify(metricLabels[secondaryAxisMetric] || "Secondary");
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Generator-wise Schedule, Actual & Deviation</title><script src="https://cdn.jsdelivr.net/npm/chart.js"></script><style>*{box-sizing:border-box}body{font-family:Inter,Arial,sans-serif;margin:0;padding:24px;background:#f4f8fc;color:#102a43}.report-head{max-width:1500px;margin:0 auto 18px;padding:20px 24px;border-radius:18px;color:#fff;background:linear-gradient(110deg,#07194f,#0754b8 65%,#1186d4)}h1{margin:0 0 6px;font-size:25px}.report-head p{margin:0;opacity:.9}.charts{max-width:1500px;margin:auto;display:grid;gap:18px}.chart-card{height:520px;padding:18px 22px 20px;border:1px solid #d8e4ef;border-radius:18px;background:#fff;box-shadow:0 8px 24px rgba(15,42,67,.07);break-inside:avoid}.chart-card h2{height:28px;margin:0;color:#0f2f4f;font-size:17px}.chart-wrap{position:relative;height:440px}@media print{body{padding:0;background:#fff}.report-head{border-radius:0}.chart-card{height:185mm;border:0;box-shadow:none;page-break-after:always}.chart-wrap{height:165mm}}@media(max-width:700px){body{padding:10px}.chart-card{padding:14px 10px;height:430px}.chart-wrap{height:365px}}</style></head><body><header class="report-head"><h1>Generator-wise Schedule, Actual &amp; Deviation</h1><p>${startDate} to ${endDate} · ${frequency}-minute schedule · ${chartModels.length} generator(s)</p></header><main class="charts" id="charts"></main><script>const rows=${data};const charts=${charts};const secondary=${secondary};const secondaryLabel=${secondaryLabel};const root=document.getElementById('charts');charts.forEach((item,index)=>{const section=document.createElement('section');section.className='chart-card';const heading=document.createElement('h2');heading.textContent=(index+1)+'. '+item.title;const wrap=document.createElement('div');wrap.className='chart-wrap';const canvas=document.createElement('canvas');wrap.appendChild(canvas);section.append(heading,wrap);root.appendChild(section);const scales={x:{ticks:{maxTicksLimit:18,color:'#334155'},grid:{color:'#eef2f7'}},y:{position:'left',ticks:{callback:v=>Number(v).toFixed(1),color:'#334155'},title:{display:true,text:'Primary · MW',color:'#0f172a'},grid:{color:'#d7e1ea'}}};if(secondary!=='none'){scales.y1={position:'right',grid:{drawOnChartArea:false},ticks:{color:'#6d28d9',callback:v=>Number(v).toFixed(1)},title:{display:true,text:secondaryLabel+' · MW',color:'#6d28d9'}}}new Chart(canvas,{type:'line',data:{labels:rows.map(r=>r.timestamp.replace('T',' ')),datasets:item.series.map(s=>({...s,data:rows.map(r=>r[s.key]??null),tension:.22,pointRadius:0,borderWidth:s.key.endsWith('_deviation')?2.5:2}))},options:{maintainAspectRatio:false,responsive:true,interaction:{mode:'index',intersect:false},plugins:{legend:{position:'top',align:'start',labels:{usePointStyle:true,boxWidth:8,font:{weight:'bold'}}}},scales}})});</script></body></html>`;
  };
  const downloadChartHtml = () => {
    if (!comparisonRows.length) return;
    const html = buildChartHtml();
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    link.download = `Schedule_Actual_Deviation_Charts_${startDate}_${endDate}.html`;
    link.click();
    URL.revokeObjectURL(link.href);
  };
  const emailChartHtml = async () => {
    if (!comparisonRows.length || chartMailSending) return;
    setChartMailSending(true);
    setChartMailMessage("");
    setError("");
    try {
      const response = await API.sendScheduleDataChartMail({
        html: buildChartHtml(),
        startDate,
        endDate,
        generatorNames: chartItems.map(
          (item) => item.mis_name || item.label || String(item.id),
        ),
      });
      setChartMailMessage(response.message || "HTML chart report sent.");
    } catch (requestError) {
      setError(
        requestError.response?.data?.detail ||
          requestError.message ||
          "The HTML chart report could not be sent.",
      );
    } finally {
      setChartMailSending(false);
    }
  };
  if (activeView === "rtg") {
    return (
      <AppShell>
        <Box
          sx={{
            minHeight: "calc(100vh - 76px)",
            bgcolor: "#F5F8FC",
            p: { xs: 1, md: 2 },
          }}
        >
          <ScheduleDataHeader
            activeView={activeView}
            onViewChange={changeView}
          />
          <RTGHistoricalDownload />
        </Box>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Box
        sx={{
          minHeight: "calc(100vh - 76px)",
          bgcolor: "#F5F8FC",
          p: { xs: 1, md: 2 },
        }}
      >
        <ScheduleDataHeader
          activeView={activeView}
          onViewChange={changeView}
        />
        <Paper
          elevation={0}
          sx={{
            p: { xs: 1.25, md: 1.5 },
            border: "1px solid #BFE2D9",
            borderRadius: 4,
            mb: 2,
            background:
              "linear-gradient(135deg,rgba(255,255,255,.98),rgba(244,251,249,.96))",
            boxShadow: "0 10px 30px rgba(15,42,67,.06)",
            "& .MuiOutlinedInput-root": {
              minHeight: 42,
              borderRadius: 2.5,
              bgcolor: "#FFFFFF",
              transition: "box-shadow .18s ease, border-color .18s ease",
              "&:hover": { boxShadow: "0 4px 14px rgba(15,42,67,.07)" },
              "&.Mui-focused": { boxShadow: "0 0 0 3px rgba(0,104,217,.10)" },
            },
          }}
        >
          <Stack
            direction={{ xs: "column", sm: "row" }}
            alignItems={{ sm: "center" }}
            justifyContent="space-between"
            spacing={1}
            sx={{ mb: 1.25 }}
          >
            <Box>
              <Typography
                sx={{
                  color: "#0F2F4F",
                  fontSize: 14,
                  fontWeight: 900,
                  letterSpacing: "-.01em",
                }}
              >
                Build data query
              </Typography>
              <Typography sx={{ color: "#64748B", fontSize: 10.5 }}>
                Choose the period, source and schedule resolution.
              </Typography>
            </Box>
            <Box
              sx={{
                px: 1.25,
                py: 0.55,
                borderRadius: 99,
                color: "#0754B8",
                bgcolor: "#EAF3FF",
                border: "1px solid #C9DDF8",
                fontSize: 11,
                fontWeight: 900,
                whiteSpace: "nowrap",
              }}
            >
              {selectedGenerators.length || visibleGenerators.length} source(s)
            </Box>
          </Stack>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr",
                sm: "repeat(2,minmax(0,1fr))",
                lg: "145px 145px 145px minmax(290px,1fr) 150px auto",
              },
              gap: 1,
              alignItems: "center",
            }}
          >
            <TextField
              label="From date"
              type="date"
              size="small"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
            <TextField
              label="To date"
              type="date"
              size="small"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
            <TextField
              select
              label="Data type"
              size="small"
              value={kind}
              onChange={(e) => {
                setKind(e.target.value);
                setSelectedGenerators([]);
              }}
              fullWidth
            >
              <MenuItem value="generator">Generator</MenuItem>
              <MenuItem value="state">State</MenuItem>
              <MenuItem value="all">All mapped</MenuItem>
            </TextField>
            <FormControl size="small" fullWidth>
              <InputLabel id="schedule-mis-names-label">MIS name(s)</InputLabel>
              <Select
                labelId="schedule-mis-names-label"
                multiple
                value={selectedGenerators}
                input={<OutlinedInput label="MIS name(s)" />}
                onChange={(event) => {
                  const values =
                    typeof event.target.value === "string"
                      ? event.target.value.split(",")
                      : event.target.value;
                  setSelectedGenerators(values.map(String));
                }}
                renderValue={(values) => {
                  if (!values.length) return "All mapped";
                  const labels = values
                    .map((id) => {
                      const item = visibleGenerators.find(
                        (entry) => String(entry.id) === String(id),
                      );
                      return item?.mis_name || item?.label || id;
                    })
                    .filter(Boolean);
                  return labels.length <= 2
                    ? labels.join(", ")
                    : `${labels.slice(0, 2).join(", ")} +${labels.length - 2}`;
                }}
                MenuProps={{ PaperProps: { sx: { maxHeight: 380 } } }}
              >
                {visibleGenerators.map((item) => {
                  const itemId = String(item.id);
                  return (
                    <MenuItem key={itemId} value={itemId}>
                      <Checkbox
                        checked={
                          selectedGenerators.length
                            ? selectedIdSet.has(itemId)
                            : true
                        }
                        size="small"
                      />
                      <ListItemText
                        primary={item.mis_name || item.label}
                        secondary={
                          item.kind === "state" ? "State" : "Generator"
                        }
                      />
                    </MenuItem>
                  );
                })}
              </Select>
            </FormControl>
            <TextField
              select
              label="Schedule frequency"
              size="small"
              value={frequency}
              onChange={(e) => setFrequency(Number(e.target.value))}
              fullWidth
            >
              {[15, 5, 1].map((value) => (
                <MenuItem key={value} value={value}>
                  {value}-minute
                </MenuItem>
              ))}
            </TextField>
            <Stack
              direction="row"
              spacing={0.5}
              sx={{
                p: 0.4,
                borderRadius: 2.5,
                bgcolor: "#EDF3F8",
                border: "1px solid #D7E2EC",
              }}
            >
              <Button
                size="small"
                variant="text"
                onClick={() => setSelectedGenerators(visibleGeneratorIds)}
                sx={{
                  minHeight: 32,
                  px: 1.1,
                  borderRadius: 2,
                  bgcolor: selectedGenerators.length ? "#FFFFFF" : "transparent",
                  boxShadow: selectedGenerators.length
                    ? "0 2px 8px rgba(15,42,67,.08)"
                    : "none",
                  fontWeight: 900,
                  whiteSpace: "nowrap",
                }}
              >
                Select all
              </Button>
              <Button
                size="small"
                variant="text"
                onClick={() => setSelectedGenerators([])}
                sx={{
                  minHeight: 32,
                  px: 1.1,
                  borderRadius: 2,
                  bgcolor: !selectedGenerators.length ? "#FFFFFF" : "transparent",
                  boxShadow: !selectedGenerators.length
                    ? "0 2px 8px rgba(15,42,67,.08)"
                    : "none",
                  fontWeight: 900,
                  whiteSpace: "nowrap",
                }}
              >
                Use all
              </Button>
            </Stack>
          </Box>
          <Box
            sx={{
              mt: 1.15,
              pt: 1.15,
              borderTop: "1px solid #DCE9E5",
              display: "flex",
              flexWrap: "wrap",
              gap: 0.8,
              alignItems: "center",
            }}
          >
            <Button
              variant="contained"
              onClick={loadData}
              disabled={loading || actualLoading}
              startIcon={
                loading ? (
                  <CircularProgress size={16} color="inherit" />
                ) : (
                  <RefreshCw size={16} />
                )
              }
              sx={{
                minHeight: 42,
                px: 2,
                borderRadius: 2.5,
                bgcolor: "#0068D9",
                fontWeight: 900,
                boxShadow: "0 7px 16px rgba(0,104,217,.22)",
                "&:hover": { bgcolor: "#0057B8" },
              }}
            >
              {loading || actualLoading
                ? "Fetching data..."
                : "Fetch selected data"}
            </Button>
            <Button
              variant="outlined"
              onClick={openMisMapping}
              sx={{ minHeight: 42, borderRadius: 2.5, fontWeight: 900, whiteSpace: "nowrap" }}
            >
              MIS name mapping
            </Button>
            {false && (
              <Button
                variant="outlined"
                onClick={loadActual}
                disabled={actualLoading || !selectedGenerators.length}
                sx={{ fontWeight: 900 }}
              >
                {actualLoading ? "Loading actual…" : "Load actual & deviation"}
              </Button>
            )}
            <Button
              variant="outlined"
              onClick={download}
              disabled={!result?.rows?.length}
              startIcon={<Download size={16} />}
              sx={{ minHeight: 42, borderRadius: 2.5, fontWeight: 900 }}
            >
              CSV
            </Button>
            <Button
              variant="outlined"
              color="success"
              onClick={downloadExcel}
              disabled={!result?.rows?.length || excelDownloading}
              startIcon={excelDownloading ? <CircularProgress size={15} color="inherit" /> : <FileSpreadsheet size={16} />}
              sx={{ minHeight: 42, borderRadius: 2.5, fontWeight: 900 }}
            >
              {excelDownloading ? "Preparing..." : "Excel"}
            </Button>
            {isAdmin && (
              <Button
                variant="outlined"
                color="secondary"
                onClick={inspectRaw}
                disabled={rawLoading || !selectedItems.length}
                sx={{ minHeight: 42, borderRadius: 2.5, fontWeight: 900 }}
              >
                {rawLoading ? "Inspecting…" : "Inspect WBES JSON"}
              </Button>
            )}
            <Box sx={{ flex: 1, minWidth: { xs: 0, lg: 16 } }} />
            <Stack
              direction="row"
              spacing={0.45}
              sx={{
                p: 0.4,
                overflowX: "auto",
                borderRadius: 2.5,
                bgcolor: "#EDF3F8",
                border: "1px solid #D7E2EC",
              }}
            >
              {Object.entries(metricLabels).map(([metric, label]) => (
                <Button
                  key={metric}
                  size="small"
                  variant={metrics.includes(metric) ? "contained" : "outlined"}
                  onClick={() => toggleMetric(metric)}
                  sx={{
                    minWidth: 92,
                    minHeight: 32,
                    border: 0,
                    borderRadius: 2,
                    boxShadow: metrics.includes(metric)
                      ? "0 3px 8px rgba(0,84,184,.16)"
                      : "none",
                    fontWeight: 900,
                    whiteSpace: "nowrap",
                  }}
                >
                  {label}
                </Button>
              ))}
            </Stack>
          </Box>
          <Typography sx={{ mt: 1.1, color: "#64748B", fontSize: 11 }}>
            Actual data uses the MIS generator/state endpoint at one-minute
            interval. Generator schedule is multiplied by -1; deviation = Actual
            − Schedule.
          </Typography>
        </Paper>
        {error && (
          <Paper
            sx={{
              p: 1.5,
              mb: 2,
              color: "#B42318",
              border: "1px solid #FDA29B",
            }}
          >
            <Stack direction={{ xs: "column", sm: "row" }} alignItems={{ sm: "center" }} justifyContent="space-between" spacing={1}>
              <span>{error}</span>
              {error.includes("MIS Name is not mapped") && (
                <Button size="small" variant="contained" color="error" onClick={openMisMapping}>
                  Map MIS names
                </Button>
              )}
            </Stack>
          </Paper>
        )}
        {chartMailMessage && (
          <Paper
            sx={{
              p: 1.25,
              mb: 2,
              color: "#067647",
              bgcolor: "#ECFDF3",
              border: "1px solid #ABEFC6",
              borderRadius: 2.5,
              fontWeight: 800,
            }}
          >
            {chartMailMessage}
          </Paper>
        )}
        {result?.diagnostics?.length > 0 && (
          <Paper
            sx={{
              p: 1.5,
              mb: 2,
              color: "#7A2E0B",
              bgcolor: "#FFF7ED",
              border: "1px solid #FDBA74",
            }}
          >
            <Typography sx={{ fontWeight: 900 }}>WBES diagnostics</Typography>
            {result.diagnostics.map((item, i) => (
              <Typography key={i} sx={{ fontSize: 12 }}>
                {item.date} · {item.generators?.join(", ") || "WBES"}:{" "}
                {item.message}
              </Typography>
            ))}
          </Paper>
        )}
        {allZero && (
          <Paper
            sx={{
              p: 1.5,
              mb: 2,
              color: "#7A2E0B",
              bgcolor: "#FFF7ED",
              border: "1px solid #FDBA74",
            }}
          >
            All schedule values are zero or empty. Zero may be valid;
            administrators can inspect the initial WBES JSON.
          </Paper>
        )}
        {raw && (
          <Paper
            sx={{
              p: 1.5,
              mb: 2,
              bgcolor: "#0F172A",
              color: "#E2E8F0",
              maxHeight: 360,
              overflow: "auto",
            }}
          >
            <Typography sx={{ color: "#93C5FD", fontWeight: 900 }}>
              Initial WBES response
            </Typography>
            <Box component="pre" sx={{ fontSize: 11, whiteSpace: "pre-wrap" }}>
              {JSON.stringify(raw, null, 2)}
            </Box>
          </Paper>
        )}
        {comparisonRows.length > 0 && (
          <Paper
            sx={{ p: 1.5, mb: 2, border: "1px solid #C8E6DE", borderRadius: 3 }}
          >
            <Stack
              direction={{ xs: "column", md: "row" }}
              alignItems={{ xs: "stretch", md: "center" }}
              justifyContent="space-between"
              spacing={1}
              sx={{ mb: 1 }}
            >
              <Box>
                <Typography sx={{ fontWeight: 900 }}>
                  Generation plot · {chartScopeLabel}
                </Typography>
                <Typography sx={{ color: "#64748B", fontSize: 11 }}>
                  Use the navigator below the chart to zoom and scroll across
                  the selected date range.
                </Typography>
              </Box>
              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={0.75}
                alignItems={{ sm: "center" }}
                sx={{
                  "& .MuiOutlinedInput-root": {
                    minHeight: 40,
                    borderRadius: 2.5,
                    bgcolor: "#FFFFFF",
                  },
                  "& .MuiButton-root": {
                    minHeight: 40,
                    borderRadius: 2.5,
                    fontWeight: 800,
                    whiteSpace: "nowrap",
                  },
                }}
              >
                <TextField
                  select
                  size="small"
                  label="Chart view"
                  value={chartScope}
                  onChange={(event) => setChartScope(event.target.value)}
                  sx={{ minWidth: 230 }}
                >
                  <MenuItem value="combined">
                    Stacked charts · {selectedItems.length} selected
                  </MenuItem>
                  {selectedItems.map((item) => (
                    <MenuItem key={item.id} value={String(item.id)}>
                      {item.mis_name || item.label}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  select
                  size="small"
                  label="Secondary axis"
                  value={secondaryAxisMetric}
                  onChange={(event) => setSecondaryAxisMetric(event.target.value)}
                  sx={{ minWidth: 175 }}
                >
                  <MenuItem value="none">None · single scale</MenuItem>
                  {Object.entries(metricLabels).map(([metric, label]) => (
                    <MenuItem key={metric} value={metric}>
                      {label}
                      {!metrics.includes(metric) ? " (hidden)" : ""}
                    </MenuItem>
                  ))}
                </TextField>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<Maximize2 size={15} />}
                  onClick={() => setChartOpen(true)}
                >
                  Open chart
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<Download size={15} />}
                  onClick={downloadChartHtml}
                >
                  HTML chart
                </Button>
                <Button
                  size="small"
                  variant="contained"
                  startIcon={
                    chartMailSending ? (
                      <CircularProgress size={14} color="inherit" />
                    ) : (
                      <Send size={15} />
                    )
                  }
                  onClick={emailChartHtml}
                  disabled={chartMailSending}
                >
                  {chartMailSending ? "Sending..." : "Email HTML"}
                </Button>
              </Stack>
            </Stack>
            {renderCharts()}
          </Paper>
        )}
        {result && (
          <Paper
            elevation={0}
            sx={{
              border: "1px solid #C8E6DE",
              borderRadius: 3,
              overflow: "hidden",
            }}
          >
            <Stack
              direction="row"
              justifyContent="space-between"
              sx={{ p: 1.5, bgcolor: "#F1FAF7" }}
            >
              <Typography sx={{ fontWeight: 900 }}>
                Data matrix ·{" "}
                {metrics.map((item) => metricLabels[item]).join(" · ")}
              </Typography>
              <Typography sx={{ color: "#03624C", fontSize: 12 }}>
                {comparisonSource.length || 0} samples
              </Typography>
            </Stack>
            <Box sx={{ maxHeight: "62vh", overflow: "auto" }}>
              <Box component="table" sx={tableSx}>
                <thead>
                  <tr>
                    <th>Date time</th>
                    {columns.flatMap((item) =>
                      metrics.map((metric) => (
                        <th key={`${item.id}-${metric}`}>
                          {item.mis_name || item.label}
                          <br />
                          {metricLabels[metric]}
                        </th>
                      )),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {comparisonSource.map((row) => (
                    <tr key={row.timestamp}>
                      <td>{row.timestamp.replace("T", " ")}</td>
                      {columns.flatMap((item) =>
                        metrics.map((metric) => {
                          const key = comparisonRows.length
                            ? `${item.id}_${metric}`
                            : metric === "schedule"
                              ? item.id
                              : null;
                          const value = key ? row[key] : null;
                          return (
                            <td key={`${item.id}-${metric}`}>
                              {value == null ? "—" : roundOne(value)}
                            </td>
                          );
                        }),
                      )}
                    </tr>
                  ))}
                </tbody>
              </Box>
            </Box>
          </Paper>
        )}
        <Dialog
          open={misMappingOpen}
          onClose={() => !misMappingSaving && setMisMappingOpen(false)}
          fullWidth
          maxWidth="md"
        >
          <DialogTitle sx={{ fontWeight: 900, pr: 7 }}>
            MIS stationName mapping
            <IconButton
              onClick={() => setMisMappingOpen(false)}
              disabled={misMappingSaving}
              sx={{ position: "absolute", right: 12, top: 10 }}
            >
              <X size={20} />
            </IconButton>
          </DialogTitle>
          <DialogContent dividers>
            <Typography sx={{ mb: 1.5, color: "#475569", fontSize: 12 }}>
              Enter the exact stationName accepted by the MIS API. Example: BH_DRAWAL( ER END).
              This is the same MIS Name stored under Frequency Report → Plant Mapping.
            </Typography>
            {misMappingLoading ? (
              <Stack alignItems="center" sx={{ py: 5 }}><CircularProgress size={28} /></Stack>
            ) : (
              <Box sx={{ maxHeight: "55vh", overflow: "auto", border: "1px solid #D7E4F6", borderRadius: 1.5 }}>
                <Box component="table" sx={{ ...tableSx, minWidth: 560 }}>
                  <thead><tr><th>Plant / State</th><th>Type</th><th>MIS Name (API stationName)</th></tr></thead>
                  <tbody>
                    {misMappingRows.map((row, index) => (
                      <tr key={`${row.plant_id}-${row.STAGE_ID || index}`}>
                        <td>{row.plant_name || row.STAGE_NAME || row.plant_id}</td>
                        <td>{row.is_state ? "State" : "Generator"}</td>
                        <td>
                          <TextField
                            fullWidth
                            size="small"
                            value={row.mis_name || ""}
                            placeholder={row.is_state ? "e.g. BH_DRAWAL( ER END)" : "Exact MIS stationName"}
                            onChange={(event) => setMisMappingRows((current) => current.map((item, rowIndex) => (
                              rowIndex === index ? { ...item, mis_name: event.target.value } : item
                            )))}
                            inputProps={{ style: { fontSize: 12 } }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Box>
              </Box>
            )}
          </DialogContent>
          <DialogActions sx={{ px: 3, py: 1.5 }}>
            <Button onClick={() => setMisMappingOpen(false)} disabled={misMappingSaving}>Cancel</Button>
            <Button
              variant="contained"
              onClick={saveMisMapping}
              disabled={misMappingLoading || misMappingSaving || !misMappingRows.length}
              startIcon={misMappingSaving ? <CircularProgress size={15} color="inherit" /> : <Save size={16} />}
            >
              {misMappingSaving ? "Saving..." : "Save MIS mapping"}
            </Button>
          </DialogActions>
        </Dialog>
        <Dialog
          open={chartOpen}
          onClose={() => setChartOpen(false)}
          fullWidth
          maxWidth="xl"
        >
          <DialogTitle sx={{ fontWeight: 900, pr: 7 }}>
            Schedule, Actual & Deviation · {chartScopeLabel} · {startDate} to{" "}
            {endDate}
            <IconButton
              onClick={() => setChartOpen(false)}
              sx={{ position: "absolute", right: 12, top: 10 }}
            >
              <X size={20} />
            </IconButton>
          </DialogTitle>
          <DialogContent dividers>
            <Stack direction="row" spacing={0.75} justifyContent="flex-end" sx={{ mb: 1 }}>
              <Button
                size="small"
                startIcon={<Download size={15} />}
                onClick={downloadChartHtml}
              >
                Download HTML chart
              </Button>
              <Button
                size="small"
                variant="contained"
                startIcon={chartMailSending ? <CircularProgress size={14} color="inherit" /> : <Send size={15} />}
                onClick={emailChartHtml}
                disabled={chartMailSending}
              >
                {chartMailSending ? "Sending..." : "Email HTML report"}
              </Button>
            </Stack>
            {renderCharts(440)}
          </DialogContent>
        </Dialog>
      </Box>
    </AppShell>
  );
}
