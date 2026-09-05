"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { FileText, Eye, ExternalLink, Paperclip, Download } from "lucide-react";
import type { CiplArchiveRow } from "@/lib/db/queries/documents";
import { DocumentPreviewModal, type PreviewDocData } from "./DocumentPreviewModal";
import { TablePagination } from "@/components/ui/TablePagination";

interface CiplDocumentsTableProps {
  rows: CiplArchiveRow[];
}

const CIPL_STATUS_CLASSES: Record<string, string> = {
  staged_pending_arrival: "bg-status-pending/10 text-status-pending",
  receiving_in_progress: "bg-status-pending/10 text-status-pending",
  completed: "bg-status-available/10 text-status-available",
  stored: "bg-status-available/10 text-status-available",
  quarantined: "bg-status-held/10 text-status-held",
  cancelled: "bg-status-held/10 text-status-held",
};

const CIPL_STATUS_LABELS: Record<string, string> = {
  staged_pending_arrival: "PENDING ARRIVAL",
  receiving_in_progress: "IN PROGRESS",
  completed: "RECEIVED & MATCHED",
  stored: "STORED",
  quarantined: "QUARANTINED",
  cancelled: "CANCELLED",
};

export function CiplDocumentsTable({ rows }: CiplDocumentsTableProps) {
  const [previewDoc, setPreviewDoc] = useState<PreviewDocData | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  const totalCount = rows.length;
  const pageCount = Math.ceil(totalCount / pageSize) || 1;
  const pagedRows = useMemo(() => {
    return rows.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);
  }, [rows, pageIndex, pageSize]);

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-outline-variant/30 bg-surface-white px-6 py-12 text-center shadow-elevation-1">
        <Paperclip size={40} className="text-text-grey" aria-hidden="true" />
        <p className="font-body text-body-md text-text-grey">No CI/PL or Supplier Invoices match the selected filters.</p>
      </div>
    );
  }

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-outline-variant/30 bg-surface-white shadow-elevation-1">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-outline-variant/30 bg-surface-light-grey">
                <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                  Invoice / CI/PL #
                </th>
                <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                  WRR Reference
                </th>
                <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                  Date
                </th>
                <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                  Supplier / Vendor
                </th>
                <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                  Model
                </th>
                <th className="px-4 py-3 text-right font-label text-label uppercase tracking-[0.05em] text-text-grey">
                  Items / Expected Qty
                </th>
                <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                  Status
                </th>
                <th className="px-4 py-3 text-right font-label text-label uppercase tracking-[0.05em] text-text-grey">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/20">
              {pagedRows.map((row) => {
                const statusClass = CIPL_STATUS_CLASSES[row.status] || "bg-status-neutral/10 text-status-neutral";
                const statusLabel = CIPL_STATUS_LABELS[row.status] || row.status.toUpperCase();
                const displayInvoice = row.commercialInvoiceNo || "CIPL / Invoice";

                return (
                  <tr key={row.id} className="hover:bg-brand-navy/[0.02] transition-colors">
                    <td className="px-4 py-3 font-mono text-mono-sm font-bold text-brand-navy">
                      <div className="flex items-center gap-1.5">
                        <FileText size={15} className="text-text-grey shrink-0" />
                        <span>{displayInvoice}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-mono-xs text-text-grey">
                      <Link
                        href={`/receiving/${row.id}`}
                        className="font-bold text-brand-navy hover:underline flex items-center gap-1"
                      >
                        {row.wrrNumber}
                        <ExternalLink size={11} className="text-text-grey" />
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-body text-body-sm text-text-grey">
                      {new Date(row.createdAt).toLocaleDateString("en-PH", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-body text-body-sm font-semibold text-on-surface">
                        {row.vendorPartyName}
                      </div>
                      <div className="font-mono text-mono-xs text-text-grey">
                        {row.vendorPartyCode}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-mono-xs uppercase text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                        {row.flowType}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-mono text-mono-sm font-bold text-on-surface">
                        {row.itemCount} items
                      </span>
                      <span className="block font-mono text-mono-xs text-text-grey">
                        ({row.totalQuantity.toLocaleString()} pcs)
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-label text-xs font-bold ${statusClass}`}>
                        {statusLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {row.ciplFileUrl ? (
                          <a
                            href={row.ciplFileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex h-8 items-center gap-1 rounded border border-outline-variant/40 bg-surface-white px-2.5 font-label text-body-xs font-bold text-brand-navy hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-navy"
                          >
                            <Download size={13} />
                            Download
                          </a>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setPreviewDoc({
                                id: row.id,
                                documentNumber: displayInvoice,
                                title: `Commercial Invoice / Packing List — ${displayInvoice}`,
                                documentType: "Inbound CI/PL / Invoice",
                                status: row.status,
                                organizationName: row.vendorPartyName,
                                previewUrl: row.ciplFileUrl,
                                downloadUrl: row.ciplFileUrl,
                                snapshotHash: null,
                                generatedAt: row.confirmedAt ?? row.createdAt,
                                actorName: null,
                              });
                            }}
                            className="inline-flex h-8 items-center gap-1 rounded border border-outline-variant/40 bg-surface-white px-2.5 font-label text-body-xs font-bold text-brand-navy hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-navy"
                          >
                            <Eye size={13} />
                            Preview
                          </button>
                        )}
                      </div>
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

      {previewDoc && (
        <DocumentPreviewModal
          doc={previewDoc}
          onClose={() => setPreviewDoc(null)}
        />
      )}
    </>
  );
}
