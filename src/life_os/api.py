from collections.abc import Callable
from datetime import date, timedelta

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, field_validator, model_validator
from requests import HTTPError, RequestException

from life_os.models.calendar import CalendarEvent
from life_os.models.finance import (
    FinanceReview,
    InvalidCategoryMappingError,
    SheetsError,
    YnabError,
)
from life_os.models.look_back import LookBackSummary as DomainLookBackSummary
from life_os.models.notion import (
    UNSET,
    Task,
    TaskCreate,
    TaskFetchResult,
)
from life_os.models.notion import (
    TaskUpdate as DomainTaskUpdate,
)
from life_os.models.weekly_review import WeeklyReview as DomainWeeklyReview
from life_os.services.finance import format_mapping_problems
from life_os.services.look_back import get_look_back
from life_os.services.today import get_today
from life_os.services.week import get_week
from life_os.services.week import week_start as normalize_week_start
from life_os.services.weekly_reviews import (
    ReviewConflict,
    WeeklyReviewError,
    WeeklyReviewRepository,
)


class TaskUpdate(BaseModel):
    """What an edit request means to change; Notion remains authoritative.

    Omitted keys preserve the Notion value; an explicit null clears the
    date. Name and Done cannot be null: there is no clear semantics for
    them, so an explicit null is rejected rather than silently dropped.
    """

    done: bool | None = None
    name: str | None = None
    scheduled: date | None = None
    due: date | None = None

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, value: str | None) -> str | None:
        if value is not None and not value.strip():
            raise ValueError("Task name must not be blank")
        return value.strip() if value is not None else None

    @model_validator(mode="after")
    def reject_clearing_nonclearable_fields(self) -> "TaskUpdate":
        if "name" in self.model_fields_set and self.name is None:
            raise ValueError("Task name cannot be cleared")
        if "done" in self.model_fields_set and self.done is None:
            raise ValueError("Done cannot be cleared; omit it or send true/false")
        return self

    def to_domain(self) -> DomainTaskUpdate:
        return DomainTaskUpdate(
            name=self.name if "name" in self.model_fields_set else UNSET,
            scheduled=self.scheduled if "scheduled" in self.model_fields_set else UNSET,
            due=self.due if "due" in self.model_fields_set else UNSET,
        )


class CreateTaskRequest(BaseModel):
    """What a capture request means to create; Notion remains authoritative."""

    name: str
    scheduled: date | None = None
    due: date | None = None

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Task name must not be blank")
        return value.strip()


class WeeklyReviewDraftUpdate(BaseModel):
    """What a draft save means to change; omitted keys preserve stored text."""

    expected_revision: int
    wins: str | None = None
    reflection: str | None = None
    section_progress: dict[str, bool] | None = None


class WeeklyReviewCompleteRequest(BaseModel):
    """Complete a review; idempotent per operation_id."""

    expected_revision: int
    operation_id: str
    wins: str | None = None
    reflection: str | None = None
    section_progress: dict[str, bool] | None = None

    @field_validator("operation_id")
    @classmethod
    def operation_id_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("operation_id must not be blank")
        return value


def _review_endpoint_error(error: WeeklyReviewError) -> HTTPException:
    if isinstance(error, ReviewConflict):
        return HTTPException(status_code=409, detail=str(error))
    not_found = "could not be found" in str(error)
    status = 404 if not_found else 422
    return HTTPException(status_code=status, detail=str(error))


def _notion_write_error(error: HTTPError, action: str) -> HTTPException:
    status = error.response.status_code if error.response is not None else None
    if status == 403:
        return HTTPException(
            status_code=502,
            detail=(
                f"Notion refused to {action}. Enable the required content "
                "capabilities for the Life OS connection and try again."
            ),
        )
    if status == 400:
        return HTTPException(
            status_code=502,
            detail=(
                "Notion rejected the task properties. Check the configured "
                "task data source schema."
            ),
        )
    return HTTPException(status_code=502, detail=f"Notion could not {action} the task. Try again.")


def _finance_month(month: str | None) -> date:
    """Normalize the month query parameter to a first-of-month date."""
    if month is None:
        return date.today().replace(day=1)
    try:
        return date.fromisoformat(month).replace(day=1)
    except ValueError as error:
        raise HTTPException(
            status_code=422,
            detail="Month must be an ISO date within the requested month, e.g. 2026-09-01",
        ) from error


def create_app(
    fetch_events: Callable[[date], list[CalendarEvent]],
    fetch_tasks: Callable[[date], TaskFetchResult],
    update_task: Callable[[str, DomainTaskUpdate, bool | None], bool],
    create_task: Callable[[TaskCreate], Task] | None = None,
    fetch_week_events: Callable[[date, date], list[CalendarEvent]] | None = None,
    fetch_week_tasks: Callable[[date, date], TaskFetchResult] | None = None,
    fetch_done_week_tasks: Callable[[date, date], TaskFetchResult] | None = None,
    get_finance: Callable[[str], FinanceReview] | None = None,
    reviews: WeeklyReviewRepository | None = None,
) -> FastAPI:

    app = FastAPI()

    @app.get("/health")
    def health():
        return {"status": "ok"}

    if reviews is not None:

        @app.get("/reviews/weekly/look-back")
        def look_back_endpoint(week_start: date) -> DomainLookBackSummary:
            if (
                fetch_week_tasks is None
                or fetch_done_week_tasks is None
                or fetch_week_events is None
            ):
                raise HTTPException(
                    status_code=501,
                    detail="The look-back summary is not configured on this service.",
                )
            try:
                monday = normalize_week_start(week_start)
                return get_look_back(
                    monday,
                    monday + timedelta(days=6),
                    fetch_week_tasks,
                    fetch_done_week_tasks,
                    fetch_week_events,
                )
            except (HTTPError, RequestException, ValueError) as error:
                raise HTTPException(
                    status_code=502,
                    detail=f"The look-back summary could not be read: {error}",
                ) from error

        @app.get("/reviews/weekly")
        def list_reviews_endpoint(week_start: date | None = None) -> list[DomainWeeklyReview]:
            try:
                listing = reviews.list()
                if week_start is not None:
                    listing = [review for review in listing if review.week_start == week_start]
                return listing
            except WeeklyReviewError as error:
                raise _review_endpoint_error(error) from error

        @app.get("/reviews/weekly/{review_id}")
        def get_review_endpoint(review_id: str) -> DomainWeeklyReview:
            try:
                return reviews.get(review_id)
            except WeeklyReviewError as error:
                raise _review_endpoint_error(error) from error

        @app.post("/reviews/weekly", status_code=201)
        def start_review_endpoint(week_start: date) -> DomainWeeklyReview:
            try:
                return reviews.start(week_start)
            except WeeklyReviewError as error:
                raise _review_endpoint_error(error) from error

        @app.patch("/reviews/weekly/{review_id}")
        def save_review_endpoint(
            review_id: str, update: WeeklyReviewDraftUpdate
        ) -> DomainWeeklyReview:
            try:
                return reviews.save_draft(
                    review_id,
                    update.expected_revision,
                    wins=update.wins if "wins" in update.model_fields_set else None,
                    reflection=(
                        update.reflection if "reflection" in update.model_fields_set else None
                    ),
                    section_progress=update.section_progress,
                )
            except WeeklyReviewError as error:
                raise _review_endpoint_error(error) from error

        @app.post("/reviews/weekly/{review_id}/complete")
        def complete_review_endpoint(
            review_id: str, request: WeeklyReviewCompleteRequest
        ) -> DomainWeeklyReview:
            # Capture the Look Back summary server-side before the mutation;
            # a fetch failure passes None so a missing metric never blocks
            # completion. A lost-response retry must not spend the live reads
            # on a summary the repository would discard, so skip capture when
            # the record is already completed; reviews.complete performs the
            # authoritative idempotency/conflict check either way.
            look_back_summary: dict | None = None
            if (
                fetch_week_tasks is not None
                and fetch_done_week_tasks is not None
                and fetch_week_events is not None
                and reviews.get(review_id).status != "completed"
            ):
                try:
                    summary = get_look_back(
                        reviews.get(review_id).week_start,
                        reviews.get(review_id).week_end,
                        fetch_week_tasks,
                        fetch_done_week_tasks,
                        fetch_week_events,
                    )
                    look_back_summary = summary.to_dict()
                except Exception:
                    # Any capture failure never blocks completion.
                    look_back_summary = None
            try:
                return reviews.complete(
                    review_id,
                    request.expected_revision,
                    request.operation_id,
                    wins=request.wins if "wins" in request.model_fields_set else None,
                    reflection=(
                        request.reflection if "reflection" in request.model_fields_set else None
                    ),
                    section_progress=request.section_progress,
                    look_back_summary=look_back_summary,
                )
            except WeeklyReviewError as error:
                raise _review_endpoint_error(error) from error

    @app.get("/today")
    def today(day: date | None = None):

        return get_today(day or date.today(), fetch_events, fetch_tasks)

    if fetch_week_events is not None and fetch_week_tasks is not None:

        @app.get("/week")
        def week(day: date | None = None):

            return get_week(
                day or date.today(), fetch_week_events, fetch_week_tasks
            )

    if get_finance is not None:

        @app.get("/finance")
        def finance(month: str | None = None) -> FinanceReview:
            selected_month = _finance_month(month)
            try:
                return get_finance(selected_month.isoformat())
            except InvalidCategoryMappingError as error:
                raise HTTPException(
                    status_code=502,
                    detail="The YNAB category mapping needs attention:\n"
                    + format_mapping_problems(error.problems),
                ) from error
            except YnabError as error:
                raise HTTPException(
                    status_code=502, detail=f"YNAB is unavailable: {error}"
                ) from error
            except SheetsError as error:
                raise HTTPException(
                    status_code=502, detail=f"Google Sheets is unavailable: {error}"
                ) from error
            except ValueError as error:
                # Sheet structure problems from the forecast reader.
                raise HTTPException(
                    status_code=502, detail=f"The forecast sheet could not be read: {error}"
                ) from error

    @app.patch("/tasks/{task_id}")
    def update_task_endpoint(task_id: str, update: TaskUpdate) -> dict:
        domain_update = update.to_domain()
        done = update.done if "done" in update.model_fields_set else None
        if domain_update == DomainTaskUpdate() and done is None:
            raise HTTPException(status_code=422, detail="No task fields to update")
        try:
            update_task(task_id, domain_update, done)
        except HTTPError as error:
            raise _notion_write_error(error, "update") from error
        except RequestException as error:
            raise HTTPException(
                status_code=502, detail="Notion could not be reached. Try again."
            ) from error
        return {"task": task_id, "updated": True}

    if create_task is not None:

        @app.post("/tasks")
        def create_task_endpoint(request: CreateTaskRequest) -> Task:
            try:
                return create_task(
                    TaskCreate(name=request.name, scheduled=request.scheduled, due=request.due)
                )
            except HTTPError as error:
                raise _notion_write_error(error, "create") from error
            except RequestException as error:
                raise HTTPException(
                    status_code=502, detail="Notion could not be reached. Try again."
                ) from error

    return app
