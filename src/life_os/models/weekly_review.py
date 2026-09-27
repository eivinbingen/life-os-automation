from dataclasses import dataclass, field
from datetime import date, datetime


@dataclass
class SectionProgress:
    """Which guided-review sections the user has advanced past."""

    look_back: bool = False
    clean_up: bool = False
    direction: bool = False
    ahead: bool = False

    def to_dict(self) -> dict[str, bool]:
        return {
            "look_back": self.look_back,
            "clean_up": self.clean_up,
            "direction": self.direction,
            "ahead": self.ahead,
        }

    @classmethod
    def from_dict(cls, data: dict | None) -> "SectionProgress":
        data = data or {}
        return cls(
            look_back=bool(data.get("look_back", False)),
            clean_up=bool(data.get("clean_up", False)),
            direction=bool(data.get("direction", False)),
            ahead=bool(data.get("ahead", False)),
        )


@dataclass
class WeeklyReview:
    """One app-owned weekly review record.

    Stable identity and dates belong to the record; later source edits
    never rewrite its saved text or context.
    """

    id: str
    week_start: date
    week_end: date
    ahead_start: date
    ahead_end: date
    timezone: str
    status: str  # "draft" | "completed"
    revision: int
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None = None
    section_progress: SectionProgress = field(default_factory=SectionProgress)
    wins: str = ""
    reflection: str = ""

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "week_start": self.week_start.isoformat(),
            "week_end": self.week_end.isoformat(),
            "ahead_start": self.ahead_start.isoformat(),
            "ahead_end": self.ahead_end.isoformat(),
            "timezone": self.timezone,
            "status": self.status,
            "revision": self.revision,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "section_progress": self.section_progress.to_dict(),
            "wins": self.wins,
            "reflection": self.reflection,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "WeeklyReview":
        section_progress = data.get("section_progress")
        if section_progress is not None and not isinstance(section_progress, dict):
            raise TypeError("section_progress must be an object")
        return cls(
            id=data["id"],
            week_start=date.fromisoformat(data["week_start"]),
            week_end=date.fromisoformat(data["week_end"]),
            ahead_start=date.fromisoformat(data["ahead_start"]),
            ahead_end=date.fromisoformat(data["ahead_end"]),
            timezone=data["timezone"],
            status=data["status"],
            revision=data["revision"],
            created_at=datetime.fromisoformat(data["created_at"]),
            updated_at=datetime.fromisoformat(data["updated_at"]),
            completed_at=(
                datetime.fromisoformat(data["completed_at"])
                if data.get("completed_at")
                else None
            ),
            section_progress=SectionProgress.from_dict(section_progress),
            wins=data.get("wins", ""),
            reflection=data.get("reflection", ""),
        )
