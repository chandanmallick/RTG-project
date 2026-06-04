import { Paper } from "@mui/material";

export default function PremiumTable({
  children,
  maxHeight = "65vh",
}) {
  return (
    <Paper
      sx={{
        borderRadius: "28px",

        overflow: "auto",

        maxHeight,

        background: "rgba(255,255,255,0.72)",

        backdropFilter: "blur(22px)",

        border:
          "1px solid rgba(255,255,255,0.8)",

        boxShadow:
          "0 15px 40px rgba(15,23,42,0.06)",

        "&::-webkit-scrollbar": {
          width: "10px",
          height: "10px",
        },

        "&::-webkit-scrollbar-thumb": {
          background: "#AACBC4",
          borderRadius: "999px",
        },

        "&::-webkit-scrollbar-track": {
          background: "#F1F7F6",
        },

        "& .MuiTableCell-head": {
          position: "sticky",
          top: 0,

          zIndex: 5,

          background:
            "rgba(248,250,255,0.94)",

          backdropFilter: "blur(14px)",

          color: "#0B453A",

          fontWeight: 800,

          borderBottom:
            "1px solid #E5E7EB",
        },

        "& .MuiTableRow-root": {
          transition: ".18s ease",
        },

        "& .MuiTableRow-root:hover": {
          background:
            "rgba(0, 223, 129, 0.03)",
        },

        "& .MuiTableCell-root": {
          borderBottom:
            "1px solid #F1F5F9",

          py: 1.6,
        },
      }}
    >
      {children}
    </Paper>
  );
}