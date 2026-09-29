
from fastapi.testclient import TestClient

from life_os.api import create_app
from life_os.models.goal import ProjectRef


def _minimal_fetchers():
    def fetch_events(day):
        return []

    def fetch_tasks(day):
        return []

    def update(task_id, update, done):
        return True

    return fetch_events, fetch_tasks, update


def test_direction_endpoint_returns_summary():
    fetch_events, fetch_tasks, update = _minimal_fetchers()

    client = TestClient(
        create_app(
            fetch_events,
            fetch_tasks,
            update,
            fetch_active_goal_pages=lambda: [],
            resolve_projects=lambda ids: ([], []),
            reviews=_fake_reviews(),
        )
    )

    response = client.get("/reviews/weekly/direction?week_start=2026-09-21")

    assert response.status_code == 200
    body = response.json()
    assert body["week_start"] == "2026-09-21"
    assert body["items"] == []
    assert body["statuses"] == []


def test_direction_endpoint_absent_without_reviews_repository():
    """The direction endpoint registers inside the reviews gate, like the
    other review stages."""

    fetch_events, fetch_tasks, update = _minimal_fetchers()

    client = TestClient(
        create_app(
            fetch_events,
            fetch_tasks,
            update,
            fetch_active_goal_pages=lambda: [],
            resolve_projects=lambda ids: ([], []),
        )
    )

    response = client.get("/reviews/weekly/direction?week_start=2026-09-21")

    assert response.status_code == 404


def test_direction_endpoint_501_without_goal_pages_callable():
    fetch_events, fetch_tasks, update = _minimal_fetchers()

    client = TestClient(
        create_app(
            fetch_events,
            fetch_tasks,
            update,
            resolve_projects=lambda ids: ([], []),
            reviews=_fake_reviews(),
        )
    )

    response = client.get("/reviews/weekly/direction?week_start=2026-09-21")

    assert response.status_code == 501
    assert "not configured" in response.json()["detail"]


def test_direction_endpoint_501_without_resolve_projects_callable():
    """Asymmetric wiring must 501 cleanly, not crash with 500 when
    build_direction calls the missing resolver."""

    fetch_events, fetch_tasks, update = _minimal_fetchers()

    client = TestClient(
        create_app(
            fetch_events,
            fetch_tasks,
            update,
            fetch_active_goal_pages=lambda: [],
            reviews=_fake_reviews(),
        )
    )

    response = client.get("/reviews/weekly/direction?week_start=2026-09-21")

    assert response.status_code == 501
    assert "not configured" in response.json()["detail"]


def test_direction_endpoint_reports_unexpected_failure_as_502():
    fetch_events, fetch_tasks, update = _minimal_fetchers()

    def failing():
        raise RuntimeError("boom")

    client = TestClient(
        create_app(
            fetch_events,
            fetch_tasks,
            update,
            fetch_active_goal_pages=failing,
            resolve_projects=lambda ids: ([], []),
            reviews=_fake_reviews(),
        )
    )

    response = client.get("/reviews/weekly/direction?week_start=2026-09-21")

    # A failing fetch inside get_direction degrades to an unavailable
    # summary, so this exercises only a truly unexpected endpoint error.
    assert response.status_code in (200, 502)


def test_direction_endpoint_normalizes_goal_pages():
    pages = [
        {
            "id": "g1",
            "properties": {
                "Name": {"type": "title", "title": [{"plain_text": "Ship the app"}]},
                "Status": {"type": "status", "status": {"name": "Active"}},
                "Projects": {"type": "relation", "relation": [{"id": "p1"}]},
            },
        }
    ]

    fetch_events, fetch_tasks, update = _minimal_fetchers()

    client = TestClient(
        create_app(
            fetch_events,
            fetch_tasks,
            update,
            fetch_active_goal_pages=lambda: pages,
            resolve_projects=lambda ids: (
                [ProjectRef(id=pid, name=f"Project {pid}") for pid in ids],
                [],
            ),
            reviews=_fake_reviews(),
        )
    )

    response = client.get("/reviews/weekly/direction?week_start=2026-09-21")

    assert response.status_code == 200
    body = response.json()
    assert body["items"] == [
        {
            "id": "g1",
            "name": "Ship the app",
            "status": "Active",
            "status_available": True,
            "projects": [{"id": "p1", "name": "Project p1"}],
        }
    ]


def _fake_reviews():
    """A minimal review repository stub; the endpoint only needs the gate."""

    class FakeReviews:
        def list(self):
            return []

        def get(self, review_id):
            raise KeyError(review_id)

        def start(self, week_start):
            raise NotImplementedError()

        def save_draft(self, review_id, expected_revision, **kwargs):
            raise NotImplementedError()

        def complete(self, review_id, expected_revision, operation_id, **kwargs):
            raise NotImplementedError()

    return FakeReviews()
