import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Box,
  Typography,
  Button,
  InputBase,
  IconButton,
  Avatar,
  Badge,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider
} from "@mui/material";
import { motion, AnimatePresence } from "framer-motion";
import {
  Zap,
  TrendingUp,
  Database,
  Shield,
  CheckSquare,
  Activity,
  FileText,
  AlertTriangle,
  BookOpen,
  Settings,
  LayoutGrid,
  Calendar,
  UserX,
  Users,
  Wrench,
  ArrowRight,
  ChevronDown,
  Search,
  Mail,
  PhoneCall,
  MapPin,
  GraduationCap,
  BrainCircuit,
  UserCheck,
  Settings2,
  CalendarRange,
  LogOut,
  MessageSquare
} from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import { pageKeyForPath } from "../../auth/pageAccess";
import { DutyNotificationBell } from "../crew/DutyNotifications";

// Reusable premium Dropdown Item component
function DropdownItem({ title, description, icon: Icon, iconColor, iconBg, path, active, onClick, allowWorkflowAccess = false }) {
  const { user } = useAuth();
  if (!allowWorkflowAccess && user?.permissions?.[pageKeyForPath(path)]?.view === false) return null;
  return (
    <Box
      onClick={() => onClick(path)}
      sx={{
        display: "flex",
        alignItems: "center",
        p: 1.1,
        borderRadius: "10px",
        cursor: "pointer",
        transition: "all 0.2s ease-in-out",
        backgroundColor: active ? (iconBg || "#F1F7F6") : "transparent",
        "&:hover": {
          backgroundColor: iconBg || "#F1F7F6",
          transform: "translateX(4px)",
        },
      }}
    >
      <Box
        sx={{
          width: 36,
          height: 36,
          borderRadius: "8px",
          backgroundColor: iconBg || "#F8FAFC",
          color: iconColor || "#64748B",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          mr: 1.5,
          flexShrink: 0,
        }}
      >
        <Icon size={18} strokeWidth={2.2} />
      </Box>
      <Box>
        <Typography sx={{ fontSize: 13, fontWeight: 700, color: "#1E293B", lineHeight: 1.2 }}>
          {title}
        </Typography>
        {description && (
          <Typography sx={{ fontSize: 10, color: "#64748B", fontWeight: 550, mt: 0.15 }}>
            {description}
          </Typography>
        )}
      </Box>
    </Box>
  );
}

export default function TopNavbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  // Modular dropdown states
  const [openMenu, setOpenMenu] = useState(null);

  // References for handling click outside
  const misRef = useRef(null);
  const analyticsRef = useRef(null);
  const reportRef = useRef(null);
  const crewRef = useRef(null);
  const adminRef = useRef(null);

  // Contact Dialog state
  const [isContactOpen, setIsContactOpen] = useState(false);

  // Toggle helper
  const toggleDropdown = (menuName) => {
    setOpenMenu(openMenu === menuName ? null : menuName);
  };

  // Close dropdown on navigation
  const handleNavigate = (path) => {
    navigate(path);
    setOpenMenu(null);
  };

  // Close menus when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (
        (openMenu === "mis" && misRef.current && !misRef.current.contains(event.target)) ||
        (openMenu === "analytics" && analyticsRef.current && !analyticsRef.current.contains(event.target)) ||
        (openMenu === "reports" && reportRef.current && !reportRef.current.contains(event.target)) ||
        (openMenu === "crew" && crewRef.current && !crewRef.current.contains(event.target)) ||
        (openMenu === "admin" && adminRef.current && !adminRef.current.contains(event.target))
      ) {
        setOpenMenu(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [openMenu]);

  // Determine active states for high-level main menu buttons
  const isHomepageActive = location.pathname === "/" || location.pathname === "/rtg-dashboard";
  
  const isMISActive = 
    location.pathname === "/psp-dashboard" || 
    location.pathname === "/rtg-dashboard" ||
    location.pathname === "/mis/nldc-plots" ||
    location.pathname === "/mis/schedule-data" ||
    location.pathname === "/psp-report-checking";
    
  const isAnalyticsActive =
    location.pathname === "/frequency-report" ||
    location.pathname === "/outage-analysis" ||
    location.pathname === "/outage-analysis/ml-training" ||
    location.pathname === "/mis-report";

  const isReportPreparationActive = location.pathname.startsWith("/report-preparation/");
  const isCrewActive = location.pathname.startsWith("/crew/") && location.pathname !== "/crew/user-context";
  const isOldLogbookActive = location.pathname === "/old-logbook";
  
  const isAdminActive =
    location.pathname === "/database-sync" ||
    location.pathname === "/psp-admin" ||
    location.pathname === "/admin/user-access" ||
    location.pathname === "/admin/mail-settings";

  // Reusable framer-motion properties
  const dropdownMotionProps = {
    initial: { opacity: 0, y: 12, scale: 0.98 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: 8, scale: 0.98 },
    transition: { duration: 0.16, ease: "easeOut" }
  };

  // Caret element pointing to the trigger center
  const caretElement = (
    <Box
      className="ui-kit-navbar"
      sx={{
        position: "absolute",
        top: -6,
        left: "50%",
        transform: "translateX(-50%) rotate(45deg)",
        width: 12,
        height: 12,
        background: "#FFFFFF",
        borderLeft: "1px solid #E2E8F0",
        borderTop: "1px solid #E2E8F0",
        zIndex: 1,
      }}
    />
  );

  // Common Box wrapper styles for dropdown panel
  const dropdownBoxStyles = {
    backgroundColor: "#FFFFFF",
    borderRadius: "16px",
    boxShadow: "0 10px 40px rgba(15, 98, 76, 0.08)",
    border: "1px solid #E2E8F0",
    p: 2.2,
    position: "relative",
    display: "flex",
    flexDirection: "column",
    gap: 1
  };

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: "#FFFFFF",
        borderRadius: "12px",
        boxShadow: "0 4px 14px rgba(15, 23, 42, 0.04)",
        border: "1px solid #E2E8F0",
        px: 3.5,
        py: 1.5,
        position: "relative",
        zIndex: 1000,
        width: "100%",
        boxSizing: "border-box",
      }}
    >
      {/* LEFT BRAND SECTION */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, minWidth: 330 }}>
        <Box component="img" src="/logo.png" alt="GRID-INDIA" sx={{ width: 108, height: 46, objectFit: "contain" }} />
        <Box>
          <Typography
            sx={{
              fontSize: 27,
              fontWeight: 950,
              color: "#0057B7",
              letterSpacing: "-0.035em",
              lineHeight: 0.95,
            }}
          >
            DRUPAd
          </Typography>
          <Typography
            sx={{
              fontSize: 8,
              fontWeight: 800,
              color: "#64748B",
              letterSpacing: "0.01em",
              lineHeight: 1.2,
              mt: 0.45,
              maxWidth: 205,
            }}
          >
            Data Dashboard &amp; Resource Utilization Portal for Administration
          </Typography>
        </Box>
      </Box>

      {/* MIDDLE NAVIGATION PILLS (Reorganized Modular Main Menus) */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.2 }}>
        {/* 1. Homepage Link */}
        <Button
          onClick={() => handleNavigate("/")}
          sx={{
            textTransform: "none",
            fontSize: 14,
            fontWeight: 700,
            color: isHomepageActive ? "#03624C" : "#475569",
            px: 2.2,
            py: 0.9,
            borderRadius: "999px",
            backgroundColor: "transparent",
            "&:hover": {
              backgroundColor: "#F1F7F6",
              color: "#03624C",
            },
          }}
        >
          Homepage
        </Button>

        {/* 2. CR Assistant Dropdown */}
        <Box ref={misRef} sx={{ position: "relative" }}>
          <Button
            onClick={() => toggleDropdown("mis")}
            endIcon={
              <ChevronDown
                size={14}
                style={{
                  transform: openMenu === "mis" ? "rotate(180deg)" : "rotate(0deg)",
                  transition: "transform 0.2s ease-in-out",
                  color: (openMenu === "mis" || isMISActive) ? "#03624C" : "#64748B"
                }}
              />
            }
            sx={{
              textTransform: "none",
              fontSize: 14,
              fontWeight: 700,
              color: (openMenu === "mis" || isMISActive) ? "#03624C" : "#475569",
              px: 2.2,
              py: 0.9,
              borderRadius: "999px",
              backgroundColor: openMenu === "mis" ? "#E6F0EE" : "transparent",
              "&:hover": {
                backgroundColor: "#F1F7F6",
                color: "#03624C",
              },
            }}
          >
            CR Assistant
          </Button>

          <AnimatePresence>
            {openMenu === "mis" && (
              <motion.div
                {...dropdownMotionProps}
                style={{
                  position: "absolute",
                  top: "calc(100% + 12px)",
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: 320,
                  zIndex: 1000,
                }}
              >
                <Box sx={dropdownBoxStyles}>
                  {caretElement}
                  <DropdownItem
                    title="PSP Report Check"
                    description="Verify daily PSP sheets and validation logs"
                    icon={CheckSquare}
                    iconColor="#1ABC9C"
                    iconBg="#EAFAF1"
                    path="/psp-report-checking"
                    active={location.pathname === "/psp-report-checking"}
                    onClick={handleNavigate}
                  />
                  <DropdownItem
                    title="PSP Dashboard"
                    description="Daily peak load curves and statistics"
                    icon={TrendingUp}
                    iconColor="#03624C"
                    iconBg="#E8F5F1"
                    path="/psp-dashboard"
                    active={location.pathname === "/psp-dashboard"}
                    onClick={handleNavigate}
                  />
                  <DropdownItem
                    title="CR Health Card"
                    description="Current control-room generation health and outages"
                    icon={Zap}
                    iconColor="#03624C"
                    iconBg="#E8F5F1"
                    path="/rtg-dashboard"
                    active={location.pathname === "/rtg-dashboard"}
                    onClick={handleNavigate}
                  />
                  <DropdownItem
                    title="NLDC Plots"
                    description="All India one-minute demand and generation"
                    icon={Activity}
                    iconColor="#0057B7"
                    iconBg="#EAF2FF"
                    path="/mis/nldc-plots"
                    active={location.pathname === "/mis/nldc-plots"}
                    onClick={handleNavigate}
                  />
                  <Typography sx={{ px: 1.5, pt: 1, pb: .4, color: "#64748B", fontSize: 10, fontWeight: 900, letterSpacing: .7 }}>DATA</Typography>
                  <DropdownItem
                    title="Schedule Data"
                    description="WBES generator schedules by date and resolution"
                    icon={Database}
                    iconColor="#0057B7"
                    iconBg="#EAF2FF"
                    path="/mis/schedule-data"
                    active={location.pathname === "/mis/schedule-data"}
                    onClick={handleNavigate}
                  />
                </Box>
              </motion.div>
            )}
          </AnimatePresence>
        </Box>

        {/* 3. Analytics Dropdown */}
        <Box ref={analyticsRef} sx={{ position: "relative" }}>
          <Button
            onClick={() => toggleDropdown("analytics")}
            endIcon={
              <ChevronDown
                size={14}
                style={{
                  transform: openMenu === "analytics" ? "rotate(180deg)" : "rotate(0deg)",
                  transition: "transform 0.2s ease-in-out",
                  color: (openMenu === "analytics" || isAnalyticsActive) ? "#03624C" : "#64748B"
                }}
              />
            }
            sx={{
              textTransform: "none",
              fontSize: 14,
              fontWeight: 700,
              color: (openMenu === "analytics" || isAnalyticsActive) ? "#03624C" : "#475569",
              px: 2.2,
              py: 0.9,
              borderRadius: "999px",
              backgroundColor: openMenu === "analytics" ? "#E6F0EE" : "transparent",
              "&:hover": {
                backgroundColor: "#F1F7F6",
                color: "#03624C",
              },
            }}
          >
            Analytics
          </Button>

          <AnimatePresence>
            {openMenu === "analytics" && (
              <motion.div
                {...dropdownMotionProps}
                style={{
                  position: "absolute",
                  top: "calc(100% + 12px)",
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: 340,
                  zIndex: 1000,
                }}
              >
                <Box sx={dropdownBoxStyles}>
                  {caretElement}
                  <DropdownItem
                    title="Frequency Data Analysis"
                    description="Frequency graphs and deviation logs"
                    icon={Activity}
                    iconColor="#2980B9"
                    iconBg="#EAF2F8"
                    path="/frequency-report"
                    active={location.pathname === "/frequency-report"}
                    onClick={handleNavigate}
                  />
                  <DropdownItem
                    title="S/D Analysis"
                    description="Outage breakdowns and duration details"
                    icon={AlertTriangle}
                    iconColor="#C0392B"
                    iconBg="#FDEDEC"
                    path="/outage-analysis"
                    active={location.pathname === "/outage-analysis"}
                    onClick={handleNavigate}
                  />
                  <DropdownItem
                    title="ML Training Centre"
                    description="Train outage classification and restoration models"
                    icon={BrainCircuit}
                    iconColor="#0057B8"
                    iconBg="#EAF2FF"
                    path="/outage-analysis/ml-training"
                    active={location.pathname === "/outage-analysis/ml-training"}
                    onClick={handleNavigate}
                  />
                  <DropdownItem
                    title="Generic Reports"
                    description="Spreadsheet and PDF MIS reports"
                    icon={FileText}
                    iconColor="#F1C40F"
                    iconBg="#FEF9E7"
                    path="/mis-report"
                    active={location.pathname === "/mis-report"}
                    onClick={handleNavigate}
                  />
                </Box>
              </motion.div>
            )}
          </AnimatePresence>
        </Box>

        {/* Report Preparation */}
        <Box ref={reportRef} sx={{ position: "relative" }}>
          <Button
            onClick={() => toggleDropdown("reports")}
            endIcon={
              <ChevronDown
                size={14}
                style={{
                  transform: openMenu === "reports" ? "rotate(180deg)" : "rotate(0deg)",
                  transition: "transform 0.2s ease-in-out",
                  color: (openMenu === "reports" || isReportPreparationActive) ? "#03624C" : "#64748B"
                }}
              />
            }
            sx={{
              textTransform: "none",
              fontSize: 14,
              fontWeight: 700,
              color: (openMenu === "reports" || isReportPreparationActive) ? "#03624C" : "#475569",
              px: 2.2,
              py: 0.9,
              borderRadius: "999px",
              backgroundColor: openMenu === "reports" ? "#E6F0EE" : "transparent",
              "&:hover": { backgroundColor: "#F1F7F6", color: "#03624C" },
            }}
          >
            Report Preparation
          </Button>
          <AnimatePresence>
            {openMenu === "reports" && (
              <motion.div
                {...dropdownMotionProps}
                style={{
                  position: "absolute",
                  top: "calc(100% + 12px)",
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: 330,
                  zIndex: 1000,
                }}
              >
                <Box sx={dropdownBoxStyles}>
                  {caretElement}
                  <DropdownItem
                    title="DSO Evening"
                    description="00:00–16:59 SCADA and CRMS report"
                    icon={FileText}
                    iconColor="#0057B7"
                    iconBg="#EAF2FF"
                    path="/report-preparation/dso-evening"
                    active={location.pathname === "/report-preparation/dso-evening"}
                    onClick={handleNavigate}
                  />
                  <DropdownItem
                    title="DSO Morning"
                    description="Morning DSO report preparation"
                    icon={FileText}
                    iconColor="#008645"
                    iconBg="#E9F8F0"
                    path="/report-preparation/dso-morning"
                    active={location.pathname === "/report-preparation/dso-morning"}
                    onClick={handleNavigate}
                  />
                  <DropdownItem
                    title="PSP Highlights"
                    description="Operational highlights report and downloads"
                    icon={TrendingUp}
                    iconColor="#0057B7"
                    iconBg="#EAF2FF"
                    path="/report-preparation/psp-highlights"
                    active={location.pathname === "/report-preparation/psp-highlights"}
                    onClick={handleNavigate}
                  />
                  <DropdownItem
                    title="Plant Deviation from I/C - MOP"
                    description="Thermal and hydro plant deviation report"
                    icon={Activity}
                    iconColor="#0057B7"
                    iconBg="#EAF2FF"
                    path="/report-preparation/plant-deviation"
                    active={location.pathname === "/report-preparation/plant-deviation"}
                    onClick={handleNavigate}
                  />
                </Box>
              </motion.div>
            )}
          </AnimatePresence>
        </Box>

        {/* 4. Crew Management Dropdown (Two Column layout matching Leave & Admin specification) */}
        <Box ref={crewRef} sx={{ position: "relative" }}>
          <Button
            onClick={() => toggleDropdown("crew")}
            endIcon={
              <ChevronDown
                size={14}
                style={{
                  transform: openMenu === "crew" ? "rotate(180deg)" : "rotate(0deg)",
                  transition: "transform 0.2s ease-in-out",
                  color: (openMenu === "crew" || isCrewActive) ? "#03624C" : "#64748B"
                }}
              />
            }
            sx={{
              textTransform: "none",
              fontSize: 14,
              fontWeight: 700,
              color: (openMenu === "crew" || isCrewActive) ? "#03624C" : "#475569",
              px: 2.2,
              py: 0.9,
              borderRadius: "999px",
              backgroundColor: openMenu === "crew" ? "#E6F0EE" : "transparent",
              "&:hover": {
                backgroundColor: "#F1F7F6",
                color: "#03624C",
              },
            }}
          >
            Crew Management
          </Button>

          <AnimatePresence>
            {openMenu === "crew" && (
              <motion.div
                {...dropdownMotionProps}
                style={{
                  position: "absolute",
                  top: "calc(100% + 12px)",
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: "min(720px, calc(100vw - 32px))",
                  zIndex: 1000,
                }}
              >
                <Box
                  sx={{
                    backgroundColor: "#FFFFFF",
                    borderRadius: "18px",
                    boxShadow: "0 15px 45px rgba(15, 98, 76, 0.09)",
                    border: "1px solid #E2E8F0",
                    p: 2.5,
                    position: "relative",
                    maxHeight: "calc(100vh - 110px)",
                    overflowY: "auto",
                  }}
                >
                  {caretElement}
                  <Box sx={{ display: "grid", gridTemplateColumns: "minmax(220px, .9fr) 1px minmax(320px, 1.35fr)", columnGap: 2.5, alignItems: "start" }}>
                    {/* Left side: Crew user workflows */}
                    <Box sx={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                      <Typography
                        sx={{
                          fontSize: 11,
                          fontWeight: 800,
                          color: "#03624C",
                          letterSpacing: "0.06em",
                          mb: 2,
                          textTransform: "uppercase"
                        }}
                      >
                        User Module
                      </Typography>
                      <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                        <DropdownItem
                          title="Dashboard"
                          icon={LayoutGrid}
                          iconColor="#03624C"
                          iconBg="#E8F5F1"
                          path="/crew/dashboard"
                          active={location.pathname === "/crew/dashboard"}
                          onClick={handleNavigate}
                        />
                        <DropdownItem
                          title="Calendar"
                          icon={Calendar}
                          iconColor="#03624C"
                          iconBg="#E8F5F1"
                          path="/crew/calendar"
                          active={location.pathname === "/crew/calendar"}
                          onClick={handleNavigate}
                        />
                        <DropdownItem
                          title="Leave"
                          icon={UserX}
                          iconColor="#C0392B"
                          iconBg="#FDEDEC"
                          path="/crew/leave"
                          active={location.pathname === "/crew/leave"}
                          onClick={handleNavigate}
                        />
                        <DropdownItem
                          title="Replacement"
                          icon={Wrench}
                          iconColor="#16A085"
                          iconBg="#E8F8F5"
                          path="/crew/replacement"
                          active={location.pathname === "/crew/replacement"}
                          onClick={handleNavigate}
                          allowWorkflowAccess
                        />
                        <DropdownItem
                    title="Crew Notices"
                    description="Team announcements and file sharing"
                    icon={MessageSquare}
                    iconColor="#0057B7"
                    iconBg="#EAF2FF"
                          path="/crew/threads"
                          active={location.pathname === "/crew/threads"}
                          onClick={handleNavigate}
                        />
                        <DropdownItem
                          title="Crew Reports"
                          description="Leave, training, C-OFF and replacement duty"
                          icon={FileText}
                          iconColor="#0057B7"
                          iconBg="#EAF2FF"
                          path="/crew/reports"
                          active={location.pathname === "/crew/reports"}
                          onClick={handleNavigate}
                        />
                      </Box>
                    </Box>

                    {/* Divider */}
                    <Divider orientation="vertical" flexItem sx={{ height: "100%", borderStyle: "dashed" }} />

                    {/* Right side: Admin Module */}
                    <Box sx={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                      <Typography
                        sx={{
                          fontSize: 11,
                          fontWeight: 800,
                          color: "#03624C",
                          letterSpacing: "0.06em",
                          mb: 2,
                          textTransform: "uppercase"
                        }}
                      >
                        Admin Module
                      </Typography>
                      <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                        <DropdownItem
                          title="Employee Master"
                          icon={Users}
                          iconColor="#03624C"
                          iconBg="#E8F5F1"
                          path="/crew/employees"
                          active={location.pathname === "/crew/employees"}
                          onClick={handleNavigate}
                        />
                        <DropdownItem
                          title="Departmental Chart"
                          description="View vertical and reporting hierarchy"
                          icon={Users}
                          iconColor="#0057B7"
                          iconBg="#EAF2FF"
                          path="/crew/organization"
                          active={location.pathname === "/crew/organization"}
                          onClick={handleNavigate}
                        />
                        <DropdownItem
                          title="Organization Master"
                          description="Map departments, sections, functions and heads"
                          icon={Settings2}
                          iconColor="#0057B7"
                          iconBg="#EAF2FF"
                          path="/crew/organization-master"
                          active={location.pathname === "/crew/organization-master"}
                          onClick={handleNavigate}
                        />
                        <DropdownItem
                          title="Holiday & Training"
                          description="Training approval inbox and administration"
                          icon={GraduationCap}
                          iconColor="#9B59B6"
                          iconBg="#F5EEF8"
                          path="/crew/training"
                          active={location.pathname === "/crew/training"}
                          onClick={handleNavigate}
                          allowWorkflowAccess
                        />
                        {(user?.permissions?.crew_roster?.view !== false
                          || user?.permissions?.crew_presentation?.view !== false) && (
                          <Box sx={{ p: .65, border: "1px solid #D9E6F5", borderRadius: "12px", background: "#F8FBFF" }}>
                            <Typography sx={{ px: 1, pt: .3, pb: .45, fontSize: 10, fontWeight: 900, color: "#0057B7", letterSpacing: ".06em", textTransform: "uppercase" }}>
                              Roster
                            </Typography>
                            <DropdownItem
                              title="Shift Duty Roster"
                              icon={CalendarRange}
                              iconColor="#E67E22"
                              iconBg="#FEF4EA"
                              path="/crew/roster"
                              active={location.pathname === "/crew/roster"}
                              onClick={handleNavigate}
                            />
                            <DropdownItem
                              title="Morning Presentation"
                              description="Monthly two-day presentation cycle"
                              icon={CalendarRange}
                              iconColor="#0057B7"
                              iconBg="#EAF2FF"
                              path="/crew/morning-presentation"
                              active={location.pathname === "/crew/morning-presentation"}
                              onClick={handleNavigate}
                            />
                          </Box>
                        )}
                        <DropdownItem
                          title="Group Management"
                          icon={Settings}
                          iconColor="#7F8C8D"
                          iconBg="#EAEDED"
                          path="/crew/setup"
                          active={location.pathname === "/crew/setup"}
                          onClick={handleNavigate}
                        />
                        <DropdownItem
                          title="Dropdown Management"
                          description="Maintain crew dropdown master values"
                          icon={CheckSquare}
                          iconColor="#0057B7"
                          iconBg="#EAF2FF"
                          path="/crew/dropdowns"
                          active={location.pathname === "/crew/dropdowns"}
                          onClick={handleNavigate}
                        />
                      </Box>
                    </Box>
                  </Box>
                </Box>
              </motion.div>
            )}
          </AnimatePresence>
        </Box>

        {/* 5. Old Logbook Direct Link */}
        <Button
          onClick={() => handleNavigate("/old-logbook")}
          sx={{
            textTransform: "none",
            fontSize: 14,
            fontWeight: 700,
            color: isOldLogbookActive ? "#03624C" : "#475569",
            px: 2.2,
            py: 0.9,
            borderRadius: "999px",
            backgroundColor: "transparent",
            "&:hover": {
              backgroundColor: "#F1F7F6",
              color: "#03624C",
            },
          }}
        >
          Old Logbook
        </Button>

        {/* 6. Admin Module Dropdown */}
        <Box ref={adminRef} sx={{ position: "relative" }}>
          <Button
            onClick={() => toggleDropdown("admin")}
            endIcon={
              <ChevronDown
                size={14}
                style={{
                  transform: openMenu === "admin" ? "rotate(180deg)" : "rotate(0deg)",
                  transition: "transform 0.2s ease-in-out",
                  color: (openMenu === "admin" || isAdminActive) ? "#03624C" : "#64748B"
                }}
              />
            }
            sx={{
              textTransform: "none",
              fontSize: 14,
              fontWeight: 700,
              color: (openMenu === "admin" || isAdminActive) ? "#03624C" : "#475569",
              px: 2.2,
              py: 0.9,
              borderRadius: "999px",
              backgroundColor: openMenu === "admin" ? "#E6F0EE" : "transparent",
              "&:hover": {
                backgroundColor: "#F1F7F6",
                color: "#03624C",
              },
            }}
          >
            Admin Module
          </Button>

          <AnimatePresence>
            {openMenu === "admin" && (
              <motion.div
                {...dropdownMotionProps}
                style={{
                  position: "absolute",
                  top: "calc(100% + 12px)",
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: 320,
                  zIndex: 1000,
                }}
              >
                <Box sx={dropdownBoxStyles}>
                  {caretElement}
                  <DropdownItem
                    title="Database Sync (RTG)"
                    description="Synchronize power stations detail"
                    icon={Database}
                    iconColor="#E67E22"
                    iconBg="#FEF4EA"
                    path="/database-sync"
                    active={location.pathname === "/database-sync"}
                    onClick={handleNavigate}
                  />
                  <DropdownItem
                    title="PSP Settings"
                    description="Configure daily peak capacities"
                    icon={Settings2}
                    iconColor="#9B59B6"
                    iconBg="#F5EEF8"
                    path="/psp-admin"
                    active={location.pathname === "/psp-admin"}
                    onClick={handleNavigate}
                  />
                  <DropdownItem
                    title="User Access Control"
                    description="Assign page View and Write access"
                    icon={UserCheck}
                    iconColor="#03624C"
                    iconBg="#E8F5F1"
                    path="/admin/user-access"
                    active={location.pathname === "/admin/user-access"}
                    onClick={handleNavigate}
                  />
                  <DropdownItem
                    title="Mail & 2FA Settings"
                    description="Configure replacement-duty mail delivery"
                    icon={Mail}
                    iconColor="#0057B7"
                    iconBg="#EAF2FF"
                    path="/admin/mail-settings"
                    active={location.pathname === "/admin/mail-settings"}
                    onClick={handleNavigate}
                  />
                </Box>
              </motion.div>
            )}
          </AnimatePresence>
        </Box>
      </Box>

      {/* RIGHT UTILITIES SECTION */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
        {/* Search bar */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            backgroundColor: "#F8FAFC",
            borderRadius: "14px",
            px: 1.8,
            py: 0.8,
            width: 160,
            border: "1px solid #E2E8F0",
            transition: "all 0.2s ease-in-out",
            "&:focus-within": {
              borderColor: "#03624C",
              boxShadow: "0 0 0 3px rgba(3, 98, 76, 0.08)",
              backgroundColor: "#FFFFFF"
            },
          }}
        >
          <Search size={16} color="#64748B" style={{ marginRight: 8 }} />
          <InputBase
            placeholder="Search..."
            sx={{
              fontSize: 13,
              fontWeight: 600,
              width: "100%",
              "& input::placeholder": {
                color: "#94A3B8",
                opacity: 1,
              },
            }}
          />
        </Box>

        {/* Mail Icon */}
        <IconButton
          onClick={() => handleNavigate("/crew/user-context")}
          sx={{
            color: "#64748B",
            p: 1.1,
            backgroundColor: "#F8FAFC",
            border: "1px solid #E2E8F0",
            borderRadius: "12px",
            "&:hover": { color: "#03624C", backgroundColor: "#F1F7F6" }
          }}
        >
          <Badge color="success" variant="dot" invisible>
            <Mail size={18} />
          </Badge>
        </IconButton>

        {/* Actionable replacement-duty notifications */}
        <DutyNotificationBell />

        {/* Contact CTA Button (Mockup style) */}
        <Button
          onClick={() => setIsContactOpen(true)}
          sx={{
            textTransform: "none",
            fontSize: 14,
            fontWeight: 700,
            color: "#FFFFFF",
            backgroundColor: "#03624C",
            px: 2.8,
            py: 1.1,
            borderRadius: "12px",
            boxShadow: "0 4px 12px rgba(3, 98, 76, 0.15)",
            "&:hover": {
              backgroundColor: "#024c3b",
              boxShadow: "0 6px 16px rgba(3, 98, 76, 0.25)",
            },
          }}
        >
          Contact
        </Button>

        {/* User Profile Avatar with square-rounded mockup styling */}
        <Box
          onClick={() => handleNavigate("/crew/profile")}
          sx={{
            width: 40,
            height: 40,
            borderRadius: "12px",
            border: "2px solid #E2E8F0",
            overflow: "hidden",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "all 0.2s ease-in-out",
            "&:hover": {
              borderColor: "#03624C",
              transform: "scale(1.05)",
            }
          }}
        >
          <Avatar
            variant="square"
            sx={{ width: "100%", height: "100%", bgcolor: "#E8F1FB", color: "#0057B7", fontWeight: 800 }}
            src={user?.profilePhoto || undefined}
            alt={user?.name || user?.employeeId || "User profile"}
          >
            {(user?.name || user?.employeeId || "U").slice(0, 1).toUpperCase()}
          </Avatar>
        </Box>

        <Button
          onClick={async () => { await logout(); navigate("/login", { replace: true }); }}
          startIcon={<LogOut size={15} />}
          aria-label="Logout"
          sx={{ minWidth: "auto", px: { xs: 1.2, xl: 1.8 }, color: "#0057B7", border: "1px solid #B8CCE3", background: "#E8F1FB", fontWeight: 800, "&:hover": { background: "#DCEBFA", borderColor: "#8FB3DF" } }}
        >
          <Box component="span">Logout</Box>
        </Button>
      </Box>

      {/* CONTACT DIALOG (Provides support contact details + navigation to User Switcher) */}
      <Dialog
        open={isContactOpen}
        onClose={() => setIsContactOpen(false)}
        PaperProps={{
          sx: {
            borderRadius: "20px",
            p: 1.5,
            width: "100%",
            maxWidth: 420,
            border: "1px solid #E2E8F0"
          }
        }}
      >
        <DialogTitle sx={{ fontWeight: 800, fontSize: 20, color: "#03624C", pb: 1 }}>
          DRUPAd System Support
        </DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2.5, pt: 1.5 }}>
          <Typography sx={{ fontSize: 13.5, color: "#64748B", fontWeight: 550, lineHeight: 1.5 }}>
            Reach out to the system administrator or control room supervisor for access context and permission queries.
          </Typography>

          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.8 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
              <Box sx={{ width: 36, height: 36, borderRadius: "8px", backgroundColor: "#E8F5F1", color: "#03624C", display: "flex", alignItems: "center", justify: "center", flexShrink: 0, pl: 1.1 }}>
                <PhoneCall size={16} />
              </Box>
              <Box>
                <Typography sx={{ fontSize: 10, color: "#94A3B8", fontWeight: 700, uppercase: true }}>CONTROL ROOM DIRECT</Typography>
                <Typography sx={{ fontSize: 13.5, color: "#334155", fontWeight: 700 }}>+91 (033) 2465-9871</Typography>
              </Box>
            </Box>

            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
              <Box sx={{ width: 36, height: 36, borderRadius: "8px", backgroundColor: "#E8F5F1", color: "#03624C", display: "flex", alignItems: "center", justify: "center", flexShrink: 0, pl: 1.1 }}>
                <Mail size={16} />
              </Box>
              <Box>
                <Typography sx={{ fontSize: 10, color: "#94A3B8", fontWeight: 700, uppercase: true }}>EMAIL HELPDESK</Typography>
                <Typography sx={{ fontSize: 13.5, color: "#334155", fontWeight: 700 }}>dhruv.support@powergrid.in</Typography>
              </Box>
            </Box>

            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
              <Box sx={{ width: 36, height: 36, borderRadius: "8px", backgroundColor: "#FEF4EA", color: "#E67E22", display: "flex", alignItems: "center", justify: "center", flexShrink: 0, pl: 1.1 }}>
                <MapPin size={16} />
              </Box>
              <Box>
                <Typography sx={{ fontSize: 10, color: "#94A3B8", fontWeight: 700, uppercase: true }}>LOCATION</Typography>
                <Typography sx={{ fontSize: 13.5, color: "#334155", fontWeight: 700 }}>State Load Despatch Centre (SLDC)</Typography>
              </Box>
            </Box>
          </Box>

          <Divider sx={{ my: 1 }} />

          <Box
            onClick={() => {
              setIsContactOpen(false);
              handleNavigate("/admin/user-access");
            }}
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              p: 1.5,
              borderRadius: "12px",
              border: "1px solid #E2E8F0",
              backgroundColor: "#F8FAFC",
              cursor: "pointer",
              transition: "all 0.2s",
              "&:hover": {
                borderColor: "#03624C",
                backgroundColor: "#F1F7F6"
              }
            }}
          >
            <Box>
              <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: "#334155" }}>
                User Access Control
              </Typography>
              <Typography sx={{ fontSize: 11, color: "#64748B", fontWeight: 550, mt: 0.2 }}>
                Manage page-level View and Write permissions
              </Typography>
            </Box>
            <ArrowRight size={16} color="#03624C" />
          </Box>

          <Box
            onClick={async () => { setIsContactOpen(false); await logout(); navigate("/login", { replace: true }); }}
            sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", p: 1.5, borderRadius: "12px", border: "1px solid #FECACA", backgroundColor: "#FFF7F7", cursor: "pointer" }}
          >
            <Box><Typography sx={{ fontSize: 13.5, fontWeight: 700, color: "#991B1B" }}>Sign out</Typography><Typography sx={{ fontSize: 11, color: "#64748B" }}>{user?.name || user?.employeeId}</Typography></Box>
            <LogOut size={16} color="#B91C1C" />
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button
            onClick={() => setIsContactOpen(false)}
            sx={{
              textTransform: "none",
              color: "#64748B",
              fontWeight: 700,
              "&:hover": { backgroundColor: "#F1F5F9" }
            }}
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
