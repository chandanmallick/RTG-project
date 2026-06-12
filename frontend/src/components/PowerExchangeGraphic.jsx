import { useMemo, useState } from "react";
import { ArrowRightLeft, Info, ListChecks, X } from "lucide-react";

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
  NR: { x: 80, y: 52, w: 184, h: 154, labelX: 188, labelY: 114 },
  WR: { x: 54, y: 370, w: 204, h: 154, labelX: 118, labelY: 448 },
  SR: { x: 344, y: 588, w: 170, h: 132, labelX: 432, labelY: 688 },
  NER: { x: 784, y: 362, w: 164, h: 116, labelX: 878, labelY: 414 },
  NEPAL: { x: 570, y: 62, w: 206, h: 112, labelX: 676, labelY: 112 },
  BHUTAN: { x: 788, y: 210, w: 138, h: 84, labelX: 854, labelY: 232 },
  BANGLADESH: { x: 734, y: 536, w: 138, h: 146, labelX: 818, labelY: 554 },
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

const Arrow = ({ from, to, value, color, bend = 0 }) => {
  const b = POS[to];
  const exportByEr = Number(value) >= 0;
  const start = exportByEr ? POS.ER : b;
  const end = exportByEr ? b : POS.ER;
  const sx = start.x + start.w / 2;
  const sy = start.y + start.h / 2;
  const ex = end.x + end.w / 2;
  const ey = end.y + end.h / 2;
  const mx = (sx + ex) / 2 + bend;
  const my = (sy + ey) / 2 - Math.abs(bend) * 0.25;
  return (
    <path
      d={`M ${sx} ${sy} Q ${mx} ${my} ${ex} ${ey}`}
      fill="none"
      stroke={color}
      strokeWidth="7"
      strokeLinecap="round"
      markerEnd={`url(#arrow-${color.replace("#", "")})`}
      opacity="0.82"
    />
  );
};

export default function PowerExchangeGraphic({ data, loading }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
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
          <div className="text-end d-none d-md-block" style={{ fontSize: "0.68rem", color: "#334155", lineHeight: 1.25 }}>
            <div>+VE: Export by ER</div>
            <div>-VE: Import by ER</div>
          </div>
        </div>
      </div>

      <svg viewBox="0 0 1000 740" style={{ width: "100%", height: "500px", display: "block", background: "#F8FAFC", borderRadius: 8 }}>
        <defs>
          {Object.values(COLORS).map((color) => (
            <marker key={color} id={`arrow-${color.replace("#", "")}`} markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto" markerUnits="strokeWidth">
              <path d="M2,2 L10,6 L2,10 Z" fill={color} />
            </marker>
          ))}
          <filter id="exchangeShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="3" dy="4" stdDeviation="2" floodColor="#94A3B8" floodOpacity="0.38" />
          </filter>
          <filter id="calloutShadow" x="-20%" y="-20%" width="140%" height="150%">
            <feDropShadow dx="0" dy="8" stdDeviation="5" floodColor="#0F172A" floodOpacity="0.13" />
          </filter>
        </defs>

        <rect x="22" y="18" width="290" height="40" rx="20" fill="#FFFFFF" stroke="#DDEFEA" />
        <text x="42" y="44" fill="#0F766E" fontSize="19" fontWeight="900">ER Exchange Position</text>

        {[
          ["NR", -46], ["WR", -56], ["SR", 26], ["NER", 26],
          ["NEPAL", -26], ["BHUTAN", 26], ["BANGLADESH", 42],
        ].map(([code, bend]) => byCode[code] && (
          <Arrow key={code} from="ER" to={code} value={byCode[code].actual} color={COLORS[code]} bend={bend} />
        ))}

        {allCodes.map((code) => <RegionImage key={code} code={code} active={!!byCode[code]} />)}
        <ERHub />

        {byCode.NR && <FlowText x={178} y={228} schedule={byCode.NR.schedule} actual={byCode.NR.actual} color="#0891B2" />}
        {byCode.WR && <FlowText x={158} y={324} schedule={byCode.WR.schedule} actual={byCode.WR.actual} color="#F97316" />}
        {byCode.SR && <FlowText x={428} y={552} schedule={byCode.SR.schedule} actual={byCode.SR.actual} color="#EF4444" />}
        {byCode.NER && <FlowText x={760} y={494} schedule={byCode.NER.schedule} actual={byCode.NER.actual} color="#D6A700" />}
        {byCode.NEPAL && <FlowText x={664} y={200} schedule={byCode.NEPAL.schedule} actual={byCode.NEPAL.actual} color="#38BDF8" />}
        {byCode.BHUTAN && <FlowText x={790} y={314} schedule={byCode.BHUTAN.schedule} actual={byCode.BHUTAN.actual} color="#4B5563" />}
        {byCode.BANGLADESH && <FlowText x={624} y={518} schedule={byCode.BANGLADESH.schedule} actual={byCode.BANGLADESH.actual} color="#3154D4" />}

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
    </div>
  );
}
