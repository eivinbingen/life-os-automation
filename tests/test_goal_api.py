from fastapi.testclient import TestClient

from life_os.api import create_app
from life_os.models.goal import GoalDetail, ProjectRef


def _minimal_fetchers():
    def fetch_events(day):
        return []

    def fetch_tasks(day):
        return []

    def update(task_id, update, done):
        return True

    return fetch_events, fetch_tasks, update


def _detail(**overrides) -> GoalDetail:
    base = dict(
        id="goal-1",
        name="Ship the app",
        status="Active",
        status_available=True,
        area_id="area-1",
        area_name="Work",
        target_date="2026-12-31",
        projects=[ProjectRef(id="p1", name="Life OS")],
        statuses=[],
        warnings=[],
    )
    base.update(overrides)
    return GoalDetail(**base)


def test_goal_endpoint_returns_normalized_detail():
    fetch_events, fetch_tasks, update = _minimal_fetchers()

    client = TestClient(
        create_app(fetch_events, fetch_tasks, update, fetch_goal_detail=lambda gid: _detail())
    )

    response = client.get("/goals/goal-1")

    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Ship the app"
    assert body["status"] == "Active"
    assert body["status_available"] is True
    assert body["area_id"] == "area-1"
    assert body["area_name"] == "Work"
    assert body["target_date"] == "2026-12-31"
    assert body["projects"][0]["name"] == "Life OS"
    assert body["statuses"] == []


def test_goal_endpoint_absent_without_callable():
    fetch_events, fetch_tasks, update = _minimal_fetchers()

    client = TestClient(create_app(fetch_events, fetch_tasks, update))

    response = client.get("/goals/goal-1")

    assert response.status_code == 404


def test_goal_endpoint_maps_not_found_to_404():
    from life_os.services.goals import GoalNotFound

    fetch_events, fetch_tasks, update = _minimal_fetchers()

    def fetch_goal_detail(gid):
        raise GoalNotFound(gid)

    client = TestClient(
        create_app(fetch_events, fetch_tasks, update, fetch_goal_detail=fetch_goal_detail)
    )

    response = client.get("/goals/missing")

    assert response.status_code == 404
    assert response.json() == {"detail": "This goal could not be found."}


def test_goal_endpoint_reports_unexpected_failure_as_502():
    fetch_events, fetch_tasks, update = _minimal_fetchers()

    def fetch_goal_detail(gid):
        raise RuntimeError("unexpected")

    client = TestClient(
        create_app(fetch_events, fetch_tasks, update, fetch_goal_detail=fetch_goal_detail)
    )

    response = client.get("/goals/goal-1")

    assert response.status_code == 502
    assert "could not be read" in response.json()["detail"]


def test_active_goals_endpoint_returns_goals():
    fetch_events, fetch_tasks, update = _minimal_fetchers()

    from life_os.models.notion import Task

    client = TestClient(
        create_app(
            fetch_events,
            fetch_tasks,
            update,
            fetch_active_goals=lambda: [Task(id="g1", name="Ship the app")],
        )
    )

    response = client.get("/goals/active")

    assert response.status_code == 200
    assert response.json() == [
        {"id": "g1", "name": "Ship the app", "done": False, "scheduled": None,
         "due": None, "project_id": None, "project_name": None, "course_id": None}
    ]


def test_active_goals_endpoint_absent_without_callable():
    fetch_events, fetch_tasks, update = _minimal_fetchers()

    client = TestClient(create_app(fetch_events, fetch_tasks, update))

    response = client.get("/goals/active")

    assert response.status_code == 404


def test_active_goals_endpoint_reports_failure_as_502():
    fetch_events, fetch_tasks, update = _minimal_fetchers()

    def fetch_active_goals():
        raise RuntimeError("boom")

    client = TestClient(
        create_app(fetch_events, fetch_tasks, update, fetch_active_goals=fetch_active_goals)
    )

    response = client.get("/goals/active")

    assert response.status_code == 502
    assert "could not be read" in response.json()["detail"]
