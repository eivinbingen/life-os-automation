from datetime import date, datetime, timedelta

import requests

from life_os.integrations.notion_tasks import (
    NOTION_API_URL,
    _headers,
    _page_title,
    fetch_tasks_for_range,
)
from life_os.models.courses import Course, CourseScheduleItem, StudiesOverview
from life_os.models.notion import Task
from life_os.models.today import IntegrationStatus

COURSE_STATUS_PROPERTY = "Status"
ACTIVE_STATUS = "Active"
COURSE_TASKS_RELATION = "✅ Tasks"
COURSE_EXAM_PROPERTY = "Exam / Final Deadline"


def fetch_studies_overview(
    token: str,
    courses_data_source_id: str,
    tasks_data_source_id: str,
    today: date,
    page_size: int,
    horizon_days: int = 42,
) -> StudiesOverview:
    """Read-only Studies overview: active courses plus their upcoming work.

    The courses query is the primary read; a failure there raises and the
    API layer degrades. Task and assessment reads are secondary: a failure
    degrades with a warning and keeps the courses visible.
    """

    courses = _fetch_active_courses(token, courses_data_source_id, page_size)
    overview = StudiesOverview(courses=courses)

    course_ids = {course.id for course in courses}

    try:
        result = fetch_tasks_for_range(
            token, tasks_data_source_id, today, today + timedelta(days=horizon_days), page_size
        )
        overview.warnings.extend(result.warnings)
        items = [_task_to_schedule_item(task, courses) for task in result.tasks]
    except requests.RequestException as error:
        overview.statuses.append(IntegrationStatus(name="Notion", ok=False, error=str(error)))
        overview.warnings.append("Could not load upcoming academic work.")
        items = []

    _attach_items(overview, items, course_ids)
    return overview


def _fetch_active_courses(token: str, data_source_id: str, page_size: int) -> list[Course]:
    body = {
        "filter": {
            "property": COURSE_STATUS_PROPERTY,
            "status": {"equals": ACTIVE_STATUS},
        },
        "page_size": page_size,
    }
    courses: dict[str, Course] = {}
    while True:
        res = requests.post(
            url=f"{NOTION_API_URL}/data_sources/{data_source_id}/query",
            headers=_headers(token),
            json=body,
        )
        res.raise_for_status()
        data = res.json()
        for page in data["results"]:
            course = _course_from_page(page)
            courses.setdefault(course.id, course)
        if not data["has_more"]:
            break
        body["start_cursor"] = data["next_cursor"]
    return list(courses.values())


def _course_from_page(notion_page: dict) -> Course:
    name = _page_title(notion_page) or "(untitled course)"
    course = Course(id=notion_page["id"], name=name)

    props = notion_page.get("properties", {})
    exam_date = _get_date_start(props, COURSE_EXAM_PROPERTY)
    if exam_date is not None:
        item = CourseScheduleItem(
            id=f"{course.id}:exam",
            name="Exam / Final Deadline",
            kind="assessment",
            course_id=course.id,
            course_name=course.name,
            due=exam_date,
        )
        course.upcoming.append(item)
    return course


def _task_to_schedule_item(task: Task, courses: list[Course]) -> CourseScheduleItem:
    course_name = None
    if task.course_id:
        for course in courses:
            if course.id == task.course_id:
                course_name = course.name
                break
    kind = "deadline" if task.due is not None else "study_task"
    due = task.due if task.due is not None else task.scheduled
    return CourseScheduleItem(
        id=task.id,
        name=task.name,
        kind=kind,
        course_id=task.course_id,
        course_name=course_name,
        due=due,
    )


def _attach_items(
    overview: StudiesOverview, items: list[CourseScheduleItem], course_ids: set[str]
) -> None:
    by_course: dict[str, list[CourseScheduleItem]] = {}
    unmatched: list[CourseScheduleItem] = []
    for item in items:
        if item.course_id in course_ids:
            by_course.setdefault(item.course_id, []).append(item)
        else:
            item.course_name = None
            unmatched.append(item)

    for course in overview.courses:
        course_items = by_course.get(course.id, [])
        exam_items = [i for i in course.upcoming if i.id.endswith(":exam")]
        course_items.extend(exam_items)
        course.upcoming = sorted(
            course_items, key=lambda i: (_to_date(i.due), i.name)
        )
        course.next_item = course.upcoming[0] if course.upcoming else None

    overview.upcoming = sorted(
        [*items, *[i for c in overview.courses for i in c.upcoming if i.id.endswith(":exam")]],
        key=lambda i: (_to_date(i.due), i.name),
    )


def _to_date(value: date | datetime | None) -> date:
    if value is None:
        return date.max
    if isinstance(value, datetime):
        return value.date()
    return value


def _get_date_start(props: dict, *names: str) -> date | datetime | None:
    for name in names:
        value = props.get(name, {}).get("date")
        if not value:
            continue
        start = value.get("start")
        if not start:
            continue
        if "T" in start:
            return datetime.fromisoformat(start)
        return date.fromisoformat(start)
    return None
