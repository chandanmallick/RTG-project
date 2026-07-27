import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControlLabel,
  Paper,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import {
  Activity,
  Database,
  RefreshCw,
  TrendingUp,
  Upload,
  Zap,
} from "lucide-react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import AppShell from "../components/layout/AppShell";
import { useAuth } from "../auth/AuthContext";
import API from "../services/api";
import {
  CHART_AXIS_PROPS,
  CHART_GRID_PROPS,
  CHART_TOOLTIP_PROPS,
} from "../theme/chartTheme";

const SERIES = [
  { key: "thermal", label: "Thermal", color: "#DC2626" },
  { key: "hydro", label: "Hydro", color: "#0057B7" },
  { key: "wind", label: "Wind", color: "#008645" },
  { key: "solar", label: "Solar", color: "#FFB300" },
  { key: "gas", label: "Gas", color: "#64748B" },
  { key: "nuclear", label: "Nuclear", color: "#7C3AED" },
];

const formatMw = (value) => (
  value === null || value === undefined
    ? "—"
    : `${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 0 })} MW`
);

const displayTimestamp = (value) => (
  value ? value.replace("T", " ").slice(0, 16) : "—"
);

function PlotCard({ title, subtitle, action, children }) {
  return (
    <Paper
      elevation={0}
      sx={{
        border: "1px solid #CFE0F6",
        borderRadius: 3,
        overflow: "hidden",
        bgcolor: "#fff",
      }}
    >
      <Box sx={{ px: 2.25, py: 1.5, borderBottom: "1px solid #E2E8F0", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2 }}>
        <Box>
          <Typography sx={{ color: "#08103A", fontSize: 17, fontWeight: 900 }}>{title}</Typography>
          <Typography sx={{ color: "#64748B", fontSize: 11.5, mt: 0.2 }}>{subtitle}</Typography>
        </Box>
        {action}
      </Box>
      <Box sx={{ p: { xs: 1, md: 2 }, height: { xs: 330, md: 420 } }}>{children}</Box>
    </Paper>
  );
}

export default function NLDCPlots() {
  const { user } = useAuth();
  const canWrite = Boolean(user?.permissions?.nldc_plots?.write);
  const fileInputRef = useRef(null);
  const [dates, setDates] = useState([]);
  const [selectedDate, setSelectedDate] = useState("");
  const [document, setDocument] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [onlyDemand, setOnlyDemand] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });

  const loadDates = useCallback(async (preferredDate = "") => {
    const response = await API.getIndiaOneMinuteDates();
    const available = response.dates || [];
    setDates(available);
    const nextDate = (
      preferredDate && available.some((item) => item.date === preferredDate)
        ? preferredDate
        : selectedDate && available.some((item) => item.date === selectedDate)
          ? selectedDate
          : available[0]?.date || ""
    );
    setSelectedDate(nextDate);
    return nextDate;
  }, [selectedDate]);

  const loadData = useCallback(async (dataDate) => {
    if (!dataDate) {
      setDocument(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const response = await API.getIndiaOneMinuteData(dataDate);
      setDocument(response.data || null);
    } catch (error) {
      setMessage({ type: "error", text: error.response?.data?.detail || "Unable to load NLDC plot data." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDates()
      .then(loadData)
      .catch((error) => {
        setLoading(false);
        setMessage({ type: "error", text: error.response?.data?.detail || "Unable to load saved NLDC dates." });
      });
  // Initial catalogue load only; changing the selected date is handled below.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedDate) loadData(selectedDate);
  }, [selectedDate, loadData]);

  const handleUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploading(true);
    setMessage({ type: "", text: "" });
    try {
      const response = await API.uploadIndiaOneMinuteData(file);
      const saved = response.saved_dates || [];
      const preferred = saved[saved.length - 1]?.date || "";
      const nextDate = await loadDates(preferred);
      await loadData(nextDate);
      setMessage({
        type: "success",
        text: `${saved.length} day${saved.length === 1 ? "" : "s"} saved from ${file.name}. Existing dates were replaced.`,
      });
    } catch (error) {
      setMessage({ type: "error", text: error.response?.data?.detail || "Unable to process the SCADA workbook." });
    } finally {
      setUploading(false);
    }
  };

  const chartRows = useMemo(
    () => (document?.samples || []).map((sample, index) => ({
      ...sample,
      label: sample.time,
      showTick: index % 120 === 0 ? sample.time : "",
    })),
    [document],
  );
  const populatedGeneration = SERIES.filter((series) => document?.fields?.includes(series.key));
  const latest = chartRows[chartRows.length - 1];
  const demandValues = chartRows.map((row) => row.india_demand).filter(Number.isFinite);
  const peakDemand = demandValues.length ? Math.max(...demandValues) : null;

  return (
    <AppShell>
      <Box
        sx={{
          borderRadius: 3,
          color: "#fff",
          px: { xs: 2, md: 3 },
          py: 2,
          background: "linear-gradient(110deg, #08103A 0%, #0057B7 62%, #0F8BD7 100%)",
          boxShadow: "0 12px 28px rgba(0, 87, 183, 0.18)",
          display: "flex",
          alignItems: { xs: "stretch", md: "center" },
          justifyContent: "space-between",
          flexDirection: { xs: "column", md: "row" },
          gap: 2,
        }}
      >
        <Box>
          <Chip
            icon={<Activity size={13} />}
            label="MIS · NLDC DATA"
            size="small"
            sx={{ color: "#fff", border: "1px solid rgba(255,255,255,.45)", bgcolor: "rgba(255,255,255,.10)", fontWeight: 900 }}
          />
          <Typography sx={{ mt: 0.8, fontSize: { xs: 22, md: 27 }, fontWeight: 950, letterSpacing: "-.02em" }}>
            NLDC All India One-Minute Plots
          </Typography>
          <Typography sx={{ mt: 0.25, fontSize: 12, opacity: 0.9 }}>
            Demand and source-wise generation retained from Morning SCADA processing.
          </Typography>
        </Box>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems="center">
          <TextField
            type="date"
            size="small"
            value={selectedDate}
            onChange={(event) => setSelectedDate(event.target.value)}
            inputProps={{ min: dates[dates.length - 1]?.date, max: dates[0]?.date }}
            sx={{
              width: 175,
              bgcolor: "#fff",
              borderRadius: 1.5,
              "& .MuiOutlinedInput-root": { fontWeight: 800 },
            }}
          />
          <Button
            variant="outlined"
            startIcon={<RefreshCw size={16} />}
            onClick={() => loadData(selectedDate)}
            sx={{ color: "#fff", borderColor: "rgba(255,255,255,.75)", fontWeight: 900 }}
          >
            Refresh
          </Button>
          <input ref={fileInputRef} hidden type="file" accept=".xlsx,.xlsm" onChange={handleUpload} />
          <Button
            variant="contained"
            startIcon={uploading ? <CircularProgress size={15} color="inherit" /> : <Upload size={16} />}
            onClick={() => fileInputRef.current?.click()}
            disabled={!canWrite || uploading}
            sx={{ bgcolor: "#fff", color: "#0057B7", fontWeight: 900, "&:hover": { bgcolor: "#EAF2FF" } }}
          >
            Upload SCADA
          </Button>
        </Stack>
      </Box>

      {message.text && <Alert severity={message.type || "info"} onClose={() => setMessage({ type: "", text: "" })}>{message.text}</Alert>}

      {loading ? (
        <Paper elevation={0} sx={{ minHeight: 360, display: "grid", placeItems: "center", border: "1px solid #CFE0F6", borderRadius: 3 }}>
          <CircularProgress />
        </Paper>
      ) : !document ? (
        <Paper elevation={0} sx={{ py: 8, textAlign: "center", border: "1px solid #CFE0F6", borderRadius: 3 }}>
          <Database size={38} color="#7A96B8" />
          <Typography sx={{ mt: 1, color: "#08103A", fontWeight: 900 }}>No one-minute data saved for this date</Typography>
          <Typography sx={{ mt: 0.4, color: "#64748B", fontSize: 12 }}>
            Prepare the Morning DSO report, or use Upload SCADA as a fallback.
          </Typography>
        </Paper>
      ) : (
        <>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(4, 1fr)" }, gap: 1.5 }}>
            {[
              ["Coverage", `${displayTimestamp(document.coverage_start).slice(11)}–${displayTimestamp(document.coverage_end).slice(11)}`, Database],
              ["Samples", Number(document.sample_count || 0).toLocaleString("en-IN"), Activity],
              ["Peak demand", formatMw(peakDemand), TrendingUp],
              ["Latest demand", formatMw(latest?.india_demand), Zap],
            ].map(([label, value, Icon]) => (
              <Paper key={label} elevation={0} sx={{ p: 1.75, border: "1px solid #CFE0F6", borderRadius: 3 }}>
                <Stack direction="row" spacing={1.2} alignItems="center">
                  <Box sx={{ width: 34, height: 34, display: "grid", placeItems: "center", borderRadius: 2, bgcolor: "#EAF2FF", color: "#0057B7" }}><Icon size={18} /></Box>
                  <Box>
                    <Typography sx={{ color: "#64748B", fontSize: 10.5, fontWeight: 800 }}>{label}</Typography>
                    <Typography sx={{ color: "#08103A", fontSize: 16, fontWeight: 950 }}>{value}</Typography>
                  </Box>
                </Stack>
              </Paper>
            ))}
          </Box>

          {!document.is_complete_day && (
            <Alert severity="info">Partial day saved through {displayTimestamp(document.coverage_end)}. It will be replaced when the next Morning workbook supplies the complete day.</Alert>
          )}

          <PlotCard
            title="All India Demand & Generation Mix"
            subtitle={`${selectedDate} · generation sources are stacked areas; demand is overlaid as a line`}
            action={(
              <FormControlLabel
                control={<Switch checked={onlyDemand} onChange={(event) => setOnlyDemand(event.target.checked)} color="primary" />}
                label="Only Demand"
                sx={{
                  m: 0,
                  px: 1.1,
                  py: 0.2,
                  border: "1px solid #CFE0F6",
                  borderRadius: 2,
                  whiteSpace: "nowrap",
                  "& .MuiFormControlLabel-label": { color: "#0057B7", fontSize: 12, fontWeight: 900 },
                }}
              />
            )}
          >
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartRows} margin={{ top: 12, right: 26, left: 18, bottom: 8 }}>
                <defs>
                  {populatedGeneration.map((series) => (
                    <linearGradient key={series.key} id={`nldc-${series.key}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={series.color} stopOpacity={0.92} />
                      <stop offset="100%" stopColor={series.color} stopOpacity={0.62} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid {...CHART_GRID_PROPS} />
                <XAxis dataKey="showTick" interval={0} {...CHART_AXIS_PROPS} />
                <YAxis
                  tickFormatter={(value) => Number(value).toLocaleString("en-IN")}
                  width={72}
                  domain={onlyDemand
                    ? [
                        (minimum) => Math.floor(minimum * 0.98),
                        (maximum) => Math.ceil(maximum * 1.02),
                      ]
                    : [0, "auto"]}
                  {...CHART_AXIS_PROPS}
                />
                <Tooltip
                  {...CHART_TOOLTIP_PROPS}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.time || ""}
                  formatter={(value, name) => [formatMw(value), name]}
                />
                <Legend />
                {!onlyDemand && populatedGeneration.map((series) => (
                  <Area
                    key={series.key}
                    type="monotone"
                    dataKey={series.key}
                    name={series.label}
                    stackId="generation"
                    stroke={series.color}
                    strokeWidth={0.8}
                    fill={`url(#nldc-${series.key})`}
                    connectNulls
                  />
                ))}
                <Line
                  type="monotone"
                  dataKey="india_demand"
                  name="All India Demand"
                  stroke="#08103A"
                  strokeWidth={3}
                  dot={false}
                  connectNulls
                />
              </ComposedChart>
            </ResponsiveContainer>
          </PlotCard>
        </>
      )}
    </AppShell>
  );
}
