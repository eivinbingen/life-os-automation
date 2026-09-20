from dataclasses import dataclass, field
from datetime import date, datetime


@dataclass
class Task:
    id: str
    name: str
    done: bool = False
    scheduled: date | datetime | None = None
    due: date | datetime | None = None
    project_id: str | None = None
    project_name: str | None = None


@dataclass
class TaskCreate:
    """A task to be created in Notion: only what capture means to write."""

    name: str
    scheduled: date | None = None
    due: date | None = None


@dataclass
class TaskFetchResult:
    tasks: list[Task]
    warnings: list[str] = field(default_factory=list)
