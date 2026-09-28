from life_os.models.notion import Task, TaskFetchResult
from life_os.services.projects import get_project_detail


def project_page(status="Active", goal_id="goal-1", resolved_goal=None):
    return {
        "id": "project-1",
        "properties": {
            "Name": {"type": "title", "title": [{"plain_text": "Life OS"}]},
            "Status": {"type": "status", "status": {"name": status}},
            "Goal": {"type": "relation", "relation": [{"id": goal_id}] if goal_id else []},
            "Resolved Goal": {
                "type": "formula",
                "formula": {"string": resolved_goal} if resolved_goal else None,
            },
            "Deadline": {"type": "date", "date": {"start": "2026-10-19"}},
        },
    }


def test_empty_goal_relation_falls_back_to_resolved_goal_string():
    detail = get_project_detail(
        "project-1",
        fetch_project=lambda pid: project_page(
            goal_id=None, resolved_goal="Complete the ETH Semester"
        ),
        fetch_tasks_for_project=lambda pid: TaskFetchResult(tasks=[], warnings=[]),
        fetch_goal_name=lambda gid: "never called",
    )

    assert detail.goal_id is None
    assert detail.goal_name is None
    assert detail.resolved_goal == "Complete the ETH Semester"


def test_get_project_detail_assembles_all_sources():
    detail = get_project_detail(
        "project-1",
        fetch_project=lambda pid: project_page(),
        fetch_tasks_for_project=lambda pid: TaskFetchResult(
            tasks=[Task(id="task-1", name="Plan the week")], warnings=[]
        ),
        fetch_goal_name=lambda gid: "Ship the app",
    )

    assert detail.name == "Life OS"
    assert detail.status == "Active"
    assert detail.status_available is True
    assert detail.goal_id == "goal-1"
    assert detail.goal_name == "Ship the app"
    assert detail.deadline == "2026-10-19"
    assert [task.id for task in detail.tasks] == ["task-1"]
    assert detail.statuses == []


def test_missing_goal_relation_keeps_project_visible():
    detail = get_project_detail(
        "project-1",
        fetch_project=lambda pid: project_page(goal_id=None),
        fetch_tasks_for_project=lambda pid: TaskFetchResult(tasks=[], warnings=[]),
        fetch_goal_name=lambda gid: "never called",
    )

    assert detail.goal_id is None
    assert detail.goal_name is None
    assert detail.name == "Life OS"
    assert detail.statuses == []


def test_failed_goal_lookup_is_neutral_missing_context():
    def failing_goal_name(gid):
        raise RuntimeError("goal read failed")

    detail = get_project_detail(
        "project-1",
        fetch_project=lambda pid: project_page(),
        fetch_tasks_for_project=lambda pid: TaskFetchResult(tasks=[], warnings=[]),
        fetch_goal_name=failing_goal_name,
    )

    # The goal context is neutral (None), the project itself is not an error.
    assert detail.goal_id == "goal-1"
    assert detail.goal_name is None
    assert detail.statuses == []
    assert detail.name == "Life OS"


def test_failed_status_read_renders_unavailable():
    detail = get_project_detail(
        "project-1",
        fetch_project=lambda pid: {"id": "project-1", "properties": {}},
        fetch_tasks_for_project=lambda pid: TaskFetchResult(tasks=[], warnings=[]),
        fetch_goal_name=lambda gid: None,
    )

    assert detail.name is None
    assert detail.status is None
    assert detail.status_available is False


def test_failed_task_fetch_marks_source_unavailable():
    def failing_tasks(pid):
        raise RuntimeError("tasks query failed")

    detail = get_project_detail(
        "project-1",
        fetch_project=lambda pid: project_page(),
        fetch_tasks_for_project=failing_tasks,
        fetch_goal_name=lambda gid: None,
    )

    assert detail.tasks == []
    assert detail.statuses == [
        {"name": "Notion tasks", "ok": False, "error": "tasks query failed"}
    ]
    # The project itself is still readable.
    assert detail.name == "Life OS"


def test_failed_project_fetch_marks_source_unavailable():
    def failing_project(pid):
        raise RuntimeError("project read failed")

    detail = get_project_detail(
        "project-1",
        fetch_project=failing_project,
        fetch_tasks_for_project=lambda pid: TaskFetchResult(tasks=[], warnings=[]),
        fetch_goal_name=lambda gid: None,
    )

    assert detail.name is None
    assert detail.statuses == [
        {"name": "Notion", "ok": False, "error": "project read failed"}
    ]
