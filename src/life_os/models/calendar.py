from dataclasses import dataclass
from datetime import datetime


@dataclass
class CalendarEvent:
    id: str
    title: str
    start: datetime
    end: datetime
    all_day: bool = False
