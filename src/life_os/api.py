from collections.abc import Callable
from datetime import date

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, field_validator, model_validator
from requests import HTTPError, RequestException

from life_os.models.calendar import CalendarEvent
from life_os.models.notion import (
    UNSET,
    Task,
    TaskCreate,
    TaskFetchResult,
)
from life_os.models.notion import (
    TaskUpdate as DomainTaskUpdate,
)
from life_os.services.today import get_today


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


def create_app(
    fetch_events: Callable[[date], list[CalendarEvent]],
    fetch_tasks: Callable[[date], TaskFetchResult],
    update_task: Callable[[str, DomainTaskUpdate, bool | None], bool],
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
