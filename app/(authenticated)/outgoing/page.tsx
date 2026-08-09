// Outgoing — floor pick execution hub: Active Picks + Outgoing Ledger tabs.
//
// Traceability:
//   specs/08-outgoing-withdrawal-and-two-stage-commitment/design.md §3 (route),
//     §9 (Outgoing ledger design)
//   specs/08-outgoing-withdrawal-and-two-stage-commitment/requirements.md
//     R5.3, R5.7 (pick_list exposure), R9.1-R9.4 (Outgoing Ledger contract)
//   specs/00-steering/brand-design-system.md §3 (office tab pattern), §6
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

import Link from "next/link";
import { notFound } from "next/navigation";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db/client";
import { listPickLists } from "@/lib/db/queries/withdrawals";
import type { PickListRow } from "@/lib/db/queries/withdrawals";
import { listOutgoingLedger } from "@/lib/actions/withdrawals";
import type { OutgoingLedgerRow } from "@/lib/db/queries/withdrawals";

// ─── Status badge colors ─────────────────────────────────────────────────────
// brand-design-system.md §1.3 semantic color mapping:
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

type TabKey = "active-picks" | "ledger";

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "active-picks", label: "Active Picks" },
  { key: "ledger", label: "Outgoing Ledger" },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

interface PageProps {
  searchParams: Promise<{ tab?: string }>;
}

export default async function OutgoingPage({ searchParams }: PageProps) {
  const { tab: tabParam } = await searchParams;
  const activeTab: TabKey = tabParam === "ledger" ? "ledger" : "active-picks";

  const resolver = await createPageResolver();

  // Gate: pick_list.read required for both tabs.
  const permResult = await requirePermission(resolver, "pick_list.read");
  if (permResult.kind !== "authorized") {
    notFound();
  }

  return (
    <div className="mx-auto max-w-container">
      {/* Page header */}
      <div>
        <h1 className="font-heading font-extrabold text-headline-md text-on-surface">
          Outgoing
        </h1>
        <p className="mt-1 font-body text-body-md text-text-grey">
          Active pick lists awaiting execution and confirmed outgoing ledger.
        </p>
      </div>

      {/* Tab switcher — office pattern per brand-design-system.md §3 */}
      <div
        role="tablist"
        aria-label="Outgoing sections"
        className="mt-6 flex gap-2 border-b border-outline-variant/30"
      >
        {TABS.map((tab) => {
          const isActive = tab.key === activeTab;
          const href =
            tab.key === "active-picks" ? "/outgoing" : "/outgoing?tab=ledger";
          return (
            <Link
              key={tab.key}
              href={href}
              role="tab"
              aria-selected={isActive}
              className={`flex h-11 items-center border-b-2 px-4 font-label text-label uppercase tracking-[0.05em] focus:outline-none focus:ring-2 focus:ring-brand-navy ${
                isActive
                  ? "border-brand-red text-brand-navy"
                  : "border-transparent text-text-grey hover:text-brand-navy"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {activeTab === "active-picks" ? (
        <ActivePicksTab />
      ) : (
        <OutgoingLedgerTab resolver={resolver} />
      )}
    </div>
  );
}

// ─── Active Picks tab (default) ───────────────────────────────────────────────

async function ActivePicksTab() {
  const { rows } = await listPickLists(db, { limit: 50, offset: 0 });

  return (
    <div className="mt-6 overflow-hidden rounded-md bg-surface-white shadow-elevation-1">
      {rows.length === 0 ? (
        <div className="px-6 py-12 text-center">
          <p className="font-body text-body-md text-text-grey">
            No active pick lists.
          </p>
          <p className="mt-2 font-body text-body-sm text-text-grey">
            Pick lists appear here once created. Scan items against each pick
            list to execute.
          </p>
        </div>
      ) : (
        <>
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
          <p className="px-6 py-3 font-body text-body-sm text-text-grey border-t border-outline-variant/30">
            Scan items against each pick list to execute. Acknowledgement receipt
            is generated after dispatch.
          </p>
        </>
      )}
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
  const ledgerResult = await listOutgoingLedger(resolver, db, {
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

      {/* Ledger table — Level 1 office elevation per brand-design-system.md §6.
          design.md §9: item code is the prominent first field in office review. */}
      <div className="mt-4 overflow-hidden rounded-md bg-surface-white shadow-elevation-1">
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
