// Outgoing Ledger — read-only office view of outgoing inventory transactions.
//
// Traceability:
//   specs/08-outgoing-withdrawal-and-two-stage-commitment/requirements.md
//     R9.1 — Outgoing Ledger SHALL be a filtered view of authoritative
//             inventory_transactions, primarily movement_type = 'pick'.
//     R9.2 — it SHALL show authorized date/time, item code, description, lot,
//             location, quantity/UOM, pick list, destination/party, flow type,
//             dispatching user, and document references.
//     R9.3 — it SHALL support date, party/destination, flow, item/code, lot,
//             and pick-list filters subject to authorization.
//     R9.4 — it SHALL remain read-only; corrections/reversals use approved new
//             transactions, never edits/deletes of immutable history.
//   specs/08-outgoing-withdrawal-and-two-stage-commitment/design.md §9 (ledger
//     design, column list added 2026-08-08)
//   specs/00-steering/brand-design-system.md §6 (office surface, Level 1 elevation)
//
// Surface: Office — desktop-first, secondary mobile support.
// Permission gate: withdrawal.view
// R9.4: this page module exports ONLY the default component (no mutation side-exports).

import { notFound } from "next/navigation";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db/client";
import { listOutgoingLedger } from "@/lib/actions/withdrawals";
import type { OutgoingLedgerRow } from "@/lib/db/queries/withdrawals";

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function OutgoingLedgerPage() {
  const resolver = await createPageResolver();

  // Gate: withdrawal.view required to view the outgoing ledger (R9.1, R10.1).
  const permResult = await requirePermission(resolver, "withdrawal.view");
  if (permResult.kind !== "authorized") {
    notFound();
  }

  const ledgerResult = await listOutgoingLedger(resolver, db, {
    limit: 100,
    offset: 0,
  });

  // listOutgoingLedger returns { rows, total } on success or { ok: false } on error.
  const rows: OutgoingLedgerRow[] =
    "rows" in ledgerResult ? ledgerResult.rows : [];

  return (
    <div className="mx-auto max-w-container">
      {/* Page header */}
      <div>
        <h1 className="font-heading font-semibold text-headline-md text-brand-navy">
          Outgoing Ledger
        </h1>
        <p className="mt-1 font-body text-body-md text-text-grey">
          Read-only record of outgoing inventory transactions (picks). No
          edits or deletions — corrections use new approved transactions.
        </p>
      </div>

      {/* Ledger table — Level 1 office elevation per brand-design-system.md §6.
          design.md §9: item code is the prominent first field in office review. */}
      <div className="mt-6 overflow-hidden rounded-md bg-white/75 backdrop-blur-md shadow-elevation-1">
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
                    Customer Party
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
