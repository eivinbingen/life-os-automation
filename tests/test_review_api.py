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
