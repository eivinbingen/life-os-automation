from dataclasses import dataclass, field
from datetime import date, datetime

from life_os.models.today import IntegrationStatus  # noqa: F401  (re-exported for API layer)


@dataclass
class CourseScheduleItem:
    """One piece of upcoming academic work, normalized from Notion.

    All Notion-derived fields are optional: missing relations or dates
    never prevent an item from appearing.
    """

    id: str
    name: str
    kind: str  # "assessment" | "deadline" | "study_task"
    course_id: str | None = None
    course_name: str | None = None
    due: date | datetime | None = None


@dataclass
class Course:
    id: str
    name: str
    active: bool = True
    next_item: CourseScheduleItem | None = None
    upcoming: list[CourseScheduleItem] = field(default_factory=list)


@dataclass
class StudiesOverview:
    courses: list[Course] = field(default_factory=list)
    upcoming: list[CourseScheduleItem] = field(default_factory=list)
    statuses: list[IntegrationStatus] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
