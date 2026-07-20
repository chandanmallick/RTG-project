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
  Stack,
  CircularProgress
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
  const [organizationUnits, setOrganizationUnits] = useState([]);
  const [organizationResolving, setOrganizationResolving] = useState(false);
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
    const orgRes = await api.get(`/admin/organization/units`);

    setDutyTypes(dutyRes.data);
    setCategories(catRes.data);
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

  const resolveOrganization = async (functionIds, userId, baseData = formData) => {
    try {
      setOrganizationResolving(true);
      const response = await api.post("/admin/organization/resolve-employee", {
        functionIds: normalizeListValue(functionIds),
        userId,
      });
      const resolved = response.data || {};
      const next = {
        ...baseData,
        ...resolved,
        functionIds: normalizeListValue(resolved.functionIds),
        verticals: normalizeListValue(resolved.verticals),
        reportingOfficerIds: normalizeListValue(resolved.reportingOfficerIds),
      };
      setFormData(next);
      return next;
    } finally {
      setOrganizationResolving(false);
    }
  };

  const handleFunctionsChange = async (event) => {
    const functionIds = normalizeListValue(event.target.value);
    await resolveOrganization(functionIds, formData.userId, { ...formData, functionIds });
  };

  const handleSubmit = async () => {
    const resolvedForm = await resolveOrganization(
      formData.functionIds,
      formData.userId,
      formData
    );

    if (editId) {
      await api.put(`admin/employees/${editId}`, resolvedForm);
      setEditId(null);
    } else {
      await api.post(`/admin/employees`, resolvedForm);
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

  const handleEdit = async (employee) => {
    const employeeForm = {
      ...employee,
      password: "",
      category: normalizeListValue(employee.category),
      verticals: normalizeListValue(employee.verticals || employee.vertical),
      reportingOfficerIds: normalizeListValue(
        employee.reportingOfficerIds || employee.reportingOfficerId
      ),
      functionIds: normalizeListValue(employee.functionIds)
    };
    setFormData(employeeForm);
    setEditId(employee.id);
    setFormOpen(true);
    await resolveOrganization(employeeForm.functionIds, employeeForm.userId, employeeForm);
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
              <InputLabel shrink>Function(s)</InputLabel>
              <Select
                multiple
                notched
                name="functionIds"
                value={normalizeListValue(formData.functionIds)}
                onChange={handleFunctionsChange}
                disabled={organizationResolving}
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

            <TextField
              size="small"
              label="Vertical(s)"
              fullWidth
              InputLabelProps={{ shrink: true }}
              value={normalizeListValue(formData.verticals).join(", ")}
              InputProps={{ readOnly: true }}
              helperText="Auto-fetched from Organization Master"
            />

            <TextField
              size="small"
              label="Department"
              fullWidth
              InputLabelProps={{ shrink: true }}
              value={formData.department || ""}
              InputProps={{ readOnly: true }}
              helperText="Auto-fetched from Organization Master"
            />

            <TextField
              size="small"
              label="Reporting Officer(s)"
              fullWidth
              InputLabelProps={{ shrink: true }}
              value={normalizeListValue(formData.reportingOfficerNames).join(", ")}
              InputProps={{ readOnly: true }}
              helperText="Function head(s) configured in Organization Master"
            />

            <TextField
              size="small"
              label="Intermediary Reporting"
              fullWidth
              InputLabelProps={{ shrink: true }}
              value={formData.intermediaryReportingName || ""}
              InputProps={{ readOnly: true }}
              helperText="Section/Vertical head configured in Organization Master"
            />

            <TextField
              size="small"
              label="HOD"
              fullWidth
              InputLabelProps={{ shrink: true }}
              value={formData.hodName || ""}
              InputProps={{ readOnly: true }}
              helperText="Department head configured in Organization Master"
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={closeForm}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={organizationResolving}
            startIcon={organizationResolving ? <CircularProgress size={15} color="inherit" /> : null}
          >
            {organizationResolving ? "Reading Organization Master..." : editId ? "Update Employee" : "Add Employee"}
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

