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
import { listParties } from "@/lib/db/queries/parties";
import { listRequesterFifoOverrides } from "@/lib/db/queries/approvals";
import { FifoOverrideSnapshotSchema } from "@/lib/approval/fifo-override-snapshot";
import type { PickListRow } from "@/lib/db/queries/withdrawals";
import { listInspectionAndTransferQueue } from "@/lib/db/queries/transfers";
import { resolveInventoryTab, type TabKey } from "./_lib/resolveInventoryTab";
import { InspectionTab } from "./_components/InspectionTab";
import { MultiItemPickListDraft } from "./_components/MultiItemPickListDraft";
import { LotQrViewer } from "./_components/LotQrViewer";
import { StockViewInteractiveTable } from "./_components/StockViewInteractiveTable";
import { createApprovedPickList, createPickList, requestPickListOverride } from "./actions";

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
  const customersResult = await listParties(db, { limit: 100 });
  const customers = customersResult.rows.map((c) => ({ id: c.id, code: c.code, name: c.name }));
  const overrides = await listRequesterFifoOverrides(db, requesterUserId, 8);
  const normalizedQuery = query?.trim().toLowerCase() ?? "";
  const filteredRows = normalizedQuery
    ? rows.filter((r) => `${r.itemCode} ${r.itemName} ${r.lotNumber}`.toLowerCase().includes(normalizedQuery))
    : rows;

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

      <StockViewInteractiveTable
        rows={filteredRows}
        customers={customers}
        createAction={createPickList}
        overrideAction={requestPickListOverride}
      />
    </div>
  );
}

// ─── Pick Lists tab ───────────────────────────────────────────────────────────

async function PickListsTab({ createdPickListId }: { createdPickListId?: string }) {
  // Filter to allocated status — these are the pick lists ready for floor execution.
  // Dispatched pick lists are in the Outgoing Ledger on /outgoing.
  const [{ rows }, stockRows] = await Promise.all([
    listPickLists(db, { limit: 50, offset: 0, status: "allocated" }),
    listStockView(db),
  ]);

  return (
    <div className="mt-6 space-y-6">
      {createdPickListId && <section role="status" className="rounded-lg border border-status-available/30 bg-status-available/10 p-4"><p className="font-heading text-body-md font-bold text-on-surface">Pick list generated</p><p className="mt-1 font-body text-body-sm text-text-grey">The committed list is now in the queue. Open its print view to save or print the table as a PDF.</p><div className="mt-3 flex flex-wrap gap-3"><Link href={`/pick-lists/${createdPickListId}/print`} className="inline-flex h-11 items-center rounded bg-primary px-4 font-label text-label font-bold text-surface-white">View / Print PDF</Link><Link href={`/pick-lists/${createdPickListId}/pick`} className="inline-flex h-11 items-center rounded border border-outline-variant bg-surface-white px-4 font-label text-label font-bold text-on-surface">Go to Pick</Link></div></section>}
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
