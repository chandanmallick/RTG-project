import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import axios from "axios";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";
const AuthContext = createContext(null);

const persistSession = (session) => {
  if (!session) {
    ["portalToken", "portalUser", "portalPermissions", "crewEmployeeId", "crewEmployeeName", "employeeId"].forEach((key) => localStorage.removeItem(key));
    return;
  }
  localStorage.setItem("portalUser", JSON.stringify(session));
  localStorage.setItem("portalPermissions", JSON.stringify(session.permissions || {}));
  localStorage.setItem("crewEmployeeId", session.employeeId);
  localStorage.setItem("employeeId", session.employeeId);
  localStorage.setItem("crewEmployeeName", session.name || session.employeeId);
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("portalUser") || "null"); } catch { return null; }
  });
  const [loading, setLoading] = useState(Boolean(localStorage.getItem("portalToken")));

  const refreshSession = useCallback(async () => {
    const token = localStorage.getItem("portalToken");
    if (!token) {
      setUser(null);
      setLoading(false);
      return null;
    }
    try {
      const { data } = await axios.get(`${BASE_URL}/crew/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
      setUser(data);
      persistSession(data);
      return data;
    } catch {
      localStorage.removeItem("portalToken");
      persistSession(null);
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refreshSession(); }, [refreshSession]);

  const login = useCallback(async (userId, password) => {
    const { data } = await axios.post(`${BASE_URL}/crew/auth/login`, { userId, password });
    localStorage.setItem("portalToken", data.access_token);
    const session = { ...data, employeeId: data.employeeId, permissions: data.permissions || {} };
    setUser(session);
    persistSession(session);
    return session;
  }, []);

  const logout = useCallback(async () => {
    const token = localStorage.getItem("portalToken");
    try {
      if (token) await axios.post(`${BASE_URL}/crew/auth/logout`, {}, { headers: { Authorization: `Bearer ${token}` } });
    } finally {
      localStorage.removeItem("portalToken");
      persistSession(null);
      setUser(null);
    }
  }, []);

  const value = useMemo(() => ({ user, loading, login, logout, refreshSession }), [user, loading, login, logout, refreshSession]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
