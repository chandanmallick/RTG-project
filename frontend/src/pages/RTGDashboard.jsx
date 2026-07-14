import { useEffect, useState } from "react";
import axios from "axios";

import {
  Box,
  Grid,
  Typography,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Paper,
  TableContainer,
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Autocomplete,
  TextField,
  Chip,
  Tabs,
  Tab,
} from "@mui/material";

import AppShell from "../components/layout/AppShell";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import VisibilityRoundedIcon from "@mui/icons-material/VisibilityRounded";

import GlassCard from "../components/ui/GlassCard";
import SectionAccordion from "../components/ui/SectionAccordion";

import BoltRoundedIcon from "@mui/icons-material/BoltRounded";
import FactoryRoundedIcon from "@mui/icons-material/FactoryRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import ElectricBoltRoundedIcon from "@mui/icons-material/ElectricBoltRounded";
import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";
import InsightsRoundedIcon from "@mui/icons-material/InsightsRounded";

import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Database,
  Radio,
} from "lucide-react";

import API from "../services/api";

import RTGCapacityPie from "../components/rtg/RTGCapacityPie";
import RTGOutagePie from "../components/rtg/RTGOutagePie";
import CapacityOnBarChart from "../components/rtg/CapacityOnBarChart";
import RTGDayTrend from "../components/rtg/RTGDayTrend";
import RTGSnapshotTrend from "../components/rtg/RTGSnapshotTrend";

import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip
} from "recharts";

import GradientButton from "../components/ui/GradientButton";

import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";

import { showModernPopup } from "../components/ui/ModernPopup";

const PIPELINE_API = API.apiBaseUrl;

const getPreviousDateString = () => {

  const date = new Date();

  date.setDate(
    date.getDate() - 1
  );

  const year =
    date.getFullYear();

  const month =
    String(date.getMonth() + 1)
      .padStart(2, "0");

  const day =
    String(date.getDate())
      .padStart(2, "0");

  return `${year}-${month}-${day}`;
};

function PipelineRow({ icon, label, value }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, color: "#7b8199" }}>
        {icon}
        <Typography sx={{ fontSize: 14 }}>{label}</Typography>
      </Box>
      <Typography sx={{ fontWeight: 700, color: "#1e1b39", fontSize: 14 }}>{value}</Typography>
    </Box>
  );
}

export default function RTGDashboard() {

  useEffect(() => {
    loadData();
    loadTrendData();
    loadSnapshotTrend();
    loadPipelineStatus();
  }, []);

  const [data, setData] = useState([]);

  const [trendData, setTrendData] =
    useState([]);

  const [snapshotTrendDate, setSnapshotTrendDate] =
    useState(getPreviousDateString());

  const [snapshotTrendData, setSnapshotTrendData] =
    useState([]);

  const [snapshotTrendLoading, setSnapshotTrendLoading] =
    useState(false);

  const [loading, setLoading] = useState(false);

  const [pipelineStatus, setPipelineStatus] = useState([]);

  // Pipeline Monitor state
  const [selectedPipeline, setSelectedPipeline] = useState(null);
  const [openLogs, setOpenLogs] = useState(false);
  const [pipelineLogs, setPipelineLogs] = useState([]);
  const [pipelineTab, setPipelineTab] = useState(0);

  const [selectedFilters, setSelectedFilters] = useState([]);

  const [showOutageDialog, setShowOutageDialog] = useState(false);

  const [showUnreqDialog, setShowUnreqDialog] = useState(false);

  const [showOutageSummaryDialog, setShowOutageSummaryDialog] = useState(false);

  const [showOutageCategoryDialog, setShowOutageCategoryDialog] = useState(false);

  const [selectedCategory, setSelectedCategory] = useState(null);

  const filteredData =

    selectedFilters.length === 0

      ? data

      : data.filter((row) => {

          return selectedFilters.some(
            (filter) => {

              // ISGS

              if (filter === "ISGS") {

                return (
                  row.utility_type ===
                  "ISGS"
                );
              }

              // IPP

              if (filter === "IPP") {

                return (
                  row.utility_type ===
                  "IPP"
                );
              }

              // STATES

              const isStateUtility =

                row.utility_type === "State" ||

                row.utility_type === "STATE" ||

                row.utility_type === "State_IPP" ||

                row.utility_type === "STATE_IPP";

              if (
                filter === "WEST_BENGAL"
              ) {

                return (

                  isStateUtility &&

                  row.state_name?.trim() ===
                  "West Bengal"

                );
              }

              if (filter === "DVC") {

                return (

                  isStateUtility &&

                  row.state_name?.trim() ===
                  "DVC"

                );
              }

              if (filter === "BIHAR") {

                return (

                  isStateUtility &&

                  row.state_name?.trim() ===
                  "Bihar"

                );
              }

              if (filter === "JHARKHAND") {

                return (

                  isStateUtility &&

                  row.state_name?.trim() ===
                  "Jharkhand"

                );
              }

              if (filter === "ODISHA") {

                return (

                  isStateUtility &&

                  row.state_name?.trim() ===
                  "Odisha"

                );
              }

              return false;

            }
          );

      });

  const loadData = async () => {

    const res =
      await API.getRTGLiveData();

    if (res.success) {

      setData(
        res.data || []
      );
    }
  };

  const loadTrendData = async () => {

    try {

      const res =
        await API.getRTGTodayTrend();

      if (res.success) {

        setTrendData(
          res.data || []
        );
      }

    } catch (err) {

      setTrendData([]);
    }
  };

  const loadSnapshotTrend = async (
    dateStr = snapshotTrendDate
  ) => {

    try {

      setSnapshotTrendLoading(true);

      const res =
        await API.getRTGSnapshotTrend(
          dateStr
        );

      if (res.success) {

        if (
          res.date &&
          res.date !== dateStr
        ) {

          setSnapshotTrendDate(
            res.date
          );
        }

        setSnapshotTrendData(
          res.records || []
        );
      } else {

        setSnapshotTrendData([]);
      }

    } catch (err) {

      setSnapshotTrendData([]);

    } finally {

      setSnapshotTrendLoading(false);
    }
  };

  const handleSnapshotTrendDateChange = (
    dateStr
  ) => {

    setSnapshotTrendDate(dateStr);
    loadSnapshotTrend(dateStr);
  };

  const loadPipelineStatus = async () => {
    try {
      const res = await API.getPipelineStatus();
      if (res.success) {
        setPipelineStatus(res.data || []);
      }
    } catch (err) {
      setPipelineStatus([]);
    }
  };

  const triggerPipeline = async (type) => {
    try {
      await axios.post(`${PIPELINE_API}/pipeline/run/${type}`);
      loadPipelineStatus();
    } catch (err) {
      console.error(err);
    }
  };

  const fetchLogs = async (revisionId, pipeline) => {
    try {
      const res = await axios.get(
        `${PIPELINE_API}/pipeline/logs/${pipeline.pipeline}/${revisionId}`
      );
      setPipelineLogs(res.data.logs || []);
      setSelectedPipeline(pipeline);
      setPipelineTab(0);
      setOpenLogs(true);
    } catch (err) {
      console.error(err);
    }
  };

  const renderPipelineTable = (data) => {
    if (!data || !data.length)
      return <Typography sx={{ color: "#64748b", fontSize: 14 }}>No Data Available</Typography>;
    const columns = Object.keys(data[0]);
    return (
      <Box sx={{ maxHeight: 420, overflow: "auto", borderRadius: "14px", border: "1px solid rgba(0,0,0,0.07)", background: "#fff" }}>
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
          <thead>
            <tr>
              {columns.map(col => (
                <th key={col} style={{ position: "sticky", top: 0, zIndex: 10, background: "#f8faff", padding: "12px 14px", textAlign: "left", fontWeight: 700, fontSize: 12, color: "#334155", borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
                  {col.replaceAll("_", " ").toUpperCase()}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, index) => (
              <tr key={index}>
                {columns.map(col => (
                  <td key={col} style={{ padding: "10px 14px", borderBottom: "1px solid rgba(0,0,0,0.05)", fontSize: 12, color: col === "status" ? (row[col] === "SUCCESS" ? "#16a34a" : "#dc2626") : "#475569", fontWeight: col === "status" ? 700 : 400, whiteSpace: "nowrap" }}>
                    {typeof row[col] === "object" ? JSON.stringify(row[col]) : String(row[col])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Box>
    );
  };


  const installed =
    filteredData.reduce(
      (a, b) =>
        a + (b.installed_capacity || 0),
      0
    );

  const onBar =
    filteredData.reduce(
      (a, b) =>
        a + (b.cap_on_bar || 0),
      0
    );

  const outage =
    filteredData.reduce(
      (a, b) =>
        a +
        (b.forced_outage || 0) +
        (b.planned_outage || 0) +
        (b.fuel_shortage || 0) +
        (b.commercial_issues || 0) +
        (b.rsd || 0),
      0
    );

    const FILTER_OPTIONS = [

      {label:"ISGS", value:"ISGS"},

      {label:"IPP", value:"IPP"},

      {label:"West Bengal", value:"WEST_BENGAL"},

      {label:"DVC", value:"DVC"},

      {label:"Bihar", value:"BIHAR"},

      {label:"Jharkhand", value:"JHARKHAND"},

      {label:"Odisha",  value:"ODISHA"}
    ];



    const refreshRTGData =
        async () => { console.log("RTG refresh clicked");

            try {

            setLoading(true);

            const res =
                await API.refreshRTGDashboard();

            if(res.success){

                showModernPopup({

                type:"success",

                title:"RTG Dashboard",

                subtitle:
                    "Latest data fetched"
                });

                await loadData();

                await loadTrendData();

                await loadSnapshotTrend();

                await loadPipelineStatus();
            }

            } catch(err){

            showModernPopup({

                type:"error",

                title:"RTG Dashboard",

                subtitle:
                "Fetch failed"
            });
            }
            finally{

            setLoading(false);
            }
        };

    const selectedPlants =

      data.filter((row) => {

        if (!selectedCategory)
          return false;

        const value =
          row[
            selectedCategory
          ];

        return Number(value || 0) > 0;
      });

    const totalDC = filteredData.reduce(
      (sum,row) =>
        sum + Number(row.dc || 0),
      0
    );

    const totalSchedule = filteredData.reduce(
      (sum,row) =>
        sum + Number(row.schedule || 0),
      0
    );

    const totalGeneration = filteredData.reduce(
      (sum,row) =>
        sum + Number(
          row.actual_gen || 0
        ),
      0
    );

    const totalRequisition = filteredData.reduce(
      (sum,row) =>
        sum + Number(
          row.unreq_margin || 0
        ),
      0
    );

    const unreqRows = filteredData
      .filter(
        row =>
          Number(row.unreq_margin || 0) > 0
      )
      .map(row => ({
        plant:
          row.station_name ||
          row.station ||
          row.plant_name ||
          "-",
        capacityOnBar:
          Number(row.cap_on_bar || 0),
        dc:
          Number(row.dc || 0),
        schedule:
          Number(row.schedule || 0),
        actualGen:
          Number(row.actual_gen || 0),
        unreqPower:
          Number(row.unreq_margin || 0)
      }))
      .sort(
        (a,b) =>
          a.unreqPower - b.unreqPower
      );

    const outageSummaryRows = filteredData
      .map(row => {

        const forced =
          Number(row.forced_outage || 0);

        const planned =
          Number(row.planned_outage || 0);

        const fuel =
          Number(row.fuel_shortage || 0);

        const commercial =
          Number(row.commercial_issues || 0);

        const rsd =
          Number(row.rsd || 0);

        return {
          plant:
            row.station_name ||
            row.station ||
            row.plant_name ||
            "-",
          capacityOnBar:
            Number(row.cap_on_bar || 0),
          planned,
          forced,
          fuel,
          commercial,
          rsd,
          total:
            forced +
            planned +
            fuel +
            commercial +
            rsd
        };
      })
      .filter(
        row =>
          row.total > 0
      )
      .sort(
        (a,b) =>
          b.total - a.total
      );

    const unreqColumns = [
      {
        label: "Plant",
        key: "plant",
        align: "left"
      },
      {
        label: "Capacity on Bar",
        key: "capacityOnBar"
      },
      {
        label: "DC",
        key: "dc"
      },
      {
        label: "Schedule",
        key: "schedule"
      },
      {
        label: "Actual Gen",
        key: "actualGen"
      },
      {
        label: "UnRequisition Power",
        key: "unreqPower"
      }
    ];

    const outageSummaryColumns = [
      {
        label: "Plant",
        key: "plant",
        align: "left"
      },
      {
        label: "Capacity on Bar",
        key: "capacityOnBar"
      },
      {
        label: "Planned",
        key: "planned"
      },
      {
        label: "Forced",
        key: "forced"
      },
      {
        label: "Fuel Shortage",
        key: "fuel"
      },
      {
        label: "Commercial",
        key: "commercial"
      },
      {
        label: "RSD",
        key: "rsd"
      },
      {
        label: "Total Outage",
        key: "total"
      }
    ];

    const formatMW = (value) =>
      Number(value || 0).toLocaleString(
        undefined,
        {
          maximumFractionDigits: 2
        }
      );

    const parseUpdateTime = (value) => {

      if (!value)
        return null;

      const normalized =
        String(value).replace(" ", "T");

      const parsed =
        new Date(normalized);

      return Number.isNaN(
        parsed.getTime()
      )
        ? null
        : parsed;
    };

    const getLatestUpdateTime = (
      rows,
      field
    ) => {

      return rows.reduce(
        (latest,row) => {

          const current =
            parseUpdateTime(row[field]);

          if (!current)
            return latest;

          if (
            !latest ||
            current > latest
          ) {

            return current;
          }

          return latest;

        },
        null
      );
    };

    const formatUpdateTime = (date) => {

      if (!date)
        return "Not available";

      return date.toLocaleString(
        "en-IN",
        {
          day: "2-digit",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false
        }
      );
    };

    const isStaleUpdate = (date) => {

      if (!date)
        return true;

      return (
        Date.now() - date.getTime()
      ) > 60 * 60 * 1000;
    };

    const actualLastUpdated =
      getLatestUpdateTime(
        data,
        "actual_last_updated"
      );

    const actualUpdateStale =
      isStaleUpdate(actualLastUpdated);

    const getRowsForFilter = (filter) =>
      data.filter((row) => {

        if (filter === "ISGS") {

          return row.utility_type === "ISGS";
        }

        if (filter === "IPP") {

          return row.utility_type === "IPP";
        }

        const isStateUtility =
          row.utility_type === "State" ||
          row.utility_type === "STATE" ||
          row.utility_type === "State_IPP" ||
          row.utility_type === "STATE_IPP";

        const stateMap = {
          WEST_BENGAL: "West Bengal",
          DVC: "DVC",
          BIHAR: "Bihar",
          JHARKHAND: "Jharkhand",
          ODISHA: "Odisha"
        };

        return (
          isStateUtility &&
          row.state_name?.trim() ===
            stateMap[filter]
        );
      });

    const scheduleUpdateRows =
      FILTER_OPTIONS.map(option => {

        const rows =
          getRowsForFilter(option.value);

        const updatedAt =
          getLatestUpdateTime(
            rows,
            "schedule_last_updated"
          );

        return {
          label: option.label,
          count: rows.length,
          updatedAt,
          stale:
            isStaleUpdate(updatedAt)
        };
      });

    const getPipelineColor = (status) =>
      status === "SUCCESS"
        ? "#16A34A"
        : "#DC2626";

    const getPipelineFailures = (pipeline) => {

      const failed =
        pipeline?.response_data
          ?.failed_plants || [];

      return failed
        .slice(0, 3)
        .map(item =>
          item.plant_id ||
          item.plant_name ||
          "-"
        )
        .join(", ");
    };

    const outageCategoryRows = [
      {
        name: "Forced",
        value: filteredData.reduce(
          (a,b)=>
            a + Number(b.forced_outage || 0),
          0
        ),
        color: "#EF4444"
      },
      {
        name: "Planned",
        value: filteredData.reduce(
          (a,b)=>
            a + Number(b.planned_outage || 0),
          0
        ),
        color: "#F97316"
      },
      {
        name: "Fuel",
        value: filteredData.reduce(
          (a,b)=>
            a + Number(b.fuel_shortage || 0),
          0
        ),
        color: "#EAB308"
      },
      {
        name: "Commercial",
        value: filteredData.reduce(
          (a,b)=>
            a + Number(b.commercial_issues || 0),
          0
        ),
        color: "#8B5CF6"
      },
      {
        name: "RSD",
        value: filteredData.reduce(
          (a,b)=>
            a + Number(b.rsd || 0),
          0
        ),
        color: "#0EA5E9"
      }
    ].filter(
      row => row.value > 0
    );

    const systemHealthRows = [
      {
        label: "Installed Capacity",
        value: installed,
        unit: "MW",
        icon: <BoltRoundedIcon />,
        color: "#6C63FF"
      },
      {
        label: "Capacity On Bar",
        value: onBar,
        unit: "MW",
        icon: <ElectricBoltRoundedIcon />,
        color: "#22C55E"
      },
      {
        label: "Outage Capacity",
        value: outage,
        unit: "MW",
        icon: <WarningAmberRoundedIcon />,
        color: "#EF4444",
        onClick: () =>
          setShowOutageSummaryDialog(true)
      },
      {
        label: "Plants",
        value: filteredData.length,
        unit: "Stations",
        icon: <FactoryRoundedIcon />,
        color: "#F59E0B"
      },
      {
        label: "DC",
        value: totalDC,
        unit: "MW",
        icon: <BoltRoundedIcon />,
        color: "#0EA5E9"
      },
      {
        label: "Schedule",
        value: totalSchedule,
        unit: "MW",
        icon: <CalendarMonthRoundedIcon />,
        color: "#8B5CF6"
      },
      {
        label: "Actual Generation",
        value: totalGeneration,
        unit: "MW",
        icon: <InsightsRoundedIcon />,
        color: "#10B981"
      },
      {
        label: "UnRequisition Power",
        value: totalRequisition,
        unit: "MW",
        icon: <ElectricBoltRoundedIcon />,
        color: "#F59E0B",
        onClick: () =>
          setShowUnreqDialog(true)
      }
    ];

  return (

    <AppShell>

      <GlassCard
        sx={{
          mb: 1.8,
          p: 2,
          background:
            "linear-gradient(135deg, #022726 0%, #03624C 50%, #17876D 100%)",
          color: "#fff",
        }}
      >

        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 2,
            flexDirection: {
              xs: "column",
              md: "row"
            }
          }}
        >

          <Box sx={{ display: "flex", alignItems: "center", gap: 2.5, flexWrap: "wrap" }}>
            <Typography
              sx={{
                fontSize: 24,
                fontWeight: 800,
                lineHeight: 1,
                letterSpacing: "-0.02em"
              }}
            >
              RTG Dashboard
            </Typography>

            <Box
              sx={{
                display: "flex",
                flexWrap: "wrap",
                gap: 1.2,
                "@keyframes updatePulse": {
                  "0%": {
                    boxShadow:
                      "0 0 0 0 rgba(239,68,68,0.48)"
                  },
                  "70%": {
                    boxShadow:
                      "0 0 0 8px rgba(239,68,68,0)"
                  },
                  "100%": {
                    boxShadow:
                      "0 0 0 0 rgba(239,68,68,0)"
                  }
                }
              }}
            >

              {[
                {
                  label:
                    "Actual Last Updated",
                  value:
                    formatUpdateTime(
                      actualLastUpdated
                    ),
                  stale:
                    actualUpdateStale
                }
              ].map(item => (

                <Box
                  key={item.label}
                  sx={{
                    px: 1.5,
                    py: 0.9,
                    borderRadius: "999px",
                    display: "flex",
                    alignItems: "center",
                    gap: 0.9,
                    background:
                      item.stale
                        ? "rgba(254,242,242,0.96)"
                        : "rgba(255,255,255,0.16)",
                    color:
                      item.stale
                        ? "#DC2626"
                        : "#fff",
                    border:
                      item.stale
                        ? "1px solid rgba(248,113,113,0.55)"
                        : "1px solid rgba(255,255,255,0.22)",
                    backdropFilter:
                      "blur(14px)",
                    animation:
                      item.stale
                        ? "updatePulse 1.4s infinite"
                        : "none"
                  }}
                >
                  <Typography
                    sx={{
                      fontSize: 11,
                      fontWeight: 850,
                      opacity:
                        item.stale
                          ? 1
                          : 0.82
                    }}
                  >
                    {item.label}
                  </Typography>

                  <Typography
                    sx={{
                      fontSize: 12,
                      fontWeight: 950,
                      whiteSpace: "nowrap"
                    }}
                  >
                    {item.value}
                  </Typography>
                </Box>

              ))}

            </Box>
          </Box>

          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: {
                xs: "flex-start",
                md: "flex-end"
              },
              gap: 1.5,
              flexWrap: "wrap",
              maxWidth: {
                xs: "100%",
                md: 620
              }
            }}
          >

            <Autocomplete
              multiple
              size="small"
              sx={{
                width: {
                  xs: "100%",
                  sm: 360
                },

                "& .MuiOutlinedInput-root": {

                  borderRadius: "16px",

                  background:
                    "rgba(255,255,255,0.9)",

                  backdropFilter:
                    "blur(10px)"
                }
              }}
              options={FILTER_OPTIONS}
              value={FILTER_OPTIONS.filter(
                option =>
                  selectedFilters.includes(
                    option.value
                  )
              )}
              getOptionLabel={(o) =>
                o.label
              }
              onChange={(e,value)=>{

                setSelectedFilters(

                  value.map(
                    x => x.value
                  )

                );

              }}
              renderInput={(params)=>(

                <TextField
                  {...params}
                  label="Filter Utility / State"
                />

              )}
            />

            <GradientButton
              startIcon={<RefreshRoundedIcon />}
              onClick={refreshRTGData}
              sx={{
                whiteSpace: "nowrap"
              }}
            >
              Refresh RTG Data
            </GradientButton>

          </Box>

        </Box>

      </GlassCard>



      {/* ── PIPELINE EXECUTION DIALOG ── */}
      {openLogs && (
      <Dialog
        open={openLogs}
        onClose={() => setOpenLogs(false)}
        maxWidth="lg"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: "34px",
            background: "linear-gradient(135deg,#f1f7f6,#ffffff)",
            overflow: "hidden",
            border: "1px solid rgba(255,255,255,0.5)",
            boxShadow: "0 30px 80px rgba(3,98,76,0.2)",
          },
        }}
      >
        <DialogContent sx={{ p: 0 }}>

          {/* dialog header */}
          <Box sx={{ p: 4, background: "linear-gradient(135deg,#03624C,#17876D)", color: "white", position: "relative" }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Box>
                <Typography sx={{ fontSize: 28, fontWeight: 800 }}>Pipeline Execution</Typography>
                <Typography sx={{ opacity: 0.8, mt: 1 }}>Enterprise monitoring diagnostics</Typography>
              </Box>
              <IconButton onClick={() => setOpenLogs(false)} sx={{ color: "white" }}>
                <CloseRoundedIcon />
              </IconButton>
            </Box>
          </Box>

          {/* dialog body */}
          <Box sx={{ p: 3 }}>
            <Tabs value={pipelineTab} onChange={(e, val) => setPipelineTab(val)} sx={{ mb: 2 }}>
              <Tab label="Summary" />
              <Tab label="Last Push Data" />
              <Tab label="Plant Status" />
              <Tab label="Traceback" />
            </Tabs>

            {/* Summary — uses process_name field from DB */}
            {pipelineTab === 0 && (() => {
              const rtgLog = pipelineLogs
                .filter(l => l.process_name === "RTG_PUSH" && l.response_data)
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
              const allLogs = pipelineLogs.sort((a,b) => new Date(b.timestamp)-new Date(a.timestamp));
              const latestLog = allLogs[0];
              return (
                <GlassCard sx={{ p: 2.5 }}>
                  <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>Execution Summary</Typography>
                  <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5, mb: 2 }}>
                    <Box sx={{ p: 1.5, borderRadius: "12px", background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.14)" }}>
                      <Typography sx={{ fontSize: 11, color: "#64748b" }}>Success Plants</Typography>
                      <Typography sx={{ fontSize: 22, fontWeight: 800, color: "#10b981" }}>{rtgLog?.response_data?.success_plants?.length ?? rtgLog?.response_data?.success_count ?? rtgLog?.extra_data?.success_count ?? 0}</Typography>
                    </Box>
                    <Box sx={{ p: 1.5, borderRadius: "12px", background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.14)" }}>
                      <Typography sx={{ fontSize: 11, color: "#64748b" }}>Failed Plants</Typography>
                      <Typography sx={{ fontSize: 22, fontWeight: 800, color: "#ef4444" }}>{rtgLog?.response_data?.failed_plants?.length ?? rtgLog?.response_data?.failure_count ?? rtgLog?.extra_data?.failure_count ?? 0}</Typography>
                    </Box>
                  </Box>
                  <Box sx={{ display: "flex", flexDirection: "column", gap: 0.8 }}>
                    <Box sx={{ display: "flex", justifyContent: "space-between" }}><Typography sx={{ fontSize: 12, color: "#64748b" }}>Pipeline</Typography><Typography sx={{ fontSize: 12, fontWeight: 700 }}>{selectedPipeline?.pipeline}</Typography></Box>
                    <Box sx={{ display: "flex", justifyContent: "space-between" }}><Typography sx={{ fontSize: 12, color: "#64748b" }}>Status</Typography><Typography sx={{ fontSize: 12, fontWeight: 700, color: latestLog?.status === "SUCCESS" ? "#10b981" : "#ef4444" }}>{latestLog?.status || "-"}</Typography></Box>
                    <Box sx={{ display: "flex", justifyContent: "space-between" }}><Typography sx={{ fontSize: 12, color: "#64748b" }}>Revision ID</Typography><Typography sx={{ fontSize: 12, fontWeight: 700 }}>{selectedPipeline?.revision_id || "-"}</Typography></Box>
                    <Box sx={{ display: "flex", justifyContent: "space-between" }}><Typography sx={{ fontSize: 12, color: "#64748b" }}>Message</Typography><Typography sx={{ fontSize: 12, fontWeight: 700, maxWidth: 320, textAlign: "right" }}>{latestLog?.message || "-"}</Typography></Box>
                  </Box>
                </GlassCard>
              );
            })()}

            {/* Last Push Data */}
            {pipelineTab === 1 && (() => {
              const rtgLog = pipelineLogs
                .filter(l => l.process_name === "RTG_PUSH" && l.response_data)
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
              const tableData = [
                ...(rtgLog?.response_data?.success_plants || []).map(i => ({ plant_name: i.plant_name, plant_id: i.plant_id, status: "SUCCESS", details: i.rtg_response ? JSON.stringify(i.rtg_response) : "Success" })),
                ...(rtgLog?.response_data?.failed_plants || []).map(i => ({ plant_name: i.plant_name, plant_id: i.plant_id, status: "FAILED", details: i.error || "Unknown Error" }))
              ];
              return (
                <GlassCard sx={{ p: 2.5 }}>
                  <Typography sx={{ mb: 1.5, fontWeight: 700 }}>{selectedPipeline?.pipeline} Last Push Data</Typography>
                  {renderPipelineTable(tableData)}
                </GlassCard>
              );
            })()}

            {/* Plant Status */}
            {pipelineTab === 2 && (() => {
              const rtgLog = pipelineLogs
                .filter(l => l.process_name === "RTG_PUSH" && l.response_data)
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
              return (
                <GlassCard sx={{ p: 2.5 }}>
                  <Typography sx={{ mb: 1.5, fontWeight: 700 }}>Failed Plants</Typography>
                  {renderPipelineTable(rtgLog?.response_data?.failed_plants || [])}
                </GlassCard>
              );
            })()}

            {/* Traceback — field is "traceback" in DB */}
            {pipelineTab === 3 && (
              <GlassCard sx={{ p: 2.5 }}>
                <Typography sx={{ mb: 1.5, fontWeight: 700 }}>Python Traceback</Typography>
                <Box sx={{ background: "#111827", color: "#f9fafb", p: 2, borderRadius: "14px", overflow: "auto", maxHeight: 360 }}>
                  <pre style={{ margin: 0, fontSize: 12 }}>{pipelineLogs.find(x => x.traceback)?.traceback || "No Traceback"}</pre>
                </Box>
              </GlassCard>
            )}
          </Box>

        </DialogContent>
      </Dialog>
      )}

      <Grid
        container
        spacing={3}
        sx={{ mb: 3 }}
      >

        <Grid item xs={12} lg={3}>

          <RTGDayTrend
            data={trendData}
            onOutageClick={() =>
              setShowOutageCategoryDialog(true)
            }
            onUnreqClick={() =>
              setShowUnreqDialog(true)
            }
          />

        </Grid>

        <Grid item xs={12} lg={3}>

          <Paper
            elevation={0}
            sx={{
              height: "100%",
              minHeight: 460,
              p: 3,
              borderRadius: "24px",
              background:
                "linear-gradient(180deg,#FFFFFF 0%,#F8FAFC 100%)",
              border:
                "1px solid #E2E8F0",
              boxShadow:
                "0 18px 44px rgba(15,23,42,0.08)"
            }}
          >

            <Box
              sx={{
                display: "flex",
                justifyContent:
                  "space-between",
                alignItems: "center",
                mb: 2.2
              }}
            >
              <Typography
                sx={{
                  fontSize: 21,
                  fontWeight: 950,
                  color: "#0F172A"
                }}
              >
                Generation Snapshot
              </Typography>

              <Typography
                sx={{
                  px: 1.4,
                  py: 0.7,
                  borderRadius: "999px",
                  background: "#ECFDF5",
                  fontSize: 12,
                  fontWeight: 900,
                  color: "#10B981"
                }}
              >
                Live snapshot
              </Typography>
            </Box>

            <Box>

              {systemHealthRows.map(
                (row,index) => (

                  <Box
                    key={row.label}
                    onClick={row.onClick}
                    role={
                      row.onClick
                        ? "button"
                        : undefined
                    }
                    tabIndex={
                      row.onClick
                        ? 0
                        : undefined
                    }
                    sx={{
                      display: "grid",
                      gridTemplateColumns:
                        "36px minmax(0,1fr) auto",
                      alignItems: "center",
                      gap: 1.7,
                      py: 1.65,
                      borderBottom:
                        index ===
                        systemHealthRows.length - 1
                          ? "none"
                          : "1px solid #EEF2F7",
                      cursor:
                        row.onClick
                          ? "pointer"
                          : "default",
                      borderRadius: "14px",
                      px: 1,
                      transition:
                        "background .18s ease, transform .18s ease",
                      "&:hover": row.onClick
                        ? {
                            background: "#F8FAFC",
                            transform:
                              "translateX(2px)"
                          }
                        : {}
                    }}
                  >

                    <Box
                      sx={{
                        color: row.color,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 32,
                        height: 32,
                        borderRadius: "12px",
                        background:
                          `${row.color}14`,
                        "& svg": {
                          fontSize: 20
                        }
                      }}
                    >
                      {row.icon}
                    </Box>

                    <Typography
                      sx={{
                        fontSize: 14,
                        fontWeight: 850,
                        color: "#475569",
                        overflow: "hidden",
                        textOverflow:
                          "ellipsis",
                        whiteSpace: "nowrap"
                      }}
                    >
                      {row.label}
                    </Typography>

                    <Typography
                      sx={{
                        fontSize: 14,
                        fontWeight: 950,
                        color:
                          row.color,
                        whiteSpace: "nowrap"
                      }}
                    >
                      {formatMW(row.value)} {row.unit}
                    </Typography>

                  </Box>

                )
              )}

            </Box>

          </Paper>

        </Grid>

        <Grid item xs={12} lg={3}>

          <Paper
            elevation={0}
            sx={{
              height: "100%",
              minHeight: 460,
              p: 2.4,
              borderRadius: "24px",
              background:
                "linear-gradient(180deg,#FFFFFF 0%,#F8FAFC 100%)",
              border:
                "1px solid #E2E8F0",
              boxShadow:
                "0 18px 44px rgba(15,23,42,0.08)",
              "@keyframes schedulePulse": {
                "0%": {
                  boxShadow:
                    "0 0 0 0 rgba(239,68,68,0.38)"
                },
                "70%": {
                  boxShadow:
                    "0 0 0 7px rgba(239,68,68,0)"
                },
                "100%": {
                  boxShadow:
                    "0 0 0 0 rgba(239,68,68,0)"
                }
              }
            }}
          >

            <Box
              sx={{
                mb: 1.6
              }}
            >
              <Typography
                sx={{
                  fontSize: 21,
                  fontWeight: 950,
                  color: "#0F172A"
                }}
              >
                Schedule Update
              </Typography>

              <Typography
                sx={{
                  mt: 0.35,
                  fontSize: 12,
                  fontWeight: 750,
                  color: "#64748B"
                }}
              >
                Filter-wise latest timestamp
              </Typography>
            </Box>

            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                gap: 0.8
              }}
            >
              {scheduleUpdateRows.map(row => (

                <Box
                  key={row.label}
                  sx={{
                    p: 1,
                    borderRadius: "16px",
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    background:
                      row.stale
                        ? "#FEF2F2"
                        : "#FFFFFF",
                    border:
                      row.stale
                        ? "1px solid #FCA5A5"
                        : "1px solid #E2E8F0",
                    animation:
                      row.stale
                        ? "schedulePulse 1.4s infinite"
                        : "none"
                  }}
                >

                  <Box
                    sx={{
                      width: 30,
                      height: 30,
                      borderRadius: "12px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background:
                        row.stale
                          ? "#FEE2E2"
                          : "#EEF2FF",
                      color:
                        row.stale
                          ? "#DC2626"
                          : "#4F46E5",
                      flexShrink: 0
                    }}
                  >
                    <CalendarMonthRoundedIcon
                      sx={{ fontSize: 16 }}
                    />
                  </Box>

                  <Box
                    sx={{
                      minWidth: 0,
                      flex: 1
                    }}
                  >
                    <Typography
                      sx={{
                        fontSize: 12,
                        fontWeight: 900,
                        color: "#0F172A",
                        overflow: "hidden",
                        textOverflow:
                          "ellipsis",
                        whiteSpace: "nowrap"
                      }}
                    >
                      {row.label}
                    </Typography>

                    <Typography
                      sx={{
                        mt: 0.1,
                        fontSize: 10,
                        fontWeight: 750,
                        color: "#64748B"
                      }}
                    >
                      {row.count} plants
                    </Typography>
                  </Box>

                  <Box
                    sx={{
                      px: 0.9,
                      py: 0.5,
                      borderRadius: "999px",
                      background:
                        row.stale
                          ? "#DC2626"
                          : "#DCFCE7",
                      color:
                        row.stale
                          ? "#fff"
                          : "#16A34A",
                      fontSize: 10,
                      fontWeight: 950,
                      whiteSpace: "nowrap"
                    }}
                  >
                    {formatUpdateTime(
                      row.updatedAt
                    )}
                  </Box>

                </Box>

              ))}
            </Box>

          </Paper>

        </Grid>

        {/* ── PIPELINE MONITOR CARDS ── */}
        <Grid item xs={12} lg={3}>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, height: "100%" }}>
            {pipelineStatus.map((item) => {
              const success = item.last_status === "SUCCESS";
              return (
                <GlassCard
                  key={item.pipeline}
                  sx={{ p: 2, position: "relative", overflow: "hidden", flex: 1 }}
                >
                  <Box sx={{ position: "absolute", top: -40, right: -40, width: 110, height: 110, borderRadius: "50%", background: success ? "radial-gradient(circle,rgba(16,185,129,0.14),transparent 70%)" : "radial-gradient(circle,rgba(239,68,68,0.14),transparent 70%)" }} />

                  {/* header */}
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", position: "relative", zIndex: 2 }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.2 }}>
                      <Box sx={{ width: 36, height: 36, borderRadius: "12px", background: success ? "linear-gradient(135deg,#10b981,#34d399)" : "linear-gradient(135deg,#ef4444,#f87171)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", flexShrink: 0, boxShadow: success ? "0 6px 14px rgba(16,185,129,0.28)" : "0 6px 14px rgba(239,68,68,0.22)" }}>
                        {success ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                      </Box>
                      <Box>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 0.8 }}>
                          <Typography sx={{ fontSize: 14, fontWeight: 800, color: "#1e1b39", lineHeight: 1 }}>{item.pipeline}</Typography>
                          <Box sx={{ display: "flex", alignItems: "center", gap: 0.3 }}>
                            <Radio size={9} color={success ? "#10b981" : "#ef4444"} />
                            <Typography sx={{ fontSize: 8, fontWeight: 700, color: success ? "#10b981" : "#ef4444", letterSpacing: "0.04em" }}>LIVE</Typography>
                          </Box>
                        </Box>
                        <Typography sx={{ fontSize: 10, color: "#7b8199", mt: 0.1 }}>Realtime Monitoring</Typography>
                      </Box>
                    </Box>
                    <Chip label={item.last_status || "UNKNOWN"} size="small" sx={{ background: success ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)", color: success ? "#10b981" : "#ef4444", fontWeight: 700, fontSize: 10, height: 20 }} />
                  </Box>

                  {/* detail rows — only Last Process + Last Trigger */}
                  <Box sx={{ mt: 1.2, display: "flex", flexDirection: "column", gap: 0.6, position: "relative", zIndex: 2 }}>
                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, color: "#94a3b8" }}><Activity size={10} /><Typography sx={{ fontSize: 10 }}>Last Process</Typography></Box>
                      <Typography sx={{ fontSize: 10, fontWeight: 700, color: "#1e1b39" }}>{item.last_process || "-"}</Typography>
                    </Box>
                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, color: "#94a3b8" }}><Clock3 size={10} /><Typography sx={{ fontSize: 10 }}>Last Trigger</Typography></Box>
                      <Typography sx={{ fontSize: 10, fontWeight: 700, color: "#1e1b39" }}>{item.last_trigger ? new Date(item.last_trigger).toLocaleString() : "-"}</Typography>
                    </Box>
                  </Box>

                  {/* stats — Success + Failed only */}
                  <Box sx={{ mt: 1.2, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0.8 }}>
                    <Box sx={{ p: 0.8, textAlign: "center", borderRadius: "8px", background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.12)" }}>
                      <Typography sx={{ fontSize: 9, color: "#7b8199" }}>Success</Typography>
                      <Typography sx={{ fontSize: 16, fontWeight: 800, color: "#10b981", lineHeight: 1.1 }}>{item.success_count || 0}</Typography>
                    </Box>
                    <Box sx={{ p: 0.8, textAlign: "center", borderRadius: "8px", background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.12)" }}>
                      <Typography sx={{ fontSize: 9, color: "#7b8199" }}>Failed</Typography>
                      <Typography sx={{ fontSize: 16, fontWeight: 800, color: "#ef4444", lineHeight: 1.1 }}>{item.failed_count || 0}</Typography>
                    </Box>
                  </Box>

                  {/* buttons */}
                  <Box sx={{ mt: 1.2, display: "flex", gap: 0.8 }}>
                    <GradientButton onClick={() => triggerPipeline(item.pipeline.toLowerCase())} sx={{ flex: 1, py: 0.6, fontSize: 11 }}>Trigger</GradientButton>
                    <GradientButton onClick={() => fetchLogs(item.revision_id, item)} sx={{ flex: 1, py: 0.6, fontSize: 11, background: "rgba(255,255,255,0.82)", color: "#1e1b39" }}>Details</GradientButton>
                  </Box>

                </GlassCard>
              );
            })}
          </Box>
        </Grid>

      </Grid>

      <RTGSnapshotTrend
        date={snapshotTrendDate}
        data={snapshotTrendData}
        loading={snapshotTrendLoading}
        onDateChange={
          handleSnapshotTrendDateChange
        }
      />

      {showOutageDialog && (
      <Dialog
        open={showOutageDialog}
        onClose={() =>
          setShowOutageDialog(false)
        }
        maxWidth="lg"
        fullWidth
      >

        <DialogTitle
          sx={{
            fontWeight: 800,
            display: "flex",
            justifyContent:
              "space-between",
            alignItems: "center"
          }}
        >
          Outage Breakdown
          <IconButton
            onClick={() =>
              setShowOutageDialog(false)
            }
          >
            <CloseRoundedIcon />
          </IconButton>
        </DialogTitle>

        <DialogContent>

          <Typography
            sx={{
              mb: 2,
              fontWeight: 700
            }}
          >
            Category Wise Outage Summary
          </Typography>

          <Table>

            <TableHead>

              <TableRow>

                <TableCell>
                  Plant Name
                </TableCell>

                <TableCell>
                  Unit Name
                </TableCell>

                <TableCell>
                  Outage MW
                </TableCell>

              </TableRow>

            </TableHead>

            <TableBody>

              {selectedPlants.map(
                (row,index) => (

                  <TableRow key={index}>

                    <TableCell>
                      {
                        row.station_name ||
                        row.station ||
                        row.plant_name ||
                        "-"
                      }
                    </TableCell>

                    <TableCell>
                      {
                        row.unit_name ||
                        row.unit ||
                        "-"
                      }
                    </TableCell>

                    <TableCell>
                      {
                        row[selectedCategory]
                      }
                    </TableCell>

                  </TableRow>

                )
              )}

            </TableBody>

          </Table>

        </DialogContent>

      </Dialog>
      )}

      {showOutageCategoryDialog && (
      <Dialog
        open={showOutageCategoryDialog}
        onClose={() =>
          setShowOutageCategoryDialog(false)
        }
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: "30px",
            overflow: "hidden",
            background:
              "linear-gradient(180deg,#FFFFFF 0%,#F8FAFC 100%)",
            boxShadow:
              "0 28px 70px rgba(15,23,42,0.22)"
          }
        }}
      >

        <DialogTitle
          sx={{
            px: 3,
            pt: 3,
            pb: 1,
            display: "flex",
            alignItems: "flex-start",
            justifyContent:
              "space-between"
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
              Outage Category Breakdown
            </Typography>

            <Typography
              sx={{
                mt: 0.5,
                fontSize: 12,
                fontWeight: 750,
                color: "#64748B"
              }}
            >
              Current filtered snapshot
            </Typography>
          </Box>

          <IconButton
            onClick={() =>
              setShowOutageCategoryDialog(false)
            }
            sx={{
              width: 36,
              height: 36,
              background: "#F1F5F9",
              "&:hover": {
                background: "#E2E8F0"
              }
            }}
          >
            <CloseRoundedIcon />
          </IconButton>

        </DialogTitle>

        <DialogContent
          sx={{
            px: 3,
            pb: 3
          }}
        >

          <Box
            sx={{
              position: "relative",
              height: 260,
              mt: 1
            }}
          >

            {outageCategoryRows.length > 0 ? (

              <>
                <ResponsiveContainer
                  width="100%"
                  height="100%"
                >
                  <PieChart>
                    <Pie
                      data={outageCategoryRows}
                      dataKey="value"
                      innerRadius={72}
                      outerRadius={104}
                      paddingAngle={4}
                      cornerRadius={10}
                    >
                      {outageCategoryRows.map(
                        (row,index) => (
                          <Cell
                            key={`${row.name}-${index}`}
                            fill={row.color}
                          />
                        )
                      )}
                    </Pie>

                    <Tooltip
                      formatter={(value) =>
                        `${formatMW(value)} MW`
                      }
                      contentStyle={{
                        borderRadius: 14,
                        border:
                          "1px solid #E2E8F0",
                        boxShadow:
                          "0 16px 36px rgba(15,23,42,0.14)",
                        fontSize: 12
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>

                <Box
                  sx={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    pointerEvents: "none"
                  }}
                >
                  <Box
                    sx={{
                      width: 96,
                      height: 96,
                      borderRadius: "50%",
                      background: "#fff",
                      boxShadow:
                        "inset 0 0 0 1px #EEF2F7",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center"
                    }}
                  >
                    <Typography
                      sx={{
                        fontSize: 11,
                        fontWeight: 850,
                        color: "#64748B",
                        textTransform: "uppercase"
                      }}
                    >
                      Total
                    </Typography>

                    <Typography
                      sx={{
                        mt: 0.3,
                        fontSize: 20,
                        fontWeight: 950,
                        color: "#0F172A"
                      }}
                    >
                      {formatMW(outage)}
                    </Typography>
                  </Box>
                </Box>
              </>

            ) : (

              <Box
                sx={{
                  height: "100%",
                  borderRadius: "22px",
                  background: "#F8FAFC",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#64748B",
                  fontWeight: 850,
                  textAlign: "center",
                  px: 2
                }}
              >
                No outage category data found.
              </Box>

            )}

          </Box>

          <Box
            sx={{
              mt: 2,
              display: "grid",
              gridTemplateColumns:
                "1fr 1fr",
              gap: 1.2
            }}
          >
            {outageCategoryRows.map(
              row => (

                <Box
                  key={row.name}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    minWidth: 0
                  }}
                >
                  <Box
                    sx={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: row.color,
                      flexShrink: 0
                    }}
                  />

                  <Typography
                    sx={{
                      fontSize: 12,
                      fontWeight: 850,
                      color: "#475569",
                      overflow: "hidden",
                      textOverflow:
                        "ellipsis",
                      whiteSpace: "nowrap"
                    }}
                  >
                    {row.name}
                  </Typography>

                  <Typography
                    sx={{
                      ml: "auto",
                      fontSize: 12,
                      fontWeight: 950,
                      color: "#0F172A"
                    }}
                  >
                    {formatMW(row.value)}
                  </Typography>
                </Box>

              )
            )}
          </Box>

        </DialogContent>

      </Dialog>
      )}

      {showOutageSummaryDialog && (
      <Dialog
        open={showOutageSummaryDialog}
        onClose={() =>
          setShowOutageSummaryDialog(false)
        }
        maxWidth="lg"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: "28px",
            overflow: "hidden",
            background:
              "linear-gradient(180deg,#FFFFFF 0%,#F8FAFC 100%)"
          }
        }}
      >

        <DialogTitle
          sx={{
            px: 3,
            py: 2.5,
            display: "flex",
            justifyContent:
              "space-between",
            alignItems: "center",
            borderBottom:
              "1px solid #E5E7EB"
          }}
        >

          <Box>
            <Typography
              sx={{
                fontSize: 22,
                fontWeight: 900,
                color: "#111827"
              }}
            >
              Outage Capacity
            </Typography>

            <Typography
              sx={{
                mt: 0.4,
                fontSize: 13,
                fontWeight: 600,
                color: "#6B7280"
              }}
            >
              {outageSummaryRows.length} plants | {formatMW(outage)} MW
            </Typography>
          </Box>

          <IconButton
            onClick={() =>
              setShowOutageSummaryDialog(false)
            }
            sx={{
              background: "#F3F4F6",
              "&:hover": {
                background: "#E5E7EB"
              }
            }}
          >
            <CloseRoundedIcon />
          </IconButton>

        </DialogTitle>

        <DialogContent
          sx={{
            p: 0
          }}
        >

          <TableContainer
            component={Paper}
            elevation={0}
            sx={{
              maxHeight: 560,
              background: "transparent"
            }}
          >
            <Table
              stickyHeader
              size="small"
            >

              <TableHead>

                <TableRow>

                  {outageSummaryColumns.map(
                    column => (

                      <TableCell
                        key={column.key}
                        align={
                          column.align ||
                          "right"
                        }
                        sx={{
                          py: 1.4,
                          fontSize: 12,
                          fontWeight: 900,
                          color: "#475569",
                          background: "#F8FAFC",
                          borderBottom:
                            "1px solid #E2E8F0",
                          whiteSpace:
                            "nowrap"
                        }}
                      >
                        {column.label}
                      </TableCell>

                    )
                  )}

                </TableRow>

              </TableHead>

              <TableBody>

                {outageSummaryRows.map(
                  (row,index) => (

                    <TableRow
                      key={`${row.plant}-${index}`}
                      hover
                      sx={{
                        "&:last-child td": {
                          borderBottom: 0
                        }
                      }}
                    >

                      {outageSummaryColumns.map(
                        column => (

                          <TableCell
                            key={column.key}
                            align={
                              column.align ||
                              "right"
                            }
                            sx={{
                              py: 1.35,
                              fontSize: 13,
                              fontWeight:
                                column.key === "plant"
                                  ? 800
                                  : 700,
                              color:
                                column.key === "total"
                                  ? "#B91C1C"
                                  : "#1F2937",
                              borderBottom:
                                "1px solid #EEF2F7",
                              whiteSpace:
                                "nowrap"
                            }}
                          >
                            {
                              column.key === "plant"
                                ? row[column.key]
                                : formatMW(
                                    row[column.key]
                                  )
                            }
                          </TableCell>

                        )
                      )}

                    </TableRow>

                  )
                )}

                {outageSummaryRows.length === 0 && (

                  <TableRow>
                    <TableCell
                      colSpan={
                        outageSummaryColumns.length
                      }
                      align="center"
                      sx={{
                        py: 6,
                        color: "#64748B",
                        fontWeight: 700
                      }}
                    >
                      No outage plants found for the current filter.
                    </TableCell>
                  </TableRow>

                )}

              </TableBody>

            </Table>
          </TableContainer>

        </DialogContent>

      </Dialog>
      )}

      {showUnreqDialog && (
      <Dialog
        open={showUnreqDialog}
        onClose={() =>
          setShowUnreqDialog(false)
        }
        maxWidth="lg"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: "28px",
            overflow: "hidden",
            background:
              "linear-gradient(180deg,#FFFFFF 0%,#F8FAFC 100%)"
          }
        }}
      >

        <DialogTitle
          sx={{
            px: 3,
            py: 2.5,
            display: "flex",
            justifyContent:
              "space-between",
            alignItems: "center",
            borderBottom:
              "1px solid #E5E7EB"
          }}
        >

          <Box>
            <Typography
              sx={{
                fontSize: 22,
                fontWeight: 900,
                color: "#111827"
              }}
            >
              UnRequisition Power
            </Typography>

            <Typography
              sx={{
                mt: 0.4,
                fontSize: 13,
                fontWeight: 600,
                color: "#6B7280"
              }}
            >
              {unreqRows.length} plants | {formatMW(totalRequisition)} MW
            </Typography>
          </Box>

          <IconButton
            onClick={() =>
              setShowUnreqDialog(false)
            }
            sx={{
              background: "#F3F4F6",
              "&:hover": {
                background: "#E5E7EB"
              }
            }}
          >
            <CloseRoundedIcon />
          </IconButton>

        </DialogTitle>

        <DialogContent
          sx={{
            p: 0
          }}
        >

          <TableContainer
            component={Paper}
            elevation={0}
            sx={{
              maxHeight: 560,
              background: "transparent"
            }}
          >
            <Table
              stickyHeader
              size="small"
            >

              <TableHead>

                <TableRow>

                  {unreqColumns.map(
                    column => (

                      <TableCell
                        key={column.key}
                        align={
                          column.align ||
                          "right"
                        }
                        sx={{
                          py: 1.4,
                          fontSize: 12,
                          fontWeight: 900,
                          color: "#475569",
                          background: "#F8FAFC",
                          borderBottom:
                            "1px solid #E2E8F0",
                          whiteSpace:
                            "nowrap"
                        }}
                      >
                        {column.label}
                      </TableCell>

                    )
                  )}

                </TableRow>

              </TableHead>

              <TableBody>

                {unreqRows.map(
                  (row,index) => (

                    <TableRow
                      key={`${row.plant}-${index}`}
                      hover
                      sx={{
                        "&:last-child td": {
                          borderBottom: 0
                        }
                      }}
                    >

                      {unreqColumns.map(
                        column => (

                          <TableCell
                            key={column.key}
                            align={
                              column.align ||
                              "right"
                            }
                            sx={{
                              py: 1.35,
                              fontSize: 13,
                              fontWeight:
                                column.key === "plant"
                                  ? 800
                                  : 700,
                              color:
                                column.key === "unreqPower"
                                  ? "#B45309"
                                  : "#1F2937",
                              borderBottom:
                                "1px solid #EEF2F7",
                              whiteSpace:
                                "nowrap"
                            }}
                          >
                            {
                              column.key === "plant"
                                ? row[column.key]
                                : formatMW(
                                    row[column.key]
                                  )
                            }
                          </TableCell>

                        )
                      )}

                    </TableRow>

                  )
                )}

                {unreqRows.length === 0 && (

                  <TableRow>
                    <TableCell
                      colSpan={
                        unreqColumns.length
                      }
                      align="center"
                      sx={{
                        py: 6,
                        color: "#64748B",
                        fontWeight: 700
                      }}
                    >
                      No plants found for the current filter.
                    </TableCell>
                  </TableRow>

                )}

              </TableBody>

            </Table>
          </TableContainer>

        </DialogContent>

      </Dialog>
      )}

    </AppShell>
  );
}
