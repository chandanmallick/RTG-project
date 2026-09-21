import { useEffect, useState } from "react";
import axios from "axios";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Paper,
  Stack,
  Switch,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { DatabaseZap, ExternalLink, KeyRound, Link2, LockKeyhole, Mail, Save, ShieldCheck, Unlink } from "lucide-react";
import AppShell from "../components/layout/AppShell";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";
const headers = () => ({ Authorization: `Bearer ${localStorage.getItem("portalToken") || ""}` });

export default function MailSettings() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [credentials, setCredentials] = useState({ tenantId: "", clientId: "", clientSecret: "" });
  const [crmsCredentials, setCrmsCredentials] = useState({ username: "", password: "" });
  const [crmsSaving, setCrmsSaving] = useState(false);
  const [normativeDcCredentials, setNormativeDcCredentials] = useState({ username: "", password: "" });
  const [normativeDcSaving, setNormativeDcSaving] = useState(false);
  const [settingsTab, setSettingsTab] = useState(0);
  const [reportInbox, setReportInbox] = useState({ enabled: false, mailbox: "", tenantId: "", clientId: "", clientSecret: "", authMode: "delegated" });
  const [reportInboxSaving, setReportInboxSaving] = useState(false);
  const [deviceFlow, setDeviceFlow] = useState(null);
  const [delegatedStarting, setDelegatedStarting] = useState(false);
  const reportSecretIsId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reportInbox.clientSecret.trim());

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await axios.get(`${BASE_URL}/crew/admin/mail-settings`, { headers: headers() });
      setSettings(data);
      setReportInbox({
        enabled: Boolean(data.plantReportInbox?.enabled),
        mailbox: data.plantReportInbox?.mailbox || "",
        tenantId: "",
        clientId: "",
        clientSecret: "",
        authMode: data.plantReportInbox?.authMode || "delegated",
      });
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Mail settings could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!deviceFlow?.deviceCode || deviceFlow.status !== "pending") return undefined;
    let cancelled = false;
    let timer;
    const poll = async () => {
      try {
        const { data } = await axios.post(
          `${BASE_URL}/crew/admin/mail-settings/plant-report-inbox/delegated/poll`,
          { deviceCode: deviceFlow.deviceCode },
          { headers: headers() },
        );
        if (cancelled) return;
        if (data.status === "connected") {
          setSettings((current) => ({ ...current, plantReportInbox: data.plantReportInbox }));
          setReportInbox((current) => ({ ...current, enabled: true, mailbox: data.mailbox, authMode: "delegated" }));
          setDeviceFlow((current) => ({ ...current, status: "connected", mailbox: data.mailbox }));
          setMessage(data.message || "Microsoft mailbox connected.");
          return;
        }
        timer = window.setTimeout(poll, (data.slowDown ? 10 : deviceFlow.interval || 5) * 1000);
      } catch (requestError) {
        if (cancelled) return;
        setDeviceFlow((current) => ({ ...current, status: "error" }));
        setError(requestError.response?.data?.detail || "Microsoft mailbox connection failed.");
      }
    };
    timer = window.setTimeout(poll, (deviceFlow.interval || 5) * 1000);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [deviceFlow?.deviceCode, deviceFlow?.status]);

  const update = (field, value) => setSettings((current) => ({ ...current, [field]: value }));
  const updateTwoFactorMode = async (mode) => {
    const previous = settings?.twoFactor;
    setSettings((current) => ({
      ...current,
      twoFactor: { ...(current.twoFactor || {}), mode, configuredMode: mode },
    }));
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const { data } = await axios.put(
        `${BASE_URL}/crew/admin/mail-settings/two-factor`,
        { mode },
        { headers: headers() },
      );
      setSettings((current) => ({ ...current, twoFactor: data.twoFactor }));
      setMessage(data.message || "Two-factor authentication mode saved.");
    } catch (requestError) {
      setSettings((current) => ({ ...current, twoFactor: previous }));
      setError(requestError.response?.data?.detail || "Two-factor authentication mode could not be saved.");
    } finally {
      setSaving(false);
    }
  };
  const updateCredential = (field, value) => setCredentials((current) => ({ ...current, [field]: value }));
  const updateCrmsCredential = (field, value) => setCrmsCredentials((current) => ({ ...current, [field]: value }));
  const updateTemplate = (key, field, value) => setSettings((current) => ({
    ...current,
    templates: (current.templates || []).map((template) => (
      template.key === key ? { ...template, [field]: value } : template
    )),
  }));

  const save = async () => {
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const { data } = await axios.put(
        `${BASE_URL}/crew/admin/mail-settings`,
        {
          enabled: Boolean(settings.enabled),
          sender: settings.sender || "",
          subjectTemplate: settings.subjectTemplate || "",
          bodyTemplate: settings.bodyTemplate || "",
          tenantId: credentials.tenantId,
          clientId: credentials.clientId,
          clientSecret: credentials.clientSecret,
          twoFactorMode: settings.twoFactor?.configuredMode || settings.twoFactor?.mode || "off",
          templates: settings.templates || [],
        },
        { headers: headers() },
      );
      setSettings(data);
      setCredentials({ tenantId: "", clientId: "", clientSecret: "" });
      setMessage(data.message || "Mail settings saved.");
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Mail settings could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const saveCrms = async () => {
    setCrmsSaving(true);
    setMessage("");
    setError("");
    try {
      const { data } = await axios.put(
        `${BASE_URL}/crew/admin/mail-settings/crms`,
        crmsCredentials,
        { headers: headers() },
      );
      setSettings((current) => ({ ...current, crms: data.crms }));
      setCrmsCredentials({ username: "", password: "" });
      if (data.connectionVerified) setMessage(data.message || "CRMS credentials saved and verified.");
      else setError(data.message || "CRMS credentials were saved, but the login could not be verified.");
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "CRMS credentials could not be saved.");
    } finally {
      setCrmsSaving(false);
    }
  };

  const saveNormativeDc = async () => {
    setNormativeDcSaving(true);
    setMessage("");
    setError("");
    try {
      const { data } = await axios.put(
        `${BASE_URL}/crew/admin/mail-settings/normative-dc`,
        normativeDcCredentials,
        { headers: headers() },
      );
      setSettings((current) => ({ ...current, normativeDc: data.normativeDc }));
      setNormativeDcCredentials({ username: "", password: "" });
      setMessage(data.message || "Normative DC credentials saved.");
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Normative DC credentials could not be saved.");
    } finally {
      setNormativeDcSaving(false);
    }
  };

  const saveReportInbox = async () => {
    setReportInboxSaving(true);
    setMessage("");
    setError("");
    try {
      const { data } = await axios.put(
        `${BASE_URL}/crew/admin/mail-settings/plant-report-inbox`,
        reportInbox,
        { headers: headers() },
      );
      setSettings((current) => ({ ...current, plantReportInbox: data.plantReportInbox }));
      setReportInbox((current) => ({ ...current, tenantId: "", clientId: "", clientSecret: "" }));
      setMessage(data.message || "Consolidated report inbox settings saved.");
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Consolidated report inbox settings could not be saved.");
    } finally {
      setReportInboxSaving(false);
    }
  };

  const startDelegatedConnection = async () => {
    setDelegatedStarting(true);
    setMessage("");
    setError("");
    try {
      const saved = await axios.put(
        `${BASE_URL}/crew/admin/mail-settings/plant-report-inbox`,
        { ...reportInbox, enabled: false, authMode: "delegated" },
        { headers: headers() },
      );
      setSettings((current) => ({ ...current, plantReportInbox: saved.data.plantReportInbox }));
      setReportInbox((current) => ({ ...current, enabled: false, tenantId: "", clientId: "", clientSecret: "", authMode: "delegated" }));
      const { data } = await axios.post(
        `${BASE_URL}/crew/admin/mail-settings/plant-report-inbox/delegated/start`,
        {},
        { headers: headers() },
      );
      setDeviceFlow(data);
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Microsoft mailbox connection could not be started.");
    } finally {
      setDelegatedStarting(false);
    }
  };

  const disconnectDelegatedConnection = async () => {
    if (!window.confirm("Disconnect the Microsoft report mailbox?")) return;
    setError("");
    try {
      const { data } = await axios.delete(
        `${BASE_URL}/crew/admin/mail-settings/plant-report-inbox/delegated`,
        { headers: headers() },
      );
      setSettings((current) => ({ ...current, plantReportInbox: data.plantReportInbox }));
      setReportInbox((current) => ({ ...current, enabled: false, mailbox: "" }));
      setMessage(data.message || "Microsoft mailbox disconnected.");
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Microsoft mailbox could not be disconnected.");
    }
  };

  return (
    <AppShell>
      <Box sx={{ width: "100%", p: { xs: 1.5, md: 2.5 } }}>
        <Box sx={{ borderRadius: 3, px: { xs: 2, md: 3 }, py: 2.2, color: "white", background: "linear-gradient(100deg,#08103A 0%,#0057B7 68%,#0787D1 100%)", mb: 2 }}>
          <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems={{ xs: "flex-start", md: "center" }} spacing={2}>
            <Box>
              <Typography sx={{ fontSize: 11, fontWeight: 900, letterSpacing: 1, opacity: .85 }}>ADMINISTRATION</Typography>
              <Typography variant="h4" sx={{ fontWeight: 950, mt: .4 }}>Mail, Sign-in &amp; External Data</Typography>
              <Typography sx={{ fontSize: 12.5, opacity: .9, mt: .35 }}>Configure Microsoft Graph delivery, email OTP authentication, and protected CRMS LogBook access. Credentials remain server-only.</Typography>
            </Box>
            <Chip icon={<Mail size={15} />} label={settings?.enabled ? "Mail enabled" : "Mail disabled"} sx={{ bgcolor: "rgba(255,255,255,.14)", color: "white", fontWeight: 900 }} />
          </Stack>
        </Box>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {message && <Alert severity="success" sx={{ mb: 2 }}>{message}</Alert>}

        {!loading && settings && (
          <>
            <Paper variant="outlined" sx={{ mb: 2, borderRadius: 3, overflow: "hidden", borderColor: "#B9D5F7" }}>
              <Tabs value={settingsTab} onChange={(_, value) => setSettingsTab(value)} variant="scrollable" scrollButtons="auto" sx={{ bgcolor: "#F8FAFC", "& .MuiTab-root": { minHeight: 50, fontWeight: 900, textTransform: "none" } }}>
                <Tab icon={<Mail size={17} />} iconPosition="start" label="Alert & workflow mail" />
                <Tab icon={<DatabaseZap size={17} />} iconPosition="start" label="Consolidated Thermal/Hydro Report" />
              </Tabs>
            </Paper>
            {settingsTab === 0 ? (
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "minmax(0,1.6fr) minmax(300px,.7fr)" }, gap: 2 }}>
            <Paper variant="outlined" sx={{ p: 2.2, borderRadius: 3, borderColor: "#B9D5F7", bgcolor: "#F7FAFF", gridColumn: "1 / -1" }}>
              <Stack direction={{ xs: "column", md: "row" }} spacing={2.5} alignItems={{ xs: "stretch", md: "center" }}>
                <Box sx={{ width: 46, height: 46, borderRadius: 2, display: "grid", placeItems: "center", color: "#0057B7", bgcolor: "#E8F1FB", flexShrink: 0 }}>
                  <LockKeyhole size={23} />
                </Box>
                <Box sx={{ flex: 1 }}>
                  <Typography sx={{ fontWeight: 950, color: "#0F172A" }}>Mail-based two-factor authentication</Typography>
                  <Typography sx={{ mt: .35, fontSize: 12.5, color: "#64748B" }}>Require a short-lived email OTP after a correct password. OTP codes are hashed, expire after 10 minutes, and are never stored as readable text.</Typography>
                </Box>
                <TextField
                  select
                  size="small"
                  label="Two-factor mode"
                  value={settings.twoFactor?.configuredMode || settings.twoFactor?.mode || "off"}
                  onChange={(event) => updateTwoFactorMode(event.target.value)}
                  disabled={saving}
                  helperText="This setting is saved immediately."
                  sx={{ minWidth: { xs: "100%", md: 245 } }}
                >
                  <MenuItem value="off">Off</MenuItem>
                  <MenuItem value="admin">Active for administrators</MenuItem>
                  <MenuItem value="all">Active for all users</MenuItem>
                </TextField>
              </Stack>
              {(() => {
                const mode = settings.twoFactor?.configuredMode || settings.twoFactor?.mode || "off";
                if (settings.twoFactor?.emergencyOverride) {
                  return <Alert severity="warning" sx={{ mt: 1.7 }}>Emergency server override is active. Two-factor authentication is effectively Off until CREW_2FA_EMERGENCY_OFF is removed.</Alert>;
                }
                const readiness = mode === "off"
                  ? settings.twoFactor?.readiness
                  : settings.twoFactor?.readinessByMode?.[mode];
                if (mode === "off") return <Alert severity="info" sx={{ mt: 1.7 }}>Two-factor authentication is currently disabled.</Alert>;
                return (
                  <Alert severity={readiness?.ready ? "success" : "warning"} sx={{ mt: 1.7 }}>
                    {readiness?.ready
                      ? `${readiness.affectedAccounts} affected account(s) are ready for OTP sign-in.`
                      : `${readiness?.accountsMissingEmail || 0} affected account(s) need a valid profile email. Graph credentials and a sender mailbox must also be configured below.`}
                  </Alert>
                );
              })()}
            </Paper>
            <Paper variant="outlined" sx={{ p: 2.2, borderRadius: 3, borderColor: "#E5C76B", bgcolor: "#FFFCF2", gridColumn: "1 / -1" }}>
              <Stack direction={{ xs: "column", md: "row" }} spacing={2.5} alignItems={{ xs: "stretch", md: "flex-start" }}>
                <Box sx={{ width: 46, height: 46, borderRadius: 2, display: "grid", placeItems: "center", color: "#8A5A00", bgcolor: "#FFF1BE", flexShrink: 0 }}>
                  <DatabaseZap size={23} />
                </Box>
                <Box sx={{ flex: 1 }}>
                  <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ xs: "flex-start", sm: "center" }} gap={1}>
                    <Box>
                      <Typography sx={{ fontWeight: 950, color: "#0F172A" }}>CRMS LogBook access</Typography>
                      <Typography sx={{ mt: .35, fontSize: 12.5, color: "#64748B" }}>Save an authorized CRMS account for Crew duty reconciliation. The password is write-only and is never returned to the browser.</Typography>
                    </Box>
                    <Chip
                      size="small"
                      color={settings.crms?.credentialsConfigured ? "success" : "warning"}
                      label={settings.crms?.credentialsConfigured ? "Credentials configured" : "Configuration required"}
                    />
                  </Stack>
                  <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "minmax(220px,.8fr) minmax(280px,1fr) auto" }, gap: 1.5, mt: 2, alignItems: "start" }}>
                    <TextField
                      size="small"
                      fullWidth
                      label="CRMS username"
                      value={crmsCredentials.username}
                      onChange={(event) => updateCrmsCredential("username", event.target.value)}
                      placeholder={settings.crms?.usernameConfigured ? "Leave blank to keep current username" : "Enter CRMS username"}
                      helperText={settings.crms?.usernameHint ? `Currently configured: ${settings.crms.usernameHint}` : "Not configured"}
                      autoComplete="off"
                    />
                    <TextField
                      size="small"
                      fullWidth
                      type="password"
                      label="CRMS password"
                      value={crmsCredentials.password}
                      onChange={(event) => updateCrmsCredential("password", event.target.value)}
                      placeholder={settings.crms?.passwordConfigured ? "Leave blank to keep current password" : "Enter CRMS password"}
                      helperText={settings.crms?.passwordConfigured ? "A password is saved; its value is never displayed." : "Not configured"}
                      autoComplete="new-password"
                    />
                    <Button
                      variant="contained"
                      startIcon={<KeyRound size={16} />}
                      onClick={saveCrms}
                      disabled={crmsSaving || (!crmsCredentials.username && !crmsCredentials.password)}
                      sx={{ bgcolor: "#8A5A00", fontWeight: 900, textTransform: "none", minHeight: 40, whiteSpace: "nowrap" }}
                    >
                      {crmsSaving ? "Testing..." : "Save & test CRMS login"}
                    </Button>
                  </Box>
                </Box>
              </Stack>
            </Paper>
            <Paper variant="outlined" sx={{ p: 2.2, borderRadius: 3, borderColor: "#D8C4F1", bgcolor: "#FBF8FF", gridColumn: "1 / -1" }}>
              <Stack direction={{ xs: "column", md: "row" }} spacing={2.5} alignItems={{ xs: "stretch", md: "flex-start" }}>
                <Box sx={{ width: 46, height: 46, borderRadius: 2, display: "grid", placeItems: "center", color: "#6D28D9", bgcolor: "#EDE9FE", flexShrink: 0 }}><DatabaseZap size={23} /></Box>
                <Box sx={{ flex: 1 }}>
                  <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ xs: "flex-start", sm: "center" }} gap={1}>
                    <Box>
                      <Typography sx={{ fontWeight: 950, color: "#0F172A" }}>Normative DC login</Typography>
                      <Typography sx={{ mt: .35, fontSize: 12.5, color: "#64748B" }}>Protected credentials for Normative DC data access. The password is write-only and never returned to the browser.</Typography>
                    </Box>
                    <Chip size="small" color={settings.normativeDc?.credentialsConfigured ? "success" : "warning"} label={settings.normativeDc?.credentialsConfigured ? "Credentials configured" : "Configuration required"} />
                  </Stack>
                  <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "minmax(220px,.8fr) minmax(280px,1fr) auto" }, gap: 1.5, mt: 2, alignItems: "start" }}>
                    <TextField size="small" fullWidth label="Normative DC username" value={normativeDcCredentials.username} onChange={(event) => setNormativeDcCredentials((current) => ({ ...current, username: event.target.value }))} placeholder={settings.normativeDc?.usernameConfigured ? "Leave blank to keep current username" : "Enter username"} helperText={settings.normativeDc?.usernameHint ? `Currently configured: ${settings.normativeDc.usernameHint}` : "Not configured"} autoComplete="off" />
                    <TextField size="small" fullWidth type="password" label="Normative DC password" value={normativeDcCredentials.password} onChange={(event) => setNormativeDcCredentials((current) => ({ ...current, password: event.target.value }))} placeholder={settings.normativeDc?.passwordConfigured ? "Leave blank to keep current password" : "Enter password"} helperText={settings.normativeDc?.passwordConfigured ? "A password is saved; its value is never displayed." : "Not configured"} autoComplete="new-password" />
                    <Button variant="contained" startIcon={<KeyRound size={16} />} onClick={saveNormativeDc} disabled={normativeDcSaving || (!normativeDcCredentials.username && !normativeDcCredentials.password)} sx={{ bgcolor: "#6D28D9", fontWeight: 900, textTransform: "none", minHeight: 40, whiteSpace: "nowrap", "&:hover": { bgcolor: "#5B21B6" } }}>{normativeDcSaving ? "Saving..." : "Save Normative DC login"}</Button>
                  </Box>
                </Box>
              </Stack>
            </Paper>
            <Paper variant="outlined" sx={{ p: 2.2, borderRadius: 3, borderColor: "#CFE1F8" }}>
              <Stack spacing={2}>
                <FormControlLabel
                  control={<Switch checked={Boolean(settings.enabled)} onChange={(event) => update("enabled", event.target.checked)} />}
                  label={<Typography fontWeight={850}>Enable workflow email delivery</Typography>}
                />
                <TextField fullWidth label="Sender mailbox" value={settings.sender || ""} onChange={(event) => update("sender", event.target.value)} helperText="Mailbox authorized for Microsoft Graph sendMail." />
                <Box>
                  <Typography sx={{ fontSize: 12.5, color: "#64748B" }}>This is the master delivery switch. Each workflow template below can also be enabled or disabled independently.</Typography>
                </Box>
              </Stack>
            </Paper>

            <Paper variant="outlined" sx={{ p: 2.2, borderRadius: 3, borderColor: "#BDE6D4", bgcolor: "#F6FCF9" }}>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}><ShieldCheck size={20} color="#008645" /><Typography fontWeight={950}>Credential security</Typography></Stack>
              <Typography sx={{ fontSize: 12.5, color: "#475569", mb: 2 }}>These are write-only administrator fields. Saved credentials are kept in the protected backend environment file and are never returned by the API or stored in MongoDB.</Typography>
              <Stack spacing={1}>
                <CredentialRow label="Tenant configuration" ready={settings.tenantConfigured} />
                <CredentialRow label="Application configuration" ready={settings.clientConfigured} />
                <CredentialRow label="Client secret" ready={settings.secretConfigured} />
              </Stack>
              <Stack spacing={1.5} sx={{ mt: 2 }}>
                <TextField
                  size="small"
                  fullWidth
                  label="Tenant ID"
                  value={credentials.tenantId}
                  onChange={(event) => updateCredential("tenantId", event.target.value)}
                  placeholder={settings.tenantConfigured ? "Leave blank to keep current value" : "Enter Tenant ID"}
                  helperText={settings.tenantHint ? `Currently configured: ${settings.tenantHint}` : "Not configured"}
                  autoComplete="off"
                />
                <TextField
                  size="small"
                  fullWidth
                  label="Application (Client) ID"
                  value={credentials.clientId}
                  onChange={(event) => updateCredential("clientId", event.target.value)}
                  placeholder={settings.clientConfigured ? "Leave blank to keep current value" : "Enter Application ID"}
                  helperText={settings.clientHint ? `Currently configured: ${settings.clientHint}` : "Not configured"}
                  autoComplete="off"
                />
                <TextField
                  size="small"
                  fullWidth
                  type="password"
                  label="Client Secret"
                  value={credentials.clientSecret}
                  onChange={(event) => updateCredential("clientSecret", event.target.value)}
                  placeholder={settings.secretConfigured ? "Leave blank to keep current secret" : "Enter Client Secret"}
                  helperText={settings.secretConfigured ? "A secret is configured; its value is never displayed." : "Not configured"}
                  autoComplete="new-password"
                />
              </Stack>
              <Alert icon={<KeyRound size={18} />} severity={settings.credentialsConfigured ? "success" : "warning"} sx={{ mt: 2 }}>
                {settings.credentialsConfigured ? "Microsoft Graph credentials are configured. Leave a field blank to retain it." : "Enter all three credentials, sender mailbox, enable mail, then save."}
              </Alert>
            </Paper>

            <Paper variant="outlined" sx={{ p: 2.2, borderRadius: 3, borderColor: "#CFE1F8", gridColumn: "1 / -1" }}>
              <Box sx={{ mb: 2 }}>
                <Typography sx={{ fontSize: 18, fontWeight: 950, color: "#08103A" }}>Workflow mail templates</Typography>
                <Typography sx={{ mt: .35, fontSize: 12.5, color: "#64748B" }}>Correct the subject or mail body whenever required. A disabled template continues to create portal notifications but does not send email.</Typography>
              </Box>
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", xl: "repeat(2,minmax(0,1fr))" }, gap: 1.5 }}>
                {(settings.templates || []).map((template) => (
                  <Paper key={template.key} variant="outlined" sx={{ p: 1.8, borderRadius: 2.5, borderColor: template.enabled ? "#AFCDF3" : "#E2E8F0", bgcolor: template.enabled ? "#F8FBFF" : "#F8FAFC" }}>
                    <FormControlLabel
                      control={<Switch checked={Boolean(template.enabled)} onChange={(event) => updateTemplate(template.key, "enabled", event.target.checked)} />}
                      label={<Typography sx={{ fontWeight: 900, color: "#0F172A" }}>{template.label}</Typography>}
                    />
                    <Stack spacing={1.3} sx={{ mt: 1 }}>
                      {template.key === "psp_voltage_discrepancy" && (
                        <>
                          <TextField
                            size="small"
                            fullWidth
                            label="Receiver mail IDs (To)"
                            value={template.recipients || ""}
                            onChange={(event) => updateTemplate(template.key, "recipients", event.target.value)}
                            placeholder="recipient1@grid-india.in, recipient2@grid-india.in"
                            helperText="Separate multiple recipients with commas or semicolons."
                          />
                          <TextField
                            size="small"
                            fullWidth
                            label="Copy mail IDs (CC)"
                            value={template.ccRecipients || ""}
                            onChange={(event) => updateTemplate(template.key, "ccRecipients", event.target.value)}
                            placeholder="copy1@grid-india.in, copy2@grid-india.in"
                            helperText="Optional. Addresses already present in To will not be duplicated in CC."
                          />
                        </>
                      )}
                      <TextField size="small" fullWidth label="Subject template" value={template.subjectTemplate || ""} onChange={(event) => updateTemplate(template.key, "subjectTemplate", event.target.value)} />
                      <TextField size="small" fullWidth multiline minRows={4} label="Mail body template" value={template.bodyTemplate || ""} onChange={(event) => updateTemplate(template.key, "bodyTemplate", event.target.value)} />
                    </Stack>
                  </Paper>
                ))}
              </Box>
              <Box sx={{ mt: 2 }}>
                <Typography sx={{ fontSize: 11, color: "#64748B", fontWeight: 800, mb: .8 }}>AVAILABLE PLACEHOLDERS</Typography>
                <Stack direction="row" useFlexGap flexWrap="wrap" gap={.7}>
                  {(settings.allowedPlaceholders || []).map((item) => <Chip key={item} size="small" label={`{${item}}`} variant="outlined" />)}
                </Stack>
              </Box>
              <Button variant="contained" startIcon={<Save size={16} />} onClick={save} disabled={saving} sx={{ mt: 2, bgcolor: "#0057B7", fontWeight: 900, textTransform: "none" }}>
                {saving ? "Saving..." : "Save mail and template settings"}
              </Button>
            </Paper>
          </Box>
            ) : (
              <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, borderRadius: 3, borderColor: "#C4B5FD", bgcolor: "#FCFAFF" }}>
                <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems={{ xs: "flex-start", md: "center" }} gap={1.5} sx={{ mb: 2.5 }}>
                  <Box>
                    <Typography sx={{ color: "#4C1D95", fontSize: 20, fontWeight: 950 }}>Consolidated Thermal/Hydro Report Inbox</Typography>
                    <Typography sx={{ mt: .4, color: "#64748B", fontSize: 12.5 }}>Independent Microsoft Graph credentials used only to read the dated All India report attachment.</Typography>
                  </Box>
                  <Chip color={settings.plantReportInbox?.ready ? "success" : "warning"} label={settings.plantReportInbox?.ready ? "Inbox ready" : "Configuration required"} sx={{ fontWeight: 900 }} />
                </Stack>

                <FormControlLabel control={<Switch checked={Boolean(reportInbox.enabled)} onChange={(event) => setReportInbox((current) => ({ ...current, enabled: event.target.checked }))} />} label={<Typography fontWeight={900}>Enable consolidated report inbox</Typography>} />
                <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2,minmax(0,1fr))" }, gap: 1.7, mt: 2 }}>
                  <TextField select fullWidth label="Mailbox authentication" value={reportInbox.authMode || "delegated"} onChange={(event) => setReportInbox((current) => ({ ...current, authMode: event.target.value }))} helperText="Delegated access reads only the mailbox you sign in with.">
                    <MenuItem value="delegated">My mailbox (Delegated Mail.Read)</MenuItem>
                    <MenuItem value="application">Service application (Application Mail.Read)</MenuItem>
                  </TextField>
                  <TextField fullWidth label="Microsoft 365 report mailbox" value={reportInbox.mailbox} disabled={reportInbox.authMode === "delegated" && settings.plantReportInbox?.delegatedConnected} onChange={(event) => setReportInbox((current) => ({ ...current, mailbox: event.target.value }))} placeholder="your.name@grid-india.in" helperText={reportInbox.authMode === "delegated" ? "Filled automatically from the Microsoft account you connect." : "Mailbox containing the consolidated report email."} />
                  <TextField fullWidth label="Tenant ID" value={reportInbox.tenantId} onChange={(event) => setReportInbox((current) => ({ ...current, tenantId: event.target.value }))} placeholder={settings.plantReportInbox?.tenantConfigured ? "Leave blank to keep current Tenant ID" : "Enter Tenant ID"} helperText={settings.plantReportInbox?.tenantHint ? `Configured: ${settings.plantReportInbox.tenantHint}` : "Separate report-inbox credential"} autoComplete="off" />
                  <TextField fullWidth label="Application (Client) ID" value={reportInbox.clientId} onChange={(event) => setReportInbox((current) => ({ ...current, clientId: event.target.value }))} placeholder={settings.plantReportInbox?.clientConfigured ? "Leave blank to keep current Client ID" : "Enter Application ID"} helperText={settings.plantReportInbox?.clientHint ? `Configured: ${settings.plantReportInbox.clientHint}` : "Application registered in your Microsoft Entra tenant"} autoComplete="off" />
                  {reportInbox.authMode === "application" && (
                  <TextField fullWidth type="password" label="Client Secret Value" value={reportInbox.clientSecret} onChange={(event) => setReportInbox((current) => ({ ...current, clientSecret: event.target.value }))} placeholder={settings.plantReportInbox?.secretConfigured ? "Paste a new Value, or leave blank to keep current" : "Paste the client secret Value"} error={reportSecretIsId} helperText={reportSecretIsId ? "This is UUID-shaped and appears to be the Secret ID. Paste the Value instead." : "Use the Value shown when the secret was created—not the Secret ID."} autoComplete="new-password" />
                  )}
                </Box>

                {reportInbox.authMode === "delegated" && (
                  <Paper variant="outlined" sx={{ mt: 2, p: 2, borderRadius: 2.5, borderColor: settings.plantReportInbox?.delegatedConnected ? "#86EFAC" : "#BFDBFE", bgcolor: settings.plantReportInbox?.delegatedConnected ? "#F0FDF4" : "#EFF6FF" }}>
                    <Stack direction={{ xs: "column", sm: "row" }} alignItems={{ xs: "flex-start", sm: "center" }} justifyContent="space-between" gap={1.5}>
                      <Box>
                        <Typography sx={{ fontWeight: 950, color: "#0F172A" }}>Your Microsoft mailbox</Typography>
                        <Typography sx={{ mt: .35, fontSize: 12.5, color: "#475569" }}>
                          {settings.plantReportInbox?.delegatedConnected
                            ? `Connected as ${settings.plantReportInbox?.delegatedMailbox || settings.plantReportInbox?.mailbox}`
                            : "Connect once with Microsoft. COMPASS stores no Microsoft password and reads only your signed-in mailbox."}
                        </Typography>
                      </Box>
                      {settings.plantReportInbox?.delegatedConnected ? (
                        <Button variant="outlined" color="error" startIcon={<Unlink size={16} />} onClick={disconnectDelegatedConnection} sx={{ fontWeight: 900, textTransform: "none", whiteSpace: "nowrap" }}>Disconnect</Button>
                      ) : (
                        <Button variant="contained" startIcon={delegatedStarting ? <CircularProgress size={15} color="inherit" /> : <Link2 size={16} />} onClick={startDelegatedConnection} disabled={delegatedStarting} sx={{ bgcolor: "#0057B7", fontWeight: 900, textTransform: "none", whiteSpace: "nowrap" }}>{delegatedStarting ? "Starting..." : "Connect my Microsoft mailbox"}</Button>
                      )}
                    </Stack>
                  </Paper>
                )}

                {reportInbox.authMode === "application" && settings.plantReportInbox?.secretLooksLikeId && (
                  <Alert severity="error" sx={{ mt: 2 }}>
                    The saved credential appears to be a <strong>Secret ID</strong>. Create or open a client secret in Microsoft Entra and save its one-time <strong>Value</strong> here.
                  </Alert>
                )}

                <Paper variant="outlined" sx={{ mt: 2.2, p: 2, borderRadius: 2.5, borderColor: "#DDD6FE", bgcolor: "#F5F3FF" }}>
                  <Typography sx={{ color: "#4C1D95", fontWeight: 950 }}>Expected incoming report</Typography>
                  <Typography sx={{ mt: 1, fontSize: 12.5 }}><strong>Subject:</strong> {settings.plantReportInbox?.subjectPattern}</Typography>
                  <Typography sx={{ mt: .6, fontSize: 12.5 }}><strong>Attachment:</strong> {settings.plantReportInbox?.attachmentPattern}</Typography>
                  <Typography sx={{ mt: .6, fontSize: 12.5 }}><strong>Sheets:</strong> {(settings.plantReportInbox?.sheets || ["NR", "SR", "WR"]).join(", ")}</Typography>
                </Paper>
                <Alert severity="info" sx={{ mt: 2 }}>
                  {reportInbox.authMode === "delegated"
                    ? <>This mode uses delegated <strong>Mail.Read</strong> and Microsoft Graph <strong>/me</strong>. It cannot open another user's or shared mailbox.</>
                    : <>This mode requires Microsoft Graph <strong>Application → Mail.Read</strong> with administrator consent.</>}
                </Alert>
                <Button variant="contained" startIcon={reportInboxSaving ? null : <Save size={16} />} onClick={saveReportInbox} disabled={reportInboxSaving || (reportInbox.authMode === "application" && reportSecretIsId)} sx={{ mt: 2, bgcolor: "#6D28D9", fontWeight: 900, textTransform: "none", "&:hover": { bgcolor: "#5B21B6" } }}>{reportInboxSaving ? "Saving..." : "Save consolidated report settings"}</Button>
              </Paper>
            )}
          </>
        )}

        <Dialog open={Boolean(deviceFlow)} onClose={() => deviceFlow?.status !== "pending" && setDeviceFlow(null)} maxWidth="sm" fullWidth>
          <DialogTitle sx={{ fontWeight: 950 }}>Connect your Microsoft mailbox</DialogTitle>
          <DialogContent>
            {deviceFlow?.status === "connected" ? (
              <Alert severity="success">Connected as <strong>{deviceFlow.mailbox}</strong>. Scheduled and manual report fetching will use this mailbox.</Alert>
            ) : deviceFlow?.status === "error" ? (
              <Alert severity="error">The Microsoft sign-in was not completed. Close this window and try Connect again.</Alert>
            ) : (
              <Stack spacing={2}>
                <Typography sx={{ color: "#475569" }}>Open the Microsoft sign-in page and enter this one-time code. This page will detect completion automatically.</Typography>
                <Paper variant="outlined" sx={{ p: 2, textAlign: "center", bgcolor: "#F8FAFC", borderColor: "#BFDBFE" }}>
                  <Typography sx={{ fontSize: 11, fontWeight: 900, color: "#64748B", letterSpacing: 1 }}>ONE-TIME CODE</Typography>
                  <Typography sx={{ mt: .5, fontSize: 30, fontWeight: 950, letterSpacing: 4, color: "#0B4FA2" }}>{deviceFlow?.userCode}</Typography>
                </Paper>
                <Button component="a" href={deviceFlow?.verificationUri || "https://microsoft.com/devicelogin"} target="_blank" rel="noreferrer" variant="contained" endIcon={<ExternalLink size={16} />} sx={{ fontWeight: 900, textTransform: "none" }}>Open Microsoft sign-in</Button>
                <Stack direction="row" alignItems="center" gap={1}><CircularProgress size={17} /><Typography sx={{ fontSize: 12.5, color: "#64748B" }}>Waiting for Microsoft sign-in…</Typography></Stack>
              </Stack>
            )}
          </DialogContent>
          <DialogActions><Button onClick={() => setDeviceFlow(null)}>{deviceFlow?.status === "connected" ? "Done" : "Close"}</Button></DialogActions>
        </Dialog>
      </Box>
    </AppShell>
  );
}

function CredentialRow({ label, ready }) {
  return (
    <Stack direction="row" justifyContent="space-between" alignItems="center">
      <Typography sx={{ fontSize: 12, fontWeight: 750 }}>{label}</Typography>
      <Chip size="small" color={ready ? "success" : "default"} label={ready ? "Configured" : "Not configured"} />
    </Stack>
  );
}
