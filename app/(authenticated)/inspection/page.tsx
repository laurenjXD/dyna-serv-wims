// Inspection Queue — assigned inspections list page.
//
// Traceability:
//   specs/11-transfer-and-inspection/design.md §3 (route: /inspection),
//     §6.1 (transfer and inbound inspection contexts), §6.2 (context isolation)
//   specs/11-transfer-and-inspection/requirements.md R3, R3a, §3 (actors)
//   specs/00-steering/brand-design-system.md §3 (floor surface rules —
//     mobile-first base styles, 64px CTAs, one primary action per screen,
//     active: not hover:, no dense tables), §6 (floor — solid bg-brand-navy,
//     no glassmorphism; office — bg-surface-white Level 1),
//     §1.3 (status — always icon+color on floor), §2 (no text <16px on floor)
//
// Surface: SHARED — warehouse_staff → floor card list (bg-brand-navy, 64px CTAs);
//   supervisors/admins → office table (glassmorphism, h-11, hover states).
// Permission gate: inspection.perform
//
// Wired to lib/db/queries/transfers.ts's listInspectionCases. inspection_cases
// has no per-user assignment column (see that query's doc comment), so the
// floor surface shows all open cases rather than "assigned to me today" —
// there is no schema-backed way to scope further than status = 'open'.

import Link from "next/link";
import { CheckCircle2, ClipboardList, MapPin, ArrowLeftRight, ArrowDown, Circle, XCircle, MinusCircle, ChevronRight } from "lucide-react";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db/client";
import { listInspectionCases } from "@/lib/db/queries/transfers";
import type { InspectionCaseListRow } from "@/lib/db/queries/transfers";

// ─── Constants ────────────────────────────────────────────────────────────────

// Status badge labels and classes — brand-design-system.md §1.3 semantic mapping:
// open → status-pending (amber); passed → status-available (green);
// failed → status-held (red); cancelled → status-neutral (slate).
const STATUS_LABELS: Record<string, string> = {
  open: "OPEN",
  passed: "PASSED",
  failed: "FAILED",
  cancelled: "CANCELLED",
};

const STATUS_CLASSES: Record<string, string> = {
  open: "bg-status-pending/10 text-status-pending",
  passed: "bg-status-available/10 text-status-available",
  failed: "bg-status-held/10 text-status-held",
  cancelled: "bg-status-neutral/10 text-status-neutral",
};


// ─── Page ─────────────────────────────────────────────────────────────────────

interface PageProps {
  searchParams: Promise<{ status?: string; tab?: string }>;
}

export default async function InspectionQueuePage({ searchParams }: PageProps) {
  const { status: statusFilter } = await searchParams;
  const resolver = await createPageResolver();

  // Gate: inspection.perform required to access inspection queue.
  const permResult = await requirePermission(resolver, "inspection.perform");
  if (permResult.kind !== "authorized") {
    return (
      <div className="mx-auto max-w-container px-4 py-12 text-center">
        <p className="font-body text-body-md text-text-grey">
          You do not have permission to view the inspection queue.
        </p>
        <p className="mt-2 font-body text-body-sm text-text-grey">
          This page requires the{" "}
          <span className="font-mono text-mono-md">inspection.perform</span>{" "}
          capability.
        </p>
      </div>
    );
  }

  // Surface detection — brand-design-system.md §3:
  // warehouse_staff → floor (bg-brand-navy, 64px CTAs, no glassmorphism).
  // supervisors/admins → office (glassmorphism, h-11, hover:).
  const isFloor = permResult.context.activeRoleKeys.includes("warehouse_staff");

  // ── Floor surface ────────────────────────────────────────────────────────────
  if (isFloor) {
    // All open inspection cases (no per-user assignment column exists — see
    // listInspectionCases' doc comment).
    const { rows: openCases } = await listInspectionCases(db, { status: "open" });

    return (
      <div className="flex min-h-screen flex-col bg-surface-white">
        {/* Floor top bar */}
        <div className="pb-4">
          <h1 className="font-heading font-extrabold text-headline-md text-on-surface">
            Daily Inspection
          </h1>
          <p className="mt-1 font-body text-body-md text-text-grey">
            Inspections assigned to you today
          </p>
        </div>

        {/* Open inspection cards — card list, one item per row.
            brand-design-system.md §9: floor tables are a fail case;
            use card-based list, one item per row. */}
        {openCases.length === 0 ? (
          // Empty state — icon + text, per §1.3 (status never color alone)
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            <CheckCircle2
              size={56}
              strokeWidth={1.5}
              className="text-status-available"
              aria-hidden="true"
            />
            <p className="font-heading font-semibold text-headline-md text-on-surface">
              No inspections assigned today
            </p>
            <p className="font-body text-body-md text-text-grey">
              Check back later or contact your supervisor.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {openCases.map((inspection) => (
              <Link
                key={inspection.id}
                href={`/inspection/${inspection.id}`}
                // Floor card — solid bg-white/10, no glassmorphism per §6; entire card is tap target
                className="block min-h-16 rounded-xl border border-outline-variant/30 bg-surface-white p-4 shadow-elevation-2 active:scale-[0.97] motion-safe:transition-transform motion-safe:duration-100 focus:outline-none focus:ring-2 focus:ring-brand-navy focus:ring-offset-2"
              >
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    {/* Item name — Fira Sans, headline-md, text-white; floor min 16px §2 */}
                    <p className="font-heading font-semibold text-headline-md text-on-surface">
                      {inspection.itemName}
                    </p>

                    {/* Lot number — Roboto Mono per §9; text-mono-lg (18px) per floor 16px minimum */}
                    <p className="mt-1 font-mono text-mono-lg text-text-grey">
                      {inspection.lotNumber}
                    </p>

                    {/* Location — MapPin icon paired with text; never text alone */}
                    <div className="mt-2 flex items-center gap-2">
                      <MapPin size={24} strokeWidth={2} aria-hidden="true" className="shrink-0 text-text-grey" />
                      <span className="font-body text-body-md text-text-grey">
                        {inspection.locationLabel ?? "Location unavailable"}
                      </span>
                    </div>

                    {/* Context badge — icon+color per §1.3 floor rule */}
                    <div className="mt-3 flex items-center gap-3">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-3 py-1 font-label text-body-md uppercase ${
                          inspection.contextType === "transfer"
                            ? "bg-accent-indigo-50 text-on-surface"
                            : "bg-status-neutral/10 text-status-neutral"
                        }`}
                      >
                        {/* Icon paired with text — §1.3 */}
                        {inspection.contextType === "transfer"
                          ? <ArrowLeftRight size={20} strokeWidth={2} aria-hidden="true" />
                          : <ArrowDown size={20} strokeWidth={2} aria-hidden="true" />}
                        {inspection.contextType === "transfer"
                          ? "Transfer"
                          : "Inbound"}
                      </span>
                    </div>
                  </div>
                  <ChevronRight size={24} strokeWidth={2} aria-hidden="true" className="shrink-0 self-center text-text-grey" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Office surface ───────────────────────────────────────────────────────────

  // Office view shows all inspection_cases, optionally filtered by status.
  const { rows: filtered } = await listInspectionCases(db, {
    status: statusFilter && statusFilter !== "" ? statusFilter : undefined,
  });

  const STATUS_FILTER_OPTIONS = [
    { value: "", label: "All" },
    { value: "open", label: "Open" },
    { value: "passed", label: "Passed" },
    { value: "failed", label: "Failed" },
    { value: "cancelled", label: "Cancelled" },
  ];

  return (
    <div className="mx-auto max-w-container">
      {/* Page header */}
      <div>
        <h1 className="font-heading font-extrabold text-headline-md text-on-surface">
          Inspection Queue
        </h1>
        <p className="mt-1 font-body text-body-md text-text-grey">
          All inspection cases — inbound and transfer contexts.
        </p>
      </div>

      {/* Status filter */}
      <div className="mt-6">
        <form method="GET" className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="status-filter"
              className="font-label text-label text-text-grey"
            >
              Status
            </label>
            <select
              id="status-filter"
              name="status"
              defaultValue={statusFilter ?? ""}
              className="h-11 rounded border border-outline-variant/30 bg-surface-white px-3 font-body text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-navy"
            >
              {STATUS_FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="flex h-11 items-center justify-center rounded bg-brand-navy px-4 font-label text-label text-surface-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-brand-navy"
          >
            Apply
          </button>
          {statusFilter && (
            <Link
              href="/inspection"
              className="flex h-11 items-center justify-center rounded border border-outline-variant/30 px-4 font-label text-label text-on-surface hover:bg-surface-light-grey focus:outline-none focus:ring-2 focus:ring-brand-navy"
            >
              Clear
            </Link>
          )}
        </form>
      </div>

      {/* Office table — Level 1 elevation per brand-design-system.md §6 */}
      <div className="mt-4 overflow-hidden rounded-md bg-surface-white shadow-elevation-1">
        {filtered.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <ClipboardList
              size={32}
              className="mx-auto text-text-grey"
              aria-hidden="true"
            />
            <p className="mt-3 font-body text-body-md text-text-grey">
              {statusFilter
                ? "No inspection cases match the current filter."
                : "No inspection cases yet."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-outline-variant/30 bg-surface-light-grey">
                  {/* Epilogue SemiBold uppercase headers per §9 */}
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Lot Number
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Item
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Context
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Location
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Opened At
                  </th>
                  <th className="sr-only px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/30">
                {filtered.map((row: InspectionCaseListRow) => (
                  <tr key={row.id} className="hover:bg-surface-light-grey/50">
                    {/* Lot number — Roboto Mono per §9 */}
                    <td className="px-4 py-3 font-mono text-mono-md text-on-surface">
                      {row.lotNumber}
                    </td>
                    <td className="px-4 py-3 font-body text-body-md text-on-surface">
                      {row.itemName}
                    </td>
                    <td className="px-4 py-3 font-body text-body-md text-on-surface capitalize">
                      {row.contextType}
                    </td>
                    <td className="px-4 py-3 font-mono text-mono-md text-on-surface">
                      {row.locationLabel ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      {/* Status badge — §1.3 semantic colors; icon+color per office badge pattern */}
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-label text-label uppercase ${STATUS_CLASSES[row.status] ?? "bg-status-neutral/10 text-status-neutral"}`}
                      >
                        {row.status === "open" ? <Circle size={16} className="text-status-pending" aria-hidden="true" /> :
                         row.status === "passed" ? <CheckCircle2 size={16} className="text-status-available" aria-hidden="true" /> :
                         row.status === "failed" ? <XCircle size={16} className="text-status-held" aria-hidden="true" /> :
                         <MinusCircle size={16} className="text-text-grey" aria-hidden="true" />}
                        {STATUS_LABELS[row.status] ?? row.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-body text-body-md text-text-grey">
                      {row.openedAt.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {/* Inspect link — h-11 (44px) office touch target */}
                      <Link
                        href={`/inspection/${row.id}`}
                        className="inline-flex h-11 items-center font-label text-label text-brand-navy underline hover:text-brand-royal-blue focus:outline-none focus:ring-2 focus:ring-brand-navy"
                      >
                        {row.status === "open" ? "Inspect" : "View"}
                      </Link>
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
