# Architecture

## Overview

Life OS will initially act as a unified interface over the services that already manage different parts of my life.

The system should keep integrations, business logic, and user interfaces separate so that the same functionality can later support a web application, CLI commands, automations, and an MCP server.

## Initial Architecture

```text
External services
    ↓
Integration adapters
    ↓
Domain services
    ↓
FastAPI
    ↓
Next.js application
```

### External Services

The initial sources of truth are:

- **Notion:** Tasks, projects, goals, areas, and courses.
- **Google Calendar:** Events and time blocks.
- **YNAB:** Budgets, accounts, and transactions.
- **Google Sheets:** Financial forecasts.
- **Strava or wearable services:** Possible future health and workout data.

### Integration Adapters

Each external service should have its own adapter responsible for:

- Authentication.
- API requests.
- Pagination and error handling.
- Translating external data into internal models.
- Hiding service-specific details from the rest of the application.

### Domain Services

Domain services combine data and implement Life OS behavior.

Examples include:

- Building the Today overview.
- Identifying relevant, overdue, and scheduled tasks.
- Connecting tasks to projects and goals.
- Preparing weekly and monthly review data.
- Comparing financial forecasts with actual results.

Domain logic should not depend directly on FastAPI, Next.js, MCP, or CLI code.

### API Layer

FastAPI will expose the domain services to the frontend.

The first endpoints may include:

- `GET /today`
- `GET /calendar/events`
- `GET /tasks`
- `GET /health`

The initial API should be read-only.

### Frontend

A Next.js application will provide the user interface.

The first interface will be a local Today dashboard combining:

- Today's calendar events.
- Scheduled and due tasks.
- Overdue tasks.
- Related projects and goals.
- Integration status and errors.

## Suggested Repository Structure

```text
life-os-automation/
├── apps/
│   ├── api/
│   └── web/
├── src/
│   └── life_os/
│       ├── integrations/
│       │   ├── notion/
│       │   ├── google_calendar/
│       │   ├── ynab/
│       │   └── google_sheets/
│       ├── domain/
│       ├── services/
│       └── models/
├── tests/
├── docs/
├── AGENTS.md
└── .env.example
```

The exact structure can evolve after inspecting the existing repository. Existing working finance automation should be preserved rather than reorganized prematurely.

## Data Strategy

No central database is required initially. Data will be retrieved from its authoritative source and normalized into internal models.

PostgreSQL should only be introduced when the application needs capabilities such as:

- Application-specific persistent data.
- Historical snapshots.
- User preferences.
- Cached integration data.
- Reliable synchronization state.
- Native entities that no longer belong in Notion.

## MCP Strategy

MCP should be an additional interface over the same domain services, not a separate implementation.

```text
                 ┌── FastAPI ── Next.js
Domain services ─┼── MCP
                 └── CLI and automations
```

This allows Codex or ChatGPT to use the same tested operations as the web application without duplicating integration logic.

## Security

- Credentials must be stored in environment variables or ignored local credential files.
- Secrets and personal data must never be committed to Git.
- `.env.example` should contain variable names but no real values.
- Logs and tests should avoid exposing financial, calendar, or personal data.
- Write permissions should be added gradually and only where necessary.
- The initial version should use read-only API scopes whenever possible.

## Initial Technical Decisions

- **Frontend:** Next.js with TypeScript.
- **Backend:** FastAPI with Python.
- **Python environment:** `uv`.
- **Initial deployment:** Localhost.
- **Initial access:** Single user.
- **Initial behavior:** Read-only.
- **Database:** None initially.
- **Sources of truth:** Existing external services.

## First Vertical Slice

The first vertical slice is a calendar-aware Today dashboard:

1. Retrieve today's Google Calendar events.
2. Retrieve relevant Notion tasks.
3. Normalize both into internal models.
4. Combine them in a Today domain service.
5. Expose the result through FastAPI.
6. Render it in Next.js.
7. Handle unavailable services without breaking the entire dashboard.

This slice should establish reusable architectural boundaries while delivering something immediately useful.
