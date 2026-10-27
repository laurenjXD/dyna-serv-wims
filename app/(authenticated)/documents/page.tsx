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
import { FileText, ShieldAlert } from "@/components/ui/icons";
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
  listGeneratedReportArchiveDocuments,
} from "@/lib/db/queries/documents";

import { DocumentsHeader } from "./_components/DocumentsHeader";
import { DocumentsFilterBar, type FilterPartyOption } from "./_components/DocumentsFilterBar";
import { WrrDocumentsTable } from "./_components/WrrDocumentsTable";
import { CiplDocumentsTable } from "./_components/CiplDocumentsTable";
import { PickListsTable } from "./_components/PickListsTable";
import { AcknowledgementReceiptsTable } from "./_components/AcknowledgementReceiptsTable";
import { StatementsOfAccountTable } from "./_components/StatementsOfAccountTable";
import { ReportDocumentsTable } from "./_components/ReportDocumentsTable";

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

  const authorization = await resolver.getContext();
  const authorizationContext = authorization.kind === "authorized" ? authorization.context : null;

  // Financial clearance check for the Statements of Account tab
  const financialPerm = await requirePermission(resolver, "reporting.financial_read");
  const canReadFinancial = financialPerm.kind === "authorized";

  // Active tab resolution — Real warehouse document categories:
  // WRR | CI/PL | Pick Lists | Delivery Receipts | SOAs | Reports & Audits
  const validTabs = ["wrr", "cipl", "pick-lists", "acknowledgement-receipts", "soa", "reports"] as const;
  type DocTab = typeof validTabs[number];
  const activeTab: DocTab = validTabs.includes(tabParam as DocTab) ? (tabParam as DocTab) : "wrr";

  const documentScope = authorizationContext?.grants.find(
    (grant) => grant.resource === "documents" && grant.action === "read",
  );
  const scopedOrganizationIds = documentScope?.scopeKind === "assigned_party"
    ? [...new Set(authorizationContext?.partyScopes.map((scope) => scope.partyId) ?? [])]
    : [];
  const organizationFilterVisible = activeTab !== "reports" && scopedOrganizationIds.length !== 1;
  const organizationFilterLabel = activeTab === "wrr" || activeTab === "cipl"
    ? "Supplier / VMI Customer Organization"
    : activeTab === "pick-lists" || activeTab === "acknowledgement-receipts"
    ? "Trading Customer / End Customer Organization"
    : "Billing Organization";
  const allowedPartyRoles = activeTab === "wrr" || activeTab === "cipl"
    ? new Set(["supplier", "customer"])
    : activeTab === "pick-lists" || activeTab === "acknowledgement-receipts"
    ? new Set(["customer", "end_customer"])
    : new Set(["customer"]);

  const filters = {
    search: searchQuery,
    partyId: organizationFilterVisible
      ? (scopedOrganizationIds.length > 1 && partyParam && scopedOrganizationIds.includes(partyParam)
        ? partyParam
        : scopedOrganizationIds.length > 1
        ? undefined
        : partyParam)
      : scopedOrganizationIds.length === 1
      ? scopedOrganizationIds[0]
      : undefined,
    flowType: flowParam,
    status: statusParam,
    from: fromParam,
    to: toParam,
    limit: 50,
  };

  // Load every permitted archive category so tab badges remain accurate even
  // before the operator opens that tab. The active tab still controls which
  // rows are rendered below.
  const [partiesResult, wrrRows, ciplRows, pickListRows, arRows, soaRows, reportRows] = await Promise.all([
    listParties(db, { limit: 100 }),
    listWrrArchiveDocuments(db, filters),
    listCiplArchiveDocuments(db, filters),
    listPickListArchiveDocuments(db, filters),
    listAcknowledgementReceiptArchiveDocuments(db, filters),
    canReadFinancial ? listStatementOfAccountArchiveDocuments(db, filters) : Promise.resolve([]),
    listGeneratedReportArchiveDocuments(db, filters),
  ]);

  const organizationOptions: FilterPartyOption[] = partiesResult.rows
    .filter((p) => allowedPartyRoles.has(p.roles?.[0] ?? "") || (p.roles ?? []).some((role) => allowedPartyRoles.has(role)))
    .filter((p) => scopedOrganizationIds.length === 0 || scopedOrganizationIds.includes(p.id))
    .map((p) => ({
    id: p.id,
    name: p.name,
    code: p.code,
  }));

  const tabLabelMap: Record<DocTab, string> = {
    wrr: "WRR (Receiving Report)",
    cipl: "Inbound CI/PL & Invoice",
    "pick-lists": "Pick List & DRA/WRF",
    "acknowledgement-receipts": "Delivery Receipt & POD",
    soa: "Statement of Account",
    reports: "Generated Reports & Audit Logs",
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
      : activeTab === "soa"
      ? soaRows.length
      : reportRows.length;

  return (
    <div className="mx-auto max-w-container">
      {/* Header */}
      <DocumentsHeader
        totalCount={currentCount}
        activeTabLabel={tabLabelMap[activeTab]}
      />

      {/* Office Tab Navigation */}
      <div
        role="tablist"
        aria-label="Document archive sections"
        className="mb-6 flex w-full items-center gap-1 overflow-x-auto border-b border-slate-200/80 pb-px scrollbar-none sm:gap-2 lg:gap-1"
      >
        {[
          { key: "wrr", label: "WRRs & Receipts", shortLabel: "WRRs", count: wrrRows.length },
          { key: "cipl", label: "Inbound CI/PL & Invoices", shortLabel: "CI/PL", count: ciplRows.length },
          { key: "pick-lists", label: "Pick Lists & DRA", shortLabel: "Pick Lists", count: pickListRows.length },
          { key: "acknowledgement-receipts", label: "Delivery Receipts (POD / AR)", shortLabel: "Receipts", count: arRows.length },
          { key: "soa", label: "Statements of Account (SOA)", shortLabel: "SOA", count: soaRows.length },
          { key: "reports", label: "Reports & Audit Logs", shortLabel: "Reports", count: reportRows.length },
        ].map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <Link
              key={tab.key}
              href={`/documents?tab=${tab.key}`}
              role="tab"
              aria-selected={isActive}
              className={`flex h-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap border-b-2 px-3 text-center font-body text-xs sm:text-sm font-semibold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy lg:flex-1 ${
                isActive
                  ? "border-brand-navy text-brand-navy font-bold -mb-px"
                  : "border-transparent text-text-grey hover:border-slate-300 hover:text-on-surface -mb-px"
              }`}
            >
              <span>
                <span className="sm:hidden">{tab.shortLabel}</span>
                <span className="hidden sm:inline">{tab.label}</span>
              </span>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-[11px] font-bold ${
                  isActive
                    ? "bg-brand-navy text-white"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {tab.count}
              </span>
            </Link>
          );
        })}
      </div>

      {/* Unified Search & Filters */}
      <DocumentsFilterBar
        organizations={organizationOptions}
        activeTab={activeTab}
        organizationLabel={organizationFilterLabel}
        showOrganizationFilter={organizationFilterVisible}
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
        {activeTab === "reports" && <ReportDocumentsTable rows={reportRows} />}
      </div>
    </div>
  );
}
