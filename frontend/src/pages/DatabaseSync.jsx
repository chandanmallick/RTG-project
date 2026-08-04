import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  FormControl,
  InputAdornment,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import {
  CheckCheck,
  Database,
  ArrowLeftRight,
  RefreshCw,
  Search,
  ServerCog,
  LockKeyhole,
  UploadCloud,
} from "lucide-react";

import AppShell from "../components/layout/AppShell";
import PlantMappingGrid from "../components/PlantMappingGrid";
import API from "../services/api";
import { showModernPopup } from "../components/ui/ModernPopup";

const STATUS_STYLE = {
  MATCHED: { color: "#047857", bgcolor: "#DCFCE7", label: "Matched" },
  REVIEW: { color: "#B45309", bgcolor: "#FEF3C7", label: "Review" },
  UNMATCHED: { color: "#B91C1C", bgcolor: "#FEE2E2", label: "Unmatched" },
  RTG_ONLY: { color: "#1D4ED8", bgcolor: "#DBEAFE", label: "RTG only" },
};

const formatNumber = (value) => (
  value === null || value === undefined || value === ""
    ? "—"
    : Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 })
);

function SummaryCard({ label, value, color = "#0057B7" }) {
  return (
    <Paper elevation={0} sx={{ minWidth: 135, px: 1.6, py: 1.15, border: "1px solid #D9E7F7", borderRadius: 2.5, bgcolor: "#fff" }}>
      <Typography sx={{ color: "#64748B", fontSize: 10.5, fontWeight: 800, textTransform: "uppercase" }}>{label}</Typography>
      <Typography sx={{ mt: 0.15, color, fontSize: 21, lineHeight: 1.1, fontWeight: 900 }}>{value || 0}</Typography>
    </Paper>
  );
}

export default function DatabaseSync() {
  const [rows, setRows] = useState([]);
  const [rtgMaster, setRtgMaster] = useState([]);
  const [summary, setSummary] = useState({});
  const [selected, setSelected] = useState(new Set());
  const [choices, setChoices] = useState({});
  const [createFlags, setCreateFlags] = useState({});
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [updatingRtg, setUpdatingRtg] = useState("");
  const [error, setError] = useState("");
  const [mapData, setMapData] = useState([]);
  const [mapSearch, setMapSearch] = useState("");
  const [mapLoading, setMapLoading] = useState(false);

  const applyReview = (response) => {
    if (!response?.success) throw new Error(response?.message || "Unable to prepare the comparison.");
    const nextRows = response.rows || [];
    setRows(nextRows);
    setRtgMaster(response.rtg_master || []);
    setSummary(response.summary || {});
    setChoices(Object.fromEntries(nextRows.map((row) => [row.review_id, row.selected_rtg_plant_id || ""])));
    setCreateFlags({});
    setSelected(new Set());
  };

  const loadReview = async () => {
    try {
      setLoading(true);
      setError("");
      applyReview(await API.getDatabaseSyncReview());
    } catch (err) {
      setError(err.response?.data?.detail || err.message || "Unable to load staged comparison.");
    } finally {
      setLoading(false);
    }
  };

  const refreshReview = async () => {
    try {
      setLoading(true);
      setError("");
      const response = await API.refreshDatabaseSyncReview();
      applyReview(response);
      showModernPopup({
        type: "success",
        title: "Staging refreshed",
        subtitle: "Reporting data compared with RTG master",
        description: `${response.summary?.reporting_units || 0} units and ${response.summary?.rtg_master_records || 0} RTG plants are ready for review.`,
      });
    } catch (err) {
      const message = err.response?.data?.detail || err.message || "Unable to fetch source APIs.";
      setError(message);
      showModernPopup({ type: "error", title: "API loading failed", subtitle: "Staging was not changed", description: message });
    } finally {
      setLoading(false);
    }
  };

  const loadMapData = async () => {
    try {
      setMapLoading(true);
      const response = await API.fetchMapTable();
      setMapData(response?.data || []);
    } finally {
      setMapLoading(false);
    }
  };

  useEffect(() => {
    loadReview();
    loadMapData();
  }, []);

  const rtgById = useMemo(() => Object.fromEntries(rtgMaster.map((row) => [row.plant_id, row])), [rtgMaster]);
  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter !== "ALL" && row.status !== statusFilter) return false;
      if (!query) return true;
      return [
        row.reporting_plant_name,
        row.reporting_stage_name,
        row.reporting_stage_id,
        row.rtg_plant_name,
        choices[row.review_id],
        row.reporting_state_name,
        row.rtg_state_name,
      ].some((value) => String(value || "").toLowerCase().includes(query));
    });
  }, [rows, choices, search, statusFilter]);

  const toggle = (reviewId) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(reviewId)) next.delete(reviewId);
      else next.add(reviewId);
      return next;
    });
  };

  const selectSuggested = () => {
    setSelected(new Set(filteredRows
      .filter((row) => row.reporting_stage_id && (choices[row.review_id] || createFlags[row.review_id]))
      .map((row) => row.review_id)));
  };

  const selectAllVisible = (checked) => {
    setSelected((current) => {
      const next = new Set(current);
      filteredRows.forEach((row) => {
        if (!choices[row.review_id] && !createFlags[row.review_id]) return;
        if (checked) next.add(row.review_id);
        else next.delete(row.review_id);
      });
      return next;
    });
  };

  const commitSelected = async () => {
    const payload = rows
      .filter((row) => selected.has(row.review_id))
      .map((row) => ({
        review_id: row.review_id,
        selected_rtg_plant_id: choices[row.review_id] || "",
        create_in_rtg: Boolean(createFlags[row.review_id]),
      }));
    if (!payload.length) {
      showModernPopup({ type: "info", title: "Nothing selected", subtitle: "Select reviewed mappings to accept" });
      return;
    }
    try {
      setCommitting(true);
      const response = await API.commitDatabaseSyncReview(payload);
      if (response.errors?.length) throw new Error(response.errors.join("\n"));
      showModernPopup({
        type: "success",
        title: "Mappings accepted",
        subtitle: `${response.committed_mappings || 0} plant mappings committed`,
        description: `${response.committed_units || 0} staged unit records were applied using RTG master plant IDs.${response.created_rtg_plants ? ` ${response.created_rtg_plants} new RTG plant was created and verified.` : ""}`,
      });
      await Promise.all([loadReview(), loadMapData()]);
    } catch (err) {
      showModernPopup({ type: "error", title: "Commit failed", subtitle: "No further rows were accepted", description: err.message });
    } finally {
      setCommitting(false);
    }
  };

  const updateRtgStatic = async (row) => {
    try {
      setUpdatingRtg(row.review_id);
      const response = await API.updateDatabaseSyncRtgStatic([{ review_id: row.review_id }]);
      if (response.errors?.length) throw new Error(response.errors.join("\n"));
      showModernPopup({
        type: "success",
        title: "RTG static data updated",
        subtitle: `${row.rtg_plant_name || row.selected_rtg_plant_id} verified from RTG master`,
        description: `Installed capacity and reporting-authoritative static fields were updated for ${response.updated_rtg_plants || 0} RTG plant.`,
      });
      await loadReview();
    } catch (err) {
      showModernPopup({
        type: "error",
        title: "RTG update failed",
        subtitle: "The local locked mapping was not changed",
        description: err.response?.data?.detail || err.message,
      });
    } finally {
      setUpdatingRtg("");
    }
  };

  const saveMapTable = async (dirtyRows) => {
    try {
      setMapLoading(true);
      const response = await API.saveMapTable(dirtyRows);
      if (!response?.success) throw new Error(response?.message || "Unable to save mapping fields.");
      showModernPopup({ type: "success", title: "Mapping fields saved", subtitle: `${response.updated || 0} rows updated` });
      await loadMapData();
    } catch (err) {
      showModernPopup({ type: "error", title: "Save failed", subtitle: err.message });
    } finally {
      setMapLoading(false);
    }
  };

  const visibleSelectedCount = filteredRows.filter((row) => selected.has(row.review_id)).length;

  return (
    <AppShell>
      <Box sx={{ borderRadius: 3, px: { xs: 2, md: 3 }, py: 2.2, color: "#fff", background: "linear-gradient(105deg, #08103A 0%, #0057B7 62%, #0F86D7 100%)", display: "flex", justifyContent: "space-between", alignItems: { xs: "flex-start", md: "center" }, flexDirection: { xs: "column", md: "row" }, gap: 2 }}>
        <Box>
          <Chip icon={<ServerCog size={13} />} label="MASTER DATA" size="small" sx={{ mb: 0.7, color: "#fff", bgcolor: "rgba(255,255,255,.12)", fontWeight: 800, "& .MuiChip-icon": { color: "#fff" } }} />
          <Typography sx={{ fontSize: { xs: 23, md: 28 }, lineHeight: 1.1, fontWeight: 900 }}>RTG Data Sync Portal</Typography>
          <Typography sx={{ mt: 0.5, color: "rgba(255,255,255,.82)", fontSize: 12.5 }}>Master Database Sync & Mapping — stage, compare, review, then accept.</Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" startIcon={<RefreshCw size={16} />} onClick={loadReview} disabled={loading} sx={{ color: "#fff", borderColor: "rgba(255,255,255,.55)", fontWeight: 800 }}>Reload review</Button>
          <Button variant="contained" startIcon={loading ? <CircularProgress size={15} color="inherit" /> : <Database size={16} />} onClick={refreshReview} disabled={loading} sx={{ bgcolor: "#fff", color: "#0057B7", fontWeight: 900 }}>Fetch APIs into staging</Button>
        </Stack>
      </Box>

      {error && <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>}
      {!summary.generator_push_configured && (
        <Alert severity="warning" sx={{ borderRadius: 2 }}>
          Existing RTG mappings can be accepted. To create reporting-only plants in RTG, configure <b>rtg_generator_push_url</b> in the protected RTG pipeline configuration.
        </Alert>
      )}

      <Paper elevation={0} sx={{ p: 1.5, border: "1px solid #D9E7F7", borderRadius: 3 }}>
        <Stack direction={{ xs: "column", lg: "row" }} spacing={1.2} alignItems={{ xs: "stretch", lg: "center" }}>
          <Stack direction="row" spacing={1} sx={{ overflowX: "auto", pb: 0.25 }}>
            <SummaryCard label="Reporting units" value={summary.reporting_units} />
            <SummaryCard label="RTG master" value={summary.rtg_master_records} />
            <SummaryCard label="Matched" value={summary.matched} color="#047857" />
            <SummaryCard label="Needs review" value={summary.review} color="#B45309" />
            <SummaryCard label="Unmatched" value={summary.unmatched} color="#B91C1C" />
            <SummaryCard label="RTG only" value={summary.rtg_only} color="#1D4ED8" />
          </Stack>
          <Box sx={{ flex: 1 }} />
          <Stack direction="row" spacing={1}>
            <Button variant="outlined" startIcon={<ArrowLeftRight size={15} />} onClick={selectSuggested} disabled={!rows.length} sx={{ fontWeight: 800 }}>Select suggested</Button>
            <Button variant="contained" startIcon={committing ? <CircularProgress size={14} color="inherit" /> : <CheckCheck size={15} />} onClick={commitSelected} disabled={!selected.size || committing} sx={{ bgcolor: "#006845", fontWeight: 900 }}>Accept selected ({selected.size})</Button>
          </Stack>
        </Stack>
      </Paper>

      <Paper elevation={0} sx={{ border: "1px solid #D9E7F7", borderRadius: 3, overflow: "hidden" }}>
        <Box sx={{ px: 1.5, py: 1.1, display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap", bgcolor: "#F8FAFC", borderBottom: "1px solid #E2E8F0" }}>
          <TextField size="small" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search reporting or RTG plant…" InputProps={{ startAdornment: <InputAdornment position="start"><Search size={14} /></InputAdornment> }} sx={{ width: 310, "& .MuiOutlinedInput-root": { height: 36, bgcolor: "#fff" } }} />
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} sx={{ height: 36, bgcolor: "#fff" }}>
              <MenuItem value="ALL">All statuses</MenuItem>
              {Object.entries(STATUS_STYLE).map(([value, style]) => <MenuItem key={value} value={value}>{style.label}</MenuItem>)}
            </Select>
          </FormControl>
          <Typography sx={{ color: "#64748B", fontSize: 11.5, fontWeight: 700 }}>{filteredRows.length} rows · {visibleSelectedCount} selected in view</Typography>
        </Box>
        <TableContainer sx={{ maxHeight: "52vh" }}>
          <Table stickyHeader size="small" sx={{ minWidth: 1450, "& .MuiTableCell-root": { borderRight: "1px solid #E2E8F0", py: 0.55 } }}>
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox"><Checkbox checked={filteredRows.length > 0 && filteredRows.every((row) => (!choices[row.review_id] && !createFlags[row.review_id]) || selected.has(row.review_id))} indeterminate={visibleSelectedCount > 0 && visibleSelectedCount < filteredRows.filter((row) => choices[row.review_id] || createFlags[row.review_id]).length} onChange={(event) => selectAllVisible(event.target.checked)} /></TableCell>
                {["Status", "Reporting plant / stage", "Reporting details", "RTG master mapping", "RTG details", "Method", "Confidence", "Review"].map((label) => <TableCell key={label} sx={{ bgcolor: "#08103A", color: "#fff", fontWeight: 900, whiteSpace: "nowrap" }}>{label}</TableCell>)}
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredRows.map((row) => {
                const status = STATUS_STYLE[row.status] || STATUS_STYLE.REVIEW;
                const choice = choices[row.review_id] || "";
                const createInRtg = Boolean(createFlags[row.review_id]);
                const selectedRtg = rtgById[choice] || (choice ? {
                  plant_id: choice,
                  plant_name: row.rtg_plant_name,
                  installed_capacity: row.rtg_capacity_mw,
                  state_name: row.rtg_state_name,
                  owner_name: row.rtg_owner_name,
                } : {});
                const reportingCapacity = Number(row.reporting_capacity_mw);
                const rtgCapacity = Number(selectedRtg.installed_capacity);
                const capacityMismatch = Number.isFinite(reportingCapacity)
                  && Number.isFinite(rtgCapacity)
                  && Math.abs(reportingCapacity - rtgCapacity) > 0.01;
                return (
                  <TableRow key={row.review_id} hover sx={{ bgcolor: row.review_status === "ACCEPTED" ? "#F0FDF4" : "#fff" }}>
                    <TableCell padding="checkbox"><Checkbox checked={selected.has(row.review_id)} disabled={!choice && !createInRtg} onChange={() => toggle(row.review_id)} /></TableCell>
                    <TableCell><Chip size="small" label={status.label} sx={{ color: status.color, bgcolor: status.bgcolor, fontWeight: 900 }} />{row.review_status === "ACCEPTED" && <Chip size="small" label="Accepted" sx={{ ml: 0.5, color: "#047857", bgcolor: "#DCFCE7", fontWeight: 800 }} />}</TableCell>
                    <TableCell sx={{ minWidth: 230 }}><Typography sx={{ fontSize: 12, color: "#0F172A", fontWeight: 900 }}>{row.reporting_plant_name || "—"}</Typography><Typography sx={{ fontSize: 10.5, color: "#64748B" }}>Stage {row.reporting_stage_name || "—"} · ID {row.reporting_stage_id || "—"} · {row.unit_count || 0} units</Typography></TableCell>
                    <TableCell sx={{ minWidth: 190, fontSize: 11 }}><b>{formatNumber(row.reporting_capacity_mw)} MW</b><br />{row.reporting_state_name || "—"}<br />{row.reporting_owner_name || "—"}</TableCell>
                    <TableCell sx={{ minWidth: 330 }}>
                      <Autocomplete
                        size="small"
                        options={rtgMaster}
                        value={choice ? selectedRtg : null}
                        disabled={Boolean(row.mapping_locked)}
                        disableClearable={Boolean(row.mapping_locked)}
                        isOptionEqualToValue={(option, value) => option.plant_id === value.plant_id}
                        getOptionLabel={(plant) => `${plant.plant_id || ""} — ${plant.plant_name || ""} (${formatNumber(plant.installed_capacity)} MW)`}
                        onChange={(_, plant) => {
                          const plantId = plant?.plant_id || "";
                          setChoices((current) => ({ ...current, [row.review_id]: plantId }));
                          setCreateFlags((current) => ({ ...current, [row.review_id]: false }));
                          if (plantId) setSelected((current) => new Set(current).add(row.review_id));
                        }}
                        renderInput={(params) => (
                          <TextField
                            {...params}
                            placeholder="Search RTG ID or plant name"
                            sx={{
                              "& .MuiOutlinedInput-root": { minHeight: 36, bgcolor: choice ? "#fff" : "#FFF7ED", fontSize: 11.5 },
                            }}
                          />
                        )}
                      />
                      {!row.mapping_locked && row.reporting_stage_id && !choice && (
                        <Button
                          size="small"
                          variant={createInRtg ? "contained" : "outlined"}
                          color={createInRtg ? "success" : "primary"}
                          startIcon={<UploadCloud size={13} />}
                          disabled={!summary.generator_push_configured}
                          onClick={() => {
                            setCreateFlags((current) => ({ ...current, [row.review_id]: !createInRtg }));
                            setSelected((current) => {
                              const next = new Set(current);
                              if (!createInRtg) next.add(row.review_id); else next.delete(row.review_id);
                              return next;
                            });
                          }}
                          sx={{ mt: 0.55, fontSize: 10.5, fontWeight: 850 }}
                        >
                          {createInRtg ? "New RTG plant selected" : "Create as new RTG plant"}
                        </Button>
                      )}
                      {row.mapping_locked && (
                        <Stack direction="row" spacing={0.4} alignItems="center" sx={{ mt: 0.4, color: "#047857" }}>
                          <LockKeyhole size={11} />
                          <Typography sx={{ fontSize: 9.5, fontWeight: 800 }}>
                            Saved reference — RTG ID is locked
                          </Typography>
                        </Stack>
                      )}
                      {row.candidates?.length > 1 && <Typography sx={{ mt: 0.35, color: "#64748B", fontSize: 9.5 }}>Suggested alternatives: {row.candidates.slice(0, 3).map((candidate) => `${candidate.plant_name} ${candidate.score}%`).join(" · ")}</Typography>}
                    </TableCell>
                    <TableCell sx={{ minWidth: 190, fontSize: 11 }}><b>{formatNumber(selectedRtg.installed_capacity)} MW</b><br />{selectedRtg.state_name || "—"}<br />{selectedRtg.owner_name || "—"}</TableCell>
                    <TableCell sx={{ fontSize: 10.5, color: "#475569" }}>
                      {String(row.match_method || "").replaceAll("_", " ")}
                      {row.current_rtg_plant_id && (
                        <Typography sx={{ mt: 0.25, color: row.current_mapping_score >= 70 ? "#64748B" : "#B91C1C", fontSize: 9.5, fontWeight: 700 }}>
                          Previous: {row.current_rtg_plant_id} ({formatNumber(row.current_mapping_score)}%)
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell><Typography sx={{ color: row.confidence >= 85 ? "#047857" : (row.confidence >= 65 ? "#B45309" : "#B91C1C"), fontWeight: 900 }}>{formatNumber(row.confidence)}%</Typography></TableCell>
                    <TableCell sx={{ minWidth: 145 }}>
                      <Stack spacing={0.55} alignItems="flex-start">
                        <Button size="small" variant={selected.has(row.review_id) ? "contained" : "outlined"} disabled={!choice && !createInRtg} onClick={() => toggle(row.review_id)} sx={{ minWidth: 78, fontWeight: 800 }}>{selected.has(row.review_id) ? "Selected" : "Accept"}</Button>
                        {row.mapping_locked && capacityMismatch && (
                          <Button
                            size="small"
                            variant="contained"
                            color="warning"
                            startIcon={updatingRtg === row.review_id ? <CircularProgress size={12} color="inherit" /> : <RefreshCw size={13} />}
                            disabled={updatingRtg === row.review_id || !summary.generator_push_configured}
                            onClick={() => updateRtgStatic(row)}
                            sx={{ whiteSpace: "nowrap", fontSize: 10, fontWeight: 900 }}
                          >
                            Update RTG data
                          </Button>
                        )}
                        {row.mapping_locked && capacityMismatch && (
                          <Typography sx={{ color: "#B45309", fontSize: 9.5, fontWeight: 800 }}>
                            {formatNumber(rtgCapacity)} → {formatNumber(reportingCapacity)} MW
                          </Typography>
                        )}
                      </Stack>
                    </TableCell>
                  </TableRow>
                );
              })}
              {!filteredRows.length && <TableRow><TableCell colSpan={9} align="center" sx={{ py: 7, color: "#64748B" }}>{loading ? "Loading comparison…" : "Fetch the APIs into staging to prepare the comparison."}</TableCell></TableRow>}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Paper elevation={0} sx={{ p: 1.5, border: "1px solid #D9E7F7", borderRadius: 3 }}>
        <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" spacing={1} sx={{ mb: 1 }}>
          <Box><Typography sx={{ color: "#08103A", fontSize: 17, fontWeight: 900 }}>Operational Mapping Fields</Typography><Typography sx={{ color: "#64748B", fontSize: 11.5 }}>After accepting the RTG identity, maintain WBES, SCADA, CRMS and source selections here.</Typography></Box>
          <TextField size="small" value={mapSearch} onChange={(event) => setMapSearch(event.target.value)} placeholder="Search accepted mappings…" InputProps={{ startAdornment: <InputAdornment position="start"><Search size={14} /></InputAdornment> }} sx={{ width: 290, "& .MuiOutlinedInput-root": { height: 36 } }} />
        </Stack>
        <PlantMappingGrid data={mapData} loading={mapLoading} onSave={saveMapTable} maxHeight="45vh" searchText={mapSearch} />
      </Paper>
    </AppShell>
  );
}
