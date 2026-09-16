from datetime import date, datetime, time
from zoneinfo import ZoneInfo

from life_os.models.calendar import CalendarEvent


def _parse_timed_datetime(info: dict, local_tz: ZoneInfo) -> datetime:
    value = datetime.fromisoformat(info["dateTime"])
    if value.tzinfo is None:
        if "timeZone" not in info:
            raise ValueError("Timed event needs an offset or timeZone")
        value = value.replace(tzinfo=ZoneInfo(info["timeZone"]))
    return value.astimezone(local_tz)


def create_calendar_event(google_event: dict) -> CalendarEvent:
    start_info = google_event["start"]
    end_info = google_event["end"]
    local_tz = ZoneInfo("Europe/Zurich")
    all_day = "date" in start_info

    if all_day:
        start = datetime.combine(
            date.fromisoformat(start_info["date"]), time.min, tzinfo=local_tz
        )
        end = datetime.combine(
            date.fromisoformat(end_info["date"]), time.min, tzinfo=local_tz
        )
    else:
        start = _parse_timed_datetime(start_info, local_tz)
        end = _parse_timed_datetime(end_info, local_tz)

    return CalendarEvent(
        id=google_event["id"],
        title=google_event["summary"],
        start=start,
        end=end,
        all_day=all_day,
    )


if __name__ == "__main__":
    google_event = {
        "id": "1",
        "summary": "Test event",
        "start": {"dateTime": "2026-09-16T10:00:00", "timeZone": "Europe/Zurich"},
        "end": {"dateTime": "2026-09-16T12:00:00", "timeZone": "Europe/Zurich"},
    }
    print(create_calendar_event(google_event))
