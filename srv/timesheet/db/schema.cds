namespace hr;

using { cuid, managed } from '@sap/cds/common';
using { hr.Employees } from '../../../db/schema';

/** Projects time can be booked on. */
entity Projects {
  key ID       : String(10);
      name     : String(100);
      customer : String(100);
      active   : Boolean default true;
}

/** Who may book on which project. */
entity ProjectAssignments {
  key employee : Association to Employees;
  key project  : Association to Projects;
}

/** What kind of work was done. `billable` tells whether the hours are charged to the customer. */
entity ActivityTypes {
  key code     : String(20);
      name     : String(60);
      billable : Boolean default true;
}

/** One booking: hours of one activity on one project on one day. */
entity TimeEntries : cuid, managed {
  employee     : Association to Employees not null;
  workDate     : Date not null;
  project      : Association to Projects not null;
  activityType : Association to ActivityTypes not null;
  hours        : Decimal(4, 2) not null;
  description  : String(250);
  /** draft entries can still be changed; submitted ones are locked with their week. */
  status       : String(20) enum { draft = 'draft'; submitted = 'submitted'; } default 'draft';
}

/** A submitted week, with the timesheet PDF that was generated for it. */
entity TimesheetWeeks : cuid, managed {
  employee    : Association to Employees not null;
  /** Monday of the week. */
  weekStart   : Date not null;
  weekEnd     : Date not null;
  totalHours  : Decimal(6, 2);
  status      : String(20) enum { submitted = 'submitted'; approved = 'approved'; } default 'submitted';
  pdf         : LargeBinary @Core.MediaType: 'application/pdf' @Core.ContentDisposition.Filename: pdfFileName;
  pdfFileName : String(100);
}

/** The statuses of a booking, with the label shown in UIs. */
entity TimeEntryStatuses {
  key code : String(20);
      name : String(40);
}
