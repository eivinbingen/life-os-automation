import { connection } from "next/server";
import Link from "next/link";

import type { Week } from "../actions";
import { WeeklyBoard } from "./weekly-board";
import { formatDay, getLocalDay, isValidDay, startOfWeek } from "../date-utils";

export const metadata = {
  title: "Weekly Review · Life OS",
};

export default async function WeeklyPage({
  searchParams,
}: PageProps<"/weekly">) {
  await connection();
  const apiUrl = process.env.LIFE_OS_API_URL;
  const requestedDay = (await searchParams).day;
  const dayCandidate = typeof requestedDay === "string" ? requestedDay : undefined;
  const localDay = getLocalDay();
  const selectedWeekStart = startOfWeek(
    isValidDay(dayCandidate) ? dayCandidate : localDay,
  );

  if (!apiUrl) {
    throw new Error("LIFE_OS_API_URL is not configured");
  }

  const response = await fetch(
    `${apiUrl}/week?day=${encodeURIComponent(selectedWeekStart)}`,
    { cache: "no-store" },
  );

  if (!response.ok) {
    throw new Error("Could not load the week's data");
  }

  const week: Week = await response.json();

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
            <span>Notion connected</span>
          </div>
        </div>
      </aside>

      <main className="dashboard">
        <header className="topbar">
          <span className="topbar-label">YOUR WEEK AT A GLANCE</span>
          <time dateTime={week.start}>{formatDay(week.start)}</time>
        </header>
        <WeeklyBoard key={week.start} week={week} localDay={localDay} />
      </main>
    </div>
  );
}
