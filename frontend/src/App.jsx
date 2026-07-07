import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";

import DatabaseSync from "./pages/DatabaseSync";
import RTGDashboard from "./pages/RTGDashboard";
import PSPDashboard from "./pages/PSPDashboard";
import PSPAdmin from "./pages/PSPAdmin";
import PSPReportChecking from "./pages/PSPReportChecking";
import FrequencyReport from "./pages/FrequencyReport";
import MISReport from "./pages/MISReport";
import OutageAnalysis from "./pages/OutageAnalysis";

export default function App() {

  return (

    <BrowserRouter>

      <Routes>

        <Route
          path="/"
          element={
            <Navigate
              to="/rtg-dashboard"
            />
          }
        />

        <Route
          path="/database-sync"
          element={<DatabaseSync />}
        />

        <Route
          path="/rtg-dashboard"
          element={<RTGDashboard />}
        />

        <Route
          path="/psp-dashboard"
          element={<PSPDashboard />}
        />

        <Route
          path="/psp-admin"
          element={<PSPAdmin />}
        />

        <Route
          path="/psp-report-checking"
          element={<PSPReportChecking />}
        />

        <Route
          path="/frequency-report"
          element={<FrequencyReport />}
        />

        <Route
          path="/mis-report"
          element={<MISReport />}
        />

        <Route
          path="/outage-analysis"
          element={<OutageAnalysis />}
        />

      </Routes>

    </BrowserRouter>
  );
}
