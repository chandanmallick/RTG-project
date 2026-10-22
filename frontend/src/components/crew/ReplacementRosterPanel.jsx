import React, { useState, useEffect, useCallback, useMemo } from "react";
import api from "../../crewLegacy/api";
import dayjs from "dayjs";
import {
  Box,
  Paper,
  Typography,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Button,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Chip,
  TextField,
  TableContainer,
  MenuItem,
  IconButton,
  Grid,
  FormControl,
  InputLabel,
  Select,
  Switch,
  Stack,
  Alert,
  Tooltip,
  CircularProgress,
  RadioGroup,
  FormControlLabel,
  Radio,
  Tabs,
  Tab,
  Badge,
  Card,
  CardContent,
} from "@mui/material";
import {
  Users,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ArrowUp,
  ArrowDown,
  Play,
  Settings,
  Shield,
  Clock,
  Sparkles,
  RefreshCw,
  HelpCircle,
  FileText,
  UserCheck,
  ChevronRight,
  Zap,
} from "lucide-react";

export default function ReplacementRosterPanel({ onRefreshReplacements }) {
  // State
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState(null);
  const [matrixData, setMatrixData] = useState([]);
  const [rejections, setRejections] = useState([]);
  const [longLeaves, setLongLeaves] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(dayjs().format("YYYY-MM"));
  const [activeTab, setActiveTab] = useState(0); // 0: Matrix, 1: SIC Pool, 2: Shift Engineer Pool, 3: Long Duration Policy
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPoolFilter, setSelectedPoolFilter] = useState("ALL");
  const [dutySortAsc, setDutySortAsc] = useState(true);
  const [actionNotice, setActionNotice] = useState(null);

  // Auto Allocate state
  const [allocating, setAllocating] = useState(false);
  const [allocationResult, setAllocationResult] = useState(null);
  const [allocateModalOpen, setAllocateModalOpen] = useState(false);

  // Rejection modal state (from deep link or in-app review)
  const [rejectDialog, setRejectDialog] = useState({
    open: false,
    leaveId: "",
    leaveData: null,
    canReject: false,
    roleTitle: "",
    reason: "",
    submitting: false,
    error: "",
  });

  // Rejection History dialog state
  const [auditDialog, setAuditDialog] = useState({
    open: false,
    employee: null,
    records: [],
  });

  // Long Duration Policy modal state
  const [policyDialog, setPolicyDialog] = useState({
    open: false,
    group: null,
    policy: "sequential",
    permanentEmployeeId: "",
    submitting: false,
  });

  // Saving pools state
  const [savingPool, setSavingPool] = useState(false);

  // ==========================================
  // FETCH DATA
  // ==========================================

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [cfgRes, matRes] = await Promise.all([
        api.get("/replacement/roster/config"),
        api.get("/replacement/roster/matrix", { params: { month: selectedMonth } }),
      ]);
      setConfig(cfgRes.data || null);
      setMatrixData(matRes.data?.matrix || []);
      setRejections(matRes.data?.rejections || []);
      setLongLeaves(matRes.data?.longDurationLeaves || []);
    } catch (err) {
      console.error("Error loading replacement roster data:", err);
      setActionNotice({
        severity: "error",
        text: err.response?.data?.detail || "Failed to load replacement roster data.",
      });
    } finally {
      setLoading(false);
    }
  }, [selectedMonth]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Deep linking: check URL parameters for action=review & leaveId=...
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const action = params.get("action");
    const leaveId = params.get("leaveId");
    if (action === "review" && leaveId) {
      openRejectionModal(leaveId);
    }
  }, []);

  // ==========================================
  // REJECTION MODAL HANDLERS
  // ==========================================

  const openRejectionModal = async (leaveId) => {
    setRejectDialog({
      open: true,
      leaveId,
      leaveData: null,
      canReject: false,
      roleTitle: "",
      reason: "",
      submitting: false,
      error: "",
    });
    try {
      const res = await api.get(`/replacement/roster/can-reject/${leaveId}`);
      setRejectDialog((prev) => ({
        ...prev,
        leaveData: res.data,
        canReject: Boolean(res.data.canReject),
        roleTitle: res.data.roleTitle || "",
      }));
    } catch (err) {
      setRejectDialog((prev) => ({
        ...prev,
        error: err.response?.data?.detail || "Unable to check rejection permissions for this leave.",
      }));
    }
  };

  const submitRejection = async () => {
    if (!rejectDialog.reason.trim()) {
      setRejectDialog((prev) => ({ ...prev, error: "Rejection comment/reason is required." }));
      return;
    }
    setRejectDialog((prev) => ({ ...prev, submitting: true, error: "" }));
    try {
      const res = await api.post(`/replacement/roster/reject/${rejectDialog.leaveId}`, {
        comment: rejectDialog.reason.trim(),
      });
      setActionNotice({
        severity: "success",
        text: `Replacement assignment successfully rejected and released. Counter incremented to ${res.data?.newRejectionCount ?? ""}.`,
      });
      setRejectDialog((prev) => ({ ...prev, open: false, submitting: false }));
      loadData();
      if (onRefreshReplacements) onRefreshReplacements();
    } catch (err) {
      setRejectDialog((prev) => ({
        ...prev,
        submitting: false,
        error: err.response?.data?.detail || "Failed to reject replacement assignment.",
      }));
    }
  };

  // ==========================================
  // CONFIG & TEST MODE HANDLERS
  // ==========================================

  const toggleTestMode = async (enabled) => {
    try {
      const res = await api.put("/replacement/roster/config", { testMode: enabled });
      setConfig(res.data);
      setActionNotice({
        severity: "info",
        text: `Replacement roster switched to ${enabled ? "TEST MODE (Simulation)" : "LIVE MODE (Production)"}.`,
      });
    } catch (err) {
      setActionNotice({
        severity: "error",
        text: err.response?.data?.detail || "Failed to update test mode.",
      });
    }
  };

  // ==========================================
  // POOL REORDERING
  // ==========================================

  const movePoolItem = (poolKey, index, direction) => {
    if (!config || !config[poolKey]) return;
    const list = [...config[poolKey]];
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= list.length) return;
    const temp = list[index];
    list[index] = list[targetIdx];
    list[targetIdx] = temp;
    setConfig((prev) => ({
      ...prev,
      [poolKey]: list,
    }));
  };

  const savePoolOrder = async (poolKey) => {
    if (!config) return;
    setSavingPool(true);
    try {
      const payload = {
        [poolKey]: config[poolKey],
      };
      const res = await api.put("/replacement/roster/config", payload);
      setConfig(res.data);
      setActionNotice({
        severity: "success",
        text: `Pool sequence updated successfully.`,
      });
    } catch (err) {
      setActionNotice({
        severity: "error",
        text: err.response?.data?.detail || "Failed to save pool sequence.",
      });
    } finally {
      setSavingPool(false);
    }
  };

  // ==========================================
  // AUTO ALLOCATE TRIGGER
  // ==========================================

  const triggerAutoAllocate = async (force = false, testMode = null) => {
    setAllocating(true);
    setAllocationResult(null);
    try {
      const res = await api.post("/replacement/roster/auto-allocate", {
        force,
        test_mode: testMode !== null ? testMode : config?.testMode,
      });
      setAllocationResult(res.data);
      setAllocateModalOpen(true);
      loadData();
      if (onRefreshReplacements) onRefreshReplacements();
    } catch (err) {
      setActionNotice({
        severity: "error",
        text: err.response?.data?.detail || "Auto-allocation failed to execute.",
      });
    } finally {
      setAllocating(false);
    }
  };

  // ==========================================
  // LONG DURATION POLICY
  // ==========================================

  const openPolicyDialog = (group) => {
    setPolicyDialog({
      open: true,
      group,
      policy: group.policy || "sequential",
      permanentEmployeeId: group.permanentEmployeeId || "",
      submitting: false,
    });
  };

  const submitPolicy = async () => {
    if (!policyDialog.group) return;
    setPolicyDialog((prev) => ({ ...prev, submitting: true }));
    try {
      await api.post("/replacement/roster/long-duration-policy", {
        leaveGroupId: policyDialog.group.leaveGroupId,
        policy: policyDialog.policy,
        permanentEmployeeId: policyDialog.policy === "permanent" ? policyDialog.permanentEmployeeId : null,
      });
      setActionNotice({
        severity: "success",
        text: `Long duration policy configured as "${policyDialog.policy === "permanent" ? "Permanent Single Replacement" : "Sequential Round-Robin"}" for ${policyDialog.group.employeeName}.`,
      });
      setPolicyDialog((prev) => ({ ...prev, open: false, submitting: false }));
      loadData();
    } catch (err) {
      setActionNotice({
        severity: "error",
        text: err.response?.data?.detail || "Failed to set policy.",
      });
      setPolicyDialog((prev) => ({ ...prev, submitting: false }));
    }
  };

  // Filter matrix data
  const filteredMatrix = useMemo(() => {
    let list = matrixData;
    if (selectedPoolFilter && selectedPoolFilter !== "ALL") {
      list = list.filter((m) => m.poolCategory === selectedPoolFilter || m.pool === selectedPoolFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (m) =>
          (m.employeeName || "").toLowerCase().includes(q) ||
          (m.employeeId || "").toLowerCase().includes(q) ||
          (m.designation || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [matrixData, searchQuery, selectedPoolFilter]);

  // Dynamic max duty columns count (at least 5 duty columns)
  const maxDutiesCount = useMemo(() => {
    const counts = filteredMatrix.map((m) => (m.duties || []).length);
    const max = counts.length > 0 ? Math.max(...counts) : 0;
    return Math.max(5, max);
  }, [filteredMatrix]);

  // Overall metrics & fallback pool counts (guarantees pools never show 0 if data exists)
  const sicPoolCount = useMemo(() => {
    if (config?.sicPool && config.sicPool.length > 0) return config.sicPool.length;
    return matrixData.filter((m) => m.pool === "SIC" || m.poolCategory === "SIC").length;
  }, [config, matrixData]);

  const shiftEngPoolCount = useMemo(() => {
    if (config?.shiftEngineerPool && config.shiftEngineerPool.length > 0) return config.shiftEngineerPool.length;
    return matrixData.filter((m) => m.pool === "Shift Engineer" || m.poolCategory === "Shift Engineer").length;
  }, [config, matrixData]);

  const totalDutiesAssigned = useMemo(
    () => matrixData.reduce((acc, curr) => acc + (curr.totalDuties || 0), 0),
    [matrixData]
  );
  const totalRejectionsCount = useMemo(
    () => matrixData.reduce((acc, curr) => acc + (curr.rejectionCount || 0), 0),
    [matrixData]
  );

  return (
    <Box sx={{ width: "100%", mt: 1 }}>
      {/* Action Notification Alert */}
      {actionNotice && (
        <Alert
          severity={actionNotice.severity}
          onClose={() => setActionNotice(null)}
          sx={{ mb: 2.5, borderRadius: 2 }}
        >
          {actionNotice.text}
        </Alert>
      )}

      {/* Top Banner & Control Deck */}
      <Paper
        elevation={0}
        sx={{
          p: 2.5,
          mb: 3,
          borderRadius: 3,
          background: "linear-gradient(135deg, #0A192F 0%, #0D2D5E 60%, #154580 100%)",
          color: "#FFFFFF",
          boxShadow: "0 10px 30px rgba(10, 25, 47, 0.18)",
        }}
      >
        <Grid container spacing={2.5} alignItems="center">
          <Grid item xs={12} md={7}>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Box
                sx={{
                  p: 1.2,
                  borderRadius: 2,
                  bgcolor: "rgba(255, 255, 255, 0.12)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Sparkles size={24} color="#60A5FA" />
              </Box>
              <Box>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="h6" sx={{ fontWeight: 800, color: "#FFFFFF", letterSpacing: "-0.02em" }}>
                    Sequential Replacement Rostering & Duty Matrix
                  </Typography>
                  <Chip
                    size="small"
                    icon={<Zap size={13} color="#FFFFFF" />}
                    label="D-5 Automation"
                    sx={{
                      bgcolor: "rgba(59, 130, 246, 0.3)",
                      color: "#93C5FD",
                      fontWeight: 700,
                      border: "1px solid rgba(147, 197, 253, 0.3)",
                    }}
                  />
                </Stack>
                <Typography variant="body2" sx={{ color: "rgba(255, 255, 255, 0.75)", mt: 0.3 }}>
                  Two separate sequential pools (SIC & Shift Engineer). Auto-allocated on D-5. Protected frontend rejection with rejection counters.
                </Typography>
              </Box>
            </Stack>
          </Grid>

          <Grid item xs={12} md={5}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2} justifyContent="flex-end" alignItems="center">
              {/* Test Mode / Live Duty Switcher */}
              <Box
                sx={{
                  bgcolor: "rgba(0, 0, 0, 0.25)",
                  px: 2,
                  py: 1,
                  borderRadius: 2.5,
                  border: "1px solid rgba(255, 255, 255, 0.12)",
                  display: "flex",
                  alignItems: "center",
                  gap: 1.2,
                }}
              >
                <Box sx={{ textAlign: "right" }}>
                  <Typography variant="caption" sx={{ display: "block", color: "rgba(255, 255, 255, 0.6)", fontWeight: 700 }}>
                    ROSTER MODE
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{
                      fontWeight: 800,
                      color: config?.testMode ? "#FCD34D" : "#34D399",
                    }}
                  >
                    {config?.testMode ? "🧪 Test Basis" : "🚀 Live Duty"}
                  </Typography>
                </Box>
                <Switch
                  checked={!config?.testMode}
                  onChange={(e) => toggleTestMode(!e.target.checked)}
                  color="success"
                  disabled={loading}
                />
              </Box>

              {/* Run D-5 Allocation Button */}
              <Button
                variant="contained"
                onClick={() => triggerAutoAllocate(false)}
                disabled={allocating || loading}
                startIcon={allocating ? <CircularProgress size={16} color="inherit" /> : <Play size={16} />}
                sx={{
                  bgcolor: "#2563EB",
                  "&:hover": { bgcolor: "#1D4ED8" },
                  fontWeight: 800,
                  textTransform: "none",
                  px: 2.2,
                  py: 1.1,
                  borderRadius: 2.5,
                  boxShadow: "0 4px 14px rgba(37, 99, 235, 0.4)",
                }}
              >
                {allocating ? "Allocating..." : "Run D-5 Allocation"}
              </Button>
            </Stack>
          </Grid>
        </Grid>
      </Paper>

      {/* Metric Cards Row */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card elevation={0} sx={{ p: 2, borderRadius: 2.5, border: "1px solid #E2E8F0", bgcolor: "#FFFFFF" }}>
            <Stack direction="row" alignItems="center" spacing={1.8}>
              <Box sx={{ p: 1.3, borderRadius: 2, bgcolor: "#EFF6FF", color: "#2563EB" }}>
                <Users size={22} />
              </Box>
              <Box>
                <Typography variant="caption" sx={{ color: "#64748B", fontWeight: 700, textTransform: "uppercase" }}>
                  SIC Pool Active
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 800, color: "#0F172A" }}>
                  {sicPoolCount}
                  <Typography component="span" variant="caption" sx={{ ml: 1, color: "#10B981", fontWeight: 700 }}>
                    Next: #{((config?.nextSicIndex || 0) % (sicPoolCount || 1)) + 1}
                  </Typography>
                </Typography>
              </Box>
            </Stack>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card elevation={0} sx={{ p: 2, borderRadius: 2.5, border: "1px solid #E2E8F0", bgcolor: "#FFFFFF" }}>
            <Stack direction="row" alignItems="center" spacing={1.8}>
              <Box sx={{ p: 1.3, borderRadius: 2, bgcolor: "#F0FDF4", color: "#16A34A" }}>
                <Shield size={22} />
              </Box>
              <Box>
                <Typography variant="caption" sx={{ color: "#64748B", fontWeight: 700, textTransform: "uppercase" }}>
                  Shift Engg Pool
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 800, color: "#0F172A" }}>
                  {shiftEngPoolCount}
                  <Typography component="span" variant="caption" sx={{ ml: 1, color: "#10B981", fontWeight: 700 }}>
                    Next: #{((config?.nextShiftEngineerIndex || 0) % (shiftEngPoolCount || 1)) + 1}
                  </Typography>
                </Typography>
              </Box>
            </Stack>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card elevation={0} sx={{ p: 2, borderRadius: 2.5, border: "1px solid #E2E8F0", bgcolor: "#FFFFFF" }}>
            <Stack direction="row" alignItems="center" spacing={1.8}>
              <Box sx={{ p: 1.3, borderRadius: 2, bgcolor: "#FAF5FF", color: "#9333EA" }}>
                <Calendar size={22} />
              </Box>
              <Box>
                <Typography variant="caption" sx={{ color: "#64748B", fontWeight: 700, textTransform: "uppercase" }}>
                  Duties Allocated ({selectedMonth || "All"})
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 800, color: "#0F172A" }}>
                  {totalDutiesAssigned}
                </Typography>
              </Box>
            </Stack>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card elevation={0} sx={{ p: 2, borderRadius: 2.5, border: "1px solid #E2E8F0", bgcolor: "#FFFFFF" }}>
            <Stack direction="row" alignItems="center" spacing={1.8}>
              <Box sx={{ p: 1.3, borderRadius: 2, bgcolor: "#FEF2F2", color: "#DC2626" }}>
                <AlertTriangle size={22} />
              </Box>
              <Box>
                <Typography variant="caption" sx={{ color: "#64748B", fontWeight: 700, textTransform: "uppercase" }}>
                  Rejections Logged
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 800, color: totalRejectionsCount > 0 ? "#DC2626" : "#0F172A" }}>
                  {totalRejectionsCount}
                </Typography>
              </Box>
            </Stack>
          </Card>
        </Grid>
      </Grid>

      {/* Long Duration Leave Notification Banner (if any pending decision) */}
      {longLeaves && longLeaves.length > 0 && (
        <Paper
          elevation={0}
          sx={{
            p: 2,
            mb: 3,
            borderRadius: 2.5,
            border: "1px solid #FED7AA",
            bgcolor: "#FFF7ED",
          }}
        >
          <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems="center" spacing={2}>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Box sx={{ p: 1, borderRadius: 2, bgcolor: "#FDBA74", color: "#9A3412" }}>
                <Clock size={20} />
              </Box>
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 800, color: "#9A3412" }}>
                  Long-Duration Leave Detected ({longLeaves.length} upcoming block{longLeaves.length > 1 ? "s" : ""})
                </Typography>
                <Typography variant="caption" sx={{ color: "#C2410C" }}>
                  Leaves spanning &ge; {config?.longDurationThreshold || 3} consecutive days require Admin decision: <strong>Permanent Replacement</strong> (single person throughout) or <strong>Sequential Round-Robin</strong>.
                </Typography>
              </Box>
            </Stack>
            <Button
              variant="outlined"
              size="small"
              onClick={() => setActiveTab(3)}
              sx={{
                borderColor: "#EA580C",
                color: "#EA580C",
                fontWeight: 800,
                textTransform: "none",
                borderRadius: 2,
                "&:hover": { bgcolor: "#FFEDD5", borderColor: "#C2410C" },
              }}
            >
              Review Long Duration Leaves
            </Button>
          </Stack>
        </Paper>
      )}

      {/* Main Tabs Navigation */}
      <Paper elevation={0} sx={{ borderRadius: 3, border: "1px solid #E2E8F0", overflow: "hidden", mb: 3 }}>
        <Tabs
          value={activeTab}
          onChange={(_, val) => setActiveTab(val)}
          sx={{
            px: 2,
            borderBottom: "1px solid #E2E8F0",
            bgcolor: "#F8FAFC",
            "& .MuiTab-root": {
              textTransform: "none",
              fontWeight: 700,
              fontSize: "0.92rem",
              py: 2,
            },
          }}
        >
          <Tab
            icon={<FileText size={17} />}
            iconPosition="start"
            label="Employee Duty & Rejection Matrix"
          />
          <Tab
            icon={<Users size={17} />}
            iconPosition="start"
            label={
              <Stack direction="row" spacing={0.8} alignItems="center">
                <span>SIC Pool</span>
                <Chip size="small" label={sicPoolCount} sx={{ height: 20, fontSize: 11, fontWeight: 800 }} />
              </Stack>
            }
          />
          <Tab
            icon={<Shield size={17} />}
            iconPosition="start"
            label={
              <Stack direction="row" spacing={0.8} alignItems="center">
                <span>Shift Engineer Pool</span>
                <Chip size="small" label={shiftEngPoolCount} sx={{ height: 20, fontSize: 11, fontWeight: 800 }} />
              </Stack>
            }
          />
          <Tab
            icon={<Clock size={17} />}
            iconPosition="start"
            label={
              <Stack direction="row" spacing={0.8} alignItems="center">
                <span>Long Duration Policies</span>
                {longLeaves.length > 0 && (
                  <Chip
                    size="small"
                    label={longLeaves.length}
                    color="warning"
                    sx={{ height: 20, fontSize: 11, fontWeight: 800 }}
                  />
                )}
              </Stack>
            }
          />
        </Tabs>

        {/* ========================================================= */}
        {/* TAB 0: EMPLOYEE DUTY & REJECTION MATRIX */}
        {/* ========================================================= */}
        {activeTab === 0 && (
          <Box sx={{ p: 2.5 }}>
            {/* Filter and Control Bar */}
            <Stack
              direction={{ xs: "column", md: "row" }}
              spacing={2}
              justifyContent="space-between"
              alignItems={{ xs: "stretch", md: "center" }}
              sx={{ mb: 2.5 }}
            >
              {/* Left: Search & Filters */}
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems="center" flexWrap="wrap">
                <TextField
                  size="small"
                  placeholder="Search employee by name, ID or role..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  sx={{ minWidth: 260 }}
                />

                {/* Pool Filter Chips */}
                <Stack direction="row" spacing={0.8}>
                  <Chip
                    label={`All (${matrixData.length})`}
                    onClick={() => setSelectedPoolFilter("ALL")}
                    color={selectedPoolFilter === "ALL" ? "primary" : "default"}
                    variant={selectedPoolFilter === "ALL" ? "filled" : "outlined"}
                    size="small"
                    sx={{ fontWeight: 700, cursor: "pointer" }}
                  />
                  <Chip
                    label={`SIC (${sicPoolCount})`}
                    onClick={() => setSelectedPoolFilter("SIC")}
                    color={selectedPoolFilter === "SIC" ? "primary" : "default"}
                    variant={selectedPoolFilter === "SIC" ? "filled" : "outlined"}
                    size="small"
                    sx={{ fontWeight: 700, cursor: "pointer" }}
                  />
                  <Chip
                    label={`Shift Engg (${shiftEngPoolCount})`}
                    onClick={() => setSelectedPoolFilter("Shift Engineer")}
                    color={selectedPoolFilter === "Shift Engineer" ? "primary" : "default"}
                    variant={selectedPoolFilter === "Shift Engineer" ? "filled" : "outlined"}
                    size="small"
                    sx={{ fontWeight: 700, cursor: "pointer" }}
                  />
                </Stack>

                {/* Month Selector */}
                <TextField
                  size="small"
                  type="month"
                  label="Filter Month"
                  InputLabelProps={{ shrink: true }}
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  sx={{ width: 150 }}
                />
                {selectedMonth && (
                  <Button
                    size="small"
                    variant="text"
                    onClick={() => setSelectedMonth("")}
                    sx={{ textTransform: "none", color: "#64748B", fontWeight: 700, minWidth: "auto", px: 1 }}
                  >
                    All Months
                  </Button>
                )}
              </Stack>

              {/* Right: Sort Order & Refresh */}
              <Stack direction="row" spacing={1} alignItems="center" justifyContent="flex-end">
                <Tooltip title={dutySortAsc ? "Showing Duty 1 as earliest duty assigned" : "Showing Duty 1 as most recent duty assigned"}>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => setDutySortAsc(!dutySortAsc)}
                    startIcon={dutySortAsc ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
                    sx={{
                      textTransform: "none",
                      fontWeight: 700,
                      borderRadius: 2,
                      borderColor: "#CBD5E1",
                      color: "#334155",
                      fontSize: 12,
                    }}
                  >
                    {dutySortAsc ? "Duty 1 = Earliest" : "Duty 1 = Recent"}
                  </Button>
                </Tooltip>

                <Button
                  variant="contained"
                  size="small"
                  onClick={loadData}
                  startIcon={<RefreshCw size={14} />}
                  disabled={loading}
                  sx={{
                    textTransform: "none",
                    fontWeight: 800,
                    borderRadius: 2,
                    bgcolor: "#2563EB",
                    "&:hover": { bgcolor: "#1D4ED8" },
                  }}
                >
                  Refresh Matrix
                </Button>
              </Stack>
            </Stack>

            {/* Simple Matrix Table: Employee vs Duty 1, Duty 2, Duty 3... */}
            <TableContainer
              sx={{
                border: "1px solid #E2E8F0",
                borderRadius: 2.5,
                maxHeight: 560,
                boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
                overflowX: "auto",
              }}
            >
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow sx={{ "& th": { bgcolor: "#F1F5F9", fontWeight: 800, color: "#334155", py: 1.4 } }}>
                    <TableCell width="50" align="center">#</TableCell>
                    <TableCell sx={{ minWidth: 200 }}>Employee</TableCell>
                    <TableCell sx={{ minWidth: 120 }}>Pool</TableCell>

                    {/* Dynamic Duty Columns: Duty 1, Duty 2, Duty 3... */}
                    {Array.from({ length: maxDutiesCount }).map((_, i) => (
                      <TableCell key={i} align="center" sx={{ minWidth: 135 }}>
                        Duty {i + 1}
                      </TableCell>
                    ))}

                    <TableCell align="center" sx={{ minWidth: 100 }}>Total Duties</TableCell>
                    <TableCell align="center" sx={{ minWidth: 110 }}>Rejections</TableCell>
                    <TableCell align="center" sx={{ minWidth: 90 }}>Actions</TableCell>
                  </TableRow>
                </TableHead>

                <TableBody>
                  {filteredMatrix.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={maxDutiesCount + 6} align="center" sx={{ py: 6, color: "#64748B" }}>
                        {loading ? <CircularProgress size={26} /> : "No replacement duty records found."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredMatrix.map((item, idx) => {
                      // Sort duties per employee according to dutySortAsc
                      const sortedDuties = [...(item.duties || [])].sort((a, b) => {
                        const da = a.date || "";
                        const db = b.date || "";
                        return dutySortAsc ? da.localeCompare(db) : db.localeCompare(da);
                      });

                      return (
                        <TableRow
                          key={item.employeeId}
                          hover
                          sx={{
                            "&:hover": { bgcolor: "#F8FAFC" },
                            "& td": { py: 1 },
                          }}
                        >
                          {/* Row Index */}
                          <TableCell align="center" sx={{ fontWeight: 700, color: "#64748B", fontSize: 12 }}>
                            {idx + 1}
                          </TableCell>

                          {/* Employee Name & Meta */}
                          <TableCell>
                            <Typography variant="body2" sx={{ fontWeight: 800, color: "#0F172A", lineHeight: 1.3 }}>
                              {item.employeeName}
                            </Typography>
                            <Typography variant="caption" sx={{ color: "#64748B", fontSize: 11 }}>
                              {item.employeeId} &bull; {item.designation || "Shift Crew"}
                            </Typography>
                          </TableCell>

                          {/* Pool Badge */}
                          <TableCell>
                            <Chip
                              size="small"
                              label={item.poolCategory || item.pool || "Shift Engineer"}
                              sx={{
                                fontWeight: 700,
                                fontSize: 11,
                                height: 22,
                                bgcolor:
                                  (item.poolCategory || item.pool) === "SIC"
                                    ? "#EFF6FF"
                                    : (item.poolCategory || item.pool) === "SIC & Shift Engineer"
                                    ? "#FAF5FF"
                                    : "#F0FDF4",
                                color:
                                  (item.poolCategory || item.pool) === "SIC"
                                    ? "#1E40AF"
                                    : (item.poolCategory || item.pool) === "SIC & Shift Engineer"
                                    ? "#7E22CE"
                                    : "#15803D",
                                border: "1px solid rgba(0,0,0,0.06)",
                              }}
                            />
                          </TableCell>

                          {/* Duty Columns: Duty 1, Duty 2, Duty 3... */}
                          {Array.from({ length: maxDutiesCount }).map((_, i) => {
                            const duty = sortedDuties[i];
                            if (!duty) {
                              return (
                                <TableCell key={i} align="center" sx={{ color: "#CBD5E1", fontSize: 14 }}>
                                  —
                                </TableCell>
                              );
                            }

                            const dutyName = duty.duty || "Shift";
                            const isMorning = dutyName.toLowerCase().includes("morn");
                            const isEvening = dutyName.toLowerCase().includes("eve");
                            const isNight = dutyName.toLowerCase().includes("night");

                            const dutyDateStr = dayjs(duty.date).isValid()
                              ? dayjs(duty.date).format("DD-MMM-YYYY")
                              : duty.date || "—";

                            const replacedName =
                              typeof duty.replacedFor === "object"
                                ? duty.replacedFor?.name
                                : duty.replacedFor;

                            return (
                              <TableCell key={i} align="center" sx={{ p: 0.8 }}>
                                <Box
                                  sx={{
                                    p: 0.7,
                                    px: 1,
                                    borderRadius: 1.8,
                                    bgcolor: "#FFFFFF",
                                    border: "1px solid #E2E8F0",
                                    boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
                                    display: "inline-flex",
                                    flexDirection: "column",
                                    gap: 0.3,
                                    alignItems: "center",
                                    minWidth: 115,
                                  }}
                                >
                                  {/* Date */}
                                  <Typography variant="caption" sx={{ fontWeight: 800, color: "#1E293B", fontSize: 11 }}>
                                    {dutyDateStr}
                                  </Typography>

                                  {/* Duty Type Chip */}
                                  <Stack direction="row" spacing={0.4} alignItems="center">
                                    <Chip
                                      size="small"
                                      label={dutyName}
                                      sx={{
                                        height: 18,
                                        fontSize: 10,
                                        fontWeight: 800,
                                        bgcolor: isMorning
                                          ? "#EFF6FF"
                                          : isEvening
                                          ? "#FEF3C7"
                                          : isNight
                                          ? "#EDE9FE"
                                          : "#F1F5F9",
                                        color: isMorning
                                          ? "#1D4ED8"
                                          : isEvening
                                          ? "#B45309"
                                          : isNight
                                          ? "#6D28D9"
                                          : "#334155",
                                        border: "1px solid rgba(0,0,0,0.06)",
                                      }}
                                    />
                                    {duty.isSIC && (
                                      <Chip
                                        size="small"
                                        label="SIC"
                                        sx={{
                                          height: 16,
                                          fontSize: 9,
                                          fontWeight: 900,
                                          bgcolor: "#FEF2F2",
                                          color: "#DC2626",
                                          border: "1px solid #FCA5A5",
                                        }}
                                      />
                                    )}
                                  </Stack>

                                  {/* Replaced For */}
                                  {replacedName && (
                                    <Typography
                                      variant="caption"
                                      sx={{
                                        color: "#64748B",
                                        fontSize: 9.5,
                                        display: "block",
                                        maxWidth: 120,
                                        whiteSpace: "nowrap",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                      }}
                                      title={`Cover for ${replacedName}`}
                                    >
                                      For: {replacedName}
                                    </Typography>
                                  )}
                                </Box>
                              </TableCell>
                            );
                          })}

                          {/* Total Duties */}
                          <TableCell align="center">
                            <Chip
                              size="small"
                              label={item.totalDuties || 0}
                              sx={{
                                fontWeight: 800,
                                fontSize: 12,
                                height: 24,
                                minWidth: 32,
                                bgcolor: item.totalDuties > 0 ? "#DBEAFE" : "#F1F5F9",
                                color: item.totalDuties > 0 ? "#1E40AF" : "#64748B",
                              }}
                            />
                          </TableCell>

                          {/* Rejection Counter */}
                          <TableCell align="center">
                            <Tooltip
                              title={
                                item.rejectionCount > 0
                                  ? "Click to view full rejection audit trail"
                                  : "No rejections recorded"
                              }
                            >
                              <Button
                                size="small"
                                variant={item.rejectionCount > 0 ? "contained" : "text"}
                                color="error"
                                onClick={() => {
                                  const empRejections = rejections.filter((r) => r.employeeId === item.employeeId);
                                  setAuditDialog({ open: true, employee: item, records: empRejections });
                                }}
                                disabled={item.rejectionCount === 0}
                                sx={{
                                  minWidth: 36,
                                  height: 24,
                                  fontWeight: 800,
                                  borderRadius: 1.5,
                                  textTransform: "none",
                                  fontSize: 12,
                                  bgcolor: item.rejectionCount > 0 ? "#DC2626" : undefined,
                                }}
                              >
                                {item.rejectionCount || 0}
                              </Button>
                            </Tooltip>
                          </TableCell>

                          {/* Actions */}
                          <TableCell align="center">
                            <Button
                              size="small"
                              variant="text"
                              onClick={() => {
                                const empRejections = rejections.filter((r) => r.employeeId === item.employeeId);
                                setAuditDialog({ open: true, employee: item, records: empRejections });
                              }}
                              sx={{ textTransform: "none", fontWeight: 700, fontSize: 11 }}
                            >
                              History
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}

        {/* ========================================================= */}
        {/* TAB 1: SIC POOL MANAGEMENT */}
        {/* ========================================================= */}
        {activeTab === 1 && (
          <Box sx={{ p: 2.5 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 800, color: "#0F172A" }}>
                  Sequential SIC Replacement Pool
                </Typography>
                <Typography variant="caption" sx={{ color: "#64748B" }}>
                  Eligible for SIC coverage. Automatically rotated in sequence on D-5. Pointer advances upon allocation.
                </Typography>
              </Box>
              <Button
                variant="contained"
                onClick={() => savePoolOrder("sicPool")}
                disabled={savingPool}
                sx={{
                  bgcolor: "#2563EB",
                  "&:hover": { bgcolor: "#1D4ED8" },
                  fontWeight: 800,
                  textTransform: "none",
                  borderRadius: 2,
                }}
              >
                {savingPool ? "Saving..." : "Save SIC Sequence"}
              </Button>
            </Stack>

            <TableContainer sx={{ border: "1px solid #E2E8F0", borderRadius: 2 }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: "#F1F5F9" }}>
                    <TableCell width="80">Order</TableCell>
                    <TableCell>Employee Name</TableCell>
                    <TableCell>Employee ID</TableCell>
                    <TableCell>Designation / Role</TableCell>
                    <TableCell align="center">Next Pointer</TableCell>
                    <TableCell align="center">Reorder</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(config?.sicPool || []).map((emp, idx) => {
                    const isNext = (config?.nextSicIndex || 0) % (config?.sicPool?.length || 1) === idx;
                    return (
                      <TableRow
                        key={emp.employeeId}
                        sx={{
                          bgcolor: isNext ? "rgba(59, 130, 246, 0.08)" : "transparent",
                          "&:hover": { bgcolor: isNext ? "rgba(59, 130, 246, 0.12)" : "#F8FAFC" },
                        }}
                      >
                        <TableCell sx={{ fontWeight: 800, color: "#64748B" }}>#{idx + 1}</TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 800, color: "#0F172A" }}>
                            {emp.employeeName}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ color: "#64748B", fontFamily: "monospace" }}>{emp.employeeId}</TableCell>
                        <TableCell>{emp.designation || "SIC Eligible"}</TableCell>
                        <TableCell align="center">
                          {isNext ? (
                            <Chip
                              size="small"
                              icon={<Zap size={12} color="#FFFFFF" />}
                              label="NEXT IN LINE"
                              sx={{
                                bgcolor: "#2563EB",
                                color: "#FFFFFF",
                                fontWeight: 800,
                                fontSize: 10,
                                letterSpacing: ".05em",
                              }}
                            />
                          ) : (
                            <Typography variant="caption" sx={{ color: "#94A3B8" }}>
                              -
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell align="center">
                          <IconButton
                            size="small"
                            disabled={idx === 0}
                            onClick={() => movePoolItem("sicPool", idx, -1)}
                          >
                            <ArrowUp size={16} />
                          </IconButton>
                          <IconButton
                            size="small"
                            disabled={idx === (config?.sicPool?.length || 0) - 1}
                            onClick={() => movePoolItem("sicPool", idx, 1)}
                          >
                            <ArrowDown size={16} />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}

        {/* ========================================================= */}
        {/* TAB 2: SHIFT ENGINEER POOL MANAGEMENT */}
        {/* ========================================================= */}
        {activeTab === 2 && (
          <Box sx={{ p: 2.5 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 800, color: "#0F172A" }}>
                  Sequential Shift Engineer Replacement Pool
                </Typography>
                <Typography variant="caption" sx={{ color: "#64748B" }}>
                  Shift Engineers sequence. Automatically rotated on D-5 for regular shift replacements.
                </Typography>
              </Box>
              <Button
                variant="contained"
                onClick={() => savePoolOrder("shiftEngineerPool")}
                disabled={savingPool}
                sx={{
                  bgcolor: "#16A34A",
                  "&:hover": { bgcolor: "#15803D" },
                  fontWeight: 800,
                  textTransform: "none",
                  borderRadius: 2,
                }}
              >
                {savingPool ? "Saving..." : "Save Shift Engg Sequence"}
              </Button>
            </Stack>

            <TableContainer sx={{ border: "1px solid #E2E8F0", borderRadius: 2 }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: "#F1F5F9" }}>
                    <TableCell width="80">Order</TableCell>
                    <TableCell>Employee Name</TableCell>
                    <TableCell>Employee ID</TableCell>
                    <TableCell>Designation / Role</TableCell>
                    <TableCell align="center">Next Pointer</TableCell>
                    <TableCell align="center">Reorder</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(config?.shiftEngineerPool || []).map((emp, idx) => {
                    const isNext = (config?.nextShiftEngineerIndex || 0) % (config?.shiftEngineerPool?.length || 1) === idx;
                    return (
                      <TableRow
                        key={emp.employeeId}
                        sx={{
                          bgcolor: isNext ? "rgba(22, 163, 74, 0.08)" : "transparent",
                          "&:hover": { bgcolor: isNext ? "rgba(22, 163, 74, 0.12)" : "#F8FAFC" },
                        }}
                      >
                        <TableCell sx={{ fontWeight: 800, color: "#64748B" }}>#{idx + 1}</TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 800, color: "#0F172A" }}>
                            {emp.employeeName}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ color: "#64748B", fontFamily: "monospace" }}>{emp.employeeId}</TableCell>
                        <TableCell>{emp.designation || "Shift Engineer"}</TableCell>
                        <TableCell align="center">
                          {isNext ? (
                            <Chip
                              size="small"
                              icon={<Zap size={12} color="#FFFFFF" />}
                              label="NEXT IN LINE"
                              sx={{
                                bgcolor: "#16A34A",
                                color: "#FFFFFF",
                                fontWeight: 800,
                                fontSize: 10,
                                letterSpacing: ".05em",
                              }}
                            />
                          ) : (
                            <Typography variant="caption" sx={{ color: "#94A3B8" }}>
                              -
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell align="center">
                          <IconButton
                            size="small"
                            disabled={idx === 0}
                            onClick={() => movePoolItem("shiftEngineerPool", idx, -1)}
                          >
                            <ArrowUp size={16} />
                          </IconButton>
                          <IconButton
                            size="small"
                            disabled={idx === (config?.shiftEngineerPool?.length || 0) - 1}
                            onClick={() => movePoolItem("shiftEngineerPool", idx, 1)}
                          >
                            <ArrowDown size={16} />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}

        {/* ========================================================= */}
        {/* TAB 3: LONG DURATION LEAVES POLICIES */}
        {/* ========================================================= */}
        {activeTab === 3 && (
          <Box sx={{ p: 2.5 }}>
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 800, color: "#0F172A" }}>
                Long-Duration Leaves (Block &ge; {config?.longDurationThreshold || 3} Days)
              </Typography>
              <Typography variant="caption" sx={{ color: "#64748B" }}>
                For longer leave periods, the system asks Admin whether to assign a <strong>Permanent Replacement</strong> (same employee handles all days) or <strong>Sequential Replacement</strong> (round-robin rotation).
              </Typography>
            </Box>

            {longLeaves.length === 0 ? (
              <Alert severity="success" sx={{ borderRadius: 2 }}>
                No unconfigured long-duration leaves currently active.
              </Alert>
            ) : (
              <Grid container spacing={2}>
                {longLeaves.map((group) => (
                  <Grid item xs={12} md={6} key={group.leaveGroupId}>
                    <Paper
                      elevation={0}
                      sx={{
                        p: 2.5,
                        borderRadius: 2.5,
                        border: "1px solid #FED7AA",
                        bgcolor: "#FFFDF7",
                      }}
                    >
                      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 1.5 }}>
                        <Box>
                          <Typography variant="subtitle2" sx={{ fontWeight: 800, color: "#0F172A" }}>
                            {group.employeeName} ({group.employeeId})
                          </Typography>
                          <Typography variant="caption" sx={{ color: "#64748B" }}>
                            {group.groupName} &bull; {group.leaveCount} Consecutive Days
                          </Typography>
                        </Box>
                        <Chip
                          size="small"
                          label={group.policy === "permanent" ? "Permanent Assigned" : group.policy === "sequential" ? "Sequential Round-Robin" : "Policy Pending"}
                          color={group.policy ? "success" : "warning"}
                          sx={{ fontWeight: 800, fontSize: 11 }}
                        />
                      </Stack>

                      <Divider sx={{ my: 1.5 }} />

                      <Box sx={{ mb: 2 }}>
                        <Typography variant="caption" sx={{ color: "#64748B", display: "block", mb: 0.5 }}>
                          Leave Dates:
                        </Typography>
                        <Stack direction="row" spacing={0.6} flexWrap="wrap">
                          {(group.dates || []).map((dt) => (
                            <Chip key={dt} size="small" label={dayjs(dt).format("DD MMM")} sx={{ height: 20, fontSize: 10, mb: 0.4 }} />
                          ))}
                        </Stack>
                      </Box>

                      {group.policy === "permanent" && group.permanentEmployeeName && (
                        <Alert severity="info" sx={{ mb: 2, py: 0.5, borderRadius: 2 }}>
                          Permanent Replacement: <strong>{group.permanentEmployeeName}</strong>
                        </Alert>
                      )}

                      <Button
                        variant="contained"
                        size="small"
                        onClick={() => openPolicyDialog(group)}
                        sx={{
                          bgcolor: "#EA580C",
                          "&:hover": { bgcolor: "#C2410C" },
                          fontWeight: 800,
                          textTransform: "none",
                          borderRadius: 2,
                        }}
                      >
                        {group.policy ? "Change Policy" : "Configure Replacement Policy"}
                      </Button>
                    </Paper>
                  </Grid>
                ))}
              </Grid>
            )}
          </Box>
        )}
      </Paper>

      {/* ========================================================= */}
      {/* REJECTION ACTION MODAL (PROTECTED FOR HOD/RO/INTERMEDIARY) */}
      {/* ========================================================= */}
      <Dialog
        open={rejectDialog.open}
        onClose={() => setRejectDialog((prev) => ({ ...prev, open: false }))}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3, p: 1 } }}
      >
        <DialogTitle sx={{ fontWeight: 800, color: "#0F172A", display: "flex", alignItems: "center", gap: 1 }}>
          <AlertTriangle size={22} color="#DC2626" />
          Reject Replacement Assignment
        </DialogTitle>
        <DialogContent dividers sx={{ py: 2 }}>
          {rejectDialog.error && (
            <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
              {rejectDialog.error}
            </Alert>
          )}

          {rejectDialog.leaveData ? (
            <Box>
              {/* Permission Check Notification */}
              {rejectDialog.canReject ? (
                <Alert severity="success" sx={{ mb: 2.5, borderRadius: 2 }}>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    Authorized as {rejectDialog.roleTitle || "Designated Approving Authority"}
                  </Typography>
                  <Typography variant="caption">
                    You have authority to reject this replacement assignment and return it for reallocation.
                  </Typography>
                </Alert>
              ) : (
                <Alert severity="warning" sx={{ mb: 2.5, borderRadius: 2 }}>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    Rejection Restricted
                  </Typography>
                  <Typography variant="caption">
                    Only HOD, Reporting Officer, Intermediary Reporting Officer, or System Administrator can reject replacement assignments.
                  </Typography>
                </Alert>
              )}

              {/* Assignment Details */}
              <Paper elevation={0} sx={{ p: 2, bgcolor: "#F8FAFC", borderRadius: 2, border: "1px solid #E2E8F0", mb: 2.5 }}>
                <Grid container spacing={1.5}>
                  <Grid item xs={6}>
                    <Typography variant="caption" sx={{ color: "#64748B" }}>Leave Applicant</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 800 }}>{rejectDialog.leaveData.employeeName}</Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="caption" sx={{ color: "#64748B" }}>Duty Date</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 800 }}>
                      {dayjs(rejectDialog.leaveData.date).format("DD MMMM YYYY")} ({rejectDialog.leaveData.assignedDuty || "Shift"})
                    </Typography>
                  </Grid>
                  <Grid item xs={12}>
                    <Typography variant="caption" sx={{ color: "#64748B" }}>Assigned Replacement Employee</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 800, color: "#2563EB" }}>
                      {rejectDialog.leaveData.replacement?.employeeName || "Not Assigned"} ({rejectDialog.leaveData.replacement?.employeeId || "-"})
                    </Typography>
                  </Grid>
                </Grid>
              </Paper>

              {/* Reason Field */}
              {rejectDialog.canReject && (
                <TextField
                  fullWidth
                  multiline
                  rows={3}
                  label="Rejection Reason / Comments *"
                  placeholder="Specify reason for rejecting this replacement assignment (e.g. employee skill mismatch, urgent assignment elsewhere)..."
                  value={rejectDialog.reason}
                  onChange={(e) => setRejectDialog((prev) => ({ ...prev, reason: e.target.value }))}
                  helperText="This reason will be logged in the audit trail and the employee's rejection counter will be incremented."
                />
              )}
            </Box>
          ) : (
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
              <CircularProgress size={30} />
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button
            onClick={() => setRejectDialog((prev) => ({ ...prev, open: false }))}
            sx={{ textTransform: "none", fontWeight: 700, color: "#64748B" }}
          >
            Cancel
          </Button>
          {rejectDialog.canReject && (
            <Button
              variant="contained"
              color="error"
              onClick={submitRejection}
              disabled={rejectDialog.submitting || !rejectDialog.reason.trim()}
              sx={{ fontWeight: 800, textTransform: "none", borderRadius: 2, px: 2.5 }}
            >
              {rejectDialog.submitting ? "Rejecting..." : "Confirm Rejection"}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* ========================================================= */}
      {/* REJECTION AUDIT HISTORY DIALOG */}
      {/* ========================================================= */}
      <Dialog
        open={auditDialog.open}
        onClose={() => setAuditDialog({ open: false, employee: null, records: [] })}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 800, color: "#0F172A" }}>
          Rejection Audit Trail &bull; {auditDialog.employee?.employeeName} ({auditDialog.employee?.employeeId})
        </DialogTitle>
        <DialogContent dividers sx={{ py: 2 }}>
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" sx={{ color: "#64748B" }}>
              Total Recorded Rejections: <strong>{auditDialog.records.length}</strong>
            </Typography>
          </Box>

          <TableContainer sx={{ border: "1px solid #E2E8F0", borderRadius: 2 }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: "#F1F5F9" }}>
                  <TableCell>Date</TableCell>
                  <TableCell>Duty</TableCell>
                  <TableCell>Rejected By</TableCell>
                  <TableCell>Role</TableCell>
                  <TableCell>Reason / Comment</TableCell>
                  <TableCell>Timestamp</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {auditDialog.records.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 3, color: "#64748B" }}>
                      No rejection records found for this employee.
                    </TableCell>
                  </TableRow>
                ) : (
                  auditDialog.records.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell sx={{ fontWeight: 700 }}>{dayjs(r.date).format("DD MMM YYYY")}</TableCell>
                      <TableCell>{r.dutyType || r.assignedDuty || "Shift"}</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>{r.rejectedByName || r.rejectedBy}</TableCell>
                      <TableCell>
                        <Chip size="small" label={r.rejectedByRole || "Approver"} sx={{ height: 20, fontSize: 10 }} />
                      </TableCell>
                      <TableCell sx={{ color: "#334155" }}>{r.comment || r.reason || "-"}</TableCell>
                      <TableCell sx={{ color: "#64748B", fontSize: 11 }}>
                        {r.timestamp ? dayjs(r.timestamp).format("DD MMM YYYY, HH:mm") : "-"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 1.5 }}>
          <Button
            onClick={() => setAuditDialog({ open: false, employee: null, records: [] })}
            sx={{ textTransform: "none", fontWeight: 700 }}
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* ========================================================= */}
      {/* LONG DURATION POLICY CONFIG MODAL */}
      {/* ========================================================= */}
      <Dialog
        open={policyDialog.open}
        onClose={() => setPolicyDialog((prev) => ({ ...prev, open: false }))}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 800 }}>
          Configure Long Duration Leave Policy
        </DialogTitle>
        <DialogContent dividers sx={{ py: 2 }}>
          {policyDialog.group && (
            <Box>
              <Typography variant="body2" sx={{ mb: 2, color: "#475569" }}>
                Choose replacement strategy for <strong>{policyDialog.group.employeeName}</strong> across {policyDialog.group.leaveCount} consecutive days ({dayjs(policyDialog.group.startDate).format("DD MMM")} &ndash; {dayjs(policyDialog.group.endDate).format("DD MMM YYYY")}).
              </Typography>

              <RadioGroup
                value={policyDialog.policy}
                onChange={(e) => setPolicyDialog((prev) => ({ ...prev, policy: e.target.value }))}
                sx={{ mb: 2.5 }}
              >
                <Paper
                  elevation={0}
                  sx={{
                    p: 1.5,
                    mb: 1.5,
                    borderRadius: 2,
                    border: `1.5px solid ${policyDialog.policy === "permanent" ? "#2563EB" : "#E2E8F0"}`,
                    bgcolor: policyDialog.policy === "permanent" ? "#EFF6FF" : "#FFFFFF",
                  }}
                >
                  <FormControlLabel
                    value="permanent"
                    control={<Radio size="small" />}
                    label={
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 800, color: "#0F172A" }}>
                          Permanent Single Replacement
                        </Typography>
                        <Typography variant="caption" sx={{ color: "#64748B" }}>
                          One specific employee will be assigned for all {policyDialog.group.leaveCount} days.
                        </Typography>
                      </Box>
                    }
                  />
                </Paper>

                <Paper
                  elevation={0}
                  sx={{
                    p: 1.5,
                    borderRadius: 2,
                    border: `1.5px solid ${policyDialog.policy === "sequential" ? "#2563EB" : "#E2E8F0"}`,
                    bgcolor: policyDialog.policy === "sequential" ? "#EFF6FF" : "#FFFFFF",
                  }}
                >
                  <FormControlLabel
                    value="sequential"
                    control={<Radio size="small" />}
                    label={
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 800, color: "#0F172A" }}>
                          Sequential Replacement (Round-Robin)
                        </Typography>
                        <Typography variant="caption" sx={{ color: "#64748B" }}>
                          Follow the sequential pool round-robin, assigning the next available candidate on each day.
                        </Typography>
                      </Box>
                    }
                  />
                </Paper>
              </RadioGroup>

              {policyDialog.policy === "permanent" && (
                <FormControl fullWidth size="small" sx={{ mt: 1 }}>
                  <InputLabel>Select Permanent Replacement Candidate</InputLabel>
                  <Select
                    label="Select Permanent Replacement Candidate"
                    value={policyDialog.permanentEmployeeId}
                    onChange={(e) => setPolicyDialog((prev) => ({ ...prev, permanentEmployeeId: e.target.value }))}
                  >
                    {(config?.sicPool || []).map((emp) => (
                      <MenuItem key={emp.employeeId} value={emp.employeeId}>
                        {emp.employeeName} ({emp.employeeId}) &bull; SIC Pool
                      </MenuItem>
                    ))}
                    {(config?.shiftEngineerPool || []).map((emp) => (
                      <MenuItem key={emp.employeeId} value={emp.employeeId}>
                        {emp.employeeName} ({emp.employeeId}) &bull; Shift Engg Pool
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button
            onClick={() => setPolicyDialog((prev) => ({ ...prev, open: false }))}
            sx={{ textTransform: "none", fontWeight: 700 }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={submitPolicy}
            disabled={
              policyDialog.submitting ||
              (policyDialog.policy === "permanent" && !policyDialog.permanentEmployeeId)
            }
            sx={{
              bgcolor: "#2563EB",
              fontWeight: 800,
              textTransform: "none",
              borderRadius: 2,
            }}
          >
            {policyDialog.submitting ? "Saving..." : "Apply Policy"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ========================================================= */}
      {/* AUTO ALLOCATE SUMMARY MODAL */}
      {/* ========================================================= */}
      <Dialog
        open={allocateModalOpen}
        onClose={() => setAllocateModalOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 800, display: "flex", alignItems: "center", gap: 1 }}>
          <CheckCircle2 size={22} color="#16A34A" />
          D-5 Auto-Allocation Summary
        </DialogTitle>
        <DialogContent dividers sx={{ py: 2.5 }}>
          {allocationResult && (
            <Box>
              <Alert
                severity={allocationResult.testMode ? "warning" : "success"}
                sx={{ mb: 2.5, borderRadius: 2 }}
              >
                {allocationResult.testMode ? (
                  <strong>Executed in TEST BASIS Mode (No live duties committed)</strong>
                ) : (
                  <strong>Executed in LIVE FUTURE DUTY Mode (Committed to schedule)</strong>
                )}
              </Alert>

              <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid item xs={6}>
                  <Paper elevation={0} sx={{ p: 1.5, bgcolor: "#F8FAFC", borderRadius: 2, border: "1px solid #E2E8F0" }}>
                    <Typography variant="caption" sx={{ color: "#64748B" }}>Leaves Scanned</Typography>
                    <Typography variant="h6" sx={{ fontWeight: 800 }}>{allocationResult.scannedLeaves || 0}</Typography>
                  </Paper>
                </Grid>
                <Grid item xs={6}>
                  <Paper elevation={0} sx={{ p: 1.5, bgcolor: "#F8FAFC", borderRadius: 2, border: "1px solid #E2E8F0" }}>
                    <Typography variant="caption" sx={{ color: "#64748B" }}>Replacements Allocated</Typography>
                    <Typography variant="h6" sx={{ fontWeight: 800, color: "#16A34A" }}>
                      {allocationResult.allocatedCount || 0}
                    </Typography>
                  </Paper>
                </Grid>
              </Grid>

              {allocationResult.details && allocationResult.details.length > 0 ? (
                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>
                    Allocations Log:
                  </Typography>
                  <Stack spacing={1}>
                    {allocationResult.details.map((item, idx) => (
                      <Paper
                        key={idx}
                        elevation={0}
                        sx={{
                          p: 1.2,
                          bgcolor: "#F8FAFC",
                          border: "1px solid #E2E8F0",
                          borderRadius: 1.5,
                          fontSize: 12,
                        }}
                      >
                        <strong>{dayjs(item.date).format("DD MMM YYYY")}</strong> &bull; Replaced {item.leavePerson} with{" "}
                        <strong style={{ color: "#2563EB" }}>{item.replacementPerson}</strong> ({item.pool})
                      </Paper>
                    ))}
                  </Stack>
                </Box>
              ) : (
                <Typography variant="body2" sx={{ color: "#64748B", textAlign: "center", py: 2 }}>
                  No D-5 eligible leaves required replacement allocation today.
                </Typography>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button
            variant="contained"
            onClick={() => setAllocateModalOpen(false)}
            sx={{ fontWeight: 800, textTransform: "none", borderRadius: 2 }}
          >
            Dismiss
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
