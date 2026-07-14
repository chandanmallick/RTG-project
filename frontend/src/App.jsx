import { lazy, Suspense } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
// import TableColumnSearchEnhancer from "./components/ui/TableColumnSearchEnhancer";
import CrewLegacyShell from "./components/crew/CrewLegacyShell";

const DatabaseSync = lazy(() => import("./pages/DatabaseSync"));
const RTGDashboard = lazy(() => import("./pages/RTGDashboard"));
const PSPDashboard = lazy(() => import("./pages/PSPDashboard"));
const PSPAdmin = lazy(() => import("./pages/PSPAdmin"));
const PSPReportChecking = lazy(() => import("./pages/PSPReportChecking"));
const FrequencyReport = lazy(() => import("./pages/FrequencyReport"));
const MISReport = lazy(() => import("./pages/MISReport"));
const OutageAnalysis = lazy(() => import("./pages/OutageAnalysis"));
const OldLogbook = lazy(() => import("./pages/OldLogbook"));
const CrewCalendar = lazy(() => import("./pages/crew/CrewCalendar"));
const CrewDutyRoster = lazy(() => import("./pages/crew/CrewDutyRoster"));
const CrewSetup = lazy(() => import("./pages/crew/CrewSetup"));
const CrewUserContext = lazy(() => import("./pages/crew/CrewUserContext"));
const CrewDashboard = lazy(() => import("./crewLegacy/Dashboard"));
const CrewLeave = lazy(() => import("./crewLegacy/LeaveManagement"));
const CrewReplacement = lazy(() => import("./crewLegacy/ReplacementManagement"));
const CrewTraining = lazy(() => import("./crewLegacy/TrainingHolidayMaster"));
const CrewEmployees = lazy(() => import("./crewLegacy/EmployeeMaster"));
const CrewDropdowns = lazy(() => import("./crewLegacy/dropdownmaster"));
const CrewDutyLeaveTypes = lazy(() => import("./crewLegacy/DutyLeaveMaster"));
const CrewShiftHistory = lazy(() => import("./crewLegacy/ShiftHistoryAdmin"));
const CrewOrganization = lazy(() => import("./crewLegacy/DepartmentChart"));
const CrewProfile = lazy(() => import("./crewLegacy/Profile"));
const CrewLoginAudit = lazy(() => import("./crewLegacy/AdminLoginHistory"));

function PageLoader() {
  return (
    <div style={{
      minHeight: "100vh",
      display: "grid",
      placeItems: "center",
      background: "#F8FAFC",
      color: "#0F172A",
      fontWeight: 900,
    }}>
      Loading module...
    </div>
  );
}

export default function App() {

  return (

    <BrowserRouter>
      {/* <TableColumnSearchEnhancer /> */}

      <Suspense fallback={<PageLoader />}>
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

        <Route
          path="/old-logbook"
          element={<OldLogbook />}
        />

        <Route
          path="/crew"
          element={<Navigate to="/crew/dashboard" replace />}
        />

        <Route
          path="/crew/calendar"
          element={<CrewCalendar />}
        />

        <Route
          path="/crew/roster"
          element={<CrewDutyRoster />}
        />

        <Route
          path="/crew/setup"
          element={<CrewSetup />}
        />

        <Route path="/crew/user-context" element={<CrewUserContext />} />
        <Route path="/crew/dashboard" element={<CrewLegacyShell><CrewDashboard /></CrewLegacyShell>} />
        <Route path="/crew/leave" element={<CrewLegacyShell><CrewLeave /></CrewLegacyShell>} />
        <Route path="/crew/replacement" element={<CrewLegacyShell><CrewReplacement /></CrewLegacyShell>} />
        <Route path="/crew/training" element={<CrewLegacyShell><CrewTraining /></CrewLegacyShell>} />
        <Route path="/crew/employees" element={<CrewLegacyShell><CrewEmployees /></CrewLegacyShell>} />
        <Route path="/crew/dropdowns" element={<CrewLegacyShell><CrewDropdowns /></CrewLegacyShell>} />
        <Route path="/crew/duty-leave-types" element={<CrewLegacyShell><CrewDutyLeaveTypes /></CrewLegacyShell>} />
        <Route path="/crew/shift-history" element={<CrewLegacyShell><CrewShiftHistory /></CrewLegacyShell>} />
        <Route path="/crew/organization" element={<CrewLegacyShell><CrewOrganization /></CrewLegacyShell>} />
        <Route path="/crew/profile" element={<CrewLegacyShell><CrewProfile /></CrewLegacyShell>} />
        <Route path="/crew/login-audit" element={<CrewLegacyShell><CrewLoginAudit /></CrewLegacyShell>} />
        <Route path="/crew/*" element={<Navigate to="/crew/dashboard" replace />} />

      </Routes>
      </Suspense>

    </BrowserRouter>
  );
}
