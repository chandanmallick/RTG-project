import axios from "axios";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";
const url = (path) => `${BASE_URL}/crew${path}`;

const crewApi = {
  health: () => axios.get(url("/health")).then((response) => response.data),
  employees: () => axios.get(url("/employees")).then((response) => response.data),
  groups: () => axios.get(url("/groups")).then((response) => response.data),
  createGroup: (payload) => axios.post(url("/groups"), payload).then((response) => response.data),
  updateGroup: (id, payload) => axios.put(url(`/groups/${id}`), payload).then((response) => response.data),
  toggleGroup: (id) => axios.patch(url(`/groups/${id}/status`)).then((response) => response.data),
  cycle: () => axios.get(url("/cycle")).then((response) => response.data),
  saveCycle: (payload) => axios.put(url("/cycle"), payload).then((response) => response.data),
  generateRoster: (payload) => axios.post(url("/rosters/generate"), payload).then((response) => response.data),
  saveRoster: (payload) => axios.post(url("/rosters"), payload).then((response) => response.data),
  rosters: () => axios.get(url("/rosters")).then((response) => response.data),
  roster: (id) => axios.get(url(`/rosters/${id}`)).then((response) => response.data),
  deleteRoster: (id) => axios.delete(url(`/rosters/${id}`)).then((response) => response.data),
  pushRoster: (id) => axios.post(url(`/rosters/${id}/push`)).then((response) => response.data),
  calendar: (startDate, endDate) => axios.get(url("/calendar"), {
    params: { start_date: startDate, end_date: endDate },
  }).then((response) => response.data),
};

export default crewApi;
