import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { GoalDetailBoard } from "./goal-detail";
import type { GoalDetail } from "../../goals-actions";

vi.mock("../../goals-actions", () => ({
  fetchGoalDetail: vi.fn(),
}));

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
});
