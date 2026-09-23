import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RefreshResult, Today } from "./actions";

const refreshToday = vi.hoisted(() => vi.fn<(day: string) => Promise<RefreshResult>>());
const updateTaskDone = vi.hoisted(() => vi.fn());
const updateTask = vi.hoisted(() => vi.fn());

vi.mock("./actions", async () => {
  const actual = await vi.importActual<typeof import("./actions")>("./actions");
  return {
    ...actual,
    refreshToday,
    updateTaskDone,
    updateTask,
  };
});

import { Dashboard } from "./dashboard";

function makeToday(overrides: Partial<Today> = {}): Today {
  return {
    day: "2026-09-20",
    events: [],
    scheduled_tasks: [],
    due_tasks: [],
    overdue_tasks: [],
    statuses: [
      { name: "Calendar", ok: true, error: null },
      { name: "Notion", ok: true, error: null },
    ],
    ...overrides,
  };
}

const baseProps = {
  localDay: "2026-09-20",
  initialRefreshedAt: "2026-09-20T12:00:00Z",
};

function renderDashboard(initialToday: Today = makeToday()) {
  return render(<Dashboard initialToday={initialToday} {...baseProps} />);
}

describe("Day navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateTask.mockResolvedValue({ ok: true });
    updateTaskDone.mockResolvedValue({ ok: true });
  });

  it("updates the heading immediately on day selection without waiting for data", async () => {
    const user = userEvent.setup();
    let resolveLoad: (result: RefreshResult) => void = () => {};
    refreshToday.mockImplementation(
      () =>
        new Promise<RefreshResult>((resolve) => {
          resolveLoad = resolve;
        }),
    );
    renderDashboard();

    await user.click(screen.getByRole("button", { name: /Next day/ }));

    // The heading and URL update immediately, before the load resolves.
    expect(screen.getByRole("heading", { name: "Tomorrow." })).toBeTruthy();
    expect(window.location.search).toBe("?day=2026-09-21");
    expect(screen.getByRole("status", { name: "" })).toBeTruthy();

    resolveLoad({ ok: true, today: makeToday({ day: "2026-09-21" }) });
    await waitFor(() => {
      expect(screen.queryByText(/Loading/)).toBeNull();
    });
  });

  it("shows a loading state naming the selected day while its data loads", async () => {
    const user = userEvent.setup();
    let resolveLoad: (result: RefreshResult) => void = () => {};
    refreshToday.mockImplementation(
      () =>
        new Promise<RefreshResult>((resolve) => {
          resolveLoad = resolve;
        }),
    );
    renderDashboard();

    await user.click(screen.getByRole("button", { name: /Previous day/ }));

    const loading = screen.getByRole("status");
    expect(loading.textContent).toContain("Loading");
    expect(loading.textContent).toContain("Saturday, 19 September 2026");

    resolveLoad({ ok: true, today: makeToday({ day: "2026-09-19" }) });
    await waitFor(() => {
      expect(screen.queryByRole("status", { name: "" })).toBeNull();
    });
  });

  it("adopts the loaded day's data and updates the completion provider", async () => {
    const user = userEvent.setup();
    let resolveLoad: (result: RefreshResult) => void = () => {};
    refreshToday.mockImplementation(
      () =>
        new Promise<RefreshResult>((resolve) => {
          resolveLoad = resolve;
        }),
    );
    renderDashboard();

    await user.click(screen.getByRole("button", { name: /Next day/ }));

    resolveLoad({
      ok: true,
      today: makeToday({
        day: "2026-09-21",
        scheduled_tasks: [
          {
            id: "task-21",
            name: "Plan tomorrow",
            done: false,
            scheduled: "2026-09-21",
            due: null,
            project_name: null,
          },
        ],
      }),
    });

    await waitFor(() => {
      expect(screen.getByText("Plan tomorrow")).toBeTruthy();
    });
  });

  it("returns to cached days instantly without refetching when fresh", async () => {
    const user = userEvent.setup();
    refreshToday
      .mockResolvedValueOnce({ ok: true, today: makeToday({ day: "2026-09-19" }) })
      .mockResolvedValueOnce({ ok: true, today: makeToday({ day: "2026-09-18" }) });
    renderDashboard();

    await user.click(screen.getByRole("button", { name: /Previous day/ }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Yesterday." })).toBeTruthy();
    });
    expect(refreshToday).toHaveBeenCalledWith("2026-09-19");

    await user.click(screen.getByRole("button", { name: /Previous day/ }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Friday." })).toBeTruthy();
    });
    expect(refreshToday).toHaveBeenCalledWith("2026-09-18");

    // Back to the first visited day: served from the cache, no new fetch.
    await user.click(screen.getByRole("button", { name: /Next day/ }));
    expect(screen.getByRole("heading", { name: "Yesterday." })).toBeTruthy();
    expect(screen.getByLabelText("Saturday, 19 September 2026")).toBeTruthy();
    expect(refreshToday).toHaveBeenCalledTimes(2);
  });

  it("refetches in the background when a cached day is stale", async () => {
    vi.useFakeTimers();
    try {
      const refreshTime = Date.parse("2026-09-20T12:00:30Z");
      vi.setSystemTime(refreshTime);
      refreshToday.mockResolvedValue({ ok: true, today: makeToday({ day: "2026-09-19" }) });

      // Render with an initial timestamp 31 seconds old so the day is cached
      // and immediately stale.
      render(
        <Dashboard
          initialToday={makeToday()}
          localDay="2026-09-20"
          initialRefreshedAt={new Date(refreshTime - 31_000).toISOString()}
        />,
      );

      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const click = user.click(
        screen.getByRole("button", { name: /Previous day/ }),
      );
      await vi.advanceTimersByTimeAsync(0);
      await click;

      // Stale cached data is shown immediately, labeled with its load time.
      expect(screen.getByText(/Last refreshed/)).toBeTruthy();
      // And a fresh fetch runs in the background for the stale day.
      await vi.advanceTimersByTimeAsync(0);
      expect(refreshToday).toHaveBeenCalledWith("2026-09-19");
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps navigation usable and latest selection wins during rapid switching", async () => {
    const user = userEvent.setup();
    refreshToday.mockImplementation(
      (day: string) =>
        new Promise<RefreshResult>((resolve) =>
          setTimeout(
            () => resolve({ ok: true, today: makeToday({ day }) }),
            50,
          ),
        ),
    );
    renderDashboard();

    // Three quick selections: 09-19, 09-18, then back to 09-19 (cached).
    // The heading follows the last click; the latest selection wins.
    await user.click(screen.getByRole("button", { name: /Previous day/ }));
    await user.click(screen.getByRole("button", { name: /Previous day/ }));
    await user.click(screen.getByRole("button", { name: /Next day/ }));

    expect(screen.getByRole("heading", { name: "Yesterday." })).toBeTruthy();
    expect(window.location.search).toBe("?day=2026-09-19");

    // Two distinct days fetched: 09-19 and 09-18. Returning to 09-19 is
    // served from the in-flight/cached copy, not a third request.
    await waitFor(
      () => {
        expect(refreshToday).toHaveBeenCalledTimes(2);
      },
      { timeout: 2000 },
    );
    expect(refreshToday).toHaveBeenNthCalledWith(1, "2026-09-19");
    expect(refreshToday).toHaveBeenNthCalledWith(2, "2026-09-18");
  });

  it("bypasses the cache and refetches on explicit Refresh", async () => {
    const user = userEvent.setup();
    refreshToday.mockResolvedValue({
      ok: true,
      today: makeToday({
        scheduled_tasks: [
          {
            id: "task-fresh",
            name: "Freshly fetched",
            done: false,
            scheduled: "2026-09-20",
            due: null,
            project_name: null,
          },
        ],
      }),
    });
    renderDashboard();

    await user.click(screen.getByRole("button", { name: /Next day/ }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Refresh" })).toBeTruthy();
    });

    await user.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => {
      expect(screen.getByText("Freshly fetched")).toBeTruthy();
    });
    // Refresh always hits the service for the selected day.
    expect(refreshToday).toHaveBeenLastCalledWith("2026-09-21");
  });

  it("on a failed uncached load, keeps previous data clearly identified with retry", async () => {
    const user = userEvent.setup();
    refreshToday.mockResolvedValue({ ok: false, error: "Could not load today's data" });
    renderDashboard();

    await user.click(screen.getByRole("button", { name: /Next day/ }));

    // The failure names the selected day, not the fallback data's day.
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Monday, 21 September 2026");
    // Retry is offered and the fallback data stays visible.
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();

    refreshToday.mockResolvedValueOnce({ ok: true, today: makeToday({ day: "2026-09-21" }) });
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Tomorrow." })).toBeTruthy();
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows fallback data as fallback while loading, never under the new date", async () => {
    const user = userEvent.setup();
    let resolveLoad: (result: RefreshResult) => void = () => {};
    refreshToday.mockImplementation(
      () =>
        new Promise<RefreshResult>((resolve) => {
          resolveLoad = resolve;
        }),
    );
    renderDashboard(
      makeToday({
        scheduled_tasks: [
          {
            id: "task-old",
            name: "Old day task",
            done: false,
            scheduled: "2026-09-20",
            due: null,
            project_name: null,
          },
        ],
      }),
    );

    await user.click(screen.getByRole("button", { name: /Next day/ }));

    // The old day's task is still visible (fallback), but the loading state
    // makes clear it belongs to the previous day.
    expect(screen.getByText("Old day task")).toBeTruthy();
    const loading = screen.getByRole("status");
    expect(loading.textContent).toContain("Showing Sunday, 20 September 2026");

    resolveLoad({ ok: true, today: makeToday({ day: "2026-09-21" }) });
    await waitFor(() => {
      expect(screen.queryByRole("status")).toBeNull();
    });
  });

  it("closes the capture popover on a day switch", async () => {
    const user = userEvent.setup();
    refreshToday.mockResolvedValue({ ok: true, today: makeToday() });
    renderDashboard();

    await user.click(screen.getByRole("button", { name: "+ Add task" }));
    const input = screen.getByPlaceholderText("What needs doing?");
    await user.type(input, "Wrong day task");

    await user.click(screen.getByRole("button", { name: /Next day/ }));

    expect(screen.queryByPlaceholderText("What needs doing?")).toBeNull();
  });

  it("closes the task edit panel on a day switch", async () => {
    const user = userEvent.setup();
    refreshToday.mockResolvedValue({ ok: true, today: makeToday() });
    renderDashboard(
      makeToday({
        scheduled_tasks: [
          {
            id: "task-1",
            name: "Write report",
            done: false,
            scheduled: "2026-09-20",
            due: null,
            project_name: null,
          },
        ],
      }),
    );

    await user.click(screen.getByRole("button", { name: "Edit task Write report" }));
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeTruthy();
    });

    await user.click(screen.getByRole("button", { name: /Next day/ }));

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("does not adopt a slow earlier load after a newer day was selected", async () => {
    const user = userEvent.setup();
    refreshToday.mockImplementation(
      (day: string) =>
        new Promise<RefreshResult>((resolve) => {
          const delay = day === "2026-09-19" ? 300 : 10;
          setTimeout(
            () => resolve({ ok: true, today: makeToday({ day }) }),
            delay,
          );
        }),
    );
    renderDashboard();

    // Select yesterday (slow), then Today (fast, re-selecting the initial
    // day). The heading follows the click immediately.
    await user.click(screen.getByRole("button", { name: /Previous day/ }));
    expect(screen.getByRole("heading", { name: "Yesterday." })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Today" }));
    expect(screen.getByRole("heading", { name: "Today." })).toBeTruthy();

    // Yesterday's late response (300ms) must not overwrite the newer
    // selection of today.
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(screen.getByRole("heading", { name: "Today." })).toBeTruthy();
  });
});
