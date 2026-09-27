import { render, screen, within, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { StudiesCourse, StudiesOverview } from "./studies-actions";
import { StudiesBoard } from "./studies-board";

vi.mock("next/server", () => ({ connection: vi.fn() }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

function course(id: string, name: string, overrides: Partial<StudiesCourse> = {}): StudiesCourse {
  return { id, name, next_item: null, upcoming: [], ...overrides };
}

function overview(overrides: Partial<StudiesOverview> = {}): StudiesOverview {
  return { courses: [], upcoming: [], statuses: [], warnings: [], ...overrides };
}

it("renders both active courses with names", () => {
  const data = overview({
    courses: [course("c1", "Corporate Finance"), course("c2", "Machine Learning")],
  });
  render(<StudiesBoard overview={data} />);

  expect(screen.getByText("Corporate Finance")).toBeTruthy();
  expect(screen.getByText("Machine Learning")).toBeTruthy();
  expect(screen.getByText("2 courses")).toBeTruthy();
});

it("shows the next item with a formatted due date", () => {
  const data = overview({
    courses: [
      course("c1", "Corporate Finance", {
        next_item: {
          id: "i1",
          name: "Assignment 2",
          kind: "deadline",
          course_id: "c1",
          course_name: "Corporate Finance",
          due: "2026-10-12",
        },
        upcoming: [
          {
            id: "i1",
            name: "Assignment 2",
            kind: "deadline",
            course_id: "c1",
            course_name: "Corporate Finance",
            due: "2026-10-12",
          },
        ],
      }),
    ],
  });
  render(<StudiesBoard overview={data} />);

  expect(screen.getByText(/Assignment 2/)).toBeTruthy();
  expect(screen.getByText(/12 Oct/)).toBeTruthy();
});

it("shows a muted no-upcoming-work line when next_item is null", () => {
  const data = overview({ courses: [course("c1", "Corporate Finance")] });
  render(<StudiesBoard overview={data} />);

  expect(screen.getByText("No upcoming work")).toBeTruthy();
});

it("renders shuffled upcoming work date-ordered", () => {
  const data = overview({
    upcoming: [
      { id: "b", name: "Later task", kind: "deadline", course_id: null, course_name: null, due: "2026-10-20" },
      { id: "a", name: "Earlier task", kind: "deadline", course_id: null, course_name: null, due: "2026-10-05" },
    ],
  });
  render(<StudiesBoard overview={data} />);

  const rows = screen.getAllByRole("listitem");
  const names = rows.map((row) => row.textContent);
  expect(names[0]).toContain("Earlier task");
  expect(names[1]).toContain("Later task");
});

it("renders a row without a course name when course_name is null", () => {
  const data = overview({
    upcoming: [
      { id: "x", name: "Unlinked task", kind: "study_task", course_id: null, course_name: null, due: "2026-10-05" },
    ],
  });
  render(<StudiesBoard overview={data} />);

  expect(screen.getByText("Unlinked task")).toBeTruthy();
  expect(screen.queryByText("Corporate Finance")).toBeNull();
});

it("shows counts unavailable and the alert when Notion fails", () => {
  const data = overview({
    statuses: [{ name: "Notion", ok: false, error: "connection refused" }],
    warnings: ["Could not load upcoming academic work."],
  });
  render(<StudiesBoard overview={data} />);

  expect(screen.getByText(/Notion is unavailable/)).toBeTruthy();
  expect(screen.getByText(/Could not load upcoming academic work/)).toBeTruthy();
  expect(screen.getAllByText("Unavailable").length).toBe(3);
  expect(screen.getByText("No active courses in Notion.")).toBeTruthy();
});

it("shows no alert when the overview is empty and Notion is ok", () => {
  render(<StudiesBoard overview={overview()} />);

  expect(screen.getByText("No active courses in Notion.")).toBeTruthy();
  expect(screen.queryByText(/Notion is unavailable/)).toBeNull();
});

it("shows a +N more suffix when a course has multiple upcoming items", () => {
  const data = overview({
    courses: [
      course("c1", "Corporate Finance", {
        next_item: {
          id: "i1",
          name: "Assignment 2",
          kind: "deadline",
          course_id: "c1",
          course_name: "Corporate Finance",
          due: "2026-10-12",
        },
        upcoming: [
          {
            id: "i1",
            name: "Assignment 2",
            kind: "deadline",
            course_id: "c1",
            course_name: "Corporate Finance",
            due: "2026-10-12",
          },
          {
            id: "i2",
            name: "Assignment 3",
            kind: "deadline",
            course_id: "c1",
            course_name: "Corporate Finance",
            due: "2026-10-19",
          },
        ],
      }),
    ],
  });
  render(<StudiesBoard overview={data} />);

  expect(screen.getByText("Next · +1 more")).toBeTruthy();
});

it("marks the overview strip with counts per kind", () => {
  const data = overview({
    courses: [course("c1", "Corporate Finance")],
    upcoming: [
      { id: "a", name: "Exam", kind: "assessment", course_id: "c1", course_name: "Corporate Finance", due: "2026-11-20" },
      { id: "b", name: "Read chapter", kind: "study_task", course_id: "c1", course_name: "Corporate Finance", due: "2026-10-02" },
    ],
  });
  render(<StudiesBoard overview={data} />);

  const strip = screen.getByLabelText("Studies at a glance");
  expect(within(strip).getAllByText("1").length).toBe(3);
  expect(within(strip).getByText("Active courses")).toBeTruthy();
  expect(within(strip).getByText("Open work")).toBeTruthy();
  expect(within(strip).getByText("Assessments")).toBeTruthy();
});
