import { useState, useMemo } from "react";
import { Zap, ChevronRight, X } from "lucide-react";

/* ─────────────────────────────────────────────
   Geographic transform   viewBox 460 × 490
   Lon: 82°E → 90°E   Lat: 17.5°N → 28°N
───────────────────────────────────────────── */
const MW = 460, MH = 490;
const gx = (lon) => ((lon - 82) / 8) * MW;
const gy = (lat) => ((28 - lat) / 10.5) * MH;

/* ─────────────────────────────────────────────
   Substation geographic positions [lon, lat]
   Keyed by uppercase name substring
───────────────────────────────────────────── */
const GEO = {
  BERHAMPORE:  [88.25, 24.1],
  DURGAPUR:    [87.3,  23.5],
  GODDA:       [87.2,  24.8],
  JAMSHEDPUR:  [86.2,  22.8],
  JEENAT:      [87.5,  23.9],
  JEYPORE:     [82.6,  18.9],
  KODERMA:     [85.6,  24.5],
  MAITHON:     [86.9,  23.6],
  MIDNAPORE:   [87.3,  22.4],
  MUZAFFARPUR: [85.4,  26.1],
  PATNA:       [85.1,  25.6],
  RANGPO:      [88.5,  27.2],
  ROURKELA:    [84.9,  22.2],
  TEESTA:      [88.6,  26.7],
  ANGUL:       [85.1,  20.8],
  DARLIPALI:   [83.4,  21.5],
  GAYA:        [85.0,  24.8],
  JHARSUGUDA:  [84.1,  21.9],
  RANCHI:      [85.3,  23.4],
  SASARAM:     [84.0,  25.0],
};

const resolve = (name) => {
  if (!name || typeof name !== "string") return null;
  const u = name.toUpperCase();
  for (const [k, [lon, lat]] of Object.entries(GEO)) {
    if (u.includes(k)) return { x: gx(lon), y: gy(lat) };
  }
  return null;
};

const shortName = (name) => {
  if (!name || typeof name !== "string") return "";
  return name.replace(/\s*[-–]\s*(400|765)\s*KV\s*/i, "").replace(/_/g, " ").trim();
};

/* ─────────────────────────────────────────────
   State polygons  (pre-computed SVG paths)
───────────────────────────────────────────── */
const STATES = [
  {
    id: "ODISHA", label: "Odisha",
    lx: gx(84.8), ly: gy(19.8),
    fill: "rgba(20,184,166,0.13)", stroke: "rgba(20,184,166,0.65)",
    // NW→E border→SE coast→SW coast→W border
    d: `M ${gx(82.5)},${gy(22.5)} L ${gx(85.5)},${gy(22.5)} L ${gx(86.5)},${gy(22.5)} L ${gx(87.0)},${gy(22.0)} L ${gx(87.3)},${gy(21.0)} L ${gx(87.5)},${gy(19.2)} L ${gx(87.0)},${gy(18.3)} L ${gx(85.0)},${gy(18.0)} L ${gx(83.0)},${gy(18.3)} L ${gx(82.2)},${gy(19.0)} L ${gx(82.0)},${gy(21.0)} Z`,
  },
  {
    id: "JHARKHAND", label: "Jharkhand",
    lx: gx(85.3), ly: gy(23.7),
    fill: "rgba(245,158,11,0.13)", stroke: "rgba(245,158,11,0.65)",
    // SW→NW→N border (Bihar)→NE→E→SE→S border→close
    d: `M ${gx(83.0)},${gy(22.5)} L ${gx(83.0)},${gy(24.5)} L ${gx(84.5)},${gy(25.0)} L ${gx(86.0)},${gy(25.3)} L ${gx(87.5)},${gy(24.5)} L ${gx(87.0)},${gy(23.5)} L ${gx(86.5)},${gy(22.5)} L ${gx(85.5)},${gy(22.5)} L ${gx(83.0)},${gy(22.5)} Z`,
  },
  {
    id: "WEST_BENGAL", label: "West Bengal",
    lx: gx(88.1), ly: gy(24.0),
    fill: "rgba(139,92,246,0.13)", stroke: "rgba(139,92,246,0.65)",
    // SW→SE coast→E→NE→N→NW Siliguri corridor→W border
    d: `M ${gx(86.5)},${gy(22.5)} L ${gx(87.0)},${gy(22.0)} L ${gx(88.5)},${gy(22.2)} L ${gx(88.8)},${gy(22.8)} L ${gx(88.5)},${gy(24.0)} L ${gx(88.3)},${gy(24.8)} L ${gx(88.5)},${gy(26.5)} L ${gx(89.2)},${gy(27.0)} L ${gx(89.0)},${gy(27.5)} L ${gx(88.4)},${gy(27.5)} L ${gx(88.0)},${gy(27.0)} L ${gx(87.5)},${gy(26.5)} L ${gx(87.3)},${gy(25.0)} L ${gx(87.5)},${gy(24.5)} L ${gx(87.0)},${gy(23.5)} Z`,
  },
  {
    id: "BIHAR", label: "Bihar",
    lx: gx(85.5), ly: gy(26.2),
    fill: "rgba(59,130,246,0.13)", stroke: "rgba(59,130,246,0.65)",
    // SW→S border (Jharkhand)→SE→NE→N (Nepal)→NW→close
    d: `M ${gx(83.0)},${gy(24.5)} L ${gx(87.5)},${gy(24.5)} L ${gx(87.5)},${gy(26.5)} L ${gx(88.0)},${gy(27.0)} L ${gx(87.0)},${gy(27.5)} L ${gx(85.0)},${gy(27.5)} L ${gx(83.0)},${gy(27.0)} Z`,
  },
  {
    id: "SIKKIM", label: "Sikkim",
    lx: gx(88.5), ly: gy(27.5),
    fill: "rgba(16,185,129,0.2)", stroke: "rgba(16,185,129,0.65)",
    d: `M ${gx(88.0)},${gy(27.0)} L ${gx(88.4)},${gy(27.5)} L ${gx(89.0)},${gy(27.5)} L ${gx(89.2)},${gy(27.0)} Z`,
  },
];

/* ─────────────────────────────────────────────
   Status color palette
───────────────────────────────────────────── */
const SC = {
  normal:  "#10B981",
  high:    "#F59E0B",
  low:     "#EF4444",
  offline: "#64748B",
};

const STATUS_LABEL = {
  normal: "Normal", high: "High Voltage", low: "Low Voltage", offline: "Offline",
};

/* ═══════════════════════════════════════════════
   Component
═══════════════════════════════════════════════ */
export default function VoltageProfileMap({ voltageData, voltageLoading }) {
  const [open, setOpen]   = useState(false);
  const [sel, setSel]     = useState(null);
  const [lvl, setLvl]     = useState("all");

  /* Build station list enriched with map coords */
  const stations = useMemo(() => {
    if (!voltageData?.has_data) return [];
    const raw = [
      ...(voltageData.kv400 || []),
      ...(voltageData.kv765 || []),
    ];
    const placed = {};
    return raw
      .map((s) => {
        const c = resolve(s.name);
        if (!c) return null;
        const key = `${Math.round(c.x / 10)}_${Math.round(c.y / 10)}`;
        const n = placed[key] ?? 0;
        placed[key] = n + 1;
        return { ...s, mx: c.x + n * 10, my: c.y + n * 7 };
      })
      .filter(Boolean);
  }, [voltageData]);

  const visible = useMemo(
    () => (lvl === "all" ? stations : stations.filter((s) => s.level === lvl)),
    [stations, lvl]
  );

  const sum = useMemo(() => {
    const o = { normal: 0, high: 0, low: 0, offline: 0, total: 0 };
    stations.forEach((s) => {
      o[s.status] = (o[s.status] || 0) + 1;
      o.total += 1;
    });
    return o;
  }, [stations]);

  const TILE_STATS = [
    { k: "normal",  c: "#10B981", icon: "✓", label: "Normal"  },
    { k: "high",    c: "#F59E0B", icon: "▲", label: "High V"  },
    { k: "low",     c: "#EF4444", icon: "▼", label: "Low V"   },
    { k: "offline", c: "#94A3B8", icon: "–", label: "Offline" },
  ];

  /* ── helper: SVG node ── */
  const Node = ({ s }) => {
    const clr   = SC[s.status] || SC.normal;
    const is765 = s.level === "765kV";
    const r     = is765 ? 7 : 5;
    const isSel = sel?.station_key === s.station_key && sel?.level === s.level;
    return (
      <g
        key={`${s.station_key}-${s.level}`}
        style={{ cursor: "pointer" }}
        onClick={(e) => { e.stopPropagation(); setSel(isSel ? null : s); }}
      >
        {/* 765 kV outer ring */}
        {is765 && (
          <circle cx={s.mx} cy={s.my} r={r + 5} fill="none"
            stroke={clr} strokeWidth="1" opacity="0.3" />
        )}
        {/* Selected pulse */}
        {isSel && (
          <circle cx={s.mx} cy={s.my} r={r + 10} fill="none"
            stroke={clr} strokeWidth="2.5" opacity="0.55" />
        )}
        {/* Glow halo */}
        <circle cx={s.mx} cy={s.my} r={r + 2}
          fill={clr} opacity="0.2" filter="url(#halo)" />
        {/* Main dot */}
        <circle cx={s.mx} cy={s.my} r={r}
          fill={clr}
          opacity={s.status === "offline" ? 0.45 : 0.95}
          filter="url(#halo)" />
        {/* Inner white highlight */}
        <circle cx={s.mx} cy={s.my} r={r - 2.5}
          fill="rgba(255,255,255,0.32)" />
        {/* Label */}
        <text
          x={s.mx} y={s.my - r - 4}
          fill="rgba(255,255,255,0.85)" fontSize="7"
          textAnchor="middle" fontWeight="600"
          style={{ pointerEvents: "none" }}
        >
          {shortName(s.name)}
        </text>
      </g>
    );
  };

  /* ── Detail panel content ── */
  const DetailPanel = () => {
    if (!sel) {
      return (
        <div>
          <div style={{ color: "#475569", fontSize: "0.61rem", fontWeight: 700,
            textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>
            Substations ({visible.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "3px",
            maxHeight: "62vh", overflowY: "auto" }}>
            {visible.map((s) => {
              const clr = SC[s.status] || SC.normal;
              const isSel = sel?.station_key === s.station_key && sel?.level === s.level;
              return (
                <button key={`${s.station_key}-${s.level}`}
                  onClick={() => setSel(s)}
                  style={{
                    display: "flex", alignItems: "center", gap: "7px",
                    background: isSel ? `${clr}18` : "rgba(255,255,255,0.035)",
                    border: `1px solid ${isSel ? clr + "55" : "rgba(255,255,255,0.07)"}`,
                    borderRadius: "8px", padding: "6px 9px",
                    cursor: "pointer", textAlign: "left", width: "100%",
                    transition: "all 0.15s",
                  }}>
                  <div style={{ width: "8px", height: "8px", borderRadius: "50%",
                    background: clr, flexShrink: 0,
                    boxShadow: `0 0 6px ${clr}80` }} />
                  <span style={{ color: "#cbd5e1", fontSize: "0.7rem", flex: 1,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {shortName(s.name)}
                  </span>
                  <span style={{
                    color: "#fff", fontSize: "0.58rem", fontWeight: 700,
                    background: clr + "40", borderRadius: "4px", padding: "1px 5px",
                    flexShrink: 0,
                  }}>
                    {s.level}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    const clr = SC[sel.status] || SC.normal;
    const bands = [
      { l: sel.volt1, v: sel.volt1_value ?? 0 },
      { l: sel.volt2, v: sel.volt2_value ?? 0 },
      { l: sel.volt3, v: sel.volt3_value ?? 0 },
      ...(sel.volt4 && sel.volt4 !== "null"
        ? [{ l: sel.volt4, v: sel.volt4_value ?? 0 }]
        : []),
    ].filter((b) => b.l);
    const BAND_COLORS = ["#EF4444", "#10B981", "#F59E0B", "#6366F1"];

    return (
      <div>
        {/* Back */}
        <button onClick={() => setSel(null)} style={{
          display: "flex", alignItems: "center", gap: "5px",
          background: "none", border: "none", color: "#64748B",
          fontSize: "0.7rem", cursor: "pointer", padding: 0,
          marginBottom: "12px",
        }}>
          ← All stations
        </button>

        {/* Name + badges */}
        <div style={{ marginBottom: "14px" }}>
          <div style={{ color: "#f1f5f9", fontWeight: 800, fontSize: "0.92rem",
            lineHeight: 1.25, marginBottom: "7px" }}>
            {shortName(sel.name)}
          </div>
          <div style={{ display: "flex", gap: "5px", flexWrap: "wrap" }}>
            <span style={{
              background: clr + "22", border: `1px solid ${clr}55`,
              color: clr, borderRadius: "6px", padding: "2px 9px",
              fontSize: "0.64rem", fontWeight: 700,
            }}>
              {sel.level}
            </span>
            <span style={{
              background: clr, color: "#fff", borderRadius: "6px",
              padding: "2px 9px", fontSize: "0.64rem", fontWeight: 700,
              textTransform: "capitalize",
            }}>
              {sel.status}
            </span>
          </div>
        </div>

        {/* Min / Max cards */}
        <div style={{ display: "flex", gap: "7px", marginBottom: "14px" }}>
          {[
            { val: `${sel.min_voltage} kV`, sub: `Min · ${sel.min_time}`, c: "#EF4444" },
            { val: `${sel.max_voltage} kV`, sub: `Max · ${sel.max_time}`, c: "#F59E0B" },
          ].map((m, i) => (
            <div key={i} style={{
              flex: 1, textAlign: "center",
              background: m.c + "12", border: `1px solid ${m.c}30`,
              borderRadius: "11px", padding: "11px 6px",
            }}>
              <div style={{ color: m.c, fontWeight: 800, fontSize: "1.05rem", lineHeight: 1 }}>
                {m.val}
              </div>
              <div style={{ color: "#64748B", fontSize: "0.6rem", marginTop: "4px" }}>
                {m.sub}
              </div>
            </div>
          ))}
        </div>

        {/* Voltage band bars */}
        <div style={{ marginBottom: "14px" }}>
          <div style={{ color: "#475569", fontSize: "0.6rem", fontWeight: 700,
            textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>
            Time in Voltage Bands
          </div>
          {bands.map((b, i) => (
            <div key={i} style={{ marginBottom: "8px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
                <span style={{ color: "#64748B", fontSize: "0.63rem" }}>{b.l}</span>
                <span style={{ color: "#e2e8f0", fontSize: "0.63rem", fontWeight: 700 }}>
                  {Number(b.v).toFixed(1)}%
                </span>
              </div>
              <div style={{ height: "5px", background: "rgba(255,255,255,0.06)",
                borderRadius: "3px", overflow: "hidden" }}>
                <div style={{
                  height: "100%",
                  width: `${Math.min(Number(b.v), 100)}%`,
                  background: BAND_COLORS[i % BAND_COLORS.length],
                  borderRadius: "3px",
                  transition: "width 0.45s ease",
                }} />
              </div>
            </div>
          ))}
        </div>

        {/* Dev index */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          background: clr + "12", border: `1px solid ${clr}28`,
          borderRadius: "11px", padding: "11px 14px",
        }}>
          <span style={{ color: "#64748B", fontSize: "0.7rem", fontWeight: 700 }}>
            Voltage Dev. Index
          </span>
          <span style={{ color: clr, fontWeight: 800, fontSize: "1.15rem" }}>
            {Number(sel.deviation_index).toFixed(1)}%
          </span>
        </div>
      </div>
    );
  };

  /* ════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════ */
  return (
    <>
      {/* ── COMPACT SUMMARY TILE ─────────────── */}
      <div
        className="theme-glass-card p-3 h-100 d-flex flex-column"
        style={{
          cursor: voltageLoading ? "default" : "pointer",
          minHeight: "160px",
          userSelect: "none",
          border: "1px solid rgba(245,158,11,0.18)",
          transition: "box-shadow 0.2s",
        }}
        onClick={() => { if (!voltageLoading && voltageData?.has_data) setOpen(true); }}
        title="Click to view ER Voltage Profile Map"
      >
        <div className="d-flex align-items-center justify-content-between mb-2">
          <div className="d-flex align-items-center gap-1">
            <Zap size={14} style={{ color: "#F59E0B" }} />
            <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "#1e293b" }}>
              ER Voltage Profile
            </span>
          </div>
          <ChevronRight size={13} className="text-secondary" />
        </div>

        {voltageLoading ? (
          <div className="flex-grow-1 d-flex align-items-center justify-content-center">
            <div className="spinner-border spinner-border-sm text-warning" role="status" />
          </div>
        ) : !voltageData?.has_data ? (
          <p className="text-muted mb-0 flex-grow-1 d-flex align-items-center justify-content-center"
            style={{ fontSize: "0.72rem" }}>
            No voltage data available
          </p>
        ) : (
          <>
            <p className="text-muted mb-2" style={{ fontSize: "0.61rem" }}>
              {voltageData.date} &nbsp;·&nbsp; {sum.total} substations (ER)
            </p>
            <div className="row g-1 flex-grow-1">
              {TILE_STATS.map((s) => (
                <div className="col-6" key={s.k}>
                  <div className="rounded-2 p-1 text-center h-100"
                    style={{ background: s.c + "18", border: `1px solid ${s.c}44` }}>
                    <div style={{ fontSize: "1.15rem", fontWeight: 800,
                      color: s.c, lineHeight: 1.1 }}>
                      {sum[s.k] ?? 0}
                    </div>
                    <div style={{ fontSize: "0.58rem", color: "#6B7280", fontWeight: 600 }}>
                      {s.icon} {s.label}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: "8px", textAlign: "center",
              fontSize: "0.67rem", color: "#F59E0B", fontWeight: 700 }}>
              View on Map →
            </div>
          </>
        )}
      </div>

      {/* ── FULL MAP MODAL ─────────────────────── */}
      {open && (
        <div
          style={{
            position: "fixed", inset: 0,
            background: "rgba(2,8,24,0.86)",
            backdropFilter: "blur(8px)",
            zIndex: 2000,
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "12px",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) { setOpen(false); setSel(null); }
          }}
        >
          <div style={{
            background: "linear-gradient(155deg, #0d1117 0%, #111827 100%)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "22px",
            width: "100%", maxWidth: "1080px", maxHeight: "90vh",
            display: "flex", flexDirection: "column",
            overflow: "hidden",
            boxShadow: "0 32px 90px rgba(0,0,0,0.9), 0 0 0 1px rgba(245,158,11,0.08)",
          }}>

            {/* ── Modal header ── */}
            <div style={{
              padding: "14px 20px",
              borderBottom: "1px solid rgba(255,255,255,0.07)",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              flexShrink: 0,
            }}>
              <div>
                <div style={{ color: "#f1f5f9", fontWeight: 700, fontSize: "1rem",
                  display: "flex", alignItems: "center", gap: "8px" }}>
                  <Zap size={15} style={{ color: "#F59E0B" }} />
                  Eastern Region — Substation Voltage Profile
                </div>
                <div style={{ color: "#64748B", fontSize: "0.7rem", marginTop: "2px" }}>
                  Data: {voltageData?.date} &nbsp;·&nbsp; {sum.total} substations &nbsp;·&nbsp;
                  Click any node for detailed breakdown
                </div>
              </div>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                {/* Level filter */}
                <select
                  value={lvl}
                  onChange={(e) => { setLvl(e.target.value); setSel(null); }}
                  style={{
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    color: "#e2e8f0", borderRadius: "8px",
                    padding: "5px 10px", fontSize: "0.73rem",
                    cursor: "pointer", outline: "none",
                  }}
                >
                  <option value="all"   style={{ background: "#1e293b" }}>All kV Levels</option>
                  <option value="400kV" style={{ background: "#1e293b" }}>400 kV Only</option>
                  <option value="765kV" style={{ background: "#1e293b" }}>765 kV Only</option>
                </select>
                <button
                  onClick={() => { setOpen(false); setSel(null); }}
                  style={{
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: "8px", color: "#94A3B8",
                    padding: "6px 12px", cursor: "pointer",
                    display: "flex", alignItems: "center",
                  }}
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* ── Summary strip ── */}
            <div style={{
              padding: "10px 20px",
              borderBottom: "1px solid rgba(255,255,255,0.05)",
              display: "flex", gap: "10px", flexShrink: 0,
            }}>
              {[
                { k: "normal",  c: "#10B981", label: "Normal"       },
                { k: "high",    c: "#F59E0B", label: "High Voltage" },
                { k: "low",     c: "#EF4444", label: "Low Voltage"  },
                { k: "offline", c: "#64748B", label: "Offline"      },
              ].map((s) => (
                <div key={s.k} style={{
                  flex: 1, textAlign: "center",
                  background: s.c + "14", border: `1px solid ${s.c}30`,
                  borderRadius: "10px", padding: "7px 8px",
                }}>
                  <div style={{ color: s.c, fontWeight: 800,
                    fontSize: "1.35rem", lineHeight: 1 }}>
                    {sum[s.k] ?? 0}
                  </div>
                  <div style={{ color: "#94A3B8", fontSize: "0.62rem",
                    marginTop: "3px", fontWeight: 600 }}>
                    {s.label}
                  </div>
                </div>
              ))}
            </div>

            {/* ── Body: map + detail ── */}
            <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>

              {/* SVG MAP */}
              <div style={{ flex: 1, position: "relative",
                padding: "10px 6px 6px 10px", overflow: "hidden" }}>
                <svg
                  viewBox={`0 0 ${MW} ${MH}`}
                  style={{ width: "100%", height: "100%", display: "block" }}
                  preserveAspectRatio="xMidYMid meet"
                >
                  <defs>
                    {/* Grid pattern */}
                    <pattern id="vpgrid" width="46" height="47"
                      patternUnits="userSpaceOnUse">
                      <path d="M 46 0 L 0 0 0 47" fill="none"
                        stroke="rgba(255,255,255,0.032)" strokeWidth="0.5" />
                    </pattern>
                    {/* Glow filter */}
                    <filter id="halo" x="-60%" y="-60%" width="220%" height="220%">
                      <feGaussianBlur stdDeviation="2.5" result="blur" />
                      <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                  </defs>

                  {/* Grid overlay */}
                  <rect width={MW} height={MH} fill="url(#vpgrid)" />

                  {/* Sea hint at bottom */}
                  <rect x={gx(84)} y={gy(18.3)} width={MW - gx(84)}
                    height={MH - gy(18.3)} rx="4"
                    fill="rgba(14,42,86,0.22)" />
                  <text x={gx(87.5)} y={gy(17.9)}
                    fill="rgba(80,140,200,0.45)" fontSize="9"
                    textAnchor="middle" fontStyle="italic">
                    Bay of Bengal
                  </text>

                  {/* Nepal border hint */}
                  <line x1={gx(83)} y1={gy(27.5)} x2={gx(88.4)} y2={gy(27.5)}
                    stroke="rgba(255,255,255,0.1)" strokeWidth="1"
                    strokeDasharray="4,3" />
                  <text x={gx(85)} y={gy(27.7)}
                    fill="rgba(255,255,255,0.2)" fontSize="8" textAnchor="middle">
                    Nepal →
                  </text>

                  {/* State polygons */}
                  {STATES.map((st) => (
                    <g key={st.id}>
                      <path d={st.d}
                        fill={st.fill}
                        stroke={st.stroke}
                        strokeWidth="1.2"
                        strokeLinejoin="round" />
                      <text x={st.lx} y={st.ly}
                        fill="rgba(255,255,255,0.42)"
                        fontSize="9.5" textAnchor="middle"
                        fontWeight="700" letterSpacing="0.3">
                        {st.label}
                      </text>
                    </g>
                  ))}

                  {/* Substation nodes */}
                  {visible.map((s) => (
                    <Node key={`${s.station_key}-${s.level}`} s={s} />
                  ))}
                </svg>
              </div>

              {/* ── DETAIL PANEL ── */}
              <div style={{
                width: "270px", flexShrink: 0,
                borderLeft: "1px solid rgba(255,255,255,0.07)",
                padding: "14px 12px",
                overflowY: "auto",
                display: "flex", flexDirection: "column", gap: "10px",
              }}>
                {/* Node legend */}
                <div>
                  <div style={{ color: "#475569", fontSize: "0.6rem", fontWeight: 700,
                    textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "7px" }}>
                    Legend
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px",
                    marginBottom: "8px" }}>
                    {Object.entries(SC).map(([k, c]) => (
                      <div key={k} style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                        <div style={{ width: "8px", height: "8px", borderRadius: "50%",
                          background: c, boxShadow: `0 0 5px ${c}80`, flexShrink: 0 }} />
                        <span style={{ color: "#94A3B8", fontSize: "0.67rem",
                          textTransform: "capitalize" }}>
                          {STATUS_LABEL[k]}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
                      <div style={{
                        width: "16px", height: "16px", borderRadius: "50%",
                        border: "1.5px solid #94A3B8", flexShrink: 0,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        <div style={{ width: "6px", height: "6px",
                          borderRadius: "50%", background: "#94A3B8" }} />
                      </div>
                      <span style={{ color: "#64748B", fontSize: "0.67rem" }}>
                        765 kV substation
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
                      <div style={{ width: "10px", height: "10px",
                        borderRadius: "50%", background: "#94A3B8", flexShrink: 0 }} />
                      <span style={{ color: "#64748B", fontSize: "0.67rem" }}>
                        400 kV substation
                      </span>
                    </div>
                  </div>
                </div>

                <div style={{ height: "1px", background: "rgba(255,255,255,0.06)" }} />

                {/* Station list or detail */}
                <DetailPanel />
              </div>
            </div>

            {/* ── State legend footer ── */}
            <div style={{
              padding: "8px 20px",
              borderTop: "1px solid rgba(255,255,255,0.05)",
              display: "flex", gap: "14px", flexWrap: "wrap", alignItems: "center",
              flexShrink: 0,
            }}>
              <span style={{ color: "#475569", fontSize: "0.6rem",
                fontWeight: 700, textTransform: "uppercase" }}>
                States:
              </span>
              {STATES.map((st) => (
                <div key={st.id} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  <div style={{
                    width: "12px", height: "10px",
                    background: st.fill, border: `1px solid ${st.stroke}`,
                    borderRadius: "2px",
                  }} />
                  <span style={{ color: "#64748B", fontSize: "0.65rem" }}>
                    {st.label}
                  </span>
                </div>
              ))}
            </div>

          </div>
        </div>
      )}
    </>
  );
}
