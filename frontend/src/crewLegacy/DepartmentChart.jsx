import { useEffect, useState } from "react";
import { Building2, RefreshCw, Users } from "lucide-react";
import { OrganizationChart } from "primereact/organizationchart";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import api, { BASE_URL } from "./api";

import "primereact/resources/themes/lara-light-indigo/theme.css";
import "primereact/resources/primereact.min.css";
import "primeicons/primeicons.css";

const photoUrl = (value) => {
  if (!value) return "/default-avatar.png";
  if (/^(https?:|data:|blob:)/i.test(value)) return value;
  return `${BASE_URL}${value.startsWith("/") ? "" : "/"}${value}`;
};

export default function DepartmentChart() {
  const [data, setData] = useState([]);
  const [verticals, setVerticals] = useState([]);
  const [selectedVertical, setSelectedVertical] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchOrg = async (vertical = selectedVertical) => {
    setLoading(true);
    setError("");
    try {
      const [hierarchyResponse, unitResponse] = await Promise.all([
        api.get("/admin/organization/tree"),
        api.get("/admin/organization/units"),
      ]);

      const formatTree = (nodes) => (nodes || [])
        .filter((node) => node && node.data)
        .map((node) => ({
          ...node,
          expanded: node.expanded ?? true,
          data: {
            ...node.data,
            image: node.type === "person" ? photoUrl(node.data.image) : node.data.image,
          },
          children: formatTree(node.children),
        }));

      if ((hierarchyResponse.data || []).length) {
        const roots = vertical
          ? hierarchyResponse.data.filter((node) => node.data?.id === vertical)
          : hierarchyResponse.data;
        setData(formatTree(roots));
        setVerticals((unitResponse.data || [])
          .filter((item) => item.unitType === "department")
          .map((item) => ({ id: item.id, value: item.name })));
      } else {
        const params = vertical ? { vertical } : {};
        const [legacyTree, legacyVerticals] = await Promise.all([
          api.get("/roster/employees/org-tree", { params }),
          api.get("/admin/dropdown/vertical"),
        ]);
        setData(formatTree(legacyTree.data));
        setVerticals((legacyVerticals.data || []).map((item) => ({ ...item, id: item.value })));
      }
    } catch (requestError) {
      setData([]);
      setError(requestError?.response?.data?.detail || "Organizational chart could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrg("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleVerticalChange = (event) => {
    const value = event.target.value;
    setSelectedVertical(value);
    fetchOrg(value);
  };

  const nodeTemplate = (node) => {
    if (node.type === "unit") {
      const typeLabel = node.data.unitType === "vertical" ? "Vertical" : `${node.data.unitType?.[0]?.toUpperCase() || ""}${node.data.unitType?.slice(1) || ""}`;
      return (
        <Box sx={{ minWidth: 230, maxWidth: 280, px: 2, py: 1.5, textAlign: "left" }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Building2 size={17} color="#0057B7" />
            <Box>
              <Typography sx={{ fontWeight: 900, fontSize: 13, color: "#0F172A" }}>{node.data.name}</Typography>
              <Typography sx={{ fontSize: 9.5, fontWeight: 800, color: "#0057B7", textTransform: "uppercase" }}>{typeLabel}</Typography>
            </Box>
          </Stack>
          {!!node.data.heads?.length && <Typography sx={{ mt: 1, fontSize: 10.5, color: "#334155" }}><strong>{typeLabel} Head:</strong> {node.data.heads.map((item) => item.name).join(", ")}</Typography>}
          {!!node.data.juniors?.length && <Typography sx={{ mt: 0.4, fontSize: 10.5, color: "#475569" }}><strong>Function Junior:</strong> {node.data.juniors.map((item) => item.name).join(", ")}</Typography>}
        </Box>
      );
    }

    if (node.type === "vertical") {
      return (
        <Box sx={{ minWidth: 220, px: 2.5, py: 1.5, color: "white" }}>
          <Stack direction="row" spacing={1} alignItems="center" justifyContent="center">
            <Building2 size={18} />
            <Typography sx={{ fontWeight: 900, fontSize: 15 }}>{node.data.name}</Typography>
          </Stack>
          <Typography sx={{ mt: 0.35, fontSize: 11, opacity: 0.85 }}>{node.data.title}</Typography>
        </Box>
      );
    }

    return (
      <Box sx={{ minWidth: 190, maxWidth: 230, px: 1.5, py: 1.25 }}>
        <Stack direction="row" spacing={1.25} alignItems="center" textAlign="left">
          <Box
            component="img"
            alt={node.data.name}
            src={node.data.image}
            onError={(event) => { event.currentTarget.src = "/default-avatar.png"; }}
            sx={{ width: 46, height: 46, borderRadius: "50%", objectFit: "cover", border: "2px solid #D9E8FF" }}
          />
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontWeight: 900, fontSize: 12.5, color: "#0F172A", lineHeight: 1.25 }}>
              {node.data.name}
            </Typography>
            <Typography sx={{ mt: 0.25, fontSize: 10.5, color: "#475569", lineHeight: 1.25 }}>
              {node.data.title || "Designation not set"}
            </Typography>
            <Chip
              label={node.data.role || node.data.department || "General"}
              size="small"
              sx={{ mt: 0.75, height: 20, bgcolor: "#EAF2FF", color: "#0057B7", fontSize: 9, fontWeight: 800 }}
            />
          </Box>
        </Stack>
      </Box>
    );
  };

  return (
    <Box sx={{ width: "100%", p: { xs: 1.5, md: 2.5 } }}>
      <Paper
        elevation={0}
        sx={{
          p: { xs: 2, md: 2.5 },
          mb: 2,
          borderRadius: 3,
          color: "white",
          background: "linear-gradient(110deg, #071F5A 0%, #0057B7 62%, #1676DE 100%)",
        }}
      >
        <Stack direction={{ xs: "column", md: "row" }} spacing={2} justifyContent="space-between" alignItems={{ md: "center" }}>
          <Box>
            <Stack direction="row" spacing={1} alignItems="center">
              <Users size={22} />
              <Typography variant="h5" sx={{ fontWeight: 900 }}>Departmental Organizational Chart</Typography>
            </Stack>
            <Typography sx={{ mt: 0.5, fontSize: 12.5, opacity: 0.88 }}>
              Department → Vertical/Section → Function → attached employees, with mapped unit heads.
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} sx={{ minWidth: { md: 370 } }}>
            <TextField
              select
              fullWidth
              size="small"
              label="Department / Vertical"
              value={selectedVertical}
              onChange={handleVerticalChange}
              sx={{ bgcolor: "white", borderRadius: 1 }}
            >
              <MenuItem value="">All branches</MenuItem>
              {verticals.map((item) => <MenuItem key={item.id} value={item.id || item.value}>{item.value}</MenuItem>)}
            </TextField>
            <Button
              variant="outlined"
              onClick={() => fetchOrg()}
              startIcon={<RefreshCw size={16} />}
              sx={{ color: "white", borderColor: "rgba(255,255,255,.65)", whiteSpace: "nowrap" }}
            >
              Refresh
            </Button>
          </Stack>
        </Stack>
      </Paper>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Paper elevation={0} sx={{ minHeight: 460, p: 2, border: "1px solid #CFE0F5", borderRadius: 3, overflow: "auto" }}>
        {loading ? (
          <Box sx={{ minHeight: 420, display: "grid", placeItems: "center" }}><CircularProgress /></Box>
        ) : data.length ? (
          <Box
            sx={{
              minWidth: "max-content",
              "& .p-organizationchart-table": { margin: "0 auto" },
              "& .p-organizationchart-node-content": { p: 0, border: "1px solid #CFE0F5", borderRadius: 2, overflow: "hidden", boxShadow: "0 6px 18px rgba(15,23,42,.08)" },
              "& .p-organizationchart-node-content:has(.lucide-building-2)": { bgcolor: "#0057B7", borderColor: "#0057B7" },
              "& .p-organizationchart-line-down": { bgcolor: "#8AAFE0" },
              "& .p-organizationchart-line-left": { borderRightColor: "#8AAFE0" },
              "& .p-organizationchart-line-top": { borderTopColor: "#8AAFE0" },
            }}
          >
            <OrganizationChart value={data} nodeTemplate={nodeTemplate} />
          </Box>
        ) : (
          <Box sx={{ minHeight: 420, display: "grid", placeItems: "center", color: "#64748B" }}>
            No organization mapping is available for this branch.
          </Box>
        )}
      </Paper>
    </Box>
  );
}
