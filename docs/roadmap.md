# Roadmap

## Completed: Foundation

- Preserved the existing monthly finance review.
- Established integration, domain, service, API, and frontend boundaries.
- Documented the product vision, architecture, and domain model.
- Added tests around existing and newly extracted behavior.

## Completed: Today Dashboard (v1)

The local Today dashboard combines, for the selected day:

- Google Calendar events.
- Scheduled, due, and overdue Notion tasks.
- Project context on tasks (#4).
- Clear integration and error status, including when the backend is unavailable (#5).
- Day navigation (#1).

The complete application starts with one local command (#3). Today v1 also
includes the first selected write action: completing a task updates its
`Done` checkbox in Notion. Calendar events and all other task fields remain
read-only.

## Current: Today Dashboard (v2)

Agreed scope, delivered as separate vertical slices:

- Refresh the selected day's data without reloading the page (#6).
- Capture a new Notion task from Today, with Scheduled defaulting to the
  selected day and an optional Due date (#7).
- Edit a task's name, Scheduled, and Due from Today. Overdue behavior is
  revised so an incomplete task scheduled on the selected day also appears in
  Scheduled while keeping its overdue indicator (#8).

Goal, course, and area context is under discovery in #15. Whether that
context belongs to v2 or a later version is explicitly undecided until that
discovery concludes.

## Following milestones (order not yet decided)

- Weekly Review V2: guided recalibration and saved review history, as specified
  in the [product design](weekly-review-v2.md) and
  [milestone](https://github.com/eivinbingen/life-os-automation/milestone/6).
  Start/resume/complete and history (#26), Look Back (#27), unresolved work (#28),
  metadata hygiene (#29), Review Direction (#30), and Look Ahead (reused #9).
  Documentation is tracked in #32. The unimplemented Weekly Review v1 milestone
  is superseded; it is not a separate delivery prerequisite. Open
  [PR #25](https://github.com/eivinbingen/life-os-automation/pull/25) contains the
  earlier overview implementation; adapt/reuse it for #9, not a separate `/weekly`
  product. It must not close the revised #9 until V2 acceptance criteria are met.
- Studies: active courses and upcoming academic work (#10).
- Finance: the monthly forecast-versus-actual review in the web app (#11).

These are the next agreed milestones after Today v2. Their relative delivery order
remains undecided. Weekly Review V2 planning precedes parallel implementation;
start with #26 and settle shared date/history contracts and #8/#15-dependent
write mappings before assigning independent implementation slices.

## Later direction

- Weekly Review V3/later discovery (#31): health rules, suggestions, inferred
  importance, weekly priorities and Today integration, analytics, and habits.
  These are explicitly excluded from V2 and have no delivery commitment.

- Broader task editing, kept separate from read-only context as described in
  #15.
- MCP over the same domain services.
- PostgreSQL only when broader persistence needs justify it. Weekly Review V2
  history uses a narrow local store and does not authorize PostgreSQL.
- Hosting, once remote access justifies authentication and operational
  complexity.

Detailed requirements belong in their own issues; this section keeps only
direction.

## Current Non-Priorities

- Replacing Notion.
- Bidirectional synchronization.
- Multi-user support.
- Mobile applications.
- Advanced AI planning.
- Migrating all existing data.
