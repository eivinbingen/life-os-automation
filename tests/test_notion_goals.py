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


def goal_page(goal_id: str, status: str = "Active", project_ids: list[str] | None = None):
    relations = [{"id": pid} for pid in (project_ids or [])]
    return {
        "id": goal_id,
        "properties": {
            "Name": {"type": "title", "title": [{"plain_text": f"Goal {goal_id}"}]},
            "Status": {"type": "status", "status": {"name": status}},
            "Projects": {"type": "relation", "relation": relations},
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


def test_fetch_projects_by_ids_resolves_each_name(monkeypatch):
    responses = {
        "p1": FakeResponse(
            {"properties": {"Name": {"type": "title", "title": [{"plain_text": "Life OS"}]}}}
        ),
        "p2": FakeResponse(
            {"properties": {"Name": {"type": "title", "title": [{"plain_text": "Onboarding"}]}}}
        ),
    }
    requested = []

    def get(**kwargs):
        requested.append(kwargs["url"])
        return responses[kwargs["url"].rsplit("/", 1)[1]]

    monkeypatch.setattr(notion_goals.requests, "get", get)

    projects, warnings = notion_goals.fetch_projects_by_ids("secret", ["p1", "p2"])

    assert [(p.id, p.name) for p in projects] == [("p1", "Life OS"), ("p2", "Onboarding")]
    assert warnings == []
    assert len(requested) == 2


def test_fetch_projects_by_ids_failed_lookup_keeps_nameless_reference(monkeypatch):
    responses = {
        "p1": FakeResponse(
            {"properties": {"Name": {"type": "title", "title": [{"plain_text": "Life OS"}]}}}
        ),
    }

    def get(**kwargs):
        missing = FakeResponse({}, error=RequestException("down"))
        return responses.get(kwargs["url"].rsplit("/", 1)[1], missing)

    monkeypatch.setattr(notion_goals.requests, "get", get)

    projects, warnings = notion_goals.fetch_projects_by_ids("secret", ["p1", "missing"])

    # A failed lookup never drops the project.
    assert [(p.id, p.name) for p in projects] == [("p1", "Life OS"), ("missing", None)]
    assert warnings == ["Could not load names for 1 linked project."]
