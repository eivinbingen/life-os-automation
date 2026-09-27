export default function StudiesLoading() {
  return (
    <div className="service-error-wrap">
      <section className="service-error" role="status" aria-live="polite" aria-busy="true">
        <h1>Loading your studies…</h1>
        <p className="service-error-copy">Fetching your courses and upcoming work. This can take a few seconds.</p>
      </section>
    </div>
  );
}
