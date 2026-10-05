using { hr } from './db/schema';

/**
 * The base service for time recording. It owns the rules — assigned and
 * active projects, quarter hours, at most 12 hours a day, no future dates,
 * locked weeks — and the data, including the weekly PDF. The agents only
 * translate what a person says into calls to this service.
 *
 * It knows nothing about leave, on purpose: like the services in the XTravels
 * sample, each domain stands on its own, and the HR agent is what combines
 * them (it refuses bookings on leave days before calling this service).
 *
 * Every operation acts for the logged-in user, resolved from `$user`.
 */
@requires: 'authenticated-user'
@path: '/odata/v4/timesheet'
service TimesheetService {

  /**
   * The caller's own bookings. The Fiori app in app/timesheet lists them; the
   * calculated elements are for it.
   */
  @readonly
  @restrict: [{ grant: 'READ', where: 'employee.userId = $user' }]
  entity MyTimeEntries as projection on hr.TimeEntries {
    *,
    project.name      as projectName  : String(100),
    project.customer  as customer     : String(100),
    activityType.name as activityName : String(60),
    case status when 'draft' then 'Draft' when 'submitted' then 'Submitted' end as statusText : String(20),
    // UI.CriticalityType: 2 critical (orange) for still editable, 3 positive (green) once submitted.
    case status when 'submitted' then 3 else 2 end as statusCriticality : Integer,
  };

  /** Submitted weeks. The PDF is served at `MyTimesheetWeeks(<ID>)/pdf`. */
  @readonly
  @restrict: [{ grant: 'READ', where: 'employee.userId = $user' }]
  entity MyTimesheetWeeks as projection on hr.TimesheetWeeks;

  @readonly entity ActivityTypes as projection on hr.ActivityTypes;

  /** Projects and booking statuses: value helps of the app's filters. */
  @readonly entity Projects as projection on hr.Projects;
  @readonly entity TimeEntryStatuses as projection on hr.TimeEntryStatuses;

  type ProjectInfo {
    ID       : String(10);
    name     : String(100);
    customer : String(100);
  }

  type ActivityInfo {
    code     : String(20);
    name     : String(60);
    billable : Boolean;
  }

  /** One booking as given by the user. */
  type EntryInput {
    /** Project ID, name or customer, e.g. "P100", "Apollo" or "Contoso". */
    project      : String(100);
    /** Activity code or name, e.g. "development". */
    activityType : String(60);
    hours        : Decimal(4, 2);
    description  : String(250);
  }

  type Entry {
    ID           : UUID;
    workDate     : Date;
    projectId    : String(10);
    project      : String(100);
    activityType : String(20);
    hours        : Decimal(4, 2);
    description  : String(250);
    status       : String(20);
    /** Opens the booking in the My Timesheet app; null for a preview that was not saved. */
    appUrl       : String(300);
  }

  type DayCheck {
    workDate : Date;
    entries  : many Entry;
    /** Hours on the day including these bookings. */
    dayTotal : Decimal(4, 2);
    warnings : many String(200);
  }

  type DayTotal {
    date    : Date;
    hours   : Decimal(4, 2);
    target  : Decimal(4, 2);
    missing : Decimal(4, 2);
    /** weekend, the holiday's name, or annual leave. */
    note    : String(100);
  }

  type ProjectTotal {
    project  : String(100);
    hours    : Decimal(6, 2);
    billable : Decimal(6, 2);
  }

  type WeekSummary {
    weekStart : Date;
    weekEnd   : Date;
    days      : many DayTotal;
    byProject : many ProjectTotal;
    total     : Decimal(6, 2);
    target    : Decimal(6, 2);
    /** open, or submitted once the week was sent for approval. */
    status    : String(20);
    pdfUrl    : String(200);
  }

  /** The caller's active projects and the activity types that can be booked. */
  function getMyProjects() returns {
    projects   : many ProjectInfo;
    activities : many ActivityInfo;
    today      : Date;
  };

  /** Checks bookings for one day without saving them. */
  action checkEntries(workDate : Date not null, entries : many EntryInput) returns DayCheck;

  /** Saves bookings for one day. Applies the same checks as checkEntries. */
  action addEntries(workDate : Date not null, entries : many EntryInput) returns DayCheck;

  /** Deletes one of the caller's draft bookings. */
  action deleteEntry(entryId : UUID not null) returns Entry;

  /** The caller's bookings on one day. */
  function getDay(workDate : Date not null) returns DayCheck;

  /** Totals for the week containing `anyDay`. `leaveDays` are shown as such and carry no target. */
  function getWeek(anyDay : Date not null, leaveDays : many Date) returns WeekSummary;

  /** Submits the week containing `anyDay`: locks its bookings and stores the timesheet PDF. */
  action submitWeek(anyDay : Date not null, leaveDays : many Date) returns WeekSummary;
}
