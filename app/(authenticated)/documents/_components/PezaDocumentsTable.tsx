"use client";

import { useState } from "react";
import { Eye, Shield, FileCheck2 } from "lucide-react";
import type { PezaArchiveRow } from "@/lib/db/queries/documents";
import { DocumentPreviewModal, type PreviewDocData } from "./DocumentPreviewModal";

interface PezaDocumentsTableProps {
  rows: PezaArchiveRow[];
}

export function PezaDocumentsTable({ rows }: PezaDocumentsTableProps) {
  const [previewDoc, setPreviewDoc] = useState<PreviewDocData | null>(null);

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-outline-variant/30 bg-surface-white px-6 py-12 text-center shadow-elevation-1">
        <Shield size={40} className="text-text-grey" aria-hidden="true" />
        <p className="font-body text-body-md text-text-grey">
          No PEZA or customs regulatory permits match the selected filters.
        </p>
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
                  Permit / Document #
                </th>
                <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                  Permit Type
                </th>
                <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                  Organization
                </th>
                <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                  Valid From
                </th>
                <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                  Valid To
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
                const isActive = r.status === "active";
                const statusClass = isActive
                  ? "bg-status-available/10 text-status-available"
                  : "bg-status-held/10 text-status-held";

                return (
                  <tr key={r.id} className="hover:bg-surface-light-grey/40">
                    <td className="px-4 py-3">
                      <div className="font-mono text-mono-md font-bold text-on-surface">
                        {r.permitNumber}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-md bg-brand-navy/10 px-2 py-0.5 font-label text-label uppercase text-brand-navy">
                        {r.permitType}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-body text-body-md font-medium text-on-surface">
                        {r.partyName}
                      </div>
                      <div className="font-mono text-mono-sm text-text-grey">
                        {r.partyCode}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-mono-sm text-text-grey">
                      {r.issuedDate ? String(r.issuedDate).slice(0, 10) : "N/A"}
                    </td>
                    <td className="px-4 py-3 font-mono text-mono-sm text-text-grey">
                      {r.expiryDate ? String(r.expiryDate).slice(0, 10) : "Open-ended"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 font-label text-label uppercase tracking-wider ${statusClass}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() =>
                          setPreviewDoc({
                            id: r.id,
                            documentNumber: r.permitNumber,
                            title: r.permitType,
                            documentType: "permit",
                            status: r.status,
                            organizationName: r.partyName,
                            generatedAt: r.issuedDate,
                            previewUrl: null,
                            downloadUrl: null,
                          })
                        }
                        className="inline-flex h-9 items-center gap-1 rounded-lg border border-outline-variant/40 bg-surface-white px-2.5 font-label text-label text-on-surface hover:bg-surface-light-grey focus:outline-none focus:ring-2 focus:ring-brand-navy"
                      >
                        <Eye size={14} /> Preview
                      </button>
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
