using { TimesheetService as ts } from './timesheet-service';

// The timesheet subagent. `@agent` serves it over A2A at /a2a/timesheet-agent;
// its instructions live in `timesheet-agent/AGENTS.md`. It answers questions
// about projects and booked hours. Booking and submitting are left to the HR
// agent, which asks the employee for approval first.
@agent
@agent.connect: 'none'
@requires: 'authenticated-user'
service TimesheetAgent {

  /** The user's active projects, the activity types that can be booked, and today's date. */
  function listMyProjects() returns {
    projects   : many ts.ProjectInfo;
    activities : many ts.ActivityInfo;
    today      : Date;
  };

  /** The user's bookings on one day, with the day's total. */
  function getDayEntries(
    /** Day of the month. Leave day, month and year empty for today. */
    workDay   : Integer @assert.range: [1, 31],
    /** Month, 1-12. */
    workMonth : Integer @assert.range: [1, 12],
    /** Year. Leave empty: the most recent such date up to today is used. */
    workYear  : Integer
  ) returns ts.DayCheck;

  /**
   * Hours per day and per project for the week containing the given day,
   * against the daily target, and whether the week was already submitted.
   * Leave days are not known here; they show as missing hours.
   */
  function getWeekSummary(
    /** Any day of the week. Leave day, month and year empty for the current week. */
    workDay   : Integer @assert.range: [1, 31],
    /** Month, 1-12. */
    workMonth : Integer @assert.range: [1, 12],
    /** Year. Leave empty: the most recent such date up to today is used. */
    workYear  : Integer
  ) returns ts.WeekSummary;
}
