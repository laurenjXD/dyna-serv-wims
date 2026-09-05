"use client";

import { useState } from "react";
import Link from "next/link";
import { FileText, Eye, ExternalLink, Package } from "lucide-react";
import type { WrrArchiveRow } from "@/lib/db/queries/documents";
import { DocumentPreviewModal, type PreviewDocData } from "./DocumentPreviewModal";

interface WrrDocumentsTableProps {
  rows: WrrArchiveRow[];
}

const WRR_STATUS_CLASSES: Record<string, string> = {
  staged_pending_arrival: "bg-status-pending/10 text-status-pending",
  receiving_in_progress: "bg-status-pending/10 text-status-pending",
  completed: "bg-status-available/10 text-status-available",
  stored: "bg-status-available/10 text-status-available",
  quarantined: "bg-status-held/10 text-status-held",
  cancelled: "bg-status-held/10 text-status-held",
};

const WRR_STATUS_LABELS: Record<string, string> = {
  staged_pending_arrival: "PENDING ARRIVAL",
  receiving_in_progress: "IN PROGRESS",
  completed: "COMPLETED",
  stored: "STORED",
  quarantined: "QUARANTINED",
  cancelled: "CANCELLED",
};

export function WrrDocumentsTable({ rows }: WrrDocumentsTableProps) {
  const [previewDoc, setPreviewDoc] = useState<PreviewDocData | null>(null);

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-outline-variant/30 bg-surface-white px-6 py-12 text-center shadow-elevation-1">
        <Package size={40} className="text-text-grey" aria-hidden="true" />
        <p className="font-body text-body-md text-text-grey">No WRR documents match the selected filters.</p>
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
                  WRR #
                </th>
                <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                  Date
                </th>
                <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                  Organization
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
              {rows.map((r) => {
                const statusClass = WRR_STATUS_CLASSES[r.status] ?? "bg-status-neutral/10 text-status-neutral";
                const statusLabel = WRR_STATUS_LABELS[r.status] ?? r.status.toUpperCase();
                const formattedDate = new Date(r.createdAt).toISOString().slice(0, 10);

                return (
                  <tr key={r.id} className="hover:bg-surface-light-grey/40">
                    <td className="px-4 py-3">
                      <div className="font-mono text-mono-md font-bold text-on-surface">
                        {r.wrrNumber}
                      </div>
                      {r.commercialInvoiceNo && (
                        <div className="font-mono text-mono-sm text-text-grey">
                          CIPL: {r.commercialInvoiceNo}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-mono-md text-text-grey">
                      {formattedDate}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-body text-body-md font-medium text-on-surface">
                        {r.vendorPartyName}
                      </div>
                      <div className="font-mono text-mono-sm text-text-grey">
                        {r.vendorPartyCode}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-md bg-brand-navy/10 px-2 py-0.5 font-label text-label uppercase text-brand-navy">
                        {r.flowType}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-mono-md text-on-surface">
                      {r.itemCount} items / {r.totalQuantity.toLocaleString()} pcs
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 font-label text-label uppercase tracking-wider ${statusClass}`}>
                        {statusLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setPreviewDoc({
                              id: r.id,
                              documentNumber: r.wrrNumber,
                              title: "Warehouse Receiving Report",
                              documentType: "wrr",
                              status: r.status,
                              generatedAt: r.confirmedAt ?? r.createdAt,
                              organizationName: r.vendorPartyName,
                              actorName: r.stagedByUserName,
                              previewUrl: null,
                              downloadUrl: null,
                            })
                          }
                          className="inline-flex h-9 items-center gap-1 rounded-lg border border-outline-variant/40 bg-surface-white px-2.5 font-label text-label text-on-surface hover:bg-surface-light-grey focus:outline-none focus:ring-2 focus:ring-brand-navy"
                        >
                          <Eye size={14} /> Preview
                        </button>
                        <Link
                          href={`/receiving/${r.id}`}
                          className="inline-flex h-9 items-center gap-1 rounded-lg bg-surface-light-grey px-2.5 font-label text-label font-medium text-on-surface hover:bg-outline-variant/30 focus:outline-none focus:ring-2 focus:ring-brand-navy"
                        >
                          <ExternalLink size={14} /> View WRR
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <DocumentPreviewModal doc={previewDoc} onClose={() => setPreviewDoc(null)} />
    </>
  );
}
