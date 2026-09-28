import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ProjectDetailBoard } from "./project-detail";
import type { ProjectDetail } from "../../projects-actions";

vi.mock("../../actions", () => ({
  updateTaskDone: vi.fn(),
}));

import { updateTaskDone } from "../../actions";

const updateTaskDoneMock = vi.mocked(updateTaskDone);

function project(overrides: Partial<ProjectDetail> = {}): ProjectDetail {
  return {
    id: "project-1",
    name: "Life OS",
    status: "Active",
    status_available: true,
    goal_id: "goal-1",
    goal_name: "Ship the app",
    deadline: "2026-10-19",
    tasks: [
      {
        id: "task-1",
        name: "Plan the week",
        done: false,
        scheduled: "2026-09-28",
        due: null,
        project_id: "project-1",
        project_name: "Life OS",
      },
    ],
    statuses: [],
    warnings: [],
    ...overrides,
  };
}

describe("Project detail view", () => {
  it("renders the project name, status, goal, and deadline", () => {
    render(<ProjectDetailBoard project={project()} />);

    expect(screen.getByRole("heading", { name: /Life OS/ })).toBeTruthy();
    expect(screen.getByText("Active")).toBeTruthy();
    expect(screen.getByText("Ship the app")).toBeTruthy();
    expect(screen.getByText("Monday, 19 October 2026")).toBeTruthy();
  });

  it("renders neutral dashes for missing optional context", () => {
    render(
      <ProjectDetailBoard
        project={project({ goal_id: null, goal_name: null, deadline: null })}
      />,
    );

    expect(screen.getAllByText("—").length).toBe(2);
    expect(screen.queryByText("Unavailable")).toBeNull();
  });

  it("renders unavailable status without hiding the project", () => {
    render(
      <ProjectDetailBoard
        project={project({ status: null, status_available: false })}
      />,
    );

    expect(screen.getByText("Unavailable")).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Life OS/ })).toBeTruthy();
  });

  it("marks failed sources as unavailable", () => {
    render(
      <ProjectDetailBoard
        project={project({
          statuses: [{ name: "Notion tasks", ok: false, error: "boom" }],
        })}
      />,
    );

    expect(screen.getByText(/Notion tasks is unavailable/)).toBeTruthy();
  });

  it("shows an empty state for a project with no tasks", () => {
    render(<ProjectDetailBoard project={project({ tasks: [] })} />);

    expect(screen.getByText("No open tasks in this project.")).toBeTruthy();
  });

  it("completes a task through the narrow task action", async () => {
    const user = userEvent.setup();
    updateTaskDoneMock.mockResolvedValue({ ok: true });
    render(<ProjectDetailBoard project={project()} />);

    const checkbox = screen.getByRole("checkbox", { name: "Plan the week" });
    await user.click(checkbox);

    expect(updateTaskDoneMock).toHaveBeenCalledWith("task-1", true);
  });

  it("reverts the checkbox and marks it failed when the save fails", async () => {
    const user = userEvent.setup();
    updateTaskDoneMock.mockRejectedValue(new Error("Could not save the task"));
    render(<ProjectDetailBoard project={project()} />);

    const checkbox = screen.getByRole("checkbox", { name: "Plan the week" }) as HTMLInputElement;
    await user.click(checkbox);

    expect(checkbox.checked).toBe(false);
    expect(checkbox.className).toContain("task-checkbox-error");
  });
});
