"use server";

import { revalidatePath } from "next/cache";

export type SectionProgress = {
  look_back: boolean;
  clean_up: boolean;
  direction: boolean;
  ahead: boolean;
};

export type LookBackMetric = {
  key: string;
  label: string;
  definition: string;
  available: boolean;
  count: number | null;
  total?: number | null;
};

export type LookBackSummary = {
  week_start: string;
  week_end: string;
  timezone: string;
  captured_at: string;
  metrics: LookBackMetric[];
  statuses: { name: string; ok: boolean; error: string | null }[];
  completed_tasks: { id: string; name: string; project_name: string | null }[];
  unfinished_tasks: { id: string; name: string; project_name: string | null }[];
};

export type ReviewRecord = {
  id: string;
  week_start: string;
  week_end: string;
  ahead_start: string;
  ahead_end: string;
  timezone: string;
  status: "draft" | "completed";
  revision: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  section_progress: SectionProgress;
  wins: string;
  reflection: string;
  look_back_summary: LookBackSummary | null;
};

export type ReviewWriteResult =
  | { ok: true; review: ReviewRecord }
  | { ok: false; error: string; conflict?: boolean; current?: ReviewRecord };

function apiUrl(): string | null {
  return process.env.LIFE_OS_API_URL ?? null;
}

export async function fetchReviewByWeek(
  weekStart: string,
): Promise<{ ok: true; review: ReviewRecord | null } | { ok: false; error: string }> {
  const base = apiUrl();
  if (!base) {
    return { ok: false, error: "The connection to the local Life OS service is not configured." };
  }
  try {
    const response = await fetch(`${base}/reviews/weekly?week_start=${encodeURIComponent(weekStart)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      return { ok: false, error: "The Life OS service could not load this review. Please try again." };
    }
    const reviews = (await response.json()) as ReviewRecord[];
    return { ok: true, review: reviews.find((review) => review.week_start === weekStart) ?? null };
  } catch {
    return { ok: false, error: "The Life OS service could not be reached. Check that it is running, then try again." };
  }
}

export async function startReview(weekStart: string): Promise<ReviewWriteResult> {
  const base = apiUrl();
  if (!base) {
    return { ok: false, error: "The connection to the local Life OS service is not configured." };
  }
  try {
    const response = await fetch(`${base}/reviews/weekly?week_start=${encodeURIComponent(weekStart)}`, {
      method: "POST",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      return { ok: false, error: "The Life OS service could not start this review. Please try again." };
    }
    return { ok: true, review: (await response.json()) as ReviewRecord };
  } catch {
    return { ok: false, error: "The Life OS service could not be reached. Check that it is running, then try again." };
  }
}

export async function saveReviewDraft(
  reviewId: string,
  expectedRevision: number,
  edits: { wins?: string; reflection?: string; section_progress?: SectionProgress },
): Promise<ReviewWriteResult> {
  const base = apiUrl();
  if (!base) {
    return { ok: false, error: "The connection to the local Life OS service is not configured." };
  }
  try {
    const response = await fetch(`${base}/reviews/weekly/${encodeURIComponent(reviewId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expected_revision: expectedRevision, ...edits }),
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status === 409) {
      return {
        ok: false,
        conflict: true,
        error: "Another save occurred while you were editing.",
      };
    }
    if (!response.ok) {
      return { ok: false, error: "The review could not be saved. Your edits are kept; please try again." };
    }
    revalidatePath("/review/weekly");
    return { ok: true, review: (await response.json()) as ReviewRecord };
  } catch {
    return { ok: false, error: "The review could not be saved. Your edits are kept; please try again." };
  }
}

export async function completeReview(
  reviewId: string,
  expectedRevision: number,
  operationId: string,
  edits: { wins?: string; reflection?: string; section_progress?: SectionProgress },
): Promise<ReviewWriteResult> {
  const base = apiUrl();
  if (!base) {
    return { ok: false, error: "The connection to the local Life OS service is not configured." };
  }
  try {
    const response = await fetch(
      `${base}/reviews/weekly/${encodeURIComponent(reviewId)}/complete`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expected_revision: expectedRevision, operation_id: operationId, ...edits }),
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (response.status === 409) {
      return {
        ok: false,
        conflict: true,
        error: "Another save occurred while you were completing this review.",
      };
    }
    if (!response.ok) {
      return { ok: false, error: "The review could not be completed. Your edits are kept; please try again." };
    }
    revalidatePath("/review/weekly");
    return { ok: true, review: (await response.json()) as ReviewRecord };
  } catch {
    return { ok: false, error: "The review could not be completed. Your edits are kept; please try again." };
  }
}

export async function fetchCompletedReviews(): Promise<
  { ok: true; reviews: ReviewRecord[] } | { ok: false; error: string }
> {
  const base = apiUrl();
  if (!base) {
    return { ok: false, error: "The connection to the local Life OS service is not configured." };
  }
  try {
    const response = await fetch(`${base}/reviews/weekly`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      return { ok: false, error: "The Life OS service could not load review history. Please try again." };
    }
    const reviews = (await response.json()) as ReviewRecord[];
    return { ok: true, reviews: reviews.filter((review) => review.status === "completed") };
  } catch {
    return { ok: false, error: "The Life OS service could not be reached. Check that it is running, then try again." };
  }
}

export async function fetchLookBack(
  weekStart: string,
): Promise<{ ok: true; summary: LookBackSummary } | { ok: false; error: string }> {
  const base = apiUrl();
  if (!base) {
    return { ok: false, error: "The connection to the local Life OS service is not configured." };
  }
  try {
    const response = await fetch(
      `${base}/reviews/weekly/look-back?week_start=${encodeURIComponent(weekStart)}`,
      {
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!response.ok) {
      return { ok: false, error: "The look-back summary could not be loaded. Please try again." };
    }
    return { ok: true, summary: (await response.json()) as LookBackSummary };
  } catch {
    return {
      ok: false,
      error: "The Life OS service could not be reached. Check that it is running, then try again.",
    };
  }
}

export type CleanUpItem = {
  id: string;
  name: string;
  project_id: string | null;
  project_name: string | null;
  scheduled: string | null;
  due: string | null;
  overdue: boolean;
  scheduled_in_week: boolean;
};

export type CleanUpSummary = {
  week_start: string;
  week_end: string;
  local_day: string;
  timezone: string;
  captured_at: string;
  items: CleanUpItem[];
  statuses: { name: string; ok: boolean; error: string | null }[];
  warnings: string[];
};

export async function fetchCleanUp(
  weekStart: string,
): Promise<{ ok: true; summary: CleanUpSummary } | { ok: false; error: string }> {
  const base = apiUrl();
  if (!base) {
    return { ok: false, error: "The connection to the local Life OS service is not configured." };
  }
  try {
    const response = await fetch(
      `${base}/reviews/weekly/clean-up?week_start=${encodeURIComponent(weekStart)}`,
      {
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!response.ok) {
      return { ok: false, error: "The clean-up queue could not be loaded. Please try again." };
    }
    return { ok: true, summary: (await response.json()) as CleanUpSummary };
  } catch {
    return {
      ok: false,
      error: "The Life OS service could not be reached. Check that it is running, then try again.",
    };
  }
}

export type DirectionGoal = {
  id: string;
  name: string | null;
  status: string | null;
  status_available: boolean;
  projects: { id: string; name: string | null }[];
};

export type DirectionSummary = {
  week_start: string;
  captured_at: string;
  timezone: string;
  items: DirectionGoal[];
  statuses: { name: string; ok: boolean; error: string | null }[];
  warnings: string[];
};

export async function fetchDirection(
  weekStart: string,
): Promise<{ ok: true; summary: DirectionSummary } | { ok: false; error: string }> {
  const base = apiUrl();
  if (!base) {
    return { ok: false, error: "The connection to the local Life OS service is not configured." };
  }
  try {
    const response = await fetch(
      `${base}/reviews/weekly/direction?week_start=${encodeURIComponent(weekStart)}`,
      {
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!response.ok) {
      return { ok: false, error: "The direction summary could not be loaded. Please try again." };
    }
    return { ok: true, summary: (await response.json()) as DirectionSummary };
  } catch {
    return {
      ok: false,
      error: "The Life OS service could not be reached. Check that it is running, then try again.",
    };
  }
}
