import { connection } from "next/server";
import Link from "next/link";

import { refreshWeek } from "../actions";
import { WeeklyBoard } from "./weekly-board";
import { formatDay, getLocalDay, isValidDay, startOfWeek } from "../date-utils";

export const metadata = {
  title: "Weekly Review · Life OS",
};

export default async function WeeklyPage({
  searchParams,
}: PageProps<"/weekly">) {
  await connection();
  const requestedDay = (await searchParams).day;
  const dayCandidate = typeof requestedDay === "string" ? requestedDay : undefined;
  const localDay = getLocalDay();
  const selectedWeekStart = startOfWeek(
    isValidDay(dayCandidate) ? dayCandidate : localDay,
  );

  const result = await refreshWeek(selectedWeekStart);

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Workspace">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">L</span>
          <span className="brand-name">life<span>os</span></span>
        </div>
        <div className="sidebar-middle">
          <span className="sidebar-label">WORKSPACE</span>
          <Link className="nav-link" href="/">
            <span className="nav-icon" aria-hidden="true">◈</span>
            Today
          </Link>
          <div className="nav-current" aria-current="page">
            <span className="nav-icon" aria-hidden="true">▦</span>
            Weekly Review
          </div>
        </div>
        <div className="sidebar-footer">
          <span className="local-dot" aria-hidden="true" />
          <div>
            <strong>Local workspace</strong>
            <span>{result.ok ? "Read-only weekly overview" : "Service unavailable"}</span>
          </div>
        </div>
      </aside>

      <main className="dashboard">
        <header className="topbar">
          <span className="topbar-label">YOUR WEEK AT A GLANCE</span>
          <time dateTime={selectedWeekStart}>{formatDay(selectedWeekStart)}</time>
        </header>
        {result.ok ? (
          <WeeklyBoard key={result.week.start} week={result.week} localDay={localDay} />
        ) : (
          <section className="service-error" role="alert" aria-labelledby="week-error-title">
            <h1 id="week-error-title">Weekly overview is unavailable</h1>
            <p>The local Life OS service could not load this week. Check that it is running, then try again.</p>
            <p>Requested week starting <time dateTime={selectedWeekStart}>{formatDay(selectedWeekStart)}</time></p>
            <a className="retry-button" href={`/weekly?day=${selectedWeekStart}`}>Try again</a>
          </section>
        )}
      </main>
    </div>
  );
}
