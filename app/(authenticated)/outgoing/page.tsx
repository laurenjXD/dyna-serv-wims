// Outgoing — floor pick execution hub: Active Picks + Outgoing Ledger tabs.
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

import Link from "next/link";
import { notFound } from "next/navigation";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db/client";
import { listPickLists } from "@/lib/db/queries/withdrawals";
import type { PickListRow } from "@/lib/db/queries/withdrawals";
import { listOutgoingLedger } from "@/lib/actions/withdrawals";
import type { OutgoingLedgerRow } from "@/lib/db/queries/withdrawals";
import { ArrowRight, Boxes, CheckCircle2, Filter, PackageCheck, Truck } from "lucide-react";

// ─── Status badge colors ─────────────────────────────────────────────────────
// design.md §1.3 semantic color mapping:
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

  // Separate permission check for the execute action — used to show/hide the
  // "Start picking" CTA. pick_list.read already gate the page; pick_list.execute
  // gates the action button itself.
  const canExecutePick =
    (await requirePermission(resolver, "pick_list.execute")).kind === "authorized";

  return (
    <div className="mx-auto max-w-container pb-10">
      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><h1 className="font-heading text-headline-lg font-bold tracking-tight text-on-surface">Pick List Management</h1><p className="mt-1 font-body text-body-md text-text-grey">Review allocated stock, execute picks, and confirm dispatch.</p></div>
        <div className="flex gap-2"><Link href="/outgoing" className="inline-flex h-12 items-center gap-2 rounded border border-outline-variant bg-surface-white px-4 font-label text-body-md font-bold text-on-surface shadow-elevation-1"><Filter size={18} aria-hidden="true" />Filter</Link><Link href="/inventory" className="inline-flex h-12 items-center gap-2 rounded bg-brand-navy px-5 font-label text-body-md font-bold text-surface-white shadow-elevation-1"><Boxes size={19} aria-hidden="true" />Stock View</Link></div>
      </div>

      {/* Tab switcher — office pattern per design.md §3 */}
      <div
        role="tablist"
        aria-label="Outgoing sections"
        className="mt-6 flex gap-7 overflow-x-auto border-b border-outline-variant"
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
              className={`flex h-12 shrink-0 items-center border-b-2 px-1 font-label text-body-md font-bold focus:outline-none focus:ring-2 focus:ring-brand-navy ${
                isActive
                  ? "border-on-surface text-on-surface"
                  : "border-transparent text-text-grey hover:text-on-surface"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {activeTab === "active-picks" ? (
        <ActivePicksTab canExecute={canExecutePick} />
      ) : (
        <OutgoingLedgerTab resolver={resolver} />
      )}
    </div>
  );
}

// ─── Active Picks tab (default) ───────────────────────────────────────────────

async function ActivePicksTab({ canExecute }: { canExecute: boolean }) {
  // Both allocated and picked documents are still active work. A picked list
  // has not affected stock yet, so it belongs here until Dispatch succeeds.
  const [{ rows: allocatedRows }, { rows: pickedRows }] = await Promise.all([
    listPickLists(db, { limit: 50, offset: 0, status: "allocated" }),
    listPickLists(db, { limit: 50, offset: 0, status: "picked" }),
  ]);
  const rows = [...allocatedRows, ...pickedRows].sort(
    (first, second) => first.createdAt.getTime() - second.createdAt.getTime(),
  );

  const allocatedCount = rows.filter((row) => row.status === "allocated").length;
  const pickedCount = rows.filter((row) => row.status === "picked").length;

  return (
    <div className="mt-7 grid gap-7 lg:grid-cols-[minmax(0,1fr)_340px]">
      <section className="min-w-0">
        <div className="flex items-center justify-between gap-3"><h2 className="font-heading text-headline-md font-bold text-on-surface">Active Pick Lists</h2><span className="rounded-full bg-[#DCE6FF] px-3 py-1 font-label text-label font-bold text-brand-navy">{rows.length} active</span></div>
        <div className="mt-4 space-y-3">
      {rows.length === 0 ? (
        <div className="rounded border border-outline-variant bg-surface-white px-6 py-12 text-center shadow-elevation-1">
          <PackageCheck className="mx-auto text-status-neutral" size={32} aria-hidden="true" />
          <p className="font-body text-body-md text-text-grey">
            No active pick lists.
          </p>
          <p className="mt-2 font-body text-body-sm text-text-grey">
            Allocated and picked lists stay here until their dispatch is complete.
          </p>
        </div>
      ) : (
        rows.map((row: PickListRow) => <article key={row.id} className="rounded border border-outline-variant bg-surface-white p-4 shadow-elevation-1 transition-shadow hover:shadow-elevation-2"><div className="grid items-center gap-4 md:grid-cols-[auto_minmax(0,1fr)_auto_auto]">
          <div className={`flex h-12 w-12 items-center justify-center rounded ${row.status === "picked" ? "bg-status-available/15 text-status-available" : "bg-[#E4ECFF] text-brand-navy"}`}>{row.status === "picked" ? <CheckCircle2 size={24} aria-hidden="true" /> : <PackageCheck size={24} aria-hidden="true" />}</div>
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-mono text-mono-md font-bold text-on-surface">{row.pickListNumber}</p><span className={`inline-flex rounded-full px-2 py-1 font-label text-label font-bold uppercase ${STATUS_CLASSES[row.status] ?? "bg-status-neutral text-on-surface"}`}>{STATUS_LABELS[row.status] ?? row.status.toUpperCase()}</span></div><p className="mt-1 truncate font-body text-body-md font-bold text-on-surface">{row.customerPartyName ?? row.customerPartyId}</p><p className="mt-1 font-body text-body-sm text-text-grey">{FLOW_LABELS[row.flowType] ?? row.flowType} · Created {row.createdAt.toLocaleString()}</p></div>
          <div className="md:text-right"><p className="font-label text-label font-bold uppercase text-text-grey">Next step</p><p className="mt-1 font-body text-body-md font-bold text-on-surface">{row.status === "picked" ? "Dispatch" : "Pick & verify"}</p></div>
          {canExecute ? <Link href={row.status === "picked" ? `/pick-lists/${row.id}/dispatch` : `/pick-lists/${row.id}/pick`} className="inline-flex h-12 items-center justify-center gap-2 rounded border border-brand-navy bg-surface-white px-4 font-label text-body-md font-bold text-brand-navy">{row.status === "picked" ? "Dispatch" : "Start Pick"}<ArrowRight size={18} aria-hidden="true" /></Link> : <span className="font-label text-label text-text-grey">View only</span>}
        </div></article>)
      )}
        </div>
      </section>
      <aside className="space-y-5"><section className="rounded border border-outline-variant bg-surface-white p-5 shadow-elevation-1"><div className="flex items-center gap-2"><Truck size={23} className="text-brand-navy" aria-hidden="true" /><h2 className="font-heading text-title-lg font-bold text-on-surface">Queue Overview</h2></div><div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded border border-[#C9D8FF] bg-[#EEF3FF] p-4"><p className="font-label text-label font-bold uppercase text-text-grey">To Pick</p><p className="mt-2 font-heading text-headline-lg font-bold text-brand-navy">{allocatedCount}</p></div><div className="rounded bg-brand-navy p-4 text-surface-white"><p className="font-label text-label font-bold uppercase text-[#AFC5FF]">To Dispatch</p><p className="mt-2 font-heading text-headline-lg font-bold">{pickedCount}</p></div></div><p className="mt-4 font-body text-body-sm text-text-grey">Pallet verification happens once during execution. Dispatch becomes available after every committed line is confirmed.</p></section></aside>
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
      <div className="mt-6 overflow-hidden rounded-xl border border-outline-variant/30 bg-surface-white shadow-elevation-2 md:shadow-elevation-1">
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
