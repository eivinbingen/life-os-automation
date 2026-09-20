import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CreateTaskResult, RefreshResult, Today } from "./actions";

const createTask = vi.hoisted(() => vi.fn());
const refreshToday = vi.hoisted(() => vi.fn());

vi.mock("./actions", async () => {
  const actual = await vi.importActual<typeof import("./actions")>("./actions");
  return {
    ...actual,
    createTask,
    refreshToday,
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

function renderDashboard(initialToday: Today = makeToday()) {
  return render(
    <Dashboard
      initialToday={initialToday}
      localDay="2026-09-20"
      initialRefreshedAt="2026-09-20T12:00:00Z"
    />,
  );
}

async function openCapture(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "+ Add task" }));
  return screen.getByPlaceholderText("What needs doing?") as HTMLInputElement;
}

describe("Task capture", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    refreshToday.mockResolvedValue({ ok: true, today: makeToday() } as RefreshResult);
  });

  it("is hidden until opened, then focuses the name input", async () => {
    const user = userEvent.setup();
    renderDashboard();

    expect(screen.queryByPlaceholderText("What needs doing?")).toBeNull();

    await openCapture(user);
    await waitFor(() => {
      const input = screen.getByPlaceholderText("What needs doing?");
      expect(document.activeElement).toBe(input);
    });
  });

  it("creates a task with the entered name and selected-day scheduled date", async () => {
    const user = userEvent.setup();
    createTask.mockResolvedValue({ ok: true, name: "Buy oat milk" });
    renderDashboard();

    const input = await openCapture(user);
    await user.type(input, "Buy oat milk");
    await user.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(createTask).toHaveBeenCalledWith("Buy oat milk", "2026-09-20", null);
    });
    // Success triggers the refresh flow so lists and counts update.
    await waitFor(() => {
      expect(refreshToday).toHaveBeenCalledWith("2026-09-20");
    });
    expect(screen.getByText(/Saved “Buy oat milk” to Notion/)).toBeTruthy();
    // Capture closes and the input is gone after a successful save.
    expect(screen.queryByPlaceholderText("What needs doing?")).toBeNull();
  });

  it("requires a non-blank name before submission is possible", async () => {
    const user = userEvent.setup();
    renderDashboard();

    await openCapture(user);

    expect(
      (screen.getByRole("button", { name: "Add" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("opens More details to set and clear an optional due date", async () => {
    const user = userEvent.setup();
    createTask.mockResolvedValue({ ok: true, name: "Essay" });
    renderDashboard();

    await openCapture(user);
    await user.click(screen.getByRole("button", { name: "More details" }));

    const dueInput = screen.getByLabelText("Due") as HTMLInputElement;
    await user.type(dueInput, "2026-09-25");

    // Clear buttons reset dates.
    await user.click(screen.getByRole("button", { name: "Clear due date" }));
    expect(dueInput.value).toBe("");

    await user.type(dueInput, "2026-09-25");
    await user.type(
      screen.getByPlaceholderText("What needs doing?"),
      "Essay",
    );
    await user.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(createTask).toHaveBeenCalledWith("Essay", "2026-09-20", "2026-09-25");
    });
  });

  it("preserves entered values and offers retry when the save fails", async () => {
    const user = userEvent.setup();
    createTask.mockResolvedValue({ ok: false, error: "Could not save the task" });
    renderDashboard();

    const input = await openCapture(user);
    await user.type(input, "Failing task");
    await user.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(screen.getByText("Could not save the task")).toBeTruthy();
    });
    // Entered name is preserved for retry.
    expect(input.value).toBe("Failing task");
    expect(
      (screen.getByRole("button", { name: "Add" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  it("prevents duplicate submissions while a capture is pending", async () => {
    const user = userEvent.setup();
    let resolveCreate: (result: CreateTaskResult) => void = () => {};
    createTask.mockImplementation(
      () =>
        new Promise<CreateTaskResult>((resolve) => {
          resolveCreate = resolve;
        }),
    );
    renderDashboard();

    const input = await openCapture(user);
    await user.type(input, "Slow task");
    await user.click(screen.getByRole("button", { name: "Add" }));

    // Pending: button shows the in-flight state and is disabled.
    expect(
      (screen.getByRole("button", { name: "Adding…" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    // Closing is prevented while pending.
    expect(
      (screen.getByRole("button", { name: "Close capture" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    resolveCreate({ ok: true, name: "Slow task" });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "+ Add task" })).toBeTruthy();
    });
    expect(createTask).toHaveBeenCalledTimes(1);
  });

  it("still confirms the save when the task does not belong on the selected day", async () => {
    const user = userEvent.setup();
    createTask.mockResolvedValue({ ok: true, name: "Later task" });
    renderDashboard();

    await openCapture(user);
    await user.click(screen.getByRole("button", { name: "More details" }));
    // The Scheduled date input, found by its prefilled selected-day value.
    const scheduledInput = screen.getByDisplayValue("2026-09-20");
    // Date inputs with an existing value reject char-by-char typing in jsdom;
    // set the complete value instead.
    fireEvent.change(scheduledInput, { target: { value: "2026-09-22" } });
    await user.type(
      screen.getByPlaceholderText("What needs doing?"),
      "Later task",
    );
    await user.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(createTask).toHaveBeenCalledWith("Later task", "2026-09-22", null);
    });
    expect(screen.getByText(/Saved “Later task” to Notion/)).toBeTruthy();
  });

  it("closes without saving when the close button is used", async () => {
    const user = userEvent.setup();
    renderDashboard();

    const input = await openCapture(user);
    await user.type(input, "Never saved");
    await user.click(screen.getByRole("button", { name: "Close capture" }));

    expect(screen.queryByPlaceholderText("What needs doing?")).toBeNull();
    expect(createTask).not.toHaveBeenCalled();
  });
});
