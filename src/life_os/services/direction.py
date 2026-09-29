from collections.abc import Callable
from datetime import datetime
from zoneinfo import ZoneInfo

from life_os.models.direction import DirectionGoal, DirectionSummary
from life_os.models.goal import ProjectRef
from life_os.services.goals import _normalize_goal

TIMEZONE = "Europe/Zurich"
_TZ = ZoneInfo(TIMEZONE)


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
    is valid, and a failed per-project resolution degrades to nameless
    references rather than dropping the goal. Project names resolve once
    for the union of linked ids across all pages — not per goal — so the
    stage stays within the frontend's fetch budget under realistic load.
    """

    all_warnings: list[str] = list(warnings or [])
    normalized: list[tuple[str, dict, tuple]] = []
    union_ids: list[str] = []
    seen: set[str] = set()
    for page in pages:
        name, status, status_available, _area_id, _target_date, project_ids = (
            _normalize_goal(page)
        )
        normalized.append((page["id"], page, (name, status, status_available, project_ids)))
        for pid in project_ids:
            if pid not in seen:
                seen.add(pid)
                union_ids.append(pid)

    resolved: dict[str, ProjectRef] = {}
    if union_ids:
        try:
            projects, project_warnings = resolve_projects(union_ids)
            all_warnings.extend(project_warnings)
            resolved = {project.id: project for project in projects}
        except Exception as error:
            # A failed resolution degrades to nameless references with a
            # statuses entry, never dropped goals.
            all_warnings.append(f"Could not load linked projects: {error}")

    items: list[DirectionGoal] = []
    for goal_id, _page, (name, status, status_available, project_ids) in normalized:
        items.append(
            DirectionGoal(
                id=goal_id,
                name=name,
                status=status,
                status_available=status_available,
                projects=[resolved.get(pid, ProjectRef(id=pid, name=None)) for pid in project_ids],
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
