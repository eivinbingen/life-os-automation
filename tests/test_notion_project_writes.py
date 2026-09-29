from datetime import date

from requests import RequestException

from life_os.integrations import notion_projects
from life_os.models.project import ProjectCreate, ProjectUpdate


class FakeResponse:
    def __init__(self, data, error: RequestException | None = None):
        self.data = data
        self.error = error

    def raise_for_status(self):
        if self.error:
            raise self.error

    def json(self):
        return self.data


def test_create_project_writes_only_creation_properties(monkeypatch):
    created_requests = []
    patch_requests = []

    def post(**kwargs):
        created_requests.append(kwargs)
        return FakeResponse({"id": "new-project-1", "properties": {}})

    def patch(**kwargs):
        patch_requests.append(kwargs)
        return FakeResponse({"id": "goal-1", "properties": {}})

    def get(**kwargs):
        return FakeResponse({"properties": {"Projects": {"type": "relation", "relation": []}}})

    monkeypatch.setattr(notion_projects.requests, "post", post)
    monkeypatch.setattr(notion_projects.requests, "patch", patch)
    monkeypatch.setattr(notion_projects.requests, "get", get)

    notion_projects.create_project(
        token="secret",
        data_source_id="projects",
        project=ProjectCreate(
            name="Life OS", goal_id="goal-1", deadline=date(2026, 12, 31)
        ),
    )

    assert len(created_requests) == 1
    body = created_requests[0]["json"]
    assert body["parent"] == {"data_source_id": "projects", "type": "data_source_id"}
    assert body["properties"]["Name"] == {"title": [{"text": {"content": "Life OS"}}]}
    assert body["properties"]["Goal"] == {"relation": [{"id": "goal-1"}]}
    assert body["properties"]["Deadline"] == {"date": {"start": "2026-12-31"}}
    # Status defaults to Planned in the schema; it is not written.
    assert "Status" not in body["properties"]
    # The goal side is synced: the new project is appended to the goal's
    # Projects relation so it is visible on the goal page (the two relation
    # sides do not auto-sync).
    assert patch_requests[-1]["json"]["properties"]["Projects"] == {
        "relation": [{"id": "new-project-1"}]
    }


def test_create_project_without_goal_makes_one_write(monkeypatch):
    created_requests = []
    patch_requests = []

    def post(**kwargs):
        created_requests.append(kwargs)
        return FakeResponse({"id": "new-project-1", "properties": {}})

    def patch(**kwargs):
        patch_requests.append(kwargs)
        return FakeResponse({"id": "goal-1", "properties": {}})

    monkeypatch.setattr(notion_projects.requests, "post", post)
    monkeypatch.setattr(notion_projects.requests, "patch", patch)

    notion_projects.create_project(
        token="secret",
        data_source_id="projects",
        project=ProjectCreate(name="Someday project"),
    )

    assert len(created_requests) == 1
    # No goal link: no goal-side write.
    assert patch_requests == []


def test_create_project_with_explicit_status_writes_it(monkeypatch):
    created_requests = []

    def post(**kwargs):
        created_requests.append(kwargs)
        return FakeResponse({"id": "new-project-1", "properties": {}})

    def get(**kwargs):
        return FakeResponse({"properties": {"Projects": {"type": "relation", "relation": []}}})

    monkeypatch.setattr(notion_projects.requests, "post", post)
    monkeypatch.setattr(notion_projects.requests, "get", get)

    notion_projects.create_project(
        token="secret",
        data_source_id="projects",
        project=ProjectCreate(name="Life OS", status="Active"),
    )

    body = created_requests[0]["json"]["properties"]
    assert body["Status"] == {"status": {"name": "Active"}}


def test_update_project_sends_only_set_fields(monkeypatch):
    patch_requests = []
    get_requests = []

    def patch(**kwargs):
        patch_requests.append(kwargs)
        return FakeResponse({"id": "project-1", "properties": {}})

    def get(**kwargs):
        get_requests.append(kwargs)
        return FakeResponse({"properties": {}})

    monkeypatch.setattr(notion_projects.requests, "patch", patch)
    monkeypatch.setattr(notion_projects.requests, "get", get)

    # Status-only: a status edit leaves every other field alone and never
    # cascades to the project's tasks.
    assert notion_projects.update_project(
        token="secret", project_id="project-1", update=ProjectUpdate(status="Dropped")
    )

    body = patch_requests[0]["json"]["properties"]
    assert body == {"Status": {"status": {"name": "Dropped"}}}
    # No goal-link edit: no page reads and no goal-side writes.
    assert get_requests == []
    assert len(patch_requests) == 1


def test_update_project_preserves_untouched_fields_and_clears_explicit_nulls(monkeypatch):
    patch_requests = []

    def patch(**kwargs):
        patch_requests.append(kwargs)
        return FakeResponse({"id": "project-1", "properties": {}})

    def get(**kwargs):
        return FakeResponse({"properties": {"Goal": {"type": "relation", "relation": []}}})

    monkeypatch.setattr(notion_projects.requests, "patch", patch)
    monkeypatch.setattr(notion_projects.requests, "get", get)

    assert notion_projects.update_project(
        token="secret",
        project_id="project-1",
        update=ProjectUpdate(name="Renamed project", goal_id=None, deadline=None),
    )

    body = patch_requests[0]["json"]["properties"]
    assert body["Name"] == {"title": [{"text": {"content": "Renamed project"}}]}
    assert body["Goal"] == {"relation": []}
    assert body["Deadline"] == {"date": None}


def test_update_project_goal_change_syncs_both_sides(monkeypatch):
    """The previous goal loses the project from its Projects relation and
    the new goal gains it — the two relation sides do not auto-sync."""

    patch_requests = []

    def patch(**kwargs):
        patch_requests.append(kwargs)
        return FakeResponse({"id": "project-1", "properties": {}})

    pages = {
        "project-1": {
            "properties": {"Goal": {"type": "relation", "relation": [{"id": "goal-old"}]}}
        },
        "goal-old": {
            "properties": {
                "Projects": {
                    "type": "relation",
                    "relation": [{"id": "project-1"}, {"id": "other"}],
                }
            }
        },
        "goal-new": {"properties": {"Projects": {"type": "relation", "relation": []}}},
    }

    def get(**kwargs):
        page_id = kwargs["url"].rsplit("/", 1)[-1]
        return FakeResponse(pages[page_id])

    monkeypatch.setattr(notion_projects.requests, "patch", patch)
    monkeypatch.setattr(notion_projects.requests, "get", get)

    assert notion_projects.update_project(
        token="secret", project_id="project-1", update=ProjectUpdate(goal_id="goal-new")
    )

    writes = [
        req["json"]["properties"]["Projects"]
        for req in patch_requests
        if "Projects" in req["json"]["properties"]
    ]
    # The old goal keeps its other linked project but loses this one.
    assert {"relation": [{"id": "other"}]} in writes
    # The new goal gains the project.
    assert {"relation": [{"id": "project-1"}]} in writes


def test_update_project_failure_raises(monkeypatch):
    def patch(**kwargs):
        return FakeResponse({}, error=RequestException("Notion unavailable"))

    monkeypatch.setattr(notion_projects.requests, "patch", patch)

    try:
        notion_projects.update_project(
            token="secret", project_id="project-1", update=ProjectUpdate(status="Active")
        )
    except RequestException:
        pass
    else:
        raise AssertionError("expected RequestException")


def test_update_project_retry_after_partial_sync_repairs(monkeypatch):
    """A retry after a partial sync failure still repairs: the sync keys
    off previous_goal_id (the editor's view), not the live page state —
    so the already-applied PATCH does not make it skip the repair."""

    patch_requests = []

    def patch(**kwargs):
        patch_requests.append(kwargs)
        return FakeResponse({"id": "project-1", "properties": {}})

    # The project page already points at goal-new (the PATCH landed last
    # time); goal-old still lists the project, goal-new does not.
    pages = {
        "project-1": {
            "properties": {"Goal": {"type": "relation", "relation": [{"id": "goal-new"}]}}
        },
        "goal-old": {
            "properties": {
                "Projects": {
                    "type": "relation",
                    "relation": [{"id": "project-1"}, {"id": "other"}],
                }
            }
        },
        "goal-new": {"properties": {"Projects": {"type": "relation", "relation": []}}},
    }

    def get(**kwargs):
        page_id = kwargs["url"].rsplit("/", 1)[-1]
        return FakeResponse(pages[page_id])

    monkeypatch.setattr(notion_projects.requests, "patch", patch)
    monkeypatch.setattr(notion_projects.requests, "get", get)

    assert notion_projects.update_project(
        token="secret",
        project_id="project-1",
        update=ProjectUpdate(goal_id="goal-new", previous_goal_id="goal-old"),
    )

    writes = [
        req["json"]["properties"]["Projects"]
        for req in patch_requests
        if "Projects" in req["json"]["properties"]
    ]
    # The stale entry on the old goal is removed and the new goal gains
    # the project, even though the live page already pointed at goal-new.
    assert {"relation": [{"id": "other"}]} in writes
    assert {"relation": [{"id": "project-1"}]} in writes


def test_update_project_fully_applied_sync_is_noop(monkeypatch):
    """A retry where the sync already landed writes nothing: both sides
    already reflect the desired state."""

    patch_requests = []

    def patch(**kwargs):
        patch_requests.append(kwargs)
        return FakeResponse({"id": "project-1", "properties": {}})

    pages = {
        "project-1": {
            "properties": {"Goal": {"type": "relation", "relation": [{"id": "goal-new"}]}}
        },
        "goal-old": {"properties": {"Projects": {"type": "relation", "relation": []}}},
        "goal-new": {
            "properties": {"Projects": {"type": "relation", "relation": [{"id": "project-1"}]}}
        },
    }

    def get(**kwargs):
        page_id = kwargs["url"].rsplit("/", 1)[-1]
        return FakeResponse(pages[page_id])

    monkeypatch.setattr(notion_projects.requests, "patch", patch)
    monkeypatch.setattr(notion_projects.requests, "get", get)

    assert notion_projects.update_project(
        token="secret",
        project_id="project-1",
        update=ProjectUpdate(goal_id="goal-new", previous_goal_id="goal-old"),
    )

    writes = [
        req["json"]["properties"]["Projects"]
        for req in patch_requests
        if "Projects" in req["json"]["properties"]
    ]
    # The membership checks make the repair a no-op on both sides.
    assert writes == []


def test_create_project_goal_link_failure_raises_goal_link_error(monkeypatch):
    """The page was created but the goal-side link failed: GoalLinkError
    carries the created id so the caller never invites a re-create."""

    def post(**kwargs):
        return FakeResponse({"id": "new-project-1", "properties": {}})

    def get(**kwargs):
        return FakeResponse({}, error=RequestException("Notion unavailable"))

    monkeypatch.setattr(notion_projects.requests, "post", post)
    monkeypatch.setattr(notion_projects.requests, "get", get)

    try:
        notion_projects.create_project(
            token="secret",
            data_source_id="projects",
            project=ProjectCreate(name="Life OS", goal_id="goal-1"),
        )
    except notion_projects.GoalLinkError as error:
        assert error.project_id == "new-project-1"
    else:
        raise AssertionError("expected GoalLinkError")
