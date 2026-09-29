from datetime import date

from requests import RequestException

from life_os.integrations import notion_goals
from life_os.models.goal import GoalCreate, GoalUpdate


class FakeResponse:
    def __init__(self, data, error: RequestException | None = None):
        self.data = data
        self.error = error

    def raise_for_status(self):
        if self.error:
            raise self.error

    def json(self):
        return self.data


def test_create_goal_writes_only_creation_properties(monkeypatch):
    created_requests = []

    def post(**kwargs):
        created_requests.append(kwargs)
        return FakeResponse({"id": "new-goal-1", "properties": {}})

    monkeypatch.setattr(notion_goals.requests, "post", post)

    notion_goals.create_goal(
        token="secret",
        data_source_id="goals",
        goal=GoalCreate(name="Ship the app", area_id="area-1", target_date=date(2026, 12, 31)),
    )

    assert len(created_requests) == 1
    body = created_requests[0]["json"]
    assert body["parent"] == {"data_source_id": "goals", "type": "data_source_id"}
    assert body["properties"]["Name"] == {"title": [{"text": {"content": "Ship the app"}}]}
    assert body["properties"]["Area"] == {"relation": [{"id": "area-1"}]}
    assert body["properties"]["Target Date"] == {"date": {"start": "2026-12-31"}}
    # Status defaults to Not Started in the schema; it is not written.
    assert "Status" not in body["properties"]


def test_create_goal_with_explicit_status_writes_it(monkeypatch):
    created_requests = []

    def post(**kwargs):
        created_requests.append(kwargs)
        return FakeResponse({"id": "new-goal-1", "properties": {}})

    monkeypatch.setattr(notion_goals.requests, "post", post)

    notion_goals.create_goal(
        token="secret",
        data_source_id="goals",
        goal=GoalCreate(name="Ship the app", status="Active"),
    )

    body = created_requests[0]["json"]["properties"]
    assert body["Status"] == {"status": {"name": "Active"}}


def test_update_goal_sends_only_set_fields(monkeypatch):
    patch_requests = []

    def patch(**kwargs):
        patch_requests.append(kwargs)
        return FakeResponse({"id": "goal-1", "properties": {}})

    monkeypatch.setattr(notion_goals.requests, "patch", patch)

    # Status-only: the Complete Goal path leaves every other field alone.
    assert notion_goals.update_goal(
        token="secret", goal_id="goal-1", update=GoalUpdate(status="Done")
    )

    body = patch_requests[0]["json"]["properties"]
    assert body == {"Status": {"status": {"name": "Done"}}}


def test_update_goal_preserves_untouched_fields_and_clears_explicit_nulls(monkeypatch):
    patch_requests = []

    def patch(**kwargs):
        patch_requests.append(kwargs)
        return FakeResponse({"id": "goal-1", "properties": {}})

    monkeypatch.setattr(notion_goals.requests, "patch", patch)

    assert notion_goals.update_goal(
        token="secret",
        goal_id="goal-1",
        update=GoalUpdate(name="Renamed goal", area_id=None, target_date=None),
    )

    body = patch_requests[0]["json"]["properties"]
    assert body["Name"] == {"title": [{"text": {"content": "Renamed goal"}}]}
    assert body["Area"] == {"relation": []}
    assert body["Target Date"] == {"date": None}


def test_update_goal_failure_raises(monkeypatch):
    def patch(**kwargs):
        return FakeResponse({}, error=RequestException("Notion unavailable"))

    monkeypatch.setattr(notion_goals.requests, "patch", patch)

    try:
        notion_goals.update_goal(token="secret", goal_id="goal-1", update=GoalUpdate(status="Done"))
    except RequestException:
        pass
    else:
        raise AssertionError("expected RequestException")
