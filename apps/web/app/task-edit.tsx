"use client";

import { useEffect, useId, useRef, useState } from "react";

import type { Task } from "./actions";
import { updateTask } from "./actions";
import { useDashboardOperations } from "./dashboard";
import { useTaskCompletion } from "./task-completion";

export function TaskEditPanel({
  task,
  overdue,
  onClose,
}: {
  task: Task;
  overdue: boolean;
  onClose: () => void;
}) {
  const formId = useId();
  // Seeds from the task's current values; only fields the user deliberately
  // changes are sent on save, so untouched dates keep their Notion values
  // (including any time component). The panel remounts per task, so plain
  // constants capture the seed.
  const initialName = task.name;
  const initialScheduled = task.scheduled?.slice(0, 10) ?? "";
  const initialDue = task.due?.slice(0, 10) ?? "";

  const [name, setName] = useState(task.name);
  const [scheduled, setScheduled] = useState(initialScheduled);
  const [due, setDue] = useState(initialDue);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { refresh, isRefreshing, capturePending, setSavedNotice } =
    useDashboardOperations();
  const { pendingIds } = useTaskCompletion();
  // A pending checkbox save on this task must not race the edit save, and a
  // refresh or capture write in flight would make the post-save refresh a
  // no-op, letting its stale response overwrite the dashboard with pre-edit
  // data. Match capture's blocked state.
  const completionPending = pendingIds.has(task.id);
  const blocked = pending || isRefreshing || capturePending || completionPending;
  const nameBlank = name.trim().length === 0;
  const saveDisabled = blocked || nameBlank;

  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  // The existing value has a time (e.g. 2026-09-17T10:30): saving a picked
  // date converts it to date-only. Surface that explicitly, never silently.
  const scheduledHadTime = Boolean(task.scheduled?.includes("T"));
  const dueHadTime = Boolean(task.due?.includes("T"));
  const scheduledChanged = scheduled !== initialScheduled;
  const dueChanged = due !== initialDue;

  function close() {
    if (pending) return;
    // Cancel makes no external write.
    onClose();
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (saveDisabled) return;

    // Build the edits: only fields that actually differ from the seeded
    // values are sent. A timed date being changed converts to date-only,
    // with the warning shown below.
    const edits: Record<string, unknown> = {};
    if (name.trim() !== initialName) edits.name = name.trim();
    if (scheduledChanged) edits.scheduled = scheduled || null;
    if (dueChanged) edits.due = due || null;

    if (Object.keys(edits).length === 0) {
      // Saving without any change is a no-op, not an error: close without
      // an external write.
      onClose();
      return;
    }

    setPending(true);
    setError(null);

    const result = await updateTask(task.id, edits);

    if (result.ok) {
      setSavedNotice(name.trim());
      onClose();
      await refresh();
      setPending(false);
    } else {
      // Failed save: keep the entered edits for retry, show a useful error.
      setError(result.error);
      setPending(false);
    }
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
            <span className="section-kicker">EDIT TASK</span>
            <h2 id={`${formId}-heading`}>Edit task</h2>
          </div>
          <button
            type="button"
            className="capture-close task-edit-close"
            onClick={close}
            aria-label="Close task editor"
            disabled={pending}
          >
            ✕
          </button>
        </div>

        {overdue && (
          <p className="task-edit-overdue" role="status">
            Overdue — its deadline has passed.
          </p>
        )}

        <form onSubmit={save} className="task-edit-form">
          <div className="capture-field">
            <label htmlFor={`${formId}-name`}>Name</label>
            <input
              id={`${formId}-name`}
              className="capture-name task-edit-name"
              type="text"
              value={name}
              disabled={blocked}
              onChange={(event) => setName(event.target.value)}
              required
            />
            {nameBlank && (
              <p className="capture-hint" role="alert">
                A task name is required.
              </p>
            )}
          </div>

          <div className="capture-field">
            <label htmlFor={`${formId}-scheduled`}>Scheduled</label>
            <div className="capture-date-row">
              <input
                id={`${formId}-scheduled`}
                type="date"
                value={scheduled}
                disabled={blocked}
                onChange={(event) => setScheduled(event.target.value)}
              />
              {scheduled && (
                <button
                  type="button"
                  className="capture-clear"
                  aria-label="Clear scheduled date"
                  onClick={() => setScheduled("")}
                  disabled={blocked}
                >
                  Clear
                </button>
              )}
            </div>
            {scheduledHadTime && scheduledChanged && (
              <p className="task-edit-warning">
                Saving replaces {task.scheduled?.slice(11, 16)} — the new date
                has no time.
              </p>
            )}
            <p className="capture-hint">Planned work — optional.</p>
          </div>

          <div className="capture-field">
            <label htmlFor={`${formId}-due`}>Due</label>
            <div className="capture-date-row">
              <input
                id={`${formId}-due`}
                type="date"
                value={due}
                disabled={blocked}
                onChange={(event) => setDue(event.target.value)}
              />
              {due && (
                <button
                  type="button"
                  className="capture-clear"
                  aria-label="Clear due date"
                  onClick={() => setDue("")}
                  disabled={blocked}
                >
                  Clear
                </button>
              )}
            </div>
            {dueHadTime && dueChanged && (
              <p className="task-edit-warning">
                Saving replaces {task.due?.slice(11, 16)} — the new date has no
                time.
              </p>
            )}
            <p className="capture-hint">Deadline — optional.</p>
          </div>

          {error && (
            <p className="capture-error" role="alert">
              {error}
              <button
                type="button"
                className="capture-retry"
                onClick={() => setError(null)}
              >
                Dismiss
              </button>
            </p>
          )}

          <div className="task-edit-actions">
            <button
              type="button"
              className="refresh-retry task-edit-cancel"
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
