import requests
import os
from dotenv import load_dotenv
from google.oauth2 import service_account
from googleapiclient.discovery import build
from pathlib import Path


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

service = create_sheets_service(CREDENTIALS_FILE)

spreadsheet = service.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()
print(spreadsheet)