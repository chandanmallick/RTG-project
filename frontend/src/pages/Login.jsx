import { useEffect, useState } from "react";
import { Alert, Box, Button, IconButton, InputAdornment, Paper, TextField, Typography } from "@mui/material";
import { Eye, EyeOff, LockKeyhole, Mail, RotateCcw, User } from "lucide-react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export default function Login() {
  const { user, login, verifyOtp, resendOtp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [challenge, setChallenge] = useState(null);
  const [otp, setOtp] = useState("");
  const [resendSeconds, setResendSeconds] = useState(0);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (resendSeconds <= 0) return undefined;
    const timer = window.setInterval(() => {
      setResendSeconds((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendSeconds]);

  if (user) return <Navigate to="/" replace />;

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setMessage("");
    try {
      if (challenge) {
        await verifyOtp(challenge.id, otp);
      } else {
        const result = await login(userId.trim(), password);
        if (result?.requires_otp) {
          setChallenge({
            id: result.challenge_id,
            maskedEmail: result.masked_email,
          });
          setPassword("");
          setOtp("");
          setResendSeconds(Number(result.resend_after || 60));
          setMessage(`Verification code sent to ${result.masked_email}.`);
          return;
        }
      }
      navigate(location.state?.from || "/", { replace: true });
    } catch (err) {
      setError(err.response?.data?.detail || "Unable to sign in with these credentials.");
    } finally {
      setSubmitting(false);
    }
  };

  const resend = async () => {
    if (!challenge || resendSeconds > 0) return;
    setSubmitting(true);
    setError("");
    setMessage("");
    try {
      const result = await resendOtp(challenge.id);
      setOtp("");
      setResendSeconds(Number(result.resend_after || 60));
      setMessage(result.message || `A new code was sent to ${result.masked_email || challenge.maskedEmail}.`);
    } catch (err) {
      setError(err.response?.data?.detail || "A new verification code could not be sent.");
    } finally {
      setSubmitting(false);
    }
  };

  const restart = () => {
    setChallenge(null);
    setOtp("");
    setPassword("");
    setError("");
    setMessage("");
    setResendSeconds(0);
  };

  return (
    <Box sx={{ minHeight: "100vh", display: "grid", gridTemplateColumns: { xs: "1fr", md: "1.05fr .95fr" }, background: "#F8FAFC" }}>
      <Box sx={{ display: { xs: "none", md: "flex" }, flexDirection: "column", justifyContent: "space-between", p: 7, color: "#fff", background: "linear-gradient(145deg,#08103A 0%,#0057B7 68%,#0F6FDB 130%)" }}>
        <Box component="img" src="/logo.png" alt="GRID-INDIA" sx={{ width: 250, p: 1.5, borderRadius: 2, background: "rgba(255,255,255,.96)" }} />
        <Box>
          <Typography sx={{ fontSize: 64, fontWeight: 950, lineHeight: 0.95, letterSpacing: "-.045em" }}>COMPASS</Typography>
          <Typography sx={{ mt: 1.2, maxWidth: 680, fontSize: 16, fontWeight: 750, color: "rgba(255,255,255,.9)" }}>Companion for Operations Management, Planning, Analytics, Support &amp; Services</Typography>
          <Typography sx={{ mt: 2.5, maxWidth: 540, color: "rgba(255,255,255,.72)" }}>Dashboards, analytics, reports and crew management with controlled View and Write access.</Typography>
        </Box>
        <Typography sx={{ fontSize: 12, color: "rgba(255,255,255,.62)" }}>GRID-INDIA · Eastern Region</Typography>
      </Box>
      <Box sx={{ display: "grid", placeItems: "center", p: 3 }}>
        <Paper component="form" onSubmit={submit} elevation={0} sx={{ width: "min(440px, 100%)", p: { xs: 3, sm: 5 }, border: "1px solid #E2E8F0", borderRadius: 3, boxShadow: "0 18px 50px rgba(15,23,42,.08)" }}>
          <Box sx={{ width: 48, height: 48, display: "grid", placeItems: "center", color: "#0057B7", background: "#E8F1FB", borderRadius: 2 }}><LockKeyhole size={23} /></Box>
          <Typography sx={{ mt: 2.5, fontSize: 34, lineHeight: 1, fontWeight: 950, letterSpacing: "-.035em", color: "#0057B7" }}>COMPASS</Typography>
          <Typography sx={{ mt: .65, color: "#64748B", fontSize: 11.5, fontWeight: 750 }}>Companion for Operations Management, Planning, Analytics, Support &amp; Services</Typography>
          <Typography variant="h4" sx={{ mt: 2.5, fontWeight: 800, color: "#0F172A" }}>{challenge ? "Verify your identity" : "Welcome back"}</Typography>
          <Typography sx={{ mt: .7, mb: 3, color: "#64748B" }}>
            {challenge ? `Enter the 6-digit code sent to ${challenge.maskedEmail}.` : "Sign in using your Crew Management user ID and password."}
          </Typography>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          {message && <Alert severity="success" sx={{ mb: 2 }}>{message}</Alert>}
          {!challenge ? (
            <>
              <TextField autoFocus fullWidth label="User ID" value={userId} onChange={(e) => setUserId(e.target.value)} required InputProps={{ startAdornment: <InputAdornment position="start"><User size={18} /></InputAdornment> }} />
              <TextField fullWidth label="Password" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} required sx={{ mt: 2 }} InputProps={{ startAdornment: <InputAdornment position="start"><LockKeyhole size={18} /></InputAdornment>, endAdornment: <InputAdornment position="end"><IconButton onClick={() => setShowPassword((v) => !v)} edge="end">{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</IconButton></InputAdornment> }} />
            </>
          ) : (
            <TextField
              autoFocus
              fullWidth
              label="Verification code"
              value={otp}
              onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
              required
              inputProps={{ inputMode: "numeric", pattern: "[0-9]*", maxLength: 6 }}
              InputProps={{ startAdornment: <InputAdornment position="start"><Mail size={18} /></InputAdornment> }}
              helperText="The code expires after 10 minutes and can be used only once."
            />
          )}
          <Button fullWidth type="submit" variant="contained" disabled={submitting || (challenge && otp.length !== 6)} sx={{ mt: 3, minHeight: 44, fontWeight: 800, background: "#0057B7" }}>
            {submitting ? "Please wait..." : challenge ? "Verify & sign in" : "Sign in"}
          </Button>
          {challenge && (
            <Box sx={{ mt: 1.5, display: "flex", justifyContent: "space-between", gap: 1 }}>
              <Button size="small" onClick={restart} disabled={submitting} sx={{ textTransform: "none" }}>Use another account</Button>
              <Button size="small" startIcon={<RotateCcw size={14} />} onClick={resend} disabled={submitting || resendSeconds > 0} sx={{ textTransform: "none" }}>
                {resendSeconds > 0 ? `Resend in ${resendSeconds}s` : "Resend code"}
              </Button>
            </Box>
          )}
          <Typography sx={{ mt: 2, textAlign: "center", color: "#94A3B8", fontSize: 11 }}>Access is recorded for operational security.</Typography>
        </Paper>
      </Box>
    </Box>
  );
}
