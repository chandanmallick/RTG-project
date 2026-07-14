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
  Chip,
  IconButton,
  Stack
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";

export default function DutyLeaveMaster() {
  const [masterType, setMasterType] = useState("");
  const [value, setValue] = useState("");
  const [status, setStatus] = useState("Active");
  const [list, setList] = useState([]);
  const [editId, setEditId] = useState(null);
  const [search, setSearch] = useState("");
  const [sortAsc, setSortAsc] = useState(true);

  const fetchData = async (type) => {
    if (!type) {
      setList([]);
      return;
    }

    try {
      const res = await api.get(`admin/DutyLeaveType/${type}`);
      setList(res.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchData(masterType);
  }, [masterType]);

  const handleSubmit = async () => {
    if (!masterType || !value.trim()) return;

    try {
      await api.post(`admin/DutyLeaveType`, {
        dutyLeaveType_cat: masterType,
        value,
        status
      });

      setEditId(null);
      setValue("");
      setStatus("Active");

      fetchData(masterType);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this item?")) return;

    try {
      await api.delete(`admin/DutyLeaveType/${id}`);
      fetchData(masterType);
    } catch (err) {
      console.error(err);
    }
  };

  const handleEdit = (item) => {
    setValue(item.value);
    setStatus(item.status || "Active");
    setEditId(item.id);
  };

  const handleReorder = (index, direction) => {
    const newList = [...list];
    const swapIndex = direction === "up" ? index - 1 : index + 1;

    if (swapIndex < 0 || swapIndex >= list.length) return;

    [newList[index], newList[swapIndex]] = [
      newList[swapIndex],
      newList[index]
    ];

    setList(newList);
  };

  const filteredList = list
    .filter((item) =>
      item.value.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) =>
      sortAsc
        ? a.value.localeCompare(b.value)
        : b.value.localeCompare(a.value)
    );

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h5" fontWeight={600} gutterBottom>
        Duty & Leave Type Management
      </Typography>

      {/* FORM CARD */}
      <Paper
        elevation={3}
        sx={{
          p: 3,
          mb: 4,
          borderRadius: 3
        }}
      >
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={3}>
            <TextField
              select
              label="Type"
              fullWidth
              value={masterType}
              onChange={(e) => setMasterType(e.target.value)}
            >
              <MenuItem value="leaveType">Leave Type</MenuItem>
              <MenuItem value="dutyType">Duty Type</MenuItem>
            </TextField>
          </Grid>

          <Grid item xs={12} md={4}>
            <TextField
              label="Name"
              fullWidth
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </Grid>

          <Grid item xs={12} md={2}>
            <TextField
              select
              label="Status"
              fullWidth
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <MenuItem value="Active">Active</MenuItem>
              <MenuItem value="Inactive">Inactive</MenuItem>
            </TextField>
          </Grid>

          <Grid item xs={12} md={3}>
            <Button
              variant="contained"
              fullWidth
              sx={{ height: "56px", borderRadius: 2 }}
              onClick={handleSubmit}
            >
              {editId ? "Update" : "Add"}
            </Button>
          </Grid>
        </Grid>
      </Paper>

      {/* SEARCH */}
      <Paper sx={{ p: 2, mb: 2, borderRadius: 3 }}>
        <Grid container spacing={2}>
          <Grid item xs={12} md={4}>
            <TextField
              label="Search"
              fullWidth
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Grid>

          <Grid item xs={12} md={2}>
            <Button
              variant="outlined"
              fullWidth
              sx={{ height: "56px" }}
              onClick={() => setSortAsc(!sortAsc)}
            >
              Sort {sortAsc ? "â†“" : "â†‘"}
            </Button>
          </Grid>
        </Grid>
      </Paper>

      {/* TABLE */}
      <Typography variant="h6" mb={1}>
        {masterType || "Records"}{" "}
        <Chip
          label={filteredList.length}
          color="success"
          size="small"
        />
      </Typography>

      <TableContainer component={Paper} sx={{ borderRadius: 3 }}>
        <Table>
          <TableHead>
            <TableRow sx={{ backgroundColor: "#f1f8e9" }}>
              <TableCell>Name</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="center">Order</TableCell>
              <TableCell align="center">Actions</TableCell>
            </TableRow>
          </TableHead>

          <TableBody>
            {filteredList.map((item, index) => (
              <TableRow key={item.id} hover>
                <TableCell>{item.value}</TableCell>

                <TableCell>
                  <Chip
                    label={item.status || "Active"}
                    color={
                      item.status === "Inactive"
                        ? "default"
                        : "success"
                    }
                    size="small"
                  />
                </TableCell>

                <TableCell align="center">
                  <Stack direction="row" justifyContent="center">
                    <IconButton
                      onClick={() =>
                        handleReorder(index, "up")
                      }
                    >
                      <ArrowUpwardIcon fontSize="small" />
                    </IconButton>

                    <IconButton
                      onClick={() =>
                        handleReorder(index, "down")
                      }
                    >
                      <ArrowDownwardIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                </TableCell>

                <TableCell align="center">
                  <IconButton
                    color="primary"
                    onClick={() => handleEdit(item)}
                  >
                    <EditIcon />
                  </IconButton>

                  <Button
                    color="error"
                    size="small"
                    onClick={() => handleDelete(item.id)}
                  >
                    Delete
                  </Button>
                </TableCell>
              </TableRow>
            ))}

            {filteredList.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} align="center">
                  No records found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
