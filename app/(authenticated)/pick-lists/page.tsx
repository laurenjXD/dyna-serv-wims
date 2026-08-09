// Pick Lists — office list of committed pick lists.
//
// Traceability:
//   specs/08-outgoing-withdrawal-and-two-stage-commitment/requirements.md
//     R5.3 — on success system SHALL expose the operational pick_list to
//             the floor workflow.
//     R5.7 — the resulting pick_list SHALL be operational; it is not an
//             unpriced withdrawal_slip.
//   specs/08-outgoing-withdrawal-and-two-stage-commitment/design.md §3 (route)
//   specs/00-steering/brand-design-system.md §6 (office surface, Level 1 elevation)
//
// Surface: Office — desktop-first, secondary mobile support.
// Permission gate: withdrawal.view

import Link from "next/link";
import { notFound } from "next/navigation";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db/client";
import { listPickLists } from "@/lib/db/queries/withdrawals";
import type { PickListRow } from "@/lib/db/queries/withdrawals";

// ─── Status badge colors ─────────────────────────────────────────────────────
// brand-design-system.md §1.3 semantic color mapping per task spec:
// allocated → status-pending (amber); picked → brand-navy; dispatched → status-available.

const STATUS_CLASSES: Record<string, string> = {
  allocated: "bg-status-pending text-on-surface",
  picked: "bg-brand-navy text-surface-white",
  dispatched: "bg-status-available text-on-surface",
};

const STATUS_LABELS: Record<string, string> = {
  allocated: "ALLOCATED",
  picked: "PICKED",
  dispatched: "DISPATCHED",
};

const FLOW_LABELS: Record<string, string> = {
  vmi: "VMI",
  trading: "Trading",
  supplies: "Supplies",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function PickListsPage() {
  const resolver = await createPageResolver();

  // Gate: withdrawal.view required to list pick lists.
  // 2026-08-08: "withdrawal.view" -> "pick_list.read" — see outgoing-ledger/page.tsx's note.
  const permResult = await requirePermission(resolver, "pick_list.read");
  if (permResult.kind !== "authorized") {
    notFound();
  }

  const { rows } = await listPickLists(db, { limit: 50, offset: 0 });

  return (
    <div className="mx-auto max-w-container">
      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading font-semibold text-headline-md text-brand-navy">
            Pick Lists
          </h1>
          <p className="mt-1 font-body text-body-md text-text-grey">
            Committed pick lists — allocated, in-progress, and dispatched.
          </p>
        </div>
      </div>

      {/* Pick list table — Level 1 office elevation per brand-design-system.md §6 */}
      <div className="mt-6 overflow-hidden rounded-md bg-white/75 backdrop-blur-md shadow-elevation-1">
        {rows.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="font-body text-body-md text-text-grey">
              No pick lists yet.
            </p>
            <p className="mt-2 font-body text-body-sm text-text-grey">
              Pick lists are generated from the Master Inventory when stock is
              committed for outgoing withdrawal.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-outline-variant/30 bg-surface-light-grey">
                  {/* Epilogue SemiBold uppercase headers per §9 tables */}
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Flow Type
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Customer Party
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Created
                  </th>
                  <th className="sr-only px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/30">
                {rows.map((row: PickListRow) => (
                  <tr key={row.id} className="hover:bg-surface-light-grey/50">
                    <td className="px-4 py-3">
                      {/* Status badge — radius-full, §1.3 semantic colors */}
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 font-label text-label uppercase ${STATUS_CLASSES[row.status] ?? "bg-status-neutral text-on-surface"}`}
                      >
                        {STATUS_LABELS[row.status] ?? row.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-body text-body-md text-on-surface">
                      {FLOW_LABELS[row.flowType] ?? row.flowType}
                    </td>
                    {/* Roboto Mono for party IDs per §9 */}
                    <td className="px-4 py-3 font-mono text-mono-md text-on-surface">
                      {row.customerPartyId}
                    </td>
                    <td className="px-4 py-3 font-body text-body-md text-text-grey">
                      {row.createdAt.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {/* Execute link — h-11 (44px) office touch target */}
                      <Link
                        href={`/pick-lists/${row.id}/pick`}
                        className="inline-flex h-11 items-center font-label text-label text-brand-navy underline hover:text-brand-royal-blue focus:outline-none focus:ring-2 focus:ring-brand-navy"
                      >
                        Execute
                      </Link>
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
