using { TimesheetService as ts } from '../timesheet/timesheet-service';

// The root agent, like TravelAgentService in the XTravels sample. It talks to
// the employee, delegates questions over A2A to the two subagents, and does the
// writing itself — every write is `@agent.hitl`, so the employee approves it
// first. That split exists because an approval requested inside a subagent
// does not travel back through A2A.
//
//   HrAgent ──A2A──▶ LeaveAgent      ──▶ LeaveService      (leave)
//           ──A2A──▶ TimesheetAgent  ──▶ TimesheetService  (time recording)
//           ──in-process (writes)──▶ LeaveService, TimesheetService
//
// It is also where the two domains meet: LeaveService and TimesheetService do
// not know each other, and the HR agent refuses time bookings on leave days
// before they reach TimesheetService.
//
// Its instructions and skills live next to this file (AGENTS.md, skills/).
@agent
@agent.connect: ['LeaveAgent', 'TimesheetAgent']
@requires: 'authenticated-user'
service HrAgent {

  /** A filed leave request. */
  type LeaveRequest {
    /** Pass this to cancelLeaveRequest. */
    requestId   : UUID;
    /** Request number shown to the user, e.g. LR-2026-0002. */
    number      : String(20);
    startDate   : Date;
    endDate     : Date;
    returnDate  : Date;
    workingDays : Integer;
    /** submitted (waiting for the manager), approved, rejected or cancelled. */
    status      : String(20);
    reason      : String(500);
    /** Link to the request's PDF form. Show it to the user as a download link. */
    pdfUrl      : String(200);
    /** Opens the request in the My Leave Requests app. Make the request number a Markdown link to it. */
    appUrl      : String(300);
  }

  /** One booking as the user describes it. */
  type TimeEntryInput {
    /** Project as the user named it: its ID, name or customer, e.g. "P100", "Apollo" or "Contoso". */
    project      : String(100);
    /** What kind of work it was. */
    activityType : String(20) enum {
      development   = 'development';
      analysis      = 'analysis';
      testing       = 'testing';
      meeting       = 'meeting';
      support       = 'support';
      documentation = 'documentation';
      training      = 'training';
    };
    /** Hours in quarter steps, e.g. 4 or 1.5. */
    hours        : Decimal(4, 2);
    /** Short note on what was done, if the user gave one. */
    description  : String(250);
  }

  // ── Leave ────────────────────────────────────────────────────────────────

  /**
   * Files an annual leave request and creates its PDF form. Before calling,
   * ask the leave agent to plan the leave and show the plan to the user; call
   * this only after the user agreed, with the plan's start date and days.
   */
  @agent.hitl
  action submitAnnualLeave(
    /** Day of the month the leave starts. */
    startDay    : Integer not null @assert.range: [1, 31],
    /** Month the leave starts, 1-12. */
    startMonth  : Integer not null @assert.range: [1, 12],
    /** Year the leave starts, as in the plan's start date. */
    startYear   : Integer not null,
    /** Number of working days, as in the agreed plan. */
    workingDays : Integer not null @assert.range: [1, 30],
    /** Optional note from the user, e.g. "family visit". Leave empty if none was given. */
    reason      : String(500)
  ) returns LeaveRequest;

  /** Cancels one of the user's leave requests that has not started yet. */
  @agent.hitl
  action cancelLeaveRequest(
    /** The requestId, as the leave agent reports it. */
    requestId : UUID not null
  ) returns LeaveRequest;

  /** A manager's decision on a team member's leave request. */
  type LeaveDecision {
    requestId    : UUID;
    number       : String(20);
    employee     : String(160);
    startDate    : Date;
    endDate      : Date;
    workingDays  : Integer;
    /** approved or rejected. */
    status       : String(20);
    decisionNote : String(500);
    /** Link to the updated PDF form. Show it to the manager as a download link. */
    pdfUrl       : String(200);
    /** Opens the request in the Team Leave Requests app. Make the request number a Markdown link to it. */
    appUrl       : String(300);
  }

  /**
   * Approves or rejects a leave request of the manager's team. Only for
   * managers. Ask the leave agent for the pending approvals first and show
   * them; call this for the request the manager picked.
   */
  @agent.hitl
  action decideLeaveRequest(
    /** The requestId, as the leave agent lists it under pending approvals. */
    requestId : UUID not null,
    decision  : String(10) not null enum { approve; reject; },
    /** The manager's note. Required for a rejection; optional for an approval. */
    note      : String(500)
  ) returns LeaveDecision;

  // ── Time recording ───────────────────────────────────────────────────────

  /**
   * Checks bookings for one day without saving them: resolves the projects,
   * refuses leave days, future dates and days over 12 hours, and returns the
   * day's new total and any warnings. Use this first whenever someone wants to
   * book time, e.g. "today I worked 4 hours on Apollo", and show the result.
   */
  action previewTimeEntries(
    /** Day of the month worked. Leave day, month and year empty for today. */
    workDay   : Integer @assert.range: [1, 31],
    /** Month worked, 1-12. */
    workMonth : Integer @assert.range: [1, 12],
    /** Year worked. Leave empty: the most recent such date up to today is used. */
    workYear  : Integer,
    entries   : many TimeEntryInput not null
  ) returns ts.DayCheck;

  /** Saves the bookings for one day. Call only after previewTimeEntries and after the user agreed, with the same values. */
  @agent.hitl
  action recordTimeEntries(
    /** Day of the month worked. Leave day, month and year empty for today. */
    workDay   : Integer @assert.range: [1, 31],
    /** Month worked, 1-12. */
    workMonth : Integer @assert.range: [1, 12],
    /** Year worked, as in the preview's work date. */
    workYear  : Integer,
    entries   : many TimeEntryInput not null
  ) returns ts.DayCheck;

  /** Deletes one draft booking. */
  @agent.hitl
  action deleteTimeEntry(
    /** The entry ID, as the timesheet agent reports it. */
    entryId : UUID not null
  ) returns ts.Entry;

  /**
   * Submits a week's timesheet for approval: locks its bookings and creates
   * the weekly PDF. Leave days in that week are marked as such. Before
   * calling, ask the timesheet agent for the week summary and show it.
   */
  @agent.hitl
  action submitTimesheetWeek(
    /** Any day of the week. Leave day, month and year empty for the current week. */
    workDay   : Integer @assert.range: [1, 31],
    /** Month, 1-12. */
    workMonth : Integer @assert.range: [1, 12],
    /** Year. Leave empty: the most recent such date up to today is used. */
    workYear  : Integer
  ) returns ts.WeekSummary;
}
