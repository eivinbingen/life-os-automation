import fcntl
import json
import os
import tempfile
import uuid
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from life_os.models.weekly_review import WeeklyReview

SCHEMA_VERSION = 1
STORE_ENV_VAR = "LIFE_OS_STORE_ROOT"
STORE_DIR = "var/life-os"
STORE_FILE = "weekly-reviews.json"
LOCK_FILE = "weekly-reviews.lock"
TIMEZONE = "Europe/Zurich"
_TZ = ZoneInfo(TIMEZONE)


def _now() -> datetime:
    return datetime.now(_TZ)


class WeeklyReviewError(Exception):
    """A review operation failed; the message is safe to show the user."""


class ReviewConflict(WeeklyReviewError):
    """Another save occurred; stored data is unchanged and must be reloaded."""


def store_path() -> Path:
    root = os.environ.get(STORE_ENV_VAR)
    base = Path(root).resolve() if root else _repository_root()
    return base / STORE_DIR / STORE_FILE


def _repository_root() -> Path:
    # src/life_os/services/weekly_reviews.py -> repository root
    return Path(__file__).resolve().parents[3]


def _load_file(path: Path) -> dict:
    if not path.exists():
        return {"schema_version": SCHEMA_VERSION, "reviews": {}}
    try:
        with open(path, encoding="utf-8") as stream:
            data = json.load(stream)
    except json.JSONDecodeError as error:
        raise WeeklyReviewError(
            "The weekly review store is unreadable (corrupt JSON). "
            "Restore it from a backup; it was left untouched."
        ) from error
    _validate_store(data)
    return data


def _validate_store(data: dict) -> None:
    if not isinstance(data, dict) or "schema_version" not in data or "reviews" not in data:
        raise WeeklyReviewError(
            "The weekly review store is missing required structure. "
            "Restore it from a backup; it was left untouched."
        )
    if data["schema_version"] != SCHEMA_VERSION:
        raise WeeklyReviewError(
            f"The weekly review store schema version {data['schema_version']} is not "
            f"supported by this version (expects {SCHEMA_VERSION}). "
            "Restore a compatible backup; it was left untouched."
        )
    if not isinstance(data["reviews"], dict):
        raise WeeklyReviewError(
            "The weekly review store's reviews field is malformed. "
            "Restore it from a backup; it was left untouched."
        )
    operations = data.get("operations", {})
    if not isinstance(operations, dict):
        raise WeeklyReviewError(
            "The weekly review store's operations metadata is malformed. "
            "Restore it from a backup; it was left untouched."
        )
    seen_ids: set[str] = set()
    seen_weeks: set[str] = set()
    for key, entry in data["reviews"].items():
        try:
            review = WeeklyReview.from_dict(entry)
        except (KeyError, ValueError, TypeError) as error:
            raise WeeklyReviewError(
                f"The weekly review record {key} is malformed. "
                "Restore it from a backup; it was left untouched."
            ) from error
        if review.id != key or review.id in seen_ids:
            raise WeeklyReviewError(
                "The weekly review store has duplicate or mismatched record IDs. "
                "Restore it from a backup; it was left untouched."
            )
        if review.status not in ("draft", "completed"):
            raise WeeklyReviewError(
                f"The weekly review record {key} has an unknown status. "
                "Restore it from a backup; it was left untouched."
            )
        if review.revision < 1:
            raise WeeklyReviewError(
                f"The weekly review record {key} has an invalid revision. "
                "Restore it from a backup; it was left untouched."
            )
        if review.week_end != review.week_start + timedelta(days=6):
            raise WeeklyReviewError(
                f"The weekly review record {key} has mismatched week dates. "
                "Restore it from a backup; it was left untouched."
            )
        if review.ahead_start != review.week_start + timedelta(days=7):
            raise WeeklyReviewError(
                f"The weekly review record {key} has mismatched Ahead dates. "
                "Restore it from a backup; it was left untouched."
            )
        if review.ahead_end != review.ahead_start + timedelta(days=6):
            raise WeeklyReviewError(
                f"The weekly review record {key} has mismatched Ahead dates. "
                "Restore it from a backup; it was left untouched."
            )
        if review.timezone != TIMEZONE:
            raise WeeklyReviewError(
                f"The weekly review record {key} has an unsupported timezone. "
                "Restore it from a backup; it was left untouched."
            )
        if review.status == "completed" and review.completed_at is None:
            raise WeeklyReviewError(
                f"The weekly review record {key} is completed but has no completion "
                "timestamp. Restore it from a backup; it was left untouched."
            )
        seen_ids.add(review.id)
        week_key = review.week_start.isoformat()
        if week_key in seen_weeks:
            raise WeeklyReviewError(
                "The weekly review store has more than one record for a week. "
                "Restore it from a backup; it was left untouched."
            )
        seen_weeks.add(week_key)


def _atomic_write(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    handle = tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", dir=path.parent, delete=False, suffix=".tmp"
    )
    try:
        with handle:
            json.dump(data, handle, indent=2)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(handle.name, path)
    except BaseException:
        os.unlink(handle.name)
        raise


def _pair_ahead(week_start: date) -> tuple[date, date]:
    ahead_start = week_start + timedelta(days=7)
    return ahead_start, ahead_start + timedelta(days=6)


def _locked(path: Path, operation):
    """Hold a stable store-wide lock across reread/check/update/replace."""
    path.parent.mkdir(parents=True, exist_ok=True)
    lock = path.parent / LOCK_FILE
    with open(lock, "w") as stream:
        fcntl.flock(stream, fcntl.LOCK_EX)
        try:
            return operation()
        finally:
            fcntl.flock(stream, fcntl.LOCK_UN)


class WeeklyReviewRepository:
    """App-owned weekly review persistence behind a domain boundary.

    JSON store with atomic replacement; a stable interprocess lock spans
    reread, revision check, mutation, and write so concurrent saves cannot
    silently lose updates.
    """

    def __init__(self, path: Path | None = None):
        self._path = path or store_path()

    def list(self) -> list[WeeklyReview]:
        data = _load_file(self._path)
        reviews = [WeeklyReview.from_dict(entry) for entry in data["reviews"].values()]
        return sorted(reviews, key=lambda review: review.week_start, reverse=True)

    def get(self, review_id: str) -> WeeklyReview:
        data = _load_file(self._path)
        entry = data["reviews"].get(review_id)
        if entry is None:
            raise WeeklyReviewError("This weekly review could not be found.")
        return WeeklyReview.from_dict(entry)

    def find_by_week(self, week_start: date) -> WeeklyReview | None:
        for review in self.list():
            if review.week_start == week_start:
                return review
        return None

    def start(self, week_start: date) -> WeeklyReview:
        """Create (or return the existing) draft for the reviewed week."""

        if week_start.weekday() != 0:
            raise WeeklyReviewError(
                "The reviewed week must start on a Monday. "
                f"{week_start.isoformat()} is a {week_start.strftime('%A')}."
            )

        def operation() -> WeeklyReview:
            data = _load_file(self._path)
            for entry in data["reviews"].values():
                existing = WeeklyReview.from_dict(entry)
                if existing.week_start == week_start:
                    return existing
            now = _now()
            ahead_start, ahead_end = _pair_ahead(week_start)
            review = WeeklyReview(
                id=uuid.uuid4().hex,
                week_start=week_start,
                week_end=week_start + timedelta(days=6),
                ahead_start=ahead_start,
                ahead_end=ahead_end,
                timezone=TIMEZONE,
                status="draft",
                revision=1,
                created_at=now,
                updated_at=now,
            )
            data["reviews"][review.id] = review.to_dict()
            _atomic_write(self._path, data)
            return review

        return _locked(self._path, operation)

    def save_draft(
        self,
        review_id: str,
        expected_revision: int,
        wins: str | None = None,
        reflection: str | None = None,
        section_progress: dict | None = None,
    ) -> WeeklyReview:
        """Save draft text/progress at the revision last read.

        A stale revision raises ReviewConflict without touching stored data.
        """

        def operation() -> WeeklyReview:
            data = _load_file(self._path)
            entry = data["reviews"].get(review_id)
            if entry is None:
                raise WeeklyReviewError("This weekly review could not be found.")
            review = WeeklyReview.from_dict(entry)
            if review.status == "completed":
                raise WeeklyReviewError(
                    "This review is already completed; completed reviews cannot be edited."
                )
            if review.revision != expected_revision:
                raise ReviewConflict(
                    "Another save occurred while you were editing. "
                    "Load the current version to keep your edits."
                )
            if wins is not None:
                review.wins = wins
            if reflection is not None:
                review.reflection = reflection
            if section_progress is not None:
                review.section_progress = review.section_progress.from_dict(section_progress)
            review.revision += 1
            review.updated_at = _now()
            data["reviews"][review_id] = review.to_dict()
            _atomic_write(self._path, data)
            return review

        return _locked(self._path, operation)

    def complete(
        self,
        review_id: str,
        expected_revision: int,
        operation_id: str,
        wins: str | None = None,
        reflection: str | None = None,
        section_progress: dict | None = None,
        look_back_summary: dict | None = None,
    ) -> WeeklyReview:
        """Complete a review; idempotent per operation ID.

        Retrying the same completed operation returns the existing result
        without another mutation, even if its original response was lost.
        A different stale attempt raises a conflict.
        """

        def operation() -> WeeklyReview:
            data = _load_file(self._path)
            entry = data["reviews"].get(review_id)
            if entry is None:
                raise WeeklyReviewError("This weekly review could not be found.")
            review = WeeklyReview.from_dict(entry)
            if review.status == "completed":
                if operation_id == data.get("operations", {}).get(review_id):
                    return review
                raise ReviewConflict(
                    "This review is already completed."
                    if review.revision == expected_revision
                    else "Another save occurred while you were completing this review. "
                    "Load the current version to reconcile."
                )
            if review.revision != expected_revision:
                raise ReviewConflict(
                    "Another save occurred while you were completing this review. "
                    "Load the current version to keep your edits."
                )
            if wins is not None:
                review.wins = wins
            if reflection is not None:
                review.reflection = reflection
            if section_progress is not None:
                review.section_progress = review.section_progress.from_dict(section_progress)
            if look_back_summary is not None:
                review.look_back_summary = look_back_summary
            review.status = "completed"
            review.revision += 1
            now = _now()
            review.updated_at = now
            review.completed_at = now
            data["reviews"][review_id] = review.to_dict()
            data.setdefault("operations", {})[review_id] = operation_id
            _atomic_write(self._path, data)
            return review

        return _locked(self._path, operation)
