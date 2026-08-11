// `/documents` — Documents Center: generated pick lists + acknowledgement receipts.
//
// Traceability:
//   specs/10-pick-list-and-acknowledgement-receipt/design.md (document generation,
//     pick_list + acknowledgement_receipt tables, print view)
//   specs/00-steering/brand-design-system.md §6 (office Level 1 elevation:
//     bg-white), §2 (typography), §9 (office table pattern)
//
// Surface: Office. Capability gate: documents.read.
// Offline: document listing is Tier 2 — online only, never cached.
// TODO: wire to pick_lists + acknowledgement_receipts query

import Link from "next/link";
import { FileText, Printer, Package, CheckCircle2 } from "lucide-react";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";

// ─── Types ────────────────────────────────────────────────────────────────────

type FlowType = "VMI" | "Trading" | "Supplies";
type PickListStatus = "committed" | "dispatched" | "cancelled";
type ARStatus = "pending_signature" | "signed" | "disputed";

// ─── Status helpers — tokens from tailwind.config.ts, no raw hex ──────────────
// brand-design-system.md §1.3:
//   committed / pending_signature → status-warning (amber)
//   dispatched / signed           → status-success (green)
//   cancelled / disputed          → status-error (red)

const PICK_STATUS_CLASSES: Record<PickListStatus, string> = {
  committed: "bg-status-warning/10 text-status-warning",
  dispatched: "bg-status-success/10 text-status-success",
  cancelled: "bg-status-error/10 text-status-error",
};

const PICK_STATUS_LABELS: Record<PickListStatus, string> = {
  committed: "COMMITTED",
  dispatched: "DISPATCHED",
  cancelled: "CANCELLED",
};

const AR_STATUS_CLASSES: Record<ARStatus, string> = {
  pending_signature: "bg-status-warning/10 text-status-warning",
  signed: "bg-status-success/10 text-status-success",
  disputed: "bg-status-error/10 text-status-error",
};

const AR_STATUS_LABELS: Record<ARStatus, string> = {
  pending_signature: "PENDING SIGNATURE",
  signed: "SIGNED",
  disputed: "DISPUTED",
};

const FLOW_CLASSES: Record<FlowType, string> = {
  VMI: "bg-secondary/10 text-secondary",
  Trading: "bg-primary/10 text-primary",
  Supplies: "bg-status-neutral/10 text-status-neutral",
};

// ─── Mock data ────────────────────────────────────────────────────────────────
// TODO: wire to pick_lists + acknowledgement_receipts query

const MOCK_PICK_LISTS = [
  {
    id: "pl-001",
    number: "PL-2026-001",
    party: "Acme Logistics Co.",
    itemsCount: 4,
    flow: "VMI" as FlowType,
    status: "dispatched" as PickListStatus,
    createdAt: "2026-08-07",
  },
  {
    id: "pl-002",
    number: "PL-2026-002",
    party: "Nexus Distribution Ltd.",
    itemsCount: 7,
    flow: "Trading" as FlowType,
    status: "committed" as PickListStatus,
    createdAt: "2026-08-08",
  },
  {
    id: "pl-003",
    number: "PL-2026-003",
    party: "Dyna-Serv Internal",
    itemsCount: 2,
    flow: "Supplies" as FlowType,
    status: "cancelled" as PickListStatus,
    createdAt: "2026-08-09",
  },
];

const MOCK_ACKNOWLEDGEMENT_RECEIPTS = [
  {
    id: "ar-001",
    number: "AR-2026-001",
    party: "Acme Logistics Co.",
    pickListNumber: "PL-2026-001",
    itemsCount: 4,
    status: "signed" as ARStatus,
    date: "2026-08-07",
  },
  {
    id: "ar-002",
    number: "AR-2026-002",
    party: "Nexus Distribution Ltd.",
    pickListNumber: "PL-2026-002",
    itemsCount: 7,
    status: "pending_signature" as ARStatus,
    date: "2026-08-08",
  },
  {
    id: "ar-003",
    number: "AR-2026-003",
    party: "Global Parts Inc.",
    pickListNumber: "PL-2025-044",
    itemsCount: 3,
    status: "disputed" as ARStatus,
    date: "2026-08-05",
  },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

interface PageProps {
  searchParams: Promise<{
    tab?: string;
    type?: string;
    status?: string;
    party?: string;
    from?: string;
    to?: string;
  }>;
}

export default async function DocumentsPage({ searchParams }: PageProps) {
  const { tab: tabParam } = await searchParams;

  const resolver = await createPageResolver();
  const permResult = await requirePermission(resolver, "documents.read");

  if (permResult.kind !== "authorized") {
    return (
      <div className="mx-auto max-w-container px-8 py-12 text-center">
        <FileText
          size={40}
          className="mx-auto mb-3 text-on-surface-variant"
          aria-hidden="true"
        />
        <p className="font-body text-body-md text-on-surface-variant">
          You do not have permission to view documents.
        </p>
        <p className="mt-2 font-body text-body-sm text-on-surface-variant">
          This page requires the{" "}
          <span className="font-mono text-mono-md">documents.read</span>{" "}
          capability.
        </p>
      </div>
    );
  }

  const activeTab = tabParam === "acknowledgement-receipts" ? "ar" : "pick-lists";

  return (
    <div className="mx-auto max-w-container">
      {/* Page header — text-headline-xl Fira Sans Bold per brand-design-system.md §2 */}
      <div>
        <h1 className="font-heading font-extrabold text-headline-xl text-on-surface">
          Documents
        </h1>
        <p className="mt-1 font-body text-body-md text-on-surface-variant">
          Generated pick lists and acknowledgement receipts.
        </p>
      </div>

      {/* Filter bar */}
      <div className="mt-6">
        <form method="GET" className="flex flex-wrap items-end gap-3">
          {/* Type filter */}
          <div className="flex flex-col gap-1">
            <label
              htmlFor="type-filter"
              className="font-label text-label text-on-surface-variant"
            >
              Flow type
            </label>
            <select
              id="type-filter"
              name="type"
              className="h-11 rounded border border-outline-variant/30 bg-white px-3 font-body text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="all">All types</option>
              <option value="VMI">VMI</option>
              <option value="Trading">Trading</option>
              <option value="Supplies">Supplies</option>
            </select>
          </div>

          {/* Status filter */}
          <div className="flex flex-col gap-1">
            <label
              htmlFor="status-filter"
              className="font-label text-label text-on-surface-variant"
            >
              Status
            </label>
            <select
              id="status-filter"
              name="status"
              className="h-11 rounded border border-outline-variant/30 bg-white px-3 font-body text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="all">All statuses</option>
              <option value="committed">Committed</option>
              <option value="dispatched">Dispatched</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          {/* Date range — from */}
          <div className="flex flex-col gap-1">
            <label
              htmlFor="from-date"
              className="font-label text-label text-on-surface-variant"
            >
              From
            </label>
            <input
              type="date"
              id="from-date"
              name="from"
              className="h-11 rounded border border-outline-variant/30 bg-white px-3 font-body text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Date range — to */}
          <div className="flex flex-col gap-1">
            <label
              htmlFor="to-date"
              className="font-label text-label text-on-surface-variant"
            >
              To
            </label>
            <input
              type="date"
              id="to-date"
              name="to"
              className="h-11 rounded border border-outline-variant/30 bg-white px-3 font-body text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Party filter */}
          <div className="flex flex-col gap-1">
            <label
              htmlFor="party-filter"
              className="font-label text-label text-on-surface-variant"
            >
              Party
            </label>
            <input
              type="text"
              id="party-filter"
              name="party"
              placeholder="Search party…"
              className="h-11 rounded border border-outline-variant/30 bg-white px-3 font-body text-body-md text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <button
            type="submit"
            className="flex h-11 items-center justify-center rounded bg-primary px-4 font-label text-label text-white motion-safe:transition-opacity motion-safe:duration-150 hover:opacity-90 motion-safe:active:scale-[0.97] motion-safe:transition-transform motion-safe:duration-100 focus:outline-none focus:ring-2 focus:ring-primary"
          >
            Apply
          </button>
        </form>
      </div>

      {/* Tabs */}
      <div className="mt-6 flex gap-1 border-b border-outline-variant/30">
        <Link
          href="/documents?tab=pick-lists"
          className={`flex h-11 items-center px-4 font-label text-label transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-primary ${
            activeTab === "pick-lists"
              ? "border-b-2 border-primary text-primary"
              : "text-on-surface-variant hover:text-on-surface"
          }`}
          aria-current={activeTab === "pick-lists" ? "page" : undefined}
        >
          Pick Lists
        </Link>
        <Link
          href="/documents?tab=acknowledgement-receipts"
          className={`flex h-11 items-center px-4 font-label text-label transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-primary ${
            activeTab === "ar"
              ? "border-b-2 border-primary text-primary"
              : "text-on-surface-variant hover:text-on-surface"
          }`}
          aria-current={activeTab === "ar" ? "page" : undefined}
        >
          Acknowledgement Receipts
        </Link>
      </div>

      {/* Tab content */}
      <div className="mt-4">
        {activeTab === "pick-lists" ? (
          <PickListsTab />
        ) : (
          <AcknowledgementReceiptsTab />
        )}
      </div>
    </div>
  );
}

// ─── Pick Lists tab ───────────────────────────────────────────────────────────

function PickListsTab() {
  if (MOCK_PICK_LISTS.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-outline-variant/30 bg-white px-6 py-12 text-center">
        <Package size={40} className="text-on-surface-variant" aria-hidden="true" />
        <p className="font-body text-body-md text-on-surface-variant">No pick lists yet.</p>
        <p className="font-body text-body-sm text-on-surface-variant">
          Pick lists appear here once outgoing withdrawals are committed.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-outline-variant/30 bg-white shadow-elevation-1">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-outline-variant/30 bg-surface-dim">
              {/* Epilogue SemiBold uppercase headers per brand-design-system.md §9 */}
              <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-on-surface-variant">
                Pick List #
              </th>
              <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-on-surface-variant">
                Party
              </th>
              <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-on-surface-variant">
                Items
              </th>
              <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-on-surface-variant">
                Flow
              </th>
              <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-on-surface-variant">
                Status
              </th>
              <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-on-surface-variant">
                Created
              </th>
              <th className="sr-only px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/30">
            {MOCK_PICK_LISTS.map((pl) => (
              <tr key={pl.id} className="hover:bg-surface-dim/50">
                {/* Pick list number — Roboto Mono for codes */}
                <td className="px-4 py-3 font-mono text-mono-md text-on-surface">
                  {pl.number}
                </td>

                {/* Party name — body text */}
                <td className="px-4 py-3 font-body text-body-md text-on-surface">
                  {pl.party}
                </td>

                {/* Items count — Roboto Mono for numeric columns */}
                <td className="px-4 py-3 font-mono text-mono-md text-on-surface">
                  {pl.itemsCount}
                </td>

                {/* Flow badge — brand tokens, never raw hex */}
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 font-label text-label uppercase tracking-[0.05em] ${FLOW_CLASSES[pl.flow]}`}
                  >
                    {pl.flow}
                  </span>
                </td>

                {/* Status badge — §1.3 semantic colors */}
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 font-label text-label uppercase tracking-[0.05em] ${PICK_STATUS_CLASSES[pl.status]}`}
                  >
                    {PICK_STATUS_LABELS[pl.status]}
                  </span>
                </td>

                {/* Date */}
                <td className="px-4 py-3 font-body text-body-md text-on-surface-variant">
                  {pl.createdAt}
                </td>

                {/* Actions — h-11 (44px) office touch targets */}
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    {/* Print icon button — h-9 w-9 per spec */}
                    <button
                      type="button"
                      aria-label={`Print pick list ${pl.number}`}
                      className="flex h-11 w-11 items-center justify-center rounded border border-outline-variant/30 text-on-surface-variant motion-safe:transition-colors motion-safe:duration-150 hover:border-primary hover:text-primary motion-safe:active:scale-[0.97] motion-safe:transition-transform motion-safe:duration-100 focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      <Printer size={16} aria-hidden="true" />
                    </button>

                    <Link
                      href={`/documents/pick-lists/${pl.id}`}
                      className="inline-flex h-11 items-center rounded bg-primary px-4 font-label text-label text-white motion-safe:transition-opacity motion-safe:duration-150 hover:opacity-90 motion-safe:active:scale-[0.97] motion-safe:transition-transform motion-safe:duration-100 focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      View
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Acknowledgement Receipts tab ─────────────────────────────────────────────

function AcknowledgementReceiptsTab() {
  if (MOCK_ACKNOWLEDGEMENT_RECEIPTS.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-outline-variant/30 bg-white px-6 py-12 text-center">
        <CheckCircle2 size={40} className="text-on-surface-variant" aria-hidden="true" />
        <p className="font-body text-body-md text-on-surface-variant">
          No acknowledgement receipts yet.
        </p>
        <p className="font-body text-body-sm text-on-surface-variant">
          Receipts appear here once pick lists are dispatched and signed by the party.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-outline-variant/30 bg-white shadow-elevation-1">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-outline-variant/30 bg-surface-dim">
              <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-on-surface-variant">
                AR #
              </th>
              <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-on-surface-variant">
                Party
              </th>
              <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-on-surface-variant">
                Pick List #
              </th>
              <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-on-surface-variant">
                Items
              </th>
              <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-on-surface-variant">
                Status
              </th>
              <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-on-surface-variant">
                Date
              </th>
              <th className="sr-only px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/30">
            {MOCK_ACKNOWLEDGEMENT_RECEIPTS.map((ar) => (
              <tr key={ar.id} className="hover:bg-surface-dim/50">
                {/* AR number — Roboto Mono for codes */}
                <td className="px-4 py-3 font-mono text-mono-md text-on-surface">
                  {ar.number}
                </td>

                {/* Party name */}
                <td className="px-4 py-3 font-body text-body-md text-on-surface">
                  {ar.party}
                </td>

                {/* Pick list reference — Roboto Mono */}
                <td className="px-4 py-3 font-mono text-mono-md text-on-surface">
                  {ar.pickListNumber}
                </td>

                {/* Items count */}
                <td className="px-4 py-3 font-mono text-mono-md text-on-surface">
                  {ar.itemsCount}
                </td>

                {/* Status badge */}
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 font-label text-label uppercase tracking-[0.05em] ${AR_STATUS_CLASSES[ar.status]}`}
                  >
                    {AR_STATUS_LABELS[ar.status]}
                  </span>
                </td>

                {/* Date */}
                <td className="px-4 py-3 font-body text-body-md text-on-surface-variant">
                  {ar.date}
                </td>

                {/* View action */}
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/documents/acknowledgement-receipts/${ar.id}`}
                    className="inline-flex h-11 items-center rounded bg-primary px-4 font-label text-label text-white motion-safe:transition-opacity motion-safe:duration-150 hover:opacity-90 motion-safe:active:scale-[0.97] motion-safe:transition-transform motion-safe:duration-100 focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
