# Life OS working rules

## Context and scope
- Start with the assigned GitHub issue, applicable directory instructions, and relevant code.
- The issue's acceptance criteria and exclusions define the slice. Read supporting document sections only when needed; use [the documentation index](docs/README.md) to find them. Do not load the whole backlog or planning chat.
- Flag conflicting requirements rather than silently choosing between them. Read dependency issues only when their contracts affect the slice.

## Boundaries
- Keep adapters/repositories → domain services → API → UI boundaries; business logic is independent of UI and transport.
- Notion owns core operational data until an explicit cutover. Calendar, YNAB, and Sheets keep their respective roles. No dual writable core store.
- Preserve the independent monthly finance review. External writes must be explicit and issue-scoped.
- Never commit credentials, personal data, exports, databases, or backups. Never perform live external writes in automated verification.
- Database migration, hosting, authentication, or PostgreSQL work needs an issue explicitly authorizing that scope; roadmap direction alone is insufficient.

## Delivery and learning
- Use a fresh implementation chat and isolated branch/worktree per issue. Supply its link rather than the planning transcript.
- Default to agent-led delivery. In designated learning exercises, Eivin writes the code; coach/review without taking over. Ask about unresolved product behavior.
- Keep unrelated refactors out. Open an issue-linked PR describing behavior, verification, and remaining risks.
- Use fake integrations/synthetic data. For backend changes run Python tests and Ruff; for frontend changes run tests, lint, and build. For docs-only changes verify consistency, local links, and the diff.
- For unfinished work, keep a compact handoff: issue/mode, checkout/branch, completed work, essential files, checks, next action, and blockers. See [context workflow](docs/context-workflow.md).
