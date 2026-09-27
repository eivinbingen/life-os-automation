from datetime import date

from fastapi.testclient import TestClient
from requests import HTTPError, Response

from life_os.api import create_app
from life_os.models.courses import (
    Course,
    CourseScheduleItem,
)
from life_os.models.courses import (
    StudiesOverview as DomainStudiesOverview,
)
from life_os.models.finance import (
    AccountBalance,
    CategoryComparison,
    FinanceReview,
    InvalidCategoryMappingError,
    MappingProblems,
    SheetsError,
    YnabError,
)
from life_os.models.notion import (
    UNSET,
    Task,
    TaskCreate,
    TaskFetchResult,
    TaskUpdate,
)


def test_today_includes_normalized_project_name():
    def fetch_events(day):
        return []

    def fetch_tasks(day):
        return TaskFetchResult(
            tasks=[
                Task(
                    id="task-123",
                    name="Plan the week",
                    scheduled=day,
                    project_id="project-456",
                    project_name="Life OS",
                )
            ]
        )

    def set_done(task_id: str, done: bool):
        return True

    client = TestClient(create_app(fetch_events, fetch_tasks, set_done))

    response = client.get("/today", params={"day": date(2026, 9, 19).isoformat()})

    assert response.status_code == 200
    assert response.json()["scheduled_tasks"][0]["project_name"] == "Life OS"


def test_update_task_sets_done_status():
    calls: list[tuple[str, TaskUpdate, bool | None]] = []

    def fetch_events(day):
        return []

    def fetch_tasks(day):
        return []

    def update(task_id: str, update: TaskUpdate, done: bool | None):
        calls.append((task_id, update, done))
        return True

    client = TestClient(create_app(fetch_events, fetch_tasks, update))

    response = client.patch("/tasks/task-123", json={"done": True})

    assert response.status_code == 200
    assert response.json() == {"task": "task-123", "updated": True}
    assert calls == [("task-123", TaskUpdate(), True)]


def test_create_task_maps_request_and_returns_task():
    created = []

    def fetch_events(day):
        return []

    def fetch_tasks(day):
        return []

    def set_done(task_id, done):
        return True

    def create(request):
        created.append(request)
        return Task(
            id="new-task-1",
            name=request.name,
            done=False,
            scheduled=request.scheduled,
            due=request.due,
        )

    client = TestClient(create_app(fetch_events, fetch_tasks, set_done, create))

    response = client.post(
        "/tasks",
        json={"name": "  Buy oat milk  ", "scheduled": "2026-09-20"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "id": "new-task-1",
        "name": "Buy oat milk",
        "done": False,
        "scheduled": "2026-09-20",
        "due": None,
        "project_id": None,
        "project_name": None,
        "course_id": None,
    }
    assert created == [
        TaskCreate(name="Buy oat milk", scheduled=date(2026, 9, 20))
    ]


def test_create_task_rejects_blank_name():
    def fetch_events(day):
        return []

    def fetch_tasks(day):
        return []

    def set_done(task_id, done):
        return True

    def create(request):
        return Task(id="new-task-1", name=request.name)

    client = TestClient(create_app(fetch_events, fetch_tasks, set_done, create))

    response = client.post("/tasks", json={"name": "   "})

    assert response.status_code == 422


def test_create_task_explains_missing_notion_insert_capability():
    def fetch_events(day):
        return []

    def fetch_tasks(day):
        return []

    def set_done(task_id, done):
        return True

    def create(request):
        notion_response = Response()
        notion_response.status_code = 403
        raise HTTPError(response=notion_response)

    client = TestClient(create_app(fetch_events, fetch_tasks, set_done, create))

    response = client.post("/tasks", json={"name": "Buy oat milk"})

    assert response.status_code == 502
    assert response.json() == {
        "detail": (
            "Notion refused to create. Enable the required content "
            "capabilities for the Life OS connection and try again."
        )
    }


def test_update_task_builds_narrow_domain_update(monkeypatch):
    """Omitted keys stay UNSET, explicit nulls clear, done passes through."""
    updates: list[tuple[str, TaskUpdate, bool | None]] = []

    def fetch_events(day):
        return []

    def fetch_tasks(day):
        return []

    def update(task_id: str, update: TaskUpdate, done: bool | None):
        updates.append((task_id, update, done))
        return True

    client = TestClient(create_app(fetch_events, fetch_tasks, update))

    # Reschedule only: name and due must be untouched.
    response = client.patch("/tasks/task-1", json={"scheduled": "2026-09-25"})
    assert response.status_code == 200
    assert response.json() == {"task": "task-1", "updated": True}

    # Clear the due date explicitly.
    response = client.patch("/tasks/task-1", json={"due": None})
    assert response.status_code == 200

    # Complete the task through the checkbox path.
    response = client.patch("/tasks/task-1", json={"done": True})
    assert response.status_code == 200

    assert updates == [
        ("task-1", TaskUpdate(scheduled=date(2026, 9, 25)), None),
        ("task-1", TaskUpdate(due=None), None),
        ("task-1", TaskUpdate(), True),
    ]
    # The reschedule update leaves name and due as the untouched sentinel.
    assert updates[0][1].name is UNSET
    assert updates[0][1].due is UNSET


def test_update_task_rejects_blank_name():
    def fetch_events(day):
        return []

    def fetch_tasks(day):
        return []

    def update(task_id, update, done):
        return True

    client = TestClient(create_app(fetch_events, fetch_tasks, update))

    response = client.patch("/tasks/task-1", json={"name": "   "})

    assert response.status_code == 422


def test_update_task_rejects_null_name():
    """An explicit null name is rejected, not written as an empty title."""

    def fetch_events(day):
        return []

    def fetch_tasks(day):
        return []

    def update(task_id, update, done):
        return True

    client = TestClient(create_app(fetch_events, fetch_tasks, update))

    response = client.patch("/tasks/task-1", json={"name": None})

    assert response.status_code == 422


def test_update_task_rejects_null_done():
    """An explicit null done is rejected instead of silently dropped."""

    def fetch_events(day):
        return []

    def fetch_tasks(day):
        return []

    def update(task_id, update, done):
        return True

    client = TestClient(create_app(fetch_events, fetch_tasks, update))

    response = client.patch("/tasks/task-1", json={"done": None})

    assert response.status_code == 422


def test_update_task_rejects_mixed_payload_with_null_done():
    """A mixed payload carrying done:null must not drop the done edit."""

    def fetch_events(day):
        return []

    def fetch_tasks(day):
        return []

    def update(task_id, update, done):
        return True

    client = TestClient(create_app(fetch_events, fetch_tasks, update))

    response = client.patch(
        "/tasks/task-1", json={"done": None, "scheduled": "2026-09-25"}
    )

    assert response.status_code == 422


def test_update_task_rejects_empty_payload():
    def fetch_events(day):
        return []

    def fetch_tasks(day):
        return []

    def update(task_id, update, done):
        return True

    client = TestClient(create_app(fetch_events, fetch_tasks, update))

    response = client.patch("/tasks/task-1", json={})

    assert response.status_code == 422


def test_update_task_maps_notion_failures_to_502():
    def fetch_events(day):
        return []

    def fetch_tasks(day):
        return []

    def update(task_id, update, done):
        notion_response = Response()
        notion_response.status_code = 403
        raise HTTPError(response=notion_response)

    client = TestClient(create_app(fetch_events, fetch_tasks, update))

    response = client.patch("/tasks/task-1", json={"name": "New name"})

    assert response.status_code == 502
    assert "Notion refused to update" in response.json()["detail"]


def _minimal_fetchers():
    def fetch_events(day):
        return []

    def fetch_tasks(day):
        return []

    def update(task_id, update, done):
        return True

    return fetch_events, fetch_tasks, update


def _finance_review(month):
    return FinanceReview(
        month=month,
        accounts=[AccountBalance(name="Checking", balance=12345.0, type="checking")],
        categories=[
            CategoryComparison(
                label="personal fixed spending",
                forecast=2100.0,
                actual=2400.0,
                difference=-300.0,
            )
        ],
        total_forecast=2100.0,
        total_actual=2400.0,
        total_difference=-300.0,
    )


def test_finance_returns_review_for_requested_month():
    fetch_events, fetch_tasks, update = _minimal_fetchers()
    calls = []

    def get_finance(month):
        calls.append(month)
        return _finance_review(month)

    client = TestClient(
        create_app(fetch_events, fetch_tasks, update, get_finance=get_finance)
    )

    response = client.get("/finance", params={"month": "2026-09-01"})

    assert response.status_code == 200
    payload = response.json()
    assert payload["month"] == "2026-09-01"
    assert payload["accounts"][0]["name"] == "Checking"
    assert payload["categories"][0]["difference"] == -300.0
    assert calls == ["2026-09-01"]


def test_finance_defaults_to_current_month():
    fetch_events, fetch_tasks, update = _minimal_fetchers()
    calls = []

    def get_finance(month):
        calls.append(month)
        return _finance_review(month)

    client = TestClient(
        create_app(fetch_events, fetch_tasks, update, get_finance=get_finance)
    )

    response = client.get("/finance")

    assert response.status_code == 200
    assert calls == [date.today().replace(day=1).isoformat()]


def test_finance_normalizes_month_to_first_day():
    fetch_events, fetch_tasks, update = _minimal_fetchers()
    calls = []

    def get_finance(month):
        calls.append(month)
        return _finance_review(month)

    client = TestClient(
        create_app(fetch_events, fetch_tasks, update, get_finance=get_finance)
    )

    response = client.get("/finance", params={"month": "2026-09-17"})

    assert response.status_code == 200
    assert calls == ["2026-09-01"]


def test_finance_rejects_invalid_month():
    fetch_events, fetch_tasks, update = _minimal_fetchers()

    client = TestClient(
        create_app(fetch_events, fetch_tasks, update, get_finance=_finance_review)
    )

    response = client.get("/finance", params={"month": "september-2026"})

    assert response.status_code == 422


def test_finance_reports_ynab_failure():
    fetch_events, fetch_tasks, update = _minimal_fetchers()

    def get_finance(month):
        raise YnabError("YNAB request failed: 401 Client Error")

    client = TestClient(
        create_app(fetch_events, fetch_tasks, update, get_finance=get_finance)
    )

    response = client.get("/finance", params={"month": "2026-09-01"})

    assert response.status_code == 502
    assert "YNAB is unavailable" in response.json()["detail"]


def test_finance_reports_sheets_failure():
    fetch_events, fetch_tasks, update = _minimal_fetchers()

    def get_finance(month):
        raise SheetsError("Google Sheets request failed: 403")

    client = TestClient(
        create_app(fetch_events, fetch_tasks, update, get_finance=get_finance)
    )

    response = client.get("/finance", params={"month": "2026-09-01"})

    assert response.status_code == 502
    assert "Google Sheets is unavailable" in response.json()["detail"]


def test_finance_reports_mapping_problems():
    fetch_events, fetch_tasks, update = _minimal_fetchers()

    def get_finance(month):
        raise InvalidCategoryMappingError(
            MappingProblems(unmapped_active=["Credit Card Payments: -8125.55 NOK"])
        )

    client = TestClient(
        create_app(fetch_events, fetch_tasks, update, get_finance=get_finance)
    )

    response = client.get("/finance", params={"month": "2026-09-01"})

    assert response.status_code == 502
    detail = response.json()["detail"]
    assert "mapping needs attention" in detail
    assert "Credit Card Payments" in detail


def test_finance_route_absent_without_callable():
    fetch_events, fetch_tasks, update = _minimal_fetchers()

    client = TestClient(create_app(fetch_events, fetch_tasks, update))

    response = client.get("/finance")

    assert response.status_code == 404


def test_studies_route_returns_normalized_overview():
    fetch_events, fetch_tasks, update = _minimal_fetchers()

    def fetch_studies():
        return DomainStudiesOverview(
            courses=[
                Course(
                    id="course-1",
                    name="Corporate Finance",
                    next_item=CourseScheduleItem(
                        id="i-1",
                        name="Exam",
                        kind="assessment",
                        course_id="course-1",
                        course_name="Corporate Finance",
                        due=date(2026, 11, 20),
                    ),
                    upcoming=[
                        CourseScheduleItem(
                            id="i-1",
                            name="Exam",
                            kind="assessment",
                            course_id="course-1",
                            course_name="Corporate Finance",
                            due=date(2026, 11, 20),
                        )
                    ],
                )
            ],
            upcoming=[
                CourseScheduleItem(
                    id="i-1",
                    name="Exam",
                    kind="assessment",
                    course_id="course-1",
                    course_name="Corporate Finance",
                    due=date(2026, 11, 20),
                )
            ],
        )

    client = TestClient(
        create_app(fetch_events, fetch_tasks, update, fetch_studies=fetch_studies)
    )

    response = client.get("/studies")

    assert response.status_code == 200
    body = response.json()
    assert body["courses"][0]["name"] == "Corporate Finance"
    assert body["courses"][0]["next_item"]["due"] == "2026-11-20"
    assert body["upcoming"][0]["due"] == "2026-11-20"
    assert body["statuses"] == []


def test_studies_route_absent_without_callable():
    fetch_events, fetch_tasks, update = _minimal_fetchers()

    client = TestClient(create_app(fetch_events, fetch_tasks, update))

    response = client.get("/studies")

    assert response.status_code == 404


def test_studies_route_degrades_when_notion_fails():
    from requests import RequestException as RequestError

    fetch_events, fetch_tasks, update = _minimal_fetchers()

    def fetch_studies():
        raise RequestError("Notion unreachable")

    client = TestClient(
        create_app(fetch_events, fetch_tasks, update, fetch_studies=fetch_studies)
    )

    response = client.get("/studies")

    assert response.status_code == 200
    body = response.json()
    assert body["courses"] == []
    assert body["upcoming"] == []
    assert body["statuses"] == [{"name": "Notion", "ok": False, "error": "Notion unreachable"}]
