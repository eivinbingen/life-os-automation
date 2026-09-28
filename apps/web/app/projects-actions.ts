"use server";

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

export type ProjectFetchError = {
  kind: "not_found" | "unavailable";
  message: string;
};

function apiUrl(): string | null {
  return process.env.LIFE_OS_API_URL ?? null;
}

export async function fetchProjectDetail(
  projectId: string,
): Promise<{ ok: true; project: ProjectDetail } | { ok: false; error: ProjectFetchError }> {
  const base = apiUrl();
  if (!base) {
    return {
      ok: false,
      error: {
        kind: "unavailable",
        message: "The connection to the local Life OS service is not configured.",
      },
    };
  }
  try {
    const response = await fetch(`${base}/projects/${encodeURIComponent(projectId)}`, {
      cache: "no-store",
      // The read chains several Notion round trips (project page, goal
      // page, paginated tasks); it gets the same 30s budget as the other
      // multi-source reads.
      signal: AbortSignal.timeout(30_000),
    });
    if (response.status === 404) {
      return {
        ok: false,
        error: { kind: "not_found", message: "This project could not be found." },
      };
    }
    if (!response.ok) {
      return {
        ok: false,
        error: { kind: "unavailable", message: "The project could not be loaded. Please try again." },
      };
    }
    return { ok: true, project: (await response.json()) as ProjectDetail };
  } catch {
    return {
      ok: false,
      error: {
        kind: "unavailable",
        message:
          "The Life OS service could not be reached. Check that it is running, then try again.",
      },
    };
  }
}
