# AI Code Map

Compact source-navigation index for this repository. Use it to locate the owner of a
feature before searching implementation details. Source code is authoritative; this file
points to it and should not duplicate implementation or business rules.

## AI Maintenance Rule

Maintain only this file and `CREW_MODULE_MIGRATION.md` as project Markdown documentation. Put software behavior, setup, deployment and verification in the software document; update the relevant section instead of creating a separate document for each task.

Whenever a code change adds, removes, renames, or moves a feature, route, page, API
handler, or owning module, update the matching entry in this file in the same change.
Keep the change local: amend the relevant row and add a row only for a genuinely new
feature. Preserve the concise format so this remains cheap to include in AI context.

## Repository Instructions

- Before exploring implementation, consult [AI_CODE_MAP.md](AI_CODE_MAP.md) to locate the feature's route, page, and owning service.
- Treat source code as authoritative; use the map for navigation, not as a substitute for reading the relevant implementation.
- When a change adds, removes, renames, or moves a feature, page, route, handler, or owning module, update the affected `AI_CODE_MAP.md` entry in the same change.
- Keep the code map concise and feature-oriented. Update existing rows instead of adding duplicate inventories or documenting trivial helpers.

## Request Flow

| Layer | Entry point | Responsibility |
|---|---|---|
| Frontend routes | [frontend/src/App.jsx](frontend/src/App.jsx): `App`, `protectedPage` | URL to page component and access key |
| Frontend API | [frontend/src/services/api.js](frontend/src/services/api.js), [frontend/src/services/crewApi.js](frontend/src/services/crewApi.js) | Shared API clients |
| Backend app | [backend/main.py](backend/main.py): `app`, `log_requests`, `startup_event`, `root` | Middleware, router mounting, scheduler startup, health response |
| Backend feature APIs | [backend/routes](backend/routes) | FastAPI routers and request handlers |
| Backend domain services | [backend/services](backend/services) | Shared integration, persistence, pipeline, and report logic |

## User Features

| Feature / UI route | Frontend owner | Backend owner | Function / lookup anchor |
|---|---|---|---|
| Login and access | [frontend/src/pages/Login.jsx](frontend/src/pages/Login.jsx), [frontend/src/pages/UserAccessControl.jsx](frontend/src/pages/UserAccessControl.jsx), [frontend/src/auth/ProtectedRoute.jsx](frontend/src/auth/ProtectedRoute.jsx) | [backend/crew_legacy/api/auth.py](backend/crew_legacy/api/auth.py), [backend/crew_legacy/api/admin_api.py](backend/crew_legacy/api/admin_api.py) | `ProtectedRoute` refreshes the live session once before denying a route, preventing stale grants. `UserAccessControl` presents `PAGE_CATALOG` permissions in menu-wise `ACCESS_GROUPS` with per-group bulk controls and access summaries. `_require_access_admin` authorizes read-only inspection with `user_access.view` and mutations with `user_access.write`; employee `50041` remains the permanent full administrator. |
| Home and RTG dashboard (`/`, `/rtg-dashboard`) | [frontend/src/pages/HomePage.jsx](frontend/src/pages/HomePage.jsx), [frontend/src/pages/RTGDashboard.jsx](frontend/src/pages/RTGDashboard.jsx) | [backend/routes/rtg_dashboard_routes.py](backend/routes/rtg_dashboard_routes.py), [backend/services/rtg_dashboard_service.py](backend/services/rtg_dashboard_service.py), [backend/routes/frequency_routes.py](backend/routes/frequency_routes.py) | `get_isgs_schedule_check_config`, `run_isgs_schedule_check`; `RTGDashboardService`; state schedule All blocks / source table and per-ISGS comparison source inspection; live revision fetching preserves configured WBES acronym case. |
| Database sync (`/database-sync`) | [frontend/src/pages/DatabaseSync.jsx](frontend/src/pages/DatabaseSync.jsx) | [backend/routes/sync_routes.py](backend/routes/sync_routes.py), [backend/services/database_sync_review_service.py](backend/services/database_sync_review_service.py) | Router handlers; `refresh_staging_and_review`, `review_snapshot`, `commit_review_rows`, `update_rtg_static_from_reporting` |
| Pipeline monitor / logs | [frontend/src/pages/PipelineMonitor.jsx](frontend/src/pages/PipelineMonitor.jsx) | [backend/routes/pipeline_routes.py](backend/routes/pipeline_routes.py), [backend/routes/log_routes.py](backend/routes/log_routes.py), [backend/services/pipeline_runner.py](backend/services/pipeline_runner.py), [backend/services/pipeline_logger.py](backend/services/pipeline_logger.py), [backend/services/pipeline_config_service.py](backend/services/pipeline_config_service.py) | `PipelineRunner`, `PipelineLogger`, `PipelineConfigService`; route handlers |
| PSP dashboard, admin, report checking | [frontend/src/pages/PSPDashboard.jsx](frontend/src/pages/PSPDashboard.jsx), [frontend/src/pages/PSPAdmin.jsx](frontend/src/pages/PSPAdmin.jsx), [frontend/src/pages/PSPReportChecking.jsx](frontend/src/pages/PSPReportChecking.jsx) | [backend/routes/psp_routes.py](backend/routes/psp_routes.py), [backend/services/psp_service.py](backend/services/psp_service.py) | `PSPService`; sync/status/config handlers in `psp_routes.py` |
| MIS reports, NLDC plots, schedule data | [frontend/src/pages/MISReport.jsx](frontend/src/pages/MISReport.jsx), [frontend/src/pages/NLDCPlots.jsx](frontend/src/pages/NLDCPlots.jsx), [frontend/src/pages/ScheduleData.jsx](frontend/src/pages/ScheduleData.jsx) | [backend/routes/psp_routes.py](backend/routes/psp_routes.py) | Find the page route in `App`; data endpoints are in `psp_routes.py` |
| CRMS message compilation | [frontend/src/pages/MISReport.jsx](frontend/src/pages/MISReport.jsx) | [backend/routes/crms_compilation_routes.py](backend/routes/crms_compilation_routes.py), [backend/services/crms_compilation.py](backend/services/crms_compilation.py) | Route handlers; `compile_messages`, `export_report` |
| Frequency report | [frontend/src/pages/FrequencyReport.jsx](frontend/src/pages/FrequencyReport.jsx), [frontend/src/pages/FrequencyReport](frontend/src/pages/FrequencyReport) | [backend/routes/frequency_routes.py](backend/routes/frequency_routes.py) | `compute_frequency_statistics`, settings/status handlers, report/export handlers |
| Data validation | [frontend/src/pages/DataValidation.jsx](frontend/src/pages/DataValidation.jsx) | [backend/routes/data_validation_routes.py](backend/routes/data_validation_routes.py) | `detect_voltage_level` and validation/report handlers |
| DSO evening and morning reports | [frontend/src/pages/DSOReportPreparation.jsx](frontend/src/pages/DSOReportPreparation.jsx), [frontend/src/pages/DSOMorningReport.jsx](frontend/src/pages/DSOMorningReport.jsx) | [backend/routes/dso_report_routes.py](backend/routes/dso_report_routes.py) | DSO router handlers; collections/configuration helpers are in the same module |
| SRI report | [frontend/src/pages/SRIReport.jsx](frontend/src/pages/SRIReport.jsx) | [backend/routes/sri_routes.py](backend/routes/sri_routes.py) | SRI router handlers |
| Plant deviation report | [frontend/src/pages/PlantDeviationMOP.jsx](frontend/src/pages/PlantDeviationMOP.jsx) | [backend/routes/plant_deviation_routes.py](backend/routes/plant_deviation_routes.py) | Plant-deviation router handlers |
| Outage analysis and ML training | [frontend/src/pages/OutageAnalysis.jsx](frontend/src/pages/OutageAnalysis.jsx), [frontend/src/pages/OutageMLTraining.jsx](frontend/src/pages/OutageMLTraining.jsx) | [backend/routes/outage_ml_routes.py](backend/routes/outage_ml_routes.py), [backend/routes/pipeline_routes.py](backend/routes/pipeline_routes.py) | Taxonomy, training, classification, and pipeline handlers in these routers |
| Old logbook | [frontend/src/pages/OldLogbook.jsx](frontend/src/pages/OldLogbook.jsx) | [backend/routes/old_logbook_routes.py](backend/routes/old_logbook_routes.py) | Serialization/search/report handlers in the logbook router |
| Crew calendar, operations, roster, setup | [frontend/src/pages/crew](frontend/src/pages/crew), [frontend/src/components/crew](frontend/src/components/crew) | [backend/routes/crew_routes.py](backend/routes/crew_routes.py), [backend/crew_legacy/api/roster_api.py](backend/crew_legacy/api/roster_api.py), [backend/crew_legacy/api/operations_api.py](backend/crew_legacy/api/operations_api.py), [backend/crew_legacy/services/daily_service.py](backend/crew_legacy/services/daily_service.py) | `CrewOperations` includes the admin-only Master / event → Special Event roster tile, enabled by `operation_actions.specialEventRoster`; calendar/roster handlers remain in `crew_routes.py` and `crew_legacy` |
| Crew leave, replacement, training, sports | [frontend/src/pages/crew](frontend/src/pages/crew), [frontend/src/crewLegacy](frontend/src/crewLegacy), [frontend/src/components/crew/LeaveTracking.jsx](frontend/src/components/crew/LeaveTracking.jsx), [frontend/src/components/crew/LeavePeriodEditor.jsx](frontend/src/components/crew/LeavePeriodEditor.jsx), [frontend/src/components/crew/LeaveProgress.jsx](frontend/src/components/crew/LeaveProgress.jsx), [frontend/src/components/crew/LeaveBlockedPeriods.jsx](frontend/src/components/crew/LeaveBlockedPeriods.jsx), [frontend/src/components/crew/CrewTableTools.jsx](frontend/src/components/crew/CrewTableTools.jsx) | [backend/crew_legacy/api/leave_api.py](backend/crew_legacy/api/leave_api.py), [backend/crew_legacy/api/replacement.py](backend/crew_legacy/api/replacement.py), [backend/crew_legacy/api/training_holiday_api.py](backend/crew_legacy/api/training_holiday_api.py), [backend/crew_legacy/api/training_assignment.py](backend/crew_legacy/api/training_assignment.py), [backend/crew_legacy/api/sports_api.py](backend/crew_legacy/api/sports_api.py) | `LeaveManagement` owns application, approval and cancellation views. `refresh_unacted_organization_leave_workflows` redirects unacted stages to the live hierarchy while retaining completed audit steps. Operations → Special Event roster uses `LeaveBlockedPeriods` for three weekday matrices: leave-excluded duty plus optional department manpower, leave-only, and replacement-only. Administrators can temporarily disable/re-enable a block with audit retention or permanently delete the selected block after explicit confirmation. `/blocked-periods/{id}/staffing.xlsx` mirrors the matrices using multiline person cells and merged master rows. Rules are consolidated in [Crew workflows](CREW_MODULE_MIGRATION.md#crew-workflow-update). |
| Crew Dash Test (`/crew/dashboard`, `/crew/dash-test`) and login-free sample (`/crew/dash-test-preview`) | [frontend/src/crewLegacy/DashTest.jsx](frontend/src/crewLegacy/DashTest.jsx), [frontend/src/crewLegacy/dashDemoData.js](frontend/src/crewLegacy/dashDemoData.js), [frontend/src/crewLegacy/DashDemoWorkspace.jsx](frontend/src/crewLegacy/DashDemoWorkspace.jsx) | [backend/crew_legacy/api/dashboard.py](backend/crew_legacy/api/dashboard.py), [backend/crew_legacy/api/operations_api.py](backend/crew_legacy/api/operations_api.py), existing calendar/workflow APIs | Ten-block dashboard with compact permission-filtered service tiles in one desktop row; menubar photo opens `TopNavbar.jsx` left profile drawer with blurred backdrop, saved photo and authority delegation link; View full profile opens `/crew/profile`; no test-title banner; `Profile.jsx` retains profile/statistics tiles with matching large-photo sidebar; `TopNavbar.jsx` has no Contact CTA;  admin-aware approval loading state, shared styled popups, grouped-history date filters and named destination links; five-option approval chooser links to existing pending/assign/approval routes; two-tab replacement popup passes `initialWorkflow` to `ReplacementManagement`; slimmer roster and a flexible wider leaderboard/statistics column; `upcomingShiftPeople.js` merges regular, double/additional and external replacement cover without duplicate personnel; calendar replacement metadata retains acting-SIC flags; larger upcoming-shift tiles with bold SIC/acting-SIC names and missing-SIC Assign SIC links to `/crew/setup`; roster links open `/crew/calendar`; event links open the existing `CrewCalendar` Event view at `/crew/calendar?view=events`; `CrewCalendar` `applicationOnly` reuses application popup; `groupLeaveApplications.js` is shared with LeaveManagement for clubbed records and legacy contiguous runs; `LeaveTracking` exposes approved-date management (including one day), styled approval details and `selectedDatesOnly` cancellation; dashboard status/Approved leave filters scope records before grouping, and History/reapply actions navigate to existing Leave Apply with employee/date context; `prepare_leave_applications` ignores cancelled/rejected/withdrawn duplicate records while retaining history and active-date protections; `LeaveProgress.jsx` owns completed/current/stopped timelines; `LeavePeriodEditor.jsx` owns applicant-only unreviewed period changes and local preview simulation. `/leave/period/{leave_id}` in `leave_api.py` resolves groups, reuses `prepare_leave_applications`, preserves revision audit/duty/credit consistency and guards review races; regressions live in `backend/tests/test_leave_period.py`. `TrainingCalendarReview` retains nomination management; Special Event controls navigate to Roster, where `SpecialEventRoster` separates announcement and blocking and preserves legacy `LeaveBlockedPeriods` staffing/export. Operations counts refresh unacted hierarchy stages before counting. Public `demo` mode uses local fixtures and simulated changes without auth/API/database access; live routes retain `crew_dashboard` access. |
| Crew employees, profile, organization, masters | [frontend/src/crewLegacy](frontend/src/crewLegacy) | [backend/crew_legacy/api/dashboard.py](backend/crew_legacy/api/dashboard.py), [backend/crew_legacy/api/profile.py](backend/crew_legacy/api/profile.py), [backend/crew_legacy/admin_logic/employee.py](backend/crew_legacy/admin_logic/employee.py), [backend/crew_legacy/admin_logic/dropdown.py](backend/crew_legacy/admin_logic/dropdown.py), [backend/crew_legacy/admin_logic/DutyLeaveType.py](backend/crew_legacy/admin_logic/DutyLeaveType.py) | Feature handlers and master-data operations are grouped by domain |
| Crew threads, notifications, morning presentation | [frontend/src/pages/crew/CrewThreads.jsx](frontend/src/pages/crew/CrewThreads.jsx), [frontend/src/pages/crew/MorningPresentationRoster.jsx](frontend/src/pages/crew/MorningPresentationRoster.jsx) | [backend/crew_legacy/api/crew_threads.py](backend/crew_legacy/api/crew_threads.py), [backend/crew_legacy/api/notification_api.py](backend/crew_legacy/api/notification_api.py), [backend/crew_legacy/api/morning_presentation.py](backend/crew_legacy/api/morning_presentation.py) | Thread, notification, and presentation handlers |
| Crew audit, mail settings, reports | [frontend/src/pages/AuditTrail.jsx](frontend/src/pages/AuditTrail.jsx), [frontend/src/pages/MailSettings.jsx](frontend/src/pages/MailSettings.jsx), [frontend/src/pages/crew/CrewActivityReport.jsx](frontend/src/pages/crew/CrewActivityReport.jsx) | [backend/crew_legacy/api/audit_trail.py](backend/crew_legacy/api/audit_trail.py), [backend/crew_legacy/api/mail_settings.py](backend/crew_legacy/api/mail_settings.py), [backend/crew_legacy/admin_logic/audit_service.py](backend/crew_legacy/admin_logic/audit_service.py) | Audit and mail API handlers; `record_audit_event`. `CrewActivityReport.jsx` owns the five-tab `/crew/reports` hub, activity type colors and `?tab=training-history|training-matrix` deep links. Training reports reuse `TrainingHolidayMaster` `embeddedReport` mode and existing `NominationMatrix`/`TrainingCalendarReview` filters, review and CSV; old training-history links redirect to the hub. |
| Past comp-off administration | [frontend/src/pages/PastCompOffAdmin.jsx](frontend/src/pages/PastCompOffAdmin.jsx) | [backend/routes/crew_legacy_routes.py](backend/routes/crew_legacy_routes.py), [backend/crew_legacy/api](backend/crew_legacy/api) | Search `PastCompOffAdmin` route in `App` and the matching Crew API handler |

## Special Events and roster coverage

| Feature | Source owners | Lookup anchors |
|---|---|---|
| Special Event announcement, deadline and department leave blocking | `frontend/src/components/crew/SpecialEventRoster.jsx`, `SpecialEventNotice.jsx`, `frontend/src/pages/crew/CrewDutyRoster.jsx`, `frontend/src/components/layout/AppShell.jsx`; `backend/crew_legacy/api/special_events.py`, `leave_api.py` | Duty Roster hero tile opens the styled management popup; AppShell hosts scoped right-to-left scrolling notices (18 seconds). `event_access`, `require_scope`, `department_ids`, `mark_event`, `block_event`; `ensure_leave_dates_open` checks the target employee before writes. New records use `leaveBlocked=False` until explicit blocking; legacy blocks retain compatibility. HOD scope comes from Organization Master department heads; admin may target all. |
| Dashboard report, bold counts and blinking coverage | `frontend/src/crewLegacy/DashTest.jsx`, `dashDemoData.js` | Report -> `/crew/reports`; pending badge; uncovered upcoming duty -> calendar coverage; motion preference respected. |

## Shared Backend Services

| File | Feature responsibility / primary symbol |
|---|---|
| [backend/services/db_handler.py](backend/services/db_handler.py) | MongoDB access: `MongoService` |
| [backend/services/api_client.py](backend/services/api_client.py) | Shared HTTP client: `APIClient` |
| [backend/services/config_service.py](backend/services/config_service.py) | RTG configuration: `get_rtg_config` |
| [backend/services/token_service.py](backend/services/token_service.py) | External API token lifecycle: `TokenService` |
| [backend/services/external_fetch_service.py](backend/services/external_fetch_service.py) | External-source fetch logic: `ExternalFetchService` |
| [backend/services/rtg_push_service.py](backend/services/rtg_push_service.py) | Push data to RTG: `RTGPushService` |
| [backend/services/crms_compilation.py](backend/services/crms_compilation.py) | CRMS report assembly/export: `Measurements`, `compile_messages`, `export_report` |
| [backend/services/scheduler_service.py](backend/services/scheduler_service.py), [backend/scheduler/jobs.py](backend/scheduler/jobs.py) | Scheduled/background work |

## Cross-Cutting Locations

| Concern | Source |
|---|---|
| Runtime and database policy | [backend/config/settings.py](backend/config/settings.py), [backend/config/database_policy.py](backend/config/database_policy.py) |
| Crew database and identity | [backend/crew_legacy/config.py](backend/crew_legacy/config.py), [backend/crew_legacy/database/database_mongo.py](backend/crew_legacy/database/database_mongo.py), [backend/crew_legacy/admin_logic/auth_utils.py](backend/crew_legacy/admin_logic/auth_utils.py) |
| Frontend authentication/access | [frontend/src/auth](frontend/src/auth), [frontend/src/App.jsx](frontend/src/App.jsx) |
| Shared UI and feature components | [frontend/src/components](frontend/src/components) |
| Frontend styles/theme | [frontend/src/index.css](frontend/src/index.css), [frontend/src/theme](frontend/src/theme) |
| Backend tests | [backend/tests](backend/tests) |
| Frontend build/lint configuration | [frontend/package.json](frontend/package.json), [frontend/vite.config.js](frontend/vite.config.js), [frontend/tailwind.config.js](frontend/tailwind.config.js) |

## Existing Documentation

| Topic | Document |
|---|---|
| Crew module architecture and migration | [CREW_MODULE_MIGRATION.md](CREW_MODULE_MIGRATION.md) |
| Dash Test layout, routes and sample preview | [Dashboard and preview](CREW_MODULE_MIGRATION.md#dash-test-dashboard-and-sample-preview) |
| Crew workflow behavior updates | [Crew workflows](CREW_MODULE_MIGRATION.md#crew-workflow-update) |
| Crew internal storage | [Internal storage](CREW_MODULE_MIGRATION.md#crew-management-internal-storage) |
| WBES schedule fetching | [WBES schedule reference](CREW_MODULE_MIGRATION.md#wbes-schedule-fetch-reference) |
| Domain deployment | [Deployment](CREW_MODULE_MIGRATION.md#url-based-deployment) |

## Fast Lookup

- To find a screen: search its URL in `frontend/src/App.jsx`; follow its component import.
- To find an API function: its feature row names the owning router; search that file's `@router` decorators for the endpoint and the decorated function immediately below it.
- To find business logic: follow imports from the route into the listed service/domain module.
- For Crew, check both `backend/routes/crew_routes.py` and `backend/crew_legacy`; the latter provides compatibility workflows.
- Keep this map focused on stable ownership and feature entry points. Do not list trivial helpers or duplicate endpoint implementations here.

### Administrator leave deletion

Administrators can delete leave of any status, including cancelled leave, from Tracking, History and Leave Approval through the shared `LeaveTracking` / `LeaveDelete` controls. The confirmation lists individual dates, all selected initially. `DELETE /leave/master/{leave_id}` enforces administrator or existing Leave Master Permanent Delete permission, clears operational effects and retains the deletion audit. Successful dates refresh across workspaces even if a later date fails.

Move/Reallocate leave-vacancy linking in `DutyReassignmentPanel.jsx` is restricted to the selected destination duty date. Choosing a vacancy preserves that date; changing the date clears the previous link. Submission rejects stale mismatched links.

Acting SIC can be assigned separately from replacement coverage on the Replacement assigned-duty board, using the existing calendar-compatible SIC dialog and `/replacement/assign-sic/{leave_id}` endpoint. Assigned records include original-SIC and acting-SIC metadata. The candidate endpoint and save validation require the same group/date and working shift, and no active leave. Acting SIC is designated by the authority; no existing SIC category, prior SIC role or replacement assignment is required. Shift aliases (Morning/M/M1/M2, Evening/E/E1/E2, Night/N/N1/N2) match by shift family. The SIC dialog is independent of replacement and does not show an unassigned replacement warning.
