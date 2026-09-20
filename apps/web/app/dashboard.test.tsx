import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RefreshResult, Today } from "./actions";

const refreshToday = vi.hoisted(() => vi.fn<(day: string) => Promise<RefreshResult>>());
const updateTaskDone = vi.hoisted(() => vi.fn());

vi.mock("./actions", async () => {
  const actual = await vi.importActual<typeof import("./actions")>("./actions");
  return {
    ...actual,
    refreshToday,
    updateTaskDone,
  };
});

import { Dashboard } from "./dashboard";

function makeToday(overrides: Partial<Today> = {}): Today {
  return {
    day: "2026-09-20",
    events: [
      {
        id: "event-1",
        title: "Team sync",
        start: "2026-09-20T09:00:00Z",
        end: "2026-09-20T09:30:00Z",
        all_day: false,
      },
    ],
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
    due_tasks: [],
    overdue_tasks: [
      {
        id: "task-2",
        name: "Old task",
        done: false,
        scheduled: "2026-09-18",
        due: "2026-09-19",
        project_name: null,
      },
    ],
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

function renderDashboard(initialToday: Today) {
  return render(<Dashboard initialToday={initialToday} {...baseProps} />);
}

describe("Dashboard refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the initial data and the initial refresh timestamp", () => {
    refreshToday.mockResolvedValue({ ok: true, today: makeToday() });
    renderDashboard(makeToday());

    expect(screen.getByText("Write report")).toBeTruthy();
    expect(screen.getByText(/Last refreshed/)).toBeTruthy();
  });

  it("swaps in fresh data on a successful refresh", async () => {
    const user = userEvent.setup();
    const initial = makeToday();
    const fresh = makeToday({
      scheduled_tasks: [
        {
          id: "task-3",
          name: "Fresh task",
          done: false,
          scheduled: "2026-09-20",
          due: null,
          project_name: null,
        },
      ],
    });
    refreshToday.mockResolvedValue({ ok: true, today: fresh });
    renderDashboard(initial);

    await user.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() => {
      expect(screen.getByText("Fresh task")).toBeTruthy();
    });
    expect(screen.queryByText("Write report")).toBeNull();
  });

  it("keeps previous data and reports a failed refresh", async () => {
    const user = userEvent.setup();
    refreshToday.mockResolvedValue({
      ok: false,
      error: "Could not load today's data",
    });
    renderDashboard(makeToday());

    await user.click(screen.getByRole("button", { name: "Refresh" }));

    expect(screen.getByText("Write report")).toBeTruthy();
    expect(
      screen.getByText("Refresh failed. Showing the last loaded information."),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("recovers when the server action throws instead of returning a result", async () => {
    const user = userEvent.setup();
    refreshToday.mockRejectedValue(new Error("connection refused"));
    renderDashboard(makeToday());

    await user.click(screen.getByRole("button", { name: "Refresh" }));

    // The pending state ends, previous data stays, and the failure is shown.
    await waitFor(() => {
      expect(
        screen.getByText("Refresh failed. Showing the last loaded information."),
      ).toBeTruthy();
    });
    expect(
      (screen.getByRole("button", { name: "Refresh" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
    expect(screen.getByText("Write report")).toBeTruthy();
  });

  it("clears the refresh error after a subsequent successful refresh", async () => {
    const user = userEvent.setup();
    refreshToday
      .mockResolvedValueOnce({ ok: false, error: "backend down" })
      .mockResolvedValueOnce({ ok: true, today: makeToday() });
    renderDashboard(makeToday());

    await user.click(screen.getByRole("button", { name: "Refresh" }));
    await user.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => {
      expect(
        screen.queryByText(
          "Refresh failed. Showing the last loaded information.",
        ),
      ).toBeNull();
    });
  });

  it("prevents duplicate refresh requests while one is pending", async () => {
    const user = userEvent.setup();
    let resolveRefresh: (result: RefreshResult) => void = () => {};
    refreshToday.mockImplementation(
      () =>
        new Promise<RefreshResult>((resolve) => {
          resolveRefresh = resolve;
        }),
    );
    renderDashboard(makeToday());

    await user.click(screen.getByRole("button", { name: "Refresh" }));
    // A second click while refreshing is a no-op: the button is disabled and
    // the in-flight ref guard blocks it.
    expect(
      (screen.getByRole("button", { name: "Refreshing…" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(refreshToday).toHaveBeenCalledTimes(1);

    resolveRefresh({ ok: true, today: makeToday() });

    await waitFor(() => {
      expect(refreshToday).toHaveBeenCalledTimes(1);
    });
  });

  it("disables checkboxes while refreshing and refresh while a completion is pending", async () => {
    const user = userEvent.setup();
    let resolveCompletion: () => void = () => {};
    updateTaskDone.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveCompletion = resolve;
        }),
    );
    let resolveRefresh: (result: RefreshResult) => void = () => {};
    refreshToday.mockImplementation(
      () =>
        new Promise<RefreshResult>((resolve) => {
          resolveRefresh = resolve;
        }),
    );
    renderDashboard(makeToday());

    // While a refresh is pending, checkboxes are disabled.
    await user.click(screen.getByRole("button", { name: "Refresh" }));
    const checkbox = screen.getByLabelText(
      "Write report",
    ) as HTMLInputElement;
    expect(checkbox.disabled).toBe(true);

    resolveRefresh({ ok: true, today: makeToday() });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Refresh" })).toBeTruthy();
    });

    // While a completion is pending, the refresh button is disabled.
    await user.click(screen.getByLabelText("Write report"));
    expect(
      (screen.getByRole("button", { name: "Refresh" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "+ Add task" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    resolveCompletion();
    await waitFor(() => {
      expect(
        (screen.getByRole("button", { name: "Refresh" }) as HTMLButtonElement)
          .disabled,
      ).toBe(false);
    });
  });

  it("swaps in new data even when an integration is down", async () => {
    const user = userEvent.setup();
    const freshWithFailure = makeToday({
      scheduled_tasks: [
        {
          id: "task-4",
          name: "Notion-blip task",
          done: false,
          scheduled: "2026-09-20",
          due: null,
          project_name: null,
        },
      ],
      statuses: [
        { name: "Calendar", ok: true, error: null },
        { name: "Notion", ok: false, error: "connection error" },
      ],
    });
    refreshToday.mockResolvedValue({ ok: true, today: freshWithFailure });
    renderDashboard(makeToday());

    await user.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() => {
      expect(screen.getByText("Notion-blip task")).toBeTruthy();
    });
    expect(screen.getByText(/Notion is unavailable/)).toBeTruthy();
  });
});
