import { describe, expect, it } from "vitest";
import { LeaveRuleError, leaveBalance, planLeave, planLeaveBetween, resolveDate } from "../../srv/leave/lib/leave-calendar.js";

/**
 * The leave arithmetic, covered without CAP: this is where an off-by-one day
 * would hide, and nobody would notice it until the employee is not at work.
 */
const holidays = [
  { date: "2026-10-29", name: "Republic Day" },
  { date: "2027-01-01", name: "New Year's Day" },
];
const today = "2026-10-04";

describe("resolveDate", () => {
  it("takes this year when the date is still ahead", () => {
    expect(resolveDate(10, 11, undefined, today)).toBe("2026-11-10");
  });

  it("takes next year when the date has passed", () => {
    expect(resolveDate(15, 3, undefined, today)).toBe("2027-03-15");
  });

  it("keeps an explicit year", () => {
    expect(resolveDate(10, 11, 2027, today)).toBe("2027-11-10");
  });

  it("refuses a date that does not exist", () => {
    expect(() => resolveDate(31, 11, undefined, today)).toThrow(LeaveRuleError);
  });
});

describe("planLeave", () => {
  // The example from the brief: "3 days of annual leave starting 10 November".
  it("plans three working days from Tuesday 10 November", () => {
    expect(planLeave("2026-11-10", 3, holidays, today)).toEqual({
      startDate: "2026-11-10",
      endDate: "2026-11-12",
      returnDate: "2026-11-13",
      workingDays: 3,
      skippedDays: [],
      // Tuesday to Thursday: the weekend before is not part of the break, Monday is in between.
      timeOff: { from: "2026-11-10", to: "2026-11-12", calendarDays: 3 },
      // Monday 9 and Friday 13 each join the leave to a weekend.
      bridgeDays: [
        { date: "2026-11-09", extraDaysOff: 3 },
        { date: "2026-11-13", extraDaysOff: 3 },
      ],
      adjustments: [],
    });
  });

  it("skips a public holiday and the weekend inside the leave", () => {
    const plan = planLeave("2026-10-28", 3, holidays, today);
    expect(plan.endDate).toBe("2026-11-02");
    expect(plan.skippedDays.map((d) => d.date)).toEqual(["2026-10-29", "2026-10-31", "2026-11-01"]);
  });

  it("returns on the Monday when the leave ends on a Friday", () => {
    expect(planLeave("2026-11-11", 3, holidays, today).returnDate).toBe("2026-11-16");
  });

  it("refuses a start on a holiday and names the next working day", () => {
    expect(() => planLeave("2026-10-29", 1, holidays, today)).toThrow(/next working day is 2026-10-30/);
  });

  it("refuses a start in the past", () => {
    expect(() => planLeave("2026-09-01", 1, holidays, today)).toThrow(/in the past/);
  });
});

describe("weekends around the leave", () => {
  it("counts both weekends into the break of a Monday-to-Friday leave", () => {
    const plan = planLeave("2026-11-09", 5, holidays, today);
    expect(plan.timeOff).toEqual({ from: "2026-11-07", to: "2026-11-15", calendarDays: 9 });
    expect(plan.bridgeDays).toEqual([]);
  });

  it("finds the bridge day between a holiday and the weekend", () => {
    // Monday 26 – Wednesday 28 October; Thursday 29 is Republic Day, so Friday 30 bridges to the weekend.
    const plan = planLeave("2026-10-26", 3, holidays, today);
    expect(plan.returnDate).toBe("2026-10-30");
    expect(plan.bridgeDays).toContainEqual({ date: "2026-10-30", extraDaysOff: 3 });
    expect(plan.timeOff).toEqual({ from: "2026-10-24", to: "2026-10-29", calendarDays: 6 });
  });
});

describe("planLeaveBetween", () => {
  it("counts the working days of a range across a weekend", () => {
    const plan = planLeaveBetween("2026-11-06", "2026-11-10", holidays, today);
    expect(plan).toMatchObject({ startDate: "2026-11-06", endDate: "2026-11-10", workingDays: 3, returnDate: "2026-11-11", adjustments: [] });
    expect(plan.skippedDays.map((d) => d.reason)).toEqual(["weekend", "weekend"]);
  });

  it("trims a range that ends on a Sunday and says so", () => {
    const plan = planLeaveBetween("2026-11-06", "2026-11-08", holidays, today);
    expect(plan).toMatchObject({ startDate: "2026-11-06", endDate: "2026-11-06", workingDays: 1, returnDate: "2026-11-09" });
    expect(plan.adjustments).toEqual(["Sunday 2026-11-08 is not a working day (weekend); the leave ends on Friday 2026-11-06."]);
    expect(plan.timeOff.calendarDays).toBe(3);
  });

  it("trims a range that starts on a Saturday", () => {
    const plan = planLeaveBetween("2026-11-07", "2026-11-11", holidays, today);
    expect(plan).toMatchObject({ startDate: "2026-11-09", workingDays: 3 });
    expect(plan.adjustments[0]).toMatch(/Saturday 2026-11-07 .* starts on Monday 2026-11-09/);
  });

  it("refuses a range without a working day", () => {
    expect(() => planLeaveBetween("2026-11-07", "2026-11-08", holidays, today)).toThrow(/no working day .* no leave is needed/);
  });

  it("refuses an end before the start", () => {
    expect(() => planLeaveBetween("2026-11-10", "2026-11-09", holidays, today)).toThrow(/before the start/);
  });
});

describe("leaveBalance", () => {
  it("counts approved and pending leave against the entitlement", () => {
    const requests = [
      { startDate: "2026-07-13", workingDays: 4, status: "approved" },
      { startDate: "2026-11-10", workingDays: 3, status: "submitted" },
      { startDate: "2026-12-01", workingDays: 2, status: "cancelled" },
      { startDate: "2027-01-04", workingDays: 5, status: "approved" },
    ];
    expect(leaveBalance(2026, 14, requests)).toEqual({ year: 2026, entitlement: 14, used: 4, pending: 3, remaining: 7 });
  });
});
