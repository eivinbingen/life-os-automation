# Life OS Automation

A personal command centre that combines Google Calendar events and Notion tasks in a local Today dashboard. The repository also contains a monthly finance review that compares YNAB spending with a Google Sheets forecast.

See [the product vision](docs/product-vision.md) and [roadmap](docs/roadmap.md) for the broader direction.

## Run the Today dashboard

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

   The Today dashboard uses `NOTION_TOKEN` and `NOTION_TASKS_DATA_SOURCE_ID`. The remaining values in the template support the separate finance review.

3. Place the Google OAuth desktop client file at `calendar_oauth_client.json` in the repository root.

   The first launch opens Google's authorization flow and creates `calendar_token.json` for later runs. Both credential files and `.env` are ignored by Git.

### Start and stop

Start the complete application from the repository root:

```sh
uv run life-os-dev
```

Open [http://localhost:3000](http://localhost:3000). The FastAPI service runs at [http://127.0.0.1:8000](http://127.0.0.1:8000).

Press `Ctrl+C` once to stop both services. The startup command checks required local configuration first and reports how to fix anything missing without displaying secret values.

The dashboard reads events from Google Calendar and tasks from Notion. Marking a task complete updates its `Done` checkbox in Notion. Calendar events and other task fields remain read-only.

## Weekly overview (read-only V1)

Open `/weekly` or choose Weekly Review in the sidebar to browse Monday–Sunday
commitments and tasks. “Overdue before this week” means incomplete tasks due before
that week's Monday; it is not today's complete overdue queue. Counts represent
unique tasks/events, and multi-day events appear on each covered day. If the
backend is unavailable, retry preserves the requested week.

This is a transitional overview. The guided workflow, contextual writes, and saved
history are planned in [Weekly Review V2](docs/weekly-review-v2.md); they are not
implemented by this page.

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
