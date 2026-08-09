// Pick Execution — floor-priority scanner pick execution screen.
//
// Traceability:
//   specs/08-outgoing-withdrawal-and-two-stage-commitment/requirements.md
//     R7.1  — The floor workflow SHALL present one current pick/scan task at a
//             time, with item, lot, location, quantity, and safe exception feedback.
//     R7.2  — A scan SHALL verify the expected pick list, item/barcode, lot,
//             location, and quantity before acceptance.
//     §5 acceptance criterion — "After all pick scans are accepted, dispatch is
//             direct and has no pre-dispatch inspection route or state."
//   specs/08-outgoing-withdrawal-and-two-stage-commitment/design.md §3 (route),
//     §7 (Stage 2 physical execution)
//   specs/00-steering/brand-design-system.md §3 (floor surface rules: mobile-first
//     375px base, 64px primary CTAs, active: not hover:, no glassmorphism,
//     solid bg-brand-navy, one primary action per screen), §6 (no glassmorphism
//     on floor — solid surfaces only), §5 (AAA contrast floor rule), §2 (no text
//     below 16px on floor), §8 (no backdrop-blur, no GPU-heavy animations)
//   design-system/dyna-serv-wims/MASTER.md — floor scan input pattern,
//     floor primary CTA pattern, floor status card pattern
//
// Surface: FLOOR. Designed at 375px viewport first. No glassmorphism.
// Permission gate: pick_list.execute
//
// Mock data: line items are hardcoded with // TODO markers.
// Real scan matching is deferred — the scan input collects the barcode
// but full item/lot/location/qty matching against pick_list_items is not
// yet implemented.

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, MapPin, CheckCircle2, Circle, AlertTriangle } from "lucide-react";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db/client";
import { getPickList } from "@/lib/db/queries/withdrawals";

// ─── Mock line data ───────────────────────────────────────────────────────────
// TODO: wire to pick_list_items query (getPickListItems(db, pickListId))
// When live, replace MOCK_PICK_ITEMS with query results and derive
// qtyScanned from scan observations stored server-side or via Tier 1 queue.

type PickItemStatus = "complete" | "partial" | "pending";

interface PickItem {
  id: string;
  itemCode: string;
  itemName: string;
  lotNumber: string;
  location: string;
  qtyNeeded: number;
  qtyScanned: number;
}

const MOCK_PICK_ITEMS: PickItem[] = [
  {
    id: "mock-1",
    itemCode: "WIRE-M-4X6",
    itemName: "Wire Marine 4 AWG x 6 ft",
    lotNumber: "LOT-20260801-001",
    location: "A-14-3",
    qtyNeeded: 4,
    qtyScanned: 4,
  },
  {
    id: "mock-2",
    itemCode: "HYD-COUP-34",
    itemName: 'Hydraulic Coupling 3/4"',
    lotNumber: "LOT-20260731-008",
    location: "B-02-1",
    qtyNeeded: 5,
    qtyScanned: 2,
  },
  {
    id: "mock-3",
    itemCode: "VALVE-GT-1",
    itemName: "Gate Valve 1 Inch",
    lotNumber: "LOT-20260728-012",
    location: "C-07-2",
    qtyNeeded: 3,
    qtyScanned: 0,
  },
  {
    id: "mock-4",
    itemCode: "FTNG-ELB90",
    itemName: "Elbow Fitting 90 Degree",
    lotNumber: "LOT-20260715-003",
    location: "A-09-5",
    qtyNeeded: 2,
    qtyScanned: 0,
  },
];

function getItemStatus(item: PickItem): PickItemStatus {
  if (item.qtyScanned >= item.qtyNeeded) return "complete";
  if (item.qtyScanned > 0) return "partial";
  return "pending";
}

// ─── Page ─────────────────────────────────────────────────────────────────────

interface PageProps {
  params: Promise<{ pickListId: string }>;
  searchParams: Promise<{ result?: string; reason?: string }>;
}

export default async function PickExecutionPage({
  params,
  searchParams,
}: PageProps) {
  const { pickListId } = await params;
  const { result, reason: reasonParam } = await searchParams;

  const resolver = await createPageResolver();

  // Gate: pick_list.execute — floor staff / warehouse operator capability.
  // Floor-style forbidden: dark navy surface, no redirect loop.
  const permResult = await requirePermission(resolver, "pick_list.execute");
  if (permResult.kind !== "authorized") {
    // Surface: floor forbidden — dark navy, clear message, no sidebar.
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-brand-navy px-4">
        <p className="font-heading text-headline-md text-white">Access denied</p>
        <p className="mt-2 font-body text-body-md text-white/70">
          You do not have permission to execute pick lists.
        </p>
        <Link
          href="/outgoing"
          className="mt-6 inline-flex h-14 items-center gap-2 font-body text-body-md text-white/70 focus:outline-none focus:ring-2 focus:ring-white motion-safe:active:scale-[0.97] motion-safe:transition-transform motion-safe:duration-100"
        >
          <ChevronLeft size={24} strokeWidth={2} aria-hidden="true" />
          Return to Outgoing
        </Link>
      </div>
    );
  }

  const pickList = await getPickList(db, pickListId);
  if (!pickList) {
    notFound();
  }

  // Only allow picking when status is allocated.
  const isPickable = pickList.status === "allocated";

  // Derive progress from mock items.
  // TODO: replace with real scan observation counts from pick_list_items query.
  const items = MOCK_PICK_ITEMS;
  const completedLines = items.filter((i) => getItemStatus(i) === "complete").length;
  const totalLines = items.length;
  const allItemsPicked = completedLines === totalLines;

  const scanError = result === "error";
  const errorReason = reasonParam ?? "";

  // Inline server action — placeholder scan handler.
  // TODO: implement real barcode matching against pick_list_items (lot, location,
  // item, qty) and update scan observation state. For now, accepts any scan and
  // redirects back to this page.
  async function handleScan(formData: FormData): Promise<void> {
    "use server";
    const barcode = ((formData.get("barcode") as string | null) ?? "").trim();
    if (!barcode) {
      redirect(
        `/pick-lists/${pickListId}/pick?result=error&reason=${encodeURIComponent("empty_barcode")}`
      );
    }
    // TODO: match barcode against committed pick_list_items — lot, location, item, qty.
    // Reject: wrong item, wrong lot/location, duplicate, over-pick, stale.
    redirect(`/pick-lists/${pickListId}/pick`);
  }

  // Inline server action — marks pick complete and advances to dispatch.
  // TODO: validate all lines are fully confirmed before allowing advance.
  async function handleCompletePick(_formData: FormData): Promise<void> {
    "use server";
    // TODO: call server command to transition pick_list status from allocated → picked.
    redirect(`/pick-lists/${pickListId}/dispatch`);
  }

  return (
    // Floor screen: solid bg-brand-navy, no glassmorphism, 16px padding.
    // brand-design-system.md §4: floor screens use 16px page padding.
    // brand-design-system.md §6: floor — no backdrop-blur, solid surfaces.
    <div className="flex min-h-screen flex-col bg-brand-navy">

      {/* ── Top bar (sticky) ──────────────────────────────────────────────── */}
      {/* brand-design-system.md §3: top bar stays visible during scroll.     */}
      <div className="sticky top-0 z-10 bg-brand-navy px-4 pt-4 pb-2">
        <div className="flex items-center justify-between">
          {/* Back link — h-14 (56px) floor touch target per §3 */}
          <Link
            href="/outgoing"
            className="inline-flex h-14 items-center gap-2 font-body text-body-md text-white focus:outline-none focus:ring-2 focus:ring-white motion-safe:active:scale-[0.97] motion-safe:transition-transform motion-safe:duration-100"
            aria-label="Back to Outgoing"
          >
            <ChevronLeft size={24} strokeWidth={2} aria-hidden="true" />
            <span>Back</span>
          </Link>
          {/* Pick list reference — Roboto Mono per §2 */}
          <span className="font-mono text-mono-lg text-white">
            {pickList.pickListNumber}
          </span>
        </div>
        {/* Item progress — secondary label, text-white/70 ≥5.1:1 against navy */}
        <p className="mt-1 pb-2 font-body text-body-md text-white/70">
          {completedLines} / {totalLines} items scanned
        </p>
        {/* Status warning if pick list is not in pickable state */}
        {!isPickable && (
          <div
            role="alert"
            className="mb-2 flex items-center gap-2 rounded-xl bg-white/10 border border-white/20 px-4 py-3"
          >
            <AlertTriangle
              size={24}
              strokeWidth={2}
              aria-hidden="true"
              className="shrink-0 text-status-pending"
            />
            {/* Icon + color per §1.3 floor color-blind rule */}
            <p className="font-body text-body-md text-white">
              Pick list is not in allocated state — current status:{" "}
              <span className="font-mono text-mono-lg">{pickList.status}</span>
            </p>
          </div>
        )}
      </div>

      {/* ── Items to pick (scrollable middle) ────────────────────────────── */}
      {/* brand-design-system.md §9: floor tables are a fail case — card list */}
      <div className="flex-1 overflow-y-auto px-4 py-2">
        {items.map((item) => {
          const status = getItemStatus(item);
          return (
            <div
              key={item.id}
              // Floor card: solid bg-white/10 over navy, no glassmorphism.
              // Level 2 treatment per §6 floor card rule.
              className="mb-3 rounded-xl bg-white/10 border border-white/20 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  {/* Item code — Roboto Mono, bold, floor minimum 16px (mono-lg is 18px) */}
                  <p className="font-mono text-mono-lg font-bold text-white">
                    {item.itemCode}
                  </p>
                  {/* Item name — Outfit Regular, floor minimum text-body-md (16px) */}
                  <p className="mt-0.5 font-body text-body-md text-white">
                    {item.itemName}
                  </p>
                  {/* Lot number — Roboto Mono, secondary text-white/70 */}
                  <p className="mt-1 font-mono text-mono-lg text-white/70">
                    {item.lotNumber}
                  </p>
                  {/* Location — Outfit + MapPin icon per §1.3 floor icon rule */}
                  <div className="mt-1 flex items-center gap-1.5">
                    <MapPin
                      size={24}
                      strokeWidth={2}
                      aria-hidden="true"
                      className="shrink-0 text-white/70"
                    />
                    <span className="font-body text-body-md text-white/70">
                      {item.location}
                    </span>
                  </div>
                  {/* Qty progress */}
                  <div className="mt-2 flex items-center gap-2">
                    <span className="font-mono text-mono-lg text-white">
                      {item.qtyScanned} / {item.qtyNeeded}
                    </span>
                    {/* Progress bar */}
                    <div
                      className="h-2 flex-1 rounded-full bg-white/20"
                      role="progressbar"
                      aria-valuenow={item.qtyScanned}
                      aria-valuemin={0}
                      aria-valuemax={item.qtyNeeded}
                      aria-label={`${item.itemCode} progress`}
                    >
                      <div
                        className={`h-full rounded-full ${
                          status === "complete"
                            ? "bg-status-available"
                            : status === "partial"
                              ? "bg-status-pending"
                              : "bg-white/30"
                        }`}
                        style={{
                          width: `${Math.min(100, (item.qtyScanned / item.qtyNeeded) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
                {/* Status icon — color + icon per §1.3 floor color-blind rule */}
                <div className="shrink-0 pt-1" aria-hidden="true">
                  {status === "complete" && (
                    <CheckCircle2
                      size={24}
                      strokeWidth={2}
                      className="text-status-available"
                    />
                  )}
                  {status === "partial" && (
                    <AlertTriangle
                      size={24}
                      strokeWidth={2}
                      className="text-status-pending"
                    />
                  )}
                  {status === "pending" && (
                    <Circle
                      size={24}
                      strokeWidth={2}
                      className="text-white/40"
                    />
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Sticky bottom — scan input + CTA ─────────────────────────────── */}
      {/* brand-design-system.md §3: primary action in bottom third, full-width,
          always visible without scrolling. One primary action per floor screen.
          Input priority: scan > tap > type (§3). */}
      {isPickable && (
        <div className="sticky bottom-0 bg-brand-navy px-4 pb-6 pt-4">
          {/* Scan input — auto-focused, inputMode="none" suppresses virtual
              keyboard on scanner devices; scanner fires hardware keystrokes.
              h-14 (56px) floor secondary input touch target per §3. */}
          <form action={handleScan} className="mb-3">
            <input
              autoFocus
              type="text"
              name="barcode"
              inputMode="none"
              autoComplete="off"
              aria-label="Scan item barcode"
              className="w-full h-14 rounded-xl bg-white/10 border border-white/20 px-4 font-mono text-mono-lg text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white"
              placeholder="Scan barcode..."
            />
          </form>

          {/* Scan error feedback — above CTA */}
          {scanError && (
            <div
              role="alert"
              aria-live="assertive"
              className="mb-3 flex items-center gap-2 rounded-xl bg-status-held/20 border border-status-held/40 px-4 py-3"
            >
              <AlertTriangle
                size={24}
                strokeWidth={2}
                aria-hidden="true"
                className="shrink-0 text-status-held"
              />
              <p className="font-body text-body-md text-white">
                {errorReason === "empty_barcode"
                  ? "Barcode cannot be empty — aim scanner at the item label."
                  : `Scan rejected: ${errorReason}. Contact a supervisor if this persists.`}
              </p>
            </div>
          )}

          {/* Complete Pick CTA — disabled until all items scanned.
              brand-design-system.md §3: 64px (h-16) primary action, full-width.
              No hover: on floor — active: press feedback only. */}
          {allItemsPicked ? (
            <form action={handleCompletePick}>
              {/* AAA contrast gap: white on brand-red ≈5.7:1 vs 7:1 — tracked design-system open item */}
              <button
                type="submit"
                className="flex h-16 w-full items-center justify-center rounded-xl bg-brand-red font-label text-body-md uppercase tracking-wide text-white focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-brand-navy motion-safe:active:scale-[0.97] motion-safe:transition-transform motion-safe:duration-100"
              >
                Complete Pick
              </button>
            </form>
          ) : (
            /* Disabled state — not all items scanned yet */
            <button
              type="button"
              disabled
              aria-disabled="true"
              className="flex h-16 w-full cursor-not-allowed items-center justify-center rounded-xl bg-white/20 font-label text-body-md uppercase tracking-wide text-white/50"
            >
              Complete Pick
            </button>
          )}
        </div>
      )}
    </div>
  );
}
