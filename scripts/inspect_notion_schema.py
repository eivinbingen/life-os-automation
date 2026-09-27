"""Read-only inspection of the configured Notion task data source schema.

Prints property names, types, and page-level metadata availability for
evidence about what the task schema can and cannot support. Performs no
writes; safe to run against the live workspace.

Usage: uv run python scripts/inspect_notion_schema.py
Requires NOTION_TOKEN and NOTION_TASKS_DATA_SOURCE_ID in the environment
or in a .env file at the repository root.
"""

from os import getenv

import requests
from dotenv import load_dotenv

NOTION_API_URL = "https://api.notion.com/v1"
NOTION_VERSION = "2026-03-11"


def main() -> None:
    load_dotenv()
    token = getenv("NOTION_TOKEN")
    data_source_id = getenv("NOTION_TASKS_DATA_SOURCE_ID")
    if not token or not data_source_id:
        print("Missing NOTION_TOKEN or NOTION_TASKS_DATA_SOURCE_ID.")
        return

    response = requests.get(
        url=f"{NOTION_API_URL}/data_sources/{data_source_id}",
        headers={
            "Authorization": f"Bearer {token}",
            "Notion-Version": NOTION_VERSION,
        },
    )
    response.raise_for_status()
    schema = response.json()

    print("Task data source properties (read-only inspection):")
    for name, prop in sorted(schema.get("properties", {}).items()):
        print(f"  {name}: {prop.get('type')}")

    print()
    print("Page-level metadata always available from the Notion API:")
    print("  created_time, last_edited_time, created_by, last_edited_by,")
    print("  archived, in_trash, public_url")
    print()
    print("Evidence for the Look Back slice:")
    print("  - A dedicated completion-timestamp property only exists above if")
    print("    the property list shows one (type date, named e.g. Completed).")
    print("  - last_edited_time is system metadata recording any edit, so it is")
    print("    NOT a completion time and must not be substituted for one.")


if __name__ == "__main__":
    main()
