import os
from collections.abc import Callable
from datetime import date, datetime
from functools import partial

from dotenv import load_dotenv
from googleapiclient.errors import HttpError
from requests import RequestException

from life_os.integrations.google_calendar import get_calendar_service, get_events_for_day
from life_os.integrations.notion_tasks import fetch_tasks_for_day
from life_os.models.calendar import CalendarEvent
from life_os.models.notion import Task
from life_os.models.today import IntegrationStatus, Today


def _to_date(value: date | datetime | None) -> date | None:
    if isinstance(value, datetime):
        return value.date()
    return value  # plain date passes through, None stays None


def _is_overdue(task: Task, day: date) -> bool:
    due = _to_date(task.due)
    return due is not None and due < day


def build_today(
    day: date, events: list[CalendarEvent], tasks: list[Task], statuses: list[IntegrationStatus]
) -> Today:
    # Overdue wins over scheduled: a passed deadline outranks today's plan.
    overdue_tasks = [t for t in tasks if not t.done and _is_overdue(t, day)]
    scheduled_tasks = [
        t for t in tasks if not t.done and _to_date(t.scheduled) == day and not _is_overdue(t, day)
    ]
    due_tasks = [t for t in tasks if not t.done and _to_date(t.due) == day]

    return Today(
        day=day,
        events=events,
        overdue_tasks=overdue_tasks,
        scheduled_tasks=scheduled_tasks,
        due_tasks=due_tasks,
        statuses=statuses,
    )


def get_today(
    day: date,
    fetch_events: Callable[[date], list[CalendarEvent]],
    fetch_tasks: Callable[[date], list[Task]],
) -> Today:
    statuses: list[IntegrationStatus] = []

    try:
        events = fetch_events(day)
        statuses.append(IntegrationStatus(name="Calendar", ok=True))
    except HttpError as e:
        events = []
        statuses.append(IntegrationStatus(name="Calendar", ok=False, error=str(e)))

    try:
        tasks = fetch_tasks(day)
        statuses.append(IntegrationStatus(name="Notion", ok=True))
    except RequestException as e:
        tasks = []
        statuses.append(IntegrationStatus(name="Notion", ok=False, error=str(e)))

    return build_today(day, events, tasks, statuses)


if __name__ == "__main__":
    load_dotenv()

    day = date.today()
    fetch_events = partial(get_events_for_day, get_calendar_service())

    fetch_tasks = partial(
        fetch_tasks_for_day,
        os.getenv("NOTION_TOKEN"),
        os.getenv("NOTION_TASKS_DATA_SOURCE_ID"),
        page_size=100,
    )

    today = get_today(day, fetch_events, fetch_tasks)

    print(today)
