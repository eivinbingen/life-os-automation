import { connection } from "next/server";

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
  const result = await fetchProjectDetail(id);

  if (!result.ok) {
    const notFound = result.error.includes("could not be found");
    return (
      <div className="service-error-wrap">
        <section
          className="service-error"
          role="alert"
          aria-labelledby="project-error-title"
        >
          <h1 id="project-error-title">
            {notFound ? "Project not found" : "Project is unavailable"}
          </h1>
          <p className="service-error-copy">{result.error}</p>
          <a className="retry-button weekly-retry-link" href={`/projects/${id}`}>
            Try again
          </a>
        </section>
      </div>
    );
  }

  return <ProjectDetailBoard project={result.project} />;
}
