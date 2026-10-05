import cds from "@sap/cds";

/**
 * Today as an ISO date (YYYY-MM-DD), in UTC.
 *
 * `cds.env.hr.today` pins it — set it in a profile to demo or test a fixed
 * date. Both the agent (resolving "10 November" to a year) and LeaveService
 * (refusing past dates) read it here, so the two can never disagree.
 */
export const today = (): string =>
  (cds.env as { hr?: { today?: string } }).hr?.today ?? new Date().toISOString().slice(0, 10);
