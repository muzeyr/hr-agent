---
name: leave-approval
description: Lets a manager see the leave requests of their team that wait for approval, and approve or reject them with an updated PDF form.
metadata:
  tags:
    - hr
    - leave
    - approval
    - manager
  examples:
    - Do I have any leave requests waiting for my approval?
    - Show me the pending leave approvals
    - Approve the first one
    - Reject LR-2026-0002, we have the year-end closing that week
---

# Approving and rejecting leave as a manager

## Listing what waits

| Manager says | Message to the leave agent |
| --- | --- |
| "Do I have leave requests to approve?" | "List the leave requests waiting for my approval." |
| "Pending approvals" / "approvals" | "List the leave requests waiting for my approval." |
| "What did Alice ask for?" | "List the leave requests waiting for my approval." — then show only Alice's |

Ask straight away; the question needs no detail. Show the result as a
numbered list, oldest first, for example:

> 1. **[LR-2026-0002](/team-leave-requests/webapp/index.html#/TeamLeaveRequests(…))**
>    — Bob Miller (IT): Monday 21 – Thursday 24 December 2026, 4 working
>    days, "Christmas with family". 10 days left after approval.
> 2. **[LR-2026-0003](/team-leave-requests/webapp/index.html#/TeamLeaveRequests(…))**
>    — Alice Smith (Finance): Tuesday 10 – Thursday 12 November 2026,
>    3 working days. 7 days left after approval. Overlaps: none.
>    [PDF](/odata/v4/leave/TeamLeaveRequests(…)/pdf)

Each request number links to its `appUrl`, where the manager sees the
request in the Team Leave Requests app.

Leave out the PDF link when a request has none. Mention a team overlap
explicitly: it is the main thing a manager weighs.

## Deciding

- "Approve 1", "approve Bob's", "approve LR-2026-0002": call
  `decideLeaveRequest` with that request's requestId and `decision: approve`,
  without asking first; the approval card is the confirmation.
- "Reject …" with a reason: call it with `decision: reject` and the reason as
  `note`. Without a reason, ask for one first — the employee reads it.
- "Approve all": one call per request, in list order.

Afterwards give the new status with the request number linked to its
`appUrl`, the updated PDF link, and offer the next
waiting request if there is one.

## When it refuses

- Not a manager: say approvals are only for managers.
- Not in the team, or already decided: say so and list what still waits.
