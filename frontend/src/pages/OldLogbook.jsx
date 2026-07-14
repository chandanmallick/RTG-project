import { Fragment, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Database, Download, RefreshCw, Search } from "lucide-react";

import AppShell from "../components/layout/AppShell";
import CalendarInput from "../components/ui/CalendarInput";
import API from "../services/api";

const OUTAGE_TYPES = [
  { id: "shutdown", label: "Shutdown" },
  { id: "tripping", label: "Tripping" },
  { id: "outage", label: "Outage" },
];
const PAGE_SIZE = 250;
const ELEMENT_TYPE_OPTIONS = [
  { key: "AC_TRANSMISSION_LINE_CIRCUIT", label: "Transmission Line", code: "14" },
  { key: "TRANSFORMER", label: "Transformer", code: "9" },
  { key: "BUS_REACTOR", label: "Bus Reactor", code: "4" },
  { key: "LINE_REACTOR", label: "Line Reactor", code: "5" },
  { key: "BUS", label: "Bus", code: "16" },
  { key: "BAY", label: "Bay", code: "25" },
  { key: "GENERATING_UNIT", label: "Generating Unit", code: "8" },
  { key: "AUTO_RECLOSER", label: "Auto Recloser", code: "26" },
  { key: "HVDC_POLE", label: "HVDC Pole", code: "15" },
  { key: "STATCOM", label: "STATCOM", code: "" },
];

const emptySections = {
  shutdown: { rows: [], attributes: [], elements: [], total_count: 0, returned_count: 0 },
  tripping: { rows: [], attributes: [], elements: [], total_count: 0, returned_count: 0 },
  outage: { rows: [], attributes: [], elements: [], total_count: 0, returned_count: 0 },
};

const todayIso = () => new Date().toISOString().slice(0, 10);
const addDays = (dateStr, days) => {
  const dt = new Date(`${dateStr}T00:00:00`);
  dt.setDate(dt.getDate() + days);
  return dt.toISOString().slice(0, 10);
};

const formatCell = (value) => {
  if (value === null || value === undefined || value === "") return "-";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "-";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

const valueFromKeys = (row, keys) => {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== null && value !== undefined && value !== "") return value;
  }
  return "";
};

const auditTrailColumns = [
  { label: "Modified By", keys: ["ModifiedBy", "Modified By", "modifiedBy", "modified_by", "UserName", "User", "CreatedBy"] },
  { label: "Modified At", keys: ["ModifiedAt", "Modified At", "modifiedAt", "modified_at", "UpdatedAt", "CreatedAt", "DateTime"] },
  { label: "Shift", keys: ["Shift", "shift"] },
  { label: "Action", keys: ["Action", "action", "Activity", "Remarks", "Remark", "Description"] },
];

function AuditHistoryTable({ value }) {
  const rows = Array.isArray(value) ? value : (value ? [value] : []);
  if (!rows.length) return <span>-</span>;
  const objectRows = rows.filter((row) => row && typeof row === "object" && !Array.isArray(row));
  if (!objectRows.length) return <span>{rows.map(formatCell).join(" | ")}</span>;
  const hasKnownAuditShape = objectRows.some((row) =>
    auditTrailColumns.some((column) => valueFromKeys(row, column.keys)),
  );
  const columns = hasKnownAuditShape
    ? auditTrailColumns
    : Array.from(new Set(objectRows.flatMap((row) => Object.keys(row)))).slice(0, 8).map((key) => ({ label: key, keys: [key] }));
  return (
    <div style={styles.auditTableWrap}>
      <table style={styles.auditTable}>
        <thead>
          <tr>
            {columns.map((column) => <th key={column.label} style={styles.auditTh}>{column.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {objectRows.map((row, idx) => (
            <tr key={idx}>
              {columns.map((column) => <td key={column.label} style={styles.auditTd}>{formatCell(valueFromKeys(row, column.keys))}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MetricCard({ label, value, subtext }) {
  return (
    <div style={styles.metricCard}>
      <div style={styles.metricLabel}>{label}</div>
      <div style={styles.metricValue}>{value}</div>
      {subtext && <div style={styles.metricSubtext}>{subtext}</div>}
    </div>
  );
}

function AttributePanel({ rows = [] }) {
  return (
    <div style={styles.attributePanel}>
      <div style={styles.panelTitle}>Attribute Analysis</div>
      <div style={styles.attributeGrid}>
        {rows.map((field) => (
          <div key={field.name} style={styles.attributeCard}>
            <div style={styles.attributeName}>{field.name}</div>
            <div style={styles.attributeMeta}>
              Filled {field.filled_count} | Present {field.present_count} | Missing {field.missing_count}
            </div>
            <div style={styles.typeLine}>{(field.types || []).join(", ") || "-"}</div>
            {(field.samples || []).length > 0 && (
              <div style={styles.sampleText}>{field.samples.join(" | ")}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function RawDetails({ raw = {} }) {
  const entries = Object.entries(raw || {}).sort(([a], [b]) => a.localeCompare(b));
  return (
    <div style={styles.rawBox}>
      {entries.map(([key, value]) => (
        <div key={key} style={styles.rawItem}>
          <div style={styles.rawKey}>{key}</div>
          <div style={styles.rawValue}>
            {key === "AuditHistory" ? <AuditHistoryTable value={value} /> : formatCell(value)}
          </div>
        </div>
      ))}
    </div>
  );
}

function auditSummary(value) {
  const rows = Array.isArray(value) ? value : (value ? [value] : []);
  if (!rows.length) return "-";
  const objectCount = rows.filter((row) => row && typeof row === "object" && !Array.isArray(row)).length;
  if (objectCount) return `${objectCount} audit entr${objectCount === 1 ? "y" : "ies"}`;
  return rows.map(formatCell).join(" | ");
}

export default function OldLogbook() {
  const [activeSubtab] = useState("historical");
  const [activeKind, setActiveKind] = useState("shutdown");
  const [sections, setSections] = useState(emptySections);
  const [startDate, setStartDate] = useState(addDays(todayIso(), -30));
  const [endDate, setEndDate] = useState(todayIso());
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [elementType, setElementType] = useState("");
  const [appliedElementType, setAppliedElementType] = useState("");
  const [selectedElement, setSelectedElement] = useState("");
  const [expandedId, setExpandedId] = useState("");
  const [showAttributes, setShowAttributes] = useState(false);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");
  const [pages, setPages] = useState({ shutdown: 1, tripping: 1, outage: 1 });

  const loadData = async (nextSearch = appliedSearch, options = {}) => {
    const { kind = "all", page = kind === "all" ? 1 : pages[kind] || 1 } = options;
    const nextElementType = options.elementType ?? appliedElementType;
    setLoading(true);
    setError("");
    try {
      const skip = (Math.max(1, page) - 1) * PAGE_SIZE;
      const response = await API.getOldLogbookHistoricalOutages({
        kind,
        startDate,
        endDate,
        search: nextSearch,
        elementType: nextElementType,
        limit: PAGE_SIZE,
        skip,
      });
      if (!response?.success) throw new Error(response?.error || "Unable to load old logbook data.");
      setSections((current) => {
        if (kind === "all") return { ...emptySections, ...(response.sections || {}) };
        return { ...current, [kind]: response.sections?.[kind] || emptySections[kind] };
      });
      setPages((current) => {
        if (kind === "all") return { shutdown: page, tripping: page, outage: page };
        return { ...current, [kind]: page };
      });
      setSelectedElement("");
      setExpandedId("");
    } catch (err) {
      setError(err?.message || "Unable to load old logbook data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData("");
  }, []);

  const activeSection = sections[activeKind] || emptySections[activeKind];
  const activePage = pages[activeKind] || 1;
  const totalPages = Math.max(1, Math.ceil((activeSection.total_count || 0) / PAGE_SIZE));
  const visibleRows = useMemo(() => {
    const rows = activeSection.rows || [];
    if (!selectedElement) return rows;
    return rows.filter((row) => row.element_name === selectedElement);
  }, [activeSection.rows, selectedElement]);

  const totals = OUTAGE_TYPES.map((item) => ({
    ...item,
    count: sections[item.id]?.total_count || 0,
    returned: sections[item.id]?.returned_count || 0,
    page: pages[item.id] || 1,
  }));

  const submitSearch = (event) => {
    event.preventDefault();
    if (!startDate || !endDate) {
      setError("Select both start date and end date.");
      return;
    }
    setAppliedSearch(search.trim());
    setAppliedElementType(elementType);
    loadData(search.trim(), { kind: "all", page: 1, elementType });
  };

  const downloadExcel = async () => {
    if (!startDate || !endDate) {
      setError("Select both start date and end date.");
      return;
    }
    setDownloading(true);
    setError("");
    try {
      const blob = await API.downloadOldLogbookExcel({
        kind: activeKind,
        startDate,
        endDate,
        search: appliedSearch,
        elementType: appliedElementType,
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `old_logbook_${activeKind}_${startDate}_to_${endDate}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setError(err?.message || "Unable to download Excel.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <AppShell>
      <div style={styles.page}>
        <div style={styles.header}>
          <div>
            <div style={styles.eyebrow}>Old_logbook Mongo Database</div>
            <h1 style={styles.title}>Old Logbook</h1>
            <p style={styles.subtitle}>Historical outage data from Shutdown, Tripping and Outage collections.</p>
          </div>
          <button type="button" style={styles.refreshButton} onClick={() => loadData(appliedSearch)} disabled={loading}>
            <RefreshCw size={16} />
            {loading ? "Loading" : "Refresh"}
          </button>
        </div>

        <div style={styles.subtabs}>
          <button type="button" style={{ ...styles.subtab, ...(activeSubtab === "historical" ? styles.subtabActive : {}) }}>
            Historical Outage Data
          </button>
        </div>

        <div style={styles.metrics}>
          {totals.map((item) => (
            <MetricCard key={item.id} label={item.label} value={item.count.toLocaleString("en-IN")} subtext={`${item.returned.toLocaleString("en-IN")} rows on page ${item.page}`} />
          ))}
        </div>

        <div style={styles.toolbar}>
          <div style={styles.kindTabs}>
            {OUTAGE_TYPES.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveKind(item.id);
                  setSelectedElement("");
                  setExpandedId("");
                }}
                style={{ ...styles.kindTab, ...(activeKind === item.id ? styles.kindTabActive : {}) }}
              >
                {item.label}
                <span style={styles.kindCount}>{sections[item.id]?.returned_count || 0}</span>
              </button>
            ))}
          </div>

          <form onSubmit={submitSearch} style={styles.searchBox}>
            <input
              type="hidden"
              value={startDate}
              readOnly
            />
            <input
              type="hidden"
              value={endDate}
              readOnly
            />
            <div style={styles.rangePicker}>
              <CalendarInput
                mode="range"
                value={startDate}
                endValue={endDate}
                onRangeChange={(start, end) => {
                  setStartDate(start);
                  setEndDate(end);
                }}
                placeholder="Select date range"
                style={styles.rangeCalendar}
              />
            </div>
            <Search size={16} />
            <select
              value={elementType}
              onChange={(event) => setElementType(event.target.value)}
              style={styles.typeSelect}
              title="Element type"
            >
              <option value="">All Element Types</option>
              {ELEMENT_TYPE_OPTIONS.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}{item.code ? ` (${item.code})` : ""}
                </option>
              ))}
            </select>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search element, reason, relay, audit..."
              style={styles.searchInput}
            />
            <button type="submit" style={styles.searchButton}>Search</button>
          </form>
        </div>

        {error && <div style={styles.errorBox}>{error}</div>}

        <div style={styles.elementScroller}>
          <button
            type="button"
            onClick={() => setSelectedElement("")}
            style={{ ...styles.elementChip, ...(!selectedElement ? styles.elementChipActive : {}) }}
          >
            All Elements
          </button>
          {(activeSection.elements || []).map((element) => (
            <button
              key={element}
              type="button"
              onClick={() => setSelectedElement(element)}
              style={{ ...styles.elementChip, ...(selectedElement === element ? styles.elementChipActive : {}) }}
              title={element}
            >
              {element}
            </button>
          ))}
        </div>

        <div style={styles.tableShell}>
          <div style={styles.tableHeader}>
            <div>
              <strong>{OUTAGE_TYPES.find((item) => item.id === activeKind)?.label}</strong>
              <span style={styles.tableHint}>
                {" "}Page {activePage.toLocaleString("en-IN")} of {totalPages.toLocaleString("en-IN")} | {visibleRows.length.toLocaleString("en-IN")} row(s)
              </span>
            </div>
            <div style={styles.tableActions}>
              <button type="button" style={styles.attributeButton} onClick={downloadExcel} disabled={downloading || loading}>
                <Download size={15} />
                {downloading ? "Preparing" : "Excel"}
              </button>
              <button type="button" style={styles.attributeButton} onClick={() => setShowAttributes((value) => !value)}>
                <Database size={15} />
                Attribute Analysis
                {showAttributes ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              </button>
            </div>
          </div>

          {showAttributes && <AttributePanel rows={activeSection.attributes || []} />}

          <div style={styles.tableWrap}>
            <table className="theme-table" style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Element Name</th>
                  <th style={styles.th}>Revival Time</th>
                  <th style={styles.th}>Outage Time</th>
                  <th style={styles.th}>{activeKind === "tripping" ? "Relay" : "Reason"}</th>
                  <th style={styles.th}>Sub Category</th>
                  <th style={styles.th}>Element Type</th>
                  {activeKind === "shutdown" && <th style={styles.th}>Planned Period</th>}
                  <th style={styles.th}>AuditHistory</th>
                  <th style={styles.thSmall}></th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row, index) => {
                  const rowId = row.id || `${activeKind}-${index}`;
                  const expanded = expandedId === rowId;
                  return (
                    <Fragment key={rowId}>
                      <tr style={index % 2 === 0 ? styles.trEven : styles.trOdd}>
                        <td style={styles.tdStrong}>{formatCell(row.element_name)}</td>
                        <td style={styles.td}>{formatCell(row.revival_time)}</td>
                        <td style={styles.td}>{formatCell(row.outage_time)}</td>
                        <td style={styles.tdWide}>{formatCell(row.reason)}</td>
                        <td style={styles.td}>{formatCell(row.sub_category)}</td>
                        <td style={styles.td}>{formatCell(row.element_type)}</td>
                        {activeKind === "shutdown" && <td style={styles.td}>{formatCell(row.planned_period)}</td>}
                        <td style={styles.tdWide}>{auditSummary(row.audit_history)}</td>
                        <td style={styles.tdCenter}>
                          <button type="button" style={styles.expandButton} onClick={() => setExpandedId(expanded ? "" : rowId)}>
                            {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                          </button>
                        </td>
                      </tr>
                      {expanded && (
                        <tr>
                          <td colSpan={activeKind === "shutdown" ? 9 : 8} style={styles.detailCell}>
                            <div style={styles.auditTrailPanel}>
                              <div style={styles.auditTrailTitle}>Audit Trail</div>
                              <AuditHistoryTable value={row.audit_history} />
                            </div>
                            <RawDetails raw={row.raw} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                {!loading && visibleRows.length === 0 && (
                  <tr>
                    <td colSpan={activeKind === "shutdown" ? 9 : 8} style={styles.emptyCell}>
                      No old logbook records found.
                    </td>
                  </tr>
                )}
                {loading && (
                  <tr>
                    <td colSpan={activeKind === "shutdown" ? 9 : 8} style={styles.emptyCell}>
                      Loading Old_logbook records...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {!loading && (activeSection.total_count || 0) > 0 && (
            <div style={styles.paginationRow}>
              <button
                type="button"
                style={styles.pageButton}
                disabled={activePage <= 1}
                onClick={() => loadData(appliedSearch, { kind: activeKind, page: activePage - 1, elementType: appliedElementType })}
              >
                <ChevronLeft size={15} />
                Previous
              </button>
              <span style={styles.tableHint}>
                Showing {(((activePage - 1) * PAGE_SIZE) + 1).toLocaleString("en-IN")}-
                {Math.min(activePage * PAGE_SIZE, activeSection.total_count || 0).toLocaleString("en-IN")} of {(activeSection.total_count || 0).toLocaleString("en-IN")}
              </span>
              <button
                type="button"
                style={styles.pageButton}
                disabled={activePage >= totalPages}
                onClick={() => loadData(appliedSearch, { kind: activeKind, page: activePage + 1, elementType: appliedElementType })}
              >
                Next
                <ChevronRight size={15} />
              </button>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

const styles = {
  page: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    padding: "18px 20px",
    border: "1px solid rgba(175, 196, 234, 0.72)",
    borderRadius: 14,
    background: "#FFFFFF",
    boxShadow: "0 8px 22px rgba(15, 111, 219, 0.055)",
  },
  eyebrow: {
    color: "#0B55B8",
    fontSize: "0.72rem",
    fontWeight: 900,
    textTransform: "uppercase",
  },
  title: {
    margin: "2px 0 0",
    fontSize: "1.35rem",
    fontWeight: 950,
    color: "#0F172A",
    letterSpacing: 0,
  },
  subtitle: {
    margin: "4px 0 0",
    color: "#64748B",
    fontSize: "0.8rem",
    fontWeight: 700,
  },
  refreshButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    border: "1px solid #BFD3F8",
    background: "#FFFFFF",
    color: "#0B55B8",
    borderRadius: 8,
    padding: "8px 12px",
    fontSize: "0.78rem",
    fontWeight: 900,
    cursor: "pointer",
  },
  subtabs: {
    display: "flex",
    gap: 8,
  },
  subtab: {
    border: "1px solid #CBD5E1",
    background: "#FFFFFF",
    color: "#475569",
    borderRadius: 8,
    padding: "8px 13px",
    fontWeight: 900,
    fontSize: "0.78rem",
  },
  subtabActive: {
    background: "#03624C",
    color: "#FFFFFF",
    borderColor: "#03624C",
  },
  metrics: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 10,
  },
  metricCard: {
    background: "#FFFFFF",
    border: "1px solid rgba(175, 196, 234, 0.72)",
    borderRadius: 10,
    padding: "12px 14px",
  },
  metricLabel: {
    color: "#64748B",
    fontSize: "0.72rem",
    fontWeight: 850,
  },
  metricValue: {
    color: "#0F172A",
    fontSize: "1.15rem",
    fontWeight: 950,
    marginTop: 2,
  },
  metricSubtext: {
    color: "#0B55B8",
    fontSize: "0.68rem",
    fontWeight: 800,
  },
  toolbar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  kindTabs: {
    display: "flex",
    gap: 8,
    overflowX: "auto",
    paddingBottom: 2,
  },
  kindTab: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    border: "1px solid #CBD5E1",
    background: "#FFFFFF",
    color: "#334155",
    borderRadius: 999,
    padding: "7px 12px",
    fontSize: "0.76rem",
    fontWeight: 900,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  kindTabActive: {
    borderColor: "#03624C",
    background: "#E8F5F1",
    color: "#024C3B",
  },
  kindCount: {
    background: "#FFFFFF",
    border: "1px solid #D7E1EA",
    borderRadius: 999,
    padding: "1px 7px",
    color: "#0B55B8",
  },
  searchBox: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: "#FFFFFF",
    border: "1px solid #CBD5E1",
    borderRadius: 10,
    padding: "6px 8px",
    minWidth: 620,
    flexWrap: "wrap",
  },
  rangePicker: {
    width: 230,
    flex: "0 0 230px",
  },
  rangeCalendar: {
    minHeight: 32,
    padding: "0 10px",
    fontSize: "0.74rem",
    borderRadius: 7,
    background: "#F8FAFC",
  },
  dateInput: {
    border: "1px solid #CBD5E1",
    borderRadius: 7,
    padding: "5px 8px",
    fontSize: "0.74rem",
    fontWeight: 850,
    color: "#0F172A",
    background: "#FFFFFF",
    outline: "none",
  },
  dateDivider: {
    color: "#64748B",
    fontSize: "0.7rem",
    fontWeight: 900,
  },
  typeSelect: {
    height: 32,
    border: "1px solid #CBD5E1",
    borderRadius: 7,
    padding: "0 8px",
    fontSize: "0.74rem",
    fontWeight: 850,
    color: "#0F172A",
    background: "#FFFFFF",
    outline: "none",
    minWidth: 190,
  },
  searchInput: {
    border: "none",
    outline: "none",
    flex: 1,
    fontSize: "0.78rem",
    fontWeight: 700,
    color: "#0F172A",
  },
  searchButton: {
    border: "none",
    background: "#0F6FDB",
    color: "#FFFFFF",
    borderRadius: 7,
    padding: "5px 10px",
    fontWeight: 900,
    fontSize: "0.72rem",
  },
  errorBox: {
    border: "1px solid #FECACA",
    background: "#FEF2F2",
    color: "#B91C1C",
    borderRadius: 10,
    padding: 12,
    fontWeight: 800,
    fontSize: "0.78rem",
  },
  elementScroller: {
    display: "flex",
    gap: 8,
    overflowX: "auto",
    padding: "2px 0 8px",
  },
  elementChip: {
    flex: "0 0 auto",
    maxWidth: 260,
    overflow: "hidden",
    textOverflow: "ellipsis",
    border: "1px solid #CBD5E1",
    background: "#FFFFFF",
    color: "#475569",
    borderRadius: 999,
    padding: "7px 11px",
    fontSize: "0.72rem",
    fontWeight: 850,
    whiteSpace: "nowrap",
    cursor: "pointer",
  },
  elementChipActive: {
    background: "#0F172A",
    color: "#FFFFFF",
    borderColor: "#0F172A",
  },
  tableShell: {
    background: "#FFFFFF",
    border: "1px solid rgba(175, 196, 234, 0.72)",
    borderRadius: 14,
    overflow: "hidden",
    boxShadow: "0 8px 22px rgba(15, 111, 219, 0.055)",
  },
  tableHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    padding: "12px 14px",
    borderBottom: "1px solid #E2E8F0",
    background: "#F8FBFF",
    color: "#0F172A",
    fontSize: "0.84rem",
  },
  tableHint: {
    color: "#64748B",
    fontWeight: 750,
  },
  tableActions: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  attributeButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    border: "1px solid #BFD3F8",
    background: "#FFFFFF",
    color: "#0B55B8",
    borderRadius: 8,
    padding: "6px 9px",
    fontWeight: 900,
    fontSize: "0.72rem",
    cursor: "pointer",
  },
  attributePanel: {
    padding: 12,
    borderBottom: "1px solid #E2E8F0",
    background: "#FFFFFF",
  },
  panelTitle: {
    fontSize: "0.78rem",
    fontWeight: 950,
    color: "#0F172A",
    marginBottom: 8,
  },
  attributeGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 8,
    maxHeight: 300,
    overflow: "auto",
  },
  attributeCard: {
    border: "1px solid #E2E8F0",
    borderRadius: 8,
    padding: 9,
    background: "#F8FAFC",
  },
  attributeName: {
    color: "#0B55B8",
    fontSize: "0.74rem",
    fontWeight: 950,
  },
  attributeMeta: {
    color: "#334155",
    fontSize: "0.68rem",
    fontWeight: 800,
    marginTop: 3,
  },
  typeLine: {
    color: "#64748B",
    fontSize: "0.66rem",
    fontWeight: 750,
    marginTop: 3,
  },
  sampleText: {
    color: "#0F172A",
    fontSize: "0.66rem",
    marginTop: 5,
    lineHeight: 1.35,
  },
  tableWrap: {
    overflow: "auto",
  },
  table: {
    width: "100%",
    minWidth: 1240,
    borderCollapse: "separate",
    borderSpacing: 0,
    tableLayout: "fixed",
  },
  th: {
    background: "#EAF1FF",
    color: "#0B55B8",
    textAlign: "left",
    fontSize: "0.7rem",
    fontWeight: 900,
    padding: "12px 10px",
    borderBottom: "1px solid rgba(175, 196, 234, 0.72)",
  },
  thSmall: {
    background: "#EAF1FF",
    color: "#0B55B8",
    width: 44,
  },
  trEven: {
    background: "#FFFFFF",
    borderBottom: "1px dashed rgba(175, 196, 234, 0.72)",
  },
  trOdd: {
    background: "#F8FBFF",
    borderBottom: "1px dashed rgba(175, 196, 234, 0.72)",
  },
  td: {
    padding: "9px",
    fontSize: "0.72rem",
    color: "#334155",
    fontWeight: 700,
    verticalAlign: "top",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  tdStrong: {
    padding: "9px",
    fontSize: "0.73rem",
    color: "#0F172A",
    fontWeight: 950,
    verticalAlign: "top",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  tdWide: {
    padding: "9px",
    fontSize: "0.72rem",
    color: "#334155",
    fontWeight: 700,
    verticalAlign: "top",
    lineHeight: 1.35,
    maxHeight: 44,
    overflow: "hidden",
  },
  tdCenter: {
    padding: "7px",
    textAlign: "center",
  },
  expandButton: {
    border: "1px solid #CBD5E1",
    background: "#FFFFFF",
    borderRadius: 7,
    width: 28,
    height: 28,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#0B55B8",
    cursor: "pointer",
  },
  detailCell: {
    padding: 10,
    background: "#F8FAFC",
    borderBottom: "1px solid #E2E8F0",
  },
  auditTrailPanel: {
    display: "grid",
    gap: 8,
    marginBottom: 10,
  },
  auditTrailTitle: {
    color: "#0F172A",
    fontSize: "0.76rem",
    fontWeight: 950,
  },
  paginationRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 12,
    borderTop: "1px solid #E2E8F0",
    background: "#FFFFFF",
    flexWrap: "wrap",
  },
  pageButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    border: "1px solid #CBD5E1",
    background: "#FFFFFF",
    color: "#0F172A",
    borderRadius: 8,
    padding: "7px 11px",
    fontSize: "0.74rem",
    fontWeight: 900,
    cursor: "pointer",
  },
  rawBox: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: 8,
  },
  rawItem: {
    border: "1px solid #E2E8F0",
    borderRadius: 8,
    padding: 8,
    background: "#FFFFFF",
  },
  rawKey: {
    color: "#64748B",
    fontSize: "0.66rem",
    fontWeight: 900,
  },
  rawValue: {
    color: "#0F172A",
    fontSize: "0.72rem",
    fontWeight: 750,
    marginTop: 3,
    wordBreak: "break-word",
  },
  auditTableWrap: {
    maxHeight: 260,
    overflow: "auto",
    border: "1px solid #9DB7E6",
    borderRadius: 4,
    background: "#FFFFFF",
  },
  auditTable: {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: 360,
  },
  auditTh: {
    position: "sticky",
    top: 0,
    background: "#0F2A57",
    color: "#FFFFFF",
    fontSize: "0.68rem",
    fontWeight: 950,
    padding: "8px 10px",
    borderBottom: "1px solid #9DB7E6",
    borderRight: "1px solid #9DB7E6",
    textAlign: "left",
  },
  auditTd: {
    color: "#FFFFFF",
    fontSize: "0.68rem",
    fontWeight: 700,
    padding: "7px 10px",
    borderBottom: "1px solid #9DB7E6",
    borderRight: "1px solid #9DB7E6",
    verticalAlign: "top",
    background: "#245FB9",
    maxWidth: 280,
    wordBreak: "break-word",
  },
  emptyCell: {
    padding: 30,
    textAlign: "center",
    color: "#64748B",
    fontWeight: 850,
    fontSize: "0.8rem",
  },
};
