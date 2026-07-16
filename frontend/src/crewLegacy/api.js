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
  if (!["GET", "HEAD", "OPTIONS"].includes(method) && permissions[pageKeyForPath()]?.write === false && !isMasterDelete) {
    return Promise.reject(new Error("This page is read-only for your account."));
  }
  return config;
});

// Legacy profile-photo paths are already rooted at /uploads.
export const BASE_URL = "";
export default api;
