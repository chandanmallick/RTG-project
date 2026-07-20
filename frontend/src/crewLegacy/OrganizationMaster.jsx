import { useEffect, useMemo, useState } from "react";
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControl, InputLabel, MenuItem, OutlinedInput, Paper, Select, Stack,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField,
  Typography,
} from "@mui/material";
import { Network, Plus, Trash2 } from "lucide-react";
import api from "./api";

const EMPTY = {
  name: "",
  unitType: "department",
  parentId: "",
  reportingMode: "either",
  headEmployeeIds: [],
  juniorEmployeeIds: [],
  isActive: true,
};

const TYPE_LABELS = {
  department: "Department",
  vertical: "Vertical",
  section: "Section",
  function: "Function",
};

export default function OrganizationMaster() {
  const [units, setUnits] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState(null);

  const load = async () => {
    try {
      const [unitResponse, employeeResponse] = await Promise.all([
        api.get("/admin/organization/units"),
        api.get("/admin/employees"),
      ]);
      setUnits(unitResponse.data || []);
      setEmployees(employeeResponse.data || []);
    } catch (error) {
      setNotice({ severity: "error", text: error?.response?.data?.detail || "Organization master could not be loaded." });
    }
  };

  useEffect(() => { load(); }, []);

  const allowedParents = useMemo(() => {
    if (form.unitType === "vertical") {
      return units.filter((unit) => unit.unitType === "department" && unit.id !== editId);
    }
    if (form.unitType === "section") {
      return units.filter((unit) => unit.unitType === "vertical" && unit.id !== editId);
    }
    if (form.unitType === "function") {
      if (form.reportingMode === "vertical") {
        return units.filter((unit) => unit.unitType === "vertical" && unit.id !== editId);
      }
      if (form.reportingMode === "section") {
        return units.filter((unit) => unit.unitType === "section" && unit.id !== editId);
      }
      return units.filter((unit) => ["vertical", "section"].includes(unit.unitType) && unit.id !== editId);
    }
    return [];
  }, [units, form.unitType, form.reportingMode, editId]);

  const inferFunctionReportingMode = (parentId) => {
    const parent = units.find((unit) => unit.id === parentId);
    if (!parent) return "either";
    if (parent.unitType === "vertical") return "vertical";
    if (parent.unitType === "section") return "section";
    return "either";
  };

  const openNew = () => {
    setForm(EMPTY);
    setEditId(null);
    setOpen(true);
  };

  const openEdit = (unit) => {
    setForm({
      name: unit.name || "",
      unitType: unit.unitType || "department",
      parentId: unit.parentId || "",
      reportingMode: unit.unitType === "function" ? inferFunctionReportingMode(unit.parentId) : "either",
      headEmployeeIds: unit.headEmployeeIds || [],
      juniorEmployeeIds: unit.juniorEmployeeIds || [],
      isActive: unit.isActive !== false,
    });
    setEditId(unit.id);
    setOpen(true);
  };

  const changeType = (event) => {
    const unitType = event.target.value;
    setForm((current) => ({
      ...current,
      unitType,
      parentId: "",
      reportingMode: "either",
      juniorEmployeeIds: unitType === "function" ? current.juniorEmployeeIds : [],
    }));
  };

  const save = async () => {
    try {
      if (editId) await api.put(`/admin/organization/units/${editId}`, form);
      else await api.post("/admin/organization/units", form);
      setNotice({ severity: "success", text: `Organization unit ${editId ? "updated" : "created"}.` });
      setOpen(false);
      await load();
    } catch (error) {
      setNotice({ severity: "error", text: error?.response?.data?.detail || "Organization unit could not be saved." });
    }
  };

  const remove = async (unit) => {
    if (!window.confirm(`Delete ${unit.name}?`)) return;
    try {
      await api.delete(`/admin/organization/units/${unit.id}`);
      setNotice({ severity: "success", text: "Organization unit deleted." });
      await load();
    } catch (error) {
      setNotice({ severity: "error", text: error?.response?.data?.detail || "Organization unit could not be deleted." });
    }
  };

  const employeeSelect = (label, field) => (
    <FormControl size="small" fullWidth>
      <InputLabel shrink>{label}</InputLabel>
      <Select
        multiple
        notched
        value={form[field] || []}
        onChange={(event) => setForm((current) => ({ ...current, [field]: event.target.value }))}
        input={<OutlinedInput label={label} />}
        renderValue={(selected) => (
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
            {selected.map((id) => {
              const employee = employees.find((item) => item.userId === id);
              return <Chip key={id} label={employee?.name || id} size="small" />;
            })}
          </Box>
        )}
      >
        {employees.map((employee) => (
          <MenuItem key={employee.id} value={employee.userId}>
            {employee.name} ({employee.userId})
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );

  return (
    <Box sx={{ width: "100%", p: { xs: 1.5, md: 2.5 } }}>
      <Paper elevation={0} sx={{ p: 2.5, mb: 2, borderRadius: 3, color: "white", background: "linear-gradient(110deg,#071F5A,#0057B7 65%,#1676DE)" }}>
        <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "center" }} spacing={2}>
          <Box>
            <Stack direction="row" spacing={1} alignItems="center">
              <Network size={22} />
              <Typography variant="h5" sx={{ fontWeight: 900 }}>Organization Hierarchy Master</Typography>
            </Stack>
            <Typography sx={{ mt: 0.5, fontSize: 12.5, opacity: 0.88 }}>
              Department → Vertical/Section → Function → Employee
            </Typography>
          </Box>
          <Button variant="contained" startIcon={<Plus size={16} />} onClick={openNew} sx={{ bgcolor: "white", color: "#0057B7" }}>
            Add organization unit
          </Button>
        </Stack>
      </Paper>

      {notice && <Alert severity={notice.severity} onClose={() => setNotice(null)} sx={{ mb: 2 }}>{notice.text}</Alert>}

      <TableContainer component={Paper} elevation={0} sx={{ border: "1px solid #CFE0F5", borderRadius: 3 }}>
        <Table size="small">
          <TableHead><TableRow sx={{ bgcolor: "#EAF2FF" }}>
            <TableCell><strong>Type</strong></TableCell><TableCell><strong>Name</strong></TableCell>
            <TableCell><strong>Reports under</strong></TableCell><TableCell><strong>Head(s)</strong></TableCell>
            <TableCell><strong>Function Junior(s)</strong></TableCell><TableCell align="right"><strong>Action</strong></TableCell>
          </TableRow></TableHead>
          <TableBody>
            {units.map((unit) => <TableRow key={unit.id} hover>
              <TableCell><Chip label={TYPE_LABELS[unit.unitType] || unit.unitType} size="small" color={unit.unitType === "department" ? "primary" : "default"} /></TableCell>
              <TableCell sx={{ fontWeight: 800 }}>{unit.name}</TableCell>
              <TableCell>{unit.parentName || "Top level"}</TableCell>
              <TableCell>{(unit.headEmployeeNames || []).join(", ") || "-"}</TableCell>
              <TableCell>{(unit.juniorEmployeeNames || []).join(", ") || "-"}</TableCell>
              <TableCell align="right">
                <Button size="small" onClick={() => openEdit(unit)}>Edit</Button>
                <Button size="small" color="error" startIcon={<Trash2 size={14} />} onClick={() => remove(unit)}>Delete</Button>
              </TableCell>
            </TableRow>)}
            {!units.length && <TableRow><TableCell colSpan={6} align="center" sx={{ py: 5, color: "text.secondary" }}>Create the first Department to start the hierarchy.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>{editId ? "Update" : "Add"} organization unit</DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2, pt: 1 }}>
            <TextField size="small" label="Unit name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} fullWidth />
            <TextField size="small" select label="Unit type" value={form.unitType} onChange={changeType} fullWidth>
              {Object.entries(TYPE_LABELS).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
            </TextField>
            {form.unitType === "function" && (
              <TextField
                size="small"
                select
                label="Function reporting route"
                value={form.reportingMode}
                onChange={(event) => setForm((current) => ({ ...current, reportingMode: event.target.value, parentId: "" }))}
                fullWidth
                helperText="Choose whether this function reports directly to a Vertical or through a Section."
              >
                <MenuItem value="either">Either Vertical or Section</MenuItem>
                <MenuItem value="vertical">Direct to Vertical</MenuItem>
                <MenuItem value="section">Through Section</MenuItem>
              </TextField>
            )}
            {form.unitType !== "department" && (
              <TextField
                size="small"
                select
                label={form.unitType === "function" ? "Reports under" : "Reports under Vertical"}
                value={form.parentId}
                onChange={(event) => setForm((current) => ({ ...current, parentId: event.target.value }))}
                fullWidth
                helperText={
                  form.unitType === "function"
                    ? "Pick the exact Vertical or Section this function should report to."
                    : "Pick the Vertical this section should report to."
                }
              >
                {allowedParents.map((unit) => <MenuItem key={unit.id} value={unit.id}>{unit.name} ({TYPE_LABELS[unit.unitType]})</MenuItem>)}
              </TextField>
            )}
            {employeeSelect(`${TYPE_LABELS[form.unitType]} Head(s)`, "headEmployeeIds")}
            {form.unitType === "function" && employeeSelect("Function Junior(s)", "juniorEmployeeIds")}
          </Box>
        </DialogContent>
        <DialogActions><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="contained" onClick={save}>Save mapping</Button></DialogActions>
      </Dialog>
    </Box>
  );
}
