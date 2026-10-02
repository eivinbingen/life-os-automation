from datetime import date, datetime
from zoneinfo import ZoneInfo

from life_os.models.calendar import CalendarEvent
from life_os.models.courses import Course, CourseScheduleItem, StudiesOverview
from life_os.models.notion import Task, TaskFetchResult
from life_os.services.ahead import build_ahead, get_ahead

WEEK_START = date(2026, 9, 14)
WEEK_END = date(2026, 9, 20)
AHEAD_START = date(2026, 9, 21)
AHEAD_END = date(2026, 9, 27)

_TZ = ZoneInfo("Europe/Zurich")


def build(events=None, tasks=None, studies=None):
    return build_ahead(
        WEEK_START, WEEK_END, AHEAD_START, AHEAD_END, events or [], tasks or [], studies
    )


def zoned(*args):
    return datetime(*args, tzinfo=_TZ)


def rows(summary):
    return [(item.day.isoformat(), item.kind, item.name) for item in summary.items]


def test_paired_dates_and_timezone():
    summary = build()
    assert summary.week_start == WEEK_START
    assert summary.week_end == WEEK_END
    assert summary.ahead_start == AHEAD_START
    assert summary.ahead_end == AHEAD_END
    assert summary.timezone == "Europe/Zurich"
    assert summary.items == []
    assert summary.exceptions == []
    assert summary.statuses == []


def test_scheduled_and_due_rows_for_same_task():
    task = Task(id="t1", name="Both", scheduled=date(2026, 9, 22), due=date(2026, 9, 24))
    summary = build(tasks=[task])
    assert rows(summary) == [
        ("2026-09-22", "scheduled", "Both"),
        ("2026-09-24", "due", "Both"),
    ]
    assert [item.id for item in summary.items] == ["t1:scheduled", "t1:due"]
    # Both rows carry the other date so the timeline shows distinct information.
    assert summary.items[0].due == "2026-09-24"
    assert summary.items[1].scheduled == "2026-09-22"


def test_same_day_scheduled_and_due_two_rows():
    task = Task(id="t1", name="Same day", scheduled=date(2026, 9, 22), due=date(2026, 9, 22))
    summary = build(tasks=[task])
    assert rows(summary) == [
        ("2026-09-22", "scheduled", "Same day"),
        ("2026-09-22", "due", "Same day"),
    ]


def test_day_internal_ordering():
    events = [
        CalendarEvent(
            id="e-late",
            title="Late meeting",
            start=zoned(2026, 9, 22, 15, 0),
            end=zoned(2026, 9, 22, 16, 0),
        ),
        CalendarEvent(
            id="e-early",
            title="Early meeting",
            start=zoned(2026, 9, 22, 9, 0),
            end=zoned(2026, 9, 22, 10, 0),
        ),
    ]
    tasks = [
        Task(id="t-due", name="Due task", due=date(2026, 9, 22)),
        Task(id="t-timed", name="Timed task", scheduled=zoned(2026, 9, 22, 10, 30)),
    ]
    studies = StudiesOverview(
        upcoming=[
            CourseScheduleItem(
                id="c1:exam",
                name="Exam / Final Deadline",
                kind="assessment",
                course_id="c1",
                course_name="Course",
                due=date(2026, 9, 22),
            ),
        ],
    )
    summary = build(events=events, tasks=tasks, studies=studies)
    # Dateless rows (all-day events, date-only tasks, assessments) open the
    # day at midnight in kind-rank order; timed rows follow by their own time.
    assert rows(summary) == [
        ("2026-09-22", "due", "Due task"),
        ("2026-09-22", "assessment", "Exam / Final Deadline"),
        ("2026-09-22", "event", "Early meeting"),
        ("2026-09-22", "scheduled", "Timed task"),
        ("2026-09-22", "event", "Late meeting"),
    ]


def test_dateless_kind_rank_order():
    # Same midnight slot: events, then scheduled, then due, then assessments.
    events = [
        CalendarEvent(
            id="e-allday",
            title="All day off",
            start=zoned(2026, 9, 22, 0, 0),
            end=zoned(2026, 9, 23, 0, 0),
            all_day=True,
        ),
    ]
    tasks = [
        Task(id="t-sched", name="Sched task", scheduled=date(2026, 9, 22)),
        Task(id="t-due", name="Due task", due=date(2026, 9, 22)),
    ]
    studies = StudiesOverview(
        upcoming=[
            CourseScheduleItem(
                id="c1:exam",
                name="Exam / Final Deadline",
                kind="assessment",
                course_id="c1",
                due=date(2026, 9, 22),
            ),
        ],
    )
    summary = build(events=events, tasks=tasks, studies=studies)
    assert rows(summary) == [
        ("2026-09-22", "event", "All day off"),
        ("2026-09-22", "scheduled", "Sched task"),
        ("2026-09-22", "due", "Due task"),
        ("2026-09-22", "assessment", "Exam / Final Deadline"),
    ]


def test_multi_day_event_appears_each_day_with_continues():
    event = CalendarEvent(
        id="e1",
        title="Trip",
        start=zoned(2026, 9, 22, 0, 0),
        end=zoned(2026, 9, 25, 0, 0),
        all_day=True,
    )
    summary = build(events=[event])
    by_day = {item.day: item for item in summary.items}
    assert set(by_day) == {date(2026, 9, 22), date(2026, 9, 23), date(2026, 9, 24)}
    assert by_day[date(2026, 9, 22)].continues is False
    assert by_day[date(2026, 9, 23)].continues is True
    assert by_day[date(2026, 9, 24)].continues is True
    assert all(item.all_day for item in summary.items)


def test_overnight_event_continues_next_day():
    event = CalendarEvent(
        id="e1",
        title="Late shift",
        start=zoned(2026, 9, 22, 23, 0),
        end=zoned(2026, 9, 23, 1, 0),
    )
    summary = build(events=[event])
    by_day = {item.day: item for item in summary.items}
    assert set(by_day) == {date(2026, 9, 22), date(2026, 9, 23)}
    assert by_day[date(2026, 9, 23)].continues is True


def test_repeated_source_records_dedupe():
    event = CalendarEvent(
        id="e1", title="Meeting", start=zoned(2026, 9, 22, 9, 0), end=zoned(2026, 9, 22, 10, 0)
    )
    task = Task(id="t1", name="Task", scheduled=date(2026, 9, 22))
    summary = build(events=[event, event], tasks=[task, task])
    # The date-only task opens the day before the timed meeting.
    assert rows(summary) == [
        ("2026-09-22", "scheduled", "Task"),
        ("2026-09-22", "event", "Meeting"),
    ]


def test_fetch_superset_filtered_to_ahead_week():
    # The task filter returns everything incomplete due <= ahead_end plus
    # anything scheduled in the week; rows appear only for the ahead week.
    tasks = [
        Task(id="t-overdue", name="Overdue", due=date(2026, 9, 15)),
        Task(id="t-future", name="After the week", due=date(2026, 9, 28)),
        Task(
            id="t-sched-out",
            name="Scheduled elsewhere",
            scheduled=date(2026, 10, 5),
            due=date(2026, 9, 24),
        ),
    ]
    summary = build(tasks=tasks)
    # Overdue belongs to Clean Up; the far-future due is out of the window.
    # A task due in the week but scheduled outside keeps only its due row.
    assert rows(summary) == [("2026-09-24", "due", "Scheduled elsewhere")]
    assert summary.exceptions == []


def test_exceptions_only_unscheduled_deadlines_in_week():
    tasks = [
        Task(id="t-hit", name="Unscheduled deadline", due=date(2026, 9, 24)),
        Task(
            id="t-sched",
            name="Has work date",
            scheduled=date(2026, 9, 22),
            due=date(2026, 9, 24),
        ),
        Task(id="t-done", name="Finished", due=date(2026, 9, 24), done=True),
        Task(id="t-outside", name="Outside", due=date(2026, 9, 28)),
        Task(id="t-past", name="Past", due=date(2026, 9, 15)),
    ]
    summary = build(tasks=tasks)
    assert [(e.task_id, e.name) for e in summary.exceptions] == [("t-hit", "Unscheduled deadline")]
    assert summary.exceptions[0].due == "2026-09-24"


def test_exception_has_scheduled_after_due_not_an_exception():
    # A due date with any scheduled work date is not an exception: the
    # check is objective presence, not scheduling quality.
    task = Task(id="t1", name="Late work", scheduled=date(2026, 9, 26), due=date(2026, 9, 24))
    summary = build(tasks=[task])
    assert summary.exceptions == []


def test_exam_assessment_row_and_course_enrichment():
    studies = StudiesOverview(
        courses=[Course(id="c1", name="Linear Algebra")],
        upcoming=[
            CourseScheduleItem(
                id="c1:exam",
                name="Exam / Final Deadline",
                kind="assessment",
                course_id="c1",
                course_name="Linear Algebra",
                due=date(2026, 9, 24),
            ),
            CourseScheduleItem(
                id="c2:exam",
                name="Exam / Final Deadline",
                kind="assessment",
                course_id="c2",
                course_name="Other course",
                due=date(2026, 10, 5),
            ),
            CourseScheduleItem(
                id="t1",
                name="Problem set",
                kind="deadline",
                course_id="c1",
                course_name="Linear Algebra",
                due=date(2026, 9, 23),
            ),
        ],
    )
    tasks = [Task(id="t1", name="Problem set", due=date(2026, 9, 23), course_id="c1")]
    summary = build(tasks=tasks, studies=studies)
    # The out-of-window exam is excluded; the in-window exam is its own
    # assessment row, and the course-linked deadline stays one row - the
    # task row wins, enriched with the course name from the studies read.
    assert rows(summary) == [
        ("2026-09-23", "due", "Problem set"),
        ("2026-09-24", "assessment", "Exam / Final Deadline"),
    ]
    problem_set = summary.items[0]
    assert problem_set.course_name == "Linear Algebra"
    # The problem set is due in the ahead week with no work date, so it is
    # an objective planning exception alongside its timeline row.
    assert [(e.task_id, e.name) for e in summary.exceptions] == [("t1", "Problem set")]


def test_studies_item_survives_as_fallback_when_task_unknown():
    # The task source failed but Studies succeeded: the course-linked
    # item stays visible as a labeled row instead of vanishing.
    studies = StudiesOverview(
        courses=[Course(id="c1", name="Linear Algebra")],
        upcoming=[
            CourseScheduleItem(
                id="t1",
                name="Problem set",
                kind="deadline",
                course_id="c1",
                course_name="Linear Algebra",
                due=date(2026, 9, 23),
            ),
            CourseScheduleItem(
                id="t2",
                name="Reading",
                kind="study_task",
                course_id="c1",
                course_name="Linear Algebra",
                due=date(2026, 9, 25),
            ),
        ],
    )
    summary = build(tasks=[], studies=studies)
    assert rows(summary) == [
        ("2026-09-23", "due", "Problem set"),
        ("2026-09-25", "scheduled", "Reading"),
    ]
    problem_set = summary.items[0]
    assert problem_set.task_id == "t1"
    assert problem_set.course_name == "Linear Algebra"
    assert problem_set.due == "2026-09-23"
    reading = summary.items[1]
    assert reading.task_id == "t2"
    assert reading.scheduled == "2026-09-25"


def test_dst_fall_back_week_events():
    # Ahead week 2026-10-19..25 spans the Europe/Zurich fall-back transition
    # on Sunday 2026-10-25; a multi-day event covers both offsets.
    events = [
        CalendarEvent(
            id="e1",
            title="Retreat",
            start=zoned(2026, 10, 24, 0, 0),
            end=zoned(2026, 10, 27, 0, 0),
            all_day=True,
        ),
        CalendarEvent(
            id="e2",
            title="Transition-day meeting",
            start=zoned(2026, 10, 25, 10, 0),
            end=zoned(2026, 10, 25, 11, 0),
        ),
    ]
    summary = build_ahead(
        date(2026, 10, 12),
        date(2026, 10, 18),
        date(2026, 10, 19),
        date(2026, 10, 25),
        events,
        [],
    )
    by_day = {}
    for item in summary.items:
        by_day.setdefault(item.day, []).append(item)
    assert set(by_day) == {date(2026, 10, 24), date(2026, 10, 25)}
    assert [i.name for i in by_day[date(2026, 10, 24)]] == ["Retreat"]
    # On the transition day the all-day retreat (still running) opens the
    # day before the timed meeting.
    assert [i.name for i in by_day[date(2026, 10, 25)]] == ["Retreat", "Transition-day meeting"]
    assert by_day[date(2026, 10, 25)][0].continues is True
    # The timed row keeps its Zurich offset through the transition.
    assert by_day[date(2026, 10, 25)][1].when.endswith("+01:00")


def test_get_ahead_degrades_per_source():
    def failing_events(start, end):
        raise RuntimeError("calendar down")

    def fetch_tasks(start, end):
        return TaskFetchResult(
            tasks=[Task(id="t1", name="In week", scheduled=date(2026, 9, 22))]
        )

    summary = get_ahead(
        WEEK_START, WEEK_END, AHEAD_START, AHEAD_END,
        failing_events, fetch_tasks, None,
    )
    names = [row.name for row in summary.items]
    assert names == ["In week"]
    assert summary.statuses == [
        {"name": "Calendar", "ok": False, "error": "calendar down"},
        {
            "name": "Studies",
            "ok": False,
            "error": "Studies context is not configured on this service.",
        },
    ]


def test_get_ahead_task_failure_keeps_events():
    def fetch_events(start, end):
        return [
            CalendarEvent(
                id="e1",
                title="Meeting",
                start=zoned(2026, 9, 22, 9, 0),
                end=zoned(2026, 9, 22, 10, 0),
            )
        ]

    def failing_tasks(start, end):
        raise RuntimeError("notion down")

    summary = get_ahead(
        WEEK_START, WEEK_END, AHEAD_START, AHEAD_END,
        fetch_events, failing_tasks, None,
    )
    assert rows(summary) == [("2026-09-22", "event", "Meeting")]
    assert summary.exceptions == []
    assert summary.statuses == [
        {"name": "Notion", "ok": False, "error": "notion down"},
        {
            "name": "Studies",
            "ok": False,
            "error": "Studies context is not configured on this service.",
        },
    ]


def test_get_ahead_studies_failure_does_not_block():
    def fetch_events(start, end):
        return []

    def fetch_tasks(start, end):
        return TaskFetchResult(
            tasks=[Task(id="t1", name="In week", scheduled=date(2026, 9, 22))]
        )

    def failing_studies(start, end):
        raise RuntimeError("courses query failed")

    summary = get_ahead(
        WEEK_START, WEEK_END, AHEAD_START, AHEAD_END,
        fetch_events, fetch_tasks, failing_studies,
    )
    assert [row.name for row in summary.items] == ["In week"]
    assert summary.statuses == [
        {"name": "Studies", "ok": False, "error": "courses query failed"}
    ]


def test_get_ahead_surfaces_studies_secondary_failure():
    def fetch_events(start, end):
        return []

    def fetch_tasks(start, end):
        return TaskFetchResult(tasks=[])

    def studies(start, end):
        from life_os.models.today import IntegrationStatus

        return StudiesOverview(
            statuses=[IntegrationStatus(name="Notion", ok=False, error="tasks query failed")],
            warnings=["Could not load upcoming academic work."],
        )

    summary = get_ahead(
        WEEK_START, WEEK_END, AHEAD_START, AHEAD_END,
        fetch_events, fetch_tasks, studies,
    )
    assert summary.statuses == [
        {"name": "Studies", "ok": False, "error": "tasks query failed"}
    ]
    assert summary.warnings == ["Could not load upcoming academic work."]


def test_get_ahead_dedupes_repeated_warnings():
    # Both the task read and the studies read query the same task pages,
    # so identical warnings must not repeat.
    def fetch_events(start, end):
        return []

    def fetch_tasks(start, end):
        return TaskFetchResult(tasks=[], warnings=["Could not load names for 1 project."])

    def studies(start, end):
        return StudiesOverview(warnings=["Could not load names for 1 project."])

    summary = get_ahead(
        WEEK_START, WEEK_END, AHEAD_START, AHEAD_END,
        fetch_events, fetch_tasks, studies,
    )
    assert summary.warnings == ["Could not load names for 1 project."]
    assert summary.statuses == []


def test_get_ahead_all_sources_ok_has_no_statuses():
    def fetch_events(start, end):
        return []

    def fetch_tasks(start, end):
        return TaskFetchResult(tasks=[])

    def studies(start, end):
        return StudiesOverview()

    summary = get_ahead(
        WEEK_START, WEEK_END, AHEAD_START, AHEAD_END,
        fetch_events, fetch_tasks, studies,
    )
    assert summary.items == []
    assert summary.statuses == []
    assert summary.warnings == []
