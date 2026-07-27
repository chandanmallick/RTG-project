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

const EMPTY_SHIFT_MAPPING = {
  groupName: "",
  organizationUnitId: "",
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
  const [shiftGroups, setShiftGroups] = useState([]);
  const [shiftTargets, setShiftTargets] = useState([]);
  const [shiftMappings, setShiftMappings] = useState([]);
  const [shiftMapping, setShiftMapping] = useState(EMPTY_SHIFT_MAPPING);
  const [shiftOpen, setShiftOpen] = useState(false);
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
      try {
        const mappingResponse = await api.get("/admin/organization/shift-groups");
        setShiftGroups(mappingResponse.data?.activeGroups || []);
        setShiftTargets(mappingResponse.data?.organizationUnits || []);
        setShiftMappings(mappingResponse.data?.mappings || []);
      } catch {
        // Shift-group mapping is optional and must never prevent the existing
        // organization-unit and employee options from loading.
        setShiftGroups([]);
        setShiftTargets([]);
        setShiftMappings([]);
      }
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

  const openShiftMapping = (mapping = null) => {
    setShiftMapping(mapping ? {
      groupName: mapping.groupName || "",
      organizationUnitId: mapping.organizationUnitId || "",
    } : EMPTY_SHIFT_MAPPING);
    setShiftOpen(true);
  };

  const saveShiftMapping = async () => {
    try {
      await api.post("/admin/organization/shift-groups/attach", shiftMapping);
      setNotice({ severity: "success", text: "Shift-group reporting unit updated." });
      setShiftOpen(false);
      await load();
    } catch (error) {
      setNotice({ severity: "error", text: error?.response?.data?.detail || "Shift group could not be attached." });
    }
  };

  const removeShiftMapping = async (mapping) => {
    if (!window.confirm(`Detach ${mapping.groupName} from ${mapping.organizationUnitName}?`)) return;
    try {
      await api.delete(`/admin/organization/shift-groups/${mapping.id}`);
      setNotice({ severity: "success", text: "Shift group detached." });
      await load();
    } catch (error) {
      setNotice({ severity: "error", text: error?.response?.data?.detail || "Shift group could not be detached." });
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
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Button variant="contained" startIcon={<Network size={16} />} onClick={() => openShiftMapping()} sx={{ bgcolor: "#E8F5F1", color: "#03624C" }}>
              Attach shift group
            </Button>
            <Button variant="contained" startIcon={<Plus size={16} />} onClick={openNew} sx={{ bgcolor: "white", color: "#0057B7" }}>
              Add organization unit
            </Button>
          </Stack>
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

      <Paper elevation={0} sx={{ mt: 2, border: "1px solid #BFE6DB", borderRadius: 3, overflow: "hidden" }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ px: 2, py: 1.5, bgcolor: "#E8F5F1" }}>
          <Box>
            <Typography sx={{ fontWeight: 900, color: "#03624C" }}>Shift-group reporting</Typography>
            <Typography sx={{ fontSize: 12, color: "#475569" }}>Each active shift group reports to one Department, Vertical, Section or Function—not to an employee or unit head.</Typography>
          </Box>
          <Button variant="contained" size="small" onClick={() => openShiftMapping()} sx={{ bgcolor: "#03624C" }}>Attach shift group</Button>
        </Stack>
        <Table size="small">
          <TableHead><TableRow>
            <TableCell><strong>Shift group</strong></TableCell>
            <TableCell><strong>Reports to organization unit</strong></TableCell>
            <TableCell><strong>Unit type</strong></TableCell>
            <TableCell align="right"><strong>Action</strong></TableCell>
          </TableRow></TableHead>
          <TableBody>
            {shiftMappings.map((mapping) => (
              <TableRow key={mapping.id} hover>
                <TableCell sx={{ fontWeight: 900 }}>{mapping.groupName}</TableCell>
                <TableCell>{mapping.organizationUnitName || "-"}</TableCell>
                <TableCell><Chip size="small" label={TYPE_LABELS[mapping.organizationUnitType] || mapping.organizationUnitType || "-"} /></TableCell>
                <TableCell align="right">
                  <Button size="small" onClick={() => openShiftMapping(mapping)}>Change</Button>
                  <Button size="small" color="error" onClick={() => removeShiftMapping(mapping)}>Detach</Button>
                </TableCell>
              </TableRow>
            ))}
            {!shiftMappings.length && (
              <TableRow><TableCell colSpan={4} align="center" sx={{ py: 3, color: "#64748B" }}>No shift group is attached to the organization hierarchy.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Paper>

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

      <Dialog open={shiftOpen} onClose={() => setShiftOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Attach shift group to organization</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              select
              size="small"
              label="Active shift group"
              value={shiftMapping.groupName}
              onChange={(event) => setShiftMapping((current) => ({ ...current, groupName: event.target.value }))}
              fullWidth
            >
              {shiftGroups.map((name) => <MenuItem key={name} value={name}>{name}</MenuItem>)}
            </TextField>
            <TextField
              select
              size="small"
              label="Reports to"
              value={shiftMapping.organizationUnitId}
              onChange={(event) => setShiftMapping((current) => ({ ...current, organizationUnitId: event.target.value }))}
              helperText="Select a Department, Vertical, Section or Function. Its configured heads become the approval hierarchy."
              fullWidth
            >
              {shiftTargets.map((unit) => (
                <MenuItem key={unit.id} value={unit.id}>{unit.name} ({TYPE_LABELS[unit.unitType]})</MenuItem>
              ))}
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShiftOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={!shiftMapping.groupName || !shiftMapping.organizationUnitId}
            onClick={saveShiftMapping}
          >
            Save reporting mapping
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
