from datetime import date, datetime
from os import getenv

import requests
from dotenv import load_dotenv

from life_os.models.notion import UNSET, Task, TaskCreate, TaskFetchResult, TaskUpdate

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


def _task_from_page(notion_page: dict) -> Task:
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


def fetch_tasks_for_range(
    token: str, data_source_id: str, start_day: date, end_day: date, page_size: int
) -> TaskFetchResult:
    # OR of two AND branches stays within Notion's two compound-filter levels.
    incomplete = {"property": "Done", "checkbox": {"equals": False}}
    scheduled = [
        {"property": "Scheduled", "date": {"on_or_after": start_day.isoformat()}},
        {"property": "Scheduled", "date": {"on_or_before": end_day.isoformat()}},
    ]
    if start_day == end_day:
        scheduled = [{"property": "Scheduled", "date": {"equals": start_day.isoformat()}}]
    query_filter = {
        "or": [
            {"and": [incomplete, *scheduled]},
            {"and": [incomplete, {"property": "Due", "date": {
                "on_or_before": end_day.isoformat(),
            }}]},
        ],
    }
    body = {"filter": query_filter, "page_size": page_size}
    tasks = {}
    while True:
        res = requests.post(
            url=f"{NOTION_API_URL}/data_sources/{data_source_id}/query",
            headers=_headers(token),
            json=body,
        )
        res.raise_for_status()
        data = res.json()
        for page in data["results"]:
            task = _task_from_page(page)
            tasks.setdefault(task.id, task)
        if not data["has_more"]:
            break
        body["start_cursor"] = data["next_cursor"]
    return _resolve_project_names(token, list(tasks.values()))


def fetch_tasks_for_day(
    token: str, data_source_id: str, day: date, page_size: int
) -> TaskFetchResult:
    return fetch_tasks_for_range(token, data_source_id, day, day, page_size)


def _resolve_project_names(token: str, tasks: list[Task]) -> TaskFetchResult:
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
    return update_task(token, task_id, TaskUpdate(), done=done)


def update_task(token: str, task_id: str, update: TaskUpdate, done: bool | None = None) -> bool:
    """PATCH a task page with only the deliberately edited properties.

    Fields left as UNSET are omitted entirely, so Notion preserves their
    current values — including any time component on a date. Dates are
    written as date-only values per the capture (#7) convention.
    """

    properties: dict = {}
    if done is not None:
        properties["Done"] = {"checkbox": done}
    if update.name is not UNSET:
        # A set name is never None: the API layer rejects null names, and a
        # blank name cannot reach the adapter.
        properties["Name"] = {"title": [{"text": {"content": update.name}}]}
    if update.scheduled is not UNSET:
        if update.scheduled is None:
            properties["Scheduled"] = {"date": None}
        else:
            properties["Scheduled"] = {"date": {"start": update.scheduled.isoformat()}}
    if update.due is not UNSET:
        if update.due is None:
            properties["Due"] = {"date": None}
        else:
            properties["Due"] = {"date": {"start": update.due.isoformat()}}

    body = {"properties": properties}

    res = requests.patch(
        url=f"{NOTION_API_URL}/pages/{task_id}",
        headers=_headers(token),
        json=body,
    )

    res.raise_for_status()
    return True


def create_task(token: str, data_source_id: str, task: TaskCreate) -> Task:
    """Create a task page in the configured Notion data source.

    Writes only what capture means to set: the name, Done unchecked, and
    each date only when provided. Dates are written as date-only values.
    """

    properties: dict = {
        "Name": {"title": [{"text": {"content": task.name}}]},
        "Done": {"checkbox": False},
    }
    if task.scheduled is not None:
        properties["Scheduled"] = {"date": {"start": task.scheduled.isoformat()}}
    if task.due is not None:
        properties["Due"] = {"date": {"start": task.due.isoformat()}}

    res = requests.post(
        url=f"{NOTION_API_URL}/pages",
        headers=_headers(token),
        json={
            "parent": {"data_source_id": data_source_id, "type": "data_source_id"},
            "properties": properties,
        },
    )

    res.raise_for_status()
    return _task_from_page(res.json())


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
