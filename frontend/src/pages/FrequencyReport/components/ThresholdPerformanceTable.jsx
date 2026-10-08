import { Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from "@mui/material";
export const LEVELS = ["49.90", "49.70", "49.50"];
export const metricValue = value => value == null ? "—" : typeof value === "number" ? Number(value.toFixed(3)).toLocaleString("en-IN") : value;
const fixedValue = (value, digits) => value == null ? "—" : typeof value === "number" ? value.toLocaleString("en-IN", { minimumFractionDigits: digits, maximumFractionDigits: digits }) : value;
export const frequencyValue = value => fixedValue(value, 3);
export const overdrawalValue = value => fixedValue(value, 0);
const stamp = value => String(value || "").replace("T", " ");
export default function ThresholdPerformanceTable({ rows = [], levels = LEVELS, high = false, report = false, summary = {} }) {
  if (report) {
    const thresholds = ['49.50', '49.70', '49.90'];
    const header = { bgcolor: '#17365D', color: 'white', fontWeight: 850, border: '1px solid #17365D', position: 'static' };
    const subheader = { ...header, bgcolor: '#DBE5F1', color: '#17365D', fontSize: 11 };
    const cell = { border: '1px solid #CBD5E1', fontSize: 11 };
    return <TableContainer sx={{ overflowX: 'auto', border: '1px solid #CBD5E1' }}><Table size="small" sx={{ minWidth: 1500 }}>
      <TableHead><TableRow><TableCell rowSpan={3} sx={header}>Reporting Period</TableCell><TableCell rowSpan={3} sx={header}>Entity Name</TableCell><TableCell rowSpan={3} sx={header}>Min. Freq. (Hz) &amp; Time</TableCell>{thresholds.map(level => <TableCell key={level} colSpan={4} align="center" sx={header}>Freq &lt;{Number(level)} Hz</TableCell>)}</TableRow>
        <TableRow>{thresholds.map(level => <TableCell key={level} colSpan={4} align="center" sx={subheader}>Duration: {metricValue(summary.thresholds?.[level]?.frequency_minutes)} Min</TableCell>)}</TableRow>
        <TableRow>{thresholds.flatMap(level => ['OD/UI Duration (Min & %)', 'Avg. OD/UI (MW)', 'Max OD/UI (MW)', 'Violation Messages'].map(label => <TableCell key={`${level}-${label}`} align="center" sx={subheader}>{label}</TableCell>))}</TableRow></TableHead>
      <TableBody>{rows.map(row => <TableRow key={row.entity_id}><TableCell sx={cell}>{stamp(row.period_start)}<br />{stamp(row.period_end)}</TableCell><TableCell sx={cell}>{row.entity}</TableCell><TableCell sx={cell}>{frequencyValue(summary.minimum_frequency)}<br />{stamp(summary.minimum_timestamp)}</TableCell>{thresholds.flatMap(level => {
        const metrics = row.thresholds?.[level] || {};
        return [metrics.unknown_deviation_minutes > 0 ? 'Data not available' : `${metricValue(metrics.adverse_minutes)} min / ${metricValue(metrics.adverse_pct)}%`, overdrawalValue(metrics.average_od_ui_mw), overdrawalValue(metrics.maximum_od_ui_mw), metricValue(metrics.message_count)].map((value, index) => <TableCell key={`${level}-${index}`} sx={cell}>{value}</TableCell>);
      })}</TableRow>)}{!rows.length && <TableRow><TableCell colSpan={15}>Data not available for the selected entities.</TableCell></TableRow>}</TableBody>
    </Table></TableContainer>;
  }
  const sticky = { position: "sticky", left: 0, minWidth: 190, maxWidth: 240, bgcolor: "#FFFFFF", zIndex: 2, boxShadow: "1px 0 #DCE9E5" };
  return <TableContainer sx={{ maxHeight: 480, border: "1px solid #DCE9E5", borderRadius: 1 }}><Table size="small" stickyHeader sx={{ minWidth: 1880 }}>
    <TableHead><TableRow><TableCell rowSpan={2} sx={{ ...sticky, bgcolor: "#F1F7F5", zIndex: 5, fontWeight: 850 }}>Entity</TableCell><TableCell rowSpan={2} sx={{ minWidth: 210, bgcolor: "#F1F7F5", fontWeight: 850 }}>Period (IST)</TableCell>{levels.map((level, index) => <TableCell key={level} colSpan={5} align="center" sx={{ bgcolor: ["#FFF7ED", "#FFEDD5", "#FEE2E2"][index], fontWeight: 850 }}>Frequency {high ? ">" : "<"}{level} Hz</TableCell>)}<TableCell rowSpan={2} sx={{ bgcolor: "#F1F7F5", fontWeight: 850 }}>Lowest Hz</TableCell><TableCell rowSpan={2} sx={{ bgcolor: "#F1F7F5", fontWeight: 850 }}>Messages</TableCell></TableRow>
      <TableRow>{levels.flatMap(level => ["Freq Minutes", "OD/UI Minutes", "OD/UI %", "15-Min Avg OD/UI (MW)", "Max OD/UI (MW)"].map(label => <TableCell key={`${level}-${label}`} sx={{ top: 38, minWidth: 95, bgcolor: "#F8FAFC", fontWeight: 750 }}>{label}</TableCell>))}</TableRow></TableHead>
    <TableBody>{rows.map((row, index) => <TableRow key={`${row.entity_id}-${row.period_start}-${index}`}><TableCell sx={sticky}>{row.entity}</TableCell><TableCell sx={{ fontSize: 11 }}>{stamp(row.period_start)}<br />{stamp(row.period_end)}</TableCell>{levels.flatMap(level => ["frequency_minutes", "adverse_minutes", "adverse_pct", "average_od_ui_mw", "maximum_od_ui_mw"].map(key => <TableCell key={`${level}-${key}`} title={row.thresholds?.[level]?.unknown_deviation_minutes > 0 ? `${metricValue(row.thresholds[level].unknown_deviation_minutes)} frequency minutes have unknown deviation; adverse minutes are observed coverage only.` : undefined} sx={{ fontSize: 12 }}>{key.endsWith("_od_ui_mw") ? overdrawalValue(row.thresholds?.[level]?.[key]) : metricValue(row.thresholds?.[level]?.[key])}</TableCell>))}<TableCell>{frequencyValue(row.lowest_frequency)}</TableCell><TableCell>{metricValue(row.message_count)}</TableCell></TableRow>)}{!rows.length && <TableRow><TableCell colSpan={19}>No performance rows for the selected group/period.</TableCell></TableRow>}</TableBody>
  </Table></TableContainer>;
}
