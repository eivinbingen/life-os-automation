from dataclasses import dataclass, field


@dataclass
class ProjectRef:
    """A lightweight project reference inside a goal view."""

    id: str
    name: str | None


@dataclass
class GoalDetail:
    """One goal with verified context and its related projects.

    Missing optional context never hides the goal: an unreadable status or
    projects relation renders as unavailable/neutral rather than dropping
    the row. There is no description property in the schema; a goal's
    context is its name, status, area, and target date.
    """

    id: str
    name: str | None
    status: str | None  # None when the status read failed or is absent
    status_available: bool
    area_id: str | None
    area_name: str | None
    target_date: str | None  # raw ISO
    projects: list[ProjectRef] = field(default_factory=list)
    statuses: list[dict] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
