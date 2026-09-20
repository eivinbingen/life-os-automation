# Product Vision

## 1. Purpose

- The purpose of life os is devided between enabling me full-stack developing, and giving me a tool to structure my life.
- It should combine information from many sources to have one source of truth for my life.
- It should help with planning, achieving goals, studies, finances and health
- I already have a system in Notion, but would like a system that can have everything in one place and where the visuals can be nicer.

## 2. Product vision

Life OS is a personal command centre that turns information from different parts of my life into a clear picture of what matters today, how the week is progressing, and whether I am moving toward my larger goals.

## 3. Current solution

- Notion manages Areas, Goals, Projects, Tasks, and Courses.
- Google Calendar contains events and time commitments.
- YNAB tracks budgets and transactions.
- Google Sheets contains long-term financial forecasts.
- Strava and wearable services may later provide health data.
- The existing Python automation produces a monthly financial overview.

Each tool works fairly well individually but no single interface that connects them.

## 4. Problems to Solve

### Fragmented information

- Understanding the day or week requires checking several applications.

### Weak connection between plans and time

- Notion captures tasks and projects, while Calendar captures available time. The current system does not combine them.

### Limited dashboards

- Notion is useful for storing and editing structured information, but its dashboard design and interaction possibilities are constrained.

### Repetitive reviews

- Weekly and monthly reviews require gathering information manually from several sources.

### Maintaining the system

- The Life OS should reduce administrative work, not become another complicated system that requires constant upkeep.

## 5. Target Experience

I want the finished product to make it possible to open the dashboard and immediately understand my day and what needs to be done. Today should combine calendar commitments, tasks, and quick task capture in a lean interface. It should also keep longer-term direction visible through a compact list of active goals, with each goal indicating its open tasks for the selected day.

A weekly overview that eventually makes it possible to both review the previous week and plan the next one in a simple way.

A studies dashboard that structures my studies.

Lastly a finance dashboard showing my spending and monthly budgeting, preferably with some graphics later on.

Future surfaces could cover health, habits, longer-term planning, and personal analytics.

## 7. Product Principles

- **Clarity over completeness:** Show what is useful for the current decision.
- **Low friction:** Capturing and processing information should be fast.
- **One source of truth:** Avoid duplicating editable data between systems.
- **Progressive automation:** Begin read-only and add writes only where they provide clear value.
- **Local-first development:** The first version should work locally without deployment complexity.
- **Explainable behavior:** Recommendations and status indicators should be understandable.
- **Privacy by design:** Personal and financial data should receive conservative handling.
- **Composable architecture:** Integrations and domain logic should be reusable by the web app, automations, CLI, and MCP server.
- **Useful before comprehensive:** Each development slice should improve the working system.

## 8. Source-of-Truth Strategy

| Domain                            | Initial source of truth    |
| --------------------------------- | -------------------------- |
| Tasks, projects, goals, and areas | Notion                     |
| Courses and academic structure    | Notion                     |
| Events and time blocks            | Google Calendar            |
| Budgeting and transactions        | YNAB                       |
| Financial forecasts               | Google Sheets              |
| Workouts                          | Strava or wearable service |

The application will initially read from and combine these systems. It should not silently create competing versions of their data.

## 9. Initial Users and Scope

- Initially designed solely for my personal use.
- Optimized around my existing workflow rather than general productivity use cases.
- No multi-user functionality is required.
- Productization for other users is not an initial objective.
- The architecture should remain clean enough that future expansion is possible.

## 10. First Product Milestone

The first milestone is a local Today dashboard that:

- Retrieves today's events from Google Calendar.
- Retrieves relevant tasks from Notion.
- Presents both in one coherent interface.
- Makes the relationship between commitments, tasks, projects, and goals visible.
- Handles unavailable integrations gracefully.

The dashboard began read-only. It now includes the first selected write action: completing a task updates its `Done` checkbox in Notion. Calendar events and all other task fields remain read-only, and further write actions are added one vertical slice at a time (see the [roadmap](roadmap.md)).

This milestone tests whether a custom interface provides meaningful value before introducing a database or migrating existing workflows.

## 11. Longer-Term Direction

If the initial dashboard proves useful:

1. Add the Weekly Review and Studies experiences.
2. Continue adding carefully selected write actions and quick capture.
3. Expose reusable domain operations through MCP.
4. Add persistence for application-specific information that lacks an appropriate existing home.
5. Consider PostgreSQL when the application needs history, preferences, cached data, or native entities.
6. Potentially migrate selected Notion databases if the custom application becomes a demonstrably better place to manage them.
7. Consider hosting once remote access provides enough value to justify authentication and operational complexity.

## 12. Non-Goals for the Initial Version

- Replacing Notion.
- Migrating all data into PostgreSQL.
- Implementing bidirectional synchronization.
- Building a general-purpose productivity product.
- Supporting multiple users.
- Creating a mobile application.
- Implementing advanced AI planning.
- Automating consequential financial actions.
- Recreating every feature of the source applications.

## 13. Measures of Success

The initial product succeeds if:

- I regularly open it at the beginning of the day.
- It reduces how often I switch between Notion and Google Calendar.
- I can determine my priorities within roughly one minute.
- Weekly reviews require less manual information gathering.
- The system does not require duplicate maintenance.
- New integrations can be added without rewriting the core logic.
- Development remains enjoyable and helps me learn.

## 14. Open Questions

- Which actions should eventually be writable from the dashboard?
- When does PostgreSQL become justified?
- Should the application replace any Notion databases or remain an interface over them?
- How much planning should be rule-based versus AI-assisted?
- What information belongs on the Today dashboard without making it overwhelming?
- Which health data would be useful rather than merely interesting?
- When would hosting become more valuable than local-only operation?
