import { useState } from "react";
import { Alert, Box, Button, IconButton, InputAdornment, Paper, TextField, Typography } from "@mui/material";
import { Eye, EyeOff, LockKeyhole, User } from "lucide-react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await login(userId.trim(), password);
      navigate(location.state?.from || "/", { replace: true });
    } catch (err) {
      setError(err.response?.data?.detail || "Unable to sign in with these credentials.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box sx={{ minHeight: "100vh", display: "grid", gridTemplateColumns: { xs: "1fr", md: "1.05fr .95fr" }, background: "#F8FAFC" }}>
      <Box sx={{ display: { xs: "none", md: "flex" }, flexDirection: "column", justifyContent: "space-between", p: 7, color: "#fff", background: "linear-gradient(145deg,#08103A 0%,#0057B7 68%,#0F6FDB 130%)" }}>
        <Box component="img" src="/logo.png" alt="GRID-INDIA" sx={{ width: 250, p: 1.5, borderRadius: 2, background: "rgba(255,255,255,.96)" }} />
        <Box>
          <Typography sx={{ fontSize: 64, fontWeight: 950, lineHeight: 0.95, letterSpacing: "-.045em" }}>DRUPAd</Typography>
          <Typography sx={{ mt: 1.2, maxWidth: 580, fontSize: 16, fontWeight: 750, color: "rgba(255,255,255,.9)" }}>Data Dashboard &amp; Resource Utilization Portal for Administration</Typography>
          <Typography sx={{ mt: 2.5, maxWidth: 540, color: "rgba(255,255,255,.72)" }}>Dashboards, analytics, reports and crew management with controlled View and Write access.</Typography>
        </Box>
        <Typography sx={{ fontSize: 12, color: "rgba(255,255,255,.62)" }}>GRID-INDIA · Eastern Region</Typography>
      </Box>
      <Box sx={{ display: "grid", placeItems: "center", p: 3 }}>
        <Paper component="form" onSubmit={submit} elevation={0} sx={{ width: "min(440px, 100%)", p: { xs: 3, sm: 5 }, border: "1px solid #E2E8F0", borderRadius: 3, boxShadow: "0 18px 50px rgba(15,23,42,.08)" }}>
          <Box sx={{ width: 48, height: 48, display: "grid", placeItems: "center", color: "#0057B7", background: "#E8F1FB", borderRadius: 2 }}><LockKeyhole size={23} /></Box>
          <Typography sx={{ mt: 2.5, fontSize: 34, lineHeight: 1, fontWeight: 950, letterSpacing: "-.035em", color: "#0057B7" }}>DRUPAd</Typography>
          <Typography sx={{ mt: .65, color: "#64748B", fontSize: 11.5, fontWeight: 750 }}>Data Dashboard &amp; Resource Utilization Portal for Administration</Typography>
          <Typography variant="h4" sx={{ mt: 2.5, fontWeight: 800, color: "#0F172A" }}>Welcome back</Typography>
          <Typography sx={{ mt: .7, mb: 3, color: "#64748B" }}>Sign in using your Crew Management user ID and password.</Typography>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <TextField autoFocus fullWidth label="User ID" value={userId} onChange={(e) => setUserId(e.target.value)} required InputProps={{ startAdornment: <InputAdornment position="start"><User size={18} /></InputAdornment> }} />
          <TextField fullWidth label="Password" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} required sx={{ mt: 2 }} InputProps={{ startAdornment: <InputAdornment position="start"><LockKeyhole size={18} /></InputAdornment>, endAdornment: <InputAdornment position="end"><IconButton onClick={() => setShowPassword((v) => !v)} edge="end">{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</IconButton></InputAdornment> }} />
          <Button fullWidth type="submit" variant="contained" disabled={submitting} sx={{ mt: 3, minHeight: 44, fontWeight: 800, background: "#0057B7" }}>{submitting ? "Signing in..." : "Sign in"}</Button>
          <Typography sx={{ mt: 2, textAlign: "center", color: "#94A3B8", fontSize: 11 }}>Access is recorded for operational security.</Typography>
        </Paper>
      </Box>
    </Box>
  );
}
