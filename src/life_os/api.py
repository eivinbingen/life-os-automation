from collections.abc import Callable
from datetime import date

from fastapi import FastAPI
from pydantic import BaseModel

from life_os.models.calendar import CalendarEvent
from life_os.models.notion import Task
from life_os.services.today import get_today


class TaskUpdate(BaseModel):
    done: bool


def create_app(
    fetch_events: Callable[[date], list[CalendarEvent]],
    fetch_tasks: Callable[[date], list[Task]],
    set_done: Callable[[str, bool], bool],
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

    return app
