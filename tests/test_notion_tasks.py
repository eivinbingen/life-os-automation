from datetime import date

from requests import RequestException

from life_os.integrations import notion_tasks
from life_os.models.notion import TaskCreate


class FakeResponse:
    def __init__(self, data, error: RequestException | None = None):
        self.data = data
        self.error = error

    def raise_for_status(self):
        if self.error:
            raise self.error

    def json(self):
        return self.data


def notion_task(task_id: str, project_id: str | None):
    relation = [{"id": project_id}] if project_id else []
    return {
        "id": task_id,
        "properties": {
            "Name": {"title": [{"plain_text": f"Task {task_id}"}]},
            "Done": {"checkbox": False},
            "Scheduled": {"date": {"start": "2026-09-19"}},
            "Due": {"date": None},
            "Project": {"relation": relation},
        },
    }


def test_fetch_tasks_resolves_each_project_once(monkeypatch):
    task_response = FakeResponse(
        {
            "results": [
                notion_task("one", "shared-project"),
                notion_task("two", "shared-project"),
                notion_task("three", None),
            ],
            "has_more": False,
            "next_cursor": None,
        }
    )
    project_response = FakeResponse(
        {
            "properties": {
                "Project name": {
                    "type": "title",
                    "title": [{"plain_text": "Life OS"}],
                }
            }
        }
    )
    project_requests = []

    monkeypatch.setattr(notion_tasks.requests, "post", lambda **kwargs: task_response)

    def get_project(**kwargs):
        project_requests.append(kwargs)
        return project_response

    monkeypatch.setattr(notion_tasks.requests, "get", get_project)

    result = notion_tasks.fetch_tasks_for_day(
        token="secret",
        data_source_id="tasks",
        day=date(2026, 9, 19),
        page_size=100,
    )

    assert [task.project_name for task in result.tasks] == ["Life OS", "Life OS", None]
    assert result.warnings == []
    assert len(project_requests) == 1


def test_project_lookup_failure_keeps_task(monkeypatch):
    task_response = FakeResponse(
        {
            "results": [notion_task("one", "unavailable-project")],
            "has_more": False,
            "next_cursor": None,
        }
    )
    project_response = FakeResponse({}, error=RequestException("Notion unavailable"))

    monkeypatch.setattr(notion_tasks.requests, "post", lambda **kwargs: task_response)
    monkeypatch.setattr(notion_tasks.requests, "get", lambda **kwargs: project_response)

    result = notion_tasks.fetch_tasks_for_day(
        token="secret",
        data_source_id="tasks",
        day=date(2026, 9, 19),
        page_size=100,
    )

    assert [task.name for task in result.tasks] == ["Task one"]
    assert result.tasks[0].project_name is None
    assert result.warnings == ["Could not load names for 1 project."]


def test_create_task_writes_only_capture_properties(monkeypatch):
    created_requests = []

    def post(**kwargs):
        created_requests.append(kwargs)
        return FakeResponse(
            {
                "id": "new-task-1",
                "properties": {
                    "Name": {"title": [{"plain_text": "Buy oat milk"}]},
                    "Done": {"checkbox": False},
                    "Scheduled": {"date": {"start": "2026-09-20"}},
                    "Due": {"date": None},
                    "Project": {"relation": []},
                },
            }
        )

    monkeypatch.setattr(notion_tasks.requests, "post", post)

    task = notion_tasks.create_task(
        token="secret",
        data_source_id="tasks",
        task=TaskCreate(name="Buy oat milk", scheduled=date(2026, 9, 20)),
    )

    assert task.id == "new-task-1"
    assert task.name == "Buy oat milk"
    assert task.done is False
    assert task.scheduled == date(2026, 9, 20)
    assert task.due is None

    assert len(created_requests) == 1
    body = created_requests[0]["json"]
    assert body["parent"] == {"data_source_id": "tasks", "type": "data_source_id"}
    assert body["properties"]["Name"] == {"title": [{"text": {"content": "Buy oat milk"}}]}
    assert body["properties"]["Done"] == {"checkbox": False}
    assert body["properties"]["Scheduled"] == {"date": {"start": "2026-09-20"}}
    # Dates capture does not set are omitted entirely, never sent as null.
    assert "Due" not in body["properties"]


def test_create_task_without_dates_sends_no_date_properties(monkeypatch):
    created_requests = []

    def post(**kwargs):
        created_requests.append(kwargs)
        return FakeResponse(
            {
                "id": "new-task-2",
                "properties": {
                    "Name": {"title": [{"plain_text": "Someday idea"}]},
                    "Done": {"checkbox": False},
                    "Scheduled": {"date": None},
                    "Due": {"date": None},
                    "Project": {"relation": []},
                },
            }
        )

    monkeypatch.setattr(notion_tasks.requests, "post", post)

    task = notion_tasks.create_task(
        token="secret",
        data_source_id="tasks",
        task=TaskCreate(name="Someday idea"),
    )

    assert task.name == "Someday idea"
    assert task.scheduled is None
    assert task.due is None

    body = created_requests[0]["json"]["properties"]
    assert "Scheduled" not in body
    assert "Due" not in body
