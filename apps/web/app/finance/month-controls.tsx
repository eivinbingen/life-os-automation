import Link from "next/link";

import { formatMonth, shiftMonth } from "../date-utils";

/**
 * Previous/current/next month navigation, following the shared DayControls
 * pattern. Finance navigates server-rendered via links so the URL stays
 * addressable.
 */
export function MonthControls({
  selectedMonth,
  currentMonth,
}: {
  selectedMonth: string;
  currentMonth: string;
}) {
  const previous = shiftMonth(selectedMonth, -1);
  const next = shiftMonth(selectedMonth, 1);
  return (
    <div className="day-controls" aria-label="Choose a month">
      <Link
        href={`/finance?month=${previous}`}
        aria-label={`Previous month, ${formatMonth(previous)}`}
      >&larr;</Link>
      <Link className="today-link" href={`/finance?month=${currentMonth}`}>
        This month
      </Link>
      <Link
        href={`/finance?month=${next}`}
        aria-label={`Next month, ${formatMonth(next)}`}
      >&rarr;</Link>
    </div>
  );
}
