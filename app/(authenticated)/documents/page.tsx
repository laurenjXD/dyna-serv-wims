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
    q?: string;
  }>;
}

import {
  FilterablePickListsTable,
  FilterableARTable,
  type MockPickListDoc,
  type MockARDoc,
} from "./_components/DocumentsFilterableTable";

export default async function DocumentsPage({ searchParams }: PageProps) {
  const { tab: tabParam, q: searchQuery } = await searchParams;

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

      {/* Tabs */}
      <div role="tablist" aria-label="Documents sections" className="mt-6 flex gap-1 border-b border-outline-variant/30">
        <Link
          href="/documents?tab=pick-lists"
          role="tab"
          aria-selected={activeTab === "pick-lists"}
          className={`flex h-11 items-center px-4 font-label text-label transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy ${
            activeTab === "pick-lists"
              ? "border-b-2 border-on-surface text-on-surface font-bold"
              : "text-text-grey hover:text-on-surface"
          }`}
        >
          Pick Lists
        </Link>
        <Link
          href="/documents?tab=acknowledgement-receipts"
          role="tab"
          aria-selected={activeTab === "ar"}
          className={`flex h-11 items-center px-4 font-label text-label transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy ${
            activeTab === "ar"
              ? "border-b-2 border-on-surface text-on-surface font-bold"
              : "text-text-grey hover:text-on-surface"
          }`}
        >
          Acknowledgement Receipts
        </Link>
      </div>

      {/* Tab content */}
      <div className="mt-5">
        {activeTab === "pick-lists" ? (
          <FilterablePickListsTable rows={MOCK_PICK_LISTS as MockPickListDoc[]} initialSearch={searchQuery} />
        ) : (
          <FilterableARTable rows={MOCK_ACKNOWLEDGEMENT_RECEIPTS as MockARDoc[]} initialSearch={searchQuery} />
        )}
      </div>
    </div>
  );
}
