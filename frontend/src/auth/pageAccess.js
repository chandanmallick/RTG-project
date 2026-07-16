export const ROUTE_PAGE_KEYS = {
  "/rtg-dashboard": "rtg_dashboard",
  "/psp-dashboard": "psp_dashboard",
  "/psp-report-checking": "psp_report_checking",
  "/frequency-report": "frequency_report",
  "/outage-analysis": "outage_analysis",
  "/mis-report": "mis_report",
  "/old-logbook": "old_logbook",
  "/database-sync": "database_sync",
  "/psp-admin": "psp_admin",
  "/admin/user-access": "user_access",
  "/crew/dashboard": "crew_dashboard",
  "/crew/calendar": "crew_calendar",
  "/crew/roster": "crew_roster",
  "/crew/leave": "crew_leave",
  "/crew/replacement": "crew_replacement",
  "/crew/training": "crew_training",
  "/crew/setup": "crew_setup",
  "/crew/employees": "crew_employees",
  "/crew/dropdowns": "crew_admin",
  "/crew/duty-leave-types": "crew_admin",
  "/crew/shift-history": "crew_admin",
  "/crew/organization": "crew_admin",
  "/crew/organization-master": "crew_admin",
  "/crew/login-audit": "crew_admin",
  "/crew/profile": "profile",
};

export const pageKeyForPath = (pathname = window.location.pathname) => (
  ROUTE_PAGE_KEYS[pathname] || (pathname.startsWith("/crew/") ? "crew_dashboard" : "rtg_dashboard")
);

export const storedPermissions = () => {
  try {
    return JSON.parse(localStorage.getItem("portalPermissions") || "{}");
  } catch {
    return {};
  }
};
