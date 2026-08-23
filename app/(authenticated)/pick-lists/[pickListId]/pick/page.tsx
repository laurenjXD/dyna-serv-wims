import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AlertTriangle, Boxes, CheckCircle2, ChevronLeft, MapPin, ScanLine } from "lucide-react";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db/client";
import { getPickList, getPickListItems, getPickUnitSelections } from "@/lib/db/queries/withdrawals";
import { completeExactPick, selectPickUnit } from "@/lib/actions/withdrawals";
import { CameraScanBridge } from "@/components/floor/CameraScanBridge";

interface PageProps {
  params: Promise<{ pickListId: string }>;
  searchParams: Promise<{ result?: string; reason?: string }>;
}

const PICK_ERRORS: Record<string, string> = {
  invalid_box_qr: "That is not a valid box QR or box ID.",
  box_not_found: "This box is not registered in inventory. Receive or relabel it first.",
  wrong_lot: "This box belongs to a different lot. Check the pick instruction.",
  wrong_box_location: "This box is registered at another location. Scan a box from the location shown.",
  duplicate_box_scan: "This exact box is already selected for this line.",
  box_unavailable: "This box is unavailable or already selected for another pick.",
  line_complete: "This location already has all required boxes selected.",
  box_scans_incomplete: "Scan every required box before confirming the pick.",
  invalid_status: "This pick list is no longer available for picking.",
  unable_to_select_box: "The box could not be selected. Please try again.",
  unable_to_complete_pick: "The pick could not be completed. Please try again.",
};

export default async function PickExecutionPage({ params, searchParams }: PageProps) {
  const { pickListId } = await params;
  const { result, reason } = await searchParams;
  const resolver = await createPageResolver();
  const permission = await requirePermission(resolver, "pick_list.execute");

  if (permission.kind !== "authorized") {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
        <p className="font-heading text-headline-md text-on-surface">Access denied</p>
        <p className="mt-2 font-body text-body-md text-text-grey">You do not have permission to execute pick lists.</p>
        <Link href="/outgoing" className="mt-6 inline-flex h-14 items-center gap-2 text-on-surface">
          <ChevronLeft size={24} aria-hidden="true" /> Return to Outgoing
        </Link>
      </div>
    );
  }

  const pickList = await getPickList(db, pickListId);
  if (!pickList) notFound();

  const [lines, selections] = await Promise.all([
    getPickListItems(db, pickListId),
    getPickUnitSelections(db, pickListId),
  ]);
  const selectionsByLine = new Map<string, typeof selections>();
  for (const selection of selections) {
    if (!selection.pickListItemId) continue;
    const existing = selectionsByLine.get(selection.pickListItemId) ?? [];
    existing.push(selection);
    selectionsByLine.set(selection.pickListItemId, existing);
  }

  const isPickable = pickList.status === "allocated";
  const activeLine = isPickable
    ? lines.find((line) => (selectionsByLine.get(line.id)?.length ?? 0) < line.numberOfBoxes)
    : undefined;
  const completedLines = lines.filter(
    (line) => (selectionsByLine.get(line.id)?.length ?? 0) === line.numberOfBoxes,
  ).length;
  const allComplete = lines.length > 0 && completedLines === lines.length;

  async function handleBoxScan(formData: FormData): Promise<void> {
    "use server";
    const actionResolver = await createPageResolver();
    const lineId = String(formData.get("pickListItemId") ?? "");
    const barcode = String(formData.get("barcode") ?? "");
    const scanResult = await selectPickUnit(actionResolver, pickListId, lineId, barcode);
    if (!scanResult.ok) {
      redirect(`/pick-lists/${pickListId}/pick?result=error&reason=${encodeURIComponent(scanResult.errors[0] ?? "unable_to_select_box")}`);
    }
    redirect(`/pick-lists/${pickListId}/pick?result=scanned`);
  }

  async function handleCompletePick(): Promise<void> {
    "use server";
    const actionResolver = await createPageResolver();
    const completeResult = await completeExactPick(actionResolver, pickListId);
    if (!completeResult.ok) {
      redirect(`/pick-lists/${pickListId}/pick?result=error&reason=${encodeURIComponent(completeResult.errors[0] ?? "unable_to_complete_pick")}`);
    }
    redirect(`/pick-lists/${pickListId}/dispatch`);
  }

  return (
    <div className="mx-auto w-full max-w-5xl pb-28">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-4 border-b border-outline-variant/40 pb-5">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/outgoing" aria-label="Back to Outgoing" className="grid size-12 shrink-0 place-items-center rounded-xl border border-outline-variant/50 bg-surface-white text-on-surface shadow-elevation-1 transition-colors hover:bg-surface-light-grey focus:outline-none focus:ring-2 focus:ring-brand-navy">
            <ChevronLeft size={24} aria-hidden="true" />
          </Link>
          <div className="min-w-0">
            <p className="font-mono text-body-md text-text-grey">{pickList.pickListNumber}</p>
            <h1 className="font-heading text-headline-md font-bold text-on-surface">Pick exact boxes</h1>
          </div>
        </div>
        <div className="rounded-xl border border-outline-variant/50 bg-surface-white px-4 py-3 shadow-elevation-1">
          <p className="font-label text-body-md text-on-surface">{completedLines} / {lines.length} locations complete</p>
        </div>
      </header>

      <div className="mb-5 rounded-2xl border border-brand-blue/25 bg-brand-blue/5 p-4">
        <div className="flex gap-3">
          <Boxes className="mt-0.5 shrink-0 text-brand-navy" size={24} aria-hidden="true" />
          <div>
            <p className="font-heading text-title-md font-bold text-on-surface">Pick by box and location</p>
            <p className="mt-1 font-body text-body-md text-text-grey">
              Go to the location shown, then scan the QR on the exact box you are taking. If one pallet is split across locations, each location appears as its own instruction and is deducted separately at dispatch.
            </p>
          </div>
        </div>
      </div>

      {result === "error" && (
        <div role="alert" className="mb-4 flex gap-3 rounded-xl border border-status-held/35 bg-status-held/10 p-4">
          <AlertTriangle className="shrink-0 text-status-held" size={24} aria-hidden="true" />
          <p className="font-body text-body-md text-on-surface">{PICK_ERRORS[reason ?? ""] ?? "The scan could not be accepted."}</p>
        </div>
      )}

      <div className="space-y-4">
        {lines.map((line, index) => {
          const selected = selectionsByLine.get(line.id) ?? [];
          const complete = selected.length === line.numberOfBoxes;
          const current = activeLine?.id === line.id;
          return (
            <section key={line.id} className={`overflow-hidden rounded-2xl border bg-surface-white shadow-elevation-2 ${current ? "border-brand-navy" : "border-outline-variant/45"}`}>
              <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="grid size-8 place-items-center rounded-lg bg-brand-navy font-label text-body-md text-surface-white">{index + 1}</span>
                    <p className="font-mono text-mono-lg font-bold text-on-surface">{line.itemCode}</p>
                    {complete && <CheckCircle2 className="text-status-available" size={24} aria-label="Complete" />}
                  </div>
                  <p className="mt-2 font-body text-body-md text-text-grey">{line.itemDescription ?? line.itemCode}</p>
                  <p className="mt-1 font-mono text-body-md text-text-grey">Lot {line.lotNumber}</p>
                </div>
                <div className="rounded-xl bg-brand-navy px-4 py-3 text-surface-white shadow-elevation-1 sm:min-w-52">
                  <p className="flex items-center gap-2 font-label text-body-md uppercase tracking-wide"><MapPin size={20} aria-hidden="true" /> Pick from</p>
                  <p className="mt-1 font-mono text-title-lg font-bold">{line.locationLabel}</p>
                </div>
              </div>

              <div className="border-t border-outline-variant/40 bg-surface-light-grey/40 px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-label text-body-md text-on-surface">Boxes selected: {selected.length} of {line.numberOfBoxes}</p>
                  <p className="font-body text-body-md text-text-grey">Inventory quantity: {line.qty}</p>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-outline-variant/40">
                  <div className={`h-full rounded-full ${complete ? "bg-status-available" : "bg-brand-blue"}`} style={{ width: `${Math.min(100, (selected.length / Math.max(1, line.numberOfBoxes)) * 100)}%` }} />
                </div>
                {selected.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selected.map((box) => (
                      <span key={box.unitId} className="rounded-lg border border-status-available/30 bg-status-available/10 px-3 py-1.5 font-mono text-body-md text-on-surface">
                        Box {box.unitIndex} · {box.unitId.slice(0, 8)}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {current && (
                <div className="border-t border-brand-navy/20 p-5">
                  <div className="mb-3 flex items-center gap-2">
                    <ScanLine size={24} className="text-brand-navy" aria-hidden="true" />
                    <p className="font-heading text-title-md font-bold text-on-surface">Scan a box at {line.locationLabel}</p>
                  </div>
                  <form action={handleBoxScan} className="flex flex-col gap-3 sm:flex-row">
                    <input type="hidden" name="pickListItemId" value={line.id} />
                    <input name="barcode" required autoFocus autoComplete="off" placeholder="Scan QR or enter box ID" className="h-14 min-w-0 flex-1 rounded-xl border border-outline-variant bg-surface-white px-4 font-mono text-body-md text-on-surface outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20" />
                    <button type="submit" className="h-14 rounded-xl bg-brand-navy px-6 font-label text-body-md text-surface-white shadow-elevation-1 transition-colors hover:bg-brand-navy/90">Add Box</button>
                  </form>
                  <div className="mt-3"><CameraScanBridge action={handleBoxScan} extraFields={{ pickListItemId: line.id }} /></div>
                </div>
              )}
            </section>
          );
        })}
      </div>

      {pickList.status === "picked" ? (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-outline-variant/50 bg-surface-white p-4 shadow-elevation-2 lg:left-[288px] lg:right-6">
          <Link href={`/pick-lists/${pickListId}/dispatch`} className="mx-auto flex h-16 max-w-5xl items-center justify-center rounded-xl bg-primary font-label text-body-md uppercase tracking-wide text-surface-white">Continue to Dispatch</Link>
        </div>
      ) : isPickable ? (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-outline-variant/50 bg-surface-white p-4 shadow-elevation-2 lg:left-[288px] lg:right-6">
          <form action={handleCompletePick} className="mx-auto max-w-5xl">
            <button type="submit" disabled={!allComplete} className="flex h-16 w-full items-center justify-center rounded-xl bg-primary font-label text-body-md uppercase tracking-wide text-surface-white disabled:cursor-not-allowed disabled:bg-surface-light-grey disabled:text-status-neutral">
              {allComplete ? "Confirm Exact Pick" : `Scan ${lines.reduce((sum, line) => sum + line.numberOfBoxes, 0) - selections.length} More Boxes`}
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
