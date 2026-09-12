import requests
import os
from dotenv import load_dotenv
from google.oauth2 import service_account
from googleapiclient.discovery import build
from pathlib import Path
from googleapiclient.errors import HttpError


PROJECT_ROOT = Path(__file__).resolve().parents[2]
CREDENTIALS_FILE = PROJECT_ROOT / "credentials.json"

load_dotenv()

spreadsheet_id = os.getenv("GOOGLE_SPREADSHEET_ID")

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets.readonly",
]

def create_sheets_service(credentials_file: str) -> build:

    credentials = service_account.Credentials.from_service_account_file(
        filename=credentials_file,
        scopes=SCOPES,
    )

    return build(
        "sheets",
        "v4",
        credentials=credentials
    )

range_name="'Personal forecast'!A1:W20"

def get_range_values(service, spreadsheet_id: str, range_name: str) -> list[str]:
    try:
        result = service.spreadsheets().values().get(spreadsheetId=spreadsheet_id, range=range_name).execute()
        rows = result.get("values", [])
        return rows
    except HttpError as e:
        print(f"An error occurred: {e}")
        return e
    
def find_header_row(rows: list[list], header_start: str) -> tuple[int, list]:
    for row_index, row in enumerate(rows):
        if row == []:
            continue
        if row[0].lower() == header_start.lower():
            return (row_index, row)
    raise ValueError(f"Could not find a header row containing {header_start}")

def generate_column_mapping(rows: list[list]) -> dict[str, int]:
    from category_mappings import CATEGORY_MAPPINGS
    other_headers = ["month", "total income"]
    out = {}
    row = find_header_row(rows, "month")
    for header_index, header in enumerate(row[1]):
        if header.lower() in CATEGORY_MAPPINGS.keys() or header.lower() in other_headers:
            out[header] = header_index
    return out

def parse_number(value: str) -> float:
    normalized = (
        value.replace("\xa0", "").replace("kr", "").strip()
    )

    if normalized == "":
        normalized = 0

    return float(normalized)


service = create_sheets_service(CREDENTIALS_FILE)

range_values = get_range_values(service, spreadsheet_id=spreadsheet_id, range_name=range_name)

header_row = find_header_row(range_values, "sep. 2026")

col_mappings = generate_column_mapping(range_values)
print(col_mappings)
