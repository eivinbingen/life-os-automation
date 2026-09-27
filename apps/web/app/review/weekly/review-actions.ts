"use server";

import { revalidatePath } from "next/cache";

export type SectionProgress = {
  look_back: boolean;
  clean_up: boolean;
  direction: boolean;
  ahead: boolean;
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
