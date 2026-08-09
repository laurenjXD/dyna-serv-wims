// `/documents` — Documents Center: generated pick lists + acknowledgement receipts.
//
// Traceability:
//   specs/10-pick-list-and-acknowledgement-receipt/design.md (document generation,
//     pick_list + acknowledgement_receipt tables, print view)
//   specs/00-steering/brand-design-system.md §6 (office Level 1 elevation:
//     bg-surface-white), §2 (typography), §9 (office table pattern)
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
//   committed / pending_signature → status-pending (amber)
//   dispatched / signed           → status-available (green)
//   cancelled / disputed          → status-held (red)

const PICK_STATUS_CLASSES: Record<PickListStatus, string> = {
  committed: "bg-status-pending/10 text-status-pending",
  dispatched: "bg-status-available/10 text-status-available",
  cancelled: "bg-status-held/10 text-status-held",
};

const PICK_STATUS_LABELS: Record<PickListStatus, string> = {
  committed: "COMMITTED",
  dispatched: "DISPATCHED",
  cancelled: "CANCELLED",
};

const AR_STATUS_CLASSES: Record<ARStatus, string> = {
  pending_signature: "bg-status-pending/10 text-status-pending",
  signed: "bg-status-available/10 text-status-available",
  disputed: "bg-status-held/10 text-status-held",
};

const AR_STATUS_LABELS: Record<ARStatus, string> = {
  pending_signature: "PENDING SIGNATURE",
  signed: "SIGNED",
  disputed: "DISPUTED",
};

const FLOW_CLASSES: Record<FlowType, string> = {
  VMI: "bg-brand-royal-blue/10 text-brand-royal-blue",
  Trading: "bg-brand-navy/10 text-brand-navy",
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
          className="mx-auto mb-3 text-text-grey"
          aria-hidden="true"
        />
        <p className="font-body text-body-md text-text-grey">
          You do not have permission to view documents.
        </p>
        <p className="mt-2 font-body text-body-sm text-text-grey">
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
        <p className="mt-1 font-body text-body-md text-text-grey">
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
              className="font-label text-label text-text-grey"
            >
              Flow type
            </label>
            <select
              id="type-filter"
              name="type"
              className="h-11 rounded border border-outline-variant/30 bg-surface-white px-3 font-body text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-navy"
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
              className="font-label text-label text-text-grey"
            >
              Status
            </label>
            <select
              id="status-filter"
              name="status"
              className="h-11 rounded border border-outline-variant/30 bg-surface-white px-3 font-body text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-navy"
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
              className="font-label text-label text-text-grey"
            >
              From
            </label>
            <input
              type="date"
              id="from-date"
              name="from"
              className="h-11 rounded border border-outline-variant/30 bg-surface-white px-3 font-body text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-navy"
            />
          </div>

          {/* Date range — to */}
          <div className="flex flex-col gap-1">
            <label
              htmlFor="to-date"
              className="font-label text-label text-text-grey"
            >
              To
            </label>
            <input
              type="date"
              id="to-date"
              name="to"
              className="h-11 rounded border border-outline-variant/30 bg-surface-white px-3 font-body text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-navy"
            />
          </div>

          {/* Party filter */}
          <div className="flex flex-col gap-1">
            <label
              htmlFor="party-filter"
              className="font-label text-label text-text-grey"
            >
              Party
            </label>
            <input
              type="text"
              id="party-filter"
              name="party"
              placeholder="Search party…"
              className="h-11 rounded border border-outline-variant/30 bg-surface-white px-3 font-body text-body-md text-on-surface placeholder:text-text-grey focus:outline-none focus:ring-2 focus:ring-brand-navy"
            />
          </div>

          <button
            type="submit"
            className="flex h-11 items-center justify-center rounded bg-brand-navy px-4 font-label text-label text-surface-white motion-safe:transition-opacity motion-safe:duration-150 hover:opacity-90 motion-safe:active:scale-[0.97] motion-safe:transition-transform motion-safe:duration-100 focus:outline-none focus:ring-2 focus:ring-brand-navy"
          >
            Apply
          </button>
        </form>
      </div>

      {/* Tabs */}
      <div className="mt-6 flex gap-1 border-b border-outline-variant/30">
        <Link
          href="/documents?tab=pick-lists"
          className={`flex h-11 items-center px-4 font-label text-label transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-brand-navy ${
            activeTab === "pick-lists"
              ? "border-b-2 border-brand-navy text-brand-navy"
              : "text-text-grey hover:text-on-surface"
          }`}
          aria-current={activeTab === "pick-lists" ? "page" : undefined}
        >
          Pick Lists
        </Link>
        <Link
          href="/documents?tab=acknowledgement-receipts"
          className={`flex h-11 items-center px-4 font-label text-label transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-brand-navy ${
            activeTab === "ar"
              ? "border-b-2 border-brand-navy text-brand-navy"
              : "text-text-grey hover:text-on-surface"
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
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-outline-variant/30 bg-surface-white px-6 py-12 text-center">
        <Package size={40} className="text-text-grey" aria-hidden="true" />
        <p className="font-body text-body-md text-text-grey">No pick lists yet.</p>
        <p className="font-body text-body-sm text-text-grey">
          Pick lists appear here once outgoing withdrawals are committed.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-outline-variant/30 bg-surface-white shadow-elevation-1">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-outline-variant/30 bg-surface-light-grey">
              {/* Epilogue SemiBold uppercase headers per brand-design-system.md §9 */}
              <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                Pick List #
              </th>
              <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                Party
              </th>
              <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                Items
              </th>
              <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                Flow
              </th>
              <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                Status
              </th>
              <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                Created
              </th>
              <th className="sr-only px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/30">
            {MOCK_PICK_LISTS.map((pl) => (
              <tr key={pl.id} className="hover:bg-surface-light-grey/50">
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
                <td className="px-4 py-3 font-body text-body-md text-text-grey">
                  {pl.createdAt}
                </td>

                {/* Actions — h-11 (44px) office touch targets */}
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    {/* Print icon button — h-9 w-9 per spec */}
                    <button
                      type="button"
                      aria-label={`Print pick list ${pl.number}`}
                      className="flex h-11 w-11 items-center justify-center rounded border border-outline-variant/30 text-text-grey motion-safe:transition-colors motion-safe:duration-150 hover:border-brand-navy hover:text-brand-navy motion-safe:active:scale-[0.97] motion-safe:transition-transform motion-safe:duration-100 focus:outline-none focus:ring-2 focus:ring-brand-navy"
                    >
                      <Printer size={16} aria-hidden="true" />
                    </button>

                    <Link
                      href={`/documents/pick-lists/${pl.id}`}
                      className="inline-flex h-11 items-center rounded bg-brand-navy px-4 font-label text-label text-surface-white motion-safe:transition-opacity motion-safe:duration-150 hover:opacity-90 motion-safe:active:scale-[0.97] motion-safe:transition-transform motion-safe:duration-100 focus:outline-none focus:ring-2 focus:ring-brand-navy"
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
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-outline-variant/30 bg-surface-white px-6 py-12 text-center">
        <CheckCircle2 size={40} className="text-text-grey" aria-hidden="true" />
        <p className="font-body text-body-md text-text-grey">
          No acknowledgement receipts yet.
        </p>
        <p className="font-body text-body-sm text-text-grey">
          Receipts appear here once pick lists are dispatched and signed by the party.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-outline-variant/30 bg-surface-white shadow-elevation-1">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-outline-variant/30 bg-surface-light-grey">
              <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                AR #
              </th>
              <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                Party
              </th>
              <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                Pick List #
              </th>
              <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                Items
              </th>
              <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                Status
              </th>
              <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                Date
              </th>
              <th className="sr-only px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/30">
            {MOCK_ACKNOWLEDGEMENT_RECEIPTS.map((ar) => (
              <tr key={ar.id} className="hover:bg-surface-light-grey/50">
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
                <td className="px-4 py-3 font-body text-body-md text-text-grey">
                  {ar.date}
                </td>

                {/* View action */}
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/documents/acknowledgement-receipts/${ar.id}`}
                    className="inline-flex h-11 items-center rounded bg-brand-navy px-4 font-label text-label text-surface-white motion-safe:transition-opacity motion-safe:duration-150 hover:opacity-90 motion-safe:active:scale-[0.97] motion-safe:transition-transform motion-safe:duration-100 focus:outline-none focus:ring-2 focus:ring-brand-navy"
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
