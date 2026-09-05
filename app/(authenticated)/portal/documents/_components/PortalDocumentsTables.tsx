"use client";

import { useState, useMemo } from "react";
import { Download, CheckCircle2, Package } from "lucide-react";
import { TablePagination } from "@/components/ui/TablePagination";

export type DocStatus = "pending" | "generating" | "ready" | "failed" | "voided";

export interface DocRow {
  id: string;
  docNumber: string;
  date: string;
  status: DocStatus;
}

const DOC_STATUS_CLASSES: Record<DocStatus, string> = {
  pending: "bg-status-pending/10 text-status-pending",
  generating: "bg-status-pending/10 text-status-pending",
  ready: "bg-status-available/10 text-status-available",
  failed: "bg-status-held/10 text-status-held",
  voided: "bg-status-neutral/10 text-status-neutral",
};

const DOC_STATUS_LABELS: Record<DocStatus, string> = {
  pending: "PENDING",
  generating: "GENERATING",
  ready: "READY",
  failed: "FAILED",
  voided: "VOIDED",
};

export function PickListsTab({ docs }: { docs: DocRow[] }) {
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  const totalCount = docs.length;
  const pageCount = Math.ceil(totalCount / pageSize) || 1;
  const pagedDocs = useMemo(() => {
    return docs.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);
  }, [docs, pageIndex, pageSize]);

  if (docs.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-outline-variant/30 bg-surface-white px-6 py-12 text-center shadow-elevation-1">
        <Package size={40} className="text-text-grey" aria-hidden="true" />
        <p className="font-body text-body-md text-text-grey">
          No pick lists yet.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-outline-variant/30 bg-surface-white shadow-elevation-1">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-outline-variant/30 bg-surface-light-grey">
              <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                Doc #
              </th>
              <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                Date
              </th>
              <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                Status
              </th>
              <th className="sr-only px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/30">
            {pagedDocs.map((doc) => (
              <tr key={doc.id} className="hover:bg-surface-light-grey/50">
                <td className="px-4 py-3 font-mono text-mono-md text-on-surface">
                  {doc.docNumber}
                </td>
                <td className="px-4 py-3 font-body text-body-md text-text-grey">
                  {doc.date}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 font-label text-label uppercase tracking-[0.05em] ${DOC_STATUS_CLASSES[doc.status]}`}
                  >
                    {DOC_STATUS_LABELS[doc.status]}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    disabled={doc.status !== "ready"}
                    className="inline-flex h-11 items-center gap-2 rounded border border-outline-variant/30 px-4 font-label text-label text-on-surface hover:bg-surface-light-grey focus:outline-none focus:ring-2 focus:ring-brand-navy motion-safe:transition-transform motion-safe:duration-100 motion-safe:active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Download size={16} aria-hidden="true" />
                    Download PDF
                  </button>
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
    </div>
  );
}

export function AcknowledgementReceiptsTab({ docs }: { docs: DocRow[] }) {
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  const totalCount = docs.length;
  const pageCount = Math.ceil(totalCount / pageSize) || 1;
  const pagedDocs = useMemo(() => {
    return docs.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);
  }, [docs, pageIndex, pageSize]);

  if (docs.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-outline-variant/30 bg-surface-white px-6 py-12 text-center shadow-elevation-1">
        <CheckCircle2
          size={40}
          className="text-text-grey"
          aria-hidden="true"
        />
        <p className="font-body text-body-md text-text-grey">
          No acknowledgement receipts yet.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* VMI reference disclaimer */}
      <div className="mb-4 rounded-xl border border-status-pending/30 bg-status-pending/10 px-4 py-3">
        <p className="font-body text-body-sm text-on-surface">
          <strong>VMI reference note:</strong> prices shown on VMI
          acknowledgement receipts are a per-release reference amount only
          and are not your final bill. Your actual VMI invoice is based on the
          period-average consumption rate — contact your account manager for
          billing statements.
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-outline-variant/30 bg-surface-white shadow-elevation-1">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-outline-variant/30 bg-surface-light-grey">
                <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                  Doc #
                </th>
                <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                  Date
                </th>
                <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                  Status
                </th>
                <th className="sr-only px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/30">
              {pagedDocs.map((doc) => (
                <tr key={doc.id} className="hover:bg-surface-light-grey/50">
                  <td className="px-4 py-3 font-mono text-mono-md text-on-surface">
                    {doc.docNumber}
                  </td>
                  <td className="px-4 py-3 font-body text-body-md text-text-grey">
                    {doc.date}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 font-label text-label uppercase tracking-[0.05em] ${DOC_STATUS_CLASSES[doc.status]}`}
                    >
                      {DOC_STATUS_LABELS[doc.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      disabled={doc.status !== "ready"}
                      className="inline-flex h-11 items-center gap-2 rounded border border-outline-variant/30 px-4 font-label text-label text-on-surface hover:bg-surface-light-grey focus:outline-none focus:ring-2 focus:ring-brand-navy motion-safe:transition-transform motion-safe:duration-100 motion-safe:active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Download size={16} aria-hidden="true" />
                      Download PDF
                    </button>
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
      </div>
    </div>
  );
}
