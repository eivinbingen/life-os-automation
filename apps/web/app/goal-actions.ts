"use server";

/** The finite status options from the inspected Goals schema. UI-only:
 * the backend validates the same set. Lives in goal-form.tsx because a
 * "use server" module may only export async functions. */
export type GoalStatus = "Not Started" | "Active" | "Failed" | "Done";

/** The goal fields an edit can deliberately change. */
export type GoalEdits = {
  name?: string;
  status?: string;
  area_id?: string | null;
  target_date?: string | null;
};

export type CreateGoalResult =
  | { ok: true; goalId: string }
  | { ok: false; error: string };

export type UpdateGoalResult =
  | { ok: true }
  | { ok: false; error: string };

function apiUrl(): string | null {
  return process.env.LIFE_OS_API_URL ?? null;
}

async function errorFrom(response: Response, fallback: string): Promise<string> {
  try {
    const payload = (await response.json()) as { detail?: unknown };
    if (typeof payload.detail === "string") return payload.detail;
    // Pydantic wraps validator errors in a structured list; surface the
    // first message instead of the fallback.
    if (Array.isArray(payload.detail)) {
      const first = payload.detail[0] as { msg?: unknown } | undefined;
      if (first && typeof first.msg === "string") return first.msg;
    }
  } catch {
    // Keep the safe fallback when the local API did not return JSON.
  }
  return fallback;
}

export async function createGoal(
  edits: GoalEdits,
): Promise<CreateGoalResult> {
  const base = apiUrl();
  if (!base) {
    return { ok: false, error: "LIFE_OS_API_URL is not configured" };
  }

  // Only deliberately set keys are sent: the backend preserves every
  // omitted property, and the schema defaults Status to Not Started.
  const body: Record<string, unknown> = { name: edits.name };
  if (edits.status !== undefined) body.status = edits.status;
  if (edits.area_id !== undefined) body.area_id = edits.area_id;
  if (edits.target_date !== undefined) body.target_date = edits.target_date;

  try {
    const response = await fetch(`${base}/goals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      return { ok: false, error: await errorFrom(response, "Could not create the goal") };
    }
    const created = (await response.json()) as { id?: string };
    if (!created.id) {
      return { ok: false, error: "The goal was created but no identifier came back." };
    }
    return { ok: true, goalId: created.id };
  } catch {
    return { ok: false, error: "The Life OS service could not be reached" };
  }
}

export async function updateGoal(
  goalId: string,
  edits: GoalEdits,
): Promise<UpdateGoalResult> {
  const base = apiUrl();
  if (!base) {
    return { ok: false, error: "LIFE_OS_API_URL is not configured" };
  }

  // Only deliberately edited keys are sent: the backend preserves every
  // omitted property, so untouched fields keep their Notion values.
  const body: Record<string, unknown> = {};
  if (edits.name !== undefined) body.name = edits.name;
  if (edits.status !== undefined) body.status = edits.status;
  if (edits.area_id !== undefined) body.area_id = edits.area_id;
  if (edits.target_date !== undefined) body.target_date = edits.target_date;

  try {
    const response = await fetch(`${base}/goals/${encodeURIComponent(goalId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      return { ok: false, error: await errorFrom(response, "Could not save the goal") };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "The Life OS service could not be reached" };
  }
}

/** Complete Goal is a status-only edit: projects and tasks are unchanged. */
export async function completeGoal(goalId: string): Promise<UpdateGoalResult> {
  return updateGoal(goalId, { status: "Done" });
}
