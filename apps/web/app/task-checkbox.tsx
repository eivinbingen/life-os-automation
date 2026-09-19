"use client";

import { useTaskCompletion } from "./task-completion";

type TaskCheckboxProps = {
  taskId: string;
  taskName: string;
};

export function TaskCheckbox({ taskId, taskName }: TaskCheckboxProps) {
  const { doneById, failedIds, pendingIds, setTaskDone } =
    useTaskCompletion();
  const done = doneById[taskId] ?? false;
  const failed = failedIds.has(taskId);
  const saving = pendingIds.has(taskId);

  return (
    <input
      aria-label={taskName}
      checked={done}
      className={`task-checkbox${failed ? " task-checkbox-error" : ""}`}
      disabled={saving}
      onChange={(event) => void setTaskDone(taskId, event.target.checked)}
      title={failed ? "Could not save task" : undefined}
      type="checkbox"
    />
  );
}
