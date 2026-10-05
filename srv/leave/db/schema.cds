namespace hr;

using { cuid, managed } from '@sap/cds/common';
using { hr.Employees } from '../../../db/schema';

/** Leave requests. One row per request; the generated PDF is stored with it. */
entity LeaveRequests : cuid, managed {
  /** Human-readable request number, e.g. LR-2026-0002. */
  number      : String(20);
  employee    : Association to Employees not null;
  type        : String(20) enum { annual = 'annual'; } default 'annual';
  startDate   : Date not null;
  endDate     : Date not null;
  /** First working day after the leave. */
  returnDate  : Date;
  /** Working days the request consumes; weekends and public holidays excluded. */
  workingDays : Integer not null;
  status      : String(20) enum {
    submitted = 'submitted';
    approved  = 'approved';
    rejected  = 'rejected';
    cancelled = 'cancelled';
  } default 'submitted';
  reason      : String(500);
  /** The manager who approved or rejected the request. */
  decidedBy    : Association to Employees;
  decidedAt    : Timestamp;
  /** The manager's note on the decision; required for a rejection. */
  decisionNote : String(500);
  pdf         : LargeBinary @Core.MediaType: 'application/pdf' @Core.ContentDisposition.Filename: pdfFileName;
  pdfFileName : String(100);
}
