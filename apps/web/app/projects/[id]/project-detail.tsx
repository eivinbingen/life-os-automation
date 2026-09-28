"use client";

import { useMemo } from "react";

import {
  OpenTaskCount,
  TaskCompletionProvider,
} from "../../task-completion";
import { TaskCheckbox } from "../../task-checkbox";
import type { ProjectDetail } from "../../projects-actions";

function formatTaskDateTime(value: string | null) {
  if (!value) return null;
  const datePart = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return null;
  const formatted = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${datePart}T12:00:00Z`));
  // Notion's date-time value contains the wall-clock time entered for the task.
  return value.includes("T") ? `${formatted} · ${value.slice(11, 16)}` : formatted;
}

// Compact horizontal date for the overview strip, e.g. "19 Oct 2026" —
// the long weekday format wraps badly in a constrained strip.
function formatStripDate(value: string | null) {
  if (!value) return null;
  const datePart = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return null;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${datePart}T12:00:00Z`));
}

export function ProjectDetailBoard({ project }: { project: ProjectDetail }) {
  const failed = project.statuses.filter((status) => !status.ok);
  const sorted = useMemo(
    () =>
      [...project.tasks].sort((a, b) =>
        (a.scheduled ?? a.due ?? "").localeCompare(b.scheduled ?? b.due ?? ""),
      ),
    [project.tasks],
  );

  return (
    <TaskCompletionProvider tasks={project.tasks}>
      <div className="dashboard-content">
        <section className="intro" aria-labelledby="project-title">
          <div>
            <p className="eyebrow"><span className="eyebrow-line" /> PROJECT</p>
            <h1 id="project-title" className="week-title">
              {project.name ?? "Untitled project"}<span className="title-period">.</span>
            </h1>
            <p className="intro-copy">
              The project&apos;s verified context and open tasks from Notion.
            </p>
          </div>
        </section>

        {failed.length > 0 && (
          <div className="integration-alert" role="status">
            <span className="alert-symbol" aria-hidden="true">!</span>
            <span>
              {failed.map((status) => status.name).join(" and ")}{" "}
              {failed.length === 1 ? "is" : "are"} unavailable. Some information may
              be missing.
            </span>
          </div>
        )}
        {project.warnings.length > 0 && (
          <div className="integration-alert" role="status">
            <span className="alert-symbol" aria-hidden="true">!</span>
            <span>{project.warnings.join(" ")}</span>
          </div>
        )}

        <div className="overview-strip cols-4" aria-label="Project at a glance">
          <div className="overview-item">
            <span>Open tasks</span>
            <strong>
              <OpenTaskCount taskIds={project.tasks.map((task) => task.id)} />
            </strong>
          </div>
          <div className="overview-item">
            <span>Status</span>
            <strong>
              {project.status_available
                ? project.status ?? "—"
                : "Unavailable"}
            </strong>
          </div>
          <div className="overview-item">
            <span>Goal</span>
            <strong>
              {project.goal_name ?? (project.goal_id ? "Unavailable" : "—")}
            </strong>
          </div>
          <div className="overview-item">
            <span>Deadline</span>
            <strong>
              {project.deadline ? formatStripDate(project.deadline) : "—"}
            </strong>
          </div>
        </div>

        <section className="panel" aria-labelledby="project-tasks-heading">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">NOTION</span>
              <h2 id="project-tasks-heading">Open tasks</h2>
            </div>
            <span className="count-badge">{project.tasks.length}</span>
          </div>
          {project.tasks.length === 0 ? (
            <p className="review-empty-note">No open tasks in this project.</p>
          ) : (
            <ul className="task-list">
              {sorted.map((task) => {
                const when = task.scheduled ?? task.due;
                return (
                  <li className="task-row" key={task.id}>
                    <TaskCheckbox taskId={task.id} taskName={task.name} />
                    <div className="task-copy">
                      <span className="task-name">{task.name}</span>
                      {when && (
                        <span className="task-meta">
                          {(task.scheduled ? "Scheduled " : "Due ") + formatTaskDateTime(when)}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <footer className="dashboard-footer">
          <span>Life OS <span className="footer-separator">/</span> Project</span>
          <span className="footer-status"><span className="footer-status-dot" />Read-only workspace</span>
        </footer>
      </div>
    </TaskCompletionProvider>
  );
}
