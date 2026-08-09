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
import {
  buildStockAllocationPreview,
  listStockView,
  type StockViewRow,
} from "@/lib/db/queries/inventory";
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
  searchParams: Promise<{ tab?: string; item?: string; qty?: string }>;
}

export default async function InventoryPage({ searchParams }: PageProps) {
  const { tab: tabParam, item: itemId, qty } = await searchParams;

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
        <h1 className="font-heading font-semibold text-headline-md text-brand-navy">
          Inventory
        </h1>
        <p className="mt-1 font-body text-body-md text-text-grey">
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

      {activeTab === "stock-view" ? (
        <StockViewTab itemId={itemId} requestedQty={qty} />
      ) : activeTab === "pick-lists" ? (
        <PickListsTab />
      ) : (
        <DailyInspectionTab />
      )}
    </div>
  );
}

// ─── Stock View tab (default) ─────────────────────────────────────────────────

async function StockViewTab({ itemId, requestedQty }: { itemId?: string; requestedQty?: string }) {
  const rows = await listStockView(db);
  const itemOptions = Array.from(
    new Map(rows.map((row) => [row.itemId, row])).values(),
  );
  const quantity = Number(requestedQty);
  const preview = itemId && Number.isInteger(quantity) && quantity > 0
    ? buildStockAllocationPreview(rows, itemId, quantity)
    : null;
  const rowByLotLocation = new Map(rows.map((row) => [`${row.lotId}:${row.locationId}`, row]));

  return (
    <div className="mt-6 space-y-6">
      <form className="rounded-md bg-white/75 p-6 shadow-elevation-1" method="get">
        <input type="hidden" name="tab" value="stock-view" />
        <div className="flex flex-col gap-4 md:flex-row md:items-end">
          <label className="flex min-w-0 flex-1 flex-col gap-1 font-label text-label text-on-surface">
            Item
            <select name="item" defaultValue={itemId ?? ""} className="h-11 rounded border border-outline-variant bg-white px-3 font-body text-body-md">
              <option value="">Select available item</option>
              {itemOptions.map((item) => <option key={item.itemId} value={item.itemId}>{item.itemCode} — {item.itemName}</option>)}
            </select>
          </label>
          <label className="flex w-full flex-col gap-1 font-label text-label text-on-surface md:w-40">
            Quantity
            <input name="qty" type="number" min="1" step="1" defaultValue={requestedQty} className="h-11 rounded border border-outline-variant bg-white px-3 font-body text-body-md" />
          </label>
          <button type="submit" className="h-11 rounded bg-brand-navy px-5 font-label text-label uppercase tracking-[0.05em] text-surface-white focus:outline-none focus:ring-2 focus:ring-brand-navy">
            Preview allocation
          </button>
        </div>
        <p className="mt-3 font-body text-body-sm text-text-grey">Preview only — pick-list commitment revalidates stock and reserves quantities online.</p>
      </form>

      {preview && (
        <section className="rounded-md bg-white/75 p-6 shadow-elevation-1" aria-label="Allocation preview">
          <h2 className="font-heading text-headline-sm font-semibold text-brand-navy">Standard {preview.strategy} allocation</h2>
          {!preview.ok ? <p className="mt-3 font-body text-body-md text-status-error">Insufficient available stock for this quantity. No partial allocation is proposed.</p> : (
            <ol className="mt-4 divide-y divide-outline-variant/30">
              {preview.lines.map((line, index) => {
                const row = rowByLotLocation.get(`${line.lotId}:${line.locationId}`);
                return <li key={`${line.lotId}:${line.locationId}`} className="flex items-center justify-between gap-4 py-3 font-body text-body-md text-on-surface"><span>{index + 1}. {row?.lotNumber ?? line.lotId} · {row?.locationLabel ?? line.locationId}</span><span className="font-mono text-mono-md">{line.qtyAllocated} {row?.uom ?? ""}</span></li>;
              })}
            </ol>
          )}
        </section>
      )}

      <StockTable rows={rows} />
    </div>
  );
}

function StockTable({ rows }: { rows: StockViewRow[] }) {
  if (rows.length === 0) return <div className="rounded-md bg-white/75 px-6 py-12 text-center shadow-elevation-1"><p className="font-body text-body-md text-text-grey">No available stock to allocate.</p></div>;
  return <div className="overflow-x-auto rounded-md bg-white/75 shadow-elevation-1"><table className="w-full border-collapse"><thead><tr className="border-b border-outline-variant/30 bg-surface-light-grey">{["Item", "Lot", "Location", "Available", "Committed", "Expiry"].map((label) => <th key={label} className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">{label}</th>)}</tr></thead><tbody className="divide-y divide-outline-variant/30">{rows.map((row) => <tr key={`${row.lotId}:${row.locationId}`}><td className="px-4 py-3 font-body text-body-md text-on-surface">{row.itemCode}<span className="block text-body-sm text-text-grey">{row.itemName}</span></td><td className="px-4 py-3 font-mono text-mono-md text-on-surface">{row.lotNumber}</td><td className="px-4 py-3 font-body text-body-md text-on-surface">{row.locationLabel}</td><td className="px-4 py-3 font-mono text-mono-md text-on-surface">{row.qtyRemaining - row.qtyCommitted} {row.uom}</td><td className="px-4 py-3 font-mono text-mono-md text-text-grey">{row.qtyCommitted}</td><td className="px-4 py-3 font-body text-body-md text-text-grey">{row.expiryDate ?? "—"}</td></tr>)}</tbody></table></div>;
}

// ─── Pick Lists tab ───────────────────────────────────────────────────────────

async function PickListsTab() {
  const { rows } = await listPickLists(db, { limit: 50, offset: 0 });

  return (
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
  );
}

// ─── Daily Inspection tab — placeholder ───────────────────────────────────────

function DailyInspectionTab() {
  return (
    <div className="mt-6 rounded-md bg-white/75 backdrop-blur-md shadow-elevation-1 px-6 py-12 text-center">
      <p className="font-body text-body-md text-text-grey">
        Daily Inspection initiation is managed here (Supervisor / Administrator only).
      </p>
    </div>
  );
}
