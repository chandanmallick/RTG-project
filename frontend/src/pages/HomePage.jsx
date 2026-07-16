import { useEffect, useMemo, useState } from "react";
import { Box, Button, Paper, Typography } from "@mui/material";
import { Activity, ArrowRight, BarChart3, Building2, Clock3, Gauge, RefreshCw, ShieldCheck, TrendingUp, Zap } from "lucide-react";
import AppShell from "../components/layout/AppShell";
import PSPFrequencyCheckTiles from "../components/ui/PSPFrequencyCheckTiles";
import PSPComparisonBar from "../components/ui/PSPComparisonBar";
import API from "../services/api";
import crewApi from "../crewLegacy/api";

const fmt = (value, digits = 0) => Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: digits, minimumFractionDigits: digits });

const pick = (obj, keys, fallback = "-") => {
  for (const key of keys) {
    if (obj && obj[key] !== undefined && obj[key] !== null && obj[key] !== "") return obj[key];
  }
  return fallback;
};

function SectionCard({ title, subtitle, icon: Icon, action, children, sx = {} }) {
  return (
    <Paper elevation={0} sx={{ p: 2.5, borderRadius: "24px", border: "1px solid #D7E4F6", boxShadow: "0 18px 44px rgba(15,23,42,0.08)", background: "#fff", ...sx }}>
      <Box sx={{ display: "flex", alignItems: "start", justifyContent: "space-between", gap: 2, mb: 1.5, flexWrap: "wrap" }}>
        <Box>
          <Typography sx={{ fontSize: 18, fontWeight: 900, color: "#0F172A", display: "flex", alignItems: "center", gap: 1 }}>
            {Icon ? <Icon size={18} color="#0057B7" /> : null}
            {title}
          </Typography>
          {subtitle ? <Typography sx={{ mt: 0.3, fontSize: 12, fontWeight: 650, color: "#64748B" }}>{subtitle}</Typography> : null}
        </Box>
        {action}
      </Box>
      {children}
    </Paper>
  );
}

const formatIsoLocal = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const addDays = (dateStr, amount) => {
  const date = new Date(`${dateStr}T00:00:00`);
  date.setDate(date.getDate() + amount);
  return formatIsoLocal(date);
};

export default function HomePage() {
  const [rtgRows, setRtgRows] = useState([]);
  const [duty, setDuty] = useState({ today: { Morning: [], Evening: [], Night: [] } });
  const [frequencyCheck, setFrequencyCheck] = useState(null);
  const [powerPositionRows, setPowerPositionRows] = useState([]);
  const [nldcRows, setNldcRows] = useState([]);
  const defaultNldcDemandEnd = formatIsoLocal(new Date(Date.now() - 24 * 60 * 60 * 1000));
  const defaultNldcDemandStart = addDays(defaultNldcDemandEnd, -30);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        const [liveRes, dutyRes, freqRes, powerPositionRes, nldcRes] = await Promise.allSettled([
          API.getRTGLiveData(),
          crewApi.get("/dashboard/duty-today-tomorrow"),
          API.getPspReportChecking(undefined, false),
          API.getPspPowerPosition(),
          API.getNldcDemandTrend(defaultNldcDemandStart, defaultNldcDemandEnd),
        ]);

        if (!alive) return;
        if (liveRes.status === "fulfilled" && liveRes.value?.success) setRtgRows(liveRes.value.data || []);
        if (dutyRes.status === "fulfilled") setDuty(dutyRes.value.data || { today: { Morning: [], Evening: [], Night: [] } });
        if (freqRes.status === "fulfilled" && freqRes.value?.success) setFrequencyCheck(freqRes.value.frequency_check || null);
        if (powerPositionRes.status === "fulfilled" && powerPositionRes.value?.success) setPowerPositionRows(powerPositionRes.value.rows || []);
        if (nldcRes.status === "fulfilled" && nldcRes.value?.success) setNldcRows(nldcRes.value?.regions || []);
      } catch (err) {
        console.error("Homepage load failed:", err);
      }
    };

    load();
    return () => { alive = false; };
  }, []);

  const generationRows = useMemo(() => {
    const rows = rtgRows || [];
    const installed = rows.reduce((sum, row) => sum + Number(row.installed_capacity || 0), 0);
    const onBar = rows.reduce((sum, row) => sum + Number(row.cap_on_bar || 0), 0);
    const outage = rows.reduce((sum, row) => sum + Number(row.outage_capacity || row.outage || 0), 0);
    const plants = rows.length;
    const dc = rows.reduce((sum, row) => sum + Number(row.dc || 0), 0);
    const schedule = rows.reduce((sum, row) => sum + Number(row.schedule || 0), 0);
    const actual = rows.reduce((sum, row) => sum + Number(row.actual_gen || 0), 0);
    const unreq = rows.reduce((sum, row) => sum + Number(row.unreq_margin || 0), 0);
    return [
      { label: "Installed Capacity", value: installed, unit: "MW", icon: <Zap size={15} />, color: "#6366F1" },
      { label: "Capacity On Bar", value: onBar, unit: "MW", icon: <Activity size={15} />, color: "#16A34A" },
      { label: "Outage Capacity", value: outage, unit: "MW", icon: <ShieldCheck size={15} />, color: "#DC2626" },
      { label: "Plants", value: plants, unit: "Stations", icon: <Building2 size={15} />, color: "#F59E0B" },
      { label: "DC", value: dc, unit: "MW", icon: <BarChart3 size={15} />, color: "#0EA5E9" },
      { label: "Schedule", value: schedule, unit: "MW", icon: <Clock3 size={15} />, color: "#8B5CF6" },
      { label: "Actual Generation", value: actual, unit: "MW", icon: <TrendingUp size={15} />, color: "#10B981" },
      { label: "UnRequisition Power", value: unreq, unit: "MW", icon: <Zap size={15} />, color: "#F97316" },
    ];
  }, [rtgRows]);

  const nldcCards = useMemo(() => (Array.isArray(nldcRows) ? nldcRows.slice(0, 5) : []), [nldcRows]);

  return (
    <AppShell>
      <Box className="ui-kit-page" sx={{ display: "grid", gap: 2.5 }}>
        <Box sx={{
          p: 3,
          borderRadius: "24px",
          color: "#fff",
          background: "linear-gradient(135deg,#08103A 0%,#0057B7 52%,#0F6FDB 100%)",
          boxShadow: "0 18px 44px rgba(15,23,42,0.12)"
        }}>
          <Typography sx={{ fontSize: 28, fontWeight: 950, lineHeight: 1.05 }}>RTG Dashboard</Typography>
          <Typography sx={{ mt: 0.8, fontSize: 13, opacity: 0.86, fontWeight: 650 }}>
            One homepage for generation, crew, NLDC, frequency and PSP comparison views.
          </Typography>
        </Box>

        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", xl: "0.9fr 1.2fr 1.1fr" }, gap: 2.5 }}>
          <SectionCard title="Generation Snapshot" subtitle="Live operating snapshot" icon={Zap}>
            <Box sx={{ display: "grid", gap: 1 }}>
              {generationRows.map((row) => (
                <Box key={row.label} sx={{ display: "grid", gridTemplateColumns: "32px minmax(0,1fr) auto", gap: 1.2, alignItems: "center", py: 0.8, borderBottom: "1px solid #EEF2F7" }}>
                  <Box sx={{ width: 32, height: 32, borderRadius: "12px", display: "grid", placeItems: "center", color: row.color, background: `${row.color}14` }}>{row.icon}</Box>
                  <Typography sx={{ fontSize: 13, fontWeight: 850, color: "#334155" }}>{row.label}</Typography>
                  <Typography sx={{ fontSize: 13, fontWeight: 950, color: row.color, whiteSpace: "nowrap" }}>{fmt(row.value)} {row.unit}</Typography>
                </Box>
              ))}
            </Box>
          </SectionCard>

          <SectionCard title="Crew Management Dashboard" subtitle="Today duty assignments" icon={ShieldCheck}>
            {["Morning", "Evening", "Night"].map((shift) => (
              <Box key={shift} sx={{ mb: 1.5 }}>
                <Typography sx={{ fontSize: 13, fontWeight: 900, color: "#0F172A", mb: 0.75 }}>{shift}</Typography>
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
                  {(duty.today?.[shift] || []).map((person, idx) => (
                    <Box key={`${shift}-${idx}`} sx={{
                      px: 1.2, py: 0.7, borderRadius: "999px",
                      background: person?.isSIC ? "linear-gradient(135deg,#0057B7,#0F6FDB)" : "#EEF2FF",
                      color: person?.isSIC ? "#fff" : "#334155",
                      fontSize: 12, fontWeight: 800, border: person?.isSIC ? "1px solid rgba(255,255,255,0.2)" : "1px solid #D7E4F6"
                    }}>
                      {person?.isSIC ? `SIC ${person.name}` : (person?.name || "-")}
                    </Box>
                  ))}
                </Box>
              </Box>
            ))}
            <Box sx={{ display: "flex", justifyContent: "space-between", mt: 2, pt: 1.5, borderTop: "1px solid #EEF2F7", color: "#64748B", fontSize: 12 }}>
              <span>Tomorrow duty snapshot</span>
              <ArrowRight size={14} />
            </Box>
          </SectionCard>

          <SectionCard title="NLDC Data" subtitle="Last Day Demand trend & frequency Stat" icon={TrendingUp} action={
            <Button size="small" variant="outlined" href="/psp-dashboard" sx={{ borderRadius: "999px", textTransform: "none", fontWeight: 800 }}>Open PSP Dashboard</Button>
          }>
            <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 1 }}>
          {nldcCards.map((item, index) => (
                <Box key={item.key || item.label || index} sx={{ p: 1.2, borderRadius: "18px", border: "1px solid #D7E4F6", background: "#fff" }}>
                  <Typography sx={{ fontSize: 11, fontWeight: 900, color: "#334155", mb: 0.5 }}>{item.label || item.key || "Region"}</Typography>
                  <Typography sx={{ fontSize: 18, fontWeight: 950, color: "#0057B7" }}>
                    {fmt(pick(item, ["value", "max_demand", "demand", "peak"], 0))} MW
                  </Typography>
                  <Typography sx={{ fontSize: 10, fontWeight: 700, color: "#64748B", mt: 0.4 }}>
                    {pick(item, ["date", "max_date", "time", "max_time"], "-")}
                  </Typography>
                </Box>
              ))}
            </Box>
            <Box sx={{ mt: 2 }}>
              {frequencyCheck ? (
                <PSPFrequencyCheckTiles data={frequencyCheck} onOpenTrend={() => window.location.assign("/psp-dashboard")} />
              ) : (
                <Box sx={{ p: 2, borderRadius: "18px", border: "1px dashed #B8CCE3", textAlign: "center", color: "#64748B", fontSize: 13 }}>
                  Loading frequency check...
                </Box>
              )}
            </Box>
          </SectionCard>
        </Box>

        <SectionCard title="PSP State-wise Demand & Energy Comparison" subtitle="Yesterday is plotted on the same line as the so far highest record for each state." icon={Activity}>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", xl: "1fr 1fr" }, gap: 2 }}>
            {[
              { key: "demand", title: "State-wise Demand", dailyKey: "daily_demand", highKey: "all_time_demand", unit: "MW" },
              { key: "energy", title: "State-wise Energy", dailyKey: "daily_energy", highKey: "all_time_energy", unit: "MU" },
            ].map((panel) => (
              <Box key={panel.key} sx={{ p: 2, borderRadius: "18px", border: "1px solid #D7E4F6", background: "#fff" }}>
                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1.5 }}>
                  <Box>
                    <Typography sx={{ fontSize: 15, fontWeight: 900, color: "#0F172A" }}>{panel.title}</Typography>
                    <Typography sx={{ fontSize: 11.5, color: "#64748B", fontWeight: 650 }}>Full bar = so far highest, filled bar = yesterday</Typography>
                  </Box>
                  <Typography sx={{ fontSize: 11, fontWeight: 900, color: "#0057B7" }}>{panel.unit}</Typography>
                </Box>

                <Box sx={{ display: "grid", gap: 1.05, maxHeight: 380, overflow: "auto", pr: 0.5 }}>
                  {powerPositionRows.map((row) => (
                    <PSPComparisonBar
                      key={`${panel.key}-${row.constituent}`}
                      state={row.constituent}
                      daily={Number(row?.[panel.dailyKey] || 0)}
                      high={Number(row?.[panel.highKey] || 0)}
                      unit={panel.unit}
                      metric={panel.key === "demand" ? "Demand" : "Energy"}
                      dailyDate={row.daily_date || row.daily_energy_date}
                      dailyTime={panel.key === "demand" ? row.daily_demand_time : null}
                      highDate={panel.key === "demand" ? row.all_time_demand_date : row.all_time_energy_date}
                      highTime={panel.key === "demand" ? row.all_time_demand_time : null}
                      labelWidth="96px"
                    />
                  ))}
                </Box>
              </Box>
            ))}
          </Box>
        </SectionCard>
      </Box>
    </AppShell>
  );
}
