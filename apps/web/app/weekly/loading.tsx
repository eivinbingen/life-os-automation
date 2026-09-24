export default function WeeklyLoading() {
  return (
    <div className="service-error-wrap">
      <section className="service-error" role="status" aria-live="polite" aria-busy="true">
        <h1>Loading your week…</h1>
        <p className="service-error-copy">Gathering Calendar commitments and tasks. This can take a few seconds.</p>
      </section>
    </div>
  );
}
