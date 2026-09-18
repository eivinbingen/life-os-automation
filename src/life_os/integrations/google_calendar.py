from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from googleapiclient.errors import HttpError

from life_os.integrations.calendar_auth import get_calendar_service
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
        start = datetime.combine(date.fromisoformat(start_info["date"]), time.min, tzinfo=local_tz)
        end = datetime.combine(date.fromisoformat(end_info["date"]), time.min, tzinfo=local_tz)
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


def get_events_for_day(service, day: date) -> list[CalendarEvent]:
    start_bound = datetime.combine(day, time.min, tzinfo=ZoneInfo("Europe/Zurich"))
    next_day = day + timedelta(days=1)
    end_bound = datetime.combine(next_day, time.min, tzinfo=ZoneInfo("Europe/Zurich"))

    try:
        response = (
            service.events()
            .list(
                calendarId="primary",
                timeMin=start_bound.isoformat(),
                timeMax=end_bound.isoformat(),
                singleEvents=True,
                orderBy="startTime",
            )
            .execute()
        )
    except HttpError as e:
        raise e

    events = []
    for item in response.get("items", []):
        e = create_calendar_event(item)
        events.append(e)
    return events


if __name__ == "__main__":
    service = get_calendar_service()
    today = date(2026, 9, 16)
    e = get_events_for_day(service, day=today)
    for event in e:
        print(event.title)
