/**
 * Timesheet rules: which day "today" or "last Thursday" means, which project
 * "Apollo" means, and whether a set of bookings may be saved.
 *
 * Pure functions over ISO date strings, no CAP, so test/unit covers them.
 * Dates are handled in UTC for the same reason as in the leave calendar.
 */

export class TimesheetRuleError extends Error {}

const DAY_MS = 86_400_000;
const toTime = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const toIso = (time: number) => new Date(time).toISOString().slice(0, 10);
export const addDays = (iso: string, days: number) => toIso(toTime(iso) + days * DAY_MS);
const weekday = (iso: string) => new Date(toTime(iso)).getUTCDay();

/** Bookings may reach this many days into the past. */
export const MAX_DAYS_BACK = 60;
/** Upper bound for one day, across all bookings. */
export const MAX_HOURS_PER_DAY = 12;

/**
 * Resolves the day a person means for a booking. Nothing given → today. A day
 * and month without a year → the most recent such date on or before today,
 * because time is booked for work already done.
 */
export function resolveWorkDate(
  day: number | undefined,
  month: number | undefined,
  year: number | undefined,
  today: string,
): string {
  if (!day && !month && !year) return today;
  if (!day || !month) throw new TimesheetRuleError("Give both the day and the month of the work date, or neither for today.");
  const pick = (y: number) => {
    const iso = `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (Number.isNaN(toTime(iso)) || toIso(toTime(iso)) !== iso) {
      throw new TimesheetRuleError(`${day}.${month}.${y} is not a valid date. Ask the user for the correct date.`);
    }
    return iso;
  };
  if (year) return pick(year);
  const thisYear = Number(today.slice(0, 4));
  const candidate = pick(thisYear);
  return candidate <= today ? candidate : pick(thisYear - 1);
}

/** Monday and Sunday of the week a date falls in. */
export function weekOf(iso: string): { weekStart: string; weekEnd: string } {
  const offset = (weekday(iso) + 6) % 7; // Monday = 0
  const weekStart = addDays(iso, -offset);
  return { weekStart, weekEnd: addDays(weekStart, 6) };
}

export type Project = { ID: string; name: string; customer?: string | null; active: boolean };

/**
 * Resolves what a person calls a project — its ID ("P100"), its name or part
 * of it ("Apollo"), or its customer ("Contoso") — among the projects they are
 * assigned to. No match or several matches are refused with the options, so
 * the model can ask instead of guessing.
 */
export function resolveProject(input: string, assigned: Project[]): Project {
  const q = input.trim().toLowerCase();
  // Only open projects are offered as alternatives; a closed one named outright still gets its own message below.
  const list = assigned.filter((p) => p.active).map((p) => `${p.ID} ${p.name}`).join(", ");
  const byId = assigned.find((p) => p.ID.toLowerCase() === q);
  const matches = byId
    ? [byId]
    : assigned.filter((p) => p.name.toLowerCase().includes(q) || (p.customer ?? "").toLowerCase().includes(q));
  if (matches.length === 0) {
    throw new TimesheetRuleError(`No project of yours matches "${input}". The projects you can book on are: ${list}. Ask which one is meant.`);
  }
  // Several matches with only one still open ("Contoso": Apollo and the closed Legacy Archive) is no real choice.
  const open = matches.filter((p) => p.active);
  if (matches.length > 1 && open.length === 1) return open[0];
  if (matches.length > 1) {
    throw new TimesheetRuleError(
      `"${input}" matches several of your projects: ${matches.map((p) => `${p.ID} ${p.name}`).join(", ")}. Ask which one is meant.`,
    );
  }
  const [project] = matches;
  if (!project.active) throw new TimesheetRuleError(`Project ${project.ID} ${project.name} is closed; no more time can be booked on it.`);
  return project;
}

export type ActivityType = { code: string; name: string };

/** Resolves an activity by code ("meeting") or name ("Analysis and design"). */
export function resolveActivity(input: string, types: ActivityType[]): ActivityType {
  const q = input.trim().toLowerCase();
  const found = types.find((t) => t.code === q || t.name.toLowerCase() === q);
  if (!found) {
    throw new TimesheetRuleError(`"${input}" is not an activity type. Use one of: ${types.map((t) => t.code).join(", ")}.`);
  }
  return found;
}

/**
 * Checks bookings for one day. Returns the warnings worth telling the user
 * (weekend, public holiday, day still short of target); throws for anything
 * that must not be saved.
 */
export function checkDay(args: {
  workDate: string;
  today: string;
  hours: number[];
  bookedBefore: number;
  weekSubmitted: boolean;
  holiday?: string;
  dailyHours: number;
}): { dayTotal: number; warnings: string[] } {
  const { workDate, today, hours, bookedBefore, weekSubmitted, holiday, dailyHours } = args;
  if (workDate > today) throw new TimesheetRuleError(`${workDate} is in the future (today is ${today}). Time can only be booked for work already done.`);
  if (workDate < addDays(today, -MAX_DAYS_BACK)) {
    throw new TimesheetRuleError(`${workDate} is more than ${MAX_DAYS_BACK} days ago; HR has to book it.`);
  }
  if (weekSubmitted) {
    const { weekStart } = weekOf(workDate);
    throw new TimesheetRuleError(`The week starting ${weekStart} has already been submitted and is locked.`);
  }
  if (hours.length === 0) throw new TimesheetRuleError("No bookings given.");
  for (const h of hours) {
    if (!(h > 0) || h > MAX_HOURS_PER_DAY || Math.round(h * 4) !== h * 4) {
      throw new TimesheetRuleError(`${h} is not a valid number of hours. Use quarter hours between 0.25 and ${MAX_HOURS_PER_DAY}.`);
    }
  }
  const dayTotal = bookedBefore + hours.reduce((a, b) => a + b, 0);
  if (dayTotal > MAX_HOURS_PER_DAY) {
    throw new TimesheetRuleError(
      `That makes ${dayTotal} hours on ${workDate} (${bookedBefore} already booked); at most ${MAX_HOURS_PER_DAY} hours fit in a day.`,
    );
  }
  const warnings: string[] = [];
  if ([0, 6].includes(weekday(workDate))) warnings.push(`${workDate} is a weekend day.`);
  if (holiday) warnings.push(`${workDate} is a public holiday (${holiday}).`);
  if (!holiday && ![0, 6].includes(weekday(workDate)) && dayTotal < dailyHours) {
    warnings.push(`${workDate} now has ${dayTotal} of ${dailyHours} hours.`);
  }
  return { dayTotal, warnings };
}

export type DayTotal = { date: string; hours: number; target: number; missing: number; note?: string };

/**
 * Per-day totals for a week against the daily target. Weekends, public
 * holidays and leave days have no target, so they never show as missing.
 */
export function weekDays(
  weekStart: string,
  bookings: { workDate: string; hours: number }[],
  holidays: Map<string, string>,
  leaveDays: Set<string>,
  dailyHours: number,
): DayTotal[] {
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(weekStart, i);
    const hours = bookings.filter((b) => b.workDate === date).reduce((sum, b) => sum + Number(b.hours), 0);
    const note = leaveDays.has(date) ? "annual leave" : holidays.get(date) ?? ([0, 6].includes(weekday(date)) ? "weekend" : undefined);
    const target = note ? 0 : dailyHours;
    return { date, hours, target, missing: Math.max(0, target - hours), ...(note ? { note } : {}) };
  });
}
