import {
  Box,
  Card,
  CardContent,
  Typography
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
  "#10B981",
  "#EF4444"
];

const formatMW = (value) =>
  Number(value || 0).toLocaleString(
    undefined,
    {
      maximumFractionDigits: 2
    }
  );

export default function RTGCapacityPie({
  data = []
}) {

  const onBar =
    data.reduce(
      (a,b)=>a+(b.cap_on_bar||0),
      0
    );

  const outage =
    data.reduce(
      (a,b)=>
        a+
        (b.forced_outage||0)+
        (b.planned_outage||0)+
        (b.fuel_shortage||0)+
        (b.commercial_issues||0)+
        (b.rsd||0),
      0
    );

  const chartData = [
    {
      name:"Capacity On Bar",
      value:onBar
    },
    {
      name:"Outage",
      value:outage
    }
  ];

  return (

    <Card
      elevation={0}
      sx={{
        height: "100%",
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
            Capacity Breakup
          </Typography>

          <Typography
            sx={{
              mt: 0.5,
              fontSize: 13,
              fontWeight: 750,
              color: "#64748B"
            }}
          >
            On bar capacity against outage capacity
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
          >
            {chartData.map(
              (entry,index)=>(
                <Cell
                  key={index}
                  fill={COLORS[index]}
                />
              )
            )}
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
