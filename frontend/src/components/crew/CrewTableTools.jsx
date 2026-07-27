import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const tableState = new WeakMap();

const searchableRows = (table, columnCount) => (
  [...(table.tBodies?.[0]?.rows || [])].filter((row) => (
    row.cells.length === columnCount &&
    ![...row.cells].some((cell) => Number(cell.colSpan || 1) > 1)
  ))
);

const valueAt = (row, index) => (
  String(row.cells[index]?.innerText || row.cells[index]?.textContent || "").replace(/\s+/g, " ").trim()
);

const comparable = (value) => {
  const text = String(value || "").trim();
  const normalizedNumber = text.replace(/,/g, "").replace(/[%₹$]/g, "");
  if (/^-?\d+(\.\d+)?$/.test(normalizedNumber)) return { type: "number", value: Number(normalizedNumber) };
  const date = Date.parse(text);
  if (date && /[\d]{1,4}[-/ ](?:[A-Za-z]{3,}|\d{1,2})[-/ ]?[\d]{0,4}/.test(text)) return { type: "date", value: date };
  return { type: "text", value: text.toLocaleLowerCase("en-IN") };
};

const compareValues = (left, right) => {
  const a = comparable(left);
  const b = comparable(right);
  if (a.type === b.type && a.type !== "text") return a.value - b.value;
  return String(a.value).localeCompare(String(b.value), "en-IN", { numeric: true, sensitivity: "base" });
};

const applyFilters = (table) => {
  const state = tableState.get(table);
  if (!state) return;
  const rows = searchableRows(table, state.columnCount);
  rows.forEach((row) => {
    const visible = [...state.filters.entries()].every(([index, query]) => (
      !query || valueAt(row, index).toLocaleLowerCase("en-IN").includes(query)
    ));
    row.style.display = visible ? "" : "none";
  });

  // A group/header row remains visible only when its following data segment has a match.
  const allRows = [...(table.tBodies?.[0]?.rows || [])];
  allRows.forEach((row, index) => {
    if (row.cells.length === state.columnCount && ![...row.cells].some((cell) => Number(cell.colSpan || 1) > 1)) return;
    const following = [];
    for (let cursor = index + 1; cursor < allRows.length; cursor += 1) {
      const candidate = allRows[cursor];
      const isData = candidate.cells.length === state.columnCount && ![...candidate.cells].some((cell) => Number(cell.colSpan || 1) > 1);
      if (!isData) break;
      following.push(candidate);
    }
    if (following.length) row.style.display = following.some((candidate) => candidate.style.display !== "none") ? "" : "none";
  });
};

const sortSegments = (table, columnIndex, direction) => {
  const state = tableState.get(table);
  const body = table.tBodies?.[0];
  if (!state || !body) return;
  const allRows = [...body.rows];
  const segments = [];
  let current = [];

  const flush = () => {
    if (current.length) segments.push(current);
    current = [];
  };
  allRows.forEach((row) => {
    const isData = row.cells.length === state.columnCount && ![...row.cells].some((cell) => Number(cell.colSpan || 1) > 1);
    if (isData) current.push(row);
    else flush();
  });
  flush();

  segments.forEach((segment) => {
    const afterSegment = segment[segment.length - 1].nextSibling;
    segment
      .sort((left, right) => compareValues(valueAt(left, columnIndex), valueAt(right, columnIndex)) * direction)
      .forEach((row) => body.insertBefore(row, afterSegment));
  });
  applyFilters(table);
};

const searchSvg = `
  <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
    <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"></circle>
    <path d="m20 20-3.5-3.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path>
  </svg>`;

const enhanceTable = (table) => {
  const headerRow = table.tHead?.rows?.[0];
  if (!headerRow) return;
  const headers = [...headerRow.cells];
  if (headers.length < 2) return;

  let state = tableState.get(table);
  if (!state) {
    state = { filters: new Map(), sortColumn: -1, sortDirection: 1, columnCount: headers.length };
    tableState.set(table, state);
  }
  state.columnCount = headers.length;
  table.classList.add("crew-smart-table");

  headers.forEach((header, index) => {
    if (header.dataset.crewTableTools === "ready" && header.querySelector(":scope > .crew-column-tools")) return;
    if (header.dataset.crewTableTools === "ready") delete header.dataset.crewTableTools;
    const label = String(header.innerText || header.textContent || "").replace(/\s+/g, " ").trim();
    const excluded = !label || /^(action|actions|fill|select)$/i.test(label) || Boolean(header.querySelector('input[type="checkbox"]'));
    if (excluded) {
      header.dataset.crewTableTools = "excluded";
      return;
    }

    header.dataset.crewTableTools = "ready";
    header.style.position = "relative";
    const controls = document.createElement("span");
    controls.className = "crew-column-tools";

    const sortButton = document.createElement("button");
    sortButton.type = "button";
    sortButton.className = "crew-column-sort";
    sortButton.title = `Sort ${label}`;
    sortButton.setAttribute("aria-label", `Sort ${label}`);
    sortButton.textContent = "↕";
    sortButton.addEventListener("click", (event) => {
      event.stopPropagation();
      state.sortDirection = state.sortColumn === index ? state.sortDirection * -1 : 1;
      state.sortColumn = index;
      [...table.querySelectorAll(".crew-column-sort")].forEach((button) => { button.textContent = "↕"; });
      sortButton.textContent = state.sortDirection === 1 ? "↑" : "↓";
      sortSegments(table, index, state.sortDirection);
    });

    const searchButton = document.createElement("button");
    searchButton.type = "button";
    searchButton.className = "crew-column-search";
    searchButton.title = `Search ${label}`;
    searchButton.setAttribute("aria-label", `Search ${label}`);
    searchButton.innerHTML = searchSvg;
    searchButton.addEventListener("click", (event) => {
      event.stopPropagation();
      table.querySelectorAll(".crew-column-search-popover").forEach((popover) => {
        if (popover.parentElement !== header) popover.remove();
      });
      const existing = header.querySelector(":scope > .crew-column-search-popover");
      if (existing) {
        existing.remove();
        return;
      }

      const popover = document.createElement("span");
      popover.className = "crew-column-search-popover";
      const input = document.createElement("input");
      input.type = "search";
      input.placeholder = `Search ${label}`;
      input.value = state.filters.get(index) || "";
      input.setAttribute("aria-label", `Search ${label}`);
      const close = document.createElement("button");
      close.type = "button";
      close.textContent = "×";
      close.title = "Close search";
      input.addEventListener("input", () => {
        const query = input.value.trim().toLocaleLowerCase("en-IN");
        if (query) state.filters.set(index, query);
        else state.filters.delete(index);
        searchButton.classList.toggle("active", Boolean(query));
        applyFilters(table);
      });
      close.addEventListener("click", (closeEvent) => {
        closeEvent.stopPropagation();
        popover.remove();
      });
      popover.addEventListener("click", (popoverEvent) => popoverEvent.stopPropagation());
      popover.append(input, close);
      header.appendChild(popover);
      window.setTimeout(() => input.focus(), 0);
    });

    controls.append(sortButton, searchButton);
    header.appendChild(controls);
  });
  applyFilters(table);
};

export default function CrewTableTools() {
  const location = useLocation();

  useEffect(() => {
    if (!location.pathname.startsWith("/crew/")) return undefined;
    let scheduled = 0;
    const enhanceAll = () => {
      scheduled = 0;
      document.querySelectorAll(".ui-kit-app table").forEach(enhanceTable);
    };
    const schedule = () => {
      if (!scheduled) scheduled = window.requestAnimationFrame(enhanceAll);
    };
    enhanceAll();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      if (scheduled) window.cancelAnimationFrame(scheduled);
    };
  }, [location.pathname]);

  if (!location.pathname.startsWith("/crew/")) return null;
  return (
    <style>{`
      .crew-smart-table thead th { overflow: visible !important; padding-right: 46px !important; }
      .crew-column-tools { position: absolute; right: 5px; top: 50%; transform: translateY(-50%); display: inline-flex; align-items: center; gap: 1px; z-index: 8; }
      .crew-column-sort, .crew-column-search { width: 20px; height: 22px; padding: 0; border: 0; border-radius: 5px; display: inline-grid; place-items: center; background: transparent; color: #0057B7; font: 900 13px/1 Inter, sans-serif; cursor: pointer; }
      .crew-column-sort:hover, .crew-column-search:hover, .crew-column-search.active { background: #E8F1FB; color: #003E83; }
      .crew-column-search-popover { position: absolute; top: calc(100% + 5px); right: 4px; width: 225px; padding: 7px; border: 1px solid #BFDBFE; border-radius: 9px; background: #FFFFFF; box-shadow: 0 10px 28px rgba(15,23,42,.18); display: flex; align-items: center; gap: 5px; z-index: 1400; }
      .crew-column-search-popover input { min-width: 0; width: 100%; height: 32px; padding: 0 9px; border: 1px solid #CBD5E1; border-radius: 7px; outline: none; color: #0F172A; background: #FFFFFF; font: 650 12px/1.2 Inter, sans-serif; }
      .crew-column-search-popover input:focus { border-color: #0057B7; box-shadow: 0 0 0 2px rgba(0,87,183,.12); }
      .crew-column-search-popover button { width: 28px; height: 28px; border: 0; border-radius: 6px; background: #F1F5F9; color: #475569; font-size: 18px; cursor: pointer; }
    `}</style>
  );
}
