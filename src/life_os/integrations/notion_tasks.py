from datetime import date, datetime
from os import getenv

import requests
from dotenv import load_dotenv

from life_os.models.notion import Task, TaskFetchResult

NOTION_API_URL = "https://api.notion.com/v1"
NOTION_VERSION = "2026-03-11"


def _headers(token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
    }


def _page_title(notion_page: dict) -> str | None:
    for prop in notion_page.get("properties", {}).values():
        if prop.get("type") == "title":
            title = "".join(part.get("plain_text", "") for part in prop.get("title", []))
            return title or None
    return None


def _fetch_project_name(token: str, project_id: str) -> str | None:
    response = requests.get(
        url=f"{NOTION_API_URL}/pages/{project_id}",
        headers=_headers(token),
    )
    response.raise_for_status()
    return _page_title(response.json())


def create_task(notion_page: dict) -> Task:
    id = notion_page["id"]
    props = notion_page["properties"]
    name = "".join(part["plain_text"] for part in props["Name"]["title"])
    done = props["Done"]["checkbox"]
    scheduled_value = props["Scheduled"]["date"]
    scheduled_str = scheduled_value["start"] if scheduled_value else None
    due_value = props["Due"]["date"]
    due_str = due_value["start"] if due_value else None
    relations = props["Project"]["relation"]
    project_id = relations[0]["id"] if relations else None

    if scheduled_str is None:
        scheduled = None
    elif "T" in scheduled_str:
        scheduled = datetime.fromisoformat(scheduled_str)
    else:
        scheduled = date.fromisoformat(scheduled_str)

    if due_str is None:
        due = None
    elif "T" in due_str:
        due = datetime.fromisoformat(due_str)
    else:
        due = date.fromisoformat(due_str)

    return Task(id=id, name=name, done=done, scheduled=scheduled, due=due, project_id=project_id)


def fetch_tasks_for_day(
    token: str, data_source_id: str, day: date, page_size: int
) -> TaskFetchResult:
    body = {
        "filter": {
            "and": [
                {"property": "Done", "checkbox": {"equals": False}},
                {
                    "or": [
                        {"property": "Scheduled", "date": {"equals": day.isoformat()}},
                        {"property": "Due", "date": {"on_or_before": day.isoformat()}},
                    ]
                },
            ]
        },
        "page_size": page_size,
    }
    tasks = []

    while True:
        res = requests.post(
            url=f"{NOTION_API_URL}/data_sources/{data_source_id}/query",
            headers=_headers(token),
            json=body,
        )

        res.raise_for_status()
        data = res.json()
        for t in data["results"]:
            task = create_task(t)
            tasks.append(task)

        if not data["has_more"]:
            break
        body["start_cursor"] = data["next_cursor"]

    project_names: dict[str, str | None] = {}
    failed_lookups = 0
    for project_id in {task.project_id for task in tasks if task.project_id}:
        try:
            project_names[project_id] = _fetch_project_name(token, project_id)
            if project_names[project_id] is None:
                failed_lookups += 1
        except requests.RequestException:
            project_names[project_id] = None
            failed_lookups += 1

    for task in tasks:
        if task.project_id:
            task.project_name = project_names[task.project_id]

    warnings = []
    if failed_lookups:
        noun = "project" if failed_lookups == 1 else "projects"
        warnings.append(f"Could not load names for {failed_lookups} {noun}.")

    return TaskFetchResult(tasks=tasks, warnings=warnings)


def set_task_done(token: str, task_id: str, done: bool) -> bool:

    body = {"properties": {"Done": {"checkbox": done}}}

    res = requests.patch(
        url=f"{NOTION_API_URL}/pages/{task_id}",
        headers=_headers(token),
        json=body,
    )

    res.raise_for_status()
    return True


if __name__ == "__main__":
    load_dotenv()
    notion_task = {
        "id": "task-page-123",
        "properties": {
            "Name": {"type": "title", "title": [{"plain_text": "Read chapter 4"}]},
            "Done": {"type": "checkbox", "checkbox": False},
            "Scheduled": {
                "type": "date",
                "date": {"start": "2026-09-16T10:00:00+02:00", "end": None, "time_zone": None},
            },
            "Due": {
                "type": "date",
                "date": {"start": "2026-09-18", "end": None, "time_zone": None},
            },
            "Project": {"type": "relation", "relation": [{"id": "project-page-456"}]},
        },
    }

    token = getenv("NOTION_TOKEN")
    data_source_id = getenv("NOTION_TASKS_DATA_SOURCE_ID")
    page_size = 5
