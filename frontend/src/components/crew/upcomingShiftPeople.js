// Calendar coverage may come from a roster member, an additional duty, or an
// employee outside the published roster. Keep one entry per person per shift.
export default function upcomingShiftPeople(groups, date, code, shiftCode) {
  const entries = new Map();
  const add = person => {
    const key = String(person.employeeId || person.name || "").trim();
    if (!key) return;
    entries.set(key, { ...entries.get(key), ...person,
      name: person.name && person.name !== person.employeeId ? person.name : entries.get(key)?.name || person.name,
      IsSIC: Boolean(entries.get(key)?.IsSIC || person.IsSIC),
      isReplacement: Boolean(entries.get(key)?.isReplacement || person.isReplacement),
    });
  };
  for (const group of groups || []) for (const person of group.employees || []) {
    const duty = person.duties?.[date] || {};
    if (shiftCode(duty.shift) === code && !/approved/i.test(duty.leaveStatus || "")) {
      add({ ...person, IsSIC: Boolean(person.IsSIC || duty.isActingSIC), isReplacement: Boolean(duty.replacementFor), replacementFor: duty.replacementFor });
    }
    for (const extra of duty.additionalDuties || []) {
      if (shiftCode(extra.shift) === code) add({ ...person, IsSIC: false, isReplacement: true, replacementFor: extra.replacementFor });
    }
    const replacement = duty.replacementEmployee;
    if (replacement && shiftCode(replacement.shift || duty.originalShift || duty.trainingOriginalDuty || duty.shift) === code) {
      add({ employeeId: replacement.employeeId, name: replacement.name || replacement.employeeId,
        IsSIC: Boolean(replacement.isActingSIC), isReplacement: true,
        replacementFor: { employeeId: person.employeeId, name: person.name }, duties: { [date]: { isActingSIC: Boolean(replacement.isActingSIC) } },
      });
    }
  }
  return [...entries.values()].sort((a, b) => Number(b.IsSIC) - Number(a.IsSIC));
}
