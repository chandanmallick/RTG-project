import React from "react";
import ReactDOM from "react-dom/client";

import { ThemeProvider } from "@mui/material/styles";
import { CssBaseline } from "@mui/material";

import { Toaster } from "react-hot-toast";

import App from "./App";

import theme from "./theme/theme";
import { AuthProvider } from "./auth/AuthContext";

import "bootstrap/dist/css/bootstrap.min.css";
import "./index.css";
import "./theme/theme.css";

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("App render failed:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#F8FAFC",
          color: "#0F172A",
          fontFamily: "Inter, system-ui, sans-serif",
          padding: 24,
        }}>
          <div style={{
            width: "min(720px, 100%)",
            background: "#FFFFFF",
            border: "1px solid #E2E8F0",
            borderRadius: 8,
            boxShadow: "0 20px 60px rgba(15, 23, 42, 0.12)",
            padding: 24,
          }}>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>
              Page could not load
            </div>
            <div style={{ fontSize: 13, color: "#475569", marginBottom: 14 }}>
              Refresh after restarting the frontend. If it stays here, share this message.
            </div>
            <pre style={{
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              background: "#0F172A",
              color: "#E2E8F0",
              borderRadius: 6,
              padding: 14,
              fontSize: 12,
              margin: 0,
            }}>
              {this.state.error?.message || String(this.state.error)}
            </pre>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

ReactDOM.createRoot(
  document.getElementById("root")
).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />

      <AuthProvider>
        <AppErrorBoundary>
          <App />
        </AppErrorBoundary>
      </AuthProvider>

      <Toaster
        position="top-center"
        reverseOrder={false}
      />
    </ThemeProvider>
  </React.StrictMode>
);

