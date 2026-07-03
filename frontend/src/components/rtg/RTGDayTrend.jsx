import {
  Box,
  Paper,
  Typography
} from "@mui/material";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  Tooltip,
  XAxis
} from "recharts";

const formatMW = (value) =>
  Number(value || 0).toLocaleString(
    undefined,
    {
      maximumFractionDigits: 2
    }
  );

const getChangeText = (
  data,
  key
) => {

  const first = Number(
    data[0]?.[key] || 0
  );

  const latest = Number(
    data[data.length - 1]?.[key] || 0
  );

  if (!first) {

    return "Latest snapshot";
  }

  const change = (
    (latest - first) * 100 / first
  );

  const sign =
    change >= 0 ? "+" : "";

  return `${sign}${change.toFixed(1)}% from start`;
};

function TrendTile({
  title,
  value,
  data,
  dataKey,
  color,
  gradientId,
  dark = false,
  onClick,
  squareTrend = false
}) {

  return (

    <Box
      sx={{
        minHeight: 170,
        p: 2.2,
        borderRadius: "20px",
        overflow: "hidden",
        position: "relative",
        background: dark
          ? `linear-gradient(135deg,${color},#112830)`
          : "#fff",
        color: dark
          ? "#fff"
          : "#0F172A",
        border: dark
          ? "1px solid rgba(255,255,255,0.18)"
          : "1px solid #E2E8F0",
        boxShadow: dark
          ? "0 18px 34px rgba(15,23,42,0.20)"
          : "0 14px 30px rgba(15,23,42,0.08)",
        cursor: onClick
          ? "pointer"
          : "default",
        transition:
          "transform .18s ease, box-shadow .18s ease",
        "&:hover": onClick
          ? {
              transform:
                "translateY(-3px)",
              boxShadow: dark
                ? "0 22px 42px rgba(15,23,42,0.24)"
                : "0 18px 38px rgba(15,23,42,0.12)"
            }
          : {},
        "&:focus-visible": {
          outline:
            `3px solid ${color}44`,
          outlineOffset: 3
        }
      }}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(event) => {

        if (
          onClick &&
          (
            event.key === "Enter" ||
            event.key === " "
          )
        ) {

          event.preventDefault();
          onClick();
        }
      }}
    >

      <Box
        sx={{
          position: "relative",
          zIndex: 2
        }}
      >
        <Typography
          sx={{
            fontSize: 12,
            fontWeight: 850,
            color: dark
              ? "rgba(255,255,255,0.78)"
              : "#64748B"
          }}
        >
          {title}
        </Typography>

        <Typography
          sx={{
            mt: 0.6,
            fontSize: 27,
            lineHeight: 1,
            fontWeight: 950,
            letterSpacing: 0,
            color: dark
              ? "#fff"
              : "#0F172A"
          }}
        >
          {formatMW(value)}
        </Typography>

        <Typography
          sx={{
            mt: 0.8,
            fontSize: 11,
            fontWeight: 800,
            color: dark
              ? "rgba(255,255,255,0.72)"
              : color
          }}
        >
          {getChangeText(data, dataKey)}
        </Typography>
      </Box>

      <Box
        sx={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 75,
          zIndex: 1,
          overflow: "hidden"
        }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{
              top: 0,
              right: 0,
              left: 0,
              bottom: 0
            }}
          >
            <defs>
              <linearGradient
                id={gradientId}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop
                  offset="5%"
                  stopColor={color}
                  stopOpacity={dark ? 0.35 : 0.25}
                />
                <stop
                  offset="95%"
                  stopColor={color}
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>

            <XAxis dataKey="time" hide />

            <Tooltip
              formatter={(value) => `${formatMW(value)} MW`}
              labelFormatter={(label) => `Time: ${label}`}
              contentStyle={{
                background: dark ? "#1E293B" : "#fff",
                border: dark
                  ? "1px solid rgba(255,255,255,0.12)"
                  : "1px solid #E2E8F0",
                borderRadius: "8px",
                fontSize: "11px",
                fontWeight: 800,
                boxShadow: "0 4px 12px rgba(0,0,0,0.15)"
              }}
              itemStyle={{
                color: dark ? "#fff" : "#0F172A"
              }}
              labelStyle={{
                color: dark ? "rgba(255,255,255,0.78)" : "#64748B"
              }}
            />

            <Area
              type={squareTrend ? "step" : "monotone"}
              dataKey={dataKey}
              name={title}
              stroke={dark ? "#fff" : color}
              strokeWidth={3}
              fill={`url(#${gradientId})`}
              dot={false}
              activeDot={{
                r: 4,
                strokeWidth: 0
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </Box>
    </Box>
  );
}

export default function RTGDayTrend({ data = [], onOutageClick, onUnreqClick }) {
  const latest = data[data.length - 1] || {};
  return (
    <Paper
      elevation={0}
      sx={{
        height: "100%",
        minHeight: 460,
        p: 3,
        borderRadius: "24px",
        background: "linear-gradient(180deg,#FFFFFF 0%,#F8FAFC 100%)",
        border: "1px solid #E2E8F0",
        boxShadow: "0 18px 44px rgba(15,23,42,0.08)"
      }}
    >
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 2, mb: 2.5 }}>
        <Box>
          <Typography sx={{ fontSize: 21, fontWeight: 950, color: "#0F172A" }}>Day Trend</Typography>
          <Typography sx={{ mt: 0.6, fontSize: 13, fontWeight: 750, color: "#64748B" }}>Outage and UnRequisition Power</Typography>
        </Box>
        <Box sx={{ px: 1.4, py: 0.7, borderRadius: "999px", background: "#EFF6FF", color: "#2563EB", fontSize: 12, fontWeight: 900 }}>
          15 min snapshot
        </Box>
      </Box>
      {data.length > 0 ? (
        <Box sx={{ display: "grid", gridTemplateRows: "1fr 1fr", gap: 2.2, alignItems: "stretch" }}>
          <TrendTile
            title="Outage"
            value={latest.outage}
            data={data}
            dataKey="outage"
            color="#EF4444"
            gradientId="outageTrendFill"
            onClick={onOutageClick}
            squareTrend
          />
          <TrendTile
            title="UnRequisition Power"
            value={latest.unreqPower}
            data={data}
            dataKey="unreqPower"
            color="#0F4B2D"
            gradientId="unreqTrendFill"
            dark
            onClick={onUnreqClick}
          />
        </Box>
      ) : (
        <Box sx={{ height: 340, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "18px", background: "linear-gradient(135deg,#F8FAFC,#EEF2FF)", color: "#64748B", fontWeight: 850, textAlign: "center", px: 2 }}>
          Trend will appear after today's snapshots are available.
        </Box>
      )}
    </Paper>
  );
}
