// Incoming Ledger — confirmed WRRs, read-only office surface.
//
// Traceability:
//   specs/07-incoming-receiving/design.md §10 (putaway and incoming ledger),
//     §3 (route)
//   specs/07-incoming-receiving/requirements.md R9 (incoming ledger and review)
//   specs/00-steering/brand-design-system.md §6 (office surface, Level 1 elevation)
//
// Surface: Office. Permission gate: receiving.confirm.
//
// Ledger is always filtered to status='confirmed'. No status filter shown
// (always confirmed per task spec). The authoritative incoming ledger view
// is over inventory_transactions (requirements.md R9.1); this page queries
// wrr_documents as a proxy pending full inventory_transactions integration.

import Link from "next/link";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db/client";
import { listWrrDocuments } from "@/lib/db/queries/receiving";
import type { WrrDocumentRow } from "@/lib/db/queries/receiving";

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

const FLOW_LABELS: Record<string, string> = {
  vmi: "VMI",
  trading: "Trading",
  supplies: "Supplies",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

interface PageProps {
  searchParams: Promise<{ page?: string }>;
}

export default async function IncomingLedgerPage({ searchParams }: PageProps) {
  const { page: pageParam } = await searchParams;
  const resolver = await createPageResolver();

  // Gate: receiving.confirm.
  const permResult = await requirePermission(resolver, "receiving.confirm");
  if (permResult.kind !== "authorized") {
    return (
      <div className="mx-auto max-w-container px-4 py-12 text-center">
        <p className="font-body text-body-md text-text-grey">
          You do not have permission to view the incoming ledger.
        </p>
        <p className="mt-2 font-body text-body-sm text-text-grey">
          This page requires the{" "}
          <span className="font-mono text-mono-md">receiving.confirm</span>{" "}
          capability.
        </p>
      </div>
    );
  }

  const currentPage = Math.max(1, Number(pageParam ?? "1") || 1);
  const offset = (currentPage - 1) * PAGE_SIZE;

  // Always confirmed — ledger shows only committed receipts.
  const { rows, total } = await listWrrDocuments(db, {
    limit: PAGE_SIZE,
    offset,
    status: "confirmed",
  });

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="mx-auto max-w-container">
      {/* Page header */}
      <div>
        <h1 className="font-heading font-semibold text-headline-md text-brand-navy">
          Incoming Ledger
        </h1>
        <p className="mt-1 font-body text-body-md text-text-grey">
          Read-only view of confirmed warehouse receipts. Corrections create new
          transactions; history is immutable per design.md §10.
        </p>
      </div>

      {/* Ledger table — Level 1 office elevation per brand-design-system.md §6 */}
      <div className="mt-6 overflow-hidden rounded-md bg-white/75 backdrop-blur-md shadow-elevation-1">
        {rows.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="font-body text-body-md text-text-grey">
              No confirmed receipts in the ledger yet.
            </p>
            <p className="mt-2 font-body text-body-sm text-text-grey">
              Confirmed WRRs appear here after the receipt commit succeeds.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-outline-variant/30 bg-surface-light-grey">
                  {/* Epilogue SemiBold uppercase headers per §9 */}
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    WRR Number
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Flow Type
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Vendor Party
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Confirmed At
                  </th>
                  <th className="sr-only px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/30">
                {rows.map((row: WrrDocumentRow) => (
                  <tr key={row.id} className="hover:bg-surface-light-grey/50">
                    {/* WRR number — Roboto Mono per §9 */}
                    <td className="px-4 py-3 font-mono text-mono-md text-on-surface">
                      {row.wrrNumber}
                    </td>
                    <td className="px-4 py-3 font-body text-body-md text-on-surface">
                      {FLOW_LABELS[row.flowType] ?? row.flowType}
                    </td>
                    {/* Vendor party ID — Mono for identifiers per §9 */}
                    <td className="px-4 py-3 font-mono text-mono-md text-on-surface">
                      {row.vendorPartyId}
                    </td>
                    {/*
                     * Note: confirmedAt is on wrr_documents but not in the
                     * current WrrDocumentRow query result. Showing createdAt
                     * as a proxy; extend getWrrDocument/listWrrDocuments to
                     * include confirmedAt when the query is updated.
                     */}
                    <td className="px-4 py-3 font-body text-body-md text-text-grey">
                      {row.createdAt.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/receiving/${row.id}`}
                        className="inline-flex h-11 items-center font-label text-label text-brand-navy underline hover:text-brand-royal-blue focus:outline-none focus:ring-2 focus:ring-brand-navy"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination controls */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between font-body text-body-sm text-text-grey">
          <span>
            Page {currentPage} of {totalPages} ({total} total)
          </span>
          <div className="flex gap-2">
            {currentPage > 1 && (
              <Link
                href={`/incoming-ledger?page=${currentPage - 1}`}
                className="inline-flex h-11 items-center justify-center rounded border border-outline-variant/30 px-4 font-label text-label text-on-surface hover:bg-surface-light-grey focus:outline-none focus:ring-2 focus:ring-brand-navy"
              >
                Previous
              </Link>
            )}
            {currentPage < totalPages && (
              <Link
                href={`/incoming-ledger?page=${currentPage + 1}`}
                className="inline-flex h-11 items-center justify-center rounded border border-outline-variant/30 px-4 font-label text-label text-on-surface hover:bg-surface-light-grey focus:outline-none focus:ring-2 focus:ring-brand-navy"
              >
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
