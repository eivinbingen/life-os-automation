from datetime import date

import pytest
from fastapi.testclient import TestClient

from life_os.api import create_app
from life_os.models.notion import TaskFetchResult
from life_os.services.weekly_reviews import WeeklyReviewRepository

WEEK = date(2026, 9, 14)


@pytest.fixture
def review_app(tmp_path):
    store = WeeklyReviewRepository(path=tmp_path / "var" / "life-os" / "weekly-reviews.json")

    def fetch_events(day):
        return []

    def fetch_tasks(day):
        return TaskFetchResult(tasks=[])

    def update_task(task_id, update, done):
        return True

    app = create_app(fetch_events, fetch_tasks, update_task, reviews=store)
    return store, TestClient(app)


def test_start_review_returns_201_with_paired_dates(review_app):
    store, client = review_app
    response = client.post("/reviews/weekly", params={"week_start": WEEK.isoformat()})
    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "draft"
    assert body["week_start"] == WEEK.isoformat()
    assert body["ahead_start"] == date(2026, 9, 21).isoformat()


def test_start_review_twice_returns_same_record(review_app):
    store, client = review_app
    first = client.post("/reviews/weekly", params={"week_start": WEEK.isoformat()})
    second = client.post("/reviews/weekly", params={"week_start": WEEK.isoformat()})
    assert first.json()["id"] == second.json()["id"]


def test_save_draft_updates_and_returns_review(review_app):
    store, client = review_app
    review = client.post("/reviews/weekly", params={"week_start": WEEK.isoformat()}).json()
    response = client.patch(
        f"/reviews/weekly/{review['id']}",
        json={"expected_revision": 1, "wins": "Shipped v2"},
    )
    assert response.status_code == 200
    assert response.json()["wins"] == "Shipped v2"
    assert response.json()["revision"] == 2


def test_stale_save_returns_409_without_changes(review_app):
    store, client = review_app
    review = client.post("/reviews/weekly", params={"week_start": WEEK.isoformat()}).json()
    url = f"/reviews/weekly/{review['id']}"
    client.patch(url, json={"expected_revision": 1, "wins": "first"})
    conflict = client.patch(url, json={"expected_revision": 1, "wins": "stale"})
    assert conflict.status_code == 409
    assert client.get(url).json()["wins"] == "first"


def test_complete_is_idempotent_after_lost_response(review_app):
    store, client = review_app
    review = client.post("/reviews/weekly", params={"week_start": WEEK.isoformat()}).json()
    payload = {"expected_revision": 1, "operation_id": "op-1", "wins": "final"}
    first = client.post(f"/reviews/weekly/{review['id']}/complete", json=payload)
    assert first.status_code == 200
    retried = client.post(f"/reviews/weekly/{review['id']}/complete", json=payload)
    assert retried.status_code == 200
    assert retried.json()["revision"] == first.json()["revision"]
    assert len(client.get("/reviews/weekly").json()) == 1


def test_list_and_get_history(review_app):
    store, client = review_app
    review = client.post("/reviews/weekly", params={"week_start": WEEK.isoformat()}).json()
    complete_payload = {"expected_revision": 1, "operation_id": "op-1"}
    client.post(f"/reviews/weekly/{review['id']}/complete", json=complete_payload)
    listing = client.get("/reviews/weekly")
    assert listing.status_code == 200
    assert [entry["id"] for entry in listing.json()] == [review["id"]]
    assert listing.json()[0]["status"] == "completed"


def test_unknown_review_returns_404(review_app):
    store, client = review_app
    response = client.get("/reviews/weekly/missing-id")
    assert response.status_code == 404


def test_corrupt_store_reports_error(review_app):
    store, client = review_app
    client.post("/reviews/weekly", params={"week_start": WEEK.isoformat()})
    store._path.write_text("corrupt", encoding="utf-8")
    response = client.get("/reviews/weekly")
    assert response.status_code == 422
    assert "backup" in response.json()["detail"]


def test_start_rejects_non_monday_week(review_app):
    store, client = review_app
    response = client.post("/reviews/weekly", params={"week_start": "2026-09-15"})
    assert response.status_code == 422
    assert "Monday" in response.json()["detail"]
    assert store.list() == []


def test_complete_rejects_blank_operation_id(review_app):
    store, client = review_app
    review = client.post("/reviews/weekly", params={"week_start": WEEK.isoformat()}).json()
    response = client.post(
        f"/reviews/weekly/{review['id']}/complete",
        json={"expected_revision": 1, "operation_id": "  "},
    )
    assert response.status_code == 422


def week_fetchers():
    def fetch_week_events(start, end):
        return []

    def fetch_week_tasks(start, end):
        return TaskFetchResult(tasks=[])

    def fetch_done_week_tasks(start, end):
        return TaskFetchResult(tasks=[])

    return fetch_week_events, fetch_week_tasks, fetch_done_week_tasks


@pytest.fixture
def look_back_app(tmp_path):
    store = WeeklyReviewRepository(path=tmp_path / "var" / "life-os" / "weekly-reviews.json")

    def fetch_events(day):
        return []

    def fetch_tasks(day):
        return TaskFetchResult(tasks=[])

    def update_task(task_id, update, done):
        return True

    fetch_week_events, fetch_week_tasks, fetch_done_week_tasks = week_fetchers()
    app = create_app(
        fetch_events,
        fetch_tasks,
        update_task,
        fetch_week_events=fetch_week_events,
        fetch_week_tasks=fetch_week_tasks,
        fetch_done_week_tasks=fetch_done_week_tasks,
        reviews=store,
    )
    return store, TestClient(app)


def test_look_back_endpoint_returns_summary(look_back_app):
    store, client = look_back_app
    response = client.get("/reviews/weekly/look-back", params={"week_start": WEEK.isoformat()})
    assert response.status_code == 200
    body = response.json()
    assert body["week_start"] == WEEK.isoformat()
    assert body["week_end"] == date(2026, 9, 20).isoformat()
    assert body["timezone"] == "Europe/Zurich"
    assert "captured_at" in body
    keys = {metric["key"] for metric in body["metrics"]}
    assert keys == {
        "tasks_scheduled_done",
        "completion_in_week",
        "events_in_week",
        "projects_touched",
    }
    completion = next(m for m in body["metrics"] if m["key"] == "completion_in_week")
    assert completion["available"] is False
    assert completion["count"] is None
    assert "no completion timestamp" in completion["definition"]


def test_look_back_endpoint_normalizes_non_monday_week_start(look_back_app):
    store, client = look_back_app
    response = client.get("/reviews/weekly/look-back", params={"week_start": "2026-09-16"})
    assert response.status_code == 200
    assert response.json()["week_start"] == WEEK.isoformat()


def test_complete_captures_look_back_summary_into_stored_record(look_back_app):
    store, client = look_back_app
    review = client.post("/reviews/weekly", params={"week_start": WEEK.isoformat()}).json()
    response = client.post(
        f"/reviews/weekly/{review['id']}/complete",
        json={"expected_revision": 1, "operation_id": "op-1"},
    )
    assert response.status_code == 200
    stored = store.get(review["id"])
    assert stored.look_back_summary is not None
    keys = {metric["key"] for metric in stored.look_back_summary["metrics"]}
    assert "tasks_scheduled_done" in keys
    assert stored.look_back_summary["captured_at"].endswith(("+02:00", "+01:00"))


def test_complete_with_fetch_failure_still_completes_with_degraded_summary(tmp_path):
    store = WeeklyReviewRepository(path=tmp_path / "var" / "life-os" / "weekly-reviews.json")

    def fetch_events(day):
        return []

    def fetch_tasks(day):
        return TaskFetchResult(tasks=[])

    def update_task(task_id, update, done):
        return True

    from requests import RequestException

    def failing_events(start, end):
        raise RequestException("Calendar down")

    def fetch_week_tasks(start, end):
        return TaskFetchResult(tasks=[])

    def fetch_done_week_tasks(start, end):
        return TaskFetchResult(tasks=[])

    app = create_app(
        fetch_events,
        fetch_tasks,
        update_task,
        fetch_week_events=failing_events,
        fetch_week_tasks=fetch_week_tasks,
        fetch_done_week_tasks=fetch_done_week_tasks,
        reviews=store,
    )
    client = TestClient(app)
    review = client.post("/reviews/weekly", params={"week_start": WEEK.isoformat()}).json()
    response = client.post(
        f"/reviews/weekly/{review['id']}/complete",
        json={"expected_revision": 1, "operation_id": "op-1"},
    )
    assert response.status_code == 200
    stored = store.get(review["id"])
    assert stored.status == "completed"
    # The failing source degrades to unavailable inside the summary instead
    # of blocking completion; summary absent only if the whole capture fails.
    assert stored.look_back_summary is not None
    events_metric = next(
        m for m in stored.look_back_summary["metrics"] if m["key"] == "events_in_week"
    )
    assert events_metric["available"] is False
    assert events_metric["count"] is None


def test_complete_with_failing_task_fetch_completes_without_summary(tmp_path):
    store = WeeklyReviewRepository(path=tmp_path / "var" / "life-os" / "weekly-reviews.json")

    def fetch_events(day):
        return []

    def fetch_tasks(day):
        return TaskFetchResult(tasks=[])

    def update_task(task_id, update, done):
        return True

    def failing_week_tasks(start, end):
        raise RuntimeError("Notion exploded")

    def fetch_done_week_tasks(start, end):
        return TaskFetchResult(tasks=[])

    def fetch_week_events(start, end):
        return []

    app = create_app(
        fetch_events,
        fetch_tasks,
        update_task,
        fetch_week_events=fetch_week_events,
        fetch_week_tasks=failing_week_tasks,
        fetch_done_week_tasks=fetch_done_week_tasks,
        reviews=store,
    )
    client = TestClient(app)
    review = client.post("/reviews/weekly", params={"week_start": WEEK.isoformat()}).json()
    response = client.post(
        f"/reviews/weekly/{review['id']}/complete",
        json={"expected_revision": 1, "operation_id": "op-1"},
    )
    assert response.status_code == 200
    stored = store.get(review["id"])
    assert stored.status == "completed"
    # An unexpected capture error never blocks completion.
    assert stored.look_back_summary is None


def test_completed_retry_does_not_rewrite_summary(look_back_app):
    store, client = look_back_app
    review = client.post("/reviews/weekly", params={"week_start": WEEK.isoformat()}).json()
    payload = {"expected_revision": 1, "operation_id": "op-1"}
    first = client.post(f"/reviews/weekly/{review['id']}/complete", json=payload)
    original = store.get(review["id"]).look_back_summary
    retried = client.post(f"/reviews/weekly/{review['id']}/complete", json=payload)
    assert retried.json()["id"] == first.json()["id"]
    assert store.get(review["id"]).look_back_summary == original


def test_look_back_endpoint_absent_without_callables(review_app):
    store, client = review_app
    response = client.get("/reviews/weekly/look-back", params={"week_start": WEEK.isoformat()})
    assert response.status_code in (404, 501)
