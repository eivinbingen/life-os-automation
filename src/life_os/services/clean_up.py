from collections.abc import Callable
from datetime import date, datetime
from zoneinfo import ZoneInfo

from life_os.models.clean_up import CleanUpItem, CleanUpSummary
from life_os.models.notion import Task, TaskFetchResult

TIMEZONE = "Europe/Zurich"
_TZ = ZoneInfo(TIMEZONE)


def _to_date(value: date | datetime | None) -> date | None:
    if isinstance(value, datetime):
        return value.date()
    return value


def _is_overdue(task: Task, local_day: date) -> bool:
    due = _to_date(task.due)
    return due is not None and due < local_day


def _scheduled_in_week(task: Task, week_start: date, week_end: date) -> bool:
    scheduled = _to_date(task.scheduled)
    return scheduled is not None and week_start <= scheduled <= week_end


def _item(task: Task, local_day: date, week_start: date, week_end: date) -> CleanUpItem:
    return CleanUpItem(
        id=task.id,
        name=task.name,
        project_id=task.project_id,
        project_name=task.project_name,
        scheduled=task.scheduled.isoformat() if task.scheduled else None,
        due=task.due.isoformat() if task.due else None,
        overdue=_is_overdue(task, local_day),
        scheduled_in_week=_scheduled_in_week(task, week_start, week_end),
    )


def build_clean_up(
    week_start: date,
    week_end: date,
    local_day: date,
    tasks: list[Task],
    statuses: list[dict] | None = None,
    warnings: list[str] | None = None,
) -> CleanUpSummary:
    """Bucket fetched tasks into the unresolved-work queue.

    An incomplete task is included iff its Due is before the as-of day or
    it is scheduled inside the reviewed week. One row carries both
    inclusion reasons; the fetch superset (Due <= week_end) is filtered
    precisely here.
    """

    included: dict[str, CleanUpItem] = {}
    for task in tasks:
        if task.done:
            continue
        overdue = _is_overdue(task, local_day)
        in_week = _scheduled_in_week(task, week_start, week_end)
        if not overdue and not in_week:
            continue
        item = _item(task, local_day, week_start, week_end)
        if task.id in included:
            # A repeated appearance never drops an already-marked reason.
            existing = included[task.id]
            existing.overdue = existing.overdue or item.overdue
            existing.scheduled_in_week = existing.scheduled_in_week or item.scheduled_in_week
        else:
            included[task.id] = item

    items = sorted(included.values(), key=lambda i: (not i.overdue, i.name))

    return CleanUpSummary(
        week_start=week_start,
        week_end=week_end,
        local_day=local_day,
        timezone=TIMEZONE,
        captured_at=datetime.now(_TZ),
        items=items,
        statuses=statuses or [],
        warnings=warnings or [],
    )


def get_clean_up(
    week_start: date,
    week_end: date,
    fetch_tasks: Callable[[date, date], TaskFetchResult],
    local_day: date | None = None,
) -> CleanUpSummary:
    """Fetch live Clean Up data for the week, degrading per source.

    A failed source never becomes zero: the queue is marked
    unavailable with the error in statuses.
    """

    if local_day is None:
        local_day = datetime.now(_TZ).date()

    try:
        result = fetch_tasks(week_start, week_end)
    except Exception as error:
        return build_clean_up(
            week_start,
            week_end,
            local_day,
            tasks=[],
            statuses=[{"name": "Notion", "ok": False, "error": str(error)}],
        )

    return build_clean_up(
        week_start,
        week_end,
        local_day,
        tasks=result.tasks,
        warnings=result.warnings,
    )
