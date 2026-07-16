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
  FormControlLabel,
  FormControl,
  InputLabel,
  Select,
  OutlinedInput,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Stack
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
    category: [],

    // Organization hierarchy
    verticals: [],
    department: "",
    reportingOfficerIds: [],
    functionIds: [],
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
  const [organizationUnits, setOrganizationUnits] = useState([]);
  const [formOpen, setFormOpen] = useState(false);

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
    const orgRes = await api.get(`/admin/organization/units`);

    setDutyTypes(dutyRes.data);
    setCategories(catRes.data);
    setVerticals(verticalRes.data);
    setDepartments(deptRes.data);
    setOrganizationUnits(orgRes.data || []);
  };

  useEffect(() => {
    fetchEmployees();
    fetchDropdowns();
    fetchLeaveRule();
  }, []);

  const normalizeListValue = (value) => {
    if (Array.isArray(value)) return value.filter(Boolean);
    if (!value) return [];
    return String(value).split(",").map((item) => item.trim()).filter(Boolean);
  };

  const emptyForm = {
    name: "",
    nameHindi: "",
    designation: "",
    designationHindi: "",
    userId: "",
    password: "",
    phone: "",
    gmail: "",
    dutyType: "",
    category: [],
    verticals: [],
    department: "",
    reportingOfficerIds: [],
    functionIds: [],
    intermediaryReportingId: "",
    hodId: ""
  };

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

    setFormData(emptyForm);
    setFormOpen(false);
  };

  const openNewEmployeeForm = () => {
    setEditId(null);
    setFormData(emptyForm);
    setFormOpen(true);
  };

  const handleEdit = (employee) => {
    setFormData({
      ...employee,
      category: normalizeListValue(employee.category),
      verticals: normalizeListValue(employee.verticals || employee.vertical),
      reportingOfficerIds: normalizeListValue(
        employee.reportingOfficerIds || employee.reportingOfficerId
      ),
      functionIds: normalizeListValue(employee.functionIds)
    });
    setEditId(employee.id);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditId(null);
    setFormData(emptyForm);
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

          <Grid item>
            <Button variant="contained" color="success" onClick={openNewEmployeeForm}>
              Add Employee
            </Button>
          </Grid>

        </Grid>

      </Paper>

      <Paper sx={{ p: 2.5, mb: 4, background: "#F8FBFF", border: "1px solid #D9E6F2" }}>
        <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} alignItems={{ md: "center" }} justifyContent="space-between">
          <Box>
            <Typography sx={{ fontSize: 18, fontWeight: 800, color: "#0F172A" }}>
              Employee master form
            </Typography>
            <Typography sx={{ fontSize: 13, color: "#64748B" }}>
              Open the popup form to add or edit employee details in a two-column layout.
            </Typography>
          </Box>
          <Button variant="outlined" onClick={editId ? () => setFormOpen(true) : openNewEmployeeForm}>
            {editId ? "Continue Editing" : "Open Form"}
          </Button>
        </Stack>
      </Paper>

      <Dialog open={formOpen} onClose={closeForm} fullWidth maxWidth="lg">
        <DialogTitle sx={{ pb: 1.5 }}>
          {editId ? "Update Employee" : "Add Employee"}
        </DialogTitle>
        <DialogContent dividers sx={{ px: 3, py: 2.5 }}>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" },
              gap: 2,
            }}
          >
            <TextField size="small" label="Name" name="name" fullWidth InputLabelProps={{ shrink: true }} value={formData.name} onChange={handleChange} />
            <TextField size="small" label="Name (Hindi)" name="nameHindi" fullWidth InputLabelProps={{ shrink: true }} value={formData.nameHindi} onChange={handleChange} />
            <TextField size="small" label="Designation" name="designation" fullWidth InputLabelProps={{ shrink: true }} value={formData.designation} onChange={handleChange} />
            <TextField size="small" label="Designation (Hindi)" name="designationHindi" fullWidth InputLabelProps={{ shrink: true }} value={formData.designationHindi} onChange={handleChange} />
            <TextField size="small" label="User ID" name="userId" fullWidth InputLabelProps={{ shrink: true }} value={formData.userId} onChange={handleChange} />
            <TextField size="small" label="Password" type="password" name="password" fullWidth InputLabelProps={{ shrink: true }} value={formData.password} onChange={handleChange} />
            <TextField size="small" label="Phone" name="phone" fullWidth InputLabelProps={{ shrink: true }} value={formData.phone} onChange={handleChange} />
            <TextField size="small" label="Gmail" name="gmail" fullWidth InputLabelProps={{ shrink: true }} value={formData.gmail} onChange={handleChange} />

            <TextField size="small" select label="Type of Duty" name="dutyType" fullWidth InputLabelProps={{ shrink: true }} value={formData.dutyType} onChange={handleChange}>
              {dutyTypes.map((item) => (
                <MenuItem key={item.id} value={item.value}>
                  {item.value}
                </MenuItem>
              ))}
            </TextField>

            <FormControl size="small" fullWidth>
              <InputLabel shrink>Category</InputLabel>
              <Select
                multiple
                notched
                name="category"
                value={normalizeListValue(formData.category)}
                onChange={handleChange}
                input={<OutlinedInput label="Category" />}
                renderValue={(selected) => (
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                    {selected.map((value) => <Chip key={value} label={value} size="small" />)}
                  </Box>
                )}
              >
                {categories.map((item) => (
                  <MenuItem key={item.id} value={item.value}>
                    {item.value}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" fullWidth>
              <InputLabel shrink>Vertical(s)</InputLabel>
              <Select
                multiple
                notched
                name="verticals"
                value={normalizeListValue(formData.verticals || formData.vertical)}
                onChange={handleChange}
                input={<OutlinedInput label="Vertical(s)" />}
                renderValue={(selected) => (
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                    {selected.map((value) => <Chip key={value} label={value} size="small" />)}
                  </Box>
                )}
              >
                {verticals.map((item) => (
                  <MenuItem key={item.id} value={item.value}>{item.value}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField size="small" select label="Department" name="department" fullWidth InputLabelProps={{ shrink: true }} value={formData.department} onChange={handleChange}>
              {departments.map((item) => (
                <MenuItem key={item.id} value={item.value}>
                  {item.value}
                </MenuItem>
              ))}
            </TextField>

            <FormControl size="small" fullWidth>
              <InputLabel shrink>Function(s)</InputLabel>
              <Select
                multiple
                notched
                name="functionIds"
                value={normalizeListValue(formData.functionIds)}
                onChange={handleChange}
                input={<OutlinedInput label="Function(s)" />}
                renderValue={(selected) => (
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                    {selected.map((unitId) => {
                      const unit = organizationUnits.find((item) => item.id === unitId);
                      return <Chip key={unitId} label={unit?.name || unitId} size="small" />;
                    })}
                  </Box>
                )}
              >
                {organizationUnits
                  .filter((item) => item.unitType === "function" && item.isActive !== false)
                  .map((item) => (
                    <MenuItem key={item.id} value={item.id}>
                      {item.name}{item.parentName ? ` — ${item.parentName}` : ""}
                    </MenuItem>
                  ))}
              </Select>
            </FormControl>

            <FormControl size="small" fullWidth>
              <InputLabel shrink>Reporting Officer(s)</InputLabel>
              <Select
                multiple
                notched
                name="reportingOfficerIds"
                value={normalizeListValue(formData.reportingOfficerIds || formData.reportingOfficerId)}
                onChange={handleChange}
                input={<OutlinedInput label="Reporting Officer(s)" />}
                renderValue={(selected) => (
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                    {selected.map((employeeId) => {
                      const officer = employees.find((item) => item.userId === employeeId);
                      return <Chip key={employeeId} label={officer?.name || employeeId} size="small" />;
                    })}
                  </Box>
                )}
              >
                {employees
                  .filter((emp) => emp.userId !== formData.userId)
                  .map((emp) => (
                    <MenuItem key={emp.id} value={emp.userId}>
                      {emp.name} ({emp.userId})
                    </MenuItem>
                  ))}
              </Select>
            </FormControl>

            <TextField size="small" select label="Intermediary Reporting" name="intermediaryReportingId" fullWidth InputLabelProps={{ shrink: true }} value={formData.intermediaryReportingId || formData.intermediaryReportingName} onChange={handleChange}>
              {employees.map((emp) => (
                <MenuItem key={emp.id} value={emp.userId}>
                  {emp.name}
                </MenuItem>
              ))}
            </TextField>

            <TextField size="small" select label="HOD" name="hodId" fullWidth InputLabelProps={{ shrink: true }} value={formData.hodId || formData.hodName} onChange={handleChange}>
              {employees.map((emp) => (
                <MenuItem key={emp.id} value={emp.userId}>
                  {emp.name}
                </MenuItem>
              ))}
            </TextField>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={closeForm}>Cancel</Button>
          <Button variant="contained" onClick={handleSubmit}>
            {editId ? "Update Employee" : "Add Employee"}
          </Button>
        </DialogActions>
      </Dialog>

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
              <TableCell><strong>Vertical(s)</strong></TableCell>
              <TableCell><strong>Reporting Officer(s)</strong></TableCell>
              <TableCell><strong>Function(s)</strong></TableCell>
              <TableCell><strong>Action</strong></TableCell>
            </TableRow>

            {/* ðŸ”Ž Search Row */}
            <TableRow>
              <TableCell colSpan={12}>
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
                <TableCell>{normalizeListValue(emp.category).join(", ") || "-"}</TableCell>
                <TableCell>{normalizeListValue(emp.verticals || emp.vertical).join(", ") || "-"}</TableCell>
                <TableCell>{normalizeListValue(emp.reportingOfficerNames || emp.reportingOfficerName).join(", ") || "-"}</TableCell>
                <TableCell>{normalizeListValue(emp.functionNames).join(", ") || "-"}</TableCell>
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

