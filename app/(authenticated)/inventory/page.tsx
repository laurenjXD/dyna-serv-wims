// Inventory — office withdrawal hub: Stock View + Pick Lists + Daily Inspection tabs.
//
// Traceability:
//   specs/08-outgoing-withdrawal-and-two-stage-commitment/design.md §3 (route),
//     §9 (Outgoing ledger design — ledger content moved to /outgoing per
//     2026-08-09 PO restructuring)
//   specs/08-outgoing-withdrawal-and-two-stage-commitment/requirements.md
//     R5.3, R5.7 (pick_list exposure)
//   specs/11-transfer-and-inspection — Daily Inspection surface (placeholder)
//   specs/00-steering/brand-design-system.md §3 (office tab pattern), §6
//     (office surface, Level 1 elevation)
//   specs/00-steering/revision-log.md (2026-08-09 restructuring — Ledger tab
//     moved to /outgoing; new Stock View and Daily Inspection placeholder tabs)
//
// Surface: Office — desktop-first, secondary mobile support.
// Permission gate: pick_list.read

import Link from "next/link";
import { notFound } from "next/navigation";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db/client";
import { listPickLists } from "@/lib/db/queries/withdrawals";
import type { PickListRow } from "@/lib/db/queries/withdrawals";

// ─── Status badge colors ─────────────────────────────────────────────────────
// brand-design-system.md §1.3 semantic color mapping per task spec:
// allocated → status-warning (amber); picked → primary; dispatched → status-success.

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

type TabKey = "stock-view" | "pick-lists" | "daily-inspection";

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "stock-view", label: "Stock View" },
  { key: "pick-lists", label: "Pick Lists" },
  { key: "daily-inspection", label: "Daily Inspection" },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

interface PageProps {
  searchParams: Promise<{ tab?: string }>;
}

export default async function InventoryPage({ searchParams }: PageProps) {
  const { tab: tabParam } = await searchParams;

  const activeTab: TabKey =
    tabParam === "pick-lists" ? "pick-lists" :
    tabParam === "daily-inspection" ? "daily-inspection" :
    "stock-view";

  const resolver = await createPageResolver();

  // Gate: pick_list.read required for all tabs on this hub.
  const permResult = await requirePermission(resolver, "pick_list.read");
  if (permResult.kind !== "authorized") {
    notFound();
  }

  return (
    <div className="mx-auto max-w-container">
      {/* Page header */}
      <div>
        <h1 className="font-heading font-extrabold text-headline-md text-on-surface">
          Inventory
        </h1>
        <p className="mt-1 font-body text-body-md text-on-surface-variant">
          Stock overview, committed pick lists, and daily inspection initiation.
        </p>
      </div>

      {/* Tab switcher — office pattern per brand-design-system.md §3 */}
      <div
        role="tablist"
        aria-label="Inventory sections"
        className="mt-6 flex gap-2 border-b border-outline-variant/30"
      >
        {TABS.map((tab) => {
          const isActive = tab.key === activeTab;
          const href =
            tab.key === "stock-view"
              ? "/inventory"
              : tab.key === "pick-lists"
              ? "/inventory?tab=pick-lists"
              : "/inventory?tab=daily-inspection";
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

      {activeTab === "stock-view" ? (
        <StockViewTab />
      ) : activeTab === "pick-lists" ? (
        <PickListsTab />
      ) : (
        <DailyInspectionTab />
      )}
    </div>
  );
}

// ─── Stock View tab (default) — placeholder ───────────────────────────────────

function StockViewTab() {
  return (
    <div className="mt-6 rounded-md bg-white shadow-elevation-1 px-6 py-12 text-center">
      <p className="font-body text-body-md text-on-surface-variant">
        Stock view with FIFO/FEFO pick-list generation is coming in the next implementation cycle.
      </p>
      <p className="mt-2 font-body text-body-sm text-on-surface-variant">
        Select items from live inventory to auto-generate a pick list.
      </p>
    </div>
  );
}

// ─── Pick Lists tab ───────────────────────────────────────────────────────────

async function PickListsTab() {
  const { rows } = await listPickLists(db, { limit: 50, offset: 0 });

  return (
    <div className="mt-6 overflow-hidden rounded-md bg-white shadow-elevation-1">
      {rows.length === 0 ? (
        <div className="px-6 py-12 text-center">
          <p className="font-body text-body-md text-on-surface-variant">
            No pick lists yet.
          </p>
          <p className="mt-2 font-body text-body-sm text-on-surface-variant">
            Pick lists are generated from the Master Inventory when stock is
            committed for outgoing withdrawal.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-outline-variant/30 bg-surface-dim">
                {/* Epilogue SemiBold uppercase headers per §9 tables */}
                <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-on-surface-variant">
                  Status
                </th>
                <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-on-surface-variant">
                  Flow Type
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
                  <td className="px-4 py-3 font-body text-body-md text-on-surface-variant">
                    {row.createdAt.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {/* Execute link — h-11 (44px) office touch target */}
                    <Link
                      href={`/pick-lists/${row.id}/pick`}
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
      )}
    </div>
  );
}

// ─── Daily Inspection tab — placeholder ───────────────────────────────────────

function DailyInspectionTab() {
  return (
    <div className="mt-6 rounded-md bg-white shadow-elevation-1 px-6 py-12 text-center">
      <p className="font-body text-body-md text-on-surface-variant">
        Daily Inspection initiation is managed here (Supervisor / Administrator only).
      </p>
    </div>
  );
}
