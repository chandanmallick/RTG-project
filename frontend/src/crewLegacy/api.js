import axios from "axios";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api";

const api = axios.create({ baseURL: `${API_BASE}/crew` });

api.interceptors.request.use((config) => {
  const employeeId = localStorage.getItem("crewEmployeeId") || localStorage.getItem("employeeId");
  if (employeeId) config.headers["X-Crew-Employee-ID"] = employeeId;
  return config;
});

// Legacy profile-photo paths are already rooted at /uploads.
export const BASE_URL = "";
export default api;
