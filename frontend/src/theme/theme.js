import { createTheme } from "@mui/material/styles";

const theme = createTheme({
  palette: {
    primary: {
      main: "#0F6FDB",
    },

    secondary: {
      main: "#2CC295",
    },

    background: {
      default: "#F7FAFF",
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
    borderRadius: 18,
  },

  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          border: "1px solid rgba(175, 196, 234, 0.72)",
          background:
            "linear-gradient(180deg, #F8FBFF 0%, #FFFFFF 56px)",
          boxShadow: "0 12px 30px rgba(15, 111, 219, 0.07)",
        },
      },
    },

    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          border: "1px solid rgba(175, 196, 234, 0.72)",
          background:
            "linear-gradient(180deg, #F8FBFF 0%, #FFFFFF 56px)",
          boxShadow: "0 12px 30px rgba(15, 111, 219, 0.07)",
        },
      },
    },

    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 14,
          textTransform: "none",
          fontWeight: 700,
        },
      },
    },

    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          background:
            "#FFFFFF",
        },
      },
    },

    MuiAccordion: {
      styleOverrides: {
        root: {
          borderRadius:
            "16px !important",

          overflow: "hidden",
          border: "1px solid rgba(175, 196, 234, 0.72)",
          background:
            "linear-gradient(180deg, #F8FBFF 0%, #FFFFFF 56px)",
          boxShadow: "0 12px 30px rgba(15, 111, 219, 0.07)",

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
          color: "#0B55B8",
          backgroundColor: "#EAF1FF",
        },
      },
    },

    MuiTabs: {
      styleOverrides: {
        root: {
          minHeight: 44,
          padding: 4,
          border: "1px solid rgba(175, 196, 234, 0.82)",
          borderRadius: "15px 15px 11px 11px",
          background: "linear-gradient(135deg, #EEF5FF 0%, #F8FBFF 100%)",
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
          borderRadius: 11,
          color: "#0B55B8",
          fontWeight: 700,
          textTransform: "none",
          "&.Mui-selected": {
            color: "#FFFFFF",
            background: "linear-gradient(135deg, #147CFF 0%, #0F6FDB 100%)",
            boxShadow: "0 8px 18px rgba(15, 111, 219, 0.22)",
          },
        },
      },
    },
  },
});

export default theme;
