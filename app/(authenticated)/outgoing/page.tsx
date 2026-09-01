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
import { OutgoingLedgerClientTable } from "./_components/OutgoingLedgerClientTable";
import { LogisticsLedgerClientTable } from "./_components/LogisticsLedgerClientTable";
import { removeDeliveryReceipt, uploadDeliveryReceipt } from "../pick-lists/_actions";
import { getStorageClient } from "@/lib/supabase/storage";

// ─── Page ─────────────────────────────────────────────────────────────────────

type TabKey = "dispatch" | "ledger" | "logistics";

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
  const activeTab: TabKey = tab === "ledger" ? "ledger" : tab === "logistics" ? "logistics" : "dispatch";

  return (
    <div className="mx-auto max-w-container pb-10">
      <div>
        <div>
          <h1 className="font-heading text-headline-lg font-bold tracking-tight text-on-surface">
            Outgoing &amp; Logistics
          </h1>
          <p className="mt-1 font-body text-body-md text-text-grey">
            Release completed picks for dispatch, manage Delivery Receipt (DR) logistics fees, and review outbound inventory.
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
              ? "border-brand-navy text-brand-navy"
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
              ? "border-brand-navy text-brand-navy"
              : "border-transparent text-text-grey hover:text-on-surface"
          }`}
        >
          Outgoing Ledger
        </Link>
        <Link
          href="/outgoing?tab=logistics"
          role="tab"
          aria-selected={activeTab === "logistics"}
            className={`border-b-2 px-4 py-3 font-label text-label font-bold transition-colors ${
            activeTab === "logistics"
              ? "border-brand-navy text-brand-navy"
              : "border-transparent text-text-grey hover:text-on-surface"
          }`}
        >
          Logistics &amp; DR Fees
        </Link>
      </div>

      {activeTab === "dispatch" ? (
        <DispatchTab canExecute={canExecute} />
      ) : activeTab === "logistics" ? (
        <div className="mt-6">
          <LogisticsLedgerClientTable />
        </div>
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
  const rows: OutgoingLedgerRow[] = "rows" in ledgerResult ? ledgerResult.rows : [];
  const storage = await getStorageClient();
  const signedUrls = new Map<string, string>();
  for (const row of rows) {
    if (row.deliveryReceiptPath && !signedUrls.has(row.deliveryReceiptPath)) {
      const result = await storage.from("delivery-receipts").createSignedUrl(row.deliveryReceiptPath, 60 * 60);
      if (result.data?.signedUrl) signedUrls.set(row.deliveryReceiptPath, result.data.signedUrl);
    }
  }
  const rowsWithReceiptUrls = rows.map((row) => ({
    ...row,
    deliveryReceiptUrl: row.deliveryReceiptPath ? signedUrls.get(row.deliveryReceiptPath) ?? null : null,
  }));

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
      {receiptUpload && <p role="status" className="mt-3 rounded border border-status-available/30 bg-status-available/10 px-4 py-3 font-body text-body-sm text-on-surface">{receiptUpload === "success" ? "Delivery Receipt uploaded." : receiptUpload === "removed" ? "Delivery Receipt removed." : receiptUpload === "invalid" ? "Upload a PDF, PNG, or JPEG up to 10 MB." : receiptUpload === "forbidden" ? "You do not have permission to manage Delivery Receipts." : "Delivery Receipt action failed. Please try again."}</p>}

      <OutgoingLedgerClientTable
        rows={rowsWithReceiptUrls}
        uploadDeliveryReceiptAction={uploadDeliveryReceipt}
        removeDeliveryReceiptAction={removeDeliveryReceipt}
      />
    </div>
  );
}
