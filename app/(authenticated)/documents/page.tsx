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
  listPickListArchiveDocuments,
  listAcknowledgementReceiptArchiveDocuments,
  listStatementOfAccountArchiveDocuments,
  listPezaArchiveDocuments,
} from "@/lib/db/queries/documents";

import { DocumentsHeader } from "./_components/DocumentsHeader";
import { DocumentsFilterBar, type FilterPartyOption } from "./_components/DocumentsFilterBar";
import { WrrDocumentsTable } from "./_components/WrrDocumentsTable";
import { PickListsTable } from "./_components/PickListsTable";
import { AcknowledgementReceiptsTable } from "./_components/AcknowledgementReceiptsTable";
import { StatementsOfAccountTable } from "./_components/StatementsOfAccountTable";
import { PezaDocumentsTable } from "./_components/PezaDocumentsTable";

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

  // Active tab resolution
  const validTabs = ["wrr", "pick-lists", "acknowledgement-receipts", "soa", "peza"] as const;
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
  const [partiesResult, wrrRows, pickListRows, arRows, soaRows, pezaRows] = await Promise.all([
    listParties(db, { limit: 100 }),
    activeTab === "wrr" ? listWrrArchiveDocuments(db, filters) : Promise.resolve([]),
    activeTab === "pick-lists" ? listPickListArchiveDocuments(db, filters) : Promise.resolve([]),
    activeTab === "acknowledgement-receipts" ? listAcknowledgementReceiptArchiveDocuments(db, filters) : Promise.resolve([]),
    activeTab === "soa" && canReadFinancial ? listStatementOfAccountArchiveDocuments(db, filters) : Promise.resolve([]),
    activeTab === "peza" ? listPezaArchiveDocuments(db, filters) : Promise.resolve([]),
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
    peza: [
      { label: "Active", value: "active" },
      { label: "Expired", value: "expired" },
    ],
  };

  const tabLabelMap: Record<DocTab, string> = {
    wrr: "WRR",
    "pick-lists": "Pick List",
    "acknowledgement-receipts": "Delivery Receipt",
    soa: "Statement of Account",
    peza: "PEZA & Customs Permit",
  };

  const currentCount =
    activeTab === "wrr"
      ? wrrRows.length
      : activeTab === "pick-lists"
      ? pickListRows.length
      : activeTab === "acknowledgement-receipts"
      ? arRows.length
      : activeTab === "soa"
      ? soaRows.length
      : pezaRows.length;

  return (
    <div className="mx-auto max-w-container">
      {/* Header */}
      <DocumentsHeader
        totalCount={currentCount}
        activeTabLabel={tabLabelMap[activeTab]}
      />

      {/* 5-Tab Navigation Strip */}
      <div
        role="tablist"
        aria-label="Documents Center sections"
        className="mb-6 flex flex-wrap items-center gap-1 border-b border-outline-variant/30"
      >
        <Link
          href="/documents?tab=wrr"
          role="tab"
          aria-selected={activeTab === "wrr"}
          className={`flex h-11 items-center px-4 font-label text-label transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy ${
            activeTab === "wrr"
              ? "border-b-2 border-on-surface text-on-surface font-bold"
              : "text-text-grey hover:text-on-surface"
          }`}
        >
          WRRs (Receiving Reports)
        </Link>
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
          aria-selected={activeTab === "acknowledgement-receipts"}
          className={`flex h-11 items-center px-4 font-label text-label transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy ${
            activeTab === "acknowledgement-receipts"
              ? "border-b-2 border-on-surface text-on-surface font-bold"
              : "text-text-grey hover:text-on-surface"
          }`}
        >
          Delivery Receipts / AR
        </Link>
        <Link
          href="/documents?tab=soa"
          role="tab"
          aria-selected={activeTab === "soa"}
          className={`flex h-11 items-center px-4 font-label text-label transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy ${
            activeTab === "soa"
              ? "border-b-2 border-on-surface text-on-surface font-bold"
              : "text-text-grey hover:text-on-surface"
          }`}
        >
          Statements of Account (SOAs)
        </Link>
        <Link
          href="/documents?tab=peza"
          role="tab"
          aria-selected={activeTab === "peza"}
          className={`flex h-11 items-center px-4 font-label text-label transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy ${
            activeTab === "peza"
              ? "border-b-2 border-on-surface text-on-surface font-bold"
              : "text-text-grey hover:text-on-surface"
          }`}
        >
          PEZA & Logistics Permits
        </Link>
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
        {activeTab === "peza" && <PezaDocumentsTable rows={pezaRows} />}
      </div>
    </div>
  );
}
