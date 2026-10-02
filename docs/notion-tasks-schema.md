# Notion Tasks data source schema

Task-side properties were first inspected during the Look Back slice
(documented in PR #40) and re-verified against the #15 discovery findings
(`docs/notion-goals-schema.md`, PRs #51/#52). Notion remains the source of
truth; this document records what the Weekly Review hygiene slice (#29)
normalizes, and resolves its schema gates.

## Tasks properties

| Property | Notion type | Notes |
| --- | --- | --- |
| `Name` | title | Task name; directly writable |
| `Done` | checkbox | The only completion evidence — no completion timestamp exists; directly writable |
| `Scheduled` | date | Directly writable; may carry a time component on read |
| `Due` | date | Directly writable |
| `Project` | relation | Task → Projects; single-valued (read as the first related id); directly writable |
| `Course` | relation | Task → Courses; directly writable, optional; read as `Task.course_id` |

Read-only, never written:

| Property | Notion type | Notes |
| --- | --- | --- |
| `Status` | formula | Over `Done`/`Due` (✅ Done, 🟡 Today, 🔴 Overdue, 🟢 Upcoming, —); no reversible dropped/cancelled state exists |
| `When` | formula | Derived display value |
| `Resolved Goal` / `Resolved Area` | formula | Inherited context, display-only fallback |
| `Inherited Goal` | rollup | Inherited context, display-only fallback |

The editable set is therefore **Name, Done, Scheduled, Due, Project,
Course** — and nothing else. There is **no task-side Goal or Area relation**:
goal/area context on tasks is formula-computed (`docs/notion-goals-schema.md`,
"Inheritance in the app vs in Notion").

## "Needs Processing"

**No Needs Processing property exists in the Tasks database** — no writable
flag, no select option, no formula. It is not invented; the predicate is
derived in Life OS from the inspected fields above.

The predicate (slice #29):

> A task needs processing iff it is incomplete (`Done = false`) and has
> **neither a `Scheduled` nor a `Due` date** — it has no time anchor.

- Missing project or schedule **alone is not an error**: a task with a due
  date but no schedule stays out (the Ahead stage's planning exceptions own
  that case), and a task with dates but no project stays out entirely.
- Missing metadata is context for a decision, not a failure. Valid
  standalone tasks can remain unassigned; nothing forces a project, and
  continuing or completing the review never requires clearing the queue.
- The finite missing-metadata set the hygiene controls address is
  **Scheduled, Due, Project** — all directly editable per the table above.

## Unknown vs missing project

The two states are distinct and rendered differently:

- `project_id` set but the name lookup failed → **unknown**: the row keeps
  the id and shows that the project could not be loaded (a partial Notion
  read must not masquerade as absent data).
- `project_id` absent → **missing**: the row neutrally shows "No project".

## Assignable projects

The project picker offers Projects with `Status ∈ {Active, Planned}`. The
full status set (verified live, `docs/notion-goals-schema.md`): Planned,
Waiting, Active, Dropped, Done. Waiting/Dropped/Done projects are not
offered — the picker serves forward-looking planning.

## Write rules

The standard hierarchy pattern applies (Area → Goal → Project → Task):

- **Reads** prefer the direct relation (navigation-ready id) with the
  resolved formulas as display-only fallback.
- **Writes** always go to the direct relation: the task-side `Project`
  relation is written directly (`{"relation": [{"id": …}]}` to set,
  `{"relation": []}` to clear). It is single-valued, so no read-modify-write
  is needed. Notion relation PATCHes replace the whole array.
- Formulas, rollups, and redundant inherited goal/area values are **never
  written**; an explicit null clears the project link like the dates, while
  an omitted key leaves the property untouched.

## Unverified assumptions

- Property names and the status option set verified against live pages via
  #15; if the schema changes, re-run `scripts/inspect_notion_schema.py`
  before trusting this slice.
