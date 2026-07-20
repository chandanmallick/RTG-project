import { lazy, Suspense } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
// import TableColumnSearchEnhancer from "./components/ui/TableColumnSearchEnhancer";
import CrewLegacyShell from "./components/crew/CrewLegacyShell";
import ProtectedRoute from "./auth/ProtectedRoute";

const DatabaseSync = lazy(() => import("./pages/DatabaseSync"));
const HomePage = lazy(() => import("./pages/HomePage"));
const RTGDashboard = lazy(() => import("./pages/RTGDashboard"));
const PSPDashboard = lazy(() => import("./pages/PSPDashboard"));
const PSPAdmin = lazy(() => import("./pages/PSPAdmin"));
const PSPReportChecking = lazy(() => import("./pages/PSPReportChecking"));
const FrequencyReport = lazy(() => import("./pages/FrequencyReport"));
const MISReport = lazy(() => import("./pages/MISReport"));
const DSOReportPreparation = lazy(() => import("./pages/DSOReportPreparation"));
const DSOMorningReport = lazy(() => import("./pages/DSOMorningReport"));
const OutageAnalysis = lazy(() => import("./pages/OutageAnalysis"));
const OldLogbook = lazy(() => import("./pages/OldLogbook"));
const CrewCalendar = lazy(() => import("./pages/crew/CrewCalendar"));
const CrewDutyRoster = lazy(() => import("./pages/crew/CrewDutyRoster"));
const CrewSetup = lazy(() => import("./pages/crew/CrewSetup"));
const CrewDashboard = lazy(() => import("./crewLegacy/Dashboard"));
const CrewLeave = lazy(() => import("./crewLegacy/LeaveManagement"));
const CrewReplacement = lazy(() => import("./crewLegacy/ReplacementManagement"));
const CrewTraining = lazy(() => import("./crewLegacy/TrainingHolidayMaster"));
const CrewEmployees = lazy(() => import("./crewLegacy/EmployeeMaster"));
const CrewDropdowns = lazy(() => import("./crewLegacy/dropdownmaster"));
const CrewDutyLeaveTypes = lazy(() => import("./crewLegacy/DutyLeaveMaster"));
const CrewShiftHistory = lazy(() => import("./crewLegacy/ShiftHistoryAdmin"));
const CrewOrganization = lazy(() => import("./crewLegacy/DepartmentChart"));
const CrewOrganizationMaster = lazy(() => import("./crewLegacy/OrganizationMaster"));
const CrewProfile = lazy(() => import("./crewLegacy/Profile"));
const CrewLoginAudit = lazy(() => import("./crewLegacy/AdminLoginHistory"));
const Login = lazy(() => import("./pages/Login"));
const UserAccessControl = lazy(() => import("./pages/UserAccessControl"));

const protectedPage = (pageKey, element) => <ProtectedRoute pageKey={pageKey}>{element}</ProtectedRoute>;

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

        <Route path="/login" element={<Login />} />

        <Route
          path="/"
          element={
            <ProtectedRoute pageKey="rtg_dashboard">
              <HomePage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/database-sync"
          element={protectedPage("database_sync", <DatabaseSync />)}
        />

        <Route
          path="/rtg-dashboard"
          element={protectedPage("rtg_dashboard", <RTGDashboard />)}
        />

        <Route
          path="/psp-dashboard"
          element={protectedPage("psp_dashboard", <PSPDashboard />)}
        />

        <Route
          path="/psp-admin"
          element={protectedPage("psp_admin", <PSPAdmin />)}
        />

        <Route
          path="/psp-report-checking"
          element={protectedPage("psp_report_checking", <PSPReportChecking />)}
        />

        <Route
          path="/frequency-report"
          element={protectedPage("frequency_report", <FrequencyReport />)}
        />

        <Route
          path="/mis-report"
          element={protectedPage("mis_report", <MISReport />)}
        />

        <Route
          path="/report-preparation/dso-evening"
          element={protectedPage("dso_evening_report", <DSOReportPreparation reportType="evening" />)}
        />

        <Route
          path="/report-preparation/dso-morning"
          element={protectedPage("dso_morning_report", <DSOMorningReport />)}
        />

        <Route
          path="/outage-analysis"
          element={protectedPage("outage_analysis", <OutageAnalysis />)}
        />

        <Route
          path="/old-logbook"
          element={protectedPage("old_logbook", <OldLogbook />)}
        />

        <Route
          path="/crew"
          element={<Navigate to="/crew/dashboard" replace />}
        />

        <Route
          path="/crew/calendar"
          element={protectedPage("crew_calendar", <CrewCalendar />)}
        />

        <Route
          path="/crew/roster"
          element={protectedPage("crew_roster", <CrewDutyRoster />)}
        />

        <Route
          path="/crew/setup"
          element={protectedPage("crew_setup", <CrewSetup />)}
        />

        <Route path="/crew/user-context" element={<Navigate to="/admin/user-access" replace />} />
        <Route path="/admin/user-access" element={protectedPage("user_access", <UserAccessControl />)} />
        <Route path="/crew/dashboard" element={protectedPage("crew_dashboard", <CrewLegacyShell><CrewDashboard /></CrewLegacyShell>)} />
        <Route path="/crew/leave" element={protectedPage("crew_leave", <CrewLegacyShell><CrewLeave /></CrewLegacyShell>)} />
        <Route path="/crew/replacement" element={protectedPage("crew_replacement", <CrewLegacyShell><CrewReplacement /></CrewLegacyShell>)} />
        <Route path="/crew/training" element={protectedPage("crew_training", <CrewLegacyShell><CrewTraining /></CrewLegacyShell>)} />
        <Route path="/crew/employees" element={protectedPage("crew_employees", <CrewLegacyShell><CrewEmployees /></CrewLegacyShell>)} />
        <Route path="/crew/dropdowns" element={protectedPage("crew_admin", <CrewLegacyShell><CrewDropdowns /></CrewLegacyShell>)} />
        <Route path="/crew/duty-leave-types" element={protectedPage("crew_admin", <CrewLegacyShell><CrewDutyLeaveTypes /></CrewLegacyShell>)} />
        <Route path="/crew/shift-history" element={protectedPage("crew_admin", <CrewLegacyShell><CrewShiftHistory /></CrewLegacyShell>)} />
        <Route path="/crew/organization" element={protectedPage("crew_admin", <CrewLegacyShell><CrewOrganization /></CrewLegacyShell>)} />
        <Route path="/crew/organization-master" element={protectedPage("crew_admin", <CrewLegacyShell><CrewOrganizationMaster /></CrewLegacyShell>)} />
        <Route path="/crew/profile" element={protectedPage("profile", <CrewLegacyShell><CrewProfile /></CrewLegacyShell>)} />
        <Route path="/crew/login-audit" element={protectedPage("crew_admin", <CrewLegacyShell><CrewLoginAudit /></CrewLegacyShell>)} />
        <Route path="/crew/*" element={<Navigate to="/crew/dashboard" replace />} />

      </Routes>
      </Suspense>

    </BrowserRouter>
  );
}
