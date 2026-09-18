from dataclasses import dataclass
from datetime import date, datetime


@dataclass
class Task:
    id: str
    name: str
    done: bool = False
    scheduled: date | datetime | None = None
    due: date | datetime | None = None
    project_id: str | None = None
