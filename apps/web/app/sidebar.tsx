import Link from "next/link";

type WorkspacePage = "today" | "review" | "finance" | "studies" | "projects" | "goals";

const NAV_ITEMS: { key: WorkspacePage; href: string; icon: string; label: string }[] = [
  { key: "today", href: "/", icon: "◈", label: "Today" },
  { key: "review", href: "/review/weekly", icon: "◉", label: "Weekly Review" },
  { key: "finance", href: "/finance", icon: "◎", label: "Finance" },
  { key: "studies", href: "/studies", icon: "✦", label: "Studies" },
];

const FOOTER_NOTES: Record<WorkspacePage, string> = {
  today: "Notion connected",
  review: "Guided weekly recalibration",
  finance: "Read-only finance review",
  studies: "Read-only studies overview",
  projects: "Project workspace",
  goals: "Goal workspace",
};

/** Shared workspace navigation; the current page renders as a non-link. */
export function WorkspaceSidebar({ current }: { current: WorkspacePage }) {
  return (
    <aside className="sidebar" aria-label="Workspace">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">L</span>
        <span className="brand-name">life<span>os</span></span>
      </div>
      <div className="sidebar-middle">
        <span className="sidebar-label">WORKSPACE</span>
        {NAV_ITEMS.map((item) =>
          item.key === current ? (
            <div key={item.key} className="nav-current" aria-current="page">
              <span className="nav-icon" aria-hidden="true">{item.icon}</span>
              {item.label}
            </div>
          ) : (
            <Link key={item.key} className="nav-link" href={item.href}>
              <span className="nav-icon" aria-hidden="true">{item.icon}</span>
              {item.label}
            </Link>
          ),
        )}
      </div>
      <div className="sidebar-footer">
        <span className="local-dot" aria-hidden="true" />
        <div>
          <strong>Local workspace</strong>
          <span>{FOOTER_NOTES[current]}</span>
        </div>
      </div>
    </aside>
  );
}
