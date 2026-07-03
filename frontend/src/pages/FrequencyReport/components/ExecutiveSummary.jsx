/**
 * ExecutiveSummary.jsx
 * Editable executive summary block for the Frequency Compliance Report.
 */
import React from "react";
import { FileText } from "lucide-react";
import SectionAccordion from "../../../components/ui/SectionAccordion";

export default function ExecutiveSummary({ value, onChange }) {
  return (
    <SectionAccordion
      title="1. Executive Summary & General Notes"
      subtitle="General description of the low frequency event and operational notes"
      defaultExpanded={true}
    >
      <div
        style={{
          background: "linear-gradient(180deg, #F8FBFF 0%, #FFFFFF 56px)",
          padding: "16px",
          borderRadius: "14px",
          border: "1px solid rgba(175, 196, 234, 0.72)",
          boxShadow: "0 8px 22px rgba(15, 111, 219, 0.055)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
          <FileText size={16} className="text-secondary" />
          <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#1E293B" }}>
            Report Executive Summary
          </span>
        </div>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={5}
          style={{
            width: "100%",
            border: "1px solid #AFC4EA",
            borderRadius: "12px",
            padding: "12px",
            fontSize: "0.78rem",
            color: "#334155",
            outline: "none",
            resize: "vertical",
            fontFamily: "inherit",
            lineHeight: "1.5",
          }}
          placeholder="Enter the general executive summary or notes about this low-frequency event. These notes will be embedded at the beginning of the exported reports..."
        />
        <div style={{ fontSize: "0.68rem", color: "#64748B", marginTop: "6px" }}>
          💡 This section is fully editable. Use it to specify the grid status, frequency values, and overall action points.
        </div>
      </div>
    </SectionAccordion>
  );
}
