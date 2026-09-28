from requests import RequestException

from life_os.integrations import notion_goals


class FakeResponse:
    def __init__(self, data, error: RequestException | None = None):
        self.data = data
        self.error = error

    def raise_for_status(self):
        if self.error:
            raise self.error

    def json(self):
        return self.data


def goal_page(goal_id: str, status: str = "Active"):
    return {
        "id": goal_id,
        "properties": {
            "Name": {"type": "title", "title": [{"plain_text": f"Goal {goal_id}"}]},
            "Status": {"type": "status", "status": {"name": status}},
        },
    }


def project_page(project_id: str):
    return {
        "id": project_id,
        "properties": {
            "Name": {"type": "title", "title": [{"plain_text": f"Project {project_id}"}]},
        },
    }


def test_fetch_active_goals_filters_status_active(monkeypatch):
    bodies = []

    def post(**kwargs):
        bodies.append(kwargs["json"])
        # The fake applies Notion's filter server-side: only the active goal.
        return FakeResponse({"results": [goal_page("g1")], "has_more": False})

    monkeypatch.setattr(notion_goals.requests, "post", post)

    goals = notion_goals.fetch_active_goals(token="secret", data_source_id="goals", page_size=100)

    assert bodies[0]["filter"] == {"property": "Status", "status": {"equals": "Active"}}
    assert [goal.id for goal in goals] == ["g1"]
    assert goals[0].name == "Goal g1"


def test_fetch_active_goals_paginates(monkeypatch):
    pages = [
        FakeResponse({"results": [goal_page("g1")], "has_more": True, "next_cursor": "c2"}),
        FakeResponse({"results": [goal_page("g2")], "has_more": False}),
    ]
    calls = []

    def post(**kwargs):
        calls.append(kwargs)
        return pages[len(calls) - 1]

    monkeypatch.setattr(notion_goals.requests, "post", post)

    goals = notion_goals.fetch_active_goals(token="secret", data_source_id="goals", page_size=1)

    assert [goal.id for goal in goals] == ["g1", "g2"]
    assert calls[1]["json"]["start_cursor"] == "c2"


def test_fetch_goal_returns_raw_page(monkeypatch):
    monkeypatch.setattr(
        notion_goals.requests, "get",
        lambda **kwargs: FakeResponse(goal_page("g1")),
    )

    page = notion_goals.fetch_goal(token="secret", goal_id="g1")

    assert page["id"] == "g1"


def test_fetch_goal_failure_raises(monkeypatch):
    monkeypatch.setattr(
        notion_goals.requests, "get",
        lambda **kwargs: FakeResponse({}, error=RequestException("Notion unavailable")),
    )
    try:
        notion_goals.fetch_goal(token="secret", goal_id="g1")
    except RequestException:
        pass
    else:
        raise AssertionError("expected RequestException")


def test_fetch_projects_for_goal_filters_by_relation(monkeypatch):
    bodies = []

    def post(**kwargs):
        bodies.append(kwargs["json"])
        return FakeResponse(
            {
                "results": [project_page("p1"), project_page("p2")],
                "has_more": False,
            }
        )

    monkeypatch.setattr(notion_goals.requests, "post", post)

    projects = notion_goals.fetch_projects_for_goal(
        token="secret", projects_data_source_id="projects", goal_id="g1", page_size=100
    )

    assert bodies[0]["filter"] == {"property": "Goal", "relation": {"contains": "g1"}}
    assert [project.id for project in projects] == ["p1", "p2"]
    assert projects[0].name == "Project p1"


def test_fetch_projects_for_goal_paginates(monkeypatch):
    pages = [
        FakeResponse({"results": [project_page("p1")], "has_more": True, "next_cursor": "c2"}),
        FakeResponse({"results": [project_page("p2")], "has_more": False}),
    ]
    calls = []

    def post(**kwargs):
        calls.append(kwargs)
        return pages[len(calls) - 1]

    monkeypatch.setattr(notion_goals.requests, "post", post)

    projects = notion_goals.fetch_projects_for_goal(
        token="secret", projects_data_source_id="projects", goal_id="g1", page_size=1
    )

    assert [project.id for project in projects] == ["p1", "p2"]
    assert calls[1]["json"]["start_cursor"] == "c2"
