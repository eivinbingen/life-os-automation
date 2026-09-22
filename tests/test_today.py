from datetime import date, datetime

from googleapiclient.errors import HttpError
from requests import RequestException

from life_os.models.calendar import CalendarEvent
from life_os.models.notion import Task, TaskFetchResult
from life_os.services.today import build_today, get_today

DAY = date(2026, 9, 17)


def _fake_http_error(status=403, reason="Forbidden"):
    class FakeResp:
        pass

    resp = FakeResp()
    resp.status = status
    resp.reason = reason
    return HttpError(resp, b"{}")


def build(tasks, events=None, statuses=None):
    return build_today(day=DAY, events=events or [], tasks=tasks, statuses=statuses)


def names(tasks):
    return [t.name for t in tasks]


def test_scheduled_today_lands_in_scheduled():
    task = Task(id="1", name="walk dog", scheduled=DAY)
    overview = build([task])

    assert names(overview.scheduled_tasks) == ["walk dog"]
    assert overview.overdue_tasks == []
    assert overview.due_tasks == []


def test_scheduled_today_without_due_date_does_not_crash():
    # Regression: None < day used to raise TypeError in the overdue filter.
    task = Task(id="1", name="walk dog", scheduled=DAY, due=None)

    overview = build([task])

    assert names(overview.scheduled_tasks) == ["walk dog"]


def test_due_today_lands_in_due():
    task = Task(id="1", name="essay", due=DAY)
    overview = build([task])

    assert names(overview.due_tasks) == ["essay"]
    assert overview.scheduled_tasks == []
    assert overview.overdue_tasks == []


def test_overdue_lands_in_overdue():
    task = Task(id="1", name="late report", due=date(2026, 9, 16))
    overview = build([task])

    assert names(overview.overdue_tasks) == ["late report"]
    assert overview.scheduled_tasks == []
    assert overview.due_tasks == []


def test_done_tasks_are_excluded_everywhere():
    tasks = [
        Task(id="1", name="done overdue", done=True, due=date(2026, 9, 10)),
        Task(id="2", name="done scheduled", done=True, scheduled=DAY),
        Task(id="3", name="done due", done=True, due=DAY),
    ]
    overview = build(tasks)

    assert overview.overdue_tasks == []
    assert overview.scheduled_tasks == []
    assert overview.due_tasks == []


def test_scheduled_and_overdue_appears_in_both():
    # Product rule: a task scheduled on the selected day stays in Scheduled
    # even when its deadline has passed, and keeps its overdue indicator.
    task = Task(id="1", name="overlap", scheduled=DAY, due=date(2026, 9, 16))
    overview = build([task])

    assert names(overview.overdue_tasks) == ["overlap"]
    assert names(overview.scheduled_tasks) == ["overlap"]
    assert overview.due_tasks == []


def test_scheduled_and_due_today_lands_in_both():
    task = Task(id="1", name="due tonight", scheduled=DAY, due=DAY)
    overview = build([task])

    assert names(overview.scheduled_tasks) == ["due tonight"]
    assert names(overview.due_tasks) == ["due tonight"]
    assert overview.overdue_tasks == []


def test_datetime_values_normalize_to_their_date():
    tasks = [
        Task(id="1", name="meeting prep", scheduled=datetime(2026, 9, 17, 10, 30)),
        Task(id="2", name="lab report", due=datetime(2026, 9, 17, 23, 59)),
    ]
    overview = build(tasks)

    assert names(overview.scheduled_tasks) == ["meeting prep"]
    assert names(overview.due_tasks) == ["lab report"]


def test_events_pass_through():
    events = [
        CalendarEvent(
            id="e1",
            title="Standup",
            start=datetime(2026, 9, 17, 9),
            end=datetime(2026, 9, 17, 9, 30),
        )
    ]
    overview = build([], events=events)

    assert [e.title for e in overview.events] == ["Standup"]


def test_unscheduled_future_tasks_are_ignored():
    task = Task(id="1", name="future", scheduled=date(2026, 9, 20), due=date(2026, 9, 21))
    overview = build([task])

    assert overview.scheduled_tasks == []
    assert overview.due_tasks == []
    assert overview.overdue_tasks == []


def test_day_is_stored_on_the_overview():
    overview = build([])

    assert overview.day == DAY


def test_overdue_membership_is_distinct_from_scheduled_membership():
    # A task scheduled today and overdue yesterday lands in both lists; the
    # scheduled row derives its overdue indicator from overdue membership.
    scheduled_and_overdue = Task(id="1", name="both", scheduled=DAY, due=date(2026, 9, 16))
    scheduled_only = Task(id="2", name="on track", scheduled=DAY)
    overview = build([scheduled_and_overdue, scheduled_only])

    overdue_ids = {t.id for t in overview.overdue_tasks}
    assert overdue_ids == {"1"}
    assert [t.id for t in overview.scheduled_tasks] == ["1", "2"]


# --- get_today orchestration ---


def fetch_events_ok(day):
    return [
        CalendarEvent(
            id="e1",
            title="Standup",
            start=datetime(2026, 9, 17, 9),
            end=datetime(2026, 9, 17, 9, 30),
        )
    ]


def fetch_tasks_ok(day):
    return TaskFetchResult(tasks=[Task(id="1", name="walk dog", scheduled=DAY)])


def test_both_integrations_ok():
    overview = get_today(DAY, fetch_events_ok, fetch_tasks_ok)

    assert [e.title for e in overview.events] == ["Standup"]
    assert [t.name for t in overview.scheduled_tasks] == ["walk dog"]
    assert [(s.name, s.ok) for s in overview.statuses] == [("Calendar", True), ("Notion", True)]


def test_project_warning_keeps_tasks_and_reports_partial_failure():
    def fetch_tasks_with_warning(day):
        return TaskFetchResult(
            tasks=[Task(id="1", name="walk dog", scheduled=DAY)],
            warnings=["Could not load names for 1 project."],
        )

    overview = get_today(DAY, fetch_events_ok, fetch_tasks_with_warning)

    assert [task.name for task in overview.scheduled_tasks] == ["walk dog"]
    assert [(status.name, status.ok) for status in overview.statuses] == [
        ("Calendar", True),
        ("Notion", True),
        ("Notion projects", False),
    ]
    assert overview.statuses[-1].error == "Could not load names for 1 project."


def test_calendar_failure_degrades_gracefully():
    def fetch_events_fails(day):
        raise _fake_http_error()

    overview = get_today(DAY, fetch_events_fails, fetch_tasks_ok)

    # Calendar data is empty but Notion data still flows through.
    assert overview.events == []
    assert [t.name for t in overview.scheduled_tasks] == ["walk dog"]

    calendar_status = overview.statuses[0]
    assert calendar_status.name == "Calendar"
    assert calendar_status.ok is False
    assert "403" in calendar_status.error

    assert overview.statuses[1].ok is True


def test_notion_failure_degrades_gracefully():
    def fetch_tasks_fails(day):
        raise RequestException("boom")

    overview = get_today(DAY, fetch_events_ok, fetch_tasks_fails)

    assert [e.title for e in overview.events] == ["Standup"]
    assert overview.scheduled_tasks == []

    notion_status = overview.statuses[1]
    assert notion_status.name == "Notion"
    assert notion_status.ok is False
    assert notion_status.error == "boom"
    assert overview.statuses[0].ok is True


def test_both_failures_still_return_a_today():
    def fetch_events_fails(day):
        raise _fake_http_error(status=500, reason="Internal Error")

    def fetch_tasks_fails(day):
        raise RequestException("connection refused")

    overview = get_today(DAY, fetch_events_fails, fetch_tasks_fails)

    # The dashboard can still render: empty buckets, both failures reported.
    assert overview.events == []
    assert overview.scheduled_tasks == []
    assert overview.overdue_tasks == []
    assert overview.due_tasks == []

    calendar_status, notion_status = overview.statuses
    assert (calendar_status.ok, notion_status.ok) == (False, False)
    assert "500" in calendar_status.error
    assert notion_status.error == "connection refused"
