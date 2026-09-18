from collections.abc import Callable
from datetime import date

from fastapi import FastAPI

from life_os.models.calendar import CalendarEvent
from life_os.models.notion import Task
from life_os.services.today import get_today

def create_app(fetch_events: Callable[[date], list[CalendarEvent]], fetch_tasks: Callable[[date], list[Task]]) -> FastAPI:

    app = FastAPI()

    @app.get("/health")
    def health():
        return {"status":"ok"}
    
    @app.get("/today")
    def today(day: date | None=None):
        
        return get_today(day or date.today(), fetch_events, fetch_tasks)

    return app