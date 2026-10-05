using { LeaveService } from '../../srv/leave/leave-service';

// "Team Leave Requests" — a read-only Fiori Elements List Report and Object
// Page on LeaveService.TeamLeaveRequests for managers: the requests of their
// direct reports, waiting ones first. It is where a request opens when the
// agent lists pending approvals and links a request number.

annotate LeaveService.TeamLeaveRequests with @hr.app: '/team-leave-requests/webapp/index.html';

annotate LeaveService.TeamLeaveRequests with @(
  UI.HeaderInfo          : {
    TypeName       : 'Team Leave Request',
    TypeNamePlural : 'Team Leave Requests',
    Title          : { Value: number },
    Description    : { Value: employeeName },
  },
  UI.SelectionFields     : [status, employeeName, startDate],
  UI.LineItem            : [
    { Value: number,       Label: 'Request' },
    { Value: employeeName, Label: 'Employee' },
    { Value: department,   Label: 'Department' },
    { Value: startDate,    Label: 'First Day' },
    { Value: endDate,      Label: 'Last Day' },
    { Value: workingDays,  Label: 'Working Days' },
    { Value: status,       Label: 'Status', Criticality: statusCriticality, CriticalityRepresentation: #WithIcon },
    { Value: createdAt,    Label: 'Requested On' },
    { Value: decidedAt,    Label: 'Decided On' },
  ],
  // Oldest first, the order a manager works through them.
  UI.PresentationVariant : {
    SortOrder      : [{ Property: createdAt }],
    Visualizations : ['@UI.LineItem'],
  },
  UI.HeaderFacets        : [{ $Type: 'UI.ReferenceFacet', Target: '@UI.DataPoint#status' }],
  UI.DataPoint #status   : { Value: status, Title: 'Status', Criticality: statusCriticality },
  UI.Facets              : [
    { $Type: 'UI.ReferenceFacet', Label: 'Leave',    Target: '@UI.FieldGroup#leave' },
    { $Type: 'UI.ReferenceFacet', Label: 'Decision', Target: '@UI.FieldGroup#decision' },
    { $Type: 'UI.ReferenceFacet', Label: 'Form',     Target: '@UI.FieldGroup#form' },
  ],
  UI.FieldGroup #leave   : { Data: [
    { Value: employeeName, Label: 'Employee' },
    { Value: department,   Label: 'Department' },
    { Value: startDate,    Label: 'First Day' },
    { Value: endDate,      Label: 'Last Day' },
    { Value: returnDate,   Label: 'Back at Work' },
    { Value: workingDays,  Label: 'Working Days' },
    { Value: reason,       Label: 'Reason' },
    { Value: createdAt,    Label: 'Requested On' },
  ] },
  UI.FieldGroup #decision: { Data: [
    { Value: status,        Label: 'Status', Criticality: statusCriticality },
    { Value: decidedByName, Label: 'Decided By' },
    { Value: decidedAt,     Label: 'Decided On' },
    { Value: decisionNote,  Label: 'Note' },
  ] },
  UI.FieldGroup #form    : { Data: [{ Value: pdf, Label: 'PDF' }] },
);

annotate LeaveService.TeamLeaveRequests with {
  ID           @UI.Hidden;
  status       @title: 'Status'   @Common.Text: statusText  @Common.TextArrangement: #TextOnly
               @HTML5.CssDefaults: { width: '13rem' }
               @Common.ValueListWithFixedValues
               @Common.ValueList: {
                 CollectionPath : 'LeaveStatuses',
                 Parameters     : [
                   { $Type: 'Common.ValueListParameterInOut', LocalDataProperty: status, ValueListProperty: 'code' },
                   { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'name' },
                 ],
               };
  employeeName @title: 'Employee';
  startDate    @title: 'First Day';
  createdAt    @title: 'Requested On' @UI.HiddenFilter: false;
  pdf          @title: 'PDF' @Core.Computed;
};
