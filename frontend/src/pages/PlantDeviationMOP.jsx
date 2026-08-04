import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  InputAdornment,
  Paper,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import {
  Database,
  Download,
  Droplets,
  Factory,
  Copy,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
} from "lucide-react";
import AppShell from "../components/layout/AppShell";
import API from "../services/api";

const formatCapacity = (value) => (
  value === null || value === undefined
    ? "—"
    : Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 })
);

const localDate = () => {
  const value = new Date();
  value.setDate(value.getDate() - 1);
  value.setMinutes(value.getMinutes() - value.getTimezoneOffset());
  return value.toISOString().slice(0, 10);
};

const EDITABLE_FIELDS = [
  "running_capacity_mw",
  "max_generation_1900_2400_mw",
  "max_generation_1900_2400_time",
  "generation_max_min_1900_2400",
  "reason_for_not_attaining_full_generation",
];

const rowDraft = (row) => ({
  running_capacity_mw: row.capacity_on_bar_mw ?? "",
  max_generation_1900_2400_mw: row.max_generation_1900_2400_mw ?? "",
  max_generation_1900_2400_time: row.max_generation_1900_2400_time || "",
  generation_max_min_1900_2400: row.generation_max_min_1900_2400 || "",
  reason_for_not_attaining_full_generation: row.reason_for_not_attaining_full_generation || "",
});

function StaticPlantTable({ title, subtitle, icon, rows, tone, onSaveEdits }) {
  const [drafts, setDrafts] = useState(() => (
    Object.fromEntries(rows.map((row) => [row.plant_id, rowDraft(row)]))
  ));
  const [dirtyIds, setDirtyIds] = useState(new Set());
  const [savedIds, setSavedIds] = useState(new Set());
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  const revertEdits = () => {
    setDrafts(Object.fromEntries(rows.map((row) => [row.plant_id, rowDraft(row)])));
    setDirtyIds(new Set());
    setSavedIds(new Set());
  };

  const updateCell = (plantId, field, value) => {
    setDrafts((current) => ({
      ...current,
      [plantId]: { ...(current[plantId] || {}), [field]: value },
    }));
    setDirtyIds((current) => new Set(current).add(plantId));
    setSavedIds((current) => {
      const next = new Set(current);
      next.delete(plantId);
      return next;
    });
  };

  const visibleRows = useMemo(() => {
    if (!search.trim()) return rows;
    const query = search.trim().toLowerCase();
    return rows.filter((row) => [
      row.plant_name,
      row.plant_id,
      row.section,
      row.owner_name,
      row.state_name,
    ].some((value) => String(value || "").toLowerCase().includes(query)));
  }, [rows, search]);

  const pasteSeries = (event, startRow, startField) => {
    const text = event.clipboardData?.getData("text/plain");
    if (!text || (!text.includes("\t") && !text.includes("\n") && !text.includes("\r"))) return;
    event.preventDefault();
    const matrix = text
      .replace(/\r/g, "")
      .split("\n")
      .filter((line, index, lines) => line.length || index < lines.length - 1)
      .map((line) => line.split("\t"));
    const pastedIds = matrix
      .map((_, rowOffset) => visibleRows[startRow + rowOffset]?.plant_id)
      .filter(Boolean);
    setDrafts((current) => {
      const next = { ...current };
      matrix.forEach((values, rowOffset) => {
        const targetRow = visibleRows[startRow + rowOffset];
        if (!targetRow) return;
        const targetDraft = { ...(next[targetRow.plant_id] || rowDraft(targetRow)) };
        values.forEach((value, columnOffset) => {
          const field = EDITABLE_FIELDS[startField + columnOffset];
          if (field) targetDraft[field] = value.trim();
        });
        next[targetRow.plant_id] = targetDraft;
      });
      return next;
    });
    setDirtyIds((current) => {
      const next = new Set(current);
      pastedIds.forEach((plantId) => next.add(plantId));
      return next;
    });
  };

  const saveAll = async () => {
    if (!dirtyIds.size) {
      return;
    }
    setSaving(true);
    try {
      const saved = new Set(dirtyIds);
      await onSaveEdits(rows, drafts, saved);
      setSavedIds(saved);
      setDirtyIds(new Set());
    } finally {
      setSaving(false);
    }
  };

  const copyEditableData = async () => {
    const text = visibleRows
      .map((row) => {
        const values = drafts[row.plant_id] || rowDraft(row);
        return EDITABLE_FIELDS.map((field) => values[field] ?? "").join("\t");
      })
      .join("\n");
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  };

  const editField = (row, rowIndex, field, extra = {}) => (
    <TextField
      size="small"
      variant="standard"
      fullWidth
      value={drafts[row.plant_id]?.[field] ?? rowDraft(row)[field] ?? ""}
      onChange={(event) => updateCell(row.plant_id, field, event.target.value)}
      onPaste={(event) => pasteSeries(event, rowIndex, EDITABLE_FIELDS.indexOf(field))}
      {...extra}
      InputProps={{ disableUnderline: true }}
      sx={{
        minWidth: extra.type === "time" ? 88 : 105,
        bgcolor: dirtyIds.has(row.plant_id) ? "rgba(245,158,11,.08)" : "transparent",
        "& .MuiInputBase-root": { m: 0 },
        "& .MuiInputBase-input": {
          px: 0.65,
          py: 0.3,
          fontSize: 11.5,
          fontWeight: 700,
          border: "1px solid transparent",
          borderRadius: "3px",
        },
        "& .MuiInputBase-input:focus": {
          bgcolor: "#EFF6FF",
          borderColor: "#3B82F6",
        },
        ...extra.sx,
      }}
    />
  );

  const groupedRows = useMemo(() => {
    const groups = [];
    visibleRows.forEach((row) => {
      let group = groups.at(-1);
      if (!group || group.section !== row.section) {
        group = { section: row.section, category: row.category, rows: [] };
        groups.push(group);
      }
      group.rows.push(row);
    });
    return groups;
  }, [visibleRows]);

  return (
    <Paper
      elevation={0}
      sx={{
        minWidth: 0,
        border: "1px solid #CFE0F6",
        borderRadius: 3,
        overflow: "hidden",
        bgcolor: "#fff",
      }}
    >
      <Box
        sx={{
          px: 2,
          py: 1.5,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1,
          bgcolor: tone,
          borderBottom: "1px solid #CFE0F6",
        }}
      >
        <Stack direction="row" spacing={1.2} alignItems="center">
          {icon}
          <Box>
            <Typography sx={{ color: "#08103A", fontSize: 18, fontWeight: 900 }}>{title}</Typography>
            <Typography sx={{ color: "#475569", fontSize: 11.5 }}>{subtitle}</Typography>
          </Box>
        </Stack>
        <Stack direction="row" spacing={0.75} alignItems="center">
          <Chip label={`${visibleRows.length}/${rows.length} plants`} size="small" sx={{ bgcolor: "#fff", color: "#0057B7", fontWeight: 800 }} />
          <Button
            size="small"
            variant="outlined"
            startIcon={<Copy size={14} />}
            onClick={copyEditableData}
            sx={{ bgcolor: "#fff", fontWeight: 800 }}
          >
            Copy data
          </Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={<RotateCcw size={14} />}
            onClick={revertEdits}
            disabled={!dirtyIds.size || saving}
            sx={{ bgcolor: "#fff", fontWeight: 800 }}
          >
            Revert
          </Button>
          <Button
            size="small"
            variant="contained"
            startIcon={<Save size={14} />}
            onClick={saveAll}
            disabled={!dirtyIds.size || saving}
            sx={{ fontWeight: 900 }}
          >
            Save{dirtyIds.size ? ` (${dirtyIds.size})` : ""}
          </Button>
        </Stack>
      </Box>

      <Box
        sx={{
          px: 1.25,
          py: 0.8,
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          borderBottom: "1px solid #E2E8F0",
          bgcolor: "#fff",
        }}
      >
        <TextField
          size="small"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search plants, state, owner…"
          InputProps={{
            startAdornment: (
              <InputAdornment position="start"><Search size={13} color="#94A3B8" /></InputAdornment>
            ),
          }}
          sx={{
            width: 260,
            "& .MuiOutlinedInput-root": { bgcolor: "#F1F5F9", height: 32 },
            "& input": { fontSize: 11.5, py: 0.5 },
          }}
        />
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Typography sx={{ color: "#92400E", fontSize: 10.5 }}>
            <Box component="span" sx={{ display: "inline-block", width: 9, height: 9, mr: 0.5, borderRadius: 0.5, bgcolor: "rgba(245,158,11,.3)" }} />
            Unsaved
          </Typography>
          <Typography sx={{ color: "#047857", fontSize: 10.5 }}>
            <Box component="span" sx={{ display: "inline-block", width: 9, height: 9, mr: 0.5, borderRadius: 0.5, bgcolor: "rgba(16,185,129,.25)" }} />
            Saved
          </Typography>
          <Typography sx={{ color: "#94A3B8", fontSize: 10.5 }}>
            Ctrl+V to paste from Excel into editable cells
          </Typography>
        </Stack>
      </Box>

      <TableContainer sx={{ maxHeight: "calc(100vh - 300px)", minHeight: 420, width: "100%" }}>
        <Table
          stickyHeader
          size="small"
          aria-label={`${title} static plant table`}
          sx={{
            minWidth: 1540,
            tableLayout: "fixed",
            "& .MuiTableCell-root": {
              px: 0.8,
              py: 0.35,
              height: 32,
              borderRight: "1px solid #E2E8F0",
              borderBottom: "1px solid #E2E8F0",
            },
          }}
        >
          <TableHead>
            <TableRow>
              {[
                "Station / Constituents",
                "Section / State",
                "Installed Capacity (MW)",
                "Running Capacity (MW)",
                "Max Generation 19:00–24:00 (MW)",
                "Time (Hrs)",
                "Generation Max / Min (MW)",
                "Margin on Running Units (MW)",
                "Outage Capacity (MW)",
                "Reason for Not Attaining Full Generation",
                "Loading Factor (%)",
                "Expected Revival Dates of Units Under Outage",
              ].map((heading, index) => (
                <TableCell
                  key={heading}
                  sx={{
                    bgcolor: "#071F2A",
                    color: "#FFFFFF",
                    fontSize: 10.5,
                    fontWeight: 900,
                    borderColor: "#334155",
                    whiteSpace: "nowrap",
                    py: 0.8,
                    ...(index === 0 ? {
                      position: "sticky",
                      left: 0,
                      zIndex: 4,
                      width: 190,
                      minWidth: 190,
                    } : {}),
                  }}
                >
                  {heading}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {groupedRows.map((group) => ([
              <TableRow key={`${group.section}-heading`}>
                <TableCell
                  colSpan={12}
                  sx={{
                    py: 0.75,
                    bgcolor: group.category === "ISGS"
                      ? "#EAF2FF"
                      : (group.category === "Regional IPP" ? "#F3E8FF" : "#E9F8F0"),
                    color: group.category === "ISGS"
                      ? "#0057B7"
                      : (group.category === "Regional IPP" ? "#7E22CE" : "#006845"),
                    fontWeight: 900,
                    borderColor: "#CFE0F6",
                  }}
                >
                  {group.section}
                  <Typography component="span" sx={{ ml: 1, color: "#64748B", fontSize: 10.5, fontWeight: 700 }}>
                    {group.rows.length} plant stage{group.rows.length === 1 ? "" : "s"}
                  </Typography>
                </TableCell>
              </TableRow>,
              ...group.rows.map((row) => {
                const rowIndex = visibleRows.findIndex((item) => item.plant_id === row.plant_id);
                const rowBackground = dirtyIds.has(row.plant_id)
                  ? "rgba(245,158,11,.08)"
                  : (savedIds.has(row.plant_id) ? "rgba(16,185,129,.08)" : "#fff");
                const currentDraft = drafts[row.plant_id] || rowDraft(row);
                const draftNumber = (value) => {
                  if (value === "" || value === null || value === undefined) return null;
                  const parsed = Number(String(value).replace(/,/g, ""));
                  return Number.isNaN(parsed) ? null : parsed;
                };
                const running = draftNumber(currentDraft.running_capacity_mw);
                const maximum = draftNumber(currentDraft.max_generation_1900_2400_mw);
                const installed = draftNumber(row.installed_capacity_mw);
                const exBus = running === null ? null : running * 0.93;
                const liveMargin = exBus === null || maximum === null ? null : exBus - maximum;
                const liveOutage = installed === null || running === null ? null : installed - running;
                const liveLoading = exBus && maximum !== null ? (maximum / exBus) * 100 : null;
                return (
                <TableRow key={`${row.plant_id}-${row.serial}`} hover sx={{ bgcolor: rowBackground }}>
                  <TableCell
                    sx={{
                      width: 190,
                      minWidth: 190,
                      position: "sticky",
                      left: 0,
                      zIndex: 2,
                      bgcolor: rowBackground,
                    }}
                  >
                    <Typography sx={{ color: "#0F172A", fontSize: 12, fontWeight: 800 }}>{row.plant_name || "—"}</Typography>
                    <Typography sx={{ color: "#64748B", fontSize: 10.5 }}>
                      {[row.owner_name, row.plant_id && `ID ${row.plant_id}`].filter(Boolean).join(" · ") || "—"}
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ color: "#0F172A", fontSize: 11.5, fontWeight: 700 }}>{row.section}</TableCell>
                  <TableCell align="right" sx={{ color: "#0057B7", fontSize: 11.5, fontWeight: 900 }}>
                    {formatCapacity(row.installed_capacity_mw)}
                  </TableCell>
                  <TableCell align="right" sx={{ color: "#008645", fontSize: 11.5, fontWeight: 900 }}>
                    {editField(row, rowIndex, "running_capacity_mw", { type: "number" })}
                  </TableCell>
                  <TableCell align="right" sx={{ color: "#0057B7", fontSize: 11.5, fontWeight: 900, whiteSpace: "nowrap" }}>
                    {editField(row, rowIndex, "max_generation_1900_2400_mw", { type: "number" })}
                  </TableCell>
                  <TableCell align="center" sx={{ color: "#0F172A", fontSize: 11.5, fontWeight: 800, whiteSpace: "nowrap" }}>
                    {editField(row, rowIndex, "max_generation_1900_2400_time", { type: "time" })}
                  </TableCell>
                  <TableCell align="center" sx={{ color: "#0F172A", fontSize: 11.5, fontWeight: 900, whiteSpace: "nowrap" }}>
                    {editField(row, rowIndex, "generation_max_min_1900_2400", { placeholder: "Max / Min" })}
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{
                      bgcolor: "#FFFDE7",
                      color: Number(liveMargin) < 0 ? "#DC2626" : "#008645",
                      fontSize: 11.5,
                      fontWeight: 900,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {formatCapacity(liveMargin)}
                  </TableCell>
                  <TableCell align="right" sx={{ color: "#DC2626", fontSize: 11.5, fontWeight: 900, whiteSpace: "nowrap" }}>
                    {formatCapacity(liveOutage)}
                  </TableCell>
                  <TableCell sx={{ minWidth: 260, color: "#0F172A", fontSize: 11 }}>
                    {editField(row, rowIndex, "reason_for_not_attaining_full_generation", {
                        multiline: true,
                        minRows: 1,
                        sx: { minWidth: 250 },
                      })}
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{
                      bgcolor: "#FFF8E1",
                      color: Number(liveLoading) > 100 ? "#DC2626" : "#0057B7",
                      fontSize: 11.5,
                      fontWeight: 900,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {liveLoading === null || liveLoading === undefined
                      ? "—"
                      : `${Number(liveLoading).toLocaleString("en-IN", { maximumFractionDigits: 2 })}%`}
                  </TableCell>
                  <TableCell sx={{ minWidth: 220, color: "#7C2D12", fontSize: 10.5, fontWeight: 800 }}>
                    {row.expected_revival_time || "—"}
                  </TableCell>
                </TableRow>
                );
              }),
            ]))}
            {!rows.length && (
              <TableRow>
                <TableCell colSpan={12} align="center" sx={{ py: 8, color: "#64748B" }}>
                  No mapped {title.toLowerCase()} plants were found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}

export default function PlantDeviationMOP() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");
  const [reportDate, setReportDate] = useState(localDate());
  const [activeTab, setActiveTab] = useState(0);

  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    setError("");
    try {
      setReport(await API.getPlantDeviationStatic(reportDate, refresh));
    } catch (loadError) {
      setError(loadError.response?.data?.detail || loadError.message || "Unable to load static plant data.");
    } finally {
      setLoading(false);
    }
  }, [reportDate]);

  useEffect(() => { load(); }, [load]);

  const downloadExcel = async () => {
    setDownloading(true);
    setError("");
    try {
      const blob = await API.downloadPlantDeviationStatic(reportDate);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Plant_Deviation_IC_MOP_${reportDate}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (downloadError) {
      setError(downloadError.response?.data?.detail || downloadError.message || "Unable to download Excel.");
    } finally {
      setDownloading(false);
    }
  };

  const saveTableEdits = async (rows, drafts, dirtyIds) => {
    setError("");
    const numberOrNull = (value, plantName, fieldName) => {
      if (value === "" || value === null || value === undefined) return null;
      const number = Number(String(value).replace(/,/g, "").trim());
      if (Number.isNaN(number)) throw new Error(`${plantName}: ${fieldName} must be numeric.`);
      return number;
    };
    const dirtySet = new Set(dirtyIds);
    let edits;
    try {
      edits = rows
        .filter((row) => dirtySet.has(row.plant_id))
        .map((row) => {
          const draft = drafts[row.plant_id] || rowDraft(row);
          return {
            plant_id: row.plant_id,
            running_capacity_mw: numberOrNull(draft.running_capacity_mw, row.plant_name, "Running Capacity"),
            max_generation_1900_2400_mw: numberOrNull(
              draft.max_generation_1900_2400_mw,
              row.plant_name,
              "Max Generation",
            ),
            max_generation_1900_2400_time: draft.max_generation_1900_2400_time || "",
            generation_max_min_1900_2400: draft.generation_max_min_1900_2400 || "",
            reason_for_not_attaining_full_generation:
              draft.reason_for_not_attaining_full_generation || "",
          };
        });
      await API.savePlantDeviationEdits({ report_date: reportDate, edits });
      const editMap = new Map(edits.map((edit) => [edit.plant_id, edit]));
      setReport((current) => {
        const updateRows = (rows = []) => rows.map((item) => {
          const edit = editMap.get(item.plant_id);
          if (!edit) return item;
          const running = edit.running_capacity_mw;
          const maximum = edit.max_generation_1900_2400_mw;
          const installed = Number(item.installed_capacity_mw);
          const exBus = running === null ? null : running * 0.93;
          return {
            ...item,
            capacity_on_bar_mw: running,
            max_generation_1900_2400_mw: maximum,
            max_generation_1900_2400_time: edit.max_generation_1900_2400_time,
            generation_max_min_1900_2400: edit.generation_max_min_1900_2400,
            reason_for_not_attaining_full_generation: edit.reason_for_not_attaining_full_generation,
            reason_source: "selected_date",
            outage_capacity_mw: running === null || Number.isNaN(installed) ? null : installed - running,
            ex_bus_running_capacity_mw: exBus,
            running_units_margin_mw: exBus === null || maximum === null ? null : exBus - maximum,
            loading_factor_pct: exBus && maximum !== null ? (maximum / exBus) * 100 : null,
            manual_edit_fields: [
              "running_capacity_mw",
              "max_generation_1900_2400_mw",
              "max_generation_1900_2400_time",
              "generation_max_min_1900_2400",
            ],
          };
        });
        return {
          ...current,
          thermal: updateRows(current?.thermal),
          hydro: updateRows(current?.hydro),
        };
      });
    } catch (saveError) {
      setError(saveError.response?.data?.detail || saveError.message || "Unable to save table changes.");
      throw saveError;
    }
  };

  return (
    <AppShell>
      <Box
        sx={{
          borderRadius: 3,
          px: { xs: 2.25, md: 3 },
          py: 2.2,
          color: "#fff",
          background: "linear-gradient(105deg, #08103A 0%, #0057B7 62%, #0F86D7 100%)",
          display: "flex",
          alignItems: { xs: "flex-start", md: "center" },
          justifyContent: "space-between",
          flexDirection: { xs: "column", md: "row" },
          gap: 2,
        }}
      >
        <Box>
          <Chip
            icon={<Database size={13} />}
            label="REPORT PREPARATION"
            size="small"
            sx={{ mb: 0.8, color: "#fff", bgcolor: "rgba(255,255,255,.12)", fontWeight: 800, "& .MuiChip-icon": { color: "#fff" } }}
          />
          <Typography sx={{ fontSize: { xs: 23, md: 28 }, lineHeight: 1.15, fontWeight: 900 }}>
            Plant Deviation from I/C - MOP
          </Typography>
          <Typography sx={{ mt: 0.5, color: "rgba(255,255,255,.82)", fontSize: 12.5 }}>
            Static thermal and hydro plant master, prepared for SCADA deviation processing.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <TextField
            type="date"
            size="small"
            label="Report date"
            value={reportDate}
            onChange={(event) => setReportDate(event.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{
              width: 158,
              "& .MuiOutlinedInput-root": { bgcolor: "#fff" },
              "& .MuiInputLabel-root": { color: "#fff", fontWeight: 700 },
              "& .MuiInputLabel-root.Mui-focused": { color: "#fff" },
            }}
          />
          <Button
            variant="outlined"
            startIcon={<RefreshCw size={16} />}
            onClick={() => load(true)}
            disabled={loading}
            sx={{ color: "#fff", borderColor: "rgba(255,255,255,.55)", fontWeight: 800, "&:hover": { borderColor: "#fff", bgcolor: "rgba(255,255,255,.08)" } }}
          >
            Refresh
          </Button>
          <Button
            variant="contained"
            startIcon={downloading ? <CircularProgress size={15} color="inherit" /> : <Download size={16} />}
            onClick={downloadExcel}
            disabled={downloading || loading || !report}
            sx={{ bgcolor: "#fff", color: "#0057B7", fontWeight: 900, "&:hover": { bgcolor: "#EAF2FF" } }}
          >
            Excel
          </Button>
        </Stack>
      </Box>

      {error && <Alert severity="error">{error}</Alert>}

      {loading ? (
        <Paper elevation={0} sx={{ minHeight: 420, display: "grid", placeItems: "center", border: "1px solid #CFE0F6", borderRadius: 3 }}>
          <Stack alignItems="center" spacing={1.2}>
            <CircularProgress size={30} />
            <Typography sx={{ color: "#64748B", fontWeight: 700 }}>Preparing static plant tables…</Typography>
          </Stack>
        </Paper>
      ) : report && (
        <>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
            <Chip label="Static source: RTG Generator Master API" />
            <Chip label={`Capacity on Bar: ${report.capacity_on_bar_date} (D-1)`} />
            <Chip color="primary" variant="outlined" label={`Thermal ${report.summary?.thermal_records || 0}`} />
            <Chip color="success" variant="outlined" label={`Hydro ${report.summary?.hydro_records || 0}`} />
            <Chip
              color={report.summary?.capacity_on_bar_missing ? "warning" : "success"}
              variant="outlined"
              label={`CoB available ${report.summary?.capacity_on_bar_available || 0}`}
            />
            <Chip
              color={report.summary?.scada_evening_missing ? "warning" : "success"}
              variant="outlined"
              label={`19:00–24:00 SCADA ${report.summary?.scada_evening_available || 0}`}
            />
            <Chip
              color="info"
              variant="outlined"
              label={`Expected revival ${report.summary?.plants_with_expected_revival || 0} plants`}
            />
          </Stack>
          <Paper elevation={0} sx={{ border: "1px solid #CFE0F6", borderRadius: 3, overflow: "hidden" }}>
            <Tabs
              value={activeTab}
              onChange={(_, value) => setActiveTab(value)}
              variant="fullWidth"
              sx={{
                bgcolor: "#F8FAFC",
                "& .MuiTab-root": { minHeight: 52, color: "#475569", fontWeight: 900, fontSize: 14 },
                "& .Mui-selected": { color: "#0057B7" },
              }}
            >
              <Tab icon={<Factory size={18} />} iconPosition="start" label={`Thermal (${report.thermal?.length || 0})`} />
              <Tab icon={<Droplets size={18} />} iconPosition="start" label={`Hydro (${report.hydro?.length || 0})`} />
            </Tabs>
          </Paper>
          <Box sx={{ minWidth: 0, width: "100%" }}>
            {activeTab === 0 ? (
              <StaticPlantTable
                key="thermal"
                title="Thermal"
                subtitle="State/State IPP, Regional IPP, and ISGS thermal plants"
                icon={<Factory size={22} color="#C2410C" />}
                rows={report.thermal || []}
                tone="#FFF7ED"
                onSaveEdits={saveTableEdits}
              />
            ) : (
              <StaticPlantTable
                key="hydro"
                title="Hydro"
                subtitle="State/State IPP, Regional IPP, and ISGS hydro plants"
                icon={<Droplets size={22} color="#0057B7" />}
                rows={report.hydro || []}
                tone="#EFF6FF"
                onSaveEdits={saveTableEdits}
              />
            )}
          </Box>
        </>
      )}
    </AppShell>
  );
}
