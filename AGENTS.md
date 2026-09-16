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

Build a local, read-only, calendar-aware Today dashboard.

## Current constraints

- Preserve the existing monthly finance review.
- Do not add PostgreSQL yet.
- Do not implement writes or bidirectional synchronization yet.
- Do not add authentication or cloud hosting yet.
- Never commit credentials or personal API data.
- Prefer small vertical slices over broad infrastructure work.

## Working style

- Read the relevant files in `docs/` before proposing architectural changes.
- Explain meaningful architectural decisions.
- Help Eivin learn; explain but let him try implementing first. This is a personal project for learning.
- Test existing behavior after changes.
