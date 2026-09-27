"use server";

export type ScheduleItem = {
  id: string;
  name: string;
  kind: string;
  course_id: string | null;
  course_name: string | null;
  due: string | null;
};

export type StudiesCourse = {
  id: string;
  name: string;
  next_item: ScheduleItem | null;
  upcoming: ScheduleItem[];
};

export type StudiesOverview = {
  courses: StudiesCourse[];
  upcoming: ScheduleItem[];
  statuses: { name: string; ok: boolean; error: string | null }[];
  warnings: string[];
};

function apiUrl(): string | null {
  return process.env.LIFE_OS_API_URL ?? null;
}

export async function fetchStudies(): Promise<
  { ok: true; data: StudiesOverview } | { ok: false; error: string }
> {
  const base = apiUrl();
  if (!base) {
    return { ok: false, error: "The connection to the local Life OS service is not configured." };
  }
  try {
    const response = await fetch(`${base}/studies`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      return { ok: false, error: "The studies overview could not be loaded. Please try again." };
    }
    return { ok: true, data: (await response.json()) as StudiesOverview };
  } catch {
    return {
      ok: false,
      error: "The Life OS service could not be reached. Check that it is running, then try again.",
    };
  }
}
