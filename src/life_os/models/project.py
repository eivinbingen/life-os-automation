from dataclasses import dataclass, field
from datetime import date

from life_os.models.notion import UNSET, Task, _Unset


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


@dataclass
class ProjectCreate:
    """A project to be created in Notion: only what creation means to write.

    Name is required; Status defaults to Planned in the schema, so it is
    not written unless explicitly provided. No goal is imposed — the goal
    link is optional per the source contract and written through the
    project-side `Goal` relation.
    """

    name: str
    status: str | None = None
    goal_id: str | None = None
    deadline: date | None = None


@dataclass
class ProjectUpdate:
    """Project fields deliberately edited from Life OS.

    A field left as UNSET preserves the Notion value; an explicit None
    clears it where clearing is meaningful (goal, deadline). Status is
    written only when set — changing status never cascades to the
    project's tasks.

    previous_goal_id carries the goal link the editor saw when the edit
    was composed. The goal-side sync repairs against it, so a retry after
    a partial sync failure still moves the link from the goal the user
    saw to the goal they chose.
    """

    name: str | None | _Unset = UNSET
    status: str | None | _Unset = UNSET
    goal_id: str | None | _Unset = UNSET
    previous_goal_id: str | None | _Unset = UNSET
    deadline: date | None | _Unset = UNSET
