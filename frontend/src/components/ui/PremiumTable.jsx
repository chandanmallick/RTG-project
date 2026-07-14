import { Paper } from "@mui/material";

export default function PremiumTable({
  children,
  maxHeight = "65vh",
}) {
  return (
    <Paper
      elevation={0}
      sx={{
        borderRadius: "var(--radius-xl)",
        overflow: "auto",
        maxHeight,
        backgroundColor: "var(--bg-card)",
        border: "1px solid var(--border-color)",
        boxShadow: "0 4px 20px rgba(13, 87, 183, 0.03)",

        "&::-webkit-scrollbar": {
          width: "10px",
          height: "10px",
        },
        "&::-webkit-scrollbar-thumb": {
          background: "var(--grid-blue)",
          borderRadius: "var(--radius-pill)",
        },
        "&::-webkit-scrollbar-track": {
          background: "var(--bg-surface)",
        },

        "& .MuiTableCell-head": {
          position: "sticky",
          top: 0,
          zIndex: 5,
          backgroundColor: "var(--bg-surface)",
          color: "var(--deep-navy)",
          fontWeight: "var(--font-weight-bold)",
          fontSize: "var(--font-body2)",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          borderBottom: "1px solid var(--border-color)",
          py: 1.5,
        },

        "& .MuiTableRow-root": {
          transition: "background 0.15s ease",
        },

        "& .MuiTableRow-root:hover": {
          backgroundColor: "rgba(13, 87, 183, 0.03)",
        },

        "& .MuiTableCell-root": {
          borderBottom: "1px solid #F1F5F9",
          py: 1.6,
          fontSize: "var(--font-body1)",
          fontWeight: "var(--font-weight-medium)",
          color: "var(--text-primary)",
        },
      }}
    >
      {children}
    </Paper>
  );
}
