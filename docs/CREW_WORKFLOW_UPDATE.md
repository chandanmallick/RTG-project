# Crew workflow update

## Leave availability

Open Crew Operations > Master / event > **Special Event roster**. Administrators
can use **Block a period**, enter inclusive start/end dates and a reason, then
save. The restriction applies to new leave
applications for everyone, including applications entered by administrators.
Existing requests are unchanged. **Reopen period** removes the restriction while
preserving who created and revoked it. The Leave Apply page retains the read-only
availability notice for employees; management and staffing controls live in the
Special Event roster tile. All mutations are checked by the backend.

### Blocked-period staffing view

Every active block provides a date-wise staffing view and matching Excel export.
Columns include the date and weekday; rows show Morning, Evening and Night shift
staffing. Normal shift rows exclude the General group. A replacement employee
remains in the applicable shift cell, with alternate shading applied only to that
employee's name. Empty combinations display `NR`.

Additional strength is hidden by default. Selecting a department adds only that
department's staff as a separate row, and the Excel export reflects the same
selection. The backing endpoints are
`GET /leave/blocked-periods/{id}/staffing` and
`GET /leave/blocked-periods/{id}/staffing.xlsx`; Excel prefixes replacement names
with `[R]` and includes both date and weekday rows.

## Pending leave after hierarchy changes

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

## Published holidays

Both calendar endpoints read the current active Holiday Master for the requested
dates. A newly added holiday appears without republishing or changing shift duty.
The calendar refreshes on window focus, after a same-window holiday save, and once
per minute while visible. Deleted/inactive holiday markers no longer survive from
old daily snapshots.

## Nomination history

The history workspace opens on a compact training matrix. Use financial year,
name/ID/group and status filters; search programme columns and sort employees.
Status cells open the complete nomination details. Mixed states are identified
explicitly. Progress shows approved days against the existing seven-day target.
The full-matrix CSV remains available; the history table is a separate view on the
same page. Summary totals cover matching employees across all programmes.

## Crew reports

Employee selectors support name/ID search, multiple selections and removable
chips. Choose people and dates, then Load report. In Activity Explorer, search
loaded records, filter status, switch between Table and Compare, or export the
filtered records as CSV. Compare cards count activity records, not approved days.
The consolidated matrix also supports selecting multiple employees and keeps
employee identities visible when scrolling. Existing server-side report visibility
rules remain in force.

## Validation

Backend regression tests cover block boundaries, admin authorization, invalid
ranges, batched submissions and holiday overlays on published duties. Component
render checks use synthetic data. No real leave restrictions or nominations were
created during verification. Browser visual QA requires an available browser.


## Leave tracking and cancellation

Every visible leave record has Track leave, including Other Employees. The
tracking dialog shows its approval chain, current stage and cancellation/rejection
information. It is available from the leave table, leave calendar and the main
duty calendar's Track / manage leave workflow. Employees may cancel their own
active leave; administrators and the configured reporting authorities (including
active delegates) can cancel records in their authorised scope. The server makes
the decision; read-only page settings do not suppress these personal workflow
actions. Consumed replacement C-OFF credits still prevent cancellation.

## Changing training nominations

Click an existing nomination in the training calendar, or choose Manage training
from the main duty calendar. Nomination history and its matrix also open the same
controls. Change employee / dates provides a searchable employee selector and date
fields. Dragging along the same employee row proposes a new start date and keeps
the nomination's duration; a reason and Save changes are required before it is
changed. Date edits apply to that nomination, not the whole Training Master entry.

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
