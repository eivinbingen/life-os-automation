import { render, screen, within, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Task, Week } from "../actions";
import { WeeklyBoard } from "./weekly-board";
import WeeklyPage from "./page";
import { refreshWeek } from "../actions";

vi.mock("next/server", () => ({ connection: vi.fn() }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

const task: Task = { id: "one", name: "Task", done: false, scheduled: "2026-09-14", due: "2026-09-13", project_name: null };
const event = { id: "trip", title: "Trip", start: "2026-09-13T00:00:00+02:00", end: "2026-09-16T00:00:00+02:00", all_day: true };
const week: Week = {
  start: "2026-09-14", end: "2026-09-20",
  days: [
    { day: "2026-09-14", events: [event], scheduled_tasks: [task], due_tasks: [task] },
    { day: "2026-09-15", events: [event], scheduled_tasks: [], due_tasks: [] },
  ],
  overdue_tasks: [task], statuses: [],
};

it("counts unique tasks across buckets and events across covered days", () => {
  render(<WeeklyBoard week={week} localDay="2026-09-14" />);
  const summary = screen.getByLabelText("Week at a glance");
  expect(within(summary).getByText("Open tasks").previousElementSibling?.textContent).toBe("1");
  expect(within(summary).getByText("Calendar events").previousElementSibling?.textContent).toBe("1");
});

it("does not present unavailable integration counts as zero", () => {
  render(<WeeklyBoard week={{...week, statuses: [{name: "Notion", ok: false, error: "offline"}]}} localDay="2026-09-14" />);
  expect(within(screen.getByLabelText("Week at a glance")).getByText("Open tasks").previousElementSibling?.textContent).toBe("Unavailable");
});

it.each(["network", "http", "json", "configuration"])("keeps the requested week and retry on %s failure", async (kind) => {
  vi.stubEnv("LIFE_OS_API_URL", kind === "configuration" ? "" : "http://fake.invalid");
  const fetcher = vi.fn();
  if (kind === "network") fetcher.mockRejectedValue(new Error("private details"));
  else fetcher.mockResolvedValue({ok: kind !== "http", json: async () => { throw new Error("bad json"); }});
  vi.stubGlobal("fetch", fetcher);
  render(await WeeklyPage({params: Promise.resolve({}), searchParams: Promise.resolve({day: "2026-09-17"})}));
  const alert = screen.getByRole("alert");
  expect(within(alert).getByRole("link", {name: "Try again"}).getAttribute("href")).toBe("/weekly?day=2026-09-14");
  expect(alert.textContent).not.toContain("private details");
  expect(within(alert).getByText(/Requested week starting/)).toBeTruthy();
  if (kind !== "configuration") expect(fetcher.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
});

it("loads the same week successfully when retried", async () => {
  vi.stubEnv("LIFE_OS_API_URL", "http://fake.invalid");
  const fetcher = vi.fn().mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce({ok: true, json: async () => week});
  vi.stubGlobal("fetch", fetcher);
  expect((await refreshWeek("2026-09-14")).ok).toBe(false);
  render(await WeeklyPage({params: Promise.resolve({}), searchParams: Promise.resolve({day: "2026-09-14"})}));
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.getByLabelText("Week at a glance")).toBeTruthy();
  expect(fetcher.mock.calls.every(([url]) => url.endsWith("day=2026-09-14"))).toBe(true);
});


it("labels a timed event carried into the next day as ongoing", () => {
  const overnight = {...event, all_day: false, start: "2026-09-13T23:00:00+02:00", end: "2026-09-14T02:00:00+02:00"};
  render(<WeeklyBoard week={{...week, days: [{...week.days[0], events: [overnight]}]}} localDay="2026-09-14" />);
  expect(screen.getByText("Ongoing")).toBeTruthy();
  expect(screen.queryByText("23:00")).toBeNull();
});

it("accepts a healthy weekly response after the old three-second cutoff", async () => {
  vi.useFakeTimers();
  vi.stubEnv("LIFE_OS_API_URL", "http://fake.invalid");
  const controllers: AbortController[] = [];
  const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
    const controller = new AbortController();
    controllers.push(controller);
    setTimeout(() => controller.abort(), ms);
    return controller.signal;
  });
  vi.stubGlobal("fetch", vi.fn((_url, {signal}) => new Promise((resolve, reject) => {
    signal.addEventListener("abort", () => reject(new Error("aborted")));
    setTimeout(() => resolve({ok: true, json: async () => week}), 4_000);
  })));
  try {
    const pending = refreshWeek("2026-09-14");
    await vi.advanceTimersByTimeAsync(4_000);
    expect(await pending).toEqual({ok: true, week});
    expect(controllers[0].signal.aborted).toBe(false);
  } finally {
    timeout.mockRestore();
    vi.useRealTimers();
  }
});

it("reports a bounded slow-load timeout distinctly from an unreachable backend", async () => {
  vi.useFakeTimers();
  vi.stubEnv("LIFE_OS_API_URL", "http://fake.invalid");
  const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), ms);
    return controller.signal;
  });
  vi.stubGlobal("fetch", vi.fn((_url, {signal}) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(new Error("aborted")));
  })));
  try {
    const pending = refreshWeek("2026-09-14");
    await vi.advanceTimersByTimeAsync(30_000);
    const result = await pending;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("took too long");
      expect(result.error).not.toContain("could not be reached");
    }
  } finally {
    timeout.mockRestore();
    vi.useRealTimers();
  }
});
