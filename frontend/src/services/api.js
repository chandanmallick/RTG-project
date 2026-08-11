import axios from "axios";
import { pageKeyForPath, storedPermissions } from "../auth/pageAccess";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

axios.interceptors.request.use((config) => {
  config.metadata = {
    startTime: performance.now()
  };

  const method = (config.method || "GET").toUpperCase();
  const url = `${config.baseURL || ""}${config.url || ""}`;
  const token = localStorage.getItem("portalToken");
  if (token) config.headers.Authorization = `Bearer ${token}`;

  const isMutation = !["GET", "HEAD", "OPTIONS"].includes(method);
  const isAuthRequest = url.includes("/crew/auth/login") || url.includes("/crew/auth/logout") || url.includes("/crew/auth/admin/access");
  // These narrowly scoped actions are available without page Write access.
  // Their authorization is enforced by the backend against the signed-in user.
  const isWriteWithoutPagePermission =
    url.includes("/crew/notifications/read/") ||
    url.includes("/crew/replacement/notifications/accept/") ||
    url.includes("/crew/replacement/notifications/deny/") ||
    url.includes("/psp/refresh-sources");
  if (isMutation && !isAuthRequest && !isWriteWithoutPagePermission) {
    const access = storedPermissions()[pageKeyForPath()];
    if (access && !access.write) {
      const error = new Error("This page is read-only for your account.");
      error.code = "PAGE_READ_ONLY";
      return Promise.reject(error);
    }
  }

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

  getDatabaseSyncReview: async () => {
    const res = await axios.get(`${BASE_URL}/db-sync/review`);
    return res.data;
  },

  refreshDatabaseSyncReview: async () => {
    const res = await axios.post(`${BASE_URL}/db-sync/review/refresh`);
    return res.data;
  },

  commitDatabaseSyncReview: async (rows) => {
    const res = await axios.post(`${BASE_URL}/db-sync/review/commit`, rows);
    return res.data;
  },

  updateDatabaseSyncRtgStatic: async (rows) => {
    const res = await axios.post(`${BASE_URL}/db-sync/review/update-rtg-static`, rows);
    return res.data;
  },

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

  getRTGHistoricalOptions: async () => {
    const res = await axios.get(`${BASE_URL}/rtg-dashboard/historical/options`);
    return res.data;
  },

  getRTGHistoricalMatrix: async (params) => {
    const res = await axios.get(`${BASE_URL}/rtg-dashboard/historical/matrix`, {
      params,
      paramsSerializer: { indexes: null },
    });
    return res.data;
  },

  downloadRTGHistoricalMatrix: async (params) => {
    const res = await axios.get(`${BASE_URL}/rtg-dashboard/historical/download`, {
      params,
      paramsSerializer: { indexes: null },
      responseType: "blob",
    });
    return res;
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

  downloadIndia15MinGenerationBreakup: async (dateStr) => {
    const params = new URLSearchParams();
    if (dateStr) params.append("date_str", dateStr);
    const query = params.toString();
    const res = await axios.get(
      `${BASE_URL}/psp/india-15-min-demand/generation-breakup/export${query ? `?${query}` : ""}`,
      { responseType: "blob" }
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

  getMisPlannedOutageUnitNames: async (elementType) => {
    const params = new URLSearchParams();
    if (elementType) params.append("element_type", elementType);
    const query = params.toString();
    const res = await axios.get(`${BASE_URL}/psp/mis/planned-outage/unit-names${query ? `?${query}` : ""}`);
    return res.data;
  },

  getMisPlannedOutageEntries: async (elementType = "") => {
    const params = new URLSearchParams();
    if (elementType) params.append("element_type", elementType);
    const query = params.toString();
    const res = await axios.get(`${BASE_URL}/psp/mis/planned-outage/entries${query ? `?${query}` : ""}`);
    return res.data;
  },

  createMisPlannedOutageEntry: async (payload) => {
    const res = await axios.post(`${BASE_URL}/psp/mis/planned-outage/entries`, payload);
    return res.data;
  },

  updateMisPlannedOutageEntry: async (entryId, payload) => {
    const res = await axios.put(`${BASE_URL}/psp/mis/planned-outage/entries/${entryId}`, payload);
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

  getOutageMlOverview: async () => (await axios.get(`${BASE_URL}/outage-ml/overview`)).data,
  getOutageMlTaxonomy: async () => (await axios.get(`${BASE_URL}/outage-ml/taxonomy`)).data,
  createOutageMlTaxonomy: async (payload) => (await axios.post(`${BASE_URL}/outage-ml/taxonomy`, payload)).data,
  updateOutageMlTaxonomy: async (id, payload) => (await axios.put(`${BASE_URL}/outage-ml/taxonomy/${id}`, payload)).data,
  archiveOutageMlTaxonomy: async (id) => (await axios.delete(`${BASE_URL}/outage-ml/taxonomy/${id}`)).data,
  importOutageMlOldLogbook: async () => (await axios.post(`${BASE_URL}/outage-ml/import-old-logbook`)).data,
  getOutageMlRecords: async (filters = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([name, value]) => {
      if (value !== undefined && value !== null && value !== "") params.set(name, String(value));
    });
    return (await axios.get(`${BASE_URL}/outage-ml/records?${params.toString()}`)).data;
  },
  updateOutageMlRecord: async (id, payload) => (await axios.put(`${BASE_URL}/outage-ml/records/${id}`, payload)).data,
  updateOutageMlRecords: async (payload) => (await axios.put(`${BASE_URL}/outage-ml/records`, payload)).data,
  updateOutageMlFilteredUse: async (payload) => (await axios.post(`${BASE_URL}/outage-ml/records/bulk-use`, payload)).data,
  trainOutageMlModels: async (payload) => (await axios.post(`${BASE_URL}/outage-ml/train`, payload)).data,
  getOutageMlVersions: async () => (await axios.get(`${BASE_URL}/outage-ml/versions`)).data,
  activateOutageMlVersion: async (id) => (await axios.put(`${BASE_URL}/outage-ml/versions/${id}/activate`)).data,
  archiveOutageMlVersion: async (id) => (await axios.put(`${BASE_URL}/outage-ml/versions/${id}/archive`)).data,
  predictOutageMl: async (payload) => (await axios.post(`${BASE_URL}/outage-ml/predict`, payload)).data,
  downloadOutageMlDataset: async (format = "csv") => (
    await axios.get(`${BASE_URL}/outage-ml/dataset/export?format=${format}`, { responseType: "blob" })
  ).data,
  downloadOutageMlVersion: async (id) => (
    await axios.get(`${BASE_URL}/outage-ml/versions/${id}/download`, { responseType: "blob" })
  ).data,

  // =========================================
  // FREQUENCY REPORT
  // =========================================

  getFrequencyPlantMapping: async () => {
    const res = await axios.get(`${BASE_URL}/frequency/plant-mapping`);
    return res.data;
  },

  getScheduleDataGenerators: async () => (await axios.get(`${BASE_URL}/frequency/schedule-data/generators`)).data,
  getScheduleData: async (params) => (await axios.get(`${BASE_URL}/frequency/schedule-data`, { params })).data,
  getScheduleDataRaw: async (params) => (await axios.get(`${BASE_URL}/frequency/schedule-data/raw`, { params })).data,
  getScheduleDataActual: async (params) => (await axios.get(`${BASE_URL}/frequency/schedule-data/actual`, { params })).data,

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

  getFrequencyCrmsTransmissionLines: async (startTime, endTime) => {
    const res = await axios.get(`${BASE_URL}/frequency/crms-transmission-lines`, {
      params: { start_time: startTime, end_time: endTime, _t: Date.now() },
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
  },

  getDsoMaster: async () => {
    const res = await axios.get(`${BASE_URL}/dso-reports/master`);
    return res.data;
  },

  saveDsoMaster: async (limits) => {
    const res = await axios.put(`${BASE_URL}/dso-reports/master`, { limits });
    return res.data;
  },

  getDsoReport: async (reportType, reportDate) => {
    const res = await axios.get(`${BASE_URL}/dso-reports/${reportType}/${reportDate}`);
    return res.data;
  },

  fetchDsoCrmsOutageData: async (reportType, reportDate) => {
    const res = await axios.post(`${BASE_URL}/dso-reports/${reportType}/${reportDate}/fetch-crms`);
    return res.data;
  },

  saveDsoReport: async (reportType, reportDate, payload) => {
    const res = await axios.put(`${BASE_URL}/dso-reports/${reportType}/${reportDate}`, payload);
    return res.data;
  },

  processDsoReport: async ({ reportType, reportDate, importantEvents, sicName, overwrite = false, file }) => {
    const form = new FormData();
    form.append("report_type", reportType);
    form.append("report_date", reportDate);
    form.append("important_events", importantEvents || "");
    form.append("sic_name", sicName || "");
    form.append("overwrite", overwrite ? "true" : "false");
    form.append("file", file);
    const res = await axios.post(`${BASE_URL}/dso-reports/process`, form);
    return res.data;
  },

  deleteDsoReport: async (reportType, reportDate) => {
    const res = await axios.delete(`${BASE_URL}/dso-reports/${reportType}/${reportDate}`);
    return res.data;
  },

  getIndiaOneMinuteDates: async () => {
    const res = await axios.get(`${BASE_URL}/dso-reports/india-1-min/dates`);
    return res.data;
  },

  getIndiaOneMinuteData: async (dataDate) => {
    const res = await axios.get(`${BASE_URL}/dso-reports/india-1-min/data/${dataDate}`);
    return res.data;
  },

  uploadIndiaOneMinuteData: async (file) => {
    const form = new FormData();
    form.append("file", file);
    const res = await axios.post(`${BASE_URL}/dso-reports/india-1-min/upload`, form);
    return res.data;
  },

  dsoReportExcelUrl: (reportType, reportDate) => (
    `${BASE_URL}/dso-reports/${reportType}/${reportDate}/excel`
  ),

  dsoReportPdfUrl: (reportType, reportDate) => (
    `${BASE_URL}/dso-reports/${reportType}/${reportDate}/pdf`
  ),

  getPlantDeviationStatic: async (reportDate, refresh = false) => {
    const res = await axios.get(`${BASE_URL}/plant-deviation/static`, {
      params: { report_date: reportDate, refresh },
    });
    return res.data;
  },

  savePlantDeviationEdit: async (plantId, payload) => {
    const res = await axios.put(
      `${BASE_URL}/plant-deviation/static/edits/${encodeURIComponent(plantId)}`,
      payload,
    );
    return res.data;
  },

  savePlantDeviationEdits: async (payload) => {
    const res = await axios.put(`${BASE_URL}/plant-deviation/static/edits`, payload);
    return res.data;
  },

  downloadPlantDeviationStatic: async (reportDate) => {
    const res = await axios.get(`${BASE_URL}/plant-deviation/static/excel`, {
      params: { report_date: reportDate },
      responseType: "blob",
    });
    return res.data;
  },
};

export default API;
