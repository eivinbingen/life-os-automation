"use server";

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

export type GoalFetchError = {
  kind: "not_found" | "unavailable";
  message: string;
};

function apiUrl(): string | null {
  return process.env.LIFE_OS_API_URL ?? null;
}

export async function fetchGoalDetail(
  goalId: string,
): Promise<{ ok: true; goal: GoalDetail } | { ok: false; error: GoalFetchError }> {
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
    const response = await fetch(`${base}/goals/${encodeURIComponent(goalId)}`, {
      cache: "no-store",
      // The read chains several Notion round trips (goal page, area page,
      // paginated projects query); it gets the same 30s budget as the other
      // multi-source reads.
      signal: AbortSignal.timeout(30_000),
    });
    if (response.status === 404) {
      return {
        ok: false,
        error: { kind: "not_found", message: "This goal could not be found." },
      };
    }
    if (!response.ok) {
      return {
        ok: false,
        error: { kind: "unavailable", message: "The goal could not be loaded. Please try again." },
      };
    }
    return { ok: true, goal: (await response.json()) as GoalDetail };
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
