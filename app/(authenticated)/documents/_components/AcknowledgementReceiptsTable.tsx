"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Eye, Download, Share2, CheckCircle2, Info, Paperclip } from "lucide-react";
import type { AcknowledgementReceiptArchiveRow } from "@/lib/db/queries/documents";
import { DocumentPreviewModal, type PreviewDocData } from "./DocumentPreviewModal";
import { DocumentReprintDialog } from "./DocumentReprintDialog";
import { TablePagination } from "@/components/ui/TablePagination";

interface AcknowledgementReceiptsTableProps {
  rows: AcknowledgementReceiptArchiveRow[];
}

const AR_STATUS_CLASSES: Record<string, string> = {
  ready: "bg-status-available/10 text-status-available",
  pending: "bg-status-pending/10 text-status-pending",
  generating: "bg-status-pending/10 text-status-pending",
  failed: "bg-status-held/10 text-status-held",
  voided: "bg-status-neutral/10 text-status-neutral",
};

export function AcknowledgementReceiptsTable({ rows }: AcknowledgementReceiptsTableProps) {
  const [previewDoc, setPreviewDoc] = useState<PreviewDocData | null>(null);
  const [reprintTarget, setReprintTarget] = useState<{ id: string; number: string } | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  const totalCount = rows.length;
  const pageCount = Math.ceil(totalCount / pageSize) || 1;
  const pagedRows = useMemo(() => {
    return rows.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);
  }, [rows, pageIndex, pageSize]);

  const handleShare = (r: AcknowledgementReceiptArchiveRow) => {
    if (typeof window !== "undefined" && typeof navigator !== "undefined") {
      navigator.clipboard?.writeText?.(`${window.location.origin}/pick-lists/${r.pickListId}/receipt`);
      alert(`Document link for ${r.documentNumber} copied to clipboard!`);
    }
  };

  const handleDownload = (r: AcknowledgementReceiptArchiveRow) => {
    if (typeof window !== "undefined") {
      window.open(`/pick-lists/${r.pickListId}/receipt`, "_blank");
    }
  };

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-outline-variant/60 bg-surface-white p-10 text-center shadow-2xs">
        <div className="mb-3.5 flex h-12 w-12 items-center justify-center rounded-2xl border border-brand-navy/20 bg-brand-navy/10 text-brand-navy shadow-2xs">
          <CheckCircle2 size={24} aria-hidden="true" />
        </div>
        <h3 className="font-heading text-title-sm font-bold text-on-surface">No Delivery Receipts or ARs</h3>
        <p className="mt-1 max-w-md font-body text-body-sm text-text-grey">
          No signed acknowledgement receipts or proof of delivery records match your filters. Dispatched releases will appear here automatically.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* VMI Disclaimer Banner */}
      <div className="mb-4 flex items-start gap-2.5 rounded-2xl border border-status-pending/30 bg-status-pending/10 p-4">
        <Info className="mt-0.5 shrink-0 text-status-pending" size={18} />
        <p className="font-body text-body-sm text-on-surface">
          <strong>Pricing Notice:</strong> Trading delivery receipt prices are finalized financial amounts. VMI prices shown are per-release reference values only; authoritative billing is the period VMI Statement of Account.
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
                  Customer
                </th>
                <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                  Model
                </th>
                <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                  Qty / Total
                </th>
                <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                  Status
                </th>
                <th className="px-4 py-3 text-right font-label text-label uppercase tracking-[0.05em] text-text-grey">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/30">
              {pagedRows.map((r) => {
                const statusClass = AR_STATUS_CLASSES[r.status] ?? "bg-status-neutral/10 text-status-neutral";
                const formattedDate = new Date(r.createdAt).toISOString().slice(0, 10);
                const isVmi = r.flowType.toLowerCase() === "vmi";
                const isSupplies = r.flowType.toLowerCase() === "supplies";

                return (
                  <tr key={r.id} className="hover:bg-surface-light-grey/40 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-mono text-mono-md font-bold text-on-surface">
                        {r.documentNumber}
                      </div>
                      <div className="font-mono text-mono-sm text-text-grey">
                        PL: {r.pickListNumber}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-mono-md text-text-grey">
                      {formattedDate}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-body text-body-md font-medium text-on-surface">
                        {r.customerPartyName}
                      </div>
                      <div className="font-mono text-mono-sm text-text-grey">
                        {r.customerPartyCode}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-md bg-brand-navy/10 px-2 py-0.5 font-label text-label uppercase text-brand-navy">
                        {r.flowType}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-mono text-mono-md text-on-surface font-bold">
                        {r.totalQuantity.toLocaleString()} pcs
                      </div>
                      <div className="font-mono text-mono-sm text-text-grey">
                        {isSupplies
                          ? "No charge (Supplies)"
                          : isVmi
                          ? `₱${r.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })} (Ref)`
                          : `₱${r.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 font-label text-label uppercase tracking-wider ${statusClass}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            setPreviewDoc({
                              id: r.id,
                              documentNumber: r.documentNumber,
                              title: "Delivery Receipt & Acknowledgement Receipt (DR / AR)",
                              documentType: "acknowledgement_receipt",
                              status: r.status,
                              snapshotHash: r.snapshotHash,
                              generatedAt: r.generatedAt ?? r.createdAt,
                              organizationName: r.customerPartyName,
                              actorName: r.dispatchedByName,
                              previewUrl: `/pick-lists/${r.pickListId}/receipt`,
                              downloadUrl: `/pick-lists/${r.pickListId}/receipt`,
                            })
                          }
                          title="Preview Delivery Receipt"
                          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-surface px-3 font-label text-label font-bold text-brand-navy hover:bg-background transition-colors focus:outline-none focus:ring-2 focus:ring-brand-navy"
                        >
                          <Eye size={14} /> Preview
                        </button>
                        {r.deliveryReceiptPath && (
                          <button
                            type="button"
                            onClick={() =>
                              setPreviewDoc({
                                id: r.id,
                                documentNumber: `POD-${r.documentNumber.replace(/^AR-/, "")}`,
                                title: "Signed Proof of Delivery (POD)",
                                documentType: "acknowledgement_receipt",
                                status: r.status,
                                snapshotHash: r.snapshotHash,
                                generatedAt: r.generatedAt ?? r.createdAt,
                                organizationName: r.customerPartyName,
                                actorName: r.dispatchedByName,
                                previewUrl: r.deliveryReceiptPath,
                                downloadUrl: r.deliveryReceiptPath,
                              })
                            }
                            title="Preview Signed Proof of Delivery"
                            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-outline-variant/40 bg-surface-white px-2.5 sm:px-3 font-label text-label font-bold text-on-surface hover:bg-surface-light-grey transition-colors focus:outline-none focus:ring-2 focus:ring-brand-navy"
                          >
                            <Paperclip size={14} /> <span>POD</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleShare(r)}
                          title="Copy Link"
                          className="inline-flex h-9 items-center justify-center rounded-xl border border-outline-variant/40 bg-surface-white px-2.5 text-text-grey hover:bg-surface-light-grey hover:text-on-surface focus:outline-none transition-colors"
                        >
                          <Share2 size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownload(r)}
                          title="Download Document"
                          className="inline-flex h-9 items-center justify-center rounded-xl bg-brand-navy px-2.5 text-surface-white hover:bg-brand-navy/90 focus:outline-none transition-colors"
                        >
                          <Download size={14} />
                        </button>
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

      <DocumentPreviewModal
        doc={previewDoc}
        onClose={() => setPreviewDoc(null)}
        onReprint={(doc) => setReprintTarget({ id: doc.id, number: doc.documentNumber })}
      />

      {reprintTarget && (
        <DocumentReprintDialog
          documentId={reprintTarget.id}
          documentNumber={reprintTarget.number}
          onClose={() => setReprintTarget(null)}
          onSuccess={(res) => {
            setReprintTarget(null);
            alert(`Reprint logged: ${res.watermarkText}`);
          }}
        />
      )}
    </>
  );
}
