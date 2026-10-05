using { hr } from './db/schema';
using { hr as master } from '../../db/schema';

/**
 * The HR base service for annual leave. It owns the rules — working-day
 * counting, public holidays, the balance, overlapping requests — and the
 * persistence, including the generated PDF. The agent in hr-agent.cds only
 * translates what a person says into calls to this service, so the same rules
 * apply whether a request comes from the chat, a UI or another system.
 *
 * Every operation acts for the logged-in user: the employee is resolved from
 * `$user`, never passed in, so nobody can file or read leave for someone else.
 * The approval operations at the end are for managers: they see and decide
 * the requests of their direct reports only.
 */
@requires: 'authenticated-user'
@path: '/odata/v4/leave'
service LeaveService {

  /**
   * The caller's own leave requests. The PDF is served at `MyLeaveRequests(<ID>)/pdf`.
   * The Fiori app in app/leave-requests lists them; the calculated elements are for it.
   */
  @readonly
  @restrict: [{ grant: 'READ', where: 'employee.userId = $user' }]
  entity MyLeaveRequests as projection on hr.LeaveRequests {
    *,
    case status
      when 'submitted' then 'Waiting for approval'
      when 'approved'  then 'Approved'
      when 'rejected'  then 'Rejected'
      when 'cancelled' then 'Cancelled'
    end as statusText        : String(40),
    // UI.CriticalityType: 1 negative (red), 2 critical (orange), 3 positive (green), 0 neutral.
    case status
      when 'submitted' then 2
      when 'approved'  then 3
      when 'rejected'  then 1
      else 0
    end as statusCriticality : Integer,
    decidedBy.firstName || ' ' || decidedBy.lastName as decidedByName : String(160),
  };

  /** The statuses a request can have; the value help of the app's status filter. */
  @readonly entity LeaveStatuses as projection on master.LeaveStatuses;

  /**
   * Leave requests of the caller's direct reports. The PDF is served at
   * `TeamLeaveRequests(<ID>)/pdf`; the Fiori app in app/team-leave-requests
   * lists them, with the same calculated elements as MyLeaveRequests.
   */
  @readonly
  @restrict: [{ grant: 'READ', to: 'Manager', where: 'employee.manager.userId = $user' }]
  entity TeamLeaveRequests as projection on hr.LeaveRequests {
    *,
    employee.firstName || ' ' || employee.lastName as employeeName : String(160),
    employee.department as department : String(80),
    case status
      when 'submitted' then 'Waiting for approval'
      when 'approved'  then 'Approved'
      when 'rejected'  then 'Rejected'
      when 'cancelled' then 'Cancelled'
    end as statusText        : String(40),
    case status
      when 'submitted' then 2
      when 'approved'  then 3
      when 'rejected'  then 1
      else 0
    end as statusCriticality : Integer,
    decidedBy.firstName || ' ' || decidedBy.lastName as decidedByName : String(160),
  };

  @readonly entity PublicHolidays as projection on master.PublicHolidays;

  type LeaveBalance {
    employeeId  : String(10);
    employee    : String(160);
    year        : Integer;
    entitlement : Integer;
    used        : Integer;
    pending     : Integer;
    remaining   : Integer;
    today       : Date;
  }

  type SkippedDay {
    date   : Date;
    /** "weekend" or the name of the public holiday. */
    reason : String(100);
  }

  type BridgeDay {
    date         : Date;
    extraDaysOff : Integer;
  }

  type LeavePlan {
    startDate        : Date;
    endDate          : Date;
    returnDate       : Date;
    workingDays      : Integer;
    skippedDays      : many SkippedDay;
    /** The whole break: from the weekend or holiday before the leave to the day before the return. */
    timeOffFrom      : Date;
    timeOffTo        : Date;
    calendarDaysOff  : Integer;
    /** Working days next to the leave that would join it to a weekend or holiday. */
    bridgeDays       : many BridgeDay;
    /** How a date range was trimmed to working days; empty when unchanged. */
    adjustments      : many String(200);
    remainingBefore  : Integer;
    remainingAfter   : Integer;
  }

  type LeaveRequestSummary {
    ID          : UUID;
    number      : String(20);
    startDate   : Date;
    endDate     : Date;
    returnDate  : Date;
    workingDays : Integer;
    status      : String(20);
    reason      : String(500);
    /** Relative URL of the request's PDF form. */
    pdfUrl      : String(200);
    /** The request in the My Leave Requests app, if that app is deployed. */
    appUrl      : String(300);
  }

  /** The caller's leave balance for a calendar year (default: the current year). */
  function getBalance(year : Integer) returns LeaveBalance;

  /** Calculates a leave period without saving anything. */
  function planLeave(startDate : Date not null, workingDays : Integer not null) returns LeavePlan;

  /** Calculates a leave given as a date range, trimmed to working days at both ends, without saving anything. */
  function planLeaveBetween(startDate : Date not null, endDate : Date not null) returns LeavePlan;

  /** Files an annual leave request for the caller and stores its PDF form. */
  action submitLeave(startDate : Date not null, workingDays : Integer not null, reason : String(500))
    returns LeaveRequestSummary;

  /** The caller's leave requests in a year (default: the current year), newest first. */
  function getLeaveRequests(year : Integer) returns many LeaveRequestSummary;

  /** Cancels one of the caller's requests that has not started yet. */
  action cancelLeave(requestId : UUID not null) returns LeaveRequestSummary;

  // ── Approvals (managers) ─────────────────────────────────────────────────

  /** A request of a direct report that waits for the manager's decision. */
  type PendingApproval {
    ID             : UUID;
    number         : String(20);
    employeeId     : String(10);
    employee       : String(160);
    department     : String(80);
    requestedOn    : Date;
    startDate      : Date;
    endDate        : Date;
    returnDate     : Date;
    workingDays    : Integer;
    reason         : String(500);
    /** The employee's balance for that year if this request is approved. */
    remainingAfter : Integer;
    /** Other requests in the team that overlap this one, e.g. "Bob Miller, 2026-11-11 – 2026-11-12 (approved)". */
    teamOverlaps   : many String(200);
    pdfUrl         : String(200);
    /** The request in the Team Leave Requests app, if that app is deployed. */
    appUrl         : String(300);
  }

  type LeaveDecision {
    ID           : UUID;
    number       : String(20);
    employee     : String(160);
    startDate    : Date;
    endDate      : Date;
    workingDays  : Integer;
    /** approved or rejected. */
    status       : String(20);
    decisionNote : String(500);
    decidedAt    : Timestamp;
    pdfUrl       : String(200);
    appUrl       : String(300);
  }

  /** Requests of the caller's direct reports that wait for a decision, oldest first. Managers only. */
  function getPendingApprovals() returns many PendingApproval;

  /**
   * Approves or rejects a waiting request of one of the caller's direct
   * reports and updates its PDF form. Managers only; a rejection needs a note.
   */
  action decideLeave(
    requestId : UUID not null,
    decision  : String(10) not null enum { approve; reject; },
    note      : String(500)
  ) returns LeaveDecision;
}
