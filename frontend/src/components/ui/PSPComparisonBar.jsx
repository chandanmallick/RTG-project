import Tooltip from "@mui/material/Tooltip";

const numberFormat = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

const formatDate = (value) => {
  if (!value) return "Not available";
  const parts = String(value).slice(0, 10).split("-");
  if (parts.length !== 3) return String(value);
  const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

const formatMoment = (date, time, isEnergy) => {
  const dateLabel = formatDate(date);
  if (isEnergy) return `${dateLabel} • Daily total`;
  return `${dateLabel}${time ? ` • ${time}` : ""}`;
};

export default function PSPComparisonBar({
  state,
  daily,
  high,
  unit,
  metric,
  dailyDate,
  dailyTime,
  highDate,
  highTime,
  labelWidth = "112px",
}) {
  const dailyValue = Number(daily || 0);
  const highValue = Number(high || 0);
  const pct = highValue > 0 ? Math.min(100, (dailyValue / highValue) * 100) : 0;
  const isEnergy = metric === "Energy";

  const tooltip = (
    <div className="psp-comparison-tooltip-content">
      <div className="psp-comparison-tooltip-title">{state} — {metric}</div>
      <div className="psp-comparison-tooltip-row">
        <span className="psp-comparison-tooltip-dot is-daily" />
        <div>
          <strong>Yesterday: {numberFormat.format(dailyValue)} {unit}</strong>
          <span>{formatMoment(dailyDate, dailyTime, isEnergy)}</span>
        </div>
      </div>
      <div className="psp-comparison-tooltip-row">
        <span className="psp-comparison-tooltip-dot is-high" />
        <div>
          <strong>So far highest: {numberFormat.format(highValue)} {unit}</strong>
          <span>{formatMoment(highDate, highTime, isEnergy)}</span>
        </div>
      </div>
    </div>
  );

  return (
    <Tooltip
      arrow
      placement="top"
      title={tooltip}
      enterDelay={120}
      slotProps={{
        tooltip: { sx: { p: 0, maxWidth: "none", bgcolor: "transparent" } },
        arrow: { sx: { color: "#08103A" } },
      }}
    >
      <div
        className="psp-comparison-row"
        style={{ gridTemplateColumns: `${labelWidth} minmax(0, 1fr) 118px` }}
        tabIndex={0}
        aria-label={`${state} ${metric} comparison`}
      >
      <div className="psp-comparison-label" title={state}>
        {state === "WEST BENGAL" ? "W. Bengal" : state}
      </div>

      <div className="psp-comparison-track">
        <div className="psp-comparison-fill" style={{ width: `${pct}%` }} />
        <span className="psp-comparison-high-label">{numberFormat.format(highValue)} {unit}</span>
      </div>

      <div className="psp-comparison-values">
        {numberFormat.format(dailyValue)} / {numberFormat.format(highValue)} {unit}
      </div>

      </div>
    </Tooltip>
  );
}
