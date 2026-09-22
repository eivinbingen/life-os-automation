from collections.abc import Callable
from datetime import date, timedelta

from googleapiclient.errors import HttpError
from requests import RequestException

from life_os.models.calendar import CalendarEvent
from life_os.models.notion import Task, TaskFetchResult
from life_os.models.today import IntegrationStatus
from life_os.models.week import Week, WeekDay
from life_os.services.today import _is_overdue, _to_date


def week_start(day: date) -> date:
    """Monday of the week containing day."""
    return day - timedelta(days=day.weekday())


def week_end(day: date) -> date:
    """Sunday of the week containing day."""
    return week_start(day) + timedelta(days=6)


def build_week(
    start: date,
    end: date,
    events: list[CalendarEvent],
    tasks: list[Task],
    statuses: list[IntegrationStatus],
) -> Week:
    """Bucket a week's events and tasks into per-day views.

    Pure bucketing, no I/O. Overdue means due before the week's Monday, so a
    task due mid-week shows on its own day, not in the overdue section.
    """
    overdue_tasks = [t for t in tasks if not t.done and _is_overdue(t, start)]

    days = []
    for offset in range((end - start).days + 1):
        day = start + timedelta(days=offset)
        days.append(
            WeekDay(
                day=day,
                events=[e for e in events if _to_date(e.start) == day],
                scheduled_tasks=[
                    t for t in tasks
                    if not t.done and _to_date(t.scheduled) == day
                ],
                due_tasks=[
                    t for t in tasks
                    if not t.done and _to_date(t.due) == day and not _is_overdue(t, start)
                ],
            )
        )

    return Week(
        start=start,
        end=end,
        days=days,
        overdue_tasks=overdue_tasks,
        statuses=statuses,
    )


def get_week(
    day: date,
    fetch_events: Callable[[date], list[CalendarEvent]],
    fetch_tasks: Callable[[date], TaskFetchResult],
) -> Week:
    """Aggregate one Monday-through-Sunday week around day.

    Same graceful-degradation contract as get_today: an integration failure
    leaves its data empty and is reported in statuses; the rest still flows.
    """
    start = week_start(day)
    end = week_end(day)
    statuses: list[IntegrationStatus] = []

    try:
        events = fetch_events(start, end)
        statuses.append(IntegrationStatus(name="Calendar", ok=True))
    except HttpError as e:
        events = []
        statuses.append(IntegrationStatus(name="Calendar", ok=False, error=str(e)))

    try:
        task_result = fetch_tasks(start, end)
        tasks = task_result.tasks
        statuses.append(IntegrationStatus(name="Notion", ok=True))
        if task_result.warnings:
            statuses.append(
                IntegrationStatus(
                    name="Notion projects",
                    ok=False,
                    error=" ".join(task_result.warnings),
                )
            )
    except RequestException as e:
        tasks = []
        statuses.append(IntegrationStatus(name="Notion", ok=False, error=str(e)))

    return build_week(start, end, events, tasks, statuses)
