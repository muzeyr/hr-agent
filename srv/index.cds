// The services, one folder per domain — the layout of the XTravels sample:
//
//   srv/leave/      LeaveService (base) + LeaveAgent (subagent)
//   srv/timesheet/  TimesheetService (base) + TimesheetAgent (subagent)
//   srv/hr-agent/   HrAgent (root agent)
using from './leave/leave-service';
using from './leave/leave-agent';
using from './timesheet/timesheet-service';
using from './timesheet/timesheet-agent';
using from './hr-agent/service';
