from collections.abc import Callable

import requests

from life_os.integrations.notion_common import page_title as _page_title
from life_os.models.notion import Task, TaskFetchResult
from life_os.models.project import ProjectDetail


class ProjectNotFound(Exception):
    """The project page does not exist (Notion returned 404)."""


def _normalize_project(page: dict) -> tuple:
    """Normalize a raw project page into (name, status, status_available,
    goal_id, resolved_goal, deadline)."""

    props = page.get("properties", {})
    name = _page_title(page)

    status = None
    status_available = False
    status_prop = props.get("Status", {})
    if status_prop.get("type") == "status":
        status = status_prop.get("status", {}).get("name")
        status_available = status is not None

    goal_id = None
    goal_prop = props.get("Goal", {})
    if goal_prop.get("type") == "relation":
        relations = goal_prop.get("relation", [])
        goal_id = relations[0]["id"] if relations else None

    # Display-only fallback for Notion-side inheritance: the Resolved Goal
    # formula string, used when the project-side Goal relation is empty.
    resolved_goal = None
    resolved_prop = props.get("Resolved Goal", {})
    if resolved_prop.get("type") == "formula":
        resolved_goal = (resolved_prop.get("formula") or {}).get("string")

    deadline_value = props.get("Deadline", {}).get("date")
    deadline = deadline_value.get("start") if deadline_value else None

    return name, status, status_available, goal_id, resolved_goal, deadline


def get_project_detail(
    project_id: str,
    fetch_project: Callable[[str], dict],
    fetch_tasks_for_project: Callable[[str], TaskFetchResult],
    fetch_goal_name: Callable[[str], str | None],
) -> ProjectDetail:
    """Assemble one project detail, degrading per source.

    A failed source never hides the project: an unreadable status renders
    as unavailable, a failed goal lookup as neutral missing context, and
    the tasks list as empty with a warning. A genuinely missing project
    (Notion 404) is not a degraded read — it raises ProjectNotFound so
    the API can answer 404 instead of an empty shell.
    """

    statuses: list[dict] = []
    warnings: list[str] = []

    name = None
    status = None
    status_available = False
    goal_id = None
    resolved_goal = None
    deadline = None
    try:
        page = fetch_project(project_id)
    except requests.HTTPError as error:
        if error.response is not None and error.response.status_code == 404:
            raise ProjectNotFound(project_id) from error
        statuses.append({"name": "Notion", "ok": False, "error": str(error)})
    except Exception as error:
        statuses.append({"name": "Notion", "ok": False, "error": str(error)})
    else:
        name, status, status_available, goal_id, resolved_goal, deadline = (
            _normalize_project(page)
        )

    goal_name = None
    if goal_id:
        try:
            goal_name = fetch_goal_name(goal_id)
        except Exception:
            # A failed goal lookup is neutral missing context, not an error.
            goal_name = None

    tasks: list[Task] = []
    try:
        result = fetch_tasks_for_project(project_id)
        tasks = result.tasks
        warnings.extend(result.warnings)
    except Exception as error:
        statuses.append({"name": "Notion tasks", "ok": False, "error": str(error)})

    return ProjectDetail(
        id=project_id,
        name=name,
        status=status,
        status_available=status_available,
        goal_id=goal_id,
        goal_name=goal_name,
        resolved_goal=resolved_goal,
        deadline=deadline,
        tasks=tasks,
        statuses=statuses,
        warnings=warnings,
    )
