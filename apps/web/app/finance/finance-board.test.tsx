import { render, screen, within, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { FinanceReview } from "../actions";
import { refreshFinance } from "../actions";
import { getLocalDay, startOfMonth } from "../date-utils";
import { FinanceBoard } from "./finance-board";
import FinancePage from "./page";

vi.mock("next/server", () => ({ connection: vi.fn() }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

const review: FinanceReview = {
  month: "2026-09-01",
  accounts: [
    { name: "Brukskonto Eivin", balance: 15753.54, type: "checking" },
    { name: "Eivin kredittkort", balance: -3657.32, type: "creditCard" },
  ],
  categories: [
    { label: "shared fixed contribution", forecast: 9000, actual: 8252.03, difference: 747.97 },
    { label: "personal everyday spending", forecast: 9400, actual: 16773.91, difference: -7373.91 },
    { label: "zürich housing", forecast: 0, actual: 0, difference: 0 },
  ],
  total_forecast: 18400,
  total_actual: 27132.43,
  total_difference: -8732.43,
};

function rowByLabel(label: string) {
  return screen.getByRole("row", { name: new RegExp(label) });
}

it("distinguishes under, over, and on-budget differences without relying on color", () => {
  render(<FinanceBoard review={review} currentMonth="2026-09-01" />);

  expect(within(rowByLabel("shared fixed contribution")).getByText("▲")).toBeTruthy();
  expect(within(rowByLabel("shared fixed contribution")).getByText("under budget")).toBeTruthy();
  expect(within(rowByLabel("shared fixed contribution")).getByText("+747.97 NOK")).toBeTruthy();

  expect(within(rowByLabel("personal everyday spending")).getByText("▼")).toBeTruthy();
  expect(within(rowByLabel("personal everyday spending")).getByText("over budget")).toBeTruthy();
  expect(within(rowByLabel("personal everyday spending")).getByText("−7,373.91 NOK")).toBeTruthy();

  expect(within(rowByLabel("zürich housing")).getByText("On budget")).toBeTruthy();
});

it("shows every account balance and keeps negative balances visible", () => {
  render(<FinanceBoard review={review} currentMonth="2026-09-01" />);

  const accounts = screen.getByRole("list");
  expect(within(accounts).getByText("Brukskonto Eivin")).toBeTruthy();
  expect(within(accounts).getByText("15,753.54 NOK")).toBeTruthy();
  expect(within(accounts).getByText("Eivin kredittkort")).toBeTruthy();
  expect(within(accounts).getByText("−3,657.32 NOK")).toBeTruthy();
});

it("renders forecast, actual, and total difference amounts", () => {
  render(<FinanceBoard review={review} currentMonth="2026-09-01" />);

  const summary = screen.getByLabelText("Month at a glance");
  expect(within(summary).getByText("18,400.00 NOK")).toBeTruthy();
  expect(within(summary).getByText("27,132.43 NOK")).toBeTruthy();
  expect(within(summary).getByText("Over budget")).toBeTruthy();

  const totalRow = screen.getByRole("row", { name: /^Total/ });
  expect(within(totalRow).getByText("−8,732.43 NOK")).toBeTruthy();
});

it("labels an exactly-zero total as on budget without a sign", () => {
  const balanced: FinanceReview = {
    ...review,
    total_actual: review.total_forecast,
    total_difference: 0,
  };
  render(<FinanceBoard review={balanced} currentMonth="2026-09-01" />);

  const summary = screen.getByLabelText("Month at a glance");
  expect(within(summary).getByText("On budget")).toBeTruthy();
  expect(within(summary).queryByText("−0.00 NOK")).toBeNull();
  expect(within(summary).queryByText("+0.00 NOK")).toBeNull();
});

it("keeps the requested month and retry when the service fails", async () => {
  vi.stubEnv("LIFE_OS_API_URL", "http://fake.invalid");
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  render(await FinancePage({
    params: Promise.resolve({}),
    searchParams: Promise.resolve({ month: "2026-09-01" }),
  }));

  const alert = screen.getByRole("alert");
  expect(within(alert).getByRole("link", { name: "Try again" }).getAttribute("href")).toBe("/finance?month=2026-09-01");
  expect(within(alert).getByText(/Requested month/)).toBeTruthy();
  expect(within(alert).getByText("September 2026")).toBeTruthy();
});

it("surfaces the backend's source-specific failure detail", async () => {
  vi.stubEnv("LIFE_OS_API_URL", "http://fake.invalid");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: false,
    json: async () => ({ detail: "YNAB is unavailable: YNAB request failed: 401" }),
  }));
  render(await FinancePage({
    params: Promise.resolve({}),
    searchParams: Promise.resolve({ month: "2026-09-01" }),
  }));

  expect(screen.getByRole("alert").textContent).toContain("YNAB is unavailable");
});

it("falls back to the current month for an invalid month parameter", async () => {
  vi.stubEnv("LIFE_OS_API_URL", "http://fake.invalid");
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => review });
  vi.stubGlobal("fetch", fetcher);
  render(await FinancePage({
    params: Promise.resolve({}),
    searchParams: Promise.resolve({ month: "september" }),
  }));

  const currentMonth = startOfMonth(getLocalDay());
  expect(screen.queryByRole("alert")).toBeNull();
  expect(fetcher.mock.calls[0][0]).toContain(`month=${encodeURIComponent(currentMonth)}`);
});

it("normalizes a mid-month date to the first of the month", async () => {
  vi.stubEnv("LIFE_OS_API_URL", "http://fake.invalid");
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => review });
  vi.stubGlobal("fetch", fetcher);
  render(await FinancePage({
    params: Promise.resolve({}),
    searchParams: Promise.resolve({ month: "2026-09-17" }),
  }));

  expect(fetcher.mock.calls[0][0]).toContain("month=2026-09-01");
});

it("does not leak internal error details on an unreachable backend", async () => {
  vi.stubEnv("LIFE_OS_API_URL", "http://fake.invalid");
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("private details")));
  render(await FinancePage({
    params: Promise.resolve({}),
    searchParams: Promise.resolve({ month: "2026-09-01" }),
  }));

  expect(screen.getByRole("alert").textContent).not.toContain("private details");
});

it("rejects a missing API configuration before fetching", async () => {
  vi.stubEnv("LIFE_OS_API_URL", "");
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const result = await refreshFinance("2026-09-01");

  expect(result.ok).toBe(false);
  expect(fetcher).not.toHaveBeenCalled();
});
