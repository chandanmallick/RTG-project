import { useState, useEffect } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  Checkbox,
  Chip,
  CircularProgress,
  Collapse,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import {
  ChevronDown,
  ChevronRight,
  Download,
  Expand,
  FileArchive,
  Layers,
  Maximize2,
  Play,
  RotateCcw,
  TrendingDown,
  X,
  ZoomIn,
} from "lucide-react";
import CalendarInput from "../../../components/ui/CalendarInput";
import API from "../../../services/api";

const PRESET_COMPARISONS = [
  { id: "sep", label: "September 2026", start_date: "2026-09-01", end_date: "2026-09-30" },
  { id: "sep_oct8", label: "01 Sep – 08 Oct 2026", start_date: "2026-09-01", end_date: "2026-10-08" },
  { id: "oct", label: "October 2026", start_date: "2026-10-01", end_date: "2026-10-31" },
];

export default function FrequencyCurvesPanel({ result, sessionToken, saveBlob }) {
  const session = sessionToken || result?.session_token;
  const token = result?.result_token;

  const defaultStart = result?.summary?.analysis_start?.slice(0, 10) || "2026-09-01";
  const defaultEnd = result?.summary?.analysis_end?.slice(0, 10) || "2026-10-31";

  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);

  // Graph 2 Comparison periods selection
  const [selectedComparisons, setSelectedComparisons] = useState(["sep", "sep_oct8", "oct"]);

  const [loading, setLoading] = useState(false);
  const [downloadingZip, setDownloadingZip] = useState(false);
  const [downloadingCurve, setDownloadingCurve] = useState("");
  const [error, setError] = useState("");
  const [curvesData, setCurvesData] = useState(null);

  // Enlarged modal
  const [enlargedModal, setEnlargedModal] = useState(null);

  // Daily records table collapse
  const [showDailyTable, setShowDailyTable] = useState(false);

  useEffect(() => {
    if (result?.summary?.analysis_start) {
      setStartDate(result.summary.analysis_start.slice(0, 10));
    }
    if (result?.summary?.analysis_end) {
      setEndDate(result.summary.analysis_end.slice(0, 10));
    }
  }, [result?.summary?.analysis_start, result?.summary?.analysis_end]);

  const fetchCurves = async (overrideStart = null, overrideEnd = null, overrideComps = null) => {
    if (!session) {
      setError("Active session not found. Please upload or run an analysis first.");
      return;
    }

    setLoading(true);
    setError("");

    const sDate = overrideStart !== null ? overrideStart : startDate;
    const eDate = overrideEnd !== null ? overrideEnd : endDate;
    const comps = overrideComps !== null ? overrideComps : selectedComparisons;

    const activeComparisonObjects = PRESET_COMPARISONS.filter((p) => comps.includes(p.id)).map((p) => ({
      label: p.label,
      start_date: p.start_date,
      end_date: p.end_date,
    }));

    try {
      const res = await API.getFrequencyCurves({
        session_token: session,
        result_token: token,
        start_date: sDate || null,
        end_date: eDate || null,
        comparison_periods: activeComparisonObjects.length > 0 ? activeComparisonObjects : null,
        dpi: 300,
      });
      setCurvesData(res);
    } catch (err) {
      const msg = err?.response?.data?.detail || err.message;
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (session && !curvesData && !loading && !error) {
      fetchCurves();
    }
  }, [session]);

  const handleDownloadSingle = async (curveType, filename) => {
    if (!session) return;
    setDownloadingCurve(curveType);
    setError("");

    const activeComparisonObjects = PRESET_COMPARISONS.filter((p) => selectedComparisons.includes(p.id)).map((p) => ({
      label: p.label,
      start_date: p.start_date,
      end_date: p.end_date,
    }));

    try {
      const blob = await API.downloadFrequencyCurvePlot(curveType, {
        session_token: session,
        result_token: token,
        start_date: startDate || null,
        end_date: endDate || null,
        comparison_periods: activeComparisonObjects.length > 0 ? activeComparisonObjects : null,
        dpi: 400,
      });

      if (saveBlob) {
        await saveBlob(blob, filename);
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      let msg = err?.response?.data?.detail || err.message;
      if (err?.response?.data instanceof Blob) {
        try {
          msg = JSON.parse(await err.response.data.text()).detail || msg;
        } catch {}
      }
      setError(msg);
    } finally {
      setDownloadingCurve("");
    }
  };

  const handleDownloadZip = async () => {
    if (!session) return;
    setDownloadingZip(true);
    setError("");

    const activeComparisonObjects = PRESET_COMPARISONS.filter((p) => selectedComparisons.includes(p.id)).map((p) => ({
      label: p.label,
      start_date: p.start_date,
      end_date: p.end_date,
    }));

    try {
      const blob = await API.downloadFrequencyCurvesZip({
        session_token: session,
        result_token: token,
        start_date: startDate || null,
        end_date: endDate || null,
        comparison_periods: activeComparisonObjects.length > 0 ? activeComparisonObjects : null,
        dpi: 400,
      });

      if (saveBlob) {
        await saveBlob(blob, "Frequency_Analysis_Curves.zip");
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "Frequency_Analysis_Curves.zip";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      let msg = err?.response?.data?.detail || err.message;
      if (err?.response?.data instanceof Blob) {
        try {
          msg = JSON.parse(await err.response.data.text()).detail || msg;
        } catch {}
      }
      setError(msg);
    } finally {
      setDownloadingZip(false);
    }
  };

  const handleApplyPreset = (s, e) => {
    setStartDate(s);
    setEndDate(e);
    fetchCurves(s, e);
  };

  const toggleComparison = (id) => {
    const next = selectedComparisons.includes(id)
      ? selectedComparisons.filter((item) => item !== id)
      : [...selectedComparisons, id];
    setSelectedComparisons(next);
  };

  const statsG1 = curvesData?.statistics?.daily_min_duration;
  const statsG2 = curvesData?.statistics?.duration_curve;
  const statsG3 = curvesData?.statistics?.daily_profile;

  return (
    <Box sx={{ mt: 2 }}>
      {/* Configuration Controls Card */}
      <Paper
        elevation={0}
        variant="outlined"
        sx={{
          p: 2.5,
          borderRadius: 2.5,
          bgcolor: "#F8FAFC",
          borderColor: "#CBD5E1",
          mb: 3,
        }}
      >
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
          <Box>
            <Typography sx={{ fontSize: 17, fontWeight: 900, color: "#17365D", mb: 0.5 }}>
              Frequency Analysis Curves (ERLDC / GRID-INDIA Publication)
            </Typography>
            <Typography sx={{ fontSize: 12, color: "#64748B", maxWidth: 920 }}>
              Three publication-ready analytical frequency curves computed strictly from continuous 1-minute SCADA frequency data for monthly and long-period operational reporting.
            </Typography>
          </Box>

          <Stack direction="row" spacing={1} sx={{ mt: { xs: 1.5, sm: 0 } }}>
            <Button
              variant="contained"
              size="small"
              startIcon={loading ? <CircularProgress size={14} color="inherit" /> : <Play size={14} />}
              onClick={() => fetchCurves()}
              disabled={loading}
              sx={{
                bgcolor: "#17365D",
                "&:hover": { bgcolor: "#0f243e" },
                fontWeight: 700,
                textTransform: "none",
                fontSize: 12.5,
                px: 2,
              }}
            >
              {loading ? "Generating Curves…" : "Generate Curves"}
            </Button>

            <Button
              variant="outlined"
              size="small"
              startIcon={downloadingZip ? <CircularProgress size={14} /> : <FileArchive size={14} />}
              onClick={handleDownloadZip}
              disabled={loading || downloadingZip || !curvesData}
              sx={{
                borderColor: "#059669",
                color: "#059669",
                "&:hover": { borderColor: "#047857", bgcolor: "#ECFDF5" },
                fontWeight: 700,
                textTransform: "none",
                fontSize: 12.5,
              }}
            >
              {downloadingZip ? "Packaging…" : "Download All Curves (ZIP)"}
            </Button>
          </Stack>
        </Stack>

        <Divider sx={{ my: 1.5, borderColor: "#E2E8F0" }} />

        {/* Date Range Selection & Quick Range Buttons */}
        <Box sx={{ mb: 2 }}>
          <Typography sx={{ fontSize: 12, fontWeight: 800, color: "#334155", mb: 1 }}>
            Primary Analysis Period (Applies to all 3 graphs)
          </Typography>
          <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
            <CalendarInput
              value={startDate}
              onChange={(val) => setStartDate(val)}
              placeholder="Start Date"
              disabled={loading}
            />
            <Typography sx={{ fontSize: 12, color: "#64748B" }}>to</Typography>
            <CalendarInput
              value={endDate}
              onChange={(val) => setEndDate(val)}
              placeholder="End Date"
              disabled={loading}
            />

            {/* Quick Presets */}
            <Stack direction="row" spacing={0.8} alignItems="center" flexWrap="wrap" useFlexGap sx={{ ml: { sm: 1 } }}>
              <Typography sx={{ fontSize: 11, fontWeight: 700, color: "#64748B", mr: 0.5 }}>Presets:</Typography>
              <Chip
                label="Full Period (Sep–Oct)"
                size="small"
                clickable
                variant={startDate === "2026-09-01" && endDate === "2026-10-31" ? "filled" : "outlined"}
                onClick={() => handleApplyPreset("2026-09-01", "2026-10-31")}
                disabled={loading}
                sx={{ fontSize: 11, fontWeight: 700 }}
              />
              <Chip
                label="September 2026"
                size="small"
                clickable
                variant={startDate === "2026-09-01" && endDate === "2026-09-30" ? "filled" : "outlined"}
                onClick={() => handleApplyPreset("2026-09-01", "2026-09-30")}
                disabled={loading}
                sx={{ fontSize: 11, fontWeight: 700 }}
              />
              <Chip
                label="01 Sep – 08 Oct 2026"
                size="small"
                clickable
                variant={startDate === "2026-09-01" && endDate === "2026-10-08" ? "filled" : "outlined"}
                onClick={() => handleApplyPreset("2026-09-01", "2026-10-08")}
                disabled={loading}
                sx={{ fontSize: 11, fontWeight: 700 }}
              />
              <Chip
                label="October 2026"
                size="small"
                clickable
                variant={startDate === "2026-10-01" && endDate === "2026-10-31" ? "filled" : "outlined"}
                onClick={() => handleApplyPreset("2026-10-01", "2026-10-31")}
                disabled={loading}
                sx={{ fontSize: 11, fontWeight: 700 }}
              />
            </Stack>
          </Stack>
        </Box>

        {/* Comparison Period Selection for Graph 2 */}
        <Box sx={{ bgcolor: "#FFFFFF", p: 1.5, borderRadius: 1.5, border: "1px solid #E2E8F0" }}>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.8 }}>
            <Layers size={15} color="#17365D" />
            <Typography sx={{ fontSize: 12, fontWeight: 800, color: "#17365D" }}>
              Graph 2 Multi-Period Comparison Overlays:
            </Typography>
            <Typography sx={{ fontSize: 11, color: "#64748B" }}>
              (Select benchmark periods to compare cumulative frequency distribution against primary curve)
            </Typography>
          </Stack>
          <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap alignItems="center">
            {PRESET_COMPARISONS.map((comp) => {
              const isChecked = selectedComparisons.includes(comp.id);
              return (
                <FormControlLabel
                  key={comp.id}
                  control={
                    <Checkbox
                      size="small"
                      checked={isChecked}
                      onChange={() => toggleComparison(comp.id)}
                      disabled={loading}
                    />
                  }
                  label={
                    <Typography sx={{ fontSize: 11.5, fontWeight: isChecked ? 700 : 500, color: isChecked ? "#17365D" : "#475569" }}>
                      {comp.label}
                    </Typography>
                  }
                />
              );
            })}
            <Button
              size="small"
              variant="text"
              onClick={() => fetchCurves()}
              disabled={loading}
              sx={{ fontSize: 11, textTransform: "none", color: "#17365D", fontWeight: 700 }}
            >
              Update Graph 2 Overlays
            </Button>
          </Stack>
        </Box>
      </Paper>

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

      {loading && (
        <Stack alignItems="center" sx={{ py: 6 }}>
          <CircularProgress size={36} sx={{ color: "#17365D" }} />
          <Typography sx={{ mt: 2, fontSize: 13, fontWeight: 700, color: "#475569" }}>
            Computing 1-minute frequency duration distributions and rendering publication graphs…
          </Typography>
        </Stack>
      )}

      {/* CURVE PANELS */}
      {!loading && curvesData && (
        <Stack spacing={4}>
          {/* ============================================================== */}
          {/* GRAPH 1: Daily Minimum Frequency + Low-Frequency Duration     */}
          {/* ============================================================== */}
          <Paper
            elevation={0}
            variant="outlined"
            sx={{
              p: 2.5,
              borderRadius: 2.5,
              borderColor: "#CBD5E1",
              bgcolor: "#FFFFFF",
              boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.05)",
            }}
          >
            <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
              <Box>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography sx={{ fontSize: 15.5, fontWeight: 900, color: "#17365D" }}>
                    Graph 1 – Daily Minimum Frequency & Low-Frequency Duration
                  </Typography>
                  <Chip
                    label={curvesData.period || "Selected Period"}
                    size="small"
                    sx={{ fontSize: 11, fontWeight: 700, bgcolor: "#EFF6FF", color: "#1D4ED8", borderColor: "#BFDBFE" }}
                    variant="outlined"
                  />
                </Stack>
                <Typography sx={{ fontSize: 11.5, color: "#64748B", mt: 0.3 }}>
                  Combined two-panel chart: Upper panel shows daily minimum frequency line with reference levels (49.90, 49.50, 49.40 Hz) and reported UFR events. Lower panel shows stacked duration bars for low-frequency bands with month transition separators.
                </Typography>
              </Box>

              <Stack direction="row" spacing={1}>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<Maximize2 size={13} />}
                  onClick={() =>
                    setEnlargedModal({
                      title: "Daily Minimum Frequency & Low-Frequency Duration",
                      imgUri: curvesData.plots_base64.daily_min_duration,
                      curveType: "daily_min_duration",
                      filename: "Daily_Minimum_and_Duration.png",
                    })
                  }
                  sx={{ textTransform: "none", fontSize: 11.5, fontWeight: 700 }}
                >
                  Enlarge
                </Button>
                <Button
                  size="small"
                  variant="contained"
                  startIcon={downloadingCurve === "daily_min_duration" ? <CircularProgress size={13} color="inherit" /> : <Download size={13} />}
                  onClick={() => handleDownloadSingle("daily_min_duration", "Daily_Minimum_and_Duration.png")}
                  disabled={downloadingCurve === "daily_min_duration"}
                  sx={{
                    bgcolor: "#17365D",
                    "&:hover": { bgcolor: "#0f243e" },
                    textTransform: "none",
                    fontSize: 11.5,
                    fontWeight: 700,
                  }}
                >
                  Download PNG (400 DPI)
                </Button>
              </Stack>
            </Stack>

            {/* Statistical Highlights Strip */}
            {statsG1 && (
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "repeat(2, 1fr)", sm: "repeat(5, 1fr)" },
                  gap: 1.5,
                  mb: 2,
                  p: 1.5,
                  bgcolor: "#F8FAFC",
                  borderRadius: 1.5,
                  border: "1px solid #E2E8F0",
                }}
              >
                <Box>
                  <Typography sx={{ fontSize: 10.5, color: "#64748B", textTransform: "uppercase", fontWeight: 700 }}>
                    Days Analyzed
                  </Typography>
                  <Typography sx={{ fontSize: 16, fontWeight: 900, color: "#17365D" }}>
                    {statsG1.days_analyzed} Days
                  </Typography>
                </Box>
                <Box>
                  <Typography sx={{ fontSize: 10.5, color: "#64748B", textTransform: "uppercase", fontWeight: 700 }}>
                    Absolute Lowest Min
                  </Typography>
                  <Typography sx={{ fontSize: 16, fontWeight: 900, color: "#DC2626" }}>
                    {statsG1.min_frequency?.toFixed(3)} Hz
                  </Typography>
                  <Typography sx={{ fontSize: 10, color: "#94A3B8" }}>
                    on {statsG1.min_frequency_date}
                  </Typography>
                </Box>
                <Box>
                  <Typography sx={{ fontSize: 10.5, color: "#64748B", textTransform: "uppercase", fontWeight: 700 }}>
                    Days Min &lt; 49.90 Hz
                  </Typography>
                  <Typography sx={{ fontSize: 16, fontWeight: 900, color: "#7B2CBF" }}>
                    {statsG1.days_below_49_90} Days
                  </Typography>
                  <Typography sx={{ fontSize: 10, color: "#94A3B8" }}>
                    ({statsG1.days_analyzed > 0 ? ((statsG1.days_below_49_90 / statsG1.days_analyzed) * 100).toFixed(1) : 0}%)
                  </Typography>
                </Box>
                <Box>
                  <Typography sx={{ fontSize: 10.5, color: "#64748B", textTransform: "uppercase", fontWeight: 700 }}>
                    Days Min &lt; 49.50 Hz
                  </Typography>
                  <Typography sx={{ fontSize: 16, fontWeight: 900, color: "#EA580C" }}>
                    {statsG1.days_below_49_50} Days
                  </Typography>
                  <Typography sx={{ fontSize: 10, color: "#94A3B8" }}>
                    (Severe dip condition)
                  </Typography>
                </Box>
                <Box>
                  <Typography sx={{ fontSize: 10.5, color: "#64748B", textTransform: "uppercase", fontWeight: 700 }}>
                    UFR Events Reported
                  </Typography>
                  <Typography sx={{ fontSize: 16, fontWeight: 900, color: "#B91C1C" }}>
                    {statsG1.ufr_events_count} Events
                  </Typography>
                  <Typography sx={{ fontSize: 10, color: "#94A3B8" }}>
                    Stage 1 (49.50) / Stage 2 (49.40)
                  </Typography>
                </Box>
              </Box>
            )}

            {/* Plot Image Container */}
            <Box
              sx={{
                width: "100%",
                borderRadius: 1.5,
                border: "1px solid #E2E8F0",
                bgcolor: "#FFFFFF",
                p: 1,
                textAlign: "center",
                cursor: "zoom-in",
              }}
              onClick={() =>
                setEnlargedModal({
                  title: "Daily Minimum Frequency & Low-Frequency Duration",
                  imgUri: curvesData.plots_base64.daily_min_duration,
                  curveType: "daily_min_duration",
                  filename: "Daily_Minimum_and_Duration.png",
                })
              }
              title="Click to view full-resolution plot"
            >
              <Box
                component="img"
                src={curvesData.plots_base64.daily_min_duration}
                alt="Daily Minimum Frequency and Low-Frequency Duration"
                sx={{
                  width: "100%",
                  maxHeight: 640,
                  objectFit: "contain",
                  display: "block",
                  margin: "0 auto",
                }}
              />
            </Box>

            {/* Collapsible Daily Details Table */}
            <Box sx={{ mt: 2 }}>
              <Button
                size="small"
                variant="text"
                startIcon={showDailyTable ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                onClick={() => setShowDailyTable((v) => !v)}
                sx={{ textTransform: "none", fontSize: 11.5, fontWeight: 700, color: "#17365D" }}
              >
                {showDailyTable ? "Hide Daily Breakdown Table" : "View Daily Minimum & Band Duration Breakdown Table"}
              </Button>

              <Collapse in={showDailyTable}>
                <TableContainer sx={{ mt: 1.5, maxHeight: 360, border: "1px solid #E2E8F0", borderRadius: 1.5 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow sx={{ bgcolor: "#17365D" }}>
                        <TableCell sx={{ color: "white", fontWeight: 800, fontSize: 11, py: 0.8, bgcolor: "#17365D" }}>Date</TableCell>
                        <TableCell sx={{ color: "white", fontWeight: 800, fontSize: 11, py: 0.8, bgcolor: "#17365D" }}>Min Freq (Hz)</TableCell>
                        <TableCell sx={{ color: "white", fontWeight: 800, fontSize: 11, py: 0.8, bgcolor: "#17365D" }}>Time of Min</TableCell>
                        <TableCell sx={{ color: "white", fontWeight: 800, fontSize: 11, py: 0.8, bgcolor: "#17365D" }}>&lt;49.50 Hz (% &amp; min)</TableCell>
                        <TableCell sx={{ color: "white", fontWeight: 800, fontSize: 11, py: 0.8, bgcolor: "#17365D" }}>49.50–49.70 Hz (%)</TableCell>
                        <TableCell sx={{ color: "white", fontWeight: 800, fontSize: 11, py: 0.8, bgcolor: "#17365D" }}>49.70–49.85 Hz (%)</TableCell>
                        <TableCell sx={{ color: "white", fontWeight: 800, fontSize: 11, py: 0.8, bgcolor: "#17365D" }}>49.85–49.90 Hz (%)</TableCell>
                        <TableCell sx={{ color: "white", fontWeight: 800, fontSize: 11, py: 0.8, bgcolor: "#17365D" }}>Total &lt;49.90 Hz (%)</TableCell>
                        <TableCell sx={{ color: "white", fontWeight: 800, fontSize: 11, py: 0.8, bgcolor: "#17365D" }}>UFR Event</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {statsG1?.daily_records?.map((r) => {
                        const isSevere = r.min_freq < 49.50;
                        const hasUfr = r.ufr_reported;
                        return (
                          <TableRow
                            key={r.date}
                            hover
                            sx={{
                              bgcolor: isSevere ? "#FEF2F2" : "inherit",
                              "&:hover": { bgcolor: "#F1F5F9" },
                            }}
                          >
                            <TableCell sx={{ fontSize: 11, fontWeight: 700, py: 0.5 }}>{r.date}</TableCell>
                            <TableCell
                              sx={{
                                fontSize: 11,
                                fontWeight: 800,
                                py: 0.5,
                                color: r.min_freq < 49.50 ? "#DC2626" : r.min_freq < 49.90 ? "#B45309" : "#059669",
                              }}
                            >
                              {r.min_freq?.toFixed(3)}
                            </TableCell>
                            <TableCell sx={{ fontSize: 11, py: 0.5, color: "#64748B" }}>{r.time_of_min || "—"}</TableCell>
                            <TableCell sx={{ fontSize: 11, py: 0.5, color: r.pct_below_49_50 > 0 ? "#DC2626" : "#64748B", fontWeight: r.pct_below_49_50 > 0 ? 700 : 400 }}>
                              {r.pct_below_49_50?.toFixed(2)}% ({r.min_below_49_50 || 0} m)
                            </TableCell>
                            <TableCell sx={{ fontSize: 11, py: 0.5 }}>{r.pct_49_50_49_70?.toFixed(2)}%</TableCell>
                            <TableCell sx={{ fontSize: 11, py: 0.5 }}>{r.pct_49_70_49_85?.toFixed(2)}%</TableCell>
                            <TableCell sx={{ fontSize: 11, py: 0.5 }}>{r.pct_49_85_49_90?.toFixed(2)}%</TableCell>
                            <TableCell sx={{ fontSize: 11, py: 0.5, fontWeight: 800, color: r.pct_total_below_49_90 > 2.0 ? "#9333EA" : "#17365D" }}>
                              {r.pct_total_below_49_90?.toFixed(2)}%
                            </TableCell>
                            <TableCell sx={{ fontSize: 11, py: 0.5 }}>
                              {hasUfr ? (
                                <Chip label="Reported" size="small" sx={{ fontSize: 10, height: 20, bgcolor: "#DC2626", color: "white", fontWeight: 700 }} />
                              ) : (
                                "—"
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Collapse>
            </Box>
          </Paper>

          {/* ============================================================== */}
          {/* GRAPH 2: Frequency Duration Curve / Cumulative Distribution  */}
          {/* ============================================================== */}
          <Paper
            elevation={0}
            variant="outlined"
            sx={{
              p: 2.5,
              borderRadius: 2.5,
              borderColor: "#CBD5E1",
              bgcolor: "#FFFFFF",
              boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.05)",
            }}
          >
            <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
              <Box>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography sx={{ fontSize: 15.5, fontWeight: 900, color: "#17365D" }}>
                    Graph 2 – Frequency Duration Curve / Cumulative Distribution
                  </Typography>
                  <Chip
                    label="P(Frequency ≤ f)"
                    size="small"
                    sx={{ fontSize: 11, fontWeight: 700, bgcolor: "#F0FDF4", color: "#166534", borderColor: "#BBF7D0" }}
                    variant="outlined"
                  />
                </Stack>
                <Typography sx={{ fontSize: 11.5, color: "#64748B", mt: 0.3 }}>
                  X-axis: Frequency (Hz), Y-axis: Share of time below frequency (%). Highlighting IEGC normal band (49.90–50.05 Hz), key operational threshold lines, and multi-period comparisons.
                </Typography>
              </Box>

              <Stack direction="row" spacing={1}>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<Maximize2 size={13} />}
                  onClick={() =>
                    setEnlargedModal({
                      title: "Frequency Duration Curve / Cumulative Distribution",
                      imgUri: curvesData.plots_base64.duration_curve,
                      curveType: "duration_curve",
                      filename: "Frequency_Duration_Curve.png",
                    })
                  }
                  sx={{ textTransform: "none", fontSize: 11.5, fontWeight: 700 }}
                >
                  Enlarge
                </Button>
                <Button
                  size="small"
                  variant="contained"
                  startIcon={downloadingCurve === "duration_curve" ? <CircularProgress size={13} color="inherit" /> : <Download size={13} />}
                  onClick={() => handleDownloadSingle("duration_curve", "Frequency_Duration_Curve.png")}
                  disabled={downloadingCurve === "duration_curve"}
                  sx={{
                    bgcolor: "#17365D",
                    "&:hover": { bgcolor: "#0f243e" },
                    textTransform: "none",
                    fontSize: 11.5,
                    fontWeight: 700,
                  }}
                >
                  Download PNG (400 DPI)
                </Button>
              </Stack>
            </Stack>

            {/* Key Dynamic Threshold Metrics Strip (Prompt Requirement) */}
            {statsG2?.primary_curve?.thresholds && (
              <Box sx={{ mb: 2 }}>
                <Typography sx={{ fontSize: 11, fontWeight: 800, color: "#64748B", textTransform: "uppercase", mb: 1 }}>
                  Dynamically Calculated Thresholds ({statsG2.primary_curve.label || "Selected Period"}):
                </Typography>
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: { xs: "repeat(2, 1fr)", sm: "repeat(6, 1fr)" },
                    gap: 1.5,
                  }}
                >
                  <Box sx={{ p: 1.2, bgcolor: "#FEF2F2", borderRadius: 1.5, border: "1px solid #FECACA" }}>
                    <Typography sx={{ fontSize: 10, fontWeight: 800, color: "#991B1B" }}>Below 49.50 Hz</Typography>
                    <Typography sx={{ fontSize: 16, fontWeight: 900, color: "#DC2626" }}>
                      {statsG2.primary_curve.thresholds["49.50"]?.percentage?.toFixed(2)}%
                    </Typography>
                    <Typography sx={{ fontSize: 9.5, color: "#7F1D1D" }}>
                      {statsG2.primary_curve.thresholds["49.50"]?.count?.toLocaleString()} minutes
                    </Typography>
                  </Box>

                  <Box sx={{ p: 1.2, bgcolor: "#FFF7ED", borderRadius: 1.5, border: "1px solid #FFEDD5" }}>
                    <Typography sx={{ fontSize: 10, fontWeight: 800, color: "#9A3412" }}>Below 49.70 Hz</Typography>
                    <Typography sx={{ fontSize: 16, fontWeight: 900, color: "#EA580C" }}>
                      {statsG2.primary_curve.thresholds["49.70"]?.percentage?.toFixed(2)}%
                    </Typography>
                    <Typography sx={{ fontSize: 9.5, color: "#7C2D12" }}>
                      {statsG2.primary_curve.thresholds["49.70"]?.count?.toLocaleString()} minutes
                    </Typography>
                  </Box>

                  <Box sx={{ p: 1.2, bgcolor: "#FAF5FF", borderRadius: 1.5, border: "1px solid #F3E8FF" }}>
                    <Typography sx={{ fontSize: 10, fontWeight: 800, color: "#6B21A8" }}>Below 49.90 Hz</Typography>
                    <Typography sx={{ fontSize: 16, fontWeight: 900, color: "#7B2CBF" }}>
                      {statsG2.primary_curve.thresholds["49.90"]?.percentage?.toFixed(2)}%
                    </Typography>
                    <Typography sx={{ fontSize: 9.5, color: "#581C87" }}>
                      IEGC lower band
                    </Typography>
                  </Box>

                  <Box sx={{ p: 1.2, bgcolor: "#EFF6FF", borderRadius: 1.5, border: "1px solid #DBEAFE" }}>
                    <Typography sx={{ fontSize: 10, fontWeight: 800, color: "#1E40AF" }}>Below 50.00 Hz</Typography>
                    <Typography sx={{ fontSize: 16, fontWeight: 900, color: "#2563EB" }}>
                      {statsG2.primary_curve.thresholds["50.00"]?.percentage?.toFixed(2)}%
                    </Typography>
                    <Typography sx={{ fontSize: 9.5, color: "#1E3A8A" }}>
                      Nominal grid center
                    </Typography>
                  </Box>

                  <Box sx={{ p: 1.2, bgcolor: "#F0FDF4", borderRadius: 1.5, border: "1px solid #DCFCE7" }}>
                    <Typography sx={{ fontSize: 10, fontWeight: 800, color: "#166534" }}>Below 50.05 Hz</Typography>
                    <Typography sx={{ fontSize: 16, fontWeight: 900, color: "#16A34A" }}>
                      {statsG2.primary_curve.thresholds["50.05"]?.percentage?.toFixed(2)}%
                    </Typography>
                    <Typography sx={{ fontSize: 9.5, color: "#14532D" }}>
                      IEGC upper band
                    </Typography>
                  </Box>

                  <Box sx={{ p: 1.2, bgcolor: "#ECFDF5", borderRadius: 1.5, border: "1px solid #A7F3D0" }}>
                    <Typography sx={{ fontSize: 10, fontWeight: 800, color: "#065F46" }}>Within IEGC Band</Typography>
                    <Typography sx={{ fontSize: 16, fontWeight: 900, color: "#059669" }}>
                      {(
                        (statsG2.primary_curve.thresholds["50.05"]?.percentage || 0) -
                        (statsG2.primary_curve.thresholds["49.90"]?.percentage || 0)
                      ).toFixed(2)}%
                    </Typography>
                    <Typography sx={{ fontSize: 9.5, color: "#064E3B" }}>
                      49.90–50.05 Hz
                    </Typography>
                  </Box>
                </Box>
              </Box>
            )}

            {/* Plot Image Container */}
            <Box
              sx={{
                width: "100%",
                borderRadius: 1.5,
                border: "1px solid #E2E8F0",
                bgcolor: "#FFFFFF",
                p: 1,
                textAlign: "center",
                cursor: "zoom-in",
              }}
              onClick={() =>
                setEnlargedModal({
                  title: "Frequency Duration Curve / Cumulative Distribution",
                  imgUri: curvesData.plots_base64.duration_curve,
                  curveType: "duration_curve",
                  filename: "Frequency_Duration_Curve.png",
                })
              }
              title="Click to view full-resolution plot"
            >
              <Box
                component="img"
                src={curvesData.plots_base64.duration_curve}
                alt="Frequency Duration Curve"
                sx={{
                  width: "100%",
                  maxHeight: 640,
                  objectFit: "contain",
                  display: "block",
                  margin: "0 auto",
                }}
              />
            </Box>

            {/* Multi-Period Comparison Table (if comparison curves exist) */}
            {statsG2?.comparison_curves?.length > 0 && (
              <Box sx={{ mt: 2 }}>
                <Typography sx={{ fontSize: 11.5, fontWeight: 800, color: "#334155", mb: 1 }}>
                  Comparison Period Threshold Breakdown:
                </Typography>
                <TableContainer sx={{ border: "1px solid #E2E8F0", borderRadius: 1.5 }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ bgcolor: "#17365D" }}>
                        <TableCell sx={{ color: "white", fontWeight: 800, fontSize: 11, py: 0.8, bgcolor: "#17365D" }}>Period</TableCell>
                        <TableCell sx={{ color: "white", fontWeight: 800, fontSize: 11, py: 0.8, bgcolor: "#17365D" }}>Minutes</TableCell>
                        <TableCell sx={{ color: "white", fontWeight: 800, fontSize: 11, py: 0.8, bgcolor: "#17365D" }}>&lt;49.50 Hz (%)</TableCell>
                        <TableCell sx={{ color: "white", fontWeight: 800, fontSize: 11, py: 0.8, bgcolor: "#17365D" }}>&lt;49.70 Hz (%)</TableCell>
                        <TableCell sx={{ color: "white", fontWeight: 800, fontSize: 11, py: 0.8, bgcolor: "#17365D" }}>&lt;49.90 Hz (%)</TableCell>
                        <TableCell sx={{ color: "white", fontWeight: 800, fontSize: 11, py: 0.8, bgcolor: "#17365D" }}>&lt;50.00 Hz (%)</TableCell>
                        <TableCell sx={{ color: "white", fontWeight: 800, fontSize: 11, py: 0.8, bgcolor: "#17365D" }}>&lt;50.05 Hz (%)</TableCell>
                        <TableCell sx={{ color: "white", fontWeight: 800, fontSize: 11, py: 0.8, bgcolor: "#17365D" }}>In Band (49.90–50.05)</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {/* Primary Row */}
                      {statsG2.primary_curve && (
                        <TableRow sx={{ bgcolor: "#F8FAFC" }}>
                          <TableCell sx={{ fontSize: 11, fontWeight: 800, color: "#17365D", py: 0.6 }}>
                            {statsG2.primary_curve.label} (Primary)
                          </TableCell>
                          <TableCell sx={{ fontSize: 11, py: 0.6 }}>{statsG2.primary_curve.total_points?.toLocaleString()}</TableCell>
                          <TableCell sx={{ fontSize: 11, py: 0.6, fontWeight: 700, color: "#DC2626" }}>
                            {statsG2.primary_curve.thresholds["49.50"]?.percentage?.toFixed(2)}%
                          </TableCell>
                          <TableCell sx={{ fontSize: 11, py: 0.6, fontWeight: 700, color: "#EA580C" }}>
                            {statsG2.primary_curve.thresholds["49.70"]?.percentage?.toFixed(2)}%
                          </TableCell>
                          <TableCell sx={{ fontSize: 11, py: 0.6, fontWeight: 700, color: "#7B2CBF" }}>
                            {statsG2.primary_curve.thresholds["49.90"]?.percentage?.toFixed(2)}%
                          </TableCell>
                          <TableCell sx={{ fontSize: 11, py: 0.6, fontWeight: 700, color: "#2563EB" }}>
                            {statsG2.primary_curve.thresholds["50.00"]?.percentage?.toFixed(2)}%
                          </TableCell>
                          <TableCell sx={{ fontSize: 11, py: 0.6, fontWeight: 700, color: "#16A34A" }}>
                            {statsG2.primary_curve.thresholds["50.05"]?.percentage?.toFixed(2)}%
                          </TableCell>
                          <TableCell sx={{ fontSize: 11, py: 0.6, fontWeight: 800, color: "#059669" }}>
                            {(
                              (statsG2.primary_curve.thresholds["50.05"]?.percentage || 0) -
                              (statsG2.primary_curve.thresholds["49.90"]?.percentage || 0)
                            ).toFixed(2)}%
                          </TableCell>
                        </TableRow>
                      )}
                      {/* Comparison Rows */}
                      {statsG2.comparison_curves.map((comp) => (
                        <TableRow key={comp.label} hover>
                          <TableCell sx={{ fontSize: 11, fontWeight: 700, color: "#334155", py: 0.6 }}>{comp.label}</TableCell>
                          <TableCell sx={{ fontSize: 11, py: 0.6 }}>{comp.total_points?.toLocaleString()}</TableCell>
                          <TableCell sx={{ fontSize: 11, py: 0.6 }}>{comp.thresholds["49.50"]?.percentage?.toFixed(2)}%</TableCell>
                          <TableCell sx={{ fontSize: 11, py: 0.6 }}>{comp.thresholds["49.70"]?.percentage?.toFixed(2)}%</TableCell>
                          <TableCell sx={{ fontSize: 11, py: 0.6 }}>{comp.thresholds["49.90"]?.percentage?.toFixed(2)}%</TableCell>
                          <TableCell sx={{ fontSize: 11, py: 0.6 }}>{comp.thresholds["50.00"]?.percentage?.toFixed(2)}%</TableCell>
                          <TableCell sx={{ fontSize: 11, py: 0.6 }}>{comp.thresholds["50.05"]?.percentage?.toFixed(2)}%</TableCell>
                          <TableCell sx={{ fontSize: 11, py: 0.6, fontWeight: 700, color: "#059669" }}>
                            {(
                              (comp.thresholds["50.05"]?.percentage || 0) -
                              (comp.thresholds["49.90"]?.percentage || 0)
                            ).toFixed(2)}%
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            )}
          </Paper>

          {/* ============================================================== */}
          {/* GRAPH 3: Average Daily Frequency Profile                      */}
          {/* ============================================================== */}
          <Paper
            elevation={0}
            variant="outlined"
            sx={{
              p: 2.5,
              borderRadius: 2.5,
              borderColor: "#CBD5E1",
              bgcolor: "#FFFFFF",
              boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.05)",
            }}
          >
            <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
              <Box>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography sx={{ fontSize: 15.5, fontWeight: 900, color: "#17365D" }}>
                    Graph 3 – Average Daily Frequency Profile (24-Hour Diurnal)
                  </Typography>
                  <Chip
                    label="00:00 – 24:00 (1440 mins)"
                    size="small"
                    sx={{ fontSize: 11, fontWeight: 700, bgcolor: "#F5F3FF", color: "#6D28D9", borderColor: "#DDD6FE" }}
                    variant="outlined"
                  />
                </Stack>
                <Typography sx={{ fontSize: 11.5, color: "#64748B", mt: 0.3 }}>
                  Minute-by-minute diurnal average frequency across all days in the period, with shaded middle 80% range (10th to 90th percentile), reference lines (50.05, 49.90, 49.50 Hz), and dynamic dip annotations.
                </Typography>
              </Box>

              <Stack direction="row" spacing={1}>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<Maximize2 size={13} />}
                  onClick={() =>
                    setEnlargedModal({
                      title: "Average Daily Frequency Profile (24-Hour)",
                      imgUri: curvesData.plots_base64.daily_profile,
                      curveType: "daily_profile",
                      filename: "Average_Daily_Frequency_Profile.png",
                    })
                  }
                  sx={{ textTransform: "none", fontSize: 11.5, fontWeight: 700 }}
                >
                  Enlarge
                </Button>
                <Button
                  size="small"
                  variant="contained"
                  startIcon={downloadingCurve === "daily_profile" ? <CircularProgress size={13} color="inherit" /> : <Download size={13} />}
                  onClick={() => handleDownloadSingle("daily_profile", "Average_Daily_Frequency_Profile.png")}
                  disabled={downloadingCurve === "daily_profile"}
                  sx={{
                    bgcolor: "#17365D",
                    "&:hover": { bgcolor: "#0f243e" },
                    textTransform: "none",
                    fontSize: 11.5,
                    fontWeight: 700,
                  }}
                >
                  Download PNG (400 DPI)
                </Button>
              </Stack>
            </Stack>

            {/* Dynamic Diurnal Observations Banner (Prompt Requirement) */}
            {statsG3 && (
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "repeat(2, 1fr)", sm: "repeat(4, 1fr)" },
                  gap: 1.5,
                  mb: 2,
                  p: 1.5,
                  bgcolor: "#F8FAFC",
                  borderRadius: 1.5,
                  border: "1px solid #E2E8F0",
                }}
              >
                <Box>
                  <Typography sx={{ fontSize: 10.5, color: "#64748B", textTransform: "uppercase", fontWeight: 700 }}>
                    Global Average Frequency
                  </Typography>
                  <Typography sx={{ fontSize: 16, fontWeight: 900, color: "#17365D" }}>
                    {statsG3.global_mean?.toFixed(3)} Hz
                  </Typography>
                  <Typography sx={{ fontSize: 10, color: "#94A3B8" }}>
                    across {statsG3.days_counted} days
                  </Typography>
                </Box>

                <Box>
                  <Typography sx={{ fontSize: 10.5, color: "#64748B", textTransform: "uppercase", fontWeight: 700 }}>
                    Morning Trough (Average)
                  </Typography>
                  <Typography sx={{ fontSize: 16, fontWeight: 900, color: "#DC2626" }}>
                    {statsG3.morning_dip ? `${statsG3.morning_dip.mean_freq?.toFixed(3)} Hz` : "—"}
                  </Typography>
                  <Typography sx={{ fontSize: 10, color: "#94A3B8" }}>
                    at {statsG3.morning_dip?.time || "—"} IST
                  </Typography>
                </Box>

                <Box>
                  <Typography sx={{ fontSize: 10.5, color: "#64748B", textTransform: "uppercase", fontWeight: 700 }}>
                    Evening Trough (Average)
                  </Typography>
                  <Typography sx={{ fontSize: 16, fontWeight: 900, color: "#EA580C" }}>
                    {statsG3.evening_dip ? `${statsG3.evening_dip.mean_freq?.toFixed(3)} Hz` : "—"}
                  </Typography>
                  <Typography sx={{ fontSize: 10, color: "#94A3B8" }}>
                    at {statsG3.evening_dip?.time || "—"} IST
                  </Typography>
                </Box>

                <Box>
                  <Typography sx={{ fontSize: 10.5, color: "#64748B", textTransform: "uppercase", fontWeight: 700 }}>
                    10th Percentile Severity
                  </Typography>
                  <Typography sx={{ fontSize: 16, fontWeight: 900, color: "#7B2CBF" }}>
                    {statsG3.lowest_p10 ? `${statsG3.lowest_p10.p10_freq?.toFixed(3)} Hz` : "—"}
                  </Typography>
                  <Typography sx={{ fontSize: 10, color: "#94A3B8" }}>
                    1 day in 10 below this at {statsG3.lowest_p10?.time || "—"}
                  </Typography>
                </Box>
              </Box>
            )}

            {/* Plot Image Container */}
            <Box
              sx={{
                width: "100%",
                borderRadius: 1.5,
                border: "1px solid #E2E8F0",
                bgcolor: "#FFFFFF",
                p: 1,
                textAlign: "center",
                cursor: "zoom-in",
              }}
              onClick={() =>
                setEnlargedModal({
                  title: "Average Daily Frequency Profile (24-Hour)",
                  imgUri: curvesData.plots_base64.daily_profile,
                  curveType: "daily_profile",
                  filename: "Average_Daily_Frequency_Profile.png",
                })
              }
              title="Click to view full-resolution plot"
            >
              <Box
                component="img"
                src={curvesData.plots_base64.daily_profile}
                alt="Average Daily Frequency Profile"
                sx={{
                  width: "100%",
                  maxHeight: 640,
                  objectFit: "contain",
                  display: "block",
                  margin: "0 auto",
                }}
              />
            </Box>
          </Paper>
        </Stack>
      )}

      {/* ENLARGED MODAL DIALOG */}
      <Dialog
        open={Boolean(enlargedModal)}
        onClose={() => setEnlargedModal(null)}
        maxWidth="xl"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 2.5,
            p: 1,
            maxHeight: "92vh",
          },
        }}
      >
        <DialogTitle sx={{ m: 0, p: 2, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Box>
            <Typography sx={{ fontSize: 16, fontWeight: 900, color: "#17365D" }}>
              {enlargedModal?.title}
            </Typography>
            <Typography sx={{ fontSize: 11, color: "#64748B" }}>
              Publication-Quality High-Resolution View (400 DPI)
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} alignItems="center">
            {enlargedModal && (
              <Button
                size="small"
                variant="contained"
                startIcon={<Download size={14} />}
                onClick={() => handleDownloadSingle(enlargedModal.curveType, enlargedModal.filename)}
                sx={{ bgcolor: "#17365D", "&:hover": { bgcolor: "#0f243e" }, textTransform: "none", fontSize: 12 }}
              >
                Download PNG
              </Button>
            )}
            <IconButton onClick={() => setEnlargedModal(null)} size="small">
              <X size={18} />
            </IconButton>
          </Stack>
        </DialogTitle>
        <DialogContent sx={{ p: 1, textAlign: "center", bgcolor: "#FAFAFA" }}>
          {enlargedModal?.imgUri && (
            <Box
              component="img"
              src={enlargedModal.imgUri}
              alt={enlargedModal.title}
              sx={{
                width: "100%",
                height: "auto",
                maxHeight: "80vh",
                objectFit: "contain",
                borderRadius: 1.5,
                bgcolor: "#FFFFFF",
                boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </Box>
  );
}
