import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  FormControlLabel,
  Paper,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import PreviewRoundedIcon from "@mui/icons-material/PreviewRounded";
import TableChartRoundedIcon from "@mui/icons-material/TableChartRounded";
import API from "../../services/api";

const isoDate = (date) => date.toISOString().slice(0, 10);
const yesterday = () => {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return isoDate(date);
};

const METRICS = [
  { value: "schedule", label: "Schedule" },
  { value: "dc", label: "DC" },
  { value: "cap_on_bar", label: "Capacity on Bar" },
  { value: "actual_gen", label: "Actual" },
];

export default function RTGHistoricalDownload() {
  const [fromDate, setFromDate] = useState(yesterday());
  const [toDate, setToDate] = useState(yesterday());
  const [metrics, setMetrics] = useState(METRICS.map((item) => item.value));
  const [states, setStates] = useState([]);
  const [selections, setSelections] = useState(["ISGS", "IPP"]);
  const [plantWise, setPlantWise] = useState(false);
  const [interval, setInterval] = useState(15);
  const [matrix, setMatrix] = useState({ columns: [], rows: [] });
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");

  const entityOptions = useMemo(() => [
    ...states.map((state) => ({ value: `STATE:${state}`, label: state, group: "State / State IPP" })),
    { value: "ISGS", label: "ISGS", group: "Central / Regional" },
    { value: "IPP", label: "IPP", group: "Central / Regional" },
  ], [states]);

  useEffect(() => {
    API.getRTGHistoricalOptions()
      .then((response) => {
        if (response?.success) setStates(response.states || []);
      })
      .catch(() => setError("Historical filter options could not be loaded."));
  }, []);

  const params = {
    start_date: fromDate,
    end_date: toDate,
    metrics,
    selections,
    plant_wise: plantWise,
    interval_minutes: interval,
  };

  const preview = async () => {
    if (!metrics.length || !selections.length) {
      setError("Select at least one data field and one State/ISGS/IPP option.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await API.getRTGHistoricalMatrix(params);
      if (!response?.success) throw new Error(response?.message || "Historical data could not be loaded.");
      setMatrix({ columns: response.columns || [], rows: response.rows || [] });
    } catch (requestError) {
      setError(requestError?.response?.data?.message || requestError.message || "Historical data could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  const download = async () => {
    if (!metrics.length || !selections.length) {
      setError("Select at least one data field and one State/ISGS/IPP option.");
      return;
    }
    setDownloading(true);
    setError("");
    try {
      const response = await API.downloadRTGHistoricalMatrix(params);
      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = `RTG_Historical_${fromDate}_to_${toDate}_${interval}min.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Excel download could not be prepared.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Paper variant="outlined" sx={{ mb: 2.2, borderRadius: 3, overflow: "hidden", borderColor: "#C9DCF8" }}>
      <Box sx={{ px: 2.2, py: 1.7, bgcolor: "#F3F8FF", borderBottom: "1px solid #D8E6FA", display: "flex", gap: 1.2, alignItems: "center" }}>
        <TableChartRoundedIcon sx={{ color: "#0057B7" }} />
        <Box>
          <Typography sx={{ fontWeight: 900, color: "#08103A", fontSize: 17 }}>RTG Historical Data Download</Typography>
          <Typography sx={{ color: "#52647D", fontSize: 12 }}>Build an entity-wise or plant-wise time matrix and export it to Excel.</Typography>
        </Box>
      </Box>

      <Box sx={{ p: 2, display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(220px, 1fr))", xl: "170px 170px 1.6fr 1.8fr auto" }, gap: 1.3, alignItems: "start" }}>
        <TextField size="small" type="date" label="From date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} InputLabelProps={{ shrink: true }} />
        <TextField size="small" type="date" label="To date" value={toDate} onChange={(event) => setToDate(event.target.value)} InputLabelProps={{ shrink: true }} />
        <Autocomplete
          multiple size="small" options={METRICS} disableCloseOnSelect
          value={METRICS.filter((option) => metrics.includes(option.value))}
          onChange={(_, value) => setMetrics(value.map((item) => item.value))}
          getOptionLabel={(option) => option.label}
          renderOption={(props, option, { selected }) => <li {...props}><Checkbox size="small" checked={selected} />{option.label}</li>}
          renderTags={(value, getTagProps) => value.map((option, index) => <Chip size="small" label={option.label} {...getTagProps({ index })} />)}
          renderInput={(inputParams) => <TextField {...inputParams} label="Data fields" placeholder="Schedule, DC, Capacity, Actual" />}
        />
        <Autocomplete
          multiple size="small" options={entityOptions} disableCloseOnSelect groupBy={(option) => option.group}
          value={entityOptions.filter((option) => selections.includes(option.value))}
          onChange={(_, value) => setSelections(value.map((item) => item.value))}
          getOptionLabel={(option) => option.label}
          renderOption={(props, option, { selected }) => <li {...props}><Checkbox size="small" checked={selected} />{option.label}</li>}
          renderTags={(value, getTagProps) => value.map((option, index) => <Chip size="small" label={option.label} {...getTagProps({ index })} />)}
          renderInput={(inputParams) => <TextField {...inputParams} label="State / ISGS / IPP" placeholder="Select entities" />}
        />
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, alignItems: "center" }}>
          <ToggleButtonGroup size="small" exclusive value={interval} onChange={(_, value) => value && setInterval(value)} color="primary">
            <ToggleButton value={5}>5 min</ToggleButton>
            <ToggleButton value={15}>15 min</ToggleButton>
          </ToggleButtonGroup>
          <FormControlLabel control={<Switch checked={plantWise} onChange={(event) => setPlantWise(event.target.checked)} />} label="Plant-wise" sx={{ m: 0, whiteSpace: "nowrap" }} />
        </Box>
      </Box>

      <Box sx={{ px: 2, pb: 1.7, display: "flex", gap: 1, flexWrap: "wrap" }}>
        <Button variant="outlined" startIcon={loading ? <CircularProgress size={16} /> : <PreviewRoundedIcon />} disabled={loading} onClick={preview}>Preview matrix</Button>
        <Button variant="contained" startIcon={downloading ? <CircularProgress size={16} color="inherit" /> : <DownloadRoundedIcon />} disabled={downloading} onClick={download}>Download Excel</Button>
      </Box>
      {error && <Alert severity="error" sx={{ mx: 2, mb: 2 }}>{error}</Alert>}

      {matrix.rows.length > 0 && (
        <TableContainer sx={{ maxHeight: 430, borderTop: "1px solid #D8E6FA" }}>
          <Table stickyHeader size="small" sx={{ minWidth: Math.max(760, 180 + matrix.columns.length * 175) }}>
            <TableHead><TableRow>
              <TableCell sx={{ fontWeight: 900, bgcolor: "#08103A", color: "white" }}>Date</TableCell>
              <TableCell sx={{ fontWeight: 900, bgcolor: "#08103A", color: "white" }}>Time</TableCell>
              {matrix.columns.map((column) => <TableCell key={column.key} align="right" sx={{ fontWeight: 900, bgcolor: "#0057B7", color: "white", minWidth: 170 }}>{column.label}</TableCell>)}
            </TableRow></TableHead>
            <TableBody>{matrix.rows.map((row) => <TableRow key={row.timestamp} hover>
              <TableCell>{row.date}</TableCell><TableCell>{row.time}</TableCell>
              {matrix.columns.map((column) => <TableCell key={column.key} align="right">{row[column.key] ?? "-"}</TableCell>)}
            </TableRow>)}</TableBody>
          </Table>
        </TableContainer>
      )}
      {!loading && matrix.columns.length > 0 && matrix.rows.length === 0 && <Alert severity="info" sx={{ mx: 2, mb: 2 }}>No RTG snapshots matched this selection.</Alert>}
    </Paper>
  );
}
