"use client";

import { useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { formatDay, getLocalDay, isValidDay } from "./date-utils";

export default function ErrorPage({ retry }: { retry: () => void }) {
  const searchParams = useSearchParams();
  const requestedDay = searchParams.get("day");
  const localDay = getLocalDay();
  const selectedDay = isValidDay(requestedDay) ? requestedDay : localDay;
  const [isRetrying, startRetry] = useTransition();

  return (
    <div className="app-shell error-shell">
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
          <span className="local-dot service-offline-dot" aria-hidden="true" />
          <div>
            <strong>Local workspace</strong>
            <span>Service unavailable</span>
          </div>
        </div>
      </aside>

      <main className="dashboard error-dashboard">
        <header className="topbar">
          <span className="topbar-label">YOUR DAILY SPACE</span>
          <time dateTime={selectedDay}>{formatDay(selectedDay)}</time>
        </header>

        <div className="service-error-wrap">
          <section className="service-error" role="alert" aria-labelledby="service-error-title">
            <span className="service-error-icon" aria-hidden="true">!</span>
            <p className="eyebrow"><span className="eyebrow-line" /> CONNECTION NEEDED</p>
            <h1 id="service-error-title">Life OS is unavailable<span>.</span></h1>
            <p className="service-error-copy">
              The local Life OS service could not be reached. Start it from the repository,
              then try this day again.
            </p>

            <div className="service-error-day">
              <span>Requested day</span>
              <time dateTime={selectedDay}>{formatDay(selectedDay)}</time>
            </div>

            <button
              className="retry-button"
              type="button"
              disabled={isRetrying}
              onClick={() => startRetry(retry)}
            >
              {isRetrying ? "Trying again…" : "Try again"}
            </button>
            <p className="service-error-hint">
              Run <code>uv run life-os-dev</code> from the repository root.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
