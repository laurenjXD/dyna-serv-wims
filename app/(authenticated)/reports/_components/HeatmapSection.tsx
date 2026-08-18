"use client";

// HeatmapSection — client wrapper for ActivityHeatmap that routes to a new
// URL on filter change, allowing the Server Component parent to re-fetch
// the heatmap data for the selected flow.
//
// Traceability:
//   specs/16-reporting-and-analytics/design.md §4 ActivityHeatmap component
//   specs/00-steering/brand-design-system.md §1.1a (accent colors for filter pills)

import { useRouter } from "next/navigation";
import { ActivityHeatmap } from "@/components/analytics/ActivityHeatmap";
import type { FlowType } from "@/components/analytics/types";

type HeatmapPoint = { date: string; count: number };

type Props = {
  data: HeatmapPoint[];
  flowFilter: FlowType;
};

export function HeatmapSection({ data, flowFilter }: Props) {
  const router = useRouter();

  function handleFilterChange(filter: FlowType) {
    router.push(`/reports?filter=${filter}`);
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
