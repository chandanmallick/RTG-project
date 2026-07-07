import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Check, ChevronDown, ChevronUp, Pencil, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";

import AppShell from "../components/layout/AppShell";
import CalendarInput from "../components/ui/CalendarInput";
import API from "../services/api";

const COLORS = ["#03624C", "#2563EB", "#F97316", "#7C3AED", "#16A34A", "#DC2626", "#0891B2", "#64748B"];
const CATEGORY_STORAGE_KEY = "outage_analysis_custom_categories_v1";
const EXCLUDED_OUTAGE_TYPES_STORAGE_KEY = "outage_analysis_excluded_outage_types_v1";
const DEFAULT_EXCLUDED_OUTAGE_TYPES = ["Network Reconfiguration", "Power Assistance", "Bus Section"];
const ELEMENT_TYPES = [
  ["AC_TRANSMISSION_LINE_CIRCUIT", "Transmission Line"],
  ["TRANSFORMER", "Transformer"],
  ["BUS_REACTOR", "Bus Reactor"],
  ["LINE_REACTOR", "Line Reactor"],
  ["BUS", "Bus"],
  ["BAY", "Bay"],
  ["GENERATING_UNIT", "Generating Unit"],
  ["AUTO_RECLOSER", "Auto Recloser"],
  ["HVDC_POLE", "HVDC Pole"],
  ["STATCOM", "STATCOM"],
];

const todayIso = () => new Date().toISOString().slice(0, 10);
const addDays = (dateStr, days) => {
  const dt = new Date(`${dateStr}T00:00:00`);
  dt.setDate(dt.getDate() + days);
  return dt.toISOString().slice(0, 10);
};

const formatNumber = (value) => Number(value || 0).toLocaleString("en-IN");
const formatHours = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return "-";
  if (num < 24) return `${num.toFixed(1)} hr`;
  return `${Math.floor(num / 24)}d ${(num % 24).toFixed(1)}h`;
};

const normalizeKey = (value) => String(value || "")
  .trim()
  .toUpperCase()
  .replace(/[_-]+/g, " ")
  .replace(/\s+/g, " ");

const parseTableTime = (value) => {
  if (!value) return null;
  const parsed = new Date(String(value).replace(" ", "T"));
  return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
};

const emptyResult = {
  summary: {},
  category_summary: [],
  entity_summary: [],
  outage_type_summary: [],
  duration_summary: [],
  requesting_entity_summary: [],
  keyword_summary: [],
  filter_options: {},
  rows: [],
};

function Metric({ label, value, subtext }) {
  return (
    <div style={styles.metric}>
      <div style={styles.metricLabel}>{label}</div>
      <div style={styles.metricValue}>{value}</div>
      {subtext && <div style={styles.metricSubtext}>{subtext}</div>}
    </div>
  );
}

function MultiSelectFilter({ title, options = [], selected = [], onChange, loading = false, tall = false }) {
  const [open, setOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const selectedSet = new Set(selected);
  const normalizedOptions = options.map((item) => {
    if (typeof item === "string") return { value: item, label: item };
    return {
      value: item.value || item.name || item.label,
      label: item.label || item.name || item.value,
    };
  }).filter((item) => item.value && item.label);
  const visibleOptions = normalizedOptions
    .filter((item) => `${item.label} ${item.value}`.toUpperCase().includes(searchText.trim().toUpperCase()));
  const selectedLabels = selected.map((value) => normalizedOptions.find((item) => item.value === value)?.label || value);
  return (
    <div style={styles.filterBlock}>
      <div style={styles.filterTitle}>{title}</div>
      <button type="button" style={styles.multiButton} onClick={() => setOpen((value) => !value)}>
        <span style={styles.chipRow}>
          {!selected.length && <span style={styles.placeholderChip}>All</span>}
          {selectedLabels.slice(0, 2).map((item) => <span key={item} style={styles.valueChip}>{item}</span>)}
          {selected.length > 2 && <span style={styles.moreChip}>+{selected.length - 2}</span>}
        </span>
        <ChevronDown size={16} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
      </button>
      {open && (
        <div style={{ ...styles.dropdownPanel, ...(tall ? styles.dropdownPanelTall : {}) }}>
          <div style={styles.dropdownSearch}>
            <Search size={15} />
            <input
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Search"
              style={styles.dropdownSearchInput}
            />
          </div>
          {loading && <div style={styles.optionNote}>Loading...</div>}
          {!loading && !visibleOptions.length && <div style={styles.optionNote}>No options</div>}
          <div style={styles.optionGrid}>
            {visibleOptions.map(({ value, label }) => {
            const checked = selectedSet.has(value);
            return (
              <button
                type="button"
                key={value}
                style={{ ...styles.optionButton, ...(checked ? styles.optionButtonActive : {}) }}
                onClick={() => {
                  const next = checked
                    ? selected.filter((selectedItem) => selectedItem !== value)
                    : [...selected, value];
                  onChange(next);
                }}
              >
                <span style={styles.optionCheck}>{checked && <Check size={13} />}</span>
                <span>{label}</span>
              </button>
            );
          })}
          </div>
        </div>
      )}
      <div style={styles.filterFooter}>
        <span>{loading ? "Loading..." : `${selected.length} selected`}</span>
        {selected.length > 0 && (
          <button type="button" style={styles.clearButton} onClick={() => onChange([])}>Clear</button>
        )}
      </div>
    </div>
  );
}

function SummaryList({ title, rows = [], valueKey = "count" }) {
  const max = Math.max(1, ...rows.map((row) => Number(row[valueKey] || 0)));
  return (
    <div style={styles.panel}>
      <div style={styles.panelTitle}>{title}</div>
      <div style={styles.rankList}>
        {rows.slice(0, 8).map((row) => (
          <div key={row.name} style={styles.rankItem}>
            <div style={styles.rankTop}>
              <span>{row.name}</span>
              <strong>{formatNumber(row[valueKey])}</strong>
            </div>
            <div style={styles.track}>
              <div style={{ ...styles.fill, width: `${(Number(row[valueKey] || 0) / max) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function OutageAnalysis() {
  const [startDate, setStartDate] = useState(addDays(todayIso(), -30));
  const [endDate, setEndDate] = useState(todayIso());
  const [reasonQuery, setReasonQuery] = useState("");
  const [elementTypes, setElementTypes] = useState(["AC_TRANSMISSION_LINE_CIRCUIT"]);
  const [elementOptions, setElementOptions] = useState([]);
  const [elementNames, setElementNames] = useState([]);
  const [elementLoading, setElementLoading] = useState(false);
  const [outageTypes, setOutageTypes] = useState([]);
  const [requestingEntities, setRequestingEntities] = useState([]);
  const [owners, setOwners] = useState([]);
  const [tableMode, setTableMode] = useState("filtered");
  const [tableSort, setTableSort] = useState({ key: "outage_time", direction: "desc" });
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [excludedOutageTypes, setExcludedOutageTypes] = useState(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(EXCLUDED_OUTAGE_TYPES_STORAGE_KEY) || "null");
      return Array.isArray(parsed) && parsed.length ? parsed : DEFAULT_EXCLUDED_OUTAGE_TYPES;
    } catch {
      return DEFAULT_EXCLUDED_OUTAGE_TYPES;
    }
  });
  const [excludedTypeInput, setExcludedTypeInput] = useState("");
  const [result, setResult] = useState(emptyResult);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [categoryKeywords, setCategoryKeywords] = useState("");
  const [editingCategoryId, setEditingCategoryId] = useState("");
  const [customCategories, setCustomCategories] = useState(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(CATEGORY_STORAGE_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  const fetchAnalysis = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await API.getMisOutageAnalysis({
        start_date: `${startDate} 00:00`,
        end_date: `${endDate} 23:59`,
        element_names: [],
        entity_names: [],
        outage_types: [],
        excluded_outage_types: excludedOutageTypes,
        requesting_entities: [],
        owners: [],
        reason_query: "",
      });
      if (!data?.success) throw new Error(data?.message || "Unable to fetch outage analysis.");
      setResult({ ...emptyResult, ...data });
    } catch (err) {
      setError(err.message || "Unable to fetch outage analysis.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalysis();
  }, []);

  useEffect(() => {
    const fetchElements = async () => {
      if (!elementTypes.length) {
        setElementOptions([]);
        setElementNames([]);
        return;
      }
      setElementLoading(true);
      try {
        const responses = await Promise.all(elementTypes.map((type) => API.getMisElementNames(type)));
        const failed = responses.find((data) => !data?.success);
        if (failed) throw new Error(failed?.message || "Unable to fetch element master.");
        const merged = new Map();
        responses.forEach((data) => {
          (data.elements || []).forEach((item) => {
            const name = item.name || "";
            if (name) merged.set(name.toUpperCase(), item);
          });
        });
        setElementOptions(Array.from(merged.values()).sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""))));
        setElementNames([]);
      } catch (err) {
        setElementOptions([]);
        setElementNames([]);
      } finally {
        setElementLoading(false);
      }
    };
    fetchElements();
  }, [elementTypes]);

  useEffect(() => {
    localStorage.setItem(CATEGORY_STORAGE_KEY, JSON.stringify(customCategories));
  }, [customCategories]);

  useEffect(() => {
    localStorage.setItem(EXCLUDED_OUTAGE_TYPES_STORAGE_KEY, JSON.stringify(excludedOutageTypes));
  }, [excludedOutageTypes]);

  const addExcludedOutageType = () => {
    const value = excludedTypeInput.trim();
    if (!value) return;
    setExcludedOutageTypes((current) => {
      if (current.some((item) => normalizeKey(item) === normalizeKey(value))) return current;
      return [...current, value].sort((a, b) => a.localeCompare(b));
    });
    setExcludedTypeInput("");
  };

  const removeExcludedOutageType = (value) => {
    setExcludedOutageTypes((current) => current.filter((item) => normalizeKey(item) !== normalizeKey(value)));
  };

  const resetExcludedOutageTypes = () => {
    setExcludedOutageTypes(DEFAULT_EXCLUDED_OUTAGE_TYPES);
    setExcludedTypeInput("");
  };

  const addCustomCategory = () => {
    const name = categoryName.trim();
    const keywords = categoryKeywords
      .split(/[,;\n]+/)
      .map((item) => item.trim())
      .filter(Boolean);
    if (!name || !keywords.length) return;
    if (editingCategoryId) {
      setCustomCategories((current) => current.map((item) =>
        item.id === editingCategoryId ? { ...item, name, keywords } : item
      ));
      setEditingCategoryId("");
    } else {
      setCustomCategories((current) => [
        ...current,
        { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name, keywords },
      ]);
    }
    setCategoryName("");
    setCategoryKeywords("");
  };

  const removeCustomCategory = (id) => {
    setCustomCategories((current) => current.filter((item) => item.id !== id));
    if (editingCategoryId === id) {
      setEditingCategoryId("");
      setCategoryName("");
      setCategoryKeywords("");
    }
  };

  const editCustomCategory = (category) => {
    setEditingCategoryId(category.id);
    setCategoryName(category.name);
    setCategoryKeywords(category.keywords.join(", "));
  };

  const cancelCategoryEdit = () => {
    setEditingCategoryId("");
    setCategoryName("");
    setCategoryKeywords("");
  };

  const getCustomCategory = (row) => {
    const text = `${row.reason || ""} ${row.outage_type || ""} ${row.element_name || ""}`.toUpperCase();
    const match = customCategories.find((category) =>
      category.keywords.some((keyword) => text.includes(String(keyword || "").toUpperCase())),
    );
    return match?.name || "Uncategorized";
  };

  const applyPageFilters = (rows) => {
    const elementSet = new Set(elementNames.map((item) => item.toUpperCase()));
    const outageTypeSet = new Set(outageTypes.map((item) => item.toUpperCase()));
    const requestingSet = new Set(requestingEntities.map((item) => item.toUpperCase()));
    const ownerSet = new Set(owners.map((item) => item.toUpperCase()));
    const categorySet = new Set(selectedCategories.map((item) => item.toUpperCase()));
    const query = reasonQuery.trim().toUpperCase();
    return rows.filter((row) => {
      if (elementSet.size && !elementSet.has(String(row.element_name || "").toUpperCase())) return false;
      if (elementTypes.length && !elementTypes.some((type) => normalizeKey(row.entity_name) === normalizeKey(type))) return false;
      if (categorySet.size && !categorySet.has(String(row.custom_category || "").toUpperCase())) return false;
      if (outageTypeSet.size && !outageTypeSet.has(String(row.outage_type || "").toUpperCase())) return false;
      if (requestingSet.size && !requestingSet.has(String(row.requesting_entity || "").toUpperCase())) return false;
      if (ownerSet.size) {
        const ownerParts = String(row.owner || "").split(",").map((item) => item.trim().toUpperCase());
        if (!ownerParts.some((item) => ownerSet.has(item))) return false;
      }
      if (query) {
        const text = `${row.element_name || ""} ${row.entity_name || ""} ${row.outage_type || ""} ${row.reason || ""} ${row.owner || ""} ${row.custom_category || ""}`.toUpperCase();
        if (!text.includes(query)) return false;
      }
      return true;
    });
  };

  const customRows = useMemo(
    () => (result.rows || []).map((row) => ({ ...row, custom_category: getCustomCategory(row) })),
    [result.rows, customCategories],
  );

  const filteredRows = useMemo(
    () => applyPageFilters(customRows),
    [customRows, elementTypes, elementNames, outageTypes, requestingEntities, owners, selectedCategories, reasonQuery],
  );

  const categoryFilterOptions = useMemo(() => {
    const values = new Set();
    customRows.forEach((row) => values.add(row.custom_category || "Uncategorized"));
    customCategories.forEach((category) => values.add(category.name));
    values.add("Uncategorized");
    return Array.from(values).filter(Boolean).sort();
  }, [customRows, customCategories]);

  const displaySummary = useMemo(() => {
    const durations = filteredRows.map((row) => Number(row.duration_hours || 0));
    const totalDuration = durations.reduce((sum, value) => sum + value, 0);
    return {
      events: filteredRows.length,
      open: filteredRows.filter((row) => row.status === "Open").length,
      closed: filteredRows.filter((row) => row.status === "Closed").length,
      avg_duration_hours: durations.length ? totalDuration / durations.length : null,
      max_duration_hours: durations.length ? Math.max(...durations) : null,
      total_duration_hours: totalDuration,
    };
  }, [filteredRows]);

  const customCategorySummary = useMemo(() => {
    const summary = new Map();
    filteredRows.forEach((row) => {
      const item = summary.get(row.custom_category) || { name: row.custom_category, count: 0, open_count: 0, total_duration_hours: 0 };
      item.count += 1;
      item.open_count += row.status === "Open" ? 1 : 0;
      item.total_duration_hours += Number(row.duration_hours || 0);
      summary.set(row.custom_category, item);
    });
    return Array.from(summary.values()).sort((a, b) => b.count - a.count);
  }, [filteredRows]);

  const durationSummary = useMemo(() => {
    const summary = new Map();
    filteredRows.forEach((row) => {
      const name = row.duration_bucket || "Unknown";
      summary.set(name, { name, count: (summary.get(name)?.count || 0) + 1 });
    });
    return Array.from(summary.values());
  }, [filteredRows]);

  const outageTypeSummary = useMemo(() => {
    const summary = new Map();
    filteredRows.forEach((row) => {
      const name = row.outage_type || "Unspecified";
      summary.set(name, { name, count: (summary.get(name)?.count || 0) + 1 });
    });
    return Array.from(summary.values()).sort((a, b) => b.count - a.count);
  }, [filteredRows]);

  const requestingSummary = useMemo(() => {
    const summary = new Map();
    filteredRows.forEach((row) => {
      const name = row.requesting_entity || "Unspecified";
      summary.set(name, { name, count: (summary.get(name)?.count || 0) + 1 });
    });
    return Array.from(summary.values()).sort((a, b) => b.count - a.count);
  }, [filteredRows]);

  const chartRows = useMemo(
    () => customCategorySummary.slice(0, 8).map((row) => ({
      name: row.name,
      count: row.count,
      open: row.open_count,
      avg: row.count ? row.total_duration_hours / row.count : 0,
    })),
    [customCategorySummary],
  );

  const elementCategoryChartRows = useMemo(() => {
    const topCategories = customCategorySummary.slice(0, 5).map((row) => row.name);
    const elementMap = new Map();
    filteredRows.forEach((row) => {
      const element = row.element_name || "Unspecified";
      const item = elementMap.get(element) || { name: element, total: 0 };
      item.total += 1;
      if (topCategories.includes(row.custom_category)) {
        item[row.custom_category] = (item[row.custom_category] || 0) + 1;
      } else {
        item.Other = (item.Other || 0) + 1;
      }
      elementMap.set(element, item);
    });
    return Array.from(elementMap.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)
      .map((item) => ({ ...item, name: item.name.length > 34 ? `${item.name.slice(0, 31)}...` : item.name }));
  }, [filteredRows, customCategorySummary]);

  const elementCategoryKeys = useMemo(() => {
    const keys = customCategorySummary.slice(0, 5).map((row) => row.name);
    if (elementCategoryChartRows.some((row) => row.Other)) keys.push("Other");
    return keys;
  }, [customCategorySummary, elementCategoryChartRows]);

  const detailRows = customRows;
  const tableRows = tableMode === "all" ? customRows : filteredRows;
  const sortedTableRows = useMemo(() => {
    const direction = tableSort.direction === "asc" ? 1 : -1;
    const valueFor = (row) => {
      if (tableSort.key === "duration_hours") return Number(row.duration_hours || 0);
      if (tableSort.key === "outage_time" || tableSort.key === "revived_time") return parseTableTime(row[tableSort.key]);
      return String(row[tableSort.key] || "").toUpperCase();
    };
    return [...tableRows].sort((a, b) => {
      const aValue = valueFor(a);
      const bValue = valueFor(b);
      if (aValue === null && bValue === null) return 0;
      if (aValue === null) return 1;
      if (bValue === null) return -1;
      if (typeof aValue === "number" && typeof bValue === "number") return (aValue - bValue) * direction;
      return String(aValue).localeCompare(String(bValue), "en", { numeric: true, sensitivity: "base" }) * direction;
    });
  }, [tableRows, tableSort]);

  const changeTableSort = (key) => {
    setTableSort((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
  };

  const sortIndicator = (key) => {
    if (tableSort.key !== key) return "";
    return tableSort.direction === "asc" ? " ↑" : " ↓";
  };
  const options = result.filter_options || {};
  const rowElementOptions = useMemo(() => {
    const merged = new Map();
    customRows.forEach((row) => {
      if (!elementTypes.some((type) => normalizeKey(row.entity_name) === normalizeKey(type))) return;
      const name = row.element_name || "";
      if (name) merged.set(name.toUpperCase(), { name });
    });
    return Array.from(merged.values()).sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  }, [customRows, elementTypes]);
  const effectiveElementOptions = useMemo(() => {
    const merged = new Map();
    [...elementOptions, ...rowElementOptions].forEach((item) => {
      const name = item.name || item.label || item.value || "";
      if (name) merged.set(String(name).toUpperCase(), { ...item, name });
    });
    return Array.from(merged.values()).sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  }, [elementOptions, rowElementOptions]);
  const reasonSuggestions = useMemo(() => {
    const values = new Set();
    customCategories.forEach((category) => category.keywords.forEach((keyword) => values.add(keyword)));
    (result.keyword_summary || []).forEach((item) => values.add(item.keyword));
    (result.rows || []).forEach((row) => {
      if (row.reason) values.add(row.reason);
      if (row.element_name) values.add(row.element_name);
    });
    effectiveElementOptions.forEach((item) => values.add(item.name || item.label || item.value));
    return Array.from(values).filter(Boolean);
  }, [customCategories, result.keyword_summary, result.rows, effectiveElementOptions]);

  return (
    <AppShell>
      <div style={styles.page}>
        <div style={styles.header}>
          <div>
            <div style={styles.eyebrow}>CRMS Transmission Outage History</div>
            <h1 style={styles.title}>S/D Reason and Time Analysis</h1>
          </div>
        </div>

        <div style={styles.toolbar}>
          <label style={{ ...styles.inputLabel, minWidth: 280 }}>
            Date range
            <CalendarInput
              mode="range"
              value={startDate}
              endValue={endDate}
              onRangeChange={(start, end) => {
                setStartDate(start);
                setEndDate(end);
              }}
              style={styles.input}
              placeholder="Select date range"
            />
          </label>
          <label style={{ ...styles.inputLabel, flex: 1, minWidth: 260 }}>
            Reason or element search
            <div style={styles.searchBox}>
              <Search size={17} />
              <input
                list="outage-reason-suggestions"
                value={reasonQuery}
                onChange={(event) => setReasonQuery(event.target.value)}
                placeholder="400KV, Darbhanga, fire, SF6, voltage regulation..."
                style={styles.searchInput}
              />
              <datalist id="outage-reason-suggestions">
                {reasonSuggestions.map((item) => <option key={item} value={item} />)}
              </datalist>
            </div>
          </label>
        </div>

        <div style={styles.filters}>
          <MultiSelectFilter
            title="Element type"
            options={ELEMENT_TYPES.map(([value, label]) => ({ value, label }))}
            selected={elementTypes}
            onChange={setElementTypes}
          />
          <MultiSelectFilter
            title="Element names"
            options={effectiveElementOptions}
            selected={elementNames}
            onChange={setElementNames}
            loading={elementLoading}
            tall
          />
          <MultiSelectFilter title="Outage type" options={options.outage_types || []} selected={outageTypes} onChange={setOutageTypes} />
          <MultiSelectFilter title="Requesting entity" options={options.requesting_entities || []} selected={requestingEntities} onChange={setRequestingEntities} />
          <MultiSelectFilter title="Owner" options={options.owners || []} selected={owners} onChange={setOwners} />
        </div>

        <div style={styles.categoryFilterRow}>
          <MultiSelectFilter
            title="Reason category"
            options={categoryFilterOptions}
            selected={selectedCategories}
            onChange={setSelectedCategories}
          />
        </div>

        <div style={styles.exceptionPanel}>
          <div style={styles.exceptionHeader}>
            <div>
              <div style={styles.filterTitle}>Outage type exceptions</div>
              <div style={styles.exceptionHint}>Rows with these outage types are excluded while fetching CRMS outage analysis.</div>
            </div>
            <button type="button" style={styles.clearButton} onClick={resetExcludedOutageTypes}>Reset defaults</button>
          </div>
          <div style={styles.exceptionEditor}>
            <div style={styles.searchBox}>
              <Search size={15} />
              <input
                list="outage-type-exception-options"
                value={excludedTypeInput}
                onChange={(event) => setExcludedTypeInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addExcludedOutageType();
                  }
                }}
                placeholder="Add outage type exception"
                style={styles.searchInput}
              />
              <datalist id="outage-type-exception-options">
                {(options.outage_types || []).map((item) => <option key={item} value={item} />)}
              </datalist>
            </div>
            <button type="button" style={styles.compactSecondaryButton} onClick={addExcludedOutageType}>
              <Plus size={15} />
              Add
            </button>
          </div>
          <div style={styles.exceptionChipRow}>
            {excludedOutageTypes.map((item) => (
              <span key={item} style={styles.exceptionChip}>
                {item}
                <button type="button" style={styles.chipRemoveButton} onClick={() => removeExcludedOutageType(item)} aria-label={`Remove ${item}`}>
                  <X size={12} />
                </button>
              </span>
            ))}
            {!excludedOutageTypes.length && <span style={styles.exceptionHint}>No outage types are excluded.</span>}
          </div>
        </div>

        <div style={styles.filterActions}>
          <button type="button" style={styles.primaryButton} onClick={fetchAnalysis} disabled={loading}>
            <RefreshCw size={18} />
            {loading ? "Analysing" : "Analyse"}
          </button>
          <div style={styles.filterSummary}>
            Date range is fetched from CRMS; element type, elements, outage type, requesting entity, owner, and search filter the analytics locally.
          </div>
        </div>

        {error && <div style={styles.error}>{error}</div>}

        <div style={styles.metrics}>
          <Metric label="Filtered S/D" value={formatNumber(displaySummary.events)} subtext={`${formatNumber(detailRows.length)} fetched rows`} />
          <Metric label="Open S/D" value={formatNumber(displaySummary.open)} subtext={`${formatNumber(displaySummary.closed)} closed`} />
          <Metric label="Average Duration" value={formatHours(displaySummary.avg_duration_hours)} subtext="open rows counted till now" />
          <Metric label="Maximum Duration" value={formatHours(displaySummary.max_duration_hours)} subtext={`${formatHours(displaySummary.total_duration_hours)} total`} />
        </div>

        <div style={styles.grid}>
          <div style={styles.widePanel}>
            <div style={styles.panelTitle}>Custom Category Split</div>
            <div style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartRows} margin={{ top: 12, right: 18, left: 0, bottom: 52 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#dbe3eb" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-28} textAnchor="end" interval={0} height={78} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" name="S/D count" radius={[6, 6, 0, 0]}>
                    {chartRows.map((_, index) => <Cell key={index} fill={COLORS[index % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div style={styles.panel}>
            <div style={styles.panelTitle}>Duration Mix</div>
            <div style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={durationSummary} dataKey="count" nameKey="name" outerRadius={105} innerRadius={54} paddingAngle={2}>
                    {durationSummary.map((_, index) => <Cell key={index} fill={COLORS[index % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div style={styles.extraCharts}>
          <div style={styles.widePanel}>
            <div style={styles.chartHeader}>
              <div>
                <div style={styles.panelTitle}>Element Outage by Reason Category</div>
                <div style={styles.panelSubtext}>Top elements split by your custom keyword categories.</div>
              </div>
            </div>
            <div style={{ height: 330 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={elementCategoryChartRows} layout="vertical" margin={{ top: 12, right: 24, left: 90, bottom: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#dbe3eb" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={150} />
                  <Tooltip />
                  <Legend />
                  {elementCategoryKeys.map((key, index) => (
                    <Bar key={key} dataKey={key} stackId="category" fill={COLORS[index % COLORS.length]} radius={index === elementCategoryKeys.length - 1 ? [0, 6, 6, 0] : 0} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div style={styles.categoryPanel}>
          <button type="button" style={styles.categoryToggle} onClick={() => setCategoriesOpen((value) => !value)}>
            <span>
              <span style={styles.panelTitle}>Custom Keyword Categories</span>
              <span style={styles.categoryCount}>{customCategories.length} category rules</span>
            </span>
            {categoriesOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
          {categoriesOpen && (
            <>
              <div style={styles.categoryEditor}>
                <input
                  value={categoryName}
                  onChange={(event) => setCategoryName(event.target.value)}
                  placeholder="Category"
                  style={{ ...styles.input, minWidth: 150, height: 38 }}
                />
                <input
                  value={categoryKeywords}
                  onChange={(event) => setCategoryKeywords(event.target.value)}
                  placeholder="Keywords: SF6, hotspot, fire"
                  style={{ ...styles.input, flex: 1, height: 38 }}
                />
                <button type="button" style={styles.compactSecondaryButton} onClick={addCustomCategory}>
                  <Plus size={15} />
                  {editingCategoryId ? "Save" : "Add"}
                </button>
                {editingCategoryId && (
                  <button type="button" style={styles.compactNeutralButton} onClick={cancelCategoryEdit}>
                    <X size={15} />
                    Cancel
                  </button>
                )}
              </div>
              <div style={styles.keywordHint}>Separate multiple keywords with comma, semicolon, or new line.</div>
              <div style={styles.categoryList}>
                {customCategories.map((category) => (
                  <div key={category.id} style={styles.categoryRule}>
                    <div style={styles.categoryText}>
                      <strong>{category.name}</strong>
                      <span>{category.keywords.join(", ")}</span>
                    </div>
                    <div style={styles.actionGroup}>
                      <button type="button" style={styles.editButton} onClick={() => editCustomCategory(category)} title="Edit category">
                        <Pencil size={15} />
                      </button>
                      <button type="button" style={styles.iconButton} onClick={() => removeCustomCategory(category.id)} title="Remove category">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                ))}
                {!customCategories.length && (
                  <div style={styles.emptyText}>Add keyword rules to classify S/D reasons into your own categories.</div>
                )}
              </div>
            </>
          )}
          {!categoriesOpen && customCategories.length > 0 && (
            <div style={styles.categoryPreview}>
              {customCategories.slice(0, 6).map((category) => (
                <span key={category.id} style={styles.previewChip}>{category.name}</span>
              ))}
              {customCategories.length > 6 && <span style={styles.previewChip}>+{customCategories.length - 6}</span>}
            </div>
          )}
        </div>

        <div style={styles.gridThree}>
          <SummaryList title="Top Custom Categories" rows={customCategorySummary} />
          <SummaryList title="Top Outage Types" rows={outageTypeSummary} />
          <SummaryList title="Top Requesting Entities" rows={requestingSummary} />
        </div>

        <div style={styles.tablePanel}>
          <div style={styles.tableHeader}>
            <div>
              <div style={styles.panelTitle}>Outage Detail</div>
              <div style={styles.panelSubtext}>Filtered records with category, outage time, revival status, duration, and reason.</div>
            </div>
            <div style={styles.tableControls}>
              <select value={tableMode} onChange={(event) => setTableMode(event.target.value)} style={styles.tableSelect}>
                <option value="filtered">Show as per above filters</option>
                <option value="all">Show all fetched data</option>
              </select>
              <div style={styles.meta}>
                {formatNumber(tableRows.length)} shown of {formatNumber(detailRows.length)}
                {result.generated_at ? ` | Generated ${result.generated_at}` : ""}
              </div>
            </div>
          </div>
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}><button type="button" style={styles.sortButton} onClick={() => changeTableSort("custom_category")}>Category{sortIndicator("custom_category")}</button></th>
                  <th style={styles.th}><button type="button" style={styles.sortButton} onClick={() => changeTableSort("element_name")}>Element{sortIndicator("element_name")}</button></th>
                  <th style={styles.th}><button type="button" style={styles.sortButton} onClick={() => changeTableSort("entity_name")}>Entity{sortIndicator("entity_name")}</button></th>
                  <th style={styles.th}><button type="button" style={styles.sortButton} onClick={() => changeTableSort("outage_type")}>Outage Type{sortIndicator("outage_type")}</button></th>
                  <th style={styles.th}><button type="button" style={styles.sortButton} onClick={() => changeTableSort("outage_time")}>Outage Time{sortIndicator("outage_time")}</button></th>
                  <th style={styles.th}><button type="button" style={styles.sortButton} onClick={() => changeTableSort("revived_time")}>Revived Time{sortIndicator("revived_time")}</button></th>
                  <th style={styles.th}><button type="button" style={styles.sortButton} onClick={() => changeTableSort("duration_hours")}>Duration{sortIndicator("duration_hours")}</button></th>
                  <th style={styles.th}><button type="button" style={styles.sortButton} onClick={() => changeTableSort("reason")}>Reason{sortIndicator("reason")}</button></th>
                </tr>
              </thead>
              <tbody>
                {sortedTableRows.map((row, index) => (
                  <tr key={`${row.element_name}-${row.outage_time}-${index}`} style={index % 2 ? styles.tableRowAlt : styles.tableRow}>
                    <td style={styles.td}><span style={styles.badge}>{row.custom_category}</span></td>
                    <td style={{ ...styles.td, ...styles.elementCell }}>{row.element_name}</td>
                    <td style={styles.td}>{row.entity_name}</td>
                    <td style={styles.td}>{row.outage_type}</td>
                    <td style={styles.td}>{row.outage_time}</td>
                    <td style={styles.td}>{row.revived_time || <span style={styles.openText}>Open</span>}</td>
                    <td style={{ ...styles.td, ...styles.durationCell }}>{row.duration_label}</td>
                    <td style={{ ...styles.td, ...styles.reasonCell }}>{row.reason}</td>
                  </tr>
                ))}
                {!sortedTableRows.length && (
                  <tr>
                    <td style={styles.emptyTableCell} colSpan={8}>No outage rows match the selected filters.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

const styles = {
  page: { display: "flex", flexDirection: "column", gap: 18, color: "#17202A" },
  header: { display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center" },
  eyebrow: { fontSize: 12, fontWeight: 800, color: "#03624C", textTransform: "uppercase", letterSpacing: "0.08em" },
  title: { margin: "4px 0 0", fontSize: 30, lineHeight: 1.1, fontWeight: 800 },
  primaryButton: { display: "inline-flex", alignItems: "center", gap: 8, border: 0, borderRadius: 8, background: "#03624C", color: "#fff", fontWeight: 800, padding: "12px 18px", cursor: "pointer", minWidth: 118, justifyContent: "center" },
  toolbar: { display: "flex", flexWrap: "wrap", gap: 12, background: "#fff", border: "1px solid #dfe7ef", borderRadius: 8, padding: 14, boxShadow: "0 8px 20px rgba(15,23,42,0.05)" },
  inputLabel: { display: "flex", flexDirection: "column", gap: 7, fontSize: 12, fontWeight: 800, color: "#52616f" },
  input: { height: 42, borderRadius: 8, border: "1px solid #cbd5e1", padding: "0 12px", fontWeight: 700, minWidth: 160 },
  searchBox: { height: 42, display: "flex", alignItems: "center", gap: 8, borderRadius: 8, border: "1px solid #cbd5e1", padding: "0 12px", background: "#fff" },
  searchInput: { border: 0, outline: 0, flex: 1, fontWeight: 700, minWidth: 0 },
  filters: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 },
  categoryFilterRow: { display: "grid", gridTemplateColumns: "minmax(220px, 320px)", gap: 12 },
  exceptionPanel: { display: "grid", gap: 10, background: "#fff", border: "1px solid #dfe7ef", borderRadius: 8, padding: 12 },
  exceptionHeader: { display: "flex", alignItems: "start", justifyContent: "space-between", gap: 12 },
  exceptionHint: { fontSize: 11, fontWeight: 800, color: "#64748b" },
  exceptionEditor: { display: "grid", gridTemplateColumns: "minmax(240px, 1fr) auto", gap: 8, alignItems: "center" },
  exceptionChipRow: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: 7 },
  exceptionChip: { display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 999, background: "#fff7ed", border: "1px solid #fed7aa", color: "#9a3412", padding: "5px 8px", fontSize: 11, fontWeight: 900 },
  chipRemoveButton: { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 18, height: 18, border: 0, borderRadius: 999, background: "#ffedd5", color: "#9a3412", cursor: "pointer", padding: 0 },
  filterBlock: { position: "relative", background: "#fff", border: "1px solid #dfe7ef", borderRadius: 8, padding: 12 },
  filterTitle: { fontSize: 12, fontWeight: 900, color: "#52616f", marginBottom: 9 },
  select: { width: "100%", height: 40, borderRadius: 8, border: "1px solid #cbd5e1", background: "#fff", padding: "0 10px", fontSize: 13, fontWeight: 800, color: "#1f2937" },
  multiSelect: { width: "100%", height: 92, borderRadius: 8, border: "1px solid #cbd5e1", background: "#fff", padding: "7px 10px", fontSize: 12, fontWeight: 800, color: "#1f2937" },
  multiButton: { width: "100%", minHeight: 42, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, borderRadius: 10, border: "1px solid #cbd5e1", background: "#f8fafc", padding: "6px 10px", fontSize: 13, fontWeight: 800, color: "#1f2937", cursor: "pointer" },
  chipRow: { display: "flex", alignItems: "center", gap: 6, minWidth: 0, overflow: "hidden" },
  placeholderChip: { color: "#94a3b8", fontWeight: 800 },
  valueChip: { maxWidth: 132, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", borderRadius: 8, background: "#03624C", color: "#fff", padding: "4px 8px", fontSize: 11, fontWeight: 900 },
  moreChip: { borderRadius: 999, background: "#d9469f", color: "#fff", padding: "4px 8px", fontSize: 11, fontWeight: 900 },
  dropdownPanel: { position: "absolute", zIndex: 30, top: 79, left: 12, right: 12, maxHeight: 280, overflow: "auto", display: "grid", gap: 8, background: "#fff", border: "1px solid #dbe5ee", borderRadius: 14, boxShadow: "0 18px 40px rgba(15,23,42,0.16)", padding: 12 },
  dropdownPanelTall: { maxHeight: 380 },
  dropdownSearch: { height: 38, display: "flex", alignItems: "center", gap: 8, borderRadius: 10, border: "1px solid #e2e8f0", background: "#f8fafc", padding: "0 10px", color: "#64748b" },
  dropdownSearchInput: { border: 0, outline: 0, background: "transparent", minWidth: 0, flex: 1, fontSize: 12, fontWeight: 800, color: "#1f2937" },
  optionGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 6 },
  optionButton: { display: "grid", gridTemplateColumns: "18px minmax(0, 1fr)", alignItems: "center", gap: 8, width: "100%", border: "1px solid transparent", borderRadius: 9, background: "transparent", color: "#1f2937", padding: "7px 8px", textAlign: "left", fontSize: 12, fontWeight: 800, cursor: "pointer" },
  optionButtonActive: { background: "#e9f7f2", borderColor: "#b8e4d3", color: "#03624C" },
  optionCheck: { width: 15, height: 15, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 4, border: "1px solid #cbd5e1", color: "#03624C", background: "#fff" },
  optionNote: { padding: "9px 8px", fontSize: 12, fontWeight: 800, color: "#64748b" },
  filterFooter: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 6, fontSize: 11, fontWeight: 800, color: "#64748b" },
  clearButton: { border: 0, background: "transparent", color: "#03624C", fontSize: 11, fontWeight: 900, cursor: "pointer", padding: 0 },
  filterActions: { display: "flex", alignItems: "center", gap: 14, background: "#fff", border: "1px solid #dfe7ef", borderRadius: 8, padding: 12 },
  filterSummary: { fontSize: 12, fontWeight: 800, color: "#64748b" },
  metrics: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 },
  metric: { background: "#fff", border: "1px solid #dfe7ef", borderRadius: 8, padding: 16, minHeight: 108 },
  metricLabel: { fontSize: 12, fontWeight: 900, color: "#5d6b78", textTransform: "uppercase" },
  metricValue: { marginTop: 10, fontSize: 28, fontWeight: 900, color: "#111827" },
  metricSubtext: { marginTop: 6, fontSize: 12, fontWeight: 700, color: "#64748b" },
  grid: { display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) minmax(320px, 0.6fr)", gap: 12 },
  extraCharts: { display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 12 },
  widePanel: { background: "#fff", border: "1px solid #dfe7ef", borderRadius: 8, padding: 16, minWidth: 0 },
  panel: { background: "#fff", border: "1px solid #dfe7ef", borderRadius: 8, padding: 16, minWidth: 0 },
  panelTitle: { fontSize: 15, fontWeight: 900, color: "#17202A" },
  panelSubtext: { marginTop: 4, fontSize: 12, fontWeight: 700, color: "#64748b" },
  chartHeader: { display: "flex", alignItems: "start", justifyContent: "space-between", gap: 12, marginBottom: 8 },
  categoryPanel: { background: "#fff", border: "1px solid #dfe7ef", borderRadius: 8, padding: 10 },
  categoryToggle: { width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, border: 0, background: "transparent", color: "#17202A", padding: "3px 2px", cursor: "pointer", textAlign: "left" },
  categoryCount: { marginLeft: 10, fontSize: 11, fontWeight: 900, color: "#64748b", background: "#f1f5f9", borderRadius: 999, padding: "4px 8px" },
  categoryEditor: { display: "flex", flexWrap: "wrap", gap: 8, alignItems: "end", marginTop: 10 },
  secondaryButton: { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, height: 42, border: "1px solid #03624C", borderRadius: 8, background: "#e9f7f2", color: "#03624C", fontWeight: 900, padding: "0 14px", cursor: "pointer" },
  neutralButton: { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, height: 42, border: "1px solid #cbd5e1", borderRadius: 8, background: "#fff", color: "#475569", fontWeight: 900, padding: "0 14px", cursor: "pointer" },
  compactSecondaryButton: { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, height: 38, border: "1px solid #03624C", borderRadius: 8, background: "#e9f7f2", color: "#03624C", fontWeight: 900, padding: "0 12px", cursor: "pointer" },
  compactNeutralButton: { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, height: 38, border: "1px solid #cbd5e1", borderRadius: 8, background: "#fff", color: "#475569", fontWeight: 900, padding: "0 12px", cursor: "pointer" },
  keywordHint: { marginTop: 8, fontSize: 12, fontWeight: 800, color: "#64748b" },
  categoryList: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 8, marginTop: 10 },
  categoryRule: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, border: "1px solid #dbe5ee", background: "#f8fafc", borderRadius: 8, padding: "8px 10px" },
  categoryText: { display: "grid", gap: 2, minWidth: 0, fontSize: 12 },
  actionGroup: { display: "flex", alignItems: "center", gap: 6, flexShrink: 0 },
  editButton: { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, border: "1px solid #bfdbfe", borderRadius: 8, background: "#eff6ff", color: "#1d4ed8", cursor: "pointer" },
  iconButton: { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, border: "1px solid #fecaca", borderRadius: 8, background: "#fff1f2", color: "#b42318", cursor: "pointer" },
  emptyText: { fontSize: 13, fontWeight: 700, color: "#64748b", background: "#f8fafc", border: "1px dashed #cbd5e1", borderRadius: 8, padding: 12 },
  categoryPreview: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6, marginTop: 8 },
  previewChip: { display: "inline-flex", borderRadius: 999, background: "#e9f7f2", color: "#03624C", padding: "5px 9px", fontSize: 11, fontWeight: 900 },
  gridThree: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(270px, 1fr))", gap: 12 },
  rankList: { display: "grid", gap: 12, marginTop: 14 },
  rankItem: { display: "grid", gap: 6 },
  rankTop: { display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12, fontWeight: 800 },
  track: { height: 8, borderRadius: 8, background: "#e8eef5", overflow: "hidden" },
  fill: { height: "100%", borderRadius: 8, background: "#03624C" },
  tablePanel: { background: "#fff", border: "1px solid #dfe7ef", borderRadius: 8, padding: 16 },
  tableHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 12 },
  tableControls: { display: "flex", alignItems: "center", justifyContent: "flex-end", flexWrap: "wrap", gap: 10 },
  tableSelect: { height: 36, borderRadius: 8, border: "1px solid #cbd5e1", background: "#fff", padding: "0 10px", fontSize: 12, fontWeight: 800, color: "#1f2937" },
  meta: { fontSize: 12, fontWeight: 700, color: "#64748b" },
  tableWrap: { overflow: "auto", maxHeight: 620, border: "1px solid #e2e8f0", borderRadius: 8, background: "#fff" },
  table: { width: "100%", minWidth: 1180, borderCollapse: "separate", borderSpacing: 0, fontSize: 12 },
  th: { position: "sticky", top: 0, zIndex: 2, background: "#f8fafc", color: "#334155", padding: "11px 12px", textAlign: "left", fontSize: 11, fontWeight: 900, textTransform: "uppercase", borderBottom: "1px solid #dbe5ee", whiteSpace: "nowrap" },
  sortButton: { display: "inline-flex", alignItems: "center", gap: 4, border: 0, background: "transparent", color: "#334155", padding: 0, fontSize: 11, fontWeight: 900, textTransform: "uppercase", cursor: "pointer", whiteSpace: "nowrap" },
  td: { padding: "11px 12px", borderBottom: "1px solid #edf2f7", color: "#1f2937", verticalAlign: "top", fontWeight: 700 },
  tableRow: { background: "#fff" },
  tableRowAlt: { background: "#fbfdff" },
  elementCell: { minWidth: 260, fontWeight: 900, color: "#0f172a" },
  durationCell: { whiteSpace: "nowrap", fontWeight: 900, color: "#03624C" },
  reasonCell: { minWidth: 360, lineHeight: 1.45, color: "#475569" },
  emptyTableCell: { padding: 24, textAlign: "center", color: "#64748b", fontWeight: 800 },
  badge: { display: "inline-flex", borderRadius: 8, padding: "5px 8px", background: "#e9f7f2", color: "#03624C", fontWeight: 900, whiteSpace: "nowrap" },
  openText: { color: "#b42318", fontWeight: 900 },
  error: { border: "1px solid #fecaca", background: "#fff1f2", color: "#991b1b", borderRadius: 8, padding: 12, fontWeight: 800 },
};
