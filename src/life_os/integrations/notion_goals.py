import requests

from life_os.integrations.notion_common import (
    NOTION_API_URL,
)
from life_os.integrations.notion_common import (
    headers as _headers,
)
from life_os.integrations.notion_common import (
    page_title as _page_title,
)
from life_os.models.notion import Task


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


def fetch_projects_for_goal(
    token: str, projects_data_source_id: str, goal_id: str, page_size: int
) -> list[Task]:
    """Fetch active and otherwise-statused projects linked to a goal.

    The goal-side `Projects` relation is the authoritative link (the
    project-side `Goal` relation is not auto-synced), so the join is made
    by querying the projects data source for pages whose synced project-side
    `Goal` relation contains the goal id — and falls back to nothing when
    empty. Names resolve from the same query results.
    """

    projects: dict[str, Task] = {}
    body = {
        "filter": {
            "property": "Goal",
            "relation": {"contains": goal_id},
        },
        "page_size": page_size,
    }
    while True:
        res = requests.post(
            url=f"{NOTION_API_URL}/data_sources/{projects_data_source_id}/query",
            headers=_headers(token),
            json=body,
        )
        res.raise_for_status()
        data = res.json()
        for page in data["results"]:
            project = Task(id=page["id"], name=_page_title(page) or "")
            projects.setdefault(project.id, project)
        if not data["has_more"]:
            break
        body["start_cursor"] = data["next_cursor"]
    return list(projects.values())
