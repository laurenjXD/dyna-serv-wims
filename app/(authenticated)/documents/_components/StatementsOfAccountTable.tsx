"use client";

import { useState, useMemo } from "react";
import { Lock, FileText, Download, ShieldAlert, Eye, Building } from "lucide-react";
import type { StatementOfAccountArchiveRow } from "@/lib/db/queries/documents";
import { DocumentPreviewModal, type PreviewDocData } from "./DocumentPreviewModal";
import { TablePagination } from "@/components/ui/TablePagination";

interface StatementsOfAccountTableProps {
  rows: StatementOfAccountArchiveRow[];
  canReadFinancial: boolean;
}

const SOA_STATUS_CLASSES: Record<string, string> = {
  issued: "bg-status-available/10 text-status-available",
  settled: "bg-status-available/10 text-status-available",
  draft: "bg-status-pending/10 text-status-pending",
  voided: "bg-status-held/10 text-status-held",
};

export function StatementsOfAccountTable({
  rows,
  canReadFinancial,
}: StatementsOfAccountTableProps) {
  const [previewDoc, setPreviewDoc] = useState<PreviewDocData | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  const totalCount = rows.length;
  const pageCount = Math.ceil(totalCount / pageSize) || 1;
  const pagedRows = useMemo(() => {
    return rows.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);
  }, [rows, pageIndex, pageSize]);

  if (!canReadFinancial) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-status-held/30 bg-status-held/10 px-6 py-12 text-center shadow-elevation-1">
        <Lock size={44} className="text-status-held" aria-hidden="true" />
        <h3 className="font-heading text-headline-sm font-bold text-status-held">
          Financial Access Clearance Required
        </h3>
        <p className="max-w-md font-body text-body-md text-on-surface">
          Viewing Statements of Account and commercial billing summaries requires the{" "}
          <span className="font-mono text-mono-md font-bold">reporting.financial_read</span> capability.
        </p>
        <p className="font-body text-body-sm text-text-grey">
          Please contact a warehouse supervisor or system administrator to request access.
        </p>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-outline-variant/30 bg-surface-white px-6 py-12 text-center shadow-elevation-1">
        <FileText size={40} className="text-text-grey" aria-hidden="true" />
        <p className="font-body text-body-md text-text-grey">
          No Statements of Account match the selected filters.
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
                  SOA Period #
                </th>
                <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                  Date Range
                </th>
                <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                  Organization
                </th>
                <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                  Storage (CBM)
                </th>
                <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                  Total (USD / PHP)
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
                const statusClass = SOA_STATUS_CLASSES[r.status] ?? "bg-status-neutral/10 text-status-neutral";
                const totalPhp = r.billingStatementTotalUsd * r.lockedExchangeRatePhp;

                return (
                  <tr key={r.id} className="hover:bg-surface-light-grey/40">
                    <td className="px-4 py-3">
                      <div className="font-mono text-mono-md font-bold text-on-surface">
                        {r.periodNumber}
                      </div>
                      <div className="font-mono text-mono-sm text-text-grey">
                        FX: ₱{r.lockedExchangeRatePhp.toFixed(2)}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-mono-sm text-text-grey">
                      {r.periodStartDate} to {r.periodEndDate}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-body text-body-md font-medium text-on-surface">
                        {r.partyName}
                      </div>
                      <div className="font-mono text-mono-sm text-text-grey">
                        {r.partyCode}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-mono-md text-on-surface">
                      ${r.storageChargeUsd.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-mono text-mono-md font-bold text-on-surface">
                        ${r.billingStatementTotalUsd.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </div>
                      <div className="font-mono text-mono-sm text-text-grey">
                        ≈ ₱{totalPhp.toLocaleString(undefined, { minimumFractionDigits: 2 })}
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
                              documentNumber: r.periodNumber,
                              title: "Statement of Account (SOA Bundle)",
                              documentType: "soa",
                              status: r.status,
                              organizationName: r.partyName,
                              actorName: r.closedByUserName,
                              generatedAt: r.closedAt ?? r.createdAt,
                              previewUrl: `/billing-pricing/soa/${r.id}`,
                              downloadUrl: `/billing-pricing/soa/${r.id}`,
                            })
                          }
                          className="inline-flex h-9 items-center gap-1 rounded-lg border border-outline-variant/40 bg-surface-white px-2.5 font-label text-label text-on-surface hover:bg-surface-light-grey focus:outline-none focus:ring-2 focus:ring-brand-navy"
                        >
                          <Eye size={14} /> Preview
                        </button>
                        <a
                          href={`/billing-pricing?partyId=${r.partyId}`}
                          className="inline-flex h-9 items-center gap-1 rounded-lg bg-surface-light-grey px-2.5 font-label text-label font-medium text-on-surface hover:bg-outline-variant/30"
                        >
                          <Building size={14} /> Ledger
                        </a>
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

      <DocumentPreviewModal doc={previewDoc} onClose={() => setPreviewDoc(null)} />
    </>
  );
}
