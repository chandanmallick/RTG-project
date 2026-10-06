# Software documentation

This is the single software document for the repository. Update its relevant sections for future work; keep source ownership and AI navigation in [AI_CODE_MAP.md](AI_CODE_MAP.md). Do not create separate Markdown documents for individual changes.

## Contents

- [Crew module architecture and migration](#integrated-scope)
- [Dash Test dashboard and sample preview](#dash-test-dashboard-and-sample-preview)
- [Crew workflow update](#crew-workflow-update)
- [Crew Management internal storage](#crew-management-internal-storage)
- [URL Based Deployment](#url-based-deployment)
- [WBES schedule fetch reference](#wbes-schedule-fetch-reference)

## Integrated scope

The legacy Crew Management calendar and roster engine are integrated into DHRUV as a
namespaced feature module. They use DHRUV's `AppShell`, top navigation, MUI theme, lazy
route loading, shared Axios base URL, and FastAPI application.

Menu routes:

- `/crew/dashboard` — Dash Test: ten-block crew dashboard (also `/crew/dash-test`)
- `/crew/calendar` — daily shift, leave, training and replacement calendar
- `/crew/roster` — generate, edit, save draft/final, publish, print and view history
- `/crew/setup` — roster-group management and eight-day cycle configuration
- `/crew/leave` — leave application, forwarding, approval, rejection and withdrawal
- `/crew/replacement` — replacement assignment, SIC assignment and history
- `/crew/training` — training, holiday and nomination workflows
- `/crew/employees` — employee master and import/export
- `/crew/duty-leave-types` — duty and leave type configuration
- `/crew/dropdowns` — Crew master dropdown configuration
- `/crew/shift-history` — employee shift history maintenance and import
- `/crew/organization` — departmental organization chart
- `/crew/profile` — acting employee profile, duty, leave, training and C-OFF statistics
- `/crew/login-audit` — legacy Crew login history and summary
- `/crew/user-context` — temporary acting-employee selection

Public sample route: `/crew/dash-test-preview` uses local demo fixtures and simulated interactions; it requires no login, backend or database. Live routes retain authentication and existing access checks. See [Dash Test preview](#dash-test-dashboard-and-sample-preview).

API root: `/api/crew`

## Database configuration

The module continues to use the existing Crew Management MongoDB collections. It does
not copy roster data into `rtg_db`.

Environment variables:

- `CREW_MONGO_URI`: Crew MongoDB connection string. Falls back to `MONGO_URI`.
- `CREW_MONGO_DB_NAME`: Crew database name. Defaults to `crew_management`.

The employee business key is `employeeId`, with legacy `userId` supported as a fallback.

## Roster rules retained

- Duty cycle: `E1 -> E2 -> M1 -> M2 -> N1 -> N2 -> O1 -> O2`.
- Generation is anchored to the configured base date and each group's starting duty.
- Only active groups are included.
- Drafts remain editable and deletable.
- Final rosters cannot be edited or deleted.
- Only final rosters can be published to the calendar.
- Publishing maps M/E/N/O codes to Morning/Evening/Night/OFF daily duties.
- Existing leave and training records take precedence over roster duty updates.
- Publishing updates employee shift-group history.
- Only one roster is marked as the currently published calendar roster.
- Group, member, signing-authority and leave-authority data are stored as roster snapshots.

The legacy duplicate-draft behavior was corrected: saving a loaded draft now updates the
same roster document instead of inserting another document.

## Complete legacy API compatibility

The original Crew business APIs are mounted below `/api/crew` alongside the redesigned
calendar/roster endpoints. This retains the existing leave, replacement, training,
notification, employee, profile, dashboard, audit, PDF and shift-history behavior while
preventing route collisions with DHRUV APIs.

Crew API routes are mounted by the combined redesigned and compatibility layers; consult the current FastAPI route definitions for the inventory.

## Authentication boundary and acting employee

Live Crew routes use the shared AuthProvider, bearer token and ProtectedRoute page permissions. Identity and decision authority are verified by the backend. Personal or delegated workflow actions retain their server-side authorization even when page editing is read-only. Legacy identity headers are compatibility metadata, not an authentication replacement.

The standalone `/crew/dash-test-preview` is a public sample route with generated fixtures. It skips auth-session refresh and makes no API/database requests. Its local forms and changes do not grant access to live workflows.

## Historical migration verification

- FastAPI application and Crew router compile and import successfully.
- MongoDB connection, group reads and cycle reads were verified against `crew_management`.
- Representative employee, leave-role, replacement-history, holiday, dashboard,
  shift-history and login-audit APIs returned HTTP 200 against the live database.
- Vite production build completes successfully with every Crew submodule emitted as a lazy
  page chunk.


## Dash Test integration verification (2 October 2026)

The dashboard changes are integrated on `main` with the five fetched commits through `2ec3b6e`. Shared application grouping/cancellation, nomination management, approval remarks, monthly replacement candidate targets/conflicts, Special Event roster controls and current-hierarchy inbox ownership are retained. Current verification uses isolated fixtures and a login-free browser preview; no live database is required. See [Dash Test preview](#dash-test-dashboard-and-sample-preview).


## Dash Test dashboard and sample preview

Special Event and coverage update (5 October 2026): Top actions now include Report linking to `/crew/reports`; cards are trimmed to fit six actions and pending approval counts use a larger bold badge. Upcoming shifts display a slow blinking Replacement required badge and affected personnel when `replacementRequired` is true with no assigned cover; clicking opens calendar coverage. Reduced-motion settings retain a static visible warning. The sample roster includes an uncovered duty.

Special Event management opens in a popup from the compact purple Special Event roster tile on the Duty Roster hero bar (`/crew/roster`). `SpecialEventRoster.jsx` mounts only when the popup opens. The popup uses a violet planning rail for Dates & department, Announce event, Block leave and Review staffing; the full management section no longer occupies the front Roster page. Mark special event creates an active announcement, optional last application submission date and immutable department scope, with leave still open. A separate confirmed Block leave action enables the restriction; Reopen leave keeps the announcement. Existing applications are unchanged. Administrators may choose one/multiple departments or all; HODs may manage only departments for which Organization Master identifies them as a head. Server validation applies to creation, blocking, staffing and export. Dates are inclusive, and the optional deadline must be on/before event start. The deadline is announced information; it does not automatically block submissions.

`SpecialEventNotice.jsx`, mounted by AppShell on authenticated Crew pages, displays relevant current/future announcements as a faster right-to-left strip (18-second cycle) on profile, duty, leave and other Crew pages. It includes dates, department names and deadline, then changes to No leave application in this period once blocking is enabled. It refreshes on event save, window focus and each minute; hover pauses scrolling, and reduced motion uses static scrollable text. Public sample routes do not query these APIs.

Backend ownership: `/api/crew/special-events` (list/mark), `/access`, `/{id}/blocking` and `/{id}/staffing` in `special_events.py`; records use existing internal `system_settings_collection` with `type=leave_block`, explicit `leaveBlocked` and department IDs. Legacy records without `leaveBlocked` remain global blocks and retain their disable/enable/delete controls. Department leave enforcement runs before any application/duty write in `apply_leave_v2`. New and legacy staffing retain the Excel endpoint. Browser and 39 isolated backend checks cover announcement separation, deadlines, HOD scope, all-department admin scope, affected employee filtering, blocking audit and the existing workflows. Live database validation remains separate.

Profile/navigation update (5 October 2026): Removed the menubar Contact button and dashboard test-title banner. The dashboard has no permanent profile sidebar. Clicking the menubar profile image opens a temporary left drawer with a blurred backdrop, large saved profile photo (initial fallback), identity and authority-gated Delegation of power link. Closing or clicking the backdrop restores the current page; View full profile navigates to `/crew/profile`, which has a large-photo left sidebar alongside its editable profile/statistics tiles. Drawer profile/access data loads only when opened. Dashboard layout uses a wider 360px event/upcoming-shift column, a slimmer roster beside a flexible leaderboard/leave-statistics column (at least 280px, roughly 38% of the main grid) and smaller top action cards. Below the dashboard are compact permission-filtered Duty Roster, Morning presentation, Crew reports, roster setup, employee, organization and user-access tiles, arranged in one desktop row and wrapping on mobile. Public previews use local workspaces without API requests and do not mount the authenticated menubar. Browser checks cover drawer blur/close, full-profile navigation, authority delegation and desktop/mobile dashboard interactions.

Approval and history refinement (5 October 2026): Admin sessions (including permanent administrator 50041) can open the approval chooser while dashboard data loads. Other users see Checking approval access until loading completes; failed permission loads display Approval access unavailable and never imply a confirmed restriction. Server authorization remains authoritative for each destination/action. Popups share rounded peach/pink styling, and the approval chooser includes a review illustration. History supports inclusive From/To overlap filtering after application grouping, All dates reset and matching counts. Links name their actual destinations: Leave tracking, Training history, Sports approval, Exchange history and Replacement duty board. Browser checks passed for delayed admin permissions, date filters and existing workflow interactions using mocked responses.

Updated 5 October 2026: Replacement opens a two-tab popup: Exchange (`duty`) and Replacement by other employees (`leave`), reusing `ReplacementManagement` with an explicit initial workflow. Approval opens a five-option chooser: Leave approval (`/crew/leave?section=pending`), Training Assignment (`/crew/training?section=assign`), Training approval (`/crew/training?section=pending`), Sports approval (`/crew/sports?section=approval`) and Replacement approval (`/crew/replacement?section=duty&focus=approvals`). Existing authority checks remain; training assignment authority also permits the chooser. Upcoming shifts use larger labels, personnel text, badges and padded tiles in a taller five-day scrolling panel. Public samples mirror both replacement tabs without API access. Production build and desktop/mobile browser checks passed, including switching both live replacement workflows, five approval choices, the leave-approval destination, and public samples with zero API requests.

Rechecked on 2 October 2026 against the five synced commits dated 1 October, through `2ec3b6e`. Browser checks confirm the roster link opens the existing Calendar menu page (`/crew/calendar`, Daily Duty Calendar), and the event link opens that same page in its existing Event view (`/crew/calendar?view=events`, Crew Event Calendar). Shared application-only, replacement, leave tracking/cancellation, training nomination editing and Special Event roster popups passed with mocked API responses. This verifies the synced checkout; live database workflows and any changes not committed/synced from another PC are outside this check.

Updated: 2 October 2026.

### Routes

- `/crew/dashboard` and `/crew/dash-test`: live dashboard, protected by the existing `crew_dashboard` permission. Data comes from the Crew APIs and requires the configured backend/database.
- `/crew/dash-test-preview`: public, interactive sample dashboard. No login, backend or database is required. Open this route directly to preview the design.

With the local Vite preview server on port 3012, open:
`http://localhost:3012/crew/dash-test-preview`.
For the normal development server on port 3001, use that port instead. A static production server must serve a frontend build containing this route.

### Dashboard blocks

1. Apply: the live calendar application popup for leave, training, sports and exchange.
2. Approval: five-option popup with direct links to existing approval/assignment pages, reporting/delegation access checks and pending counts; unavailable users see Access Restricted.
3. Tracking: applications from D−2 onward, own/authorised scope and amber pending rows.
4. History: leave, training, sports, exchange and replacement records; shared grouped leave applications, whole/date-wise cancellation, eligible single-date withdrawal and direct training nomination management.
5. Replacement: Exchange and Replacement by other employees tabs in a popup, both using the existing workspace.
6. Event Calendar: Special Event roster links to the Roster management page; month navigation and hover details; red holidays, purple training, green sports; full-calendar navigation.
7. Roster Calendar: D−1 through D+7, grouped personnel, abbreviated names and M/E/N/O shifts; full-calendar navigation.
8. Leader Board: top replacement duties over the existing 60-day period, with horizontal bars.
9. Stat of leave: monthly approved leave days by group. Statistics navigation is deferred as requested.
10. Upcoming shift: tomorrow through the next five days, grouped by shift in a scrollable list. `upcomingShiftPeople.js` combines regular roster staff, additional/double replacement duties and external cover from `replacementEmployee`, with one person per shift and a purple Replacement label. Calendar coverage includes acting-SIC metadata. Each tile shows the SIC/acting SIC full name in bold above the remaining crew; M/E/N remains the shift badge. A missing SIC shows **Assign SIC**, linking to the existing Crew Setup group/SIC configuration (local sample workspace in public preview). Loading does not show a false missing-SIC prompt.

### Sample behavior

The public preview renders the same dashboard component with `demo` enabled. Dates are relative to the day the preview opens; sample events are generated for the selected month. A sample reporting officer, four roster groups and all application categories populate the dashboard.

Apply and Replacement show local sample forms. Saving adds a record to Tracking and History. Leave cancellation/withdrawal updates the local sample record. Calendar, approval and record links open sample workspaces rather than protected live pages. Refresh resets the fixtures; reload discards all sample changes. Nothing is written to local storage or a database.

The preview skips auth-session refresh and dashboard API requests. It does not remove authentication from live routes or alter backend permissions. Preview forms demonstrate the design; they do not reproduce all live workflow validation.

### Source owners

- `frontend/src/crewLegacy/DashTest.jsx`: shared dashboard layout, live loading, tracking/history and preview branching.
- `frontend/src/crewLegacy/dashDemoData.js`: generated sample records, rosters, charts and events.
- `frontend/src/crewLegacy/DashDemoWorkspace.jsx`: sample forms and linked workspaces.
- `frontend/src/components/crew/groupLeaveApplications.js`: shared leave grouping used by the dashboard and LeaveManagement.
- `frontend/src/components/crew/TrainingCalendarReview.jsx`: live nomination editor, approval and adjacent OFF controls.
- `frontend/src/components/crew/SpecialEventRoster.jsx`: Roster event announcement, deadline, scope and separate leave-blocking controls.
- `frontend/src/components/crew/SpecialEventNotice.jsx`: scoped announcement strip across Crew pages.
- `frontend/src/components/crew/LeaveBlockedPeriods.jsx`: legacy global block controls and staffing/export compatibility.
- `frontend/src/pages/crew/CrewCalendar.jsx`: live `applicationOnly` popup mode.
- `frontend/src/App.jsx`: protected live routes and public sample route.
- `frontend/src/auth/AuthContext.jsx`: skips server session refresh on the public preview route.

### Validation

The live dashboard production build and browser checks covered desktop/mobile layout, approval access/navigation, pending counts, D−2/future tracking, personal scope, history, withdrawal, application-only and replacement popups, event month navigation and hover details using representative mocked API responses. Live database/account validation remains separate.

The public preview was checked in a fresh browser session with all `/api/` requests monitored or blocked: it rendered with zero API requests, no login screen or local-storage writes, supported sample submission and grouped cancellation, retained Special Event preview interactions and fit a mobile viewport. Reload was verified.


### Synced development baseline

Integrated the five fetched commits `289cd12`, `f022b18`, `777caed`, `6841982` and `2ec3b6e` into existing `main`; no new branch was created. The dashboard reuses their shared workflow components and APIs. The operations summary now refreshes hierarchy changes before counting pending applications. A safeguard Git stash retains the pre-integration dashboard edits. Changes remain uncommitted for review.

Post-integration verification passed: 32 isolated backend tests (8 operations, 10 leave-block/staffing/export, 14 calendar/workflow), browser checks for exact grouped-cancellation payloads, nomination-name editing through the shared editor, admin Special Event roster access, and the earlier dashboard interactions. The public sample passed with zero API requests and no local-storage writes in a fresh session. Production build validation uses `.dash-test-build` so the existing deployment output is not overwritten.


## Crew workflow update

### Dash Test dashboard

The Crew dashboard now uses the ten-block Dash Test layout: application, approval,
tracking, history and replacement actions; compact roster; event calendar;
replacement leader board; group leave statistics; and five-day upcoming shifts.
Live routes `/crew/dashboard` and `/crew/dash-test` retain authentication.
`/crew/dash-test-preview` is a login-free sample with local data and simulated
interactions, usable without a backend/database. Details and testing instructions:
[Dash Test preview](#dash-test-dashboard-and-sample-preview).

### Dashboard integration with synced workflows

Dash Test shares `groupLeaveApplications.js` with LeaveManagement, including legacy contiguous-date applications. Its history/tracking rows retain whole-application and selected-date cancellation through `LeaveTracking` and the existing cancel-group API. Approval navigation keeps the synced approval-remarks dialogs and their audit history. Training records open `TrainingCalendarReview`, including the existing nomination editor and adjacent OFF controls.

The Event Calendar card exposes Special Event roster only when `specialEventRoster.enabled` is returned by the server. It navigates to Duty Roster, where `SpecialEventRoster` separates announcement and scoped blocking; legacy `LeaveBlockedPeriods` controls retain staffing, Excel export and confirmed permanent deletion. Replacement and calendar popups reuse the updated candidate tables, monthly targets and conflict reasons. Operations summary refreshes unacted organization approval stages before calculating access and counts, so a changed reporting hierarchy takes effect in the dashboard too.

### Application tracking and leave period changes

Tracking and History show a summary submission/review timeline for training, sports, exchange and replacement, and the configured approval timeline for leave: green completed ticks, a purple current stage and muted upcoming stages. Rejected, cancelled and withdrawn requests stop the timeline without inventing completed approvals. **Track leave** opens a larger styled detail dialog with approval comments and audit information.

**Manage dates** (or **Approved leave dates**) opens the existing date-wise cancellation controls directly from authorised leave cards, including single-day approved records. Dates start unselected. Tracking and History provide an **Application status** filter and an **Approved leave** shortcut. Approved leave in Tracking offers only **Cancel selected dates**, with no whole-application shortcut, select-all checkbox or edit/withdraw controls. Cancellation submits the explicit selected dates, preserving all other dates. History retains approved-date management and its existing cancellation controls.

Cancelled (including legacy Canceled), rejected and withdrawn records do not count as active duplicate applications. The applicant can reapply for the same dates after cancellation by any authorised actor; existing history is retained. Active/pending/approved requests still block duplicates, and roster publication, department/event leave blocks, date scope, group and C-OFF checks still apply. Backend regressions exercise inactive versus active statuses without deleting history.

History exposes **Change dates** and **Apply revised dates** for the applicant, opening the existing Leave Apply page with employee/date context and a notice. Changing an approved period means cancelling dates no longer required and submitting revised dates for fresh approval; previous approval is not transferred to new dates. Cancelled/withdrawn/rejected applications offer **Reapply leave** from both views. Public preview navigation stays local.

**Edit leave period** is available to the applicant only while every date remains Applied and no approver or replacement decision has acted. Review the revised range (up to 93 dates), choose working-day leave types, station leave and C-OFF credits, then save. `PUT /api/crew/leave/period/{leave_id}` resolves the application on the server and reuses application validation for published roster, date scope, department/event leave blocks, duplicate requests, group limits and credit expiry/reservations. Retained dates keep their record IDs; removed dates are retained as withdrawn history under a revision group; new dates receive pending records. Period changes retain an audit of the old and new dates. Existing C-OFF reservations may be reused by their owning application; removed credits are released.

Conditional review/edit writes reject concurrent approval changes. Failed intermediate writes use compensation to restore leave records, duty leave fields and changed credit reservations on standalone MongoDB; this is not a multi-document transaction or recovery guarantee after a server/process failure. Shared workflow refresh events update calendar and leave views. The public preview simulates editing locally and makes no API/database calls.

Verification: frontend production build, dashboard browser regressions, a focused browser check for revised dates/station leave/selected approved-date cancellation/mobile dialogs, and isolated backend tests in `backend/tests/test_leave_period.py` covering ownership, acted siblings, validation-before-write, record retention, rollback and approval races. These checks do not use a live database.

### Leave availability

Open Crew > Duty Roster > **Special Event roster**. Administrators and department HODs use **Mark special event** to announce inclusive dates, scope and optional submission deadline. This initially leaves applications open. Select **Block leave** and confirm to prevent new applications in the event period for the selected departments; **Reopen leave** removes the restriction while keeping the announcement. Existing requests are unchanged. HODs cannot affect other departments or all departments. The server verifies scope against the current Organization Master. Relevant notices appear across Crew pages.

Older global blocks remain under the legacy Leave availability controls on Roster for administrators. Their temporary disable/enable and confirmed permanent delete actions retain their original audit/history behavior. New events use the separated announcement and blocking controls.

### Blocked-period staffing view

Every active block provides three date-wise views and a matching Excel export.
Disabled blocks remain visible to administrators but do not restrict applications
and do not expose a staffing action until re-enabled.
The first is Morning/Evening/Night duty strength with employees on active leave
excluded, followed immediately by optional selected-department additional
manpower. The second contains only employees on leave, shift-wise. The third
contains only replacement employees, shift-wise. Columns include date and weekday;
empty main-duty combinations display `NR`.

Additional strength is hidden by default. Selecting a department adds only that
department's staff as a separate row, and the Excel export reflects the same
selection. Excel keeps all names for one shift/date inside one multiline cell and
uses merged title and section-master rows. The backing endpoints are
`GET /leave/blocked-periods/{id}/staffing` and
`GET /leave/blocked-periods/{id}/staffing.xlsx`; the workbook includes both date
and weekday rows.

### Pending leave after hierarchy changes

Organization-based leave approval follows the employee's current Organization
Master hierarchy for every stage that has not yet been acted upon.
`refresh_unacted_organization_leave_workflows` runs before leave lists are
returned and rebuilds the current and future pending stages from
`organization_leave_approval_chain`.

Completed stages remain immutable audit evidence: actor, timestamp, comment and
delegation metadata are never rewritten. If the Reporting Officer, intermediary
officer, HOD or configured approval-level count changes, the next inbox owner is
the newly configured officer. Duplicate actors and already-completed levels are
not reintroduced.

Primary implementation anchors are `ensure_leave_dates_open`,
`blocked_period_staffing`, `get_blocked_period_staffing`,
`export_blocked_period_staffing`, and
`refresh_unacted_organization_leave_workflows` in
`backend/crew_legacy/api/leave_api.py`; the shared frontend is
`frontend/src/components/crew/LeaveBlockedPeriods.jsx` hosted by
`frontend/src/crewLegacy/LeaveManagement.jsx`.

### Published holidays

Both calendar endpoints read the current active Holiday Master for the requested
dates. A newly added holiday appears without republishing or changing shift duty.
The calendar refreshes on window focus, after a same-window holiday save, and once
per minute while visible. Deleted/inactive holiday markers no longer survive from
old daily snapshots.

### Nomination history

The history workspace opens on a compact training matrix. Use financial year,
name/ID/group and status filters; search programme columns and sort employees.
Status cells open the complete nomination details. Mixed states are identified
explicitly. Progress shows approved days against the existing seven-day target.
The full-matrix CSV remains available; the history table is a separate view on the
same page. Summary totals cover matching employees across all programmes.

### Crew reports

`/crew/reports` is the shared report hub with five tabs: Detailed activity report, Consolidated activity matrix, CRMS duty reconciliation, Training nomination history and Training nomination matrix. Deep links use `?tab=training-history` and `?tab=training-matrix`; the old `/crew/training?section=history` redirects to the training matrix tab. Dashboard tracking, Operations and training programme links use this hub.

The training tabs reuse `TrainingHolidayMaster` in `embeddedReport` mode, with its existing financial-year/search/status filters, nomination management, matrix details/targets and full CSV export. Unrelated holiday/programme/approval/my-training loading is skipped in report mode. The report header Refresh reloads the active training data. Existing training View access and server-authorized nomination actions remain in force. Report tabs scroll on mobile and are colored by report category; activity type colors are leave red, training purple, sports green, C-OFF gold and replacement blue, shared by detail row tints and matrix totals/columns.

Verification includes five focused Node tests (`node --test frontend/tests/upcomingShiftPeople.test.mjs`) for external cover, duplicate avoidance, double duties and acting-SIC scope; mocked browser checks for report tabs/review/CSV/old URLs/mobile and dashboard replacement rendering/column widths; existing login-free preview checks; frontend build and isolated Crew backend regressions. No operational database records are changed by these checks.

Employee selectors support name/ID search, multiple selections and removable
chips. Choose people and dates, then Load report. In Activity Explorer, search
loaded records, filter status, switch between Table and Compare, or export the
filtered records as CSV. Compare cards count activity records, not approved days.
The consolidated matrix also supports selecting multiple employees and keeps
employee identities visible when scrolling. Existing server-side report visibility
rules remain in force.

### Validation

The 2 October dashboard integration passed 32 isolated backend tests covering
operations, leave blocks/staffing/export and calendar workflows. Browser checks
also verified grouped cancellation payloads, nomination editing and the shared
Special Event roster popup. The public sample was verified without login or API
requests. See [Dash Test verification](#dash-test-dashboard-and-sample-preview).

Backend regression tests cover block boundaries, admin authorization, invalid
ranges, batched submissions and holiday overlays on published duties. Component
render checks use synthetic data. No real leave restrictions or nominations were
created during verification. Browser visual QA requires an available browser.


### Leave tracking and cancellation

Every visible leave record has Track leave, including Other Employees. The
tracking dialog shows its approval chain, current stage and cancellation/rejection
information. It is available from the leave table, leave calendar and the main
duty calendar's Track / manage leave workflow. Employees may cancel their own
active leave; administrators and the configured reporting authorities (including
active delegates) can cancel records in their authorised scope. The server makes
the decision; read-only page settings do not suppress these personal workflow
actions. Consumed replacement C-OFF credits still prevent cancellation.

### Changing training nominations

Click an existing nomination in the training calendar, or choose Manage training
from the main duty calendar. Nomination history and its matrix also open the same
controls. Edit nomination details provides name/location fields, a searchable employee selector and date fields. Dragging along the same employee row proposes a new start date and keeps
the nomination's duration; a reason and Save changes are required before it is
changed. Name, location and date edits apply to that nomination, not the whole Training Master entry.

Admins, HR and authorised nomination managers can edit or remove active
nominations. Employees can change their own pending requests. Approved changes
restart approval and restore the previous duties. Old replacement cover, acting
SIC assignments and linked training OFF requests are cleared. A new OFF request
can be made after approval. Remove nomination records a cancellation and preserves
history rather than deleting the audit record. Imported historical entries remain
read-only. Overlapping leave, training or other recorded assignments reject edits.

Duty and leave calendars refresh after a successful change, including other tabs
in the same browser. Reopen a nomination if another officer changed it. An
interrupted calendar update can be retried with Save to complete the stored change.

Deploy the backend and rebuilt frontend together, then restart through
start_server.bat and hard-refresh the browser (Ctrl+F5). Verification uses isolated
fixtures; operational leave and training records are not modified by tests.


## Crew Management internal storage

All Crew collections and the employee directory use the internal database.
The default server is `10.3.230.60:27017`, database `crew_management`.
New Crew Notice attachments remain in `backend/uploads/crew_threads`.
Existing GridFS attachments are read from the same internal database.

### Configuration

```dotenv
MONGO_URI=mongodb://10.3.230.60:27017/
MONGO_DB_NAME=rtg_db
CREW_LOCAL_MONGO_URI=mongodb://10.3.230.60:27017/
CREW_LOCAL_MONGO_DB_NAME=crew_management
```

Crew also accepts the existing `CREW_MONGO_URI`, `CREW_MONGO_DB_NAME`, and
`CREW_DATABASE_NAME` fallbacks. Database URIs must use the standard scheme
and private/loopback IP addresses, localhost, or an internal.erldc.in hostname.
Discovery URIs and external hostnames are rejected before network activity.
Obsolete cloud configuration is ignored; remove it from deployment environments.

Restart each deployed backend worker after installing this change. No remote
records are copied automatically: confirm required operational records and
attachments are available internally before resuming production use.


### Refresh a deployed instance

Copy the updated checkout (including `start_server.ps1`) to the actual LAN server.
Run `start_server.bat` from that folder. It prints the project path and local Git
commit, validates database configuration, rebuilds the frontend using installed
packages offline, stops recognized server process trees, clears backend bytecode,
and starts one backend without auto-reload plus the frontend. It opens the page
only after both respond. Logs are in `.runtime` in the project folder.
The launcher never pulls Git changes or installs dependencies. Latest means the
files currently in that folder; updating a development PC does not update a
separate deployment. Use your approved deployment procedure to transfer changes.

A Python environment with the backend requirements and installed frontend
packages is required. An existing `.venv` is preferred; otherwise Python on PATH
is used. An unrelated service on ports 8001/3001 causes an error rather than being
terminated. If a service manager restarts an old deployment, stop or update that
service first. Old copies on other ports or computers need separate retirement.

Use `powershell -NoProfile -File .\start_server.ps1 -CheckOnly` to inspect which
processes the launcher would replace, without changing anything.
Run `powershell -NoProfile -File .\diagnose_database_connections.ps1` on the
machine reported by the network team to identify processes using database port
27017. This inspection makes no database connection. A snapshot can miss short
attempts; repeat while the network team observes the traffic.

Both database clients use direct connections to a single internal endpoint.
Proxy URI options and multiple seed hosts are rejected. Replica member discovery
is disabled, so a server cannot redirect the driver to additional hosts.
Approved email and data feeds remain enabled; this is a database restriction,
not a machine-wide Internet firewall. Windows/browser traffic must be attributed
to its owning process separately.


### One-time Python setup

Run `setup_backend.bat` on each deployment machine to create `.venv` and install
`backend/requirements.txt`, including python-dotenv. This setup command uses the
configured package index; normal startup does not download packages. On an
isolated LAN machine, supply a folder of approved compatible wheels instead:
`setup_backend.bat D:\approved-wheels`. That mode uses `--no-index` and never
contacts a package index. Create the virtual environment on its destination
machine rather than copying `.venv` between computers.


### Database-free dashboard design preview

`/crew/dash-test-preview` uses generated browser-memory fixtures, makes no auth/Crew API requests and needs no backend or database. Sample changes are discarded on refresh/reload. Live dashboard routes continue to use the internal Crew database and existing authentication. See [Dash Test preview](#dash-test-dashboard-and-sample-preview).


## URL Based Deployment

The app is now prepared for URL/domain based access.

### Recommended Setup

Use one public URL for both frontend and backend:

```text
https://astro.example.in        -> frontend
https://astro.example.in/api    -> backend FastAPI
```

This is the simplest setup because the frontend already calls `/api` by default, so browser calls stay on the same domain.

### Backend

Run FastAPI on an internal port:

```powershell
cd D:\RTG-project\backend
$env:MONGO_URI="mongodb://10.3.230.60:27017/"
$env:MONGO_DB_NAME="rtg_db"
$env:CORS_ALLOW_ORIGINS="https://astro.example.in,http://localhost:3001"
python -m uvicorn main:app --host 127.0.0.1 --port 8001
```

For a Windows service or scheduled startup, set the same environment variables in the service configuration.

### Frontend

For production with same-domain `/api`, no API URL is needed:

```powershell
cd D:\RTG-project\frontend
npm run build
```

Serve `frontend/dist` from the public URL.

For local development:

```powershell
cd D:\RTG-project\frontend
$env:VITE_API_PROXY_TARGET="http://127.0.0.1:8001"
npm run dev
```

### Nginx Reverse Proxy Example

Replace `astro.example.in` with the real DNS name.

```nginx
server {
    listen 80;
    server_name astro.example.in;

    root D:/RTG-project/frontend/dist;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:8001/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

### DNS

Create a DNS record:

```text
astro.example.in -> server IP
```

After DNS and reverse proxy are ready, users should open only:

```text
https://astro.example.in
```

No browser-facing IP or port should be required.

### Notes

- Internal source systems such as RTG, PSP, CRMS, MDP, MongoDB, or network shares may still use internal IPs if those systems do not have DNS names.
- Browser-facing URLs are now configurable and should not be hardcoded in React source.
- In production, prefer HTTPS and set `CORS_ALLOW_ORIGINS` to the exact portal URL.
### Dash Test sample preview

After building the updated frontend, `/crew/dash-test-preview` provides a public
sample dashboard without login or database access. Live `/crew/dashboard` and
`/crew/dash-test` still require authentication. The public preview uses generated
fixtures and local simulated changes. See [preview instructions](#dash-test-dashboard-and-sample-preview).


## WBES schedule fetch reference

The WBES schedule API is configured in **PSP Settings** (`pipeline_config`, `config_type: PSP`).
The CR Health card's **All blocks / source** button displays all 96 state blocks
and the `NetScheduleSummary` response portion used to build them. ISGS comparison
rows provide **Inspect source**, including raw series, zero-based block index and
the generator sign conversion. Both sources are fetched fresh for reconciliation;
failed requests are shown as unavailable rather than compared against older data.
WBES request acronyms preserve the exact configured spelling: `Teesta_V` returns
data whereas `TEESTA_V` can return a zero-filled response. Cache keys remain
case-insensitive. Missing schedule fields are no longer manufactured as zeros.
Fetchers must read these values at runtime and must not embed credentials:

- `wbes_url`
- `wbes_api_key`
- `wbes_username`
- `wbes_password`

Endpoint:

```text
{wbes_url}?apikey={wbes_api_key}
```

Request body:

```json
{
  "Date": "DD-MM-YYYY",
  "SchdRevNo": -1,
  "UserName": "<configured wbes_username>",
  "UtilAcronymList": ["BIHAR_STATE"],
  "UtilRegionIdList": [1]
}
```

The response is read from `ResponseBody.GroupWiseDataList`. For each utility,
the net schedule is taken from:

```python
summary = fsData_stateAcronym["NetScheduleSummary"]
total_net_schedule = summary["TotalNetSchdAmount"]
net_schedule_components = summary["NetSchdDataList"]
```

`TotalNetSchdAmount` is the 96-point 15-minute net schedule. `NetSchdDataList`
contains the schedule components and may be used for category bifurcation via
the schedule-type fields. The MIS Schedule Data page expands the 15-minute
values to 5-minute or 1-minute display intervals by holding each published
value until the next WBES interval.

### Administrator leave deletion

Administrators can delete leave of any status, including cancelled leave, from Tracking, History and Leave Approval through the shared `LeaveTracking` / `LeaveDelete` controls. The confirmation lists individual dates, all selected initially. `DELETE /leave/master/{leave_id}` enforces administrator or existing Leave Master Permanent Delete permission, clears operational effects and retains the deletion audit. Successful dates refresh across workspaces even if a later date fails.
