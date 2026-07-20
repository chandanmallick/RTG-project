import React, { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import api from "./api";
import { useNavigate } from "react-router-dom";

import {
  Box,
  Grid,
  Paper,
  Typography,
  Chip,
  Divider,
  Select,
  MenuItem,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField
} from "@mui/material";

export default function Dashboard() {

  // ================= STATE =================
  const navigate = useNavigate();

  const [employee, setEmployee] = useState("")
  const [kpiYear, setKpiYear] = useState(new Date().getFullYear())
  const [kpiMonth, setKpiMonth] = useState(new Date().getMonth() + 1)
  const [kpiMode, setKpiMode] = useState("month")

  const [leaveAnalytics, setLeaveAnalytics] = useState({})
  const [replacementAnalytics, setReplacementAnalytics] = useState({})
  const [trend, setTrend] = useState([])
  const [groupData, setGroupData] = useState([])
  const [employeeStats, setEmployeeStats] = useState([])
  const [employeeList, setEmployeeList] = useState([])
  const [leaveData, setLeaveData] = useState([])

  const [notifications, setNotifications] = useState([]);
  const [denyDialog, setDenyDialog] = useState(false);
  const [selectedNotif, setSelectedNotif] = useState(null);
  const [denyReason, setDenyReason] = useState("");
  const [topReplacement, setTopReplacement] = useState([]);
  const [generalNotifications, setGeneralNotifications] = useState([]);
  const [loadingSecondary, setLoadingSecondary] = useState(false);
  

  const [duty,setDuty] = useState({
    today: { Morning: [], Evening: [], Night: [] },
    tomorrow: { Morning: [], Evening: [], Night: [] }
  })

  // ================= API =================

  useEffect(() => {
    let cancelled = false;

    const params = {
      year: kpiYear,
      month: kpiMode === "month" ? kpiMonth : undefined,
      employeeId: employee || undefined
    };

    const loadCore = async () => {
      try {
        const [leaveRes, replaceRes] = await Promise.all([
          api.get("/dashboard/analytics/leave", { params }),
          api.get("/dashboard/analytics/replacement", { params })
        ]);
        if (cancelled) return;
        setLeaveAnalytics(leaveRes.data || {});
        setReplacementAnalytics(replaceRes.data || {});
        setEmployeeStats([
          { name: employee || "All Employees", count: leaveRes.data?.leaveCount || 0 }
        ]);
      } catch (err) {
        console.error("Dashboard core fetch error:", err);
      }
    };

    const loadSecondary = async () => {
      setLoadingSecondary(true);
      try {
        const [trendRes, groupRes, empListRes, leaveListRes, dutyRes, topRes] = await Promise.all([
          api.get("/dashboard/analytics/leave-trend", { params: { year: kpiYear }}),
          api.get("/dashboard/analytics/group-wise", { params }),
          api.get("/leave/employees"),
          api.get("/dashboard/leave-next-2-days"),
          api.get("/dashboard/duty-today-tomorrow"),
          api.get("/dashboard/top-replacements")
        ]);
        if (cancelled) return;
        setTrend(trendRes.data || []);
        setGroupData(groupRes.data || []);
        setEmployeeList(empListRes.data || []);
        setLeaveData(leaveListRes.data?.data || []);
        setDuty(dutyRes.data || {});
        setTopReplacement(topRes.data || []);
      } catch (err) {
        console.error("Dashboard secondary fetch error:", err);
      } finally {
        if (!cancelled) setLoadingSecondary(false);
      }
    };

    loadCore();
    const timer = window.setTimeout(loadSecondary, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [kpiYear, kpiMonth, kpiMode, employee]);

  const fetchNotifications = async () => {
    try {
      const res = await api.get("/replacement/notifications");
      setNotifications(res.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchGeneralNotifications = async () => {
    try {
      const res = await api.get("/notifications/");
      setGeneralNotifications(res.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const fetchCrewNotifications = async () => {
      try {
        const [replacementRes, generalRes] = await Promise.all([
          api.get("/replacement/notifications"),
          api.get("/notifications/")
        ]);
        if (cancelled) return;
        setNotifications(replacementRes.data || []);
        setGeneralNotifications(generalRes.data || []);
      } catch (err) {
        console.error(err);
      }
    };

    const firstLoad = window.setTimeout(fetchCrewNotifications, 500);
    const interval = setInterval(fetchCrewNotifications, 60000);

    return () => {
      cancelled = true;
      window.clearTimeout(firstLoad);
      clearInterval(interval);
    };
  }, []);
  // ================= HELPERS =================

  const groupedEmployees = useMemo(() => employeeList.reduce((acc, emp) => {
    if (!acc[emp.groupName]) acc[emp.groupName] = [];
    acc[emp.groupName].push(emp);
    return acc;
  }, {}), [employeeList]);

  const visibleNotifications = notifications.slice(0, 4);
  const visibleGeneralNotifications = generalNotifications.slice(0, 5);
  const visibleLeaveData = leaveData.slice(0, 6);
  const trendPoints = trend.map((item) => Number(item.leave || item.count || 0));

  const Sparkline = ({ values = [] }) => {
    if (!values.length) return null;
    const max = Math.max(...values, 1);
    const width = 320;
    const height = 120;
    const step = values.length > 1 ? width / (values.length - 1) : width;
    const points = values
      .map((value, index) => `${index * step},${height - (Number(value || 0) / max) * (height - 18) - 8}`)
      .join(" ");

    return (
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ width: "100%", height: 120, display: "block" }}>
        <polyline points={points} fill="none" stroke="rgba(255,255,255,.95)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  };
  const renderShift = (title, data = []) => (
    <Box sx={{ mb:2 }}>
      <Typography fontWeight="bold" sx={{ mb:1 }}>{title}</Typography>

      <Box sx={{ display:"flex", flexWrap:"wrap", gap:1 }}>
        {data.map((p,i)=>(
          <Chip
            key={i}
            label={
              p.isSIC ? `SIC ${p.name}` : p.name
            }
            sx={{
              background: p.isSIC
                ? "linear-gradient(135deg,#1976d2,#42a5f5)"
                : "#f1f3f9",
              color: p.isSIC ? "#fff" : "#000",
              fontWeight: p.isSIC ? "bold" : "normal"
            }}
          />
        ))}
      </Box>
    </Box>
  )

  


  const GroupDonutChart = ({ data = [] }) => {
    const total = data.reduce((sum, item) => sum + Number(item.count || 0), 0);
    if (!data.length) {
      return <Typography sx={{ mt: 2, color: "#64748B", fontWeight: 700 }}>No group leave data.</Typography>;
    }

    return (
      <Box sx={{ mt: 2, display: "grid", gap: 1.2 }}>
        <Box sx={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <Typography sx={{ fontSize: 13, fontWeight: 800, color: "#64748B" }}>Total</Typography>
          <Typography sx={{ fontSize: 24, fontWeight: 950, color: "#111827" }}>{total}</Typography>
        </Box>
        {data.slice(0, 8).map((item, index) => {
          const value = Number(item.count || 0);
          const pct = total ? Math.max(6, Math.round((value / total) * 100)) : 0;
          return (
            <Box key={`${item.group}-${index}`}>
              <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, mb: .5 }}>
                <Typography sx={{ fontSize: 12, fontWeight: 850, color: "#334155", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.group || "Group"}</Typography>
                <Typography sx={{ fontSize: 12, fontWeight: 900, color: "#0F172A" }}>{value}</Typography>
              </Box>
              <Box sx={{ height: 8, borderRadius: 99, background: "#E2E8F0", overflow: "hidden" }}>
                <Box sx={{ width: `${pct}%`, height: "100%", borderRadius: 99, background: "linear-gradient(90deg,#03624C,#38BDF8)" }} />
              </Box>
            </Box>
          );
        })}
      </Box>
    );
  };

  const ReplacementBarChart = ({ data = [] }) => {
    const max = Math.max(...data.map((item) => Number(item.value || 0)), 1);
    if (!data.length) {
      return <Typography sx={{ mt: 2, color: "#64748B", fontWeight: 700 }}>No replacement load found.</Typography>;
    }

    return (
      <Box sx={{ mt: 2, display: "grid", gap: 1.4 }}>
        {data.slice(0, 8).map((item, index) => {
          const value = Number(item.value || 0);
          return (
            <Box key={`${item.name}-${index}`}>
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, mb: .5 }}>
                <Typography sx={{ fontSize: 13, fontWeight: 850, color: "#334155", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</Typography>
                <Typography sx={{ fontSize: 13, fontWeight: 950, color: "#B45309" }}>{value}</Typography>
              </Box>
              <Box sx={{ height: 12, borderRadius: 99, background: "#FEF3C7", overflow: "hidden" }}>
                <Box sx={{ width: `${Math.max(8, (value / max) * 100)}%`, height: "100%", borderRadius: 99, background: "linear-gradient(90deg,#F97316,#FACC15)" }} />
              </Box>
            </Box>
          );
        })}
      </Box>
    );
  };
  // ================= UI =================

  return (
    <Box sx={{ p:3, background:"#eef1f7", minHeight:"100vh" }}>

      <Grid container spacing={3}>

        {/* LEFT */}
        <Grid item xs={12} md={3}>

          {/* LEAVE KPI */}
          <Paper sx={{
            p:2,
            mb:2,
            borderRadius:3,
            background:"linear-gradient(135deg,#ff9a9e,#fad0c4)",
            boxShadow:"0 10px 25px rgba(0,0,0,0.08)"
          }}>
            <Box sx={{ display:"flex", justifyContent:"space-between" }}>
              <Typography variant="caption">Leaves</Typography>

              <Select size="small" value={kpiMode} onChange={(e)=>setKpiMode(e.target.value)}>
                <MenuItem value="month">Monthly</MenuItem>
                <MenuItem value="year">Yearly</MenuItem>
              </Select>
            </Box>

            <Typography variant="h4">{leaveAnalytics.leaveCount || 0}</Typography>

            <Box sx={{ display:"flex", gap:1 }}>
              <Select size="small" value={kpiYear} onChange={(e)=>setKpiYear(e.target.value)}>
                {[2024,2025,2026].map(y=><MenuItem key={y} value={y}>{y}</MenuItem>)}
              </Select>

              {kpiMode === "month" && (
                <Select size="small" value={kpiMonth} onChange={(e)=>setKpiMonth(e.target.value)}>
                  {[...Array(12)].map((_,i)=><MenuItem key={i+1} value={i+1}>{i+1}</MenuItem>)}
                </Select>
              )}
            </Box>
          </Paper>

          {/* REPLACEMENT */}
          <Paper sx={{
            p:2,
            mb:2,
            borderRadius:3,
            background:"linear-gradient(135deg,#a18cd1,#fbc2eb)",
            boxShadow:"0 10px 25px rgba(0,0,0,0.08)"
          }}>
            <Typography variant="caption">Replacements</Typography>
            <Typography variant="h4">{replacementAnalytics.replacementCount || 0}</Typography>
          </Paper>

          {/* GROUP CHART */}
          <Paper sx={{ p:2, borderRadius:3, mb:2 }}>
            <Typography fontWeight="bold">Group-wise Leave</Typography>
            <GroupDonutChart data={groupData} />
          </Paper>

          <Paper sx={{
            p:2,
            borderRadius:3,
            mb:2,
            background:
              notifications.length === 0
                ? "#e0e0e0"                         // Grey (no data)
                : notifications.some(n => n.status === "Pending")
                  ? "linear-gradient(135deg,#ff9800,#ff5722)"   // Orange (new)
                  : "linear-gradient(135deg,#43a047,#66bb6a)",   // Green (accepted)
            color: notifications.length === 0 ? "#000" : "#fff"
          }}>

            <Typography fontWeight="bold" mb={1}>
              Duty Assignments & Approvals
            </Typography>

            {notifications.length === 0 && (
              <Typography variant="body2">
                No pending assignments
              </Typography>
            )}

            {visibleNotifications.map(n => (

              <Box key={n._id} sx={{
                background:"rgba(255,255,255,0.15)",
                p:1.5,
                borderRadius:2,
                mb:1
              }}>

                <Typography fontWeight="bold">
                  {n.date}
                </Typography>

                <Typography variant="body2">
                  Shift: {n.assignedDuty || "-"}
                </Typography>

                {n.viewerRole === "Controlling Officer" && (
                  <Typography variant="body2">
                    Assigned to: {n.employeeName || n.employeeId}
                  </Typography>
                )}

                <Typography variant="caption">
                  Status: {n.status} · Viewing as {n.viewerRole || "Employee"}
                </Typography>

                <Typography variant="caption" display="block">
                  Deny allowed till: {dayjs(n.cutoffTime).format("DD MMM HH:mm")}
                </Typography>

                <Box sx={{ mt:1, display:"flex", gap:1 }}>

                  {/* ACCEPT */}
                  {n.canAccept && (
                    <Button
                      size="small"
                      variant="contained"
                      color="success"
                      onClick={async ()=>{
                        await api.put(`/replacement/notifications/accept/${n._id}`);
                        fetchNotifications();
                      }}
                    >
                      Accept
                    </Button>
                  )}

                  {/* DENY */}
                  {n.canDeny ? (
                    <Button
                      size="small"
                      variant="contained"
                      color="error"
                      onClick={()=>{
                        setSelectedNotif(n);
                        setDenyDialog(true);
                      }}
                    >
                      Deny
                    </Button>
                  ) : (
                    <Chip
                      label="Locked"
                      size="small"
                      color="success"
                    />
                  )}

                </Box>

              </Box>

            ))}

          </Paper>

          <Paper sx={{ p:2, borderRadius:3, mt:2 }}>
            <Typography fontWeight="bold" mb={1}>
              System Notifications
            </Typography>

            {visibleGeneralNotifications.map(n => (

              <Box
                key={n._id}
                sx={{
                  p:1.2,
                  mb:1,
                  borderRadius:2,
                  background:
                    n.status === "Unread"
                      ? "#e8f5e9"
                      : "#f5f5f5",
                  cursor:"pointer"
                }}
                onClick={async () => {

                  await api.put(`/notifications/read/${n._id}`);

                  if (n.action === "VIEW_LEAVE") {
                    navigate(`/crew/leave`);
                  }

                  fetchGeneralNotifications();
                }}
              >

                <Typography fontWeight="bold">{n.title}</Typography>
                <Typography variant="caption">{n.message}</Typography>

              </Box>

            ))}

          </Paper>

          <Dialog open={denyDialog} onClose={()=>setDenyDialog(false)}>

            <DialogTitle>Deny Duty</DialogTitle>

            <DialogContent>

              <Typography mb={1}>
                Date: {selectedNotif?.date}
              </Typography>

              <TextField
                fullWidth
                label="Reason"
                value={denyReason}
                onChange={(e)=>setDenyReason(e.target.value)}
              />

            </DialogContent>

            <DialogActions>

              <Button onClick={()=>setDenyDialog(false)}>
                Cancel
              </Button>

              <Button
                color="error"
                variant="contained"
                onClick={async ()=>{
                  await api.put(`/replacement/notifications/deny/${selectedNotif._id}`, {
                    reason: denyReason
                  });

                  setDenyDialog(false);
                  setDenyReason("");
                  fetchNotifications();
                }}
              >
                Confirm Deny
              </Button>

            </DialogActions>

          </Dialog>

        </Grid>


        {/* MIDDLE Left*/}
        <Grid item xs={12} md={3}>

          <Paper sx={{ p:2, mb:2, borderRadius:3, background:"#ffe082" }}>
            <Typography fontWeight="bold">Today Duty</Typography>
            {renderShift("Morning", duty.today?.Morning)}
            {renderShift("Evening", duty.today?.Evening)}
            {renderShift("Night", duty.today?.Night)}
          </Paper>

          <Paper sx={{ p:2, borderRadius:3, background:"#ffd54f" }}>
            <Typography fontWeight="bold">Tomorrow Duty</Typography>
            {renderShift("Morning", duty.tomorrow?.Morning)}
            {renderShift("Evening", duty.tomorrow?.Evening)}
            {renderShift("Night", duty.tomorrow?.Night)}
          </Paper>

        </Grid>


        {/* MIDDLE RIGHT */}
        <Grid item xs={12} md={3}>

          {/* TREND */}
          <Paper sx={{
            p:2.5,
            mb:2,
            borderRadius:4,
            color:"#fff",
            position:"relative",
            overflow:"hidden",
            height:180,
            background:"linear-gradient(135deg,#6a11cb,#2575fc)" // ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¥ gradient bg
          }}>

            {/* TEXT */}
            <Typography variant="caption">Leave Trend</Typography>
            <Typography variant="h5" fontWeight="bold">
              {leaveAnalytics.leaveCount || 0}
            </Typography>

            {/* GRAPH */}
            <Box sx={{
              position:"absolute",
              bottom:0,
              left:0,
              right:0,
              opacity:0.6
            }}>
              <Sparkline values={trendPoints} />
            </Box>

          </Paper>

          {/* EMPLOYEE */}
          <Paper sx={{ p:2, mb:2, borderRadius:3, background:"#a18cd1", boxShadow:"0 10px 25px rgba(0,0,0,0.08)" }}>
            <Box sx={{ display:"flex", justifyContent:"space-between" }}>
              <Typography fontWeight="bold">Employee Leave</Typography>

              <Select size="small" value={employee} onChange={(e)=>setEmployee(e.target.value)}>
                <MenuItem value="">All</MenuItem>

                {Object.keys(groupedEmployees).map(group => ([
                  <MenuItem key={group} disabled>{group}</MenuItem>,
                  groupedEmployees[group].map(emp=>(
                    <MenuItem key={emp.employeeId} value={emp.employeeId}>
                      {emp.name}
                    </MenuItem>
                  ))
                ]))}
              </Select>
            </Box>

            {employeeStats.map((e,i)=>(
              <Box key={i} sx={{
                display:"flex",
                justifyContent:"space-between",
                mt:2,
                p:1.5,
                borderRadius:2,
                background:"#f1f3f9"
              }}>
                <Typography>{e.name}</Typography>
                <Typography fontWeight="bold">{e.count}</Typography>
              </Box>
            ))}
          </Paper>

          {/* UPCOMING */}
          <Paper sx={{ p:2, borderRadius:3 }}>
            <Typography fontWeight="bold">Upcoming Leave</Typography>
            <Divider sx={{ my:1 }}/>

            {loadingSecondary && !visibleLeaveData.length && (
              <Typography sx={{ color: "#64748B", fontWeight: 700, py: 1 }}>Loading upcoming leave...</Typography>
            )}

            {visibleLeaveData.map((l,i)=>(
              <Box key={i} sx={{
                display:"flex",
                justifyContent:"space-between",
                p:1.5,
                mb:1,
                borderRadius:2,
                background:"#f9fbff"
              }}>
                <Box>
                  <Typography fontWeight="bold">{l.employeeName}</Typography>
                  <Typography variant="caption">{l.date}</Typography>
                </Box>
                <Chip label={l.replacementName || "Pending"} size="small"/>
              </Box>
            ))}
          </Paper>

        </Grid>

        {/* RIGHT */}

        <Grid item xs={12} md={3}>

          <Paper sx={{ p:2, borderRadius:3 }}>

            <Typography fontWeight="bold" mb={1}>
              Top Replacement Load (60 Days)
            </Typography>

            <ReplacementBarChart data={topReplacement} />

          </Paper>

        </Grid>

      </Grid>

    </Box>
  )
}

