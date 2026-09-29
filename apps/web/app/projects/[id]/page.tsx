import { connection } from "next/server";

import { fetchActiveGoals } from "../../goals-actions";
import { fetchProjectDetail } from "../../projects-actions";
import { ProjectDetailBoard } from "./project-detail";

export const metadata = {
  title: "Project · Life OS",
};

export default async function ProjectPage({
  params,
}: PageProps<"/projects/[id]">) {
  await connection();

  const { id } = await params;
  const [result, goalOptions] = await Promise.all([
    fetchProjectDetail(id),
    fetchActiveGoals(),
  ]);

  if (!result.ok) {
    return (
      <div className="service-error-wrap">
        <section
          className="service-error"
          role="alert"
          aria-labelledby="project-error-title"
        >
          <h1 id="project-error-title">
            {result.error.kind === "not_found"
              ? "Project not found"
              : "Project is unavailable"}
          </h1>
          <p className="service-error-copy">{result.error.message}</p>
          <a className="retry-button weekly-retry-link" href={`/projects/${id}`}>
            Try again
          </a>
        </section>
      </div>
    );
  }

  return <ProjectDetailBoard project={result.project} goalOptions={goalOptions} />;
}
