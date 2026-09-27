export default function FinanceLoading() {
  return (
    <div className="service-error-wrap">
      <section className="service-error" role="status" aria-live="polite" aria-busy="true">
        <h1>Loading your finance review…</h1>
        <p className="service-error-copy">
          Gathering YNAB actuals and the forecast. This can take a few seconds.
        </p>
      </section>
    </div>
  );
}
