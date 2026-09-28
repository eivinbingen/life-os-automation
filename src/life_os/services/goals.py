from collections.abc import Callable

import requests

from life_os.integrations.notion_common import page_title as _page_title
from life_os.models.goal import GoalDetail, ProjectRef


class GoalNotFound(Exception):
    """The goal page does not exist (Notion returned 404)."""


def _normalize_goal(page: dict) -> tuple:
    """Normalize a raw goal page into (name, status, status_available,
    area_id, target_date)."""

    props = page.get("properties", {})
    name = _page_title(page)

    status = None
    status_available = False
    status_prop = props.get("Status", {})
    if status_prop.get("type") == "status":
        status = status_prop.get("status", {}).get("name")
        status_available = status is not None

    area_id = None
    area_prop = props.get("Area", {})
    if area_prop.get("type") == "relation":
        relations = area_prop.get("relation", [])
        area_id = relations[0]["id"] if relations else None

    target_value = props.get("Target Date", {}).get("date")
    target_date = target_value.get("start") if target_value else None

    return name, status, status_available, area_id, target_date


def get_goal_detail(
    goal_id: str,
    fetch_goal: Callable[[str], dict],
    fetch_projects_for_goal: Callable[[str], list[ProjectRef]],
    fetch_area_name: Callable[[str], str | None],
) -> GoalDetail:
    """Assemble one goal detail, degrading per source.

    A failed source never hides the goal: an unreadable status renders as
    unavailable, a failed area lookup as neutral missing context, and a
    failed projects query as empty with a statuses entry. A genuinely
    missing goal (Notion 404) is not a degraded read — it raises
    GoalNotFound so the API can answer 404.
    """

    statuses: list[dict] = []
    warnings: list[str] = []

    name = None
    status = None
    status_available = False
    area_id = None
    target_date = None
    try:
        page = fetch_goal(goal_id)
    except requests.HTTPError as error:
        if error.response is not None and error.response.status_code == 404:
            raise GoalNotFound(goal_id) from error
        statuses.append({"name": "Notion", "ok": False, "error": str(error)})
    except Exception as error:
        statuses.append({"name": "Notion", "ok": False, "error": str(error)})
    else:
        name, status, status_available, area_id, target_date = _normalize_goal(page)

    area_name = None
    if area_id:
        try:
            area_name = fetch_area_name(area_id)
        except Exception:
            # A failed area lookup is neutral missing context, not an error.
            area_name = None

    projects: list[ProjectRef] = []
    try:
        projects = fetch_projects_for_goal(goal_id)
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
