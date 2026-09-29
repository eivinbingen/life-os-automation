"use server";

import { fetchEntityDetail, type EntityFetchError } from "./entity-fetch";

export type ProjectTask = {
  id: string;
  name: string;
  done: boolean;
  scheduled: string | null;
  due: string | null;
  project_id: string | null;
  project_name: string | null;
};

export type ProjectDetail = {
  id: string;
  name: string | null;
  status: string | null;
  status_available: boolean;
  goal_id: string | null;
  goal_name: string | null;
  resolved_goal: string | null;
  deadline: string | null;
  tasks: ProjectTask[];
  statuses: { name: string; ok: boolean; error: string | null }[];
  warnings: string[];
};

export async function fetchProjectDetail(
  projectId: string,
): Promise<{ ok: true; project: ProjectDetail } | { ok: false; error: EntityFetchError }> {
  const result = await fetchEntityDetail<ProjectDetail>(
    `/projects/${encodeURIComponent(projectId)}`,
  );
  if (result.ok) {
    return { ok: true, project: result.data };
  }
  return result;
}
