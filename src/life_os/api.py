from collections.abc import Callable
from datetime import date

from fastapi import FastAPI
from pydantic import BaseModel, field_validator

from life_os.models.calendar import CalendarEvent
from life_os.models.notion import Task, TaskCreate, TaskFetchResult
from life_os.services.today import get_today


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
) -> FastAPI:

    app = FastAPI()

    @app.get("/health")
    def health():
        return {"status": "ok"}

    @app.get("/today")
    def today(day: date | None = None):

        return get_today(day or date.today(), fetch_events, fetch_tasks)

    @app.patch("/tasks/{task_id}")
    def update_task(task_id: str, update: TaskUpdate) -> dict:
        set_done(task_id, update.done)
        return {"task": task_id, "done": update.done}

    if create_task is not None:

        @app.post("/tasks")
        def create_task_endpoint(request: CreateTaskRequest) -> Task:
            return create_task(
                TaskCreate(name=request.name, scheduled=request.scheduled, due=request.due)
            )

    return app
