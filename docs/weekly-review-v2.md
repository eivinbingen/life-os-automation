# Weekly Review V2: guided recalibration

Status checked on current main, 2026-10-02: guided lifecycle/history (#26),
Look Back (#27), unresolved work (#28), Direction (#30), and Ahead (#9) are
implemented, including metadata hygiene (#29) merged in PR #66. This is
an ongoing product/behavior contract; individual issues own acceptance criteria.

Current storage is JSON and current core records are Notion-backed. The native
SQLite model/storage decisions in [#60](https://github.com/eivinbingen/life-os-automation/issues/60)
are future migration work, not permission to change today's behavior. Read only
the stage or persistence section needed for the assigned issue.

## Purpose and boundaries

Weekly Review helps the user reconsider the week and reset their system through
deliberate decisions. It is a guided recalibration workflow, not an analytics
dashboard or a collection of task database views.

| Surface | Job |
| --- | --- |
| Today | Execute |
| Weekly Review | Recalibrate |
| Studies / Finance | Understand a domain |
| Goals & Projects | Define direction |
| Analytics, later | Understand patterns over time |

V2 surfaces the right information, makes direct actions easy, establishes the
workflow, and stores review history. V3 interprets information, detects patterns
and problems, and suggests actions. Domain dashboards remain separate; the review
can use their existing context without rebuilding them.

## One review experience

Use `/review/weekly` with visible progression:

**Look Back → Clean Up → Direction → Ahead → Commit**

Sections can collapse or advance, and the user can move back without losing work.
Aim for a cockpit checklist with contextual decisions, rather than five pages or
a long required form. Support narrow screens and keyboard navigation. Show loading,
empty, unavailable, partial, pending-save, and retry states distinctly. Never treat
failed retrieval as zero work or a clean system. Save state must be visible.

Implementation defaults for dates: weeks run Monday–Sunday in Europe/Zurich,
matching the current Calendar adapter. Start with the previous completed calendar
week as the reviewed week; Ahead is the immediately following week. Both ranges
are always labeled. The user can select a different reviewed week, including the
current week when reviewing on Sunday, with Ahead paired to the following week.
A resumed draft retains its dates. These are UI/date-contract defaults, not a new
priority or scheduling system. Use half-open date intervals internally so DST and
year boundaries remain correct.

Review context is live unless explicitly saved as history. Reviewing an older
week does not reconstruct the historical task database. Cleanup uses the review
session's current local date for overdue status and labels that as-of date.

## 1. Look Back — what happened?

Give fast orientation: a compact objective activity summary, a small inspectable
completed-work list where evidence supports it, unfinished work, and project
activity where reliably measurable. Count unique task IDs, not repeated appearances.

The user enters **Wins** as free text and may add an optional reflection. Wins do
not need to correspond to tasks. V2 does not infer importance, select important
completed tasks, or generate wins. No weekly priorities are introduced.

The current Task model has a Done checkbox and Scheduled/Due dates, but no
completion timestamp. The current Today query only retrieves relevant incomplete
tasks. Therefore V2 must inspect completion-time evidence before claiming “completed
last week.” If evidence is absent, use an accurately named measure such as “tasks
scheduled that week and now done,” or mark completion-in-week unavailable. Last-edited
time is not completion time. Likewise, name the evidence behind project activity;
do not equate arbitrary project edits with progress. Historical schedule changes
cannot be reconstructed from current fields.

At completion, retain the compact displayed summary with definitions, capture time,
and source completeness. Unknown measures remain unknown. No raw personal task or
calendar payload dump is needed to make the record useful.

## 2. Clean Up — what needs a decision?

Present two clearly separated queues:

- **Unresolved work:** incomplete overdue tasks and tasks scheduled in the reviewed
  week that remain incomplete. One row can explain multiple reasons for inclusion.
- **System hygiene:** the actual Needs Processing predicate and relevant missing
  editable metadata established by schema discovery. Lower prominence; not every
  unassigned or unscheduled task is an error.

Actions happen in context: reschedule, move to backlog, complete, drop where a
verified reversible state exists, and assign supported metadata. Reuse shared
task editors/services; do not make the user navigate database views to decide.

Rescheduling changes Scheduled, never silently Due. Backlog clears Scheduled and
preserves Due, so an overdue task can correctly remain in the queue. Completion
uses the existing Done mapping. Drop must use a verified reversible dropped/cancelled
state; it is not completion or deletion. If that state does not exist, omit Drop
and document the product/schema gap rather than invent a mutation. Metadata controls
write only inspected direct fields, not formulas, rollups, or redundant inherited
values. Valid standalone tasks can remain unassigned.

Writes require explicit save/action, preserve unrelated properties, prevent duplicate
submission, and retain entered edits on failure. Successful writes refresh all
relevant appearances and counts. Continue/Complete is allowed with outstanding items;
neither an empty queue nor an integration outage should force or prevent completion.

## 3. Review Direction — is the direction still right?

Deliberately review every current active goal and its projects using the existing
Notion definition of active. Show useful verified context and do not hide goals
with missing optional relationships. Provide **View Goal**, **Add Project**, and
**Complete Goal**, reusing shared app entity views and narrow domain actions.

End with **“Has anything changed?” / “Is your direction still right?”** and
**Add Goal**, including the empty-goals state. This prompts the user to consider
new opportunities, responsibilities, or goals as well as existing commitments.
Minimal creation/status mappings must be inspected before implementing writes.
Completing a goal must not cascade to its tasks or projects.

No minimum/maximum active-goal rule, missing-project warning, no-next-action rule,
stale-activity warning, health score, or automated suggestion belongs in V2.
Zero active goals is neutral context, not an inferred problem.

## 4. Look Ahead — does the coming week make sense?

Present the next paired week chronologically: upcoming tasks, Scheduled dates,
Due deadlines, and existing Calendar commitments. Distinguish intended work dates
from actual deadlines and preserve all-day/multi-day event meaning. Highlight
objective planning exceptions, such as an upcoming deadline without a scheduled
work date, without judging importance or inventing capacity estimates.

Use shared task rescheduling actions when available. Calendar remains read-only.
Include Studies/course/assessment context only where existing reusable reads and
verified schema support it. Missing Studies context does not block tasks/calendar.
Do not build a full calendar replacement or duplicate Studies/Finance dashboards.

## 5. Commit / Complete — retain the review

Keep Commit minimal: show save state and an explicit **Complete review** action.
The user may finish without Wins/reflection or with unresolved items. Completion
stores a WeeklyReview record; it does not bulk-reschedule tasks, mutate goals,
create weekly priorities, or automatically infer commitments.

App-owned history is a V2 requirement. Introduce a small versioned WeeklyReview
model behind a repository boundary with:

- Stable ID and reviewed-week identity, paired Ahead dates, and timezone.
- Persisted integer revision per record, separate from the store schema version.
- Draft/completed state, created/updated/completed timestamps, and section progress.
- Manual Wins and optional reflection.
- Optional compact saved context from Look Back, with capture time, definitions,
  and completeness status; no claim to full external history.

Use one record per reviewed week for this single local user. Drafts survive page
reload and service restart. Completed records open read-only from a history list;
later source edits cannot rewrite them. Repeated completion must be idempotent.
Starting another week creates its own record. Resetting UI progress never deletes
history or resets external tasks. Editing/deleting completed history is separate
future scope.

Implementation choice for this milestone: an ignored local JSON store, atomic
replacement, and explicit conflict/error handling behind a domain repository
interface, with the concrete contract below. This stores only
app-owned reviews, not competing editable copies of Notion entities. No PostgreSQL,
cloud hosting, authentication, new Notion database, or general sync framework is
needed. Failed/stale writes must not lose earlier saved records or claim success.

### Save conflicts and recovery contract

The store has a `schema_version`; each review has a monotonically increasing
`revision`. Every draft save and first completion supplies the revision last read.
The repository holds a stable store-wide interprocess lock while rereading the
latest file, checking the expected revision and lifecycle, applying the change,
and atomically replacing the file. Lock a separate stable lock file, not the JSON
inode being replaced. This protects both edits to the same review and saves to
different weeks; atomic replacement alone does not prevent lost updates.

A stale save returns a conflict (HTTP 409 at the API boundary) without changing
stored data. The UI retains unsaved text, explains that another save occurred,
and lets the user load the current version and reconcile before explicitly saving
again. Never automatically overwrite or blindly retry with the newer revision.
Successful mutations increment the revision. Completed records reject later edits.
Completion carries a stable operation ID: retrying that same completed operation
returns the existing result without another mutation, even if its original response
was lost; a different stale completion remains a conflict.

Current storage location: `<repository-root>/var/life-os/weekly-reviews.json`,
resolved from the repository root rather than the launch working directory. The
existing `var/` ignore rule covers the store, same-directory temporary files, and
`weekly-reviews.lock`. Each checkout has its own store; do not automatically copy
personal history into worktrees. Documentation changes do not create or copy a
history store.

Manual backup/restore procedure for the current JSON store:

1. Stop all Life OS processes using this checkout. Copy the JSON file to a
   user-chosen private backup location; do not commit it. Record the backup date.
2. To restore, keep the service stopped and preserve any existing file separately
   before replacing it with the backup at the exact path above.
3. Before accepting writes, validate JSON syntax, supported schema version, unique
   week/record IDs, revisions, and lifecycle fields. Invalid/corrupt or unsupported
   data must produce an actionable error and remain untouched, never silently reset
   to an empty history. A missing file is the only normal first-run empty-store case.
4. Restart Life OS, reload open review pages, and verify the expected draft/history
   records. Restore intentionally rolls history back to the selected backup; old
   browser edits must be reconciled rather than automatically resubmitted.

Persistence changes must verify two writers using the same revision (only one
succeeds), writes to different weeks without record loss, duplicate completion
after a lost response,
corrupt/unsupported stores, and backup/restore with synthetic records.

## Implementation references and dependencies

Read the relevant service and tests for the assigned stage:
`src/life_os/services/weekly_reviews.py`, `look_back.py`, `clean_up.py`,
`direction.py`, or `ahead.py`. Shared task actions are in the Notion adapter;
shared goal/project views have their own services. UI and actions live under
`apps/web/app/review/weekly/`. [Architecture](architecture.md) owns layering.

#8 date editing and #15 schema discovery have landed. Use current adapters and
[dated schema evidence](notion-goals-schema.md) instead of repeating old discovery.
#29 implements the separate metadata queue; standalone/unscheduled tasks are not
inherently errors. Reuse the merged hygiene queue during native integration.
Today #19/#20 are not prerequisites for Direction. Existing
Studies/Finance can provide reusable reads, not duplicate domain dashboards.

`/weekly` now redirects to `/review/weekly`; the transitional V1 delivery in PR #25
is historical context. It is not an outstanding prerequisite or an additional
weekly product. [Roadmap](roadmap.md) owns current sequencing; issues #26–30/#9
retain their slice contracts. Do not replay the old planning/parallel-dispatch gates
as requirements for already delivered work.

Use synthetic data/fake integrations for checks of IDs, date/DST boundaries,
partial sources, failed/stale writes, restart, history stability and recovery.
Follow AGENTS.md for applicable backend/frontend checks. Documentation changes
need consistency/link/diff verification only.

## Explicitly deferred to V3 / later

Tracked separately in [#31](https://github.com/eivinbingen/life-os-automation/issues/31),
with no V2 milestone assignment or implementation commitment.

- Health rules: too few/many goals, goals without projects, projects without next
  actions, stale activity, and other interpreted system-health warnings.
- Suggested wins, recommendations, inferred importance, or an importance algorithm.
- Weekly priorities, including linked entities, completion semantics, and Today
  integration. V2 does not introduce even a temporary priority field in Commit.
- Trends, retrospectives/analytics interfaces, cross-domain intelligence, and habits.

Future importance reasoning may consider explicit signals (priority, deadlines,
current goals, weekly priorities later), structural relationships, temporal signals,
and human input. These are research directions, not a scoring specification or V2
acceptance criteria. History provides a foundation without prebuilding intelligence.
