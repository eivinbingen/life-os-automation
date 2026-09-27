import { connection } from "next/server";

import { refreshFinance } from "../actions";
import { formatMonth, getLocalDay, isValidDay, startOfMonth } from "../date-utils";
import { FinanceBoard } from "./finance-board";

export const metadata = {
  title: "Finance · Life OS",
};

export default async function FinancePage({
  searchParams,
}: PageProps<"/finance">) {
  await connection();
  const requestedMonth = (await searchParams).month;
  const monthCandidate = typeof requestedMonth === "string" ? requestedMonth : undefined;
  const localDay = getLocalDay();
  const currentMonth = startOfMonth(localDay);
  const selectedMonth = startOfMonth(isValidDay(monthCandidate) ? monthCandidate : localDay);

  const result = await refreshFinance(selectedMonth);

  return (
    <>
      <header className="topbar">
        <span className="topbar-label">YOUR MONEY AT A GLANCE</span>
        <time dateTime={selectedMonth}>{formatMonth(selectedMonth)}</time>
      </header>
      {result.ok ? (
        <FinanceBoard key={result.review.month} review={result.review} currentMonth={currentMonth} />
      ) : (
        <div className="service-error-wrap">
          <section className="service-error" role="alert" aria-labelledby="finance-error-title">
            <h1 id="finance-error-title">Finance review is unavailable</h1>
            <p className="service-error-copy">{result.error}</p>
            <p>
              Requested month <time dateTime={selectedMonth}>{formatMonth(selectedMonth)}</time>
            </p>
            <a className="retry-button weekly-retry-link" href={`/finance?month=${selectedMonth}`}>
              Try again
            </a>
          </section>
        </div>
      )}
    </>
  );
}
