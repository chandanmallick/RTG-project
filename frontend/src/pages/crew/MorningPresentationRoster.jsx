import { useEffect, useMemo, useRef, useState } from "react";
import html2canvas from "html2canvas";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  CheckCircle2,
  Download,
  RefreshCw,
  Save,
  Sparkles,
  Users,
} from "lucide-react";

import api from "../../crewLegacy/api";

const monthValue = () => {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
};

const unitTypeLabel = {
  department: "Department",
  vertical: "Vertical",
  function: "Function",
};

const groupEntries = (entries = []) => {
  const groups = [];
  const byId = new Map();
  entries.forEach((entry, index) => {
    const key = entry.slotId || `manual-${index}`;
    if (!byId.has(key)) {
      const block = {
        slotId: key,
        dates: [],
        employeeId: entry.employeeId || "",
        employeeName: entry.employeeName || "",
        designation: entry.designation || "",
        department: entry.department || "",
        manual: Boolean(entry.manual),
      };
      byId.set(key, block);
      groups.push(block);
    }
    byId.get(key).dates.push({
      date: entry.date,
      day: entry.day,
    });
  });
  return groups;
};

export default function MorningPresentationRoster() {
  const [setup, setSetup] = useState(null);
  const [draft, setDraft] = useState(null);
  const [month, setMonth] = useState(monthValue());
  const [blocks, setBlocks] = useState([]);
  const [cycleStateAfter, setCycleStateAfter] = useState({});
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState(null);
  const [holidays, setHolidays] = useState([]);
  const snapshotRef = useRef(null);

  const employees = setup?.employees || [];
  const employeeById = useMemo(
    () => Object.fromEntries(employees.map((item) => [item.id, item])),
    [employees],
  );
  const cutoff = (setup?.designations || []).find(
    (item) => item.id === draft?.cutoffDesignationId,
  );
  const organizationUnitOptions = setup?.organizationUnitOptions || [];
  const selectedOrganizationUnits = useMemo(() => {
    const selected = new Set(draft?.organizationUnitIds || []);
    return organizationUnitOptions.filter((item) => selected.has(item.id));
  }, [draft?.organizationUnitIds, organizationUnitOptions]);
  const visibleOrganizationUnitOptions = useMemo(() => {
    const selected = new Set(draft?.organizationUnitIds || []);
    return organizationUnitOptions.filter((item) => (
      selected.has(item.id)
      || !(item.ancestorIds || []).some((ancestorId) => selected.has(ancestorId))
    ));
  }, [draft?.organizationUnitIds, organizationUnitOptions]);
  const eligibleEmployees = useMemo(() => {
    if (!draft) return [];
    const selectedUnits = new Set(draft.organizationUnitIds || []);
    return employees.filter((employee) => {
      if (employee.isShiftGroupMember) return false;
      const organizationMatch = !selectedUnits.size
        || (employee.organizationUnitIds || []).some((item) => selectedUnits.has(item));
      const designationMatch = !cutoff?.seniorityOrder
        || (employee.designationSeniority && employee.designationSeniority > cutoff.seniorityOrder);
      return organizationMatch && designationMatch;
    });
  }, [cutoff, draft, employees]);

  const setOrganizationUnits = (_, values) => {
    const selectedIds = new Set(values.map((item) => item.id));
    const canonicalIds = values
      .filter((item) => !(item.ancestorIds || []).some((ancestorId) => selectedIds.has(ancestorId)))
      .map((item) => item.id);
    setDraft((current) => ({ ...current, organizationUnitIds: canonicalIds }));
  };

  const loadSetup = async () => {
    setLoading(true);
    try {
      const response = await api.get("/presentation-roster/setup");
      setSetup(response.data);
      setDraft(response.data.config);
    } catch (error) {
      setNotice({ severity: "error", text: error.response?.data?.detail || "Presentation setup could not be loaded." });
    } finally {
      setLoading(false);
    }
  };

  const loadRoster = async (selectedMonth) => {
    try {
      const response = await api.get(`/presentation-roster/${selectedMonth}`);
      const roster = response.data?.roster;
      setBlocks(groupEntries(roster?.entries || []));
      setCycleStateAfter(roster?.cycleStateAfter || {});
      setStatus(roster?.status || "");
    } catch (error) {
      setNotice({ severity: "error", text: error.response?.data?.detail || "Saved roster could not be loaded." });
    }
  };

  useEffect(() => { loadSetup(); }, []);
  useEffect(() => { loadRoster(month); }, [month]);
  useEffect(() => {
    const year = Number(month.split("-")[0]);
    api.get(`/Training_holiday/holiday/${year}`).then(({ data }) => setHolidays(data || [])).catch(() => setHolidays([]));
  }, [month]);

  const participantIds = draft?.participantIds || [];
  const excluded = new Set(draft?.excludedIds || []);
  const participants = participantIds
    .map((id) => employeeById[id])
    .filter(Boolean);
  const calendarRows = useMemo(() => {
    const [year, monthNumber] = month.split("-").map(Number);
    if (!year || !monthNumber) return [];
    const assignmentByDate = new Map(
      blocks.flatMap((block) => block.dates.map((item) => [item.date, block])),
    );
    const holidayByDate = new Map(holidays.map((item) => [item.date, item.holidayName || "Holiday"]));
    const numberOfDays = new Date(year, monthNumber, 0).getDate();
    return Array.from({ length: numberOfDays }, (_, index) => {
      const dayNumber = index + 1;
      const dateValue = `${year}-${String(monthNumber).padStart(2, "0")}-${String(dayNumber).padStart(2, "0")}`;
      const currentDate = new Date(year, monthNumber - 1, dayNumber);
      return {
        date: dateValue,
        shortDate: `${String(dayNumber).padStart(2, "0")}.${String(monthNumber).padStart(2, "0")}.${String(year).slice(-2)}`,
        displayDate: currentDate.toLocaleDateString("en-IN", {
          weekday: "long",
          day: "2-digit",
          month: "long",
          year: "numeric",
        }),
        employeeName: assignmentByDate.get(dateValue)?.employeeName || "",
        holidayName: holidayByDate.get(dateValue) || "",
      };
    });
  }, [blocks, holidays, month]);

  const useEligiblePool = () => {
    setDraft((current) => ({
      ...current,
      participantIds: eligibleEmployees.map((item) => item.id),
      excludedIds: (current.excludedIds || []).filter((id) =>
        eligibleEmployees.some((item) => item.id === id)),
    }));
  };

  const moveParticipant = (index, direction) => {
    setDraft((current) => {
      const next = [...(current.participantIds || [])];
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...current, participantIds: next };
    });
  };

  const toggleExcluded = (employeeId) => {
    setDraft((current) => {
      const values = new Set(current.excludedIds || []);
      if (values.has(employeeId)) values.delete(employeeId);
      else values.add(employeeId);
      return { ...current, excludedIds: [...values] };
    });
  };

  const saveCycle = async () => {
    setWorking(true);
    try {
      const response = await api.put("/presentation-roster/setup", draft);
      setDraft(response.data.config);
      setSetup((current) => ({ ...current, config: response.data.config }));
      setNotice({ severity: "success", text: "Cycle, filters, exclusions and order saved." });
    } catch (error) {
      setNotice({ severity: "error", text: error.response?.data?.detail || error.message || "Cycle could not be saved." });
    } finally {
      setWorking(false);
    }
  };

  const generate = async () => {
    setWorking(true);
    try {
      const response = await api.post("/presentation-roster/generate", {
        month,
        participantIds: draft.participantIds,
        excludedIds: draft.excludedIds,
        skipHolidays: draft.skipHolidays,
      });
      setBlocks(groupEntries(response.data.entries));
      setCycleStateAfter(response.data.cycleStateAfter || {});
      setStatus("DRAFT");
      setNotice({ severity: "success", text: "Monthly two-working-day cycle generated. You can now shift any block manually." });
    } catch (error) {
      setNotice({ severity: "error", text: error.response?.data?.detail || error.message || "Roster could not be generated." });
    } finally {
      setWorking(false);
    }
  };

  const setBlockEmployee = (index, employeeId) => {
    const employee = employeeById[employeeId];
    if (!employee) return;
    setBlocks((current) => current.map((block, blockIndex) => (
      blockIndex === index
        ? {
            ...block,
            employeeId,
            employeeName: employee.name,
            designation: employee.designation,
            department: (employee.departments || []).join(", "),
            manual: true,
          }
        : block
    )));
  };

  const shiftBlock = (index, direction) => {
    setBlocks((current) => {
      const next = current.map((item) => ({ ...item, manual: true }));
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      const first = {
        employeeId: next[index].employeeId,
        employeeName: next[index].employeeName,
        designation: next[index].designation,
        department: next[index].department,
      };
      const second = {
        employeeId: next[target].employeeId,
        employeeName: next[target].employeeName,
        designation: next[target].designation,
        department: next[target].department,
      };
      Object.assign(next[index], second);
      Object.assign(next[target], first);
      return next;
    });
  };

  const flattenEntries = () => blocks.flatMap((block) =>
    block.dates.map((item) => ({
      ...item,
      slotId: block.slotId,
      employeeId: block.employeeId,
      employeeName: block.employeeName,
      designation: block.designation,
      department: block.department,
      manual: block.manual,
    })));

  const captureSnapshot = async ({ download = false } = {}) => {
    if (!snapshotRef.current || !blocks.length) return "";
    const canvas = await html2canvas(snapshotRef.current, {
      backgroundColor: "#FFFFFF",
      scale: 2,
      useCORS: true,
      logging: false,
    });
    const dataUrl = canvas.toDataURL("image/png");
    if (download) {
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `Morning_Presentation_Roster_${month}.png`;
      link.click();
    }
    return dataUrl;
  };

  const downloadSnapshot = async () => {
    try {
      await captureSnapshot({ download: true });
      setNotice({ severity: "success", text: "Morning Presentation roster snapshot downloaded." });
    } catch (error) {
      setNotice({ severity: "error", text: error.message || "Snapshot could not be generated." });
    }
  };

  const saveRoster = async (publish = false) => {
    setWorking(true);
    try {
      const snapshotDataUrl = publish ? await captureSnapshot() : "";
      const response = await api.put(`/presentation-roster/${month}`, {
        status: publish ? "PUBLISHED" : "DRAFT",
        entries: flattenEntries(),
        participantIds: draft.participantIds,
        cycleStateAfter,
        snapshotDataUrl,
      });
      setStatus(response.data.roster?.status || (publish ? "PUBLISHED" : "DRAFT"));
      const mail = response.data.mail;
      const mailSummary = mail?.status === "sent"
        ? ` Mail sent to ${mail.recipientCount} employee(s)${mail.snapshotAttached ? " with the roster snapshot" : ""}.`
        : publish && mail
          ? ` Mail status: ${mail.status}${mail.error ? ` (${mail.error})` : ""}.`
          : "";
      setNotice({
        severity: "success",
        text: publish
          ? `Monthly roster published and the next cycle position was saved.${mailSummary}`
          : "Draft roster saved.",
      });
    } catch (error) {
      setNotice({ severity: "error", text: error.response?.data?.detail || error.message || "Roster could not be saved." });
    } finally {
      setWorking(false);
    }
  };

  if (loading || !draft) {
    return <Box sx={{ py: 10, display: "grid", placeItems: "center" }}><CircularProgress /></Box>;
  }

  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Paper sx={{ p: 2.5, color: "#fff", borderRadius: 3, background: "linear-gradient(105deg,#08103A 0%,#0057B7 72%,#0F8EDB 100%)" }}>
        <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems={{ md: "center" }} gap={2}>
          <Box>
            <Chip label="CREW DEVELOPMENT" size="small" sx={{ mb: 1, color: "#fff", border: "1px solid rgba(255,255,255,.5)", background: "rgba(255,255,255,.12)", fontWeight: 900 }} />
            <Typography sx={{ fontSize: 25, fontWeight: 950 }}>Morning Presentation Roster</Typography>
            <Typography sx={{ mt: .4, fontSize: 13, opacity: .9 }}>Monthly cyclic presentation duty with consecutive two-working-day assignments.</Typography>
          </Box>
          <Stack direction="row" spacing={1} alignItems="center">
            <TextField
              type="month"
              size="small"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              sx={{ background: "#fff", borderRadius: 2, minWidth: 170 }}
            />
            <Chip label={status || "NOT SAVED"} sx={{ color: "#fff", fontWeight: 900, border: "1px solid rgba(255,255,255,.55)" }} variant="outlined" />
          </Stack>
        </Stack>
      </Paper>

      {notice && <Alert severity={notice.severity} onClose={() => setNotice(null)}>{notice.text}</Alert>}
      {(setup.unmatchedHistoricalNames || []).length > 0 && (
        <Alert severity="warning">
          Historical names not found in Employee Master: {setup.unmatchedHistoricalNames.join(", ")}. Add or correct these employees before including them in the cycle.
        </Alert>
      )}

      <Paper sx={{ p: 2.2, border: "1px solid #CFE8DE" }}>
        <Stack direction="row" alignItems="center" spacing={1} mb={1.8}>
          <Users size={19} color="#03624C" />
          <Box>
            <Typography sx={{ fontWeight: 950 }}>Cycle eligibility and order</Typography>
            <Typography sx={{ color: "#64748B", fontSize: 12 }}>Choose departments, verticals or functions and a designation boundary. Active shift-group members and the boundary designation itself are excluded.</Typography>
          </Box>
        </Stack>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1.4fr .8fr auto" }, gap: 1.5, alignItems: "start" }}>
          <Autocomplete
            multiple
            options={visibleOrganizationUnitOptions}
            value={selectedOrganizationUnits}
            onChange={setOrganizationUnits}
            getOptionLabel={(option) => option.name || ""}
            isOptionEqualToValue={(option, value) => option.id === value.id}
            groupBy={(option) => unitTypeLabel[option.unitType] || option.unitType}
            renderOption={(props, option) => (
              <li {...props} key={option.id}>
                <Box>
                  <Typography sx={{ fontSize: 13, fontWeight: 800 }}>{option.name}</Typography>
                  <Typography sx={{ fontSize: 10.5, color: "#64748B" }}>{unitTypeLabel[option.unitType] || option.unitType}</Typography>
                </Box>
              </li>
            )}
            renderInput={(params) => <TextField {...params} size="small" label="Eligible organization units" />}
          />
          <FormControl size="small" fullWidth>
            <InputLabel>Eligible below designation</InputLabel>
            <Select
              label="Eligible below designation"
              value={draft.cutoffDesignationId || ""}
              onChange={(event) => setDraft((current) => ({ ...current, cutoffDesignationId: event.target.value }))}
            >
              {(setup.designations || []).map((item) => (
                <MenuItem key={item.id} value={item.id}>
                  {item.seniorityOrder || "-"} · {item.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Button onClick={useEligiblePool} variant="outlined" startIcon={<RefreshCw size={16} />} sx={{ minHeight: 40, fontWeight: 900 }}>Apply filters</Button>
        </Box>
        <Stack direction="row" alignItems="center" mt={1}>
          <Checkbox
            size="small"
            checked={draft.skipHolidays !== false}
            onChange={(event) => setDraft((current) => ({ ...current, skipHolidays: event.target.checked }))}
          />
          <Typography sx={{ fontSize: 12, fontWeight: 800 }}>Skip active holidays from Holiday Master</Typography>
        </Stack>

        <Box sx={{ mt: 2, display: "grid", gridTemplateColumns: { xs: "1fr", lg: "repeat(2,minmax(0,1fr))" }, gap: 1 }}>
          {participants.map((employee, index) => (
            <Box key={employee.id} sx={{ display: "grid", gridTemplateColumns: "42px minmax(0,1fr) auto auto auto", alignItems: "center", gap: .7, p: .8, border: "1px solid #D7E9E3", borderRadius: 2, background: excluded.has(employee.id) ? "#F8FAFC" : "#F1FBF7", opacity: excluded.has(employee.id) ? .65 : 1 }}>
              <Chip label={index + 1} size="small" sx={{ fontWeight: 900, color: "#0057B7" }} />
              <Box sx={{ minWidth: 0 }}>
                <Typography noWrap sx={{ fontSize: 12.5, fontWeight: 900 }}>{employee.name}</Typography>
                <Typography noWrap sx={{ fontSize: 10.5, color: "#64748B" }}>{employee.designation} · {(employee.departments || []).join(", ") || "Department not mapped"}</Typography>
              </Box>
              <IconButton size="small" onClick={() => moveParticipant(index, -1)} disabled={index === 0}><ArrowUp size={15} /></IconButton>
              <IconButton size="small" onClick={() => moveParticipant(index, 1)} disabled={index === participants.length - 1}><ArrowDown size={15} /></IconButton>
              <Stack direction="row" alignItems="center" spacing={.2}>
                <Checkbox size="small" checked={excluded.has(employee.id)} onChange={() => toggleExcluded(employee.id)} />
                <Typography sx={{ fontSize: 10.5, fontWeight: 800 }}>Exclude</Typography>
              </Stack>
            </Box>
          ))}
        </Box>
        {!participants.length && <Alert severity="warning" sx={{ mt: 2 }}>No employee is in the cycle. Apply the filters or review employee department/designation mappings.</Alert>}
        <Stack direction="row" justifyContent="flex-end" mt={2}>
          <Button onClick={saveCycle} disabled={working} variant="contained" startIcon={<Save size={16} />} sx={{ fontWeight: 900 }}>Save cycle</Button>
        </Stack>
      </Paper>

      <Paper sx={{ overflow: "hidden", border: "1px solid #C7DDF8" }}>
        <Box sx={{ p: 2, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1.5, flexWrap: "wrap", background: "#F4F8FE" }}>
          <Box>
            <Stack direction="row" alignItems="center" spacing={1}><CalendarDays size={18} color="#0057B7" /><Typography sx={{ fontWeight: 950 }}>Monthly assignments</Typography></Stack>
            <Typography sx={{ mt: .3, color: "#64748B", fontSize: 11.5 }}>Use arrows to shift complete two-day blocks, or select a different employee for a requested manual change.</Typography>
          </Box>
          <Stack direction="row" spacing={1}>
            <Button onClick={generate} disabled={working || !participants.length} variant="outlined" startIcon={<Sparkles size={16} />} sx={{ fontWeight: 900 }}>Generate month</Button>
            <Button onClick={downloadSnapshot} disabled={working || !blocks.length} variant="outlined" startIcon={<Download size={16} />} sx={{ fontWeight: 900 }}>Download snapshot</Button>
            <Button onClick={() => saveRoster(false)} disabled={working || !blocks.length} variant="outlined" startIcon={<Save size={16} />} sx={{ fontWeight: 900 }}>Save draft</Button>
            <Button onClick={() => saveRoster(true)} disabled={working || !blocks.length} variant="contained" color="success" startIcon={<CheckCircle2 size={16} />} sx={{ fontWeight: 900 }}>Publish</Button>
          </Stack>
        </Box>

        <TableContainer>
          <Table size="small" data-crew-table-tools="off">
            <TableHead>
              <TableRow sx={{ background: "#EAF2FF" }}>
                <TableCell>Order</TableCell>
                <TableCell>Presentation dates</TableCell>
                <TableCell>Employee</TableCell>
                <TableCell>Designation / Department</TableCell>
                <TableCell align="right">Shift block</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {blocks.map((block, index) => (
                <TableRow key={block.slotId} hover>
                  <TableCell sx={{ fontWeight: 900 }}>{index + 1}</TableCell>
                  <TableCell>
                    {block.dates.map((item) => (
                      <Chip key={item.date} size="small" label={`${item.date} · ${item.day.slice(0, 3)}`} sx={{ mr: .5, my: .2, fontWeight: 800, background: "#EEF6FF", color: "#0057B7" }} />
                    ))}
                  </TableCell>
                  <TableCell sx={{ minWidth: 260 }}>
                    <FormControl size="small" fullWidth>
                      <Select value={block.employeeId} onChange={(event) => setBlockEmployee(index, event.target.value)}>
                        {participants.filter((item) => !excluded.has(item.id)).map((item) => (
                          <MenuItem key={item.id} value={item.id}>{item.name} · {item.designation}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </TableCell>
                  <TableCell>
                    <Typography sx={{ fontSize: 12, fontWeight: 800 }}>{block.designation || "-"}</Typography>
                    <Typography sx={{ fontSize: 10.5, color: "#64748B" }}>{block.department || "Department not mapped"}{block.manual ? " · Manually changed" : ""}</Typography>
                  </TableCell>
                  <TableCell align="right">
                    <IconButton size="small" onClick={() => shiftBlock(index, -1)} disabled={index === 0}><ArrowUp size={16} /></IconButton>
                    <IconButton size="small" onClick={() => shiftBlock(index, 1)} disabled={index === blocks.length - 1}><ArrowDown size={16} /></IconButton>
                  </TableCell>
                </TableRow>
              ))}
              {!blocks.length && <TableRow><TableCell colSpan={5} align="center" sx={{ py: 6, color: "#64748B" }}>Select the month and generate the presentation cycle.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </TableContainer>

        <Box sx={{ p: 2, background: "#EEF4FA", borderTop: "1px solid #C7DDF8" }}>
          <Box
            ref={snapshotRef}
            sx={{
              width: "100%",
              maxWidth: 980,
              mx: "auto",
              p: 2.2,
              background: "#FFFFFF",
              border: "1px solid #B9D5F7",
              borderRadius: 2,
            }}
          >
            <Typography sx={{ mb: 1.5, textAlign: "center", color: "#0B2A6F", fontSize: 18, fontWeight: 950 }}>
              Morning Presentation Roster from {calendarRows[0]?.shortDate || "-"}-{calendarRows[calendarRows.length - 1]?.shortDate || "-"}
            </Typography>
            <Table size="small" data-crew-table-tools="off" sx={{ border: "1px solid #C7DDF8" }}>
              <TableHead>
                <TableRow sx={{ background: "#EAF2FF" }}>
                  <TableCell sx={{ fontWeight: 950 }}>Employee</TableCell>
                  <TableCell sx={{ fontWeight: 950 }}>Presentation date</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {calendarRows.map((row) => (
                  <TableRow key={row.date} title={row.holidayName || undefined} sx={{ background: row.holidayName ? "#E9D5FF" : row.employeeName ? "#FFFFFF" : "#F8FAFC", borderLeft: row.holidayName ? "4px solid #A855F7" : undefined }}>
                    <TableCell sx={{ py: .55, fontWeight: row.employeeName ? 800 : 500 }}>{row.employeeName}{row.holidayName && <Chip size="small" label="Holiday" sx={{ ml: 1, height: 19, background: "#F3E8FF", color: "#6B21A8", border: "1px solid #A855F7", fontWeight: 900 }} />}</TableCell>
                    <TableCell sx={{ py: .55, color: row.holidayName ? "#6B21A8" : undefined, fontWeight: row.holidayName ? 800 : undefined }}>{row.displayDate}{row.holidayName ? ` · ${row.holidayName}` : ""}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        </Box>
      </Paper>
    </Box>
  );
}
