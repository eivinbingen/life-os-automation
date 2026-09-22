from datetime import date

from fastapi.testclient import TestClient
from requests import HTTPError, Response

from life_os.api import create_app
from life_os.models.notion import (
    UNSET,
    Task,
    TaskCreate,
    TaskFetchResult,
    TaskUpdate,
)


def test_today_includes_normalized_project_name():
    def fetch_events(day):
        return []

    def fetch_tasks(day):
        return TaskFetchResult(
            tasks=[
                Task(
                    id="task-123",
                    name="Plan the week",
                    scheduled=day,
                    project_id="project-456",
                    project_name="Life OS",
                )
            ]
        )

    def set_done(task_id: str, done: bool):
        return True

    client = TestClient(create_app(fetch_events, fetch_tasks, set_done))

    response = client.get("/today", params={"day": date(2026, 9, 19).isoformat()})

    assert response.status_code == 200
    assert response.json()["scheduled_tasks"][0]["project_name"] == "Life OS"


def test_update_task_sets_done_status():
    calls: list[tuple[str, TaskUpdate, bool | None]] = []

    def fetch_events(day):
        return []

    def fetch_tasks(day):
        return []

    def update(task_id: str, update: TaskUpdate, done: bool | None):
        calls.append((task_id, update, done))
        return True

    client = TestClient(create_app(fetch_events, fetch_tasks, update))

    response = client.patch("/tasks/task-123", json={"done": True})

    assert response.status_code == 200
    assert response.json() == {"task": "task-123", "updated": True}
    assert calls == [("task-123", TaskUpdate(), True)]


def test_create_task_maps_request_and_returns_task():
    created = []

    def fetch_events(day):
        return []

    def fetch_tasks(day):
        return []

    def set_done(task_id, done):
        return True

    def create(request):
        created.append(request)
        return Task(
            id="new-task-1",
            name=request.name,
            done=False,
            scheduled=request.scheduled,
            due=request.due,
        )

    client = TestClient(create_app(fetch_events, fetch_tasks, set_done, create))

    response = client.post(
        "/tasks",
        json={"name": "  Buy oat milk  ", "scheduled": "2026-09-20"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "id": "new-task-1",
        "name": "Buy oat milk",
        "done": False,
        "scheduled": "2026-09-20",
        "due": None,
        "project_id": None,
        "project_name": None,
    }
    assert created == [
        TaskCreate(name="Buy oat milk", scheduled=date(2026, 9, 20))
    ]


def test_create_task_rejects_blank_name():
    def fetch_events(day):
        return []

    def fetch_tasks(day):
        return []

    def set_done(task_id, done):
        return True

    def create(request):
        return Task(id="new-task-1", name=request.name)

    client = TestClient(create_app(fetch_events, fetch_tasks, set_done, create))

    response = client.post("/tasks", json={"name": "   "})

    assert response.status_code == 422


def test_create_task_explains_missing_notion_insert_capability():
    def fetch_events(day):
        return []

    def fetch_tasks(day):
        return []

    def set_done(task_id, done):
        return True

    def create(request):
        notion_response = Response()
        notion_response.status_code = 403
        raise HTTPError(response=notion_response)

    client = TestClient(create_app(fetch_events, fetch_tasks, set_done, create))

    response = client.post("/tasks", json={"name": "Buy oat milk"})

    assert response.status_code == 502
    assert response.json() == {
        "detail": (
            "Notion refused to create. Enable the required content "
            "capabilities for the Life OS connection and try again."
        )
    }


def test_update_task_builds_narrow_domain_update(monkeypatch):
    """Omitted keys stay UNSET, explicit nulls clear, done passes through."""
    updates: list[tuple[str, TaskUpdate, bool | None]] = []

    def fetch_events(day):
        return []

    def fetch_tasks(day):
        return []

    def update(task_id: str, update: TaskUpdate, done: bool | None):
        updates.append((task_id, update, done))
        return True

    client = TestClient(create_app(fetch_events, fetch_tasks, update))

    # Reschedule only: name and due must be untouched.
    response = client.patch("/tasks/task-1", json={"scheduled": "2026-09-25"})
    assert response.status_code == 200
    assert response.json() == {"task": "task-1", "updated": True}

    # Clear the due date explicitly.
    response = client.patch("/tasks/task-1", json={"due": None})
    assert response.status_code == 200

    # Complete the task through the checkbox path.
    response = client.patch("/tasks/task-1", json={"done": True})
    assert response.status_code == 200

    assert updates == [
        ("task-1", TaskUpdate(scheduled=date(2026, 9, 25)), None),
        ("task-1", TaskUpdate(due=None), None),
        ("task-1", TaskUpdate(), True),
    ]
    # The reschedule update leaves name and due as the untouched sentinel.
    assert updates[0][1].name is UNSET
    assert updates[0][1].due is UNSET


def test_update_task_rejects_blank_name():
    def fetch_events(day):
        return []

    def fetch_tasks(day):
        return []

    def update(task_id, update, done):
        return True

    client = TestClient(create_app(fetch_events, fetch_tasks, update))

    response = client.patch("/tasks/task-1", json={"name": "   "})

    assert response.status_code == 422


def test_update_task_rejects_null_name():
    """An explicit null name is rejected, not written as an empty title."""

    def fetch_events(day):
        return []

    def fetch_tasks(day):
        return []

    def update(task_id, update, done):
        return True

    client = TestClient(create_app(fetch_events, fetch_tasks, update))

    response = client.patch("/tasks/task-1", json={"name": None})

    assert response.status_code == 422


def test_update_task_rejects_null_done():
    """An explicit null done is rejected instead of silently dropped."""

    def fetch_events(day):
        return []

    def fetch_tasks(day):
        return []

    def update(task_id, update, done):
        return True

    client = TestClient(create_app(fetch_events, fetch_tasks, update))

    response = client.patch("/tasks/task-1", json={"done": None})

    assert response.status_code == 422


def test_update_task_rejects_mixed_payload_with_null_done():
    """A mixed payload carrying done:null must not drop the done edit."""

    def fetch_events(day):
        return []

    def fetch_tasks(day):
        return []

    def update(task_id, update, done):
        return True

    client = TestClient(create_app(fetch_events, fetch_tasks, update))

    response = client.patch(
        "/tasks/task-1", json={"done": None, "scheduled": "2026-09-25"}
    )

    assert response.status_code == 422


def test_update_task_rejects_empty_payload():
    def fetch_events(day):
        return []

    def fetch_tasks(day):
        return []

    def update(task_id, update, done):
        return True

    client = TestClient(create_app(fetch_events, fetch_tasks, update))

    response = client.patch("/tasks/task-1", json={})

    assert response.status_code == 422


def test_update_task_maps_notion_failures_to_502():
    def fetch_events(day):
        return []

    def fetch_tasks(day):
        return []

    def update(task_id, update, done):
        notion_response = Response()
        notion_response.status_code = 403
        raise HTTPError(response=notion_response)

    client = TestClient(create_app(fetch_events, fetch_tasks, update))

    response = client.patch("/tasks/task-1", json={"name": "New name"})

    assert response.status_code == 502
    assert "Notion refused to update" in response.json()["detail"]
