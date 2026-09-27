import Link from "next/link";
import type { ReactNode } from "react";

export default function WeeklyLayout({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Workspace">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">L</span>
          <span className="brand-name">life<span>os</span></span>
        </div>
        <div className="sidebar-middle">
          <span className="sidebar-label">WORKSPACE</span>
          <Link className="nav-link" href="/">
            <span className="nav-icon" aria-hidden="true">◈</span>
            Today
          </Link>
          <div className="nav-current" aria-current="page">
            <span className="nav-icon" aria-hidden="true">▦</span>
            Weekly Review
          </div>
        </div>
        <div className="sidebar-footer">
          <span className="local-dot" aria-hidden="true" />
          <div>
            <strong>Local workspace</strong>
            <span>Read-only weekly overview</span>
          </div>
        </div>
      </aside>

      <main className="dashboard">
        {children}
      </main>
    </div>
  );
}
