"use client";

import { useState } from "react";
import { Eye, RotateCw, CheckCircle2, Info } from "lucide-react";
import type { AcknowledgementReceiptArchiveRow } from "@/lib/db/queries/documents";
import { DocumentPreviewModal, type PreviewDocData } from "./DocumentPreviewModal";
import { DocumentReprintDialog } from "./DocumentReprintDialog";

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

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-outline-variant/30 bg-surface-white px-6 py-12 text-center shadow-elevation-1">
        <CheckCircle2 size={40} className="text-text-grey" aria-hidden="true" />
        <p className="font-body text-body-md text-text-grey">
          No delivery receipts or acknowledgement receipts match the selected filters.
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
              {rows.map((r) => {
                const statusClass = AR_STATUS_CLASSES[r.status] ?? "bg-status-neutral/10 text-status-neutral";
                const formattedDate = new Date(r.createdAt).toISOString().slice(0, 10);
                const isVmi = r.flowType.toLowerCase() === "vmi";
                const isSupplies = r.flowType.toLowerCase() === "supplies";

                return (
                  <tr key={r.id} className="hover:bg-surface-light-grey/40">
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
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setPreviewDoc({
                              id: r.id,
                              documentNumber: r.documentNumber,
                              title: "Delivery Receipt / Acknowledgement Receipt",
                              documentType: "acknowledgement_receipt",
                              status: r.status,
                              snapshotHash: r.snapshotHash,
                              generatedAt: r.generatedAt ?? r.createdAt,
                              organizationName: r.customerPartyName,
                              actorName: r.dispatchedByName,
                              previewUrl: null,
                              downloadUrl: null,
                            })
                          }
                          className="inline-flex h-9 items-center gap-1 rounded-lg border border-outline-variant/40 bg-surface-white px-2.5 font-label text-label text-on-surface hover:bg-surface-light-grey focus:outline-none focus:ring-2 focus:ring-brand-navy"
                        >
                          <Eye size={14} /> Preview
                        </button>
                        <button
                          type="button"
                          onClick={() => setReprintTarget({ id: r.id, number: r.documentNumber })}
                          disabled={r.status !== "ready"}
                          className="inline-flex h-9 items-center gap-1 rounded-lg border border-status-pending/40 bg-status-pending/10 px-2.5 font-label text-label font-bold text-status-pending hover:bg-status-pending/20 focus:outline-none focus:ring-2 focus:ring-status-pending disabled:opacity-40"
                        >
                          <RotateCw size={14} /> Reprint
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
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
