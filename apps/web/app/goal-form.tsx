"use client";

import { useEffect, useId, useRef, useState } from "react";

// The finite status options from the inspected Goals schema; the backend
// validates the same set. Kept here because goal-actions.ts is a
// "use server" module, which may only export async functions.
const GOAL_STATUSES = ["Not Started", "Active", "Failed", "Done"] as const;

export type GoalFormValues = {
  name: string;
  status: string;
  target_date: string | null;
};

/**
 * Shared Add Goal / Edit Goal dialog. Fields mirror the editable set the
 * UI can support today: name, status, target date. Area is directly
 * writable in the schema but the app has no areas listing yet, so no area
 * control renders here; area editing returns with the areas slice. Only
 * fields the user deliberately changes are sent on save.
 */
export function GoalForm({
  heading,
  kicker,
  initial,
  pending,
  error,
  onSave,
  onClose,
}: {
  heading: string;
  kicker: string;
  initial?: Partial<GoalFormValues>;
  pending: boolean;
  error: string | null;
  onSave: (values: GoalFormValues, changed: Partial<GoalFormValues>) => void;
  onClose: () => void;
}) {
  const formId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);

  // The form remounts per open, so plain constants capture the seed.
  const seed = initial ?? {};
  const initialName = seed.name ?? "";
  const initialStatus = seed.status ?? "Not Started";
  const initialTarget = seed.target_date?.slice(0, 10) ?? "";

  const [name, setName] = useState(initialName);
  const [status, setStatus] = useState(initialStatus);
  const [targetDate, setTargetDate] = useState(initialTarget);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    return () => dialog.close();
  }, []);

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

    const values: GoalFormValues = {
      name: name.trim(),
      status,
      target_date: targetDate || null,
    };
    // Only fields that actually differ from the seeded values are sent.
    const changed: Partial<GoalFormValues> = {};
    if (values.name !== initialName) changed.name = values.name;
    if (values.status !== initialStatus) changed.status = values.status;
    if (values.target_date !== (initialTarget || null)) {
      changed.target_date = values.target_date;
    }

    onSave(values, changed);
  }

  return (
    <dialog
      ref={dialogRef}
      className="task-edit-dialog"
      aria-labelledby={`${formId}-heading`}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
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
            aria-label="Close goal form"
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
                A goal name is required.
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
              {GOAL_STATUSES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div className="capture-field">
            <label htmlFor={`${formId}-target`}>Target date (optional)</label>
            <div className="capture-date-row">
              <input
                id={`${formId}-target`}
                type="date"
                value={targetDate}
                disabled={pending}
                onChange={(event) => setTargetDate(event.target.value)}
              />
              {targetDate && (
                <button
                  type="button"
                  className="capture-clear"
                  aria-label="Clear target date"
                  onClick={() => setTargetDate("")}
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
    </dialog>
  );
}
