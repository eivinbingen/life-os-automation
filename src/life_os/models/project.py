from dataclasses import dataclass, field

from life_os.models.notion import Task


@dataclass
class ProjectDetail:
    """One project with verified context and its open tasks.

    Missing optional context never hides the project: an unreadable status
    or goal relation renders as unavailable/neutral rather than dropping
    the row.
    """

    id: str
    name: str | None
    status: str | None  # None when the status read failed or is absent
    status_available: bool
    goal_id: str | None
    goal_name: str | None
    deadline: str | None  # raw ISO, may carry a time component
    # Display-only fallback: the Resolved Goal formula string, shown when
    # the project-side Goal relation is empty (Notion inheritance).
    resolved_goal: str | None = None
    tasks: list[Task] = field(default_factory=list)
    statuses: list[dict] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
