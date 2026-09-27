from datetime import date

import pytest
from requests import RequestException

from life_os.integrations import notion_courses
from life_os.integrations.notion_courses import fetch_studies_overview
from life_os.models.notion import TaskFetchResult


class FakeResponse:
    def __init__(self, data, error: RequestException | None = None):
        self.data = data
        self.error = error

    def raise_for_status(self):
        if self.error:
            raise self.error

    def json(self):
        return self.data


def course_page(
    course_id: str,
    title: str,
    status: str = "Active",
    exam: str | None = None,
    properties: dict | None = None,
):
    if properties is None:
        props = {
            "Title": {"type": "title", "title": [{"plain_text": title}]},
            "Status": {"type": "status", "status": {"name": status}},
            "Exam / Final Deadline": {"type": "date", "date": {"start": exam} if exam else None},
            "✅ Tasks": {"type": "relation", "relation": []},
        }
    else:
        props = properties
    return {"id": course_id, "properties": props}


def task_page(task_id: str, course_id: str | None, scheduled: str, due: str | None = None):
    return {
        "id": task_id,
        "properties": {
            "Name": {"title": [{"plain_text": f"Task {task_id}"}]},
            "Done": {"checkbox": False},
            "Scheduled": {"date": {"start": scheduled}},
            "Due": {"date": {"start": due} if due else None},
            "Project": {"relation": []},
            "Course": {"relation": [{"id": course_id}] if course_id else []},
        },
    }


def task_stub(pages: list[dict], warnings: list[str] | None = None):
    from life_os.models.notion import Task

    tasks = [
        Task(
            id=p["id"],
            name=p["properties"]["Name"]["title"][0]["plain_text"],
            scheduled=date.fromisoformat(p["properties"]["Scheduled"]["date"]["start"]),
            due=date.fromisoformat(p["properties"]["Due"]["date"]["start"])
            if p["properties"]["Due"]["date"]
            else None,
            course_id=next(
                (r["id"] for r in p["properties"]["Course"]["relation"]), None
            ),
        )
        for p in pages
    ]
    return TaskFetchResult(tasks=tasks, warnings=warnings or [])


def courses_result(pages: list[dict]):
    return FakeResponse({"results": pages, "has_more": False, "next_cursor": None})


TODAY = date(2026, 9, 27)


def test_two_active_courses_appear(monkeypatch):
    course_res = courses_result(
        [course_page("course-1", "Corporate Finance"), course_page("course-2", "Machine Learning")]
    )
    task_res = task_stub([])
    posts = []

    def post(**kwargs):
        posts.append(kwargs)
        return course_res if "/data_sources/courses-ds/query" in kwargs.get("url", "") else task_res

    monkeypatch.setattr(notion_courses.requests, "post", post)
    monkeypatch.setattr(
        notion_courses, "fetch_tasks_for_range", lambda *args, **kwargs: task_stub([])
    )

    overview = fetch_studies_overview(
        token="secret",
        courses_data_source_id="courses-ds",
        tasks_data_source_id="tasks-ds",
        today=TODAY,
        page_size=100,
    )

    assert [c.name for c in overview.courses] == ["Corporate Finance", "Machine Learning"]
    assert overview.statuses == []
    assert len(posts) == 1


def test_course_with_task_relation_gets_next_item(monkeypatch):
    course_res = courses_result([course_page("course-1", "Corporate Finance")])
    task_res = task_stub(
        [task_page("task-1", "course-1", scheduled="2026-10-01", due="2026-10-05")]
    )

    monkeypatch.setattr(notion_courses.requests, "post", lambda **kwargs: course_res)
    monkeypatch.setattr(notion_courses, "fetch_tasks_for_range", lambda *args, **kwargs: task_res)

    overview = fetch_studies_overview(
        token="secret",
        courses_data_source_id="courses-ds",
        tasks_data_source_id="tasks-ds",
        today=TODAY,
        page_size=100,
    )

    course = overview.courses[0]
    assert course.next_item is not None
    assert course.next_item.name == "Task task-1"
    assert course.next_item.kind == "deadline"
    assert course.next_item.due == date(2026, 10, 5)


def test_course_without_work_still_listed(monkeypatch):
    course_res = courses_result([course_page("course-1", "Corporate Finance")])
    task_res = task_stub([])

    monkeypatch.setattr(notion_courses.requests, "post", lambda **kwargs: course_res)
    monkeypatch.setattr(notion_courses, "fetch_tasks_for_range", lambda *args, **kwargs: task_res)

    overview = fetch_studies_overview(
        token="secret",
        courses_data_source_id="courses-ds",
        tasks_data_source_id="tasks-ds",
        today=TODAY,
        page_size=100,
    )

    course = overview.courses[0]
    assert course.name == "Corporate Finance"
    assert course.next_item is None
    assert course.upcoming == []


def test_task_without_course_relation_still_in_upcoming(monkeypatch):
    course_res = courses_result([course_page("course-1", "Corporate Finance")])
    task_res = task_stub([task_page("task-9", None, scheduled="2026-10-01")])

    monkeypatch.setattr(notion_courses.requests, "post", lambda **kwargs: course_res)
    monkeypatch.setattr(notion_courses, "fetch_tasks_for_range", lambda *args, **kwargs: task_res)

    overview = fetch_studies_overview(
        token="secret",
        courses_data_source_id="courses-ds",
        tasks_data_source_id="tasks-ds",
        today=TODAY,
        page_size=100,
    )

    assert len(overview.upcoming) == 1
    item = overview.upcoming[0]
    assert item.course_id is None
    assert item.course_name is None
    assert item.kind == "study_task"


def test_upcoming_sorted_by_date_then_name(monkeypatch):
    course_res = courses_result([course_page("course-1", "Corporate Finance")])
    task_res = task_stub(
        [
            task_page("task-b", "course-1", scheduled="2026-10-03", due="2026-10-03"),
            task_page("task-a", "course-1", scheduled="2026-10-03", due="2026-10-03"),
            task_page("task-c", "course-1", scheduled="2026-10-01", due="2026-10-01"),
        ]
    )

    monkeypatch.setattr(notion_courses.requests, "post", lambda **kwargs: course_res)
    monkeypatch.setattr(notion_courses, "fetch_tasks_for_range", lambda *args, **kwargs: task_res)

    overview = fetch_studies_overview(
        token="secret",
        courses_data_source_id="courses-ds",
        tasks_data_source_id="tasks-ds",
        today=TODAY,
        page_size=100,
    )

    names = [item.name for item in overview.upcoming]
    assert names == ["Task task-c", "Task task-a", "Task task-b"]


def test_tasks_failure_degrades_with_status(monkeypatch):
    course_res = courses_result([course_page("course-1", "Corporate Finance")])

    def raise_tasks(*args, **kwargs):
        raise RequestException("tasks down")

    monkeypatch.setattr(notion_courses.requests, "post", lambda **kwargs: course_res)
    monkeypatch.setattr(notion_courses, "fetch_tasks_for_range", raise_tasks)

    overview = fetch_studies_overview(
        token="secret",
        courses_data_source_id="courses-ds",
        tasks_data_source_id="tasks-ds",
        today=TODAY,
        page_size=100,
    )

    assert [c.name for c in overview.courses] == ["Corporate Finance"]
    assert [(s.name, s.ok, s.error) for s in overview.statuses] == [
        ("Notion", False, "tasks down")
    ]
    assert overview.warnings


def test_courses_failure_propagates(monkeypatch):
    def raise_courses(**kwargs):
        raise RequestException("courses down")

    monkeypatch.setattr(notion_courses.requests, "post", raise_courses)

    with pytest.raises(RequestException):
        fetch_studies_overview(
            token="secret",
            courses_data_source_id="courses-ds",
            tasks_data_source_id="tasks-ds",
            today=TODAY,
            page_size=100,
        )


def test_query_body_filters_active_status(monkeypatch):
    captured = {}

    def post(**kwargs):
        captured.update(kwargs)
        return courses_result([])

    monkeypatch.setattr(notion_courses.requests, "post", post)
    monkeypatch.setattr(
        notion_courses, "fetch_tasks_for_range", lambda *args, **kwargs: task_stub([])
    )

    fetch_studies_overview(
        token="secret",
        courses_data_source_id="courses-ds",
        tasks_data_source_id="tasks-ds",
        today=TODAY,
        page_size=100,
    )

    assert captured["json"]["filter"] == {
        "property": "Status",
        "status": {"equals": "Active"},
    }


def test_date_only_and_datetime_due_both_parse(monkeypatch):
    course_res = courses_result(
        [
            course_page("course-1", "Corporate Finance", exam="2026-11-20"),
            course_page("course-2", "Machine Learning", exam="2026-11-21T09:00:00+01:00"),
        ]
    )
    task_res = task_stub([])

    monkeypatch.setattr(notion_courses.requests, "post", lambda **kwargs: course_res)
    monkeypatch.setattr(notion_courses, "fetch_tasks_for_range", lambda *args, **kwargs: task_res)

    overview = fetch_studies_overview(
        token="secret",
        courses_data_source_id="courses-ds",
        tasks_data_source_id="tasks-ds",
        today=TODAY,
        page_size=100,
    )

    exam_1 = overview.courses[0].upcoming[0]
    exam_2 = overview.courses[1].upcoming[0]
    assert exam_1.due == date(2026, 11, 20)
    assert exam_2.due.year == 2026 and exam_2.due.month == 11 and exam_2.due.day == 21


def test_course_page_missing_properties_still_appears(monkeypatch):
    bare = {
        "id": "course-1",
        "properties": {
            "Title": {"type": "title", "title": [{"plain_text": "Bare Course"}]},
        },
    }
    course_res = courses_result([bare])
    task_res = task_stub([])

    monkeypatch.setattr(notion_courses.requests, "post", lambda **kwargs: course_res)
    monkeypatch.setattr(notion_courses, "fetch_tasks_for_range", lambda *args, **kwargs: task_res)

    overview = fetch_studies_overview(
        token="secret",
        courses_data_source_id="courses-ds",
        tasks_data_source_id="tasks-ds",
        today=TODAY,
        page_size=100,
    )

    assert [c.name for c in overview.courses] == ["Bare Course"]
    assert overview.courses[0].next_item is None


def test_untitled_course_not_dropped(monkeypatch):
    untitled = {"id": "course-1", "properties": {}}
    course_res = courses_result([untitled])
    task_res = task_stub([])

    monkeypatch.setattr(notion_courses.requests, "post", lambda **kwargs: course_res)
    monkeypatch.setattr(notion_courses, "fetch_tasks_for_range", lambda *args, **kwargs: task_res)

    overview = fetch_studies_overview(
        token="secret",
        courses_data_source_id="courses-ds",
        tasks_data_source_id="tasks-ds",
        today=TODAY,
        page_size=100,
    )

    assert [c.name for c in overview.courses] == ["(untitled course)"]
