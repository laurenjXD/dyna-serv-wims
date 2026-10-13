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
import { CheckCircle2, ChevronDown, ChevronRight, Download, ArrowLeftRight, FileText, Check, ArrowRight } from "lucide-react";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db/client";
import { listStockView, type StockViewRow } from "@/lib/db/queries/inventory";
import { listPickLists } from "@/lib/db/queries/withdrawals";
import type { PickListRow } from "@/lib/db/queries/withdrawals";
import { listInspectionAndTransferQueue } from "@/lib/db/queries/transfers";
import { resolveInventoryTab, type TabKey } from "./_lib/resolveInventoryTab";
import { InspectionTab } from "./_components/InspectionTab";
import { MultiItemPickListDraft } from "./_components/MultiItemPickListDraft";
import { ToPickQueue } from "./_components/ToPickQueue";
import { LotQrViewer } from "./_components/LotQrViewer";
import { StockViewFilterableRegister, type GroupedItem } from "./_components/StockViewFilterableRegister";
import { createPickList, markPickListReadyForDispatch, requestPickListOverride } from "./actions";
import { deletePickList } from "../pick-lists/_actions";

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
  searchParams: Promise<{ tab?: string; q?: string; pickListView?: string; pickListError?: string; overrideRequested?: string; pickListCreated?: string; pickListPicked?: string }>;
}

export default async function InventoryPage({ searchParams }: PageProps) {
  const { tab: tabParam, q, pickListView, pickListError, overrideRequested, pickListCreated, pickListPicked } = await searchParams;

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
                className={`flex h-12 shrink-0 items-center border-b-2 px-1 font-label text-label font-semibold tracking-[0.03em] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy ${isActive
                    ? "border-on-surface text-on-surface"
                    : "border-transparent text-text-grey hover:text-on-surface"
                  }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
        <div className="flex items-center pb-2">
          <Link href="/inventory/export" className="inline-flex h-11 items-center gap-2 rounded bg-on-surface px-4 font-label text-label font-semibold text-surface-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"><Download size={16} aria-hidden="true" />Export Excel</Link>
        </div>
      </div>

      {pickListError && (
        <div role="alert" className="mt-4 rounded-lg border border-status-held/40 bg-status-held/5 p-4 shadow-sm">
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
        <StockViewTab query={q} />
      ) : activeTab === "pick-lists" ? (
        <PickListsTab
          createdPickListId={pickListCreated}
          pickedPickListId={pickListPicked}
          view={pickListView === "deleted" ? "deleted" : "open"}
        />
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
    <div className="mt-5 space-y-5">
      <div>
        {items.length === 0 ? (
          <div className="rounded-xl border border-outline-variant bg-surface-white px-6 py-12 text-center shadow-elevation-1">
            <p className="font-body text-body-md text-text-grey">
              No available stock is ready for allocation.
            </p>
            <p className="mt-2 font-body text-body-sm text-text-grey">
              Confirmed receipts appear here when their lots are available for picking.
            </p>
          </div>
        ) : (
          <StockViewFilterableRegister items={items} />
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

function groupStockByItem(rows: StockViewRow[]): GroupedItem[] {
  // First pass: group rows by itemId, then by lotId within each item.
  // The query already orders by (items.code, lots.expiry_date, lots.created_at)
  // so FEFO/FIFO order is preserved by the insertion sequence.
  const itemMap = new Map<string, {
    itemId: string; itemCode: string; itemName: string; organizationName: string | null; categoryName: string | null; subcategoryName: string | null; inventoryModel: string; uom: string; isPerishable: boolean; flowType: "vmi" | "trading" | "supplies"; organizationId: string | null;
    codes: string; customerName: string | null; totalIn: number; totalOut: number; spq: number; pcsOnHand: number; boxesOnHand: number; cbmOccupied: number;
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
        organizationName: row.organizationName ?? row.customerName ?? null,
        categoryName: row.categoryName ?? null,
        subcategoryName: row.subcategoryName ?? null,
        inventoryModel: row.inventoryModel ?? (row.flowType ? row.flowType.toUpperCase() : "TRADING"),
        uom: row.uom,
        isPerishable: row.isPerishable,
        flowType: row.flowType ?? "trading",
        organizationId: row.organizationId ?? null,
        codes: [row.supplierItemCode, row.customerItemCode, row.dsgcItemNumber].filter(Boolean).join(" · "),
        customerName: row.customerName ?? null,
        totalIn: 0,
        totalOut: 0,
        spq: row.spq ?? 1,
        pcsOnHand: 0,
        boxesOnHand: 0,
        cbmOccupied: 0,
        lotMap: new Map(),
        insertionOrder: [],
      };
      itemMap.set(row.itemId, itemEntry);
    }

    const spq = row.spq ?? itemEntry.spq ?? 1;
    itemEntry.spq = spq;
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
    const totalQty = entry.spq * entry.boxesOnHand;
    return {
      itemId: entry.itemId,
      itemCode: entry.itemCode,
      itemName: entry.itemName,
      organizationName: entry.organizationName,
      categoryName: entry.categoryName,
      subcategoryName: entry.subcategoryName,
      inventoryModel: entry.inventoryModel,
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
      spq: entry.spq,
      boxesOnHand: entry.boxesOnHand,
      totalQty,
      pcsOnHand: entry.pcsOnHand,
      cbmOccupied: entry.cbmOccupied,
      lots,
    };
  });
}

// ─── Pick Lists tab ───────────────────────────────────────────────────────────

async function PickListsTab({ createdPickListId, pickedPickListId, view }: { createdPickListId?: string; pickedPickListId?: string; view: "open" | "deleted" }) {
  const isDeleted = view === "deleted";
  // Only allocated lists belong in this To Pick view. Picked lists move to the
  // Dispatch queue and dispatched records remain in the Outgoing Ledger.
  const [{ rows }, stockRows] = await Promise.all([
    listPickLists(db, { limit: 50, offset: 0, ...(isDeleted ? { deleted: true } : { status: "allocated" }) }),
    listStockView(db),
  ]);

  return (
    <div className="mt-6 space-y-6">
      {/* Segmented View Switcher */}
      <div className="flex items-center gap-1.5 rounded-2xl border border-outline-variant/30 bg-surface-white p-1.5 shadow-sm w-fit" aria-label="Pick list views">
        <Link
          href="/inventory?tab=pick-lists"
          className={`flex items-center gap-2 rounded-xl px-4 py-2 font-label text-label font-bold transition-all ${
            !isDeleted
              ? "bg-brand-navy text-surface-white shadow-sm"
              : "text-text-grey hover:bg-surface-light-grey hover:text-on-surface"
          }`}
        >
          <span>Open Queue</span>
          {!isDeleted && rows.length > 0 && (
            <span className="rounded-full bg-surface-white/20 px-2 py-0.5 font-mono text-mono-xs text-surface-white">
              {rows.length}
            </span>
          )}
        </Link>
        <Link
          href="/inventory?tab=pick-lists&pickListView=deleted"
          className={`flex items-center gap-2 rounded-xl px-4 py-2 font-label text-label font-bold transition-all ${
            isDeleted
              ? "bg-brand-navy text-surface-white shadow-sm"
              : "text-text-grey hover:bg-surface-light-grey hover:text-on-surface"
          }`}
        >
          <span>Archived / Deleted</span>
        </Link>
      </div>

      {isDeleted ? (
        <ToPickQueue rows={rows} isDeleted={true} />
      ) : (
        <>
          {createdPickListId && (
            <section
              role="status"
              className="rounded-2xl border border-status-available/40 bg-status-available/5 p-5 shadow-sm"
            >
              <div className="flex items-start gap-3.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-status-available text-surface-white shadow-sm">
                  <Check size={20} strokeWidth={3} />
                </div>
                <div className="flex-1">
                  <h3 className="font-heading text-title-md font-bold text-on-surface">
                    Pick list generated successfully
                  </h3>
                  <p className="mt-1 font-body text-body-sm text-text-grey">
                    The list is now active in the To Pick Queue. Review or print its PDF, physically pull the boxes from storage racks, then mark it as picked to proceed with dispatch.
                  </p>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <Link
                      href={`/pick-lists/${createdPickListId}/print`}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-outline-variant/60 bg-surface-white px-4 font-label text-label-sm font-bold text-on-surface shadow-sm hover:bg-surface-light-grey"
                    >
                      <FileText size={15} />
                      <span>View Pick List PDF</span>
                    </Link>
                    <form action={markPickListReadyForDispatch}>
                      <input type="hidden" name="pickListId" value={createdPickListId} />
                      <button
                        type="submit"
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 font-label text-label-sm font-bold text-surface-white shadow-sm hover:bg-primary/90 active:scale-[0.98] transition-all"
                      >
                        <Check size={15} />
                        <span>Mark as Picked</span>
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            </section>
          )}

          {pickedPickListId && (
            <section
              role="status"
              className="rounded-2xl border border-status-available/40 bg-status-available/5 p-5 shadow-sm"
            >
              <div className="flex items-start gap-3.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-status-available text-surface-white shadow-sm">
                  <Check size={20} strokeWidth={3} />
                </div>
                <div className="flex-1">
                  <h3 className="font-heading text-title-md font-bold text-on-surface">
                    Pick list marked as Picked &amp; Ready for Dispatch
                  </h3>
                  <p className="mt-1 font-body text-body-sm text-text-grey">
                    Physical carton picking is confirmed. Open the Dispatch Queue to scan barcodes and finalize the delivery receipt.
                  </p>
                  <Link
                    href="/outgoing"
                    className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-5 font-label text-label-sm font-bold text-surface-white shadow-sm hover:bg-primary/90 transition-all active:scale-[0.98]"
                  >
                    <span>Open Dispatch Queue</span>
                    <ArrowRight size={15} />
                  </Link>
                </div>
              </div>
            </section>
          )}

          <div id="draft-generator">
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
          </div>

          <ToPickQueue rows={rows} />
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
  const canRequestTransfer =
    (await requirePermission(resolver, "transfer.request")).kind === "authorized";

  const rows = await listInspectionAndTransferQueue(db, {
    limit: 50,
    offset: 0,
    includeTransfers,
    includeInspections,
  });

  return (
    <div className="mt-6">
      <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="font-heading text-headline-md font-semibold text-on-surface">Inspection & Movement Hub</h2>
          <p className="mt-1 font-body text-body-md text-text-grey">
            Warehouse quality verification, hold bay inspections, and rack relocation transfers.
          </p>
        </div>
        {canRequestTransfer && (
          <Link
            href="/transfers/new"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand-navy px-4 font-label text-label font-bold text-white shadow-sm hover:bg-brand-navy/90 active:scale-[0.98] transition-all"
          >
            <ArrowLeftRight size={16} />
            <span>+ New Transfer Request</span>
          </Link>
        )}
      </div>

      <InspectionTab rows={rows} />
    </div>
  );
}
