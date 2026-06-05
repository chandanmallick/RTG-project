import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Calendar,
  CheckCircle,
  AlertCircle,
  Activity,
  Database,
  Sparkles,
  TrendingUp,
  RefreshCw,
  Search,
  Zap,
  Info,
  Clock,
  ArrowLeft,
  PieChart as PieChartIcon
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Sector,
  ReferenceLine,
  Legend
} from "recharts";

import API from "../services/api";

// LAYOUT
import AppShell from "../components/layout/AppShell";
import VoltageProfileMap from "../components/VoltageProfileMap";

// Donut chart color palette - vibrant, modern, premium
const DONUT_COLORS = [
  "#03624C",  // Bangladesh Green (largest)
  "#2CC295",  // Mountain Meadow
  "#00DF81",  // Caribbean Green
  "#17876D",  // Frog
  "#0B453A",  // Pine
  "#2FA98C",  // Mint
  "#AACBC4",  // Pistachio
];

const renderCustomLabel = (props) => {
  const { cx, cy, midAngle, innerRadius, outerRadius, percent, name, value } = props;
  const RADIAN = Math.PI / 180;
  const sin = Math.sin(-RADIAN * midAngle);
  const cos = Math.cos(-RADIAN * midAngle);
  const sx = cx + (outerRadius + 2) * cos;
  const sy = cy + (outerRadius + 2) * sin;
  const mx = cx + (outerRadius + 10) * cos;
  const my = cy + (outerRadius + 10) * sin;
  const ex = mx + (cos >= 0 ? 1 : -1) * 8;
  const ey = my;
  const textAnchor = cos >= 0 ? 'start' : 'end';
  return (
    <g>
      <path d={`M${sx},${sy}L${mx},${my}L${ex},${ey}`} stroke="#0B453A" fill="none" strokeWidth={1} opacity={0.4} />
      <circle cx={ex} cy={ey} r={1.5} fill="#03624C" />
      <text 
        x={ex + (cos >= 0 ? 1 : -1) * 3} 
        y={ey} 
        textAnchor={textAnchor} 
        fill="#1e293b" 
        style={{ fontSize: "8.5px", fontWeight: "700" }}
        dy={3}
      >
        {`${name}: ${value.toFixed(1)} MU (${(percent * 100).toFixed(0)}%)`}
      </text>
    </g>
  );
};

// Custom active shape for donut chart hover
const renderActiveShape = (props) => {
  const {
    cx, cy, innerRadius, outerRadius, startAngle, endAngle,
    fill, payload, percent, value
  } = props;

  return (
    <g>
      <text x={cx} y={cy - 8} textAnchor="middle" fill="#022726" fontSize={22} fontWeight="700">
        {value.toFixed(1)}
      </text>
      <text x={cx} y={cy + 14} textAnchor="middle" fill="#0B453A" fontSize={11} fontWeight="500">
        MU
      </text>
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius - 3}
        outerRadius={outerRadius + 6}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        opacity={0.9}
      />
      <Sector
        cx={cx}
        cy={cy}
        startAngle={startAngle}
        endAngle={endAngle}
        innerRadius={outerRadius + 8}
        outerRadius={outerRadius + 12}
        fill={fill}
        opacity={0.4}
      />
    </g>
  );
};

const DonutTooltip = ({ active, payload }) => {
  if (active && payload && payload.length > 0) {
    const data = payload[0];
    const val = data.value;
    const pct = data.payload?.percent !== undefined ? data.payload.percent * 100 : (data.percent * 100);
    return (
      <div 
        className="bg-white text-dark p-2.5" 
        style={{ 
          borderRadius: "10px", 
          border: "1px solid rgba(2, 39, 38, 0.15)",
          boxShadow: "0 6px 16px rgba(0, 0, 0, 0.08)",
          fontSize: "0.78rem",
          textAlign: "left"
        }}
      >
        <span className="fw-bold d-block mb-1" style={{ color: "#022726" }}>
          {data.name}
        </span>
        <span className="fw-bold text-success" style={{ color: "#03624C" }}>
          {val.toFixed(2)} MU
        </span>
        <span className="text-secondary ms-1.5 font-monospace">
          ({pct.toFixed(1)}%)
        </span>
      </div>
    );
  }
  return null;
};

const CustomTooltip = ({ active, payload }) => {
  if (active && payload && payload.length > 0) {
    const data = payload[0].payload;
    return (
      <div 
        className="bg-white text-dark p-3" 
        style={{ 
          minWidth: "280px", 
          borderRadius: "12px", 
          border: "1px solid rgba(2, 39, 38, 0.15)",
          boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)"
        }}
      >
        <div className="d-flex justify-content-between align-items-center mb-2 pb-1.5 border-bottom border-light text-start">
          <span className="fw-bold text-success-emphasis" style={{ fontSize: "1.05rem", color: "#022726" }}>
            {data.state}
          </span>
          <span className="text-secondary small fw-medium">{data.time}</span>
        </div>
        
        <div className="mb-3 text-start">
          <span className="small text-muted d-block uppercase-label" style={{ fontSize: "0.68rem" }}>
            Peak Demand Met
          </span>
          <span className="fw-bold text-success" style={{ fontSize: "1.25rem", color: "#03624C" }}>
            {data.maxDemand?.toLocaleString()} MW
          </span>
          {data.loadshed > 0 && (
            <span className="text-warning small fw-semibold ms-2">
              (LS: {data.loadshed} MW)
            </span>
          )}
          {data.peakDate && (
            <div className="text-muted small mt-0.5" style={{ fontSize: "0.72rem" }}>
              Date: <span className="fw-semibold text-dark">{data.peakDate}</span>
            </div>
          )}
          {data.prevPeak && (
            <div className="mt-1.5 p-2 rounded bg-light border border-light-subtle">
              <span className="d-block text-secondary uppercase-label" style={{ fontSize: "0.62rem" }}>
                Previous High Record
              </span>
              <span className="fw-semibold text-dark small">
                {data.prevPeak.max_demand?.toLocaleString()} MW
              </span>
              <span className="text-muted small ms-1" style={{ fontSize: "0.7rem" }}>
                on {data.prevPeak.date}
              </span>
            </div>
          )}
        </div>
        
        <div className="small text-start">
          <p 
            className="mb-1 text-uppercase fw-bold text-secondary border-bottom border-light pb-0.5" 
            style={{ fontSize: "0.62rem", letterSpacing: "0.05em" }}
          >
            Internal Generation (Left Side)
          </p>
          <div className="d-flex justify-content-between align-items-center mb-1" style={{ color: "#1e293b" }}>
            <span className="d-flex align-items-center gap-2">
              <span className="rounded-circle d-inline-block" style={{ width: "8px", height: "8px", backgroundColor: "#E28743" }} />
              Thermal Gen:
            </span>
            <span className="fw-bold">{data.absThermal?.toLocaleString()} MW</span>
          </div>
          <div className="d-flex justify-content-between align-items-center mb-1" style={{ color: "#1e293b" }}>
            <span className="d-flex align-items-center gap-2">
              <span className="rounded-circle d-inline-block" style={{ width: "8px", height: "8px", backgroundColor: "#00DF81" }} />
              Hydro Gen:
            </span>
            <span className="fw-bold">{data.absHydro?.toLocaleString()} MW</span>
          </div>
          <div className="d-flex justify-content-between align-items-center mb-1" style={{ color: "#1e293b" }}>
            <span className="d-flex align-items-center gap-2">
              <span className="rounded-circle d-inline-block" style={{ width: "8px", height: "8px", backgroundColor: "#8FA960" }} />
              Solar Gen:
            </span>
            <span className="fw-bold">{data.absSolar?.toLocaleString()} MW</span>
          </div>
          <div className="d-flex justify-content-between align-items-center mb-1" style={{ color: "#1e293b" }}>
            <span className="d-flex align-items-center gap-2">
              <span className="rounded-circle d-inline-block" style={{ width: "8px", height: "8px", backgroundColor: "#17876D" }} />
              BioGas Gen:
            </span>
            <span className="fw-bold">{data.absBiogas?.toLocaleString()} MW</span>
          </div>
          <div className="d-flex justify-content-between align-items-center mb-2.5" style={{ color: "#1e293b" }}>
            <span className="d-flex align-items-center gap-2">
              <span className="rounded-circle d-inline-block" style={{ width: "8px", height: "8px", backgroundColor: "#2CC295" }} />
              Nuclear Gen:
            </span>
            <span className="fw-bold">{data.absNuclear?.toLocaleString()} MW</span>
          </div>
          
          <p 
            className="mb-1 text-uppercase fw-bold text-secondary border-bottom border-light pb-0.5 mt-2.5" 
            style={{ fontSize: "0.62rem", letterSpacing: "0.05em" }}
          >
            Portfolio & Deviation (Right Side)
          </p>
          <div className="d-flex justify-content-between align-items-center mb-1" style={{ color: "#1e293b" }}>
            <span className="d-flex align-items-center gap-2">
              <span className="rounded-circle d-inline-block" style={{ width: "8px", height: "8px", backgroundColor: "#3B82F6" }} />
              ISGS Drawl:
            </span>
            <span className="fw-bold">{data.absIsgs?.toLocaleString()} MW</span>
          </div>
          <div className="d-flex justify-content-between align-items-center mb-1" style={{ color: "#1e293b" }}>
            <span className="d-flex align-items-center gap-2">
              <span className="rounded-circle d-inline-block" style={{ width: "8px", height: "8px", backgroundColor: "#1D4ED8" }} />
              GNA Schedule:
            </span>
            <span className="fw-bold">{data.absGna?.toLocaleString()} MW</span>
          </div>
          <div className="d-flex justify-content-between align-items-center mb-1" style={{ color: "#1e293b" }}>
            <span className="d-flex align-items-center gap-2">
              <span className="rounded-circle d-inline-block" style={{ width: "8px", height: "8px", backgroundColor: "#60A5FA" }} />
              TGNA Schedule:
            </span>
            <span className="fw-bold">{data.absTgna?.toLocaleString()} MW</span>
          </div>
          <div className="d-flex justify-content-between align-items-center mb-1" style={{ color: "#1e293b" }}>
            <span className="d-flex align-items-center gap-2">
              <span className="rounded-circle d-inline-block" style={{ width: "8px", height: "8px", backgroundColor: "#8B5CF6" }} />
              iDAM Schedule:
            </span>
            <span className="fw-bold">{data.absIdam?.toLocaleString()} MW</span>
          </div>
          <div className="d-flex justify-content-between align-items-center mb-1" style={{ color: "#1e293b" }}>
            <span className="d-flex align-items-center gap-2">
              <span className="rounded-circle d-inline-block" style={{ width: "8px", height: "8px", backgroundColor: "#A78BFA" }} />
              RTM Drawl:
            </span>
            <span className="fw-bold">{data.absRtm?.toLocaleString()} MW</span>
          </div>
          <div className="d-flex justify-content-between align-items-center" style={{ color: "#1e293b" }}>
            <span className="d-flex align-items-center gap-2">
              <span className="rounded-circle d-inline-block" style={{ width: "8px", height: "8px", backgroundColor: "#64748B" }} />
              DSM (Deviation):
            </span>
            <span className="fw-bold" style={{ color: data.absDsm < 0 ? "#ef4444" : "#10b981" }}>
              {data.absDsm?.toLocaleString()} MW
            </span>
          </div>
        </div>
      </div>
    );
  }
  return null;
};

export default function PSPDashboard() {
  const navigate = useNavigate();
  const [statusData, setStatusData] = useState([]);
  const [loading, setLoading] = useState(false);

  // Real MongoDB Analytics State
  const [analyticsData, setAnalyticsData] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);

  // Portfolio & Demand Breakdown States
  const [portfolioData, setPortfolioData] = useState(null);
  const [portfolioLoading, setPortfolioLoading] = useState(true);

  // New States
  const [viewMode, setViewMode] = useState("current"); // "current" or "peak"
  const [highestRecords, setHighestRecords] = useState([]);
  const [highestLoading, setHighestLoading] = useState(true);
  const [activePieIndex, setActivePieIndex] = useState(0);
  const [energyData, setEnergyData] = useState(null);
  const [energyLoading, setEnergyLoading] = useState(true);
  const [energyBreakdownData, setEnergyBreakdownData] = useState(null);
  const [energyBreakdownLoading, setEnergyBreakdownLoading] = useState(true);
  const [energyModalOpen, setEnergyModalOpen] = useState(false);
  const [selectedState, setSelectedState] = useState(null);

  // Popup Modal States
  const [modalOpen, setModalOpen] = useState(false);
  const [modalStatusData, setModalStatusData] = useState([]);
  const [modalLoading, setModalLoading] = useState(false);
  const [filterStart, setFilterStart] = useState("");
  const [filterEnd, setFilterEnd] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [powerPositionData, setPowerPositionData] = useState([]);
  const [powerPositionLoading, setPowerPositionLoading] = useState(true);
  const [voltageData, setVoltageData] = useState(null);
  const [voltageLoading, setVoltageLoading] = useState(true);

  const onPieEnter = useCallback((_, index) => {
    setActivePieIndex(index);
  }, []);

  const loadStatus = async () => {
    try {
      setLoading(true);
      const res = await API.getPspStatus();
      if (res.success) {
        setStatusData(res.data || []);
      }
    } catch (err) {
      console.error("Error loading status:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadAnalytics = async () => {
    try {
      setAnalyticsLoading(true);
      const res = await API.getPspAnalytics();
      if (res.success) {
        setAnalyticsData(res);
      }
    } catch (err) {
      console.error("Error loading analytics:", err);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const loadModalStatus = async (start, end) => {
    try {
      setModalLoading(true);
      const res = await API.getPspStatus(start, end);
      if (res.success) {
        setModalStatusData(res.data || []);
      }
    } catch (err) {
      console.error("Error loading modal status:", err);
    } finally {
      setModalLoading(false);
    }
  };

  const handleTileClick = () => {
    setModalOpen(true);
    // Clear custom filters on open and show default 30 days
    setFilterStart("");
    setFilterEnd("");
    loadModalStatus();
  };

  const loadEnergyData = async (dateStr) => {
    try {
      setEnergyLoading(true);
      const res = await API.getPspEnergyConsumption(dateStr);
      if (res.success) {
        setEnergyData(res);
      }
    } catch (err) {
      console.error("Error loading energy consumption:", err);
    } finally {
      setEnergyLoading(false);
    }
  };

  const loadEnergyBreakdown = async (dateStr) => {
    try {
      setEnergyBreakdownLoading(true);
      const res = await API.getPspEnergyBreakdown(dateStr);
      if (res.success) {
        setEnergyBreakdownData(res);
      }
    } catch (err) {
      console.error("Error loading energy breakdown:", err);
    } finally {
      setEnergyBreakdownLoading(false);
    }
  };

  const loadHighestRecords = async () => {
    try {
      setHighestLoading(true);
      const res = await API.getPspHighestRecords();
      if (res.success) {
        setHighestRecords(res.data || []);
      }
    } catch (err) {
      console.error("Error loading highest records:", err);
    } finally {
      setHighestLoading(false);
    }
  };

  const loadPowerPosition = async (dateStr) => {
    try {
      setPowerPositionLoading(true);
      const res = await API.getPspPowerPosition(dateStr);
      if (res.success) {
        setPowerPositionData(res.rows || []);
      }
    } catch (err) {
      console.error("Error loading power position:", err);
    } finally {
      setPowerPositionLoading(false);
    }
  };

  const loadPortfolioData = async (dateStr) => {
    try {
      setPortfolioLoading(true);
      const res = await API.getPspPortfolioBreakdown(dateStr);
      if (res.success) {
        setPortfolioData(res);
        loadEnergyData(res.date);
        loadEnergyBreakdown(res.date);
        loadPowerPosition(res.date);
      }
    } catch (err) {
      console.error("Error loading portfolio breakdown:", err);
    } finally {
      setPortfolioLoading(false);
    }
  };

  const loadVoltageProfile = async (dateStr) => {
    try {
      setVoltageLoading(true);
      let res = await API.getPspVoltageProfile(dateStr);
      // If latest doc has no voltage arrays (e.g. today's PSP not yet ingested),
      // fall back to yesterday's data automatically
      if (
        res.success &&
        !dateStr &&
        res.has_data &&
        (res.kv400 || []).length === 0 &&
        (res.kv765 || []).length === 0
      ) {
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10);
        res = await API.getPspVoltageProfile(yesterday);
      }
      if (res.success) {
        setVoltageData(res);
      }
    } catch (err) {
      console.error("Error loading voltage profile:", err);
    } finally {
      setVoltageLoading(false);
    }
  };

  const handleDateChange = (dateStr) => {
    setSelectedDate(dateStr);
    loadPortfolioData(dateStr);
    loadVoltageProfile(dateStr);
  };

  const handleRefreshAll = () => {
    loadStatus();
    loadAnalytics();
    loadPortfolioData(selectedDate);
    loadHighestRecords();
    loadVoltageProfile(selectedDate);
  };

  useEffect(() => {
    loadStatus();
    loadAnalytics();
    loadPortfolioData();
    loadHighestRecords();
    loadVoltageProfile();
  }, []);

  const formatDateTime = (isoString) => {
    if (!isoString) return "-";
    const dateObj = new Date(isoString);
    return dateObj.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });
  };

  // Date constants
  const yesterdayStr = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const latestStatus = statusData.length > 0 ? statusData[0] : null;

  // Dynamic metrics calculation
  const hasData = analyticsData && analyticsData.has_data;
  const trendData = hasData ? analyticsData.trend_data || [] : [];
  const stateData = hasData ? analyticsData.state_data || [] : [];
  const latestDate = hasData ? analyticsData.latest_date : "";

  // 1. Peak regional demand met (last 15 days)
  const peakDemandEntry = trendData.length > 0
    ? trendData.reduce((max, d) => d.requirement > max.requirement ? d : max, trendData[0])
    : null;
  const peakDemand = peakDemandEntry ? peakDemandEntry.requirement : 0;
  const peakDemandDate = peakDemandEntry ? peakDemandEntry.date : "";

  // 2. Avg energy availability (last 15 days)
  const avgAvailability = trendData.length > 0
    ? trendData.reduce((sum, d) => sum + d.availability, 0) / trendData.length
    : 0;

  return (
    <AppShell>
      <div className="container-fluid py-2 theme-page-container">
        {/* BANNER */}
        <div
          className="theme-glass-card mb-4 p-4 position-relative overflow-hidden border-0 text-white"
          style={{
            background: "linear-gradient(135deg, #022726 0%, #03624C 50%, #17876D 100%)"
          }}
        >
          <div
            style={{
              position: "absolute",
              top: "-50px",
              right: "-50px",
              width: "200px",
              height: "200px",
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(0,223,129,0.3), transparent 75%)",
              pointerEvents: "none"
            }}
          />
          <div className="position-relative z-3 d-flex justify-content-between align-items-center flex-wrap gap-3">
            <div>
              <div className="d-flex align-items-center gap-2 mb-2">
                <span
                  className="badge rounded-pill fw-bold text-dark"
                  style={{
                    backgroundColor: "#00DF81",
                    fontSize: "0.7rem",
                    padding: "0.4rem 0.8rem",
                    letterSpacing: "0.05em"
                  }}
                >
                  <Activity size={12} className="me-1 align-text-bottom" /> ENERGY ANALYTICS
                </span>
              </div>
              <h1 className="fw-bold mb-1" style={{ fontSize: "1.75rem", letterSpacing: "-0.03em" }}>
                PSP Analytics & Operations Dashboard
              </h1>
              <p className="mb-0 opacity-75" style={{ fontSize: "0.88rem", maxWidth: "680px" }}>
                Review historical power allocations, demand vs availability curves, and sync statuses.
              </p>
            </div>
            <div className="d-flex align-items-center gap-3">
              {statusData && statusData.length > 0 && (
                <div className="d-flex align-items-center gap-2">
                  <span className="small opacity-90 fw-bold text-white">Select Date:</span>
                  <select
                    className="form-select form-select-sm"
                    style={{
                      backgroundColor: "rgba(255, 255, 255, 0.15)",
                      borderColor: "rgba(255, 255, 255, 0.25)",
                      color: "white",
                      fontSize: "0.82rem",
                      borderRadius: "8px",
                      minWidth: "150px",
                      cursor: "pointer",
                      paddingTop: "0.35rem",
                      paddingBottom: "0.35rem"
                    }}
                    value={selectedDate}
                    onChange={(e) => handleDateChange(e.target.value)}
                  >
                    <option value="" className="text-dark">Latest Date</option>
                    {statusData
                      .filter(d => d.status === "SUCCESS")
                      .map(d => (
                        <option key={d.date} value={d.date} className="text-dark">
                          {d.date}
                        </option>
                      ))}
                  </select>
                </div>
              )}
              <button
                className="btn theme-btn-banner-refresh d-flex align-items-center gap-2"
                onClick={handleRefreshAll}
                disabled={loading || analyticsLoading}
              >
                <RefreshCw size={14} className={loading || analyticsLoading ? "animate-spin-custom" : ""} />
                <span>Refresh Data</span>
              </button>
            </div>
          </div>
        </div>

        {/* METRICS & TILES ROW */}
        <div className="row g-4 mb-4">
          {/* TILE 1: TODAY'S INGESTION STATUS (CLICKABLE) */}
          <div className="col-12 col-md-4">
            <div
              className="theme-glass-card p-4 h-100 d-flex flex-column justify-content-between border border-success-subtle shadow-sm"
              style={{
                background: "linear-gradient(135deg, #ffffff 0%, #F1F7F6 100%)",
                cursor: "pointer"
              }}
              onClick={handleTileClick}
            >
              <div>
                <div className="d-flex align-items-center justify-content-between mb-3">
                  <span
                    className="badge rounded-pill bg-success-subtle text-success-emphasis fw-bold px-3 py-1.5 small"
                    style={{ fontSize: "0.72rem", backgroundColor: "rgba(0, 223, 129, 0.15)" }}
                  >
                    LATEST STATUS
                  </span>
                  <Activity size={16} className="text-success" />
                </div>
                <h3 className="h6 fw-bold mb-1 text-dark">Today's Ingestion Status</h3>
                <p className="small text-muted mb-3" style={{ fontSize: "0.75rem" }}>
                  Click to inspect the last 30 days or search by date ranges.
                </p>
              </div>

              <div className="d-flex align-items-end justify-content-between">
                <div>
                  <span className="d-block fw-bold text-dark mb-1" style={{ fontSize: "1.05rem" }}>
                    {latestStatus ? latestStatus.date : yesterdayStr}
                  </span>
                  <span className="text-secondary" style={{ fontSize: "0.75rem" }}>
                    Fetched:{" "}
                    {latestStatus && latestStatus.fetched_at
                      ? formatDateTime(latestStatus.fetched_at)
                      : "Pending"}
                  </span>
                </div>
                <div>
                  {latestStatus && latestStatus.status === "SUCCESS" ? (
                    <span className="theme-badge-success fs-7">
                      <CheckCircle size={12} />
                      <span>Fetched</span>
                    </span>
                  ) : (
                    <span className="theme-badge-missing fs-7">
                      <AlertCircle size={12} />
                      <span>Missing</span>
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {analyticsLoading ? (
            <div className="col-12 col-md-8">
              <div className="theme-glass-card p-4 h-100 d-flex align-items-center justify-content-center">
                <div className="text-center py-4">
                  <div className="spinner-border text-success spinner-border-sm me-2" role="status"></div>
                  <span className="text-secondary small fw-bold">Loading Operational Metrics...</span>
                </div>
              </div>
            </div>
          ) : !hasData ? (
            /* EMPTY STATE GLASS CARD INSTEAD OF TILES 2 & 3 */
            <div className="col-12 col-md-8">
              <div
                className="theme-glass-card p-4 h-100 d-flex flex-column justify-content-between text-white border-0"
                style={{
                  background: "linear-gradient(135deg, #0B453A 0%, #03624C 100%)"
                }}
              >
                <div>
                  <h3 className="h6 fw-bold mb-2 text-white d-flex align-items-center gap-2">
                    <AlertCircle size={18} style={{ color: "#00DF81" }} />
                    <span>Operational Analytics Unavailable</span>
                  </h3>
                  <p className="mb-0 opacity-75 small" style={{ maxWidth: "600px" }}>
                    There is currently no operational data synced in the database for the PSP pipeline.
                    To view load curves and state-wise allocation profiles, you must first run a historical date range synchronization.
                  </p>
                </div>
                <div className="d-flex justify-content-end mt-3">
                  <button
                    className="btn theme-btn-action d-flex align-items-center gap-2"
                    onClick={() => navigate("/psp-admin")}
                  >
                    <span>Configure & Sync Data</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* DYNAMIC ANALYTIC CARDS */
            <>
              {/* TILE 2: PEAK DEMAND ANALYTIC METRIC */}
              <div className="col-12 col-md-4">
                <div
                  className="theme-stat-card border-0 text-white h-100"
                  style={{ background: "linear-gradient(135deg, #2CC295 0%, #2FA98C 100%)" }}
                >
                  <div className="theme-icon-container" style={{ color: "#00DF81" }}>
                    <Zap size={22} />
                  </div>
                  <div>
                    <h4 className="text-white opacity-75 small fw-bold mb-1 uppercase-label">
                      Peak Demand Met (15d)
                    </h4>
                    <span className="fs-3 fw-bold d-block">
                      {peakDemand > 2000 ? `${peakDemand.toLocaleString('en-IN')} MW` : `${peakDemand.toFixed(1)} MU`}
                    </span>
                    <span className="small opacity-75" style={{ fontSize: "0.75rem" }}>
                      Met on {peakDemandDate || "-"}
                    </span>
                  </div>
                </div>
              </div>

              {/* TILE 3: SYSTEM CAPACITY ANALYTIC METRIC */}
              <div className="col-12 col-md-4">
                <div
                  className="theme-stat-card border-0 text-white h-100"
                  style={{ background: "linear-gradient(135deg, #17876D 0%, #03624C 100%)" }}
                >
                  <div className="theme-icon-container" style={{ color: "#AACBC4" }}>
                    <Database size={22} />
                  </div>
                  <div>
                    <h4 className="text-white opacity-75 small fw-bold mb-1 uppercase-label">
                      Avg Availability (15d)
                    </h4>
                    <span className="fs-3 fw-bold d-block">
                      {avgAvailability > 2000 ? `${avgAvailability.toLocaleString('en-IN')} MW` : `${avgAvailability.toFixed(1)} MU`}
                    </span>
                    <span className="small opacity-75" style={{ fontSize: "0.75rem" }}>
                      Cumulative Region Volume
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* VOLTAGE PROFILE COMPACT TILE ROW */}
        <div className="row g-4 mb-4">
          <div className="col-12 col-md-4">
            <VoltageProfileMap voltageData={voltageData} voltageLoading={voltageLoading} />
          </div>
        </div>

        {/* ANALYTICS CHARTS SECTION */}
        {analyticsLoading ? (
          <div className="theme-glass-card p-5 text-center bg-white">
            <div className="spinner-border text-success mb-3 animate-spin-custom" role="status">
              <span className="visually-hidden">Loading Charts...</span>
            </div>
            <p className="text-secondary small mb-0">Rendering operational curves...</p>
          </div>
        ) : !hasData ? (
          /* EMPTY STATE CHARTS PLACEHOLDER */
          <div className="theme-glass-card p-5 text-center bg-white border border-light">
            <Info size={40} className="text-secondary mb-3 opacity-50" />
            <h4 className="text-dark fw-bold mb-2">No Operational Data Synced</h4>
            <p className="text-muted small mx-auto mb-0" style={{ maxWidth: "480px" }}>
              Please navigate to the PSP Admin page to run a synchronization range. Once historical reports are imported, load distribution profiles and state allocation share graphics will be rendered automatically.
            </p>
          </div>
        ) : (
          /* ACTUAL CHARTS ROW */
          <>
            <div className="row g-4 mb-4">
            {/* CHART 1: DAILY TREND OF DEMAND VS AVAILABILITY */}
            <div className="col-12 col-lg-8">
              <div className="theme-glass-card p-4 h-100">
                <div className="mb-4">
                  <h3 className="h6 fw-bold mb-0 text-dark">Daily Demand & Availability Trend</h3>
                  <p className="small text-muted mb-0" style={{ fontSize: "0.75rem" }}>
                    Historical regional power requirement vs availability curves (past 15 days).
                  </p>
                </div>

                <div style={{ width: "100%", height: "300px" }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={trendData}
                      margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="colorDemand" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#00DF81" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#00DF81" stopOpacity={0.0} />
                        </linearGradient>
                        <linearGradient id="colorAvail" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#2CC295" stopOpacity={0.15} />
                          <stop offset="95%" stopColor="#2CC295" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(170,203,196,0.2)" />
                      <XAxis dataKey="date" stroke="#0B453A" style={{ fontSize: "0.75rem" }} />
                      <YAxis stroke="#0B453A" style={{ fontSize: "0.75rem" }} />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length >= 2) {
                            return (
                              <div className="theme-chart-tooltip">
                                <p className="mb-1 fw-bold">{`Date: ${payload[0].payload.date}`}</p>
                                <p className="mb-1" style={{ color: "#00DF81" }}>{`Demand: ${payload[0].value?.toLocaleString('en-IN') || 0}`}</p>
                                <p className="mb-0" style={{ color: "#2CC295" }}>{`Availability: ${payload[1].value?.toLocaleString('en-IN') || 0}`}</p>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="requirement"
                        name="Demand"
                        stroke="#00DF81"
                        strokeWidth={3}
                        fillOpacity={1}
                        fill="url(#colorDemand)"
                      />
                      <Area
                        type="monotone"
                        dataKey="availability"
                        name="Availability"
                        stroke="#2CC295"
                        strokeWidth={2}
                        strokeDasharray="4 4"
                        fillOpacity={1}
                        fill="url(#colorAvail)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* CHART 2: STATE WISE POWER ALLOCATION */}
            <div className="col-12 col-lg-4">
              <div className="theme-glass-card p-4 h-100">
                <div className="mb-4">
                  <h3 className="h6 fw-bold mb-0 text-dark">State Requirement vs Availability</h3>
                  <p className="small text-muted mb-0" style={{ fontSize: "0.75rem" }}>
                    Requirement vs availability share per state (Latest: {latestDate}).
                  </p>
                </div>

                <div style={{ width: "100%", height: "300px" }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={stateData}
                      margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(170,203,196,0.2)" />
                      <XAxis dataKey="name" stroke="#0B453A" style={{ fontSize: "0.75rem" }} />
                      <YAxis stroke="#0B453A" style={{ fontSize: "0.75rem" }} />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length >= 2) {
                            return (
                              <div className="theme-chart-tooltip">
                                <p className="mb-1 fw-bold">{`${payload[0].payload.name}`}</p>
                                <p className="mb-1" style={{ color: "#00DF81" }}>{`Requirement: ${payload[0].value?.toLocaleString('en-IN') || 0} MW`}</p>
                                <p className="mb-0" style={{ color: "#2CC295" }}>{`Availability: ${payload[1].value?.toLocaleString('en-IN') || 0} MW`}</p>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Bar dataKey="requirement" name="Requirement" fill="#03624C" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="availability" name="Availability" fill="#2CC295" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>

          {/* SIDE-BY-SIDE DONUT AND BUTTERFLY CHARTS */}
          <div className="row g-4 mb-4">
            {/* COMPACT STATE ENERGY CONSUMPTION DONUT CHART */}
            <div className="col-12 col-lg-4">
              <div className="theme-glass-card p-4 h-100 d-flex flex-column justify-content-between">
                <div className="mb-3 d-flex align-items-center justify-content-between">
                  <div className="text-start">
                    <h3 className="h6 fw-bold mb-0 text-dark d-flex align-items-center gap-2">
                      <PieChartIcon size={16} className="text-success" />
                      <span>State Energy Consumption</span>
                    </h3>
                    <p className="small text-muted mb-0" style={{ fontSize: "0.72rem" }}>
                      Total region energy share (Latest: {energyData?.date || portfolioData?.date || latestDate}).
                    </p>
                  </div>
                  <button
                    className="btn btn-sm btn-link p-0 text-success ms-auto d-flex align-items-center"
                    onClick={() => setEnergyModalOpen(true)}
                    title="View Energy Share Details Table"
                  >
                    <Info size={16} />
                  </button>
                </div>

                {energyLoading ? (
                  <div className="d-flex align-items-center justify-content-center flex-grow-1" style={{ height: "240px" }}>
                    <div className="spinner-border text-success spinner-border-sm" role="status"></div>
                    <span className="text-secondary small ms-2">Loading Donut...</span>
                  </div>
                ) : !energyData?.states || energyData.states.length === 0 ? (
                  <div className="d-flex flex-column align-items-center justify-content-center text-center flex-grow-1" style={{ height: "240px" }}>
                    <Info size={32} className="text-secondary mb-2 opacity-50" />
                    <p className="text-muted small mb-0">No energy consumption data available.</p>
                  </div>
                ) : (
                  <div className="w-100 flex-grow-1 mt-2">
                    <div className="row g-2 align-items-center">
                      <div className="col-12 col-md-5">
                        <div style={{ width: "100%", height: "200px" }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Tooltip content={<DonutTooltip />} />
                              <Pie
                                activeIndex={activePieIndex}
                                activeShape={renderActiveShape}
                                data={energyData.states.map(s => ({
                                  name: s.name,
                                  value: s.consumption
                                }))}
                                cx="50%"
                                cy="50%"
                                innerRadius={42}
                                outerRadius={58}
                                dataKey="value"
                                onMouseEnter={onPieEnter}
                                onMouseLeave={() => setActivePieIndex(-1)}
                                onClick={(data) => {
                                  const clickedName = data?.name || data?.payload?.name;
                                  if (clickedName) {
                                    setSelectedState(clickedName.toUpperCase());
                                  }
                                }}
                                style={{ cursor: "pointer" }}
                              >
                                {energyData.states.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={DONUT_COLORS[index % DONUT_COLORS.length]} />
                                ))}
                              </Pie>
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                      <div className="col-12 col-md-7">
                        {selectedState === null ? (
                          /* MAIN STATE LIST VIEW */
                          <div style={{ maxHeight: "200px", overflowY: "auto", paddingRight: "4px" }} className="theme-scrollbar">
                            {energyData.states.map((state, index) => {
                              const pct = energyData.total > 0 ? (state.consumption / energyData.total * 100) : 0;
                              const isHovered = activePieIndex === index;
                              return (
                                <div
                                  key={state.name}
                                  className="d-flex align-items-center justify-content-between p-1.5 rounded-3 mb-1 transition-all duration-150"
                                  style={{
                                    backgroundColor: isHovered ? "rgba(3, 98, 76, 0.08)" : "transparent",
                                    border: isHovered ? "1px solid rgba(3, 98, 76, 0.15)" : "1px solid transparent",
                                    cursor: "pointer"
                                  }}
                                  onMouseEnter={() => setActivePieIndex(index)}
                                  onMouseLeave={() => setActivePieIndex(-1)}
                                  onClick={() => setSelectedState(state.name.toUpperCase())}
                                >
                                  <div className="d-flex align-items-center gap-2 text-start">
                                    <span
                                      className="rounded-circle d-inline-block"
                                      style={{
                                        width: "8px",
                                        height: "8px",
                                        backgroundColor: DONUT_COLORS[index % DONUT_COLORS.length],
                                        boxShadow: isHovered ? `0 0 6px ${DONUT_COLORS[index % DONUT_COLORS.length]}` : "none",
                                        flexShrink: 0
                                      }}
                                    />
                                    <span 
                                      className={`small ${isHovered ? "fw-bold text-success-emphasis" : "fw-semibold text-dark"}`}
                                      style={{ fontSize: "0.72rem" }}
                                    >
                                      {state.name}
                                    </span>
                                  </div>
                                  <div className="text-end" style={{ flexShrink: 0 }}>
                                    <span className="fw-bold text-dark d-block" style={{ fontSize: "0.72rem", lineHeight: 1.2 }}>
                                      {state.consumption?.toFixed(1)} MU
                                    </span>
                                    <span className="text-muted" style={{ fontSize: "0.62rem" }}>
                                      {pct.toFixed(1)}%
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          /* DETAILED STATE COMPOSITION VIEW WITH SINGLE STACKED BAR */
                          (() => {
                            const stateData = energyBreakdownData?.states?.find(s => s.state === selectedState) || 
                                              (selectedState === "ER" ? energyBreakdownData?.er : null);
                            if (!stateData) {
                              return (
                                <div className="text-center py-4">
                                  <button className="btn btn-sm theme-btn-outline mb-2" onClick={() => setSelectedState(null)}>
                                    <ArrowLeft size={12} className="me-1" /> Back to States
                                  </button>
                                  <p className="text-muted small mb-0">No composition details available.</p>
                                </div>
                              );
                            }
                            
                            const componentsList = [
                              { label: "GNA (DE_ISGS)", key: "gna", color: "#03624C" },
                              { label: "T-GNA (DE_BILT)", key: "tgna", color: "#2CC295" },
                              { label: "RTM", key: "rtm", color: "#00DF81" },
                              { label: "DAM (DE_PX)", key: "dam", color: "#17876D" },
                              { label: "Thermal Gen", key: "thermal", color: "#E28743" },
                              { label: "Hydro Gen", key: "hydro", color: "#3B82F6" },
                              { label: "Solar Gen", key: "solar", color: "#FBBF24" },
                              { label: "Wind Gen", key: "wind", color: "#10B981" },
                              { label: "Small Hydro Gen", key: "small_hydro", color: "#60A5FA" },
                              { label: "Others Gen", key: "others", color: "#A78BFA" },
                              { label: "Deviation (UI)", key: "ui", color: "#64748B" }
                            ];
                            
                            return (
                              <div className="d-flex flex-column text-start h-100" style={{ maxHeight: "200px" }}>
                                {/* Header with back button */}
                                <div className="d-flex align-items-center justify-content-between mb-2">
                                  <button 
                                    className="btn btn-sm btn-link p-0 text-success fw-bold d-flex align-items-center gap-1 text-decoration-none" 
                                    onClick={() => setSelectedState(null)}
                                    style={{ fontSize: "0.72rem" }}
                                  >
                                    <ArrowLeft size={13} /> Back to States
                                  </button>
                                  <span className="badge bg-success-subtle text-success-emphasis fw-bold" style={{ fontSize: "0.68rem" }}>
                                    {selectedState}
                                  </span>
                                </div>
                                
                                {/* Sleek single stacked horizontal bar */}
                                <div style={{ width: "100%", height: "24px" }} className="mb-2 rounded overflow-hidden">
                                  <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={[stateData]} layout="vertical" margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                                      <XAxis type="number" hide />
                                      <YAxis type="category" dataKey="state" hide />
                                      {componentsList.map(c => (
                                        <Bar key={c.key} dataKey={c.key} stackId="single" fill={c.color} />
                                      ))}
                                    </BarChart>
                                  </ResponsiveContainer>
                                </div>
                                
                                {/* Scrollable components list */}
                                <div style={{ overflowY: "auto", paddingRight: "4px" }} className="theme-scrollbar flex-grow-1">
                                  {componentsList.map(c => {
                                    const val = stateData[c.key] || 0;
                                    const pct = stateData.consumption > 0 ? (val / stateData.consumption * 100) : 0;
                                    return (
                                      <div key={c.key} className="d-flex align-items-center justify-content-between py-1 border-bottom border-light-subtle" style={{ fontSize: "0.68rem" }}>
                                        <div className="d-flex align-items-center gap-1.5 text-muted">
                                          <span className="rounded-circle d-inline-block" style={{ width: "6px", height: "6px", backgroundColor: c.color }} />
                                          {c.label}:
                                        </div>
                                        <div className="fw-bold text-dark">
                                          {val.toFixed(2)} MU <span className="text-secondary fw-normal font-monospace">({pct.toFixed(0)}%)</span>
                                        </div>
                                      </div>
                                    );
                                  })}
                                  {/* Total Row */}
                                  <div className="d-flex align-items-center justify-content-between pt-1.5 fw-bold text-success-emphasis" style={{ fontSize: "0.72rem" }}>
                                    <span>Total Consumption:</span>
                                    <span>{stateData.consumption?.toFixed(2)} MU</span>
                                  </div>
                                </div>
                              </div>
                            );
                          })()
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* PORTFOLIO & PEAK DEMAND BREAKDOWN */}
            <div className="col-12 col-lg-8">
              <div className="theme-glass-card p-4 h-100 d-flex flex-column justify-content-between">
                <div className="d-flex align-items-start justify-content-between mb-3 flex-wrap gap-2">
                  <div className="text-start">
                    <h3 className="h6 fw-bold mb-0 text-dark d-flex align-items-center gap-2">
                      <Activity size={16} className="text-success" />
                      <span>Power Portfolio & Peak Demand Breakdown</span>
                    </h3>
                    <p className="small text-muted mb-0" style={{ fontSize: "0.72rem" }}>
                      {viewMode === "current" 
                        ? `Operational day demand met at peak time (MW) — Date: ${portfolioData?.date || latestDate}` 
                        : "All-time maximum peak demand met portfolio (MW)"}
                    </p>
                  </div>

                  {/* Mode selector */}
                  <div>
                    <select 
                      className="form-select form-select-sm theme-input py-1"
                      style={{ fontSize: "0.75rem", minWidth: "180px", borderRadius: "8px" }}
                      value={viewMode}
                      onChange={(e) => setViewMode(e.target.value)}
                    >
                      <option value="current">Current Operational Day</option>
                      <option value="peak">All-Time Peak Record</option>
                    </select>
                  </div>
                </div>

                {/* Show ER peak summary badge if available */}
                {viewMode === "current" && portfolioData?.er_data ? (
                  <div className="d-flex align-items-center justify-content-between mb-3 px-3 py-2 rounded bg-light border border-light-subtle">
                    <span className="small text-dark fw-semibold d-flex align-items-center gap-1">
                      <Zap size={13} className="text-warning" />
                      Regional peak demand met (ER):
                    </span>
                    <span className="fw-bold text-success" style={{ fontSize: "0.95rem" }}>
                      {portfolioData.er_data.max_demand?.toLocaleString()} MW <span className="text-muted fw-normal small">at {portfolioData.er_data.time}</span>
                    </span>
                  </div>
                ) : null}

                {viewMode === "peak" && highestRecords.find(r => r.state === "ER") ? (
                  <div className="d-flex align-items-center justify-content-between mb-3 px-3 py-2 rounded bg-light border border-light-subtle">
                    <span className="small text-dark fw-semibold d-flex align-items-center gap-1">
                      <Zap size={13} className="text-warning" />
                      Regional All-Time peak demand record:
                    </span>
                    <span className="fw-bold text-success" style={{ fontSize: "0.95rem" }}>
                      {highestRecords.find(r => r.state === "ER").max_demand?.toLocaleString()} MW <span className="text-muted fw-normal small">on {highestRecords.find(r => r.state === "ER").date}</span>
                    </span>
                  </div>
                ) : null}

                {(viewMode === "current" ? portfolioLoading : highestLoading) ? (
                  <div className="d-flex align-items-center justify-content-center flex-grow-1" style={{ height: "300px" }}>
                    <div className="spinner-border text-success spinner-border-sm" role="status"></div>
                    <span className="text-secondary small ms-2">Loading Breakdown...</span>
                  </div>
                ) : (viewMode === "current" ? !portfolioData?.data : highestRecords.length === 0) ? (
                  <div className="d-flex flex-column align-items-center justify-content-center text-center flex-grow-1" style={{ height: "300px" }}>
                    <Info size={32} className="text-secondary mb-2 opacity-50" />
                    <p className="text-muted small mb-0">No operational portfolio breakdown available.</p>
                  </div>
                ) : (
                  <div className="flex-grow-1">
                    {/* Butterfly chart */}
                    <div style={{ width: "100%", height: "300px" }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={
                            viewMode === "current"
                              ? (portfolioData?.data || []).map(item => ({
                                  state: item.state,
                                  thermal: -Math.abs(item.internal_gen?.thermal || 0),
                                  hydro: -Math.abs(item.internal_gen?.hydro || 0),
                                  solar: -Math.abs(item.internal_gen?.solar || 0),
                                  biogas: -Math.abs(item.internal_gen?.biogas || 0),
                                  nuclear: -Math.abs(item.internal_gen?.nuclear || 0),
                                  isgs: Math.abs(item.portfolio?.isgs || 0),
                                  gna: Math.abs(item.portfolio?.gna || 0),
                                  tgna: Math.abs(item.portfolio?.tgna || 0),
                                  idam: Math.abs(item.portfolio?.idam || 0),
                                  rtm: Math.abs(item.portfolio?.rtm || 0),
                                  dsm: Math.abs(item.portfolio?.dsm || 0),
                                  absThermal: item.internal_gen?.thermal,
                                  absHydro: item.internal_gen?.hydro,
                                  absSolar: item.internal_gen?.solar,
                                  absBiogas: item.internal_gen?.biogas,
                                  absNuclear: item.internal_gen?.nuclear,
                                  absIsgs: item.portfolio?.isgs,
                                  absGna: item.portfolio?.gna,
                                  absTgna: item.portfolio?.tgna,
                                  absIdam: item.portfolio?.idam,
                                  absRtm: item.portfolio?.rtm,
                                  absDsm: item.portfolio?.dsm,
                                  maxDemand: item.max_demand,
                                  time: item.time,
                                  loadshed: item.loadshed
                                }))
                              : (highestRecords.filter(r => r.state !== "ER") || []).map(item => ({
                                  state: item.state,
                                  thermal: -Math.abs(item.portfolio?.thermal || 0),
                                  hydro: -Math.abs(item.portfolio?.hydro || 0),
                                  solar: -Math.abs(item.portfolio?.solar || 0),
                                  biogas: -Math.abs(item.portfolio?.biogas || 0),
                                  nuclear: -Math.abs(item.portfolio?.nuclear || 0),
                                  isgs: Math.abs(item.portfolio?.isgs || 0),
                                  gna: Math.abs(item.portfolio?.gna || 0),
                                  tgna: Math.abs(item.portfolio?.tgna || 0),
                                  idam: Math.abs(item.portfolio?.idam || 0),
                                  rtm: Math.abs(item.portfolio?.rtm || 0),
                                  dsm: Math.abs(item.portfolio?.dsm || 0),
                                  absThermal: item.portfolio?.thermal,
                                  absHydro: item.portfolio?.hydro,
                                  absSolar: item.portfolio?.solar,
                                  absBiogas: item.portfolio?.biogas,
                                  absNuclear: item.portfolio?.nuclear,
                                  absIsgs: item.portfolio?.isgs,
                                  absGna: item.portfolio?.gna,
                                  absTgna: item.portfolio?.tgna,
                                  absIdam: item.portfolio?.idam,
                                  absRtm: item.portfolio?.rtm,
                                  absDsm: item.portfolio?.dsm,
                                  maxDemand: item.max_demand,
                                  time: item.max_demand_time,
                                  loadshed: item.loadshed || 0.0,
                                  peakDate: item.date,
                                  prevPeak: item.previous_highest
                                }))
                          }
                          layout="vertical"
                          margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(170,203,196,0.15)" />
                          <XAxis
                            type="number"
                            stroke="#0B453A"
                            style={{ fontSize: "0.7rem" }}
                            tickFormatter={(val) => Math.abs(val).toLocaleString()}
                          />
                          <YAxis
                            type="category"
                            dataKey="state"
                            stroke="#0B453A"
                            style={{ fontSize: "0.7rem" }}
                          />
                          <Tooltip content={CustomTooltip} />
                          <Legend
                            verticalAlign="top"
                            height={28}
                            iconType="circle"
                            style={{ fontSize: "0.7rem" }}
                          />
                          <ReferenceLine x={0} stroke="#022726" strokeWidth={2} />
                          
                          {/* Left Stack (Negative Gen) */}
                          <Bar dataKey="thermal" stackId="stack" name="Thermal Gen" fill="#E28743" />
                          <Bar dataKey="hydro" stackId="stack" name="Hydro Gen" fill="#00DF81" />
                          <Bar dataKey="solar" stackId="stack" name="Solar Gen" fill="#8FA960" />
                          <Bar dataKey="biogas" stackId="stack" name="BioGas Gen" fill="#17876D" />
                          <Bar dataKey="nuclear" stackId="stack" name="Nuclear Gen" fill="#2CC295" />
                          
                          {/* Right Stack (Positive import schedules) */}
                          <Bar dataKey="isgs" stackId="stack" name="ISGS Drawl" fill="#3B82F6" />
                          <Bar dataKey="gna" stackId="stack" name="GNA Schd" fill="#1D4ED8" />
                          <Bar dataKey="tgna" stackId="stack" name="TGNA Schd" fill="#60A5FA" />
                          <Bar dataKey="idam" stackId="stack" name="iDAM Schd" fill="#8B5CF6" />
                          <Bar dataKey="rtm" stackId="stack" name="RTM Drawl" fill="#A78BFA" />
                          <Bar dataKey="dsm" stackId="stack" name="DSM (Deviation)" fill="#64748B" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ER POWER POSITION TABLE REPLICATION */}
          <div className="row g-4 mb-4">
            <div className="col-12">
              <div className="theme-glass-card p-0 overflow-hidden border border-light-subtle shadow-sm bg-white">
                {/* Table Header Banner */}
                <div 
                  className="p-3 text-white d-flex align-items-center justify-content-between"
                  style={{
                    background: "linear-gradient(135deg, #022726 0%, #03624C 100%)"
                  }}
                >
                  <div className="d-flex align-items-center gap-2">
                    <Zap size={18} className="text-warning animate-pulse" />
                    <span className="fw-bold" style={{ fontSize: "1.05rem", letterSpacing: "-0.01em" }}>
                      ER Power Position: {portfolioData?.date || latestDate}
                    </span>
                  </div>
                  <span className="badge bg-white bg-opacity-20 text-white border border-white border-opacity-10 small font-monospace">
                    Max Demand & Energy
                  </span>
                </div>

                {powerPositionLoading ? (
                  <div className="d-flex align-items-center justify-content-center py-5">
                    <div className="spinner-border text-success spinner-border-sm me-2" role="status"></div>
                    <span className="text-secondary small fw-bold">Loading Power Position Table...</span>
                  </div>
                ) : powerPositionData.length === 0 ? (
                  <div className="text-center py-5 text-muted">
                    <Info size={24} className="mb-2 text-secondary opacity-50" />
                    <p className="small mb-0">No power position records available for this date.</p>
                  </div>
                ) : (
                  <div className="table-responsive">
                    <table className="table table-bordered align-middle mb-0 text-center" style={{ minWidth: "900px" }}>
                      <thead>
                        {/* Super Headers */}
                        <tr className="text-white align-middle" style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: "700" }}>
                          <th 
                            style={{ 
                              backgroundColor: "#6B1D5F", 
                              width: "14%", 
                              borderRight: "2px solid rgba(255,255,255,0.2)",
                              borderBottom: "none"
                            }} 
                            rowSpan="2"
                            className="align-middle fw-bold"
                          >
                            Constituents
                          </th>
                          <th 
                            style={{ 
                              backgroundColor: "#1F7A8C", 
                              borderRight: "2px solid rgba(255,255,255,0.2)",
                              borderBottom: "1px solid rgba(255,255,255,0.2)"
                            }} 
                            colSpan="3"
                            className="fw-bold"
                          >
                            Daily Power Position
                          </th>
                          <th 
                            style={{ 
                              backgroundColor: "#D97706",
                              borderBottom: "1px solid rgba(255,255,255,0.2)"
                            }} 
                            colSpan="5"
                            className="fw-bold"
                          >
                            All Time High
                          </th>
                        </tr>
                        {/* Sub Headers */}
                        <tr className="text-white align-middle" style={{ fontSize: "0.7rem", fontWeight: "700" }}>
                          {/* Daily Power Position Subheaders */}
                          <th style={{ backgroundColor: "#1F7A8C", borderRight: "1px solid rgba(255,255,255,0.15)" }}>Max demand (MW)</th>
                          <th style={{ backgroundColor: "#1F7A8C", borderRight: "1px solid rgba(255,255,255,0.15)" }}>Time</th>
                          <th style={{ backgroundColor: "#1F7A8C", borderRight: "2px solid rgba(255,255,255,0.2)" }}>MU/Day</th>
                          
                          {/* All Time High Subheaders */}
                          <th style={{ backgroundColor: "#D97706", borderRight: "1px solid rgba(255,255,255,0.15)" }}>Demand Met (MW)</th>
                          <th style={{ backgroundColor: "#D97706", borderRight: "1px solid rgba(255,255,255,0.15)" }}>Demand Date</th>
                          <th style={{ backgroundColor: "#D97706", borderRight: "1px solid rgba(255,255,255,0.15)" }}>Demand Time</th>
                          <th style={{ backgroundColor: "#D97706", borderRight: "1px solid rgba(255,255,255,0.15)" }}>MU/Day</th>
                          <th style={{ backgroundColor: "#D97706" }}>Energy Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {powerPositionData.map((row) => {
                          const formatDateForTable = (dateStr) => {
                            if (!dateStr) return "-";
                            try {
                              const parts = dateStr.split("-");
                              const dObj = new Date(parts[0], parts[1] - 1, parts[2]);
                              return dObj.toLocaleDateString("en-GB", {
                                day: "2-digit",
                                month: "short",
                                year: "2-digit"
                              }).replace(/ /g, "-");
                            } catch (e) {
                              return dateStr;
                            }
                          };

                          return (
                            <tr key={row.constituent} style={{ fontSize: "0.82rem", fontWeight: "700" }}>
                              {/* Constituent */}
                              <td 
                                style={{ 
                                  backgroundColor: "#6B1D5F", 
                                  color: "white", 
                                  borderRight: "2px solid rgba(0,0,0,0.1)" 
                                }}
                                className="text-start ps-3"
                              >
                                {row.constituent === "WEST BENGAL" ? "W. Bengal" : row.constituent}
                              </td>

                              {/* Daily Max Demand */}
                              <td 
                                className={`position-relative ${row.demand_break ? "theme-cell-record-break" : ""}`}
                                style={{ backgroundColor: "#FEF9C3", borderRight: "1px solid rgba(0,0,0,0.05)" }}
                              >
                                <span className="d-flex align-items-center justify-content-center gap-1">
                                  {row.daily_demand?.toLocaleString()}
                                  {row.demand_break && <Sparkles size={11} className="text-success animate-pulse" />}
                                </span>
                                {row.demand_break && (
                                  <div className="record-break-tooltip">
                                    <span>New Record Met!</span>
                                    <strong>+{row.demand_diff_mw} MW (+{row.demand_diff_pct}%)</strong>
                                  </div>
                                )}
                              </td>

                              {/* Daily Time */}
                              <td style={{ backgroundColor: "#FEF9C3", borderRight: "1px solid rgba(0,0,0,0.05)" }}>
                                {row.daily_demand_time || "-"}
                              </td>

                              {/* Daily MU/Day */}
                              <td 
                                className={`position-relative ${row.energy_break ? "theme-cell-record-break" : ""}`}
                                style={{ backgroundColor: "#FEF9C3", borderRight: "2px solid rgba(0,0,0,0.1)" }}
                              >
                                <span className="d-flex align-items-center justify-content-center gap-1">
                                  {row.daily_energy?.toFixed(2)}
                                  {row.energy_break && <Sparkles size={11} className="text-success animate-pulse" />}
                                </span>
                                {row.energy_break && (
                                  <div className="record-break-tooltip">
                                    <span>New Record Met!</span>
                                    <strong>+{row.energy_diff_mu} MU (+{row.energy_diff_pct}%)</strong>
                                  </div>
                                )}
                              </td>

                              {/* ATH Demand Met */}
                              <td style={{ backgroundColor: "#E0F2FE", borderRight: "1px solid rgba(0,0,0,0.05)" }}>
                                {row.all_time_demand?.toLocaleString()}
                              </td>

                              {/* ATH Demand Date */}
                              <td style={{ backgroundColor: "#E0F2FE", borderRight: "1px solid rgba(0,0,0,0.05)" }}>
                                {formatDateForTable(row.all_time_demand_date)}
                              </td>

                              {/* ATH Demand Time */}
                              <td style={{ backgroundColor: "#E0F2FE", borderRight: "1px solid rgba(0,0,0,0.05)" }}>
                                {row.all_time_demand_time || "-"}
                              </td>

                              {/* ATH MU/Day */}
                              <td style={{ backgroundColor: "#E0F2FE", borderRight: "1px solid rgba(0,0,0,0.05)" }}>
                                {row.all_time_energy?.toFixed(2)}
                              </td>

                              {/* ATH Energy Date */}
                              <td style={{ backgroundColor: "#E0F2FE" }}>
                                {formatDateForTable(row.all_time_energy_date)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
          <style>{`
            .theme-cell-record-break {
              background-color: #A7F3D0 !important;
              color: #065F46 !important;
              outline: 2px solid #059669;
              outline-offset: -2px;
              animation: pulse-record-break 2s infinite;
              cursor: pointer;
            }
            @keyframes pulse-record-break {
              0% { box-shadow: inset 0 0 4px #059669; }
              50% { box-shadow: inset 0 0 12px #059669; }
              100% { box-shadow: inset 0 0 4px #059669; }
            }
            .record-break-tooltip {
              position: absolute;
              bottom: 125%;
              left: 50%;
              transform: translateX(-50%);
              background-color: #022726;
              color: #fff;
              padding: 8px 12px;
              border-radius: 8px;
              font-size: 0.72rem;
              font-weight: 500;
              box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3);
              white-space: nowrap;
              pointer-events: none;
              opacity: 0;
              visibility: hidden;
              transition: opacity 0.2s, visibility 0.2s;
              z-index: 100;
            }
            .record-break-tooltip::after {
              content: "";
              position: absolute;
              top: 100%;
              left: 50%;
              transform: translateX(-50%);
              border-width: 6px;
              border-style: solid;
              border-color: #022726 transparent transparent transparent;
            }
            .position-relative:hover .record-break-tooltip {
              opacity: 1;
              visibility: visible;
            }
          `}</style>
          </>
        )}

        {/* ENERGY CONSUMPTION DETAILS POPUP MODAL */}
        {energyModalOpen && (
          <div
            className="modal fade show d-block"
            style={{
              backgroundColor: "rgba(2, 39, 38, 0.65)",
              backdropFilter: "blur(4px)",
              zIndex: 1050
            }}
            tabIndex="-1"
          >
            <div className="modal-dialog modal-dialog-centered">
              <div
                className="modal-content theme-glass-card border-0 p-4"
                style={{ borderRadius: "24px" }}
              >
                <div className="modal-header border-0 pb-0 d-flex justify-content-between align-items-center">
                  <div>
                    <h5 className="modal-title fw-bold text-dark">State Energy Share Details</h5>
                    <p className="small text-muted mb-0">
                      Total region energy share (Latest: {energyData?.date || portfolioData?.date || latestDate})
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn-close"
                    onClick={() => setEnergyModalOpen(false)}
                    aria-label="Close"
                    style={{ filter: "invert(0.3)" }}
                  ></button>
                </div>
                <div className="modal-body py-4">
                  {energyLoading ? (
                    <div className="d-flex justify-content-center align-items-center py-5">
                      <div className="spinner-border text-success" role="status" style={{ color: "#17876D" }}>
                        <span className="visually-hidden">Loading energy consumption details...</span>
                      </div>
                    </div>
                  ) : !energyData?.states || energyData.states.length === 0 ? (
                    <div className="text-center text-muted py-5">
                      <Info size={24} className="mb-2 text-secondary" />
                      <p className="mb-0">No energy consumption data found.</p>
                    </div>
                  ) : (
                    <div>
                      {/* Summary Metrics */}
                      <div className="p-3 mb-4 rounded-4 bg-light border border-light-subtle text-start">
                        <span className="text-muted small d-block uppercase-label" style={{ fontSize: "0.68rem" }}>
                          Total region energy consumption
                        </span>
                        <span className="fw-bold text-success" style={{ fontSize: "1.4rem", color: "#03624C" }}>
                          {energyData.total?.toFixed(1)} MU
                        </span>
                      </div>

                      <div
                        className="table-responsive"
                        style={{ maxHeight: "300px", overflowY: "auto" }}
                      >
                        <table className="table table-hover align-middle theme-table mb-0">
                          <thead>
                            <tr>
                              <th scope="col" className="text-start">State</th>
                              <th scope="col" className="text-end">Consumption</th>
                              <th scope="col" className="text-end">Share</th>
                            </tr>
                          </thead>
                          <tbody>
                            {energyData.states.map((state, index) => {
                              const pct = energyData.total > 0 ? (state.consumption / energyData.total * 100) : 0;
                              return (
                                <tr key={state.name}>
                                  <td className="fw-bold text-dark text-start" style={{ fontSize: "0.85rem" }}>
                                    <span className="d-flex align-items-center gap-2">
                                      <span
                                        className="rounded-circle d-inline-block"
                                        style={{
                                          width: "10px",
                                          height: "10px",
                                          backgroundColor: DONUT_COLORS[index % DONUT_COLORS.length]
                                        }}
                                      />
                                      {state.name}
                                    </span>
                                  </td>
                                  <td className="fw-bold text-dark text-end" style={{ fontSize: "0.85rem" }}>
                                    {state.consumption?.toFixed(1)} MU
                                  </td>
                                  <td className="text-secondary text-end" style={{ fontSize: "0.85rem" }}>
                                    {pct.toFixed(1)}%
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
                <div className="modal-footer border-0 pt-0">
                  <button
                    type="button"
                    className="btn theme-btn-outline w-100"
                    onClick={() => setEnergyModalOpen(false)}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* LEDGER POPUP MODAL */}
        {modalOpen && (
          <div
            className="modal fade show d-block"
            style={{
              backgroundColor: "rgba(2, 39, 38, 0.65)",
              backdropFilter: "blur(4px)",
              zIndex: 1050
            }}
            tabIndex="-1"
          >
            <div className="modal-dialog modal-lg modal-dialog-centered">
              <div
                className="modal-content theme-glass-card border-0 p-3"
                style={{ borderRadius: "24px" }}
              >
                <div className="modal-header border-0 pb-0 d-flex justify-content-between align-items-center">
                  <div>
                    <h5 className="modal-title fw-bold text-dark">PSP Ingestion Ledger Tracker</h5>
                    <p className="small text-muted mb-0">
                      Query database records status for any date range.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn-close"
                    onClick={() => setModalOpen(false)}
                    aria-label="Close"
                    style={{ filter: "invert(0.3)" }}
                  ></button>
                </div>
                <div className="modal-body py-4">
                  {/* Date range filter fields */}
                  <div className="row g-3 mb-4 align-items-end">
                    <div className="col-12 col-sm-4">
                      <label className="form-label small fw-bold text-secondary mb-1">
                        Start Date
                      </label>
                      <input
                        type="date"
                        className="form-control theme-input w-100"
                        value={filterStart}
                        onChange={(e) => setFilterStart(e.target.value)}
                      />
                    </div>
                    <div className="col-12 col-sm-4">
                      <label className="form-label small fw-bold text-secondary mb-1">
                        End Date
                      </label>
                      <input
                        type="date"
                        className="form-control theme-input w-100"
                        value={filterEnd}
                        onChange={(e) => setFilterEnd(e.target.value)}
                      />
                    </div>
                    <div className="col-12 col-sm-4">
                      <button
                        className="btn theme-btn-primary w-100 py-2 d-flex align-items-center justify-content-center gap-2"
                        onClick={() => loadModalStatus(filterStart, filterEnd)}
                      >
                        <Search size={16} />
                        <span>Filter Ledger</span>
                      </button>
                    </div>
                  </div>

                  {/* Table container */}
                  {modalLoading ? (
                    <div className="d-flex justify-content-center align-items-center py-5">
                      <div
                        className="spinner-border text-success"
                        role="status"
                        style={{ color: "#17876D" }}
                      >
                        <span className="visually-hidden">Loading status logs...</span>
                      </div>
                    </div>
                  ) : (
                    <div
                      className="table-responsive"
                      style={{ maxHeight: "350px", overflowY: "auto" }}
                    >
                      <table className="table table-hover align-middle theme-table mb-0">
                        <thead>
                          <tr>
                            <th scope="col">Reporting Date</th>
                            <th scope="col">Status</th>
                            <th scope="col">Synced Timestamp (IST)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {modalStatusData.length > 0 ? (
                            modalStatusData.map((row) => (
                              <tr key={row.date}>
                                <td className="fw-bold text-dark" style={{ fontSize: "0.85rem" }}>
                                  <span className="d-flex align-items-center gap-2">
                                    <Calendar size={14} className="text-secondary" />
                                    {row.date}
                                  </span>
                                </td>
                                <td>
                                  {row.status === "SUCCESS" ? (
                                    <span className="theme-badge-success">
                                      <CheckCircle size={12} />
                                      <span>Fetched</span>
                                    </span>
                                  ) : (
                                    <span className="theme-badge-missing">
                                      <AlertCircle size={12} />
                                      <span>Missing</span>
                                    </span>
                                  )}
                                </td>
                                <td className="text-secondary" style={{ fontSize: "0.8rem" }}>
                                  {formatDateTime(row.fetched_at)}
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan="3" className="text-center text-muted py-5">
                                <Info size={24} className="mb-2 text-secondary" />
                                <p className="mb-0">No ingestion records found in selected range.</p>
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
                <div className="modal-footer border-0 pt-0">
                  <button
                    type="button"
                    className="btn theme-btn-outline"
                    onClick={() => setModalOpen(false)}
                  >
                    Close Ledger
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
