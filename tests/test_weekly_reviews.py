import json
from datetime import date

import pytest

from life_os.services.weekly_reviews import (
    SCHEMA_VERSION,
    ReviewConflict,
    WeeklyReviewError,
    WeeklyReviewRepository,
)

WEEK = date(2026, 9, 14)  # a Monday


@pytest.fixture
def store(tmp_path):
    return WeeklyReviewRepository(path=tmp_path / "var" / "life-os" / "weekly-reviews.json")


def test_start_creates_draft_with_paired_dates(store):
    review = store.start(WEEK)
    assert review.status == "draft"
    assert review.week_start == WEEK
    assert review.week_end == date(2026, 9, 20)
    assert review.ahead_start == date(2026, 9, 21)
    assert review.ahead_end == date(2026, 9, 27)
    assert review.timezone == "Europe/Zurich"
    assert review.revision == 1


def test_start_is_idempotent_per_week(store):
    first = store.start(WEEK)
    second = store.start(WEEK)
    assert first.id == second.id
    assert store.list() and len(store.list()) == 1


def test_draft_survives_repository_restart(store, tmp_path):
    review = store.start(WEEK)
    store.save_draft(review.id, expected_revision=1, wins="Shipped the fix")
    reopened = WeeklyReviewRepository(path=store._path)
    loaded = reopened.get(review.id)
    assert loaded.wins == "Shipped the fix"
    assert loaded.status == "draft"


def test_save_draft_increments_revision(store):
    review = store.start(WEEK)
    saved = store.save_draft(review.id, expected_revision=1, wins="one")
    assert saved.revision == 2
    saved = store.save_draft(review.id, expected_revision=2, reflection="why")
    assert saved.revision == 3
    assert saved.reflection == "why"


def test_stale_draft_save_conflicts_without_changing_data(store):
    review = store.start(WEEK)
    store.save_draft(review.id, expected_revision=1, wins="first writer")
    with pytest.raises(ReviewConflict):
        store.save_draft(review.id, expected_revision=1, wins="stale writer")
    loaded = store.get(review.id)
    assert loaded.wins == "first writer"
    assert loaded.revision == 2


def test_two_writers_same_revision_only_one_succeeds(store):
    review = store.start(WEEK)
    store.save_draft(review.id, expected_revision=1, wins="writer one")
    with pytest.raises(ReviewConflict):
        store.save_draft(review.id, expected_revision=1, wins="writer two")
    assert store.get(review.id).wins == "writer one"


def test_writes_to_different_weeks_do_not_lose_records(store):
    week_a = date(2026, 9, 14)
    week_b = date(2026, 9, 21)
    review_a = store.start(week_a)
    review_b = store.start(week_b)
    store.save_draft(review_a.id, expected_revision=1, wins="week a")
    store.save_draft(review_b.id, expected_revision=1, wins="week b")
    assert store.get(review_a.id).wins == "week a"
    assert store.get(review_b.id).wins == "week b"
    assert len(store.list()) == 2


def test_complete_sets_status_and_timestamp(store):
    review = store.start(WEEK)
    completed = store.complete(review.id, expected_revision=1, operation_id="op-1", wins="done")
    assert completed.status == "completed"
    assert completed.completed_at is not None
    assert completed.wins == "done"


def test_lost_response_retry_returns_existing_result_without_mutation(store):
    review = store.start(WEEK)
    first = store.complete(review.id, expected_revision=1, operation_id="op-1", wins="one")
    retried = store.complete(review.id, expected_revision=1, operation_id="op-1", wins="one")
    assert retried.id == first.id
    assert retried.revision == first.revision
    assert retried.completed_at == first.completed_at
    assert len(store.list()) == 1


def test_distinct_stale_completion_conflicts(store):
    review = store.start(WEEK)
    store.complete(review.id, expected_revision=1, operation_id="op-1")
    with pytest.raises(ReviewConflict):
        store.complete(review.id, expected_revision=1, operation_id="op-2", wins="other")


def test_completed_record_rejects_edits(store):
    review = store.start(WEEK)
    store.complete(review.id, expected_revision=1, operation_id="op-1", wins="final")
    with pytest.raises(WeeklyReviewError):
        store.save_draft(review.id, expected_revision=2, wins="tamper")
    assert store.get(review.id).wins == "final"


def test_corrupt_json_store_is_actionable_and_untouched(store):
    store.start(WEEK)
    store._path.write_text("{not valid json", encoding="utf-8")
    with pytest.raises(WeeklyReviewError) as error:
        store.list()
    assert "backup" in str(error.value)
    assert store._path.read_text(encoding="utf-8") == "{not valid json"


def test_unsupported_schema_version_is_rejected(store):
    store.start(WEEK)
    data = json.loads(store._path.read_text(encoding="utf-8"))
    data["schema_version"] = SCHEMA_VERSION + 99
    store._path.write_text(json.dumps(data), encoding="utf-8")
    with pytest.raises(WeeklyReviewError) as error:
        store.list()
    assert "schema version" in str(error.value)


def test_missing_file_is_empty_store(store):
    assert store.list() == []


def test_duplicate_week_records_are_rejected(store):
    review = store.start(WEEK)
    data = json.loads(store._path.read_text(encoding="utf-8"))
    duplicate = dict(data["reviews"][review.id])
    duplicate["id"] = "second-record"
    data["reviews"]["second-record"] = duplicate
    store._path.write_text(json.dumps(data), encoding="utf-8")
    with pytest.raises(WeeklyReviewError):
        store.list()


def test_list_orders_newest_week_first(store):
    store.start(date(2026, 9, 7))
    store.start(WEEK)
    weeks = [review.week_start for review in store.list()]
    assert weeks == [WEEK, date(2026, 9, 7)]


def test_atomic_replacement_leaves_no_temp_files(store):
    store.start(WEEK)
    leftovers = [p for p in store._path.parent.iterdir() if p.suffix == ".tmp"]
    assert leftovers == []


def test_start_rejects_non_monday_week(store):
    with pytest.raises(WeeklyReviewError) as error:
        store.start(date(2026, 9, 15))  # a Tuesday
    assert "Monday" in str(error.value)
    assert store.list() == []


def test_completed_at_is_timezone_aware(store):
    review = store.start(WEEK)
    completed = store.complete(review.id, expected_revision=1, operation_id="op-1")
    assert completed.completed_at is not None
    assert completed.completed_at.tzinfo is not None
    stored = json.loads(store._path.read_text(encoding="utf-8"))
    assert stored["reviews"][review.id]["completed_at"].endswith("+02:00") or (
        stored["reviews"][review.id]["completed_at"].endswith("+01:00")
    )


def test_section_progress_non_object_is_actionable_and_untouched(store):
    review = store.start(WEEK)
    data = json.loads(store._path.read_text(encoding="utf-8"))
    data["reviews"][review.id]["section_progress"] = ["look_back"]
    store._path.write_text(json.dumps(data), encoding="utf-8")
    with pytest.raises(WeeklyReviewError) as error:
        store.list()
    assert "backup" in str(error.value)
    assert store._path.read_text(encoding="utf-8") == json.dumps(data)


def test_operations_metadata_non_object_is_rejected(store):
    store.start(WEEK)
    data = json.loads(store._path.read_text(encoding="utf-8"))
    data["operations"] = ["op-1"]
    store._path.write_text(json.dumps(data), encoding="utf-8")
    with pytest.raises(WeeklyReviewError) as error:
        store.list()
    assert "backup" in str(error.value)


def test_completed_record_without_timestamp_is_rejected(store):
    review = store.start(WEEK)
    data = json.loads(store._path.read_text(encoding="utf-8"))
    entry = data["reviews"][review.id]
    entry["status"] = "completed"
    entry["completed_at"] = None
    store._path.write_text(json.dumps(data), encoding="utf-8")
    with pytest.raises(WeeklyReviewError):
        store.list()


def test_record_with_mismatched_week_dates_is_rejected(store):
    review = store.start(WEEK)
    data = json.loads(store._path.read_text(encoding="utf-8"))
    data["reviews"][review.id]["week_end"] = "2026-09-25"
    store._path.write_text(json.dumps(data), encoding="utf-8")
    with pytest.raises(WeeklyReviewError):
        store.list()
