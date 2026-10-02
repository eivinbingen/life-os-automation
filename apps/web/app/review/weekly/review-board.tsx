"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  APP_TIME_ZONE,
  formatDay,
  formatItemDate,
  shiftDay,
} from "../../date-utils";
import { TaskProjectLink } from "../../task-project-link";
import { GoalForm } from "../../goal-form";
import { ProjectForm } from "../../project-form";
import type {
  AheadItem,
  AheadSummary,
  CleanUpSummary,
  DirectionGoal,
  DirectionSummary,
  HygieneItem,
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

// Retries and draft persistence all load the same server-action module; the
// promise is cached so every caller resolves the same module instance
// rather than re-running the dynamic import.
let reviewActionsPromise: Promise<typeof import("./review-actions")> | null = null;
function loadReviewActions() {
  reviewActionsPromise ??= import("./review-actions");
  return reviewActionsPromise;
}

// Task actions (reschedule, complete, create) come from the shared app
// module; cached for the same reason as the review actions.
let appActionsPromise: Promise<typeof import("../../actions")> | null = null;
function loadAppActions() {
  appActionsPromise ??= import("../../actions");
  return appActionsPromise;
}

// Assignable-projects options for the hygiene picker come from the
// projects module; cached for the same reason as the app actions.
let projectsActionsPromise: Promise<typeof import("../../projects-actions")> | null = null;
function loadProjectsActions() {
  projectsActionsPromise ??= import("../../projects-actions");
  return projectsActionsPromise;
}

const aheadTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: APP_TIME_ZONE,
});

function formatTimestamp(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(value));
}

function formatDayRange(start: string, end: string) {
  // Compact range, e.g. "21–27 Sep 2026"; "28 Sep–4 Oct 2026" across
  // months, "29 Dec–4 Jan 2027" across years.
  const startDate = new Date(`${start}T12:00:00Z`);
  const endDate = new Date(`${end}T12:00:00Z`);
  const dayFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", timeZone: "UTC" });
  const monthFormat = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" });
  const yearFormat = new Intl.DateTimeFormat("en-GB", { year: "numeric", timeZone: "UTC" });
  const sameMonth = start.slice(0, 7) === end.slice(0, 7);
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  if (sameMonth && sameYear) {
    return `${dayFormat.format(startDate)}–${dayFormat.format(endDate)} ${monthFormat.format(endDate)} ${yearFormat.format(endDate)}`;
  }
  const startLabel = sameYear
    ? `${dayFormat.format(startDate)} ${monthFormat.format(startDate)}`
    : `${dayFormat.format(startDate)} ${monthFormat.format(startDate)} ${yearFormat.format(startDate)}`;
  return `${startLabel}–${dayFormat.format(endDate)} ${monthFormat.format(endDate)} ${yearFormat.format(endDate)}`;
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
  onRetry,
}: {
  savedSummary: LookBackSummary | null;
  live: { ok: true; summary: LookBackSummary } | { ok: false; error: string } | null;
  onRetry: () => void;
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
        <button type="button" className="review-retry" onClick={onRetry}>
          Try again
        </button>
      </div>
    );
  }
  return <SummaryView summary={live.summary} saved={false} />;
}

function CleanUpBody({
  live,
  isCompleted,
  onRetry,
  onActionDone,
}: {
  live?: { ok: true; summary: CleanUpSummary } | { ok: false; error: string } | null;
  isCompleted: boolean;
  onRetry: () => void;
  onActionDone: () => void;
}) {
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [backlogConfirmIds, setBacklogConfirmIds] = useState<Set<string>>(new Set());
  const [actionError, setActionError] = useState<{ id: string; message: string } | null>(null);
  const [rescheduleId, setRescheduleId] = useState<string | null>(null);
  const [processId, setProcessId] = useState<string | null>(null);
  // null means the picker options have not been fetched yet; an empty list
  // means they were fetched but could not be listed.
  const [projectOptions, setProjectOptions] = useState<
    { id: string; name: string | null }[] | null
  >(null);

  if (!live || !live.ok) {
    return (
      <div className="integration-alert" role="status">
        <span className="alert-symbol" aria-hidden="true">!</span>
        <span>{live && "error" in live ? live.error : "The clean-up queue could not be loaded."}</span>
        <button type="button" className="review-retry" onClick={onRetry}>
          Try again
        </button>
      </div>
    );
  }

  const summary = live.summary;
  const failed = summary.statuses.filter((status) => !status.ok);
  const hygieneFailed = failed.some((status) => status.name === "Notion hygiene");

  const runAction = async (id: string, edits: Record<string, unknown>) => {
    if (pendingIds.has(id)) return;
    // Functional updates: concurrent actions on other rows must not be
    // wiped by this row's finally running with a stale closure.
    setPendingIds((prev) => new Set([...prev, id]));
    setActionError(null);
    try {
      const { updateTask } = await loadAppActions();
      const result = await updateTask(id, edits);
      if (result.ok) {
        setBacklogConfirmIds((prev) => new Set([...prev].filter((x) => x !== id)));
        onActionDone();
      } else {
        setActionError({ id, message: result.error });
      }
    } catch {
      setActionError({ id, message: "The task could not be updated. Try again." });
    } finally {
      setPendingIds((prev) => new Set([...prev].filter((x) => x !== id)));
    }
  };

  const runHygieneAction = async (
    id: string,
    edits: { scheduled?: string; due?: string; project_id?: string | null },
  ) => {
    if (pendingIds.has(id)) return;
    setPendingIds((prev) => new Set([...prev, id]));
    setActionError(null);
    try {
      const { updateTask } = await loadAppActions();
      const result = await updateTask(id, edits);
      if (result.ok) {
        // The dialog's values are saved; the refetch refreshes membership
        // in both queues.
        setProcessId(null);
        onActionDone();
      } else {
        setActionError({ id, message: result.error });
      }
    } catch {
      setActionError({ id, message: "The task could not be updated. Try again." });
    } finally {
      setPendingIds((prev) => new Set([...prev].filter((x) => x !== id)));
    }
  };

  function openProcess(item: HygieneItem) {
    setActionError(null);
    setProcessId(item.id);
    // The picker options load once on first open and stay cached; a failed
    // read degrades to an empty list and the dialog shows its hint.
    if (projectOptions === null) {
      loadProjectsActions()
        .then(({ fetchAssignableProjects }) => fetchAssignableProjects())
        .then((options) => setProjectOptions(options))
        .catch(() => setProjectOptions([]));
    }
  }

  return (
    <div className="review-queue-wrap">
      <p className="review-dates-inline">
        Overdue status as of{" "}
        <time dateTime={summary.local_day}>{formatItemDate(summary.local_day)}</time>
      </p>

      {/* The two queues degrade independently: a failed read shows the
          shared alert while any successfully read rows stay visible. The
          neutral empty state only appears when nothing failed. */}
      {failed.length > 0 && <SourceFailureAlert failed={failed} onRetry={onRetry} />}
      {summary.items.length > 0 ? (
        <ul className="review-queue">
          {summary.items.map((item) => (
            <li key={item.id} className="review-queue-row">
              <div className="review-queue-main">
                <span className="review-queue-name">{item.name}</span>
                {item.project_name && (
                  <span className="review-queue-project">
                    <span>Project</span>
                    <TaskProjectLink
                      projectId={item.project_id}
                      projectName={item.project_name}
                      openInNewTab
                    />
                  </span>
                )}
                <div className="review-queue-meta">
                  {item.overdue && <span className="review-overdue-chip">Overdue</span>}
                  {item.scheduled_in_week && (
                    <span className="review-reason-chip">Scheduled in week</span>
                  )}
                  {item.scheduled && <span>Scheduled {formatItemDate(item.scheduled)}</span>}
                  {item.due && <span>Due {formatItemDate(item.due)}</span>}
                </div>
              </div>
              {!isCompleted && (
                <div className="review-queue-actions">
                  <button
                    type="button"
                    className="review-queue-complete"
                    disabled={pendingIds.has(item.id)}
                    onClick={() => void runAction(item.id, { done: true })}
                  >
                    {pendingIds.has(item.id) ? "Working…" : "Complete"}
                  </button>
                  <button
                    type="button"
                    className="review-queue-reschedule"
                    disabled={pendingIds.has(item.id)}
                    onClick={() => setRescheduleId(item.id)}
                  >
                    Reschedule
                  </button>
                  {backlogConfirmIds.has(item.id) ? (
                    <span className="review-queue-confirm">
                      Clears Scheduled; keeps Due; an overdue task stays overdue.
                      <button
                        type="button"
                        className="review-queue-confirm-yes"
                        disabled={pendingIds.has(item.id)}
                        onClick={() => void runAction(item.id, { scheduled: null })}
                      >
                        Move to backlog
                      </button>
                      <button
                        type="button"
                        className="review-queue-confirm-no"
                        onClick={() => setBacklogConfirmIds(new Set([...backlogConfirmIds].filter((x) => x !== item.id)))}
                      >
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="review-queue-backlog"
                      disabled={pendingIds.has(item.id)}
                      onClick={() => setBacklogConfirmIds(new Set([...backlogConfirmIds, item.id]))}
                    >
                      Move to backlog
                    </button>
                  )}
                </div>
              )}
              {actionError?.id === item.id && (
                <p className="review-action-error" role="alert">
                  {actionError.message}
                </p>
              )}
              {rescheduleId === item.id && (
                <CleanUpRescheduleDialog
                  item={item}
                  pending={pendingIds.has(item.id)}
                  onClose={() => setRescheduleId(null)}
                  onSave={(value) => void runAction(item.id, { scheduled: value || null })}
                />
              )}
            </li>
          ))}
        </ul>
      ) : failed.length === 0 ? (
        <p className="review-queue-empty">Nothing unresolved in the reviewed week.</p>
      ) : null}

      {summary.warnings.length > 0 && (
        <div className="integration-alert" role="status">
          <span className="alert-symbol" aria-hidden="true">!</span>
          <span>{summary.warnings.join(" ")}</span>
        </div>
      )}

      <div className="review-hygiene">
        <h3>System hygiene</h3>
        <p>
          Incomplete tasks with neither a scheduled nor a due date have no time anchor.
          Missing metadata alone is not an error; a standalone task can stay as it is.
        </p>
        {hygieneFailed ? (
          <p className="review-queue-empty">The hygiene queue could not be read.</p>
        ) : summary.hygiene.length === 0 ? (
          <p className="review-queue-empty">No floating tasks right now.</p>
        ) : (
          <ul className="review-queue">
            {summary.hygiene.map((item) => (
              <li key={item.id} className="review-queue-row">
                <div className="review-queue-main">
                  <span className="review-queue-name">{item.name}</span>
                  {item.project_name && (
                    <span className="review-queue-project">
                      <span>Project</span>
                      <TaskProjectLink
                        projectId={item.project_id}
                        projectName={item.project_name}
                        openInNewTab
                      />
                    </span>
                  )}
                  <div className="review-queue-meta">
                    <span className="review-reason-chip">No time anchor</span>
                    <span>No scheduled or due date</span>
                    {/* A set id with no name is an unknown lookup, not a
                        missing project: the row says so instead of implying
                        there is no project. */}
                    {!item.project_name &&
                      (item.project_id ? (
                        <span>Project could not be loaded</span>
                      ) : (
                        <span>No project</span>
                      ))}
                  </div>
                </div>
                {!isCompleted && (
                  <div className="review-queue-actions">
                    <button
                      type="button"
                      className="review-queue-reschedule"
                      disabled={pendingIds.has(item.id)}
                      onClick={() => openProcess(item)}
                    >
                      Process
                    </button>
                  </div>
                )}
                {actionError?.id === item.id && (
                  <p className="review-action-error" role="alert">
                    {actionError.message}
                  </p>
                )}
                {processId === item.id && (
                  <HygieneProcessDialog
                    item={item}
                    projectOptions={projectOptions}
                    pending={pendingIds.has(item.id)}
                    onClose={() => setProcessId(null)}
                    onSave={(edits) => void runHygieneAction(item.id, edits)}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function DirectionBody({
  live,
  isCompleted,
  onRetry,
  onActionDone,
}: {
  live?: { ok: true; summary: DirectionSummary } | { ok: false; error: string } | null;
  isCompleted: boolean;
  onRetry: () => void;
  onActionDone: () => void;
}) {
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [completeConfirmIds, setCompleteConfirmIds] = useState<Set<string>>(new Set());
  const [actionError, setActionError] = useState<{ id: string; message: string } | null>(null);
  const [addProjectId, setAddProjectId] = useState<string | null>(null);
  const [addGoalOpen, setAddGoalOpen] = useState(false);
  const [addGoalPending, setAddGoalPending] = useState(false);
  const [addGoalError, setAddGoalError] = useState<string | null>(null);
  // Guards against a duplicate create before state updates land.
  const addGoalInFlight = useRef(false);

  if (!live || !live.ok) {
    if (!live) {
      // Nothing was fetched (completed review): neutral note, not an error.
      return (
        <p className="review-completed-note">
          The live direction context is unavailable for completed reviews; the
          review retains its answers.
        </p>
      );
    }
    return (
      <div className="integration-alert" role="status">
        <span className="alert-symbol" aria-hidden="true">!</span>
        <span>{live.error}</span>
        <button type="button" className="review-retry" onClick={onRetry}>
          Try again
        </button>
      </div>
    );
  }

  const summary = live.summary;
  const failed = summary.statuses.filter((status) => !status.ok);

  const runGoalAction = async (goal: DirectionGoal) => {
    if (pendingIds.has(goal.id)) return;
    // Functional updates: concurrent actions on other rows must not be
    // wiped by this row's finally running with a stale closure.
    setPendingIds((prev) => new Set([...prev, goal.id]));
    setActionError(null);
    try {
      const { completeGoal } = await import("../../goal-actions");
      const result = await completeGoal(goal.id);
      if (result.ok) {
        setCompleteConfirmIds((prev) => new Set([...prev].filter((x) => x !== goal.id)));
        onActionDone();
      } else {
        setActionError({ id: goal.id, message: result.error });
      }
    } catch {
      setActionError({ id: goal.id, message: "The goal could not be completed. Try again." });
    } finally {
      setPendingIds((prev) => new Set([...prev].filter((x) => x !== goal.id)));
    }
  };

  return (
    <div className="review-queue-wrap">
      {failed.length > 0 ? (
        <SourceFailureAlert failed={failed} onRetry={onRetry} />
      ) : summary.items.length === 0 ? (
        <p className="review-queue-empty">No active goals right now.</p>
      ) : (
        <ul className="review-queue">
          {summary.items.map((goal) => (
            <li key={goal.id} className="review-queue-row">
              <div className="review-queue-main">
                <span className="review-queue-name">
                  <a
                    className="review-queue-name"
                    href={`/goals/${goal.id}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {goal.name || "Untitled goal"}
                  </a>
                </span>
                {goal.projects.length > 0 && (
                  <span className="review-queue-project">
                    <span>Projects</span>
                    {goal.projects.map((project, index) => (
                      <span key={project.id}>
                        <TaskProjectLink
                          projectId={project.id}
                          projectName={project.name || "Untitled project"}
                          openInNewTab
                        />
                        {index < goal.projects.length - 1 ? ", " : ""}
                      </span>
                    ))}
                  </span>
                )}
                <div className="review-queue-meta">
                  {goal.status_available && goal.status && (
                    <span className="review-reason-chip">{goal.status}</span>
                  )}
                </div>
              </div>
              {!isCompleted && (
                <div className="review-queue-actions">
                  {goal.status !== "Done" && (
                    <>
                      <button
                        type="button"
                        className="review-queue-complete"
                        disabled={pendingIds.has(goal.id)}
                        onClick={() => setCompleteConfirmIds(new Set([...completeConfirmIds, goal.id]))}
                      >
                        Complete Goal
                      </button>
                      {completeConfirmIds.has(goal.id) && (
                        <span className="review-queue-confirm" role="alertdialog" aria-label="Confirm completion">
                          Sets the goal&apos;s status to Done; projects and tasks are unchanged.
                          <button
                            type="button"
                            className="review-queue-confirm-yes"
                            disabled={pendingIds.has(goal.id)}
                            onClick={() => void runGoalAction(goal)}
                          >
                            {pendingIds.has(goal.id) ? "Working…" : "Complete goal"}
                          </button>
                          <button
                            type="button"
                            className="review-queue-confirm-no"
                            onClick={() => setCompleteConfirmIds(new Set([...completeConfirmIds].filter((x) => x !== goal.id)))}
                          >
                            Cancel
                          </button>
                        </span>
                      )}
                      <button
                        type="button"
                        className="entity-action-button"
                        disabled={pendingIds.has(goal.id)}
                        onClick={() => setAddProjectId(goal.id)}
                      >
                        Add Project
                      </button>
                    </>
                  )}
                </div>
              )}
              {actionError?.id === goal.id && (
                <p className="review-action-error" role="alert">
                  {actionError.message}
                </p>
              )}
              {addProjectId === goal.id && (
                <AddProjectDialog
                  goalId={goal.id}
                  goalName={goal.name || "Untitled goal"}
                  onClose={() => setAddProjectId(null)}
                  onSaved={() => {
                    setAddProjectId(null);
                    onActionDone();
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      {summary.warnings.length > 0 && (
        <div className="integration-alert" role="status">
          <span className="alert-symbol" aria-hidden="true">!</span>
          <span>{summary.warnings.join(" ")}</span>
        </div>
      )}

      {!isCompleted && (
        <div className="review-hygiene">
          <p className="review-prompt">
            Has anything changed? Is your direction still right?
          </p>
          <button
            type="button"
            className="entity-action-button"
            disabled={addGoalPending}
            onClick={() => setAddGoalOpen(true)}
          >
            Add Goal
          </button>
          {!addGoalOpen && addGoalError && (
            <p className="review-action-error" role="alert">
              {addGoalError}
            </p>
          )}
        </div>
      )}

      {addGoalOpen && (
        <AddGoalDialog
          pending={addGoalPending}
          error={addGoalError}
          onClose={() => {
            setAddGoalOpen(false);
            setAddGoalError(null);
          }}
          onSave={(values) => {
            if (addGoalInFlight.current) return;
            addGoalInFlight.current = true;
            setAddGoalPending(true);
            setAddGoalError(null);
            void (async () => {
              try {
                const { createGoal } = await import("../../goal-actions");
                const edits: { name: string; status?: string; target_date?: string | null } = {
                  name: values.name,
                };
                if (values.status !== "Not Started") edits.status = values.status;
                if (values.target_date) edits.target_date = values.target_date;
                const result = await createGoal(edits);
                if (result.ok) {
                  setAddGoalOpen(false);
                  onActionDone();
                } else {
                  setAddGoalError(result.error);
                }
              } catch {
                setAddGoalError("The goal could not be created. Try again.");
              } finally {
                addGoalInFlight.current = false;
                setAddGoalPending(false);
              }
            })();
          }}
        />
      )}
    </div>
  );
}

function AddProjectDialog({
  goalId,
  goalName,
  onClose,
  onSaved,
}: {
  goalId: string;
  goalName: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Guards against a duplicate create before state updates land.
  const inFlight = useRef(false);

  return (
    <ProjectForm
      heading="Add project"
      kicker="ADD PROJECT"
      lockedGoal={{ id: goalId, name: goalName }}
      pending={pending}
      error={error}
      onSave={(values) => {
        if (inFlight.current) return;
        inFlight.current = true;
        setPending(true);
        setError(null);
        void (async () => {
          try {
            const { createProject } = await import("../../projects-actions");
            const edits: { name: string; status: string; goal_id?: string; deadline?: string | null } = {
              name: values.name,
              status: values.status,
            };
            if (values.goal_id) edits.goal_id = values.goal_id;
            if (values.deadline) edits.deadline = values.deadline;
            const result = await createProject(edits);
            if (result.ok) {
              // The page was created even when the goal-side link failed;
              // close, but surface the partial failure instead of assuming
              // the row will show the new project.
              onSaved();
              if (result.goalLinkError) {
                setError(
                  "The project was created but linking it to this goal failed. " +
                    "Link it from the project page later.",
                );
              }
            } else {
              // Failed create: keep the dialog open; the form retains the
              // entered fields for retry.
              setError(result.error);
            }
          } catch {
            setError("The project could not be created. Try again.");
          } finally {
            inFlight.current = false;
            setPending(false);
          }
        })();
      }}
      onClose={onClose}
    />
  );
}

function AddGoalDialog({
  pending,
  error,
  onClose,
  onSave,
}: {
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (values: { name: string; status: string; target_date: string | null }) => void;
}) {
  return (
    <GoalForm
      heading="Add goal"
      kicker="ADD GOAL"
      pending={pending}
      error={error}
      onSave={(values) => onSave(values)}
      onClose={onClose}
    />
  );
}

/** Shared degraded-source banner: names the failed sources and offers the
 * in-place retry; the queue or timeline below it is unaffected. */
function SourceFailureAlert({
  failed,
  onRetry,
}: {
  failed: { name: string; error: string | null }[];
  onRetry: () => void;
}) {
  return (
    <div className="integration-alert" role="status">
      <span className="alert-symbol" aria-hidden="true">!</span>
      <span>
        {failed.map((status) => status.name).join(" and ")}{" "}
        {failed.length === 1 ? "is" : "are"} unavailable. Some information may be
        missing.
      </span>
      <button type="button" className="review-retry" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}

function CleanUpRescheduleDialog({
  item,
  pending,
  onClose,
  onSave,
}: {
  item: { scheduled: string | null; due: string | null };
  pending: boolean;
  onClose: () => void;
  onSave: (value: string) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const initial = item.scheduled?.slice(0, 10) ?? "";
  const [value, setValue] = useState(initial);
  const hadTime = Boolean(item.scheduled?.includes("T"));

  return (
    <dialog
      ref={dialogRef}
      className="capture-dialog"
      open
      onClose={onClose}
      aria-label="Reschedule task"
    >
      <h3>Reschedule</h3>
      <p className="review-dates-inline">
        Changes only Scheduled. {item.due ? `Due ${formatItemDate(item.due)} is kept.` : "No deadline set."}
      </p>
      <label className="review-field">
        <span>Scheduled</span>
        <input
          type="date"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          disabled={pending}
        />
      </label>
      {hadTime && value !== initial && (
        <p className="review-action-error" role="status">
          The current schedule has a time; saving replaces it with an all-day date.
        </p>
      )}
      <div className="review-queue-actions">
        <button type="button" className="review-queue-complete" disabled={pending} onClick={() => onSave(value)}>
          {pending ? "Saving…" : "Save"}
        </button>
        <button type="button" className="review-queue-confirm-no" onClick={onClose}>
          Cancel
        </button>
      </div>
    </dialog>
  );
}

/** The hygiene row's contextual assignment: Scheduled, Due, and Project in
 * one dialog with an explicit save. Only changed fields are written, so the
 * PATCH preserves every other Notion property; a no-change save closes
 * without a write. */
function HygieneProcessDialog({
  item,
  projectOptions,
  pending,
  onClose,
  onSave,
}: {
  item: HygieneItem;
  projectOptions: { id: string; name: string | null }[] | null;
  pending: boolean;
  onClose: () => void;
  onSave: (edits: {
    scheduled?: string;
    due?: string;
    project_id?: string | null;
  }) => void;
}) {
  // The predicate guarantees both dates are empty, so they seed empty.
  const [scheduled, setScheduled] = useState("");
  const [due, setDue] = useState("");
  const [projectId, setProjectId] = useState(item.project_id ?? "");

  // The seed project stays selectable even when the options read failed or
  // the project is not Active/Planned (the ProjectForm precedent).
  const options = [...(projectOptions ?? [])];
  if (item.project_id && !options.some((option) => option.id === item.project_id)) {
    options.unshift({ id: item.project_id, name: item.project_name });
  }

  function save() {
    const edits: { scheduled?: string; due?: string; project_id?: string | null } = {};
    if (scheduled) edits.scheduled = scheduled;
    if (due) edits.due = due;
    if (projectId !== (item.project_id ?? "")) edits.project_id = projectId || null;
    if (edits.scheduled === undefined && edits.due === undefined && edits.project_id === undefined) {
      onClose();
      return;
    }
    onSave(edits);
  }

  return (
    <dialog className="capture-dialog" open onClose={onClose} aria-label="Process task">
      <h3>Process task</h3>
      <p className="review-dates-inline">
        {item.name} has no scheduled or due date. Fields left empty stay as they are.
      </p>
      <label className="review-field">
        <span>Scheduled</span>
        <input
          type="date"
          value={scheduled}
          onChange={(event) => setScheduled(event.target.value)}
          disabled={pending}
        />
      </label>
      <label className="review-field">
        <span>Due</span>
        <input
          type="date"
          value={due}
          onChange={(event) => setDue(event.target.value)}
          disabled={pending}
        />
      </label>
      <label className="review-field">
        <span>Project</span>
        <select
          className="capture-name task-edit-name"
          value={projectId}
          onChange={(event) => setProjectId(event.target.value)}
          disabled={pending || projectOptions === null}
        >
          <option value="">No project</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name ?? option.id}
            </option>
          ))}
        </select>
      </label>
      {projectOptions === null ? (
        <p className="capture-hint">Loading projects…</p>
      ) : options.length === 0 ? (
        <p className="capture-hint">
          Assignable projects could not be listed; the link can be set later.
        </p>
      ) : null}
      <div className="review-queue-actions">
        <button type="button" className="review-queue-complete" disabled={pending} onClick={save}>
          {pending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          className="review-queue-confirm-no"
          disabled={pending}
          onClick={onClose}
        >
          Cancel
        </button>
      </div>
    </dialog>
  );
}

/** Zurich wall-clock event label; all-day and continuation rows carry their
 * own chips, so this only describes the time bounds. */
function aheadEventMeta(item: AheadItem): string {
  if (item.all_day) return "All day";
  if (!item.start) return "";
  if (item.continues) {
    // The start belongs to an earlier day, so a range would read as a
    // same-day time that is wrong here; the Ongoing chip carries the
    // meaning and only the remaining time is labeled.
    if (!item.end) return "";
    return item.end.slice(0, 10) === item.day
      ? `until ${aheadTimeFormatter.format(new Date(item.end))}`
      : `until ${formatItemDate(item.end)}`;
  }
  const start = aheadTimeFormatter.format(new Date(item.start));
  if (!item.end) return start;
  if (item.end.slice(0, 10) === item.day) {
    return `${start}–${aheadTimeFormatter.format(new Date(item.end))}`;
  }
  return `${start} · until ${formatItemDate(item.end)}`;
}

function AheadBody({
  live,
  isCompleted,
  onRetry,
  onActionDone,
}: {
  live?: { ok: true; summary: AheadSummary } | { ok: false; error: string } | null;
  isCompleted: boolean;
  onRetry: () => void;
  onActionDone: () => void;
}) {
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [actionError, setActionError] = useState<{ id: string; message: string } | null>(null);
  const [reschedule, setReschedule] = useState<{
    id: string;
    scheduled: string | null;
    due: string | null;
  } | null>(null);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureName, setCaptureName] = useState("");
  const [captureScheduled, setCaptureScheduled] = useState("");
  const [captureDue, setCaptureDue] = useState("");
  const [capturePending, setCapturePending] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);

  if (!live) {
    // Nothing was fetched (completed review): neutral note, not an error.
    return (
      <p className="review-completed-note">
        The live ahead timeline is unavailable for completed reviews; the
        review retains its answers.
      </p>
    );
  }
  if (!live.ok) {
    return (
      <div className="integration-alert" role="status">
        <span className="alert-symbol" aria-hidden="true">!</span>
        <span>{live.error}</span>
        <button type="button" className="review-retry" onClick={onRetry}>
          Try again
        </button>
      </div>
    );
  }

  const summary = live.summary;
  const failed = summary.statuses.filter((status) => !status.ok);
  // Exceptions come from the task read, so their absence is only known-empty
  // when that read succeeded.
  const notionFailed = failed.some((status) => status.name === "Notion");

  const runAction = async (id: string, edits: Record<string, unknown>) => {
    if (pendingIds.has(id)) return;
    // Functional updates: concurrent actions on other rows must not be
    // wiped by this row's finally running with a stale closure.
    setPendingIds((prev) => new Set([...prev, id]));
    setActionError(null);
    try {
      const { updateTask } = await loadAppActions();
      const result = await updateTask(id, edits);
      if (result.ok) {
        setReschedule((current) => (current && current.id === id ? null : current));
        onActionDone();
      } else {
        setActionError({ id, message: result.error });
      }
    } catch {
      setActionError({ id, message: "The task could not be updated. Try again." });
    } finally {
      setPendingIds((prev) => new Set([...prev].filter((x) => x !== id)));
    }
  };

  // Opening the capture seeds Scheduled with the ahead week's first day:
  // a task planned here belongs to the coming week unless changed.
  function openCapture() {
    setCaptureScheduled(summary.ahead_start);
    setCaptureError(null);
    setCaptureOpen(true);
  }

  function closeCapture() {
    if (capturePending) return;
    // Matches the success path: nothing typed into a cancelled capture
    // resurfaces the next time it is opened.
    setCaptureOpen(false);
    setCaptureName("");
    setCaptureDue("");
    setCaptureError(null);
  }

  const submitCapture = async (event: React.FormEvent) => {
    event.preventDefault();
    if (capturePending || !captureName.trim()) return;
    setCapturePending(true);
    setCaptureError(null);
    try {
      const { createTask } = await loadAppActions();
      const result = await createTask(captureName.trim(), captureScheduled || null, captureDue || null);
      if (result.ok) {
        setCaptureOpen(false);
        setCaptureName("");
        setCaptureDue("");
        onActionDone();
      } else {
        setCaptureError(result.error);
      }
    } catch {
      setCaptureError("The task could not be created. Try again.");
    } finally {
      setCapturePending(false);
    }
  };
  const days: { day: string; items: AheadItem[] }[] = [];
  for (const item of summary.items) {
    const current = days[days.length - 1];
    if (current && current.day === item.day) current.items.push(item);
    else days.push({ day: item.day, items: [item] });
  }

  const rescheduleButton = (id: string, scheduled: string | null, due: string | null) => (
    <button
      type="button"
      className="review-queue-reschedule"
      disabled={pendingIds.has(id)}
      onClick={() => setReschedule({ id, scheduled, due })}
    >
      Reschedule
    </button>
  );

  return (
    <div className="review-queue-wrap">
      {!isCompleted && !captureOpen && (
        <button type="button" className="add-task-button" onClick={openCapture}>
          + Add task
        </button>
      )}
      {captureOpen && (
        <form className="ahead-capture" onSubmit={submitCapture} aria-label="Add a task">
          <label className="review-field">
            <span>Task name</span>
            <input
              type="text"
              value={captureName}
              disabled={capturePending}
              placeholder="What needs doing?"
              onChange={(event) => setCaptureName(event.target.value)}
            />
          </label>
          <label className="review-field">
            <span>Scheduled</span>
            <input
              type="date"
              value={captureScheduled}
              disabled={capturePending}
              onChange={(event) => setCaptureScheduled(event.target.value)}
            />
          </label>
          <label className="review-field">
            <span>Due</span>
            <input
              type="date"
              value={captureDue}
              disabled={capturePending}
              onChange={(event) => setCaptureDue(event.target.value)}
            />
          </label>
          <div className="review-queue-actions">
            <button
              type="submit"
              className="review-queue-complete"
              disabled={capturePending || !captureName.trim()}
            >
              {capturePending ? "Adding…" : "Add task"}
            </button>
            <button
              type="button"
              className="review-queue-confirm-no"
              onClick={closeCapture}
              disabled={capturePending}
            >
              Cancel
            </button>
          </div>
          {captureError && (
            <p className="review-action-error" role="alert">
              {captureError}
            </p>
          )}
        </form>
      )}
      {failed.length > 0 ? (
        <SourceFailureAlert failed={failed} onRetry={onRetry} />
      ) : null}
      {failed.length === 0 && days.length === 0 ? (
        <p className="review-queue-empty">
          Nothing scheduled, due, or on the calendar in the week ahead.
        </p>
      ) : (
        days.map((group) => (
          <div key={group.day} className="ahead-day-group">
            <h4 className="ahead-day">
              <time dateTime={group.day}>{formatDay(group.day)}</time>
            </h4>
            <ul className="review-queue">
              {group.items.map((item) => (
                <li key={item.id} className="review-queue-row">
                  <div className="review-queue-main">
                    <span className="review-queue-name">{item.name}</span>
                    {item.project_name && (
                      <span className="review-queue-project">
                        <span>Project</span>
                        <TaskProjectLink
                          projectId={item.project_id}
                          projectName={item.project_name}
                          openInNewTab
                        />
                      </span>
                    )}
                    {item.course_name && (
                      <span className="review-queue-project">
                        <span>Course</span>
                        <span>{item.course_name}</span>
                      </span>
                    )}
                    <div className="review-queue-meta">
                      <span className="review-reason-chip">
                        {item.kind === "scheduled"
                          ? "Scheduled"
                          : item.kind === "due"
                            ? "Due"
                            : item.kind === "event"
                              ? "Event"
                              : "Assessment"}
                      </span>
                      {item.kind === "event" ? (
                        <>
                          {item.continues && (
                            <span className="ahead-ongoing-chip">Ongoing</span>
                          )}
                          <span>{aheadEventMeta(item)}</span>
                        </>
                      ) : item.kind === "scheduled" ? (
                        <>
                          {item.scheduled && <span>{formatItemDate(item.scheduled)}</span>}
                          {item.due && item.due.slice(0, 10) !== item.day && (
                            <span>Due {formatItemDate(item.due)}</span>
                          )}
                        </>
                      ) : item.kind === "due" ? (
                        <>
                          {item.due && <span>{formatItemDate(item.due)}</span>}
                          {item.scheduled && item.scheduled.slice(0, 10) !== item.day && (
                            <span>Scheduled {formatItemDate(item.scheduled)}</span>
                          )}
                        </>
                      ) : (
                        <span>{item.when ? formatItemDate(item.when) : null}</span>
                      )}
                    </div>
                  </div>
                  {!isCompleted && item.task_id && (
                    <div className="review-queue-actions">
                      <button
                        type="button"
                        className="review-queue-complete"
                        disabled={pendingIds.has(item.task_id)}
                        onClick={() => item.task_id && void runAction(item.task_id, { done: true })}
                      >
                        {pendingIds.has(item.task_id) ? "Working…" : "Complete"}
                      </button>
                      {rescheduleButton(item.task_id, item.scheduled, item.due)}
                    </div>
                  )}
                  {item.task_id && actionError?.id === item.task_id && (
                    <p className="review-action-error" role="alert">
                      {actionError.message}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))
      )}

      <div className="review-hygiene">
        <h3>Planning exceptions</h3>
        <p>Deadlines in the ahead week with no scheduled work date.</p>
        {notionFailed ? null : summary.exceptions.length === 0 ? (
          <p className="review-queue-empty">No deadlines without scheduled work.</p>
        ) : (
          <ul className="review-queue">
            {summary.exceptions.map((exception) => (
              <li key={exception.task_id} className="review-queue-row">
                <div className="review-queue-main">
                  <span className="review-queue-name">{exception.name}</span>
                  {exception.project_name && (
                    <span className="review-queue-project">
                      <span>Project</span>
                      <TaskProjectLink
                        projectId={exception.project_id}
                        projectName={exception.project_name}
                        openInNewTab
                      />
                    </span>
                  )}
                  <div className="review-queue-meta">
                    <span className="review-reason-chip">No scheduled date</span>
                    {exception.due && <span>Due {formatItemDate(exception.due)}</span>}
                  </div>
                </div>
                {!isCompleted && (
                  <div className="review-queue-actions">
                    <button
                      type="button"
                      className="review-queue-complete"
                      disabled={pendingIds.has(exception.task_id)}
                      onClick={() => void runAction(exception.task_id, { done: true })}
                    >
                      {pendingIds.has(exception.task_id) ? "Working…" : "Complete"}
                    </button>
                    {rescheduleButton(exception.task_id, null, exception.due)}
                  </div>
                )}
                {actionError?.id === exception.task_id && (
                  <p className="review-action-error" role="alert">
                    {actionError.message}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {summary.warnings.length > 0 && (
        <div className="integration-alert" role="status">
          <span className="alert-symbol" aria-hidden="true">!</span>
          <span>{summary.warnings.join(" ")}</span>
        </div>
      )}

      {reschedule && (
        <CleanUpRescheduleDialog
          item={{ scheduled: reschedule.scheduled, due: reschedule.due }}
          pending={pendingIds.has(reschedule.id)}
          onClose={() => setReschedule(null)}
          onSave={(value) => void runAction(reschedule.id, { scheduled: value || null })}
        />
      )}
    </div>
  );
}

function Donut({ ratio, available }: { ratio: number; available: boolean }) {
  // A small cake diagram: filled arc shows the done share. Unavailable
  // metrics render an empty dashed ring instead of a zero.
  const radius = 15;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(Math.max(ratio, 0), 1);
  return (
    <svg
      className="review-donut"
      viewBox="0 0 36 36"
      role="img"
      aria-hidden="true"
      width={36}
      height={36}
    >
      <circle
        cx="18"
        cy="18"
        r={radius}
        fill="none"
        stroke={available ? "#e1e9e2" : "none"}
        strokeWidth="4"
        strokeDasharray={available ? undefined : "2 3"}
      />
      {available && clamped > 0 && (
        <circle
          cx="18"
          cy="18"
          r={radius}
          fill="none"
          stroke="#5c9a77"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${clamped * circumference} ${circumference}`}
          transform="rotate(-90 18 18)"
          className="review-donut-fill"
        />
      )}
    </svg>
  );
}

// A plain count has no whole to be a share of, so it gets a small tick
// strip instead of a donut.
function EventBars({ count, available }: { count: number | null; available: boolean }) {
  const shown = Math.min(count ?? 0, 12);
  return (
    <svg
      className="review-donut"
      viewBox="0 0 36 36"
      role="img"
      aria-hidden="true"
      width={36}
      height={36}
    >
      {!available ? (
        <line x1="6" y1="18" x2="30" y2="18" stroke="#f0dfbf" strokeWidth="3" strokeDasharray="2 3" />
      ) : (
        Array.from({ length: shown }, (_, index) => (
          <rect
            key={index}
            x={4 + index * 2.6}
            y={24 - (4 + (index % 4) * 3)}
            width="1.8"
            height={4 + (index % 4) * 3}
            rx="0.9"
            fill="#5c9a77"
            className="review-event-tick"
            style={{ animationDelay: `${index * 40}ms` }}
          />
        ))
      )}
      {available && count !== null && count > 12 && (
        <text x="18" y="34" textAnchor="middle" fontSize="7" fill="#7b8b82">
          +{count - 12}
        </text>
      )}
    </svg>
  );
}

function MetricStat({ metric }: { metric: { key: string; label: string; definition: string; available: boolean; count: number | null; total?: number | null } }) {
  const ratio =
    metric.available && metric.count !== null && metric.total ? metric.count / metric.total : 0;
  // hasWhole does not require available: an unavailable whole metric renders
  // the donut's empty dashed ring, not the tick strip's dashed line.
  const hasWhole = metric.total !== null && metric.total !== undefined;
  const countLabel =
    !metric.available || metric.count === null
      ? "N/A"
      : hasWhole
        ? `${metric.count} of ${metric.total}`
        : `${metric.count}`;
  return (
    <div className={`review-metric${metric.available ? "" : " unavailable"}`} title={metric.definition}>
      {hasWhole ? (
        <Donut ratio={ratio} available={metric.available} />
      ) : (
        <EventBars count={metric.available ? metric.count : null} available={metric.available} />
      )}
      <span className="review-metric-text">
        <span className="review-metric-count">{countLabel}</span>
        <span className="review-metric-label">{metric.label}</span>
      </span>
    </div>
  );
}

function SummaryView({ summary, saved }: { summary: LookBackSummary; saved: boolean }) {
  const degraded = summary.metrics.some((metric) => !metric.available);
  return (
    <div className="look-back-summary">
      <div className="review-metrics">
        {summary.metrics.map((metric) => (
          <MetricStat key={metric.key} metric={metric} />
        ))}
      </div>
      <details className="review-task-list">
        <summary>
          Completed work ({summary.completed_tasks.length}) — scheduled in the week and now done
        </summary>
        {summary.completed_tasks.length === 0 ? (
          <p className="review-empty-note">No tasks scheduled in the week are done.</p>
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
          <p className="review-empty-note">No unfinished work scheduled in the week.</p>
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
  cleanUp,
  direction,
  ahead,
}: {
  initialReview: ReviewRecord;
  history: ReviewRecord[];
  historyError?: string | null;
  lookBack?: { ok: true; summary: LookBackSummary } | { ok: false; error: string } | null;
  cleanUp?: { ok: true; summary: CleanUpSummary } | { ok: false; error: string } | null;
  direction?: { ok: true; summary: DirectionSummary } | { ok: false; error: string } | null;
  ahead?: { ok: true; summary: AheadSummary } | { ok: false; error: string } | null;
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

  // The look-back summary is fetched server-side; a client retry re-runs the
  // same server action so a transient failure is recoverable in place.
  const [liveLookBack, setLiveLookBack] = useState(lookBack ?? null);
  const [retryingLookBack, setRetryingLookBack] = useState(false);
  const retryLookBack = useCallback(async () => {
    if (isCompleted || retryingLookBack) return;
    setRetryingLookBack(true);
    try {
      const { fetchLookBack } = await loadReviewActions();
      setLiveLookBack(await fetchLookBack(review.week_start));
    } finally {
      setRetryingLookBack(false);
    }
  }, [isCompleted, retryingLookBack, review.week_start]);

  // The clean-up queue is fetched server-side; a client retry re-runs the
  // same server action so a transient failure is recoverable in place.
  const [liveCleanUp, setLiveCleanUp] = useState(cleanUp ?? null);
  const [retryingCleanUp, setRetryingCleanUp] = useState(false);
  const cleanUpRefreshQueued = useRef(false);
  const retryCleanUp = useCallback(async () => {
    if (retryingCleanUp) {
      // An action finished while a refetch was in flight; remember it so
      // its result is not lost to the in-flight guard.
      cleanUpRefreshQueued.current = true;
      return;
    }
    setRetryingCleanUp(true);
    try {
      const { fetchCleanUp } = await loadReviewActions();
      setLiveCleanUp(await fetchCleanUp(review.week_start));
    } finally {
      setRetryingCleanUp(false);
      if (cleanUpRefreshQueued.current) {
        cleanUpRefreshQueued.current = false;
        void retryCleanUp();
      }
    }
  }, [retryingCleanUp, review.week_start]);

  // The direction summary is fetched server-side; a client retry re-runs
  // the same server action so a transient failure is recoverable in place.
  const [liveDirection, setLiveDirection] = useState(direction ?? null);
  const [retryingDirection, setRetryingDirection] = useState(false);
  const directionRefreshQueued = useRef(false);
  const retryDirection = useCallback(async () => {
    if (retryingDirection) {
      // An action finished while a refetch was in flight; remember it so
      // its result is not lost to the in-flight guard.
      directionRefreshQueued.current = true;
      return;
    }
    setRetryingDirection(true);
    try {
      const { fetchDirection } = await loadReviewActions();
      setLiveDirection(await fetchDirection(review.week_start));
    } finally {
      setRetryingDirection(false);
      if (directionRefreshQueued.current) {
        directionRefreshQueued.current = false;
        void retryDirection();
      }
    }
  }, [retryingDirection, review.week_start]);

  // The ahead timeline is fetched server-side; a client retry re-runs the
  // same server action so a transient failure is recoverable in place.
  const [liveAhead, setLiveAhead] = useState(ahead ?? null);
  const [retryingAhead, setRetryingAhead] = useState(false);
  const aheadRefreshQueued = useRef(false);
  const retryAhead = useCallback(async () => {
    if (retryingAhead) {
      // An action finished while a refetch was in flight; remember it so
      // its result is not lost to the in-flight guard.
      aheadRefreshQueued.current = true;
      return;
    }
    setRetryingAhead(true);
    try {
      const { fetchAhead } = await loadReviewActions();
      setLiveAhead(await fetchAhead(review.week_start));
    } finally {
      setRetryingAhead(false);
      if (aheadRefreshQueued.current) {
        aheadRefreshQueued.current = false;
        void retryAhead();
      }
    }
  }, [retryingAhead, review.week_start]);

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
        const { completeReview, saveReviewDraft } = await loadReviewActions();
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

  const router = useRouter();
  const previousWeekStart = shiftDay(review.week_start, -7);
  const followingWeekStart = shiftDay(review.week_start, 7);

  const switchWeek = (weekStart: string) => {
    // A different query param re-runs the server component; refresh clears
    // the router cache so the switch actually reloads the data.
    router.push(`/review/weekly?week_start=${weekStart}`);
    router.refresh();
  };

  return (
    <div className="dashboard-content">
      <section className="intro" aria-labelledby="review-title">
        <div className="review-title-block">
          <p className="eyebrow"><span className="eyebrow-line" /> WEEKLY REVIEW</p>
          <div className="review-week-nav">
            <button
              type="button"
              className="review-week-step"
              aria-label="Previous week"
              onClick={() => switchWeek(previousWeekStart)}
            >
              ←
            </button>
            <h1 id="review-title" className="week-title">
              {formatDayRange(review.week_start, review.week_end)}
              <span className="title-period">.</span>
            </h1>
            <button
              type="button"
              className="review-week-step"
              aria-label="Next week"
              onClick={() => switchWeek(followingWeekStart)}
            >
              →
            </button>
          </div>
          <p className="intro-copy">
            A guided recalibration of your week. Your progress and answers save as you go.
          </p>
        </div>
        <div className="review-status" aria-label="Review state">
          <span className={`review-state-chip${isCompleted ? " completed" : ""}`}>
            {isCompleted ? "Completed" : "Draft"}
          </span>
          <span className="review-dates">
            <span>Reviewed {formatDayRange(review.week_start, review.week_end)}</span>
            <span>Ahead {formatDayRange(review.ahead_start, review.ahead_end)}</span>
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
          live={liveLookBack}
          onRetry={() => void retryLookBack()}
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
        <CleanUpBody
          live={liveCleanUp}
          isCompleted={isCompleted}
          onRetry={() => void retryCleanUp()}
          onActionDone={() => void retryCleanUp()}
        />
      </ReviewSection>

      <ReviewSection
        section={SECTIONS[2]}
        index={2}
        open={Boolean(openSections.direction)}
        passed={progress.direction}
        onToggle={() => toggleSection("direction")}
        onPass={() => markPassed("direction")}
      >
        <DirectionBody
          live={liveDirection}
          isCompleted={isCompleted}
          onRetry={() => void retryDirection()}
          onActionDone={() => void retryDirection()}
        />
      </ReviewSection>

      <ReviewSection
        section={SECTIONS[3]}
        index={3}
        open={Boolean(openSections.ahead)}
        passed={progress.ahead}
        onToggle={() => toggleSection("ahead")}
        onPass={() => markPassed("ahead")}
      >
        <AheadBody
          live={liveAhead}
          isCompleted={isCompleted}
          onRetry={() => void retryAhead()}
          onActionDone={() => void retryAhead()}
        />
        <p className="review-prompt">
          Next week ({formatDayRange(review.ahead_start, review.ahead_end)}) is paired to the
          reviewed week. Rescheduling changes only Scheduled and keeps Due; new tasks and
          completions write to Notion; the calendar stays read-only.
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
                <span>{formatDayRange(entry.week_start, entry.week_end)}</span>
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
