"use server";

import {
  fetchEntityDetail,
  type EntityFetchError,
} from "./entity-fetch";
import { writeJson } from "./entity-write";

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

export type ProjectEdits = {
  name?: string;
  status?: string;
  goal_id?: string | null;
  previous_goal_id?: string | null;
  deadline?: string | null;
};

/** A successful create always carries the new project id; a
 * goal_link_error means the page exists but the goal-side link failed
 * (the UI opens the project instead of inviting a duplicate re-create). */
export type CreateProjectResult =
  | { ok: true; projectId: string; goalLinkError?: string }
  | { ok: false; error: string };

export type UpdateProjectResult =
  | { ok: true; goalLinkError?: string }
  | { ok: false; error: string };

export async function createProject(
  edits: ProjectEdits,
): Promise<CreateProjectResult> {
  // Only deliberately set keys are sent: the backend preserves every
  // omitted property, and the schema defaults Status to Planned.
  const body: Record<string, unknown> = { name: edits.name };
  if (edits.status !== undefined) body.status = edits.status;
  if (edits.goal_id !== undefined) body.goal_id = edits.goal_id;
  if (edits.deadline !== undefined) body.deadline = edits.deadline;

  const result = await writeJson("/projects", "POST", body);
  if (!result.ok) return result;
  const created = result.data as {
    id?: string;
    goal_link_error?: string;
  };
  if (!created.id) {
    return { ok: false, error: "The project was created but no identifier came back." };
  }
  return {
    ok: true,
    projectId: created.id,
    goalLinkError: created.goal_link_error,
  };
}

export async function updateProject(
  projectId: string,
  edits: ProjectEdits,
): Promise<UpdateProjectResult> {
  // Only deliberately edited keys are sent: the backend preserves every
  // omitted property, so untouched fields keep their Notion values.
  const body: Record<string, unknown> = {};
  if (edits.name !== undefined) body.name = edits.name;
  if (edits.status !== undefined) body.status = edits.status;
  if (edits.goal_id !== undefined) body.goal_id = edits.goal_id;
  if (edits.previous_goal_id !== undefined) {
    body.previous_goal_id = edits.previous_goal_id;
  }
  if (edits.deadline !== undefined) body.deadline = edits.deadline;

  const result = await writeJson(
    `/projects/${encodeURIComponent(projectId)}`,
    "PATCH",
    body,
  );
  if (!result.ok) return result;
  const saved = result.data as { goal_link_error?: string };
  return { ok: true, goalLinkError: saved.goal_link_error };
}

export type AssignableProject = { id: string; name: string | null };

export type AssignableProjectsResult =
  | { ok: true; projects: AssignableProject[] }
  | { ok: false; error: string };

/** Active/Planned projects for the hygiene queue's assignment picker.
 * The envelope keeps a failed or unconfigured read distinct from a
 * genuinely empty list, so the picker never reports a false failure when
 * the user simply has no Active or Planned projects. */
export async function fetchAssignableProjects(): Promise<AssignableProjectsResult> {
  const base = process.env.LIFE_OS_API_URL ?? null;
  if (!base) {
    return {
      ok: false,
      error: "The connection to the local Life OS service is not configured.",
    };
  }
  try {
    const response = await fetch(`${base}/projects/assignable`, {
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      return { ok: false, error: "Assignable projects could not be read." };
    }
    const data = (await response.json()) as { id?: string; name?: string }[];
    if (!Array.isArray(data)) {
      return { ok: false, error: "Assignable projects could not be read." };
    }
    return {
      ok: true,
      projects: data
        .filter((project) => typeof project.id === "string")
        .map((project) => ({ id: project.id as string, name: project.name ?? null })),
    };
  } catch {
    return { ok: false, error: "The Life OS service could not be reached." };
  }
}
