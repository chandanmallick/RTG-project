import dayjs from "dayjs";

// Shared by the leave workspace and dashboard; keep legacy contiguous runs.
export default function groupLeaveApplications(leaves = []) {

    const buckets = new Map();
    leaves.forEach((leave) => {
      const key = leave.leaveGroupId
        ? `g:${leave.leaveGroupId}`
        : `l:${leave.employeeId}:${leave.leaveType || ""}:${Boolean(leave.stationLeaveOnly)}:${leave.id}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(leave);
    });
    // Legacy rows without a leaveGroupId fall back to one bucket per row; merge
    // those contiguous same-kind rows so a multi-day application still appears
    // as a single clubbed entry.
    const legacyGroups = new Map();
    Array.from(buckets.entries()).forEach(([key, rowsInGroup]) => {
      if (key.startsWith("g:")) return;
      const anchor = rowsInGroup[0];
      const legacyKey = `l:${anchor.employeeId}:${anchor.leaveType || ""}:${Boolean(anchor.stationLeaveOnly)}`;
      if (!legacyGroups.has(legacyKey)) legacyGroups.set(legacyKey, []);
      legacyGroups.get(legacyKey).push(...rowsInGroup);
    });
    legacyGroups.forEach((legacyRows, legacyKey) => {
      const sortedLegacy = [...legacyRows].sort((a, b) => String(a.date).localeCompare(String(b.date)));
      const runs = [];
      sortedLegacy.forEach((row) => {
        const lastRun = runs[runs.length - 1];
        if (lastRun && dayjs(row.date).diff(dayjs(lastRun[lastRun.length - 1].date), "day") === 1) lastRun.push(row);
        else runs.push([row]);
      });
      runs.forEach((run) => buckets.set(`run:${legacyKey}:${run[0].id}`, run));
      // Remove the original per-row legacy buckets now that runs are assembled.
      legacyRows.forEach((row) => buckets.delete(`l:${row.employeeId}:${row.leaveType || ""}:${Boolean(row.stationLeaveOnly)}:${row.id}`));
    });
    return Array.from(buckets.values()).map((rowsInGroup) => {
      const sorted = [...rowsInGroup].sort((a, b) => String(a.date).localeCompare(String(b.date)));
      const anchor = sorted[0];
      const statuses = new Set(sorted.map((row) => row.finalStatus));
      const overallStatus = statuses.has("Applied") ? "Applied"
        : statuses.has("Forwarded by SIC") ? "Forwarded by SIC"
          : statuses.has("Approved") && !statuses.has("Applied") ? "Approved"
            : anchor.finalStatus;
      return {
        id: anchor.leaveGroupId || anchor.id,
        leaveGroupId: anchor.leaveGroupId,
        anchor,
        rows: sorted,
        name: anchor.name,
        employeeId: anchor.employeeId,
        groupName: anchor.groupName,
        leaveType: anchor.leaveType,
        stationLeave: sorted.some((row) => row.stationLeave),
        stationLeaveOnly: sorted.every((row) => row.stationLeaveOnly),
        startDate: anchor.date,
        endDate: sorted[sorted.length - 1].date,
        dayCount: sorted.length,
        finalStatus: overallStatus,
        canSICAct: sorted.some((row) => row.canSICAct),
        canFinalAct: sorted.some((row) => row.canFinalAct),
        canCancel: sorted.some((row) => row.canCancel),
        isOwner: sorted.some((row) => row.isOwner),
        othersOnLeave: [...new Set(sorted.flatMap((row) => (row.othersOnLeave || []).map((person) => person.name || person.employeeId)))].filter(Boolean),
      };
    }).sort((a, b) => String(b.startDate).localeCompare(String(a.startDate)));
  }
