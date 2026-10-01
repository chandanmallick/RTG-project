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
  const isDutyDecision = (
    method === "PUT" && (
      requestUrl.includes("/replacement/notifications/accept/") ||
      requestUrl.includes("/replacement/notifications/deny/") ||
      requestUrl.includes("/replacement/assign/") ||
      requestUrl.includes("/replacement/duty-switch/exchange") ||
      requestUrl.includes("/replacement/duty-switch/cross-date")
    )
  ) || (method === "DELETE" && requestUrl.includes("/replacement/assign/"));
  // Training approval is a reporting-hierarchy workflow action, not a page edit.
  // The API verifies that the logged-in employee is the nomination's current
  // approver, so Crew Training Write access must not be required.
  const isTrainingApproval = (["PUT", "DELETE"].includes(method) && /^\/training-assign\/nomination\/[^/]+$/.test(requestUrl)) || method === "POST" && (
    requestUrl.includes("/training-assign/approve") ||
    requestUrl.includes("/training-assign/reject") ||
    requestUrl.includes("/training-assign/request-adjacent-off/") ||
    requestUrl.includes("/training-assign/nominate") ||
    requestUrl.includes("/training-assign/delegation")
  );
  // Leave approval is likewise controlled by the live SIC/DIC/reporting hierarchy.
    const isLeaveApproval = method === "PUT" && (
    requestUrl.includes("/leave/cancel/") ||
    requestUrl.includes("/leave/cancel-group") ||
    requestUrl.includes("/leave/sic-forward-bulk") ||
    requestUrl.includes("/leave/sic-reject-bulk") ||
    requestUrl.includes("/leave/approve-bulk") ||
    requestUrl.includes("/leave/reject-bulk")
  );
  // As with leave/training, sports decisions use the current-stage authority
  // enforced by the server, including explicitly delegated approvers.
  const isSportsApproval = method === "POST" && /^\/sports\/applications\/[^/]+\/(approve|reject)$/.test(requestUrl);
  // Calendar applications use the target workflow's server-side employee and
  // reporting-authority checks, independent of calendar layout edit access.
  const isLeaveBlockAdministration = ["POST", "PUT", "DELETE"].includes(method) && /^\/leave\/blocked-periods(?:\/[^/]+(?:\/(?:status|permanent))?)?$/.test(requestUrl);
  // Training programme maintenance (create/edit/delete a programme from the
  // calendar) is authorized on the server by HR training-approval rights, which
  // is a broader authority than the page's Write (nomination) permission.
  const isTrainingMaster = ["POST", "PUT", "DELETE"].includes(method) && /^\/Training_holiday\/training(?:\/[^/]+)?$/.test(requestUrl);
  // Sports event maintenance is a server-authorized HR/HOD action (crew_training
  // or crew_leave approve) and is exposed from the training calendar as well.
  const isSportsEventManagement = ["POST", "PUT", "DELETE"].includes(method) && /^\/sports\/events(?:\/[^/]+)?$/.test(requestUrl);
  const isLeaveApplication = method === "POST" && requestUrl === "/leave/apply";
  // Every signed-in employee owns this one profile preference. The backend
  // binds it to the authenticated employee, so page-level Write access is not
  // needed to choose a post-login landing page.
  const isLandingPagePreference = ["POST", "PUT"].includes(method) && requestUrl.includes("/profile/landing-page");
  if (!["GET", "HEAD", "OPTIONS"].includes(method) && permissions[pageKeyForPath()]?.write === false && !isMasterDelete && !isDutyDecision && !isTrainingApproval && !isLeaveApproval && !isSportsApproval && !isLeaveApplication && !isLeaveBlockAdministration && !isTrainingMaster && !isSportsEventManagement && !isLandingPagePreference) {
    return Promise.reject(new Error("This page is read-only for your account."));
  }
  return config;
});

// Legacy profile-photo paths are already rooted at /uploads.
export const BASE_URL = "";
export default api;
