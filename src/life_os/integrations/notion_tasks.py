from datetime import date, datetime
from os import getenv

import requests
from dotenv import load_dotenv

from life_os.models.notion import Task


def create_task(notion_page: dict) -> Task:
    id = notion_page["id"]
    props = notion_page["properties"]
    name = "".join(part["plain_text"] for part in props["Name"]["title"])
    done = props["Done"]["checkbox"]
    scheduled_value = props["Scheduled"]["date"]
    scheduled_str = scheduled_value["start"] if scheduled_value else None
    due_value = props["Due"]["date"]
    due_str = due_value["start"] if due_value else None
    relations = props["Project"]["relation"]
    project_id = relations[0]["id"] if relations else None

    if scheduled_str is None:
        scheduled = None
    elif "T" in scheduled_str:
        scheduled = datetime.fromisoformat(scheduled_str)
    else:
        scheduled = date.fromisoformat(scheduled_str)

    if due_str is None:
        due = None
    elif "T" in due_str:
        due = datetime.fromisoformat(due_str)
    else:
        due = date.fromisoformat(due_str)

    return Task(id=id, name=name, done=done, scheduled=scheduled, due=due, project_id=project_id)


def fetch_tasks_for_day(token: str, data_source_id: str, day: date, page_size: int) -> list[Task]:
    body = {
        "filter": {
            "and": [
                {"property": "Done", "checkbox": {"equals": False}},
                {
                    "or": [
                        {"property": "Scheduled", "date": {"equals": day.isoformat()}},
                        {"property": "Due", "date": {"on_or_before": day.isoformat()}},
                    ]
                },
            ]
        },
        "page_size": page_size,
    }
    tasks = []

    while True:
        res = requests.post(
            url=f"https://api.notion.com/v1/data_sources/{data_source_id}/query",
            headers={
                "Authorization": f"Bearer {token}",
                "Notion-Version": "2026-03-11",
                "Content-Type": "application/json",
            },
            json=body,
        )

        res.raise_for_status()
        data = res.json()
        for t in data["results"]:
            task = create_task(t)
            tasks.append(task)

        if not data["has_more"]:
            break
        body["start_cursor"] = data["next_cursor"]

    return tasks

def set_task_done(token: str, task_id: str, done: bool) -> bool:

    body = {
    "properties": {
        "Done": {
            "checkbox": done
            }
        }
    }

    res = requests.patch(
        url=f"https://api.notion.com/v1/pages/{task_id}",
        headers={
                "Authorization": f"Bearer {token}",
                "Notion-Version": "2026-03-11",
                "Content-Type": "application/json",
            },
        json=body
    )

    res.raise_for_status()
    return True


if __name__ == "__main__":
    load_dotenv()
    notion_task = {
        "id": "task-page-123",
        "properties": {
            "Name": {"type": "title", "title": [{"plain_text": "Read chapter 4"}]},
            "Done": {"type": "checkbox", "checkbox": False},
            "Scheduled": {
                "type": "date",
                "date": {"start": "2026-09-16T10:00:00+02:00", "end": None, "time_zone": None},
            },
            "Due": {
                "type": "date",
                "date": {"start": "2026-09-18", "end": None, "time_zone": None},
            },
            "Project": {"type": "relation", "relation": [{"id": "project-page-456"}]},
        },
    }

    token = getenv("NOTION_TOKEN")
    data_source_id = getenv("NOTION_TASKS_DATA_SOURCE_ID")
    page_size = 5

