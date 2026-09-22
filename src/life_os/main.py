import os
from functools import partial

import uvicorn
from dotenv import load_dotenv

from life_os.api import create_app
from life_os.integrations.google_calendar import (
    get_calendar_service,
    get_events_for_day,
    get_events_for_range,
)
from life_os.integrations.notion_tasks import (
    create_task,
    fetch_tasks_for_day,
    fetch_tasks_for_range,
    update_task,
)


def main():
    load_dotenv()

    service = get_calendar_service()
    fetch_events = partial(get_events_for_day, service)
    fetch_week_events = partial(get_events_for_range, service)

    token = os.getenv("NOTION_TOKEN")
    data_source_id = os.getenv("NOTION_TASKS_DATA_SOURCE_ID")

    fetch_tasks = partial(
        fetch_tasks_for_day,
        token,
        data_source_id,
        page_size=100,
    )
    fetch_week_tasks = partial(
        fetch_tasks_for_range,
        token,
        data_source_id,
        page_size=100,
    )

    update = partial(update_task, token)
    create = partial(create_task, token, data_source_id)

    app = create_app(
        fetch_events, fetch_tasks, update, create, fetch_week_events, fetch_week_tasks
    )
    uvicorn.run(app, host="127.0.0.1", port=8000)


if __name__ == "__main__":
    main()
