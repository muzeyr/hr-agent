// The leave subagent. `@agent` serves it over A2A at /a2a/leave-agent and turns
// its functions into tools; its instructions live in `leave-agent/AGENTS.md`.
// It answers questions and plans leave, but cannot file anything: writing is
// left to the HR agent, which asks the employee for approval first
// (`@agent.hitl` does not travel back through A2A from a subagent).
@agent
@agent.connect: 'none'
@requires: 'authenticated-user'
service LeaveAgent {

  type SkippedDay {
    date   : Date;
    /** "weekend", or the name of the public holiday. */
    reason : String(100);
  }

  /** A proposed annual leave, calculated but not yet filed. */
  type LeaveProposal {
    startDate       : Date;
    /** Last day of leave. */
    endDate         : Date;
    /** First working day back at work. */
    returnDate      : Date;
    workingDays     : Integer;
    /** Weekends and public holidays inside the period; they do not use up leave. */
    skippedDays     : many SkippedDay;
    /** First day away from work: the weekend or holiday right before the leave counts. */
    timeOffFrom     : Date;
    /** Last day away from work, the day before the return. */
    timeOffTo       : Date;
    /** Calendar days from timeOffFrom to timeOffTo — the length of the whole break. */
    calendarDaysOff : Integer;
    /** Working days right before or after the leave that would join it to a weekend or holiday. */
    bridgeDays      : many {
      date         : Date;
      /** Days off gained by taking this one day as well. */
      extraDaysOff : Integer;
    };
    /** How a date range was trimmed to working days, e.g. an end on a Saturday. Tell the user. */
    adjustments     : many String(200);
    remainingBefore : Integer;
    remainingAfter  : Integer;
  }

  /** A filed leave request. */
  type LeaveRequest {
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
    /** Link to the request's PDF form, if it has one. */
    pdfUrl      : String(200);
    /** Opens the request in the My Leave Requests app. Make the request number a Markdown link to it. */
    appUrl      : String(300);
  }

  type LeaveBalance {
    employee    : String(160);
    year        : Integer;
    entitlement : Integer;
    /** Approved leave already taken or booked. */
    used        : Integer;
    /** Leave requested but still waiting for approval. */
    pending     : Integer;
    remaining   : Integer;
    /** Today's date, for resolving "next week", "tomorrow" and similar. */
    today       : Date;
  }

  /** Returns how many days of annual leave the user has left in a year. */
  function getLeaveBalance(
    /** Calendar year. Leave empty for the current year. */
    year : Integer
  ) returns LeaveBalance;

  /**
   * Calculates an annual leave without saving it: end date, return date and
   * the weekends or public holidays that do not count. Use this whenever
   * someone wants to take or plan leave, e.g. "3 days starting 10 November".
   */
  function planAnnualLeave(
    /** Day of the month the leave starts, e.g. 10 for "10 November". */
    startDay    : Integer not null @assert.range: [1, 31],
    /** Month the leave starts, 1-12, e.g. 11 for November. */
    startMonth  : Integer not null @assert.range: [1, 12],
    /** Year the leave starts. Leave empty when none was named: the next such date from today is used. */
    startYear   : Integer,
    /** Number of working days of leave asked for, e.g. 3 for "3 days". */
    workingDays : Integer not null @assert.range: [1, 30]
  ) returns LeaveProposal;

  /**
   * Calculates an annual leave given as a date range without saving it, e.g.
   * "from 6 to 13 November". Counts the working days in it; a start or end
   * on a weekend or holiday is trimmed to the nearest working day.
   */
  function planAnnualLeaveBetween(
    /** Day of the month the range starts. */
    startDay   : Integer not null @assert.range: [1, 31],
    /** Month the range starts, 1-12. */
    startMonth : Integer not null @assert.range: [1, 12],
    /** Year the range starts. Leave empty when none was named. */
    startYear  : Integer,
    /** Day of the month the range ends, inclusive. */
    endDay     : Integer not null @assert.range: [1, 31],
    /** Month the range ends, 1-12. */
    endMonth   : Integer not null @assert.range: [1, 12],
    /** Year the range ends. Leave empty when none was named: the first such date on or after the start is used. */
    endYear    : Integer
  ) returns LeaveProposal;

  /** Lists the user's leave requests in a year, newest first. */
  function listMyLeaveRequests(
    /** Calendar year. Leave empty for the current year. */
    year : Integer
  ) returns many LeaveRequest;

  /** A request of one of the manager's direct reports that waits for their decision. */
  type PendingApproval {
    /** Pass this to the HR agent's decideLeaveRequest. */
    requestId      : UUID;
    number         : String(20);
    employee       : String(160);
    department     : String(80);
    requestedOn    : Date;
    startDate      : Date;
    endDate        : Date;
    returnDate     : Date;
    workingDays    : Integer;
    reason         : String(500);
    /** The employee's remaining leave for that year if this request is approved. */
    remainingAfter : Integer;
    /** Other team requests overlapping this one; worth mentioning before approving. */
    teamOverlaps   : many String(200);
    /** Link to the request's PDF form, if it has one. */
    pdfUrl         : String(200);
    /** Opens the request in the Team Leave Requests app. Make the request number a Markdown link to it. */
    appUrl         : String(300);
  }

  /**
   * Lists the leave requests of the user's team that wait for the user's
   * approval, oldest first. Only for managers. Use it whenever someone asks
   * "is anything waiting for my approval?" or "show pending leave requests".
   */
  function listPendingApprovals() returns many PendingApproval;
}
