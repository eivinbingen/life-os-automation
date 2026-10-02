# Native migration: source inventory and implementation handoff

Design verification for #60, checked against main `f7c2e18` on 2026-10-02.
The agreed model and stack are recorded in
[#60](https://github.com/eivinbingen/life-os-automation/issues/60). This inventory
defines follow-up work, not a live import or finalized SQL schema.

## Evidence and limits

Reviewed current models, adapters, API wiring, review repository, and the dated
production schema inspections in [tasks](notion-tasks-schema.md),
[goals/areas/projects](notion-goals-schema.md), and [courses](notion-courses-schema.md).
No live credentials or personal review store are present in this isolated checkout;
no new live schema inspection or private-record reconciliation is claimed.
Refresh production schemas and inspect selected raw records in #62 before import.

## Source-to-native gaps

| Source/current behavior | Agreed destination or required follow-up |
| --- | --- |
| Task Name, Done, Scheduled, Due, Project, Course; no direct Goal/Area or completion timestamp | Native optional standalone Goal/Area; completion timestamp on new completions. Import unfinished tasks by default; never infer completion time |
| UI reads often take the first relation ID | Import raw relation arrays/pagination and flag multiple/conflicting parents; first-ID normalization is not proof of valid cardinality |
| Project Goal and goal-side Projects are independently maintained; current writes synchronize both | Reconcile both sides and course links; conflicts require Eivin's decision; native canonical links replace this machinery |
| Formula/rollup goal/area context can be text only | Display evidence is not a native foreign key; derive context through verified source-ID mappings |
| Goals Not Started/Active/Failed/Done; projects Planned/Waiting/Active/Dropped/Done; courses Considering/Active/Dropped/Completed | Native planned/active/completed/canceled. #62 proposes exact mappings and selection for Eivin, especially Waiting/Considering/Failed, rather than guessing |
| Source Area/goal/target-date links can be empty | Goals/courses/projects must resolve to an area; active goals require target dates. Report gaps for user correction/review before import |
| Dates may carry times or range metadata | Native Scheduled/Due are dates. #62 defines reviewed timezone/date conversion without silent shifts or loss; preserve stale dates for review |
| Courses expose an Exam / Final Deadline used by Studies and Ahead | #62/#63 must agree how to retain assessment behavior; do not silently treat this as the course end date or drop it |
| Course Semester/ECTS/Code/material/catalogue fields and Area Type exist in dated evidence but not the new core model | Report unmapped structured fields; review disposition with Eivin in #62. Course-platform URL/goal/area mappings need inspection; do not invent source properties |
| Descriptions/Done means are not fully represented by current normalized models; goals have no such source property | Import agreed structured fields only; omit page bodies and repopulate optional descriptions/Done means after cutover |
| Notion page IDs and reference URLs permeate APIs/UI | Stable native UUIDs plus source-ID mapping. #62 imports mappings; #63 updates navigation/API references rather than requiring a Notion URL |
| JSON WeeklyReview stores dates/timezone, revision/lifecycle, section progress, text, summary, and completion-operation metadata | Future SQLite reviews preserve resume/conflict/idempotency and immutable snapshots. Eivin reports no history; #62/#64 still check for unexpected/new drafts before final import |

## Existing workflows to preserve in #63

Today date navigation, classification, refresh, capture, name/date edits and
completion; shared goal/project views and implemented writes; all five review
stages, including the now-merged #29 hygiene queue; JSON repository behavior when
ported to SQLite; Studies v1 tasks and assessments; Finance/CLI; Calendar reads.

Project create/edit infrastructure already exists while #45 remains open. Reuse it
and verify its full criteria rather than rebuilding it blindly. Contextual capture
in #47 and full course workspace #46 remain separately scoped. Today #19/#20 are
not migration blockers and follow native relationship integration.

## Ownership of remaining implementation details

- **#61:** Eivin's coached Area → Goal → standalone Task foundation; exact columns,
  SQLAlchemy/Alembic setup, representations and constraints, and first transaction/
  revision-check exercise. Discuss unresolved choices with Eivin before implementing.
- **#62:** fresh production schema checks, selected-record inventory, exact status/
  relationship/date mappings, unmapped fields, extraction/pagination, idempotent
  staging import, validation and reconciliation report.
- **#63:** native API/error/revision behavior, inherited-context refresh and dependent
  edits, review timezone/snapshot/deletion-reference semantics, parity and navigation.
- **#64:** final freeze/import/switch checklist, backups and tested restore, off-device
  plan, retention for upgrade/cutover backups, rollback before/after native writes,
  configuration/operational documentation and Eivin's live go/no-go approval.
- **#65:** later hosted/mobile access, authentication and operational design.

No item here authorizes live cutover or settles an outstanding product choice.
#60 can finish as a model/architecture design issue while these bounded issues
retain their implementation gates. #29 is merged; #61 is the next learning slice.
