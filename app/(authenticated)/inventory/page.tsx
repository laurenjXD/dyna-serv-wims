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
import { CheckCircle2, ChevronRight, Clock3, Download, Search, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db/client";
import { listStockView, type StockViewRow } from "@/lib/db/queries/inventory";
import { listPickLists } from "@/lib/db/queries/withdrawals";
import { listRequesterFifoOverrides } from "@/lib/db/queries/approvals";
import { FifoOverrideSnapshotSchema } from "@/lib/approval/fifo-override-snapshot";
import type { PickListRow } from "@/lib/db/queries/withdrawals";
import { listInspectionAndTransferQueue } from "@/lib/db/queries/transfers";
import { resolveInventoryTab, type TabKey } from "./_lib/resolveInventoryTab";
import { InspectionTab } from "./_components/InspectionTab";
import { MultiItemPickListDraft } from "./_components/MultiItemPickListDraft";
import { LotQrViewer } from "./_components/LotQrViewer";
import { createApprovedPickList, createPickList, requestPickListOverride } from "./actions";

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
  searchParams: Promise<{ tab?: string; q?: string; pickListError?: string; overrideRequested?: string; pickListCreated?: string }>;
}

export default async function InventoryPage({ searchParams }: PageProps) {
  const { tab: tabParam, q, pickListError, overrideRequested, pickListCreated } = await searchParams;

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
          <p className="mt-1 font-body text-body-md text-on-surface">{pickListError === "forbidden" ? "Your account does not have permission to generate pick lists." : pickListError === "fifo_override_required" ? "The selected location is not the current FIFO/FEFO source." : `Reason: ${pickListError.replaceAll(",", ", ")}`}</p>
          <p className="mt-1 font-body text-body-md text-text-grey">{pickListError === "fifo_override_required" ? "Choose the recommended source location or submit the required FIFO/FEFO override request before generating the pick list." : "Check the destination organization and available quantity, then try again."}</p>
        </div>
      )}

      {overrideRequested && (
        <div role="status" className="mt-4 flex items-start gap-3 rounded border border-status-available/40 bg-status-available/10 p-4">
          <CheckCircle2 size={22} className="mt-0.5 shrink-0 text-status-available" aria-hidden="true" />
          <div><p className="font-heading text-body-md font-bold text-on-surface">Override sent for approval</p><p className="mt-1 font-body text-body-sm text-text-grey">{overrideRequested} is waiting for another supervisor. Return here after approval to generate the locked pick list.</p></div>
        </div>
      )}

      {activeTab === "stock-view" ? (
        <StockViewTab query={q} requesterUserId={permResult.context.userId} />
      ) : activeTab === "pick-lists" ? (
        <PickListsTab createdPickListId={pickListCreated} />
      ) : (
        <InspectionTabSection />
      )}
    </div>
  );
}

// ─── Stock View tab (default) ─────────────────────────────────────────────────

async function StockViewTab({ query, requesterUserId }: { query?: string; requesterUserId: string }) {
  const rows = await listStockView(db);
  const overrides = await listRequesterFifoOverrides(db, requesterUserId, 8);
  const normalizedQuery = query?.trim().toLowerCase() ?? "";
  const items = groupStockByItem(rows).filter((item) => !normalizedQuery || `${item.itemCode} ${item.itemName} ${item.lots.map((lot) => lot.lotNumber).join(" ")}`.toLowerCase().includes(normalizedQuery));

  return (
    <div className="mt-5 space-y-5">
      {overrides.length > 0 && <section className="rounded border border-outline-variant bg-surface-white p-5 shadow-elevation-1">
        <div><h2 className="font-heading text-title-lg font-bold text-on-surface">Pallet override requests</h2><p className="mt-1 font-body text-body-sm text-text-grey">A different supervisor reviews these in Approvals. Approved requests can be used once and expire if inventory changes.</p></div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {overrides.map((request) => {
            const parsed = FifoOverrideSnapshotSchema.safeParse(request.targetSnapshot);
            if (!parsed.success) return null;
            const snapshot = parsed.data;
            const isApproved = request.status === "approved" && !request.consumedAt && request.expiryAt > new Date() && Boolean(request.partyId);
            const payload = JSON.stringify({ partyId: request.partyId, flowType: snapshot.flow_type, approvalRequestId: request.id, lines: [{ itemId: snapshot.item_id, lotId: snapshot.lot_id, locationId: snapshot.location_id, qty: Number(snapshot.requested_qty) }] });
            return <article key={request.id} className="grid gap-3 rounded border border-outline-variant bg-background p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-mono-md font-bold text-on-surface">{request.requestNumber}</span><span className={`rounded-full px-2 py-1 font-label text-label font-bold uppercase ${isApproved ? "bg-status-available/15 text-status-available" : request.status === "pending" ? "bg-status-pending/15 text-status-pending" : "bg-status-neutral/15 text-status-neutral"}`}>{request.consumedAt ? "used" : request.status}</span></div><p className="mt-2 font-body text-body-md text-on-surface">{snapshot.item_code} · {snapshot.lot_number} · {snapshot.location_code}</p><p className="mt-1 font-body text-body-sm text-text-grey">Quantity {snapshot.requested_qty} · {request.reason}</p></div>
              {isApproved ? <form action={createApprovedPickList}><input type="hidden" name="request" value={payload} /><button type="submit" className="inline-flex h-11 items-center gap-2 rounded bg-primary px-4 font-label text-label font-bold text-surface-white"><ShieldCheck size={17} aria-hidden="true" />Generate approved pick list</button></form> : <span className="inline-flex items-center gap-2 font-label text-label font-bold text-text-grey"><Clock3 size={17} aria-hidden="true" />{request.status === "pending" ? "Waiting for review" : "No action available"}</span>}
            </article>;
          })}
        </div>
      </section>}

    <div className="min-h-[680px] overflow-x-auto rounded border border-outline-variant bg-surface-white shadow-elevation-1">
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
        <div className="min-w-[2050px] divide-y divide-outline-variant/30">
          <div className="grid grid-cols-[210px_minmax(220px,1fr)_160px_160px_160px_180px_110px_110px_130px_130px_140px] items-center gap-x-3 bg-accent-indigo-50 px-5 py-3 font-label text-label font-semibold tracking-[0.04em] text-text-grey">
            <span>Item Code</span><span>Description</span><span>Codes</span><span>Lot No.</span><span>Location</span><span>Customer</span><span className="text-right">Total In</span><span className="text-right">Total Out</span><span className="text-right">Pcs on Hand</span><span className="text-right">Boxes on Hand</span><span className="text-right">CBM Occupied</span>
          </div>
          {items.map((item) => (
            <details key={item.itemId} className="group">
              <summary className="grid cursor-pointer list-none grid-cols-[210px_minmax(220px,1fr)_160px_160px_160px_180px_110px_110px_130px_130px_140px] items-center gap-x-3 px-5 py-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-navy hover:bg-surface-light-grey/40">
                <p className="flex items-center gap-2 font-mono text-mono-md font-bold text-on-surface"><ChevronRight size={22} aria-hidden="true" className="shrink-0 text-text-grey transition-transform group-open:rotate-90" />{item.itemCode}</p>
                <p className="font-body text-body-md text-on-surface">{item.itemName}</p>
                <p className="truncate font-mono text-mono-md text-on-surface" title={item.codes || undefined}>{item.codes || "—"}</p>
                <p className="truncate font-mono text-mono-md text-on-surface" title={item.lotNumbers}>{item.lotNumbers}</p>
                <p className="truncate font-mono text-mono-md text-on-surface" title={item.locationLabels}>{item.locationLabels}</p>
                <p className="truncate font-body text-body-md text-on-surface" title={item.customerName || undefined}>{item.customerName || "—"}</p>
                <p className="text-right font-mono text-mono-md text-on-surface">{item.totalIn.toLocaleString()}</p>
                <p className="text-right font-mono text-mono-md text-on-surface">{item.totalOut.toLocaleString()}</p>
                <p className="text-right font-mono text-mono-md font-bold text-on-surface">{item.pcsOnHand.toLocaleString()}</p>
                <p className="text-right font-mono text-mono-md text-on-surface">{item.boxesOnHand.toLocaleString()}</p>
                <p className="text-right font-mono text-mono-md text-on-surface">{item.cbmOccupied.toFixed(3)}</p>
              </summary>
              <div className="border-t border-outline-variant/30 bg-surface-light-grey/45 px-4 py-4 md:px-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-body text-body-md text-text-grey">
                    Lots are shown in {item.isPerishable ? "FEFO" : "FIFO"} order.
                  </p>
                  <Link
                    href="/inventory?tab=pick-lists"
                    className="inline-flex h-11 items-center gap-2 rounded bg-brand-navy px-4 font-label text-label font-bold text-surface-white shadow-elevation-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    Create Pick List
                  </Link>
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
                      <LotQrViewer lotId={lot.lotId} lotNumber={lot.lotNumber} itemCode={item.itemCode} />
                    </article>
                  ))}
                </div>
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
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
  codes: string;
  customerName: string | null;
  lotNumbers: string;
  locationLabels: string;
  totalIn: number;
  totalOut: number;
  pcsOnHand: number;
  boxesOnHand: number;
  cbmOccupied: number;
  lots: AggregatedLot[];
};

function groupStockByItem(rows: StockViewRow[]): GroupedItem[] {
  // First pass: group rows by itemId, then by lotId within each item.
  // The query already orders by (items.code, lots.expiry_date, lots.created_at)
  // so FEFO/FIFO order is preserved by the insertion sequence.
  const itemMap = new Map<string, {
    itemId: string; itemCode: string; itemName: string; uom: string; isPerishable: boolean; flowType: "vmi" | "trading" | "supplies"; organizationId: string | null;
    codes: string; customerName: string | null; totalIn: number; totalOut: number; pcsOnHand: number; boxesOnHand: number; cbmOccupied: number;
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
        codes: [row.supplierItemCode, row.customerItemCode, row.dsgcItemNumber].filter(Boolean).join(" · "),
        customerName: row.customerName ?? null,
        totalIn: 0,
        totalOut: 0,
        pcsOnHand: 0,
        boxesOnHand: 0,
        cbmOccupied: 0,
        lotMap: new Map(),
        insertionOrder: [],
      };
      itemMap.set(row.itemId, itemEntry);
    }

    const spq = row.spq ?? 1;
    const qtyReceived = row.qtyReceived ?? row.qtyRemaining;
    itemEntry.totalIn += qtyReceived * spq;
    itemEntry.totalOut += Math.max(0, qtyReceived - row.qtyRemaining) * spq;
    itemEntry.pcsOnHand += row.qtyRemaining * spq;
    itemEntry.boxesOnHand += row.qtyRemaining;
    itemEntry.cbmOccupied += row.qtyRemaining * Number(row.volumeCbm ?? 0);

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
      codes: entry.codes,
      customerName: entry.customerName,
      lotNumbers: lots.map((lot) => lot.lotNumber).join(", "),
      locationLabels: [...new Set(lots.flatMap((lot) => lot.locationLabels))].join(", "),
      totalIn: entry.totalIn,
      totalOut: entry.totalOut,
      pcsOnHand: entry.pcsOnHand,
      boxesOnHand: entry.boxesOnHand,
      cbmOccupied: entry.cbmOccupied,
      lots,
    };
  });
}

// ─── Pick Lists tab ───────────────────────────────────────────────────────────

async function PickListsTab({ createdPickListId }: { createdPickListId?: string }) {
  // Filter to allocated status — these are the pick lists ready for floor execution.
  // Dispatched pick lists are in the Outgoing Ledger on /outgoing.
  const [{ rows }, stockRows] = await Promise.all([
    listPickLists(db, { limit: 50, offset: 0 }),
    listStockView(db),
  ]);

  return (
    <div className="mt-6 space-y-6">
      {createdPickListId && <section role="status" className="rounded-lg border border-status-available/30 bg-status-available/10 p-4"><p className="font-heading text-body-md font-bold text-on-surface">Pick list generated</p><p className="mt-1 font-body text-body-sm text-text-grey">The list is ready for dispatch. Review or save its PDF, then start Dispatch when the boxes are ready.</p><div className="mt-3 flex flex-wrap gap-3"><Link href={`/pick-lists/${createdPickListId}/print`} className="inline-flex h-11 items-center rounded border border-outline-variant bg-surface-white px-4 font-label text-label font-bold text-on-surface">View / PDF</Link><Link href={`/pick-lists/${createdPickListId}/dispatch`} className="inline-flex h-11 items-center rounded bg-primary px-4 font-label text-label font-bold text-surface-white">Dispatch</Link></div></section>}
      <MultiItemPickListDraft
        stock={stockRows.map((row, index) => ({
          itemId: row.itemId,
          itemCode: row.itemCode,
          itemName: row.itemName,
          customerItemCode: row.customerItemCode ?? null,
          organizationId: row.organizationId ?? null,
          organizationName: row.organizationName ?? null,
          flowType: row.flowType,
          uom: row.uom,
          spq: row.spq ?? 1,
          balanceId: row.balanceId ?? `${row.lotId}:${row.locationId}`,
          lotId: row.lotId,
          lotNumber: row.lotNumber,
          locationId: row.locationId,
          locationLabel: row.locationLabel,
          availableQty: row.qtyRemaining - row.qtyCommitted,
          priority: index + 1,
        }))}
        createAction={createPickList}
        overrideAction={requestPickListOverride}
      />
    <div className="overflow-hidden rounded-xl border border-outline-variant/30 bg-surface-white shadow-elevation-1">
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
                    <div className="flex justify-end gap-2">
                      <Link
                        href={`/pick-lists/${row.id}/print`}
                        className="inline-flex h-11 items-center gap-1 rounded border border-outline-variant bg-surface-white px-3 font-label text-label font-bold text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-navy"
                      >
                        View / PDF
                      </Link>
                      {row.status === "picked" && <Link
                        href={`/pick-lists/${row.id}/dispatch`}
                        className="inline-flex h-11 items-center gap-1 rounded bg-primary px-3 font-label text-label font-bold text-surface-white hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-brand-navy"
                      >
                        Dispatch
                      </Link>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-outline-variant/30 px-4 py-3 md:px-5">
          <p className="font-body text-body-sm text-text-grey">
            View or print any pick list here. Dispatch-ready lists appear in the{" "}
            <Link href="/outgoing" className="font-label text-label font-semibold text-on-surface underline">Dispatch queue</Link>; dispatched stock movements are in the{" "}
            <Link href="/outgoing?tab=ledger" className="font-label text-label font-semibold text-on-surface underline">Outgoing Ledger</Link>.
          </p>
        </div>
        </>
      )}
    </div>
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
