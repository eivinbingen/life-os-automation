"use client";

import { useCallback, useRef, useState } from "react";

import {
  formatDay,
  shiftDay,
} from "../../date-utils";
import type {
  LookBackSummary,
  ReviewRecord,
  SectionProgress,
} from "./review-actions";

const SECTIONS = [
  { key: "look_back", title: "Look Back", question: "What happened?" },
  { key: "clean_up", title: "Clean Up", question: "What needs a decision?" },
  { key: "direction", title: "Direction", question: "Is the direction still right?" },
  { key: "ahead", title: "Ahead", question: "Does the coming week make sense?" },
  { key: "commit", title: "Commit", question: "Retain the review" },
] as const;

type SectionKey = (typeof SECTIONS)[number]["key"];

function formatDayShort(value: string) {
  return formatDay(value);
}

function formatTimestamp(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(value));
}

function ReviewSection({
  section,
  index,
  open,
  passed,
  onToggle,
  onPass,
  children,
}: {
  section: (typeof SECTIONS)[number];
  index: number;
  open: boolean;
  passed: boolean;
  onToggle: () => void;
  onPass: () => void;
  children: React.ReactNode;
}) {
  const headingId = `review-section-${section.key}`;
  return (
    <section className="panel review-section" aria-labelledby={headingId}>
      <div className="panel-heading">
        <div>
          <span className="section-kicker">STEP {index + 1} OF {SECTIONS.length}{passed ? " · DONE" : ""}</span>
          <h2 id={headingId}>{section.title} — {section.question}</h2>
        </div>
        <div className="review-section-controls">
          <button
            type="button"
            className="review-collapse"
            aria-expanded={open}
            aria-controls={`${headingId}-body`}
            onClick={onToggle}
          >
            {open ? "Collapse" : "Expand"}
          </button>
          {section.key !== "commit" && (
            <button
              type="button"
              className="review-advance"
              onClick={onPass}
              disabled={passed}
            >
              {passed ? "Advanced" : "Advance"}
            </button>
          )}
        </div>
      </div>
      {open && (
        <div className="review-section-body" id={`${headingId}-body`}>
          {children}
        </div>
      )}
    </section>
  );
}

function LookBackBody({
  savedSummary,
  live,
}: {
  savedSummary: LookBackSummary | null;
  live: { ok: true; summary: LookBackSummary } | { ok: false; error: string } | null;
}) {
  // A completed review renders its fixed saved summary; live data only
  // applies to drafts.
  if (savedSummary) {
    return <SummaryView summary={savedSummary} saved />;
  }
  if (live === null) {
    return (
      <p className="review-prompt">
        The look-back summary is unavailable right now. Your manual wins are still
        saved with the review.
      </p>
    );
  }
  if (!live.ok) {
    return (
      <div className="integration-alert" role="alert">
        <span className="alert-symbol" aria-hidden="true">!</span>
        <span>{live.error}</span>
      </div>
    );
  }
  return <SummaryView summary={live.summary} saved={false} />;
}

function SummaryView({ summary, saved }: { summary: LookBackSummary; saved: boolean }) {
  const degraded = summary.metrics.some((metric) => !metric.available);
  return (
    <div className="look-back-summary">
      <div className="review-metrics">
        {summary.metrics.map((metric) => (
          <div key={metric.key} className={`review-metric${metric.available ? "" : " unavailable"}`}>
            <span className="review-metric-count" aria-label={metric.label}>
              {metric.available ? metric.count : "N/A"}
            </span>
            <span className="review-metric-label">{metric.label}</span>
            <span className="review-metric-definition">{metric.definition}</span>
          </div>
        ))}
      </div>
      <details className="review-task-list">
        <summary>
          Completed work ({summary.completed_tasks.length}) — scheduled that week and now done
        </summary>
        {summary.completed_tasks.length === 0 ? (
          <p className="review-empty-note">No tasks were scheduled that week and are now done.</p>
        ) : (
          <ul>
            {summary.completed_tasks.map((task) => (
              <li key={task.id}>
                {task.name}
                {task.project_name ? <span className="review-task-project"> · {task.project_name}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </details>
      <details className="review-task-list">
        <summary>Unfinished work ({summary.unfinished_tasks.length})</summary>
        {summary.unfinished_tasks.length === 0 ? (
          <p className="review-empty-note">No unfinished work was scheduled that week.</p>
        ) : (
          <ul>
            {summary.unfinished_tasks.map((task) => (
              <li key={task.id}>
                {task.name}
                {task.project_name ? <span className="review-task-project"> · {task.project_name}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </details>
      {summary.statuses.some((status) => !status.ok) && (
        <div className="integration-alert" role="alert">
          <span className="alert-symbol" aria-hidden="true">!</span>
          <span>
            {summary.statuses
              .filter((status) => !status.ok)
              .map((status) => `${status.name} is unavailable.`)
              .join(" ")}
          </span>
        </div>
      )}
      <p className="review-saved-meta">
        {saved ? (
          <>
            Saved summary captured {formatTimestamp(summary.captured_at, summary.timezone)}. This
            record is fixed history; live changes do not rewrite it.
          </>
        ) : (
          <>
            Live summary captured {formatTimestamp(summary.captured_at, summary.timezone)}.
            {degraded ? " Some sources are unavailable." : ""}
          </>
        )}
      </p>
    </div>
  );
}

export function ReviewBoard({
  initialReview,
  history,
  historyError,
  lookBack,
}: {
  initialReview: ReviewRecord;
  history: ReviewRecord[];
  historyError?: string | null;
  lookBack?: { ok: true; summary: LookBackSummary } | { ok: false; error: string } | null;
}) {
  const [review, setReview] = useState(initialReview);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({ look_back: true, commit: true });
  const [wins, setWins] = useState(initialReview.wins);
  const [reflection, setReflection] = useState(initialReview.reflection);
  const [progress, setProgress] = useState<SectionProgress>(initialReview.section_progress);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error" | "conflict">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  // Guards against duplicate saves/completions before state updates land.
  const writeInFlight = useRef(false);
  // Edits made while a save is in flight; flushed against the revision that
  // save returns so a reload cannot lose them.
  const pendingEdits = useRef<{
    wins?: string;
    reflection?: string;
    section_progress?: SectionProgress;
  }>({});

  const isCompleted = review.status === "completed";

  const persist = useCallback(
    async (
      edits: { wins?: string; reflection?: string; section_progress?: SectionProgress },
      options: { complete?: boolean } = {},
    ) => {
      if (writeInFlight.current) {
        pendingEdits.current = { ...pendingEdits.current, ...edits };
        return;
      }
      writeInFlight.current = true;
      setSaveState("saving");
      setSaveError(null);

      try {
        const { completeReview, saveReviewDraft } = await import("./review-actions");
        let current = review;
        let payload = edits;
        let complete = options.complete;
        for (;;) {
          const result = complete
            ? await completeReview(current.id, current.revision, `${current.id}:${current.revision}`, payload)
            : await saveReviewDraft(current.id, current.revision, payload);
          if (!result.ok) {
            pendingEdits.current = {};
            setSaveState(result.conflict ? "conflict" : "error");
            setSaveError(result.error);
            return;
          }
          current = result.review;
          setReview(current);
          setProgress(current.section_progress);
          setSaveState("saved");
          if (complete || Object.keys(pendingEdits.current).length === 0) return;
          // Completed records reject later edits, so queued follow-ups only
          // apply to draft saves.
          complete = false;
          payload = pendingEdits.current;
          pendingEdits.current = {};
        }
      } finally {
        writeInFlight.current = false;
      }
    },
    [review],
  );

  const markPassed = useCallback(
    (key: SectionKey) => {
      const next = { ...progress, [key]: true };
      setProgress(next);
      if (!isCompleted) void persist({ section_progress: next });
    },
    [progress, isCompleted, persist],
  );

  const toggleSection = (key: string) => {
    setOpenSections((current) => ({ ...current, [key]: !current[key] }));
  };

  const nextWeekPreviewStart = shiftDay(review.ahead_start, 0);

  return (
    <div className="dashboard-content">
      <section className="intro" aria-labelledby="review-title">
        <div>
          <p className="eyebrow"><span className="eyebrow-line" /> WEEKLY REVIEW</p>
          <h1 id="review-title" className="week-title">
            {formatDayShort(review.week_start).split(",")[1]?.trim() || formatDayShort(review.week_start)} –{" "}
            {formatDayShort(review.week_end)}
            <span className="title-period">.</span>
          </h1>
          <p className="intro-copy">
            A guided recalibration of your week. Your progress and answers save as you go.
          </p>
        </div>
        <div className="review-status" aria-label="Review state">
          <span className={`review-state-chip${isCompleted ? " completed" : ""}`}>
            {isCompleted ? "Completed" : "Draft"}
          </span>
          <span className="review-dates">
            {formatDayShort(review.week_start)} → {formatDayShort(review.ahead_end)}
          </span>
        </div>
      </section>

      {saveState === "conflict" && (
        <div className="integration-alert" role="alert">
          <span className="alert-symbol" aria-hidden="true">!</span>
          <span>
            {saveError} Load the page to see the current version, reconcile your edits, and save again.
          </span>
        </div>
      )}
      {saveState === "error" && (
        <div className="integration-alert" role="alert">
          <span className="alert-symbol" aria-hidden="true">!</span>
          <span>{saveError}</span>
          <button type="button" className="review-retry" onClick={() => void persist({ wins, reflection, section_progress: progress })}>
            Try again
          </button>
        </div>
      )}
      {saveState === "saved" && !isCompleted && (
        <div className="review-saved-note" role="status">All changes saved.</div>
      )}
      {saveState === "saving" && (
        <div className="review-saved-note" role="status">Saving…</div>
      )}

      <div className="review-progress" aria-label="Review progression">
        {SECTIONS.map((section, index) => {
          const passed = section.key === "commit" ? isCompleted : progress[section.key as keyof SectionProgress];
          return (
            <span key={section.key} className={`review-step${passed ? " done" : ""}${openSections[section.key] ? " current" : ""}`}>
              {index + 1}. {section.title}
            </span>
          );
        })}
      </div>

      <ReviewSection
        section={SECTIONS[0]}
        index={0}
        open={Boolean(openSections.look_back)}
        passed={progress.look_back}
        onToggle={() => toggleSection("look_back")}
        onPass={() => markPassed("look_back")}
      >
        <LookBackBody
          savedSummary={review.look_back_summary}
          live={lookBack ?? null}
        />
        <p className="review-prompt">
          Record what mattered this week in your own words; your manual wins are saved
          with the review.
        </p>
        <label className="review-field">
          <span>Wins</span>
          <textarea
            value={wins}
            onChange={(event) => setWins(event.target.value)}
            onBlur={() => { if (!isCompleted && wins !== review.wins) void persist({ wins }); }}
            disabled={isCompleted}
            rows={4}
            placeholder="What went well this week?"
          />
        </label>
        <label className="review-field">
          <span>Reflection (optional)</span>
          <textarea
            value={reflection}
            onChange={(event) => setReflection(event.target.value)}
            onBlur={() => { if (!isCompleted && reflection !== review.reflection) void persist({ reflection }); }}
            disabled={isCompleted}
            rows={3}
            placeholder="Anything you want to remember about this week?"
          />
        </label>
      </ReviewSection>

      <ReviewSection
        section={SECTIONS[1]}
        index={1}
        open={Boolean(openSections.clean_up)}
        passed={progress.clean_up}
        onToggle={() => toggleSection("clean_up")}
        onPass={() => markPassed("clean_up")}
      >
        <p className="review-prompt">
          Decide what to do about unresolved work. The decision queue with reschedule, backlog,
          and complete actions arrives in a later slice; you can advance without clearing it.
        </p>
      </ReviewSection>

      <ReviewSection
        section={SECTIONS[2]}
        index={2}
        open={Boolean(openSections.direction)}
        passed={progress.direction}
        onToggle={() => toggleSection("direction")}
        onPass={() => markPassed("direction")}
      >
        <p className="review-prompt">
          Has anything changed? Is your direction still right? The active-goal review with
          Add Goal and Add Project actions arrives in a later slice.
        </p>
      </ReviewSection>

      <ReviewSection
        section={SECTIONS[3]}
        index={3}
        open={Boolean(openSections.ahead)}
        passed={progress.ahead}
        onToggle={() => toggleSection("ahead")}
        onPass={() => markPassed("ahead")}
      >
        <p className="review-prompt">
          Next week ({formatDayShort(review.ahead_start)} – {formatDayShort(review.ahead_end)}) is paired
          to the reviewed week. The chronological look-ahead timeline arrives in a later slice;
          the paired dates are fixed to this review.
        </p>
        <p className="review-dates-inline">
          Ahead week starting <time dateTime={nextWeekPreviewStart}>{formatDayShort(review.ahead_start)}</time>
        </p>
      </ReviewSection>

      <ReviewSection
        section={SECTIONS[4]}
        index={4}
        open={Boolean(openSections.commit)}
        passed={isCompleted}
        onToggle={() => toggleSection("commit")}
        onPass={() => {}}
      >
        <p className="review-prompt">
          Completing stores this review with your wins, reflection, and section progress as a
          read-only record. Unresolved items and unavailable sources are acknowledged, not blockers.
        </p>
        {isCompleted ? (
          <p className="review-completed-note">
            Completed {review.completed_at ? formatTimestamp(review.completed_at, review.timezone) : ""}. This
            record is saved history; later source changes do not rewrite it.
          </p>
        ) : (
          <button
            type="button"
            className="retry-button review-complete"
            disabled={completing || saveState === "saving"}
            onClick={() => {
              setCompleting(true);
              void persist(
                { wins, reflection, section_progress: progress },
                { complete: true },
              ).finally(() => setCompleting(false));
            }}
          >
            {completing ? "Completing…" : "Complete review"}
          </button>
        )}
      </ReviewSection>

      {historyError && (
        <section className="panel" aria-labelledby="review-history-heading">
          <div className="panel-heading">
            <div><span className="section-kicker">HISTORY</span><h2 id="review-history-heading">Completed reviews</h2></div>
          </div>
          <div className="integration-alert" role="alert">
            <span className="alert-symbol" aria-hidden="true">!</span>
            <span>{historyError}</span>
          </div>
        </section>
      )}

      {history.length > 0 && (
        <section className="panel" aria-labelledby="review-history-heading">
          <div className="panel-heading">
            <div><span className="section-kicker">HISTORY</span><h2 id="review-history-heading">Completed reviews</h2></div>
            <span className="count-badge">{history.length}</span>
          </div>
          <ul className="review-history-list">
            {history.map((entry) => (
              <li key={entry.id} className="review-history-item">
                <span>{formatDayShort(entry.week_start)} – {formatDayShort(entry.week_end)}</span>
                <span>Completed {entry.completed_at ? formatTimestamp(entry.completed_at, entry.timezone) : ""}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="dashboard-footer">
        <span>Life OS <span className="footer-separator">/</span> Weekly Review</span>
        <span className="footer-status"><span className="footer-status-dot" />App-owned history</span>
      </footer>
    </div>
  );
}
