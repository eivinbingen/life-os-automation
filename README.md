# Life OS Automation

A local personal command centre with Today, guided Weekly Review, shared goal/project views, Studies, and Finance. Core records currently live in Notion; Calendar supplies events, and Finance compares YNAB spending with a Google Sheets forecast.

See [the documentation index](docs/README.md) for issue-specific references and [roadmap](docs/roadmap.md) for delivery order. Native database migration is planned, not implemented.

## Run Life OS

### Requirements

- Python 3.13 or newer
- [uv](https://docs.astral.sh/uv/)
- Node.js and npm
- A Notion integration with access to the task data source and the **Insert content**
  capability enabled (required for task capture)
- A Google OAuth desktop client with Calendar access

### First-time setup

1. Install the Python and frontend dependencies from the repository root:

   ```sh
   uv sync
   npm --prefix apps/web ci
   ```

2. Copy the environment template and add your Notion values:

   ```sh
   cp .env.example .env
   ```

   Today requires `NOTION_TOKEN` and `NOTION_TASKS_DATA_SOURCE_ID`. For other surfaces, configure the relevant optional values in `.env.example`: goals for Direction/goal actions, projects for project creation/editing, courses for Studies, and YNAB/Sheets for Finance. Give the Notion integration access to the corresponding sources; missing configuration may leave those reads/actions unavailable.

3. Place the Google OAuth desktop client file at `calendar_oauth_client.json` in the repository root.

   The first launch opens Google's authorization flow and creates `calendar_token.json` for later runs. Both credential files and `.env` are ignored by Git.

### Start and stop

Start the complete application from the repository root:

```sh
uv run life-os-dev
```

Open [http://localhost:3000](http://localhost:3000). The FastAPI service runs at [http://127.0.0.1:8000](http://127.0.0.1:8000).

Press `Ctrl+C` once to stop both services. The startup command checks required local configuration first and reports how to fix anything missing without displaying secret values.

Today reads Calendar and Notion, supports refresh/capture, and writes task name, Scheduled, Due, and Done through narrow actions. Shared goal/project views provide implemented contextual actions. Calendar remains read-only. These are current Notion-backed operations, not native SQLite behavior.

## Weekly Review

Open `/review/weekly` or choose Weekly Review in the sidebar. Look Back, Clean Up,
Direction, Ahead and Complete support saved drafts and read-only completed history.
`/weekly` redirects here; it is no longer a separate read-only product.
Metadata hygiene #29 is still a pending slice at this documentation audit.

Look Back labels its evidence: current Notion tasks have no completion timestamp,
so “tasks done” means tasks scheduled in the reviewed week and now done, not proven
completions during that week. Calendar remains read-only. See the
[review contract](docs/weekly-review-v2.md) for date, queue and save semantics.

Reviews currently use ignored `var/life-os/weekly-reviews.json` under the repository
root; `LIFE_OS_STORE_ROOT` can override that root. Each checkout has its own store.
Do not copy personal history into implementation worktrees. Stop all processes
using the store before manual backup/restore; follow the
[recovery procedure](docs/weekly-review-v2.md#save-conflicts-and-recovery-contract).
Planned SQLite storage does not change today's JSON path or recovery procedure.

## Studies

Open `/studies` for active courses and upcoming work. It is a read-only domain
overview, not the deferred full course workspace. Missing optional relationships
must not hide work. [Course schema evidence](docs/notion-courses-schema.md) records
current source fields; native model rules remain planned.

## Monthly finance review (read-only V1)

Open `/finance` or choose Finance in the sidebar to review the current month, and
navigate to earlier or later months. The page shows YNAB account balances and
forecast-versus-actual spending by mapped category; a difference is marked
under, over, or on budget without relying on color alone. If YNAB or Google
Sheets is unavailable, the page reports the failing source instead of partial
values. The review is read-only: budgets, transactions, forecasts, and category
mappings cannot be edited from the app.

## Run the monthly finance review from the terminal

The finance review also runs independently from the Today dashboard. It requires a YNAB API token and a Google service account with read access to the forecast spreadsheet.

1. Add `YNAB_TOKEN` and `GOOGLE_SPREADSHEET_ID` to the repository's `.env` file.

2. Place the Google service account key at `credentials.json` in the repository root. Share the forecast spreadsheet with the service account's email address. The script reads the `Personal forecast` sheet.

3. Run the review for a month using its first day in `YYYY-MM-01` format:

   ```sh
   uv run python src/finance/monthly_review.py 2026-09-01
   ```

   Omit the date to review the current month:

   ```sh
   uv run python src/finance/monthly_review.py
   ```

The script checks the YNAB category mapping before calculating results, then prints account balances, actual spending, forecast amounts, and their differences. If categories have changed, review `src/life_os/category_mappings.py` before rerunning it. The web page reports the same mapping problems if they appear.

The `.env` file and all credential files are ignored by Git. Keep them local, and avoid sharing finance review output because it contains personal financial data.

## Development checks

```sh
uv run --frozen pytest -q
uv run --frozen ruff check .
npm --prefix apps/web test
npm --prefix apps/web run lint
npm --prefix apps/web run build
```

Run the applicable checks for changed code; docs-only changes need consistency,
local-link and diff checks. Follow [AGENTS.md](AGENTS.md) and start each issue in a
[fresh implementation chat](docs/context-workflow.md).
