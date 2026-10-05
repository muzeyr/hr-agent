import cds from "@sap/cds";
import { LeaveRuleError, resolveDate } from "../leave/lib/leave-calendar.js";

/**
 * The translation layer between the agent's tools and LeaveService: what a
 * person says (a day and a month) into what the service takes (an ISO date),
 * and the service's rows back into the shape the tool schema promises.
 */

export type LeaveRequestRow = {
  ID: string;
  number: string;
  startDate: string;
  endDate: string;
  returnDate: string;
  workingDays: number;
  status: string;
  reason?: string | null;
  pdfUrl: string;
  appUrl?: string | null;
};

/** LeaveService's row → the agent's `LeaveRequest` type (`ID` is exposed as `requestId`). */
export const toLeaveRequest = ({ ID, ...rest }: LeaveRequestRow) => ({ requestId: ID, ...rest });

/** Resolves the tool's day/month/year into an ISO date, rejecting an impossible date with a message the model can act on. */
export function startDateFrom(
  req: cds.Request,
  args: { startDay: number; startMonth: number; startYear?: number | null },
  todayIso: string,
): string {
  try {
    return resolveDate(args.startDay, args.startMonth, args.startYear ?? undefined, todayIso);
  } catch (err) {
    if (err instanceof LeaveRuleError) return req.reject(400, err.message);
    throw err;
  }
}

/**
 * Runs a LeaveService call and passes its rejection on unchanged.
 *
 * LeaveService words its errors for the model ("Only 2 days remain… offer at
 * most 2"). Rethrowing them through `req.reject` keeps that text and status
 * instead of turning it into a generic 500 the model can do nothing with.
 */
export async function forward<T>(req: cds.Request, call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    const err = error as { status?: number; code?: number | string; message?: string };
    const status = err.status ?? (typeof err.code === "number" ? err.code : 500);
    return req.reject(status, err.message ?? String(error));
  }
}
