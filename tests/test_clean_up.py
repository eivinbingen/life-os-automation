from datetime import date, datetime

from life_os.models.notion import Task
from life_os.services.clean_up import build_clean_up, get_clean_up

WEEK_START = date(2026, 9, 14)
WEEK_END = date(2026, 9, 20)
LOCAL_DAY = date(2026, 9, 27)


def names(items):
    return [item.name for item in items]


def test_overdue_task_included():
    task = Task(id="t1", name="Overdue task", due=date(2026, 9, 10))
    summary = build_clean_up(WEEK_START, WEEK_END, LOCAL_DAY, [task])
    assert names(summary.items) == ["Overdue task"]
    assert summary.items[0].overdue is True
    assert summary.items[0].scheduled_in_week is False


def test_scheduled_in_week_incomplete_included():
    task = Task(id="t1", name="Week task", scheduled=date(2026, 9, 16))
    summary = build_clean_up(WEEK_START, WEEK_END, LOCAL_DAY, [task])
    assert names(summary.items) == ["Week task"]
    assert summary.items[0].overdue is False
    assert summary.items[0].scheduled_in_week is True


def test_both_reasons_single_deduped_row():
    task = Task(id="t1", name="Both", scheduled=date(2026, 9, 16), due=date(2026, 9, 10))
    summary = build_clean_up(WEEK_START, WEEK_END, LOCAL_DAY, [task, task])
    assert len(summary.items) == 1
    assert summary.items[0].overdue is True
    assert summary.items[0].scheduled_in_week is True


def test_due_on_local_day_not_overdue():
    task = Task(id="t1", name="Due today", due=LOCAL_DAY)
    summary = build_clean_up(WEEK_START, WEEK_END, LOCAL_DAY, [task])
    assert summary.items == []


def test_unscheduled_due_after_local_day_excluded():
    # Fetched by the filter's Due <= week_end superset but not qualifying:
    # a deadline between the as-of day and the reviewed week's end.
    task = Task(id="t1", name="Future deadline", due=date(2026, 9, 30))
    summary = build_clean_up(date(2026, 9, 28), date(2026, 10, 4), LOCAL_DAY, [task])
    assert summary.items == []


def test_done_task_excluded():
    task = Task(id="t1", name="Finished", scheduled=date(2026, 9, 16), done=True)
    summary = build_clean_up(WEEK_START, WEEK_END, LOCAL_DAY, [task])
    assert summary.items == []


def test_unscheduled_no_due_excluded():
    task = Task(id="t1", name="Floating")
    summary = build_clean_up(WEEK_START, WEEK_END, LOCAL_DAY, [task])
    assert summary.items == []


def test_sorting_overdue_first_then_name():
    tasks = [
        Task(id="t1", name="Zeta week", scheduled=date(2026, 9, 16)),
        Task(id="t2", name="Alpha overdue", due=date(2026, 9, 10)),
        Task(id="t3", name="Beta week", scheduled=date(2026, 9, 17)),
    ]
    summary = build_clean_up(WEEK_START, WEEK_END, LOCAL_DAY, tasks)
    assert names(summary.items) == ["Alpha overdue", "Beta week", "Zeta week"]


def test_datetime_dates_parse():
    task = Task(
        id="t1",
        name="Timed",
        scheduled=datetime(2026, 9, 16, 10, 0),
        due=datetime(2026, 9, 10, 9, 0),
    )
    summary = build_clean_up(WEEK_START, WEEK_END, LOCAL_DAY, [task])
    assert summary.items[0].overdue is True
    assert summary.items[0].scheduled_in_week is True
    assert summary.items[0].scheduled == "2026-09-16T10:00:00"


def test_empty_queue_distinct_from_failure():
    summary = build_clean_up(WEEK_START, WEEK_END, LOCAL_DAY, [])
    assert summary.items == []
    assert summary.statuses == []


def test_get_clean_up_degrades_on_fetch_failure():
    def fetch_tasks(start, end):
        raise RuntimeError("network down")

    summary = get_clean_up(WEEK_START, WEEK_END, fetch_tasks, local_day=LOCAL_DAY)
    assert summary.items == []
    assert summary.statuses == [{"name": "Notion", "ok": False, "error": "network down"}]


def test_get_clean_up_surfaces_warnings():
    def fetch_tasks(start, end):
        from life_os.models.notion import TaskFetchResult

        return TaskFetchResult(
            tasks=[Task(id="t1", name="Overdue", due=date(2026, 9, 10))],
            warnings=["Could not load names for 1 project."],
        )

    summary = get_clean_up(WEEK_START, WEEK_END, fetch_tasks, local_day=LOCAL_DAY)
    assert names(summary.items) == ["Overdue"]
    assert summary.warnings == ["Could not load names for 1 project."]
