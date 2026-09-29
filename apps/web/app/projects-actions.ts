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

/** The finite status options from the inspected Projects schema. UI-only:
 * the backend validates the same set. Lives in project-form.tsx because a
 * "use server" module may only export async functions. */
export type ProjectStatus =
  | "Planned"
  | "Waiting"
  | "Active"
  | "Dropped"
  | "Done";

export type ProjectEdits = {
  name?: string;
  status?: string;
  goal_id?: string | null;
  deadline?: string | null;
};

export type CreateProjectResult =
  | { ok: true; projectId: string }
  | { ok: false; error: string };

export type UpdateProjectResult =
  | { ok: true }
  | { ok: false; error: string };

export async function createProject(
  edits: ProjectEdits,
): Promise<CreateProjectResult> {
  const base = process.env.LIFE_OS_API_URL ?? null;
  if (!base) {
    return { ok: false, error: "LIFE_OS_API_URL is not configured" };
  }

  // Only deliberately set keys are sent: the backend preserves every
  // omitted property, and the schema defaults Status to Planned.
  const body: Record<string, unknown> = { name: edits.name };
  if (edits.status !== undefined) body.status = edits.status;
  if (edits.goal_id !== undefined) body.goal_id = edits.goal_id;
  if (edits.deadline !== undefined) body.deadline = edits.deadline;

  try {
    const response = await fetch(`${base}/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      return { ok: false, error: await errorFrom(response, "Could not create the project") };
    }
    const created = (await response.json()) as { id?: string };
    if (!created.id) {
      return { ok: false, error: "The project was created but no identifier came back." };
    }
    return { ok: true, projectId: created.id };
  } catch {
    return { ok: false, error: "The Life OS service could not be reached" };
  }
}

export async function updateProject(
  projectId: string,
  edits: ProjectEdits,
): Promise<UpdateProjectResult> {
  const base = process.env.LIFE_OS_API_URL ?? null;
  if (!base) {
    return { ok: false, error: "LIFE_OS_API_URL is not configured" };
  }

  // Only deliberately edited keys are sent: the backend preserves every
  // omitted property, so untouched fields keep their Notion values.
  const body: Record<string, unknown> = {};
  if (edits.name !== undefined) body.name = edits.name;
  if (edits.status !== undefined) body.status = edits.status;
  if (edits.goal_id !== undefined) body.goal_id = edits.goal_id;
  if (edits.deadline !== undefined) body.deadline = edits.deadline;

  try {
    const response = await fetch(`${base}/projects/${encodeURIComponent(projectId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      return { ok: false, error: await errorFrom(response, "Could not save the project") };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "The Life OS service could not be reached" };
  }
}
