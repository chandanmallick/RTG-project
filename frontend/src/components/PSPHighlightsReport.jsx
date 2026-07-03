import { useEffect, useRef, useState } from "react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

const clone = (value) => JSON.parse(JSON.stringify(value || {}));

const formatReportDate = (dateStr) => {
  if (!dateStr) return "-";
  try {
    const parts = String(dateStr).trim().split("-");
    if (parts.length !== 3) return dateStr;
    const day = Number(parts[2]);
    const dObj = new Date(Number(parts[0]), Number(parts[1]) - 1, day);
    const month = dObj.toLocaleDateString("en-GB", { month: "short" });
    return `${String(day).padStart(2, "0")}-${month}-${dObj.getFullYear()}`;
  } catch (e) {
    return dateStr;
  }
};

const dateLabel = (rawDate) => {
  if (!rawDate) return "";
  return formatReportDate(rawDate);
};

const formatReportDateTime = (value) => {
  const [datePart, ...rest] = String(value || "").split(" ");
  const timePart = rest.join(" ").trim();
  const formattedDate = formatReportDate(datePart);
  return `${formattedDate}${timePart ? ` ${timePart}` : ""}`.trim();
};

const numberText = (value, decimals = null) => {
  const num = Number(value || 0);
  if (decimals !== null) return num.toFixed(decimals);
  return num.toLocaleString();
};

const sumValues = (...values) => values.reduce((sum, value) => sum + Number(value || 0), 0);

const stateTitle = (state) => {
  if (!state) return "-";
  if (state === "DVC") return "DVC";
  return state
    .toLowerCase()
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

const formatPowerSystemValue = (value, format) => {
  if (format === "date") return formatReportDate(value);
  const num = Number(value || 0);
  if (format === "number2") return num.toFixed(2);
  return Math.round(num).toLocaleString();
};

const buildPortfolioLine = (label, state, source, mode, reportDate) => {
  const portfolio = source?.portfolio || {};
  const gen = mode === "current" ? (source?.internal_gen || {}) : portfolio;
  const thermal = sumValues(gen.thermal);
  const hydro = sumValues(gen.hydro);
  const solar = sumValues(gen.solar);
  const biogas = sumValues(gen.biogas);
  const nuclear = sumValues(gen.nuclear);
  const wind = sumValues(gen.wind);
  const splitOwnGen = sumValues(thermal, hydro, solar, biogas, nuclear, wind);
  const ownGen = splitOwnGen || sumValues(portfolio.own_gen, source?.own_gen);
  const isgs = sumValues(portfolio.isgs);
  const gna = sumValues(portfolio.gna);
  const tgna = sumValues(portfolio.tgna);
  const idam = sumValues(portfolio.idam);
  const rtm = sumValues(portfolio.rtm);
  const netDrawl = sumValues(isgs, gna, tgna, idam, rtm);

  return {
    label,
    state,
    maxDemand: source?.max_demand || 0,
    dateTime: mode === "current"
      ? formatReportDateTime(`${reportDate || ""} ${source?.time || ""}`.trim())
      : formatReportDateTime(`${source?.date || ""} ${source?.max_demand_time || source?.time || ""}`.trim()),
    time: mode === "current" ? source?.time : (source?.max_demand_time || source?.time),
    thermal,
    hydro,
    solar,
    biogas,
    nuclear,
    wind,
    ownGen,
    isgs,
    gna,
    tgna,
    idam,
    rtm,
    netDrawl,
    deviation: portfolio.dsm || source?.loadshed || 0,
    actDrawl: mode === "current" ? (source?.max_demand || 0) : (source?.max_demand || 0),
    remarks: ""
  };
};

const inputStyle = {
  width: "100%",
  minWidth: 0,
  border: "1px solid rgba(3, 98, 76, 0.35)",
  backgroundColor: "rgba(255,255,255,0.72)",
  borderRadius: "4px",
  padding: "1px 3px",
  textAlign: "center",
  font: "inherit",
  fontWeight: 900
};

function EditableValue({ editing, value, onChange, formatter = (v) => v || "-" }) {
  if (editing) {
    return (
      <input
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        style={inputStyle}
      />
    );
  }
  return formatter(value);
}

export default function PSPHighlightsReport({
  open,
  onClose,
  reportDate,
  powerPositionData,
  loadsheddingData,
  outageChangeData,
  portfolioData,
  highestRecords,
  powerSystemData
}) {
  const reportRef = useRef(null);
  const summaryPageRef = useRef(null);
  const [reportData, setReportData] = useState({ powerRows: [], loadRows: [], generation: {}, stateSections: [] });
  const [draftData, setDraftData] = useState({ powerRows: [], loadRows: [], generation: {}, stateSections: [] });
  const [editing, setEditing] = useState(false);
  const [exporting, setExporting] = useState(null);
  const [unitModalType, setUnitModalType] = useState(null);

  useEffect(() => {
    if (!open) return;
    const highByState = Object.fromEntries((highestRecords || []).map((row) => [row.state, row]));
    const sections = (portfolioData?.data || [])
      .filter((row) => row.state && row.state !== "ER")
      .map((row) => {
        const high = highByState[row.state] || {};
        const metricRows = (powerSystemData?.rows || []).map((metric) => ({
          key: metric.key,
          label: metric.label,
          value: formatPowerSystemValue(powerSystemData?.values?.[row.state]?.[metric.key], metric.format)
        }));

        return {
          state: row.state,
          title: `${stateTitle(row.state)} State`,
          powerSystemRows: metricRows,
          comparisonRows: [
            buildPortfolioLine("So Far", row.state, high, "peak", reportDate),
            buildPortfolioLine("Yesterday", row.state, row, "current", reportDate)
          ]
        };
      });

    const nextData = {
      powerRows: (powerPositionData || []).map((row) => ({ ...row })),
      loadRows: (loadsheddingData?.rows || []).map((row) => ({ ...row })),
      generation: {
        ...(outageChangeData?.summary || {}),
        restored: (outageChangeData?.restored || []).map((row) => ({ ...row })),
        tripped: (outageChangeData?.tripped || []).map((row) => ({ ...row }))
      },
      stateSections: sections
    };
    setReportData(nextData);
    setDraftData(clone(nextData));
    setEditing(false);
  }, [open, powerPositionData, loadsheddingData, outageChangeData, portfolioData, highestRecords, powerSystemData, reportDate]);

  if (!open) return null;

  const activeData = editing ? draftData : reportData;
  const label = dateLabel(reportDate);

  const setPowerCell = (index, key, value) => {
    setDraftData((prev) => {
      const next = clone(prev);
      next.powerRows[index][key] = value;
      return next;
    });
  };

  const setLoadCell = (index, key, value) => {
    setDraftData((prev) => {
      const next = clone(prev);
      next.loadRows[index][key] = value;
      return next;
    });
  };

  const setGenerationCell = (key, value) => {
    setDraftData((prev) => {
      const next = clone(prev);
      next.generation[key] = value;
      return next;
    });
  };

  const setStateComparisonCell = (sectionIndex, rowIndex, key, value) => {
    setDraftData((prev) => {
      const next = clone(prev);
      next.stateSections[sectionIndex].comparisonRows[rowIndex][key] = value;
      return next;
    });
  };

  const saveEdits = () => {
    setReportData(clone(draftData));
    setEditing(false);
  };

  const cancelEdits = () => {
    setDraftData(clone(reportData));
    setEditing(false);
  };

  const downloadPdf = async () => {
    if (!reportRef.current || editing) return;
    try {
      setExporting("pdf");
      const pages = Array.from(reportRef.current.querySelectorAll(".psp-report-page"));
      const pdf = new jsPDF("landscape", "pt", "a4");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 24;
      for (let index = 0; index < pages.length; index += 1) {
        const canvas = await html2canvas(pages[index], {
          scale: 1.8,
          backgroundColor: "#ffffff",
          useCORS: true
        });
        if (index > 0) pdf.addPage("a4", "landscape");
        const imgWidth = pageWidth - margin * 2;
        const imgHeight = Math.min((canvas.height * imgWidth) / canvas.width, pageHeight - margin * 2);
        pdf.addImage(
          canvas.toDataURL("image/jpeg", 0.9),
          "JPEG",
          margin,
          margin,
          imgWidth,
          imgHeight,
          undefined,
          "MEDIUM"
        );
      }
      pdf.save(`PSP_Highlights_${reportDate || "report"}.pdf`);
    } catch (err) {
      console.error("Error downloading PSP highlights PDF:", err);
      alert("Unable to download PSP highlights PDF.");
    } finally {
      setExporting(null);
    }
  };

  const downloadWord = () => {
    if (!reportRef.current || editing) return;
    try {
      setExporting("word");
      const html = `
        <html>
          <head>
            <meta charset="utf-8" />
            <style>
              body { font-family: Arial, sans-serif; margin: 18px; }
              table { border-collapse: collapse; }
              th, td { border: 1px solid #111; padding: 3px 6px; font-size: 11px; text-align: center; }
            </style>
          </head>
          <body>${reportRef.current.outerHTML}</body>
        </html>
      `;
      const blob = new Blob(["\ufeff", html], { type: "application/msword" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `PSP_Highlights_${reportDate || "report"}.doc`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Error downloading PSP highlights Word:", err);
      alert("Unable to download PSP highlights Word file.");
    } finally {
      setExporting(null);
    }
  };

  return (
    <>
    <div
      className="modal fade show d-block"
      style={{
        backgroundColor: "rgba(2, 39, 38, 0.65)",
        backdropFilter: "blur(4px)",
        zIndex: 1050
      }}
      tabIndex="-1"
    >
      <div className="modal-dialog modal-fullscreen-lg-down modal-xl modal-dialog-centered" style={{ maxWidth: "1180px" }}>
        <div className="modal-content border-0 overflow-hidden" style={{ borderRadius: "18px", backgroundColor: "#F4F7FA" }}>
          <div
            className="modal-header border-0"
            style={{
              background: "linear-gradient(135deg, #022726 0%, #03624C 100%)",
              padding: "14px 18px"
            }}
          >
            <div>
              <h5 className="modal-title fw-bold text-white mb-0">PSP Highlights</h5>
              <p className="small text-white opacity-75 mb-0">
                First page operational summary for {label}
              </p>
            </div>
            <div className="d-flex align-items-center gap-2 flex-wrap justify-content-end">
              {editing ? (
                <>
                  <button type="button" className="btn btn-sm btn-light fw-bold" onClick={cancelEdits} style={{ fontSize: "0.76rem" }}>
                    Cancel
                  </button>
                  <button type="button" className="btn btn-sm fw-bold text-dark" onClick={saveEdits} style={{ backgroundColor: "#00DF81", fontSize: "0.76rem" }}>
                    Save Changes
                  </button>
                </>
              ) : (
                <button type="button" className="btn btn-sm btn-light fw-bold" onClick={() => setEditing(true)} style={{ fontSize: "0.76rem" }}>
                  Edit Values
                </button>
              )}
              <button type="button" className="btn btn-sm btn-light fw-bold" onClick={downloadWord} disabled={!!exporting || editing} style={{ fontSize: "0.76rem" }}>
                {exporting === "word" ? "Preparing..." : "Word Download"}
              </button>
              <button type="button" className="btn btn-sm fw-bold text-dark" onClick={downloadPdf} disabled={!!exporting || editing} style={{ backgroundColor: "#00DF81", fontSize: "0.76rem" }}>
                {exporting === "pdf" ? "Preparing..." : "PDF Download"}
              </button>
              <button type="button" className="btn-close btn-close-white ms-1" onClick={onClose} aria-label="Close" />
            </div>
          </div>
          {editing && (
            <div className="px-3 py-2 text-dark fw-semibold" style={{ backgroundColor: "#FFF7D6", fontSize: "0.78rem" }}>
              Edit mode is frontend-only. Click Save Changes before downloading PDF or Word.
            </div>
          )}
          <div className="modal-body" style={{ overflow: "auto", padding: "18px", background: "linear-gradient(180deg, #EAF0F4 0%, #F7FAFC 100%)" }}>
            <div ref={reportRef} style={{ color: "#000", fontFamily: "Arial, sans-serif" }}>
              <style>{`
                .psp-highlight-report table tbody tr:hover td {
                  filter: brightness(0.97);
                  outline: 1px solid rgba(3, 98, 76, 0.18);
                  outline-offset: -1px;
                }
                .psp-report-page {
                  width: 1123px;
                  min-height: 794px;
                  background: #fff;
                  padding: 22px 24px;
                  margin: 0 auto 18px auto;
                  border: 1px solid #D8E0E5;
                  border-radius: 14px;
                  box-shadow: 0 16px 36px rgba(15, 23, 42, 0.12);
                  overflow: hidden;
                  page-break-after: always;
                }
                .psp-report-page::before {
                  content: "";
                  display: block;
                  height: 4px;
                  margin: -22px -24px 16px -24px;
                  background: linear-gradient(90deg, #022726, #03624C, #00DF81);
                }
              `}</style>
              <div ref={summaryPageRef} className="psp-highlight-report psp-report-page">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px", borderBottom: "2px solid #03624C", paddingBottom: "8px" }}>
                <div>
                  <div style={{ fontSize: "18px", fontWeight: 900, color: "#022726", lineHeight: 1.1 }}>
                    PSP Operational Highlights
                  </div>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: "#475569", marginTop: "2px" }}>
                    Eastern Region power position, load shedding and generation changes
                  </div>
                </div>
                <div style={{ backgroundColor: "#E6F7EF", border: "1px solid #78C7A4", color: "#03543F", padding: "6px 10px", borderRadius: "6px", fontSize: "12px", fontWeight: 900 }}>
                  {label}
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "flex-start", gap: "24px" }}>
                <table style={{ borderCollapse: "collapse", width: "780px", tableLayout: "fixed", fontSize: "10.5px", fontWeight: 800 }}>
                  <thead>
                    <tr>
                      <th colSpan="9" style={{ background: "linear-gradient(135deg, #022726 0%, #03624C 100%)", color: "#fff", border: "1px solid #111", padding: "5px", fontSize: "12px" }}>
                        ER Power Position: {label}
                      </th>
                    </tr>
                    <tr style={{ color: "#fff" }}>
                      <th rowSpan="2" style={{ backgroundColor: "#6B1D5F", border: "1px solid #111", width: "110px", padding: "4px" }}>
                        Constituents
                      </th>
                      <th colSpan="3" style={{ backgroundColor: "#1F7A8C", border: "1px solid #111", padding: "4px" }}>
                        Daily Power Position
                      </th>
                      <th colSpan="5" style={{ backgroundColor: "#D97706", border: "1px solid #111", padding: "4px" }}>
                        All Time High
                      </th>
                    </tr>
                    <tr style={{ color: "#fff" }}>
                      {["Max Demand", "Time", "MU/Day"].map((heading) => (
                        <th key={heading} style={{ backgroundColor: "#1F7A8C", border: "1px solid #111", padding: "4px 3px", lineHeight: 1.15 }}>
                          {heading}
                        </th>
                      ))}
                      {["Demand Met", "Demand Date", "Demand Time", "MU/Day", "Energy Date"].map((heading) => (
                        <th key={heading} style={{ backgroundColor: "#D97706", border: "1px solid #111", padding: "4px 3px", lineHeight: 1.15 }}>
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {activeData.powerRows.map((row, index) => (
                      <tr key={`highlight-${row.constituent}`}>
                        <td style={{ backgroundColor: "#6B1D5F", color: "#fff", border: "1px solid #111", padding: "3px", textAlign: "center" }}>
                          {row.constituent === "WEST BENGAL" ? "W. Bengal" : row.constituent}
                        </td>
                        <td style={{ backgroundColor: "#FFFF00", border: "1px solid #111", padding: "3px", textAlign: "center" }}>
                          <EditableValue editing={editing} value={row.daily_demand} onChange={(value) => setPowerCell(index, "daily_demand", value)} formatter={(value) => numberText(value)} />
                        </td>
                        <td style={{ backgroundColor: "#FFFF00", border: "1px solid #111", padding: "3px", textAlign: "center" }}>
                          <EditableValue editing={editing} value={row.daily_demand_time} onChange={(value) => setPowerCell(index, "daily_demand_time", value)} />
                        </td>
                        <td style={{ backgroundColor: "#FFFF00", border: "1px solid #111", padding: "3px", textAlign: "center" }}>
                          <EditableValue editing={editing} value={row.daily_energy} onChange={(value) => setPowerCell(index, "daily_energy", value)} formatter={(value) => numberText(value, 2)} />
                        </td>
                        <td style={{ backgroundColor: "#C9FFFF", border: "1px solid #111", padding: "3px", textAlign: "center" }}>
                          <EditableValue editing={editing} value={row.all_time_demand} onChange={(value) => setPowerCell(index, "all_time_demand", value)} formatter={(value) => numberText(value)} />
                        </td>
                        <td style={{ backgroundColor: "#C9FFFF", border: "1px solid #111", padding: "3px", textAlign: "center" }}>
                          <EditableValue editing={editing} value={row.all_time_demand_date} onChange={(value) => setPowerCell(index, "all_time_demand_date", value)} formatter={formatReportDate} />
                        </td>
                        <td style={{ backgroundColor: "#C9FFFF", border: "1px solid #111", padding: "3px", textAlign: "center" }}>
                          <EditableValue editing={editing} value={row.all_time_demand_time} onChange={(value) => setPowerCell(index, "all_time_demand_time", value)} />
                        </td>
                        <td style={{ backgroundColor: "#C9FFFF", border: "1px solid #111", padding: "3px", textAlign: "center" }}>
                          <EditableValue editing={editing} value={row.all_time_energy} onChange={(value) => setPowerCell(index, "all_time_energy", value)} formatter={(value) => numberText(value, 2)} />
                        </td>
                        <td style={{ backgroundColor: "#C9FFFF", border: "1px solid #111", padding: "3px", textAlign: "center" }}>
                          <EditableValue editing={editing} value={row.all_time_energy_date} onChange={(value) => setPowerCell(index, "all_time_energy_date", value)} formatter={formatReportDate} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ flex: 1, minHeight: "18px", backgroundColor: "#FFFF00", borderTop: "1px solid #FFFF00", marginTop: "1px" }} />
              </div>

              <div style={{ display: "flex", alignItems: "flex-start", gap: "42px", marginTop: "28px" }}>
                <table style={{ borderCollapse: "collapse", width: "370px", tableLayout: "fixed", fontSize: "11px", fontWeight: 900 }}>
                  <thead>
                    <tr style={{ color: "#fff" }}>
                      <th style={{ backgroundColor: "#B0002B", border: "1px solid #111", padding: "7px", width: "52%" }}>Constituents</th>
                      <th style={{ backgroundColor: "#B0002B", border: "1px solid #111", padding: "7px" }}>Max. Load shedding</th>
                      <th style={{ backgroundColor: "#B0002B", border: "1px solid #111", padding: "7px" }}>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeData.loadRows.map((row, index) => (
                      <tr key={`highlight-load-${row.state}`}>
                        <td style={{ backgroundColor: "#B0002B", color: "#fff", border: "1px solid #111", padding: "4px", textAlign: "center" }}>
                          {row.state}
                        </td>
                        <td style={{ backgroundColor: "#F8B4B4", border: "1px solid #111", padding: "4px", textAlign: "center" }}>
                          <EditableValue editing={editing} value={row.max_load_shedding} onChange={(value) => setLoadCell(index, "max_load_shedding", value)} formatter={(value) => numberText(value)} />
                        </td>
                        <td style={{ backgroundColor: "#F8B4B4", border: "1px solid #111", padding: "4px", textAlign: "center" }}>
                          <EditableValue editing={editing} value={row.time || "N/A"} onChange={(value) => setLoadCell(index, "time", value)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <table style={{ borderCollapse: "collapse", width: "250px", tableLayout: "fixed", fontSize: "10px", fontWeight: 900 }}>
                  <thead>
                    <tr>
                      <th colSpan="3" style={{ backgroundColor: "#92D050", border: "1px solid #111", padding: "7px", textAlign: "center", fontSize: "12px" }}>
                        Net generation changes during the day(+/-)
                      </th>
                    </tr>
                    <tr>
                      <th style={{ backgroundColor: "#9DC3E6", border: "1px solid #111", padding: "5px" }}>Units brought on Bar (MW) (+ve)</th>
                      <th style={{ backgroundColor: "#9DC3E6", border: "1px solid #111", padding: "5px" }}>Units went out of Bar (MW) (-ve)</th>
                      <th style={{ backgroundColor: "#9DC3E6", border: "1px solid #111", padding: "5px" }}>Net generation changes</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ backgroundColor: "#FFFF00", border: "1px solid #111", padding: "4px", textAlign: "center" }}>
                        {editing ? (
                          <EditableValue editing={editing} value={activeData.generation.restored_mw} onChange={(value) => setGenerationCell("restored_mw", value)} formatter={(value) => numberText(value)} />
                        ) : (
                          <button
                            type="button"
                            onClick={() => setUnitModalType("restored")}
                            style={{ border: 0, background: "transparent", padding: 0, font: "inherit", fontWeight: 900, color: "#022726", textDecoration: "underline", cursor: "pointer" }}
                            title="View restored unit details"
                          >
                            {numberText(activeData.generation.restored_mw)}
                          </button>
                        )}
                      </td>
                      <td style={{ backgroundColor: "#FFFF00", border: "1px solid #111", padding: "4px", textAlign: "center" }}>
                        {editing ? (
                          <>-<EditableValue editing={editing} value={activeData.generation.tripped_mw} onChange={(value) => setGenerationCell("tripped_mw", value)} formatter={(value) => numberText(value)} /></>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setUnitModalType("tripped")}
                            style={{ border: 0, background: "transparent", padding: 0, font: "inherit", fontWeight: 900, color: "#B91C1C", textDecoration: "underline", cursor: "pointer" }}
                            title="View tripped unit details"
                          >
                            -{numberText(activeData.generation.tripped_mw)}
                          </button>
                        )}
                      </td>
                      <td style={{ backgroundColor: "#FFFF00", border: "1px solid #111", padding: "4px", textAlign: "center" }}>
                        <EditableValue editing={editing} value={activeData.generation.net_mw} onChange={(value) => setGenerationCell("net_mw", value)} formatter={(value) => numberText(value)} />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              </div>

              <div style={{ marginTop: 0 }}>
                {activeData.stateSections.map((section, sectionIndex) => {
                  const maxBar = Math.max(
                    ...section.comparisonRows.map((row) => Number(row.maxDemand || 0)),
                    1
                  );
                  const colors = {
                    ownGen: "#16A34A",
                    thermal: "#9CA3AF",
                    hydro: "#2563EB",
                    solar: "#FACC15",
                    biogas: "#16A34A",
                    nuclear: "#DB2777",
                    isgs: "#F97316",
                    gna: "#7C3AED",
                    tgna: "#06B6D4",
                    idam: "#EC4899",
                    rtm: "#FACC15",
                    deviation: "#64748B"
                  };
                  const legendItems = [
                    { key: "ownGen", label: "Own Gen", color: colors.ownGen },
                    { key: "isgs", label: "ISGS", color: colors.isgs },
                    { key: "gna", label: "GNA", color: colors.gna },
                    { key: "tgna", label: "T-GNA", color: colors.tgna },
                    { key: "idam", label: "iDAM", color: colors.idam },
                    { key: "rtm", label: "RTM", color: colors.rtm },
                    { key: "deviation", label: "Deviation", color: colors.deviation }
                  ];

                  return (
                    <div key={section.state} className="psp-highlight-report psp-report-page">
                      <div style={{ fontSize: "16px", fontWeight: 900, color: "#022726", marginBottom: "10px", borderBottom: "2px solid #03624C", paddingBottom: "6px" }}>
                        {section.title} PSP Highlights
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: "22px", alignItems: "start" }}>
                        <div>
                          <div style={{ backgroundColor: "#E3F1D5", border: "1px solid #C9DFC0", padding: "8px", fontSize: "12px", fontWeight: 900, color: "#022726" }}>
                            Power System Data: {reportDate}
                          </div>
                          <table style={{ borderCollapse: "collapse", width: "100%", tableLayout: "fixed", fontSize: "10px", fontWeight: 800 }}>
                            <thead>
                              <tr>
                                <th style={{ backgroundColor: "#E3F1D5", border: "1px solid #D8E0E5", padding: "4px", textAlign: "left" }}>
                                  Power system Data
                                </th>
                                <th style={{ backgroundColor: "#E3F1D5", border: "1px solid #D8E0E5", padding: "4px" }}>
                                  {stateTitle(section.state)}
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {section.powerSystemRows.map((row) => (
                                <tr key={row.key}>
                                  <td style={{ border: "1px solid #D8E0E5", padding: "4px", textAlign: "left", backgroundColor: "#F8FAFC" }}>
                                    {row.label}
                                  </td>
                                  <td style={{ border: "1px solid #D8E0E5", padding: "4px", textAlign: "center", fontWeight: 900 }}>
                                    {row.value}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        <div>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: "10px" }}>
                            <div>
                              <div style={{ fontSize: "14px", fontWeight: 900, color: "#022726" }}>
                                Power Portfolio & Peak Demand Breakdown
                              </div>
                              <div style={{ fontSize: "10px", color: "#475569", fontWeight: 700 }}>
                                Yesterday vs all time high portfolio at peak time
                              </div>
                            </div>
                            <div style={{ border: "1px solid #AACBC4", borderRadius: "6px", padding: "5px 9px", fontSize: "10px", color: "#03624C", fontWeight: 900 }}>
                              Current Operational Day
                            </div>
                          </div>

                          <div style={{ border: "1px solid #E2E8F0", borderRadius: "6px", padding: "8px", marginBottom: "8px" }}>
                            <div style={{ fontSize: "10px", color: "#334155", fontWeight: 900, marginBottom: "8px" }}>
                              Regional peak demand met comparison
                            </div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 10px", marginBottom: "10px" }}>
                              {legendItems.map((item) => (
                                <div key={item.key} style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "9px", color: "#334155", fontWeight: 800 }}>
                                  <span style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: item.color, display: "inline-block" }} />
                                  {item.label}
                                </div>
                              ))}
                            </div>
                            {section.comparisonRows.map((row) => {
                              const segmentTotal = legendItems.reduce((sum, item) => sum + Math.abs(Number(row[item.key] || 0)), 0) || 1;
                              const barScale = Math.max(4, Number(row.maxDemand || 0) / maxBar * 100);
                              const internalBreakup = [
                                { label: "Thermal Gen", key: "thermal", color: colors.thermal },
                                { label: "Hydro Gen", key: "hydro", color: colors.hydro },
                                { label: "Solar Gen", key: "solar", color: colors.solar },
                                { label: "BioGas Gen", key: "biogas", color: colors.biogas },
                                { label: "Nuclear Gen", key: "nuclear", color: colors.nuclear }
                              ];
                              const portfolioBreakup = [
                                { label: "ISGS Drawl", key: "isgs", color: colors.isgs },
                                { label: "GNA Schedule", key: "gna", color: colors.gna },
                                { label: "TGNA Schedule", key: "tgna", color: colors.tgna },
                                { label: "iDAM Schedule", key: "idam", color: colors.idam },
                                { label: "RTM Drawl", key: "rtm", color: colors.rtm },
                                { label: "DSM (Deviation)", key: "deviation", color: colors.deviation }
                              ];
                              return (
                                <div key={`${section.state}-${row.label}-bar`} style={{ marginBottom: "12px" }}>
                                  <div style={{ display: "grid", gridTemplateColumns: "70px 1fr 72px", gap: "8px", alignItems: "center", marginBottom: "6px" }}>
                                    <div style={{ fontSize: "10px", color: "#475569", fontWeight: 900 }}>{row.label}</div>
                                    <div style={{ height: "17px", backgroundColor: "#EEF2F7", borderRadius: "8px", overflow: "hidden" }}>
                                      <div style={{ display: "flex", height: "100%", width: `${barScale}%` }}>
                                        {legendItems.map((item) => {
                                          const value = Math.abs(Number(row[item.key] || 0));
                                          if (value === 0) return null;
                                          return (
                                            <div
                                              key={item.key}
                                              title={`${item.label}: ${numberText(value)} MW`}
                                              style={{
                                                width: `${Math.max(3, (value / segmentTotal) * 100)}%`,
                                                backgroundColor: item.color,
                                                borderRight: "1px solid rgba(255,255,255,0.65)"
                                              }}
                                            />
                                          );
                                        })}
                                      </div>
                                    </div>
                                    <div style={{ fontSize: "10px", fontWeight: 900, color: "#03624C", textAlign: "right" }}>
                                      {numberText(row.maxDemand)} MW
                                    </div>
                                  </div>
                                  <div style={{ border: "1px solid #E2E8F0", borderRadius: "8px", padding: "7px", backgroundColor: "#FFFFFF", boxShadow: "0 6px 14px rgba(15,23,42,0.06)" }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                                      <div style={{ fontSize: "11px", fontWeight: 900, color: "#022726" }}>{section.state}</div>
                                      <div style={{ fontSize: "10px", color: "#475569" }}>{row.time || "-"}</div>
                                    </div>
                                    <div style={{ fontSize: "9px", color: "#64748B", fontWeight: 900, textTransform: "uppercase", marginBottom: "2px" }}>
                                      Peak Demand Met
                                    </div>
                                    <div style={{ fontSize: "16px", lineHeight: 1.1, color: "#059669", fontWeight: 900, marginBottom: "8px" }}>
                                      {numberText(row.maxDemand)} MW
                                    </div>
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                                      <div>
                                        <div style={{ fontSize: "9px", color: "#64748B", fontWeight: 900, textTransform: "uppercase", marginBottom: "3px", borderBottom: "1px solid #E5E7EB" }}>
                                          Internal Generation
                                        </div>
                                        {internalBreakup.map((item) => (
                                          <div key={item.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", fontSize: "9.5px", marginBottom: "2px" }}>
                                            <span style={{ display: "flex", alignItems: "center", gap: "4px", color: "#334155" }}>
                                              <span style={{ width: "7px", height: "7px", borderRadius: "50%", backgroundColor: item.color, display: "inline-block" }} />
                                              {item.label}:
                                            </span>
                                            <span style={{ fontWeight: 900 }}>{numberText(row[item.key], item.key === "solar" ? 1 : null)} MW</span>
                                          </div>
                                        ))}
                                      </div>
                                      <div>
                                        <div style={{ fontSize: "9px", color: "#64748B", fontWeight: 900, textTransform: "uppercase", marginBottom: "3px", borderBottom: "1px solid #E5E7EB" }}>
                                          Portfolio & Deviation
                                        </div>
                                        {portfolioBreakup.map((item) => (
                                          <div key={item.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", fontSize: "9.5px", marginBottom: "2px" }}>
                                            <span style={{ display: "flex", alignItems: "center", gap: "4px", color: "#334155" }}>
                                              <span style={{ width: "7px", height: "7px", borderRadius: "50%", backgroundColor: item.color, display: "inline-block" }} />
                                              {item.label}:
                                            </span>
                                            <span style={{ fontWeight: 900, color: item.key === "deviation" && Number(row[item.key] || 0) < 0 ? "#DC2626" : "#111827" }}>
                                              {numberText(row[item.key], item.key === "deviation" ? 1 : null)} MW
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      <div style={{ textAlign: "center", color: "#F97316", fontWeight: 900, fontSize: "13px", margin: "8px 0" }}>
                        {section.title}
                      </div>
                      <table style={{ borderCollapse: "collapse", width: "100%", tableLayout: "fixed", fontSize: "9px", fontWeight: 900 }}>
                        <thead>
                          <tr>
                            <th style={{ border: "1px solid #111", padding: "4px", width: "15%" }} />
                            <th style={{ backgroundColor: "#9DC3E6", border: "1px solid #111", padding: "4px" }}>Max Demand Met</th>
                            <th style={{ backgroundColor: "#F4B6B6", border: "1px solid #111", padding: "4px" }}>Date time</th>
                            <th style={{ backgroundColor: "#FFFF00", border: "1px solid #111", padding: "4px" }}>Own Gen</th>
                            <th style={{ backgroundColor: "#00D7A7", border: "1px solid #111", padding: "4px" }}>ISGS Schedule</th>
                            <th style={{ backgroundColor: "#00D7A7", border: "1px solid #111", padding: "4px" }}>GNA (inc. REMC) Schedule</th>
                            <th style={{ backgroundColor: "#00D7A7", border: "1px solid #111", padding: "4px" }}>T-GNA (inc. REMC) Schedule</th>
                            <th style={{ backgroundColor: "#00D7A7", border: "1px solid #111", padding: "4px" }}>iDAM Schedule</th>
                            <th style={{ backgroundColor: "#00D7A7", border: "1px solid #111", padding: "4px" }}>RTM Schedule</th>
                            <th style={{ backgroundColor: "#00D7A7", border: "1px solid #111", padding: "4px" }}>Net Drawl Schedule</th>
                            <th style={{ backgroundColor: "#FFFF00", border: "1px solid #111", padding: "4px" }}>Deviation</th>
                            <th style={{ border: "1px solid #111", padding: "4px" }}>Act Drawl</th>
                            <th style={{ border: "1px solid #111", padding: "4px" }}>Remarks</th>
                          </tr>
                        </thead>
                        <tbody>
                          {section.comparisonRows.map((row, rowIndex) => (
                            <tr key={`${section.state}-${row.label}`}>
                              <td style={{ border: "1px solid #111", padding: "3px", textAlign: "center" }}>{row.label}</td>
                              {[
                                ["maxDemand", (value) => numberText(value)],
                                ["dateTime", (value) => value || "-"],
                                ["ownGen", (value) => numberText(value)],
                                ["isgs", (value) => numberText(value)],
                                ["gna", (value) => numberText(value)],
                                ["tgna", (value) => numberText(value)],
                                ["idam", (value) => numberText(value)],
                                ["rtm", (value) => numberText(value)],
                                ["netDrawl", (value) => numberText(value)],
                                ["deviation", (value) => numberText(value)],
                                ["actDrawl", (value) => numberText(value)],
                                ["remarks", (value) => value || ""]
                              ].map(([key, formatter]) => (
                                <td key={key} style={{ border: "1px solid #111", padding: "3px", textAlign: "center" }}>
                                  <EditableValue
                                    editing={editing}
                                    value={row[key]}
                                    onChange={(value) => setStateComparisonCell(sectionIndex, rowIndex, key, value)}
                                    formatter={formatter}
                                  />
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })}
              </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {unitModalType && (
        <div
          className="modal fade show d-block"
          style={{
            backgroundColor: "rgba(15, 23, 42, 0.55)",
            backdropFilter: "blur(3px)",
            zIndex: 1060
          }}
          tabIndex="-1"
        >
          <div className="modal-dialog modal-xl modal-dialog-centered">
            <div className="modal-content border-0 shadow-lg" style={{ borderRadius: "16px", overflow: "hidden" }}>
              <div
                className="modal-header border-0"
                style={{ background: unitModalType === "restored" ? "#065F46" : "#991B1B", color: "#fff" }}
              >
                <div>
                  <h5 className="modal-title fw-bold mb-0">
                    {unitModalType === "restored" ? "Units Brought on Bar" : "Units Went out of Bar"}
                  </h5>
                  <p className="small mb-0 opacity-75">Generation outage change unit details for {label}</p>
                </div>
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  onClick={() => setUnitModalType(null)}
                  aria-label="Close"
                />
              </div>
              <div className="modal-body p-0">
                {(() => {
                  const rows = activeData.generation?.[unitModalType] || [];
                  if (!rows.length) {
                    return (
                      <div className="text-center text-muted py-5">
                        <p className="mb-0 fw-semibold">No units in this list.</p>
                      </div>
                    );
                  }
                  return (
                    <div className="table-responsive" style={{ maxHeight: "520px", overflowY: "auto" }}>
                      <table className="table table-hover align-middle mb-0" style={{ fontSize: "0.78rem" }}>
                        <thead style={{ position: "sticky", top: 0, zIndex: 2 }}>
                          <tr>
                            {[
                              "Unit",
                              "Unit No.",
                              "MW",
                              "Location",
                              "Owner",
                              "Fuel",
                              "Outage Type",
                              "Outage",
                              "Restoration",
                              "Tentative Restoration",
                              "Reason"
                            ].map((heading) => (
                              <th
                                key={heading}
                                className={heading === "Unit" || heading === "Reason" ? "text-start" : "text-center"}
                                style={{ backgroundColor: "#E3F1D5", color: "#022726", whiteSpace: "nowrap" }}
                              >
                                {heading}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((row, index) => (
                            <tr key={row.id || `${row.element_name}-${index}`}>
                              <td className="text-start fw-bold text-dark">{row.element_name || "-"}</td>
                              <td className="text-center">{row.unit_number ?? "-"}</td>
                              <td className="text-end fw-bold">{Number(row.installed_capacity || 0).toLocaleString()}</td>
                              <td className="text-center">{row.location || "-"}</td>
                              <td className="text-center">{row.owner_name || "-"}</td>
                              <td className="text-center">{row.fuel || "-"}</td>
                              <td className="text-center">{row.outage_type || "-"}</td>
                              <td className="text-center">{row.outage_date ? `${row.outage_date} ${row.outage_time || ""}` : "-"}</td>
                              <td className="text-center">{row.revival_date ? `${row.revival_date} ${row.revival_time || ""}` : "-"}</td>
                              <td className="text-center">{row.expected_revival_date ? `${row.expected_revival_date} ${row.expected_revival_time || ""}` : "-"}</td>
                              <td className="text-start text-secondary">{row.reason || "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
              </div>
              <div className="modal-footer border-0">
                <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setUnitModalType(null)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
