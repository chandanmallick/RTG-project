import { useMemo, useRef, useState } from "react";
import html2canvas from "html2canvas";
import { ArrowRightLeft, Download, FileSpreadsheet, Info, ListChecks, RefreshCw, X } from "lucide-react";
import API from "../services/api";

const COLORS = {
  ER: "#0891B2",
  NR: "#14B8A6",
  WR: "#F97316",
  SR: "#DC2626",
  NER: "#FACC15",
  NEPAL: "#38BDF8",
  BHUTAN: "#9CA3AF",
  BANGLADESH: "#3B63C7",
};

const POS = {
  ER: { x: 430, y: 292, w: 146, h: 112 },
  NR: { x: 148, y: 80, w: 184, h: 154, labelX: 248, labelY: 148 },
  WR: { x: 78, y: 298, w: 204, h: 154, labelX: 158, labelY: 378 },
  SR: { x: 418, y: 558, w: 170, h: 132, labelX: 506, labelY: 654 },
  NEPAL: { x: 416, y: 38, w: 206, h: 112, labelX: 522, labelY: 90 },
  BHUTAN: { x: 728, y: 110, w: 138, h: 84, labelX: 794, labelY: 132 },
  NER: { x: 764, y: 316, w: 164, h: 116, labelX: 858, labelY: 368 },
  BANGLADESH: { x: 706, y: 520, w: 138, h: 146, labelX: 790, labelY: 540 },
};

const labelMap = {
  NR: "NR",
  WR: "WR",
  SR: "SR",
  NER: "NER",
  NEPAL: "NEPAL",
  BHUTAN: "BHUTAN",
  BANGLADESH: "BANGLADESH",
};

const IMAGE_MAP = {
  ER: "/geodata/exchange/ER.png",
  NR: "/geodata/exchange/NR.png",
  WR: "/geodata/exchange/WR.png",
  SR: "/geodata/exchange/SR.png",
  NER: "/geodata/exchange/NER.png",
  NEPAL: "/geodata/exchange/Nepal.png",
  BHUTAN: "/geodata/exchange/Bhutan.png",
  BANGLADESH: "/geodata/exchange/Bangladesh.png",
};

const fmt = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return "-";
  return num.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 0 });
};

const flowDirection = (value) => (Number(value) >= 0 ? "Export by ER" : "Import by ER");
const flowTone = (value) => (Number(value) >= 0 ? "#047857" : "#DC2626");
const todayIso = () => new Date().toISOString().slice(0, 10);
const addDays = (dateStr, days) => {
  const dt = new Date(`${dateStr}T00:00:00`);
  dt.setDate(dt.getDate() + days);
  return dt.toISOString().slice(0, 10);
};

const FlowText = ({ x, y, schedule, actual, color }) => (
  <g filter="url(#calloutShadow)">
    <rect x={x - 82} y={y - 27} width="164" height="78" rx="12" fill="#FFFFFF" stroke={`${color}45`} strokeWidth="2" />
    <rect x={x - 82} y={y - 27} width="164" height="12" rx="6" fill={color} />
    <line x1={x} y1={y - 4} x2={x} y2={y + 36} stroke="#E2E8F0" strokeWidth="2" />
    <text x={x - 42} y={y} textAnchor="middle" fill="#64748B" fontSize="11" fontWeight="900">SCH</text>
    <text x={x + 42} y={y} textAnchor="middle" fill="#64748B" fontSize="11" fontWeight="900">ACT</text>
    <text x={x - 42} y={y + 25} textAnchor="middle" fill="#0F172A" fontSize="19" fontWeight="900">{fmt(schedule)}</text>
    <text x={x + 42} y={y + 25} textAnchor="middle" fill={color} fontSize="19" fontWeight="900">{fmt(actual)}</text>
    <rect x={x - 34} y={y + 36} width="68" height="19" rx="10" fill={`${flowTone(actual)}18`} />
    <text x={x} y={y + 50} textAnchor="middle" fill={flowTone(actual)} fontSize="10" fontWeight="900">
      {Number(actual) >= 0 ? "EXPORT" : "IMPORT"}
    </text>
  </g>
);

const RegionImage = ({ code, active }) => {
  const pos = POS[code];
  const color = COLORS[code] || "#64748B";
  const label = labelMap[code] || code;
  const labelWidth = code === "BANGLADESH" ? 154 : code === "BHUTAN" ? 94 : code === "NEPAL" ? 96 : 78;
  return (
    <g opacity={active ? 1 : 0.72}>
      <image
        href={IMAGE_MAP[code]}
        x={pos.x}
        y={pos.y}
        width={pos.w}
        height={pos.h}
        preserveAspectRatio="xMidYMid meet"
        filter="url(#exchangeShadow)"
      />
      <rect x={pos.labelX - labelWidth / 2} y={pos.labelY - 21} width={labelWidth} height="42" rx="3" fill={color} />
      <text x={pos.labelX} y={pos.labelY + 8} textAnchor="middle" fill="#FFFFFF" fontSize={code === "BANGLADESH" ? "20" : "22"} fontWeight="900">
        {label}
      </text>
    </g>
  );
};

const ERHub = () => {
  const pos = POS.ER;
  return (
    <g>
      <image
        href={IMAGE_MAP.ER}
        x={pos.x - 18}
        y={pos.y - 20}
        width={pos.w + 36}
        height={pos.h + 36}
        preserveAspectRatio="xMidYMid meet"
        filter="url(#exchangeShadow)"
      />
      <rect x={pos.x + 32} y={pos.y + 40} width="74" height="44" rx="3" fill={COLORS.ER} />
      <text x={pos.x + 69} y={pos.y + 70} textAnchor="middle" fill="#FFFFFF" fontSize="26" fontWeight="900">
        ER
      </text>
    </g>
  );
};

export default function PowerExchangeGraphic({ data, loading }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [rangeOpen, setRangeOpen] = useState(false);
  const [rangeLoading, setRangeLoading] = useState(false);
  const [rangeError, setRangeError] = useState("");
  const [rangeData, setRangeData] = useState(null);
  const [rangeStartDate, setRangeStartDate] = useState(addDays(todayIso(), -6));
  const [rangeEndDate, setRangeEndDate] = useState(todayIso());
  const rangeCaptureRef = useRef(null);
  const inter = data?.interregional || [];
  const trans = data?.transnational || [];

  const byCode = useMemo(() => {
    const map = {};
    [...inter, ...trans].forEach((item) => { map[item.code] = item; });
    return map;
  }, [inter, trans]);

  const totals = data?.totals || {};
  const allCodes = ["NR", "WR", "SR", "NER", "NEPAL", "BHUTAN", "BANGLADESH"];
  const detailRows = [
    ...inter.map((item) => ({ ...item, group: "Inter Regional" })),
    ...trans.map((item) => ({ ...item, group: "Transnational" })),
  ];

  const loadRangeSummary = async (start = rangeStartDate, end = rangeEndDate) => {
    try {
      setRangeLoading(true);
      setRangeError("");
      const res = await API.getPspPowerExchangeRange(start, end);
      if (!res.success) throw new Error(res.message || "Unable to load exchange range summary");
      setRangeData(res);
    } catch (err) {
      console.error("Error loading power exchange range:", err);
      setRangeError(err.message || "Unable to load exchange range summary.");
    } finally {
      setRangeLoading(false);
    }
  };

  const openRangeSummary = () => {
    const end = data?.date || todayIso();
    const start = addDays(end, -6);
    setRangeEndDate(end);
    setRangeStartDate(start);
    setRangeOpen(true);
    loadRangeSummary(start, end);
  };

  const downloadRangeExcel = () => {
    const rows = rangeData?.rows || [];
    const htmlRows = rows.map((row) => `
      <tr>
        <td>${row.group || ""}</td>
        <td>${row.code || ""}</td>
        <td>${row.name || ""}</td>
        <td>${row.days || 0}</td>
        <td>${row.schedule ?? ""}</td>
        <td>${row.actual ?? ""}</td>
        <td>${row.difference ?? ""}</td>
        <td>${row.net_ui ?? ""}</td>
      </tr>
    `).join("");
    const workbook = `
      <html>
        <head><meta charset="utf-8" /></head>
        <body>
          <table border="1">
            <tr><th colspan="8">ER Power Exchange Summary ${rangeData?.start_date || rangeStartDate} to ${rangeData?.end_date || rangeEndDate}</th></tr>
            <tr>
              <th>Group</th><th>Code</th><th>Name</th><th>Records</th>
              <th>Schedule Sum</th><th>Actual Sum</th><th>Actual - Schedule</th><th>Net UI</th>
            </tr>
            ${htmlRows}
          </table>
        </body>
      </html>
    `;
    const blob = new Blob([workbook], { type: "application/vnd.ms-excel;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ER_Exchange_${rangeData?.start_date || rangeStartDate}_to_${rangeData?.end_date || rangeEndDate}.xls`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const downloadRangeImage = async () => {
    if (!rangeCaptureRef.current) return;
    const canvas = await html2canvas(rangeCaptureRef.current, {
      backgroundColor: "#ffffff",
      scale: 2,
      useCORS: true,
    });
    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = `ER_Exchange_${rangeData?.start_date || rangeStartDate}_to_${rangeData?.end_date || rangeEndDate}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return (
      <div className="theme-glass-card p-4 h-100 d-flex align-items-center justify-content-center" style={{ minHeight: 360 }}>
        <div className="spinner-border text-success" role="status" />
      </div>
    );
  }

  if (!data?.has_data) {
    return (
      <div className="theme-glass-card p-4 h-100 d-flex align-items-center justify-content-center" style={{ minHeight: 360 }}>
        <div className="text-center text-muted">
          <Info size={28} className="mb-2 opacity-50" />
          <div className="fw-bold">No PSP exchange data available</div>
        </div>
      </div>
    );
  }

  return (
    <div className="theme-glass-card p-3 h-100" style={{ minHeight: 535, overflow: "hidden" }}>
      <div className="d-flex align-items-center justify-content-between mb-2">
        <div className="d-flex align-items-center gap-2">
          <ArrowRightLeft size={17} style={{ color: "#03624C" }} />
          <div>
            <h3 className="h6 fw-bold mb-0 text-dark">Power Supply Position: Exchange Map</h3>
            <p className="small text-muted mb-0" style={{ fontSize: "0.72rem" }}>
              ER inter-regional and transnational schedule/actual exchange, {data.date}
            </p>
          </div>
        </div>
        <div className="d-flex align-items-center gap-2">
          <button
            type="button"
            className="btn btn-sm theme-btn-outline d-inline-flex align-items-center gap-1"
            onClick={() => setDetailsOpen(true)}
            title="View exchange details"
          >
            <ListChecks size={14} />
            Details
          </button>
          <button
            type="button"
            className="btn btn-sm theme-btn-outline d-inline-flex align-items-center gap-1"
            onClick={openRangeSummary}
            title="View date-range exchange summary"
          >
            <FileSpreadsheet size={14} />
            Range
          </button>
          <div className="text-end d-none d-md-block" style={{ fontSize: "0.68rem", color: "#334155", lineHeight: 1.25 }}>
            <div>+VE: Export by ER</div>
            <div>-VE: Import by ER</div>
          </div>
        </div>
      </div>

      <svg viewBox="0 0 1000 740" style={{ width: "100%", height: "500px", display: "block", background: "#F8FAFC", borderRadius: 8 }}>
        <defs>
          <filter id="exchangeShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="3" dy="4" stdDeviation="2" floodColor="#94A3B8" floodOpacity="0.38" />
          </filter>
          <filter id="calloutShadow" x="-20%" y="-20%" width="140%" height="150%">
            <feDropShadow dx="0" dy="8" stdDeviation="5" floodColor="#0F172A" floodOpacity="0.13" />
          </filter>
        </defs>

        <rect x="22" y="18" width="290" height="40" rx="20" fill="#FFFFFF" stroke="#DDEFEA" />
        <text x="42" y="44" fill="#0F766E" fontSize="19" fontWeight="900">ER Exchange Position</text>

        {allCodes.map((code) => <RegionImage key={code} code={code} active={!!byCode[code]} />)}
        <ERHub />

        {byCode.NR && <FlowText x={234} y={246} schedule={byCode.NR.schedule} actual={byCode.NR.actual} color="#0891B2" />}
        {byCode.WR && <FlowText x={170} y={486} schedule={byCode.WR.schedule} actual={byCode.WR.actual} color="#F97316" />}
        {byCode.SR && <FlowText x={500} y={488} schedule={byCode.SR.schedule} actual={byCode.SR.actual} color="#EF4444" />}
        {byCode.NEPAL && <FlowText x={520} y={184} schedule={byCode.NEPAL.schedule} actual={byCode.NEPAL.actual} color="#38BDF8" />}
        {byCode.BHUTAN && <FlowText x={808} y={220} schedule={byCode.BHUTAN.schedule} actual={byCode.BHUTAN.actual} color="#4B5563" />}
        {byCode.NER && <FlowText x={802} y={454} schedule={byCode.NER.schedule} actual={byCode.NER.actual} color="#D6A700" />}
        {byCode.BANGLADESH && <FlowText x={692} y={640} schedule={byCode.BANGLADESH.schedule} actual={byCode.BANGLADESH.actual} color="#3154D4" />}

        <g transform="translate(548 672)" filter="url(#calloutShadow)">
          <rect x="0" y="0" width="420" height="52" rx="16" fill="#FFF7D6" stroke="#FBBF24" opacity="0.98" />
          <line x1="210" y1="9" x2="210" y2="43" stroke="#B45309" opacity="0.32" />
          <text x="20" y="22" fill="#065F46" fontSize="15" fontWeight="900">Inter Regional</text>
          <text x="20" y="41" fill="#111827" fontSize="14">Sch {fmt(totals.interregional_schedule)} | Act {fmt(totals.interregional_actual)}</text>
          <text x="232" y="22" fill="#065F46" fontSize="15" fontWeight="900">Transnational</text>
          <text x="232" y="41" fill="#111827" fontSize="14">Sch {fmt(totals.transnational_schedule)} | Act {fmt(totals.transnational_actual)}</text>
        </g>
      </svg>

      <div className="d-flex flex-wrap gap-2 mt-2" style={{ fontSize: "0.7rem" }}>
        {[...inter, ...trans].map((item) => (
          <button
            type="button"
            key={item.code}
            className="px-2 py-1 rounded-2 border-0"
            onClick={() => setDetailsOpen(true)}
            style={{ background: `${COLORS[item.code] || "#64748B"}18`, color: COLORS[item.code] || "#475569", fontWeight: 700 }}
          >
            {item.code}: {flowDirection(item.actual)}
          </button>
        ))}
      </div>

      {detailsOpen && (
        <div
          className="modal fade show d-block"
          tabIndex="-1"
          role="dialog"
          style={{ backgroundColor: "rgba(15, 23, 42, 0.42)", backdropFilter: "blur(3px)" }}
          onClick={() => setDetailsOpen(false)}
        >
          <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: 940 }} onClick={(event) => event.stopPropagation()}>
            <div className="modal-content theme-glass-card border-0 p-3">
              <div className="modal-header border-0 pb-2">
                <div>
                  <h5 className="modal-title fw-bold text-dark d-flex align-items-center gap-2">
                    <ArrowRightLeft size={18} style={{ color: "#03624C" }} />
                    PSP Exchange Details
                  </h5>
                  <p className="small text-muted mb-0">Schedule and actual exchange for {data.date}</p>
                </div>
                <button type="button" className="btn btn-sm btn-light rounded-circle" onClick={() => setDetailsOpen(false)} aria-label="Close">
                  <X size={16} />
                </button>
              </div>

              <div className="modal-body pt-2">
                <div className="row g-3 mb-3">
                  <div className="col-12 col-md-6">
                    <div className="p-3 rounded-3 border h-100" style={{ background: "linear-gradient(135deg, #ECFDF5 0%, #FFFFFF 70%)" }}>
                      <div className="small text-muted fw-semibold">Inter Regional Total</div>
                      <div className="d-flex justify-content-between mt-2">
                        <span>Schedule</span>
                        <strong>{fmt(totals.interregional_schedule)}</strong>
                      </div>
                      <div className="d-flex justify-content-between">
                        <span>Actual</span>
                        <strong>{fmt(totals.interregional_actual)}</strong>
                      </div>
                    </div>
                  </div>
                  <div className="col-12 col-md-6">
                    <div className="p-3 rounded-3 border h-100" style={{ background: "linear-gradient(135deg, #EFF6FF 0%, #FFFFFF 70%)" }}>
                      <div className="small text-muted fw-semibold">Transnational Total</div>
                      <div className="d-flex justify-content-between mt-2">
                        <span>Schedule</span>
                        <strong>{fmt(totals.transnational_schedule)}</strong>
                      </div>
                      <div className="d-flex justify-content-between">
                        <span>Actual</span>
                        <strong>{fmt(totals.transnational_actual)}</strong>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="row g-3">
                  {detailRows.map((item) => (
                    <div className="col-12 col-md-6 col-xl-4" key={`${item.group}-${item.code}`}>
                      <div
                        className="h-100 rounded-3 border overflow-hidden"
                        style={{
                          background: `linear-gradient(135deg, ${COLORS[item.code] || "#64748B"}14 0%, #FFFFFF 52%)`,
                          boxShadow: "0 10px 24px rgba(15, 23, 42, 0.07)",
                        }}
                      >
                        <div className="d-flex align-items-center gap-3 p-3 pb-2">
                          <div className="rounded-3 bg-white border d-flex align-items-center justify-content-center" style={{ width: 72, height: 58 }}>
                            <img
                              src={IMAGE_MAP[item.code]}
                              alt={item.name || item.code}
                              style={{ maxWidth: 62, maxHeight: 50, objectFit: "contain" }}
                            />
                          </div>
                          <div className="min-w-0">
                            <div className="small text-muted fw-semibold">{item.group}</div>
                            <div className="fw-bold text-dark text-truncate">{item.name || item.code}</div>
                          </div>
                        </div>
                        <div className="d-flex gap-2 px-3 pb-3">
                          <div className="flex-fill rounded-3 bg-white border p-2">
                            <div className="text-muted fw-bold" style={{ fontSize: "0.64rem" }}>SCHEDULE</div>
                            <div className="font-monospace fw-bold text-dark">{fmt(item.schedule)}</div>
                          </div>
                          <div className="flex-fill rounded-3 bg-white border p-2">
                            <div className="text-muted fw-bold" style={{ fontSize: "0.64rem" }}>ACTUAL</div>
                            <div className="font-monospace fw-bold" style={{ color: COLORS[item.code] || "#475569" }}>{fmt(item.actual)}</div>
                          </div>
                        </div>
                        <div className="px-3 pb-3">
                          <span className="badge rounded-pill px-3 py-2" style={{ background: `${flowTone(item.actual)}18`, color: flowTone(item.actual) }}>
                            {flowDirection(item.actual)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {rangeOpen && (
        <div
          className="modal fade show d-block"
          tabIndex="-1"
          role="dialog"
          style={{ backgroundColor: "rgba(15, 23, 42, 0.52)", backdropFilter: "blur(4px)" }}
          onClick={() => setRangeOpen(false)}
        >
          <div className="modal-dialog modal-xl modal-dialog-centered" onClick={(event) => event.stopPropagation()}>
            <div className="modal-content theme-glass-card border-0 p-3" style={{ borderRadius: 18 }}>
              <div className="modal-header border-0 pb-2">
                <div>
                  <h5 className="modal-title fw-bold text-dark d-flex align-items-center gap-2">
                    <ArrowRightLeft size={18} style={{ color: "#03624C" }} />
                    ER Exchange Date Range Summary
                  </h5>
                  <p className="small text-muted mb-0">Summed schedule and actual exchange for selected PSP dates.</p>
                </div>
                <button type="button" className="btn btn-sm btn-light rounded-circle" onClick={() => setRangeOpen(false)} aria-label="Close">
                  <X size={16} />
                </button>
              </div>

              <div className="modal-body pt-2">
                <div className="d-flex align-items-end gap-2 flex-wrap mb-3">
                  <div>
                    <label className="form-label small fw-bold text-secondary mb-1">Start Date</label>
                    <input
                      type="date"
                      className="form-control theme-input"
                      value={rangeStartDate}
                      onChange={(event) => setRangeStartDate(event.target.value)}
                    />
                  </div>
                  <div>
                    <label className="form-label small fw-bold text-secondary mb-1">End Date</label>
                    <input
                      type="date"
                      className="form-control theme-input"
                      value={rangeEndDate}
                      onChange={(event) => setRangeEndDate(event.target.value)}
                    />
                  </div>
                  <button
                    type="button"
                    className="btn theme-btn-primary d-flex align-items-center gap-2"
                    onClick={() => loadRangeSummary(rangeStartDate, rangeEndDate)}
                    disabled={rangeLoading}
                  >
                    <RefreshCw size={14} className={rangeLoading ? "animate-spin-custom" : ""} />
                    Load
                  </button>
                  <button
                    type="button"
                    className="btn theme-btn-outline d-flex align-items-center gap-2"
                    onClick={downloadRangeImage}
                    disabled={!rangeData?.rows?.length || rangeLoading}
                  >
                    <Download size={14} />
                    Image
                  </button>
                  <button
                    type="button"
                    className="btn theme-btn-outline d-flex align-items-center gap-2"
                    onClick={downloadRangeExcel}
                    disabled={!rangeData?.rows?.length || rangeLoading}
                  >
                    <FileSpreadsheet size={14} />
                    Excel
                  </button>
                </div>

                <div ref={rangeCaptureRef} className="bg-white rounded-3 border p-3">
                  <div className="d-flex justify-content-between align-items-start gap-3 flex-wrap mb-3">
                    <div>
                      <h6 className="fw-bold text-dark mb-1">Power Supply Position: Exchange Summary</h6>
                      <div className="small text-muted">
                        {rangeData?.start_date || rangeStartDate} to {rangeData?.end_date || rangeEndDate} | {rangeData?.date_count ?? 0} PSP dates
                      </div>
                    </div>
                    <div className="d-flex gap-2 flex-wrap">
                      {[
                        ["IR Sch", rangeData?.totals?.interregional_schedule],
                        ["IR Act", rangeData?.totals?.interregional_actual],
                        ["TN Sch", rangeData?.totals?.transnational_schedule],
                        ["TN Act", rangeData?.totals?.transnational_actual],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-3 border px-3 py-2 text-end" style={{ minWidth: 100, background: "#F8FAFC" }}>
                          <div className="small text-muted fw-bold" style={{ fontSize: "0.66rem" }}>{label}</div>
                          <div className="fw-bold text-dark">{fmt(value)}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {rangeLoading ? (
                    <div className="d-flex align-items-center justify-content-center py-5">
                      <div className="spinner-border text-success spinner-border-sm me-2" role="status"></div>
                      <span className="small fw-bold text-secondary">Loading exchange range summary...</span>
                    </div>
                  ) : rangeError ? (
                    <div className="alert alert-warning mb-0">{rangeError}</div>
                  ) : !rangeData?.rows?.length ? (
                    <div className="text-center text-muted fw-semibold py-5">No exchange data found for selected range.</div>
                  ) : (
                    <div className="table-responsive">
                      <table className="table table-sm table-hover align-middle mb-0">
                        <thead>
                          <tr>
                            <th>Group</th>
                            <th>Code</th>
                            <th>Name</th>
                            <th className="text-end">Records</th>
                            <th className="text-end">Schedule Sum</th>
                            <th className="text-end">Actual Sum</th>
                            <th className="text-end">Actual - Schedule</th>
                            <th className="text-end">Net UI</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rangeData.rows.map((row) => (
                            <tr key={`${row.group}-${row.code}`}>
                              <td className="fw-semibold text-secondary">{row.group}</td>
                              <td>
                                <span className="badge rounded-pill" style={{ background: `${COLORS[row.code] || "#64748B"}18`, color: COLORS[row.code] || "#475569" }}>
                                  {row.code}
                                </span>
                              </td>
                              <td className="fw-bold text-dark">{row.name}</td>
                              <td className="text-end">{row.days}</td>
                              <td className="text-end font-monospace">{fmt(row.schedule)}</td>
                              <td className="text-end font-monospace fw-bold">{fmt(row.actual)}</td>
                              <td className="text-end font-monospace" style={{ color: flowTone(row.difference) }}>{fmt(row.difference)}</td>
                              <td className="text-end font-monospace">{row.net_ui === null || row.net_ui === undefined ? "-" : fmt(row.net_ui)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
