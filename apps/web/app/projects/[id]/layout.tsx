import type { ReactNode } from "react";

import { WorkspaceSidebar } from "../../sidebar";

export default function ProjectLayout({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <WorkspaceSidebar current="projects" />

      <main className="dashboard">
        {children}
      </main>
    </div>
  );
}
