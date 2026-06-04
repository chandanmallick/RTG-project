import { createTheme } from "@mui/material/styles";

const theme = createTheme({
  palette: {
    primary: {
      main: "#03624C", // Bangladesh Green
    },

    secondary: {
      main: "#00DF81", // Caribbean Green
    },

    background: {
      default: "#F1F7F6", // Anti-Flash White
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
          borderRadius: 24,
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
          borderRadius: 16,
          background:
            "rgba(255,255,255,0.82)",
        },
      },
    },

    MuiAccordion: {
      styleOverrides: {
        root: {
          borderRadius:
            "28px !important",

          overflow: "hidden",

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
          color: "#0F4B2D",
        },
      },
    },
  },
});

export default theme;