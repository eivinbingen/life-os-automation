# Architecture

## Current implementation

Life OS runs locally for one user: a Python/FastAPI backend and a Next.js frontend.
The composition root is [`src/life_os/main.py`](../src/life_os/main.py).

```text
Notion / Calendar / YNAB / Sheets     Local review repository
                ↓                              ↓
        Integration adapters          App-owned review data
                └──────────→ Domain services ←─┘
                                  ↓
                               FastAPI
                                  ↓
                               Next.js
```

Adapters normalize source records, handle pagination/authentication/errors, and
bound external writes. Services own classification, relationships, review behavior,
and finance calculations. API/UI code must not own those rules. CLI or future MCP
interfaces reuse the services rather than duplicating behavior.

| Data | Current owner |
| --- | --- |
| Tasks, projects, goals, areas, courses | Notion |
| Events and time blocks | Google Calendar; read-only in Life OS |
| Budgets/accounts/transactions | YNAB |
| Financial forecasts | Google Sheets |
| Weekly Review drafts/history | Local JSON repository |

## Code map

- `src/life_os/integrations/`: Notion, Calendar, and finance adapters.
- `src/life_os/models/`: normalized records and domain results.
- `src/life_os/services/`: Today, review stages/history, entity views, Studies, Finance.
- `src/life_os/api.py`: transport validation and service/action wiring.
- `apps/web/app/`: web surfaces and server actions.
- `src/finance/monthly_review.py`: preserved finance CLI, sharing calculations.
- `tests/` and frontend tests: synthetic/fake verification; no live mutation tests.

Read the relevant implementation rather than treating a speculative directory tree
or endpoint list as a requirement. Shipped surfaces are summarized in [README](../README.md).

## Current Weekly Review persistence

[`WeeklyReviewRepository`](../src/life_os/services/weekly_reviews.py) stores drafts
and completed snapshots in `<store-root>/var/life-os/weekly-reviews.json`.
`LIFE_OS_STORE_ROOT` optionally overrides the repository-root default. A separate
stable lock protects reread/revision-check/update/atomic replacement. Review revisions
are distinct from the store schema version. Stale updates conflict; corrupt or
unsupported stores are preserved and rejected. Completed snapshots are immutable.

This is app-owned review history, not a second task/goal store. The current timezone
is Europe/Zurich. The exact lifecycle, retry and backup/restore contracts are in
[Weekly Review V2](weekly-review-v2.md#save-conflicts-and-recovery-contract).

## Notion transition

The user already operates without Notion dashboards. Migration is the next planned
milestone after the now-merged Weekly Review hygiene slice. Today #19/#20, another
two-week Notion-free trial, and full Studies v2 are not prerequisites.

The agreed starting stack is SQLite, synchronous SQLAlchemy, and Alembic. Keep
storage behind repository boundaries and separate database models from API models.
Use atomic user-action transactions, per-record revision checks, database constraints,
and domain validation. Live, development, and test stores have separate configurable
ignored paths. These are planned decisions, not shipped database behavior.

[#60](https://github.com/eivinbingen/life-os-automation/issues/60) records the native
relationships, statuses/dates, selective import, safety decisions, and remaining
questions. [The roadmap](roadmap.md#next-native-backend) owns sequencing. The
[source inventory](native-migration-inventory.md) records concrete import gaps.
Eivin writes the foundation in #61 with coaching; it is the next slice. Exact
import and cutover/recovery mechanics belong to #62/#64.

Selectively migrate active/planned direction and unfinished work after reviewing
conflicts/stale records; do not import every completed task or Notion page body.
Notion remains authoritative until a verified final import and explicit cutover;
then stop core reads/writes and retain Notion as an archive. No ongoing bidirectional
sync. Calendar, YNAB, and Sheets retain their roles. Future reviews use SQLite;
Eivin reports no existing personal reviews to migrate, but confirm before cutover.

Backups, restore verification, and a safe rollback procedure precede cutover.
Plan an off-device copy before cutover; local copies alone do not cover device loss.
A failed schema upgrade must preserve data and stop startup, never reset a store.

## Future mobile access

Keep browser operations behind the API and avoid desktop-specific storage/URL
assumptions. Responsive mobile web access is the initial direction to explore in
[#65](https://github.com/eivinbingen/life-os-automation/issues/65). Hosting requires
persistent storage, authentication, HTTPS, and operational recovery planning before
remote exposure. It does not automatically require PostgreSQL or a native mobile app.
Local-only access remains current behavior; deployment is separate future scope.

## Security

Keep credentials in ignored local files/environment variables; `.env.example`
contains names/placeholders only. Use narrow integration capabilities. Do not log
personal source payloads, commit review history, or use live writes in tests.
