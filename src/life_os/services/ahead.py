from collections.abc import Callable
from datetime import date, datetime, time
from zoneinfo import ZoneInfo

from life_os.models.ahead import AheadException, AheadItem, AheadSummary
from life_os.models.calendar import CalendarEvent
from life_os.models.courses import StudiesOverview
from life_os.models.notion import Task, TaskFetchResult
from life_os.services.week import build_week

TIMEZONE = "Europe/Zurich"
_TZ = ZoneInfo(TIMEZONE)

# Deterministic same-slot order; the UI renders kinds in this rank.
_KIND_RANK = {"event": 0, "scheduled": 1, "due": 2, "assessment": 3}


def _to_date(value: date | datetime | None) -> date | None:
    if isinstance(value, datetime):
        return value.date()
    return value


def _iso(value: date | datetime | None) -> str | None:
    return value.isoformat() if value is not None else None


def _parse_when(value: str | None) -> datetime | None:
    if not value:
        return None
    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=_TZ)
    return parsed.astimezone(_TZ)


def _sort_time(item: AheadItem) -> datetime:
    """Zurich-local sort time for one row.

    Dateless rows, all-day events, and the continuation days of a
    multi-day event open their day at midnight; timed rows sort by
    their own time.
    """
    day_start = datetime.combine(item.day, time.min, tzinfo=_TZ)
    if item.kind == "event":
        start = _parse_when(item.start)
        if start is None or start.date() < item.day:
            return day_start
        return start
    when = _parse_when(item.when)
    if when is None or when.date() != item.day:
        return day_start
    return when


def _event_item(event: CalendarEvent, day: date) -> AheadItem:
    return AheadItem(
        id=f"event:{event.id}:{day.isoformat()}",
        kind="event",
        day=day,
        name=event.title,
        when=_iso(event.start),
        event_id=event.id,
        start=_iso(event.start),
        end=_iso(event.end),
        all_day=event.all_day,
        continues=_to_date(event.start) is not None and _to_date(event.start) < day,
    )


def _task_item(task: Task, day: date, kind: str, course_names: dict[str, str]) -> AheadItem:
    return AheadItem(
        id=f"{task.id}:{kind}",
        kind=kind,
        day=day,
        name=task.name,
        when=_iso(task.scheduled if kind == "scheduled" else task.due),
        task_id=task.id,
        project_id=task.project_id,
        project_name=task.project_name,
        course_id=task.course_id,
        course_name=course_names.get(task.course_id) if task.course_id else None,
        scheduled=_iso(task.scheduled),
        due=_iso(task.due),
    )


def _studies_items(
    studies: StudiesOverview,
    ahead_start: date,
    ahead_end: date,
    task_ids: set[str],
) -> list[AheadItem]:
    """Timeline rows from the Studies reads, windowed to the ahead week.

    Course-linked studies items re-derive the same Notion task pages, so
    the task row wins when both sources succeeded; the studies item only
    becomes a fallback row when its task is unknown. Exams stay their own
    assessment rows.
    """
    items: list[AheadItem] = []
    for item in studies.upcoming:
        day = _to_date(item.due)
        if day is None or not ahead_start <= day <= ahead_end:
            continue
        if item.kind == "assessment":
            items.append(
                AheadItem(
                    id=item.id,
                    kind="assessment",
                    day=day,
                    name=item.name,
                    when=_iso(item.due),
                    course_id=item.course_id,
                    course_name=item.course_name,
                )
            )
            continue
        if item.id in task_ids:
            continue
        kind = "due" if item.kind == "deadline" else "scheduled"
        items.append(
            AheadItem(
                id=f"{item.id}:{kind}",
                kind=kind,
                day=day,
                name=item.name,
                when=_iso(item.due),
                task_id=item.id,
                course_id=item.course_id,
                course_name=item.course_name,
                due=_iso(item.due) if kind == "due" else None,
                scheduled=_iso(item.due) if kind == "scheduled" else None,
            )
        )
    return items


def _exceptions(tasks: list[Task], ahead_start: date, ahead_end: date) -> list[AheadException]:
    """Incomplete tasks due inside the ahead week with no scheduled date."""
    exceptions = []
    for task in tasks:
        if task.done or task.scheduled is not None:
            continue
        due = _to_date(task.due)
        if due is None or not ahead_start <= due <= ahead_end:
            continue
        exceptions.append(
            AheadException(
                task_id=task.id,
                name=task.name,
                due=_iso(task.due),
                project_id=task.project_id,
                project_name=task.project_name,
            )
        )
    return sorted(exceptions, key=lambda e: (e.due or "", e.name))


def build_ahead(
    week_start: date,
    week_end: date,
    ahead_start: date,
    ahead_end: date,
    events: list[CalendarEvent],
    tasks: list[Task],
    studies: StudiesOverview | None = None,
    statuses: list[dict] | None = None,
    warnings: list[str] | None = None,
) -> AheadSummary:
    """Flatten the ahead week into one chronological timeline.

    Reuses the week bucketing for id dedupe, DST-safe half-open day
    overlap, and scheduled+due membership. Overdue rows stay out: they
    belong to Clean Up, not to the look-ahead.
    """
    tasks = list({task.id: task for task in tasks}.values())
    task_ids = {task.id for task in tasks}
    course_names = (
        {course.id: course.name for course in studies.courses} if studies is not None else {}
    )

    week = build_week(ahead_start, ahead_end, events, tasks, [])

    items: list[AheadItem] = []
    for weekday in week.days:
        for event in weekday.events:
            items.append(_event_item(event, weekday.day))
        for task in weekday.scheduled_tasks:
            items.append(_task_item(task, weekday.day, "scheduled", course_names))
        for task in weekday.due_tasks:
            items.append(_task_item(task, weekday.day, "due", course_names))

    if studies is not None:
        items.extend(_studies_items(studies, ahead_start, ahead_end, task_ids))

    items.sort(
        key=lambda i: (i.day, _sort_time(i), _KIND_RANK.get(i.kind, 9), i.name, i.id)
    )

    return AheadSummary(
        week_start=week_start,
        week_end=week_end,
        ahead_start=ahead_start,
        ahead_end=ahead_end,
        timezone=TIMEZONE,
        captured_at=datetime.now(_TZ),
        items=items,
        exceptions=_exceptions(tasks, ahead_start, ahead_end),
        statuses=statuses or [],
        warnings=warnings or [],
    )


def get_ahead(
    week_start: date,
    week_end: date,
    ahead_start: date,
    ahead_end: date,
    fetch_events: Callable[[date, date], list[CalendarEvent]],
    fetch_tasks: Callable[[date, date], TaskFetchResult],
    fetch_studies_range: Callable[[date, date], StudiesOverview] | None,
) -> AheadSummary:
    """Fetch live Ahead data for the paired week, degrading per source.

    A failed source never becomes zero: its absence is explained in
    statuses while the other sources still flow. Unconfigured Studies
    context is an explicit status, not a blocker.
    """
    statuses: list[dict] = []
    warnings: list[str] = []

    try:
        events = fetch_events(ahead_start, ahead_end)
    except Exception as error:
        events = []
        statuses.append({"name": "Calendar", "ok": False, "error": str(error)})

    try:
        result = fetch_tasks(ahead_start, ahead_end)
        tasks = result.tasks
        warnings.extend(result.warnings)
    except Exception as error:
        tasks = []
        statuses.append({"name": "Notion", "ok": False, "error": str(error)})

    studies: StudiesOverview | None = None
    if fetch_studies_range is None:
        statuses.append(
            {
                "name": "Studies",
                "ok": False,
                "error": "Studies context is not configured on this service.",
            }
        )
    else:
        try:
            overview = fetch_studies_range(ahead_start, ahead_end)
            studies = overview
            warnings.extend(overview.warnings)
            secondary = [s for s in overview.statuses if not s.ok]
            if secondary:
                statuses.append(
                    {
                        "name": "Studies",
                        "ok": False,
                        "error": " ".join(s.error or "" for s in secondary).strip()
                        or "Part of the Studies context could not be read.",
                    }
                )
        except Exception as error:
            statuses.append({"name": "Studies", "ok": False, "error": str(error)})

    # The studies read re-queries the same task pages, so identical
    # source warnings must not repeat.
    warnings = list(dict.fromkeys(warnings))

    return build_ahead(
        week_start,
        week_end,
        ahead_start,
        ahead_end,
        events,
        tasks,
        studies,
        statuses,
        warnings,
    )
