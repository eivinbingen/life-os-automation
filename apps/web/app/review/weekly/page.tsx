import { connection } from "next/server";

import { defaultReviewWeek, getLocalDay, startOfWeek } from "../../date-utils";
import {
  fetchAhead,
  fetchCleanUp,
  fetchDirection,
  fetchLookBack,
  fetchReviewByWeek,
  startReview,
  type AheadSummary,
  type CleanUpSummary,
  type DirectionSummary,
  type LookBackSummary,
  type ReviewRecord,
} from "./review-actions";
import { ReviewBoard } from "./review-board";

export const metadata = {
  title: "Weekly Review · Life OS",
};

export default async function WeeklyReviewPage({
  searchParams,
}: PageProps<"/review/weekly">) {
  await connection();
  const requested = (await searchParams).week_start;
  const weekCandidate = typeof requested === "string" ? requested : undefined;
  const localDay = getLocalDay();
  const weekStart = startOfWeek(
    isValidWeek(weekCandidate) ? weekCandidate : defaultReviewWeek(localDay),
  );

  const result = await fetchReviewByWeek(weekStart);
  if (!result.ok) {
    throw new Error(result.error);
  }

  let review: ReviewRecord | null = result.review;
  if (!review) {
    const started = await startReview(weekStart);
    if (!started.ok) {
      throw new Error(started.error);
    }
    review = started.review;
  }

  // History lists completed reviews for other weeks; the current record is
  // rendered by the board itself.
  const historyResult = await listCompletedReviews();
  const history = historyResult.ok
    ? historyResult.reviews.filter((entry) => entry.id !== review.id)
    : [];
  const historyError = historyResult.ok ? null : historyResult.error;

  // A completed record renders its fixed saved summary from the record
  // itself, so live look-back data is only needed for drafts. The four
  // reads share no data; they render in the slowest single fetch's time,
  // not the sum.
  let lookBack: { ok: true; summary: LookBackSummary } | { ok: false; error: string } | null = null;
  let cleanUp: { ok: true; summary: CleanUpSummary } | { ok: false; error: string } | null = null;
  let direction: { ok: true; summary: DirectionSummary } | { ok: false; error: string } | null = null;
  let ahead: { ok: true; summary: AheadSummary } | { ok: false; error: string } | null = null;
  if (review.status !== "completed") {
    [lookBack, cleanUp, direction, ahead] = await Promise.all([
      fetchLookBack(weekStart),
      fetchCleanUp(weekStart),
      fetchDirection(weekStart),
      fetchAhead(weekStart),
    ]);
  }

  // Keyed by record id: navigating to another week re-renders this server
  // component with new props, but without a key the board's useState would
  // keep the previous week's review, header, and textareas.
  return (
    <ReviewBoard
      key={review.id}
      initialReview={review}
      history={history}
      historyError={historyError}
      lookBack={lookBack}
      cleanUp={cleanUp}
      direction={direction}
      ahead={ahead}
    />
  );
}

function isValidWeek(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function listCompletedReviews(): Promise<
  { ok: true; reviews: ReviewRecord[] } | { ok: false; error: string }
> {
  return import("./review-actions").then(async ({ fetchCompletedReviews }) =>
    fetchCompletedReviews(),
  );
}
