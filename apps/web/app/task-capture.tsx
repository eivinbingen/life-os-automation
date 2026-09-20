"use client";

import { useId, useRef, useState } from "react";

import type { CreateTaskResult } from "./actions";
import { createTask } from "./actions";
import { formatDay } from "./date-utils";
import { useDashboardOperations } from "./dashboard";
import { useTaskCompletion } from "./task-completion";

export function TaskCapture({ selectedDay }: { selectedDay: string }) {
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const [scheduled, setScheduled] = useState<string>(selectedDay);
  const [due, setDue] = useState<string>("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameInput = useRef<HTMLInputElement>(null);

  const {
    refresh,
    isRefreshing,
    capturePending,
    setCapturePending,
    setSavedNotice,
  } = useDashboardOperations();
  const { pendingIds } = useTaskCompletion();
  const completionPending = pendingIds.size > 0;
  const blocked = pending || isRefreshing || capturePending || completionPending;
  const nameBlank = name.trim().length === 0;

  function openCapture() {
    setOpen(true);
    // Focus lands on the name input once it is rendered.
    requestAnimationFrame(() => nameInput.current?.focus());
  }

  function closeCapture() {
    if (pending) return;
    setOpen(false);
    setShowDetails(false);
    setError(null);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (blocked || nameBlank) return;

    setPending(true);
    setCapturePending(true);
    setError(null);

    const result: CreateTaskResult = await createTask(
      name.trim(),
      scheduled || null,
      due || null,
    );

    if (result.ok) {
      setSavedNotice(result.name);
      setName("");
      setDue("");
      setShowDetails(false);
      setOpen(false);
      await refresh();
    } else {
      setError(result.error);
    }

    setPending(false);
    setCapturePending(false);
    nameInput.current?.focus();
  }

  if (!open) {
    return (
      <button
        type="button"
        className="add-task-button"
        onClick={openCapture}
        disabled={isRefreshing || capturePending || completionPending}
      >
        + Add task
      </button>
    );
  }

  return (
    <div className="capture-popover" role="group" aria-label="Add a task">
      <form onSubmit={submit} className="capture-form">
        <label htmlFor={`${formId}-name`} className="visually-hidden">
          Task name
        </label>
        <input
          ref={nameInput}
          id={`${formId}-name`}
          className="capture-name"
          type="text"
          placeholder="What needs doing?"
          value={name}
          disabled={blocked}
          onChange={(event) => setName(event.target.value)}
        />
        <button
          type="submit"
          className="capture-submit"
          disabled={blocked || nameBlank}
        >
          {pending ? "Adding…" : "Add"}
        </button>
        <button
          type="button"
          className="capture-close"
          onClick={closeCapture}
          aria-label="Close capture"
          disabled={pending}
        >
          ✕
        </button>
      </form>

      <div className="capture-details-toggle">
        <button
          type="button"
          className="capture-toggle"
          onClick={() => setShowDetails((current) => !current)}
          disabled={pending}
        >
          {showDetails ? "Fewer details" : "More details"}
        </button>
        {!showDetails && (
          <span className="capture-default-date">
            Scheduled for {formatDay(selectedDay)}
          </span>
        )}
      </div>

      {showDetails && (
        <div className="capture-details">
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
                >
                  Clear
                </button>
              )}
            </div>
            <p className="capture-hint">Planned work — defaults to the selected day.</p>
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
                >
                  Clear
                </button>
              )}
            </div>
            <p className="capture-hint">Deadline — optional.</p>
          </div>
        </div>
      )}

      {error && (
        <p className="capture-error" role="alert">
          {error}
          <button
            type="button"
            className="capture-retry"
            onClick={() => {
              setError(null);
              nameInput.current?.focus();
            }}
          >
            Dismiss
          </button>
        </p>
      )}
    </div>
  );
}
