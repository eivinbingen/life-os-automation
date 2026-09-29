export default function GoalLoading() {
  return (
    <div className="service-error-wrap">
      <section className="service-error" role="status" aria-live="polite" aria-busy="true">
        <h1>Loading goal…</h1>
        <p className="service-error-copy">Fetching the goal and its projects. This can take a few seconds.</p>
      </section>
    </div>
  );
}
