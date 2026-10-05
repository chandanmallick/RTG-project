import test from "node:test";
import assert from "node:assert/strict";
import people from "../src/components/crew/upcomingShiftPeople.js";

const date = "2026-10-06";
const shiftCode = value => ({ Morning: "M", Evening: "E", Night: "N", OFF: "O" }[value] || value);
const person = (employeeId, duty, extra = {}) => ({ employeeId, name: employeeId, duties: { [date]: duty }, ...extra });
const groups = (...employees) => [{ employees }];

test("external replacement covers an approved absentee and appears once", () => {
  const source = person("absent", { shift: "Morning", leaveStatus: "Approved", replacementEmployee: { employeeId: "cover", name: "Cover Person", shift: "Morning" } });
  const result = people(groups(source), date, "M", shiftCode);
  assert.equal(result.length, 1);
  assert.equal(result[0].name, "Cover Person");
  assert.equal(result[0].isReplacement, true);
  assert.equal(result[0].replacementFor.employeeId, "absent");
});

test("double duty appears in its original shift and extra shift without duplicates", () => {
  const cover = person("cover", { shift: "Evening", additionalDuties: [{ shift: "Morning", replacementFor: { employeeId: "absent" } }] });
  const absent = person("absent", { shift: "Morning", leaveStatus: "Approved", replacementEmployee: { employeeId: "cover", shift: "Morning" } });
  assert.equal(people(groups(cover, absent), date, "M", shiftCode).length, 1);
  assert.equal(people(groups(cover, absent), date, "E", shiftCode).length, 1);
  assert.equal(people(groups(cover, absent), date, "N", shiftCode).length, 0);
});

test("regular replacement is not duplicated by coverage metadata", () => {
  const cover = person("cover", { shift: "Morning", replacementFor: { employeeId: "absent" } });
  const absent = person("absent", { shift: "Morning", leaveStatus: "Approved", replacementEmployee: { employeeId: "cover", shift: "Morning" } });
  const result = people(groups(cover, absent), date, "M", shiftCode);
  assert.equal(result.length, 1);
  assert.equal(result[0].isReplacement, true);
});

test("acting SIC from external coverage is retained and sorted first", () => {
  const regular = person("crew", { shift: "Morning" });
  const absent = person("sic", { shift: "Morning", leaveStatus: "Approved", replacementEmployee: { employeeId: "acting", shift: "Morning", isActingSIC: true } }, { IsSIC: true });
  const result = people(groups(regular, absent), date, "M", shiftCode);
  assert.equal(result[0].employeeId, "acting");
  assert.equal(result[0].IsSIC, true);
});

test("covering an additional shift does not carry regular SIC authority to that shift", () => {
  const sic = person("sic", { shift: "Evening", additionalDuties: [{ shift: "Morning" }] }, { IsSIC: true });
  assert.equal(people(groups(sic), date, "M", shiftCode)[0].IsSIC, false);
  assert.equal(people(groups(sic), date, "E", shiftCode)[0].IsSIC, true);
});
