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
