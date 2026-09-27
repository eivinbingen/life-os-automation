import type { FinanceReview } from "../actions";
import { formatMonth } from "../date-utils";
import { MonthControls } from "./month-controls";

const MINUS = "−";
const ON_BUDGET_THRESHOLD = 0.005;

const amountFormatter = new Intl.NumberFormat("en-GB", {
  minimumFractionDigits: 2,
});

function formatAmount(value: number) {
  return `${amountFormatter.format(value)} NOK`;
}

function formatSignedAmount(value: number) {
  const sign = value > 0 ? "+" : MINUS;
  return `${sign}${amountFormatter.format(Math.abs(value))} NOK`;
}

/**
 * Positive means under budget, negative over. The sign, glyph, and label
 * all carry the direction, so color is only a reinforcement — the state
 * stays readable without it.
 */
function Difference({ value }: { value: number }) {
  if (Math.abs(value) < ON_BUDGET_THRESHOLD) {
    return <span className="finance-diff finance-diff-zero">On budget</span>;
  }
  const under = value > 0;
  return (
    <span className={`finance-diff ${under ? "finance-diff-under" : "finance-diff-over"}`}>
      <span className="finance-diff-glyph" aria-hidden="true">{under ? "▲" : "▼"}</span>
      <span className="finance-diff-amount">{formatSignedAmount(value)}</span>
      <span className="finance-diff-label">{under ? "under budget" : "over budget"}</span>
    </span>
  );
}

export function FinanceBoard({
  review,
  currentMonth,
}: {
  review: FinanceReview;
  currentMonth: string;
}) {
  const accountCount = review.accounts.length;
  const totalUnder = review.total_difference > 0;

  return (
    <div className="dashboard-content">
      <section className="intro" aria-labelledby="finance-title">
        <div>
          <p className="eyebrow"><span className="eyebrow-line" /> MONTHLY FINANCE</p>
          <h1 id="finance-title" className="week-title">
            {formatMonth(review.month)}
            <span className="title-period">.</span>
          </h1>
          <p className="intro-copy">
            Your forecast versus actual spending for the selected month.
          </p>
        </div>
        <div className="date-navigation">
          <MonthControls selectedMonth={review.month} currentMonth={currentMonth} />
        </div>
      </section>

      <div className="overview-strip" aria-label="Month at a glance">
        <div className="overview-item">
          <strong>{formatAmount(review.total_forecast)}</strong>
          <span>Forecast</span>
        </div>
        <div className="overview-item">
          <strong>{formatAmount(review.total_actual)}</strong>
          <span>Actual spending</span>
        </div>
        <div className="overview-item">
          <strong className={totalUnder ? "finance-diff-under" : "finance-diff-over"}>
            {formatSignedAmount(review.total_difference)}
          </strong>
          <span>{totalUnder ? "Under budget" : "Over budget"}</span>
        </div>
      </div>

      <section className="panel" aria-labelledby="finance-accounts-heading">
        <div className="panel-heading">
          <div>
            <span className="section-kicker">YNAB</span>
            <h2 id="finance-accounts-heading">Account balances</h2>
          </div>
          <span className="count-badge">
            {accountCount} {accountCount === 1 ? "account" : "accounts"}
          </span>
        </div>
        <ul className="finance-accounts">
          {review.accounts.map((account) => (
            <li className="finance-account" key={account.name}>
              <span className="finance-account-name">{account.name}</span>
              <span
                className={`finance-account-balance${
                  account.balance < 0 ? " finance-balance-negative" : ""
                }`}
              >
                {account.balance < 0 ? MINUS : ""}
                {formatAmount(Math.abs(account.balance))}
              </span>
              <span className="finance-account-type">{account.type}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel" aria-labelledby="finance-comparison-heading">
        <div className="panel-heading">
          <div>
            <span className="section-kicker">FORECAST VS ACTUAL</span>
            <h2 id="finance-comparison-heading">Spending by category</h2>
          </div>
        </div>
        <div className="finance-table-wrap">
          <table className="finance-table">
            <thead>
              <tr>
                <th scope="col">Category</th>
                <th scope="col">Forecast</th>
                <th scope="col">Actual</th>
                <th scope="col">Difference</th>
              </tr>
            </thead>
            <tbody>
              {review.categories.map((category) => (
                <tr key={category.label}>
                  <th scope="row">{category.label}</th>
                  <td>{formatAmount(category.forecast)}</td>
                  <td>{formatAmount(category.actual)}</td>
                  <td><Difference value={category.difference} /></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Total</th>
                <td>{formatAmount(review.total_forecast)}</td>
                <td>{formatAmount(review.total_actual)}</td>
                <td><Difference value={review.total_difference} /></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <footer className="dashboard-footer">
        <span>Life OS <span className="footer-separator">/</span> Finance</span>
        <span className="footer-status"><span className="footer-status-dot" />Read-only view</span>
      </footer>
    </div>
  );
}
