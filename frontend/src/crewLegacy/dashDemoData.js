import dayjs from "dayjs";

export const demoEmployeeId = "DEMO101";
export function createDashDemo(today) {
  const names = ["Anil Sharma", "Priya Das", "Ravi Kumar", "Neha Singh", "Arjun Sen", "Meera Roy"];
  const dates = Array.from({ length: 9 }, (_, i) => dayjs(today).add(i - 1, "day").format("YYYY-MM-DD"));
  const groups = Array.from({ length: 4 }, (_, g) => ({ groupName: `Group ${g + 1}`, employees: names.map((name, i) => ({
    employeeId: g === 0 && i === 0 ? demoEmployeeId : `DEMO${g}${i}`, name: g === 0 ? name : `${["Suresh", "Kavita", "Rahul", "Ananya", "Vikram", "Sonal"][i]} ${["Gupta", "Bose", "Nair", "Patel"][g]}`, IsSIC: i === 0,
    duties: Object.fromEntries(dates.map((date, d) => [date, { shift: ["Evening", "Evening", "Morning", "Morning", "Night", "Night", "OFF", "OFF"][(d + g * 2) % 8], ...(g === 0 && i === 2 && d === 2 ? { leaveStatus: "Approved", leaveType: "CL", replacementRequired: true } : {}), ...(g === 0 && i === 1 && d === 3 ? { leaveStatus: "Applied", leaveType: "CL" } : {}), ...(g === 1 && i === 2 && d === 4 ? { trainingName: "Safety refresher", trainingStatus: "Approved" } : {}) }]))
  })) }));
  const coveredDate = dayjs(today).add(4, "day").format("YYYY-MM-DD");
  groups[0].employees[3].duties[coveredDate] = { shift: "Night", leaveStatus: "Approved", leaveType: "CL", replacementRequired: true, replacementEmployee: { employeeId: "DEMO-COVER", name: "Kiran Rao", shift: "Night" } };
  const records = [
    { id: "demo-leave", leaveGroupId: "demo-leave-group", kind: "Leave", employeeId: demoEmployeeId, name: names[0], leaveType: "Casual leave", date: dayjs(today).add(2, "day").format("YYYY-MM-DD"), finalStatus: "Applied", sicApprovalStatus: "Pending", isOwner: true, canCancel: true },
    { id: "demo-training", kind: "Training", employeeId: demoEmployeeId, employeeName: names[0], trainingName: "Grid operations refresher", startDate: dayjs(today).add(4, "day").format("YYYY-MM-DD"), endDate: dayjs(today).add(6, "day").format("YYYY-MM-DD"), status: "Pending Approval" },
    { id: "demo-sports", kind: "Sports", employeeId: demoEmployeeId, employeeName: names[0], eventName: "Inter-region athletics", startDate: dayjs(today).add(12, "day").format("YYYY-MM-DD"), endDate: dayjs(today).add(14, "day").format("YYYY-MM-DD"), status: "Approved" },
    { id: "demo-exchange", kind: "Exchange", firstEmployee: { employeeId: demoEmployeeId, name: names[0] }, employeeName: names[0], date: dayjs(today).add(3, "day").format("YYYY-MM-DD"), assignedDuty: "Morning ↔ Evening", status: "Pending" },
    { id: "demo-replacement", kind: "Replacement", employeeId: demoEmployeeId, employeeName: names[0], date: dayjs(today).subtract(1, "day").format("YYYY-MM-DD"), assignedDuty: "Night", status: "Accepted" },
    { id: "demo-history", kind: "Leave", employeeId: demoEmployeeId, name: names[0], date: dayjs(today).subtract(10, "day").format("YYYY-MM-DD"), leaveType: "Earned leave", finalStatus: "Approved", isOwner: true, canCancel: false },
    { id: "demo-other", kind: "Leave", employeeId: "DEMO01", name: names[1], date: dayjs(today).add(1, "day").format("YYYY-MM-DD"), leaveType: "CL", finalStatus: "Applied", sicApprovalStatus: "Pending", canCancel: true }
  ];
  records.push({ ...records[0], id: "demo-leave-day-2", date: dayjs(today).add(3, "day").format("YYYY-MM-DD") });
  return { groups, records, actions: { specialEventRoster: { enabled: true }, leaveApproval: { enabled: true, pending: 2 }, trainingApproval: { enabled: true, pending: 1 }, sportsApproval: { enabled: true, pending: 0 }, exchangeApproval: { enabled: true, pending: 1 }, delegate: { enabled: true } }, leaderboard: names.slice(0, 5).map((name, i) => ({ name, value: [16, 12, 9, 7, 5][i] })), leaveStats: [8, 5, 11, 4].map((count, i) => ({ group: `Group ${i + 1}`, count })) };
}

export function demoEvents(month) {
  const start = month.startOf("month");
  return [
    { id: "demo-holiday", kind: "holiday", title: "Public holiday", detail: "Sample holiday · all groups", startDate: start.add(4, "day").format("YYYY-MM-DD"), endDate: start.add(4, "day").format("YYYY-MM-DD") },
    { id: "demo-training-event", kind: "training", title: "Grid operations refresher", detail: "Training centre · 09:00–17:00", startDate: start.add(11, "day").format("YYYY-MM-DD"), endDate: start.add(13, "day").format("YYYY-MM-DD") },
    { id: "demo-sports-event", kind: "sports", title: "Inter-region athletics", detail: "Sports ground · three-day event", startDate: start.add(20, "day").format("YYYY-MM-DD"), endDate: start.add(22, "day").format("YYYY-MM-DD") }
  ];
}
