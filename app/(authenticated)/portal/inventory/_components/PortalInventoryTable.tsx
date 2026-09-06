"use client";

import { useState, useMemo } from "react";
import { Package } from "lucide-react";
import { TablePagination } from "@/components/ui/TablePagination";

export type LotStatus = "staged" | "available" | "quarantined" | "depleted" | "expired";

export interface InventoryRow {
  id: string;
  itemCode: string;
  itemName: string;
  lotNumber: string;
  location: string;
  qtyOnHand: number;
  status: LotStatus;
}

const STATUS_CLASSES: Record<LotStatus, string> = {
  staged: "bg-status-pending/10 text-status-pending",
  available: "bg-status-available/10 text-status-available",
  quarantined: "bg-status-held/10 text-status-held",
  depleted: "bg-status-neutral/10 text-status-neutral",
  expired: "bg-status-held/10 text-status-held",
};

const STATUS_LABELS: Record<LotStatus, string> = {
  staged: "STAGED",
  available: "AVAILABLE",
  quarantined: "QUARANTINED",
  depleted: "DEPLETED",
  expired: "EXPIRED",
};

interface PortalInventoryTableProps {
  rows: InventoryRow[];
}

export function PortalInventoryTable({ rows }: PortalInventoryTableProps) {
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  const totalCount = rows.length;
  const pageCount = Math.ceil(totalCount / pageSize) || 1;
  const pagedRows = useMemo(() => {
    return rows.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);
  }, [rows, pageIndex, pageSize]);

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
        <Package size={40} className="text-text-grey" aria-hidden="true" />
        <p className="font-body text-body-md text-text-grey">
          No inventory items found.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-outline-variant/30 bg-surface-light-grey">
              <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                Item Code
              </th>
              <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                Item Name
              </th>
              <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                Lot #
              </th>
              <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                Location
              </th>
              <th className="px-4 py-3 text-right font-label text-label uppercase tracking-[0.05em] text-text-grey">
                Qty on Hand
              </th>
              <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                Flow
              </th>
              <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/30">
            {pagedRows.map((row) => (
              <tr key={row.id} className="hover:bg-surface-light-grey/50">
                <td className="px-4 py-3 font-mono text-mono-md text-on-surface">
                  {row.itemCode}
                </td>
                <td className="px-4 py-3 font-body text-body-md text-on-surface">
                  {row.itemName}
                </td>
                <td className="px-4 py-3 font-mono text-mono-md text-on-surface">
                  {row.lotNumber}
                </td>
                <td className="px-4 py-3 font-mono text-mono-md text-on-surface">
                  {row.location}
                </td>
                <td className="px-4 py-3 text-right font-mono text-mono-md text-on-surface">
                  {row.qtyOnHand.toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center rounded-full bg-brand-royal-blue/10 px-2 py-0.5 font-label text-label uppercase tracking-[0.05em] text-brand-royal-blue">
                    VMI
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 font-label text-label uppercase tracking-[0.05em] ${STATUS_CLASSES[row.status]}`}
                  >
                    {STATUS_LABELS[row.status]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="p-4 border-t border-outline-variant/30">
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
    </>
  );
}
