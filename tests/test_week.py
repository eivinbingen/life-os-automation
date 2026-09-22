from datetime import date, datetime

from googleapiclient.errors import HttpError
from requests import RequestException

from life_os.models.calendar import CalendarEvent
from life_os.models.notion import Task, TaskFetchResult
from life_os.services.week import build_week, get_week, week_end, week_start

DAY = date(2026, 9, 17)  # a Thursday
MONDAY = date(2026, 9, 14)
SUNDAY = date(2026, 9, 20)


def _fake_http_error(status=403, reason="Forbidden"):
    class FakeResp:
        pass

    resp = FakeResp()
    resp.status = status
    resp.reason = reason
    return HttpError(resp, b"{}")


def build(tasks, events=None, statuses=None):
    return build_week(
        start=MONDAY, end=SUNDAY, events=events or [], tasks=tasks, statuses=statuses
    )


def names(tasks):
    return [t.name for t in tasks]


def day_named(week, day):
    return next(d for d in week.days if d.day == day)


def test_week_start_is_monday():
    assert week_start(DAY) == MONDAY
    assert week_start(MONDAY) == MONDAY
    assert week_start(SUNDAY) == MONDAY


def test_week_end_is_sunday():
    assert week_end(DAY) == SUNDAY
    assert week_end(MONDAY) == SUNDAY
    assert week_end(SUNDAY) == SUNDAY


def test_week_has_seven_days_monday_through_sunday():
    week = build([])

    assert [d.day for d in week.days] == [
        date(2026, 9, 14),
        date(2026, 9, 15),
        date(2026, 9, 16),
        date(2026, 9, 17),
        date(2026, 9, 18),
        date(2026, 9, 19),
        date(2026, 9, 20),
    ]


def test_events_land_on_their_day():
    week = build(
        [],
        events=[
            CalendarEvent(
                id="e1",
                title="Midweek review",
                start=datetime(2026, 9, 17, 14),
                end=datetime(2026, 9, 17, 15),
            ),
            CalendarEvent(
                id="e2",
                title="Monday standup",
                start=datetime(2026, 9, 14, 9),
                end=datetime(2026, 9, 14, 9, 30),
            ),
        ],
    )

    assert [e.title for e in day_named(week, MONDAY).events] == ["Monday standup"]
    assert [e.title for e in day_named(week, DAY).events] == ["Midweek review"]


def test_scheduled_task_lands_on_its_day():
    task = Task(id="1", name="walk dog", scheduled=date(2026, 9, 16))
    week = build([task])

    assert names(day_named(week, date(2026, 9, 16)).scheduled_tasks) == ["walk dog"]
    assert day_named(week, DAY).scheduled_tasks == []


def test_due_task_lands_on_its_day():
    task = Task(id="1", name="essay", due=date(2026, 9, 18))
    week = build([task])

    assert names(day_named(week, date(2026, 9, 18)).due_tasks) == ["essay"]


def test_task_scheduled_and_due_lands_in_both_buckets_of_its_day():
    task = Task(id="1", name="due tonight", scheduled=DAY, due=DAY)
    week = build([task])
    thursday = day_named(week, DAY)

    assert names(thursday.scheduled_tasks) == ["due tonight"]
    assert names(thursday.due_tasks) == ["due tonight"]


def test_overdue_open_task_lands_in_overdue_section():
    task = Task(id="1", name="late report", due=date(2026, 9, 10))
    week = build([task])

    assert names(week.overdue_tasks) == ["late report"]
    # Not due within the week, so it does not appear on any day either.
    assert all(d.due_tasks == [] for d in week.days)


def test_done_tasks_are_excluded_everywhere():
    tasks = [
        Task(id="1", name="done overdue", done=True, due=date(2026, 9, 10)),
        Task(id="2", name="done scheduled", done=True, scheduled=DAY),
        Task(id="3", name="done due", done=True, due=DAY),
    ]
    week = build(tasks)

    assert week.overdue_tasks == []
    assert all(d.scheduled_tasks == [] and d.due_tasks == [] for d in week.days)


def test_task_due_before_monday_but_scheduled_midweek_stays_scheduled():
    # Overdue means due before the week's Monday: a past deadline that still
    # has a plan inside the week keeps its scheduled slot.
    task = Task(id="1", name="carry over", scheduled=DAY, due=date(2026, 9, 10))
    week = build([task])
    thursday = day_named(week, DAY)

    assert names(week.overdue_tasks) == ["carry over"]
    assert week.overdue_tasks[0].done is False
    assert names(thursday.scheduled_tasks) == ["carry over"]


def test_datetime_values_normalize_to_their_date():
    events = [
        CalendarEvent(
            id="e1",
            title="Standup",
            start=datetime(2026, 9, 17, 9),
            end=datetime(2026, 9, 17, 9, 30),
        )
    ]
    tasks = [
        Task(id="1", name="meeting prep", scheduled=datetime(2026, 9, 17, 10, 30)),
        Task(id="2", name="lab report", due=datetime(2026, 9, 18, 23, 59)),
    ]
    week = build(tasks, events=events)
    thursday = day_named(week, DAY)

    assert [e.title for e in thursday.events] == ["Standup"]
    assert names(thursday.scheduled_tasks) == ["meeting prep"]
    assert names(day_named(week, date(2026, 9, 18)).due_tasks) == ["lab report"]


def test_events_outside_the_week_are_ignored():
    events = [
        CalendarEvent(
            id="e1",
            title="Next week",
            start=datetime(2026, 9, 21, 9),
            end=datetime(2026, 9, 21, 10),
        )
    ]
    week = build([], events=events)

    assert all(d.events == [] for d in week.days)


def test_start_and_end_are_stored_on_the_week():
    week = build([])

    assert week.start == MONDAY
    assert week.end == SUNDAY


# --- get_week orchestration ---


def fetch_events_ok(start, end):
    return [
        CalendarEvent(
            id="e1",
            title="Standup",
            start=datetime(2026, 9, 17, 9),
            end=datetime(2026, 9, 17, 9, 30),
        )
    ]


def fetch_tasks_ok(start, end):
    return TaskFetchResult(tasks=[Task(id="1", name="walk dog", scheduled=DAY)])


def test_both_integrations_ok():
    week = get_week(DAY, fetch_events_ok, fetch_tasks_ok)

    assert week.start == MONDAY
    assert [e.title for e in day_named(week, DAY).events] == ["Standup"]
    assert names(day_named(week, DAY).scheduled_tasks) == ["walk dog"]
    assert [(s.name, s.ok) for s in week.statuses] == [
        ("Calendar", True),
        ("Notion", True),
    ]


def test_fetchers_receive_week_bounds():
    received = []

    def fetch_events(start, end):
        received.append(("events", start, end))
        return []

    def fetch_tasks(start, end):
        received.append(("tasks", start, end))
        return TaskFetchResult(tasks=[])

    get_week(DAY, fetch_events, fetch_tasks)

    assert received == [
        ("events", MONDAY, SUNDAY),
        ("tasks", MONDAY, SUNDAY),
    ]


def test_project_warning_keeps_tasks_and_reports_partial_failure():
    def fetch_tasks_with_warning(start, end):
        return TaskFetchResult(
            tasks=[Task(id="1", name="walk dog", scheduled=DAY)],
            warnings=["Could not load names for 1 project."],
        )

    week = get_week(DAY, fetch_events_ok, fetch_tasks_with_warning)

    assert names(day_named(week, DAY).scheduled_tasks) == ["walk dog"]
    assert [(status.name, status.ok) for status in week.statuses] == [
        ("Calendar", True),
        ("Notion", True),
        ("Notion projects", False),
    ]
    assert week.statuses[-1].error == "Could not load names for 1 project."


def test_calendar_failure_degrades_gracefully():
    def fetch_events_fails(start, end):
        raise _fake_http_error()

    week = get_week(DAY, fetch_events_fails, fetch_tasks_ok)

    # Calendar data is empty but Notion data still flows through.
    assert all(d.events == [] for d in week.days)
    assert names(day_named(week, DAY).scheduled_tasks) == ["walk dog"]

    calendar_status = week.statuses[0]
    assert calendar_status.name == "Calendar"
    assert calendar_status.ok is False
    assert "403" in calendar_status.error

    assert week.statuses[1].ok is True


def test_notion_failure_degrades_gracefully():
    def fetch_tasks_fails(start, end):
        raise RequestException("boom")

    week = get_week(DAY, fetch_events_ok, fetch_tasks_fails)

    assert [e.title for e in day_named(week, DAY).events] == ["Standup"]
    assert day_named(week, DAY).scheduled_tasks == []

    notion_status = week.statuses[1]
    assert notion_status.name == "Notion"
    assert notion_status.ok is False
    assert notion_status.error == "boom"
    assert week.statuses[0].ok is True


def test_both_failures_still_return_a_week():
    def fetch_events_fails(start, end):
        raise _fake_http_error(status=500, reason="Internal Error")

    def fetch_tasks_fails(start, end):
        raise RequestException("connection refused")

    week = get_week(DAY, fetch_events_fails, fetch_tasks_fails)

    # The page can still render: seven empty days, both failures reported.
    assert len(week.days) == 7
    assert all(d.events == [] and d.scheduled_tasks == [] for d in week.days)
    assert week.overdue_tasks == []

    calendar_status, notion_status = week.statuses
    assert (calendar_status.ok, notion_status.ok) == (False, False)
    assert "500" in calendar_status.error
    assert notion_status.error == "connection refused"
