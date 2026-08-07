import { useEffect, useState } from "react";
import axios from "axios";
import {
  Alert,
  Box,
  Button,
  Chip,
  FormControlLabel,
  MenuItem,
  Paper,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { KeyRound, LockKeyhole, Mail, Save, ShieldCheck } from "lucide-react";
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

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await axios.get(`${BASE_URL}/crew/admin/mail-settings`, { headers: headers() });
      setSettings(data);
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Mail settings could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

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

  return (
    <AppShell>
      <Box sx={{ width: "100%", p: { xs: 1.5, md: 2.5 } }}>
        <Box sx={{ borderRadius: 3, px: { xs: 2, md: 3 }, py: 2.2, color: "white", background: "linear-gradient(100deg,#08103A 0%,#0057B7 68%,#0787D1 100%)", mb: 2 }}>
          <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems={{ xs: "flex-start", md: "center" }} spacing={2}>
            <Box>
              <Typography sx={{ fontSize: 11, fontWeight: 900, letterSpacing: 1, opacity: .85 }}>ADMINISTRATION</Typography>
              <Typography variant="h4" sx={{ fontWeight: 950, mt: .4 }}>Mail &amp; Sign-in Security</Typography>
              <Typography sx={{ fontSize: 12.5, opacity: .9, mt: .35 }}>Configure Microsoft Graph delivery, replacement mail, and email OTP authentication. Credentials remain server-only.</Typography>
            </Box>
            <Chip icon={<Mail size={15} />} label={settings?.enabled ? "Mail enabled" : "Mail disabled"} sx={{ bgcolor: "rgba(255,255,255,.14)", color: "white", fontWeight: 900 }} />
          </Stack>
        </Box>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {message && <Alert severity="success" sx={{ mb: 2 }}>{message}</Alert>}

        {!loading && settings && (
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
        )}
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
