import React, { useEffect, useMemo, useState } from "react";
import api from "./api";
import { useAuth } from "../auth/AuthContext";

import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import {
  Award,
  Briefcase,
  CalendarDays,
  Camera,
  Clock3,
  History,
  Mail,
  Phone,
  ShieldCheck,
  User,
} from "lucide-react";

const currentEmployeeId = () =>
  localStorage.getItem("crewEmployeeId") ||
  localStorage.getItem("employeeId") ||
  "";

const shortDate = (value) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

const numberText = (value) => Number(value || 0).toLocaleString("en-IN");

function InfoLine({ icon, label, value }) {
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: "22px 92px 1fr", gap: 1, alignItems: "center" }}>
      <Box sx={{ color: "#5B55B2", display: "flex" }}>{icon}</Box>
      <Typography sx={{ color: "#7B7F9E", fontSize: 12, fontWeight: 800 }}>{label}</Typography>
      <Typography sx={{ color: "#24213F", fontSize: 13, fontWeight: 900, overflowWrap: "anywhere" }}>{value || "-"}</Typography>
    </Box>
  );
}

function StatPill({ label, value, tone = "blue" }) {
  const palette = {
    blue: ["#EEF2FF", "#4F46E5"],
    green: ["#E9FBF2", "#039855"],
    pink: ["#FFF0F7", "#C11574"],
    amber: ["#FFF7E8", "#B54708"],
  }[tone];

  return (
    <Box sx={{ p: 1.4, borderRadius: 3, background: palette[0], minWidth: 0 }}>
      <Typography sx={{ fontSize: 11, color: "#72789A", fontWeight: 850 }}>{label}</Typography>
      <Typography sx={{ mt: 0.4, color: palette[1], fontSize: 24, fontWeight: 950, lineHeight: 1 }}>{numberText(value)}</Typography>
    </Box>
  );
}

function MiniListCard({ title, items, emptyText, renderItem, action }) {
  return (
    <Paper elevation={0} sx={{ p: 2.4, borderRadius: 5, background: "#FFFFFF", boxShadow: "0 18px 45px rgba(72, 83, 140, 0.08)" }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} mb={1.5}>
        <Typography sx={{ fontSize: 16, color: "#24213F", fontWeight: 950 }}>{title}</Typography>
        {action}
      </Stack>
      <Stack spacing={1.1}>
        {items?.length ? items.map(renderItem) : <Typography sx={{ color: "#8A91AD", fontSize: 13, fontWeight: 700 }}>{emptyText}</Typography>}
      </Stack>
    </Paper>
  );
}

export default function Profile() {
  const { refreshSession } = useAuth();
  const employeeId = currentEmployeeId();
  const [profile, setProfile] = useState({});
  const [photo, setPhoto] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loadingSecondary, setLoadingSecondary] = useState(false);

  const [dutyStats, setDutyStats] = useState([]);
  const [leaveStats, setLeaveStats] = useState([]);
  const [trainingStats, setTrainingStats] = useState([]);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [leaveYear, setLeaveYear] = useState(new Date().getFullYear());
  const [fy, setFy] = useState("2025-26");
  const [coffStats, setCoffStats] = useState({ summary: {}, details: [] });
  const [openCoff, setOpenCoff] = useState(false);
  const [loginHistory, setLoginHistory] = useState([]);
  const [timelineData, setTimelineData] = useState([]);
  const [openLogin, setOpenLogin] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [editingPassword, setEditingPassword] = useState(false);
  const [profileBeforeEdit, setProfileBeforeEdit] = useState(null);
  const [notice, setNotice] = useState(null);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const localPhotoUrl = useMemo(() => (photo ? URL.createObjectURL(photo) : ""), [photo]);
  const profileImage = localPhotoUrl || profile.profilePhoto || "";

  const dutyTotal = useMemo(() => dutyStats.reduce((sum, item) => sum + Number(item.count || 0), 0), [dutyStats]);
  const leaveTotal = useMemo(() => leaveStats.reduce((sum, item) => sum + Number(item.count || 0), 0), [leaveStats]);
  const trainingTotal = useMemo(() => trainingStats.reduce((sum, item) => sum + Number(item.count || 0), 0), [trainingStats]);

  const fetchProfile = async () => {
    if (!employeeId) return;
    const res = await api.get(`/profile/${employeeId}`);
    setProfile(res.data || {});
  };

  const fetchDutyStats = async () => {
    const res = await api.get("/profile/stats/duty", { params: { employeeId, year, month } });
    setDutyStats(res.data?.stats || []);
  };

  const fetchLeaveStats = async () => {
    const res = await api.get("/profile/stats/leave", { params: { employeeId, year: leaveYear } });
    setLeaveStats(res.data?.stats || []);
  };

  const fetchTrainingStats = async () => {
    const res = await api.get("/profile/stats/training", { params: { employeeId, financialYear: fy } });
    setTrainingStats(res.data?.stats || []);
  };

  const fetchCoffStats = async () => {
    const res = await api.get("/profile/stats/coff", { params: { employeeId } });
    setCoffStats(res.data || { summary: {}, details: [] });
  };

  const fetchLoginHistory = async () => {
    const res = await api.get(`/auth/login-history/${employeeId}`);
    setLoginHistory(res.data || []);
  };

  const fetchTimeline = async () => {
    const res = await api.get(`/roster/shift-history/${employeeId}`);
    setTimelineData((res.data || []).map((row) => ({
      group: row.groupName,
      startDate: row.startDate,
      endDate: row.endDate || "Present",
    })));
  };

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoadingProfile(true);
      try {
        await fetchProfile();
      } catch (error) {
        console.error(error);
      } finally {
        if (active) setLoadingProfile(false);
      }

      window.setTimeout(async () => {
        if (!active || !employeeId) return;
        setLoadingSecondary(true);
        await Promise.allSettled([
          fetchDutyStats(),
          fetchLeaveStats(),
          fetchTrainingStats(),
          fetchCoffStats(),
          fetchLoginHistory(),
          fetchTimeline(),
        ]);
        if (active) setLoadingSecondary(false);
      }, 100);
    };
    load();
    return () => {
      active = false;
    };
  }, [employeeId]);

  useEffect(() => () => {
    if (localPhotoUrl) URL.revokeObjectURL(localPhotoUrl);
  }, [localPhotoUrl]);

  const handleSave = async () => {
    try {
      const formData = new FormData();
      formData.append("employeeId", employeeId);
      formData.append("name", profile.name || "");
      formData.append("nameHindi", profile.nameHindi || "");
      formData.append("designation", profile.designation || "");
      formData.append("designationHindi", profile.designationHindi || "");
      formData.append("phone", profile.phone || "");
      formData.append("gmail", profile.gmail || profile.email || "");
      if (photo instanceof File) formData.append("photo", photo);
      setSavingProfile(true);
      const res = await api.post("/profile/update", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setProfile(res.data || {});
      setPhoto(null);
      await refreshSession();
      setNotice({ severity: "success", text: "Profile updated successfully." });
      setEditingProfile(false);
      setProfileBeforeEdit(null);
    } catch (error) {
      console.error(error);
      setNotice({ severity: "error", text: error.response?.data?.detail || "Update failed" });
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePasswordChange = async () => {
    try {
      setChangingPassword(true);
      const formData = new FormData();
      formData.append("employeeId", employeeId);
      formData.append("currentPassword", passwordForm.currentPassword || "");
      formData.append("newPassword", passwordForm.newPassword || "");
      formData.append("confirmPassword", passwordForm.confirmPassword || "");
      await api.post("/profile/change-password", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setNotice({ severity: "success", text: "Password changed successfully." });
      setEditingPassword(false);
    } catch (error) {
      console.error(error);
      setNotice({ severity: "error", text: error.response?.data?.detail || "Password change failed" });
    } finally {
      setChangingPassword(false);
    }
  };

  const beginProfileEdit = () => {
    setProfileBeforeEdit({ ...profile });
    setEditingProfile(true);
  };

  const cancelProfileEdit = () => {
    if (profileBeforeEdit) setProfile(profileBeforeEdit);
    setPhoto(null);
    setProfileBeforeEdit(null);
    setEditingProfile(false);
  };

  const cancelPasswordEdit = () => {
    setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    setEditingPassword(false);
  };

  return (
    <Box className="ui-kit-page ui-kit-profile" sx={{ minHeight: "calc(100vh - 120px)", borderRadius: 3, background: "#F8FAFC", p: { xs: 1.5, md: 2.5 } }}>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "150px minmax(0,1fr) 230px" }, gap: 2.4 }}>
        <Paper elevation={0} sx={{ display: { xs: "none", lg: "flex" }, flexDirection: "column", minHeight: 620, borderRadius: 0, borderTopLeftRadius: 28, borderBottomLeftRadius: 28, background: "#5B55B2", color: "#FFFFFF", overflow: "hidden" }}>
          <Box sx={{ px: 2.2, pt: 2.5, pb: 3, fontSize: 22, fontWeight: 950, letterSpacing: "-.03em" }}>DRUPAd</Box>
          {["Profile", "Duty", "Leave", "Training", "C-OFF", "Login"].map((item, index) => (
            <Box key={item} sx={{ mx: 1.5, mb: 0.7, px: 1.3, py: 1, borderRadius: 999, background: index === 0 ? "#FFFFFF" : "transparent", color: index === 0 ? "#2F2B73" : "rgba(255,255,255,.86)", fontSize: 12, fontWeight: 900 }}>
              {item}
            </Box>
          ))}
          <Box sx={{ mt: "auto", p: 2 }}>
            <Box sx={{ height: 120, borderRadius: 5, background: "linear-gradient(145deg,#6EE7B7,#8B5CF6)", opacity: 0.85 }} />
          </Box>
        </Paper>

        <Box sx={{ display: "grid", gap: 2.4, minWidth: 0 }}>
          {notice && (
            <Alert severity={notice.severity} onClose={() => setNotice(null)}>
              {notice.text}
            </Alert>
          )}
          <Paper elevation={0} sx={{ p: 2.6, borderRadius: 5, background: "#FFFFFF", boxShadow: "0 18px 45px rgba(72, 83, 140, 0.08)" }}>
            <Stack direction={{ xs: "column", md: "row" }} spacing={2.5} alignItems={{ xs: "flex-start", md: "center" }}>
              <Box sx={{ position: "relative" }}>
                <Avatar src={profileImage} sx={{ width: 112, height: 112, background: "#EDE9FE", color: "#5B55B2", fontSize: 36, fontWeight: 950 }}>
                  {(profile.name || employeeId || "?").slice(0, 1)}
                </Avatar>
                {editingProfile && (
                  <Button component="label" sx={{ position: "absolute", right: -8, bottom: -6, minWidth: 0, width: 38, height: 38, borderRadius: "50%", background: "#5B55B2", color: "#fff", "&:hover": { background: "#47409A" } }}>
                    <Camera size={17} />
                    <input hidden type="file" accept="image/*" onChange={(event) => setPhoto(event.target.files?.[0] || null)} />
                  </Button>
                )}
              </Box>

              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
                  <Box>
                    <Typography sx={{ fontSize: 22, fontWeight: 950, color: "#24213F" }}>{loadingProfile ? "Loading profile..." : profile.name || employeeId || "-"}</Typography>
                    <Typography sx={{ mt: 0.3, color: "#7B7F9E", fontSize: 13, fontWeight: 800 }}>{profile.designation || "Crew member"}</Typography>
                  </Box>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Chip icon={<ShieldCheck size={15} />} label={employeeId || "No ID"} sx={{ background: "#EEF2FF", color: "#4F46E5", fontWeight: 900 }} />
                    {!editingProfile && <Button size="small" variant="outlined" onClick={beginProfileEdit} sx={{ textTransform: "none", fontWeight: 900 }}>Edit profile</Button>}
                  </Stack>
                </Stack>

                <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" }, gap: 1.1, mt: 2 }}>
                  <InfoLine icon={<CalendarDays size={15} />} label="Employee ID" value={profile.employeeId || profile.userId || employeeId} />
                  <InfoLine icon={<User size={15} />} label="Name (Hindi)" value={profile.nameHindi || "-"} />
                  <InfoLine icon={<Briefcase size={15} />} label="Designation" value={profile.designation || "-"} />
                  <InfoLine icon={<Briefcase size={15} />} label="Desig. (Hindi)" value={profile.designationHindi || "-"} />
                  <InfoLine icon={<Mail size={15} />} label="Email" value={profile.gmail || profile.email || "-"} />
                  <InfoLine icon={<Phone size={15} />} label="Phone" value={profile.phone || "-"} />
                </Box>
              </Box>
            </Stack>

            {editingProfile && <>
              <Divider sx={{ my: 2.3 }} />
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" }, gap: 1.5 }}>
                <TextField size="small" label="Name" value={profile.name || ""} onChange={(event) => setProfile((current) => ({ ...current, name: event.target.value }))} fullWidth />
                <TextField size="small" label="Name (Hindi)" value={profile.nameHindi || ""} onChange={(event) => setProfile((current) => ({ ...current, nameHindi: event.target.value }))} fullWidth />
                <TextField size="small" label="Designation" value={profile.designation || ""} onChange={(event) => setProfile((current) => ({ ...current, designation: event.target.value }))} fullWidth />
                <TextField size="small" label="Designation (Hindi)" value={profile.designationHindi || ""} onChange={(event) => setProfile((current) => ({ ...current, designationHindi: event.target.value }))} fullWidth />
                <TextField size="small" label="Mobile no" value={profile.phone || ""} onChange={(event) => setProfile((current) => ({ ...current, phone: event.target.value }))} fullWidth />
                <TextField size="small" label="Mail ID" value={profile.gmail || profile.email || ""} onChange={(event) => setProfile((current) => ({ ...current, gmail: event.target.value, email: event.target.value }))} fullWidth />
              </Box>
              <Stack direction="row" spacing={1.5} justifyContent="flex-end" mt={2}>
                <Button onClick={cancelProfileEdit} disabled={savingProfile} sx={{ textTransform: "none", fontWeight: 900 }}>Cancel</Button>
                <Button onClick={handleSave} disabled={savingProfile} variant="contained" sx={{ borderRadius: 2.5, px: 3, background: "#5B55B2", fontWeight: 950, textTransform: "none" }}>
                  {savingProfile ? "Saving..." : "Save profile"}
                </Button>
              </Stack>
            </>}
          </Paper>

          <Paper elevation={0} sx={{ p: 2.6, borderRadius: 5, background: "#FFFFFF", boxShadow: "0 18px 45px rgba(72, 83, 140, 0.08)" }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} mb={editingPassword ? 1.5 : 0}>
              <Stack direction="row" alignItems="center" spacing={1}>
                <User size={18} color="#5B55B2" />
                <Typography sx={{ fontSize: 16, color: "#24213F", fontWeight: 950 }}>Password</Typography>
              </Stack>
              {!editingPassword && <Button size="small" variant="outlined" onClick={() => setEditingPassword(true)} sx={{ textTransform: "none", fontWeight: 900 }}>Change password</Button>}
            </Stack>
            {editingPassword && <><Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3, minmax(0, 1fr))" }, gap: 1.5 }}>
              <TextField
                size="small"
                type="password"
                label="Current password"
                value={passwordForm.currentPassword}
                onChange={(event) => setPasswordForm((current) => ({ ...current, currentPassword: event.target.value }))}
                fullWidth
              />
              <TextField
                size="small"
                type="password"
                label="New password"
                value={passwordForm.newPassword}
                onChange={(event) => setPasswordForm((current) => ({ ...current, newPassword: event.target.value }))}
                fullWidth
              />
              <TextField
                size="small"
                type="password"
                label="Confirm password"
                value={passwordForm.confirmPassword}
                onChange={(event) => setPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))}
                fullWidth
              />
            </Box>
            <Stack direction="row" spacing={1.5} justifyContent="flex-end" mt={2}>
              <Button onClick={cancelPasswordEdit} disabled={changingPassword} sx={{ textTransform: "none", fontWeight: 900 }}>Cancel</Button>
              <Button onClick={handlePasswordChange} disabled={changingPassword} variant="contained" sx={{ borderRadius: 2.5, px: 3, background: "#24213F", fontWeight: 950, textTransform: "none" }}>
                {changingPassword ? "Changing..." : "Change password"}
              </Button>
            </Stack>
            </>}
          </Paper>

          <Paper elevation={0} sx={{ p: 2.4, borderRadius: 5, background: "#FFFFFF", boxShadow: "0 18px 45px rgba(72, 83, 140, 0.08)" }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1.5}>
              <Typography sx={{ fontSize: 16, color: "#24213F", fontWeight: 950 }}>Activity summary</Typography>
              {loadingSecondary && <CircularProgress size={18} sx={{ color: "#5B55B2" }} />}
            </Stack>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" }, gap: 1.3 }}>
              <StatPill label="Duty" value={dutyTotal} tone="blue" />
              <StatPill label="Leave" value={leaveTotal} tone="pink" />
              <StatPill label="Training" value={trainingTotal} tone="green" />
              <StatPill label="C-OFF" value={coffStats.summary?.available || 0} tone="amber" />
            </Box>
          </Paper>

          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1.1fr .9fr" }, gap: 2.4 }}>
            <MiniListCard
              title="Shift timeline"
              emptyText="No shift timeline found."
              items={timelineData.slice(0, 4)}
              renderItem={(item, index) => (
                <Box key={`${item.group}-${index}`} sx={{ display: "grid", gridTemplateColumns: "22px 1fr auto", gap: 1.2, alignItems: "center", p: 1.3, borderRadius: 3, background: index % 2 ? "#FFF3FA" : "#F1F0FF" }}>
                  <Box sx={{ width: 13, height: 13, borderRadius: "50%", background: "#5B55B2", boxShadow: "0 0 0 4px #E5E2FF" }} />
                  <Box>
                    <Typography sx={{ fontSize: 13, fontWeight: 950, color: "#24213F" }}>{item.group}</Typography>
                    <Typography sx={{ fontSize: 11, fontWeight: 800, color: "#7B7F9E" }}>{shortDate(item.startDate)} - {shortDate(item.endDate)}</Typography>
                  </Box>
                  <Clock3 size={17} color="#8B5CF6" />
                </Box>
              )}
            />

            <MiniListCard
              title="Login history"
              emptyText="No login records."
              items={loginHistory.slice(0, 3)}
              action={<Button size="small" onClick={() => setOpenLogin(true)} sx={{ textTransform: "none", fontWeight: 900 }}>View all</Button>}
              renderItem={(item, index) => (
                <Box key={`${item.loginTime}-${index}`} sx={{ p: 1.2, borderRadius: 3, background: "#F8FAFF" }}>
                  <Typography sx={{ fontSize: 12, fontWeight: 900, color: "#24213F" }}>{shortDate(item.loginTime)}</Typography>
                  <Typography sx={{ fontSize: 11, color: "#7B7F9E", fontWeight: 800 }}>Status: {item.status || "-"}</Typography>
                </Box>
              )}
            />
          </Box>
        </Box>

        <Box sx={{ display: "grid", gap: 2.4, alignContent: "start" }}>
          <Paper elevation={0} sx={{ p: 2.4, borderRadius: 5, background: "#FFFFFF", boxShadow: "0 18px 45px rgba(72, 83, 140, 0.08)" }}>
            <Typography sx={{ fontSize: 16, color: "#24213F", fontWeight: 950 }}>Quick filters</Typography>
            <Stack spacing={1.2} mt={1.5}>
              <Stack direction="row" spacing={1}>
                <TextField size="small" label="Month" value={month} onChange={(event) => setMonth(event.target.value)} />
                <TextField size="small" label="Year" value={year} onChange={(event) => setYear(event.target.value)} />
              </Stack>
              <Button onClick={fetchDutyStats} variant="contained" sx={{ background: "#5B55B2", borderRadius: 2.5, textTransform: "none", fontWeight: 950 }}>Load duty</Button>
              <TextField size="small" label="Leave year" value={leaveYear} onChange={(event) => setLeaveYear(event.target.value)} />
              <Button onClick={fetchLeaveStats} sx={{ borderRadius: 2.5, textTransform: "none", fontWeight: 950 }}>Load leave</Button>
              <TextField size="small" label="Financial year" value={fy} onChange={(event) => setFy(event.target.value)} />
              <Button onClick={fetchTrainingStats} sx={{ borderRadius: 2.5, textTransform: "none", fontWeight: 950 }}>Load training</Button>
            </Stack>
          </Paper>

          <Paper elevation={0} sx={{ p: 2.4, borderRadius: 5, background: "#5B55B2", color: "#FFFFFF", boxShadow: "0 18px 45px rgba(72, 83, 140, 0.16)" }}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Award size={22} />
              <Typography sx={{ fontSize: 18, fontWeight: 950 }}>C-OFF Balance</Typography>
            </Stack>
            <Typography sx={{ mt: 2, fontSize: 38, fontWeight: 950, lineHeight: 1 }}>{numberText(coffStats.summary?.available || 0)}</Typography>
            <Typography sx={{ mt: 0.5, fontSize: 13, fontWeight: 800, opacity: 0.86 }}>Used {numberText(coffStats.summary?.used || 0)} of {numberText(coffStats.summary?.total || 0)}</Typography>
            <Button onClick={() => setOpenCoff(true)} variant="contained" sx={{ mt: 4, width: "100%", borderRadius: 2.5, background: "#FFFFFF", color: "#5B55B2", textTransform: "none", fontWeight: 950, "&:hover": { background: "#F2F0FF" } }}>View details</Button>
          </Paper>
        </Box>
      </Box>

      <Dialog open={openCoff} onClose={() => setOpenCoff(false)} fullWidth maxWidth="sm">
        <DialogTitle>C-OFF Details</DialogTitle>
        <DialogContent>
          {coffStats.details?.length ? coffStats.details.map((item, index) => (
            <Box key={`${item.earnedDate}-${index}`} sx={{ p: 1.5, mb: 1, borderRadius: 2.5, background: item.status === "Used" ? "#FFF0F3" : "#ECFDF3" }}>
              <Typography sx={{ fontWeight: 900 }}>Earned: {item.earnedDate || "-"}</Typography>
              <Typography sx={{ fontSize: 13 }}>Expiry: {item.expiryDate || "-"}</Typography>
              <Typography sx={{ fontSize: 13 }}>Status: {item.status || "-"}</Typography>
              {item.usedDate && <Typography sx={{ fontSize: 13 }}>Used On: {item.usedDate}</Typography>}
            </Box>
          )) : <Typography>No data</Typography>}
        </DialogContent>
      </Dialog>

      <Dialog open={openLogin} onClose={() => setOpenLogin(false)} fullWidth maxWidth="sm">
        <DialogTitle>Full Login History</DialogTitle>
        <DialogContent>
          {loginHistory.map((item, index) => (
            <Box key={`${item.loginTime}-${index}`} sx={{ mb: 1, p: 1.2, borderBottom: "1px solid #E5E7EB" }}>
              <Typography fontSize={14}>{new Date(item.loginTime).toLocaleString()}</Typography>
              <Typography fontSize={12}>Status: {item.status}</Typography>
              {item.logoutTime && <Typography fontSize={12}>Logout: {new Date(item.logoutTime).toLocaleString()}</Typography>}
            </Box>
          ))}
        </DialogContent>
      </Dialog>
    </Box>
  );
}
