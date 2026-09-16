# Life OS Automation

A personal project for bringing planning and financial information into one place. The repository currently contains a monthly finance review that compares YNAB spending with a Google Sheets forecast. The next milestone is a local, read-only Today dashboard combining Google Calendar events and Notion tasks. See [the product vision](docs/product-vision.md) and [roadmap](docs/roadmap.md) for the broader direction.

## Run the monthly finance review

You need Python 3.13 or newer, [uv](https://docs.astral.sh/uv/), a YNAB API token, and a Google service account with read access to the forecast spreadsheet.

1. Install the Python dependencies from the repository root:

   ```sh
   uv sync
   ```

2. Create a `.env` file in the repository root with these values:

   ```dotenv
   YNAB_TOKEN=your_ynab_api_token
   GOOGLE_SPREADSHEET_ID=your_spreadsheet_id
   ```

3. Place the Google service account key at `credentials.json` in the repository root. Share the forecast spreadsheet with the service account's email address. The script reads the `Personal forecast` sheet.

4. Run the review for a month using its first day in `YYYY-MM-01` format:

   ```sh
   uv run python src/finance/monthly_review.py 2026-09-01
   ```

   Omit the date to review the current month:

   ```sh
   uv run python src/finance/monthly_review.py
   ```

The script checks the YNAB category mapping before calculating results, then prints account balances, actual spending, forecast amounts, and their differences. If categories have changed, review `src/finance/category_mappings.py` before rerunning it.

The `.env` file and `credentials.json` are ignored by Git. Keep them local, and avoid sharing the review output because it contains personal financial data.

## Project direction

Life OS will use existing services as sources of truth: Notion for planning, Google Calendar for commitments, YNAB for budgets and transactions, and Google Sheets for forecasts. The initial dashboard will read from these services without writing back to them. The planned architecture and domain model are described in [docs/architecture.md](docs/architecture.md) and [docs/domain-model.md](docs/domain-model.md).
