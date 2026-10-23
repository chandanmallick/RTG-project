import { useState, useEffect } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Collapse,
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
import { ChevronDown, ChevronRight, Download, Play } from "lucide-react";
import CalendarInput from "../../../components/ui/CalendarInput";
import API from "../../../services/api";

const ALL_THRESHOLDS = [
  { value: 49.5, label: "Min <49.5 Hz" },
  { value: 49.7, label: "Min <49.7 Hz" },
  { value: 49.9, label: "Min <49.9 Hz" },
];

const PRESETS = [
  { label: "All 3 Conditions (<49.5, <49.7, <49.9)", thresholds: [49.5, 49.7, 49.9] },
  { label: "<49.50 Hz Only", thresholds: [49.5] },
  { label: "<49.70 Hz Only", thresholds: [49.7] },
  { label: "<49.90 Hz Only", thresholds: [49.9] },
];

const ALL_CONSTITUENTS = ["Bihar", "Jharkhand", "Odisha", "West Bengal", "DVC"];

export default function FrequencyEventTables({ result, sessionToken, saveBlob }) {
  const session = sessionToken || result?.session_token;
  const token = result?.result_token;

  const defaultStart = result?.summary?.analysis_start?.slice(0, 10) || "";
  const defaultEnd = result?.summary?.analysis_end?.slice(0, 10) || "";

  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [selectedThresholds, setSelectedThresholds] = useState([49.5, 49.7, 49.9]);
  const [selectedConstituents, setSelectedConstituents] = useState(ALL_CONSTITUENTS);

  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");
  const [tablesData, setTablesData] = useState(null);
  const [collapsedTables, setCollapsedTables] = useState({});

  useEffect(() => {
    if (result?.summary?.analysis_start) {
      setStartDate(result.summary.analysis_start.slice(0, 10));
    }
    if (result?.summary?.analysis_end) {
      setEndDate(result.summary.analysis_end.slice(0, 10));
    }
  }, [result?.result_token, result?.summary?.analysis_start, result?.summary?.analysis_end]);

  const toggleThreshold = (val) => {
    setSelectedThresholds((prev) =>
      prev.includes(val) ? prev.filter((t) => t !== val) : [...prev, val].sort((a, b) => a - b)
    );
  };

  const toggleConstituent = (state) => {
    setSelectedConstituents((prev) =>
      prev.includes(state) ? prev.filter((s) => s !== state) : [...prev, state]
    );
  };

  const toggleCollapse = (tableId) => {
    setCollapsedTables((prev) => ({
      ...prev,
      [tableId]: !prev[tableId],
    }));
  };

  const setAllCollapsed = (collapsed) => {
    if (!tablesData?.tables) return;
    const next = {};
    tablesData.tables.forEach((t) => {
      next[t.table_id] = collapsed;
    });
    setCollapsedTables(next);
  };

  const handleGenerate = async (overrideThresholds = null) => {
    if (!session) {
      setError("Active session not found. Please upload or run an analysis first.");
      return;
    }
    const threshToUse = overrideThresholds || selectedThresholds;
    if (!threshToUse.length) {
      setError("Please select at least one frequency event threshold.");
      return;
    }
    if (!selectedConstituents.length) {
      setError("Please select at least one constituent.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const res = await API.getFrequencyEventTables({
        session_token: session,
        result_token: token,
        start_date: startDate || null,
        end_date: endDate || null,
        thresholds: threshToUse,
        constituents: selectedConstituents,
      });
      setTablesData(res);
      // Initially collapse all tables so they don't take up excessive vertical space
      const initialCollapse = {};
      (res?.tables || []).forEach((t) => {
        initialCollapse[t.table_id] = true;
      });
      setCollapsedTables(initialCollapse);
    } catch (err) {
      const msg = err?.response?.data?.detail || err.message;
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleApplyPreset = (thresholds) => {
    setSelectedThresholds(thresholds);
    handleGenerate(thresholds);
  };

  const handleDownloadExcel = async () => {
    if (!session) return;
    setDownloading(true);
    setError("");
    try {
      const blob = await API.downloadFrequencyEventTablesExcel({
        session_token: session,
        result_token: token,
        start_date: startDate || null,
        end_date: endDate || null,
        thresholds: selectedThresholds,
        constituents: selectedConstituents,
      });
      if (saveBlob) {
        await saveBlob(blob, "Frequency_Event_Analysis_Tables.xlsx");
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "Frequency_Event_Analysis_Tables.xlsx";
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
      setDownloading(false);
    }
  };

  // Auto-generate on first mount if session exists and not yet generated
  useEffect(() => {
    if (session && !tablesData && !loading && !error) {
      handleGenerate();
    }
  }, [session]);

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
        <Typography sx={{ fontSize: 16, fontWeight: 900, color: "#17365D", mb: 0.5 }}>
          Frequency Event Tables
        </Typography>
        <Typography sx={{ fontSize: 12, color: "#64748B", mb: 2 }}>
          Identify continuous 1-minute frequency-dip events below operational thresholds with constituent Maximum Overdrawal (OD &gt; 0 MW) and Average Deviation (signed MW).
        </Typography>

        {/* Date Range Selection */}
        <Box sx={{ mb: 2 }}>
          <Typography sx={{ fontSize: 12, fontWeight: 800, color: "#334155", mb: 1 }}>
            Date Range
          </Typography>
          <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
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
          </Stack>
        </Box>

        {/* Quick Presets & Threshold Selection */}
        <Box sx={{ mb: 2 }}>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center" sx={{ mb: 1 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 800, color: "#334155", mr: 0.5 }}>
              Frequency Event Threshold:
            </Typography>
            {PRESETS.map((p) => {
              const isSelected =
                p.thresholds.length === selectedThresholds.length &&
                p.thresholds.every((val) => selectedThresholds.includes(val));
              return (
                <Chip
                  key={p.label}
                  label={p.label}
                  size="small"
                  clickable
                  variant={isSelected ? "filled" : "outlined"}
                  onClick={() => handleApplyPreset(p.thresholds)}
                  disabled={loading}
                  sx={{
                    fontWeight: 700,
                    fontSize: 11,
                    bgcolor: isSelected ? "#17365D" : "white",
                    color: isSelected ? "white" : "#17365D",
                    borderColor: isSelected ? "#17365D" : "#CBD5E1",
                    "&:hover": { bgcolor: isSelected ? "#204B7D" : "#F1F5F9" },
                  }}
                />
              );
            })}
          </Stack>

          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {ALL_THRESHOLDS.map((t) => (
              <FormControlLabel
                key={t.value}
                control={
                  <Checkbox
                    size="small"
                    checked={selectedThresholds.includes(t.value)}
                    onChange={() => toggleThreshold(t.value)}
                    disabled={loading}
                  />
                }
                label={<Typography sx={{ fontSize: 12.5, fontWeight: 600 }}>{t.label}</Typography>}
              />
            ))}
          </Stack>
        </Box>

        {/* Constituents Selection */}
        <Box sx={{ mb: 2.5 }}>
          <Typography sx={{ fontSize: 12, fontWeight: 800, color: "#334155", mb: 0.5 }}>
            Constituents
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {ALL_CONSTITUENTS.map((c) => (
              <FormControlLabel
                key={c}
                control={
                  <Checkbox
                    size="small"
                    checked={selectedConstituents.includes(c)}
                    onChange={() => toggleConstituent(c)}
                    disabled={loading}
                  />
                }
                label={<Typography sx={{ fontSize: 12.5, fontWeight: 600 }}>{c}</Typography>}
              />
            ))}
          </Stack>
        </Box>

        {/* Action Buttons */}
        <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
          <Button
            variant="contained"
            size="small"
            startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <Play size={16} />}
            disabled={loading || !selectedThresholds.length || !selectedConstituents.length}
            onClick={() => handleGenerate()}
            sx={{
              bgcolor: "#17365D",
              "&:hover": { bgcolor: "#204B7D" },
              fontWeight: 800,
              textTransform: "none",
              px: 2,
              py: 0.8,
            }}
          >
            {loading ? "Calculating Events…" : "Generate Event Tables"}
          </Button>

          {tablesData && (
            <Button
              variant="contained"
              size="small"
              startIcon={downloading ? <CircularProgress size={16} color="inherit" /> : <Download size={16} />}
              disabled={downloading}
              onClick={handleDownloadExcel}
              sx={{
                bgcolor: "#059669",
                "&:hover": { bgcolor: "#047857" },
                fontWeight: 800,
                textTransform: "none",
                px: 2,
                py: 0.8,
              }}
            >
              {downloading ? "Exporting…" : "Download Tables (.xlsx)"}
            </Button>
          )}
        </Stack>
      </Paper>

      {/* Error Alert */}
      {error && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Tables Preview */}
      {loading && !tablesData && (
        <Stack alignItems="center" sx={{ py: 6 }}>
          <CircularProgress size={36} sx={{ color: "#17365D" }} />
          <Typography sx={{ mt: 1.5, fontSize: 13, color: "#64748B", fontWeight: 600 }}>
            Scanning 1-minute frequency data and identifying continuous event windows…
          </Typography>
        </Stack>
      )}

      {tablesData && (
        <Box sx={{ mb: 2 }}>
          {/* Table View Toolbar */}
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="center"
            flexWrap="wrap"
            useFlexGap
            sx={{
              p: 1.5,
              mb: 2,
              bgcolor: "#F8FAFC",
              border: "1px solid #E2E8F0",
              borderRadius: 2,
            }}
          >
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography sx={{ fontSize: 12, fontWeight: 800, color: "#17365D" }}>
                Table View Options:
              </Typography>
              <Button
                size="small"
                variant="outlined"
                onClick={() => setAllCollapsed(false)}
                sx={{
                  textTransform: "none",
                  py: 0.3,
                  px: 1.2,
                  fontSize: 11.5,
                  fontWeight: 700,
                }}
              >
                Expand All
              </Button>
              <Button
                size="small"
                variant="outlined"
                onClick={() => setAllCollapsed(true)}
                sx={{
                  textTransform: "none",
                  py: 0.3,
                  px: 1.2,
                  fontSize: 11.5,
                  fontWeight: 700,
                }}
              >
                Collapse All
              </Button>
            </Stack>
            <Typography sx={{ fontSize: 11, color: "#64748B" }}>
              Click any table header bar to toggle collapse/expand
            </Typography>
          </Stack>

          <Stack spacing={3}>
            {tablesData.tables?.map((table) => {
              const constituents = table.constituents || ALL_CONSTITUENTS;
              const rows = table.rows || [];
              const isCollapsed = Boolean(collapsedTables[table.table_id]);

              return (
                <Paper
                  key={table.table_id}
                  variant="outlined"
                  sx={{
                    borderRadius: 2.5,
                    overflow: "hidden",
                    borderColor: "#CBD5E1",
                    boxShadow: "0 2px 8px rgba(15, 23, 42, 0.05)",
                  }}
                >
                  {/* Table Header Bar with Collapsible Accordion Click */}
                  <Box
                    onClick={() => toggleCollapse(table.table_id)}
                    sx={{
                      bgcolor: "#17365D",
                      color: "white",
                      p: 1.8,
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: 1.5,
                      cursor: "pointer",
                      userSelect: "none",
                      "&:hover": { bgcolor: "#204B7D" },
                      transition: "background-color 0.15s ease",
                    }}
                  >
                    <Stack direction="row" spacing={1.2} alignItems="center" sx={{ maxWidth: "80%" }}>
                      <IconButton size="small" sx={{ color: "white", p: 0.4 }}>
                        {isCollapsed ? <ChevronRight size={18} /> : <ChevronDown size={18} />}
                      </IconButton>
                      <Box>
                        <Typography sx={{ fontSize: 13.5, fontWeight: 900, lineHeight: 1.4 }}>
                          {table.title}
                        </Typography>
                        <Typography sx={{ fontSize: 11, color: "#93C5FD" }}>
                          {isCollapsed ? "Collapsed — Click to expand" : "Expanded — Click to collapse"}
                        </Typography>
                      </Box>
                    </Stack>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography
                        sx={{
                          fontSize: 11.5,
                          fontWeight: 700,
                          bgcolor: "rgba(255,255,255,0.18)",
                          px: 1.5,
                          py: 0.4,
                          borderRadius: 1,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {table.total_events} Event{table.total_events === 1 ? "" : "s"} ({table.total_minutes} min)
                      </Typography>
                    </Stack>
                  </Box>

                  {/* Collapsible Table Content */}
                  <Collapse in={!isCollapsed} timeout="auto">
                    <TableContainer sx={{ maxHeight: 600 }}>
                  <Table size="small" stickyHeader sx={{ "& td, & th": { borderBottom: "1px solid #E2E8F0" } }}>
                    <TableHead>
                      {/* Row 1 Header */}
                      <TableRow sx={{ bgcolor: "#204B7D" }}>
                        <TableCell
                          rowSpan={2}
                          align="center"
                          sx={{
                            color: "white",
                            fontWeight: 800,
                            fontSize: 11.5,
                            bgcolor: "#204B7D",
                            width: 55,
                            borderRight: "1px solid #336199",
                            py: 1,
                          }}
                        >
                          Sr. No
                        </TableCell>
                        <TableCell
                          rowSpan={2}
                          align="center"
                          sx={{
                            color: "white",
                            fontWeight: 800,
                            fontSize: 11.5,
                            bgcolor: "#204B7D",
                            width: 80,
                            borderRight: "1px solid #336199",
                            py: 1,
                          }}
                        >
                          Date
                        </TableCell>
                        <TableCell
                          rowSpan={2}
                          align="center"
                          sx={{
                            color: "white",
                            fontWeight: 800,
                            fontSize: 11.5,
                            bgcolor: "#204B7D",
                            width: 105,
                            borderRight: "1px solid #336199",
                            py: 1,
                          }}
                        >
                          Window (Hrs)
                        </TableCell>
                        <TableCell
                          rowSpan={2}
                          align="center"
                          sx={{
                            color: "white",
                            fontWeight: 800,
                            fontSize: 11.5,
                            bgcolor: "#204B7D",
                            width: 90,
                            borderRight: "1px solid #336199",
                            py: 1,
                          }}
                        >
                          {table.threshold_col_name}
                        </TableCell>
                        <TableCell
                          rowSpan={2}
                          align="center"
                          sx={{
                            color: "white",
                            fontWeight: 800,
                            fontSize: 11.5,
                            bgcolor: "#204B7D",
                            width: 90,
                            borderRight: "1px solid #336199",
                            py: 1,
                          }}
                        >
                          Lowest (Hz)
                        </TableCell>
                        <TableCell
                          rowSpan={2}
                          align="center"
                          sx={{
                            color: "white",
                            fontWeight: 800,
                            fontSize: 11.5,
                            bgcolor: "#204B7D",
                            width: 80,
                            borderRight: "1px solid #336199",
                            py: 1,
                          }}
                        >
                          At (Hrs)
                        </TableCell>

                        {/* Constituent Group Headers */}
                        {constituents.map((state) => (
                          <TableCell
                            key={state}
                            colSpan={2}
                            align="center"
                            sx={{
                              color: "white",
                              fontWeight: 800,
                              fontSize: 12,
                              bgcolor: "#204B7D",
                              borderRight: "1px solid #336199",
                              py: 0.8,
                            }}
                          >
                            {state}
                          </TableCell>
                        ))}
                      </TableRow>

                      {/* Row 2 Sub-Headers */}
                      <TableRow sx={{ bgcolor: "#2B5E99" }}>
                        {constituents.map((state) => (
                          <Box component="span" key={state} sx={{ display: "contents" }}>
                            <TableCell
                              align="right"
                              sx={{
                                color: "white",
                                fontWeight: 800,
                                fontSize: 10.5,
                                bgcolor: "#2B5E99",
                                py: 0.6,
                                width: 70,
                              }}
                            >
                              Max OD
                            </TableCell>
                            <TableCell
                              align="right"
                              sx={{
                                color: "white",
                                fontWeight: 800,
                                fontSize: 10.5,
                                bgcolor: "#2B5E99",
                                py: 0.6,
                                width: 70,
                                borderRight: "1px solid #3d72b0",
                              }}
                            >
                              Avg Dev
                            </TableCell>
                          </Box>
                        ))}
                      </TableRow>
                    </TableHead>

                    <TableBody>
                      {rows.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={6 + constituents.length * 2}
                            align="center"
                            sx={{ py: 3, color: "#64748B", fontSize: 13 }}
                          >
                            No continuous frequency dips below {table.threshold_display} Hz recorded in the selected period.
                          </TableCell>
                        </TableRow>
                      ) : (
                        rows.map((row, idx) => (
                          <TableRow
                            key={row.sr_no}
                            sx={{
                              bgcolor: idx % 2 ? "#F8FAFC" : "#FFFFFF",
                              "&:hover": { bgcolor: "#F1F5F9" },
                            }}
                          >
                            <TableCell align="center" sx={{ fontWeight: 800, fontSize: 11.5, py: 0.6 }}>
                              {row.sr_no}
                            </TableCell>
                            <TableCell align="center" sx={{ fontSize: 11.5, py: 0.6, whiteSpace: "nowrap" }}>
                              {row.date}
                            </TableCell>
                            <TableCell align="center" sx={{ fontSize: 11.5, py: 0.6, fontFamily: "monospace" }}>
                              {row.window_hrs}
                            </TableCell>
                            <TableCell align="right" sx={{ fontWeight: 800, fontSize: 11.5, py: 0.6 }}>
                              {row.duration_min}
                            </TableCell>
                            <TableCell
                              align="right"
                              sx={{
                                fontWeight: 900,
                                color: "#DC2626",
                                fontSize: 11.5,
                                py: 0.6,
                              }}
                            >
                              {row.lowest_freq?.toFixed(3)}
                            </TableCell>
                            <TableCell align="center" sx={{ fontSize: 11.5, py: 0.6, fontFamily: "monospace" }}>
                              {row.lowest_at_time}
                            </TableCell>

                            {/* Constituent metrics */}
                            {constituents.map((state) => {
                              const cData = row.constituents_data?.[state] || {};
                              const maxOd = cData.max_od;
                              const avgDev = cData.avg_dev;
                              const hasOd = maxOd !== "–" && maxOd != null;

                              return (
                                <Box component="span" key={state} sx={{ display: "contents" }}>
                                  <TableCell
                                    align="right"
                                    sx={{
                                      fontSize: 11.5,
                                      fontWeight: hasOd ? 800 : 500,
                                      color: hasOd ? "#B91C1C" : "#64748B",
                                      py: 0.6,
                                    }}
                                  >
                                    {maxOd ?? "–"}
                                  </TableCell>
                                  <TableCell
                                    align="right"
                                    sx={{
                                      fontSize: 11.5,
                                      py: 0.6,
                                      borderRight: "1px solid #E2E8F0",
                                      fontWeight: 600,
                                    }}
                                  >
                                    {avgDev ?? "–"}
                                  </TableCell>
                                </Box>
                              );
                            })}
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Collapse>
            </Paper>
          );
        })}
      </Stack>
    </Box>
  )}
</Box>
  );
}
