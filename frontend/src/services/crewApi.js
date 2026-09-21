import axios from "axios";
import { pageKeyForPath, storedPermissions } from "../auth/pageAccess";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";
const url = (path) => `${BASE_URL}/crew${path}`;
const client = axios.create();

client.interceptors.request.use((config) => {
  const token = localStorage.getItem("portalToken");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  const method = (config.method || "GET").toUpperCase();
  if (!["GET", "HEAD", "OPTIONS"].includes(method) && !config.allowCrossPageWrite && storedPermissions()[pageKeyForPath()]?.write === false) {
    return Promise.reject(new Error("This page is read-only for your account."));
  }
  return config;
});

const crewApi = {
  myRole: () => client.get(url("/leave/my-role")).then((response) => response.data),
  health: () => client.get(url("/health")).then((response) => response.data),
  employees: () => client.get(url("/employees")).then((response) => response.data),
  groups: () => client.get(url("/groups")).then((response) => response.data),
  holidays: (year) => client.get(url(`/Training_holiday/holiday/${year}`)).then((response) => response.data),
  createGroup: (payload) => client.post(url("/groups"), payload).then((response) => response.data),
  updateGroup: (id, payload) => client.put(url(`/groups/${id}`), payload).then((response) => response.data),
  toggleGroup: (id) => client.patch(url(`/groups/${id}/status`)).then((response) => response.data),
  cycle: () => client.get(url("/cycle")).then((response) => response.data),
  saveCycle: (payload) => client.put(url("/cycle"), payload).then((response) => response.data),
  manualCompOffs: (scope = "manual") => client.get(url("/leave/comp-off/manual"), { params: { scope } }).then((response) => response.data),
  addManualCompOff: (payload) => client.post(url("/leave/comp-off/manual"), payload).then((response) => response.data),
  manualCompOffTemplate: () => client.get(url("/leave/comp-off/manual/template"), { responseType: "blob" }),
  importManualCompOff: (file) => {
    const form = new FormData();
    form.append("file", file);
    return client.post(url("/leave/comp-off/manual/import"), form).then((response) => response.data);
  },
  generateRoster: (payload) => client.post(url("/rosters/generate"), payload).then((response) => response.data),
  saveRoster: (payload) => client.post(url("/rosters"), payload).then((response) => response.data),
  rosters: () => client.get(url("/rosters")).then((response) => response.data),
  previousFinalRoster: () => client.get(url("/roster/previous-final")).then((response) => response.data),
  roster: (id) => client.get(url(`/rosters/${id}`)).then((response) => response.data),
  deleteRoster: (id) => client.delete(url(`/rosters/${id}`)).then((response) => response.data),
  pushRoster: (id) => client.post(url(`/rosters/${id}/push`)).then((response) => response.data),
  calendar: (startDate, endDate) => client.get(url("/calendar"), {
    params: { start_date: startDate, end_date: endDate },
  }).then((response) => response.data),
  pendingReplacements: () => client.get(url("/replacement/pending")).then((response) => response.data),
  replacementCandidates: (leaveId, roleFilter = "auto") => client.get(url(`/replacement/candidates/${leaveId}`), {
    params: { roleFilter },
  }).then((response) => response.data),
  trainingReplacementCandidates: (nominationId) => client.get(url(`/training-assign/replacement-candidates/${nominationId}`))
    .then((response) => response.data),
  sportsReplacementCandidates: (applicationId) => client.get(url(`/sports/applications/${applicationId}/replacement-candidates`))
    .then((response) => response.data),
  replacementHistory: (employeeId) => client.get(url("/replacement/history"), {
    params: { employeeId },
  }).then((response) => response.data),
  assignReplacement: (leaveId, payload) => client.put(url(`/replacement/assign/${leaveId}`), payload, {
    allowCrossPageWrite: true,
  }).then((response) => response.data),
  assignTrainingReplacement: (nominationId, payload) => client.put(url(`/training-assign/assign-replacement/${nominationId}`), payload, {
    allowCrossPageWrite: true,
  }).then((response) => response.data),
  assignSportsReplacement: (applicationId, payload) => client.put(url(`/sports/applications/${applicationId}/assign-replacement`), payload, {
    allowCrossPageWrite: true,
  }).then((response) => response.data),
};

export default crewApi;
