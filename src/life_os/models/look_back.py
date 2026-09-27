from dataclasses import dataclass, field
from datetime import date, datetime


@dataclass
class LookBackMetric:
    """One honestly labeled Look Back measure.

    `definition` names the exact evidence behind the count so the label
    cannot imply tracking that does not exist (e.g. completion time).
    """

    key: str
    label: str
    definition: str
    available: bool = True
    count: int | None = None

    def to_dict(self) -> dict:
        return {
            "key": self.key,
            "label": self.label,
            "definition": self.definition,
            "available": self.available,
            "count": self.count,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "LookBackMetric":
        return cls(
            key=data["key"],
            label=data["label"],
            definition=data["definition"],
            available=bool(data.get("available", True)),
            count=data.get("count"),
        )


@dataclass
class LookBackSummary:
    """Compact Look Back context for one reviewed week.

    Saved at review completion with definitions, capture time, and
    missing-source status; historical summaries stay fixed as live
    records change.
    """

    week_start: date
    week_end: date
    timezone: str
    captured_at: datetime
    metrics: list[LookBackMetric] = field(default_factory=list)
    statuses: list[dict] = field(default_factory=list)
    completed_tasks: list[dict] = field(default_factory=list)
    unfinished_tasks: list[dict] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "week_start": self.week_start.isoformat(),
            "week_end": self.week_end.isoformat(),
            "timezone": self.timezone,
            "captured_at": self.captured_at.isoformat(),
            "metrics": [metric.to_dict() for metric in self.metrics],
            "statuses": self.statuses,
            "completed_tasks": self.completed_tasks,
            "unfinished_tasks": self.unfinished_tasks,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "LookBackSummary":
        return cls(
            week_start=date.fromisoformat(data["week_start"]),
            week_end=date.fromisoformat(data["week_end"]),
            timezone=data["timezone"],
            captured_at=datetime.fromisoformat(data["captured_at"]),
            metrics=[LookBackMetric.from_dict(metric) for metric in data.get("metrics", [])],
            statuses=data.get("statuses", []),
            completed_tasks=data.get("completed_tasks", []),
            unfinished_tasks=data.get("unfinished_tasks", []),
        )
