import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReviewRecord } from "./review-actions";
import { ReviewBoard } from "./review-board";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

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

vi.mock("./review-actions", async () => {
  const actual = await vi.importActual<typeof import("./review-actions")>("./review-actions");
  return { ...actual, saveReviewDraft, completeReview };
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
    expect(screen.getByLabelText("Review state").textContent).toContain("27 September 2026");
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
    expect(history?.textContent).toContain("7 September 2026");
    expect(history?.textContent).toContain("Completed reviews");
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
