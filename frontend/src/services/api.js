import axios from "axios";

const BASE_URL = "http://localhost:8001/api";

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

};

export default API;
