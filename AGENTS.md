# Life OS

## Mission

Build a personal Life OS that integrates Notion, Google Calendar,
YNAB, and Google Sheets behind a better custom interface.

## Current sources of truth

- Notion: Areas, Goals, Projects, Tasks, and Courses
- Google Calendar: events and time blocks
- YNAB: budgets and transactions
- Google Sheets: financial forecasts

## Architecture direction

Use this layering:

integrations/adapters → domain services → CLI/FastAPI/MCP → Next.js

Business logic must not depend directly on FastAPI, MCP, or the UI.

## Current priority

Complete the local, calendar-aware Today dashboard. Add only selected,
reversible write actions that are explicitly included in an approved vertical slice.

## Current constraints

- Preserve the existing monthly finance review.
- Do not add PostgreSQL yet.
- Do not add authentication or cloud hosting yet.
- Never commit credentials or personal API data.
- Keep external systems as the sources of truth.
- Prefer small vertical slices over broad infrastructure work.
- External writes must be explicit, narrow, and reversible where possible.

## Delivery workflow

- Use a GitHub issue to define each planned vertical slice.
- Treat the issue's acceptance criteria and out-of-scope section as the implementation boundary.
- Use an isolated branch or worktree for each slice.
- Open a pull request that links the issue and reports changes, verification, and remaining risks.
- Keep unrelated refactors out of feature pull requests.
- Finish one slice in a working state before expanding its scope.

## Implementation mode

- Default to agent-led implementation of complete, reviewable slices.
- Explain meaningful architectural decisions and point to the important files.
- Let Eivin implement the code when the issue or conversation explicitly identifies a learning exercise.
- Ask for product clarification when ambiguity changes user-visible behavior or external writes.

## Verification

- Test behavior after changes.
- Use fakes or mocks for automated tests of external integrations.
- Never perform live external writes as part of automated verification.
- Run Python tests and Ruff checks for backend changes.
- Run frontend lint and build checks for frontend changes.
- Include any necessary manual verification steps in the pull request.
