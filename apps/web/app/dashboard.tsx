"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { RefreshResult, Task, Today } from "./actions";
import { refreshToday } from "./actions";
import {
  APP_TIME_ZONE,
  dayHeading,
  formatDay,
  shiftDay,
} from "./date-utils";
import { TaskCapture } from "./task-capture";
import { TaskCheckbox } from "./task-checkbox";
import { TaskEditPanel } from "./task-edit";
import {
  OpenTaskCount,
  TaskCompletionProvider,
  useTaskCompletion,
} from "./task-completion";

/** How long a cached day counts as fresh: no refetch when returning to it. */
const CACHE_TTL_MS = 30_000;

type DashboardOperations = {
  refresh: () => Promise<void>;
  selectDay: (day: string) => void;
  isRefreshing: boolean;
  capturePending: boolean;
  setCapturePending: (pending: boolean) => void;
  savedNotice: string | null;
  setSavedNotice: (name: string | null) => void;
};

const DashboardOperationsContext = createContext<DashboardOperations | null>(
  null,
);

export function useDashboardOperations() {
  const context = useContext(DashboardOperationsContext);

  if (!context) {
    throw new Error("Dashboard operation components must be inside Dashboard");
  }

  return context;
}

const timeFormatter = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: APP_TIME_ZONE,
});

const refreshTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: APP_TIME_ZONE,
});

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

function formatEventTime(event: Today["events"][number]) {
  if (event.all_day) return "All day";
  return `${timeFormatter.format(new Date(event.start))} – ${timeFormatter.format(new Date(event.end))}`;
}

function formatRefreshTime(value: string) {
  return refreshTimeFormatter.format(new Date(value));
}

function TaskList({
  tasks,
  dateField,
  emptyMessage,
  overdueIds,
  onEdit,
}: {
  tasks: Today["scheduled_tasks"];
  dateField: "scheduled" | "due";
  emptyMessage: string;
  overdueIds?: Set<string>;
  onEdit: (task: Today["scheduled_tasks"][number]) => void;
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
            <button
              type="button"
              className="task-name task-name-button"
              onClick={() => onEdit(task)}
              aria-label={`Edit task ${task.name}`}
            >
              {task.name}
            </button>
            {overdueIds?.has(task.id) && (
              <span className="task-overdue-tag">Overdue</span>
            )}
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
      ))}
    </ul>
  );
}

type RefreshControlsProps = {
  refresh: () => void;
  isRefreshing: boolean;
  lastRefreshedAt: string | null;
};

function RefreshButton({
  refresh,
  isRefreshing,
  lastRefreshedAt,
}: RefreshControlsProps) {
  const { pendingIds, capturePending } = useTaskCompletion();
  const completionInFlight = pendingIds.size > 0 || capturePending;

  return (
    <span className="refresh-meta">
      <button
        className="refresh-button"
        type="button"
        onClick={refresh}
        disabled={isRefreshing || completionInFlight}
        title={
          completionInFlight
            ? "Wait for the task save to finish"
            : undefined
        }
      >
        {isRefreshing ? "Refreshing…" : "Refresh"}
      </button>
      {lastRefreshedAt && (
        <span className="refreshed-at" title={lastRefreshedAt}>
          Last refreshed {formatRefreshTime(lastRefreshedAt)}
        </span>
      )}
    </span>
  );
}

function RefreshRetry({ refresh, isRefreshing }: RefreshControlsProps) {
  const { pendingIds, capturePending } = useTaskCompletion();
  const completionInFlight = pendingIds.size > 0 || capturePending;

  return (
    <button
      className="refresh-retry"
      type="button"
      onClick={refresh}
      disabled={isRefreshing || completionInFlight}
    >
      Try again
    </button>
  );
}

export function Dashboard({
  initialToday,
  localDay,
  initialRefreshedAt,
}: {
  initialToday: Today;
  localDay: string;
  initialRefreshedAt: string;
}) {
  const [today, setToday] = useState(initialToday);
  // Remount the completion provider on every successful refresh so its
  // checkbox state is re-seeded from the fresh data.
  const [completionEpoch, setCompletionEpoch] = useState(0);
  const [lastRefreshedAt, setLastRefreshedAt] = useState(initialRefreshedAt);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [capturePending, setCapturePending] = useState(false);
  // The task currently open in the edit panel; null when closed.
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  // Lives outside the completion provider so the remount that re-seeds
  // checkbox state cannot wipe a capture's save confirmation.
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  // Guards against duplicate refresh requests even if two clicks land in the
  // same render frame, before isRefreshing state updates.
  const refreshInFlight = useRef(false);
  // The selected day switches immediately on navigation, independent of the
  // data currently displayed, so the heading is never behind the click.
  const [selectedDay, setSelectedDay] = useState(initialToday.day);
  // The day with a navigation load in flight for the current selection.
  // Distinct from isRefreshing, which is the explicit Refresh action and
  // blocks edits; navigation loading never blocks editing.
  const [loadingDay, setLoadingDay] = useState<string | null>(null);

  // Client-side cache of recently loaded days. Deliberately ref-based: the
  // cache lives only as long as this dashboard component, matching the
  // issue's short-lived scope, and writes inside async loads do not render.
  const dayCacheRef = useRef<Map<string, { today: Today; loadedAt: string }>>(
    new Map([
      [initialToday.day, { today: initialToday, loadedAt: initialRefreshedAt }],
    ]),
  );
  // One in-flight load per day: navigating to an already-loading day reuses
  // its request instead of issuing a second one.
  const dayLoadsRef = useRef<Map<string, Promise<RefreshResult>>>(new Map());
  // Mirrors selectedDay for async load callbacks: they must adopt results
  // only for the day still selected (latest selection wins), not the day
  // captured when the request started.
  const selectedDayRef = useRef(selectedDay);
  // Mirrors loadingDay so load completions clear it even when the selection
  // has moved on in the meantime.
  const loadingDayRef = useRef<string | null>(null);

  const previousDay = shiftDay(selectedDay, -1);
  const nextDay = shiftDay(selectedDay, 1);
  const heading = dayHeading(selectedDay, localDay);
  const isCurrentDay = selectedDay === localDay;

  // True while a navigation load for the selected day is in flight.
  const dayLoading = loadingDay === selectedDay;
  // True when the displayed data belongs to a different day than selected:
  // the panels are showing the previous day's data as a loading fallback.
  const showingOtherDay = today.day !== selectedDay;
  // A navigation load failed and no cached data exists for the selected day,
  // so the fallback data must be clearly identified, never under this date.
  const selectedDayUnavailable =
    refreshError !== null && showingOtherDay && !dayLoading;

  const tasks = useMemo(
    () => [
      ...today.scheduled_tasks,
      ...today.due_tasks,
      ...today.overdue_tasks,
    ],
    [today],
  );
  const taskIds = useMemo(() => tasks.map((task) => task.id), [tasks]);
  // The overdue rule stays in the domain service; the Scheduled row only
  // reads overdue-section membership to show its indicator.
  const overdueIds = useMemo(
    () => new Set(today.overdue_tasks.map((task) => task.id)),
    [today],
  );
  const events = useMemo(
    () => [...today.events].sort((a, b) => a.start.localeCompare(b.start)),
    [today],
  );
  const issues = useMemo(
    () => today.statuses.filter((status) => !status.ok),
    [today],
  );
  const calendarUnavailable = issues.some((status) => status.name === "Calendar");
  const notionUnavailable = issues.some((status) => status.name === "Notion");

  // Fetches a day and adopts its result only if it is still selected when the
  // response lands. Shared by first-time navigation, stale-cache returns, and
  // failed-load retries, so every path goes through the same cache rules.
  const loadDay = useCallback(async (day: string) => {
    const existing = dayLoadsRef.current.get(day);
    if (existing) return existing;

    const load = (async () => {
      let result: RefreshResult;
      try {
        result = await refreshToday(day);
      } catch {
        // Defense in depth: the server action reports failures as results,
        // but anything thrown must not leave a dangling in-flight entry.
        result = { ok: false as const, error: "Refresh failed unexpectedly" };
      }

      if (result.ok) {
        dayCacheRef.current.set(day, {
          today: result.today,
          loadedAt: new Date().toISOString(),
        });
        if (selectedDayRef.current === day) {
          setToday(result.today);
          setCompletionEpoch((epoch) => epoch + 1);
          setLastRefreshedAt(new Date().toISOString());
          setRefreshError(null);
        }
      } else if (selectedDayRef.current === day) {
        setRefreshError(result.error);
      }

      if (loadingDayRef.current === day) {
        loadingDayRef.current = null;
        setLoadingDay(null);
      }
      dayLoadsRef.current.delete(day);
      return result;
    })();

    dayLoadsRef.current.set(day, load);
    if (selectedDayRef.current === day) {
      loadingDayRef.current = day;
      setLoadingDay(day);
    }
    return load;
  }, []);

  const refresh = useCallback(async () => {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    setIsRefreshing(true);

    // Read the day at request time: the explicit Refresh always targets the
    // currently selected day, never a stale closure.
    const day = selectedDayRef.current;
    let result: RefreshResult;
    try {
      result = await refreshToday(day);
    } catch {
      // Defense in depth: the server action reports failures as results,
      // but anything thrown here must still end the pending state.
      result = { ok: false as const, error: "Refresh failed unexpectedly" };
    }

    if (result.ok) {
      // Refresh bypasses the cache: the new result replaces the cached copy.
      dayCacheRef.current.set(day, {
        today: result.today,
        loadedAt: new Date().toISOString(),
      });
      if (selectedDayRef.current === day) {
        setToday(result.today);
        setCompletionEpoch((epoch) => epoch + 1);
        setLastRefreshedAt(new Date().toISOString());
        setRefreshError(null);
      }
    } else if (selectedDayRef.current === day) {
      setRefreshError(result.error);
    }

    refreshInFlight.current = false;
    setIsRefreshing(false);
  }, []);

  // Adopts a day through the shared cache rules. Used by both the day
  // controls (which push a history entry first) and browser back/forward.
  const adoptDay = useCallback(
    (day: string) => {
      setSelectedDay(day);
      selectedDayRef.current = day;
      // Open panels close on a day switch so a capture or edit can never
      // target the wrong day; in-flight saves continue in the background.
      setEditingTask(null);
      setSavedNotice(null);

      const cache = dayCacheRef.current.get(day);
      if (cache) {
        // Cached: show immediately, labeled with its original load time so
        // stale data is never presented as freshly loaded. The completion
        // state is kept: re-seeding it from the cached snapshot would
        // uncheck tasks completed after the day was cached.
        setToday(cache.today);
        setLastRefreshedAt(cache.loadedAt);
        setRefreshError(null);
        if (Date.now() - new Date(cache.loadedAt).getTime() >= CACHE_TTL_MS) {
          // Stale beyond the window: a fresh fetch runs in the background
          // and swaps in when it lands.
          void loadDay(day);
        }
        return;
      }

      // Uncached: the previous day's data stays visible as a fallback under
      // a clear loading indicator for the newly selected day; a failure
      // swaps it for the failed-day state instead of mislabeling it.
      setRefreshError(null);
      void loadDay(day);
    },
    [loadDay],
  );

  const selectDay = useCallback(
    (day: string) => {
      if (day === selectedDayRef.current) return;

      // Native pushState integrates with the Next router: the URL reflects
      // the day without a server round trip or a remount (Next 16 docs,
      // linking-and-navigating#native-history-api).
      window.history.pushState({ day }, "", `/?day=${day}`);
      adoptDay(day);
    },
    [adoptDay],
  );

  // Browser back/forward moves through the entries created by selectDay;
  // follow the day in the URL without pushing a new entry.
  useEffect(() => {
    function onPopState() {
      const dayParam = new URLSearchParams(window.location.search).get("day");
      if (dayParam && dayParam !== selectedDayRef.current) {
        adoptDay(dayParam);
      }
    }

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [adoptDay]);

  const refreshControls = { refresh: () => void refresh(), isRefreshing, lastRefreshedAt };

  const operations: DashboardOperations = {
    refresh,
    selectDay,
    isRefreshing,
    capturePending,
    setCapturePending,
    savedNotice,
    setSavedNotice,
  };

  return (
    <DashboardOperationsContext.Provider value={operations}>
      <TaskCompletionProvider
        key={completionEpoch}
        tasks={tasks.map((task) => ({ id: task.id, done: task.done }))}
        refreshInProgress={isRefreshing}
        capturePending={capturePending}
      >
      <div className="dashboard-content">
        <section className="intro" aria-labelledby="page-title">
          <div>
            <p className="eyebrow"><span className="eyebrow-line" /> DAILY OVERVIEW</p>
            <h1 id="page-title">{heading}<span className="title-period">.</span></h1>
            <p className="intro-copy">A clear view of your time and what needs your attention.</p>
          </div>
          <div className="date-navigation">
            <div className="day-controls" aria-label="Choose a day">
              <button
                type="button"
                aria-label={`Previous day, ${formatDay(previousDay)}`}
                onClick={() => selectDay(previousDay)}
              >&larr;</button>
              <button
                type="button"
                className="today-link"
                onClick={() => selectDay(localDay)}
              >Today</button>
              <button
                type="button"
                aria-label={`Next day, ${formatDay(nextDay)}`}
                onClick={() => selectDay(nextDay)}
              >&rarr;</button>
            </div>
            {/* Keyed by the selected day: switching days closes the capture
                popover so it cannot submit against the wrong day. */}
            <TaskCapture key={selectedDay} selectedDay={selectedDay} />
            <div className="date-tile" aria-label={formatDay(today.day)}>
              <span>{new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" }).format(new Date(`${today.day}T12:00:00Z`))}</span>
              <strong>{today.day.slice(8, 10)}</strong>
              <span>{new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" }).format(new Date(`${today.day}T12:00:00Z`))}</span>
            </div>
          </div>
        </section>

        <div className="overview-strip" aria-label="Selected day at a glance">
          <div className="overview-item"><strong>{today.events.length}</strong><span>Calendar events</span></div>
          <div className="overview-item"><strong><OpenTaskCount taskIds={taskIds} /></strong><span>Open tasks</span></div>
          <div className="overview-item"><strong><OpenTaskCount taskIds={today.overdue_tasks.map((task) => task.id)} /></strong><span>Overdue</span></div>
        </div>

        {dayLoading && showingOtherDay && (
          <div className="integration-alert day-loading-alert" role="status" aria-live="polite">
            <span className="alert-symbol day-loading-symbol" aria-hidden="true">…</span>
            <span>
              Loading {formatDay(selectedDay)}. Showing {formatDay(today.day)} until it loads.
            </span>
          </div>
        )}

        {selectedDayUnavailable && (
          <div className="integration-alert refresh-alert" role="alert">
            <span className="alert-symbol" aria-hidden="true">!</span>
            <span>
              Couldn&apos;t load {formatDay(selectedDay)}. Still showing {formatDay(today.day)}.
            </span>
            <button
              className="refresh-retry"
              type="button"
              onClick={() => void loadDay(selectedDay)}
            >
              Try again
            </button>
          </div>
        )}

        {refreshError && !showingOtherDay && (
          <div className="integration-alert refresh-alert" role="alert">
            <span className="alert-symbol" aria-hidden="true">!</span>
            <span>Refresh failed. Showing the last loaded information.</span>
            <RefreshRetry {...refreshControls} />
          </div>
        )}

        {savedNotice && (
          <div className="integration-alert capture-saved-alert" role="status">
            <span className="alert-symbol saved-symbol" aria-hidden="true">✓</span>
            <span>Saved “{savedNotice}” to Notion.</span>
            <button
              className="refresh-retry capture-saved-dismiss"
              type="button"
              onClick={() => setSavedNotice(null)}
            >
              Dismiss
            </button>
          </div>
        )}

        {issues.length > 0 && (
          <div className="integration-alert" role="status">
            <span className="alert-symbol" aria-hidden="true">!</span>
            <span>{issues.map((status) => status.name).join(" and ")} {issues.length === 1 ? "is" : "are"} unavailable. Some information may be missing.</span>
          </div>
        )}

        <div
          className="content-grid"
          aria-busy={dayLoading && showingOtherDay ? true : undefined}
        >
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
                  <p>{calendarUnavailable ? "Your events could not be loaded right now." : `No events on your calendar for ${isCurrentDay ? "today" : "this day"}.`}</p>
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
              <TaskList tasks={today.scheduled_tasks} dateField="scheduled" emptyMessage={notionUnavailable ? "Tasks could not be loaded." : `Nothing scheduled for ${isCurrentDay ? "today" : "this day"}.`} overdueIds={overdueIds} onEdit={setEditingTask} />
            </section>

            <section className="panel task-panel" aria-labelledby="due-heading">
              <div className="panel-heading">
                <div><span className="section-kicker">COMING UP</span><h2 id="due-heading">Due {isCurrentDay ? "today" : "this day"}</h2></div>
                <span className="count-badge"><OpenTaskCount taskIds={today.due_tasks.map((task) => task.id)} /></span>
              </div>
              <TaskList tasks={today.due_tasks} dateField="due" emptyMessage={notionUnavailable ? "Tasks could not be loaded." : `No deadlines ${isCurrentDay ? "today" : "this day"}.`} onEdit={setEditingTask} />
            </section>

            <section className="panel task-panel overdue-panel" aria-labelledby="overdue-heading">
              <div className="panel-heading">
                <div><span className="section-kicker">NEEDS ATTENTION</span><h2 id="overdue-heading">Overdue</h2></div>
                <span className="count-badge overdue-count"><OpenTaskCount taskIds={today.overdue_tasks.map((task) => task.id)} /></span>
              </div>
              <TaskList tasks={today.overdue_tasks} dateField="due" emptyMessage={notionUnavailable ? "Tasks could not be loaded." : "All caught up. Nice work."} onEdit={setEditingTask} />
            </section>
          </div>
        </div>

        <footer className="dashboard-footer">
          <span>Life OS <span className="footer-separator">/</span> Today</span>
          <span className="footer-refresh">
            <RefreshButton {...refreshControls} />
            <span className="footer-status"><span className="footer-status-dot" />Changes sync to Notion</span>
          </span>
        </footer>
      </div>
      {editingTask && (
        <TaskEditPanel
          task={editingTask}
          overdue={overdueIds.has(editingTask.id)}
          onClose={() => setEditingTask(null)}
        />
      )}
      </TaskCompletionProvider>
    </DashboardOperationsContext.Provider>
  );
}
