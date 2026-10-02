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
  project_id: string | null;
  project_name: string | null;
};

export type IntegrationStatus = {
  name: string;
  ok: boolean;
  error: string | null;
};

export type FinanceAccount = {
  name: string;
  balance: number;
  type: string;
};

export type FinanceCategory = {
  label: string;
  forecast: number;
  actual: number;
  difference: number;
};

export type FinanceReview = {
  month: string;
  accounts: FinanceAccount[];
  categories: FinanceCategory[];
  total_forecast: number;
  total_actual: number;
  total_difference: number;
};

export type RefreshResult =
  | { ok: true; today: Today }
  | { ok: false; error: string };

export type RefreshFinanceResult =
  | { ok: true; review: FinanceReview }
  | { ok: false; error: string };

export type CreateTaskResult =
  | { ok: true; name: string }
  | { ok: false; error: string };

export type UpdateTaskResult =
  | { ok: true }
  | { ok: false; error: string };

/** The task fields an edit panel can deliberately change. A project_id
 * of null clears the relation; omitted keys preserve the Notion value. */
export type TaskEdits = {
  name?: string;
  scheduled?: string | null;
  due?: string | null;
  done?: boolean;
  project_id?: string | null;
};

export async function updateTask(
  taskId: string,
  edits: TaskEdits,
): Promise<UpdateTaskResult> {
  const apiUrl = process.env.LIFE_OS_API_URL;

  if (!apiUrl) {
    return { ok: false, error: "LIFE_OS_API_URL is not configured" };
  }

  // Only deliberately edited keys are sent: the backend preserves every
  // omitted property, so untouched dates keep their Notion values.
  const body: Record<string, unknown> = {};
  if (edits.name !== undefined) body.name = edits.name;
  if (edits.scheduled !== undefined) body.scheduled = edits.scheduled;
  if (edits.due !== undefined) body.due = edits.due;
  if (edits.done !== undefined) body.done = edits.done;
  if (edits.project_id !== undefined) body.project_id = edits.project_id;

  try {
    const response = await fetch(`${apiUrl}/tasks/${encodeURIComponent(taskId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      let error = "Could not save the task";
      try {
        const payload = (await response.json()) as { detail?: unknown };
        if (typeof payload.detail === "string") error = payload.detail;
      } catch {
        // Keep the safe fallback when the local API did not return JSON.
      }
      return { ok: false, error };
    }

    return { ok: true };
  } catch {
    return { ok: false, error: "The Life OS service could not be reached" };
  }
}

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
    });

    if (!response.ok) {
      let error = "Could not save the task";
      try {
        const payload = (await response.json()) as { detail?: unknown };
        if (typeof payload.detail === "string") error = payload.detail;
      } catch {
        // Keep the safe fallback when the local API did not return JSON.
      }
      return { ok: false, error };
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
  const result = await updateTask(taskId, { done });

  // The completion flow keeps its throw-based contract until it moves to
  // updateTask's result-based one.
  if (!result.ok) {
    throw new Error(result.error);
  }
  return { ok: true };
}

export async function refreshFinance(month: string): Promise<RefreshFinanceResult> {
  const apiUrl = process.env.LIFE_OS_API_URL;
  if (!apiUrl) {
    return { ok: false, error: "The connection to the local Life OS service is not configured." };
  }

  // A finance read queries YNAB and Google Sheets and can exceed Today's
  // three-second refresh budget.
  const signal = AbortSignal.timeout(30_000);
  let response: Response;
  try {
    response = await fetch(`${apiUrl}/finance?month=${encodeURIComponent(month)}`, {
      cache: "no-store",
      signal,
    });
  } catch {
    return {
      ok: false,
      error: signal.aborted
        ? "Loading the finance review took too long. YNAB or Google Sheets may be slow; please try again."
        : "The local Life OS service could not be reached. Check that it is running, then try again.",
    };
  }
  if (!response.ok) {
    // The API's failure detail already names the unavailable source; surface
    // it instead of hiding the cause behind a generic message.
    let error = "The Life OS service could not load this month's review. Please try again.";
    try {
      const payload = (await response.json()) as { detail?: unknown };
      if (typeof payload.detail === "string") error = payload.detail;
    } catch {
      // Keep the safe fallback when the local API did not return JSON.
    }
    return { ok: false, error };
  }
  try {
    return { ok: true, review: (await response.json()) as FinanceReview };
  } catch {
    return {
      ok: false,
      error: "The Life OS service returned an unreadable response. Please try again.",
    };
  }
}
