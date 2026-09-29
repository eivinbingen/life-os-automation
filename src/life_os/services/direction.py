from collections.abc import Callable
from datetime import datetime
from zoneinfo import ZoneInfo

from life_os.integrations.notion_common import page_title as _page_title
from life_os.models.direction import DirectionGoal, DirectionSummary
from life_os.models.goal import ProjectRef

TIMEZONE = "Europe/Zurich"
_TZ = ZoneInfo(TIMEZONE)


def _normalize_goal(page: dict) -> tuple[str | None, str | None, bool, list[str]]:
    """Normalize a raw goal page into (name, status, status_available,
    project_ids)."""

    props = page.get("properties", {})
    name = _page_title(page)

    status = None
    status_available = False
    status_prop = props.get("Status", {})
    if status_prop.get("type") == "status":
        status = status_prop.get("status", {}).get("name")
        status_available = status is not None

    project_ids: list[str] = []
    projects_prop = props.get("Projects", {})
    if projects_prop.get("type") == "relation":
        project_ids = [rel["id"] for rel in projects_prop.get("relation", [])]

    return name, status, status_available, project_ids


def build_direction(
    week_start: str,
    pages: list[dict],
    resolve_projects: Callable[[list[str]], tuple[list[ProjectRef], list[str]]],
    captured_at: datetime | None = None,
    statuses: list[dict] | None = None,
    warnings: list[str] | None = None,
) -> DirectionSummary:
    """Build the Direction stage's goal list from raw goal pages.

    Pure normalization: goals without projects stay in items, zero goals
    is valid, and a failed per-goal project resolution degrades to
    nameless references rather than dropping the goal.
    """

    items: list[DirectionGoal] = []
    all_warnings: list[str] = list(warnings or [])
    for page in pages:
        name, status, status_available, project_ids = _normalize_goal(page)
        projects, project_warnings = resolve_projects(project_ids)
        all_warnings.extend(project_warnings)
        items.append(
            DirectionGoal(
                id=page["id"],
                name=name,
                status=status,
                status_available=status_available,
                projects=projects,
            )
        )

    items.sort(key=lambda goal: (goal.name or "").lower())

    return DirectionSummary(
        week_start=week_start,
        captured_at=captured_at or datetime.now(_TZ),
        timezone=TIMEZONE,
        items=items,
        statuses=statuses or [],
        warnings=all_warnings,
    )


def get_direction(
    week_start: str,
    fetch_active_goal_pages: Callable[[], list[dict]],
    resolve_projects: Callable[[list[str]], tuple[list[ProjectRef], list[str]]],
) -> DirectionSummary:
    """Fetch live Direction data, degrading per source.

    A failed source never becomes zero goals: the summary is marked
    unavailable with the error in statuses, so the UI distinguishes
    unavailable from empty.
    """

    try:
        pages = fetch_active_goal_pages()
    except Exception as error:
        return build_direction(
            week_start,
            pages=[],
            resolve_projects=resolve_projects,
            statuses=[{"name": "Notion", "ok": False, "error": str(error)}],
        )

    return build_direction(week_start, pages=pages, resolve_projects=resolve_projects)
