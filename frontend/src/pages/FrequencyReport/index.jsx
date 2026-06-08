/**
 * FrequencyReport/index.jsx
 * Main entry point for the revamped Frequency Compliance Report Builder.
 */
import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import AppShell from "../../components/layout/AppShell";
import PlantMappingGrid from "../../components/PlantMappingGrid";
import API from "../../services/api";

// Sub-components
import ReportHeader from "./components/ReportHeader";
import ExecutiveSummary from "./components/ExecutiveSummary";
import StateComplianceTable from "./components/StateComplianceTable";
import GeneratorComplianceTable from "./components/GeneratorComplianceTable";
import ExportBar from "./components/ExportBar";
import ComplianceChart from "./components/ComplianceChart";

import { Table2, Settings2, FileUp, AlertTriangle } from "lucide-react";
import toast, { Toaster } from "react-hot-toast";

const today = () => new Date().toISOString().slice(0, 10);

const TABS = [
  { id: "report", label: "Frequency Report", icon: Table2 },
  { id: "mapping", label: "Plant Mapping", icon: Settings2 },
];

export default function FrequencyReport() {
  const [tab, setTab] = useState("report");
  const [startTime, setStartTime] = useState(today() + "T00:00");
  const [endTime, setEndTime] = useState(today() + "T23:59");
  
  const [rows, setRows] = useState([]);
  const [mapData, setMapData] = useState([]);
  const [mapLoading, setMapLoading] = useState(false);

  // RTG Portal Status
  const [rtgStatusOk, setRtgStatusOk] = useState(false);
  const [rtgStatusMsg, setRtgStatusMsg] = useState("");
  const [rtgStatusLoading, setRtgStatusLoading] = useState(false);

  // Data Loading indicators
  const [wbesLoaded, setWbesLoaded] = useState(false);
  const [rtgLoaded, setRtgLoaded] = useState(false);
  const [scadaLoaded, setScadaLoaded] = useState(false);
  const [scadaFile, setScadaFile] = useState(null);

  const [dataLoading, setDataLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Export indicator states
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingDocx, setExportingDocx] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);

  // Accordion details / Comments
  const [introDesc, setIntroDesc] = useState(
    "This report provides a comprehensive analysis of power system frequency and deviation compliance. Deviations are calculated as Actual minus Scheduled values. Statistical calculations are restricted to Low Frequency Operation periods (< 49.9 Hz)."
  );
  const [genDesc, setGenDesc] = useState(
    "Generator Module: Under injection (orange shade) and grid helping (green shade) compliance durations computed during Low Frequency periods (< 49.9 Hz)."
  );
  const [stateDesc, setStateDesc] = useState(
    "State Module: Over drawal (gold shade) and grid helping (cyan shade) compliance durations, along with Maximum Over Drawal (Max OD) magnitude and timestamps during low frequency grid states."
  );

  const [showSchAct, setShowSchAct] = useState(false);
  const [expandedRowId, setExpandedRowId] = useState(null);

  // Ref container to collect all ECharts instances for offscreen render/export
  const chartRefs = useRef({});
  const fileInputRef = useRef(null);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
    e.target.value = ""; // Reset value so same file can be selected again
  };

  /* ── Load plant mapping ── */
  const loadMapping = useCallback(async () => {
    setMapLoading(true);
    try {
      const res = await API.getFrequencyPlantMapping();
      setMapData(res?.data || []);
      
      // Populate report rows from mapping structure initially
      setRows((prev) => {
        if (prev.length > 0) return prev;
        return (res?.data || []).map((m) => ({
          plant_id: m.plant_id,
          stage_id: m.STAGE_ID,
          plant_name: m.plant_name || m.STAGE_NAME || "",
          state: m.state_name || "",
          fuel: m.fuel_type || "",
          owner: m.owner_name || "",
          capacity: m.stage_installed_capacity || m.installed_capacity || 0,
          schedule: 0.0,
          dc: 0.0,
          actual: null,
          deviation: null,
          pct_dc: null,
          sched_src: m.schedule_source || "RTG",
          dc_src: m.dc_source || "RTG",
          wbes_name: m.wbes_name || "",
          rtg_plant_id: m.rtg_plant_id || "",
          scada_key: m.scada_key || "",
          scada_header: m.scada_header || "",
          is_state: m.is_state || false,
          is_frequency: m.is_frequency || false,
          reason: "",
        }));
      });
    } catch (e) {
      console.error(e);
      toast.error("Failed to load plant mapping configuration");
    } finally {
      setMapLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMapping();
  }, [loadMapping]);

  /* ── Check RTG actual data status ── */
  useEffect(() => {
    let active = true;
    const checkStatus = async () => {
      setRtgStatusLoading(true);
      try {
        const res = await API.checkRtgStatus(startTime, endTime);
        if (active) {
          if (res?.success) {
            setRtgStatusOk(res.all_available);
            setRtgStatusMsg(res.message);
          } else {
            setRtgStatusOk(false);
            setRtgStatusMsg(res?.error ? `Error: ${res.error}` : "Error checking RTG status");
          }
        }
      } catch (err) {
        if (active) {
          setRtgStatusOk(false);
          setRtgStatusMsg("Failed to check RTG portal actuals status.");
        }
      } finally {
        if (active) setRtgStatusLoading(false);
      }
    };
    checkStatus();
    return () => {
      active = false;
    };
  }, [startTime, endTime]);

  /* ── Handle inline field changes ── */
  const updateRowField = (plantId, field, value) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.plant_id === plantId) {
          const updated = { ...r, [field]: value };
          if (field === "actual" || field === "schedule") {
            updated.deviation = (updated.actual ?? 0) - (updated.schedule ?? 0);
          }
          if (field === "actual" || field === "dc") {
            updated.pct_dc = updated.dc ? ((updated.actual ?? 0) / updated.dc) * 100 : 0.0;
          }
          return updated;
        }
        return r;
      })
    );
  };

  /* ── SCADA file selection ── */
  const handleFileSelect = async (file) => {
    setScadaFile(file);
    setScadaLoaded(true);
    setDataLoading(true);
    const loadingToast = toast.loading("Processing SCADA data file...");
    try {
      const res = await API.processFrequencyReport(startTime, endTime, rows, file);
      if (res?.success) {
        setRows(res.rows || []);
        setWbesLoaded(true);
        setRtgLoaded(true);
        toast.success("SCADA data loaded successfully", { id: loadingToast });
      } else {
        toast.error("Processing failed: " + (res?.error || "Unknown error"), { id: loadingToast });
        setScadaFile(null);
        setScadaLoaded(false);
      }
    } catch (err) {
      console.error(err);
      toast.error("Error processing SCADA file: " + err.message, { id: loadingToast });
      setScadaFile(null);
      setScadaLoaded(false);
    } finally {
      setDataLoading(false);
    }
  };

  /* ── Process/Recalculate report ── */
  const handleProcessReport = async () => {
    if (!scadaFile) {
      toast.error("Please upload a frequency Excel file first.");
      return;
    }
    setDataLoading(true);
    const loadingToast = toast.loading("Recalculating compliance statistics...");
    try {
      const res = await API.processFrequencyReport(startTime, endTime, rows, scadaFile);
      if (res?.success) {
        setRows(res.rows || []);
        setWbesLoaded(true);
        setRtgLoaded(true);
        setScadaLoaded(true);
        toast.success("Recalculation complete", { id: loadingToast });
      } else {
        toast.error("Processing failed: " + (res?.error || "Unknown error"), { id: loadingToast });
      }
    } catch (e) {
      console.error(e);
      toast.error("Error processing: " + e.message, { id: loadingToast });
    } finally {
      setDataLoading(false);
    }
  };

  /* ── Save mapping ── */
  const saveMapping = async (dirtyRows) => {
    setSaving(true);
    const saveToast = toast.loading("Saving configuration changes...");
    try {
      await API.saveFrequencyPlantMapping(dirtyRows);
      toast.success("Plant mapping updated", { id: saveToast });
      await loadMapping();
    } catch (e) {
      console.error(e);
      toast.error("Failed to save mapping changes", { id: saveToast });
    } finally {
      setSaving(false);
    }
  };

  /* ── Export handlers ── */
  const handleExportDocx = async () => {
    setExportingDocx(true);
    const expToast = toast.loading("Generating Word document...");
    try {
      // Gather base64 images from chartRefs for all entities that have series data
      const updatedRows = rows.map((row) => {
        const ref = chartRefs.current[row.plant_id];
        const plot_image = ref ? ref.getDataURL() : null;
        // Strip out metadata prefix for python base64 decoding
        const stripped_image = plot_image ? plot_image.replace(/^data:image\/png;base64,/, "") : null;
        return {
          ...row,
          plot_image: stripped_image,
        };
      });

      const payload = {
        intro_desc: introDesc,
        gen_desc: genDesc,
        state_desc: stateDesc,
        rows: updatedRows,
        start_time: startTime,
        end_time: endTime,
      };

      const blob = await API.downloadFrequencyDocx(payload);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `deviation_compliance_report_${startTime.replace(/:/g, "-")}.docx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Word report downloaded", { id: expToast });
    } catch (e) {
      console.error(e);
      toast.error("Error downloading Word report: " + e.message, { id: expToast });
    } finally {
      setExportingDocx(false);
    }
  };

  const handleExportPdf = async () => {
    setExportingPdf(true);
    const expToast = toast.loading("Generating PDF document...");
    try {
      // Gather base64 images from chartRefs
      const updatedRows = rows.map((row) => {
        const ref = chartRefs.current[row.plant_id];
        const plot_image = ref ? ref.getDataURL() : null;
        const stripped_image = plot_image ? plot_image.replace(/^data:image\/png;base64,/, "") : null;
        return {
          ...row,
          plot_image: stripped_image,
        };
      });

      const blob = await API.downloadFrequencyPdf({ rows: updatedRows });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `deviation_compliance_report_${startTime.replace(/:/g, "-")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("PDF report downloaded", { id: expToast });
    } catch (e) {
      console.error(e);
      toast.error("Error downloading PDF report: " + e.message, { id: expToast });
    } finally {
      setExportingPdf(false);
    }
  };

  const handleExportExcel = async () => {
    setExportingExcel(true);
    const expToast = toast.loading("Generating Excel workbook...");
    try {
      const payload = {
        executive_summary: introDesc,
        start_time: startTime,
        end_time: endTime,
        rows,
      };
      const blob = await API.downloadFrequencyExcel(payload);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `deviation_summary_report_${startTime.replace(/:/g, "-")}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Excel sheet downloaded", { id: expToast });
    } catch (e) {
      console.error(e);
      toast.error("Error downloading Excel summary: " + e.message, { id: expToast });
    } finally {
      setExportingExcel(false);
    }
  };

  const stateRows = useMemo(() => {
    return rows.filter((r) => r.is_state && !r.is_frequency);
  }, [rows]);

  const generatorRows = useMemo(() => {
    return rows.filter((r) => !r.is_state);
  }, [rows]);

  const toggleRowExpansion = (plantId) => {
    setExpandedRowId((prev) => (prev === plantId ? null : plantId));
  };

  return (
    <AppShell>
      <Toaster position="top-right" reverseOrder={false} />

      <ReportHeader
        startTime={startTime}
        setStartTime={setStartTime}
        endTime={endTime}
        setEndTime={setEndTime}
        rtgStatusMsg={rtgStatusMsg}
        rtgStatusOk={rtgStatusOk}
        rtgStatusLoading={rtgStatusLoading}
        wbesLoaded={wbesLoaded}
        rtgLoaded={rtgLoaded}
        scadaLoaded={scadaLoaded}
        scadaFile={scadaFile}
        onFileSelect={handleFileSelect}
        onUploadClick={handleUploadClick}
        onProcessReport={handleProcessReport}
        dataLoading={dataLoading}
        showSchAct={showSchAct}
        setShowSchAct={setShowSchAct}
      />

      {/* ── TABS SELECTOR ─────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          gap: "8px",
          marginBottom: "20px",
          borderBottom: "2px solid #E2E8F0",
        }}
      >
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 20px",
                border: "none",
                borderBottom: active ? "3px solid #03624C" : "3px solid transparent",
                marginBottom: "-2px",
                background: "none",
                fontWeight: active ? 800 : 600,
                fontSize: "0.84rem",
                color: active ? "#03624C" : "#64748B",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              <Icon size={14} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ── REPORT TAB ────────────────────────────────────────── */}
      {tab === "report" && (
        <div>
          {scadaLoaded ? (
            <>
              {/* Export Button Panel */}
              <ExportBar
                onExportPdf={handleExportPdf}
                onExportDocx={handleExportDocx}
                onExportExcel={handleExportExcel}
                exportingPdf={exportingPdf}
                exportingDocx={exportingDocx}
                exportingExcel={exportingExcel}
                disabled={dataLoading}
              />

              {/* 1. Executive Summary */}
              <ExecutiveSummary value={introDesc} onChange={setIntroDesc} />

              {/* 2. States Table */}
              <StateComplianceTable
                rows={stateRows}
                expandedRowId={expandedRowId}
                onToggleExpand={toggleRowExpansion}
                onUpdateRowField={updateRowField}
                stateDesc={stateDesc}
                onUpdateStateDesc={setStateDesc}
                showSchAct={showSchAct}
              />

              {/* 3. Generators Table */}
              <GeneratorComplianceTable
                rows={generatorRows}
                expandedRowId={expandedRowId}
                onToggleExpand={toggleRowExpansion}
                onUpdateRowField={updateRowField}
                genDesc={genDesc}
                onUpdateGenDesc={setGenDesc}
                showSchAct={showSchAct}
              />
            </>
          ) : (
            <div
              onClick={handleUploadClick}
              style={{
                background: "#FFFFFF",
                borderRadius: "16px",
                border: "1px dashed #CBD5E1",
                padding: "80px 40px",
                textAlign: "center",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "16px",
                boxShadow: "0 4px 12px rgba(0,0,0,0.02)",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "#6366F1";
                e.currentTarget.style.background = "#F8FAFC";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "#CBD5E1";
                e.currentTarget.style.background = "#FFFFFF";
              }}
            >
              <div
                style={{
                  width: "60px",
                  height: "60px",
                  borderRadius: "50%",
                  background: "rgba(99, 102, 241, 0.08)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#6366F1",
                }}
              >
                <FileUp size={28} />
              </div>
              <div>
                <h3 style={{ fontSize: "1rem", fontWeight: 800, color: "#1E293B", margin: "0 0 6px 0" }}>
                  Upload SCADA Data to Build Report
                </h3>
                <p style={{ fontSize: "0.8rem", color: "#64748B", margin: 0, maxWidth: "400px" }}>
                  To view deviation plots and compute low frequency grid compliance statistics, upload your operational Excel document.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── CONFIG / MAPPING TAB ──────────────────────────────── */}
      {tab === "mapping" && (
        <div style={{ background: "#FFFFFF", borderRadius: "16px", padding: "16px", border: "1px solid #E2E8F0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <div>
              <h2 style={{ fontSize: "0.95rem", fontWeight: 800, color: "#0F172A", margin: 0 }}>
                Plant and Source Mapping Settings
              </h2>
              <p style={{ fontSize: "0.74rem", color: "#64748B", margin: "2px 0 0" }}>
                Define acronym keys, SCADA column headers, and schedule retrieval sources for each grid node.
              </p>
            </div>
          </div>

          <PlantMappingGrid
            data={mapData}
            loading={mapLoading}
            onSave={saveMapping}
            maxHeight="60vh"
          />
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        style={{ display: "none" }}
        onChange={handleFileChange}
      />

      {/* ── HIDDEN CONTAINER FOR RENDERING ALL CHARTS TO DOM ── */}
      {/* This ensures we can get base64 data URLs for any collapsed row chart on Word/PDF export */}
      <div
        style={{
          position: "absolute",
          top: "-9999px",
          left: "-9999px",
          width: "900px",
          height: "450px",
          opacity: 0,
          pointerEvents: "none",
        }}
      >
        {rows.map((row) => (
          <div key={`hidden-chart-wrapper-${row.plant_id}`}>
            {row.series?.timestamps?.length > 0 && (
              <ComplianceChart
                ref={(el) => {
                  if (el) {
                    chartRefs.current[row.plant_id] = el;
                  } else {
                    delete chartRefs.current[row.plant_id];
                  }
                }}
                row={row}
                showSchAct={showSchAct}
                height={400}
              />
            )}
          </div>
        ))}
      </div>
    </AppShell>
  );
}
