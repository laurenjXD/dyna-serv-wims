// `/documents` — Documents Center: Central archive for WRRs, pick lists, DR/AR, SOAs, and PEZA documents.
//
// Traceability:
//   specs/10-pick-list-and-acknowledgement-receipt/requirements.md §3, §4
//   specs/10-pick-list-and-acknowledgement-receipt/design.md §9
//   specs/10-pick-list-and-acknowledgement-receipt/tasks.md Task 7
//   specs/00-steering/brand-design-system.md §6, §2, §9
//
// Surface: Office. Capability gate: documents.read (SOAs additionally require reporting.financial_read).
// Offline: Tier 2 — online only, never cached.

import Link from "next/link";
import { FileText, ShieldAlert } from "lucide-react";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db/client";
import { listParties } from "@/lib/db/queries/parties";
import {
  listWrrArchiveDocuments,
  listCiplArchiveDocuments,
  listPickListArchiveDocuments,
  listAcknowledgementReceiptArchiveDocuments,
  listStatementOfAccountArchiveDocuments,
} from "@/lib/db/queries/documents";

import { DocumentsHeader } from "./_components/DocumentsHeader";
import { DocumentsFilterBar, type FilterPartyOption } from "./_components/DocumentsFilterBar";
import { WrrDocumentsTable } from "./_components/WrrDocumentsTable";
import { CiplDocumentsTable } from "./_components/CiplDocumentsTable";
import { PickListsTable } from "./_components/PickListsTable";
import { AcknowledgementReceiptsTable } from "./_components/AcknowledgementReceiptsTable";
import { StatementsOfAccountTable } from "./_components/StatementsOfAccountTable";

interface PageProps {
  searchParams: Promise<{
    tab?: string;
    q?: string;
    partyId?: string;
    flowType?: string;
    status?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
}

export default async function DocumentsPage({ searchParams }: PageProps) {
  const {
    tab: tabParam,
    q: searchQuery,
    partyId: partyParam,
    flowType: flowParam,
    status: statusParam,
    from: fromParam,
    to: toParam,
  } = await searchParams;

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
        <h2 className="font-heading text-headline-md font-bold text-on-surface">
          Access Restricted
        </h2>
        <p className="mt-1 font-body text-body-md text-text-grey">
          You do not have permission to view the Documents Center.
        </p>
        <p className="mt-2 font-body text-body-sm text-text-grey">
          This page requires the{" "}
          <span className="font-mono text-mono-md font-bold">documents.read</span>{" "}
          capability.
        </p>
      </div>
    );
  }

  // Financial clearance check for the Statements of Account tab
  const financialPerm = await requirePermission(resolver, "reporting.financial_read");
  const canReadFinancial = financialPerm.kind === "authorized";

  // Active tab resolution — Real warehouse document categories:
  // WRR (PDFs) | CI/PL (Uploaded invoices & packing lists) | Pick Lists & DRA/WRF | Delivery Receipts & POD | SOAs
  const validTabs = ["wrr", "cipl", "pick-lists", "acknowledgement-receipts", "soa"] as const;
  type DocTab = typeof validTabs[number];
  const activeTab: DocTab = validTabs.includes(tabParam as DocTab) ? (tabParam as DocTab) : "wrr";

  const filters = {
    search: searchQuery,
    partyId: partyParam,
    flowType: flowParam,
    status: statusParam,
    from: fromParam,
    to: toParam,
    limit: 50,
  };

  // Parallel loading of organization options & active tab data
  const [partiesResult, wrrRows, ciplRows, pickListRows, arRows, soaRows] = await Promise.all([
    listParties(db, { limit: 100 }),
    activeTab === "wrr" ? listWrrArchiveDocuments(db, filters) : Promise.resolve([]),
    activeTab === "cipl" ? listCiplArchiveDocuments(db, filters) : Promise.resolve([]),
    activeTab === "pick-lists" ? listPickListArchiveDocuments(db, filters) : Promise.resolve([]),
    activeTab === "acknowledgement-receipts" ? listAcknowledgementReceiptArchiveDocuments(db, filters) : Promise.resolve([]),
    activeTab === "soa" && canReadFinancial ? listStatementOfAccountArchiveDocuments(db, filters) : Promise.resolve([]),
  ]);

  const organizationOptions: FilterPartyOption[] = partiesResult.rows.map((p) => ({
    id: p.id,
    name: p.name,
    code: p.code,
  }));

  // Status options per tab
  const statusOptionsMap: Record<DocTab, { label: string; value: string }[]> = {
    wrr: [
      { label: "Pending Arrival", value: "staged_pending_arrival" },
      { label: "In Progress", value: "receiving_in_progress" },
      { label: "Completed", value: "completed" },
      { label: "Quarantined", value: "quarantined" },
    ],
    cipl: [
      { label: "Pending Arrival", value: "staged_pending_arrival" },
      { label: "In Progress", value: "receiving_in_progress" },
      { label: "Received & Matched", value: "completed" },
      { label: "Quarantined", value: "quarantined" },
    ],
    "pick-lists": [
      { label: "Ready", value: "ready" },
      { label: "Pending", value: "pending" },
      { label: "Generating", value: "generating" },
      { label: "Failed", value: "failed" },
    ],
    "acknowledgement-receipts": [
      { label: "Ready", value: "ready" },
      { label: "Pending", value: "pending" },
      { label: "Generating", value: "generating" },
      { label: "Failed", value: "failed" },
      { label: "Voided", value: "voided" },
    ],
    soa: [
      { label: "Draft", value: "draft" },
      { label: "Issued", value: "issued" },
      { label: "Voided", value: "voided" },
    ],
  };

  const tabLabelMap: Record<DocTab, string> = {
    wrr: "WRR (Receiving Report)",
    cipl: "Inbound CI/PL & Invoice",
    "pick-lists": "Pick List & DRA/WRF",
    "acknowledgement-receipts": "Delivery Receipt & POD",
    soa: "Statement of Account",
  };

  const currentCount =
    activeTab === "wrr"
      ? wrrRows.length
      : activeTab === "cipl"
      ? ciplRows.length
      : activeTab === "pick-lists"
      ? pickListRows.length
      : activeTab === "acknowledgement-receipts"
      ? arRows.length
      : soaRows.length;

  return (
    <div className="mx-auto max-w-container">
      {/* Header */}
      <DocumentsHeader
        totalCount={currentCount}
        activeTabLabel={tabLabelMap[activeTab]}
      />

      {/* Workflow Grouped Tab Navigation */}
      <div className="mb-6">
        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-3">
          {/* Group 1: Inbound Receiving Workflow */}
          <div
            className={`rounded-2xl border p-3.5 transition-all ${
              activeTab === "wrr" || activeTab === "cipl"
                ? "border-brand-navy/60 bg-brand-navy/[0.02] ring-1 ring-brand-navy/30 shadow-elevation-1"
                : "border-outline-variant/30 bg-surface-white"
            }`}
          >
            <div className="mb-2.5 flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 font-label text-body-xs font-extrabold uppercase tracking-wider text-brand-navy">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-navy/10 text-brand-navy font-bold">1</span>
                Inbound Receiving
              </span>
              <Link
                href="/receiving"
                className="font-label text-body-xs font-semibold text-text-grey transition-colors hover:text-brand-navy hover:underline"
              >
                /receiving ↗
              </Link>
            </div>
            <div className="flex gap-2">
              <Link
                href="/documents?tab=wrr"
                role="tab"
                aria-selected={activeTab === "wrr"}
                className={`flex-1 rounded-xl px-3 py-2 text-center font-label text-label transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy ${
                  activeTab === "wrr"
                    ? "bg-brand-navy text-surface-white font-bold shadow-sm"
                    : "bg-surface-light-grey text-on-surface hover:bg-outline-variant/30 font-medium"
                }`}
              >
                WRRs &amp; Receipts
              </Link>
              <Link
                href="/documents?tab=cipl"
                role="tab"
                aria-selected={activeTab === "cipl"}
                className={`flex-1 rounded-xl px-3 py-2 text-center font-label text-label transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy ${
                  activeTab === "cipl"
                    ? "bg-brand-navy text-surface-white font-bold shadow-sm"
                    : "bg-surface-light-grey text-on-surface hover:bg-outline-variant/30 font-medium"
                }`}
              >
                Inbound CI/PL
              </Link>
            </div>
          </div>

          {/* Group 2: Outbound Dispatch Workflow */}
          <div
            className={`rounded-2xl border p-3.5 transition-all ${
              activeTab === "pick-lists" || activeTab === "acknowledgement-receipts"
                ? "border-brand-navy/60 bg-brand-navy/[0.02] ring-1 ring-brand-navy/30 shadow-elevation-1"
                : "border-outline-variant/30 bg-surface-white"
            }`}
          >
            <div className="mb-2.5 flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 font-label text-body-xs font-extrabold uppercase tracking-wider text-brand-navy">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-navy/10 text-brand-navy font-bold">2</span>
                Outbound Dispatch
              </span>
              <div className="flex items-center gap-2">
                <Link
                  href="/pick-lists"
                  className="font-label text-body-xs font-semibold text-text-grey transition-colors hover:text-brand-navy hover:underline"
                >
                  /pick-lists ↗
                </Link>
                <span className="text-text-grey/40">·</span>
                <Link
                  href="/outgoing"
                  className="font-label text-body-xs font-semibold text-text-grey transition-colors hover:text-brand-navy hover:underline"
                >
                  /outgoing ↗
                </Link>
              </div>
            </div>
            <div className="flex gap-2">
              <Link
                href="/documents?tab=pick-lists"
                role="tab"
                aria-selected={activeTab === "pick-lists"}
                className={`flex-1 rounded-xl px-3 py-2 text-center font-label text-label transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy ${
                  activeTab === "pick-lists"
                    ? "bg-brand-navy text-surface-white font-bold shadow-sm"
                    : "bg-surface-light-grey text-on-surface hover:bg-outline-variant/30 font-medium"
                }`}
              >
                Pick Lists &amp; DRA
              </Link>
              <Link
                href="/documents?tab=acknowledgement-receipts"
                role="tab"
                aria-selected={activeTab === "acknowledgement-receipts"}
                className={`flex-1 rounded-xl px-3 py-2 text-center font-label text-label transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy ${
                  activeTab === "acknowledgement-receipts"
                    ? "bg-brand-navy text-surface-white font-bold shadow-sm"
                    : "bg-surface-light-grey text-on-surface hover:bg-outline-variant/30 font-medium"
                }`}
              >
                Delivery Receipts / POD
              </Link>
            </div>
          </div>

          {/* Group 3: Financial Billing Workflow */}
          <div
            className={`rounded-2xl border p-3.5 transition-all ${
              activeTab === "soa"
                ? "border-brand-navy/60 bg-brand-navy/[0.02] ring-1 ring-brand-navy/30 shadow-elevation-1"
                : "border-outline-variant/30 bg-surface-white"
            }`}
          >
            <div className="mb-2.5 flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 font-label text-body-xs font-extrabold uppercase tracking-wider text-brand-navy">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-navy/10 text-brand-navy font-bold">3</span>
                Financial &amp; Billing
              </span>
              <Link
                href="/billing-pricing/soa"
                className="font-label text-body-xs font-semibold text-text-grey transition-colors hover:text-brand-navy hover:underline"
              >
                /billing-pricing ↗
              </Link>
            </div>
            <div className="flex gap-2">
              <Link
                href="/documents?tab=soa"
                role="tab"
                aria-selected={activeTab === "soa"}
                className={`w-full rounded-xl px-3 py-2 text-center font-label text-label transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy ${
                  activeTab === "soa"
                    ? "bg-brand-navy text-surface-white font-bold shadow-sm"
                    : "bg-surface-light-grey text-on-surface hover:bg-outline-variant/30 font-medium"
                }`}
              >
                Statements of Account (SOA)
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Unified Search & Filters */}
      <DocumentsFilterBar
        organizations={organizationOptions}
        statusOptions={statusOptionsMap[activeTab] ?? []}
        activeTab={activeTab}
      />

      {/* Tab Table Body */}
      <div>
        {activeTab === "wrr" && <WrrDocumentsTable rows={wrrRows} />}
        {activeTab === "cipl" && <CiplDocumentsTable rows={ciplRows} />}
        {activeTab === "pick-lists" && <PickListsTable rows={pickListRows} />}
        {activeTab === "acknowledgement-receipts" && (
          <AcknowledgementReceiptsTable rows={arRows} />
        )}
        {activeTab === "soa" && (
          <StatementsOfAccountTable
            rows={soaRows}
            canReadFinancial={canReadFinancial}
          />
        )}
      </div>
    </div>
  );
}
