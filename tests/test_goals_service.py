from life_os.models.goal import ProjectRef
from life_os.services.goals import get_goal_detail


def goal_page(status="Active", area_id="area-1", target_date="2026-12-31"):
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
        },
    }


def test_get_goal_detail_assembles_all_sources():
    detail = get_goal_detail(
        "goal-1",
        fetch_goal=lambda gid: goal_page(),
        fetch_projects_for_goal=lambda gid: [ProjectRef(id="p1", name="Life OS")],
        fetch_area_name=lambda aid: "Work",
    )

    assert detail.name == "Ship the app"
    assert detail.status == "Active"
    assert detail.status_available is True
    assert detail.area_id == "area-1"
    assert detail.area_name == "Work"
    assert detail.target_date == "2026-12-31"
    assert [project.id for project in detail.projects] == ["p1"]
    assert detail.statuses == []


def test_goal_with_no_projects_stays_visible_with_empty_list():
    detail = get_goal_detail(
        "goal-1",
        fetch_goal=lambda gid: goal_page(),
        fetch_projects_for_goal=lambda gid: [],
        fetch_area_name=lambda aid: "Work",
    )

    assert detail.projects == []
    assert detail.name == "Ship the app"
    assert detail.statuses == []


def test_missing_area_relation_is_neutral():
    detail = get_goal_detail(
        "goal-1",
        fetch_goal=lambda gid: goal_page(area_id=None),
        fetch_projects_for_goal=lambda gid: [],
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
        fetch_projects_for_goal=lambda gid: [],
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
        fetch_projects_for_goal=lambda gid: [],
        fetch_area_name=lambda aid: None,
    )

    assert detail.name is None
    assert detail.status is None
    assert detail.status_available is False


def test_failed_projects_query_marks_source_unavailable():
    def failing_projects(gid):
        raise RuntimeError("projects query failed")

    detail = get_goal_detail(
        "goal-1",
        fetch_goal=lambda gid: goal_page(),
        fetch_projects_for_goal=failing_projects,
        fetch_area_name=lambda aid: None,
    )

    assert detail.projects == []
    assert detail.statuses == [
        {"name": "Notion projects", "ok": False, "error": "projects query failed"}
    ]
    # The goal itself is still readable.
    assert detail.name == "Ship the app"


def test_failed_goal_fetch_marks_source_unavailable():
    def failing_goal(gid):
        raise RuntimeError("goal read failed")

    detail = get_goal_detail(
        "goal-1",
        fetch_goal=failing_goal,
        fetch_projects_for_goal=lambda gid: [],
        fetch_area_name=lambda aid: None,
    )

    assert detail.name is None
    assert detail.statuses == [
        {"name": "Notion", "ok": False, "error": "goal read failed"}
    ]
