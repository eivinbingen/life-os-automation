"use server";

import { fetchEntityDetail, type EntityFetchError } from "./entity-fetch";

export type GoalProject = {
  id: string;
  name: string | null;
};

export type GoalDetail = {
  id: string;
  name: string | null;
  status: string | null;
  status_available: boolean;
  area_id: string | null;
  area_name: string | null;
  target_date: string | null;
  projects: GoalProject[];
  statuses: { name: string; ok: boolean; error: string | null }[];
  warnings: string[];
};

export async function fetchGoalDetail(
  goalId: string,
): Promise<{ ok: true; goal: GoalDetail } | { ok: false; error: EntityFetchError }> {
  const result = await fetchEntityDetail<GoalDetail>(
    `/goals/${encodeURIComponent(goalId)}`,
  );
  if (result.ok) {
    return { ok: true, goal: result.data };
  }
  return result;
}

export type ActiveGoal = { id: string; name: string | null };

/** Active goals for relationship pickers. A failed or unconfigured read
 * returns an empty list: the picker renders with its neutral "not listed"
 * hint instead of blocking the form. */
export async function fetchActiveGoals(): Promise<ActiveGoal[]> {
  const base = process.env.LIFE_OS_API_URL ?? null;
  if (!base) return [];
  try {
    const response = await fetch(`${base}/goals/active`, {
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) return [];
    const data = (await response.json()) as { id?: string; name?: string }[];
    if (!Array.isArray(data)) return [];
    return data
      .filter((goal) => typeof goal.id === "string")
      .map((goal) => ({ id: goal.id as string, name: goal.name ?? null }));
  } catch {
    return [];
  }
}
