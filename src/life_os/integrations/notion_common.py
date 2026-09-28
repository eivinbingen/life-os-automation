"""Shared Notion HTTP constants and helpers.

One home for the API URL, version header, and page-title helpers so the
adapters cannot drift at the next Notion version bump.
"""

import requests

NOTION_API_URL = "https://api.notion.com/v1"
NOTION_VERSION = "2026-03-11"


def headers(token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
    }


def page_title(notion_page: dict) -> str | None:
    for prop in notion_page.get("properties", {}).values():
        if prop.get("type") == "title":
            title = "".join(part.get("plain_text", "") for part in prop.get("title", []))
            return title or None
    return None


def fetch_page_title(token: str, page_id: str) -> str | None:
    """GET one page and return its title; raises on failure."""

    response = requests.get(
        url=f"{NOTION_API_URL}/pages/{page_id}",
        headers=headers(token),
    )
    response.raise_for_status()
    return page_title(response.json())
