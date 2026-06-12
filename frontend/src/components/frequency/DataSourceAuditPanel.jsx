import React from "react";
import { ChevronDown, ChevronUp, Database, PencilLine } from "lucide-react";
import SourceStatusCell from "./SourceStatusCell";

const normalizeSelectedSource = (value) => {
  if (value === "SCADA") return "SCADA File";
  return value || "";
};

export default function DataSourceAuditPanel({
  rows = [],
  open = false,
  onToggle = () => {},
  onEditRow = () => {},
}) {
  if (!rows.length) return null;

  return (
    <section
      style={{
        background: "#FFFFFF",
        border: "1px solid #DDE7F0",
        borderRadius: "8px",
        marginBottom: "20px",
        overflow: "hidden",
        boxShadow: "0 8px 24px rgba(15, 23, 42, 0.06)",
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: "100%",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "14px 18px",
          background: "linear-gradient(90deg, #ECFDF5 0%, #EFF6FF 55%, #FFF7ED 100%)",
          border: "none",
          borderBottom: open ? "1px solid #DDE7F0" : "none",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span
            style={{
              width: 34,
              height: 34,
              borderRadius: "8px",
              background: "#FFFFFF",
              color: "#03624C",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              border: "1px solid rgba(3, 98, 76, 0.18)",
            }}
          >
            <Database size={17} />
          </span>
          <div>
            <h3 style={{ margin: 0, fontSize: "0.88rem", fontWeight: 900, color: "#0F172A" }}>
              Data Source Audit Panel
            </h3>
            <p style={{ margin: "2px 0 0", fontSize: "0.7rem", color: "#475569" }}>
              Review RTG, WBES, and SCADA-file availability for each plant before editing raw data.
            </p>
          </div>
        </div>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: "#334155", fontSize: "0.74rem", fontWeight: 800 }}>
          {open ? "Collapse" : "Expand"}
          {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </span>
      </button>

      {open && (
        <div style={{ padding: "16px 18px 18px" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.76rem", minWidth: "1180px" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #E2E8F0", textAlign: "left" }}>
                  <th style={{ padding: "9px 10px", color: "#475569", fontWeight: 800 }}>Plant Name</th>
                  <th style={{ padding: "9px 10px", color: "#475569", fontWeight: 800 }}>Type</th>
                  <th style={{ padding: "9px 10px", color: "#475569", fontWeight: 800 }}>Actual Status</th>
                  <th style={{ padding: "9px 10px", color: "#475569", fontWeight: 800 }}>Schedule Status</th>
                  <th style={{ padding: "9px 10px", color: "#475569", fontWeight: 800 }}>DC Status</th>
                  <th style={{ padding: "9px 10px", color: "#475569", fontWeight: 800 }}>Identifier / Acronym</th>
                  <th style={{ padding: "9px 10px", color: "#475569", fontWeight: 800, textAlign: "right" }}>Data</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  const status = row.source_status || {};
                  return (
                    <tr
                      key={`${row.plant_id}-${row.stage_id || idx}`}
                      style={{
                        borderBottom: "1px solid #EEF2F7",
                        background: idx % 2 === 0 ? "#FFFFFF" : "#F8FAFC",
                      }}
                    >
                      <td style={{ padding: "10px", fontWeight: 800, color: "#0F172A" }}>{row.plant_name}</td>
                      <td style={{ padding: "10px", color: "#64748B" }}>{row.type || (row.is_state ? "State" : "Generator")}</td>
                      <td style={{ padding: "10px" }}>
                        <SourceStatusCell sources={status.actual} selected={normalizeSelectedSource(row.actual_source || "RTG")} />
                      </td>
                      <td style={{ padding: "10px" }}>
                        <SourceStatusCell sources={status.schedule} selected={normalizeSelectedSource(row.sched_src || row.schedule_source || "RTG")} />
                      </td>
                      <td style={{ padding: "10px" }}>
                        <SourceStatusCell sources={status.dc} selected={normalizeSelectedSource(row.dc_src || row.dc_source || "RTG")} />
                      </td>
                      <td style={{ padding: "10px", color: "#475569", fontFamily: "monospace", fontSize: "0.7rem" }}>
                        RTG: {row.rtg_plant_id || row.plant_id || "-"} | WBES: {row.wbes_name || "-"}
                      </td>
                      <td style={{ padding: "10px", textAlign: "right" }}>
                        <button
                          type="button"
                          onClick={() => onEditRow(row)}
                          style={{
                            border: "1px solid #CBD5E1",
                            background: "#FFFFFF",
                            color: "#03624C",
                            borderRadius: "7px",
                            height: "30px",
                            padding: "0 10px",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            fontSize: "0.72rem",
                            fontWeight: 850,
                            cursor: "pointer",
                          }}
                        >
                          <PencilLine size={13} />
                          View / Edit
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
