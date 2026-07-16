import { useEffect, useMemo, useState } from "react";
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
  Divider,
  FormControl,
  Grid,
  InputBase,
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
  IconButton,
} from "@mui/material";
import {
  CalendarCheck,
  FileCheck2,
  History,
  Printer,
  RefreshCw,
  Save,
  Send,
  Sparkles,
  Trash2,
  Download,
  ChevronRight,
  GraduationCap
} from "lucide-react";

import AppShell from "../../components/layout/AppShell";
import GlassCard from "../../components/ui/GlassCard";
import crewApi from "../../services/crewApi";

const DUTIES = ["E1", "E2", "M1", "M2", "N1", "N2", "O1", "O2"];
const DEFAULT_INSTRUCTIONS = `1. Shift Timing: Morning Shift (08:30-14:30hrs), Evening Shift (14:30-20:30hrs), Night Shift (20:30-08:30hrs [Next day]).
2. Shri Debashis Mondal, Shri Akash Kumar Modi, Shri Sumanta Sadhukhan & Shri SSK Suman shall report to Control Room 15 minutes before the commencement of shift duty to note the salient status of the Grid from the previous shift and may leave 15 minutes`;
const DEFAULT_DISTRIBUTION = `1. DGM(HR)/GM(F&A)/GM(IT)/GM(SO)/CGM(MO & Logistics)/ED-ERLDC, Kolkata.
2. All Shift Charge Engineers, ERLDC, Kolkata.
3. Security In-Charge, ERLDC: 4 copies`;
const DEFAULT_HEADER = {
  organizationHindi: "ग्रिड कंट्रोलर ऑफ इंडिया लिमिटेड (ग्रिड-इंडिया)",
  officeHindi: "पूर्वी क्षेत्रीय भार प्रेषण केंद्र, कोलकाता",
  organizationEnglish: "Grid Controller of India Limited (GRID-INDIA)",
  officeEnglish: "EASTERN REGIONAL LOAD DESPATCH CENTRE, KOLKATA",
  rosterTitle: "CONTROL ROOM SHIFT DUTY ROSTER",
};
const rosterHeader = (value) => ({ ...DEFAULT_HEADER, ...(value || {}) });

const today = () => new Date().toISOString().slice(0, 10);
const addDays = (date, amount) => {
  const value = new Date(`${date}T00:00:00`);
  value.setDate(value.getDate() + amount);
  return value.toISOString().slice(0, 10);
};

const formatPrintDate = (date) => new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const formatPrintDay = (date) => new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", {
  weekday: "short",
});

const dutyColor = (duty) => ({
  E1: ["#FFF7ED", "#9A3412"], E2: ["#FFEDD5", "#9A3412"],
  M1: ["#E0F2FE", "#075985"], M2: ["#DBEAFE", "#1E40AF"],
  N1: ["#ECFDF5", "#065F46"], N2: ["#D1FAE5", "#065F46"],
  O1: ["#FEE2E2", "#991B1B"], O2: ["#FFE4E6", "#9F1239"],
})[duty] || ["#F8FAFC", "#475569"];

const employeeKey = (item) => String(item?.employeeId || item?.userId || item?.id || "");
const resolveAuthorityId = (authority, people) => {
  if (!authority) return "";
  const storedId = String(authority.employeeId || authority.userId || authority.id || "");
  const idMatch = people.find((item) => employeeKey(item) === storedId);
  if (idMatch) return employeeKey(idMatch);
  const nameMatch = people.find((item) => item.name && authority.name && item.name.trim().toLowerCase() === authority.name.trim().toLowerCase());
  return nameMatch ? employeeKey(nameMatch) : "";
};

export default function CrewDutyRoster() {
  const [startDate, setStartDate] = useState(today());
  const [endDate, setEndDate] = useState(addDays(today(), 7));
  const [rosterData, setRosterData] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [groups, setGroups] = useState([]);
  const [history, setHistory] = useState([]);
  const [rosterId, setRosterId] = useState("");
  const [isFinal, setIsFinal] = useState(false);
  const [calendarPushed, setCalendarPushed] = useState(false);
  const [instructions, setInstructions] = useState(DEFAULT_INSTRUCTIONS);
  const [distribution, setDistribution] = useState("");
  const [header, setHeader] = useState(DEFAULT_HEADER);
  const [lastPublishedRoster, setLastPublishedRoster] = useState(null);
  const [publishedSigner, setPublishedSigner] = useState(null);
  const [signedBy, setSignedBy] = useState("");
  const [leaveAuthority, setLeaveAuthority] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const formatBilingual = (english, hindi) => {
    const en = String(english || "").trim();
    const hi = String(hindi || "").trim();
    if (en && hi) return `${en} / ${hi}`;
    return en || hi || "";
  };

  const formatPrintDateRange = (start, end) => {
    const format = (d) => {
      const dateObj = new Date(`${d}T00:00:00`);
      const day = String(dateObj.getDate()).padStart(2, "0");
      const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
      const month = months[dateObj.getMonth()];
      const year = dateObj.getFullYear();
      return `${day}-${month}-${year}`;
    };
    return `${format(start)} to ${format(end)}`;
  };

  const getPrintGenerationTime = () => {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, "0");
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const year = now.getFullYear();
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    return `${day}-${month}-${year} ${hours}:${minutes}`;
  };

  const loadReferenceData = async () => {
    const [peopleResult, recordsResult, groupsResult, previousResult] = await Promise.allSettled([
        crewApi.employees(),
        crewApi.rosters(),
        crewApi.groups(),
        crewApi.previousFinalRoster()
    ]);

    const loadedPeople = peopleResult.status === "fulfilled" ? (peopleResult.value || []) : [];
    if (peopleResult.status === "fulfilled") setEmployees(loadedPeople);
    if (recordsResult.status === "fulfilled") setHistory(recordsResult.value || []);
    if (groupsResult.status === "fulfilled") setGroups(groupsResult.value || []);

    if (previousResult.status === "fulfilled") {
      const previousFinal = previousResult.value || null;
      setLastPublishedRoster(previousFinal || null);
      setPublishedSigner(previousFinal?.signedBy || null);
      setHeader((current) => rosterHeader(previousFinal?.header || current));
      if (!instructions || instructions === DEFAULT_INSTRUCTIONS) {
        setInstructions(previousFinal?.instructions || DEFAULT_INSTRUCTIONS);
      }
      if (!distribution) {
        setDistribution(previousFinal?.distribution || DEFAULT_DISTRIBUTION);
      }
      if (!signedBy) setSignedBy(resolveAuthorityId(previousFinal?.signedBy, loadedPeople));
      if (!leaveAuthority) setLeaveAuthority(resolveAuthorityId(previousFinal?.leaveAuthority, loadedPeople));
    }

    const failedRequired = [peopleResult, recordsResult, groupsResult].find((result) => result.status === "rejected");
    if (failedRequired) {
      setMessage({ severity: "error", text: failedRequired.reason?.response?.data?.detail || "Some crew roster reference data could not be loaded." });
    }
  };

  useEffect(() => { loadReferenceData(); }, []);

  const dates = useMemo(() => rosterData[0] ? Object.keys(rosterData[0].data || {}) : [], [rosterData]);
  const person = (id) => employees.find((item) => employeeKey(item) === String(id)) || null;
  const notify = (severity, text) => setMessage({ severity, text });

  const printedOn = new Date().toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const signingAuthority = {
    ...(publishedSigner || {}),
    ...(person(signedBy) || {}),
  };

  const generate = async () => {
    setBusy(true); setMessage(null);
    try {
      const generated = await crewApi.generateRoster({ startDate, endDate });
      setRosterData(generated); setRosterId(""); setIsFinal(false); setCalendarPushed(false);
      if (!instructions || instructions === DEFAULT_INSTRUCTIONS) setInstructions(lastPublishedRoster?.instructions || DEFAULT_INSTRUCTIONS);
      if (!distribution) setDistribution(lastPublishedRoster?.distribution || DEFAULT_DISTRIBUTION);
      notify("success", "Roster generated from the configured eight-day duty cycle.");
    } catch (error) { notify("error", error.response?.data?.detail || "Roster generation failed."); }
    finally { setBusy(false); }
  };

  const save = async (makeFinal) => {
    if (!rosterData.length) return notify("warning", "Generate or load a roster first.");
    if (makeFinal && !window.confirm("Save this roster as final? It cannot be edited or deleted afterwards.")) return;
    setBusy(true); setMessage(null);
    try {
      const response = await crewApi.saveRoster({
        rosterId: rosterId || undefined, startDate, endDate, data: rosterData,
        header, instructions, distribution, signedBy: person(signedBy), leaveAuthority: person(leaveAuthority), isFinal: makeFinal,
      });
      setRosterId(response.rosterId); setIsFinal(makeFinal);
      notify("success", response.message); await loadReferenceData();
    } catch (error) { notify("error", error.response?.data?.detail || "Unable to save the roster."); }
    finally { setBusy(false); }
  };

  const loadRoster = async (id) => {
    setBusy(true);
    try {
      const record = await crewApi.roster(id);
      setStartDate(record.startDate); setEndDate(record.endDate); setRosterData(record.data || []);
      setInstructions(record.instructions || lastPublishedRoster?.instructions || DEFAULT_INSTRUCTIONS);
      setDistribution(record.distribution || lastPublishedRoster?.distribution || DEFAULT_DISTRIBUTION);
      setHeader(rosterHeader(record.header || lastPublishedRoster?.header));
      setPublishedSigner(record.signedBy || lastPublishedRoster?.signedBy || null);
      setSignedBy(resolveAuthorityId(record.signedBy, employees));
      setLeaveAuthority(resolveAuthorityId(record.leaveAuthority, employees));
      setRosterId(id); setIsFinal(record.isFinal); setCalendarPushed(record.calendarPushed); setHistoryOpen(false);
      notify("success", `Loaded ${record.isFinal ? "final" : "draft"} roster.`);
    } catch (error) { notify("error", error.response?.data?.detail || "Unable to load roster."); }
    finally { setBusy(false); }
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this draft roster?")) return;
    try { const response = await crewApi.deleteRoster(id); notify("success", response.message); await loadReferenceData(); }
    catch (error) { notify("error", error.response?.data?.detail || "Unable to delete roster."); }
  };

  const push = async () => {
    if (!rosterId || !isFinal) return notify("warning", "Save the roster as final before publishing it.");
    if (!window.confirm("Publish this final roster to the duty calendar?")) return;
    setBusy(true);
    try { const response = await crewApi.pushRoster(rosterId); setCalendarPushed(true); notify("success", response.message); await loadReferenceData(); }
    catch (error) { notify("error", error.response?.data?.detail || "Unable to publish roster."); }
    finally { setBusy(false); }
  };

  const updateDuty = (groupIndex, date, value) => setRosterData((current) => current.map((group, index) => index === groupIndex ? { ...group, data: { ...group.data, [date]: value } } : group));

  // Determine active roster groups to display on the green details cards
  const groupsToDisplay = useMemo(() => {
    if (rosterData && rosterData.length) {
      return rosterData.map(group => ({
        groupName: group.groupName,
        shiftInCharge: group.shiftInCharge,
        members: group.members || []
      }));
    }
    return groups.filter(g => g.isActive).map(group => ({
      groupName: group.groupName,
      shiftInCharge: group.shiftInCharge,
      members: group.members || []
    }));
  }, [rosterData, groups]);

  // Button disabled configurations
  const isGenerateDisabled = busy || isFinal || !startDate || !endDate;
  const isSaveDraftDisabled = busy || isFinal || !rosterData.length;
  const isSaveFinalDisabled = busy || isFinal || !rosterData.length;
  const isDownloadDisabled = !rosterData.length;

  return (
    <AppShell>
      {/* Hidden section designed purely for paper print preview */}
      {!!rosterData.length && (
        <section className="crew-roster-print">
          {/* Header Layout */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", position: "relative", paddingBottom: "8px", borderBottom: "2px solid #000000", marginBottom: "12px" }}>
            <div style={{ position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)" }}>
            <img src="/logo.png" alt="GRID-INDIA" style={{ width: "118px", height: "auto" }} onError={(e) => e.target.style.display = 'none'} />
          </div>
            <div style={{ textAlign: "center", color: "#003366", fontFamily: "Arial, sans-serif" }}>
              <div style={{ fontSize: "15px", fontWeight: "bold" }}>{header.organizationHindi}</div>
              <div style={{ fontSize: "12px", fontWeight: "bold", marginTop: "1px" }}>{header.officeHindi}</div>
              <div style={{ fontSize: "14px", fontWeight: "bold", marginTop: "2px" }}>{header.organizationEnglish}</div>
              <div style={{ fontSize: "12px", fontWeight: "bold", marginTop: "1px" }}>{header.officeEnglish}</div>
              <div style={{ fontSize: "17px", fontWeight: 800, color: "#0056B3", marginTop: "3px", letterSpacing: "0.5px" }}>{header.rosterTitle}</div>
            </div>
          </div>

          {/* Period Display */}
          <div style={{ fontSize: "15px", fontWeight: "bold", color: "#000000", marginBottom: "10px", fontFamily: "Arial, sans-serif" }}>
            Period: {formatPrintDateRange(startDate, endDate)}
          </div>

          {/* Compact Duty Roster Table */}
          <table className="crew-roster-print-table" style={{ width: "100%", borderCollapse: "collapse", tableLayout: "auto", fontSize: "10px", fontFamily: "Arial, sans-serif" }}>
            <thead>
              <tr>
                <th style={{ border: "1px solid #000000", padding: "4px 6px", background: "#E8E8E8", fontWeight: 800, textAlign: "center" }}>Group</th>
                {dates.map((date) => (
                  <th key={`print-head-${date}`} style={{ border: "1px solid #000000", padding: "4px 6px", background: "#E8E8E8", fontWeight: 800, textAlign: "center" }}>
                    {new Date(`${date}T00:00:00`).getDate()}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rosterData.map((group) => (
                <tr key={`print-${group.groupName}`}>
                  <td style={{ border: "1px solid #000000", padding: "5px 6px", fontWeight: 800, background: "#F5F5F5", textAlign: "center" }}>
                    {group.groupName}
                  </td>
                  {dates.map((date) => {
                    const duty = group.data?.[date] || "";
                    let printBg = "#FFFFFF";
                    if (duty.startsWith("E")) printBg = "#FFF2CC"; // Morning yellow
                    if (duty.startsWith("M")) printBg = "#DDEBF7"; // Evening blue
                    if (duty.startsWith("N")) printBg = "#E2F0D9"; // Night green
                    if (duty.startsWith("O")) printBg = "#FCE4D6"; // Off/Outage peach
                    
                    return (
                      <td
                        key={`print-${group.groupName}-${date}`}
                        style={{
                          border: "1px solid #000000",
                          padding: "5px 6px",
                          textAlign: "center",
                          fontWeight: 800,
                          backgroundColor: printBg,
                          color: "#000000"
                        }}
                      >
                        {duty || "-"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>

          {/* Group Details section */}
          <div className="crew-roster-print-group-details" style={{ marginTop: "15px", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px", fontFamily: "Arial, sans-serif" }}>
            {groupsToDisplay.map((group, idx) => (
              <div
                key={group.groupName || idx}
                style={{
                  border: "1px solid #CCCCCC",
                  borderRadius: "6px",
                  overflow: "hidden",
                  fontSize: "8.5px",
                  lineHeight: "1.3"
                }}
              >
                {/* Header strip */}
                <div style={{ backgroundColor: "#E2F0D9", borderBottom: "1px solid #CCCCCC", padding: "4px 6px", fontWeight: "bold", color: "#0F5132" }}>
                  {group.groupName}
                </div>
                {/* Content */}
                <div style={{ padding: "6px" }}>
                  <div style={{ fontWeight: "bold", marginBottom: "2px" }}>Shift Incharge:</div>
                  <div style={{ marginBottom: "6px", color: "#333333" }}>
                    {group.shiftInCharge ? `${group.shiftInCharge.name} - (${group.shiftInCharge.employeeId}) - ${group.shiftInCharge.designation}` : "Not assigned"}
                  </div>
                  <div style={{ fontWeight: "bold", marginBottom: "2px" }}>Members:</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                    {(group.members || []).map((member, mIdx) => (
                      <div key={member.employeeId} style={{ color: "#444444" }}>
                        {mIdx + 1}. {member.name} ({member.designation}) - {member.employeeId}
                      </div>
                    ))}
                    {(!group.members || group.members.length === 0) && (
                      <div style={{ color: "#999999", fontStyle: "italic" }}>No members</div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Special Instructions section */}
          <div className="crew-roster-print-notes" style={{ marginTop: "15px", fontSize: "10px", fontFamily: "Arial, sans-serif" }}>
            <strong>Special Instructions:</strong>
            <div style={{ marginTop: "4px" }}>
              {(instructions || lastPublishedRoster?.instructions || DEFAULT_INSTRUCTIONS).split("\n").map((line, lIdx) => (
                <div key={lIdx} style={{ marginBottom: "2.5px", lineHeight: "1.4", color: "#000000" }}>{line}</div>
              ))}
            </div>
          </div>

          {/* Distribution section */}
          <div className="crew-roster-print-notes" style={{ marginTop: "15px", fontSize: "10px", fontFamily: "Arial, sans-serif" }}>
            <strong>Distribution:</strong>
            <div style={{ marginTop: "4px" }}>
              {(distribution || lastPublishedRoster?.distribution || DEFAULT_DISTRIBUTION).split("\n").map((line, lIdx) => (
                <div key={lIdx} style={{ marginBottom: "2.5px", lineHeight: "1.4", color: "#000000" }}>{line}</div>
              ))}
            </div>
          </div>

          <div className="crew-roster-print-footer" style={{ marginTop: "18px", display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: "20px", pageBreakInside: "avoid" }}>
            <div className="crew-roster-print-timestamp" style={{ textAlign: "left", fontFamily: "Arial, sans-serif", fontSize: "9px", color: "#7B8BAA", fontWeight: "600", paddingLeft: "2px" }}>
              Generated on {getPrintGenerationTime()}
            </div>
            {signedBy && (
              <div className="crew-roster-print-signature" style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", fontFamily: "Arial, sans-serif", fontSize: "11px", textAlign: "right", paddingRight: "15px" }}>
                <div style={{ fontWeight: "bold", marginBottom: "2px" }}>{formatBilingual(signingAuthority?.name, signingAuthority?.nameHindi)}</div>
                <div style={{ marginBottom: "2px" }}>{formatBilingual(signingAuthority?.designation, signingAuthority?.designationHindi)}</div>
                <div>ERLDC, GRID-INDIA</div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* 1. TITLE HEADER BLOCK (Floating card style) */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 2.2,
          p: 2.8,
          backgroundColor: "#FFFFFF",
          borderRadius: "16px",
          border: "1px solid #E2E8F0",
          boxShadow: "0 4px 20px rgba(15, 98, 76, 0.02)",
        }}
      >
        <Box
          sx={{
            width: 48,
            height: 48,
            borderRadius: "12px",
            backgroundColor: "#EBF3FC",
            color: "#0F6FDB",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 4px 12px rgba(15, 111, 219, 0.15)",
          }}
        >
          <CalendarCheck size={24} strokeWidth={2.2} />
        </Box>
        <Box sx={{ flex: 1 }}>
          <Typography sx={{ fontSize: 24, fontWeight: 900, color: "#0F172A", letterSpacing: "-0.03em" }}>
            Duty Roster
          </Typography>
          <Typography sx={{ fontSize: 13, color: "#64748B", fontWeight: 550, mt: 0.2 }}>
            Generate and manage shift duties for control room staff
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} alignItems="center">
          <Chip
            label={isFinal ? "FINAL" : rosterId ? "DRAFT" : "UNSAVED"}
            color={isFinal ? "success" : "default"}
            sx={{ fontWeight: 900, borderRadius: "6px" }}
          />
          {calendarPushed && (
            <Chip
              icon={<Send size={14} style={{ color: "#03624C" }} />}
              label="Published"
              sx={{ fontWeight: 900, background: "#D1FAE5", color: "#03624C", borderRadius: "6px" }}
            />
          )}
          {isFinal && !calendarPushed && (
            <Button
              onClick={push}
              disabled={busy}
              variant="contained"
              startIcon={<Send size={15} />}
              sx={{
                borderRadius: 2.5,
                background: "#00A86B",
                textTransform: "none",
                fontWeight: 800,
                fontSize: 12.5,
                py: 0.6,
                "&:hover": { background: "#008B58" }
              }}
            >
              Publish
            </Button>
          )}
          <Button
            onClick={() => setHistoryOpen(true)}
            startIcon={<History size={15} />}
            variant="outlined"
            sx={{
              borderRadius: 2.5,
              textTransform: "none",
              fontWeight: 800,
              fontSize: 12.5,
              py: 0.6,
              borderColor: "#CBD5E1",
              color: "#475569",
              "&:hover": { borderColor: "#94A3B8", backgroundColor: "#F8FAFC" }
            }}
          >
            History
          </Button>
        </Stack>
      </Box>

      {message && (
        <Alert severity={message.severity} onClose={() => setMessage(null)} sx={{ borderRadius: "10px" }}>
          {message.text}
        </Alert>
      )}

      {/* 2. ACTION CONTROLS BLOCK (Combined buttons & range layout) */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 3,
          p: 2.5,
          backgroundColor: "#FFFFFF",
          borderRadius: "16px",
          border: "1px solid #E2E8F0",
          boxShadow: "0 4px 20px rgba(15, 98, 76, 0.02)",
        }}
      >
        {/* Date Range Selector wrapper */}
        <Box
          sx={{
            border: "1.5px solid #CBD5E1",
            borderRadius: "8px",
            px: 2,
            py: 0.7,
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            backgroundColor: "#FFFFFF",
            transition: "border-color 0.2s",
            "&:focus-within": { borderColor: "#03624C" }
          }}
        >
          <Box>
            <Typography sx={{ fontSize: 9, fontWeight: 900, color: "#94A3B8", textTransform: "uppercase", lineHeight: 1 }}>
              Start Date
            </Typography>
            <InputBase
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              disabled={isFinal}
              sx={{
                fontSize: 13.5,
                fontWeight: 700,
                color: "#334155",
                "& input": { py: 0.3 }
              }}
            />
          </Box>
          <Box sx={{ color: "#94A3B8", fontWeight: 700 }}>→</Box>
          <Box>
            <Typography sx={{ fontSize: 9, fontWeight: 900, color: "#94A3B8", textTransform: "uppercase", lineHeight: 1 }}>
              End Date
            </Typography>
            <InputBase
              type="date"
              value={endDate}
              inputProps={{ min: startDate }}
              onChange={(event) => setEndDate(event.target.value)}
              disabled={isFinal}
              sx={{
                fontSize: 13.5,
                fontWeight: 700,
                color: "#334155",
                "& input": { py: 0.3 }
              }}
            />
          </Box>
        </Box>

        {/* COMBINED ACTION BUTTONS BLOCK */}
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap sx={{ gap: 2 }}>
          {/* Button 1: GENERATE */}
          <Box
            sx={{
              display: "flex",
              borderRadius: "8px",
              overflow: "hidden",
              border: `1.5px solid ${isGenerateDisabled ? "#CBD5E1" : "#3F51B5"}`,
              boxShadow: isGenerateDisabled ? "none" : "0 3px 10px rgba(63, 81, 181, 0.15)",
              height: 42
            }}
          >
            <Button
              onClick={generate}
              disabled={isGenerateDisabled}
              sx={{
                backgroundColor: "#3F51B5",
                color: "#FFFFFF",
                fontWeight: 800,
                fontSize: 13.5,
                px: 3,
                borderRadius: "0px",
                textTransform: "none",
                "&:hover": { backgroundColor: "#303F9F" },
                "&.Mui-disabled": { backgroundColor: "#F1F5F9", color: "#94A3B8" }
              }}
            >
              {busy ? <CircularProgress size={16} color="inherit" /> : "GENERATE"}
            </Button>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 36,
                backgroundColor: isGenerateDisabled ? "#F1F5F9" : "#FFFFFF",
                borderLeft: `1.5px solid ${isGenerateDisabled ? "#CBD5E1" : "#3F51B5"}`,
                color: isGenerateDisabled ? "#94A3B8" : "#3F51B5",
                fontWeight: 800,
                fontSize: 14,
              }}
            >
              <ChevronRight size={16} />
            </Box>
          </Box>

          {/* Button 2: SAVE DRAFT */}
          <Box
            sx={{
              display: "flex",
              borderRadius: "8px",
              overflow: "hidden",
              border: `1.5px solid ${isSaveDraftDisabled ? "#CBD5E1" : "#F59F00"}`,
              boxShadow: isSaveDraftDisabled ? "none" : "0 3px 10px rgba(245, 159, 0, 0.15)",
              height: 42
            }}
          >
            <Button
              onClick={() => save(false)}
              disabled={isSaveDraftDisabled}
              sx={{
                backgroundColor: "#F59F00",
                color: "#FFFFFF",
                fontWeight: 800,
                fontSize: 13.5,
                px: 2.5,
                borderRadius: "0px",
                textTransform: "none",
                "&:hover": { backgroundColor: "#D98200" },
                "&.Mui-disabled": { backgroundColor: "#F1F5F9", color: "#94A3B8" }
              }}
            >
              SAVE DRAFT
            </Button>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 36,
                backgroundColor: isSaveDraftDisabled ? "#F1F5F9" : "#FFFFFF",
                borderLeft: `1.5px solid ${isSaveDraftDisabled ? "#CBD5E1" : "#F59F00"}`,
                color: isSaveDraftDisabled ? "#94A3B8" : "#F59F00",
                fontWeight: 800,
              }}
            >
              <Save size={16} />
            </Box>
          </Box>

          {/* Button 3: SAVE FINAL */}
          <Box
            sx={{
              display: "flex",
              borderRadius: "8px",
              overflow: "hidden",
              border: `1.5px solid ${isSaveFinalDisabled ? "#CBD5E1" : "#8E9AA8"}`,
              boxShadow: isSaveFinalDisabled ? "none" : "0 3px 10px rgba(0, 0, 0, 0.05)",
              height: 42
            }}
          >
            <Button
              onClick={() => save(true)}
              disabled={isSaveFinalDisabled}
              sx={{
                backgroundColor: "#8E9AA8",
                color: "#FFFFFF",
                fontWeight: 800,
                fontSize: 13.5,
                px: 2.5,
                borderRadius: "0px",
                textTransform: "none",
                "&:hover": { backgroundColor: "#717E8C" },
                "&.Mui-disabled": { backgroundColor: "#F1F5F9", color: "#94A3B8" }
              }}
            >
              SAVE FINAL
            </Button>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 36,
                backgroundColor: isSaveFinalDisabled ? "#F1F5F9" : "#FFFFFF",
                borderLeft: `1.5px solid ${isSaveFinalDisabled ? "#CBD5E1" : "#8E9AA8"}`,
                color: isSaveFinalDisabled ? "#94A3B8" : "#8E9AA8",
                fontWeight: 800,
              }}
            >
              <Save size={16} />
            </Box>
          </Box>

          {/* Button 4: DOWNLOAD */}
          <Box
            sx={{
              display: "flex",
              borderRadius: "8px",
              overflow: "hidden",
              border: `1.5px solid ${isDownloadDisabled ? "#CBD5E1" : "#9C27B0"}`,
              boxShadow: isDownloadDisabled ? "none" : "0 3px 10px rgba(156, 39, 176, 0.15)",
              height: 42
            }}
          >
            <Button
              onClick={() => window.print()}
              disabled={isDownloadDisabled}
              sx={{
                backgroundColor: "#9C27B0",
                color: "#FFFFFF",
                fontWeight: 800,
                fontSize: 13.5,
                px: 2.5,
                borderRadius: "0px",
                textTransform: "none",
                "&:hover": { backgroundColor: "#7B1FA2" },
                "&.Mui-disabled": { backgroundColor: "#F1F5F9", color: "#94A3B8" }
              }}
            >
              DOWNLOAD
            </Button>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 36,
                backgroundColor: isDownloadDisabled ? "#F1F5F9" : "#FFFFFF",
                borderLeft: `1.5px solid ${isDownloadDisabled ? "#CBD5E1" : "#9C27B0"}`,
                color: isDownloadDisabled ? "#94A3B8" : "#9C27B0",
                fontWeight: 800,
              }}
            >
              <Download size={16} />
            </Box>
          </Box>
        </Stack>
      </Box>

      {/* Editable bilingual header; inherited from the latest published roster. */}
      <Box
        sx={{
          p: 2.5,
          backgroundColor: "#FFFFFF",
          borderRadius: "16px",
          border: "1px solid #D7E3F7",
        }}
      >
        <Stack direction={{ xs: "column", sm: "row" }} alignItems={{ sm: "center" }} justifyContent="space-between" gap={1} mb={2}>
          <Box>
            <Typography sx={{ fontWeight: 900, fontSize: 16, color: "#0F172A" }}>
              Roster Header — Hindi & English
            </Typography>
            <Typography sx={{ fontSize: 12, color: "#64748B", mt: 0.25 }}>
              Auto-fetched from the last published roster. You can edit it before saving this roster.
            </Typography>
          </Box>
          <Button
            size="small"
            variant="outlined"
            disabled={isFinal || !lastPublishedRoster?.header}
            onClick={() => setHeader(rosterHeader(lastPublishedRoster?.header))}
            sx={{ borderColor: "#0057B7", color: "#0057B7", fontWeight: 800, textTransform: "none" }}
          >
            Restore published header
          </Button>
        </Stack>
        <Grid container spacing={1.5}>
          {[
            ["organizationHindi", "Organization name (Hindi)"],
            ["officeHindi", "Office name (Hindi)"],
            ["organizationEnglish", "Organization name (English)"],
            ["officeEnglish", "Office name (English)"],
            ["rosterTitle", "Roster title"],
          ].map(([key, label], index) => (
            <Grid item xs={12} md={index === 4 ? 12 : 6} key={key}>
              <TextField
                label={label}
                value={header[key] || ""}
                onChange={(event) => setHeader((current) => ({ ...current, [key]: event.target.value }))}
                disabled={isFinal}
                size="small"
                fullWidth
                inputProps={{ lang: key.endsWith("Hindi") ? "hi" : "en" }}
                sx={{
                  "& .MuiOutlinedInput-root": { borderRadius: "9px" },
                  "& input": { fontFamily: key.endsWith("Hindi") ? '"Noto Sans Devanagari", Mangal, sans-serif' : "inherit" },
                }}
              />
            </Grid>
          ))}
        </Grid>
      </Box>

      {/* 3. GROUP DETAILS SECTION */}
      <Box sx={{ mt: 1 }}>
        <Typography sx={{ fontWeight: 800, fontSize: 16, color: "#334155", mb: 2 }}>
          Group Details
        </Typography>

        <Grid container spacing={2.5}>
          {groupsToDisplay.map((group, idx) => (
            <Grid item xs={12} sm={6} md={3} key={group.groupName || idx}>
              <Box
                sx={{
                  backgroundColor: "#F4F9F6",
                  border: "1.5px solid #D1E7DD",
                  borderRadius: "12px",
                  p: 2.5,
                  minHeight: 200,
                  display: "flex",
                  flexDirection: "column"
                }}
              >
                <Typography sx={{ fontWeight: 900, fontSize: 16, color: "#0F5132", mb: 1.5 }}>
                  {group.groupName}
                </Typography>
                
                <Typography sx={{ fontSize: 11, fontWeight: 900, color: "#198754", textTransform: "uppercase", letterSpacing: "0.02em", mb: 0.3 }}>
                  Shift Incharge:
                </Typography>
                <Typography sx={{ fontSize: 13, color: "#2D3748", mb: 2, fontWeight: 700 }}>
                  {group.shiftInCharge ? `${group.shiftInCharge.name}(${group.shiftInCharge.employeeId}) - ${group.shiftInCharge.designation}` : "Not assigned"}
                </Typography>

                <Typography sx={{ fontSize: 11, fontWeight: 900, color: "#198754", textTransform: "uppercase", letterSpacing: "0.02em", mb: 0.3 }}>
                  Subordinates:
                </Typography>
                <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
                  {(group.members || []).map((member) => (
                    <Typography key={member.employeeId} sx={{ fontSize: 12, color: "#4A5568", fontWeight: 600 }}>
                      • {member.name} ({member.employeeId}) - {member.designation}
                    </Typography>
                  ))}
                  {(!group.members || group.members.length === 0) && (
                    <Typography sx={{ fontSize: 12, color: "#94A3B8", fontStyle: "italic" }}>
                      No members assigned
                    </Typography>
                  )}
                </Box>
              </Box>
            </Grid>
          ))}
          {groupsToDisplay.length === 0 && (
            <Grid item xs={12}>
              <Box sx={{ p: 4, textAlign: "center", border: "1.5px dashed #CBD5E1", borderRadius: "12px", backgroundColor: "#F8FAFC" }}>
                <Typography sx={{ color: "#94A3B8", fontWeight: 700 }}>No active groups found in setup.</Typography>
              </Box>
            </Grid>
          )}
        </Grid>
      </Box>

      {/* 4. INTERACTIVE ROSTER GRID SECTION (Only when data is generated) */}
      <GlassCard hover={false} padding={0} sx={{ overflow: "hidden", mt: 1 }}>
        {!rosterData.length ? (
          <Box sx={{ py: 10, textAlign: "center" }}>
            <RefreshCw size={32} color="#94A3B8" style={{ animation: busy ? "spin 2s linear infinite" : "none" }} />
            <Typography sx={{ mt: 1.5, fontWeight: 900, color: "#334155" }}>
              No roster generated
            </Typography>
            <Typography sx={{ color: "#94A3B8", mt: 0.5 }}>
              Select a date range above and click GENERATE to build the duty schedule.
            </Typography>
          </Box>
        ) : (
          <Box sx={{ overflow: "auto" }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ position: "sticky", left: 0, zIndex: 5, minWidth: 170, background: "#F8FAFC", fontWeight: 900, borderRight: "1px solid #E2E8F0" }}>
                    Group
                  </TableCell>
                  {dates.map((date) => (
                    <TableCell key={date} align="center" sx={{ minWidth: 88, background: "#F8FAFC", fontWeight: 900 }}>
                      <Box sx={{ fontSize: 13, color: "#334155" }}>
                        {new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                      </Box>
                      <Typography variant="caption" color="#94A3B8" fontWeight={900}>
                        {new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short" })}
                      </Typography>
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {rosterData.map((group, groupIndex) => (
                  <TableRow key={group.groupName} hover>
                    <TableCell sx={{ position: "sticky", left: 0, zIndex: 2, background: "#FFF", borderRight: "1px solid #E2E8F0", boxShadow: "2px 0 5px rgba(0,0,0,0.03)" }}>
                      <Typography sx={{ fontWeight: 900, color: "#0F172A", fontSize: 14 }}>
                        {group.groupName}
                      </Typography>
                      <Typography sx={{ fontSize: 11, color: "#64748B", fontWeight: 650, mt: 0.2 }}>
                        {group.shiftInCharge?.name ? `SIC: ${group.shiftInCharge.name}` : `${group.members?.length || 0} members`}
                      </Typography>
                    </TableCell>
                    {dates.map((date) => {
                      const duty = group.data?.[date];
                      const [background, color] = dutyColor(duty);
                      return (
                        <TableCell key={date} align="center" sx={{ p: 0.6 }}>
                          <Select
                            value={duty || ""}
                            onChange={(event) => updateDuty(groupIndex, date, event.target.value)}
                            disabled={isFinal}
                            variant="standard"
                            disableUnderline
                            sx={{
                              width: 66,
                              height: 34,
                              px: 0.5,
                              borderRadius: 2,
                              background,
                              color,
                              fontSize: 12,
                              fontWeight: 900,
                              "& .MuiSelect-select": { textAlign: "center", py: 0.8 },
                              boxShadow: "inset 0 1px 2px rgba(0,0,0,0.05)"
                            }}
                          >
                            {DUTIES.map((item) => (
                              <MenuItem key={item} value={item} sx={{ fontSize: 12, fontWeight: 900 }}>
                                {item}
                              </MenuItem>
                            ))}
                          </Select>
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}
      </GlassCard>

      {/* 5. SPECIAL INSTRUCTIONS SECTION */}
      <Box sx={{ mt: 1 }}>
        <Typography sx={{ fontWeight: 800, fontSize: 16, color: "#334155", mb: 1.5 }}>
          Special Instructions
        </Typography>
        <TextField
          value={instructions}
          onChange={(event) => setInstructions(event.target.value)}
          disabled={isFinal}
          multiline
          minRows={3}
          fullWidth
          variant="outlined"
          sx={{
            backgroundColor: "#FFFFFF",
            borderRadius: "12px",
            boxShadow: "0 4px 20px rgba(15, 98, 76, 0.01)",
            "& .MuiOutlinedInput-root": {
              borderRadius: "12px",
              fontSize: 13,
              fontWeight: 500,
              lineHeight: 1.6,
              color: "#334155",
              p: 2.5
            }
          }}
        />
      </Box>

      {/* 6. FOOTER INPUT CARDS (Distribution, Signing, Leave approvals) */}
      <Stack direction={{ xs: "column", lg: "row" }} spacing={3.5} sx={{ mt: 1 }} alignItems="stretch">
        {/* Coral/Pink Distribution card */}
        <Box
          sx={{
            backgroundColor: "#FFF5F5",
            border: "1.5px solid #FADBD8",
            borderRadius: "16px",
            p: 3,
            flex: 2,
            display: "flex",
            flexDirection: "column",
            gap: 1.5,
            boxShadow: "0 4px 15px rgba(250, 219, 216, 0.15)"
          }}
        >
          <Typography sx={{ fontWeight: 900, fontSize: 15, color: "#C0392B", textTransform: "uppercase", letterSpacing: "0.02em" }}>
            Distribution
          </Typography>
          <TextField
            value={distribution}
            onChange={(event) => setDistribution(event.target.value)}
            disabled={isFinal}
            placeholder="Specify roster distribution list..."
            multiline
            minRows={3}
            fullWidth
            variant="outlined"
            sx={{
              backgroundColor: "#FFFFFF",
              borderRadius: "8px",
              "& .MuiOutlinedInput-root": {
                borderRadius: "8px",
                fontSize: 13,
                fontWeight: 550,
                color: "#334155",
                p: 1.5
              }
            }}
          />
        </Box>

        {/* Signing Authority card */}
        <Box
          sx={{
            backgroundColor: "#FFFFFF",
            border: "1px solid #E2E8F0",
            borderRadius: "16px",
            p: 3,
            flex: 1,
            display: "flex",
            flexDirection: "column",
            gap: 1.5,
            boxShadow: "0 4px 20px rgba(15, 98, 76, 0.01)"
          }}
        >
          <Typography sx={{ fontWeight: 800, fontSize: 14, color: "#334155" }}>
            Signing Authority
          </Typography>
          <FormControl size="small" fullWidth sx={{ mt: 0.5 }}>
            <Select
              value={signedBy}
              onChange={(event) => setSignedBy(event.target.value)}
              disabled={isFinal}
              displayEmpty
              sx={{ borderRadius: "8px" }}
            >
              <MenuItem value="">
                <Typography sx={{ color: "#94A3B8", fontSize: 13, fontWeight: 600 }}>Select signing authority</Typography>
              </MenuItem>
              {employees.map((item) => {
                const employeeId = employeeKey(item);
                return (
                <MenuItem key={`sign-${employeeId}`} value={employeeId} sx={{ fontSize: 13, fontWeight: 700 }}>
                  {formatBilingual(item.name, item.nameHindi)} · {formatBilingual(item.designation, item.designationHindi)}
                </MenuItem>
                );
              })}
            </Select>
          </FormControl>
        </Box>

        {/* Leave Approving Authority card */}
        <Box
          sx={{
            backgroundColor: "#FFFFFF",
            border: "1px solid #E2E8F0",
            borderRadius: "16px",
            p: 3,
            flex: 1,
            display: "flex",
            flexDirection: "column",
            gap: 1.5,
            boxShadow: "0 4px 20px rgba(15, 98, 76, 0.01)"
          }}
        >
          <Typography sx={{ fontWeight: 800, fontSize: 14, color: "#334155" }}>
            Leave Approving Authority
          </Typography>
          <FormControl size="small" fullWidth sx={{ mt: 0.5 }}>
            <Select
              value={leaveAuthority}
              onChange={(event) => setLeaveAuthority(event.target.value)}
              disabled={isFinal}
              displayEmpty
              sx={{ borderRadius: "8px" }}
            >
              <MenuItem value="">
                <Typography sx={{ color: "#94A3B8", fontSize: 13, fontWeight: 600 }}>Select leave authority</Typography>
              </MenuItem>
              {employees.map((item) => {
                const employeeId = employeeKey(item);
                return (
                <MenuItem key={`leave-${employeeId}`} value={employeeId} sx={{ fontSize: 13, fontWeight: 700 }}>
                  {formatBilingual(item.name, item.nameHindi)} · {formatBilingual(item.designation, item.designationHindi)}
                </MenuItem>
                );
              })}
            </Select>
          </FormControl>
        </Box>

      </Stack>

      {/* Roster History Modal */}
      <Dialog
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        fullWidth
        maxWidth="md"
        PaperProps={{ sx: { borderRadius: "16px" } }}
      >
        <DialogTitle sx={{ fontWeight: 900, color: "#0F172A" }}>Roster history</DialogTitle>
        <DialogContent dividers sx={{ p: 2.5 }}>
          {!history.length ? (
            <Typography color="#64748B" sx={{ fontWeight: 600 }}>No saved rosters.</Typography>
          ) : (
            <Stack spacing={2}>
              {history.map((record) => (
                <Paper key={record.id} variant="outlined" sx={{ p: 2, borderRadius: "12px", border: "1px solid #E2E8F0" }}>
                  <Stack direction="row" alignItems="center" spacing={2}>
                    <Box sx={{ flex: 1 }}>
                      <Typography sx={{ fontWeight: 800, color: "#1E293B", fontSize: 15 }}>
                        {formatPrintDate(record.startDate)} → {formatPrintDate(record.endDate)}
                      </Typography>
                      <Stack direction="row" spacing={1} mt={1}>
                        <Chip
                          size="small"
                          label={record.isFinal ? "Final" : "Draft"}
                          color={record.isFinal ? "success" : "default"}
                          sx={{ fontWeight: 800, borderRadius: "4px" }}
                        />
                        <Chip
                          size="small"
                          label={record.calendarPushed ? "Published" : "Not published"}
                          variant="outlined"
                          sx={{ fontWeight: 800, borderRadius: "4px" }}
                        />
                      </Stack>
                    </Box>
                    <Button
                      onClick={() => loadRoster(record.id)}
                      variant="contained"
                      sx={{
                        textTransform: "none",
                        fontWeight: 800,
                        borderRadius: "8px",
                        backgroundColor: "#03624C",
                        "&:hover": { backgroundColor: "#024c3b" }
                      }}
                    >
                      Load
                    </Button>
                    {!record.isFinal && (
                      <IconButton color="error" onClick={() => remove(record.id)} sx={{ border: "1px solid #FADBD8", borderRadius: "8px", p: 1 }}>
                        <Trash2 size={16} />
                      </IconButton>
                    )}
                  </Stack>
                </Paper>
              ))}
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setHistoryOpen(false)} sx={{ fontWeight: 800, textTransform: "none", color: "#64748B" }}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </AppShell>
  );
}

