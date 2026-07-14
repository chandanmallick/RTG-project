import React, { useState, useEffect } from "react";
import api from "./api";
import {
  Box,
  Typography,
  TextField,
  Button,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Grid,
  MenuItem,
  TablePagination,
  Switch,
  FormControlLabel
} from "@mui/material";


export default function EmployeeMaster() {

  const [formData, setFormData] = useState({
    name: "",
    nameHindi: "",
    designation: "",
    designationHindi: "",
    userId: "",
    password: "",
    phone: "",
    gmail: "",
    dutyType: "",
    category: "",

    // ðŸ”¥ NEW
    vertical: "",
    department: "",
    reportingOfficerId: "",
    intermediaryReportingId: "",
    hodId: ""
  });

  const [employees, setEmployees] = useState([]);
  const [dutyTypes, setDutyTypes] = useState([]);
  const [categories, setCategories] = useState([]);
  const [editId, setEditId] = useState(null);
  const [groupLeaveRule, setGroupLeaveRule] = useState(false);
  const [verticals, setVerticals] = useState([]);
  const [departments, setDepartments] = useState([]);

  // ðŸ”Ž Search
  const [searchText, setSearchText] = useState("");

  // ðŸ”„ Sorting
  const [orderBy, setOrderBy] = useState("name");
  const [orderDirection, setOrderDirection] = useState("asc");

  // ðŸ“„ Pagination
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(5);

  const fetchEmployees = async () => {
    const res = await api.get(`/admin/employees`);
    setEmployees(res.data);
  };

  const fetchLeaveRule = async () => {
    const res = await api.get(`/admin/settings/group-leave-rule`);
    setGroupLeaveRule(res.data.enabled);

  };

  const downloadEmployees = async () => {
    const res = await api.get("/admin/employees/export-excel", {
      responseType: "blob"
    });

    const url = window.URL.createObjectURL(new Blob([res.data]));

    const a = document.createElement("a");
    a.href = url;
    a.download = "employees.xlsx";
    a.click();
  };

  const uploadEmployees = async (file) => {

    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    await api.post("/admin/employees/import-excel", formData, {
      headers: {
        "Content-Type": "multipart/form-data"
      }
    });

    alert("Excel uploaded successfully");
    fetchEmployees(); // refresh table
  };

  const fetchDropdowns = async () => {
    const dutyRes = await api.get(`/admin/dropdown/dutyType`);
    const catRes = await api.get(`/admin/dropdown/category`);
    const verticalRes = await api.get(`/admin/dropdown/vertical`);
    const deptRes = await api.get(`/admin/dropdown/department`);

    setDutyTypes(dutyRes.data);
    setCategories(catRes.data);
    setVerticals(verticalRes.data);
    setDepartments(deptRes.data);
  };

  useEffect(() => {
    fetchEmployees();
    fetchDropdowns();
    fetchLeaveRule();
  }, []);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async () => {

    if (editId) {
      await api.put(`admin/employees/${editId}`, formData);
      setEditId(null);
    } else {
      await api.post(`/admin/employees`, formData);
    }

    fetchEmployees();

    setFormData({
      name: "",
      nameHindi: "",
      designation: "",
      designationHindi: "",
      userId: "",
      password: "",
      phone: "",
      gmail: "",
      dutyType: "",
      category: "",
      vertical: "",
      department: "",
      reportingOfficerId: "",
      intermediaryReportingId: "",
      hodId: ""
    });
  };

  const handleEdit = (employee) => {
    setFormData(employee);
    setEditId(employee.id);
  };

  // ðŸ”„ Sort Handler
  const handleSort = (column) => {
    const isAsc = orderBy === column && orderDirection === "asc";
    setOrderDirection(isAsc ? "desc" : "asc");
    setOrderBy(column);
  };

  // ðŸ”„ TOggle Handler
  const handleToggleLeaveRule = async (event) => {
    const enabled = event.target.checked;
    setGroupLeaveRule(enabled);
    await api.put(`/admin/settings/group-leave-rule`, {
      enabled: enabled
    });
  };
  

  // ðŸ”Ž Filter + Sort
  const processedEmployees = employees
    .filter(emp =>
      emp.name?.toLowerCase().includes(searchText.toLowerCase()) ||
      emp.userId?.toLowerCase().includes(searchText.toLowerCase()) ||
      emp.designation?.toLowerCase().includes(searchText.toLowerCase())
    )
    .sort((a, b) => {
      const valueA = a[orderBy] || "";
      const valueB = b[orderBy] || "";

      return orderDirection === "asc"
        ? valueA.localeCompare(valueB)
        : valueB.localeCompare(valueA);
    });

  const paginatedData = processedEmployees.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage
  );

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        Employee Master Entry
      </Typography>

      <Paper sx={{ p:2, mb:2, background:"#f4f6fb" }}>

        <Grid container spacing={2}>

          <Grid item>
            <Button variant="contained" onClick={downloadEmployees}>
              Download Employees
            </Button>
          </Grid>

          <Grid item>
            <Button
              variant="outlined"
              component="label"
            >
              Upload Employees
              <input
                type="file"
                hidden
                accept=".json"
                onChange={(e)=>uploadEmployees(e.target.files[0])}
              />
            </Button>
          </Grid>

        </Grid>

      </Paper>

      {/* -------- Entry Form -------- */}
      <Paper sx={{ p: 3, mb: 4 }}>
        <Grid container spacing={2}>
          <Grid item xs={12} md={4}>
            <TextField label="Name" name="name" fullWidth value={formData.name} onChange={handleChange} />
          </Grid>

          <Grid item xs={12} md={4}>
            <TextField label="Name (Hindi)" name="nameHindi" fullWidth value={formData.nameHindi} onChange={handleChange} />
          </Grid>

          <Grid item xs={12} md={4}>
            <TextField label="Designation" name="designation" fullWidth value={formData.designation} onChange={handleChange} />
          </Grid>

          <Grid item xs={12} md={4}>
            <TextField label="Designation (Hindi)" name="designationHindi" fullWidth value={formData.designationHindi} onChange={handleChange}/>
          </Grid>

          <Grid item xs={12} md={4}>
            <TextField label="User ID" name="userId" fullWidth value={formData.userId} onChange={handleChange} />
          </Grid>

          <Grid item xs={12} md={4}>
            <TextField label="Password" type="password" name="password" fullWidth value={formData.password} onChange={handleChange} />
          </Grid>

          <Grid item xs={12} md={4}>
            <TextField label="Phone" name="phone" fullWidth value={formData.phone} onChange={handleChange} />
          </Grid>

          <Grid item xs={12} md={4}>
            <TextField label="Gmail" name="gmail" fullWidth value={formData.gmail} onChange={handleChange} />
          </Grid>

          <Grid item xs={12} md={4}>
            <TextField select label="Type of Duty" name="dutyType" fullWidth value={formData.dutyType} onChange={handleChange}>
              {dutyTypes.map((item) => (
                <MenuItem key={item.id} value={item.value}>
                  {item.value}
                </MenuItem>
              ))}
            </TextField>
          </Grid>

          <Grid item xs={12} md={4}>
            <TextField select label="Category" name="category" fullWidth value={formData.category} onChange={handleChange}>
              {categories.map((item) => (
                <MenuItem key={item.id} value={item.value}>
                  {item.value}
                </MenuItem>
              ))}
            </TextField>
          </Grid>

          <Grid item xs={12} md={4}>
            <TextField select label="Vertical" name="vertical" fullWidth value={formData.vertical} onChange={handleChange}>
              {verticals.map(item => (
                <MenuItem key={item.id} value={item.value}>
                  {item.value}
                </MenuItem>
              ))}
            </TextField>
          </Grid>


          <Grid item xs={12} md={4}>
            <TextField select label="Department" name="department" fullWidth value={formData.department} onChange={handleChange}>
              {departments.map(item => (
                <MenuItem key={item.id} value={item.value}>
                  {item.value}
                </MenuItem>
              ))}
            </TextField>
          </Grid>

          <Grid item xs={12} md={4}>
            <TextField select label="Reporting Officer" name="reportingOfficerId" fullWidth value={formData.reportingOfficerId} onChange={handleChange}>
              {employees.map(emp => (
                <MenuItem key={emp.id} value={emp.userId}>
                  {emp.name}
                </MenuItem>
              ))}
            </TextField>
          </Grid>


          <Grid item xs={12} md={4}>
            <TextField select label="Reporting Officer" name="reportingOfficerId" fullWidth value={formData.reportingOfficerId || formData.reportingOfficerName} onChange={handleChange}>
              {employees.map(emp => (
                <MenuItem key={emp.id} value={emp.userId}>
                  {emp.name}
                </MenuItem>
              ))}
            </TextField>
          </Grid>

          <Grid item xs={12} md={4}>
            <TextField select label="Intermediary Reporting" name="intermediaryReportingId" fullWidth value={formData.intermediaryReportingName  || formData.intermediaryReportingId} onChange={handleChange}>
              {employees.map(emp => (
                <MenuItem key={emp.id} value={emp.userId}>
                  {emp.name}
                </MenuItem>
              ))}
            </TextField>
          </Grid>

          <Grid item xs={12} md={4}>
            <TextField select label="HOD" name="hodId" fullWidth value={formData.hodName  || formData.hodId} onChange={handleChange}>
              {employees.map(emp => (
                <MenuItem key={emp.id} value={emp.userId}>
                  {emp.name}
                </MenuItem>
              ))}
            </TextField>
          </Grid>

          <Grid item xs={12}>
            <Button variant="contained" onClick={handleSubmit}>
              {editId ? "Update Employee" : "Add Employee"}
            </Button>
          </Grid>
        </Grid>
      </Paper>

      {/* -------- Leave rule toggle -------- */}

      <Paper sx={{ p:2, mb:3, background:"#f0f7ff" }}>
      <FormControlLabel
        control={
          <Switch
            checked={groupLeaveRule}
            onChange={handleToggleLeaveRule}
            color="primary"
          />
        }
        label={
          groupLeaveRule
            ? "Group Leave Restriction: ON (Only 1 leave per group per day)"
            : "Group Leave Restriction: OFF (Multiple leave allowed)"
        }
      />
      </Paper>

      {/* -------- Employee Table -------- */}
      <Typography variant="h6">Employee List</Typography>

      <TableContainer component={Paper}>
        <Table>

          <TableHead>
            <TableRow sx={{ backgroundColor: "#d9f2d9" }}>
              <TableCell onClick={() => handleSort("name")} sx={{ cursor: "pointer" }}>
                <strong>Name</strong> {orderBy === "name" ? (orderDirection === "asc" ? "â†‘" : "â†“") : ""}
              </TableCell>
              <TableCell onClick={() => handleSort("designation")} sx={{ cursor: "pointer" }}>
                <strong>Designation</strong> {orderBy === "designation" ? (orderDirection === "asc" ? "â†‘" : "â†“") : ""}
              </TableCell>
              <TableCell><strong>Name (Hindi)</strong></TableCell>
              <TableCell><strong>Designation (Hindi)</strong></TableCell>
              <TableCell onClick={() => handleSort("userId")} sx={{ cursor: "pointer" }}>
                <strong>User ID</strong> {orderBy === "userId" ? (orderDirection === "asc" ? "â†‘" : "â†“") : ""}
              </TableCell>
              <TableCell><strong>Duty Type</strong></TableCell>
              <TableCell><strong>Phone No</strong></TableCell>
              <TableCell><strong>Category</strong></TableCell>
              <TableCell><strong>Action</strong></TableCell>
            </TableRow>

            {/* ðŸ”Ž Search Row */}
            <TableRow>
              <TableCell colSpan={7}>
                <TextField
                  fullWidth
                  size="small"
                  placeholder="Search by Name / User ID / Designation..."
                  value={searchText}
                  onChange={(e) => {
                    setSearchText(e.target.value);
                    setPage(0);
                  }}
                />
              </TableCell>
            </TableRow>
          </TableHead>

          <TableBody>
            {paginatedData.map((emp) => (
              <TableRow key={emp.id}>
                <TableCell>{emp.name}</TableCell>
                <TableCell>{emp.designation}</TableCell>
                <TableCell>{emp.nameHindi}</TableCell>
                <TableCell>{emp.designationHindi}</TableCell>
                <TableCell>{emp.userId}</TableCell>
                <TableCell>{emp.dutyType}</TableCell>
                <TableCell>{emp.phone}</TableCell>
                <TableCell>{emp.category}</TableCell>
                <TableCell>
                  <Button onClick={() => handleEdit(emp)}>Edit</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>

        </Table>

        <TablePagination
          component="div"
          count={processedEmployees.length}
          page={page}
          onPageChange={(e, newPage) => setPage(newPage)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => {
            setRowsPerPage(parseInt(e.target.value, 10));
            setPage(0);
          }}
          rowsPerPageOptions={[5, 10, 25]}
        />
      </TableContainer>
    </Box>
  );
}

