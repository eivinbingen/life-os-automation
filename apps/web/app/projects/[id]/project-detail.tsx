"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { formatItemDate, formatStripDate } from "../../date-utils";
import {
  OpenTaskCount,
  TaskCompletionProvider,
} from "../../task-completion";
import { TaskCheckbox } from "../../task-checkbox";
import { updateProject } from "../../projects-actions";
import { ProjectForm } from "../../project-form";
import type { GoalOption } from "../../project-form";
import type { ProjectDetail } from "../../projects-actions";

export function ProjectDetailBoard({
  project,
  goalOptions,
}: {
  project: ProjectDetail;
  goalOptions: GoalOption[];
}) {
  const failed = project.statuses.filter((status) => !status.ok);
  const sorted = useMemo(
    () =>
      [...project.tasks].sort((a, b) =>
        (a.scheduled ?? a.due ?? "").localeCompare(b.scheduled ?? b.due ?? ""),
      ),
    [project.tasks],
  );

  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [editPending, setEditPending] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  async function saveEdit(
    _values: { name: string; status: string; goal_id: string | null; deadline: string | null },
    changed: { name?: string; status?: string; goal_id?: string | null; deadline?: string | null },
  ) {
    if (editPending) return;
    if (Object.keys(changed).length === 0) {
      // Saving without any change is a no-op, not an error: close without
      // an external write.
      setEditOpen(false);
      return;
    }
    setEditPending(true);
    setEditError(null);
    try {
      const result = await updateProject(project.id, changed);
      if (result.ok) {
        setEditOpen(false);
        router.refresh();
      } else {
        // Failed save: keep the entered edits for retry, show the error.
        setEditError(result.error);
      }
    } catch {
      setEditError("The project could not be saved. Try again.");
    } finally {
      setEditPending(false);
    }
  }

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
          <div className="review-section-controls">
            <button
              type="button"
              className="entity-action-button"
              onClick={() => setEditOpen(true)}
              disabled={editPending}
            >
              Edit project
            </button>
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
              {project.goal_name ? (
                <Link className="task-project-link" href={`/goals/${project.goal_id}`}>
                  {project.goal_name}
                </Link>
              ) : project.goal_id ? (
                "Unavailable"
              ) : (
                project.resolved_goal ?? "—"
              )}
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
                const when = formatItemDate(task.scheduled ?? task.due);
                return (
                  <li className="task-row" key={task.id}>
                    <TaskCheckbox taskId={task.id} taskName={task.name} />
                    <div className="task-copy">
                      <span className="task-name">{task.name}</span>
                      {when && (
                        <span className="task-meta">
                          {(task.scheduled ? "Scheduled " : "Due ") + when}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {editOpen && (
          <ProjectForm
            heading="Edit project"
            kicker="EDIT PROJECT"
            initial={{
              name: project.name ?? "",
              status: project.status ?? "Planned",
              goal_id: project.goal_id,
              deadline: project.deadline,
            }}
            goalOptions={goalOptions}
            pending={editPending}
            error={editError}
            onSave={(values, changed) => void saveEdit(values, changed)}
            onClose={() => setEditOpen(false)}
          />
        )}

        <footer className="dashboard-footer">
          <span>Life OS <span className="footer-separator">/</span> Project</span>
          <span className="footer-status"><span className="footer-status-dot" />Project workspace</span>
        </footer>
      </div>
    </TaskCompletionProvider>
  );
}
