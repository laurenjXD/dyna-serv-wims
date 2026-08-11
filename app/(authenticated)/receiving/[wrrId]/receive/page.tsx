// Scan interface — floor-priority receiving reconciliation screen.
//
// Traceability:
//   specs/07-incoming-receiving/design.md §3 (route), §6 (floor scan design),
//     §6.1 (flow-type cross-check), §6.2 (store: scan-first, then suggested
//     location), §6.3 (inspect: location-first, then scan), §9 (per-line
//     immediate commit, Reversed 2026-08-10)
//   specs/07-incoming-receiving/requirements.md R3 (barcode reconciliation),
//     R2.5 (floor flow shows WRR, expected lines, quantities, exceptions)
//   specs/00-steering/brand-design-system.md §3 (floor surface rules — mobile-first
//     base styles, NO glassmorphism, active: press not hover:, one primary action,
//     primary action in bottom third full-width, 64px minimum touch targets),
//     §6 (solid bg-white — no backdrop-blur on floor), §5 (AAA contrast),
//     §2 (no text below 16px on floor), §8 (no backdrop-blur, animation constraints)
//
// Surface: FLOOR. Designed at 375px viewport first. No glassmorphism.
// Permission gate: receiving.scan (scan), receiving.confirm (per-line commit)
//
// Feedback mechanism: after a scan the server action redirects back to this
// page with `result=scanned&remaining=N&disposition=D` on success or
// `result=error&reason=...` on failure. Per-line "Store"/"Hold" commits use
// the same redirect-with-searchParams pattern: `result=committed&line=ID` on
// success, `result=commit_error&line=ID&reason=...` on failure.

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db/client";
import { eq, and } from "drizzle-orm";
import { locations } from "@/lib/db/schema/locations";
import { getWrrDocument } from "@/lib/db/queries/receiving";
import { suggestPutawayLocations } from "@/lib/db/queries/locations";
import type { PutawayCandidate } from "@/lib/db/queries/locations";
import { recordScan, startReceiving, commitWrrLine } from "@/lib/actions/receiving";
import type { WrrItemRow } from "@/lib/db/queries/receiving";
import { ReceivingCameraScanner } from "./_components/ReceivingCameraScanner";
import { CameraScanBridge } from "./_components/CameraScanBridge";

// ─── Error reason → plain language ──────────────────────────────────────────

function getScanErrorMessage(reason: string): string {
  switch (reason) {
    case "forbidden":
      return "You do not have permission to scan items.";
    case "not_found":
      return "WRR document not found.";
    case "invalid_status":
      return "This WRR is not in receiving status. Return to the WRR and start receiving first.";
    case "no_match":
      return "Item not found — barcode does not match any expected line on this WRR.";
    case "over_quantity":
      return "Already fully scanned — this item has already reached its expected quantity.";
    case "duplicate":
      return "Duplicate scan — this barcode has already been counted.";
    case "duplicate_unit_scan":
      return "This exact label has already been scanned — if this carton is genuinely new, check for a duplicate printed label.";
    case "unknown_item":
      return "Unknown item — barcode is not registered in the system. Contact a supervisor to enroll this item.";
    case "flow_type_mismatch":
      return "This item does not belong to this WRR's flow type — contact a supervisor.";
    default:
      return `Scan rejected: ${reason}. Contact a supervisor if this persists.`;
  }
}

function getCommitErrorMessage(reason: string): string {
  switch (reason) {
    case "forbidden":
      return "You do not have permission to confirm receipt for this line.";
    case "not_found":
      return "This line could not be found.";
    default:
      return `Could not complete this line: ${reason}. Contact a supervisor if this persists.`;
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

interface PageProps {
  params: Promise<{ wrrId: string }>;
  searchParams: Promise<{
    result?: string;
    remaining?: string;
    disposition?: string;
    reason?: string;
    line?: string;
  }>;
}

export default async function ReceiveFloorPage({
  params,
  searchParams,
}: PageProps) {
  const { wrrId } = await params;
  const {
    result,
    remaining: remainingParam,
    disposition: dispositionParam,
    reason: reasonParam,
    line: lineParam,
  } = await searchParams;

  const resolver = await createPageResolver();

  // Gate: receiving.scan — floor staff capability.
  const permResult = await requirePermission(resolver, "receiving.scan");
  if (permResult.kind !== "authorized") {
    notFound();
  }

  let wrr = await getWrrDocument(db, wrrId);
  if (!wrr) {
    notFound();
  }

  if (wrr.status === "staged_pending_arrival") {
    await startReceiving(resolver, wrrId);
    const refreshed = await getWrrDocument(db, wrrId);
    if (refreshed) {
      wrr = refreshed;
    }
  }

  const isReceivable = wrr.status === "receiving_in_progress";
  const isComplete = wrr.status === "confirmed";

  // Compute progress counts
  const totalLines = wrr.items.length;
  const fullyScannedLines = wrr.items.filter(
    (item: WrrItemRow) => item.scannedQty >= item.expectedQty
  ).length;
  const allLinesScanned = totalLines > 0 && fullyScannedLines === totalLines;

  // Primary ready line
  const readyLines = wrr.items.filter(
    (item: WrrItemRow) =>
      item.scannedQty >= item.expectedQty && item.committedAt === null
  );
  const primaryReadyLine: WrrItemRow | null = readyLines.length > 0 ? readyLines[0] : null;

  // Next incomplete line
  const incompleteLines = wrr.items.filter(
    (item: WrrItemRow) => item.scannedQty < item.expectedQty
  );
  const nextLine: WrrItemRow | null = incompleteLines.length > 0 ? incompleteLines[0] : null;
  const activeLine = primaryReadyLine || nextLine || wrr.items[0];

  // Candidates for primary ready line
  let primaryStoreCandidates: PutawayCandidate[] = [];
  let inspectionLocations: Array<{ id: string; label: string }> = [];
  if (primaryReadyLine?.disposition === "store") {
    primaryStoreCandidates = await suggestPutawayLocations(db, {
      itemUnitCbm: primaryReadyLine.unitCbm,
      requestedQty: primaryReadyLine.expectedQty,
    });
  } else if (primaryReadyLine?.disposition === "inspect") {
    inspectionLocations = (await db
      .select({ id: locations.id, label: locations.label })
      .from(locations)
      .where(and(eq(locations.locationType, "inspection"), eq(locations.isActive, true)))) as Array<{
      id: string;
      label: string;
    }>;
  }

  async function handleScan(formData: FormData): Promise<void> {
    "use server";
    const barcode = ((formData.get("barcode") as string | null) ?? "").trim();
    if (!barcode) {
      redirect(`/receiving/${wrrId}/receive?result=error&reason=${encodeURIComponent("empty_barcode")}`);
    }
    const actionResolver = await createPageResolver();
    const scanResult = await recordScan(actionResolver, wrrId, barcode);
    if (scanResult.ok) {
      redirect(`/receiving/${wrrId}/receive?result=scanned&remaining=${scanResult.remainingQty}&disposition=${scanResult.disposition}`);
    } else {
      redirect(`/receiving/${wrrId}/receive?result=error&reason=${encodeURIComponent(scanResult.reason)}`);
    }
  }

  async function handleCommitLine(formData: FormData): Promise<void> {
    "use server";
    const wrrItemId = (formData.get("wrrItemId") as string | null) ?? "";
    const locationId = (formData.get("locationId") as string | null) ?? "";
    if (!wrrItemId || !locationId) {
      redirect(`/receiving/${wrrId}/receive?result=commit_error&line=${encodeURIComponent(wrrItemId)}&reason=${encodeURIComponent("missing_location")}`);
    }
    const actionResolver = await createPageResolver();
    const commitResult = await commitWrrLine(actionResolver, wrrId, wrrItemId, { locationId });
    if (commitResult.ok) {
      redirect(`/receiving/${wrrId}/receive?result=committed&line=${encodeURIComponent(wrrItemId)}`);
    } else {
      redirect(`/receiving/${wrrId}/receive?result=commit_error&line=${encodeURIComponent(wrrItemId)}&reason=${encodeURIComponent(commitResult.errors.join("|"))}`);
    }
  }

  const scanSuccess = result === "scanned";
  const scanError = result === "error";
  const commitSuccess = result === "committed";
  const commitError = result === "commit_error";
  const remainingQty = remainingParam ? parseInt(remainingParam, 10) : null;
  const errorReason = reasonParam ?? "";

  if (isComplete) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center text-center animate-in fade-in duration-300">
        <div className="w-full max-w-md rounded-lg bg-surface-container-lowest p-xl shadow-elevation-2 border border-outline-variant">
          <span
            aria-hidden="true"
            className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary-container text-on-primary-container font-heading font-bold text-headline-md"
          >
            &#10003;
          </span>
          <h1 className="mt-md font-heading font-semibold text-headline-md text-on-surface">
            Receipt complete
          </h1>
          <p className="mt-sm font-body text-body-md text-on-surface-variant">
            Every line on {wrr.wrrNumber} has been stored or held. This WRR is now confirmed.
          </p>
          <Link
            href={`/receiving/${wrrId}`}
            className="mt-lg flex h-14 w-full items-center justify-center rounded-full bg-primary font-label text-label-lg text-on-primary hover:bg-primary/90 transition-colors"
          >
            Back to WRR
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col md:max-w-md md:mx-auto w-full relative animate-in fade-in duration-300">
      <style>{`
        .viewfinder-corner {
          width: 32px;
          height: 32px;
          position: absolute;
          border-color: #091426;
          border-width: 4px;
        }
        .scan-line {
          animation: scan 2s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }
        @keyframes scan {
          0% { transform: translateY(-50px); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { transform: translateY(50px); opacity: 0; }
        }
      `}</style>

      {/* Context Header */}
      <div className="flex justify-between items-end pb-sm pt-xs">
        <div>
          <p className="font-label text-label-sm text-on-surface-variant uppercase tracking-wider mb-xs">Receiving Order</p>
          <h2 className="font-heading text-headline-sm text-on-surface tracking-tight">{wrr.wrrNumber}</h2>
        </div>
        <div className="bg-surface-container-highest text-on-surface px-sm py-1 rounded-sm border border-outline-variant flex items-center gap-xs h-8">
          <div className="w-2 h-2 rounded-full bg-primary animate-pulse"></div>
          <span className="font-label text-label-sm">Live</span>
        </div>
      </div>

      {/* Scanner Viewfinder Container */}
      {isReceivable && !primaryReadyLine && !allLinesScanned && (
        <div className="relative w-full aspect-square bg-surface-container-lowest border-2 border-outline rounded-lg overflow-hidden flex items-center justify-center shadow-sm mb-lg">
          <div className="absolute inset-0 bg-cover bg-center opacity-40 blur-[2px]" style={{ backgroundImage: "url('https://lh3.googleusercontent.com/aida-public/AB6AXuCqhJ-_XbV0rAATXI4BE9Y26TYrX8KOSRnkcbTA-aW9oeEC21EUCwKycTQWVEGEv93_42zofrAdP3-MmnMu_vLbAhaqXEivk3M3eAxcKVKBXpQIYA8IWYiSrjvSk3g_emSJS1sLOLjI6JwZLt_QAVrSOUsjOJvmwirPAW7Qv_QmF3rv8uHLW-S8tDxNvnSBFwQZdrTG9ATW8odhQPlvncQLT24LvnT9Gzfw2FNyvXnr4bVpR4d-bJ8')" }}></div>
          <div className="absolute inset-0 bg-primary/10"></div>
          <div className="relative w-2/3 h-2/3 rounded-lg flex items-center justify-center z-10">
            <div className="viewfinder-corner top-0 left-0 border-r-0 border-b-0 rounded-tl-lg"></div>
            <div className="viewfinder-corner top-0 right-0 border-l-0 border-b-0 rounded-tr-lg"></div>
            <div className="viewfinder-corner bottom-0 left-0 border-r-0 border-t-0 rounded-bl-lg"></div>
            <div className="viewfinder-corner bottom-0 right-0 border-l-0 border-t-0 rounded-br-lg"></div>
            <div className="w-[120%] h-0.5 bg-error shadow-[0_0_8px_rgba(186,26,26,0.8)] scan-line absolute"></div>
            
            {/* Integrated Form & Hidden Input for barcode scanning */}
            <form action={handleScan} className="w-full h-full flex flex-col items-center justify-end pb-4">
              <input
                name="barcode"
                type="text"
                autoFocus
                autoComplete="off"
                inputMode="none"
                placeholder="Scan barcode"
                className="opacity-0 absolute inset-0 w-full h-full z-20 cursor-text"
              />
              <p className="font-label text-label-sm text-primary bg-surface-container-lowest/80 px-md py-xs rounded-full border border-outline/30 backdrop-blur-sm shadow-sm pointer-events-none">
                Align Barcode in Frame
              </p>
              <button type="submit" className="hidden">Scan</button>
            </form>
          </div>
          
          <div className="absolute bottom-2 right-2 z-30">
            <CameraScanBridge action={handleScan}>
              <ReceivingCameraScanner onScanSubmitted={undefined as unknown as (barcode: string) => void} />
            </CameraScanBridge>
          </div>
        </div>
      )}

      {/* Feedback Messages */}
      {scanSuccess && (
        <div role="status" aria-live="assertive" className="mb-md rounded-lg bg-primary-container text-on-primary-container px-md py-sm border border-outline-variant shadow-sm flex items-center gap-sm">
          <span className="material-symbols-outlined shrink-0 text-[20px]">check_circle</span>
          <div>
            <p className="font-label text-label-md font-semibold">Scanned</p>
            {remainingQty !== null && <p className="font-body text-body-sm">{remainingQty === 0 ? "Line complete." : `${remainingQty} remaining.`}</p>}
          </div>
        </div>
      )}
      {scanError && (
        <div role="alert" aria-live="assertive" className="mb-md rounded-lg bg-error-container text-on-error-container px-md py-sm border border-error/20 shadow-sm flex items-center gap-sm">
          <span className="material-symbols-outlined shrink-0 text-[20px]">error</span>
          <div>
            <p className="font-label text-label-md font-semibold">Scan Rejected</p>
            <p className="font-body text-body-sm">{getScanErrorMessage(errorReason)}</p>
          </div>
        </div>
      )}
      {commitSuccess && (
        <div role="status" aria-live="assertive" className="mb-md rounded-lg bg-primary-container text-on-primary-container px-md py-sm border border-outline-variant shadow-sm flex items-center gap-sm">
          <span className="material-symbols-outlined shrink-0 text-[20px]">check_circle</span>
          <div>
            <p className="font-label text-label-md font-semibold">Line Committed</p>
            <p className="font-body text-body-sm">Posted to inventory.</p>
          </div>
        </div>
      )}
      {commitError && (
        <div role="alert" aria-live="assertive" className="mb-md rounded-lg bg-error-container text-on-error-container px-md py-sm border border-error/20 shadow-sm flex items-center gap-sm">
          <span className="material-symbols-outlined shrink-0 text-[20px]">error</span>
          <div>
            <p className="font-label text-label-md font-semibold">Could not complete line</p>
            <p className="font-body text-body-sm">{getCommitErrorMessage(errorReason)}</p>
          </div>
        </div>
      )}

      {/* Current Item Card (Level 1 Card) */}
      {activeLine && (
        <div className="bg-surface-container-lowest border border-outline-variant rounded-lg p-md shadow-sm relative overflow-hidden mb-xl">
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-tertiary-container"></div>
          <div className="flex justify-between items-start mb-md">
            <div>
              <span className={`inline-block px-sm py-1 font-label text-label-sm rounded-sm border mb-sm uppercase ${
                activeLine.id === primaryReadyLine?.id 
                  ? "bg-secondary-container text-on-secondary-container border-secondary-container/50" 
                  : "bg-surface-container-low text-on-surface-variant border-outline-variant"
              }`}>
                {activeLine.id === primaryReadyLine?.id ? "Ready to Commit" : "Next Ready"}
              </span>
              <h3 className="font-heading text-title-md text-on-surface font-semibold">{activeLine.itemCode || "Item"}</h3>
              <p className="font-mono text-body-sm text-on-surface-variant mt-xs">LOT: {activeLine.lotNumber}</p>
            </div>
            {/* Disposition Indicator */}
            <span className="font-label text-label-sm uppercase text-on-surface-variant bg-surface-container-high px-2 py-1 rounded-sm border border-outline-variant">
              {activeLine.disposition}
            </span>
          </div>
          
          <div className="grid grid-cols-2 gap-sm border-t border-outline-variant pt-md">
            <div className="flex flex-col">
              <p className="font-label text-label-sm text-on-surface-variant mb-xs">Scanned / Expected</p>
              <div className="flex items-baseline gap-xs">
                <span className="font-heading text-display-sm text-on-surface">{activeLine.scannedQty}</span>
                <span className="font-heading text-title-md text-on-surface-variant">/ {activeLine.expectedQty}</span>
              </div>
              <div className="w-full h-1 bg-surface-container-high mt-sm rounded-full overflow-hidden">
                <div 
                  className="h-full bg-tertiary-container transition-all" 
                  style={{ width: `${Math.min(100, (activeLine.scannedQty / activeLine.expectedQty) * 100)}%` }}
                ></div>
              </div>
            </div>
            <div className="flex flex-col items-end text-right border-l border-outline-variant pl-sm">
              <p className="font-label text-label-sm text-on-surface-variant mb-xs">
                {activeLine.disposition === "store" ? "Suggested Storage" : "Inspection Location"}
              </p>
              
              {primaryReadyLine && primaryReadyLine.id === activeLine.id ? (
                /* Edit Mode (Dropdown for commit) */
                <form id="commitForm" action={handleCommitLine} className="w-full mt-xs">
                  <input type="hidden" name="wrrItemId" value={primaryReadyLine.id} />
                  {primaryReadyLine.disposition === "store" ? (
                    <select
                      name="locationId"
                      defaultValue={primaryStoreCandidates[0]?.id}
                      className="w-full bg-surface-container-high px-2 py-sm rounded-md border border-outline-variant font-mono text-body-sm text-primary focus:outline-none focus:ring-1 focus:ring-primary truncate"
                    >
                      {primaryStoreCandidates.map((loc) => (
                        <option key={loc.id} value={loc.id}>{loc.label}</option>
                      ))}
                    </select>
                  ) : (
                    <select
                      name="locationId"
                      defaultValue={inspectionLocations.length === 1 ? inspectionLocations[0].id : ""}
                      className="w-full bg-surface-container-high px-2 py-sm rounded-md border border-outline-variant font-mono text-body-sm text-primary focus:outline-none focus:ring-1 focus:ring-primary truncate"
                    >
                      {inspectionLocations.map((loc) => (
                        <option key={loc.id} value={loc.id}>{loc.label}</option>
                      ))}
                    </select>
                  )}
                </form>
              ) : (
                /* Read-only Mode */
                <div className="bg-surface-container-high px-md py-sm rounded-md border border-outline-variant mt-xs flex items-center gap-sm">
                  <span className="material-symbols-outlined text-primary text-[20px]">inventory_2</span>
                  <span className="font-mono text-body-sm text-primary font-bold">Pending</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Fixed Action Buttons (Only show when a line is ready to commit) */}
      {isReceivable && primaryReadyLine && (
        <div className="fixed bottom-0 pb-[80px] left-0 w-full px-margin-mobile pt-sm bg-gradient-to-t from-surface via-surface to-transparent z-40 md:max-w-md md:left-1/2 md:-translate-x-1/2">
          <div className="flex gap-md w-full mb-md">
            {primaryReadyLine.disposition === "inspect" ? (
              <button 
                type="submit" 
                form="commitForm" 
                name="action" 
                value="hold"
                className="flex-1 h-14 bg-error-container border border-error/50 rounded-lg font-label text-label-lg text-on-error-container flex items-center justify-center gap-sm active:scale-[0.98] transition-transform shadow-sm"
              >
                <span className="material-symbols-outlined">pan_tool</span>
                Hold Item
              </button>
            ) : (
              <button 
                type="submit" 
                form="commitForm"
                name="action"
                value="store"
                className="flex-1 h-14 bg-primary text-on-primary rounded-lg font-label text-label-lg flex items-center justify-center gap-sm shadow-md active:scale-[0.98] transition-transform"
              >
                <span className="material-symbols-outlined text-[20px]">check_circle</span>
                Store Item
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

