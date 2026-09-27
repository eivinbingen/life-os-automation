import { connection } from "next/server";

import { startOfWeek } from "../../date-utils";
import {
  fetchReviewByWeek,
  startReview,
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
    isValidWeek(weekCandidate) ? weekCandidate : previousCompletedWeek(localDay),
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

  return (
    <ReviewBoard
      initialReview={review}
      history={history}
      historyError={historyError}
    />
  );
}

function isValidWeek(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function previousCompletedWeek(localDay: string): string {
  // The previous completed week: Monday of last week. Reviewing on Sunday
  // still targets the current week's Monday unless a week is requested.
  const day = new Date(`${localDay}T12:00:00Z`);
  const back = (day.getUTCDay() + 6) % 7;
  const monday = new Date(day);
  monday.setUTCDate(day.getUTCDate() - back);
  const lastMonday = new Date(monday);
  lastMonday.setUTCDate(monday.getUTCDate() - 7);
  return lastMonday.toISOString().slice(0, 10);
}

function getLocalDay(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Europe/Zurich",
  }).format(new Date());
  return parts;
}

function listCompletedReviews(): Promise<
  { ok: true; reviews: ReviewRecord[] } | { ok: false; error: string }
> {
  return import("./review-actions").then(async ({ fetchCompletedReviews }) =>
    fetchCompletedReviews(),
  );
}
