import type { ReactNode } from "react";

import { WorkspaceSidebar } from "../sidebar";

export default function StudiesLayout({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <WorkspaceSidebar current="studies" />

      <main className="dashboard">
        {children}
      </main>
    </div>
  );
}
