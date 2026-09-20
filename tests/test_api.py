from datetime import date

from fastapi.testclient import TestClient
from requests import HTTPError, Response

from life_os.api import create_app
from life_os.models.notion import Task, TaskCreate, TaskFetchResult


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
    calls: list[tuple[str, bool]] = []

    def fetch_events(day):
        return []

    def fetch_tasks(day):
        return []

    def set_done(task_id: str, done: bool):
        calls.append((task_id, done))
        return True

    client = TestClient(create_app(fetch_events, fetch_tasks, set_done))

    response = client.patch("/tasks/task-123", json={"done": True})

    assert response.status_code == 200
    assert response.json() == {"task": "task-123", "done": True}
    assert calls == [("task-123", True)]


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
            "Notion refused task creation. Enable Insert content for the "
            "Life OS connection and try again."
        )
    }
