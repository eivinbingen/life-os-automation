from collections.abc import Callable
from datetime import date, datetime
from zoneinfo import ZoneInfo

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
    in the week and now done". Lists are deduplicated by task ID.
    """

    notion_ok = all(s.ok for s in statuses if s.name == "Notion")
    calendar_ok = all(s.ok for s in statuses if s.name == "Calendar")

    completed = {t.id: t for t in done_week_tasks if _scheduled_in_week(t, week_start, week_end)}
    unfinished: dict[str, Task] = {}
    scheduled_incomplete: dict[str, Task] = {}
    for task in week_tasks:
        if not _scheduled_in_week(task, week_start, week_end):
            continue
        scheduled_incomplete.setdefault(task.id, task)
        if task.done:
            continue
        unfinished.setdefault(task.id, task)
    # The incomplete fetch cannot contain done tasks, so the scheduled total
    # unions both fetches to get the real denominator.
    scheduled_total = len(set(scheduled_incomplete) | set(completed))

    # Dedupe by the stable Project relation id; the name is display-only and
    # may be missing (failed lookup) or shared by distinct projects.
    completed_projects = {
        t.project_id: t.project_name for t in completed.values() if t.project_id
    }
    unfinished_projects = {
        t.project_id: t.project_name for t in unfinished.values() if t.project_id
    }
    projects_touched_count = len(completed_projects | unfinished_projects)

    metrics = [
        LookBackMetric(
            key="tasks_scheduled_done",
            label="Tasks done",
            definition=(
                "Out of tasks scheduled in the reviewed week. Completion date is not "
                "tracked, so this does not mean they were completed during the week."
            ),
            available=notion_ok,
            count=len(completed) if notion_ok else None,
            total=scheduled_total if notion_ok else None,
        ),
        LookBackMetric(
            key="events_in_week",
            label="Calendar events",
            definition=(
                "Unique calendar events with a start inside the reviewed week "
                "(Europe/Zurich)."
            ),
            available=calendar_ok,
            count=len(events) if calendar_ok else None,
        ),
        LookBackMetric(
            key="projects_touched",
            label="Projects worked on",
            definition=(
                "Distinct projects (by Project relation) with tasks scheduled "
                "in the reviewed week. Evidence is the Project relation of the "
                "fetched tasks; no other project activity is tracked. Projects "
                "completed or dropped during the week are included, so this "
                "has no reliable total to be a share of."
            ),
            available=notion_ok,
            count=projects_touched_count if notion_ok else None,
            total=None,
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

    # Any failure — network, SSL, auth — makes the source unavailable; a
    # narrow except would let an unexpected error 500 the whole endpoint.
    try:
        events = fetch_week_events(week_start, week_end)
        statuses.append(IntegrationStatus(name="Calendar", ok=True))
    except Exception as error:
        events = []
        statuses.append(IntegrationStatus(name="Calendar", ok=False, error=str(error)))

    try:
        week_tasks = fetch_week_tasks(week_start, week_end).tasks
        done_week_tasks = fetch_done_week_tasks(week_start, week_end).tasks
        statuses.append(IntegrationStatus(name="Notion", ok=True))
    except Exception as error:
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
