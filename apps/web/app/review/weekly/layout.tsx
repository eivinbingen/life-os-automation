import type { ReactNode } from "react";

import { WorkspaceSidebar } from "../../sidebar";

export default function ReviewLayout({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <WorkspaceSidebar current="review" />

      <main className="dashboard">
        {children}
      </main>
    </div>
  );
}
