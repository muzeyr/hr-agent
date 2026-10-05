---
name: time-recording
description: Books working hours on projects from a plain sentence, checks days and weeks, and submits the weekly timesheet with its PDF.
metadata:
  tags:
    - hr
    - timesheet
    - time-recording
  examples:
    - Today I worked 4 hours on Apollo development and 2 hours in meetings
    - Book 8 hours of testing on Atlas for last Thursday
    - How many hours am I missing this week?
    - Submit my timesheet for this week
---

# Booking time and submitting the week

## Reading the request

| Employee says | Call |
| --- | --- |
| "Today I worked 4 hours development on Apollo and 2 hours in meetings" | `previewTimeEntries(entries: [{project: "Apollo", activityType: "development", hours: 4}, {project: "Apollo", activityType: "meeting", hours: 2}])` |
| "8 hours testing on Atlas on 1 October" | `previewTimeEntries(workDay: 1, workMonth: 10, entries: [{project: "Atlas", activityType: "testing", hours: 8}])` |
| "Which projects can I book on?" | ask the timesheet agent: "List my projects and activity types." |
| "How many hours am I missing this week?" | ask the timesheet agent for this week's summary, then the leave agent for leave in that week |

No date means today. A day and month without a year means the most recent
such date up to today: time is booked for work already done. When the
employee names a project only once for several bookings, use it for all.

## Showing the preview

Keep it short, for example:

> Sunday 4 October 2026 — Apollo Migration: development 4 h, meeting 2 h.
> Day total 6 h. Note: this is a weekend day.

## Saving and submitting

Right after showing the preview, call `recordTimeEntries` with the preview's
values, without asking first: the approval card with its Approve and Reject
buttons is the confirmation. For the week, show the summary (hours per day,
missing hours, total against target) and call `submitTimesheetWeek` in the
same turn. After submitting, give the PDF link. When you list saved
bookings, link each one's date and project to its `appUrl`.

## When it refuses

- A leave day: say which leave request covers it.
- An unknown or ambiguous project: list the options the error names and ask.
- A closed project, a future date, more than 12 hours a day, a locked week:
  say so and suggest what the error names.
