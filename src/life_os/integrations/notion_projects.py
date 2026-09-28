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
from life_os.models.notion import Task, TaskFetchResult


def fetch_project(token: str, project_id: str) -> dict:
    """Fetch one project page raw (name, status, relations) for the service
    layer to normalize. Read-only; raises on failure."""

    response = requests.get(
        url=f"{NOTION_API_URL}/pages/{project_id}",
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
