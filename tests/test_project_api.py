from datetime import date

from fastapi.testclient import TestClient

from life_os.api import create_app
from life_os.models.notion import Task
from life_os.models.project import ProjectDetail


def _minimal_fetchers():
    def fetch_events(day):
        return []

    def fetch_tasks(day):
        return []

    def update(task_id, update, done):
        return True

    return fetch_events, fetch_tasks, update


def _detail(**overrides) -> ProjectDetail:
    base = dict(
        id="project-1",
        name="Life OS",
        status="Active",
        status_available=True,
        goal_id="goal-1",
        goal_name="Ship the app",
        deadline="2026-10-19",
        tasks=[Task(id="task-1", name="Plan the week", scheduled=date(2026, 9, 28))],
        statuses=[],
        warnings=[],
    )
    base.update(overrides)
    return ProjectDetail(**base)


def test_project_endpoint_returns_normalized_detail():
    fetch_events, fetch_tasks, update = _minimal_fetchers()

    client = TestClient(
        create_app(fetch_events, fetch_tasks, update, fetch_project_detail=lambda pid: _detail())
    )

    response = client.get("/projects/project-1")

    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Life OS"
    assert body["status"] == "Active"
    assert body["status_available"] is True
    assert body["goal_id"] == "goal-1"
    assert body["goal_name"] == "Ship the app"
    assert body["deadline"] == "2026-10-19"
    assert body["tasks"][0]["name"] == "Plan the week"
    assert body["statuses"] == []


def test_project_endpoint_unconfigured_answers_501():
    """The read route always registers (alongside the unconditional write
    routes): without the callable it answers 501 "not configured"."""

    fetch_events, fetch_tasks, update = _minimal_fetchers()

    client = TestClient(create_app(fetch_events, fetch_tasks, update))

    response = client.get("/projects/project-1")

    assert response.status_code == 501
    assert "not configured" in response.json()["detail"]


def test_project_endpoint_degrades_per_source():
    """A failed task fetch is a statuses entry, not a dropped project."""

    fetch_events, fetch_tasks, update = _minimal_fetchers()

    detail = _detail(
        tasks=[],
        statuses=[{"name": "Notion tasks", "ok": False, "error": "Notion unavailable"}],
        status_available=False,
        status=None,
    )
    client = TestClient(
        create_app(fetch_events, fetch_tasks, update, fetch_project_detail=lambda pid: detail)
    )

    response = client.get("/projects/project-1")

    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Life OS"
    assert body["status"] is None
    assert body["status_available"] is False
    assert body["tasks"] == []
    assert body["statuses"] == [
        {"name": "Notion tasks", "ok": False, "error": "Notion unavailable"}
    ]


def test_project_endpoint_reports_unexpected_failure_as_502():
    fetch_events, fetch_tasks, update = _minimal_fetchers()

    def fetch_detail(pid):
        raise RuntimeError("unexpected")

    client = TestClient(
        create_app(fetch_events, fetch_tasks, update, fetch_project_detail=fetch_detail)
    )

    response = client.get("/projects/project-1")

    assert response.status_code == 502
    assert "could not be read" in response.json()["detail"]
