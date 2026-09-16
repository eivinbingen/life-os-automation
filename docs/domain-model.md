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
