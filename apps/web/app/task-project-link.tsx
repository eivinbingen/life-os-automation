import Link from "next/link";

/**
 * The project reference on a task row. Outside the review it is plain
 * client-side navigation; from the Weekly Review it opens in a new tab so
 * the board stays mounted and unsaved reflection text survives.
 */
export function TaskProjectLink({
  projectId,
  projectName,
  openInNewTab = false,
}: {
  projectId: string | null;
  projectName: string;
  openInNewTab?: boolean;
}) {
  if (!projectId) return <>{projectName}</>;
  if (openInNewTab) {
    return (
      <a
        className="task-project-link"
        href={`/projects/${projectId}`}
        target="_blank"
        rel="noreferrer"
      >
        {projectName}
      </a>
    );
  }
  return (
    <Link className="task-project-link" href={`/projects/${projectId}`}>
      {projectName}
    </Link>
  );
}
