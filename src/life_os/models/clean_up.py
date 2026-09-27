from dataclasses import dataclass, field
from datetime import date, datetime


@dataclass
class CleanUpItem:
    """One unresolved task in the Weekly Review Clean Up queue.

    Both inclusion reasons live on the row: one task can explain multiple
    reasons and is deduplicated by ID.
    """

    id: str
    name: str
    project_name: str | None
    scheduled: str | None  # raw ISO, may carry a time component
    due: str | None
    overdue: bool
    scheduled_in_week: bool


@dataclass
class CleanUpSummary:
    """Live Clean Up queue; never persisted as review history."""

    week_start: date
    week_end: date
    local_day: date  # the as-of date for overdue status
    timezone: str
    captured_at: datetime
    items: list[CleanUpItem] = field(default_factory=list)
    statuses: list[dict] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
