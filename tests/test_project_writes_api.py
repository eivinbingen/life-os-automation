from datetime import date

from fastapi.testclient import TestClient
from requests import HTTPError, Response

from life_os.api import create_app
from life_os.models.notion import UNSET
from life_os.models.project import ProjectCreate, ProjectUpdate


def _minimal_fetchers():
    def fetch_events(day):
        return []

    def fetch_tasks(day):
        return []

    def update(task_id, update, done):
        return True

    return fetch_events, fetch_tasks, update


def test_create_project_maps_request_and_returns_page():
    created = []
    fetch_events, fetch_tasks, update = _minimal_fetchers()

    def create(request):
        created.append(request)
        return {"id": "new-project-1", "properties": {}}

    client = TestClient(
        create_app(fetch_events, fetch_tasks, update, create_project=create)
    )

    response = client.post(
        "/projects",
        json={"name": "  Life OS  ", "status": "Active", "goal_id": "goal-1",
              "deadline": "2026-12-31"},
    )

    assert response.status_code == 201
    assert response.json() == {"id": "new-project-1", "properties": {}}
    assert created == [
        ProjectCreate(
            name="Life OS",
            status="Active",
            goal_id="goal-1",
            deadline=date(2026, 12, 31),
        )
    ]


def test_create_project_without_goal_and_status():
    created = []
    fetch_events, fetch_tasks, update = _minimal_fetchers()

    def create(request):
        created.append(request)
        return {"id": "new-project-1", "properties": {}}

    client = TestClient(
        create_app(fetch_events, fetch_tasks, update, create_project=create)
    )

    response = client.post("/projects", json={"name": "Someday project"})

    assert response.status_code == 201
    # No required goal: creation without a goal link is a valid narrow payload.
    assert created == [ProjectCreate(name="Someday project", status=None,
                                     goal_id=None, deadline=None)]


def test_create_project_rejects_blank_name():
    fetch_events, fetch_tasks, update = _minimal_fetchers()

    client = TestClient(
        create_app(fetch_events, fetch_tasks, update, create_project=lambda r: {})
    )

    response = client.post("/projects", json={"name": "   "})

    assert response.status_code == 422


def test_create_project_rejects_status_outside_schema():
    fetch_events, fetch_tasks, update = _minimal_fetchers()

    client = TestClient(
        create_app(fetch_events, fetch_tasks, update, create_project=lambda r: {})
    )

    response = client.post("/projects", json={"name": "Project", "status": "Done Maybe"})

    assert response.status_code == 422
    assert "Status must be one of" in str(response.json()["detail"])


def test_create_project_unconfigured_answers_501():
    """The write route always registers: without the callable it answers
    501 "not configured" rather than a 404 route miss — the detail read can
    work without the projects env var, so the write contract must not
    silently differ."""

    fetch_events, fetch_tasks, update = _minimal_fetchers()

    client = TestClient(create_app(fetch_events, fetch_tasks, update))

    response = client.post("/projects", json={"name": "Project"})

    assert response.status_code == 501
    assert "not configured" in response.json()["detail"]


def test_create_project_explains_missing_notion_insert_capability():
    fetch_events, fetch_tasks, update = _minimal_fetchers()

    def create(request):
        notion_response = Response()
        notion_response.status_code = 403
        raise HTTPError(response=notion_response)

    client = TestClient(
        create_app(fetch_events, fetch_tasks, update, create_project=create)
    )

    response = client.post("/projects", json={"name": "Project"})

    assert response.status_code == 502
    assert "Notion refused to create" in response.json()["detail"]


def test_create_project_reports_unreachable_notion_as_502():
    fetch_events, fetch_tasks, update = _minimal_fetchers()

    class Unreachable(HTTPError):
        def __init__(self):
            super().__init__("connection failed")

    def create(request):
        raise Unreachable()

    client = TestClient(
        create_app(fetch_events, fetch_tasks, update, create_project=create)
    )

    response = client.post("/projects", json={"name": "Project"})

    assert response.status_code == 502


def test_update_project_builds_narrow_domain_update():
    """Omitted keys stay UNSET, explicit nulls clear where meaningful."""
    updates: list[tuple[str, ProjectUpdate]] = []
    fetch_events, fetch_tasks, update = _minimal_fetchers()

    def update_project(project_id: str, update: ProjectUpdate):
        updates.append((project_id, update))
        return True

    client = TestClient(
        create_app(fetch_events, fetch_tasks, update, update_project=update_project)
    )

    # Rename + set the goal link.
    response = client.patch(
        "/projects/project-1", json={"name": "Renamed", "goal_id": "goal-1"}
    )
    assert response.status_code == 200
    assert response.json() == {"project": "project-1", "updated": True}

    # Status-only edit; explicitly clear the goal and set a deadline.
    response = client.patch(
        "/projects/project-1",
        json={"status": "Dropped", "goal_id": None, "deadline": "2026-11-30"},
    )
    assert response.status_code == 200

    assert updates == [
        ("project-1", ProjectUpdate(name="Renamed", goal_id="goal-1")),
        ("project-1", ProjectUpdate(status="Dropped", goal_id=None,
                                    deadline=date(2026, 11, 30))),
    ]
    # The rename leaves every other field untouched.
    assert updates[0][1].status is UNSET
    assert updates[0][1].deadline is UNSET


def test_update_project_rejects_empty_payload():
    fetch_events, fetch_tasks, update = _minimal_fetchers()

    client = TestClient(
        create_app(fetch_events, fetch_tasks, update, update_project=lambda p, u: True)
    )

    response = client.patch("/projects/project-1", json={})

    assert response.status_code == 422
    assert "No project fields to update" in str(response.json()["detail"])


def test_update_project_rejects_null_name():
    fetch_events, fetch_tasks, update = _minimal_fetchers()

    client = TestClient(
        create_app(fetch_events, fetch_tasks, update, update_project=lambda p, u: True)
    )

    response = client.patch("/projects/project-1", json={"name": None})

    assert response.status_code == 422


def test_update_project_rejects_status_outside_schema():
    fetch_events, fetch_tasks, update = _minimal_fetchers()

    client = TestClient(
        create_app(fetch_events, fetch_tasks, update, update_project=lambda p, u: True)
    )

    response = client.patch("/projects/project-1", json={"status": "Done Maybe"})

    assert response.status_code == 422


def test_update_project_rejects_null_status():
    fetch_events, fetch_tasks, update = _minimal_fetchers()

    client = TestClient(
        create_app(fetch_events, fetch_tasks, update, update_project=lambda p, u: True)
    )

    response = client.patch("/projects/project-1", json={"status": None})

    assert response.status_code == 422
    assert "cannot be cleared" in str(response.json()["detail"])


def test_update_project_unconfigured_answers_501():
    fetch_events, fetch_tasks, update = _minimal_fetchers()

    client = TestClient(create_app(fetch_events, fetch_tasks, update))

    response = client.patch("/projects/project-1", json={"name": "Renamed"})

    assert response.status_code == 501
    assert "not configured" in response.json()["detail"]


def test_update_project_maps_notion_failures_to_502():
    fetch_events, fetch_tasks, update = _minimal_fetchers()

    def update_project(project_id, update):
        notion_response = Response()
        notion_response.status_code = 400
        raise HTTPError(response=notion_response)

    client = TestClient(
        create_app(fetch_events, fetch_tasks, update, update_project=update_project)
    )

    response = client.patch("/projects/project-1", json={"name": "Renamed"})

    assert response.status_code == 502
    assert "project properties" in response.json()["detail"]


def test_create_project_reports_partial_goal_link_failure():
    """A goal-side link failure after the page was created returns the
    created id with a goal_link_error, not a duplicate-inviting 502."""
    from life_os.integrations.notion_projects import GoalLinkError

    fetch_events, fetch_tasks, update = _minimal_fetchers()

    def create(request):
        raise GoalLinkError("new-project-1", "Notion unavailable")

    client = TestClient(
        create_app(fetch_events, fetch_tasks, update, create_project=create)
    )

    response = client.post("/projects", json={"name": "Project", "goal_id": "goal-1"})

    assert response.status_code == 201
    body = response.json()
    assert body["id"] == "new-project-1"
    assert body["created"] is True
    assert "goal_link_error" in body


def test_create_project_without_goal_never_reports_goal_link_error():
    fetch_events, fetch_tasks, update = _minimal_fetchers()

    def create(request):
        return {"id": "new-project-1", "properties": {}}

    client = TestClient(
        create_app(fetch_events, fetch_tasks, update, create_project=create)
    )

    response = client.post("/projects", json={"name": "Project"})

    assert response.status_code == 201
    assert "goal_link_error" not in response.json()


def test_update_project_reports_partial_goal_sync_failure():
    """A goal-side sync failure after the PATCH landed returns updated with
    a goal_link_error; the sync repairs idempotently against
    previous_goal_id so a retry is safe."""
    from life_os.integrations.notion_projects import GoalLinkError

    fetch_events, fetch_tasks, update = _minimal_fetchers()

    def update_project(project_id, update):
        raise GoalLinkError(project_id, "Notion unavailable")

    client = TestClient(
        create_app(fetch_events, fetch_tasks, update, update_project=update_project)
    )

    response = client.patch(
        "/projects/project-1",
        json={"goal_id": "goal-2", "previous_goal_id": "goal-1"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["updated"] is True
    assert "goal_link_error" in body


def test_update_project_passes_previous_goal_id_to_domain():
    updates: list[ProjectUpdate] = []
    fetch_events, fetch_tasks, update = _minimal_fetchers()

    def update_project(project_id: str, update: ProjectUpdate):
        updates.append(update)
        return True

    client = TestClient(
        create_app(fetch_events, fetch_tasks, update, update_project=update_project)
    )

    response = client.patch(
        "/projects/project-1",
        json={"goal_id": "goal-2", "previous_goal_id": "goal-1"},
    )

    assert response.status_code == 200
    assert updates[0].goal_id == "goal-2"
    assert updates[0].previous_goal_id == "goal-1"
