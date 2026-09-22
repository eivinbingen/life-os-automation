from dataclasses import dataclass, field
from datetime import date, datetime


class _Unset:
    """Sentinel marking a field an update deliberately leaves untouched."""

    def __repr__(self) -> str:
        return "UNSET"


UNSET = _Unset()


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
class TaskUpdate:
    """Task fields deliberately edited from Life OS.

    A field left as UNSET preserves the Notion value; an explicit None
    clears it. The adapter writes only the fields that are set.
    """

    name: str | None | _Unset = UNSET
    scheduled: date | None | _Unset = UNSET
    due: date | None | _Unset = UNSET


@dataclass
class TaskFetchResult:
    tasks: list[Task]
    warnings: list[str] = field(default_factory=list)
