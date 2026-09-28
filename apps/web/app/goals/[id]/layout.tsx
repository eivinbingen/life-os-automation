import type { ReactNode } from "react";

import { WorkspaceSidebar } from "../../sidebar";

export default function GoalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <WorkspaceSidebar current="goals" />

      <main className="dashboard">
        {children}
      </main>
    </div>
  );
}
