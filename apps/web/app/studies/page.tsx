import { connection } from "next/server";

import { formatDay, getLocalDay } from "../date-utils";
import { fetchStudies } from "./studies-actions";
import { StudiesBoard } from "./studies-board";

export const metadata = {
  title: "Studies · Life OS",
};

export default async function StudiesPage() {
  await connection();

  const result = await fetchStudies();
  const today = getLocalDay();

  return (
    <>
      <header className="topbar">
        <span className="topbar-label">YOUR ACADEMIC OVERVIEW</span>
        <time dateTime={today}>{formatDay(today)}</time>
      </header>
      {result.ok ? (
        <StudiesBoard overview={result.data} />
      ) : (
        <div className="service-error-wrap">
          <section className="service-error" role="alert" aria-labelledby="studies-error-title">
            <h1 id="studies-error-title">Studies overview is unavailable</h1>
            <p className="service-error-copy">{result.error}</p>
            <a className="retry-button weekly-retry-link" href="/studies">
              Try again
            </a>
          </section>
        </div>
      )}
    </>
  );
}
