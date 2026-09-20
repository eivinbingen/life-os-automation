"use server";

export type Today = {
  day: string;
  events: CalendarEvent[];
  scheduled_tasks: Task[];
  due_tasks: Task[];
  overdue_tasks: Task[];
  statuses: IntegrationStatus[];
};

export type CalendarEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  all_day: boolean;
};

export type Task = {
  id: string;
  name: string;
  done: boolean;
  scheduled: string | null;
  due: string | null;
  project_name: string | null;
};

export type IntegrationStatus = {
  name: string;
  ok: boolean;
  error: string | null;
};

export type RefreshResult =
  | { ok: true; today: Today }
  | { ok: false; error: string };

export type CreateTaskResult =
  | { ok: true; name: string }
  | { ok: false; error: string };

export async function createTask(
  name: string,
  scheduled: string | null,
  due: string | null,
): Promise<CreateTaskResult> {
  const apiUrl = process.env.LIFE_OS_API_URL;

  if (!apiUrl) {
    return { ok: false, error: "LIFE_OS_API_URL is not configured" };
  }

  const body: Record<string, unknown> = { name };
  if (scheduled) body.scheduled = scheduled;
  if (due) body.due = due;

  try {
    const response = await fetch(`${apiUrl}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(3000),
    });

    if (!response.ok) {
      return { ok: false, error: "Could not save the task" };
    }

    return { ok: true, name };
  } catch {
    return { ok: false, error: "The Life OS service could not be reached" };
  }
}

export async function refreshToday(day: string): Promise<RefreshResult> {
  const apiUrl = process.env.LIFE_OS_API_URL;

  if (!apiUrl) {
    return { ok: false, error: "LIFE_OS_API_URL is not configured" };
  }

  try {
    const response = await fetch(
      `${apiUrl}/today?day=${encodeURIComponent(day)}`,
      {
        cache: "no-store",
        // The dashboard should report a dead backend promptly instead of
        // leaving the user staring at a pending refresh forever.
        signal: AbortSignal.timeout(3000),
      },
    );

    if (!response.ok) {
      return { ok: false, error: "Could not load today's data" };
    }

    return { ok: true, today: (await response.json()) as Today };
  } catch {
    // Connection refused, timeout, or any other network failure: report it
    // as a result instead of throwing out of the server action.
    return { ok: false, error: "The Life OS service could not be reached" };
  }
}

export async function updateTaskDone(taskId: string, done: boolean) {
  const apiUrl = process.env.LIFE_OS_API_URL;

  if (!apiUrl) {
    throw new Error("LIFE_OS_API_URL is not configured");
  }

  const response = await fetch(
    `${apiUrl}/tasks/${encodeURIComponent(taskId)}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ done }),
    }
  );

  if (!response.ok) {
    throw new Error("Could not update task");
  }

  return response.json();
}
