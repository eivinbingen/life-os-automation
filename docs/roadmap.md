# Roadmap

Status checked against current main and GitHub on 2026-10-02. Issues own acceptance
criteria; this page owns direction and sequencing, not a duplicate backlog.

## Delivered foundation

Today combines Calendar events and scheduled/due/overdue Notion tasks, day navigation,
refresh, capture, name/date edits, completion, project context and source status.
Weekly Review has its guided lifecycle/history, Look Back, unresolved-work Clean Up,
Direction and Ahead. Shared goal/project views and goal actions exist. Studies v1
shows active courses/upcoming work; Finance v1 exposes forecast-versus-actual in
the web app while preserving the CLI.

Some project creation/editing infrastructure is already wired on main even though
#45 remains open. Verify the issue's full user-facing acceptance criteria before
calling that slice complete or implementing a duplicate.

## Current gaps

- [#29](https://github.com/eivinbingen/life-os-automation/issues/29): Weekly Review
  metadata hygiene; implementation is in separate PR #66, not yet merged at this audit.
- [#19](https://github.com/eivinbingen/life-os-automation/issues/19): active goals on Today.
- [#20](https://github.com/eivinbingen/life-os-automation/issues/20): selected-day task activity per goal.

Finish these before native migration implementation. Source-schema rules remain
Notion-backed until cutover. Do not assume a closed planning issue proves every
related user-facing feature is delivered.

## Next: native backend

[Milestone 8](https://github.com/eivinbingen/life-os-automation/milestone/8):

1. #60: collaboratively agree native data model, inventory and migration contract.
2. #61: Eivin builds the SQLite/SQLAlchemy/Alembic foundation with coaching.
3. #62: staged selective import and reconciliation.
4. #63: current workflows on native repositories. This and #62 can overlap once
   foundation/contracts are ready; both must pass before cutover.
5. #64: final verified import, backup/recovery and deliberate authority switch.
6. #45: shared project creation/editing against native data.
7. #47: contextual project/course task capture and direct task-goal links.

#65 plans mobile access alongside design and audits the native API after #63;
remote deployment is later. #60 design is in progress, not a completed contract.
The stack and relationship decisions are recorded there; no database implementation
has started in this documentation slice.

The user already operates without Notion dashboards: another two-week trial is not
required. Preserve Calendar/YNAB/Sheets ownership, avoid dual writable core stores,
and keep Notion only as an archive after cutover. Shared organization follows native
storage; full Studies v2 is not a migration prerequisite.

## After migration

- #46 / Studies v2: richer course workspace using the native backend and shared
  actions. Course notes/materials remain outside Life OS.
- #65 follow-ups: authenticated hosted mobile web access when ready, with persistent
  storage/backups. SQLite may remain suitable; PostgreSQL is not automatically required.
- #41: Finance product discovery; no priority over the current core work.
- #31: review intelligence, analytics and habits discovery, with no implementation
  commitment. Habits are not automatically a Weekly Review feature.
- MCP reuses domain services when needed.

No ongoing bidirectional sync, multi-user product, native mobile app, automatic
financial actions or broad historical-data migration is currently planned.
