export default function ReviewLoading() {
  return (
    <div className="service-error-wrap">
      <section className="service-error" role="status" aria-live="polite" aria-busy="true">
        <h1>Loading your review…</h1>
        <p className="service-error-copy">Fetching your weekly review. This can take a few seconds.</p>
      </section>
    </div>
  );
}
