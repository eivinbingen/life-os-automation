# Roadmap

## Phase 1: Foundation

- Preserve the existing monthly finance review.
- Establish integration, domain, service, API, and frontend boundaries.
- Document the product vision, architecture, and domain model.
- Add tests around existing and newly extracted behavior.

## Phase 2: Today Dashboard

Build a local, read-only dashboard that combines:

- Today's Google Calendar events.
- Scheduled, due, and overdue Notion tasks.
- Related projects and goals.
- Clear integration and error status.

This is the first vertical slice and current priority.

## Phase 3: Weekly Review and Studies

- Build a guided Weekly Review.
- Show unfinished work and tasks requiring processing.
- Add upcoming deadlines and calendar commitments.
- Create a Studies view covering courses, assessments, and academic workload.

## Phase 4: Selected Write Actions

Add carefully chosen actions such as:

- Quick task capture.
- Scheduling a task.
- Completing a task.
- Processing tasks missing context.

Writes should be explicit, reversible where possible, and added only when they reduce meaningful friction.

## Phase 5: MCP and Automation

- Expose existing domain services through MCP.
- Allow trusted AI clients to retrieve Life OS context and perform approved actions.
- Expand weekly and monthly review automation.
- Avoid duplicating logic between MCP, the web application, and scripts.

## Phase 6: Persistence and Hosting

Introduce PostgreSQL only when required for:

- Historical data.
- Preferences.
- Caching.
- Synchronization state.
- Application-native entities.

Consider hosting after the local application proves useful enough to justify authentication, security, and operational complexity.

## Current Non-Priorities

- Replacing Notion.
- Bidirectional synchronization.
- Multi-user support.
- Mobile applications.
- Advanced AI planning.
- Migrating all existing data.
