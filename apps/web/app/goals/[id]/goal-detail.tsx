"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { completeGoal, updateGoal } from "../../goal-actions";
import { GoalForm } from "../../goal-form";
import { createProject } from "../../projects-actions";
import { ProjectForm } from "../../project-form";
import { formatStripDate } from "../../date-utils";
import type { GoalDetail } from "../../goals-actions";
import { TaskProjectLink } from "../../task-project-link";

export function GoalDetailBoard({ goal }: { goal: GoalDetail }) {
  const failed = goal.statuses.filter((status) => !status.ok);
  const sorted = useMemo(
    () =>
      [...goal.projects].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "")),
    [goal.projects],
  );

  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [editPending, setEditPending] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [confirmingComplete, setConfirmingComplete] = useState(false);
  const [completePending, setCompletePending] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);
  // Guards against a duplicate completion write before state updates land.
  const completeInFlight = useRef(false);
  const [addProjectOpen, setAddProjectOpen] = useState(false);
  const [addProjectPending, setAddProjectPending] = useState(false);
  const [addProjectError, setAddProjectError] = useState<string | null>(null);
  const addProjectInFlight = useRef(false);

  async function saveNewProject(
    values: { name: string; status: string; goal_id: string | null; deadline: string | null },
  ) {
    if (addProjectInFlight.current) return;
    addProjectInFlight.current = true;
    setAddProjectPending(true);
    setAddProjectError(null);
    try {
      const edits: {
        name: string;
        status: string;
        goal_id?: string | null;
        deadline?: string | null;
      } = { name: values.name, status: values.status };
      if (values.goal_id) edits.goal_id = values.goal_id;
      if (values.deadline) edits.deadline = values.deadline;
      const result = await createProject(edits);
      if (result.ok) {
        setAddProjectOpen(false);
        // The page exists even when the goal-side link failed; opening it
        // beats inviting a duplicate re-create.
        if (result.goalLinkError) {
          setAddProjectError(
            "The project was created but linking it to this goal failed. " +
              "Link it from the project page later.",
          );
          router.push(`/projects/${result.projectId}`);
        } else {
          router.push(`/projects/${result.projectId}`);
        }
      } else {
        setAddProjectError(result.error);
      }
    } catch {
      setAddProjectError("The project could not be created. Try again.");
    } finally {
      addProjectInFlight.current = false;
      setAddProjectPending(false);
    }
  }

  async function saveEdit(
    _values: { name: string; status: string; target_date: string | null },
    changed: { name?: string; status?: string; target_date?: string | null },
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
      const result = await updateGoal(goal.id, changed);
      if (result.ok) {
        setEditOpen(false);
        router.refresh();
      } else {
        // Failed save: keep the entered edits for retry, show the error.
        setEditError(result.error);
      }
    } catch {
      setEditError("The goal could not be saved. Try again.");
    } finally {
      setEditPending(false);
    }
  }

  async function confirmComplete() {
    if (completeInFlight.current) return;
    completeInFlight.current = true;
    setCompletePending(true);
    setCompleteError(null);
    try {
      const result = await completeGoal(goal.id);
      if (result.ok) {
        setConfirmingComplete(false);
        router.refresh();
      } else {
        setCompleteError(result.error);
      }
    } catch {
      setCompleteError("The goal could not be completed. Try again.");
    } finally {
      completeInFlight.current = false;
      setCompletePending(false);
    }
  }

  return (
    <div className="dashboard-content">
      <section className="intro" aria-labelledby="goal-title">
        <div>
          <p className="eyebrow"><span className="eyebrow-line" /> GOAL</p>
          <h1 id="goal-title" className="week-title">
            {goal.name ?? "Untitled goal"}<span className="title-period">.</span>
          </h1>
          <p className="intro-copy">
            The goal&apos;s intended outcome and the work connected to it, from Notion.
          </p>
        </div>
        <div className="review-section-controls">
          {goal.status !== "Done" && !confirmingComplete && (
            <button
              type="button"
              className="entity-action-button review-queue-complete"
              onClick={() => setConfirmingComplete(true)}
              disabled={completePending}
            >
              Complete goal
            </button>
          )}
          <button
            type="button"
            className="entity-action-button"
            onClick={() => setEditOpen(true)}
            disabled={editPending}
          >
            Edit goal
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
      {goal.warnings.length > 0 && (
        <div className="integration-alert" role="status">
          <span className="alert-symbol" aria-hidden="true">!</span>
          <span>{goal.warnings.join(" ")}</span>
        </div>
      )}

      <div className="overview-strip cols-4" aria-label="Goal at a glance">
        <div className="overview-item">
          <span>Status</span>
          <strong>
            {goal.status_available
              ? goal.status ?? "—"
              : "Unavailable"}
          </strong>
        </div>
        <div className="overview-item">
          <span>Area</span>
          <strong>
            {goal.area_name ?? (goal.area_id ? "Unavailable" : "—")}
          </strong>
        </div>
        <div className="overview-item">
          <span>Target date</span>
          <strong>
            {goal.target_date ? formatStripDate(goal.target_date) : "—"}
          </strong>
        </div>
        <div className="overview-item">
          <span>Projects</span>
          <strong>{goal.projects.length}</strong>
        </div>
      </div>

      {goal.status === "Done" ? (
        <p className="review-completed-note">
          This goal is Done. Its projects and tasks are unchanged.
        </p>
      ) : confirmingComplete ? (
        <div className="review-queue-confirm" role="alertdialog" aria-label="Confirm completion">
          Sets the goal&apos;s status to Done; projects and tasks are unchanged.
          <button
            type="button"
            className="review-queue-confirm-yes"
            disabled={completePending}
            onClick={() => void confirmComplete()}
          >
            {completePending ? "Working…" : "Complete goal"}
          </button>
          <button
            type="button"
            className="review-queue-confirm-no"
            onClick={() => setConfirmingComplete(false)}
          >
            Cancel
          </button>
        </div>
      ) : null}
      {completeError && (
        <p className="review-action-error" role="alert">
          {completeError}
        </p>
      )}

      <section className="panel" aria-labelledby="goal-projects-heading">
        <div className="panel-heading">
          <div>
            <span className="section-kicker">NOTION</span>
            <h2 id="goal-projects-heading">Related projects</h2>
          </div>
          <div className="review-section-controls">
            {goal.status !== "Done" && (
              <button
                type="button"
                className="entity-action-button review-queue-complete"
                onClick={() => setAddProjectOpen(true)}
                disabled={addProjectPending}
              >
                Add project
              </button>
            )}
            <span className="count-badge">{goal.projects.length}</span>
          </div>
        </div>
        {goal.projects.length === 0 ? (
          <p className="review-empty-note">No projects linked to this goal yet.</p>
        ) : (
          <ul className="finance-accounts">
            {sorted.map((project) => (
              <li className="finance-account" key={project.id}>
                <span className="finance-account-name">
                  <TaskProjectLink
                    projectId={project.id}
                    projectName={project.name ?? "Untitled project"}
                  />
                </span>
              </li>
            ))}
          </ul>
        )}
        {addProjectError && (
          <p className="review-action-error" role="alert">
            {addProjectError}
          </p>
        )}
      </section>

      {editOpen && (
        <GoalForm
          heading="Edit goal"
          kicker="EDIT GOAL"
          initial={{
            name: goal.name ?? "",
            status: goal.status ?? "Not Started",
            target_date: goal.target_date,
          }}
          pending={editPending}
          error={editError}
          onSave={(values, changed) => void saveEdit(values, changed)}
          onClose={() => setEditOpen(false)}
        />
      )}

      {addProjectOpen && (
        <ProjectForm
          heading="Add project"
          kicker="ADD PROJECT"
          initial={undefined}
          lockedGoal={{ id: goal.id, name: goal.name }}
          pending={addProjectPending}
          error={addProjectError}
          onSave={(values) => void saveNewProject(values)}
          onClose={() => {
            setAddProjectOpen(false);
            setAddProjectError(null);
          }}
        />
      )}

      <footer className="dashboard-footer">
        <span>Life OS <span className="footer-separator">/</span> Goal</span>
        <span className="footer-status"><span className="footer-status-dot" />Goal workspace</span>
      </footer>
    </div>
  );
}
