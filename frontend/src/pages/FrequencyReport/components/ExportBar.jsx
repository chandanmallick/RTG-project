/**
 * ExportBar.jsx
 * Export options toolbar with status animations.
 */
import React from "react";
import { Download, FileText, Loader2 } from "lucide-react";

export default function ExportBar({
  onExportPdf,
  onExportDocx,
  onExportExcel,
  onExportHtml,
  exportingPdf,
  exportingDocx,
  exportingExcel,
  exportingHtml,
  disabled,
}) {
  const barStyle = {
    display: "flex",
    gap: "12px",
    alignItems: "center",
    justifyContent: "flex-end",
    padding: "12px 16px",
    background: "linear-gradient(135deg, #EEF5FF 0%, #F8FBFF 100%)",
    borderRadius: "14px",
    border: "1px solid rgba(175, 196, 234, 0.72)",
    marginBottom: "16px",
    boxShadow: "0 8px 22px rgba(15, 111, 219, 0.055)",
  };

  const btnStyle = (bg, hoverBg, textColor) => ({
    display: "flex",
    alignItems: "center",
    gap: "8px",
    background: bg,
    border: "none",
    borderRadius: "12px",
    padding: "8px 16px",
    fontWeight: "700",
    fontSize: "0.8rem",
    color: textColor,
    cursor: disabled ? "not-allowed" : "pointer",
    transition: "all 0.15s ease",
    opacity: disabled ? 0.6 : 1,
    boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
  });

  return (
    <div style={barStyle}>
      <span style={{ fontSize: "0.74rem", color: "#64748B", fontWeight: 600, marginRight: "auto" }}>
        📊 Export final deviation reports:
      </span>

      {/* Excel Sheet */}
      <button
        onClick={onExportHtml}
        disabled={disabled || exportingHtml}
        style={btnStyle("#7C3AED", "#6D28D9", "#FFFFFF")}
        onMouseEnter={(e) => {
          if (!disabled) e.currentTarget.style.background = "#6D28D9";
        }}
        onMouseLeave={(e) => {
          if (!disabled) e.currentTarget.style.background = "#7C3AED";
        }}
      >
        {exportingHtml ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <Download size={14} />
        )}
        {exportingHtml ? "Preparing HTML..." : "HTML Charts"}
      </button>

      {/* Excel Sheet */}
      <button
        onClick={onExportExcel}
        disabled={disabled || exportingExcel}
        style={btnStyle("#10B981", "#059669", "#FFFFFF")}
        onMouseEnter={(e) => {
          if (!disabled) e.currentTarget.style.background = "#059669";
        }}
        onMouseLeave={(e) => {
          if (!disabled) e.currentTarget.style.background = "#10B981";
        }}
      >
        {exportingExcel ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <Download size={14} />
        )}
        {exportingExcel ? "Exporting Excel..." : "Export Excel"}
      </button>

      {/* Word Document */}
      <button
        onClick={onExportDocx}
        disabled={disabled || exportingDocx}
        style={btnStyle("#3B82F6", "#2563EB", "#FFFFFF")}
        onMouseEnter={(e) => {
          if (!disabled) e.currentTarget.style.background = "#2563EB";
        }}
        onMouseLeave={(e) => {
          if (!disabled) e.currentTarget.style.background = "#3B82F6";
        }}
      >
        {exportingDocx ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <FileText size={14} />
        )}
        {exportingDocx ? "Exporting Word..." : "Export Word (Docx)"}
      </button>

      {/* PDF Report */}
      <button
        onClick={onExportPdf}
        disabled={disabled || exportingPdf}
        style={btnStyle("#EF4444", "#DC2626", "#FFFFFF")}
        onMouseEnter={(e) => {
          if (!disabled) e.currentTarget.style.background = "#DC2626";
        }}
        onMouseLeave={(e) => {
          if (!disabled) e.currentTarget.style.background = "#EF4444";
        }}
      >
        {exportingPdf ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <FileText size={14} />
        )}
        {exportingPdf ? "Exporting PDF..." : "Export PDF"}
      </button>
    </div>
  );
}
