import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download, LayoutGrid, RefreshCw, Search, Table2 } from "lucide-react";

import CalendarInput from "../components/ui/CalendarInput";
import API from "../services/api";

const PAGE_SIZE = 100;

const monthRange = (value) => {
  const [year, month] = value.split("-").map(Number);
  if (!year || !month) return null;
  const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  return { startDate: `${value}-01`, endDate: end };
};

const weekRange = (value) => {
  const match = /^(\d{4})-W(\d{2})$/.exec(value || "");
  if (!match) return null;
  const year = Number(match[1]);
  const week = Number(match[2]);
  const januaryFourth = new Date(Date.UTC(year, 0, 4));
  const monday = new Date(januaryFourth);
  monday.setUTCDate(januaryFourth.getUTCDate() - ((januaryFourth.getUTCDay() + 6) % 7) + ((week - 1) * 7));
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return { startDate: monday.toISOString().slice(0, 10), endDate: sunday.toISOString().slice(0, 10) };
};

const formatNumber = (value) => Number(value || 0).toLocaleString("en-IN");
const formatMetric = (value) => (value === "" || value === null || value === undefined ? "-" : value);

function MultiSelectFilter({ label, options, selected, onChange }) {
  const toggle = (value) => onChange(selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value]);
  return (
    <details style={s.multiSelect}>
      <summary style={s.multiSummary}>{selected.length ? `${selected.length} ${label.toLowerCase()}` : `All ${label.toLowerCase()}`}</summary>
      <div style={s.multiMenu}>
        <div style={s.multiMenuHeader}><strong>{label}</strong><button type="button" onClick={() => onChange([])}>Clear</button></div>
        {options.map((option) => (
          <label key={option.value} style={s.checkOption}>
            <input type="checkbox" checked={selected.includes(option.value)} onChange={() => toggle(option.value)} />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </details>
  );
}

function MatrixTable({ matrix }) {
  return (
    <div style={s.matrixWrap}>
      <table style={s.matrixTable}>
        <thead><tr><th style={{ ...s.matrixHeader, ...s.matrixPeriod }}>Period</th>{(matrix?.columns || []).map((column) => <th key={column.key} title={column.label} style={s.matrixHeader}>{column.label}</th>)}<th style={{ ...s.matrixHeader, ...s.matrixTotal }}>Total</th></tr></thead>
        <tbody>
          {(matrix?.rows || []).map((row) => (
            <tr key={row.key}><th style={s.matrixPeriod}>{row.label}</th>{(matrix?.columns || []).map((column) => <td key={column.key} style={row.values?.[column.key] ? s.matrixValue : s.matrixZero}>{row.values?.[column.key] || 0}</td>)}<td style={s.matrixTotal}>{formatNumber(row.total)}</td></tr>
          ))}
          {(matrix?.rows || []).length > 0 && <tr style={s.matrixTotalsRow}><th style={s.matrixPeriod}>Total</th>{(matrix?.columns || []).map((column) => <td key={column.key}>{formatNumber(column.total)}</td>)}<td style={s.matrixTotal}>{formatNumber(matrix?.grand_total)}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

export default function ViolationMessageHistory() {
  const [meta, setMeta] = useState({ constituents: [], violation_types: [], sub_violation_types: [], total_count: 0, min_date: "", max_date: "" });
  const [data, setData] = useState({ rows: [], summary: [], matrix: { columns: [], rows: [], grand_total: 0 }, segregated_matrices: [], type_counts: {}, constituent_counts: {}, total_count: 0 });
  const [periodMode, setPeriodMode] = useState("month");
  const [selectedMonth, setSelectedMonth] = useState("");
  const [selectedWeek, setSelectedWeek] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [search, setSearch] = useState("");
  const [constituent, setConstituent] = useState("");
  const [violationTypes, setViolationTypes] = useState([]);
  const [subViolationTypes, setSubViolationTypes] = useState([]);
  const [grouping, setGrouping] = useState("daily");
  const [summaryView, setSummaryView] = useState("cards");
  const [matrixGrouping, setMatrixGrouping] = useState("daily");
  const [applied, setApplied] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState("");
  const [error, setError] = useState("");

  const fetchRows = async (filters, nextPage = 1) => {
    setLoading(true);
    setError("");
    try {
      const response = await API.getOldLogbookViolationMessages({
        ...filters,
        limit: PAGE_SIZE,
        skip: (nextPage - 1) * PAGE_SIZE,
      });
      if (!response?.success) throw new Error(response?.error || "Unable to load violation messages.");
      setData(response);
      setApplied(filters);
      setPage(nextPage);
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Unable to load violation messages.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initialize = async () => {
      try {
        const response = await API.getOldLogbookViolationMeta();
        if (!response?.success) throw new Error("Unable to read violation-message metadata.");
        setMeta(response);
        const maxDate = response.max_date;
        const initialMonth = maxDate?.slice(0, 7) || "";
        const range = monthRange(initialMonth);
        if (!range) throw new Error("No dated violation messages are available.");
        setSelectedMonth(initialMonth);
        setStartDate(range.startDate);
        setEndDate(range.endDate);
        await fetchRows({ ...range, search: "", constituent: "", violationTypes: [], subViolationTypes: [], grouping: "daily", matrixGrouping: "daily" }, 1);
      } catch (err) {
        setError(err?.response?.data?.detail || err?.message || "Unable to initialize violation-message history.");
        setLoading(false);
      }
    };
    initialize();
  }, []);

  const requestedRange = () => {
    if (periodMode === "month") return monthRange(selectedMonth);
    if (periodMode === "week") return weekRange(selectedWeek);
    return startDate && endDate ? { startDate, endDate } : null;
  };

  const submit = (event) => {
    event?.preventDefault();
    const range = requestedRange();
    if (!range) {
      setError(`Select a valid ${periodMode}.`);
      return;
    }
    setStartDate(range.startDate);
    setEndDate(range.endDate);
    fetchRows({ ...range, search: search.trim(), constituent, violationTypes, subViolationTypes, grouping, matrixGrouping }, 1);
  };

  const changePage = (nextPage) => {
    if (applied) fetchRows(applied, nextPage);
  };

  const changeMatrixGrouping = (nextGrouping) => {
    setMatrixGrouping(nextGrouping);
    if (applied) fetchRows({ ...applied, matrixGrouping: nextGrouping }, 1);
  };

  const downloadExcel = async () => {
    if (!applied) return;
    setDownloading("excel");
    setError("");
    try {
      const blob = await API.downloadOldLogbookViolationExcel(applied);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `violation_messages_${applied.startDate}_to_${applied.endDate}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setError(err?.message || "Unable to download Excel.");
    } finally {
      setDownloading("");
    }
  };

  const downloadPdf = async () => {
    if (!applied) return;
    setDownloading("pdf");
    setError("");
    try {
      const blob = await API.downloadOldLogbookViolationPdf(applied);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `violation_matrices_${applied.startDate}_to_${applied.endDate}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setError(err?.message || "Unable to download PDF.");
    } finally {
      setDownloading("");
    }
  };

  const totalPages = Math.max(1, Math.ceil((data.total_count || 0) / PAGE_SIZE));
  const topTypes = useMemo(() => Object.entries(data.type_counts || {}).slice(0, 4), [data.type_counts]);
  const summaryGrouping = applied?.grouping || grouping;
  const subtypeOptions = useMemo(() => (meta.sub_violation_types || []).map((value) => ({ value, label: value === "__NONE__" ? "No subtype" : value })), [meta.sub_violation_types]);

  return (
    <div style={s.page}>
      <div style={s.intro}>
        <div>
          <div style={s.eyebrow}>Old_logbook · Violation_Message</div>
          <h2 style={s.title}>Violation Message History</h2>
          <p style={s.subtitle}>Search constituent-wise messages and review daily, weekly or monthly summaries.</p>
        </div>
        <button type="button" style={s.outlineButton} onClick={() => applied && fetchRows(applied, page)} disabled={loading || !applied}>
          <RefreshCw size={15} /> {loading ? "Loading" : "Refresh"}
        </button>
      </div>

      <form style={s.searchPanel} onSubmit={submit}>
        <div style={s.periodModes}>
          {[['date', 'Date range'], ['week', 'Week'], ['month', 'Month']].map(([id, label]) => (
            <button key={id} type="button" onClick={() => setPeriodMode(id)} style={{ ...s.modeButton, ...(periodMode === id ? s.modeButtonActive : {}) }}>
              {label}
            </button>
          ))}
        </div>
        <div style={s.filters}>
          {periodMode === "date" && (
            <div style={s.calendarWrap}>
              <CalendarInput mode="range" value={startDate} endValue={endDate} onRangeChange={(start, end) => { setStartDate(start); setEndDate(end); }} placeholder="Select date range" style={s.calendar} />
            </div>
          )}
          {periodMode === "week" && <input type="week" value={selectedWeek} onChange={(event) => setSelectedWeek(event.target.value)} style={s.input} />}
          {periodMode === "month" && <input type="month" value={selectedMonth} min={meta.min_date?.slice(0, 7)} max={meta.max_date?.slice(0, 7)} onChange={(event) => setSelectedMonth(event.target.value)} style={s.input} />}
          <select value={constituent} onChange={(event) => setConstituent(event.target.value)} style={s.select}>
            <option value="">All constituents</option>
            {(meta.constituents || []).map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <MultiSelectFilter
            label="Violation types"
            options={(meta.violation_types || []).map((value) => ({ value, label: value }))}
            selected={violationTypes}
            onChange={setViolationTypes}
          />
          <MultiSelectFilter
            label="Message categories"
            options={subtypeOptions}
            selected={subViolationTypes}
            onChange={setSubViolationTypes}
          />
          <div style={s.searchInputWrap}>
            <Search size={16} color="#64748B" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search message, type, date, ID..." style={s.searchInput} />
          </div>
          <select value={grouping} onChange={(event) => setGrouping(event.target.value)} style={s.select} title="Summary combination">
            <option value="daily">Daily summary</option>
            <option value="weekly">Weekly summary</option>
            <option value="monthly">Monthly summary</option>
          </select>
          <button type="submit" style={s.searchButton} disabled={loading}><Search size={15} /> Search</button>
        </div>
      </form>

      {error && <div style={s.error}>{error}</div>}

      <div style={s.metrics}>
        <div style={s.metric}><span>Filtered messages</span><strong>{formatNumber(data.total_count)}</strong><small>{applied ? `${applied.startDate} to ${applied.endDate}` : "-"}</small></div>
        <div style={s.metric}><span>Constituents</span><strong>{formatNumber(Object.keys(data.constituent_counts || {}).length)}</strong><small>{constituent || "All constituents"}</small></div>
        <div style={s.metric}><span>Available history</span><strong>{formatNumber(meta.total_count)}</strong><small>{meta.min_date || "-"} to {meta.max_date || "-"}</small></div>
        <div style={s.typeMetric}><span>Violation types</span><div style={s.typeChips}>{topTypes.map(([name, count]) => <span key={name}>{name} <b>{formatNumber(count)}</b></span>)}</div></div>
      </div>

      <div style={s.summaryCard}>
        <div style={s.cardHeader}>
          <div>
            <strong>{summaryView === "matrix" ? `${(data.matrix?.grouping || matrixGrouping).replace(/^./, (letter) => letter.toUpperCase())} constituent matrix` : `${summaryGrouping[0].toUpperCase() + summaryGrouping.slice(1)} summary`}</strong>
            <span style={s.muted}> {summaryView === "matrix" ? `${data.segregated_matrices?.length || 0} segregated table(s)` : `${data.summary?.length || 0} period(s)`}</span>
          </div>
          <div style={s.headerActions}>
            <div style={s.viewToggle}>
              <button type="button" title="Summary cards" onClick={() => setSummaryView("cards")} style={{ ...s.viewButton, ...(summaryView === "cards" ? s.viewButtonActive : {}) }}><LayoutGrid size={14} /> Cards</button>
              <button type="button" title="Constituent matrix" onClick={() => setSummaryView("matrix")} style={{ ...s.viewButton, ...(summaryView === "matrix" ? s.viewButtonActive : {}) }}><Table2 size={14} /> Matrix</button>
            </div>
            {summaryView === "matrix" && (
              <div style={s.viewToggle}>
                <button type="button" onClick={() => changeMatrixGrouping("daily")} style={{ ...s.viewButton, ...(matrixGrouping === "daily" ? s.viewButtonActive : {}) }}>Daily</button>
                <button type="button" onClick={() => changeMatrixGrouping("monthly")} style={{ ...s.viewButton, ...(matrixGrouping === "monthly" ? s.viewButtonActive : {}) }}>Monthly</button>
              </div>
            )}
            <button type="button" style={s.outlineButton} onClick={downloadExcel} disabled={downloading || loading || !applied}>
              <Download size={15} /> {downloading === "excel" ? "Preparing" : "Excel"}
            </button>
            <button type="button" style={s.outlineButton} onClick={downloadPdf} disabled={downloading || loading || !applied}>
              <Download size={15} /> {downloading === "pdf" ? "Preparing" : "PDF"}
            </button>
          </div>
        </div>
        {summaryView === "cards" ? (
          <div style={s.summaryScroll}>
            {(data.summary || []).map((item) => (
              <div key={item.key} style={s.summaryItem}>
                <strong>{item.label}</strong>
                <span>{formatNumber(item.count)} messages</span>
                <small>{item.constituent_count} constituent(s)</small>
                <small>{Object.entries(item.types || {}).map(([name, count]) => `${name}: ${count}`).join(" · ")}</small>
              </div>
            ))}
            {!loading && !data.summary?.length && <div style={s.empty}>No summary is available for this selection.</div>}
          </div>
        ) : (
          <div style={s.segregatedMatrices}>
            {(data.segregated_matrices || []).map((section) => (
              <section key={section.key} style={s.matrixSection}>
                <div style={s.matrixSectionTitle}><strong>{section.label}</strong><span>{formatNumber(section.matrix?.grand_total)} messages</span></div>
                <MatrixTable matrix={section.matrix} />
              </section>
            ))}
            {!loading && !data.segregated_matrices?.length && <div style={s.empty}>No matrix data is available for this selection.</div>}
          </div>
        )}
      </div>

      <div style={s.tableCard}>
        <div style={s.cardHeader}>
          <div><strong>Violation messages</strong><span style={s.muted}> Page {page} of {totalPages}</span></div>
          <span style={s.muted}>Showing {data.rows?.length || 0} of {formatNumber(data.total_count)}</span>
        </div>
        <div style={s.tableWrap}>
          <table className="theme-table" style={s.table}>
            <thead><tr><th>Date & time</th><th>Constituent</th><th>Violation</th><th>Message</th><th>Frequency</th><th>Schedule</th><th>Actual</th><th>Deviation</th></tr></thead>
            <tbody>
              {(data.rows || []).map((row) => (
                <tr key={row.id}>
                  <td><strong>{row.date || row.display_date}</strong><small style={s.cellSub}>{row.time || "-"}</small></td>
                  <td><strong>{row.constituent || "-"}</strong></td>
                  <td><strong>{row.violation_type || "-"}</strong><small style={s.cellSub}>{row.sub_violation_type || "No subtype"}</small></td>
                  <td style={s.messageCell}>{row.message || "-"}</td>
                  <td>{formatMetric(row.frequency)}</td><td>{formatMetric(row.schedule_mw)}</td><td>{formatMetric(row.actual_mw)}</td><td>{formatMetric(row.deviation_mw)}</td>
                </tr>
              ))}
              {!loading && !data.rows?.length && <tr><td colSpan={8} style={s.empty}>No violation messages match the selected filters.</td></tr>}
            </tbody>
          </table>
        </div>
        <div style={s.pagination}>
          <button type="button" style={s.outlineButton} disabled={loading || page <= 1} onClick={() => changePage(page - 1)}><ChevronLeft size={15} /> Previous</button>
          <span style={s.muted}>{formatNumber(((page - 1) * PAGE_SIZE) + (data.rows?.length ? 1 : 0))}–{formatNumber(Math.min(page * PAGE_SIZE, data.total_count || 0))} of {formatNumber(data.total_count)}</span>
          <button type="button" style={s.outlineButton} disabled={loading || page >= totalPages} onClick={() => changePage(page + 1)}>Next <ChevronRight size={15} /></button>
        </div>
      </div>
    </div>
  );
}

const s = {
  page: { display: "grid", gap: 14 },
  intro: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "16px 18px", border: "1px solid #CFE0F5", borderRadius: 14, background: "linear-gradient(120deg, #F5FAFF, #FFFFFF)" },
  eyebrow: { color: "#0B55B8", fontSize: ".68rem", fontWeight: 950, textTransform: "uppercase" },
  title: { margin: "3px 0", color: "#0F172A", fontSize: "1.18rem", fontWeight: 950 },
  subtitle: { margin: 0, color: "#64748B", fontSize: ".76rem", fontWeight: 700 },
  searchPanel: { display: "grid", gap: 10, padding: 12, background: "#FFFFFF", border: "1px solid #CFE0F5", borderRadius: 12 },
  periodModes: { display: "flex", gap: 7 },
  modeButton: { padding: "6px 11px", border: "1px solid #CBD5E1", borderRadius: 999, background: "#FFFFFF", color: "#475569", fontSize: ".72rem", fontWeight: 900, cursor: "pointer" },
  modeButtonActive: { background: "#E8F5F1", borderColor: "#03624C", color: "#024C3B" },
  filters: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  input: { height: 35, border: "1px solid #CBD5E1", borderRadius: 8, padding: "0 10px", color: "#0F172A", fontWeight: 800 },
  select: { height: 35, minWidth: 165, border: "1px solid #CBD5E1", borderRadius: 8, padding: "0 9px", background: "#FFFFFF", color: "#0F172A", fontSize: ".74rem", fontWeight: 800 },
  multiSelect: { position: "relative", minWidth: 160 },
  multiSummary: { height: 35, boxSizing: "border-box", display: "flex", alignItems: "center", padding: "0 10px", border: "1px solid #CBD5E1", borderRadius: 8, background: "#FFFFFF", color: "#0F172A", fontSize: ".72rem", fontWeight: 850, cursor: "pointer", whiteSpace: "nowrap" },
  multiMenu: { position: "absolute", zIndex: 20, top: 39, left: 0, width: 260, maxHeight: 300, overflowY: "auto", padding: 8, border: "1px solid #BFD3F8", borderRadius: 9, background: "#FFFFFF", boxShadow: "0 12px 30px rgba(15, 23, 42, .16)" },
  multiMenuHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "3px 5px 7px", color: "#0F172A", fontSize: ".72rem" },
  checkOption: { display: "flex", alignItems: "center", gap: 8, padding: "7px 5px", borderTop: "1px solid #EEF2F7", color: "#334155", fontSize: ".7rem", fontWeight: 750, cursor: "pointer" },
  calendarWrap: { width: 245 }, calendar: { minHeight: 35, borderRadius: 8, fontSize: ".74rem" },
  searchInputWrap: { height: 35, minWidth: 260, flex: 1, display: "flex", alignItems: "center", gap: 7, border: "1px solid #CBD5E1", borderRadius: 8, padding: "0 10px" },
  searchInput: { width: "100%", border: 0, outline: 0, color: "#0F172A", fontSize: ".76rem", fontWeight: 700 },
  searchButton: { height: 35, display: "inline-flex", alignItems: "center", gap: 6, border: 0, borderRadius: 8, padding: "0 14px", background: "#0F6FDB", color: "#FFFFFF", fontWeight: 900, cursor: "pointer" },
  outlineButton: { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, border: "1px solid #BFD3F8", borderRadius: 8, padding: "7px 11px", background: "#FFFFFF", color: "#0B55B8", fontSize: ".73rem", fontWeight: 900, cursor: "pointer" },
  error: { padding: 11, border: "1px solid #FECACA", borderRadius: 9, background: "#FEF2F2", color: "#B91C1C", fontSize: ".76rem", fontWeight: 800 },
  metrics: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 9 },
  metric: { display: "grid", gap: 3, padding: "12px 14px", border: "1px solid #D8E4F3", borderRadius: 11, background: "#FFFFFF" },
  typeMetric: { display: "grid", gap: 6, padding: "12px 14px", border: "1px solid #D8E4F3", borderRadius: 11, background: "#FFFFFF" },
  typeChips: { display: "flex", gap: 5, flexWrap: "wrap" },
  summaryCard: { border: "1px solid #D8E4F3", borderRadius: 12, background: "#FFFFFF", overflow: "hidden" },
  cardHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "11px 13px", borderBottom: "1px solid #E2E8F0", background: "#F8FBFF", color: "#0F172A", fontSize: ".8rem" },
  headerActions: { display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 7, flexWrap: "wrap" },
  viewToggle: { display: "inline-flex", padding: 2, border: "1px solid #CBD5E1", borderRadius: 8, background: "#FFFFFF" },
  viewButton: { display: "inline-flex", alignItems: "center", gap: 5, border: 0, borderRadius: 6, padding: "5px 8px", background: "transparent", color: "#64748B", fontSize: ".69rem", fontWeight: 900, cursor: "pointer" },
  viewButtonActive: { background: "#0B55B8", color: "#FFFFFF" },
  muted: { color: "#64748B", fontSize: ".72rem", fontWeight: 750 },
  summaryScroll: { display: "flex", gap: 8, padding: 10, overflowX: "auto" },
  summaryItem: { flex: "0 0 220px", display: "grid", gap: 4, padding: 10, border: "1px solid #D8E4F3", borderRadius: 9, background: "#FAFCFF", color: "#334155", fontSize: ".7rem" },
  segregatedMatrices: { display: "grid", gap: 12, padding: 10, background: "#F8FAFC" },
  matrixSection: { border: "1px solid #CFE0F5", borderRadius: 9, overflow: "hidden", background: "#FFFFFF" },
  matrixSectionTitle: { display: "flex", justifyContent: "space-between", gap: 10, padding: "9px 11px", borderBottom: "1px solid #CFE0F5", background: "#EEF5FF", color: "#0B55B8", fontSize: ".73rem" },
  matrixWrap: { maxHeight: 520, overflow: "auto" },
  matrixTable: { width: "max-content", minWidth: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: ".69rem", textAlign: "center" },
  matrixHeader: { position: "sticky", top: 0, zIndex: 3, minWidth: 72, padding: "9px 8px", borderBottom: "1px solid #BFD3F8", background: "#EAF1FF", color: "#0B55B8", fontWeight: 950, whiteSpace: "nowrap" },
  matrixPeriod: { position: "sticky", left: 0, zIndex: 2, minWidth: 150, padding: "8px 10px", borderRight: "1px solid #CBD5E1", background: "#F8FBFF", color: "#0F172A", textAlign: "left", whiteSpace: "nowrap" },
  matrixTotal: { position: "sticky", right: 0, zIndex: 2, minWidth: 62, padding: "8px", background: "#E8F5F1", color: "#024C3B", fontWeight: 950 },
  matrixValue: { minWidth: 72, padding: "8px", borderBottom: "1px solid #E2E8F0", background: "#EAF3FF", color: "#0B55B8", fontWeight: 950 },
  matrixZero: { minWidth: 72, padding: "8px", borderBottom: "1px solid #E2E8F0", color: "#94A3B8" },
  matrixTotalsRow: { position: "sticky", bottom: 0, zIndex: 3, background: "#E8F5F1", color: "#024C3B", fontWeight: 950 },
  tableCard: { border: "1px solid #D8E4F3", borderRadius: 12, background: "#FFFFFF", overflow: "hidden" },
  tableWrap: { overflow: "auto" },
  table: { width: "100%", minWidth: 1120, borderCollapse: "collapse", fontSize: ".71rem" },
  messageCell: { minWidth: 330, whiteSpace: "normal", lineHeight: 1.4 },
  cellSub: { display: "block", marginTop: 3, color: "#64748B", fontSize: ".66rem" },
  empty: { padding: 24, textAlign: "center", color: "#64748B", fontSize: ".75rem", fontWeight: 800 },
  pagination: { display: "flex", justifyContent: "center", alignItems: "center", gap: 10, padding: 11, borderTop: "1px solid #E2E8F0" },
};
