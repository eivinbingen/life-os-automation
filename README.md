# Life OS Automation

A personal command centre that combines Google Calendar events and Notion tasks in a local Today dashboard. The repository also contains a monthly finance review that compares YNAB spending with a Google Sheets forecast.

See [the product vision](docs/product-vision.md) and [roadmap](docs/roadmap.md) for the broader direction.

## Run the Today dashboard

### Requirements

- Python 3.13 or newer
- [uv](https://docs.astral.sh/uv/)
- Node.js and npm
- A Notion integration with access to the task data source
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

## Run the monthly finance review

The finance review runs independently from the Today dashboard. It requires a YNAB API token and a Google service account with read access to the forecast spreadsheet.

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

The script checks the YNAB category mapping before calculating results, then prints account balances, actual spending, forecast amounts, and their differences. If categories have changed, review `src/finance/category_mappings.py` before rerunning it.

The `.env` file and all credential files are ignored by Git. Keep them local, and avoid sharing finance review output because it contains personal financial data.
