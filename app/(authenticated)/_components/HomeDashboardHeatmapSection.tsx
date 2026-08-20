"use client";

// HomeDashboardHeatmapSection — client wrapper for ActivityHeatmap on the
// home dashboard. Routes to /?filter=<flow> on filter change so the Server
// Component parent can re-fetch heatmap data for the selected flow.
//
// Traceability:
//   specs/05-ui-shell-and-navigation/requirements.md R11.6 (office-only
//     heatmap widget, gated reporting.read, omitted entirely if missing).
//   specs/00-steering/brand-design-system.md §1.1a (filter pill accent).

import { useRouter } from "next/navigation";
import { ActivityHeatmap } from "@/components/analytics/ActivityHeatmap";
import type { FlowType } from "@/components/analytics/types";

type HeatmapPoint = { date: string; count: number };

export function HomeDashboardHeatmapSection({
  data,
  flowFilter,
}: {
  data: HeatmapPoint[];
  flowFilter: FlowType;
}) {
  const router = useRouter();

  function handleFilterChange(filter: FlowType) {
    router.push(`/?filter=${filter}`);
  }

  return (
    <ActivityHeatmap
      data={data}
      flowFilter={flowFilter}
      onFilterChange={handleFilterChange}
      title="Inventory Activity — Last 12 Weeks"
    />
  );
}
