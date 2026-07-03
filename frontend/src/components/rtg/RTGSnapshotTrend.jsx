import {
  Box,
  Paper,
  TextField,
  Typography
} from "@mui/material";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";

const formatMW = (value) =>
  Number(value || 0).toLocaleString(
    undefined,
    {
      maximumFractionDigits: 2
    }
  );

const getLatestValue = (
  rows,
  key
) => {

  if (!rows.length)
    return 0;

  return Number(
    rows[rows.length - 1]?.[key] || 0
  );
};

const MetricPill = ({
  label,
  value,
  color
}) => (
  <Box
    sx={{
      px: 1.2,
      py: 0.8,
      borderRadius: "14px",
      background: `${color}12`,
      border: `1px solid ${color}26`,
      minWidth: 0
    }}
  >
    <Typography
      sx={{
        fontSize: 10,
        fontWeight: 900,
        color: "#64748B",
        textTransform: "uppercase",
        whiteSpace: "nowrap"
      }}
    >
      {label}
    </Typography>

    <Typography
      sx={{
        mt: 0.3,
        fontSize: 14,
        fontWeight: 950,
        color,
        whiteSpace: "nowrap"
      }}
    >
      {formatMW(value)} MW
    </Typography>
  </Box>
);

export default function RTGSnapshotTrend({
  date,
  data = [],
  loading = false,
  onDateChange
}) {

  const metrics = [
    {
      label: "Cap On Bar",
      key: "cap_on_bar",
      color: "#475569"
    },
    {
      label: "DC",
      key: "dc",
      color: "#2563EB"
    },
    {
      label: "Schedule",
      key: "schedule",
      color: "#7C3AED"
    },
    {
      label: "Actual Gen",
      key: "actual_gen",
      color: "#059669"
    },
    {
      label: "DC - Schedule",
      key: "dc_schedule_difference",
      color: "#F97316"
    }
  ];

  return (
    <Paper
      elevation={0}
      sx={{
        mb: 3,
        p: 2.2,
        borderRadius: "24px",
        background:
          "linear-gradient(180deg,#FFFFFF 0%,#F8FAFC 100%)",
        border: "1px solid #E2E8F0",
        boxShadow:
          "0 18px 44px rgba(15,23,42,0.08)"
      }}
    >
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: {
            xs: "stretch",
            md: "center"
          },
          flexDirection: {
            xs: "column",
            md: "row"
          },
          gap: 1.5,
          mb: 1.6
        }}
      >
        <Box>
          <Typography
            sx={{
              fontSize: 20,
              fontWeight: 950,
              color: "#0F172A"
            }}
          >
            Previous Day Snapshot
          </Typography>

          <Typography
            sx={{
              mt: 0.35,
              fontSize: 12,
              fontWeight: 750,
              color: "#64748B"
            }}
          >
            Sum from rtg_dashboard_snapshot | dotted lines in MW, orange area is DC - Schedule
          </Typography>
        </Box>

        <TextField
          type="date"
          size="small"
          value={date || ""}
          onChange={(event) =>
            onDateChange?.(
              event.target.value
            )
          }
          InputProps={{
            startAdornment: (
              <CalendarMonthRoundedIcon
                sx={{
                  mr: 1,
                  fontSize: 18,
                  color: "#03624C"
                }}
              />
            )
          }}
          sx={{
            minWidth: {
              xs: "100%",
              sm: 190
            },
            "& .MuiOutlinedInput-root": {
              borderRadius: "14px",
              background: "#FFFFFF",
              fontWeight: 800
            }
          }}
        />
      </Box>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr 1fr",
            md: "repeat(5, minmax(0,1fr))"
          },
          gap: 1,
          mb: 1.8
        }}
      >
        {metrics.map((metric) => (
          <MetricPill
            key={metric.key}
            label={metric.label}
            value={getLatestValue(
              data,
              metric.key
            )}
            color={metric.color}
          />
        ))}
      </Box>

      <Box
        sx={{
          height: {
            xs: 330,
            md: 390
          },
          borderRadius: "18px",
          background: "#FFFFFF",
          border: "1px solid #EEF2F7",
          overflow: "hidden",
          p: 1
        }}
      >
        {data.length > 0 ? (
          <ResponsiveContainer
            width="100%"
            height="100%"
          >
            <ComposedChart
              data={data}
              margin={{
                top: 14,
                right: 42,
                bottom: 10,
                left: 8
              }}
            >
              <defs>
                <linearGradient
                  id="dcScheduleDifferenceFill"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="5%"
                    stopColor="#F97316"
                    stopOpacity={0.35}
                  />
                  <stop
                    offset="95%"
                    stopColor="#F97316"
                    stopOpacity={0.03}
                  />
                </linearGradient>
              </defs>

              <CartesianGrid
                stroke="#E2E8F0"
                strokeDasharray="4 4"
                vertical={false}
              />

              <XAxis
                dataKey="time"
                tick={{
                  fontSize: 11,
                  fill: "#64748B",
                  fontWeight: 700
                }}
                minTickGap={18}
                axisLine={{
                  stroke: "#CBD5E1"
                }}
                tickLine={false}
              />

              <YAxis
                yAxisId="mw"
                tick={{
                  fontSize: 11,
                  fill: "#475569",
                  fontWeight: 700
                }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(value) =>
                  formatMW(value)
                }
                label={{
                  value: "MW",
                  angle: -90,
                  position: "insideLeft",
                  fill: "#64748B",
                  fontSize: 11,
                  fontWeight: 900
                }}
              />

              <YAxis
                yAxisId="diff"
                orientation="right"
                tick={{
                  fontSize: 11,
                  fill: "#F97316",
                  fontWeight: 800
                }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(value) =>
                  formatMW(value)
                }
                label={{
                  value: "DC - Schedule",
                  angle: 90,
                  position: "insideRight",
                  fill: "#F97316",
                  fontSize: 11,
                  fontWeight: 900
                }}
              />

              <Tooltip
                formatter={(value, name) => [
                  `${formatMW(value)} MW`,
                  name
                ]}
                labelFormatter={(label) =>
                  `Snapshot time: ${label}`
                }
                contentStyle={{
                  borderRadius: 14,
                  border: "1px solid #E2E8F0",
                  boxShadow:
                    "0 16px 36px rgba(15,23,42,0.14)",
                  fontSize: 12,
                  fontWeight: 800
                }}
              />

              <Legend
                iconType="plainline"
                wrapperStyle={{
                  fontSize: 12,
                  fontWeight: 850,
                  color: "#475569"
                }}
              />

              <Area
                yAxisId="diff"
                type="monotone"
                dataKey="dc_schedule_difference"
                name="DC - Schedule"
                stroke="#F97316"
                fill="url(#dcScheduleDifferenceFill)"
                strokeWidth={2}
                dot={false}
              />

              <Line
                yAxisId="mw"
                type="monotone"
                dataKey="cap_on_bar"
                name="Cap On Bar"
                stroke="#475569"
                strokeWidth={2.4}
                strokeDasharray="2 5"
                dot={false}
              />

              <Line
                yAxisId="mw"
                type="monotone"
                dataKey="dc"
                name="DC"
                stroke="#2563EB"
                strokeWidth={2.4}
                strokeDasharray="2 5"
                dot={false}
              />

              <Line
                yAxisId="mw"
                type="monotone"
                dataKey="schedule"
                name="Schedule"
                stroke="#7C3AED"
                strokeWidth={2.4}
                strokeDasharray="2 5"
                dot={false}
              />

              <Line
                yAxisId="mw"
                type="monotone"
                dataKey="actual_gen"
                name="Actual Generation"
                stroke="#059669"
                strokeWidth={2.4}
                strokeDasharray="2 5"
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <Box
            sx={{
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              color: "#64748B",
              fontWeight: 850,
              px: 2
            }}
          >
            {
              loading
                ? "Loading snapshot trend..."
                : "No RTG snapshot data found for the selected date."
            }
          </Box>
        )}
      </Box>
    </Paper>
  );
}
