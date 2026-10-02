from dataclasses import dataclass, field
from datetime import date, datetime


@dataclass
class AheadItem:
    """One row of the ahead week's chronological timeline.

    A task can appear twice — on its scheduled day and its due day — with
    distinct ids and kinds so both rows stay clearly labeled.
    """

    id: str
    kind: str  # "scheduled" | "due" | "event" | "assessment"
    day: date
    name: str
    when: str | None = None  # raw ISO of the row's own date(time), may be date-only
    task_id: str | None = None
    project_id: str | None = None
    project_name: str | None = None
    course_id: str | None = None
    course_name: str | None = None
    scheduled: str | None = None  # raw ISO, may carry a time component
    due: str | None = None
    event_id: str | None = None
    start: str | None = None  # zoned ISO event bounds
    end: str | None = None
    all_day: bool = False
    continues: bool = False  # multi-day event on a day after its first


@dataclass
class AheadException:
    """Objective planning exception: due in the ahead week, no scheduled date."""

    task_id: str
    name: str
    due: str | None
    project_id: str | None = None
    project_name: str | None = None


@dataclass
class AheadSummary:
    """Live Ahead timeline; never persisted as review history."""

    week_start: date
    week_end: date
    ahead_start: date
    ahead_end: date
    timezone: str
    captured_at: datetime
    items: list[AheadItem] = field(default_factory=list)
    exceptions: list[AheadException] = field(default_factory=list)
    statuses: list[dict] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
