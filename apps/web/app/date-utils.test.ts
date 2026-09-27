import { describe, expect, it } from "vitest";

import { defaultReviewWeek, shiftDay, startOfWeek } from "./date-utils";

describe("defaultReviewWeek", () => {
  it("targets the current week when today is Sunday", () => {
    // 2026-09-27 is a Sunday.
    expect(defaultReviewWeek("2026-09-27")).toBe("2026-09-21");
  });

  it("targets the previous completed week on any other day", () => {
    // 2026-09-28 is a Monday; 2026-10-03 a Saturday.
    expect(defaultReviewWeek("2026-09-28")).toBe("2026-09-21");
    expect(defaultReviewWeek("2026-10-03")).toBe("2026-09-21");
  });

  it("always returns a Monday", () => {
    for (const day of ["2026-09-23", "2026-09-26", "2026-09-27", "2026-12-31"]) {
      const week = defaultReviewWeek(day);
      expect(week).toBe(startOfWeek(week));
    }
  });

  it("handles year boundaries", () => {
    // 2027-01-03 is a Sunday; the current week spans the year boundary.
    expect(defaultReviewWeek("2027-01-03")).toBe("2026-12-28");
  });
});

describe("shiftDay", () => {
  it("shifts across week and month boundaries", () => {
    expect(shiftDay("2026-09-30", 2)).toBe("2026-10-02");
    expect(shiftDay("2026-09-21", -7)).toBe("2026-09-14");
  });
});
