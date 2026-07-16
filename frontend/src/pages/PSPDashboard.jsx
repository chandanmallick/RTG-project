import { lazy, Suspense, useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Calendar,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
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
  LineChart,
  Line,
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
  ReferenceDot,
  Legend,
  LabelList
} from "recharts";

import API from "../services/api";

// LAYOUT
import AppShell from "../components/layout/AppShell";
import CalendarInput from "../components/ui/CalendarInput";
import PSPComparisonBar from "../components/ui/PSPComparisonBar";
import { CHART_COLORS, CHART_GRID_PROPS } from "../theme/chartTheme";
const PowerExchangeGraphic = lazy(() => import("../components/PowerExchangeGraphic"));
const PSPStateGenerationSources = lazy(() => import("../components/PSPStateGenerationSources"));
const VoltageProfileMap = lazy(() => import("../components/VoltageProfileMap"));
const PSPHighlightsReport = lazy(() => import("../components/PSPHighlightsReport"));
const PSPFrequencyCheckTiles = lazy(() => import("../components/ui/PSPFrequencyCheckTiles"));
const PSPFrequencyTrendModal = lazy(() => import("../components/ui/PSPFrequencyTrendModal"));

// Donut chart color palette - vibrant, modern, premium
const DONUT_COLORS = CHART_COLORS;

const NLDC_DEMAND_LINES = [
  { key: "ALL INDIA", label: "All India", color: "#08103A", strokeWidth: 3.2 },
  { key: "NR", label: "NR", color: "#0057B7" },
  { key: "WR", label: "WR", color: "#FFB300" },
  { key: "SR", label: "SR", color: "#E91E63" },
  { key: "NER", label: "NER", color: "#009688" },
  { key: "ER", label: "ER", color: "#006845" }
];

const NLDC_DEMAND_COMPONENTS = [
  { key: "solar", label: "Solar Max", suffix: "__solar", maxKey: "max_solar", yearlyMaxKey: "yearly_max_solar", strokeDasharray: "5 4" },
  { key: "non_solar", label: "Non-solar Max", suffix: "__non_solar", maxKey: "max_non_solar", yearlyMaxKey: "yearly_max_non_solar", strokeDasharray: "2 3" }
];

const NLDC_GENERATION_COMPONENTS = [
  { key: "AI_TH", label: "Thermal", color: "#EF4444" },
  { key: "AI_HYD", label: "Hydro", color: "#2563EB" },
  { key: "AI_WIND", label: "Wind", color: "#16A34A" },
  { key: "AI_SOLAR", label: "Solar", color: "#F59E0B" },
  { key: "AI_GAS", label: "Gas", color: "#64748B" },
  { key: "AI_NUC", label: "Nuclear", color: "#7C3AED" },
  { key: "AI_OTHERS", label: "Others", color: "#94A3B8" },
  { key: "AI_PSP", label: "Pump", color: "#0F766E" },
  { key: "AI_BESS", label: "BESS", color: "#DB2777" },
  { key: "NET_TRANSNATIONAL_EXCHANGE", label: "Transnational Exchange", color: "#8B5CF6" }
];

const formatIsoLocal = (dateObj) => (
  `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, "0")}-${String(dateObj.getDate()).padStart(2, "0")}`
);

const NldcYearlyMarkerLabel = ({ viewBox, marker }) => {
  if (!viewBox || !marker) return null;
  const lane = marker.labelLane || 0;
  const offsets = [
    { dx: -58, dy: -42 },
    { dx: 46, dy: -28 },
    { dx: -58, dy: 28 },
    { dx: 46, dy: 42 },
  ];
  const { dx, dy } = offsets[lane % offsets.length];
  const label = marker.labelText || "";
  const width = Math.max(86, label.length * 6.2 + 14);
  const height = 28;
  const x = viewBox.x + dx;
  const y = viewBox.y + dy;
  const rectX = dx < 0 ? x - width : x;
  const textX = rectX + width / 2;

  return (
    <g>
      <line x1={viewBox.x} y1={viewBox.y} x2={textX} y2={y + height / 2} stroke={marker.color} strokeWidth={1} strokeOpacity={0.55} />
      <rect x={rectX} y={y} width={width} height={height} rx={5} fill="#FFFFFF" stroke={marker.color} strokeOpacity={0.8} />
      <text x={textX} y={y + 11} textAnchor="middle" fill={marker.color} fontSize={9} fontWeight={800}>
        {marker.labelTitle}
      </text>
      <text x={textX} y={y + 22} textAnchor="middle" fill="#334155" fontSize={9} fontWeight={700}>
        {marker.labelValue}
      </text>
    </g>
  );
};

const WidgetLoader = ({ minHeight = 120, label = "Loading..." }) => (
  <div className="theme-glass-card bg-white d-flex align-items-center justify-content-center" style={{ minHeight }}>
    <div className="spinner-border text-success spinner-border-sm me-2" role="status" />
    <span className="small fw-bold text-secondary">{label}</span>
  </div>
);

const yearsInRange = (startDate, endDate) => {
  const startYear = Number(String(startDate || "").slice(0, 4));
  const endYear = Number(String(endDate || "").slice(0, 4));
  if (!Number.isFinite(startYear) || !Number.isFinite(endYear) || startYear > endYear) return [];
  return Array.from({ length: endYear - startYear + 1 }, (_, index) => String(startYear + index));
};

const toIsoDate = (value) => {
  if (!value) return "";
  const parts = String(value).trim().split("-");
  if (parts.length !== 3) return "";
  const year = Number(parts[0]);
  const month = Number(parts[1]) - 1;
  const day = Number(parts[2]);
  const dateObj = new Date(year, month, day);
  if (Number.isNaN(dateObj.getTime())) return "";
  return formatIsoLocal(dateObj);
};

const addDays = (dateStr, days) => {
  const iso = toIsoDate(dateStr);
  if (!iso) return "";
  const [year, month, day] = iso.split("-").map(Number);
  const dateObj = new Date(year, month - 1, day);
  dateObj.setDate(dateObj.getDate() + days);
  return formatIsoLocal(dateObj);
};

const formatDisplayDate = (dateStr) => {
  if (!dateStr) return "-";
  const parts = String(dateStr).trim().split("-");
  if (parts.length !== 3) return dateStr;
  const dateObj = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  if (Number.isNaN(dateObj.getTime())) return dateStr;
  return dateObj.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).replace(/ /g, "-");
};

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
              <span className="rounded-circle d-inline-block" style={{ width: "8px", height: "8px", backgroundColor: "#9CA3AF" }} />
              Thermal Gen:
            </span>
            <span className="fw-bold">{data.absThermal?.toLocaleString()} MW</span>
          </div>
          <div className="d-flex justify-content-between align-items-center mb-1" style={{ color: "#1e293b" }}>
            <span className="d-flex align-items-center gap-2">
              <span className="rounded-circle d-inline-block" style={{ width: "8px", height: "8px", backgroundColor: "#2563EB" }} />
              Hydro Gen:
            </span>
            <span className="fw-bold">{data.absHydro?.toLocaleString()} MW</span>
          </div>
          <div className="d-flex justify-content-between align-items-center mb-1" style={{ color: "#1e293b" }}>
            <span className="d-flex align-items-center gap-2">
              <span className="rounded-circle d-inline-block" style={{ width: "8px", height: "8px", backgroundColor: "#FACC15" }} />
              Solar Gen:
            </span>
            <span className="fw-bold">{data.absSolar?.toLocaleString()} MW</span>
          </div>
          <div className="d-flex justify-content-between align-items-center mb-1" style={{ color: "#1e293b" }}>
            <span className="d-flex align-items-center gap-2">
              <span className="rounded-circle d-inline-block" style={{ width: "8px", height: "8px", backgroundColor: "#16A34A" }} />
              BioGas Gen:
            </span>
            <span className="fw-bold">{data.absBiogas?.toLocaleString()} MW</span>
          </div>
          <div className="d-flex justify-content-between align-items-center mb-2.5" style={{ color: "#1e293b" }}>
            <span className="d-flex align-items-center gap-2">
              <span className="rounded-circle d-inline-block" style={{ width: "8px", height: "8px", backgroundColor: "#DB2777" }} />
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
              <span className="rounded-circle d-inline-block" style={{ width: "8px", height: "8px", backgroundColor: "#F97316" }} />
              ISGS Drawl:
            </span>
            <span className="fw-bold">{data.absIsgs?.toLocaleString()} MW</span>
          </div>
          <div className="d-flex justify-content-between align-items-center mb-1" style={{ color: "#1e293b" }}>
            <span className="d-flex align-items-center gap-2">
              <span className="rounded-circle d-inline-block" style={{ width: "8px", height: "8px", backgroundColor: "#7C3AED" }} />
              GNA Schedule:
            </span>
            <span className="fw-bold">{data.absGna?.toLocaleString()} MW</span>
          </div>
          <div className="d-flex justify-content-between align-items-center mb-1" style={{ color: "#1e293b" }}>
            <span className="d-flex align-items-center gap-2">
              <span className="rounded-circle d-inline-block" style={{ width: "8px", height: "8px", backgroundColor: "#06B6D4" }} />
              TGNA Schedule:
            </span>
            <span className="fw-bold">{data.absTgna?.toLocaleString()} MW</span>
          </div>
          <div className="d-flex justify-content-between align-items-center mb-1" style={{ color: "#1e293b" }}>
            <span className="d-flex align-items-center gap-2">
              <span className="rounded-circle d-inline-block" style={{ width: "8px", height: "8px", backgroundColor: "#EC4899" }} />
              iDAM Schedule:
            </span>
            <span className="fw-bold">{data.absIdam?.toLocaleString()} MW</span>
          </div>
          <div className="d-flex justify-content-between align-items-center mb-1" style={{ color: "#1e293b" }}>
            <span className="d-flex align-items-center gap-2">
              <span className="rounded-circle d-inline-block" style={{ width: "8px", height: "8px", backgroundColor: "#FACC15" }} />
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
  const loadSequenceRef = useRef(0);
  const [statusData, setStatusData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sourceRefreshLoading, setSourceRefreshLoading] = useState(false);

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
  const [stateGenSourceData, setStateGenSourceData] = useState(null);
  const [stateGenSourceLoading, setStateGenSourceLoading] = useState(true);
  const [energyModalOpen, setEnergyModalOpen] = useState(false);
  const [energyTrendModalOpen, setEnergyTrendModalOpen] = useState(false);
  const [energyTrendRows, setEnergyTrendRows] = useState([]);
  const [energyTrendLoading, setEnergyTrendLoading] = useState(false);
  const [energyTrendError, setEnergyTrendError] = useState("");
  const [energyTrendStart, setEnergyTrendStart] = useState("");
  const [energyTrendEnd, setEnergyTrendEnd] = useState("");
  const [selectedEnergyTrendKeys, setSelectedEnergyTrendKeys] = useState([
    "er",
    "bihar",
    "dvc",
    "jharkhand",
    "odisha",
    "sikkim",
    "west_bengal"
  ]);
  const [energyTrendFocusKey, setEnergyTrendFocusKey] = useState("all");
  const [showEnergyTrendCallouts, setShowEnergyTrendCallouts] = useState(false);
  const defaultNldcDemandEnd = formatIsoLocal(new Date(Date.now() - 24 * 60 * 60 * 1000));
  const defaultNldcDemandStart = addDays(defaultNldcDemandEnd, -30);
  const [nldcDemandRows, setNldcDemandRows] = useState([]);
  const [nldcDemandRegions, setNldcDemandRegions] = useState([]);
  const [nldcDemandMode, setNldcDemandMode] = useState("daily");
  const [nldcDemandLoading, setNldcDemandLoading] = useState(false);
  const [nldcDemandError, setNldcDemandError] = useState("");
  const [nldcDemandStartDate, setNldcDemandStartDate] = useState(defaultNldcDemandStart);
  const [nldcDemandEndDate, setNldcDemandEndDate] = useState(defaultNldcDemandEnd);
  const [selectedNldcDemandKeys, setSelectedNldcDemandKeys] = useState(["ALL INDIA"]);
  const [nldcDemandViewMode, setNldcDemandViewMode] = useState("overall");
  const [selectedNldcDemandComponents, setSelectedNldcDemandComponents] = useState(["solar", "non_solar"]);
  const [nldcDemandUseSecondaryAxis, setNldcDemandUseSecondaryAxis] = useState(false);
  const [nldcDataModalOpen, setNldcDataModalOpen] = useState(false);
  const [nldcGenerationDate, setNldcGenerationDate] = useState(defaultNldcDemandEnd);
  const [nldcGenerationRows, setNldcGenerationRows] = useState([]);
  const [nldcGenerationComponents, setNldcGenerationComponents] = useState([]);
  const [nldcGenerationLoading, setNldcGenerationLoading] = useState(false);
  const [nldcGenerationError, setNldcGenerationError] = useState("");
  const [selectedState, setSelectedState] = useState(null);
  const [stationModalOpen, setStationModalOpen] = useState(false);
  const [stationModalData, setStationModalData] = useState(null);
  const [stationModalLoading, setStationModalLoading] = useState(false);

  // Popup Modal States
  const [modalOpen, setModalOpen] = useState(false);
  const [modalStatusData, setModalStatusData] = useState([]);
  const [modalLoading, setModalLoading] = useState(false);
  const [filterStart, setFilterStart] = useState("");
  const [filterEnd, setFilterEnd] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [powerPositionData, setPowerPositionData] = useState([]);
  const [powerPositionLoading, setPowerPositionLoading] = useState(true);
  const [powerSystemData, setPowerSystemData] = useState(null);
  const [powerSystemLoading, setPowerSystemLoading] = useState(true);
  const [loadsheddingData, setLoadsheddingData] = useState(null);
  const [loadsheddingLoading, setLoadsheddingLoading] = useState(true);
  const [outageChangeData, setOutageChangeData] = useState(null);
  const [outageChangeLoading, setOutageChangeLoading] = useState(true);
  const [outageModalOpen, setOutageModalOpen] = useState(false);
  const [outageModalType, setOutageModalType] = useState("restored");
  const [exchangeData, setExchangeData] = useState(null);
  const [exchangeLoading, setExchangeLoading] = useState(true);
  const [voltageData, setVoltageData] = useState(null);
  const [voltageLoading, setVoltageLoading] = useState(true);
  const [highlightsModalOpen, setHighlightsModalOpen] = useState(false);
  const [frequencyCheckData, setFrequencyCheckData] = useState(null);
  const [frequencyCheckLoading, setFrequencyCheckLoading] = useState(true);
  const [frequencyTrendOpen, setFrequencyTrendOpen] = useState(false);
  const [frequencyTrendLoading, setFrequencyTrendLoading] = useState(false);
  const [frequencyTrendError, setFrequencyTrendError] = useState("");
  const [frequencyTrend, setFrequencyTrend] = useState(null);
  const [frequencyTrendStartDate, setFrequencyTrendStartDate] = useState("");
  const [frequencyTrendEndDate, setFrequencyTrendEndDate] = useState("");

  const onPieEnter = useCallback((_, index) => {
    setActivePieIndex((current) => (current === index ? current : index));
  }, []);

  const staggerLoadSequence = async (loaders = [], delayMs = 220) => {
    const sequenceId = ++loadSequenceRef.current;
    for (const loader of loaders) {
      if (sequenceId !== loadSequenceRef.current) return;
      await loader();
      if (sequenceId !== loadSequenceRef.current) return;
      if (delayMs > 0) {
        await new Promise((resolve) => window.setTimeout(resolve, delayMs));
      }
    }
  };

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

  const loadEnergyTrend = async (startDate, endDate) => {
    if (!startDate || !endDate) return;
    try {
      setEnergyTrendLoading(true);
      setEnergyTrendError("");
      const res = await API.getPspEnergyTrend(startDate, endDate);
      if (!res.success) throw new Error(res.message || "Unable to load energy trend");
      setEnergyTrendRows((res.rows || []).map((row) => ({
        ...row,
        displayDate: formatDisplayDate(row.date)
      })));
    } catch (err) {
      console.error("Error loading energy trend:", err);
      setEnergyTrendError("Energy trend data could not be loaded.");
      setEnergyTrendRows([]);
    } finally {
      setEnergyTrendLoading(false);
    }
  };

  const loadNldcDemandTrend = async (
    startDate = nldcDemandStartDate,
    endDate = nldcDemandEndDate
  ) => {
    if (!startDate || !endDate) return;
    try {
      setNldcDemandLoading(true);
      setNldcDemandError("");
      const res = await API.getNldcDemandTrend(startDate, endDate);
      if (!res.success) {
        throw new Error(res.message || "Unable to load NLDC demand trend");
      }
      setNldcDemandRows(res.rows || []);
      setNldcDemandRegions(res.regions || []);
      setNldcDemandMode(res.mode || "daily");
      setNldcDemandUseSecondaryAxis(Boolean(res.use_secondary_axis));
    } catch (err) {
      console.error("Error loading NLDC demand trend:", err);
      setNldcDemandError(err.message || "NLDC demand trend data could not be loaded.");
      setNldcDemandRows([]);
      setNldcDemandRegions([]);
    } finally {
      setNldcDemandLoading(false);
    }
  };

  const loadNldcGenerationBreakup = async (dateStr = nldcGenerationDate) => {
    try {
      setNldcGenerationLoading(true);
      setNldcGenerationError("");
      const res = await API.getIndia15MinGenerationBreakup(dateStr);
      if (!res.success) {
        throw new Error(res.message || "Unable to load NLDC generation breakup");
      }
      setNldcGenerationRows(res.rows || []);
      setNldcGenerationComponents(res.components || []);
      if (res.date) {
        setNldcGenerationDate(res.date);
      }
    } catch (err) {
      console.error("Error loading NLDC generation breakup:", err);
      setNldcGenerationError(err.message || "NLDC generation breakup could not be loaded.");
      setNldcGenerationRows([]);
      setNldcGenerationComponents([]);
    } finally {
      setNldcGenerationLoading(false);
    }
  };

  const openNldcDataModal = () => {
    setNldcDataModalOpen(true);
    loadNldcDemandTrend(nldcDemandStartDate, nldcDemandEndDate);
    loadNldcGenerationBreakup(nldcGenerationDate);
  };

  const toggleNldcDemandLine = (key) => {
    setSelectedNldcDemandKeys((prev) => {
      if (prev.includes(key)) {
        return prev.length === 1 ? prev : prev.filter((item) => item !== key);
      }
      return [...prev, key];
    });
  };

  const selectAllNldcDemandRegions = () => {
    setSelectedNldcDemandKeys(NLDC_DEMAND_LINES.map((line) => line.key));
  };

  const selectOnlyAllIndiaDemand = () => {
    setSelectedNldcDemandKeys(["ALL INDIA"]);
  };

  const toggleNldcDemandComponent = (key) => {
    setSelectedNldcDemandComponents((prev) => {
      if (prev.includes(key)) {
        return prev.length === 1 ? prev : prev.filter((item) => item !== key);
      }
      return [...prev, key];
    });
  };

  const openEnergyTrendModal = () => {
    const end = toIsoDate(energyData?.date || portfolioData?.date || selectedDate || latestDate) || formatIsoLocal(new Date());
    const start = addDays(end, -6);
    setEnergyTrendEnd(end);
    setEnergyTrendStart(start);
    setEnergyTrendModalOpen(true);
    loadEnergyTrend(start, end);
  };

  const toggleEnergyTrendLine = (key) => {
    setEnergyTrendFocusKey("custom");
    setSelectedEnergyTrendKeys((prev) => {
      if (prev.includes(key)) {
        return prev.length > 1 ? prev.filter((item) => item !== key) : prev;
      }
      return [...prev, key];
    });
  };

  const handleEnergyTrendFocusChange = (key) => {
    if (key === "custom") {
      setEnergyTrendFocusKey("custom");
      return;
    }
    setEnergyTrendFocusKey(key);
    if (key === "all") {
      setSelectedEnergyTrendKeys(energyTrendLines.map((line) => line.key));
      return;
    }
    setSelectedEnergyTrendKeys([key]);
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

  const loadStateGenerationSources = async (dateStr) => {
    try {
      setStateGenSourceLoading(true);
      const res = await API.getPspStateGenerationSources(dateStr);
      if (res.success) {
        setStateGenSourceData(res);
      }
    } catch (err) {
      console.error("Error loading PSP state generation sources:", err);
    } finally {
      setStateGenSourceLoading(false);
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

  const loadPowerSystemData = async (dateStr) => {
    try {
      setPowerSystemLoading(true);
      const res = await API.getPspPowerSystemData(dateStr);
      if (res.success) {
        setPowerSystemData(res);
      }
    } catch (err) {
      console.error("Error loading power system data:", err);
    } finally {
      setPowerSystemLoading(false);
    }
  };

  const loadLoadshedding = async (dateStr, refresh = false) => {
    try {
      setLoadsheddingLoading(true);
      const res = await API.getPspLoadshedding(dateStr, refresh);
      if (res.success) {
        setLoadsheddingData(res);
      }
    } catch (err) {
      console.error("Error loading loadshedding:", err);
    } finally {
      setLoadsheddingLoading(false);
    }
  };

  const loadGenerationOutageChanges = async (dateStr, refresh = false) => {
    try {
      setOutageChangeLoading(true);
      const res = await API.getPspGenerationOutageChanges(dateStr, refresh);
      if (res.success) {
        setOutageChangeData(res);
      }
    } catch (err) {
      console.error("Error loading generation outage changes:", err);
    } finally {
      setOutageChangeLoading(false);
    }
  };

  const openGeneratingStationsModal = async (state) => {
    try {
      setStationModalOpen(true);
      setStationModalLoading(true);
      setStationModalData(null);
      const res = await API.getPspGeneratingStations(state, powerSystemData?.date || portfolioData?.date || latestDate);
      if (res.success) {
        setStationModalData(res);
      }
    } catch (err) {
      console.error("Error loading generating stations:", err);
    } finally {
      setStationModalLoading(false);
    }
  };

  const loadPortfolioData = async (dateStr, { loadRelatedSections = true } = {}) => {
    let portfolioDate = dateStr || "";
    try {
      setPortfolioLoading(true);
      const res = await API.getPspPortfolioBreakdown(dateStr);
      if (res.success) {
        setPortfolioData(res);
        portfolioDate = res.date || dateStr || "";
        if (loadRelatedSections) {
          await staggerLoadSequence(getPortfolioSectionLoaders(portfolioDate), 180);
        }
      }
    } catch (err) {
      console.error("Error loading portfolio breakdown:", err);
    } finally {
      setPortfolioLoading(false);
    }
    return portfolioDate;
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

  const loadPowerExchange = async (dateStr) => {
    try {
      setExchangeLoading(true);
      const res = await API.getPspPowerExchange(dateStr);
      if (res.success) {
        setExchangeData(res);
      }
    } catch (err) {
      console.error("Error loading PSP power exchange:", err);
    } finally {
      setExchangeLoading(false);
    }
  };

  const loadFrequencyCheck = async (dateStr) => {
    try {
      setFrequencyCheckLoading(true);
      const res = await API.getPspReportChecking(dateStr, false);
      if (res.success) {
        setFrequencyCheckData(res.frequency_check || null);
      }
    } catch (err) {
      console.error("Error loading PSP frequency check:", err);
      setFrequencyCheckData(null);
    } finally {
      setFrequencyCheckLoading(false);
    }
  };

  const loadFrequencyTrend = async (
    start = frequencyTrendStartDate,
    end = frequencyTrendEndDate
  ) => {
    try {
      setFrequencyTrendLoading(true);
      setFrequencyTrendError("");
      const res = await API.getPspFrequencyTrend(start, end);
      if (!res.success) throw new Error(res.message || "Unable to load frequency trend");
      setFrequencyTrend(res);
    } catch (err) {
      console.error("Error loading frequency trend:", err);
      setFrequencyTrendError(err.message || "Unable to load frequency trend.");
    } finally {
      setFrequencyTrendLoading(false);
    }
  };

  const openFrequencyTrend = () => {
    const end = toIsoDate(frequencyCheckData?.date || portfolioData?.date || selectedDate || latestDate) || formatIsoLocal(new Date());
    const start = addDays(end, -14);
    setFrequencyTrendEndDate(end);
    setFrequencyTrendStartDate(start);
    setFrequencyTrendOpen(true);
    loadFrequencyTrend(start, end);
  };

  const getPortfolioSectionLoaders = (dateSource) => {
    const getDate = () => (typeof dateSource === "function" ? dateSource() : dateSource);
    return [
      () => loadEnergyData(getDate()),
      () => loadEnergyBreakdown(getDate()),
      () => loadStateGenerationSources(getDate()),
      () => loadPowerPosition(getDate()),
      () => loadPowerSystemData(getDate()),
      () => loadLoadshedding(getDate()),
      () => loadGenerationOutageChanges(getDate()),
    ];
  };

  const handleDateChange = async (dateStr) => {
    setSelectedDate(dateStr);
    await staggerLoadSequence([
      () => loadPortfolioData(dateStr, { loadRelatedSections: false }),
      ...getPortfolioSectionLoaders(dateStr),
      () => loadPowerExchange(dateStr),
      () => loadVoltageProfile(dateStr),
      () => loadFrequencyCheck(dateStr),
    ], 240);
  };

  const handleRefreshAll = async () => {
    const dateStr = selectedDate || "";
    await staggerLoadSequence([
      () => loadStatus(),
      () => loadAnalytics(),
      () => loadPortfolioData(dateStr, { loadRelatedSections: false }),
      ...getPortfolioSectionLoaders(dateStr),
      () => loadHighestRecords(),
      () => loadPowerExchange(dateStr),
      () => loadVoltageProfile(dateStr),
      () => loadFrequencyCheck(dateStr),
    ], 240);
  };

  const handleFetchSources = async () => {
    try {
      setSourceRefreshLoading(true);
      const targetDate = selectedDate || latestDate || "";
      const res = await API.refreshPspSources(targetDate);
      if (!res.success) {
        console.warn("PSP source refresh completed with failures:", res.failed || res.results || res.message);
      }
      const refreshedDate = res.date || targetDate;
      setSelectedDate(refreshedDate);
      await staggerLoadSequence([
        () => loadStatus(),
        () => loadAnalytics(),
        () => loadPortfolioData(refreshedDate, { loadRelatedSections: false }),
        ...getPortfolioSectionLoaders(refreshedDate),
        () => loadHighestRecords(),
        () => loadPowerExchange(refreshedDate),
        () => loadVoltageProfile(refreshedDate),
        () => loadFrequencyCheck(refreshedDate),
      ], 240);
    } catch (err) {
      console.error("Error refreshing PSP source data:", err);
    } finally {
      setSourceRefreshLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;

    const loadInitialDashboardSections = async () => {
      let portfolioDate = "";
      await staggerLoadSequence([
        () => loadStatus(),
        () => loadAnalytics(),
        async () => {
          portfolioDate = await loadPortfolioData(undefined, { loadRelatedSections: false });
        },
        ...getPortfolioSectionLoaders(() => portfolioDate),
        () => loadHighestRecords(),
        () => loadPowerExchange(),
        () => loadVoltageProfile(),
        () => loadFrequencyCheck(),
      ], 260);

      if (!isMounted) return;
      window.setTimeout(() => {
        if (!isMounted) return;
        loadNldcDemandTrend(defaultNldcDemandStart, defaultNldcDemandEnd);
      }, 600);
    };

    loadInitialDashboardSections();
    return () => {
      isMounted = false;
      loadSequenceRef.current += 1;
    };
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
  const latestEnergyTrendRow = energyTrendRows.length ? energyTrendRows[energyTrendRows.length - 1] : null;
  const energyTrendLines = [
    { key: "er", label: "ER Total", color: "#022726", strokeWidth: 3.2 },
    { key: "bihar", label: "Bihar", color: "#03624C" },
    { key: "dvc", label: "DVC", color: "#F97316" },
    { key: "jharkhand", label: "Jharkhand", color: "#7C3AED" },
    { key: "odisha", label: "Odisha", color: "#2563EB" },
    { key: "sikkim", label: "Sikkim", color: "#16A34A" },
    { key: "west_bengal", label: "West Bengal", color: "#DB2777" }
  ];
  const visibleEnergyTrendLines = energyTrendLines.filter((line) => selectedEnergyTrendKeys.includes(line.key));
  const energyTrendSummaryLine = visibleEnergyTrendLines.length === 1
    ? visibleEnergyTrendLines[0]
    : energyTrendLines.find((line) => line.key === "er");
  const visibleNldcDemandRegionLines = NLDC_DEMAND_LINES.filter((line) => selectedNldcDemandKeys.includes(line.key));
  const visibleNldcDemandLines = nldcDemandViewMode === "solar"
    ? visibleNldcDemandRegionLines.flatMap((line) =>
        NLDC_DEMAND_COMPONENTS
          .filter((component) => selectedNldcDemandComponents.includes(component.key))
          .map((component) => ({
            ...line,
            componentKey: component.key,
            componentLabel: component.label,
            maxKey: component.maxKey,
            yearlyMaxKey: component.yearlyMaxKey,
            strokeDasharray: component.strokeDasharray,
            dataKey: `${line.key}${component.suffix}`,
            label: `${line.label} ${component.label}`
          }))
      )
    : visibleNldcDemandRegionLines.map((line) => ({
        ...line,
        componentKey: "overall",
        componentLabel: "Overall Max",
        maxKey: "max",
        yearlyMaxKey: "yearly_max",
        dataKey: line.key
      }));
  const nldcDemandMaxByKey = Object.fromEntries(
    (nldcDemandRegions || []).map((region) => [region.key, region])
  );
  const nldcDemandHasRegionalSelection = selectedNldcDemandKeys.some((key) => key !== "ALL INDIA");
  const nldcDemandUseRightAxis =
    nldcDemandUseSecondaryAxis &&
    selectedNldcDemandKeys.includes("ALL INDIA") &&
    nldcDemandHasRegionalSelection;
  const nldcGenerationSummaryByKey = Object.fromEntries(
    (nldcGenerationComponents || []).map((component) => [component.key, component])
  );
  const visibleNldcGenerationComponents = NLDC_GENERATION_COMPONENTS.filter((component) =>
    nldcGenerationRows.some((row) => Number(row[component.key] || 0) !== 0)
  );
  const nldcDemandYears = yearsInRange(nldcDemandStartDate, nldcDemandEndDate);
  const nldcDemandYearlyEntries = nldcDemandMode === "yearly"
    ? visibleNldcDemandLines.flatMap((line) => {
        const regionMax = nldcDemandMaxByKey[line.key] || {};
        const byYear = Object.fromEntries((regionMax[line.yearlyMaxKey] || []).filter(Boolean).map((item) => [String(item.year), item]));
        return nldcDemandYears.map((year) => {
          const item = byYear[year] || {};
          return {
            ...item,
            year,
            value: item.value,
            date: item.date,
            time: item.time,
            hasData: Number.isFinite(Number(item.value)),
            dataKey: line.dataKey,
            label: line.label,
            color: line.color,
            regionKey: line.key,
          };
        });
      }).map((marker, index) => ({
        ...marker,
        labelLane: index % 4,
        labelTitle: `${marker.label} ${marker.year}`,
        labelValue: marker.hasData ? `${Number(marker.value || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })} MW` : "No data",
        labelText: `${marker.label} ${marker.year} ${marker.hasData ? Number(marker.value || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 }) : "No data"}`,
      }))
    : [];
  const nldcDemandYearlyMarkers = nldcDemandYearlyEntries.filter((marker) => marker.hasData);
  const nldcDemandYearlyCards = nldcDemandYearlyEntries;
  const formatMw = (value) =>
    Number(value || 0).toLocaleString("en-IN", {
      maximumFractionDigits: 0
    });

  return (
    <AppShell>
      <div className="container-fluid theme-page-container ui-kit-page" style={{ padding: "24px" }}>
        {/* BANNER */}
        <div
          className="theme-glass-card position-relative overflow-hidden border-0 text-white"
          style={{
            background: "linear-gradient(135deg, #08103A 0%, #0057B7 50%, #0F6FDB 100%)",
            minHeight: "90px",
            marginBottom: "20px",
            padding: "18px 24px",
            borderRadius: "18px"
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
                onClick={handleFetchSources}
                disabled={sourceRefreshLoading || loading || analyticsLoading}
                title="Fetch PSP, loadshed/hourly, outage, portfolio, and curve data from source and cache it"
              >
                <Database size={14} className={sourceRefreshLoading ? "animate-spin-custom" : ""} />
                <span>Fetch Sources</span>
              </button>
              <button
                className="btn theme-btn-banner-refresh d-flex align-items-center gap-2"
                onClick={handleRefreshAll}
                disabled={loading || analyticsLoading || sourceRefreshLoading}
              >
                <RefreshCw size={14} className={loading || analyticsLoading ? "animate-spin-custom" : ""} />
                <span>Refresh Data</span>
              </button>
            </div>
          </div>
        </div>

        {/* ROW 1: SUMMARY ROW */}
        <div className="row g-3" style={{ marginBottom: "20px" }}>
          <div className="col-12 col-lg-3">
            <div
              className="theme-glass-card p-4 h-100 d-flex flex-column justify-content-between border border-success-subtle shadow-sm"
              style={{
                background: "linear-gradient(135deg, #ffffff 0%, #E8F1FB 100%)",
                cursor: "pointer",
                minHeight: "180px",
                borderRadius: "18px"
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
                  Last PSP fetch and record status.
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
                  <span className="d-block text-secondary mt-1" style={{ fontSize: "0.72rem" }}>
                    Records: {latestStatus?.records_count ?? latestStatus?.record_count ?? "-"}
                  </span>
                </div>
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

          <div className="col-12 col-lg-4">
            <div className="theme-glass-card p-3 h-100 d-flex flex-column" style={{ minHeight: "180px", borderRadius: "18px" }}>
              <div className="d-flex align-items-center justify-content-between mb-2">
                <h3 className="h6 fw-bold mb-0 text-dark d-flex align-items-center gap-2">
                  <PieChartIcon size={16} className="text-success" />
                  <span>State Energy Consumption</span>
                </h3>
                <div className="d-flex align-items-center gap-2">
                  <button
                    className="btn btn-sm btn-link p-0 text-success d-flex align-items-center"
                    onClick={openEnergyTrendModal}
                    title="View Energy Consumption Trend"
                  >
                    <TrendingUp size={16} />
                  </button>
                  <button
                    className="btn btn-sm btn-link p-0 text-success d-flex align-items-center"
                    onClick={() => setEnergyModalOpen(true)}
                    title="View Energy Share Details Table"
                  >
                    <Info size={16} />
                  </button>
                </div>
              </div>
              {energyLoading ? (
                <div className="d-flex align-items-center justify-content-center flex-grow-1">
                  <div className="spinner-border text-success spinner-border-sm" role="status"></div>
                </div>
              ) : !energyData?.states?.length ? (
                <div className="d-flex align-items-center justify-content-center flex-grow-1 text-muted small">
                  No energy consumption data available.
                </div>
              ) : (
                <div className="row g-2 align-items-center flex-grow-1">
                  <div className="col-5">
                    <div style={{ width: "100%", height: "120px" }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Tooltip content={<DonutTooltip />} />
                          <Pie
                            activeIndex={activePieIndex}
                            activeShape={renderActiveShape}
                            data={energyData.states.map(s => ({ name: s.name, value: s.consumption }))}
                            cx="50%"
                            cy="50%"
                            innerRadius={32}
                            outerRadius={48}
                            dataKey="value"
                            onMouseEnter={onPieEnter}
                            onMouseLeave={() => setActivePieIndex(-1)}
                          >
                            {energyData.states.map((entry, index) => (
                              <Cell key={`summary-cell-${index}`} fill={DONUT_COLORS[index % DONUT_COLORS.length]} />
                            ))}
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <div className="col-7">
                    <div style={{ maxHeight: "118px", overflowY: "auto", paddingRight: "4px" }} className="theme-scrollbar">
                      {energyData.states.slice(0, 6).map((state, index) => {
                        const pct = energyData.total > 0 ? (state.consumption / energyData.total * 100) : 0;
                        return (
                          <div key={state.name} className="d-flex align-items-center justify-content-between py-1 border-bottom border-light-subtle">
                            <div className="d-flex align-items-center gap-2 text-start">
                              <span
                                className="rounded-circle d-inline-block"
                                style={{ width: "7px", height: "7px", backgroundColor: DONUT_COLORS[index % DONUT_COLORS.length] }}
                              />
                              <span className="fw-semibold text-dark" style={{ fontSize: "0.68rem" }}>{state.name}</span>
                            </div>
                            <span className="fw-bold text-dark" style={{ fontSize: "0.68rem" }}>{pct.toFixed(1)}%</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="col-12 col-lg-5">
            <div className="h-100" style={{ minHeight: "180px" }}>
              <Suspense fallback={<WidgetLoader minHeight={180} label="Loading voltage map..." />}>
                <VoltageProfileMap voltageData={voltageData} voltageLoading={voltageLoading} />
              </Suspense>
            </div>
          </div>
        </div>

        {frequencyCheckLoading ? (
          <div className="theme-glass-card p-3 mb-3">
            <div className="d-flex align-items-center justify-content-center py-2">
              <div className="spinner-border text-success spinner-border-sm me-2" role="status"></div>
              <span className="small fw-bold text-secondary">Loading frequency check...</span>
            </div>
          </div>
        ) : (
          <Suspense fallback={<WidgetLoader minHeight={90} label="Loading frequency check..." />}>
            <PSPFrequencyCheckTiles
              data={frequencyCheckData}
              onOpenTrend={openFrequencyTrend}
            />
          </Suspense>
        )}

        <div className="theme-glass-card p-3 mb-3 bg-white" style={{ borderRadius: "18px" }}>
          <div className="d-flex align-items-center justify-content-between gap-3 flex-wrap">
            <div>
              <h3 className="h6 fw-bold mb-1 text-dark d-flex align-items-center gap-2">
                <TrendingUp size={16} className="text-success" />
                <span>NLDC Data</span>
              </h3>
              <p className="small text-muted mb-0" style={{ fontSize: "0.74rem" }}>
                Region and India maximum demand trend plus All India 15-minute generation contribution.
              </p>
            </div>
            <button
              type="button"
              className="btn theme-btn-action d-flex align-items-center gap-2"
              onClick={openNldcDataModal}
            >
              <TrendingUp size={14} />
              <span>Open NLDC Data</span>
            </button>
          </div>
        </div>

        {false && (
        <div className="theme-glass-card p-3 mb-3 bg-white" style={{ borderRadius: "18px" }}>
          <div className="d-flex align-items-start justify-content-between gap-3 flex-wrap mb-3">
            <div>
              <h3 className="h6 fw-bold mb-0 text-dark d-flex align-items-center gap-2">
                <TrendingUp size={16} className="text-success" />
                <span>NLDC Region & India Maximum Demand Trend</span>
              </h3>
              <p className="small text-muted mb-0" style={{ fontSize: "0.72rem" }}>
                {nldcDemandMode === "yearly"
                  ? "Calendar-year maximum demand by selected region."
                  : "Daily maximum demand met by selected region."}
              </p>
            </div>

            <div className="d-flex align-items-end gap-2 flex-wrap">
              <div>
                <label className="form-label small fw-bold text-secondary mb-1">Date Range</label>
                <CalendarInput
                  mode="range"
                  className="form-control theme-input py-1"
                  value={nldcDemandStartDate}
                  endValue={nldcDemandEndDate}
                  onRangeChange={(start, end) => { setNldcDemandStartDate(start); setNldcDemandEndDate(end); }}
                  style={{ fontSize: "0.75rem", width: "210px" }}
                />
              </div>
              <button
                className="btn theme-btn-outline theme-btn-mini d-flex align-items-center gap-2"
                onClick={() => loadNldcDemandTrend(nldcDemandStartDate, nldcDemandEndDate)}
                disabled={nldcDemandLoading}
                style={{ height: "32px" }}
              >
                <RefreshCw size={12} className={nldcDemandLoading ? "animate-spin-custom" : ""} />
                <span>Load</span>
              </button>
            </div>
          </div>

          <div className="d-flex align-items-center gap-2 flex-wrap mb-3">
            <div className="d-flex align-items-center gap-1 me-1">
              <button
                type="button"
                className={`btn theme-btn-mini ${nldcDemandViewMode === "overall" ? "theme-btn-primary" : "theme-btn-outline"}`}
                onClick={() => setNldcDemandViewMode("overall")}
                style={{ fontSize: "0.72rem" }}
              >
                Overall Max
              </button>
              <button
                type="button"
                className={`btn theme-btn-mini ${nldcDemandViewMode === "solar" ? "theme-btn-primary" : "theme-btn-outline"}`}
                onClick={() => setNldcDemandViewMode("solar")}
                style={{ fontSize: "0.72rem" }}
              >
                Solar / Non-solar
              </button>
            </div>
            {nldcDemandViewMode === "solar" && (
              <div className="d-flex align-items-center gap-1 me-1">
                {NLDC_DEMAND_COMPONENTS.map((component) => {
                  const checked = selectedNldcDemandComponents.includes(component.key);
                  return (
                    <button
                      type="button"
                      key={component.key}
                      className={`btn theme-btn-mini ${checked ? "theme-btn-primary" : "theme-btn-outline"}`}
                      onClick={() => toggleNldcDemandComponent(component.key)}
                      style={{ fontSize: "0.72rem" }}
                    >
                      {component.label}
                    </button>
                  );
                })}
              </div>
            )}
            <button
              type="button"
              className="btn theme-btn-outline theme-btn-mini"
              onClick={selectOnlyAllIndiaDemand}
              style={{ fontSize: "0.72rem" }}
            >
              All India Only
            </button>
            <button
              type="button"
              className="btn theme-btn-outline theme-btn-mini"
              onClick={selectAllNldcDemandRegions}
              style={{ fontSize: "0.72rem" }}
            >
              All Regions
            </button>
            {NLDC_DEMAND_LINES.map((line) => {
              const checked = selectedNldcDemandKeys.includes(line.key);
              return (
                <button
                  type="button"
                  key={line.key}
                  className={`btn theme-btn-mini ${checked ? "theme-btn-primary" : "theme-btn-outline"}`}
                  onClick={() => toggleNldcDemandLine(line.key)}
                  style={{
                    fontSize: "0.72rem",
                    borderColor: line.color,
                    color: checked ? undefined : line.color
                  }}
                >
                  {line.label}
                </button>
              );
            })}
            {nldcDemandUseRightAxis && (
              <span className="badge bg-light text-success-emphasis border border-success-subtle ms-auto" style={{ fontSize: "0.68rem" }}>
                Regions on secondary axis
              </span>
            )}
          </div>

          <div className="row g-2 mb-3">
            {visibleNldcDemandLines.map((line) => {
              const regionMax = nldcDemandMaxByKey[line.key] || {};
              const maxItem = regionMax[line.maxKey] || {};
              return (
                <div className="col-12 col-sm-6 col-xl-2" key={`max-${line.dataKey}`}>
                  <div className="rounded border border-light-subtle p-2 h-100" style={{ background: "#F8FAFC" }}>
                    <div className="d-flex align-items-center gap-1 mb-1">
                      <span className="rounded-circle d-inline-block" style={{ width: "7px", height: "7px", backgroundColor: line.color }} />
                      <span className="fw-bold text-dark" style={{ fontSize: "0.72rem" }}>{line.label}</span>
                    </div>
                    <div className="fw-bold text-success-emphasis" style={{ fontSize: "0.94rem" }}>
                      {maxItem.value ? `${formatMw(maxItem.value)} MW` : "-"}
                    </div>
                    <div className="text-muted" style={{ fontSize: "0.68rem" }}>
                      {[formatDisplayDate(maxItem.date), maxItem.time].filter(Boolean).join(" | ") || "-"}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {nldcDemandLoading ? (
            <div className="d-flex align-items-center justify-content-center py-5">
              <div className="spinner-border text-success spinner-border-sm me-2" role="status"></div>
              <span className="text-secondary small fw-bold">Loading NLDC demand trend...</span>
            </div>
          ) : !nldcDemandRows.length ? (
            <div className="text-center py-5 text-muted">
              <Info size={26} className="mb-2 text-secondary opacity-50" />
              <p className="small mb-0">{nldcDemandError || "No NLDC demand records found for this range."}</p>
            </div>
          ) : (
            <div style={{ width: "100%", height: "330px" }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={nldcDemandRows} margin={{ top: 12, right: nldcDemandUseRightAxis ? 34 : 8, left: 0, bottom: 0 }}>
                  <CartesianGrid {...CHART_GRID_PROPS} />
                  <XAxis
                    dataKey="period"
                    stroke="#0B453A"
                    style={{ fontSize: "0.7rem" }}
                    minTickGap={18}
                  />
                  <YAxis
                    yAxisId="left"
                    stroke="#022726"
                    style={{ fontSize: "0.7rem" }}
                    tickFormatter={(value) => `${Math.round(value / 1000)}k`}
                  />
                  {nldcDemandUseRightAxis && (
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      stroke="#17876D"
                      style={{ fontSize: "0.7rem" }}
                      tickFormatter={(value) => `${Math.round(value / 1000)}k`}
                    />
                  )}
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload || !payload.length) return null;
                      const row = payload[0]?.payload || {};
                      return (
                        <div className="theme-chart-tooltip bg-white p-2 border rounded shadow-sm">
                          <div className="fw-bold text-dark mb-1">{label}</div>
                          {payload.map((item) => {
                            const key = item.dataKey;
                            return (
                              <div key={key} className="d-flex justify-content-between gap-3" style={{ fontSize: "0.75rem" }}>
                                <span style={{ color: item.color }}>{item.name}</span>
                                <span className="fw-bold text-dark">
                                  {formatMw(item.value)} MW
                                  <span className="text-muted fw-normal ms-1">
                                    {row[`${key}_date`] || row.date} {row[`${key}_time`] || ""}
                                  </span>
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      );
                    }}
                  />
                  <Legend verticalAlign="top" height={28} iconType="circle" />
                  {visibleNldcDemandLines.map((line) => (
                    <Line
                      key={line.dataKey}
                      type="monotone"
                      dataKey={line.dataKey}
                      name={line.label}
                      yAxisId={nldcDemandUseRightAxis && line.key !== "ALL INDIA" ? "right" : "left"}
                      stroke={line.color}
                      strokeWidth={line.strokeWidth || 2.2}
                      strokeDasharray={line.strokeDasharray || (nldcDemandUseRightAxis && line.key !== "ALL INDIA" ? "5 3" : undefined)}
                      dot={nldcDemandRows.length <= 45}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
        )}

        {/* METRICS & TILES ROW */}
        <div className="d-none">
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
                  background: "linear-gradient(135deg, #08103A 0%, #0057B7 100%)"
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
                  style={{ background: "linear-gradient(135deg, #0F6FDB 0%, #0057B7 100%)" }}
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

        {/* ROW 2: OPERATIONAL VIEW */}
        <div className="row g-3" style={{ marginBottom: "20px" }}>
          <div className="col-12 col-xl-5">
            <Suspense fallback={<WidgetLoader minHeight={220} label="Loading power exchange..." />}>
              <PowerExchangeGraphic data={exchangeData} loading={exchangeLoading} />
            </Suspense>
          </div>
          <div className="col-12 col-xl-7">
            <Suspense fallback={<WidgetLoader minHeight={220} label="Loading generation sources..." />}>
              <PSPStateGenerationSources data={stateGenSourceData} loading={stateGenSourceLoading} />
            </Suspense>
          </div>
        </div>

        {false && (
        <div className="d-none">
          <div className="col-12">
            <Suspense fallback={null}>
              <PSPStateGenerationSources data={stateGenSourceData} loading={stateGenSourceLoading} />
            </Suspense>
          </div>
        </div>
        )}

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
            <div className="d-none">
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
                      <CartesianGrid {...CHART_GRID_PROPS} />
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
                      <CartesianGrid {...CHART_GRID_PROPS} />
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
                      <Bar dataKey="requirement" name="Requirement" fill="#0057B7" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="availability" name="Availability" fill="#2CC295" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>

          {/* ROW 3: ANALYTICS */}
          <div className="row g-3" style={{ marginBottom: "20px" }}>
            {/* COMPACT STATE ENERGY CONSUMPTION DONUT CHART */}
            <div className="d-none">
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
            <div className="col-12 col-xl-7">
              <div className="theme-glass-card p-4 h-100 d-flex flex-column justify-content-between" style={{ minHeight: "360px", borderRadius: "18px" }}>
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
                    <div style={{ width: "100%", height: "260px" }}>
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
                          <CartesianGrid {...CHART_GRID_PROPS} />
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
                          <Bar dataKey="thermal" stackId="stack" name="Thermal Gen" fill="#9CA3AF" />
                          <Bar dataKey="hydro" stackId="stack" name="Hydro Gen" fill="#2563EB" />
                          <Bar dataKey="solar" stackId="stack" name="Solar Gen" fill="#FACC15" />
                          <Bar dataKey="biogas" stackId="stack" name="BioGas Gen" fill="#16A34A" />
                          <Bar dataKey="nuclear" stackId="stack" name="Nuclear Gen" fill="#DB2777" />
                          
                          {/* Right Stack (Positive import schedules) */}
                          <Bar dataKey="isgs" stackId="stack" name="ISGS Drawl" fill="#F97316" />
                          <Bar dataKey="gna" stackId="stack" name="GNA Schd" fill="#7C3AED" />
                          <Bar dataKey="tgna" stackId="stack" name="TGNA Schd" fill="#06B6D4" />
                          <Bar dataKey="idam" stackId="stack" name="iDAM Schd" fill="#EC4899" />
                          <Bar dataKey="rtm" stackId="stack" name="RTM Drawl" fill="#FACC15" />
                          <Bar dataKey="dsm" stackId="stack" name="DSM (Deviation)" fill="#64748B" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="col-12 col-xl-5">
              <div className="theme-glass-card p-0 h-100 overflow-hidden bg-white" style={{ minHeight: "360px", borderRadius: "18px" }}>
                <div
                  className="p-3 text-white d-flex align-items-center justify-content-between"
                  style={{ background: "linear-gradient(135deg, #022726 0%, #03624C 100%)" }}
                >
                  <div className="d-flex align-items-center gap-2">
                    <Zap size={16} className="text-warning" />
                    <span className="fw-bold" style={{ fontSize: "0.95rem" }}>
                      ER Power Position: {portfolioData?.date || latestDate}
                    </span>
                  </div>
                  <div className="d-flex align-items-center gap-2">
                    <button
                      type="button"
                      className="btn btn-sm btn-light py-1 px-2 fw-bold"
                      onClick={() => setHighlightsModalOpen(true)}
                      style={{ fontSize: "0.7rem" }}
                    >
                      PSP Highlights
                    </button>
                    <span className="badge bg-white bg-opacity-20 text-white border border-white border-opacity-10 small">
                      Max Demand & Energy
                    </span>
                  </div>
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
                  <div className="table-responsive theme-scrollbar" style={{ maxHeight: "312px", overflow: "auto" }}>
                    <table className="table table-bordered align-middle mb-0 text-center" style={{ minWidth: "720px", fontSize: "0.68rem" }}>
                      <thead style={{ position: "sticky", top: 0, zIndex: 2 }}>
                        <tr className="text-white align-middle" style={{ textTransform: "uppercase", letterSpacing: "0.03em", fontWeight: 800 }}>
                          <th
                            style={{ backgroundColor: "#6B1D5F", width: "18%", borderRight: "2px solid rgba(255,255,255,0.2)" }}
                            rowSpan="2"
                            className="align-middle"
                          >
                            Constituent
                          </th>
                          <th style={{ backgroundColor: "#1F7A8C" }} colSpan="3">
                            Daily Power Position
                          </th>
                          <th style={{ backgroundColor: "#D97706" }} colSpan="3">
                            All Time High
                          </th>
                        </tr>
                        <tr className="text-white align-middle" style={{ fontWeight: 800 }}>
                          <th style={{ backgroundColor: "#1F7A8C" }}>Max Demand</th>
                          <th style={{ backgroundColor: "#1F7A8C" }}>Time</th>
                          <th style={{ backgroundColor: "#1F7A8C" }}>MU/Day</th>
                          <th style={{ backgroundColor: "#D97706" }}>Demand</th>
                          <th style={{ backgroundColor: "#D97706" }}>Date</th>
                          <th style={{ backgroundColor: "#D97706" }}>MU/Day</th>
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
                            <tr key={row.constituent} style={{ fontWeight: 800 }}>
                              <td className="text-start text-white ps-2" style={{ backgroundColor: "#6B1D5F" }}>
                                {row.constituent === "WEST BENGAL" ? "W. Bengal" : row.constituent}
                              </td>
                              <td style={{ backgroundColor: "#FEF9C3" }}>{row.daily_demand?.toLocaleString()}</td>
                              <td style={{ backgroundColor: "#FEF9C3" }}>{row.daily_demand_time || "-"}</td>
                              <td style={{ backgroundColor: "#FEF9C3" }}>{row.daily_energy?.toFixed(2)}</td>
                              <td style={{ backgroundColor: "#E0F2FE" }}>{row.all_time_demand?.toLocaleString()}</td>
                              <td style={{ backgroundColor: "#E0F2FE" }}>{formatDateForTable(row.all_time_demand_date)}</td>
                              <td style={{ backgroundColor: "#E0F2FE" }}>{row.all_time_energy?.toFixed(2)}</td>
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

          {/* POWER SYSTEM DATA TABLE */}
          <div className="row g-4 mb-4">
            <div className="col-12">
              <div className="theme-glass-card p-0 overflow-hidden border border-light-subtle shadow-sm bg-white">
                <div
                  className="p-3 text-dark d-flex align-items-center justify-content-between"
                  style={{ background: "linear-gradient(135deg, #DDEBC7 0%, #F5F8E8 100%)" }}
                >
                  <div className="d-flex align-items-center gap-2">
                    <Database size={18} className="text-success" />
                    <span className="fw-bold" style={{ fontSize: "1.05rem" }}>
                      Power System Data: {powerSystemData?.date || portfolioData?.date || latestDate}
                    </span>
                  </div>
                  <span className="badge bg-white text-dark border border-success-subtle small">
                    Derived + Date-effective base data
                  </span>
                </div>

                {powerSystemLoading ? (
                  <div className="d-flex align-items-center justify-content-center py-5">
                    <div className="spinner-border text-success spinner-border-sm me-2" role="status"></div>
                    <span className="text-secondary small fw-bold">Loading Power System Data...</span>
                  </div>
                ) : !powerSystemData?.columns?.length ? (
                  <div className="text-center py-5 text-muted">
                    <Info size={24} className="mb-2 text-secondary opacity-50" />
                    <p className="small mb-0">No power system data available for this date.</p>
                  </div>
                ) : (
                  <div className="table-responsive">
                    <table className="table table-bordered align-middle mb-0 text-center" style={{ minWidth: "980px" }}>
                      <thead>
                        <tr style={{ fontSize: "0.76rem" }}>
                          <th className="text-start" style={{ backgroundColor: "#DDEBC7", width: "260px" }}>
                            Power system Data
                          </th>
                          {powerSystemData.columns.map((col) => (
                            <th key={col.key} style={{ backgroundColor: "#DDEBC7" }}>
                              {col.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {powerSystemData.rows.map((metric) => {
                          const formatPowerSystemValue = (value, format) => {
                            if (format === "date") {
                              if (!value) return "-";
                              const parts = String(value).split("-");
                              if (parts.length !== 3) return value;
                              return `${parts[2]}-${parts[1]}-${parts[0]}`;
                            }
                            const num = Number(value || 0);
                            if (format === "number2") return num.toFixed(2);
                            return Math.round(num).toLocaleString();
                          };

                          return (
                            <tr key={metric.key} style={{ fontSize: "0.8rem", fontWeight: 700 }}>
                              <td className="text-start" style={{ backgroundColor: "#F8FAFC" }}>
                                {metric.label}
                              </td>
                              {powerSystemData.columns.map((col) => (
                                <td key={col.key} style={{ backgroundColor: "#FFFFFF" }}>
                                  {metric.key === "installed_capacity" ? (
                                    <button
                                      type="button"
                                      className="btn btn-link p-0 fw-bold text-decoration-none"
                                      onClick={() => openGeneratingStationsModal(col.key)}
                                      style={{ fontSize: "0.8rem", color: "#03624C" }}
                                      title={`View generating stations for ${col.label}`}
                                    >
                                      {formatPowerSystemValue(powerSystemData.values?.[col.key]?.[metric.key], metric.format)}
                                    </button>
                                  ) : (
                                    formatPowerSystemValue(powerSystemData.values?.[col.key]?.[metric.key], metric.format)
                                  )}
                                </td>
                              ))}
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

          {/* LOAD SHEDDING TABLE */}
          <div className="d-none">
            <div className="col-12 col-xl-7">
              <div className="theme-glass-card p-0 overflow-hidden border border-light-subtle shadow-sm bg-white">
                <div
                  className="p-3 text-white d-flex align-items-center justify-content-between"
                  style={{ backgroundColor: "#B0002B" }}
                >
                  <div className="d-flex align-items-center gap-2">
                    <AlertTriangle size={18} />
                    <span className="fw-bold" style={{ fontSize: "1rem" }}>
                      Max Load Shedding: {loadsheddingData?.date || powerSystemData?.date || latestDate}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-sm btn-light py-1 px-2 d-flex align-items-center gap-1"
                    onClick={() => loadLoadshedding(loadsheddingData?.date || powerSystemData?.date || latestDate, true)}
                    disabled={loadsheddingLoading}
                    style={{ fontSize: "0.72rem", fontWeight: 800 }}
                  >
                    <RefreshCw size={12} className={loadsheddingLoading ? "animate-spin-custom" : ""} />
                    Fetch
                  </button>
                </div>

                {loadsheddingLoading ? (
                  <div className="d-flex align-items-center justify-content-center py-4">
                    <div className="spinner-border text-danger spinner-border-sm me-2" role="status"></div>
                    <span className="text-secondary small fw-bold">Loading load shedding...</span>
                  </div>
                ) : !loadsheddingData?.rows?.length ? (
                  <div className="text-center py-4 text-muted">
                    <Info size={22} className="mb-2 text-secondary opacity-50" />
                    <p className="small mb-0">No load shedding data available.</p>
                  </div>
                ) : (
                  <div className="table-responsive">
                    <table className="table table-bordered align-middle text-center mb-0" style={{ minWidth: "460px" }}>
                      <thead>
                        <tr className="text-white" style={{ backgroundColor: "#B0002B", fontSize: "0.78rem" }}>
                          <th style={{ width: "52%", backgroundColor: "#B0002B" }}>Constituents</th>
                          <th style={{ backgroundColor: "#B0002B" }}>Max. Load shedding</th>
                          <th style={{ backgroundColor: "#B0002B" }}>Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {loadsheddingData.rows.map((row) => (
                          <tr key={row.state} style={{ fontWeight: 800, fontSize: "0.82rem" }}>
                            <td className="text-white" style={{ backgroundColor: "#B0002B" }}>
                              {row.state}
                            </td>
                            <td style={{ backgroundColor: "#F8B4B4" }}>
                              {Number(row.max_load_shedding || 0).toLocaleString()}
                            </td>
                            <td style={{ backgroundColor: "#F8B4B4" }}>
                              {row.time || "N/A"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
            <div className="col-12 col-xl-5">
              <div className="theme-glass-card p-0 overflow-hidden border border-light-subtle shadow-sm bg-white h-100">
                <div
                  className="p-3 text-center fw-bold text-dark"
                  style={{ backgroundColor: "#92D050", fontSize: "0.95rem" }}
                >
                  Net generation changes during the day(+/-)
                </div>
                {outageChangeLoading ? (
                  <div className="d-flex align-items-center justify-content-center py-5">
                    <div className="spinner-border text-success spinner-border-sm me-2" role="status"></div>
                    <span className="text-secondary small fw-bold">Loading generation changes...</span>
                  </div>
                ) : !outageChangeData?.summary ? (
                  <div className="text-center py-5 text-muted">
                    <Info size={22} className="mb-2 text-secondary opacity-50" />
                    <p className="small mb-0">No generation outage change data.</p>
                  </div>
                ) : (
                  <table className="table table-bordered align-middle text-center mb-0" style={{ tableLayout: "fixed" }}>
                    <thead>
                      <tr style={{ backgroundColor: "#9DC3E6", fontSize: "0.78rem", fontWeight: 900 }}>
                        <th>Units brought on Bar (MW) (+ve)</th>
                        <th>Units went out of Bar (MW) (-ve)</th>
                        <th>Net generation changes</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr style={{ backgroundColor: "#FFFF00", fontSize: "0.9rem", fontWeight: 900 }}>
                        <td>
                          <button
                            type="button"
                            className="btn btn-link p-0 fw-bold text-decoration-none text-dark"
                            onClick={() => { setOutageModalType("restored"); setOutageModalOpen(true); }}
                          >
                            {Number(outageChangeData.summary.restored_mw || 0).toLocaleString()}
                          </button>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-link p-0 fw-bold text-decoration-none text-dark"
                            onClick={() => { setOutageModalType("tripped"); setOutageModalOpen(true); }}
                          >
                            -{Number(outageChangeData.summary.tripped_mw || 0).toLocaleString()}
                          </button>
                        </td>
                        <td>{Number(outageChangeData.summary.net_mw || 0).toLocaleString()}</td>
                      </tr>
                    </tbody>
                  </table>
                )}
                <div className="d-flex justify-content-end p-2">
                  <button
                    type="button"
                    className="btn btn-sm theme-btn-outline py-1 px-2 d-flex align-items-center gap-1"
                    onClick={() => loadGenerationOutageChanges(outageChangeData?.date || powerSystemData?.date || latestDate, true)}
                    disabled={outageChangeLoading}
                    style={{ fontSize: "0.72rem" }}
                  >
                    <RefreshCw size={12} className={outageChangeLoading ? "animate-spin-custom" : ""} />
                    Fetch
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* ER POWER POSITION TABLE REPLICATION */}
          <div className="d-none">
            <div className="col-12">
              <div className="theme-glass-card p-0 overflow-hidden border border-light-subtle shadow-sm bg-white">
                {/* Table Header Banner */}
                <div 
                  className="p-3 text-white d-flex align-items-center justify-content-between"
                  style={{
                    background: "linear-gradient(135deg, #08103A 0%, #0057B7 100%)"
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

        {highlightsModalOpen && (
          <Suspense fallback={<WidgetLoader minHeight={180} label="Loading report..." />}>
            <PSPHighlightsReport
              open={highlightsModalOpen}
              onClose={() => setHighlightsModalOpen(false)}
              reportDate={portfolioData?.date || latestDate || selectedDate}
              powerPositionData={powerPositionData}
              loadsheddingData={loadsheddingData}
              outageChangeData={outageChangeData}
              portfolioData={portfolioData}
              highestRecords={highestRecords}
              powerSystemData={powerSystemData}
            />
          </Suspense>
        )}

        {nldcDataModalOpen && (
          <div
            className="modal fade show d-block"
            tabIndex="-1"
            style={{ backgroundColor: "rgba(2, 39, 38, 0.55)" }}
            onClick={() => setNldcDataModalOpen(false)}
          >
            <div className="modal-dialog modal-fullscreen-lg-down modal-xl modal-dialog-centered" style={{ maxWidth: "1320px" }} onClick={(event) => event.stopPropagation()}>
              <div className="modal-content theme-glass-card border-0 p-3" style={{ borderRadius: "18px" }}>
                <div className="modal-header border-0 pb-2 d-flex justify-content-between align-items-start">
                  <div>
                    <h5 className="modal-title fw-bold text-dark d-flex align-items-center gap-2 mb-1">
                      <TrendingUp size={18} className="text-success" />
                      NLDC Data
                    </h5>
                    <p className="small text-muted mb-0">
                      Maximum demand trend and All India 15-minute generation contribution from Mongo snapshots.
                    </p>
                  </div>
                  <button type="button" className="btn-close" aria-label="Close" onClick={() => setNldcDataModalOpen(false)} />
                </div>

                <div className="modal-body pt-2" style={{ maxHeight: "82vh", overflowY: "auto" }}>
                  <div className="rounded border border-light-subtle bg-white p-3 mb-3">
                    <div className="d-flex align-items-start justify-content-between gap-3 flex-wrap mb-3">
                      <div>
                        <h3 className="h6 fw-bold mb-0 text-dark">NLDC Region & India Maximum Demand Trend</h3>
                        <p className="small text-muted mb-0" style={{ fontSize: "0.72rem" }}>
                          {nldcDemandMode === "yearly" ? "Daily time series with calendar-year maximum demand callouts." : "Daily maximum demand met by selected region."}
                        </p>
                      </div>
                      <div className="d-flex align-items-end gap-2 flex-wrap">
                        <div>
                          <label className="form-label small fw-bold text-secondary mb-1">Date Range</label>
                          <CalendarInput mode="range" className="form-control theme-input py-1" value={nldcDemandStartDate} endValue={nldcDemandEndDate} onRangeChange={(start, end) => { setNldcDemandStartDate(start); setNldcDemandEndDate(end); }} style={{ fontSize: "0.75rem", width: "210px" }} />
                        </div>
                        <button className="btn theme-btn-outline theme-btn-mini d-flex align-items-center gap-2" onClick={() => loadNldcDemandTrend(nldcDemandStartDate, nldcDemandEndDate)} disabled={nldcDemandLoading} style={{ height: "32px" }}>
                          <RefreshCw size={12} className={nldcDemandLoading ? "animate-spin-custom" : ""} />
                          <span>Load</span>
                        </button>
                      </div>
                    </div>

                    <div className="d-flex align-items-center gap-2 flex-wrap mb-3">
                      <button type="button" className={`btn theme-btn-mini ${nldcDemandViewMode === "overall" ? "theme-btn-primary" : "theme-btn-outline"}`} onClick={() => setNldcDemandViewMode("overall")} style={{ fontSize: "0.72rem" }}>
                        Overall Max
                      </button>
                      <button type="button" className={`btn theme-btn-mini ${nldcDemandViewMode === "solar" ? "theme-btn-primary" : "theme-btn-outline"}`} onClick={() => setNldcDemandViewMode("solar")} style={{ fontSize: "0.72rem" }}>
                        Solar / Non-solar
                      </button>
                      {nldcDemandViewMode === "solar" && NLDC_DEMAND_COMPONENTS.map((component) => {
                        const checked = selectedNldcDemandComponents.includes(component.key);
                        return (
                          <button type="button" key={component.key} className={`btn theme-btn-mini ${checked ? "theme-btn-primary" : "theme-btn-outline"}`} onClick={() => toggleNldcDemandComponent(component.key)} style={{ fontSize: "0.72rem" }}>
                            {component.label}
                          </button>
                        );
                      })}
                      <button type="button" className="btn theme-btn-outline theme-btn-mini" onClick={selectOnlyAllIndiaDemand} style={{ fontSize: "0.72rem" }}>All India Only</button>
                      <button type="button" className="btn theme-btn-outline theme-btn-mini" onClick={selectAllNldcDemandRegions} style={{ fontSize: "0.72rem" }}>All Regions</button>
                      {NLDC_DEMAND_LINES.map((line) => {
                        const checked = selectedNldcDemandKeys.includes(line.key);
                        return (
                          <button type="button" key={line.key} className={`btn theme-btn-mini ${checked ? "theme-btn-primary" : "theme-btn-outline"}`} onClick={() => toggleNldcDemandLine(line.key)} style={{ fontSize: "0.72rem", borderColor: line.color, color: checked ? undefined : line.color }}>
                            {line.label}
                          </button>
                        );
                      })}
                    </div>

                    <div className="row g-2 mb-3">
                      {visibleNldcDemandLines.map((line) => {
                        const regionMax = nldcDemandMaxByKey[line.key] || {};
                        const maxItem = regionMax[line.maxKey] || {};
                        return (
                          <div className="col-12 col-sm-6 col-xl-2" key={`modal-max-${line.dataKey}`}>
                            <div className="rounded border border-light-subtle p-2 h-100" style={{ background: "#F8FAFC" }}>
                              <div className="d-flex align-items-center gap-1 mb-1">
                                <span className="rounded-circle d-inline-block" style={{ width: "7px", height: "7px", backgroundColor: line.color }} />
                                <span className="fw-bold text-dark" style={{ fontSize: "0.72rem" }}>{line.label}</span>
                              </div>
                              <div className="fw-bold text-success-emphasis" style={{ fontSize: "0.94rem" }}>{maxItem.value ? `${formatMw(maxItem.value)} MW` : "-"}</div>
                              <div className="text-muted" style={{ fontSize: "0.68rem" }}>{[formatDisplayDate(maxItem.date), maxItem.time].filter(Boolean).join(" | ") || "-"}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {nldcDemandMode === "yearly" && nldcDemandYearlyCards.length > 0 && (
                      <div className="rounded border border-success-subtle p-2 mb-3" style={{ background: "#F8FAFC" }}>
                        <div className="fw-bold text-dark mb-2" style={{ fontSize: "0.74rem" }}>
                          Yearly Max Callouts
                        </div>
                        <div className="d-flex flex-wrap gap-2">
                          {nldcDemandYearlyCards.map((marker) => (
                            <div
                              key={`yearly-card-${marker.dataKey}-${marker.year}`}
                              className="rounded border border-light-subtle px-2 py-1"
                              style={{ minWidth: "150px", background: marker.hasData ? "#fff" : "#F8FAFC", opacity: marker.hasData ? 1 : 0.72 }}
                            >
                              <div className="d-flex align-items-center gap-1">
                                <span className="rounded-circle d-inline-block" style={{ width: "7px", height: "7px", backgroundColor: marker.color }} />
                                <span className="fw-bold text-dark" style={{ fontSize: "0.68rem" }}>
                                  {marker.label} {marker.year}
                                </span>
                              </div>
                              <div className="fw-bold text-success-emphasis" style={{ fontSize: "0.86rem" }}>
                                {marker.hasData ? `${formatMw(marker.value)} MW` : "-"}
                              </div>
                              <div className="text-muted" style={{ fontSize: "0.65rem" }}>
                                {marker.hasData ? ([formatDisplayDate(marker.date), marker.time].filter(Boolean).join(" | ") || "-") : "No data in range"}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {nldcDemandLoading ? (
                      <div className="d-flex align-items-center justify-content-center py-5">
                        <div className="spinner-border text-success spinner-border-sm me-2" role="status"></div>
                        <span className="text-secondary small fw-bold">Loading NLDC demand trend...</span>
                      </div>
                    ) : !nldcDemandRows.length ? (
                      <div className="text-center py-5 text-muted">
                        <Info size={26} className="mb-2 text-secondary opacity-50" />
                        <p className="small mb-0">{nldcDemandError || "No NLDC demand records found for this range."}</p>
                      </div>
                    ) : (
                      <div style={{ width: "100%", height: "330px" }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={nldcDemandRows} margin={{ top: 64, right: nldcDemandUseRightAxis ? 34 : 14, left: 8, bottom: 0 }}>
                            <CartesianGrid {...CHART_GRID_PROPS} />
                            <XAxis dataKey="period" stroke="#0B453A" style={{ fontSize: "0.7rem" }} minTickGap={18} />
                            <YAxis yAxisId="left" stroke="#022726" style={{ fontSize: "0.7rem" }} tickFormatter={(value) => `${Math.round(value / 1000)}k`} />
                            {nldcDemandUseRightAxis && <YAxis yAxisId="right" orientation="right" stroke="#17876D" style={{ fontSize: "0.7rem" }} tickFormatter={(value) => `${Math.round(value / 1000)}k`} />}
                            <Tooltip
                              content={({ active, payload, label }) => {
                                if (!active || !payload || !payload.length) return null;
                                const row = payload[0]?.payload || {};
                                return (
                                  <div className="theme-chart-tooltip bg-white p-2 border rounded shadow-sm">
                                    <div className="fw-bold text-dark mb-1">{label}</div>
                                    {payload.map((item) => {
                                      const key = item.dataKey;
                                      return (
                                        <div key={key} className="d-flex justify-content-between gap-3" style={{ fontSize: "0.75rem" }}>
                                          <span style={{ color: item.color }}>{item.name}</span>
                                          <span className="fw-bold text-dark">{formatMw(item.value)} MW <span className="text-muted fw-normal ms-1">{row[`${key}_date`] || row.date} {row[`${key}_time`] || ""}</span></span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                );
                              }}
                            />
                            <Legend verticalAlign="top" height={28} iconType="circle" />
                            {nldcDemandYearlyMarkers.map((marker) => (
                              <ReferenceDot
                                key={`yearly-marker-${marker.dataKey}-${marker.year}`}
                                x={marker.date}
                                y={marker.value}
                                yAxisId={nldcDemandUseRightAxis && marker.regionKey !== "ALL INDIA" ? "right" : "left"}
                                r={4}
                                fill="#fff"
                                stroke={marker.color}
                                strokeWidth={2}
                                label={<NldcYearlyMarkerLabel marker={marker} />}
                              />
                            ))}
                            {visibleNldcDemandLines.map((line) => (
                              <Line
                                key={line.dataKey}
                                type="monotone"
                                dataKey={line.dataKey}
                                name={line.label}
                                yAxisId={nldcDemandUseRightAxis && line.key !== "ALL INDIA" ? "right" : "left"}
                                stroke={line.color}
                                strokeWidth={line.strokeWidth || 2.2}
                                strokeDasharray={line.strokeDasharray || (nldcDemandUseRightAxis && line.key !== "ALL INDIA" ? "5 3" : undefined)}
                                dot={nldcDemandRows.length <= 45}
                                connectNulls
                              />
                            ))}
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>

                  <div className="rounded border border-light-subtle bg-white p-3">
                    <div className="d-flex align-items-start justify-content-between gap-3 flex-wrap mb-3">
                      <div>
                        <h3 className="h6 fw-bold mb-0 text-dark d-flex align-items-center gap-2">
                          <Activity size={16} className="text-success" />
                          <span>All India Demand Contribution</span>
                        </h3>
                        <p className="small text-muted mb-0" style={{ fontSize: "0.72rem" }}>
                          Block-wise generation breakup from India_15_Min_Demand for {formatDisplayDate(nldcGenerationDate)}.
                        </p>
                      </div>
                      <div className="d-flex align-items-end gap-2">
                        <div>
                          <label className="form-label small fw-bold text-secondary mb-1">Date</label>
                          <CalendarInput className="form-control theme-input py-1" value={nldcGenerationDate} onChange={setNldcGenerationDate} style={{ fontSize: "0.75rem", width: "145px" }} />
                        </div>
                        <button className="btn theme-btn-outline theme-btn-mini d-flex align-items-center gap-2" onClick={() => loadNldcGenerationBreakup(nldcGenerationDate)} disabled={nldcGenerationLoading} style={{ height: "32px" }}>
                          <RefreshCw size={12} className={nldcGenerationLoading ? "animate-spin-custom" : ""} />
                          <span>Load</span>
                        </button>
                      </div>
                    </div>

                    <div className="row g-2 mb-3">
                      {visibleNldcGenerationComponents.map((component) => {
                        const summary = nldcGenerationSummaryByKey[component.key] || {};
                        return (
                          <div className="col-6 col-md-4 col-xl-2" key={`gen-summary-${component.key}`}>
                            <div className="rounded border border-light-subtle p-2 h-100" style={{ background: "#F8FAFC" }}>
                              <div className="d-flex align-items-center gap-1 mb-1">
                                <span className="rounded-circle d-inline-block" style={{ width: "7px", height: "7px", backgroundColor: component.color }} />
                                <span className="fw-bold text-dark" style={{ fontSize: "0.7rem" }}>{component.label}</span>
                              </div>
                              <div className="fw-bold text-success-emphasis" style={{ fontSize: "0.88rem" }}>{formatMw(summary.max)} MW</div>
                              <div className="text-muted" style={{ fontSize: "0.66rem" }}>Share {Number(summary.share || 0).toFixed(1)}%</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {nldcGenerationLoading ? (
                      <div className="d-flex align-items-center justify-content-center py-5">
                        <div className="spinner-border text-success spinner-border-sm me-2" role="status"></div>
                        <span className="text-secondary small fw-bold">Loading generation contribution...</span>
                      </div>
                    ) : !nldcGenerationRows.length ? (
                      <div className="text-center py-5 text-muted">
                        <Info size={26} className="mb-2 text-secondary opacity-50" />
                        <p className="small mb-0">{nldcGenerationError || "No India 15 Min generation rows found for this date."}</p>
                      </div>
                    ) : (
                      <div style={{ width: "100%", height: "360px" }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={nldcGenerationRows} margin={{ top: 12, right: 18, left: 0, bottom: 0 }}>
                            <CartesianGrid {...CHART_GRID_PROPS} />
                            <XAxis dataKey="timestamp" stroke="#0B453A" style={{ fontSize: "0.7rem" }} minTickGap={18} />
                            <YAxis stroke="#022726" style={{ fontSize: "0.7rem" }} tickFormatter={(value) => `${Math.round(value / 1000)}k`} />
                            <Tooltip
                              content={({ active, payload, label }) => {
                                if (!active || !payload || !payload.length) return null;
                                const total = payload.reduce((sum, item) => sum + Number(item.value || 0), 0);
                                return (
                                  <div className="theme-chart-tooltip bg-white p-2 border rounded shadow-sm" style={{ minWidth: "250px" }}>
                                    <div className="fw-bold text-dark mb-1">{label}</div>
                                    {payload.slice().reverse().map((item) => (
                                      <div key={item.dataKey} className="d-flex justify-content-between gap-3" style={{ fontSize: "0.74rem" }}>
                                        <span style={{ color: item.color }}>{item.name}</span>
                                        <span className="fw-bold text-dark">{formatMw(item.value)} MW</span>
                                      </div>
                                    ))}
                                    <div className="border-top mt-1 pt-1 d-flex justify-content-between fw-bold" style={{ fontSize: "0.74rem" }}>
                                      <span>Total</span>
                                      <span>{formatMw(total)} MW</span>
                                    </div>
                                  </div>
                                );
                              }}
                            />
                            <Legend verticalAlign="top" height={30} iconType="circle" />
                            {visibleNldcGenerationComponents.map((component) => (
                              <Area key={component.key} type="monotone" dataKey={component.key} name={component.label} stackId="generation" stroke={component.color} fill={component.color} fillOpacity={0.72} connectNulls />
                            ))}
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {frequencyTrendOpen && (
          <Suspense fallback={<WidgetLoader minHeight={180} label="Loading frequency trend..." />}>
            <PSPFrequencyTrendModal
              open={frequencyTrendOpen}
              onClose={() => setFrequencyTrendOpen(false)}
              data={frequencyTrend}
              loading={frequencyTrendLoading}
              error={frequencyTrendError}
              startDate={frequencyTrendStartDate}
              endDate={frequencyTrendEndDate}
              onStartDateChange={setFrequencyTrendStartDate}
              onEndDateChange={setFrequencyTrendEndDate}
              onLoad={() => loadFrequencyTrend(frequencyTrendStartDate, frequencyTrendEndDate)}
            />
          </Suspense>
        )}

        {/* PSP HIGHLIGHTS REPORT MODAL */}
        {false && highlightsModalOpen && (
          <div
            className="modal fade show d-block"
            style={{
              backgroundColor: "rgba(2, 39, 38, 0.65)",
              backdropFilter: "blur(4px)",
              zIndex: 1050
            }}
            tabIndex="-1"
          >
            <div className="modal-dialog modal-fullscreen-lg-down modal-xl modal-dialog-centered" style={{ maxWidth: "1180px" }}>
              <div className="modal-content border-0 overflow-hidden" style={{ borderRadius: "18px", backgroundColor: "#F4F7FA" }}>
                <div
                  className="modal-header border-0"
                  style={{
                    background: "linear-gradient(135deg, #022726 0%, #03624C 100%)",
                    padding: "14px 18px"
                  }}
                >
                  <div>
                    <h5 className="modal-title fw-bold text-white mb-0">PSP Highlights</h5>
                    <p className="small text-white opacity-75 mb-0">First page operational summary for {getHighlightsDateLabel()}</p>
                  </div>
                  <div className="d-flex align-items-center gap-2">
                    <button
                      type="button"
                      className="btn btn-sm btn-light fw-bold"
                      onClick={downloadHighlightsWord}
                      disabled={!!highlightExporting}
                      style={{ fontSize: "0.76rem" }}
                    >
                      {highlightExporting === "word" ? "Preparing..." : "Word Download"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm fw-bold text-dark"
                      onClick={downloadHighlightsPdf}
                      disabled={!!highlightExporting}
                      style={{ backgroundColor: "#00DF81", fontSize: "0.76rem" }}
                    >
                      {highlightExporting === "pdf" ? "Preparing..." : "PDF Download"}
                    </button>
                    <button
                      type="button"
                      className="btn-close btn-close-white ms-2"
                      onClick={() => setHighlightsModalOpen(false)}
                      aria-label="Close"
                    />
                  </div>
                </div>
                <div className="modal-body" style={{ overflow: "auto", padding: "18px", backgroundColor: "#EAF0F4" }}>
                  <div
                    ref={highlightsReportRef}
                    style={{
                      width: "1040px",
                      minHeight: "640px",
                      backgroundColor: "#ffffff",
                      padding: "22px 24px",
                      color: "#000",
                      fontFamily: "Arial, sans-serif",
                      margin: "0 auto",
                      border: "1px solid #D8E0E5",
                      borderRadius: "10px",
                      boxShadow: "0 18px 45px rgba(15, 23, 42, 0.16)"
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: "12px",
                        borderBottom: "2px solid #0057B7",
                        paddingBottom: "8px"
                      }}
                    >
                      <div>
                        <div style={{ fontSize: "18px", fontWeight: 900, color: "#022726", lineHeight: 1.1 }}>
                          PSP Operational Highlights
                        </div>
                        <div style={{ fontSize: "11px", fontWeight: 700, color: "#475569", marginTop: "2px" }}>
                          Eastern Region power position, load shedding and generation changes
                        </div>
                      </div>
                      <div
                        style={{
                          backgroundColor: "#E6F7EF",
                          border: "1px solid #78C7A4",
                          color: "#03543F",
                          padding: "6px 10px",
                          borderRadius: "6px",
                          fontSize: "12px",
                          fontWeight: 900
                        }}
                      >
                        {getHighlightsDateLabel()}
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "flex-start", gap: "24px" }}>
                      <table style={{ borderCollapse: "collapse", width: "760px", tableLayout: "fixed", fontSize: "11px", fontWeight: 800 }}>
                        <thead>
                          <tr>
                            <th colSpan="9" style={{ backgroundColor: "#0066FF", color: "#fff", border: "1px solid #111", padding: "4px", fontSize: "12px" }}>
                              ER Power Position: {getHighlightsDateLabel()}
                            </th>
                          </tr>
                          <tr style={{ color: "#fff" }}>
                            <th rowSpan="2" style={{ backgroundColor: "#7A006F", border: "1px solid #111", width: "150px", padding: "4px" }}>
                              Constituents
                            </th>
                            <th colSpan="3" style={{ backgroundColor: "#7A006F", border: "1px solid #111", padding: "4px" }}>
                              Daily Power Position
                            </th>
                            <th colSpan="5" style={{ backgroundColor: "#7A006F", border: "1px solid #111", padding: "4px" }}>
                              All Time High
                            </th>
                          </tr>
                          <tr style={{ color: "#fff" }}>
                            {["Max Demand", "Time", "MU/Day", "Demand Met", "Demand Date", "Demand Time", "MU/Day", "Energy Date"].map((heading) => (
                              <th key={heading} style={{ backgroundColor: "#7A006F", border: "1px solid #111", padding: "4px 3px", lineHeight: 1.15 }}>
                                {heading}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {powerPositionData.map((row) => {
                            const formatReportDate = (dateStr) => {
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
                              <tr key={`highlight-${row.constituent}`}>
                                <td style={{ backgroundColor: "#7A006F", color: "#fff", border: "1px solid #111", padding: "3px", textAlign: "center" }}>
                                  {row.constituent === "WEST BENGAL" ? "W. Bengal" : row.constituent}
                                </td>
                                <td style={{ backgroundColor: "#FFFF00", border: "1px solid #111", padding: "3px", textAlign: "center" }}>
                                  {row.daily_demand?.toLocaleString()}
                                </td>
                                <td style={{ backgroundColor: "#FFFF00", border: "1px solid #111", padding: "3px", textAlign: "center" }}>
                                  {row.daily_demand_time || "-"}
                                </td>
                                <td style={{ backgroundColor: "#FFFF00", border: "1px solid #111", padding: "3px", textAlign: "center" }}>
                                  {row.daily_energy?.toFixed(2)}
                                </td>
                                <td style={{ backgroundColor: "#C9FFFF", border: "1px solid #111", padding: "3px", textAlign: "center" }}>
                                  {row.all_time_demand?.toLocaleString()}
                                </td>
                                <td style={{ backgroundColor: "#C9FFFF", border: "1px solid #111", padding: "3px", textAlign: "center" }}>
                                  {formatReportDate(row.all_time_demand_date)}
                                </td>
                                <td style={{ backgroundColor: "#C9FFFF", border: "1px solid #111", padding: "3px", textAlign: "center" }}>
                                  {row.all_time_demand_time || "-"}
                                </td>
                                <td style={{ backgroundColor: "#C9FFFF", border: "1px solid #111", padding: "3px", textAlign: "center" }}>
                                  {row.all_time_energy?.toFixed(2)}
                                </td>
                                <td style={{ backgroundColor: "#C9FFFF", border: "1px solid #111", padding: "3px", textAlign: "center" }}>
                                  {formatReportDate(row.all_time_energy_date)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      <div
                        style={{
                          flex: 1,
                          minHeight: "18px",
                          backgroundColor: "#FFFF00",
                          borderTop: "1px solid #FFFF00",
                          marginTop: "1px"
                        }}
                      />
                    </div>

                    <div style={{ display: "flex", alignItems: "flex-start", gap: "42px", marginTop: "28px" }}>
                      <table style={{ borderCollapse: "collapse", width: "360px", tableLayout: "fixed", fontSize: "12px", fontWeight: 900 }}>
                        <thead>
                          <tr style={{ color: "#fff" }}>
                            <th style={{ backgroundColor: "#B0002B", border: "1px solid #111", padding: "7px", width: "52%" }}>Constituents</th>
                            <th style={{ backgroundColor: "#B0002B", border: "1px solid #111", padding: "7px" }}>Max. Load shedding</th>
                            <th style={{ backgroundColor: "#B0002B", border: "1px solid #111", padding: "7px" }}>Time</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(loadsheddingData?.rows || []).map((row) => (
                            <tr key={`highlight-load-${row.state}`}>
                              <td style={{ backgroundColor: "#B0002B", color: "#fff", border: "1px solid #111", padding: "4px", textAlign: "center" }}>
                                {row.state}
                              </td>
                              <td style={{ backgroundColor: "#F8B4B4", border: "1px solid #111", padding: "4px", textAlign: "center" }}>
                                {Number(row.max_load_shedding || 0).toLocaleString()}
                              </td>
                              <td style={{ backgroundColor: "#F8B4B4", border: "1px solid #111", padding: "4px", textAlign: "center" }}>
                                {row.time || "N/A"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      <table style={{ borderCollapse: "collapse", width: "250px", tableLayout: "fixed", fontSize: "11px", fontWeight: 900 }}>
                        <thead>
                          <tr>
                            <th colSpan="3" style={{ backgroundColor: "#92D050", border: "1px solid #111", padding: "7px", textAlign: "center", fontSize: "12px" }}>
                              Net generation changes during the day(+/-)
                            </th>
                          </tr>
                          <tr>
                            <th style={{ backgroundColor: "#9DC3E6", border: "1px solid #111", padding: "5px" }}>
                              Units brought on Bar (MW) (+ve)
                            </th>
                            <th style={{ backgroundColor: "#9DC3E6", border: "1px solid #111", padding: "5px" }}>
                              Units went out of Bar (MW) (-ve)
                            </th>
                            <th style={{ backgroundColor: "#9DC3E6", border: "1px solid #111", padding: "5px" }}>
                              Net generation changes
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td style={{ backgroundColor: "#FFFF00", border: "1px solid #111", padding: "4px", textAlign: "center" }}>
                              {Number(outageChangeData?.summary?.restored_mw || 0).toLocaleString()}
                            </td>
                            <td style={{ backgroundColor: "#FFFF00", border: "1px solid #111", padding: "4px", textAlign: "center" }}>
                              -{Number(outageChangeData?.summary?.tripped_mw || 0).toLocaleString()}
                            </td>
                            <td style={{ backgroundColor: "#FFFF00", border: "1px solid #111", padding: "4px", textAlign: "center" }}>
                              {Number(outageChangeData?.summary?.net_mw || 0).toLocaleString()}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* GENERATION OUTAGE CHANGE DETAIL MODAL */}
        {outageModalOpen && (
          <div
            className="modal fade show d-block"
            style={{
              backgroundColor: "rgba(2, 39, 38, 0.65)",
              backdropFilter: "blur(4px)",
              zIndex: 1050
            }}
            tabIndex="-1"
          >
            <div className="modal-dialog modal-xl modal-dialog-centered">
              <div className="modal-content theme-glass-card border-0 p-3" style={{ borderRadius: "20px" }}>
                <div className="modal-header border-0 pb-0 d-flex justify-content-between align-items-center">
                  <div>
                    <h5 className="modal-title fw-bold text-dark">
                      {outageModalType === "restored" ? "Units Brought on Bar" : "Units Went out of Bar"}
                    </h5>
                    <p className="small text-muted mb-0">
                      {outageChangeData?.date} compared with {outageChangeData?.previous_date}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn-close"
                    onClick={() => setOutageModalOpen(false)}
                    aria-label="Close"
                    style={{ filter: "invert(0.3)" }}
                  ></button>
                </div>
                <div className="modal-body py-3">
                  {(() => {
                    const rows = outageModalType === "restored"
                      ? (outageChangeData?.restored || [])
                      : (outageChangeData?.tripped || []);
                    if (!rows.length) {
                      return (
                        <div className="text-center text-muted py-5">
                          <Info size={24} className="mb-2 text-secondary" />
                          <p className="mb-0">No units in this list.</p>
                        </div>
                      );
                    }
                    return (
                      <div className="table-responsive" style={{ maxHeight: "460px", overflowY: "auto" }}>
                        <table className="table table-hover align-middle theme-table mb-0">
                          <thead>
                            <tr>
                              <th className="text-start">Unit</th>
                              <th>Unit No.</th>
                              <th className="text-end">MW</th>
                              <th>Location</th>
                              <th>Owner</th>
                              <th>Fuel</th>
                              <th>Outage Type</th>
                              <th>Outage</th>
                              <th>Restoration</th>
                              <th>Tentative Restoration</th>
                              <th className="text-start">Reason</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((row) => (
                              <tr key={row.id}>
                                <td className="text-start fw-bold text-dark">{row.element_name || "-"}</td>
                                <td>{row.unit_number ?? "-"}</td>
                                <td className="text-end fw-bold">{row.installed_capacity?.toLocaleString()}</td>
                                <td>{row.location || "-"}</td>
                                <td>{row.owner_name || "-"}</td>
                                <td>{row.fuel || "-"}</td>
                                <td>{row.outage_type || "-"}</td>
                                <td>{row.outage_date ? `${row.outage_date} ${row.outage_time || ""}` : "-"}</td>
                                <td>{row.revival_date ? `${row.revival_date} ${row.revival_time || ""}` : "-"}</td>
                                <td>{row.expected_revival_date ? `${row.expected_revival_date} ${row.expected_revival_time || ""}` : "-"}</td>
                                <td className="text-start text-secondary">{row.reason || "-"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  })()}
                </div>
                <div className="modal-footer border-0 pt-0">
                  <button type="button" className="btn theme-btn-outline" onClick={() => setOutageModalOpen(false)}>
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* GENERATING STATIONS DETAIL MODAL */}
        {stationModalOpen && (
          <div
            className="modal fade show d-block"
            style={{
              backgroundColor: "rgba(2, 39, 38, 0.65)",
              backdropFilter: "blur(4px)",
              zIndex: 1050
            }}
            tabIndex="-1"
          >
            <div className="modal-dialog modal-xl modal-dialog-centered">
              <div
                className="modal-content theme-glass-card border-0 p-3"
                style={{ borderRadius: "20px" }}
              >
                <div className="modal-header border-0 pb-0 d-flex justify-content-between align-items-center">
                  <div>
                    <h5 className="modal-title fw-bold text-dark">
                      {stationModalData?.state || "State"} Generating Stations
                    </h5>
                    <p className="small text-muted mb-0">
                      Installed capacity details for {stationModalData?.date || powerSystemData?.date || latestDate}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn-close"
                    onClick={() => setStationModalOpen(false)}
                    aria-label="Close"
                    style={{ filter: "invert(0.3)" }}
                  ></button>
                </div>
                <div className="modal-body py-3">
                  {stationModalLoading ? (
                    <div className="d-flex justify-content-center align-items-center py-5">
                      <div className="spinner-border text-success spinner-border-sm me-2" role="status"></div>
                      <span className="text-secondary small fw-bold">Loading generating stations...</span>
                    </div>
                  ) : !stationModalData?.rows?.length ? (
                    <div className="text-center text-muted py-5">
                      <Info size={24} className="mb-2 text-secondary" />
                      <p className="mb-0">No generating station details found.</p>
                    </div>
                  ) : (
                    <>
                      <div className="d-flex align-items-center justify-content-between p-3 mb-3 rounded bg-light border border-light-subtle">
                        <span className="small text-secondary fw-bold">Total Installed Capacity</span>
                        <span className="fw-bold text-success" style={{ fontSize: "1.1rem" }}>
                          {stationModalData.total_installed_capacity?.toLocaleString()} MW
                        </span>
                      </div>
                      <div className="table-responsive" style={{ maxHeight: "460px", overflowY: "auto" }}>
                        <table className="table table-hover align-middle theme-table mb-0">
                          <thead>
                            <tr>
                              <th className="text-start">Generating Station</th>
                              <th>Type</th>
                              <th>Classification</th>
                              <th className="text-end">Installed MW</th>
                            </tr>
                          </thead>
                          <tbody>
                            {stationModalData.rows.map((row, idx) => (
                              <tr key={`${row.constituent_name}-${idx}`}>
                                <td className="text-start fw-bold text-dark">{row.constituent_name || "-"}</td>
                                <td>{row.station_type || "-"}</td>
                                <td>{row.classification || "-"}</td>
                                <td className="text-end fw-bold">{row.installed_capacity?.toLocaleString()}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
                <div className="modal-footer border-0 pt-0">
                  <button
                    type="button"
                    className="btn theme-btn-outline"
                    onClick={() => setStationModalOpen(false)}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ENERGY CONSUMPTION TREND POPUP MODAL */}
        {energyTrendModalOpen && (
          <div
            className="modal fade show d-block"
            style={{
              backgroundColor: "rgba(2, 39, 38, 0.65)",
              backdropFilter: "blur(4px)",
              zIndex: 1050
            }}
            tabIndex="-1"
          >
            <div className="modal-dialog modal-xl modal-dialog-centered">
              <div
                className="modal-content theme-glass-card border-0 p-3"
                style={{ borderRadius: "22px" }}
              >
                <div className="modal-header border-0 pb-2 d-flex justify-content-between align-items-start">
                  <div>
                    <h5 className="modal-title fw-bold text-dark d-flex align-items-center gap-2">
                      <TrendingUp size={18} className="text-success" />
                      <span>State Energy Consumption Trend</span>
                    </h5>
                    <p className="small text-muted mb-0">
                      {formatDisplayDate(energyTrendStart)} to {formatDisplayDate(energyTrendEnd)} | MU/Day
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn-close"
                    onClick={() => setEnergyTrendModalOpen(false)}
                    aria-label="Close"
                    style={{ filter: "invert(0.3)" }}
                  ></button>
                </div>
                <div className="modal-body pt-2">
                  <div className="row g-3 align-items-end mb-3">
                    <div className="col-12 col-md-4">
                      <label className="form-label small fw-bold text-secondary mb-1">Date Range</label>
                      <CalendarInput mode="range" className="form-control theme-input" value={energyTrendStart} endValue={energyTrendEnd} onRangeChange={(start, end) => { setEnergyTrendStart(start); setEnergyTrendEnd(end); }} />
                    </div>
                    <div className="col-12 col-md-3">
                      <label className="form-label small fw-bold text-secondary mb-1">Trend View</label>
                      <select
                        className="form-select theme-input"
                        value={energyTrendFocusKey}
                        onChange={(event) => handleEnergyTrendFocusChange(event.target.value)}
                      >
                        <option value="all">All States + ER</option>
                        {energyTrendLines.map((line) => (
                          <option key={line.key} value={line.key}>
                            {line.label}
                          </option>
                        ))}
                        <option value="custom" disabled>Custom Selection</option>
                      </select>
                    </div>
                    <div className="col-12 col-md-2">
                      <button
                        type="button"
                        className="btn theme-btn-action w-100 d-flex align-items-center justify-content-center gap-2"
                        onClick={() => loadEnergyTrend(energyTrendStart, energyTrendEnd)}
                        disabled={energyTrendLoading}
                      >
                        <RefreshCw size={14} className={energyTrendLoading ? "animate-spin-custom" : ""} />
                        <span>Apply</span>
                      </button>
                    </div>
                    <div className="col-12 col-md-3">
                      <div className="p-3 rounded-4 bg-light border border-light-subtle h-100 d-flex align-items-center justify-content-between">
                        <div>
                          <span className="text-muted small d-block fw-bold">
                            Latest {energyTrendSummaryLine?.label || "Selected"}
                          </span>
                          <span className="fw-bold text-success" style={{ fontSize: "1.15rem", color: energyTrendSummaryLine?.color || "#03624C" }}>
                            {latestEnergyTrendRow && energyTrendSummaryLine
                              ? `${Number(latestEnergyTrendRow[energyTrendSummaryLine.key] || 0).toFixed(2)} MU`
                              : "-"}
                          </span>
                        </div>
                        <span className="small text-secondary fw-semibold">
                          {latestEnergyTrendRow?.displayDate || "-"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
                    <div className="d-flex align-items-center gap-2 flex-wrap">
                      {energyTrendLines.map((line) => {
                        const checked = selectedEnergyTrendKeys.includes(line.key);
                        return (
                          <label
                            key={line.key}
                            className="d-flex align-items-center gap-2 px-2 py-1 rounded-pill border border-light-subtle bg-light mb-0"
                            style={{ cursor: "pointer", fontSize: "0.76rem", fontWeight: 800 }}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleEnergyTrendLine(line.key)}
                              style={{ accentColor: line.color }}
                            />
                            <span
                              className="rounded-circle d-inline-block"
                              style={{ width: "8px", height: "8px", backgroundColor: line.color }}
                            />
                            <span className={checked ? "text-dark" : "text-muted"}>{line.label}</span>
                          </label>
                        );
                      })}
                    </div>
                    <div className="d-flex align-items-center gap-2">
                      <button
                        type="button"
                        className="btn btn-sm theme-btn-outline"
                        onClick={() => handleEnergyTrendFocusChange("all")}
                        style={{ fontSize: "0.72rem", padding: "4px 10px" }}
                      >
                        All
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm theme-btn-outline"
                        onClick={() => handleEnergyTrendFocusChange("er")}
                        style={{ fontSize: "0.72rem", padding: "4px 10px" }}
                      >
                        ER Only
                      </button>
                      <label
                        className="d-flex align-items-center gap-2 px-2 py-1 rounded-pill border border-light-subtle bg-white mb-0"
                        style={{ cursor: "pointer", fontSize: "0.72rem", fontWeight: 800 }}
                      >
                        <input
                          type="checkbox"
                          checked={showEnergyTrendCallouts}
                          onChange={(event) => setShowEnergyTrendCallouts(event.target.checked)}
                          style={{ accentColor: "#03624C" }}
                        />
                        <span>Data call-outs</span>
                      </label>
                    </div>
                  </div>

                  <div className="theme-glass-card border border-light-subtle p-3" style={{ minHeight: "430px" }}>
                    {energyTrendLoading ? (
                      <div className="d-flex align-items-center justify-content-center" style={{ height: "390px" }}>
                        <div className="spinner-border text-success spinner-border-sm me-2" role="status"></div>
                        <span className="text-secondary small fw-bold">Loading energy trend...</span>
                      </div>
                    ) : !energyTrendRows.length ? (
                      <div className="d-flex flex-column align-items-center justify-content-center text-muted" style={{ height: "390px" }}>
                        <Info size={26} className="mb-2" />
                        <p className="mb-0 small fw-semibold">{energyTrendError || "No energy trend data found for selected date range."}</p>
                      </div>
                    ) : (
                      <>
                        <div style={{ width: "100%", height: "340px" }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={energyTrendRows} margin={{ top: 12, right: 18, left: 0, bottom: 0 }}>
                              <CartesianGrid {...CHART_GRID_PROPS} />
                              <XAxis
                                dataKey="displayDate"
                                tick={{ fontSize: 11, fill: "#475569", fontWeight: 700 }}
                                axisLine={{ stroke: "#CBD5E1" }}
                                tickLine={false}
                              />
                              <YAxis
                                tick={{ fontSize: 11, fill: "#475569", fontWeight: 700 }}
                                axisLine={{ stroke: "#CBD5E1" }}
                                tickLine={false}
                                width={52}
                              />
                              <Tooltip
                                formatter={(value, name) => [`${Number(value || 0).toFixed(2)} MU`, name]}
                                labelStyle={{ fontWeight: 900, color: "#022726" }}
                                contentStyle={{
                                  borderRadius: "10px",
                                  border: "1px solid rgba(2, 39, 38, 0.15)",
                                  boxShadow: "0 10px 20px rgba(15,23,42,0.12)",
                                  fontSize: "0.78rem"
                                }}
                              />
                              <Legend
                                verticalAlign="top"
                                height={32}
                                iconType="circle"
                                wrapperStyle={{ fontSize: "0.75rem", fontWeight: 700 }}
                              />
                              {visibleEnergyTrendLines.map((line) => (
                                <Line
                                  key={line.key}
                                  type="monotone"
                                  dataKey={line.key}
                                  name={line.label}
                                  stroke={line.color}
                                  strokeWidth={line.strokeWidth || 2.4}
                                  dot={{ r: 2.5, strokeWidth: 1 }}
                                  activeDot={{ r: 5 }}
                                  isAnimationActive={false}
                                >
                                  {showEnergyTrendCallouts && (
                                    <LabelList
                                      dataKey={line.key}
                                      position="top"
                                      offset={8}
                                      formatter={(value) => Number(value || 0).toFixed(1)}
                                      style={{
                                        fill: line.color,
                                        fontSize: 10,
                                        fontWeight: 800
                                      }}
                                    />
                                  )}
                                </Line>
                              ))}
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="row g-2 mt-2">
                          {visibleEnergyTrendLines.map((line) => (
                            <div key={line.key} className="col-6 col-md-4 col-lg-2">
                              <div className="p-2 rounded bg-light border border-light-subtle text-center">
                                <span className="small fw-bold d-block" style={{ color: line.color }}>
                                  {line.label}
                                </span>
                                <span className="small text-dark fw-bold">
                                  {Number(latestEnergyTrendRow?.[line.key] || 0).toFixed(2)} MU
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
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

        {powerPositionData.length > 0 && (
          <div className="row g-3" style={{ marginBottom: "20px" }}>
            <div className="col-12">
              <div className="theme-glass-card p-4 h-100">
                <div className="d-flex align-items-start justify-content-between flex-wrap gap-2 mb-3">
                  <div className="text-start">
                    <h3 className="h6 fw-bold mb-0 text-dark d-flex align-items-center gap-2">
                      <Activity size={16} className="text-primary" />
                      <span>PSP State-wise Demand & Energy Comparison</span>
                    </h3>
                    <p className="small text-muted mb-0" style={{ fontSize: "0.72rem" }}>
                      Yesterday is plotted on the same line as the so far highest record for each state.
                    </p>
                  </div>
                  <span className="badge rounded-pill text-primary border border-primary-subtle bg-primary-subtle px-3 py-2">
                    Demand first, Energy second
                  </span>
                </div>

                <div className="row g-3">
                  {[
                    {
                      key: "demand",
                      title: "State-wise Demand",
                      dailyKey: "daily_demand",
                      highKey: "all_time_demand",
                      unit: "MW",
                    },
                    {
                      key: "energy",
                      title: "State-wise Energy",
                      dailyKey: "daily_energy",
                      highKey: "all_time_energy",
                      unit: "MU",
                    },
                  ].map((panel) => {
                    return (
                      <div className="col-12 col-lg-6" key={panel.key}>
                        <div
                          className="p-3 rounded-4 border bg-white h-100"
                          style={{ borderColor: "#B8CCE3" }}
                        >
                          <div className="d-flex align-items-center justify-content-between mb-3">
                            <div>
                              <div className="fw-bold text-dark">{panel.title}</div>
                              <div className="small text-muted" style={{ fontSize: "0.72rem" }}>
                                Full bar = so far highest, filled bar = yesterday
                              </div>
                            </div>
                            <div className="small fw-bold text-primary">{panel.unit}</div>
                          </div>

                          <div
                            className="d-flex flex-column gap-2 theme-scrollbar"
                            style={{ maxHeight: "360px", overflowY: "auto", paddingRight: "4px" }}
                          >
                            {powerPositionData.map((row) => {
                              const daily = Number(row?.[panel.dailyKey] || 0);
                              const high = Number(row?.[panel.highKey] || 0);
                              const barKey = `${panel.key}-${row.constituent}`;

                              return (
                                <PSPComparisonBar
                                  key={barKey}
                                  state={row.constituent}
                                  daily={daily}
                                  high={high}
                                  unit={panel.unit}
                                  metric={panel.key === "demand" ? "Demand" : "Energy"}
                                  dailyDate={row.daily_date || row.daily_energy_date || selectedDate || latestDate}
                                  dailyTime={panel.key === "demand" ? row.daily_demand_time : null}
                                  highDate={panel.key === "demand" ? row.all_time_demand_date : row.all_time_energy_date}
                                  highTime={panel.key === "demand" ? row.all_time_demand_time : null}
                                />
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
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
                    <div className="col-12 col-sm-8">
                      <label className="form-label small fw-bold text-secondary mb-1">
                        Date Range
                      </label>
                      <CalendarInput mode="range" className="form-control theme-input w-100" value={filterStart} endValue={filterEnd} onRangeChange={(start, end) => { setFilterStart(start); setFilterEnd(end); }} />
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
