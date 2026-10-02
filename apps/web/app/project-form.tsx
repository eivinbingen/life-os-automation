"use client";

import { useId, useMemo, useState } from "react";

import { ModalDialog } from "./modal-dialog";

// The finite status options from the inspected Projects schema; the backend
// validates the same set. Kept here because projects-actions.ts is a
// "use server" module, which may only export async functions.
const PROJECT_STATUSES = ["Planned", "Waiting", "Active", "Dropped", "Done"] as const;

export type ProjectFormValues = {
  name: string;
  status: string;
  goal_id: string | null;
  deadline: string | null;
};

export type GoalOption = { id: string; name: string | null };

/** The form values plus the display name of the current goal, used to
 * label the merged-in current-goal option when it is not in the list. */
export type ProjectFormSeed = Partial<ProjectFormValues> & {
  goal_name?: string | null;
};

/**
 * Shared Add Project / Edit Project dialog. Fields mirror the editable set
 * the UI supports: name, status, goal link, deadline. When `lockedGoal` is
 * provided (opened from a goal context) the goal link is prefilled and
 * shown as fixed context — the caller writes that prefill on save. Only
 * fields the user deliberately changes are sent.
 */
export function ProjectForm({
  heading,
  kicker,
  initial,
  goalOptions,
  lockedGoal,
  pending,
  error,
  onSave,
  onClose,
}: {
  heading: string;
  kicker: string;
  initial?: ProjectFormSeed;
  goalOptions?: GoalOption[];
  lockedGoal?: GoalOption | null;
  pending: boolean;
  error: string | null;
  onSave: (values: ProjectFormValues, changed: Partial<ProjectFormValues>) => void;
  onClose: () => void;
}) {
  const formId = useId();

  // The form remounts per open, so plain constants capture the seed.
  const seed = initial ?? {};
  const initialName = seed.name ?? "";
  const initialStatus = seed.status ?? "Planned";
  const initialGoalId = lockedGoal ? lockedGoal.id : seed.goal_id ?? "";
  const initialDeadline = seed.deadline?.slice(0, 10) ?? "";

  // The picker lists active goals; the project's current goal is merged in
  // so an existing link to a non-Active goal (or while the goals read
  // failed) stays visible and selectable instead of showing as "No goal".
  const options: GoalOption[] = useMemo(() => {
    const listed = goalOptions ?? [];
    if (!seed.goal_id) return listed;
    if (listed.some((goal) => goal.id === seed.goal_id)) return listed;
    return [{ id: seed.goal_id, name: seed.goal_name ?? null }, ...listed];
  }, [goalOptions, seed.goal_id, seed.goal_name]);

  const [name, setName] = useState(initialName);
  const [status, setStatus] = useState(initialStatus);
  const [goalId, setGoalId] = useState(initialGoalId);
  const [deadline, setDeadline] = useState(initialDeadline);

  const nameBlank = name.trim().length === 0;
  const saveDisabled = pending || nameBlank;

  function close() {
    if (pending) return;
    // Cancel makes no external write.
    onClose();
  }

  function save(event: React.FormEvent) {
    event.preventDefault();
    if (saveDisabled) return;

    const values: ProjectFormValues = {
      name: name.trim(),
      status,
      goal_id: lockedGoal ? lockedGoal.id : goalId || null,
      deadline: deadline || null,
    };
    // Only fields that actually differ from the seeded values are sent.
    const changed: Partial<ProjectFormValues> = {};
    if (values.name !== initialName) changed.name = values.name;
    if (values.status !== initialStatus) changed.status = values.status;
    if (values.goal_id !== (initialGoalId || null)) changed.goal_id = values.goal_id;
    if (values.deadline !== (initialDeadline || null)) {
      changed.deadline = values.deadline;
    }

    onSave(values, changed);
  }

  return (
    <ModalDialog
      className="task-edit-dialog"
      ariaLabelledBy={`${formId}-heading`}
      onClose={close}
    >
      <div className="task-edit-body">
        <div className="task-edit-heading">
          <div>
            <span className="section-kicker">{kicker}</span>
            <h2 id={`${formId}-heading`}>{heading}</h2>
          </div>
          <button
            type="button"
            className="capture-close task-edit-close"
            onClick={close}
            aria-label="Close project form"
            disabled={pending}
          >
            ✕
          </button>
        </div>

        <form onSubmit={save} className="task-edit-form">
          <div className="capture-field">
            <label htmlFor={`${formId}-name`}>Name</label>
            <input
              id={`${formId}-name`}
              className="capture-name task-edit-name"
              type="text"
              value={name}
              disabled={pending}
              onChange={(event) => setName(event.target.value)}
              required
            />
            {nameBlank && (
              <p className="capture-hint" role="alert">
                A project name is required.
              </p>
            )}
          </div>

          <div className="capture-field">
            <label htmlFor={`${formId}-status`}>Status</label>
            <select
              id={`${formId}-status`}
              className="capture-name task-edit-name"
              value={status}
              disabled={pending}
              onChange={(event) => setStatus(event.target.value)}
            >
              {PROJECT_STATUSES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          {lockedGoal ? (
            <div className="capture-field">
              <span className="capture-hint" aria-live="polite">
                Linked to goal: {lockedGoal.name ?? "Untitled goal"}
              </span>
            </div>
          ) : (
            <div className="capture-field">
              <label htmlFor={`${formId}-goal`}>Goal (optional)</label>
              <select
                id={`${formId}-goal`}
                className="capture-name task-edit-name"
                value={goalId}
                disabled={pending || options.length === 0}
                onChange={(event) => setGoalId(event.target.value)}
              >
                <option value="">No goal</option>
                {options.map((goal) => (
                  <option key={goal.id} value={goal.id}>
                    {goal.name || "Untitled goal"}
                  </option>
                ))}
              </select>
              {options.length === 0 && (
                <p className="capture-hint">
                  Active goals could not be listed; the link can be set later.
                </p>
              )}
            </div>
          )}

          <div className="capture-field">
            <label htmlFor={`${formId}-deadline`}>Deadline (optional)</label>
            <div className="capture-date-row">
              <input
                id={`${formId}-deadline`}
                type="date"
                value={deadline}
                disabled={pending}
                onChange={(event) => setDeadline(event.target.value)}
              />
              {deadline && (
                <button
                  type="button"
                  className="capture-clear"
                  aria-label="Clear deadline"
                  onClick={() => setDeadline("")}
                  disabled={pending}
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {error && (
            <p className="capture-error" role="alert">
              {error}
            </p>
          )}

          <div className="task-edit-actions">
            <button
              type="button"
              className="refresh-button task-edit-cancel"
              onClick={close}
              disabled={pending}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="capture-submit"
              disabled={saveDisabled}
            >
              {pending ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </ModalDialog>
  );
}
