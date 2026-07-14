import React, { useEffect, useMemo, useState } from "react";
import api, { BASE_URL } from "./api";

import {
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

  const localPhotoUrl = useMemo(() => (photo ? URL.createObjectURL(photo) : ""), [photo]);
  const profileImage = localPhotoUrl || (profile.profilePhoto ? `${BASE_URL}${profile.profilePhoto}` : "");

  const dutyTotal = useMemo(() => dutyStats.reduce((sum, item) => sum + Number(item.count || 0), 0), [dutyStats]);
  const leaveTotal = useMemo(() => leaveStats.reduce((sum, item) => sum + Number(item.count || 0), 0), [leaveStats]);
  const trainingTotal = useMemo(() => trainingStats.reduce((sum, item) => sum + Number(item.count || 0), 0), [trainingStats]);

  const fetchProfile = async () => {
    if (!employeeId) return;
    const res = await api.get(`/profile/profile/${employeeId}`);
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
      formData.append("nameHindi", profile.nameHindi || "");
      formData.append("phone", profile.phone || "");
      if (photo instanceof File) formData.append("photo", photo);
      const res = await api.post("/profile/profile/update", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setProfile(res.data || {});
    } catch (error) {
      console.error(error);
      alert("Update failed");
    }
  };

  const uploadPhoto = async (file) => {
    if (!file) return;
    setPhoto(file);
    const formData = new FormData();
    formData.append("employeeId", employeeId);
    formData.append("photo", file);
    await api.post("/profile/update", formData, { headers: { "Content-Type": "multipart/form-data" } });
    await fetchProfile();
  };

  return (
    <Box sx={{ minHeight: "calc(100vh - 120px)", borderRadius: 6, background: "#EAF2FF", p: { xs: 1.5, md: 2.5 } }}>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "150px minmax(0,1fr) 230px" }, gap: 2.4 }}>
        <Paper elevation={0} sx={{ display: { xs: "none", lg: "flex" }, flexDirection: "column", minHeight: 620, borderRadius: 0, borderTopLeftRadius: 28, borderBottomLeftRadius: 28, background: "#5B55B2", color: "#FFFFFF", overflow: "hidden" }}>
          <Box sx={{ px: 2.2, pt: 2.5, pb: 3, fontSize: 14, fontWeight: 950, letterSpacing: ".08em" }}>DHRUV</Box>
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
          <Paper elevation={0} sx={{ p: 2.6, borderRadius: 5, background: "#FFFFFF", boxShadow: "0 18px 45px rgba(72, 83, 140, 0.08)" }}>
            <Stack direction={{ xs: "column", md: "row" }} spacing={2.5} alignItems={{ xs: "flex-start", md: "center" }}>
              <Box sx={{ position: "relative" }}>
                <Avatar src={profileImage} sx={{ width: 112, height: 112, background: "#EDE9FE", color: "#5B55B2", fontSize: 36, fontWeight: 950 }}>
                  {(profile.name || employeeId || "?").slice(0, 1)}
                </Avatar>
                <Button component="label" sx={{ position: "absolute", right: -8, bottom: -6, minWidth: 0, width: 38, height: 38, borderRadius: "50%", background: "#5B55B2", color: "#fff", "&:hover": { background: "#47409A" } }}>
                  <Camera size={17} />
                  <input hidden type="file" accept="image/*" onChange={(event) => uploadPhoto(event.target.files?.[0])} />
                </Button>
              </Box>

              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
                  <Box>
                    <Typography sx={{ fontSize: 22, fontWeight: 950, color: "#24213F" }}>{loadingProfile ? "Loading profile..." : profile.name || employeeId || "-"}</Typography>
                    <Typography sx={{ mt: 0.3, color: "#7B7F9E", fontSize: 13, fontWeight: 800 }}>{profile.designation || "Crew member"}</Typography>
                  </Box>
                  <Chip icon={<ShieldCheck size={15} />} label={employeeId || "No ID"} sx={{ background: "#EEF2FF", color: "#4F46E5", fontWeight: 900 }} />
                </Stack>

                <Stack spacing={1.1} mt={2}>
                  <InfoLine icon={<CalendarDays size={15} />} label="Employee ID" value={profile.employeeId || profile.userId || employeeId} />
                  <InfoLine icon={<Briefcase size={15} />} label="Department" value={profile.department || profile.vertical || "-"} />
                  <InfoLine icon={<Mail size={15} />} label="Email" value={profile.email || "-"} />
                  <InfoLine icon={<Phone size={15} />} label="Phone" value={profile.phone || "-"} />
                </Stack>
              </Box>
            </Stack>

            <Divider sx={{ my: 2.3 }} />
            <Stack direction={{ xs: "column", md: "row" }} spacing={1.5}>
              <TextField size="small" label="Phone" value={profile.phone || ""} onChange={(event) => setProfile((current) => ({ ...current, phone: event.target.value }))} fullWidth />
              <TextField size="small" label="Name (Hindi)" value={profile.nameHindi || ""} onChange={(event) => setProfile((current) => ({ ...current, nameHindi: event.target.value }))} fullWidth />
              <Button onClick={handleSave} variant="contained" sx={{ borderRadius: 2.5, px: 3, background: "#5B55B2", fontWeight: 950, textTransform: "none" }}>Save</Button>
            </Stack>
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
