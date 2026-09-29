import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CleanUpSummary, LookBackSummary, ReviewRecord } from "./review-actions";
import { ReviewBoard } from "./review-board";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const push = vi.hoisted(() => vi.fn());
const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const summary: LookBackSummary = {
  week_start: "2026-09-14",
  week_end: "2026-09-20",
  timezone: "Europe/Zurich",
  captured_at: "2026-09-21T09:00:00+02:00",
  metrics: [
    {
      key: "tasks_scheduled_done",
      label: "Tasks done",
      definition:
        "Out of tasks scheduled in the reviewed week. Completion date is not tracked.",
      available: true,
      count: 2,
      total: 3,
    },
    {
      key: "events_in_week",
      label: "Calendar events",
      definition: "Unique calendar events with a start inside the reviewed week.",
      available: true,
      count: 3,
      total: null,
    },
    {
      key: "projects_touched",
      label: "Projects worked on",
      definition: "Distinct projects with tasks scheduled in the reviewed week.",
      available: true,
      count: 1,
      total: null,
    },
  ],
  statuses: [
    { name: "Notion", ok: true, error: null },
    { name: "Calendar", ok: true, error: null },
  ],
  completed_tasks: [
    { id: "c1", name: "Shipped the slice", project_name: "Life OS" },
    { id: "c2", name: "Wrote the docs", project_name: "Life OS" },
  ],
  unfinished_tasks: [{ id: "u1", name: "Old task", project_name: null }],
};

const draft: ReviewRecord = {
  id: "review-1",
  week_start: "2026-09-14",
  week_end: "2026-09-20",
  ahead_start: "2026-09-21",
  ahead_end: "2026-09-27",
  timezone: "Europe/Zurich",
  status: "draft",
  revision: 3,
  created_at: "2026-09-21T09:00:00Z",
  updated_at: "2026-09-21T10:00:00Z",
  completed_at: null,
  section_progress: { look_back: false, clean_up: false, direction: false, ahead: false },
  wins: "",
  reflection: "",
  look_back_summary: null,
};

const completed: ReviewRecord = {
  ...draft,
  id: "review-0",
  week_start: "2026-09-07",
  week_end: "2026-09-13",
  ahead_start: "2026-09-14",
  ahead_end: "2026-09-20",
  status: "completed",
  completed_at: "2026-09-14T18:00:00Z",
  wins: "Shipped v2",
};

const saveReviewDraft = vi.hoisted(() => vi.fn());
const completeReview = vi.hoisted(() => vi.fn());
const fetchLookBackAction = vi.hoisted(() => vi.fn());
const updateTaskAction = vi.hoisted(() => vi.fn());
vi.mock("../../actions", () => ({ updateTask: updateTaskAction, updateTaskDone: updateTaskAction }));

const createGoalAction = vi.hoisted(() => vi.fn());
const completeGoalAction = vi.hoisted(() => vi.fn());
const createProjectAction = vi.hoisted(() => vi.fn());
vi.mock("../../goal-actions", () => ({
  createGoal: createGoalAction,
  updateGoal: vi.fn(),
  completeGoal: completeGoalAction,
}));
vi.mock("../../projects-actions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../projects-actions")>();
  return { ...actual, createProject: createProjectAction };
});

vi.mock("./review-actions", async () => {
  const actual = await vi.importActual<typeof import("./review-actions")>("./review-actions");
  return { ...actual, saveReviewDraft, completeReview, fetchLookBack: fetchLookBackAction };
});

function renderBoard() {
  return render(<ReviewBoard initialReview={draft} history={[completed]} />);
}

describe("Guided weekly review", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    saveReviewDraft.mockResolvedValue({ ok: true, review: draft });
    completeReview.mockResolvedValue({ ok: true, review: { ...draft, status: "completed" } });
  });

  it("shows the five guided sections with paired week and ahead dates", () => {
    renderBoard();
    for (const title of ["Look Back", "Clean Up", "Direction", "Ahead", "Commit"]) {
      expect(screen.getByRole("heading", { name: new RegExp(title) })).toBeTruthy();
    }
    expect(screen.getByLabelText("Review state").textContent).toContain("Draft");
    expect(screen.getByLabelText("Review state").textContent).toContain("Reviewed 14–20 Sept 2026");
    expect(screen.getByLabelText("Review state").textContent).toContain("Ahead 21–27 Sept 2026");
  });

  it("collapses and expands sections without losing entered text", async () => {
    const user = userEvent.setup();
    renderBoard();
    const wins = screen.getByPlaceholderText("What went well this week?");
    await user.type(wins, "Shipped the review slice");
    const collapse = screen.getAllByRole("button", { name: "Collapse" })[0];
    await user.click(collapse);
    expect(screen.queryByPlaceholderText("What went well this week?")).toBeNull();
    const expand = screen.getAllByRole("button", { name: "Expand" })[0];
    await user.click(expand);
    expect((screen.getByPlaceholderText("What went well this week?") as HTMLTextAreaElement).value).toBe("Shipped the review slice");
  });

  it("advances a section and persists the progress", async () => {
    const user = userEvent.setup();
    renderBoard();
    await user.click(screen.getAllByRole("button", { name: "Advance" })[0]);
    await waitFor(() => {
      expect(saveReviewDraft).toHaveBeenCalledWith(
        "review-1",
        3,
        expect.objectContaining({ section_progress: expect.objectContaining({ look_back: true }) }),
      );
    });
  });

  it("saves wins on blur and shows the saved state", async () => {
    const user = userEvent.setup();
    renderBoard();
    const wins = screen.getByPlaceholderText("What went well this week?");
    await user.type(wins, "Great week");
    await user.tab();
    await waitFor(() => {
      expect(saveReviewDraft).toHaveBeenCalledWith("review-1", 3, { wins: "Great week" });
    });
    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toContain("saved");
    });
  });

  it("keeps entered edits and offers retry when a save fails", async () => {
    const user = userEvent.setup();
    saveReviewDraft.mockResolvedValue({ ok: false, error: "The review could not be saved. Your edits are kept; please try again." });
    renderBoard();
    const wins = screen.getByPlaceholderText("What went well this week?");
    await user.type(wins, "Kept edits");
    await user.tab();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("could not be saved");
    expect((screen.getByPlaceholderText("What went well this week?") as HTMLTextAreaElement).value).toBe("Kept edits");
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("explains a conflict and does not overwrite entered text", async () => {
    const user = userEvent.setup();
    saveReviewDraft.mockResolvedValue({ ok: false, conflict: true, error: "Another save occurred while you were editing." });
    renderBoard();
    const wins = screen.getByPlaceholderText("What went well this week?");
    await user.type(wins, "my side");
    await user.tab();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Another save occurred");
    expect((screen.getByPlaceholderText("What went well this week?") as HTMLTextAreaElement).value).toBe("my side");
  });

  it("completes the review and shows the completed state", async () => {
    const user = userEvent.setup();
    completeReview.mockResolvedValue({
      ok: true,
      review: { ...draft, status: "completed", completed_at: "2026-09-21T18:00:00Z", revision: 4 },
    });
    renderBoard();
    await user.click(screen.getByRole("button", { name: "Complete review" }));
    await waitFor(() => {
      expect(completeReview).toHaveBeenCalledWith("review-1", 3, "review-1:3", expect.anything());
    });
    await waitFor(() => {
      expect(screen.getByLabelText("Review state").textContent).toContain("Completed");
    });
    expect(screen.getByText(/saved history/)).toBeTruthy();
  });

  it("lists completed history read-only", () => {
    renderBoard();
    const history = screen.getByLabelText("Completed reviews").closest("section");
    expect(history?.textContent).toContain("7–13 Sept 2026");
    expect(history?.textContent).toContain("Completed reviews");
  });

  it("cycles to the previous and next week from the header", async () => {
    const user = userEvent.setup();
    renderBoard();
    await user.click(screen.getByRole("button", { name: "Previous week" }));
    expect(push).toHaveBeenLastCalledWith("/review/weekly?week_start=2026-09-07");
    await user.click(screen.getByRole("button", { name: "Next week" }));
    expect(push).toHaveBeenLastCalledWith("/review/weekly?week_start=2026-09-21");
  });

  it("labels the reviewed and ahead weeks separately in the header", () => {
    renderBoard();
    const state = screen.getByLabelText("Review state").textContent ?? "";
    expect(state).toContain("Reviewed");
    expect(state).toContain("Ahead");
  });

  it("disables textareas once the review is completed", () => {
    render(<ReviewBoard initialReview={{ ...draft, status: "completed", completed_at: "2026-09-21T18:00:00Z" }} history={[]} />);
    expect((screen.getByPlaceholderText("What went well this week?") as HTMLTextAreaElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Complete review" })).toBeNull();
  });

  it("queues an edit made while a save is in flight and flushes it after", async () => {
    const user = userEvent.setup();
    let resolveFirst: (value: { ok: true; review: ReviewRecord }) => void = () => {};
    saveReviewDraft.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
    );
    renderBoard();
    const wins = screen.getByPlaceholderText("What went well this week?");
    await user.type(wins, "first edit");
    await user.tab();
    const reflection = screen.getByPlaceholderText("Anything you want to remember about this week?");
    await user.type(reflection, "second edit");
    await user.tab();
    await waitFor(() => {
      expect(saveReviewDraft).toHaveBeenCalledTimes(1);
    });
    resolveFirst({ ok: true, review: { ...draft, revision: 4, wins: "first edit" } });
    await waitFor(() => {
      expect(saveReviewDraft).toHaveBeenCalledTimes(2);
    });
    expect(saveReviewDraft).toHaveBeenLastCalledWith("review-1", 4, { reflection: "second edit" });
  });

  it("shows an unavailable history state with the error instead of empty history", () => {
    render(<ReviewBoard initialReview={draft} history={[]} historyError="The Life OS service could not load review history. Please try again." />);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("could not load review history");
    expect(screen.getByText("Completed reviews")).toBeTruthy();
  });
});

describe("Look Back summary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function openLookBack() {
    const section = screen.getByRole("heading", { name: /Look Back/ }).closest("section");
    const expand = section?.querySelector(".review-collapse") as HTMLElement;
    if (expand?.getAttribute("aria-expanded") === "false") {
      expand.click();
    }
  }

  it("renders the live summary with honest metric labels and inspectable lists", () => {
    render(
      <ReviewBoard
        initialReview={draft}
        history={[]}
        lookBack={{ ok: true, summary }}
      />,
    );
    openLookBack();
    const section = screen.getByRole("heading", { name: /Look Back/ }).closest("section");
    expect(section?.textContent).toContain("2 of 3");
    expect(section?.textContent).toContain("Tasks done");
    expect(section?.textContent).toContain("Projects worked on");
    expect(section?.querySelectorAll(".review-donut").length).toBe(3);
    const completedList = screen.getByText(/Completed work \(2\)/).closest("details");
    expect(completedList?.textContent).toContain("Shipped the slice");
    const unfinishedList = screen.getByText(/Unfinished work \(1\)/).closest("details");
    expect(unfinishedList?.textContent).toContain("Old task");
  });

  it("shows an unavailable state with retry when the live fetch fails", async () => {
    fetchLookBackAction.mockResolvedValue({ ok: true, summary });
    render(
      <ReviewBoard
        initialReview={draft}
        history={[]}
        lookBack={{ ok: false, error: "The look-back summary could not be loaded. Please try again." }}
      />,
    );
    openLookBack();
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("could not be loaded");
    const retry = screen.getByRole("button", { name: "Try again" });
    await userEvent.setup().click(retry);
    await waitFor(() => {
      expect(fetchLookBackAction).toHaveBeenCalledWith("2026-09-14");
      expect(screen.getByText(/Tasks done/)).toBeTruthy();
    });
  });

  it("shows zero counts as empty, distinct from unavailable", () => {
    render(
      <ReviewBoard
        initialReview={draft}
        history={[]}
        lookBack={{
          ok: true,
          summary: {
            ...summary,
            metrics: summary.metrics.map((metric) =>
              metric.available ? { ...metric, count: 0 } : metric,
            ),
            completed_tasks: [],
            unfinished_tasks: [],
          },
        }}
      />,
    );
    openLookBack();
    expect(screen.getByText(/Completed work \(0\)/)).toBeTruthy();
    expect(screen.getByText(/No tasks scheduled in the week are done/)).toBeTruthy();
    // No metric is unavailable, so nothing renders as N/A.
    expect(screen.queryAllByText("N/A").length).toBe(0);
  });

  it("renders an unavailable metric as N/A with an empty dashed ring", () => {
    render(
      <ReviewBoard
        initialReview={draft}
        history={[]}
        lookBack={{
          ok: true,
          summary: {
            ...summary,
            metrics: [
              { ...summary.metrics[0], available: false, count: null },
              ...summary.metrics.slice(1),
            ],
          },
        }}
      />,
    );
    openLookBack();
    expect(screen.getByText("N/A")).toBeTruthy();
    // The whole metric keeps its donut shape (dashed ring), not a tick strip.
    const section = screen.getByRole("heading", { name: /Look Back/ }).closest("section");
    expect(section?.querySelectorAll(".review-donut").length).toBe(3);
  });

  it("shows partial fetch warnings when a source failed", () => {
    render(
      <ReviewBoard
        initialReview={draft}
        history={[]}
        lookBack={{
          ok: true,
          summary: {
            ...summary,
            statuses: [{ name: "Calendar", ok: false, error: "down" }],
          },
        }}
      />,
    );
    openLookBack();
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Calendar is unavailable");
  });

  it("renders the fixed saved summary for a completed record", () => {
    render(
      <ReviewBoard
        initialReview={{ ...draft, status: "completed", completed_at: "2026-09-21T18:00:00Z", look_back_summary: summary }}
        history={[]}
        lookBack={null}
      />,
    );
    openLookBack();
    const section = screen.getByRole("heading", { name: /Look Back/ }).closest("section");
    expect(section?.textContent).toContain("fixed history");
    expect(section?.textContent).toContain("Shipped the slice");
  });

  it("degrades gracefully when a completed record has no saved summary", () => {
    render(
      <ReviewBoard
        initialReview={{ ...draft, status: "completed", completed_at: "2026-09-21T18:00:00Z", look_back_summary: null }}
        history={[]}
        lookBack={null}
      />,
    );
    openLookBack();
    expect(screen.getByText(/look-back summary is unavailable right now/)).toBeTruthy();
  });
});

describe("Clean Up queue", () => {
  const cleanUpSummary: CleanUpSummary = {
    week_start: "2026-09-14",
    week_end: "2026-09-20",
    local_day: "2026-09-27",
    timezone: "Europe/Zurich",
    captured_at: "2026-09-27T09:00:00+02:00",
    items: [
      {
        id: "q1",
        name: "Finish case study",
        project_id: "project-cf",
        project_name: "Corporate Finance",
        scheduled: "2026-09-16",
        due: "2026-09-10",
        overdue: true,
        scheduled_in_week: true,
      },
      {
        id: "q2",
        name: "Read chapter 4",
        project_id: null,
        project_name: null,
        scheduled: "2026-09-18",
        due: null,
        overdue: false,
        scheduled_in_week: true,
      },
    ],
    statuses: [{ name: "Notion", ok: true, error: null }],
    warnings: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    fetchLookBackAction.mockResolvedValue({ ok: true, summary });
    updateTaskAction.mockResolvedValue({ ok: true });
  });

  async function renderCleanUpBoard(
    cleanUpProp:
      | { ok: true; summary: typeof cleanUpSummary }
      | { ok: false; error: string } = { ok: true, summary: cleanUpSummary },
  ) {
    const user = userEvent.setup();
    const view = render(
      <ReviewBoard
        initialReview={draft}
        history={[completed]}
        lookBack={{ ok: true, summary }}
        cleanUp={cleanUpProp}
      />,
    );
    const expandButtons = screen.getAllByText("Expand");
    await user.click(expandButtons[0]);
    return view;
  }

  it("shows queue rows with reason chips and the as-of date", async () => {
    await renderCleanUpBoard();

    expect(screen.getByText("Overdue status as of")).toBeTruthy();
    expect(screen.getByText("Finish case study")).toBeTruthy();
    expect(screen.getByText("Overdue")).toBeTruthy();
    expect(screen.getAllByText("Scheduled in week").length).toBe(2);
    expect(screen.getByText("Due 10 Sep", { exact: false })).toBeTruthy();
  });

  it("distinguishes an empty queue from failed retrieval", async () => {
    await renderCleanUpBoard({
      ok: true,
      summary: { ...cleanUpSummary, items: [] },
    });
    expect(screen.getByText(/Nothing unresolved/)).toBeTruthy();

    cleanup();

    await renderCleanUpBoard({ ok: false, error: "The Life OS service could not be reached." });
    expect(screen.getByText(/could not be reached/)).toBeTruthy();
    expect(screen.getByText("Try again")).toBeTruthy();
  });

  it("shows the degraded banner when a source failed", async () => {
    await renderCleanUpBoard({
      ok: true,
      summary: {
        ...cleanUpSummary,
        statuses: [{ name: "Notion", ok: false, error: "network down" }],
      },
    });
    expect(screen.getByText(/Notion is unavailable/)).toBeTruthy();
  });

  it("completes a task with one done write and refreshes the queue", async () => {
    const user = userEvent.setup();
    await renderCleanUpBoard();

    const completeButtons = screen.getAllByText("Complete");
    await user.click(completeButtons[0]);

    expect(updateTaskAction).toHaveBeenCalledTimes(1);
    expect(updateTaskAction).toHaveBeenCalledWith("q1", { done: true });
  });

  it("reschedules via the dialog, sending only scheduled", async () => {
    const user = userEvent.setup();
    await renderCleanUpBoard();

    await user.click(screen.getAllByText("Reschedule")[0]);

    const dialog = screen.getByRole("dialog", { name: "Reschedule task" });
    expect(within(dialog).getByText(/Changes only Scheduled/)).toBeTruthy();

    const input = within(dialog).getByLabelText("Scheduled");
    fireEvent.change(input, { target: { value: "2026-09-29" } });
    await user.click(within(dialog).getByText("Save"));

    expect(updateTaskAction).toHaveBeenCalledWith("q1", { scheduled: "2026-09-29" });
  });

  it("cancelling reschedule performs no write", async () => {
    const user = userEvent.setup();
    await renderCleanUpBoard();

    await user.click(screen.getAllByText("Reschedule")[0]);
    const dialog = screen.getByRole("dialog", { name: "Reschedule task" });
    await user.click(within(dialog).getByText("Cancel"));

    expect(updateTaskAction).not.toHaveBeenCalled();
  });

  it("moves to backlog with a two-step confirm, clearing scheduled", async () => {
    const user = userEvent.setup();
    await renderCleanUpBoard();

    await user.click(screen.getAllByText("Move to backlog")[0]);
    expect(updateTaskAction).not.toHaveBeenCalled();

    expect(screen.getByText(/Clears Scheduled; keeps Due/)).toBeTruthy();
    await user.click(screen.getByText("Move to backlog", { selector: ".review-queue-confirm-yes" }));

    expect(updateTaskAction).toHaveBeenCalledWith("q1", { scheduled: null });
  });

  it("keeps the row and shows an error when an action fails", async () => {
    const user = userEvent.setup();
    updateTaskAction.mockResolvedValue({ ok: false, error: "Notion could not be reached." });
    await renderCleanUpBoard();

    await user.click(screen.getAllByText("Complete")[0]);

    expect(await screen.findByText("Notion could not be reached.")).toBeTruthy();
    expect(screen.getByText("Finish case study")).toBeTruthy();
  });

  it("disables actions on a completed review", async () => {
    const user = userEvent.setup();
    render(
      <ReviewBoard
        initialReview={completed}
        history={[]}
        cleanUp={{ ok: true, summary: cleanUpSummary }}
      />,
    );
    const expandButtons = screen.getAllByText("Expand");
    await user.click(expandButtons[0]);

    expect(screen.getByText("Finish case study")).toBeTruthy();
    expect(screen.queryByText("Complete")).toBeNull();
    expect(screen.queryByText("Reschedule")).toBeNull();
  });
});

describe("Direction stage", () => {
  const directionSummary: DirectionSummary = {
    week_start: "2026-09-14",
    captured_at: "2026-09-27T09:00:00+02:00",
    timezone: "Europe/Zurich",
    items: [
      {
        id: "g1",
        name: "Ship the app",
        status: "Active",
        status_available: true,
        projects: [
          { id: "project-1", name: "Life OS" },
          { id: "project-2", name: "Second project" },
        ],
      },
      {
        id: "g2",
        name: "Write thesis",
        status: "Active",
        status_available: true,
        projects: [],
      },
    ],
    statuses: [{ name: "Notion", ok: true, error: null }],
    warnings: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    fetchLookBackAction.mockResolvedValue({ ok: true, summary });
    createGoalAction.mockResolvedValue({ ok: true, goalId: "new-goal" });
    completeGoalAction.mockResolvedValue({ ok: true });
    createProjectAction.mockResolvedValue({ ok: true, projectId: "new-project" });
  });

  async function renderDirectionBoard(
    directionProp:
      | { ok: true; summary: typeof directionSummary }
      | { ok: false; error: string } = { ok: true, summary: directionSummary },
  ) {
    const user = userEvent.setup();
    render(
      <ReviewBoard
        initialReview={draft}
        history={[completed]}
        lookBack={{ ok: true, summary }}
        direction={directionProp}
      />,
    );
    // The Direction section starts collapsed; expand it (look-back starts
    // open, so Expand buttons are clean-up, direction, ahead in order).
    const expandButtons = screen.getAllByText("Expand");
    await user.click(expandButtons[1]);
    return user;
  }

  it("renders goal rows with status chips and project links", async () => {
    await renderDirectionBoard();

    expect(screen.getByText("Ship the app")).toBeTruthy();
    expect(screen.getByText("Write thesis")).toBeTruthy();
    expect(screen.getAllByText("Active").length).toBe(2);
    expect(screen.getByText("Life OS")).toBeTruthy();
    expect(screen.getByText("Second project")).toBeTruthy();
  });

  it("distinguishes zero goals from unavailable", async () => {
    await renderDirectionBoard({
      ok: true,
      summary: { ...directionSummary, items: [] },
    });
    expect(screen.getByText("No active goals right now.")).toBeTruthy();

    cleanup();

    await renderDirectionBoard({ ok: false, error: "The Life OS service could not be reached." });
    expect(screen.getByText(/could not be reached/)).toBeTruthy();
    expect(screen.getByText("Try again")).toBeTruthy();
  });

  it("keeps a goal without projects visible", async () => {
    await renderDirectionBoard();

    expect(screen.getByText("Write thesis")).toBeTruthy();
  });

  it("completes a goal with a status-only edit and no project or task calls", async () => {
    const user = await renderDirectionBoard();

    await user.click(screen.getAllByText("Complete Goal")[0]);
    expect(completeGoalAction).not.toHaveBeenCalled();

    expect(screen.getByText(/Sets the goal's status to Done/)).toBeTruthy();
    await user.click(screen.getByText("Complete goal", { selector: ".review-queue-confirm-yes" }));

    expect(completeGoalAction).toHaveBeenCalledTimes(1);
    expect(completeGoalAction).toHaveBeenCalledWith("g1");
    expect(updateTaskAction).not.toHaveBeenCalled();
    expect(createProjectAction).not.toHaveBeenCalled();
  });

  it("opens the Add Project form from a goal row", async () => {
    const user = await renderDirectionBoard();

    await user.click(screen.getAllByText("Add Project")[0]);

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/Linked to goal: Ship the app/)).toBeTruthy();
  });

  it("creates a project from the dialog with the goal prefill", async () => {
    const user = await renderDirectionBoard();

    await user.click(screen.getAllByText("Add Project")[0]);
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText("Name"), "New project");
    await user.click(within(dialog).getByText("Save"));

    await waitFor(() => {
      expect(createProjectAction).toHaveBeenCalled();
    });
    const [edits] = createProjectAction.mock.calls[0];
    expect(edits.name).toBe("New project");
    expect(edits.goal_id).toBe("g1");
  });

  it("opens Add Goal below the list, also at zero goals", async () => {
    const user = await renderDirectionBoard({
      ok: true,
      summary: { ...directionSummary, items: [] },
    });

    expect(screen.getByText("Has anything changed? Is your direction still right?")).toBeTruthy();
    await user.click(screen.getByText("Add Goal"));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText("Name")).toBeTruthy();
  });

  it("creates a goal from the dialog and refreshes the direction", async () => {
    const user = await renderDirectionBoard();

    await user.click(screen.getByText("Add Goal"));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText("Name"), "New goal");
    await user.click(within(dialog).getByText("Save"));

    await waitFor(() => {
      expect(createGoalAction).toHaveBeenCalled();
    });
    const [edits] = createGoalAction.mock.calls[0];
    expect(edits.name).toBe("New goal");
  });

  it("keeps the wins and reflection textareas through actions", async () => {
    const user = await renderDirectionBoard();

    const wins = screen.getByLabelText("Wins");
    await user.type(wins, "Direction held");
    await user.click(screen.getAllByText("Complete Goal")[0]);

    expect((screen.getByLabelText("Wins") as HTMLTextAreaElement).value).toBe("Direction held");
    expect(screen.getByLabelText("Reflection (optional)")).toBeTruthy();
  });

  it("shows the per-row error when the completion fails", async () => {
    const user = await renderDirectionBoard();
    completeGoalAction.mockResolvedValue({ ok: false, error: "Notion could not be reached." });

    await user.click(screen.getAllByText("Complete Goal")[0]);
    await user.click(screen.getByText("Complete goal", { selector: ".review-queue-confirm-yes" }));

    expect(await screen.findByText("Notion could not be reached.")).toBeTruthy();
    expect(screen.getByText("Ship the app")).toBeTruthy();
  });

  it("hides row actions and Add Goal on a completed review", async () => {
    const user = userEvent.setup();
    render(
      <ReviewBoard
        initialReview={completed}
        history={[]}
        lookBack={{ ok: true, summary }}
        direction={{ ok: true, summary: directionSummary }}
      />,
    );
    const expandButtons = screen.getAllByText("Expand");
    await user.click(expandButtons[1]);

    expect(screen.getByText("Ship the app")).toBeTruthy();
    expect(screen.queryByText("Complete Goal")).toBeNull();
    expect(screen.queryByText("Add Project")).toBeNull();
    expect(screen.queryByText("Add Goal")).toBeNull();
  });
});
