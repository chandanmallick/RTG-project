import { Alert, Box, Button, CircularProgress, Paper, Stack, Typography } from "@mui/material";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { HelpCircle, LogOut, LockKeyhole, Mail } from "lucide-react";
import { useAuth } from "./AuthContext";

export default function ProtectedRoute({ pageKey, children }) {
  const { user, loading, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const supportEmail = "dhruv.support@powergrid.in";
  const supportPhone = "+91 (033) 2465-9871";

  if (loading) return <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#F8FAFC" }}><CircularProgress size={28} sx={{ color: "#03624C" }} /></Box>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  const access = user.permissions?.[pageKey];
  if (!access?.view) {
    return (
      <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", p: 3, background: "linear-gradient(180deg, #F8FAFC 0%, #EEF4FB 100%)" }}>
        <Paper elevation={0} sx={{ width: "min(620px, 100%)", p: { xs: 3, sm: 4 }, border: "1px solid #D9E7F7", borderRadius: 4 }}>
          <Stack spacing={2.2} sx={{ textAlign: "center" }}>
            <Box sx={{ width: 58, height: 58, borderRadius: "18px", mx: "auto", display: "grid", placeItems: "center", background: "#E8F1FB", color: "#0057B7" }}>
              <LockKeyhole size={30} />
            </Box>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 900, color: "#03624C" }}>Page access restricted</Typography>
              <Typography sx={{ mt: 1, color: "#64748B", fontSize: 14 }}>
                Your administrator has not enabled View access for this page.
              </Typography>
            </Box>
            <Alert severity="info" sx={{ textAlign: "left", borderRadius: 2 }}>
              If you believe this is an error, contact the administrator or ask them to copy access from an existing user in User Access Control.
            </Alert>
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, background: "#F8FAFC", borderColor: "#D9E7F7" }}>
              <Stack spacing={1.2}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.2 }}>
                  <Mail size={16} color="#0057B7" />
                  <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: "#0F172A" }}>{supportEmail}</Typography>
                </Box>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.2 }}>
                  <HelpCircle size={16} color="#03624C" />
                  <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: "#0F172A" }}>{supportPhone}</Typography>
                </Box>
                <Typography sx={{ fontSize: 12, color: "#64748B", textAlign: "left" }}>
                  Faster setup is possible when the administrator replicates rights from a similar user.
                </Typography>
              </Stack>
            </Paper>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.2} justifyContent="center">
              <Button
                variant="contained"
                startIcon={<LogOut size={16} />}
                onClick={async () => {
                  await logout();
                  navigate("/login", { replace: true });
                }}
                sx={{ background: "#0057B7", minWidth: 150 }}
              >
                Logout
              </Button>
              <Button
                variant="outlined"
                onClick={() => {
                  window.location.href = `mailto:${supportEmail}?subject=${encodeURIComponent(`DRUPAd access request for ${user?.employeeId || ""}`)}&body=${encodeURIComponent(`User ID: ${user?.employeeId || ""}\nName: ${user?.name || ""}\nRequested page: ${location.pathname}`)}`;
                }}
                sx={{ minWidth: 180, borderColor: "#0057B7", color: "#0057B7" }}
              >
                Contact administrator
              </Button>
              <Button variant="text" onClick={() => navigate("/")} sx={{ color: "#03624C", minWidth: 140 }}>
                Return to homepage
              </Button>
            </Stack>
          </Stack>
        </Paper>
      </Box>
    );
  }
  return (
    <Box className={access.write ? "permission-write" : "permission-read-only"}>
      {!access.write && <Alert severity="info" sx={{ borderRadius: 0 }}>Read-only access: viewing and exports are available; data-changing actions are blocked.</Alert>}
      {children}
    </Box>
  );
}
