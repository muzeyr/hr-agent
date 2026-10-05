import { describe, expect, it } from "vitest";
import {
  TimesheetRuleError,
  checkDay,
  resolveActivity,
  resolveProject,
  resolveWorkDate,
  weekDays,
  weekOf,
} from "../../srv/timesheet/lib/timesheet-rules.js";

/** The timesheet rules, without CAP. */
const today = "2026-10-04"; // a Sunday
const projects = [
  { ID: "P100", name: "Apollo Migration", customer: "Contoso", active: true },
  { ID: "P300", name: "Legacy Archive", customer: "Contoso", active: false },
  { ID: "P900", name: "Internal", customer: null, active: true },
];

describe("resolveWorkDate", () => {
  it("means today when no date is given", () => {
    expect(resolveWorkDate(undefined, undefined, undefined, today)).toBe(today);
  });

  it("takes the most recent past occurrence without a year", () => {
    expect(resolveWorkDate(1, 10, undefined, today)).toBe("2026-10-01");
    expect(resolveWorkDate(20, 12, undefined, today)).toBe("2025-12-20");
  });
});

describe("weekOf", () => {
  it("runs Monday to Sunday", () => {
    expect(weekOf("2026-10-01")).toEqual({ weekStart: "2026-09-28", weekEnd: "2026-10-04" });
    expect(weekOf("2026-10-04")).toEqual({ weekStart: "2026-09-28", weekEnd: "2026-10-04" });
  });
});

describe("resolveProject", () => {
  it("matches by ID, name or customer", () => {
    expect(resolveProject("p100", projects).ID).toBe("P100");
    expect(resolveProject("apollo", projects).ID).toBe("P100");
    expect(resolveProject("internal", projects).ID).toBe("P900");
  });

  it("takes the only open project when a name also matches a closed one", () => {
    // Contoso: P100 Apollo Migration (open) and P300 Legacy Archive (closed).
    expect(resolveProject("Contoso", projects).ID).toBe("P100");
  });

  it("refuses an ambiguous name and lists the matches", () => {
    const two = [...projects, { ID: "P400", name: "Apollo Reporting", customer: "Contoso", active: true }];
    expect(() => resolveProject("Apollo", two)).toThrow(/matches several of your projects: P100 .*P400/);
  });

  it("refuses a closed project", () => {
    expect(() => resolveProject("Legacy", projects)).toThrow(/closed/);
  });

  it("refuses an unknown project and offers only the open ones", () => {
    expect(() => resolveProject("Atlas", projects)).toThrow(/you can book on are: P100 Apollo Migration, P900 Internal\./);
  });
});

describe("resolveActivity", () => {
  it("accepts a code or a name", () => {
    const types = [{ code: "analysis", name: "Analysis" }];
    expect(resolveActivity("Analysis", types).code).toBe("analysis");
    expect(() => resolveActivity("coding", types)).toThrow(TimesheetRuleError);
  });
});

describe("checkDay", () => {
  const base = { workDate: "2026-10-02", today, bookedBefore: 0, weekSubmitted: false, dailyHours: 8 };

  it("accepts quarter hours and reports a short day", () => {
    expect(checkDay({ ...base, hours: [4, 2.5] })).toEqual({ dayTotal: 6.5, warnings: ["2026-10-02 now has 6.5 of 8 hours."] });
  });

  it("refuses a future date, odd hours, an overfull day and a locked week", () => {
    expect(() => checkDay({ ...base, workDate: "2026-10-05", hours: [1] })).toThrow(/in the future/);
    expect(() => checkDay({ ...base, hours: [1.1] })).toThrow(/quarter hours/);
    expect(() => checkDay({ ...base, bookedBefore: 8, hours: [5] })).toThrow(/at most 12 hours/);
    expect(() => checkDay({ ...base, weekSubmitted: true, hours: [1] })).toThrow(/already been submitted/);
  });

  it("warns about weekends and holidays", () => {
    expect(checkDay({ ...base, workDate: "2026-10-04", hours: [2] }).warnings).toEqual(["2026-10-04 is a weekend day."]);
  });
});

describe("weekDays", () => {
  it("gives weekends, holidays and leave days no target", () => {
    const days = weekDays("2026-10-26", [{ workDate: "2026-10-26", hours: 8 }], new Map([["2026-10-29", "Republic Day"]]), new Set(["2026-10-30"]), 8);
    expect(days.map((d) => [d.date.slice(8), d.target, d.missing, d.note ?? ""])).toEqual([
      ["26", 8, 0, ""],
      ["27", 8, 8, ""],
      ["28", 8, 8, ""],
      ["29", 0, 0, "Republic Day"],
      ["30", 0, 0, "annual leave"],
      ["31", 0, 0, "weekend"],
      ["01", 0, 0, "weekend"],
    ]);
  });
});
