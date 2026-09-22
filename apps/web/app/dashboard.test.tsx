import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
    updateTask.mockResolvedValue({ ok: true });
  });

  it("shows the initial data and the initial refresh timestamp", () => {
    refreshToday.mockResolvedValue({ ok: true, today: makeToday() });
    renderDashboard(makeToday());

    expect(screen.getByText("Write report")).toBeTruthy();
    expect(screen.getByText(/Last refreshed/)).toBeTruthy();
  });

  it("adopts the newly loaded day when date navigation remounts it", () => {
    const initial = makeToday();
    const nextDay = makeToday({
      day: "2026-09-21",
      scheduled_tasks: [
        {
          id: "task-next-day",
          name: "Plan tomorrow",
          done: false,
          scheduled: "2026-09-21",
          due: null,
          project_name: null,
        },
      ],
    });
    const { rerender } = render(
      <Dashboard key={initial.day} initialToday={initial} {...baseProps} />,
    );

    rerender(
      <Dashboard key={nextDay.day} initialToday={nextDay} {...baseProps} />,
    );

    expect(screen.getByRole("heading", { name: "Tomorrow." })).toBeTruthy();
    expect(screen.getByText("Plan tomorrow")).toBeTruthy();
    expect(screen.queryByText("Write report")).toBeNull();
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

describe("Task editing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateTask.mockResolvedValue({ ok: true });
    refreshToday.mockResolvedValue({ ok: true, today: makeToday() });
  });

  async function openEditor(
    user: ReturnType<typeof userEvent.setup>,
    name: string,
  ) {
    await user.click(screen.getByRole("button", { name: `Edit task ${name}` }));
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeTruthy();
    });
  }

  function editorInput(label: "Name" | "Scheduled" | "Due") {
    // The dialog's fields share labels with dashboard copy; scope queries to
    // the dialog to avoid collisions.
    const dialog = screen.getByRole("dialog");
    return within(dialog).getByLabelText(label) as HTMLInputElement;
  }

  it("opens a details panel when a task name is clicked and seeds current values", async () => {
    const user = userEvent.setup();
    renderDashboard(makeToday());

    await openEditor(user, "Write report");

    expect(editorInput("Name").value).toBe("Write report");
    expect(editorInput("Scheduled").value).toBe("2026-09-20");
    // Cancel makes no external write.
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(updateTask).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("saving without any change closes cleanly without an error", async () => {
    const user = userEvent.setup();
    renderDashboard(makeToday());

    await openEditor(user, "Write report");
    await user.click(screen.getByRole("button", { name: "Save" }));

    // No external write, no error, and the dialog closes.
    expect(updateTask).not.toHaveBeenCalled();
    expect(refreshToday).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText(/could not/i)).toBeNull();
  });

  it("saves only deliberately edited fields and refreshes", async () => {
    const user = userEvent.setup();
    renderDashboard(makeToday());

    await openEditor(user, "Write report");
    const nameInput = screen.getByLabelText("Name") as HTMLInputElement;
    await user.clear(nameInput);
    await user.type(nameInput, "Write the report");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(updateTask).toHaveBeenCalledWith("task-1", {
        name: "Write the report",
      });
    });
    // Scheduled and due are untouched and omitted from the save.
    expect(refreshToday).toHaveBeenCalledWith("2026-09-20");
  });

  it("saves a reschedule without touching the due date", async () => {
    const user = userEvent.setup();
    renderDashboard(makeToday());

    await openEditor(user, "Old task");
    const scheduledInput = editorInput("Scheduled");
    fireEvent.change(scheduledInput, { target: { value: "2026-09-21" } });
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(updateTask).toHaveBeenCalledWith("task-2", {
        scheduled: "2026-09-21",
      });
    });
  });

  it("clears a date explicitly", async () => {
    const user = userEvent.setup();
    renderDashboard(makeToday());

    await openEditor(user, "Old task");
    await user.click(screen.getByRole("button", { name: "Clear due date" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(updateTask).toHaveBeenCalledWith("task-2", { due: null });
    });
  });

  it("blocks saving a blank name", async () => {
    const user = userEvent.setup();
    renderDashboard(makeToday());

    await openEditor(user, "Write report");
    await user.clear(screen.getByLabelText("Name"));
    expect(
      (screen.getByRole("button", { name: "Save" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(updateTask).not.toHaveBeenCalled();
  });

  it("warns before discarding the time on a timed date", async () => {
    const user = userEvent.setup();
    renderDashboard(
      makeToday({
        scheduled_tasks: [
          {
            id: "task-9",
            name: "Timed task",
            done: false,
            scheduled: "2026-09-20T10:30",
            due: null,
            project_name: null,
          },
        ],
      }),
    );

    await openEditor(user, "Timed task");
    // No warning until the value actually changes.
    expect(screen.queryByText(/has no time/)).toBeNull();

    const scheduledInput = editorInput("Scheduled");
    fireEvent.change(scheduledInput, { target: { value: "2026-09-21" } });

    expect(screen.getByText(/the new date has no time/)).toBeTruthy();
  });

  it("shows an overdue indicator on a scheduled-and-overdue task", () => {
    renderDashboard(
      makeToday({
        scheduled_tasks: [
          {
            id: "task-2",
            name: "Old task",
            done: false,
            scheduled: "2026-09-20",
            due: "2026-09-19",
            project_name: null,
          },
        ],
      }),
    );

    expect(screen.getAllByText("Overdue").length).toBeGreaterThan(0);
    // The task appears in the Scheduled section (task-name button next to
    // its Scheduled meta), and the overview counts it once.
  });

  it("preserves entered edits and offers retry when the save fails", async () => {
    const user = userEvent.setup();
    updateTask.mockResolvedValue({ ok: false, error: "Could not save the task" });
    renderDashboard(makeToday());

    await openEditor(user, "Write report");
    const nameInput = screen.getByLabelText("Name") as HTMLInputElement;
    await user.clear(nameInput);
    await user.type(nameInput, "Renamed task");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(screen.getByText("Could not save the task")).toBeTruthy();
    });
    // The dialog stays open with the entered edits preserved.
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe(
      "Renamed task",
    );
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("prevents duplicate submissions while a save is pending", async () => {
    const user = userEvent.setup();
    let resolveSave: (result: { ok: boolean }) => void = () => {};
    updateTask.mockImplementation(
      () =>
        new Promise<{ ok: boolean }>((resolve) => {
          resolveSave = resolve;
        }),
    );
    renderDashboard(makeToday());

    await openEditor(user, "Write report");
    const nameInput = screen.getByLabelText("Name") as HTMLInputElement;
    await user.clear(nameInput);
    await user.type(nameInput, "Renamed task");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(
      (screen.getByRole("button", { name: "Saving…" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    resolveSave({ ok: true });
    await waitFor(() => {
      expect(updateTask).toHaveBeenCalledTimes(1);
    });
    // Let the post-save state settle before the next test unmounts.
    await waitFor(() => {
      expect(refreshToday).toHaveBeenCalled();
    });
  });
});
