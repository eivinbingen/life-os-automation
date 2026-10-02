from datetime import date, datetime

from life_os.models.clean_up import HygieneItem
from life_os.models.notion import Task, TaskFetchResult
from life_os.services.clean_up import build_clean_up, build_hygiene, get_clean_up

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

    def fetch_hygiene():
        return TaskFetchResult(tasks=[Task(id="t9", name="Floating")])

    summary = get_clean_up(WEEK_START, WEEK_END, fetch_tasks, fetch_hygiene, local_day=LOCAL_DAY)
    assert summary.items == []
    assert summary.statuses == [{"name": "Notion", "ok": False, "error": "network down"}]
    # The independent hygiene read is unaffected by the unresolved failure.
    assert names(summary.hygiene) == ["Floating"]


def test_get_clean_up_surfaces_warnings():
    def fetch_tasks(start, end):
        return TaskFetchResult(
            tasks=[Task(id="t1", name="Overdue", due=date(2026, 9, 10))],
            warnings=["Could not load names for 1 project."],
        )

    def fetch_hygiene():
        return TaskFetchResult(tasks=[], warnings=[])

    summary = get_clean_up(
        WEEK_START, WEEK_END, fetch_tasks, fetch_hygiene, local_day=LOCAL_DAY
    )
    assert names(summary.items) == ["Overdue"]
    assert summary.warnings == ["Could not load names for 1 project."]


def test_floating_incomplete_task_in_hygiene():
    task = Task(id="t1", name="Floating")
    assert build_hygiene([task]) == [
        HygieneItem(id="t1", name="Floating", project_id=None, project_name=None)
    ]
    # A floating task can never satisfy the unresolved predicate.
    summary = build_clean_up(WEEK_START, WEEK_END, LOCAL_DAY, [], hygiene_tasks=[task])
    assert summary.items == []
    assert names(summary.hygiene) == ["Floating"]


def test_done_floating_task_excluded_from_hygiene():
    assert build_hygiene([Task(id="t1", name="Done", done=True)]) == []


def test_due_only_task_excluded_from_hygiene():
    assert build_hygiene([Task(id="t1", name="Has deadline", due=date(2026, 9, 30))]) == []


def test_scheduled_only_task_excluded_from_hygiene():
    # A datetime schedule also counts as a time anchor.
    assert (
        build_hygiene([Task(id="t1", name="Timed", scheduled=datetime(2026, 9, 16, 10, 0))])
        == []
    )


def test_hygiene_sorted_by_name_and_deduped():
    tasks = [
        Task(id="t1", name="Zebra"),
        Task(id="t2", name="Alpha"),
        Task(id="t1", name="Zebra"),
    ]
    assert names(build_hygiene(tasks)) == ["Alpha", "Zebra"]


def test_hygiene_carries_project_context():
    known = Task(id="t1", name="Linked", project_id="p1", project_name="Corporate Finance")
    unknown = Task(id="t2", name="Unresolvable", project_id="p2", project_name=None)
    items = build_hygiene([known, unknown])
    assert items[0].project_id == "p1"
    assert items[0].project_name == "Corporate Finance"
    # A failed name lookup is unknown, not "no project": the id is kept.
    assert items[1].project_id == "p2"
    assert items[1].project_name is None


def test_hygiene_empty_distinct_from_failure():
    summary = build_clean_up(WEEK_START, WEEK_END, LOCAL_DAY, [])
    assert summary.hygiene == []
    assert summary.statuses == []


def test_get_clean_up_degrades_hygiene_independently():
    def fetch_tasks(start, end):
        return TaskFetchResult(tasks=[Task(id="t1", name="Overdue", due=date(2026, 9, 10))])

    def fetch_hygiene():
        raise RuntimeError("notion down")

    summary = get_clean_up(WEEK_START, WEEK_END, fetch_tasks, fetch_hygiene, local_day=LOCAL_DAY)
    assert summary.hygiene == []
    assert summary.statuses == [
        {"name": "Notion hygiene", "ok": False, "error": "notion down"}
    ]
    # The unresolved queue is unaffected by the hygiene failure.
    assert names(summary.items) == ["Overdue"]


def test_get_clean_up_marks_unconfigured_hygiene():
    def fetch_tasks(start, end):
        return TaskFetchResult(tasks=[])

    summary = get_clean_up(WEEK_START, WEEK_END, fetch_tasks, local_day=LOCAL_DAY)
    assert summary.hygiene == []
    # Not configured is explicit, never a fake empty queue.
    assert summary.statuses == [
        {
            "name": "Notion hygiene",
            "ok": False,
            "error": "The hygiene queue is not configured on this service.",
        }
    ]


def test_get_clean_up_merges_and_dedupes_warnings():
    def fetch_tasks(start, end):
        return TaskFetchResult(tasks=[], warnings=["Could not load names for 1 project."])

    def fetch_hygiene():
        return TaskFetchResult(tasks=[], warnings=["Could not load names for 1 project."])

    summary = get_clean_up(
        WEEK_START, WEEK_END, fetch_tasks, fetch_hygiene, local_day=LOCAL_DAY
    )
    assert summary.statuses == []
    assert summary.warnings == ["Could not load names for 1 project."]
