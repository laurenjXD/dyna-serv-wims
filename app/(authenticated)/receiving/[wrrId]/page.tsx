import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db/client";
import { getWrrDocument } from "@/lib/db/queries/receiving";
import { startReceiving } from "@/lib/actions/receiving";
import type { WrrItemRow } from "@/lib/db/queries/receiving";
import { WRRUnitLabelGenerator } from "@/components/barcode/WRRUnitLabelGenerator";

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  staged_pending_arrival: "STAGED",
  receiving_in_progress: "IN PROGRESS",
  confirmed: "CONFIRMED",
  cancelled: "CANCELLED",
};

const STATUS_CLASSES: Record<string, string> = {
  staged_pending_arrival: "bg-surface-container-highest text-on-surface",
  receiving_in_progress: "bg-tertiary-container text-on-tertiary-container",
  confirmed: "bg-primary-container text-on-primary-container",
  cancelled: "bg-error-container text-error",
};

const FLOW_LABELS: Record<string, string> = {
  vmi: "VMI",
  trading: "Trading",
  supplies: "Supplies",
};

// Disposition badge: store → status-success tint, inspect → status-warning tint
const DISPOSITION_CLASSES: Record<string, string> = {
  store: "bg-primary-container text-on-primary-container",
  inspect: "bg-tertiary-container text-on-tertiary-container",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

interface PageProps {
  params: Promise<{ wrrId: string }>;
}

export default async function WrrDetailPage({ params }: PageProps) {
  const { wrrId } = await params;
  const resolver = await createPageResolver();

  // Gate: receiving.view
  const permResult = await requirePermission(resolver, "receiving.view");
  if (permResult.kind !== "authorized") {
    notFound();
  }

  const wrr = await getWrrDocument(db, wrrId);
  if (!wrr) {
    notFound();
  }

  // ─── Inline server action: startReceiving ──────────────────────────────────
  async function handleStartReceiving(): Promise<void> {
    "use server";
    const actionResolver = await createPageResolver();
    await startReceiving(actionResolver, wrrId);
    redirect(`/receiving/${wrrId}`);
  }

  return (
    <div className="mx-auto w-full max-w-md pb-[100px] animate-in fade-in duration-300">
      {/* Context Header */}
      <div className="mb-md rounded-xl bg-surface-container-lowest p-md shadow-sm border border-outline-variant">
        <div className="flex items-center justify-between mb-sm">
          <div className="flex items-center gap-2">
            <Link
              href="/receiving"
              className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-surface-container-highest transition-colors"
            >
              <span className="material-symbols-outlined text-on-surface-variant text-[20px]">arrow_back</span>
            </Link>
            <span className="font-label text-label-md text-on-surface-variant uppercase tracking-wider">
              {FLOW_LABELS[wrr.flowType] ?? wrr.flowType} RECEIPT
            </span>
          </div>
          <span
            className={`inline-flex items-center rounded-sm px-2 py-0.5 font-label text-label-sm uppercase ${STATUS_CLASSES[wrr.status] ?? "bg-surface-container-highest text-on-surface"}`}
          >
            {STATUS_LABELS[wrr.status] ?? wrr.status.toUpperCase()}
          </span>
        </div>
        
        <h1 className="font-heading text-display-sm font-bold text-on-surface tracking-tight">
          {wrr.wrrNumber}
        </h1>
        
        <div className="mt-md grid grid-cols-2 gap-sm border-t border-outline-variant/50 pt-md">
          <div>
            <p className="font-label text-label-sm text-on-surface-variant">Vendor Party ID</p>
            <p className="font-mono text-body-md text-on-surface truncate">{wrr.vendorPartyId}</p>
          </div>
          <div>
            <p className="font-label text-label-sm text-on-surface-variant">Created At</p>
            <p className="font-body text-body-md text-on-surface truncate">{wrr.createdAt.toLocaleDateString()}</p>
          </div>
        </div>
      </div>

      {/* Items List (Mobile Cards) */}
      <div className="space-y-sm">
        <div className="flex items-center justify-between px-xs">
          <h2 className="font-heading text-title-md font-semibold text-on-surface">
            Expected Lines
          </h2>
          <span className="font-label text-label-md text-on-surface-variant">
            {wrr.items.length} items
          </span>
        </div>

        {wrr.items.length === 0 ? (
          <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-xl text-center shadow-sm">
            <span className="material-symbols-outlined text-on-surface-variant/50 text-[48px] mb-sm">inventory_2</span>
            <p className="font-body text-body-md text-on-surface-variant">
              No line items on this WRR.
            </p>
          </div>
        ) : (
          <div className="space-y-sm">
            {wrr.items.map((item: WrrItemRow) => (
              <div key={item.id} className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md shadow-sm relative overflow-hidden">
                <div className="flex justify-between items-start mb-sm">
                  <div>
                    <span className="font-label text-label-sm text-on-surface-variant uppercase tracking-wider block mb-xs">
                      Lot Number
                    </span>
                    <span className="font-mono text-title-sm text-on-surface font-semibold">
                      {item.lotNumber}
                    </span>
                  </div>
                  <span
                    className={`inline-flex items-center rounded-sm px-2 py-0.5 font-label text-label-sm uppercase ${DISPOSITION_CLASSES[item.disposition] ?? "bg-surface-container-highest text-on-surface"}`}
                  >
                    {item.disposition === "store" ? "STORE" : "INSPECT"}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-sm mb-md">
                  <div>
                    <span className="font-label text-label-sm text-on-surface-variant block">Item ID</span>
                    <span className="font-mono text-body-md text-on-surface">{item.itemId ?? "—"}</span>
                  </div>
                </div>

                {/* Scan Progress Bar */}
                <div className="mt-sm">
                  <div className="flex justify-between text-label-sm mb-xs">
                    <span className="text-on-surface-variant font-label">Scan Progress</span>
                    <span className="font-mono text-primary font-semibold">{item.scannedQty} / {item.expectedQty}</span>
                  </div>
                  <div className="h-2 w-full bg-surface-container-highest rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${item.scannedQty >= item.expectedQty ? 'bg-primary' : 'bg-tertiary'}`}
                      style={{ width: `${Math.min(100, (item.scannedQty / item.expectedQty) * 100)}%` }}
                    />
                  </div>
                </div>
                
                <div className="mt-md border-t border-outline-variant/50 pt-sm flex justify-end">
                   <WRRUnitLabelGenerator
                      wrrItemId={item.id}
                      wrrNumber={wrr.wrrNumber}
                      itemCode={item.itemCode ?? item.lotNumber}
                      lotNumber={item.lotNumber}
                      expectedQty={item.expectedQty}
                    />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Fixed Bottom Action Dock */}
      <div className="fixed bottom-[80px] left-0 w-full z-40 px-4 md:absolute md:bottom-0 md:px-0">
        <div className="mx-auto flex max-w-md items-center gap-sm rounded-2xl bg-surface-container-lowest/80 p-sm shadow-elevation-3 backdrop-blur-md border border-outline-variant/50">
          {wrr.status === "staged_pending_arrival" && (
            <form action={handleStartReceiving} className="w-full">
              <button
                type="submit"
                className="flex h-12 w-full items-center justify-center gap-sm rounded-xl bg-primary font-label text-label-lg text-on-primary shadow-sm hover:opacity-90 active:scale-[0.98] transition-all focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
              >
                <span className="material-symbols-outlined text-[20px]">play_circle</span>
                Start Receiving
              </button>
            </form>
          )}

          {wrr.status === "receiving_in_progress" && (
            <Link
              href={`/receiving/${wrrId}/receive`}
              className="flex h-12 w-full items-center justify-center gap-sm rounded-xl bg-primary font-label text-label-lg text-on-primary shadow-sm hover:opacity-90 active:scale-[0.98] transition-all focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            >
              <span className="material-symbols-outlined text-[20px]">barcode_scanner</span>
              Scan / Receive Items
            </Link>
          )}

          {wrr.status === "confirmed" && (
            <Link
              href={`/receiving/${wrrId}/print`}
              className="flex h-12 w-full items-center justify-center gap-sm rounded-xl bg-primary font-label text-label-lg text-on-primary shadow-sm hover:opacity-90 active:scale-[0.98] transition-all focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            >
              <span className="material-symbols-outlined text-[20px]">print</span>
              Print Receipt
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
