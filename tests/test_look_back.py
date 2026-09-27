import ssl
from datetime import date, datetime

from requests import RequestException

from life_os.integrations.google_calendar import CalendarEvent
from life_os.models.look_back import LookBackSummary
from life_os.models.notion import Task, TaskFetchResult
from life_os.models.today import IntegrationStatus
from life_os.services.look_back import build_look_back, get_look_back

WEEK_START = date(2026, 9, 14)  # a Monday
WEEK_END = date(2026, 9, 20)


def task(task_id: str, scheduled=None, done=False, project_name=None, due=None) -> Task:
    return Task(
        id=task_id,
        name=f"Task {task_id}",
        done=done,
        scheduled=scheduled,
        due=due,
        project_id="project-1" if project_name else None,
        project_name=project_name,
    )


def event(event_id: str, day: date) -> CalendarEvent:
    return CalendarEvent(
        id=event_id,
        title=f"Event {event_id}",
        start=datetime(2026, 9, day.day, 9, 0, tzinfo=None),
        end=datetime(2026, 9, day.day, 10, 0, tzinfo=None),
        all_day=False,
    )


def test_metrics_carry_honest_labels_and_definitions():
    summary = build_look_back(
        WEEK_START,
        WEEK_END,
        [task("one", scheduled=date(2026, 9, 16), done=True, project_name="Life OS")],
        [task("one", scheduled=date(2026, 9, 16), done=True, project_name="Life OS")],
        [event("e1", date(2026, 9, 16))],
        [IntegrationStatus(name="Notion", ok=True), IntegrationStatus(name="Calendar", ok=True)],
    )

    by_key = {m.key: m for m in summary.metrics}
    assert by_key["tasks_scheduled_done"].available is True
    assert by_key["tasks_scheduled_done"].count == 1
    assert by_key["tasks_scheduled_done"].total == 1
    definition = by_key["tasks_scheduled_done"].definition
    assert "does not mean they were completed during the week" in definition
    assert by_key["tasks_scheduled_done"].label == "Tasks done"
    assert by_key["events_in_week"].count == 1
    assert by_key["events_in_week"].total is None
    assert by_key["projects_touched"].count == 1
    assert by_key["projects_touched"].label == "Projects worked on"
    assert by_key["projects_touched"].total is None
    # Completion-in-week is not measurable, so the stat is not offered at all.
    assert "completion_in_week" not in by_key


def test_tasks_total_counts_all_scheduled_in_week_including_done():
    summary = build_look_back(
        WEEK_START,
        WEEK_END,
        [
            task("a", scheduled=date(2026, 9, 16), done=True),
            task("b", scheduled=date(2026, 9, 17)),
            task("c", scheduled=date(2026, 9, 18)),
            task("outside", scheduled=date(2026, 9, 22)),
        ],
        [task("a", scheduled=date(2026, 9, 16), done=True)],
        [],
        [IntegrationStatus(name="Notion", ok=True)],
    )
    by_key = {m.key: m for m in summary.metrics}
    assert by_key["tasks_scheduled_done"].count == 1
    assert by_key["tasks_scheduled_done"].total == 3


def test_done_tasks_scheduled_outside_week_are_excluded():
    summary = build_look_back(
        WEEK_START,
        WEEK_END,
        [],
        [
            task("before", scheduled=date(2026, 9, 10), done=True),
            task("after", scheduled=date(2026, 9, 22), done=True),
            task("inside", scheduled=date(2026, 9, 16), done=True),
        ],
        [],
        [IntegrationStatus(name="Notion", ok=True)],
    )
    by_key = {m.key: m for m in summary.metrics}
    assert by_key["tasks_scheduled_done"].count == 1
    assert [t["id"] for t in summary.completed_tasks] == ["inside"]


def test_unfinished_excludes_done_and_outside_week_and_dedupes():
    summary = build_look_back(
        WEEK_START,
        WEEK_END,
        [
            task("dup", scheduled=date(2026, 9, 16)),
            task("dup", scheduled=date(2026, 9, 16)),
            task("done-task", scheduled=date(2026, 9, 16), done=True),
            task("outside", scheduled=date(2026, 9, 22)),
            task("due-only", due=date(2026, 9, 16)),
            task("inside", scheduled=date(2026, 9, 18)),
        ],
        [],
        [],
        [IntegrationStatus(name="Notion", ok=True)],
    )
    # The metric counts tasks scheduled in the week and not done; due-only
    # rows are excluded from the unfinished list.
    assert [t["id"] for t in summary.unfinished_tasks] == ["dup", "inside"]


def test_notion_failure_marks_measures_unavailable_not_zero():
    summary = build_look_back(
        WEEK_START,
        WEEK_END,
        [],
        [],
        [],
        [IntegrationStatus(name="Notion", ok=False, error="down")],
    )
    by_key = {m.key: m for m in summary.metrics}
    assert by_key["tasks_scheduled_done"].available is False
    assert by_key["tasks_scheduled_done"].count is None
    assert by_key["projects_touched"].available is False
    assert any(s["name"] == "Notion" and not s["ok"] for s in summary.statuses)


def test_calendar_failure_marks_events_unavailable_not_zero():
    summary = build_look_back(
        WEEK_START,
        WEEK_END,
        [],
        [],
        [],
        [IntegrationStatus(name="Calendar", ok=False, error="down")],
    )
    by_key = {m.key: m for m in summary.metrics}
    assert by_key["events_in_week"].available is False
    assert by_key["events_in_week"].count is None


def test_empty_week_with_ok_sources_is_zero_not_unavailable():
    summary = build_look_back(
        WEEK_START,
        WEEK_END,
        [],
        [],
        [],
        [IntegrationStatus(name="Notion", ok=True), IntegrationStatus(name="Calendar", ok=True)],
    )
    by_key = {m.key: m for m in summary.metrics}
    assert by_key["tasks_scheduled_done"].available is True
    assert by_key["tasks_scheduled_done"].count == 0
    assert by_key["events_in_week"].count == 0
    assert summary.completed_tasks == []
    assert summary.unfinished_tasks == []


def test_projects_touched_merges_completed_and_unfinished_evidence():
    summary = build_look_back(
        WEEK_START,
        WEEK_END,
        [task("u", scheduled=date(2026, 9, 16), project_name="Alpha")],
        [task("c", scheduled=date(2026, 9, 17), done=True, project_name="Beta")],
        [],
        [IntegrationStatus(name="Notion", ok=True)],
    )
    by_key = {m.key: m for m in summary.metrics}
    # Plain count: no share, since projects completed/dropped during the
    # week have no reliable total to be a denominator.
    assert by_key["projects_touched"].count == 2
    assert by_key["projects_touched"].total is None
    assert by_key["projects_touched"].definition.startswith("Distinct projects")


def test_completed_tasks_and_unfinished_entries_carry_id_name_project():
    summary = build_look_back(
        WEEK_START,
        WEEK_END,
        [task("u1", scheduled=date(2026, 9, 16), project_name="Alpha")],
        [task("c1", scheduled=date(2026, 9, 17), done=True, project_name="Beta")],
        [],
        [IntegrationStatus(name="Notion", ok=True)],
    )
    assert summary.completed_tasks == [
        {"id": "c1", "name": "Task c1", "project_name": "Beta"}
    ]
    assert summary.unfinished_tasks == [
        {"id": "u1", "name": "Task u1", "project_name": "Alpha"}
    ]


def test_summary_roundtrip_preserves_definitions_and_availability():
    summary = build_look_back(
        WEEK_START,
        WEEK_END,
        [],
        [],
        [],
        [IntegrationStatus(name="Notion", ok=True), IntegrationStatus(name="Calendar", ok=True)],
    )
    restored = LookBackSummary.from_dict(summary.to_dict())
    assert restored.metrics == summary.metrics
    assert restored.completed_tasks == []
    assert restored.captured_at == summary.captured_at


def test_get_look_back_degrades_on_fetch_failures():
    def fail_week_tasks(start, end):
        raise RequestException("Notion down")

    def fail_done_tasks(start, end):
        raise RequestException("Notion down")

    def fail_events(start, end):
        raise RequestException("Calendar down")

    summary = get_look_back(
        WEEK_START, WEEK_END, fail_week_tasks, fail_done_tasks, fail_events
    )
    by_key = {m.key: m for m in summary.metrics}
    assert by_key["tasks_scheduled_done"].available is False
    assert by_key["events_in_week"].available is False
    assert all(s["ok"] is False for s in summary.statuses)


def test_get_look_back_degrades_on_unexpected_errors():
    # An unexpected error (e.g. ssl.SSLError from the Google client) must
    # degrade the source, not propagate and 500 the endpoint.
    def fail_events(start, end):
        raise ssl.SSLError(1, "wrong version number")

    summary = get_look_back(
        WEEK_START,
        WEEK_END,
        lambda start, end: TaskFetchResult(tasks=[]),
        lambda start, end: TaskFetchResult(tasks=[]),
        fail_events,
    )
    by_key = {m.key: m for m in summary.metrics}
    assert by_key["events_in_week"].available is False
    assert by_key["tasks_scheduled_done"].available is True
    statuses = {s["name"]: s for s in summary.statuses}
    assert statuses["Calendar"]["ok"] is False
    assert statuses["Notion"]["ok"] is True


def test_get_look_back_returns_live_data_from_fetchers():
    def week_tasks(start, end):
        return TaskFetchResult(tasks=[task("u1", scheduled=date(2026, 9, 16))])

    def done_tasks(start, end):
        return TaskFetchResult(tasks=[task("c1", scheduled=date(2026, 9, 17), done=True)])

    def events(start, end):
        return [event("e1", date(2026, 9, 16))]

    summary = get_look_back(WEEK_START, WEEK_END, week_tasks, done_tasks, events)
    by_key = {m.key: m for m in summary.metrics}
    assert by_key["tasks_scheduled_done"].count == 1
    assert by_key["events_in_week"].count == 1
    assert [t["id"] for t in summary.unfinished_tasks] == ["u1"]
    assert [t["id"] for t in summary.completed_tasks] == ["c1"]
