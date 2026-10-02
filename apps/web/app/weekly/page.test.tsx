import { describe, expect, it, vi } from "vitest";

const redirect = vi.hoisted(() =>
  vi.fn(() => {
    // The real redirect aborts rendering by throwing; mirror that so the
    // page's call site is exercised end to end.
    throw new Error("NEXT_REDIRECT");
  }),
);
vi.mock("next/navigation", () => ({ redirect }));

import WeeklyPage from "./page";

describe("V1 weekly route", () => {
  it("redirects to the guided Weekly Review", () => {
    expect(() => WeeklyPage()).toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/review/weekly");
  });
});
