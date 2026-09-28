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
| `Goal` | relation | Project → Goals; writable but **not auto-synced** — see below |
| `Direct Area` | relation | Project → Areas; directly writable |
| `Courses` | relation | Project → Courses; directly writable |
| `Tasks` | relation | Project → Tasks |
| `Resolved Goal` / `Resolved Area` | formula | Read-only inherited context |
| `Open Tasks` / `Scheduled Tasks` / `Progress` / `Project Attention` | formula/rollup | Read-only |

An initial inspection on 2026-09-28 missed the `Goal` and `Direct Area`
relations; a same-day re-inspection against live pages confirmed both
exist. They are **not synced with the goal-side `Projects` relation**:
live project pages show an empty `Goal` relation while `Resolved Goal`
still resolves through the goal's own `Projects` relation. The goal-side
relation is the one actually populated, so it is the authoritative link.

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

## Creation and completion mappings (resolves G1–G6)

| Gate | Answer |
| --- | --- |
| G1 goals active status | `Status = Active` (verified live 2026-09-28) |
| G2 goal↔project relation | Goal-side `Projects` relation is the authoritative link. The project-side `Goal` relation exists and is writable but is **not auto-synced** (live pages show it empty where `Resolved Goal` resolves); writes should go through the goal side. |
| G3 goal creation fields | `Name` (title, required); `Status` defaults to Not Started; optional `Area`, `Target Date`, `Courses`, `Projects` |
| G4 goal completion | `Status = Done` (not "Completed") |
| G5 writable relations on Projects | `Goal`, `Direct Area`, and `Courses` are all directly writable; project forms can prefill a goal, writing the goal-side `Projects` relation. |
| G6 goals description property | None exists. Editable goal set: Name, Status, Area, Target Date. |

Consequence for #49/#45: **Complete Goal = `Status = Done`, status-only,
no cascade.** Projects can be created/edited with a visible goal prefill;
the link is written through the goal-side `Projects` relation, the side
the rest of the app also reads.

## Unverified assumptions

- Status option values verified against live options on 2026-09-28.
- If the schema changes (renamed properties, new status options), re-run
  `scripts/inspect_notion_schema.py` before trusting these slices.

## Inheritance in the app vs in Notion

The `Resolved Goal`, `Resolved Area`, and `Inherited Goal` formula/rollup
properties exist to make the hierarchy work inside Notion; Notion formulas
cannot traverse relations dynamically, so they resolve it eagerly as plain
strings. They are Notion-internal implementation details, **not part of the
domain contract**.

**The standard pattern for the whole hierarchy (Area → Goal → Project →
Task):** every entity reads both its direct relation and the resolved
fallback, preferring the direct side; writes always populate the direct
side.

- **Reads**: prefer the real relation (it carries an ID, so it is
  navigation-ready); fall back to the resolved formula string when the
  relation is empty. Task → goal/area reads the `Project` relation with
  `Resolved Goal`/`Resolved Area`/`Inherited Goal` as display-only
  fallback; Project → goal/area reads the `Goal`/`Direct Area` relations
  with `Resolved Goal`/`Resolved Area` as fallback; Goal → area reads the
  `Area` relation (no higher level, no fallback).
- **Writes**: always write the direct relation — task→`Project`,
  project→`Goal` (plus the goal-side `Projects` relation, since the two
  sides do not auto-sync), goal→`Area`. Records the app touches become
  direct-linked over time, making the fallback increasingly rare.
- **Migration**: any future store only has to provide the relations,
  which is what makes a transition away from Notion cheap. Reading a
  formula is acceptable as a display-only optimization, but navigation
  and logic must rely on real relations (the project detail view reads
  the project-side `Goal` relation, never `Resolved Goal`, for its link).
