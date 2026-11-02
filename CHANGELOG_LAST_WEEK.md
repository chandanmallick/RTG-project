# Weekly Changelog: 26-Oct-2026 to 02-Nov-2026

Comprehensive log of all architectural improvements, business rule enforcements, bug fixes, UI enhancements, and database validations implemented across the application over the past week.

---

## 1. Executive Summary

Over the past week, the platform underwent major enhancements centered around:
1. **Interactive Special Roster Matrix & Sequential Duty Allocation**: Drag-and-drop duty reassignment across shifts, dynamic acting SIC designation, and unified leave & replacement visual cards.
2. **Replacement Approval Hierarchy & Duty Notification Governance**: Enforcement of strict reporting hierarchy (only Reporting Officers / HODs can deny replacement duties; employees cannot deny duties), zero-padded employee ID normalization, and dynamic pending case counters in brackets across the **Approval Options** modal and Dashboard.
3. **PSP Report & Grid Demand Analytics Integration**: Added adjacent historical "Yesterday's demand" (D-2) column alongside daily PSP figures across Energy Consumption and Demand Check sections.
4. **Admin Navigation Restructuring & Route Fixes**: Reorganized the Admin Tiles pop-up into distinct master categories with updated nomenclature and fixed `/admin/psp-settings` route navigation.
5. **Project Hygiene & Production Optimization**: Full rebuild of production assets (`frontend/dist/`), removal of root-level debug scripts into a dedicated [`debug_scripts/`](debug_scripts/README.md) directory, and git repository synchronization.

---

## 2. Feature & Architectural Enhancements by Module

### A. Crew Management & Roster Matrix
*Key files: [`frontend/src/components/crew/SpecialRosterMatrix.jsx`](frontend/src/components/crew/SpecialRosterMatrix.jsx), [`backend/crew_legacy/api/special_events.py`](backend/crew_legacy/api/special_events.py)*

- **Unified Leave & Replacement Cards**:
  - Replaced separate multi-row cards with a compact unified card displaying the person on leave (red strikethrough with leave badge e.g. `[CL]`), blinking `[R]` badge for mandatory uncovered duties, and an integrated green replacement sub-box once assigned.
  - Resolved repeated name display: replaced `{actingSIC.name}` inside parentheses with a single clean pill `(Acting SIC)`. E.g., `Pranab Debnath (Acting SIC) [General]`.
- **Acting SIC Assignment for SIC-less Shifts**:
  - Implemented an amber banner and modal to assign an Acting Shift In-Charge when regular SICs are moved to another shift or when a shift is SIC-less.
- **Drag-and-Drop Duty Swapping**:
  - Seamless drag-and-drop reassignment of shift engineers between Morning, Evening, and Night shifts on the same day.
  - Automatic detection when a dragged employee is an active or acting SIC to prompt for acting SIC coverage.
- **Non-SIC Leave Classification Verification**:
  - Verified and confirmed that non-SIC employees on approved leave (such as Sandeep Kumar Maurya `00137` on `2026-11-08` Night Shift) remain classified as `isSIC: False` in both database records and matrix views, rendering in the regular shift member section at the bottom rather than the SIC header slot.

---

### B. Replacement Approval Hierarchy & Notification Engine
*Key files: [`backend/crew_legacy/api/replacement.py`](backend/crew_legacy/api/replacement.py), [`frontend/src/crewLegacy/DashTest.jsx`](frontend/src/crewLegacy/DashTest.jsx), [`backend/crew_legacy/api/operations_api.py`](backend/crew_legacy/api/operations_api.py)*

- **Strict Denial Authority (Employee Deny Disabled)**:
  - Enforced that **only Reporting Officers, HODs, or Administrators** can deny replacement duties (`canDeny = True`).
  - Employees assigned a replacement duty (`is_assignee`) have **no option to deny** in the UI or backend API (`canDeny = False`).
  - In the backend `PUT /replacement/notifications/deny/{id}`, an assertion confirms that assignees cannot execute denials.
- **Reporting Officer Reallocation Removed**:
  - Reporting officers and controlling officers only have `Accept Duty` and `Deny Duty` decisions.
  - The `Auto Sequential Allocate` and `Allocate Another Duty` buttons are strictly restricted to administrators (`isAdmin`).
- **Approval Options Modal & Dynamic Pending Counts in Brackets**:
  - In the **Approval Options** modal (`popup === "approval"`), all options now clearly show pending review counts in brackets:
    - **Leave approval (`X`)**
    - **Approval for Exchange request by shift (`X`)**
    - **Replacement approval (`X`)**
    - **Training Assignment (`X`)**
    - **Training approval (`X`)**
    - **Sports approval (`X`)**
  - Updated `/operations/summary` and `DashTest.jsx` so that `leaveReplacement` factors in pending duty notifications awaiting decision by the logged-in user or their direct subordinates.
  - Added pending replacement duty notification counts to Tile 2 ("Approvals & Assignments") counter on the Dashboard.
- **Zero-Padded ID Matching Normalization**:
  - Added helper `id_matches` across notification resolution to ensure integer and zero-padded string ID mismatches (e.g. `"203"` vs `"00203"`) do not break subordinate hierarchy matching.
- **Elapsed Date Rule**:
  - Removed pulsing denial alarms and blinking indicators for past/elapsed dates (`isElapsed: true`), keeping the dashboard clean.
- **ZoneInfo Server Error Resolution**:
  - Imported `ZoneInfo` from standard library `zoneinfo` in `replacement.py`, eliminating HTTP 500 crashes during notification retrieval.
- **Automated Reminder Cron Job**:
  - Added background email reminder for pending replacement duty approvals awaiting action by reporting officers and HODs.

---

### C. PSP Report Checking & Grid Analytics
*Key files: [`frontend/src/pages/PSPReportChecking.jsx`](frontend/src/pages/PSPReportChecking.jsx), [`backend/crew_legacy/api/psp_report.py`](backend/crew_legacy/api/psp_report.py)*

- **Yesterday's Demand (D-2) Integration**:
  - Added dedicated comparison columns across **"Energy Consumption"** and **"Demand Check"** (Maximum Demand, Peak Demand, Off Peak).
  - Fetches 1-day prior data relative to PSP data (if PSP is D-1, Yesterday's demand column integrates D-2 data) directly alongside PSP metrics for immediate trend verification.

---

### D. Navigation Restructuring & Admin Tiles Reorganization
*Key files: [`frontend/src/crewLegacy/DashTest.jsx`](frontend/src/crewLegacy/DashTest.jsx), [`frontend/src/App.jsx`](frontend/src/App.jsx)*

- **Admin Tiles Pop-Up Restructuring**:
  - Reorganized the quick-access Admin Tiles into the user-specified 7-item structure:
    1. **Duty Roster** (Badge: `Master` — `/crew/roster`)
    2. **Organizational Master** (Badge: `Hierarchy` — `/crew/organization-master`)
    3. **Morning Presentation** (Badge: `Daily` — `/crew/morning-presentation`)
    4. **Personnel** (Badge: `Personnel` — `/crew/employees`)
    5. **Dropdown Master** (Badge: `Master` — `/crew/dropdowns`)
    6. **Group Setup** (Badge: `Config` — `/crew/setup`)
    7. **System Audit Trail** (Badge: `Audit` — `/admin/audit`)
  - Rest of admin modules retained in standard sidebar/navigation menus.
- **Navigation Route Fix**:
  - Fixed `/admin/psp-settings` route mapping to resolve broken links.

---

### E. Codebase Structure & Workspace Cleanup
*Key files: [`debug_scripts/`](debug_scripts/)*

- Created dedicated [`debug_scripts/`](debug_scripts/README.md) directory containing all diagnostic tools:
  - `check_sandeep_leave.py`: Validates employee, daily, and leave records for `00137`.
  - `check_atanu_reporting.py`: Validates `00203` reporting officers (`50027`, `50023`, `20020`) and notification links.
  - `test_ro_rules.py`: Validates role-based permission flags (`canAccept`, `canDeny`, `canRevert`).
  - `check_notifications.py`: Inspects recent MongoDB duty notifications and decision histories.
- Removed all loose debug and test scripts from project root.

---

## 3. Chronological Commit History (26-Oct-2026 to 02-Nov-2026)

| Commit | Date & Time | Description |
|---|---|---|
| `ce1fd5a` | 2026-11-02 12:00 | Approval pending counts in brackets, frontend production build, and robust RO replacement review |
| `3998dea` | 2026-11-02 10:00 | Deny by Boss (restricted deny to reporting officer/HOD and removed employee deny) |
| `66ccc31` | 2026-10-30 18:08 | Duty Notice updates and notification indicators |
| `403c60d` | 2026-10-30 17:49 | SIC patch (format acting SIC pill without repeated name) |
| `ce1a42a` | 2026-10-30 15:01 | SIC patch (acting SIC display improvements) |
| `c3cf40a` | 2026-10-30 14:41 | PSP Yesterday Data, Pending Counts, Cron Job for Pending Approval Reminders, SIC Assignment for SIC-less Shifts |
| `ceae8ce` | 2026-10-30 12:36 | Patch for crew management and calendar integration |
| `d5cb17c` | 2026-10-30 11:52 | Crew management frontend components, services, and build assets |
| `ad4b444` | 2026-10-29 18:20 | Patch to New View (alternate matrix display) |
| `062f5eb` | 2026-10-29 17:22 | feat: add special events backend API, tests, and roster matrix frontend component |
| `27f0efd` | 2026-10-29 16:12 | Special roster matrix component, legacy test view, and duty roster pages with theme styling and backend api support |
| `e6ea545` | 2026-10-29 15:06 | Add crew legacy modules and frontend build assets |
| `81a5df8` | 2026-10-29 11:56 | feat: add frontend build assets and core layout components |
| `531f7f3` | 2026-10-28 18:02 | Patch for Duty roster, Replacement drag & drop |
| `76ab418` | 2026-10-28 16:53 | Add legacy crew roster management APIs, views, and related test suites |
| `b47c007` | 2026-10-28 13:47 | feat: add special events management API, staffing analytics, and frontend roster components |
| `26d5fd2` | 2026-10-28 12:19 | feat: add crew legacy modules, frequency reporting, and frontend UI components |
| `082ee7c` | 2026-10-26 13:04 | feat: add state performance heatmap service, robustness tests, and frequency analysis routes and reports |
| `8b304dd` | 2026-10-26 11:07 | feat: add state heatmap service, frequency analysis routes, and UI components |

---

## 4. Summary of Key Files Modified

| File Path | Nature of Changes |
|---|---|
| [`frontend/src/crewLegacy/DashTest.jsx`](frontend/src/crewLegacy/DashTest.jsx) | Dynamic pending counts in brackets for approval options, Tile 2 counters, reporting officer denial controls, hiding denial button from employees, hiding reallocate button from reporting officers. |
| [`backend/crew_legacy/api/replacement.py`](backend/crew_legacy/api/replacement.py) | Normalized ID matching (`id_matches`), restricted denial permissions, added `ZoneInfo` import, notification decision history logging. |
| [`backend/crew_legacy/api/operations_api.py`](backend/crew_legacy/api/operations_api.py) | Added pending duty notification counts to `/operations/summary` `leaveReplacement` and scheduled trainings to `trainingAssignment`. |
| [`frontend/src/components/crew/SpecialRosterMatrix.jsx`](frontend/src/components/crew/SpecialRosterMatrix.jsx) | Clean single `(Acting SIC)` pill rendering, acting SIC modal for SIC-less shifts, drag-and-drop duty swapping. |
| [`frontend/src/pages/PSPReportChecking.jsx`](frontend/src/pages/PSPReportChecking.jsx) | Integrated Yesterday's Demand (D-2) column across Energy Consumption and Demand Check tables. |
| [`frontend/dist/`](frontend/dist/) | Completely rebuilt Vite production bundle containing all updated components, stylesheets, and assets. |
| [`debug_scripts/`](debug_scripts/) | Created dedicated directory housing all database diagnostic and verification utilities. |
