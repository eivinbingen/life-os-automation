from dataclasses import dataclass
from datetime import date

from life_os.models.calendar import CalendarEvent
from life_os.models.notion import Task
from life_os.models.today import IntegrationStatus


@dataclass
class WeekDay:
    day: date
    events: list[CalendarEvent]
    scheduled_tasks: list[Task]
    due_tasks: list[Task]


@dataclass
class Week:
    start: date
    end: date
    days: list[WeekDay]
    overdue_tasks: list[Task]
    statuses: list[IntegrationStatus]
