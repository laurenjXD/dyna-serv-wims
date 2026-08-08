import type { ReactNode } from "react";

export function KpiCardGroup({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-gutter md:grid-cols-2 lg:grid-cols-3">{children}</div>;
}
