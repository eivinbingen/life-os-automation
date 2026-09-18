from dataclasses import dataclass
from datetime import date

from life_os.models.calendar import CalendarEvent
from life_os.models.notion import Task


@dataclass
class IntegrationStatus:
    name: str
    ok: bool
    error: str | None = None


@dataclass
class Today:
    day: date
    events: list[CalendarEvent]
    overdue_tasks: list[Task]
    scheduled_tasks: list[Task]
    due_tasks: list[Task]
    statuses: list[IntegrationStatus]
