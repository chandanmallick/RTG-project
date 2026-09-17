import React, { useState, useEffect } from "react";
import api from "./api";
import {
  Box,
  Typography,
  TextField,
  Button,
  Paper,
  Grid,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Stack,
  Alert
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import DesignationMasterPanel from "./DesignationMasterPanel";

export default function DropdownMaster() {

  const [type, setType] = useState("");
  const [value, setValue] = useState("");
  const [status, setStatus] = useState("Active");
  const [dropdownList, setDropdownList] = useState([]);
  const [editId, setEditId] = useState(null);
  const [notice, setNotice] = useState(null);

  // Fetch values from backend
  const fetchDropdownValues = async (selectedType) => {
    if (!selectedType) {
      setDropdownList([]);
      return;
    }

    try {
      const res = selectedType === "leaveType"
        ? await api.get("/admin/DutyLeaveType/leaveType")
        : await api.get(`/admin/dropdown/${selectedType}`);
      setDropdownList(res.data);
    } catch (error) {
      setNotice({ severity: "error", text: error.response?.data?.detail || "Dropdown values could not be loaded." });
    }
  };

  // Fetch whenever dropdown type changes
  useEffect(() => {
    setEditId(null);
    setValue("");
    setStatus("Active");
    fetchDropdownValues(type);
  }, [type]);

  const handleSubmit = async () => {
    if (!type || !value) return;

    try {
      if (type === "leaveType") {
        const payload = {
          dutyLeaveType_cat: "leaveType",
          value: value.trim(),
          status,
        };
        if (editId) await api.put(`/admin/DutyLeaveType/${editId}`, payload);
        else await api.post("/admin/DutyLeaveType", payload);
      } else {
        if (editId) await api.put(`/admin/dropdown/${editId}`, { type, value: value.trim() });
        else await api.post(`/admin/dropdown`, { type, value: value.trim() });
      }

      setValue("");
      setEditId(null);
      setNotice({ severity: "success", text: editId ? "Dropdown value updated." : "Dropdown value added." });
      fetchDropdownValues(type); // Refresh from backend
    } catch (error) {
      setNotice({ severity: "error", text: error.response?.data?.detail || "Dropdown value could not be saved." });
    }
  };

  const handleEdit = (item) => {
    setEditId(item.id);
    setValue(item.value || "");
    setStatus(item.status || "Active");
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`Delete "${item.value}"?`)) return;
    try {
      if (type === "leaveType") await api.delete(`/admin/DutyLeaveType/${item.id}`);
      else await api.delete(`/admin/dropdown/${item.id}`);
      if (editId === item.id) {
        setEditId(null);
        setValue("");
        setStatus("Active");
      }
      setNotice({ severity: "success", text: "Dropdown value deleted." });
      fetchDropdownValues(type);
    } catch (error) {
      setNotice({ severity: "error", text: error.response?.data?.detail || "Dropdown value could not be deleted." });
    }
  };

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        Dropdown Management
      </Typography>

      {notice && <Alert severity={notice.severity} onClose={() => setNotice(null)} sx={{ mb: 2 }}>{notice.text}</Alert>}

      <DesignationMasterPanel />

      <Paper sx={{ p: 3, mb: 4 }}>
        <Grid container spacing={2}>

          <Grid item xs={12} md={4}>
            <TextField
              select
              label="Dropdown Type"
              fullWidth
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              <MenuItem value="dutyType">Duty Type</MenuItem>
              <MenuItem value="leaveType">Leave Type</MenuItem>
              <MenuItem value="category">Category</MenuItem>
              <MenuItem value="vertical">Vertical</MenuItem>
              <MenuItem value="department">Department</MenuItem>
            </TextField>
          </Grid>

          <Grid item xs={12} md={4}>
            <TextField
              label="New Value"
              fullWidth
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </Grid>

          {type === "leaveType" && <Grid item xs={12} md={2}>
            <TextField select label="Status" fullWidth value={status} onChange={(e) => setStatus(e.target.value)}>
              <MenuItem value="Active">Active</MenuItem>
              <MenuItem value="Inactive">Inactive</MenuItem>
            </TextField>
          </Grid>}

          <Grid item xs={12}>
            <Button variant="contained" onClick={handleSubmit}>
              {editId ? "Update Value" : "Add Value"}
            </Button>
            {editId && <Button sx={{ ml: 1 }} variant="outlined" onClick={() => { setEditId(null); setValue(""); setStatus("Active"); }}>Cancel</Button>}
          </Grid>

        </Grid>
      </Paper>

      <Typography variant="h6">Existing Values</Typography>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow sx={{backgroundColor: "#d9f2d9"}}>
              <TableCell><strong>Value</strong></TableCell>
              {type === "leaveType" && <TableCell><strong>Status</strong></TableCell>}
              <TableCell align="right"><strong>Actions</strong></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {dropdownList.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{item.value}</TableCell>
                {type === "leaveType" && <TableCell>{item.status || "Active"}</TableCell>}
                <TableCell align="right"><Stack direction="row" spacing={.5} justifyContent="flex-end"><IconButton size="small" color="primary" title="Edit" onClick={() => handleEdit(item)}><EditIcon fontSize="small" /></IconButton><IconButton size="small" color="error" title="Delete" onClick={() => handleDelete(item)}><DeleteIcon fontSize="small" /></IconButton></Stack></TableCell>
              </TableRow>
            ))}

            {dropdownList.length === 0 && (
              <TableRow>
                <TableCell colSpan={type === "leaveType" ? 3 : 2} align="center">
                  No values available
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}

