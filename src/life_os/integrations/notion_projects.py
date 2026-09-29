import requests

from life_os.integrations.notion_common import (
    NOTION_API_URL,
)
from life_os.integrations.notion_common import (
    headers as _headers,
)
from life_os.integrations.notion_tasks import (
    _task_from_page,
)
from life_os.models.notion import UNSET, Task, TaskFetchResult
from life_os.models.project import ProjectCreate, ProjectUpdate


def fetch_project(token: str, project_id: str) -> dict:
    """Fetch one project page raw (name, status, relations) for the service
    layer to normalize. Read-only; raises on failure."""

    return _fetch_page(token, project_id)


def fetch_goal_page(token: str, goal_id: str) -> dict:
    """Fetch one goal page raw (name, status, relations). Read-only;
    raises on failure."""

    return _fetch_page(token, goal_id)


def _fetch_page(token: str, page_id: str) -> dict:
    response = requests.get(
        url=f"{NOTION_API_URL}/pages/{page_id}",
        headers=_headers(token),
    )
    response.raise_for_status()
    return response.json()


def fetch_tasks_for_project(
    token: str, tasks_data_source_id: str, project_id: str, page_size: int
) -> TaskFetchResult:
    """Fetch incomplete tasks whose Project relation contains project_id.

    A narrow read for the project detail view (#44). Reuses the shared task
    parsing; project-name resolution is skipped because every task here
    already belongs to the viewed project.
    """

    body = {
        "filter": {
            "and": [
                {"property": "Done", "checkbox": {"equals": False}},
                {"property": "Project", "relation": {"contains": project_id}},
            ]
        },
        "page_size": page_size,
    }
    tasks: dict[str, Task] = {}
    while True:
        res = requests.post(
            url=f"{NOTION_API_URL}/data_sources/{tasks_data_source_id}/query",
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

    # The tasks all share the viewed project; its name comes from the
    # project page itself, so per-task lookups would be redundant.
    for task in tasks.values():
        task.project_id = project_id

    return TaskFetchResult(tasks=list(tasks.values()), warnings=[])


def _current_goal_id(token: str, project_id: str) -> str | None:
    """Read a project page's current project-side Goal relation id."""

    page = fetch_project(token, project_id)
    goal_prop = page.get("properties", {}).get("Goal", {})
    if goal_prop.get("type") != "relation":
        return None
    relations = goal_prop.get("relation", [])
    return relations[0]["id"] if relations else None


def _goal_projects_ids(token: str, goal_id: str) -> list[str]:
    """Read a goal page's goal-side Projects relation ids."""

    page = fetch_goal_page(token, goal_id)
    projects_prop = page.get("properties", {}).get("Projects", {})
    if projects_prop.get("type") != "relation":
        return []
    return [rel["id"] for rel in projects_prop.get("relation", [])]


def _write_goal_projects(token: str, goal_id: str, project_ids: list[str]) -> None:
    requests.patch(
        url=f"{NOTION_API_URL}/pages/{goal_id}",
        headers=_headers(token),
        json={"properties": {"Projects": {"relation": [{"id": pid} for pid in project_ids]}}},
    ).raise_for_status()


def _link_goal_side(token: str, goal_id: str, project_id: str) -> None:
    """Append project_id to the goal-side `Projects` relation.

    A Notion relation PATCH replaces the whole array, so the current ids
    are read first and the append is a read-modify-write.
    """

    ids = _goal_projects_ids(token, goal_id)
    if project_id in ids:
        return
    _write_goal_projects(token, goal_id, ids + [project_id])


def _unlink_goal_side(token: str, goal_id: str, project_id: str) -> None:
    ids = _goal_projects_ids(token, goal_id)
    if project_id not in ids:
        return
    _write_goal_projects(token, goal_id, [pid for pid in ids if pid != project_id])


def create_project(token: str, data_source_id: str, project: ProjectCreate) -> dict:
    """Create a project page in the configured Notion data source.

    Writes only what creation means to set: the name, and each optional
    field only when provided. Status defaults to Planned in the schema, so
    it is not written unless explicitly requested. A goal link writes both
    sides (per docs/notion-goals-schema.md the project-side `Goal` relation
    is not auto-synced with the goal-side `Projects` relation the app
    reads), so the new project is visible on the goal page too.
    """

    properties: dict = {
        "Name": {"title": [{"text": {"content": project.name}}]},
    }
    if project.status is not None:
        properties["Status"] = {"status": {"name": project.status}}
    if project.goal_id is not None:
        properties["Goal"] = {"relation": [{"id": project.goal_id}]}
    if project.deadline is not None:
        properties["Deadline"] = {"date": {"start": project.deadline.isoformat()}}

    res = requests.post(
        url=f"{NOTION_API_URL}/pages",
        headers=_headers(token),
        json={
            "parent": {"data_source_id": data_source_id, "type": "data_source_id"},
            "properties": properties,
        },
    )
    res.raise_for_status()
    page = res.json()

    if project.goal_id is not None:
        _link_goal_side(token, project.goal_id, page["id"])
    return page


def update_project(token: str, project_id: str, update: ProjectUpdate) -> bool:
    """PATCH a project page with only the deliberately edited properties.

    Fields left as UNSET are omitted entirely, so Notion preserves their
    current values. A status edit never cascades to the project's tasks. A
    goal-link change syncs both sides: the previous goal (read from the
    project page) loses the project from its `Projects` relation and the
    new goal gains it.
    """

    properties: dict = {}
    if update.name is not UNSET:
        # A set name is never None: the API layer rejects null names.
        properties["Name"] = {"title": [{"text": {"content": update.name}}]}
    if update.status is not UNSET:
        # A set status is never None: the API layer rejects an explicit
        # null status, so resetting to Planned must be sent as a value.
        properties["Status"] = {"status": {"name": update.status}}
    if update.goal_id is not UNSET:
        if update.goal_id is None:
            properties["Goal"] = {"relation": []}
        else:
            properties["Goal"] = {"relation": [{"id": update.goal_id}]}
    if update.deadline is not UNSET:
        if update.deadline is None:
            properties["Deadline"] = {"date": None}
        else:
            properties["Deadline"] = {"date": {"start": update.deadline.isoformat()}}

    old_goal_id = None
    if update.goal_id is not UNSET:
        old_goal_id = _current_goal_id(token, project_id)

    res = requests.patch(
        url=f"{NOTION_API_URL}/pages/{project_id}",
        headers=_headers(token),
        json={"properties": properties},
    )
    res.raise_for_status()

    if update.goal_id is not UNSET and old_goal_id != update.goal_id:
        if old_goal_id is not None:
            _unlink_goal_side(token, old_goal_id, project_id)
        if update.goal_id is not None:
            _link_goal_side(token, update.goal_id, project_id)
    return True
