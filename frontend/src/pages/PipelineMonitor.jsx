import { useEffect, useState } from "react";

import axios from "axios";

import {
  Box,
  Typography,
  Chip,
  Dialog,
  DialogContent,
  IconButton,
  Tabs,
  Tab,
  Divider,
} from "@mui/material";

import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Database,
  RefreshCcw,
  Radio,
} from "lucide-react";

import AppShell from "../components/layout/AppShell";

import GlassCard from "../components/ui/GlassCard";

import GradientButton from "../components/ui/GradientButton";

import CloseRoundedIcon from "@mui/icons-material/CloseRounded";

import VisibilityRoundedIcon from "@mui/icons-material/VisibilityRounded";

const API =
  `http://${window.location.hostname}:8001/api`;

export default function PipelineMonitor() {

  const [pipelines, setPipelines] =
    useState([]);

  const [loading, setLoading] =
    useState(false);

    const [selectedPipeline, setSelectedPipeline] =
  useState(null);

    const [openLogs, setOpenLogs] =
    useState(false);

    const [pipelineLogs, setPipelineLogs] =
    useState([]);

    const [tab, setTab] =
    useState(0);

  const fetchStatus = async () => {

    try {

      setLoading(true);

      const res = await axios.get(
        `${API}/pipeline/status`
      );

      setPipelines(res.data.data);

    } catch (err) {

      console.error(err);

    } finally {

      setLoading(false);
    }
  };

  

  const rtgPushLog = pipelineLogs
    .filter(
      (log) =>
        log.process === "RTG_PUSH" &&
        log.response_data &&
        (
          log.response_data.success_plants ||
          log.response_data.failed_plants
        )
    )
    .sort(
      (a, b) =>
        new Date(b.created_at) -
        new Date(a.created_at)
    )[0];

  console.log(
    "SELECTED PIPELINE",
    selectedPipeline
  );

  console.log(
    "RTG PUSH LOG",
    rtgPushLog
  );

  const scheduleStatusData = [

    ...(rtgPushLog?.response_data?.success_plants || [])
      .map(item => ({

        plant_name: item.plant_name,

        plant_id: item.plant_id,

        status: "SUCCESS",

        details:
          item.rtg_response
            ? JSON.stringify(item.rtg_response)
            : "Success"

      })),

    ...(rtgPushLog?.response_data?.failed_plants || [])
      .map(item => ({

        plant_name: item.plant_name,

        plant_id: item.plant_id,

        status: "FAILED",

        details:
          item.error || "Unknown Error"

      }))

  ];

  const outageStatusData = [

    ...(rtgPushLog?.response_data?.success_plants || [])
      .map(item => ({

        plant_name: item.plant_name,

        plant_id: item.plant_id,

        status: "SUCCESS",

        details: "Outage pushed successfully"

      })),

    ...(rtgPushLog?.response_data?.failed_plants || [])
      .map(item => ({

        plant_name: item.plant_name,

        plant_id: item.plant_id,

        status: "FAILED",

        details:
          item.error || "Unknown Error"

      }))

  ];

  const outageTableData =
    Array.isArray(
      rtgPushLog?.payload
    )
      ? rtgPushLog.payload
      : [];

  const scheduleTableData =

  selectedPipeline?.pipeline ===
  "SCHEDULE"

  ? (

    rtgPushLog?.payload || []

  ).map(item => ({

    plant_name:
      item.plant_name || "",

    plant_id:
      item.plant_id || "",

    dc_avg:

      Array.isArray(item.dc)

        ? Math.round(

            item.dc.reduce(
              (a,b)=>a+b,
              0
            ) / Math.max(
              item.dc.length,
              1
            )

          )

        : 0,

    schedule_avg:

      Array.isArray(
        item.schedule
      )

        ? Math.round(

            item.schedule.reduce(
              (a,b)=>a+b,
              0
            ) / Math.max(
              item.schedule.length,
              1
            )

          )

        : 0,

    qsold_avg:

      Array.isArray(
        item.qsold
      )

        ? Math.round(

            item.qsold.reduce(
              (a,b)=>a+b,
              0
            ) / Math.max(
              item.qsold.length,
              1
            )

          )

        : 0,

    data_date:
      item.data_date || ""

  }))

  : [];

  const triggerPipeline = async (
    type
    ) => {

    try {

        await axios.post(

        `${API}/pipeline/run/${type}`
        );

        fetchStatus();

    } catch (err) {

        console.error(err);
    }
    };

    const fetchLogs = async (
        revisionId,
        pipeline
        ) => {

        try {

            const res = await axios.get(

            `${API}/pipeline/logs/${pipeline.pipeline}/${revisionId}`
            );

            setPipelineLogs(
            res.data.logs || []
            );

            console.log(
              "OUTAGE LOGS",
              res.data.logs
            );

            setSelectedPipeline(
            pipeline
            );

            setOpenLogs(true);

        } catch (err) {

            console.error(err);
        }
        };

  useEffect(() => {

    fetchStatus();

    const interval =
      setInterval(
        fetchStatus,
        30000
      );

    return () =>
      clearInterval(interval);

  }, []);

  const renderAutoTable = (
    data
  ) => {

    if (
      !data ||
      !data.length
    )
      return (

        <Typography>
          No Data Available
        </Typography>

      );

    const columns =
      Object.keys(data[0]);

    return (

      <Box
        sx={{

          maxHeight: 520,

          overflow: "auto",

          borderRadius: "18px",

          border:
            "1px solid rgba(0,0,0,0.06)",

          background: "#fff"
        }}
      >

        <table
          style={{

            width: "100%",

            borderCollapse:
              "separate",

            borderSpacing: 0,
          }}
        >

          <thead>

            <tr>

              {columns.map(col => (

                <th
                  key={col}

                  style={{

                    position:
                      "sticky",

                    top: 0,

                    zIndex: 10,

                    background:
                      "#f8faff",

                    padding:
                      "14px 16px",

                    textAlign:
                      "left",

                    fontWeight: 700,

                    fontSize: 13,

                    color:
                      "#334155",

                    borderBottom:
                      "1px solid rgba(0,0,0,0.08)"
                  }}
                >

                  {

                    col
                      .replaceAll(
                        "_",
                        " "
                      )
                      .toUpperCase()

                  }

                </th>

              ))}

            </tr>

          </thead>

          <tbody>

            {data.map(
              (
                row,
                index
              ) => (

                <tr
                  key={index}
                >

                  {columns.map(col => {

                    if (col === "status") {

                      return (

                        <td
                          key={col}
                          style={{

                            padding: "12px 16px",

                            borderBottom:
                              "1px solid rgba(0,0,0,0.05)",

                            fontSize: 13,

                            fontWeight: 700,

                            color:

                              row[col] === "SUCCESS"

                                ? "#16a34a"

                                : "#dc2626",

                            whiteSpace: "nowrap"
                          }}
                        >

                          {row[col]}

                        </td>

                      );
                    }

                    return (

                      <td
                        key={col}

                        style={{

                          padding: "12px 16px",

                          borderBottom:
                            "1px solid rgba(0,0,0,0.05)",

                          fontSize: 13,

                          color: "#475569",

                          whiteSpace: "nowrap"
                        }}
                      >

                        {

                          typeof row[col]
                          === "object"

                          ? JSON.stringify(
                              row[col]
                            )

                          : String(
                              row[col]
                            )

                        }

                      </td>

                    );

                  })}

                </tr>

              )
            )}

          </tbody>

        </table>

      </Box>

    );
  };

  return (

    <AppShell>

      <Box
        sx={{
          p: 3.5,
        }}
      >

        {/* HERO */}

        <GlassCard
          sx={{

            p: 4,

            mb: 4,

            position: "relative",

            overflow: "hidden",

            background:
              "linear-gradient(135deg,rgba(108,99,255,0.16),rgba(255,255,255,0.75))",
          }}
        >

          {/* GLOW */}

          <Box
            sx={{

              position: "absolute",

              top: -120,
              right: -120,

              width: 280,
              height: 280,

              borderRadius: "50%",

              background:
                "radial-gradient(circle,rgba(108,99,255,0.22),transparent 70%)",
            }}
          />

          <Box
            sx={{

              display: "flex",

              alignItems: "center",

              justifyContent:
                "space-between",

              flexWrap: "wrap",

              gap: 3,

              position: "relative",

              zIndex: 2,
            }}
          >

            {/* LEFT */}

            <Box>

              <Typography
                sx={{

                  fontSize: 34,

                  fontWeight: 800,

                  color: "#1e1b39",

                  letterSpacing: "-0.05em",
                }}
              >
                Pipeline Monitor
              </Typography>

              <Typography
                sx={{

                  mt: 1,

                  color: "#6b7280",

                  fontSize: 15,
                }}
              >
                Enterprise RTG pipeline orchestration
                & realtime monitoring center
              </Typography>

            </Box>

            {/* RIGHT */}

            <GradientButton
              onClick={fetchStatus}
              icon={
                <RefreshCcw size={18} />
              }
            >
              Refresh Status
            </GradientButton>

          </Box>

          {/* METRICS */}

          <Box
            sx={{

              display: "grid",

              gridTemplateColumns:
                "repeat(auto-fit,minmax(220px,1fr))",

              gap: 2,

              mt: 4,

              position: "relative",

              zIndex: 2,
            }}
          >

            <GlassCard
              sx={{
                p: 2.5,
              }}
            >

              <Typography
                sx={{
                  color: "#7b8199",
                  fontSize: 13,
                }}
              >
                Active Pipelines
              </Typography>

              <Typography
                sx={{

                  fontSize: 34,

                  fontWeight: 800,

                  mt: 1,

                  color: "#1e1b39",
                }}
              >
                {pipelines.length}
              </Typography>

            </GlassCard>

            <GlassCard
              sx={{
                p: 2.5,
              }}
            >

              <Typography
                sx={{
                  color: "#7b8199",
                  fontSize: 13,
                }}
              >
                Healthy Pipelines
              </Typography>

              <Typography
                sx={{

                  fontSize: 34,

                  fontWeight: 800,

                  mt: 1,

                  color: "#10b981",
                }}
              >
                {
                  pipelines.filter(
                    (p) =>
                      p.last_status
                      === "SUCCESS"
                  ).length
                }
              </Typography>

            </GlassCard>

            <GlassCard
              sx={{
                p: 2.5,
              }}
            >

              <Typography
                sx={{
                  color: "#7b8199",
                  fontSize: 13,
                }}
              >
                Failed Pipelines
              </Typography>

              <Typography
                sx={{

                  fontSize: 34,

                  fontWeight: 800,

                  mt: 1,

                  color: "#ef4444",
                }}
              >
                {
                  pipelines.filter(
                    (p) =>
                      p.last_status
                      === "FAILED"
                  ).length
                }
              </Typography>

            </GlassCard>

          </Box>

        </GlassCard>

        {/* PIPELINE GRID */}

        <Box
          sx={{

            display: "grid",

            gridTemplateColumns:
              "repeat(auto-fit,minmax(420px,1fr))",

            gap: 3,
          }}
        >

          {pipelines.map((item) => {

            const success =
              item.last_status
              === "SUCCESS";

            return (

              <GlassCard
                key={item.pipeline}
                sx={{

                  p: 3,

                  position: "relative",

                  overflow: "hidden",

                  minHeight: 300,
                }}
              >

                {/* GLOW */}

                <Box
                  sx={{

                    position: "absolute",

                    top: -80,
                    right: -80,

                    width: 220,
                    height: 220,

                    borderRadius: "50%",

                    background: success

                      ? "radial-gradient(circle,rgba(16,185,129,0.16),transparent 70%)"

                      : "radial-gradient(circle,rgba(239,68,68,0.16),transparent 70%)",
                  }}
                />

                {/* HEADER */}

                <Box
                  sx={{

                    display: "flex",

                    justifyContent:
                      "space-between",

                    alignItems: "center",

                    position: "relative",

                    zIndex: 2,
                  }}
                >

                  <Box
                    sx={{

                      display: "flex",

                      alignItems: "center",

                      gap: 2,
                    }}
                  >

                    <Box
                      sx={{

                        width: 62,
                        height: 62,

                        borderRadius: "22px",

                        background: success

                          ? "linear-gradient(135deg,#10b981,#34d399)"

                          : "linear-gradient(135deg,#ef4444,#f87171)",

                        display: "flex",

                        alignItems: "center",

                        justifyContent: "center",

                        color: "#fff",

                        boxShadow: success

                          ? "0 18px 40px rgba(16,185,129,0.34)"

                          : "0 18px 40px rgba(239,68,68,0.28)",
                      }}
                    >

                      {success ? (
                        <CheckCircle2 />
                      ) : (
                        <AlertTriangle />
                      )}

                    </Box>

                    <Box>

                      <Typography
                        sx={{

                          fontSize: 24,

                          fontWeight: 800,

                          color: "#1e1b39",
                        }}
                      >
                        {item.pipeline}
                      </Typography>

                      <Typography
                        sx={{

                          fontSize: 13,

                          color: "#7b8199",
                        }}
                      >
                        Realtime Monitoring
                      </Typography>

                    </Box>

                  </Box>

                  <Chip
                    label={
                      item.last_status
                    }

                    sx={{

                      background: success

                        ? "rgba(16,185,129,0.12)"

                        : "rgba(239,68,68,0.12)",

                      color: success

                        ? "#10b981"

                        : "#ef4444",

                      fontWeight: 700,
                    }}
                  />

                </Box>

                {/* LIVE */}

                <Box
                  sx={{

                    mt: 3,

                    display: "flex",

                    alignItems: "center",

                    gap: 1,
                  }}
                >

                  <Radio
                    size={16}

                    color={
                      success
                        ? "#10b981"
                        : "#ef4444"
                    }
                  />

                  <Typography
                    sx={{

                      fontSize: 13,

                      fontWeight: 600,

                      color: success

                        ? "#10b981"

                        : "#ef4444",
                    }}
                  >
                    LIVE PIPELINE STATUS
                  </Typography>

                </Box>

                {/* DETAILS */}

                <Box
                  sx={{

                    mt: 4,

                    display: "flex",

                    flexDirection: "column",

                    gap: 2.2,
                  }}
                >

                  <Row
                    icon={<Activity size={16} />}
                    label="Last Process"
                    value={item.last_process}
                  />

                  <Row
                    icon={<Database size={16} />}
                    label="Revision ID"
                    value={item.revision_id}
                  />

                  <Row
                    icon={<Clock3 size={16} />}
                    label="Last Trigger"
                    value={
                      item.last_trigger

                        ? new Date(
                            item.last_trigger
                          ).toLocaleString()

                        : "-"
                    }
                  />

                </Box>

                {/* MESSAGE */}

                {/* EXECUTION SUMMARY */}

                <Box
                sx={{

                    mt: 3,

                    display: "grid",

                    gridTemplateColumns:
                    "repeat(3,1fr)",

                    gap: 1.5,
                }}
                >

                <GlassCard
                    sx={{
                    p: 1.8,
                    textAlign: "center",
                    }}
                >

                    <Typography
                    sx={{
                        fontSize: 11,
                        color: "#7b8199",
                    }}
                    >
                    Success
                    </Typography>

                    <Typography
                    sx={{

                        mt: 0.5,

                        fontSize: 24,

                        fontWeight: 800,

                        color: "#10b981",
                    }}
                    >
                    {
                        item.success_count || 0
                    }
                    </Typography>

                </GlassCard>

                <GlassCard
                    sx={{
                    p: 1.8,
                    textAlign: "center",
                    }}
                >

                    <Typography
                    sx={{
                        fontSize: 11,
                        color: "#7b8199",
                    }}
                    >
                    Failed
                    </Typography>

                    <Typography
                    sx={{

                        mt: 0.5,

                        fontSize: 24,

                        fontWeight: 800,

                        color: "#ef4444",
                    }}
                    >
                    {
                        item.failed_count || 0
                    }
                    </Typography>

                </GlassCard>

                <GlassCard
                    sx={{
                    p: 1.8,
                    textAlign: "center",
                    }}
                >

                    <Typography
                    sx={{
                        fontSize: 11,
                        color: "#7b8199",
                    }}
                    >
                    Health
                    </Typography>

                    <Typography
                    sx={{

                        mt: 0.5,

                        fontSize: 18,

                        fontWeight: 800,

                        color:

                        item.success_percentage >= 60

                            ? "#10b981"

                            : "#ef4444",
                    }}
                    >

                    {

                        item.success_percentage >= 60

                        ? "Healthy"

                        : "Critical"
                    }

                    </Typography>

                </GlassCard>

                </Box>

                {/* TRIGGER BUTTON */}

                <GradientButton

                onClick={() =>
                    triggerPipeline(
                    item.pipeline.toLowerCase()
                    )
                }

                sx={{

                    mt: 3,

                    width: "100%",
                }}
                >

                Trigger Pipeline

                </GradientButton>

                <GradientButton

                    onClick={() =>
                        fetchLogs(
                        item.revision_id,
                        item
                        )
                    }

                    icon={
                        <VisibilityRoundedIcon />
                    }

                    sx={{

                        mt: 2,

                        width: "100%",

                        background:
                        "rgba(255,255,255,0.75)",

                        color: "#1e1b39",
                    }}
                    >

                    View Execution Details

                    </GradientButton>

              </GlassCard>
            );
          })}
        </Box>

      </Box>

      <Dialog
            open={openLogs}
            onClose={() => setOpenLogs(false)}
            maxWidth="lg"
            fullWidth
            PaperProps={{
                sx: {

                borderRadius: "34px",

                background:
                    "linear-gradient(135deg,#f1f7f6,#ffffff)",

                overflow: "hidden",

                border:
                    "1px solid rgba(255,255,255,0.5)",

                boxShadow:
                    "0 30px 80px rgba(3,98,76,0.2)",
                },
            }}
            >

            <DialogContent
                sx={{
                p: 0,
                }}
            >

                {/* HEADER */}

                <Box
                sx={{

                    p: 4,

                    background:
                    "linear-gradient(135deg,#03624C,#17876D)",

                    color: "white",

                    position: "relative",
                }}
                >

                <Box
                    sx={{

                    display: "flex",

                    justifyContent:
                        "space-between",

                    alignItems: "center",
                    }}
                >

                    <Box>

                    <Typography
                        sx={{

                        fontSize: 28,

                        fontWeight: 800,
                        }}
                    >
                        Pipeline Execution
                    </Typography>

                    <Typography
                        sx={{

                        opacity: 0.8,

                        mt: 1,
                        }}
                    >
                        Enterprise monitoring diagnostics
                    </Typography>

                    </Box>

                    <IconButton
                    onClick={() =>
                        setOpenLogs(false)
                    }
                    sx={{
                        color: "white",
                    }}
                    >
                    <CloseRoundedIcon />
                    </IconButton>

                </Box>

                </Box>

                {/* BODY */}

                <Box
                sx={{
                    p: 4,
                }}
                >

                <Tabs
                  value={tab}
                  onChange={(e,val)=>
                    setTab(val)
                  }
                >

                  <Tab
                    label="Summary"
                  />

                  <Tab
                    label="Last Push Data"
                  />

                  <Tab label="PLANT STATUS" />

                  <Tab
                    label="Traceback"
                  />

                </Tabs>

                {/* SUMMARY */}

                {tab === 0 && (

                  <GlassCard
                    sx={{
                      p: 3,
                    }}
                  >

                    <Typography
                      variant="h6"
                      fontWeight={700}
                    >
                      Execution Summary
                    </Typography>

                    <Box mt={3}>

                      <Typography>

                        Success Plants :

                        {
                          rtgPushLog?.response_data?.success_plants?.length
                          ??
                          rtgPushLog?.response_data?.success_count
                          ??
                          0
                        }

                      </Typography>

                      <Typography mt={1}>

                        Failed Plants :

                        {
                          rtgPushLog?.response_data?.failed_plants?.length
                          ??
                          rtgPushLog?.response_data?.failure_count
                          ??
                          0
                        }

                      </Typography>

                      <Typography mt={1}>

                        Pipeline :

                        {

                          selectedPipeline
                            ?.pipeline

                        }

                      </Typography>

                      <Typography mt={1}>

                        Status :

                        {

                          rtgPushLog
                            ?.status

                        }

                      </Typography>

                    </Box>

                  </GlassCard>

                )}

                {/* LAST PUSH DATA */}

                {tab === 1 && (

                  <GlassCard
                    sx={{
                      p: 3,
                    }}
                  >

                    <Typography
                      sx={{
                        mb: 2,
                        fontWeight: 700,
                      }}
                    >

                      {

                        selectedPipeline?.pipeline

                      } Last Push Data

                    </Typography>

                    {

                      renderAutoTable(

                        selectedPipeline?.pipeline ===
                        "SCHEDULE"

                          ? scheduleStatusData

                          : outageStatusData

                      )

                    }

                  </GlassCard>

                )}

                {tab === 2 && (

                  <GlassCard
                    sx={{
                      p: 3,
                    }}
                  >

                    <Typography
                      sx={{
                        mb: 2,
                        fontWeight: 700,
                      }}
                    >
                      Failed Plants
                    </Typography>

                    {

                      renderAutoTable(

                        rtgPushLog
                          ?.response_data
                          ?.failed_plants || []

                      )

                    }

                  </GlassCard>

                )}

                {/* TRACEBACK */}

                {tab === 3 && (

                  <GlassCard
                    sx={{
                      p: 3,
                    }}
                  >

                    <Typography
                      sx={{
                        mb: 2,
                        fontWeight: 700,
                      }}
                    >
                      Python Traceback
                    </Typography>

                    <Box
                      sx={{

                        background:
                          "#111827",

                        color:
                          "#f9fafb",

                        p: 2,

                        borderRadius:
                          "18px",

                        overflow:
                          "auto",
                      }}
                    >

                      <pre>

                        {

                          pipelineLogs.find(
                            x => x.traceback_error
                          )?.traceback_error

                          ||

                          "No Traceback"

                        }

                      </pre>

                    </Box>

                  </GlassCard>

                )}

                </Box>

            </DialogContent>

            </Dialog>

    </AppShell>

    

    
  );
}

/* ROW */

function Row({
  icon,
  label,
  value,
}) {

  return (

    <Box
      sx={{

        display: "flex",

        alignItems: "center",

        justifyContent:
          "space-between",
      }}
    >

      <Box
        sx={{

          display: "flex",

          alignItems: "center",

          gap: 1,

          color: "#7b8199",
        }}
      >
        {icon}

        <Typography
          sx={{
            fontSize: 14,
          }}
        >
          {label}
        </Typography>

      </Box>

      <Typography
        sx={{

          fontWeight: 700,

          color: "#1e1b39",

          fontSize: 14,
        }}
      >
        {value}
      </Typography>

    </Box>
  );
}