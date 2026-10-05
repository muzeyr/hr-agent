---
name: annual-leave
description: Plans an annual leave through the leave agent, files it after approval and returns the PDF form.
metadata:
  tags:
    - hr
    - leave
    - annual-leave
  examples:
    - I'd like to take 3 days of annual leave starting 10 November, can you plan it?
    - I want to take 5 days off next month
    - How many days of annual leave do I have left?
---

# Planning and filing annual leave

## Delegating the plan

Send the leave agent one sentence with the start and the length:

| Employee says | Message to the leave agent |
| --- | --- |
| "3 days of annual leave starting 10 November" | "Plan 3 working days of annual leave starting 10 November." |
| "3 days from 10 November 2027" | "Plan 3 working days of annual leave starting 10 November 2027." |
| "from 6 to 13 November" | "Plan annual leave from 6 to 13 November." |
| "next Friday to Monday" | "Plan annual leave from <Friday's date> to <Monday's date>." |
| "how much leave do I have left" | "What is my leave balance this year?" |

A number of days always means working days. Weekends and public holidays in
between do not use up leave; the plan lists them, so you can say why the end
date is later than it looks.

## Weekends around the leave

The plan says three more things about weekends and holidays:

- **The whole break** (`timeOffFrom` – `timeOffTo`, `calendarDaysOff`). A
  leave from Monday to Friday uses 5 days but gives 9 days off, weekends on
  both sides included. Say so when it is longer than the working days.
- **Adjustments.** A range that starts or ends on a weekend or holiday is
  trimmed to working days: "Friday 6 to Sunday 8 November" is 1 working day,
  Friday. Tell the employee what changed — it is good news, the weekend
  costs nothing.
- **Bridge days.** A working day right before or after the leave that joins
  it to a weekend or holiday. Mention the best one as a tip, e.g. "Taking
  Friday 13 November as well would give you 3 more days off for 1 leave day."
  Plan it only if the employee wants it.

## Showing the plan

Keep it short, for example:

> Tuesday 10 November 2026 – Thursday 12 November 2026, 3 working days. Back
> at work: Friday 13 November 2026. Leave remaining after this request: 7
> days. Tip: taking Friday 13 November as well would add 3 days off — the
> weekend comes with it.

## Filing

Right after showing the plan, call `submitAnnualLeave` with the plan's start
date (day, month, year) and working days, without asking first: the approval
card with its Approve and Reject buttons is the confirmation. Only stop at
the plan when the employee asked just to see one. Afterwards give the request
number, linked to its `appUrl`, and the PDF link, and say the request now
waits for the manager.

## When it refuses

- Start on a weekend or holiday: offer the next working day named.
- Not enough balance: say how many days remain and offer that many.
- Overlap with another request: name that request and ask whether to pick
  other dates or cancel it first.
