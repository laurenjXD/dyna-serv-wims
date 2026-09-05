"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { ListChecks, FileText } from "lucide-react";
import { TablePagination } from "@/components/ui/TablePagination";

type OrderStatus = "allocated" | "picked" | "dispatched";

export interface OrderRow {
  id: string;
  pickListNumber: string;
  date: string;
  itemsCount: number;
  status: OrderStatus;
}

const STATUS_CLASSES: Record<OrderStatus, string> = {
  allocated: "bg-status-pending/10 text-status-pending",
  picked: "bg-status-pending/10 text-status-pending",
  dispatched: "bg-status-available/10 text-status-available",
};

const STATUS_LABELS: Record<OrderStatus, string> = {
  allocated: "ALLOCATED",
  picked: "PICKED",
  dispatched: "DISPATCHED",
};

interface PortalOrdersTableProps {
  orders: OrderRow[];
}

export function PortalOrdersTable({ orders }: PortalOrdersTableProps) {
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  const totalCount = orders.length;
  const pageCount = Math.ceil(totalCount / pageSize) || 1;
  const pagedOrders = useMemo(() => {
    return orders.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);
  }, [orders, pageIndex, pageSize]);

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
        <ListChecks size={40} className="text-text-grey" aria-hidden="true" />
        <p className="font-body text-body-md text-text-grey">No orders found.</p>
        <p className="font-body text-body-sm text-text-grey">
          Orders appear here once pick lists have been committed for your account.
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
                Pick List #
              </th>
              <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                Date
              </th>
              <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                Items
              </th>
              <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                Status
              </th>
              <th className="sr-only px-4 py-3">Documents</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/30">
            {pagedOrders.map((order) => (
              <tr key={order.id} className="hover:bg-surface-light-grey/50">
                <td className="px-4 py-3 font-mono text-mono-md text-on-surface">
                  {order.pickListNumber}
                </td>
                <td className="px-4 py-3 font-body text-body-md text-text-grey">
                  {order.date}
                </td>
                <td className="px-4 py-3 font-mono text-mono-md text-on-surface">
                  {order.itemsCount}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 font-label text-label uppercase tracking-[0.05em] ${STATUS_CLASSES[order.status]}`}
                  >
                    {STATUS_LABELS[order.status]}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  {order.status === "dispatched" ? (
                    <Link
                      href="/portal/documents"
                      className="inline-flex h-11 items-center gap-2 rounded border border-outline-variant/30 px-4 font-label text-label text-on-surface hover:bg-surface-light-grey focus:outline-none focus:ring-2 focus:ring-brand-navy motion-safe:transition-transform motion-safe:duration-100 motion-safe:active:scale-[0.97]"
                    >
                      <FileText size={16} aria-hidden="true" />
                      Documents
                    </Link>
                  ) : (
                    <span className="font-body text-body-sm text-text-grey">—</span>
                  )}
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
