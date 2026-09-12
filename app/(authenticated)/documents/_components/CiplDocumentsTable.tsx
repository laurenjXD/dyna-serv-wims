import { useState, useMemo } from "react";
import Link from "next/link";
import { FileText, Eye, Download, Share2, Paperclip } from "lucide-react";
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

  const handleShare = (row: CiplArchiveRow) => {
    const url = row.ciplFileUrl || (typeof window !== "undefined" ? `${window.location.origin}/receiving/${row.id}` : "");
    if (url && typeof navigator !== "undefined") {
      navigator.clipboard?.writeText?.(url);
      alert(`Document link for ${row.commercialInvoiceNo || row.wrrNumber} copied to clipboard!`);
    }
  };

  const handleDownload = (row: CiplArchiveRow) => {
    if (row.ciplFileUrl) {
      const link = document.createElement("a");
      link.href = row.ciplFileUrl;
      link.download = `${row.commercialInvoiceNo || "CIPL"}_${row.wrrNumber}.pdf`;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else if (typeof window !== "undefined") {
      window.open(`/receiving/${row.id}`, "_blank");
    }
  };

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
                  WRR Ref
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
                <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                  Items / Qty
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
              {pagedRows.map((row) => {
                const statusClass = CIPL_STATUS_CLASSES[row.status] || "bg-status-neutral/10 text-status-neutral";
                const statusLabel = CIPL_STATUS_LABELS[row.status] || row.status.toUpperCase();
                const displayInvoice = row.commercialInvoiceNo || "CIPL / Invoice";
                const formattedDate = new Date(row.createdAt).toISOString().slice(0, 10);

                return (
                  <tr key={row.id} className="hover:bg-surface-light-grey/40 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 font-mono text-mono-md font-bold text-on-surface">
                        <FileText size={15} className="text-brand-navy shrink-0" />
                        <span>{displayInvoice}</span>
                      </div>
                      {row.ciplFileUrl && (
                        <span className="inline-flex items-center gap-1 font-body text-[11px] text-brand-navy font-semibold">
                          <Paperclip size={11} /> Uploaded Document
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-mono-sm text-text-grey">
                      <Link
                        href={`/receiving/${row.id}`}
                        className="font-bold text-brand-navy hover:underline"
                      >
                        {row.wrrNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-mono text-mono-md text-text-grey">
                      {formattedDate}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-body text-body-md font-medium text-on-surface">
                        {row.vendorPartyName}
                      </div>
                      <div className="font-mono text-mono-sm text-text-grey">
                        {row.vendorPartyCode}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-md bg-brand-navy/10 px-2 py-0.5 font-label text-label uppercase text-brand-navy">
                        {row.flowType}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-mono-md text-on-surface">
                      {row.itemCount} items / {row.totalQuantity.toLocaleString()} pcs
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 font-label text-label uppercase tracking-wider ${statusClass}`}>
                        {statusLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setPreviewDoc({
                              id: row.id,
                              documentNumber: displayInvoice,
                              title: `Imported CI/PL Supplier Document — ${displayInvoice}`,
                              documentType: "cipl",
                              status: row.status,
                              organizationName: row.vendorPartyName,
                              previewUrl: row.ciplFileUrl || null,
                              downloadUrl: row.ciplFileUrl || null,
                              snapshotHash: null,
                              generatedAt: row.confirmedAt ?? row.createdAt,
                              actorName: null,
                            });
                          }}
                          title="Preview Imported CIPL"
                          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-surface px-3 font-label text-label font-bold text-brand-navy hover:bg-background transition-colors focus:outline-none focus:ring-2 focus:ring-brand-navy"
                        >
                          <Eye size={14} /> Preview
                        </button>
                        <button
                          type="button"
                          onClick={() => handleShare(row)}
                          title="Copy Link"
                          className="inline-flex h-9 items-center justify-center rounded-xl border border-outline-variant/40 bg-surface-white px-2.5 text-text-grey hover:bg-surface-light-grey hover:text-on-surface focus:outline-none transition-colors"
                        >
                          <Share2 size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownload(row)}
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

      {previewDoc && (
        <DocumentPreviewModal
          doc={previewDoc}
          onClose={() => setPreviewDoc(null)}
        />
      )}
    </>
  );
}
