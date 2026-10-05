# From XTravels to HR: Building a Multi-Agent Leave Assistant with CAP's September 2026 Release

*The September 2026 CAP release introduced CAP-level agents and the XTravels sample. I took the same structure (a root agent, subagents over A2A, AGENTS.md and skills, human approval for every write) and applied it to a domain no LLM knows by heart: a company's leave rules.*

---

## What the September 2026 release brought

The [September 2026 release of SAP CAP](https://cap.cloud.sap/docs/releases/2026/sep26#new-xtravels-sample) is the one where AI moved into the framework itself. Capire got a new top-level guides section, *Native AI*, and the release introduced **CAP-level agents** (currently Gamma). These are plugins for Node.js and Java that turn a CAP service into an agent with one annotation:

```cds
@agent service TravelAgentService { ... }
```

In the release notes' own words, these agents "run ReAct (Reasoning and Acting) loops within your CAP server and are served via Agent-to-Agent Protocol (A2A)". A built-in chat preview comes with them for local development. The same release made the MCP adapter generally available.

To show how the pieces fit together, the release ships the **[XTravels sample](https://cap.cloud.sap/docs/guides/ai/xtravels-sample)**. It is a travel-booking app where:

- `TravelAgentService` is the **root agent**. It coordinates planning and booking.
- `EventsService` and `HotelsService` are turned into **subagents** with `@agent` and are called over **A2A**.
- `FlightsService` stays a plain service reached over **MCP**.
- The root agent gets an `AGENTS.md` and one `SKILL.md` per subtask, next to its service definition.
- The one action that books something, `createTravel`, is annotated with `@agent.hitl`. The person in the chat approves it before it runs.

Two remarks in the guide stuck with me. The first is about why custom agents exist at all: travel planning is "a well-known domain" that most LLMs already understand, but "for more specialized domains or unique workflows, that would not be the case, but custom agents can fill the gap". The second is about what happens to the UI: the app "reduces to a lightweight application with only simple mostly readonly UIs", while the agents handle the coordination.

So I wanted to know whether the XTravels structure holds up in a domain like that. HR leave fits well. Every company has its own rules: working days, public holidays, balances, overlaps, who approves what. A model cannot guess any of them.

## The application: an HR assistant built the XTravels way

The result is a CAP application (Node.js, TypeScript, `@cap-js/agents`) where an employee writes

> I'd like to take 3 days of annual leave starting 10 November

and the assistant does four things:

- plans the leave around weekends and holidays;
- files the request after the employee clicks Approve;
- generates a PDF form;
- puts the request in front of the manager, who approves or rejects it in the same chat.

A second domain, time recording, uses the same structure. A small Fiori Elements app shows every request with its status.

![HR Agent architecture: HrAgent delegates over A2A to LeaveAgent and TimesheetAgent, which call LeaveService and TimesheetService on SQLite](images/01-architecture.png)
*One root agent, two read-only subagents, and plain CAP services that own the rules.*

### How XTravels maps to HR

Every building block has a counterpart:

- **`TravelAgentService` → `HrAgent`.** This is the root agent, the one the person talks to. It is served at `/a2a/hr-agent` and has a chat preview at `/a2a/hr-agent/preview/`.
- **`EventsService` and `HotelsService` → `LeaveAgent` and `TimesheetAgent`.** One subagent per domain, reached over A2A.
- **The domain services → `LeaveService` and `TimesheetService`.** These are plain CAP services served over OData. They own the rules and the data. As in XTravels, they "have no knowledge about or dependency on each other"; the root agent is where the domains meet.
- **`createTravel` with `@agent.hitl` → five write tools with `@agent.hitl`:** filing leave, cancelling it, deciding as a manager, booking hours and submitting a week.
- **`AGENTS.md` and `skills/` → the same layout,** with a skill for annual leave, one for manager approval and one for time recording.
- **The lightweight, read-only UI → a read-only Fiori Elements app** on the same service the agents use.

The folder structure follows the sample too, one folder per domain:

```text
srv/
 ├── leave/
 │   ├── leave-service.cds      # LeaveService: rules, data, PDFs
 │   ├── leave-agent.cds        # LeaveAgent: read-only subagent
 │   └── leave-agent/AGENTS.md
 ├── timesheet/
 │   ├── timesheet-service.cds  # TimesheetService
 │   ├── timesheet-agent.cds    # TimesheetAgent: read-only subagent
 │   └── timesheet-agent/AGENTS.md
 └── hr-agent/
     ├── service.cds            # HrAgent: root agent, all writes
     ├── AGENTS.md
     └── skills/
         ├── annual-leave/SKILL.md
         ├── leave-approval/SKILL.md
         └── time-recording/SKILL.md
```

## Inside the multi-agent system

### The root agent connects its subagents

The root agent declares its subagents with `@agent.connect`. The plugin turns each one into a single tool. When the first request arrives, the server log shows `Connecting to subagent LeaveAgent (local)`. The XTravels log line for its hotel and event subagents looks the same.

```cds
@agent
@agent.connect: ['LeaveAgent', 'TimesheetAgent']
@requires: 'authenticated-user'
service HrAgent {

  @agent.hitl
  action submitAnnualLeave(
    startDay    : Integer not null @assert.range: [1, 31],
    startMonth  : Integer not null @assert.range: [1, 12],
    startYear   : Integer not null,
    workingDays : Integer not null @assert.range: [1, 30],
    reason      : String(500)
  ) returns LeaveRequest;

  @agent.hitl
  action decideLeaveRequest(
    requestId : UUID not null,
    decision  : String(10) not null enum { approve; reject; },
    note      : String(500)
  ) returns LeaveDecision;
  // … cancelLeaveRequest, recordTimeEntries, deleteTimeEntry, submitTimesheetWeek
}
```

The subagents are agents of their own, with their own `AGENTS.md`. Their functions become their tools:

```cds
@agent
@agent.connect: 'none'
@requires: 'authenticated-user'
service LeaveAgent {
  function getLeaveBalance(year : Integer) returns LeaveBalance;
  function planAnnualLeave(startDay : Integer, startMonth : Integer, startYear : Integer, workingDays : Integer) returns LeaveProposal;
  function planAnnualLeaveBetween(startDay : Integer, startMonth : Integer, startYear : Integer,
                                  endDay : Integer, endMonth : Integer, endYear : Integer) returns LeaveProposal;
  function listMyLeaveRequests(year : Integer) returns many LeaveRequest;
  function listPendingApprovals() returns many PendingApproval;
}
```

The doc comment on each parameter (shortened here) becomes the description the model reads. For example: "Day of the month the leave starts, e.g. 10 for '10 November'".

### Where I deviated from XTravels: subagents only read

In XTravels the subagents can book. Here they cannot, and the reason is practical. An approval requested by `@agent.hitl` *inside a subagent* does not travel back through A2A to the person in the chat. The subagent would wait for a click that never comes.

So the split is strict:

- **Subagents read.** Balances, plans, lists, week summaries.
- **The root agent writes.** Every write tool lives in `HrAgent` and is gated with `@agent.hitl`, so the approval card appears where the person is.

The root agent is also the only place that knows about both domains. It refuses a time booking on a day the employee is on leave before the booking reaches `TimesheetService`, which knows nothing about leave.

### The rules live in the services, not in the prompt

The agents only translate between sentences and service calls. Everything that has to be right lives in plain CAP code with plain unit tests:

- working days;
- public holidays;
- balances;
- overlapping requests;
- who may approve.

Weekends are a good example. They are handled at three levels:

- **Weekends and holidays inside a leave don't count.** "3 days" means working days, and the plan lists every day it skipped.
- **A date range is trimmed.** "Friday to Sunday" becomes one working day, and the plan says so in words. A range with no working day at all is refused: no leave is needed.
- **The whole break and the bridge day.** Each plan reports how long the break really is, with adjacent weekends included (Monday to Friday is 9 days off). It also names the single extra day that would join the leave to a weekend or holiday.

The model never does date arithmetic. It reads `timeOffFrom`, `calendarDaysOff` and `bridgeDays` from the tool result and puts them into a sentence.

### AGENTS.md and skills steer the conversation

The release's advice to "move to a more deterministic behavior" with `AGENTS.md` and skills turned out to matter most for one thing: the approval flow. My first version asked "Shall I file it?" in text and then the plugin asked again. That meant two confirmations, and sometimes the model told people to type a word the plugin treats as a rejection. One paragraph in `AGENTS.md` fixed it:

> Every write tool opens an approval card with an Approve and a Reject button. That card is the employee's confirmation, so do not ask "shall I file it?" in text first, and do not tell them to type an answer: show what you are about to do in one short message and call the tool right after it.

### The user travels with every call

Each request runs as the logged-in user, including calls that go from the root agent to a subagent and from there to a service. The services resolve the employee from `$user`, never from a parameter, so nobody can file or read leave for someone else. In development three mocked users bring the scenario to life:

- **`alice`** (role `Employee`) files leave.
- **`bob`** (role `Employee`) has a seeded request waiting for approval.
- **`carol`** (roles `Employee` and `Manager`) is the manager of both.

## The application in action

The following screenshots come from a live run against a Claude Sonnet model on SAP AI Core, using the plugin's chat preview.

### 1. The employee asks for leave

![The HR agent plans 3 working days from Tuesday 10 November, suggests Friday 13 November as a bridge day, and opens an approval card with Approve and Reject buttons](images/02-plan-and-approval-card.png)
*One sentence in, a plan out: dates, return day, balance after, a bridge-day tip, and the approval card.*

`HrAgent` delegates the planning to `LeaveAgent` over A2A. `LeaveAgent` calls `LeaveService.planLeave`. The plan comes back with exact dates and the bridge day, and the root agent calls `submitAnnualLeave` right away. The `@agent.hitl` card is the only confirmation.

I styled the approval card in this project: the tool and its arguments in one bubble, the decision in its own box. The plugin has no hook for its preview page, so a small custom `srv/server.ts` adds a stylesheet and a short script to the page in development. The plugin's own buttons and handlers are reused, and nothing in `node_modules` changes.

### 2. The request is filed

![After approval the card stays in the conversation marked Approved, and the agent returns the request number LR-2026-0003 and a PDF link](images/03-request-filed.png)
*After Approve: a request number, a PDF, and a record of the decision in the chat.*

`LeaveService` checks the plan again before saving it. A request that became invalid between planning and approval is refused instead of filed.

### 3. A request that ends on a weekend

![The agent counts only Friday 4 December as a working day for a Friday-to-Sunday request and reports 3 days off with the weekend](images/04-weekend-range-trimmed.png)
*Friday to Sunday costs 1 day of leave and gives 3 days off. The service trims the range, and the agent explains it.*

### 4. The manager asks what is waiting

![Carol asks whether any leave requests are waiting and the agent lists Bob's and Alice's requests with dates, reason, balance after approval, team overlaps and a PDF link](images/05-manager-pending-approvals.png)
*The manager's question needs no detail, so the agent asks the leave agent right away.*

Carol logs in as a manager. `LeaveAgent.listPendingApprovals` returns her direct reports' waiting requests. Each one carries the balance the employee would have left and any overlap with other requests in the team.

### 5. Someone who is not a manager asks the same

![Alice, who is not a manager, asks for pending approvals and the agent replies that she is not registered as a manager and should contact HR for manager permissions](images/05b-not-a-manager.png)
*No list, no IDs, no data. The service refused before reading anything.*

The protection is in the service, not in the prompt. `LeaveService` rejects the call before it reads any data:

```ts
const currentManager = async (req: cds.Request): Promise<Employee> => {
  if (!req.user.is("Manager")) return req.reject(403, `Only managers can see or decide leave approvals; "${req.user.id}" is not one.`);
  return currentEmployee(req);
};
```

A UI or another system asking the OData endpoint directly gets the same answer:

```http
GET /odata/v4/leave/getPendingApprovals()
Authorization: Basic alice:

HTTP/1.1 403 Forbidden
{"error":{"message":"Only managers can see or decide leave approvals; \"alice\" is not one.","code":"403"}}
```

The rejection travels unchanged from the service through the subagent to the root agent, and the model explains it in plain words. Even a model that ignored its instructions could not get past it.

### 6. The manager decides

![Carol approves Alice's request through the approval card and the agent confirms LR-2026-0003 is approved with a link to the updated PDF](images/06-manager-approves.png)
*"Approve Alice's request": one approval card, and the decision is saved.*

`decideLeaveRequest` is another `@agent.hitl` tool in the root agent. `LeaveService.decideLeave` applies three checks:

- the caller is a manager;
- the request belongs to one of their direct reports;
- a rejection comes with a note.

It then saves the decision.

### 7. The PDF follows the decision

![The annual leave request form for LR-2026-0003 with employee data, dates, balance and a manager decision section showing Carol White](images/07-approved-pdf.png)
*The form is regenerated on every decision, so it always shows the current status.*

### 8. A lightweight, read-only Fiori app

XTravels expects the app to shrink to "simple mostly readonly UIs", and this is what that looks like here. A Fiori Elements List Report and Object Page sit on `LeaveService.MyLeaveRequests`, the same projection the agents read. The same `@restrict` rule limits it to the logged-in employee:

```cds
@readonly
@restrict: [{ grant: 'READ', where: 'employee.userId = $user' }]
entity MyLeaveRequests as projection on hr.LeaveRequests {
  *,
  case status when 'submitted' then 'Waiting for approval' when 'approved' then 'Approved'
              when 'rejected' then 'Rejected' when 'cancelled' then 'Cancelled' end as statusText : String(40),
  case status when 'submitted' then 2 when 'approved' then 3 when 'rejected' then 1 else 0 end as statusCriticality : Integer,
  decidedBy.firstName || ' ' || decidedBy.lastName as decidedByName : String(160),
};
```

![Fiori List Report "My Leave Requests" with four requests showing Waiting for approval, Rejected and Approved statuses with icons, and requested-on and decided-on timestamps](images/08-fiori-list-report.png)
*Every request, filed by chat or otherwise: newest first, status in colour, when it was requested and decided.*

![Fiori Object Page for LR-2026-0004 showing the leave dates, the rejection by Carol White with the note "Month-end closing that day", and a PDF link](images/09-fiori-object-page.png)
*One request in detail: the leave, who decided and when, the manager's note and the PDF.*

The app has no API of its own. A request filed in the chat appears in the table on the next refresh, because the chat and the app read the same entity.

## What carried over from XTravels, and what I would change

**What carried over unchanged:**

- The root agent and subagent structure.
- `@agent.connect`.
- `AGENTS.md` with one skill per task.
- `@agent.hitl` on every write.
- Independent domain services that only the root agent combines.
- A thin, read-only UI.

The pattern works just as well when the domain is something no model was trained on.

**What I changed:**

1. **Subagents are read-only.** An approval inside a subagent does not reach the person, so every write moved to the root agent.
2. **One confirmation per action.** The approval card is the confirmation, and `AGENTS.md` says so.
3. **The services compute everything worth saying.** Break length, bridge days and trimmed ranges are fields in the tool result, not something the model works out.
4. **Security is in the service.** The prompt explains the rules, but the service enforces them, for the chat and for every other client.

**What is not covered yet:** other leave types, half days, carry-over, notifying employees of a decision, deploying the Fiori app to BTP, and running the domains as separate processes. XTravels already shows the last one with its late-cut microservices.

## Try it yourself

```sh
npm install
npm run db:reset          # SQLite with employees, public holidays 2026–2027, a seeded request
npm run watch             # llm-mock: proves the plumbing, calls no tools
npm run watch:claude      # ANTHROPIC_API_KEY in the shell: real model, mocked users
npm run hybrid            # SAP AI Core via a destination
npm test                  # 51 unit and integration tests
```

Then log in as `alice` or `carol` with an empty password and open:

- the chat at `http://localhost:4004/a2a/hr-agent/preview/`;
- the Fiori app at `http://localhost:4004/leave-requests/webapp/index.html`.

To see the reference this project follows, read the [XTravels sample guide](https://cap.cloud.sap/docs/guides/ai/xtravels-sample) and the [September 2026 release notes](https://cap.cloud.sap/docs/releases/2026/sep26#new-xtravels-sample).

---

*Built with SAP CAP 10, `@cap-js/agents` 0.9 and SAPUI5 Fiori Elements, following the structure of the CAP XTravels sample.*
