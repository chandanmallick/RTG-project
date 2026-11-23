import { Box, Stack, Typography } from "@mui/material";
import { Check, Clock3, X } from "lucide-react";

export function leaveSteps(leave) {
  const terminal = ["Rejected", "Cancelled", "Withdrawn"].includes(leave.finalStatus);
  const chain = leave.approvalChain?.length ? leave.approvalChain : [
    { name: leave.firstApproverNames?.join(", ") || "Shift-in-Charge", status: leave.sicApprovalStatus, stage: "SIC" },
    { name: leave.finalApproverNames?.join(", ") || "Final authority", status: leave.deptApprovalStatus, stage: "DIC" },
  ];
  const steps = [{ name: "Application submitted", status: "Approved", actedOn: leave.createdOn }, ...chain.map((step, idx) => ({ ...step,
    name: step.name || step.names?.join(", ") || step.approverNames?.join(", ") || step.level || "Reporting authority",
    stage: step.stage || (idx === 0 ? "SIC" : "DIC"),
  }))];
  const firstPending = steps.findIndex(step => !["Approved", "Forwarded", "Not Applicable"].includes(step.status));
  return steps.map((step, index) => {
    const repDecision = index === 0 ? null : (leave.replacementDecisionHistory || []).find((d) => {
      if (step.stage && String(d.stage).toUpperCase() === String(step.stage).toUpperCase()) return true;
      if (step.level && String(d.stage).toLowerCase() === String(step.level).toLowerCase()) return true;
      if (d.decidedBy && step.actedBy && String(d.decidedBy) === String(step.actedBy)) return true;
      if (index === 1 && String(d.stage).toUpperCase() === "SIC") return true;
      if (index === 2 && String(d.stage).toUpperCase() === "DIC") return true;
      return false;
    });
    return { ...step,
      completed: ["Approved", "Forwarded", "Not Applicable"].includes(step.status) || (!terminal && leave.finalStatus === "Approved"),
      current: !terminal && index === firstPending,
      stopped: terminal && index === firstPending,
      repDecision,
    };
  });
}

export default function LeaveProgress({ leave, compact = false }) {
  const steps = leaveSteps(leave);
  return <Stack direction={compact ? "row" : "column"} aria-label="Leave approval progress" sx={{ gap: compact ? 0 : 2.5, overflowX: compact ? "auto" : undefined, py: compact ? 1.2 : 2 }}>
    {steps.map((step, index) => {
      const color = step.completed ? "#16A77A" : step.stopped ? "#D56376" : step.current ? "#6355DB" : "#B0B7C8";
      return <Box key={index} sx={{ position: "relative", flex: compact ? 1 : undefined, minWidth: compact ? 115 : 0, pr: compact ? 1 : 0,
        "&:not(:last-child)::after": { content: '""', position: "absolute", bgcolor: step.completed ? "#79D7B5" : "#E2E3EE", ...(compact ? { height: 2, top: 15, left: 37, right: 6 } : { width: 2, left: 15, top: 37, height: "calc(100% - 11px)" }) } }}>
        <Stack direction={compact ? "column" : "row"} spacing={1.2} alignItems={compact ? "flex-start" : "center"}>
          <Box sx={{ width: 32, height: 32, flexShrink: 0, borderRadius: "50%", display: "grid", placeItems: "center", color: step.completed || step.current || step.stopped ? "white" : color, bgcolor: step.completed || step.current || step.stopped ? color : "#F1F2F7", boxShadow: step.current ? "0 0 0 5px #ECE9FE" : undefined }}>
            {step.completed ? <Check size={17} strokeWidth={3} /> : step.stopped ? <X size={16} /> : step.current ? <Clock3 size={16} /> : index + 1}
          </Box>
          <Box><Typography sx={{ fontSize: compact ? 10 : 10, color, fontWeight: 800, textTransform: "uppercase", letterSpacing: .8 }}>Step {index + 1} · {step.completed ? "Completed" : step.stopped ? leave.finalStatus : step.current ? "In progress" : "Upcoming"}</Typography>
            <Typography sx={{ fontSize: compact ? 11 : 14, mt: .3, fontWeight: 750, color: "#344057" }}>{step.name}</Typography>
            {!compact && <Typography sx={{ fontSize: 12, mt: .5, color: "#7B8498" }}>{step.level}{step.actedOn || step.approvedOn ? ` · ${new Date(step.actedOn || step.approvedOn).toLocaleString()}` : ""}{step.comment || step.reason ? ` · ${step.comment || step.reason}` : ""}{step.repDecision && <Box component="span" sx={{ ml: 0.5, fontWeight: 750, color: step.repDecision.required ? "#D97706" : "#475569" }}>{` · Replacement: ${step.repDecision.required ? "Required" : "Not required"}${step.repDecision.decidedByName ? ` (by ${step.repDecision.decidedByName})` : ""}`}</Box>}</Typography>}
          </Box>
        </Stack>
      </Box>;
    })}
  </Stack>;
}
