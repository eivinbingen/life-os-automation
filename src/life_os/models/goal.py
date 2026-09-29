from dataclasses import dataclass, field
from datetime import date

from life_os.models.notion import UNSET, _Unset


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


@dataclass
class GoalCreate:
    """A goal to be created in Notion: only what creation means to write.

    Name is required; Status defaults to Not Started in the schema, so it
    is not written unless explicitly provided.
    """

    name: str
    status: str | None = None
    area_id: str | None = None
    target_date: date | None = None


@dataclass
class GoalUpdate:
    """Goal fields deliberately edited from Life OS.

    A field left as UNSET preserves the Notion value; an explicit None
    clears it where clearing is meaningful (area, target date). Status is
    written only when set — completion is status-only and never cascades
    to the goal's projects or tasks.
    """

    name: str | None | _Unset = UNSET
    status: str | None | _Unset = UNSET
    area_id: str | None | _Unset = UNSET
    target_date: date | None | _Unset = UNSET
