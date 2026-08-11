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
//
// Surface: Floor (primary) / Office (secondary review).
// Permission gate: pick_list.read — notFound if not authorized.

import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, ChevronRight, Activity, Clock } from "lucide-react";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db/client";
import { listPickLists } from "@/lib/db/queries/withdrawals";
import type { PickListRow } from "@/lib/db/queries/withdrawals";
import { listOutgoingLedger } from "@/lib/actions/withdrawals";
import type { OutgoingLedgerRow } from "@/lib/db/queries/withdrawals";

// ─── Status badge colors ─────────────────────────────────────────────────────
// brand-design-system.md §1.3 semantic color mapping:
const STATUS_CLASSES: Record<string, string> = {
  allocated: "bg-status-warning text-on-surface",
  picked: "bg-primary text-white",
  dispatched: "bg-status-success text-on-surface",
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

  // Gate: pick_list.read required
  const permResult = await requirePermission(resolver, "pick_list.read");
  if (permResult.kind !== "authorized") {
    notFound();
  }

  const isFloor = permResult.context.activeRoleKeys.includes("warehouse_staff");

  if (isFloor) {
    const { rows } = await listPickLists(db, { limit: 50, offset: 0 });
    // Filter to active picks
    const floorRows = rows.filter(r => r.status === "allocated" || r.status === "picked");

    return (
      <div className="flex min-h-screen flex-col bg-primary px-4 py-4">
        {/* Floor top bar */}
        <div className="flex items-center justify-between pb-4">
          <h1 className="font-heading font-extrabold text-headline-md text-white">
            Active Picks
          </h1>
        </div>

        {floorRows.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <CheckCircle2 size={48} strokeWidth={1.5} className="text-status-success" aria-hidden="true" />
            <p className="font-heading font-semibold text-headline-md text-white">
              All caught up
            </p>
            <p className="font-body text-body-md text-white/70">
              No open pick lists right now.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {floorRows.map((pickList) => {
              const isPicked = pickList.status === "picked";
              const nextRoute = isPicked ? "dispatch" : "pick";
              return (
                <Link
                  key={pickList.id}
                  href={`/pick-lists/${pickList.id}/${nextRoute}`}
                  className="block rounded-xl bg-white/10 border border-white/20 p-4 h-auto min-h-16 active:scale-[0.97] motion-safe:transition-transform motion-safe:duration-100 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-primary"
                >
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-mono-lg font-bold text-white">
                        {pickList.pickListNumber}
                      </p>
                      <p className="mt-1 font-body text-body-md text-white/70">
                        {FLOW_LABELS[pickList.flowType] ?? pickList.flowType} — Party: <span className="font-mono">{pickList.customerPartyId.split('-')[0]}</span>
                      </p>
                      <div className="mt-2">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-3 py-1 font-label text-body-md uppercase ${
                            isPicked
                              ? "bg-status-success/20 text-status-success"
                              : "bg-status-warning/20 text-status-warning"
                          }`}
                        >
                          {isPicked
                            ? <CheckCircle2 size={20} strokeWidth={2} aria-hidden="true" className="text-status-success" />
                            : <Activity size={20} strokeWidth={2} aria-hidden="true" className="text-status-warning" />}
                          {STATUS_LABELS[pickList.status] ?? pickList.status}
                        </span>
                      </div>
                    </div>
                    <ChevronRight size={24} strokeWidth={2} aria-hidden="true" className="shrink-0 text-white/50 self-center" />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // --- Office View ---
  return (
    <div className="mx-auto max-w-container">
      {/* Page header */}
      <div>
        <h1 className="font-heading font-extrabold text-headline-md text-on-surface">
          Outgoing
        </h1>
        <p className="mt-1 font-body text-body-md text-on-surface-variant">
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
              className={`flex h-11 items-center border-b-2 px-4 font-label text-label uppercase tracking-[0.05em] focus:outline-none focus:ring-2 focus:ring-primary ${
                isActive
                  ? "border-action-blue text-primary"
                  : "border-transparent text-on-surface-variant hover:text-primary"
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
    <div className="mt-6 overflow-hidden rounded-md bg-white shadow-elevation-1">
      {rows.length === 0 ? (
        <div className="px-6 py-12 text-center">
          <p className="font-body text-body-md text-on-surface-variant">
            No active pick lists.
          </p>
          <p className="mt-2 font-body text-body-sm text-on-surface-variant">
            Pick lists appear here once created. Scan items against each pick
            list to execute.
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-outline-variant/30 bg-surface-dim">
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-on-surface-variant">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-on-surface-variant">
                    Flow Type
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-on-surface-variant">
                    Pick List #
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-on-surface-variant">
                    Customer Party
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-on-surface-variant">
                    Created
                  </th>
                  <th className="sr-only px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/30">
                {rows.map((row: PickListRow) => (
                  <tr key={row.id} className="hover:bg-surface-dim/50">
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 font-label text-label uppercase ${STATUS_CLASSES[row.status] ?? "bg-status-neutral text-on-surface"}`}
                      >
                        {STATUS_LABELS[row.status] ?? row.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-body text-body-md text-on-surface">
                      {FLOW_LABELS[row.flowType] ?? row.flowType}
                    </td>
                    <td className="px-4 py-3 font-mono text-mono-md text-on-surface">
                      {row.pickListNumber}
                    </td>
                    <td className="px-4 py-3 font-mono text-mono-md text-on-surface">
                      {row.customerPartyId}
                    </td>
                    <td className="px-4 py-3 font-body text-body-md text-on-surface-variant">
                      {row.createdAt.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/pick-lists/${row.id}/${row.status === "picked" ? "dispatch" : "pick"}`}
                        className="inline-flex h-11 items-center font-label text-label text-primary underline hover:text-secondary focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        Execute
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-6 py-3 font-body text-body-sm text-on-surface-variant border-t border-outline-variant/30">
            Scan items against each pick list to execute. Acknowledgement receipt
            is generated after dispatch.
          </p>
        </>
      )}
    </div>
  );
}

// ─── Outgoing Ledger tab ──────────────────────────────────────────────────────

async function OutgoingLedgerTab({
  resolver,
}: {
  resolver: Awaited<ReturnType<typeof createPageResolver>>;
}) {
  const ledgerResult = await listOutgoingLedger(resolver, {
    limit: 100,
    offset: 0,
  });

  const rows: OutgoingLedgerRow[] =
    "rows" in ledgerResult ? ledgerResult.rows : [];

  return (
    <div className="mt-6">
      <p className="font-body text-body-md text-on-surface-variant">
        Read-only record of outgoing inventory transactions (picks). No edits
        or deletions — corrections use new approved transactions.
      </p>

      <div className="mt-4 overflow-hidden rounded-md bg-white shadow-elevation-1">
        {rows.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="font-body text-body-md text-on-surface-variant">
              No outgoing transactions yet.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-outline-variant/30 bg-surface-dim">
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-on-surface-variant">Date/Time</th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-on-surface-variant">Transaction #</th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-on-surface-variant">Item Code</th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-on-surface-variant">Item Name</th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-on-surface-variant">Lot Number</th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-on-surface-variant">Qty</th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-on-surface-variant">From Location</th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-on-surface-variant">Pick List #</th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-on-surface-variant">Customer Party</th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-on-surface-variant">Receipt #</th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-on-surface-variant">Performed By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/30">
                {rows.map((row: OutgoingLedgerRow) => (
                  <tr key={row.transactionId} className="hover:bg-surface-dim/50">
                    <td className="px-4 py-3 font-body text-body-md text-on-surface-variant">{row.createdAt.toLocaleString()}</td>
                    <td className="px-4 py-3 font-mono text-mono-md text-on-surface">{row.transactionNumber}</td>
                    <td className="px-4 py-3 font-mono text-mono-md font-bold text-on-surface">{row.itemCode}</td>
                    <td className="px-4 py-3 font-body text-body-md text-on-surface">{row.itemName}</td>
                    <td className="px-4 py-3 font-mono text-mono-md text-on-surface">{row.lotNumber}</td>
                    <td className="px-4 py-3 font-mono text-mono-md text-on-surface">{row.qty}</td>
                    <td className="px-4 py-3 font-mono text-mono-md text-on-surface">{row.fromLocationLabel}</td>
                    <td className="px-4 py-3 font-mono text-mono-md text-on-surface">{row.pickListNumber ?? "—"}</td>
                    <td className="px-4 py-3 font-body text-body-md text-on-surface">{row.customerPartyName ?? "—"}</td>
                    <td className="px-4 py-3 font-mono text-mono-md text-on-surface">—</td>
                    <td className="px-4 py-3 font-mono text-mono-md text-on-surface">{row.performedByUserId}</td>
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
