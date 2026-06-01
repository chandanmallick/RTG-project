import {
  Box,
  Card,
  CardContent,
  Typography
} from "@mui/material";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell
} from "recharts";

const formatMW = (value) =>
  Number(value || 0).toLocaleString(
    undefined,
    {
      maximumFractionDigits: 2
    }
  );

export default function CapacityOnBarChart({
  data = []
}) {

  const chartData = [...data]
    .sort(
      (a, b) =>
        (b.cap_on_bar || 0) -
        (a.cap_on_bar || 0)
    )
    .slice(0, 15);

  return (
    <Card
      elevation={0}
      sx={{
        borderRadius: "24px",
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
            Capacity On Bar
          </Typography>

          <Typography
            sx={{
              mt: 0.5,
              fontSize: 13,
              fontWeight: 750,
              color: "#64748B"
            }}
          >
            Top 15 generating stations
          </Typography>
        </Box>

        <ResponsiveContainer
          width="100%"
          height={420}
        >
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{
              top: 8,
              right: 28,
              left: 8,
              bottom: 8
            }}
          >
            <CartesianGrid
              stroke="#E2E8F0"
              strokeDasharray="4 8"
              horizontal={false}
            />

            <XAxis
              type="number"
              axisLine={false}
              tickLine={false}
              tick={{
                fontSize: 12,
                fill: "#64748B",
                fontWeight: 700
              }}
            />

            <YAxis
              dataKey="plant_name"
              type="category"
              width={210}
              axisLine={false}
              tickLine={false}
              tick={{
                fontSize: 12,
                fill: "#475569",
                fontWeight: 800
              }}
            />

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

            <Bar
              dataKey="cap_on_bar"
              radius={[0, 10, 10, 0]}
              barSize={18}
            >
              {chartData.map(
                (entry,index) => (
                  <Cell
                    key={entry.plant_id || index}
                    fill={
                      index < 5
                        ? "#10B981"
                        : "#60A5FA"
                    }
                  />
                )
              )}
            </Bar>
          </BarChart>
        </ResponsiveContainer>

      </CardContent>
    </Card>
  );
}
