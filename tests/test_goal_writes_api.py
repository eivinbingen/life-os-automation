from datetime import date

from fastapi.testclient import TestClient
from requests import HTTPError, Response

from life_os.api import create_app
from life_os.models.goal import GoalCreate, GoalUpdate
from life_os.models.notion import UNSET


def _minimal_fetchers():
    def fetch_events(day):
        return []

    def fetch_tasks(day):
        return []

    def update(task_id, update, done):
        return True

    return fetch_events, fetch_tasks, update


def test_create_goal_maps_request_and_returns_page():
    created = []
    fetch_events, fetch_tasks, update = _minimal_fetchers()

    def create(request):
        created.append(request)
        return {"id": "new-goal-1", "properties": {}}

    client = TestClient(create_app(fetch_events, fetch_tasks, update, create_goal=create))

    response = client.post(
        "/goals",
        json={"name": "  Ship the app  ", "status": "Active", "area_id": "area-1",
              "target_date": "2026-12-31"},
    )

    assert response.status_code == 201
    assert response.json() == {"id": "new-goal-1", "properties": {}}
    assert created == [
        GoalCreate(
            name="Ship the app",
            status="Active",
            area_id="area-1",
            target_date=date(2026, 12, 31),
        )
    ]


def test_create_goal_defaults_to_no_status_write():
    created = []
    fetch_events, fetch_tasks, update = _minimal_fetchers()

    def create(request):
        created.append(request)
        return {"id": "new-goal-1", "properties": {}}

    client = TestClient(create_app(fetch_events, fetch_tasks, update, create_goal=create))

    response = client.post("/goals", json={"name": "Someday goal"})

    assert response.status_code == 201
    assert created == [GoalCreate(name="Someday goal", status=None, area_id=None,
                                  target_date=None)]


def test_create_goal_rejects_blank_name():
    fetch_events, fetch_tasks, update = _minimal_fetchers()

    client = TestClient(create_app(fetch_events, fetch_tasks, update, create_goal=lambda r: {}))

    response = client.post("/goals", json={"name": "   "})

    assert response.status_code == 422


def test_create_goal_rejects_status_outside_schema():
    fetch_events, fetch_tasks, update = _minimal_fetchers()

    client = TestClient(create_app(fetch_events, fetch_tasks, update, create_goal=lambda r: {}))

    response = client.post("/goals", json={"name": "Goal", "status": "Completed"})

    assert response.status_code == 422
    assert "Status must be one of" in str(response.json()["detail"])


def test_create_goal_route_absent_without_callable():
    fetch_events, fetch_tasks, update = _minimal_fetchers()

    client = TestClient(create_app(fetch_events, fetch_tasks, update))

    response = client.post("/goals", json={"name": "Goal"})

    assert response.status_code == 404


def test_create_goal_explains_missing_notion_insert_capability():
    fetch_events, fetch_tasks, update = _minimal_fetchers()

    def create(request):
        notion_response = Response()
        notion_response.status_code = 403
        raise HTTPError(response=notion_response)

    client = TestClient(create_app(fetch_events, fetch_tasks, update, create_goal=create))

    response = client.post("/goals", json={"name": "Goal"})

    assert response.status_code == 502
    assert "Notion refused to create" in response.json()["detail"]


def test_update_goal_builds_narrow_domain_update():
    """Omitted keys stay UNSET, explicit nulls clear where meaningful."""
    updates: list[tuple[str, GoalUpdate]] = []
    fetch_events, fetch_tasks, update = _minimal_fetchers()

    def update_goal(goal_id: str, update: GoalUpdate):
        updates.append((goal_id, update))
        return True

    client = TestClient(create_app(fetch_events, fetch_tasks, update, update_goal=update_goal))

    # Status-only edit (the Complete Goal path).
    response = client.patch("/goals/goal-1", json={"status": "Done"})
    assert response.status_code == 200
    assert response.json() == {"goal": "goal-1", "updated": True}

    # Rename + clear the target date explicitly.
    response = client.patch("/goals/goal-1", json={"name": "Renamed", "target_date": None})
    assert response.status_code == 200

    assert updates == [
        ("goal-1", GoalUpdate(status="Done")),
        ("goal-1", GoalUpdate(name="Renamed", target_date=None)),
    ]
    # The status-only update leaves every other field untouched.
    assert updates[0][1].name is UNSET
    assert updates[0][1].area_id is UNSET
    assert updates[0][1].target_date is UNSET


def test_update_goal_rejects_empty_payload():
    fetch_events, fetch_tasks, update = _minimal_fetchers()

    client = TestClient(
        create_app(fetch_events, fetch_tasks, update, update_goal=lambda g, u: True)
    )

    response = client.patch("/goals/goal-1", json={})

    assert response.status_code == 422


def test_update_goal_rejects_null_name():
    fetch_events, fetch_tasks, update = _minimal_fetchers()

    client = TestClient(
        create_app(fetch_events, fetch_tasks, update, update_goal=lambda g, u: True)
    )

    response = client.patch("/goals/goal-1", json={"name": None})

    assert response.status_code == 422


def test_update_goal_rejects_status_outside_schema():
    fetch_events, fetch_tasks, update = _minimal_fetchers()

    client = TestClient(
        create_app(fetch_events, fetch_tasks, update, update_goal=lambda g, u: True)
    )

    response = client.patch("/goals/goal-1", json={"status": "Completed"})

    assert response.status_code == 422


def test_update_goal_route_absent_without_callable():
    fetch_events, fetch_tasks, update = _minimal_fetchers()

    client = TestClient(create_app(fetch_events, fetch_tasks, update))

    response = client.patch("/goals/goal-1", json={"status": "Done"})

    assert response.status_code == 404


def test_update_goal_maps_notion_failures_to_502():
    fetch_events, fetch_tasks, update = _minimal_fetchers()

    def update_goal(goal_id, update):
        notion_response = Response()
        notion_response.status_code = 400
        raise HTTPError(response=notion_response)

    client = TestClient(create_app(fetch_events, fetch_tasks, update, update_goal=update_goal))

    response = client.patch("/goals/goal-1", json={"status": "Done"})

    assert response.status_code == 502
    assert "goal properties" in response.json()["detail"]
