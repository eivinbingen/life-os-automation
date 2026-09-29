"use client";

import { useEffect, useId, useRef, useState } from "react";

import { GOAL_STATUSES } from "./goal-actions";

export type GoalFormValues = {
  name: string;
  status: string;
  area_id: string | null;
  target_date: string | null;
};

/**
 * Shared Add Goal / Edit Goal dialog. Fields mirror the verified editable
 * set from the inspected schema: name, status, area, target date. Only
 * fields the user deliberately changes are sent on save.
 */
export function GoalForm({
  heading,
  kicker,
  initial,
  areas,
  pending,
  error,
  onSave,
  onClose,
}: {
  heading: string;
  kicker: string;
  initial?: Partial<GoalFormValues>;
  areas?: { id: string; name: string }[];
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
  const initialArea = seed.area_id ?? "";
  const initialTarget = seed.target_date?.slice(0, 10) ?? "";

  const [name, setName] = useState(initialName);
  const [status, setStatus] = useState(initialStatus);
  const [areaId, setAreaId] = useState(initialArea);
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
      area_id: areaId || null,
      target_date: targetDate || null,
    };
    // Only fields that actually differ from the seeded values are sent.
    const changed: Partial<GoalFormValues> = {};
    if (values.name !== initialName) changed.name = values.name;
    if (values.status !== initialStatus) changed.status = values.status;
    if (values.area_id !== (initialArea || null)) changed.area_id = values.area_id;
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

          {areas && areas.length > 0 && (
            <div className="capture-field">
              <label htmlFor={`${formId}-area`}>Area (optional)</label>
              <select
                id={`${formId}-area`}
                className="capture-name task-edit-name"
                value={areaId}
                disabled={pending}
                onChange={(event) => setAreaId(event.target.value)}
              >
                <option value="">No area</option>
                {areas.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.name}
                  </option>
                ))}
              </select>
            </div>
          )}

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
