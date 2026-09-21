export const LANDING_PAGE_OPTIONS = [
  { value: "/", label: "Homepage", pageKey: "rtg_dashboard" },
  { value: "/rtg-dashboard", label: "RTG Dashboard", pageKey: "rtg_dashboard" },
  { value: "/psp-dashboard", label: "PSP Dashboard", pageKey: "psp_dashboard" },
  { value: "/psp-report-checking", label: "PSP Report Check", pageKey: "psp_report_checking" },
  { value: "/frequency-report", label: "Frequency Data Analysis", pageKey: "frequency_report" },
  { value: "/analytics/data-validation", label: "Data Validation", pageKey: "data_validation" },
  { value: "/outage-analysis", label: "Shutdown Analysis", pageKey: "outage_analysis" },
  { value: "/mis-report", label: "Generic Reports", pageKey: "mis_report" },
  { value: "/mis/nldc-plots", label: "NLDC Plots", pageKey: "nldc_plots" },
  { value: "/mis/schedule-data", label: "Schedule / RTG Data", pageKey: "schedule_data" },
  { value: "/report-preparation/dso-evening", label: "DSO Evening Report", pageKey: "dso_evening_report" },
  { value: "/report-preparation/dso-morning", label: "DSO Morning Report", pageKey: "dso_morning_report" },
  { value: "/report-preparation/sri", label: "System Reliability Report", pageKey: "sri_report" },
  { value: "/report-preparation/plant-deviation", label: "Plant Deviation Report", pageKey: "plant_deviation_report" },
  { value: "/report-preparation/psp-highlights", label: "PSP Highlights Report", pageKey: "psp_highlights_report" },
  { value: "/old-logbook", label: "Old Logbook", pageKey: "old_logbook" },
  { value: "/crew/operations", label: "Crew Applications & Approvals", pageKey: "crew_dashboard" },
  { value: "/crew/dashboard", label: "Crew Dashboard", pageKey: "crew_dashboard" },
  { value: "/crew/calendar", label: "Daily Duty Calendar", pageKey: "crew_calendar" },
  { value: "/crew/roster", label: "Duty Roster", pageKey: "crew_roster" },
  { value: "/crew/morning-presentation", label: "Morning Presentation Roster", pageKey: "crew_presentation" },
  { value: "/crew/replacement", label: "Replacement Management", pageKey: "crew_replacement", workflow: true },
  { value: "/crew/training", label: "Training Management", pageKey: "crew_training", workflow: true },
  { value: "/crew/threads", label: "Crew Notices", pageKey: "crew_threads" },
  { value: "/crew/reports", label: "Crew Reports", pageKey: "crew_reports", alwaysAvailable: true },
  { value: "/crew/profile", label: "My Profile", pageKey: "profile", alwaysAvailable: true },
  { value: "/crew/setup", label: "Crew Setup", pageKey: "crew_setup" },
  { value: "/admin/user-access", label: "User Access Control", pageKey: "user_access" },
  { value: "/admin/mail-settings", label: "Mail & Integration Settings", pageKey: "mail_settings" },
  { value: "/admin/audit-trail", label: "Portal Audit Trail", pageKey: "audit_trail" },
];

export const availableLandingPages = (permissions = {}) => LANDING_PAGE_OPTIONS.filter(
  (option) => option.alwaysAvailable || option.workflow || permissions?.[option.pageKey]?.view,
);

export const landingPageForSession = (session) => {
  const available = availableLandingPages(session?.permissions || {});
  const preferred = String(session?.landingPage || "").trim();
  if (preferred && available.some((option) => option.value === preferred)) return preferred;
  if (available.some((option) => option.value === "/")) return "/";
  return available[0]?.value || "/crew/profile";
};
