import React from "react";
import { CheckCircle2, CircleDashed } from "lucide-react";

const palette = {
  RTG: { bg: "#ECFDF5", fg: "#047857", border: "#BBF7D0" },
  WBES: { bg: "#EFF6FF", fg: "#1D4ED8", border: "#BFDBFE" },
  "SCADA File": { bg: "#FFF7ED", fg: "#C2410C", border: "#FED7AA" },
  Manual: { bg: "#F8FAFC", fg: "#475569", border: "#CBD5E1" },
};

export default function SourceStatusCell({ sources = {}, selected = "" }) {
  const entries = Object.entries(sources);

  if (!entries.length) {
    return <span style={{ color: "#94A3B8", fontSize: "0.72rem" }}>No source status</span>;
  }

  return (
    <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
      {entries.map(([name, info = {}]) => {
        const active = selected === name || (!selected && info.available);
        const colors = palette[name] || palette.Manual;
        const available = !!info.available;

        return (
          <span
            key={name}
            title={`${name}: ${available ? `${info.points || 0} points across ${info.days || 0}/${info.total_days || 0} days` : "No data found"}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              minHeight: "22px",
              padding: "2px 7px",
              borderRadius: "999px",
              border: `1px solid ${active ? colors.border : "#E2E8F0"}`,
              background: available ? colors.bg : "#F8FAFC",
              color: available ? colors.fg : "#94A3B8",
              fontSize: "0.66rem",
              fontWeight: active ? 850 : 700,
              opacity: active || available ? 1 : 0.72,
              whiteSpace: "nowrap",
            }}
          >
            {available ? <CheckCircle2 size={12} /> : <CircleDashed size={12} />}
            {name}
          </span>
        );
      })}
    </div>
  );
}
