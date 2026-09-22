"use client";

import { useMemo } from "react";
import Link from "next/link";

import type { Task, Week } from "../actions";
import { APP_TIME_ZONE, formatDay, shiftDay, startOfWeek } from "../date-utils";

const timeFormatter = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: APP_TIME_ZONE,
});

const weekdayFormatter = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  timeZone: "UTC",
});

const monthDayFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

function formatTaskDate(value: string | null) {
  if (!value) return null;
  const date = monthDayFormatter.format(new Date(`${value.slice(0, 10)}T12:00:00Z`));
  // Notion's date-time value contains the wall-clock time entered for the task.
  return value.includes("T") ? `${date} · ${value.slice(11, 16)}` : date;
}

function TaskRow({ task, dateField }: { task: Task; dateField: "scheduled" | "due" }) {
  return (
    <li className="task-row">
      <div className="task-copy">
        <span className="task-name">{task.name}</span>
        {task.project_name && (
          <span className="task-project">
            <span>Project</span>
            {task.project_name}
          </span>
        )}
        {task[dateField] && (
          <span className="task-meta">
            {dateField === "due" ? "Due " : "Scheduled "}
            {formatTaskDate(task[dateField])}
          </span>
        )}
      </div>
    </li>
  );
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
        <TaskRow key={task.id} task={task} dateField={dateField} />
      ))}
    </ul>
  );
}

export function WeeklyBoard({ week, localDay }: { week: Week; localDay: string }) {
  const previousWeekStart = shiftDay(week.start, -7);
  const currentWeekStart = startOfWeek(localDay);
  const nextWeekStart = shiftDay(week.start, 7);

  const eventCount = useMemo(
    () => week.days.reduce((sum, day) => sum + day.events.length, 0),
    [week],
  );
  const openTaskCount = useMemo(
    () =>
      week.days.reduce(
        (sum, day) => sum + day.scheduled_tasks.length + day.due_tasks.length,
        week.overdue_tasks.length,
      ),
    [week],
  );
  const issues = useMemo(
    () => week.statuses.filter((status) => !status.ok),
    [week],
  );
  const calendarUnavailable = issues.some((status) => status.name === "Calendar");
  const notionUnavailable = issues.some((status) => status.name === "Notion");

  return (
    <div className="dashboard-content">
      <section className="intro" aria-labelledby="week-title">
        <div>
          <p className="eyebrow"><span className="eyebrow-line" /> WEEKLY OVERVIEW</p>
          <h1 id="week-title" className="week-title">
            {monthDayFormatter.format(new Date(`${week.start}T12:00:00Z`))} –{" "}
            {monthDayFormatter.format(new Date(`${week.end}T12:00:00Z`))}
            <span className="title-period">.</span>
          </h1>
          <p className="intro-copy">
            Your commitments and tasks for the coming week, day by day.
          </p>
        </div>
        <div className="date-navigation">
          <div className="day-controls" aria-label="Choose a week">
            <Link
              href={`/weekly?day=${previousWeekStart}`}
              aria-label={`Previous week, ${formatDay(previousWeekStart)}`}
            >&larr;</Link>
            <Link
              className="today-link"
              href={`/weekly?day=${currentWeekStart}`}
            >This week</Link>
            <Link
              href={`/weekly?day=${nextWeekStart}`}
              aria-label={`Next week, ${formatDay(nextWeekStart)}`}
            >&rarr;</Link>
          </div>
        </div>
      </section>

      <div className="overview-strip" aria-label="Week at a glance">
        <div className="overview-item"><strong>{eventCount}</strong><span>Calendar events</span></div>
        <div className="overview-item"><strong>{openTaskCount}</strong><span>Open tasks</span></div>
        <div className="overview-item"><strong>{week.overdue_tasks.length}</strong><span>Overdue</span></div>
      </div>

      {issues.length > 0 && (
        <div className="integration-alert" role="status">
          <span className="alert-symbol" aria-hidden="true">!</span>
          <span>
            {issues.map((status) => status.name).join(" and ")}{" "}
            {issues.length === 1 ? "is" : "are"} unavailable. Some information may be
            missing.
          </span>
        </div>
      )}

      <section className="panel overdue-panel week-overdue-panel" aria-labelledby="week-overdue-heading">
        <div className="panel-heading">
          <div><span className="section-kicker">NEEDS ATTENTION</span><h2 id="week-overdue-heading">Overdue</h2></div>
          <span className="count-badge overdue-count">{week.overdue_tasks.length}</span>
        </div>
        <TaskList
          tasks={week.overdue_tasks}
          dateField="due"
          emptyMessage={notionUnavailable ? "Tasks could not be loaded." : "All caught up. Nice work."}
        />
      </section>

      <div className="week-grid" role="list" aria-label="Week days">
        {week.days.map((day) => {
          const isToday = day.day === localDay;
          return (
            <section
              className={`panel week-day-panel${isToday ? " week-day-today" : ""}`}
              key={day.day}
              role="listitem"
              aria-labelledby={`day-heading-${day.day}`}
            >
              <div className="panel-heading week-day-heading">
                <div>
                  <span className="section-kicker">
                    {weekdayFormatter.format(new Date(`${day.day}T12:00:00Z`))}
                    {isToday ? " · TODAY" : ""}
                  </span>
                  <h2 id={`day-heading-${day.day}`}>
                    {monthDayFormatter.format(new Date(`${day.day}T12:00:00Z`))}
                  </h2>
                </div>
                <span className="count-badge">{day.events.length}</span>
              </div>

              <div className="week-day-body">
                {day.events.length > 0 ? (
                  <ol className="week-event-list">
                    {day.events.map((event) => (
                      <li className="week-event" key={event.id}>
                        <span className="week-event-time">
                          {event.all_day ? "ALL DAY" : timeFormatter.format(new Date(event.start))}
                        </span>
                        <span className="week-event-title">{event.title}</span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="week-day-empty">
                    {calendarUnavailable ? "Events unavailable." : "No events."}
                  </p>
                )}

                {day.scheduled_tasks.length > 0 && (
                  <div className="week-day-tasks">
                    <span className="week-day-label">Scheduled</span>
                    <TaskList
                      tasks={day.scheduled_tasks}
                      dateField="scheduled"
                      emptyMessage=""
                    />
                  </div>
                )}

                {day.due_tasks.length > 0 && (
                  <div className="week-day-tasks">
                    <span className="week-day-label">Due</span>
                    <TaskList tasks={day.due_tasks} dateField="due" emptyMessage="" />
                  </div>
                )}

                {day.events.length === 0 &&
                  day.scheduled_tasks.length === 0 &&
                  day.due_tasks.length === 0 && (
                    <p className="week-day-empty">
                      {notionUnavailable || calendarUnavailable
                        ? "Some information may be missing."
                        : "Nothing planned."}
                    </p>
                  )}
              </div>
            </section>
          );
        })}
      </div>

      <footer className="dashboard-footer">
        <span>Life OS <span className="footer-separator">/</span> Weekly Review</span>
        <span className="footer-status"><span className="footer-status-dot" />Read-only view</span>
      </footer>
    </div>
  );
}
