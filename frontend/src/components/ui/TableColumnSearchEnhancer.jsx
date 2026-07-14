import { useEffect } from "react";

const FILTER_CLASS = "column-search-enhanced";
const BUTTON_CLASS = "column-search-trigger";
const PANEL_CLASS = "column-search-panel";

const getText = (value) => String(value || "").trim().toLowerCase();

const matches = (cellText, filter) => {
  const text = getText(cellText);
  const query = getText(filter.value);
  if (!query) return true;
  if (filter.operator === "equals") return text === query;
  if (filter.operator === "starts") return text.startsWith(query);
  if (filter.operator === "ends") return text.endsWith(query);
  return text.includes(query);
};

const closeOtherPanels = (currentPanel) => {
  document.querySelectorAll(`.${PANEL_CLASS}.open`).forEach((panel) => {
    if (panel !== currentPanel) panel.classList.remove("open");
  });
};

const applyTableFilters = (table) => {
  const filters = table.__columnSearchFilters || {};
  const activeFilters = Object.entries(filters).filter(([, filter]) => getText(filter?.value));

  Array.from(table.tBodies || []).forEach((tbody) => {
    Array.from(tbody.rows || []).forEach((row) => {
      if (!activeFilters.length) {
        row.classList.remove("column-search-row-hidden");
        return;
      }

      if (row.cells.length === 1 && row.cells[0].colSpan > 1) {
        const parentRow = row.previousElementSibling;
        row.classList.toggle("column-search-row-hidden", parentRow?.classList.contains("column-search-row-hidden"));
        return;
      }

      const visible = activeFilters.every(([index, filter]) => {
        const cell = row.cells[Number(index)];
        return cell ? matches(cell.textContent, filter) : false;
      });

      row.classList.toggle("column-search-row-hidden", !visible);
    });
  });
};

const createFilterPanel = (table, columnIndex) => {
  const panel = document.createElement("div");
  panel.className = PANEL_CLASS;

  const select = document.createElement("select");
  select.className = "column-search-operator";
  [
    ["contains", "Contains"],
    ["equals", "Equals"],
    ["starts", "Starts with"],
    ["ends", "Ends with"],
  ].forEach(([value, label]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.appendChild(option);
  });

  const input = document.createElement("input");
  input.className = "column-search-input";
  input.type = "search";
  input.placeholder = "Filter...";

  const clear = document.createElement("button");
  clear.className = "column-search-clear";
  clear.type = "button";
  clear.textContent = "Clear";

  const updateFilter = () => {
    table.__columnSearchFilters = table.__columnSearchFilters || {};
    table.__columnSearchFilters[columnIndex] = {
      operator: select.value,
      value: input.value,
    };
    applyTableFilters(table);
    panel.closest("th")?.classList.toggle("column-search-active", Boolean(input.value.trim()));
  };

  select.addEventListener("change", updateFilter);
  input.addEventListener("input", updateFilter);
  clear.addEventListener("click", (event) => {
    event.stopPropagation();
    input.value = "";
    updateFilter();
    input.focus();
  });
  panel.addEventListener("click", (event) => event.stopPropagation());

  panel.append(select, input, clear);
  return { panel, input };
};

const enhanceTable = (table) => {
  if (!table || table.dataset.columnSearch === "off") return;
  if (table.dataset.columnSearchEnhanced === "true") {
    applyTableFilters(table);
    return;
  }

  table.classList.add(FILTER_CLASS);
  table.dataset.columnSearchEnhanced = "true";
  table.__columnSearchFilters = table.__columnSearchFilters || {};

  Array.from(table.tHead?.rows || []).forEach((headerRow) => {
    Array.from(headerRow.cells || []).forEach((cell) => {
      if (cell.tagName !== "TH") return;
      if (cell.colSpan > 1) return;
      if (cell.querySelector(`.${BUTTON_CLASS}`)) return;
      const label = cell.textContent.trim();
      if (!label) return;

      const columnIndex = cell.cellIndex;
      cell.classList.add("column-search-header");

      const button = document.createElement("button");
      button.type = "button";
      button.className = BUTTON_CLASS;
      button.setAttribute("aria-label", `Filter ${label}`);
      button.title = "Filter column";
      button.innerHTML = '<span aria-hidden="true">F</span>';

      const { panel, input } = createFilterPanel(table, columnIndex);
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        closeOtherPanels(panel);
        panel.classList.toggle("open");
        if (panel.classList.contains("open")) {
          window.setTimeout(() => input.focus(), 0);
        }
      });

      cell.append(button, panel);
    });
  });

  applyTableFilters(table);
};

export default function TableColumnSearchEnhancer() {
  useEffect(() => {
    let queued = false;
    const pendingTables = new Set();

    const scheduleEnhance = () => {
      if (queued) return;
      queued = true;
      const run = () => {
        queued = false;
        const tables = Array.from(pendingTables);
        pendingTables.clear();
        tables.forEach(enhanceTable);
      };
      if ("requestIdleCallback" in window) {
        window.requestIdleCallback(run, { timeout: 500 });
      } else {
        window.setTimeout(run, 80);
      }
    };

    const queueTable = (table) => {
      if (!table || table.dataset.columnSearch === "off") return;
      pendingTables.add(table);
      scheduleEnhance();
    };

    const queueTablesIn = (node) => {
      if (!(node instanceof Element)) return;
      if (node.matches("table")) queueTable(node);
      node.querySelectorAll?.("table").forEach(queueTable);
    };

    document.querySelectorAll("table").forEach(queueTable);

    const observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof Element) {
            if (node.tagName === "TABLE") {
              queueTable(node);
            } else {
              const tables = node.querySelectorAll("table");
              if (tables.length > 0) {
                tables.forEach(queueTable);
              }
            }
          }
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    const closePanels = (event) => {
      if (event.target.closest(`.${PANEL_CLASS}`) || event.target.closest(`.${BUTTON_CLASS}`)) return;
      closeOtherPanels(null);
    };
    document.addEventListener("click", closePanels);

    return () => {
      observer.disconnect();
      document.removeEventListener("click", closePanels);
    };
  }, []);

  return null;
}
