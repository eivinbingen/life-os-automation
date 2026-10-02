# Domain model

## Concepts

| Entity | Meaning |
| --- | --- |
| Area | Stable, flat category of life, without completion status |
| Goal | Outcome belonging to an area |
| Course | Academic subject during a semester; can group projects and standalone tasks |
| Project | Finite body of work, within or outside a course |
| Task | Concrete action, optionally linked to a project, course, or goal |
| WeeklyReview | App-owned recalibration draft or completed snapshot |

The hierarchy is optional: not every task needs a project, and not every project
needs a course. Keep conceptual relationships separate from a source's properties.

## Current Notion-backed behavior

Notion currently owns core records. Source status values and writable fields differ
between entities; inspect the relevant adapter/model and dated schema evidence:
[goals/areas/projects](notion-goals-schema.md) and [courses](notion-courses-schema.md).

Tasks have a Done checkbox, Scheduled/Due, optional project/course context, and no
reliable completion timestamp. Formula-derived task status is not writable.
There is no supported reversible task Drop state; do not equate dropping with
completion or deletion. Name/date/completion and implemented relationship actions
write narrow explicit properties while preserving others.

Direct relations carry IDs for navigation. Formula/rollup context is display-only
and must not be written or treated as a reliable entity identity. Goal-side and
project-side relations may differ: the schema document records dated observations
and unresolved inconsistencies; consult current adapters before modifying links.
Do not apply the future native model to current Notion writes.

## Agreed native model — not implemented

The authoritative detailed design record is
[#60](https://github.com/eivinbingen/life-os-automation/issues/60).
Key rules for understanding that direction:

- A task belongs to at most one project; otherwise it may belong directly to one
  course, or directly to one goal, or stand alone.
- Course → project → task inherits goal/area with no overrides. A project without
  a course may choose one goal. Direct goal/area links are only available when
  no higher parent supplies them; do not store redundant resolved columns.
- Goals, projects, and courses must resolve to an area. Tasks may remain
  uncategorized for low-friction capture; review offers categorization.
- Tasks use done/undone. Goals/projects/courses use planned, active, completed,
  canceled; completing parents does not complete children.
- Scheduled is the next intended workday; Due is an optional whole-item deadline.
  Both are plain dates. Active goals require a target date. Completion timestamps,
  UUID identity, created/updated timestamps and revisions are native requirements.

For linking/unlinking, dates, content, deletion and import edge cases, read the
specific section of #60 rather than duplicating its full decision record here.

## WeeklyReview

The implemented review model stores stable identity, reviewed Monday–Sunday week,
paired Ahead dates, timezone, draft/completed lifecycle, integer revision,
created/updated/completed timestamps, section progress, Wins/reflection and optional
compact saved context with definitions/completeness/capture time.

One record per reviewed week supports resume and idempotent completion. Completed
records are read-only; live entity edits do not rewrite saved context. Current
storage is JSON behind a repository; planned native storage is SQLite. See
[Weekly Review V2](weekly-review-v2.md) for the behavioral and recovery contracts.

No weekly-priority entity, inferred importance model, analytics model or habit
entity is introduced by V2. Current completion statistics use explicitly labeled
schedule-based evidence; future native timestamps do not retroactively prove when
old work was completed.
