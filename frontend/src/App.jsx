import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";

import DatabaseSync from "./pages/DatabaseSync";

import RTGDashboard from "./pages/RTGDashboard";

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

      </Routes>

    </BrowserRouter>
  );
}