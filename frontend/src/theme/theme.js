import { createTheme } from "@mui/material/styles";

const theme = createTheme({
  palette: {
    primary: {
      main: "#0057B7",
    },

    secondary: {
      main: "#0F6FDB",
    },

    background: {
      default: "#F8FAFC",
      paper: "#FFFFFF",
    },
  },

  typography: {
    fontFamily: `"Inter", sans-serif`,

    h1: {
          fontSize: "36px",
          fontWeight: 800,
          letterSpacing: "-0.04em",
    },

    h2: {
      fontSize: "28px",
      fontWeight: 700,
    },

    h3: {
      fontSize: "20px",
      fontWeight: 700,
    },

    body1: {
      fontSize: "14px",
    },
  },

  shape: {
      borderRadius: 12,
  },

  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          border: "1px solid #E2E8F0",
          background: "#FFFFFF",
          boxShadow: "0 4px 14px rgba(15, 23, 42, 0.04)",
        },
      },
    },

    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          border: "1px solid #E2E8F0",
          background: "#FFFFFF",
          boxShadow: "0 4px 14px rgba(15, 23, 42, 0.04)",
        },
      },
    },

    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          textTransform: "none",
          fontWeight: 700,
        },
      },
    },

    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          background:
            "#FFFFFF",
        },
      },
    },

    MuiAccordion: {
      styleOverrides: {
        root: {
          borderRadius:
            "12px !important",

          overflow: "hidden",
          border: "1px solid #E2E8F0",
          background: "#FFFFFF",
          boxShadow: "0 4px 14px rgba(15, 23, 42, 0.04)",

          "&:before": {
            display: "none",
          },
        },
      },
    },

    MuiTableCell: {
      styleOverrides: {
        head: {
          fontWeight: 800,
          color: "#0057B7",
          backgroundColor: "#F1F5F9",
        },
      },
    },

    MuiTabs: {
      styleOverrides: {
        root: {
          minHeight: 44,
          padding: 4,
          border: "1px solid #E2E8F0",
          borderRadius: 10,
          background: "#F8FAFC",
        },
        indicator: {
          display: "none",
        },
      },
    },

    MuiTab: {
      styleOverrides: {
        root: {
          minHeight: 34,
          borderRadius: 8,
          color: "#0057B7",
          fontWeight: 700,
          textTransform: "none",
          "&.Mui-selected": {
            color: "#FFFFFF",
            background: "#0057B7",
            boxShadow: "0 4px 10px rgba(0, 87, 183, 0.18)",
          },
        },
      },
    },
  },
});

export default theme;
