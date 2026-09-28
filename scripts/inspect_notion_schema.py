"""Read-only inspection of configured Notion data source schemas.

Prints property names, types, status/select option lists, and relation
targets for each configured data source as evidence about what the schemas
can and cannot support. Performs no writes; safe to run against the live
workspace.

Usage: uv run python scripts/inspect_notion_schema.py [NAME ...]
Requires NOTION_TOKEN plus data-source IDs in the environment or in a .env
file at the repository root. Without NAME arguments, inspects every data
source that has an ID configured.
"""

import sys
from os import getenv

import requests
from dotenv import load_dotenv

NOTION_API_URL = "https://api.notion.com/v1"
NOTION_VERSION = "2026-03-11"

# Env var names keyed by a short name; short names can also be passed as
# CLI arguments to inspect a subset.
DATA_SOURCES = {
    "tasks": "NOTION_TASKS_DATA_SOURCE_ID",
    "projects": "NOTION_PROJECTS_DATA_SOURCE_ID",
    "goals": "NOTION_GOALS_DATA_SOURCE_ID",
    "areas": "NOTION_AREAS_DATA_SOURCE_ID",
    "courses": "NOTION_COURSES_DATA_SOURCE_ID",
}


def inspect(token: str, env_var: str) -> None:
    data_source_id = getenv(env_var)
    if not data_source_id:
        print(f"{env_var} is not configured; skipping.\n")
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

    print(f"{env_var} (read-only inspection):")
    for name, prop in sorted(schema.get("properties", {}).items()):
        prop_type = prop.get("type")
        print(f"  {name}: {prop_type}")
        options = prop.get(prop_type, {}).get("options")
        if options:
            names = ", ".join(option.get("name", "") for option in options)
            print(f"    options: {names}")
        if prop_type == "relation":
            print(f"    relation: {prop.get(prop_type, {}).get('data_source_id')}")

    print()
    print("Page-level metadata always available from the Notion API:")
    print("  created_time, last_edited_time, created_by, last_edited_by,")
    print("  archived, in_trash, public_url")
    print()


def main() -> None:
    load_dotenv()
    token = getenv("NOTION_TOKEN")
    if not token:
        print("Missing NOTION_TOKEN.")
        return

    names = [arg.lower() for arg in sys.argv[1:]]
    if names:
        unknown = [name for name in names if name not in DATA_SOURCES]
        if unknown:
            known = ", ".join(sorted(DATA_SOURCES))
            print(f"Unknown data source name(s): {', '.join(unknown)}.")
            print(f"Known names: {known}")
            return
        selected = {name: DATA_SOURCES[name] for name in names}
    else:
        selected = DATA_SOURCES

    for env_var in selected.values():
        inspect(token, env_var)


if __name__ == "__main__":
    main()
