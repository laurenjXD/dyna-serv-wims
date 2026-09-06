"use client";

// Presentational Inspection tab body — the merged transfer + inspection
// work queue for the Master Inventory hub.
//
// Traceability:
//   specs/11-transfer-and-inspection/requirements.md
//     Terminology Alignment §12 — "Inspection" replaces "Daily Inspection"
//       in UI labels.
//     R2.2 — Daily Inspection is initiated directly from the Stock View
//       (/inventory) dashboard.
//     R2.3 — the merged queue displays candidate transfer/inspection rows
//       with status; each row's type is distinguished by text (not color
//       alone), matching the pattern already used in
//       app/(authenticated)/inspection/page.tsx,
//       app/(authenticated)/transfers/[transferId]/execute/page.tsx, and
//       app/(authenticated)/receiving/[wrrId]/receive/page.tsx.
//   lib/db/queries/transfers.ts `listInspectionAndTransferQueue` — row shape
//     `{ id, type: "transfer" | "inspection", title, status, createdAt, href }`.
//
// Purely presentational — no data fetching here. `page.tsx` performs the
// includeTransfers/includeInspections capability gating and calls
// listInspectionAndTransferQueue before handing rows to this component.
//
// Surface: Office — desktop-first, secondary mobile support.

import { useState, useMemo } from "react";
import Link from "next/link";
import { ArrowLeftRight, FlaskConical } from "lucide-react";
import type { InspectionAndTransferQueueRow } from "@/lib/db/queries/transfers";
import { TablePagination } from "@/components/ui/TablePagination";

const TYPE_BADGE: Record<InspectionAndTransferQueueRow["type"], { label: string; icon: typeof ArrowLeftRight; classes: string }> = {
  transfer: {
    label: "Transfer",
    icon: ArrowLeftRight,
    classes: "bg-brand-navy/10 text-brand-navy",
  },
  inspection: {
    label: "Inspection",
    icon: FlaskConical,
    classes: "bg-status-pending/10 text-status-pending",
  },
};

const STATUS_CLASSES: Record<string, string> = {
  open: "bg-status-pending/10 text-status-pending",
  pending: "bg-status-pending/10 text-status-pending",
  resolved: "bg-status-available/10 text-status-available",
  completed: "bg-status-available/10 text-status-available",
};

export function InspectionTab({ rows }: { rows: InspectionAndTransferQueueRow[] }) {
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  const totalCount = rows.length;
  const pageCount = Math.ceil(totalCount / pageSize) || 1;
  const pagedRows = useMemo(() => {
    return rows.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);
  }, [rows, pageIndex, pageSize]);

  if (rows.length === 0) {
    return (
      <div className="mt-6 rounded-xl border border-outline-variant/30 bg-surface-white px-6 py-12 text-center shadow-elevation-1">
        <p className="font-body text-body-md text-text-grey">
          No open transfer or inspection items.
        </p>
        <p className="mt-2 font-body text-body-sm text-text-grey">
          Items appear here when a transfer is requested or a lot is placed on Hold.
        </p>
      </div>
    );
  }

  return (
    <div
      data-testid="inspection-transfer-queue"
      className="mt-6 overflow-hidden rounded-xl border border-outline-variant/30 bg-surface-white shadow-elevation-1"
    >
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-outline-variant/30 bg-surface-light-grey">
              <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">Type</th>
              <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">Item</th>
              <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">Status</th>
              <th className="sr-only px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/30">
            {pagedRows.map((row) => {
              const badge = TYPE_BADGE[row.type];
              const Icon = badge.icon;
              // A row's title already spells out its type in plain text for
              // some sources (e.g. listInspectionAndTransferQueue always
              // titles transfer rows "Transfer {from} → {to}") — in that
              // case the badge conveys the distinction via icon shape +
              // aria-label (still non-color-only, screen-reader accessible)
              // rather than duplicating the same visible word. When the
              // title does not already say it (e.g. inspection rows, titled
              // by item/lot), the badge renders the type as visible text.
              const titleAlreadySaysType = row.title.toLowerCase().includes(row.type);
              return (
                <tr key={row.id} className="hover:bg-surface-light-grey/50">
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-label text-label uppercase ${badge.classes}`}
                      {...(titleAlreadySaysType ? { "aria-label": badge.label } : {})}
                    >
                      <Icon size={14} aria-hidden="true" />
                      {!titleAlreadySaysType && badge.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-body text-body-md text-on-surface">
                    <Link
                      href={row.href}
                      className="font-body text-body-md text-brand-navy underline hover:text-brand-royal-blue focus:outline-none focus:ring-2 focus:ring-brand-navy"
                    >
                      {row.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 font-label text-label uppercase ${STATUS_CLASSES[row.status] ?? "bg-status-neutral/10 text-status-neutral"}`}
                    >
                      {row.status.toUpperCase()}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <TablePagination
        pageIndex={pageIndex}
        pageSize={pageSize}
        totalCount={totalCount}
        pageCount={pageCount}
        canPreviousPage={pageIndex > 0}
        canNextPage={pageIndex < pageCount - 1}
        onPageChange={(newPageIndex) => setPageIndex(newPageIndex)}
        onPageSizeChange={(newPageSize) => {
          setPageSize(newPageSize);
          setPageIndex(0);
        }}
        pageSizeOptions={[5, 10, 20, 50]}
      />
    </div>
  );
}
