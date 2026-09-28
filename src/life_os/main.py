import os
from datetime import date
from functools import partial

import uvicorn
from dotenv import load_dotenv

from life_os.api import create_app
from life_os.category_mappings import CATEGORY_MAPPINGS, EXCLUDED_CATEGORIES
from life_os.integrations.finance import fetch_finance_data
from life_os.integrations.google_calendar import (
    get_calendar_service,
    get_events_for_day,
    get_events_for_range,
)
from life_os.integrations.notion_courses import fetch_studies_overview
from life_os.integrations.notion_projects import (
    fetch_project,
    fetch_tasks_for_project,
)
from life_os.integrations.notion_tasks import (
    _fetch_project_name,
    create_task,
    fetch_done_tasks_for_range,
    fetch_tasks_for_day,
    fetch_tasks_for_range,
    update_task,
)
from life_os.services.finance import get_finance_review
from life_os.services.projects import get_project_detail as _get_project_detail
from life_os.services.weekly_reviews import STORE_ENV_VAR, WeeklyReviewRepository


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
    fetch_done_week_tasks = partial(
        fetch_done_tasks_for_range,
        token,
        data_source_id,
        page_size=100,
    )

    update = partial(update_task, token)
    create = partial(create_task, token, data_source_id)

    get_finance = partial(
        get_finance_review,
        fetch_data=fetch_finance_data,
        category_mapping=CATEGORY_MAPPINGS,
        excluded_categories=EXCLUDED_CATEGORIES,
    )

    courses_data_source_id = os.getenv("NOTION_COURSES_DATA_SOURCE_ID")

    def fetch_studies():
        return fetch_studies_overview(
            token,
            courses_data_source_id,
            data_source_id,
            today=date.today(),
            page_size=100,
        )

    # The project detail read needs only the token and the tasks data
    # source (project page + tasks-by-project query), so it is enabled
    # whenever Today works; the optional projects env var is unused.
    def fetch_project_detail(project_id: str):
        return _get_project_detail(
            project_id,
            fetch_project=partial(fetch_project, token),
            fetch_tasks_for_project=partial(
                fetch_tasks_for_project, token, data_source_id, page_size=100
            ),
            fetch_goal_name=partial(_fetch_project_name, token),
        )

    # The review store resolves from the repository root regardless of the
    # launch working directory.
    os.environ.setdefault(STORE_ENV_VAR, str(_repository_root()))
    reviews = WeeklyReviewRepository()

    app = create_app(
        fetch_events,
        fetch_tasks,
        update,
        create,
        fetch_week_events,
        fetch_week_tasks,
        fetch_done_week_tasks,
        get_finance=get_finance,
        fetch_studies=fetch_studies,
        fetch_project_detail=fetch_project_detail,
        reviews=reviews,
    )
    uvicorn.run(app, host="127.0.0.1", port=8000)


def _repository_root():
    from pathlib import Path

    return Path(__file__).resolve().parents[2]


if __name__ == "__main__":
    main()
