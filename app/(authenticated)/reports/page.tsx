// `/reports` — Reports & Financial Analytics Hub.
//
// Traceability:
//   specs/16-reporting-and-analytics/design.md (KPI cards FR-1.2, activity
//     heatmap FR-1.3, analytics domains FR-2 through FR-7)
//   specs/00-steering/brand-design-system.md §6 (office Level 1 elevation),
//     §2 (typography), §1.3 (status colors)
//   specs/00-steering/revision-log.md (2026-08-07: /reports owns KPI dashboard,
//     not /; 2026-08-07: reporting.financial_read added for supervisor + admin)
//
// Surface: Office. Capability gate: reporting.read.
// Financial section gate: reporting.financial_read (supervisor/administrator only).
// Offline: all analytics are Tier 2 — online only, never cached.
// Aggregate queries MUST read lot_inventory_totals, never raw lot_location_balances.

import { BarChart2 } from "lucide-react";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { WarehouseReportsHub } from "@/components/reports/WarehouseReportsHub";

export default async function ReportsPage() {
  const resolver = await createPageResolver();
  const permResult = await requirePermission(resolver, "reporting.read");

  if (permResult.kind !== "authorized") {
    return (
      <div className="mx-auto max-w-container px-8 py-12 text-center">
        <BarChart2 size={40} className="mx-auto mb-3 text-text-grey" aria-hidden="true" />
        <p className="font-body text-body-md text-text-grey">
          You do not have permission to view reports.
        </p>
        <p className="mt-2 font-body text-body-sm text-text-grey">
          This page requires the{" "}
          <span className="font-mono text-mono-md">reporting.read</span>{" "}
          capability.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-container px-4 sm:px-6 lg:px-8 py-6">
      <WarehouseReportsHub />
    </div>
  );
}
