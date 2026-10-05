/**
 * Leave arithmetic: turning "3 days from 10 November" into concrete dates.
 *
 * Pure functions over ISO date strings (YYYY-MM-DD), no `cds.Request`, no
 * database, so test/unit covers them without booting CAP. All date maths runs
 * in UTC, because a local-time `Date` shifts a day west of Greenwich and an
 * off-by-one leave date is exactly the error nobody notices until the day.
 */

export type Holiday = { date: string; name: string };

export type SkippedDay = {
  date: string;
  /** Why the day does not count: "weekend" or the holiday's name. */
  reason: string;
};

export type BridgeDay = {
  /** A working day next to the leave that is itself next to a weekend or holiday. */
  date: string;
  /** Days off gained by taking it as well: the day itself plus the non-working days it connects. */
  extraDaysOff: number;
};

export type LeavePlan = {
  startDate: string;
  endDate: string;
  returnDate: string;
  workingDays: number;
  /** Non-working days inside the leave period, so the user sees why the end date moved. */
  skippedDays: SkippedDay[];
  /**
   * The whole stretch away from work: the weekends and holidays right before
   * and after the leave included. Five working days Monday to Friday are nine
   * days off, Saturday to Sunday.
   */
  timeOff: { from: string; to: string; calendarDays: number };
  /** Working days worth adding, because one more leave day buys a longer break. */
  bridgeDays: BridgeDay[];
  /** What a date range was trimmed to, in words; empty when nothing was changed. */
  adjustments: string[];
};

export class LeaveRuleError extends Error {}

const DAY_MS = 86_400_000;

const toTime = (iso: string): number => Date.parse(`${iso}T00:00:00Z`);
const toIso = (time: number): string => new Date(time).toISOString().slice(0, 10);
export const addDays = (iso: string, days: number): string => toIso(toTime(iso) + days * DAY_MS);
const isWeekend = (iso: string): boolean => [0, 6].includes(new Date(toTime(iso)).getUTCDay());
const daysBetween = (from: string, to: string): number => Math.round((toTime(to) - toTime(from)) / DAY_MS) + 1;
const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const weekday = (iso: string): string => WEEKDAY[new Date(toTime(iso)).getUTCDay()];

/**
 * Resolves a day and month the user said into a full date.
 *
 * Without a year, the next occurrence on or after `today` is meant: in
 * October, "10 November" is this year; in December it is next year. Asking
 * the model to work that out would make it guess today's date.
 */
export function resolveDate(day: number, month: number, year: number | undefined, today: string): string {
  const pick = (y: number) => {
    const iso = `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (Number.isNaN(toTime(iso)) || toIso(toTime(iso)) !== iso) {
      throw new LeaveRuleError(`${day}.${month}.${y} is not a valid date. Ask the user for the correct date.`);
    }
    return iso;
  };
  if (year) return pick(year);
  const thisYear = Number(today.slice(0, 4));
  const candidate = pick(thisYear);
  return candidate >= today ? candidate : pick(thisYear + 1);
}

/** Whether a day counts as a working day, and if not, why. */
export function nonWorkingReason(iso: string, holidays: Map<string, string>): string | undefined {
  if (holidays.has(iso)) return holidays.get(iso);
  if (isWeekend(iso)) return "weekend";
  return undefined;
}

/**
 * Plans a leave of `workingDays` working days starting on `startDate`.
 *
 * Weekends and public holidays inside the period are skipped and listed, the
 * end date is the last working day taken, and the return date is the first
 * working day after it. A start on a non-working day is refused rather than
 * shifted, because silently moving the start is a decision the user has to make.
 */
export function planLeave(startDate: string, workingDays: number, holidays: Holiday[], today: string): LeavePlan {
  if (!Number.isInteger(workingDays) || workingDays < 1) {
    throw new LeaveRuleError(`workingDays must be a whole number of at least 1, but was ${workingDays}.`);
  }
  if (workingDays > 30) {
    throw new LeaveRuleError(`A single annual leave request may cover at most 30 working days, but ${workingDays} were requested.`);
  }
  if (startDate < today) {
    throw new LeaveRuleError(`The start date ${startDate} is in the past (today is ${today}). Ask the user for a future date.`);
  }

  const byDate = new Map(holidays.map((h) => [h.date, h.name]));
  const startReason = nonWorkingReason(startDate, byDate);
  if (startReason) {
    let next = addDays(startDate, 1);
    while (nonWorkingReason(next, byDate)) next = addDays(next, 1);
    throw new LeaveRuleError(
      `The start date ${startDate} is not a working day (${startReason}). ` +
        `The next working day is ${next}; ask the user whether to start then.`,
    );
  }

  const skippedDays: SkippedDay[] = [];
  let counted = 0;
  let day = startDate;
  let endDate = startDate;
  while (counted < workingDays) {
    const reason = nonWorkingReason(day, byDate);
    if (reason) skippedDays.push({ date: day, reason });
    else {
      counted++;
      endDate = day;
    }
    day = addDays(day, 1);
  }

  let returnDate = addDays(endDate, 1);
  while (nonWorkingReason(returnDate, byDate)) returnDate = addDays(returnDate, 1);

  return {
    startDate,
    endDate,
    returnDate,
    workingDays,
    // Only non-working days strictly inside the leave are worth mentioning.
    skippedDays: skippedDays.filter((s) => s.date < endDate),
    timeOff: timeOff(startDate, returnDate, byDate),
    bridgeDays: bridgeDays(startDate, returnDate, byDate),
    adjustments: [],
  };
}

/** From the first non-working day before the leave to the day before the return. */
function timeOff(startDate: string, returnDate: string, byDate: Map<string, string>) {
  let from = startDate;
  while (nonWorkingReason(addDays(from, -1), byDate)) from = addDays(from, -1);
  const to = addDays(returnDate, -1);
  return { from, to, calendarDays: daysBetween(from, to) };
}

/**
 * The working day right after the leave (the return day) and the one right
 * before it, when that day is itself next to non-working days: taking it
 * joins the leave to a weekend or holiday. A Friday return is the common
 * case — one more day, and the weekend comes with it.
 */
function bridgeDays(startDate: string, returnDate: string, byDate: Map<string, string>): BridgeDay[] {
  const run = (from: string, step: 1 | -1) => {
    let n = 0;
    for (let d = addDays(from, step); nonWorkingReason(d, byDate); d = addDays(d, step)) n++;
    return n;
  };
  const result: BridgeDay[] = [];
  let before = addDays(startDate, -1);
  while (nonWorkingReason(before, byDate)) before = addDays(before, -1);
  const gainBefore = run(before, -1);
  if (gainBefore) result.push({ date: before, extraDaysOff: 1 + gainBefore });
  const gainAfter = run(returnDate, 1);
  if (gainAfter) result.push({ date: returnDate, extraDaysOff: 1 + gainAfter });
  return result;
}

/**
 * Plans a leave given as a date range, e.g. "6 to 9 November".
 *
 * The range is taken as meant: a start or end on a weekend or holiday is
 * trimmed to the nearest working day, because nobody needs leave for a
 * Saturday, and the trim is reported in `adjustments`. A range without a
 * single working day is refused — there is nothing to file.
 */
export function planLeaveBetween(startDate: string, endDate: string, holidays: Holiday[], today: string): LeavePlan {
  if (endDate < startDate) {
    throw new LeaveRuleError(`The end date ${endDate} is before the start date ${startDate}. Ask the user for the correct range.`);
  }
  const byDate = new Map(holidays.map((h) => [h.date, h.name]));
  const adjustments: string[] = [];

  let first = startDate;
  while (first <= endDate && nonWorkingReason(first, byDate)) first = addDays(first, 1);
  if (first > endDate) {
    throw new LeaveRuleError(
      `${startDate} – ${endDate} has no working day (${nonWorkingReason(startDate, byDate)}), so no leave is needed for it.`,
    );
  }
  if (first !== startDate) {
    adjustments.push(
      `${weekday(startDate)} ${startDate} is not a working day (${nonWorkingReason(startDate, byDate)}); the leave starts on ${weekday(first)} ${first}.`,
    );
  }

  let last = endDate;
  while (nonWorkingReason(last, byDate)) last = addDays(last, -1);
  if (last !== endDate) {
    adjustments.push(
      `${weekday(endDate)} ${endDate} is not a working day (${nonWorkingReason(endDate, byDate)}); the leave ends on ${weekday(last)} ${last}.`,
    );
  }

  let workingDays = 0;
  for (let d = first; d <= last; d = addDays(d, 1)) if (!nonWorkingReason(d, byDate)) workingDays++;
  return { ...planLeave(first, workingDays, holidays, today), adjustments };
}

export type LeaveBalance = {
  year: number;
  entitlement: number;
  /** Approved leave in the year. */
  used: number;
  /** Submitted leave still waiting for approval. */
  pending: number;
  remaining: number;
};

/**
 * Remaining annual leave for a year. Pending requests count against the
 * balance, so two requests filed in a row cannot together exceed it.
 */
export function leaveBalance(
  year: number,
  entitlement: number,
  requests: { startDate: string; workingDays: number; status: string }[],
): LeaveBalance {
  const inYear = requests.filter((r) => r.startDate.startsWith(`${year}-`));
  const sum = (status: string) =>
    inYear.filter((r) => r.status === status).reduce((total, r) => total + r.workingDays, 0);
  const used = sum("approved");
  const pending = sum("submitted");
  return { year, entitlement, used, pending, remaining: entitlement - used - pending };
}

/** Whether two inclusive date ranges overlap. */
export const overlaps = (aStart: string, aEnd: string, bStart: string, bEnd: string): boolean =>
  aStart <= bEnd && bStart <= aEnd;
