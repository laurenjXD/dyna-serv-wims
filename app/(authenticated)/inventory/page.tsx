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
import { ChevronRight, Download, Search, SlidersHorizontal } from "lucide-react";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db/client";
import { listStockView, type StockViewRow } from "@/lib/db/queries/inventory";
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

type TabKey = "stock-view" | "pick-lists" | "daily-inspection";

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "stock-view", label: "Stock View" },
  { key: "pick-lists", label: "Pick Lists" },
  { key: "daily-inspection", label: "Daily Inspection" },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

interface PageProps {
  searchParams: Promise<{ tab?: string; q?: string }>;
}

export default async function InventoryPage({ searchParams }: PageProps) {
  const { tab: tabParam, q } = await searchParams;

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
      <div
        role="tablist"
        aria-label="Inventory sections"
        className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant/30"
      >
        <div className="flex gap-6 overflow-x-auto">
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
              className={`flex h-12 shrink-0 items-center border-b-2 px-1 font-label text-label font-semibold tracking-[0.03em] focus:outline-none focus:ring-2 focus:ring-brand-navy ${
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
        <form method="GET" className="flex items-center gap-2 pb-2">
          <input type="hidden" name="tab" value={activeTab} />
          <label htmlFor="inventory-search" className="sr-only">Search inventory</label>
          <div className="hidden h-10 items-center gap-2 rounded-full border border-outline-variant/30 bg-surface-light-grey px-3 md:flex">
            <Search size={18} aria-hidden="true" className="text-text-grey" />
            <input id="inventory-search" name="q" type="search" defaultValue={q ?? ""} placeholder="Search SKU, Lot..." className="w-40 bg-transparent font-body text-body-sm text-on-surface placeholder:text-status-neutral focus:outline-none" />
          </div>
          <button type="submit" className="inline-flex h-11 items-center gap-2 rounded border border-outline-variant/30 bg-surface-white px-4 font-label text-label font-semibold text-on-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"><SlidersHorizontal size={16} aria-hidden="true" />Filters</button>
          <button type="button" className="inline-flex h-11 items-center gap-2 rounded bg-on-surface px-4 font-label text-label font-semibold text-surface-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"><Download size={16} aria-hidden="true" />Export</button>
        </form>
      </div>

      {activeTab === "stock-view" ? (
        <StockViewTab query={q} />
      ) : activeTab === "pick-lists" ? (
        <PickListsTab />
      ) : (
        <DailyInspectionTab />
      )}
    </div>
  );
}

// ─── Stock View tab (default) ─────────────────────────────────────────────────

async function StockViewTab({ query }: { query?: string }) {
  const rows = await listStockView(db);
  const normalizedQuery = query?.trim().toLowerCase() ?? "";
  const items = groupStockByItem(rows).filter((item) => !normalizedQuery || `${item.itemCode} ${item.itemName} ${item.lots.map((lot) => lot.lotNumber).join(" ")}`.toLowerCase().includes(normalizedQuery));

  return (
    <div className="mt-4 min-h-[680px] overflow-x-auto rounded-lg border border-outline-variant/30 bg-surface-white shadow-elevation-1">
      {items.length === 0 ? (
        <div className="px-6 py-12 text-center">
          <p className="font-body text-body-md text-text-grey">
            No available stock is ready for allocation.
          </p>
          <p className="mt-2 font-body text-body-sm text-text-grey">
            Confirmed receipts appear here when their lots are available for picking.
          </p>
        </div>
      ) : (
        <div className="min-w-[760px] divide-y divide-outline-variant/30">
          <div className="grid grid-cols-[40px_210px_minmax(220px,1fr)_120px_140px_160px] items-center bg-accent-indigo-50 px-5 py-3 font-label text-label font-semibold tracking-[0.04em] text-text-grey">
            <span aria-hidden="true" />
            <span>Item Code</span><span>Name</span><span>UOM</span><span className="text-right">Stock Level</span><span>Status</span>
          </div>
          {items.map((item) => (
            <details key={item.itemId} className="group">
              <summary className="grid cursor-pointer list-none grid-cols-[40px_210px_minmax(220px,1fr)_120px_140px_160px] items-center px-5 py-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-navy hover:bg-surface-light-grey/40">
                <ChevronRight size={22} aria-hidden="true" className="text-text-grey transition-transform group-open:rotate-90" />
                <p className="font-mono text-mono-md font-bold text-on-surface">{item.itemCode}</p>
                <p className="font-body text-body-md text-on-surface">{item.itemName}</p>
                <p className="font-body text-body-md text-text-grey">{item.uom}</p>
                <p className="text-right font-mono text-mono-lg font-bold text-on-surface">{item.availableQty.toLocaleString()}</p>
                <span className="inline-flex w-fit items-center rounded-full bg-on-surface px-3 py-1 font-label text-label tracking-[0.06em] text-surface-white">ON HAND</span>
              </summary>
              <div className="border-t border-outline-variant/30 bg-surface-light-grey/45 px-4 py-4 md:px-6">
                <p className="font-body text-body-md text-text-grey">
                  Lots are shown in {item.isPerishable ? "FEFO" : "FIFO"} order. Review the location and lot sequence before creating a pick list.
                </p>
                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {item.lots.map((lot) => (
                    <article key={`${lot.lotId}-${lot.locationId}`} className="rounded-md border border-outline-variant/30 bg-surface-white p-4">
                      <p className="font-mono text-mono-md font-bold text-on-surface">{lot.lotNumber}</p>
                      <p className="mt-1 font-body text-body-md text-text-grey">Location {lot.locationLabel}</p>
                      <dl className="mt-3 grid grid-cols-2 gap-3 font-body text-body-md">
                        <div><dt className="font-label text-label uppercase text-text-grey">Available</dt><dd className="mt-1 text-on-surface">{lot.availableQty.toLocaleString()} {item.uom}</dd></div>
                        <div><dt className="font-label text-label uppercase text-text-grey">Expiry</dt><dd className="mt-1 text-on-surface">{lot.expiryDate ?? "Not dated"}</dd></div>
                      </dl>
                    </article>
                  ))}
                </div>
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}

function groupStockByItem(rows: StockViewRow[]) {
  const grouped = new Map<string, {
    itemId: string; itemCode: string; itemName: string; uom: string; isPerishable: boolean; availableQty: number;
    lots: Array<StockViewRow & { availableQty: number }>;
  }>();

  for (const row of rows) {
    const availableQty = row.qtyRemaining - row.qtyCommitted;
    const current = grouped.get(row.itemId);
    if (current) {
      current.availableQty += availableQty;
      current.lots.push({ ...row, availableQty });
    } else {
      grouped.set(row.itemId, {
        itemId: row.itemId,
        itemCode: row.itemCode,
        itemName: row.itemName,
        uom: row.uom,
        isPerishable: row.isPerishable,
        availableQty,
        lots: [{ ...row, availableQty }],
      });
    }
  }

  return [...grouped.values()];
}

// ─── Pick Lists tab ───────────────────────────────────────────────────────────

async function PickListsTab() {
  const { rows } = await listPickLists(db, { limit: 50, offset: 0 });

  return (
    <div className="mt-6 overflow-hidden rounded-md border border-outline-variant/30 bg-surface-white shadow-elevation-1">
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
  );
}

// ─── Daily Inspection tab — placeholder ───────────────────────────────────────

function DailyInspectionTab() {
  return (
    <section className="mt-6 rounded-md border border-outline-variant/30 bg-surface-white p-6 shadow-elevation-1">
      <p className="font-label text-label uppercase tracking-[0.05em] text-text-grey">Quality control</p>
      <h2 className="mt-2 font-heading text-headline-md font-semibold text-on-surface">Daily Inspection</h2>
      <p className="mt-2 max-w-2xl font-body text-body-md text-text-grey">
        Review held and aging lots in the shared inspection queue. Inspection resolution remains restricted to the approved Supervisor capability.
      </p>
      <Link href="/inspection" className="mt-6 inline-flex h-11 items-center justify-center rounded bg-brand-red px-5 font-label text-label text-surface-white hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy focus-visible:ring-offset-2">
        Open inspection queue
      </Link>
    </section>
  );
}
