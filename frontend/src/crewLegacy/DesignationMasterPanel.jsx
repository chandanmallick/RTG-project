import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  Paper,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { CheckCircle2, Edit3, RefreshCw, Search, Tags } from "lucide-react";
import api from "./api";

const emptyForm = {
  id: "",
  name: "",
  nameHindi: "",
  shortName: "",
  seniorityOrder: "",
  aliases: "",
  isActive: true,
};

export default function DesignationMasterPanel({ onChanged }) {
  const [data, setData] = useState({ masters: [], unmatched: [], blankEmployees: [], stats: {} });
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [query, setQuery] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const response = await api.get("/admin/designations");
      setData(response.data || { masters: [], unmatched: [], blankEmployees: [], stats: {} });
      onChanged?.(response.data?.masters || []);
    } catch (error) {
      setNotice({ severity: "error", text: error.response?.data?.detail || "Designation master could not be loaded." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const visibleMasters = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return data.masters || [];
    return (data.masters || []).filter((item) =>
      `${item.name} ${item.nameHindi} ${item.shortName} ${(item.aliases || []).join(" ")}`
        .toLowerCase()
        .includes(needle)
    );
  }, [data.masters, query]);

  const openNew = () => {
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (item) => {
    setForm({
      id: item.id,
      name: item.name || "",
      nameHindi: item.nameHindi || "",
      shortName: item.shortName || "",
      seniorityOrder: item.seniorityOrder || "",
      aliases: (item.aliases || []).join(", "),
      isActive: item.isActive !== false,
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      setNotice({ severity: "warning", text: "Enter the designation name." });
      return;
    }
    setLoading(true);
    try {
      const payload = {
        name: form.name.trim(),
        nameHindi: form.nameHindi.trim(),
        shortName: form.shortName.trim(),
        seniorityOrder: form.seniorityOrder === "" ? null : Number(form.seniorityOrder),
        aliases: form.aliases.split(",").map((item) => item.trim()).filter(Boolean),
        isActive: form.isActive,
        reviewRequired: false,
      };
      if (form.id) await api.put(`/admin/designations/${form.id}`, payload);
      else await api.post("/admin/designations", payload);
      setDialogOpen(false);
      setForm(emptyForm);
      setNotice({ severity: "success", text: "Designation master saved." });
      await load();
    } catch (error) {
      setNotice({ severity: "error", text: error.response?.data?.detail || "Designation could not be saved." });
      setLoading(false);
    }
  };

  const masterStats = {
    total: (data.masters || []).length,
    active: (data.masters || []).filter((item) => item.isActive !== false).length,
    inactive: (data.masters || []).filter((item) => item.isActive === false).length,
    rankPending: (data.masters || []).filter((item) => !item.seniorityOrder).length,
  };

  return (
    <Paper elevation={0} sx={{ mb: 3, border: "1px solid #BFDBFE", borderRadius: 3, overflow: "hidden" }}>
      <Box sx={{ px: 2.5, py: 1.8, color: "#FFFFFF", background: "linear-gradient(105deg,#08103A 0%,#0057B7 70%,#0F6FDB 100%)" }}>
        <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems={{ md: "center" }} gap={1.5}>
          <Box>
            <Stack direction="row" alignItems="center" spacing={1}>
              <Tags size={19} />
              <Typography sx={{ fontSize: 19, fontWeight: 950 }}>Designation Master</Typography>
            </Stack>
            <Typography sx={{ mt: .35, fontSize: 11.5, opacity: .9 }}>
              Maintain designation names and their manually defined seniority order.
            </Typography>
          </Box>
          <Stack direction="row" spacing={1}>
            <Button onClick={load} disabled={loading} startIcon={<RefreshCw size={15} />} sx={{ color: "#FFFFFF", border: "1px solid rgba(255,255,255,.55)", fontWeight: 850 }}>Refresh comparison</Button>
          </Stack>
        </Stack>
      </Box>

      <Box sx={{ p: 2.5 }}>
        {notice && <Alert severity={notice.severity} onClose={() => setNotice(null)} sx={{ mb: 2 }}>{notice.text}</Alert>}

        <Grid container spacing={1.5} sx={{ mb: 2 }}>
          {[
            ["Master entries", masterStats.total, "#EFF6FF", "#0057B7"],
            ["Active", masterStats.active, "#ECFDF5", "#047857"],
            ["Inactive", masterStats.inactive, "#F8FAFC", "#475569"],
            ["Seniority pending", masterStats.rankPending, "#FFF7ED", "#C2410C"],
          ].map(([label, value, background, color]) => (
            <Grid item xs={6} md key={label}>
              <Box sx={{ p: 1.25, borderRadius: 2, background, border: "1px solid #E2E8F0" }}>
                <Typography sx={{ color: "#64748B", fontSize: 10.5, fontWeight: 800 }}>{label}</Typography>
                <Typography sx={{ mt: .15, color, fontSize: 19, fontWeight: 950 }}>{value}</Typography>
              </Box>
            </Grid>
          ))}
        </Grid>

        <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "center" }} gap={1} sx={{ mb: 1.2 }}>
          <Typography sx={{ color: "#0F172A", fontWeight: 900 }}>Prepared designation list</Typography>
          <Stack direction="row" spacing={1}>
            <TextField size="small" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search designation" InputProps={{ startAdornment: <Search size={15} style={{ marginRight: 8, color: "#64748B" }} /> }} />
            <Button variant="contained" onClick={openNew} sx={{ fontWeight: 900 }}>Add designation</Button>
          </Stack>
        </Stack>

        <TableContainer sx={{ maxHeight: 360, border: "1px solid #E2E8F0", borderRadius: 2 }}>
          <Table size="small" stickyHeader>
            <TableHead><TableRow><TableCell>Seniority</TableCell><TableCell>Designation</TableCell><TableCell>Hindi</TableCell><TableCell>Short name</TableCell><TableCell>Aliases</TableCell><TableCell>Status</TableCell><TableCell align="right">Action</TableCell></TableRow></TableHead>
            <TableBody>
              {visibleMasters.map((item) => (
                <TableRow key={item.id} hover>
                  <TableCell sx={{ fontWeight: 900, color: "#0057B7" }}>{item.seniorityOrder || "-"}</TableCell>
                  <TableCell sx={{ fontWeight: 850 }}>{item.name}</TableCell>
                  <TableCell>{item.nameHindi || <Chip size="small" label="Hindi pending" color="warning" variant="outlined" />}</TableCell>
                  <TableCell>{item.shortName || "-"}</TableCell>
                  <TableCell>{(item.aliases || []).join(", ") || "-"}</TableCell>
                  <TableCell>
                    {item.isActive !== false
                      ? <Chip size="small" icon={<CheckCircle2 size={13} />} label="Active" color="success" variant="outlined" />
                      : <Chip size="small" label="Inactive" />}
                  </TableCell>
                  <TableCell align="right"><Button size="small" onClick={() => openEdit(item)} startIcon={<Edit3 size={14} />}>Edit</Button></TableCell>
                </TableRow>
              ))}
              {!visibleMasters.length && <TableRow><TableCell colSpan={7} align="center">No designation master entries found.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 900 }}>{form.id ? "Update designation" : "Add designation"}</DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}><TextField fullWidth label="Designation (English)" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></Grid>
            <Grid item xs={12} md={6}><TextField fullWidth label="Designation (Hindi)" value={form.nameHindi} onChange={(event) => setForm((current) => ({ ...current, nameHindi: event.target.value }))} /></Grid>
            <Grid item xs={12} md={4}><TextField fullWidth label="Short name" value={form.shortName} onChange={(event) => setForm((current) => ({ ...current, shortName: event.target.value }))} /></Grid>
            <Grid item xs={12} md={4}><TextField fullWidth type="number" label="Seniority order" value={form.seniorityOrder} inputProps={{ min: 1, step: 1 }} onChange={(event) => setForm((current) => ({ ...current, seniorityOrder: event.target.value }))} helperText="1 is the highest rank" /></Grid>
            <Grid item xs={12} md={4}><TextField fullWidth label="Aliases" value={form.aliases} onChange={(event) => setForm((current) => ({ ...current, aliases: event.target.value }))} helperText="Comma-separated variants" /></Grid>
            <Grid item xs={12}><Stack direction="row" alignItems="center" spacing={1}><Switch checked={form.isActive} onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))} /><Typography sx={{ fontWeight: 800 }}>Active designation</Typography></Stack></Grid>
          </Grid>
        </DialogContent>
        <DialogActions><Button onClick={() => setDialogOpen(false)}>Cancel</Button><Button variant="contained" onClick={save} disabled={loading}>{form.id ? "Update" : "Add"}</Button></DialogActions>
      </Dialog>
    </Paper>
  );
}
