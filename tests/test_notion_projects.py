
from requests import RequestException

from life_os.integrations import notion_projects


class FakeResponse:
    def __init__(self, data, error: RequestException | None = None):
        self.data = data
        self.error = error

    def raise_for_status(self):
        if self.error:
            raise self.error

    def json(self):
        return self.data


def notion_task(task_id: str, done: bool = False, scheduled: str | None = "2026-09-19"):
    return {
        "id": task_id,
        "properties": {
            "Name": {"title": [{"plain_text": f"Task {task_id}"}]},
            "Done": {"checkbox": done},
            "Scheduled": {"date": {"start": scheduled} if scheduled else None},
            "Due": {"date": None},
            "Project": {"relation": [{"id": "project-1"}]},
        },
    }


def project_page(status: str | None = "Active", goal_id: str | None = "goal-1"):
    return {
        "id": "project-1",
        "properties": {
            "Name": {"type": "title", "title": [{"plain_text": "Life OS"}]},
            "Status": {"type": "status", "status": {"name": status}},
            "Goal": {"type": "relation", "relation": [{"id": goal_id}] if goal_id else []},
            "Deadline": {"type": "date", "date": {"start": "2026-10-19"}},
        },
    }


def test_fetch_tasks_for_project_filters_by_relation_and_done(monkeypatch):
    bodies = []

    def post(**kwargs):
        bodies.append(kwargs["json"])
        # The fake applies Notion's filter server-side: only the incomplete
        # task comes back.
        return FakeResponse(
            {"results": [notion_task("one")], "has_more": False}
        )

    monkeypatch.setattr(notion_projects.requests, "post", post)

    result = notion_projects.fetch_tasks_for_project(
        token="secret", tasks_data_source_id="tasks", project_id="project-1", page_size=100
    )

    query_filter = bodies[0]["filter"]
    assert {"property": "Done", "checkbox": {"equals": False}} in query_filter["and"]
    assert {"property": "Project", "relation": {"contains": "project-1"}} in query_filter["and"]
    # The viewed project's name is not looked up per task.
    assert [task.id for task in result.tasks] == ["one"]
    assert result.tasks[0].project_id == "project-1"
    assert result.warnings == []


def test_fetch_tasks_for_project_paginates(monkeypatch):
    pages = [
        FakeResponse({"results": [notion_task("one")], "has_more": True, "next_cursor": "c2"}),
        FakeResponse({"results": [notion_task("two")], "has_more": False}),
    ]
    calls = []

    def post(**kwargs):
        calls.append(kwargs)
        return pages[len(calls) - 1]

    monkeypatch.setattr(notion_projects.requests, "post", post)

    result = notion_projects.fetch_tasks_for_project(
        token="secret", tasks_data_source_id="tasks", project_id="project-1", page_size=1
    )

    assert [task.id for task in result.tasks] == ["one", "two"]
    assert calls[1]["json"]["start_cursor"] == "c2"


def test_fetch_tasks_for_project_failure_raises(monkeypatch):
    monkeypatch.setattr(
        notion_projects.requests, "post",
        lambda **kwargs: FakeResponse({}, error=RequestException("Notion unavailable")),
    )
    try:
        notion_projects.fetch_tasks_for_project(
            token="secret", tasks_data_source_id="tasks", project_id="project-1", page_size=100
        )
    except RequestException:
        pass
    else:
        raise AssertionError("expected RequestException")
