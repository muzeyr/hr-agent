using { LeaveService } from '../../srv/leave/leave-service';

// "My Leave Requests" — a read-only Fiori Elements List Report and Object Page
// on LeaveService.MyLeaveRequests: every request the logged-in employee
// filed, by chat or otherwise, with its status, when it was filed and the
// manager's decision. The status text and colour come from the calculated
// elements statusText and statusCriticality in the projection.

// This app is where a request opens when the agent links its number (srv/lib/app-links.ts).
annotate LeaveService.MyLeaveRequests with @hr.app: '/leave-requests/webapp/index.html';

annotate LeaveService.MyLeaveRequests with @(
  UI.HeaderInfo          : {
    TypeName       : 'Leave Request',
    TypeNamePlural : 'Leave Requests',
    Title          : { Value: number },
  },
  UI.SelectionFields     : [status, startDate, createdAt],
  UI.LineItem            : [
    { Value: number,      Label: 'Request' },
    { Value: startDate,   Label: 'First Day' },
    { Value: endDate,     Label: 'Last Day' },
    { Value: workingDays, Label: 'Working Days' },
    { Value: status,      Label: 'Status', Criticality: statusCriticality, CriticalityRepresentation: #WithIcon },
    { Value: createdAt,   Label: 'Requested On' },
    { Value: decidedAt,   Label: 'Decided On' },
    { Value: reason,      Label: 'Reason' },
  ],
  // Newest first, like the agent lists them.
  UI.PresentationVariant : {
    SortOrder      : [{ Property: createdAt, Descending: true }],
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
    { Value: startDate,   Label: 'First Day' },
    { Value: endDate,     Label: 'Last Day' },
    { Value: returnDate,  Label: 'Back at Work' },
    { Value: workingDays, Label: 'Working Days' },
    { Value: reason,      Label: 'Reason' },
    { Value: createdAt,   Label: 'Requested On' },
  ] },
  UI.FieldGroup #decision: { Data: [
    { Value: status,        Label: 'Status', Criticality: statusCriticality },
    { Value: decidedByName, Label: 'Decided By' },
    { Value: decidedAt,     Label: 'Decided On' },
    { Value: decisionNote,  Label: 'Note' },
  ] },
  UI.FieldGroup #form    : { Data: [{ Value: pdf, Label: 'PDF' }] },
);

annotate LeaveService.MyLeaveRequests with {
  ID           @UI.Hidden;
  status       @title: 'Status'      @Common.Text: statusText  @Common.TextArrangement: #TextOnly
               @HTML5.CssDefaults: { width: '13rem' }
               @Common.ValueListWithFixedValues
               @Common.ValueList: {
                 CollectionPath : 'LeaveStatuses',
                 Parameters     : [
                   { $Type: 'Common.ValueListParameterInOut', LocalDataProperty: status, ValueListProperty: 'code' },
                   { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'name' },
                 ],
               };
  startDate    @title: 'First Day';
  // `managed` hides createdAt from filter bars; here it is the point.
  createdAt    @title: 'Requested On' @UI.HiddenFilter: false;
  // Filed by the service, never uploaded: no upload or delete buttons.
  pdf          @title: 'PDF' @Core.Computed;
};

annotate LeaveService.LeaveStatuses with {
  code @title: 'Status' @Common.Text: name @Common.TextArrangement: #TextOnly;
};
