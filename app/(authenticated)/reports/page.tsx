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
// Surface: Office. Capability gate: reporting.read or reporting.financial_read.
// Financial section gate: reporting.financial_read (supervisor/administrator only).
// Offline: all analytics are Tier 2 — online only, never cached.
// Aggregate queries MUST read lot_inventory_totals, never raw lot_location_balances.

import { BarChart2 } from "lucide-react";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { WarehouseReportsHub } from "@/components/reports/WarehouseReportsHub";
import { db } from "@/lib/db/client";
import { getDocumentTemplate } from "@/lib/documents/document-template";
import {
  getReportsExecutiveKpis,
  getVmiBillingReconciliationReport,
  getTradingMarginReport,
  getThroughputReport,
  getDeliveryPerformanceReport,
  getReportArchiveList,
  getWarehouseZonesList,
} from "@/lib/db/queries/reports";

const REPORT_QUERY_TIMEOUT_MS = 8_000;

async function withReportFallback<T>(
  query: Promise<T>,
): Promise<T | undefined> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<undefined>((resolve) => {
    timeoutId = setTimeout(() => resolve(undefined), REPORT_QUERY_TIMEOUT_MS);
  });

  try {
    return await Promise.race([query.catch(() => undefined), timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function loadReport<T>(loader: () => Promise<T>): Promise<T | undefined> {
  try {
    return await withReportFallback(loader());
  } catch {
    return undefined;
  }
}

export default async function ReportsPage() {
  const resolver = await createPageResolver();
  const permResult = await requirePermission(resolver, "reporting.read");
  const financialPerm = await requirePermission(resolver, "reporting.financial_read");
  const canReadReports =
    permResult.kind === "authorized" || financialPerm.kind === "authorized";

  if (!canReadReports) {
    return (
      <div className="mx-auto max-w-container px-8 py-12 text-center">
        <BarChart2 size={40} className="mx-auto mb-3 text-text-grey" aria-hidden="true" />
        <p className="font-body text-body-md text-text-grey">
          You do not have permission to view reports.
        </p>
        <p className="mt-2 font-body text-body-sm text-text-grey">
          This page requires the{" "}
          <span className="font-mono text-mono-md">reporting.read</span> or{" "}
          <span className="font-mono text-mono-md">reporting.financial_read</span>{" "}
          capability.
        </p>
      </div>
    );
  }

  const canReadFinancial = financialPerm.kind === "authorized";

  // Fetch live reports datasets in parallel
  const [
    kpis,
    vmiBillingRows,
    tradingMargin,
    throughput,
    deliverySla,
    archiveItems,
    availableZones,
    documentTemplate,
  ] = await Promise.all([
    loadReport(getReportsExecutiveKpis),
    canReadFinancial
      ? loadReport(getVmiBillingReconciliationReport)
      : Promise.resolve([]),
    canReadFinancial
      ? loadReport(getTradingMarginReport)
      : Promise.resolve(undefined),
    loadReport(() => getThroughputReport("daily")),
    loadReport(getDeliveryPerformanceReport),
    loadReport(getReportArchiveList),
    loadReport(getWarehouseZonesList),
    getDocumentTemplate(db),
  ]);

  return (
    <div className="mx-auto max-w-container px-4 py-4 sm:px-6 lg:px-8 lg:py-5">
      <WarehouseReportsHub
        kpis={kpis}
        vmiBillingRows={vmiBillingRows}
        tradingMargin={tradingMargin}
        throughput={throughput}
        deliverySla={deliverySla}
        archiveItems={archiveItems}
        availableZones={availableZones}
        canReadFinancial={canReadFinancial}
        documentTemplate={documentTemplate}
      />
    </div>
  );
}
