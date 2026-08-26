// Outgoing — read-only dispatch ledger.
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
import { listOutgoingLedger } from "@/lib/actions/withdrawals";
import { listPickLists, type OutgoingLedgerRow } from "@/lib/db/queries/withdrawals";
import { PickQueueSection } from "./_components/PickQueueSection";
import { uploadDeliveryReceipt } from "../pick-lists/_actions";

// ─── Page ─────────────────────────────────────────────────────────────────────

type TabKey = "dispatch" | "ledger";

export default async function OutgoingPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; receiptStatus?: string; receiptUpload?: string }>;
}) {
  const resolver = await createPageResolver();

  // Gate: pick_list.read is required for the outgoing ledger.
  const permResult = await requirePermission(resolver, "pick_list.read");
  if (permResult.kind !== "authorized") {
    notFound();
  }

  const canExecute =
    (await requirePermission(resolver, "pick_list.execute")).kind === "authorized";
  const { tab, receiptStatus, receiptUpload } = await searchParams;
  const activeTab: TabKey = tab === "ledger" ? "ledger" : "dispatch";

  return (
    <div className="mx-auto max-w-container pb-10">
      <div>
        <div>
          <h1 className="font-heading text-headline-lg font-bold tracking-tight text-on-surface">
            Outgoing
          </h1>
          <p className="mt-1 font-body text-body-md text-text-grey">
            Release completed picks for dispatch and review outbound inventory.
          </p>
        </div>
      </div>

      <div className="mt-6 flex gap-1 border-b border-outline-variant/30" role="tablist" aria-label="Outgoing sections">
        <Link
          href="/outgoing"
          role="tab"
          aria-selected={activeTab === "dispatch"}
          className={`border-b-2 px-4 py-3 font-label text-label font-bold transition-colors ${
            activeTab === "dispatch"
              ? "border-brand-primary text-brand-primary"
              : "border-transparent text-text-grey hover:text-on-surface"
          }`}
        >
          Dispatch
        </Link>
        <Link
          href="/outgoing?tab=ledger"
          role="tab"
          aria-selected={activeTab === "ledger"}
          className={`border-b-2 px-4 py-3 font-label text-label font-bold transition-colors ${
            activeTab === "ledger"
              ? "border-brand-primary text-brand-primary"
              : "border-transparent text-text-grey hover:text-on-surface"
          }`}
        >
          Outgoing Ledger
        </Link>
      </div>

      {activeTab === "dispatch" ? (
        <DispatchTab canExecute={canExecute} />
      ) : (
        <OutgoingLedgerTab resolver={resolver} receiptStatus={receiptStatus} receiptUpload={receiptUpload} />
      )}
    </div>
  );
}

async function DispatchTab({ canExecute }: { canExecute: boolean }) {
  const { rows } = await listPickLists(db, {
    limit: 50,
    offset: 0,
    status: "picked",
  });

  return (
    <div className="mt-6">
      <PickQueueSection mode="dispatch" rows={rows} canExecute={canExecute} />
    </div>
  );
}

// ─── Outgoing Ledger tab ──────────────────────────────────────────────────────
//
// Read-only record of outgoing inventory transactions. Moved here from
// /inventory per 2026-08-09 PO restructuring.

async function OutgoingLedgerTab({
  resolver,
  receiptStatus,
  receiptUpload,
}: {
  resolver: Awaited<ReturnType<typeof createPageResolver>>;
  receiptStatus?: string;
  receiptUpload?: string;
}) {
  const ledgerResult = await listOutgoingLedger(resolver, {
    limit: 100,
    offset: 0,
    deliveryReceiptStatus: receiptStatus === "uploaded" || receiptStatus === "missing" ? receiptStatus : undefined,
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
      <form method="GET" className="mt-4 flex flex-wrap items-end gap-3">
        <input type="hidden" name="tab" value="ledger" />
        <label className="font-label text-label text-on-surface">Delivery Receipt status<select name="receiptStatus" defaultValue={receiptStatus ?? ""} className="ml-2 h-11 rounded border border-outline-variant/30 bg-surface-white px-3 font-body text-body-md"><option value="">All</option><option value="missing">Missing</option><option value="uploaded">Uploaded</option></select></label>
        <button type="submit" className="h-11 rounded bg-brand-navy px-4 font-label text-label font-bold text-surface-white">Filter</button>
        {receiptStatus && <Link href="/outgoing?tab=ledger" className="inline-flex h-11 items-center rounded border border-outline-variant/30 px-4 font-label text-label text-on-surface">Clear</Link>}
      </form>
      {receiptUpload && <p role="status" className="mt-3 rounded border border-status-available/30 bg-status-available/10 px-4 py-3 font-body text-body-sm text-on-surface">{receiptUpload === "success" ? "Delivery Receipt uploaded." : receiptUpload === "invalid" ? "Upload a PDF, PNG, or JPEG up to 10 MB." : receiptUpload === "forbidden" ? "You do not have permission to upload Delivery Receipts." : "Delivery Receipt upload failed. Please try again."}</p>}

      {/* Ledger table — Level 1 office elevation per design.md §6.
          design.md §9: item code is the prominent first field in office review.
          Card wrapper matches Active Picks tab's pattern (border + responsive
          shadow) for cross-tab visual consistency. */}
      <div className="mt-6 overflow-hidden rounded-xl border border-outline-variant/30 bg-surface-white shadow-elevation-2">
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
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">Delivery Receipt</th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">Upload Status</th>
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
                    <td className="px-4 py-3">
                      <form action={uploadDeliveryReceipt} encType="multipart/form-data" className="flex min-w-52 items-center gap-2"><input type="hidden" name="pickListId" value={row.pickListId ?? ""} /><input required type="file" name="deliveryReceipt" accept="application/pdf,image/png,image/jpeg" className="max-w-40 text-body-sm" /><button type="submit" disabled={!row.pickListId} className="inline-flex h-10 items-center rounded bg-primary px-3 font-label text-mono-sm font-bold text-surface-white disabled:opacity-50">Upload</button></form>
                    </td>
                    <td className="px-4 py-3"><span className={`inline-flex rounded-full px-2 py-1 font-label text-mono-sm font-bold ${row.deliveryReceiptStatus === "uploaded" ? "bg-status-available/15 text-status-available" : "bg-status-pending/15 text-status-pending"}`}>{row.deliveryReceiptStatus === "uploaded" ? "Uploaded" : "Missing"}</span></td>
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
