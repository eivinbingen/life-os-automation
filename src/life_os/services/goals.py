from collections.abc import Callable

import requests

from life_os.integrations.notion_common import page_title as _page_title
from life_os.models.goal import GoalDetail, ProjectRef


class GoalNotFound(Exception):
    """The goal page does not exist (Notion returned 404)."""


def _normalize_goal(page: dict) -> tuple:
    """Normalize a raw goal page into (name, status, status_available,
    area_id, target_date, project_ids)."""

    props = page.get("properties", {})
    name = _page_title(page)

    status = None
    status_available = False
    status_prop = props.get("Status", {})
    if status_prop.get("type") == "status":
        status_value = status_prop.get("status") or {}
        status = status_value.get("name")
        status_available = status is not None

    area_id = None
    area_prop = props.get("Area", {})
    if area_prop.get("type") == "relation":
        relations = area_prop.get("relation", [])
        area_id = relations[0]["id"] if relations else None

    target_value = props.get("Target Date", {}).get("date")
    target_date = target_value.get("start") if target_value else None

    project_ids = []
    projects_prop = props.get("Projects", {})
    if projects_prop.get("type") == "relation":
        project_ids = [rel["id"] for rel in projects_prop.get("relation", [])]

    return name, status, status_available, area_id, target_date, project_ids


def get_goal_detail(
    goal_id: str,
    fetch_goal: Callable[[str], dict],
    fetch_projects_by_ids: Callable[[list[str]], tuple[list[ProjectRef], list[str]]],
    fetch_area_name: Callable[[str], str | None],
) -> GoalDetail:
    """Assemble one goal detail, degrading per source.

    A failed source never hides the goal: an unreadable status renders as
    unavailable, a failed area lookup as neutral missing context, and a
    failed projects resolution as nameless references with a warning. A
    genuinely missing goal (Notion 404) is not a degraded read — it raises
    GoalNotFound so the API can answer 404.
    """

    statuses: list[dict] = []
    warnings: list[str] = []

    name = None
    status = None
    status_available = False
    area_id = None
    target_date = None
    project_ids: list[str] = []
    try:
        page = fetch_goal(goal_id)
    except requests.HTTPError as error:
        if error.response is not None and error.response.status_code == 404:
            raise GoalNotFound(goal_id) from error
        statuses.append({"name": "Notion", "ok": False, "error": str(error)})
    except Exception as error:
        statuses.append({"name": "Notion", "ok": False, "error": str(error)})
    else:
        name, status, status_available, area_id, target_date, project_ids = (
            _normalize_goal(page)
        )

    area_name = None
    if area_id:
        try:
            area_name = fetch_area_name(area_id)
        except Exception:
            # A failed area lookup is neutral missing context, not an error.
            area_name = None

    projects: list[ProjectRef] = []
    try:
        projects, warnings = fetch_projects_by_ids(project_ids)
    except Exception as error:
        statuses.append({"name": "Notion projects", "ok": False, "error": str(error)})

    return GoalDetail(
        id=goal_id,
        name=name,
        status=status,
        status_available=status_available,
        area_id=area_id,
        area_name=area_name,
        target_date=target_date,
        projects=projects,
        statuses=statuses,
        warnings=warnings,
    )
