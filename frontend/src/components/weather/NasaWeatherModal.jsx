import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  X,
  CloudSun,
  Thermometer,
  Calendar,
  MapPin,
  RefreshCw,
  Download,
  FileText,
  Copy,
  Check,
  ExternalLink,
  ChevronDown,
  Layers,
  Sparkles,
  Info,
  Droplets,
  Flame,
  Sun,
  Compass,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";
import API from "../../services/api";

// Available NASA POWER Meteorological Parameters
const NASA_PARAM_OPTIONS = [
  { id: "T2M", label: "T2M (Air Temp Mean)", unit: "°C", color: "#F59E0B", strokeWidth: 2.5, defaultActive: true },
  { id: "T2M_MAX", label: "T2M_MAX (Max Temp)", unit: "°C", color: "#EF4444", strokeWidth: 2, defaultActive: true },
  { id: "T2M_MIN", label: "T2M_MIN (Min Temp)", unit: "°C", color: "#3B82F6", strokeWidth: 2, defaultActive: true },
  { id: "T2MDEW", label: "T2MDEW (Dew Point)", unit: "°C", color: "#10B981", strokeWidth: 1.5, strokeDasharray: "4 4", defaultActive: true },
  { id: "TS", label: "TS (Earth Skin Temp)", unit: "°C", color: "#8B5CF6", strokeWidth: 1.5, strokeDasharray: "2 2", defaultActive: true },
  { id: "T2M_RANGE", label: "T2M_RANGE (Diurnal Swing)", unit: "°C", color: "#F97316", strokeWidth: 1.5, strokeDasharray: "3 3", defaultActive: false },
  { id: "T2MWET", label: "T2MWET (Wet Bulb Temp)", unit: "°C", color: "#06B6D4", strokeWidth: 1.5, strokeDasharray: "5 5", defaultActive: false },
];

export default function NasaWeatherModal({
  isOpen,
  onClose,
  initialLocation = null, // { name, latitude, longitude, state }
}) {
  const [cities, setCities] = useState([]);
  const [selectedCityName, setSelectedCityName] = useState(
    initialLocation?.name || "Kolkata"
  );
  const [latitude, setLatitude] = useState(
    initialLocation?.latitude != null ? initialLocation.latitude : 22.5726
  );
  const [longitude, setLongitude] = useState(
    initialLocation?.longitude != null ? initialLocation.longitude : 88.3639
  );
  const [locationLabel, setLocationLabel] = useState(
    initialLocation?.name || "Kolkata (West Bengal)"
  );

  // Date Range state: defaults to past 30 days up to yesterday (NASA POWER daily has ~2-3 days lag)
  const defaultDates = useMemo(() => {
    const endD = new Date();
    endD.setDate(endD.getDate() - 3); // NASA daily lag
    const startD = new Date();
    startD.setDate(endD.getDate() - 30);

    const formatYMD = (d) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}${m}${day}`;
    };

    return {
      start: "20240101",
      end: "20241231",
      recentStart: formatYMD(startD),
      recentEnd: formatYMD(endD),
    };
  }, []);

  const [startDate, setStartDate] = useState(defaultDates.start);
  const [endDate, setEndDate] = useState(defaultDates.end);
  const [activeDatePreset, setActiveDatePreset] = useState("2024");
  const [selectedParams, setSelectedParams] = useState({
    T2M: true,
    T2M_MAX: true,
    T2M_MIN: true,
    T2MDEW: true,
    TS: true,
    T2M_RANGE: false,
    T2MWET: false,
  });

  // Query state
  const [weatherData, setWeatherData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState("chart"); // 'chart' or 'table'
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [showPythonSnippet, setShowPythonSnippet] = useState(false);
  const weatherRequestId = useRef(0);

  // Sync initialLocation prop if modal opens for a new target
  useEffect(() => {
    if (initialLocation && initialLocation.latitude && initialLocation.longitude) {
      weatherRequestId.current += 1;
      setWeatherData(null);
      setLoading(false);
      setLatitude(Number(initialLocation.latitude));
      setLongitude(Number(initialLocation.longitude));
      setLocationLabel(initialLocation.name || `Location (${initialLocation.latitude}, ${initialLocation.longitude})`);
      setSelectedCityName(initialLocation.name || "Custom Location");
    }
  }, [initialLocation]);

  // Load cities list on mount
  useEffect(() => {
    const fetchCities = async () => {
      try {
        const res = await API.getWeatherCities();
        if (res?.cities?.length > 0) {
          setCities(res.cities);
        }
      } catch (e) {
        console.warn("Could not load cities list from backend:", e);
      }
    };
    if (isOpen) {
      fetchCities();
    }
  }, [isOpen]);

  // Handle City Dropdown Select
  const handleCitySelect = (cityName) => {
    setSelectedCityName(cityName);
    const found = cities.find((c) => c.name === cityName);
    if (found) {
      setLatitude(found.latitude);
      setLongitude(found.longitude);
      setLocationLabel(`${found.name} (${found.state || "Eastern Region"})`);
    }
  };

  // Quick Date Presets
  const handleDatePreset = (preset) => {
    setActiveDatePreset(preset);
    if (preset === "2024") {
      setStartDate("20240101");
      setEndDate("20241231");
    } else if (preset === "recent30") {
      setStartDate(defaultDates.recentStart);
      setEndDate(defaultDates.recentEnd);
    } else if (preset === "2023") {
      setStartDate("20230101");
      setEndDate("20231231");
    } else if (preset === "past7") {
      const endD = new Date();
      endD.setDate(endD.getDate() - 3);
      const startD = new Date();
      startD.setDate(endD.getDate() - 7);
      const formatYMD = (d) =>
        `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(
          d.getDate()
        ).padStart(2, "0")}`;
      setStartDate(formatYMD(startD));
      setEndDate(formatYMD(endD));
    }
  };

  // Perform Fetch
  const handleFetchWeather = async (force = false) => {
    if (latitude == null || longitude == null) {
      setError("Please specify valid Latitude and Longitude.");
      return;
    }
    setLoading(true);
    setError(null);
    const requestId = ++weatherRequestId.current;
    const activeParamKeys = Object.entries(selectedParams)
      .filter(([_, active]) => active)
      .map(([key]) => key);
    const paramStr = activeParamKeys.length > 0 ? activeParamKeys.join(",") : "T2M,T2MDEW,T2MWET,TS,T2M_RANGE,T2M_MAX,T2M_MIN";
    try {
      const data = await API.getNasaPowerWeather({
        latitude: Number(latitude),
        longitude: Number(longitude),
        start: startDate.replace(/-/g, ""),
        end: endDate.replace(/-/g, ""),
        parameters: paramStr,
        cityName: locationLabel || selectedCityName,
        forceRefresh: force,
      });
      if (requestId === weatherRequestId.current) setWeatherData(data);
    } catch (err) {
      if (requestId === weatherRequestId.current) {
        console.error("NASA POWER fetch failed:", err);
        setError(err?.response?.data?.detail || err.message || "Failed to retrieve NASA POWER data");
      }
    } finally {
      if (requestId === weatherRequestId.current) setLoading(false);
    }
  };

  // Auto-fetch on first open if no data
  useEffect(() => {
    if (initialLocation &&
        (Number(latitude) !== Number(initialLocation.latitude) || Number(longitude) !== Number(initialLocation.longitude))) return;
    if (isOpen && !weatherData && !loading) {
      handleFetchWeather();
    }
  }, [isOpen, latitude, longitude]);

  // Copy API URL
  const copyApiUrl = () => {
    const url = weatherData?.api_url || `https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M,T2MDEW,T2MWET,TS,T2M_RANGE,T2M_MAX,T2M_MIN&community=RE&longitude=${longitude}&latitude=${latitude}&start=${startDate}&end=${endDate}&format=JSON`;
    navigator.clipboard?.writeText(url);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  // Export JSON Download URL
  const handleDownloadJson = () => {
    const activeParamKeys = Object.entries(selectedParams)
      .filter(([_, active]) => active)
      .map(([key]) => key);
    const paramStr = activeParamKeys.length > 0 ? activeParamKeys.join(",") : "T2M,T2MDEW,T2MWET,TS,T2M_RANGE,T2M_MAX,T2M_MIN";
    const url = API.getNasaPowerExportUrl(
      Number(latitude),
      Number(longitude),
      startDate.replace(/-/g, ""),
      endDate.replace(/-/g, ""),
      paramStr
    );
    window.open(url, "_blank");
  };

  // Client-side CSV Download
  const handleDownloadCsv = () => {
    if (!weatherData?.daily_records || weatherData.daily_records.length === 0) return;
    const headers = [
      "Date",
      "Mean_Temp_T2M_C",
      "Max_Temp_T2M_MAX_C",
      "Min_Temp_T2M_MIN_C",
      "Diurnal_Range_T2M_RANGE_C",
      "Dew_Point_T2MDEW_C",
      "Wet_Bulb_T2MWET_C",
      "Skin_Temp_TS_C",
    ];
    const rows = weatherData.daily_records.map((r) => [
      r.date,
      r.t2m != null ? r.t2m : "",
      r.t2m_max != null ? r.t2m_max : "",
      r.t2m_min != null ? r.t2m_min : "",
      r.t2m_range != null ? r.t2m_range : "",
      r.t2mdew != null ? r.t2mdew : "",
      r.t2mwet != null ? r.t2mwet : "",
      r.ts != null ? r.ts : "",
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `NASA_POWER_${locationLabel.replace(/[^a-zA-Z0-9]/g, "_")}_${startDate}_${endDate}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!isOpen) return null;

  const latest = weatherData?.latest || {};
  const summary = weatherData?.summary || {};
  const isCached = weatherData?.source === "mongodb_cache";

  return (
    <div
      className="modal show d-block"
      style={{
        backgroundColor: "rgba(15, 23, 42, 0.75)",
        backdropFilter: "blur(6px)",
        zIndex: 1060,
      }}
      tabIndex={-1}
    >
      <div className="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable" style={{ maxWidth: "1150px" }}>
        <div className="modal-content border-0 shadow-2xl rounded-4 overflow-hidden">
          {/* Header */}
          <div
            className="modal-header text-white px-4 py-3"
            style={{
              background: "linear-gradient(135deg, #1E293B 0%, #0F172A 100%)",
              borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
            }}
          >
            <div className="d-flex align-items-center gap-3">
              <div
                className="rounded-3 p-2 d-flex align-items-center justify-content-center shadow-sm"
                style={{
                  background: "linear-gradient(135deg, #F59E0B 0%, #D97706 100%)",
                  color: "#FFFFFF",
                }}
              >
                <CloudSun size={24} />
              </div>
              <div>
                <div className="d-flex align-items-center gap-2">
                  <h5 className="modal-title fw-bold mb-0">NASA POWER Meteorology & Historical Weather</h5>
                  <span className="badge bg-amber-500 text-dark fw-bold" style={{ backgroundColor: "#FDE68A", fontSize: "10.5px" }}>
                    Daily Meteorology (Point API)
                  </span>
                </div>
                <div className="text-light opacity-75 small" style={{ fontSize: "12px" }}>
                  NASA Prediction Of Worldwide Energy Resources • Daily Surface & Air Temperatures (T2M, Dew Point, Wet Bulb, Skin Temp)
                </div>
              </div>
            </div>

            <button
              type="button"
              className="btn-close btn-close-white"
              onClick={onClose}
              aria-label="Close"
            />
          </div>

          {/* Modal Body */}
          <div className="modal-body p-4 bg-light">
            {/* Top Config Row: Location & Date Range */}
            <div className="card border-0 shadow-sm rounded-3 p-3 bg-white mb-3">
              <div className="row g-3 align-items-end">
                {/* City Preset Selector */}
                <div className="col-md-3">
                  <label className="form-label fw-bold small text-muted mb-1 d-flex align-items-center gap-1">
                    <MapPin size={13} className="text-primary" />
                    City Preset (Eastern Region)
                  </label>
                  <select
                    className="form-select form-select-sm shadow-none"
                    value={selectedCityName}
                    onChange={(e) => handleCitySelect(e.target.value)}
                  >
                    <optgroup label="West Bengal">
                      {cities
                        .filter((c) => c.state === "West Bengal")
                        .map((c) => (
                          <option key={c.name} value={c.name}>
                            {c.name} {c.is_capital ? "★ (Capital)" : ""}
                          </option>
                        ))}
                    </optgroup>
                    <optgroup label="Bihar">
                      {cities
                        .filter((c) => c.state === "Bihar")
                        .map((c) => (
                          <option key={c.name} value={c.name}>
                            {c.name} {c.is_capital ? "★" : ""}
                          </option>
                        ))}
                    </optgroup>
                    <optgroup label="Jharkhand">
                      {cities
                        .filter((c) => c.state === "Jharkhand")
                        .map((c) => (
                          <option key={c.name} value={c.name}>
                            {c.name} {c.is_capital ? "★" : ""}
                          </option>
                        ))}
                    </optgroup>
                    <optgroup label="Odisha">
                      {cities
                        .filter((c) => c.state === "Odisha")
                        .map((c) => (
                          <option key={c.name} value={c.name}>
                            {c.name} {c.is_capital ? "★" : ""}
                          </option>
                        ))}
                    </optgroup>
                    <optgroup label="Sikkim">
                      {cities
                        .filter((c) => c.state === "Sikkim")
                        .map((c) => (
                          <option key={c.name} value={c.name}>
                            {c.name} {c.is_capital ? "★" : ""}
                          </option>
                        ))}
                    </optgroup>
                    <optgroup label="Reference Coordinates">
                      {cities
                        .filter((c) => c.state === "Reference Coordinates")
                        .map((c) => (
                          <option key={c.name} value={c.name}>
                            {c.name}
                          </option>
                        ))}
                    </optgroup>
                    <option value="Custom Location">Custom Coordinates...</option>
                  </select>
                </div>

                {/* Latitude */}
                <div className="col-md-2">
                  <label className="form-label fw-bold small text-muted mb-1">Latitude (°N)</label>
                  <input
                    type="number"
                    step="0.0001"
                    className="form-control form-control-sm"
                    value={latitude}
                    onChange={(e) => {
                      setLatitude(e.target.value);
                      setSelectedCityName("Custom Location");
                    }}
                    placeholder="22.5726"
                  />
                </div>

                {/* Longitude */}
                <div className="col-md-2">
                  <label className="form-label fw-bold small text-muted mb-1">Longitude (°E)</label>
                  <input
                    type="number"
                    step="0.0001"
                    className="form-control form-control-sm"
                    value={longitude}
                    onChange={(e) => {
                      setLongitude(e.target.value);
                      setSelectedCityName("Custom Location");
                    }}
                    placeholder="88.3639"
                  />
                </div>

                {/* Date Range Selector & Presets */}
                <div className="col-md-5">
                  <div className="d-flex align-items-center justify-content-between mb-1">
                    <label className="form-label fw-bold small text-muted mb-0 d-flex align-items-center gap-1">
                      <Calendar size={13} className="text-primary" />
                      Date Range (Custom / Preset)
                    </label>
                    <div className="btn-group btn-group-xs" role="group">
                      <button
                        type="button"
                        className={`btn btn-xs py-0 px-1.5 ${activeDatePreset === "2024" ? "btn-primary fw-bold" : "btn-outline-secondary"}`}
                        style={{ fontSize: "10px" }}
                        onClick={() => handleDatePreset("2024")}
                      >
                        2024
                      </button>
                      <button
                        type="button"
                        className={`btn btn-xs py-0 px-1.5 ${activeDatePreset === "recent30" ? "btn-primary fw-bold" : "btn-outline-secondary"}`}
                        style={{ fontSize: "10px" }}
                        onClick={() => handleDatePreset("recent30")}
                      >
                        Past 30d
                      </button>
                      <button
                        type="button"
                        className={`btn btn-xs py-0 px-1.5 ${activeDatePreset === "2023" ? "btn-primary fw-bold" : "btn-outline-secondary"}`}
                        style={{ fontSize: "10px" }}
                        onClick={() => handleDatePreset("2023")}
                      >
                        2023
                      </button>
                    </div>
                  </div>
                  <div className="d-flex align-items-center gap-2">
                    <input
                      type="date"
                      className="form-control form-control-sm"
                      value={startDate.length === 8 ? `${startDate.slice(0,4)}-${startDate.slice(4,6)}-${startDate.slice(6,8)}` : startDate}
                      onChange={(e) => {
                        setStartDate(e.target.value.replace(/-/g, ""));
                        setActiveDatePreset("custom");
                      }}
                      title="Start Date"
                      style={{ fontSize: "11px" }}
                    />
                    <span className="text-muted small">to</span>
                    <input
                      type="date"
                      className="form-control form-control-sm"
                      value={endDate.length === 8 ? `${endDate.slice(0,4)}-${endDate.slice(4,6)}-${endDate.slice(6,8)}` : endDate}
                      onChange={(e) => {
                        setEndDate(e.target.value.replace(/-/g, ""));
                        setActiveDatePreset("custom");
                      }}
                      title="End Date"
                      style={{ fontSize: "11px" }}
                    />
                  </div>
                </div>

                {/* Fetch Button */}
                <div className="col-md-2 d-flex gap-1.5">
                  <button
                    className="btn btn-primary btn-sm w-100 d-flex align-items-center justify-content-center gap-1.5 fw-bold shadow-sm"
                    onClick={() => handleFetchWeather(false)}
                    disabled={loading}
                  >
                    <RefreshCw size={13} className={loading ? "spin-animation" : ""} />
                    {loading ? "Querying..." : "Fetch Weather"}
                  </button>
                </div>
              </div>

              {/* NASA Meteorological Parameters / Data Types Selection */}
              <div className="mt-2.5 pt-2 border-top">
                <div className="d-flex align-items-center justify-content-between mb-1.5">
                  <span className="fw-bold small text-muted d-flex align-items-center gap-1" style={{ fontSize: "11px" }}>
                    <Layers size={12} className="text-primary" />
                    NASA Data Types & Parameters to Plot:
                  </span>
                  <div className="d-flex gap-1.5">
                    <button
                      type="button"
                      className="btn btn-link btn-xs p-0 text-decoration-none small"
                      style={{ fontSize: "10.5px" }}
                      onClick={() => {
                        const allOn = {};
                        NASA_PARAM_OPTIONS.forEach((p) => { allOn[p.id] = true; });
                        setSelectedParams(allOn);
                      }}
                    >
                      Select All
                    </button>
                    <span className="text-muted small">•</span>
                    <button
                      type="button"
                      className="btn btn-link btn-xs p-0 text-decoration-none small text-muted"
                      style={{ fontSize: "10.5px" }}
                      onClick={() => {
                        setSelectedParams({
                          T2M: true,
                          T2M_MAX: true,
                          T2M_MIN: true,
                          T2MDEW: false,
                          TS: false,
                          T2M_RANGE: false,
                          T2MWET: false,
                        });
                      }}
                    >
                      Reset Defaults
                    </button>
                  </div>
                </div>
                <div className="d-flex flex-wrap gap-2">
                  {NASA_PARAM_OPTIONS.map((param) => {
                    const isSelected = Boolean(selectedParams[param.id]);
                    return (
                      <label
                        key={param.id}
                        className={`d-flex align-items-center gap-1.5 px-2 py-1 rounded-2 border cursor-pointer user-select-none transition-all ${
                          isSelected ? "bg-white shadow-sm border-primary" : "bg-light text-muted border-transparent"
                        }`}
                        style={{ fontSize: "11px" }}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            setSelectedParams({
                              ...selectedParams,
                              [param.id]: e.target.checked,
                            });
                          }}
                          className="form-check-input mt-0"
                          style={{ cursor: "pointer" }}
                        />
                        <span
                          style={{
                            width: "8px",
                            height: "8px",
                            borderRadius: "50%",
                            backgroundColor: param.color,
                            display: "inline-block",
                          }}
                        />
                        <span className={isSelected ? "fw-bold text-dark" : ""}>
                          {param.label}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Exact NASA POWER API URL & Cache Status */}
              <div className="mt-3 pt-2.5 border-top d-flex flex-wrap align-items-center justify-content-between gap-2">
                <div className="d-flex align-items-center gap-2 overflow-hidden flex-grow-1">
                  <span className="badge bg-dark font-monospace text-uppercase" style={{ fontSize: "9.5px" }}>
                    NASA URL
                  </span>
                  <code
                    className="small text-truncate text-muted user-select-all"
                    style={{ fontSize: "11px", maxWidth: "680px" }}
                    title={weatherData?.api_url}
                  >
                    {weatherData?.api_url ||
                      `https://power.larc.nasa.gov/api/temporal/daily/point?start=${startDate}&end=${endDate}&latitude=${latitude}&longitude=${longitude}&community=re&parameters=T2M,T2MDEW,T2MWET,TS,T2M_RANGE,T2M_MAX,T2M_MIN&format=json&units=metric&header=true`}
                  </code>
                  <button
                    className="btn btn-outline-secondary btn-xs py-0.5 px-1.5 rounded-1"
                    onClick={copyApiUrl}
                    title="Copy API URL"
                  >
                    {copiedUrl ? <Check size={11} className="text-success" /> : <Copy size={11} />}
                  </button>
                </div>

                <div className="d-flex align-items-center gap-2">
                  {weatherData && (
                    <span
                      className={`badge ${
                        isCached ? "bg-success-subtle text-success border border-success" : "bg-primary-subtle text-primary border border-primary"
                      }`}
                      style={{ fontSize: "10px" }}
                    >
                      {isCached ? "⚡ Instant from MongoDB Cache" : "🌐 Live NASA POWER API"}
                    </span>
                  )}
                  <button
                    className="btn btn-link btn-xs p-0 text-decoration-none small text-muted"
                    onClick={() => setShowPythonSnippet(!showPythonSnippet)}
                  >
                    {showPythonSnippet ? "Hide Python Snippet" : "View Python Snippet"}
                  </button>
                </div>
              </div>

              {/* Optional Python Snippet Dropdown */}
              {showPythonSnippet && (
                <div className="mt-2.5 p-2.5 rounded-2 bg-dark text-light font-monospace small" style={{ fontSize: "11px" }}>
                  <div className="text-warning mb-1 fw-bold"># Python NASA POWER Client Snippet (As Requested):</div>
                  <pre className="mb-0 text-white" style={{ overflowX: "auto" }}>
{`import os, json, requests

locations = [(${latitude}, ${longitude})]
base_url = r"https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M,T2MDEW,T2MWET,TS,T2M_RANGE,T2M_MAX,T2M_MIN&community=RE&longitude={longitude}&latitude={latitude}&start=${startDate}&end=${endDate}&format=JSON"

for lat, lon in locations:
    url = base_url.format(longitude=lon, latitude=lat)
    response = requests.get(url=url, verify=True, timeout=30.00)
    data = response.json()
    print("NASA POWER Temp Data Retrieved:", len(data.get("properties", {}).get("parameter", {}).get("T2M", {})))`}
                  </pre>
                </div>
              )}
            </div>

            {/* Error Message */}
            {error && (
              <div className="alert alert-danger d-flex align-items-center gap-2 py-2 px-3 small rounded-3 mb-3">
                <Info size={16} />
                <span>{error}</span>
              </div>
            )}

            {/* Key KPI Tiles: 7 NASA Parameters */}
            {weatherData && (
              <div className="row g-2 mb-3">
                {/* 1. T2M Mean Temp */}
                <div className="col-6 col-md">
                  <div className="card border-0 shadow-sm rounded-3 p-2.5 bg-white text-center h-100">
                    <span className="text-muted fw-bold" style={{ fontSize: "10.5px" }}>
                      T2M (Air Mean)
                    </span>
                    <div className="h4 fw-bold text-dark my-1">
                      {latest.t2m != null ? `${latest.t2m}°C` : summary.avg_t2m != null ? `${summary.avg_t2m}°C` : "--"}
                    </div>
                    <span className="text-muted small" style={{ fontSize: "10px" }}>
                      Period Avg: {summary.avg_t2m ?? "--"}°C
                    </span>
                  </div>
                </div>

                {/* 2. T2M_MAX */}
                <div className="col-6 col-md">
                  <div className="card border-0 shadow-sm rounded-3 p-2.5 bg-white text-center h-100">
                    <span className="text-danger fw-bold" style={{ fontSize: "10.5px" }}>
                      T2M_MAX (Max)
                    </span>
                    <div className="h4 fw-bold text-danger my-1">
                      {latest.t2m_max != null ? `${latest.t2m_max}°C` : summary.max_t2m != null ? `${summary.max_t2m}°C` : "--"}
                    </div>
                    <span className="text-muted small" style={{ fontSize: "10px" }}>
                      Peak: {summary.max_t2m ?? "--"}°C
                    </span>
                  </div>
                </div>

                {/* 3. T2M_MIN */}
                <div className="col-6 col-md">
                  <div className="card border-0 shadow-sm rounded-3 p-2.5 bg-white text-center h-100">
                    <span className="text-primary fw-bold" style={{ fontSize: "10.5px" }}>
                      T2M_MIN (Min)
                    </span>
                    <div className="h4 fw-bold text-primary my-1">
                      {latest.t2m_min != null ? `${latest.t2m_min}°C` : summary.min_t2m != null ? `${summary.min_t2m}°C` : "--"}
                    </div>
                    <span className="text-muted small" style={{ fontSize: "10px" }}>
                      Lowest: {summary.min_t2m ?? "--"}°C
                    </span>
                  </div>
                </div>

                {/* 4. T2M_RANGE */}
                <div className="col-6 col-md">
                  <div className="card border-0 shadow-sm rounded-3 p-2.5 bg-white text-center h-100">
                    <span className="text-warning fw-bold" style={{ fontSize: "10.5px" }}>
                      T2M_RANGE (Swing)
                    </span>
                    <div className="h4 fw-bold text-warning-emphasis my-1">
                      {latest.t2m_range != null ? `${latest.t2m_range}°C` : summary.avg_range != null ? `${summary.avg_range}°C` : "--"}
                    </div>
                    <span className="text-muted small" style={{ fontSize: "10px" }}>
                      Diurnal Temp Range
                    </span>
                  </div>
                </div>

                {/* 5. T2MDEW */}
                <div className="col-6 col-md">
                  <div className="card border-0 shadow-sm rounded-3 p-2.5 bg-white text-center h-100">
                    <span className="text-success fw-bold" style={{ fontSize: "10.5px" }}>
                      T2MDEW (Dew Point)
                    </span>
                    <div className="h4 fw-bold text-success my-1">
                      {latest.t2mdew != null ? `${latest.t2mdew}°C` : summary.avg_dew_point != null ? `${summary.avg_dew_point}°C` : "--"}
                    </div>
                    <span className="text-muted small" style={{ fontSize: "10px" }}>
                      Condensation Point
                    </span>
                  </div>
                </div>

                {/* 6. T2MWET */}
                <div className="col-6 col-md">
                  <div className="card border-0 shadow-sm rounded-3 p-2.5 bg-white text-center h-100">
                    <span className="text-info fw-bold" style={{ fontSize: "10.5px" }}>
                      T2MWET (Wet Bulb)
                    </span>
                    <div className="h4 fw-bold text-info my-1">
                      {latest.t2mwet != null ? `${latest.t2mwet}°C` : "--"}
                    </div>
                    <span className="text-muted small" style={{ fontSize: "10px" }}>
                      Evaporative Cooling
                    </span>
                  </div>
                </div>

                {/* 7. TS (Skin Temp) */}
                <div className="col-6 col-md">
                  <div className="card border-0 shadow-sm rounded-3 p-2.5 bg-white text-center h-100">
                    <span className="text-secondary fw-bold" style={{ fontSize: "10.5px" }}>
                      TS (Skin Temp)
                    </span>
                    <div className="h4 fw-bold text-secondary my-1">
                      {latest.ts != null ? `${latest.ts}°C` : "--"}
                    </div>
                    <span className="text-muted small" style={{ fontSize: "10px" }}>
                      Earth Surface Temp
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* View Mode & Trend Chart / Table */}
            <div className="card border-0 shadow-sm rounded-3 p-3 bg-white mb-3">
              <div className="d-flex align-items-center justify-content-between mb-3">
                <div className="d-flex align-items-center gap-2">
                  <span className="fw-bold text-dark" style={{ fontSize: "13px" }}>
                    Temperature & Meteorology Trends: {locationLabel}
                  </span>
                  {weatherData?.total_days && (
                    <span className="badge bg-light text-muted border" style={{ fontSize: "10.5px" }}>
                      {weatherData.total_days} Days Analyzed
                    </span>
                  )}
                </div>

                <div className="d-flex align-items-center gap-2">
                  <div className="btn-group btn-group-sm" role="group">
                    <button
                      type="button"
                      className={`btn ${viewMode === "chart" ? "btn-primary fw-bold" : "btn-outline-secondary"}`}
                      style={{ fontSize: "11px" }}
                      onClick={() => setViewMode("chart")}
                    >
                      📈 Trend Chart
                    </button>
                    <button
                      type="button"
                      className={`btn ${viewMode === "table" ? "btn-primary fw-bold" : "btn-outline-secondary"}`}
                      style={{ fontSize: "11px" }}
                      onClick={() => setViewMode("table")}
                    >
                      📋 Data Table
                    </button>
                  </div>
                </div>
              </div>

              {/* Chart View */}
              {viewMode === "chart" && (
                <div style={{ width: "100%", height: 320 }}>
                  {weatherData?.daily_records && weatherData.daily_records.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={weatherData.daily_records}
                        margin={{ top: 10, right: 20, left: 0, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 10, fill: "#64748B" }}
                          tickLine={false}
                          interval="preserveStartEnd"
                        />
                        <YAxis
                          unit="°C"
                          tick={{ fontSize: 10, fill: "#64748B" }}
                          domain={["auto", "auto"]}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#0F172A",
                            borderRadius: "8px",
                            border: "none",
                            color: "#FFFFFF",
                            fontSize: "11px",
                            boxShadow: "0 10px 15px -3px rgba(0,0,0,0.3)",
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "6px" }} />
                        {selectedParams.T2M_MAX && (
                          <Line
                            type="monotone"
                            dataKey="t2m_max"
                            name="Max Temp (T2M_MAX)"
                            stroke="#EF4444"
                            strokeWidth={2}
                            dot={false}
                          />
                        )}
                        {selectedParams.T2M && (
                          <Line
                            type="monotone"
                            dataKey="t2m"
                            name="Mean Temp (T2M)"
                            stroke="#F59E0B"
                            strokeWidth={2.5}
                            dot={false}
                          />
                        )}
                        {selectedParams.T2M_MIN && (
                          <Line
                            type="monotone"
                            dataKey="t2m_min"
                            name="Min Temp (T2M_MIN)"
                            stroke="#3B82F6"
                            strokeWidth={2}
                            dot={false}
                          />
                        )}
                        {selectedParams.T2MDEW && (
                          <Line
                            type="monotone"
                            dataKey="t2mdew"
                            name="Dew Point (T2MDEW)"
                            stroke="#10B981"
                            strokeWidth={1.5}
                            strokeDasharray="4 4"
                            dot={false}
                          />
                        )}
                        {selectedParams.TS && (
                          <Line
                            type="monotone"
                            dataKey="ts"
                            name="Skin Temp (TS)"
                            stroke="#8B5CF6"
                            strokeWidth={1.5}
                            strokeDasharray="2 2"
                            dot={false}
                          />
                        )}
                        {selectedParams.T2M_RANGE && (
                          <Line
                            type="monotone"
                            dataKey="t2m_range"
                            name="Diurnal Range (T2M_RANGE)"
                            stroke="#F97316"
                            strokeWidth={1.5}
                            strokeDasharray="3 3"
                            dot={false}
                          />
                        )}
                        {selectedParams.T2MWET && (
                          <Line
                            type="monotone"
                            dataKey="t2mwet"
                            name="Wet Bulb (T2MWET)"
                            stroke="#06B6D4"
                            strokeWidth={1.5}
                            strokeDasharray="5 5"
                            dot={false}
                          />
                        )}
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="d-flex align-items-center justify-content-center h-100 text-muted small">
                      {loading ? "Loading NASA POWER temperature data..." : "No weather data loaded. Click 'Fetch Weather' to query."}
                    </div>
                  )}
                </div>
              )}

              {/* Table View */}
              {viewMode === "table" && (
                <div className="table-responsive" style={{ maxHeight: "320px", overflowY: "auto" }}>
                  <table className="table table-sm table-striped table-hover mb-0" style={{ fontSize: "11px" }}>
                    <thead className="table-light sticky-top">
                      <tr>
                        <th>Date</th>
                        <th>T2M Mean (°C)</th>
                        <th>T2M Max (°C)</th>
                        <th>T2M Min (°C)</th>
                        <th>Range (°C)</th>
                        <th>Dew Point (°C)</th>
                        <th>Wet Bulb (°C)</th>
                        <th>Skin Temp (°C)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {weatherData?.daily_records?.map((row) => (
                        <tr key={row.date_raw || row.date}>
                          <td className="fw-bold">{row.date}</td>
                          <td className="fw-bold" style={{ color: "#D97706" }}>
                            {row.t2m != null ? `${row.t2m}` : "--"}
                          </td>
                          <td className="text-danger fw-bold">{row.t2m_max != null ? `${row.t2m_max}` : "--"}</td>
                          <td className="text-primary fw-bold">{row.t2m_min != null ? `${row.t2m_min}` : "--"}</td>
                          <td>{row.t2m_range != null ? `${row.t2m_range}` : "--"}</td>
                          <td className="text-success">{row.t2mdew != null ? `${row.t2mdew}` : "--"}</td>
                          <td className="text-info">{row.t2mwet != null ? `${row.t2mwet}` : "--"}</td>
                          <td className="text-purple">{row.ts != null ? `${row.ts}` : "--"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Modal Footer */}
          <div className="modal-footer bg-white border-top px-4 py-2.5 d-flex justify-content-between align-items-center">
            <div className="d-flex align-items-center gap-2">
              <button
                className="btn btn-outline-dark btn-sm d-flex align-items-center gap-1.5"
                onClick={handleDownloadJson}
                disabled={!weatherData}
                style={{ fontSize: "11px" }}
              >
                <Download size={13} />
                Download NASA JSON
              </button>
              <button
                className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1.5"
                onClick={handleDownloadCsv}
                disabled={!weatherData}
                style={{ fontSize: "11px" }}
              >
                <FileText size={13} />
                Export CSV
              </button>
            </div>

            <div className="d-flex align-items-center gap-2">
              <button
                className="btn btn-outline-primary btn-sm d-flex align-items-center gap-1"
                onClick={() => handleFetchWeather(true)}
                disabled={loading}
                title="Bypass MongoDB cache and force fresh request from NASA"
                style={{ fontSize: "11px" }}
              >
                <RefreshCw size={12} className={loading ? "spin-animation" : ""} />
                Force Refresh Live
              </button>
              <button className="btn btn-secondary btn-sm px-3" onClick={onClose} style={{ fontSize: "11px" }}>
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

