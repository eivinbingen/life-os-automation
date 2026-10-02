# Notion Courses data source schema

Inspected live on 2026-09-27 via the Life OS integration token
(`GET /v1/data_sources/{id}` on the `Courses` data source). Notion remains
the source of truth; this document records what the read-only Studies
overview (`#10`) normalizes.

## Data source

- Title: `Courses`
- Data source ID: configured via `NOTION_COURSES_DATA_SOURCE_ID` in `.env`

## Properties

| Property | Notion type | Notes |
| --- | --- | --- |
| `Title` | title | Course name; read via `_page_title` (type-scan, name-agnostic) |
| `Status` | status | Options: Considering, **Active**, Dropped, Completed. The overview filters `Status = Active`. |
| `Exam / Final Deadline` | date | Synthesized as an `assessment` schedule item when set |
| `✅ Tasks` | relation | Course → Tasks links; Life OS instead joins via the task-side `Course` relation |
| `Projects` | relation | Course → Projects links; not used by the overview |
| `Semester` | select | e.g. Autumn 2026; not used by the overview yet |
| `ECTS` | number | Not used by the overview |
| `Code` | rich_text | Not used by the overview |
| `Learning Material` | url | Not used by the overview |
| `Course Catalogue` | url | Not used by the overview |

## Related data sources

- `Tasks` (task-side) has a dedicated `Course` relation pointing at the
  courses database. The adapter reads it as `Task.course_id` (optional)
  and joins upcoming tasks to courses by that id — the course-side
  `✅ Tasks` relation is not consulted.
- `Projects` has `Status` (status) and `Courses`/`Tasks` relations;
  Status-filtered Projects reads follow the `fetch_assignable_projects`
  pattern (`docs/notion-tasks-schema.md`).

## Upcoming work assembly

- Tasks: existing `fetch_tasks_for_range` over the tasks data source,
  `today` to `today + 42 days`, joined via `Task.course_id`.
  - `Due` set → kind `deadline` (due = Due)
  - only `Scheduled` set → kind `study_task` (due = Scheduled)
- Assessments: synthesized from the course's `Exam / Final Deadline`.
- Every property access is `.get(...)`-tolerant: missing or renamed
  properties yield `None`, never an error, and never drop the course.

## Unverified assumptions

- `Status = Active` values verified against live options on 2026-09-27.
- If the schema changes (renamed properties, new status options),
  re-inspect before trusting the overview.
