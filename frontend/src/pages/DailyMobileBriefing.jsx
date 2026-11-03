import { useState, useEffect, useMemo, useRef } from "react";
import {
  Smartphone,
  Mail,
  Copy,
  Download,
  ExternalLink,
  RefreshCw,
  Send,
  Check,
  Eye,
  Code,
  Users,
  Zap,
  BarChart3,
  PieChart,
  Settings,
  Calendar,
  AlertCircle,
  TrendingUp,
  Activity,
  CheckCircle2,
} from "lucide-react";
import { Link } from "react-router-dom";
import AppShell from "../components/layout/AppShell";
import CalendarInput from "../components/ui/CalendarInput";
import API from "../services/api";

const SOURCE_COLORS = {
  thermal: "#E28743",
  hydro: "#2563EB",
  wind: "#14B8A6",
  solar: "#FBBF24",
  small_hydro: "#60A5FA",
  others: "#8B5CF6",
};

const DAY_THEMES = [
  { bg: "#F0FDF4", border: "#86EFAC", badgeBg: "#15803D", text: "#14532D" },
  { bg: "#FFF7ED", border: "#FED7AA", badgeBg: "#C2410C", text: "#7C2D12" },
  { bg: "#EFF6FF", border: "#BFDBFE", badgeBg: "#1D4ED8", text: "#1E3A8A" },
  { bg: "#FAF5FF", border: "#E9D5FF", badgeBg: "#7E22CE", text: "#581C87" },
];

function formatNum(val, decimals = 2, fallback = "-") {
  if (val === null || val === undefined || val === "") return fallback;
  const n = Number(val);
  if (Number.isNaN(n)) return String(val);
  return n.toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function DiffBadge({ todayVal, compVal, unit = "" }) {
  if (todayVal === null || todayVal === undefined || compVal === null || compVal === undefined) return null;
  const t = Number(todayVal);
  const c = Number(compVal);
  if (Number.isNaN(t) || Number.isNaN(c)) return null;

  const diff = t - c;
  const pct = c > 0 ? (diff / c) * 100 : 0.0;
  const isPositive = diff >= 0;
  const sign = isPositive ? "+" : "";
  const color = isPositive ? "#15803D" : "#DC2626";
  const bg = isPositive ? "#DCFCE7" : "#FEE2E2";

  return (
    <span
      style={{
        display: "inline-block",
        fontSize: "10.5px",
        fontWeight: 800,
        color,
        background: bg,
        padding: "1px 5px",
        borderRadius: "4px",
        marginLeft: "4px",
      }}
    >
      ({sign}{diff.toFixed(2)}{unit} • {sign}{pct.toFixed(1)}%)
    </span>
  );
}

export default function DailyMobileBriefing() {
  const [selectedDate, setSelectedDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [rawHtml, setRawHtml] = useState("");
  const [mailConfig, setMailConfig] = useState(null);
  const [activeTab, setActiveTab] = useState("preview"); // "preview" | "interactive" | "code"
  const [selectedMetric, setSelectedMetric] = useState("all"); // "all" | "yesterday" | "avg7" | "last_year"
  const [copied, setCopied] = useState(false);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState(null);
  const [overrideTo, setOverrideTo] = useState("");
  const [overrideCc, setOverrideCc] = useState("");
  const iframeRef = useRef(null);

  const fetchBriefing = async (targetDate) => {
    setLoading(true);
    setSendResult(null);
    try {
      const res = await API.getMobileBriefing(targetDate);
      if (res.success) {
        setData(res.data);
        setRawHtml(res.html);
        setMailConfig(res.mail_config);
        if (!selectedDate && res.date) {
          setSelectedDate(res.date);
        }
        if (res.mail_config) {
          setOverrideTo(res.mail_config.recipients || "");
          setOverrideCc(res.mail_config.ccRecipients || "");
        }
      }
    } catch (err) {
      console.error("Failed to load mobile briefing:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBriefing(selectedDate);
  }, [selectedDate]);

  const handleCopyHtml = async () => {
    if (!rawHtml) return;
    try {
      await navigator.clipboard.writeText(rawHtml);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.error("Failed to copy HTML:", err);
    }
  };

  const handleDownloadHtml = () => {
    if (!rawHtml) return;
    const blob = new Blob([rawHtml], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `daily_mobile_briefing_${selectedDate || "latest"}.html`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleSendEmail = async () => {
    setSending(true);
    setSendResult(null);
    try {
      const payload = {
        date_str: selectedDate,
        recipients: overrideTo,
        cc_recipients: overrideCc,
      };
      const res = await API.sendMobileBriefing(payload);
      setSendResult({
        success: true,
        message: res.message || "Briefing email sent successfully!",
        recipients: res.recipients,
      });
    } catch (err) {
      console.error("Failed to send briefing email:", err);
      setSendResult({
        success: false,
        message: err.response?.data?.detail || err.message || "Failed to send briefing email.",
      });
    } finally {
      setSending(false);
    }
  };

  const crewDays = data?.crew_days || [];
  const energyRows = data?.psp_energy_rows || [];
  const demandRows = data?.psp_demand_rows || [];
  const genSources = data?.gen_sources || {};
  const composition = genSources?.composition || [];
  const statesGen = genSources?.states || [];
  const totalsGen = genSources?.totals || {};
  const powerPos = data?.power_position || [];
  const nldcSummary = data?.nldc_summary || {};
  const allIndiaContrib = data?.all_india_contribution || {};
  const shiftTimings = data?.shift_timings || {
    Morning: "08:30 - 14:30",
    Evening: "14:30 - 20:30",
    Night: "20:30 - 08:30 [Next day]",
  };

  return (
    <AppShell
      title="Daily Mobile Briefing"
      subtitle="Mobile-optimized HTML email bulletin combining Crew 4-day duties & comprehensive PSP metrics"
    >
      <div style={{ padding: "16px 20px 40px", maxWidth: "1400px", margin: "0 auto" }}>
        
        {/* TOP CONTROL BAR */}
        <div
          style={{
            background: "#FFFFFF",
            border: "1px solid #E2E8F0",
            borderRadius: "16px",
            padding: "16px 20px",
            marginBottom: "20px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "14px",
          }}
        >
          {/* Left: Date selector & info */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <div style={{ width: "220px" }}>
              <CalendarInput
                value={selectedDate}
                onChange={(newVal) => setSelectedDate(newVal)}
                disabled={loading}
              />
            </div>

            <button
              onClick={() => fetchBriefing(selectedDate)}
              disabled={loading}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 14px",
                borderRadius: "10px",
                border: "1px solid #CBD5E1",
                background: "#F8FAFC",
                color: "#1E293B",
                fontWeight: 700,
                fontSize: "13px",
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              {loading ? "Loading..." : "Refresh"}
            </button>

            {data && (
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  background: "#EFF6FF",
                  border: "1px solid #BFDBFE",
                  padding: "6px 12px",
                  borderRadius: "999px",
                  fontSize: "12px",
                  color: "#1D4ED8",
                  fontWeight: 700,
                }}
              >
                <span>📅</span>
                <span>{data.day_of_week}, {data.date_formatted}</span>
              </div>
            )}
          </div>

          {/* Right: Action Buttons */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <button
              onClick={handleCopyHtml}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 14px",
                borderRadius: "10px",
                border: "1px solid #CBD5E1",
                background: copied ? "#DCFCE7" : "#FFFFFF",
                color: copied ? "#15803D" : "#0F172A",
                fontWeight: 700,
                fontSize: "13px",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              {copied ? <Check size={15} /> : <Copy size={15} />}
              {copied ? "HTML Copied!" : "Copy HTML"}
            </button>

            <button
              onClick={handleDownloadHtml}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 14px",
                borderRadius: "10px",
                border: "1px solid #CBD5E1",
                background: "#FFFFFF",
                color: "#0F172A",
                fontWeight: 700,
                fontSize: "13px",
                cursor: "pointer",
              }}
            >
              <Download size={15} />
              Download HTML
            </button>

            <a
              href={`/api/reports/mobile-briefing/html?date_str=${selectedDate || ""}`}
              target="_blank"
              rel="noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 14px",
                borderRadius: "10px",
                border: "1px solid #CBD5E1",
                background: "#FFFFFF",
                color: "#0F172A",
                fontWeight: 700,
                fontSize: "13px",
                textDecoration: "none",
                cursor: "pointer",
              }}
            >
              <ExternalLink size={15} />
              Open Raw HTML
            </a>

            <button
              onClick={() => setSendDialogOpen(true)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 16px",
                borderRadius: "10px",
                border: "none",
                background: "#0057B7",
                color: "#FFFFFF",
                fontWeight: 800,
                fontSize: "13px",
                cursor: "pointer",
                boxShadow: "0 2px 6px rgba(0,87,183,0.25)",
              }}
            >
              <Send size={15} />
              Send Email Now
            </button>
          </div>
        </div>

        {/* RECIPIENTS STATUS BANNER */}
        <div
          style={{
            background: "#F8FAFC",
            border: "1px solid #E2E8F0",
            borderRadius: "12px",
            padding: "10px 16px",
            marginBottom: "16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "10px",
            fontSize: "12.5px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#475569" }}>
            <Mail size={16} color="#0057B7" />
            <span>Configured Mail Recipients (Admin):</span>
            <span style={{ fontWeight: 800, color: "#0F172A" }}>
              {mailConfig?.recipients ? mailConfig.recipients : "None configured"}
            </span>
            {mailConfig?.ccRecipients && (
              <span style={{ color: "#64748B" }}>
                (CC: {mailConfig.ccRecipients})
              </span>
            )}
          </div>
          <Link
            to="/admin/mail-settings"
            style={{
              color: "#0057B7",
              fontWeight: 800,
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            <Settings size={13} />
            Configure in Admin &gt; Mail Settings
          </Link>
        </div>

        {/* VIEW TABS */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            marginBottom: "16px",
            borderBottom: "1px solid #E2E8F0",
            paddingBottom: "8px",
          }}
        >
          <button
            onClick={() => setActiveTab("preview")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "7px",
              padding: "8px 18px",
              borderRadius: "999px",
              border: "none",
              background: activeTab === "preview" ? "#0057B7" : "#F1F5F9",
              color: activeTab === "preview" ? "#FFFFFF" : "#475569",
              fontWeight: 800,
              fontSize: "13px",
              cursor: "pointer",
            }}
          >
            <Smartphone size={15} />
            📱 Mobile Device Preview (Framed View)
          </button>

          <button
            onClick={() => setActiveTab("interactive")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "7px",
              padding: "8px 18px",
              borderRadius: "999px",
              border: "none",
              background: activeTab === "interactive" ? "#0057B7" : "#F1F5F9",
              color: activeTab === "interactive" ? "#FFFFFF" : "#475569",
              fontWeight: 800,
              fontSize: "13px",
              cursor: "pointer",
            }}
          >
            <Eye size={15} />
            📊 Interactive Tiles & Breakdown
          </button>

          <button
            onClick={() => setActiveTab("code")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "7px",
              padding: "8px 18px",
              borderRadius: "999px",
              border: "none",
              background: activeTab === "code" ? "#0057B7" : "#F1F5F9",
              color: activeTab === "code" ? "#FFFFFF" : "#475569",
              fontWeight: 800,
              fontSize: "13px",
              cursor: "pointer",
            }}
          >
            <Code size={15} />
            📄 Raw HTML Code
          </button>
        </div>

        {/* TAB 1: MOBILE DEVICE PREVIEW (IMAGE 2 / PHONE FRAME MOCKUP) */}
        {activeTab === "preview" && (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              padding: "20px 0 40px",
              background: "linear-gradient(180deg, #F8FAFC 0%, #E2E8F0 100%)",
              borderRadius: "20px",
              border: "1px solid #E2E8F0",
            }}
          >
            {/* Phone Bezel */}
            <div
              style={{
                width: "440px",
                maxWidth: "100%",
                background: "#0F172A",
                borderRadius: "44px",
                padding: "14px 12px",
                boxShadow: "0 25px 60px -15px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.1)",
              }}
            >
              {/* Top Dynamic Island / Speaker Notch */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  paddingBottom: "10px",
                }}
              >
                <div
                  style={{
                    width: "110px",
                    height: "18px",
                    background: "#000000",
                    borderRadius: "20px",
                  }}
                />
              </div>

              {/* Screen Area (Iframe) */}
              <div
                style={{
                  borderRadius: "32px",
                  overflow: "hidden",
                  background: "#FFFFFF",
                  height: "820px",
                }}
              >
                {rawHtml ? (
                  <iframe
                    ref={iframeRef}
                    srcDoc={rawHtml}
                    title="Mobile Briefing Preview"
                    style={{
                      width: "100%",
                      height: "100%",
                      border: "none",
                      display: "block",
                    }}
                  />
                ) : (
                  <div
                    style={{
                      display: "grid",
                      placeItems: "center",
                      height: "100%",
                      color: "#64748B",
                      fontSize: "14px",
                    }}
                  >
                    Loading mobile briefing...
                  </div>
                )}
              </div>

              {/* Bottom Home Indicator */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  paddingTop: "10px",
                }}
              >
                <div
                  style={{
                    width: "120px",
                    height: "4px",
                    background: "#64748B",
                    borderRadius: "4px",
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: INTERACTIVE TILES & CHARTS VIEW */}
        {activeTab === "interactive" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            
            {/* SECTION 1: CREW DUTIES (NEXT 4 DAYS) - IMAGE 2 STYLE */}
            <div
              style={{
                background: "#FFFFFF",
                borderRadius: "16px",
                border: "1px solid #E2E8F0",
                padding: "20px",
                boxShadow: "0 2px 6px rgba(0,0,0,0.02)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "16px",
                  borderBottom: "1px solid #F1F5F9",
                  paddingBottom: "12px",
                }}
              >
                <div>
                  <div style={{ fontSize: "16px", fontWeight: 900, color: "#0F172A", display: "flex", alignItems: "center", gap: "8px" }}>
                    <Users size={18} color="#0057B7" />
                    <span>Crew Management • Duty Schedule for Next 4 Days</span>
                  </div>
                  <div style={{ fontSize: "12px", color: "#64748B", marginTop: "2px" }}>
                    Displaying Morning, Evening, Night shifts, assigned Shift-in-Charge (SIC / Acting SIC), and personnel on leave.
                  </div>
                </div>
                <Link
                  to="/crew/calendar"
                  style={{
                    fontSize: "12px",
                    fontWeight: 700,
                    color: "#0057B7",
                    textDecoration: "none",
                  }}
                >
                  View Full Crew Calendar &rarr;
                </Link>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                  gap: "14px",
                }}
              >
                {crewDays.map((day, idx) => {
                  const theme = DAY_THEMES[idx % DAY_THEMES.length];
                  const shifts = day.shifts || {};
                  const leaves = day.leaves || [];

                  return (
                    <div
                      key={day.date}
                      style={{
                        background: theme.bg,
                        border: `1.5px solid ${theme.border}`,
                        borderRadius: "16px",
                        padding: "14px",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          marginBottom: "10px",
                          borderBottom: `1px dashed ${theme.border}`,
                          paddingBottom: "8px",
                        }}
                      >
                        <div style={{ fontSize: "14px", fontWeight: 900, color: theme.text }}>
                          📅 {day.day_label}
                        </div>
                        <span
                          style={{
                            background: theme.badgeBg,
                            color: "#FFFFFF",
                            fontSize: "10.5px",
                            fontWeight: 800,
                            padding: "2px 8px",
                            borderRadius: "999px",
                          }}
                        >
                          {idx === 0 ? "Today" : `Day +${idx}`}
                        </span>
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        {[
                          { name: "Morning", icon: "🌅", time: shiftTimings.Morning || "08:30 - 14:30", color: "#0284C7" },
                          { name: "Evening", icon: "☀️", time: shiftTimings.Evening || "14:30 - 20:30", color: "#D97706" },
                          { name: "Night", icon: "🌙", time: shiftTimings.Night || "20:30 - 08:30 [Next day]", color: "#4F46E5" },
                        ].map((s) => {
                          const sData = shifts[s.name] || {};
                          const sicList = sData.sic || [];
                          const engList = sData.engineers || [];

                          return (
                            <div
                              key={s.name}
                              style={{
                                background: "#FFFFFF",
                                borderRadius: "10px",
                                padding: "8px 10px",
                                border: "1px solid rgba(0,0,0,0.05)",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  marginBottom: "4px",
                                }}
                              >
                                <span style={{ fontWeight: 800, color: s.color, fontSize: "12px" }}>
                                  {s.icon} {s.name}{" "}
                                  <span style={{ fontWeight: 400, fontSize: "10px", color: "#64748B" }}>
                                    ({s.time})
                                  </span>
                                </span>
                                <span style={{ fontSize: "11px", fontWeight: 800, color: "#0F172A" }}>
                                  {sicList.length > 0 ? (
                                    sicList.map((p, i) => (
                                      <span key={i} style={{ marginLeft: "4px" }}>
                                        {p.on_leave ? (
                                          <s style={{ color: "#94A3B8" }}>{p.name}</s>
                                        ) : (
                                          p.name
                                        )}{" "}
                                        {p.on_leave && p.replacement_name && (
                                          <span style={{ background: "#FEF3C7", color: "#92400E", fontSize: "10px", padding: "1px 5px", borderRadius: "4px", border: "1px solid #FCD34D" }}>
                                            [Rep: {p.replacement_name}]
                                          </span>
                                        )}
                                        {p.on_leave && p.flashing_r && (
                                          <span style={{ background: "#FEE2E2", color: "#B91C1C", fontSize: "10px", padding: "1px 5px", borderRadius: "4px", border: "1px solid #FCA5A5" }}>
                                            [⚠ Flashing R / Replacement Needed]
                                          </span>
                                        )}
                                        {!p.on_leave && p.acting_sic && (
                                          <span style={{ color: "#D97706", fontSize: "10px" }}>(Acting SIC)</span>
                                        )}
                                        {!p.on_leave && !p.acting_sic && (
                                          <span style={{ color: "#0057B7", fontSize: "10px" }}>(SIC)</span>
                                        )}
                                      </span>
                                    ))
                                  ) : (
                                    <span style={{ color: "#94A3B8", fontStyle: "italic" }}>Vacant</span>
                                  )}
                                </span>
                              </div>
                              <div style={{ fontSize: "11px", color: "#475569" }}>
                                Staff: {engList.length > 0 ? (
                                  engList.map((e, ei) => (
                                    <span key={ei} style={{ marginRight: "6px" }}>
                                      {e.on_leave ? (
                                        <s style={{ color: "#94A3B8" }}>{e.name}</s>
                                      ) : (
                                        e.name
                                      )}
                                      {e.on_leave && e.replacement_name && (
                                        <span style={{ background: "#FEF3C7", color: "#92400E", fontSize: "10px", padding: "1px 5px", borderRadius: "4px", border: "1px solid #FCD34D", marginLeft: "3px" }}>
                                          [Rep: {e.replacement_name}]
                                        </span>
                                      )}
                                      {e.on_leave && e.flashing_r && (
                                        <span style={{ background: "#FEE2E2", color: "#B91C1C", fontSize: "10px", padding: "1px 5px", borderRadius: "4px", border: "1px solid #FCA5A5", marginLeft: "3px" }}>
                                          [⚠ Flashing R / Replacement Needed]
                                        </span>
                                      )}
                                      {ei < engList.length - 1 ? "," : ""}
                                    </span>
                                  ))
                                ) : "-"}
                              </div>
                            </div>
                          );
                        })}

                        {leaves.length > 0 && (
                          <div style={{ marginTop: "4px", paddingTop: "6px", borderTop: `1px dotted ${theme.border}` }}>
                            <div style={{ fontSize: "10.5px", fontWeight: 800, color: "#B91C1C", marginBottom: "4px" }}>
                              ON LEAVE:
                            </div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                              {leaves.map((l, i) => (
                                <span
                                  key={i}
                                  style={{
                                    background: l.replacement_name ? "#FEF3C7" : "#FEE2E2",
                                    color: l.replacement_name ? "#92400E" : "#B91C1C",
                                    border: `1px solid ${l.replacement_name ? "#FCD34D" : "#FCA5A5"}`,
                                    fontSize: "10.5px",
                                    fontWeight: 700,
                                    padding: "2px 6px",
                                    borderRadius: "6px",
                                  }}
                                >
                                  🌴 <s style={{ textDecoration: "line-through" }}>{l.name}</s> ({l.leave_type})
                                  {l.replacement_name && (
                                    <span style={{ fontWeight: 800, marginLeft: "4px" }}>
                                      → [Rep: {l.replacement_name}]
                                    </span>
                                  )}
                                  {l.flashing_r && (
                                    <span style={{ fontWeight: 800, marginLeft: "4px", color: "#B91C1C" }}>
                                      → [⚠ Flashing R: Unreplaced]
                                    </span>
                                  )}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* SECTION 2: PSP DEMAND & ENERGY COMPARISON TILES (IMAGE 1 STYLE) */}
            <div
              style={{
                background: "#FFFFFF",
                borderRadius: "16px",
                border: "1px solid #E2E8F0",
                padding: "20px",
                boxShadow: "0 2px 6px rgba(0,0,0,0.02)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "16px",
                  borderBottom: "1px solid #F1F5F9",
                  paddingBottom: "12px",
                  flexWrap: "wrap",
                  gap: "10px",
                }}
              >
                <div>
                  <div style={{ fontSize: "16px", fontWeight: 900, color: "#0F172A", display: "flex", alignItems: "center", gap: "8px" }}>
                    <Zap size={18} color="#0057B7" />
                    <span>PSP Report Checking • Energy Consumption Comparison Tiles (MU)</span>
                  </div>
                  <div style={{ fontSize: "12px", color: "#64748B", marginTop: "2px" }}>
                    Large primary value shows Operational Day. Comparison metrics show bracketed deltas (+/- MU & %).
                  </div>
                </div>

                {/* Filter toggle */}
                <div style={{ display: "flex", gap: "6px", background: "#F1F5F9", padding: "4px", borderRadius: "10px" }}>
                  {[
                    { key: "all", label: "Show All Comparisons" },
                    { key: "yesterday", label: "vs Yesterday" },
                    { key: "avg7", label: "vs 7-Day Avg" },
                    { key: "last_year", label: "vs Last Year" },
                  ].map((m) => (
                    <button
                      key={m.key}
                      onClick={() => setSelectedMetric(m.key)}
                      style={{
                        padding: "4px 10px",
                        borderRadius: "8px",
                        border: "none",
                        background: selectedMetric === m.key ? "#0057B7" : "transparent",
                        color: selectedMetric === m.key ? "#FFFFFF" : "#475569",
                        fontWeight: 700,
                        fontSize: "11.5px",
                        cursor: "pointer",
                      }}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                  gap: "14px",
                }}
              >
                {energyRows.map((row, idx) => {
                  const stateName = row.state || row.constituent || "Constituent";
                  const opDay = row.operational_day;
                  const yesterday = row.yesterday;
                  const avg7 = row.average_last_7_days;
                  const lastYear = row.same_day_last_year;

                  const isEr = stateName.toUpperCase() === "ER";
                  const cardBg = isEr ? "#F0FDF4" : "#F8FAFC";
                  const borderColor = isEr ? "#86EFAC" : "#CBD5E1";

                  return (
                    <div
                      key={idx}
                      style={{
                        background: cardBg,
                        border: `1.5px solid ${borderColor}`,
                        borderRadius: "16px",
                        padding: "16px",
                        boxShadow: "0 2px 6px rgba(0,0,0,0.02)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          marginBottom: "6px",
                        }}
                      >
                        <span style={{ fontSize: "15px", fontWeight: 900, color: isEr ? "#15803D" : "#0F172A" }}>
                          {stateName}
                        </span>
                        <span style={{ fontSize: "10.5px", fontWeight: 800, color: "#64748B", textTransform: "uppercase" }}>
                          Daily Energy
                        </span>
                      </div>

                      {/* Primary Number */}
                      <div style={{ display: "flex", alignItems: "baseline", gap: "6px", marginBottom: "12px" }}>
                        <span
                          style={{
                            fontSize: "28px",
                            fontWeight: 950,
                            color: isEr ? "#15803D" : "#004DA8",
                            letterSpacing: "-0.5px",
                          }}
                        >
                          {formatNum(opDay, 2)}
                        </span>
                        <span style={{ fontSize: "13px", fontWeight: 800, color: "#64748B" }}>MU</span>
                      </div>

                      {/* Comparison metric chips */}
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            selectedMetric === "all" ? "1fr 1fr 1fr" : "1fr",
                          gap: "8px",
                        }}
                      >
                        {(selectedMetric === "all" || selectedMetric === "yesterday") && (
                          <div
                            style={{
                              background: "#FFFFFF",
                              border: "1px solid #E2E8F0",
                              borderRadius: "10px",
                              padding: "8px",
                              textAlign: "center",
                            }}
                          >
                            <div style={{ color: "#64748B", fontSize: "9.5px", fontWeight: 700, textTransform: "uppercase" }}>
                              Yesterday
                            </div>
                            <div style={{ fontWeight: 900, fontSize: "13px", color: "#0F172A", margin: "2px 0" }}>
                              {formatNum(yesterday, 1)}
                            </div>
                            <DiffBadge todayVal={opDay} compVal={yesterday} />
                          </div>
                        )}

                        {(selectedMetric === "all" || selectedMetric === "avg7") && (
                          <div
                            style={{
                              background: "#FFFFFF",
                              border: "1px solid #E2E8F0",
                              borderRadius: "10px",
                              padding: "8px",
                              textAlign: "center",
                            }}
                          >
                            <div style={{ color: "#64748B", fontSize: "9.5px", fontWeight: 700, textTransform: "uppercase" }}>
                              7-Day Avg
                            </div>
                            <div style={{ fontWeight: 900, fontSize: "13px", color: "#0F172A", margin: "2px 0" }}>
                              {formatNum(avg7, 1)}
                            </div>
                            <DiffBadge todayVal={opDay} compVal={avg7} />
                          </div>
                        )}

                        {(selectedMetric === "all" || selectedMetric === "last_year") && (
                          <div
                            style={{
                              background: "#FFFFFF",
                              border: "1px solid #E2E8F0",
                              borderRadius: "10px",
                              padding: "8px",
                              textAlign: "center",
                            }}
                          >
                            <div style={{ color: "#64748B", fontSize: "9.5px", fontWeight: 700, textTransform: "uppercase" }}>
                              Last Year
                            </div>
                            <div style={{ fontWeight: 900, fontSize: "13px", color: "#0F172A", margin: "2px 0" }}>
                              {formatNum(lastYear, 1)}
                            </div>
                            <DiffBadge todayVal={opDay} compVal={lastYear} />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

                        {/* SECTION 2B: PSP DEMAND MET (MAXIMUM DEMAND - MW) TILES */}
            {demandRows.length > 0 && (
              <div
                style={{
                  background: "#FFFFFF",
                  borderRadius: "16px",
                  border: "1px solid #E2E8F0",
                  padding: "20px",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.02)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: "16px",
                    borderBottom: "1px solid #F1F5F9",
                    paddingBottom: "12px",
                    flexWrap: "wrap",
                    gap: "10px",
                  }}
                >
                  <div>
                    <div style={{ fontSize: "16px", fontWeight: 900, color: "#0F172A", display: "flex", alignItems: "center", gap: "8px" }}>
                      <TrendingUp size={18} color="#0284C7" />
                      <span>PSP Report Checking • Demand Met Comparison (Maximum Demand - MW)</span>
                    </div>
                    <div style={{ fontSize: "12px", color: "#64748B", marginTop: "2px" }}>
                      Peak demand met by state with bracketed differences (+/- MW & %) vs Yesterday, 7-Day Avg, and Last Year.
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                    gap: "14px",
                  }}
                >
                  {demandRows.map((row, idx) => {
                    const stateName = row.state || "Constituent";
                    const opD = row.max_demand_operational;
                    const timeD = row.max_demand_time;
                    const yestD = row.max_demand_yesterday;
                    const avg7D = row.max_demand_average_last_7_days;
                    const lastYearD = row.max_demand_same_day_last_year;

                    const isEr = stateName.toUpperCase() === "ER";
                    const cardBg = isEr ? "#F0FDF4" : "#F8FAFC";
                    const borderColor = isEr ? "#86EFAC" : "#CBD5E1";

                    return (
                      <div
                        key={idx}
                        style={{
                          background: cardBg,
                          border: `1.5px solid ${borderColor}`,
                          borderRadius: "16px",
                          padding: "16px",
                          boxShadow: "0 2px 6px rgba(0,0,0,0.02)",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            marginBottom: "6px",
                          }}
                        >
                          <span style={{ fontSize: "15px", fontWeight: 900, color: isEr ? "#15803D" : "#0F172A" }}>
                            {stateName}
                          </span>
                          <span style={{ fontSize: "10.5px", fontWeight: 800, color: "#0284C7", textTransform: "uppercase" }}>
                            Peak Demand Met
                          </span>
                        </div>

                        <div style={{ display: "flex", alignItems: "baseline", gap: "6px", marginBottom: "12px" }}>
                          <span
                            style={{
                              fontSize: "28px",
                              fontWeight: 950,
                              color: isEr ? "#15803D" : "#0284C7",
                              letterSpacing: "-0.5px",
                            }}
                          >
                            {formatNum(opD, 0)}
                          </span>
                          <span style={{ fontSize: "13px", fontWeight: 800, color: "#64748B" }}>MW</span>
                          {timeD && (
                            <span style={{ fontSize: "11px", fontWeight: 700, color: "#64748B" }}>
                              ({timeD} hrs)
                            </span>
                          )}
                        </div>

                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: selectedMetric === "all" ? "1fr 1fr 1fr" : "1fr",
                            gap: "8px",
                          }}
                        >
                          {(selectedMetric === "all" || selectedMetric === "yesterday") && (
                            <div style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: "10px", padding: "8px", textAlign: "center" }}>
                              <div style={{ color: "#64748B", fontSize: "9.5px", fontWeight: 700, textTransform: "uppercase" }}>Yesterday</div>
                              <div style={{ fontWeight: 900, fontSize: "13px", color: "#0F172A", margin: "2px 0" }}>{formatNum(yestD, 0)}</div>
                              <DiffBadge todayVal={opD} compVal={yestD} unit=" MW" />
                            </div>
                          )}
                          {(selectedMetric === "all" || selectedMetric === "avg7") && (
                            <div style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: "10px", padding: "8px", textAlign: "center" }}>
                              <div style={{ color: "#64748B", fontSize: "9.5px", fontWeight: 700, textTransform: "uppercase" }}>7-Day Avg</div>
                              <div style={{ fontWeight: 900, fontSize: "13px", color: "#0F172A", margin: "2px 0" }}>{formatNum(avg7D, 0)}</div>
                              <DiffBadge todayVal={opD} compVal={avg7D} unit=" MW" />
                            </div>
                          )}
                          {(selectedMetric === "all" || selectedMetric === "last_year") && (
                            <div style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: "10px", padding: "8px", textAlign: "center" }}>
                              <div style={{ color: "#64748B", fontSize: "9.5px", fontWeight: 700, textTransform: "uppercase" }}>Last Year</div>
                              <div style={{ fontWeight: 900, fontSize: "13px", color: "#0F172A", margin: "2px 0" }}>{formatNum(lastYearD, 0)}</div>
                              <DiffBadge todayVal={opD} compVal={lastYearD} unit=" MW" />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* SECTION 2C: ALL INDIA DEMAND CONTRIBUTION & NLDC REGIONAL DEMAND */}
            {nldcSummary?.all_india && (
              <div
                style={{
                  background: "#FFFFFF",
                  borderRadius: "16px",
                  border: "1px solid #E2E8F0",
                  padding: "20px",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.02)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px", borderBottom: "1px solid #F1F5F9", paddingBottom: "10px" }}>
                  <div>
                    <div style={{ fontSize: "16px", fontWeight: 900, color: "#0F172A", display: "flex", alignItems: "center", gap: "8px" }}>
                      <Activity size={18} color="#0057B7" />
                      <span>All India Demand Contribution & NLDC Regional Demand</span>
                    </div>
                    <div style={{ fontSize: "12px", color: "#64748B", marginTop: "2px" }}>
                      Yesterday peak demand met across India and all 5 electrical regions ({nldcSummary.date_formatted || "Yesterday"}).
                    </div>
                  </div>
                </div>

                {/* All India Card */}
                <div style={{ background: "linear-gradient(135deg, #F0FDF4 0%, #DCFCE7 100%)", border: "1.5px solid #86EFAC", borderRadius: "14px", padding: "16px", marginBottom: "14px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                    <span style={{ fontSize: "14px", fontWeight: 900, color: "#14532D" }}>
                      🇮🇳 ALL INDIA MAXIMUM DEMAND MET
                    </span>
                    <span style={{ fontSize: "12px", fontWeight: 800, color: "#15803D" }}>
                      Time: {nldcSummary.all_india?.time || "-"}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginBottom: "8px" }}>
                    <span style={{ fontSize: "32px", fontWeight: 950, color: "#15803D" }}>
                      {formatNum(nldcSummary.all_india?.max_demand_met, 0)}
                    </span>
                    <span style={{ fontSize: "15px", fontWeight: 800, color: "#166534" }}>MW</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                    <div style={{ background: "rgba(255,255,255,0.8)", border: "1px solid #BBF7D0", borderRadius: "10px", padding: "8px 12px" }}>
                      <div style={{ color: "#166534", fontSize: "11px", fontWeight: 700 }}>☀️ Solar Period Peak</div>
                      <div style={{ fontWeight: 900, fontSize: "15px", color: "#0F172A" }}>{formatNum(nldcSummary.all_india?.solar, 0)} MW</div>
                      <div style={{ color: "#64748B", fontSize: "10px" }}>at {nldcSummary.all_india?.solar_time || "-"}</div>
                    </div>
                    <div style={{ background: "rgba(255,255,255,0.8)", border: "1px solid #BBF7D0", borderRadius: "10px", padding: "8px 12px" }}>
                      <div style={{ color: "#166534", fontSize: "11px", fontWeight: 700 }}>🌙 Non-Solar Period Peak</div>
                      <div style={{ fontWeight: 900, fontSize: "15px", color: "#0F172A" }}>{formatNum(nldcSummary.all_india?.non_solar, 0)} MW</div>
                      <div style={{ color: "#64748B", fontSize: "10px" }}>at {nldcSummary.all_india?.non_solar_time || "-"}</div>
                    </div>
                  </div>
                </div>

                {/* NLDC 5 Regions Grid */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px" }}>
                  {[
                    { label: "Northern (NR)", data: nldcSummary.nr, color: "#0284C7" },
                    { label: "Western (WR)", data: nldcSummary.wr, color: "#D97706" },
                    { label: "Southern (SR)", data: nldcSummary.sr, color: "#7C3AED" },
                    { label: "Eastern (ER)", data: nldcSummary.er, color: "#15803D" },
                    { label: "North Eastern (NER)", data: nldcSummary.ner, color: "#0D9488" },
                  ].map((rg, rIdx) => (
                    <div key={rIdx} style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderLeft: `4px solid ${rg.color}`, borderRadius: "12px", padding: "10px 14px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: "12px", fontWeight: 800, color: "#0F172A" }}>{rg.label}</span>
                        <span style={{ fontSize: "10px", color: "#64748B" }}>{rg.data?.time || "-"}</span>
                      </div>
                      <div style={{ fontSize: "18px", fontWeight: 950, color: rg.color, marginTop: "4px" }}>
                        {formatNum(rg.data?.max_demand_met, 0)} <span style={{ fontSize: "11px", fontWeight: 700, color: "#64748B" }}>MW</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SECTION 3: REGIONAL ENERGY COMPOSITION */}
            <div
              style={{
                background: "#FFFFFF",
                borderRadius: "16px",
                border: "1px solid #E2E8F0",
                padding: "20px",
                boxShadow: "0 2px 6px rgba(0,0,0,0.02)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "14px",
                  borderBottom: "1px solid #F1F5F9",
                  paddingBottom: "10px",
                }}
              >
                <div>
                  <div style={{ fontSize: "16px", fontWeight: 900, color: "#0F172A", display: "flex", alignItems: "center", gap: "8px" }}>
                    <PieChart size={18} color="#0057B7" />
                    <span>Regional Source Contribution by Magnitude</span>
                  </div>
                  <div style={{ fontSize: "12px", color: "#64748B", marginTop: "2px" }}>
                    Ranked breakdown of generation sources across the Eastern Region.
                  </div>
                </div>
                <div style={{ fontSize: "14px", fontWeight: 900, color: "#15803D" }}>
                  Total: {formatNum(totalsGen.generation_total, 1)} MU
                </div>
              </div>

              {/* Stacked Progress Bar */}
              <div
                style={{
                  width: "100%",
                  height: "24px",
                  borderRadius: "12px",
                  overflow: "hidden",
                  display: "flex",
                  background: "#E2E8F0",
                  marginBottom: "16px",
                  boxShadow: "inset 0 1px 3px rgba(0,0,0,0.1)",
                }}
              >
                {composition.map((item, idx) => {
                  const pct = Number(item.percent || 0);
                  const color = SOURCE_COLORS[item.key] || "#64748B";
                  if (pct <= 0) return null;
                  return (
                    <div
                      key={idx}
                      style={{
                        width: `${pct}%`,
                        background: color,
                        height: "100%",
                        transition: "width 0.3s ease",
                      }}
                      title={`${item.name}: ${pct.toFixed(1)}%`}
                    />
                  );
                })}
              </div>

              {/* Ranked Grid */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                  gap: "10px",
                }}
              >
                {composition.map((item, idx) => {
                  const color = SOURCE_COLORS[item.key] || "#64748B";
                  return (
                    <div
                      key={idx}
                      style={{
                        background: "#F8FAFC",
                        border: "1px solid #E2E8F0",
                        borderRadius: "12px",
                        padding: "10px 14px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span
                          style={{
                            width: "12px",
                            height: "12px",
                            borderRadius: "50%",
                            background: color,
                            display: "inline-block",
                          }}
                        />
                        <span style={{ fontSize: "13px", fontWeight: 800, color: "#0F172A" }}>
                          {item.name}
                        </span>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: "13px", fontWeight: 900, color: "#004DA8" }}>
                          {formatNum(item.abs_value, 1)}{" "}
                          <span style={{ fontSize: "10px", color: "#64748B" }}>MU</span>
                        </div>
                        <div style={{ fontSize: "11px", fontWeight: 800, color: "#15803D" }}>
                          {Number(item.percent || 0).toFixed(1)}%
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* SECTION 4: STATE-WISE GENERATION SOURCE MIX, DRAWAL & UI */}
            <div
              style={{
                background: "#FFFFFF",
                borderRadius: "16px",
                border: "1px solid #E2E8F0",
                padding: "20px",
                boxShadow: "0 2px 6px rgba(0,0,0,0.02)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "14px",
                  borderBottom: "1px solid #F1F5F9",
                  paddingBottom: "10px",
                }}
              >
                <div>
                  <div style={{ fontSize: "16px", fontWeight: 900, color: "#0F172A", display: "flex", alignItems: "center", gap: "8px" }}>
                    <BarChart3 size={18} color="#0057B7" />
                    <span>State Load Details: Source Mix, Drawal Schedule & UI</span>
                  </div>
                  <div style={{ fontSize: "12px", color: "#64748B", marginTop: "2px" }}>
                    Constituent internal generation, interstate drawal schedule, and unscheduled interchange (UI).
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                  gap: "12px",
                }}
              >
                {statesGen.map((s, idx) => {
                  const sName = s.state || "State";
                  const genTot = s.generation_total;
                  const sch = s.drawing_schedule;
                  const uiVal = Number(s.ui || 0);
                  const isUiPositive = uiVal >= 0;

                  return (
                    <div
                      key={idx}
                      style={{
                        background: "#FFFFFF",
                        border: "1px solid #CBD5E1",
                        borderRadius: "14px",
                        padding: "14px",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          marginBottom: "6px",
                        }}
                      >
                        <span style={{ fontSize: "14px", fontWeight: 900, color: "#0F172A" }}>
                          {sName}
                        </span>
                        <span style={{ fontSize: "13px", fontWeight: 900, color: "#15803D" }}>
                          Gen: {formatNum(genTot, 2)} MU
                        </span>
                      </div>

                      <div style={{ fontSize: "11px", color: "#475569", marginBottom: "10px" }}>
                        {["thermal", "hydro", "wind", "solar", "small_hydro", "others"]
                          .filter((k) => Number(s[k] || 0) > 0)
                          .map((k) => (
                            <span
                              key={k}
                              style={{
                                color: SOURCE_COLORS[k] || "#64748B",
                                fontWeight: 700,
                                marginRight: "6px",
                              }}
                            >
                              {k.replace("_", " ").toUpperCase()}: {Number(s[k]).toFixed(1)}
                            </span>
                          ))}
                      </div>

                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          paddingTop: "8px",
                          borderTop: "1px dotted #E2E8F0",
                          fontSize: "12px",
                        }}
                      >
                        <span style={{ background: "#F1F5F9", color: "#334155", fontWeight: 700, padding: "3px 8px", borderRadius: "6px" }}>
                          Schedule: <b>{formatNum(sch, 2)} MU</b>
                        </span>
                        <span
                          style={{
                            background: isUiPositive ? "#DCFCE7" : "#FEE2E2",
                            color: isUiPositive ? "#15803D" : "#DC2626",
                            fontWeight: 800,
                            padding: "3px 8px",
                            borderRadius: "6px",
                          }}
                        >
                          UI / Dev: <b>{formatNum(uiVal, 2)} MU</b>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* SECTION 5: YESTERDAY VS ALL-TIME HIGHEST RECORD COMPARISON */}
            <div
              style={{
                background: "#FFFFFF",
                borderRadius: "16px",
                border: "1px solid #E2E8F0",
                padding: "20px",
                boxShadow: "0 2px 6px rgba(0,0,0,0.02)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "14px",
                  borderBottom: "1px solid #F1F5F9",
                  paddingBottom: "10px",
                }}
              >
                <div>
                  <div style={{ fontSize: "16px", fontWeight: 900, color: "#0F172A", display: "flex", alignItems: "center", gap: "8px" }}>
                    <TrendingUp size={18} color="#0057B7" />
                    <span>Yesterday vs All-Time Highest Record (Same-Line Progress Bar)</span>
                  </div>
                  <div style={{ fontSize: "12px", color: "#64748B", marginTop: "2px" }}>
                    Progress fill visualizes operational day figures plotted against the 100% all-time high record.
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
                  gap: "14px",
                }}
              >
                {powerPos.map((r, idx) => {
                  const cName = r.constituent || "Constituent";
                  const dailyD = Number(r.daily_demand || 0);
                  const highD = Number(r.all_time_demand || 0);
                  const pctD = highD > 0 ? Math.min(100, (dailyD / highD) * 100) : 0;

                  const dailyE = Number(r.daily_energy || 0);
                  const highE = Number(r.all_time_energy || 0);
                  const pctE = highE > 0 ? Math.min(100, (dailyE / highE) * 100) : 0;

                  return (
                    <div
                      key={idx}
                      style={{
                        background: "#FFFFFF",
                        border: "1px solid #CBD5E1",
                        borderRadius: "14px",
                        padding: "14px",
                      }}
                    >
                      <div style={{ fontSize: "14px", fontWeight: 900, color: "#0F172A", marginBottom: "10px" }}>
                        {cName}
                      </div>

                      {/* Demand */}
                      <div style={{ marginBottom: "12px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11.5px", marginBottom: "4px" }}>
                          <span style={{ fontWeight: 700, color: "#0369A1" }}>Peak Demand (MW)</span>
                          <span style={{ fontWeight: 800, color: "#0F172A" }}>
                            {formatNum(dailyD, 0)} / {formatNum(highD, 0)} MW{" "}
                            <span style={{ color: "#0284C7", fontWeight: 900 }}>({pctD.toFixed(1)}%)</span>
                          </span>
                        </div>
                        <div style={{ width: "100%", height: "12px", background: "#E2E8F0", borderRadius: "6px", overflow: "hidden" }}>
                          <div
                            style={{
                              width: `${pctD.toFixed(1)}%`,
                              height: "100%",
                              background: "linear-gradient(90deg, #38BDF8 0%, #0284C7 100%)",
                              borderRadius: "6px",
                              transition: "width 0.4s ease",
                            }}
                          />
                        </div>
                      </div>

                      {/* Energy */}
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11.5px", marginBottom: "4px" }}>
                          <span style={{ fontWeight: 700, color: "#15803D" }}>Energy Met (MU)</span>
                          <span style={{ fontWeight: 800, color: "#0F172A" }}>
                            {formatNum(dailyE, 2)} / {formatNum(highE, 2)} MU{" "}
                            <span style={{ color: "#15803D", fontWeight: 900 }}>({pctE.toFixed(1)}%)</span>
                          </span>
                        </div>
                        <div style={{ width: "100%", height: "12px", background: "#E2E8F0", borderRadius: "6px", overflow: "hidden" }}>
                          <div
                            style={{
                              width: `${pctE.toFixed(1)}%`,
                              height: "100%",
                              background: "linear-gradient(90deg, #4ADE80 0%, #16A34A 100%)",
                              borderRadius: "6px",
                              transition: "width 0.4s ease",
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: RAW HTML SOURCE CODE */}
        {activeTab === "code" && (
          <div
            style={{
              background: "#0F172A",
              borderRadius: "16px",
              padding: "20px",
              color: "#F8FAFC",
              fontFamily: "monospace",
              fontSize: "12px",
              overflowX: "auto",
              boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "12px",
                borderBottom: "1px solid #334155",
                paddingBottom: "8px",
              }}
            >
              <span style={{ color: "#94A3B8", fontWeight: 700 }}>
                Raw Mobile-Ready Standalone HTML Document
              </span>
              <button
                onClick={handleCopyHtml}
                style={{
                  background: copied ? "#22C55E" : "#3B82F6",
                  color: "#FFFFFF",
                  border: "none",
                  padding: "5px 12px",
                  borderRadius: "6px",
                  fontWeight: 800,
                  fontSize: "12px",
                  cursor: "pointer",
                }}
              >
                {copied ? "Copied!" : "Copy Code"}
              </button>
            </div>
            <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
              {rawHtml}
            </pre>
          </div>
        )}

        {/* SEND EMAIL DIALOG */}
        {sendDialogOpen && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(15, 23, 42, 0.6)",
              display: "grid",
              placeItems: "center",
              zIndex: 2000,
              padding: "20px",
            }}
          >
            <div
              style={{
                background: "#FFFFFF",
                borderRadius: "20px",
                padding: "24px",
                width: "520px",
                maxWidth: "100%",
                boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
                <div style={{ fontSize: "18px", fontWeight: 900, color: "#0F172A", display: "flex", alignItems: "center", gap: "8px" }}>
                  <Mail size={20} color="#0057B7" />
                  <span>Send Daily Mobile Briefing</span>
                </div>
                <button
                  onClick={() => setSendDialogOpen(false)}
                  style={{
                    background: "none",
                    border: "none",
                    fontSize: "20px",
                    cursor: "pointer",
                    color: "#64748B",
                  }}
                >
                  &times;
                </button>
              </div>

              <div style={{ fontSize: "13px", color: "#64748B", marginBottom: "16px" }}>
                Send the compiled mobile email briefing for <b>{data?.date_formatted || selectedDate}</b>. You can customize the recipient list for this delivery below.
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "18px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 800, color: "#334155", marginBottom: "4px" }}>
                    Primary Recipients (To)
                  </label>
                  <input
                    type="text"
                    value={overrideTo}
                    onChange={(e) => setOverrideTo(e.target.value)}
                    placeholder="officer1@grid-india.in, officer2@grid-india.in"
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: "8px",
                      border: "1px solid #CBD5E1",
                      fontSize: "13px",
                      outline: "none",
                    }}
                  />
                  <div style={{ fontSize: "11px", color: "#64748B", marginTop: "3px" }}>
                    Separate multiple email addresses with commas or semicolons.
                  </div>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 800, color: "#334155", marginBottom: "4px" }}>
                    Copy Recipients (CC) - Optional
                  </label>
                  <input
                    type="text"
                    value={overrideCc}
                    onChange={(e) => setOverrideCc(e.target.value)}
                    placeholder="mgmt@grid-india.in"
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: "8px",
                      border: "1px solid #CBD5E1",
                      fontSize: "13px",
                      outline: "none",
                    }}
                  />
                </div>
              </div>

              {sendResult && (
                <div
                  style={{
                    padding: "10px 14px",
                    borderRadius: "10px",
                    marginBottom: "16px",
                    fontSize: "12.5px",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    background: sendResult.success ? "#DCFCE7" : "#FEE2E2",
                    color: sendResult.success ? "#15803D" : "#B91C1C",
                    border: `1px solid ${sendResult.success ? "#86EFAC" : "#FCA5A5"}`,
                  }}
                >
                  {sendResult.success ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                  <span>{sendResult.message}</span>
                </div>
              )}

              <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  onClick={() => setSendDialogOpen(false)}
                  disabled={sending}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "8px",
                    border: "1px solid #CBD5E1",
                    background: "#FFFFFF",
                    color: "#475569",
                    fontWeight: 700,
                    fontSize: "13px",
                    cursor: "pointer",
                  }}
                >
                  Close
                </button>

                <button
                  onClick={handleSendEmail}
                  disabled={sending}
                  style={{
                    padding: "8px 20px",
                    borderRadius: "8px",
                    border: "none",
                    background: "#0057B7",
                    color: "#FFFFFF",
                    fontWeight: 800,
                    fontSize: "13px",
                    cursor: sending ? "not-allowed" : "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <Send size={14} />
                  {sending ? "Sending Briefing..." : "Send Now"}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </AppShell>
  );
}
