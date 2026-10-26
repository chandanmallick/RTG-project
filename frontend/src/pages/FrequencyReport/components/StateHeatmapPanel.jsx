import { useEffect, useMemo, useState } from "react";
import ReactECharts from "echarts-for-react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Stack,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";
import { Download, Expand, Grid as GridIcon, Image as ImageIcon, Layout, X } from "lucide-react";
import API from "../../../services/api";

function blockTimeLabel(block) {
  const startMin = (block - 1) * 15;
  const endMin = block * 15;
  const sh = String(Math.floor(startMin / 60)).padStart(2, "0");
  const sm = String(startMin % 60).padStart(2, "0");
  const eh = String(Math.floor(endMin / 60)).padStart(2, "0");
  const em = String(endMin % 60).padStart(2, "0");
  return `${sh}:${sm}–${eh}:${em}`;
}

export default function StateHeatmapPanel({ result, sessionToken, saveBlob }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedState, setSelectedState] = useState("");
  const [viewMode, setViewMode] = useState("publication"); // 'publication' | 'interactive' | 'grid'
  const [enlarged, setEnlarged] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!sessionToken) return;
    setLoading(true);
    setError("");
    API.getStateHeatmaps(sessionToken)
      .then((res) => {
        setData(res);
        if (res.states && res.states.length > 0) {
          setSelectedState(res.states[0]);
        }
      })
      .catch((err) => {
        setError(err?.response?.data?.detail || err.message || "Failed to load state heatmaps");
      })
      .finally(() => setLoading(false));
  }, [sessionToken]);

  const activeStats = useMemo(() => {
    if (!data || !selectedState) return null;
    return data.state_stats?.[selectedState] || null;
  }, [data, selectedState]);

  const activeInteractive = useMemo(() => {
    if (!data || !selectedState) return null;
    return data.interactive_data?.[selectedState] || null;
  }, [data, selectedState]);

  // ECharts Heatmap option
  const echartsOption = useMemo(() => {
    if (!activeInteractive) return {};
    const { days, blocks, matrix, schedule_matrix, actual_matrix, raw_deviation_matrix } = activeInteractive;

    // Convert matrix into [blockIndex, dayIndex, value, schedule, actual, rawDev]
    const seriesData = [];
    let maxVal = 100;
    for (let dIdx = 0; dIdx < days.length; dIdx++) {
      for (let bIdx = 0; bIdx < blocks.length; bIdx++) {
        const val = matrix[dIdx]?.[bIdx] ?? 0;
        const sch = schedule_matrix?.[dIdx]?.[bIdx] ?? 0;
        const act = actual_matrix?.[dIdx]?.[bIdx] ?? 0;
        const rawDev = raw_deviation_matrix?.[dIdx]?.[bIdx] ?? 0;
        if (val > maxVal) maxVal = val;
        seriesData.push([bIdx, dIdx, Math.round(val), Math.round(sch), Math.round(act), Math.round(rawDev)]);
      }
    }

    const xTicks = [0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 64, 68, 72, 76, 80, 84, 88, 92];

    return {
      tooltip: {
        position: "top",
        formatter: (params) => {
          const [bIdx, dIdx, val, sch, act, rawDev] = params.data;
          const day = days[dIdx];
          const block = blocks[bIdx];
          const timeRange = blockTimeLabel(block);
          return `<div style="font-family: sans-serif; font-size: 12px; line-height: 1.5;">
            <div style="font-weight: 800; color: #17365D; border-bottom: 1px solid #CBD5E1; padding-bottom: 3px; margin-bottom: 4px;">
              ${selectedState} — Day ${day}, Block ${block} (${timeRange} IST)
            </div>
            <div>Positive Deviation (OD/UI): <strong style="color: ${val >= 500 ? '#DC2626' : val > 0 ? '#D97706' : '#10B981'};">${val.toLocaleString()} MW</strong></div>
            <div>Average Actual: <strong>${act.toLocaleString()} MW</strong></div>
            <div>Average Schedule: <strong>${sch.toLocaleString()} MW</strong></div>
            <div>Net Deviation: <strong>${rawDev > 0 ? `+${rawDev.toLocaleString()}` : rawDev.toLocaleString()} MW</strong></div>
          </div>`;
        },
      },
      grid: {
        top: 45,
        left: 60,
        right: 80,
        bottom: 60,
      },
      xAxis: {
        type: "category",
        data: blocks.map((b) => String(b)),
        name: "Time Block (1-96; 15-minute blocks)",
        nameLocation: "middle",
        nameGap: 36,
        nameTextStyle: { fontWeight: "bold", fontSize: 11, color: "#1E293B" },
        splitArea: { show: false },
        splitLine: { show: true, lineStyle: { color: "#FFFFFF", width: 0.5 } },
        axisLabel: {
          interval: (index) => xTicks.includes(index),
          formatter: (value) => value,
          fontSize: 10,
        },
      },
      yAxis: {
        type: "category",
        data: days.map((d) => String(d)),
        name: "Day of the Month",
        nameLocation: "middle",
        nameGap: 42,
        nameTextStyle: { fontWeight: "bold", fontSize: 11, color: "#1E293B" },
        splitArea: { show: false },
        splitLine: { show: true, lineStyle: { color: "#FFFFFF", width: 0.5 } },
        axisLabel: {
          fontSize: 10,
        },
      },
      visualMap: {
        min: 0,
        max: Math.ceil(maxVal / 100) * 100,
        calculable: true,
        orient: "vertical",
        right: 5,
        top: "middle",
        itemHeight: 180,
        inRange: {
          color: ["#FFFFD4", "#FED976", "#FEB24C", "#FD8D3C", "#F03B20", "#BD0026", "#800026"],
        },
        text: ["High MW", "0 MW"],
        textStyle: { fontSize: 10, fontWeight: "bold" },
      },
      series: [
        {
          name: "OD/UI (MW)",
          type: "heatmap",
          data: seriesData,
          label: {
            show: true,
            formatter: (params) => {
              const val = params.data[2];
              return val >= 500 ? String(val) : "";
            },
            fontSize: 8.5,
            fontWeight: "bold",
            color: "#FFFFFF",
            backgroundColor: "rgba(0,0,0,0.85)",
            padding: [2, 3],
            borderRadius: 3,
          },
          itemStyle: {
            borderColor: "#FFFFFF",
            borderWidth: 0.5,
          },
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowColor: "rgba(0, 0, 0, 0.5)",
              borderColor: "#1E3A8A",
              borderWidth: 1.5,
            },
          },
        },
      ],
    };
  }, [activeInteractive, selectedState]);

  const handleDownloadPlot = async (state) => {
    try {
      setDownloading(true);
      const blob = await API.downloadStateHeatmapPlot(sessionToken, state);
      await saveBlob(blob, `${state.replace(/[^A-Za-z0-9_-]+/g, "_")}_OD_UI_Heatmap.png`);
    } catch (e) {
      setError(e?.message || "Failed to download heatmap image");
    } finally {
      setDownloading(false);
    }
  };

  const handleDownloadZip = async () => {
    try {
      setDownloading(true);
      const blob = await API.downloadStateHeatmapsZip(sessionToken);
      await saveBlob(blob, "State_OD_UI_Heatmaps.zip");
    } catch (e) {
      setError(e?.message || "Failed to download heatmaps ZIP");
    } finally {
      setDownloading(false);
    }
  };

  const handleDownloadExcel = async () => {
    try {
      setDownloading(true);
      const blob = await API.downloadStateHeatmapsExcel(sessionToken);
      await saveBlob(blob, `State_OD_UI_Heatmap_Data_${data?.period || "month"}.xlsx`);
    } catch (e) {
      setError(e?.message || "Failed to download heatmap Excel");
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <Paper variant="outlined" sx={{ p: 4, mt: 2, textAlign: "center", borderRadius: 3 }}>
        <CircularProgress size={36} sx={{ color: "#17365D" }} />
        <Typography sx={{ mt: 1.5, fontSize: 14, fontWeight: 700, color: "#17365D" }}>
          Generating 15-minute time block OD/UI heatmaps for constituent states…
        </Typography>
        <Typography sx={{ fontSize: 12, color: "#64748B" }}>
          Calculating 96 block averages across each calendar day
        </Typography>
      </Paper>
    );
  }

  if (error && !data) {
    return (
      <Alert severity="warning" sx={{ mt: 2, borderRadius: 2 }}>
        {error}
      </Alert>
    );
  }

  if (!data || !data.states?.length) {
    return (
      <Paper variant="outlined" sx={{ p: 3, mt: 2, textAlign: "center", borderRadius: 3 }}>
        <Typography sx={{ color: "#64748B" }}>
          No State Heatmap data available. Ensure the uploaded workbook contains State actual and schedule columns.
        </Typography>
      </Paper>
    );
  }

  const states = data.states || [];
  const currentImgUri = data.plots_base64?.[selectedState];

  return (
    <Box sx={{ mt: 2 }}>
      {/* Top Header Card */}
      <Paper
        elevation={0}
        sx={{
          p: 2.5,
          border: "1px solid #CBD5E1",
          borderRadius: 3,
          background: "linear-gradient(180deg, #F8FAFC 0%, #FFFFFF 100%)",
          mb: 2,
        }}
      >
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" useFlexGap gap={2}>
          <Box>
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography sx={{ fontSize: 18, fontWeight: 900, color: "#17365D" }}>
                State Performance by Heatmap
              </Typography>
              <Chip
                size="small"
                label={data.period || "Uploaded Period"}
                sx={{ bgcolor: "#EFF6FF", color: "#1D4ED8", fontWeight: 800, fontSize: 11 }}
              />
            </Stack>
            <Typography sx={{ fontSize: 12, color: "#64748B", mt: 0.5, maxWidth: 900 }}>
              15-minute time block average Overdrawal / Positive Deviation (OD/UI in MW) across each day of the month.
              <strong> X-axis:</strong> 1-96 Time Blocks (15-min intervals). <strong>Y-axis:</strong> Day of the Month (1 to {activeInteractive?.days?.length || 30}).
              Severe overdrawal spikes (≥ 500 MW) are highlighted with value badges.
            </Typography>
          </Box>

          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Button
              variant="outlined"
              size="small"
              startIcon={<Download size={14} />}
              disabled={downloading}
              onClick={() => handleDownloadPlot(selectedState)}
              sx={{ textTransform: "none", fontSize: 12, fontWeight: 700 }}
            >
              Download PNG
            </Button>
            <Button
              variant="outlined"
              size="small"
              startIcon={<Download size={14} />}
              disabled={downloading}
              onClick={handleDownloadZip}
              sx={{ textTransform: "none", fontSize: 12, fontWeight: 700 }}
            >
              All States (ZIP)
            </Button>
            <Button
              variant="contained"
              size="small"
              startIcon={<Download size={14} />}
              disabled={downloading}
              onClick={handleDownloadExcel}
              sx={{ bgcolor: "#059669", "&:hover": { bgcolor: "#047857" }, textTransform: "none", fontSize: 12, fontWeight: 700 }}
            >
              Download Data (.xlsx)
            </Button>
          </Stack>
        </Stack>

        {/* State selection pills and View Mode Switcher */}
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
          flexWrap="wrap"
          useFlexGap
          sx={{ mt: 2, pt: 1.5, borderTop: "1px solid #E2E8F0" }}
        >
          <Tabs
            value={selectedState}
            onChange={(_, val) => setSelectedState(val)}
            variant="scrollable"
            scrollButtons="auto"
            sx={{
              minHeight: 38,
              "& .MuiTab-root": { minHeight: 38, py: 0.5, px: 2, textTransform: "none", fontWeight: 750, fontSize: 12.5 },
            }}
          >
            {states.map((st) => (
              <Tab key={st} value={st} label={st} />
            ))}
          </Tabs>

          <Stack direction="row" spacing={1} alignItems="center">
            <Typography sx={{ fontSize: 11, fontWeight: 700, color: "#64748B" }}>View Mode:</Typography>
            <Button
              size="small"
              variant={viewMode === "publication" ? "contained" : "outlined"}
              startIcon={<ImageIcon size={14} />}
              onClick={() => setViewMode("publication")}
              sx={{ textTransform: "none", fontSize: 11, py: 0.3 }}
            >
              Publication Chart
            </Button>
            <Button
              size="small"
              variant={viewMode === "interactive" ? "contained" : "outlined"}
              startIcon={<Layout size={14} />}
              onClick={() => setViewMode("interactive")}
              sx={{ textTransform: "none", fontSize: 11, py: 0.3 }}
            >
              Interactive ECharts
            </Button>
            <Button
              size="small"
              variant={viewMode === "grid" ? "contained" : "outlined"}
              startIcon={<GridIcon size={14} />}
              onClick={() => setViewMode("grid")}
              sx={{ textTransform: "none", fontSize: 11, py: 0.3 }}
            >
              All States Grid
            </Button>
          </Stack>
        </Stack>
      </Paper>

      {/* KPI Cards for the Selected State */}
      {activeStats && viewMode !== "grid" && (
        <Stack direction="row" flexWrap="wrap" useFlexGap spacing={1.5} sx={{ mb: 2 }}>
          {[
            ["Peak 15-min OD/UI", `${activeStats.max_od?.toLocaleString()} MW`, "#DC2626", `Day ${activeStats.max_od_day}, Block ${activeStats.max_od_block} (${activeStats.max_od_time} IST)`],
            ["Average Positive OD", `${activeStats.avg_od?.toLocaleString()} MW`, "#D97706", "Mean overdrawal during adverse blocks"],
            ["Overdrawal Blocks", `${activeStats.od_blocks_count?.toLocaleString()} / ${activeStats.total_blocks?.toLocaleString()}`, "#17365D", `${activeStats.od_percentage}% of total 15-min intervals`],
            ["Severe Blocks (≥500 MW)", `${activeStats.severe_blocks_count?.toLocaleString()} blocks`, activeStats.severe_blocks_count > 0 ? "#DC2626" : "#059669", "Annotated with bold badges"],
          ].map(([title, val, color, sub]) => (
            <Box
              key={title}
              sx={{
                flex: "1 1 200px",
                p: 1.5,
                bgcolor: "#FFFFFF",
                border: "1px solid #CBD5E1",
                borderRadius: 2,
                boxShadow: "0 1px 3px rgba(15,23,42,0.03)",
              }}
            >
              <Typography sx={{ fontSize: 10.5, fontWeight: 800, color: "#64748B", textTransform: "uppercase" }}>
                {title}
              </Typography>
              <Typography sx={{ fontSize: 18, fontWeight: 900, color, mt: 0.2 }}>
                {val}
              </Typography>
              <Typography sx={{ fontSize: 10.5, color: "#64748B", mt: 0.2 }}>
                {sub}
              </Typography>
            </Box>
          ))}
        </Stack>
      )}

      {/* Main Display Area */}
      {viewMode === "publication" && (
        <Paper
          variant="outlined"
          sx={{
            p: 2,
            borderRadius: 3,
            bgcolor: "#FFFFFF",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
            <Typography sx={{ fontSize: 14, fontWeight: 800, color: "#17365D" }}>
              {selectedState} — {data.period}: OD/UI Heatmap (15-minute Time Blocks)
            </Typography>
            <Stack direction="row" spacing={1}>
              <Button
                size="small"
                variant="outlined"
                startIcon={<Expand size={14} />}
                onClick={() => setEnlarged(true)}
                sx={{ textTransform: "none", fontSize: 11 }}
              >
                Enlarge View
              </Button>
              <Button
                size="small"
                variant="outlined"
                startIcon={<Download size={14} />}
                onClick={() => handleDownloadPlot(selectedState)}
                sx={{ textTransform: "none", fontSize: 11 }}
              >
                Save Image
              </Button>
            </Stack>
          </Stack>

          <Box
            sx={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              bgcolor: "#FFFFFF",
              borderRadius: 2,
              p: 1,
              cursor: "zoom-in",
            }}
            onClick={() => setEnlarged(true)}
            title="Click to enlarge"
          >
            {currentImgUri ? (
              <img
                src={currentImgUri}
                alt={`${selectedState} OD/UI Heatmap`}
                style={{ width: "100%", maxHeight: "720px", objectFit: "contain", borderRadius: 4 }}
              />
            ) : (
              <Typography sx={{ p: 4, color: "#64748B" }}>No heatmap image generated for {selectedState}</Typography>
            )}
          </Box>
        </Paper>
      )}

      {viewMode === "interactive" && (
        <Paper
          variant="outlined"
          sx={{
            p: 2,
            borderRadius: 3,
            bgcolor: "#FFFFFF",
          }}
        >
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
            <Typography sx={{ fontSize: 14, fontWeight: 800, color: "#17365D" }}>
              Interactive Heatmap — {selectedState} ({data.period})
            </Typography>
            <Typography sx={{ fontSize: 11, color: "#64748B" }}>
              Hover over any 15-minute cell to view detailed schedule, actual, and net deviation readings
            </Typography>
          </Stack>
          <Box sx={{ height: 600, width: "100%" }}>
            <ReactECharts option={echartsOption} style={{ height: "100%", width: "100%" }} />
          </Box>
        </Paper>
      )}

      {viewMode === "grid" && (
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" }, gap: 2 }}>
          {states.map((st) => (
            <Paper key={st} variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                <Typography sx={{ fontSize: 13, fontWeight: 800, color: "#17365D" }}>{st}</Typography>
                <Stack direction="row" spacing={1}>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<Expand size={13} />}
                    onClick={() => {
                      setSelectedState(st);
                      setEnlarged(true);
                    }}
                    sx={{ textTransform: "none", fontSize: 11, py: 0.2 }}
                  >
                    Enlarge
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<Download size={13} />}
                    onClick={() => handleDownloadPlot(st)}
                    sx={{ textTransform: "none", fontSize: 11, py: 0.2 }}
                  >
                    Save
                  </Button>
                </Stack>
              </Stack>
              {data.plots_base64?.[st] ? (
                <img
                  src={data.plots_base64[st]}
                  alt={`${st} OD/UI Heatmap`}
                  style={{ width: "100%", height: "auto", cursor: "zoom-in" }}
                  onClick={() => {
                    setSelectedState(st);
                    setEnlarged(true);
                  }}
                />
              ) : (
                <Typography sx={{ p: 3, textAlign: "center", color: "#64748B" }}>No image available</Typography>
              )}
            </Paper>
          ))}
        </Box>
      )}

      {/* Enlarged Dialog */}
      <Dialog open={enlarged} onClose={() => setEnlarged(false)} maxWidth="xl" fullWidth>
        <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", py: 1.5 }}>
          <Typography sx={{ fontWeight: 800, fontSize: 16, color: "#17365D" }}>
            {selectedState} — {data.period}: OD/UI Heatmap (15-minute Time Blocks)
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            <Button
              size="small"
              variant="outlined"
              startIcon={<Download size={14} />}
              onClick={() => handleDownloadPlot(selectedState)}
              sx={{ textTransform: "none", fontSize: 11.5 }}
            >
              Download High-Res PNG
            </Button>
            <IconButton size="small" onClick={() => setEnlarged(false)}>
              <X size={18} />
            </IconButton>
          </Stack>
        </DialogTitle>
        <DialogContent sx={{ p: 1, textAlign: "center", bgcolor: "#FFFFFF" }}>
          {currentImgUri && (
            <img
              src={currentImgUri}
              alt={`${selectedState} OD/UI Heatmap enlarged`}
              style={{ width: "100%", maxHeight: "85vh", objectFit: "contain" }}
            />
          )}
        </DialogContent>
      </Dialog>
    </Box>
  );
}
