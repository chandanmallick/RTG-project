import React, { useEffect, useState } from "react";
import api from "./api";
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
  Accordion,
  AccordionSummary,
  AccordionDetails,
  IconButton,
  Checkbox,
  FormControlLabel,
  Grid,
  FormControl,
  InputLabel,
  Select
} from "@mui/material";

import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";

export default function ReplacementManagement() {

  const [pendingLeaves, setPendingLeaves] = useState([]);
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
  const [halfDuty, setHalfDuty] = useState(false);
  const [candidateFilter, setCandidateFilter] = useState("auto");

  useEffect(() => {
    fetchPendingLeaves();
    fetchPendingSIC();
  }, []);

  // ===============================
  // FETCH DATA
  // ===============================

  const fetchPendingLeaves = async () => {
    try {
      const res = await api.get("/replacement/pending");
      setPendingLeaves(res.data || []);
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

      // âœ… Fetch SIC candidates from backend
      const res = await api.get(`/replacement/sic-candidates/${selectedLeave.id}`);
      setSicCandidates(res.data || []);

      setSelectedSIC("");
      setSicDialogOpen(true);

      fetchPendingLeaves();

    } catch (err) {
      console.error(err);
      alert("Assignment failed");
    }
  };

  // ===============================
  // MANUAL SIC BUTTON
  // ===============================

  const openSICDialog = async (leave) => {
    try {

      setSelectedLeave(leave);

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
        sicEmployeeId: selectedSIC
      });

      alert("SIC Assigned");

      setSicDialogOpen(false);
      fetchPendingLeaves();

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

  // ===============================
  // FILTERS
  // ===============================

  const recommended = candidates.filter(c => c.source === "replacement");
  const sameShift = candidates.filter(c => c.source === "shift");
  const otherShift = candidates.filter(c => c.source === "otherShift");


  const renderCard = (c, index) => (
    <Paper
      onClick={() => assignReplacement(c.employeeId)}
      sx={{
        p: 1.5,
        borderRadius: 2,
        cursor: "pointer",
        border: "1px solid #d6dbe1",
        background: "#f7f9fb",

        "&:hover": {
          background: "#eef3f7"
        }
      }}
    >
      <Typography fontWeight={600}>{c.name}</Typography>

      <Typography variant="caption" color="text.secondary">
        {c.designation}
      </Typography>

      <Typography variant="caption" display="block">
        Duty: {c.assignedDuty || "-"}
      </Typography>

      <Typography variant="caption">
        Score: {c.score}
      </Typography>
    </Paper>
  );

  // ===============================
  // UI
  // ===============================

  return (
    <Box sx={{ p: 3 }}>

      {/* HEADER */}
      <Paper
        sx={{
          p: 3,
          mb: 3,
          borderRadius: 3,
          background: "linear-gradient(90deg,#1e3c72,#2a5298)",
          color: "white"
        }}
      >
        <Typography variant="h5" fontWeight="bold">
          Replacement Management
        </Typography>
        <Typography variant="body2">
          Manage leave replacements and SIC assignments
        </Typography>
      </Paper>

      {/* ========================= */}
      {/* PENDING LEAVES */}
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

            <TableContainer>
              <Table size="small">

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

                        <Button
                          size="small"
                          variant="outlined"
                          color="warning"
                          sx={{ ml: 1 }}
                          onClick={() => openSICDialog(l)}
                        >
                          SIC
                        </Button>

                      </TableCell>

                    </TableRow>
                  ))}

                </TableBody>
              </Table>
            </TableContainer>

          </Paper>
        </AccordionDetails>
      </Accordion>

    {/* ################# SIC Section ################### */}


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

            <TableContainer>

              <Table size="small">

                <TableHead>
                  <TableRow sx={{ background: "#e65100" }}>
                    <TableCell sx={{ color: "white" }}>Employee</TableCell>
                    <TableCell sx={{ color: "white" }}>Group</TableCell>
                    <TableCell sx={{ color: "white" }}>Date</TableCell>
                    <TableCell sx={{ color: "white" }}>Leave Type</TableCell>
                    <TableCell sx={{ color: "white" }}>Action</TableCell>
                  </TableRow>
                </TableHead>

                <TableBody>

                  {pendingSIC.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} align="center">
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

                        <Button
                          variant="contained"
                          size="small"
                          color="warning"
                          onClick={() => openSICDialog(l)}
                        >
                          Assign SIC
                        </Button>

                      </TableCell>

                    </TableRow>

                  ))}

                </TableBody>

              </Table>

            </TableContainer>

          </Paper>

        </AccordionDetails>

      </Accordion>

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
              Replacement candidates are matched from employee category. Filter the list if needed.
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

          {/* SECTION 1 â€” Recommended */}

          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Recommended (Same Shift)
          </Typography>

          <Grid container spacing={2}>
            {recommended.map((c, index) => (
              <Grid item xs={12} md={4} key={c.employeeId}>
                {renderCard(c, index)}
              </Grid>
            ))}
          </Grid>

          {/* SECTION 2 â€” Same Shift Staff */}

          <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>
            Same Shift Staff
          </Typography>

          <Grid container spacing={2}>
            {sameShift.map((c, index) => (
              <Grid item xs={12} md={4} key={c.employeeId}>
                {renderCard(c, index)}
              </Grid>
            ))}
          </Grid>

          {/* SECTION 1 â€” Other Shift */}

          <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>
            Other Shift (Will Create Vacancy)
          </Typography>

          <Grid container spacing={2}>
            {otherShift.map((c, index) => (
              <Grid item xs={12} md={4} key={c.employeeId}>
                {renderCard(c, index)}
              </Grid>
            ))}
          </Grid>
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
