// Outgoing — read-only dispatch ledger. Pick-list work lives in Master Inventory.
//
// Traceability:
//   specs/08-outgoing-withdrawal-and-two-stage-commitment/design.md §3 (route),
//     §9 (Outgoing ledger design)
//   specs/08-outgoing-withdrawal-and-two-stage-commitment/requirements.md
//     R5.3, R5.7 (pick_list exposure), R9.1-R9.4 (Outgoing Ledger contract)
//   specs/00-steering/design.md §3 (office tab pattern), §6
//     (office surface, Level 1 elevation)
//   lib/shell/registry.ts — id: "outgoing", surface: "floor",
//     capability: "pick_list.execute"
//   specs/00-steering/revision-log.md (2026-08-09 PO restructuring — outgoing
//     ledger content moved here from /inventory; new /outgoing route added to
//     registry for floor pick execution)
//
// Surface: Floor (primary) / Office (secondary review).
// Permission gate: pick_list.read — notFound if not authorized.
//
// R9.4: the Outgoing Ledger tab's content is read-only; this module exports
// ONLY the default component (no mutation side-exports).

import { notFound } from "next/navigation";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db/client";
import { listOutgoingLedger } from "@/lib/actions/withdrawals";
import type { OutgoingLedgerRow } from "@/lib/db/queries/withdrawals";

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function OutgoingPage() {
  const resolver = await createPageResolver();

  // Gate: pick_list.read is required for the outgoing ledger.
  const permResult = await requirePermission(resolver, "pick_list.read");
  if (permResult.kind !== "authorized") {
    notFound();
  }

  return (
    <div className="mx-auto max-w-container pb-10">
      <div>
        <h1 className="font-heading text-headline-lg font-bold tracking-tight text-on-surface">Outgoing Ledger</h1>
        <p className="mt-1 font-body text-body-md text-text-grey">Read-only record of dispatched inventory. Create and manage pick lists in Master Inventory.</p>
      </div>
      <OutgoingLedgerTab resolver={resolver} />
    </div>
  );
}

// ─── Outgoing Ledger tab ──────────────────────────────────────────────────────
//
// Read-only record of outgoing inventory transactions. Moved here from
// /inventory per 2026-08-09 PO restructuring.

async function OutgoingLedgerTab({
  resolver,
}: {
  resolver: Awaited<ReturnType<typeof createPageResolver>>;
}) {
  const ledgerResult = await listOutgoingLedger(resolver, {
    limit: 100,
    offset: 0,
  });

  // listOutgoingLedger returns { rows, total } on success or { ok: false } on error.
  const rows: OutgoingLedgerRow[] =
    "rows" in ledgerResult ? ledgerResult.rows : [];

  return (
    <div className="mt-6">
      <p className="font-body text-body-md text-text-grey">
        Read-only record of outgoing inventory transactions (picks). No edits
        or deletions — corrections use new approved transactions.
      </p>

      {/* Ledger table — Level 1 office elevation per design.md §6.
          design.md §9: item code is the prominent first field in office review.
          Card wrapper matches Active Picks tab's pattern (border + responsive
          shadow) for cross-tab visual consistency. */}
      <div className="mt-6 overflow-hidden rounded-xl border border-outline-variant/30 bg-surface-white shadow-elevation-2">
        {rows.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="font-body text-body-md text-text-grey">
              No outgoing transactions yet.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-outline-variant/30 bg-surface-light-grey">
                  {/* design.md §9 column list — Epilogue SemiBold uppercase headers per §9 */}
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Date/Time
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Transaction #
                  </th>
                  {/* Item code — prominent first data column per design.md §9 */}
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Item Code
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Item Name
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Lot Number
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Qty
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    From Location
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Pick List #
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Customer Organization
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Acknowledgement Receipt #
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Performed By
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/30">
                {rows.map((row: OutgoingLedgerRow) => (
                  <tr key={row.transactionId} className="hover:bg-surface-light-grey/50">
                    <td className="px-4 py-3 font-body text-body-md text-text-grey">
                      {row.createdAt.toLocaleString()}
                    </td>
                    {/* Roboto Mono for reference/code numbers per §9 */}
                    <td className="px-4 py-3 font-mono text-mono-md text-on-surface">
                      {row.transactionNumber}
                    </td>
                    {/* Item code — prominent first per design.md §9 */}
                    <td className="px-4 py-3 font-mono text-mono-md font-bold text-on-surface">
                      {row.itemCode}
                    </td>
                    <td className="px-4 py-3 font-body text-body-md text-on-surface">
                      {row.itemName}
                    </td>
                    <td className="px-4 py-3 font-mono text-mono-md text-on-surface">
                      {row.lotNumber}
                    </td>
                    <td className="px-4 py-3 font-mono text-mono-md text-on-surface">
                      {row.qty}
                    </td>
                    <td className="px-4 py-3 font-mono text-mono-md text-on-surface">
                      {row.fromLocationLabel}
                    </td>
                    <td className="px-4 py-3 font-mono text-mono-md text-on-surface">
                      {row.pickListNumber ?? "—"}
                    </td>
                    <td className="px-4 py-3 font-body text-body-md text-on-surface">
                      {row.customerPartyName ?? "—"}
                    </td>
                    {/* Acknowledgement receipt — v1 not yet joined; placeholder */}
                    <td className="px-4 py-3 font-mono text-mono-md text-on-surface">
                      —
                    </td>
                    <td className="px-4 py-3 font-mono text-mono-md text-on-surface">
                      {row.performedByUserId}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
