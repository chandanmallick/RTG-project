import { Paper } from "@mui/material";

export default function PremiumTable({
  children,
  maxHeight = "65vh",
}) {
  return (
    <Paper
      sx={{
        borderRadius: "16px",

        overflow: "auto",

        maxHeight,

        background: "linear-gradient(180deg, #F8FBFF 0%, #FFFFFF 56px)",

        border:
          "1px solid rgba(175, 196, 234, 0.72)",

        boxShadow:
          "0 12px 30px rgba(15, 111, 219, 0.07)",

        "&::-webkit-scrollbar": {
          width: "10px",
          height: "10px",
        },

        "&::-webkit-scrollbar-thumb": {
          background: "#AFC4EA",
          borderRadius: "999px",
        },

        "&::-webkit-scrollbar-track": {
          background: "#F7FAFF",
        },

        "& .MuiTableCell-head": {
          position: "sticky",
          top: 0,

          zIndex: 5,

          background:
            "#EAF1FF",

          color: "#0B55B8",

          fontWeight: 800,

          borderBottom:
            "1px solid #E5E7EB",
        },

        "& .MuiTableRow-root": {
          transition: ".18s ease",
        },

        "& .MuiTableRow-root:hover": {
          background:
            "rgba(15, 111, 219, 0.06)",
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
