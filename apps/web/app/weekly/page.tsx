import { connection } from "next/server";

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
    <>
      <header className="topbar">
        <span className="topbar-label">YOUR WEEK AT A GLANCE</span>
        <time dateTime={selectedWeekStart}>{formatDay(selectedWeekStart)}</time>
      </header>
      {result.ok ? (
        <WeeklyBoard key={result.week.start} week={result.week} localDay={localDay} />
      ) : (
        <div className="service-error-wrap">
          <section className="service-error" role="alert" aria-labelledby="week-error-title">
            <h1 id="week-error-title">Weekly overview is unavailable</h1>
            <p className="service-error-copy">{result.error}</p>
            <p>
              Requested week starting <time dateTime={selectedWeekStart}>{formatDay(selectedWeekStart)}</time>
            </p>
            <a className="retry-button weekly-retry-link" href={`/weekly?day=${selectedWeekStart}`}>
              Try again
            </a>
          </section>
        </div>
      )}
    </>
  );
}
