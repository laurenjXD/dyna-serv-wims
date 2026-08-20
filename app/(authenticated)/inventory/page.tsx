// Inventory — office withdrawal hub: Stock View + Pick Lists + Inspection tabs.
//
// Traceability:
//   specs/08-outgoing-withdrawal-and-two-stage-commitment/design.md §3 (route),
//     §9 (Outgoing ledger design — ledger content moved to /outgoing per
//     2026-08-09 PO restructuring)
//   specs/08-outgoing-withdrawal-and-two-stage-commitment/requirements.md
//     R5.3, R5.7 (pick_list exposure)
//   specs/11-transfer-and-inspection — Inspection tab renders the merged
//     transfer + inspection queue (listInspectionAndTransferQueue), gated
//     independently on transfer.view / inspection.perform. "Inspection"
//     replaces the retired "Daily Inspection" label per Terminology
//     Alignment §12.
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
import { listInspectionAndTransferQueue } from "@/lib/db/queries/transfers";
import { resolveInventoryTab, type TabKey } from "./_lib/resolveInventoryTab";
import { InspectionTab } from "./_components/InspectionTab";
import { PickListGenerator } from "./_components/PickListGenerator";
import { createPickList } from "./actions";

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

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "stock-view", label: "Stock View" },
  { key: "pick-lists", label: "Pick Lists" },
  { key: "inspection", label: "Inspection" },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

interface PageProps {
  searchParams: Promise<{ tab?: string; q?: string; pickListError?: string }>;
}

export default async function InventoryPage({ searchParams }: PageProps) {
  const { tab: tabParam, q, pickListError } = await searchParams;

  const activeTab: TabKey = resolveInventoryTab(tabParam);

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
              : "/inventory?tab=inspection";
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
          <Link href="/inventory/export" className="inline-flex h-11 items-center gap-2 rounded bg-on-surface px-4 font-label text-label font-semibold text-surface-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"><Download size={16} aria-hidden="true" />Export Excel</Link>
        </form>
      </div>

      {pickListError && (
        <div role="alert" className="mt-4 rounded-lg border-l-4 border-status-held bg-surface-white p-4 shadow-elevation-1">
          <p className="font-heading text-body-md font-semibold text-on-surface">Pick list was not created</p>
          <p className="mt-1 font-body text-body-md text-on-surface">{pickListError === "forbidden" ? "Your account does not have permission to generate pick lists." : `Reason: ${pickListError.replaceAll(",", ", ")}`}</p>
          <p className="mt-1 font-body text-body-md text-text-grey">Check the destination organization and available quantity, then try again.</p>
        </div>
      )}

      {activeTab === "stock-view" ? (
        <StockViewTab query={q} />
      ) : activeTab === "pick-lists" ? (
        <PickListsTab />
      ) : (
        <InspectionTabSection />
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
    <div className="mt-4 min-h-[680px] overflow-x-auto rounded-xl border border-outline-variant/30 bg-surface-white shadow-elevation-1">
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
          <div className="grid grid-cols-[40px_210px_minmax(220px,1fr)_120px_150px_170px] items-center gap-x-3 bg-accent-indigo-50 px-5 py-3 font-label text-label font-semibold tracking-[0.04em] text-text-grey">
            <span aria-hidden="true" />
            <span>Item Code</span><span>Name</span><span>UOM</span><span className="text-right">Stock Level</span><span className="pl-6">Status</span>
          </div>
          {items.map((item) => (
            <details key={item.itemId} className="group">
              <summary className="grid cursor-pointer list-none grid-cols-[40px_210px_minmax(220px,1fr)_120px_150px_170px] items-center gap-x-3 px-5 py-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-navy hover:bg-surface-light-grey/40">
                <ChevronRight size={22} aria-hidden="true" className="text-text-grey transition-transform group-open:rotate-90" />
                <p className="font-mono text-mono-md font-bold text-on-surface">{item.itemCode}</p>
                <p className="font-body text-body-md text-on-surface">{item.itemName}</p>
                <p className="font-body text-body-md text-text-grey">{item.uom}</p>
                <p className="text-right font-mono text-mono-lg font-bold text-on-surface">{item.availableQty.toLocaleString()}</p>
                <span className="ml-6 inline-flex w-fit items-center rounded-full bg-on-surface px-3 py-1 font-label text-label tracking-[0.06em] text-surface-white">ON HAND</span>
              </summary>
              <div className="border-t border-outline-variant/30 bg-surface-light-grey/45 px-4 py-4 md:px-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-body text-body-md text-text-grey">
                    Lots are shown in {item.isPerishable ? "FEFO" : "FIFO"} order.
                  </p>
                  <PickListGenerator
                    itemId={item.itemId}
                    flowType={item.flowType}
                    organizationId={item.organizationId}
                    lots={rows.filter((row) => row.itemId === item.itemId).map((row) => ({ lotId: row.lotId, locationId: row.locationId, availableQty: row.qtyRemaining - row.qtyCommitted }))}
                    action={createPickList}
                  />
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {item.lots.map((lot) => (
                    <article key={lot.lotId} className="rounded-xl border border-outline-variant/30 bg-surface-white p-4">
                      {/* FEFO/FIFO priority badge — left accent bar signal */}
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-mono text-mono-md font-bold text-on-surface">{lot.lotNumber}</p>
                        <span className="inline-flex shrink-0 items-center rounded-full bg-on-surface px-2 py-0.5 font-label text-label text-surface-white">
                          {item.isPerishable ? "FEFO" : "FIFO"} #{lot.priority}
                        </span>
                      </div>
                      {/* Stacked location tag — all locations this lot spans */}
                      <p className="mt-1 font-body text-body-md text-text-grey">
                        {lot.locationLabels.length === 1
                          ? `Location ${lot.locationLabels[0]}`
                          : `Locations ${lot.locationLabels.join(", ")}`}
                      </p>
                      <dl className="mt-3 grid grid-cols-2 gap-3 font-body text-body-md">
                        <div><dt className="font-label text-label uppercase text-text-grey">Available</dt><dd className="mt-1 text-on-surface">{lot.availableQty.toLocaleString()} {item.uom}</dd></div>
                        <div><dt className="font-label text-label uppercase text-text-grey">Expiry</dt><dd className="mt-1 text-on-surface">{lot.expiryDate ?? "Not dated"}</dd></div>
                        <div><dt className="font-label text-label uppercase text-text-grey">Received</dt><dd className="mt-1 font-body text-body-md text-on-surface">{new Date(lot.receivedAt).toLocaleDateString()}</dd></div>
                        <div><dt className="font-label text-label uppercase text-text-grey">Status</dt><dd className="mt-1 font-mono text-mono-md text-on-surface">{lot.lotStatus}</dd></div>
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

// Aggregated lot shape after stacking multiple location rows for the same lot.
type AggregatedLot = {
  lotId: string;
  lotNumber: string;
  lotStatus: string;
  expiryDate: string | null;
  receivedAt: Date;
  // Stacked location tag: all locations this lot spans, comma-separated.
  locationLabels: string[];
  // Total available qty across all locations for this lot.
  availableQty: number;
  // FEFO/FIFO priority within the item (1 = pick first).
  priority: number;
};

type GroupedItem = {
  itemId: string;
  itemCode: string;
  itemName: string;
  uom: string;
  isPerishable: boolean;
  flowType: "vmi" | "trading" | "supplies";
  organizationId: string | null;
  availableQty: number;
  lots: AggregatedLot[];
};

function groupStockByItem(rows: StockViewRow[]): GroupedItem[] {
  // First pass: group rows by itemId, then by lotId within each item.
  // The query already orders by (items.code, lots.expiry_date, lots.created_at)
  // so FEFO/FIFO order is preserved by the insertion sequence.
  const itemMap = new Map<string, {
    itemId: string; itemCode: string; itemName: string; uom: string; isPerishable: boolean; flowType: "vmi" | "trading" | "supplies"; organizationId: string | null;
    lotMap: Map<string, { lot: AggregatedLot }>;
    insertionOrder: string[]; // lot IDs in FEFO/FIFO order
  }>();

  for (const row of rows) {
    const availableQty = row.qtyRemaining - row.qtyCommitted;

    let itemEntry = itemMap.get(row.itemId);
    if (!itemEntry) {
      itemEntry = {
        itemId: row.itemId,
        itemCode: row.itemCode,
        itemName: row.itemName,
        uom: row.uom,
        isPerishable: row.isPerishable,
        flowType: row.flowType ?? "trading",
        organizationId: row.organizationId ?? null,
        lotMap: new Map(),
        insertionOrder: [],
      };
      itemMap.set(row.itemId, itemEntry);
    }

    // Aggregate location rows for the same lot (stacked location tag).
    let lotEntry = itemEntry.lotMap.get(row.lotId);
    if (!lotEntry) {
      itemEntry.insertionOrder.push(row.lotId);
      lotEntry = {
        lot: {
          lotId: row.lotId,
          lotNumber: row.lotNumber,
          lotStatus: row.lotStatus,
          expiryDate: row.expiryDate,
          receivedAt: row.receivedAt,
          locationLabels: [],
          availableQty: 0,
          priority: 0, // assigned in second pass
        },
      };
      itemEntry.lotMap.set(row.lotId, lotEntry);
    }

    lotEntry.lot.locationLabels.push(row.locationLabel);
    lotEntry.lot.availableQty += availableQty;
  }

  // Second pass: flatten into the final shape, assigning FEFO/FIFO priority
  // index (1-based) based on the insertion order the query already sorted.
  return [...itemMap.values()].map((entry) => {
    const lots = entry.insertionOrder.map((lotId, idx) => {
      const lot = entry.lotMap.get(lotId)!.lot;
      return { ...lot, priority: idx + 1 };
    });
    return {
      itemId: entry.itemId,
      itemCode: entry.itemCode,
      itemName: entry.itemName,
      uom: entry.uom,
      isPerishable: entry.isPerishable,
      flowType: entry.flowType,
      organizationId: entry.organizationId,
      availableQty: lots.reduce((sum, l) => sum + l.availableQty, 0),
      lots,
    };
  });
}

// ─── Pick Lists tab ───────────────────────────────────────────────────────────

async function PickListsTab() {
  // Filter to allocated status — these are the pick lists ready for floor execution.
  // Dispatched pick lists are in the Outgoing Ledger on /outgoing.
  const { rows } = await listPickLists(db, { limit: 50, offset: 0, status: "allocated" });

  return (
    <div className="mt-6 overflow-hidden rounded-xl border border-outline-variant/30 bg-surface-white shadow-elevation-1">
      {rows.length === 0 ? (
        <div className="px-6 py-12 text-center">
          <p className="font-body text-body-md text-text-grey">
            No active pick lists.
          </p>
          <p className="mt-2 font-body text-body-sm text-text-grey">
            Pick lists are generated when stock is committed for outgoing withdrawal.
            Use &ldquo;Generate Pick List&rdquo; below to create one from current stock.
          </p>
          <Link
            href="/outgoing"
            className="mt-4 inline-flex h-11 items-center justify-center rounded bg-primary px-5 font-label text-label text-surface-white hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
          >
            Go to Outgoing
          </Link>
        </div>
      ) : (
        <>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-outline-variant/30 bg-surface-light-grey">
                {/* Inter SemiBold uppercase headers per §9 tables */}
                <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                  Pick List #
                </th>
                <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                  Status
                </th>
                <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                  Flow Type
                </th>
                <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                  Customer Organization
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
                  {/* Pick list number — Roboto Mono for reference numbers per §9 */}
                  <td className="px-4 py-3 font-mono text-mono-md font-bold text-on-surface">
                    {row.pickListNumber}
                  </td>
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
                  {/* Customer party ID — mono for identifier; resolved name not yet joined */}
                  <td className="px-4 py-3 font-mono text-mono-md text-on-surface">
                    {row.customerPartyId}
                  </td>
                  <td className="px-4 py-3 font-body text-body-md text-text-grey">
                    {row.createdAt.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {/* Go to Pick — h-11 (44px) office touch target */}
                    <Link
                      href={`/pick-lists/${row.id}/pick`}
                      className="inline-flex h-11 items-center gap-1 rounded bg-primary px-3 font-label text-label text-surface-white hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-brand-navy"
                    >
                      Go to Pick
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-outline-variant/30 px-4 py-3 md:px-5">
          <p className="font-body text-body-sm text-text-grey">
            Showing active (allocated) pick lists. Completed and dispatched pick lists are in the{" "}
            <Link href="/outgoing?tab=ledger" className="font-label text-label font-semibold text-on-surface underline">Outgoing Ledger</Link>.
          </p>
        </div>
        </>
      )}
    </div>
  );
}

// ─── Inspection tab — merged transfer + inspection queue ──────────────────────
//
// The Master-Inventory-initiated entry point into the shared transfer +
// inspection work queue (specs/11-transfer-and-inspection R2.2, R2.3).
// transfer.view and inspection.perform are checked independently — a caller
// missing one still sees the other row type, matching
// listInspectionAndTransferQueue's includeTransfers/includeInspections
// contract (see its doc comment in lib/db/queries/transfers.ts).

async function InspectionTabSection() {
  const resolver = await createPageResolver();

  const includeTransfers =
    (await requirePermission(resolver, "transfer.view")).kind === "authorized";
  const includeInspections =
    (await requirePermission(resolver, "inspection.perform")).kind === "authorized";

  const rows = await listInspectionAndTransferQueue(db, {
    limit: 50,
    offset: 0,
    includeTransfers,
    includeInspections,
  });

  return (
    <div className="mt-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="font-heading text-headline-md font-semibold text-on-surface">Inspection</h2>
          <p className="mt-1 font-body text-body-md text-text-grey">
            Open transfer and inspection items requiring action.
          </p>
        </div>
        <Link
          href="/inspection"
          className="inline-flex h-11 items-center gap-2 rounded border border-outline-variant/30 px-4 font-label text-label font-semibold text-on-surface hover:bg-surface-light-grey focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
        >
          View All
        </Link>
      </div>

      <InspectionTab rows={rows} />
    </div>
  );
}
