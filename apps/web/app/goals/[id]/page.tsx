import { connection } from "next/server";

import { fetchGoalDetail } from "../../goals-actions";
import { GoalDetailBoard } from "./goal-detail";

export const metadata = {
  title: "Goal · Life OS",
};

export default async function GoalPage({
  params,
}: PageProps<"/goals/[id]">) {
  await connection();

  const { id } = await params;
  const result = await fetchGoalDetail(id);

  if (!result.ok) {
    return (
      <div className="service-error-wrap">
        <section
          className="service-error"
          role="alert"
          aria-labelledby="goal-error-title"
        >
          <h1 id="goal-error-title">
            {result.error.kind === "not_found"
              ? "Goal not found"
              : "Goal is unavailable"}
          </h1>
          <p className="service-error-copy">{result.error.message}</p>
          <a className="retry-button weekly-retry-link" href={`/goals/${id}`}>
            Try again
          </a>
        </section>
      </div>
    );
  }

  return <GoalDetailBoard goal={result.goal} />;
}
