import { connection } from "next/server";

import { TaskCheckbox } from "./task-checkbox";
import { OpenTaskCount, TaskCompletionProvider } from "./task-completion";

type CalendarEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  all_day: boolean;
};

type Task = {
  id: string;
  name: string;
  done: boolean;
  scheduled: string | null;
  due: string | null;
  project_id: string | null;
};

type IntegrationStatus = {
  name: string;
  ok: boolean;
  error: string | null;
};

type Today = {
  day: string;
  events: CalendarEvent[];
  scheduled_tasks: Task[];
  due_tasks: Task[];
  overdue_tasks: Task[];
  statuses: IntegrationStatus[];
};

const timeFormatter = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Zurich",
});

function formatDay(day: string) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${day}T12:00:00Z`));
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`));
}

function formatTaskDate(value: string | null) {
  if (!value) return null;
  const date = formatShortDate(value);
  // Notion's date-time value contains the wall-clock time entered for the task.
  return value.includes("T") ? `${date} · ${value.slice(11, 16)}` : date;
}

function formatEventTime(event: CalendarEvent) {
  if (event.all_day) return "All day";
  return `${timeFormatter.format(new Date(event.start))} – ${timeFormatter.format(new Date(event.end))}`;
}

function TaskList({
  tasks,
  dateField,
  emptyMessage,
}: {
  tasks: Task[];
  dateField: "scheduled" | "due";
  emptyMessage: string;
}) {
  if (tasks.length === 0) {
    return <p className="empty-tasks">{emptyMessage}</p>;
  }

  return (
    <ul className="task-list">
      {tasks.map((task) => (
        <li className="task-row" key={task.id}>
          <TaskCheckbox taskId={task.id} taskName={task.name} />
          <div className="task-copy">
            <span className="task-name">{task.name}</span>
            {task[dateField] && (
              <span className="task-meta">
                {dateField === "due" ? "Due " : "Scheduled "}
                {formatTaskDate(task[dateField])}
              </span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

export default async function Home() {
  await connection();
  const apiUrl = process.env.LIFE_OS_API_URL;

  if (!apiUrl) {
    throw new Error("LIFE_OS_API_URL is not configured");
  }

  const response = await fetch(`${apiUrl}/today`, { cache: "no-store" });

  if (!response.ok) {
    throw new Error("Could not load today's data");
  }

  const today: Today = await response.json();
  const issues = today.statuses.filter((status) => !status.ok);
  const calendarUnavailable = issues.some((status) => status.name === "Calendar");
  const notionUnavailable = issues.some((status) => status.name === "Notion");
  const tasks = [
    ...today.scheduled_tasks,
    ...today.due_tasks,
    ...today.overdue_tasks,
  ];
  const taskIds = tasks.map((task) => task.id);
  const events = [...today.events].sort((a, b) =>
    a.start.localeCompare(b.start),
  );

  return (
    <TaskCompletionProvider
      tasks={tasks.map((task) => ({ id: task.id, done: task.done }))}
    >
      <div className="app-shell">
      <aside className="sidebar" aria-label="Workspace">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">L</span>
          <span className="brand-name">life<span>os</span></span>
        </div>
        <div className="sidebar-middle">
          <span className="sidebar-label">WORKSPACE</span>
          <div className="nav-current" aria-current="page">
            <span className="nav-icon" aria-hidden="true">◈</span>
            Today
          </div>
        </div>
        <div className="sidebar-footer">
          <span className="local-dot" aria-hidden="true" />
          <div>
            <strong>Local workspace</strong>
            <span>Notion connected</span>
          </div>
        </div>
      </aside>

      <main className="dashboard">
        <header className="topbar">
          <span className="topbar-label">YOUR DAILY SPACE</span>
          <time dateTime={today.day}>{formatDay(today.day)}</time>
        </header>

        <div className="dashboard-content">
          <section className="intro" aria-labelledby="page-title">
            <div>
              <p className="eyebrow"><span className="eyebrow-line" /> TODAY&apos;S OVERVIEW</p>
              <h1 id="page-title">Today<span className="title-period">.</span></h1>
              <p className="intro-copy">A clear view of your time and what needs your attention.</p>
            </div>
            <div className="date-tile" aria-label={formatDay(today.day)}>
              <span>{new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" }).format(new Date(`${today.day}T12:00:00Z`))}</span>
              <strong>{today.day.slice(8, 10)}</strong>
              <span>{new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" }).format(new Date(`${today.day}T12:00:00Z`))}</span>
            </div>
          </section>

          <div className="overview-strip" aria-label="Today at a glance">
            <div className="overview-item"><strong>{today.events.length}</strong><span>Calendar events</span></div>
            <div className="overview-item"><strong><OpenTaskCount taskIds={taskIds} /></strong><span>Open tasks</span></div>
            <div className="overview-item"><strong>{today.overdue_tasks.length}</strong><span>Overdue</span></div>
          </div>

          {issues.length > 0 && (
            <div className="integration-alert" role="status">
              <span className="alert-symbol" aria-hidden="true">!</span>
              <span>{issues.map((status) => status.name).join(" and ")} {issues.length === 1 ? "is" : "are"} unavailable. Some information may be missing.</span>
            </div>
          )}

          <div className="content-grid">
            <section className="panel calendar-panel" aria-labelledby="calendar-heading">
              <div className="panel-heading">
                <div>
                  <span className="section-kicker">YOUR SCHEDULE</span>
                  <h2 id="calendar-heading">Calendar</h2>
                </div>
                <span className="count-badge">{events.length} {events.length === 1 ? "event" : "events"}</span>
              </div>
              <div className="calendar-body">
                {events.length === 0 ? (
                  <div className="calendar-empty">
                    <span className="empty-icon" aria-hidden="true">✦</span>
                    <h3>{calendarUnavailable ? "Calendar unavailable" : "A little breathing room"}</h3>
                    <p>{calendarUnavailable ? "Your events could not be loaded right now." : "No events on your calendar for today."}</p>
                  </div>
                ) : (
                  <ol className="event-list">
                    {events.map((event) => (
                      <li className="event-row" key={event.id}>
                        <div className="event-time">{event.all_day ? "ALL DAY" : timeFormatter.format(new Date(event.start))}</div>
                        <div className="event-track" aria-hidden="true"><span /></div>
                        <div className="event-card">
                          <span className="event-type">{event.all_day ? "ALL-DAY EVENT" : "CALENDAR EVENT"}</span>
                          <h3>{event.title}</h3>
                          <time dateTime={event.start}>{formatEventTime(event)}</time>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </section>

            <div className="task-column">
              <section className="panel task-panel" aria-labelledby="scheduled-heading">
                <div className="panel-heading">
                  <div><span className="section-kicker">ON YOUR RADAR</span><h2 id="scheduled-heading">Scheduled</h2></div>
                  <span className="count-badge"><OpenTaskCount taskIds={today.scheduled_tasks.map((task) => task.id)} /></span>
                </div>
                <TaskList tasks={today.scheduled_tasks} dateField="scheduled" emptyMessage={notionUnavailable ? "Tasks could not be loaded." : "Nothing scheduled for today."} />
              </section>

              <section className="panel task-panel" aria-labelledby="due-heading">
                <div className="panel-heading">
                  <div><span className="section-kicker">COMING UP</span><h2 id="due-heading">Due today</h2></div>
                  <span className="count-badge"><OpenTaskCount taskIds={today.due_tasks.map((task) => task.id)} /></span>
                </div>
                <TaskList tasks={today.due_tasks} dateField="due" emptyMessage={notionUnavailable ? "Tasks could not be loaded." : "No deadlines today."} />
              </section>

              <section className="panel task-panel overdue-panel" aria-labelledby="overdue-heading">
                <div className="panel-heading">
                  <div><span className="section-kicker">NEEDS ATTENTION</span><h2 id="overdue-heading">Overdue</h2></div>
                  <span className="count-badge overdue-count"><OpenTaskCount taskIds={today.overdue_tasks.map((task) => task.id)} /></span>
                </div>
                <TaskList tasks={today.overdue_tasks} dateField="due" emptyMessage={notionUnavailable ? "Tasks could not be loaded." : "All caught up. Nice work."} />
              </section>
            </div>
          </div>

          <footer className="dashboard-footer">
            <span>Life OS <span className="footer-separator">/</span> Today</span>
            <span className="footer-status"><span className="footer-status-dot" />Changes sync to Notion</span>
          </footer>
        </div>
      </main>
      </div>
    </TaskCompletionProvider>
  );
}
