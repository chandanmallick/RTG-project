import axios from "axios";

const BASE_URL = `http://${window.location.hostname}:8001/api`;

const API = {

  // =========================================
  // UNIT DATA PREVIEW
  // =========================================

  fetchDbChanges: async () => {

    const res = await axios.get(
      `${BASE_URL}/db-sync/preview`
    );

    return res.data;
  },

  // =========================================
  // UNIT DATA COMMIT
  // =========================================

  commitDbChanges: async (data) => {

    const res = await axios.post(

      `${BASE_URL}/db-sync/commit`,

      data,

      {
        headers: {
          "Content-Type": "application/json"
        }
      }
    );

    return res.data;
  },

  // =========================================
  // MAP TABLE PREVIEW
  // =========================================

  previewMapChanges: async () => {

    const res = await axios.get(
      `${BASE_URL}/db-sync/map-preview`
    );

    return res.data;
  },

  // =========================================
  // MAP TABLE COMMIT
  // =========================================

  commitMapChanges: async () => {

    const res = await axios.post(
      `${BASE_URL}/db-sync/map-commit`
    );

    return res.data;
  },

  // =========================================
  // FETCH MAP TABLE
  // =========================================

  fetchMapTable: async () => {

    const res = await axios.get(
      `${BASE_URL}/map-table`
    );

    return res.data;
  },

  // =========================================
  // SAVE MAP TABLE
  // =========================================

  saveMapTable: async (payload) => {

    const res = await axios.post(

      `${BASE_URL}/map-table/update`,

      payload
    );

    return res.data;
  },

  refreshRTGDashboard: async () => {

    console.log(
      "USING NEW API FILE",
      BASE_URL
    );

    return (
      await axios.post(
        `${BASE_URL}/rtg-dashboard/refresh`
      )
    ).data;
  },

  getRTGLiveData: async () => {

    const res = await axios.get(
      `${BASE_URL}/rtg-dashboard/live`
    );

    return res.data;
  },

  getRTGTodayTrend: async () => {

    const res = await axios.get(
      `${BASE_URL}/rtg-dashboard/trend/today`
    );

    return res.data;
  },

  getPipelineStatus: async () => {

    const res = await axios.get(
      `${BASE_URL}/pipeline/status`
    );

    return res.data;
  },

  getPspStatus: async (startDate, endDate) => {
    let url = `${BASE_URL}/psp/status`;
    if (startDate && endDate) {
      url += `?start_date=${startDate}&end_date=${endDate}`;
    }
    const res = await axios.get(url);
    return res.data;
  },

  getPspSyncProgress: async () => {
    const res = await axios.get(
      `${BASE_URL}/psp/sync-progress`
    );
    return res.data;
  },

  runPspRange: async (startDate, endDate) => {
    const res = await axios.post(
      `${BASE_URL}/psp/run-range`,
      {
        start_date: startDate,
        end_date: endDate
      }
    );
    return res.data;
  },

  syncPspDate: async (dateStr) => {
    const res = await axios.post(
      `${BASE_URL}/psp/sync-date/${dateStr}`
    );
    return res.data;
  },

  getPspConfig: async () => {
    const res = await axios.get(
      `${BASE_URL}/psp/config`
    );
    return res.data;
  },

  savePspConfig: async (payload) => {
    const res = await axios.post(
      `${BASE_URL}/psp/config`,
      payload
    );
    return res.data;
  },

  getPspAnalytics: async () => {
    const res = await axios.get(
      `${BASE_URL}/psp/analytics`
    );
    return res.data;
  },

  getPspEnergyConsumption: async (dateStr) => {
    const params = dateStr ? `?date_str=${dateStr}` : '';
    const res = await axios.get(
      `${BASE_URL}/psp/energy-consumption${params}`
    );
    return res.data;
  },

  getPspEnergyBreakdown: async (dateStr) => {
    const params = dateStr ? `?date_str=${dateStr}` : '';
    const res = await axios.get(
      `${BASE_URL}/psp/energy-breakdown${params}`
    );
    return res.data;
  },

  getPspPortfolioBreakdown: async (dateStr) => {
    const params = dateStr ? `?date_str=${dateStr}` : '';
    const res = await axios.get(
      `${BASE_URL}/psp/portfolio-demand-breakdown${params}`
    );
    return res.data;
  },

  getPspHighestRecords: async () => {
    const res = await axios.get(
      `${BASE_URL}/psp/highest-records`
    );
    return res.data;
  },

  getPspPowerPosition: async (dateStr) => {
    const params = dateStr ? `?date_str=${dateStr}` : '';
    const res = await axios.get(
      `${BASE_URL}/psp/power-position${params}`
    );
    return res.data;
  },

  getPspVoltageProfile: async (dateStr) => {
    const params = dateStr ? `?date_str=${dateStr}` : '';
    const res = await axios.get(
      `${BASE_URL}/psp/voltage-profile${params}`
    );
    return res.data;
  },

};

export default API;
