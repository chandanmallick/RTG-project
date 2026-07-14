import React, { useState, useEffect } from "react";
import api from "./api";

import {
  Box,
  Paper,
  Typography,
  Button,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  TextField,
  Autocomplete,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  MenuItem
} from "@mui/material";

import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ShiftTimeline from "./ShiftTimeline";

export default function ShiftHistoryAdmin() {

  const [data, setData] = useState([]);
  const [timelineData, setTimelineData] = useState([]);
  const [file, setFile] = useState(null);
  const [editIndex, setEditIndex] = useState(null);
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [totalDays, setTotalDays] = useState(0);

  useEffect(() => {
    fetchAll();
  }, []);

  useEffect(() => {
    updateTimeline();
  }, [selectedEmp, data]);

  const updateTimeline = () => {

    if (!selectedEmp) {
      setTimelineData([]);
      setTotalDays(0);
      return;
    }

    const filtered = data.filter(
      d => d.employeeId === selectedEmp.employeeId
    );

    // âœ… CLEAN CALL
    setTotalDays(calculateTotalDays(filtered));

    const formatted = filtered.map(r => ({
      group: r.groupName,
      start: new Date(r.startDate).getTime(),
      end: r.endDate
        ? new Date(r.endDate).getTime()
        : new Date().getTime(),
      startDate: r.startDate,
      endDate: r.endDate || "Present"
    }));

    setTimelineData(formatted);
  };

  // ================= FETCH =================
  const fetchAll = async () => {
    try {
      const res = await api.get("/roster/shift-history/all");
      setData(res.data);

      let filtered = [];

      if (selectedEmp) {
        filtered = res.data.filter(
          d => d.employeeId === selectedEmp.employeeId
        );
      }

      const formatted = filtered.map(r => ({
        group: r.groupName,
        start: new Date(r.startDate).getTime(),
        end: r.endDate
          ? new Date(r.endDate).getTime()
          : new Date().getTime(),
        startDate: r.startDate,
        endDate: r.endDate || "Present"
      }));

      setTimelineData(formatted);

    } catch (err) {
      console.error(err);
    }
  };

  // ================= HANDLE CHANGE =================
  const handleChange = (index, field, value) => {
    const updated = [...data];
    updated[index][field] = value;
    setData(updated);
  };

  // ================= SAVE =================
  const handleSave = async () => {
    try {
      await api.post("/roster/shift-history/upload", data);
      alert("Saved successfully");
      fetchAll();
    } catch (err) {
      console.error(err);
      alert("Save failed");
    }
  };

  // ================= UPLOAD =================
  const handleUpload = async () => {
    if (!file) {
      alert("Select file first");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    try {
      await api.post("/roster/shift-history/upload-excel", formData);
      alert("Uploaded successfully");
      fetchAll();
    } catch (err) {
      console.error(err);
      alert("Upload failed");
    }
  };

  // ================= DELETE =================
  const handleDelete = async (index) => {
    try {
      const row = data[index];

      await api.delete(`/roster/shift-history/${row._id}`);

      fetchAll(); // reload
    } catch (err) {
      console.error(err);
      alert("Delete failed");
    }
  };

  const employeeList = [
    ...new Map(
      data.map(item => [
        item.employeeId,
        {
          employeeId: item.employeeId,
          name: item.name
        }
      ])
    ).values()
  ];

  // ================= Total day claculation =================

  const calculateTotalDays = (records) => {

    let total = 0;

    records.forEach(r => {

      if (!r.startDate) return;

      const start = new Date(r.startDate);
      const end = r.endDate
        ? new Date(r.endDate)
        : new Date(); // ongoing

      const diff = Math.ceil(
        (end - start) / (1000 * 60 * 60 * 24)
      ) + 1;

      total += diff;
    });

    return total;
  };

  const formatDuration = (days) => {
    if (!days || days <= 0) return "0 Days";

    const years = Math.floor(days / 365);
    const remainingDaysAfterYears = days % 365;

    const months = Math.floor(remainingDaysAfterYears / 30);
    const remainingDays = remainingDaysAfterYears % 30;

    let result = "";

    if (years > 0) result += `${years} Yr `;
    if (months > 0) result += `${months} Mo `;
    if (remainingDays > 0) result += `${remainingDays} Days`;

    return result.trim();
  };

  return (
    <Box sx={{ p: 3 }}>

      {/* HEADER */}
      <Paper
        sx={{
          p: 3,
          mb: 3,
          borderRadius: 3,
          background: "linear-gradient(90deg,#0f2027,#203a43,#2c5364)",
          color: "white"
        }}
      >
        <Typography variant="h5" fontWeight="bold">
          Shift History Management
        </Typography>
      </Paper>

      {/* ================= UPLOAD ================= */}
      <Accordion defaultExpanded sx={{ mb: 3, borderRadius: 3 }}>
        <AccordionSummary
          expandIcon={<ExpandMoreIcon />}
          sx={{
            background: "linear-gradient(90deg,#1565c0,#42a5f5)",
            color: "white"
          }}
        >
          <Typography fontWeight="bold">Upload Shift History</Typography>
        </AccordionSummary>

        <AccordionDetails>
          <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>

            <Button variant="contained" component="label">
              Upload Excel
              <input
                type="file"
                hidden
                accept=".xlsx,.xls"
                onChange={(e) => setFile(e.target.files[0])}
              />
            </Button>

            <Button variant="contained" color="success" onClick={handleUpload}>
              Upload & Process
            </Button>

            <Button
              variant="outlined"
              onClick={() =>
                setData(prev => [
                  ...prev,
                  {
                    employeeId: "",
                    name: "",
                    groupName: "",
                    startDate: "",
                    endDate: "",
                    isActive: true
                  }
                ])
              }
            >
              Add Row
            </Button>

            <Button variant="contained" onClick={handleSave}>
              Save All
            </Button>

          </Box>
        </AccordionDetails>
      </Accordion>

      {/* ================= TABLE ================= */}
      <Accordion defaultExpanded sx={{ mb: 3, borderRadius: 3 }}>
        <AccordionSummary
          expandIcon={<ExpandMoreIcon />}
          sx={{
            background: "linear-gradient(90deg,#2e7d32,#66bb6a)",
            color: "white"
          }}
        >
          <Typography fontWeight="bold">Shift History Table</Typography>
        </AccordionSummary>

        <AccordionDetails>

          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Emp ID</TableCell>
                <TableCell>Name</TableCell>
                <TableCell>Group</TableCell>
                <TableCell>Start</TableCell>
                <TableCell>End</TableCell>
                <TableCell>Active</TableCell>
                <TableCell>Action</TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {data.map((row, i) => (
                <TableRow key={i}>

                  {/* EMP ID */}
                  <TableCell>
                    {editIndex === i ? (
                      <TextField
                        value={row.employeeId}
                        onChange={(e) =>
                          handleChange(i, "employeeId", e.target.value)
                        }
                        size="small"
                      />
                    ) : row.employeeId}
                  </TableCell>

                  {/* NAME */}
                  <TableCell>
                    {editIndex === i ? (
                      <TextField
                        value={row.name}
                        onChange={(e) =>
                          handleChange(i, "name", e.target.value)
                        }
                        size="small"
                      />
                    ) : row.name}
                  </TableCell>

                  {/* GROUP */}
                  <TableCell>
                    {editIndex === i ? (
                      <TextField
                        value={row.groupName}
                        onChange={(e) =>
                          handleChange(i, "groupName", e.target.value)
                        }
                        size="small"
                      />
                    ) : row.groupName}
                  </TableCell>

                  {/* START */}
                  <TableCell>
                    {editIndex === i ? (
                      <TextField
                        type="date"
                        value={row.startDate}
                        onChange={(e) =>
                          handleChange(i, "startDate", e.target.value)
                        }
                        size="small"
                      />
                    ) : row.startDate}
                  </TableCell>

                  {/* END */}
                  <TableCell>
                    {editIndex === i ? (
                      <TextField
                        type="date"
                        value={row.endDate || ""}
                        onChange={(e) =>
                          handleChange(i, "endDate", e.target.value)
                        }
                        size="small"
                      />
                    ) : row.endDate || "-"}
                  </TableCell>

                  {/* ACTIVE */}
                  <TableCell>
                    {editIndex === i ? (
                      <TextField
                        select
                        value={row.isActive}
                        onChange={(e) =>
                          handleChange(i, "isActive", e.target.value === "true")
                        }
                        size="small"
                      >
                        <MenuItem value="true">Yes</MenuItem>
                        <MenuItem value="false">No</MenuItem>
                      </TextField>
                    ) : row.isActive ? "Yes" : "No"}
                  </TableCell>

                  {/* ACTION */}
                  <TableCell>
                    {editIndex === i ? (
                      <Button
                        onClick={async () => {
                          try {
                            const row = data[i];

                            await api.put(`/roster/shift-history/${row._id}`, row);

                            setEditIndex(null);
                            fetchAll();
                          } catch (err) {
                            console.error(err);
                            alert("Update failed");
                          }
                        }}
                        color="success"
                      >
                        Save
                      </Button>
                    ) : (
                      <Button onClick={() => setEditIndex(i)}>
                        Edit
                      </Button>
                    )}

                    <Button color="error" onClick={() => handleDelete(i)}>
                      Delete
                    </Button>
                  </TableCell>

                </TableRow>
              ))}
            </TableBody>
          </Table>

        </AccordionDetails>
      </Accordion>

      {/* ================= TIMELINE ================= */}
      <Accordion defaultExpanded sx={{ borderRadius: 3 }}>
        <AccordionSummary
          expandIcon={<ExpandMoreIcon />}
          sx={{
            background: "linear-gradient(90deg,#6a1b9a,#ab47bc)",
            color: "white"
          }}
        >
          <Typography fontWeight="bold">
            Employee Shift Timeline
          </Typography>
        </AccordionSummary>

        <AccordionDetails>

          <Box sx={{ display: "flex", alignItems: "center", gap: 3, mb: 3 }}>

            <Autocomplete
              options={employeeList}
              getOptionLabel={(o) => `${o.name} (${o.employeeId})`}
              onChange={(e, val) => setSelectedEmp(val)}
              renderInput={(params) => (
                <TextField {...params} label="Select Employee" />
              )}
              sx={{ width: 300 }}
            />

            {selectedEmp && (
              <Paper
                sx={{
                  px: 3,
                  py: 1,
                  borderRadius: 3,
                  background: "#f5f5f5"
                }}
              >
                <Typography variant="subtitle2" color="text.secondary">
                  Total Shift Duration
                </Typography>

                <Typography variant="h6" fontWeight="bold">
                  {formatDuration(totalDays)}
                </Typography>
              </Paper>
            )}

          </Box>

          {selectedEmp ? (
            <ShiftTimeline
              data={timelineData}
              height={350}
              chartId="adminTimeline"
            />
          ) : (
            <Typography color="text.secondary">
              Select an employee to view timeline
            </Typography>
          )}

        </AccordionDetails>
      </Accordion>

    </Box>
  );
}
