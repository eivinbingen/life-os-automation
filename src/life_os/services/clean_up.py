from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime
from zoneinfo import ZoneInfo

from life_os.models.clean_up import CleanUpItem, CleanUpSummary, HygieneItem
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


def build_hygiene(tasks: list[Task]) -> list[HygieneItem]:
    """Pure predicate bucketing: incomplete tasks with no time anchor.

    Included iff the task is incomplete and has neither a Scheduled nor a
    Due date (docs/notion-tasks-schema.md). The unresolved queue requires
    an overdue Due or an in-week Scheduled date, so a floating task can
    never appear there — cross-queue dedupe is structural, not code.
    Project context passes through: a set project_id with a null
    project_name means the name lookup failed (unknown), not "no project".
    """

    included: dict[str, HygieneItem] = {}
    for task in tasks:
        if task.done or task.scheduled is not None or task.due is not None:
            continue
        included.setdefault(
            task.id,
            HygieneItem(
                id=task.id,
                name=task.name,
                project_id=task.project_id,
                project_name=task.project_name,
            ),
        )
    return sorted(included.values(), key=lambda i: i.name)


def build_clean_up(
    week_start: date,
    week_end: date,
    local_day: date,
    tasks: list[Task],
    statuses: list[dict] | None = None,
    warnings: list[str] | None = None,
    hygiene_tasks: list[Task] | None = None,
) -> CleanUpSummary:
    """Bucket fetched tasks into the unresolved-work and hygiene queues.

    An incomplete task is included in the unresolved queue iff its Due is
    before the as-of day or it is scheduled inside the reviewed week. One
    row carries both inclusion reasons; the fetch superset (Due <=
    week_end) is filtered precisely here. Hygiene rows come from a
    separate floating-task read.
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
        hygiene=build_hygiene(hygiene_tasks or []),
        statuses=statuses or [],
        warnings=warnings or [],
    )


def get_clean_up(
    week_start: date,
    week_end: date,
    fetch_tasks: Callable[[date, date], TaskFetchResult],
    fetch_hygiene: Callable[[], TaskFetchResult] | None = None,
    local_day: date | None = None,
) -> CleanUpSummary:
    """Fetch live Clean Up data for the week, degrading per read.

    Both reads are Notion but land in different queues, so each degrades
    on its own: a failed read empties only its queue with the error in
    statuses, never both. A failed source never becomes zero silently.
    """

    if local_day is None:
        local_day = datetime.now(_TZ).date()

    # The two reads are independent; running them concurrently keeps the
    # stage's latency the slower read, not the sum (get_ahead precedent).
    with ThreadPoolExecutor(max_workers=2) as pool:
        tasks_future = pool.submit(fetch_tasks, week_start, week_end)
        hygiene_future = pool.submit(fetch_hygiene) if fetch_hygiene is not None else None

    statuses: list[dict] = []
    tasks: list[Task] = []
    warnings: list[str] = []
    try:
        result = tasks_future.result()
        tasks = result.tasks
        warnings.extend(result.warnings)
    except Exception as error:
        statuses.append({"name": "Notion", "ok": False, "error": str(error)})

    hygiene_tasks: list[Task] = []
    if hygiene_future is None:
        # Explicitly not configured, never a fake empty queue (Studies
        # precedent in get_ahead).
        statuses.append(
            {
                "name": "Notion hygiene",
                "ok": False,
                "error": "The hygiene queue is not configured on this service.",
            }
        )
    else:
        try:
            hygiene_result = hygiene_future.result()
            hygiene_tasks = hygiene_result.tasks
            warnings.extend(hygiene_result.warnings)
        except Exception as error:
            statuses.append({"name": "Notion hygiene", "ok": False, "error": str(error)})

    # Both reads resolve project names and can emit the same warning.
    return build_clean_up(
        week_start,
        week_end,
        local_day,
        tasks=tasks,
        statuses=statuses,
        warnings=list(dict.fromkeys(warnings)),
        hygiene_tasks=hygiene_tasks,
    )
