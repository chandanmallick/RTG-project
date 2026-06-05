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

  // =========================================
  // FREQUENCY REPORT
  // =========================================

  getFrequencyPlantMapping: async () => {
    const res = await axios.get(`${BASE_URL}/frequency/plant-mapping`);
    return res.data;
  },

  getFrequencyReportData: async (date) => {
    const res = await axios.get(`${BASE_URL}/frequency/report-data?date=${date}`);
    return res.data;
  },

  uploadScadaFile: async (file) => {
    const form = new FormData();
    form.append("file", file);
    const res = await axios.post(`${BASE_URL}/frequency/upload-scada`, form, {
      headers: { "Content-Type": "multipart/form-data" }
    });
    return res.data;
  },

  saveFrequencyPlantMapping: async (payload) => {
    const res = await axios.put(`${BASE_URL}/frequency/plant-mapping`, payload, {
      headers: { "Content-Type": "application/json" }
    });
    return res.data;
  },

  exportFrequencyExcel: async (payload) => {
    const res = await axios.post(`${BASE_URL}/frequency/export-excel`, payload, {
      headers: { "Content-Type": "application/json" },
      responseType: "blob"
    });
    return res.data;
  },

  checkRtgStatus: async (startTime, endTime) => {
    const res = await axios.get(`${BASE_URL}/frequency/check-rtg-status`, {
      params: {
        start_time: startTime,
        end_time: endTime,
        _t: Date.now()
      }
    });
    return res.data;
  },

  processFrequencyReport: async (startTime, endTime, entities, file) => {
    const form = new FormData();
    form.append("start_time", startTime);
    form.append("end_time", endTime);
    form.append("entities", JSON.stringify(entities));
    form.append("file", file);
    const res = await axios.post(`${BASE_URL}/frequency/process-report`, form, {
      headers: { "Content-Type": "multipart/form-data" }
    });
    return res.data;
  },

  downloadFrequencyDocx: async (payload) => {
    const res = await axios.post(`${BASE_URL}/frequency/download-docx`, payload, {
      headers: { "Content-Type": "application/json" },
      responseType: "blob"
    });
    return res.data;
  },

  downloadFrequencyPdf: async (payload) => {
    const res = await axios.post(`${BASE_URL}/frequency/download-pdf`, payload, {
      headers: { "Content-Type": "application/json" },
      responseType: "blob"
    });
    return res.data;
  },

  downloadFrequencyExcel: async (payload) => {
    const res = await axios.post(`${BASE_URL}/frequency/download-excel`, payload, {
      headers: { "Content-Type": "application/json" },
      responseType: "blob"
    });
    return res.data;
  },

};

export default API;
