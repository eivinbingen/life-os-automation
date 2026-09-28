# Notion Goals, Areas, and Projects data source schema

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
| `Projects` | relation | Goal → Projects; directly writable; the only goal↔project link (see G2 below) |
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
| `Goal` | relation | Project → Goals; synced with the goal-side `Projects` relation |
| `Direct Area` | relation | Project → Areas; directly writable |
| `Courses` | relation | Project → Courses; directly writable |
| `Tasks` | relation | Project → Tasks |
| `Resolved Goal` / `Resolved Area` | formula | Read-only inherited context |
| `Open Tasks` / `Scheduled Tasks` / `Progress` / `Project Attention` | formula/rollup | Read-only |

An initial inspection on 2026-09-28 missed the `Goal` and `Direct Area`
relations; a same-day re-inspection against live pages confirmed both
exist and that goal pages carry populated `Projects` relations. The
goal↔project relation is synced bidirectionally: writing either side
updates both.

## Tasks properties (goal-relevant)

`Inherited Goal` (rollup) and `Resolved Goal` / `Resolved Area` (formulas)
are read-only inherited context. The writable `Project` relation is how a
task connects to a goal indirectly. Task-side properties were documented in
PR #40 / the Look Back slice.

## Inheritance and precedence

- The documented hierarchy is Area → Goal → Project → Task. In practice,
  the writable relations are Goal→Area (goal side), Goal↔Projects (synced
  both sides), Project→Tasks (task side `Project` relation), Task→Course
  (task side `Course` relation).
- Goal/Area context on tasks and projects is derived by formulas
  (`Resolved Goal`, `Resolved Area`, `Inherited Goal`) — **read-only,
  never written**.
- Missing relations never hide an entity: a project without a resolvable
  goal, or a goal with no projects, stays visible with neutral context.

## Creation and completion mappings (resolves G1–G6)

| Gate | Answer |
| --- | --- |
| G1 goals active status | `Status = Active` (verified live 2026-09-28) |
| G2 goal↔project relation | Synced bidirectionally: goal-side `Projects` relation and project-side `Goal` relation (verified against live pages 2026-09-28). Goal-side reads are primary; either side can be written. |
| G3 goal creation fields | `Name` (title, required); `Status` defaults to Not Started; optional `Area`, `Target Date`, `Courses`, `Projects` |
| G4 goal completion | `Status = Done` (not "Completed") |
| G5 writable relations on Projects | `Goal`, `Direct Area`, and `Courses` are all directly writable; project forms can prefill a goal from context. |
| G6 goals description property | None exists. Editable goal set: Name, Status, Area, Target Date. |

Consequence for #49/#45: **Complete Goal = `Status = Done`, status-only,
no cascade.** Projects can be created/edited with a visible goal prefill;
linking a project to a goal via either side syncs both.

## Unverified assumptions

- Status option values verified against live options on 2026-09-28.
- If the schema changes (renamed properties, new status options), re-run
  `scripts/inspect_notion_schema.py` before trusting these slices.
