from collections.abc import Callable
from datetime import date

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, field_validator
from requests import HTTPError, RequestException

from life_os.models.calendar import CalendarEvent
from life_os.models.notion import Task, TaskCreate, TaskFetchResult
from life_os.services.today import get_today
from life_os.services.week import get_week


class TaskUpdate(BaseModel):
    done: bool


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


def create_app(
    fetch_events: Callable[[date], list[CalendarEvent]],
    fetch_tasks: Callable[[date], TaskFetchResult],
    set_done: Callable[[str, bool], bool],
    create_task: Callable[[TaskCreate], Task] | None = None,
    fetch_week_events: Callable[[date, date], list[CalendarEvent]] | None = None,
    fetch_week_tasks: Callable[[date, date], TaskFetchResult] | None = None,
) -> FastAPI:

    app = FastAPI()

    @app.get("/health")
    def health():
        return {"status": "ok"}

    @app.get("/today")
    def today(day: date | None = None):

        return get_today(day or date.today(), fetch_events, fetch_tasks)

    if fetch_week_events is not None and fetch_week_tasks is not None:

        @app.get("/week")
        def week(day: date | None = None):

            return get_week(
                day or date.today(), fetch_week_events, fetch_week_tasks
            )

    @app.patch("/tasks/{task_id}")
    def update_task(task_id: str, update: TaskUpdate) -> dict:
        set_done(task_id, update.done)
        return {"task": task_id, "done": update.done}

    if create_task is not None:

        @app.post("/tasks")
        def create_task_endpoint(request: CreateTaskRequest) -> Task:
            try:
                return create_task(
                    TaskCreate(name=request.name, scheduled=request.scheduled, due=request.due)
                )
            except HTTPError as error:
                status = error.response.status_code if error.response is not None else None
                if status == 403:
                    detail = (
                        "Notion refused task creation. Enable Insert content for the "
                        "Life OS connection and try again."
                    )
                elif status == 400:
                    detail = (
                        "Notion rejected the task properties. Check the configured task "
                        "data source schema."
                    )
                else:
                    detail = "Notion could not create the task. Try again."
                raise HTTPException(status_code=502, detail=detail) from error
            except RequestException as error:
                raise HTTPException(
                    status_code=502,
                    detail="Notion could not be reached. Try again.",
                ) from error

    return app
