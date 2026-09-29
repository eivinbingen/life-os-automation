import requests

from life_os.integrations.notion_common import (
    NOTION_API_URL,
    fetch_page_title,
)
from life_os.integrations.notion_common import (
    headers as _headers,
)
from life_os.integrations.notion_common import (
    page_title as _page_title,
)
from life_os.models.goal import GoalCreate, GoalUpdate, ProjectRef
from life_os.models.notion import UNSET, Task


def fetch_active_goals(token: str, data_source_id: str, page_size: int) -> list[Task]:
    """Fetch goals with the Notion-defined Active status (read-only).

    Returns lightweight Task-shaped entries (id + name) for the Review
    Direction stage. Bounded by page_size pagination.
    """

    goals: dict[str, Task] = {}
    body = {
        "filter": {"property": "Status", "status": {"equals": "Active"}},
        "page_size": page_size,
    }
    while True:
        res = requests.post(
            url=f"{NOTION_API_URL}/data_sources/{data_source_id}/query",
            headers=_headers(token),
            json=body,
        )
        res.raise_for_status()
        data = res.json()
        for page in data["results"]:
            goal = Task(id=page["id"], name=_page_title(page) or "")
            goals.setdefault(goal.id, goal)
        if not data["has_more"]:
            break
        body["start_cursor"] = data["next_cursor"]
    return list(goals.values())


def fetch_goal(token: str, goal_id: str) -> dict:
    """Fetch one goal page raw (name, status, relations) for the service
    layer to normalize. Read-only; raises on failure."""

    response = requests.get(
        url=f"{NOTION_API_URL}/pages/{goal_id}",
        headers=_headers(token),
    )
    response.raise_for_status()
    return response.json()


def fetch_projects_by_ids(
    token: str, project_ids: list[str]
) -> tuple[list[ProjectRef], list[str]]:
    """Resolve linked-project names from the goal page's Projects relation ids.

    The goal-side `Projects` relation is the authoritative link (the
    project-side `Goal` relation is not auto-synced), so the service
    extracts the ids from the goal page and this resolves each by page
    read. A failed lookup never drops the project: it returns a nameless
    reference plus a warning.
    """

    projects: list[ProjectRef] = []
    warnings: list[str] = []
    failed = 0
    for project_id in project_ids:
        try:
            name = fetch_page_title(token, project_id)
            if name is None:
                failed += 1
            projects.append(ProjectRef(id=project_id, name=name))
        except requests.RequestException:
            failed += 1
            projects.append(ProjectRef(id=project_id, name=None))

    if failed:
        noun = "project" if failed == 1 else "projects"
        warnings.append(f"Could not load names for {failed} linked {noun}.")

    return projects, warnings


def create_goal(token: str, data_source_id: str, goal: GoalCreate) -> dict:
    """Create a goal page in the configured Notion data source.

    Writes only what creation means to set: the name, and each optional
    field only when provided. Status defaults to Not Started in the
    schema, so it is not written unless explicitly requested.
    """

    properties: dict = {
        "Name": {"title": [{"text": {"content": goal.name}}]},
    }
    if goal.status is not None:
        properties["Status"] = {"status": {"name": goal.status}}
    if goal.area_id is not None:
        properties["Area"] = {"relation": [{"id": goal.area_id}]}
    if goal.target_date is not None:
        properties["Target Date"] = {"date": {"start": goal.target_date.isoformat()}}

    res = requests.post(
        url=f"{NOTION_API_URL}/pages",
        headers=_headers(token),
        json={
            "parent": {"data_source_id": data_source_id, "type": "data_source_id"},
            "properties": properties,
        },
    )
    res.raise_for_status()
    return res.json()


def update_goal(token: str, goal_id: str, update: GoalUpdate) -> bool:
    """PATCH a goal page with only the deliberately edited properties.

    Fields left as UNSET are omitted entirely, so Notion preserves their
    current values. Status is status-only: completing, failing, or
    pausing a goal never touches its projects or their tasks.
    """

    properties: dict = {}
    if update.name is not UNSET:
        # A set name is never None: the API layer rejects null names.
        properties["Name"] = {"title": [{"text": {"content": update.name}}]}
    if update.status is not UNSET:
        if update.status is None:
            properties["Status"] = {"status": {"name": "Not Started"}}
        else:
            properties["Status"] = {"status": {"name": update.status}}
    if update.area_id is not UNSET:
        if update.area_id is None:
            properties["Area"] = {"relation": []}
        else:
            properties["Area"] = {"relation": [{"id": update.area_id}]}
    if update.target_date is not UNSET:
        if update.target_date is None:
            properties["Target Date"] = {"date": None}
        else:
            properties["Target Date"] = {"date": {"start": update.target_date.isoformat()}}

    res = requests.patch(
        url=f"{NOTION_API_URL}/pages/{goal_id}",
        headers=_headers(token),
        json={"properties": properties},
    )
    res.raise_for_status()
    return True
