from life_os.models.goal import ProjectRef
from life_os.services.direction import build_direction, get_direction


def goal_page(
    page_id: str,
    name: str = "Ship the app",
    status: str | None = "Active",
    project_ids: list[str] | None = None,
) -> dict:
    return {
        "id": page_id,
        "properties": {
            "Name": {"type": "title", "title": [{"plain_text": name}]},
            "Status": {"type": "status", "status": {"name": status}},
            "Projects": {
                "type": "relation",
                "relation": [{"id": pid} for pid in (project_ids or [])],
            },
        },
    }


def resolve_no_projects(project_ids):
    return [], []


def test_build_direction_lists_goals_with_projects():
    def resolve(project_ids):
        return (
            [ProjectRef(id=pid, name=f"Project {pid}") for pid in project_ids],
            [],
        )

    summary = build_direction(
        "2026-09-21",
        pages=[goal_page("g1", project_ids=["p1", "p2"])],
        resolve_projects=resolve,
    )

    assert len(summary.items) == 1
    goal = summary.items[0]
    assert goal.id == "g1"
    assert goal.name == "Ship the app"
    assert goal.status == "Active"
    assert goal.status_available is True
    assert [p.id for p in goal.projects] == ["p1", "p2"]
    assert summary.statuses == []
    assert summary.week_start == "2026-09-21"


def test_build_direction_keeps_goals_without_projects():
    summary = build_direction(
        "2026-09-21",
        pages=[goal_page("g1", project_ids=[])],
        resolve_projects=resolve_no_projects,
    )

    # Goals without projects stay in items; empty is not a dropped row.
    assert len(summary.items) == 1
    assert summary.items[0].projects == []


def test_build_direction_zero_goals_is_valid():
    summary = build_direction(
        "2026-09-21",
        pages=[],
        resolve_projects=resolve_no_projects,
    )

    assert summary.items == []
    assert summary.statuses == []


def test_build_direction_sorts_by_name():
    def resolve(project_ids):
        return [], []

    summary = build_direction(
        "2026-09-21",
        pages=[
            goal_page("g2", name="Write thesis"),
            goal_page("g1", name="Ship the app"),
        ],
        resolve_projects=resolve,
    )

    assert [goal.id for goal in summary.items] == ["g1", "g2"]


def test_build_direction_degrades_failed_project_resolution():
    def resolve(project_ids):
        return [ProjectRef(id="p1", name=None)], ["Could not load names for 1 linked project."]

    summary = build_direction(
        "2026-09-21",
        pages=[goal_page("g1", project_ids=["p1"])],
        resolve_projects=resolve,
    )

    # A failed project lookup never drops the goal.
    assert len(summary.items) == 1
    assert summary.items[0].projects == [ProjectRef(id="p1", name=None)]
    assert summary.warnings == ["Could not load names for 1 linked project."]


def test_build_direction_unreadable_status_stays_unavailable():
    page = goal_page("g1", status=None)
    page["properties"]["Status"] = {"type": "status", "status": {"name": None}}

    summary = build_direction(
        "2026-09-21",
        pages=[page],
        resolve_projects=resolve_no_projects,
    )

    assert summary.items[0].status is None
    assert summary.items[0].status_available is False


def test_get_direction_failure_is_unavailable_not_zero():
    def failing():
        raise RuntimeError("Notion down")

    summary = get_direction("2026-09-21", failing, resolve_no_projects)

    # A failed source never becomes zero goals: statuses marks it
    # unavailable so the UI distinguishes unavailable from empty.
    assert summary.items == []
    assert summary.statuses == [{"name": "Notion", "ok": False, "error": "Notion down"}]


def test_get_direction_success():
    pages = [goal_page("g1", project_ids=[])]

    summary = get_direction("2026-09-21", lambda: pages, resolve_no_projects)

    assert summary.statuses == []
    assert len(summary.items) == 1
