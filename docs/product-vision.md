# Product vision

## Purpose

Life OS is a personal command centre for executing daily work, reviewing direction,
and managing studies and finances. It also provides a practical way for Eivin to
learn full-stack development. The system should reduce administration, make useful
relationships visible, and remain enjoyable to build.

## Experience

- **Today:** calendar commitments, relevant tasks, quick capture and actions,
  with compact active-goal context as the remaining Today slices are delivered.
- **Weekly Review:** Look Back → Clean Up → Direction → Ahead → Complete,
  combining honest evidence, explicit decisions and saved reflection/history.
- **Goals and projects:** shared entity views and contextual organization,
  accessible where encountered rather than requiring a sidebar page per entity.
- **Studies and Finance:** focused domain views; richer coursework follows the
  native backend. Notes/materials remain external.
- **Later:** habits, health, and analytics where actual use justifies them.

## Principles

Clarity over completeness; low-friction capture; one writable owner per domain;
small useful slices; explainable behavior; privacy; reusable domain services;
and explicit learning ownership for exercises Eivin implements.

The user already works without Notion dashboards. The present problem is maintaining
project/goal/course context: capture can collapse into an unstructured to-do list.
Make organization convenient at capture and review, without forcing every task into
a project. This motivates owning core data rather than extending Notion workarounds.

## Data ownership and access

Notion remains authoritative for tasks/projects/goals/areas/courses until deliberate
cutover. The agreed destination is a native SQLite backend, with SQLAlchemy and
Alembic, after the remaining Today/Weekly Review gaps. It supports clear inheritance
and direct task-to-goal links. Migration is selective; Notion becomes an archive.
No permanent bidirectional synchronization is planned.

Google Calendar remains authoritative for events/time blocks, YNAB for budgeting
and transactions, and Sheets for forecasts. Native ownership does not require
replacing those specialist tools.

The app runs locally for one user. Future mobile web access is a desired outcome:
keep the API/storage boundary suitable for hosting, while deferring deployment,
authentication, and associated operations to a separate milestone. PostgreSQL is
an option if future requirements justify it, not a prerequisite for migration.

## Success and exclusions

Success means regular daily use, quick understanding of the day, useful reviews,
less duplicate maintenance, easier contextual organization, and learning through
selected implementation work.

Current work does not include multi-user support, a native mobile app, automatic
financial actions, advanced AI planning, every source-app feature, or importing
all historic data. Weekly Review intelligence and habits are separate future design.

[Roadmap](roadmap.md) owns delivery order. [Architecture](architecture.md) owns
technical boundaries. Detailed acceptance criteria belong in issues; this vision
should not duplicate current status or a full implementation plan.
