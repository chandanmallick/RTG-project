import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Alert, Autocomplete, Box, Button, Checkbox, Chip, CircularProgress, InputAdornment, Paper, Stack, TextField, Typography } from "@mui/material";
import { Copy, Save, Search, ShieldCheck, Users } from "lucide-react";
import AppShell from "../components/layout/AppShell";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("portalToken") || ""}` });

export default function UserAccessControl() {
  const [data, setData] = useState({ pages: [], users: [] });
  const [selectedId, setSelectedId] = useState("50041");
  const [draft, setDraft] = useState({});
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [copySourceId, setCopySourceId] = useState("");
  const [copiedFrom, setCopiedFrom] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data: payload } = await axios.get(`${BASE_URL}/crew/auth/admin/access`, { headers: authHeaders() });
      setData(payload);
      const first = payload.users.find((item) => item.userId === selectedId) || payload.users[0];
      if (first) {
        setSelectedId(first.userId);
        setDraft(first.permissions || {});
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const selected = data.users.find((item) => item.userId === selectedId);
  const filteredUsers = useMemo(
    () => data.users.filter((item) => `${item.userId} ${item.name || ""} ${item.designation || ""}`.toLowerCase().includes(query.toLowerCase())),
    [data.users, query],
  );
  const copySource = data.users.find((item) => item.userId === copySourceId) || null;
  const copyOptions = useMemo(
    () => data.users.filter((item) => item.userId !== selectedId),
    [data.users, selectedId],
  );

  const chooseUser = (item) => {
    setSelectedId(item.userId);
    setDraft(item.permissions || {});
    setMessage("");
    setCopySourceId("");
    setCopiedFrom(null);
  };

  const copyAccess = () => {
    if (!copySource || selectedId === "50041") return;
    const permissions = Object.fromEntries(
      data.pages.map((page) => {
        const sourceAccess = copySource.permissions?.[page.key] || {};
        const write = Boolean(sourceAccess.write);
        return [page.key, { view: Boolean(sourceAccess.view) || write, write }];
      }),
    );
    setDraft(permissions);
    setCopiedFrom(copySource);
    setMessage("");
  };

  const toggle = (key, field) => {
    if (selectedId === "50041") return;
    setDraft((current) => {
      const next = { ...(current[key] || { view: false, write: false }) };
      next[field] = !next[field];
      if (field === "write" && next.write) next.view = true;
      if (field === "view" && !next.view) next.write = false;
      return { ...current, [key]: next };
    });
  };

  const save = async () => {
    setSaving(true);
    setMessage("");
    try {
      const { data: saved } = await axios.put(`${BASE_URL}/crew/auth/admin/access/${selectedId}`, { permissions: draft }, { headers: authHeaders() });
      setDraft(saved.permissions);
      setData((current) => ({
        ...current,
        users: current.users.map((item) => (item.userId === selectedId ? { ...item, permissions: saved.permissions } : item)),
      }));
      setMessage(`Access updated for ${selected?.name || selectedId}.`);
      setCopiedFrom(null);
      setCopySourceId("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell>
      <Box className="ui-kit-page" sx={{ display: "grid", gap: 2.5 }}>
        <Paper sx={{ p: 3, display: "flex", alignItems: "center", gap: 2 }}>
          <Box sx={{ width: 46, height: 46, borderRadius: 2, display: "grid", placeItems: "center", color: "#0057B7", background: "#E8F1FB" }}>
            <ShieldCheck size={24} />
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h5" sx={{ fontWeight: 800 }}>User Access Control</Typography>
            <Typography sx={{ color: "#64748B", fontSize: 13 }}>Assign page-level View and Write permissions, or copy one user's rights into another user's draft to move faster.</Typography>
          </Box>
          <Chip label="50041 - Full administrator" color="success" variant="outlined" />
        </Paper>

        {message && <Alert severity="success">{message}</Alert>}

        {loading ? (
          <Box sx={{ display: "grid", placeItems: "center", p: 8 }}>
            <CircularProgress sx={{ color: "#0057B7" }} />
          </Box>
        ) : (
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "310px minmax(0,1fr)" }, gap: 2.5 }}>
            <Paper sx={{ p: 2, maxHeight: "70vh", overflow: "auto" }}>
              <TextField
                size="small"
                fullWidth
                label="Search user"
                placeholder="Name, user ID or designation"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                InputProps={{ startAdornment: <InputAdornment position="start"><Search size={16} /></InputAdornment> }}
              />
              <Typography sx={{ mt: 1, px: 0.5, color: "#64748B", fontSize: 11, fontWeight: 700 }}>
                {filteredUsers.length} of {data.users.length} users
              </Typography>
              <Stack spacing={0.7} mt={1.5}>
                {filteredUsers.map((item) => (
                  <Button
                    key={item.userId}
                    onClick={() => chooseUser(item)}
                    sx={{
                      justifyContent: "flex-start",
                      textAlign: "left",
                      p: 1.2,
                      color: "#0F172A",
                      background: item.userId === selectedId ? "#E8F1FB" : "transparent",
                    }}
                    startIcon={<Users size={17} />}
                  >
                    <Box>
                      <Typography sx={{ fontSize: 13, fontWeight: 800 }}>{item.name || item.userId}</Typography>
                    <Typography sx={{ fontSize: 11, color: "#64748B" }}>{item.userId} - {item.designation || "Employee"}</Typography>
                    </Box>
                  </Button>
                ))}
                {filteredUsers.length === 0 && (
                  <Box sx={{ py: 4, px: 1, textAlign: "center", color: "#94A3B8", fontSize: 12 }}>
                    No user matches "{query}".
                  </Box>
                )}
              </Stack>
            </Paper>

            <Paper sx={{ overflow: "hidden" }}>
              <Box
                sx={{
                  p: 2.5,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 2,
                  borderBottom: "1px solid #E2E8F0",
                }}
              >
                <Box>
                  <Typography sx={{ fontWeight: 800 }}>{selected?.name || selectedId}</Typography>
                  <Typography sx={{ color: "#64748B", fontSize: 12 }}>User ID {selectedId}</Typography>
                </Box>
                <Button variant="contained" startIcon={<Save size={16} />} onClick={save} disabled={saving || selectedId === "50041"}>
                  {saving ? "Saving…" : "Save access"}
                </Button>
              </Box>

              {selectedId === "50041" && (
                <Alert severity="info" sx={{ borderRadius: 0 }}>
                  The initial administrator always retains View and Write access to every page.
                </Alert>
              )}

              {selectedId !== "50041" && (
                <Box sx={{ p: 2, display: "grid", gridTemplateColumns: { xs: "1fr", md: "minmax(260px, 1fr) auto" }, gap: 1.2, alignItems: "center", borderBottom: "1px solid #E2E8F0", background: "#F8FAFC" }}>
                  <Autocomplete
                    size="small"
                    options={copyOptions}
                    value={copySource}
                    onChange={(_, value) => {
                      setCopySourceId(value?.userId || "");
                      setCopiedFrom(null);
                    }}
                    getOptionLabel={(option) => `${option.name || "Unnamed user"} (${option.userId})`}
                    isOptionEqualToValue={(option, value) => option.userId === value.userId}
                    renderOption={(props, option) => (
                      <Box component="li" {...props} key={option.userId} sx={{ display: "flex", flexDirection: "column", alignItems: "flex-start !important" }}>
                        <Typography sx={{ fontSize: 13, fontWeight: 800 }}>{option.name || option.userId}</Typography>
                        <Typography sx={{ fontSize: 11, color: "#64748B" }}>{option.userId} · {option.designation || "Employee"}</Typography>
                      </Box>
                    )}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Copy rights from user"
                        placeholder="Search source user"
                        InputProps={{
                          ...params.InputProps,
                          startAdornment: (
                            <>
                              <InputAdornment position="start">
                                <Search size={15} />
                              </InputAdornment>
                              {params.InputProps?.startAdornment}
                            </>
                          ),
                        }}
                      />
                    )}
                  />
                  <Button variant="outlined" startIcon={<Copy size={16} />} onClick={copyAccess} disabled={!copySource} sx={{ minHeight: 40, whiteSpace: "nowrap" }}>
                    Copy rights
                  </Button>
                </Box>
              )}

              {copiedFrom && (
                <Alert severity="info" sx={{ borderRadius: 0 }}>
                  Rights from <strong>{copiedFrom.name || copiedFrom.userId} ({copiedFrom.userId})</strong> have been copied into this draft. Review the View/Write selections, then click <strong>Save access</strong> to apply them to {selected?.name || selectedId}.
                </Alert>
              )}

              <Box sx={{ overflow: "auto", maxHeight: "62vh" }}>
                <table className="table theme-table mb-0">
                  <thead>
                    <tr>
                      <th>Page / Module</th>
                      <th style={{ width: 110, textAlign: "center" }}>View</th>
                      <th style={{ width: 110, textAlign: "center" }}>Write</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.pages.map((page) => {
                      const access = draft[page.key] || {};
                      return (
                        <tr key={page.key}>
                          <td>
                            <Typography sx={{ fontSize: 13, fontWeight: 700 }}>{page.label}</Typography>
                            <Typography sx={{ fontSize: 11, color: "#94A3B8" }}>{page.path}</Typography>
                          </td>
                          <td style={{ textAlign: "center" }}>
                            <Checkbox checked={Boolean(access.view)} disabled={selectedId === "50041"} onChange={() => toggle(page.key, "view")} />
                          </td>
                          <td style={{ textAlign: "center" }}>
                            <Checkbox checked={Boolean(access.write)} disabled={selectedId === "50041"} onChange={() => toggle(page.key, "write")} color="success" />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Box>
            </Paper>
          </Box>
        )}
      </Box>
    </AppShell>
  );
}
