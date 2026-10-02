import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AheadSummary,
  CleanUpSummary,
  DirectionSummary,
  HygieneItem,
  LookBackSummary,
  ReviewRecord,
} from "./review-actions";
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
const fetchCleanUpAction = vi.hoisted(() => vi.fn());
const fetchAheadAction = vi.hoisted(() => vi.fn());
const updateTaskAction = vi.hoisted(() => vi.fn());
const createTaskAction = vi.hoisted(() => vi.fn());
const fetchAssignableProjectsAction = vi.hoisted(() => vi.fn());
vi.mock("../../actions", () => ({
  updateTask: updateTaskAction,
  updateTaskDone: updateTaskAction,
  createTask: createTaskAction,
}));

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
  return {
    ...actual,
    createProject: createProjectAction,
    fetchAssignableProjects: fetchAssignableProjectsAction,
  };
});

vi.mock("./review-actions", async () => {
  const actual = await vi.importActual<typeof import("./review-actions")>("./review-actions");
  return {
    ...actual,
    saveReviewDraft,
    completeReview,
    fetchLookBack: fetchLookBackAction,
    fetchCleanUp: fetchCleanUpAction,
    fetchAhead: fetchAheadAction,
  };
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
    hygiene: [],
  };

  const hygieneItems: HygieneItem[] = [
    { id: "h1", name: "Book dentist", project_id: "project-cf", project_name: "Corporate Finance" },
    { id: "h2", name: "Outline talk", project_id: "project-x", project_name: null },
    { id: "h3", name: "Refactor notes", project_id: null, project_name: null },
  ];

  const assignableProjects = [
    { id: "project-cf", name: "Corporate Finance" },
    { id: "project-os", name: "Life OS" },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    fetchLookBackAction.mockResolvedValue({ ok: true, summary });
    updateTaskAction.mockResolvedValue({ ok: true });
    fetchCleanUpAction.mockResolvedValue({ ok: true, summary: cleanUpSummary });
    fetchAssignableProjectsAction.mockResolvedValue({ ok: true, projects: assignableProjects });
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

  it("renders the hygiene queue beneath unresolved work", async () => {
    await renderCleanUpBoard({ ok: true, summary: { ...cleanUpSummary, hygiene: hygieneItems } });

    expect(screen.getByText("System hygiene")).toBeTruthy();
    expect(screen.getByText(/Missing metadata alone is not an error/)).toBeTruthy();
    expect(screen.getAllByText("No time anchor").length).toBe(3);
    expect(screen.getAllByText("No scheduled or due date").length).toBe(3);
    expect(screen.getByText("Book dentist")).toBeTruthy();
  });

  it("distinguishes known, unknown, and missing projects on hygiene rows", async () => {
    await renderCleanUpBoard({ ok: true, summary: { ...cleanUpSummary, hygiene: hygieneItems } });

    // Known project: a link named by the project (also on the unresolved row).
    expect(screen.getAllByText("Corporate Finance").length).toBe(2);
    // Unknown: a set id whose name lookup failed.
    expect(screen.getByText("Project could not be loaded")).toBeTruthy();
    // Missing: no project at all, stated neutrally.
    expect(screen.getAllByText("No project").length).toBe(1);
  });

  it("separates an empty hygiene queue from a failed hygiene read", async () => {
    await renderCleanUpBoard({ ok: true, summary: { ...cleanUpSummary, hygiene: [] } });
    expect(screen.getByText("No floating tasks right now.")).toBeTruthy();

    cleanup();

    await renderCleanUpBoard({
      ok: true,
      summary: {
        ...cleanUpSummary,
        statuses: [
          { name: "Notion", ok: true, error: null },
          { name: "Notion hygiene", ok: false, error: "network down" },
        ],
      },
    });
    // The unresolved queue is intact; only the hygiene read failed.
    expect(screen.getByText("Finish case study")).toBeTruthy();
    expect(screen.getByText("The hygiene queue could not be read.")).toBeTruthy();
    expect(screen.getByText(/Notion hygiene is unavailable/)).toBeTruthy();
  });

  it("processes a hygiene task with only the changed fields and refetches", async () => {
    const user = userEvent.setup();
    await renderCleanUpBoard({ ok: true, summary: { ...cleanUpSummary, hygiene: hygieneItems } });

    // Three hygiene rows render three Process buttons; the first opens h1.
    await user.click(screen.getAllByText("Process")[0]);
    const dialog = screen.getByRole("dialog", { name: "Process task" });
    expect(within(dialog).getByText(/Fields left empty stay as they are/)).toBeTruthy();

    fireEvent.change(within(dialog).getByLabelText("Scheduled"), { target: { value: "2026-09-16" } });
    await waitFor(() => expect(screen.queryByText("Loading projects…")).toBeNull());
    await user.selectOptions(within(dialog).getByLabelText("Project"), "project-os");
    await user.click(within(dialog).getByText("Save"));

    expect(updateTaskAction).toHaveBeenCalledWith("h1", { scheduled: "2026-09-16", project_id: "project-os" });
    await waitFor(() => expect(fetchCleanUpAction).toHaveBeenCalledWith("2026-09-14"));
    expect(screen.queryByRole("dialog", { name: "Process task" })).toBeNull();
  });

  it("keeps the dialog open with entered values when processing fails", async () => {
    const user = userEvent.setup();
    updateTaskAction.mockResolvedValue({ ok: false, error: "Notion could not be reached." });
    await renderCleanUpBoard({ ok: true, summary: { ...cleanUpSummary, hygiene: hygieneItems } });

    // Three hygiene rows render three Process buttons; the first opens h1.
    await user.click(screen.getAllByText("Process")[0]);
    const dialog = screen.getByRole("dialog", { name: "Process task" });
    fireEvent.change(within(dialog).getByLabelText("Due"), { target: { value: "2026-09-24" } });
    await waitFor(() => expect(screen.queryByText("Loading projects…")).toBeNull());
    await user.click(within(dialog).getByText("Save"));

    expect(await screen.findByText("Notion could not be reached.")).toBeTruthy();
    expect(screen.getByRole("dialog", { name: "Process task" })).toBeTruthy();
    expect((within(dialog).getByLabelText("Due") as HTMLInputElement).value).toBe("2026-09-24");
  });

  it("closes without a write when nothing changed", async () => {
    const user = userEvent.setup();
    await renderCleanUpBoard({ ok: true, summary: { ...cleanUpSummary, hygiene: hygieneItems } });

    // Three hygiene rows render three Process buttons; the first opens h1.
    await user.click(screen.getAllByText("Process")[0]);
    const dialog = screen.getByRole("dialog", { name: "Process task" });
    await waitFor(() => expect(screen.queryByText("Loading projects…")).toBeNull());
    await user.click(within(dialog).getByText("Save"));

    expect(updateTaskAction).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "Process task" })).toBeNull();
  });

  it("cancelling processing performs no write", async () => {
    const user = userEvent.setup();
    await renderCleanUpBoard({ ok: true, summary: { ...cleanUpSummary, hygiene: hygieneItems } });

    // Three hygiene rows render three Process buttons; the first opens h1.
    await user.click(screen.getAllByText("Process")[0]);
    const dialog = screen.getByRole("dialog", { name: "Process task" });
    fireEvent.change(within(dialog).getByLabelText("Scheduled"), { target: { value: "2026-09-16" } });
    await user.click(within(dialog).getByText("Cancel"));

    expect(updateTaskAction).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "Process task" })).toBeNull();
  });

  it("hides hygiene controls on a completed review", async () => {
    const user = userEvent.setup();
    render(
      <ReviewBoard
        initialReview={completed}
        history={[]}
        cleanUp={{ ok: true, summary: { ...cleanUpSummary, hygiene: hygieneItems } }}
      />,
    );
    const expandButtons = screen.getAllByText("Expand");
    await user.click(expandButtons[0]);

    expect(screen.getByText("Book dentist")).toBeTruthy();
    expect(screen.queryByText("Process")).toBeNull();
  });

  it("distinguishes a failed projects read from a genuinely empty list", async () => {
    const user = userEvent.setup();
    // A failed read is not an empty list: the hint says so.
    fetchAssignableProjectsAction.mockResolvedValue({ ok: false, error: "network down" });
    await renderCleanUpBoard({ ok: true, summary: { ...cleanUpSummary, hygiene: [hygieneItems[2]] } });

    await user.click(screen.getByText("Process"));
    await waitFor(() => expect(screen.queryByText("Loading projects…")).toBeNull());
    expect(
      screen.getByText("Assignable projects could not be listed; the link can be set later."),
    ).toBeTruthy();

    cleanup();

    // Zero Active/Planned projects is success, not failure: a neutral
    // hint, never a false "could not be listed".
    fetchAssignableProjectsAction.mockResolvedValue({ ok: true, projects: [] });
    await renderCleanUpBoard({ ok: true, summary: { ...cleanUpSummary, hygiene: [hygieneItems[2]] } });

    await user.click(screen.getByText("Process"));
    await waitFor(() => expect(screen.queryByText("Loading projects…")).toBeNull());
    expect(screen.getByText("No Active or Planned projects right now.")).toBeTruthy();
    expect(screen.queryByText(/could not be listed/)).toBeNull();
  });

  it("lists assignable projects by name, not raw id", async () => {
    const user = userEvent.setup();
    await renderCleanUpBoard({ ok: true, summary: { ...cleanUpSummary, hygiene: [hygieneItems[2]] } });

    await user.click(screen.getByText("Process"));
    const dialog = screen.getByRole("dialog", { name: "Process task" });
    await waitFor(() => expect(screen.queryByText("Loading projects…")).toBeNull());
    expect(within(dialog).getByRole("option", { name: "Life OS" })).toBeTruthy();
    expect(within(dialog).queryByText("project-os")).toBeNull();
  });

  it("shares one in-flight projects read across rapid dialog reopens", async () => {
    const user = userEvent.setup();
    let resolveFetch: (value: { ok: true; projects: typeof assignableProjects }) => void = () => {};
    fetchAssignableProjectsAction.mockImplementation(
      () =>
        new Promise<{ ok: true; projects: typeof assignableProjects }>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    await renderCleanUpBoard({ ok: true, summary: { ...cleanUpSummary, hygiene: [hygieneItems[2]] } });

    await user.click(screen.getByText("Process"));
    await user.click(within(screen.getByRole("dialog", { name: "Process task" })).getByText("Cancel"));
    await user.click(screen.getByText("Process"));

    // The reopened dialog reuses the first request instead of stacking
    // a duplicate read behind the same wide timeout.
    expect(fetchAssignableProjectsAction).toHaveBeenCalledTimes(1);

    resolveFetch({ ok: true, projects: assignableProjects });
    expect(await screen.findByRole("option", { name: "Life OS" })).toBeTruthy();
  });

  it("retries a failed projects read on the next dialog open", async () => {
    const user = userEvent.setup();
    fetchAssignableProjectsAction.mockResolvedValueOnce({ ok: false, error: "network down" });
    await renderCleanUpBoard({ ok: true, summary: { ...cleanUpSummary, hygiene: [hygieneItems[2]] } });

    await user.click(screen.getByText("Process"));
    await waitFor(() => expect(screen.queryByText("Loading projects…")).toBeNull());
    expect(screen.getByText(/could not be listed/)).toBeTruthy();

    // The failed read is not pinned: reopening refetches and succeeds.
    await user.click(within(screen.getByRole("dialog", { name: "Process task" })).getByText("Cancel"));
    await user.click(screen.getByText("Process"));
    expect(await screen.findByRole("option", { name: "Life OS" })).toBeTruthy();
    expect(screen.queryByText(/could not be listed/)).toBeNull();
  });

  it("keeps the reschedule dialog open when Escape fires during a pending save", async () => {
    const user = userEvent.setup();
    // A save that never settles keeps the dialog pending.
    updateTaskAction.mockImplementation(() => new Promise(() => {}));
    await renderCleanUpBoard();

    await user.click(screen.getAllByText("Reschedule")[0]);
    const dialog = screen.getByRole("dialog", { name: "Reschedule task" });
    fireEvent.change(within(dialog).getByLabelText("Scheduled"), { target: { value: "2026-09-29" } });
    await user.click(within(dialog).getByText("Save"));

    fireEvent(dialog, new Event("cancel", { cancelable: true }));

    // The picked date is not lost to Escape while the write is in flight.
    expect(screen.getByRole("dialog", { name: "Reschedule task" })).toBeTruthy();
    expect((within(dialog).getByLabelText("Scheduled") as HTMLInputElement).value).toBe("2026-09-29");
  });

  it("keeps the dialog open when the browser fires a close event", async () => {
    // The unmount cleanup calls close(), which fires a close event; an
    // onClose handler on the dialog would turn that into an instant
    // unmount right after mount (twice over under StrictMode).
    const user = userEvent.setup();
    await renderCleanUpBoard({ ok: true, summary: { ...cleanUpSummary, hygiene: hygieneItems } });

    await user.click(screen.getAllByText("Process")[0]);
    const dialog = screen.getByRole("dialog", { name: "Process task" });
    fireEvent(dialog, new Event("close"));

    expect(screen.getByRole("dialog", { name: "Process task" })).toBeTruthy();
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

describe("Ahead stage", () => {
  const aheadSummary: AheadSummary = {
    week_start: "2026-09-14",
    week_end: "2026-09-20",
    ahead_start: "2026-09-21",
    ahead_end: "2026-09-27",
    timezone: "Europe/Zurich",
    captured_at: "2026-09-21T09:00:00+02:00",
    items: [
      {
        id: "event:e2:2026-09-22",
        kind: "event",
        day: "2026-09-22",
        name: "Conference",
        when: "2026-09-21T00:00:00+02:00",
        task_id: null,
        project_id: null,
        project_name: null,
        course_id: null,
        course_name: null,
        scheduled: null,
        due: null,
        event_id: "e2",
        start: "2026-09-21T00:00:00+02:00",
        end: "2026-09-23T00:00:00+02:00",
        all_day: true,
        continues: true,
      },
      {
        id: "event:e1:2026-09-22",
        kind: "event",
        day: "2026-09-22",
        name: "Team standup",
        when: "2026-09-22T09:00:00+02:00",
        task_id: null,
        project_id: null,
        project_name: null,
        course_id: null,
        course_name: null,
        scheduled: null,
        due: null,
        event_id: "e1",
        start: "2026-09-22T09:00:00+02:00",
        end: "2026-09-22T09:30:00+02:00",
        all_day: false,
        continues: false,
      },
      {
        id: "t1:scheduled",
        kind: "scheduled",
        day: "2026-09-22",
        name: "Prepare slides",
        when: "2026-09-22T14:00:00",
        task_id: "t1",
        project_id: "project-cf",
        project_name: "Corporate Finance",
        course_id: null,
        course_name: null,
        scheduled: "2026-09-22T14:00:00",
        due: "2026-09-24",
        event_id: null,
        start: null,
        end: null,
        all_day: false,
        continues: false,
      },
      {
        id: "t1:due",
        kind: "due",
        day: "2026-09-24",
        name: "Prepare slides",
        when: "2026-09-24",
        task_id: "t1",
        project_id: "project-cf",
        project_name: "Corporate Finance",
        course_id: null,
        course_name: null,
        scheduled: "2026-09-22T14:00:00",
        due: "2026-09-24",
        event_id: null,
        start: null,
        end: null,
        all_day: false,
        continues: false,
      },
      {
        id: "c1:exam",
        kind: "assessment",
        day: "2026-09-24",
        name: "Exam / Final Deadline",
        when: "2026-09-24",
        task_id: null,
        project_id: null,
        project_name: null,
        course_id: "c1",
        course_name: "Linear Algebra",
        scheduled: null,
        due: null,
        event_id: null,
        start: null,
        end: null,
        all_day: false,
        continues: false,
      },
    ],
    exceptions: [
      {
        task_id: "t2",
        name: "Submit essay",
        due: "2026-09-25",
        project_id: null,
        project_name: null,
      },
    ],
    statuses: [],
    warnings: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    saveReviewDraft.mockResolvedValue({ ok: true, review: draft });
    fetchAheadAction.mockResolvedValue({ ok: true, summary: aheadSummary });
    updateTaskAction.mockResolvedValue({ ok: true });
    createTaskAction.mockResolvedValue({ ok: true, name: "New task" });
  });

  async function renderAheadBoard(
    aheadProp:
      | { ok: true; summary: typeof aheadSummary }
      | { ok: false; error: string } = { ok: true, summary: aheadSummary },
  ) {
    const user = userEvent.setup();
    const view = render(
      <ReviewBoard
        initialReview={draft}
        history={[completed]}
        lookBack={{ ok: true, summary }}
        ahead={aheadProp}
      />,
    );
    // The Ahead section starts collapsed; expand it (look-back starts
    // open, so Expand buttons are clean-up, direction, ahead in order).
    const expandButtons = screen.getAllByText("Expand");
    await user.click(expandButtons[2]);
    return { user, container: view.container };
  }

  it("renders day groups with labeled rows in chronological order", async () => {
    const { container } = await renderAheadBoard();

    const groups = container.querySelectorAll(".ahead-day-group");
    expect(groups.length).toBe(2);
    expect(groups[0].textContent).toContain("22 September 2026");
    expect(groups[1].textContent).toContain("24 September 2026");

    // Within the first day: all-day, timed event, then the timed task.
    const firstDayRows = groups[0].querySelectorAll(".review-queue-name");
    expect(Array.from(firstDayRows).map((row) => row.textContent)).toEqual([
      "Conference",
      "Team standup",
      "Prepare slides",
    ]);
    expect(groups[0].textContent).toContain("09:00–09:30");
    // The second day holds both clearly labeled rows for the same task
    // plus the course assessment.
    expect(Array.from(groups[1].querySelectorAll(".review-queue-name")).map((row) => row.textContent)).toEqual([
      "Prepare slides",
      "Exam / Final Deadline",
    ]);

    expect(screen.getAllByText("Event").length).toBe(2);
    expect(screen.getAllByText("Scheduled").length).toBe(1);
    expect(screen.getAllByText("Due").length).toBe(1);
    expect(screen.getByText("Assessment")).toBeTruthy();
    expect(screen.getByText("Linear Algebra")).toBeTruthy();
  });

  it("preserves all-day and ongoing event semantics", async () => {
    await renderAheadBoard();

    expect(screen.getByText("All day")).toBeTruthy();
    expect(screen.getByText("Ongoing")).toBeTruthy();
  });

  it("labels a continued event with its remaining time, never a wrong same-day range", async () => {
    // Chronological order matters: the grouping walks items in sequence.
    const [conference, standup, slidesScheduled, slidesDue, exam] = aheadSummary.items;
    const nightShift = {
      // Started 23:00 the previous evening and ends 01:00 on this day; a
      // "23:00–01:00" range would read as a same-day slot that never exists.
      id: "event:e3:2026-09-23",
      kind: "event" as const,
      day: "2026-09-23",
      name: "Night shift",
      when: "2026-09-22T23:00:00+02:00",
      task_id: null,
      project_id: null,
      project_name: null,
      course_id: null,
      course_name: null,
      scheduled: null,
      due: null,
      event_id: "e3",
      start: "2026-09-22T23:00:00+02:00",
      end: "2026-09-23T01:00:00+02:00",
      all_day: false,
      continues: true,
    };
    const retreat = {
      // Spans several days; on a middle day only the end is worth labeling.
      id: "event:e4:2026-09-24",
      kind: "event" as const,
      day: "2026-09-24",
      name: "Team retreat",
      when: "2026-09-23T09:00:00+02:00",
      task_id: null,
      project_id: null,
      project_name: null,
      course_id: null,
      course_name: null,
      scheduled: null,
      due: null,
      event_id: "e4",
      start: "2026-09-23T09:00:00+02:00",
      end: "2026-09-25T17:00:00+02:00",
      all_day: false,
      continues: true,
    };
    await renderAheadBoard({
      ok: true,
      summary: {
        ...aheadSummary,
        items: [conference, standup, slidesScheduled, nightShift, slidesDue, retreat, exam],
      },
    });

    const nightShiftRow = screen.getByText("Night shift").closest(".review-queue-row");
    expect(nightShiftRow?.textContent).toContain("until 01:00");
    expect(nightShiftRow?.textContent).not.toContain("23:00–01:00");

    const retreatRow = screen.getByText("Team retreat").closest(".review-queue-row");
    expect(retreatRow?.textContent).toContain("until 25 Sept");
  });

  it("cross-references the other date on scheduled and due rows", async () => {
    const { container } = await renderAheadBoard();

    const groups = container.querySelectorAll(".ahead-day-group");
    expect(groups[0].textContent).toContain("Due 24 Sept");
    expect(groups[1].textContent).toContain("Scheduled 22 Sept · 14:00");
  });

  it("shows planning exceptions with the objective definition", async () => {
    await renderAheadBoard();

    expect(screen.getByText("Planning exceptions")).toBeTruthy();
    expect(screen.getByText(/Deadlines in the ahead week with no scheduled work date/)).toBeTruthy();
    expect(screen.getByText("Submit essay")).toBeTruthy();
    expect(screen.getByText("No scheduled date")).toBeTruthy();
    expect(screen.getByText("Due 25 Sept")).toBeTruthy();
  });

  it("distinguishes an empty timeline and empty exceptions from failure", async () => {
    await renderAheadBoard({
      ok: true,
      summary: {
        ...aheadSummary,
        items: [],
        exceptions: [],
        statuses: [],
      },
    });
    expect(screen.getByText(/Nothing scheduled, due, or on the calendar/)).toBeTruthy();
    expect(screen.getByText("No deadlines without scheduled work.")).toBeTruthy();

    cleanup();

    await renderAheadBoard({ ok: false, error: "The Life OS service could not be reached." });
    expect(screen.getByText(/could not be reached/)).toBeTruthy();
    expect(screen.getByText("Try again")).toBeTruthy();
  });

  it("names an unavailable source while keeping the timeline", async () => {
    await renderAheadBoard({
      ok: true,
      summary: {
        ...aheadSummary,
        statuses: [
          { name: "Studies", ok: false, error: "Studies context is not configured on this service." },
        ],
      },
    });

    expect(screen.getByText(/Studies is unavailable/)).toBeTruthy();
    expect(screen.getAllByText("Prepare slides").length).toBeGreaterThan(0);
    expect(screen.getByText("Team standup")).toBeTruthy();
  });

  it("keeps an unknown exceptions state when the task read failed", async () => {
    await renderAheadBoard({
      ok: true,
      summary: {
        ...aheadSummary,
        items: [],
        exceptions: [],
        statuses: [{ name: "Notion", ok: false, error: "notion down" }],
      },
    });

    expect(screen.getByText(/Notion is unavailable/)).toBeTruthy();
    // The exceptions queue is unknown, not known-empty.
    expect(screen.queryByText("No deadlines without scheduled work.")).toBeNull();
  });

  it("reschedules a task in place, keeping due, and refreshes the timeline", async () => {
    const { user } = await renderAheadBoard();

    await user.click(screen.getAllByText("Reschedule")[0]);
    const dialog = screen.getByRole("dialog", { name: "Reschedule task" });
    expect(within(dialog).getByText(/Changes only Scheduled/)).toBeTruthy();
    expect(within(dialog).getByText(/Due 24 Sept is kept/)).toBeTruthy();

    const input = within(dialog).getByLabelText("Scheduled");
    fireEvent.change(input, { target: { value: "2026-09-29" } });
    await user.click(within(dialog).getByText("Save"));

    expect(updateTaskAction).toHaveBeenCalledWith("t1", { scheduled: "2026-09-29" });
    await waitFor(() => {
      expect(fetchAheadAction).toHaveBeenCalledWith("2026-09-14");
    });
  });

  it("keeps the dialog and entered date when the reschedule fails", async () => {
    const { user } = await renderAheadBoard();
    updateTaskAction.mockResolvedValue({ ok: false, error: "Notion could not be reached." });

    await user.click(screen.getAllByText("Reschedule")[0]);
    const dialog = screen.getByRole("dialog", { name: "Reschedule task" });
    const input = within(dialog).getByLabelText("Scheduled");
    fireEvent.change(input, { target: { value: "2026-09-29" } });
    await user.click(within(dialog).getByText("Save"));

    // The task appears as two rows (scheduled and due), so the per-task error
    // is surfaced on both.
    expect((await screen.findAllByText("Notion could not be reached.")).length).toBeGreaterThan(0);
    expect((within(dialog).getByLabelText("Scheduled") as HTMLInputElement).value).toBe("2026-09-29");
  });

  it("reschedules from the planning exceptions row with an empty seed", async () => {
    const { user } = await renderAheadBoard();

    // Timeline rows come first; the exception row is last.
    await user.click(screen.getAllByText("Reschedule")[2]);
    const dialog = screen.getByRole("dialog", { name: "Reschedule task" });
    expect((within(dialog).getByLabelText("Scheduled") as HTMLInputElement).value).toBe("");

    const input = within(dialog).getByLabelText("Scheduled");
    fireEvent.change(input, { target: { value: "2026-09-23" } });
    await user.click(within(dialog).getByText("Save"));

    expect(updateTaskAction).toHaveBeenCalledWith("t2", { scheduled: "2026-09-23" });
  });

  it("adds a task seeded with the ahead start and refreshes the timeline", async () => {
    const { user } = await renderAheadBoard();

    await user.click(screen.getByText("+ Add task"));
    await user.type(screen.getByLabelText("Task name"), "Book dentist");
    await user.click(screen.getByRole("button", { name: "Add task" }));

    // Scheduled defaults to the ahead week's first day; Due stays empty.
    await waitFor(() => {
      expect(createTaskAction).toHaveBeenCalledWith("Book dentist", "2026-09-21", null);
    });
    await waitFor(() => {
      expect(fetchAheadAction).toHaveBeenCalledWith("2026-09-14");
    });
  });

  it("keeps the entered name and shows the error when adding fails", async () => {
    const { user } = await renderAheadBoard();
    createTaskAction.mockResolvedValue({ ok: false, error: "Notion could not be reached." });

    await user.click(screen.getByText("+ Add task"));
    await user.type(screen.getByLabelText("Task name"), "Book dentist");
    await user.click(screen.getByRole("button", { name: "Add task" }));

    expect(await screen.findByText("Notion could not be reached.")).toBeTruthy();
    expect((screen.getByLabelText("Task name") as HTMLInputElement).value).toBe("Book dentist");
  });

  it("clears a cancelled capture so reopening starts fresh", async () => {
    const { user } = await renderAheadBoard();

    await user.click(screen.getByText("+ Add task"));
    await user.type(screen.getByLabelText("Task name"), "Book dentist");
    fireEvent.change(screen.getByLabelText("Due"), { target: { value: "2026-09-25" } });
    await user.click(screen.getByText("Cancel"));

    // The form closes and nothing typed into the cancelled capture resurfaces.
    expect(screen.queryByLabelText("Task name")).toBeNull();

    await user.click(screen.getByText("+ Add task"));
    expect((screen.getByLabelText("Task name") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Due") as HTMLInputElement).value).toBe("");
    // Scheduled is reseeded with the ahead week's first day, not a stale draft.
    expect((screen.getByLabelText("Scheduled") as HTMLInputElement).value).toBe("2026-09-21");
  });

  it("completes a task from the timeline and refreshes", async () => {
    const { user } = await renderAheadBoard();

    await user.click(screen.getAllByText("Complete")[0]);

    await waitFor(() => {
      expect(updateTaskAction).toHaveBeenCalledWith("t1", { done: true });
    });
    await waitFor(() => {
      expect(fetchAheadAction).toHaveBeenCalledWith("2026-09-14");
    });
  });

  it("queues a refetch triggered while one is in flight instead of dropping it", async () => {
    // The refetch hangs until released, so the second completion lands while
    // the first refresh is still pending.
    let resolveFetch: (value: { ok: true; summary: AheadSummary }) => void = () => {};
    fetchAheadAction.mockImplementation(
      () =>
        new Promise<{ ok: true; summary: AheadSummary }>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const { user } = await renderAheadBoard();

    // Complete buttons in DOM order: the t1 timeline rows first, then the
    // t2 planning exception — two different tasks, so neither is blocked.
    await user.click(screen.getAllByText("Complete")[0]);
    await user.click(screen.getAllByText("Complete")[2]);

    // The first completion refetched; the second must not have started a
    // parallel fetch — it is queued behind the in-flight one.
    await waitFor(() => {
      expect(fetchAheadAction).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      resolveFetch({ ok: true, summary: aheadSummary });
    });

    // The queued follow-up now runs, so both completions are reflected.
    await waitFor(() => {
      expect(fetchAheadAction).toHaveBeenCalledTimes(2);
    });
  });

  it("hides reschedule actions on a completed review", async () => {
    const user = userEvent.setup();
    render(
      <ReviewBoard
        initialReview={completed}
        history={[]}
        ahead={{ ok: true, summary: aheadSummary }}
      />,
    );
    const expandButtons = screen.getAllByText("Expand");
    await user.click(expandButtons[2]);

    expect(screen.getAllByText("Prepare slides").length).toBeGreaterThan(0);
    expect(screen.queryByText("Reschedule")).toBeNull();
    expect(screen.queryByText("Complete")).toBeNull();
    expect(screen.queryByText("+ Add task")).toBeNull();
  });

  it("shows a neutral note for a completed review without live data", async () => {
    render(<ReviewBoard initialReview={completed} history={[]} ahead={null} />);
    const expandButtons = screen.getAllByText("Expand");
    await userEvent.setup().click(expandButtons[2]);

    expect(screen.getByText(/live ahead timeline is unavailable for completed reviews/)).toBeTruthy();
    expect(fetchAheadAction).not.toHaveBeenCalled();
  });

  it("retries a failed fetch without losing typed wins", async () => {
    const user = userEvent.setup();
    render(
      <ReviewBoard
        initialReview={draft}
        history={[]}
        ahead={{ ok: false, error: "The ahead timeline could not be loaded. Please try again." }}
      />,
    );
    const expandButtons = screen.getAllByText("Expand");
    await user.click(expandButtons[2]);

    const wins = screen.getByLabelText("Wins");
    await user.type(wins, "Typed before retry");
    await user.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => {
      expect(fetchAheadAction).toHaveBeenCalledWith("2026-09-14");
    });
    expect((screen.getByLabelText("Wins") as HTMLTextAreaElement).value).toBe("Typed before retry");
  });
});
