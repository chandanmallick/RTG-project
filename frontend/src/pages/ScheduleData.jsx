import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
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
import { Download, Maximize2, RefreshCw, Table2, X } from "lucide-react";
import ReactECharts from "echarts-for-react";
import AppShell from "../components/layout/AppShell";
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

export default function ScheduleData() {
  const { user } = useAuth();
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
  useEffect(() => {
    API.getScheduleDataGenerators()
      .then((data) => setGenerators(data.data || []))
      .catch((err) => setError(err.message));
  }, []);
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
  const download = () => {
    if (!result?.rows?.length) return;
    const rows = comparisonRows.length ? comparisonRows : result.rows;
    const headers = [
      "Date time",
      ...columns.flatMap((item) =>
        metrics.map(
          (metric) => `${item.mis_name || item.label} ${metricLabels[metric]}`,
        ),
      ),
    ];
    const csv = [
      headers,
      ...rows.map((row) => [
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
      ]),
    ]
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
  const chartOption = useMemo(() => {
    const timestamps = comparisonRows.map((row) => row.timestamp);
    const scheduleColors = ["#2563EB", "#1D4ED8", "#0EA5E9", "#4F46E5"];
    const actualColors = ["#059669", "#0F766E", "#16A34A", "#0891B2"];
    const deviationColors = ["#EA580C", "#DC2626", "#D97706", "#DB2777"];
    const dcColors = ["#7C3AED", "#9333EA", "#A21CAF", "#C026D3"];
    const normativeDcColors = ["#64748B", "#475569", "#334155", "#0F172A"];
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
    const chartSeries = chartItems.flatMap((item, itemIndex) =>
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
      chartSeries[0].markLine = {
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
      animationDuration: 550,
      grid: { top: 78, right: 30, bottom: 78, left: 68 },
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
      yAxis: {
        type: "value",
        name: "MW",
        nameTextStyle: { color: "#0F172A", fontWeight: 900, fontSize: 12 },
        axisLabel: {
          color: "#334155",
          fontSize: 11,
          fontWeight: 700,
          formatter: (value) => Number(value).toFixed(1),
        },
        splitLine: { lineStyle: { color: "#D7E1EA", width: 1 } },
      },
      series: chartSeries,
    };
  }, [comparisonRows, chartItems, metrics, startDate, endDate]);
  const renderChart = (height = 360) => (
    <Box sx={{ width: "100%", minWidth: 0, pb: 0.5 }}>
      <ReactECharts
        option={chartOption}
        style={{ width: "100%", height }}
        opts={{ renderer: "canvas" }}
        notMerge
        lazyUpdate
      />
    </Box>
  );
  const downloadChartHtml = () => {
    if (!comparisonRows.length) return;
    const series = chartItems.flatMap((item) =>
      metrics.map((metric) => ({
        label: `${item.mis_name || item.label} ${metricLabels[metric]}`,
        key: `${item.id}_${metric}`,
        borderColor:
          metric === "schedule"
            ? "#2563EB"
            : metric === "actual"
              ? "#0B8F6A"
              : "#EA580C",
        backgroundColor:
          metric === "deviation" ? "rgba(249,115,22,.28)" : "transparent",
        fill: metric === "deviation",
      })),
    );
    const data = JSON.stringify(comparisonRows).replaceAll("<", "\\u003c");
    const datasets = JSON.stringify(series).replaceAll("<", "\\u003c");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Schedule, Actual & Deviation</title><script src="https://cdn.jsdelivr.net/npm/chart.js"></script><style>body{font-family:Arial,sans-serif;margin:24px;color:#102a43}h1{color:#0754b8}#chart{max-height:72vh}</style></head><body><h1>Schedule, Actual & Deviation</h1><p>${startDate} to ${endDate} · ${frequency}-minute schedule</p><canvas id="chart"></canvas><script>const rows=${data};const series=${datasets};new Chart(document.getElementById('chart'),{type:'line',data:{labels:rows.map(r=>r.timestamp.replace('T',' ')),datasets:series.map(s=>({...s,data:rows.map(r=>r[s.key]??null),tension:.25,pointRadius:0,borderWidth:2}))},options:{responsive:true,interaction:{mode:'index',intersect:false},scales:{x:{ticks:{maxTicksLimit:16}},y:{ticks:{callback:v=>Number(v).toFixed(1)}}}}});</script></body></html>`;
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    link.download = `Schedule_Actual_Deviation_Chart_${startDate}_${endDate}.html`;
    link.click();
    URL.revokeObjectURL(link.href);
  };
  return (
    <AppShell>
      <Box
        sx={{
          minHeight: "calc(100vh - 76px)",
          bgcolor: "#F5F8FC",
          p: { xs: 1, md: 2 },
        }}
      >
        <Box
          sx={{
            mb: 2,
            p: 2.5,
            borderRadius: 3,
            color: "#fff",
            background:
              "linear-gradient(105deg,#07194F 0%,#0754B8 62%,#1186D4 100%)",
          }}
        >
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="center"
          >
            <Box>
              <Typography sx={{ fontSize: 23, fontWeight: 900 }}>
                Schedule & Actual Data
              </Typography>
              <Typography sx={{ fontSize: 12, opacity: 0.9 }}>
                MIS names, WBES schedules, actual generation and deviation.
              </Typography>
            </Box>
            <Table2 size={30} />
          </Stack>
        </Box>
        <Paper
          elevation={0}
          sx={{ p: 2, border: "1px solid #C8E6DE", borderRadius: 3, mb: 2 }}
        >
          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={1.2}
            alignItems={{ md: "center" }}
          >
            <TextField
              label="From date"
              type="date"
              size="small"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="To date"
              type="date"
              size="small"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
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
              sx={{ minWidth: 140 }}
            >
              <MenuItem value="generator">Generator</MenuItem>
              <MenuItem value="state">State</MenuItem>
              <MenuItem value="all">All mapped</MenuItem>
            </TextField>
            <FormControl size="small" sx={{ minWidth: 320, maxWidth: 460 }}>
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
            <Button
              size="small"
              variant="text"
              onClick={() => setSelectedGenerators(visibleGeneratorIds)}
              sx={{ fontWeight: 900, whiteSpace: "nowrap" }}
            >
              Select all
            </Button>
            <Button
              size="small"
              variant="text"
              onClick={() => setSelectedGenerators([])}
              sx={{ fontWeight: 900, whiteSpace: "nowrap" }}
            >
              Use all
            </Button>
            <TextField
              select
              label="Schedule frequency"
              size="small"
              value={frequency}
              onChange={(e) => setFrequency(Number(e.target.value))}
              sx={{ minWidth: 145 }}
            >
              {[15, 5, 1].map((value) => (
                <MenuItem key={value} value={value}>
                  {value}-minute
                </MenuItem>
              ))}
            </TextField>
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
              sx={{ bgcolor: "#0068D9", fontWeight: 900 }}
            >
              {loading || actualLoading
                ? "Fetching data..."
                : "Fetch selected data"}
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
              sx={{ fontWeight: 900 }}
            >
              CSV
            </Button>
            {isAdmin && (
              <Button
                variant="outlined"
                color="secondary"
                onClick={inspectRaw}
                disabled={rawLoading || !selectedItems.length}
                sx={{ fontWeight: 900 }}
              >
                {rawLoading ? "Inspecting…" : "Inspect WBES JSON"}
              </Button>
            )}
            <Stack direction="row" spacing={0.5} sx={{ ml: { md: 1 } }}>
              {Object.entries(metricLabels).map(([metric, label]) => (
                <Button
                  key={metric}
                  size="small"
                  variant={metrics.includes(metric) ? "contained" : "outlined"}
                  onClick={() => toggleMetric(metric)}
                  sx={{ minWidth: 92, fontWeight: 900 }}
                >
                  {label}
                </Button>
              ))}
            </Stack>
          </Stack>
          <Typography sx={{ mt: 1, color: "#64748B", fontSize: 11 }}>
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
            {error}
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
              direction="row"
              alignItems="center"
              justifyContent="space-between"
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
              <Stack direction="row" spacing={0.75} alignItems="center">
                <TextField
                  select
                  size="small"
                  label="Chart view"
                  value={chartScope}
                  onChange={(event) => setChartScope(event.target.value)}
                  sx={{ minWidth: 230 }}
                >
                  <MenuItem value="combined">
                    Combined · {selectedItems.length} selected
                  </MenuItem>
                  {selectedItems.map((item) => (
                    <MenuItem key={item.id} value={String(item.id)}>
                      {item.mis_name || item.label}
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
              </Stack>
            </Stack>
            {renderChart()}
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
            <Stack direction="row" justifyContent="flex-end" sx={{ mb: 1 }}>
              <Button
                size="small"
                startIcon={<Download size={15} />}
                onClick={downloadChartHtml}
              >
                Download HTML chart
              </Button>
            </Stack>
            {renderChart(520)}
          </DialogContent>
        </Dialog>
      </Box>
    </AppShell>
  );
}
