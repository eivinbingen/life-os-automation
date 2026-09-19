from fastapi.testclient import TestClient

from life_os.api import create_app


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
