from dataclasses import dataclass, field
from datetime import datetime

from life_os.models.goal import ProjectRef


@dataclass
class DirectionGoal:
    """One active goal in the Direction stage with its linked projects.

    Missing optional context never hides the goal: an unreadable status or
    an empty projects relation renders as unavailable/neutral rather than
    dropping the row. Goals without projects stay in items.
    """

    id: str
    name: str | None
    status: str | None
    status_available: bool
    projects: list[ProjectRef] = field(default_factory=list)


@dataclass
class DirectionSummary:
    """The Direction stage's live context: active goals and their projects.

    statuses distinguishes unavailable from empty: a failed source renders
    an integration alert, zero goals with ok sources is a neutral state.
    """

    week_start: str
    captured_at: datetime
    timezone: str
    items: list[DirectionGoal] = field(default_factory=list)
    statuses: list[dict] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
