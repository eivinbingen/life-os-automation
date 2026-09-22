# Domain Model

## Core Hierarchy

```text
Area → Goal → Project → Task
```

- **Area:** A continuing part of life without a completion date, such as Studies, Finance, or Health.
- **Goal:** A measurable outcome connected to an area.
- **Project:** A finite body of work that contributes to a goal.
- **Task:** A concrete action that may belong to a project.

## Courses

A **Course** represents an academic subject during a specific semester.

Courses can contain:

- Course-related projects.
- Assignments and assessments.
- Study tasks.
- Important dates and resources.

A course belongs to the Studies area but does not replace goals or projects.

## Inheritance

Relationships should provide context automatically:

- A task can inherit its goal and area through its project.
- A project can inherit its area through its goal.
- Direct relationships remain available for items that do not belong to the complete hierarchy.
- Explicit relationships should take precedence when appropriate.

## Scheduling

- **Scheduled:** When I intend to work on a task.
- **Due:** The actual deadline.
- Calendar events represent fixed commitments or time blocks rather than tasks.

## Sources of Truth

Notion is initially the source of truth for Areas, Goals, Projects, Tasks, and Courses. The application normalizes these records into internal models without creating duplicate editable versions.

## Planned WeeklyReview (V2)

A WeeklyReview is an app-owned record of guided recalibration, separate from the
Notion task/project/goal hierarchy. It contains a stable ID, reviewed-week and
following-week dates, timezone, draft/completed state, timestamps, section progress,
manual Wins, and optional reflection. It may retain a compact objective summary
with metric definitions, capture time, and source-completeness status.

One record per reviewed week supports resume and idempotent completion. Completed
records are read-only history; changes to live tasks do not rewrite saved review
content. Persist locally behind a repository interface, without PostgreSQL or a
new Notion database. See [Weekly Review V2](weekly-review-v2.md) for lifecycle, date
semantics, and storage boundaries. This model is planned, not implemented.

No WeeklyPriority entity, importance score, health-rule model, analytics model, or
habit entity is introduced in V2. The current Task model also has no completion
timestamp: weekly completion/activity claims require schema evidence rather than
assuming that Scheduled, Due, or last-edited timestamps prove completion.
