"use client";

import { createContext, useContext, useState } from "react";

import { updateTaskDone } from "./actions";

type InitialTask = {
  id: string;
  done: boolean;
};

type TaskCompletionContextValue = {
  doneById: Record<string, boolean>;
  failedIds: Set<string>;
  pendingIds: Set<string>;
  refreshInProgress: boolean;
  capturePending: boolean;
  setTaskDone: (taskId: string, done: boolean) => Promise<void>;
};

const TaskCompletionContext = createContext<TaskCompletionContextValue | null>(
  null,
);

export function TaskCompletionProvider({
  children,
  tasks,
  refreshInProgress = false,
  capturePending = false,
}: {
  children: React.ReactNode;
  tasks: InitialTask[];
  refreshInProgress?: boolean;
  capturePending?: boolean;
}) {
  const [doneById, setDoneById] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(tasks.map((task) => [task.id, task.done])),
  );
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  const [failedIds, setFailedIds] = useState<Set<string>>(() => new Set());

  async function setTaskDone(taskId: string, nextDone: boolean) {
    const previousDone = doneById[taskId] ?? false;

    setDoneById((current) => ({ ...current, [taskId]: nextDone }));
    setPendingIds((current) => new Set(current).add(taskId));
    setFailedIds((current) => {
      const next = new Set(current);
      next.delete(taskId);
      return next;
    });

    try {
      await updateTaskDone(taskId, nextDone);
    } catch {
      setDoneById((current) => ({ ...current, [taskId]: previousDone }));
      setFailedIds((current) => new Set(current).add(taskId));
    } finally {
      setPendingIds((current) => {
        const next = new Set(current);
        next.delete(taskId);
        return next;
      });
    }
  }

  return (
    <TaskCompletionContext.Provider
      value={{
        doneById,
        failedIds,
        pendingIds,
        refreshInProgress,
        capturePending,
        setTaskDone,
      }}
    >
      {children}
    </TaskCompletionContext.Provider>
  );
}

export function useTaskCompletion() {
  const context = useContext(TaskCompletionContext);

  if (!context) {
    throw new Error(
      "Task completion components must be inside TaskCompletionProvider",
    );
  }

  return context;
}

export function OpenTaskCount({ taskIds }: { taskIds: string[] }) {
  const { doneById } = useTaskCompletion();
  const uniqueTaskIds = [...new Set(taskIds)];
  const openCount = uniqueTaskIds.filter((taskId) => !doneById[taskId]).length;

  return <>{openCount}</>;
}
