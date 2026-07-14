# Crew Management module migration

## Integrated scope

The legacy Crew Management calendar and roster engine are integrated into DHRUV as a
namespaced feature module. They use DHRUV's `AppShell`, top navigation, MUI theme, lazy
route loading, shared Axios base URL, and FastAPI application.

Menu routes:

- `/crew/dashboard` — Crew KPI dashboard, alerts and operational summaries
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

There are 118 Crew API routes in the combined redesigned and compatibility layers.

## Authentication boundary and acting employee

DHRUV currently has no shared login/authorization layer. All screens are migrated, and an
acting-employee selector supplies `X-Crew-Employee-ID` to identity-dependent APIs. Legacy
screens also receive compatible local-storage identity values.

This mechanism preserves functional behavior but is not authentication. Administration is
temporarily available to the selected internal operator. Deploy the module only on the
trusted internal network until DHRUV authentication supplies a verified employee ID and role.
At that point, replace the acting-user header with server-verified identity claims.

## Verification

- FastAPI application and Crew router compile and import successfully.
- MongoDB connection, group reads and cycle reads were verified against `crew_management`.
- Representative employee, leave-role, replacement-history, holiday, dashboard,
  shift-history and login-audit APIs returned HTTP 200 against the live database.
- Vite production build completes successfully with every Crew submodule emitted as a lazy
  page chunk.
