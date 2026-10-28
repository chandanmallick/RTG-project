import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import api from "../../crewLegacy/api";
import LeaveBlockedPeriods from "./LeaveBlockedPeriods";

const blank = { title: "", reason: "", startDate: "", endDate: "", submissionDeadline: "", departmentIds: [] };

export default function SpecialEventRoster() {
  const [access, setAccess] = useState(null);
  const [events, setEvents] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blank);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [decision, setDecision] = useState(null);
  const [staffing, setStaffing] = useState(null);
  const [staffingEvent, setStaffingEvent] = useState(null);
  const [additionalDepartment, setAdditionalDepartment] = useState("");
  const [staffingBusy, setStaffingBusy] = useState(false);

  const load = async () => {
    try {
      const [a, e] = await Promise.all([api.get("/special-events/access"), api.get("/special-events")]);
      setAccess(a.data);
      setEvents(Array.isArray(e.data) ? e.data : []);
    } catch (e) {
      setError(e.response?.data?.detail || "Could not load special events");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      if (decision) {
        await api.put(`/special-events/${decision.id}/blocking`, { blocked: !decision.leaveBlocked });
      } else {
        const rawDeptIds = form.departmentIds;
        const deptIds = Array.isArray(rawDeptIds)
          ? rawDeptIds
          : (typeof rawDeptIds === "string" && rawDeptIds.trim()
              ? rawDeptIds.split(",").map(s => s.trim()).filter(Boolean)
              : []);
        await api.post("/special-events", { ...form, departmentIds: deptIds });
      }
      setOpen(false);
      setDecision(null);
      setForm(blank);
      await load();
      window.dispatchEvent(new Event("crew-special-events-changed"));
    } catch (e) {
      setError(e.response?.data?.detail || "Could not save event");
    } finally {
      setBusy(false);
    }
  };

  const viewStaffing = async (event, dept = "") => {
    setStaffingBusy(true);
    setError("");
    try {
      const { data } = await api.get(`/special-events/${event.id}/staffing`, {
        params: { additionalDepartment: dept },
      });
      setStaffing(data);
      setStaffingEvent(event);
      setAdditionalDepartment(dept);
    } catch (e) {
      // Fallback to legacy endpoint if needed
      try {
        const { data } = await api.get(`/leave/blocked-periods/${event.id}/staffing`, {
          params: { additionalDepartment: dept },
        });
        setStaffing(data);
        setStaffingEvent(event);
        setAdditionalDepartment(dept);
      } catch (err) {
        setError(e.response?.data?.detail || err.response?.data?.detail || "Could not load staffing");
      }
    } finally {
      setStaffingBusy(false);
    }
  };

  const downloadStaffingExcel = async () => {
    if (!staffing) return;
    try {
      let res;
      try {
        res = await api.get(`/special-events/${staffing.id}/staffing.xlsx`, {
          params: { additionalDepartment },
          responseType: "blob",
        });
      } catch {
        res = await api.get(`/leave/blocked-periods/${staffing.id}/staffing.xlsx`, {
          params: { additionalDepartment },
          responseType: "blob",
        });
      }
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `special_event_staffing_${staffing.startDate}_${staffing.endDate}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e.response?.data?.detail || "Could not export staffing");
    }
  };

  return (
    <Paper sx={{ p: 2, mb: 2, borderRadius: "20px !important", background: "#FFF !important", boxShadow: "0 8px 28px #54448A0B" }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Box>
          <Typography fontWeight={850} fontSize={19}>Plan event coverage</Typography>
          <Typography variant="body2" color="text.secondary">Announce first. Block leave separately for the chosen departments.</Typography>
        </Box>
        {access?.canManage && (
          <Button
            variant="contained"
            sx={{ borderRadius: "12px !important", bgcolor: "#5C43DC !important", textTransform: "none", whiteSpace: "nowrap" }}
            onClick={() => {
              setForm({ ...blank, departmentIds: access.allowAll ? [] : access.departments.map(d => d.id) });
              setOpen(true);
            }}
          >
            Mark special event
          </Button>
        )}
      </Stack>

      {error && <Alert severity="error" sx={{ mt: 2 }} onClose={() => setError("")}>{error}</Alert>}

      <Stack spacing={1.3} sx={{ mt: 2 }}>
        {events.map((event) => (
          <Box key={event.id} sx={{ p: 2, bgcolor: event.leaveBlocked ? "#FFF3DF" : "#F0EDFF", borderRadius: 3 }}>
            <Typography fontWeight={850}>
              {event.title} <Chip size="small" label={event.leaveBlocked ? "Leave blocked" : "Announced"} />
            </Typography>
            <Typography variant="body2">
              {event.startDate} to {event.endDate} | {event.departmentNames?.join(", ") || "All departments"}
            </Typography>
            {event.submissionDeadline && (
              <Typography variant="body2">Last application submission: {event.submissionDeadline}</Typography>
            )}
            <Typography variant="body2">
              {event.leaveBlocked ? "No leave application in this period" : "Leave applications remain open"}
            </Typography>
            {event.reason && <Typography variant="body2">{event.reason}</Typography>}
            {event.canManage && (
              <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                <Button color="warning" onClick={() => setDecision(event)}>
                  {event.leaveBlocked ? "Reopen leave" : "Block leave"}
                </Button>
                <Button onClick={() => viewStaffing(event, "")}>Staffing view</Button>
              </Stack>
            )}
          </Box>
        ))}
      </Stack>

      {/* CREATE / EDIT DIALOG */}
      <Dialog
        open={open || Boolean(decision)}
        onClose={() => !busy && (setOpen(false), setDecision(null))}
        fullWidth
        maxWidth="sm"
        slotProps={{ paper: { sx: { borderRadius: "24px !important", p: 1, background: "#FAF9FF !important" } } }}
      >
        <DialogTitle>{decision ? (decision.leaveBlocked ? "Reopen leave applications?" : "Block leave for this event?") : "Mark special event"}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            {decision ? (
              <Alert severity="warning">
                {decision.title}: {decision.startDate} to {decision.endDate}. {decision.departmentNames?.join(", ") || "All departments"}. Existing applications are unchanged.
              </Alert>
            ) : (
              <>
                <Alert severity="info">Marking announces the event. It does not block leave until you choose Block leave.</Alert>
                <TextField label="Event name" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                <Stack direction="row" spacing={1}>
                  {["startDate", "endDate"].map((key) => (
                    <TextField
                      key={key}
                      fullWidth
                      type="date"
                      label={key === "startDate" ? "Event from" : "Event through"}
                      InputLabelProps={{ shrink: true }}
                      value={form[key]}
                      onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                    />
                  ))}
                </Stack>
                <TextField
                  type="date"
                  label="Last application submission (optional)"
                  InputLabelProps={{ shrink: true }}
                  value={form.submissionDeadline}
                  onChange={(e) => setForm({ ...form, submissionDeadline: e.target.value })}
                />
                <FormControl fullWidth size="small">
                  <InputLabel id="special-event-depts-label" shrink>Departments</InputLabel>
                  <Select
                    labelId="special-event-depts-label"
                    multiple
                    displayEmpty
                    label="Departments"
                    value={Array.isArray(form.departmentIds) ? form.departmentIds : []}
                    onChange={(e) => {
                      const val = e.target.value;
                      const arr = typeof val === "string" ? (val ? val.split(",") : []) : (Array.isArray(val) ? val : [val].filter(Boolean));
                      setForm((prev) => ({ ...prev, departmentIds: arr }));
                    }}
                    renderValue={(selected) => {
                      const arr = Array.isArray(selected) ? selected : [];
                      if (!arr.length) return "All departments";
                      return access?.departments?.filter((d) => arr.includes(d.id)).map((d) => d.name).join(", ") || "All departments";
                    }}
                  >
                    {access?.departments?.map((d) => {
                      const isSelected = (Array.isArray(form.departmentIds) ? form.departmentIds : []).includes(d.id);
                      return (
                        <MenuItem key={d.id} value={d.id}>
                          <Checkbox checked={isSelected} size="small" sx={{ mr: 1, p: 0 }} />
                          <ListItemText primary={d.name} />
                        </MenuItem>
                      );
                    })}
                  </Select>
                </FormControl>
                {access?.allowAll && (
                  <Button onClick={() => setForm({ ...form, departmentIds: [] })}>All departments</Button>
                )}
                <TextField label="Announcement note" multiline value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
              </>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => { setOpen(false); setDecision(null); }}>Cancel</Button>
          <Button
            disabled={
              busy ||
              (!decision && (
                !form.title.trim() ||
                !form.startDate ||
                !form.endDate ||
                form.endDate < form.startDate ||
                (!access?.allowAll && !(Array.isArray(form.departmentIds) && form.departmentIds.length))
              ))
            }
            variant="contained"
            onClick={save}
          >
            {busy ? "Saving..." : decision ? "Confirm" : "Announce event"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* STAFFING VIEW DIALOG */}
      <Dialog
        open={Boolean(staffing)}
        onClose={() => !staffingBusy && setStaffing(null)}
        fullWidth
        maxWidth="xl"
      >
        <DialogTitle sx={{ fontWeight: 900 }}>
          Special Event Staffing · {staffing?.startDate} to {staffing?.endDate}
        </DialogTitle>
        <DialogContent dividers>
          {staffing && (
            <Stack spacing={2}>
              {staffing.reason && <Alert severity="warning">{staffing.reason}</Alert>}
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ sm: "center" }} flexWrap="wrap">
                <TextField
                  select
                  size="small"
                  label="Additional department strength"
                  value={additionalDepartment}
                  onChange={(e) => viewStaffing(staffingEvent || { id: staffing.id }, e.target.value)}
                  sx={{ minWidth: 260 }}
                >
                  <MenuItem value="">Do not show</MenuItem>
                  {(staffing.departments || []).map((dept) => (
                    <MenuItem key={dept} value={dept}>{dept}</MenuItem>
                  ))}
                </TextField>
                <Button variant="outlined" onClick={downloadStaffingExcel}>Download Excel</Button>
                <Button
                  variant="contained"
                  onClick={() => window.location.assign(`/crew/replacement?tab=duty&date=${staffing.startDate}`)}
                  sx={{ bgcolor: "#0057B7", fontWeight: 800, textTransform: "none" }}
                >
                  Allocate additional manpower
                </Button>
                <Chip label="Duty · Leave · Replacement views" sx={{ bgcolor: "#DBEAFE", color: "#1D4ED8", fontWeight: 800 }} />
              </Stack>

              {/* SECTION 1: DUTY STRENGTH */}
              <Box sx={{ overflow: "auto", border: "1px solid #CBD5E1", borderRadius: 1.5 }}>
                <Typography sx={{ px: 1.2, py: 0.8, bgcolor: "#DDEBF7", fontSize: 12, fontWeight: 950 }}>
                  1. Main duty strength · employees on leave excluded
                </Typography>
                <Table size="small" sx={{ minWidth: Math.max(760, staffing.dates.length * 145) }}>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 900, position: "sticky", left: 0, zIndex: 2, bgcolor: "#FFF" }}>Date</TableCell>
                      {staffing.dates.map((d) => (
                        <TableCell key={d} align="center" sx={{ bgcolor: "#FFF200", fontWeight: 900 }}>
                          {d} <Typography sx={{ fontSize: 11, fontWeight: 900, color: "#C2410C" }}>{staffing.dayNames[d]}</Typography>
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {["Morning", "Evening", "Night"].map((shift) => (
                      <TableRow key={shift}>
                        <TableCell sx={{ fontWeight: 900, position: "sticky", left: 0, bgcolor: "#FFF", zIndex: 1 }}>{shift}</TableCell>
                        {staffing.dates.map((d) => {
                          const list = staffing.shifts?.[shift]?.[d] || [];
                          return (
                            <TableCell key={d} sx={{ verticalAlign: "top" }}>
                              {list.length ? (
                                <Stack spacing={0.4}>
                                  {list.map((p) => (
                                    <Typography key={p.employeeId} sx={{ fontSize: 11, fontWeight: 700 }}>{p.name}</Typography>
                                  ))}
                                </Stack>
                              ) : (
                                <Typography sx={{ textAlign: "center", color: "#64748B", fontSize: 11 }}>NR</Typography>
                              )}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>

              {/* ADDITIONAL MANPOWER STRENGTH SECTION */}
              {additionalDepartment && staffing.additionalStrength && (
                <Box sx={{ overflow: "auto", border: "1px solid #C4B5FD", borderRadius: 1.5 }}>
                  <Typography sx={{ px: 1.2, py: 0.8, bgcolor: "#F3E8FF", fontSize: 12, fontWeight: 950 }}>
                    Additional manpower · {additionalDepartment}
                  </Typography>
                  <Table size="small" sx={{ minWidth: Math.max(760, staffing.dates.length * 145) }}>
                    <TableBody>
                      <TableRow>
                        <TableCell sx={{ minWidth: 90, fontWeight: 900 }}>Available</TableCell>
                        {staffing.dates.map((d) => {
                          const list = staffing.additionalStrength[d] || [];
                          return (
                            <TableCell key={d} sx={{ minWidth: 135, verticalAlign: "top" }}>
                              {list.length ? (
                                list.map((person) => (
                                  <Box key={person.employeeId} sx={{ mb: 0.4 }}>
                                    <Typography sx={{ fontSize: 11, fontWeight: 700 }}>{person.name}</Typography>
                                    <Typography sx={{ fontSize: 9.5, color: "#64748B" }}>{person.assignedDuty || person.duty || "Available"}</Typography>
                                  </Box>
                                ))
                              ) : (
                                <Typography sx={{ color: "#64748B", fontSize: 11 }}>-</Typography>
                              )}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    </TableBody>
                  </Table>
                </Box>
              )}

              {/* SECTION 2: EMPLOYEES ON LEAVE */}
              <Box sx={{ overflow: "auto", border: "1px solid #CBD5E1", borderRadius: 1.5 }}>
                <Typography sx={{ px: 1.2, py: 0.8, bgcolor: "#FCE4D6", fontSize: 12, fontWeight: 950 }}>
                  2. Employees on leave · shift-wise
                </Typography>
                <Table size="small" sx={{ minWidth: Math.max(760, staffing.dates.length * 145) }}>
                  <TableBody>
                    {["Morning", "Evening", "Night"].map((shift) => (
                      <TableRow key={shift}>
                        <TableCell sx={{ fontWeight: 900, minWidth: 90 }}>{shift}</TableCell>
                        {staffing.dates.map((d) => {
                          const list = staffing.leaveShifts?.[shift]?.[d] || [];
                          return (
                            <TableCell key={d} sx={{ verticalAlign: "top" }}>
                              {list.length ? (
                                list.map((p) => (
                                  <Typography key={p.employeeId} sx={{ fontSize: 11, fontWeight: 700 }}>{p.name}</Typography>
                                ))
                              ) : (
                                <Typography sx={{ textAlign: "center", color: "#64748B", fontSize: 11 }}>-</Typography>
                              )}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>

              {/* SECTION 3: REPLACEMENT EMPLOYEES */}
              <Box sx={{ overflow: "auto", border: "1px solid #CBD5E1", borderRadius: 1.5 }}>
                <Typography sx={{ px: 1.2, py: 0.8, bgcolor: "#E2F0D9", fontSize: 12, fontWeight: 950 }}>
                  3. Replacement employees · shift-wise
                </Typography>
                <Table size="small" sx={{ minWidth: Math.max(760, staffing.dates.length * 145) }}>
                  <TableBody>
                    {["Morning", "Evening", "Night"].map((shift) => (
                      <TableRow key={shift}>
                        <TableCell sx={{ fontWeight: 900, minWidth: 90 }}>{shift}</TableCell>
                        {staffing.dates.map((d) => {
                          const list = staffing.replacementShifts?.[shift]?.[d] || [];
                          return (
                            <TableCell key={d} sx={{ verticalAlign: "top" }}>
                              {list.length ? (
                                list.map((p) => (
                                  <Typography key={p.employeeId} sx={{ fontSize: 11, fontWeight: 700 }}>{p.name}</Typography>
                                ))
                              ) : (
                                <Typography sx={{ textAlign: "center", color: "#64748B", fontSize: 11 }}>-</Typography>
                              )}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStaffing(null)}>Close</Button>
        </DialogActions>
      </Dialog>

      {access?.allowAll && (
        <Box sx={{ mt: 2 }}>
          <LeaveBlockedPeriods isAdmin allowCreate={false} />
        </Box>
      )}
    </Paper>
  );
}
