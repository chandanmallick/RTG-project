import { useEffect, useMemo, useState } from "react";
import {
  Archive, BrainCircuit, Check, Database, Download, FlaskConical, Plus,
  RefreshCw, Save, Search, Sparkles, Tags, Trash2, UploadCloud,
} from "lucide-react";

import AppShell from "../components/layout/AppShell";
import API from "../services/api";

const BLUE = "#0057B8";
const NAVY = "#081D3A";
const LEVELS = ["type", "category", "subcategory"];

const messageOf = (error) => error?.response?.data?.detail || error?.message || "The operation could not be completed.";
const fileDownload = (blob, name) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
};
const showDate = (value) => value ? new Date(value).toLocaleString("en-IN") : "-";
const showHours = (value) => value === null || value === undefined ? "Open" : `${Number(value).toFixed(1)} h`;

function Stat({ label, value, tone = BLUE }) {
  return (
    <div style={s.stat}>
      <span style={s.muted}>{label}</span>
      <strong style={{ ...s.statValue, color: tone }}>{value ?? 0}</strong>
    </div>
  );
}

function Select({ value, onChange, children, style }) {
  return <select value={value || ""} onChange={(event) => onChange(event.target.value)} style={{ ...s.input, ...style }}>{children}</select>;
}

function TaxonomyManager({ items, onChanged, notify }) {
  const [level, setLevel] = useState("type");
  const [parentId, setParentId] = useState("");
  const [name, setName] = useState("");
  const [selectedTypeId, setSelectedTypeId] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const active = items.filter((item) => item.active !== false);
  const types = active.filter((item) => item.level === "type");
  const categories = active.filter((item) => item.level === "category");
  const visibleCategories = categories.filter((item) => item.parent_id === selectedTypeId);
  const visibleSubcategories = active.filter((item) => item.level === "subcategory" && item.parent_id === selectedCategoryId);
  const allowedParents = level === "category"
    ? types
    : level === "subcategory"
      ? visibleCategories
      : [];

  useEffect(() => {
    if (!types.some((item) => item._id === selectedTypeId)) setSelectedTypeId(types[0]?._id || "");
  }, [items, selectedTypeId]);
  useEffect(() => {
    const valid = visibleCategories.some((item) => item._id === selectedCategoryId);
    setSelectedCategoryId(valid ? selectedCategoryId : (visibleCategories[0]?._id || ""));
  }, [selectedTypeId, items]);
  useEffect(() => {
    if (level === "category") setParentId(selectedTypeId);
    else if (level === "subcategory") setParentId(selectedCategoryId);
    else setParentId("");
  }, [level, selectedTypeId, selectedCategoryId]);

  const add = async () => {
    try {
      await API.createOutageMlTaxonomy({ level, name, parent_id: parentId || null });
      setName("");
      notify("Taxonomy item created.", "ok");
      onChanged();
    } catch (error) {
      notify(messageOf(error), "error");
    }
  };

  const remove = async (item) => {
    if (!window.confirm(`Archive “${item.name}”? Existing training labels will be retained.`)) return;
    try {
      await API.archiveOutageMlTaxonomy(item._id);
      notify("Taxonomy item archived.", "ok");
      onChanged();
    } catch (error) {
      notify(messageOf(error), "error");
    }
  };

  return (
    <section style={s.panel}>
      <div style={s.sectionHead}>
        <div><h2 style={s.h2}>Reason taxonomy</h2><p style={s.sub}>Create isolated Type → Category → Subcategory labels. Old labels remain available in archived datasets.</p></div>
        <Tags size={22} color={BLUE} />
      </div>
      <div style={s.formRow}>
        <label style={s.field}>Level<Select value={level} onChange={setLevel}>{LEVELS.map((item) => <option key={item} value={item}>{item[0].toUpperCase() + item.slice(1)}</option>)}</Select></label>
        {level !== "type" && (
          <label style={{ ...s.field, flex: 1.5 }}>Parent<Select value={parentId} onChange={setParentId}>
            <option value="">Select parent</option>
            {allowedParents.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
          </Select></label>
        )}
        <label style={{ ...s.field, flex: 2 }}>New name<input style={s.input} value={name} onChange={(event) => setName(event.target.value)} placeholder={`New ${level}`} /></label>
        <button style={s.primary} disabled={!name.trim() || (level !== "type" && !parentId)} onClick={add}><Plus size={16} /> Add</button>
      </div>
      <div style={s.taxonomyGrid}>
        <div style={s.taxonomyColumn}>
          <strong style={s.columnTitle}>TYPE</strong>
          {types.map((item) => (
            <div key={item._id} onClick={() => { setSelectedTypeId(item._id); setLevel("category"); }} style={{ ...s.taxonomyItem, ...(selectedTypeId === item._id ? s.taxonomySelected : {}) }}>
              <strong>{item.name}</strong>
              <button style={s.iconButton} title="Archive" onClick={(event) => { event.stopPropagation(); remove(item); }}><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
        <div style={s.taxonomyColumn}>
          <strong style={s.columnTitle}>CATEGORY · {types.find((item) => item._id === selectedTypeId)?.name || "Select a type"}</strong>
          {visibleCategories.map((item) => (
            <div key={item._id} onClick={() => { setSelectedCategoryId(item._id); setLevel("subcategory"); }} style={{ ...s.taxonomyItem, ...(selectedCategoryId === item._id ? s.taxonomySelected : {}) }}>
              <strong>{item.name}</strong>
              <button style={s.iconButton} title="Archive" onClick={(event) => { event.stopPropagation(); remove(item); }}><Trash2 size={14} /></button>
            </div>
          ))}
          {!visibleCategories.length && <div style={s.taxonomyHint}>Select this Type and add its first Category above.</div>}
        </div>
        <div style={s.taxonomyColumn}>
          <strong style={s.columnTitle}>SUBCATEGORY · {categories.find((item) => item._id === selectedCategoryId)?.name || "Select a category"}</strong>
          {visibleSubcategories.map((item) => (
            <div key={item._id} style={s.taxonomyItem}>
              <strong>{item.name}</strong>
              <button style={s.iconButton} title="Archive" onClick={() => remove(item)}><Trash2 size={14} /></button>
            </div>
          ))}
          {!visibleSubcategories.length && <div style={s.taxonomyHint}>Only Subcategories belonging to the selected Category appear here.</div>}
        </div>
      </div>
    </section>
  );
}

function Dataset({ taxonomy, notify, refreshOverview }) {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [review, setReview] = useState("all");
  const [useFilter, setUseFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("");
  const [secondaryFilter, setSecondaryFilter] = useState("all");
  const [sortBy, setSortBy] = useState("outage_at");
  const [sortDir, setSortDir] = useState("desc");
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState([]);
  const [bulk, setBulk] = useState({
    type: "Shutdown", category: "", subcategory: "", secondary_shutdown: false,
    shutdown_category: "", shutdown_subcategory: "", use: true, excluded: false,
  });
  const active = taxonomy.filter((item) => item.active !== false);
  const types = active.filter((item) => item.level === "type");
  const categoriesFor = (typeName) => {
    const type = types.find((item) => item.name === typeName);
    return active.filter((item) => item.level === "category" && item.parent_id === type?._id);
  };
  const subcategoriesFor = (categoryName, typeName) => {
    const allowedCategoryIds = new Set(categoriesFor(typeName).map((item) => item._id));
    const category = active.find((item) => item.level === "category" && item.name === categoryName && allowedCategoryIds.has(item._id));
    return active.filter((item) => item.level === "subcategory" && item.parent_id === category?._id);
  };

  const load = async (targetPage = page) => {
    setLoading(true);
    try {
      const data = await API.getOutageMlRecords({
        page: targetPage, limit: 50, search, review, type: typeFilter,
        use_filter: useFilter, secondary_filter: secondaryFilter,
        sort_by: sortBy, sort_dir: sortDir,
      });
      setRows(data.rows || []);
      setTotal(data.total || 0);
      setSelected([]);
    } catch (error) {
      notify(messageOf(error), "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(page); }, [page, review, useFilter, typeFilter, secondaryFilter, sortBy, sortDir]);

  const changeRow = (id, field, value) => setRows((current) => current.map((row) => {
    if (row._id !== id) return row;
    const next = { ...row, [field]: value };
    if (field === "type") Object.assign(next, {
      category: "", subcategory: "",
      ...(!["Tripping", "Outage"].includes(value)
        ? { secondary_shutdown: false, shutdown_category: "", shutdown_subcategory: "" }
        : {}),
    });
    if (field === "category") next.subcategory = "";
    if (field === "secondary_shutdown" && !value) Object.assign(next, { shutdown_category: "", shutdown_subcategory: "" });
    if (field === "shutdown_category") next.shutdown_subcategory = "";
    return next;
  }));

  const saveRow = async (row) => {
    try {
      await API.updateOutageMlRecord(row._id, {
        type: row.type, category: row.category || "", subcategory: row.subcategory || "",
        secondary_shutdown: Boolean(row.secondary_shutdown),
        shutdown_category: row.shutdown_category || "",
        shutdown_subcategory: row.shutdown_subcategory || "",
        use: Boolean(row.use), excluded: Boolean(row.excluded),
      });
      notify("Training label saved.", "ok");
      changeRow(row._id, "reviewed", true);
      refreshOverview();
    } catch (error) {
      notify(messageOf(error), "error");
    }
  };

  const saveBulk = async () => {
    if (!selected.length) return;
    try {
      const result = await API.updateOutageMlRecords({ ...bulk, ids: selected });
      notify(`${result.updated} records labelled.`, "ok");
      load();
      refreshOverview();
    } catch (error) {
      notify(messageOf(error), "error");
    }
  };

  const bulkCategories = categoriesFor(bulk.type);
  const bulkSubcategories = subcategoriesFor(bulk.category, bulk.type);
  const shutdownCategories = categoriesFor("Shutdown");
  const shutdownSubcategoriesFor = (categoryName) => subcategoriesFor(categoryName, "Shutdown");

  return (
    <section style={s.panel}>
      <div style={s.sectionHead}>
        <div><h2 style={s.h2}>Old Logbook training dataset</h2><p style={s.sub}>Review and correct the labels that the two models will learn from. Open outages remain useful as censored restoration observations.</p></div>
        <Database size={22} color={BLUE} />
      </div>
      <div style={s.toolbar}>
        <div style={s.searchBox}><Search size={16} /><input style={s.searchInput} value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => event.key === "Enter" && load(1)} placeholder="Search reason, element or label" /></div>
        <Select value={review} onChange={(value) => { setPage(1); setReview(value); }} style={{ width: 150 }}>
          <option value="all">All records</option><option value="unreviewed">Unreviewed</option><option value="reviewed">Reviewed</option><option value="excluded">Excluded</option>
        </Select>
        <Select value={typeFilter} onChange={(value) => { setPage(1); setTypeFilter(value); }} style={{ width: 125 }}>
          <option value="">All Types</option>{types.map((item) => <option key={item._id}>{item.name}</option>)}
        </Select>
        <Select value={secondaryFilter} onChange={(value) => { setPage(1); setSecondaryFilter(value); }} style={{ width: 175 }}>
          <option value="all">All cause mappings</option><option value="breakdown">Tripping: Breakdown</option>
          <option value="on_demand">Outage: On-demand</option><option value="none">No Shutdown mapping</option>
        </Select>
        <Select value={useFilter} onChange={(value) => { setPage(1); setUseFilter(value); }} style={{ width: 135 }}>
          <option value="all">Use: All</option><option value="use">Use: Yes</option><option value="not_use">Use: No</option>
        </Select>
        <Select value={sortBy} onChange={(value) => { setPage(1); setSortBy(value); }} style={{ width: 155 }}>
          <option value="outage_at">Sort: Outage date</option><option value="duration_hours">Sort: Duration</option>
          <option value="type">Sort: Type</option><option value="category">Sort: Category</option>
          <option value="subcategory">Sort: Subcategory</option><option value="reviewed">Sort: Reviewed</option><option value="use">Sort: Use</option>
        </Select>
        <button style={s.secondary} title="Reverse sort order" onClick={() => setSortDir((value) => value === "asc" ? "desc" : "asc")}>{sortDir === "asc" ? "↑ Asc" : "↓ Desc"}</button>
        <button style={s.secondary} onClick={() => load(1)}><RefreshCw size={15} /> Refresh</button>
        <span style={s.count}>{total.toLocaleString("en-IN")} records</span>
      </div>
      {selected.length > 0 && (
        <div style={s.bulkBar}>
          <strong>{selected.length} selected</strong>
          <Select value={bulk.type} onChange={(value) => setBulk({
            ...bulk, type: value, category: "", subcategory: "",
            ...(!["Tripping", "Outage"].includes(value)
              ? { secondary_shutdown: false, shutdown_category: "", shutdown_subcategory: "" }
              : {}),
          })}>
            {types.map((item) => <option key={item._id}>{item.name}</option>)}
          </Select>
          <Select value={bulk.category} onChange={(value) => setBulk({ ...bulk, category: value, subcategory: "" })}>
            <option value="">Category</option>{bulkCategories.map((item) => <option key={item._id}>{item.name}</option>)}
          </Select>
          <Select value={bulk.subcategory} onChange={(value) => setBulk({ ...bulk, subcategory: value })}>
            <option value="">Subcategory</option>{bulkSubcategories.map((item) => <option key={item._id}>{item.name}</option>)}
          </Select>
          {["Tripping", "Outage"].includes(bulk.type) && <label style={s.check}><input type="checkbox" checked={bulk.secondary_shutdown} onChange={(event) => setBulk({ ...bulk, secondary_shutdown: event.target.checked, shutdown_category: "", shutdown_subcategory: "" })} /> {bulk.type === "Tripping" ? "Breakdown" : "On-demand Shutdown"}</label>}
          {bulk.secondary_shutdown && <>
            <Select value={bulk.shutdown_category} onChange={(value) => setBulk({ ...bulk, shutdown_category: value, shutdown_subcategory: "" })}>
              <option value="">Shutdown category</option>{shutdownCategories.map((item) => <option key={item._id}>{item.name}</option>)}
            </Select>
            <Select value={bulk.shutdown_subcategory} onChange={(value) => setBulk({ ...bulk, shutdown_subcategory: value })}>
              <option value="">Shutdown subcategory</option>{shutdownSubcategoriesFor(bulk.shutdown_category).map((item) => <option key={item._id}>{item.name}</option>)}
            </Select>
          </>}
          <label style={s.check}><input type="checkbox" checked={bulk.use} onChange={(event) => setBulk({ ...bulk, use: event.target.checked })} /> Use</label>
          <label style={s.check}><input type="checkbox" checked={bulk.excluded} onChange={(event) => setBulk({ ...bulk, excluded: event.target.checked })} /> Exclude</label>
          <button style={s.primary} onClick={saveBulk}><Save size={15} /> Apply labels</button>
        </div>
      )}
      <div style={s.tableWrap}>
        <table className="outage-ml-table" style={s.table}>
          <thead><tr>
            <th><input type="checkbox" checked={rows.length > 0 && selected.length === rows.length} onChange={(event) => setSelected(event.target.checked ? rows.map((row) => row._id) : [])} /></th>
            <th>Source record</th><th>Reason / element</th><th>Duration</th><th>Classification</th><th>Review decision</th><th />
          </tr></thead>
          <tbody>
            {rows.map((row) => {
              const categories = categoriesFor(row.type);
              const subcategories = subcategoriesFor(row.category, row.type);
              const shutdownSubcategories = shutdownSubcategoriesFor(row.shutdown_category);
              return <tr key={row._id} style={row.excluded ? s.excludedRow : undefined}>
                <td><input type="checkbox" checked={selected.includes(row._id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, row._id] : current.filter((id) => id !== row._id))} /></td>
                <td><strong>{row.source_kind}</strong><small style={s.cellSub}>{showDate(row.outage_at)}</small><small style={s.cellSub}>{row.element_type || "Unknown element"}</small></td>
                <td style={{ minWidth: 310 }}><strong>{row.element_name || "-"}</strong><span style={s.reason}>{row.reason || "No reason recorded"}</span>{row.raw_reason_category && <small style={s.rawTag}>Legacy: {row.raw_reason_category}</small>}</td>
                <td><strong>{showHours(row.duration_hours)}</strong><small style={s.cellSub}>{row.restored ? "Restored" : "Right-censored"}</small></td>
                <td style={{ minWidth: 430 }}>
                  <div style={s.classificationRow}>
                    <Select value={row.type} onChange={(value) => changeRow(row._id, "type", value)}>{types.map((item) => <option key={item._id}>{item.name}</option>)}</Select>
                    <Select value={row.category} onChange={(value) => changeRow(row._id, "category", value)}><option value="">Category</option>{categories.map((item) => <option key={item._id}>{item.name}</option>)}</Select>
                    <Select value={row.subcategory} onChange={(value) => changeRow(row._id, "subcategory", value)}><option value="">Subcategory</option>{subcategories.map((item) => <option key={item._id}>{item.name}</option>)}</Select>
                  </div>
                  {["Tripping", "Outage"].includes(row.type) && (
                    <div style={s.secondaryClassification}>
                      <label style={s.check}>
                        <input type="checkbox" checked={Boolean(row.secondary_shutdown)} onChange={(event) => changeRow(row._id, "secondary_shutdown", event.target.checked)} />
                        {row.type === "Tripping" ? "Breakdown — also classify by Shutdown cause" : "On-demand — apply Shutdown classification"}
                      </label>
                      {row.secondary_shutdown && <div style={s.classificationRow}>
                        <Select value={row.shutdown_category} onChange={(value) => changeRow(row._id, "shutdown_category", value)}><option value="">Shutdown category</option>{shutdownCategories.map((item) => <option key={item._id}>{item.name}</option>)}</Select>
                        <Select value={row.shutdown_subcategory} onChange={(value) => changeRow(row._id, "shutdown_subcategory", value)}><option value="">Shutdown subcategory</option>{shutdownSubcategories.map((item) => <option key={item._id}>{item.name}</option>)}</Select>
                      </div>}
                    </div>
                  )}
                </td>
                <td>
                  <label style={s.useFlag}><input type="checkbox" checked={Boolean(row.use)} onChange={(event) => changeRow(row._id, "use", event.target.checked)} /> Use for training</label>
                  <label style={{ ...s.check, marginTop: 7 }}><input type="checkbox" checked={Boolean(row.excluded)} onChange={(event) => changeRow(row._id, "excluded", event.target.checked)} /> Exclude</label>
                  {row.reviewed && <small style={s.reviewed}><Check size={11} /> Reviewed and saved</small>}
                </td>
                <td><button style={s.saveReviewButton} title="Save review and Use flag" onClick={() => saveRow(row)}><Save size={15} /> Save review</button></td>
              </tr>;
            })}
            {!rows.length && <tr><td colSpan="7" style={s.empty}>{loading ? "Loading records…" : "No training records match this filter."}</td></tr>}
          </tbody>
        </table>
      </div>
      <div style={s.pagination}>
        <button style={s.secondary} disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button>
        <span>Page {page} of {Math.max(1, Math.ceil(total / 50))}</span>
        <button style={s.secondary} disabled={page * 50 >= total} onClick={() => setPage((value) => value + 1)}>Next</button>
      </div>
    </section>
  );
}

function Models({ versions, onChanged, notify }) {
  const [name, setName] = useState("");
  const [training, setTraining] = useState(false);
  const train = async () => {
    setTraining(true);
    try {
      await API.trainOutageMlModels({ name, activate: true });
      setName("");
      notify("Both models trained and activated as a new version.", "ok");
      onChanged();
    } catch (error) {
      notify(messageOf(error), "error");
    } finally {
      setTraining(false);
    }
  };
  const action = async (id, type) => {
    try {
      if (type === "activate") await API.activateOutageMlVersion(id);
      else await API.archiveOutageMlVersion(id);
      notify(type === "activate" ? "Model version activated." : "Model version archived.", "ok");
      onChanged();
    } catch (error) { notify(messageOf(error), "error"); }
  };
  const download = async (id) => {
    try { fileDownload(await API.downloadOutageMlVersion(id), `${id}.zip`); }
    catch (error) { notify(messageOf(error), "error"); }
  };
  return (
    <section style={s.panel}>
      <div style={s.sectionHead}><div><h2 style={s.h2}>Train and version both models</h2><p style={s.sub}>Classification learns the reason hierarchy. Restoration learns conditional probabilities and typical remaining duration from the same reviewed history.</p></div><FlaskConical color={BLUE} /></div>
      <div style={s.trainBox}>
        <label style={{ ...s.field, flex: 1 }}>Version name<input style={s.input} value={name} onChange={(event) => setName(event.target.value)} placeholder="Example: ER outage taxonomy v1" /></label>
        <button style={s.primary} disabled={training} onClick={train}><BrainCircuit size={17} /> {training ? "Training…" : "Train both models"}</button>
      </div>
      <div style={s.versionList}>
        {versions.map((version) => (
          <article key={version.version_id} style={s.version}>
            <div><div style={s.versionTitle}>{version.name}<span style={{ ...s.status, ...(version.status === "active" ? s.active : {}) }}>{version.status}</span></div><code style={s.code}>{version.version_id}</code></div>
            <div><small style={s.cellSub}>Training records</small><strong>{version.record_count}</strong></div>
            <div><small style={s.cellSub}>Type accuracy</small><strong>{version.metrics?.type?.training_accuracy == null ? "-" : `${(version.metrics.type.training_accuracy * 100).toFixed(1)}%`}</strong></div>
            <div><small style={s.cellSub}>Category accuracy</small><strong>{version.metrics?.category?.training_accuracy == null ? "-" : `${(version.metrics.category.training_accuracy * 100).toFixed(1)}%`}</strong></div>
            <div style={s.actions}>
              {version.status !== "active" && version.status !== "archived" && <button style={s.secondary} onClick={() => action(version.version_id, "activate")}><Sparkles size={14} /> Activate</button>}
              <button style={s.secondary} onClick={() => download(version.version_id)}><Download size={14} /> Portable ZIP</button>
              {version.status !== "archived" && <button style={s.danger} onClick={() => action(version.version_id, "archive")}><Archive size={14} /> Archive</button>}
            </div>
          </article>
        ))}
        {!versions.length && <div style={s.empty}>No model has been trained yet.</div>}
      </div>
    </section>
  );
}

function Prediction({ notify }) {
  const [input, setInput] = useState({ reason: "", element_name: "", element_type: "", elapsed_hours: 0 });
  const [result, setResult] = useState(null);
  const run = async () => {
    try { setResult(await API.predictOutageMl(input)); }
    catch (error) { notify(messageOf(error), "error"); }
  };
  return (
    <section style={s.panel}>
      <div style={s.sectionHead}><div><h2 style={s.h2}>Prediction preview</h2><p style={s.sub}>Test the active version before connecting predictions to live API outage records.</p></div><Sparkles color={BLUE} /></div>
      <div style={s.predictGrid}>
        <label style={{ ...s.field, gridColumn: "1 / -1" }}>Reason<textarea style={{ ...s.input, minHeight: 90, resize: "vertical" }} value={input.reason} onChange={(event) => setInput({ ...input, reason: event.target.value })} placeholder="Paste shutdown or tripping reason" /></label>
        <label style={s.field}>Element name<input style={s.input} value={input.element_name} onChange={(event) => setInput({ ...input, element_name: event.target.value })} /></label>
        <label style={s.field}>Element type<input style={s.input} value={input.element_type} onChange={(event) => setInput({ ...input, element_type: event.target.value })} /></label>
        <label style={s.field}>Already out (hours)<input type="number" min="0" step="0.5" style={s.input} value={input.elapsed_hours} onChange={(event) => setInput({ ...input, elapsed_hours: Number(event.target.value) })} /></label>
        <button style={s.primary} disabled={!input.reason.trim()} onClick={run}><Sparkles size={16} /> Predict</button>
      </div>
      {result && (
        <div style={s.resultGrid}>
          {["type", "category", "subcategory"].map((level) => <Stat key={level} label={level} value={`${result.classification?.[level]?.label || "-"} (${((result.classification?.[level]?.confidence || 0) * 100).toFixed(1)}%)`} />)}
          <Stat label="Historical sample" value={result.restoration?.available ? `${result.restoration.samples} outages` : "Unavailable"} />
          <Stat label="Median remaining" value={result.restoration?.median_remaining_hours == null ? "Not reached" : `${result.restoration.median_remaining_hours} h`} />
          <div style={{ ...s.stat, gridColumn: "span 2" }}><span style={s.muted}>Restoration probability from now</span><div style={s.probabilities}>{Object.entries(result.restoration?.restoration_probability || {}).map(([hours, probability]) => <span key={hours}><b>{hours}h</b> {(probability * 100).toFixed(1)}%</span>)}</div></div>
        </div>
      )}
    </section>
  );
}

export default function OutageMLTraining() {
  const [tab, setTab] = useState("dataset");
  const [overview, setOverview] = useState({});
  const [taxonomy, setTaxonomy] = useState([]);
  const [versions, setVersions] = useState([]);
  const [notice, setNotice] = useState(null);
  const [importing, setImporting] = useState(false);
  const notify = (text, type = "ok") => {
    setNotice({ text, type });
    window.setTimeout(() => setNotice(null), 4500);
  };
  const loadOverview = async () => {
    try { setOverview(await API.getOutageMlOverview()); } catch (error) { notify(messageOf(error), "error"); }
  };
  const loadTaxonomy = async () => {
    try { setTaxonomy((await API.getOutageMlTaxonomy()).items || []); } catch (error) { notify(messageOf(error), "error"); }
  };
  const loadVersions = async () => {
    try { setVersions((await API.getOutageMlVersions()).versions || []); } catch (error) { notify(messageOf(error), "error"); }
  };
  useEffect(() => { loadOverview(); loadTaxonomy(); loadVersions(); }, []);
  const importLogbook = async () => {
    setImporting(true);
    try {
      const result = await API.importOutageMlOldLogbook();
      notify(`Old Logbook synchronized: ${result.imported} new, ${result.updated} refreshed.`, "ok");
      loadOverview();
      setTab("dataset");
    } catch (error) { notify(messageOf(error), "error"); }
    finally { setImporting(false); }
  };
  const downloadDataset = async (format) => {
    try { fileDownload(await API.downloadOutageMlDataset(format), `outage_ml_training_data.${format}`); }
    catch (error) { notify(messageOf(error), "error"); }
  };
  const tabs = [
    ["dataset", Database, "Dataset review"], ["taxonomy", Tags, "Taxonomy"],
    ["models", BrainCircuit, "Models & versions"], ["predict", Sparkles, "Prediction preview"],
  ];

  return (
    <AppShell>
      <style>{`
        .outage-ml-table th { padding: 10px 8px; text-align: left; color: #0057B8; background: #EAF2FF; border-bottom: 1px solid #B9D4FF; white-space: nowrap; font-size: 10px; text-transform: uppercase; letter-spacing: .03em; }
        .outage-ml-table td { padding: 9px 8px; text-align: left; vertical-align: top; border-bottom: 1px solid #E4EBF4; }
        .outage-ml-table tr:last-child td { border-bottom: 0; }
        button:disabled { opacity: .5; cursor: not-allowed !important; }
        @media (max-width: 1100px) {
          .outage-ml-hero { align-items: flex-start !important; flex-direction: column; }
          .outage-ml-stats { grid-template-columns: repeat(2,minmax(0,1fr)) !important; }
        }
      `}</style>
      <div className="outage-ml-hero" style={s.hero}>
        <div><span style={s.eyebrow}><BrainCircuit size={13} /> ANALYTICS · S/D ANALYSIS</span><h1 style={s.h1}>ML Training Centre</h1><p style={s.heroText}>Train reason classification and restoration-probability models from verified Old Logbook history.</p></div>
        <div style={s.heroActions}>
          <button style={s.heroButton} disabled={importing} onClick={importLogbook}><UploadCloud size={16} /> {importing ? "Synchronizing…" : "Take data from Old Logbook"}</button>
          <button style={s.heroButton} onClick={() => downloadDataset("csv")}><Download size={16} /> CSV</button>
          <button style={s.heroButton} onClick={() => downloadDataset("jsonl")}><Download size={16} /> JSONL</button>
        </div>
      </div>
      {notice && <div style={{ ...s.notice, ...(notice.type === "error" ? s.noticeError : {}) }}>{notice.type === "ok" ? <Check size={17} /> : null}{notice.text}</div>}
      <div className="outage-ml-stats" style={s.stats}>
        <Stat label="Imported records" value={(overview.training_records || 0).toLocaleString("en-IN")} />
        <Stat label="Use for training" value={(overview.use_records || 0).toLocaleString("en-IN")} tone="#008645" />
        <Stat label="Excluded" value={(overview.excluded_records || 0).toLocaleString("en-IN")} tone="#DC2626" />
        <Stat label="Saved versions" value={overview.model_versions || 0} tone="#7C3AED" />
        <Stat label="Active model" value={overview.active_version?.version_id || "Not trained"} tone="#F59E0B" />
      </div>
      <nav style={s.tabs}>{tabs.map(([id, Icon, label]) => <button key={id} style={{ ...s.tab, ...(tab === id ? s.tabActive : {}) }} onClick={() => setTab(id)}><Icon size={16} /> {label}</button>)}</nav>
      {tab === "dataset" && <Dataset taxonomy={taxonomy} notify={notify} refreshOverview={loadOverview} />}
      {tab === "taxonomy" && <TaxonomyManager items={taxonomy} notify={notify} onChanged={loadTaxonomy} />}
      {tab === "models" && <Models versions={versions} notify={notify} onChanged={() => { loadVersions(); loadOverview(); }} />}
      {tab === "predict" && <Prediction notify={notify} />}
    </AppShell>
  );
}

const s = {
  hero: { background: "linear-gradient(105deg,#081D3A 0%,#0057B8 67%,#0A8BD8 100%)", color: "white", borderRadius: 16, padding: "20px 24px", minHeight: 98, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, boxShadow: "0 14px 32px rgba(0,87,184,.15)" },
  eyebrow: { display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 9px", border: "1px solid rgba(255,255,255,.35)", borderRadius: 20, fontSize: 10, fontWeight: 800 },
  h1: { margin: "8px 0 2px", fontSize: 27, lineHeight: 1.05 }, heroText: { margin: 0, fontSize: 12, opacity: .9 },
  heroActions: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: 9 }, heroButton: { border: "1px solid rgba(255,255,255,.55)", color: "white", background: "rgba(255,255,255,.1)", borderRadius: 8, minHeight: 38, padding: "0 13px", display: "inline-flex", alignItems: "center", gap: 7, fontWeight: 800, cursor: "pointer" },
  notice: { border: "1px solid #9FDDC7", background: "#EEFBF6", color: "#03624C", borderRadius: 10, padding: "10px 14px", display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: 13 },
  noticeError: { borderColor: "#FDA4AF", background: "#FFF1F2", color: "#BE123C" },
  stats: { display: "grid", gridTemplateColumns: "repeat(5,minmax(0,1fr))", gap: 12 },
  stat: { background: "#fff", border: "1px solid #D8E5F5", borderRadius: 12, padding: "12px 14px", minWidth: 0, display: "flex", flexDirection: "column", gap: 5 },
  muted: { textTransform: "uppercase", letterSpacing: ".05em", fontSize: 10, color: "#64748B", fontWeight: 800 }, statValue: { fontSize: 18, overflow: "hidden", textOverflow: "ellipsis" },
  tabs: { background: "#fff", border: "1px solid #D8E5F5", borderRadius: 11, padding: 5, display: "flex", gap: 5 },
  tab: { border: 0, background: "transparent", color: "#475569", padding: "9px 14px", borderRadius: 8, display: "inline-flex", gap: 7, alignItems: "center", fontWeight: 800, cursor: "pointer" },
  tabActive: { background: "#EAF2FF", color: BLUE, boxShadow: "inset 0 0 0 1px #B9D4FF" },
  panel: { background: "#fff", border: "1px solid #CFE0F3", borderRadius: 14, padding: 16, boxShadow: "0 8px 24px rgba(15,23,42,.04)" },
  sectionHead: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 14 },
  h2: { margin: 0, color: NAVY, fontSize: 18 }, sub: { margin: "4px 0 0", color: "#64748B", fontSize: 12 },
  toolbar: { display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }, searchBox: { flex: 1, minWidth: 280, border: "1px solid #BFD1E6", borderRadius: 8, padding: "0 10px", display: "flex", alignItems: "center", gap: 7, background: "#fff" }, searchInput: { width: "100%", border: 0, outline: 0, minHeight: 36, color: NAVY },
  count: { fontSize: 12, color: "#64748B", fontWeight: 800 }, input: { boxSizing: "border-box", width: "100%", minHeight: 36, padding: "7px 9px", border: "1px solid #BFD1E6", borderRadius: 7, color: NAVY, background: "#fff", outlineColor: BLUE },
  field: { minWidth: 150, display: "flex", flexDirection: "column", gap: 5, color: "#475569", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".03em" },
  formRow: { display: "flex", alignItems: "flex-end", gap: 10, flexWrap: "wrap", background: "#F6F9FD", borderRadius: 10, padding: 12, marginBottom: 14 },
  primary: { minHeight: 36, padding: "0 14px", border: 0, borderRadius: 7, color: "#fff", background: BLUE, boxShadow: "0 3px 7px rgba(0,87,184,.22)", fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, cursor: "pointer" },
  secondary: { minHeight: 34, padding: "0 11px", border: "1px solid #9BBCE5", borderRadius: 7, color: BLUE, background: "#fff", fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, cursor: "pointer" },
  danger: { minHeight: 34, padding: "0 10px", border: "1px solid #FDA4AF", borderRadius: 7, color: "#BE123C", background: "#FFF1F2", fontWeight: 800, display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" },
  taxonomyGrid: { display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 12 }, taxonomyColumn: { border: "1px solid #DCE7F4", borderRadius: 10, padding: 10, background: "#FBFDFF" }, columnTitle: { display: "block", color: BLUE, fontSize: 11, margin: "2px 3px 9px" },
  taxonomyItem: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, borderTop: "1px solid #E8EEF6", padding: "8px 3px", color: NAVY, fontSize: 12 }, parent: { display: "block", color: "#7C8CA3", marginTop: 2 }, iconButton: { border: 0, background: "transparent", color: "#E11D48", cursor: "pointer" },
  taxonomySelected: { background: "#EAF2FF", color: BLUE, borderRadius: 7, borderTopColor: "transparent", paddingLeft: 8, boxShadow: "inset 3px 0 0 #0057B8" },
  taxonomyHint: { margin: "10px 3px", padding: 10, borderRadius: 7, background: "#F6F9FD", color: "#718096", fontSize: 11, lineHeight: 1.4 },
  bulkBar: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", background: "#EAF2FF", border: "1px solid #B9D4FF", padding: 9, borderRadius: 9, marginBottom: 10 },
  tableWrap: { width: "100%", overflowX: "auto", border: "1px solid #D5E1EF", borderRadius: 10 }, table: { width: "100%", borderCollapse: "collapse", color: NAVY, fontSize: 11 },
  excludedRow: { opacity: .55, background: "#FFF7F7" }, cellSub: { display: "block", color: "#718096", marginTop: 3, fontSize: 10 }, reason: { display: "block", color: "#475569", marginTop: 4, lineHeight: 1.35, maxWidth: 430 }, rawTag: { display: "inline-block", background: "#F1F5F9", color: "#475569", padding: "2px 5px", borderRadius: 4, marginTop: 4 },
  check: { display: "inline-flex", gap: 5, alignItems: "center", color: "#475569", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }, reviewed: { display: "flex", alignItems: "center", gap: 3, color: "#008645", marginTop: 5 }, saveIcon: { width: 32, height: 32, borderRadius: 7, border: 0, background: BLUE, color: "#fff", cursor: "pointer" },
  classificationRow: { display: "grid", gridTemplateColumns: "repeat(3,minmax(120px,1fr))", gap: 6 },
  secondaryClassification: { marginTop: 7, padding: 7, border: "1px solid #F5C96A", background: "#FFF9E8", borderRadius: 7, display: "grid", gap: 6 },
  useFlag: { display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 8px", borderRadius: 7, background: "#E8F8F0", color: "#007A43", fontSize: 11, fontWeight: 900, whiteSpace: "nowrap" },
  saveReviewButton: { minHeight: 34, padding: "0 10px", borderRadius: 7, border: 0, background: BLUE, color: "#fff", fontWeight: 800, display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", whiteSpace: "nowrap" },
  empty: { textAlign: "center", color: "#64748B", padding: 25 }, pagination: { display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10, marginTop: 12, fontSize: 12, fontWeight: 700, color: "#475569" },
  trainBox: { display: "flex", alignItems: "flex-end", gap: 12, padding: 13, borderRadius: 10, background: "#F5F9FF", border: "1px solid #D9E7F8" }, versionList: { display: "grid", gap: 9, marginTop: 14 },
  version: { border: "1px solid #DCE7F4", borderRadius: 10, padding: 12, display: "grid", gridTemplateColumns: "2fr repeat(3,.7fr) 2fr", alignItems: "center", gap: 12 }, versionTitle: { color: NAVY, fontWeight: 900, display: "flex", alignItems: "center", gap: 8 }, status: { padding: "3px 7px", borderRadius: 20, background: "#F1F5F9", color: "#475569", fontSize: 9, textTransform: "uppercase" }, active: { background: "#E7F8EF", color: "#008645" }, code: { display: "block", color: "#64748B", fontSize: 10, marginTop: 3 }, actions: { display: "flex", justifyContent: "flex-end", gap: 7, flexWrap: "wrap" },
  predictGrid: { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12, alignItems: "end" }, resultGrid: { display: "grid", gridTemplateColumns: "repeat(5,minmax(0,1fr))", gap: 10, marginTop: 15, paddingTop: 15, borderTop: "1px solid #DCE7F4" }, probabilities: { display: "flex", gap: 10, flexWrap: "wrap", color: "#334155", fontSize: 11 },
};
