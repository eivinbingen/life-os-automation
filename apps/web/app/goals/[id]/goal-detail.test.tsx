import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { GoalDetailBoard } from "./goal-detail";
import type { GoalDetail } from "../../goals-actions";

const push = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("../../goal-actions", () => ({
  completeGoal: vi.fn(),
  updateGoal: vi.fn(),
  GOAL_STATUSES: ["Not Started", "Active", "Failed", "Done"],
}));

import { completeGoal, updateGoal } from "../../goal-actions";

const completeGoalMock = vi.mocked(completeGoal);
const updateGoalMock = vi.mocked(updateGoal);

function goal(overrides: Partial<GoalDetail> = {}): GoalDetail {
  return {
    id: "goal-1",
    name: "Ship the app",
    status: "Active",
    status_available: true,
    area_id: "area-1",
    area_name: "Work",
    target_date: "2026-12-31",
    projects: [
      { id: "p1", name: "Life OS" },
      { id: "p2", name: "Onboarding" },
    ],
    statuses: [],
    warnings: [],
    ...overrides,
  };
}

describe("Goal detail view", () => {
  it("renders the goal name, status, area, and target date", () => {
    render(<GoalDetailBoard goal={goal()} />);

    expect(screen.getByRole("heading", { name: /Ship the app/ })).toBeTruthy();
    expect(screen.getByText("Active")).toBeTruthy();
    expect(screen.getByText("Work")).toBeTruthy();
    expect(screen.getByText("31 Dec 2026")).toBeTruthy();
  });

  it("renders neutral dashes for missing optional context", () => {
    render(
      <GoalDetailBoard
        goal={goal({ area_id: null, area_name: null, target_date: null })}
      />,
    );

    expect(screen.getAllByText("—").length).toBe(2);
    expect(screen.queryByText("Unavailable")).toBeNull();
  });

  it("renders unavailable status without hiding the goal", () => {
    render(
      <GoalDetailBoard goal={goal({ status: null, status_available: false })} />,
    );

    expect(screen.getByText("Unavailable")).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Ship the app/ })).toBeTruthy();
  });

  it("marks failed sources as unavailable", () => {
    render(
      <GoalDetailBoard
        goal={goal({
          statuses: [{ name: "Notion projects", ok: false, error: "boom" }],
        })}
      />,
    );

    expect(screen.getByText(/Notion projects is unavailable/)).toBeTruthy();
  });

  it("shows a neutral empty state for a goal with no projects", () => {
    render(<GoalDetailBoard goal={goal({ projects: [] })} />);

    expect(screen.getByText("No projects linked to this goal yet.")).toBeTruthy();
  });

  it("links related projects to their workspaces", () => {
    render(<GoalDetailBoard goal={goal()} />);

    const link = screen.getByRole("link", { name: "Life OS" });
    expect(link.getAttribute("href")).toBe("/projects/p1");
  });

  it("completes the goal through a confirmed status-only edit", async () => {
    const user = userEvent.setup();
    completeGoalMock.mockResolvedValue({ ok: true });
    render(<GoalDetailBoard goal={goal()} />);

    await user.click(screen.getByRole("button", { name: "Complete goal" }));

    // Inline confirm names the no-cascade guarantee before the write.
    expect(
      screen.getByText(/projects and tasks are unchanged/),
    ).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Complete goal" }));

    expect(completeGoalMock).toHaveBeenCalledWith("goal-1");
  });

  it("cancels completion without any write", async () => {
    const user = userEvent.setup();
    render(<GoalDetailBoard goal={goal()} />);

    await user.click(screen.getByRole("button", { name: "Complete goal" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(completeGoalMock).not.toHaveBeenCalled();
  });

  it("opens the edit form prefilled and saves only changed fields", async () => {
    const user = userEvent.setup();
    updateGoalMock.mockResolvedValue({ ok: true });
    render(<GoalDetailBoard goal={goal()} />);

    await user.click(screen.getByRole("button", { name: "Edit goal" }));

    // The form seeds from the goal's current values.
    const nameInput = screen.getByLabelText("Name") as HTMLInputElement;
    expect(nameInput.value).toBe("Ship the app");
    const statusSelect = screen.getByLabelText("Status") as HTMLSelectElement;
    expect(statusSelect.value).toBe("Active");

    await user.click(screen.getByRole("button", { name: "Save" }));

    // Nothing changed: no fields are sent.
    expect(updateGoalMock).toHaveBeenCalledWith("goal-1", {});
  });

  it("sends a renamed goal as a name-only edit", async () => {
    const user = userEvent.setup();
    updateGoalMock.mockResolvedValue({ ok: true });
    render(<GoalDetailBoard goal={goal()} />);

    await user.click(screen.getByRole("button", { name: "Edit goal" }));
    const nameInput = screen.getByLabelText("Name");
    await user.clear(nameInput);
    await user.type(nameInput, "Renamed goal");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(updateGoalMock).toHaveBeenCalledWith("goal-1", { name: "Renamed goal" });
  });

  it("keeps the entered edits and shows the error when a save fails", async () => {
    const user = userEvent.setup();
    updateGoalMock.mockResolvedValue({ ok: false, error: "Could not save the goal" });
    render(<GoalDetailBoard goal={goal()} />);

    await user.click(screen.getByRole("button", { name: "Edit goal" }));
    const nameInput = screen.getByLabelText("Name");
    await user.clear(nameInput);
    await user.type(nameInput, "Renamed goal");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByText("Could not save the goal")).toBeTruthy();
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Renamed goal");
  });
});
