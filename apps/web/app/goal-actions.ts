"use server";

import { writeJson } from "./entity-write";

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

export async function createGoal(
  edits: GoalEdits,
): Promise<CreateGoalResult> {
  // Only deliberately set keys are sent: the backend preserves every
  // omitted property, and the schema defaults Status to Not Started.
  const body: Record<string, unknown> = { name: edits.name };
  if (edits.status !== undefined) body.status = edits.status;
  if (edits.area_id !== undefined) body.area_id = edits.area_id;
  if (edits.target_date !== undefined) body.target_date = edits.target_date;

  const result = await writeJson("/goals", "POST", body);
  if (!result.ok) return result;
  const created = result.data as { id?: string };
  if (!created.id) {
    return { ok: false, error: "The goal was created but no identifier came back." };
  }
  return { ok: true, goalId: created.id };
}

export async function updateGoal(
  goalId: string,
  edits: GoalEdits,
): Promise<UpdateGoalResult> {
  // Only deliberately edited keys are sent: the backend preserves every
  // omitted property, so untouched fields keep their Notion values.
  const body: Record<string, unknown> = {};
  if (edits.name !== undefined) body.name = edits.name;
  if (edits.status !== undefined) body.status = edits.status;
  if (edits.area_id !== undefined) body.area_id = edits.area_id;
  if (edits.target_date !== undefined) body.target_date = edits.target_date;

  const result = await writeJson(
    `/goals/${encodeURIComponent(goalId)}`,
    "PATCH",
    body,
  );
  if (!result.ok) return result;
  return { ok: true };
}

/** Complete Goal is a status-only edit: projects and tasks are unchanged. */
export async function completeGoal(goalId: string): Promise<UpdateGoalResult> {
  return updateGoal(goalId, { status: "Done" });
}
