import { useEffect, useState, useRef } from "react";
import {
  Calendar,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  DownloadCloud,
  Activity,
  Database,
  Sparkles,
  AlertTriangle,
  Lock,
  User,
  Globe,
  Settings,
  ChevronDown,
  ChevronUp
} from "lucide-react";

import API from "../services/api";

// LAYOUT
import AppShell from "../components/layout/AppShell";

// POPUP
import { showModernPopup } from "../components/ui/ModernPopup";

export default function PSPAdmin() {
  const [statusData, setStatusData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);

  // ERLDC Credentials Configuration State
  const [config, setConfig] = useState({
    psp_username: "",
    psp_password: "",
    psp_login_url: "",
    psp_data_url: "",
    loadshed_api_url: "",
    outage_api_url: ""
  });
  const [configLoading, setConfigLoading] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [portfolioMapping, setPortfolioMapping] = useState([]);
  const [mappingLoading, setMappingLoading] = useState(false);
  const [savingMapping, setSavingMapping] = useState(false);
  const [powerSystemDate, setPowerSystemDate] = useState(new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
  const [powerSystemBaseRows, setPowerSystemBaseRows] = useState([]);
  const [powerSystemBaseLoading, setPowerSystemBaseLoading] = useState(false);
  const [savingPowerSystemBase, setSavingPowerSystemBase] = useState(false);

  // Sync Progress State
  const [progressData, setProgressData] = useState(null);
  const progressRef = useRef(null);

  // Tab State & Collapsible Panel State for Compact View
  const [activeTab, setActiveTab] = useState("range"); // "range" or "single"
  const [configOpen, setConfigOpen] = useState(false);

  // Sync ref with progressData state
  useEffect(() => {
    progressRef.current = progressData;
  }, [progressData]);

  // Date range state (default last 7 days starting from yesterday)
  const yesterdayStr = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const pastStr = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(pastStr);
  const [endDate, setEndDate] = useState(yesterdayStr);

  // Single date sync state
  const [singleDate, setSingleDate] = useState(yesterdayStr);

  // Load ERLDC credentials configuration
  const loadConfig = async () => {
    try {
      setConfigLoading(true);
      const res = await API.getPspConfig();
      if (res.success && res.config) {
        setConfig(res.config);
      }
    } catch (err) {
      console.error(err);
      showModernPopup({
        type: "error",
        title: "Load Config Failed",
        subtitle: "Unable to retrieve ERLDC login credentials"
      });
    } finally {
      setConfigLoading(false);
    }
  };

  // Save updated configuration
  const handleSaveConfig = async (e) => {
    e.preventDefault();
    try {
      setSavingConfig(true);
      const res = await API.savePspConfig(config);
      if (res.success) {
        showModernPopup({
          type: "success",
          title: "Config Saved",
          subtitle: res.message || "ERLDC configuration updated successfully"
        });
      } else {
        showModernPopup({
          type: "error",
          title: "Save Failed",
          subtitle: res.message || "Failed to update configuration"
        });
      }
    } catch (err) {
      console.error(err);
      showModernPopup({
        type: "error",
        title: "Save Error",
        subtitle: "An error occurred while updating ERLDC credentials"
      });
    } finally {
      setSavingConfig(false);
    }
  };

  const loadPortfolioMapping = async () => {
    try {
      setMappingLoading(true);
      const res = await API.getPspPortfolioMapping();
      if (res.success) {
        setPortfolioMapping(res.data || []);
      }
    } catch (err) {
      console.error(err);
      showModernPopup({
        type: "error",
        title: "Mapping Load Failed",
        subtitle: "Unable to load PSP portfolio source mapping"
      });
    } finally {
      setMappingLoading(false);
    }
  };

  const updatePortfolioMappingCell = (idx, key, value) => {
    setPortfolioMapping((prev) =>
      prev.map((row, rowIdx) => (rowIdx === idx ? { ...row, [key]: value } : row))
    );
  };

  const handleSavePortfolioMapping = async () => {
    try {
      setSavingMapping(true);
      const payload = portfolioMapping.map(({ wbes_candidates, ...row }) => row);
      const res = await API.savePspPortfolioMapping(payload);
      if (res.success) {
        showModernPopup({
          type: "success",
          title: "Mapping Saved",
          subtitle: res.message || "PSP portfolio source mapping updated"
        });
        await loadPortfolioMapping();
      } else {
        showModernPopup({
          type: "error",
          title: "Save Failed",
          subtitle: res.message || "Could not save PSP portfolio mapping"
        });
      }
    } catch (err) {
      console.error(err);
      showModernPopup({
        type: "error",
        title: "Save Error",
        subtitle: err.response?.data?.message || "Could not save PSP portfolio mapping"
      });
    } finally {
      setSavingMapping(false);
    }
  };

  const loadPowerSystemBase = async (dateStr = powerSystemDate) => {
    try {
      setPowerSystemBaseLoading(true);
      const res = await API.getPspPowerSystemBase(dateStr);
      if (res.success) {
        setPowerSystemBaseRows(res.rows || []);
      }
    } catch (err) {
      console.error(err);
      showModernPopup({
        type: "error",
        title: "Base Data Load Failed",
        subtitle: "Unable to load power system base data"
      });
    } finally {
      setPowerSystemBaseLoading(false);
    }
  };

  const updatePowerSystemBaseCell = (idx, key, value) => {
    setPowerSystemBaseRows((prev) =>
      prev.map((row, rowIdx) => (rowIdx === idx ? { ...row, [key]: value } : row))
    );
  };

  const handleSavePowerSystemBase = async () => {
    try {
      setSavingPowerSystemBase(true);
      const payload = {
        effective_date: powerSystemDate,
        rows: powerSystemBaseRows.map((row) => ({
          state: row.state,
          ists_inlet_points: Number(row.ists_inlet_points || 0),
          per_capita_consumption: Number(row.per_capita_consumption || 0),
          state_gna: Number(row.state_gna || 0)
        }))
      };
      const res = await API.savePspPowerSystemBase(payload);
      if (res.success) {
        showModernPopup({
          type: "success",
          title: "Base Data Saved",
          subtitle: res.message || "Power system base data updated"
        });
        await loadPowerSystemBase(powerSystemDate);
      } else {
        showModernPopup({
          type: "error",
          title: "Save Failed",
          subtitle: res.message || "Could not save power system base data"
        });
      }
    } catch (err) {
      console.error(err);
      showModernPopup({
        type: "error",
        title: "Save Error",
        subtitle: err.response?.data?.message || "Could not save power system base data"
      });
    } finally {
      setSavingPowerSystemBase(false);
    }
  };

  // Load last 30 days status
  const loadStatus = async (quiet = false) => {
    try {
      if (!quiet) setLoading(true);
      const res = await API.getPspStatus();
      if (res.success) {
        setStatusData(res.data || []);
      }
    } catch (err) {
      console.error(err);
      showModernPopup({
        type: "error",
        title: "Status Load Failed",
        subtitle: "Unable to retrieve PSP status"
      });
    } finally {
      if (!quiet) setLoading(false);
    }
  };

  // Check backend background job progress
  const checkProgress = async () => {
    try {
      const res = await API.getPspSyncProgress();
      if (res.success) {
        if (progressRef.current?.status === "RUNNING" && res.status === "COMPLETED") {
          showModernPopup({
            type: "success",
            title: "Range Sync Complete",
            subtitle: "Historical data ingestion completed successfully"
          });
          loadStatus(true);
        }
        setProgressData(res);
      }
    } catch (err) {
      console.error("Error fetching sync progress:", err);
    }
  };

  // Run daterange sync in background
  const handleSyncRange = async () => {
    try {
      setSyncLoading(true);
      const res = await API.runPspRange(startDate, endDate);
      if (res.success) {
        showModernPopup({
          type: "success",
          title: "Sync Triggered",
          subtitle: res.message || "Historical ingestion started in background"
        });
        checkProgress();
      } else {
        showModernPopup({
          type: "error",
          title: "Sync Failed",
          subtitle: res.message || "Could not trigger range sync"
        });
      }
    } catch (err) {
      console.error(err);
      showModernPopup({
        type: "error",
        title: "Sync Error",
        subtitle: err.response?.data?.message || "An error occurred during sync request"
      });
    } finally {
      setSyncLoading(false);
    }
  };

  // Sync a single day synchronously
  const handleSyncSingleDate = async (dateStr) => {
    try {
      setSyncLoading(true);
      const res = await API.syncPspDate(dateStr);
      if (res.success) {
        showModernPopup({
          type: "success",
          title: "Date Synced",
          subtitle: res.message || `Successfully synced PSP data for ${dateStr}`
        });
        await loadStatus(true);
      } else {
        showModernPopup({
          type: "error",
          title: "Fetch Failed",
          subtitle: res.message || `Unable to fetch data for ${dateStr}`
        });
      }
    } catch (err) {
      console.error(err);
      showModernPopup({
        type: "error",
        title: "Error",
        subtitle: err.response?.data?.message || `Failed to sync date ${dateStr}`
      });
    } finally {
      setSyncLoading(false);
    }
  };

  const handleRefresh = () => {
    loadStatus();
    checkProgress();
    loadConfig();
    loadPortfolioMapping();
    loadPowerSystemBase(powerSystemDate);
  };

  // Load status and progress on mount
  useEffect(() => {
    handleRefresh();
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

  // Compute progress parameters
  const isSyncActive = progressData && progressData.status === "RUNNING";
  const completedCount = progressData?.completed || 0;
  const totalCount = progressData?.total || 1;
  const progressPercent = Math.round((completedCount / totalCount) * 100);
  const currentSyncDate = progressData?.current_date || "";
  const lastSyncError = progressData?.error || "";

  // Compute metric stats
  const totalFetched = statusData.filter((d) => d.status === "SUCCESS").length;
  const totalMissing = statusData.filter((d) => d.status === "MISSING").length;
  const syncSuccessRate =
    statusData.length > 0 ? Math.round((totalFetched / statusData.length) * 100) : 0;

  const portfolioMappingColumns = [
    ["psp", "PSP Name", 120],
    ["wbes", "WBES Acronym", 140],
    ["scada_gen", "Own Gen Total", 150],
    ["scada_thermal", "Thermal", 150],
    ["scada_hydro", "Hydro", 140],
    ["scada_solar", "Solar", 140],
    ["scada_others", "Others", 160],
    ["scada_nuclear", "Nuclear", 140],
    ["highlight", "SCADA Alias", 120],
  ];

  const powerSystemBaseColumns = [
    ["ists_inlet_points", "ISTS inlet points", 150],
    ["per_capita_consumption", "Per capita kWh", 150],
    ["state_gna", "State GNA", 130],
  ];

  return (
    <AppShell>
      <div className="container-fluid py-2 theme-page-container">
        {/* COMPACT TOP HEADER */}
        <div className="d-flex justify-content-between align-items-center mb-3 mt-2 flex-wrap gap-2">
          <div>
            <div className="d-flex align-items-center gap-2 mb-1">
              <span
                className="badge rounded-pill fw-bold text-dark"
                style={{
                  backgroundColor: "#00DF81", // Caribbean Green accent
                  fontSize: "0.65rem",
                  padding: "0.35rem 0.7rem",
                  letterSpacing: "0.05em"
                }}
              >
                <Activity size={10} className="me-1 align-text-bottom" /> PSP ADMINISTRATOR
              </span>
            </div>
            <h1 className="fw-bold mb-0 text-dark" style={{ fontSize: "1.45rem", letterSpacing: "-0.02em" }}>
              Power System Profile Ingestion Console
            </h1>
            <p className="mb-0 text-secondary" style={{ fontSize: "0.8rem" }}>
              Force sync dates, review status records, and update pipeline credentials.
            </p>
          </div>
          <button
            className="btn theme-btn-outline theme-btn-mini d-flex align-items-center gap-2"
            onClick={handleRefresh}
            disabled={loading}
          >
            <RefreshCw size={12} className={loading ? "animate-spin-custom" : ""} />
            <span>Refresh Console</span>
          </button>
        </div>

        {/* BACKGROUND PROGRESS BAR BUBBLE */}
        {isSyncActive && (
          <div
            className="theme-glass-card mb-3 p-3 text-white border-0"
            style={{
              background: "linear-gradient(135deg, #0B453A 0%, #03624C 100%)"
            }}
          >
            <div className="d-flex justify-content-between align-items-center mb-2">
              <div className="d-flex align-items-center gap-2">
                <RefreshCw className="animate-spin-custom text-info" size={16} style={{ color: "#00DF81" }} />
                <span className="fw-bold small" style={{ color: "#F1F7F6" }}>
                  Ingesting Historical Range in Background...
                </span>
              </div>
              <span className="fw-bold small" style={{ color: "#00DF81" }}>
                {progressPercent}% ({completedCount} of {totalCount} Days)
              </span>
            </div>

            <div
              className="progress mb-2"
              style={{ height: "6px", borderRadius: "10px", backgroundColor: "#022726" }}
            >
              <div
                className="progress-bar progress-bar-striped progress-bar-animated"
                role="progressbar"
                style={{
                  width: `${progressPercent}%`,
                  backgroundColor: "#00DF81",
                  borderRadius: "10px"
                }}
                aria-valuenow={progressPercent}
                aria-valuemin="0"
                aria-valuemax="100"
              ></div>
            </div>

            <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
              <span className="opacity-75" style={{ fontSize: "0.75rem" }}>
                Currently Synced: <strong className="text-white">{currentSyncDate}</strong>
              </span>
              {lastSyncError && (
                <span className="text-danger fw-bold" style={{ fontSize: "0.75rem" }}>
                  Error: {lastSyncError}
                </span>
              )}
            </div>
          </div>
        )}

        {/* COMPACT METRICS PILLS ROW */}
        <div className="d-flex gap-3 mb-3 flex-wrap">
          <div className="theme-glass-card px-3 py-1.5 d-flex align-items-center gap-2 small shadow-sm" style={{ border: "1px solid rgba(44, 194, 149, 0.3)" }}>
            <Sparkles size={13} className="text-success" />
            <span className="text-dark" style={{ fontSize: "0.88rem" }}>Success Rate: <strong>{syncSuccessRate}%</strong></span>
          </div>
          <div className="theme-glass-card px-3 py-1.5 d-flex align-items-center gap-2 small shadow-sm" style={{ border: "1px solid rgba(23, 135, 109, 0.3)" }}>
            <Database size={13} className="text-success" />
            <span className="text-dark" style={{ fontSize: "0.88rem" }}>Ingested: <strong>{totalFetched} / {statusData.length || 30} Days</strong></span>
          </div>
          <div className="theme-glass-card px-3 py-1.5 d-flex align-items-center gap-2 small shadow-sm" style={{ border: totalMissing > 0 ? "1px solid rgba(245, 158, 11, 0.3)" : "1px solid rgba(0, 223, 129, 0.3)" }}>
            {totalMissing > 0 ? <AlertTriangle size={13} className="text-warning" /> : <CheckCircle size={13} className="text-success" />}
            <span className="text-dark" style={{ fontSize: "0.88rem" }}>Pending Days: <strong className={totalMissing > 0 ? "text-warning" : "text-success"}>{totalMissing} Days</strong></span>
          </div>
        </div>

        {/* OPERATIONS GRID (Symmetric 3-Column Layout) */}
        <div className="row g-3">
          {/* COLUMN 1: COMPACT TABS OPERATIONAL CONTROLS */}
          <div className="col-12 col-lg-4">
            <div className="theme-glass-card p-3 h-100 d-flex flex-column justify-content-between">
              <div>
                {/* Tabs Switcher */}
                <div className="theme-tab-header">
                  <button
                    className={`theme-tab-btn ${activeTab === "range" ? "active" : ""}`}
                    onClick={() => setActiveTab("range")}
                  >
                    Range Sync
                  </button>
                  <button
                    className={`theme-tab-btn ${activeTab === "single" ? "active" : ""}`}
                    onClick={() => setActiveTab("single")}
                  >
                    Single Date
                  </button>
                </div>

                {activeTab === "range" ? (
                  /* RANGE SYNC PANEL */
                  <div>
                    <p className="small text-muted mb-3" style={{ fontSize: "0.75rem" }}>
                      Ingest report files sequentially for a custom date range.
                    </p>
                    <div className="mb-2">
                      <label className="form-label small fw-bold text-secondary mb-1">Start Date</label>
                      <input
                        type="date"
                        className="form-control theme-input py-1.5 w-100"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                      />
                    </div>
                    <div className="mb-3">
                      <label className="form-label small fw-bold text-secondary mb-1">End Date</label>
                      <input
                        type="date"
                        className="form-control theme-input py-1.5 w-100"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                      />
                    </div>
                    <button
                      className="btn theme-btn-action w-100 py-2 d-flex align-items-center justify-content-center gap-2"
                      onClick={handleSyncRange}
                      disabled={syncLoading || isSyncActive}
                    >
                      {syncLoading ? (
                        <>
                          <div className="spinner-border spinner-border-sm" role="status"></div>
                          <span>Initializing...</span>
                        </>
                      ) : (
                        <>
                          <DownloadCloud size={14} />
                          <span>Ingest Selected Range</span>
                        </>
                      )}
                    </button>
                  </div>
                ) : (
                  /* SINGLE DATE PANEL */
                  <div>
                    <p className="small text-muted mb-3" style={{ fontSize: "0.75rem" }}>
                      Fetch report immediately for one target day.
                    </p>
                    <div className="mb-3">
                      <label className="form-label small fw-bold text-secondary mb-1">Target Date</label>
                      <input
                        type="date"
                        className="form-control theme-input py-1.5 w-100"
                        value={singleDate}
                        onChange={(e) => setSingleDate(e.target.value)}
                      />
                    </div>
                    <button
                      className="btn theme-btn-outline w-100 py-2 d-flex align-items-center justify-content-center gap-2"
                      onClick={() => handleSyncSingleDate(singleDate)}
                      disabled={syncLoading || isSyncActive}
                    >
                      {syncLoading ? (
                        <>
                          <div className="spinner-border spinner-border-sm" role="status"></div>
                          <span>Syncing...</span>
                        </>
                      ) : (
                        <>
                          <RefreshCw size={12} />
                          <span>Force Ingest Date</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>

              {/* Status Note at bottom of tab card */}
              <div className="mt-3 pt-2 border-top border-light text-center">
                <span className="text-secondary" style={{ fontSize: "0.72rem" }}>
                  Sync Status: <strong className={isSyncActive ? "text-success" : "text-muted"}>{isSyncActive ? "Ingestion Active" : "Console Idle"}</strong>
                </span>
              </div>
            </div>
          </div>

          {/* COLUMN 2: ERLDC CREDENTIALS SETTINGS */}
          <div className="col-12 col-lg-4">
            <div className="theme-glass-card p-3 h-100 d-flex flex-column justify-content-between">
              <div>
                <div className="d-flex align-items-center gap-2 mb-3">
                  <div
                    className="p-1.5 rounded-3 d-flex align-items-center justify-content-center"
                    style={{ backgroundColor: "rgba(0, 223, 129, 0.12)", color: "#03624C", width: "28px", height: "28px" }}
                  >
                    <Settings size={14} />
                  </div>
                  <div>
                    <h3 className="h6 fw-bold mb-0 text-dark">Portal Configuration</h3>
                    <p className="small text-muted mb-0" style={{ fontSize: "0.72rem" }}>
                      Update ERLDC login URLs and credentials.
                    </p>
                  </div>
                </div>

                {configLoading ? (
                  <div className="d-flex justify-content-center align-items-center py-5">
                    <div className="spinner-border text-success spinner-border-sm" role="status"></div>
                  </div>
                ) : (
                  <form onSubmit={handleSaveConfig}>
                    <div className="mb-2">
                      <label className="form-label small fw-bold text-secondary mb-1">Username</label>
                      <input
                        type="text"
                        className="form-control theme-input py-1.5 w-100"
                        value={config.psp_username || ""}
                        onChange={(e) => setConfig({ ...config, psp_username: e.target.value })}
                        placeholder="Username"
                        required
                      />
                    </div>
                    <div className="mb-2">
                      <label className="form-label small fw-bold text-secondary mb-1">Password</label>
                      <input
                        type="password"
                        className="form-control theme-input py-1.5 w-100"
                        value={config.psp_password || ""}
                        onChange={(e) => setConfig({ ...config, psp_password: e.target.value })}
                        placeholder="••••••••"
                        required
                      />
                    </div>
                    <div className="mb-2">
                      <label className="form-label small fw-bold text-secondary mb-1">Login Endpoint</label>
                      <input
                        type="url"
                        className="form-control theme-input py-1.5 w-100"
                        value={config.psp_login_url || ""}
                        onChange={(e) => setConfig({ ...config, psp_login_url: e.target.value })}
                        placeholder="Login URL"
                        required
                      />
                    </div>
                    <div className="mb-3">
                      <label className="form-label small fw-bold text-secondary mb-1">PSP Data Endpoint</label>
                      <input
                        type="url"
                        className="form-control theme-input py-1.5 w-100"
                        value={config.psp_data_url || ""}
                        onChange={(e) => setConfig({ ...config, psp_data_url: e.target.value })}
                        placeholder="Data API URL"
                        required
                      />
                    </div>
                    <div className="mb-3">
                      <label className="form-label small fw-bold text-secondary mb-1">Loadshed API Template</label>
                      <input
                        type="text"
                        className="form-control theme-input py-1.5 w-100"
                        value={config.loadshed_api_url || ""}
                        onChange={(e) => setConfig({ ...config, loadshed_api_url: e.target.value })}
                        placeholder="Use {date_from} and {date_to}"
                        required
                      />
                    </div>
                    <div className="mb-3">
                      <label className="form-label small fw-bold text-secondary mb-1">Generation Outage API Template</label>
                      <input
                        type="text"
                        className="form-control theme-input py-1.5 w-100"
                        value={config.outage_api_url || ""}
                        onChange={(e) => setConfig({ ...config, outage_api_url: e.target.value })}
                        placeholder="Use {date}"
                        required
                      />
                    </div>
                    <hr className="my-3 opacity-25" />
                    <h4 className="fw-bold text-dark mb-2" style={{ fontSize: "0.78rem", letterSpacing: "0.03em" }}>
                      WBES / SCHEDULE API SETTINGS
                    </h4>
                    <div className="mb-2">
                      <label className="form-label small fw-bold text-secondary mb-1">WBES Endpoint</label>
                      <input
                        type="url"
                        className="form-control theme-input py-1.5 w-100"
                        value={config.wbes_url || ""}
                        onChange={(e) => setConfig({ ...config, wbes_url: e.target.value })}
                        placeholder="WBES API URL"
                        required
                      />
                    </div>
                    <div className="mb-2">
                      <label className="form-label small fw-bold text-secondary mb-1">API Key</label>
                      <input
                        type="text"
                        className="form-control theme-input py-1.5 w-100"
                        value={config.wbes_api_key || ""}
                        onChange={(e) => setConfig({ ...config, wbes_api_key: e.target.value })}
                        placeholder="API Key"
                        required
                      />
                    </div>
                    <div className="mb-2">
                      <label className="form-label small fw-bold text-secondary mb-1">WBES Username</label>
                      <input
                        type="text"
                        className="form-control theme-input py-1.5 w-100"
                        value={config.wbes_username || ""}
                        onChange={(e) => setConfig({ ...config, wbes_username: e.target.value })}
                        placeholder="WBES Username"
                        required
                      />
                    </div>
                    <div className="mb-3">
                      <label className="form-label small fw-bold text-secondary mb-1">WBES Password</label>
                      <input
                        type="password"
                        className="form-control theme-input py-1.5 w-100"
                        value={config.wbes_password || ""}
                        onChange={(e) => setConfig({ ...config, wbes_password: e.target.value })}
                        placeholder="WBES Password"
                        required
                      />
                    </div>
                    <button
                      type="submit"
                      className="btn theme-btn-primary w-100 py-1.5 d-flex align-items-center justify-content-center gap-2"
                      disabled={savingConfig}
                      style={{ fontSize: "0.82rem" }}
                    >
                      {savingConfig ? (
                        <>
                          <div className="spinner-border spinner-border-sm" role="status"></div>
                          <span>Saving Changes...</span>
                        </>
                      ) : (
                        <>
                          <Lock size={13} />
                          <span>Save Settings</span>
                        </>
                      )}
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>

          {/* COLUMN 3: RIGHT STATUS TRACKER TABLE */}
          <div className="col-12 col-lg-4">
            <div className="theme-glass-card p-3 h-100 d-flex flex-column">
              <div className="mb-2">
                <h3 className="h6 fw-bold mb-0 text-dark">Inbound Ledger Tracker</h3>
                <p className="small text-muted mb-0" style={{ fontSize: "0.72rem" }}>
                  Status of data files in the database.
                </p>
              </div>

              {loading ? (
                <div className="d-flex justify-content-center align-items-center flex-grow-1 py-5">
                  <div
                    className="spinner-border text-success"
                    role="status"
                    style={{ width: "2rem", height: "2rem", color: "#17876D" }}
                  >
                    <span className="visually-hidden">Loading...</span>
                  </div>
                </div>
              ) : (
                <div
                  className="table-responsive flex-grow-1"
                  style={{ maxHeight: "310px", overflowY: "auto" }}
                >
                  <table className="table table-hover align-middle theme-table mb-0">
                    <thead>
                      <tr>
                        <th scope="col" style={{ padding: "0.6rem 0.8rem" }}>Reporting Date</th>
                        <th scope="col" style={{ padding: "0.6rem 0.8rem" }}>Status</th>
                        <th scope="col" style={{ padding: "0.6rem 0.8rem" }}>Synced At</th>
                        <th scope="col" className="text-end" style={{ padding: "0.6rem 0.8rem" }}>
                          Sync
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {statusData.map((row) => (
                        <tr key={row.date}>
                          <td className="fw-bold text-dark" style={{ fontSize: "0.8rem", padding: "0.55rem 0.8rem" }}>
                            <span className="d-flex align-items-center gap-1.5">
                              <Calendar size={13} className="text-secondary" />
                              {row.date}
                            </span>
                          </td>
                          <td style={{ padding: "0.55rem 0.8rem" }}>
                            {row.status === "SUCCESS" ? (
                              <span className="theme-badge-success" style={{ padding: "0.25rem 0.65rem", fontSize: "0.7rem" }}>
                                <CheckCircle size={10} />
                                <span>Fetched</span>
                              </span>
                            ) : (
                              <span className="theme-badge-missing" style={{ padding: "0.25rem 0.65rem", fontSize: "0.7rem" }}>
                                <AlertCircle size={10} />
                                <span>Missing</span>
                              </span>
                            )}
                          </td>
                          <td className="text-secondary" style={{ fontSize: "0.75rem", padding: "0.55rem 0.8rem" }}>
                            {formatDateTime(row.fetched_at)}
                          </td>
                          <td className="text-end" style={{ padding: "0.55rem 0.8rem" }}>
                            <button
                              className="btn theme-btn-outline theme-btn-mini py-1 px-2.5"
                              style={{ fontSize: "0.72rem" }}
                              onClick={() => handleSyncSingleDate(row.date)}
                              disabled={syncLoading || isSyncActive}
                            >
                              <RefreshCw size={9} className="align-text-top" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="theme-glass-card p-3 mt-3">
          <div className="d-flex align-items-center justify-content-between gap-2 mb-3 flex-wrap">
            <div>
              <h3 className="h6 fw-bold mb-0 text-dark">Power System Base Data</h3>
              <p className="small text-muted mb-0" style={{ fontSize: "0.72rem" }}>
                Date-effective ISTS inlet points, per-capita consumption, and State GNA.
              </p>
            </div>
            <div className="d-flex align-items-center gap-2 flex-wrap">
              <input
                type="date"
                className="form-control theme-input py-1"
                value={powerSystemDate}
                onChange={(e) => {
                  setPowerSystemDate(e.target.value);
                  loadPowerSystemBase(e.target.value);
                }}
                style={{ fontSize: "0.75rem", width: "150px" }}
              />
              <button
                className="btn theme-btn-outline theme-btn-mini d-flex align-items-center gap-2"
                onClick={() => loadPowerSystemBase(powerSystemDate)}
                disabled={powerSystemBaseLoading}
              >
                <RefreshCw size={12} className={powerSystemBaseLoading ? "animate-spin-custom" : ""} />
                <span>Load</span>
              </button>
              <button
                className="btn theme-btn-primary theme-btn-mini d-flex align-items-center gap-2"
                onClick={handleSavePowerSystemBase}
                disabled={savingPowerSystemBase || powerSystemBaseLoading}
              >
                {savingPowerSystemBase ? (
                  <div className="spinner-border spinner-border-sm" role="status"></div>
                ) : (
                  <Lock size={12} />
                )}
                <span>Save Base Data</span>
              </button>
            </div>
          </div>

          {powerSystemBaseLoading ? (
            <div className="d-flex justify-content-center align-items-center py-4">
              <div className="spinner-border text-success spinner-border-sm" role="status"></div>
            </div>
          ) : (
            <div className="table-responsive" style={{ maxHeight: "300px", overflow: "auto" }}>
              <table className="table table-hover align-middle theme-table mb-0" style={{ minWidth: "760px" }}>
                <thead>
                  <tr>
                    <th style={{ padding: "0.55rem 0.7rem", width: "160px" }}>State</th>
                    {powerSystemBaseColumns.map(([key, label, width]) => (
                      <th key={key} style={{ padding: "0.55rem 0.7rem", width: `${width}px` }}>
                        {label}
                      </th>
                    ))}
                    <th style={{ padding: "0.55rem 0.7rem", width: "140px" }}>Active From</th>
                  </tr>
                </thead>
                <tbody>
                  {powerSystemBaseRows.map((row, idx) => (
                    <tr key={row.state || idx}>
                      <td className="fw-bold text-dark" style={{ padding: "0.45rem 0.7rem", fontSize: "0.78rem" }}>
                        {row.state}
                      </td>
                      {powerSystemBaseColumns.map(([key]) => (
                        <td key={key} style={{ padding: "0.35rem 0.45rem" }}>
                          <input
                            type="number"
                            className="form-control theme-input py-1"
                            value={row[key] ?? ""}
                            onChange={(e) => updatePowerSystemBaseCell(idx, key, e.target.value)}
                            style={{ fontSize: "0.74rem", minHeight: "28px" }}
                          />
                        </td>
                      ))}
                      <td className="text-secondary" style={{ padding: "0.45rem 0.7rem", fontSize: "0.73rem" }}>
                        {row.effective_date || "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="theme-glass-card p-3 mt-3">
          <div className="d-flex align-items-center justify-content-between gap-2 mb-3 flex-wrap">
            <div>
              <h3 className="h6 fw-bold mb-0 text-dark">PSP Portfolio Source Mapping</h3>
              <p className="small text-muted mb-0" style={{ fontSize: "0.72rem" }}>
                SCADA own-generation columns and WBES schedule acronyms used for portfolio DSM.
              </p>
            </div>
            <div className="d-flex align-items-center gap-2">
              <button
                className="btn theme-btn-outline theme-btn-mini d-flex align-items-center gap-2"
                onClick={loadPortfolioMapping}
                disabled={mappingLoading}
              >
                <RefreshCw size={12} className={mappingLoading ? "animate-spin-custom" : ""} />
                <span>Reload</span>
              </button>
              <button
                className="btn theme-btn-primary theme-btn-mini d-flex align-items-center gap-2"
                onClick={handleSavePortfolioMapping}
                disabled={savingMapping || mappingLoading}
              >
                {savingMapping ? (
                  <div className="spinner-border spinner-border-sm" role="status"></div>
                ) : (
                  <Lock size={12} />
                )}
                <span>Save Mapping</span>
              </button>
            </div>
          </div>

          {mappingLoading ? (
            <div className="d-flex justify-content-center align-items-center py-4">
              <div className="spinner-border text-success spinner-border-sm" role="status"></div>
            </div>
          ) : (
            <div className="table-responsive" style={{ maxHeight: "340px", overflow: "auto" }}>
              <table className="table table-hover align-middle theme-table mb-0" style={{ minWidth: "1320px" }}>
                <thead>
                  <tr>
                    <th style={{ padding: "0.55rem 0.7rem", width: "150px" }}>State</th>
                    {portfolioMappingColumns.map(([key, label, width]) => (
                      <th key={key} style={{ padding: "0.55rem 0.7rem", width: `${width}px` }}>
                        {label}
                      </th>
                    ))}
                    <th style={{ padding: "0.55rem 0.7rem", width: "190px" }}>Frequency Map WBES</th>
                  </tr>
                </thead>
                <tbody>
                  {portfolioMapping.map((row, idx) => (
                    <tr key={row.name || idx}>
                      <td className="fw-bold text-dark" style={{ padding: "0.45rem 0.7rem", fontSize: "0.78rem" }}>
                        {row.name}
                      </td>
                      {portfolioMappingColumns.map(([key]) => (
                        <td key={key} style={{ padding: "0.35rem 0.45rem" }}>
                          <input
                            className="form-control theme-input py-1"
                            value={row[key] || ""}
                            onChange={(e) => updatePortfolioMappingCell(idx, key, e.target.value)}
                            style={{ fontSize: "0.74rem", minHeight: "28px" }}
                          />
                        </td>
                      ))}
                      <td className="text-secondary" style={{ padding: "0.45rem 0.7rem", fontSize: "0.73rem" }}>
                        {(row.wbes_candidates || []).join(", ") || "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
