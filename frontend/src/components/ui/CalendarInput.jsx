import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const toIsoDate = (date) => {
  if (!date || Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseIsoDate = (value) => {
  if (!value) return null;
  const datePart = String(value).split("T")[0];
  const parsed = new Date(`${datePart}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getTimePart = (value) => {
  const match = String(value || "").match(/T(\d{2}:\d{2})/);
  return match ? match[1] : "00:00";
};

const formatDisplayDate = (value, includeTime = false) => {
  const parsed = parseIsoDate(value);
  if (!parsed) return "Select date";
  const dateText = parsed.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  return includeTime ? `${dateText} ${getTimePart(value)}` : dateText;
};

const formatRangeDate = (value) => {
  const parsed = parseIsoDate(value);
  if (!parsed) return "";
  return parsed.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

export default function CalendarInput({
  value,
  onChange,
  className = "",
  style = {},
  placeholder = "Select date",
  disabled = false,
  includeTime = false,
  mode = "single",
  endValue = "",
  onRangeChange,
}) {
  const selectedDate = parseIsoDate(value);
  const endDate = parseIsoDate(endValue);
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(selectedDate || new Date());
  const [rangeStep, setRangeStep] = useState("start");
  const [popoverPosition, setPopoverPosition] = useState({ top: 0, left: 0 });
  const wrapRef = useRef(null);
  const popoverRef = useRef(null);
  const isRange = mode === "range";

  useEffect(() => {
    if (selectedDate) setViewDate(selectedDate);
  }, [value]);

  useEffect(() => {
    if (!open) return undefined;
    const handleClick = (event) => {
      const clickedTrigger = wrapRef.current?.contains(event.target);
      const clickedPopover = popoverRef.current?.contains(event.target);
      if (!clickedTrigger && !clickedPopover) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const updatePosition = () => {
      const rect = wrapRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = 332;
      const margin = 12;
      const left = Math.min(Math.max(margin, rect.left), window.innerWidth - width - margin);
      const popoverHeight = includeTime ? 398 : isRange ? 392 : 342;
      const belowTop = rect.bottom + 8;
      const aboveTop = Math.max(margin, rect.top - popoverHeight - 8);
      const top = belowTop + popoverHeight > window.innerHeight && rect.top > popoverHeight
        ? aboveTop
        : belowTop;
      setPopoverPosition({ top, left });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, includeTime, isRange]);

  const days = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const first = new Date(year, month, 1);
    const start = new Date(year, month, 1 - first.getDay());
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }, [viewDate]);

  const yearOptions = useMemo(() => {
    const baseYear = new Date().getFullYear();
    const viewYear = viewDate.getFullYear();
    const startYear = Math.min(baseYear - 20, viewYear - 5);
    const endYear = Math.max(baseYear + 5, viewYear + 5);
    return Array.from({ length: endYear - startYear + 1 }, (_, index) => startYear + index);
  }, [viewDate]);

  const moveMonth = (delta) => {
    setViewDate((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  };

  const moveYear = (delta) => {
    setViewDate((current) => new Date(current.getFullYear() + delta, current.getMonth(), 1));
  };

  const changeMonth = (month) => {
    setViewDate((current) => new Date(current.getFullYear(), Number(month), 1));
  };

  const changeYear = (year) => {
    setViewDate((current) => new Date(Number(year), current.getMonth(), 1));
  };

  const selectDate = (date) => {
    const iso = toIsoDate(date);
    if (isRange) {
      if (rangeStep === "start" || !value || (value && endValue)) {
        onRangeChange?.(iso, "");
        setRangeStep("end");
        return;
      }
      const start = parseIsoDate(value);
      if (start && date < start) {
        onRangeChange?.(iso, value);
      } else {
        onRangeChange?.(value, iso);
      }
      setRangeStep("start");
      setOpen(false);
      return;
    }
    onChange?.(includeTime ? `${iso}T${getTimePart(value)}` : iso);
    if (!includeTime) setOpen(false);
  };

  const changeTime = (timeValue) => {
    const datePart = toIsoDate(selectedDate) || toIsoDate(new Date());
    onChange?.(`${datePart}T${timeValue || "00:00"}`);
  };

  const selectedIso = toIsoDate(selectedDate);
  const endIso = toIsoDate(endDate);
  const todayIso = toIsoDate(new Date());
  const rangeStartTime = selectedDate?.getTime();
  const rangeEndTime = endDate?.getTime();
  const triggerText = isRange
    ? (value && endValue ? `${formatRangeDate(value)} - ${formatRangeDate(endValue)}` : value ? `${formatRangeDate(value)} - Select end` : placeholder)
    : (value ? formatDisplayDate(value, includeTime) : placeholder);

  return (
    <div style={styles.wrap} ref={wrapRef}>
      <button
        type="button"
        className={className}
        style={{ ...styles.trigger, ...style }}
        onClick={() => !disabled && setOpen((state) => !state)}
        disabled={disabled}
      >
        <span>{triggerText}</span>
      </button>
      {open && createPortal((
        <div ref={popoverRef} style={{ ...styles.popover, top: popoverPosition.top, left: popoverPosition.left }}>
          <div style={styles.header}>
            <button type="button" style={styles.iconButton} onClick={() => moveYear(-1)} aria-label="Previous year">
              <ChevronsLeft size={17} />
            </button>
            <button type="button" style={styles.iconButton} onClick={() => moveMonth(-1)} aria-label="Previous month">
              <ChevronLeft size={18} />
            </button>
            <select
              aria-label="Select month"
              value={viewDate.getMonth()}
              onChange={(event) => changeMonth(event.target.value)}
              style={styles.monthSelect}
            >
              {MONTHS.map((month, index) => (
                <option key={month} value={index}>{month}</option>
              ))}
            </select>
            <select
              aria-label="Select year"
              value={viewDate.getFullYear()}
              onChange={(event) => changeYear(event.target.value)}
              style={styles.yearSelect}
            >
              {yearOptions.map((year) => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
            <button type="button" style={styles.iconButton} onClick={() => moveMonth(1)} aria-label="Next month">
              <ChevronRight size={18} />
            </button>
            <button type="button" style={styles.iconButton} onClick={() => moveYear(1)} aria-label="Next year">
              <ChevronsRight size={17} />
            </button>
          </div>

          <div style={styles.weekGrid}>
            {WEEKDAYS.map((day) => <div key={day} style={styles.weekDay}>{day}</div>)}
          </div>

          <div style={styles.dayGrid}>
            {days.map((date) => {
              const iso = toIsoDate(date);
              const inMonth = date.getMonth() === viewDate.getMonth();
              const selected = iso === selectedIso;
              const rangeEnd = iso === endIso;
              const inRange = isRange && rangeStartTime && rangeEndTime && date.getTime() > Math.min(rangeStartTime, rangeEndTime) && date.getTime() < Math.max(rangeStartTime, rangeEndTime);
              const today = iso === todayIso;
              return (
                <button
                  key={iso}
                  type="button"
                  style={{
                    ...styles.dayButton,
                    ...(!inMonth ? styles.mutedDay : {}),
                    ...(inRange ? styles.rangeDay : {}),
                    ...(today ? styles.todayDay : {}),
                    ...(selected || rangeEnd ? styles.selectedDay : {}),
                  }}
                  onClick={() => selectDate(date)}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>
          {includeTime && (
            <div style={styles.timeFooter}>
              <label style={styles.timeLabel}>
                Time
                <input
                  type="time"
                  value={getTimePart(value)}
                  onChange={(event) => changeTime(event.target.value)}
                  style={styles.timeInput}
                />
              </label>
              <button type="button" style={styles.doneButton} onClick={() => setOpen(false)}>Done</button>
            </div>
          )}
          {isRange && (
            <div style={styles.rangeFooter}>
              <span>{rangeStep === "end" ? "Select end date" : "Select start date"}</span>
              {(value || endValue) && (
                <button type="button" style={styles.clearButton} onClick={() => { onRangeChange?.("", ""); setRangeStep("start"); }}>
                  Clear
                </button>
              )}
            </div>
          )}
        </div>
      ), document.body)}
    </div>
  );
}

const styles = {
  wrap: { position: "relative", width: "100%" },
  trigger: {
    width: "100%",
    minHeight: 38,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    border: "1px solid #cbd5e1",
    borderRadius: 8,
    background: "#fff",
    color: "#0f172a",
    fontWeight: 800,
    cursor: "pointer",
  },
  popover: {
    position: "fixed",
    zIndex: 5000,
    width: 332,
    borderRadius: 12,
    background: "#fff",
    border: "1px solid #dbe5ee",
    boxShadow: "0 24px 60px rgba(15,23,42,0.18)",
    padding: 14,
  },
  header: {
    display: "grid",
    gridTemplateColumns: "32px 32px minmax(0, 1fr) 86px 32px 32px",
    alignItems: "center",
    gap: 4,
    marginBottom: 12,
  },
  iconButton: {
    width: 32,
    height: 32,
    border: 0,
    borderRadius: 9,
    background: "#f8fafc",
    color: "#0f172a",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
  },
  monthSelect: {
    height: 32,
    border: "1px solid #e2e8f0",
    borderRadius: 9,
    background: "#fff",
    fontSize: 14,
    fontWeight: 900,
    color: "#0f172a",
    cursor: "pointer",
    padding: "0 8px",
  },
  yearSelect: {
    height: 32,
    border: "1px solid #e2e8f0",
    borderRadius: 9,
    background: "#fff",
    fontSize: 13,
    fontWeight: 900,
    color: "#0f172a",
    cursor: "pointer",
    padding: "0 8px",
  },
  weekGrid: { display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 6 },
  weekDay: { textAlign: "center", fontSize: 11, fontWeight: 800, color: "#334155" },
  dayGrid: { display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 5 },
  dayButton: {
    height: 32,
    border: 0,
    borderRadius: 9,
    background: "transparent",
    color: "#0f172a",
    fontSize: 12,
    fontWeight: 900,
    cursor: "pointer",
  },
  mutedDay: { color: "#a7b0bd", fontWeight: 800 },
  todayDay: { boxShadow: "inset 0 -2px 0 #facc15" },
  selectedDay: {
    background: "#21c6b8",
    color: "#fff",
    boxShadow: "0 8px 18px rgba(33,198,184,0.35)",
  },
  rangeDay: {
    background: "rgba(33,198,184,0.18)",
    color: "#04756d",
    borderRadius: 6,
  },
  timeFooter: {
    display: "flex",
    alignItems: "end",
    justifyContent: "space-between",
    gap: 10,
    borderTop: "1px solid #e2e8f0",
    marginTop: 12,
    paddingTop: 12,
  },
  timeLabel: { display: "grid", gap: 4, fontSize: 11, fontWeight: 900, color: "#334155" },
  timeInput: {
    height: 34,
    borderRadius: 8,
    border: "1px solid #cbd5e1",
    padding: "0 8px",
    fontWeight: 800,
    color: "#0f172a",
  },
  doneButton: {
    height: 34,
    border: 0,
    borderRadius: 8,
    background: "#03624C",
    color: "#fff",
    padding: "0 12px",
    fontWeight: 900,
    cursor: "pointer",
  },
  rangeFooter: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    borderTop: "1px solid #e2e8f0",
    marginTop: 12,
    paddingTop: 10,
    fontSize: 12,
    fontWeight: 900,
    color: "#03624C",
  },
  clearButton: {
    border: 0,
    background: "transparent",
    color: "#b42318",
    fontWeight: 900,
    cursor: "pointer",
  },
};
