from collections.abc import Callable
from datetime import date, datetime
from zoneinfo import ZoneInfo

from googleapiclient.errors import HttpError
from requests import RequestException

from life_os.models.calendar import CalendarEvent
from life_os.models.look_back import LookBackMetric, LookBackSummary
from life_os.models.notion import Task, TaskFetchResult
from life_os.models.today import IntegrationStatus

TIMEZONE = "Europe/Zurich"
_TZ = ZoneInfo(TIMEZONE)


def _to_date(value: date | datetime | None) -> date | None:
    if isinstance(value, datetime):
        return value.date()
    return value


def _task_entry(task: Task) -> dict:
    return {
        "id": task.id,
        "name": task.name,
        "project_name": task.project_name,
    }


def _scheduled_in_week(task: Task, week_start: date, week_end: date) -> bool:
    scheduled = _to_date(task.scheduled)
    return scheduled is not None and week_start <= scheduled <= week_end


def build_look_back(
    week_start: date,
    week_end: date,
    week_tasks: list[Task],
    done_week_tasks: list[Task],
    events: list[CalendarEvent],
    statuses: list[IntegrationStatus],
) -> LookBackSummary:
    """Bucket a reviewed week's fetched data into the honest Look Back summary.

    Completion is not tracked, so the completed-work measure is "scheduled
    that week and now done"; completion-in-week stays explicitly
    unavailable. Lists are deduplicated by task ID.
    """

    notion_ok = all(s.ok for s in statuses if s.name == "Notion")
    calendar_ok = all(s.ok for s in statuses if s.name == "Calendar")

    completed = {t.id: t for t in done_week_tasks if _scheduled_in_week(t, week_start, week_end)}
    unfinished: dict[str, Task] = {}
    for task in week_tasks:
        if task.done or not _scheduled_in_week(task, week_start, week_end):
            continue
        unfinished.setdefault(task.id, task)

    completed_names = sorted(
        {t.project_name for t in completed.values() if t.project_name}
    )
    unfinished_names = sorted(
        {t.project_name for t in unfinished.values() if t.project_name}
    )
    projects_touched = sorted(set(completed_names) | set(unfinished_names))

    metrics = [
        LookBackMetric(
            key="tasks_scheduled_done",
            label="Tasks scheduled that week and now done",
            definition=(
                "Unique tasks with a Scheduled date inside the reviewed week whose "
                "Done checkbox is now checked. Completion date is not tracked, so "
                "this does not mean completed during the week."
            ),
            available=notion_ok,
            count=len(completed) if notion_ok else None,
        ),
        LookBackMetric(
            key="completion_in_week",
            label="Tasks completed during that week",
            definition=(
                "Unavailable: tasks have no completion timestamp; last-edited "
                "time is not completion time."
            ),
            available=False,
            count=None,
        ),
        LookBackMetric(
            key="events_in_week",
            label="Calendar events that week",
            definition=(
                "Unique calendar events with a start inside the reviewed week "
                "(Europe/Zurich)."
            ),
            available=calendar_ok,
            count=len(events) if calendar_ok else None,
        ),
        LookBackMetric(
            key="projects_touched",
            label="Projects of tasks scheduled that week",
            definition=(
                "Distinct project names on the tasks in the two measures above. "
                "Evidence is the Project relation of those fetched tasks only; "
                "no other project activity is tracked."
            ),
            available=notion_ok,
            count=len(projects_touched) if notion_ok else None,
        ),
    ]

    return LookBackSummary(
        week_start=week_start,
        week_end=week_end,
        timezone=TIMEZONE,
        captured_at=datetime.now(_TZ),
        metrics=metrics,
        statuses=[
            {"name": status.name, "ok": status.ok, "error": status.error}
            for status in statuses
        ],
        completed_tasks=[_task_entry(task) for task in completed.values()],
        unfinished_tasks=[_task_entry(task) for task in unfinished.values()],
    )


def get_look_back(
    week_start: date,
    week_end: date,
    fetch_week_tasks: Callable[[date, date], TaskFetchResult],
    fetch_done_week_tasks: Callable[[date, date], TaskFetchResult],
    fetch_week_events: Callable[[date, date], list[CalendarEvent]],
) -> LookBackSummary:
    """Fetch live Look Back data for the week, degrading per source.

    A failed source never becomes zero: its metrics are marked
    unavailable with the error in statuses.
    """

    statuses: list[IntegrationStatus] = []

    try:
        events = fetch_week_events(week_start, week_end)
        statuses.append(IntegrationStatus(name="Calendar", ok=True))
    except (HttpError, RequestException) as error:
        events = []
        statuses.append(IntegrationStatus(name="Calendar", ok=False, error=str(error)))

    try:
        week_tasks = fetch_week_tasks(week_start, week_end).tasks
        done_week_tasks = fetch_done_week_tasks(week_start, week_end).tasks
        statuses.append(IntegrationStatus(name="Notion", ok=True))
    except RequestException as error:
        week_tasks = []
        done_week_tasks = []
        statuses.append(IntegrationStatus(name="Notion", ok=False, error=str(error)))

    return build_look_back(
        week_start,
        week_end,
        week_tasks,
        done_week_tasks,
        events,
        statuses,
    )
