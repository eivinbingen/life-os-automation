import os
from functools import partial

import uvicorn
from dotenv import load_dotenv

from life_os.api import create_app
from life_os.integrations.google_calendar import get_calendar_service, get_events_for_day
from life_os.integrations.notion_tasks import fetch_tasks_for_day, set_task_done

def main():
    load_dotenv()

    fetch_events = partial(get_events_for_day, get_calendar_service())

    fetch_tasks = partial(
        fetch_tasks_for_day,
        os.getenv("NOTION_TOKEN"),
        os.getenv("NOTION_TASKS_DATA_SOURCE_ID"),
        page_size=100,
    )

    set_done = partial(
        set_task_done,
        os.getenv("NOTION_TOKEN")
    )

    app = create_app(fetch_events, fetch_tasks, set_done)
    uvicorn.run(app, host="127.0.0.1", port=8000)

if __name__ == "__main__":
    main()