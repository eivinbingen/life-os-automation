from collections.abc import Callable
from datetime import date, timedelta

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, field_validator, model_validator
from requests import HTTPError, RequestException

from life_os.models.calendar import CalendarEvent
from life_os.models.clean_up import CleanUpSummary as DomainCleanUpSummary
from life_os.models.courses import (
    CourseScheduleItem as DomainCourseScheduleItem,
)
from life_os.models.courses import (
    StudiesOverview as DomainStudiesOverview,
)
from life_os.models.finance import (
    FinanceReview,
    InvalidCategoryMappingError,
    SheetsError,
    YnabError,
)
from life_os.models.goal import (
    GoalCreate,
)
from life_os.models.goal import (
    GoalDetail as DomainGoalDetail,
)
from life_os.models.goal import (
    GoalUpdate as DomainGoalUpdate,
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
from life_os.models.project import ProjectDetail as DomainProjectDetail
from life_os.models.weekly_review import WeeklyReview as DomainWeeklyReview
from life_os.services.clean_up import get_clean_up
from life_os.services.finance import format_mapping_problems
from life_os.services.goals import GoalNotFound
from life_os.services.look_back import get_look_back
from life_os.services.projects import ProjectNotFound
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


# The finite status options from the inspected Goals schema
# (docs/notion-goals-schema.md); nothing outside this set is writable.
GOAL_STATUSES = {"Not Started", "Active", "Failed", "Done"}


class CreateGoalRequest(BaseModel):
    """What a goal creation request means to write; Notion remains
    authoritative."""

    name: str
    status: str | None = None
    area_id: str | None = None
    target_date: date | None = None

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Goal name must not be blank")
        return value.strip()

    @field_validator("status")
    @classmethod
    def status_in_schema(cls, value: str | None) -> str | None:
        if value is not None and value not in GOAL_STATUSES:
            raise ValueError(
                f"Status must be one of: {', '.join(sorted(GOAL_STATUSES))}"
            )
        return value


class GoalUpdate(BaseModel):
    """What a goal edit request means to change; omitted keys preserve the
    Notion value, an explicit null clears where clearing is meaningful.
    Status is status-only and never cascades to projects or tasks. An
    explicit null status is rejected — resetting to Not Started is a
    deliberate edit, not the meaning of an ambiguous null."""

    name: str | None = None
    status: str | None = None
    area_id: str | None = None
    target_date: date | None = None

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, value: str | None) -> str | None:
        if value is not None and not value.strip():
            raise ValueError("Goal name must not be blank")
        return value.strip() if value is not None else None

    @field_validator("status")
    @classmethod
    def status_in_schema(cls, value: str | None) -> str | None:
        if value is not None and value not in GOAL_STATUSES:
            raise ValueError(
                f"Status must be one of: {', '.join(sorted(GOAL_STATUSES))}"
            )
        return value

    @model_validator(mode="after")
    def reject_clearing_nonclearable_fields(self) -> "GoalUpdate":
        if "name" in self.model_fields_set and self.name is None:
            raise ValueError("Goal name cannot be cleared")
        if "status" in self.model_fields_set and self.status is None:
            raise ValueError("Goal status cannot be cleared; send a status instead")
        return self

    def to_domain(self) -> DomainGoalUpdate:
        return DomainGoalUpdate(
            name=self.name if "name" in self.model_fields_set else UNSET,
            status=self.status if "status" in self.model_fields_set else UNSET,
            area_id=self.area_id if "area_id" in self.model_fields_set else UNSET,
            target_date=(
                self.target_date if "target_date" in self.model_fields_set else UNSET
            ),
        )


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


def _notion_write_error(error: HTTPError, action: str, entity: str = "task") -> HTTPException:
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
                f"Notion rejected the {entity} properties. Check the configured "
                f"{entity} data source schema."
            ),
        )
    return HTTPException(
        status_code=502, detail=f"Notion could not {action} the {entity}. Try again."
    )


class ScheduleItemResponse(BaseModel):
    id: str
    name: str
    kind: str
    course_id: str | None = None
    course_name: str | None = None
    due: str | None = None


class CourseResponse(BaseModel):
    id: str
    name: str
    next_item: ScheduleItemResponse | None = None
    upcoming: list[ScheduleItemResponse] = []


class StudiesResponse(BaseModel):
    courses: list[CourseResponse] = []
    upcoming: list[ScheduleItemResponse] = []
    statuses: list[dict] = []
    warnings: list[str] = []


def _studies_schedule_item(item: DomainCourseScheduleItem) -> ScheduleItemResponse:
    due = None
    if item.due is not None:
        due = item.due.isoformat() if isinstance(item.due, date) else item.due.isoformat()
    return ScheduleItemResponse(
        id=item.id,
        name=item.name,
        kind=item.kind,
        course_id=item.course_id,
        course_name=item.course_name,
        due=due,
    )


def _studies_response(overview: DomainStudiesOverview) -> StudiesResponse:
    return StudiesResponse(
        courses=[
            CourseResponse(
                id=course.id,
                name=course.name,
                next_item=_studies_schedule_item(course.next_item) if course.next_item else None,
                upcoming=[_studies_schedule_item(i) for i in course.upcoming],
            )
            for course in overview.courses
        ],
        upcoming=[_studies_schedule_item(i) for i in overview.upcoming],
        statuses=[{"name": s.name, "ok": s.ok, "error": s.error} for s in overview.statuses],
        warnings=overview.warnings,
    )


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
    fetch_studies: Callable[[], DomainStudiesOverview] | None = None,
    fetch_project_detail: Callable[[str], DomainProjectDetail] | None = None,
    fetch_goal_detail: Callable[[str], DomainGoalDetail] | None = None,
    fetch_active_goals: Callable[[], list] | None = None,
    create_goal: Callable[[GoalCreate], dict] | None = None,
    update_goal: Callable[[str, DomainGoalUpdate], bool] | None = None,
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

        @app.get("/reviews/weekly/clean-up")
        def clean_up_endpoint(week_start: date) -> DomainCleanUpSummary:
            if fetch_week_tasks is None:
                raise HTTPException(
                    status_code=501,
                    detail="The clean-up queue is not configured on this service.",
                )
            try:
                monday = normalize_week_start(week_start)
                return get_clean_up(monday, monday + timedelta(days=6), fetch_week_tasks)
            except (HTTPError, RequestException, ValueError) as error:
                raise HTTPException(
                    status_code=502,
                    detail=f"The clean-up queue could not be read: {error}",
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

    if fetch_studies is not None:

        @app.get("/studies")
        def studies_endpoint() -> StudiesResponse:
            try:
                overview = fetch_studies()
            except (HTTPError, RequestException) as error:
                return StudiesResponse(
                    courses=[],
                    upcoming=[],
                    statuses=[{"name": "Notion", "ok": False, "error": str(error)}],
                )
            return _studies_response(overview)

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

    if fetch_project_detail is not None:

        @app.get("/projects/{project_id}")
        def project_endpoint(project_id: str) -> DomainProjectDetail:
            try:
                return fetch_project_detail(project_id)
            except ProjectNotFound as error:
                raise HTTPException(
                    status_code=404, detail="This project could not be found."
                ) from error
            except Exception as error:
                # The service degrades per source; a raised error here means
                # the whole read failed unexpectedly.
                raise HTTPException(
                    status_code=502,
                    detail=f"The project could not be read: {error}",
                ) from error

    # /goals/active registers before /goals/{goal_id}: Starlette matches in
    # registration order, so the path param would otherwise swallow the
    # literal segment (route-ordering test covers this).
    if fetch_active_goals is not None:

        @app.get("/goals/active")
        def active_goals_endpoint() -> list:
            try:
                return fetch_active_goals()
            except Exception as error:
                # Live direction data is labeled unavailable upstream rather
                # than blocking; a raised error here means the whole read
                # failed unexpectedly.
                raise HTTPException(
                    status_code=502,
                    detail=f"The active goals could not be read: {error}",
                ) from error

    if fetch_goal_detail is not None:

        @app.get("/goals/{goal_id}")
        def goal_endpoint(goal_id: str) -> DomainGoalDetail:
            try:
                return fetch_goal_detail(goal_id)
            except GoalNotFound as error:
                raise HTTPException(
                    status_code=404, detail="This goal could not be found."
                ) from error
            except Exception as error:
                # The service degrades per source; a raised error here means
                # the whole read failed unexpectedly.
                raise HTTPException(
                    status_code=502,
                    detail=f"The goal could not be read: {error}",
                ) from error

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

    if create_goal is not None:

        @app.post("/goals", status_code=201)
        def create_goal_endpoint(request: CreateGoalRequest) -> dict:
            try:
                return create_goal(
                    GoalCreate(
                        name=request.name,
                        status=request.status,
                        area_id=request.area_id,
                        target_date=request.target_date,
                    )
                )
            except HTTPError as error:
                raise _notion_write_error(error, "create", entity="goal") from error
            except RequestException as error:
                raise HTTPException(
                    status_code=502, detail="Notion could not be reached. Try again."
                ) from error

    if update_goal is not None:

        @app.patch("/goals/{goal_id}")
        def update_goal_endpoint(goal_id: str, update: GoalUpdate) -> dict:
            domain_update = update.to_domain()
            if domain_update == DomainGoalUpdate():
                raise HTTPException(status_code=422, detail="No goal fields to update")
            try:
                update_goal(goal_id, domain_update)
            except HTTPError as error:
                raise _notion_write_error(error, "update", entity="goal") from error
            except RequestException as error:
                raise HTTPException(
                    status_code=502, detail="Notion could not be reached. Try again."
                ) from error
            return {"goal": goal_id, "updated": True}

    return app
