import axios from "axios";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

axios.interceptors.request.use((config) => {
  config.metadata = {
    startTime: performance.now()
  };

  const method = (config.method || "GET").toUpperCase();
  const url = `${config.baseURL || ""}${config.url || ""}`;

  console.log(`[API REQUEST] ${method} ${url}`);

  return config;
});

axios.interceptors.response.use(
  (response) => {
    const startTime = response.config.metadata?.startTime;
    const durationMs = startTime
      ? Math.round(performance.now() - startTime)
      : 0;
    const method = (response.config.method || "GET").toUpperCase();
    const url = `${response.config.baseURL || ""}${response.config.url || ""}`;

    console.log(
      `[API RESPONSE] ${method} ${url} -> ${response.status} (${durationMs} ms)`
    );

    return response;
  },
  (error) => {
    const config = error.config || {};
    const startTime = config.metadata?.startTime;
    const durationMs = startTime
      ? Math.round(performance.now() - startTime)
      : 0;
    const method = (config.method || "GET").toUpperCase();
    const url = `${config.baseURL || ""}${config.url || ""}`;
    const status = error.response?.status || "NETWORK";

    console.error(
      `[API ERROR] ${method} ${url} -> ${status} (${durationMs} ms)`,
      error
    );

    return Promise.reject(error);
  }
);

const API = {
  apiBaseUrl: BASE_URL,

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

  getRTGSnapshotTrend: async (dateStr) => {

    const params = new URLSearchParams();

    if (dateStr) {
      params.append("date_str", dateStr);
    }

    const query = params.toString();

    const res = await axios.get(
      `${BASE_URL}/rtg-dashboard/trend/snapshot${query ? `?${query}` : ""}`
    );

    return res.data;
  },

  getPipelineStatus: async () => {

    const res = await axios.get(
      `${BASE_URL}/pipeline/status`
    );

    return res.data;
  },

  getOutageCategoryRange: async (payload) => {
    const res = await axios.post(
      `${BASE_URL}/pipeline/outage/category-range`,
      payload
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

  getNldcDemandStatus: async (startDate, endDate) => {
    let url = `${BASE_URL}/psp/nldc-demand/status`;
    if (startDate && endDate) {
      url += `?start_date=${startDate}&end_date=${endDate}`;
    }
    const res = await axios.get(url);
    return res.data;
  },

  getNldcDemandSyncProgress: async () => {
    const res = await axios.get(
      `${BASE_URL}/psp/nldc-demand/sync-progress`
    );
    return res.data;
  },

  runNldcDemandRange: async (startDate, endDate) => {
    const res = await axios.post(
      `${BASE_URL}/psp/nldc-demand/run-range`,
      {
        start_date: startDate,
        end_date: endDate
      }
    );
    return res.data;
  },

  syncNldcDemandDate: async (dateStr) => {
    const res = await axios.post(
      `${BASE_URL}/psp/nldc-demand/sync-date/${dateStr}`
    );
    return res.data;
  },

  getNldcDemandTrend: async (startDate, endDate) => {
    const params = new URLSearchParams();
    if (startDate) params.append("start_date", startDate);
    if (endDate) params.append("end_date", endDate);
    const query = params.toString();
    const res = await axios.get(
      `${BASE_URL}/psp/nldc-demand/trend${query ? `?${query}` : ""}`
    );
    return res.data;
  },

  getIndia15MinDemandStatus: async (startDate, endDate) => {
    let url = `${BASE_URL}/psp/india-15-min-demand/status`;
    if (startDate && endDate) {
      url += `?start_date=${startDate}&end_date=${endDate}`;
    }
    const res = await axios.get(url);
    return res.data;
  },

  getIndia15MinDemandSyncProgress: async () => {
    const res = await axios.get(
      `${BASE_URL}/psp/india-15-min-demand/sync-progress`
    );
    return res.data;
  },

  runIndia15MinDemandRange: async (startDate, endDate) => {
    const res = await axios.post(
      `${BASE_URL}/psp/india-15-min-demand/run-range`,
      {
        start_date: startDate,
        end_date: endDate
      }
    );
    return res.data;
  },

  syncIndia15MinDemandDate: async (dateStr) => {
    const res = await axios.post(
      `${BASE_URL}/psp/india-15-min-demand/sync-date/${dateStr}`
    );
    return res.data;
  },

  getIndia15MinGenerationBreakup: async (dateStr) => {
    const params = new URLSearchParams();
    if (dateStr) params.append("date_str", dateStr);
    const query = params.toString();
    const res = await axios.get(
      `${BASE_URL}/psp/india-15-min-demand/generation-breakup${query ? `?${query}` : ""}`
    );
    return res.data;
  },

  getAllStateDemandStatus: async (startDate, endDate) => {
    let url = `${BASE_URL}/psp/all-state-demand/status`;
    if (startDate && endDate) {
      url += `?start_date=${startDate}&end_date=${endDate}`;
    }
    const res = await axios.get(url);
    return res.data;
  },

  getAllStateDemandSyncProgress: async () => {
    const res = await axios.get(
      `${BASE_URL}/psp/all-state-demand/sync-progress`
    );
    return res.data;
  },

  runAllStateDemandRange: async (startDate, endDate) => {
    const res = await axios.post(
      `${BASE_URL}/psp/all-state-demand/run-range`,
      {
        start_date: startDate,
        end_date: endDate
      }
    );
    return res.data;
  },

  syncAllStateDemandDate: async (dateStr) => {
    const res = await axios.post(
      `${BASE_URL}/psp/all-state-demand/sync-date/${dateStr}`
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

  getPspPortfolioMapping: async () => {
    const res = await axios.get(
      `${BASE_URL}/psp/portfolio-mapping`
    );
    return res.data;
  },

  savePspPortfolioMapping: async (payload) => {
    const res = await axios.put(
      `${BASE_URL}/psp/portfolio-mapping`,
      payload,
      {
        headers: { "Content-Type": "application/json" }
      }
    );
    return res.data;
  },

  getPspPowerSystemBase: async (dateStr) => {
    const params = dateStr ? `?date_str=${dateStr}` : '';
    const res = await axios.get(
      `${BASE_URL}/psp/power-system-base${params}`
    );
    return res.data;
  },

  savePspPowerSystemBase: async (payload) => {
    const res = await axios.put(
      `${BASE_URL}/psp/power-system-base`,
      payload,
      {
        headers: { "Content-Type": "application/json" }
      }
    );
    return res.data;
  },

  getPspAnalytics: async () => {
    const res = await axios.get(
      `${BASE_URL}/psp/analytics`
    );
    return res.data;
  },

  getPspEnergyTrend: async (startDate, endDate) => {
    const params = new URLSearchParams();
    if (startDate) params.append("start_date", startDate);
    if (endDate) params.append("end_date", endDate);
    const query = params.toString();
    const res = await axios.get(
      `${BASE_URL}/psp/energy-trend${query ? `?${query}` : ""}`
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

  getPspStateGenerationSources: async (dateStr) => {
    const params = dateStr ? `?date_str=${dateStr}` : '';
    const res = await axios.get(
      `${BASE_URL}/psp/state-generation-sources${params}`
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

  getPspPowerSystemData: async (dateStr) => {
    const params = dateStr ? `?date_str=${dateStr}` : '';
    const res = await axios.get(
      `${BASE_URL}/psp/power-system-data${params}`
    );
    return res.data;
  },

  getPspReportChecking: async (dateStr, includeCurve = false) => {
    const params = new URLSearchParams();
    if (dateStr) params.append("date_str", dateStr);
    if (includeCurve) params.append("include_curve", "true");
    const query = params.toString();
    const res = await axios.get(
      `${BASE_URL}/psp/report-checking${query ? `?${query}` : ""}`
    );
    return res.data;
  },

  refreshPspSources: async (dateStr) => {
    const params = new URLSearchParams();
    if (dateStr) params.append("date_str", dateStr);
    const query = params.toString();
    const res = await axios.post(
      `${BASE_URL}/psp/refresh-sources${query ? `?${query}` : ""}`
    );
    return res.data;
  },

  getPspShortageTrend: async (startDate, endDate, state) => {
    const params = new URLSearchParams();
    if (startDate) params.append("start_date", startDate);
    if (endDate) params.append("end_date", endDate);
    if (state) params.append("state", state);
    const query = params.toString();
    const res = await axios.get(
      `${BASE_URL}/psp/report-checking/shortage-trend${query ? `?${query}` : ""}`
    );
    return res.data;
  },

  getPspFrequencyTrend: async (startDate, endDate) => {
    const params = new URLSearchParams();
    if (startDate) params.append("start_date", startDate);
    if (endDate) params.append("end_date", endDate);
    const query = params.toString();
    const res = await axios.get(
      `${BASE_URL}/psp/report-checking/frequency-trend${query ? `?${query}` : ""}`
    );
    return res.data;
  },

  getPspCurveHeaders: async (dateStr) => {
    const params = dateStr ? `?date_str=${dateStr}` : '';
    const res = await axios.get(
      `${BASE_URL}/psp/portfolio-curve-headers${params}`
    );
    return res.data;
  },

  getPspGeneratingStations: async (state, dateStr) => {
    const params = new URLSearchParams();
    if (state) params.append("state", state);
    if (dateStr) params.append("date_str", dateStr);
    const res = await axios.get(
      `${BASE_URL}/psp/power-system-generating-stations?${params.toString()}`
    );
    return res.data;
  },

  getPspLoadshedding: async (dateStr, refresh = false) => {
    const params = new URLSearchParams();
    if (dateStr) params.append("date_str", dateStr);
    if (refresh) params.append("refresh", "true");
    const res = await axios.get(
      `${BASE_URL}/psp/loadshedding?${params.toString()}`
    );
    return res.data;
  },

  getPspGenerationOutageChanges: async (dateStr, refresh = false) => {
    const params = new URLSearchParams();
    if (dateStr) params.append("date_str", dateStr);
    if (refresh) params.append("refresh", "true");
    const res = await axios.get(
      `${BASE_URL}/psp/generation-outage-changes?${params.toString()}`
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

  getPspVoltageProfileTrend: async (startDate, endDate, stations = []) => {
    const params = new URLSearchParams();
    if (startDate) params.append("start_date", startDate);
    if (endDate) params.append("end_date", endDate);
    if (stations.length) params.append("stations", stations.join(","));
    const query = params.toString();
    const res = await axios.get(
      `${BASE_URL}/psp/voltage-profile-trend${query ? `?${query}` : ""}`
    );
    return res.data;
  },

  getPspPowerExchange: async (dateStr) => {
    const params = dateStr ? `?date_str=${dateStr}` : '';
    const res = await axios.get(
      `${BASE_URL}/psp/power-exchange${params}`
    );
    return res.data;
  },

  getPspPowerExchangeRange: async (startDate, endDate) => {
    const params = new URLSearchParams();
    if (startDate) params.append("start_date", startDate);
    if (endDate) params.append("end_date", endDate);
    const query = params.toString();
    const res = await axios.get(
      `${BASE_URL}/psp/power-exchange-range${query ? `?${query}` : ""}`
    );
    return res.data;
  },

  getMisDiurnalCurve: async (payload) => {
    const res = await axios.post(`${BASE_URL}/psp/mis/diurnal-curve`, payload);
    return res.data;
  },

  getMisPspSnapshotOutput: async (payload) => {
    const res = await axios.post(`${BASE_URL}/psp/mis/psp-snapshot-output`, payload);
    return res.data;
  },

  getMisVoltageNames: async (startDate, endDate) => {
    const params = new URLSearchParams();
    params.append("start_date", startDate);
    params.append("end_date", endDate);
    const res = await axios.get(`${BASE_URL}/psp/mis/voltage-names?${params.toString()}`);
    return res.data;
  },

  getMisVoltageProfile: async (payload) => {
    const res = await axios.post(`${BASE_URL}/psp/mis/voltage-profile`, payload);
    return res.data;
  },

  getMisReactorSwitching: async (payload) => {
    const res = await axios.post(`${BASE_URL}/psp/mis/reactor-switching`, payload);
    return res.data;
  },

  getMisElementNames: async (elementType) => {
    const params = new URLSearchParams();
    params.append("element_type", elementType);
    const res = await axios.get(`${BASE_URL}/psp/mis/element-names?${params.toString()}`);
    return res.data;
  },

  getMisOutageAnalysis: async (payload) => {
    const res = await axios.post(`${BASE_URL}/psp/mis/outage-analysis`, payload);
    return res.data;
  },

  getOldLogbookHistoricalOutages: async ({ kind = "all", startDate, endDate, search = "", elementType = "", limit = 1000, skip = 0 } = {}) => {
    const params = new URLSearchParams();
    params.append("kind", kind);
    params.append("limit", String(limit));
    params.append("skip", String(skip));
    if (startDate) params.append("start_date", startDate);
    if (endDate) params.append("end_date", endDate);
    if (search) params.append("search", search);
    if (elementType) params.append("element_type", elementType);
    const res = await axios.get(`${BASE_URL}/old-logbook/historical-outages?${params.toString()}`);
    return res.data;
  },

  downloadOldLogbookExcel: async ({ kind = "all", startDate, endDate, search = "", elementType = "" } = {}) => {
    const params = new URLSearchParams();
    params.append("kind", kind);
    if (startDate) params.append("start_date", startDate);
    if (endDate) params.append("end_date", endDate);
    if (search) params.append("search", search);
    if (elementType) params.append("element_type", elementType);
    const res = await axios.get(`${BASE_URL}/old-logbook/historical-outages/export?${params.toString()}`, {
      responseType: "blob",
    });
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
    const res = await axios.post(`${BASE_URL}/frequency/upload-scada`, form);
    return res.data;
  },

  saveFrequencyPlantMapping: async (payload) => {
    const res = await axios.put(`${BASE_URL}/frequency/plant-mapping`, payload, {
      headers: { "Content-Type": "application/json" }
    });
    return res.data;
  },

  getFrequencyCrmsMessages: async (startTime, endTime) => {
    const res = await axios.get(`${BASE_URL}/frequency/crms-messages`, {
      params: {
        start_time: startTime,
        end_time: endTime,
        _t: Date.now()
      }
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
    const cleanedEntities = (entities || []).map(e => {
      const { series, statistics, ...rest } = e;
      return rest;
    });
    const form = new FormData();
    form.append("start_time", startTime);
    form.append("end_time", endTime);
    form.append("entities", JSON.stringify(cleanedEntities));
    form.append("file", file);
    const res = await axios.post(`${BASE_URL}/frequency/process-report`, form);
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

  getRawData: async (plantId, date, source, wbesName) => {
    const res = await axios.get(`${BASE_URL}/frequency/raw-data`, {
      params: {
        plant_id: plantId,
        date: date,
        source: source,
        wbes_name: wbesName
      }
    });
    return res.data;
  },

  saveRawData: async (payload) => {
    const res = await axios.post(`${BASE_URL}/frequency/raw-data`, payload, {
      headers: { "Content-Type": "application/json" }
    });
    return res.data;
  },

  uploadTempFile: async (file) => {
    const form = new FormData();
    form.append("file", file);
    const res = await axios.post(`${BASE_URL}/frequency/upload-temp-file`, form);
    return res.data;
  },

  exportMapping: async () => {
    const res = await axios.get(`${BASE_URL}/frequency/export-mapping`, {
      responseType: "blob"
    });
    return res.data;
  },

  importMapping: async (file) => {
    const form = new FormData();
    form.append("file", file);
    const res = await axios.post(`${BASE_URL}/frequency/import-mapping`, form);
    return res.data;
  },

  getAvailableDates: async () => {
    const res = await axios.get(`${BASE_URL}/frequency/available-dates`);
    return res.data;
  },

  getFrequencyEvents: async () => {
    const res = await axios.get(`${BASE_URL}/frequency/events`);
    return res.data;
  },

  createFrequencyEvent: async (payload) => {
    const res = await axios.post(`${BASE_URL}/frequency/events`, payload, {
      headers: { "Content-Type": "application/json" }
    });
    return res.data;
  },

  deleteFrequencyEvent: async (eventId) => {
    const res = await axios.delete(`${BASE_URL}/frequency/events/${encodeURIComponent(eventId)}`);
    return res.data;
  },

  resyncSource: async (payload) => {
    const res = await axios.post(`${BASE_URL}/frequency/resync-source`, payload);
    return res.data;
  },

  createFrequencyReportJob: async (fileId, startTime, endTime, entities, eventId = "", eventType = "low") => {
    const clean = (entities || []).map(e => {
      const { series, statistics, ...rest } = e;
      return rest;
    });
    const res = await axios.post(`${BASE_URL}/frequency/process-report-job`, {
      file_id: fileId,
      start_time: startTime,
      end_time: endTime,
      entities: clean,
      event_id: eventId || "",
      event_type: eventType || "low"
    }, {
      headers: { "Content-Type": "application/json" }
    });
    return res.data;
  },

  getSSEUrl: (jobId) => {
    return `${BASE_URL}/frequency/process-report-sse?job_id=${encodeURIComponent(jobId)}`;
  }
};

export default API;
