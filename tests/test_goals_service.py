from life_os.models.goal import ProjectRef
from life_os.services.goals import get_goal_detail


def goal_page(status="Active", area_id="area-1", target_date="2026-12-31", project_ids=None):
    relations = [{"id": pid} for pid in (project_ids or [])]
    return {
        "id": "goal-1",
        "properties": {
            "Name": {"type": "title", "title": [{"plain_text": "Ship the app"}]},
            "Status": {"type": "status", "status": {"name": status}},
            "Area": {"type": "relation", "relation": [{"id": area_id}] if area_id else []},
            "Target Date": {
                "type": "date",
                "date": {"start": target_date} if target_date else None,
            },
            "Projects": {"type": "relation", "relation": relations},
        },
    }


def _no_projects(project_ids):
    return ([], [])


def test_get_goal_detail_assembles_all_sources():
    detail = get_goal_detail(
        "goal-1",
        fetch_goal=lambda gid: goal_page(project_ids=["p1"]),
        fetch_projects_by_ids=lambda ids: ([ProjectRef(id="p1", name="Life OS")], []),
        fetch_area_name=lambda aid: "Work",
    )

    assert detail.name == "Ship the app"
    assert detail.status == "Active"
    assert detail.status_available is True
    assert detail.area_id == "area-1"
    assert detail.area_name == "Work"
    assert detail.target_date == "2026-12-31"
    assert [(p.id, p.name) for p in detail.projects] == [("p1", "Life OS")]
    assert detail.statuses == []
    assert detail.warnings == []


def test_project_ids_come_from_the_goal_page_projects_relation():
    """The goal-side Projects relation is the authoritative link (G2)."""

    ids_seen = []

    def fetch_projects_by_ids(ids):
        ids_seen.append(ids)
        return ([], [])

    get_goal_detail(
        "goal-1",
        fetch_goal=lambda gid: goal_page(project_ids=["p1", "p2"]),
        fetch_projects_by_ids=fetch_projects_by_ids,
        fetch_area_name=lambda aid: None,
    )

    assert ids_seen == [["p1", "p2"]]


def test_goal_with_no_projects_stays_visible_with_empty_list():
    detail = get_goal_detail(
        "goal-1",
        fetch_goal=lambda gid: goal_page(),
        fetch_projects_by_ids=_no_projects,
        fetch_area_name=lambda aid: "Work",
    )

    assert detail.projects == []
    assert detail.name == "Ship the app"
    assert detail.statuses == []


def test_goal_without_projects_relation_is_neutral_empty():
    page = goal_page()
    del page["properties"]["Projects"]

    detail = get_goal_detail(
        "goal-1",
        fetch_goal=lambda gid: page,
        fetch_projects_by_ids=_no_projects,
        fetch_area_name=lambda aid: None,
    )

    assert detail.projects == []
    assert detail.name == "Ship the app"
    assert detail.statuses == []


def test_name_resolution_warnings_surface_in_the_detail():
    detail = get_goal_detail(
        "goal-1",
        fetch_goal=lambda gid: goal_page(project_ids=["p1"]),
        fetch_projects_by_ids=lambda ids: (
            [ProjectRef(id="p1", name=None)],
            ["Could not load names for 1 linked project."],
        ),
        fetch_area_name=lambda aid: None,
    )

    assert detail.projects == [ProjectRef(id="p1", name=None)]
    assert detail.warnings == ["Could not load names for 1 linked project."]


def test_missing_area_relation_is_neutral():
    detail = get_goal_detail(
        "goal-1",
        fetch_goal=lambda gid: goal_page(area_id=None),
        fetch_projects_by_ids=_no_projects,
        fetch_area_name=lambda aid: "never called",
    )

    assert detail.area_id is None
    assert detail.area_name is None
    assert detail.name == "Ship the app"
    assert detail.statuses == []


def test_failed_area_lookup_is_neutral_missing_context():
    def failing_area_name(aid):
        raise RuntimeError("area read failed")

    detail = get_goal_detail(
        "goal-1",
        fetch_goal=lambda gid: goal_page(),
        fetch_projects_by_ids=_no_projects,
        fetch_area_name=failing_area_name,
    )

    assert detail.area_id == "area-1"
    assert detail.area_name is None
    assert detail.statuses == []
    assert detail.name == "Ship the app"


def test_failed_status_read_renders_unavailable():
    detail = get_goal_detail(
        "goal-1",
        fetch_goal=lambda gid: {"id": "goal-1", "properties": {}},
        fetch_projects_by_ids=_no_projects,
        fetch_area_name=lambda aid: None,
    )

    assert detail.name is None
    assert detail.status is None
    assert detail.status_available is False


def test_failed_projects_resolution_marks_source_unavailable():
    def failing_projects(ids):
        raise RuntimeError("projects resolution failed")

    detail = get_goal_detail(
        "goal-1",
        fetch_goal=lambda gid: goal_page(project_ids=["p1"]),
        fetch_projects_by_ids=failing_projects,
        fetch_area_name=lambda aid: None,
    )

    assert detail.projects == []
    assert detail.statuses == [
        {"name": "Notion projects", "ok": False, "error": "projects resolution failed"}
    ]
    # The goal itself is still readable.
    assert detail.name == "Ship the app"


def test_failed_goal_fetch_marks_source_unavailable():
    def failing_goal(gid):
        raise RuntimeError("goal read failed")

    detail = get_goal_detail(
        "goal-1",
        fetch_goal=failing_goal,
        fetch_projects_by_ids=_no_projects,
        fetch_area_name=lambda aid: None,
    )

    assert detail.name is None
    assert detail.statuses == [
        {"name": "Notion", "ok": False, "error": "goal read failed"}
    ]
