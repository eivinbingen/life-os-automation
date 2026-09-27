import type { ReactNode } from "react";

import { WorkspaceSidebar } from "../sidebar";

export default function FinanceLayout({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <WorkspaceSidebar current="finance" />
      <main className="dashboard">{children}</main>
    </div>
  );
}
