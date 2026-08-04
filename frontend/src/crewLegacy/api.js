import axios from "axios";
import { pageKeyForPath, storedPermissions } from "../auth/pageAccess";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api";

const api = axios.create({ baseURL: `${API_BASE}/crew` });

api.interceptors.request.use((config) => {
  const employeeId = localStorage.getItem("crewEmployeeId") || localStorage.getItem("employeeId");
  if (employeeId) config.headers["X-Crew-Employee-ID"] = employeeId;
  const token = localStorage.getItem("portalToken");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  const method = (config.method || "GET").toUpperCase();
  const permissions = storedPermissions();
  // This sensitive operation is authorized against the live special permission by the backend.
  const isMasterDelete = method === "DELETE" && String(config.url || "").includes("/leave/master/");
  // Replacement-duty decisions are personal/managerial workflow actions. The backend verifies
  // the assigned employee or mapped reporting officer, so they must remain available even when
  // the dashboard page itself is configured as View-only.
  const requestUrl = String(config.url || "");
  const isDutyDecision = method === "PUT" && (
    requestUrl.includes("/replacement/notifications/accept/") ||
    requestUrl.includes("/replacement/notifications/deny/") ||
    requestUrl.includes("/replacement/assign/") ||
    requestUrl.includes("/replacement/duty-switch/exchange") ||
    requestUrl.includes("/replacement/duty-switch/cross-date")
  );
  // Training approval is a reporting-hierarchy workflow action, not a page edit.
  // The API verifies that the logged-in employee is the nomination's current
  // approver, so Crew Training Write access must not be required.
  const isTrainingApproval = method === "POST" && requestUrl.includes("/training-assign/approve");
  if (!["GET", "HEAD", "OPTIONS"].includes(method) && permissions[pageKeyForPath()]?.write === false && !isMasterDelete && !isDutyDecision && !isTrainingApproval) {
    return Promise.reject(new Error("This page is read-only for your account."));
  }
  return config;
});

// Legacy profile-photo paths are already rooted at /uploads.
export const BASE_URL = "";
export default api;
