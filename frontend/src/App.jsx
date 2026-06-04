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

      </Routes>

    </BrowserRouter>
  );
}