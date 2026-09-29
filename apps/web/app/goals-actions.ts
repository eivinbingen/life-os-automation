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
