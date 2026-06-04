import React from "react";
import ReactDOM from "react-dom/client";

import { ThemeProvider } from "@mui/material/styles";
import { CssBaseline } from "@mui/material";

import { Toaster } from "react-hot-toast";

import App from "./App";

import theme from "./theme/theme";

import "bootstrap/dist/css/bootstrap.min.css";
import "./index.css";
import "./theme/theme.css";

ReactDOM.createRoot(
  document.getElementById("root")
).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />

      <App />

      <Toaster
        position="top-center"
        reverseOrder={false}
      />
    </ThemeProvider>
  </React.StrictMode>
);

