import Link from "next/link";

import { formatDay, shiftDay } from "./date-utils";

/**
 * Previous/current/next navigation shared by the Today and Weekly headers.
 * Today intercepts clicks for instant client-side updates; Weekly follows
 * the link for a server-rendered navigation. Both keep the URL addressable.
 *
 * onSelect receives a direction rather than a resolved day: the parent
 * reads the current selection at click time, so a second click before
 * React re-renders still steps from the day actually selected.
 */
export function DayControls({
  selectedDay,
  basePath,
  stepDays,
  label,
  currentLabel,
  currentHref,
  onSelect,
}: {
  selectedDay: string;
  basePath: string;
  stepDays: number;
  label: string;
  currentLabel: string;
  currentHref: string;
  onSelect?: (target: "previous" | "current" | "next") => void;
}) {
  const unit = stepDays === 7 ? "week" : "day";
  const previous = shiftDay(selectedDay, -stepDays);
  const next = shiftDay(selectedDay, stepDays);
  return (
    <div className="day-controls" aria-label={label}>
      <Link
        href={`${basePath}?day=${previous}`}
        aria-label={`Previous ${unit}, ${formatDay(previous)}`}
        onClick={onSelect ? (event) => { event.preventDefault(); onSelect("previous"); } : undefined}
      >&larr;</Link>
      <Link
        className="today-link"
        href={currentHref}
        onClick={onSelect ? (event) => { event.preventDefault(); onSelect("current"); } : undefined}
      >{currentLabel}</Link>
      <Link
        href={`${basePath}?day=${next}`}
        aria-label={`Next ${unit}, ${formatDay(next)}`}
        onClick={onSelect ? (event) => { event.preventDefault(); onSelect("next"); } : undefined}
      >&rarr;</Link>
    </div>
  );
}
