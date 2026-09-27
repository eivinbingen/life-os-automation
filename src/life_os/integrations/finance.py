import os
from datetime import date
from pathlib import Path

import requests
from dotenv import load_dotenv
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from life_os.models.finance import ForecastRowMissingError, SheetsError, YnabError

PROJECT_ROOT = Path(__file__).resolve().parents[3]
FINANCE_CREDENTIALS_FILE = PROJECT_ROOT / "credentials.json"

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets.readonly",
]

YNAB_BASE_URL = "https://api.ynab.com/v1"


# --- YNAB ---


def _ynab_get(endpoint: str, token: str) -> dict:
    try:
        response = requests.get(
            f"{YNAB_BASE_URL}/{endpoint}",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10,
        )
        response.raise_for_status()
    except requests.RequestException as error:
        raise YnabError(f"YNAB request failed: {error}") from error
    return response.json()["data"]


def get_plans(token: str) -> list[dict]:
    return _ynab_get("plans", token)["plans"]


def select_plan(plans: list[dict], planname: str | None = None, planid: str | None = None) -> str:
    if not plans:
        raise YnabError("No YNAB plans found")

    if planname is None and planid is None:
        return plans[0]["id"]

    for plan in plans:
        if planname and plan["name"].lower() == planname.lower():
            return plan["id"]
        if planid and plan["id"] == planid:
            return plan["id"]

    raise YnabError(
        f"Found no matching plan for planname: {planname} and planid: {planid}"
    )


def get_accounts(plan_id: str, token: str) -> dict[str, dict]:
    accounts = _ynab_get(f"plans/{plan_id}/accounts", token)["accounts"]

    output: dict[str, dict] = {}
    for account in accounts:
        output[account["id"]] = {
            "name": account["name"],
            "balance": account["balance"] / 1000,
            "type": account["type"],
            "closed": account["closed"],
            "deleted": account["deleted"],
        }
    return output


def get_month_categories(token: str, plan_id: str, month: str) -> dict[str, dict]:
    data = _ynab_get(f"plans/{plan_id}/months/{month}", token)
    all_categories = data["month"]["categories"]

    categories: dict[str, dict] = {}
    for cat in all_categories:
        categories[cat["id"]] = {
            "name": cat["name"],
            "category_group_name": cat["category_group_name"],
            "activity": cat["activity"] / 1000,
            "budgeted": cat["budgeted"] / 1000,
            "balance": cat["balance"] / 1000,
            "deleted": cat["deleted"],
        }
    return categories


# --- Google Sheets ---


def create_sheets_service(credentials_file: Path) -> build:
    credentials = service_account.Credentials.from_service_account_file(
        filename=str(credentials_file),
        scopes=SCOPES,
    )
    return build("sheets", "v4", credentials=credentials)


def get_forecast_rows(service: build, spreadsheet_id: str | None, range_name: str) -> list[list]:
    if not spreadsheet_id:
        raise SheetsError("GOOGLE_SPREADSHEET_ID is not set")
    try:
        result = (
            service.spreadsheets()
            .values()
            .get(spreadsheetId=spreadsheet_id, range=range_name)
            .execute()
        )
    except HttpError as error:
        raise SheetsError(f"Google Sheets request failed: {error}") from error
    return result.get("values", [])


def find_forecast_row(rows: list[list], month_header: str) -> list:
    for row in rows:
        if row and row[0].lower() == month_header.lower():
            return row
    raise ForecastRowMissingError(
        f"The forecast sheet has no row for {month_header}"
    )


# --- Composed fetch for the finance review ---


def fetch_finance_data(month: str) -> tuple[dict, dict, list[list]]:
    """Fetch everything the finance review needs for one month.

    Returns (accounts, categories, sheet_rows). Raises YnabError or
    SheetsError; callers map those to source-specific messages. The token
    and spreadsheet come from the environment.
    """
    load_dotenv()

    token = os.getenv("YNAB_TOKEN")
    if not token:
        raise YnabError("YNAB_TOKEN is not set")

    plans = get_plans(token)
    plan_id = select_plan(plans, planname="Eivin - Personal")
    accounts = get_accounts(plan_id=plan_id, token=token)
    categories = get_month_categories(token, plan_id, month)

    parsed_month = date.fromisoformat(month)
    month_header = f"{parsed_month:%b} {parsed_month:%Y}"

    spreadsheet_id = os.getenv("GOOGLE_SPREADSHEET_ID")
    range_name = "'Personal forecast'!A1:W20"
    service = create_sheets_service(FINANCE_CREDENTIALS_FILE)
    rows = get_forecast_rows(service, spreadsheet_id, range_name)
    find_forecast_row(rows, month_header)

    return accounts, categories, rows
