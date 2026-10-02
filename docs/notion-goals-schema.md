# Notion Goals, Areas, and Projects data source schema

Scope: dated Notion adapter/migration evidence, not the future native domain model.
Read this only for relevant Notion reads/writes or import mapping. The native rules
are recorded in [#60](https://github.com/eivinbingen/life-os-automation/issues/60).
No live schema reinspection was performed by the 2026-10-02 documentation audit.

Current code note: `services/projects.py` prefers the project-side Goal relation,
then queries the goal-side Projects relation; formula strings are display-only.
`integrations/notion_projects.py` writes both relation sides and exposes partial
sync failures. Reinspect and reconcile actual mappings during #60/#62; do not invent schema evidence.

Inspected live on 2026-09-28 via the Life OS integration token
(`GET /v1/data_sources/{id}`, plus workspace search to locate the Goals and
Areas data sources). Notion remains the source of truth; this document
records what the goal/project slices (#44, #45, #48, #49, #30) normalize,
and resolves the schema gates from the #15 discovery.

## Data sources

| Data source | Env var | Notes |
| --- | --- | --- |
| `Goals` | `NOTION_GOALS_DATA_SOURCE_ID` | Located via workspace search on 2026-09-28 |
| `Areas` | `NOTION_AREAS_DATA_SOURCE_ID` | Located via workspace search; inspection only |
| `Projects` | `NOTION_PROJECTS_DATA_SOURCE_ID` | Already configured for the app |
| `Tasks` | `NOTION_TASKS_DATA_SOURCE_ID` | Existing Today/Tasks source |

## Goals properties

| Property | Notion type | Notes |
| --- | --- | --- |
| `Name` | title | Goal name; read via `_page_title` (type-scan) |
| `Status` | status | Options: Not Started, **Active**, Failed, Done. Active-goal definition: `Status = Active`. Completion mapping: `Status = Done`. |
| `Area` | relation | Goal → Area; directly writable |
| `Target Date` | date | Directly writable; the closest thing to an "intended outcome" deadline |
| `Projects` | relation | Goal → Projects; writable, separately maintained from project-side Goal |
| `Courses` | relation | Goal → Courses; directly writable |
| `Tasks` | relation | Goal → Tasks; not consulted (Life OS joins via lower-level relations) |
| `Progress` | rollup | Read-only rollup over projects/tasks |

There is **no description / intended-outcome property**. A goal's context is
its Name, Status, Area, Target Date, and related projects.

## Areas properties

| Property | Notion type | Notes |
| --- | --- | --- |
| `Name` | title | Area name |
| `Type` | multi_select | Options: Study, Work, Personal |
| `Goals` | relation | Area → Goals |
| `Projects` | relation | Area → Projects |
| `Task` | relation | Area → Tasks |

## Projects properties (relevant to goals)

| Property | Notion type | Notes |
| --- | --- | --- |
| `Name` | title | Project name |
| `Status` | status | Options: Planned, Waiting, **Active**, Dropped, Done |
| `Deadline` | date | |
| `Goal` | relation | Project → Goals; writable but **not auto-synced** — see below |
| `Direct Area` | relation | Project → Areas; directly writable |
| `Courses` | relation | Project → Courses; directly writable |
| `Tasks` | relation | Project → Tasks |
| `Resolved Goal` / `Resolved Area` | formula | Read-only inherited context |
| `Open Tasks` / `Scheduled Tasks` / `Progress` / `Project Attention` | formula/rollup | Read-only |

The 2026-09-28 reinspection confirmed `Goal` and `Direct Area` after an initial
inspection missed them. Observed project pages had an empty direct Goal while
Resolved Goal still showed goal-side context. The two relation sides are not
auto-synced; current app behavior below handles both.

## Tasks properties (goal-relevant)

`Inherited Goal` (rollup) and `Resolved Goal` / `Resolved Area` (formulas)
are read-only inherited context. The writable `Project` relation is how a
task connects to a goal indirectly. Task-side properties were documented in
PR #40 / the Look Back slice.

## Inheritance and precedence

- The documented hierarchy is Area → Goal → Project → Task. In practice,
  the writable relations are Goal→Area (goal side), Goal→Projects (goal
  side; the project-side `Goal` relation is a separate writable property
  that Notion does not auto-sync), Project→Tasks (task side `Project`
  relation), Task→Course (task side `Course` relation).
- Goal/Area context on tasks and projects is derived by formulas
  (`Resolved Goal`, `Resolved Area`, `Inherited Goal`) — **read-only,
  never written**.
- Missing relations never hide an entity: a project without a resolvable
  goal, or a goal with no projects, stays visible with neutral context.

## Creation and completion mappings

| Operation | Current source contract |
| --- | --- |
| Active goals | `Status = Active` |
| Create goal | Required Name; default Not Started; optional Area/Target Date and supported relations |
| Complete goal | `Status = Done`, status-only; no cascading changes |
| Edit goal | Name, Status, Area, Target Date; no source Description property |
| Link project to goal | Project-side Goal and goal-side Projects are separate relations; current project adapter updates both |
| Project creation | Current adapter requires Name; Planned default; optional Goal, Courses and Deadline |

## Current app relationship behavior

Checked against main during the 2026-10-02 documentation audit, without live schema
reinspection:

- Project detail prefers the project-side `Goal` relation. When empty, it queries
  goals whose `Projects` relation includes the project. Formula text is a final
  display-only fallback, not a navigable ID.
- Goal detail reads the goal-side `Projects` relation. This is not guaranteed to
  match the project-side relation automatically.
- Project creation writes its direct Goal and then links the new project on the
  goal side. If the second write fails, `GoalLinkError` carries the created ID:
  retry must not blindly create another project.
- Project edits update direct fields and synchronize removal/addition on the goal
  side, using previous-goal information for retry handling. This is an external
  multi-call operation, not a database transaction.
- Task Project/Course and goal Area writes use inspected direct relations. Formula
  and rollup values are read-only. Missing relations keep records visible.

Relevant code: `services/projects.py`, `services/goals.py`,
`integrations/notion_projects.py`, and `integrations/notion_goals.py`. For exact
payload/retry behavior, read the relevant adapter and tests.

## Reinspection and native migration

Property/status observations above are dated, not guarantees about future live
schemas. Use `scripts/inspect_notion_schema.py` for read-only reinspection when a
mapping changes or a conflict needs resolution. Reconcile both goal/project link
sides during #60/#62 instead of assuming that either side alone contains every link.

The native inheritance model in #60 differs from current Notion mappings. Import
must flag conflicting links for Eivin's decision, preserving source-ID mapping.
Do not apply native no-override rules to live Notion data before cutover, add more
Notion-only resolved properties, or write formulas as if they were relations.
