import {
  Card,
  CardContent,
  Typography,
  Box
} from "@mui/material";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer
} from "recharts";

const COLORS = [
  "#EF4444",
  "#F97316",
  "#EAB308",
  "#8B5CF6",
  "#0EA5E9"
];

const formatMW = (value) =>
  Number(value || 0).toLocaleString(
    undefined,
    {
      maximumFractionDigits: 2
    }
  );

export default function RTGOutagePie({
  data = [], onViewDetails, onSliceClick
}) {

  const forced =
    data.reduce(
      (s, x) =>
        s + (x.forced_outage || 0),
      0
    );

  const planned =
    data.reduce(
      (s, x) =>
        s + (x.planned_outage || 0),
      0
    );

  const fuel =
    data.reduce(
      (s, x) =>
        s + (x.fuel_shortage || 0),
      0
    );

  const commercial =
    data.reduce(
      (s, x) =>
        s + (x.commercial_issues || 0),
      0
    );

  const rsd =
    data.reduce(
      (s, x) =>
        s + (x.rsd || 0),
      0
    );

  const chartData = [

    {
      name: "Forced",
      field: "forced_outage",
      value: forced
    },

    {
      name: "Planned",
      field: "planned_outage",
      value: planned
    },

    {
      name: "Fuel",
      field: "fuel_shortage",
      value: fuel
    },

    {
      name: "Commercial",
      field: "commercial_issues",
      value: commercial
    },

    {
      name: "RSD",
      field: "rsd",
      value: rsd
    }

  ].filter(
    item => item.value > 0
  );

  return (
    <Card
      elevation={0}
      sx={{
        borderRadius: "24px",
        height: "100%",
        background:
          "linear-gradient(180deg,#FFFFFF 0%,#F8FAFC 100%)",
        border:
          "1px solid #E2E8F0",
        boxShadow:
          "0 18px 44px rgba(15,23,42,0.08)"
      }}
    >
      <CardContent
        sx={{
          p: 3
        }}
      >

        <Box
          sx={{
            mb: 2.5
          }}
        >
          <Typography
            sx={{
              fontSize: 20,
              fontWeight: 950,
              color: "#0F172A"
            }}
          >
            Outage Category Breakdown
          </Typography>

          <Typography
            sx={{
              mt: 0.5,
              fontSize: 13,
              fontWeight: 750,
              color: "#64748B"
            }}
          >
            Click a slice for plant-level details
          </Typography>
        </Box>

        <ResponsiveContainer
          width="100%"
          height={400}
        >

          <PieChart>

            <Pie
              data={chartData}
              dataKey="value"
              innerRadius={92}
              outerRadius={148}
              paddingAngle={3}
              cornerRadius={10}
              onClick={(slice) => {

                onSliceClick?.(
                  slice?.field ||
                  slice?.payload?.field
                );

              }}
            >
              {chartData.map((entry,index)=>(
                <Cell
                  key={index}
                  fill={COLORS[index]}
                />
              ))}
            </Pie>

            <Tooltip
              formatter={(value) =>
                `${formatMW(value)} MW`
              }
              contentStyle={{
                borderRadius: 16,
                border:
                  "1px solid #E2E8F0",
                boxShadow:
                  "0 16px 36px rgba(15,23,42,0.14)"
              }}
            />

            <Legend
              iconType="circle"
              wrapperStyle={{
                fontSize: 12,
                fontWeight: 800
              }}
            />

          </PieChart>

        </ResponsiveContainer>

      </CardContent>
    </Card>
  );
}
