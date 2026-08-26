import React, { useEffect, useState } from "react";
import api from "./api";
import { useRef } from "react";
import dayjs from "dayjs";

import {
  Alert,
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
  Accordion,
  AccordionSummary,
  AccordionDetails,
  IconButton,
  Checkbox,
  FormControlLabel,
  Grid,
  FormControl,
  InputLabel,
  Select,
  Collapse
} from "@mui/material";

import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import DutyReassignmentPanel from "../components/crew/DutyReassignmentPanel";

export default function ReplacementManagement() {

  const [pendingLeaves, setPendingLeaves] = useState([]);
  const [assignedReplacements, setAssignedReplacements] = useState([]);
  const [decisionAudit, setDecisionAudit] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [selectedLeave, setSelectedLeave] = useState(null);

  const [dialogOpen, setDialogOpen] = useState(false);

  const [history, setHistory] = useState([]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [employeeId, setEmployeeId] = useState("");

  const [selectedMode, setSelectedMode] = useState("normal");
  const [selectedCandidate, setSelectedCandidate] = useState(null);

  const [sicDialogOpen, setSicDialogOpen] = useState(false);
  const [selectedSIC, setSelectedSIC] = useState("");
  const [sicCandidates, setSicCandidates] = useState([]);

  const [pendingSIC, setPendingSIC] = useState([]);
  const [sicExchangeContext, setSicExchangeContext] = useState(null);
  const [halfDuty, setHalfDuty] = useState(false);
  const [candidateFilter, setCandidateFilter] = useState("auto");
  const [switchDate, setSwitchDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [switchOptions, setSwitchOptions] = useState([]);
  const [switchEmployeeId, setSwitchEmployeeId] = useState("");
  const [switchDuty, setSwitchDuty] = useState("");
  const [switchGroup, setSwitchGroup] = useState("");
  const [switchReason, setSwitchReason] = useState("");
  const [switchLeaveId, setSwitchLeaveId] = useState("");
  const [switchHistory, setSwitchHistory] = useState([]);
  const [switchNotice, setSwitchNotice] = useState(null);
  const [switchSaving, setSwitchSaving] = useState(false);
  const [canSwitchDuty, setCanSwitchDuty] = useState(true);
  const sicShortcutHandled = useRef(false);
  const [activeWorkflow, setActiveWorkflow] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    if (["duty", "leave", "board", "sic"].includes(params.get("section"))) return params.get("section");
    if (params.get("action") === "assign-sic") return "sic";
    if (params.get("action") === "leave") return "leave";
    return null;
  });

  useEffect(() => {
    if (!activeWorkflow) return;
    window.setTimeout(() => document.getElementById(`replacement-workflow-${activeWorkflow}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 220);
  }, [activeWorkflow]);

  const openWorkflow = (workflow) => {
    setActiveWorkflow(workflow);
    window.setTimeout(() => {
      document.getElementById(`replacement-workflow-${workflow}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 180);
  };

  useEffect(() => {
    fetchPendingLeaves();
    fetchAssignedReplacements();
    fetchDecisionAudit();
    fetchPendingSIC();
  }, []);

  // ===============================
  // FETCH DATA
  // ===============================

  const fetchPendingLeaves = async () => {
    try {
      const res = await api.get("/replacement/pending");
      const rows = res.data || [];
      setPendingLeaves(rows);
      const params = new URLSearchParams(window.location.search);
      if (params.get("action") === "leave" && !selectedLeave) {
        const target = rows.find((leave) => leave.date === params.get("date") && String(leave.employeeId || "") === String(params.get("employeeId") || ""));
        if (target) {
          setActiveWorkflow("leave");
          openCandidateDialog(target);
        }
      }
    } catch (err) {
      console.error(err);
      alert("Failed to load replacement data");
    }
  };

  const fetchHistory = async () => {
    try {
      const params = {};
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      if (employeeId) params.employeeId = employeeId;

      const res = await api.get("/replacement/history", { params });
      setHistory(res.data || []);
    } catch (err) {
      console.error(err);
      alert("Failed to load replacement history");
    }
  };

  // ===============================
  // OPEN REPLACEMENT
  // ===============================

  const loadCandidates = async (leave, filterValue = candidateFilter) => {
    const res = await api.get(`/replacement/candidates/${leave.id}`, {
      params: { roleFilter: filterValue }
    });
    setCandidates(res.data || []);
  };

  const fetchDutySwitchOptions = async () => {
    try {
      const [optionResult, historyResult] = await Promise.all([
        api.get("/replacement/duty-switch/options", { params: { date: switchDate } }),
        api.get("/replacement/duty-switch/history", { params: { startDate: dayjs(switchDate).subtract(30, "day").format("YYYY-MM-DD"), endDate: switchDate } }),
      ]);
      setSwitchOptions(optionResult.data || []);
      setSwitchHistory(historyResult.data || []);
      setCanSwitchDuty(true);
      setSwitchNotice(null);
    } catch (err) {
      setSwitchOptions([]);
      setSwitchHistory([]);
      setCanSwitchDuty(false);
      if (err.response?.status !== 403) {
        setSwitchNotice({ severity: "error", text: err.response?.data?.detail || "Duty-switch data could not be loaded." });
      }
    }
  };

  const selectedSwitchEmployee = switchOptions.find((item) => item.employeeId === switchEmployeeId);
  const selectedSwitchLeave = pendingLeaves.find((item) => item.id === switchLeaveId);
  const dutyChoices = [...new Set([
    ...switchOptions.map((item) => item.assignedDuty),
    "M1", "M2", "E1", "E2", "N1", "N2", "O1", "O2",
  ].filter(Boolean))];
  const groupChoices = [...new Set(switchOptions.map((item) => item.groupName).filter(Boolean))];
  const leavesForSwitchDate = pendingLeaves.filter((item) => item.date === switchDate);

  const saveDutySwitch = async () => {
    if (!switchEmployeeId || !switchReason.trim()) {
      setSwitchNotice({ severity: "warning", text: "Select an employee and enter the reason." });
      return;
    }
    if (!switchLeaveId && !switchDuty) {
      setSwitchNotice({ severity: "warning", text: "Select the new duty or link an approved leave." });
      return;
    }
    setSwitchSaving(true);
    try {
      if (switchLeaveId) {
        await api.put(`/replacement/assign/${switchLeaveId}`, {
          replacementEmployeeId: switchEmployeeId,
          mode: "normal",
          halfDuty: false,
          reason: switchReason.trim(),
        });
      } else {
        await api.put("/replacement/duty-switch", {
          date: switchDate,
          employeeId: switchEmployeeId,
          assignedDuty: switchDuty,
          groupName: switchGroup || selectedSwitchEmployee?.groupName,
          reason: switchReason.trim(),
        });
      }
      setSwitchNotice({ severity: "success", text: switchLeaveId ? "Leave replacement and duty switch assigned." : "Duty changed and recorded." });
      setSwitchEmployeeId("");
      setSwitchDuty("");
      setSwitchGroup("");
      setSwitchReason("");
      setSwitchLeaveId("");
      await Promise.all([fetchDutySwitchOptions(), fetchPendingLeaves(), fetchAssignedReplacements(), fetchDecisionAudit()]);
    } catch (err) {
      setSwitchNotice({ severity: "error", text: err.response?.data?.detail || "Duty change could not be saved." });
    } finally {
      setSwitchSaving(false);
    }
  };

  const fetchAssignedReplacements = async () => {
    try {
      const res = await api.get("/replacement/assigned");
      setAssignedReplacements(res.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  const deleteReplacementAssignment = async (assignment) => {
    const reason = window.prompt(
      `Reason for deleting the replacement assignment of ${assignment.replacement?.name || assignment.replacement?.employeeId || "this employee"}:`,
      "Operational requirement changed",
    );
    if (reason === null) return;
    if (!reason.trim()) {
      alert("Enter a reason before deleting the assignment.");
      return;
    }
    if (!window.confirm("Delete this replacement assignment and restore the employee's original duty?")) return;
    try {
      await api.delete(`/replacement/assign/${assignment.id}`, { data: { reason: reason.trim() } });
      await Promise.all([fetchPendingLeaves(), fetchAssignedReplacements(), fetchDecisionAudit(), fetchDutySwitchOptions()]);
    } catch (err) {
      alert(err.response?.data?.detail || "Replacement assignment could not be deleted.");
    }
  };

  const fetchDecisionAudit = async () => {
    try {
      const params = {};
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      if (employeeId) params.employeeId = employeeId;
      const res = await api.get("/replacement/assignment-audit", { params });
      setDecisionAudit(res.data || []);
    } catch (err) {
      console.error("Failed to load replacement decision audit", err);
    }
  };

  const openCandidateDialog = async (leave) => {
    try {
      const defaultFilter = leave.isSIC ? "sic" : "shift_engineer";
      setCandidateFilter(defaultFilter);
      setSelectedLeave(leave);
      await loadCandidates(leave, defaultFilter);
      setSelectedCandidate(null);
      setSelectedSIC("");

      setDialogOpen(true);

    } catch (err) {
      console.error(err);
      alert("Failed to load candidates");
    }
  };

  const handleCandidateFilterChange = async (value) => {
    setCandidateFilter(value);
    if (!selectedLeave) return;
    try {
      await loadCandidates(selectedLeave, value);
    } catch (err) {
      console.error(err);
      alert("Failed to refresh candidates");
    }
  };

  // ===============================
  // ASSIGN REPLACEMENT
  // ===============================

  const assignReplacement = async (employeeId) => {
    try {

      await api.put(`/replacement/assign/${selectedLeave.id}`, {
        replacementEmployeeId: employeeId,
        mode: selectedMode,
        halfDuty: halfDuty
      });

      const selected = candidates.find(c => c.employeeId === employeeId);
      setSelectedCandidate(selected);

      alert("Replacement Assigned Successfully");

      setDialogOpen(false);

      fetchPendingLeaves();
      fetchPendingSIC();
      fetchAssignedReplacements();
      fetchDecisionAudit();

      if (selectedLeave?.isSIC) {
        await openSICDialog(selectedLeave, "Replacement workflow");
      }

    } catch (err) {
      console.error(err);
      alert("Assignment failed");
    }
  };

  // ===============================
  // MANUAL SIC BUTTON
  // ===============================

  const openSICDialog = async (leave, source = "Direct acting-SIC assignment") => {
    try {

      setSelectedLeave({ ...leave, sicAssignmentSource: source });

      const res = await api.get(`/replacement/sic-candidates/${leave.id}`);
      setSicCandidates(res.data || []);

      setSelectedSIC("");
      setSicDialogOpen(true);

    } catch (err) {
      console.error(err);
      alert("Failed to load SIC candidates");
    }
  };

  // ===============================
  // ASSIGN SIC
  // ===============================

  const assignSIC = async () => {
    try {

      await api.put(`/replacement/assign-sic/${selectedLeave.id}`, {
        sicEmployeeId: selectedSIC,
        source: selectedLeave.sicAssignmentSource || "Direct acting-SIC assignment",
      });

      alert("SIC Assigned");

      setSicDialogOpen(false);
      fetchPendingLeaves();
      fetchPendingSIC();
      fetchDecisionAudit();

    } catch (err) {
      console.error(err);
      alert("SIC assignment failed");
    }
  };

  const fetchPendingSIC = async () => {
    try {
      const res = await api.get("/replacement/pending-sic");
      setPendingSIC(res.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (sicShortcutHandled.current || !pendingSIC.length) return;

    const params = new URLSearchParams(window.location.search);
    if (params.get("action") !== "assign-sic") return;

    const leaveId = params.get("leaveId");
    const leaveDate = params.get("date");
    const target = pendingSIC.find((leave) => (
      (leaveId && String(leave.id) === String(leaveId))
      || (!leaveId && leaveDate && leave.date === leaveDate)
    ));

    if (!target) return;
    sicShortcutHandled.current = true;
    openSICDialog(target, "Completed-leave SIC coverage action");
  }, [pendingSIC]);

  const openSICExchange = (leave) => {
    setSicExchangeContext({ leave, token: Date.now() });
    setActiveWorkflow("duty");
    window.setTimeout(() => {
      document.getElementById("replacement-workflow-duty")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 220);
  };

  // ===============================
  // FILTERS
  // ===============================

  const orderedCandidates = [...candidates].sort((left, right) => {
    const leftOrder = Number(left.serialNo ?? Number.MAX_SAFE_INTEGER);
    const rightOrder = Number(right.serialNo ?? Number.MAX_SAFE_INTEGER);
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    return String(left.name || "").localeCompare(String(right.name || ""));
  });

  const assignedByLeaveId = new Map(assignedReplacements.map((item) => [String(item.id), item]));
  const auditedLeaveIds = new Set(decisionAudit.map((item) => String(item.leaveId || "")).filter(Boolean));
  const filteredAssignedReplacements = assignedReplacements.filter((item) => (
    (!startDate || String(item.date || "") >= startDate)
    && (!endDate || String(item.date || "") <= endDate)
    && (!employeeId || String(item.replacement?.employeeId || "").includes(employeeId.trim()))
  ));
  const mergedReplacementRows = [
    ...decisionAudit.map((audit) => ({
      ...audit,
      rowKey: `audit-${audit.id}`,
      currentAssignment: assignedByLeaveId.get(String(audit.leaveId || "")) || null,
    })),
    ...filteredAssignedReplacements
      .filter((item) => !auditedLeaveIds.has(String(item.id)))
      .map((item) => ({
        rowKey: `assigned-${item.id}`,
        leaveId: item.id,
        date: item.date,
        groupName: item.groupName,
        assignedDuty: item.assignedDuty,
        assignmentMode: item.replacement?.mode,
        employeeId: item.replacement?.employeeId,
        employeeName: item.replacement?.name,
        replacedEmployeeId: item.employeeId,
        replacedEmployeeName: item.name,
        leaveType: item.leaveType,
        status: item.notificationStatus,
        reason: item.notificationReason,
        autoAccepted: item.notificationAutoAccepted,
        mailDelivery: item.mailDelivery,
        decisionHistory: item.decisionHistory || [],
        controllerNames: [],
        currentAssignment: item,
      })),
  ];


  const sourceLabel = (source) => ({
    replacement: "Replacement tagged",
    shift: "Same shift",
    otherShift: "Other shift",
    organization: "Organization",
  }[source] || "Eligible");

  // ===============================
  // UI
  // ===============================

  return (
    <Box sx={{ p: 3 }}>

      {/* HEADER */}
      <Box
        sx={{
          p: 3,
          mb: 3,
          borderRadius: 3,
          background: "linear-gradient(105deg,#08103A 0%,#0057B7 65%,#0F6FDB 100%)",
          color: "white"
        }}
      >
        <Typography variant="h5" fontWeight="bold" sx={{ color: "#FFFFFF" }}>
          Replacement Management
        </Typography>
        <Typography variant="body2" sx={{ color: "rgba(255,255,255,.88)" }}>
          Manage leave replacements and SIC assignments
        </Typography>
      </Box>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { key: "duty", title: "Duty Switching & Reassignment", subtitle: "Exchange, move or reassign duty", count: null, color: "#0057B7", tint: "#EAF2FF" },
          { key: "leave", title: "Leaves Requiring Replacement", subtitle: "Open pending manpower replacement", count: pendingLeaves.length, color: "#17876D", tint: "#EAF8F3" },
          { key: "board", title: "Replacement Duty Board", subtitle: "Assigned duties, decisions and audit", count: assignedReplacements.length, color: "#4338CA", tint: "#EEF2FF" },
          { key: "sic", title: "SIC Assignment", subtitle: "Allocate acting SIC for approved leave", count: pendingSIC.length, color: "#D97706", tint: "#FFF7E8" },
        ].map((tile) => (
          <Grid item xs={12} md={3} key={tile.key}>
            <Paper
              component="button"
              type="button"
              onClick={() => openWorkflow(tile.key)}
              elevation={0}
              sx={{
                width: "100%", minHeight: 118, p: 2.2, borderRadius: 3, textAlign: "left", cursor: "pointer",
                border: `1px solid ${activeWorkflow === tile.key ? tile.color : "#D7E3F4"}`,
                background: activeWorkflow === tile.key ? tile.tint : "#FFFFFF",
                boxShadow: activeWorkflow === tile.key ? `0 12px 28px ${tile.color}22` : "0 5px 18px rgba(15,23,42,.06)",
                transition: "transform .22s ease, box-shadow .22s ease, border-color .22s ease, background .22s ease",
                "&:hover": { transform: "translateY(-3px)", borderColor: tile.color, boxShadow: `0 14px 30px ${tile.color}26` },
              }}
            >
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 2 }}>
                <Box>
                  <Typography sx={{ color: "#0F172A", fontSize: 16, fontWeight: 950 }}>{tile.title}</Typography>
                  <Typography sx={{ mt: .65, color: "#64748B", fontSize: 11.5, fontWeight: 650 }}>{tile.subtitle}</Typography>
                </Box>
                {tile.count !== null && <Box sx={{ minWidth: 42, height: 42, px: 1, borderRadius: 2.2, display: "grid", placeItems: "center", color: "#FFFFFF", background: tile.color, fontSize: 18, fontWeight: 950 }}>{tile.count}</Box>}
              </Box>
              <Typography sx={{ mt: 1.4, color: tile.color, fontSize: 11.5, fontWeight: 900 }}>{activeWorkflow === tile.key ? "Workspace open" : "Click to open"}</Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>

      <Collapse in={activeWorkflow === "duty"} timeout={420} unmountOnExit>
      <Box id="replacement-workflow-duty" sx={{ scrollMarginTop: 110 }}>
        <DutyReassignmentPanel
          key={sicExchangeContext?.token || "default-duty-reassignment"}
          initialDate={sicExchangeContext?.leave?.date}
          initialMode="exchange"
          initialLeave={sicExchangeContext?.leave || null}
          onChanged={async () => {
            fetchPendingLeaves();
            fetchAssignedReplacements();
            fetchDecisionAudit();
            fetchPendingSIC();
            if (sicExchangeContext?.leave) {
              const leave = sicExchangeContext.leave;
              setSicExchangeContext(null);
              await openSICDialog(leave, "Duty exchange workflow");
            }
          }}
        />
      </Box>
      </Collapse>

      {false && canSwitchDuty && (
        <Accordion
          defaultExpanded
          sx={{ borderRadius: 3, boxShadow: "0 4px 20px rgba(0,0,0,0.08)", overflow: "hidden", mb: 3 }}
        >
          <AccordionSummary
            expandIcon={<ExpandMoreIcon />}
            sx={{ background: "linear-gradient(90deg,#08103A,#0057B7)", color: "white", px: 3 }}
          >
            <Box>
              <Typography variant="h6" fontWeight={700}>Duty Switching & Reassignment</Typography>
              <Typography variant="caption">For Leave Approving Authority and administrators. Every change is recorded.</Typography>
            </Box>
          </AccordionSummary>
          <AccordionDetails sx={{ p: 2.5 }}>
            {switchNotice && <Alert severity={switchNotice.severity} onClose={() => setSwitchNotice(null)} sx={{ mb: 2 }}>{switchNotice.text}</Alert>}
            <Grid container spacing={2}>
              <Grid item xs={12} md={3}>
                <TextField
                  fullWidth
                  size="small"
                  type="date"
                  label="Duty date"
                  InputLabelProps={{ shrink: true }}
                  value={switchDate}
                  onChange={(event) => {
                    setSwitchDate(event.target.value);
                    setSwitchEmployeeId("");
                    setSwitchLeaveId("");
                    setSwitchDuty("");
                  }}
                />
              </Grid>
              <Grid item xs={12} md={5}>
                <FormControl fullWidth size="small">
                  <InputLabel>Employee to reassign</InputLabel>
                  <Select
                    label="Employee to reassign"
                    value={switchEmployeeId}
                    onChange={(event) => {
                      const employee = switchOptions.find((item) => item.employeeId === event.target.value);
                      setSwitchEmployeeId(event.target.value);
                      setSwitchGroup(employee?.groupName || "");
                    }}
                  >
                    {switchOptions.map((item) => (
                      <MenuItem key={item.employeeId} value={item.employeeId} disabled={item.onLeave}>
                        {item.name || item.employeeId} ({item.employeeId}) · {item.assignedDuty || "No duty"} · {item.groupName || "No group"}{item.onLeave ? " · On leave" : ""}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={4}>
                <FormControl fullWidth size="small">
                  <InputLabel>Link approved leave (optional)</InputLabel>
                  <Select
                    label="Link approved leave (optional)"
                    value={switchLeaveId}
                    onChange={(event) => {
                      const leave = pendingLeaves.find((item) => item.id === event.target.value);
                      setSwitchLeaveId(event.target.value);
                      if (leave) {
                        setSwitchDuty(leave.assignedDuty || "");
                        setSwitchGroup(leave.groupName || "");
                      }
                    }}
                  >
                    <MenuItem value="">Manual duty change only</MenuItem>
                    {leavesForSwitchDate.map((leave) => (
                      <MenuItem key={leave.id} value={leave.id}>
                        Replace {leave.name} · {leave.assignedDuty || "Duty"} · {leave.groupName}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={3}>
                <FormControl fullWidth size="small" disabled={Boolean(switchLeaveId)}>
                  <InputLabel>New duty</InputLabel>
                  <Select label="New duty" value={switchDuty} onChange={(event) => setSwitchDuty(event.target.value)}>
                    {dutyChoices.map((duty) => <MenuItem key={duty} value={duty}>{duty}</MenuItem>)}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={3}>
                <FormControl fullWidth size="small" disabled={Boolean(switchLeaveId)}>
                  <InputLabel>New group</InputLabel>
                  <Select label="New group" value={switchGroup} onChange={(event) => setSwitchGroup(event.target.value)}>
                    {groupChoices.map((group) => <MenuItem key={group} value={group}>{group}</MenuItem>)}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField fullWidth size="small" label="Reason for duty change" value={switchReason} onChange={(event) => setSwitchReason(event.target.value)} />
              </Grid>
              <Grid item xs={12} md={2}>
                <Button fullWidth variant="contained" disabled={switchSaving || !switchEmployeeId} onClick={saveDutySwitch} sx={{ height: 40, background: "#0057B7", fontWeight: 800 }}>
                  {switchSaving ? "Saving..." : switchLeaveId ? "Assign replacement" : "Change duty"}
                </Button>
              </Grid>
            </Grid>

            {selectedSwitchEmployee && (
              <Alert severity="info" sx={{ mt: 2 }}>
                Current assignment: <strong>{selectedSwitchEmployee.assignedDuty || "-"}</strong> in <strong>{selectedSwitchEmployee.groupName || "-"}</strong>.
                {selectedSwitchLeave && <> The selected leave duty <strong>{selectedSwitchLeave.assignedDuty || "-"}</strong> will be assigned and the employee’s previous duty will be retained in the audit.</>}
              </Alert>
            )}

            <Typography sx={{ mt: 2.5, mb: 1, fontWeight: 900, color: "#0F172A" }}>Recent duty changes</Typography>
            <TableContainer sx={{ maxHeight: 280, border: "1px solid #E2E8F0", borderRadius: 2 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>Date</TableCell>
                    <TableCell>Employee</TableCell>
                    <TableCell>Previous</TableCell>
                    <TableCell>Changed to</TableCell>
                    <TableCell>Reason</TableCell>
                    <TableCell>Changed by</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {switchHistory.map((item) => (
                    <TableRow key={item._id} hover>
                      <TableCell sx={{ whiteSpace: "nowrap" }}>{dayjs(item.date).format("DD MMM YYYY")}</TableCell>
                      <TableCell><Typography variant="body2" fontWeight={800}>{item.employeeName || item.employeeId}</Typography><Typography variant="caption">{item.employeeId}</Typography></TableCell>
                      <TableCell>{item.previous?.assignedDuty || "-"} · {item.previous?.groupName || "-"}</TableCell>
                      <TableCell>{item.updated?.assignedDuty || "-"} · {item.updated?.groupName || "-"}</TableCell>
                      <TableCell>{item.reason || "-"}</TableCell>
                      <TableCell><Typography variant="body2">{item.changedByName || item.changedBy}</Typography><Typography variant="caption">{item.changedOn ? dayjs(item.changedOn).format("DD MMM HH:mm") : ""}</Typography></TableCell>
                    </TableRow>
                  ))}
                  {!switchHistory.length && <TableRow><TableCell colSpan={6} align="center">No duty changes recorded in this period.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </TableContainer>
          </AccordionDetails>
        </Accordion>
      )}

      {/* ========================= */}
      {/* PENDING LEAVES */}
      {/* ========================= */}

      <Collapse in={activeWorkflow === "leave"} timeout={420} unmountOnExit>
      <Box id="replacement-workflow-leave" sx={{ scrollMarginTop: 110 }}>
      <Accordion
        defaultExpanded
        sx={{
          borderRadius: 3,
          boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
          overflow: "hidden",
          mb: 3
        }}
      >
        <AccordionSummary
          expandIcon={<ExpandMoreIcon />}
          sx={{
            background: "linear-gradient(90deg,#2e7d32,#66bb6a)",
            color: "white",
            px: 3
          }}
        >
          <Typography variant="h6" fontWeight={600}>
            Leaves Requiring Replacement
          </Typography>
        </AccordionSummary>

        <AccordionDetails>
          <Paper elevation={0} sx={{ p: 2 }}>

            <TableContainer sx={{ maxHeight: 380, minHeight: pendingLeaves.length ? 150 : 72, border: "1px solid #D7E3F4", borderRadius: 2 }}>
              <Table size="small" stickyHeader>

                <TableHead>
                  <TableRow sx={{ background: "#1b5e20" }}>
                    <TableCell sx={{ color: "white" }}>Employee</TableCell>
                    <TableCell sx={{ color: "white" }}>Group</TableCell>
                    <TableCell sx={{ color: "white" }}>Date</TableCell>
                    <TableCell sx={{ color: "white" }}>Leave Type</TableCell>
                    <TableCell sx={{ color: "white" }}>Replacement</TableCell>
                    <TableCell sx={{ color: "white" }}>Action</TableCell>
                  </TableRow>
                </TableHead>

                <TableBody>

                  {pendingLeaves.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} align="center">
                        No replacement required
                      </TableCell>
                    </TableRow>
                  )}

                  {pendingLeaves.map((l) => (
                    <TableRow key={l.id} hover>

                      <TableCell>{l.name}</TableCell>
                      <TableCell>{l.groupName}</TableCell>
                      <TableCell>{dayjs(l.date).format("DD MMM YYYY")}</TableCell>
                      <TableCell>{l.leaveType}</TableCell>

                      <TableCell>
                        <Chip label="Required" size="small" color="error" />
                      </TableCell>

                      <TableCell>

                        <Button
                          size="small"
                          variant="contained"
                          sx={{ background: "#6a1b9a" }}
                          onClick={() => openCandidateDialog(l)}
                        >
                          Assign
                        </Button>

                        {l.isSIC && (
                          <Button
                            size="small"
                            variant="outlined"
                            color="warning"
                            sx={{ ml: 1 }}
                            onClick={() => openSICDialog(l)}
                          >
                            Acting SIC
                          </Button>
                        )}

                      </TableCell>

                    </TableRow>
                  ))}

                </TableBody>
              </Table>
            </TableContainer>

          </Paper>
        </AccordionDetails>
      </Accordion>

      </Box>
      </Collapse>

      <Collapse in={activeWorkflow === "board"} timeout={420} unmountOnExit>
      <Box id="replacement-workflow-board" sx={{ scrollMarginTop: 110 }}>
      <Accordion
        defaultExpanded
        sx={{ borderRadius: 3, boxShadow: "0 4px 20px rgba(0,0,0,0.08)", overflow: "hidden", mb: 3 }}
      >
        <AccordionSummary
          expandIcon={<ExpandMoreIcon />}
          sx={{ background: "linear-gradient(90deg,#08103A,#0057B7)", color: "white", px: 3 }}
        >
          <Typography variant="h6" fontWeight={600}>Replacement Duties &amp; Decision Board</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Box sx={{ display: "flex", gap: 1, mb: 2, flexWrap: "wrap" }}>
            <TextField type="date" size="small" label="From" InputLabelProps={{ shrink: true }} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            <TextField type="date" size="small" label="To" InputLabelProps={{ shrink: true }} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            <TextField size="small" label="Replacement employee ID" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} />
            <Button variant="contained" onClick={fetchDecisionAudit}>Refresh Board</Button>
          </Box>
          <TableContainer sx={{ maxHeight: 520, minHeight: mergedReplacementRows.length ? 180 : 72, border: "1px solid #D7E3F4", borderRadius: 2 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow sx={{ background: "#EAF2FF" }}>
                  <TableCell><strong>Date / Duty</strong></TableCell>
                  <TableCell><strong>Replacement Employee</strong></TableCell>
                  <TableCell><strong>Replaced Employee</strong></TableCell>
                  <TableCell><strong>Reporting Officer(s)</strong></TableCell>
                  <TableCell><strong>Decision</strong></TableCell>
                  <TableCell><strong>Decision Audit</strong></TableCell>
                  <TableCell align="right"><strong>Action</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {mergedReplacementRows.map((item) => {
                  const shownStatus = item.status === "Denied" ? "Declined" : item.status;
                  const statusColor = item.status === "Denied" ? "error" : item.status === "Accepted" ? "success" : item.status === "Pending" ? "warning" : "default";
                  const current = item.currentAssignment;
                  const isCurrentReplacement = current && String(current.replacement?.employeeId || "") === String(item.employeeId || "");
                  return (
                    <TableRow key={item.rowKey} hover>
                      <TableCell>
                        <Typography variant="body2" fontWeight={800}>{item.date ? dayjs(item.date).format("DD MMM YYYY") : "-"}</Typography>
                        <Typography variant="caption">{item.assignedDuty || "-"} · {item.assignmentMode || "normal"}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight={700}>{item.employeeName || "-"}</Typography>
                        <Typography variant="caption" color="text.secondary">{item.employeeId || "-"}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{item.replacedEmployeeName || "-"}</Typography>
                        <Typography variant="caption" color="text.secondary">{item.groupName || "-"} · {item.leaveType || "-"}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption">{(item.controllerNames || []).join(", ") || "Not mapped"}</Typography>
                      </TableCell>
                      <TableCell>
                        <Chip size="small" label={shownStatus || "Pending"} color={statusColor} />
                        {item.autoAccepted && <Typography display="block" variant="caption" color="success.main" fontWeight={800}>Auto-accepted at cutoff</Typography>}
                        {item.reason && <Typography display="block" variant="caption" color="error.main">{item.reason}</Typography>}
                        {item.mailDelivery?.status && (
                          <Typography display="block" variant="caption" color={item.mailDelivery.status === "sent" ? "success.main" : "text.secondary"} fontWeight={700}>
                            Mail: {item.mailDelivery.status} ({item.mailDelivery.recipientCount || 0} recipients)
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell sx={{ minWidth: 260 }}>
                        {(item.decisionHistory || []).length ? (item.decisionHistory || []).map((entry, index) => (
                          <Typography key={`${item.rowKey}-${index}`} variant="caption" display="block" sx={{ mb: .35 }}>
                            <strong>{entry.action === "Denied" ? "Declined" : entry.action}</strong> by {entry.actedByName || entry.actedBy || "-"} ({entry.actorRole || "-"})
                            {entry.actedAt ? ` · ${dayjs(entry.actedAt).format("DD MMM YYYY HH:mm")}` : ""}
                            {entry.reason ? ` · ${entry.reason}` : ""}
                          </Typography>
                        )) : <Typography variant="caption" color="text.secondary">Awaiting employee decision</Typography>}
                      </TableCell>
                      <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                        {isCurrentReplacement ? (
                          <Box sx={{ display: "flex", justifyContent: "flex-end", gap: .75 }}>
                            {current.canChange !== false && (
                              <Button size="small" variant="outlined" onClick={() => openCandidateDialog(current)}>
                                Change assignment
                              </Button>
                            )}
                            <Button size="small" color="error" variant="outlined" onClick={() => deleteReplacementAssignment(current)}>
                              Delete
                            </Button>
                          </Box>
                        ) : (
                          <Typography variant="caption" color="text.secondary">{current ? "Previous assignment" : "Audit only"}</Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!mergedReplacementRows.length && <TableRow><TableCell colSpan={7} align="center">No assigned replacement duties or decisions recorded.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </TableContainer>
        </AccordionDetails>
      </Accordion>
      </Box>
      </Collapse>

    {/* ################# SIC Section ################### */}


      <Collapse in={activeWorkflow === "sic"} timeout={420} unmountOnExit>
      <Box id="replacement-workflow-sic" sx={{ scrollMarginTop: 110 }}>
      <Accordion
        defaultExpanded
        sx={{
          borderRadius: 3,
          boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
          overflow: "hidden",
          mb: 3
        }}
      >

        <AccordionSummary
          expandIcon={<ExpandMoreIcon />}
          sx={{
            background: "linear-gradient(90deg,#ef6c00,#ffb74d)",
            color: "white",
            px: 3
          }}
        >

          <Typography variant="h6" fontWeight={600}>
            SIC Assignment Pending
          </Typography>

        </AccordionSummary>

        <AccordionDetails>

          <Paper elevation={0} sx={{ p: 2 }}>

            <TableContainer sx={{ maxHeight: 380, minHeight: pendingSIC.length ? 150 : 72, border: "1px solid #D7E3F4", borderRadius: 2 }}>

              <Table size="small" stickyHeader>

                <TableHead>
                  <TableRow sx={{ background: "#e65100" }}>
                    <TableCell sx={{ color: "white" }}>Employee</TableCell>
                    <TableCell sx={{ color: "white" }}>Group</TableCell>
                    <TableCell sx={{ color: "white" }}>Date</TableCell>
                    <TableCell sx={{ color: "white" }}>Leave Type</TableCell>
                    <TableCell sx={{ color: "white" }}>Manpower replacement</TableCell>
                    <TableCell sx={{ color: "white" }}>SIC coverage action</TableCell>
                  </TableRow>
                </TableHead>

                <TableBody>

                  {pendingSIC.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} align="center">
                        No SIC assignment pending
                      </TableCell>
                    </TableRow>
                  )}

                  {pendingSIC.map((l) => (

                    <TableRow key={l.id} hover>

                      <TableCell>{l.name}</TableCell>
                      <TableCell>{l.groupName}</TableCell>
                      <TableCell>
                        {dayjs(l.date).format("DD MMM YYYY")}
                      </TableCell>
                      <TableCell>{l.leaveType}</TableCell>

                      <TableCell>
                        {l.replacementAssigned ? (
                          <Chip
                            size="small"
                            color="success"
                            label={`Assigned: ${l.replacement?.name || l.replacement?.employeeId || "Replacement"}`}
                          />
                        ) : (
                          <Button
                            variant="outlined"
                            size="small"
                            onClick={() => openCandidateDialog(l)}
                          >
                            Assign replacement
                          </Button>
                        )}
                      </TableCell>

                      <TableCell>
                        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                          <Button
                            variant="contained"
                            size="small"
                            color="warning"
                            onClick={() => openSICDialog(l, "Same-shift acting-SIC assignment")}
                          >
                            Assign from this shift
                          </Button>
                          <Button
                            variant="outlined"
                            size="small"
                            onClick={() => openSICExchange(l)}
                          >
                            Use duty exchange
                          </Button>
                        </Box>

                      </TableCell>

                    </TableRow>

                  ))}

                </TableBody>

              </Table>

            </TableContainer>

          </Paper>

        </AccordionDetails>

      </Accordion>
      </Box>
      </Collapse>

      {/* ========================= */}
      {/* HISTORY */}
      {/* ========================= */}

      <Accordion
        defaultExpanded
        sx={{
          borderRadius: 3,
          boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
          overflow: "hidden",
          mb: 3
        }}
      >
        <AccordionSummary
          expandIcon={<ExpandMoreIcon />}
          sx={{
            background: "linear-gradient(90deg,#004d40,#26a69a)",
            color: "white",
            px: 3
          }}
        >
          <Typography variant="h6" fontWeight={600}>
            Replacement History
          </Typography>
        </AccordionSummary>

        <AccordionDetails>

          <Paper elevation={0} sx={{ p: 2 }}>

            <Box sx={{ display: "flex", gap: 2, mb: 2 }}>

              <TextField type="date" size="small" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              <TextField type="date" size="small" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              <TextField size="small" label="Employee ID" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} />

              <Button variant="contained" onClick={fetchHistory}>
                Search
              </Button>

            </Box>

            <Table size="small">

              <TableHead>
                <TableRow sx={{ background: "#004d40" }}>
                  <TableCell sx={{ color: "white" }}>Date</TableCell>
                  <TableCell sx={{ color: "white" }}>Replacement Employee</TableCell>
                  <TableCell sx={{ color: "white" }}>Replaced Employee</TableCell>
                  <TableCell sx={{ color: "white" }}>Group</TableCell>
                  <TableCell sx={{ color: "white" }}>Leave Type</TableCell>
                </TableRow>
              </TableHead>

              <TableBody>

                {history.map((h, i) => (
                  <TableRow key={i}>
                    <TableCell>{dayjs(h.date).format("DD MMM YYYY")}</TableCell>
                    <TableCell>{h.employeeName}</TableCell>
                    <TableCell>{h.replacedEmployee}</TableCell>
                    <TableCell>{h.groupName}</TableCell>
                    <TableCell>{h.leaveType}</TableCell>
                  </TableRow>
                ))}

              </TableBody>

            </Table>

          </Paper>

        </AccordionDetails>
      </Accordion>

      {/* ========================= */}
      {/* REPLACEMENT DIALOG */}
      {/* ========================= */}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="lg">

        <DialogTitle sx={{background: "linear-gradient(90deg,#4a148c,#7b1fa2)", color: "#fff"}}>Smart Replacement Selection</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: { xs: "stretch", md: "center" }, flexDirection: { xs: "column", md: "row" }, gap: 2, mb: 2 }}>
            <Typography variant="body2" color="text.secondary">
              Candidates use current Organization Master reporting and verified shift history. Past groups establish experience only; they do not control current reporting.
            </Typography>
            <FormControl size="small" sx={{ minWidth: 240 }}>
              <InputLabel>Candidate filter</InputLabel>
              <Select
                value={candidateFilter}
                label="Candidate filter"
                onChange={(e) => handleCandidateFilterChange(e.target.value)}
              >
                <MenuItem value="all">All employee</MenuItem>
                <MenuItem value="sic">Only SIC</MenuItem>
                <MenuItem value="shift_engineer">Only Shift Engineer</MenuItem>
              </Select>
            </FormControl>
          </Box>

          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Candidate selection order · required duty: {candidates[0]?.requiredDuty || "-"}
          </Typography>
          <TableContainer sx={{ border: "1px solid #CBD5E1", borderRadius: 2, maxHeight: "62vh" }}>
            <Table size="small" stickyHeader sx={{ minWidth: 1180 }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 900 }}>Order</TableCell>
                  <TableCell sx={{ fontWeight: 900, minWidth: 180 }}>Employee</TableCell>
                  <TableCell sx={{ fontWeight: 900 }}>Candidate pool</TableCell>
                  <TableCell sx={{ fontWeight: 900, minWidth: 220 }}>Current unit / reporting line</TableCell>
                  <TableCell sx={{ fontWeight: 900 }}>Duty on date</TableCell>
                  <TableCell sx={{ fontWeight: 900 }}>Next day</TableCell>
                  <TableCell sx={{ fontWeight: 900 }}>Last matching duty</TableCell>
                  <TableCell sx={{ fontWeight: 900 }}>Days since</TableCell>
                  <TableCell sx={{ fontWeight: 900 }}>Denied</TableCell>
                  <TableCell sx={{ fontWeight: 900, textAlign: "right" }}>Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {orderedCandidates.map((candidate) => {
                  const unit = [
                    ...(candidate.organization?.departments || []),
                    ...(candidate.organization?.verticals || []),
                    ...(candidate.organization?.sections || []),
                  ].filter(Boolean).join(" · ") || "Organization Master";
                  const lastDuty = candidate.lastMatchingDutyDate ? dayjs(candidate.lastMatchingDutyDate).format("DD MMM YYYY") : "Never recorded";
                  return <TableRow key={candidate.employeeId} hover sx={{ "&:hover": { background: "#F5FAFF" } }}>
                    <TableCell><Chip size="small" label={candidate.serialNo || "-"} sx={{ fontWeight: 900, background: "#E8F1FF", color: "#0057B7" }} /></TableCell>
                    <TableCell><Typography sx={{ fontSize: 12.5, fontWeight: 900 }}>{candidate.name}</Typography><Typography sx={{ fontSize: 11, color: "#64748B" }}>{candidate.designation || "-"} · {candidate.employeeId}</Typography></TableCell>
                    <TableCell><Chip size="small" label={sourceLabel(candidate.source)} color={candidate.source === "replacement" ? "success" : candidate.source === "otherShift" ? "warning" : "default"} variant="outlined" />{candidate.eligibility && <Typography sx={{ mt: .4, fontSize: 10.5, color: "#0057B7", fontWeight: 800 }}>{candidate.eligibility}</Typography>}</TableCell>
                    <TableCell><Typography sx={{ fontSize: 11.5, fontWeight: 750 }}>{unit}</Typography><Typography sx={{ mt: .35, fontSize: 10.5, color: "#64748B" }}>{(candidate.authorityNames || []).join(" → ") || "No reporting line recorded"}</Typography></TableCell>
                    <TableCell sx={{ fontWeight: 800 }}>{candidate.assignedDuty || "-"}</TableCell>
                    <TableCell sx={{ fontWeight: 800 }}>{candidate.nextDayDuty || "-"}</TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>{lastDuty}</TableCell>
                    <TableCell>{candidate.daysSinceMatchingDuty ?? "-"}</TableCell>
                    <TableCell>{candidate.denialCount ?? candidate.denialCount90Days ?? 0}</TableCell>
                    <TableCell align="right"><Button size="small" variant="contained" onClick={() => assignReplacement(candidate.employeeId)} sx={{ whiteSpace: "nowrap" }}>Assign</Button></TableCell>
                  </TableRow>;
                })}
                {!orderedCandidates.length && <TableRow><TableCell colSpan={10} align="center" sx={{ py: 4, color: "#64748B" }}>No eligible candidates match the selected filter.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>


        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Close</Button>
        </DialogActions>

      </Dialog>

      {/* ========================= */}
      {/* SIC DIALOG */}
      {/* ========================= */}

      <Dialog open={sicDialogOpen} onClose={() => setSicDialogOpen(false)} fullWidth maxWidth="xs">

        <DialogTitle sx={{ background: "#ff9800", color: "white" }}>
          Assign Temporary SIC
        </DialogTitle>

        <DialogContent sx={{ mt: 2 }}>

          <Typography sx={{ mb: 1 }}>
            Replacement Assigned: {selectedCandidate?.name || "-"}
          </Typography>

          <TextField
            select
            fullWidth
            size="small"
            label="Select SIC"
            value={selectedSIC}
            onChange={(e) => setSelectedSIC(e.target.value)}
            sx={{ mt: 2 }}
          >

            {sicCandidates.length === 0 && (
              <MenuItem disabled>No shift staff available</MenuItem>
            )}

            {sicCandidates.map(s => (
              <MenuItem key={s.employeeId} value={s.employeeId}>
                {s.name} ({s.designation})
              </MenuItem>
            ))}

          </TextField>

        </DialogContent>

        <DialogActions>

          <Button onClick={() => setSicDialogOpen(false)}>Skip</Button>

          <Button
            variant="contained"
            color="warning"
            onClick={assignSIC}
            disabled={!selectedSIC}
          >
            Assign SIC
          </Button>

        </DialogActions>

      </Dialog>

    </Box>
  );
}
