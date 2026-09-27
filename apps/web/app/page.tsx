import { connection } from "next/server";

import type { Today } from "./actions";
import { Dashboard } from "./dashboard";
import { formatDay, getLocalDay, isValidDay } from "./date-utils";
import { WorkspaceSidebar } from "./sidebar";

export default async function Home({ searchParams }: PageProps<"/">) {
  await connection();
  const apiUrl = process.env.LIFE_OS_API_URL;
  const requestedDay = (await searchParams).day;
  const dayCandidate = typeof requestedDay === "string" ? requestedDay : undefined;
  const localDay = getLocalDay();
  const selectedDay = isValidDay(dayCandidate) ? dayCandidate : localDay;

  if (!apiUrl) {
    throw new Error("LIFE_OS_API_URL is not configured");
  }

  const response = await fetch(
    `${apiUrl}/today?day=${encodeURIComponent(selectedDay)}`,
    { cache: "no-store" },
  );

  if (!response.ok) {
    throw new Error("Could not load today's data");
  }

  const today: Today = await response.json();

  return (
    <div className="app-shell">
      <WorkspaceSidebar current="today" />

      <main className="dashboard">
        <header className="topbar">
          <span className="topbar-label">YOUR DAILY SPACE</span>
          <time dateTime={today.day}>{formatDay(today.day)}</time>
        </header>
        <Dashboard
          key={today.day}
          initialToday={today}
          localDay={localDay}
          initialRefreshedAt={new Date().toISOString()}
        />
      </main>
    </div>
  );
}
