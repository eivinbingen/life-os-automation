# Weekly Review V2: guided recalibration

Status: agreed product scope, planned for implementation. This document does not
describe shipped behavior. Implement one issue-defined vertical slice at a time;
do not start parallel implementation until the shared contracts and dependencies
below are settled.

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
**Complete Goal**, reusing existing destinations and narrow domain actions. A Notion
source link is sufficient for View Goal until an app detail view exists.

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

Planned storage location: `<repository-root>/var/life-os/weekly-reviews.json`,
resolved from the repository root rather than the launch working directory. The
existing `var/` ignore rule covers the store, same-directory temporary files, and
`weekly-reviews.lock`. Each checkout has its own store; do not automatically copy
personal history into worktrees. No history file is created by this documentation PR.

Manual backup/restore procedure for #26:

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

#26 must verify two writers using the same revision (only one succeeds), writes to
different weeks without record loss, duplicate completion after a lost response,
corrupt/unsupported stores, and backup/restore with synthetic records.

## Existing architecture and dependencies

Repository inspected during planning:
[`src/life_os/models/notion.py`](../src/life_os/models/notion.py),
[`src/life_os/integrations/notion_tasks.py`](../src/life_os/integrations/notion_tasks.py),
[`src/life_os/integrations/google_calendar.py`](../src/life_os/integrations/google_calendar.py),
[`src/life_os/services/today.py`](../src/life_os/services/today.py), and
[`src/life_os/api.py`](../src/life_os/api.py). The current implementation supports task capture
and Done writes; name/date editing remains in #8. There are no goal/course adapters
or WeeklyReview persistence yet. Do not mistake documented hierarchy for verified
Notion schema or implemented behavior.

- Preserve adapters → domain services → FastAPI → Next.js. Domain logic and review
  persistence do not depend on UI or API types.
- #8 owns shared task date-editing rules, including its unresolved date-time policy.
  Reuse it for cleanup/Ahead rather than implementing a conflicting editor.
- #15 owns relationship/schema discovery. Reuse and extend its evidence for Needs
  Processing, editable metadata, and goal/project creation/status mappings; do not
  duplicate discovery or assume formulas are writable.
- #19 active-goal reads can be reused when available. Its Today UI and #20 selected-day
  goal counts are not prerequisites for Review Direction.
- #10 remains Studies v1 and #11 remains Finance v1. This plan does not expand or
  reorder their milestones, and preserves the working monthly finance review.
- External-write mappings that remain ambiguous are implementation gates. Inspect
  schema read-only first; seek product clarification only for choices evidence
  cannot settle. This planning session performs no live Notion/Calendar writes.

## Incremental delivery and verification

The milestone consists of complete user-visible slices, each spanning whatever
model, adapter, service, API, and UI work its outcome requires. Start with a usable
manual guided review and history, then add context and decisions to it. GitHub
issues carry the detailed acceptance criteria, exclusions, and verification.

Milestone: [Weekly Review V2](https://github.com/eivinbingen/life-os-automation/milestone/6).
Planning documentation: [#32](https://github.com/eivinbingen/life-os-automation/issues/32).

| Issue | User-visible increment | Dependencies |
| --- | --- | --- |
| [#26](https://github.com/eivinbingen/life-os-automation/issues/26) | Start, resume, and complete a guided Weekly Review with saved history | First slice |
| [#27](https://github.com/eivinbingen/life-os-automation/issues/27) | Look back on the week with honest activity context and manual wins | #26; verify activity evidence |
| [#28](https://github.com/eivinbingen/life-os-automation/issues/28) | Resolve unfinished work directly from Weekly Review | #26, #8 |
| [#29](https://github.com/eivinbingen/life-os-automation/issues/29) | Process task metadata in a separate Weekly Review cleanup queue | #26, #28, #15 schema |
| [#30](https://github.com/eivinbingen/life-os-automation/issues/30) | Review active goals and act on direction during Weekly Review | #26, #15 schema; reuse #19 reads if available |
| [#9](https://github.com/eivinbingen/life-os-automation/issues/9) (updated) | Look ahead chronologically within the guided Weekly Review | #26; #8 for rescheduling; #10/#15 optional Studies context |

Existing #9 is repurposed for Ahead and moved out of Weekly Review v1. The old
milestone is explicitly superseded, not reported as implemented. No duplicate
read-only weekly dashboard is planned.

[PR #25](https://github.com/eivinbingen/life-os-automation/pull/25) is open and
contains work for the former #9 scope, not shipped functionality. Its range
adapters, week models/service, and tests are reuse candidates for Ahead after
review against the V2 date and failure contracts. Its standalone `/weekly` UI and
week-start overdue semantics do not fulfill the new workflow. Before delivering
#9, adapt that PR or carry its useful changes into a replacement that fulfills
#9; do not merge the old scope as-is or let its `Closes #9` imply V2 completion.
PR #25 remains open for that implementation disposition; this documentation PR
neither closes nor merges it.

#8, #10, #15, #19, and #20 retain their own
scope/milestones; dependencies do not silently expand those issues.

Before parallel implementation, land the shared workflow/date/history contract,
resolve #8/#15-dependent mappings, and agree ownership of shared adapters/editors.
This document authorizes planning, not dispatch of implementation agents.

Use fake integrations and synthetic records for automated checks; never perform
live external writes in automated verification. Feature slices must test behavior
including duplicate IDs, week/DST boundaries, partial data, failed writes, restart,
and history stability as relevant. Follow AGENTS.md Python/Ruff and frontend
test/lint/build requirements for changed code. Manually inspect desktop, narrow
screens, and keyboard flows. Documentation-only changes need consistency/link and
diff checks, not an application test run.

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
