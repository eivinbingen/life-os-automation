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

export async function refreshToday(day: string): Promise<RefreshResult> {
  const apiUrl = process.env.LIFE_OS_API_URL;

  if (!apiUrl) {
    return { ok: false, error: "LIFE_OS_API_URL is not configured" };
  }

  const response = await fetch(
    `${apiUrl}/today?day=${encodeURIComponent(day)}`,
    { cache: "no-store" },
  );

  if (!response.ok) {
    return { ok: false, error: "Could not load today's data" };
  }

  return { ok: true, today: (await response.json()) as Today };
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
