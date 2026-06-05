/**
 * PlantMappingGrid.jsx
 * Premium spreadsheet-style editable grid for plant mapping configuration.
 * Features:
 *  - Sticky read-only info columns
 *  - Inline editable cells (click to edit)
 *  - Ctrl+V paste from Excel (tab-separated)
 *  - Dirty-row tracking (yellow = changed, green = just saved)
 *  - Column search / filter
 *  - Drag-to-reorder rows
 *  - Source dropdowns (WBES / RTG / Manual)
 */

import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { Search, Save, RotateCcw, GripVertical, Download } from "lucide-react";

/* ── Column definitions ─────────────────────────────────── */
const READ_COLS = [
  { key: "plant_id",                label: "RTG Plant ID",    w: 130 },
  { key: "plant_name",              label: "Plant Name",      w: 200 },
  { key: "STAGE_NAME",              label: "Stage",           w: 130 },
  { key: "state_name",              label: "State",           w: 100 },
  { key: "fuel_type",               label: "Fuel",            w: 80  },
  { key: "owner_name",              label: "Owner",           w: 100 },
  { key: "stage_installed_capacity",label: "Cap (MW)",        w: 80  },
];

const EDIT_COLS = [
  { key: "wbes_name",       label: "WBES Name",      w: 150, type: "text" },
  { key: "wbes_acronym",    label: "WBES Acronym",   w: 120, type: "text" },
  { key: "rtg_plant_id",    label: "RTG Plant ID",   w: 120, type: "text" },
  { key: "scada_key",       label: "SCADA Key",      w: 160, type: "text" },
  { key: "scada_header",    label: "SCADA Header",   w: 160, type: "text" },
  { key: "schedule_source", label: "Sched. Source",  w: 120, type: "select",
    options: ["RTG", "WBES", "Manual"] },
  { key: "dc_source",       label: "DC Source",      w: 110, type: "select",
    options: ["RTG", "WBES", "Manual"] },
  { key: "outage_key",      label: "Outage Key",     w: 130, type: "text" },
];

const SOURCE_COLOR = { WBES: "#6366F1", RTG: "#10B981", Manual: "#F59E0B" };

/* ── Styles ──────────────────────────────────────────────── */
const cell = {
  borderRight: "1px solid #E5E7EB",
  borderBottom: "1px solid #E5E7EB",
  padding: "3px 7px",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  fontSize: "0.75rem",
  lineHeight: "1.4",
  height: "32px",
  verticalAlign: "middle",
  boxSizing: "border-box",
};

const stickyHdr = {
  ...cell,
  position: "sticky",
  top: 0,
  zIndex: 20,
  background: "#022726",
  color: "#fff",
  fontWeight: 700,
  fontSize: "0.7rem",
  userSelect: "none",
};

const editHdr = {
  ...stickyHdr,
  background: "#0F172A",
  color: "#94A3B8",
};

/* ════════════════════════════════════════════════════════════
   COMPONENT
════════════════════════════════════════════════════════════ */
export default function PlantMappingGrid({
  data = [],
  loading = false,
  onSave,
  onExport,
  maxHeight = "45vh",
  searchText = undefined,
}) {
  const [rows, setRows]       = useState([]);
  const [dirtyIds, setDirtyIds] = useState(new Set());
  const [savedIds, setSavedIds] = useState(new Set());
  const [search, setSearch]   = useState("");
  const [editCell, setEditCell] = useState(null); // { rowIdx, key }
  const [dragIdx, setDragIdx] = useState(null);
  const [overIdx, setOverIdx] = useState(null);
  const inputRef = useRef(null);

  /* Sync incoming data → local rows with stable id */
  useEffect(() => {
    setRows(
      data.map((r, i) => ({
        ...r,
        _id: r.plant_id + "_" + (r.STAGE_ID || i),
      }))
    );
    setDirtyIds(new Set());
    setSavedIds(new Set());
  }, [data]);

  /* Focus input or select when cell enters edit mode */
  useEffect(() => {
    if (editCell) {
      const selectEl = document.getElementById(`select-${editCell.rowId}-${editCell.key}`);
      if (selectEl) {
        selectEl.focus();
      } else if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select?.();
      }
    }
  }, [editCell]);

  /* ── Filtered rows ── */
  const filtered = useMemo(() => {
    const activeSearch = searchText !== undefined ? searchText : search;
    if (!activeSearch) return rows;
    const q = activeSearch.toLowerCase();
    return rows.filter((r) =>
      READ_COLS.concat(EDIT_COLS).some((c) =>
        String(r[c.key] ?? "").toLowerCase().includes(q)
      )
    );
  }, [rows, search, searchText]);

  /* ── Keyboard navigation ── */
  const handleKeyDown = useCallback((e, rowIdx, colKey) => {
    const colOrder = EDIT_COLS.map((c) => c.key);
    const colIdx = colOrder.indexOf(colKey);

    if (e.key === "ArrowDown") {
      e.preventDefault();
      const nextIdx = Math.min(rowIdx + 1, filtered.length - 1);
      const nextRow = filtered[nextIdx];
      if (nextRow) {
        setEditCell({ rowId: nextRow._id, key: colKey });
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prevIdx = Math.max(rowIdx - 1, 0);
      const prevRow = filtered[prevIdx];
      if (prevRow) {
        setEditCell({ rowId: prevRow._id, key: colKey });
      }
    } else if (e.key === "ArrowLeft") {
      const isInput = e.target.tagName === "INPUT";
      const caretAtStart = isInput ? e.target.selectionStart === 0 : true;
      if (caretAtStart) {
        e.preventDefault();
        const prevColIdx = colIdx - 1;
        if (prevColIdx >= 0) {
          setEditCell({ rowId: filtered[rowIdx]._id, key: colOrder[prevColIdx] });
        }
      }
    } else if (e.key === "ArrowRight") {
      const isInput = e.target.tagName === "INPUT";
      const caretAtEnd = isInput ? e.target.selectionStart === e.target.value.length : true;
      if (caretAtEnd) {
        e.preventDefault();
        const nextColIdx = colIdx + 1;
        if (nextColIdx < colOrder.length) {
          setEditCell({ rowId: filtered[rowIdx]._id, key: colOrder[nextColIdx] });
        }
      }
    } else if (e.key === "Tab") {
      e.preventDefault();
      if (e.shiftKey) {
        const prevColIdx = colIdx - 1;
        if (prevColIdx >= 0) {
          setEditCell({ rowId: filtered[rowIdx]._id, key: colOrder[prevColIdx] });
        } else {
          const prevRowIdx = rowIdx - 1;
          if (prevRowIdx >= 0) {
            setEditCell({ rowId: filtered[prevRowIdx]._id, key: colOrder[colOrder.length - 1] });
          }
        }
      } else {
        const nextColIdx = colIdx + 1;
        if (nextColIdx < colOrder.length) {
          setEditCell({ rowId: filtered[rowIdx]._id, key: colOrder[nextColIdx] });
        } else {
          const nextRowIdx = rowIdx + 1;
          if (nextRowIdx < filtered.length) {
            setEditCell({ rowId: filtered[nextRowIdx]._id, key: colOrder[0] });
          }
        }
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      setEditCell(null);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setEditCell(null);
    }
  }, [filtered]);

  /* ── Cell change ── */
  const change = useCallback((id, key, val) => {
    setRows((prev) =>
      prev.map((r) => (r._id === id ? { ...r, [key]: val } : r))
    );
    setDirtyIds((prev) => new Set([...prev, id]));
    setSavedIds((prev) => { const s = new Set(prev); s.delete(id); return s; });
  }, []);

  /* ── Ctrl+V paste from Excel ─────────────────────────────
     Clipboard text is tab-separated columns, newline-separated rows.
     Paste fills from the selected cell downward / rightward.
  ── */
  const handlePaste = useCallback(
    (e, rowIdx, colKey) => {
      const text = e.clipboardData.getData("text/plain");
      if (!text.includes("\t") && !text.includes("\n")) return; // single cell → native
      e.preventDefault();

      const pasteRows = text
        .replace(/\r/g, "")
        .split("\n")
        .filter((l) => l !== "");
      const colOrder = EDIT_COLS.map((c) => c.key);
      const startColIdx = colOrder.indexOf(colKey);

      setRows((prev) => {
        const next = [...prev];
        // find global index of the filtered row
        const globalStartIdx = prev.findIndex(
          (r) => r._id === filtered[rowIdx]?._id
        );
        pasteRows.forEach((line, ri) => {
          const gIdx = globalStartIdx + ri;
          if (gIdx >= next.length) return;
          const cells = line.split("\t");
          cells.forEach((val, ci) => {
            const cIdx = startColIdx + ci;
            if (cIdx >= colOrder.length) return;
            const col = EDIT_COLS[cIdx];
            if (!col) return;
            next[gIdx] = { ...next[gIdx], [col.key]: val.trim() };
            setDirtyIds((d) => new Set([...d, next[gIdx]._id]));
          });
        });
        return next;
      });
    },
    [filtered]
  );

  /* ── Save ── */
  const handleSave = async () => {
    const dirtyRows = rows.filter((r) => dirtyIds.has(r._id));
    if (!dirtyRows.length) return;
    await onSave?.(dirtyRows);
    setSavedIds(new Set([...savedIds, ...dirtyIds]));
    setDirtyIds(new Set());
  };

  /* ── Drag-to-reorder ── */
  const dragStart = (idx) => setDragIdx(idx);
  const dragOver  = (e, idx) => { e.preventDefault(); setOverIdx(idx); };
  const drop      = () => {
    if (dragIdx === null || overIdx === null || dragIdx === overIdx) {
      setDragIdx(null); setOverIdx(null); return;
    }
    setRows((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIdx, 1);
      next.splice(overIdx, 0, moved);
      return next;
    });
    setDragIdx(null); setOverIdx(null);
  };

  /* ── Row background ── */
  const rowBg = (id, i) => {
    if (dirtyIds.has(id)) return "rgba(245,158,11,0.08)";
    if (savedIds.has(id)) return "rgba(16,185,129,0.08)";
    return i % 2 === 0 ? "#fff" : "#F9FAFB";
  };

  const totalW = READ_COLS.reduce((a, c) => a + c.w, 0)
               + EDIT_COLS.reduce((a, c) => a + c.w, 0)
               + 32; // drag handle

  return (
    <div style={{ fontFamily: "'Inter', sans-serif" }}>

      {/* ── Toolbar ─────────────────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center", gap: "10px",
        padding: "10px 0 10px", flexWrap: "wrap",
      }}>
        {/* Search */}
        {searchText === undefined && (
          <div style={{
            display: "flex", alignItems: "center", gap: "6px",
            background: "#F1F5F9", borderRadius: "8px",
            padding: "5px 10px", flex: "0 0 260px",
          }}>
            <Search size={13} style={{ color: "#94A3B8" }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search plants, state, fuel…"
              style={{
                border: "none", background: "transparent", outline: "none",
                fontSize: "0.78rem", color: "#374151", width: "100%",
              }}
            />
          </div>
        )}

        {/* Stats */}
        <div style={{ fontSize: "0.72rem", color: "#64748B", marginLeft: "4px" }}>
          <span style={{ fontWeight: 700, color: "#0F172A" }}>
            {filtered.length}
          </span>/{rows.length} plants &nbsp;·&nbsp;
          {dirtyIds.size > 0 && (
            <span style={{ color: "#F59E0B", fontWeight: 700 }}>
              {dirtyIds.size} unsaved
            </span>
          )}
          {savedIds.size > 0 && dirtyIds.size === 0 && (
            <span style={{ color: "#10B981", fontWeight: 700 }}>
              ✓ All saved
            </span>
          )}
        </div>

        <div style={{ marginLeft: "auto", display: "flex", gap: "8px" }}>
          <button
            onClick={() => { setRows(data.map((r,i) => ({...r, _id: r.plant_id+"_"+(r.STAGE_ID||i)}))); setDirtyIds(new Set()); }}
            disabled={dirtyIds.size === 0}
            style={{
              display: "flex", alignItems: "center", gap: "5px",
              background: dirtyIds.size > 0 ? "#F8FAFC" : "#F1F5F9",
              border: "1px solid #E2E8F0", borderRadius: "8px",
              padding: "6px 12px", fontSize: "0.75rem",
              color: dirtyIds.size > 0 ? "#64748B" : "#CBD5E1",
              cursor: dirtyIds.size > 0 ? "pointer" : "not-allowed",
            }}
          >
            <RotateCcw size={12} /> Revert
          </button>

          {onExport && (
            <button
              onClick={onExport}
              style={{
                display: "flex", alignItems: "center", gap: "5px",
                background: "#F8FAFC",
                border: "1px solid #E2E8F0", borderRadius: "8px",
                padding: "6px 12px", fontSize: "0.75rem",
                color: "#374151", cursor: "pointer",
              }}
            >
              <Download size={12} /> Export
            </button>
          )}

          <button
            onClick={handleSave}
            disabled={dirtyIds.size === 0 || loading}
            style={{
              display: "flex", alignItems: "center", gap: "5px",
              background: dirtyIds.size > 0 ? "#022726" : "#94A3B8",
              border: "none", borderRadius: "8px",
              padding: "6px 16px", fontSize: "0.75rem",
              color: "#fff", cursor: dirtyIds.size > 0 ? "pointer" : "not-allowed",
              fontWeight: 700,
            }}
          >
            <Save size={12} />
            {loading ? "Saving…" : `Save ${dirtyIds.size > 0 ? `(${dirtyIds.size})` : ""}`}
          </button>
        </div>
      </div>

      {/* ── Legend ── */}
      <div style={{ display: "flex", gap: "14px", marginBottom: "8px", fontSize: "0.68rem" }}>
        <span style={{ display:"flex",alignItems:"center",gap:"4px" }}>
          <span style={{ width:10,height:10,borderRadius:2,background:"rgba(245,158,11,0.3)",display:"inline-block" }}/>
          Unsaved
        </span>
        <span style={{ display:"flex",alignItems:"center",gap:"4px" }}>
          <span style={{ width:10,height:10,borderRadius:2,background:"rgba(16,185,129,0.25)",display:"inline-block" }}/>
          Saved
        </span>
        <span style={{ color:"#94A3B8" }}>
          Ctrl+V to paste from Excel into editable cells
        </span>
      </div>

      {/* ── Grid ────────────────────────────────────────── */}
      <div style={{
        overflowX: "auto", overflowY: "auto",
        maxHeight: maxHeight, borderRadius: "10px",
        border: "1px solid #E5E7EB",
        boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
      }}>
        <table style={{
          borderCollapse: "collapse",
          tableLayout: "fixed",
          width: totalW,
          minWidth: "100%",
        }}>
          {/* ── HEADER ── */}
          <thead>
            <tr>
              {/* Drag handle col */}
              <th style={{ ...stickyHdr, width: 32, left: 0, zIndex: 30, background: "#022726" }} />
              {READ_COLS.map((c) => (
                <th key={c.key} style={{ ...stickyHdr, width: c.w, minWidth: c.w }}>
                  {c.label}
                </th>
              ))}
              {EDIT_COLS.map((c) => (
                <th key={c.key} style={{ ...editHdr, width: c.w, minWidth: c.w }}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>

          {/* ── BODY ── */}
          <tbody>
            {filtered.map((row, ri) => {
              const isDirty  = dirtyIds.has(row._id);
              const isSaved  = savedIds.has(row._id);
              const isDragging = dragIdx === ri;
              const isOver   = overIdx === ri;
              const bg       = rowBg(row._id, ri);

              return (
                <tr
                  key={row._id}
                  draggable
                  onDragStart={() => dragStart(ri)}
                  onDragOver={(e) => dragOver(e, ri)}
                  onDrop={drop}
                  onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}
                  style={{
                    background: bg,
                    outline: isOver ? "2px solid #10B981" : "none",
                    opacity: isDragging ? 0.5 : 1,
                    transition: "opacity 0.15s",
                  }}
                >
                  {/* Drag handle */}
                  <td style={{ ...cell, width: 32, textAlign: "center",
                    color: "#CBD5E1", cursor: "grab" }}>
                    <GripVertical size={12} />
                  </td>

                  {/* READ columns */}
                  {READ_COLS.map((c) => (
                    <td key={c.key}
                      title={String(row[c.key] ?? "")}
                      style={{
                        ...cell, width: c.w, minWidth: c.w,
                        background: bg,
                        fontWeight: c.key === "plant_name" ? 600 : 400,
                        color: c.key === "plant_name" ? "#0F172A" : "#374151",
                      }}>
                      {c.key === "stage_installed_capacity"
                        ? (row[c.key] || row.installed_capacity || "")
                        : (row[c.key] ?? "")}
                    </td>
                  ))}

                  {/* EDIT columns */}
                  {EDIT_COLS.map((c) => {
                    const isEditing =
                      editCell?.rowId === row._id && editCell?.key === c.key;

                    if (c.type === "select") {
                      const val = row[c.key] || c.options[0];
                      const clr = SOURCE_COLOR[val] || "#64748B";
                      const isSelected = editCell?.rowId === row._id && editCell?.key === c.key;
                      return (
                        <td key={c.key} style={{ ...cell, width: c.w, minWidth: c.w, background: bg }}>
                          <select
                            id={`select-${row._id}-${c.key}`}
                            value={val}
                            onChange={(e) => change(row._id, c.key, e.target.value)}
                            onFocus={() => setEditCell({ rowId: row._id, key: c.key })}
                            onKeyDown={(e) => handleKeyDown(e, ri, c.key)}
                            style={{
                              width: "100%",
                              border: isSelected ? "1.5px solid #3B82F6" : "none",
                              background: isSelected ? "#EFF6FF" : `${clr}18`,
                              color: clr, fontWeight: 700,
                              fontSize: "0.7rem", borderRadius: "4px",
                              padding: "2px 4px", cursor: "pointer",
                              outline: "none",
                            }}
                          >
                            {c.options.map((o) => (
                              <option key={o} value={o}>{o}</option>
                            ))}
                          </select>
                        </td>
                      );
                    }

                    return (
                      <td
                        key={c.key}
                        style={{
                          ...cell, width: c.w, minWidth: c.w,
                          background: isEditing ? "#EFF6FF" : bg,
                          cursor: "text",
                          borderLeft: isEditing ? "2px solid #3B82F6" : cell.borderRight,
                        }}
                        onClick={() =>
                          setEditCell({ rowId: row._id, key: c.key })
                        }
                        onPaste={(e) => handlePaste(e, ri, c.key)}
                      >
                        {isEditing ? (
                          <input
                            ref={inputRef}
                            value={row[c.key] ?? ""}
                            onChange={(e) => change(row._id, c.key, e.target.value)}
                            onBlur={() => setEditCell(null)}
                            onKeyDown={(e) => handleKeyDown(e, ri, c.key)}
                            onPaste={(e) => { handlePaste(e, ri, c.key); }}
                            style={{
                              width: "100%", border: "none",
                              background: "transparent", outline: "none",
                              fontSize: "0.75rem", color: "#1E293B",
                              fontFamily: "inherit",
                            }}
                          />
                        ) : (
                          <span style={{
                            color: row[c.key] ? "#1E293B" : "#CBD5E1",
                            fontStyle: row[c.key] ? "normal" : "italic",
                          }}>
                            {row[c.key] || "—"}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}

            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={READ_COLS.length + EDIT_COLS.length + 1}
                  style={{ ...cell, textAlign: "center", color: "#94A3B8",
                    padding: "32px", fontStyle: "italic" }}
                >
                  {loading ? "Loading plants…" : "No plants found"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
