namespace hr;

// Master data shared by the HR domains (leave, timesheet). Each domain keeps
// its own transactional model next to its service, in srv/<domain>/db/.

/**
 * Employees. `userId` links an employee to the login user, so every request
 * is resolved to the person asking — no tool ever asks for a personnel number.
 */
entity Employees {
  key ID                     : String(10);
      userId                 : String(100) not null;
      firstName              : String(80);
      lastName               : String(80);
      email                  : String(256);
      department             : String(80);
      manager                : Association to Employees;
      /** Annual leave entitlement in working days per calendar year. */
      annualLeaveEntitlement : Integer default 14;
      /** Contractual working hours per day, used for timesheet targets. */
      dailyHours             : Decimal(4, 2) default 8;
      hireDate               : Date;
}

/** Public holidays: no leave is consumed and no work is expected on them. */
entity PublicHolidays {
  key date : Date;
      name : String(100);
}

/** The statuses of a leave request, with the label shown in UIs. */
entity LeaveStatuses {
  key code : String(20);
      name : String(40);
}

