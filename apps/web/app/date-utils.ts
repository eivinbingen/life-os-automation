export const APP_TIME_ZONE = "Europe/Zurich";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function getLocalDay() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: APP_TIME_ZONE,
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));

  return `${values.year}-${values.month}-${values.day}`;
}

export function isValidDay(value: string | null | undefined): value is string {
  if (!value || !DATE_PATTERN.test(value)) return false;

  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function shiftDay(day: string, amount: number) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function startOfWeek(day: string) {
  const date = new Date(`${day}T12:00:00Z`);
  // Sunday is 0; shift back to Monday.
  const back = (date.getUTCDay() + 6) % 7;
  return shiftDay(day, -back);
}

export function defaultReviewWeek(localDay: string) {
  // The review day is Sunday by default, so the current week is the
  // default target then; any other day targets the previous completed week.
  const day = new Date(`${localDay}T12:00:00Z`);
  const back = (day.getUTCDay() + 6) % 7;
  const monday = shiftDay(localDay, -back);
  if (day.getUTCDay() === 0) {
    return monday;
  }
  return shiftDay(monday, -7);
}

export function startOfMonth(day: string) {
  return `${day.slice(0, 7)}-01`;
}

export function shiftMonth(month: string, amount: number) {
  const date = new Date(`${month}T12:00:00Z`);
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + amount);
  return `${date.toISOString().slice(0, 7)}-01`;
}

export function formatMonth(month: string) {
  return new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}T12:00:00Z`));
}

export function dayHeading(day: string, localDay: string) {
  if (day === localDay) return "Today";
  if (day === shiftDay(localDay, -1)) return "Yesterday";
  if (day === shiftDay(localDay, 1)) return "Tomorrow";

  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    timeZone: "UTC",
  }).format(new Date(`${day}T12:00:00Z`));
}

export function formatDay(day: string) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${day}T12:00:00Z`));
}

/** Formats a Notion task date value; a date-time keeps its wall-clock time. */
export function formatItemDate(value: string | null) {
  if (!value) return null;
  const datePart = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return null;
  const formatted = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${datePart}T12:00:00Z`));
  // Notion's date-time value contains the wall-clock time entered for the task.
  return value.includes("T") ? `${formatted} · ${value.slice(11, 16)}` : formatted;
}

/** Compact horizontal date for overview strips, e.g. "19 Oct 2026" — the
 * long weekday format wraps badly in a constrained strip. */
export function formatStripDate(value: string | null) {
  if (!value) return null;
  const datePart = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return null;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${datePart}T12:00:00Z`));
}
