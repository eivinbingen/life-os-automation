"use client";

import { useTaskCompletion } from "./task-completion";

type TaskCheckboxProps = {
  taskId: string;
  taskName: string;
};

export function TaskCheckbox({ taskId, taskName }: TaskCheckboxProps) {
  const {
    doneById,
    failedIds,
    pendingIds,
    refreshInProgress,
    capturePending,
    setTaskDone,
  } = useTaskCompletion();
  const done = doneById[taskId] ?? false;
  const failed = failedIds.has(taskId);
  const saving = pendingIds.has(taskId);
  const operationsPending = refreshInProgress || capturePending;

  return (
    <input
      aria-label={taskName}
      checked={done}
      className={`task-checkbox${failed ? " task-checkbox-error" : ""}`}
      disabled={saving || operationsPending}
      onChange={(event) => void setTaskDone(taskId, event.target.checked)}
      title={
        failed
          ? "Could not save task"
          : operationsPending
            ? "Wait for the current operation to finish"
            : undefined
      }
      type="checkbox"
    />
  );
}
