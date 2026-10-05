using { TimesheetService } from '../../srv/timesheet/timesheet-service';

// "My Timesheet" — a read-only Fiori Elements List Report and Object Page on
// TimesheetService.MyTimeEntries: every booking of the logged-in employee,
// made by chat or otherwise, with project, activity, hours and whether its
// week was submitted. Names, status text and colour come from the calculated
// elements in the projection.

// This app is where a booking opens when the agent links it (srv/lib/app-links.ts).
annotate TimesheetService.MyTimeEntries with @hr.app: '/timesheet/webapp/index.html';

annotate TimesheetService.MyTimeEntries with @(
  UI.HeaderInfo          : {
    TypeName       : 'Booking',
    TypeNamePlural : 'Bookings',
    Title          : { Value: projectName },
    Description    : { Value: workDate },
  },
  UI.SelectionFields     : [workDate, project_ID, status],
  UI.LineItem            : [
    { Value: workDate,     Label: 'Date' },
    { Value: projectName,  Label: 'Project' },
    { Value: customer,     Label: 'Customer' },
    { Value: activityName, Label: 'Activity' },
    { Value: hours,        Label: 'Hours' },
    { Value: description,  Label: 'Description' },
    { Value: status,       Label: 'Status', Criticality: statusCriticality, CriticalityRepresentation: #WithIcon },
    { Value: createdAt,    Label: 'Booked On' },
  ],
  // Latest day first; within a day, in the order they were booked.
  UI.PresentationVariant : {
    SortOrder      : [{ Property: workDate, Descending: true }, { Property: createdAt }],
    Visualizations : ['@UI.LineItem'],
  },
  UI.HeaderFacets        : [{ $Type: 'UI.ReferenceFacet', Target: '@UI.DataPoint#hours' }, { $Type: 'UI.ReferenceFacet', Target: '@UI.DataPoint#status' }],
  UI.DataPoint #hours    : { Value: hours, Title: 'Hours' },
  UI.DataPoint #status   : { Value: status, Title: 'Status', Criticality: statusCriticality },
  UI.Facets              : [{ $Type: 'UI.ReferenceFacet', Label: 'Booking', Target: '@UI.FieldGroup#booking' }],
  UI.FieldGroup #booking : { Data: [
    { Value: workDate,     Label: 'Date' },
    { Value: projectName,  Label: 'Project' },
    { Value: customer,     Label: 'Customer' },
    { Value: activityName, Label: 'Activity' },
    { Value: hours,        Label: 'Hours' },
    { Value: description,  Label: 'Description' },
    { Value: status,       Label: 'Status', Criticality: statusCriticality },
    { Value: createdAt,    Label: 'Booked On' },
  ] },
);

annotate TimesheetService.MyTimeEntries with {
  ID         @UI.Hidden;
  workDate   @title: 'Date';
  hours      @title: 'Hours';
  project    @title: 'Project' @Common.Text: projectName @Common.TextArrangement: #TextOnly
             @Common.ValueListWithFixedValues
             @Common.ValueList: {
               CollectionPath : 'Projects',
               Parameters     : [
                 { $Type: 'Common.ValueListParameterInOut', LocalDataProperty: project_ID, ValueListProperty: 'ID' },
                 { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'name' },
               ],
             };
  status     @title: 'Status' @Common.Text: statusText @Common.TextArrangement: #TextOnly
             @Common.ValueListWithFixedValues
             @Common.ValueList: {
               CollectionPath : 'TimeEntryStatuses',
               Parameters     : [
                 { $Type: 'Common.ValueListParameterInOut', LocalDataProperty: status, ValueListProperty: 'code' },
                 { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'name' },
               ],
             };
  createdAt  @title: 'Booked On';
  // Names are short; without widths the grid table spreads them over half the screen.
  projectName  @HTML5.CssDefaults: { width: '11rem' };
  customer     @HTML5.CssDefaults: { width: '8rem' };
  activityName @HTML5.CssDefaults: { width: '9rem' };
  hours        @HTML5.CssDefaults: { width: '5rem' };
};

annotate TimesheetService.Projects with {
  ID @title: 'Project' @Common.Text: name @Common.TextArrangement: #TextOnly;
};
annotate TimesheetService.TimeEntryStatuses with {
  code @title: 'Status' @Common.Text: name @Common.TextArrangement: #TextOnly;
};
